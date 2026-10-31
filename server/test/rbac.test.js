import { describe, it, expect, beforeAll } from 'vitest';
import { signup, workspace, app } from './helpers.js';
import request from 'supertest';

async function join(ws, role) {
  const member = await signup(role);
  const inv = await ws.agent.post(`/api/orgs/${ws.org.id}/invitations`).send({ email: member.email, role });
  expect(inv.status).toBe(201);
  const token = inv.body.inviteUrl.split('/invite/')[1];
  const preview = await request(app).get(`/api/public/invitations/${token}`);
  expect(preview.body.organization.name).toBe(ws.org.name);
  await member.agent.post(`/api/invitations/token/${token}/accept`).expect(200);
  return member;
}

describe('organizations, roles and isolation', () => {
  let ws;
  let viewer;
  let developer;
  let admin;
  let outsider;
  beforeAll(async () => {
    ws = await workspace('Acme');
    viewer = await join(ws, 'viewer');
    developer = await join(ws, 'developer');
    admin = await join(ws, 'admin');
    outsider = await workspace('Other');
  });

  it('creates three isolated environments per project', () => {
    expect(ws.project.environments.map((e) => e.type)).toEqual(['development', 'staging', 'production']);
  });

  it('lists members with roles', async () => {
    const res = await ws.agent.get(`/api/orgs/${ws.org.id}/members`);
    expect(res.body.items.map((m) => m.role).sort()).toEqual(['admin', 'developer', 'owner', 'viewer']);
  });

  it('viewer can read analytics but cannot mutate', async () => {
    expect((await viewer.agent.get(`/api/projects/${ws.project.id}/analytics/overview?envId=${ws.dev.id}`)).status).toBe(200);
    expect((await viewer.agent.post(`/api/projects/${ws.project.id}/features`).send({ key: 'x-feature', name: 'X feature' })).status).toBe(403);
    expect((await viewer.agent.get(`/api/projects/${ws.project.id}/api-keys`)).status).toBe(403);
    expect((await viewer.agent.post(`/api/projects/${ws.project.id}/api-keys`).send({ name: 'k', envId: ws.dev.id })).status).toBe(403);
    expect((await viewer.agent.post(`/api/orgs/${ws.org.id}/invitations`).send({ email: 'a@b.io', role: 'viewer' })).status).toBe(403);
    expect((await viewer.agent.get(`/api/orgs/${ws.org.id}/audit-logs`)).status).toBe(403);
  });

  it('developer manages integrations but not members or projects', async () => {
    expect((await developer.agent.post(`/api/projects/${ws.project.id}/api-keys`).send({ name: 'dev key', envId: ws.dev.id })).status).toBe(201);
    expect((await developer.agent.post(`/api/projects/${ws.project.id}/features`).send({ key: 'dev-feature', name: 'Dev feature' })).status).toBe(201);
    expect((await developer.agent.post(`/api/orgs/${ws.org.id}/projects`).send({ name: 'Nope' })).status).toBe(403);
    expect((await developer.agent.patch(`/api/projects/${ws.project.id}`).send({ name: 'Renamed' })).status).toBe(403);
  });

  it('admin manages members but cannot grant owner', async () => {
    const members = (await admin.agent.get(`/api/orgs/${ws.org.id}/members`)).body.items;
    const v = members.find((m) => m.role === 'viewer');
    expect((await admin.agent.patch(`/api/orgs/${ws.org.id}/members/${v.id}`).send({ role: 'developer' })).status).toBe(200);
    expect((await admin.agent.patch(`/api/orgs/${ws.org.id}/members/${v.id}`).send({ role: 'owner' })).status).toBe(403);
    await admin.agent.patch(`/api/orgs/${ws.org.id}/members/${v.id}`).send({ role: 'viewer' }).expect(200);
    const owner = members.find((m) => m.role === 'owner');
    expect((await admin.agent.delete(`/api/orgs/${ws.org.id}/members/${owner.id}`)).status).toBe(403);
  });

  it('last owner cannot be demoted', async () => {
    const owner = (await ws.agent.get(`/api/orgs/${ws.org.id}/members`)).body.items.find((m) => m.role === 'owner');
    expect((await ws.agent.patch(`/api/orgs/${ws.org.id}/members/${owner.id}`).send({ role: 'admin' })).status).toBe(400);
  });

  it('isolates organizations: outsiders get 404 everywhere', async () => {
    expect((await outsider.agent.get(`/api/orgs/${ws.org.id}`)).status).toBe(404);
    expect((await outsider.agent.get(`/api/projects/${ws.project.id}`)).status).toBe(404);
    expect((await outsider.agent.get(`/api/projects/${ws.project.id}/events?envId=${ws.dev.id}`)).status).toBe(404);
    // using your own project id with another project's environment
    expect((await outsider.agent.get(`/api/projects/${outsider.project.id}/analytics/overview?envId=${ws.dev.id}`)).status).toBe(404);
  });

  it('restricted projects hide from non-assigned members and honor project roles', async () => {
    const p = (await ws.agent.post(`/api/orgs/${ws.org.id}/projects`).send({ name: 'Secret', access: 'restricted' })).body;
    expect((await viewer.agent.get(`/api/projects/${p.id}`)).status).toBe(404);
    const list = await viewer.agent.get(`/api/orgs/${ws.org.id}/projects`);
    expect(list.body.items.find((x) => x.id === p.id)).toBeUndefined();
    await ws.agent.put(`/api/projects/${p.id}/members/${viewer.user.id}`).send({ role: 'developer' }).expect(200);
    const got = await viewer.agent.get(`/api/projects/${p.id}`);
    expect(got.status).toBe(200);
    expect(got.body.role).toBe('developer');
  });

  it('invitations can be rejected and only by the invited email', async () => {
    const someone = await signup('Someone');
    const inv = await ws.agent.post(`/api/orgs/${ws.org.id}/invitations`).send({ email: 'different@test.io', role: 'viewer' });
    const token = inv.body.inviteUrl.split('/invite/')[1];
    expect((await someone.agent.post(`/api/invitations/token/${token}/accept`)).status).toBe(403);
    const inv2 = await ws.agent.post(`/api/orgs/${ws.org.id}/invitations`).send({ email: someone.email, role: 'viewer' });
    const t2 = inv2.body.inviteUrl.split('/invite/')[1];
    await someone.agent.post(`/api/invitations/token/${t2}/reject`).expect(200);
    expect((await someone.agent.get(`/api/orgs/${ws.org.id}`)).status).toBe(404);
  });

  it('records audit entries without secrets', async () => {
    const res = await ws.agent.get(`/api/orgs/${ws.org.id}/audit-logs?limit=100`);
    const actions = res.body.items.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['organization.created', 'project.created', 'api_key.created', 'member.invited', 'invitation.accepted', 'member.role_changed']));
    expect(JSON.stringify(res.body)).not.toMatch(/ft_(dev|stg|live)_[A-Za-z0-9_-]{30,}/);
    const keyEntry = res.body.items.find((a) => a.action === 'api_key.created');
    expect(keyEntry.actor.email).toBeTruthy();
    expect(keyEntry.target.type).toBe('api_key');
  });
});
