import { useMemo } from 'react';
import { tFormat, useLocale } from '../lib/i18n';
import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowNodeType } from './WorkflowEditor';

// (v1.10.562) Extracted from WorkflowEditor. The SVG graph
// renderer for a workflow — layered DAG layout, node boxes,
// curved edge lines with optional condition labels. Pure
// rendering; parent owns selection state.

const NODE_W = 140;
const NODE_H = 56;
const COL_GAP = 70;
const ROW_GAP = 30;

export const TYPE_FILL: Record<WorkflowNodeType, string> = {
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

interface Props {
  workflow: Workflow;
  selectedNode: string | null;
  onSelectNode: (id: string) => void;
}

export default function WorkflowGraph({ workflow, selectedNode, onSelectNode }: Props) {
  useLocale();
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
