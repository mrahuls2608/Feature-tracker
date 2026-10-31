'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Search, ScrollText } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { fetcher, qs } from '@/lib/api';
import { Card, PageHeader, Input, Select, Table, Badge, EmptyState, ErrorState, LoadingBlock, Pagination, Modal, JsonView, KeyValue } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

const GROUPS = ['member', 'invitation', 'organization', 'project', 'environment', 'api_key', 'webhook', 'feature', 'funnel', 'event_definition', 'user_data'];
const color = (a) => (a.includes('deleted') || a.includes('revoked') || a.includes('removed') ? 'red' : a.includes('created') || a.includes('invited') || a.includes('accepted') ? 'green' : 'blue');

export default function AuditPage() {
  const { org, orgId, projectList, canOrg } = useWorkspace();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [action, setAction] = useState('');
  const [projectId, setProjectId] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debounced, action, projectId]);
  const { data, error, isLoading, mutate } = useSWR(orgId && canOrg('admin') ? `/orgs/${orgId}/audit-logs${qs({ q: debounced, action, projectId, page, limit: 30 })}` : null, fetcher);
  if (!canOrg('admin')) return <Card><EmptyState icon={ScrollText} title="Admins only" description="Audit logs are available to organization owners and admins." /></Card>;
  return (
    <>
      <PageHeader title="Audit log" description="Who did what, and when, across this organization. Secrets are never recorded." breadcrumbs={[{ label: org?.name }, { label: 'Audit log' }]} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle" /><Input className="pl-9" placeholder="Search actor, action or target…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-48"><option value="">All actions</option>{GROUPS.map((g) => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}</Select>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-48"><option value="">All projects</option>{projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </div>
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : isLoading && !data ? <div className="p-4"><LoadingBlock rows={8} /></div> : (
          <>
            <Table
              onRowClick={setSelected}
              columns={[
                { key: 'action', label: 'Action', render: (a) => <Badge color={color(a.action)} className="font-mono">{a.action}</Badge> },
                { key: 'actor', label: 'Actor', render: (a) => <div><p className="text-sm">{a.actor?.name || 'System'}</p><p className="text-xs text-subtle">{a.actor?.email}</p></div> },
                { key: 'target', label: 'Target', render: (a) => <span className="text-sm">{a.target?.name}<span className="block text-xs text-subtle">{a.target?.type}</span></span> },
                { key: 'project', label: 'Project', render: (a) => <span className="text-xs text-subtle">{projectList.find((p) => p.id === a.project)?.name || (a.project ? '—' : 'Organization')}</span> },
                { key: 'at', label: 'Time', align: 'right', render: (a) => <span className="whitespace-nowrap text-xs text-subtle">{fmtDateTime(a.createdAt)}</span> },
              ]}
              rows={data.items}
              empty={<EmptyState icon={ScrollText} title="No audit entries" description="Actions like inviting members, creating keys and changing settings appear here." />}
            />
            <Pagination page={page} limit={30} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.action} size="lg">
        {selected && (
          <div className="space-y-4">
            <KeyValue items={[['Actor', `${selected.actor?.name || 'System'} ${selected.actor?.email ? `<${selected.actor.email}>` : ''}`], ['Time', fmtDateTime(selected.createdAt)], ['Target', `${selected.target?.type}: ${selected.target?.name}`], ['Target ID', selected.target?.id], ['IP address', selected.ip], ['User agent', selected.userAgent]]} />
            {selected.metadata && <div><p className="label">Context</p><JsonView value={selected.metadata} /></div>}
          </div>
        )}
      </Modal>
    </>
  );
}
