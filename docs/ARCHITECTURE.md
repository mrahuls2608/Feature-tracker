# Architecture & metric definitions

## Components

| Component | Responsibility |
|---|---|
| **API** (`server/src/index.js`) | Express app: dashboard API under `/api` (cookie session), public ingestion API under `/v1` (API key), health checks, Socket.IO live stream. Can run workers in-process (`RUN_WORKERS_INLINE=true`, default for local dev). |
| **Worker** (`server/src/worker.js`) | BullMQ consumers: `ingest` (persist events), `webhooks` (deliveries with retry), `maintenance` (hourly data retention). Scale horizontally by running more processes. |
| **MongoDB** | System of record: tenants, users, events, profiles, definitions, features, funnels, webhooks, deliveries, audit logs. |
| **Redis** (ioredis) | BullMQ queues, versioned analytics cache, API-key & definition cache, fixed-window rate limits, idempotency keys, live-event pub/sub. |
| **Web** (`web/`) | Next.js App Router dashboard. Proxies `/api` and `/v1` to the API so auth cookies are first-party; connects to Socket.IO directly with a 2-minute socket token. |

## Tenancy model

```
Organization ─┬─ Membership (user, role: owner|admin|developer|viewer)
              ├─ Invitation (email, role, hashed token, 7-day expiry)
              └─ Project (access: organization|restricted, members[{user, role}])
                   └─ Environment (development | staging | production)
                        ├─ ApiKey (hashed, scoped to one environment)
                        ├─ Event / Profile / ApiUsage (always keyed by environment)
```

Every event, profile and usage document carries `org`, `project` and `environment`. Every dashboard query is resolved through `loadProject` (membership + project access) and `withEnv` (the environment must belong to that project), so a valid id from another tenant yields `404`.

Effective project role: owners/admins always have their org role; otherwise a project-level assignment wins; restricted projects grant nothing without an assignment.

| Capability | viewer | developer | admin | owner |
|---|:-:|:-:|:-:|:-:|
| View analytics, events, users, funnels, features, live stream | ✓ | ✓ | ✓ | ✓ |
| API keys, webhooks, event definitions, features & rollouts, funnels | | ✓ | ✓ | ✓ |
| Projects (create/edit/archive/delete), environments, members, invitations, audit log, org settings, user-data erasure | | | ✓ | ✓ |
| Grant/revoke owner, delete organization | | | | ✓ |

## Ingestion pipeline

1. `POST /v1/track | /v1/identify | /v1/batch` — API key resolved (Redis-cached 60s, invalidated on revoke/rotate/archive).
2. Per-key rate limit (fixed window in Redis) → `429` + `Retry-After`.
3. Optional `Idempotency-Key` header: the full response is cached 24h and replayed.
4. Each item validated with Zod (name, identity, timestamps ±1h future / ≤1y past, property keys and 32 KB size) and against the project's event definitions (required properties, types; strict mode rejects unknown events).
5. Message-level idempotency: `SET NX` on `(environment, messageId)` for 24h → `duplicate`. A unique index on `(environment, messageId)` is the durable backstop.
6. Accepted items are enqueued (BullMQ, 8 attempts, exponential backoff) → `202` with per-item results.
7. Worker: `insertMany(ordered:false)` (duplicates skipped) → profile upserts (`$min firstSeen`, `$max lastSeen`, `$inc eventCount`, traits) → event discovery → cache version bump → Redis publish (live stream) → webhook fan-out. Side effects run only for newly inserted documents, so retries are safe.

## Analytics definitions

All metrics are computed from raw events with MongoDB aggregations (indexed on `environment + timestamp`, `+ name`, `+ distinctId`). `$identify` events are excluded from event counts. Buckets are UTC days/weeks (Sunday start)/months.

| Metric | Definition |
|---|---|
| Total events | Count of events in the range |
| Unique users | Distinct `distinctId` in the range |
| Events today | Events since 00:00 UTC |
| Active users (7d) | Distinct users in the last 7 days (compared with the 7 days before) |
| Growth | `(current − previous) / previous` where *previous* is the equally long period immediately before the range |
| API requests | Ingestion requests (`/v1/track|identify|batch`) recorded per environment and day |
| DAU / WAU / MAU | Distinct users in the 1 / 7 / 30 days before the range end; stickiness = DAU ÷ MAU |
| Retention | Users grouped by the period of their first *cohort event* in range; period *N* = % who performed the *return event* N periods after their first event day. Future periods are blank. |
| Funnel | Users enter on step 1 inside the range. Steps must occur in order, each within `windowHours` of entry; the best path over up to 25 entry attempts is counted. Conversion from previous/start, drop-off and median time between steps are reported. |
| Feature exposed | Performed `$feature_exposed` with `properties.feature = key`, or any configured exposure event, **or adopted** |
| Feature adopted | Performed `$feature_used` with `properties.feature = key`, or any configured adoption event |
| Adoption rate | adopted ÷ exposed |
| Conversion comparison | Share of adopters vs. exposed non-adopters who performed the feature's conversion event in the range; lift = relative difference |
| Avg. feature adoption | Mean adoption rate of beta/live features that have exposure in the range |

Results are cached in Redis under `cache:<env>:<version>:…` for 30–120 s. Every processed batch increments the environment's version, so new data invalidates cached analytics immediately.

## Feature flags

`POST /v1/flags` evaluates each feature's rollout for the key's environment: disabled/deprecated → off; all targeting rules must match (`eq, neq, in, contains, gt, lt` on request properties or `distinctId`); then `sha1(key:distinctId) mod 100 < percentage`. Bucketing is deterministic, so a user keeps their variant as the percentage increases. Feature definitions are cached for 30 s and invalidated on change.

## Webhooks

Deliveries are created per (webhook × matching event) and processed by the `webhooks` queue: 5 attempts with exponential backoff (5s base), 10 s timeout, redirects not followed, SSRF guard (private/loopback ranges blocked unless `ALLOW_PRIVATE_WEBHOOKS=true`). Every attempt stores status, duration, response body (2 KB) and redacted request headers. Final failures notify org admins. Signature: `X-FeatureTrack-Signature: t=<unix>,v1=HMAC_SHA256(secret, "<t>.<body>")`.

## Live stream

Workers publish processed events to a Redis channel; every API instance subscribes and emits to Socket.IO rooms `env:<id>`. Clients authenticate with a short-lived socket token fetched for every (re)connection and must pass the same membership/project checks to join a room. The UI seeds the view with the latest 50 stored events and reconnects automatically with backoff.
