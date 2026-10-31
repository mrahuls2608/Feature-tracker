'use client';
import { Suspense, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { Monitor, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { useTheme } from '@/lib/theme';
import { api, fetcher } from '@/lib/api';
import { passwordIssues, timeAgo, fmtDateTime } from '@/lib/format';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Tabs, Field, Input, Textarea, Select, Button, Toggle, Badge, ConfirmDialog, LoadingBlock, Callout, Segmented, EmptyState } from '@/components/ui';

function Section({ title, description, children, footer }) {
  return (
    <Card title={title} description={description}>
      <div className="max-w-xl space-y-4">{children}</div>
      {footer && <div className="mt-5 flex gap-2 border-t border-line pt-4">{footer}</div>}
    </Card>
  );
}

function useSave() {
  const { toast, error } = useToast();
  const [saving, setSaving] = useState(false);
  const run = async (fn, msg = 'Saved') => {
    setSaving(true);
    try {
      const r = await fn();
      toast(msg);
      return r;
    } catch (err) {
      error(err.details?.map((d) => d.message).join('. ') || err);
    } finally {
      setSaving(false);
    }
  };
  return [saving, run];
}

function Profile() {
  const { user, me } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({ name: user.name, email: user.email });
  const [saving, run] = useSave();
  return (
    <div className="space-y-6">
      <Section title="Profile" footer={<Button loading={saving} disabled={!form.name || (form.name === user.name && form.email === user.email)} onClick={() => run(async () => { await api('/auth/me', { method: 'PATCH', body: form }); me.mutate(); }, 'Profile updated')}>Save profile</Button>}>
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email" hint="Pending invitations are matched to this address"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      </Section>
      <Section title="Appearance">
        <Field label="Theme"><Segmented size="md" value={theme} onChange={(t) => { setTheme(t); api('/auth/me', { method: 'PATCH', body: { preferences: { theme: t } } }).catch(() => {}); }} options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }]} /></Field>
      </Section>
    </div>
  );
}

