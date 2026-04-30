// Workflow visual editor — minimal step graph beside the JSON. Renders each
// step as a node with action + args summary, draws dependency edges,
// supports per-step actions (delete / move to top). The JSON pane stays
// authoritative — graph edits dispatch back as the new JSON string.

import { useMemo } from 'react';
import { Layers, Trash2, ArrowUp, GitBranch } from 'lucide-react';
import { cn } from '../lib/cn';

interface Step {
  id: string;
  action: string;
  args?: Record<string, unknown>;
  dependsOn?: string[];
  on_failure?: 'abort' | 'continue';
}

interface Workflow {
  name?: string;
  steps?: Step[];
}

export interface WorkflowGraphProps {
  workflow: Workflow | null;
  onChange?: (next: Workflow) => void;
  readOnly?: boolean;
}

interface Layer {
  index: number;
  steps: Step[];
}

// Topological layering: every step gets pushed to layer = max(layer of deps) + 1.
function layout(steps: Step[]): Layer[] {
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  const layerById = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    if (layerById.has(id)) return layerById.get(id)!;
    if (stack.has(id)) return 0; // cycle — clamp
    stack.add(id);
    const s = byId[id];
    if (!s) return 0;
    const deps = s.dependsOn || [];
    let max = -1;
    for (const d of deps) max = Math.max(max, visit(d, stack));
    const layer = max + 1;
    layerById.set(id, layer);
    stack.delete(id);
    return layer;
  };
  for (const s of steps) visit(s.id, new Set());
  const out: Layer[] = [];
  for (const s of steps) {
    const idx = layerById.get(s.id) || 0;
    if (!out[idx]) out[idx] = { index: idx, steps: [] };
    out[idx].steps.push(s);
  }
  return out.filter(Boolean);
}

export default function WorkflowGraph({ workflow, onChange, readOnly = false }: WorkflowGraphProps) {
  const steps = useMemo(() => (workflow && Array.isArray(workflow.steps) ? workflow.steps : []), [workflow]);
  const layers = useMemo(() => layout(steps), [steps]);

  const update = (next: Step[]) => {
    if (!onChange) return;
    onChange({ ...(workflow || {}), steps: next });
  };

  const removeStep = (id: string) => {
    if (!onChange) return;
    const filtered = steps.filter((s) => s.id !== id);
    // Drop the deleted id from any dependsOn arrays.
    update(filtered.map((s) => ({
      ...s,
      dependsOn: (s.dependsOn || []).filter((d) => d !== id),
    })));
  };

  const promote = (id: string) => {
    if (!onChange) return;
    update(steps.map((s) => (s.id === id ? { ...s, dependsOn: [] } : s)));
  };

  if (!workflow) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
        No workflow loaded.
      </div>
    );
  }
  if (steps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
        Workflow has no steps. Add a step to the JSON on the left.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
        <Layers size={11} /> Graph ({steps.length} steps · {layers.length} layers)
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-border bg-surface-2 p-3">
        <div className="flex gap-3">
          {layers.map((layer) => (
            <div key={layer.index} className="flex shrink-0 flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wider text-muted/80">layer {layer.index}</div>
              {layer.steps.map((s) => (
                <StepCard
                  key={s.id}
                  step={s}
                  readOnly={readOnly}
                  onRemove={() => removeStep(s.id)}
                  onPromote={() => promote(s.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function summarizeArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return '';
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  // Prefer task / cmd / cron / name etc. as the headline.
  for (const key of ['task', 'cmd', 'cron', 'name', 'text', 'task_text']) {
    const v = (args as Record<string, unknown>)[key];
    if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  }
  // Fall back to first entry.
  const [k, v] = entries[0];
  const text = typeof v === 'string' ? v : JSON.stringify(v);
  return `${k}=${text.length > 50 ? text.slice(0, 50) + '…' : text}`;
}

function StepCard({
  step, readOnly, onRemove, onPromote,
}: {
  step: Step; readOnly: boolean; onRemove: () => void; onPromote: () => void;
}) {
  const summary = summarizeArgs(step.args);
  return (
    <div className={cn(
      'group w-56 rounded-md border border-border bg-surface px-2.5 py-2 text-xs shadow-soft',
    )}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-mono text-[11px] text-muted">{step.id}</span>
        <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px]">{step.action}</span>
      </div>
      {summary && (
        <div className="mt-1 line-clamp-2 break-words text-[11px] text-foreground/80">{summary}</div>
      )}
      {step.dependsOn && step.dependsOn.length > 0 && (
        <div className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted">
          <GitBranch size={10} className="shrink-0" />
          <span className="truncate">depends: {step.dependsOn.join(', ')}</span>
        </div>
      )}
      {step.on_failure === 'continue' && (
        <div className="mt-1 inline-flex rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">on_failure: continue</div>
      )}
      {!readOnly && (
        <div className="mt-1.5 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {(step.dependsOn && step.dependsOn.length > 0) && (
            <button
              type="button"
              onClick={onPromote}
              title="Clear dependsOn (promote to layer 0)"
              className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted hover:text-foreground"
            >
              <ArrowUp size={10} />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            title="Delete step"
            className="rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger hover:bg-danger/20"
          >
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
