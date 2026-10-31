# FeatureTrack user guide

## Concepts

- **Organization** — your company workspace. Members have one role: Owner, Admin, Developer or Viewer.
- **Project** — one product or app (e.g. *Commerce Platform*). Each project has **Development**, **Staging** and **Production** environments with completely separate data and API keys. Use the selector in the top bar to switch.
- **Event** — something a user did (`user_signed_up`, `checkout_started`). Events have properties and belong to a user (`distinctId`).
- **Feature** — a product capability you want to measure (*New Checkout*). Measured by *exposure* and *adoption* events, optionally gated with a percentage rollout.

## Everyday tasks

| I want to… | Go to |
|---|---|
| See overall health | **Dashboard** — change the date range at the top right; click any metric to drill in |
| Watch events arrive | **Live events** — filter, pause/resume, click a row to inspect |
| Document or validate an event | **Events → Define event** — add properties, mark required ones and types |
| Inspect one event | **Events → click a name** — volume, unique users, growth, property breakdown, recent occurrences |
| Compare events over time / break down by a property | **Insights → Trends** |
| See DAU/WAU/MAU and most engaged users | **Insights → Engagement** |
| Measure retention | **Insights → Retention** |
| Find where users drop off | **Funnels → New funnel** — pick steps, see a live preview, save |
| Measure a feature | **Features → New feature** — then send `$feature_exposed` / `$feature_used` (or map existing events) |
| Roll out a feature to 10% of pro users | **Features → feature → Feature flag rollout** — enable, set %, add `plan in pro` |
| Look up a customer | **Users** — search by id, email or name |
| Connect an app | **API keys** then **SDK & docs** |
| Try the API | **API explorer** |
| Send events to another system | **Webhooks** |
| Invite a colleague | **Team → Invite member** (share the generated link) |
| Restrict a project to some people | **Projects → Access** |
| Review changes | **Audit log** (admins) |
| Change retention, notifications, password, sessions | **Settings** |

## Reading the numbers

Metric definitions are listed in [ARCHITECTURE.md](ARCHITECTURE.md#analytics-definitions) and shown as tooltips on each card. All times are UTC. Growth compares the selected range with the equally long period before it.
