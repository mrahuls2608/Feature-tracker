'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { X, Plus } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { useEventNames } from '@/lib/hooks';
import { Card, PageHeader, Tabs, Select, Segmented, Skeleton, ErrorState, EmptyState, StatCard, Table, Field, Button, Menu, MenuItem } from '@/components/ui';
import { TimeChart, RetentionGrid } from '@/components/charts';
import { DateRangePicker } from '@/components/Shell';
import { FilterBar } from '@/components/FilterBar';
import { fmtNum, fmtPct, SERIES } from '@/lib/format';

function Trends() {
  const { scope } = useWorkspace();
  const names = useEventNames();
  const [events, setEvents] = useState([]);
  const [metric, setMetric] = useState('total');
  const [interval, setIntervalUnit] = useState('day');
  const [breakdown, setBreakdown] = useState('');
  const [type, setType] = useState('line');
  const [filters, setFilters] = useState([]);
  const props = useProjectApi('/analytics/properties', scope ? { envId: scope.envId } : null);
  const q = scope ? { ...scope, events: events.join(','), metric, interval, breakdown: events.length > 1 ? '' : breakdown, filters: filters.length ? filters : undefined } : null;
  const { data, error, isLoading, mutate } = useProjectApi('/analytics/trends', q);
  const series = (data?.series || []).map((s) => ({ key: s, label: s === 'all' ? (events[0] || 'All events') : s }));
  return (
    <div className="space-y-4">
      <Card padded>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <span className="label">Events</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {events.map((e, i) => (
                <span key={e} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1 pl-2 pr-1 font-mono text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} />{e}
                  <button onClick={() => setEvents(events.filter((x) => x !== e))} aria-label={`Remove ${e}`} className="rounded p-0.5 text-subtle hover:text-ink"><X className="h-3 w-3" /></button>
                </span>
              ))}
              {events.length < 6 && (
                <Menu align="left" className="max-h-72 w-64 overflow-y-auto" trigger={({ toggle }) => <Button size="sm" variant="secondary" icon={Plus} onClick={toggle}>{events.length ? 'Add' : 'All events'}</Button>}>
                  {names.filter((n) => !events.includes(n)).map((n) => <MenuItem key={n} onClick={() => setEvents([...events, n])}><span className="font-mono text-xs">{n}</span></MenuItem>)}
                  {!names.length && <p className="p-2 text-sm text-subtle">No events tracked yet</p>}
                </Menu>
              )}
            </div>
          </div>
          <Field label="Measure"><Segmented value={metric} onChange={setMetric} options={[{ id: 'total', label: 'Total' }, { id: 'unique', label: 'Unique users' }]} /></Field>
          <Field label="Interval"><Segmented value={interval} onChange={setIntervalUnit} options={['hour', 'day', 'week', 'month']} /></Field>
          <Field label="Breakdown">
            <Select value={breakdown} onChange={(e) => setBreakdown(e.target.value)} disabled={events.length > 1} className="w-44 py-1.5 text-xs">
              <option value="">None</option>
              {props.data?.items?.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Chart"><Segmented value={type} onChange={setType} options={['line', 'area', 'bar']} /></Field>
        </div>
        <div className="mt-4 border-t border-line pt-4"><FilterBar value={filters} onChange={setFilters} /></div>
      </Card>
      <Card title={metric === 'unique' ? 'Unique users' : 'Event volume'} description={breakdown && events.length <= 1 ? `Broken down by ${breakdown} (top 8)` : 'Over the selected range'}>
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : isLoading && !data ? <Skeleton className="h-[320px]" /> : <TimeChart data={data.points} series={series} xKey="bucket" type={type} height={320} />}
      </Card>
      {data && (
        <Card title="Totals" padded={false}>
          <Table
            columns={[{ key: 'series', label: 'Series', render: (r) => <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: SERIES[r.i] }} /><span className="font-mono text-xs">{r.label}</span></span> }, { key: 'total', label: metric === 'unique' ? 'Sum of unique per interval' : 'Total', align: 'right', render: (r) => fmtNum(r.total) }]}
            rows={series.map((s, i) => ({ id: s.key, i, label: s.label, total: data.totals?.[s.key] || 0 }))}
            empty={<EmptyState title="No data for this query" />}
          />
        </Card>
      )}
    </div>
  );
}

