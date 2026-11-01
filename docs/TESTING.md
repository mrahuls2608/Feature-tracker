# Testing

## Strategy

| Level | Purpose | Tooling | Location |
|---|---|---|---|
| Unit | Pure business rules in isolation, millisecond feedback | Vitest | `server/test/unit.test.js`, `sdk/test/sdk.test.js` (`node:test`) |
| Integration | Real HTTP → real MongoDB/Redis → real BullMQ workers; exact numbers on deterministic data | Vitest + Supertest | `server/test/{auth,rbac,ingest,analytics,webhooks}.test.js` |
| Security | Attack-style requests | Vitest + Supertest | `server/test/security.test.js` |
| End-to-end | The real dashboard in a browser | Playwright (Chromium) | `e2e/` |
| Static / supply chain | Known vulnerabilities, production build | `npm audit`, `next build` | CI |

### Test environment

`server/vitest.config.js` sets `NODE_ENV=test`, a dedicated database (`featuretrack_test`), Redis DB 1 with the `fttest` key prefix, silent logs and a low ingestion rate limit so rate limiting can be asserted. `test/setup.js` drops the database, syncs indexes, flushes the test Redis DB and starts the BullMQ workers once per run. Test files run sequentially.

`test/helpers.js` provides:
- `signup()` / `workspace()` — a user with an org, a project (three environments) and a development API key.
- `ingest(key, path, body, headers)` — calls the public API.
- `drain()` — waits until the ingest/webhook queues are empty, so assertions see processed data.
- `waitFor()` and `daysAgo()` utilities.

### The deterministic analytics dataset

`analytics.test.js` ingests a fixed set of journeys so every number can be asserted exactly:

| User | Journey |
|---|---|
| u1 | sign up → view (audio) → exposed to new-checkout → checkout → uses new-checkout → pays 120 |
| u2 | sign up → view (displays) → exposed → checkout |
| u3 | sign up → view (audio) |
| u4 | sign up |
| u5 | view only (never signed up) |
| u6 | sign up → pays 30 → view → checkout (out of order) |
| old1 | sign up 40 days ago (previous period) |

Assertions include 18 events / 6 users in 7 days, funnel `[5, 4, 3, 1]` (20 %), window-limited funnel `[5, 1]`, property-filtered trends (3 audio viewers), feature exposure 2 / adoption 1 / 50 % with 100 % vs 0 % conversion, and cache invalidation after a new event.

## Results (current code)

```
 ✓ test/unit.test.js      (20 tests)
 ✓ test/security.test.js  (22 tests)
 ✓ test/auth.test.js      (7 tests)
 ✓ test/rbac.test.js      (10 tests)
 ✓ test/ingest.test.js    (14 tests)
 ✓ test/analytics.test.js (12 tests)
 ✓ test/webhooks.test.js  (5 tests)
 Test Files  7 passed (7)
      Tests  90 passed (90)

 SDK: # pass 4  # fail 0
 E2E: 10/10 flows ✓, journey crawl of 22 pages, 0 page/console errors
 npm audit: found 0 vulnerabilities
```

## Full test list

### API (Vitest)

