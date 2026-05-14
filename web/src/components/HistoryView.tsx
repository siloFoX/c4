import { useCallback, useState } from 'react';
import {
  History as HistoryIcon,
  NotebookText,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { t, tFormat, useLocale } from '../lib/i18n';
import {
  Badge,
  BulkActionToolbar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ColumnPicker,
  DateRangePicker,
  ExportButton,
  Input,
  Select,
  VirtualList,
} from './ui';
import { parseISODate, toISODate } from '../lib/date-format';
import { cn } from '../lib/cn';
import HistoryDetailPane from './HistoryDetailPane';
import { useScribeContext } from '../lib/use-scribe-context';
import { useHistoryWorkerDetail } from '../lib/use-history-worker-detail';
import { useHistorySummary } from '../lib/use-history-summary';

export interface HistoryCommit {
  hash: string;
  message: string;
}

export interface HistoryRecord {
  name: string | null;
  task: string | null;
  branch: string | null;
  startedAt: string | null;
  completedAt: string | null;
  commits: HistoryCommit[];
  status: string | null;
}

export interface HistoryWorkerSummary {
  name: string;
  taskCount: number;
  firstTaskAt: string | null;
  lastTaskAt: string | null;
  lastTask: string | null;
  lastStatus: string | null;
  branches: string[];
  alive: boolean;
  liveStatus: string | null;
}

export interface HistoryListResponse {
  records: HistoryRecord[];
  workers: HistoryWorkerSummary[];
  total: number;
}

export interface HistoryScrollback {
  content: string;
  lines: number;
  totalScrollback: number;
}

export interface HistoryWorkerDetail {
  name: string;
  records: HistoryRecord[];
  alive: boolean;
  status: string | null;
  branch: string | null;
  worktree: string | null;
  scrollback: HistoryScrollback | null;
}

// (v1.10.650) ScribeContextResponse + scribe drawer hook
// moved to lib/use-scribe-context.

// (v1.10.652) toIsoDayStart/End + summary fetch moved to
// lib/use-history-summary.

// (v1.10.564) formatDate + recordStatusVariant moved to
// ./HistoryDetailPane.tsx (the only place that uses them).

export default function HistoryView() {
  useLocale();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sinceDay, setSinceDay] = useState('');
  const [untilDay, setUntilDay] = useState('');
  const [error, setError] = useState<string | null>(null);
  // (v1.10.652) Summary fetch + ISO day widening moved to hook.
  const { summary } = useHistorySummary({
    query, statusFilter, sinceDay, untilDay, setError,
  });
  // (v1.10.650) Scribe drawer state + fetch moved to hook.
  const { showScribe, scribe, loadingScribe, openScribe, closeScribe } =
    useScribeContext({ setError });

  // (v1.10.651) Per-worker detail fetch moved to hook.
  const detail = useHistoryWorkerDetail({ selected, setError });

  const selectWorker = useCallback((name: string) => {
    closeScribe();
    setSelected(name);
  }, [closeScribe]);

  // (11.192) ColumnPicker controls which sidebar summary fields render
  // per row. 'name' is always visible.
  const [visibleCols, setVisibleCols] = useState<string[]>(() => [
    'name',
    'status',
    'branch',
    'taskCount',
    'lastTaskAt',
  ]);
  const visibleColSet = new Set(visibleCols);

  // (11.191) Bulk selection - shift/meta+click toggles membership.
  const [bulk, setBulk] = useState<Set<string>>(() => new Set());
  const toggleBulk = useCallback((name: string) => {
    setBulk((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);
  const clearBulk = useCallback(() => setBulk(new Set()), []);
  const deleteBulk = useCallback(() => {
    // Placeholder: no backend delete wired.
    clearBulk();
  }, [clearBulk]);

  const activeSection: 'scribe' | 'detail' | 'placeholder' = showScribe
    ? 'scribe'
    : detail
      ? 'detail'
      : 'placeholder';

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <aside className="w-full shrink-0 overflow-y-auto border-b border-border bg-card p-4 md:w-80 md:border-b-0 md:border-r">
        <Card className="border-none bg-transparent shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-2 p-0">
            <div className="flex items-center gap-2">
              <HistoryIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                {t('history.sidebar.title')}
              </CardTitle>
            </div>
            <div className="flex items-center gap-1">
              {/* (11.190) ExportButton adoption: download visible history
                  workers as CSV/JSON. */}
              <ColumnPicker
                columns={[
                  { id: 'name', label: 'Name', alwaysVisible: true },
                  { id: 'status', label: 'Status' },
                  { id: 'branch', label: 'Branch' },
                  { id: 'taskCount', label: 'Tasks' },
                  { id: 'lastTaskAt', label: 'Last task' },
                ]}
                value={visibleCols}
                onChange={setVisibleCols}
                storageKey="c4:history:columns"
              />
              <ExportButton
                rows={summary as unknown[]}
                columns={[
                  { key: 'name', header: 'Worker' },
                  { key: 'taskCount', header: 'Tasks' },
                  { key: 'lastTaskAt', header: 'Last Task' },
                  { key: 'lastStatus', header: 'Status' },
                  { key: 'lastTask', header: 'Last' },
                ]}
                filename="history"
                disabled={summary.length === 0}
              />
              <Button
                type="button"
                variant={showScribe ? 'default' : 'secondary'}
                size="sm"
                onClick={openScribe}
                aria-pressed={showScribe}
                data-active={showScribe ? 'true' : 'false'}
              >
                <NotebookText className="h-3.5 w-3.5" />
                <span>
                  {t('history.sidebar.scribeButton')}
                </span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-0 pt-3">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('history.search.placeholder')}
                className="h-9 pl-8 text-sm"
                aria-label={t('history.search.label')}
              />
            </div>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel={t('history.filter.status.label')}
              options={[
                { value: '', label: t('history.filter.status.all') },
                { value: 'closed', label: t('history.filter.status.closed') },
                { value: 'exited', label: t('history.filter.status.exited') },
              ]}
            />
            {/* (11.176) DateRangePicker primitive adoption.
                Replaces the prior pair of <Input type="date"> filters.
                Internal state remains YYYY-MM-DD strings so the
                summary hook contract is unchanged. */}
            <DateRangePicker
              value={{
                from: parseISODate(sinceDay),
                to: parseISODate(untilDay),
              }}
              onChange={(r) => {
                setSinceDay(toISODate(r.from));
                setUntilDay(toISODate(r.to));
              }}
              ariaLabel={t('history.filter.range.label')}
              className="text-xs"
            />
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              >
                {error}
              </div>
            )}
            {summary.length === 0 && !error && (
              <div className="text-xs text-muted-foreground">{t('history.empty')}</div>
            )}
            {(() => {
              // (v1.11.197) patch 11.179 - VirtualList primitive adoption.
              // Sidebar summary list virtualizes so >1k workers render
              // O(viewport) rows instead of O(N). itemHeight=64 covers
              // the badge row + meta row + space-y-1 gap.
              const filtered = query
                ? summary.filter((w) => {
                    const needle = query.toLowerCase();
                    if (w.name.toLowerCase().includes(needle)) return true;
                    if (w.lastTask && w.lastTask.toLowerCase().includes(needle)) return true;
                    if (w.branches.some((b) => b.toLowerCase().includes(needle))) return true;
                    return false;
                  })
                : summary;
              return (
                <VirtualList
                  items={filtered}
                  itemHeight={64}
                  height="60vh"
                  getKey={(w) => w.name}
                  ariaLabel={t('history.sidebar.title')}
                  className="pr-1"
                  renderItem={(w) => {
                    const isSelected = !showScribe && selected === w.name;
                    const isBulkSelected = bulk.has(w.name);
                    return (
                      <button
                        type="button"
                        onClick={(e) => {
                          if (e.shiftKey || e.metaKey || e.ctrlKey) {
                            toggleBulk(w.name);
                            return;
                          }
                          selectWorker(w.name);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          toggleBulk(w.name);
                        }}
                        aria-pressed={isSelected}
                        className={cn(
                          'w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors',
                          isSelected
                            ? 'bg-accent text-accent-foreground ring-1 ring-ring'
                            : 'bg-muted/30 text-foreground hover:bg-muted',
                          isBulkSelected && 'ring-2 ring-primary',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{w.name}</span>
                          {visibleColSet.has('status') && (
                            <Badge
                              variant={w.alive ? 'success' : 'secondary'}
                              className="shrink-0 text-[10px] uppercase"
                            >
                              {w.alive ? w.liveStatus || 'live' : 'closed'}
                            </Badge>
                          )}
                        </div>
                        {visibleColSet.has('branch') && w.branches.length > 0 && (
                          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                            {w.branches[0]}
                          </div>
                        )}
                        {(visibleColSet.has('taskCount') || visibleColSet.has('lastTaskAt')) && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {visibleColSet.has('taskCount') && tFormat(w.taskCount === 1 ? 'history.taskCount.singular' : 'history.taskCount.plural', { count: w.taskCount })}
                            {visibleColSet.has('lastTaskAt') && w.lastTaskAt ? ` - ${w.lastTaskAt.slice(0, 10)}` : ''}
                          </div>
                        )}
                      </button>
                    );
                  }}
                />
              );
            })()}
          </CardContent>
        </Card>
      </aside>

      <main
        key={activeSection}
        data-section={activeSection}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 md:p-6"
      >
        {showScribe ? (
          <Card className="flex h-full min-h-0 min-w-0 flex-col">
            <CardHeader className="flex-row items-center justify-between gap-2 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <NotebookText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                <CardTitle>{t('history.scribe.title')}</CardTitle>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={closeScribe}>
                <X className="h-3.5 w-3.5" />
                <span>{t('common.close')}</span>
              </Button>
            </CardHeader>
            <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
              {loadingScribe ? (
                <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
              ) : !scribe ? (
                <div className="text-sm text-muted-foreground">
                  {t('history.scribe.openHint')}
                </div>
              ) : !scribe.exists ? (
                <div className="text-sm text-muted-foreground">
                  {tFormat('history.scribe.missing', { path: scribe.path })}
                </div>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground">
                    {scribe.path} - {scribe.size} bytes
                    {scribe.updatedAt ? ` - updated ${scribe.updatedAt}` : ''}
                    {scribe.truncated ? ` - ${t('history.scribe.tailTruncated')}` : ''}
                  </div>
                  <pre tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs text-foreground">
                    {scribe.content}
                  </pre>
                </>
              )}
            </CardContent>
          </Card>
        ) : detail ? (
          <HistoryDetailPane detail={detail} />
        ) : (
          <Card>
            <CardHeader className="p-4 md:p-5">
              <CardTitle>{t('history.workerHistory.title')}</CardTitle>
              <CardDescription>
                {t('history.workerHistory.description')}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>
      <BulkActionToolbar
        selectedCount={bulk.size}
        onClearSelection={clearBulk}
        ariaLabel="History bulk actions"
        actions={[
          {
            id: 'delete',
            label: 'Delete selected',
            icon: <Trash2 className="h-3.5 w-3.5" />,
            tone: 'danger',
            onClick: deleteBulk,
          },
        ]}
      />
    </div>
  );
}

// (v1.10.564) HistoryDetailPane extracted to ./HistoryDetailPane.tsx
