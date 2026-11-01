'use client';
import { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/AuthLayout';
import { Button, Field, Input, Textarea, Callout, Badge } from '@/components/ui';
import { api, fetcher } from '@/lib/api';

export default function Onboarding() {
  const router = useRouter();
  const invites = useSWR('/invitations', fetcher, { shouldRetryOnError: false, onError: (e) => e.status === 401 && router.replace('/login?next=/onboarding') });
  const [step, setStep] = useState(1);
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState({ orgName: '', projectName: 'Commerce Platform', description: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function createOrg(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const o = await api('/orgs', { method: 'POST', body: { name: form.orgName } });
      localStorage.setItem('ft_org', o.id);
      setOrg(o);
      setStep(2);
    } catch (err) {
      setError(err.details?.map((d) => d.message).join('. ') || err.message);
    } finally {
      setLoading(false);
    }
  }
  async function createProject(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const p = await api(`/orgs/${org.id}/projects`, { method: 'POST', body: { name: form.projectName, description: form.description } });
      localStorage.setItem(`ft_project:${org.id}`, p.id);
      await globalMutate('/auth/me');
      router.replace('/docs?welcome=1');
    } catch (err) {
      setError(err.details?.map((d) => d.message).join('. ') || err.message);
      setLoading(false);
    }
  }
  async function accept(id) {
    await api(`/invitations/${id}/accept`, { method: 'POST' });
    await globalMutate('/auth/me');
    router.replace('/dashboard');
  }

  return (
    <AuthLayout title={step === 1 ? 'Create your organization' : 'Create your first project'} subtitle={step === 1 ? 'Organizations hold your team, projects and billing boundary.' : 'Projects get Development, Staging and Production environments automatically.'}>
      <div className="mb-6 flex gap-2">{[1, 2].map((s) => <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-brand-500' : 'bg-line'}`} />)}</div>
      {error && <Callout tone="danger" className="mb-4">{error}</Callout>}
      {step === 1 && invites.data?.items?.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-sm font-medium">Pending invitations</p>
          {invites.data.items.map((i) => (
            <div key={i.id} className="card flex items-center justify-between p-3">
              <div><p className="text-sm font-medium">{i.organization?.name}</p><Badge color="blue">{i.role}</Badge></div>
              <Button size="sm" onClick={() => accept(i.id)}>Join</Button>
            </div>
          ))}
          <p className="pt-2 text-center text-xs text-subtle">or create a new organization</p>
        </div>
      )}
      {step === 1 ? (
        <form onSubmit={createOrg} className="space-y-4">
          <Field label="Organization name"><Input autoFocus value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} placeholder="Acme Inc." /></Field>
          <Button type="submit" className="w-full" loading={loading} disabled={form.orgName.trim().length < 2}>Continue</Button>
        </form>
      ) : (
        <form onSubmit={createProject} className="space-y-4">
          <Field label="Project name"><Input autoFocus value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} /></Field>
          <Field label="Description" hint="Optional"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Our e-commerce web and mobile apps" /></Field>
          <Button type="submit" className="w-full" loading={loading} disabled={form.projectName.trim().length < 2}>Create project</Button>
        </form>
      )}
    </AuthLayout>
  );
}
