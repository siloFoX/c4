import { useMemo } from 'react';
import type { TokenUsagePayload } from './use-token-usage';

// (v1.10.695) Extracted from pages/TokenUsage. The two
// memoized breakdowns (per-worker / per-day) plus the
// max-value reducers used to scale the bar charts.
// `coerceTotal` is hoisted out so both the per-worker
// row totals AND the perTask row's fallback (where
// `e.total` may be undefined) can share the same
// number-shape coercion.

export function coerceTotal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    const obj = v as { input?: number; output?: number; total?: number };
    if (typeof obj.total === 'number') return obj.total;
    return (obj.input || 0) + (obj.output || 0);
  }
  return 0;
}

export interface PerWorkerEntry { name: string; total: number }
export interface PerDayEntry { date: string; total: number }

interface TokenUsageBreakdowns {
  perWorker: PerWorkerEntry[];
  perDay: PerDayEntry[];
  workerMax: number;
  dayMax: number;
}

export function useTokenUsageBreakdowns(args: {
  data: TokenUsagePayload | null;
  rangeStart: string;
  rangeEnd: string;
}): TokenUsageBreakdowns {
  const { data, rangeStart, rangeEnd } = args;

  const perWorker = useMemo<PerWorkerEntry[]>(() => {
    if (!data?.perWorker) return [];
    const entries = Object.entries(data.perWorker).map(([name, v]) => ({
      name,
      total: coerceTotal(v),
    }));
    entries.sort((a, b) => b.total - a.total);
    return entries;
  }, [data]);

  const perDay = useMemo<PerDayEntry[]>(() => {
    if (!data?.perDay) return [];
    const entries = Object.entries(data.perDay)
      .filter(([date]) => date >= rangeStart && date <= rangeEnd)
      .map(([date, total]) => ({ date, total: Number(total) || 0 }));
    entries.sort((a, b) => (a.date > b.date ? 1 : -1));
    return entries;
  }, [data, rangeStart, rangeEnd]);

  const workerMax = perWorker.reduce((acc, e) => Math.max(acc, e.total), 0);
  const dayMax = perDay.reduce((acc, e) => Math.max(acc, e.total), 0);

  return { perWorker, perDay, workerMax, dayMax };
}
