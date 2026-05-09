import { useCallback, useState } from 'react';
import { Check, GitMerge, Loader2, OctagonAlert, X } from 'lucide-react';
import Toast from './Toast';
import { apiFetch } from '../lib/api';
import { Button, type ButtonProps } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useToast } from '../lib/use-toast';

export interface WorkerActionsProps {
  workerName: string;
}

// (v1.10.708) ToastState + showToast moved to lib/use-toast.

type ActionKind = 'merge' | 'approve' | 'interrupt' | 'close';

interface ActionConfig {
  kind: ActionKind;
  label: string;
  confirm: string;
  endpoint: string;
  body: Record<string, unknown>;
  successMessage: string;
  icon: JSX.Element;
  variant: NonNullable<ButtonProps['variant']>;
  disabled?: boolean;
  disabledTitle?: string;
}

export default function WorkerActions({ workerName }: WorkerActionsProps) {
  useLocale();
  // (v1.10.708) Toast slot moved to lib/use-toast.
  const { toast, showToast, dismissToast } = useToast();
  const [busyKind, setBusyKind] = useState<ActionKind | null>(null);

  const actions: ActionConfig[] = [
    {
      kind: 'merge',
      label: t('worker.action.merge'),
      confirm: tFormat('worker.action.merge.confirm', { name: workerName }),
      endpoint: '/api/merge',
      body: { name: workerName },
      successMessage: tFormat('worker.action.merge.success', { name: workerName }),
      icon: <GitMerge className="h-4 w-4" />,
      variant: 'outline',
    },
    {
      kind: 'approve',
      label: t('worker.action.approve'),
      confirm: tFormat('worker.action.approve.confirm', { name: workerName }),
      endpoint: '/api/key',
      body: { name: workerName, key: 'Enter' },
      successMessage: tFormat('worker.action.approve.success', { name: workerName }),
      icon: <Check className="h-4 w-4" />,
      variant: 'outline',
    },
    {
      kind: 'interrupt',
      label: t('worker.action.interrupt'),
      confirm: tFormat('worker.action.interrupt.confirm', { name: workerName }),
      endpoint: '/api/key',
      body: { name: workerName, key: 'C-c' },
      successMessage: tFormat('worker.action.interrupt.success', { name: workerName }),
      icon: <OctagonAlert className="h-4 w-4" />,
      variant: 'outline',
    },
    {
      kind: 'close',
      label: t('worker.action.close'),
      confirm: tFormat('worker.action.close.confirm', { name: workerName }),
      endpoint: '/api/close',
      body: { name: workerName },
      successMessage: tFormat('worker.action.close.success', { name: workerName }),
      icon: <X className="h-4 w-4" />,
      variant: 'destructive',
    },
  ];

  const runAction = useCallback(
    async (action: ActionConfig) => {
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
    },
    [showToast],
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const isDisabled = action.disabled || busyKind !== null;
          const isBusy = busyKind === action.kind;
          return (
            <Button
              key={action.kind}
              type="button"
              variant={action.variant}
              size="sm"
              onClick={() => runAction(action)}
              disabled={isDisabled}
              title={action.disabled ? action.disabledTitle : undefined}
            >
              {isBusy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                action.icon
              )}
              <span>{action.label}</span>
            </Button>
          );
        })}
      </div>

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={dismissToast}
          />
        )}
      </div>
    </>
  );
}
