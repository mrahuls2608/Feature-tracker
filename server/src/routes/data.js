import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Event, EventDefinition, Profile, Feature } from '../models/index.js';
import { ah, notFound } from '../lib/errors.js';
import { parse, pagination, eventName } from '../lib/validate.js';
import { loadProject, withEnv } from '../middleware/rbac.js';
import { resolveRange } from '../lib/dates.js';
import { cached } from '../lib/cache.js';
import { audit } from '../lib/audit.js';
import * as A from '../services/analytics.js';
import { featureSummary, exposureMatch, adoptionMatch } from '../services/features.js';
import { invalidateDefinitions } from '../services/ingest.js';
import { bumpEnvVersion } from '../lib/cache.js';

const r = Router();
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const viewer = [loadProject('viewer'), withEnv()];
const rangeKey = (range) => ({ from: range.from.toISOString(), to: range.to.toISOString() });

// ── Event definitions ───────────────────────────────────────────────────────
const propDef = z.object({ name: z.string().regex(/^[A-Za-z0-9_\-]{1,64}$/), type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'any']).default('any'), required: z.boolean().default(false), description: z.string().max(300).optional() });
const defSchema = z.object({
  name: eventName,
  displayName: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(60).optional(),
  status: z.enum(['active', 'discovered', 'deprecated']).optional(),
  properties: z.array(propDef).max(50).optional(),
});

r.get('/:projectId/event-definitions', ...viewer, ah(async (req, res) => {
  const range = resolveRange(req.query);
  const q = parse(z.object({ q: z.string().max(100).optional(), status: z.enum(['active', 'discovered', 'deprecated']).optional() }).passthrough(), req.query);
  const filter = { project: req.project._id };
  if (q.status) filter.status = q.status;
  if (q.q) filter.$or = [{ name: { $regex: escapeRe(q.q), $options: 'i' } }, { displayName: { $regex: escapeRe(q.q), $options: 'i' } }, { description: { $regex: escapeRe(q.q), $options: 'i' } }];
  const defs = await EventDefinition.find(filter).sort({ name: 1 }).lean();
  const volume = await cached(req.env._id, 'defvolume', rangeKey(range), 60, async () => {
    const rows = await Event.aggregate([
      { $match: { environment: req.env._id, timestamp: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { n: '$name', u: '$distinctId' }, c: { $sum: 1 }, last: { $max: '$timestamp' } } },
      { $group: { _id: '$_id.n', count: { $sum: '$c' }, users: { $sum: 1 }, last: { $max: '$last' } } },
    ]).allowDiskUse(true);
    return Object.fromEntries(rows.map((x) => [x._id, { count: x.count, users: x.users, lastSeenAt: x.last }]));
  });
  res.json({
    items: defs.map((d) => ({ ...d, id: String(d._id), volume: volume[d.name]?.count || 0, uniqueUsers: volume[d.name]?.users || 0, lastSeenInEnvAt: volume[d.name]?.lastSeenAt || null })),
  });
}));

r.post('/:projectId/event-definitions', loadProject('developer', { allowArchived: false }), ah(async (req, res) => {
  const body = parse(defSchema, req.body);
  const existing = await EventDefinition.findOne({ project: req.project._id, name: body.name });
  let def;
  if (existing && existing.status === 'discovered') {
    Object.assign(existing, { ...body, status: body.status || 'active' });
    def = await existing.save();
  } else {
    def = await EventDefinition.create({ ...body, status: body.status || 'active', org: req.project.org, project: req.project._id, createdBy: req.user._id });
  }
  await invalidateDefinitions(req.project._id);
  await audit(req, { action: 'event_definition.created', target: { type: 'event_definition', id: String(def._id), name: def.name } });
  res.status(201).json(def);
}));

r.get('/:projectId/event-definitions/:defId', loadProject(), ah(async (req, res) => {
  const def = await EventDefinition.findOne({ _id: req.params.defId, project: req.project._id });
  if (!def) throw notFound('Event definition');
  res.json(def);
}));

