import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeatureTrack } from '../src/index.js';

function mockFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const r = responses.shift() || { status: 202, body: { accepted: 1, results: [] } };
    return { ok: r.status < 300, status: r.status, json: async () => r.body, headers: new Map([['retry-after', r.retryAfter]]) };
  };
  fn.calls = calls;
  return fn;
}

test('batches events with messageIds and auth header', async () => {
  const fetch = mockFetch([]);
  const ft = new FeatureTrack({ apiKey: 'ft_dev_x', fetch, flushInterval: 0, flushAt: 100 });
  ft.identify('u1', { plan: 'pro' });
  ft.track('signed_up', { source: 'ads' });
  ft.featureUsed('dark-mode');
  await ft.shutdown();
  assert.equal(fetch.calls.length, 1);
  const { batch } = fetch.calls[0].body;
  assert.equal(batch.length, 3);
  assert.equal(batch[1].distinctId, 'u1');
  assert.equal(batch[2].event, '$feature_used');
  assert.equal(batch[2].properties.feature, 'dark-mode');
  assert.ok(batch[1].messageId);
  assert.equal(fetch.calls[0].headers.authorization, 'Bearer ft_dev_x');
});

test('retries on 5xx then succeeds, keeping the same messageIds', async () => {
  const fetch = mockFetch([{ status: 503, body: {} }, { status: 202, body: { accepted: 1, results: [] } }]);
  const ft = new FeatureTrack({ apiKey: 'ft_dev_x', fetch, flushInterval: 0, maxRetries: 2 });
  ft.track('a', {}, { distinctId: 'u' });
  await ft.shutdown();
  assert.equal(fetch.calls.length, 2);
  assert.equal(fetch.calls[0].body.batch[0].messageId, fetch.calls[1].body.batch[0].messageId);
});

test('does not retry 401 and reports error', async () => {
  const errors = [];
  const fetch = mockFetch([{ status: 401, body: { error: { message: 'Invalid or revoked API key' } } }]);
  const ft = new FeatureTrack({ apiKey: 'ft_dev_x', fetch, flushInterval: 0, onError: (e) => errors.push(e) });
  ft.track('a', {}, { distinctId: 'u' });
  await ft.shutdown();
  assert.equal(fetch.calls.length, 1);
  assert.match(errors[0].message, /revoked/);
});

test('isEnabled evaluates flags and records exposure', async () => {
  const fetch = mockFetch([{ status: 200, body: { flags: { 'new-checkout': true, other: false } } }]);
  const ft = new FeatureTrack({ apiKey: 'ft_dev_x', fetch, flushInterval: 0, flushAt: 100 });
  assert.equal(await ft.isEnabled('new-checkout', { distinctId: 'u9' }), true);
  assert.equal(ft.queue[0].event, '$feature_exposed');
  assert.equal(ft.queue[0].distinctId, 'u9');
});
