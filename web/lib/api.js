'use client';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
    this.body = body;
  }
}

let refreshing = null;
async function refresh() {
  if (!refreshing) refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).then((r) => r.ok).finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// Fetch wrapper for the dashboard API. Transparently refreshes the access token once on 401.
export async function api(path, { method = 'GET', body, query, raw = false, retry = true } = {}) {
  const url = `${path.startsWith('/api') || path.startsWith('/v1') || path.startsWith('/health') ? '' : '/api'}${path}${qs(query)}`;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && !path.includes('/auth/refresh') && !path.includes('/auth/login')) {
    if (await refresh()) return api(path, { method, body, query, raw, retry: false });
  }
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: { message: text.slice(0, 200) } };
  }
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

export const fetcher = (key) => (Array.isArray(key) ? api(key[0], { query: key[1] }) : api(key));
