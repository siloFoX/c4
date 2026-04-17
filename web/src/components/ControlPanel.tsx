import { useCallback, useEffect, useState } from 'react';
import Toast, { type ToastType } from './Toast';
import { apiFetch } from '../lib/api';
import type { ListResponse, Worker } from '../types';

// 8.8: Per-worker control panel + batch control for bulk close/cancel.
// Keeps the existing WorkerActions toolbar and /api/* endpoints intact --
// this component layers on top of /api/close, /api/send, /api/key,
// /api/rollback plus the new /api/cancel and /api/restart endpoints.

interface ControlPanelProps {
  workerName: string;
}

type ActionKind =
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'restart'
  | 'rollback'
  | 'close';

interface SingleAction {
  kind: ActionKind;
  label: string;
  description: string;
  endpoint: string;
  body: Record<string, unknown>;
  confirm: string | null;
  tone: 'neutral' | 'warn' | 'danger';
  successMessage: (workerName: string) => string;
}

interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

type BatchKind = 'close' | 'cancel';

interface BatchOutcome {
  name: string;
  ok: boolean;
  error?: string;
}

const TONE_CLASS: Record<SingleAction['tone'], string> = {
  neutral: 'bg-gray-700 hover:bg-gray-600',
  warn: 'bg-amber-700 hover:bg-amber-600',
  danger: 'bg-red-700 hover:bg-red-600',
};

function buildActions(workerName: string): SingleAction[] {
  return [
    {
      kind: 'pause',
      label: 'Pause (Ctrl+C)',
      description: 'Send Ctrl+C to interrupt the current work without terminating the session.',
      endpoint: '/api/key',
      body: { name: workerName, key: 'C-c' },
      confirm: null,
      tone: 'neutral',
      successMessage: (n) => `Pause (Ctrl+C) sent to ${n}`,
    },
    {
      kind: 'resume',
      label: 'Resume (Enter)',
      description: 'Send Enter to resume an idle prompt or approve a pending confirmation.',
      endpoint: '/api/key',
      body: { name: workerName, key: 'Enter' },
      confirm: null,
      tone: 'neutral',
      successMessage: (n) => `Resume (Enter) sent to ${n}`,
    },
    {
      kind: 'cancel',
      label: 'Cancel task',
      description: 'Cancel the queued / pending / in-flight task for this worker.',
      endpoint: '/api/cancel',
      body: { name: workerName },
      confirm: `Cancel the current or pending task for "${workerName}"?`,
      tone: 'warn',
      successMessage: (n) => `Task cancel requested for ${n}`,
    },
    {
      kind: 'restart',
      label: 'Restart',
      description: 'Kill the PTY process and spawn a fresh one on the same branch/worktree.',
      endpoint: '/api/restart',
      body: { name: workerName },
      confirm:
        `Restart "${workerName}"? The current process will be killed and a fresh session will start on the same branch.`,
      tone: 'warn',
      successMessage: (n) => `Restart requested for ${n}`,
    },
    {
      kind: 'rollback',
      label: 'Rollback',
      description: 'git reset --soft back to the worker start commit. Staged changes are preserved.',
      endpoint: '/api/rollback',
      body: { name: workerName },
      confirm:
        `Rollback "${workerName}" to its start commit? Commits made during the session will be unstaged.`,
      tone: 'danger',
      successMessage: (n) => `Rollback executed for ${n}`,
    },
    {
      kind: 'close',
      label: 'Stop / Close',
      description: 'Terminate the worker, remove its worktree, and delete the c4/ branch.',
      endpoint: '/api/close',
      body: { name: workerName },
      confirm:
        `Close "${workerName}"? This terminates the session and removes its worktree and branch.`,
      tone: 'danger',
      successMessage: (n) => `Closed ${n}`,
    },
  ];
}

