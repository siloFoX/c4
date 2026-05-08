import { useCallback, useEffect, useState } from 'react';
import {
  CircleSlash,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import Toast, { type ToastType } from './Toast';
import StatusMessageCard from './StatusMessageCard';
import ControlPanelActions from './ControlPanelActions';
import { apiFetch } from '../lib/api';
import { t, tFormat, useLocale } from '../lib/i18n';
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
// 8.8: Per-worker control panel + batch control for bulk close/cancel.
// Keeps the existing WorkerActions toolbar and /api/* endpoints intact --
// this component layers on top of /api/close, /api/send, /api/key,
// /api/rollback plus the new /api/cancel and /api/restart endpoints.

interface ControlPanelProps {
  workerName: string;
}

// (v1.10.590) ActionKind / ActionTone / SingleAction / TONE_VARIANT
// promoted to exports so the extracted ControlPanelActions sibling
// can type its props.
export type ActionKind =
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'restart'
  | 'rollback'
  | 'close';

export type ActionTone = 'neutral' | 'warn' | 'danger';

export interface SingleAction {
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
  error?: string | undefined;
}

export const TONE_VARIANT: Record<ActionTone, NonNullable<ButtonProps['variant']>> = {
  neutral: 'secondary',
  warn: 'outline',
  danger: 'destructive',
};

function buildActions(workerName: string): SingleAction[] {
  return [
    {
      kind: 'pause',
      label: t('controlPanel.action.pause.label'),
      description: t('controlPanel.action.pause.description'),
      endpoint: '/api/key',
      body: { name: workerName, key: 'C-c' },
      confirm: null,
      tone: 'neutral',
      icon: <Pause className="h-4 w-4" />,
      successMessage: (n) => tFormat('controlPanel.action.pause.success', { worker: n }),
    },
    {
      kind: 'resume',
      label: t('controlPanel.action.resume.label'),
      description: t('controlPanel.action.resume.description'),
      endpoint: '/api/key',
      body: { name: workerName, key: 'Enter' },
      confirm: null,
      tone: 'neutral',
      icon: <Play className="h-4 w-4" />,
      successMessage: (n) => tFormat('controlPanel.action.resume.success', { worker: n }),
    },
    {
      kind: 'cancel',
      label: t('controlPanel.action.cancel.label'),
      description: t('controlPanel.action.cancel.description'),
      endpoint: '/api/cancel',
      body: { name: workerName },
      confirm: tFormat('controlPanel.action.cancel.confirm', { worker: workerName }),
      tone: 'warn',
      icon: <CircleSlash className="h-4 w-4" />,
      successMessage: (n) => tFormat('controlPanel.action.cancel.success', { worker: n }),
    },
    {
      kind: 'restart',
      label: t('controlPanel.action.restart.label'),
      description: t('controlPanel.action.restart.description'),
      endpoint: '/api/restart',
      body: { name: workerName },
      confirm: tFormat('controlPanel.action.restart.confirm', { worker: workerName }),
      tone: 'warn',
      icon: <RefreshCw className="h-4 w-4" />,
      successMessage: (n) => tFormat('controlPanel.action.restart.success', { worker: n }),
    },
    {
      kind: 'rollback',
      label: t('controlPanel.action.rollback.label'),
      description: t('controlPanel.action.rollback.description'),
      endpoint: '/api/rollback',
      body: { name: workerName },
      confirm: tFormat('controlPanel.action.rollback.confirm', { worker: workerName }),
      tone: 'danger',
      icon: <RotateCcw className="h-4 w-4" />,
      successMessage: (n) => tFormat('controlPanel.action.rollback.success', { worker: n }),
    },
    {
      kind: 'close',
      label: t('controlPanel.action.close.label'),
      description: t('controlPanel.action.close.description'),
      endpoint: '/api/close',
      body: { name: workerName },
      confirm: tFormat('controlPanel.action.close.confirm', { worker: workerName }),
      tone: 'danger',
      icon: <X className="h-4 w-4" />,
      successMessage: (n) => tFormat('controlPanel.action.close.success', { worker: n }),
    },
  ];
}

// (v1.10.561) StatusMessageCard extracted to ./StatusMessageCard.tsx

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
  useLocale();
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
    },
    [selected, showToast, fetchList],
  );

  const selectedCount = selected.size;
  const selectableWorkers = workers;
  const disableBatch = batchBusy !== null || selectedCount === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
      {/* (v1.10.590) Single-action grid extracted to
          ./ControlPanelActions.tsx. */}
      <ControlPanelActions
        workerName={workerName}
        actions={actions}
        busyKind={busyKind}
        onRunSingle={runSingle}
      />

      <Card aria-label={t('controlPanel.batch.label')}>
        <CardHeader className="flex-row items-start justify-between gap-2 p-4 md:p-5">
          <div>
            <CardTitle>{t('controlPanel.batch.title')}</CardTitle>
            <CardDescription>
              {tFormat('controlPanel.batch.description', { count: selectedCount })}
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
              {t('controlPanel.batch.selectAll')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={clearSelection}
              disabled={selectedCount === 0}
            >
              {t('controlPanel.batch.clear')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
          {selectableWorkers.length === 0 ? (
            <div className="text-xs text-muted-foreground">{t('controlPanel.batch.empty')}</div>
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
                          aria-label={tFormat('controlPanel.batch.selectAria', { worker: w.name })}
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
                {batchBusy === 'cancel'
                  ? t('controlPanel.batch.cancelSelectedBusy')
                  : t('controlPanel.batch.cancelSelected')}
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
                {batchBusy === 'close'
                  ? t('controlPanel.batch.closeSelectedBusy')
                  : t('controlPanel.batch.closeSelected')}
              </span>
            </Button>
          </div>

          {batchResults && batchResults.length > 0 && (
            <Panel
              title={t('controlPanel.lastBatch.title')}
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
                    {r.ok
                      ? t('controlPanel.batch.statusOk')
                      : r.error || t('controlPanel.batch.statusFailed')}
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
