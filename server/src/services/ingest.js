import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiKey, Environment, Project, EventDefinition, ApiUsage } from '../models/index.js';
import { sha256 } from '../lib/crypto.js';
import { getRedis, rk } from '../lib/redis.js';
import { getQueue, QUEUES } from '../lib/queue.js';
import { config } from '../config.js';
import { unauthorized, forbidden, validationError } from '../lib/errors.js';
import { formatZod, eventName } from '../lib/validate.js';

export const API_KEY_RE = /^ft_(dev|stg|live)_[A-Za-z0-9_-]{32,}$/;
const ENV_PREFIX = { development: 'dev', staging: 'stg', production: 'live' };

export function generateApiKey(envType) {
  const raw = `ft_${ENV_PREFIX[envType]}_${crypto.randomBytes(24).toString('base64url')}`;
  return { raw, hash: sha256(raw), prefix: raw.slice(0, 10), last4: raw.slice(-4) };
}

export function extractApiKey(req) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ft_')) return h.slice(7).trim();
  if (h?.startsWith('Basic ')) {
    const decoded = Buffer.from(h.slice(6), 'base64').toString();
    return decoded.split(':')[0];
  }
  return req.headers['x-api-key'] || req.body?.apiKey;
}

// Resolves an API key to its environment. Cached briefly in Redis to keep ingestion fast;
// revocation clears the cache entry so it takes effect immediately.
export async function authenticateApiKey(raw) {
  if (!raw || !API_KEY_RE.test(raw)) throw unauthorized('Missing or malformed API key');
  const hash = sha256(raw);
  const redis = getRedis();
  const cacheKey = rk('apikey', hash);
  let ctx = null;
  try {
    const hit = await redis.get(cacheKey);
    if (hit) ctx = JSON.parse(hit);
  } catch {
    /* cache optional */
  }
  if (!ctx) {
    const key = await ApiKey.findOne({ keyHash: hash }).lean();
    if (!key || key.revokedAt) throw unauthorized('Invalid or revoked API key');
    const [env, project] = await Promise.all([Environment.findById(key.environment).lean(), Project.findById(key.project).lean()]);
    if (!env || !project) throw unauthorized('Invalid API key');
    ctx = {
      keyId: String(key._id),
      orgId: String(key.org),
      projectId: String(key.project),
      envId: String(key.environment),
      envType: env.type,
      scopes: key.scopes,
      ingestionEnabled: env.settings?.ingestionEnabled !== false,
      archived: !!project.archivedAt,
      strictEvents: !!project.settings?.strictEvents,
    };
    await redis.set(cacheKey, JSON.stringify(ctx), 'EX', 60).catch(() => {});
  }
  if (ctx.archived) throw forbidden('Project is archived');
  return ctx;
}

export async function invalidateApiKeyCache(keyHash) {
  await getRedis().del(rk('apikey', keyHash)).catch(() => {});
}

export async function invalidateProjectKeyCache(projectId) {
  const keys = await ApiKey.find({ project: projectId }).select('+keyHash').lean();
  if (keys.length) await getRedis().del(...keys.map((k) => rk('apikey', k.keyHash))).catch(() => {});
}

// ── Payload validation ──────────────────────────────────────────────────────
const MAX_PROPS_BYTES = 32 * 1024;
const props = z
  .record(z.any())
  .default({})
  .refine((p) => Object.keys(p).every((k) => !k.startsWith('$') || ['$feature', '$variant', '$current_url', '$referrer'].includes(k)), 'Property keys may not start with "$" except reserved keys')
  .refine((p) => Object.keys(p).every((k) => !k.includes('.') && k.length <= 64), 'Property keys must be ≤ 64 chars and must not contain "."')
  .refine((p) => JSON.stringify(p).length <= MAX_PROPS_BYTES, 'Properties exceed 32KB');

const identity = {
  distinctId: z.string().trim().min(1).max(200).optional(),
  userId: z.string().trim().min(1).max(200).optional(),
  anonymousId: z.string().trim().min(1).max(200).optional(),
};
const common = {
  ...identity,
  timestamp: z.union([z.string().datetime({ offset: true }), z.number().int().positive()]).optional(),
  messageId: z.string().trim().min(8).max(128).optional(),
  context: z.record(z.any()).optional(),
};

export const trackSchema = z.object({ type: z.literal('track').optional(), event: eventName, properties: props, ...common });
export const identifySchema = z.object({ type: z.literal('identify'), traits: props, ...common });
export const batchSchema = z.object({ batch: z.array(z.any()).min(1) });