r.patch('/:projectId/event-definitions/:defId', loadProject('developer', { allowArchived: false }), ah(async (req, res) => {
  const body = parse(defSchema.omit({ name: true }).partial(), req.body);
  const def = await EventDefinition.findOne({ _id: req.params.defId, project: req.project._id });
  if (!def) throw notFound('Event definition');
  Object.assign(def, body);
  await def.save();
  await invalidateDefinitions(req.project._id);
  await audit(req, { action: 'event_definition.updated', target: { type: 'event_definition', id: String(def._id), name: def.name }, metadata: { fields: Object.keys(body) } });
  res.json(def);
}));

r.delete('/:projectId/event-definitions/:defId', loadProject('developer'), ah(async (req, res) => {
  const def = await EventDefinition.findOneAndDelete({ _id: req.params.defId, project: req.project._id });
  if (!def) throw notFound('Event definition');
  await invalidateDefinitions(req.project._id);
  await audit(req, { action: 'event_definition.deleted', target: { type: 'event_definition', id: String(def._id), name: def.name } });
  res.json({ ok: true });
}));

// ── Raw events ─────────────────────────────────────────────────────────────
r.get('/:projectId/events', ...viewer, ah(async (req, res) => {
  const q = parse(pagination.extend({ name: z.string().max(128).optional(), distinctId: z.string().max(200).optional(), q: z.string().max(100).optional(), before: z.string().datetime().optional() }).passthrough(), req.query);
  const range = req.query.from || req.query.range ? resolveRange(req.query) : { from: new Date(0), to: new Date() };
  const filters = A.parseFilters(req.query.filters);
  const match = A.baseMatch(req.env._id, range, { event: q.name, distinctId: q.distinctId, filters, includeInternal: true });
  if (q.before) match.timestamp.$lt = new Date(q.before);
  if (q.q) match.$or = [{ name: { $regex: escapeRe(q.q), $options: 'i' } }, { distinctId: { $regex: `^${escapeRe(q.q)}`, $options: 'i' } }];
  const [items, total] = await Promise.all([
    Event.find(match).sort({ timestamp: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Event.countDocuments(match).limit(100000),
  ]);
  res.json({ items: items.map(serializeEvent), total, page: q.page, limit: q.limit });
}));

r.get('/:projectId/events/stats', ...viewer, ah(async (req, res) => {
  const { name } = parse(z.object({ name: eventName }).passthrough(), req.query);
  const range = resolveRange(req.query);
  const filters = A.parseFilters(req.query.filters);
  const data = await cached(req.env._id, 'eventstats', { name, ...rangeKey(range), filters }, 60, () => A.eventStats(req.env._id, name, range, { filters }));
  const definition = await EventDefinition.findOne({ project: req.project._id, name }).lean();
  res.json({ ...data, definition: definition ? { ...definition, id: String(definition._id) } : null });
}));

r.get('/:projectId/events/:eventId', ...viewer, ah(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.eventId)) throw notFound('Event');
  const e = await Event.findOne({ _id: req.params.eventId, environment: req.env._id }).lean();
  if (!e) throw notFound('Event');
  res.json(serializeEvent(e));
}));

export function serializeEvent(e) {
  return { id: String(e._id), name: e.name, distinctId: e.distinctId, properties: e.properties, context: e.context, timestamp: e.timestamp, receivedAt: e.receivedAt, messageId: e.messageId, environment: String(e.environment) };
}

// ── Analytics ──────────────────────────────────────────────────────────────
async function activeFeatureStats(project, env, range) {
  const features = await Feature.find({ project: project._id, status: { $in: ['beta', 'live'] } }).lean();
  const stats = await Promise.all(features.map(async (f) => ({ id: String(f._id), key: f.key, name: f.name, status: f.status, ...(({ _exposed, _adopted, ...rest }) => rest)(await featureSummary(env._id, range, f)) })));
  return stats.sort((a, b) => b.adoptedUsers - a.adoptedUsers);
}

