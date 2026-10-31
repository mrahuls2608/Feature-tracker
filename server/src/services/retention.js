import { Organization, Event, WebhookDelivery, ApiUsage, Invitation } from '../models/index.js';
import { bumpEnvVersion } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

// Applies each organization's data-retention policy to raw events and operational data.
export async function applyRetention() {
  const orgs = await Organization.find().select('settings name').lean();
  let deleted = 0;
  for (const org of orgs) {
    const days = org.settings?.retentionDays || 365;
    const cutoff = new Date(Date.now() - days * 86400_000);
    const envs = await Event.distinct('environment', { org: org._id, timestamp: { $lt: cutoff } });
    if (!envs.length) continue;
    const res = await Event.deleteMany({ org: org._id, timestamp: { $lt: cutoff } });
    deleted += res.deletedCount;
    await Promise.all(envs.map((e) => bumpEnvVersion(e)));
    logger.info({ org: String(org._id), days, deleted: res.deletedCount }, 'retention applied');
  }
  const cutoff90 = new Date(Date.now() - 90 * 86400_000);
  await WebhookDelivery.deleteMany({ createdAt: { $lt: cutoff90 }, status: { $in: ['succeeded', 'failed'] } });
  await ApiUsage.deleteMany({ date: { $lt: new Date(Date.now() - 800 * 86400_000).toISOString().slice(0, 10) } });
  await Invitation.updateMany({ status: 'pending', expiresAt: { $lt: new Date() } }, { status: 'expired' });
  return { deleted };
}
