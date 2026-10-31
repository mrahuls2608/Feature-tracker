'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Card, PageHeader, StatCard, ErrorState, Skeleton, Table, EmptyState, Badge, Button, ConfirmDialog, Callout } from '@/components/ui';
import { TimeChart, BarList } from '@/components/charts';
import { EventDrawer } from '@/components/EventDrawer';
import { fmtNum, fmtDate, fmtDateTime, timeAgo } from '@/lib/format';

export default function UserDetail({ params }) {
  const { distinctId: raw } = use(params);
  const distinctId = decodeURIComponent(raw);
  const { envId, env, project, projectId, can } = useWorkspace();
  const router = useRouter();
  const { toast, error: toastError } = useToast();
  const [selected, setSelected] = useState(null);
  const [del, setDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: u, error, isLoading, mutate } = useProjectApi(`/users/${encodeURIComponent(distinctId)}`, envId ? { envId } : null);
  async function erase() {
    setDeleting(true);
    try {
      const r = await api(`/projects/${projectId}/users/${encodeURIComponent(distinctId)}`, { method: 'DELETE', query: { envId } });
      toast(`Deleted user and ${fmtNum(r.deletedEvents)} events`);
      router.replace('/users');
    } catch (err) {
      toastError(err);
      setDeleting(false);
    }
  }
  const traits = Object.entries(u?.traits || {});
  return (
    <>
      <PageHeader title={u?.traits?.name || distinctId} description={u?.traits?.email || `User ${distinctId}`} breadcrumbs={[{ label: project?.name }, { label: 'Users', href: '/users' }, { label: distinctId }]} actions={can('admin') && u && <Button variant="danger-ghost" icon={Trash2} onClick={() => setDel(true)}>Delete user data</Button>} />
      {error ? <Card><ErrorState error={error} onRetry={() => mutate()} /></Card> : isLoading && !u ? <Skeleton className="h-96" /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total events" value={u.eventCount} />
            <StatCard label="First seen" value={fmtDate(u.firstSeenAt)} />
            <StatCard label="Last seen" value={timeAgo(u.lastSeenAt)} sub={fmtDateTime(u.lastSeenAt)} />
            <StatCard label="Features used" value={u.features.filter((f) => f.adoptedAt).length} sub={`${u.features.length} exposed`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Activity timeline" description="Events per day, last 90 days" className="lg:col-span-2">
              <TimeChart data={u.timeline} series={[{ key: 'count', label: 'Events' }]} type="bar" height={220} />
            </Card>
            <Card title="Properties" description={`Traits from identify calls · ${env?.name}`}>
              {traits.length ? (
                <dl className="space-y-2.5">
                  {traits.map(([k, v]) => <div key={k} className="flex justify-between gap-3 text-sm"><dt className="font-mono text-xs text-subtle">{k}</dt><dd className="truncate text-right">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>)}
                </dl>
              ) : <EmptyState title="No traits" description="Call identify() with traits to enrich this profile." />}
            </Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Most frequent events">{u.topEvents.length ? <BarList items={u.topEvents} hrefFor={(e) => `/events/${encodeURIComponent(e.name)}`} /> : <EmptyState title="No events" />}</Card>
            <Card title="Feature adoption history" className="lg:col-span-2" padded={false}>
              <Table
                rowKey={(f) => f.featureId}
                columns={[
                  { key: 'name', label: 'Feature', render: (f) => <Link href={`/features/${f.featureId}`} className="font-medium hover:text-brand-500">{f.name}</Link> },
                  { key: 'exposed', label: 'First exposed', render: (f) => fmtDateTime(f.firstExposedAt) },
                  { key: 'adopted', label: 'Adopted', render: (f) => (f.adoptedAt ? <Badge color="green">{fmtDateTime(f.adoptedAt)}</Badge> : <Badge>Not yet</Badge>) },
                ]}
                rows={u.features}
                empty={<EmptyState title="No feature exposure recorded" />}
              />
            </Card>
          </div>
          <Card title="Recent events" description="Latest 50 events" padded={false}>
            <Table
              onRowClick={setSelected}
              columns={[
                { key: 'name', label: 'Event', render: (e) => <span className="font-mono text-[13px] font-medium">{e.name}</span> },
                { key: 'props', label: 'Properties', render: (e) => <span className="block max-w-md truncate font-mono text-xs text-subtle">{JSON.stringify(e.properties)}</span> },
                { key: 'ts', label: 'Time', align: 'right', render: (e) => <span className="whitespace-nowrap text-xs text-subtle">{fmtDateTime(e.timestamp)}</span> },
              ]}
              rows={u.recentEvents}
            />
          </Card>
        </div>
      )}
      <EventDrawer event={selected} onClose={() => setSelected(null)} envName={env?.name} />
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={erase} loading={deleting} title="Delete this user's data?" description={`Permanently deletes the profile and every event for ${distinctId} in ${env?.name}. This is irreversible and is recorded in the audit log.`} confirmLabel="Delete permanently" confirmText={distinctId}>
        <Callout tone="warning" className="mt-3">If the user keeps using your app, new events will create a new profile.</Callout>
      </ConfirmDialog>
    </>
  );
}
