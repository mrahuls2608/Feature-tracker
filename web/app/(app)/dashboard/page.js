'use client';
import Link from 'next/link';
import { Activity, Users, Zap, CalendarClock, Flag, Server, TrendingUp, Gauge, Rocket, KeyRound, BookOpen, Terminal } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { Card, PageHeader, StatCard, EmptyState, ErrorState, LoadingBlock, Button, Skeleton, Badge, Segmented } from '@/components/ui';
import { TimeChart, BarList, Sparkbar } from '@/components/charts';
import { DateRangePicker, rangeLabel } from '@/components/Shell';
import { fmtNum, fmtPct, timeAgo } from '@/lib/format';
import { useState } from 'react';

function GettingStarted() {
  const { can } = useWorkspace();
  const steps = [
    { icon: KeyRound, title: 'Create an API key', body: 'Keys are scoped to one environment.', href: '/api-keys', cta: 'API keys', show: can('developer') },
    { icon: BookOpen, title: 'Install the SDK', body: 'Track events and identify users from your app.', href: '/docs', cta: 'Quick start', show: true },
    { icon: Terminal, title: 'Send a test event', body: 'Use the API explorer to fire a real request.', href: '/explorer', cta: 'Open explorer', show: true },
  ].filter((s) => s.show);
  return (
    <Card className="mb-6" title="Start collecting data" description="No events have been received in this environment for the selected range.">
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-lg border border-line p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/10 text-xs text-brand-600 dark:text-brand-300">{i + 1}</span>{s.title}</div>
            <p className="mt-1.5 text-sm text-subtle">{s.body}</p>
            <Button variant="secondary" size="sm" href={s.href} className="mt-3">{s.cta}</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { scope, project, env, dateRange } = useWorkspace();
  const { data, error, isLoading, mutate } = useProjectApi('/analytics/overview', scope, { refreshInterval: 15000 });
  const [chartMetric, setChartMetric] = useState('events');
  const m = data?.metrics;
  const compare = (k) => (m?.[k]?.previous !== undefined ? `vs ${fmtNum(m[k].previous)} previous period` : undefined);

  return (
    <>
      <PageHeader title="Dashboard" description={`${project?.name} · ${env?.name} · ${rangeLabel(dateRange)}`} breadcrumbs={[{ label: project?.name }, { label: 'Dashboard' }]} actions={<DateRangePicker />} />
      {error ? (
        <Card><ErrorState error={error} onRetry={() => mutate()} /></Card>
      ) : (
        <>
          {data && m.totalEvents.value === 0 && <GettingStarted />}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard loading={isLoading} label="Total events" icon={Activity} value={m?.totalEvents.value} delta={m?.totalEvents.growth} sub={compare('totalEvents')} href="/events" hint="Events received in the selected range (excludes $identify)" />
            <StatCard loading={isLoading} label="Events today" icon={CalendarClock} value={m?.eventsToday.value} href="/live" hint="Events since 00:00 UTC" sub="Since 00:00 UTC" />
            <StatCard loading={isLoading} label="Unique users" icon={Users} value={m?.uniqueUsers.value} delta={m?.uniqueUsers.growth} sub={compare('uniqueUsers')} href="/users" hint="Distinct users with ≥1 event in range" />
            <StatCard loading={isLoading} label="Active users (7d)" icon={TrendingUp} value={m?.activeUsers.value} delta={m?.activeUsers.growth} sub="vs prior 7 days" href="/analytics?tab=engagement" hint="Distinct users active in the last 7 days" />
            <StatCard loading={isLoading} label="Active features" icon={Flag} value={m?.activeFeatures.value} sub={m ? `${m.activeFeatures.withActivity} with activity` : undefined} href="/features" hint="Features in beta or live status" />
            <StatCard loading={isLoading} label="Avg. feature adoption" icon={Gauge} value={m ? fmtPct(m.featureAdoption.value) : undefined} href="/features" hint="Mean adoption rate of active features with exposure" />
            <StatCard loading={isLoading} label="API requests" icon={Server} value={m?.apiRequests.value} delta={m?.apiRequests.growth} sub={compare('apiRequests')} href="/api-keys" hint="Ingestion API requests in range" />
            <StatCard loading={isLoading} label="Events per user" icon={Zap} value={m?.eventsPerUser.value} href="/analytics?tab=engagement" hint="Total events ÷ unique users" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card
              className="xl:col-span-2"
              title={chartMetric === 'events' ? 'Event activity' : 'Unique users'}
              description={chartMetric === 'events' ? 'Events per day' : 'Distinct users per day'}
              actions={<Segmented value={chartMetric} onChange={setChartMetric} options={[{ id: 'events', label: 'Events' }, { id: 'users', label: 'Users' }]} />}
            >
              {isLoading && !data ? <Skeleton className="h-[260px] w-full" /> : <TimeChart data={data?.series || []} series={[{ key: chartMetric, label: chartMetric === 'events' ? 'Events' : 'Unique users', color: chartMetric === 'events' ? 'var(--series-1)' : 'var(--series-3)' }]} />}
            </Card>
            <Card title="Top events" description="By volume in range" actions={<Link href="/events" className="text-xs text-brand-500 hover:underline">View all</Link>}>
              {isLoading && !data ? <LoadingBlock rows={6} /> : data?.topEvents?.length ? <BarList items={data.topEvents.slice(0, 8)} hrefFor={(e) => `/events/${encodeURIComponent(e.name)}`} secondary={(e) => `${fmtNum(e.users)} users`} /> : <EmptyState title="No events yet" description="Top events appear once data arrives." />}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card title="Top features" description="Adoption among exposed users" actions={<Link href="/features" className="text-xs text-brand-500 hover:underline">All features</Link>}>
              {isLoading && !data ? <LoadingBlock rows={4} /> : data?.topFeatures?.length ? (
                <ul className="space-y-4">
                  {data.topFeatures.map((f) => (
                    <li key={f.id}>
                      <Link href={`/features/${f.id}`} className="block">
                        <div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium">{f.name}</span><span className="tabular-nums">{fmtPct(f.adoptionRate)}</span></div>
                        <Sparkbar value={f.adoptionRate} />
                        <p className="mt-1 text-xs text-subtle">{fmtNum(f.adoptedUsers)} adopted of {fmtNum(f.exposedUsers)} exposed</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={Rocket} title="No active features" description="Define features to measure exposure and adoption." action={<Button size="sm" variant="secondary" href="/features">Create feature</Button>} />}
            </Card>
            <Card title="Unique user trend" description="Daily active users">
              {isLoading && !data ? <Skeleton className="h-[200px] w-full" /> : <TimeChart data={data?.series || []} series={[{ key: 'users', label: 'Users', color: 'var(--series-3)' }]} type="bar" height={200} />}
            </Card>
            <Card title="Recent activity" description="Latest events" actions={<Link href="/live" className="text-xs text-brand-500 hover:underline">Live view</Link>} padded={false}>
              {isLoading && !data ? <div className="p-5"><LoadingBlock rows={5} /></div> : data?.recent?.length ? (
                <ul className="divide-y divide-line">
                  {data.recent.slice(0, 8).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/events/${encodeURIComponent(e.name)}`} className="block truncate font-mono text-xs font-medium hover:text-brand-500">{e.name}</Link>
                        <Link href={`/users/${encodeURIComponent(e.distinctId)}`} className="block truncate text-xs text-subtle hover:text-ink">{e.distinctId}</Link>
                      </div>
                      <span className="shrink-0 text-xs text-subtle">{timeAgo(e.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No recent activity" />}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
