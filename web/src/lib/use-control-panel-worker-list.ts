import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import type { ListResponse, Worker } from '../types';

// (v1.10.737) Extracted from ControlPanel. Polls
// /api/list every 5s to feed the per-worker action
// strip + the batch-selection toolbar. Distinct
// from the global `useWorkerList` (lib/use-worker-
// list.ts) — that hook also subscribes to
// /api/events SSE for real-time refresh and surfaces
// an `error` slot for the sidebar. The ControlPanel
// poll stays silent on failure (the sidebar already
// surfaces list errors) and skips the SSE
// subscription so two simultaneous /api/events
// streams don't run when the sidebar + this panel
// are mounted together.
// (v1.10.750) apiFetch + manual error throw replaced
// with apiGet which throws on non-ok internally.

export interface UseControlPanelWorkerListState {
  workers: Worker[];
  fetchList: () => Promise<void>;
}

const POLL_INTERVAL_MS = 5000;

export function useControlPanelWorkerList(): UseControlPanelWorkerListState {
  const [workers, setWorkers] = useState<Worker[]>([]);

  const fetchList = useCallback(async () => {
    try {
      const data = await apiGet<ListResponse>('/api/list');
      setWorkers(Array.isArray(data.workers) ? data.workers : []);
    } catch {
      // The sidebar already surfaces list errors; keep the panel silent.
    }
  }, []);

  useEffect(() => {
    fetchList();
    const interval = setInterval(fetchList, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchList]);

  return { workers, fetchList };
}
