import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.656) Extracted from pages/TokenUsage. Pulls
// /api/token-usage (with optional perTask=1 query) and
// /api/quota in lockstep. Quota failures are silent
// (the JSX renders "—" when quota is null) so they don't
// drown the token-usage error banner.

export interface PerTaskEntry {
  worker?: string;
  name?: string;
  task?: string;
  input?: number;
  output?: number;
  total?: number;
  cost?: number;
  date?: string;
  timestamp?: string | number;
  [key: string]: unknown;
}

export interface TokenUsagePayload {
  total?: number;
  totalInput?: number;
  totalOutput?: number;
  perWorker?: Record<string, number | { input?: number; output?: number; total?: number }>;
  perDay?: Record<string, number>;
  perTask?: PerTaskEntry[];
  startedAt?: string;
  error?: string;
  [key: string]: unknown;
}

export interface QuotaTierSnapshot {
  used?: number;
  remaining?: number;
  limit?: number;
  pct?: number;
  [key: string]: unknown;
}

export interface QuotaPayload {
  date?: string;
  tiers?: Record<string, QuotaTierSnapshot>;
  error?: string;
  [key: string]: unknown;
}

interface TokenUsageState {
  data: TokenUsagePayload | null;
  quota: QuotaPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTokenUsage(args: {
  perTask: boolean;
}): TokenUsageState {
  const { perTask } = args;
  const [data, setData] = useState<TokenUsagePayload | null>(null);
  const [quota, setQuota] = useState<QuotaPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = perTask ? '/api/token-usage?perTask=1' : '/api/token-usage';
      const r = await apiGet<TokenUsagePayload>(path);
      setData(r);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    }
    try {
      const q = await apiGet<QuotaPayload>('/api/quota');
      setQuota(q);
    } catch {
      setQuota(null);
    }
    setLoading(false);
  }, [perTask]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, quota, loading, error, refresh };
}
