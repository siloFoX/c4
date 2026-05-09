import { useCallback, useEffect, useState } from 'react';
import { AUTH_EVENT, fetchAuthStatus, getToken } from './api';

// (v1.10.669) Extracted from App. Owns the four-state
// auth machine: loading → (disabled | authed | anon).
// Subscribes to the AUTH_EVENT custom event so an
// expired token (raised by the api layer's fetch
// wrapper) flips the UI back to "anon" without a page
// reload. The login modal calls `setAuthed()` once the
// /api/auth/login POST succeeds; the logout button
// calls the parent's `logout()` (still in the api lib)
// and then `setAnon()`.

export type AuthState = 'loading' | 'anon' | 'authed' | 'disabled';

interface AuthStateBundle {
  authState: AuthState;
  setAuthed: () => void;
  setAnon: () => void;
}

export function useAuthState(): AuthStateBundle {
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

  const setAuthed = useCallback(() => setAuthState('authed'), []);
  const setAnon = useCallback(() => setAuthState('anon'), []);

  return { authState, setAuthed, setAnon };
}
