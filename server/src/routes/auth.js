import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Session, Membership, Notification } from '../models/index.js';
import { ah, unauthorized, conflict, badRequest, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { config } from '../config.js';
import { requireAuth, signAccessToken, signSocketToken, ACCESS_COOKIE, REFRESH_COOKIE } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const r = Router();
const authLimiter = rateLimit({ name: 'auth', limit: config.rateLimits.authPerMinute, key: (req) => req.ip });

const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), 'Password must include upper and lower case letters and a number');
const registerSchema = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(200), password });
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });

const cookieBase = () => ({ httpOnly: true, secure: config.cookieSecure, sameSite: 'lax' });

async function startSession(req, res, user) {
  const refresh = randomToken(48);
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: sha256(refresh),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    ip: req.ip,
    expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86400_000),
  });
  setCookies(res, user, session, refresh);
  return session;
}

function setCookies(res, user, session, refresh) {
  res.cookie(ACCESS_COOKIE, signAccessToken(user, session._id), { ...cookieBase(), path: '/', maxAge: config.accessTokenTtlSec * 1000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...cookieBase(), path: '/api/auth', maxAge: config.refreshTokenTtlDays * 86400_000 });
}

function clearCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: '/api/auth' });
}

r.post('/register', authLimiter, ah(async (req, res) => {
  const body = parse(registerSchema, req.body);
  if (await User.exists({ email: body.email.toLowerCase() })) throw conflict('An account with this email already exists');
  const user = await User.create({ name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12), lastLoginAt: new Date() });
  await startSession(req, res, user);
  res.status(201).json({ user });
}));

// Constant-ish time: always run bcrypt even if the user does not exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);
r.post('/login', authLimiter, ah(async (req, res) => {
  const body = parse(loginSchema, req.body);
  const user = await User.findOne({ email: body.email.toLowerCase() }).select('+passwordHash');
  const ok = await bcrypt.compare(body.password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');
  user.lastLoginAt = new Date();
  await user.save();
  await startSession(req, res, user);
  res.json({ user });
}));

// Refresh-token rotation: each refresh issues a new refresh token; reuse of an old one revokes the session.
r.post('/refresh', authLimiter, ah(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized('No refresh token');
  const session = await Session.findOne({ refreshTokenHash: sha256(token) });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    clearCookies(res);
    throw unauthorized('Session expired');
  }
  const user = await User.findById(session.user);
  if (!user) throw unauthorized();
  const next = randomToken(48);
  session.refreshTokenHash = sha256(next);
  session.lastUsedAt = new Date();
  session.ip = req.ip;
  await session.save();
  setCookies(res, user, session, next);
  res.json({ user });
}));

r.post('/logout', ah(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await Session.updateOne({ refreshTokenHash: sha256(token) }, { revokedAt: new Date() });
  clearCookies(res);
  res.json({ ok: true });
}));

r.get('/me', requireAuth, ah(async (req, res) => {
  const memberships = await Membership.find({ user: req.user._id }).populate('org').lean();
  const unread = await Notification.countDocuments({ user: req.user._id, readAt: null });
  res.json({
    user: req.user,
    sessionId: req.sessionId,
    organizations: memberships.filter((m) => m.org).map((m) => ({ id: String(m.org._id), name: m.org.name, slug: m.org.slug, role: m.role })),
    unreadNotifications: unread,
  });
}));

// Short-lived token used to authenticate the Socket.IO live stream.
r.post('/socket-token', requireAuth, (req, res) => res.json({ token: signSocketToken(req.user._id) }));

// ── Profile & preferences ───────────────────────────────────────────────────
const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(200).optional(),
  preferences: z
    .object({
      theme: z.enum(['system', 'light', 'dark']).optional(),
      notifications: z.object({ invitations: z.boolean(), memberChanges: z.boolean(), webhookFailures: z.boolean(), apiKeyChanges: z.boolean() }).partial().optional(),
    })
    .optional(),
});
r.patch('/me', requireAuth, ah(async (req, res) => {
  const body = parse(profileSchema, req.body);
  if (body.email && body.email.toLowerCase() !== req.user.email) {
    if (await User.exists({ email: body.email.toLowerCase() })) throw conflict('Email already in use');
    req.user.email = body.email;
  }
  if (body.name) req.user.name = body.name;
  if (body.preferences?.theme) req.user.preferences.theme = body.preferences.theme;
  if (body.preferences?.notifications) Object.assign(req.user.preferences.notifications, body.preferences.notifications);
  await req.user.save();
  res.json({ user: req.user });
}));

r.post('/change-password', requireAuth, authLimiter, ah(async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect');
  user.passwordHash = await bcrypt.hash(body.newPassword, 12);
  user.passwordChangedAt = new Date();
  await user.save();
  // Sign out every other session.
  await Session.updateMany({ user: user._id, _id: { $ne: req.sessionId }, revokedAt: null }, { revokedAt: new Date() });
  res.json({ ok: true });
}));

// ── Session management ─────────────────────────────────────────────────────
r.get('/sessions', requireAuth, ah(async (req, res) => {
  const sessions = await Session.find({ user: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }).lean();
  res.json({
    items: sessions.map((s) => ({ id: String(s._id), userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, current: String(s._id) === req.sessionId })),
  });
}));

r.delete('/sessions/:id', requireAuth, ah(async (req, res) => {
  const result = await Session.updateOne({ _id: req.params.id, user: req.user._id, revokedAt: null }, { revokedAt: new Date() });
  if (!result.matchedCount) throw notFound('Session');
  res.json({ ok: true });
}));

r.post('/sessions/revoke-others', requireAuth, ah(async (req, res) => {
  const result = await Session.updateMany({ user: req.user._id, _id: { $ne: req.sessionId }, revokedAt: null }, { revokedAt: new Date() });
  res.json({ revoked: result.modifiedCount });
}));

// ── Notifications ───────────────────────────────────────────────────────────
r.get('/notifications', requireAuth, ah(async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30).lean();
  res.json({ items: items.map((n) => ({ ...n, id: String(n._id) })) });
}));
r.post('/notifications/read-all', requireAuth, ah(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
}));

export default r;
