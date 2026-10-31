export const fmtNum = (n) => (n === null || n === undefined ? '—' : Intl.NumberFormat('en-US', { notation: Math.abs(n) >= 100000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n));
export const fmtPct = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 10) / 10}%`);
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
export const fmtShortDate = (s) => {
  if (!s) return '';
  if (s.length === 7) return new Date(`${s}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  if (s.length > 10) return new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : ':00Z')).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
};
export function timeAgo(d) {
  if (!d) return 'never';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}
export const fmtDuration = (ms) => {
  if (ms === null || ms === undefined) return '—';
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round((s / 3600) * 10) / 10}h`;
  return `${Math.round((s / 86400) * 10) / 10}d`;
};
export const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

export function passwordIssues(p) {
  const issues = [];
  if (p.length < 10) issues.push('at least 10 characters');
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p)) issues.push('upper and lower case letters');
  if (!/\d/.test(p)) issues.push('a number');
  return issues;
}

export const FEATURE_STATUS_COLOR = { planned: 'gray', beta: 'violet', live: 'green', deprecated: 'yellow' };
