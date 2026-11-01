# Roadmap & AI plans

FeatureTrack's goal is to turn real product usage into confident product decisions. The roadmap extends that goal in three directions: **reach** (more platforms and integrations), **depth** (richer analysis) and **intelligence** (AI that explains and acts on the data).

## Guiding principles

1. Every number traceable to raw events, with a documented definition.
2. Tenant isolation and role checks apply to every new surface, including AI.
3. Developer integration stays minutes, not days.
4. New capabilities ship with automated tests, including security tests.

## Now → Next (foundation)

| Item | Value | Notes |
|---|---|---|
| Mobile & server SDKs (React Native, Swift, Kotlin, Python, Go) | Integrate any stack | Same HTTP contract as `/v1`; message IDs for idempotency |
| Anonymous → identified merge (`alias`) | Accurate funnels across sign-up | Store aliases per environment; resolve at query time or rewrite profiles |
| Email delivery (SMTP / SES) | Invitations and alerts reach inboxes | Plug into `lib/notify.js`; respect notification preferences |
| 2FA (TOTP) and Google/GitHub sign-in | Stronger account security | Extend sessions model |
| Saved dashboards & pinned insights | Teams share views | Store query definitions per project |
| CSV/JSON export, audit-log export | Compliance and BI | Streamed, permission-checked |
| Timezone-aware buckets | Correct daily charts for every team | Use `$dateTrunc` `timezone` with the project setting |

## Growth (depth)

| Item | Value |
|---|---|
| Behavioral cohorts & saved segments | Reuse "pro users in DE who adopted dark mode" everywhere |
| Experiments (A/B) with significance | Built on deterministic flag bucketing; sequential testing to avoid peeking bias |
| Path analysis | What users do before/after an event |
| Scheduled reports to email/Slack | Insights delivered without logging in |
| Usage quotas & billing | Commercial SaaS readiness |
| Slack / Segment / warehouse integrations | Fit existing data stacks |

## Scale

| Item | Value |
|---|---|
| Columnar event store (ClickHouse) + MongoDB metadata | Sub-second analytics on billions of events |
| Pre-aggregated rollups (hourly per event/property) | Cheap dashboards for large tenants |
| Kafka ingestion option | Very high write throughput, replay |
| Regional data residency (EU/US/IN) | Compliance |
| SAML SSO, SCIM provisioning | Enterprise identity |

## Intelligence (AI)

| Capability | Description | Building blocks already present |
|---|---|---|
| Ask your data | Natural-language questions answered with charts via LLM tool use over existing analytics services | `services/analytics.js`, `funnels.js`, `features.js`; RBAC middleware |
| Anomaly detection & explanations | Seasonal baselines per event; alerts with likely causes (recent rollouts, deploys from the audit log) | `maintenance` queue, audit log, notifications, webhooks |
| Feature impact narratives | Weekly summary with lift and confidence | Feature metrics + conversion comparison |
| Event-schema assistant | Suggest descriptions/types for discovered events; detect naming inconsistencies | Event discovery + property sampling |
| Churn & conversion prediction | Risk scores on profiles; webhook triggers | Profiles, per-user aggregates |
| Guarded rollouts | Auto-pause a flag when treatment conversion degrades | Rollout API, exposure/conversion metrics |

### AI guardrails

- Tools are executed server-side with the caller's organization, project and environment; the model never chooses tenant scope.
- Send definitions and aggregates, not raw personal traits; AI is opt-in per organization.
- Cache by question + cache version; per-user rate limits; audit every AI request.
- Evaluate against the deterministic dataset used by the integration tests, in CI.
