// (11.3) Workflow editor.
//
// View-only iteration: renders the workflow catalog plus a static SVG
// visualization of the selected workflow's DAG and a property panel
// for the selected node. Drag-to-edit, palette, and inline graph
// mutation are deferred to a follow-up patch (TODO 11.3 ships the
// engine + viewer; full edit UI is tracked under future work).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, RefreshCw, Workflow as WorkflowIcon } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { t, tFormat, useLocale } from '../lib/i18n';
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
import { cn } from '../lib/cn';

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

const NODE_W = 140;
const NODE_H = 56;
const COL_GAP = 70;
const ROW_GAP = 30;

const TYPE_FILL: Record<WorkflowNodeType, string> = {
  task: '#1f6feb',
  condition: '#a371f7',
  parallel: '#3fb950',
  wait: '#d29922',
  // (Phase 6.4) audit / notify / meeting node types
  audit: '#bb86fc',
  notify: '#22c1c3',
  meeting: '#f78166',
  end: '#6e7681',
};

function runStatusVariant(status: WorkflowRun['status']): BadgeVariant {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'destructive';
  return 'outline';
}

// Layered layout: assign each node a column equal to the longest path
// to it from any source. Within a column nodes are stacked vertically
// in stable id order. This gives a deterministic left-to-right DAG
// without external graph libraries.
function layoutWorkflow(workflow: Workflow): {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
} {
  const inEdges = new Map<string, string[]>();
  for (const node of workflow.nodes) inEdges.set(node.id, []);
  for (const edge of workflow.edges) {
    if (inEdges.has(edge.to)) inEdges.get(edge.to)!.push(edge.from);
  }
  const depth = new Map<string, number>();
  function depthOf(id: string, stack: Set<string>): number {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const preds = inEdges.get(id) || [];
    let d = 0;
    for (const p of preds) {
      d = Math.max(d, depthOf(p, stack) + 1);
    }
    stack.delete(id);
    depth.set(id, d);
    return d;
  }
  for (const n of workflow.nodes) depthOf(n.id, new Set());
  const cols = new Map<number, string[]>();
  for (const n of workflow.nodes) {
    const d = depth.get(n.id) || 0;
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(n.id);
  }
  for (const list of cols.values()) list.sort();
  const positions = new Map<string, { x: number; y: number }>();
  let maxRows = 1;
  const colKeys = [...cols.keys()].sort((a, b) => a - b);
  for (const colIdx of colKeys) {
    const list = cols.get(colIdx)!;
    maxRows = Math.max(maxRows, list.length);
    list.forEach((id, row) => {
      positions.set(id, {
        x: 24 + colIdx * (NODE_W + COL_GAP),
        y: 24 + row * (NODE_H + ROW_GAP),
      });
    });
  }
  const width = 24 * 2 + colKeys.length * (NODE_W + COL_GAP);
  const height = 24 * 2 + maxRows * (NODE_H + ROW_GAP);
  return { positions, width: Math.max(width, NODE_W + 96), height: Math.max(height, NODE_H + 96) };
}