| Suite | Test |
|---|---|
| auth.test.js | registers with hashed password, logs in and reads /me |
| auth.test.js | rejects weak passwords and duplicate emails |
| auth.test.js | rejects bad credentials with a generic message |
| auth.test.js | requires auth for protected routes |
| auth.test.js | rotates refresh tokens and revokes sessions |
| auth.test.js | changing password signs out other sessions |
| auth.test.js | persists profile and notification preferences |
| security.test.js | sets hardening headers and hides the framework |
| security.test.js | auth cookies are httpOnly and SameSite |
| security.test.js | only allows credentialed CORS from the configured web origin |
| security.test.js | rejects tampered, unsigned and wrong-type tokens |
| security.test.js | a rotated refresh token cannot be reused |
| security.test.js | logout revokes the session server-side |
| security.test.js | API keys cannot be used on the dashboard API, sessions cannot ingest |
| security.test.js | blocks NoSQL operator injection in login |
| security.test.js | blocks operator injection through analytics filters and breakdowns |
| security.test.js | rejects dotted / $-prefixed property keys at ingestion |
| security.test.js | escapes regex input in searches (no ReDoS / regex injection) |
| security.test.js | stores XSS payloads as inert data (React escapes on render) |
| security.test.js | rejects form-encoded state-changing requests |
| security.test.js | rejects oversized and malformed bodies cleanly |
| security.test.js | error responses never leak stack traces |
| security.test.js | cannot read or act on another tenant’s resources by id |
| security.test.js | ignores privileged fields in profile updates (mass assignment) |
| security.test.js | cannot move a project to another organization via PATCH |
| security.test.js | live stream refuses to subscribe to environments you cannot access |
| security.test.js | never returns password hashes, key hashes or webhook secrets after creation |
| security.test.js | blocks private, loopback and link-local targets when enforcement is on |
| security.test.js | rejects an empty form POST to a destructive endpoint |
| rbac.test.js | creates three isolated environments per project |
| rbac.test.js | lists members with roles |
| rbac.test.js | viewer can read analytics but cannot mutate |
| rbac.test.js | developer manages integrations but not members or projects |
| rbac.test.js | admin manages members but cannot grant owner |
| rbac.test.js | last owner cannot be demoted |
| rbac.test.js | isolates organizations: outsiders get 404 everywhere |
| rbac.test.js | restricted projects hide from non-assigned members and honor project roles |
| rbac.test.js | invitations can be rejected and only by the invited email |
| rbac.test.js | records audit entries without secrets |
| ingest.test.js | rejects missing, malformed and unknown keys |
| ingest.test.js | accepts a single event and persists it with the right tenant scope |
| ingest.test.js | de-duplicates by messageId (idempotency) |
| ingest.test.js | replays responses for a repeated Idempotency-Key |
| ingest.test.js | validates events and reports per-item batch results |
| ingest.test.js | single invalid event returns 422 with details |
| ingest.test.js | enforces the batch size limit |
| ingest.test.js | enforces event definitions (required props, types) and strict mode |
| ingest.test.js | auto-discovers new event names |
| ingest.test.js | keeps environments isolated |
| ingest.test.js | revoked keys stop working immediately and secrets are never returned again |
| ingest.test.js | regenerating issues a new key and revokes the old one |
| ingest.test.js | archived projects reject ingestion |
| ingest.test.js | rate limits per API key |
| webhooks.test.js | delivers signed payloads for subscribed events only |
| webhooks.test.js | retries failed deliveries and supports manual retry |
| webhooks.test.js | disabled webhooks do not receive events |
| webhooks.test.js | rejects non-http URLs |
| webhooks.test.js | deletes events older than the org retention period |
| analytics.test.js | overview metrics reflect actual data |
| analytics.test.js | updates after new events are processed (cache invalidation) |
| analytics.test.js | applies property filters and date ranges |
| analytics.test.js | event detail stats |
| analytics.test.js | computes ordered funnels with drop-off |
| analytics.test.js | respects the conversion window and step filters |
| analytics.test.js | saves funnels and recomputes them |
| analytics.test.js | measures feature exposure, adoption and conversion lift |
| analytics.test.js | evaluates feature flags deterministically with targeting |
| analytics.test.js | retention and engagement are computed from events |
| analytics.test.js | user profiles include timeline and feature history |
| analytics.test.js | erases a user and their events |
| unit.test.js | is off when the environment has no rollout or it is disabled |
| unit.test.js | is always off for deprecated features |
| unit.test.js | requires every targeting rule to match |
| unit.test.js | supports every rule operator |
| unit.test.js | percentage rollouts are deterministic and roughly proportional |
| unit.test.js | raising the percentage never removes users who already had the feature |
| unit.test.js | bucket is stable and in 0–99 |
| unit.test.js | AES-GCM round-trips and detects tampering |
| unit.test.js | webhook signatures follow t=…,v1=HMAC(t.body) |
| unit.test.js | safeEqual compares in constant time and handles length differences |
| unit.test.js | API keys carry an environment prefix and are stored only as a hash |
| unit.test.js | computes growth percentages |
| unit.test.js | resolves presets and inclusive custom ranges with an equal previous period |
| unit.test.js | rejects inverted and oversized ranges |
| unit.test.js | translates filters into safe Mongo conditions |
| unit.test.js | rejects operator-injection in property names and malformed filters |
| unit.test.js | excludes internal $identify events unless asked |
| unit.test.js | ranks roles |
| unit.test.js | resolves effective project roles |
| unit.test.js | redacts secret-looking keys at any depth |

### SDK (`node:test`)

| Test |
|---|
| batches events with messageIds and auth header |
| retries on 5xx then succeeds, keeping the same messageIds |
| does not retry 401 and reports error |
| isEnabled evaluates flags and records exposure |

### Browser flows (Playwright, `e2e/02-flows.cjs`)

| # | Flow |
|---|---|
| 1 | Live event appears without refresh |
| 2 | Pause buffers new events; resume flushes them |
| 3 | Feature created through the UI; detail page shows metrics |
| 4 | Feature rollout enabled and saved |
| 5 | Funnel built with live preview, saved and computed |
| 6 | Webhook created, test delivery received by a local server, shown as succeeded |
| 7 | API explorer executes a real ingestion request |
| 8 | Invite → new user registers and accepts → viewer sees no API-keys nav or create buttons |
| 9 | Audit log lists `invitation.accepted` |
| 10 | Dark mode renders; no horizontal overflow at 390 px width |

## Running

```bash
npm test -w server         # needs MongoDB + Redis
npm test -w sdk
node e2e/01-journey.cjs && node e2e/02-flows.cjs   # see e2e/README.md
npm audit
```

Override connections with `TEST_MONGODB_URI` and `TEST_REDIS_URL`. CI runs the API and SDK suites against MongoDB and Redis service containers and builds the dashboard on every push.
