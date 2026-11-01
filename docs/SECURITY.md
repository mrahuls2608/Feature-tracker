# Security

This document describes FeatureTrack's threat model, the controls that address each threat, how they are tested, the latest results, and the residual risks and hardening checklist for production.

## Assets

| Asset | Why it matters |
|---|---|
| Customer event data & user profiles | Business-sensitive; may contain personal data (emails, names in traits) |
| API keys | Allow writing events into a customer's environment |
| Webhook signing secrets | Allow forging payloads to customer systems |
| User credentials & sessions | Full access to an organization |
| Tenant boundaries | One customer must never see another's data |

## Threat model & controls

| Threat | Control | Where |
|---|---|---|
| Credential stuffing / brute force | bcrypt (cost 12), per-IP auth rate limit, generic error, dummy hash for unknown users | `routes/auth.js`, `middleware/rateLimit.js` |
| Session theft / replay | httpOnly + SameSite=Lax cookies (Secure in prod), 15-min access JWT, refresh-token rotation with reuse rejection, server-side session revocation, sessions UI | `routes/auth.js`, `middleware/auth.js` |
| JWT forgery / algorithm confusion | HS256 with server secret, issuer + token-type claims checked; `alg:none`, wrong secret and socket tokens rejected | `middleware/auth.js` |
| Cross-tenant access (IDOR) | Every route resolves org/project via membership; environment must belong to project; child resources queried with `project` filter; `404` for foreign IDs | `middleware/rbac.js`, all routers |
| Privilege escalation | Role checks per route; owner role only grantable by owners; last owner protected; restricted projects; UI hiding is cosmetic only | `routes/orgs.js`, `middleware/rbac.js` |
| Mass assignment | Explicit Zod schemas; only whitelisted fields copied | all routers |
| NoSQL / operator injection | Zod types (objects rejected where strings expected); property keys restricted to `[A-Za-z0-9_-$]`, no dots; dotted/`$` property keys rejected at ingestion | `lib/validate.js`, `services/analytics.js`, `services/ingest.js` |
| Regex injection / ReDoS | User input escaped before `$regex` | `routes/data.js`, `routes/orgs.js` |
| Stored XSS | JSON API only; React escapes all rendering; no `dangerouslySetInnerHTML` with user data | `web/` |
| CSRF | SameSite cookies + server rejects state-changing `/api` requests with any non-JSON content type | `app.js` |
| Unauthorized ingestion | API keys (hash lookup), revocation effective immediately, environment ingestion toggle, archived projects blocked | `services/ingest.js` |
| API key leakage | Shown once; stored as SHA-256; masked in UI; redacted from logs and audit | `routes/projects.js`, `lib/logger.js`, `lib/audit.js` |
| Webhook forgery | HMAC-SHA256 over `timestamp.body`; secrets AES-256-GCM encrypted at rest; rotation | `services/webhooks.js`, `lib/crypto.js` |
| SSRF via webhooks | Protocol allow-list, DNS resolution + private/loopback/link-local/CGNAT/metadata blocking, no redirects, 10 s timeout, https-only in production | `services/webhooks.js` |
| Denial of service | Body limits (1 MB / 200 KB), 32 KB properties, 100-item batches, per-key/user/IP rate limits, queue-based ingestion | `app.js`, `services/ingest.js` |
| Information disclosure | Generic 500 messages, no stack traces, no `X-Powered-By`, Helmet headers, non-member `404`s | `middleware/error.js`, `app.js` |
| Secrets in logs | pino redaction paths; audit metadata scrubbing | `lib/logger.js`, `lib/audit.js` |
| Data over-retention | Per-org retention job, user erasure, cascading project/org deletion | `services/retention.js`, `routes/data.js` |

## How security is tested

| Layer | File | What it does |
|---|---|---|
| Attack-style API tests | `server/test/security.test.js` | Sends malicious requests to the running app and asserts they fail safely |
| Authorization matrix | `server/test/rbac.test.js` | Every role × action, tenant boundaries, restricted projects, invitations |
| Ingestion abuse | `server/test/ingest.test.js` | Bad keys, revoked/rotated keys, archived projects, rate limiting, validation |
| Crypto unit tests | `server/test/unit.test.js` | Tamper detection, signatures, constant-time compare, hash-only keys |
| Dependency scanning | `npm audit` | Known CVEs in all workspaces |
| Browser checks | `e2e/02-flows.cjs` | Viewer sees no privileged controls; server still enforces |

