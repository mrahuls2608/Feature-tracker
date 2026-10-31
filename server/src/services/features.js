import mongoose from 'mongoose';
import { Event, Feature } from '../models/index.js';
import { dayKeys } from '../lib/dates.js';
import { bucket } from '../lib/crypto.js';
import { getRedis, rk } from '../lib/redis.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// Metric definitions (shown in the UI):
//  - Exposed user: performed `$feature_exposed` with properties.feature = key, or any configured exposure event,
//    or adopted the feature (using a feature implies exposure).
//  - Adopted user: performed `$feature_used` with properties.feature = key, or any configured adoption event.
//  - Adoption rate: adopted users / exposed users.
export function exposureMatch(feature) {
  return [{ name: '$feature_exposed', 'properties.feature': feature.key }, ...(feature.exposureEvents?.length ? [{ name: { $in: feature.exposureEvents } }] : [])];
}
export function adoptionMatch(feature) {
  return [{ name: '$feature_used', 'properties.feature': feature.key }, ...(feature.adoptionEvents?.length ? [{ name: { $in: feature.adoptionEvents } }] : [])];
}

export async function featureSummary(envId, range, feature) {
  const base = { environment: oid(envId), timestamp: { $gte: range.from, $lte: range.to } };
  const [exposed, adopted] = await Promise.all([
    Event.distinct('distinctId', { ...base, $or: exposureMatch(feature) }),
    Event.distinct('distinctId', { ...base, $or: adoptionMatch(feature) }),
  ]);
  const exposedSet = new Set([...exposed, ...adopted]);
  return {
    exposedUsers: exposedSet.size,
    adoptedUsers: adopted.length,
    adoptionRate: exposedSet.size ? Math.round((adopted.length / exposedSet.size) * 1000) / 10 : 0,
    _exposed: exposedSet,
    _adopted: new Set(adopted),
  };
}

export async function featureDetail(envId, range, feature) {
  const base = { environment: oid(envId), timestamp: { $gte: range.from, $lte: range.to } };
  const summary = await featureSummary(envId, range, feature);
  const daily = async (or) =>
    Event.aggregate([
      { $match: { ...base, $or: or } },
      { $group: { _id: { d: { $dateTrunc: { date: '$timestamp', unit: 'day' } }, u: '$distinctId' } } },
      { $group: { _id: '$_id.d', users: { $sum: 1 } } },
    ]);
  const [exp, adp, related] = await Promise.all([
    daily([...exposureMatch(feature), ...adoptionMatch(feature)]),
    daily(adoptionMatch(feature)),
    Event.aggregate([
      { $match: { ...base, $or: [...exposureMatch(feature), ...adoptionMatch(feature), ...(feature.conversionEvent ? [{ name: feature.conversionEvent }] : [])] } },
      { $group: { _id: { n: '$name', u: '$distinctId' }, c: { $sum: 1 } } },
      { $group: { _id: '$_id.n', count: { $sum: '$c' }, users: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
  ]);
  const toMap = (rows) => Object.fromEntries(rows.map((r) => [new Date(r._id).toISOString().slice(0, 10), r.users]));
  const em = toMap(exp);
  const am = toMap(adp);
  const trend = dayKeys(range.from, range.to).map((d) => ({ date: d, exposed: em[d] || 0, adopted: am[d] || 0 }));

  let conversion = null;
  if (feature.conversionEvent) {
    const converted = new Set(await Event.distinct('distinctId', { ...base, name: feature.conversionEvent }));
    const adopters = [...summary._adopted];
    const nonAdopters = [...summary._exposed].filter((u) => !summary._adopted.has(u));
    const rate = (arr) => (arr.length ? Math.round((arr.filter((u) => converted.has(u)).length / arr.length) * 1000) / 10 : 0);
    conversion = {
      event: feature.conversionEvent,
      adopters: { users: adopters.length, converted: adopters.filter((u) => converted.has(u)).length, rate: rate(adopters) },
      nonAdopters: { users: nonAdopters.length, converted: nonAdopters.filter((u) => converted.has(u)).length, rate: rate(nonAdopters) },
    };
    conversion.lift = conversion.nonAdopters.rate ? Math.round(((conversion.adopters.rate - conversion.nonAdopters.rate) / conversion.nonAdopters.rate) * 1000) / 10 : null;
  }
  const { _exposed, _adopted, ...metrics } = summary;
  return {
    ...metrics,
    trend,
    relatedEvents: related.map((r) => ({
      name: r._id,
      count: r.count,
      users: r.users,
      role: r._id === feature.conversionEvent ? 'conversion' : adoptionMatch(feature).some((m) => m.name === r._id || m.name?.$in?.includes(r._id)) ? 'adoption' : 'exposure',
    })),
    conversion,
  };
}

// ── Feature flag evaluation ─────────────────────────────────────────────────
function ruleMatches(rule, ctx) {
  const v = rule.property === 'distinctId' ? ctx.distinctId : ctx.properties?.[rule.property];
  switch (rule.operator) {
    case 'eq': return String(v) === String(rule.value);
    case 'neq': return String(v) !== String(rule.value);
    case 'in': return (Array.isArray(rule.value) ? rule.value : String(rule.value).split(',').map((s) => s.trim())).map(String).includes(String(v));
    case 'contains': return String(v ?? '').toLowerCase().includes(String(rule.value).toLowerCase());
    case 'gt': return Number(v) > Number(rule.value);
    case 'lt': return Number(v) < Number(rule.value);
    default: return false;
  }
}

export function evaluateFlag(feature, envId, ctx) {
  if (feature.status === 'deprecated') return { enabled: false, reason: 'deprecated' };
  const r = feature.rollouts?.find((x) => String(x.environment) === String(envId));
  if (!r || !r.enabled) return { enabled: false, reason: 'disabled' };
  if (r.rules?.length && !r.rules.every((rule) => ruleMatches(rule, ctx))) return { enabled: false, reason: 'targeting_mismatch' };
  const b = bucket(`${feature.key}:${ctx.distinctId}`);
  if (b >= (r.percentage ?? 100)) return { enabled: false, reason: 'rollout', bucket: b };
  return { enabled: true, reason: r.percentage < 100 ? 'rollout' : r.rules?.length ? 'targeting_match' : 'enabled', bucket: b };
}

export async function flagsForEnv(projectId, envId) {
  const key = rk('flags', String(projectId));
  const redis = getRedis();
  let features;
  try {
    const hit = await redis.get(key);
    if (hit) features = JSON.parse(hit);
  } catch {
    /* ignore */
  }
  if (!features) {
    features = await Feature.find({ project: projectId }).select('key status rollouts').lean();
    await redis.set(key, JSON.stringify(features), 'EX', 30).catch(() => {});
  }
  return features;
}

export async function invalidateFlags(projectId) {
  await getRedis().del(rk('flags', String(projectId))).catch(() => {});
}
