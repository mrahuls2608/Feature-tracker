# Operations runbook

## Deployment

**Topology** (recommended): web (Next.js) and API behind one HTTPS domain or two subdomains; ≥2 API instances; ≥1 worker process; MongoDB Atlas (replica set, M10+ for production); managed Redis with persistence (AOF) enabled.

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | prod | Atlas SRV string. Indexes are synced at boot by Mongoose. |
| `REDIS_URL` | prod | `rediss://` for TLS. Shared by queues, cache, rate limits and pub/sub. |
| `JWT_SECRET` | prod | ≥ 32 random bytes. Rotating it signs everyone out. |
| `ENCRYPTION_KEY` | prod | ≥ 32 random bytes. Encrypts webhook secrets — **rotating it invalidates stored webhook secrets** (rotate each webhook secret afterwards). |
| `WEB_ORIGIN` | prod | Comma-separated dashboard origins (CORS + invite links). |
| `PUBLIC_API_URL` | | Shown in docs/OpenAPI. |
| `COOKIE_SECURE` | | `true` behind HTTPS (default in production). |
| `RUN_WORKERS_INLINE` | | `false` when running dedicated worker processes. |
| `ALLOW_PRIVATE_WEBHOOKS` | | Keep `false` in production (SSRF guard). |
| `RATE_LIMIT_INGEST_PER_MIN`, `RATE_LIMIT_API_PER_MIN`, `RATE_LIMIT_AUTH_PER_MIN` | | Per key / user / IP. |
| `LOG_LEVEL` | | `info` default; JSON logs in production. |
| Web: `API_URL` | yes | Where Next.js proxies `/api`, `/v1`. |
| Web: `NEXT_PUBLIC_API_URL` | yes | Browser-reachable API URL for the live stream (build-time). |

Containers: `server/Dockerfile` (API; worker uses the same image with `node server/src/worker.js`) and `web/Dockerfile`. `docker-compose.yml` runs the complete stack. Graceful shutdown on `SIGTERM` drains HTTP, Socket.IO, workers and connections.

**Load balancer**: enable WebSocket upgrades for `/socket.io`; sticky sessions are not required (Socket.IO uses WebSocket transport first; Redis pub/sub fans events out to every instance). Set `X-Forwarded-*` headers (Express `trust proxy` = 1).

## Health checks & monitoring

- `GET /health` — liveness (process up).
- `GET /health/ready` — readiness: Mongo ping, Redis ping, queue counts (`waiting/active/delayed/failed`). Returns `503` if any dependency fails; use it for readiness probes and uptime alerts.
- Logs: structured JSON (pino) with request id (`X-Request-Id` echoed), method, path, status and latency. Authorization headers, cookies, API keys, passwords and secrets are redacted.
- Suggested alerts: readiness ≠ 200 for 2 min; `ingest` queue `waiting` > 10k or growing for 5 min (add workers); `failed` job count rising; webhook deliveries in `failed` state (admins are also notified in-app); 5xx rate > 1%; Mongo/Redis connection warnings (`mongo disconnected`, `redis error`).

## Scaling

- **Ingestion** is cheap (validate + enqueue). Scale API instances horizontally.
- **Processing**: add worker processes or raise `WORKER_CONCURRENCY`.
- **Analytics**: indexed aggregations + Redis cache. For very large tenants, add Atlas search nodes / analytics nodes, or shard `events` on `{ environment: 1, timestamp: 1 }`.

## Backups & recovery

- **MongoDB Atlas**: enable Cloud Backup with continuous (point-in-time) restore; retain ≥ 7 days PITR + daily snapshots for 30 days. Self-hosted: `mongodump --uri "$MONGODB_URI" --gzip --archive=ft-$(date +%F).gz` nightly to object storage, plus oplog for PITR.
- **Redis** holds no system-of-record data except queued-but-unprocessed jobs. Enable AOF so queued events survive restarts. If Redis is lost: idempotency keys and caches rebuild automatically; in-flight jobs are lost (clients retry with the same `messageId`, which the Mongo unique index de-duplicates).
- **Restore procedure**:
  1. Put the API in maintenance (scale API/workers to 0, or block `/v1` at the LB so SDKs buffer and retry).
  2. Restore the Atlas snapshot / PITR to a new cluster (or `mongorestore --gzip --archive=…`).
  3. Point `MONGODB_URI` at the restored cluster; start API (indexes sync) then workers.
  4. Verify `/health/ready`, sign in, check dashboard totals against expectations, send a test event via the API explorer and confirm it on Live events.
  5. Flush the Redis analytics cache (`redis-cli --scan --pattern 'ft:cache:*' | xargs redis-cli del`) so no stale aggregates are served.
- **RPO/RTO targets** (suggested): RPO ≤ 5 min with PITR; RTO ≤ 1 h.

## Data retention

- Each organization sets **Settings → Organization → Data retention** (7–1825 days, default 365). The `maintenance` queue runs hourly and deletes raw events older than the policy, then invalidates cached analytics.
- Webhook deliveries older than 90 days, API-usage rows older than ~2 years and expired invitations are cleaned up by the same job.
- Data-subject erasure: **Users → user → Delete user data** (admins) removes the profile and every event in that environment and writes an audit entry.
- Deleting a project or organization removes all of its data immediately.

## Security operations

- **Key compromise**: revoke or regenerate the API key (takes effect immediately; API-key cache is invalidated). Audit entries record who did it.
- **Account compromise**: the user changes password (signs out other sessions) or revokes sessions in **Settings → Security**; admins can remove the member.
- **Secret rotation**: `JWT_SECRET` (forces re-login); `ENCRYPTION_KEY` (then rotate every webhook secret); webhook secrets individually from the webhook page.
- Audit logs (**Audit log** page, admins) include actor, action, target, IP, user agent and scrubbed context.

## Routine checks

- Weekly: review failed jobs (`/health/ready` counts), webhook failure notifications, audit log for unexpected key/role changes.
- Quarterly: test a backup restore into a staging cluster using the procedure above.
