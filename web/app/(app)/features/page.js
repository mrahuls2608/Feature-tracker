'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Flag, Search } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { Card, PageHeader, Button, EmptyState, ErrorState, LoadingBlock, Table, Badge, Input, Select, Callout } from '@/components/ui';
import { Sparkbar } from '@/components/charts';
import { DateRangePicker } from '@/components/Shell';
import { FeatureForm } from '@/components/FeatureForm';
import { fmtNum, fmtPct, FEATURE_STATUS_COLOR as STATUS_COLOR } from '@/lib/format';



export default function FeaturesPage() {
  const { scope, project, env, can } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const { data, error, isLoading, mutate } = useProjectApi('/features', scope);
  const items = (data?.items || []).filter((f) => (!status || f.status === status) && (!q || `${f.name} ${f.key} ${(f.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageHeader title="Features" description="Define product features and measure exposure, adoption and impact." breadcrumbs={[{ label: project?.name }, { label: 'Features' }]} actions={<>{can('developer') && <Button icon={Plus} onClick={() => setOpen(true)}>New feature</Button>}<DateRangePicker /></>} />
      <Callout className="mb-4" title="How feature metrics are calculated">
        <strong>Exposed</strong> users triggered <code className="font-mono">$feature_exposed</code> (properties.feature = key), a configured exposure event, or adopted the feature. <strong>Adopted</strong> users triggered <code className="font-mono">$feature_used</code> or a configured adoption event. Adoption rate = adopted ÷ exposed, in {env?.name} for the selected range.
      </Callout>
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle" /><Input className="pl-9" placeholder="Search features…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"><option value="">All statuses</option>{['planned', 'beta', 'live', 'deprecated'].map((s) => <option key={s}>{s}</option>)}</Select>
        </div>
        {error ? <ErrorState error={error} onRetry={() => mutate()} /> : isLoading && !data ? <div className="p-4"><LoadingBlock rows={5} /></div> : (
          <Table
            onRowClick={(f) => router.push(`/features/${f.id}`)}
            columns={[
              { key: 'name', label: 'Feature', render: (f) => <div><Link href={`/features/${f.id}`} className="font-medium hover:text-brand-500">{f.name}</Link><p className="font-mono text-xs text-subtle">{f.key}</p></div> },
              { key: 'status', label: 'Status', render: (f) => <Badge color={STATUS_COLOR[f.status]}>{f.status}</Badge> },
              { key: 'flag', label: `Flag (${env?.name})`, render: (f) => { const r = f.rollouts?.find((x) => x.environment === env?.id); return r?.enabled ? <Badge color="green" dot>{r.percentage}%</Badge> : <Badge>off</Badge>; } },
              { key: 'exposed', label: 'Exposed', align: 'right', render: (f) => fmtNum(f.metrics?.exposedUsers) },
              { key: 'adopted', label: 'Adopted', align: 'right', render: (f) => fmtNum(f.metrics?.adoptedUsers) },
              { key: 'rate', label: 'Adoption', className: 'w-48', render: (f) => <div className="flex items-center gap-2"><Sparbar value={f.metrics?.adoptionRate || 0} /><span className="w-12 text-right text-xs tabular-nums">{fmtPct(f.metrics?.adoptionRate)}</span></div> },
            ]}
            rows={items}
            empty={<EmptyState icon={Flag} title={data?.items?.length ? 'No matching features' : 'No features yet'} description="Create a feature such as “New Checkout” and send $feature_exposed / $feature_used events from your app." action={can('developer') && !data?.items?.length && <Button icon={Plus} onClick={() => setOpen(true)}>Create feature</Button>} />}
          />
        )}
      </Card>
      <FeatureForm open={open} onClose={() => setOpen(false)} onSaved={(f) => { mutate(); router.push(`/features/${f.id}`); }} />
    </>
  );
}

function Sparbar({ value }) {
  return <Sparkbar value={value} className="flex-1" />;
}
