'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { UserPlus, Trash2, Mail, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { api, fetcher } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Button, Table, Badge, Select, Modal, Field, Input, EmptyState, ErrorState, LoadingBlock, ConfirmDialog, CopyButton, Callout, Tabs } from '@/components/ui';
import { fmtDate, timeAgo } from '@/lib/format';

const ROLE_INFO = {
  owner: 'Full control, including billing boundary, deletion and owners',
  admin: 'Manage members, projects, keys, webhooks and settings',
  developer: 'Manage integrations, events, features, funnels and webhooks',
  viewer: 'Read-only access to analytics and reports',
};
const ROLE_COLOR = { owner: 'violet', admin: 'blue', developer: 'green', viewer: 'gray' };

export default function TeamPage() {
  const { org, orgId, user, canOrg, me } = useWorkspace();
  const { toast, error: toastError } = useToast();
  const [tab, setTab] = useState('members');
  const members = useSWR(orgId ? `/orgs/${orgId}/members` : null, fetcher);
  const invites = useSWR(orgId && canOrg('admin') ? `/orgs/${orgId}/invitations` : null, fetcher);
  const [invite, setInvite] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'developer' });
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState(null);
  const [remove, setRemove] = useState(null);

  async function sendInvite() {
    setSending(true);
    try {
      const r = await api(`/orgs/${orgId}/invitations`, { method: 'POST', body: form });
      setInvite(false);
      setLink(r.inviteUrl);
      setForm({ email: '', role: 'developer' });
      invites.mutate();
    } catch (err) {
      toastError(err.details?.[0]?.message || err);
    } finally {
      setSending(false);
    }
  }
  async function changeRole(m, role) {
    try {
      await api(`/orgs/${orgId}/members/${m.id}`, { method: 'PATCH', body: { role } });
      toast(`${m.user.name} is now ${role}`);
      members.mutate();
      me.mutate();
    } catch (err) {
      toastError(err);
    }
  }
  async function doRemove() {
    try {
      await api(`/orgs/${orgId}/members/${remove.id}`, { method: 'DELETE' });
      toast(remove.user.id === user.id ? `You left ${org.name}` : `${remove.user.name} removed`);
      if (remove.user.id === user.id) {
        localStorage.removeItem('ft_org');
        window.location.href = '/dashboard';
        return;
      }
      setRemove(null);
      members.mutate();
    } catch (err) {
      toastError(err);
      setRemove(null);
    }
  }
  const pending = invites.data?.items?.filter((i) => i.status === 'pending') || [];
  const isOwner = org?.role === 'owner';

  return (
    <>
      <PageHeader title="Team" description={`Members of ${org?.name} and their roles.`} breadcrumbs={[{ label: org?.name }, { label: 'Team' }]} actions={canOrg('admin') && <Button icon={UserPlus} onClick={() => setInvite(true)}>Invite member</Button>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(ROLE_INFO).map(([r, d]) => <div key={r} className="card p-3"><Badge color={ROLE_COLOR[r]}>{r}</Badge><p className="mt-1.5 text-xs text-subtle">{d}</p></div>)}
      </div>
      {canOrg('admin') && <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ id: 'members', label: 'Members', count: members.data?.items?.length }, { id: 'invitations', label: 'Invitations', count: pending.length }]} />}
      {tab === 'members' ? (
        <Card padded={false}>
          {members.error ? <ErrorState error={members.error} onRetry={() => members.mutate()} /> : !members.data ? <div className="p-4"><LoadingBlock /></div> : (
            <Table
              columns={[
                { key: 'user', label: 'Member', render: (m) => <div><p className="font-medium">{m.user.name}{m.user.id === user.id && <span className="ml-1.5 text-xs text-subtle">(you)</span>}</p><p className="text-xs text-subtle">{m.user.email}</p></div> },
                { key: 'role', label: 'Role', render: (m) => (canOrg('admin') && m.user.id !== user.id && (isOwner || m.role !== 'owner') ? (
                  <Select value={m.role} onChange={(e) => changeRole(m, e.target.value)} className="w-36 py-1 text-xs" aria-label={`Role for ${m.user.name}`}>
                    {['viewer', 'developer', 'admin', ...(isOwner ? ['owner'] : [])].map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                ) : <Badge color={ROLE_COLOR[m.role]}>{m.role}</Badge>) },
                { key: 'joined', label: 'Joined', render: (m) => <span className="text-xs text-subtle">{fmtDate(m.joinedAt)}</span> },
                { key: 'login', label: 'Last login', render: (m) => <span className="text-xs text-subtle">{timeAgo(m.user.lastLoginAt)}</span> },
                { key: 'actions', label: '', align: 'right', render: (m) => (m.user.id === user.id || (canOrg('admin') && (isOwner || m.role !== 'owner'))) && <Button size="xs" variant="danger-ghost" icon={Trash2} onClick={() => setRemove(m)}>{m.user.id === user.id ? 'Leave' : 'Remove'}</Button> },
              ]}
              rows={members.data.items}
            />
          )}
        </Card>
      ) : (
        <Card padded={false}>
          {invites.error ? <ErrorState error={invites.error} /> : !invites.data ? <div className="p-4"><LoadingBlock /></div> : (
            <Table
              columns={[
                { key: 'email', label: 'Email', render: (i) => <span className="flex items-center gap-2"><Mail className="h-4 w-4 text-subtle" />{i.email}</span> },
                { key: 'role', label: 'Role', render: (i) => <Badge color={ROLE_COLOR[i.role]}>{i.role}</Badge> },
                { key: 'status', label: 'Status', render: (i) => <Badge color={i.status === 'pending' ? 'yellow' : i.status === 'accepted' ? 'green' : 'gray'}>{i.status}</Badge> },
                { key: 'by', label: 'Invited by', render: (i) => <span className="text-xs text-subtle">{i.invitedBy?.name} · {fmtDate(i.createdAt)}</span> },
                { key: 'exp', label: 'Expires', render: (i) => <span className="text-xs text-subtle">{fmtDate(i.expiresAt)}</span> },
                { key: 'a', label: '', align: 'right', render: (i) => i.status === 'pending' && <Button size="xs" variant="danger-ghost" onClick={async () => { try { await api(`/orgs/${orgId}/invitations/${i.id}`, { method: 'DELETE' }); toast('Invitation revoked'); invites.mutate(); } catch (e) { toastError(e); } }}>Revoke</Button> },
              ]}
              rows={invites.data.items}
              empty={<EmptyState icon={Mail} title="No invitations" description="Invite teammates by email." />}
            />
          )}
        </Card>
      )}
      <Modal open={invite} onClose={() => setInvite(false)} title="Invite a team member" footer={<><Button variant="secondary" onClick={() => setInvite(false)}>Cancel</Button><Button loading={sending} disabled={!form.email.includes('@')} onClick={sendInvite}>Send invitation</Button></>}>
        <div className="space-y-4">
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="teammate@company.com" /></Field>
          <Field label="Role" hint={ROLE_INFO[form.role]}><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{['viewer', 'developer', 'admin'].map((r) => <option key={r}>{r}</option>)}</Select></Field>
        </div>
      </Modal>
      <Modal open={!!link} onClose={() => setLink(null)} title="Invitation created" footer={<Button onClick={() => setLink(null)}>Done</Button>}>
        <p className="text-sm text-muted">Share this link with your teammate. It expires in 7 days and only works for the invited email address.</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface p-3"><code className="min-w-0 flex-1 break-all font-mono text-xs">{link}</code><CopyButton value={link || ''} label="Copy" /></div>
        <Callout tone="info" className="mt-3"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />If they already have an account, they'll also see it in their notifications.</Callout>
      </Modal>
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} onConfirm={doRemove} title={remove?.user.id === user.id ? `Leave ${org?.name}?` : `Remove ${remove?.user.name}?`} description={remove?.user.id === user.id ? 'You will lose access to all projects in this organization.' : 'They will immediately lose access to every project in this organization.'} confirmLabel={remove?.user.id === user.id ? 'Leave organization' : 'Remove member'} />
    </>
  );
}
