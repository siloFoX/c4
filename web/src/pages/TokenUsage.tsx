import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageFrame, { EmptyPanel, LoadingSkeleton } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import {
  Badge,
  Button,
  ColumnPicker,
  CopyButton,
  DataList,
  ErrorState,
  ExportButton,
  Pagination,
  Panel,
  ProgressBar,
  ScrollArea,
  SegmentedControl,
  Sparkline,
  Switch,
  Table,
  Tooltip,
} from '../components/ui';
import type { DataListItem, TableColumn } from '../components/ui';
import { useTokenUsage } from '../lib/use-token-usage';
import { useTokenUsageBreakdowns, coerceTotal } from '../lib/use-token-usage-breakdowns';
import { dateRange } from '../lib/format';
import { useLocalizedFormatters } from '../lib/format-locale';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useTableSort } from '../hooks/use-table-sort';

// 8.20B Token usage. Calls GET /api/token-usage (with optional
// ?perTask=1) and renders:
//   * per-worker bar chart across the selected date window
//   * per-day stacked bars
//   * a tier-quota snapshot (GET /api/quota) with daily caps
// Implemented without a charting library -- bars are simple divs with
// widths proportional to the maximum value so the bundle stays small.

// (v1.10.656) PerTaskEntry / TokenUsagePayload /
// QuotaTierSnapshot / QuotaPayload + the data + quota
// fetch moved to lib/use-token-usage.

const DAY_OPTIONS = [1, 7, 30, 90] as const;
type DayOption = (typeof DAY_OPTIONS)[number];
const DAY_OPTION_VALUES = DAY_OPTIONS.map((d) => String(d)) as `${DayOption}`[];

// (v1.11.341, TODO 11.323) Period selector keys. Extends the
// numeric DAY_OPTION_VALUES with the synthetic 'all' value
// which collapses the date filter (passes a 100-year window
// to dateRange) so the operator can see every recorded day
// regardless of age.
const PERIOD_OPTION_VALUES = [...DAY_OPTION_VALUES, 'all'] as const;
type PeriodOption = (typeof PERIOD_OPTION_VALUES)[number];

// Effective day count for each period. 'all' maps to 36500
// (~100 years) so dateRange's start cutoff is well before
// any real recorded day.
const PERIOD_TO_DAYS: Record<PeriodOption, number> = {
  '1': 1,
  '7': 7,
  '30': 30,
  '90': 90,
  all: 36500,
};

// (v1.10.695) coerceTotal + perWorker / perDay memos
// moved to lib/use-token-usage-breakdowns.

