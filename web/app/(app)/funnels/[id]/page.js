'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, TrendingDown } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Button, ErrorState, Skeleton, StatCard, Table, ConfirmDialog, Callout, EmptyState } from '@/components/ui';
import { FunnelChart } from '@/components/charts';
import { DateRangePicker } from '@/components/Shell';
import { FunnelBuilder } from '@/components/FunnelBuilder';
import { FilterBar } from '@/components/FilterBar';
import { fmtNum, fmtDuration } from '@/lib/format';

export default function FunnelDetail({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { scope, project, projectId, can } = useWorkspace();
  const { toast, error: toastError } = useToast();
  const [filters, setFilters] = useState([]);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data, error, isLoading, mutate } = useProjectApi(`/funnels/${id}`, scope ? { ...scope, filters: filters.length ? filters : undefined } : null);
  const r = data?.result;

  async function remove() {
    setDeleting(true);
    try {
      await api(`/projects/${projectId}/funnels/${id}`, { method: 'DELETE' });
      toast('Funnel deleted');
      router.replace('/funnels');
    } catch (err) {
      toastError(err);
      setDeleting(false);
    }
  }

  if (error) return <Card><ErrorState error={error} onRetry={() => mutate()} /></Card>;
  return (
    <>
      <PageHeader
        title={data?.name || 'Funnel'}
        description={data?.description || 'Ordered conversion funnel'}
        breadcrumbs={[{ label: project?.name }, { label: 'Funnels', href: '/funnels' }, { label: data?.name || '…' }]}
        actions={<>{can('developer') && <><Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button><Button variant="danger-ghost" icon={Trash2} onClick={() => setDel(true)}>Delete</Button></>}<DateRangePicker /></>}
      />
      <div className="space-y-6">
        <FilterBar value={filters} onChange={setFilters} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard loading={isLoading} label="Entered funnel" value={r?.entered} hint="Users who performed step 1 in the date range" />
          <StatCard loading={isLoading} label="Converted" value={r?.converted} />
          <StatCard loading={isLoading} label="Overall conversion" value={r ? `${r.overallConversion}%` : undefined} />
          <StatCard loading={isLoading} label="Conversion window" value={data ? (data.windowHours >= 24 ? `${data.windowHours / 24} days` : `${data.windowHours} h`) : undefined} />
        </div>
        {r?.biggestDropOff && <Callout tone="warning" title={`Biggest drop-off: step ${r.biggestDropOff.step + 1} — ${r.biggestDropOff.label}`}>{fmtNum(r.biggestDropOff.users)} users ({r.biggestDropOff.rate}%) left before completing this step.</Callout>}
        <Card title="Conversion by step">
          {isLoading && !data ? <Skeleton className="h-[300px]" /> : r.entered === 0 ? <EmptyState icon={TrendingDown} title="No users entered this funnel" description="No one performed the first step in the selected range and environment." /> : <FunnelChart steps={r.steps} />}
        </Card>
        {r && (
          <Card title="Step details" padded={false}>
            <Table
              rowKey={(s) => s.index}
              columns={[
                { key: 'step', label: 'Step', render: (s) => <span><span className="text-subtle">{s.index + 1}.</span> <span className="font-mono text-xs font-medium">{s.event}</span>{data.steps[s.index]?.filters?.length > 0 && <span className="ml-1 text-xs text-subtle">({data.steps[s.index].filters.map((f) => `${f.property} ${f.operator} ${f.value}`).join(', ')})</span>}</span> },
                { key: 'users', label: 'Users', align: 'right', render: (s) => fmtNum(s.users) },
                { key: 'conv', label: 'From previous', align: 'right', render: (s) => (s.index ? `${s.conversionFromPrevious}%` : '—') },
                { key: 'start', label: 'From start', align: 'right', render: (s) => `${s.conversionFromStart}%` },
                { key: 'drop', label: 'Drop-off', align: 'right', render: (s) => (s.index ? `${fmtNum(s.dropOff)} (${s.dropOffRate}%)` : '—') },
                { key: 'time', label: 'Median time', align: 'right', render: (s) => fmtDuration(s.medianTimeFromPreviousMs) },
              ]}
              rows={r.steps}
            />
          </Card>
        )}
      </div>
      <FunnelBuilder open={edit} onClose={() => setEdit(false)} initial={data ? { ...data } : null} onSaved={() => mutate()} />
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} loading={deleting} title="Delete funnel?" description="The funnel definition will be removed. Event data is not affected." confirmLabel="Delete funnel" />
    </>
  );
}