function normalize(item, ctx, receivedAt) {
  const distinctId = item.distinctId || item.userId || item.anonymousId;
  if (!distinctId) return { error: 'One of distinctId, userId or anonymousId is required' };
  let ts = item.timestamp ? new Date(item.timestamp) : receivedAt;
  if (Number.isNaN(ts.getTime())) return { error: 'Invalid timestamp' };
  // Clamp clock skew: future events (> 1h) are rejected, very old (> 1y) are rejected.
  if (ts.getTime() > receivedAt.getTime() + 3600_000) return { error: 'Timestamp is too far in the future' };
  if (ts.getTime() < receivedAt.getTime() - 366 * 86400_000) return { error: 'Timestamp is older than one year' };
  const isIdentify = item.type === 'identify';
  return {
    value: {
      type: isIdentify ? 'identify' : 'track',
      name: isIdentify ? '$identify' : item.event,
      distinctId,
      anonymousId: item.userId && item.anonymousId ? item.anonymousId : undefined,
      properties: isIdentify ? {} : item.properties || {},
      traits: isIdentify ? item.traits || {} : undefined,
      context: item.context || {},
      timestamp: ts.toISOString(),
      receivedAt: receivedAt.toISOString(),
      messageId: item.messageId || `srv_${crypto.randomUUID()}`,
      clientMessageId: !!item.messageId,
    },
  };
}

const TYPE_CHECK = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  boolean: (v) => typeof v === 'boolean',
  object: (v) => v && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  any: () => true,
};

async function loadDefinitions(projectId) {
  const redis = getRedis();
  const key = rk('defs', projectId);
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit);
  } catch {
    /* ignore */
  }
  const defs = await EventDefinition.find({ project: projectId }).select('name properties status').lean();
  const map = Object.fromEntries(defs.map((d) => [d.name, { properties: d.properties, status: d.status }]));
  await redis.set(key, JSON.stringify(map), 'EX', 30).catch(() => {});
  return map;
}

export async function invalidateDefinitions(projectId) {
  await getRedis().del(rk('defs', String(projectId))).catch(() => {});
}

function checkAgainstDefinition(ev, def, strict) {
  if (ev.type === 'identify' || ev.name.startsWith('$')) return null;
  if (!def) return strict ? `Event "${ev.name}" is not defined in this project (strict mode)` : null;
  for (const p of def.properties || []) {
    const v = ev.properties[p.name];
    if (v === undefined || v === null) {
      if (p.required) return `Missing required property "${p.name}"`;
      continue;
    }
    if (!TYPE_CHECK[p.type || 'any'](v)) return `Property "${p.name}" must be of type ${p.type}`;
  }
  return null;
}

// Validates, de-duplicates and enqueues events. Returns per-item results.
export async function ingest(ctx, rawItems, { defaultType = 'track' } = {}) {
  const receivedAt = new Date();
  const defs = await loadDefinitions(ctx.projectId);
  const results = [];
  const accepted = [];
  const redis = getRedis();

  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i] && typeof rawItems[i] === 'object' ? { type: defaultType, ...rawItems[i] } : rawItems[i];
    const schema = raw?.type === 'identify' ? identifySchema : trackSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      results.push({ index: i, status: 'rejected', errors: formatZod(parsed.error) });
      continue;
    }
    const norm = normalize(parsed.data, ctx, receivedAt);
    if (norm.error) {
      results.push({ index: i, status: 'rejected', errors: [{ path: '', message: norm.error }] });
      continue;
    }
    const ev = norm.value;
    const defError = checkAgainstDefinition(ev, defs[ev.name], ctx.strictEvents);
    if (defError) {
      results.push({ index: i, status: 'rejected', messageId: ev.messageId, errors: [{ path: 'properties', message: defError }] });
      continue;
    }
    if (ev.clientMessageId) {
      // Idempotency: first writer wins for (environment, messageId) within the TTL window.
      const ok = await redis.set(rk('idem', ctx.envId, ev.messageId), '1', 'EX', config.ingest.idempotencyTtlSec, 'NX');
      if (!ok) {
        results.push({ index: i, status: 'duplicate', messageId: ev.messageId });
        continue;
      }
    }
    delete ev.clientMessageId;
    accepted.push(ev);
    results.push({ index: i, status: 'accepted', messageId: ev.messageId });
  }

  if (accepted.length) {
    await getQueue(QUEUES.ingest).add(
      'events',
      { orgId: ctx.orgId, projectId: ctx.projectId, envId: ctx.envId, apiKeyId: ctx.keyId, events: accepted },
      { attempts: 8, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 },
    );
  }

  const rejected = results.filter((r) => r.status === 'rejected').length;
  const date = receivedAt.toISOString().slice(0, 10);
  ApiUsage.updateOne(
    { environment: ctx.envId, date },
    { $inc: { requests: 1, events: accepted.length, rejected }, $setOnInsert: { project: ctx.projectId } },
    { upsert: true },
  ).catch(() => {});
  ApiKey.updateOne({ _id: ctx.keyId, $or: [{ lastUsedAt: null }, { lastUsedAt: { $lt: new Date(Date.now() - 60_000) } }] }, { lastUsedAt: receivedAt }).catch(() => {});

  return {
    accepted: accepted.length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    rejected,
    results,
  };
}

export function assertBatchSize(items) {
  if (items.length > config.ingest.maxBatch) {
    throw validationError([{ path: 'batch', message: `Batch may contain at most ${config.ingest.maxBatch} items` }]);
  }
}
