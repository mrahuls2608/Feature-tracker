'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, ListTree, Trash2 } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Tabs, Input, Select, Table, Badge, Button, EmptyState, ErrorState, LoadingBlock, Pagination, Modal, Field, Textarea, Toggle } from '@/components/ui';
import { DateRangePicker } from '@/components/Shell';
import { FilterBar } from '@/components/FilterBar';
import { EventDrawer } from '@/components/EventDrawer';
import { DefinitionModal } from '@/components/DefinitionModal';
import { fmtNum, fmtDateTime, timeAgo } from '@/lib/format';

const STATUS_COLOR = { active: 'green', discovered: 'blue', deprecated: 'gray' };

function Definitions() {
  const { scope, can } = useWorkspace();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(false);
  const { data, error, isLoading, mutate } = useProjectApi('/event-definitions', scope ? { ...scope, q, status } : null);
  return (
    <>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle" /><Input className="pl-9" placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"><option value="">All statuses</option><option value="active">Active</option><option value="discovered">Discovered</option><option value="deprecated">Deprecated</option></Select>
          {can('developer') && <Button icon={Plus} onClick={() => setModal(true)}>Define event</Button>}
        </div>
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : isLoading && !data ? <div className="p-4"><LoadingBlock rows={6} /></div> : (
          <Table
            columns={[
              { key: 'name', label: 'Event', render: (d) => <Link href={`/events/${encodeURIComponent(d.name)}`} className="group"><span className="font-mono text-[13px] font-medium group-hover:text-brand-500">{d.name}</span>{(d.displayName || d.description) && <span className="mt-0.5 block max-w-md truncate text-xs text-subtle">{d.displayName ? `${d.displayName} — ` : ''}{d.description}</span>}</Link> },
              { key: 'status', label: 'Status', render: (d) => <Badge color={STATUS_COLOR[d.status]}>{d.status}</Badge> },
              { key: 'properties', label: 'Properties', align: 'right', render: (d) => d.properties?.length || 0 },
              { key: 'volume', label: 'Volume', align: 'right', render: (d) => fmtNum(d.volume) },
              { key: 'users', label: 'Users', align: 'right', render: (d) => fmtNum(d.uniqueUsers) },
              { key: 'last', label: 'Last seen', align: 'right', render: (d) => <span className="text-xs text-subtle">{timeAgo(d.lastSeenInEnvAt)}</span> },
            ]}
            rows={data.items}
            empty={<EmptyState icon={ListTree} title={q || status ? 'No matching events' : 'No events yet'} description={q || status ? 'Try a different search.' : 'Events appear automatically when your app sends them, or define them up front.'} />}
          />
        )}
      </Card>
      <DefinitionModal open={modal} onClose={() => setModal(false)} onSaved={() => mutate()} />
    </>
  );
}

function History() {
  const { scope, env } = useWorkspace();
  const params = useSearchParams();
  const [name, setName] = useState(params.get('name') || '');
  const [distinctId, setDistinctId] = useState(params.get('user') || '');
  const [filters, setFilters] = useState([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  useEffect(() => setPage(1), [name, distinctId, filters, scope?.envId]);
  const { data, error, isLoading, mutate } = useProjectApi('/events', scope ? { ...scope, name, distinctId, page, limit: 25, filters: filters.length ? filters : undefined } : null);
  return (
    <Card padded={false}>
      <div className="space-y-3 border-b border-line p-3">
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs font-mono text-xs" placeholder="Event name (exact)" value={name} onChange={(e) => setName(e.target.value.trim())} />
          <Input className="max-w-xs text-xs" placeholder="User ID (exact)" value={distinctId} onChange={(e) => setDistinctId(e.target.value.trim())} />
        </div>
        <FilterBar value={filters} onChange={setFilters} event={name || undefined} />
      </div>
      {error ? <ErrorState error={error} onRetry={() => mutate()} /> : isLoading && !data ? <div className="p-4"><LoadingBlock rows={8} /></div> : (
        <>
          <Table
            onRowClick={setSelected}
            columns={[
              { key: 'name', label: 'Event', render: (e) => <span className="font-mono text-[13px] font-medium">{e.name}</span> },
              { key: 'distinctId', label: 'User', render: (e) => <span className="text-muted">{e.distinctId}</span> },
              { key: 'props', label: 'Properties', render: (e) => <span className="block max-w-sm truncate font-mono text-xs text-subtle">{JSON.stringify(e.properties)}</span> },
              { key: 'ts', label: 'Time', align: 'right', render: (e) => <span className="whitespace-nowrap text-xs text-subtle">{fmtDateTime(e.timestamp)}</span> },
            ]}
            rows={data.items}
            empty={<EmptyState title="No events match" description="Adjust the filters or date range." />}
          />
          <Pagination page={page} limit={25} total={data.total} onChange={setPage} />
        </>
      )}
      <EventDrawer event={selected} onClose={() => setSelected(null)} envName={env?.name} />
    </Card>
  );
}

function EventsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') || 'definitions';
  const { project } = useWorkspace();
  return (
    <>
      <PageHeader title="Events" description="Every action your users perform, defined and searchable." breadcrumbs={[{ label: project?.name }, { label: 'Events' }]} actions={<DateRangePicker />} />
      <Tabs className="mb-5" value={tab} onChange={(t) => router.replace(`/events?tab=${t}`)} tabs={[{ id: 'definitions', label: 'Event definitions' }, { id: 'history', label: 'Event history' }]} />
      {tab === 'definitions' ? <Definitions /> : <History />}
    </>
  );
}

export default function EventsPage() {
  return <Suspense><EventsInner /></Suspense>;
}
