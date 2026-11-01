'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Pause, Play, Trash2, Search, Radio, Wifi, WifiOff } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { api } from '@/lib/api';
import { Card, PageHeader, Button, Input, Badge, EmptyState, cx } from '@/components/ui';
import { EventDrawer } from '@/components/EventDrawer';
import { fmtTime, fmtNum } from '@/lib/format';

const MAX = 500;
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function LivePage() {
  const { env, project, projectId } = useWorkspace();
  const [events, setEvents] = useState([]);
  const [buffer, setBuffer] = useState([]);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [rate, setRate] = useState([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const counter = useRef(0);

  // Seed with the most recent persisted events so the view is never blank on load.
  useEffect(() => {
    if (!env || !projectId) return;
    setEvents([]);
    setBuffer([]);
    api(`/projects/${projectId}/events`, { query: { envId: env.id, limit: 50 } }).then((r) => setEvents(r.items.map((e) => ({ ...e, seeded: true })))).catch(() => {});
  }, [env, projectId]);

  useEffect(() => {
    if (!env) return;
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      // Fresh short-lived token on every (re)connection attempt.
      auth: (cb) => api('/auth/socket-token', { method: 'POST' }).then((r) => cb({ token: r.token })).catch(() => cb({ token: '' })),
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    const subscribe = () => socket.emit('subscribe', { envId: env.id }, (ack) => setStatus(ack?.ok ? 'live' : 'error'));
    socket.on('connect', subscribe);
    socket.on('disconnect', () => setStatus('reconnecting'));
    socket.on('connect_error', () => setStatus('reconnecting'));
    socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.on('events', (batch) => {
      counter.current += batch.length;
      const incoming = batch.map((e) => ({ ...e, fresh: true })).reverse();
      if (pausedRef.current) setBuffer((b) => [...incoming, ...b].slice(0, MAX));
      else setEvents((xs) => [...incoming, ...xs].slice(0, MAX));
    });
    const onOffline = () => setStatus('offline');
    const onOnline = () => socket.connect();
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      socket.disconnect();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [env]);

  // Events-per-5s throughput, last 60s.
  useEffect(() => {
    const t = setInterval(() => {
      setRate((r) => [...r, counter.current].slice(-12));
      counter.current = 0;
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const resume = () => {
    setEvents((xs) => [...buffer, ...xs].slice(0, MAX));
    setBuffer([]);
    setPaused(false);
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return events;
    return events.filter((e) => e.name.toLowerCase().includes(s) || e.distinctId.toLowerCase().includes(s) || JSON.stringify(e.properties).toLowerCase().includes(s));
  }, [events, q]);

  const STATUS = {
    connecting: { label: 'Connecting…', color: 'yellow', icon: Wifi },
    live: { label: 'Live', color: 'green', icon: Radio },
    reconnecting: { label: 'Reconnecting…', color: 'yellow', icon: WifiOff },
    offline: { label: 'Offline', color: 'red', icon: WifiOff },
    error: { label: 'Not authorized', color: 'red', icon: WifiOff },
  }[status];
  const maxRate = Math.max(1, ...rate);

  return (
    <>
      <PageHeader
        title="Live events"
        description="Events appear here seconds after they're processed — no refresh needed."
        breadcrumbs={[{ label: project?.name }, { label: 'Live events' }]}
        actions={
          <>
            <Badge color={paused ? 'gray' : STATUS.color} dot className="px-2 py-1 text-xs">{paused ? 'Paused' : STATUS.label}</Badge>
            {paused ? <Button icon={Play} onClick={resume}>Resume{buffer.length ? ` (${buffer.length} new)` : ''}</Button> : <Button variant="secondary" icon={Pause} onClick={() => setPaused(true)}>Pause</Button>}
            <Button variant="ghost" icon={Trash2} onClick={() => { setEvents([]); setBuffer([]); }}>Clear</Button>
          </>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_280px]">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle" /><Input className="pl-9" placeholder="Filter by event, user or property…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="card flex items-end gap-1 px-3 py-2" title="Events received per 5 seconds (last minute)">
          <span className="mr-2 self-center text-xs text-subtle">Throughput</span>
          {Array.from({ length: 12 }).map((_, i) => {
            const v = rate[i - (12 - rate.length)] ?? 0;
            return <div key={i} className="flex-1 rounded-t-[2px]" style={{ height: `${4 + (v / maxRate) * 20}px`, background: v ? 'var(--series-1)' : 'rgb(var(--line))' }} title={`${v} events`} />;
          })}
        </div>
      </div>
      <Card padded={false}>
        {status === 'reconnecting' && <div className="border-b border-line bg-[#fab219]/10 px-4 py-2 text-xs text-muted">Connection lost — reconnecting automatically. Events processed meanwhile are still stored and visible in Event history.</div>}
        {filtered.length === 0 ? (
          <EmptyState icon={Radio} title={q ? 'No events match your filter' : 'Waiting for events…'} description={q ? 'Clear the filter to see all events.' : `Send an event to the ${env?.name} environment and it will appear here.`} action={!q && <Button variant="secondary" href="/explorer">Send a test event</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((e) => (
              <li key={e.id}>
                <button onClick={() => { const { fresh, seeded, ...clean } = e; setSelected({ ...clean, environment: env?.id }); }} className={cx('grid w-full grid-cols-12 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface/70', e.fresh && 'animate-fade-in')}>
                  <span className="col-span-2 text-xs tabular-nums text-subtle sm:col-span-1">{fmtTime(e.timestamp)}</span>
                  <span className="col-span-5 flex items-center gap-2 truncate font-mono text-[13px] font-medium sm:col-span-3">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: env?.color }} />{e.name}
                  </span>
                  <span className="col-span-5 truncate text-sm text-muted sm:col-span-3">{e.distinctId}</span>
                  <span className="hidden truncate font-mono text-xs text-subtle sm:col-span-5 sm:block">{JSON.stringify(e.properties)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {events.length > 0 && <p className="border-t border-line px-4 py-2 text-xs text-subtle">Showing {fmtNum(filtered.length)} of the last {fmtNum(events.length)} events (max {MAX})</p>}
      </Card>
      <EventDrawer event={selected} onClose={() => setSelected(null)} envName={env?.name} />
    </>
  );
}
