import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import type { ListResponse, Worker } from '../types';

// (v1.10.724) Extracted from pages/Validation. Owns
// the GET /api/list → fan-out per-worker
// /api/validation?name=<worker> fetch. Per-worker
// requests run in parallel via Promise.all; failures
// surface as `{ error: '<message>' }` entries rather
// than aborting the whole sweep.
// (v1.10.754) Per-worker apiFetch + manual error
// mapping replaced with apiGet — the catch block
// already covers both throw paths uniformly.

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
            next[w.name] = await apiGet<ValidationResponse>(
              `/api/validation?name=${encodeURIComponent(w.name)}`,
            );
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
