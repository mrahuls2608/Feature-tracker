// Pure unit tests: no HTTP, no database. Business rules in isolation.
import { describe, it, expect } from 'vitest';
import { evaluateFlag } from '../src/services/features.js';
import { bucket, encrypt, decrypt, hmacSha256, sha256, safeEqual } from '../src/lib/crypto.js';
import { growth, resolveRange, dayKeys } from '../src/lib/dates.js';
import { scrub } from '../src/lib/audit.js';
import { signPayload } from '../src/services/webhooks.js';
import { parseFilters, propertyConditions, baseMatch } from '../src/services/analytics.js';
import { generateApiKey, API_KEY_RE } from '../src/services/ingest.js';
import { atLeast, projectRole } from '../src/middleware/rbac.js';

const ENV = '64b000000000000000000001';

describe('feature flag evaluation', () => {
  const base = { key: 'new-checkout', status: 'beta', rollouts: [{ environment: ENV, enabled: true, percentage: 100, rules: [] }] };

  it('is off when the environment has no rollout or it is disabled', () => {
    expect(evaluateFlag({ ...base, rollouts: [] }, ENV, { distinctId: 'u' }).enabled).toBe(false);
    expect(evaluateFlag({ ...base, rollouts: [{ environment: ENV, enabled: false, percentage: 100 }] }, ENV, { distinctId: 'u' }).reason).toBe('disabled');
  });

  it('is always off for deprecated features', () => {
    expect(evaluateFlag({ ...base, status: 'deprecated' }, ENV, { distinctId: 'u' }).reason).toBe('deprecated');
  });

  it('requires every targeting rule to match', () => {
    const f = { ...base, rollouts: [{ environment: ENV, enabled: true, percentage: 100, rules: [{ property: 'plan', operator: 'in', value: ['pro', 'business'] }, { property: 'country', operator: 'eq', value: 'US' }] }] };
    expect(evaluateFlag(f, ENV, { distinctId: 'u', properties: { plan: 'pro', country: 'US' } }).enabled).toBe(true);
    expect(evaluateFlag(f, ENV, { distinctId: 'u', properties: { plan: 'pro', country: 'DE' } }).reason).toBe('targeting_mismatch');
    expect(evaluateFlag(f, ENV, { distinctId: 'u', properties: { plan: 'free', country: 'US' } }).enabled).toBe(false);
  });

  it('supports every rule operator', () => {
    const rule = (operator, value) => ({ ...base, rollouts: [{ environment: ENV, enabled: true, percentage: 100, rules: [{ property: 'v', operator, value }] }] });
    const on = (f, v) => evaluateFlag(f, ENV, { distinctId: 'u', properties: { v } }).enabled;
    expect(on(rule('neq', 'a'), 'b')).toBe(true);
    expect(on(rule('contains', 'ACME'), 'team@acme.io')).toBe(true);
    expect(on(rule('gt', 10), 11)).toBe(true);
    expect(on(rule('lt', 10), 11)).toBe(false);
    expect(on(rule('in', 'a, b'), 'b')).toBe(true);
  });

  it('percentage rollouts are deterministic and roughly proportional', () => {
    const f = { ...base, rollouts: [{ environment: ENV, enabled: true, percentage: 30, rules: [] }] };
    const results = Array.from({ length: 2000 }, (_, i) => evaluateFlag(f, ENV, { distinctId: `user_${i}` }).enabled);
    const share = results.filter(Boolean).length / results.length;
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.35);
    expect(evaluateFlag(f, ENV, { distinctId: 'user_7' }).enabled).toBe(results[7]);
  });

  it('raising the percentage never removes users who already had the feature', () => {
    const at = (p) => ({ ...base, rollouts: [{ environment: ENV, enabled: true, percentage: p, rules: [] }] });
    for (let i = 0; i < 500; i++) {
      if (evaluateFlag(at(20), ENV, { distinctId: `u${i}` }).enabled) expect(evaluateFlag(at(60), ENV, { distinctId: `u${i}` }).enabled).toBe(true);
    }
  });
});

