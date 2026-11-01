'use client';
import { WorkspaceProvider } from '@/lib/workspace';
import { AppShell } from '@/components/Shell';

export default function AppLayout({ children }) {
  return (
    <WorkspaceProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
