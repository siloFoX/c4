import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import type { ListResponse, Worker } from '../types';

// (v1.10.730) Extracted from pages/Swarm. Two coupled
// fetches:
//   1. /api/list to populate the worker dropdown +
//      auto-select the first worker when selection
//      is empty.
//   2. /api/swarm?name=<selected> to fetch the swarm
//      tree, re-runs whenever `selected` changes.
// Single shared `loading` + `error` flag covers both.
// `refresh` re-runs the swarm fetch only (workers
// list is stable enough that operators don't need to
// trigger that path manually).

export interface SwarmNode {
  name: string;
  status?: string;
  branch?: string;
  children?: SwarmNode[];
  [key: string]: unknown;
}

export interface SwarmResponse {
  root?: SwarmNode;
  nodes?: SwarmNode[];
  error?: string;
  [key: string]: unknown;
}

export interface UseSwarmState {
  workers: Worker[];
  selected: string;
  setSelected: (next: string) => void;
  data: SwarmResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSwarm(): UseSwarmState {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [data, setData] = useState<SwarmResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [selected]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const loadSwarm = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<SwarmResponse>(`/api/swarm?name=${encodeURIComponent(selected)}`);
      if (r.error) {
        setError(r.error);
        setData(null);
      } else {
        setData(r);
      }
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    loadSwarm();
  }, [loadSwarm]);

  return { workers, selected, setSelected, data, loading, error, refresh: loadSwarm };
}
