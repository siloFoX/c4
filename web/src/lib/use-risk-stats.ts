import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import { t } from './i18n';
import type { StatsResponse } from '../pages/Risk';

// (v1.10.644) Extracted from pages/Risk. Risk classifier stats
// — GET /api/risk/stats?windowHours=N. The window-hours
// selector lives here too so the auto-refetch wires up
// correctly. Returns the response + loading/error state +
// windowHours setter + manual refresh.

interface RiskStats {
  windowHours: number;
  setWindowHours: (next: number) => void;
  stats: StatsResponse | null;
  statsLoading: boolean;
  statsError: string | null;
  refreshStats: () => Promise<void>;
}

export function useRiskStats(): RiskStats {
  const [windowHours, setWindowHours] = useState(24);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await apiGet<StatsResponse>(
        `/api/risk/stats?windowHours=${windowHours}`,
      );
      setStats(res);
    } catch (e) {
      setStatsError((e as Error).message || t('common.statsFailed'));
    } finally {
      setStatsLoading(false);
    }
  }, [windowHours]);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  return {
    windowHours,
    setWindowHours,
    stats,
    statsLoading,
    statsError,
    refreshStats,
  };
}
