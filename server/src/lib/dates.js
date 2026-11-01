import { z } from 'zod';
import { parse } from './validate.js';
import { badRequest } from './errors.js';

const DAY = 86400000;
export const startOfDayUTC = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  range: z.enum(['24h', '7d', '14d', '30d', '90d', '180d', '365d']).optional(),
});

// Resolves a date range from query params. Date-only "to" values are inclusive of that whole day.
export function resolveRange(query) {
  const q = parse(rangeSchema, query);
  const now = new Date();
  let to = q.to ? new Date(q.to) : now;
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) to = new Date(to.getTime() + DAY - 1);
  let from;
  if (q.from) from = new Date(q.from);
  else {
    const r = q.range || '30d';
    if (r === '24h') from = new Date(to.getTime() - DAY);
    else from = startOfDayUTC(new Date(to.getTime() - (parseInt(r, 10) - 1) * DAY));
  }
  if (from > to) throw badRequest('"from" must be before "to"');
  if (to - from > 731 * DAY) throw badRequest('Date range may not exceed 2 years');
  const span = to - from;
  return { from, to, prevFrom: new Date(from.getTime() - span - 1), prevTo: new Date(from.getTime() - 1) };
}

export function dayKeys(from, to) {
  const keys = [];
  for (let d = startOfDayUTC(from); d <= to; d = new Date(d.getTime() + DAY)) keys.push(d.toISOString().slice(0, 10));
  return keys;
}

export function growth(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export { DAY };