r.get('/:projectId/analytics/overview', ...viewer, ah(async (req, res) => {
  const range = resolveRange(req.query);
  const filters = A.parseFilters(req.query.filters);
  const data = await cached(req.env._id, 'overview', { ...rangeKey(range), filters }, 30, async () => {
    const [ov, features] = await Promise.all([A.overview(req.env._id, req.project._id, range, { filters }), activeFeatureStats(req.project, req.env, range)]);
    const withExposure = features.filter((f) => f.exposedUsers > 0);
    ov.metrics.activeFeatures = { value: features.length, withActivity: withExposure.length };
    ov.metrics.featureAdoption = { value: withExposure.length ? Math.round((withExposure.reduce((s, f) => s + f.adoptionRate, 0) / withExposure.length) * 10) / 10 : 0 };
    ov.topFeatures = features.slice(0, 6);
    return ov;
  });
  res.json(data);
}));

const trendsQuery = z.object({
  events: z.string().max(1000).optional(),
  interval: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  metric: z.enum(['total', 'unique']).default('total'),
  breakdown: z.string().max(64).optional(),
  distinctId: z.string().max(200).optional(),
}).passthrough();
r.get('/:projectId/analytics/trends', ...viewer, ah(async (req, res) => {
  const q = parse(trendsQuery, req.query);
  const range = resolveRange(req.query);
  const filters = A.parseFilters(req.query.filters);
  const events = q.events ? q.events.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8) : [];
  const params = { events, interval: q.interval, metric: q.metric, breakdown: q.breakdown || undefined, filters, distinctId: q.distinctId };
  res.json(await cached(req.env._id, 'trends', { ...params, ...rangeKey(range) }, 60, () => A.timeseries(req.env._id, range, params)));
}));

r.get('/:projectId/analytics/retention', ...viewer, ah(async (req, res) => {
  const q = parse(z.object({ startEvent: z.string().max(128).optional(), returnEvent: z.string().max(128).optional(), period: z.enum(['day', 'week']).default('week'), periods: z.coerce.number().int().min(2).max(16).default(8) }).passthrough(), req.query);
  const range = resolveRange(req.query);
  const params = { startEvent: q.startEvent || undefined, returnEvent: q.returnEvent || undefined, period: q.period, periods: q.periods };
  res.json(await cached(req.env._id, 'retention', { ...params, ...rangeKey(range) }, 120, () => A.retention(req.env._id, range, params)));
}));

r.get('/:projectId/analytics/engagement', ...viewer, ah(async (req, res) => {
  const range = resolveRange(req.query);
  const filters = A.parseFilters(req.query.filters);
  res.json(await cached(req.env._id, 'engagement', { ...rangeKey(range), filters }, 60, () => A.engagement(req.env._id, range, { filters })));
}));

r.get('/:projectId/analytics/usage', ...viewer, ah(async (req, res) => {
  const range = resolveRange(req.query);
  res.json({ items: await A.usageSeries(req.env._id, range) });
}));

// Known property keys (definitions + a sample of recent events) to power filter pickers.
r.get('/:projectId/analytics/properties', ...viewer, ah(async (req, res) => {
  const { event } = parse(z.object({ event: z.string().max(128).optional() }).passthrough(), req.query);
  const match = { environment: req.env._id, ...(event ? { name: event } : {}) };
  const sample = await Event.find(match).sort({ timestamp: -1 }).limit(300).select('properties').lean();
  const keys = new Set();
  for (const e of sample) for (const k of Object.keys(e.properties || {})) keys.add(k);
  const defs = await EventDefinition.find({ project: req.project._id, ...(event ? { name: event } : {}) }).select('properties').lean();
  for (const d of defs) for (const p of d.properties || []) keys.add(p.name);
  res.json({ items: [...keys].sort() });
}));

