import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Webhook, WebhookDelivery, Environment } from '../models/index.js';
import { ah, notFound, badRequest } from '../lib/errors.js';
import { parse, pagination, eventName } from '../lib/validate.js';
import { loadProject } from '../middleware/rbac.js';
import { audit } from '../lib/audit.js';
import { encrypt, randomToken } from '../lib/crypto.js';
import { assertSafeUrl } from '../services/webhooks.js';
import { getQueue, QUEUES } from '../lib/queue.js';
import { deliveryJob } from '../services/processor.js';

const r = Router();

const schema = z.object({
  url: z.string().trim().url().max(2000),
  description: z.string().max(300).optional(),
  events: z.array(z.union([z.literal('*'), eventName])).min(1).max(50).default(['*']),
  envId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

const serialize = (h) => ({
  id: String(h._id),
  url: h.url,
  description: h.description || '',
  events: h.events,
  environment: h.environment ? String(h.environment) : null,
  enabled: h.enabled,
  secretHint: h.secretLast4 ? `whsec_••••${h.secretLast4}` : null,
  lastDeliveryAt: h.lastDeliveryAt || null,
  lastDeliveryStatus: h.lastDeliveryStatus || null,
  createdAt: h.createdAt,
});

async function checkEnv(project, envId) {
  if (!envId) return null;
  if (!mongoose.isValidObjectId(envId) || !(await Environment.exists({ _id: envId, project: project._id }))) throw badRequest('Environment does not belong to this project');
  return envId;
}

const newSecret = () => `whsec_${randomToken(24)}`;

r.get('/:projectId/webhooks', loadProject('developer'), ah(async (req, res) => {
  const hooks = await Webhook.find({ project: req.project._id }).sort({ createdAt: -1 }).lean();
  const stats = await WebhookDelivery.aggregate([{ $match: { webhook: { $in: hooks.map((h) => h._id) }, createdAt: { $gte: new Date(Date.now() - 7 * 86400_000) } } }, { $group: { _id: { w: '$webhook', s: '$status' }, c: { $sum: 1 } } }]);
  res.json({
    items: hooks.map((h) => {
      const s = Object.fromEntries(stats.filter((x) => String(x._id.w) === String(h._id)).map((x) => [x._id.s, x.c]));
      return { ...serialize(h), stats7d: { succeeded: s.succeeded || 0, failed: s.failed || 0, retrying: s.retrying || 0, pending: s.pending || 0 } };
    }),
  });
}));

r.post('/:projectId/webhooks', loadProject('developer', { allowArchived: false }), ah(async (req, res) => {
  const body = parse(schema, req.body);
  await assertSafeUrl(body.url);
  const secret = newSecret();
  const hook = await Webhook.create({
    org: req.project.org,
    project: req.project._id,
    environment: await checkEnv(req.project, body.envId),
    url: body.url,
    description: body.description,
    events: body.events,
    enabled: body.enabled ?? true,
    secretEncrypted: encrypt(secret),
    secretLast4: secret.slice(-4),
    createdBy: req.user._id,
  });
  await audit(req, { action: 'webhook.created', target: { type: 'webhook', id: String(hook._id), name: hook.url }, metadata: { events: hook.events } });
  res.status(201).json({ ...serialize(hook), secret });
}));

r.get('/:projectId/webhooks/:hookId', loadProject('developer'), ah(async (req, res) => {
  const hook = await Webhook.findOne({ _id: req.params.hookId, project: req.project._id }).lean();
  if (!hook) throw notFound('Webhook');
  res.json(serialize(hook));
}));

r.patch('/:projectId/webhooks/:hookId', loadProject('developer'), ah(async (req, res) => {
  const body = parse(schema.partial(), req.body);
  const hook = await Webhook.findOne({ _id: req.params.hookId, project: req.project._id });
  if (!hook) throw notFound('Webhook');
  if (body.url) {
    await assertSafeUrl(body.url);
    hook.url = body.url;
  }
  if (body.description !== undefined) hook.description = body.description;
  if (body.events) hook.events = body.events;
  if (body.envId !== undefined) hook.environment = await checkEnv(req.project, body.envId);
  if (body.enabled !== undefined) hook.enabled = body.enabled;
  await hook.save();
  const action = body.enabled !== undefined && Object.keys(body).length === 1 ? (body.enabled ? 'webhook.enabled' : 'webhook.disabled') : 'webhook.updated';
  await audit(req, { action, target: { type: 'webhook', id: String(hook._id), name: hook.url }, metadata: body });
  res.json(serialize(hook));
}));

r.post('/:projectId/webhooks/:hookId/rotate-secret', loadProject('developer'), ah(async (req, res) => {
  const hook = await Webhook.findOne({ _id: req.params.hookId, project: req.project._id });
  if (!hook) throw notFound('Webhook');
  const secret = newSecret();
  hook.secretEncrypted = encrypt(secret);
  hook.secretLast4 = secret.slice(-4);
  await hook.save();
  await audit(req, { action: 'webhook.secret_rotated', target: { type: 'webhook', id: String(hook._id), name: hook.url } });
  res.json({ ...serialize(hook), secret });
}));

r.delete('/:projectId/webhooks/:hookId', loadProject('developer'), ah(async (req, res) => {
  const hook = await Webhook.findOneAndDelete({ _id: req.params.hookId, project: req.project._id });
  if (!hook) throw notFound('Webhook');
  await WebhookDelivery.deleteMany({ webhook: hook._id });
  await audit(req, { action: 'webhook.deleted', target: { type: 'webhook', id: String(hook._id), name: hook.url } });
  res.json({ ok: true });
}));

// Sends a synthetic "webhook.test" delivery through the normal pipeline.
r.post('/:projectId/webhooks/:hookId/test', loadProject('developer'), ah(async (req, res) => {
  const hook = await Webhook.findOne({ _id: req.params.hookId, project: req.project._id });
  if (!hook) throw notFound('Webhook');
  const d = await WebhookDelivery.create({
    webhook: hook._id,
    project: hook.project,
    eventType: 'webhook.test',
    eventName: 'webhook.test',
    payload: { type: 'webhook.test', createdAt: new Date().toISOString(), data: { message: 'This is a test delivery from FeatureTrack', projectId: String(hook.project) } },
  });
  const job = deliveryJob(d._id);
  await getQueue(QUEUES.webhooks).add(job.name, job.data, job.opts);
  res.status(202).json({ deliveryId: String(d._id) });
}));

r.get('/:projectId/webhooks/:hookId/deliveries', loadProject('developer'), ah(async (req, res) => {
  const q = parse(pagination.extend({ status: z.enum(['pending', 'retrying', 'succeeded', 'failed']).optional() }), req.query);
  const hook = await Webhook.findOne({ _id: req.params.hookId, project: req.project._id }).lean();
  if (!hook) throw notFound('Webhook');
  const filter = { webhook: hook._id, ...(q.status ? { status: q.status } : {}) };
  const [items, total] = await Promise.all([WebhookDelivery.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), WebhookDelivery.countDocuments(filter)]);
  res.json({ items: items.map((d) => ({ ...d, id: String(d._id) })), total, page: q.page, limit: q.limit });
}));

r.post('/:projectId/webhooks/:hookId/deliveries/:deliveryId/retry', loadProject('developer'), ah(async (req, res) => {
  const d = await WebhookDelivery.findOne({ _id: req.params.deliveryId, webhook: req.params.hookId, project: req.project._id });
  if (!d) throw notFound('Delivery');
  if (d.status === 'pending' || d.status === 'retrying') throw badRequest('Delivery is already scheduled');
  d.status = 'pending';
  d.completedAt = undefined;
  await d.save();
  const job = deliveryJob(d._id);
  await getQueue(QUEUES.webhooks).add('retry', job.data, job.opts);
  await audit(req, { action: 'webhook.delivery_retried', target: { type: 'webhook_delivery', id: String(d._id), name: d.eventName } });
  res.status(202).json({ ok: true });
}));

export default r;
