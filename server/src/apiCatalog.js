// Machine-readable catalog of supported endpoints. Served at /api/docs/endpoints and
// /api/docs/openapi.json; consumed by the dashboard's API Explorer and docs pages.
const now = () => new Date().toISOString();
const err = (status, code, message) => ({ status, body: { error: { code, message } } });
const unauthorized = err(401, 'unauthorized', 'Invalid or revoked API key');
const validation = { status: 422, body: { error: { code: 'validation_error', message: 'Event rejected', details: [{ path: 'event', message: 'Required' }] } } };
const rate = err(429, 'rate_limited', 'Too many requests');

export const endpoints = [
  // ── Ingestion (API key) ──
  {
    id: 'ping', group: 'Ingestion', method: 'GET', path: '/v1/ping', auth: 'apiKey',
    summary: 'Verify an API key', description: 'Returns the project and environment the key belongs to.',
    errors: [unauthorized],
  },
  {
    id: 'track', group: 'Ingestion', method: 'POST', path: '/v1/track', auth: 'apiKey',
    summary: 'Track a single event',
    description: 'Accepts one event. Provide a unique messageId to make retries idempotent. Returns 202 once the event is queued for processing.',
    headers: [{ name: 'Idempotency-Key', required: false, description: 'Optional. Replays return the original response for 24h.' }],
    params: [
      { name: 'event', in: 'body', type: 'string', required: true, description: 'Event name, e.g. checkout_started' },
      { name: 'distinctId', in: 'body', type: 'string', required: true, description: 'Your user identifier (or userId / anonymousId)' },
      { name: 'properties', in: 'body', type: 'object', required: false, description: 'Arbitrary JSON properties (≤ 32KB)' },
      { name: 'timestamp', in: 'body', type: 'ISO-8601 | epoch ms', required: false, description: 'When the event happened. Defaults to receipt time.' },
      { name: 'messageId', in: 'body', type: 'string', required: false, description: 'Unique id used for de-duplication (8–128 chars)' },
    ],
    body: () => ({ event: 'checkout_started', distinctId: 'user_123', properties: { cart_value: 129.5, currency: 'USD', items: 3 }, timestamp: now(), messageId: `msg_${Math.random().toString(36).slice(2, 12)}` }),
    response: { status: 202, body: { status: 'accepted', messageId: 'msg_...' } },
    errors: [unauthorized, validation, rate],
  },
  {
    id: 'identify', group: 'Ingestion', method: 'POST', path: '/v1/identify', auth: 'apiKey',
    summary: 'Identify a user', description: 'Creates or updates the user profile with traits (email, plan, company, …).',
    params: [
      { name: 'distinctId', in: 'body', type: 'string', required: true },
      { name: 'traits', in: 'body', type: 'object', required: false },
    ],
    body: () => ({ distinctId: 'user_123', traits: { email: 'jane@example.com', name: 'Jane Doe', plan: 'pro' } }),
    response: { status: 202, body: { status: 'accepted', messageId: 'srv_...' } },
    errors: [unauthorized, validation],
  },
  {
    id: 'batch', group: 'Ingestion', method: 'POST', path: '/v1/batch', auth: 'apiKey',
    summary: 'Track events in batch', description: 'Up to 100 track/identify messages per request. Each item is validated independently; the response reports accepted, duplicate and rejected items.',
    params: [{ name: 'batch', in: 'body', type: 'array', required: true, description: 'Items with type "track" (default) or "identify"' }],
    body: () => ({
      batch: [
        { type: 'identify', distinctId: 'user_123', traits: { plan: 'pro' } },
        { type: 'track', event: 'product_viewed', distinctId: 'user_123', properties: { product_id: 'sku_42' }, messageId: `msg_${Math.random().toString(36).slice(2, 12)}` },
        { type: 'track', event: 'add_to_cart', distinctId: 'user_123', properties: { product_id: 'sku_42', price: 49 } },
      ],
    }),
    response: { status: 202, body: { accepted: 3, duplicates: 0, rejected: 0, results: [{ index: 0, status: 'accepted', messageId: '...' }] } },
    errors: [unauthorized, { status: 422, body: { error: { code: 'validation_error', message: 'Request validation failed', details: [{ path: 'batch', message: 'Batch may contain at most 100 items' }] } } }],
  },
  {
    id: 'flags', group: 'Feature flags', method: 'POST', path: '/v1/flags', auth: 'apiKey',
    summary: 'Evaluate feature flags', description: 'Evaluates every feature rollout in the key\'s environment for a user. Percentage rollouts are deterministic per user.',
    params: [
      { name: 'distinctId', in: 'body', type: 'string', required: true },
      { name: 'properties', in: 'body', type: 'object', required: false, description: 'User properties used by targeting rules' },
      { name: 'keys', in: 'body', type: 'string[]', required: false, description: 'Only evaluate these feature keys' },
    ],
    body: () => ({ distinctId: 'user_123', properties: { plan: 'pro', country: 'US' } }),
    response: { status: 200, body: { flags: { 'new-checkout': true }, details: { 'new-checkout': { enabled: true, reason: 'rollout' } } } },
    errors: [unauthorized],
  },
  // ── Management (session) ──
  { id: 'me', group: 'Account', method: 'GET', path: '/api/auth/me', auth: 'session', summary: 'Current user and organizations' },
  { id: 'orgs', group: 'Organizations', method: 'GET', path: '/api/orgs', auth: 'session', summary: 'List your organizations' },
  { id: 'org-members', group: 'Organizations', method: 'GET', path: '/api/orgs/{orgId}/members', auth: 'session', summary: 'List members' },
  { id: 'projects', group: 'Projects', method: 'GET', path: '/api/orgs/{orgId}/projects', auth: 'session', summary: 'List projects' },
  { id: 'project', group: 'Projects', method: 'GET', path: '/api/projects/{projectId}', auth: 'session', summary: 'Project with environments' },
  { id: 'overview', group: 'Analytics', method: 'GET', path: '/api/projects/{projectId}/analytics/overview', auth: 'session', summary: 'Dashboard metrics', query: [{ name: 'envId', required: true }, { name: 'range', example: '30d' }, { name: 'filters', example: '[{"property":"plan","operator":"eq","value":"pro"}]' }] },
  { id: 'trends', group: 'Analytics', method: 'GET', path: '/api/projects/{projectId}/analytics/trends', auth: 'session', summary: 'Time series', query: [{ name: 'envId', required: true }, { name: 'events', example: 'product_viewed,checkout_started' }, { name: 'interval', example: 'day' }, { name: 'metric', example: 'unique' }, { name: 'breakdown', example: '' }, { name: 'range', example: '30d' }] },
  { id: 'retention', group: 'Analytics', method: 'GET', path: '/api/projects/{projectId}/analytics/retention', auth: 'session', summary: 'Cohort retention', query: [{ name: 'envId', required: true }, { name: 'period', example: 'week' }, { name: 'range', example: '90d' }] },
  { id: 'events-list', group: 'Events', method: 'GET', path: '/api/projects/{projectId}/events', auth: 'session', summary: 'Search raw events', query: [{ name: 'envId', required: true }, { name: 'name', example: '' }, { name: 'distinctId', example: '' }, { name: 'limit', example: '25' }] },
  { id: 'event-stats', group: 'Events', method: 'GET', path: '/api/projects/{projectId}/events/stats', auth: 'session', summary: 'Stats for one event', query: [{ name: 'envId', required: true }, { name: 'name', example: 'checkout_started', required: true }, { name: 'range', example: '30d' }] },
  { id: 'defs', group: 'Events', method: 'GET', path: '/api/projects/{projectId}/event-definitions', auth: 'session', summary: 'Event definitions with volume', query: [{ name: 'envId', required: true }] },
  { id: 'defs-create', group: 'Events', method: 'POST', path: '/api/projects/{projectId}/event-definitions', auth: 'session', summary: 'Define an event', body: () => ({ name: 'payment_completed', description: 'Customer paid successfully', properties: [{ name: 'amount', type: 'number', required: true }] }) },
  { id: 'users', group: 'Users', method: 'GET', path: '/api/projects/{projectId}/users', auth: 'session', summary: 'Tracked users', query: [{ name: 'envId', required: true }, { name: 'q', example: '' }] },
  { id: 'features', group: 'Features', method: 'GET', path: '/api/projects/{projectId}/features', auth: 'session', summary: 'Features with adoption', query: [{ name: 'envId', required: true }, { name: 'range', example: '30d' }] },
  { id: 'funnel-compute', group: 'Funnels', method: 'POST', path: '/api/projects/{projectId}/funnels/compute', auth: 'session', summary: 'Compute an ad-hoc funnel', body: () => ({ envId: '{envId}', range: '30d', windowHours: 168, steps: [{ event: 'user_signed_up' }, { event: 'product_viewed' }, { event: 'checkout_started' }, { event: 'payment_completed' }] }) },
  { id: 'webhooks', group: 'Webhooks', method: 'GET', path: '/api/projects/{projectId}/webhooks', auth: 'session', summary: 'List webhooks' },
  { id: 'health', group: 'System', method: 'GET', path: '/health/ready', auth: 'none', summary: 'Readiness check' },
];

