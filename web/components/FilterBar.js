'use client';
import { useState } from 'react';
import { Plus, X, SlidersHorizontal } from 'lucide-react';
import { useProjectApi, useWorkspace } from '@/lib/workspace';
import { Button, Input, Select, Menu } from './ui';

const OPS = [
  { id: 'eq', label: 'equals' },
  { id: 'neq', label: 'not equals' },
  { id: 'contains', label: 'contains' },
  { id: 'gt', label: 'greater than' },
  { id: 'lt', label: 'less than' },
  { id: 'exists', label: 'is set' },
];

// Property filter chips: value = [{ property, operator, value }]
export function FilterBar({ value, onChange, event }) {
  const { envId } = useWorkspace();
  const props = useProjectApi('/analytics/properties', envId ? { envId, event } : null);
  const [draft, setDraft] = useState({ property: '', operator: 'eq', value: '' });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel py-1 pl-2.5 pr-1 text-xs">
          <span className="font-mono font-medium">{f.property}</span>
          <span className="text-subtle">{OPS.find((o) => o.id === f.operator)?.label}</span>
          {f.operator !== 'exists' && <span className="font-medium">{String(f.value)}</span>}
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-0.5 text-subtle hover:bg-surface hover:text-ink" aria-label="Remove filter"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <Menu
        align="left"
        className="w-72"
        trigger={({ toggle }) => <Button variant="secondary" size="sm" icon={value.length ? Plus : SlidersHorizontal} onClick={toggle}>{value.length ? 'Filter' : 'Add filter'}</Button>}
      >
        <div className="space-y-2 p-2" onClick={(e) => e.stopPropagation()}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Event property filter</p>
          <Select value={draft.property} onChange={(e) => setDraft({ ...draft, property: e.target.value })} className="py-1.5 text-xs">
            <option value="">Select property…</option>
            {props.data?.items?.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value })} className="py-1.5 text-xs">
            {OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
          {draft.operator !== 'exists' && <Input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="Value" className="py-1.5 text-xs" />}
          <Button
            size="xs"
            className="w-full"
            data-menu-close
            disabled={!draft.property || (draft.operator !== 'exists' && draft.value === '')}
            onClick={() => {
              onChange([...value, draft]);
              setDraft({ property: '', operator: 'eq', value: '' });
            }}
          >
            Apply filter
          </Button>
        </div>
      </Menu>
      {value.length > 0 && <button className="text-xs text-subtle hover:text-ink" onClick={() => onChange([])}>Clear</button>}
    </div>
  );
}
