'use client';
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import Link from 'next/link';
import { fmtNum, fmtShortDate, SERIES } from '@/lib/format';
import { cx } from './ui';

function ChartTooltip({ active, payload, label, labelFormatter = fmtShortDate, valueFormatter = fmtNum }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-ink">{labelFormatter(label)}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums text-ink">{valueFormatter(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Time series chart. `series` = [{ key, label }]; colors follow fixed categorical order by series index.
export function TimeChart({ data, series, xKey = 'date', type = 'area', height = 260, valueFormatter, stacked = false }) {
  const multi = series.length > 1;
  const common = { data, margin: { top: 8, right: 8, left: -12, bottom: 0 } };
  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="0" />
      <XAxis dataKey={xKey} tickFormatter={fmtShortDate} tickLine={false} axisLine={false} minTickGap={24} dy={6} />
      <YAxis tickFormatter={fmtNum} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
      <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1, strokeDasharray: '3 3' }} />
      {multi && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(v) => <span className="text-muted">{v}</span>} />}
    </>
  );
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        {type === 'line' ? (
          <LineChart {...common}>
            {axes}
            {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label || s.key} stroke={s.color || SERIES[i % 8]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--panel))' }} isAnimationActive={false} />)}
          </LineChart>
        ) : type === 'bar' ? (
          <BarChart {...common} barCategoryGap="20%">
            {axes}
            {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={s.color || SERIES[i % 8]} radius={stacked ? 0 : [4, 4, 0, 0]} stackId={stacked ? 'a' : undefined} isAnimationActive={false} />)}
          </BarChart>
        ) : (
          <AreaChart {...common}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`g-${s.key.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color || SERIES[i % 8]} stopOpacity={multi ? 0.12 : 0.22} />
                  <stop offset="100%" stopColor={s.color || SERIES[i % 8]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {axes}
            {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label || s.key} stroke={s.color || SERIES[i % 8]} strokeWidth={2} fill={`url(#g-${s.key.replace(/[^a-z0-9]/gi, '')})`} stackId={stacked ? 'a' : undefined} activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--panel))' }} isAnimationActive={false} />)}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// Horizontal bar list (top-N ranking) — HTML for crisp labels.
export function BarList({ items, valueKey = 'count', labelKey = 'name', hrefFor, secondary, color = 'var(--series-1)', format = fmtNum }) {
  const max = Math.max(1, ...items.map((i) => i[valueKey] || 0));
  return (
    <ul className="space-y-1.5">
      {items.map((it) => {
        const pct = ((it[valueKey] || 0) / max) * 100;
        const inner = (
          <div className="group relative flex h-8 items-center justify-between gap-3 rounded-md px-2 text-sm" title={`${it[labelKey]}: ${format(it[valueKey])}`}>
            <div className="absolute inset-y-0 left-0 rounded-md opacity-[0.14] transition-opacity group-hover:opacity-25" style={{ width: `${Math.max(pct, 1.5)}%`, background: color }} />
            <span className="relative truncate font-medium">{it[labelKey]}</span>
            <span className="relative flex shrink-0 items-center gap-3 tabular-nums">
              {secondary && <span className="text-xs text-subtle">{secondary(it)}</span>}
              <span>{format(it[valueKey])}</span>
            </span>
          </div>
        );
        return <li key={it[labelKey]}>{hrefFor ? <Link href={hrefFor(it)} className="block">{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}

// Funnel: vertical bars per step with conversion and drop-off annotations.
export function FunnelChart({ steps }) {
  const max = Math.max(1, steps[0]?.users || 0);
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-2 sm:gap-4" role="img" aria-label="Funnel chart">
      {steps.map((s, i) => {
        const h = Math.max(2, (s.users / max) * 220);
        return (
          <div key={i} className="flex min-w-[96px] flex-1 flex-col items-center">
            <div className="mb-1 text-center">
              <p className="text-sm font-semibold tabular-nums">{fmtNum(s.users)}</p>
              <p className="text-[11px] text-subtle">{s.conversionFromStart}% of start</p>
            </div>
            <div className="relative flex h-[230px] w-full items-end justify-center">
              <div className="absolute bottom-0 w-full max-w-[120px] rounded-t-[4px] bg-line/40" style={{ height: 220 }} />
              <div className="group relative w-full max-w-[120px] rounded-t-[4px] transition-all" style={{ height: h, background: 'var(--series-1)' }} title={`${s.label}: ${fmtNum(s.users)} users`} />
            </div>
            <div className="mt-2 w-full text-center">
              <p className="truncate text-xs font-medium" title={s.label}>{i + 1}. {s.label}</p>
              <p className="mt-0.5 h-4 text-[11px]">
                {i > 0 ? (
                  <>
                    <span className="text-[#087a08] dark:text-[#4cc94c]">{s.conversionFromPrevious}%</span>
                    <span className="text-subtle"> · </span>
                    <span className="text-[#b4302f] dark:text-[#f08080]">−{fmtNum(s.dropOff)}</span>
                  </>
                ) : <span className="text-subtle">entry</span>}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Retention heatmap using a single-hue sequential ramp.
const RAMP = ['#eef4fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
export function RetentionGrid({ cohorts, average, period }) {
  if (!cohorts?.length) return null;
  const n = average.length;
  const cell = (v) => {
    if (v === null || v === undefined) return { background: 'transparent' };
    const idx = Math.min(RAMP.length - 1, Math.floor((v / 100) * (RAMP.length - 1) + 0.0001 + (v > 0 ? 0.5 : 0)));
    return { background: RAMP[idx], color: idx >= 4 ? '#fff' : '#0b0b0b' };
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-medium text-subtle">Cohort</th>
            <th className="px-2 py-1 text-right font-medium text-subtle">Users</th>
            {Array.from({ length: n }).map((_, i) => <th key={i} className="px-2 py-1 text-center font-medium text-subtle">{period === 'day' ? 'Day' : 'Week'} {i}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-2 py-1.5 font-medium">Average</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-subtle">{fmtNum(cohorts.reduce((s, c) => s + c.size, 0))}</td>
            {average.map((v, i) => <td key={i} className="rounded px-2 py-1.5 text-center font-semibold tabular-nums" style={cell(v)}>{v === null ? '' : `${v}%`}</td>)}
          </tr>
          {cohorts.map((c) => (
            <tr key={c.start}>
              <td className="whitespace-nowrap px-2 py-1.5 text-muted">{fmtShortDate(c.start)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-subtle">{fmtNum(c.size)}</td>
              {c.percentages.map((v, i) => <td key={i} className="rounded px-2 py-1.5 text-center tabular-nums" style={cell(v)} title={v === null ? 'Not enough time elapsed' : `${c.retained[i]} of ${c.size} users`}>{v === null ? '' : `${v}%`}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sparkbar({ value, max = 100, className }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-line/60', className)}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / (max || 1)) * 100)}%`, background: 'var(--series-1)' }} />
    </div>
  );
}
