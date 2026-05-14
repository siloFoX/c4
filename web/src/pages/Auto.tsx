import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Cpu,
  History,
  Inbox,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import PageFrame from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  DashboardGrid,
  EmptyState as PrimitiveEmptyState,
  StatCard,
  Timeline,
  Tooltip,
} from '../components/ui';
import type { BadgeVariant, TimelineItem, TimelineTone } from '../components/ui';
import { EmptyQueueIllustration } from '../components/illustrations';
import { cn } from '../lib/cn';
import { useLocale } from '../lib/i18n';
import { apiGet, apiPost } from '../lib/api';
import type { Worker } from '../types';

// (1.11.76) Auto.tsx reborn as the autonomous dispatcher dashboard.
// Five sections fan out from a small set of independently polled
// async slots so each panel can render its own loading / empty /
// error / data state without one slow endpoint stalling the rest:
//   * /api/autonomous/queue   - parsed markdown queue (one-shot)
//   * /api/autonomous/status  - dispatcher snapshot   (5s poll)
//   * /api/list               - worker roster         (5s poll)
// Controls dock posts to /pause / /resume / /tick, then re-fetches
// status so the paused / running badge flips immediately.

type QueueStatus = 'todo' | 'doing' | 'done';

interface QueueRow {
  id: string;
  title: string;
  status: QueueStatus;
  detail: string;
}

interface QueueResponse {
  rows: QueueRow[];
  source?: string;
  notFound?: boolean;
  error?: string;
}

type DispatchEventType =
  | 'dispatch'
  | 'success'
  | 'halt'
  | 'dispatch-error'
  | string;

interface DispatchEvent {
  type: DispatchEventType;
  id?: string | null;
  at?: number;
}

interface AutonomousStatus {
  enabled: boolean;
  paused?: boolean;
  pauseReason?: string | null;
  consecutiveHalts?: number;
  lastDispatchAt?: string | null;
  lastDispatchId?: string | null;
  lastError?: string | null;
  recent?: DispatchEvent[];
  pendingEscalations?: number;
  managerName?: string;
  reason?: string;
  error?: string;
}

interface WorkerListResponse {
  workers: Worker[];
  error?: string;
}

type AsyncState<T> =
  | { kind: 'loading' }
  | { kind: 'error'; error: string }
  | { kind: 'data'; data: T };

interface Slot<T> {
  state: AsyncState<T>;
  refresh: () => void;
}

function useFetchSlot<T>(url: string, pollMs: number): Slot<T> {
  const [state, setState] = useState<AsyncState<T>>({ kind: 'loading' });
  const fetcher = useCallback(async () => {
    try {
      const data = await apiGet<T>(url);
      setState({ kind: 'data', data });
    } catch (e) {
      setState({ kind: 'error', error: (e as Error).message });
    }
  }, [url]);
  useEffect(() => {
    fetcher();
    if (pollMs <= 0) return;
    const id = window.setInterval(fetcher, pollMs);
    return () => window.clearInterval(id);
  }, [fetcher, pollMs]);
  return { state, refresh: fetcher };
}

function relativeTime(input: number | string | null | undefined, now: number): string {
  if (input === null || input === undefined || input === '') return '--';
  const ms = typeof input === 'number' ? input : Date.parse(input);
  if (!Number.isFinite(ms)) return '--';
  const diff = Math.max(0, now - ms);
  if (diff < 1000 * 30) return 'just now';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(diff / 86400000);
  return `${d}d ago`;
}

const STATUS_BADGE: Record<QueueStatus, { variant: BadgeVariant; label: string }> = {
  todo: { variant: 'secondary', label: 'todo' },
  doing: { variant: 'warning', label: 'doing' },
  done: { variant: 'success', label: 'done' },
};

interface EventDescriptor {
  Icon: LucideIcon;
  label: string;
  bar: string;
  ring: string;
}

const EVENT_TONE: Record<string, TimelineTone> = {
  dispatch: 'primary',
  success: 'success',
  halt: 'danger',
  'dispatch-error': 'warning',
};

