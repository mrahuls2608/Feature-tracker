import mongoose from 'mongoose';
import { z } from 'zod';
import { Event, ApiUsage, Profile } from '../models/index.js';
import { dayKeys, growth, startOfDayUTC, DAY } from '../lib/dates.js';
import { badRequest } from '../lib/errors.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const INTERNAL = ['$identify'];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const filterSchema = z.array(
  z.object({
    property: z.string().regex(/^[A-Za-z0-9_\-$]{1,64}$/, 'Invalid property name'),
    operator: z.enum(['eq', 'neq', 'contains', 'gt', 'lt', 'exists']).default('eq'),
    value: z.any().optional(),
  }),
).max(10);

export function parseFilters(raw) {
  if (!raw) return [];
  let v = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      throw badRequest('filters must be a JSON array');
    }
  }
  const r = filterSchema.safeParse(v);
  if (!r.success) throw badRequest('Invalid filters', r.error.issues);
  return r.data;
}

function valueVariants(value) {
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return [value, Number(value)];
  if (value === 'true' || value === 'false') return [value, value === 'true'];
  return [value];
}

export function propertyConditions(filters, prefix = 'properties') {
  const cond = {};
  for (const f of filters) {
    const path = `${prefix}.${f.property}`;
    switch (f.operator) {
      case 'eq': cond[path] = { $in: valueVariants(f.value) }; break;
      case 'neq': cond[path] = { $nin: valueVariants(f.value) }; break;
      case 'contains': cond[path] = { $regex: escapeRe(String(f.value ?? '')), $options: 'i' }; break;
      case 'gt': cond[path] = { $gt: Number(f.value) }; break;
      case 'lt': cond[path] = { $lt: Number(f.value) }; break;
      case 'exists': cond[path] = { $exists: true }; break;
      default: break;
    }
  }
  return cond;
}

export function baseMatch(envId, { from, to }, { event, events, distinctId, filters = [], includeInternal = false } = {}) {
  const m = { environment: oid(envId), timestamp: { $gte: from, $lte: to } };
  if (event) m.name = event;
  else if (events?.length) m.name = { $in: events };
  else if (!includeInternal) m.name = { $nin: INTERNAL };
  if (distinctId) m.distinctId = distinctId;
  Object.assign(m, propertyConditions(filters));
  return m;
}

const UNIT = { day: 'day', week: 'week', month: 'month', hour: 'hour' };

function bucketKeys(from, to, interval) {
  if (interval === 'day') return dayKeys(from, to);
  const keys = [];
  if (interval === 'hour') {
    for (let d = new Date(Math.floor(from.getTime() / 3600000) * 3600000); d <= to; d = new Date(d.getTime() + 3600000)) keys.push(d.toISOString().slice(0, 13) + ':00');
    return keys;
  }
  if (interval === 'week') {
    let d = startOfDayUTC(from);
    d = new Date(d.getTime() - d.getUTCDay() * DAY); // weeks start Sunday (Mongo default)
    for (; d <= to; d = new Date(d.getTime() + 7 * DAY)) keys.push(d.toISOString().slice(0, 10));
    return keys;
  }
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) keys.push(d.toISOString().slice(0, 7));
  return keys;
}

function fmtBucket(date, interval) {
  const iso = new Date(date).toISOString();
  if (interval === 'hour') return iso.slice(0, 13) + ':00';
  if (interval === 'month') return iso.slice(0, 7);
  return iso.slice(0, 10);
}

