import { useCallback, useState } from 'react';
import {
  GitMerge,
  CornerDownLeft,
  Octagon,
  Pause,
  Play,
  Undo2,
  Power,
  RefreshCw,
  Ban,
  type LucideIcon,
} from 'lucide-react';
import Toast, { type ToastType } from './Toast';
import { cn } from '../lib/cn';

export interface WorkerActionsProps {
  workerName: string;
}

interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

type ActionKind =
  | 'merge'
  | 'approve'
  | 'interrupt'
  | 'cancel'
  | 'suspend'
  | 'resume'
  | 'restart'
  | 'rollback'
  | 'close';

type Tone = 'neutral' | 'warning' | 'danger';

interface ActionConfig {
  kind: ActionKind;
  label: string;
  Icon: LucideIcon;
  confirm: string;
  endpoint: string;
  body: Record<string, unknown>;
  successMessage: string;
  tone: Tone;
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-border bg-surface-2 text-foreground hover:bg-surface-3',
  warning: 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/15',
  danger: 'border-danger/60 bg-danger/15 text-danger hover:bg-danger/20',
};

export default function WorkerActions({ workerName }: WorkerActionsProps) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busyKind, setBusyKind] = useState<ActionKind | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const actions: ActionConfig[] = [
    {
      kind: 'merge',
      label: 'Merge',
      Icon: GitMerge,
      confirm: `Merge worker "${workerName}" into main?`,
      endpoint: '/api/merge',
      body: { name: workerName },
      successMessage: `Merged ${workerName}`,
      tone: 'neutral',
    },
    {
      kind: 'approve',
      label: 'Approve',
      Icon: CornerDownLeft,
      confirm: `Send Enter (approve) to "${workerName}"?`,
      endpoint: '/api/key',
      body: { name: workerName, key: 'Enter' },
      successMessage: `Sent Enter to ${workerName}`,
      tone: 'neutral',
    },
    {
      kind: 'interrupt',
      label: 'Ctrl+C',
      Icon: Octagon,
      confirm: `Send Ctrl+C to "${workerName}"?`,
      endpoint: '/api/key',
      body: { name: workerName, key: 'C-c' },
      successMessage: `Sent Ctrl+C to ${workerName}`,
      tone: 'warning',
    },
    {
      kind: 'cancel',
      label: 'Cancel task',
      Icon: Ban,
      confirm: `Cancel the running task on "${workerName}"? (Ctrl+C × 2)`,
      endpoint: '/api/cancel',
      body: { name: workerName },
      successMessage: `Cancelled task on ${workerName}`,
      tone: 'warning',
    },
    {
      kind: 'suspend',
      label: 'Suspend',
      Icon: Pause,
      confirm: `Pause worker "${workerName}" (SIGSTOP)?`,
      endpoint: '/api/suspend',
      body: { name: workerName },
      successMessage: `Suspended ${workerName}`,
      tone: 'neutral',
    },
    {
      kind: 'resume',
      label: 'Resume',
      Icon: Play,
      confirm: `Resume worker "${workerName}" (SIGCONT)?`,
      endpoint: '/api/resume',
      body: { name: workerName },
      successMessage: `Resumed ${workerName}`,
      tone: 'neutral',
    },
    {
      kind: 'restart',
      label: 'Restart',
      Icon: RefreshCw,
      confirm: `Restart worker "${workerName}"? Resumes the previous Claude session if available.`,
      endpoint: '/api/restart',
      body: { name: workerName, resume: true },
      successMessage: `Restarted ${workerName}`,
      tone: 'warning',
    },
    {
      kind: 'rollback',
      label: 'Rollback',
      Icon: Undo2,
      confirm: `Reset worker "${workerName}"'s branch to the pre-task commit? Uncommitted changes are lost.`,
      endpoint: '/api/rollback',
      body: { name: workerName },
      successMessage: `Rolled back ${workerName}`,
      tone: 'warning',
    },
    {
      kind: 'close',
      label: 'Close',
      Icon: Power,
      confirm: `Close worker "${workerName}"? This will terminate the session.`,
      endpoint: '/api/close',
      body: { name: workerName },
      successMessage: `Closed ${workerName}`,
      tone: 'danger',
    },
  ];

  const runAction = useCallback(
    async (action: ActionConfig) => {
      if (!window.confirm(action.confirm)) return;

      setBusyKind(action.kind);
      try {
        const res = await fetch(action.endpoint, {
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
          showToast(`${action.label} failed: ${errMsg}`, 'error');
          return;
        }

        if (payload && typeof payload === 'object' && 'error' in payload && (payload as { error: unknown }).error) {
          showToast(`${action.label} failed: ${String((payload as { error: unknown }).error)}`, 'error');
          return;
        }

        showToast(action.successMessage, 'success');
      } catch (e) {
        showToast(`${action.label} failed: ${(e as Error).message}`, 'error');
      } finally {
        setBusyKind(null);
      }
    },
    [showToast],
  );

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => {
          const isDisabled = busyKind !== null;
          const Icon = action.Icon;
          return (
            <button
              key={action.kind}
              type="button"
              onClick={() => runAction(action)}
              disabled={isDisabled}
              title={action.confirm}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-snappy disabled:cursor-not-allowed disabled:opacity-50',
                TONE_CLASS[action.tone],
              )}
            >
              <Icon size={13} />
              {busyKind === action.kind ? '...' : action.label}
            </button>
          );
        })}
      </div>

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
    </>
  );
}
