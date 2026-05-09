import { useCallback, useState } from 'react';
import { apiFetch } from './api';
import { tFormat } from './i18n';
import type { ToastType } from '../components/Toast';
import type { ActionConfig, ActionKind } from '../components/WorkerActions';

// (v1.10.720) Extracted from WorkerActions. The
// per-worker row-action runner — confirms via
// window.confirm, busy-marks the action kind in
// flight, POSTs to action.endpoint, inspects both
// the HTTP status and a JSON `{ error }` body
// (the daemon returns 200 with an error key for
// some no-op cases), and surfaces success / failure
// through the parent's toast slot. Distinct from
// the older `useWorkerActions` (workerDetail-level)
// — that hook drives WorkerDetail's send / key /
// merge handlers; this one drives the row-action
// toolbar buttons.

export interface WorkerActionStripState {
  busyKind: ActionKind | null;
  runAction: (action: ActionConfig) => Promise<void>;
}

export function useWorkerActionStrip(args: {
  showToast: (message: string, type: ToastType) => void;
}): WorkerActionStripState {
  const { showToast } = args;
  const [busyKind, setBusyKind] = useState<ActionKind | null>(null);

  const runAction = useCallback(async (action: ActionConfig) => {
    if (action.disabled) return;
    if (!window.confirm(action.confirm)) return;

    setBusyKind(action.kind);
    try {
      const res = await apiFetch(action.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.body),
      });

      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        // non-JSON response
      }

      if (!res.ok) {
        const errMsg =
          (payload && typeof payload === 'object' && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : null) || `HTTP ${res.status}`;
        showToast(tFormat('worker.action.failed', { label: action.label, error: errMsg }), 'error');
        return;
      }

      if (payload && typeof payload === 'object' && 'error' in payload && (payload as { error: unknown }).error) {
        showToast(tFormat('worker.action.failed', {
          label: action.label,
          error: String((payload as { error: unknown }).error),
        }), 'error');
        return;
      }

      showToast(action.successMessage, 'success');
    } catch (e) {
      showToast(tFormat('worker.action.failed', {
        label: action.label,
        error: (e as Error).message,
      }), 'error');
    } finally {
      setBusyKind(null);
    }
  }, [showToast]);

  return { busyKind, runAction };
}
