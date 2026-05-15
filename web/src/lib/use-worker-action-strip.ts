import { useCallback, useState } from 'react';
import { postAction } from './post-action';
import { t, tFormat } from './i18n';
import { useConfirm } from '../hooks/use-confirm';
import type { ToastType } from '../components/Toast';
import type { ActionConfig, ActionKind } from '../components/WorkerActions';

// (v1.10.720) Extracted from WorkerActions. The
// per-worker row-action runner — confirms via
// window.confirm, busy-marks the action kind in
// flight, POSTs to action.endpoint via the shared
// postAction helper (handles HTTP status + JSON
// `{ error }` body uniformly), and surfaces success /
// failure through the parent's toast slot. Distinct
// from the older `useWorkerActions` (workerDetail-
// level) — that hook drives WorkerDetail's send /
// key / merge handlers; this one drives the row-
// action toolbar buttons.
// (v1.10.749) postAction (3-mode failure handling)
// adopted from lib/post-action.

export interface WorkerActionStripState {
  busyKind: ActionKind | null;
  runAction: (action: ActionConfig) => Promise<void>;
}

export function useWorkerActionStrip(args: {
  showToast: (message: string, type: ToastType) => void;
}): WorkerActionStripState {
  const { showToast } = args;
  const [busyKind, setBusyKind] = useState<ActionKind | null>(null);
  const confirm = useConfirm();

  const runAction = useCallback(async (action: ActionConfig) => {
    if (action.disabled) return;
    const ok = await confirm({
      title: action.label,
      message: action.confirm,
      confirmLabel: action.label,
      tone: action.variant === 'destructive' ? 'destructive' : 'default',
    });
    if (!ok) return;

    setBusyKind(action.kind);
    const res = await postAction(action.endpoint, action.body);
    if (res.ok) {
      showToast(action.successMessage, 'success');
    } else {
      showToast(
        tFormat('worker.action.failed', {
          label: action.label,
          error: res.error || t('common.unknown'),
        }),
        'error',
      );
    }
    setBusyKind(null);
  }, [showToast, confirm]);

  return { busyKind, runAction };
}
