import { useCallback, useEffect, useState } from 'react';
import WorkerList from './components/WorkerList';
import WorkerDetail from './components/WorkerDetail';
import Login from './components/Login';
import { AUTH_EVENT, fetchAuthStatus, getToken, logout } from './lib/api';

type AuthState = 'loading' | 'anon' | 'authed' | 'disabled';

export default function App() {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });

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
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-sm text-gray-400">
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
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-gray-800 bg-gray-800 px-4 py-3 md:px-6 md:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-700 text-gray-100 hover:bg-gray-600 md:hidden"
            aria-label={sidebarOpen ? 'Close worker list' : 'Open worker list'}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {sidebarOpen ? '\u2715' : '\u2630'}
            </span>
          </button>
          <h1 className="truncate text-lg font-semibold text-gray-100 md:text-xl">C4 Dashboard</h1>
        </div>
        {authState === 'authed' && (
          <button
            type="button"
            onClick={handleLogout}
            className="rounded bg-gray-700 px-3 py-1 text-xs text-gray-200 hover:bg-gray-600"
          >
            Sign out
          </button>
        )}
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen && (
          <aside className="w-full shrink-0 overflow-y-auto border-b border-gray-800 bg-gray-900 p-4 md:w-72 md:border-b-0 md:border-r">
            <img src="/logo.svg" alt="C4" className="mb-4 h-10" />
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
              Workers
            </h2>
            <WorkerList selectedWorker={selectedWorker} onSelect={handleSelect} />
          </aside>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 md:p-6">
          {selectedWorker ? (
            <WorkerDetail key={selectedWorker} workerName={selectedWorker} />
          ) : (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-gray-200">Worker detail</h2>
              <p className="text-gray-400">Select a worker from the sidebar to view details.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
