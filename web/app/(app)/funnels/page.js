'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Filter } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { Card, PageHeader, Button, EmptyState, ErrorState, LoadingBlock } from '@/components/ui';
import { FunnelBuilder } from '@/components/FunnelBuilder';
import { fmtDate } from '@/lib/format';
import { useRouter } from 'next/navigation';

export default function FunnelsPage() {
  const { project, can } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data, error, isLoading, mutate } = useProjectApi('/funnels', {});
  return (
    <>
      <PageHeader title="Funnels" description="Measure step-by-step conversion and find where users drop off." breadcrumbs={[{ label: project?.name }, { label: 'Funnels' }]} actions={can('developer') && <Button icon={Plus} onClick={() => setOpen(true)}>New funnel</Button>} />
      {error ? <Card><ErrorState error={error} onRetry={() => mutate()} /></Card> : !data ? <LoadingBlock rows={4} /> : !data.items.length ? (
        <Card><EmptyState icon={Filter} title="No funnels yet" description="Create a funnel like Signed up → Viewed product → Started checkout → Paid." action={can('developer') && <Button icon={Plus} onClick={() => setOpen(true)}>Create funnel</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((f) => (
            <Link key={f.id} href={`/funnels/${f.id}`} className="card block p-5 transition hover:border-brand-500/40 hover:shadow-md">
              <p className="font-semibold">{f.name}</p>
              {f.description && <p className="mt-0.5 line-clamp-2 text-sm text-subtle">{f.description}</p>}
              <ol className="mt-4 space-y-1.5">
                {f.steps.map((s, i) => <li key={i} className="flex items-center gap-2 text-xs"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-subtle">{i + 1}</span><span className="truncate font-mono">{s.event}</span></li>)}
              </ol>
              <p className="mt-4 text-xs text-subtle">{f.steps.length} steps · {f.windowHours >= 24 ? `${f.windowHours / 24}d` : `${f.windowHours}h`} window · created {fmtDate(f.createdAt)}</p>
            </Link>
          ))}
        </div>
      )}
      <FunnelBuilder open={open} onClose={() => setOpen(false)} onSaved={(f) => { mutate(); router.push(`/funnels/${f.id || f._id}`); }} />
    </>
  );
}
