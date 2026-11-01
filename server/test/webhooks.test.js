import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
import { workspace, ingest, drain, waitFor } from './helpers.js';
import { QUEUES } from '../src/lib/queue.js';
import { applyRetention } from '../src/services/retention.js';
import { Event, Organization } from '../src/models/index.js';

describe('webhooks', () => {
  let ws;
  let server;
  let port;
  const received = [];
  let failNext = 0;
  beforeAll(async () => {
    ws = await workspace('Hooks');
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        if (failNext > 0) {
          failNext--;
          res.writeHead(500).end('boom');
        } else res.writeHead(200).end('ok');
      });
    });
    await new Promise((r) => server.listen(0, r));
    port = server.address().port;
  });
  afterAll(() => server.close());

  it('delivers signed payloads for subscribed events only', async () => {
    const hook = await ws.agent.post(`/api/projects/${ws.project.id}/webhooks`).send({ url: `http://127.0.0.1:${port}/hook`, events: ['payment_completed'] });
    expect(hook.status).toBe(201);
    expect(hook.body.secret).toMatch(/^whsec_/);
    const listed = await ws.agent.get(`/api/projects/${ws.project.id}/webhooks`);
    expect(JSON.stringify(listed.body)).not.toContain(hook.body.secret);

    await ingest(ws.apiKey, '/batch', { batch: [{ event: 'payment_completed', distinctId: 'w1', properties: { amount: 5 } }, { event: 'ignored_event', distinctId: 'w1' }] });
    await drain();
    await waitFor(() => received.length >= 1);
    await drain([QUEUES.webhooks]);
    expect(received).toHaveLength(1);
    const { headers, body } = received[0];
    const { t, v1 } = Object.fromEntries(headers['x-featuretrack-signature'].split(',').map((p) => p.split('=')));
    const expected = crypto.createHmac('sha256', hook.body.secret).update(`${t}.${body}`).digest('hex');
    expect(v1).toBe(expected);
    expect(JSON.parse(body).data.name).toBe('payment_completed');

    const deliveries = await ws.agent.get(`/api/projects/${ws.project.id}/webhooks/${hook.body.id}/deliveries`);
    expect(deliveries.body.items[0].status).toBe('succeeded');
    expect(deliveries.body.items[0].attempts[0].responseStatus).toBe(200);
    expect(JSON.stringify(deliveries.body)).not.toContain(hook.body.secret);
  });

  it('retries failed deliveries and supports manual retry', async () => {
    const hook = (await ws.agent.post(`/api/projects/${ws.project.id}/webhooks`).send({ url: `http://127.0.0.1:${port}/flaky`, events: ['*'] })).body;
    failNext = 1;
    const test = await ws.agent.post(`/api/projects/${ws.project.id}/webhooks/${hook.id}/test`);
    expect(test.status).toBe(202);
    const d = await waitFor(async () => {
      const r = await ws.agent.get(`/api/projects/${ws.project.id}/webhooks/${hook.id}/deliveries`);
      return r.body.items[0]?.status === 'retrying' && r.body.items[0];
    });
    expect(d.attempts[0].responseStatus).toBe(500);
    // manual retry is refused while a retry is scheduled
    expect((await ws.agent.post(`/api/projects/${ws.project.id}/webhooks/${hook.id}/deliveries/${d.id}/retry`)).status).toBe(400);
  }, 30000);

  it('disabled webhooks do not receive events', async () => {
    const hook = (await ws.agent.post(`/api/projects/${ws.project.id}/webhooks`).send({ url: `http://127.0.0.1:${port}/off`, events: ['*'], enabled: false })).body;
    await ingest(ws.apiKey, '/track', { event: 'any', distinctId: 'w2' });
    await drain();
    const r = await ws.agent.get(`/api/projects/${ws.project.id}/webhooks/${hook.id}/deliveries`);
    expect(r.body.total).toBe(0);
  });

  it('rejects non-http URLs', async () => {
    expect((await ws.agent.post(`/api/projects/${ws.project.id}/webhooks`).send({ url: 'ftp://example.com/x' })).status).toBe(400);
  });
});

describe('data retention', () => {
  it('deletes events older than the org retention period', async () => {
    const ws = await workspace('Retention');
    const old = new Date(Date.now() - 20 * 86400000).toISOString();
    await ingest(ws.apiKey, '/batch', { batch: [{ event: 'old', distinctId: 'r', timestamp: old }, { event: 'new', distinctId: 'r' }] });
    await drain();
    await ws.agent.patch(`/api/orgs/${ws.org.id}`).send({ settings: { retentionDays: 7 } }).expect(200);
    expect((await Organization.findById(ws.org.id)).settings.retentionDays).toBe(7);
    await applyRetention();
    expect(await Event.countDocuments({ environment: ws.dev.id, name: 'old' })).toBe(0);
    expect(await Event.countDocuments({ environment: ws.dev.id, name: 'new' })).toBe(1);
  });
});
