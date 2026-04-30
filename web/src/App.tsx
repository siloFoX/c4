import { useCallback, useEffect, useState } from 'react';
import {
  Activity, History, BookOpen, Briefcase, Menu, X,
  DollarSign, Users, Kanban, Clock, Shield, Network, LogOut, Workflow,
} from 'lucide-react';
import WorkerList from './components/WorkerList';
import WorkerDetail from './components/WorkerDetail';
import WorkerHistory from './components/WorkerHistory';
import ScribeContext from './components/ScribeContext';
import ProjectsView from './components/ProjectsView';
import CostReportView from './components/CostReportView';
import DepartmentsView from './components/DepartmentsView';
import BoardView from './components/BoardView';
import SchedulerView from './components/SchedulerView';
import AuditView from './components/AuditView';
import FleetView from './components/FleetView';
import WorkflowView from './components/WorkflowView';
import NLCommandBar from './components/NLCommandBar';
import LoginForm from './components/LoginForm';
import { cn } from './lib/cn';
import { authEnabled, clearSession, getRole, getToken, getUser, onUnauthorized } from './lib/auth';

type View =
  | 'workers' | 'projects' | 'fleet' | 'history'
  | 'cost' | 'departments' | 'board' | 'scheduler' | 'audit' | 'workflow' | 'context';

const NAV_PRIMARY: { v: View; label: string; Icon: typeof Activity }[] = [
  { v: 'workers',  label: 'Workers',  Icon: Activity },
  { v: 'projects', label: 'Projects', Icon: Briefcase },
  { v: 'fleet',    label: 'Fleet',    Icon: Network },
  { v: 'history',  label: 'History',  Icon: History },
];

const NAV_SECONDARY: { v: View; label: string; Icon: typeof Activity }[] = [
  { v: 'board',       label: 'Board',     Icon: Kanban },
  { v: 'scheduler',   label: 'Scheduler', Icon: Clock },
  { v: 'workflow',    label: 'Workflow',  Icon: Workflow },
  { v: 'cost',        label: 'Cost',      Icon: DollarSign },
  { v: 'departments', label: 'Depts',     Icon: Users },
  { v: 'audit',       label: 'Audit',     Icon: Shield },
  { v: 'context',     label: 'Context',   Icon: BookOpen },
];

