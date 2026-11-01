import { Queue } from 'bullmq';
import { createRedisConnection } from './redis.js';
import { config } from '../config.js';

export const QUEUES = { ingest: 'ingest', webhooks: 'webhooks', maintenance: 'maintenance' };
const queues = {};
let connection;

export function conn() {
  if (!connection) connection = createRedisConnection();
  return connection;
}

export function getQueue(name) {
  if (!queues[name]) queues[name] = new Queue(name, { connection: conn(), prefix: `${config.redisPrefix}:bull` });
  return queues[name];
}

export async function closeQueues() {
  await Promise.allSettled(Object.values(queues).map((q) => q.close()));
  for (const k of Object.keys(queues)) delete queues[k];
  await connection?.quit().catch(() => {});
  connection = undefined;
}
