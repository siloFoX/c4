import { useCallback, useEffect, useState } from 'react';
import WorkerDetail from './components/WorkerDetail';
import ChatView from './components/ChatView';
import ControlPanel from './components/ControlPanel';
import HistoryView from './components/HistoryView';
import SessionsView from './components/SessionsView';
import Chat from './components/Chat';
import Login from './components/Login';
import WorkflowEditor from './components/WorkflowEditor';
import SettingsView from './components/SettingsView';
import AppHeader from './components/layout/AppHeader';
import Sidebar, { type SidebarMode } from './components/layout/Sidebar';
import DetailTabs, { type DetailMode } from './components/layout/DetailTabs';
import EmptyState from './components/layout/EmptyState';
import FeatureView from './components/layout/FeatureView';
import HelpUIRoot from './components/HelpUIRoot';
import { type TopView } from './components/layout/TopTabs';
import { AUTH_EVENT, fetchAuthStatus, getToken, logout } from './lib/api';
import {
  applyTheme,
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
  writeTheme,
  writeTopView,
  type ThemeMode,
} from './lib/preferences';

type AuthState = 'loading' | 'anon' | 'authed' | 'disabled';

export default function App() {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
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
  const [theme, setTheme] = useState<ThemeMode>(readTheme);

  useEffect(() => { writeSidebarMode(sidebarMode); }, [sidebarMode]);
  useEffect(() => { writeSidebarCollapsed(sidebarCollapsed); }, [sidebarCollapsed]);
  useEffect(() => { writeDetailMode(detailMode); }, [detailMode]);
  useEffect(() => { writeTopView(topView); }, [topView]);
  useEffect(() => { writeTheme(theme); applyTheme(theme); }, [theme]);

  // (TODO 8.40) Ctrl+B / Cmd+B sidebar toggle (VS Code convention).
  // Skip the binding when the focus is on a text-entry surface so we
  // don't hijack typing. The handler also no-ops in mobile widths —
  // hamburger flow already covers that path.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable
        ) return;
      }
      e.preventDefault();
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      if (isDesktop) {
        setSidebarCollapsed((v) => !v);
      } else {
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Track OS theme changes when user picked 'system'.
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

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

  const refreshAuth = useCallback(async () => {
    const status = await fetchAuthStatus();
    if (!status.enabled) {
      setAuthState('disabled');
      return;
    }
    setAuthState(getToken() ? 'authed' : 'anon');
  }, []);

  useEffect(() => {
    refreshAuth();
    const onExpired = () => setAuthState('anon');
    window.addEventListener(AUTH_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EVENT, onExpired);
  }, [refreshAuth]);

  if (authState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (authState === 'anon') {
    return <Login onSuccess={() => setAuthState('authed')} />;
  }

  const handleLogout = async () => {
    await logout();
    setAuthState('anon');
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
        authed={authState === 'authed'}
        onLogout={handleLogout}
      />
      {topView === 'history' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <HistoryView />
        </div>
      ) : topView === 'sessions' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SessionsView />
        </div>
      ) : topView === 'chat' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden p-3 md:p-6">
          <Chat />
        </div>
      ) : topView === 'workflows' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkflowEditor />
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
    </div>
  );
}
