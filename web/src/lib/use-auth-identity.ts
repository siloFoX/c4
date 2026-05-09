import { useEffect, useState } from 'react';
import { AUTH_EVENT, getAuthRole, getAuthUser } from './api';

// (v1.10.688) Extracted from AccountMenu. Mirrors the
// cached `user` + `role` from the api lib's
// localStorage and re-reads on:
//   - AUTH_EVENT (raised after login / logout / 401
//     token-clear)
//   - cross-tab `storage` events, but filtered to the
//     three auth keys so unrelated writes (theme,
//     sidebar.collapsed, top-view) don't pointlessly
//     re-render the avatar.

const AUTH_STORAGE_KEYS = new Set([
  'c4.authToken',
  'c4.authUser',
  'c4.authRole',
]);

interface AuthIdentityState {
  user: string | null;
  role: string | null;
}

export function useAuthIdentity(): AuthIdentityState {
  // Lazy initializers — touch localStorage only on first render.
  const [user, setUser] = useState<string | null>(() => getAuthUser());
  const [role, setRole] = useState<string | null>(() => getAuthRole());

  useEffect(() => {
    const refresh = () => {
      setUser(getAuthUser());
      setRole(getAuthRole());
    };
    const onStorage = (e: StorageEvent) => {
      // e.key === null when localStorage is cleared wholesale; treat
      // that as a relevant signal.
      if (e.key && !AUTH_STORAGE_KEYS.has(e.key)) return;
      refresh();
    };
    window.addEventListener(AUTH_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AUTH_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return { user, role };
}
