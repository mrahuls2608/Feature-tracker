import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './lib/db.js';
import { attachSocket } from './socket.js';
import { startWorkers } from './workers.js';
import { closeQueues } from './lib/queue.js';
import { closeRedis } from './lib/redis.js';
import { logger } from './lib/logger.js';

await connectDb();
const app = createApp();
const server = http.createServer(app);
const io = await attachSocket(server);
const workers = config.runWorkersInline ? await startWorkers() : null;

server.listen(config.port, () => logger.info({ port: config.port, inlineWorkers: !!workers }, 'FeatureTrack API listening'));

let shuttingDown = false;
async function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ sig }, 'shutting down');
  server.close();
  io.close();
  await workers?.close();
  await closeQueues();
  await closeRedis();
  await disconnectDb();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
