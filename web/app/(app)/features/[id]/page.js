'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2, Plus, X, FlaskConical } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Button, ErrorState, Skeleton, StatCard, Table, ConfirmDialog, Badge, Toggle, Input, Select, CodeBlock, EmptyState, KeyValue, Field, JsonView } from '@/components/ui';
import { TimeChart } from '@/components/charts';
import { DateRangePicker } from '@/components/Shell';
import { FeatureForm } from '@/components/FeatureForm';
import { fmtNum, fmtPct, fmtDate, FEATURE_STATUS_COLOR } from '@/lib/format';

function RolloutEditor({ feature, onSaved }) {
  const { environments, projectId, can } = useWorkspace();
  const { toast, error: toastError } = useToast();
  const [rollouts, setRollouts] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setRollouts(environments.map((e) => {
      const r = feature.rollouts?.find((x) => x.environment === e.id);
      return { environment: e.id, enabled: r?.enabled || false, percentage: r?.percentage ?? 100, rules: r?.rules || [] };
    }));
  }, [feature, environments]);
  const set = (i, patch) => setRollouts((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dirty = JSON.stringify(rollouts) !== JSON.stringify(environments.map((e) => { const r = feature.rollouts?.find((x) => x.environment === e.id); return { environment: e.id, enabled: r?.enabled || false, percentage: r?.percentage ?? 100, rules: r?.rules || [] }; }));
  async function save() {
    setSaving(true);
    try {
      await api(`/projects/${projectId}/features/${feature.id}`, { method: 'PATCH', body: { rollouts: rollouts.map((r) => ({ ...r, percentage: Number(r.percentage), rules: r.rules.filter((x) => x.property && x.value !== '') })) } });
      toast('Rollout saved — flag evaluations update within 30 seconds');
      onSaved();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }
  const editable = can('developer');
  return (
    <Card title="Feature flag rollout" description="Evaluated by POST /v1/flags. Percentage rollouts are deterministic per user (hash of key + user id)." actions={editable && <Button size="sm" disabled={!dirty} loading={saving} onClick={save}>Save rollout</Button>}>
      <div className="space-y-4">
        {rollouts.map((r, i) => {
          const env = environments.find((e) => e.id === r.environment);
          return (
            <div key={r.environment} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex w-40 items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: env?.color }} /><span className="text-sm font-medium">{env?.name}</span></div>
                <label className="flex items-center gap-2 text-sm"><Toggle checked={r.enabled} disabled={!editable} onChange={(v) => set(i, { enabled: v })} label={`Enable in ${env?.name}`} />{r.enabled ? 'On' : 'Off'}</label>
                <div className="flex flex-1 items-center gap-3">
                  <input type="range" min="0" max="100" value={r.percentage} disabled={!editable || !r.enabled} onChange={(e) => set(i, { percentage: Number(e.target.value) })} className="flex-1 accent-[#2a78d6]" aria-label="Rollout percentage" />
                  <span className="w-12 text-right text-sm tabular-nums">{r.percentage}%</span>
                </div>
              </div>
              {r.enabled && (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  <p className="text-xs text-subtle">Targeting rules (all must match). Properties come from the flag request, e.g. plan or country.</p>
                  {r.rules.map((rule, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <Input disabled={!editable} value={rule.property} onChange={(e) => set(i, { rules: r.rules.map((x, z) => (z === k ? { ...x, property: e.target.value } : x)) })} placeholder="plan" className="py-1 font-mono text-xs" />
                      <Select disabled={!editable} value={rule.operator} onChange={(e) => set(i, { rules: r.rules.map((x, z) => (z === k ? { ...x, operator: e.target.value } : x)) })} className="w-32 py-1 text-xs">{['eq', 'neq', 'in', 'contains', 'gt', 'lt'].map((o) => <option key={o}>{o}</option>)}</Select>
                      <Input disabled={!editable} value={Array.isArray(rule.value) ? rule.value.join(',') : rule.value} onChange={(e) => set(i, { rules: r.rules.map((x, z) => (z === k ? { ...x, value: e.target.value } : x)) })} placeholder={rule.operator === 'in' ? 'pro,business' : 'pro'} className="py-1 text-xs" />
                      {editable && <button onClick={() => set(i, { rules: r.rules.filter((_, z) => z !== k) })} className="p-1 text-subtle hover:text-ink" aria-label="Remove rule"><X className="h-4 w-4" /></button>}
                    </div>
                  ))}
                  {editable && r.rules.length < 20 && <Button size="xs" variant="ghost" icon={Plus} onClick={() => set(i, { rules: [...r.rules, { property: '', operator: 'eq', value: '' }] })}>Add rule</Button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FlagTester({ feature }) {
  const { projectId, envId, env } = useWorkspace();
  const [distinctId, setDistinctId] = useState('user_00001');
  const [props, setProps] = useState('{ "plan": "pro" }');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  async function run() {
    setErr(null);
    try {
      setResult(await api(`/projects/${projectId}/features/${feature.id}/evaluate`, { method: 'POST', body: { envId, distinctId, properties: JSON.parse(props || '{}') } }));
    } catch (e) {
      setErr(e.message);
    }
  }
  return (
    <Card title="Test flag evaluation" description={`Evaluate this flag for a user in ${env?.name}`}>
      <div className="space-y-3">
        <Field label="User ID"><Input value={distinctId} onChange={(e) => setDistinctId(e.target.value)} /></Field>
        <Field label="Properties (JSON)"><Input value={props} onChange={(e) => setProps(e.target.value)} className="font-mono text-xs" /></Field>
        <Button variant="secondary" icon={FlaskConical} onClick={run} disabled={!distinctId}>Evaluate</Button>
        {err && <p className="text-sm text-[#c43b3a]">{err}</p>}
        {result && <div className="flex items-center gap-2 text-sm"><Badge color={result.enabled ? 'green' : 'gray'} dot>{result.enabled ? 'Enabled' : 'Disabled'}</Badge><span className="text-subtle">reason: {result.reason}{result.bucket !== undefined && ` · bucket ${result.bucket}`}</span></div>}
      </div>
    </Card>
  );
}

export default function FeatureDetail({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { scope, project, projectId, can, env } = useWorkspace();
  const { toast, error: toastError } = useToast();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const { data: f, error, isLoading, mutate } = useProjectApi(`/features/${id}`, scope);
  const m = f?.metrics;
  if (error) return <Card><ErrorState error={error} onRetry={() => mutate()} /></Card>;
  async function remove() {
    try {
      await api(`/projects/${projectId}/features/${id}`, { method: 'DELETE' });
      toast('Feature deleted');
      router.replace('/features');
    } catch (err) {
      toastError(err);
    }
  }
  const snippet = f ? `// Gate the feature and record exposure automatically\nif (await ft.isEnabled('${f.key}')) {\n  renderNewExperience();\n}\n\n// Or record exposure / usage explicitly\nft.featureExposed('${f.key}');\nft.featureUsed('${f.key}', { action: 'completed' });` : '';
  return (
    <>
      <PageHeader
        title={f?.name || 'Feature'}
        description={f?.description}
        breadcrumbs={[{ label: project?.name }, { label: 'Features', href: '/features' }, { label: f?.name || '…' }]}
        actions={<>{can('developer') && <><Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button><Button variant="danger-ghost" icon={Trash2} onClick={() => setDel(true)}>Delete</Button></>}<DateRangePicker /></>}
      />
      {isLoading && !f ? <Skeleton className="h-96" /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Status" value={<Badge color={FEATURE_STATUS_COLOR[f.status]} className="text-sm">{f.status}</Badge>} sub={<span className="font-mono">{f.key}</span>} />
            <StatCard label="Exposed users" value={m.exposedUsers} hint="Users who saw or used the feature" />
            <StatCard label="Adopted users" value={m.adoptedUsers} hint="Users who used the feature" />
            <StatCard label="Adoption rate" value={fmtPct(m.adoptionRate)} hint="Adopted ÷ exposed" />
          </div>
          <Card title="Usage trend" description={`Daily unique users exposed vs adopted · ${env?.name}`}>
            <TimeChart data={m.trend} series={[{ key: 'exposed', label: 'Exposed' }, { key: 'adopted', label: 'Adopted', color: 'var(--series-3)' }]} type="line" />
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Conversion comparison" description={f.conversionEvent ? <>Share of users who performed <code className="font-mono">{f.conversionEvent}</code></> : 'Set a conversion event to compare adopters with non-adopters'}>
              {m.conversion ? (
                <div className="space-y-4">
                  {[['Adopters', m.conversion.adopters, 'var(--series-3)'], ['Exposed, not adopted', m.conversion.nonAdopters, 'var(--series-1)']].map(([label, g, color]) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-semibold tabular-nums">{fmtPct(g.rate)}</span></div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-line/60"><div className="h-full rounded-full" style={{ width: `${g.rate}%`, background: color }} /></div>
                      <p className="mt-1 text-xs text-subtle">{fmtNum(g.converted)} of {fmtNum(g.users)} users converted</p>
                    </div>
                  ))}
                  {m.conversion.lift !== null && <p className="text-sm">Relative lift: <span className={m.conversion.lift >= 0 ? 'font-semibold text-[#087a08] dark:text-[#4cc94c]' : 'font-semibold text-[#b4302f]'}>{m.conversion.lift > 0 ? '+' : ''}{m.conversion.lift}%</span></p>}
                </div>
              ) : <EmptyState title="No conversion event" action={can('developer') && <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>Configure</Button>} />}
            </Card>
            <Card title="Related events" padded={false}>
              <Table
                rowKey={(r) => r.name}
                columns={[
                  { key: 'name', label: 'Event', render: (r) => <Link href={`/events/${encodeURIComponent(r.name)}`} className="font-mono text-xs font-medium hover:text-brand-500">{r.name}</Link> },
                  { key: 'role', label: 'Counts as', render: (r) => <Badge color={r.role === 'adoption' ? 'green' : r.role === 'conversion' ? 'violet' : 'blue'}>{r.role}</Badge> },
                  { key: 'count', label: 'Events', align: 'right', render: (r) => fmtNum(r.count) },
                  { key: 'users', label: 'Users', align: 'right', render: (r) => fmtNum(r.users) },
                ]}
                rows={m.relatedEvents}
                empty={<EmptyState title="No related activity yet" description="Send $feature_exposed and $feature_used events with this feature key." />}
              />
            </Card>
          </div>
          <RolloutEditor feature={f} onSaved={() => mutate()} />
          <div className="grid gap-6 lg:grid-cols-2">
            <FlagTester feature={f} />
            <Card title="Integration">
              <CodeBlock code={snippet} language="javascript" />
              <div className="mt-4"><KeyValue items={[['Owner', f.owner], ['Tags', f.tags?.join(', ') || '—'], ['Exposure events', f.exposureEvents?.join(', ') || '$feature_exposed'], ['Adoption events', f.adoptionEvents?.join(', ') || '$feature_used'], ['Created', fmtDate(f.createdAt)], ['Updated', fmtDate(f.updatedAt)]]} /></div>
            </Card>
          </div>
        </div>
      )}
      <FeatureForm open={edit} onClose={() => setEdit(false)} initial={f} onSaved={() => mutate()} />
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} title="Delete feature?" description="Its definition and rollout configuration will be deleted. Raw events are kept." confirmLabel="Delete feature" confirmText={f?.key} />
    </>
  );
}

