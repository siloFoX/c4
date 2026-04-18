// (11.3) Workflow editor.
//
// View-only iteration: renders the workflow catalog plus a static SVG
// visualization of the selected workflow's DAG and a property panel
// for the selected node. Drag-to-edit, palette, and inline graph
// mutation are deferred to a follow-up patch (TODO 11.3 ships the
// engine + viewer; full edit UI is tracked under future work).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../lib/api';

export type WorkflowNodeType = 'task' | 'condition' | 'parallel' | 'wait' | 'end';

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

const NODE_W = 140;
const NODE_H = 56;
const COL_GAP = 70;
const ROW_GAP = 30;

const TYPE_FILL: Record<WorkflowNodeType, string> = {
  task: '#1f6feb',
  condition: '#a371f7',
  parallel: '#3fb950',
  wait: '#d29922',
  end: '#6e7681',
};

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
      aria-label={`Graph of ${workflow.name}`}
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
  const { node } = props;
  if (!node) {
    return (
      <div className="rounded border border-gray-700 bg-gray-900 p-3 text-sm text-gray-400">
        Select a node to inspect its config.
      </div>
    );
  }
  return (
    <div className="rounded border border-gray-700 bg-gray-900 p-3 text-sm text-gray-200">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-base font-semibold text-gray-100">{node.name || node.id}</h4>
        <span
          className="rounded px-2 py-0.5 text-xs"
          style={{ background: TYPE_FILL[node.type] || '#444', color: '#fff' }}
        >
          {node.type}
        </span>
      </div>
      <div className="text-xs text-gray-400">id: {node.id}</div>
      <div className="mt-2">
        <div className="text-xs uppercase tracking-wide text-gray-500">config</div>
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-950 p-2 text-xs text-gray-200">
          {JSON.stringify(node.config || {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default function WorkflowEditor() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiGet<WorkflowsResponse>('/api/workflows');
      setWorkflows(data.workflows || []);
      if ((data.workflows || []).length > 0 && !selectedId) {
        setSelectedId(data.workflows[0].id);
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

  const handleRun = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await apiPost('/api/workflows/' + encodeURIComponent(selectedId) + '/run', { inputs: {} });
      const r = await apiGet<WorkflowRunsResponse>('/api/workflows/' + encodeURIComponent(selectedId) + '/runs');
      setRuns(r.runs || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 text-gray-100 md:flex-row md:p-6">
      <aside className="w-full shrink-0 overflow-y-auto rounded border border-gray-700 bg-gray-900 p-3 md:w-72">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Workflows</h2>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        {error ? <div className="mb-2 rounded bg-red-900/40 p-2 text-xs text-red-300">{error}</div> : null}
        {workflows.length === 0 ? (
          <div className="text-xs text-gray-400">
            No workflows yet. Use <code>c4 workflow create --file</code> to add one.
          </div>
        ) : (
          <ul className="space-y-1">
            {workflows.map((wf) => (
              <li key={wf.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(wf.id);
                    setSelectedNodeId(null);
                  }}
                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                    wf.id === selectedId
                      ? 'bg-blue-700 text-white'
                      : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{wf.name}</span>
                    <span
                      className={`shrink-0 rounded px-1 text-xs ${
                        wf.enabled ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {wf.enabled ? 'on' : 'off'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-300">
                    {wf.nodes.length} nodes / {wf.edges.length} edges
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded border border-gray-700 bg-gray-900 p-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-gray-100">{selected.name}</h3>
                <p className="truncate text-xs text-gray-400">
                  {selected.description || 'No description.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRun}
                disabled={busy || !selected.enabled}
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-500 disabled:bg-gray-700 disabled:opacity-50"
              >
                Run
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded border border-gray-700 bg-gray-950 p-3">
              <WorkflowGraph
                workflow={selected}
                selectedNode={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <NodeProperties node={selectedNode} />
              <div className="rounded border border-gray-700 bg-gray-900 p-3 text-sm text-gray-200">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-base font-semibold text-gray-100">Recent runs</h4>
                  <span className="text-xs text-gray-400">{runs.length}</span>
                </div>
                {runs.length === 0 ? (
                  <div className="text-xs text-gray-400">No runs yet.</div>
                ) : (
                  <ul className="max-h-48 overflow-y-auto text-xs">
                    {runs.slice(-10).reverse().map((r) => (
                      <li key={r.id} className="border-b border-gray-800 py-1 last:border-b-0">
                        <div className="flex justify-between">
                          <span className="truncate text-gray-200">{r.id}</span>
                          <span
                            className={
                              r.status === 'completed'
                                ? 'text-green-400'
                                : r.status === 'failed'
                                ? 'text-red-400'
                                : 'text-gray-300'
                            }
                          >
                            {r.status}
                          </span>
                        </div>
                        <div className="text-gray-500">{r.startedAt}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded border border-gray-700 bg-gray-900 p-4 text-sm text-gray-300">
            Select a workflow on the left to view its DAG.
          </div>
        )}
      </main>
    </div>
  );
}
