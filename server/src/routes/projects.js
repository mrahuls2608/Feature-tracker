import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Project, Environment, ApiKey, Membership, User, AuditLog, Event, Profile, EventDefinition, Feature, Funnel, Webhook, WebhookDelivery, ApiUsage, ENV_TYPES } from '../models/index.js';
import { ah, notFound, badRequest, forbidden } from '../lib/errors.js';
import { parse, objectId, pagination } from '../lib/validate.js';
import { loadProject, requireProjectRole, atLeast, projectRole } from '../middleware/rbac.js';
import { audit } from '../lib/audit.js';
import { generateApiKey, invalidateApiKeyCache, invalidateProjectKeyCache } from '../services/ingest.js';
import { notifyOrgAdmins } from '../lib/notify.js';

const r = Router();

const ENV_META = {
  development: { name: 'Development', color: '#0ea5e9' },
  staging: { name: 'Staging', color: '#f59e0b' },
  production: { name: 'Production', color: '#10b981' },
};

export async function createProjectWithEnvironments(org, user, { name, description = '', access = 'organization' }) {
  const project = await Project.create({ org: org._id, name, description, access, createdBy: user._id });
  const environments = await Environment.insertMany(ENV_TYPES.map((type) => ({ org: org._id, project: project._id, type, ...ENV_META[type] })));
  return { project, environments };
}

export function serializeEnv(e) {
  return { id: String(e._id), type: e.type, name: e.name, color: e.color, settings: e.settings, createdAt: e.createdAt };
}

export function serializeProject(p, envs = [], orgRole, userId) {
  return {
    id: String(p._id),
    orgId: String(p.org),
    name: p.name,
    description: p.description,
    access: p.access,
    archived: !!p.archivedAt,
    archivedAt: p.archivedAt || null,
    settings: p.settings,
    members: (p.members || []).map((m) => ({ user: String(m.user), role: m.role })),
    role: orgRole ? projectRole(p, orgRole, userId) : undefined,
    environments: envs.sort((a, b) => ENV_TYPES.indexOf(a.type) - ENV_TYPES.indexOf(b.type)).map(serializeEnv),
    createdAt: p.createdAt,
  };
}

r.get('/:projectId', loadProject(), ah(async (req, res) => {
  const envs = await Environment.find({ project: req.project._id }).lean();
  res.json(serializeProject(req.project.toObject(), envs, req.orgRole, req.user._id));
}));

const projectUpdate = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  access: z.enum(['organization', 'restricted']).optional(),
  settings: z.object({ strictEvents: z.boolean(), timezone: z.string().max(64) }).partial().optional(),
});
r.patch('/:projectId', loadProject('admin'), ah(async (req, res) => {
  const body = parse(projectUpdate, req.body);
  const p = req.project;
  if (body.name) p.name = body.name;
  if (body.description !== undefined) p.description = body.description;
  if (body.access) p.access = body.access;
  if (body.settings) Object.assign(p.settings, body.settings);
  await p.save();
  if (body.settings?.strictEvents !== undefined) await invalidateProjectKeyCache(p._id);
  await audit(req, { action: 'project.updated', target: { type: 'project', id: String(p._id), name: p.name }, metadata: body });
  const envs = await Environment.find({ project: p._id }).lean();
  res.json(serializeProject(p.toObject(), envs, req.orgRole, req.user._id));
}));

r.post('/:projectId/archive', loadProject('admin'), ah(async (req, res) => {
  const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
  req.project.archivedAt = archived ? new Date() : null;
  await req.project.save();
  await invalidateProjectKeyCache(req.project._id);
  await audit(req, { action: archived ? 'project.archived' : 'project.restored', target: { type: 'project', id: String(req.project._id), name: req.project.name } });
  res.json({ ok: true, archived });
}));

