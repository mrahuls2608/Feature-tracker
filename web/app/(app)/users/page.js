'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { Card, PageHeader, Input, Select, Table, EmptyState, ErrorState, LoadingBlock, Pagination } from '@/components/ui';
import { fmtNum, timeAgo, fmtDate } from '@/lib/format';

export default function UsersPage() {
  const { envId, project, env } = useWorkspace();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState('lastSeenAt');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debounced, sort, envId]);
  const { data, error, isLoading, mutate } = useProjectApi('/users', envId ? { envId, q: debounced, sort, page, limit: 25 } : null);
  return (
    <>
      <PageHeader title="Users" description={`People tracked in ${env?.name}. Profiles are created from events and identify calls.`} breadcrumbs={[{ label: project?.name }, { label: 'Users' }]} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle" /><Input className="pl-9" placeholder="Search by user ID, email or name…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-48"><option value="lastSeenAt">Recently active</option><option value="firstSeenAt">Newest</option><option value="eventCount">Most events</option></Select>
        </div>
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : !data ? <div className="p-4"><LoadingBlock rows={8} /></div> : (
          <>
            <Table
              onRowClick={(u) => router.push(`/users/${encodeURIComponent(u.distinctId)}`)}
              columns={[
                { key: 'user', label: 'User', render: (u) => <div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted">{(u.traits?.name || u.distinctId).slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-medium">{u.traits?.name || u.distinctId}</p><p className="truncate text-xs text-subtle">{u.traits?.email || u.distinctId}</p></div></div> },
                { key: 'plan', label: 'Plan', render: (u) => <span className="text-muted">{u.traits?.plan || '—'}</span> },
                { key: 'events', label: 'Events', align: 'right', render: (u) => fmtNum(u.eventCount) },
                { key: 'last', label: 'Last event', render: (u) => <span className="font-mono text-xs text-subtle">{u.lastEvent}</span> },
                { key: 'first', label: 'First seen', align: 'right', render: (u) => <span className="text-xs text-subtle">{fmtDate(u.firstSeenAt)}</span> },
                { key: 'seen', label: 'Last seen', align: 'right', render: (u) => <span className="text-xs text-subtle">{timeAgo(u.lastSeenAt)}</span> },
              ]}
              rows={data.items}
              empty={<EmptyState icon={Users} title={debounced ? 'No users match' : 'No users tracked yet'} description={debounced ? 'Try another search.' : 'Users appear as soon as events arrive with a distinctId.'} />}
            />
            <Pagination page={page} limit={25} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
