import { getRedis, getSubscriber, rk } from './redis.js';
import { logger } from './logger.js';

const CHANNEL = () => rk('live');

// Called by workers after events are persisted.
export async function publishLive(envId, events) {
  if (!events.length) return;
  await getRedis().publish(CHANNEL(), JSON.stringify({ envId: String(envId), events }));
}

// Called by API processes hosting Socket.IO; relays to rooms named env:<id>.
export async function subscribeLive(onMessage) {
  const sub = getSubscriber();
  await sub.subscribe(CHANNEL());
  sub.on('message', (channel, message) => {
    if (channel !== CHANNEL()) return;
    try {
      onMessage(JSON.parse(message));
    } catch (err) {
      logger.warn({ err: err.message }, 'bad live message');
    }
  });
}
