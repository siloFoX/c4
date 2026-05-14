import { useCallback, useState } from 'react';
import { Play, RefreshCw, Sparkles } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Checkbox, Input, Label, Panel, Progress, Textarea, Tooltip } from '../components/ui';
import { t, useLocale } from '../lib/i18n';
import { useBatchSubmit } from '../lib/use-batch-submit';
import { useToast } from '../lib/use-toast';

// 8.20B Batch dispatcher. POSTs to the new /api/batch endpoint that
// this patch adds to daemon.js. Lets the operator fan out the same
// task to N workers, or paste a line-per-task script and dispatch each
// as its own worker.

// (v1.10.658) BatchOutcome + BatchResponse + the submit
// flow moved to lib/use-batch-submit.

// (v1.10.694) ToastState + showToast moved to lib/use-toast.

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
  // (v1.10.694) Toast slot moved to hook.
  const { toast, showToast, dismissToast } = useToast();

  // (v1.10.658) POST /api/batch flow moved to hook.
  const { busy, result, error, submit } = useBatchSubmit({
    mode, task, count, tasksText, namePrefix, branch, profile, autoMode, showToast,
  });

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
      title={t('batchPage.title')}
      description={t('batchPage.description')}
      actions={
        <>
          <Tooltip label={t('batch.tooltip.dispatch')}>
            <Button type="button" variant="default" size="sm" onClick={submit} disabled={busy}>
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              <span>{busy ? t('batchPage.dispatching') : t('batchPage.dispatch')}</span>
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
            {t('batchPage.modeCount')}
          </Button>
        </Tooltip>
        <Tooltip label={t('batch.tooltip.modeFile')}>
          <Button
            type="button"
            variant={mode === 'file' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('file')}
          >
            {t('batchPage.modeFile')}
          </Button>
        </Tooltip>
      </div>

      {mode === 'count' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Textarea
              id="batch-task"
              label={t('batchPage.task')}
              rows={4}
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder={t('batchPage.task.placeholder')}
            />
          </div>
          <div>
            <Input
              id="batch-count"
              label={t('batchPage.count')}
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div>
            <Tooltip label={t('batch.tooltip.prefix')} placement="top">
              <Input
                id="batch-prefix"
                label={t('batchPage.namePrefix')}
                value={namePrefix}
                onChange={(e) => setNamePrefix(e.target.value)}
                placeholder={t('batchPage.namePrefix.placeholder')}
              />
            </Tooltip>
          </div>
        </div>
      ) : (
        <div>
          <Textarea
            id="batch-tasks"
            label={t('batchPage.tasks')}
            rows={8}
            value={tasksText}
            onChange={(e) => setTasksText(e.target.value)}
            className="font-mono text-xs"
            placeholder={t('batch.tasksPlaceholder')}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <Tooltip label={t('batch.tooltip.branch')} placement="top">
            <Input
              id="batch-branch"
              label={t('batchPage.branchPrefix')}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={t('batchPage.branchPrefix.placeholder')}
            />
          </Tooltip>
        </div>
        <div>
          <Tooltip label={t('batch.tooltip.profile')} placement="top">
            <Input
              id="batch-profile"
              label={t('batchPage.profile')}
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder={t('batchPage.profile.placeholder')}
            />
          </Tooltip>
        </div>
        <div className="flex items-end gap-2">
          <Tooltip label={t('batch.tooltip.autoMode')} placement="top">
            <Checkbox
              checked={autoMode}
              onChange={(e) => setAutoMode(e.target.checked)}
              label={t('batchPage.autoMode')}
            />
          </Tooltip>
        </div>
      </div>

      {busy && (
        <Progress
          indeterminate
          label
          aria-label={t('batchPage.dispatching')}
        />
      )}

      {error && <ErrorPanel message={error} />}

      {result && (
        <Panel title={t('batchPage.results')} className="p-3 text-xs">
          <div className="mb-2 text-sm text-muted-foreground">
            {`${result.ok} ok / ${result.fail} failed / ${result.total} total`}
          </div>
          <Progress
            value={result.ok}
            max={result.total || 1}
            label
            variant={result.fail === 0 ? 'success' : 'warning'}
            className="mb-2"
          />

          <ul className="space-y-0.5">
            {result.results.map((r) => (
              <li
                key={r.name}
                className={r.ok ? 'text-success' : 'text-destructive'}
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
            onDismiss={dismissToast}
          />
        )}
      </div>
    </PageFrame>
  );
}
