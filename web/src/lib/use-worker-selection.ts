import { useCallback, useState } from 'react';
import { tFormat } from './i18n';
import { postAction } from './post-action';
import type { Worker } from '../types';
import type { BatchKind, BatchOutcome } from '../components/ControlPanel';
import type { ToastType } from '../components/Toast';

// (v1.10.668) Extracted from ControlPanel. The
// multi-select + batch-action state machine — checkbox
// selection, select-all/clear, and the close/cancel
// batch driver.
// (v1.10.740) postAction lifted to lib/post-action so
// the hook signature drops one prop.
// Toasts + a refresh kick are pushed back to the
// parent via callbacks.

interface WorkerSelectionState {
  selected: Set<string>;
  toggleSelected: (name: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  batchBusy: BatchKind | null;
  batchResults: BatchOutcome[] | null;
  runBatch: (kind: BatchKind) => Promise<void>;
}

export function useWorkerSelection(args: {
  workers: Worker[];
  showToast: (message: string, type: ToastType) => void;
  fetchList: () => Promise<void>;
}): WorkerSelectionState {
  const { workers, showToast, fetchList } = args;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState<BatchKind | null>(null);
  const [batchResults, setBatchResults] = useState<BatchOutcome[] | null>(null);

  const toggleSelected = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(workers.map((w) => w.name)));
  }, [workers]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const runBatch = useCallback(async (kind: BatchKind) => {
    const names = [...selected];
    if (names.length === 0) return;
    const confirmMsg =
      kind === 'close'
        ? tFormat('controlPanel.batch.confirmClose', { count: names.length })
        : tFormat('controlPanel.batch.confirmCancel', { count: names.length });
    if (!window.confirm(confirmMsg)) return;
    setBatchBusy(kind);
    setBatchResults(null);
    const endpoint = kind === 'close' ? '/api/close' : '/api/cancel';
    const outcomes: BatchOutcome[] = [];
    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop
      const r = await postAction(endpoint, { name });
      outcomes.push({ name, ok: r.ok, error: r.error });
    }
    setBatchResults(outcomes);
    const okCount = outcomes.filter((o) => o.ok).length;
    const failCount = outcomes.length - okCount;
    if (failCount === 0) {
      showToast(
        tFormat('controlPanel.batch.resultOk', { kind, ok: okCount }),
        'success',
      );
    } else {
      showToast(
        tFormat('controlPanel.batch.resultMixed', {
          kind,
          ok: okCount,
          fail: failCount,
        }),
        'error',
      );
    }
    setBatchBusy(null);
    fetchList();
    if (kind === 'close') {
      setSelected(new Set());
    }
  }, [selected, showToast, fetchList]);

  return {
    selected, toggleSelected, selectAll, clearSelection,
    batchBusy, batchResults, runBatch,
  };
}
