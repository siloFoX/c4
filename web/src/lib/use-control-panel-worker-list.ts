import { useSilentPollWithRefresh } from './use-silent-poll';
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
// (v1.10.767) Self-polling fetch + manual refresh
// delegated to lib/use-silent-poll's
// useSilentPollWithRefresh.

export interface UseControlPanelWorkerListState {
  workers: Worker[];
  fetchList: () => Promise<void>;
}

const POLL_INTERVAL_MS = 5000;
const EMPTY_WORKERS: Worker[] = [];

export function useControlPanelWorkerList(): UseControlPanelWorkerListState {
  const { data: workers, refresh: fetchList } = useSilentPollWithRefresh<ListResponse, Worker[]>(
    '/api/list',
    POLL_INTERVAL_MS,
    EMPTY_WORKERS,
    (res) => Array.isArray(res.workers) ? res.workers : [],
  );

  return { workers, fetchList };
}
