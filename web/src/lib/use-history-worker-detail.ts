import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import type { HistoryWorkerDetail } from '../components/HistoryView';

// (v1.10.651) Extracted from HistoryView. Watches the
// `selected` worker name and refetches GET
// /api/history/:name whenever it flips. A null `selected`
// clears the detail slot. Errors flow through the
// parent-supplied setError so the page-level banner stays
// the single sink (success → setError(null), failure →
// setError(message) — preserved verbatim from the inline
// version).

export function useHistoryWorkerDetail(args: {
  selected: string | null;
  setError: (message: string | null) => void;
}): HistoryWorkerDetail | null {
  const { selected, setError } = args;
  const [detail, setDetail] = useState<HistoryWorkerDetail | null>(null);

  const fetchDetail = useCallback(async (name: string) => {
    try {
      const data = await apiGet<HistoryWorkerDetail>(
        `/api/history/${encodeURIComponent(name)}`,
      );
      setDetail(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [setError]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    fetchDetail(selected);
  }, [selected, fetchDetail]);

  return detail;
}
