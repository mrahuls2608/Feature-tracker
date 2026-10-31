'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Send, RotateCcw, KeyRound } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Button, Table, Badge, EmptyState, ErrorState, LoadingBlock, Pagination, Segmented, ConfirmDialog, KeyValue, Modal, JsonView, Toggle } from '@/components/ui';
import { WebhookForm } from '@/components/WebhookForm';
import { SecretModal } from '@/components/SecretModal';
import { fmtDateTime, timeAgo } from '@/lib/format';

const STATUS = { succeeded: 'green', failed: 'red', retrying: 'yellow', pending: 'gray' };

export default function WebhookDetail({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { project, projectId, environments, can } = useWorkspace();
  const { toast, error: toastError } = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [secret, setSecret] = useState(null);
  const [inspect, setInspect] = useState(null);
  const hook = useProjectApi(`/webhooks/${id}`, {});
  const deliveries = useProjectApi(`/webhooks/${id}/deliveries`, { status, page, limit: 20 }, { refreshInterval: 5000 });
  const h = hook.data;

  const call = async (fn, msg) => {
    try {
      const r = await fn();
      if (msg) toast(msg);
      hook.mutate();
      deliveries.mutate();
      return r;
    } catch (err) {
      toastError(err);
    }
  };

  if (hook.error) return <Card><ErrorState error={hook.error} onRetry={() => hook.mutate()} /></Card>;
  return (
    <>
      <PageHeader
        title={<span className="font-mono text-lg">{h?.url || 'Webhook'}</span>}
        description={h?.description}
        breadcrumbs={[{ label: project?.name }, { label: 'Webhooks', href: '/webhooks' }, { label: 'Endpoint' }]}
        actions={can('developer') && h && <>
          <Button variant="secondary" icon={Send} onClick={() => call(() => api(`/projects/${projectId}/webhooks/${id}/test`, { method: 'POST' }), 'Test delivery queued')}>Send test</Button>
          <Button variant="secondary" icon={KeyRound} onClick={() => setRotate(true)}>Rotate secret</Button>
          <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>
          <Button variant="danger-ghost" icon={Trash2} onClick={() => setDel(true)}>Delete</Button>
        </>}
      />
      {!h ? <LoadingBlock /> : (
        <div className="space-y-6">
          <Card>
            <KeyValue items={[
              ['Status', <span key="s" className="flex items-center gap-2"><Toggle checked={h.enabled} disabled={!can('developer')} onChange={(v) => call(() => api(`/projects/${projectId}/webhooks/${id}`, { method: 'PATCH', body: { enabled: v } }), v ? 'Enabled' : 'Disabled')} label="Enabled" />{h.enabled ? 'Enabled' : 'Disabled'}</span>],
              ['Environment', environments.find((e) => e.id === h.environment)?.name || 'All environments'],
              ['Events', h.events.includes('*') ? 'All events' : h.events.join(', ')],
              ['Signing secret', <code key="k" className="font-mono text-xs">{h.secretHint}</code>],
              ['Last delivery', h.lastDeliveryAt ? `${timeAgo(h.lastDeliveryAt)} (${h.lastDeliveryStatus})` : 'Never'],
              ['Created', fmtDateTime(h.createdAt)],
            ]} />
          </Card>
          <Card title="Delivery history" description="Failed deliveries retry up to 5 times with exponential backoff. Refreshes every 5s." padded={false} actions={<Segmented value={status} onChange={(s) => { setStatus(s); setPage(1); }} options={[{ id: '', label: 'All' }, { id: 'succeeded', label: 'Succeeded' }, { id: 'retrying', label: 'Retrying' }, { id: 'failed', label: 'Failed' }]} />}>
            {deliveries.error ? <ErrorState error={deliveries.error} /> : !deliveries.data ? <div className="p-4"><LoadingBlock /></div> : (
              <>
                <Table
                  onRowClick={setInspect}
                  columns={[
                    { key: 'status', label: 'Status', render: (d) => <Badge color={STATUS[d.status]} dot>{d.status}</Badge> },
                    { key: 'event', label: 'Event', render: (d) => <span className="font-mono text-xs">{d.eventName}</span> },
                    { key: 'code', label: 'Response', render: (d) => <span className="text-xs">{d.attempts.at(-1)?.responseStatus || d.attempts.at(-1)?.error?.slice(0, 40) || '—'}</span> },
                    { key: 'attempts', label: 'Attempts', align: 'right', render: (d) => d.attemptCount },
                    { key: 'dur', label: 'Duration', align: 'right', render: (d) => (d.attempts.at(-1)?.durationMs !== undefined ? `${d.attempts.at(-1).durationMs} ms` : '—') },
                    { key: 'at', label: 'Created', align: 'right', render: (d) => <span className="text-xs text-subtle">{fmtDateTime(d.createdAt)}</span> },
                    { key: 'retry', label: '', align: 'right', render: (d) => can('developer') && ['failed', 'succeeded'].includes(d.status) && <Button size="xs" variant="ghost" icon={RotateCcw} onClick={(e) => { e.stopPropagation(); call(() => api(`/projects/${projectId}/webhooks/${id}/deliveries/${d.id}/retry`, { method: 'POST' }), 'Delivery re-queued'); }}>Retry</Button> },
                  ]}
                  rows={deliveries.data.items}
                  empty={<EmptyState title="No deliveries yet" description="Send a test delivery or wait for a matching event." />}
                />
                <Pagination page={page} limit={20} total={deliveries.data.total} onChange={setPage} />
              </>
            )}
          </Card>
        </div>
      )}
      <Modal open={!!inspect} onClose={() => setInspect(null)} size="lg" title="Delivery details" description={inspect && `${inspect.eventName} · ${inspect.status}`}>
        {inspect && (
          <div className="space-y-4">
            <div><p className="label">Request payload</p><JsonView value={{ id: inspect.id, ...inspect.payload }} /></div>
            <div>
              <p className="label">Attempts</p>
              <div className="space-y-2">
                {inspect.attempts.length ? inspect.attempts.map((a, i) => (
                  <div key={i} className="rounded-lg border border-line p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2"><Badge color={a.responseStatus >= 200 && a.responseStatus < 300 ? 'green' : 'red'}>{a.responseStatus || 'error'}</Badge><span className="text-subtle">{fmtDateTime(a.at)} · {a.durationMs} ms</span></div>
                    {a.error && <p className="mt-1.5 text-[#c43b3a]">{a.error}</p>}
                    <p className="mt-2 font-medium text-subtle">Request headers</p><JsonView value={a.requestHeaders} className="mt-1" />
                    {a.responseBody && <><p className="mt-2 font-medium text-subtle">Response body</p><pre className="mt-1 max-h-40 overflow-auto rounded bg-surface p-2 font-mono">{a.responseBody}</pre></>}
                  </div>
                )) : <p className="text-sm text-subtle">Not attempted yet.</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>
      <WebhookForm open={edit} onClose={() => setEdit(false)} initial={h} onSaved={() => { hook.mutate(); toast('Webhook updated'); }} />
      <ConfirmDialog open={rotate} onClose={() => setRotate(false)} danger={false} title="Rotate signing secret?" description="A new secret is generated and used immediately. Update your endpoint's verification code." confirmLabel="Rotate secret" onConfirm={async () => { const r = await call(() => api(`/projects/${projectId}/webhooks/${id}/rotate-secret`, { method: 'POST' })); setRotate(false); if (r) setSecret(r.secret); }} />
      <ConfirmDialog open={del} onClose={() => setDel(false)} title="Delete webhook?" description="Deliveries stop immediately and delivery history is removed." confirmLabel="Delete webhook" onConfirm={async () => { await call(() => api(`/projects/${projectId}/webhooks/${id}`, { method: 'DELETE' }), 'Webhook deleted'); router.replace('/webhooks'); }} />
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}