r.delete('/:projectId', loadProject('admin'), ah(async (req, res) => {
  const { confirm } = parse(z.object({ confirm: z.string() }), req.body || {});
  if (confirm !== req.project.name) throw badRequest('Type the project name to confirm deletion');
  const pid = req.project._id;
  await invalidateProjectKeyCache(pid);
  const hooks = await Webhook.find({ project: pid }).select('_id').lean();
  const envs = await Environment.find({ project: pid }).select('_id').lean();
  await Promise.all([
    Event.deleteMany({ project: pid }),
    Profile.deleteMany({ project: pid }),
    EventDefinition.deleteMany({ project: pid }),
    Feature.deleteMany({ project: pid }),
    Funnel.deleteMany({ project: pid }),
    WebhookDelivery.deleteMany({ webhook: { $in: hooks.map((h) => h._id) } }),
    Webhook.deleteMany({ project: pid }),
    ApiKey.deleteMany({ project: pid }),
    ApiUsage.deleteMany({ environment: { $in: envs.map((e) => e._id) } }),
    Environment.deleteMany({ project: pid }),
  ]);
  await Project.deleteOne({ _id: pid });
  await audit(req, { action: 'project.deleted', project: null, target: { type: 'project', id: String(pid), name: req.project.name } });
  res.json({ ok: true });
}));

// ── Project members (project-level permissions) ────────────────────────────
r.get('/:projectId/members', loadProject(), ah(async (req, res) => {
  const memberships = await Membership.find({ org: req.project.org }).populate('user', 'name email').lean();
  res.json({
    access: req.project.access,
    items: memberships.filter((m) => m.user).map((m) => {
      const entry = req.project.members.find((x) => String(x.user) === String(m.user._id));
      return { userId: String(m.user._id), name: m.user.name, email: m.user.email, orgRole: m.role, projectRole: entry?.role || null, effectiveRole: projectRole(req.project, m.role, m.user._id) };
    }),
  });
}));

r.put('/:projectId/members/:userId', loadProject('admin'), ah(async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(['viewer', 'developer', 'admin']).nullable() }), req.body);
  const m = await Membership.findOne({ org: req.project.org, user: req.params.userId }).populate('user', 'email');
  if (!m) throw notFound('Organization member');
  req.project.members = req.project.members.filter((x) => String(x.user) !== req.params.userId);
  if (role) req.project.members.push({ user: m.user._id, role });
  await req.project.save();
  await audit(req, { action: role ? 'project.member_assigned' : 'project.member_unassigned', target: { type: 'user', id: req.params.userId, name: m.user.email }, metadata: { role } });
  res.json({ ok: true });
}));

// ── Environments ───────────────────────────────────────────────────────────
r.get('/:projectId/environments', loadProject(), ah(async (req, res) => {
  const envs = await Environment.find({ project: req.project._id }).lean();
  res.json({ items: envs.sort((a, b) => ENV_TYPES.indexOf(a.type) - ENV_TYPES.indexOf(b.type)).map(serializeEnv) });
}));

r.patch('/:projectId/environments/:envId', loadProject('admin'), ah(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(40).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), settings: z.object({ ingestionEnabled: z.boolean() }).partial().optional() }), req.body);
  const env = await Environment.findOne({ _id: req.params.envId, project: req.project._id });
  if (!env) throw notFound('Environment');
  if (body.name) env.name = body.name;
  if (body.color) env.color = body.color;
  if (body.settings?.ingestionEnabled !== undefined) env.settings.ingestionEnabled = body.settings.ingestionEnabled;
  await env.save();
  await invalidateProjectKeyCache(req.project._id);
  await audit(req, { action: 'environment.updated', target: { type: 'environment', id: String(env._id), name: env.name }, metadata: body });
  res.json(serializeEnv(env));
}));

// ── API keys ───────────────────────────────────────────────────────────────
const serializeKey = (k, envs) => ({
  id: String(k._id),
  name: k.name,
  environment: envs ? serializeEnv(envs.find((e) => String(e._id) === String(k.environment)) || { _id: k.environment }) : String(k.environment),
  maskedKey: `${k.prefix}${'•'.repeat(12)}${k.last4}`,
  prefix: k.prefix,
  last4: k.last4,
  scopes: k.scopes,
  createdAt: k.createdAt,
  createdBy: k.createdBy && typeof k.createdBy === 'object' && k.createdBy.email ? { name: k.createdBy.name, email: k.createdBy.email } : undefined,
  lastUsedAt: k.lastUsedAt || null,
  revokedAt: k.revokedAt || null,
  status: k.revokedAt ? 'revoked' : 'active',
});

