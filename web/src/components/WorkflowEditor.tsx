// (11.3) Workflow editor.
//
// View-only iteration: renders the workflow catalog plus a static SVG
// visualization of the selected workflow's DAG and a property panel
// for the selected node. Drag-to-edit, palette, and inline graph
// mutation are deferred to a follow-up patch (TODO 11.3 ships the
// engine + viewer; full edit UI is tracked under future work).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { t, tFormat, useLocale } from '../lib/i18n';
import WorkflowGraph from './WorkflowGraph';
import WorkflowNodeProperties from './WorkflowNodeProperties';
import WorkflowList from './WorkflowList';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Panel,
  type BadgeProps,
} from './ui';

export type WorkflowNodeType = 'task' | 'condition' | 'parallel' | 'wait' | 'audit' | 'notify' | 'meeting' | 'end';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowsResponse {
  workflows: Workflow[];
  count: number;
}

export interface WorkflowRunResult {
  status: 'completed' | 'failed' | 'running' | 'skipped';
  output: unknown;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'completed' | 'failed' | 'running';
  startedAt: string;
  completedAt: string | null;
  inputs: unknown;
  nodeResults: Record<string, WorkflowRunResult>;
}

export interface WorkflowRunsResponse {
  workflowId: string;
  runs: WorkflowRun[];
  count: number;
}

type BadgeVariant = NonNullable<BadgeProps['variant']>;

// (v1.10.562) Layout constants + TYPE_FILL palette + the
// SVG graph (NodeBox / EdgeLine / WorkflowGraph) extracted to
// ./WorkflowGraph.tsx. The node-type union remains exported
// from this file (canonical home).

function runStatusVariant(status: WorkflowRun['status']): BadgeVariant {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'destructive';
  return 'outline';
}

// (v1.10.562) layoutWorkflow / NodeBox / EdgeLine / WorkflowGraph
// extracted to ./WorkflowGraph.tsx — see import below.

// (v1.10.569) NodeProperties extracted to ./WorkflowNodeProperties.tsx

