import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import type { ListResponse, Worker } from '../types';

// (v1.10.693) Extracted from pages/Plan. Loads the
// worker list once on mount via GET /api/list, and
// auto-selects the first worker when nothing is
// currently selected. The hook delegates select +
// error reporting to the parent so the existing
// usePlanContent hook can keep watching `selected`.

interface PlanWorkersState {
  workers: Worker[];
  loadWorkers: () => Promise<void>;
}

export function usePlanWorkers(args: {
  selected: string;
  setSelected: (name: string) => void;
  setError: (message: string | null) => void;
}): PlanWorkersState {
  const { selected, setSelected, setError } = args;
  const [workers, setWorkers] = useState<Worker[]>([]);

  const loadWorkers = useCallback(async () => {
    try {
      const r = await apiGet<ListResponse>('/api/list');
      const ws = Array.isArray(r.workers) ? r.workers : [];
      setWorkers(ws);
      const first = ws[0];
      if (!selected && first) setSelected(first.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selected, setSelected, setError]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  return { workers, loadWorkers };
}