export function catalog() {
  return endpoints.map(({ body, ...e }) => ({ ...e, exampleBody: typeof body === 'function' ? body() : undefined }));
}

export function openapi(serverUrl) {
  const paths = {};
  for (const e of catalog()) {
    const p = (paths[e.path] ||= {});
    p[e.method.toLowerCase()] = {
      tags: [e.group],
      summary: e.summary,
      description: e.description,
      security: e.auth === 'apiKey' ? [{ apiKey: [] }] : e.auth === 'session' ? [{ session: [] }] : [],
      parameters: (e.query || []).map((q) => ({ name: q.name, in: 'query', required: !!q.required, schema: { type: 'string' }, example: q.example })),
      requestBody: e.exampleBody ? { content: { 'application/json': { example: e.exampleBody } } } : undefined,
      responses: Object.fromEntries([[String(e.response?.status || 200), { description: 'Success', content: e.response ? { 'application/json': { example: e.response.body } } : undefined }], ...(e.errors || []).map((x) => [String(x.status), { description: x.body.error.message, content: { 'application/json': { example: x.body } } }])]),
    };
  }
  return {
    openapi: '3.0.3',
    info: { title: 'FeatureTrack API', version: '1.0.0' },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', description: 'ft_dev_… / ft_stg_… / ft_live_… API key' }, session: { type: 'apiKey', in: 'cookie', name: 'ft_at' } } },
    paths,
  };
}
