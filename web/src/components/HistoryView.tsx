import { useCallback, useRef, useState } from 'react';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  History as HistoryIcon,
  NotebookText,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { t, tFormat, useLocale } from '../lib/i18n';
import {
  AvatarGroup,
  BulkActionToolbar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ColumnPicker,
  DateRangePicker,
  EmptyState,
  ExportButton,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  StatusPill,
  StickyFilterBar,
  Tooltip,
  UndoToast,
} from './ui';
import { parseISODate, toISODate } from '../lib/date-format';
import { cn } from '../lib/cn';
import HistoryDetailPane from './HistoryDetailPane';
import { useScribeContext } from '../lib/use-scribe-context';
import { useHistoryWorkerDetail } from '../lib/use-history-worker-detail';
import { useHistorySummary } from '../lib/use-history-summary';
import { useListVirtualizer } from '../hooks/use-list-virtualizer';
import { useScrollRestoration } from '../hooks/use-scroll-restoration';
import { useTableSort } from '../hooks/use-table-sort';
import { useUndoToast } from '../hooks/use-undo-toast';
import { SearchEmpty } from './illustrations';

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

// (v1.11.258, TODO 11.240) Sidebar sort comparator. Exported so
// the test file can verify the ordering without rendering the
// whole HistoryView tree. Three keys cover the questions the
// operator actually asks of the sidebar: which worker has the
// most recent activity (lastTaskAt), which name should I scroll
// to (alphabetical), and which worker has the most history depth
// (taskCount).
export type HistorySidebarSortKey = 'name' | 'lastTaskAt' | 'taskCount';

