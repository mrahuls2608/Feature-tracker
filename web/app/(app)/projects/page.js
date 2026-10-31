'use client';
import { Suspense, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { Plus, Archive, ArchiveRestore, Trash2, UsersRound, Lock, FolderKanban } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { api, fetcher } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Button, Badge, Modal, Field, Input, Textarea, Select, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Segmented, Table, Callout } from '@/components/ui';
import { fmtDate, timeAgo } from '@/lib/format';

function MembersModal({ project, onClose }) {
  const { toast, error: toastError } = useToast();
  const { data, mutate } = useSWR(project ? `/projects/${project.id}/members` : null, fetcher);
  async function set(userId, role) {
    try {
      await api(`/projects/${project.id}/members/${userId}`, { method: 'PUT', body: { role: role || null } });
      toast('Project access updated');
      mutate();
    } catch (err) {
      toastError(err);
    }
  }
  return (
    <Modal open={!!project} onClose={onClose} size="lg" title={`Access to ${project?.name}`} description={project?.access === 'restricted' ? 'Restricted: only owners/admins and assigned members can access this project.' : 'Organization-wide: every member can access with their org role unless overridden here.'}>
      {!data ? <LoadingBlock /> : (
        <Table
          rowKey={(m) => m.userId}
          columns={[
            { key: 'u', label: 'Member', render: (m) => <div><p className="text-sm font-medium">{m.name}</p><p className="text-xs text-subtle">{m.email}</p></div> },
            { key: 'org', label: 'Org role', render: (m) => <Badge>{m.orgRole}</Badge> },
            { key: 'p', label: 'Project role', render: (m) => (['owner', 'admin'].includes(m.orgRole) ? <span className="text-xs text-subtle">Full access (org {m.orgRole})</span> : (
              <Select value={m.projectRole || ''} onChange={(e) => set(m.userId, e.target.value)} className="w-44 py-1 text-xs">
                <option value="">{project.access === 'restricted' ? 'No access' : `Inherit (${m.orgRole})`}</option>
                <option value="viewer">viewer</option><option value="developer">developer</option><option value="admin">admin</option>
              </Select>
            )) },
            { key: 'e', label: 'Effective', render: (m) => (m.effectiveRole ? <Badge color="blue">{m.effectiveRole}</Badge> : <Badge color="red">none</Badge>) },
          ]}
          rows={data.items}
        />
      )}
    </Modal>
  );
}

