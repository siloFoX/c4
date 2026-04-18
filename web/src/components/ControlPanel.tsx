import { useCallback, useEffect, useState } from 'react';
import {
  CircleSlash,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import Toast, { type ToastType } from './Toast';
import { apiFetch } from '../lib/api';
import type { ListResponse, Worker } from '../types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Panel,
  type ButtonProps,
} from './ui';
import { cn } from '../lib/cn';

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

type ActionTone = 'neutral' | 'warn' | 'danger';

interface SingleAction {
  kind: ActionKind;
  label: string;
  description: string;
  endpoint: string;
  body: Record<string, unknown>;
  confirm: string | null;
  tone: ActionTone;
  icon: JSX.Element;
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

const TONE_VARIANT: Record<ActionTone, NonNullable<ButtonProps['variant']>> = {
  neutral: 'secondary',
  warn: 'outline',
  danger: 'destructive',
};

function buildActions(workerName: string): SingleAction[] {
  return [
    {
      kind: 'pause',
      label: 'Pause (Ctrl+C)',
      description:
        'Send Ctrl+C to interrupt the current work without terminating the session.',
      endpoint: '/api/key',
      body: { name: workerName, key: 'C-c' },
      confirm: null,
      tone: 'neutral',
      icon: <Pause className="h-4 w-4" />,
      successMessage: (n) => `Pause (Ctrl+C) sent to ${n}`,
    },
    {
      kind: 'resume',
      label: 'Resume (Enter)',
      description:
        'Send Enter to resume an idle prompt or approve a pending confirmation.',
      endpoint: '/api/key',
      body: { name: workerName, key: 'Enter' },
      confirm: null,
      tone: 'neutral',
      icon: <Play className="h-4 w-4" />,
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
      icon: <CircleSlash className="h-4 w-4" />,
      successMessage: (n) => `Task cancel requested for ${n}`,
    },
    {
      kind: 'restart',
      label: 'Restart',
      description:
        'Kill the PTY process and spawn a fresh one on the same branch/worktree.',
      endpoint: '/api/restart',
      body: { name: workerName },
      confirm: `Restart "${workerName}"? The current process will be killed and a fresh session will start on the same branch.`,
      tone: 'warn',
      icon: <RefreshCw className="h-4 w-4" />,
      successMessage: (n) => `Restart requested for ${n}`,
    },
    {
      kind: 'rollback',
      label: 'Rollback',
      description:
        'git reset --soft back to the worker start commit. Staged changes are preserved.',
      endpoint: '/api/rollback',
      body: { name: workerName },
      confirm: `Rollback "${workerName}" to its start commit? Commits made during the session will be unstaged.`,
      tone: 'danger',
      icon: <RotateCcw className="h-4 w-4" />,
      successMessage: (n) => `Rollback executed for ${n}`,
    },
    {
      kind: 'close',
      label: 'Stop / Close',
      description:
        'Terminate the worker, remove its worktree, and delete the c4/ branch.',
      endpoint: '/api/close',
      body: { name: workerName },
      confirm: `Close "${workerName}"? This terminates the session and removes its worktree and branch.`,
      tone: 'danger',
      icon: <X className="h-4 w-4" />,
      successMessage: (n) => `Closed ${n}`,
    },
  ];
}

// 8.20B: Slack status message form. Fire-and-forget POST /api/status-update
// that routes the operator's message through the notifications layer so
// oncall can see "worker X hit intervention" without opening the
// terminal. Kept as a tiny sibling component so the main ControlPanel
// stays focused on session control.
function StatusMessageCard({
  workerName,
  onToast,
}: {
  workerName: string;
  onToast: (message: string, type: ToastType) => void;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await apiFetch('/api/status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker: workerName, message: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onToast(`Status message sent for ${workerName}`, 'success');
      setMessage('');
    } catch (e) {
      onToast(`Status send failed: ${(e as Error).message}`, 'error');
    }
    setSending(false);
  }, [message, workerName, onToast]);

  return (
    <Card aria-label="Status message to Slack">
      <CardHeader className="p-4 md:p-5">
        <CardTitle>Status message</CardTitle>
        <CardDescription>
          Post a short status update to Slack tagged with this worker. Used for
          oncall handoffs and incident notes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-4 pt-0 md:p-5 md:pt-0">
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={`status for ${workerName}...`}
          aria-label={`Status message for ${workerName}`}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={send}
            disabled={sending || !message.trim()}
          >
            <Send className="h-3.5 w-3.5" />
            <span>{sending ? 'Sending...' : 'Send to Slack'}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
        showToast(`Batch ${kind}: ${okCount} ok`, 'success');
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
      <Card aria-label="Worker control panel">
        <CardHeader className="p-4 md:p-5">
          <CardTitle>Control</CardTitle>
          <CardDescription>
            {`Actions for ${workerName}. Destructive actions prompt for confirmation; Pause / Resume fire immediately.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 md:p-5 md:pt-0">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {actions.map((action) => {
              const isBusy = busyKind === action.kind;
              const disabled = busyKind !== null;
              return (
                <Button
                  key={action.kind}
                  type="button"
                  variant={TONE_VARIANT[action.tone]}
                  size="md"
                  onClick={() => runSingle(action)}
                  disabled={disabled}
                  title={action.description}
                  className={cn(
                    'h-auto min-h-[4rem] flex-col items-start gap-1 py-2 text-left'
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {action.icon}
                    <span>{isBusy ? `${action.label} ...` : action.label}</span>
                  </span>
                  <span className="w-full whitespace-normal text-xs font-normal opacity-80">
                    {action.description}
                  </span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card aria-label="Batch controls">
        <CardHeader className="flex-row items-start justify-between gap-2 p-4 md:p-5">
          <div>
            <CardTitle>Batch</CardTitle>
            <CardDescription>
              {`${selectedCount} selected - target multiple workers at once.`}
            </CardDescription>
          </div>
          <div className="flex gap-2 text-xs">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={selectAll}
              disabled={selectableWorkers.length === 0}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={clearSelection}
              disabled={selectedCount === 0}
            >
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
          {selectableWorkers.length === 0 ? (
            <div className="text-xs text-muted-foreground">No workers available.</div>
          ) : (
            <Panel className="max-h-48 overflow-y-auto p-2">
              <ul className="text-xs text-foreground">
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
                      <Badge variant="outline" className="shrink-0 uppercase">
                        {w.status}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => runBatch('cancel')}
              disabled={disableBatch}
            >
              <CircleSlash className="h-3.5 w-3.5" />
              <span>
                {batchBusy === 'cancel' ? 'Cancel selected ...' : 'Cancel selected'}
              </span>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => runBatch('close')}
              disabled={disableBatch}
            >
              <X className="h-3.5 w-3.5" />
              <span>
                {batchBusy === 'close' ? 'Close selected ...' : 'Close selected'}
              </span>
            </Button>
          </div>

          {batchResults && batchResults.length > 0 && (
            <Panel
              title="Last batch results"
              className="p-3 text-xs"
            >
              <ul className="space-y-0.5">
                {batchResults.map((r) => (
                  <li
                    key={r.name}
                    className={r.ok ? 'text-emerald-400' : 'text-destructive'}
                  >
                    <span className="font-mono">{r.name}</span>
                    {': '}
                    {r.ok ? 'ok' : r.error || 'failed'}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </CardContent>
      </Card>

      <StatusMessageCard workerName={workerName} onToast={showToast} />

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
