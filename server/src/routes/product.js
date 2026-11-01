import { Router } from 'express';
import { z } from 'zod';
import { Feature, Funnel, Environment } from '../models/index.js';
import { ah, notFound, badRequest } from '../lib/errors.js';
import { parse, eventName } from '../lib/validate.js';
import { loadProject, withEnv } from '../middleware/rbac.js';
import { resolveRange } from '../lib/dates.js';
import { cached } from '../lib/cache.js';
import { audit } from '../lib/audit.js';
import { featureSummary, featureDetail, evaluateFlag, invalidateFlags } from '../services/features.js';
import { computeFunnel } from '../services/funnels.js';
import { parseFilters } from '../services/analytics.js';

const r = Router();
const rangeKey = (range) => ({ from: range.from.toISOString(), to: range.to.toISOString() });

// ── Features ───────────────────────────────────────────────────────────────
const rule = z.object({ property: z.string().regex(/^[A-Za-z0-9_\-]{1,64}$/), operator: z.enum(['eq', 'neq', 'in', 'contains', 'gt', 'lt']), value: z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(200)).max(100)]) });
const rollout = z.object({ environment: z.string(), enabled: z.boolean(), percentage: z.number().min(0).max(100).default(100), rules: z.array(rule).max(20).default([]) });
const featureSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9_\-]{1,63}$/, 'Key must be lowercase letters, numbers, "_" or "-" (2–64 chars)'),
  name: z.string().trim().min(2).max(100),
  description: z.string().max(2000).optional(),
  status: z.enum(['planned', 'beta', 'live', 'deprecated']).optional(),
  owner: z.string().max(100).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  exposureEvents: z.array(eventName).max(20).optional(),
  adoptionEvents: z.array(eventName).max(20).optional(),
  conversionEvent: eventName.optional().or(z.literal('')),
  rollouts: z.array(rollout).max(3).optional(),
});

async function validateRollouts(project, rollouts) {
  if (!rollouts) return undefined;
  const envs = await Environment.find({ project: project._id }).lean();
  for (const ro of rollouts) if (!envs.some((e) => String(e._id) === ro.environment)) throw badRequest('Rollout environment does not belong to this project');
  return rollouts;
}

const serializeFeature = (f) => {
  const o = f.toObject ? f.toObject() : f;
  return { ...o, id: String(o._id), _id: undefined, rollouts: (o.rollouts || []).map((x) => ({ ...x, environment: String(x.environment) })) };
};

r.get('/:projectId/features', loadProject(), withEnv(), ah(async (req, res) => {
  const range = resolveRange(req.query);
  const features = await Feature.find({ project: req.project._id }).sort({ createdAt: -1 }).lean();
  const stats = await cached(req.env._id, 'featurelist', { ...rangeKey(range), ids: features.map((f) => String(f._id) + f.updatedAt) }, 60, async () =>
    Object.fromEntries(await Promise.all(features.map(async (f) => { const { _exposed, _adopted, ...s } = await featureSummary(req.env._id, range, f); return [String(f._id), s]; }))),
  );
  res.json({ items: features.map((f) => ({ ...serializeFeature(f), metrics: stats[String(f._id)] })) });
}));

r.post('/:projectId/features', loadProject('developer', { allowArchived: false }), ah(async (req, res) => {
  const body = parse(featureSchema, req.body);
  body.rollouts = await validateRollouts(req.project, body.rollouts);
  if (await Feature.exists({ project: req.project._id, key: body.key })) throw badRequest(`A feature with key "${body.key}" already exists`);
  const f = await Feature.create({ ...body, org: req.project.org, project: req.project._id, createdBy: req.user._id });
  await invalidateFlags(req.project._id);
  await audit(req, { action: 'feature.created', target: { type: 'feature', id: String(f._id), name: f.name } });
  res.status(201).json(serializeFeature(f));
}));

r.get('/:projectId/features/:featureId', loadProject(), withEnv(), ah(async (req, res) => {
  const f = await Feature.findOne({ _id: req.params.featureId, project: req.project._id }).lean();
  if (!f) throw notFound('Feature');
  const range = resolveRange(req.query);
  const metrics = await cached(req.env._id, 'feature', { id: String(f._id), u: f.updatedAt, ...rangeKey(range) }, 60, () => featureDetail(req.env._id, range, f));
  res.json({ ...serializeFeature(f), metrics });
}));

r.patch('/:projectId/features/:featureId', loadProject('developer', { allowArchived: false }), ah(async (req, res) => {
  const body = parse(featureSchema.omit({ key: true }).partial(), req.body);
  if (body.rollouts) body.rollouts = await validateRollouts(req.project, body.rollouts);
  const f = await Feature.findOne({ _id: req.params.featureId, project: req.project._id });
  if (!f) throw notFound('Feature');
  const before = { status: f.status, rollouts: f.rollouts?.map((x) => ({ environment: String(x.environment), enabled: x.enabled, percentage: x.percentage })) };
  Object.assign(f, body);
  await f.save();
  await invalidateFlags(req.project._id);
  await audit(req, { action: body.rollouts ? 'feature.rollout_updated' : 'feature.updated', target: { type: 'feature', id: String(f._id), name: f.name }, metadata: { before, changes: body } });
  res.json(serializeFeature(f));
}));

