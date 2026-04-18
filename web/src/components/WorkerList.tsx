import { useCallback, useEffect, useState } from 'react';
import { Inbox, WifiOff } from 'lucide-react';
import type { ListResponse, SSEEvent, Worker } from '../types';
import { apiFetch, eventSourceUrl } from '../lib/api';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  type BadgeProps,
} from './ui';
import { cn } from '../lib/cn';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

function isInterventionActive(w: Worker): boolean {
  if (!w.intervention) return false;
  const active = (w.intervention as { active?: unknown }).active;
  return active === undefined ? true : Boolean(active);
}

function mapWorkerStatusToBadgeVariant(w: Worker): BadgeVariant {
  if (isInterventionActive(w)) return 'destructive';
  if (w.status === 'busy') return 'warning';
  if (w.status === 'idle') return 'success';
  return 'secondary';
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
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Live updates disconnected - polling</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span className="min-w-0 break-words">
            Failed to load workers: {error}
          </span>
        </div>
      )}

      {!error && workers.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Inbox aria-hidden="true" className="h-4 w-4" />
          <span>No workers yet.</span>
        </div>
      )}

      {workers.map((w) => {
        const interventionActive = isInterventionActive(w);
        const isSelected = selectedWorker === w.name;
        return (
          <Card
            key={w.name}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(w.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(w.name);
              }
            }}
            className={cn(
              'cursor-pointer transition-colors hover:bg-accent/40',
              isSelected &&
                'ring-2 ring-ring ring-offset-2 ring-offset-background'
            )}
          >
            <CardHeader className="flex-row items-center justify-between gap-2 p-4">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {w.name}
              </span>
              <Badge variant={mapWorkerStatusToBadgeVariant(w)} className="shrink-0 uppercase">
                {statusLabel(w)}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-1.5 p-4 pt-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {w.unreadSnapshots > 0 && (
                  <Badge variant="info" className="px-1.5 py-0 text-[11px] font-medium">
                    {w.unreadSnapshots} unread
                  </Badge>
                )}
                {interventionActive && (
                  <Badge variant="destructive" className="px-1.5 py-0 text-[11px] font-medium">
                    {String(
                      (w.intervention as { reason?: unknown })?.reason ?? 'intervention'
                    )}
                  </Badge>
                )}
              </div>
              {w.branch && (
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {w.branch}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
