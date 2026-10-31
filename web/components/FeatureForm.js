'use client';
import { useEffect, useState } from 'react';
import { useWorkspace } from '@/lib/workspace';
import { useEventNames } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useToast } from './toast';
import { Button, Modal, Field, Input, Textarea, Select } from './ui';

function EventMulti({ value, onChange, names }) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-line bg-panel p-2">
      {value.map((v) => (
        <button key={v} type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-md bg-brand-500/10 px-2 py-0.5 font-mono text-xs text-brand-700 hover:bg-brand-500/20 dark:text-brand-300" title="Remove">{v} ×</button>
      ))}
      <select className="min-w-[140px] flex-1 bg-transparent text-xs text-subtle outline-none" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
        <option value="">+ add event</option>
        {names.filter((n) => !value.includes(n)).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

const blank = { key: '', name: '', description: '', status: 'planned', owner: '', tags: '', exposureEvents: [], adoptionEvents: [], conversionEvent: '' };

export function FeatureForm({ open, onClose, initial, onSaved }) {
  const { projectId } = useWorkspace();
  const names = useEventNames();
  const { toast, error: toastError } = useToast();
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(initial ? { ...blank, ...initial, tags: (initial.tags || []).join(', '), conversionEvent: initial.conversionEvent || '' } : blank);
      setKeyTouched(!!initial);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description,
        status: form.status,
        owner: form.owner || undefined,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        exposureEvents: form.exposureEvents,
        adoptionEvents: form.adoptionEvents,
        conversionEvent: form.conversionEvent || '',
      };
      const res = initial?.id ? await api(`/projects/${projectId}/features/${initial.id}`, { method: 'PATCH', body }) : await api(`/projects/${projectId}/features`, { method: 'POST', body: { ...body, key: form.key } });
      toast(initial?.id ? 'Feature updated' : 'Feature created');
      onSaved?.(res);
      onClose();
    } catch (err) {
      toastError(err.details?.[0] ? `${err.details[0].path}: ${err.details[0].message}` : err);
    } finally {
      setSaving(false);
    }
  }
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  return (
    <Modal open={open} onClose={onClose} size="lg" title={initial?.id ? `Edit ${initial.name}` : 'New feature'} description="Features are measured by exposure and adoption events." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={form.name.length < 2 || form.key.length < 2} onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, key: keyTouched ? form.key : slug(e.target.value) })} placeholder="New Checkout Experience" /></Field>
        <Field label="Key" required hint="Used by the SDK and flag API; cannot change later"><Input value={form.key} disabled={!!initial?.id} onChange={(e) => { setKeyTouched(true); setForm({ ...form, key: e.target.value }); }} className="font-mono" placeholder="new-checkout" /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['planned', 'beta', 'live', 'deprecated'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Owner"><Input value={form.owner || ''} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Checkout squad" /></Field>
        <Field label="Tags" hint="Comma separated" className="sm:col-span-2"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="payments, q3" /></Field>
        <Field label="Additional exposure events" hint={<>Besides <code className="font-mono">$feature_exposed</code> with feature = key</>} className="sm:col-span-2"><EventMulti names={names} value={form.exposureEvents} onChange={(v) => setForm({ ...form, exposureEvents: v })} /></Field>
        <Field label="Additional adoption events" hint={<>Besides <code className="font-mono">$feature_used</code> with feature = key</>} className="sm:col-span-2"><EventMulti names={names} value={form.adoptionEvents} onChange={(v) => setForm({ ...form, adoptionEvents: v })} /></Field>
        <Field label="Conversion event" hint="Compare conversion of adopters vs. exposed non-adopters" className="sm:col-span-2">
          <Select value={form.conversionEvent} onChange={(e) => setForm({ ...form, conversionEvent: e.target.value })}><option value="">None</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</Select>
        </Field>
      </div>
    </Modal>
  );
}