// Generic time series: total events or unique users per bucket, optionally per event / property breakdown.
export async function timeseries(envId, range, { events = [], interval = 'day', metric = 'total', breakdown, filters = [], distinctId } = {}) {
  if (!UNIT[interval]) throw badRequest('Invalid interval');
  const keys = bucketKeys(range.from, range.to, interval);
  if (keys.length > 800) throw badRequest('Too many buckets; choose a larger interval');
  const match = baseMatch(envId, range, { events, filters, distinctId });
  const seriesField = breakdown ? `$properties.${breakdown}` : events.length > 1 ? '$name' : null;
  if (breakdown && !/^[A-Za-z0-9_\-$]{1,64}$/.test(breakdown)) throw badRequest('Invalid breakdown property');
  const bucketExpr = { $dateTrunc: { date: '$timestamp', unit: UNIT[interval] } };
  const pipeline = [{ $match: match }];
  if (metric === 'unique') {
    pipeline.push({ $group: { _id: { b: bucketExpr, s: seriesField, u: '$distinctId' } } }, { $group: { _id: { b: '$_id.b', s: '$_id.s' }, v: { $sum: 1 } } });
  } else {
    pipeline.push({ $group: { _id: { b: bucketExpr, s: seriesField }, v: { $sum: 1 } } });
  }
  const rows = await Event.aggregate(pipeline).allowDiskUse(true);
  const seriesTotals = new Map();
  for (const r of rows) {
    const s = r._id.s == null ? (seriesField ? '(none)' : 'all') : String(r._id.s);
    seriesTotals.set(s, (seriesTotals.get(s) || 0) + r.v);
  }
  // Keep the top 8 series for breakdowns to stay readable.
  const top = [...seriesTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s]) => s);
  const points = keys.map((k) => ({ bucket: k }));
  const index = Object.fromEntries(keys.map((k, i) => [k, i]));
  for (const r of rows) {
    const s = r._id.s == null ? (seriesField ? '(none)' : 'all') : String(r._id.s);
    if (!top.includes(s)) continue;
    const i = index[fmtBucket(r._id.b, interval)];
    if (i === undefined) continue;
    points[i][s] = (points[i][s] || 0) + r.v;
  }
  for (const p of points) for (const s of top) p[s] = p[s] || 0;
  if (!top.length) for (const p of points) p.all = 0;
  return { interval, metric, series: top.length ? top : ['all'], totals: Object.fromEntries(top.map((s) => [s, seriesTotals.get(s)])), points };
}

async function countAndUnique(match) {
  const [r] = await Event.aggregate([
    { $match: match },
    { $group: { _id: '$distinctId', c: { $sum: 1 } } },
    { $group: { _id: null, users: { $sum: 1 }, events: { $sum: '$c' } } },
  ]).allowDiskUse(true);
  return { events: r?.events || 0, users: r?.users || 0 };
}

