import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import type { ToastType } from '../components/Toast';
import type { PlanResponse } from './use-plan-content';

// (v1.10.680) Extracted from pages/Plan. Two related
// dispatch flows that share the same `dispatching` busy
// slot:
//   - dispatchPlan: POST /api/plan with the inline task
//     (planner generates a fresh plan), refetches /plan
//     to show the result.
//   - redispatch: POST /api/task with the saved plan
//     content as the task body (graduates a plan into a
//     real worker run, gated by window.confirm).
// Toasts + the loadPlan refetch are pushed back to the
// parent via callbacks.

interface PlanDispatchState {
  dispatching: boolean;
  dispatchPlan: () => Promise<void>;
  redispatch: () => Promise<void>;
}

export function usePlanDispatch(args: {
  selected: string;
  task: string;
  branch: string;
  output: string;
  plan: PlanResponse | null;
  setError: (message: string | null) => void;
  showToast: (message: string, type: ToastType) => void;
  loadPlan: () => Promise<void>;
}): PlanDispatchState {
  const { selected, task, branch, output, plan, setError, showToast, loadPlan } = args;
  const [dispatching, setDispatching] = useState<boolean>(false);

  const dispatchPlan = useCallback(async () => {
    if (!selected || !task.trim()) {
      setError(t('plan.error.selectWorker'));
      return;
    }
    setDispatching(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: selected, task };
      if (branch) body['branch'] = branch;
      if (output) body['output'] = output;
      const r = (await apiPost<PlanResponse>('/api/plan', body)) as PlanResponse;
      if (r.error) {
        showToast(tFormat('plan.toast.dispatchFailed', { error: r.error }), 'error');
        setError(r.error);
      } else {
        showToast(t('plan.toast.dispatched'), 'success');
        loadPlan();
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setDispatching(false);
  }, [selected, task, branch, output, setError, showToast, loadPlan]);

  const redispatch = useCallback(async () => {
    if (!selected || !plan?.content) return;
    if (!window.confirm(tFormat('plan.confirmRedispatch', { worker: selected }))) return;
    setDispatching(true);
    try {
      const r = (await apiPost<{ error?: string }>('/api/task', {
        name: selected,
        task: plan.content,
        useBranch: true,
      })) as { error?: string };
      if (r.error) {
        showToast(tFormat('plan.toast.taskDispatchFailed', { error: r.error }), 'error');
      } else {
        showToast(tFormat('plan.toast.taskDispatched', { worker: selected }), 'success');
      }
    } catch (e) {
      showToast(tFormat('plan.toast.taskDispatchFailed', { error: (e as Error).message }), 'error');
    }
    setDispatching(false);
  }, [plan, selected, showToast]);

  return { dispatching, dispatchPlan, redispatch };
}
