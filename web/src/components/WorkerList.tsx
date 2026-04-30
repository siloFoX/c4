import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, Wifi, WifiOff } from 'lucide-react';
import type { ListResponse, SSEEvent, Worker } from '../types';
import { cn } from '../lib/cn';
import BatchControls from './BatchControls';

function isInterventionActive(w: Worker): boolean {
  if (!w.intervention) return false;
  const active = (w.intervention as { active?: unknown }).active;
  return active === undefined ? true : Boolean(active);
}

function statusColor(w: Worker): string {
  if (isInterventionActive(w)) return 'text-intervention';
  if (w.status === 'suspended') return 'text-suspended';
  if (w.status === 'busy') return 'text-warning';
  if (w.status === 'idle') return 'text-success';
  return 'text-muted';
}

function statusLabel(w: Worker): string {
  return isInterventionActive(w) ? 'intervention' : w.status;
}

function statusDotColor(w: Worker): string {
  if (isInterventionActive(w)) return 'bg-intervention';
  if (w.status === 'suspended') return 'bg-suspended';
  if (w.status === 'busy') return 'bg-warning';
  if (w.status === 'idle') return 'bg-success';
  return 'bg-muted/40';
}

interface WorkerListProps {
  selectedWorker: string | null;
  onSelect: (name: string) => void;
}

export default function WorkerList({ selectedWorker, onSelect }: WorkerListProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch('/api/list');
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

    const es = new EventSource('/api/events');
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

  const selectedNames = useMemo(() => Array.from(checked), [checked]);
  const toggleCheck = (name: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted">
        {sseConnected ? (
          <>
            <Wifi size={12} className="text-success" /> live
          </>
        ) : (
          <>
            <WifiOff size={12} className="text-warning" /> polling
          </>
        )}
      </div>

      <BatchControls
        selected={selectedNames}
        onClearSelection={() => setChecked(new Set())}
        onCompleted={fetchList}
      />

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          Failed to load workers: {error}
        </div>
      )}

      {!error && workers.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
          No workers yet. Create one with <code className="rounded bg-surface-2 px-1.5 py-0.5">c4 new &lt;name&gt;</code>.
        </div>
      )}

      {workers.map((w) => {
        const interventionActive = isInterventionActive(w);
        const isSelected = selectedWorker === w.name;
        const isChecked = checked.has(w.name);
        return (
          <div
            key={w.name}
            className={cn(
              'group w-full rounded-lg border p-3 text-left transition-all duration-150 ease-snappy',
              isSelected
                ? 'border-primary/60 bg-surface-3 shadow-glow'
                : 'border-border bg-surface-2 hover:border-border/80 hover:bg-surface-3',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => { e.stopPropagation(); toggleCheck(w.name); }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary"
                  aria-label={`Select ${w.name}`}
                />
                <button
                  type="button"
                  onClick={() => onSelect(w.name)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full transition-colors',
                      statusDotColor(w),
                      w.status === 'busy' && 'animate-pulse',
                    )}
                  />
                  <span className="truncate text-sm font-medium">{w.name}</span>
                </button>
              </div>
              <span className={cn('text-[10px] font-semibold uppercase tracking-wider', statusColor(w))}>
                {statusLabel(w)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              {w.unreadSnapshots > 0 && (
                <span className="rounded bg-primary/20 px-1.5 py-0.5 font-medium text-primary">
                  {w.unreadSnapshots} new
                </span>
              )}
              {interventionActive && (
                <span className="rounded bg-intervention/20 px-1.5 py-0.5 font-medium text-intervention">
                  {String((w.intervention as { reason?: unknown })?.reason ?? 'intervention')}
                </span>
              )}
              {w.errorCount > 0 && (
                <span className="rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning">
                  {w.errorCount} err
                </span>
              )}
            </div>

            {w.branch && (
              <div className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-muted">
                <GitBranch size={11} className="shrink-0" />
                <span className="truncate font-mono">{w.branch}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
