import { useCallback, useState } from 'react';
import { RefreshCw, Rocket } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import Toast, { type ToastType } from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Input, Label, Panel, Tooltip } from '../components/ui';
import { apiPost } from '../lib/api';
import { t, useLocale } from '../lib/i18n';

// 8.20B Auto mode. POSTs to /api/auto which spawns an autonomous
// manager + scribe for the given task. Mirrors `c4 auto`.

interface AutoResponse {
  name?: string;
  status?: string;
  branch?: string;
  error?: string;
  [key: string]: unknown;
}

interface ToastState { id: number; message: string; type: ToastType }

export default function Auto() {
  useLocale();
  const [task, setTask] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutoResponse | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const dispatch = useCallback(async () => {
    if (!task.trim()) {
      setError('Task is required.');
      return;
    }
    if (!window.confirm('Spawn an autonomous manager + scribe for this task? It will run with no further human approval until it finishes or halts.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { task };
      if (name.trim()) body.name = name.trim();
      const r = (await apiPost<AutoResponse>('/api/auto', body)) as AutoResponse;
      if (r.error) {
        setError(r.error);
        showToast(`Auto dispatch failed: ${r.error}`, 'error');
      } else {
        setResult(r);
        showToast(`Auto manager spawned${r.name ? ` as ${r.name}` : ''}`, 'success');
      }
    } catch (e) {
      setError((e as Error).message);
      showToast(`Auto dispatch failed: ${(e as Error).message}`, 'error');
    }
    setBusy(false);
  }, [task, name, showToast]);

  return (
    <PageFrame
      title="Auto mode"
      description="Spawn an autonomous manager + scribe pair. The manager creates its own workers, dispatches work, and reports back on completion."
      actions={
        <Tooltip label={t('auto.tooltip.dispatch')}>
          <Button type="button" variant="default" size="sm" onClick={dispatch} disabled={busy}>
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            <span>Dispatch</span>
          </Button>
        </Tooltip>
      }
    >
      <PageDescriptionBanner
        summaryKey="auto.summary"
        cliKey="auto.cli"
        exampleKey="auto.example"
        useCasesKey="auto.useCases"
        onOpenHelp={openHelpDrawer}
      />
      <Panel title={t('auto.scenario.heading')} className="p-3 text-xs">
        <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
          <li>{t('auto.scenario.overnight')}</li>
          <li>{t('auto.scenario.triage')}</li>
          <li>{t('auto.scenario.spike')}</li>
        </ul>
      </Panel>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="auto-name">Manager name (optional)</Label>
          <Tooltip label={t('auto.tooltip.name')} placement="top">
            <Input id="auto-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="auto-mgr" />
          </Tooltip>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="auto-task">Task</Label>
          <Tooltip label={t('auto.tooltip.task')} placement="top">
            <textarea
              id="auto-task"
              rows={6}
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Describe the outcome for the autonomous manager to deliver."
            />
          </Tooltip>
        </div>
      </div>

      {error && <ErrorPanel message={error} />}

      {result && (
        <Panel title="Dispatched" className="p-3 text-sm">
          <div className="flex flex-col gap-1 text-xs">
            {result.name && (
              <span>
                <span className="text-muted-foreground">Manager:</span>
                <span className="ml-2 font-mono text-foreground">{result.name}</span>
              </span>
            )}
            {result.branch && (
              <span>
                <span className="text-muted-foreground">Branch:</span>
                <span className="ml-2 font-mono text-foreground">{result.branch}</span>
              </span>
            )}
            {result.status && (
              <span>
                <span className="text-muted-foreground">Status:</span>
                <span className="ml-2 text-foreground">{result.status}</span>
              </span>
            )}
          </div>
        </Panel>
      )}

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
    </PageFrame>
  );
}
