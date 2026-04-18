import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import { Badge, Button, Panel } from '../components/ui';
import { apiGet } from '../lib/api';
import { cn } from '../lib/cn';
import { dateRange, dateRangeLabel, formatNumber } from '../lib/format';

// 8.20B Token usage. Calls GET /api/token-usage (with optional
// ?perTask=1) and renders:
//   * per-worker bar chart across the selected date window
//   * per-day stacked bars
//   * a tier-quota snapshot (GET /api/quota) with daily caps
// Implemented without a charting library -- bars are simple divs with
// widths proportional to the maximum value so the bundle stays small.

interface PerTaskEntry {
  worker?: string;
  name?: string;
  task?: string;
  input?: number;
  output?: number;
  total?: number;
  cost?: number;
  date?: string;
  timestamp?: string | number;
  [key: string]: unknown;
}

interface TokenUsagePayload {
  total?: number;
  totalInput?: number;
  totalOutput?: number;
  perWorker?: Record<string, number | { input?: number; output?: number; total?: number }>;
  perDay?: Record<string, number>;
  perTask?: PerTaskEntry[];
  startedAt?: string;
  error?: string;
  [key: string]: unknown;
}

interface QuotaTierSnapshot {
  used?: number;
  remaining?: number;
  limit?: number;
  pct?: number;
  [key: string]: unknown;
}

interface QuotaPayload {
  date?: string;
  tiers?: Record<string, QuotaTierSnapshot>;
  error?: string;
  [key: string]: unknown;
}

const DAY_OPTIONS = [1, 7, 30, 90];

function coerceTotal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    const obj = v as { input?: number; output?: number; total?: number };
    if (typeof obj.total === 'number') return obj.total;
    return (obj.input || 0) + (obj.output || 0);
  }
  return 0;
}

export default function TokenUsage() {
  const [data, setData] = useState<TokenUsagePayload | null>(null);
  const [quota, setQuota] = useState<QuotaPayload | null>(null);
  const [days, setDays] = useState<number>(7);
  const [perTask, setPerTask] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = perTask ? '/api/token-usage?perTask=1' : '/api/token-usage';
      const r = await apiGet<TokenUsagePayload>(path);
      setData(r);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    }
    try {
      const q = await apiGet<QuotaPayload>('/api/quota');
      setQuota(q);
    } catch {
      setQuota(null);
    }
    setLoading(false);
  }, [perTask]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const range = useMemo(() => dateRange(days), [days]);

  const perWorker = useMemo(() => {
    if (!data?.perWorker) return [];
    const entries = Object.entries(data.perWorker).map(([name, v]) => ({
      name,
      total: coerceTotal(v),
    }));
    entries.sort((a, b) => b.total - a.total);
    return entries;
  }, [data]);

  const perDay = useMemo(() => {
    if (!data?.perDay) return [];
    const entries = Object.entries(data.perDay)
      .filter(([date]) => date >= range.start && date <= range.end)
      .map(([date, total]) => ({ date, total: Number(total) || 0 }));
    entries.sort((a, b) => (a.date > b.date ? 1 : -1));
    return entries;
  }, [data, range.start, range.end]);

  const workerMax = perWorker.reduce((acc, e) => Math.max(acc, e.total), 0);
  const dayMax = perDay.reduce((acc, e) => Math.max(acc, e.total), 0);

  return (
    <PageFrame
      title="Token usage"
      description="Per-worker and per-day token consumption, plus the current tier quota snapshot."
      actions={
        <>
          {DAY_OPTIONS.map((d) => (
            <Button
              key={d}
              type="button"
              variant={d === days ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(d)}
            >
              {dateRangeLabel(d)}
            </Button>
          ))}
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={perTask}
              onChange={(e) => setPerTask(e.target.checked)}
            />
            Per-task
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh</span>
          </Button>
        </>
      }
    >
      {loading && !data ? <LoadingSkeleton rows={4} /> : null}
      {error && <ErrorPanel message={error} />}
      {data && (
        <div className="grid grid-cols-1 gap-3">
          <Panel className="p-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Total</span>
              <span className="font-mono text-xl text-foreground">
                {formatNumber(data.total)}
              </span>
              {data.totalInput != null && (
                <span className="text-xs text-muted-foreground">
                  input {formatNumber(data.totalInput)}
                </span>
              )}
              {data.totalOutput != null && (
                <span className="text-xs text-muted-foreground">
                  output {formatNumber(data.totalOutput)}
                </span>
              )}
            </div>
          </Panel>

          <Panel title={`By worker (${perWorker.length})`} className="p-3">
            {perWorker.length === 0 ? (
              <EmptyPanel message="No per-worker usage recorded yet." />
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

          <Panel title={`By day (${perDay.length})`} className="p-3">
            {perDay.length === 0 ? (
              <EmptyPanel message="No per-day usage recorded in this window." />
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
            <Panel title={`Per-task (${data.perTask.length})`} className="p-3 text-xs">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left font-mono">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">Worker</th>
                      <th className="py-1 pr-2">Task</th>
                      <th className="py-1 pr-2 text-right">Total</th>
                      <th className="py-1 pr-2 text-right">Input</th>
                      <th className="py-1 pr-2 text-right">Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perTask.slice(0, 200).map((e, idx) => (
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
            </Panel>
          )}
        </div>
      )}

      {quota && quota.tiers && (
        <Panel title="Tier quota (today)" className="p-3 text-xs">
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

type BarTone = 'accent' | 'danger';

function Bar({ value, max, tone }: { value: number; max: number; tone?: BarTone }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === 'danger'
    ? 'bg-destructive/70'
    : tone === 'accent'
      ? 'bg-sky-500/70'
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
