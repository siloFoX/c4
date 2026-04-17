import { useState, type FormEvent } from 'react';
import { login } from '../lib/api';

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await login(user, password);
      if (res.token) {
        onSuccess();
      } else {
        setError(res.error || 'Login failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-gray-800 p-6 shadow"
      >
        <div>
          <h1 className="text-lg font-semibold text-gray-100">C4 Sign in</h1>
          <p className="mt-1 text-xs text-gray-400">Session required to access the dashboard.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300" htmlFor="c4-user">
            User
          </label>
          <input
            id="c4-user"
            type="text"
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-300" htmlFor="c4-password">
            Password
          </label>
          <input
            id="c4-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            required
          />
        </div>

        {error && (
          <div className="rounded bg-red-900/40 p-2 text-xs text-red-300">{error}</div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
