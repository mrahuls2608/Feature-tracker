'use client';
import { Modal, Button, CopyButton, Callout } from './ui';

export function SecretModal({ secret, onClose, title = 'Signing secret', description = 'Copy this secret now — it will not be shown again.' }) {
  return (
    <Modal open={!!secret} onClose={onClose} title={title} description={description} footer={<Button onClick={onClose}>Done</Button>}>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-3"><code className="min-w-0 flex-1 break-all font-mono text-sm">{secret}</code><CopyButton value={secret || ''} label="Copy" /></div>
      <Callout className="mt-4">Use it to verify the <code className="font-mono">X-FeatureTrack-Signature</code> header (see SDK & docs → Verifying webhooks).</Callout>
    </Modal>
  );
}
