import { lazy, Suspense, useCallback, useState } from 'react';
import Login from './components/Login';
import { LoadingSkeleton } from './pages/PageFrame';
import { useToggle } from './lib/use-toggle';
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
import PageTransition from './components/PageTransition';
import AppHeader from './components/layout/AppHeader';
import Sidebar from './components/layout/Sidebar';
import DetailTabs from './components/layout/DetailTabs';
import EmptyState from './components/layout/EmptyState';
import FeatureView from './components/layout/FeatureView';
import HelpUIRoot from './components/HelpUIRoot';
import MetricsBar from './components/MetricsBar';
import AutonomousStatusBanner from './components/AutonomousStatusBanner';
import { logout } from './lib/api';
import { useAuthState } from './lib/use-auth-state';
import { useSidebarShortcut } from './lib/use-sidebar-shortcut';
import { useTheme } from './lib/use-theme';
import { useUiPreferences } from './lib/use-ui-preferences';
import {
  DEFAULT_DETAIL_MODE,
  DEFAULT_SIDEBAR_COLLAPSED,
  DEFAULT_SIDEBAR_MODE,
  DEFAULT_THEME,
  readTheme,
} from './lib/preferences';

export default function App() {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  // (v1.10.669) Auth state machine + AUTH_EVENT listener moved to
  // lib/use-auth-state.
  const { authState, setAuthed, setAnon } = useAuthState();
  const [sidebarOpen, toggleSidebarOpen, setSidebarOpen] = useToggle(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  // (v1.10.671) Theme state + write+apply + OS-theme listener moved to
  // lib/use-theme.
  const { theme, setTheme } = useTheme();
  // (v1.10.732) Sidebar/detail/topView preferences + persistence + cross-
  // tab storage sync moved to lib/use-ui-preferences. Theme participates
  // in the storage sync via the onCrossTabSync callback.
  const onCrossTabSync = useCallback(() => {
    setTheme(readTheme());
  }, [setTheme]);
  const {
    sidebarMode, setSidebarMode,
    sidebarCollapsed, setSidebarCollapsed, toggleSidebarCollapsed,
    detailMode, setDetailMode,
    topView, setTopView,
  } = useUiPreferences({ onCrossTabSync });

  // (v1.10.670) Ctrl+B / Cmd+B sidebar shortcut moved to hook.
  useSidebarShortcut({
    onToggleCollapsed: toggleSidebarCollapsed,
    onToggleOpen: toggleSidebarOpen,
  });

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
      <HelpUIRoot onNavigateTopView={setTopView} />
      {/* (v1.11.134) Subtle gradient backdrop behind the header.
          Stops sourced from the ARPS design system tokens.css:
          --surface-canvas (220 18% 8%) -> --surface-panel (220 15% 12%).
          The values are inlined as HSL because the daemon web bundle
          does not import tokens.css yet -- using `hsl(var(--...))`
          here would resolve to nothing. When tokens.css lands the
          arbitrary values can be swapped for the CSS variables. */}
      <div
        className="bg-gradient-to-b from-[hsl(220_18%_8%)] to-[hsl(220_15%_12%)]"
        data-testid="app-top-bar-gradient"
      >
        <AppHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          topView={topView}
          onTopViewChange={setTopView}
          authed={authState === 'authed' || authState === 'disabled'}
          onLogout={handleLogout}
          onOpenPreferences={() => setTopView('settings')}
        />
      </div>
      {/* MetricsBar polls /api/metrics every 5s and renders a thin strip
          of daemon RSS/heap/loadavg + worker CPU/RSS totals just below
          the header. Component returns null until the first response,
          so it doesn't introduce layout jumps when the daemon is
          unreachable or auth-gated. */}
      <MetricsBar />
      <AutonomousStatusBanner />
      <Suspense fallback={
        <div className="flex min-h-0 flex-1 overflow-auto p-6">
          <LoadingSkeleton rows={6} />
        </div>
      }>
      {/* (v1.11.175 / patch 11.157) PageTransition wraps the top-view
          switcher so route changes get a unified slide+fade crossfade
          instead of each branch animating its own enter. The wrapper
          keys off `topView` so it only fires on top-level navigation;
          per-branch keys (key={topView}) inside continue to drive
          their existing motion-safe animate-in classes for nested
          state changes (e.g., detailMode within the worker view). */}
      <PageTransition routeKey={topView} className="flex min-h-0 flex-1">
      {topView === 'history' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <HistoryView />
        </div>
      ) : topView === 'sessions' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <SessionsView />
        </div>
      ) : topView === 'meetings' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <MeetingsView />
        </div>
      ) : topView === 'specialists' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <SpecialistsView />
        </div>
      ) : topView === 'wiki' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <WikiView />
        </div>
      ) : topView === 'chat' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden p-3 md:p-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <Chat />
        </div>
      ) : topView === 'workflows' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <WorkflowEditor />
        </div>
      ) : topView === 'autonomous' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <AutonomousView />
        </div>
      ) : topView === 'features' ? (
        <div key={topView} className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <FeatureView sidebarOpen={sidebarOpen} />
        </div>
      ) : topView === 'settings' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-auto motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
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
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <Sidebar
            open={sidebarOpen}
            mode={sidebarMode}
            onModeChange={setSidebarMode}
            selectedWorker={selectedWorker}
            onSelect={handleSelect}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebarCollapsed}
            onLogout={handleLogout}
            onOpenPreferences={() => setTopView('settings')}
            theme={theme}
            onThemeChange={setTheme}
          />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 md:p-6">
            {selectedWorker ? (
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                <div className="mb-3 flex justify-end">
                  <DetailTabs value={detailMode} onChange={setDetailMode} />
                </div>
                <div key={detailMode} className="min-h-0 min-w-0 flex-1 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
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
      </PageTransition>
      </Suspense>
    </div>
  );
}
