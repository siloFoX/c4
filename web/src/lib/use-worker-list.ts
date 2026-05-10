import { useCallback, useEffect, useState } from 'react';
import { apiGet, eventSourceUrl } from './api';
import type { ListResponse, SSEEvent, Worker } from '../types';

// (v1.10.660) Extracted from WorkerList. Polls /api/list
// every 5s, subscribes to /api/events for SSE-driven
// refreshes (any non-`connected` event triggers a fetch),
// and tracks the SSE connection badge state. The polling
// + SSE belt-and-braces matches what's been there since
// 8.x — SSE is the primary signal but the timer is kept
// so a transient drop still keeps the sidebar warm.
// (v1.10.752) apiFetch + manual error throw replaced
// with apiGet which throws on non-ok internally.

interface WorkerListState {
  workers: Worker[];
  error: string | null;
  sseConnected: boolean;
  refresh: () => Promise<void>;
}

export function useWorkerList(): WorkerListState {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<ListResponse>('/api/list');
      setWorkers(Array.isArray(data.workers) ? data.workers : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);

    const es = new EventSource(eventSourceUrl('/api/events'));
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data) as SSEEvent;
        if (evt.type && evt.type !== 'connected') {
          refresh();
        }
      } catch {
        // ignore non-JSON payloads
      }
    };

    return () => {
      clearInterval(interval);
      es.close();
    };
  }, [refresh]);

  return { workers, error, sseConnected, refresh };
}