function ProjectsInner() {
  const params = useSearchParams();
  const { org, orgId, canOrg, projects: active, setProjectId, project: current } = useWorkspace();
  const { toast, error: toastError } = useToast();
  const [filter, setFilter] = useState('active');
  const { data, error, isLoading, mutate } = useSWR(orgId ? `/orgs/${orgId}/projects?archived=${filter === 'active' ? 'false' : filter === 'archived' ? 'true' : 'all'}` : null, fetcher);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', access: 'organization' });
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [members, setMembers] = useState(null);
  const activity = useSWR(current ? `/projects/${current.id}/activity?limit=10` : null, fetcher);

  useEffect(() => {
    if (params.get('new') && canOrg('admin')) openModal(null);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  function openModal(p) {
    setForm(p ? { name: p.name, description: p.description, access: p.access } : { name: '', description: '', access: 'organization' });
    setModal(p || 'new');
  }
  const refresh = () => { mutate(); active.mutate(); };
  async function save() {
    setSaving(true);
    try {
      if (modal === 'new') {
        const p = await api(`/orgs/${orgId}/projects`, { method: 'POST', body: form });
        toast(`${p.name} created with 3 environments`);
        refresh();
        setProjectId(p.id);
      } else {
        await api(`/projects/${modal.id}`, { method: 'PATCH', body: form });
        toast('Project updated');
        refresh();
      }
      setModal(null);
    } catch (err) {
      toastError(err.details?.[0]?.message || err);
    } finally {
      setSaving(false);
    }
  }
  async function archive(p, archived) {
    try {
      await api(`/projects/${p.id}/archive`, { method: 'POST', body: { archived } });
      toast(archived ? `${p.name} archived — ingestion is paused` : `${p.name} restored`);
      refresh();
    } catch (err) {
      toastError(err);
    }
  }
  async function remove() {
    try {
      await api(`/projects/${del.id}`, { method: 'DELETE', body: { confirm: del.name } });
      toast(`${del.name} deleted`);
      setDel(null);
      refresh();
    } catch (err) {
      toastError(err);
    }
  }
  return (
    <>
      <PageHeader title="Projects" description={`Projects in ${org?.name}. Each has isolated Development, Staging and Production data.`} breadcrumbs={[{ label: org?.name }, { label: 'Projects' }]} actions={canOrg('admin') && <Button icon={Plus} onClick={() => openModal(null)}>New project</Button>} />
      <div className="mb-4"><Segmented value={filter} onChange={setFilter} options={[{ id: 'active', label: 'Active' }, { id: 'archived', label: 'Archived' }, { id: 'all', label: 'All' }]} /></div>
      {error ? <Card><ErrorState error={error} onRetry={() => mutate()} /></Card> : !data ? <LoadingBlock /> : !data.items.length ? (
        <Card><EmptyState icon={FolderKanban} title={filter === 'archived' ? 'No archived projects' : 'No projects yet'} action={canOrg('admin') && filter !== 'archived' && <Button icon={Plus} onClick={() => openModal(null)}>Create project</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((p) => (
            <div key={p.id} className={`card flex flex-col p-5 ${current?.id === p.id ? 'ring-2 ring-brand-500/40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="mt-0.5 line-clamp-2 min-h-[2.5em] text-sm text-subtle">{p.description || 'No description'}</p>
                </div>
                <div className="flex shrink-0 gap-1">{p.archived && <Badge color="yellow">archived</Badge>}{p.access === 'restricted' && <Badge><Lock className="h-3 w-3" />restricted</Badge>}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">{p.environments.map((e) => <span key={e.id} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />{e.name}</span>)}</div>
              <p className="mt-3 text-xs text-subtle">Created {fmtDate(p.createdAt)} · your role: {p.role}</p>
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
                {!p.archived && current?.id !== p.id && <Button size="xs" variant="secondary" onClick={() => setProjectId(p.id)}>Switch to</Button>}
                {['admin', 'owner'].includes(p.role) && <>
                  <Button size="xs" variant="ghost" onClick={() => openModal(p)}>Edit</Button>
                  <Button size="xs" variant="ghost" icon={UsersRound} onClick={() => setMembers(p)}>Access</Button>
                  <Button size="xs" variant="ghost" icon={p.archived ? ArchiveRestore : Archive} onClick={() => archive(p, !p.archived)}>{p.archived ? 'Restore' : 'Archive'}</Button>
                  <Button size="xs" variant="danger-ghost" icon={Trash2} onClick={() => setDel(p)}>Delete</Button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}
      {current && (
        <Card className="mt-6" title={`Recent activity · ${current.name}`} padded={false}>
          {!activity.data ? <div className="p-4"><LoadingBlock rows={3} /></div> : activity.data.items.length ? (
            <ul className="divide-y divide-line">{activity.data.items.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"><span><span className="font-medium">{a.actor?.name || 'System'}</span> <span className="text-subtle">{a.action.replace(/[._]/g, ' ')}</span> {a.target?.name && <span className="font-medium">{a.target.name}</span>}</span><span className="shrink-0 text-xs text-subtle">{timeAgo(a.createdAt)}</span></li>)}</ul>
          ) : <EmptyState title="No activity yet" />}
        </Card>
      )}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'New project' : 'Edit project'} footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={saving} disabled={form.name.trim().length < 2} onClick={save}>{modal === 'new' ? 'Create project' : 'Save'}</Button></>}>
        <div className="space-y-4">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Commerce Platform" /></Field>
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Access" hint={form.access === 'restricted' ? 'Only owners, admins and members you assign can see this project.' : 'Every organization member can access with their org role.'}>
            <Select value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value })}><option value="organization">Everyone in the organization</option><option value="restricted">Restricted to assigned members</option></Select>
          </Field>
          {modal === 'new' && <Callout>Development, Staging and Production environments are created automatically, each with isolated data and API keys.</Callout>}
        </div>
      </Modal>
      <MembersModal project={members} onClose={() => setMembers(null)} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} title={`Delete ${del?.name}?`} description="All events, users, features, funnels, API keys and webhooks in this project are permanently deleted." confirmLabel="Delete project" confirmText={del?.name} />
    </>
  );
}

export default function ProjectsPage() {
  return <Suspense><ProjectsInner /></Suspense>;
}
