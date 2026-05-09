import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';

// (v1.10.661) Extracted from pages/Plan. Loads the saved
// plan markdown for the currently-selected worker — GET
// /api/plan?name=<worker>. Auto-refetches on `selected`
// flip; clears the slot to null on HTTP error so the
// "no plan yet" empty state can re-render.

export interface PlanResponse {
  name?: string;
  content?: string;
  path?: string;
  status?: string;
  error?: string;
  [key: string]: unknown;
}

interface PlanContentState {
  plan: PlanResponse | null;
  loading: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  loadPlan: () => Promise<void>;
}

export function usePlanContent(args: {
  selected: string;
}): PlanContentState {
  const { selected } = args;
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/plan?name=${encodeURIComponent(selected)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PlanResponse;
      setPlan(data);
    } catch (e) {
      setError((e as Error).message);
      setPlan(null);
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  return { plan, loading, error, setError, loadPlan };
}
