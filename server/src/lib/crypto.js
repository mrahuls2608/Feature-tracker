import crypto from 'node:crypto';
import { config } from '../config.js';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
export const hmacSha256 = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

const key = crypto.createHash('sha256').update(config.encryptionKey).digest();

// AES-256-GCM encryption for secrets that must be recoverable (e.g. webhook signing secrets).
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(payload) {
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// Deterministic 0-99 bucket used for percentage rollouts.
export function bucket(seed) {
  const h = crypto.createHash('sha1').update(seed).digest();
  return h.readUInt32BE(0) % 100;
}
