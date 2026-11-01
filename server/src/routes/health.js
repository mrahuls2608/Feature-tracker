import { Router } from 'express';
import mongoose from 'mongoose';
import { getRedis } from '../lib/redis.js';
import { getQueue, QUEUES } from '../lib/queue.js';

const r = Router();
const started = Date.now();

r.get('/', (_req, res) => res.json({ status: 'ok', uptimeSec: Math.round((Date.now() - started) / 1000) }));

// Readiness: verifies MongoDB, Redis and queue health. Returns 503 if a dependency is down.
r.get('/ready', async (_req, res) => {
  const checks = {};
  const time = async (name, fn) => {
    const t = Date.now();
    try {
      const detail = await fn();
      checks[name] = { status: 'ok', latencyMs: Date.now() - t, ...(detail || {}) };
    } catch (err) {
      checks[name] = { status: 'error', error: err.message };
    }
  };
  await Promise.all([
    time('mongodb', async () => {
      if (mongoose.connection.readyState !== 1) throw new Error('not connected');
      await mongoose.connection.db.admin().ping();
    }),
    time('redis', async () => {
      if ((await getRedis().ping()) !== 'PONG') throw new Error('unexpected ping reply');
    }),
    time('queues', async () => {
      const out = {};
      for (const q of [QUEUES.ingest, QUEUES.webhooks]) out[q] = await getQueue(q).getJobCounts('waiting', 'active', 'delayed', 'failed');
      return { counts: out };
    }),
  ]);
  const ok = Object.values(checks).every((c) => c.status === 'ok');
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
});

export default r;