function Engagement() {
  const { scope } = useWorkspace();
  const [filters, setFilters] = useState([]);
  const { data, error, isLoading, mutate } = useProjectApi('/analytics/engagement', scope ? { ...scope, filters: filters.length ? filters : undefined } : null);
  if (error) return <Card><ErrorState error={error} onRetry={() => mutate()} /></Card>;
  return (
    <div className="space-y-4">
      <FilterBar value={filters} onChange={setFilters} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard loading={isLoading} label="DAU" value={data?.dau} hint="Users active in the 24h before range end" />
        <StatCard loading={isLoading} label="WAU" value={data?.wau} hint="Users active in the 7 days before range end" />
        <StatCard loading={isLoading} label="MAU" value={data?.mau} hint="Users active in the 30 days before range end" />
        <StatCard loading={isLoading} label="Stickiness (DAU/MAU)" value={data ? fmtPct(data.stickiness) : undefined} />
        <StatCard loading={isLoading} label="Avg events / user" value={data?.avgEventsPerUser} />
      </div>
      <Card title="Daily active users">{isLoading && !data ? <Skeleton className="h-[240px]" /> : <TimeChart data={data.dailyActive} series={[{ key: 'users', label: 'Active users', color: 'var(--series-3)' }]} height={240} />}</Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Event frequency" description="Users by number of events in range">{isLoading && !data ? <Skeleton className="h-[220px]" /> : <TimeChart data={data.frequency} xKey="label" series={[{ key: 'users', label: 'Users' }]} type="bar" height={220} />}</Card>
        <Card title="Active days" description="Users by distinct active days in range">{isLoading && !data ? <Skeleton className="h-[220px]" /> : <TimeChart data={data.activeDays} xKey="days" series={[{ key: 'users', label: 'Users', color: 'var(--series-7)' }]} type="bar" height={220} />}</Card>
      </div>
      <Card title="Most engaged users" padded={false}>
        <Table
          columns={[
            { key: 'distinctId', label: 'User', render: (r) => <Link href={`/users/${encodeURIComponent(r.distinctId)}`} className="font-medium hover:text-brand-500">{r.traits?.name || r.distinctId}<span className="block text-xs font-normal text-subtle">{r.traits?.email || r.distinctId}</span></Link> },
            { key: 'events', label: 'Events', align: 'right', render: (r) => fmtNum(r.events) },
            { key: 'activeDays', label: 'Active days', align: 'right' },
          ]}
          rows={(data?.topUsers || []).map((u) => ({ ...u, id: u.distinctId }))}
          empty={<EmptyState title="No active users in this range" />}
        />
      </Card>
    </div>
  );
}

function Retention() {
  const { scope } = useWorkspace();
  const names = useEventNames();
  const [startEvent, setStart] = useState('');
  const [returnEvent, setReturn] = useState('');
  const [period, setPeriod] = useState('week');
  const { data, error, isLoading, mutate } = useProjectApi('/analytics/retention', scope ? { ...scope, startEvent, returnEvent, period, periods: period === 'day' ? 14 : 8 } : null);
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Cohort: users who first did" className="w-60"><Select value={startEvent} onChange={(e) => setStart(e.target.value)}><option value="">Any event</option>{names.map((n) => <option key={n}>{n}</option>)}</Select></Field>
          <Field label="Came back and did" className="w-60"><Select value={returnEvent} onChange={(e) => setReturn(e.target.value)}><option value="">Any event</option>{names.map((n) => <option key={n}>{n}</option>)}</Select></Field>
          <Field label="Period"><Segmented value={period} onChange={setPeriod} options={[{ id: 'day', label: 'Daily' }, { id: 'week', label: 'Weekly' }]} /></Field>
        </div>
      </Card>
      <Card title="Retention cohorts" description="Users are grouped by when they first performed the cohort event within the range. Cells show the % that returned N periods later.">
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : isLoading && !data ? <Skeleton className="h-[300px]" /> : data.cohorts.length ? <RetentionGrid cohorts={data.cohorts} average={data.average} period={data.period} /> : <EmptyState title="No cohort data" description="No users performed the cohort event in this range." />}
      </Card>
    </div>
  );
}

function AnalyticsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') || 'trends';
  const { project } = useWorkspace();
  return (
    <>
      <PageHeader title="Insights" description="Trends, engagement and retention computed from your raw event data." breadcrumbs={[{ label: project?.name }, { label: 'Insights' }]} actions={<DateRangePicker />} />
      <Tabs className="mb-5" value={tab} onChange={(t) => router.replace(`/analytics?tab=${t}`)} tabs={[{ id: 'trends', label: 'Trends' }, { id: 'engagement', label: 'Engagement' }, { id: 'retention', label: 'Retention' }]} />
      {tab === 'trends' && <Trends />}
      {tab === 'engagement' && <Engagement />}
      {tab === 'retention' && <Retention />}
    </>
  );
}

export default function AnalyticsPage() {
  return <Suspense><AnalyticsInner /></Suspense>;
}
