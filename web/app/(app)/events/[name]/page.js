'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { Card, PageHeader, StatCard, Skeleton, ErrorState, EmptyState, Table, Badge, Button } from '@/components/ui';
import { TimeChart } from '@/components/charts';
import { DateRangePicker } from '@/components/Shell';
import { EventDrawer } from '@/components/EventDrawer';
import { FilterBar } from '@/components/FilterBar';
import { DefinitionModal } from '@/components/DefinitionModal';
import { fmtNum, fmtDateTime } from '@/lib/format';

export default function EventDetail({ params }) {
  const { name: raw } = use(params);
  const name = decodeURIComponent(raw);
  const { scope, project, env, can } = useWorkspace();
  const [filters, setFilters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [edit, setEdit] = useState(false);
  const { data, error, isLoading, mutate } = useProjectApi('/events/stats', scope ? { ...scope, name, filters: filters.length ? filters : undefined } : null, { refreshInterval: 20000 });
  const def = data?.definition;
  return (
    <>
      <PageHeader
        title={<span className="font-mono">{name}</span>}
        description={def?.description || (def?.displayName ? def.displayName : 'No description yet')}
        breadcrumbs={[{ label: project?.name }, { label: 'Events', href: '/events' }, { label: name }]}
        actions={<>{can('developer') && <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>{def ? 'Edit definition' : 'Define event'}</Button>}<Button variant="secondary" href={`/events?tab=history&name=${encodeURIComponent(name)}`}>View history</Button><DateRangePicker /></>}
      />
      {error ? <Card><ErrorState error={error} onRetry={() => mutate()} /></Card> : (
        <div className="space-y-6">
          <FilterBar value={filters} onChange={setFilters} event={name} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard loading={isLoading} label="Total events" value={data?.total} delta={data?.growth} sub={data ? `vs ${fmtNum(data.previousTotal)} previous period` : undefined} />
            <StatCard loading={isLoading} label="Unique users" value={data?.uniqueUsers} />
            <StatCard loading={isLoading} label="Events today" value={data?.today} />
            <StatCard loading={isLoading} label="All-time total" value={data?.allTimeTotal} sub={def ? <Badge color={def.status === 'active' ? 'green' : 'blue'}>{def.status}</Badge> : 'Not defined'} />
          </div>
          <Card title="Activity" description="Events and unique users per day">
            {!data ? <Skeleton className="h-[280px]" /> : <TimeChart data={data.series} series={[{ key: 'count', label: 'Events' }, { key: 'users', label: 'Unique users', color: 'var(--series-3)' }]} type="line" height={280} />}
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Properties" description="Observed in the most recent 500 events" padded={false}>
              {!data ? <div className="p-5"><Skeleton className="h-40" /></div> : (
                <Table
                  rowKey={(p) => p.name}
                  columns={[
                    { key: 'name', label: 'Property', render: (p) => <span className="font-mono text-xs font-medium">{p.name}{def?.properties?.find((d) => d.name === p.name)?.required && <span className="ml-1 text-[#c43b3a]">*</span>}</span> },
                    { key: 'type', label: 'Type', render: (p) => <Badge>{def?.properties?.find((d) => d.name === p.name)?.type || p.type}</Badge> },
                    { key: 'coverage', label: 'Coverage', align: 'right', render: (p) => `${p.coverage}%` },
                    { key: 'top', label: 'Top values', render: (p) => <span className="block max-w-[220px] truncate text-xs text-subtle">{p.topValues.map((v) => `${v.value} (${v.count})`).join(', ') || '—'}</span> },
                  ]}
                  rows={data.properties}
                  empty={<EmptyState title="No properties observed" />}
                />
              )}
            </Card>
            <Card title="Recent occurrences" padded={false}>
              {!data ? <div className="p-5"><Skeleton className="h-40" /></div> : (
                <Table
                  onRowClick={(e) => setSelected({ ...e, name, environment: env?.id })}
                  columns={[
                    { key: 'user', label: 'User', render: (e) => <Link onClick={(ev) => ev.stopPropagation()} href={`/users/${encodeURIComponent(e.distinctId)}`} className="hover:text-brand-500">{e.distinctId}</Link> },
                    { key: 'props', label: 'Properties', render: (e) => <span className="block max-w-[200px] truncate font-mono text-xs text-subtle">{JSON.stringify(e.properties)}</span> },
                    { key: 'ts', label: 'Time', align: 'right', render: (e) => <span className="whitespace-nowrap text-xs text-subtle">{fmtDateTime(e.timestamp)}</span> },
                  ]}
                  rows={data.recent}
                  empty={<EmptyState title="No occurrences in this range" />}
                />
              )}
            </Card>
          </div>
        </div>
      )}
      <EventDrawer event={selected} onClose={() => setSelected(null)} envName={env?.name} />
      <DefinitionModal open={edit} onClose={() => setEdit(false)} initial={def ? { ...def } : { name }} onSaved={() => mutate()} />
    </>
  );
}
