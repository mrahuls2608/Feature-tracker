'use client';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Send, Lock, KeyRound, Globe } from 'lucide-react';
import { fetcher, qs } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';
import { Card, PageHeader, Button, Input, Textarea, Field, Badge, ErrorState, LoadingBlock, JsonView, CodeBlock, Tabs, Callout, cx } from '@/components/ui';

const METHOD_COLOR = { GET: 'blue', POST: 'green', PATCH: 'yellow', PUT: 'yellow', DELETE: 'red' };
const AUTH = { apiKey: { icon: KeyRound, label: 'API key' }, session: { icon: Lock, label: 'Session' }, none: { icon: Globe, label: 'Public' } };

export default function Explorer() {
  const { orgId, projectId, envId, project } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR('/docs/endpoints', fetcher);
  const [selectedId, setSelectedId] = useState('track');
  const [apiKey, setApiKey] = useState('');
  const [query, setQuery] = useState({});
  const [body, setBody] = useState('');
  const [idemKey, setIdemKey] = useState('');
  const [res, setRes] = useState(null);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('body');

  useEffect(() => {
    try {
      setApiKey(sessionStorage.getItem('ft_explorer_key') || '');
    } catch {
      /* ignore */
    }
  }, []);

  const ep = data?.items.find((e) => e.id === selectedId);
  const fill = (s) => s.replaceAll('{orgId}', orgId || '').replaceAll('{projectId}', projectId || '').replaceAll('{envId}', envId || '');
  useEffect(() => {
    if (!ep) return;
    setQuery(Object.fromEntries((ep.query || []).map((q) => [q.name, q.name === 'envId' ? envId : q.example || ''])));
    setBody(ep.exampleBody ? fill(JSON.stringify(ep.exampleBody, null, 2)) : '');
    setRes(null);
  }, [selectedId, ep, envId]); // eslint-disable-line react-hooks/exhaustive-deps

  const url = ep ? `${fill(ep.path)}${qs(query)}` : '';
  const groups = useMemo(() => {
    const g = {};
    for (const e of data?.items || []) (g[e.group] ||= []).push(e);
    return g;
  }, [data]);

  async function send() {
    let parsed;
    if (body.trim() && ep.method !== 'GET') {
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        setRes({ status: 0, error: `Invalid JSON body: ${e.message}` });
        return;
      }
    }
    setSending(true);
    const started = performance.now();
    try {
      const headers = { 'content-type': 'application/json' };
      if (ep.auth === 'apiKey' && apiKey) headers.authorization = `Bearer ${apiKey}`;
      if (idemKey) headers['idempotency-key'] = idemKey;
      const r = await fetch(url, { method: ep.method, headers, credentials: ep.auth === 'session' ? 'include' : 'omit', body: parsed ? JSON.stringify(parsed) : undefined });
      const text = await r.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      const pick = ['content-type', 'x-request-id', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after', 'idempotent-replayed'];
      setRes({ status: r.status, ok: r.ok, ms: Math.round(performance.now() - started), body: json, headers: Object.fromEntries(pick.map((h) => [h, r.headers.get(h)]).filter(([, v]) => v)) });
    } catch (e) {
      setRes({ status: 0, error: e.message });
    } finally {
      setSending(false);
    }
  }

  const curl = ep ? [`curl -X ${ep.method} '${typeof window !== 'undefined' ? window.location.origin : ''}${url}'`, ep.auth === 'apiKey' && `  -H 'Authorization: Bearer ${apiKey || 'ft_dev_…'}'`, ep.auth === 'session' && `  -H 'Cookie: ft_at=…'`, `  -H 'Content-Type: application/json'`, idemKey && `  -H 'Idempotency-Key: ${idemKey}'`, body.trim() && ep.method !== 'GET' && `  -d '${body.replace(/\n\s*/g, ' ')}'`].filter(Boolean).join(' \\\n') : '';

  return (
    <>
      <PageHeader title="API explorer" description="Browse endpoints and execute real requests against this FeatureTrack instance." breadcrumbs={[{ label: project?.name || 'Developers' }, { label: 'API explorer' }]} />
      {error ? <Card><ErrorState error={error} onRetry={() => mutate()} /></Card> : !data ? <LoadingBlock rows={6} /> : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card padded={false} className="h-fit lg:sticky lg:top-0">
            <nav className="max-h-[75vh] overflow-y-auto p-2" aria-label="Endpoints">
              {Object.entries(groups).map(([g, eps]) => (
                <div key={g} className="mb-3">
                  <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-subtle">{g}</p>
                  {eps.map((e) => (
                    <button key={e.id} onClick={() => setSelectedId(e.id)} className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs', selectedId === e.id ? 'bg-brand-500/10' : 'hover:bg-surface')}>
                      <Badge color={METHOD_COLOR[e.method]} className="w-12 justify-center">{e.method}</Badge>
                      <span className="truncate">{e.summary}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </Card>
          {ep && (
            <div className="min-w-0 space-y-4">
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={METHOD_COLOR[ep.method]}>{ep.method}</Badge>
                  <code className="min-w-0 flex-1 truncate font-mono text-sm">{url}</code>
                  <Button icon={Send} loading={sending} onClick={send} disabled={ep.auth === 'apiKey' && !apiKey}>Send request</Button>
                </div>
                <p className="mt-3 text-sm text-muted">{ep.description || ep.summary}</p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-subtle">{(() => { const A = AUTH[ep.auth]; return <><A.icon className="h-3.5 w-3.5" />Auth: {A.label}{ep.auth === 'session' && ' (your signed-in session cookie is used)'}</>; })()}</div>
                {ep.auth === 'apiKey' && (
                  <Field label="API key" className="mt-4" hint="Kept in this browser tab's session storage only.">
                    <Input type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); try { sessionStorage.setItem('ft_explorer_key', e.target.value); } catch { /* ignore */ } }} placeholder="ft_dev_…" className="font-mono text-xs" autoComplete="off" />
                  </Field>
                )}
                {ep.headers?.some((h) => h.name === 'Idempotency-Key') || ep.id === 'batch' ? <Field label="Idempotency-Key (optional)" className="mt-3"><Input value={idemKey} onChange={(e) => setIdemKey(e.target.value)} className="font-mono text-xs" placeholder="unique-request-id" /></Field> : null}
              </Card>
              <Card padded={false}>
                <Tabs className="px-3" value={tab} onChange={setTab} tabs={[{ id: 'body', label: 'Request' }, { id: 'params', label: 'Parameters' }, { id: 'errors', label: 'Errors' }, { id: 'curl', label: 'cURL' }]} />
                <div className="p-4">
                  {tab === 'body' && (
                    <div className="space-y-3">
                      {(ep.query || []).map((q) => (
                        <Field key={q.name} label={<>{q.name}{q.required && <span className="text-[#c43b3a]"> *</span>} <span className="font-normal text-subtle">query</span></>}>
                          <Input value={query[q.name] ?? ''} onChange={(e) => setQuery({ ...query, [q.name]: e.target.value })} className="font-mono text-xs" />
                        </Field>
                      ))}
                      {ep.method !== 'GET' && <Field label="JSON body"><Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[220px] font-mono text-xs" spellCheck={false} /></Field>}
                      {ep.method === 'GET' && !(ep.query || []).length && <p className="text-sm text-subtle">No parameters — just send it.</p>}
                    </div>
                  )}
                  {tab === 'params' && (ep.params?.length ? (
                    <table className="w-full text-sm"><thead><tr><th className="table-th px-0">Name</th><th className="table-th">Type</th><th className="table-th">Description</th></tr></thead>
                      <tbody className="divide-y divide-line">{ep.params.map((p) => <tr key={p.name}><td className="py-2 font-mono text-xs">{p.name}{p.required && <span className="text-[#c43b3a]"> *</span>}</td><td className="table-td text-xs text-subtle">{p.type}</td><td className="table-td text-xs">{p.description}</td></tr>)}</tbody>
                    </table>
                  ) : <p className="text-sm text-subtle">See the request tab for query parameters.</p>)}
                  {tab === 'errors' && (ep.errors?.length ? <div className="space-y-3">{ep.errors.map((e, i) => <div key={i}><Badge color="red">{e.status}</Badge><JsonView value={e.body} className="mt-1.5" /></div>)}</div> : <p className="text-sm text-subtle">Standard errors: 401 unauthorized, 403 forbidden, 404 not found, 422 validation_error, 429 rate_limited.</p>)}
                  {tab === 'curl' && <CodeBlock code={curl} language="bash" />}
                </div>
              </Card>
              <Card title="Response" actions={res && res.status > 0 && <span className="flex items-center gap-2 text-xs text-subtle"><Badge color={res.ok ? 'green' : 'red'}>{res.status}</Badge>{res.ms} ms</span>}>
                {!res ? <p className="text-sm text-subtle">Send the request to see the live response.</p> : res.error ? <Callout tone="danger">{res.error}</Callout> : (
                  <div className="space-y-3">
                    {Object.keys(res.headers).length > 0 && <div className="flex flex-wrap gap-2">{Object.entries(res.headers).map(([k, v]) => <span key={k} className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-[11px]"><span className="text-subtle">{k}:</span> {v}</span>)}</div>}
                    <JsonView value={res.body} />
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </>
  );
}
