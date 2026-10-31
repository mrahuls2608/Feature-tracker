import request from 'supertest';
import { createApp } from '../src/app.js';
import { getQueue, QUEUES } from '../src/lib/queue.js';

export const app = createApp();
let n = 0;

export async function signup(name = 'User') {
  const agent = request.agent(app);
  const email = `${name.toLowerCase().replace(/\s/g, '')}${Date.now()}${n++}@test.io`;
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'Str0ngPassw0rd' });
  if (res.status !== 201) throw new Error(`signup failed ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email, user: res.body.user };
}

// Org + project + dev API key for a fresh user.
export async function workspace(name = 'Owner') {
  const owner = await signup(name);
  const org = (await owner.agent.post('/api/orgs').send({ name: `${name} Org` })).body;
  const project = (await owner.agent.post(`/api/orgs/${org.id}/projects`).send({ name: 'Commerce Platform' })).body;
  const dev = project.environments.find((e) => e.type === 'development');
  const prod = project.environments.find((e) => e.type === 'production');
  const key = (await owner.agent.post(`/api/projects/${project.id}/api-keys`).send({ name: 'test', envId: dev.id })).body;
  return { ...owner, org, project, dev, prod, apiKey: key.key, keyId: key.id };
}

export const ingest = (key, path, body, headers = {}) => request(app).post(`/v1${path}`).set('Authorization', `Bearer ${key}`).set(headers).send(body);

// Waits until the ingest/webhook queues are idle.
export async function drain(queues = [QUEUES.ingest]) {
  for (let i = 0; i < 200; i++) {
    const counts = await Promise.all(queues.map((q) => getQueue(q).getJobCounts('waiting', 'active', 'delayed', 'prioritized')));
    if (counts.every((c) => !c.waiting && !c.active && !c.delayed && !c.prioritized)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('queues did not drain');
}

export async function waitFor(fn, { timeout = 15000, interval = 100 } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, interval));
  }
}

export const daysAgo = (d, h = 12) => {
  const t = new Date();
  t.setUTCHours(h, 0, 0, 0);
  return new Date(t.getTime() - d * 86400000).toISOString();
};
