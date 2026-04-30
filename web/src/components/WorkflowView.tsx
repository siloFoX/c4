// Workflow editor + run history (11.3 follow-up).
// Left: JSON editor with templates, Run button.
// Right: recent runs from /api/workflow/runs with per-step status.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Workflow, Play, FileText, RefreshCw, Layers, Code } from 'lucide-react';
import { cn } from '../lib/cn';
import { useSSE } from '../lib/useSSE';
import WorkflowGraph from './WorkflowGraph';

interface StepResult { error?: string; [k: string]: unknown }
interface RunRecord {
  ts: string;
  name: string;
  ok: boolean;
  order?: string[];
  results?: Record<string, StepResult>;
}

const TEMPLATES: { name: string; json: string }[] = [
  {
    name: 'list workers + sleep',
    json: `{
  "name": "smoke",
  "steps": [
    { "id": "list",  "action": "list" },
    { "id": "rest",  "action": "sleep", "args": { "ms": 200 }, "dependsOn": ["list"] }
  ]
}`,
  },
  {
    name: 'dispatch a task',
    json: `{
  "name": "dispatch-demo",
  "steps": [
    {
      "id": "go",
      "action": "dispatch",
      "args": { "task": "Run morning report", "tags": ["report"], "strategy": "least-load" }
    }
  ]
}`,
  },
  {
    name: 'shell + notify (with whitelist)',
    json: `{
  "name": "shell-demo",
  "steps": [
    { "id": "echo", "action": "shell",  "args": { "cmd": "echo hello" } },
    { "id": "tell", "action": "notify", "args": { "text": "echo finished" }, "dependsOn": ["echo"] }
  ]
}`,
  },
];

export default function WorkflowView() {
  const [json, setJson] = useState(TEMPLATES[0].json);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [last, setLast] = useState<RunRecord | null>(null);
  const [editorMode, setEditorMode] = useState<'json' | 'graph'>('json');

  const parsedWorkflow = useMemo(() => {
    try { return JSON.parse(json); } catch { return null; }
  }, [json]);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/workflow/runs?limit=20');
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    const t = setInterval(fetchRuns, 5000);
    return () => clearInterval(t);
  }, [fetchRuns]);

  // Live refresh whenever a workflow finishes.
  useSSE(['workflow_end', 'workflow_start'], () => fetchRuns());

  const run = async () => {
    setError(null);
    let parsed;
    try { parsed = JSON.parse(json); }
    catch (e) { setError(`Invalid JSON: ${(e as Error).message}`); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/workflow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setLast(data);
      fetchRuns();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Workflow size={16} className="text-primary" />
        <h2 className="text-base font-semibold sm:text-lg">Workflow</h2>
        <button
          type="button"
          onClick={fetchRuns}
          className="ml-auto inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[11px] hover:bg-surface-3"
          title="Refresh runs"
        >
          <RefreshCw size={11} /> refresh
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2">
        {/* Editor */}
        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <FileText size={12} className="text-muted" />
            <span className="text-[11px] uppercase tracking-wider text-muted">Templates</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setJson(t.json)}
                className="rounded border border-border bg-surface-2 px-2 py-0.5 text-[11px] hover:bg-surface-3"
              >
                {t.name}
              </button>
            ))}
            <div className="ml-auto flex gap-1 rounded bg-surface-2 p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setEditorMode('json')}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                  editorMode === 'json' ? 'bg-surface-3 text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                <Code size={10} /> JSON
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('graph')}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                  editorMode === 'graph' ? 'bg-surface-3 text-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                <Layers size={10} /> Graph
              </button>
            </div>
          </div>
          {editorMode === 'json' ? (
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
              className="min-h-[280px] flex-1 resize-none rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground focus:border-primary focus:outline-none"
            />
          ) : (
            <div className="min-h-[280px] flex-1">
              <WorkflowGraph
                workflow={parsedWorkflow}
                onChange={(next) => setJson(JSON.stringify(next, null, 2))}
              />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              <Play size={12} /> {busy ? 'Running…' : 'Run'}
            </button>
          </div>

          {last && (
            <div className={cn(
              'rounded-lg border bg-surface-2 p-3 text-xs',
              last.ok ? 'border-success/40' : 'border-danger/40',
            )}>
              <div className={cn('mb-1 font-medium', last.ok ? 'text-success' : 'text-danger')}>
                {last.ok ? '✓ run ok' : '✗ run failed'}
                <span className="ml-2 text-muted">{last.name}</span>
              </div>
              <RunStepResults run={last} />
            </div>
          )}
        </div>

        {/* History */}
        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-surface-2">
          <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted">Recent runs</div>
          <div className="flex-1 overflow-auto">
            {runs.length === 0 && (
              <div className="p-4 text-center text-xs text-muted">No runs yet.</div>
            )}
            {runs.map((r, i) => (
              <details key={i} className="border-b border-border last:border-b-0">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-surface-3">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', r.ok ? 'bg-success' : 'bg-danger')} />
                  <span className="font-mono">{r.name}</span>
                  <span className="ml-auto text-muted">{new Date(r.ts).toLocaleString()}</span>
                </summary>
                <div className="px-3 pb-2">
                  <RunStepResults run={r} />
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RunStepResults({ run }: { run: RunRecord }) {
  const order = run.order || [];
  const results = run.results || {};
  if (order.length === 0) return <div className="text-[11px] italic text-muted">no steps</div>;
  return (
    <div className="space-y-1">
      {order.map((stepId) => {
        const r = results[stepId];
        const ok = r && !r.error;
        return (
          <div key={stepId} className="flex items-start gap-2 rounded bg-surface px-2 py-1 text-[11px]">
            <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', ok ? 'bg-success' : 'bg-danger')} />
            <span className="font-mono text-muted">{stepId}</span>
            <span className="flex-1 break-words text-foreground/80">
              {r && r.error ? <span className="text-danger">{r.error}</span> : (
                <pre className="whitespace-pre-wrap font-mono text-[10px] text-muted">{JSON.stringify(r, null, 0)}</pre>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
