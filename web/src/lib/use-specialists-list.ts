import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import { t } from './i18n';
import type { ListResponse } from '../components/SpecialistsView';

// (v1.10.628) Extracted from SpecialistsView. Owns the
// /api/specialists list — initial GET + the underperformer
// flag set polled separately so per-row alert pills can light
// up before the operator clicks. Both run once on mount;
// `refresh` re-fetches the main list (the flagged set follows
// its own cadence — refreshing here would defeat the
// best-effort design).

interface SpecialistsList {
  data: ListResponse | null;
  error: string | null;
  loading: boolean;
  flaggedIds: Set<string>;
  refresh: () => Promise<void>;
}

export function useSpecialistsList(): SpecialistsList {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ListResponse>('/api/specialists');
      setData(res);
    } catch (e) {
      setError((e as Error).message || t('common.failedToLoadSpecialists'));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshFlags = useCallback(async () => {
    try {
      const res = await apiGet<{ items: Array<{ id: string }> }>(
        '/api/specialists/underperformers',
      );
      const next = new Set<string>();
      for (const it of res.items || []) next.add(it.id);
      setFlaggedIds(next);
    } catch {
      // best-effort — don't block the main view if underperformer
      // detection is misconfigured.
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshFlags(); }, [refreshFlags]);

  return { data, error, loading, flaggedIds, refresh };
}
