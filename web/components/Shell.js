'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  LayoutDashboard, Radio, ListTree, BarChart3, Filter, Flag, Users, KeyRound, BookOpen, Terminal, Webhook, UsersRound, ScrollText, Settings, FolderKanban,
  ChevronDown, Sun, Moon, Monitor, Bell, LogOut, Building2, Plus, Menu as MenuIcon, X, Calendar, Check,
} from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { useTheme } from '@/lib/theme';
import { api, fetcher } from '@/lib/api';
import { Menu, MenuItem, Button, Spinner, EmptyState, cx, Input } from './ui';
import { timeAgo } from '@/lib/format';

const NAV = [
  { section: 'Analytics', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/live', label: 'Live events', icon: Radio },
    { href: '/events', label: 'Events', icon: ListTree },
    { href: '/analytics', label: 'Insights', icon: BarChart3 },
    { href: '/funnels', label: 'Funnels', icon: Filter },
    { href: '/features', label: 'Features', icon: Flag },
    { href: '/users', label: 'Users', icon: Users },
  ] },
  { section: 'Developers', items: [
    { href: '/api-keys', label: 'API keys', icon: KeyRound, min: 'developer' },
    { href: '/docs', label: 'SDK & docs', icon: BookOpen },
    { href: '/explorer', label: 'API explorer', icon: Terminal },
    { href: '/webhooks', label: 'Webhooks', icon: Webhook, min: 'developer' },
  ] },
  { section: 'Organization', items: [
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/team', label: 'Team', icon: UsersRound },
    { href: '/audit', label: 'Audit log', icon: ScrollText, orgMin: 'admin' },
    { href: '/settings', label: 'Settings', icon: Settings },
  ] },
];

