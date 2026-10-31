'use client';
import { useProjectApi, useWorkspace } from './workspace';

export function useEventNames() {
  const { envId, dateRange } = useWorkspace();
  const { data } = useProjectApi('/event-definitions', envId ? { envId, range: '365d' } : null);
  return (data?.items || []).filter((d) => d.status !== 'deprecated').map((d) => d.name).sort((a, b) => (a.startsWith('$') - b.startsWith('$')) || a.localeCompare(b));
}