r.get('/:projectId/api-keys', loadProject('developer'), ah(async (req, res) => {
  const filter = { project: req.project._id };
  if (req.query.envId && mongoose.isValidObjectId(req.query.envId)) filter.environment = req.query.envId;
  const [keys, envs] = await Promise.all([ApiKey.find(filter).populate('createdBy', 'name email').sort({ createdAt: -1 }).lean(), Environment.find({ project: req.project._id }).lean()]);
  res.json({ items: keys.map((k) => serializeKey(k, envs)) });
}));

r.post('/:projectId/api-keys', loadProject('developer', { allowArchived: false }), ah(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(80), envId: objectId, scopes: z.array(z.enum(['ingest', 'flags'])).min(1).optional() }), req.body);
  const env = await Environment.findOne({ _id: body.envId, project: req.project._id });
  if (!env) throw notFound('Environment');
  const { raw, hash, prefix, last4 } = generateApiKey(env.type);
  const key = await ApiKey.create({ org: req.project.org, project: req.project._id, environment: env._id, name: body.name, prefix, last4, keyHash: hash, scopes: body.scopes || ['ingest', 'flags'], createdBy: req.user._id });
  await audit(req, { action: 'api_key.created', target: { type: 'api_key', id: String(key._id), name: key.name }, metadata: { environment: env.type, prefix } });
  await notifyOrgAdmins(req.project.org, 'apiKeyChanges', { type: 'api_key.created', title: 'API key created', body: `${req.user.name} created key "${key.name}" (${env.name}) in ${req.project.name}.`, link: '/api-keys' });
  // The full secret is only ever returned in this response.
  res.status(201).json({ ...serializeKey(key.toObject(), [env.toObject()]), key: raw });
}));

r.post('/:projectId/api-keys/:keyId/revoke', loadProject('developer'), ah(async (req, res) => {
  const key = await ApiKey.findOne({ _id: req.params.keyId, project: req.project._id }).select('+keyHash');
  if (!key) throw notFound('API key');
  if (key.revokedAt) throw badRequest('Key is already revoked');
  key.revokedAt = new Date();
  key.revokedBy = req.user._id;
  await key.save();
  await invalidateApiKeyCache(key.keyHash);
  await audit(req, { action: 'api_key.revoked', target: { type: 'api_key', id: String(key._id), name: key.name } });
  await notifyOrgAdmins(req.project.org, 'apiKeyChanges', { type: 'api_key.revoked', title: 'API key revoked', body: `${req.user.name} revoked key "${key.name}" in ${req.project.name}.`, link: '/api-keys' });
  res.json(serializeKey(key.toObject()));
}));

// Regenerate = revoke the old key and issue a new one with the same name/environment/scopes.
r.post('/:projectId/api-keys/:keyId/regenerate', loadProject('developer', { allowArchived: false }), ah(async (req, res) => {
  const old = await ApiKey.findOne({ _id: req.params.keyId, project: req.project._id }).select('+keyHash');
  if (!old) throw notFound('API key');
  const env = await Environment.findById(old.environment);
  const { raw, hash, prefix, last4 } = generateApiKey(env.type);
  const key = await ApiKey.create({ org: old.org, project: old.project, environment: old.environment, name: old.name, prefix, last4, keyHash: hash, scopes: old.scopes, createdBy: req.user._id, rotatedFrom: old._id });
  if (!old.revokedAt) {
    old.revokedAt = new Date();
    old.revokedBy = req.user._id;
    await old.save();
  }
  await invalidateApiKeyCache(old.keyHash);
  await audit(req, { action: 'api_key.regenerated', target: { type: 'api_key', id: String(key._id), name: key.name }, metadata: { previousKeyId: String(old._id), prefix } });
  res.status(201).json({ ...serializeKey(key.toObject(), [env.toObject()]), key: raw });
}));

// ── Project activity (project-scoped audit feed, visible to all project members) ─
r.get('/:projectId/activity', loadProject(), ah(async (req, res) => {
  const q = parse(pagination, req.query);
  const filter = { org: req.project.org, project: req.project._id };
  const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), AuditLog.countDocuments(filter)]);
  res.json({ items: items.map((i) => ({ id: String(i._id), action: i.action, actor: { name: i.actor?.name, email: i.actor?.email }, target: i.target, createdAt: i.createdAt })), total, page: q.page, limit: q.limit });
}));

export { requireProjectRole, atLeast, forbidden, User };
export default r;