function NodeBox(props: {
  node: WorkflowNode;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { node, x, y, selected, onSelect } = props;
  const fill = TYPE_FILL[node.type] || '#444';
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={() => onSelect(node.id)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={8}
        ry={8}
        fill={fill}
        stroke={selected ? '#f9d949' : '#1f2937'}
        strokeWidth={selected ? 3 : 1.5}
      />
      <text x={NODE_W / 2} y={22} fill="#fff" textAnchor="middle" fontSize={13} fontWeight={600}>
        {node.name || node.id}
      </text>
      <text x={NODE_W / 2} y={42} fill="#e2e8f0" textAnchor="middle" fontSize={11}>
        {node.type}
      </text>
    </g>
  );
}

function EdgeLine(props: {
  edge: WorkflowEdge;
  positions: Map<string, { x: number; y: number }>;
}) {
  const { edge, positions } = props;
  const a = positions.get(edge.from);
  const b = positions.get(edge.to);
  if (!a || !b) return null;
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const midX = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  const labelX = midX;
  const labelY = (y1 + y2) / 2 - 6;
  return (
    <g>
      <path d={path} fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#wf-arrow)" />
      {edge.condition ? (
        <text x={labelX} y={labelY} fill="#fbbf24" textAnchor="middle" fontSize={10}>
          {edge.condition.length > 20 ? edge.condition.slice(0, 18) + '...' : edge.condition}
        </text>
      ) : null}
    </g>
  );
}

export function WorkflowGraph(props: {
  workflow: Workflow;
  selectedNode: string | null;
  onSelectNode: (id: string) => void;
}) {
  const { workflow, selectedNode, onSelectNode } = props;
  const { positions, width, height } = useMemo(() => layoutWorkflow(workflow), [workflow]);
  return (
    <svg
      role="img"
      aria-label={tFormat('workflowEditor.aria.graphOf', { name: workflow.name })}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: '#0f172a', borderRadius: 6 }}
    >
      <defs>
        <marker id="wf-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      {workflow.edges.map((edge, idx) => (
        <EdgeLine key={`${edge.from}-${edge.to}-${idx}`} edge={edge} positions={positions} />
      ))}
      {workflow.nodes.map((node) => {
        const pos = positions.get(node.id) || { x: 0, y: 0 };
        return (
          <NodeBox
            key={node.id}
            node={node}
            x={pos.x}
            y={pos.y}
            selected={node.id === selectedNode}
            onSelect={onSelectNode}
          />
        );
      })}
    </svg>
  );
}

function NodeProperties(props: { node: WorkflowNode | null }) {
  useLocale();
  const { node } = props;
  if (!node) {
    return (
      <Panel className="text-sm text-muted-foreground">
        {t('workflows.editor.selectNode')}
      </Panel>
    );
  }
  return (
    <Panel className="text-sm text-foreground">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-base font-semibold text-foreground">
          {node.name || node.id}
        </h4>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
          style={{ background: TYPE_FILL[node.type] || '#444' }}
        >
          {node.type}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">{tFormat('workflowEditor.idPrefix', { id: node.id })}</div>
      <div className="mt-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          config
        </div>
        <pre tabIndex={0} className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-background p-2 text-xs text-foreground">
          {JSON.stringify(node.config || {}, null, 2)}
        </pre>
      </div>
    </Panel>
  );
}

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
        <Card>
          <CardHeader className="flex-row items-center justify-between p-4 md:p-5">
            <div className="flex items-center gap-2">
              <WorkflowIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <CardTitle>{t('workflows.title')}</CardTitle>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={refresh}
              disabled={busy}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{t('common.refresh')}</span>
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-5 md:pt-0">
            {error ? (
              <div
                role="alert"
                className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              >
                {error}
              </div>
            ) : null}
            {workflows.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                {t('workflows.empty').split('{cli}').map((seg, i, arr) => (
                  <span key={i}>
                    {seg}
                    {i < arr.length - 1 ? (
                      <code className="font-mono text-foreground">
                        {t('workflows.empty.cli')}
                      </code>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : (
              <ul className="space-y-1">
                {workflows.map((wf) => {
                  const isSelected = wf.id === selectedId;
                  return (
                    <li key={wf.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(wf.id);
                          setSelectedNodeId(null);
                        }}
                        className={cn(
                          'w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/30 text-foreground hover:bg-muted'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{wf.name}</span>
                          <Badge
                            variant={wf.enabled ? 'success' : 'secondary'}
                            className="shrink-0 uppercase"
                          >
                            {wf.enabled ? t('workflows.status.on') : t('workflows.status.off')}
                          </Badge>
                        </div>
                        <div className="text-xs opacity-80">
                          {tFormat('workflows.nodesEdges.format', {
                            nodes: String(wf.nodes.length),
                            edges: String(wf.edges.length),
                          })}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
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
              <NodeProperties node={selectedNode} />
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
