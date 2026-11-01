import mongoose from 'mongoose';
import { Event } from '../models/index.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));

function matchesFilters(props, filters = []) {
  for (const f of filters) {
    const v = props?.[f.property];
    switch (f.operator) {
      case 'eq': if (String(v) !== String(f.value)) return false; break;
      case 'neq': if (String(v) === String(f.value)) return false; break;
      case 'contains': if (!String(v ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase())) return false; break;
      case 'gt': if (!(Number(v) > Number(f.value))) return false; break;
      case 'lt': if (!(Number(v) < Number(f.value))) return false; break;
      default: break;
    }
  }
  return true;
}

// Ordered funnel: a user converts through step k if they perform each step in order,
// with every step happening within `windowHours` of entering the funnel (step 1).
// Users enter the funnel when they perform step 1 inside the selected date range.
export async function computeFunnel(envId, range, { steps, windowHours = 168, filters = [] }) {
  const windowMs = windowHours * 3600_000;
  const names = [...new Set(steps.map((s) => s.event))];
  const propKeys = [...new Set([...steps.flatMap((s) => (s.filters || []).map((f) => f.property)), ...filters.map((f) => f.property)])];
  const project = { name: 1, timestamp: 1 };
  for (const k of propKeys) project[`properties.${k}`] = 1;
  const rows = await Event.aggregate([
    { $match: { environment: oid(envId), name: { $in: names }, timestamp: { $gte: range.from, $lte: new Date(range.to.getTime() + windowMs) } } },
    { $project: { distinctId: 1, ...project } },
    { $sort: { timestamp: 1 } },
    { $group: { _id: '$distinctId', evs: { $push: { n: '$name', t: '$timestamp', p: '$properties' } } } },
  ]).allowDiskUse(true);

  const counts = new Array(steps.length).fill(0);
  const durations = steps.map(() => []);
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const matchStep = (e, i) => e.n === steps[i].event && matchesFilters(e.p, steps[i].filters) && matchesFilters(e.p, filters);

  for (const row of rows) {
    const evs = row.evs;
    let best = { depth: 0, times: [] };
    let tries = 0;
    for (let s = 0; s < evs.length && tries < 25; s++) {
      const e0 = evs[s];
      const t0 = new Date(e0.t).getTime();
      if (t0 < fromMs || t0 > toMs || !matchStep(e0, 0)) continue;
      tries++;
      const times = [t0];
      let idx = s;
      for (let k = 1; k < steps.length; k++) {
        let found = -1;
        for (let j = idx + 1; j < evs.length; j++) {
          const tj = new Date(evs[j].t).getTime();
          if (tj > t0 + windowMs) break;
          if (matchStep(evs[j], k)) {
            found = j;
            break;
          }
        }
        if (found === -1) break;
        idx = found;
        times.push(new Date(evs[found].t).getTime());
      }
      if (times.length > best.depth) best = { depth: times.length, times };
      if (best.depth === steps.length) break;
    }
    for (let k = 0; k < best.depth; k++) {
      counts[k]++;
      if (k > 0) durations[k].push(best.times[k] - best.times[k - 1]);
    }
  }

  const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const entered = counts[0] || 0;
  const result = steps.map((s, i) => {
    const prev = i === 0 ? counts[0] : counts[i - 1];
    const conv = i === 0 ? (counts[0] ? 100 : 0) : prev ? (counts[i] / prev) * 100 : 0;
    return {
      index: i,
      event: s.event,
      label: s.label || s.event,
      users: counts[i],
      conversionFromPrevious: Math.round(conv * 10) / 10,
      conversionFromStart: entered ? Math.round((counts[i] / entered) * 1000) / 10 : 0,
      dropOff: i === 0 ? 0 : prev - counts[i],
      dropOffRate: i === 0 ? 0 : Math.round((100 - conv) * 10) / 10,
      medianTimeFromPreviousMs: i === 0 ? null : median(durations[i]),
    };
  });
  const last = counts[steps.length - 1] || 0;
  const worst = result.slice(1).reduce((w, s) => (w === null || s.dropOffRate > w.dropOffRate ? s : w), null);
  return {
    steps: result,
    entered,
    converted: last,
    overallConversion: entered ? Math.round((last / entered) * 1000) / 10 : 0,
    biggestDropOff: worst && worst.dropOff > 0 ? { step: worst.index, label: worst.label, rate: worst.dropOffRate, users: worst.dropOff } : null,
    windowHours,
  };
}
