import mongoose from 'mongoose';
import { Event, Profile, EventDefinition, Webhook, WebhookDelivery } from '../models/index.js';
import { publishLive } from '../lib/live.js';
import { bumpEnvVersion } from '../lib/cache.js';
import { getQueue, QUEUES } from '../lib/queue.js';
import { invalidateDefinitions } from './ingest.js';
import { logger } from '../lib/logger.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// Persists a batch of validated events and fans out side effects
// (profiles, event discovery, live stream, cache invalidation, webhooks).
// Safe to retry: inserts are idempotent on (environment, messageId) and
// side effects run only for newly inserted documents.
export async function processEventBatch({ orgId, projectId, envId, apiKeyId, events }) {
  const base = { org: oid(orgId), project: oid(projectId), environment: oid(envId) };
  const docs = events.map((e) => ({
    _id: new mongoose.Types.ObjectId(),
    ...base,
    name: e.name,
    distinctId: e.distinctId,
    properties: e.type === 'identify' ? { ...e.traits } : e.properties,
    context: e.context,
    timestamp: new Date(e.timestamp),
    receivedAt: new Date(e.receivedAt),
    messageId: e.messageId,
    apiKey: apiKeyId ? oid(apiKeyId) : undefined,
  }));

  let insertedIds = new Set(docs.map((d) => String(d._id)));
  try {
    await Event.insertMany(docs, { ordered: false, rawResult: false });
  } catch (err) {
    if (err?.code !== 11000 && !err?.writeErrors) throw err;
    const failed = new Set((err.writeErrors || []).filter((w) => w.code === 11000 || w.err?.code === 11000).map((w) => w.index ?? w.err?.index));
    const otherErrors = (err.writeErrors || []).filter((w) => (w.code ?? w.err?.code) !== 11000);
    if (otherErrors.length) throw err;
    insertedIds = new Set(docs.filter((_d, i) => !failed.has(i)).map((d) => String(d._id)));
  }
  const inserted = docs.filter((d) => insertedIds.has(String(d._id)));
  if (!inserted.length) return { inserted: 0 };

  // Profiles: one upsert per distinct user in the batch.
  const byUser = new Map();
  for (let i = 0; i < inserted.length; i++) {
    const d = inserted[i];
    const ev = events.find((e) => e.messageId === d.messageId);
    const u = byUser.get(d.distinctId) || { first: d.timestamp, last: d.timestamp, count: 0, traits: {}, lastEvent: d.name };
    if (d.timestamp < u.first) u.first = d.timestamp;
    if (d.timestamp >= u.last) {
      u.last = d.timestamp;
      u.lastEvent = d.name;
    }
    u.count++;
    if (ev?.type === 'identify') Object.assign(u.traits, ev.traits);
    byUser.set(d.distinctId, u);
  }
  const profileOps = [...byUser.entries()].map(([distinctId, u]) => {
    const set = { lastEvent: u.lastEvent };
    for (const [k, v] of Object.entries(u.traits)) if (!k.includes('.') && !k.startsWith('$')) set[`traits.${k}`] = v;
    return {
      updateOne: {
        filter: { environment: base.environment, distinctId },
        update: { $setOnInsert: { org: base.org, project: base.project }, $min: { firstSeenAt: u.first }, $max: { lastSeenAt: u.last }, $inc: { eventCount: u.count }, $set: set },
        upsert: true,
      },
    };
  });
  await Profile.bulkWrite(profileOps, { ordered: false });

  // Event discovery: unseen event names are registered as "discovered" definitions.
  const names = [...new Set(inserted.map((d) => d.name))];
  const stats = names.map((name) => {
    const ts = inserted.filter((d) => d.name === name).map((d) => d.timestamp);
    return { name, min: new Date(Math.min(...ts)), max: new Date(Math.max(...ts)) };
  });
  const defRes = await EventDefinition.bulkWrite(
    stats.map((s) => ({
      updateOne: {
        filter: { project: base.project, name: s.name },
        update: { $setOnInsert: { org: base.org, status: 'discovered', description: '' }, $min: { firstSeenAt: s.min }, $max: { lastSeenAt: s.max } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  if (defRes.upsertedCount) await invalidateDefinitions(projectId);

  await bumpEnvVersion(envId);

  const liveEvents = inserted.map((d) => ({
    id: String(d._id),
    name: d.name,
    distinctId: d.distinctId,
    properties: d.properties,
    context: d.context,
    messageId: d.messageId,
    timestamp: d.timestamp,
    receivedAt: d.receivedAt,
    environment: envId,
  }));
  await publishLive(envId, liveEvents).catch((err) => logger.warn({ err: err.message }, 'live publish failed'));

  await fanOutWebhooks({ projectId, envId, events: liveEvents });
  return { inserted: inserted.length };
}

export async function fanOutWebhooks({ projectId, envId, events }) {
  const hooks = await Webhook.find({
    project: projectId,
    enabled: true,
    $or: [{ environment: null }, { environment: { $exists: false } }, { environment: envId }],
  }).lean();
  if (!hooks.length) return;
  const deliveries = [];
  for (const hook of hooks) {
    for (const ev of events) {
      if (!hook.events.includes('*') && !hook.events.includes(ev.name)) continue;
      deliveries.push({
        webhook: hook._id,
        project: hook.project,
        eventType: 'event.ingested',
        eventName: ev.name,
        eventId: ev.id,
        payload: { type: 'event.ingested', createdAt: new Date().toISOString(), data: { ...ev, projectId: String(projectId), environmentId: String(envId) } },
      });
    }
  }
  if (!deliveries.length) return;
  const created = await WebhookDelivery.insertMany(deliveries);
  await getQueue(QUEUES.webhooks).addBulk(created.map((d) => deliveryJob(d._id)));
}

export function deliveryJob(deliveryId) {
  return {
    name: 'deliver',
    data: { deliveryId: String(deliveryId) },
    opts: { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  };
}
