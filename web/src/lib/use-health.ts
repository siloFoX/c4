import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.729) Extracted from pages/Health. The health
// dashboard's GET /api/health fetch + 10s self-poll.
// Distinguished from useMetrics (which polls /api/
// metrics every 5s for the always-on header bar):
// this one drives the standalone Health page where
// the operator wants a slower-cadence snapshot
// alongside an explicit Refresh button.

export interface HealthPayload {
  ok?: boolean;
  pid?: number;
  uptime?: number;
  startedAt?: string;
  version?: string;
  workers?: number;
  activeWorkers?: number;
  idleWorkers?: number;
  busyWorkers?: number;
  queueDepth?: number;
  lostWorkers?: number;
  eventLoopLagMs?: number;
  modules?: string[];
  configPath?: string;
  error?: string;
  [key: string]: unknown;
}

const POLL_INTERVAL_MS = 10000;

export interface UseHealthState {
  data: HealthPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useHealth(): UseHealthState {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<HealthPayload>('/api/health');
      setData(r);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh };
}
