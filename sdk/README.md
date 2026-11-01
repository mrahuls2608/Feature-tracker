# @featuretrack/sdk

JavaScript SDK for FeatureTrack. Works in browsers and Node.js 18+ (uses `fetch`).

```bash
npm install @featuretrack/sdk
```

```js
import { FeatureTrack } from '@featuretrack/sdk';

const ft = new FeatureTrack({ apiKey: 'ft_live_…', host: 'https://api.your-featuretrack.com' });

ft.identify('user_123', { email: 'jane@example.com', plan: 'pro' });
ft.track('checkout_started', { cart_value: 129.5 });

if (await ft.isEnabled('new-checkout')) {   // evaluates the flag and records $feature_exposed
  ft.featureUsed('new-checkout');            // counts toward adoption
}

await ft.shutdown();                          // Node.js: flush before exit
```

| Option | Default | |
|---|---|---|
| `apiKey` | — | Environment API key (required) |
| `host` | `http://localhost:4000` | API base URL |
| `flushAt` | `20` | Send when this many messages are queued (max 100 per batch) |
| `flushInterval` | `5000` | Periodic flush in ms (`0` disables) |
| `maxRetries` | `3` | Retries on network errors, 5xx and 429 (honours `Retry-After`) |
| `maxQueueSize` | `1000` | Oldest messages dropped beyond this |
| `persist` | `true` | Browser: keep anonymous/user id in `localStorage` |
| `onError` | — | Called with delivery/validation errors |

Methods: `identify(userId, traits)`, `track(event, properties, { distinctId, timestamp, messageId })`, `register(superProperties)`, `featureExposed(key, props)`, `featureUsed(key, props)`, `getFlags({ distinctId, properties, force })`, `isEnabled(key, { distinctId, properties, trackExposure })`, `reset()`, `flush()`, `shutdown()`.

Every message gets a UUID `messageId`, so retries are de-duplicated server-side. In browsers, queued events are flushed with `keepalive` when the page is hidden.
