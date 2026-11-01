# API reference

Base URL: your API host (default `http://localhost:4000`). A machine-readable OpenAPI 3 document is served at `GET /api/docs/openapi.json`, and every endpoint below can be executed from the in-app **API explorer**.

## Errors

All errors share one shape:

```json
{ "error": { "code": "validation_error", "message": "Request validation failed", "details": [{ "path": "event", "message": "Required" }] } }
```

| Status | code | Meaning |
|---|---|---|
| 400 | `bad_request` / `invalid_json` | Malformed request |
| 401 | `unauthorized` | Missing/invalid session or API key |
| 403 | `forbidden` | Authenticated but not permitted (role, archived project, ingestion disabled) |
| 404 | `not_found` | Missing — or belongs to a tenant you can't access |
| 409 | `conflict` | Unique constraint (e.g. email in use) |
| 413 | `payload_too_large` | Body over 1 MB (ingestion) / 200 KB (dashboard) |
| 422 | `validation_error` | Field-level validation errors in `details` |
| 429 | `rate_limited` | See `Retry-After`, `X-RateLimit-*` headers |

## Ingestion API (API key)

Authenticate with `Authorization: Bearer ft_dev_…` (also accepted: `X-API-Key`, HTTP Basic username).

### `GET /v1/ping`
Returns `{ ok, projectId, environmentId, environment }`.

### `POST /v1/track`
```json
{ "event": "checkout_started", "distinctId": "user_123", "properties": { "cart_value": 129.5 }, "timestamp": "2026-10-31T10:00:00Z", "messageId": "8f3c…" }
```
- `distinctId` (or `userId` / `anonymousId`) required. `timestamp` defaults to receipt time; must be ≤ 1h in the future and ≤ 1 year old.
- `messageId` (8–128 chars) makes retries idempotent for 24h.
- `202 { "status": "accepted" | "duplicate", "messageId": "…" }`, or `422` with details.

### `POST /v1/identify`
`{ "distinctId": "user_123", "traits": { "email": "…", "plan": "pro" } }` → `202`.

### `POST /v1/batch`
`{ "batch": [ { "type": "track", … }, { "type": "identify", … } ] }` — max 100 items. Optional `Idempotency-Key` header replays the original response (`Idempotent-Replayed: true`).
```json
{ "accepted": 2, "duplicates": 0, "rejected": 1, "results": [ { "index": 0, "status": "accepted", "messageId": "…" }, { "index": 2, "status": "rejected", "errors": [ … ] } ] }
```
Status `202` if anything was accepted/duplicate, else `400`.

### `POST /v1/flags`
`{ "distinctId": "user_123", "properties": { "plan": "pro" }, "keys": ["new-checkout"] }` → `{ "flags": { "new-checkout": true }, "details": { "new-checkout": { "enabled": true, "reason": "rollout" } } }`.

Reserved events: `$identify` (written by identify), `$feature_exposed` and `$feature_used` with `properties.feature = <feature key>`.

## Dashboard API (session cookie)

Authentication: `POST /api/auth/register | login | refresh | logout`, `GET/PATCH /api/auth/me`, `POST /api/auth/change-password`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`, `POST /api/auth/sessions/revoke-others`, `GET /api/auth/notifications`, `POST /api/auth/notifications/read-all`, `POST /api/auth/socket-token`.

Organizations: `GET/POST /api/orgs`, `GET/PATCH/DELETE /api/orgs/:orgId`, `GET /api/orgs/:orgId/members`, `PATCH/DELETE /api/orgs/:orgId/members/:memberId`, `GET/POST /api/orgs/:orgId/invitations`, `DELETE /api/orgs/:orgId/invitations/:id`, `GET /api/orgs/:orgId/audit-logs`, `GET/POST /api/orgs/:orgId/projects`.

Invitations: `GET /api/public/invitations/:token` (no auth), `GET /api/invitations`, `POST /api/invitations/token/:token/accept|reject`, `POST /api/invitations/:id/accept|reject`.

Projects (`/api/projects/:projectId…`):

| Area | Endpoints |
|---|---|
| Project | `GET`, `PATCH`, `DELETE` (body `{confirm: name}`), `POST /archive`, `GET /members`, `PUT /members/:userId`, `GET /activity` |
| Environments | `GET /environments`, `PATCH /environments/:envId` |
| API keys | `GET /api-keys`, `POST /api-keys`, `POST /api-keys/:id/revoke`, `POST /api-keys/:id/regenerate` |
| Event definitions | `GET/POST /event-definitions`, `GET/PATCH/DELETE /event-definitions/:id` |
| Events | `GET /events` (search, filters, pagination), `GET /events/stats?name=`, `GET /events/:id` |
| Analytics | `GET /analytics/overview`, `/trends`, `/retention`, `/engagement`, `/usage`, `/properties` |
| Users | `GET /users`, `GET /users/:distinctId`, `DELETE /users/:distinctId` (erasure) |
| Features | `GET/POST /features`, `GET/PATCH/DELETE /features/:id`, `POST /features/:id/evaluate` |
| Funnels | `GET/POST /funnels`, `POST /funnels/compute`, `GET/PATCH/DELETE /funnels/:id` |
| Webhooks | `GET/POST /webhooks`, `GET/PATCH/DELETE /webhooks/:id`, `POST /webhooks/:id/test`, `POST /webhooks/:id/rotate-secret`, `GET /webhooks/:id/deliveries`, `POST /webhooks/:id/deliveries/:deliveryId/retry` |

Common query parameters for analytics: `envId` (required), `range` (`24h|7d|14d|30d|90d|180d|365d`) or `from`/`to` (ISO date or `YYYY-MM-DD`, `to` inclusive), and `filters` — a JSON array of `{ "property", "operator": "eq|neq|contains|gt|lt|exists", "value" }`.

## Health

`GET /health` (liveness) · `GET /health/ready` (MongoDB ping, Redis ping, queue depths; `503` when degraded).
