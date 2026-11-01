import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, workspace, ingest, drain, daysAgo } from './helpers.js';
import { Event, Profile, ApiKey } from '../src/models/index.js';

describe('event ingestion', () => {
  let ws;
  beforeAll(async () => {
    ws = await workspace('Ingest');
  });

  it('rejects missing, malformed and unknown keys', async () => {
    expect((await request(app).post('/v1/track').send({ event: 'a', distinctId: 'u' })).status).toBe(401);
    expect((await ingest('nope', '/track', { event: 'a', distinctId: 'u' })).status).toBe(401);
    expect((await ingest(`ft_dev_${'x'.repeat(32)}`, '/track', { event: 'a', distinctId: 'u' })).status).toBe(401);
  });

  it('accepts a single event and persists it with the right tenant scope', async () => {
    const res = await ingest(ws.apiKey, '/track', { event: 'user_signed_up', distinctId: 'u1', properties: { plan: 'pro' }, messageId: 'msg-single-0001' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'accepted', messageId: 'msg-single-0001' });
    await drain();
    const e = await Event.findOne({ messageId: 'msg-single-0001' }).lean();
    expect(String(e.org)).toBe(ws.org.id);
    expect(String(e.project)).toBe(ws.project.id);
    expect(String(e.environment)).toBe(ws.dev.id);
    expect(e.properties.plan).toBe('pro');
    const p = await Profile.findOne({ environment: ws.dev.id, distinctId: 'u1' }).lean();
    expect(p.eventCount).toBe(1);
  });

  it('de-duplicates by messageId (idempotency)', async () => {
    const body = { event: 'payment_completed', distinctId: 'u2', messageId: 'msg-dup-00001' };
    expect((await ingest(ws.apiKey, '/track', body)).body.status).toBe('accepted');
    expect((await ingest(ws.apiKey, '/track', body)).body.status).toBe('duplicate');
    await drain();
    expect(await Event.countDocuments({ messageId: 'msg-dup-00001' })).toBe(1);
  });

  it('replays responses for a repeated Idempotency-Key', async () => {
    const body = { batch: [{ event: 'x_evt', distinctId: 'u3' }] };
    const a = await ingest(ws.apiKey, '/batch', body, { 'Idempotency-Key': 'req-123' });
    const b = await ingest(ws.apiKey, '/batch', body, { 'Idempotency-Key': 'req-123' });
    expect(b.headers['idempotent-replayed']).toBe('true');
    expect(b.body).toEqual(a.body);
    await drain();
    expect(await Event.countDocuments({ name: 'x_evt', environment: ws.dev.id })).toBe(1);
  });

  it('validates events and reports per-item batch results', async () => {
    const res = await ingest(ws.apiKey, '/batch', {
      batch: [
        { event: 'ok_event', distinctId: 'u4', timestamp: daysAgo(1) },
        { distinctId: 'u4' },
        { event: 'bad', distinctId: 'u4', properties: { 'a.b': 1 } },
        { event: 'future', distinctId: 'u4', timestamp: new Date(Date.now() + 7200_000).toISOString() },
        { type: 'identify', distinctId: 'u4', traits: { email: 'u4@x.io', plan: 'team' } },
      ],
    });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(2);
    expect(res.body.rejected).toBe(3);
    expect(res.body.results[1].errors[0].path).toBe('event');
    await drain();
    const p = await Profile.findOne({ environment: ws.dev.id, distinctId: 'u4' }).lean();
    expect(p.traits).toMatchObject({ email: 'u4@x.io', plan: 'team' });
  });

  it('single invalid event returns 422 with details', async () => {
    const res = await ingest(ws.apiKey, '/track', { event: '', distinctId: 'u' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('enforces the batch size limit', async () => {
    const batch = Array.from({ length: 101 }, (_, i) => ({ event: 'e', distinctId: `u${i}` }));
    expect((await ingest(ws.apiKey, '/batch', { batch })).status).toBe(422);
  });

  it('enforces event definitions (required props, types) and strict mode', async () => {
    await ws.agent.post(`/api/projects/${ws.project.id}/event-definitions`).send({ name: 'order_placed', properties: [{ name: 'amount', type: 'number', required: true }] }).expect(201);
    const missing = await ingest(ws.apiKey, '/track', { event: 'order_placed', distinctId: 'u5', properties: {} });
    expect(missing.status).toBe(422);
    expect(missing.body.error.details[0].message).toMatch(/required property "amount"/);
    const wrongType = await ingest(ws.apiKey, '/track', { event: 'order_placed', distinctId: 'u5', properties: { amount: '12' } });
    expect(wrongType.status).toBe(422);
    expect((await ingest(ws.apiKey, '/track', { event: 'order_placed', distinctId: 'u5', properties: { amount: 12 } })).status).toBe(202);
    await ws.agent.patch(`/api/projects/${ws.project.id}`).send({ settings: { strictEvents: true } }).expect(200);
    const strict = await ingest(ws.apiKey, '/track', { event: 'never_defined', distinctId: 'u5' });
    expect(strict.status).toBe(422);
    await ws.agent.patch(`/api/projects/${ws.project.id}`).send({ settings: { strictEvents: false } }).expect(200);
  });

  it('auto-discovers new event names', async () => {
    await ingest(ws.apiKey, '/track', { event: 'brand_new_event', distinctId: 'u6' });
    await drain();
    const defs = await ws.agent.get(`/api/projects/${ws.project.id}/event-definitions?envId=${ws.dev.id}`);
    const d = defs.body.items.find((x) => x.name === 'brand_new_event');
    expect(d.status).toBe('discovered');
    expect(d.volume).toBe(1);
  });

  it('keeps environments isolated', async () => {
    const prodKey = (await ws.agent.post(`/api/projects/${ws.project.id}/api-keys`).send({ name: 'prod', envId: ws.prod.id })).body.key;
    expect(prodKey.startsWith('ft_live_')).toBe(true);
    await ingest(prodKey, '/track', { event: 'prod_only', distinctId: 'p1' });
    await drain();
    const dev = await ws.agent.get(`/api/projects/${ws.project.id}/events?envId=${ws.dev.id}&name=prod_only`);
    const prod = await ws.agent.get(`/api/projects/${ws.project.id}/events?envId=${ws.prod.id}&name=prod_only`);
    expect(dev.body.total).toBe(0);
    expect(prod.body.total).toBe(1);
  });

  it('revoked keys stop working immediately and secrets are never returned again', async () => {
    const created = await ws.agent.post(`/api/projects/${ws.project.id}/api-keys`).send({ name: 'temp', envId: ws.dev.id });
    const key = created.body.key;
    expect((await ingest(key, '/track', { event: 'a', distinctId: 'z' })).status).toBe(202);
    const list = await ws.agent.get(`/api/projects/${ws.project.id}/api-keys`);
    expect(JSON.stringify(list.body)).not.toContain(key);
    expect(list.body.items[0].maskedKey).toMatch(/•/);
    await ws.agent.post(`/api/projects/${ws.project.id}/api-keys/${created.body.id}/revoke`).expect(200);
    expect((await ingest(key, '/track', { event: 'a', distinctId: 'z' })).status).toBe(401);
    const stored = await ApiKey.findById(created.body.id).select('+keyHash').lean();
    expect(stored.keyHash).not.toContain(key);
    expect(stored.keyHash).toHaveLength(64);
  });

  it('regenerating issues a new key and revokes the old one', async () => {
    const created = await ws.agent.post(`/api/projects/${ws.project.id}/api-keys`).send({ name: 'rot', envId: ws.dev.id });
    const regen = await ws.agent.post(`/api/projects/${ws.project.id}/api-keys/${created.body.id}/regenerate`);
    expect(regen.status).toBe(201);
    expect((await ingest(created.body.key, '/track', { event: 'a', distinctId: 'z' })).status).toBe(401);
    expect((await ingest(regen.body.key, '/track', { event: 'a', distinctId: 'z' })).status).toBe(202);
  });

  it('archived projects reject ingestion', async () => {
    const other = await workspace('Archive');
    await other.agent.post(`/api/projects/${other.project.id}/archive`).send({ archived: true }).expect(200);
    expect((await ingest(other.apiKey, '/track', { event: 'a', distinctId: 'z' })).status).toBe(403);
  });

  it('rate limits per API key', async () => {
    const other = await workspace('Rate');
    let limited = null;
    for (let i = 0; i < 60 && !limited; i++) {
      const r = await ingest(other.apiKey, '/track', { event: 'spam', distinctId: 'z' });
      if (r.status === 429) limited = r;
    }
    expect(limited).not.toBeNull();
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});