export async function overview(envId, projectId, range, { filters = [] } = {}) {
  const now = new Date();
  const today = { from: startOfDayUTC(now), to: now };
  const prev = { from: range.prevFrom, to: range.prevTo };
  const last7 = { from: new Date(now.getTime() - 7 * DAY), to: now };
  const prevLast7 = { from: new Date(now.getTime() - 14 * DAY), to: new Date(now.getTime() - 7 * DAY) };
  const [cur, previous, todayStats, active, prevActive, daily, uniqueDaily, topEvents, recent, usage, prevUsage] = await Promise.all([
    countAndUnique(baseMatch(envId, range, { filters })),
    countAndUnique(baseMatch(envId, prev, { filters })),
    countAndUnique(baseMatch(envId, today, { filters })),
    countAndUnique(baseMatch(envId, last7, { filters })),
    countAndUnique(baseMatch(envId, prevLast7, { filters })),
    timeseries(envId, range, { filters }),
    timeseries(envId, range, { filters, metric: 'unique' }),
    Event.aggregate([
      { $match: baseMatch(envId, range, { filters }) },
      { $group: { _id: { n: '$name', u: '$distinctId' }, c: { $sum: 1 } } },
      { $group: { _id: '$_id.n', count: { $sum: '$c' }, users: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 10 },
    ]).allowDiskUse(true),
    Event.find(baseMatch(envId, { from: new Date(0), to: now }, { filters })).sort({ timestamp: -1 }).limit(10).lean(),
    sumUsage(envId, range),
    sumUsage(envId, prev),
  ]);
  const series = daily.points.map((p, i) => ({ date: p.bucket, events: p.all || 0, users: uniqueDaily.points[i]?.all || 0 }));
  return {
    range: { from: range.from, to: range.to },
    metrics: {
      totalEvents: { value: cur.events, previous: previous.events, growth: growth(cur.events, previous.events) },
      uniqueUsers: { value: cur.users, previous: previous.users, growth: growth(cur.users, previous.users) },
      eventsToday: { value: todayStats.events },
      activeUsers: { value: active.users, previous: prevActive.users, growth: growth(active.users, prevActive.users) },
      apiRequests: { value: usage.requests, previous: prevUsage.requests, growth: growth(usage.requests, prevUsage.requests) },
      eventsPerUser: { value: cur.users ? Math.round((cur.events / cur.users) * 10) / 10 : 0 },
    },
    series,
    topEvents: topEvents.map((t) => ({ name: t._id, count: t.count, users: t.users })),
    recent: recent.map((e) => ({ id: String(e._id), name: e.name, distinctId: e.distinctId, timestamp: e.timestamp, properties: e.properties })),
  };
}

async function sumUsage(envId, { from, to }) {
  const [r] = await ApiUsage.aggregate([
    { $match: { environment: oid(envId), date: { $gte: from.toISOString().slice(0, 10), $lte: to.toISOString().slice(0, 10) } } },
    { $group: { _id: null, requests: { $sum: '$requests' }, events: { $sum: '$events' }, rejected: { $sum: '$rejected' } } },
  ]);
  return { requests: r?.requests || 0, events: r?.events || 0, rejected: r?.rejected || 0 };
}

export async function usageSeries(envId, range) {
  const rows = await ApiUsage.find({ environment: oid(envId), date: { $gte: range.from.toISOString().slice(0, 10), $lte: range.to.toISOString().slice(0, 10) } }).lean();
  const map = Object.fromEntries(rows.map((r) => [r.date, r]));
  return dayKeys(range.from, range.to).map((d) => ({ date: d, requests: map[d]?.requests || 0, events: map[d]?.events || 0, rejected: map[d]?.rejected || 0 }));
}

// Detailed stats for a single event name.
export async function eventStats(envId, name, range, { filters = [] } = {}) {
  const now = new Date();
  const match = baseMatch(envId, range, { event: name, filters });
  const [cur, prev, today, series, uniqueSeries, propSample, recent, total] = await Promise.all([
    countAndUnique(match),
    countAndUnique(baseMatch(envId, { from: range.prevFrom, to: range.prevTo }, { event: name, filters })),
    countAndUnique(baseMatch(envId, { from: startOfDayUTC(now), to: now }, { event: name, filters })),
    timeseries(envId, range, { events: [name], filters }),
    timeseries(envId, range, { events: [name], filters, metric: 'unique' }),
    Event.find(match).sort({ timestamp: -1 }).limit(500).select('properties').lean(),
    Event.find(match).sort({ timestamp: -1 }).limit(20).lean(),
    Event.countDocuments({ environment: oid(envId), name }),
  ]);
  // Summarize observed properties: type, coverage and top values from a recent sample.
  const props = {};
  for (const e of propSample) {
    for (const [k, v] of Object.entries(e.properties || {})) {
      const p = (props[k] ||= { name: k, types: {}, count: 0, values: {} });
      p.count++;
      const t = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
      p.types[t] = (p.types[t] || 0) + 1;
      if (['string', 'number', 'boolean'].includes(t)) {
        const key = String(v).slice(0, 80);
        p.values[key] = (p.values[key] || 0) + 1;
      }
    }
  }
  const properties = Object.values(props)
    .sort((a, b) => b.count - a.count)
    .map((p) => ({
      name: p.name,
      type: Object.entries(p.types).sort((a, b) => b[1] - a[1])[0][0],
      coverage: propSample.length ? Math.round((p.count / propSample.length) * 100) : 0,
      topValues: Object.entries(p.values).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value, count })),
    }));
  return {
    name,
    allTimeTotal: total,
    total: cur.events,
    uniqueUsers: cur.users,
    today: today.events,
    growth: growth(cur.events, prev.events),
    previousTotal: prev.events,
    series: series.points.map((p, i) => ({ date: p.bucket, count: p[name] ?? p.all ?? 0, users: uniqueSeries.points[i]?.[name] ?? uniqueSeries.points[i]?.all ?? 0 })),
    properties,
    recent: recent.map((e) => ({ id: String(e._id), distinctId: e.distinctId, timestamp: e.timestamp, properties: e.properties })),
  };
}

