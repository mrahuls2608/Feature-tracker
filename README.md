# FeatureTrack

**Product analytics, event tracking and feature adoption for engineering and product teams.**

FeatureTrack lets a team create an organization, add projects with isolated Development / Staging / Production environments, connect their applications with an API key, and turn the events those apps send into dashboards, funnels, retention, feature-adoption metrics, a live event stream, webhooks and audit logs.

Stack: **MongoDB (Atlas)** · **Express** · **React / Next.js 15** · **Node.js** · **Tailwind CSS** · **Redis via ioredis** (BullMQ queues, caching, rate limiting, idempotency, pub/sub) · **Socket.IO** · **Recharts**.

```
┌──────────────┐  POST /v1/track|batch|identify   ┌───────────────┐   BullMQ (Redis)   ┌──────────────┐
│ Your app     │ ───────────────────────────────▶ │  API (Express)│ ─────────────────▶ │  Worker(s)   │
│ @featuretrack│   API key · validation ·          │  /v1  /api    │                    │ persist      │
│ /sdk         │   idempotency · rate limit        └──────┬────────┘                    │ profiles     │
└──────────────┘                                          │ Socket.IO ◀── Redis pub/sub ─┤ discovery    │
                                                          │                              │ webhooks     │
┌──────────────┐   same-origin /api (cookies)      ┌──────┴────────┐                    │ retention    │
│ Dashboard    │ ◀───────────────────────────────▶ │ Next.js web   │                    └──────┬───────┘
│ (browser)    │   live events over WebSocket      └───────────────┘          MongoDB ◀───────┘
└──────────────┘
```

## Contents

| Path | What it is |
|---|---|
| `server/` | Express API, ingestion pipeline, BullMQ workers, Socket.IO live stream, tests |
| `web/` | Next.js 15 (App Router) + Tailwind dashboard |
| `sdk/` | `@featuretrack/sdk` — JavaScript SDK for browsers and Node.js |
| `examples/demo-store/` | A separate "Commerce Platform" app that integrates via the SDK and generates realistic journeys |
| `docs/` | [API reference](docs/API.md), [architecture & metric definitions](docs/ARCHITECTURE.md), [operations runbook](docs/OPERATIONS.md), [user guide](docs/USER_GUIDE.md) |

## Quick start (local)

Requirements: Node.js 20+, MongoDB 6+ (or an Atlas cluster), Redis 6+.

```bash
# 1. Infrastructure (or use Atlas + a managed Redis — see below)
docker run -d --name ft-mongo -p 27017:27017 mongo:7
docker run -d --name ft-redis -p 6379:6379 redis:7

# 2. Install
npm install

# 3. Configure
cp server/.env.example server/.env        # edit secrets for anything beyond local dev
cp web/.env.example web/.env.local

# 4. Run (two terminals)
npm run dev:api        # http://localhost:4000  (API + inline workers + live stream)
npm run dev:web        # http://localhost:3000  (dashboard)

# 5. Optional: seed a demo workspace with 60 days of realistic traffic
npm run seed           # sign in as demo@featuretrack.dev / DemoPassw0rd!  → choose "Production"
```

Or run everything in containers:

```bash
JWT_SECRET=$(openssl rand -hex 32) ENCRYPTION_KEY=$(openssl rand -hex 32) docker compose up --build
```

### Using MongoDB Atlas and managed Redis

Set in `server/.env`:

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/featuretrack?retryWrites=true&w=majority
REDIS_URL=rediss://default:<password>@<host>:<port>
```

Indexes are created automatically on start-up. Redis must allow BullMQ (`maxRetriesPerRequest: null` is set by the app; Upstash/Redis Cloud/ElastiCache all work).

## The end-to-end journey

1. **Register** at `/register` → **create an organization** → **create a project** (Development, Staging and Production environments are created automatically).
2. **API keys** → create a key for an environment (shown once; stored as a SHA-256 hash).
3. **Integrate** your app with the SDK (see **SDK & docs** in the app or [`sdk/README.md`](sdk/README.md)):
   ```js
   import { FeatureTrack } from '@featuretrack/sdk';
   const ft = new FeatureTrack({ apiKey: 'ft_dev_…', host: 'http://localhost:4000' });
   ft.identify('user_123', { email: 'jane@example.com', plan: 'pro' });
   ft.track('checkout_started', { cart_value: 129.5 });
   if (await ft.isEnabled('new-checkout')) ft.featureUsed('new-checkout');
   ```
   Or run the bundled example app against your key:
   ```bash
   FEATURETRACK_API_KEY=ft_dev_… npm run simulate                 # 300 customers, 30 days of journeys
   FEATURETRACK_API_KEY=ft_dev_… npm run live -w examples/demo-store   # continuous live traffic
   ```
4. Watch events arrive on **Live events**, then explore the **Dashboard**, **Events**, **Insights** (trends, engagement, retention), **Users**, build a **Funnel** (sign-up → product viewed → checkout → payment) and create the **New Checkout Experience** feature to see exposure, adoption and conversion lift. Configure **Webhooks**, invite your **Team**, and review the **Audit log**.

## Testing

```bash
npm test                 # API integration tests (needs MongoDB + Redis) and SDK unit tests
npm run build:web        # production build of the dashboard
```

The API suite (`server/test`) runs against real MongoDB and Redis with the BullMQ workers running and covers: authentication & session revocation, RBAC for every role, multi-tenant isolation, restricted projects, invitations, ingestion validation, idempotency (message IDs and `Idempotency-Key`), batch limits, event-definition enforcement, strict mode, key revocation/rotation, rate limiting, environment isolation, exact analytics/funnel/retention/feature numbers on a deterministic dataset, flag evaluation, webhook signing/retries, audit logging without secrets, and data retention. Override the connection strings with `TEST_MONGODB_URI` / `TEST_REDIS_URL`.

## Security highlights

- bcrypt (cost 12) password hashing; constant-time login path; password policy.
- Short-lived JWT access cookie (httpOnly, SameSite=Lax) + rotating refresh tokens bound to revocable sessions.
- RBAC (owner/admin/developer/viewer) enforced server-side on every route, plus project-level access (restricted projects and per-project roles). Non-members get `404`, never a hint that a resource exists.
- API keys and webhook secrets are shown once. Keys are stored as SHA-256 hashes; webhook secrets are AES-256-GCM encrypted at rest. Logs redact auth headers, cookies and secrets; audit metadata is scrubbed.
- Zod validation on every input, Mongo-path-safe property keys, JSON-only mutations (CSRF), Helmet headers, Redis-backed rate limits, SSRF guard for webhook URLs.

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for deployment, monitoring, backups, retention and recovery procedures.