// ── Tracked users (profiles) ────────────────────────────────────────────────
r.get('/:projectId/users', ...viewer, ah(async (req, res) => {
  const q = parse(pagination.extend({ q: z.string().max(200).optional(), sort: z.enum(['lastSeenAt', 'firstSeenAt', 'eventCount']).default('lastSeenAt') }).passthrough(), req.query);
  const filter = { environment: req.env._id };
  if (q.q) {
    const re = { $regex: escapeRe(q.q), $options: 'i' };
    filter.$or = [{ distinctId: re }, { 'traits.email': re }, { 'traits.name': re }];
  }
  const [items, total] = await Promise.all([Profile.find(filter).sort({ [q.sort]: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), Profile.countDocuments(filter)]);
  res.json({ items: items.map(serializeProfile), total, page: q.page, limit: q.limit });
}));

r.get('/:projectId/users/:distinctId', ...viewer, ah(async (req, res) => {
  const profile = await Profile.findOne({ environment: req.env._id, distinctId: req.params.distinctId }).lean();
  if (!profile) throw notFound('User');
  const match = { environment: req.env._id, distinctId: profile.distinctId };
  const [recent, topEvents, timeline, features] = await Promise.all([
    Event.find(match).sort({ timestamp: -1 }).limit(50).lean(),
    Event.aggregate([{ $match: match }, { $group: { _id: '$name', count: { $sum: 1 }, last: { $max: '$timestamp' } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
    Event.aggregate([{ $match: { ...match, timestamp: { $gte: new Date(Date.now() - 90 * 86400_000) } } }, { $group: { _id: { $dateTrunc: { date: '$timestamp', unit: 'day' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Feature.find({ project: req.project._id }).lean(),
  ]);
  const featureHistory = (
    await Promise.all(
      features.map(async (f) => {
        const [exp, adp] = await Promise.all([
          Event.findOne({ ...match, $or: [...exposureMatch(f), ...adoptionMatch(f)] }).sort({ timestamp: 1 }).select('timestamp').lean(),
          Event.findOne({ ...match, $or: adoptionMatch(f) }).sort({ timestamp: 1 }).select('timestamp').lean(),
        ]);
        if (!exp) return null;
        return { featureId: String(f._id), key: f.key, name: f.name, firstExposedAt: exp.timestamp, adoptedAt: adp?.timestamp || null };
      }),
    )
  ).filter(Boolean);
  res.json({
    ...serializeProfile(profile),
    topEvents: topEvents.map((t) => ({ name: t._id, count: t.count, lastAt: t.last })),
    timeline: timeline.map((t) => ({ date: new Date(t._id).toISOString().slice(0, 10), count: t.count })),
    recentEvents: recent.map(serializeEvent),
    features: featureHistory,
  });
}));

// Data-subject erasure: removes a user's profile and every event in this environment.
r.delete('/:projectId/users/:distinctId', loadProject('admin'), withEnv(), ah(async (req, res) => {
  const profile = await Profile.findOneAndDelete({ environment: req.env._id, distinctId: req.params.distinctId });
  if (!profile) throw notFound('User');
  const { deletedCount } = await Event.deleteMany({ environment: req.env._id, distinctId: req.params.distinctId });
  await bumpEnvVersion(req.env._id);
  await audit(req, { action: 'user_data.deleted', target: { type: 'tracked_user', id: req.params.distinctId, name: req.params.distinctId }, metadata: { environment: req.env.type, events: deletedCount } });
  res.json({ ok: true, deletedEvents: deletedCount });
}));

function serializeProfile(p) {
  return { id: String(p._id), distinctId: p.distinctId, traits: p.traits || {}, firstSeenAt: p.firstSeenAt, lastSeenAt: p.lastSeenAt, eventCount: p.eventCount, lastEvent: p.lastEvent };
}

export { oid };
export default r;