export function historySidebarComparator(
  key: HistorySidebarSortKey,
  dir: 'asc' | 'desc',
): (a: HistoryWorkerSummary, b: HistoryWorkerSummary) => number {
  const mult = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    if (key === 'name') {
      const av = a.name.toLowerCase();
      const bv = b.name.toLowerCase();
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return 0;
    }
    if (key === 'taskCount') {
      return (a.taskCount - b.taskCount) * mult;
    }
    // lastTaskAt: null sorts last regardless of direction so the
    // never-active workers never crowd the top of the operator's
    // view.
    const ax = a.lastTaskAt;
    const bx = b.lastTaskAt;
    if (ax === null && bx === null) return 0;
    if (ax === null) return 1;
    if (bx === null) return -1;
    if (ax < bx) return -1 * mult;
    if (ax > bx) return 1 * mult;
    return 0;
  };
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

  // (v1.11.258, TODO 11.240) Sidebar sort persistence via
  // useTableSort. Default = lastTaskAt desc (most-recent-activity
  // first) so first-load matches the prior server-supplied order.
  // Operator can flip to name (alphabetical) or taskCount (history
  // depth) and the choice survives reload / route switch.
  const {
    sortKey: sidebarSortKey,
    sortDir: sidebarSortDir,
    onSortChange: setSidebarSort,
  } = useTableSort<HistorySidebarSortKey>('history-sidebar', {
    key: 'lastTaskAt',
    dir: 'desc',
  });
  const toggleSidebarSortDir = useCallback(() => {
    if (!sidebarSortKey) return;
    setSidebarSort(sidebarSortKey, sidebarSortDir === 'asc' ? 'desc' : 'asc');
  }, [sidebarSortKey, sidebarSortDir, setSidebarSort]);

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
  // (v1.11.262, TODO 11.244) Bulk delete now flows through
  // useUndoToast. The delete is still a placeholder (no backend
  // wired -- only the UI selection clears), but the operator now
  // sees a 5s undo window with a countdown progress bar before the
  // selection is finalised. onUndo restores the previously-selected
  // names; onCommit no-ops because the placeholder has no backend.
  const lastBulkRef = useRef<Set<string> | null>(null);
  const { active: bulkUndoActive, showUndo: showBulkUndo } = useUndoToast();
  const deleteBulk = useCallback(() => {
    if (bulk.size === 0) return;
    const snap = new Set(bulk);
    lastBulkRef.current = snap;
    clearBulk();
    showBulkUndo({
      message: `Removed ${snap.size} worker${snap.size === 1 ? '' : 's'} from selection.`,
      onCommit: () => {
        lastBulkRef.current = null;
      },
      onUndo: () => {
        const cached = lastBulkRef.current;
        lastBulkRef.current = null;
        if (cached) setBulk(cached);
      },
    });
  }, [bulk, clearBulk, showBulkUndo]);

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
            {/* (v1.11.261, TODO 11.243) Sticky filter row. Pins
                the search + status + sort + date controls to the
                top of the <aside> scroll container so they stay
                visible while the operator scrolls through long
                history lists. Scroll-shadow elevates the bar
                once pinned. */}
            <StickyFilterBar
              data-testid="history-sidebar-sticky"
              className="-mx-4 flex flex-col gap-2 px-4 py-2"
            >
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
            {/* (v1.11.258, TODO 11.240) Sidebar sort. Persisted via
                useTableSort('history-sidebar'); default = lastTaskAt
                desc which matches the prior implicit order. */}
            <div
              className="flex items-center gap-1"
              data-testid="history-sidebar-sort"
            >
              <Select
                value={sidebarSortKey ?? 'lastTaskAt'}
                onChange={(v) =>
                  setSidebarSort(
                    v as HistorySidebarSortKey,
                    sidebarSortDir ?? 'desc',
                  )
                }
                ariaLabel={t('history.sort.label') || 'Sort sidebar'}
                options={[
                  { value: 'lastTaskAt', label: 'Last task' },
                  { value: 'name', label: 'Name' },
                  { value: 'taskCount', label: 'Task count' },
                ]}
                className="flex-1"
              />
              <Tooltip label={sidebarSortDir === 'asc' ? 'Ascending' : 'Descending'}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleSidebarSortDir}
                  aria-label={
                    sidebarSortDir === 'asc'
                      ? 'Toggle to descending'
                      : 'Toggle to ascending'
                  }
                  data-testid="history-sidebar-sort-dir"
                  data-sort-dir={sidebarSortDir ?? 'desc'}
                >
                  {sidebarSortDir === 'asc' ? (
                    <ArrowUpAZ className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownAZ className="h-3.5 w-3.5" />
                  )}
                </Button>
              </Tooltip>
            </div>
            {/* (v1.11.276, TODO 11.258) SegmentedControl quick-range
                chips above the DateRangePicker. Snaps `sinceDay` to
                a window ending today; "All" clears both ends. Active
                chip is derived from the current since/until pair so
                manual edits inside DateRangePicker deselect the chip
                rather than fighting it. */}
            <div
              className="flex items-center gap-1.5"
              data-testid="history-sidebar-quickrange-row"
            >
              <SegmentedControl<'24h' | '7d' | '30d' | 'all'>
                data-testid="history-sidebar-quickrange"
                ariaLabel="Quick range"
                size="sm"
                value={(() => {
                  if (!sinceDay && !untilDay) return 'all';
                  const today = toISODate(new Date());
                  const since = sinceDay ?? '';
                  const until = untilDay ?? '';
                  if (until && until !== today) return 'all';
                  const d24 = toISODate(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000));
                  const d7 = toISODate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
                  const d30 = toISODate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
                  if (since === d24) return '24h';
                  if (since === d7) return '7d';
                  if (since === d30) return '30d';
                  return 'all';
                })()}
                onChange={(v) => {
                  if (v === 'all') {
                    setSinceDay('');
                    setUntilDay('');
                    return;
                  }
                  const today = toISODate(new Date());
                  const daysAgo =
                    v === '24h' ? 1 : v === '7d' ? 7 : 30;
                  const since = toISODate(
                    new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
                  );
                  setSinceDay(since);
                  setUntilDay(today);
                }}
                options={[
                  { value: '24h', label: '24h' },
                  { value: '7d', label: '7d' },
                  { value: '30d', label: '30d' },
                  { value: 'all', label: 'All' },
                ]}
              />
            </div>
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
            </StickyFilterBar>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              >
                {error}
              </div>
            )}
            {summary.length === 0 && !error && (
              <EmptyState
                size="sm"
                illustration="no-workers"
                title={t('history.empty')}
                description="No workers have completed tasks in the selected date range yet."
                secondaryAction={{
                  label: 'Browse archived workers',
                  href: '#feature=cleanup',
                }}
                data-testid="history-empty-state"
              />
            )}
            {summary.length > 0 && !error ? (
              /* (v1.11.272, TODO 11.254) AvatarGroup roster
                 preview at the top of the sidebar gives operators
                 a single-glance "who's in this list" view without
                 scrolling the virtualized worker rows below. */
              <div
                className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground"
                data-testid="history-sidebar-roster"
              >
                <AvatarGroup
                  items={summary.map((w) => ({ name: w.name }))}
                  max={6}
                  size="sm"
                />
                <span>
                  {summary.length} {summary.length === 1 ? 'worker' : 'workers'}
                </span>
              </div>
            ) : null}
            {(() => {
              // (v1.11.227 / patch 11.209) Sidebar summary list now
              // virtualizes through the dedicated `useListVirtualizer`
              // hook (replaces the v1.11.197 VirtualList primitive
              // adoption). itemHeight=64 covers the badge row + meta
              // row + space-y-1 gap; the hook's `containerProps` wires
              // scroll handling onto the outer scrollable div, and the
              // inner spacer (`totalHeight`) keeps the native scrollbar
              // honest for >1k workers.
              const filtered = query
                ? summary.filter((w) => {
                    const needle = query.toLowerCase();
                    if (w.name.toLowerCase().includes(needle)) return true;
                    if (w.lastTask && w.lastTask.toLowerCase().includes(needle)) return true;
                    if (w.branches.some((b) => b.toLowerCase().includes(needle))) return true;
                    return false;
                  })
                : summary;
              // (v1.11.258, TODO 11.240) Apply operator-local sort
              // after filtering so the sort outcome doesn't change
              // the set of rows the search query matches.
              const sorted =
                sidebarSortKey && sidebarSortDir
                  ? [...filtered].sort(
                      historySidebarComparator(
                        sidebarSortKey as HistorySidebarSortKey,
                        sidebarSortDir,
                      ),
                    )
                  : filtered;
              if (query && sorted.length === 0) {
                return (
                  <div
                    className="flex flex-col items-center gap-2 py-6 text-center text-xs text-muted-foreground"
                    data-testid="history-search-empty"
                  >
                    <SearchEmpty className="text-muted-foreground" />
                    <div>{t('history.empty')}</div>
                  </div>
                );
              }
              return (
                <SidebarVirtualizedList
                  filtered={sorted}
                  selected={selected}
                  showScribe={showScribe}
                  bulk={bulk}
                  visibleColSet={visibleColSet}
                  selectWorker={selectWorker}
                  toggleBulk={toggleBulk}
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
                // (v1.11.273, TODO 11.255) Replaces the plain
                // "Loading..." text with a Skeleton.List that
                // mocks the scribe-context line layout (no
                // avatar, 2 lines per row). The shimmer respects
                // useReducedMotion via the shared loading-motion
                // contract.
                <Skeleton.List
                  rows={4}
                  data-testid="history-scribe-loading"
                />
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
      {bulkUndoActive ? (
        <UndoToast
          active={bulkUndoActive}
          data-testid="history-bulk-undo"
        />
      ) : null}
    </div>
  );
}

// (v1.11.227 / patch 11.209) Sidebar summary virtualization extracted
// into its own component so the `useListVirtualizer` adoption stays
// readable inside HistoryView's already-dense render tree.
interface SidebarVirtualizedListProps {
  filtered: HistoryWorkerSummary[];
  selected: string | null;
  showScribe: boolean;
  bulk: Set<string>;
  visibleColSet: Set<string>;
  selectWorker: (name: string) => void;
  toggleBulk: (name: string) => void;
}

const SIDEBAR_ITEM_HEIGHT = 64;

function SidebarVirtualizedList({
  filtered,
  selected,
  showScribe,
  bulk,
  visibleColSet,
  selectWorker,
  toggleBulk,
}: SidebarVirtualizedListProps) {
  const { items, totalHeight, offsetY, containerProps } = useListVirtualizer({
    itemCount: filtered.length,
    itemHeight: SIDEBAR_ITEM_HEIGHT,
  });
  // (11.217) Persist + restore scrollTop across navigations so
  // re-entering the History view lands the operator back where they
  // were rather than at the top of a 1k-row sidebar.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollRestoration({
    containerRef: scrollRef,
    storageKey: 'history:sidebar',
  });
  return (
    <div
      ref={scrollRef}
      role="list"
      aria-label={t('history.sidebar.title')}
      className="pr-1 overflow-auto"
      style={{ ...containerProps.style, height: '60vh' }}
      onScroll={containerProps.onScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {items.map(({ index }) => {
            const w = filtered[index];
            if (!w) return null;
            const isSelected = !showScribe && selected === w.name;
            const isBulkSelected = bulk.has(w.name);
            return (
              <div
                key={w.name}
                role="listitem"
                style={{ height: SIDEBAR_ITEM_HEIGHT }}
              >
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
                      /* (v1.11.278, TODO 11.260) Per-row Badge
                         migrated to StatusPill. Worker liveness
                         maps as: alive + busy liveStatus -> busy,
                         alive otherwise -> online (with pulse for
                         active state), closed -> offline. */
                      <StatusPill
                        status={
                          w.alive
                            ? w.liveStatus === 'busy'
                              ? 'busy'
                              : 'online'
                            : 'offline'
                        }
                        size="sm"
                        pulse={w.alive}
                        label={w.alive ? w.liveStatus || 'live' : 'closed'}
                        data-testid={`history-row-status-${w.name}`}
                      />
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// (v1.10.564) HistoryDetailPane extracted to ./HistoryDetailPane.tsx