function Security() {
  const { me } = useWorkspace();
  const sessions = useSWR('/auth/sessions', fetcher);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, run] = useSave();
  const issues = passwordIssues(pw.newPassword);
  const [revokeAll, setRevokeAll] = useState(false);
  return (
    <div className="space-y-6">
      <Section title="Change password" description="Changing your password signs out every other session." footer={<Button loading={saving} disabled={!pw.currentPassword || issues.length > 0 || pw.newPassword !== pw.confirm} onClick={async () => { const ok = await run(() => api('/auth/change-password', { method: 'POST', body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } }), 'Password changed'); if (ok) { setPw({ currentPassword: '', newPassword: '', confirm: '' }); sessions.mutate(); } }}>Update password</Button>}>
        <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
        <Field label="New password" error={pw.newPassword && issues.length ? `Needs ${issues.join(', ')}` : null}><Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
        <Field label="Confirm new password" error={pw.confirm && pw.confirm !== pw.newPassword ? 'Passwords do not match' : null}><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
      </Section>
      <Card title="Active sessions" description="Devices currently signed in to your account." actions={sessions.data?.items?.length > 1 && <Button size="sm" variant="danger-ghost" onClick={() => setRevokeAll(true)}>Sign out other sessions</Button>} padded={false}>
        {!sessions.data ? <div className="p-4"><LoadingBlock rows={2} /></div> : (
          <ul className="divide-y divide-line">
            {sessions.data.items.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <Monitor className="h-5 w-5 shrink-0 text-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{s.userAgent || 'Unknown device'}</p>
                  <p className="text-xs text-subtle">{s.ip} · signed in {fmtDateTime(s.createdAt)} · active {timeAgo(s.lastUsedAt)}</p>
                </div>
                {s.current ? <Badge color="green">This device</Badge> : <Button size="xs" variant="danger-ghost" onClick={() => run(async () => { await api(`/auth/sessions/${s.id}`, { method: 'DELETE' }); sessions.mutate(); }, 'Session revoked')}>Revoke</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ConfirmDialog open={revokeAll} onClose={() => setRevokeAll(false)} title="Sign out all other sessions?" description="Every other device will be signed out immediately." confirmLabel="Sign out others" onConfirm={async () => { await run(() => api('/auth/sessions/revoke-others', { method: 'POST' }), 'Other sessions signed out'); setRevokeAll(false); sessions.mutate(); me.mutate(); }} />
    </div>
  );
}

function Notifications() {
  const { user, me } = useWorkspace();
  const [prefs, setPrefs] = useState(user.preferences?.notifications || {});
  const [saving, run] = useSave();
  const items = [
    ['invitations', 'Invitations', 'When someone invites you to an organization'],
    ['memberChanges', 'Membership changes', 'When your role changes'],
    ['webhookFailures', 'Webhook failures', 'When a webhook delivery fails permanently (admins)'],
    ['apiKeyChanges', 'API key changes', 'When API keys are created or revoked (admins)'],
  ];
  return (
    <Section title="Notification preferences" description="In-app notifications shown under the bell icon." footer={<Button loading={saving} onClick={() => run(async () => { await api('/auth/me', { method: 'PATCH', body: { preferences: { notifications: prefs } } }); me.mutate(); }, 'Preferences saved')}>Save preferences</Button>}>
      {items.map(([k, label, desc]) => (
        <div key={k} className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-subtle">{desc}</p></div>
          <Toggle checked={prefs[k] !== false} onChange={(v) => setPrefs({ ...prefs, [k]: v })} label={label} />
        </div>
      ))}
    </Section>
  );
}

function Organization() {
  const { org, orgId, canOrg, me } = useWorkspace();
  const router = useRouter();
  const detail = useSWR(orgId ? `/orgs/${orgId}` : null, fetcher);
  const [form, setForm] = useState(null);
  const [saving, run] = useSave();
  const [del, setDel] = useState(false);
  useEffect(() => {
    if (detail.data) setForm({ name: detail.data.name, website: detail.data.website || '', retentionDays: detail.data.settings?.retentionDays || 365, defaultRole: detail.data.settings?.defaultRole || 'viewer' });
  }, [detail.data]);
  if (!form) return <LoadingBlock />;
  const editable = canOrg('admin');
  return (
    <div className="space-y-6">
      {!editable && <Callout>Only owners and admins can change organization settings.</Callout>}
      <Section title="Organization details" footer={editable && <Button loading={saving} onClick={() => run(async () => { await api(`/orgs/${orgId}`, { method: 'PATCH', body: { name: form.name, website: form.website, settings: { defaultRole: form.defaultRole } } }); detail.mutate(); me.mutate(); }, 'Organization updated')}>Save</Button>}>
        <Field label="Name"><Input disabled={!editable} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Website"><Input disabled={!editable} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://acme.com" /></Field>
        <Field label="Slug"><Input disabled value={detail.data.slug} /></Field>
      </Section>
      <Section title="Data retention" description="Raw events older than this are deleted automatically (checked hourly). Aggregates update accordingly." footer={editable && <Button loading={saving} onClick={() => run(async () => { await api(`/orgs/${orgId}`, { method: 'PATCH', body: { settings: { retentionDays: Number(form.retentionDays) } } }); detail.mutate(); }, 'Retention policy updated')}>Save retention</Button>}>
        <Field label="Keep raw events for">
          <Select disabled={!editable} value={form.retentionDays} onChange={(e) => setForm({ ...form, retentionDays: Number(e.target.value) })}>
            {[30, 90, 180, 365, 730, 1825].map((d) => <option key={d} value={d}>{d < 365 ? `${d} days` : `${d / 365} year${d > 365 ? 's' : ''}`}</option>)}
          </Select>
        </Field>
      </Section>
      {org?.role === 'owner' && (
        <Card title="Danger zone" className="border-[#e34948]/30">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm font-medium">Delete organization</p><p className="text-sm text-subtle">Permanently deletes all projects, events, members and settings.</p></div>
            <Button variant="danger" icon={Trash2} onClick={() => setDel(true)}>Delete organization</Button>
          </div>
        </Card>
      )}
      <ConfirmDialog open={del} onClose={() => setDel(false)} title={`Delete ${org?.name}?`} description="This cannot be undone." confirmText={org?.name} confirmLabel="Delete organization" onConfirm={async () => { const r = await run(() => api(`/orgs/${orgId}`, { method: 'DELETE', body: { confirm: org.name } }), 'Organization deleted'); if (r) { localStorage.removeItem('ft_org'); await me.mutate(); router.replace('/dashboard'); } }} />
    </div>
  );
}

function ProjectSettings() {
  const { project, can, projects } = useWorkspace();
  const [form, setForm] = useState(null);
  const [saving, run] = useSave();
  useEffect(() => {
    if (project) setForm({ name: project.name, description: project.description, strictEvents: !!project.settings?.strictEvents, timezone: project.settings?.timezone || 'UTC' });
  }, [project]);
  if (!project) return <EmptyState title="No project selected" />;
  if (!form) return <LoadingBlock />;
  const editable = can('admin');
  return (
    <Section title={`Project · ${project.name}`} description="Project-wide configuration applies to all environments." footer={editable && <Button loading={saving} onClick={() => run(async () => { await api(`/projects/${project.id}`, { method: 'PATCH', body: { name: form.name, description: form.description, settings: { strictEvents: form.strictEvents, timezone: form.timezone } } }); projects.mutate(); }, 'Project settings saved')}>Save</Button>}>
      {!editable && <Callout>Only project admins can change these settings.</Callout>}
      <Field label="Name"><Input disabled={!editable} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Description"><Textarea disabled={!editable} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Reporting timezone" hint="Stored for reporting preferences; analytics buckets use UTC."><Select disabled={!editable} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>{['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-line p-3">
        <div><p className="text-sm font-medium">Strict event validation</p><p className="text-xs text-subtle">Reject events whose name isn't defined on the Events page (ingestion returns 422).</p></div>
        <Toggle disabled={!editable} checked={form.strictEvents} onChange={(v) => setForm({ ...form, strictEvents: v })} label="Strict events" />
      </div>
    </Section>
  );
}

function Environments() {
  const { project, can, projects } = useWorkspace();
  const [saving, run] = useSave();
  const [envs, setEnvs] = useState([]);
  useEffect(() => setEnvs(project?.environments || []), [project]);
  if (!project) return <EmptyState title="No project selected" />;
  const editable = can('admin');
  return (
    <div className="space-y-4">
      {envs.map((e, i) => (
        <Card key={e.id} title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />{e.name} <Badge>{e.type}</Badge></span>}>
          <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
            <Field label="Display name"><Input disabled={!editable} value={e.name} onChange={(ev) => setEnvs(envs.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} /></Field>
            <Field label="Color"><Input type="color" disabled={!editable} value={e.color} onChange={(ev) => setEnvs(envs.map((x, j) => (j === i ? { ...x, color: ev.target.value } : x)))} className="h-[38px] p-1" /></Field>
            <Field label="Ingestion"><label className="flex h-[38px] items-center gap-2 text-sm"><Toggle disabled={!editable} checked={e.settings?.ingestionEnabled !== false} onChange={(v) => setEnvs(envs.map((x, j) => (j === i ? { ...x, settings: { ...x.settings, ingestionEnabled: v } } : x)))} label="Ingestion enabled" />{e.settings?.ingestionEnabled !== false ? 'Accepting events' : 'Paused'}</label></Field>
          </div>
          {editable && <Button className="mt-4" size="sm" loading={saving} onClick={() => run(async () => { await api(`/projects/${project.id}/environments/${e.id}`, { method: 'PATCH', body: { name: e.name, color: e.color, settings: { ingestionEnabled: e.settings?.ingestionEnabled !== false } } }); projects.mutate(); }, `${e.name} updated`)}>Save {e.type}</Button>}
        </Card>
      ))}
    </div>
  );
}

function SettingsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') || 'profile';
  const tabs = [{ id: 'profile', label: 'Profile' }, { id: 'security', label: 'Security & sessions' }, { id: 'notifications', label: 'Notifications' }, { id: 'organization', label: 'Organization' }, { id: 'project', label: 'Project' }, { id: 'environments', label: 'Environments' }];
  return (
    <>
      <PageHeader title="Settings" breadcrumbs={[{ label: 'Settings' }]} />
      <Tabs className="mb-6" value={tab} onChange={(t) => router.replace(`/settings?tab=${t}`)} tabs={tabs} />
      {tab === 'profile' && <Profile />}
      {tab === 'security' && <Security />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'organization' && <Organization />}
      {tab === 'project' && <ProjectSettings />}
      {tab === 'environments' && <Environments />}
    </>
  );
}

export default function SettingsPage() {
  return <Suspense><SettingsInner /></Suspense>;
}
