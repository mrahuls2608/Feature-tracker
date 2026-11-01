# Browser end-to-end tests (Playwright)

These scripts drive the real dashboard in headless Chromium against a running stack (API on :4000, web on :3000, MongoDB, Redis).

```bash
npm i -g playwright@1 && npx playwright install chromium   # once
npm run dev:api & npm run build:web && npm start -w web &   # the stack

node e2e/01-journey.cjs      # register → onboarding → API key → demo traffic → visits every page
node e2e/02-flows.cjs        # live stream, pause/resume, feature + rollout, funnel builder, webhook, explorer,
                             # invite → viewer RBAC in UI, audit log, dark mode, mobile overflow
npm run seed && node e2e/03-screenshots.cjs   # regenerates docs/images/*.png from the seeded demo workspace
```

`01` must run before `02` (it saves a session and API key to `e2e/.artifacts/`). Each script prints ✓ per flow and fails on the first broken step; uncaught page errors and console errors are collected and printed at the end.
