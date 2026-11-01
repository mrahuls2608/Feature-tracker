import dns from 'node:dns/promises';
import net from 'node:net';
import { Webhook, WebhookDelivery } from '../models/index.js';
import { decrypt, hmacSha256 } from '../lib/crypto.js';
import { config } from '../config.js';
import { notifyOrgAdmins } from '../lib/notify.js';
import { badRequest } from '../lib/errors.js';

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

// Prevents webhooks from being pointed at internal infrastructure (SSRF).
export async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw badRequest('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Webhook URL must use http or https');
  if (config.isProd && url.protocol !== 'https:') throw badRequest('Webhook URL must use https');
  if (config.allowPrivateWebhooks) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw badRequest('Webhook host could not be resolved');
  if (addrs.some(isPrivateIp) || host === 'localhost') throw badRequest('Webhook URL may not target private or loopback addresses');
  return url;
}

export function signPayload(secret, timestamp, body) {
  return `t=${timestamp},v1=${hmacSha256(secret, `${timestamp}.${body}`)}`;
}

// Performs one delivery attempt. Throws on failure so the queue schedules a retry.
export async function attemptDelivery(deliveryId, { final = false } = {}) {
  const delivery = await WebhookDelivery.findById(deliveryId);
  if (!delivery) return { skipped: true };
  const hook = await Webhook.findById(delivery.webhook).select('+secretEncrypted');
  if (!hook) {
    delivery.status = 'failed';
    delivery.completedAt = new Date();
    await delivery.save();
    return { skipped: true };
  }
  const body = JSON.stringify({ id: String(delivery._id), ...delivery.payload });
  const ts = Math.floor(Date.now() / 1000);
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'FeatureTrack-Webhooks/1.0',
    'x-featuretrack-delivery': String(delivery._id),
    'x-featuretrack-event': delivery.eventType,
    'x-featuretrack-signature': signPayload(decrypt(hook.secretEncrypted), ts, body),
  };
  const started = Date.now();
  const attempt = { at: new Date(), requestHeaders: { ...headers, 'x-featuretrack-signature': `t=${ts},v1=…` } };
  let ok = false;
  try {
    await assertSafeUrl(hook.url);
    const res = await fetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000), redirect: 'manual' });
    attempt.responseStatus = res.status;
    attempt.responseBody = (await res.text().catch(() => '')).slice(0, 2048);
    ok = res.status >= 200 && res.status < 300;
    if (!ok) attempt.error = `Endpoint responded with HTTP ${res.status}`;
  } catch (err) {
    attempt.error = err.name === 'TimeoutError' ? 'Request timed out after 10s' : err.message;
  }
  attempt.durationMs = Date.now() - started;
  delivery.attempts.push(attempt);
  delivery.attemptCount += 1;
  delivery.status = ok ? 'succeeded' : final ? 'failed' : 'retrying';
  if (ok || final) delivery.completedAt = new Date();
  await delivery.save();
  await Webhook.updateOne({ _id: hook._id }, { lastDeliveryAt: new Date(), lastDeliveryStatus: delivery.status });
  if (!ok && final) {
    await notifyOrgAdmins(hook.org, 'webhookFailures', {
      type: 'webhook.failed',
      title: 'Webhook delivery failed',
      body: `Delivery to ${hook.url} failed after ${delivery.attemptCount} attempts: ${attempt.error}`,
      link: `/webhooks/${hook._id}`,
    });
  }
  if (!ok) throw new Error(attempt.error || 'delivery failed');
  return { ok };
}
