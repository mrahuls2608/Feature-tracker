// Security tests: attack-style requests against the running app (real MongoDB + Redis).
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, workspace, signup, ingest, drain } from './helpers.js';
import { config } from '../src/config.js';
import { assertSafeUrl } from '../src/services/webhooks.js';
import { User } from '../src/models/index.js';

describe('security', () => {
  let ws;
  let other;
  beforeAll(async () => {
    ws = await workspace('Sec');
    other = await workspace('Attacker');
  });

  describe('transport & headers', () => {
    it('sets hardening headers and hides the framework', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('auth cookies are httpOnly and SameSite', async () => {
      const res = await request(app).post('/api/auth/register').send({ name: 'C', email: `cookie${Date.now()}@t.io`, password: 'Str0ngPassw0rd' });
      const cookies = res.headers['set-cookie'].join(';');
      expect(cookies).toMatch(/ft_at=.*HttpOnly/i);
      expect(cookies).toMatch(/SameSite=Lax/i);
      expect(cookies).toMatch(/ft_rt=.*Path=\/api\/auth/i);
    });

    it('only allows credentialed CORS from the configured web origin', async () => {
      const good = await request(app).options('/api/orgs').set('Origin', config.webOrigin[0]).set('Access-Control-Request-Method', 'POST');
      expect(good.headers['access-control-allow-origin']).toBe(config.webOrigin[0]);
      const evil = await request(app).options('/api/orgs').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('authentication attacks', () => {
    it('rejects tampered, unsigned and wrong-type tokens', async () => {
      const me = await ws.agent.get('/api/auth/me');
      const cookie = (await request(app).post('/api/auth/login').send({ email: ws.email, password: 'Str0ngPassw0rd' })).headers['set-cookie'].find((c) => c.startsWith('ft_at='));
      const token = cookie.split(';')[0].slice(6);
      const [h, p, s] = token.split('.');
      const tampered = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: other.user.id })).toString('base64url')}.${s}`;
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tampered}`)).status).toBe(401);
      const none = jwt.sign({ sub: me.body.user.id, sid: me.body.sessionId, typ: 'access' }, '', { algorithm: 'none', issuer: 'featuretrack' });
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${none}`)).status).toBe(401);
      const wrongSecret = jwt.sign({ sub: me.body.user.id, sid: me.body.sessionId, typ: 'access' }, 'guessed-secret', { issuer: 'featuretrack' });
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${wrongSecret}`)).status).toBe(401);
      // A socket token must not work as an access token (token-type confusion).
      const socketToken = (await ws.agent.post('/api/auth/socket-token')).body.token;
      expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${socketToken}`)).status).toBe(401);
    });

    it('a rotated refresh token cannot be reused', async () => {
      const { email } = await signup('Rotate');
      const login = await request(app).post('/api/auth/login').send({ email, password: 'Str0ngPassw0rd' });
      const rt = login.headers['set-cookie'].find((c) => c.startsWith('ft_rt=')).split(';')[0];
      expect((await request(app).post('/api/auth/refresh').set('Cookie', rt)).status).toBe(200);
      expect((await request(app).post('/api/auth/refresh').set('Cookie', rt)).status).toBe(401);
    });

    it('logout revokes the session server-side', async () => {
      const { agent } = await signup('Logout');
      await agent.post('/api/auth/logout').expect(200);
      expect((await agent.get('/api/auth/me')).status).toBe(401);
    });

    it('API keys cannot be used on the dashboard API, sessions cannot ingest', async () => {
      expect((await request(app).get('/api/orgs').set('Authorization', `Bearer ${ws.apiKey}`)).status).toBe(401);
      expect((await ws.agent.post('/v1/track').send({ event: 'x', distinctId: 'u' })).status).toBe(401);
    });
  });

  describe('injection', () => {
    it('blocks NoSQL operator injection in login', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
      expect(res.status).toBe(422);
    });

    it('blocks operator injection through analytics filters and breakdowns', async () => {
      const bad = encodeURIComponent(JSON.stringify([{ property: '$where', operator: 'eq', value: 'sleep(1000)' }]));
      // "$where" passes the key regex only as a literal top-level-safe name under properties.*, so check nested-path attempts:
      const nested = encodeURIComponent(JSON.stringify([{ property: 'a.$ne', operator: 'eq', value: 1 }]));
      expect((await ws.agent.get(`/api/projects/${ws.project.id}/analytics/overview?envId=${ws.dev.id}&filters=${nested}`)).status).toBe(400);
      const ok = await ws.agent.get(`/api/projects/${ws.project.id}/analytics/overview?envId=${ws.dev.id}&filters=${bad}`);
      expect(ok.status).toBe(200); // treated as an ordinary property name under properties.$where — no operator executed
      expect((await ws.agent.get(`/api/projects/${ws.project.id}/analytics/trends?envId=${ws.dev.id}&breakdown=${encodeURIComponent('a.b')}`)).status).toBe(400);
    });

    it('rejects dotted / $-prefixed property keys at ingestion', async () => {
      const res = await ingest(ws.apiKey, '/batch', { batch: [{ event: 'e', distinctId: 'u', properties: { 'a.b': 1 } }, { event: 'e', distinctId: 'u', properties: { $set: 1 } }] });
      expect(res.body.rejected).toBe(2);
    });

    it('escapes regex input in searches (no ReDoS / regex injection)', async () => {
      const res = await ws.agent.get(`/api/projects/${ws.project.id}/users?envId=${ws.dev.id}&q=${encodeURIComponent('(a+)+$')}`);
      expect(res.status).toBe(200);
    });

    it('stores XSS payloads as inert data (React escapes on render)', async () => {
      const payload = '<img src=x onerror=alert(1)>';
      await ingest(ws.apiKey, '/track', { event: 'xss_test', distinctId: payload, properties: { note: payload } });
      await drain();
      const res = await ws.agent.get(`/api/projects/${ws.project.id}/events?envId=${ws.dev.id}&name=xss_test`);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body.items[0].properties.note).toBe(payload);
    });
  });

  describe('CSRF & request hygiene', () => {
    it('rejects form-encoded state-changing requests', async () => {
      const res = await ws.agent.post(`/api/orgs/${ws.org.id}/projects`).type('form').send({ name: 'csrf' });
      expect(res.status).toBe(403);
    });

    it('rejects oversized and malformed bodies cleanly', async () => {
      const big = { batch: [{ event: 'e', distinctId: 'u', properties: { blob: 'x'.repeat(1_100_000) } }] };
      expect((await ingest(ws.apiKey, '/batch', big)).status).toBe(413);
      const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('invalid_json');
    });

    it('error responses never leak stack traces', async () => {
      const res = await request(app).get('/api/projects/not-an-id').set('Cookie', 'ft_at=garbage');
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:\d+/);
    });
  });

  describe('authorization (IDOR & mass assignment)', () => {
    it('cannot read or act on another tenant’s resources by id', async () => {
      const hook = await ws.agent.post(`/api/projects/${ws.project.id}/webhooks`).send({ url: 'http://127.0.0.1:9/x' });
      expect((await other.agent.get(`/api/projects/${ws.project.id}/webhooks/${hook.body.id}`)).status).toBe(404);
      // own project id + victim resource id
      expect((await other.agent.get(`/api/projects/${other.project.id}/webhooks/${hook.body.id}`)).status).toBe(404);
      expect((await other.agent.post(`/api/projects/${other.project.id}/api-keys/${ws.keyId}/revoke`)).status).toBe(404);
      expect((await other.agent.patch(`/api/orgs/${ws.org.id}`).send({ name: 'pwned' })).status).toBe(404);
      const ev = await ws.agent.get(`/api/projects/${ws.project.id}/events?envId=${ws.dev.id}&limit=1`);
      if (ev.body.items[0]) expect((await other.agent.get(`/api/projects/${other.project.id}/events/${ev.body.items[0].id}?envId=${other.dev.id}`)).status).toBe(404);
    });

    it('ignores privileged fields in profile updates (mass assignment)', async () => {
      const { agent, email } = await signup('Mass');
      await agent.patch('/api/auth/me').send({ name: 'Mass', passwordHash: 'x', role: 'owner', _id: '64b000000000000000000001' }).expect(200);
      const u = await User.findOne({ email }).select('+passwordHash').lean();
      expect(u.passwordHash).not.toBe('x');
      expect(u.role).toBeUndefined();
    });

    it('cannot move a project to another organization via PATCH', async () => {
      await ws.agent.patch(`/api/projects/${ws.project.id}`).send({ org: other.org.id, name: 'Commerce Platform' }).expect(200);
      expect((await ws.agent.get(`/api/projects/${ws.project.id}`)).body.orgId).toBe(ws.org.id);
    });

    it('live stream refuses to subscribe to environments you cannot access', async () => {
      // Exercised through the same membership check used by the socket handler.
      const { projectRole } = await import('../src/middleware/rbac.js');
      expect(projectRole({ access: 'restricted', members: [] }, 'viewer', 'x')).toBeNull();
    });
  });

  describe('secrets', () => {
    it('never returns password hashes, key hashes or webhook secrets after creation', async () => {
      const keys = await ws.agent.get(`/api/projects/${ws.project.id}/api-keys`);
      const hooks = await ws.agent.get(`/api/projects/${ws.project.id}/webhooks`);
      const me = await ws.agent.get('/api/auth/me');
      const all = JSON.stringify([keys.body, hooks.body, me.body]);
      expect(all).not.toMatch(/keyHash|passwordHash|secretEncrypted|ft_(dev|stg|live)_[A-Za-z0-9_-]{30,}|whsec_[A-Za-z0-9_-]{20,}/);
    });
  });

  describe('SSRF protection for webhooks', () => {
    it('blocks private, loopback and link-local targets when enforcement is on', async () => {
      const prev = config.allowPrivateWebhooks;
      config.allowPrivateWebhooks = false;
      try {
        for (const url of ['http://127.0.0.1/x', 'http://localhost/x', 'http://10.0.0.5/x', 'http://192.168.1.1/x', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/x']) {
          await expect(assertSafeUrl(url)).rejects.toThrow();
        }
        await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow();
        await expect(assertSafeUrl('http://93.184.216.34/hook')).resolves.toBeTruthy();
      } finally {
        config.allowPrivateWebhooks = prev;
      }
    });
  });
});

describe('CSRF on body-less actions', () => {
  it('rejects an empty form POST to a destructive endpoint', async () => {
    const ws = await workspace('Csrf');
    const res = await ws.agent.post(`/api/projects/${ws.project.id}/api-keys/${ws.keyId}/revoke`).set('Content-Type', 'application/x-www-form-urlencoded').send('');
    expect(res.status).toBe(403);
    const text = await ws.agent.post('/api/auth/sessions/revoke-others').set('Content-Type', 'text/plain').send('x');
    expect(text.status).toBe(403);
    // The legitimate client (no body, no content-type) still works.
    expect((await ws.agent.post(`/api/projects/${ws.project.id}/api-keys/${ws.keyId}/revoke`)).status).toBe(200);
  });
});
