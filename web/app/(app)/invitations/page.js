'use client';
import useSWR from 'swr';
import { Mail } from 'lucide-react';
import { api, fetcher } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';
import { useToast } from '@/components/toast';
import { Card, PageHeader, Button, Badge, EmptyState, LoadingBlock, ErrorState } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export default function InvitationsPage() {
  const { me, setOrgId } = useWorkspace();
  const { toast, error: toastError } = useToast();
  const { data, error, mutate } = useSWR('/invitations', fetcher);
  async function respond(inv, action) {
    try {
      const r = await api(`/invitations/${inv.id}/${action}`, { method: 'POST' });
      toast(action === 'accept' ? `Joined ${inv.organization.name}` : 'Invitation declined');
      await me.mutate();
      mutate();
      if (action === 'accept') setOrgId(r.organization.id);
    } catch (err) {
      toastError(err);
    }
  }
  return (
    <>
      <PageHeader title="Invitations" description="Organizations that have invited you." breadcrumbs={[{ label: 'Invitations' }]} />
      <Card padded={false}>
        {error ? <ErrorState error={error} /> : !data ? <div className="p-4"><LoadingBlock /></div> : data.items.length ? (
          <ul className="divide-y divide-line">
            {data.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div><p className="font-medium">{i.organization?.name}</p><p className="text-sm text-subtle">Invited by {i.invitedBy?.name} as <Badge color="blue">{i.role}</Badge> · expires {fmtDate(i.expiresAt)}</p></div>
                <div className="flex gap-2"><Button size="sm" onClick={() => respond(i, 'accept')}>Accept</Button><Button size="sm" variant="secondary" onClick={() => respond(i, 'reject')}>Decline</Button></div>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={Mail} title="No pending invitations" />}
      </Card>
    </>
  );
}
