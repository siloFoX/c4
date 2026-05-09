import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import type { ToastType } from '../components/Toast';

// (v1.10.658) Extracted from pages/Batch. The dispatcher
// for `c4 batch` runs — POST /api/batch with either a
// task+count tuple or a tasks[] array depending on the
// active tab. The hook owns its busy/result/error
// triplet and folds toast emission for the
// success/partial-fail cases. All input validation
// happens here so the JSX submit button is a one-liner.

interface BatchOutcome { name: string; ok: boolean; error?: string }
export interface BatchResponse {
  ok: number;
  fail: number;
  total: number;
  results: BatchOutcome[];
  error?: string;
}

interface BatchSubmitState {
  busy: boolean;
  result: BatchResponse | null;
  error: string | null;
  submit: () => Promise<void>;
}

export function useBatchSubmit(args: {
  mode: 'count' | 'file';
  task: string;
  count: number;
  tasksText: string;
  namePrefix: string;
  branch: string;
  profile: string;
  autoMode: boolean;
  showToast: (message: string, type: ToastType) => void;
}): BatchSubmitState {
  const { mode, task, count, tasksText, namePrefix, branch, profile, autoMode, showToast } = args;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    setResult(null);
    let tasks: string[] = [];
    if (mode === 'file') {
      tasks = tasksText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      if (tasks.length === 0) {
        setError(t('batch.error.noTaskLine'));
        return;
      }
    } else {
      if (!task.trim()) {
        setError(t('batch.error.taskRequired'));
        return;
      }
      if (count < 1) {
        setError(t('batch.error.countOne'));
        return;
      }
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { namePrefix: namePrefix || 'batch' };
      if (mode === 'file') {
        body['tasks'] = tasks;
      } else {
        body['task'] = task;
        body['count'] = count;
      }
      if (branch) body['branch'] = branch;
      if (profile) body['profile'] = profile;
      if (autoMode) body['autoMode'] = true;
      const r = (await apiPost<BatchResponse>('/api/batch', body)) as BatchResponse;
      if (r.error) {
        setError(r.error);
      } else {
        setResult(r);
        if (r.fail === 0) {
          showToast(tFormat('batch.toast.dispatched', { ok: r.ok, total: r.total }), 'success');
        } else {
          showToast(tFormat('batch.toast.failures', { ok: r.ok, fail: r.fail }), 'error');
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }, [autoMode, branch, count, mode, namePrefix, profile, task, tasksText, showToast]);

  return { busy, result, error, submit };
}
