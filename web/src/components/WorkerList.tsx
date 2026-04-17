import { useCallback, useEffect, useState } from 'react';
import type { ListResponse, SSEEvent, Worker } from '../types';
import { apiFetch, eventSourceUrl } from '../lib/api';

function isInterventionActive(w: Worker): boolean {
  if (!w.intervention) return false;
  const active = (w.intervention as { active?: unknown }).active;
  return active === undefined ? true : Boolean(active);
}

function statusColor(w: Worker): string {
  if (isInterventionActive(w)) return 'text-red-400';
  if (w.status === 'busy') return 'text-yellow-400';
  if (w.status === 'idle') return 'text-green-400';
  return 'text-gray-400';
}

function statusLabel(w: Worker): string {
  return isInterventionActive(w) ? 'intervention' : w.status;
}

interface WorkerListProps {
  selectedWorker: string | null;
  onSelect: (name: string) => void;
}

export default function WorkerList({ selectedWorker, onSelect }: WorkerListProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const res = await apiFetch('/api/list');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ListResponse;
      setWorkers(Array.isArray(data.workers) ? data.workers : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    fetchList();
    const interval = setInterval(fetchList, 5000);

    const es = new EventSource(eventSourceUrl('/api/events'));
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data) as SSEEvent;
        if (evt.type && evt.type !== 'connected') {
          fetchList();
        }
      } catch {
        // ignore non-JSON payloads
      }
    };

    return () => {
      clearInterval(interval);
      es.close();
    };
  }, [fetchList]);

  return (
    <div className="space-y-2">
      {!sseConnected && (
        <div className="text-xs text-gray-500">Live updates disconnected — polling</div>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/40 p-3 text-sm text-red-300">
          Failed to load workers: {error}
        </div>
      )}

      {!error && workers.length === 0 && (
        <div className="text-sm text-gray-500">No workers yet.</div>
      )}

      {workers.map((w) => {
        const interventionActive = isInterventionActive(w);
        const isSelected = selectedWorker === w.name;
        return (
          <button
            key={w.name}
            type="button"
            onClick={() => onSelect(w.name)}
            className={`w-full rounded-lg p-4 text-left transition ${
              isSelected
                ? 'bg-gray-700 ring-1 ring-blue-500'
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-gray-100">{w.name}</span>
              <span className={`text-xs font-semibold uppercase ${statusColor(w)}`}>
                {statusLabel(w)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {w.unreadSnapshots > 0 && (
                <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-blue-300">
                  {w.unreadSnapshots} unread
                </span>
              )}
              {interventionActive && (
                <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-300">
                  {String((w.intervention as { reason?: unknown })?.reason ?? 'intervention')}
                </span>
              )}
            </div>

            {w.branch && (
              <div className="mt-2 truncate text-xs text-gray-500">{w.branch}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
