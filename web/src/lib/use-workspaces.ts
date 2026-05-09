import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import { t } from './i18n';

// (v1.10.731) Extracted from pages/Workspaces. The
// /api/workspaces fetch + state machine. Read-only
// today (workspaces are config-driven on the daemon
// side); shape leaves room for the eventual mutation
// endpoint by exposing `refresh` as the canonical
// re-fetch handle.

export interface Workspace {
  name: string;
  path: string;
  exists: boolean;
  isGitRepo: boolean;
}

interface WorkspacesResponse {
  workspaces: Workspace[];
}

export interface UseWorkspacesState {
  data: Workspace[] | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useWorkspaces(): UseWorkspacesState {
  const [data, setData] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<WorkspacesResponse>('/api/workspaces');
      setData(res.workspaces || []);
    } catch (e) {
      setError((e as Error).message || t('common.failedToLoadWorkspaces'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, error, loading, refresh };
}