function Sidebar({ onNavigate }) {
  const pathname = usePathname();
  const { can, canOrg, org, orgs, setOrgId } = useWorkspace();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-line px-4">
        <img src="/logo.svg" alt="" className="h-7 w-7" />
        <span className="font-semibold tracking-tight">FeatureTrack</span>
      </div>
      <div className="border-b border-line p-3">
        <Menu
          align="left"
          className="w-[232px]"
          trigger={({ toggle }) => (
            <button onClick={toggle} className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left text-sm hover:border-brand-500/40" aria-label="Switch organization">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/15 text-xs font-semibold text-brand-600 dark:text-brand-300">{org?.name?.[0]?.toUpperCase() || '·'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{org?.name || 'Organization'}</span>
                <span className="block text-[11px] capitalize text-subtle">{org?.role}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-subtle" />
            </button>
          )}
        >
          <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-subtle">Organizations</p>
          {orgs.map((o) => <MenuItem key={o.id} icon={Building2} active={o.id === org?.id} onClick={() => setOrgId(o.id)}>{o.name}</MenuItem>)}
          <div className="my-1 border-t border-line" />
          <MenuItem icon={Plus} href="/onboarding">New organization</MenuItem>
        </Menu>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto p-3" aria-label="Main">
        {NAV.map((g) => (
          <div key={g.section}>
            <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{g.section}</p>
            <ul className="space-y-0.5">
              {g.items.filter((i) => (!i.min || can(i.min)) && (!i.orgMin || canOrg(i.orgMin))).map((i) => {
                const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
                return (
                  <li key={i.href}>
                    <Link href={i.href} onClick={onNavigate} className={cx('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors', active ? 'bg-brand-500/10 font-medium text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-surface hover:text-ink')}>
                      <i.icon className="h-4 w-4" />
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

const RANGES = [
  { id: '24h', label: 'Last 24 hours' },
  { id: '7d', label: 'Last 7 days' },
  { id: '14d', label: 'Last 14 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: '180d', label: 'Last 6 months' },
  { id: '365d', label: 'Last 12 months' },
];

export function rangeLabel(r) {
  if (r.range) return RANGES.find((x) => x.id === r.range)?.label || r.range;
  return `${r.from} → ${r.to}`;
}

export function DateRangePicker() {
  const { dateRange, setDateRange } = useWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const [custom, setCustom] = useState({ from: dateRange.from || new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10), to: dateRange.to || today });
  return (
    <Menu
      trigger={({ toggle }) => (
        <Button variant="secondary" size="sm" onClick={toggle} icon={Calendar}>
          <span className="hidden sm:inline">{rangeLabel(dateRange)}</span>
          <ChevronDown className="h-3.5 w-3.5 text-subtle" />
        </Button>
      )}
      className="w-64"
    >
      {RANGES.map((r) => <MenuItem key={r.id} active={dateRange.range === r.id} onClick={() => setDateRange({ range: r.id })}>{r.label}</MenuItem>)}
      <div className="my-1 border-t border-line" />
      <div className="space-y-2 p-2" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Custom range</p>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="px-2 py-1 text-xs" />
          <Input type="date" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="px-2 py-1 text-xs" />
        </div>
        <Button size="xs" className="w-full" data-menu-close disabled={!custom.from || !custom.to || custom.from > custom.to} onClick={() => setDateRange({ from: custom.from, to: custom.to })}>Apply</Button>
      </div>
    </Menu>
  );
}

function ProjectSwitcher() {
  const { projectList, project, setProjectId, canOrg } = useWorkspace();
  return (
    <Menu
      align="left"
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex max-w-[110px] items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-sm font-medium hover:bg-surface sm:max-w-[220px] sm:px-2" aria-label="Switch project">
          <FolderKanban className="hidden h-4 w-4 shrink-0 text-subtle sm:block" />
          <span className="truncate">{project?.name || 'Select project'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
        </button>
      )}
    >
      <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-subtle">Projects</p>
      {projectList.map((p) => <MenuItem key={p.id} active={p.id === project?.id} onClick={() => setProjectId(p.id)}>{p.name}</MenuItem>)}
      {!projectList.length && <p className="px-2.5 py-2 text-sm text-subtle">No projects yet</p>}
      <div className="my-1 border-t border-line" />
      <MenuItem icon={FolderKanban} href="/projects">{canOrg('admin') ? 'Manage projects' : 'All projects'}</MenuItem>
    </Menu>
  );
}

function EnvSelector() {
  const { environments, env, setEnvId } = useWorkspace();
  if (!environments.length) return null;
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="radiogroup" aria-label="Environment">
      {environments.map((e) => (
        <button key={e.id} role="radio" aria-checked={env?.id === e.id} onClick={() => setEnvId(e.id)} className={cx('flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors sm:gap-1.5 sm:px-2', env?.id === e.id ? 'bg-panel text-ink shadow-sm' : 'text-subtle hover:text-ink')}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
          <span className="hidden md:inline">{e.name}</span>
          <span className="md:hidden">{{ development: 'Dev', staging: 'Stg', production: 'Prod' }[e.type]}</span>
        </button>
      ))}
    </div>
  );
}

function Notifications() {
  const { me } = useWorkspace();
  const [open, setOpen] = useState(false);
  const list = useSWR(open ? '/auth/notifications' : null, fetcher);
  const unread = me.data?.unreadNotifications || 0;
  return (
    <Menu
      className="w-80"
      trigger={({ toggle }) => (
        <button onClick={() => { setOpen(true); toggle(); }} className="relative rounded-lg p-2 text-subtle hover:bg-surface hover:text-ink" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e34948] px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <p className="text-sm font-semibold">Notifications</p>
        {unread > 0 && <button className="text-xs text-brand-500 hover:underline" onClick={async () => { await api('/auth/notifications/read-all', { method: 'POST' }); me.mutate(); list.mutate(); }}>Mark all read</button>}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {list.isLoading ? <div className="flex justify-center p-4"><Spinner /></div> : !list.data?.items?.length ? <p className="px-2.5 py-6 text-center text-sm text-subtle">You're all caught up</p> : list.data.items.map((n) => (
          <Link key={n.id} href={n.link || '#'} data-menu-close className={cx('block rounded-md px-2.5 py-2 hover:bg-surface', !n.readAt && 'bg-brand-500/5')}>
            <p className="text-sm font-medium">{n.title}</p>
            <p className="text-xs text-subtle">{n.body}</p>
            <p className="mt-0.5 text-[11px] text-subtle">{timeAgo(n.createdAt)}</p>
          </Link>
        ))}
      </div>
    </Menu>
  );
}

function UserMenu() {
  const { user } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  return (
    <Menu
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white" aria-label="Account menu">
          {user?.name?.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
        </button>
      )}
    >
      <div className="px-2.5 py-2">
        <p className="truncate text-sm font-medium">{user?.name}</p>
        <p className="truncate text-xs text-subtle">{user?.email}</p>
      </div>
      <div className="my-1 border-t border-line" />
      <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-subtle">Theme</p>
      <div className="flex gap-1 px-2 pb-1">
        {[['light', Sun], ['dark', Moon], ['system', Monitor]].map(([t, Icon]) => (
          <button key={t} onClick={() => { setTheme(t); api('/auth/me', { method: 'PATCH', body: { preferences: { theme: t } } }).catch(() => {}); }} className={cx('flex flex-1 items-center justify-center gap-1 rounded-md border py-1 text-xs capitalize', theme === t ? 'border-brand-500 text-ink' : 'border-line text-subtle hover:text-ink')}>
            <Icon className="h-3.5 w-3.5" />{t}
          </button>
        ))}
      </div>
      <div className="my-1 border-t border-line" />
      <MenuItem icon={Settings} href="/settings">Account settings</MenuItem>
      <MenuItem icon={LogOut} onClick={async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); router.replace('/login'); }}>Sign out</MenuItem>
    </Menu>
  );
}

const NO_PROJECT_OK = ['/projects', '/team', '/audit', '/settings', '/docs', '/invitations'];

export function AppShell({ children }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    if (ws.me.error?.status === 401) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (ws.me.data && !ws.orgs.length) router.replace('/onboarding');
  }, [ws.me.error, ws.me.data, ws.orgs.length, router, pathname]);

  if (ws.me.isLoading || (!ws.me.data && !ws.me.error) || (ws.me.data && !ws.orgs.length)) {
    return <div className="flex h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  }
  if (ws.me.error) {
    return <div className="flex h-screen items-center justify-center"><EmptyState title="Unable to reach FeatureTrack" description={ws.me.error.status === 401 ? 'Redirecting to sign in…' : ws.me.error.message} action={<Button onClick={() => ws.me.mutate()}>Retry</Button>} /></div>;
  }

  const needsProject = !NO_PROJECT_OK.some((p) => pathname.startsWith(p));
  let content = children;
  if (needsProject && ws.projects.data && !ws.projectList.length) {
    content = <EmptyState icon={FolderKanban} title="No projects yet" description={ws.canOrg('admin') ? 'Create a project to start tracking events.' : 'Ask an admin to create a project or grant you access.'} action={ws.canOrg('admin') && <Button href="/projects?new=1" icon={Plus}>Create project</Button>} />;
  } else if (needsProject && !ws.ready) {
    content = <div className="flex justify-center py-24"><Spinner /></div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-panel lg:block"><Sidebar /></aside>
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
          <aside className="relative h-full w-64 border-r border-line bg-panel animate-slide-in">
            <button className="absolute right-2 top-3 rounded-md p-1.5 text-subtle" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X className="h-4 w-4" /></button>
            <Sidebar onNavigate={() => setMobileNav(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-panel/80 px-2 backdrop-blur sm:gap-2 sm:px-5">
          <button className="rounded-md p-1.5 text-subtle lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><MenuIcon className="h-5 w-5" /></button>
          <ProjectSwitcher />
          {ws.project?.archived && <span className="rounded bg-[#fab219]/20 px-1.5 py-0.5 text-[11px] font-medium text-[#8a5d00] dark:text-[#fab219]">Archived</span>}
          <div className="sm:ml-1"><EnvSelector /></div>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            <Notifications />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{content}</div>
        </main>
      </div>
    </div>
  );
}

export { Check };