export default function WorkflowEditor() {
  useLocale();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  // (v1.10.350) Expand a single run to inspect per-node results.
  // Resets on workflow switch so the panel doesn't show a stale id.
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiGet<WorkflowsResponse>('/api/workflows');
      setWorkflows(data.workflows || []);
      const first = (data.workflows || [])[0];
      if (first && !selectedId) {
        setSelectedId(first.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [selectedId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setExpandedRunId(null);
    if (!selectedId) {
      setRuns([]);
      return;
    }
    apiGet<WorkflowRunsResponse>('/api/workflows/' + encodeURIComponent(selectedId) + '/runs')
      .then((r) => setRuns(r.runs || []))
      .catch(() => setRuns([]));
  }, [selectedId]);

  const selected = useMemo(
    () => workflows.find((w) => w.id === selectedId) || null,
    [workflows, selectedId],
  );
  const selectedNode = useMemo(() => {
    if (!selected) return null;
    return selected.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selected, selectedNodeId]);

  // (v1.10.354) Inputs JSON for the run. Hidden behind a toggle
  // because most workflows are zero-arg; surfacing the input
  // box only when the operator wants it keeps the action row
  // tight. Resets on workflow switch.
  const [inputsOpen, setInputsOpen] = useState(false);
  const [inputsJson, setInputsJson] = useState('{}');
  const [inputsError, setInputsError] = useState<string | null>(null);
  useEffect(() => { setInputsOpen(false); setInputsJson('{}'); setInputsError(null); }, [selectedId]);

  const handleRun = async () => {
    if (!selectedId) return;
    let inputs: unknown = {};
    if (inputsOpen) {
      try {
        const parsed = JSON.parse(inputsJson);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error(t('workflowEditor.inputsMustBeObject'));
        }
        inputs = parsed;
      } catch (e) {
        setInputsError((e as Error).message || t('common.invalidJson'));
        return;
      }
    }
    setInputsError(null);
    setBusy(true);
    try {
      await apiPost('/api/workflows/' + encodeURIComponent(selectedId) + '/run', { inputs });
      const r = await apiGet<WorkflowRunsResponse>('/api/workflows/' + encodeURIComponent(selectedId) + '/runs');
      setRuns(r.runs || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 text-foreground md:flex-row md:p-6">
      <aside className="w-full shrink-0 overflow-y-auto md:w-72">
        {/* (v1.10.587) Left-pane workflow list extracted to
            ./WorkflowList.tsx. */}
        <WorkflowList
          workflows={workflows}
          error={error}
          busy={busy}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setSelectedNodeId(null);
          }}
          onRefresh={refresh}
        />
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        {selected ? (
          <>
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-2 p-4 md:p-5">
                <div className="min-w-0">
                  <CardTitle className="truncate">{selected.name}</CardTitle>
                  <CardDescription className="truncate">
                    {selected.description || t('workflows.noDescription')}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInputsOpen((v) => !v)}
                      disabled={busy}
                      className="h-7 px-2 text-[11px]"
                      title={t('workflows.inputs.title')}
                      aria-expanded={inputsOpen}
                    >
                      {inputsOpen ? t('workflows.inputs.toggle.hide') : t('workflows.inputs.toggle.show')}
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleRun}
                      disabled={busy || !selected.enabled}
                    >
                      <Play className="h-4 w-4" />
                      <span>{t('workflows.run.button')}</span>
                    </Button>
                  </div>
                  {inputsOpen ? (
                    <div className="flex w-72 flex-col gap-1 text-[11px]">
                      <textarea
                        value={inputsJson}
                        onChange={(e) => setInputsJson(e.target.value)}
                        placeholder='{"foo": "bar"}'
                        aria-label={t('workflows.inputs.label')}
                        disabled={busy}
                        className="min-h-[64px] rounded border border-border bg-background p-2 font-mono text-[11px]"
                      />
                      {inputsError ? (
                        <span className="text-destructive">{inputsError}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </CardHeader>
            </Card>

            <Card className="min-h-0 flex-1 overflow-auto">
              <CardContent className="min-h-0 p-3 md:p-4">
                <WorkflowGraph
                  workflow={selected}
                  selectedNode={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                />
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-2">
              <WorkflowNodeProperties node={selectedNode} />
              <Panel className="text-sm text-foreground">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-base font-semibold text-foreground">
                    {t('workflows.recentRuns')}
                  </h4>
                  <span className="text-xs text-muted-foreground">{runs.length}</span>
                </div>
                {runs.length === 0 ? (
                  <div className="text-xs text-muted-foreground">{t('workflows.runs.empty')}</div>
                ) : (
                  <ul className="max-h-72 overflow-y-auto text-xs">
                    {runs.slice(-10).reverse().map((r) => {
                      const isExpanded = expandedRunId === r.id;
                      const nodeIds = Object.keys(r.nodeResults || {});
                      return (
                        <li
                          key={r.id}
                          className="border-b border-border py-1 last:border-b-0"
                        >
                          <button
                            type="button"
                            onClick={() => setExpandedRunId(isExpanded ? null : r.id)}
                            className="flex w-full items-center justify-between gap-2 text-left hover:bg-muted/30"
                            aria-expanded={isExpanded}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-mono text-[11px] text-foreground">
                                {isExpanded ? '▼' : '▶'} {r.id}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {r.startedAt}
                                {r.completedAt ? ` → ${r.completedAt}` : ` ${t('workflows.runs.running')}`}
                                {nodeIds.length > 0 ? ` · ${tFormat('workflows.runs.nodeCount', { n: String(nodeIds.length) })}` : ''}
                              </div>
                            </div>
                            <Badge
                              variant={runStatusVariant(r.status)}
                              className="shrink-0 uppercase"
                            >
                              {r.status}
                            </Badge>
                          </button>
                          {isExpanded ? (
                            <div className="mt-2 ml-3 flex flex-col gap-1 border-l border-border/40 pl-2">
                              {nodeIds.length === 0 ? (
                                <div className="text-[11px] text-muted-foreground">
                                  {t('workflows.runs.noNodeResults')}
                                </div>
                              ) : (
                                nodeIds.map((nid) => {
                                  const nr = r.nodeResults[nid];
                                  if (!nr) return null;
                                  return (
                                    <div key={nid} className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="rounded border border-border bg-muted/30 px-1 font-mono text-[10px]">
                                          {nid}
                                        </span>
                                        <Badge
                                          variant={
                                            nr.status === 'completed' ? 'default'
                                            : nr.status === 'failed' ? 'destructive'
                                            : nr.status === 'running' ? 'secondary'
                                            : 'outline'
                                          }
                                          className="text-[9px] uppercase"
                                        >
                                          {nr.status}
                                        </Badge>
                                      </div>
                                      {nr.error ? (
                                        <div className="font-mono text-[10px] text-destructive">
                                          {nr.error}
                                        </div>
                                      ) : null}
                                      {nr.output !== null && nr.output !== undefined ? (
                                        <pre tabIndex={0} className="max-h-32 overflow-auto rounded bg-muted/30 p-1 font-mono text-[10px]">
                                          {typeof nr.output === 'string'
                                            ? nr.output
                                            : JSON.stringify(nr.output, null, 2)}
                                        </pre>
                                      ) : null}
                                    </div>
                                  );
                                })
                              )}
                              {(r.inputs && typeof r.inputs === 'object' && Object.keys(r.inputs).length > 0) ? (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-[10px] text-muted-foreground">
                                    inputs
                                  </summary>
                                  <pre tabIndex={0} className="mt-1 max-h-32 overflow-auto rounded bg-muted/30 p-1 font-mono text-[10px]">
                                    {JSON.stringify(r.inputs, null, 2)}
                                  </pre>
                                </details>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground md:p-5">
              {t('workflows.empty.selection')}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