const EVENT_DESCRIPTORS: Record<DispatchEventType, EventDescriptor> = {
  dispatch: {
    Icon: Rocket,
    label: 'Dispatch',
    bar: 'bg-primary/70',
    ring: 'text-primary',
  },
  success: {
    Icon: CheckCircle2,
    label: 'Success',
    bar: 'bg-success/70',
    ring: 'text-success',
  },
  halt: {
    Icon: AlertCircle,
    label: 'Halt',
    bar: 'bg-destructive/70',
    ring: 'text-destructive',
  },
  'dispatch-error': {
    Icon: AlertTriangle,
    label: 'Error',
    bar: 'bg-warning/70',
    ring: 'text-warning',
  },
};

function descriptorFor(type: DispatchEventType): EventDescriptor {
  return EVENT_DESCRIPTORS[type] || {
    Icon: Activity,
    label: type,
    bar: 'bg-muted',
    ring: 'text-muted-foreground',
  };
}

const QUEUE_INITIAL_LIMIT = 20;

interface SectionShellProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function SectionShell({
  title,
  description,
  action,
  icon,
  children,
  className,
}: SectionShellProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card/60 shadow-sm transition-all duration-300',
        className,
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground"
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  cta?: React.ReactNode;
}

function EmptyState({ icon, title, description, cta }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center"
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground"
        >
          {icon}
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {cta}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Alert
      variant="error"
      icon={<AlertCircle className="h-4 w-4" />}
      action={
        onRetry ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}

interface BlockSkeletonProps {
  rows?: number;
  className?: string;
}

function BlockSkeleton({ rows = 3, className }: BlockSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={cn('flex flex-col gap-2', className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-10 w-full animate-pulse rounded-md bg-muted/60"
        />
      ))}
    </div>
  );
}

interface HeroStatsProps {
  queue: AsyncState<QueueResponse>;
  status: AsyncState<AutonomousStatus>;
  now: number;
  noAnimation?: boolean;
}

function HeroStats({ queue, status, now, noAnimation }: HeroStatsProps) {
  const todoCount =
    queue.kind === 'data' ? queue.data.rows.filter((r) => r.status === 'todo').length : 0;
  const doingCount =
    queue.kind === 'data' ? queue.data.rows.filter((r) => r.status === 'doing').length : 0;
  const doneCount =
    queue.kind === 'data' ? queue.data.rows.filter((r) => r.status === 'done').length : 0;

  const lastDispatchAt =
    status.kind === 'data' ? status.data.lastDispatchAt || null : null;
  const lastDispatchLabel = lastDispatchAt ? relativeTime(lastDispatchAt, now) : '--';

  const queueLoading = queue.kind === 'loading';
  const statusLoading = status.kind === 'loading';

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Queue todo"
        icon={<Inbox className="h-4 w-4" />}
        value={todoCount}
        hint="Tasks awaiting dispatch"
        loading={queueLoading}
        tone="info"
        noAnimation={noAnimation}
      />
      <StatCard
        label="In flight"
        icon={<Loader2 className="h-4 w-4" />}
        value={doingCount}
        hint="Tasks currently dispatched"
        loading={queueLoading}
        tone="warning"
        noAnimation={noAnimation}
      />
      <StatCard
        label="Done"
        icon={<CheckCircle2 className="h-4 w-4" />}
        value={doneCount}
        hint="Tasks marked done in queue"
        loading={queueLoading}
        tone="success"
        noAnimation={noAnimation}
      />
      <StatCard
        label="Last dispatch"
        icon={<Clock className="h-4 w-4" />}
        value={lastDispatchLabel}
        hint={
          status.kind === 'data' && status.data.lastDispatchId
            ? `id ${status.data.lastDispatchId}`
            : 'No recent dispatch'
        }
        loading={statusLoading}
        tone="primary"
        noAnimation={noAnimation}
      />
    </div>
  );
}

interface QueueRowItemProps {
  row: QueueRow;
}

