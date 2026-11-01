'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { api } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Button, Modal, Field, Input, Textarea, Select, Toggle } from '@/components/ui';

export function DefinitionModal({ open, onClose, initial, onSaved }) {
  const { projectId } = useWorkspace();
  const { error: toastError, toast } = useToast();
  const blank = { name: '', displayName: '', description: '', category: 'general', status: 'active', properties: [] };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  useEffect(() => {
    if (open) {
      setForm(initial ? { ...blank, ...initial, properties: initial.properties || [] } : blank);
      setErrors(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const setProp = (i, patch) => setForm({ ...form, properties: form.properties.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  async function save() {
    setSaving(true);
    setErrors(null);
    try {
      const body = { displayName: form.displayName || undefined, description: form.description, category: form.category, status: form.status, properties: form.properties.filter((p) => p.name) };
      const res = initial?.id ? await api(`/projects/${projectId}/event-definitions/${initial.id}`, { method: 'PATCH', body }) : await api(`/projects/${projectId}/event-definitions`, { method: 'POST', body: { ...body, name: form.name } });
      toast(initial?.id ? 'Event updated' : 'Event defined');
      onSaved?.(res);
      onClose();
    } catch (err) {
      setErrors(err.details);
      toastError(err);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title={initial?.id ? `Edit ${initial.name}` : 'Define event'} description="Definitions document events and validate incoming properties." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!form.name} onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event name" required hint="Exactly as sent by your app, e.g. checkout_started" error={errors?.find((e) => e.path === 'name')?.message}>
          <Input value={form.name} disabled={!!initial?.id} onChange={(e) => setForm({ ...form, name: e.target.value })} className="font-mono" placeholder="checkout_started" />
        </Field>
        <Field label="Display name"><Input value={form.displayName || ''} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Checkout Started" /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Fired when the user opens the checkout page" /></Field>
        <Field label="Category"><Input value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
        <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="discovered">Discovered</option><option value="deprecated">Deprecated</option></Select></Field>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Properties</p>
          <Button size="xs" variant="secondary" icon={Plus} onClick={() => setForm({ ...form, properties: [...form.properties, { name: '', type: 'string', required: false, description: '' }] })}>Add property</Button>
        </div>
        {form.properties.length === 0 ? <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-subtle">No properties defined. Undefined properties are still accepted.</p> : (
          <div className="space-y-2">
            {form.properties.map((p, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <Input className="col-span-4 font-mono text-xs" placeholder="name" value={p.name} onChange={(e) => setProp(i, { name: e.target.value })} />
                <Select className="col-span-3 text-xs" value={p.type} onChange={(e) => setProp(i, { type: e.target.value })}>{['string', 'number', 'boolean', 'object', 'array', 'any'].map((t) => <option key={t}>{t}</option>)}</Select>
                <label className="col-span-3 flex items-center gap-2 text-xs text-muted"><Toggle checked={p.required} onChange={(v) => setProp(i, { required: v })} label="Required" />Required</label>
                <button className="col-span-2 justify-self-end rounded p-1.5 text-subtle hover:text-[#c43b3a]" onClick={() => setForm({ ...form, properties: form.properties.filter((_, j) => j !== i) })} aria-label="Remove property"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

