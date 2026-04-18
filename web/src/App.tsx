import { useCallback, useEffect, useState } from 'react';
import WorkerDetail from './components/WorkerDetail';
import ChatView from './components/ChatView';
import ControlPanel from './components/ControlPanel';
import HistoryView from './components/HistoryView';
import Chat from './components/Chat';
import Login from './components/Login';
import WorkflowEditor from './components/WorkflowEditor';
import AppHeader from './components/layout/AppHeader';
import Sidebar, { type SidebarMode } from './components/layout/Sidebar';
import DetailTabs, { type DetailMode } from './components/layout/DetailTabs';
import EmptyState from './components/layout/EmptyState';
import { type TopView } from './components/layout/TopTabs';
import { AUTH_EVENT, fetchAuthStatus, getToken, logout } from './lib/api';

type AuthState = 'loading' | 'anon' | 'authed' | 'disabled';
const SIDEBAR_MODE_KEY = 'c4.sidebar.mode';
const DETAIL_MODE_KEY = 'c4.detail.mode';
const TOP_VIEW_KEY = 'c4.topView';

function readSidebarMode(): SidebarMode {
  if (typeof window === 'undefined') return 'list';
  try {
    const v = window.localStorage.getItem(SIDEBAR_MODE_KEY);
    return v === 'tree' ? 'tree' : 'list';
  } catch {
    return 'list';
  }
}

function readDetailMode(): DetailMode {
  if (typeof window === 'undefined') return 'terminal';
  try {
    const v = window.localStorage.getItem(DETAIL_MODE_KEY);
    if (v === 'chat') return 'chat';
    if (v === 'control') return 'control';
    return 'terminal';
  } catch {
    return 'terminal';
  }
}

function readTopView(): TopView {
  if (typeof window === 'undefined') return 'workers';
  try {
    const v = window.localStorage.getItem(TOP_VIEW_KEY);
    if (v === 'history') return 'history';
    if (v === 'chat') return 'chat';
    if (v === 'workflows') return 'workflows';
    return 'workers';
  } catch {
    return 'workers';
  }
}

export default function App() {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(readSidebarMode);
  const [detailMode, setDetailMode] = useState<DetailMode>(readDetailMode);
  const [topView, setTopView] = useState<TopView>(readTopView);

  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_MODE_KEY, sidebarMode); } catch { /* private mode */ }
  }, [sidebarMode]);
  useEffect(() => {
    try { window.localStorage.setItem(DETAIL_MODE_KEY, detailMode); } catch { /* private mode */ }
  }, [detailMode]);
  useEffect(() => {
    try { window.localStorage.setItem(TOP_VIEW_KEY, topView); } catch { /* private mode */ }
  }, [topView]);

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
      ) : topView === 'chat' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden p-3 md:p-6">
          <Chat />
        </div>
      ) : topView === 'workflows' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkflowEditor />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar
            open={sidebarOpen}
            mode={sidebarMode}
            onModeChange={setSidebarMode}
            selectedWorker={selectedWorker}
            onSelect={handleSelect}
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
