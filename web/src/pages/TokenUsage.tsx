import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, Checkbox, Pagination, Panel, Tooltip } from '../components/ui';
import { useTokenUsage } from '../lib/use-token-usage';
import { useTokenUsageBreakdowns, coerceTotal } from '../lib/use-token-usage-breakdowns';
import { cn } from '../lib/cn';
import { dateRange, formatNumber } from '../lib/format';
import { t, tFormat, useLocale } from '../lib/i18n';

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
            <Checkbox
              checked={perTask}
              onChange={(e) => setPerTask(e.target.checked)}
              label={t('tokenUsagePage.perTask')}
            />
          </Tooltip>
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

function PerTaskTable({ rows, page, onPageChange }: PerTaskTableProps) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PER_TASK_PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) onPageChange(1);
  }, [page, totalPages, onPageChange]);
  const slice = rows.slice(
    (page - 1) * PER_TASK_PAGE_SIZE,
    page * PER_TASK_PAGE_SIZE,
  );
  return (
    <Panel
      title={tFormat('tokenUsagePage.perTaskHeading', { n: String(rows.length) })}
      className="p-3 text-xs"
    >
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-left font-mono">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-2">{t('tokenUsagePage.tableHeader.worker')}</th>
              <th className="py-1 pr-2">{t('tokenUsagePage.tableHeader.task')}</th>
              <th className="py-1 pr-2 text-right">{t('tokenUsagePage.tableHeader.total')}</th>
              <th className="py-1 pr-2 text-right">{t('tokenUsagePage.tableHeader.input')}</th>
              <th className="py-1 pr-2 text-right">{t('tokenUsagePage.tableHeader.output')}</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((e, idx) => (
              <tr key={idx} className="border-t border-border/60 text-foreground">
                <td className="py-1 pr-2 truncate">{e.worker || e.name || '-'}</td>
                <td className="max-w-xs truncate py-1 pr-2 text-muted-foreground">{e.task || ''}</td>
                <td className="py-1 pr-2 text-right">{formatNumber(e.total ?? coerceTotal(e))}</td>
                <td className="py-1 pr-2 text-right">{formatNumber(e.input)}</td>
                <td className="py-1 pr-2 text-right">{formatNumber(e.output)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PER_TASK_PAGE_SIZE && (
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
