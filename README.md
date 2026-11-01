<div align="center">

<img src="web/public/logo.svg" width="64" alt="FeatureTrack logo" />

# FeatureTrack

**Product analytics, event tracking and feature-adoption measurement for engineering and product teams.**

MongoDB · Express · React / Next.js 16 · Node.js · Tailwind CSS · Redis (ioredis + BullMQ) · Socket.IO

`90 automated API tests` · `10 browser end-to-end flows` · `npm audit: 0 vulnerabilities` · All rights reserved

![Dashboard](docs/images/02-dashboard.png)

</div>

---

## Table of contents

1. [The main goal](#1-the-main-goal)
2. [What FeatureTrack does](#2-what-featuretrack-does)
3. [Tour of the live app (screenshots)](#3-tour-of-the-live-app)
4. [Special features](#4-special-features)
5. [Architecture](#5-architecture)
6. [Repository structure](#6-repository-structure)
7. [Complete setup guide](#7-complete-setup-guide)
8. [Integrating your application](#8-integrating-your-application)
9. [Testing — how it is done and results](#9-testing)
10. [Security — design, testing and results](#10-security)
11. [Configuration reference](#11-configuration-reference)
12. [Deployment & operations](#12-deployment--operations)
13. [Adding AI to FeatureTrack](#13-adding-ai-to-featuretrack)
14. [Future of the app (roadmap)](#14-future-of-the-app)
15. [Known limitations](#15-known-limitations)
16. [Further documentation](#16-further-documentation)
17. [Author & license](#17-author--license)

---

## 1. The main goal

> **A developer integrates FeatureTrack into a separate application, real users generate events, and those events become accurate, actionable product insights — securely, per team, per environment.**

Teams ship features constantly but rarely know, with evidence, **which features are actually used, by whom, and whether they move conversion**. FeatureTrack closes that loop:

| For | FeatureTrack delivers |
|---|---|
| **Developers** | One API key per environment, a small SDK, batch + idempotent ingestion, an API explorer and webhooks — integration in minutes. |
| **Product managers & founders** | Dashboards, funnels, retention, engagement and per-user timelines computed from real events — no spreadsheets. |
| **Product teams** | Feature definitions with **exposure → adoption → conversion lift**, plus percentage rollouts and targeting to ship safely. |
| **Organizations** | Multi-tenant workspaces, four roles enforced server-side, project-level access, audit logs, data retention and erasure. |

The whole journey — *sign up → organization → project (Dev / Staging / Prod) → API key → SDK → events → dashboard → funnel → feature adoption → live stream → webhooks → audit log* — works on real persisted data. The repository includes a separate demo application (`examples/demo-store`) that proves it.

> **Deployment status:** FeatureTrack is not deployed publicly yet. Everything below runs locally or in your own infrastructure ([§7](#7-complete-setup-guide), [§12](#12-deployment--operations)).

---

## 2. What FeatureTrack does

| Module | Capabilities |
|---|---|
| **Organizations & workspace** | Create/rename/delete orgs, switch orgs, invite by email (7-day signed links), accept/reject, change roles, remove members, leave, org activity & settings |
| **Roles** | **Owner** (everything), **Admin** (members, projects, settings), **Developer** (keys, events, features, funnels, webhooks), **Viewer** (read-only) |
| **Projects & environments** | Create, edit, archive/restore, delete; every project gets **Development, Staging, Production** with isolated data and keys; per-environment ingestion pause; restricted projects with per-project roles |
| **Dashboard** | Total events, events today, unique users, active users (7d), active features, average adoption, API requests, events per user — with growth vs. the previous period; activity and user charts; top events; top features; recent activity |
| **Events** | Auto-discovered and manually defined events; descriptions, categories, typed and required properties; search; full event history with property filters and pagination; event inspector; per-event volume, users, today, growth, chart, property breakdown, recent occurrences |
| **Ingestion** | `/v1/track`, `/v1/identify`, `/v1/batch` (100 items), `/v1/flags`; API-key auth; validation; message-ID and `Idempotency-Key` de-duplication; per-key rate limits; clear per-item errors |
| **Insights** | Trends (multi-event, total/unique, hour/day/week/month, property breakdown, filters), engagement (DAU/WAU/MAU, stickiness, frequency, active days, most engaged users), cohort retention |
| **Funnels** | 2–10 ordered steps, per-step property filters, conversion window, live preview builder, conversion & drop-off per step, biggest drop-off callout, median time between steps |
| **Features & flags** | Exposure/adoption/conversion metrics, usage trends, related events, adopters vs. non-adopters conversion lift; per-environment rollout %, targeting rules, deterministic bucketing, in-app flag tester |
| **Live events** | Real-time stream over WebSocket, pause/resume with buffered count, search, inspector, throughput meter, automatic reconnection |
| **Users** | Profiles from events and `identify` traits, first/last seen, event counts, activity timeline, top events, feature adoption history, GDPR-style erasure |
| **API keys** | Generate per environment, shown once, masked afterwards, revoke, regenerate, last-used time, creator, usage chart |
| **SDK & docs / API explorer** | In-app quick start, SDK reference, troubleshooting; explorer that executes real requests and shows status, headers, body, errors and cURL |
| **Webhooks** | Endpoints per project/environment, event subscriptions, enable/disable, HMAC-signed payloads, secret rotation, delivery history with request/response, automatic and manual retries |
| **Team, audit, settings** | Invitations, role changes, audit log with filters, profile, password, sessions, notification preferences, org/project/environment settings, data retention |

---

## 3. Tour of the live app

All screenshots were captured automatically from the running application (`e2e/03-screenshots.cjs`) using the seeded *Acme Commerce → Commerce Platform* workspace while the demo store streamed live traffic.

### Sign in & dashboard

| Sign in | Dashboard (dark theme) |
|---|---|
| ![Login](docs/images/01-login.png) | ![Dashboard dark](docs/images/03-dashboard-dark.png) |

### Live events & event inspector

| Live stream (no refresh needed) | Inspecting an event |
|---|---|
| ![Live events](docs/images/04-live-events.png) | ![Event inspector](docs/images/05-event-inspector.png) |

### Events

| Event definitions with volume | Event detail |
|---|---|
| ![Events](docs/images/06-events.png) | ![Event detail](docs/images/07-event-detail.png) |

### Insights

| Trends | Engagement | Retention |
|---|---|---|
| ![Trends](docs/images/08-insights-trends.png) | ![Engagement](docs/images/09-insights-engagement.png) | ![Retention](docs/images/10-insights-retention.png) |

### Funnels

| Funnel results | Builder with live preview |
|---|---|
| ![Funnel](docs/images/11-funnel.png) | ![Funnel builder](docs/images/12-funnel-builder.png) |

### Features & feature flags

| Features list | Feature detail (exposure, adoption, conversion lift) |
|---|---|
| ![Features](docs/images/13-features.png) | ![Feature detail](docs/images/14-feature-detail.png) |

Per-environment rollout with deterministic percentage bucketing:

![Feature rollout](docs/images/15-feature-rollout.png)

### Users

| Tracked users | User profile & timeline |
|---|---|
| ![Users](docs/images/16-users.png) | ![User profile](docs/images/17-user-profile.png) |

### Developer tools

| API keys | SDK & docs | API explorer (real request) |
|---|---|---|
| ![API keys](docs/images/18-api-keys.png) | ![Docs](docs/images/19-sdk-docs.png) | ![Explorer](docs/images/20-api-explorer.png) |

![Webhook deliveries](docs/images/21-webhook-deliveries.png)

### Organization

| Team & roles | Audit log |
|---|---|
| ![Team](docs/images/22-team.png) | ![Audit log](docs/images/23-audit-log.png) |

| Projects | Security & sessions | Mobile |
|---|---|---|
| ![Projects](docs/images/24-projects.png) | ![Settings](docs/images/25-settings-security.png) | <img src="docs/images/26-mobile.png" width="260" alt="Mobile" /> |

---

## 4. Special features

1. **Exactly-once-style ingestion.** Every SDK message carries a UUID `messageId`. Redis `SET NX` rejects repeats for 24 h and a unique MongoDB index on `(environment, messageId)` is the durable backstop. Whole requests can also be replayed safely with `Idempotency-Key`. Retries from flaky mobile networks never double-count.
2. **Feature adoption with conversion lift.** Instead of just counting clicks, each feature reports *exposed → adopted → converted* and compares adopters with exposed non-adopters on a conversion event — the evidence product teams actually need.
3. **Deterministic feature flags.** `sha1(featureKey:userId) mod 100` bucketing means a user keeps their variant as you ramp from 10 % → 50 % → 100 % (unit-tested), with AND-combined targeting rules (`eq, neq, in, contains, gt, lt`).
4. **Self-documenting event schema.** Unknown events are auto-registered as *discovered*; promote them to *active* with typed, required properties and FeatureTrack starts rejecting malformed events with precise `422` errors. *Strict mode* rejects undefined events entirely.
5. **Live stream that scales horizontally.** Workers publish to Redis pub/sub; every API instance relays to Socket.IO rooms. Clients authenticate with a 2-minute socket token refreshed on every reconnect.
6. **Always-fresh cached analytics.** Results are cached in Redis under a per-environment *version*; each processed batch bumps the version, so dashboards are fast **and** never stale.
7. **Real tenant isolation.** Every document carries `org/project/environment`; every query is scoped through membership + project access; another tenant's valid ID returns `404`, never `403`, so existence isn't leaked.
8. **Signed, traceable, retryable webhooks** with an SSRF guard, delivery logs (status, duration, response body) and admin notifications on permanent failure.
9. **A real integration, not a mock.** `examples/demo-store` is a separate app that uses only the public SDK to generate commerce journeys — including a 50/50 *New Checkout* rollout that converts better, so the feature-impact story is visible end to end.
10. **API explorer backed by a machine-readable catalog** (`/api/docs/endpoints`, `/api/docs/openapi.json`) — it executes real requests, so documentation can't drift from the API.

---

## 5. Architecture

### System overview

```mermaid
flowchart LR
  subgraph Client apps
    A[Your web / mobile / backend app<br/>@featuretrack/sdk]
    D[examples/demo-store]
  end
  subgraph FeatureTrack
    API[Express API<br/>/v1 ingestion · /api dashboard<br/>Socket.IO]
    W[BullMQ workers<br/>ingest · webhooks · retention]
    WEB[Next.js 16 dashboard]
  end
  R[(Redis<br/>queues · cache · rate limits<br/>idempotency · pub/sub)]
  M[(MongoDB / Atlas)]
  H[Customer webhook endpoints]

  A -- "API key · POST /v1/batch" --> API
  D -- SDK --> API
  API -- enqueue --> R
  R -- jobs --> W
  W -- persist --> M
  W -- "publish live events" --> R
  R -- subscribe --> API
  API -- "WebSocket events" --> WEB
  WEB -- "/api (same-origin proxy, cookies)" --> API
  API -- queries --> M
  W -- "signed POST" --> H
```

### Event lifecycle

```mermaid
sequenceDiagram
  participant App as Client app (SDK)
  participant API as API /v1
  participant Redis
  participant Worker
  participant Mongo as MongoDB
  participant UI as Dashboard

  App->>API: POST /v1/batch (Bearer ft_live_…)
  API->>Redis: resolve key (cached), rate-limit, Idempotency-Key
  API->>API: Zod + event-definition validation
  API->>Redis: SET NX idem:{env}:{messageId}
  API->>Redis: enqueue accepted events (BullMQ)
  API-->>App: 202 {accepted, duplicates, rejected, results[]}
  Redis->>Worker: job
  Worker->>Mongo: insertMany (dupes skipped) · upsert profiles · discover events
  Worker->>Redis: bump cache version · PUBLISH live
  Worker->>Redis: enqueue webhook deliveries
  Redis-->>API: live message
  API-->>UI: Socket.IO "events" (room env:{id})
```

### Data model

```mermaid
erDiagram
  ORGANIZATION ||--o{ MEMBERSHIP : has
  USER ||--o{ MEMBERSHIP : has
  ORGANIZATION ||--o{ INVITATION : sends
  ORGANIZATION ||--o{ PROJECT : owns
  PROJECT ||--|{ ENVIRONMENT : "dev / staging / prod"
  ENVIRONMENT ||--o{ API_KEY : authenticates
  ENVIRONMENT ||--o{ EVENT : stores
  ENVIRONMENT ||--o{ PROFILE : tracks
  PROJECT ||--o{ EVENT_DEFINITION : documents
  PROJECT ||--o{ FEATURE : measures
  PROJECT ||--o{ FUNNEL : analyzes
  PROJECT ||--o{ WEBHOOK : notifies
  WEBHOOK ||--o{ WEBHOOK_DELIVERY : logs
  ORGANIZATION ||--o{ AUDIT_LOG : records
  USER ||--o{ SESSION : "signed in on"
```

Key indexes on `events`: `(environment, timestamp)`, `(environment, name, timestamp)`, `(environment, distinctId, timestamp)`, `(environment, properties.feature, name, timestamp)`, unique `(environment, messageId)`.

### Technology choices

| Layer | Technology | Why |
|---|---|---|
| API | Express 4, Zod 4, Mongoose 8, pino | Mature, explicit middleware for auth/RBAC/rate limits; schema validation on every input; structured logs |
| Queue & cache | Redis via **ioredis**, **BullMQ** | Durable jobs with retries/backoff, plus cache, rate limits, idempotency and pub/sub on one dependency |
| Database | MongoDB (Atlas-ready) | Flexible event properties, powerful aggregation pipeline for analytics |
| Real time | Socket.IO 4 | WebSocket with automatic fallback and reconnection |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS 3, SWR, Recharts | Fast client dashboard, same-origin API proxy, consistent design system, light/dark themes |
| SDK | Dependency-free ES module | Works in browsers and Node 18+ |

Metric definitions (exactly how each number is computed) are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#analytics-definitions).

---

## 6. Repository structure

```
Feature-tracker/
├── server/                         Express API + workers (Node.js, ES modules)
│   ├── src/
│   │   ├── index.js                HTTP server + Socket.IO + inline workers, graceful shutdown
│   │   ├── worker.js               Standalone worker process (npm run worker)
│   │   ├── app.js                  Express app: security middleware, routers, error handling
│   │   ├── config.js               Environment configuration
│   │   ├── socket.js               Authenticated live-event rooms
│   │   ├── workers.js              BullMQ consumers (ingest, webhooks, maintenance)
│   │   ├── apiCatalog.js           Endpoint catalog → API explorer & OpenAPI
│   │   ├── models/index.js         All Mongoose schemas and indexes
│   │   ├── middleware/             auth (JWT sessions) · rbac · rateLimit · error
│   │   ├── routes/                 auth · orgs · invitations · projects · data · product · webhooks · ingest · health
│   │   ├── services/               ingest · processor · analytics · funnels · features (flags) · webhooks · retention
│   │   └── lib/                    db · redis · queue · cache · crypto · audit · notify · live · dates · validate · logger · errors
│   ├── test/                       unit · security · auth · rbac · ingest · analytics · webhooks (Vitest + Supertest)
│   ├── scripts/seed.js             Demo workspace + traffic generator
│   ├── Dockerfile
│   └── .env.example
├── web/                            Next.js 16 dashboard
│   ├── app/
│   │   ├── login/ register/ onboarding/ invite/[token]/
│   │   └── (app)/                  dashboard · live · events · analytics · funnels · features · users ·
│   │                               api-keys · docs · explorer · webhooks · projects · team · audit · settings · invitations
│   ├── components/                 ui (design system) · charts · Shell (nav, switchers) · forms & drawers
│   ├── lib/                        api client · workspace context · theme · formatting · hooks
│   ├── Dockerfile
│   └── .env.example
├── sdk/                            @featuretrack/sdk (browser + Node) with unit tests
├── examples/demo-store/            Separate "Commerce Platform" app integrated via the SDK
├── e2e/                            Playwright browser tests & screenshot generator
├── docs/                           API · ARCHITECTURE · SECURITY · TESTING · OPERATIONS · USER_GUIDE · ROADMAP · images/
├── docker-compose.yml              MongoDB + Redis + API + worker + web
└── .github/workflows/ci.yml        Tests + build on every push
```

Size: ~10,000 lines of application code (API ≈ 3,700, dashboard ≈ 4,300, tests ≈ 1,000, SDK ≈ 240).

---

## 7. Complete setup guide

### 7.1 Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or newer (22 recommended) | `node -v` |
| npm | 10+ | ships with Node |
| MongoDB | 6+ locally, **or** a MongoDB Atlas cluster | Atlas free tier works for evaluation |
| Redis | 6+ locally, **or** managed (Upstash, Redis Cloud, ElastiCache) | must allow blocking commands (BullMQ) |
| Docker (optional) | 24+ | easiest way to run MongoDB/Redis or the full stack |
| Git | any | |

### 7.2 Get the code and install

```bash
git clone https://github.com/mrahuls2608/Feature-tracker.git
cd Feature-tracker
npm install            # installs all workspaces: server, web, sdk, examples/demo-store
```

### 7.3 Start MongoDB and Redis

**Option A — Docker (local):**
```bash
docker run -d --name ft-mongo -p 27017:27017 -v ft-mongo:/data/db mongo:7
docker run -d --name ft-redis -p 6379:6379 redis:7 redis-server --appendonly yes
```

**Option B — MongoDB Atlas + managed Redis:**
1. Atlas → create a cluster → *Database Access*: add a user → *Network Access*: allow your IP (or `0.0.0.0/0` for testing) → *Connect → Drivers* and copy the `mongodb+srv://…` string. Append the database name: `…mongodb.net/featuretrack?retryWrites=true&w=majority`.
2. Create a Redis database (e.g. Upstash) and copy its `rediss://default:<password>@<host>:<port>` URL.

### 7.4 Configure

```bash
cp server/.env.example server/.env
cp web/.env.example web/.env.local
```

Edit `server/.env` (generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`):

```ini
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/featuretrack     # or your Atlas URI
REDIS_URL=redis://127.0.0.1:6379                        # or your managed Redis URL
JWT_SECRET=<random 48 bytes hex>
ENCRYPTION_KEY=<another random 48 bytes hex>
WEB_ORIGIN=http://localhost:3000
PUBLIC_API_URL=http://localhost:4000
COOKIE_SECURE=false
RUN_WORKERS_INLINE=true
ALLOW_PRIVATE_WEBHOOKS=true     # lets you test webhooks against localhost; keep false in production
```

`web/.env.local`:
```ini
API_URL=http://localhost:4000              # where Next.js proxies /api and /v1
NEXT_PUBLIC_API_URL=http://localhost:4000  # browser-reachable API URL for the live stream
```

### 7.5 Run

```bash
npm run dev:api     # terminal 1 → API, workers and live stream on http://localhost:4000
npm run dev:web     # terminal 2 → dashboard on http://localhost:3000
```

Check health: `curl http://localhost:4000/health/ready` → `{"status":"ok", …}` with MongoDB, Redis and queue checks.

### 7.6 Load demo data (optional, recommended)

```bash
npm run seed
```

Creates *Acme Commerce* with three members, the *Commerce Platform* project, event definitions, three features (one with a 50 % rollout), a checkout funnel and a production API key, then streams **400 simulated customers over 60 days** through the real ingestion API.

Sign in at http://localhost:3000 with **`demo@featuretrack.dev` / `DemoPassw0rd!`** and pick **Production** in the top bar. For continuous live traffic, create a Production key in **API keys** and run:

```bash
FEATURETRACK_API_KEY=ft_live_… npm run live -w examples/demo-store
```

### 7.7 First-run walkthrough (no seed)

1. **Register** at `/register` (password: 10+ characters, upper/lower case and a number).
2. **Create an organization**, then **create a project** — Development, Staging and Production are created automatically.
3. **API keys → Create key** for *Development*; copy it (shown once).
4. **Send events** — either `FEATURETRACK_API_KEY=ft_dev_… npm run simulate`, the **API explorer**, or your own app via the SDK ([§8](#8-integrating-your-application)).
5. Watch them on **Live events**, then explore **Dashboard → Events → Insights → Users**.
6. **Funnels → New funnel**: `user_signed_up → product_viewed → checkout_started → payment_completed`.
7. **Features → New feature** `new-checkout`, set a conversion event, enable a rollout; see exposure, adoption and lift.
8. **Webhooks**, **Team → Invite member**, **Audit log**, **Settings → Data retention**.

### 7.8 Run everything with Docker Compose

```bash
JWT_SECRET=$(openssl rand -hex 32) ENCRYPTION_KEY=$(openssl rand -hex 32) docker compose up --build
```

Starts MongoDB, Redis, the API, a dedicated worker and the dashboard (http://localhost:3000). To use Atlas/managed Redis, set `MONGODB_URI` / `REDIS_URL` and remove the `mongo` / `redis` services.

### 7.9 Useful scripts

| Command | What it does |
|---|---|
| `npm run dev:api` / `npm run dev:web` | Development servers (API auto-restarts with `node --watch`) |
| `npm run worker` | Standalone worker process |
| `npm run seed` | Demo workspace + traffic |
| `npm run simulate` | Demo store backfill (needs `FEATURETRACK_API_KEY`) |
| `npm test` | API (90 tests) + SDK tests |
| `npm run build:web` | Production build of the dashboard |

### 7.10 Troubleshooting setup

| Symptom | Fix |
|---|---|
| `Missing required env var` on start | Set it in `server/.env` (production requires all secrets) |
| `MongoServerSelectionError` | MongoDB not running / Atlas IP not allowed / wrong URI |
| `ECONNREFUSED 6379` | Redis not running or wrong `REDIS_URL` |
| Dashboard shows “Unable to reach FeatureTrack” | API not running, or `API_URL` wrong in `web/.env.local` |
| Live events stuck on “Reconnecting…” | `NEXT_PUBLIC_API_URL` must be reachable from the browser; `WEB_ORIGIN` must match the dashboard URL |
| Events accepted but not visible | Check the environment selector matches the key's environment (`ft_dev_` / `ft_stg_` / `ft_live_`) |

---

## 8. Integrating your application

```js
import { FeatureTrack } from '@featuretrack/sdk';

const ft = new FeatureTrack({ apiKey: 'ft_dev_…', host: 'http://localhost:4000' });

ft.identify('user_123', { email: 'jane@example.com', plan: 'pro' });   // on sign-up / login
ft.track('checkout_started', { cart_value: 129.5, items: 3 });           // any action

if (await ft.isEnabled('new-checkout')) {   // flag evaluation; records $feature_exposed
  showNewCheckout();
  ft.featureUsed('new-checkout');           // counts toward adoption
}

await ft.shutdown();                        // Node.js: flush before exit
```

Plain HTTP works from any language:

```bash
curl -X POST http://localhost:4000/v1/track \
  -H "Authorization: Bearer ft_dev_…" -H "Content-Type: application/json" \
  -d '{"event":"payment_completed","distinctId":"user_123","messageId":"evt_0001","properties":{"amount":49}}'
# → 202 {"status":"accepted","messageId":"evt_0001"}   (repeat → "duplicate")
```

Full reference: [docs/API.md](docs/API.md) · [sdk/README.md](sdk/README.md) · in-app **SDK & docs** and **API explorer**.

---

## 9. Testing

FeatureTrack is tested at four levels. All results below are from the current code.

### 9.1 Summary of results

| Suite | Tool | Tests | Result |
|---|---|---:|---|
| Unit tests (pure logic) | Vitest | 20 | ✅ all pass |
| Security tests (attack-style requests) | Vitest + Supertest | 22 | ✅ all pass |
| API integration tests | Vitest + Supertest | 48 | ✅ all pass |
| SDK unit tests | `node:test` | 4 | ✅ all pass |
| Browser end-to-end flows | Playwright (Chromium) | 10 flows + full-journey crawl of 22 pages | ✅ all pass, 0 page/console errors |
| Dependency audit | `npm audit` | — | ✅ 0 vulnerabilities |
| Production build | `next build` | 28 routes | ✅ succeeds |

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
```

### 9.2 How unit testing is done

`server/test/unit.test.js` tests business rules as **pure functions — no HTTP, no database**, so they run in milliseconds and pinpoint logic bugs:

- **Feature flags** — disabled/deprecated states, every targeting operator, AND-combined rules, rollout share within ±5 % over 2,000 users, determinism per user, and *monotonic ramps* (raising 20 % → 60 % never removes a user who already had the feature).
- **Crypto** — AES-256-GCM round-trip with random IVs and tamper detection, webhook signature format, constant-time comparison, API-key prefixes and hash-only storage.
- **Dates & growth** — preset and custom ranges (inclusive end day), equal-length previous period, rejection of inverted/oversized ranges, growth percentages including the zero baseline.
- **Analytics query building** — filters become safe Mongo conditions, regex metacharacters escaped, operator-injection property names rejected, internal `$identify` excluded.
- **Roles** — role ranking and effective project roles for open vs. restricted projects.
- **Audit scrubbing** — secret-looking keys redacted at any depth.

The SDK has its own unit tests (`sdk/test/sdk.test.js`) with a mocked `fetch`: batching and auth header, retry on 5xx **with identical message IDs**, no retry on 401, and flag evaluation recording an exposure.

### 9.3 How integration testing is done

`server/test/*.test.js` boot the real Express app in-process (Supertest), connect to a **real MongoDB and Redis** (isolated test database and Redis DB/prefix), start the **real BullMQ workers**, and drop the database before the run. Helpers create a workspace (user → org → project → key), ingest events, and `drain()` the queues before asserting, so tests observe the true asynchronous pipeline.

Highlights:
- **Analytics accuracy** — a deterministic six-user dataset asserts exact numbers: totals, unique users, top events, filtered trends, event stats, funnel step counts `[5, 4, 3, 1]` with 20 % overall conversion, the conversion window, step filters, saved funnels, feature exposure 2 / adoption 1 / 50 %, conversion lift, retention and engagement.
- **Ingestion** — auth failures, tenant scoping on stored documents, message-ID and `Idempotency-Key` de-duplication, per-item batch results, the 100-item limit, required/typed properties, strict mode, auto-discovery, environment isolation, key revocation and rotation, archived projects, rate limiting.
- **Roles & isolation** — every role's allowed/forbidden actions, last-owner protection, outsiders get `404`, restricted projects, invitation rules, audit entries without secrets.
- **Webhooks & retention** — signature verification, subscriptions, retries after a 500, disabled endpoints, URL validation, retention deleting only expired events.

### 9.4 How end-to-end (browser) testing is done

`e2e/` contains Playwright scripts that drive the real dashboard in headless Chromium:
- `01-journey.cjs` — registers a new user, completes onboarding, creates an API key **through the UI**, runs the demo store against it, and visits 22 pages collecting any page or console error.
- `02-flows.cjs` — 10 interactive flows: live event appears without refresh; pause buffers and resume flushes; create a feature and save a rollout; build a funnel with live preview; webhook delivered to a local receiver; API explorer executes a real request; invite → accept as a new user → **viewer sees no API-keys nav or create buttons**; audit log shows the invitation; dark mode; no horizontal overflow on a 390 px phone.
- `03-screenshots.cjs` — regenerates every image in this README.

Defects found and fixed by these runs include a stale cached session after onboarding/invite acceptance, a loading-state crash on the Projects page, funnel column misalignment, a clipped environment selector on mobile, and missing message IDs in live-stream events.

### 9.5 Running the tests

```bash
# MongoDB + Redis must be running (defaults: mongodb://127.0.0.1:27017, redis://127.0.0.1:6379/1)
npm test -w server                    # 90 tests
npm test -w sdk                       # 4 tests
TEST_MONGODB_URI=… TEST_REDIS_URL=… npm test -w server   # custom connections
node e2e/01-journey.cjs && node e2e/02-flows.cjs         # browser flows (see e2e/README.md)
npm audit                             # dependency vulnerabilities
```

CI (`.github/workflows/ci.yml`) runs the API and SDK tests against MongoDB and Redis service containers and builds the dashboard on every push and pull request.

Full test inventory: [docs/TESTING.md](docs/TESTING.md).

---

## 10. Security

### 10.1 Security design

| Area | Implementation |
|---|---|
| Passwords | bcrypt cost 12; policy (10+ chars, mixed case, digit); identical error and timing for unknown users |
| Sessions | 15-min JWT access token in an **httpOnly, SameSite=Lax** cookie (Secure in production); 30-day opaque refresh token, **rotated on every use**, stored only as SHA-256, bound to a revocable session; list/revoke sessions; password change signs out other devices |
| Authorization | Owner/Admin/Developer/Viewer enforced **server-side on every route**; project-level access; cross-tenant IDs return `404` |
| API keys | 192-bit random, environment-prefixed, stored as SHA-256 only, shown once, masked afterwards; revocation invalidates the Redis key cache immediately |
| Webhook secrets | Shown once, stored AES-256-GCM encrypted; payloads HMAC-SHA256 signed with timestamp; SSRF guard blocks private/loopback/link-local/metadata addresses; redirects not followed; 10 s timeout |
| Input validation | Zod schemas on every body/query; Mongo-safe property keys (no `.` or `$`); escaped regex; size limits (1 MB ingest, 200 KB dashboard, 32 KB properties) |
| CSRF | SameSite cookies **plus** the server refuses any state-changing `/api` request with a non-JSON content type |
| Headers & CORS | Helmet (CSP, HSTS, nosniff, frame protections), no `X-Powered-By`; credentialed CORS only for configured dashboard origins; ingestion CORS open but key-authenticated |
| Abuse | Redis rate limits per API key, per user and per IP for auth |
| Secrets in logs | pino redaction of auth headers, cookies, keys, passwords; audit metadata scrubbed |
| Privacy | Data retention policy per org; per-user erasure; organization/project deletion removes all data |

### 10.2 How security testing is done

1. **Automated security suite** (`server/test/security.test.js`, 22 tests) sends attack-style requests to the running app: tampered/unsigned/`alg:none`/wrong-secret JWTs, token-type confusion, refresh-token reuse, session revocation, API key vs. session separation, NoSQL operator injection, filter/breakdown path injection, `$`/dotted property keys, regex injection, stored XSS payloads, form-encoded CSRF on body-less destructive endpoints, oversized and malformed bodies, stack-trace leakage, cross-tenant IDOR on webhooks/keys/orgs/events, mass assignment, moving a project across orgs, secret leakage in responses, and SSRF targets (`127.0.0.1`, `localhost`, `10.x`, `192.168.x`, `169.254.169.254`, `[::1]`, `file://`).
2. **Authorization matrix tests** (`rbac.test.js`) for every role and tenant boundary.
3. **Unit tests** for the cryptographic building blocks (tamper detection, signatures, hashing).
4. **Dependency audit** with `npm audit` across all workspaces.
5. **Browser verification** that the UI hides actions a role cannot perform — while the server independently rejects them.

### 10.3 Results

| Check | Result |
|---|---|
| Security test suite | ✅ 22/22 pass |
| Authorization & isolation suite | ✅ 10/10 pass |
| `npm audit` (all workspaces, prod + dev) | ✅ **0 vulnerabilities** |
| Finding fixed during testing | ⚠️→✅ **CSRF on body-less actions:** an empty form-encoded POST (e.g. *revoke API key*) bypassed the JSON-only check because it only inspected parsed bodies. SameSite cookies already blocked it in modern browsers; the server now rejects any non-JSON content type on state-changing requests and a regression test covers it. |
| Dependencies upgraded during testing | Zod 3 → 4 (memory-exhaustion advisory), Next.js 15 → 16 (bundled PostCSS advisories), Vitest 2 → 5 (dev-server advisories) — all 90 API tests and all browser flows re-run green afterwards |

Threat model, residual risks and the hardening checklist: [docs/SECURITY.md](docs/SECURITY.md).

---

## 11. Configuration reference

| Variable | Default (dev) | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/featuretrack` | MongoDB / Atlas connection (required in production) |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection (required in production) |
| `JWT_SECRET` | dev placeholder | Signs session tokens (required in production) |
| `ENCRYPTION_KEY` | dev placeholder | Encrypts webhook secrets (required in production) |
| `PORT` | `4000` | API port |
| `WEB_ORIGIN` | `http://localhost:3000` | Dashboard origin(s), comma-separated; CORS + invite links |
| `PUBLIC_API_URL` | `http://localhost:4000` | Shown in docs / OpenAPI |
| `COOKIE_SECURE` | `false` (`true` in production) | Secure cookies over HTTPS |
| `RUN_WORKERS_INLINE` | `true` | Run workers inside the API process |
| `WORKER_CONCURRENCY` | `8` | Jobs per standalone worker |
| `ALLOW_PRIVATE_WEBHOOKS` | `true` (dev) / `false` (prod) | SSRF guard toggle |
| `RATE_LIMIT_INGEST_PER_MIN` / `RATE_LIMIT_API_PER_MIN` / `RATE_LIMIT_AUTH_PER_MIN` | `1200` / `900` / `30` | Rate limits |
| `INGEST_MAX_BATCH` | `100` | Max items per batch |
| `IDEMPOTENCY_TTL_SEC` | `86400` | De-duplication window |
| `LOG_LEVEL` | `info` | pino log level |
| Web `API_URL` | `http://localhost:4000` | Next.js proxy target |
| Web `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Browser live-stream URL (build time) |

---

## 12. Deployment & operations

Recommended production topology: dashboard and API behind HTTPS (one domain or two subdomains), ≥ 2 API instances, ≥ 1 worker, MongoDB Atlas (M10+, continuous backup), managed Redis with AOF persistence. Enable WebSocket upgrades for `/socket.io` at the load balancer (sticky sessions not required).

- **Health:** `GET /health` (liveness), `GET /health/ready` (MongoDB, Redis, queue depths; `503` when degraded).
- **Logs:** structured JSON with request IDs (`X-Request-Id`).
- **Scaling:** add API instances for ingestion throughput, workers for processing, Atlas analytics nodes or sharding on `{environment, timestamp}` for very large tenants.
- **Backups & recovery:** Atlas point-in-time restore; documented restore procedure, RPO ≤ 5 min / RTO ≤ 1 h targets.
- **Retention:** hourly job enforces each organization's policy.

Step-by-step procedures (alerts, restore, key compromise, secret rotation): [docs/OPERATIONS.md](docs/OPERATIONS.md).

---

## 13. Adding AI to FeatureTrack

FeatureTrack already holds exactly what AI needs: clean, typed, per-tenant event streams with known definitions. The architecture makes AI additions low-risk — they read through the same authorized, environment-scoped services the dashboard uses and never bypass RBAC.

### 13.1 Where AI adds the most value

| Feature | What the user gets | How it plugs in |
|---|---|---|
| **Ask your data (natural language → insight)** | "Why did checkout conversion drop last week?" → chart + explanation | An LLM (e.g. Claude via the Anthropic API) receives the project's event definitions and a set of **tools** that map to existing services — `timeseries`, `computeFunnel`, `retention`, `featureDetail`, `eventStats`. The model chooses tools and parameters; the server executes them with the caller's permissions and returns results for the model to explain. No raw database access, no free-form queries. |
| **Automatic anomaly detection & alerts** | "payment_completed is 42 % below its expected value for a Tuesday" | A new `maintenance` job computes seasonal baselines per event (e.g. median of the same weekday over 8 weeks) and flags deviations; an LLM writes a short, human explanation with likely related changes from the audit log (deployments, flag rollouts). Delivered via notifications and webhooks. |
| **Feature impact summaries** | Weekly narrative per feature: exposure, adoption, conversion lift, statistical confidence | Feature metrics already exist; add significance testing (two-proportion z-test) and let an LLM summarize. |
| **Event-schema assistant** | Suggests descriptions, categories and property types for *discovered* events; flags inconsistent names (`checkoutStarted` vs `checkout_started`) | Runs on event discovery using the sampled property statistics already computed for event detail pages. |
| **Funnel & segment suggestions** | "Users who used *AI Recommendations* convert 1.8× more — create a funnel?" | Correlate feature adoption with conversion events; propose funnels the user can save in one click. |
| **Churn / conversion prediction** | Risk score on each user profile | Train a lightweight model (gradient boosting) offline on per-user aggregates (recency, frequency, feature adoption); store scores on profiles; expose as a filter and webhook trigger. |
| **Smart rollouts** | Automatically pause a rollout when the treatment group's conversion drops | Guardrail job compares exposed vs. control conversion and calls the existing rollout API. |

### 13.2 Reference design for "Ask your data"

```mermaid
sequenceDiagram
  participant U as User (dashboard)
  participant API as FeatureTrack API
  participant LLM as LLM (tool use)
  participant S as Analytics services
  U->>API: POST /api/projects/:id/ai/ask { question, envId, range }
  API->>API: requireAuth + loadProject(viewer) + withEnv
  API->>LLM: question + event definitions + tool schemas
  LLM-->>API: tool_use: computeFunnel({steps, windowHours})
  API->>S: execute with caller's project & environment only
  S-->>API: result
  API->>LLM: tool_result
  LLM-->>API: answer + chart spec
  API-->>U: explanation, chart, "save as funnel" action
```

Implementation guardrails:
- **Tenant safety:** tools receive `envId` from the authorized request, never from the model.
- **Privacy:** send aggregates and definitions, not raw user traits; make AI features opt-in per organization; respect retention and erasure.
- **Cost & latency:** cache answers in Redis by (question hash, cache version); rate-limit per user; stream responses.
- **Auditability:** log each AI request (actor, tools called) in the audit log.
- **Evaluation:** keep a fixed set of questions over the seeded demo dataset with known answers (the same deterministic data used by the integration tests) and run it in CI.

---

## 14. Future of the app

| Horizon | Planned work |
|---|---|
| **Next** | SDKs for React Native, iOS (Swift), Android (Kotlin), Python and Go · anonymous → identified user merging (alias) · saved dashboards and pinned insights · CSV/JSON export · email delivery for invitations and alerts (SMTP/SES) · SSO-ready auth (Google, GitHub) and TOTP 2FA |
| **Growth** | Behavioral cohorts and saved segments · A/B experiments with statistical significance on top of flags · path analysis (what users do before/after an event) · session-level analytics · scheduled email/Slack reports · audit-log export · per-org usage quotas and billing |
| **Scale** | Columnar store for raw events (ClickHouse) with MongoDB for metadata · pre-aggregated rollups for multi-billion-event tenants · Kafka option for ingestion · regional data residency · SAML SSO and SCIM provisioning for enterprises |
| **Intelligence** | The AI capabilities in [§13](#13-adding-ai-to-featuretrack): natural-language questions, anomaly alerts, feature-impact narratives, schema assistant, churn prediction, guarded rollouts |

Detailed roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

---

## 15. Known limitations

- **Not deployed publicly** yet; no hosted demo.
- **Email is not sent.** Invitations produce a shareable link shown to the admin; in-app notifications cover role changes, webhook failures and API-key changes. An email provider can be plugged into `server/src/lib/notify.js`.
- **No anonymous-to-identified merging.** Events sent before `identify` stay on the anonymous ID.
- **Analytics run on raw events in MongoDB** with caching — excellent for small and medium volumes; very large tenants should adopt rollups or a columnar store ([§14](#14-future-of-the-app)).
- **Times are UTC**; the project timezone setting is stored but buckets are not yet shifted.
- **Docker images were not build-verified** in the development environment (registry rate limit); the application itself was verified natively. **Atlas and managed Redis** were not tested — local MongoDB 7 and Redis 7 were used.

---

## 16. Further documentation

| Document | Contents |
|---|---|
| [docs/API.md](docs/API.md) | Every endpoint, parameters, error format |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, tenancy, pipeline, exact metric definitions, flags, webhooks |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, controls, security test inventory, results, hardening checklist |
| [docs/TESTING.md](docs/TESTING.md) | Testing strategy and the full list of tests |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Deployment, monitoring, backups, recovery, retention, incident procedures |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Task-oriented guide for product teams |
| [docs/ROADMAP.md](docs/ROADMAP.md) | AI plans and future roadmap |
| [sdk/README.md](sdk/README.md) | SDK options and methods |
| [e2e/README.md](e2e/README.md) | Browser test scripts |

---

## 17. Author & license

**Author / maintainer:** M N Santhi Swarup

**License:** Copyright © 2026 M N Santhi Swarup. **All rights reserved.** No part of this software may be copied, modified, distributed or used without the author's prior written permission.