// Cohort retention: users grouped by the period of their first startEvent in range,
// counted as retained in period N if they performed returnEvent N periods later.
export async function retention(envId, range, { startEvent, returnEvent, period = 'week', periods = 8 } = {}) {
  const unit = period === 'day' ? DAY : 7 * DAY;
  const n = Math.min(Math.max(Number(periods) || 8, 2), 16);
  const match = { environment: oid(envId), timestamp: { $gte: range.from, $lte: new Date(range.to.getTime() + n * unit) } };
  const startMatch = startEvent ? { name: startEvent } : { name: { $nin: INTERNAL } };
  const [firsts, returns] = await Promise.all([
    Event.aggregate([{ $match: { ...match, ...startMatch, timestamp: { $gte: range.from, $lte: range.to } } }, { $group: { _id: '$distinctId', first: { $min: '$timestamp' } } }]).allowDiskUse(true),
    Event.aggregate([
      { $match: { ...match, ...(returnEvent ? { name: returnEvent } : { name: { $nin: INTERNAL } }) } },
      { $group: { _id: { u: '$distinctId', d: { $dateTrunc: { date: '$timestamp', unit: 'day' } } } } },
    ]).allowDiskUse(true),
  ]);
  const activity = new Map();
  for (const r of returns) {
    if (!activity.has(r._id.u)) activity.set(r._id.u, []);
    activity.get(r._id.u).push(new Date(r._id.d).getTime());
  }
  const origin = startOfDayUTC(range.from).getTime();
  const cohorts = new Map();
  for (const f of firsts) {
    const first = new Date(f.first).getTime();
    const cIdx = Math.floor((first - origin) / unit);
    const cohortStart = origin + cIdx * unit;
    const c = cohorts.get(cIdx) || { start: new Date(cohortStart).toISOString().slice(0, 10), size: 0, retained: new Array(n).fill(0) };
    c.size++;
    const days = activity.get(f._id) || [];
    const hit = new Set();
    for (const d of days) {
      const k = Math.floor((d - startOfDayUTC(new Date(first)).getTime()) / unit);
      if (k >= 0 && k < n) hit.add(k);
    }
    hit.add(0);
    for (const k of hit) c.retained[k]++;
    cohorts.set(cIdx, c);
  }
  const now = Date.now();
  const rows = [...cohorts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => {
      const elapsed = Math.floor((now - new Date(c.start).getTime()) / unit);
      return { ...c, percentages: c.retained.map((v, i) => (i > elapsed ? null : Math.round((v / c.size) * 1000) / 10)) };
    });
  const totals = new Array(n).fill(0).map((_, i) => {
    const eligible = rows.filter((r) => r.percentages[i] !== null);
    const size = eligible.reduce((s, r) => s + r.size, 0);
    return size ? Math.round((eligible.reduce((s, r) => s + r.retained[i], 0) / size) * 1000) / 10 : null;
  });
  return { period, periods: n, startEvent: startEvent || null, returnEvent: returnEvent || null, cohorts: rows, average: totals };
}

// Engagement: DAU / WAU / MAU, stickiness and frequency distribution.
export async function engagement(envId, range, { filters = [] } = {}) {
  const now = range.to;
  const windows = { dau: DAY, wau: 7 * DAY, mau: 30 * DAY };
  const counts = {};
  await Promise.all(
    Object.entries(windows).map(async ([k, w]) => {
      counts[k] = (await countAndUnique(baseMatch(envId, { from: new Date(now.getTime() - w), to: now }, { filters }))).users;
    }),
  );
  const perUser = await Event.aggregate([{ $match: baseMatch(envId, range, { filters }) }, { $group: { _id: '$distinctId', c: { $sum: 1 }, days: { $addToSet: { $dateTrunc: { date: '$timestamp', unit: 'day' } } } } }, { $project: { c: 1, d: { $size: '$days' } } }]).allowDiskUse(true);
  const buckets = [
    { label: '1', min: 1, max: 1 },
    { label: '2–5', min: 2, max: 5 },
    { label: '6–10', min: 6, max: 10 },
    { label: '11–25', min: 11, max: 25 },
    { label: '26–50', min: 26, max: 50 },
    { label: '51+', min: 51, max: Infinity },
  ].map((b) => ({ ...b, users: perUser.filter((u) => u.c >= b.min && u.c <= b.max).length }));
  const activeDays = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ days: d === 7 ? '7+' : String(d), users: perUser.filter((u) => (d === 7 ? u.d >= 7 : u.d === d)).length }));
  const uniqueSeries = await timeseries(envId, range, { filters, metric: 'unique' });
  const top = [...perUser].sort((a, b) => b.c - a.c).slice(0, 10);
  const profiles = await Profile.find({ environment: oid(envId), distinctId: { $in: top.map((t) => t._id) } }).lean();
  return {
    dau: counts.dau,
    wau: counts.wau,
    mau: counts.mau,
    stickiness: counts.mau ? Math.round((counts.dau / counts.mau) * 1000) / 10 : 0,
    avgEventsPerUser: perUser.length ? Math.round((perUser.reduce((s, u) => s + u.c, 0) / perUser.length) * 10) / 10 : 0,
    frequency: buckets.map(({ label, users }) => ({ label, users })),
    activeDays,
    dailyActive: uniqueSeries.points.map((p) => ({ date: p.bucket, users: p.all || 0 })),
    topUsers: top.map((t) => ({ distinctId: t._id, events: t.c, activeDays: t.d, traits: profiles.find((p) => p.distinctId === t._id)?.traits || {} })),
  };
}
