import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Crown, Inbox, WifiOff, Wrench } from 'lucide-react';
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
  // (8.21) Server now emits the narrowed string enum:
  // 'approval_pending' | 'background_exit' | 'past_resolved' | null.
  // Only approval_pending counts as "needs human"; bg-exit and
  // past_resolved are informational breadcrumbs.
  if (typeof w.intervention === 'string') {
    return w.intervention === 'approval_pending';
  }
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

// (TODO 8.37) Resolve a worker's group bucket from its `tier` field
// (added by daemon's /api/list in 8.37). Falls back to a name-pattern
// heuristic for compatibility with pre-8.37 daemons that don't fold
// tier into the response.
function groupOf(w: Worker): 'manager' | 'worker' {
  if (w.tier === 'manager') return 'manager';
  if (w.tier && w.tier !== 'worker') return 'worker';
  // Fallback: c4-mgr-*, auto-mgr, *-mgr-* are conventional manager names.
  if (/^c4-mgr/i.test(w.name)) return 'manager';
  if (/^auto-mgr/i.test(w.name)) return 'manager';
  if (/-mgr-/i.test(w.name)) return 'manager';
  return 'worker';
}

interface WorkerListProps {
  selectedWorker: string | null;
  onSelect: (name: string) => void;
}

// (TODO 8.37) Section header for a group. Renders the lucide icon,
// the group label, and a count badge. Expandable so operators can
// fold one bucket out of the way when they're focused on the other.
interface GroupHeaderProps {
  open: boolean;
  onToggle: () => void;
  label: string;
  count: number;
  icon: 'crown' | 'wrench';
  accent: 'primary' | 'muted';
}

function GroupHeader({ open, onToggle, label, count, icon, accent }: GroupHeaderProps) {
  const Icon = icon === 'crown' ? Crown : Wrench;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`worker-group-${label.toLowerCase()}`}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs uppercase tracking-wide transition-colors',
        accent === 'primary'
          ? 'text-primary hover:bg-primary/5'
          : 'text-muted-foreground hover:bg-accent/40',
      )}
    >
      {open ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{label}</span>
      <span
        className={cn(
          'ml-auto rounded-full border px-1.5 py-0 text-[10px] font-semibold',
          accent === 'primary'
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-border bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

// (TODO 8.37) localStorage keys for the per-group expand/collapse
// state. Persist so the operator's preference survives reloads.
const MGR_OPEN_KEY = 'c4.workerList.managers.open';
const WRK_OPEN_KEY = 'c4.workerList.workers.open';

function readBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeBoolPref(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* private mode — ignore */
  }
}

export default function WorkerList({ selectedWorker, onSelect }: WorkerListProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [managersOpen, setManagersOpen] = useState<boolean>(() => readBoolPref(MGR_OPEN_KEY, true));
  const [workersOpen, setWorkersOpen] = useState<boolean>(() => readBoolPref(WRK_OPEN_KEY, true));

  useEffect(() => { writeBoolPref(MGR_OPEN_KEY, managersOpen); }, [managersOpen]);
  useEffect(() => { writeBoolPref(WRK_OPEN_KEY, workersOpen); }, [workersOpen]);

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

  // (TODO 8.37) Partition into manager / worker buckets for the
  // grouped sidebar. Sort each group by name so the order is stable
  // across SSE bumps.
  const { managers, regular } = useMemo(() => {
    const m: Worker[] = [];
    const r: Worker[] = [];
    for (const w of workers) {
      if (groupOf(w) === 'manager') m.push(w);
      else r.push(w);
    }
    m.sort((a, b) => a.name.localeCompare(b.name));
    r.sort((a, b) => a.name.localeCompare(b.name));
    return { managers: m, regular: r };
  }, [workers]);

  const renderRow = (w: Worker, accent: 'primary' | 'muted') => {
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
          // (TODO 8.37) Manager rows wear a left primary accent bar so
          // the role distinction is visible at a glance even when
          // groups are collapsed via the parent's overflow trick.
          accent === 'primary' && 'border-l-2 border-l-primary/40',
          isSelected &&
            'ring-2 ring-ring ring-offset-2 ring-offset-background',
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
  };

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

      {/* (TODO 8.37) Managers group — only renders when there's at
          least one manager to avoid a permanently empty section. */}
      {managers.length > 0 && (
        <div className="space-y-1">
          <GroupHeader
            open={managersOpen}
            onToggle={() => setManagersOpen((v) => !v)}
            label="Managers"
            count={managers.length}
            icon="crown"
            accent="primary"
          />
          {managersOpen && (
            <div id="worker-group-managers" className="space-y-2">
              {managers.map((w) => renderRow(w, 'primary'))}
            </div>
          )}
        </div>
      )}

      {/* (TODO 8.37) Workers group — only renders when there's at
          least one worker. Always-visible header would be confusing
          when there's a single bucket. */}
      {regular.length > 0 && (
        <div className="space-y-1">
          <GroupHeader
            open={workersOpen}
            onToggle={() => setWorkersOpen((v) => !v)}
            label="Workers"
            count={regular.length}
            icon="wrench"
            accent="muted"
          />
          {workersOpen && (
            <div id="worker-group-workers" className="space-y-2">
              {regular.map((w) => renderRow(w, 'muted'))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
