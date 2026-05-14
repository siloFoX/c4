import { useState } from 'react';
import { Brain, HelpCircle, RefreshCw, Send, Upload } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Input, Label, Panel, Popover, Stepper, Textarea, Tooltip } from '../components/ui';
import { cn } from '../lib/cn';
import { text } from '../lib/typography';
import { usePlanContent } from '../lib/use-plan-content';
import { usePlanDispatch } from '../lib/use-plan-dispatch';
import { usePlanWorkers } from '../lib/use-plan-workers';
import { useToast } from '../lib/use-toast';
import { renderMarkdown } from '../lib/markdown';
import { t, useLocale } from '../lib/i18n';

// 8.20B Plan. Dispatches a planning task via POST /api/plan and polls
// GET /api/plan?name=<worker> to display the resulting plan.md with
// our minimal markdown renderer. A "re-dispatch as task" button takes
// the generated plan and POSTs it via /api/task so the planner output
// can graduate into real work in one click.

// (v1.10.661) PlanResponse + plan-content fetch moved to
// lib/use-plan-content.

// (v1.10.694) ToastState + showToast moved to lib/use-toast.

export default function Plan() {
  useLocale();


  const [selected, setSelected] = useState<string>('');
  const [task, setTask] = useState('');
  const [branch, setBranch] = useState('');
  const [output, setOutput] = useState('');
  // (v1.10.694) Toast slot moved to hook.
  const { toast, showToast, dismissToast } = useToast();

  // (v1.10.661) Plan-content fetch moved to hook.
  const { plan, loading, error, setError, loadPlan } = usePlanContent({ selected });

  // (v1.10.693) Worker-list load + auto-select-first moved to hook.
  const { workers } = usePlanWorkers({ selected, setSelected, setError });

  // (v1.10.680) Dispatch + redispatch flows moved to hook.
  const { dispatching, dispatchPlan, redispatch } = usePlanDispatch({
    selected, task, branch, output, plan, setError, showToast, loadPlan,
  });

  return (
    <PageFrame
      title={t('planPage.title')}
      description={t('planPage.description')}
      actions={
        <>
          <Tooltip label={t('plan.tooltip.refresh')}>
            <Button type="button" variant="ghost" size="sm" onClick={loadPlan} disabled={loading || !selected}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">{t('planPage.refreshPlan')}</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="plan.summary"
        cliKey="plan.cli"
        exampleKey="plan.example"
        useCasesKey="plan.useCases"
        onOpenHelp={openHelpDrawer}
      />
      <div className="flex items-center justify-between gap-2">
        <Stepper
          steps={[
            { id: 'worker', label: 'Select worker' },
            { id: 'task', label: 'Describe task' },
            { id: 'dispatch', label: 'Dispatch plan' },
            { id: 'result', label: 'View plan' },
          ]}
          currentIndex={
            plan?.content
              ? 3
              : dispatching || (selected && task.trim())
              ? 2
              : selected
              ? 1
              : 0
          }
          size="sm"
        />
        <Popover
          placement="bottom"
          align="end"
          trigger={
            <button
              type="button"
              aria-label="Plan stage details"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          }
          content={
            <div className="w-64 space-y-1 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Planning flow</p>
              <p>1. Select an existing worker as plan target.</p>
              <p>2. Describe the work; optionally set a branch + output path.</p>
              <p>3. Dispatch fires <code>POST /api/plan</code>.</p>
              <p>4. View the generated plan.md and graduate into a task.</p>
            </div>
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="plan-worker">{t('planPage.worker')}</Label>
          <select
            id="plan-worker"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <option value="">— select —</option>
            {workers.map((w) => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Tooltip label={t('plan.tooltip.branch')} placement="top">
            <Input
              id="plan-branch"
              label={t('planPage.branch')}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={t('planPage.branch.placeholder')}
            />
          </Tooltip>
        </div>
        <div className="md:col-span-2">
          <Textarea
            id="plan-task"
            label={t('planPage.task')}
            rows={4}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder={t('planPage.task.placeholder')}
          />
        </div>
        <div>
          <Tooltip label={t('plan.tooltip.output')} placement="top">
            <Input
              id="plan-output"
              label={t('planPage.output')}
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              placeholder={t('planPage.output.placeholder')}
            />
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Tooltip label={t('plan.tooltip.dispatch')}>
          <Button type="button" variant="default" size="sm" onClick={dispatchPlan} disabled={dispatching}>
            {dispatching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span>{t('planPage.send')}</span>
          </Button>
        </Tooltip>
        <Tooltip label={t('plan.tooltip.redispatch')}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={redispatch}
            disabled={dispatching || !plan?.content}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{t('planPage.redispatch')}</span>
          </Button>
        </Tooltip>
      </div>

      {error && <ErrorPanel message={error} />}

      <Panel
        title={t('planPage.outputHeading')}
        icon={<Brain className="h-3.5 w-3.5" />}
        className="p-3"
      >
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : plan?.content ? (
          <div className={cn('prose prose-invert max-h-[480px] max-w-none overflow-y-auto', text.bodySm)}>
            {renderMarkdown(plan.content)}
          </div>
        ) : (
          <EmptyPanel message={t('plan.empty')} />
        )}
      </Panel>

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