export default function TokenUsage() {
  useLocale();
  // (v1.11.364, TODO 11.346) Locale-aware integer
  // formatter for the per-period totals + per-row
  // values. Replaces the locale-agnostic
  // `formatNumber` from lib/format.
  const fmt = useLocalizedFormatters();
  // (v1.11.341, TODO 11.323) Period state now lives in
  // PeriodOption (string) so the new 'all' choice composes
  // with the numeric day values without a separate branch.
  // `days` is derived for the breakdown hook + the
  // "last N days" description copy.
  const [period, setPeriod] = useState<PeriodOption>('7');
  const days = PERIOD_TO_DAYS[period];
  const [perTask, setPerTask] = useState<boolean>(false);
  const [perTaskPage, setPerTaskPage] = useState(1);
  // (v1.10.656) Token-usage + quota fetch moved to hook.
  const { data, quota, loading, error, refresh } = useTokenUsage({ perTask });

  const range = useMemo(() => dateRange(days), [days]);

  // (v1.10.695) Per-worker / per-day breakdowns moved to hook.
  const { perWorker, perDay, workerMax, dayMax } = useTokenUsageBreakdowns({
    data,
    rangeStart: range.start,
    rangeEnd: range.end,
  });

  return (
    <PageFrame
      title={t('tokenUsagePage.title')}
      description={t('tokenUsagePage.description')}
      actions={
        <>
          {/* (v1.11.276, TODO 11.258) SegmentedControl adoption: the
              day-range scope (Today / Last 7 / Last 30 / Last 90)
              is exactly the "3-5 short choices" pill-control shape.
              Replaces 4x Button + Tooltip wrappers with a single
              tablist that handles arrow-key nav + roving tabindex. */}
          {/* (v1.11.294, TODO 11.276) Workers metric chip
              tooltip now opts into the new arrow + separate
              hide-delay so quick toggle scans across the four
              range chips do not flicker. */}
          <Tooltip
            label={t('tokenUsage.tooltip.days')}
            arrow
            showDelay={150}
            hideDelay={80}
          >
            <SegmentedControl<PeriodOption>
              data-testid="token-usage-range"
              ariaLabel={t('tokenUsage.range.label')}
              size="sm"
              value={period}
              options={PERIOD_OPTION_VALUES.map((pv) => {
                if (pv === 'all') {
                  return { value: pv, label: 'All time' };
                }
                const d = Number(pv) as DayOption;
                return {
                  value: pv,
                  label:
                    d === 1 ? t('tokenUsage.range.today')
                    : d === 7 ? t('tokenUsage.range.last7')
                    : d === 30 ? t('tokenUsage.range.last30')
                    : d === 90 ? t('tokenUsage.range.last90')
                    : tFormat('tokenUsage.range.lastN', { days: d }),
                };
              })}
              onChange={(v) => setPeriod(v)}
            />
          </Tooltip>
          <Tooltip label={t('tokenUsage.tooltip.perTask')}>
            <Switch
              checked={perTask}
              onChange={setPerTask}
              label={t('tokenUsagePage.perTask')}
            />
          </Tooltip>
          {/* (11.190) ExportButton adoption: download per-worker token
              totals over the current window. */}
          <ExportButton
            rows={perWorker as unknown[]}
            columns={[
              { key: 'name', header: 'Worker' },
              { key: 'total', header: 'Total' },
            ]}
            filename="token-usage"
            disabled={perWorker.length === 0}
          />
          <Tooltip label={t('tokenUsage.tooltip.refresh')}>
            <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">{t('common.srOnlyRefresh')}</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="tokenUsage.summary"
        cliKey="tokenUsage.cli"
        exampleKey="tokenUsage.example"
        useCasesKey="tokenUsage.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {loading && !data ? <LoadingSkeleton rows={4} /> : null}
      {error && (
        /* (v1.11.341, TODO 11.323) ErrorState replaces the
           plain ErrorPanel banner. Retry button wires to the
           hook's refresh callback so the operator can recover
           without flipping to the header. role="alert" from
           the underlying primitive is preserved so prior
           `getByRole('alert')` assertions still hold. */
        <ErrorState
          title="Could not load /api/token-usage"
          description="The daemon returned an error. Retry to re-fetch."
          error={error}
          onRetry={() => {
            void refresh();
          }}
          data-testid="token-usage-error-state"
        />
      )}
      {data && (
        <div className="grid grid-cols-1 gap-3">
          <Panel className="p-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('tokenUsagePage.total')}</span>
              <span className="font-mono text-xl text-foreground">
                {fmt.integer(data.total)}
              </span>
              {data.totalInput != null && (
                <span className="text-xs text-muted-foreground">
                  {t('tokenUsagePage.input')} {fmt.integer(data.totalInput)}
                </span>
              )}
              {data.totalOutput != null && (
                <span className="text-xs text-muted-foreground">
                  {t('tokenUsagePage.output')} {fmt.integer(data.totalOutput)}
                </span>
              )}
            </div>
          </Panel>

          {/* (v1.11.341, TODO 11.323) DataList breakdown of
              the token totals + derived per-window averages.
              Sits beside the main Total panel so the operator
              has a single place to scan the headline numbers
              instead of mixing total / input / output / avgs
              across the page. Empty hook breakdowns collapse
              the avg rows to "-" rather than rendering
              spurious zeros. */}
          <Panel
            className="p-3"
            data-testid="token-usage-breakdown-panel"
          >
            <DataList
              items={[
                {
                  id: 'total',
                  label: t('tokenUsagePage.total'),
                  value: fmt.integer(data.total),
                },
                ...(data.totalInput != null
                  ? [
                      {
                        id: 'input',
                        label: t('tokenUsagePage.input'),
                        value: fmt.integer(data.totalInput),
                      } satisfies DataListItem,
                    ]
                  : []),
                ...(data.totalOutput != null
                  ? [
                      {
                        id: 'output',
                        label: t('tokenUsagePage.output'),
                        value: fmt.integer(data.totalOutput),
                      } satisfies DataListItem,
                    ]
                  : []),
                {
                  id: 'avg-per-day',
                  label: 'Avg / day',
                  value:
                    perDay.length > 0
                      ? fmt.integer(
                          Math.round(
                            perDay.reduce((a, e) => a + e.total, 0) /
                              perDay.length,
                          ),
                        )
                      : '-',
                },
                {
                  id: 'avg-per-worker',
                  label: 'Avg / worker',
                  value:
                    perWorker.length > 0
                      ? fmt.integer(
                          Math.round(
                            perWorker.reduce((a, e) => a + e.total, 0) /
                              perWorker.length,
                          ),
                        )
                      : '-',
                },
                {
                  id: 'period',
                  label: 'Period',
                  value: period === 'all' ? 'All time' : `Last ${days} day${days === 1 ? '' : 's'}`,
                },
              ]}
            />
          </Panel>

          <Panel
            title={tFormat('tokenUsagePage.byWorker', { n: String(perWorker.length) })}
            description={`Aggregated token totals per worker over the last ${days} day${days === 1 ? '' : 's'}.`}
            className="p-3"
          >
            {perWorker.length === 0 ? (
              <EmptyPanel message={t('tokenUsage.empty')} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {perWorker.map((e) => (
                  <li key={e.name} className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0 truncate font-mono text-foreground">
                      {e.name}
                    </span>
                    <Bar value={e.total} max={workerMax} />
                    <span className="w-20 shrink-0 text-right font-mono text-muted-foreground">
                      {fmt.integer(e.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={tFormat('tokenUsagePage.byDay', { n: String(perDay.length) })} className="p-3">
            {perDay.length === 0 ? (
              <EmptyPanel message={t('tokenUsagePage.byDay.empty')} />
            ) : (
              <>
                {/* (v1.11.279, TODO 11.261) Sparkline header
                    summary: the per-day series is a real time
                    trend so the operator can see the shape of the
                    window (spiking / flat / decaying) before
                    scanning the bar rows below. */}
                <div
                  className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground"
                  data-testid="token-usage-by-day-sparkline"
                >
                  <span className="font-medium uppercase tracking-wide">
                    Trend
                  </span>
                  <Sparkline
                    data={perDay.map((e) => e.total)}
                    variant="info"
                    size="lg"
                    width="100%"
                    showDots
                    showLastValue
                    lastValueFormatter={fmt.integer}
                    className="flex-1"
                    ariaLabel={`Daily token totals trend across ${perDay.length} days`}
                  />
                </div>
                <ul className="flex flex-col gap-1.5">
                  {perDay.map((e) => (
                    <li key={e.date} className="flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 font-mono text-foreground">
                        {e.date}
                      </span>
                      <Bar value={e.total} max={dayMax} tone="accent" />
                      <span className="w-20 shrink-0 text-right font-mono text-muted-foreground">
                        {fmt.integer(e.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          {perTask && Array.isArray(data.perTask) && (
            <PerTaskTable
              rows={data.perTask}
              page={perTaskPage}
              onPageChange={setPerTaskPage}
            />
          )}
        </div>
      )}

      {quota && quota.tiers && (
        <Panel title={t('tokenUsagePage.tierQuota')} className="p-3 text-xs">
          <ul className="flex flex-col gap-1.5">
            {Object.entries(quota.tiers).map(([tier, snap]) => (
              <li key={tier} className="flex items-center gap-2">
                <Badge variant="outline" className="uppercase">{tier}</Badge>
                <Bar
                  value={Number(snap.used) || 0}
                  max={Number(snap.limit) || Number(snap.used) || 1}
                  tone={((Number(snap.pct) || 0) > 85) ? 'danger' : 'accent'}
                />
                <span className="w-32 shrink-0 text-right font-mono text-muted-foreground">
                  {fmt.integer(snap.used)} / {fmt.integer(snap.limit)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </PageFrame>
  );
}

const PER_TASK_PAGE_SIZE = 20;

interface PerTaskRow {
  worker?: string;
  name?: string;
  task?: string;
  total?: number;
  input?: number;
  output?: number;
}

interface PerTaskTableProps {
  rows: PerTaskRow[];
  page: number;
  onPageChange: (page: number) => void;
}

const PER_TASK_COLUMN_IDS = ['worker', 'task', 'total', 'input', 'output', 'io'] as const;

// (v1.11.258, TODO 11.240) Pure comparator so the sort logic is
// testable in isolation and so the page never sorts in place
// (which would surprise the parent + break ExportButton's view).
type PerTaskSortKey = 'worker' | 'total' | 'input' | 'output';

function perTaskComparator(
  key: PerTaskSortKey,
  dir: 'asc' | 'desc',
): (a: PerTaskRow, b: PerTaskRow) => number {
  const mult = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    if (key === 'worker') {
      const av = (a.worker ?? a.name ?? '').toLowerCase();
      const bv = (b.worker ?? b.name ?? '').toLowerCase();
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return 0;
    }
    const av = key === 'total' ? (a.total ?? coerceTotal(a)) : (a[key] ?? 0);
    const bv = key === 'total' ? (b.total ?? coerceTotal(b)) : (b[key] ?? 0);
    return ((av as number) - (bv as number)) * mult;
  };
}

export { perTaskComparator };
export type { PerTaskRow, PerTaskSortKey };

function PerTaskTable({ rows, page, onPageChange }: PerTaskTableProps) {
  // (v1.11.364, TODO 11.346) Locale-aware integer
  // formatter for the per-row total / input / output
  // columns. Hook lives here so the table respects
  // a Settings locale flip without a full TokenUsage
  // remount.
  const fmt = useLocalizedFormatters();
  // (v1.11.258, TODO 11.240) Sort persistence via useTableSort.
  // Default sort = total desc so the largest-token tasks land at
  // the top on first open (the operator's most common question is
  // "which task burned the most tokens this window?"). The hook
  // persists the operator's override to c4:table-sort:token-usage-per-task
  // and survives reload / route switch / different tab.
  const { sortKey, sortDir, onSortChange } = useTableSort<PerTaskSortKey>(
    'token-usage-per-task',
    { key: 'total', dir: 'desc' },
  );

  // Sort once before pagination so the page slice reflects the
  // chosen ordering. Stable for ties via the input array's order.
  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDir) return rows;
    const copy = [...rows];
    copy.sort(perTaskComparator(sortKey as PerTaskSortKey, sortDir));
    return copy;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PER_TASK_PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) onPageChange(1);
  }, [page, totalPages, onPageChange]);
  const slice = sortedRows.slice(
    (page - 1) * PER_TASK_PAGE_SIZE,
    page * PER_TASK_PAGE_SIZE,
  );
  const [visibleCols, setVisibleCols] = useState<string[]>(
    () => [...PER_TASK_COLUMN_IDS],
  );
  const allColumns: TableColumn<PerTaskRow>[] = [
    {
      key: 'worker',
      label: t('tokenUsagePage.tableHeader.worker'),
      className: 'truncate',
      sortable: true,
      render: (e) => e.worker || e.name || '-',
    },
    {
      key: 'task',
      label: t('tokenUsagePage.tableHeader.task'),
      className: 'max-w-xs truncate text-muted-foreground',
      /* (v1.11.285, TODO 11.267) Per-task cell now carries a
         CopyButton next to the task identifier so operators can
         paste it into a `c4 history` lookup or a bug report
         without selecting the truncated cell. The copy button
         is icon-only at size="sm" so it does not push the cell
         text out of the row's vertical rhythm. */
      render: (e) => {
        const taskValue = e.task || '';
        if (!taskValue) return '';
        return (
          <span className="inline-flex items-center gap-1">
            <span className="truncate">{taskValue}</span>
            <CopyButton
              value={taskValue}
              label="task"
              size="sm"
              data-testid={`token-usage-task-copy-${e.worker ?? e.name ?? 'row'}`}
            />
          </span>
        );
      },
    },
    {
      key: 'total',
      label: t('tokenUsagePage.tableHeader.total'),
      align: 'right',
      sortable: true,
      render: (e) => fmt.integer(e.total ?? coerceTotal(e)),
    },
    {
      key: 'input',
      label: t('tokenUsagePage.tableHeader.input'),
      align: 'right',
      sortable: true,
      render: (e) => fmt.integer(e.input),
    },
    {
      key: 'output',
      label: t('tokenUsagePage.tableHeader.output'),
      align: 'right',
      sortable: true,
      render: (e) => fmt.integer(e.output),
    },
    {
      key: 'io',
      label: 'I/O',
      align: 'right',
      // (v1.11.341, TODO 11.323) Per-task Sparkline column.
      // The per-task payload does not carry a time series, so
      // the visualization uses the two known data points
      // [input, output] as a 2-bar mini chart. Quick visual
      // sense of the I/O split (input-heavy vs output-heavy)
      // alongside the absolute numbers in the prior columns.
      render: (e) => {
        const inp = Number(e.input) || 0;
        const out = Number(e.output) || 0;
        if (inp === 0 && out === 0) return '-';
        return (
          <Sparkline
            data={[inp, out]}
            variant="info"
            size="sm"
            width={48}
            ariaLabel={`Input ${inp} Output ${out}`}
            data-testid={`token-usage-task-spark-${e.worker ?? e.name ?? 'row'}`}
          />
        );
      },
    },
  ];
  const visibleSet = new Set(visibleCols);
  const columns = allColumns.filter((c) => visibleSet.has(String(c.key)));
  return (
    <Panel
      title={tFormat('tokenUsagePage.perTaskHeading', { n: String(sortedRows.length) })}
      className="p-3 text-xs"
    >
      <div className="mb-2 flex justify-end">
        <ColumnPicker
          columns={[
            { id: 'worker', label: t('tokenUsagePage.tableHeader.worker'), alwaysVisible: true },
            { id: 'task', label: t('tokenUsagePage.tableHeader.task') },
            { id: 'total', label: t('tokenUsagePage.tableHeader.total') },
            { id: 'input', label: t('tokenUsagePage.tableHeader.input') },
            { id: 'output', label: t('tokenUsagePage.tableHeader.output') },
            { id: 'io', label: 'I/O' },
          ]}
          value={visibleCols}
          onChange={setVisibleCols}
          storageKey="c4:token-usage:columns"
        />
      </div>
      {/* (v1.11.341, TODO 11.323) ScrollArea replaces the
          inline <div max-h-64 overflow-y-auto> wrapper so the
          per-task table picks up the primitive's consistent
          scrollbar styling + e2e-friendly data-section. */}
      <ScrollArea
        axis="y"
        data-testid="token-usage-per-task-scrollarea"
        className="max-h-64"
      >
        <Table<PerTaskRow>
          columns={columns}
          rows={slice}
          {...(sortKey ? { sortKey } : {})}
          {...(sortDir ? { sortDir } : {})}
          onSortChange={(k, d) => onSortChange(k as PerTaskSortKey, d)}
          className="font-mono"
          ariaLabel={t('tokenUsagePage.perTaskHeading')}
        />
      </ScrollArea>
      {sortedRows.length > PER_TASK_PAGE_SIZE && (
        <div className="mt-2 flex justify-center">
          {/* (v1.11.282, TODO 11.264) Pagination enhancements:
              showFirstLast for quick "jump to top / bottom of
              the list" on large per-task windows; showJumpToPage
              for direct page-number entry. The per-task table
              routinely spills 5+ pages on a busy daemon, so
              both affordances matter here. */}
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            ariaLabel="Per-task pagination"
            showFirstLast
            showJumpToPage
          />
        </div>
      )}
    </Panel>
  );
}

type BarTone = 'accent' | 'danger';

// (v1.11.274, TODO 11.256) Replaces the prior hand-rolled
// <div className="relative h-2 ... bg-muted"> with the shared
// ProgressBar primitive. Tone mappings:
//   undefined -> 'default'     (primary)
//   'accent'  -> 'info'        (sky / informational)
//   'danger'  -> 'destructive'
// The visual rhythm is byte-identical at size="md" (h-2).
function Bar({ value, max, tone }: { value: number; max: number; tone?: BarTone }) {
  const variant =
    tone === 'danger'
      ? 'destructive'
      : tone === 'accent'
        ? 'info'
        : 'default';
  return (
    <ProgressBar
      value={value}
      max={max > 0 ? max : 100}
      variant={variant}
      size="md"
      className="flex-1"
    />
  );
}
