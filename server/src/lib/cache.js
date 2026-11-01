import crypto from 'node:crypto';
import { getRedis, rk } from './redis.js';
import { logger } from './logger.js';

// Versioned cache: every processed event batch bumps the environment version,
// which implicitly invalidates all cached analytics for that environment.
export async function bumpEnvVersion(envId) {
  await getRedis().incr(rk('cachever', String(envId)));
}

export async function cached(envId, namespace, params, ttlSec, compute) {
  const redis = getRedis();
  try {
    const ver = (await redis.get(rk('cachever', String(envId)))) || '0';
    const hash = crypto.createHash('sha1').update(JSON.stringify(params)).digest('hex');
    const key = rk('cache', String(envId), ver, namespace, hash);
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit);
    const value = await compute();
    await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    return value;
  } catch (err) {
    if (err?.status) throw err;
    logger.warn({ err: err.message }, 'cache unavailable, computing directly');
    return compute();
  }
}
