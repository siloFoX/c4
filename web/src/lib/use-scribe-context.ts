import { useCallback, useState } from 'react';
import { apiGet } from './api';

// (v1.10.650) Extracted from HistoryView. Owns the
// scribe-drawer state — open flag, loaded payload,
// loading flag — plus the open/close callbacks. The
// open() call also triggers the GET /api/scribe-context
// fetch; failures and successes both flow through the
// parent-supplied setError so the existing top-of-page
// banner stays the single error sink for the page (set
// to null on success, error message on failure — matches
// the pre-extraction behaviour exactly).

export interface ScribeContextResponse {
  exists: boolean;
  path: string;
  size: number;
  updatedAt: string | null;
  truncated?: boolean;
  content: string;
  error?: string;
}

interface ScribeContextState {
  showScribe: boolean;
  scribe: ScribeContextResponse | null;
  loadingScribe: boolean;
  openScribe: () => Promise<void>;
  closeScribe: () => void;
}

export function useScribeContext(args: {
  setError: (message: string | null) => void;
}): ScribeContextState {
  const { setError } = args;
  const [showScribe, setShowScribe] = useState(false);
  const [scribe, setScribe] = useState<ScribeContextResponse | null>(null);
  const [loadingScribe, setLoadingScribe] = useState(false);

  const openScribe = useCallback(async () => {
    setShowScribe(true);
    setLoadingScribe(true);
    try {
      const data = await apiGet<ScribeContextResponse>('/api/scribe-context');
      setScribe(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingScribe(false);
    }
  }, [setError]);

  const closeScribe = useCallback(() => setShowScribe(false), []);

  return { showScribe, scribe, loadingScribe, openScribe, closeScribe };
}
