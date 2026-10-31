'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Webhook } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Button, Table, Badge, Toggle, EmptyState, ErrorState, LoadingBlock } from '@/components/ui';
import { WebhookForm } from '@/components/WebhookForm';
import { SecretModal } from '@/components/SecretModal';
import { timeAgo } from '@/lib/format';

export default function WebhooksPage() {
  const { project, projectId, environments, can } = useWorkspace();
  const router = useRouter();
  const { toast, error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState(null);
  const { data, error, isLoading, mutate } = useProjectApi('/webhooks', {});
  async function toggle(h, enabled) {
    try {
      await api(`/projects/${projectId}/webhooks/${h.id}`, { method: 'PATCH', body: { enabled } });
      toast(enabled ? 'Webhook enabled' : 'Webhook disabled');
      mutate();
    } catch (err) {
      toastError(err);
    }
  }
  return (
    <>
      <PageHeader title="Webhooks" description="Push events to your systems in real time, with signed payloads, retries and delivery logs." breadcrumbs={[{ label: project?.name }, { label: 'Webhooks' }]} actions={can('developer') && <Button icon={Plus} onClick={() => setOpen(true)}>Add endpoint</Button>} />
      <Card padded={false}>
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !data ? <div className="p-4"><LoadingBlock /></div> : (
          <Table
            onRowClick={(h) => router.push(`/webhooks/${h.id}`)}
            columns={[
              { key: 'url', label: 'Endpoint', render: (h) => <div className="min-w-0"><Link href={`/webhooks/${h.id}`} className="block max-w-md truncate font-mono text-xs font-medium hover:text-brand-500">{h.url}</Link>{h.description && <span className="text-xs text-subtle">{h.description}</span>}</div> },
              { key: 'env', label: 'Environment', render: (h) => environments.find((e) => e.id === h.environment)?.name || 'All' },
              { key: 'events', label: 'Events', render: (h) => (h.events.includes('*') ? <Badge>All events</Badge> : <span className="text-xs">{h.events.length} events</span>) },
              { key: 'stats', label: 'Last 7 days', render: (h) => <span className="flex gap-1.5"><Badge color="green">{h.stats7d.succeeded} ok</Badge>{h.stats7d.failed > 0 && <Badge color="red">{h.stats7d.failed} failed</Badge>}{h.stats7d.retrying > 0 && <Badge color="yellow">{h.stats7d.retrying} retrying</Badge>}</span> },
              { key: 'last', label: 'Last delivery', render: (h) => <span className="text-xs text-subtle">{timeAgo(h.lastDeliveryAt)}</span> },
              { key: 'enabled', label: 'Enabled', align: 'right', render: (h) => <span onClick={(e) => e.stopPropagation()}><Toggle checked={h.enabled} disabled={!can('developer')} onChange={(v) => toggle(h, v)} label="Enabled" /></span> },
            ]}
            rows={data.items}
            empty={<EmptyState icon={Webhook} title="No webhooks configured" description="Add an endpoint to receive events like payment_completed in your own systems." action={can('developer') && <Button icon={Plus} onClick={() => setOpen(true)}>Add endpoint</Button>} />}
          />
        )}
      </Card>
      <WebhookForm open={open} onClose={() => setOpen(false)} onSaved={(h) => { mutate(); setSecret(h.secret); toast('Webhook created'); }} />
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}
