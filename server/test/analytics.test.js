import { describe, it, expect, beforeAll } from 'vitest';
import { workspace, ingest, drain, daysAgo } from './helpers.js';

// Deterministic dataset to assert analytics, funnels and feature metrics exactly.
//  u1: signup → view → checkout → pay           (new checkout exposed + used)
//  u2: signup → view → checkout                  (exposed, not used)
//  u3: signup → view
//  u4: signup
//  u5: view only (never signed up)
//  u6: signup → pay → view → checkout (wrong order: only reaches step 2)
describe('analytics, funnels and features', () => {
  let ws;
  const P = () => `/api/projects/${ws.project.id}`;
  beforeAll(async () => {
    ws = await workspace('Analytics');
    const t = (d, h) => daysAgo(d, h);
    const ev = (event, distinctId, timestamp, properties = {}) => ({ type: 'track', event, distinctId, timestamp, properties });
    const batch = [
      ev('user_signed_up', 'u1', t(3, 9)), ev('product_viewed', 'u1', t(3, 10), { category: 'audio' }), ev('$feature_exposed', 'u1', t(3, 10), { feature: 'new-checkout' }),
      ev('checkout_started', 'u1', t(3, 11)), ev('$feature_used', 'u1', t(3, 11), { feature: 'new-checkout' }), ev('payment_completed', 'u1', t(3, 12), { amount: 120 }),
      ev('user_signed_up', 'u2', t(2, 9)), ev('product_viewed', 'u2', t(2, 10), { category: 'displays' }), ev('$feature_exposed', 'u2', t(2, 10), { feature: 'new-checkout' }), ev('checkout_started', 'u2', t(2, 11)),
      ev('user_signed_up', 'u3', t(2, 9)), ev('product_viewed', 'u3', t(2, 10), { category: 'audio' }),
      ev('user_signed_up', 'u4', t(1, 9)),
      ev('product_viewed', 'u5', t(1, 10), { category: 'audio' }),
      ev('user_signed_up', 'u6', t(1, 8)), ev('payment_completed', 'u6', t(1, 9), { amount: 30 }), ev('product_viewed', 'u6', t(1, 10)), ev('checkout_started', 'u6', t(1, 11)),
      // previous period activity for growth comparison
      ev('user_signed_up', 'old1', t(40, 9)),
    ];
    const res = await ingest(ws.apiKey, '/batch', { batch });
    expect(res.body.accepted).toBe(batch.length);
    await drain();
  });

  it('overview metrics reflect actual data', async () => {
    const res = await ws.agent.get(`${P()}/analytics/overview?envId=${ws.dev.id}&range=7d`);
    expect(res.status).toBe(200);
    expect(res.body.metrics.totalEvents.value).toBe(18);
    expect(res.body.metrics.uniqueUsers.value).toBe(6);
    expect(res.body.metrics.apiRequests.value).toBe(1);
    expect(res.body.topEvents.find((e) => e.name === 'product_viewed')).toMatchObject({ count: 5, users: 5 });
    expect(res.body.topEvents[0].count).toBe(5);
    expect(res.body.series.reduce((s, p) => s + p.events, 0)).toBe(18);
  });

  it('updates after new events are processed (cache invalidation)', async () => {
    await ingest(ws.apiKey, '/track', { event: 'late_event', distinctId: 'u7' });
    await drain();
    const res = await ws.agent.get(`${P()}/analytics/overview?envId=${ws.dev.id}&range=7d`);
    expect(res.body.metrics.totalEvents.value).toBe(19);
    expect(res.body.metrics.uniqueUsers.value).toBe(7);
  });

  it('applies property filters and date ranges', async () => {
    const filters = encodeURIComponent(JSON.stringify([{ property: 'category', operator: 'eq', value: 'audio' }]));
    const res = await ws.agent.get(`${P()}/analytics/trends?envId=${ws.dev.id}&range=7d&events=product_viewed&metric=unique&filters=${filters}`);
    expect(res.body.totals.product_viewed ?? res.body.totals.all).toBe(3);
    const old = await ws.agent.get(`${P()}/analytics/overview?envId=${ws.dev.id}&range=90d`);
    expect(old.body.metrics.uniqueUsers.value).toBe(8);
  });

  it('event detail stats', async () => {
    const res = await ws.agent.get(`${P()}/events/stats?envId=${ws.dev.id}&range=7d&name=product_viewed`);
    expect(res.body.total).toBe(5);
    expect(res.body.uniqueUsers).toBe(5);
    expect(res.body.properties.find((p) => p.name === 'category').topValues[0]).toEqual({ value: 'audio', count: 3 });
    expect(res.body.recent).toHaveLength(5);
  });

  it('computes ordered funnels with drop-off', async () => {
    const steps = ['user_signed_up', 'product_viewed', 'checkout_started', 'payment_completed'].map((event) => ({ event }));
    const res = await ws.agent.post(`${P()}/funnels/compute`).send({ envId: ws.dev.id, range: '7d', steps, windowHours: 168 });
    expect(res.status).toBe(200);
    expect(res.body.steps.map((s) => s.users)).toEqual([5, 4, 3, 1]);
    expect(res.body.overallConversion).toBe(20);
    expect(res.body.steps[3].dropOffRate).toBeCloseTo(66.7, 1);
    expect(res.body.biggestDropOff.step).toBe(3);
  });

  it('respects the conversion window and step filters', async () => {
    const steps = [{ event: 'user_signed_up' }, { event: 'payment_completed' }];
    const tight = await ws.agent.post(`${P()}/funnels/compute`).send({ envId: ws.dev.id, range: '7d', steps, windowHours: 2 });
    expect(tight.body.steps.map((s) => s.users)).toEqual([5, 1]); // u6 paid 1h after signup; u1 3h after
    const filtered = await ws.agent.post(`${P()}/funnels/compute`).send({ envId: ws.dev.id, range: '7d', steps: [{ event: 'user_signed_up' }, { event: 'payment_completed', filters: [{ property: 'amount', operator: 'gt', value: 100 }] }] });
    expect(filtered.body.steps[1].users).toBe(1);
  });

  it('saves funnels and recomputes them', async () => {
    const f = await ws.agent.post(`${P()}/funnels`).send({ name: 'Checkout', steps: [{ event: 'checkout_started' }, { event: 'payment_completed' }] });
    expect(f.status).toBe(201);
    const res = await ws.agent.get(`${P()}/funnels/${f.body.id}?envId=${ws.dev.id}&range=7d`);
    expect(res.body.result.steps.map((s) => s.users)).toEqual([3, 1]);
  });

  it('measures feature exposure, adoption and conversion lift', async () => {
    const f = await ws.agent.post(`${P()}/features`).send({ key: 'new-checkout', name: 'New Checkout Experience', status: 'beta', conversionEvent: 'payment_completed' });
    expect(f.status).toBe(201);
    const res = await ws.agent.get(`${P()}/features/${f.body.id}?envId=${ws.dev.id}&range=7d`);
    expect(res.body.metrics.exposedUsers).toBe(2);
    expect(res.body.metrics.adoptedUsers).toBe(1);
    expect(res.body.metrics.adoptionRate).toBe(50);
    expect(res.body.metrics.conversion.adopters.rate).toBe(100);
    expect(res.body.metrics.conversion.nonAdopters.rate).toBe(0);
    // configured adoption events also count
    await ws.agent.patch(`${P()}/features/${f.body.id}`).send({ adoptionEvents: ['checkout_started'] }).expect(200);
    const res2 = await ws.agent.get(`${P()}/features/${f.body.id}?envId=${ws.dev.id}&range=7d`);
    expect(res2.body.metrics.adoptedUsers).toBe(3);
    const overview = await ws.agent.get(`${P()}/analytics/overview?envId=${ws.dev.id}&range=7d`);
    expect(overview.body.metrics.activeFeatures.value).toBe(1);
    expect(overview.body.topFeatures[0].key).toBe('new-checkout');
  });

  it('evaluates feature flags deterministically with targeting', async () => {
    const f = await ws.agent.post(`${P()}/features`).send({
      key: 'dark-mode', name: 'Dark Mode', status: 'live',
      rollouts: [{ environment: ws.dev.id, enabled: true, percentage: 50, rules: [{ property: 'plan', operator: 'in', value: ['pro', 'business'] }] }],
    });
    expect(f.status).toBe(201);
    const free = await ingest(ws.apiKey, '/flags', { distinctId: 'someone', properties: { plan: 'free' } });
    expect(free.body.flags['dark-mode']).toBe(false);
    expect(free.body.details['dark-mode'].reason).toBe('targeting_mismatch');
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => ingest(ws.apiKey, '/flags', { distinctId: `user_${i}`, properties: { plan: 'pro' } })));
    const on = results.filter((r) => r.body.flags['dark-mode']).length;
    expect(on).toBeGreaterThan(5);
    expect(on).toBeLessThan(35);
    const again = await ingest(ws.apiKey, '/flags', { distinctId: 'user_3', properties: { plan: 'pro' } });
    expect(again.body.flags['dark-mode']).toBe(results[3].body.flags['dark-mode']);
    // disabled in production by default
    const prodKey = (await ws.agent.post(`${P()}/api-keys`).send({ name: 'p', envId: ws.prod.id })).body.key;
    expect((await ingest(prodKey, '/flags', { distinctId: 'user_3', properties: { plan: 'pro' } })).body.flags['dark-mode']).toBe(false);
  });

  it('retention and engagement are computed from events', async () => {
    const ret = await ws.agent.get(`${P()}/analytics/retention?envId=${ws.dev.id}&range=7d&period=day&periods=4`);
    expect(ret.status).toBe(200);
    expect(ret.body.cohorts.reduce((s, c) => s + c.size, 0)).toBe(7);
    const eng = await ws.agent.get(`${P()}/analytics/engagement?envId=${ws.dev.id}&range=7d`);
    expect(eng.body.wau).toBe(7);
    expect(eng.body.topUsers[0].distinctId).toBe('u1');
  });

  it('user profiles include timeline and feature history', async () => {
    const res = await ws.agent.get(`${P()}/users/u1?envId=${ws.dev.id}`);
    expect(res.body.eventCount).toBe(6);
    expect(res.body.features.find((f) => f.key === 'new-checkout').adoptedAt).toBeTruthy();
    const list = await ws.agent.get(`${P()}/users?envId=${ws.dev.id}&sort=eventCount`);
    expect(list.body.items[0].distinctId).toBe('u1');
  });

  it('erases a user and their events', async () => {
    await ws.agent.delete(`${P()}/users/u5?envId=${ws.dev.id}`).expect(200);
    expect((await ws.agent.get(`${P()}/users/u5?envId=${ws.dev.id}`)).status).toBe(404);
    expect((await ws.agent.get(`${P()}/events?envId=${ws.dev.id}&distinctId=u5`)).body.total).toBe(0);
  });
});
