'use client';
import { useState } from 'react';
import { Plus, KeyRound, RotateCcw, Ban } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Button, Table, Badge, EmptyState, ErrorState, LoadingBlock, Modal, Field, Input, Select, Callout, CopyButton, ConfirmDialog, Segmented } from '@/components/ui';
import { TimeChart } from '@/components/charts';
import { fmtDate, timeAgo } from '@/lib/format';

function SecretReveal({ secret, onClose }) {
  return (
    <Modal open={!!secret} onClose={onClose} title="Copy your API key" description="This is the only time the full key is shown. Store it in a secret manager." footer={<Button onClick={onClose}>I've stored it safely</Button>}>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-3"><code className="min-w-0 flex-1 break-all font-mono text-sm">{secret?.key}</code><CopyButton value={secret?.key || ''} label="Copy" /></div>
      <Callout tone="warning" className="mt-4">FeatureTrack stores only a hash of this key. If you lose it, regenerate the key.</Callout>
    </Modal>
  );
}

export default function ApiKeysPage() {
  const { project, projectId, environments, env, can } = useWorkspace();
  const { toast, error: toastError } = useToast();
  const [filter, setFilter] = useState('all');
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ name: '', envId: '' });
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data, error, isLoading, mutate } = useProjectApi('/api-keys', filter === 'all' ? {} : { envId: filter });
  const usage = useProjectApi('/analytics/usage', env ? { envId: env.id, range: '30d' } : null);

  async function submit() {
    setSaving(true);
    try {
      const res = await api(`/projects/${projectId}/api-keys`, { method: 'POST', body: { name: form.name, envId: form.envId || env?.id } });
      setCreate(false);
      setSecret(res);
      setForm({ name: '', envId: '' });
      mutate();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }
  async function act() {
    setBusy(true);
    try {
      if (confirm.type === 'revoke') {
        await api(`/projects/${projectId}/api-keys/${confirm.key.id}/revoke`, { method: 'POST' });
        toast('Key revoked — requests using it are rejected immediately');
      } else {
        const res = await api(`/projects/${projectId}/api-keys/${confirm.key.id}/regenerate`, { method: 'POST' });
        setSecret(res);
      }
      setConfirm(null);
      mutate();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="API keys" description="Each key authenticates ingestion for exactly one environment." breadcrumbs={[{ label: project?.name }, { label: 'API keys' }]} actions={can('developer') && !project?.archived && <Button icon={Plus} onClick={() => setCreate(true)}>Create key</Button>} />
      <Card padded={false} className="mb-6">
        <div className="border-b border-line p-3"><Segmented value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All environments' }, ...environments.map((e) => ({ id: e.id, label: e.name }))]} /></div>
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : isLoading && !data ? <div className="p-4"><LoadingBlock /></div> : (
          <Table
            columns={[
              { key: 'name', label: 'Name', render: (k) => <span className="font-medium">{k.name}</span> },
              { key: 'key', label: 'Key', render: (k) => <code className="font-mono text-xs text-muted">{k.maskedKey}</code> },
              { key: 'env', label: 'Environment', render: (k) => <span className="flex items-center gap-1.5 text-sm"><span className="h-2 w-2 rounded-full" style={{ background: k.environment?.color }} />{k.environment?.name}</span> },
              { key: 'status', label: 'Status', render: (k) => <Badge color={k.status === 'active' ? 'green' : 'gray'}>{k.status}</Badge> },
              { key: 'created', label: 'Created', render: (k) => <span className="text-xs text-subtle">{fmtDate(k.createdAt)}{k.createdBy && <span className="block">by {k.createdBy.name}</span>}</span> },
              { key: 'used', label: 'Last used', render: (k) => <span className="text-xs text-subtle">{timeAgo(k.lastUsedAt)}</span> },
              { key: 'actions', label: '', align: 'right', render: (k) => can('developer') && (
                <div className="flex justify-end gap-1">
                  <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => setConfirm({ type: 'regenerate', key: k })}>Regenerate</Button>
                  {k.status === 'active' && <Button size="xs" variant="danger-ghost" icon={Ban} onClick={() => setConfirm({ type: 'revoke', key: k })}>Revoke</Button>}
                </div>
              ) },
            ]}
            rows={data.items}
            empty={<EmptyState icon={KeyRound} title="No API keys" description="Create a key for the environment your app will send events from." action={can('developer') && <Button icon={Plus} onClick={() => setCreate(true)}>Create key</Button>} />}
          />
        )}
      </Card>
      <Card title={`Ingestion API usage · ${env?.name}`} description="Requests and accepted events per day, last 30 days">
        {usage.data ? <TimeChart data={usage.data.items} series={[{ key: 'requests', label: 'Requests' }, { key: 'events', label: 'Events accepted', color: 'var(--series-3)' }, { key: 'rejected', label: 'Rejected', color: 'var(--series-8)' }]} type="line" height={220} /> : <LoadingBlock rows={3} />}
      </Card>

      <Modal open={create} onClose={() => setCreate(false)} title="Create API key" footer={<><Button variant="secondary" onClick={() => setCreate(false)}>Cancel</Button><Button loading={saving} disabled={!form.name.trim()} onClick={submit}>Create key</Button></>}>
        <div className="space-y-4">
          <Field label="Name" hint="e.g. “Web app”, “Backend”, “iOS”"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Environment"><Select value={form.envId || env?.id} onChange={(e) => setForm({ ...form, envId: e.target.value })}>{environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
        </div>
      </Modal>
      <SecretReveal secret={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={act}
        loading={busy}
        title={confirm?.type === 'revoke' ? `Revoke “${confirm?.key.name}”?` : `Regenerate “${confirm?.key.name}”?`}
        description={confirm?.type === 'revoke' ? 'Applications using this key will immediately receive 401 errors. This cannot be undone.' : 'A new key is issued and the current key is revoked immediately. Update your applications with the new key.'}
        confirmLabel={confirm?.type === 'revoke' ? 'Revoke key' : 'Regenerate key'}
      />
    </>
  );
}