r.delete('/:projectId/features/:featureId', loadProject('developer'), ah(async (req, res) => {
  const f = await Feature.findOneAndDelete({ _id: req.params.featureId, project: req.project._id });
  if (!f) throw notFound('Feature');
  await invalidateFlags(req.project._id);
  await audit(req, { action: 'feature.deleted', target: { type: 'feature', id: String(f._id), name: f.name } });
  res.json({ ok: true });
}));

// Dashboard-side flag preview: evaluates a feature for a hypothetical user.
r.post('/:projectId/features/:featureId/evaluate', loadProject(), withEnv(), ah(async (req, res) => {
  const body = parse(z.object({ distinctId: z.string().min(1).max(200), properties: z.record(z.any()).default({}) }).passthrough(), req.body);
  const f = await Feature.findOne({ _id: req.params.featureId, project: req.project._id }).lean();
  if (!f) throw notFound('Feature');
  res.json({ key: f.key, ...evaluateFlag(f, req.env._id, body) });
}));

// ── Funnels ────────────────────────────────────────────────────────────────
const stepFilter = z.object({ property: z.string().regex(/^[A-Za-z0-9_\-]{1,64}$/), operator: z.enum(['eq', 'neq', 'contains', 'gt', 'lt']).default('eq'), value: z.union([z.string().max(200), z.number(), z.boolean()]) });
const funnelSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(500).optional(),
  steps: z.array(z.object({ event: eventName, label: z.string().max(100).optional(), filters: z.array(stepFilter).max(5).default([]) })).min(2).max(10),
  windowHours: z.number().int().min(1).max(24 * 90).default(168),
});

r.get('/:projectId/funnels', loadProject(), ah(async (req, res) => {
  const items = await Funnel.find({ project: req.project._id }).sort({ createdAt: -1 }).lean();
  res.json({ items: items.map((f) => ({ ...f, id: String(f._id) })) });
}));

r.post('/:projectId/funnels', loadProject('developer', { allowArchived: false }), ah(async (req, res) => {
  const body = parse(funnelSchema, req.body);
  const f = await Funnel.create({ ...body, org: req.project.org, project: req.project._id, createdBy: req.user._id });
  await audit(req, { action: 'funnel.created', target: { type: 'funnel', id: String(f._id), name: f.name } });
  res.status(201).json(f);
}));

// Ad-hoc funnel computation (used by the builder preview before saving).
r.post('/:projectId/funnels/compute', loadProject(), withEnv(), ah(async (req, res) => {
  const body = parse(funnelSchema.pick({ steps: true, windowHours: true }), req.body);
  const range = resolveRange({ from: req.body.from, to: req.body.to, range: req.body.range });
  const filters = parseFilters(req.body.filters);
  res.json(await cached(req.env._id, 'funnel', { ...body, filters, ...rangeKey(range) }, 60, () => computeFunnel(req.env._id, range, { ...body, filters })));
}));

r.get('/:projectId/funnels/:funnelId', loadProject(), withEnv(), ah(async (req, res) => {
  const f = await Funnel.findOne({ _id: req.params.funnelId, project: req.project._id }).lean();
  if (!f) throw notFound('Funnel');
  const range = resolveRange(req.query);
  const filters = parseFilters(req.query.filters);
  const result = await cached(req.env._id, 'funnel', { steps: f.steps, windowHours: f.windowHours, filters, ...rangeKey(range) }, 60, () => computeFunnel(req.env._id, range, { steps: f.steps, windowHours: f.windowHours, filters }));
  res.json({ ...f, id: String(f._id), result });
}));

r.patch('/:projectId/funnels/:funnelId', loadProject('developer', { allowArchived: false }), ah(async (req, res) => {
  const body = parse(funnelSchema.partial(), req.body);
  const f = await Funnel.findOneAndUpdate({ _id: req.params.funnelId, project: req.project._id }, body, { new: true });
  if (!f) throw notFound('Funnel');
  await audit(req, { action: 'funnel.updated', target: { type: 'funnel', id: String(f._id), name: f.name } });
  res.json(f);
}));

r.delete('/:projectId/funnels/:funnelId', loadProject('developer'), ah(async (req, res) => {
  const f = await Funnel.findOneAndDelete({ _id: req.params.funnelId, project: req.project._id });
  if (!f) throw notFound('Funnel');
  await audit(req, { action: 'funnel.deleted', target: { type: 'funnel', id: String(f._id), name: f.name } });
  res.json({ ok: true });
}));

export default r;
