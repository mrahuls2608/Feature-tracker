import { getRedis, rk } from '../lib/redis.js';
import { tooMany } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// Fixed-window rate limiter backed by Redis. Fails open if Redis is unavailable.
export function rateLimit({ name, limit, windowSec = 60, key }) {
  return async (req, res, next) => {
    const id = key(req);
    if (!id) return next();
    const windowId = Math.floor(Date.now() / 1000 / windowSec);
    const redisKey = rk('rl', name, id, windowId);
    try {
      const results = await getRedis().multi().incr(redisKey).expire(redisKey, windowSec + 1).exec();
      const count = results[0][1];
      const remaining = Math.max(0, limit - count);
      const reset = (windowId + 1) * windowSec;
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', reset);
      if (count > limit) {
        const retryAfter = Math.max(1, reset - Math.floor(Date.now() / 1000));
        res.setHeader('Retry-After', retryAfter);
        return next(tooMany(retryAfter));
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'rate limiter unavailable');
    }
    next();
  };
}
