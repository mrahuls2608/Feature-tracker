'use client';
import { useEffect, useState } from 'react';
import { useWorkspace } from '@/lib/workspace';
import { useEventNames } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useToast } from './toast';
import { Button, Modal, Field, Input, Select, Toggle } from './ui';

export function WebhookForm({ open, onClose, initial, onSaved }) {
  const { projectId, environments } = useWorkspace();
  const names = useEventNames();
  const { error: toastError } = useToast();
  const [form, setForm] = useState({ url: '', description: '', envId: '', all: true, events: [], enabled: true });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(initial ? { url: initial.url, description: initial.description, envId: initial.environment || '', all: initial.events.includes('*'), events: initial.events.filter((e) => e !== '*'), enabled: initial.enabled } : { url: '', description: '', envId: '', all: true, events: [], enabled: true });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setSaving(true);
    try {
      const body = { url: form.url, description: form.description, envId: form.envId || null, events: form.all ? ['*'] : form.events, enabled: form.enabled };
      const res = initial ? await api(`/projects/${projectId}/webhooks/${initial.id}`, { method: 'PATCH', body }) : await api(`/projects/${projectId}/webhooks`, { method: 'POST', body });
      onSaved?.(res);
      onClose();
    } catch (err) {
      toastError(err.details?.[0] ? `${err.details[0].path}: ${err.details[0].message}` : err);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit webhook' : 'Add webhook endpoint'} description="FeatureTrack POSTs a signed JSON payload for each matching event." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={!form.url || (!form.all && !form.events.length)} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Endpoint URL" required><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/hooks/featuretrack" className="font-mono text-xs" /></Field>
        <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Notify billing service" /></Field>
        <Field label="Environment"><Select value={form.envId} onChange={(e) => setForm({ ...form, envId: e.target.value })}><option value="">All environments</option>{environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
        <div>
          <label className="flex items-center gap-2 text-sm"><Toggle checked={form.all} onChange={(v) => setForm({ ...form, all: v })} label="All events" />Send all events</label>
          {!form.all && (
            <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-line p-2">
              {form.events.map((e) => <button key={e} onClick={() => setForm({ ...form, events: form.events.filter((x) => x !== e) })} className="rounded-md bg-brand-500/10 px-2 py-0.5 font-mono text-xs text-brand-700 dark:text-brand-300">{e} ×</button>)}
              <select className="flex-1 bg-transparent text-xs text-subtle outline-none" value="" onChange={(e) => e.target.value && setForm({ ...form, events: [...form.events, e.target.value] })}>
                <option value="">+ subscribe to event</option>
                {names.filter((n) => !form.events.includes(n)).map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm"><Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Enabled" />Enabled</label>
      </div>
    </Modal>
  );
}
