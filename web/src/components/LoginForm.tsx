// 10.1 login form. Shown by App.tsx when /api/list returns 401.

import { useState } from 'react';
import { LogIn, KeyRound, User } from 'lucide-react';
import { login } from '../lib/auth';

export default function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await login(username, password);
      if (r.error) setError(r.error);
      else onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[100dvh] items-center justify-center bg-background p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-soft"
      >
        <div className="mb-4 flex items-center gap-2">
          <img src="/logo.svg" alt="C4" className="h-8" />
          <h1 className="text-lg font-semibold">C4 Dashboard</h1>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
            <User size={12} /> username
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            className="w-full rounded border border-border bg-surface-2 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
            <KeyRound size={12} /> password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded border border-border bg-surface-2 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </label>

        {error && (
          <div className="mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <LogIn size={14} />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="mt-4 text-center text-[11px] text-muted">
          c4 daemon controls authentication via{' '}
          <code className="rounded bg-surface-2 px-1 py-0.5">config.auth.users</code>.
        </p>
      </form>
    </div>
  );
}
