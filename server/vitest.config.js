import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      MONGODB_URI: process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/featuretrack_test',
      REDIS_URL: process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/1',
      ALLOW_PRIVATE_WEBHOOKS: 'true',
      RATE_LIMIT_INGEST_PER_MIN: '50',
      RATE_LIMIT_AUTH_PER_MIN: '1000',
    },
  },
});
