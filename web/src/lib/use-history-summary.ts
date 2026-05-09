import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import type { HistoryWorkerSummary, HistoryListResponse } from '../components/HistoryView';

// (v1.10.652) Extracted from HistoryView. The
// /api/history filter-list fetch — query / statusFilter /
// sinceDay / untilDay get forwarded as URL params, with
// the day strings widened to full-UTC-day ISO ranges. The
// hook auto-refetches whenever any of the four filters
// change. setError is threaded in so the page-level
// banner stays the single sink (success → null, failure →
// message).

function toIsoDayStart(dayStr: string): string {
  if (!dayStr) return '';
  return `${dayStr}T00:00:00.000Z`;
}

function toIsoDayEnd(dayStr: string): string {
  if (!dayStr) return '';
  return `${dayStr}T23:59:59.999Z`;
}

interface HistorySummaryState {
  summary: HistoryWorkerSummary[];
  refresh: () => Promise<void>;
}

export function useHistorySummary(args: {
  query: string;
  statusFilter: string;
  sinceDay: string;
  untilDay: string;
  setError: (message: string | null) => void;
}): HistorySummaryState {
  const { query, statusFilter, sinceDay, untilDay, setError } = args;
  const [summary, setSummary] = useState<HistoryWorkerSummary[]>([]);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (statusFilter) params.set('status', statusFilter);
      if (sinceDay) params.set('since', toIsoDayStart(sinceDay));
      if (untilDay) params.set('until', toIsoDayEnd(untilDay));
      const qs = params.toString();
      const url = qs ? `/api/history?${qs}` : '/api/history';
      const data = await apiGet<HistoryListResponse>(url);
      setSummary(Array.isArray(data.workers) ? data.workers : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [query, statusFilter, sinceDay, untilDay, setError]);

  useEffect(() => { refresh(); }, [refresh]);

  return { summary, refresh };
}
