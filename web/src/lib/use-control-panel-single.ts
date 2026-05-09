import { useCallback, useState } from 'react';
import { t, tFormat } from './i18n';
import type { ToastType } from '../components/Toast';
import type { ActionKind, SingleAction } from '../components/ControlPanel';

// (v1.10.710) Extracted from ControlPanel. The
// single-worker action dispatcher — confirms via
// window.confirm if the action declares one, busy-marks
// the action kind in flight, POSTs through the
// parent-supplied postAction wrapper, fires a toast
// (success or error path), and pings fetchList so the
// sidebar reflects the new state.

interface ControlPanelSingleState {
  busyKind: ActionKind | null;
  runSingle: (action: SingleAction) => Promise<void>;
}

export function useControlPanelSingle(args: {
  workerName: string;
  postAction: (endpoint: string, body: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  showToast: (message: string, type: ToastType) => void;
  fetchList: () => Promise<void>;
}): ControlPanelSingleState {
  const { workerName, postAction, showToast, fetchList } = args;
  const [busyKind, setBusyKind] = useState<ActionKind | null>(null);

  const runSingle = useCallback(async (action: SingleAction) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setBusyKind(action.kind);
    const res = await postAction(action.endpoint, action.body);
    if (res.ok) {
      showToast(action.successMessage(workerName), 'success');
    } else {
      showToast(
        tFormat('controlPanel.action.failed', {
          label: action.label,
          error: res.error || t('controlPanel.action.failedUnknown'),
        }),
        'error',
      );
    }
    setBusyKind(null);
    fetchList();
  }, [workerName, postAction, showToast, fetchList]);

  return { busyKind, runSingle };
}
