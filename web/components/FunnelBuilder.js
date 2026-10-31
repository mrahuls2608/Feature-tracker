'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowDown, ArrowUp, X } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { useEventNames } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useToast } from './toast';
import { Button, Modal, Field, Input, Select, Callout, Spinner } from './ui';
import { FunnelChart } from './charts';

const blank = { name: '', description: '', windowHours: 168, steps: [{ event: '', filters: [] }, { event: '', filters: [] }] };

export function FunnelBuilder({ open, onClose, initial, onSaved }) {
  const { projectId, scope } = useWorkspace();
  const names = useEventNames();
  const { toast, error: toastError } = useToast();
  const [form, setForm] = useState(blank);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { name: initial.name, description: initial.description || '', windowHours: initial.windowHours, steps: initial.steps.map((s) => ({ ...s, filters: s.filters || [] })) } : blank);
      setPreview(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = form.name.trim().length >= 2 && form.steps.length >= 2 && form.steps.every((s) => s.event);
  const setStep = (i, patch) => setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const move = (i, d) => setForm((f) => {
    const steps = [...f.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    return { ...f, steps };
  });

  useEffect(() => {
    if (!open || !scope || !form.steps.every((s) => s.event) || form.steps.length < 2) return;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        setPreview(await api(`/projects/${projectId}/funnels/compute`, { method: 'POST', body: { ...scope, steps: form.steps.map(clean), windowHours: Number(form.windowHours) } }));
      } catch {
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [open, form.steps, form.windowHours, scope, projectId]);

  const clean = (s) => ({ event: s.event, label: s.label || undefined, filters: (s.filters || []).filter((f) => f.property && f.value !== '') });

  async function save() {
    setSaving(true);
    try {
      const body = { name: form.name, description: form.description, windowHours: Number(form.windowHours), steps: form.steps.map(clean) };
      const res = initial?.id ? await api(`/projects/${projectId}/funnels/${initial.id}`, { method: 'PATCH', body }) : await api(`/projects/${projectId}/funnels`, { method: 'POST', body });
      toast(initial?.id ? 'Funnel updated' : 'Funnel created');
      onSaved?.(res);
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={initial?.id ? 'Edit funnel' : 'New funnel'} description="Users must complete the steps in order within the conversion window." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid} loading={saving} onClick={save}>{initial?.id ? 'Save changes' : 'Create funnel'}</Button></>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Checkout conversion" /></Field>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Conversion window">
            <Select value={form.windowHours} onChange={(e) => setForm({ ...form, windowHours: Number(e.target.value) })}>
              {[[1, '1 hour'], [24, '1 day'], [72, '3 days'], [168, '7 days'], [336, '14 days'], [720, '30 days']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <div>
            <p className="label">Steps</p>
            <ol className="space-y-2">
              {form.steps.map((s, i) => (
                <li key={i} className="rounded-lg border border-line p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-xs font-semibold text-brand-600 dark:text-brand-300">{i + 1}</span>
                    <Select value={s.event} onChange={(e) => setStep(i, { event: e.target.value })} className="font-mono text-xs">
                      <option value="">Select event…</option>
                      {names.map((n) => <option key={n} value={n}>{n}</option>)}
                    </Select>
                    <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-subtle hover:text-ink disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                    <button disabled={i === form.steps.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-subtle hover:text-ink disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                    <button disabled={form.steps.length <= 2} onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })} className="rounded p-1 text-subtle hover:text-[#c43b3a] disabled:opacity-30" aria-label="Remove step"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {s.filters.map((f, k) => (
                    <div key={k} className="ml-8 mt-2 flex items-center gap-1.5">
                      <Input value={f.property} onChange={(e) => setStep(i, { filters: s.filters.map((x, z) => (z === k ? { ...x, property: e.target.value } : x)) })} placeholder="property" className="py-1 font-mono text-xs" />
                      <Select value={f.operator} onChange={(e) => setStep(i, { filters: s.filters.map((x, z) => (z === k ? { ...x, operator: e.target.value } : x)) })} className="w-28 py-1 text-xs">
                        {['eq', 'neq', 'contains', 'gt', 'lt'].map((o) => <option key={o}>{o}</option>)}
                      </Select>
                      <Input value={f.value} onChange={(e) => setStep(i, { filters: s.filters.map((x, z) => (z === k ? { ...x, value: e.target.value } : x)) })} placeholder="value" className="py-1 text-xs" />
                      <button onClick={() => setStep(i, { filters: s.filters.filter((_, z) => z !== k) })} className="p-1 text-subtle hover:text-ink" aria-label="Remove filter"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {s.filters.length < 5 && <button onClick={() => setStep(i, { filters: [...s.filters, { property: '', operator: 'eq', value: '' }] })} className="ml-8 mt-1.5 text-xs text-brand-500 hover:underline">+ property filter</button>}
                </li>
              ))}
            </ol>
            {form.steps.length < 10 && <Button size="sm" variant="secondary" icon={Plus} className="mt-2" onClick={() => setForm({ ...form, steps: [...form.steps, { event: '', filters: [] }] })}>Add step</Button>}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface/50 p-4">
          <div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium">Preview</p>{previewing && <Spinner className="h-4 w-4" />}</div>
          {preview ? (
            <>
              <FunnelChart steps={preview.steps} />
              <p className="mt-3 text-sm">Overall conversion <span className="font-semibold">{preview.overallConversion}%</span> · {preview.entered} entered</p>
            </>
          ) : <Callout>Select an event for every step to preview conversion with live data from the current environment and date range.</Callout>}
        </div>
      </div>
    </Modal>
  );
}
