'use client';
import { forwardRef, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Loader2, X, AlertTriangle, Inbox, Check, Copy, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import { fmtNum } from '@/lib/format';

export const cx = clsx;

const BTN = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
  secondary: 'border border-line bg-panel text-ink hover:bg-surface',
  ghost: 'text-muted hover:bg-surface hover:text-ink',
  danger: 'bg-[#c43b3a] text-white hover:bg-[#a83231] shadow-sm',
  'danger-ghost': 'text-[#c43b3a] hover:bg-red-500/10',
};
const SIZE = { xs: 'h-7 px-2 text-xs gap-1', sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-9 px-4 text-sm gap-2', lg: 'h-10 px-5 text-sm gap-2' };

export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, icon: Icon, href, ...props }, ref) {
  const cls = cx('inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50', BTN[variant], SIZE[size], className);
  const content = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </>
  );
  if (href) return <Link href={href} className={cls}>{content}</Link>;
  return (
    <button ref={ref} disabled={disabled || loading} className={cls} {...props}>
      {content}
    </button>
  );
});

export function Field({ label, hint, error, children, className, required }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="label">
          {label}
          {required && <span className="text-[#c43b3a]"> *</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-xs text-[#c43b3a]">{error}</span> : hint ? <span className="mt-1 block text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx('input', className)} {...p} />;
});
export const Textarea = forwardRef(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx('input min-h-[80px]', className)} {...p} />;
});
export function Select({ className, children, ...p }) {
  return (
    <select className={cx('input appearance-none bg-[length:16px] bg-[right_.5rem_center] bg-no-repeat pr-8', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23888' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")" }} {...p}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand-500' : 'bg-line')}>
      <span className={cx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

export function Card({ title, description, actions, children, className, bodyClassName, padded = true }) {
  return (
    <section className={cx('card animate-fade-in', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-subtle">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx(padded && 'p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

const BADGE = {
  gray: 'bg-surface text-muted border-line',
  blue: 'bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/20',
  green: 'bg-[#0ca30c]/10 text-[#087a08] dark:text-[#4cc94c] border-[#0ca30c]/25',
  yellow: 'bg-[#fab219]/15 text-[#8a5d00] dark:text-[#fab219] border-[#fab219]/30',
  red: 'bg-[#e34948]/10 text-[#b4302f] dark:text-[#f08080] border-[#e34948]/25',
  violet: 'bg-[#6250d6]/10 text-[#4a3aa7] dark:text-[#b1a8f0] border-[#6250d6]/25',
};
export function Badge({ color = 'gray', children, className, dot }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium', BADGE[color], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-subtle', className)} />;
}
export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-md bg-line/60', className)} />;
}
export function LoadingBlock({ rows = 3, className }) {
  return (
    <div className={cx('space-y-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 rounded-full border border-line bg-surface p-3">
        <Icon className="h-5 w-5 text-subtle" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-10 text-center', className)} role="alert">
      <div className="mb-3 rounded-full bg-[#e34948]/10 p-3">
        <AlertTriangle className="h-5 w-5 text-[#c43b3a]" />
      </div>
      <p className="text-sm font-semibold">{error?.status === 403 ? 'Access denied' : error?.status === 404 ? 'Not found' : 'Something went wrong'}</p>
      <p className="mt-1 max-w-sm text-sm text-subtle">{error?.message || 'Unable to load this data.'}</p>
      {onRetry && error?.status !== 403 && error?.status !== 404 && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Callout({ tone = 'info', title, children, className }) {
  const tones = { info: 'border-brand-500/25 bg-brand-500/5', warning: 'border-[#fab219]/40 bg-[#fab219]/10', danger: 'border-[#e34948]/30 bg-[#e34948]/5', success: 'border-[#0ca30c]/30 bg-[#0ca30c]/5' };
  const Icon = tone === 'warning' || tone === 'danger' ? AlertTriangle : tone === 'success' ? Check : Info;
  return (
    <div className={cx('flex gap-3 rounded-lg border p-3 text-sm', tones[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className="text-muted">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    setTimeout(() => ref.current?.querySelector('input,select,textarea,button:not([data-close])')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-[2px] animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('card w-full', widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-subtle">{description}</p>}
          </div>
          <button data-close onClick={onClose} className="rounded-md p-1 text-subtle hover:bg-surface hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// Confirmation dialog; when `confirmText` is set the user must type it to proceed.
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger = true, confirmText, loading, children }) {
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} disabled={confirmText && typed !== confirmText} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="text-sm text-muted">{description}</p>}
      {children}
      {confirmText && (
        <Field label={<>Type <span className="font-mono font-semibold text-ink">{confirmText}</span> to confirm</>} className="mt-4">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
      )}
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto border-b border-line', className)} role="tablist">
      {tabs.map((t) => {
        const id = typeof t === 'string' ? t : t.id;
        const label = typeof t === 'string' ? t : t.label;
        return (
          <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)} className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors', value === id ? 'border-brand-500 text-ink' : 'border-transparent text-subtle hover:text-ink')}>
            {label}
            {t.count !== undefined && <span className="ml-1.5 rounded bg-surface px-1.5 text-xs text-subtle">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({ options, value, onChange, size = 'sm' }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => {
        const id = typeof o === 'string' ? o : o.id;
        return (
          <button key={id} onClick={() => onChange(id)} className={cx('rounded-md px-2.5 font-medium transition-colors', size === 'sm' ? 'py-1 text-xs' : 'py-1.5 text-sm', value === id ? 'bg-panel text-ink shadow-sm' : 'text-subtle hover:text-ink')}>
            {typeof o === 'string' ? o : o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Pagination({ page, limit, total, onChange }) {
  const pages = Math.max(1, Math.ceil((total || 0) / limit));
  if (!total) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-subtle">
      <span>
        {fmtNum((page - 1) * limit + 1)}–{fmtNum(Math.min(page * limit, total))} of {fmtNum(total)}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="px-2 tabular-nums">{page} / {pages}</span>
        <Button variant="secondary" size="xs" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function CopyButton({ value, className, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className={cx('inline-flex items-center gap-1 rounded-md p-1.5 text-xs text-subtle hover:bg-surface hover:text-ink', className)}
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[#0ca30c]" /> : <Copy className="h-3.5 w-3.5" />}
      {label && (copied ? 'Copied' : label)}
    </button>
  );
}

export function CodeBlock({ code, language, className, title }) {
  return (
    <div className={cx('group relative overflow-hidden rounded-lg border border-line bg-[#0f1115] text-[#e6e6e3]', className)}>
      {(title || language) && <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] text-white/50"><span>{title || language}</span></div>}
      <CopyButton value={code} className="absolute right-1.5 top-1.5 text-white/50 hover:bg-white/10 hover:text-white" />
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

export function JsonView({ value, className }) {
  return <pre className={cx('max-h-[420px] overflow-auto rounded-lg border border-line bg-surface p-3 font-mono text-xs leading-relaxed', className)}>{JSON.stringify(value, null, 2)}</pre>;
}

export function Delta({ value, inverse }) {
  if (value === undefined || value === null) return null;
  const up = value > 0;
  const good = inverse ? !up : up;
  if (value === 0) return <span className="text-xs text-subtle">0%</span>;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-xs font-medium', good ? 'text-[#087a08] dark:text-[#4cc94c]' : 'text-[#b4302f] dark:text-[#f08080]')}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(value)}%
    </span>
  );
}

export function StatCard({ label, value, delta, hint, href, loading, icon: Icon, suffix, sub }) {
  const body = (
    <div className={cx('card h-full p-4 transition', href && 'hover:border-brand-500/40 hover:shadow-md')}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-subtle" title={hint}>{label}</p>
        {Icon && <Icon className="h-4 w-4 text-subtle" />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{typeof value === 'number' ? fmtNum(value) : value}{suffix}</span>
          <Delta value={delta} />
        </div>
      )}
      {sub && <p className="mt-1 text-xs text-subtle">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function PageHeader({ title, description, actions, breadcrumbs }) {
  return (
    <div className="mb-6">
      {breadcrumbs?.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-subtle">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              {b.href ? <Link href={b.href} className="hover:text-ink">{b.label}</Link> : <span className="text-muted">{b.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-subtle">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Table({ columns, rows, onRowClick, empty, rowKey = (r) => r.id }) {
  if (!rows?.length) return empty || null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-line bg-surface/60">
          <tr>{columns.map((c) => <th key={c.key} className={cx('table-th', c.className, c.align === 'right' && 'text-right')}>{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('transition-colors', onRowClick && 'cursor-pointer hover:bg-surface/70')}>
              {columns.map((c) => <td key={c.key} className={cx('table-td', c.className, c.align === 'right' && 'text-right tabular-nums')}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Menu({ trigger, children, align = 'right', className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cx('absolute z-40 mt-1 min-w-[220px] rounded-lg border border-line bg-panel p-1 shadow-lg animate-fade-in', align === 'right' ? 'right-0' : 'left-0', className)} onClick={(e) => e.target.closest('[data-menu-close]') && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
export function MenuItem({ children, onClick, active, icon: Icon, danger, href }) {
  const cls = cx('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors', danger ? 'text-[#c43b3a] hover:bg-red-500/10' : 'hover:bg-surface', active && 'bg-surface font-medium');
  const inner = (
    <>
      {Icon && <Icon className="h-4 w-4 text-subtle" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active && <Check className="h-4 w-4 text-brand-500" />}
    </>
  );
  return href ? <Link data-menu-close href={href} className={cls}>{inner}</Link> : <button data-menu-close onClick={onClick} className={cls}>{inner}</button>;
}

export function KeyValue({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-subtle">{k}</dt>
          <dd className="mt-0.5 truncate text-sm">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
