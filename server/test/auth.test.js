import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, signup } from './helpers.js';
import { User } from '../src/models/index.js';

describe('authentication & sessions', () => {
  it('registers with hashed password, logs in and reads /me', async () => {
    const { agent, email } = await signup('Alice');
    const stored = await User.findOne({ email }).select('+passwordHash').lean();
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.passwordHash).toBeUndefined();
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const weak = await request(app).post('/api/auth/register').send({ name: 'W', email: 'weak@test.io', password: 'short' });
    expect(weak.status).toBe(422);
    const { email } = await signup('Dup');
    const dup = await request(app).post('/api/auth/register').send({ name: 'D', email, password: 'Str0ngPassw0rd' });
    expect(dup.status).toBe(409);
  });

  it('rejects bad credentials with a generic message', async () => {
    const { email } = await signup('Bob');
    const res = await request(app).post('/api/auth/login').send({ email, password: 'WrongPassw0rd' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@test.io', password: 'WrongPassw0rd' });
    expect(unknown.body.error.message).toBe('Invalid email or password');
  });

  it('requires auth for protected routes', async () => {
    expect((await request(app).get('/api/orgs')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
  });

  it('rotates refresh tokens and revokes sessions', async () => {
    const { agent, email } = await signup('Carol');
    const second = request.agent(app);
    await second.post('/api/auth/login').send({ email, password: 'Str0ngPassw0rd' });
    const sessions = await agent.get('/api/auth/sessions');
    expect(sessions.body.items).toHaveLength(2);
    const refreshed = await second.post('/api/auth/refresh');
    expect(refreshed.status).toBe(200);
    // revoke the other session from the first device
    const other = sessions.body.items.find((s) => !s.current);
    await agent.delete(`/api/auth/sessions/${other.id}`).expect(200);
    expect((await second.get('/api/auth/me')).status).toBe(401);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('changing password signs out other sessions', async () => {
    const { agent, email } = await signup('Dan');
    const other = request.agent(app);
    await other.post('/api/auth/login').send({ email, password: 'Str0ngPassw0rd' });
    await agent.post('/api/auth/change-password').send({ currentPassword: 'Str0ngPassw0rd', newPassword: 'N3wStrongPassword' }).expect(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'N3wStrongPassword' })).status).toBe(200);
  });

  it('persists profile and notification preferences', async () => {
    const { agent } = await signup('Eve');
    const res = await agent.patch('/api/auth/me').send({ name: 'Eve Updated', preferences: { theme: 'dark', notifications: { webhookFailures: false } } });
    expect(res.status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.name).toBe('Eve Updated');
    expect(me.body.user.preferences.theme).toBe('dark');
    expect(me.body.user.preferences.notifications.webhookFailures).toBe(false);
    expect(me.body.user.preferences.notifications.invitations).toBe(true);
  });
});