### Security test inventory (`security.test.js`)

| # | Test | Expected |
|---|---|---|
| 1 | Hardening headers present, framework hidden | CSP, HSTS, nosniff, request ID; no `X-Powered-By` |
| 2 | Auth cookies flags | `HttpOnly`, `SameSite=Lax`, refresh cookie scoped to `/api/auth` |
| 3 | Credentialed CORS | Allowed for configured origin; absent for `https://evil.example` |
| 4 | Tampered / `alg:none` / wrong-secret / socket-type tokens | `401` |
| 5 | Reused rotated refresh token | `401` |
| 6 | Use after logout | `401` |
| 7 | API key on dashboard API; session on ingestion API | `401` both |
| 8 | `{"email":{"$gt":""}}` login | `422` |
| 9 | Filter path injection (`a.$ne`), dotted breakdown | `400` |
| 10 | Dotted / `$`-prefixed property keys at ingestion | rejected per item |
| 11 | Catastrophic-backtracking regex in search | `200`, escaped |
| 12 | `<img onerror>` payload | stored as inert JSON |
| 13 | Form-encoded POST with a body | `403` |
| 14 | 1.1 MB body / malformed JSON | `413` / `400 invalid_json` |
| 15 | Error bodies | no stack traces |
| 16 | Cross-tenant webhook / key / org / event access | `404` |
| 17 | `passwordHash`, `role`, `_id` in profile PATCH | ignored |
| 18 | Moving a project to another org via PATCH | ignored |
| 19 | Restricted-project role resolution for live stream | no access |
| 20 | Secrets in list/me responses | none of keyHash, passwordHash, secretEncrypted, raw keys, raw webhook secrets |
| 21 | SSRF targets `127.0.0.1`, `localhost`, `10.0.0.5`, `192.168.1.1`, `169.254.169.254`, `[::1]`, `file://` | rejected; public IP allowed |
| 22 | Empty form POST / `text/plain` to destructive endpoints | `403`; legitimate client still works |

## Latest results

| Check | Result |
|---|---|
| `security.test.js` | ✅ 22 / 22 |
| `rbac.test.js` | ✅ 10 / 10 |
| Whole API suite | ✅ 90 / 90 |
| `npm audit` (prod + dev, all workspaces) | ✅ 0 vulnerabilities |

### Findings and remediation during testing

| Finding | Severity | Status |
|---|---|---|
| CSRF guard skipped body-less form posts (e.g. revoke API key, sign out other sessions) | Medium (mitigated by SameSite=Lax in modern browsers) | **Fixed** — any non-JSON content type on state-changing requests is rejected; regression test #22 |
| `zod < 4.6.6` memory exhaustion on oversized constrained collections | High (mitigated by body limits) | **Fixed** — upgraded to Zod 4.6.7 |
| `postcss` advisories via `next@15` | High (build-time only) | **Fixed** — upgraded to Next.js 16 |
| `vitest@2` / `vite` / `esbuild` dev-server advisories | Critical/High (dev only) | **Fixed** — upgraded to Vitest 5 |

## Residual risks & production hardening checklist

- [ ] Set strong `JWT_SECRET` and `ENCRYPTION_KEY` (≥ 32 random bytes) from a secret manager; never commit `.env`.
- [ ] Serve everything over HTTPS; `COOKIE_SECURE=true`; keep `ALLOW_PRIVATE_WEBHOOKS=false`.
- [ ] Restrict MongoDB Atlas network access to your app's egress IPs; use a least-privilege DB user; enable encryption at rest and backups.
- [ ] Use TLS (`rediss://`) and AUTH for Redis; do not expose it publicly.
- [ ] Put a WAF / edge rate limiting in front of `/v1` for volumetric protection.
- [ ] Add 2FA (TOTP) and SSO — planned, not yet implemented.
- [ ] Add an email-verification step for new accounts — planned.
- [ ] Run `npm audit` in CI and keep dependencies patched; consider a periodic external penetration test.
- [ ] Review the audit log for unexpected key creation, role changes and webhook edits.

## Reporting a vulnerability

Contact the maintainer, M N Santhi Swarup, privately. Please do not open public issues for security reports.
