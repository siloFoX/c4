import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import { t } from './i18n';

// (v1.10.729) Extracted from pages/Rbac. The
// roles + users dual-fetch via Promise.all from
// /api/rbac/roles + /api/rbac/users, with a single
// loading flag and a unified error path. The
// page is read-only today; this hook is shaped so
// the eventual mutation endpoints (assign / grant /
// revoke) can hang off the same refresh handle
// without rewriting the fetch.

export interface Role {
  name: 'admin' | 'manager' | 'viewer';
  actions: string[];
}
interface RolesResponse { roles: Role[] }

export interface User {
  user: string;
  role: string;
  grants: Record<string, unknown>;
}
interface UsersResponse { users: User[] }

export interface UseRbacState {
  roles: Role[] | null;
  users: User[] | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useRbac(): UseRbacState {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, u] = await Promise.all([
        apiGet<RolesResponse>('/api/rbac/roles'),
        apiGet<UsersResponse>('/api/rbac/users'),
      ]);
      setRoles(r.roles || []);
      setUsers(u.users || []);
    } catch (e) {
      setError((e as Error).message || t('common.failedToLoadRbac'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { roles, users, error, loading, refresh };
}
