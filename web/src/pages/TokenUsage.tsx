import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, ColumnPicker, ExportButton, Pagination, Panel, Switch, Table, Tooltip } from '../components/ui';
import type { TableColumn } from '../components/ui';
import { useTokenUsage } from '../lib/use-token-usage';
import { useTokenUsageBreakdowns, coerceTotal } from '../lib/use-token-usage-breakdowns';
import { cn } from '../lib/cn';
import { dateRange, formatNumber } from '../lib/format';
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

const DAY_OPTIONS = [1, 7, 30, 90];

// (v1.10.695) coerceTotal + perWorker / perDay memos
// moved to lib/use-token-usage-breakdowns.

export default function TokenUsage() {
  useLocale();
  const [days, setDays] = useState<number>(7);
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
          {DAY_OPTIONS.map((d) => (
            <Tooltip key={d} label={t('tokenUsage.tooltip.days')}>
              <Button
                type="button"
                variant={d === days ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDays(d)}
              >
                {d === 1 ? t('tokenUsage.range.today')
                  : d === 7 ? t('tokenUsage.range.last7')
                  : d === 30 ? t('tokenUsage.range.last30')
                  : d === 90 ? t('tokenUsage.range.last90')
                  : tFormat('tokenUsage.range.lastN', { days: d })}
              </Button>
            </Tooltip>
          ))}
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
      {error && <ErrorPanel message={error} />}
      {data && (
        <div className="grid grid-cols-1 gap-3">
          <Panel className="p-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('tokenUsagePage.total')}</span>
              <span className="font-mono text-xl text-foreground">
                {formatNumber(data.total)}
              </span>
              {data.totalInput != null && (
                <span className="text-xs text-muted-foreground">
                  {t('tokenUsagePage.input')} {formatNumber(data.totalInput)}
                </span>
              )}
              {data.totalOutput != null && (
                <span className="text-xs text-muted-foreground">
                  {t('tokenUsagePage.output')} {formatNumber(data.totalOutput)}
                </span>
              )}
            </div>
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
                      {formatNumber(e.total)}
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
              <ul className="flex flex-col gap-1.5">
                {perDay.map((e) => (
                  <li key={e.date} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 font-mono text-foreground">
                      {e.date}
                    </span>
                    <Bar value={e.total} max={dayMax} tone="accent" />
                    <span className="w-20 shrink-0 text-right font-mono text-muted-foreground">
                      {formatNumber(e.total)}
                    </span>
                  </li>
                ))}
              </ul>
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
                  {formatNumber(snap.used)} / {formatNumber(snap.limit)}
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

const PER_TASK_COLUMN_IDS = ['worker', 'task', 'total', 'input', 'output'] as const;

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
      render: (e) => e.task || '',
    },
    {
      key: 'total',
      label: t('tokenUsagePage.tableHeader.total'),
      align: 'right',
      sortable: true,
      render: (e) => formatNumber(e.total ?? coerceTotal(e)),
    },
    {
      key: 'input',
      label: t('tokenUsagePage.tableHeader.input'),
      align: 'right',
      sortable: true,
      render: (e) => formatNumber(e.input),
    },
    {
      key: 'output',
      label: t('tokenUsagePage.tableHeader.output'),
      align: 'right',
      sortable: true,
      render: (e) => formatNumber(e.output),
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
          ]}
          value={visibleCols}
          onChange={setVisibleCols}
          storageKey="c4:token-usage:columns"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        <Table<PerTaskRow>
          columns={columns}
          rows={slice}
          {...(sortKey ? { sortKey } : {})}
          {...(sortDir ? { sortDir } : {})}
          onSortChange={(k, d) => onSortChange(k as PerTaskSortKey, d)}
          className="font-mono"
          ariaLabel={t('tokenUsagePage.perTaskHeading')}
        />
      </div>
      {sortedRows.length > PER_TASK_PAGE_SIZE && (
        <div className="mt-2 flex justify-center">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            ariaLabel="Per-task pagination"
          />
        </div>
      )}
    </Panel>
  );
}

type BarTone = 'accent' | 'danger';

function Bar({ value, max, tone }: { value: number; max: number; tone?: BarTone }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === 'danger'
    ? 'bg-destructive/70'
    : tone === 'accent'
      ? 'bg-info/70'
      : 'bg-primary/70';
  return (
    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        className={cn('absolute inset-y-0 left-0', color)}
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
