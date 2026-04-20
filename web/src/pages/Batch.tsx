import { useCallback, useState } from 'react';
import { Play, RefreshCw, Sparkles } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import Toast, { type ToastType } from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Input, Label, Panel, Tooltip } from '../components/ui';
import { apiPost } from '../lib/api';
import { t, useLocale } from '../lib/i18n';

// 8.20B Batch dispatcher. POSTs to the new /api/batch endpoint that
// this patch adds to daemon.js. Lets the operator fan out the same
// task to N workers, or paste a line-per-task script and dispatch each
// as its own worker.

interface BatchOutcome { name: string; ok: boolean; error?: string }
interface BatchResponse {
  ok: number;
  fail: number;
  total: number;
  results: BatchOutcome[];
  error?: string;
}

interface ToastState { id: number; message: string; type: ToastType }

export default function Batch() {
  useLocale();
  const [task, setTask] = useState('');
  const [count, setCount] = useState<number>(1);
  const [tasksText, setTasksText] = useState('');
  const [mode, setMode] = useState<'count' | 'file'>('count');
  const [branch, setBranch] = useState('');
  const [profile, setProfile] = useState('');
  const [namePrefix, setNamePrefix] = useState('batch');
  const [autoMode, setAutoMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setResult(null);
    let tasks: string[] = [];
    if (mode === 'file') {
      tasks = tasksText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      if (tasks.length === 0) {
        setError('Paste at least one non-comment line in Tasks.');
        return;
      }
    } else {
      if (!task.trim()) {
        setError('Task is required.');
        return;
      }
      if (count < 1) {
        setError('Count must be at least 1.');
        return;
      }
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { namePrefix: namePrefix || 'batch' };
      if (mode === 'file') {
        body.tasks = tasks;
      } else {
        body.task = task;
        body.count = count;
      }
      if (branch) body.branch = branch;
      if (profile) body.profile = profile;
      if (autoMode) body.autoMode = true;
      const r = (await apiPost<BatchResponse>('/api/batch', body)) as BatchResponse;
      if (r.error) {
        setError(r.error);
      } else {
        setResult(r);
        if (r.fail === 0) {
          showToast(`Batch dispatched: ${r.ok}/${r.total} ok`, 'success');
        } else {
          showToast(`Batch finished with failures: ${r.ok} ok, ${r.fail} failed`, 'error');
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }, [autoMode, branch, count, mode, namePrefix, profile, task, tasksText, showToast]);

  const prefillExample = useCallback(() => {
    if (mode === 'count') {
      setTask(t('batch.example'));
      if (count < 2) setCount(3);
    } else {
      setTasksText(t('batch.exampleMulti'));
    }
  }, [mode, count]);

  return (
    <PageFrame
      title="Batch dispatch"
      description="Send the same task to N workers or one task per line from a pasted list. Mirrors `c4 batch`."
      actions={
        <>
          <Tooltip label={t('batch.tooltip.dispatch')}>
            <Button type="button" variant="default" size="sm" onClick={submit} disabled={busy}>
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              <span>{busy ? 'Dispatching...' : 'Dispatch'}</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="batch.summary"
        cliKey="batch.cli"
        exampleKey="batch.example"
        useCasesKey="batch.useCases"
        onOpenHelp={openHelpDrawer}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={prefillExample}
            aria-label={t('batch.tryExample')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t('batch.tryExample')}</span>
          </Button>
        }
      />
      <div className="flex gap-2 text-xs">
        <Tooltip label={t('batch.tooltip.modeCount')}>
          <Button
            type="button"
            variant={mode === 'count' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('count')}
          >
            Same task N times
          </Button>
        </Tooltip>
        <Tooltip label={t('batch.tooltip.modeFile')}>
          <Button
            type="button"
            variant={mode === 'file' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('file')}
          >
            One task per line
          </Button>
        </Tooltip>
      </div>

      {mode === 'count' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="batch-task">Task</Label>
            <textarea
              id="batch-task"
              rows={4}
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Task to send to every worker"
            />
          </div>
          <div>
            <Label htmlFor="batch-count">Count</Label>
            <Input
              id="batch-count"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div>
            <Label htmlFor="batch-prefix">Name prefix</Label>
            <Tooltip label={t('batch.tooltip.prefix')} placement="top">
              <Input
                id="batch-prefix"
                value={namePrefix}
                onChange={(e) => setNamePrefix(e.target.value)}
                placeholder="batch"
              />
            </Tooltip>
          </div>
        </div>
      ) : (
        <div>
          <Label htmlFor="batch-tasks">Tasks (one per line, `#` lines ignored)</Label>
          <textarea
            id="batch-tasks"
            rows={8}
            value={tasksText}
            onChange={(e) => setTasksText(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={"# one task per line\nfix lint errors in src/\nadd tests for auth.js"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="batch-branch">Branch prefix</Label>
          <Tooltip label={t('batch.tooltip.branch')} placement="top">
            <Input
              id="batch-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature"
            />
          </Tooltip>
        </div>
        <div>
          <Label htmlFor="batch-profile">Profile</Label>
          <Tooltip label={t('batch.tooltip.profile')} placement="top">
            <Input
              id="batch-profile"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="web, planner, ..."
            />
          </Tooltip>
        </div>
        <div className="flex items-end gap-2">
          <Tooltip label={t('batch.tooltip.autoMode')} placement="top">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
              />
              <span>Auto mode</span>
            </label>
          </Tooltip>
        </div>
      </div>

      {error && <ErrorPanel message={error} />}

      {result && (
        <Panel title="Results" className="p-3 text-xs">
          <div className="mb-2 text-sm text-muted-foreground">
            {`${result.ok} ok / ${result.fail} failed / ${result.total} total`}
          </div>
          <ul className="space-y-0.5">
            {result.results.map((r) => (
              <li
                key={r.name}
                className={r.ok ? 'text-emerald-400' : 'text-destructive'}
              >
                <span className="font-mono">{r.name}</span>
                {': '}
                {r.ok ? 'created' : r.error || 'failed'}
              </li>
            ))}
          </ul>
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