describe('crypto helpers', () => {
  it('bucket is stable and in 0–99', () => {
    expect(bucket('a:b')).toBe(bucket('a:b'));
    for (let i = 0; i < 200; i++) expect(bucket(`k:${i}`)).toBeGreaterThanOrEqual(0) && expect(bucket(`k:${i}`)).toBeLessThan(100);
  });

  it('AES-GCM round-trips and detects tampering', () => {
    const enc = encrypt('whsec_secret');
    expect(enc).not.toContain('whsec_secret');
    expect(decrypt(enc)).toBe('whsec_secret');
    const [iv, tag, body] = enc.split('.');
    const flipped = Buffer.from(body, 'base64');
    flipped[0] ^= 1;
    expect(() => decrypt([iv, tag, flipped.toString('base64')].join('.'))).toThrow();
    expect(encrypt('x')).not.toBe(encrypt('x')); // random IV
  });

  it('webhook signatures follow t=…,v1=HMAC(t.body)', () => {
    const sig = signPayload('s3cret', 1700000000, '{"a":1}');
    expect(sig).toBe(`t=1700000000,v1=${hmacSha256('s3cret', '1700000000.{"a":1}')}`);
  });

  it('safeEqual compares in constant time and handles length differences', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('API keys carry an environment prefix and are stored only as a hash', () => {
    const k = generateApiKey('production');
    expect(k.raw).toMatch(/^ft_live_/);
    expect(API_KEY_RE.test(k.raw)).toBe(true);
    expect(k.hash).toBe(sha256(k.raw));
    expect(k.hash).not.toContain(k.raw);
    expect(generateApiKey('development').raw).toMatch(/^ft_dev_/);
    expect(generateApiKey('staging').raw).toMatch(/^ft_stg_/);
  });
});

describe('date ranges and growth', () => {
  it('computes growth percentages', () => {
    expect(growth(150, 100)).toBe(50);
    expect(growth(50, 100)).toBe(-50);
    expect(growth(10, 0)).toBe(100);
    expect(growth(0, 0)).toBe(0);
  });

  it('resolves presets and inclusive custom ranges with an equal previous period', () => {
    const r = resolveRange({ from: '2026-01-01', to: '2026-01-07' });
    expect(r.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-01-07T23:59:59.999Z');
    expect(r.prevTo.getTime()).toBe(r.from.getTime() - 1);
    expect(r.to - r.from).toBe(r.prevTo - r.prevFrom);
    expect(dayKeys(r.from, r.to)).toHaveLength(7);
    expect(dayKeys(resolveRange({ range: '30d' }).from, new Date())).toHaveLength(30);
  });

  it('rejects inverted and oversized ranges', () => {
    expect(() => resolveRange({ from: '2026-02-01', to: '2026-01-01' })).toThrow();
    expect(() => resolveRange({ from: '2020-01-01', to: '2026-01-01' })).toThrow();
    expect(() => resolveRange({ range: '999d' })).toThrow();
  });
});

describe('analytics query building', () => {
  it('translates filters into safe Mongo conditions', () => {
    const c = propertyConditions(parseFilters(JSON.stringify([{ property: 'plan', operator: 'eq', value: '5' }, { property: 'name', operator: 'contains', value: 'a.b*' }])));
    expect(c['properties.plan']).toEqual({ $in: ['5', 5] });
    expect(c['properties.name'].$regex).toBe('a\\.b\\*'); // regex metacharacters escaped
  });

  it('rejects operator-injection in property names and malformed filters', () => {
    expect(() => parseFilters(JSON.stringify([{ property: '$where', value: 1 }]).replace('$where', 'a.$where'))).toThrow();
    expect(() => parseFilters('[{"property":"x.y","value":1}]')).toThrow();
    expect(() => parseFilters('not json')).toThrow();
  });

  it('excludes internal $identify events unless asked', () => {
    const m = baseMatch(ENV, { from: new Date(0), to: new Date() });
    expect(m.name).toEqual({ $nin: ['$identify'] });
    expect(baseMatch(ENV, { from: new Date(0), to: new Date() }, { includeInternal: true }).name).toBeUndefined();
  });
});

describe('roles', () => {
  it('ranks roles', () => {
    expect(atLeast('owner', 'admin')).toBe(true);
    expect(atLeast('developer', 'admin')).toBe(false);
    expect(atLeast('viewer', 'viewer')).toBe(true);
  });

  it('resolves effective project roles', () => {
    const u = '64b0000000000000000000aa';
    const open = { access: 'organization', members: [] };
    const restricted = { access: 'restricted', members: [{ user: u, role: 'developer' }] };
    expect(projectRole(open, 'viewer', u)).toBe('viewer');
    expect(projectRole(restricted, 'viewer', u)).toBe('developer');
    expect(projectRole(restricted, 'viewer', '64b0000000000000000000bb')).toBeNull();
    expect(projectRole(restricted, 'admin', '64b0000000000000000000bb')).toBe('admin');
  });
});

describe('audit scrubbing', () => {
  it('redacts secret-looking keys at any depth', () => {
    const out = scrub({ name: 'k', apiKey: 'ft_live_x', nested: { password: 'p', token: 't', ok: 1 }, list: [{ secret: 's' }] });
    expect(out).toEqual({ name: 'k', apiKey: '[REDACTED]', nested: { password: '[REDACTED]', token: '[REDACTED]', ok: 1 }, list: [{ secret: '[REDACTED]' }] });
  });
});
