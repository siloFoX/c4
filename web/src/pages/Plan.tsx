import { useCallback, useEffect, useState } from 'react';
import { Brain, RefreshCw, Send, Upload } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast, { type ToastType } from '../components/Toast';
import { Button, Input, Label, Panel } from '../components/ui';
import { apiFetch, apiGet, apiPost } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';
import type { ListResponse, Worker } from '../types';

// 8.20B Plan. Dispatches a planning task via POST /api/plan and polls
// GET /api/plan?name=<worker> to display the resulting plan.md with
// our minimal markdown renderer. A "re-dispatch as task" button takes
// the generated plan and POSTs it via /api/task so the planner output
// can graduate into real work in one click.

interface PlanResponse {
  name?: string;
  content?: string;
  path?: string;
  status?: string;
  error?: string;
  [key: string]: unknown;
}

interface ToastState { id: number; message: string; type: ToastType }

export default function Plan() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [task, setTask] = useState('');
  const [branch, setBranch] = useState('');
  const [output, setOutput] = useState('');
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [dispatching, setDispatching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const loadWorkers = useCallback(async () => {
    try {
      const r = await apiGet<ListResponse>('/api/list');
      const ws = Array.isArray(r.workers) ? r.workers : [];
      setWorkers(ws);
      if (!selected && ws.length > 0) setSelected(ws[0].name);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selected]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const loadPlan = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/plan?name=${encodeURIComponent(selected)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PlanResponse;
      setPlan(data);
    } catch (e) {
      setError((e as Error).message);
      setPlan(null);
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const dispatchPlan = useCallback(async () => {
    if (!selected || !task.trim()) {
      setError('Select a worker and enter a task.');
      return;
    }
    setDispatching(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: selected, task };
      if (branch) body.branch = branch;
      if (output) body.output = output;
      const r = (await apiPost<PlanResponse>('/api/plan', body)) as PlanResponse;
      if (r.error) {
        showToast(`Plan dispatch failed: ${r.error}`, 'error');
        setError(r.error);
      } else {
        showToast('Planner dispatched — result will appear once the worker finishes.', 'success');
        loadPlan();
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setDispatching(false);
  }, [selected, task, branch, output, showToast, loadPlan]);

  const redispatch = useCallback(async () => {
    if (!selected || !plan?.content) return;
    if (!window.confirm(`Re-dispatch the generated plan to ${selected} as a real task?`)) return;
    setDispatching(true);
    try {
      const r = (await apiPost<{ error?: string }>('/api/task', {
        name: selected,
        task: plan.content,
        useBranch: true,
      })) as { error?: string };
      if (r.error) {
        showToast(`Task dispatch failed: ${r.error}`, 'error');
      } else {
        showToast(`Plan dispatched as task to ${selected}`, 'success');
      }
    } catch (e) {
      showToast(`Task dispatch failed: ${(e as Error).message}`, 'error');
    }
    setDispatching(false);
  }, [plan, selected, showToast]);

  return (
    <PageFrame
      title="Plan"
      description="Dispatch a planning task and render the worker's plan.md. Re-dispatch the plan as real work with one click."
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={loadPlan} disabled={loading || !selected}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh plan</span>
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="plan-worker">Worker</Label>
          <select
            id="plan-worker"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— select —</option>
            {workers.map((w) => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="plan-branch">Branch (optional)</Label>
          <Input
            id="plan-branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="c4/my-plan"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="plan-task">Plan task</Label>
          <textarea
            id="plan-task"
            rows={4}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="What should the planner design?"
          />
        </div>
        <div>
          <Label htmlFor="plan-output">Output path (optional)</Label>
          <Input
            id="plan-output"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="docs/plans/my-plan.md"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="default" size="sm" onClick={dispatchPlan} disabled={dispatching}>
          {dispatching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          <span>Send plan</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={redispatch}
          disabled={dispatching || !plan?.content}
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Re-dispatch as task</span>
        </Button>
      </div>

      {error && <ErrorPanel message={error} />}

      <Panel
        title="Plan output"
        icon={<Brain className="h-3.5 w-3.5" />}
        className="p-3"
      >
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : plan?.content ? (
          <div className="prose prose-invert max-h-[480px] max-w-none overflow-y-auto text-sm">
            {renderMarkdown(plan.content)}
          </div>
        ) : (
          <EmptyPanel message="No plan generated yet for this worker. Dispatch a planning task to begin." />
        )}
      </Panel>

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
