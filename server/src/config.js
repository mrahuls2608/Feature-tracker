import 'dotenv/config';

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

function required(name, fallback) {
  const v = env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required env var ${name}`);
  return v;
}

const devSecret = 'dev-only-insecure-secret-change-me-0123456789abcdef';

export const config = {
  isProd,
  isTest,
  port: Number(env.PORT || 4000),
  mongoUrl: required('MONGODB_URI', isProd ? undefined : 'mongodb://127.0.0.1:27017/featuretrack'),
  redisUrl: required('REDIS_URL', isProd ? undefined : 'redis://127.0.0.1:6379'),
  jwtSecret: required('JWT_SECRET', isProd ? undefined : devSecret),
  // 32-byte key (hex or any string, hashed to 32 bytes) used to encrypt webhook secrets at rest
  encryptionKey: required('ENCRYPTION_KEY', isProd ? undefined : devSecret),
  webOrigin: (env.WEB_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()),
  publicApiUrl: env.PUBLIC_API_URL || `http://localhost:${env.PORT || 4000}`,
  accessTokenTtlSec: Number(env.ACCESS_TOKEN_TTL_SEC || 15 * 60),
  refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS || 30),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  runWorkersInline: env.RUN_WORKERS_INLINE ? env.RUN_WORKERS_INLINE === 'true' : true,
  allowPrivateWebhooks: env.ALLOW_PRIVATE_WEBHOOKS ? env.ALLOW_PRIVATE_WEBHOOKS === 'true' : !isProd,
  redisPrefix: env.REDIS_PREFIX || (isTest ? 'fttest' : 'ft'),
  rateLimits: {
    ingestPerMinute: Number(env.RATE_LIMIT_INGEST_PER_MIN || 1200),
    authPerMinute: Number(env.RATE_LIMIT_AUTH_PER_MIN || 30),
    apiPerMinute: Number(env.RATE_LIMIT_API_PER_MIN || 900),
  },
  ingest: {
    maxBatch: Number(env.INGEST_MAX_BATCH || 100),
    idempotencyTtlSec: Number(env.IDEMPOTENCY_TTL_SEC || 24 * 3600),
  },
  logLevel: env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
};
