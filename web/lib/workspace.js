'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from './api';

const Ctx = createContext(null);
const ROLE_RANK = { viewer: 0, developer: 1, admin: 2, owner: 3 };

const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      if (v === null || v === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};

export function WorkspaceProvider({ children }) {
  const me = useSWR('/auth/me', fetcher, { shouldRetryOnError: false, revalidateOnFocus: true });
  const orgs = me.data?.organizations || [];
  const [orgId, setOrgIdState] = useState(null);
  const [projectId, setProjectIdState] = useState(null);
  const [envId, setEnvIdState] = useState(null);
  const [dateRange, setDateRangeState] = useState({ range: '30d' });

  useEffect(() => {
    try {
      const saved = JSON.parse(store.get('ft_range') || 'null');
      if (saved) setDateRangeState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Resolve organization.
  useEffect(() => {
    if (!orgs.length) return;
    const saved = store.get('ft_org');
    const next = orgs.find((o) => o.id === orgId) ? orgId : orgs.find((o) => o.id === saved)?.id || orgs[0].id;
    if (next !== orgId) setOrgIdState(next);
  }, [orgs, orgId]);

  const projects = useSWR(orgId ? `/orgs/${orgId}/projects` : null, fetcher);
  const projectList = projects.data?.items || [];

  useEffect(() => {
    if (!projects.data) return;
    if (!projectList.length) {
      if (projectId) setProjectIdState(null);
      return;
    }
    const saved = store.get(`ft_project:${orgId}`);
    const exists = (id) => projectList.find((p) => p.id === id);
    const next = exists(projectId) ? projectId : exists(saved) ? saved : projectList[0].id;
    if (next !== projectId) setProjectIdState(next);
  }, [projects.data, projectList, projectId, orgId]);

  const project = projectList.find((p) => p.id === projectId) || null;
  const environments = project?.environments || [];

  useEffect(() => {
    if (!project) return;
    const saved = store.get(`ft_env:${project.id}`);
    const exists = (id) => environments.find((e) => e.id === id);
    const next = exists(envId) ? envId : exists(saved) ? saved : environments[0]?.id || null;
    if (next !== envId) setEnvIdState(next);
  }, [project, environments, envId]);

  const setOrgId = useCallback((id) => {
    store.set('ft_org', id);
    setOrgIdState(id);
    setProjectIdState(null);
    setEnvIdState(null);
  }, []);
  const setProjectId = useCallback(
    (id) => {
      store.set(`ft_project:${orgId}`, id);
      setProjectIdState(id);
      setEnvIdState(null);
    },
    [orgId],
  );
  const setEnvId = useCallback(
    (id) => {
      if (projectId) store.set(`ft_env:${projectId}`, id);
      setEnvIdState(id);
    },
    [projectId],
  );
  const setDateRange = useCallback((r) => {
    store.set('ft_range', JSON.stringify(r));
    setDateRangeState(r);
  }, []);

  const org = orgs.find((o) => o.id === orgId) || null;
  const env = environments.find((e) => e.id === envId) || null;
  const projectRole = project?.role || org?.role || 'viewer';

  const value = useMemo(
    () => ({
      me,
      user: me.data?.user,
      orgs,
      org,
      orgId,
      setOrgId,
      projects,
      projectList,
      project,
      projectId,
      setProjectId,
      environments,
      env,
      envId,
      setEnvId,
      dateRange,
      setDateRange,
      orgRole: org?.role,
      projectRole,
      can: (min) => ROLE_RANK[projectRole] >= ROLE_RANK[min],
      canOrg: (min) => ROLE_RANK[org?.role] >= ROLE_RANK[min],
      scope: env ? { envId: env.id, ...dateRange } : null,
      ready: !!(project && env),
    }),
    [me, orgs, org, orgId, setOrgId, projects, projectList, project, projectId, setProjectId, environments, env, envId, setEnvId, dateRange, setDateRange, projectRole],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWorkspace = () => useContext(Ctx);

// SWR helper scoped to the current project: useProjectApi('/analytics/overview', { ...query })
export function useProjectApi(path, query, opts) {
  const { projectId } = useWorkspace();
  const key = projectId && path && query !== null ? [`/projects/${projectId}${path}`, query || {}] : null;
  return useSWR(key, fetcher, { keepPreviousData: true, ...opts });
}
