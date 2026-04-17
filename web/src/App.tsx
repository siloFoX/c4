import { useCallback, useEffect, useState } from 'react';
import WorkerList from './components/WorkerList';
import WorkerDetail from './components/WorkerDetail';
import Login from './components/Login';
import { AUTH_EVENT, fetchAuthStatus, getToken, logout } from './lib/api';

type AuthState = 'loading' | 'anon' | 'authed' | 'disabled';

export default function App() {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');

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

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-800 bg-gray-800 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-100">C4 Dashboard</h1>
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
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-900 p-4">
          <img src="/logo.svg" alt="C4" className="mb-4 h-10" />
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
            Workers
          </h2>
          <WorkerList selectedWorker={selectedWorker} onSelect={setSelectedWorker} />
        </aside>
        <main className="flex-1 overflow-hidden p-6">
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
