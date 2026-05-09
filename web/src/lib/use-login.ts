import { useState, type FormEvent } from 'react';
import { login } from './api';
import { t } from './i18n';

// (v1.10.719) Extracted from Login. The login form's
// state machine — username + password slots, busy /
// error feedback, and the submit handler that POSTs
// /api/login, calls the parent's onSuccess on a
// good token, surfaces the server-side error
// otherwise, and re-enables the submit button via
// try/finally.

export interface LoginFormState {
  user: string;
  setUser: (next: string) => void;
  password: string;
  setPassword: (next: string) => void;
  error: string | null;
  busy: boolean;
  handleSubmit: (e: FormEvent) => Promise<void>;
}

export function useLogin(args: { onSuccess: () => void }): LoginFormState {
  const { onSuccess } = args;
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
        setError(res.error || t('common.loginFailed'));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return { user, setUser, password, setPassword, error, busy, handleSubmit };
}
