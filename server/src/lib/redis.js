import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

let client;
let subscriber;

export const rk = (...parts) => [config.redisPrefix, ...parts].join(':');

export function getRedis() {
  if (!client) {
    client = new Redis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
    client.on('error', (err) => logger.error({ err: err.message }, 'redis error'));
  }
  return client;
}

// BullMQ requires dedicated connections; it duplicates from this factory.
export function createRedisConnection() {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

export function getSubscriber() {
  if (!subscriber) {
    subscriber = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    subscriber.on('error', (err) => logger.error({ err: err.message }, 'redis subscriber error'));
  }
  return subscriber;
}

export async function closeRedis() {
  await Promise.allSettled([client?.quit(), subscriber?.quit()]);
  client = undefined;
  subscriber = undefined;
}
