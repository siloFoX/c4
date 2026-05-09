import { lazy, Suspense, useEffect, useState } from 'react';
import Login from './components/Login';
import { LoadingSkeleton } from './pages/PageFrame';
// (v1.10.509) Top-level views are lazy-loaded so the main bundle
// only carries Login + AppHeader + Sidebar + the default
// WorkerDetail / ChatView / ControlPanel triple. The rest pull
// their own chunk on first navigation. Cuts main from ~992KB to
// ~600KB on initial paint.
const WorkerDetail = lazy(() => import('./components/WorkerDetail'));
const ChatView = lazy(() => import('./components/ChatView'));
const ControlPanel = lazy(() => import('./components/ControlPanel'));
const HistoryView = lazy(() => import('./components/HistoryView'));
const SessionsView = lazy(() => import('./components/SessionsView'));
const MeetingsView = lazy(() => import('./components/MeetingsView'));
const SpecialistsView = lazy(() => import('./components/SpecialistsView'));
const WikiView = lazy(() => import('./components/WikiView'));
const AutonomousView = lazy(() => import('./components/AutonomousView'));
const Chat = lazy(() => import('./components/Chat'));
const WorkflowEditor = lazy(() => import('./components/WorkflowEditor'));
const SettingsView = lazy(() => import('./components/SettingsView'));
import AppHeader from './components/layout/AppHeader';
import Sidebar, { type SidebarMode } from './components/layout/Sidebar';
import DetailTabs, { type DetailMode } from './components/layout/DetailTabs';
import EmptyState from './components/layout/EmptyState';
import FeatureView from './components/layout/FeatureView';
import HelpUIRoot from './components/HelpUIRoot';
import MetricsBar from './components/MetricsBar';
import { type TopView } from './components/layout/TopTabs';
import { logout } from './lib/api';
import { useAuthState } from './lib/use-auth-state';
import { useSidebarShortcut } from './lib/use-sidebar-shortcut';
import { useTheme } from './lib/use-theme';
import {
  DEFAULT_DETAIL_MODE,
  DEFAULT_SIDEBAR_COLLAPSED,
  DEFAULT_SIDEBAR_MODE,
  DEFAULT_THEME,
  readDetailMode,
  readSidebarCollapsed,
  readSidebarMode,
  readTheme,
  readTopView,
  writeDetailMode,
  writeSidebarCollapsed,
  writeSidebarMode,
  writeTopView,
} from './lib/preferences';

export default function App() {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  // (v1.10.669) Auth state machine + AUTH_EVENT listener moved to
  // lib/use-auth-state.
  const { authState, setAuthed, setAnon } = useAuthState();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(readSidebarMode);
  // (TODO 8.40) Desktop icon-rail mode. Persisted, separate from the
  // transient mobile sidebarOpen flag so a power user's collapsed
  // preference survives reloads.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readSidebarCollapsed);
  const [detailMode, setDetailMode] = useState<DetailMode>(readDetailMode);
  const [topView, setTopView] = useState<TopView>(readTopView);
  // (v1.10.671) Theme state + write+apply + OS-theme listener moved to
  // lib/use-theme.
  const { theme, setTheme } = useTheme();

  useEffect(() => { writeSidebarMode(sidebarMode); }, [sidebarMode]);
  useEffect(() => { writeSidebarCollapsed(sidebarCollapsed); }, [sidebarCollapsed]);
  useEffect(() => { writeDetailMode(detailMode); }, [detailMode]);
  useEffect(() => { writeTopView(topView); }, [topView]);

  // (v1.10.670) Ctrl+B / Cmd+B sidebar shortcut moved to hook.
  useSidebarShortcut({
    onToggleCollapsed: () => setSidebarCollapsed((v) => !v),
    onToggleOpen: () => setSidebarOpen((v) => !v),
  });

  // Re-sync state if another tab updates the same preferences.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = () => {
      setSidebarMode(readSidebarMode());
      setSidebarCollapsed(readSidebarCollapsed());
      setDetailMode(readDetailMode());
      setTopView(readTopView());
      setTheme(readTheme());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (authState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (authState === 'anon') {
    return <Login onSuccess={setAuthed} />;
  }

  const handleLogout = async () => {
    await logout();
    setAnon();
  };

  const handleSelect = (name: string | null) => {
    setSelectedWorker(name);
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <HelpUIRoot />
      <AppHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        topView={topView}
        onTopViewChange={setTopView}
        authed={authState === 'authed' || authState === 'disabled'}
        onLogout={handleLogout}
        onOpenPreferences={() => setTopView('settings')}
      />
      {/* MetricsBar polls /api/metrics every 5s and renders a thin strip
          of daemon RSS/heap/loadavg + worker CPU/RSS totals just below
          the header. Component returns null until the first response,
          so it doesn't introduce layout jumps when the daemon is
          unreachable or auth-gated. */}
      <MetricsBar />
      <Suspense fallback={
        <div className="flex min-h-0 flex-1 overflow-auto p-6">
          <LoadingSkeleton rows={6} />
        </div>
      }>
      {topView === 'history' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <HistoryView />
        </div>
      ) : topView === 'sessions' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SessionsView />
        </div>
      ) : topView === 'meetings' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <MeetingsView />
        </div>
      ) : topView === 'specialists' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SpecialistsView />
        </div>
      ) : topView === 'wiki' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WikiView />
        </div>
      ) : topView === 'chat' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden p-3 md:p-6">
          <Chat />
        </div>
      ) : topView === 'workflows' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkflowEditor />
        </div>
      ) : topView === 'autonomous' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AutonomousView />
        </div>
      ) : topView === 'features' ? (
        <FeatureView sidebarOpen={sidebarOpen} />
      ) : topView === 'settings' ? (
        <div className="flex min-h-0 flex-1 overflow-auto">
          <SettingsView
            theme={theme}
            onThemeChange={setTheme}
            sidebarMode={sidebarMode}
            onSidebarModeChange={setSidebarMode}
            detailMode={detailMode}
            onDetailModeChange={setDetailMode}
            onReset={() => {
              setTheme(DEFAULT_THEME);
              setSidebarMode(DEFAULT_SIDEBAR_MODE);
              setSidebarCollapsed(DEFAULT_SIDEBAR_COLLAPSED);
              setDetailMode(DEFAULT_DETAIL_MODE);
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar
            open={sidebarOpen}
            mode={sidebarMode}
            onModeChange={setSidebarMode}
            selectedWorker={selectedWorker}
            onSelect={handleSelect}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
            onLogout={handleLogout}
            onOpenPreferences={() => setTopView('settings')}
          />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 md:p-6">
            {selectedWorker ? (
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                <div className="mb-3 flex justify-end">
                  <DetailTabs value={detailMode} onChange={setDetailMode} />
                </div>
                <div className="min-h-0 min-w-0 flex-1">
                  {detailMode === 'chat' ? (
                    <ChatView key={`chat-${selectedWorker}`} workerName={selectedWorker} />
                  ) : detailMode === 'control' ? (
                    <ControlPanel key={`control-${selectedWorker}`} workerName={selectedWorker} />
                  ) : (
                    <WorkerDetail key={`term-${selectedWorker}`} workerName={selectedWorker} />
                  )}
                </div>
              </div>
            ) : (
              <EmptyState />
            )}
          </main>
        </div>
      )}
      </Suspense>
    </div>
  );
}