function QueueRowItem({ row }: QueueRowItemProps) {
  const badge = STATUS_BADGE[row.status];
  return (
    <li className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40 focus-within:bg-muted/40">
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {row.id}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {row.title}
        </p>
        <Tooltip label={row.detail} placement="bottom">
          <span
            tabIndex={0}
            className="block max-w-full truncate text-xs leading-relaxed text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {row.detail}
          </span>
        </Tooltip>
      </div>
      <Badge variant={badge.variant}>{badge.label}</Badge>
    </li>
  );
}

interface LiveQueueSectionProps {
  slot: Slot<QueueResponse>;
}

function LiveQueueSection({ slot }: LiveQueueSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const refresh = slot.refresh;

  return (
    <SectionShell
      title="Live queue"
      description="Tasks parsed from docs/autonomous-queue-v10.md"
      icon={<History className="h-4 w-4" />}
      action={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={refresh}
          aria-label="Refresh queue"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      }
    >
      {slot.state.kind === 'loading' ? (
        <BlockSkeleton rows={6} />
      ) : slot.state.kind === 'error' ? (
        <ErrorState message={slot.state.error} onRetry={refresh} />
      ) : slot.state.data.rows.length === 0 ? (
        <PrimitiveEmptyState
          icon={
            <EmptyQueueIllustration
              className="text-muted-foreground"
              size={160}
            />
          }
          title="No queue entries"
          description={
            slot.state.data.notFound
              ? 'docs/autonomous-queue-v10.md was not found on disk.'
              : 'The queue markdown has no rows yet.'
          }
        />
      ) : (
        <QueueRendered
          rows={slot.state.data.rows}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}
    </SectionShell>
  );
}

function QueueRendered({
  rows,
  expanded,
  setExpanded,
}: {
  rows: QueueRow[];
  expanded: boolean;
  setExpanded: (next: boolean) => void;
}) {
  const visibleRows = expanded ? rows : rows.slice(0, QUEUE_INITIAL_LIMIT);
  const hiddenCount = rows.length - visibleRows.length;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto pr-1">
        {visibleRows.map((row) => (
          <QueueRowItem key={row.id} row={row} />
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded(true)}
          >
            <span>Load {hiddenCount} more</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface WorkerCardProps {
  worker: Worker;
  now: number;
}

function workerStatusVariant(status: Worker['status']): BadgeVariant {
  if (status === 'busy') return 'warning';
  if (status === 'idle') return 'success';
  return 'secondary';
}

function WorkerCard({ worker, now }: WorkerCardProps) {
  const interventionActive =
    typeof worker.intervention === 'string'
      ? worker.intervention === 'approval_pending'
      : Boolean(worker.intervention && (worker.intervention as { active?: boolean }).active);
  const lastTouched = worker.lastInterventionAt
    ? relativeTime(worker.lastInterventionAt, now)
    : null;

  return (
    <article
      data-worker-card
      className="flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-border bg-background/70 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <header className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground"
        >
          <Cpu className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {worker.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {worker.tier || 'worker'}
          </p>
        </div>
      </header>
      <div className="flex items-center justify-between text-xs">
        <Badge variant={workerStatusVariant(worker.status)}>{worker.status}</Badge>
        {interventionActive ? (
          <Tooltip label="Awaiting reviewer" placement="top">
            <span className="inline-flex items-center gap-1 text-warning">
              <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" />
              <span>review</span>
            </span>
          </Tooltip>
        ) : null}
      </div>
      <p className="truncate text-[11px] text-muted-foreground">
        {lastTouched ? `touched ${lastTouched}` : 'no recent activity'}
      </p>
    </article>
  );
}

interface WorkersStripProps {
  slot: Slot<WorkerListResponse>;
  now: number;
}

function WorkersStrip({ slot, now }: WorkersStripProps) {
  return (
    <SectionShell
      title="Active workers"
      description="Live roster, polled every 5s"
      icon={<Users className="h-4 w-4" />}
      action={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={slot.refresh}
          aria-label="Refresh workers"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      }
    >
      {slot.state.kind === 'loading' ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-28 w-56 shrink-0 animate-pulse rounded-xl bg-muted/60"
            />
          ))}
          <span className="sr-only">Loading workers</span>
        </div>
      ) : slot.state.kind === 'error' ? (
        <ErrorState message={slot.state.error} onRetry={slot.refresh} />
      ) : slot.state.data.workers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No workers running"
          description="Workers spawned by the autonomous loop will appear here."
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {slot.state.data.workers.map((w) => (
            <WorkerCard key={w.name} worker={w} now={now} />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

interface TimelineSectionProps {
  status: Slot<AutonomousStatus>;
  queue: AsyncState<QueueResponse>;
  now: number;
}

function TimelineSection({ status, queue, now }: TimelineSectionProps) {
  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    if (queue.kind === 'data') {
      for (const row of queue.data.rows) map.set(row.id, row.title);
    }
    return map;
  }, [queue]);

  return (
    <SectionShell
      title="Dispatch timeline"
      description="Last 10 events emitted by the autonomous loop"
      icon={<Activity className="h-4 w-4" />}
      action={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={status.refresh}
          aria-label="Refresh timeline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      }
    >
      {status.state.kind === 'loading' ? (
        <BlockSkeleton rows={5} />
      ) : status.state.kind === 'error' ? (
        <ErrorState message={status.state.error} onRetry={status.refresh} />
      ) : !status.state.data.enabled ? (
        <EmptyState
          icon={<CircleDashed className="h-5 w-5" />}
          title="Autonomous loop disabled"
          description={
            status.state.data.reason ||
            'Set config.autonomous.mode = true and restart the daemon to enable.'
          }
        />
      ) : (status.state.data.recent || []).length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title="No dispatch activity yet"
          description="Click Tick on the controls dock to fire the loop immediately."
        />
      ) : (
        (() => {
          const events = (status.state.data.recent || []).slice().reverse();
          const items: TimelineItem[] = events.map((evt, i) => {
            const d = descriptorFor(evt.type);
            const Icon = d.Icon;
            const subtitle = evt.id ? titleById.get(evt.id) : null;
            const tone: TimelineTone = EVENT_TONE[evt.type] || 'neutral';
            return {
              id: `${evt.type}-${evt.at ?? i}-${evt.id ?? i}`,
              timestamp: evt.at ? new Date(evt.at) : new Date(),
              tone,
              icon: <Icon className="h-3 w-3" />,
              title: (
                <span className="flex items-baseline gap-2">
                  <span>{d.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {evt.id || '-'}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {relativeTime(evt.at ?? null, now)}
                  </span>
                </span>
              ),
              description: subtitle ?? undefined,
            };
          });
          return <Timeline aria-label="Dispatch timeline" items={items} />;
        })()
      )}
    </SectionShell>
  );
}

interface ControlsDockProps {
  status: AsyncState<AutonomousStatus>;
  onAction: (action: 'pause' | 'resume' | 'tick') => Promise<void>;
  pending: 'pause' | 'resume' | 'tick' | null;
}

function ControlsDock({ status, onAction, pending }: ControlsDockProps) {
  if (status.kind !== 'data') return null;
  const data = status.data;
  if (!data.enabled) return null;
  const paused = Boolean(data.paused);
  const indicator = paused ? 'paused' : 'running';

  return (
    <div
      data-controls-dock
      className="fixed bottom-4 left-2 right-2 z-40 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card/70 p-2 shadow-2xl backdrop-blur-md supports-[backdrop-filter]:bg-card/50 sm:left-auto sm:right-4 sm:flex-nowrap sm:justify-start"
    >
      <span
        aria-label={`Autonomous loop ${indicator}`}
        className="flex items-center gap-1.5 pl-2 pr-1 text-xs font-medium text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-2 w-2 rounded-full',
            paused ? 'bg-warning' : 'bg-success motion-safe:animate-pulse',
          )}
        />
        {indicator}
      </span>
      {paused ? (
        <Tooltip label="Resume autonomous loop" placement="top">
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={pending !== null}
            onClick={() => onAction('resume')}
            aria-label="Resume autonomous loop"
          >
            {pending === 'resume' ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span>Resume</span>
          </Button>
        </Tooltip>
      ) : (
        <Tooltip label="Pause autonomous loop" placement="top">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => onAction('pause')}
            aria-label="Pause autonomous loop"
          >
            {pending === 'pause' ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
            <span>Pause</span>
          </Button>
        </Tooltip>
      )}
      <Tooltip label="Force one dispatch tick" placement="top">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending !== null || paused}
          onClick={() => onAction('tick')}
          aria-label="Force autonomous tick"
        >
          {pending === 'tick' ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          <span>Tick</span>
        </Button>
      </Tooltip>
    </div>
  );
}

interface AutoProps {
  // Tests pass this so the count-up animation doesn't race assertions.
  // Default false keeps the live UI animated.
  noAnimation?: boolean;
}

export default function Auto({ noAnimation = false }: AutoProps = {}) {
  useLocale();

  const queueSlot = useFetchSlot<QueueResponse>('/api/autonomous/queue', 0);
  const statusSlot = useFetchSlot<AutonomousStatus>('/api/autonomous/status', 5000);
  const workersSlot = useFetchSlot<WorkerListResponse>('/api/list', 5000);

  // Refresh-anchor for relative-time strings so the dashboard does not
  // need to subscribe to a global ticker just to age out the "5m ago"
  // labels. Re-renders every 30s; the polled fetches above carry the
  // real data refresh on their 5s cadence.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const [pending, setPending] = useState<'pause' | 'resume' | 'tick' | null>(null);
  const inflightRef = useRef(false);

  const refreshAll = useCallback(() => {
    queueSlot.refresh();
    statusSlot.refresh();
    workersSlot.refresh();
  }, [queueSlot, statusSlot, workersSlot]);

  const handleAction = useCallback(
    async (action: 'pause' | 'resume' | 'tick') => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      setPending(action);
      try {
        await apiPost(`/api/autonomous/${action}`, {});
      } catch {
        // The next poll will surface the real state; controls dock is
        // best-effort and the timeline / status badge tell the truth.
      } finally {
        setPending(null);
        inflightRef.current = false;
        statusSlot.refresh();
      }
    },
    [statusSlot],
  );

  return (
    <>
      <PageFrame
        title="Autonomous dashboard"
        description="Live view of the autonomous dispatcher: queue, workers, timeline, controls."
        actions={
          <Tooltip label="Refresh all panels" placement="bottom">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={refreshAll}
              aria-label="Refresh all panels"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
          </Tooltip>
        }
      >
        <PageDescriptionBanner
          summaryKey="auto.summary"
          cliKey="auto.cli"
          exampleKey="auto.example"
          useCasesKey="auto.useCases"
          onOpenHelp={openHelpDrawer}
        />

        <HeroStats
          queue={queueSlot.state}
          status={statusSlot.state}
          now={now}
          noAnimation={noAnimation}
        />

        <DashboardGrid gap="md">
          <DashboardGrid.Item span="full" lgSpan={8}>
            <LiveQueueSection slot={queueSlot} />
          </DashboardGrid.Item>
          <DashboardGrid.Item span="full" lgSpan={4}>
            <TimelineSection
              status={statusSlot}
              queue={queueSlot.state}
              now={now}
            />
          </DashboardGrid.Item>
        </DashboardGrid>

        <WorkersStrip slot={workersSlot} now={now} />

        {statusSlot.state.kind === 'data' &&
        statusSlot.state.data.enabled === false ? (
          <Card>
            <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
              <CircleDashed
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              />
              <p>
                Autonomous dispatcher is currently disabled.
                {statusSlot.state.data.reason
                  ? ` ${statusSlot.state.data.reason}`
                  : ''}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </PageFrame>

      <ControlsDock
        status={statusSlot.state}
        onAction={handleAction}
        pending={pending}
      />
    </>
  );
}
