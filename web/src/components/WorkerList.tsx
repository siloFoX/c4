import { useMemo } from 'react';
import { Lightbulb, WifiOff } from 'lucide-react';
import type { Worker } from '../types';
import { useWorkerList } from '../lib/use-worker-list';
import { usePersistedBool } from '../lib/use-persisted-bool';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorState,
} from './ui';
import { NoWorkersIllustration } from './illustrations';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import WorkerListGroupHeader from './WorkerListGroupHeader';
import {
  groupOf,
  isInterventionActive,
  mapWorkerStatusToBadgeVariant,
  statusLabel,
} from '../lib/worker-classify';

// (v1.10.572) isInterventionActive / mapWorkerStatusToBadgeVariant /
// statusLabel / groupOf moved to ../lib/worker-classify.ts.

interface WorkerListProps {
  selectedWorker: string | null;
  onSelect: (name: string) => void;
}

// (v1.10.567) GroupHeader extracted to ./WorkerListGroupHeader.tsx

// (TODO 8.37) localStorage keys for the per-group expand/collapse
// state. Persist so the operator's preference survives reloads.
// (v1.10.690) Bool-persistence helpers consolidated into
// lib/use-persisted-bool.
const MGR_OPEN_KEY = 'c4.workerList.managers.open';
const WRK_OPEN_KEY = 'c4.workerList.workers.open';

export default function WorkerList({ selectedWorker, onSelect }: WorkerListProps) {
  useLocale();
  // (v1.10.660) /api/list poll + /api/events SSE moved to hook.
  const { workers, error, sseConnected } = useWorkerList();
  const [managersOpen, , toggleManagersOpen] = usePersistedBool(MGR_OPEN_KEY, true);
  const [workersOpen, , toggleWorkersOpen] = usePersistedBool(WRK_OPEN_KEY, true);

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
          'cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
          {/* Failure-pattern hint surface (failure-patterns module).
              Yellow alert with the suggested fix when daemon's
              list().failureHint matches one of the curated 13
              patterns (ENOSPC, ESLint, OOM, port collision, …).
              Sample text goes into the title attribute as a tooltip. */}
          {w.failureHint && (
            <div
              className="mt-2 flex items-start gap-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning-foreground"
              title={w.failureHint.sample || ''}
            >
              <Lightbulb size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-semibold">
                  {w.failureHint.label}
                  {w.failureHint.count > 1 && (
                    <span className="ml-1 text-[10px] opacity-80">
                      ×{w.failureHint.count}
                    </span>
                  )}
                </div>
                <div className="text-foreground/85">{w.failureHint.hint}</div>
              </div>
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
          <span>{t('workerList.disconnected')}</span>
        </div>
      )}

      {error && (
        <ErrorState
          title={tFormat('workerList.failedToLoad', { error: error || '' })}
          className="p-3 text-left"
        />
      )}

      {!error && workers.length === 0 && (
        <EmptyState
          icon={
            <NoWorkersIllustration
              className="text-muted-foreground"
              size={160}
            />
          }
          title={t('workerList.empty')}
          className="p-4"
        />
      )}

      {/* (TODO 8.37) Managers group — only renders when there's at
          least one manager to avoid a permanently empty section.
          (review fix 2026-05-01) The controlled `worker-group-*`
          panel renders unconditionally with the native `hidden`
          attribute toggling visibility, so the GroupHeader's
          `aria-controls={id}` never points at a missing element. */}
      {managers.length > 0 && (
        <div className="space-y-1">
          <WorkerListGroupHeader
            open={managersOpen}
            onToggle={toggleManagersOpen}
            label={t('workerList.group.managers')}
            count={managers.length}
            icon="crown"
            accent="primary"
          />
          <div
            id="worker-group-managers"
            className="space-y-2"
            hidden={!managersOpen}
          >
            {managers.map((w) => renderRow(w, 'primary'))}
          </div>
        </div>
      )}

      {/* (TODO 8.37) Workers group — only renders when there's at
          least one worker. Always-visible header would be confusing
          when there's a single bucket. Same `hidden`-attribute
          ARIA fix as Managers group above. */}
      {regular.length > 0 && (
        <div className="space-y-1">
          <WorkerListGroupHeader
            open={workersOpen}
            onToggle={toggleWorkersOpen}
            label={t('workerList.group.workers')}
            count={regular.length}
            icon="wrench"
            accent="muted"
          />
          <div
            id="worker-group-workers"
            className="space-y-2"
            hidden={!workersOpen}
          >
            {regular.map((w) => renderRow(w, 'muted'))}
          </div>
        </div>
      )}
    </div>
  );
}
