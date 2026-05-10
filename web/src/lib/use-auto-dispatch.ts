import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import type { ToastType } from '../components/Toast';

// (v1.10.747) Extracted from pages/Auto. POSTs to
// /api/auto with the task + optional worker name and
// surfaces the spawn result. Mirrors `c4 auto` from
// the CLI side. Pre-validates that task is non-
// empty (sets `error` slot for the page to surface
// in an inline ErrorPanel) and confirm-gates the
// spawn behind a window.confirm so an accidental
// dispatch doesn't auto-spawn a worker.
//
// Failure paths route through the parent's
// showToast so the toast layer stays a single place.

export interface AutoResponse {
  name?: string;
  status?: string;
  branch?: string;
  error?: string;
  [key: string]: unknown;
}

export interface UseAutoDispatchState {
  busy: boolean;
  error: string | null;
  result: AutoResponse | null;
  dispatch: () => Promise<void>;
}

export function useAutoDispatch(args: {
  task: string;
  name: string;
  showToast: (message: string, type: ToastType) => void;
}): UseAutoDispatchState {
  const { task, name, showToast } = args;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutoResponse | null>(null);

  const dispatch = useCallback(async () => {
    if (!task.trim()) {
      setError(t('auto.error.taskRequired'));
      return;
    }
    if (!window.confirm(t('auto.confirmDispatch'))) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { task };
      if (name.trim()) body['name'] = name.trim();
      const r = (await apiPost<AutoResponse>('/api/auto', body)) as AutoResponse;
      if (r.error) {
        setError(r.error);
        showToast(tFormat('auto.toast.dispatchFailed', { error: r.error }), 'error');
      } else {
        setResult(r);
        showToast(
          r.name
            ? tFormat('auto.toast.spawnedAs', { name: r.name })
            : t('auto.toast.spawned'),
          'success',
        );
      }
    } catch (e) {
      setError((e as Error).message);
      showToast(tFormat('auto.toast.dispatchFailed', { error: (e as Error).message }), 'error');
    }
    setBusy(false);
  }, [task, name, showToast]);

  return { busy, error, result, dispatch };
}
