// Standalone worker process: `npm run worker`. Run several for horizontal scale.
import { connectDb, disconnectDb } from './lib/db.js';
import { startWorkers } from './workers.js';
import { closeQueues } from './lib/queue.js';
import { closeRedis } from './lib/redis.js';
import { logger } from './lib/logger.js';

await connectDb();
const w = await startWorkers({ concurrency: Number(process.env.WORKER_CONCURRENCY || 8) });

const shutdown = async (sig) => {
  logger.info({ sig }, 'worker shutting down');
  await w.close();
  await closeQueues();
  await closeRedis();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