async function postAction(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // ignore non-JSON response bodies; HTTP status still tells us ok
    }
    if (!res.ok) {
      const err =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    if (
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      (payload as { error: unknown }).error
    ) {
      return { ok: false, error: String((payload as { error: unknown }).error) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export default function ControlPanel({ workerName }: ControlPanelProps) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busyKind, setBusyKind] = useState<ActionKind | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState<BatchKind | null>(null);
  const [batchResults, setBatchResults] = useState<BatchOutcome[] | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const fetchList = useCallback(async () => {
    try {
      const res = await apiFetch('/api/list');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ListResponse;
      setWorkers(Array.isArray(data.workers) ? data.workers : []);
    } catch {
      // The sidebar already surfaces list errors; keep the panel silent.
    }
  }, []);

  useEffect(() => {
    fetchList();
    const interval = setInterval(fetchList, 5000);
    return () => clearInterval(interval);
  }, [fetchList]);

  const actions = buildActions(workerName);

  const runSingle = useCallback(
    async (action: SingleAction) => {
      if (action.confirm && !window.confirm(action.confirm)) return;
      setBusyKind(action.kind);
      const res = await postAction(action.endpoint, action.body);
      if (res.ok) {
        showToast(action.successMessage(workerName), 'success');
      } else {
        showToast(`${action.label} failed: ${res.error || 'unknown'}`, 'error');
      }
      setBusyKind(null);
      fetchList();
    },
    [workerName, showToast, fetchList],
  );

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

  const runBatch = useCallback(
    async (kind: BatchKind) => {
      const names = [...selected];
      if (names.length === 0) return;
      const confirmMsg =
        kind === 'close'
          ? `Close ${names.length} worker(s)? Each session and worktree will be terminated.`
          : `Cancel the current task for ${names.length} worker(s)?`;
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
          `Batch ${kind}: ${okCount} ok`,
          'success',
        );
      } else {
        showToast(
          `Batch ${kind}: ${okCount} ok / ${failCount} failed`,
          'error',
        );
      }
      setBatchBusy(null);
      fetchList();
      if (kind === 'close') {
        setSelected(new Set());
      }
    },
    [selected, showToast, fetchList],
  );

  const selectedCount = selected.size;
  const selectableWorkers = workers;
  const disableBatch = batchBusy !== null || selectedCount === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
      <section
        aria-label="Worker control panel"
        className="rounded border border-gray-800 bg-gray-900 p-4"
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
            Controls - {workerName}
          </h3>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          All destructive actions prompt for confirmation. Pause/Resume are instant.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {actions.map((action) => {
            const isBusy = busyKind === action.kind;
            const disabled = busyKind !== null;
            return (
              <button
                key={action.kind}
                type="button"
                onClick={() => runSingle(action)}
                disabled={disabled}
                title={action.description}
                className={`flex flex-col items-start gap-1 rounded px-3 py-2 text-left text-sm text-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  TONE_CLASS[action.tone]
                }`}
              >
                <span className="font-semibold">
                  {isBusy ? `${action.label} ...` : action.label}
                </span>
                <span className="text-xs font-normal text-gray-200/80">
                  {action.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        aria-label="Batch controls"
        className="rounded border border-gray-800 bg-gray-900 p-4"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
            Batch - {selectedCount} selected
          </h3>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              disabled={selectableWorkers.length === 0}
              className="rounded bg-gray-700 px-2 py-1 text-gray-100 hover:bg-gray-600 disabled:opacity-50"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedCount === 0}
              className="rounded bg-gray-700 px-2 py-1 text-gray-100 hover:bg-gray-600 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>

        {selectableWorkers.length === 0 ? (
          <div className="text-xs text-gray-500">No workers available.</div>
        ) : (
          <ul className="mb-3 max-h-48 overflow-y-auto rounded bg-gray-950/50 p-2 text-xs text-gray-200">
            {selectableWorkers.map((w) => {
              const checked = selected.has(w.name);
              return (
                <li key={w.name} className="flex items-center gap-2 py-0.5">
                  <label className="flex flex-1 items-center gap-2 truncate">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(w.name)}
                      aria-label={`Select ${w.name}`}
                    />
                    <span className="truncate font-mono">{w.name}</span>
                  </label>
                  <span className="shrink-0 text-gray-500">{w.status}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runBatch('cancel')}
            disabled={disableBatch}
            className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-gray-100 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {batchBusy === 'cancel' ? 'Cancel selected ...' : 'Cancel selected'}
          </button>
          <button
            type="button"
            onClick={() => runBatch('close')}
            disabled={disableBatch}
            className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-gray-100 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {batchBusy === 'close' ? 'Close selected ...' : 'Close selected'}
          </button>
        </div>

        {batchResults && batchResults.length > 0 && (
          <div className="mt-3 rounded bg-gray-950/60 p-2 text-xs">
            <div className="mb-1 text-gray-400">Last batch results:</div>
            <ul className="space-y-0.5">
              {batchResults.map((r) => (
                <li
                  key={r.name}
                  className={r.ok ? 'text-green-400' : 'text-red-400'}
                >
                  <span className="font-mono">{r.name}</span>
                  {': '}
                  {r.ok ? 'ok' : r.error || 'failed'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </div>
    </div>
  );
}