export default function App() {
  const [view, setView] = useState<View>('workers');
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 10.1: probe auth on boot. Show login form if daemon requires auth and
  // we have no token (or token rejected with 401 mid-session).
  const [authState, setAuthState] = useState<'unknown' | 'login' | 'authed' | 'open'>('unknown');

  const recheckAuth = useCallback(async () => {
    const needs = await authEnabled();
    if (!needs) { setAuthState('open'); return; }
    setAuthState(getToken() ? 'authed' : 'login');
  }, []);

  useEffect(() => { recheckAuth(); }, [recheckAuth]);

  useEffect(() => {
    return onUnauthorized(() => setAuthState('login'));
  }, []);

  useEffect(() => { if (selectedWorker) setSidebarOpen(false); }, [selectedWorker]);

  if (authState === 'unknown') {
    return <div className="flex h-[100dvh] items-center justify-center bg-background text-sm text-muted">…</div>;
  }
  if (authState === 'login') {
    return <LoginForm onSuccess={() => setAuthState('authed')} />;
  }
  const role = getRole();
  const user = getUser();

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <header className="flex flex-col gap-2 border-b border-border bg-surface px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {view === 'workers' && (
              <button
                type="button"
                onClick={() => setSidebarOpen((o) => !o)}
                className="rounded-md border border-border p-1.5 text-muted hover:text-foreground sm:hidden"
                aria-label="Toggle workers panel"
              >
                {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
              </button>
            )}
            <img src="/logo.svg" alt="C4" className="h-6 shrink-0 sm:h-8" />
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-lg">C4 Dashboard</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-lg bg-surface-2 p-1 text-xs">
            {NAV_PRIMARY.map(({ v, label, Icon }) => (
              <NavBtn key={v} active={view === v} onClick={() => setView(v)} Icon={Icon} label={label} />
            ))}
          </div>
          {authState === 'authed' && (
            <div className="ml-1 flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px]">
              <span className="font-mono">{user || '?'}</span>
              <span className="rounded bg-surface-3 px-1 py-0.5 text-[10px] uppercase tracking-wider text-muted">{role || '?'}</span>
              <button
                type="button"
                title="Sign out"
                onClick={() => { clearSession(); setAuthState('login'); }}
                className="ml-1 text-muted hover:text-foreground"
              >
                <LogOut size={11} />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex shrink-0 flex-wrap gap-1 rounded-lg bg-surface-2 p-1 text-xs">
            {NAV_SECONDARY.map(({ v, label, Icon }) => (
              <NavBtn key={v} active={view === v} onClick={() => setView(v)} Icon={Icon} label={label} />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <NLCommandBar />
          </div>
        </div>
      </header>

      {view === 'workers' && (
        <div className="relative flex flex-1 overflow-hidden">
          <aside
            className={cn(
              'overflow-y-auto border-r border-border bg-surface p-4 transition-transform duration-200 ease-snappy',
              'absolute inset-y-0 left-0 z-20 w-72 shadow-soft',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full',
              'sm:relative sm:z-auto sm:translate-x-0 sm:shadow-none',
            )}
          >
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Workers</h2>
            <WorkerList selectedWorker={selectedWorker} onSelect={setSelectedWorker} />
          </aside>
          {sidebarOpen && (
            <div
              className="absolute inset-0 z-10 bg-black/40 sm:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <main className="flex-1 overflow-hidden p-3 sm:p-6">
            {selectedWorker ? (
              <WorkerDetail key={selectedWorker} workerName={selectedWorker} />
            ) : (
              <EmptyState onOpenList={() => setSidebarOpen(true)} />
            )}
          </main>
        </div>
      )}

      {view === 'projects'    && <Wrap><ProjectsView /></Wrap>}
      {view === 'fleet'       && <Wrap><FleetView /></Wrap>}
      {view === 'history'     && <Wrap><WorkerHistory /></Wrap>}
      {view === 'context'     && <Wrap><ScribeContext /></Wrap>}
      {view === 'cost'        && <Wrap><CostReportView /></Wrap>}
      {view === 'departments' && <Wrap><DepartmentsView /></Wrap>}
      {view === 'board'       && <Wrap><BoardView /></Wrap>}
      {view === 'scheduler'   && <Wrap><SchedulerView /></Wrap>}
      {view === 'audit'       && <Wrap><AuditView /></Wrap>}
      {view === 'workflow'    && <Wrap><WorkflowView /></Wrap>}
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 overflow-hidden p-3 sm:p-6">{children}</main>;
}

function NavBtn({
  active, onClick, Icon, label,
}: { active: boolean; onClick: () => void; Icon: typeof Activity; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1 transition-all duration-150 ease-snappy',
        active ? 'bg-surface-3 text-foreground shadow-soft' : 'text-muted hover:text-foreground hover:bg-surface-3/60',
      )}
    >
      <Icon size={13} className={cn('transition-colors', active && 'text-primary')} />
      <span className="hidden xs:inline">{label}</span>
    </button>
  );
}

function EmptyState({ onOpenList }: { onOpenList: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-2 p-6 text-center shadow-soft sm:p-8">
        <Activity className="mx-auto mb-3 text-primary" size={28} />
        <h2 className="text-lg font-semibold">No worker selected</h2>
        <p className="mt-2 text-sm text-muted">
          Pick a worker from the sidebar to view its session, history, and controls.
        </p>
        <button
          type="button"
          onClick={onOpenList}
          className="mt-4 rounded-md border border-border bg-surface-3 px-4 py-1.5 text-sm font-medium hover:bg-surface-2 sm:hidden"
        >
          Open workers
        </button>
      </div>
    </div>
  );
}
