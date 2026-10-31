'use client';
import Link from 'next/link';
import { X } from 'lucide-react';
import { JsonView, KeyValue, Badge, CopyButton } from './ui';
import { fmtDateTime } from '@/lib/format';

export function EventDrawer({ event, onClose, envName }) {
  if (!event) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Event details">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-panel shadow-xl animate-fade-in">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-subtle">Event</p>
            <h2 className="truncate font-mono text-base font-semibold">{event.name}</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-subtle hover:bg-surface hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <KeyValue
            items={[
              ['User', <Link key="u" href={`/users/${encodeURIComponent(event.distinctId)}`} className="font-medium text-brand-500 hover:underline">{event.distinctId}</Link>],
              ['Timestamp', fmtDateTime(event.timestamp)],
              ['Received', fmtDateTime(event.receivedAt)],
              ['Environment', envName ? <Badge key="e">{envName}</Badge> : event.environment],
              ['Message ID', <span key="m" className="flex items-center gap-1 font-mono text-xs">{event.messageId || '—'}{event.messageId && <CopyButton value={event.messageId} />}</span>],
              ['Event ID', <span key="i" className="font-mono text-xs">{event.id}</span>],
            ]}
          />
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Properties</p>
            {Object.keys(event.properties || {}).length ? (
              <div className="overflow-hidden rounded-lg border border-line">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {Object.entries(event.properties).map(([k, v]) => (
                      <tr key={k}><td className="w-1/3 bg-surface/60 px-3 py-2 font-mono text-xs text-muted">{k}</td><td className="break-all px-3 py-2 font-mono text-xs">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-subtle">No properties</p>}
          </div>
          {event.context && Object.keys(event.context).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Context</p>
              <JsonView value={event.context} />
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Raw</p>
            <JsonView value={event} />
          </div>
        </div>
      </div>
    </div>
  );
}
