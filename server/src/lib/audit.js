import { AuditLog } from '../models/index.js';
import { logger } from './logger.js';

const SENSITIVE = /(secret|password|token|apikey|api_key|key_hash|keyhash|authorization)/i;

export function scrub(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[REDACTED]' : scrub(v, depth + 1);
    return out;
  }
  return value;
}

// Records an audit entry. Never throws: auditing must not break the primary operation.
export async function audit(req, { action, org, project, target, metadata }) {
  try {
    await AuditLog.create({
      org: org || req.org?._id,
      project: project === undefined ? req.project?._id : project,
      actor: req.user ? { id: req.user._id, email: req.user.email, name: req.user.name, type: 'user' } : { type: 'system' },
      action,
      target,
      metadata: scrub(metadata),
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  } catch (err) {
    logger.error({ err: err.message, action }, 'failed to write audit log');
  }
}
