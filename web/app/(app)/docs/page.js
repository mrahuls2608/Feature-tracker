'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PartyPopper } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { Card, PageHeader, CodeBlock, Callout, Tabs, Button } from '@/components/ui';

const HOST = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000' : 'http://localhost:4000';

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function DocsInner() {
  const params = useSearchParams();
  const { env, project } = useWorkspace();
  const [lang, setLang] = useState('js');
  const prefix = env?.type === 'production' ? 'ft_live_' : env?.type === 'staging' ? 'ft_stg_' : 'ft_dev_';
  const key = `${prefix}YOUR_KEY`;
  const toc = [['install', 'Install'], ['quickstart', 'Quick start'], ['identify', 'Identify users'], ['track', 'Track events'], ['features', 'Feature tracking & flags'], ['batch', 'Batch & server-side'], ['http', 'HTTP API'], ['webhooks', 'Verifying webhooks'], ['troubleshooting', 'Troubleshooting']];

  return (
    <>
      <PageHeader title="SDK & integration" description="Connect your application to FeatureTrack in a few minutes." breadcrumbs={[{ label: project?.name || 'Docs' }, { label: 'SDK & docs' }]} actions={<Button variant="secondary" href="/explorer">Open API explorer</Button>} />
      {params.get('welcome') && <Callout tone="success" className="mb-6" title={<span className="flex items-center gap-2"><PartyPopper className="h-4 w-4" />Your project is ready</span>}>Development, Staging and Production environments were created. Next: <Link href="/api-keys" className="font-medium text-brand-500 hover:underline">create an API key</Link>, then follow the quick start below.</Callout>}
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block"><ul className="sticky top-6 space-y-1 text-sm">{toc.map(([id, l]) => <li key={id}><a href={`#${id}`} className="block rounded-md px-2 py-1 text-subtle hover:bg-surface hover:text-ink">{l}</a></li>)}</ul></nav>
        <div className="min-w-0 max-w-3xl space-y-10">
          <Section id="install" title="1. Install">
            <p>The JavaScript SDK works in browsers and Node.js 18+. It batches events, retries with backoff and de-duplicates retries with message IDs.</p>
            <CodeBlock language="bash" code={`npm install @featuretrack/sdk\n# in this repo: the package lives in /sdk (workspace "@featuretrack/sdk")`} />
          </Section>
          <Section id="quickstart" title="2. Quick start">
            <p>Create an API key on the <Link href="/api-keys" className="text-brand-500 hover:underline">API keys</Link> page. Keys are bound to one environment ({env?.name ? <>current: <strong>{env.name}</strong>, prefix <code className="font-mono">{prefix}</code></> : 'dev / staging / production'}).</p>
            <CodeBlock language="javascript" code={`import { FeatureTrack } from '@featuretrack/sdk';\n\nconst ft = new FeatureTrack({\n  apiKey: '${key}',\n  host: '${HOST}',\n});\n\nft.track('product_viewed', { product_id: 'sku_42', price: 49 });`} />
          </Section>
          <Section id="identify" title="3. Identify users">
            <p>Call <code className="font-mono">identify</code> after sign-up or login. Subsequent events are attributed to that user, and traits appear on the user profile.</p>
            <CodeBlock language="javascript" code={`ft.identify('user_123', {\n  email: 'jane@example.com',\n  name: 'Jane Doe',\n  plan: 'pro',\n});\nft.track('user_signed_up', { source: 'google' });\n\n// On logout\nft.reset();`} />
          </Section>
          <Section id="track" title="4. Track events">
            <p>Event names may contain letters, numbers, spaces and <code className="font-mono">_ - . :</code>. Properties are free-form JSON (≤ 32 KB, keys ≤ 64 chars, no dots). Define events on the Events page to document them and enforce required properties and types.</p>
            <CodeBlock language="javascript" code={`ft.track('checkout_started', { cart_value: 129.5, currency: 'USD', items: 3 });\nft.track('payment_completed', { amount: 129.5, method: 'card' });\n\n// Properties added to every event\nft.register({ app_version: '2.4.1' });`} />
          </Section>
          <Section id="features" title="5. Feature tracking & flags">
            <p>Create a feature on the <Link href="/features" className="text-brand-500 hover:underline">Features</Link> page. Exposure (<code className="font-mono">$feature_exposed</code>) and usage (<code className="font-mono">$feature_used</code>) events drive adoption metrics. Rollouts are evaluated server-side and deterministically per user.</p>
            <CodeBlock language="javascript" code={`// Evaluates the flag and records exposure if enabled\nif (await ft.isEnabled('new-checkout')) {\n  showNewCheckout();\n}\n\n// When the user actually uses it\nft.featureUsed('new-checkout', { step: 'payment' });\n\n// All flags for the current user\nconst flags = await ft.getFlags({ properties: { plan: 'pro' } });`} />
          </Section>
          <Section id="batch" title="6. Batch & server-side tracking">
            <p>In Node.js, pass <code className="font-mono">distinctId</code> per call and always <code className="font-mono">await ft.shutdown()</code> before the process exits so queued events are flushed.</p>
            <Tabs value={lang} onChange={setLang} tabs={[{ id: 'js', label: 'Node.js' }, { id: 'curl', label: 'cURL' }, { id: 'python', label: 'Python' }]} />
            {lang === 'js' && <CodeBlock language="javascript" code={`const ft = new FeatureTrack({ apiKey: process.env.FEATURETRACK_API_KEY, host: '${HOST}', flushAt: 50 });\n\nft.track('invoice_paid', { amount: 990 }, { distinctId: 'user_123', timestamp: new Date() });\nawait ft.shutdown();`} />}
            {lang === 'curl' && <CodeBlock language="bash" code={`curl -X POST ${HOST}/v1/batch \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: import-2024-06-01" \\\n  -d '{"batch":[\n    {"type":"identify","distinctId":"user_123","traits":{"plan":"pro"}},\n    {"type":"track","event":"product_viewed","distinctId":"user_123","messageId":"evt_0001","properties":{"product_id":"sku_42"}}\n  ]}'`} />}
            {lang === 'python' && <CodeBlock language="python" code={`import requests, uuid\n\nrequests.post("${HOST}/v1/track",\n  headers={"Authorization": "Bearer ${key}"},\n  json={"event": "payment_completed", "distinctId": "user_123",\n        "messageId": str(uuid.uuid4()), "properties": {"amount": 49}},\n  timeout=5).raise_for_status()`} />}
            <p>A full example application lives in <code className="font-mono">examples/demo-store</code>: run <code className="font-mono">FEATURETRACK_API_KEY={key} npm run simulate</code> to generate realistic commerce journeys.</p>
          </Section>
          <Section id="http" title="7. HTTP API reference">
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm"><thead className="bg-surface"><tr><th className="table-th">Endpoint</th><th className="table-th">Purpose</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {[['GET /v1/ping', 'Verify a key; returns its project & environment'], ['POST /v1/track', 'Single event → 202 { status, messageId }'], ['POST /v1/identify', 'Create/update a user profile with traits'], ['POST /v1/batch', 'Up to 100 track/identify items; per-item results'], ['POST /v1/flags', 'Evaluate feature flags for a user']].map(([e, d]) => <tr key={e}><td className="table-td font-mono text-xs">{e}</td><td className="table-td">{d}</td></tr>)}
                </tbody>
              </table>
            </div>
            <p>Authenticate with <code className="font-mono">Authorization: Bearer &lt;key&gt;</code> (or <code className="font-mono">X-API-Key</code>). Responses: <code className="font-mono">202</code> accepted, <code className="font-mono">401</code> invalid/revoked key, <code className="font-mono">403</code> ingestion disabled or project archived, <code className="font-mono">422</code> validation error with details, <code className="font-mono">429</code> rate limited (see <code className="font-mono">Retry-After</code>). Duplicate <code className="font-mono">messageId</code>s within 24h return <code className="font-mono">status: "duplicate"</code>. The full machine-readable spec is at <a className="text-brand-500 hover:underline" href="/api/docs/openapi.json" target="_blank" rel="noreferrer">/api/docs/openapi.json</a>.</p>
          </Section>
          <Section id="webhooks" title="8. Verifying webhooks">
            <p>Each delivery carries <code className="font-mono">X-FeatureTrack-Signature: t=&lt;unix&gt;,v1=&lt;hmac&gt;</code> where the HMAC-SHA256 is computed over <code className="font-mono">{'`${t}.${rawBody}`'}</code> with your endpoint secret.</p>
            <CodeBlock language="javascript" code={`import crypto from 'node:crypto';\n\nfunction verify(rawBody, header, secret, toleranceSec = 300) {\n  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));\n  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;\n  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');\n  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));\n}`} />
          </Section>
          <Section id="troubleshooting" title="9. Troubleshooting">
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>401 Invalid or revoked API key</strong> — check the key prefix matches the environment and that it hasn't been revoked or regenerated.</li>
              <li><strong>Events not showing</strong> — make sure the environment selector in the top bar matches the key's environment; check the Live events page.</li>
              <li><strong>422 Missing required property</strong> — the event definition marks a property as required; send it or relax the definition.</li>
              <li><strong>Strict mode</strong> — when enabled in project settings, undefined event names are rejected.</li>
              <li><strong>Node scripts exit before sending</strong> — call <code className="font-mono">await ft.shutdown()</code>.</li>
              <li><strong>CORS</strong> — the ingestion API accepts any origin; authentication is the key. Use a dedicated key for public clients.</li>
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}

export default function DocsPage() {
  return <Suspense><DocsInner /></Suspense>;
}
