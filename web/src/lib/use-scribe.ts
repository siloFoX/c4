import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiPost } from './api';
import { tFormat } from './i18n';
import type { ToastType } from '../components/Toast';

// (v1.10.745) Extracted from pages/Scribe. Owns the
// dual /scribe/status + /scribe-context fetch (status
// is the structured running/scans summary; context
// is the rolling-context markdown blob), the
// in-flight `busy` slot keyed by endpoint name, and
// the `act(endpoint, label)` POST + post-action
// refresh + toast wrapper.
//
// Failures on the status fetch surface through the
// `error` slot so the page can render an
// ErrorPanel; the context fetch swallows on
// failure (treated as "no context yet" state).

export interface ScribeStatus {
  running?: boolean;
  lastScan?: string | number | null;
  scans?: number;
  sessions?: number;
  bytesWritten?: number;
  contextPath?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ContextResponse {
  content?: string;
  path?: string;
  updatedAt?: string | number;
  error?: string;
}

export interface UseScribeState {
  status: ScribeStatus | null;
  context: ContextResponse | null;
  loading: boolean;
  busy: string | null;
  error: string | null;
  refresh: () => Promise<void>;
  act: (endpoint: string, label: string) => Promise<void>;
}

export function useScribe(args: {
  showToast: (message: string, type: ToastType) => void;
}): UseScribeState {
  const { showToast } = args;
  const [status, setStatus] = useState<ScribeStatus | null>(null);
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/scribe/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ScribeStatus;
      setStatus(data);
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    }
    try {
      const res = await apiFetch('/api/scribe-context');
      if (res.ok) {
        const data = (await res.json()) as ContextResponse;
        setContext(data);
      } else {
        setContext(null);
      }
    } catch {
      setContext(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = useCallback(
    async (endpoint: string, label: string) => {
      setBusy(endpoint);
      try {
        await apiPost(endpoint, {});
        showToast(tFormat('scribe.toast.ok', { label }), 'success');
      } catch (e) {
        showToast(tFormat('scribe.toast.failed', { label, error: (e as Error).message }), 'error');
      }
      setBusy(null);
      refresh();
    },
    [refresh, showToast],
  );

  return { status, context, loading, busy, error, refresh, act };
}
