import { useState } from 'react';
import { Brain, HelpCircle, RefreshCw, Send, Upload } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, FieldGroup, FileTree, FormField, Input, Panel, Popover, Stepper, Textarea, Tooltip } from '../components/ui';
import type { FileTreeNode } from '../components/ui';
import { cn } from '../lib/cn';
import { text } from '../lib/typography';
import { usePlanContent } from '../lib/use-plan-content';
import { usePlanDispatch } from '../lib/use-plan-dispatch';
import { usePlanWorkers } from '../lib/use-plan-workers';
import { useToast } from '../lib/use-toast';
import { useForm } from '../hooks/use-form';
import { required } from '../lib/form-validation';
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

// (v1.11.198) Placeholder workspace tree shown in the Plan output panel
// using the new <FileTree> primitive. Static demo data until the daemon
// exposes a real plan-files endpoint.
const PLAN_WORKSPACE_TREE: FileTreeNode[] = [
  {
    id: 'plan',
    name: 'plan',
    type: 'folder',
    children: [
      {
        id: 'plan/drafts',
        name: 'drafts',
        type: 'folder',
        children: [
          { id: 'plan/drafts/plan.md', name: 'plan.md', type: 'file' },
          { id: 'plan/drafts/notes.md', name: 'notes.md', type: 'file' },
        ],
      },
      {
        id: 'plan/finalized',
        name: 'finalized',
        type: 'folder',
        children: [
          { id: 'plan/finalized/plan-v1.md', name: 'plan-v1.md', type: 'file' },
        ],
      },
      { id: 'plan/README.md', name: 'README.md', type: 'file' },
    ],
  },
];

export default function Plan() {
  useLocale();


  const [selected, setSelected] = useState<string>('');
  // (v1.11.186) task field migrated to useForm; required validator surfaces
  // an inline error via Textarea's error slot once the field is touched or
  // the user clicks Send.
  const taskForm = useForm<{ task: string }>({
    initialValues: { task: '' },
    validators: { task: required() },
  });
  const task = taskForm.values.task;
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
            {
              id: 'dispatch',
              label: 'Dispatch plan',
              // (v1.11.270, TODO 11.252) When the dispatch /
              // fetch surfaced an error, flag the dispatch step
              // so the bubble flips red + X glyph. Operators see
              // the failure inline in the wizard strip without
              // scrolling to the ErrorPanel below.
              error: Boolean(error),
            },
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
      {/* (v1.11.281, TODO 11.263) Plan form fields grouped under
          a labeled FieldGroup so the section reads as a coherent
          "describe the work" block. The raw <div className="grid
          grid-cols-1 gap-3 md:grid-cols-2"> wrapper migrates to
          FieldGroup layout="grid" columns={2}. The full-width
          Task textarea preserves its md:col-span-2 via its
          wrapper div. */}
      <FieldGroup
        title={t('planPage.formHeading')}
        description={t('planPage.formDescription')}
        layout="grid"
        columns={2}
        data-testid="plan-form-fields"
      >
        <FormField id="plan-worker" label={t('planPage.worker')}>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <option value="">— select —</option>
            {workers.map((w) => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
        </FormField>
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
            onChange={(e) => taskForm.setValue('task', e.target.value)}
            onBlur={() => taskForm.setTouched('task', true)}
            error={taskForm.errors.task}
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
      </FieldGroup>

      <div className="flex flex-wrap gap-2">
        <Tooltip label={t('plan.tooltip.dispatch')}>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => {
              taskForm.handleSubmit();
              dispatchPlan();
            }}
            disabled={dispatching}
          >
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

      <Panel title="Plan workspace" className="p-3">
        <FileTree
          nodes={PLAN_WORKSPACE_TREE}
          defaultExpanded={['plan', 'plan/drafts']}
          ariaLabel="Plan workspace files"
        />
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
