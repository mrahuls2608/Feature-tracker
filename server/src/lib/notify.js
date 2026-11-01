import { Notification, User, Membership } from '../models/index.js';
import { logger } from './logger.js';

// In-app notifications respecting each user's notification preferences.
export async function notifyUsers(userIds, pref, { org, type, title, body, link }) {
  try {
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const recipients = users.filter((u) => u.preferences?.notifications?.[pref] !== false);
    if (recipients.length) await Notification.insertMany(recipients.map((u) => ({ user: u._id, org, type, title, body, link })));
  } catch (err) {
    logger.error({ err: err.message }, 'failed to create notifications');
  }
}

export async function notifyOrgAdmins(orgId, pref, payload) {
  const admins = await Membership.find({ org: orgId, role: { $in: ['owner', 'admin'] } }).lean();
  return notifyUsers(admins.map((m) => m.user), pref, { org: orgId, ...payload });
}

// Outbound email is pluggable; without a provider configured, messages are logged (secrets excluded).
export async function sendEmail({ to, subject, text }) {
  logger.info({ to, subject, length: text.length }, 'email (log transport)');
}
