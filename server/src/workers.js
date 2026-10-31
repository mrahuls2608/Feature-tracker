import { Worker } from 'bullmq';
import { config } from './config.js';
import { createRedisConnection } from './lib/redis.js';
import { QUEUES, getQueue } from './lib/queue.js';
import { processEventBatch } from './services/processor.js';
import { attemptDelivery } from './services/webhooks.js';
import { applyRetention } from './services/retention.js';
import { logger } from './lib/logger.js';

const prefix = `${config.redisPrefix}:bull`;

export async function startWorkers({ concurrency = 4 } = {}) {
  const workers = [
    new Worker(QUEUES.ingest, (job) => processEventBatch(job.data), { connection: createRedisConnection(), prefix, concurrency }),
    new Worker(
      QUEUES.webhooks,
      async (job) => {
        const final = job.attemptsMade + 1 >= (job.opts.attempts || 1);
        return attemptDelivery(job.data.deliveryId, { final });
      },
      { connection: createRedisConnection(), prefix, concurrency: 8 },
    ),
    new Worker(QUEUES.maintenance, async (job) => (job.name === 'retention' ? applyRetention() : null), { connection: createRedisConnection(), prefix, concurrency: 1 }),
  ];
  for (const w of workers) {
    w.on('failed', (job, err) => logger.warn({ queue: w.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'job failed'));
    w.on('error', (err) => logger.error({ queue: w.name, err: err.message }, 'worker error'));
  }
  if (!config.isTest) {
    await getQueue(QUEUES.maintenance).upsertJobScheduler('retention-hourly', { every: 3600_000 }, { name: 'retention' });
  }
  logger.info('workers started');
  return {
    workers,
    close: () => Promise.all(workers.map((w) => w.close())),
  };
}
