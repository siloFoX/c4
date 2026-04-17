import { useCallback, useState } from 'react';
import Toast, { type ToastType } from './Toast';

export interface WorkerActionsProps {
  workerName: string;
}

interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

type ActionKind = 'merge' | 'approve' | 'interrupt' | 'close';

interface ActionConfig {
  kind: ActionKind;
  label: string;
  confirm: string;
  endpoint: string;
  body: Record<string, unknown>;
  successMessage: string;
  className: string;
  disabled?: boolean;
  disabledTitle?: string;
}

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
      confirm: `Merge worker "${workerName}" into main?`,
      endpoint: '/api/merge',
      body: { name: workerName },
      successMessage: `Merged ${workerName}`,
      className: 'bg-gray-700 hover:bg-gray-600',
      disabled: true,
      disabledTitle: 'Daemon does not expose /merge route yet',
    },
    {
      kind: 'approve',
      label: 'Approve',
      confirm: `Send Enter (approve) to "${workerName}"?`,
      endpoint: '/api/key',
      body: { name: workerName, key: 'Enter' },
      successMessage: `Sent Enter to ${workerName}`,
      className: 'bg-gray-700 hover:bg-gray-600',
    },
    {
      kind: 'interrupt',
      label: 'Ctrl+C',
      confirm: `Send Ctrl+C to "${workerName}"?`,
      endpoint: '/api/key',
      body: { name: workerName, key: 'C-c' },
      successMessage: `Sent Ctrl+C to ${workerName}`,
      className: 'bg-gray-700 hover:bg-gray-600',
    },
    {
      kind: 'close',
      label: 'Close',
      confirm: `Close worker "${workerName}"? This will terminate the session.`,
      endpoint: '/api/close',
      body: { name: workerName },
      successMessage: `Closed ${workerName}`,
      className: 'bg-red-700 hover:bg-red-600',
    },
  ];

  const runAction = useCallback(
    async (action: ActionConfig) => {
      if (action.disabled) return;
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
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const isDisabled = action.disabled || busyKind !== null;
          return (
            <button
              key={action.kind}
              type="button"
              onClick={() => runAction(action)}
              disabled={isDisabled}
              title={action.disabled ? action.disabledTitle : undefined}
              className={`rounded px-3 py-1.5 text-xs font-medium text-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${action.className}`}
            >
              {busyKind === action.kind ? '…' : action.label}
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
