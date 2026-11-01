import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User, Session } from '../models/index.js';
import { unauthorized } from '../lib/errors.js';

export const ACCESS_COOKIE = 'ft_at';
export const REFRESH_COOKIE = 'ft_rt';

export function signAccessToken(user, sessionId) {
  return jwt.sign({ sub: String(user._id), sid: String(sessionId), typ: 'access' }, config.jwtSecret, {
    expiresIn: config.accessTokenTtlSec,
    issuer: 'featuretrack',
  });
}

export function signSocketToken(userId) {
  return jwt.sign({ sub: String(userId), typ: 'socket' }, config.jwtSecret, { expiresIn: 120, issuer: 'featuretrack' });
}

export function verifyToken(token, typ) {
  const payload = jwt.verify(token, config.jwtSecret, { issuer: 'featuretrack' });
  if (payload.typ !== typ) throw new Error('wrong token type');
  return payload;
}

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ') && !header.startsWith('Bearer ft_')) return header.slice(7);
  return req.cookies?.[ACCESS_COOKIE];
}

// Authenticates dashboard users (cookie or bearer JWT) and verifies the session is still active.
export async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized();
    let payload;
    try {
      payload = verifyToken(token, 'access');
    } catch {
      throw unauthorized('Session expired');
    }
    const session = await Session.findById(payload.sid).lean();
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw unauthorized('Session revoked');
    const user = await User.findById(payload.sub);
    if (!user) throw unauthorized();
    req.user = user;
    req.sessionId = String(session._id);
    next();
  } catch (err) {
    next(err);
  }
}
