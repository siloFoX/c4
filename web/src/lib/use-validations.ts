import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiGet } from './api';
import type { ListResponse, Worker } from '../types';

// (v1.10.724) Extracted from pages/Validation. Owns
// the GET /api/list → fan-out per-worker
// /api/validation?name=<worker> fetch. Per-worker
// requests run in parallel via Promise.all; failures
// surface as `{ error: 'HTTP <status>' }` entries
// rather than aborting the whole sweep.

export interface ValidationResponse {
  name?: string;
  tests?: { passed?: number; failed?: number; skipped?: number; ok?: boolean };
  typecheck?: { ok?: boolean; errors?: number };
  lint?: { ok?: boolean; errors?: number; warnings?: number };
  coverage?: { lines?: number; branches?: number };
  generatedAt?: string;
  dirty?: boolean;
  branch?: string;
  error?: string;
  [key: string]: unknown;
}

export interface UseValidationsState {
  workers: Worker[];
  validations: Record<string, ValidationResponse>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useValidations(): UseValidationsState {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [validations, setValidations] = useState<Record<string, ValidationResponse>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiGet<ListResponse>('/api/list');
      const ws = Array.isArray(list.workers) ? list.workers : [];
      setWorkers(ws);
      const next: Record<string, ValidationResponse> = {};
      await Promise.all(
        ws.map(async (w) => {
          try {
            const res = await apiFetch(`/api/validation?name=${encodeURIComponent(w.name)}`);
            if (res.ok) {
              next[w.name] = (await res.json()) as ValidationResponse;
            } else {
              next[w.name] = { error: `HTTP ${res.status}` };
            }
          } catch (e) {
            next[w.name] = { error: (e as Error).message };
          }
        }),
      );
      setValidations(next);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { workers, validations, loading, error, refresh };
}
