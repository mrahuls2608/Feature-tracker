'use client';
import { use, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/AuthLayout';
import { Button, Callout, LoadingBlock, Badge } from '@/components/ui';
import { api, fetcher } from '@/lib/api';
import { useToast } from '@/components/toast';

export default function InvitePage({ params }) {
  const { token } = use(params);
  const router = useRouter();
  const { toast, error: toastError } = useToast();
  const invite = useSWR(`/public/invitations/${token}`, fetcher, { shouldRetryOnError: false });
  const me = useSWR('/auth/me', fetcher, { shouldRetryOnError: false });
  const [busy, setBusy] = useState(null);
  const next = `/invite/${token}`;

  async function respond(action) {
    setBusy(action);
    try {
      await api(`/invitations/token/${token}/${action}`, { method: 'POST' });
      if (action === 'accept') {
        localStorage.setItem('ft_org', invite.data.organization.id);
        toast(`You joined ${invite.data.organization.name}`);
        router.replace('/dashboard');
      } else {
        toast('Invitation declined');
        invite.mutate();
      }
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }

  const inv = invite.data;
  return (
    <AuthLayout title="Join your team" subtitle="You've been invited to collaborate on FeatureTrack">
      {invite.isLoading || me.isLoading ? (
        <LoadingBlock rows={2} />
      ) : invite.error ? (
        <Callout tone="danger" title="Invitation not found">This invitation link is invalid. Ask your admin for a new one.</Callout>
      ) : (
        <div className="space-y-5">
          <div className="card p-4">
            <p className="text-sm text-subtle">{inv.invitedBy?.name || 'A teammate'} invited <span className="font-medium text-ink">{inv.email}</span> to</p>
            <p className="mt-1 text-lg font-semibold">{inv.organization?.name}</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-subtle">Role <Badge color="blue">{inv.role}</Badge></div>
          </div>
          {inv.status !== 'pending' ? (
            <Callout tone="warning">This invitation is <strong>{inv.status}</strong>.</Callout>
          ) : !me.data ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">Sign in or create an account with <strong>{inv.email}</strong> to accept.</p>
              <div className="flex gap-2">
                <Button href={`/login?next=${encodeURIComponent(next)}`} className="flex-1">Sign in</Button>
                <Button variant="secondary" href={`/register?next=${encodeURIComponent(next)}`} className="flex-1">Create account</Button>
              </div>
            </div>
          ) : me.data.user.email !== inv.email ? (
            <Callout tone="warning" title="Different account">You're signed in as {me.data.user.email}. Sign in as {inv.email} to accept this invitation.</Callout>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" loading={busy === 'accept'} onClick={() => respond('accept')}>Accept invitation</Button>
              <Button variant="secondary" loading={busy === 'reject'} onClick={() => respond('reject')}>Decline</Button>
            </div>
          )}
          <p className="text-xs text-subtle"><Link href="/dashboard" className="hover:underline">Go to dashboard</Link></p>
        </div>
      )}
    </AuthLayout>
  );
}
