import mongoose from 'mongoose';
import { beforeAll, afterAll } from 'vitest';
import { connectDb } from '../src/lib/db.js';
import { getRedis, closeRedis } from '../src/lib/redis.js';
import { startWorkers } from '../src/workers.js';
import { closeQueues } from '../src/lib/queue.js';

let workers;
beforeAll(async () => {
  await connectDb();
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await getRedis().flushdb();
  workers = await startWorkers({ concurrency: 2 });
});

afterAll(async () => {
  await workers?.close();
  await closeQueues();
  await closeRedis();
  await mongoose.disconnect();
});
