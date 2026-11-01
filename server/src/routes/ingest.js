import { Router } from 'express';
import { z } from 'zod';
import { ah, forbidden, validationError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { config } from '../config.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { authenticateApiKey, extractApiKey, ingest, assertBatchSize, batchSchema } from '../services/ingest.js';
import { flagsForEnv, evaluateFlag } from '../services/features.js';
import { getRedis, rk } from '../lib/redis.js';
import { sha256 } from '../lib/crypto.js';

const r = Router();

// API-key authentication for the public ingestion API.
const apiKeyAuth = (scope) => ah(async (req, _res, next) => {
  const ctx = await authenticateApiKey(extractApiKey(req));
  if (!ctx.scopes.includes(scope)) throw forbidden(`API key lacks the "${scope}" scope`);
  if (scope === 'ingest' && !ctx.ingestionEnabled) throw forbidden('Ingestion is disabled for this environment');
  req.ingest = ctx;
  next();
});

const limiter = rateLimit({ name: 'ingest', limit: config.rateLimits.ingestPerMinute, key: (req) => req.ingest?.keyId });

// Request-level idempotency via the Idempotency-Key header: replays return the original response.
const idempotent = (handler) => ah(async (req, res) => {
  const header = req.headers['idempotency-key'];
  if (!header) return handler(req, res);
  if (String(header).length > 200) throw validationError([{ path: 'Idempotency-Key', message: 'Header too long' }]);
  const key = rk('idemreq', req.ingest.envId, sha256(`${req.path}:${header}`));
  const redis = getRedis();
  const prior = await redis.get(key);
  if (prior) {
    const { status, body } = JSON.parse(prior);
    res.setHeader('Idempotent-Replayed', 'true');
    return res.status(status).json(body);
  }
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 500) redis.set(key, JSON.stringify({ status: res.statusCode, body }), 'EX', config.ingest.idempotencyTtlSec).catch(() => {});
    return json(body);
  };
  return handler(req, res);
});

function respond(res, result, single) {
  const status = result.accepted || result.duplicates ? 202 : 400;
  if (single) {
    const item = result.results[0];
    if (item.status === 'rejected') return res.status(422).json({ error: { code: 'validation_error', message: 'Event rejected', details: item.errors } });
    return res.status(202).json({ status: item.status, messageId: item.messageId });
  }
  res.status(status).json(result);
}

r.get('/ping', apiKeyAuth('ingest'), (req, res) => res.json({ ok: true, projectId: req.ingest.projectId, environmentId: req.ingest.envId, environment: req.ingest.envType }));

r.post('/track', apiKeyAuth('ingest'), limiter, idempotent(async (req, res) => {
  const result = await ingest(req.ingest, [req.body], { defaultType: 'track' });
  respond(res, result, true);
}));

r.post('/identify', apiKeyAuth('ingest'), limiter, idempotent(async (req, res) => {
  const result = await ingest(req.ingest, [{ ...req.body, type: 'identify' }], { defaultType: 'identify' });
  respond(res, result, true);
}));

r.post('/batch', apiKeyAuth('ingest'), limiter, idempotent(async (req, res) => {
  const { batch } = parse(batchSchema, req.body);
  assertBatchSize(batch);
  const result = await ingest(req.ingest, batch, { defaultType: 'track' });
  respond(res, result, false);
}));

// Feature flag evaluation for an end user.
r.post('/flags', apiKeyAuth('flags'), limiter, ah(async (req, res) => {
  const body = parse(z.object({ distinctId: z.string().min(1).max(200), properties: z.record(z.any()).default({}), keys: z.array(z.string()).max(200).optional() }), req.body);
  const features = await flagsForEnv(req.ingest.projectId, req.ingest.envId);
  const flags = {};
  const details = {};
  for (const f of features) {
    if (body.keys && !body.keys.includes(f.key)) continue;
    const ev = evaluateFlag(f, req.ingest.envId, body);
    flags[f.key] = ev.enabled;
    details[f.key] = { enabled: ev.enabled, reason: ev.reason };
  }
  res.json({ flags, details });
}));

export default r;
