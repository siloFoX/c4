import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.481, TODO 11.463) ChartArcDiagram primitive.
//
// Pure-SVG arc diagram. Nodes sit on a horizontal
// baseline, each rendered as a dot whose radius can be
// scaled by `node.weight`. Edges paint as semicircular
// arcs above (or below) the baseline between the two node
// xs; the radius is half the horizontal distance and
// stroke width encodes the edge weight. Hover a node to
// highlight every connected edge + neighbour; hover an
// edge to focus that single connection.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartArcDiagramNode {
  id: string;
  label: string;
  weight?: number;
  color?: string;
  group?: string;
}

export interface ChartArcDiagramEdge {
  source: string;
  target: string;
  weight?: number;
  color?: string;
}

export interface ChartArcDiagramProps {
  nodes: readonly ChartArcDiagramNode[];
  edges: readonly ChartArcDiagramEdge[];
  width?: number;
  height?: number;
  padding?: number;
  nodeRadius?: number;
  baselineY?: number;
  arcsBelowBaseline?: boolean;
  defaultNodeColor?: string;
  defaultEdgeColor?: string;
  edgeOpacity?: number;
  showLabels?: boolean;
  showTooltip?: boolean;
  highlightOnHover?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  onNodeClick?: (args: {
    node: ChartArcDiagramNode;
    index: number;
    degree: number;
  }) => void;
  onEdgeClick?: (args: {
    edge: ChartArcDiagramEdge;
    source: ChartArcDiagramNode;
    target: ChartArcDiagramNode;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_ARC_DIAGRAM_WIDTH = 560;
export const DEFAULT_CHART_ARC_DIAGRAM_HEIGHT = 240;
export const DEFAULT_CHART_ARC_DIAGRAM_PADDING = 36;
export const DEFAULT_CHART_ARC_DIAGRAM_NODE_RADIUS = 5;
export const DEFAULT_CHART_ARC_DIAGRAM_EDGE_OPACITY = 0.45;
export const DEFAULT_CHART_ARC_DIAGRAM_NODE_COLOR = '#2563eb';
export const DEFAULT_CHART_ARC_DIAGRAM_EDGE_COLOR = '#94a3b8';

// Compute the x positions for every node along the
// baseline. Nodes spread evenly across the inner width.
// One-node layouts snap to centre.
export function getArcDiagramNodePositions(
  nodes: readonly ChartArcDiagramNode[],
  innerWidth: number,
  originX: number,
): number[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [originX + innerWidth / 2];
  const step = innerWidth / (nodes.length - 1);
  const out: number[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    out.push(originX + i * step);
  }
  return out;
}

// Scale a node's render radius by `weight`. Missing /
// non-finite / non-positive weights fall back to the
// default; floors at 2 px.
export function getArcDiagramNodeRadius(
  node: ChartArcDiagramNode,
  defaultRadius: number,
): number {
  const w =
    node.weight !== undefined &&
    Number.isFinite(node.weight) &&
    node.weight > 0
      ? node.weight
      : 1;
  return Math.max(2, defaultRadius * Math.sqrt(w));
}

// Count the number of edges incident on a node.
export function computeArcDiagramNodeDegree(
  nodeId: string,
  edges: readonly ChartArcDiagramEdge[],
): number {
  let count = 0;
  for (const e of edges) {
    if (e.source === nodeId || e.target === nodeId) count += 1;
  }
  return count;
}

// Build the SVG path for one semicircular arc between
// `x1` and `x2` along the baseline. `above=true` raises
// the arc; `above=false` drops it below. Self-loops
// (x1 === x2) collapse to a small circle above the node.
export function buildArcDiagramEdgePath(
  x1: number,
  x2: number,
  baselineY: number,
  above: boolean,
): string {
  if (!Number.isFinite(x1) || !Number.isFinite(x2)) return '';
  if (x1 === x2) {
    // self-loop: small circle above (or below) the node
    const offset = above ? -8 : 8;
    const r = 4;
    return `M ${x1.toFixed(2)} ${baselineY.toFixed(2)} A ${r} ${r} 0 1 ${above ? 0 : 1} ${(x1 + 0.01).toFixed(2)} ${(baselineY + offset).toFixed(2)}`;
  }
  const xa = Math.min(x1, x2);
  const xb = Math.max(x1, x2);
  const r = (xb - xa) / 2;
  const sweep = above ? 1 : 0;
  return `M ${xa.toFixed(2)} ${baselineY.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweep} ${xb.toFixed(2)} ${baselineY.toFixed(2)}`;
}

// One-line ARIA summary.
export function describeArcDiagram(
  nodes: readonly ChartArcDiagramNode[],
  edges: readonly ChartArcDiagramEdge[],
  formatValue?: (v: number) => string,
): string {
  if (nodes.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const top = nodes
    .map((n) => ({
      label: n.label,
      degree: computeArcDiagramNodeDegree(n.id, edges),
    }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 5);
  const summary = top
    .map((t) => `${t.label} degree ${fv(t.degree)}`)
    .join(', ');
  return `Arc diagram with ${nodes.length} nodes, ${edges.length} edges. Top: ${summary}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartArcDiagram = forwardRef(function ChartArcDiagram(
  {
    nodes,
    edges,
    width = DEFAULT_CHART_ARC_DIAGRAM_WIDTH,
    height = DEFAULT_CHART_ARC_DIAGRAM_HEIGHT,
    padding = DEFAULT_CHART_ARC_DIAGRAM_PADDING,
    nodeRadius = DEFAULT_CHART_ARC_DIAGRAM_NODE_RADIUS,
    baselineY,
    arcsBelowBaseline = false,
    defaultNodeColor = DEFAULT_CHART_ARC_DIAGRAM_NODE_COLOR,
    defaultEdgeColor = DEFAULT_CHART_ARC_DIAGRAM_EDGE_COLOR,
    edgeOpacity = DEFAULT_CHART_ARC_DIAGRAM_EDGE_OPACITY,
    showLabels = true,
    showTooltip = true,
    highlightOnHover = true,
    animate = true,
    className,
    ariaLabel = 'Arc diagram',
    ariaDescription,
    formatValue,
    onNodeClick,
    onEdgeClick,
  }: ChartArcDiagramProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const innerWidth = Math.max(0, width - padding * 2);
  const computedBaselineY = useMemo(() => {
    if (baselineY !== undefined && Number.isFinite(baselineY)) {
      return baselineY;
    }
    // Default: leave room for labels below + arcs above
    return height - padding - (showLabels ? 18 : 0);
  }, [baselineY, height, padding, showLabels]);

  const positions = useMemo(
    () =>
      getArcDiagramNodePositions(nodes, innerWidth, padding),
    [innerWidth, nodes, padding],
  );

  const nodeMap = useMemo(() => {
    const m = new Map<string, ChartArcDiagramNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const nodeIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < nodes.length; i += 1) {
      m.set(nodes[i]!.id, i);
    }
    return m;
  }, [nodes]);

  const description = useMemo(
    () =>
      ariaDescription ??
      describeArcDiagram(nodes, edges, formatValue),
    [ariaDescription, edges, formatValue, nodes],
  );

  const [hoveredNode, setHoveredNode] = useState<string | null>(
    null,
  );
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(
    null,
  );

  const handleNodeEnter = useCallback((id: string) => {
    setHoveredNode(id);
  }, []);
  const handleNodeLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);
  const handleEdgeEnter = useCallback((idx: number) => {
    setHoveredEdge(idx);
  }, []);
  const handleEdgeLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  // Determine highlight + dim state per edge / node
  const highlightedNodes = useMemo(() => {
    const set = new Set<string>();
    if (hoveredNode) {
      set.add(hoveredNode);
      for (const e of edges) {
        if (e.source === hoveredNode) set.add(e.target);
        if (e.target === hoveredNode) set.add(e.source);
      }
    }
    if (hoveredEdge !== null) {
      const edge = edges[hoveredEdge];
      if (edge) {
        set.add(edge.source);
        set.add(edge.target);
      }
    }
    return set;
  }, [edges, hoveredEdge, hoveredNode]);

  const highlightedEdges = useMemo(() => {
    const set = new Set<number>();
    if (hoveredEdge !== null) set.add(hoveredEdge);
    if (hoveredNode) {
      for (let i = 0; i < edges.length; i += 1) {
        const e = edges[i]!;
        if (
          e.source === hoveredNode ||
          e.target === hoveredNode
        ) {
          set.add(i);
        }
      }
    }
    return set;
  }, [edges, hoveredEdge, hoveredNode]);

  const hoveredNodeData =
    hoveredNode !== null ? nodeMap.get(hoveredNode) : null;
  const hoveredEdgeData =
    hoveredEdge !== null ? edges[hoveredEdge] : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-arc-diagram"
      data-node-count={nodes.length}
      data-edge-count={edges.length}
      data-arcs-below={arcsBelowBaseline ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-arc-diagram-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-arc-diagram-svg"
        className="h-auto w-full"
      >
        {/* Baseline */}
        <line
          aria-hidden="true"
          data-section="chart-arc-diagram-baseline"
          x1={padding}
          y1={computedBaselineY}
          x2={width - padding}
          y2={computedBaselineY}
          stroke="currentColor"
          strokeOpacity={0.3}
        />
        {/* Edges (paint first so nodes overlay on top) */}
        {edges.map((edge, i) => {
          const sIdx = nodeIndexMap.get(edge.source);
          const tIdx = nodeIndexMap.get(edge.target);
          if (sIdx === undefined || tIdx === undefined) {
            return null;
          }
          const x1 = positions[sIdx]!;
          const x2 = positions[tIdx]!;
          const weight =
            edge.weight !== undefined &&
            Number.isFinite(edge.weight) &&
            edge.weight > 0
              ? edge.weight
              : 1;
          const color = edge.color ?? defaultEdgeColor;
          const path = buildArcDiagramEdgePath(
            x1,
            x2,
            computedBaselineY,
            !arcsBelowBaseline,
          );
          const isHovered = hoveredEdge === i;
          const isHighlighted = highlightedEdges.has(i);
          const op = highlightOnHover
            ? hoveredNode !== null || hoveredEdge !== null
              ? isHighlighted
                ? Math.max(edgeOpacity, 0.85)
                : 0.08
              : edgeOpacity
            : edgeOpacity;
          return (
            <g
              key={`edge-${i}`}
              data-section="chart-arc-diagram-edge"
              data-edge-index={i}
              data-source-id={edge.source}
              data-target-id={edge.target}
              data-edge-weight={weight}
              data-edge-color={color}
              data-hovered={isHovered ? 'true' : 'false'}
              data-highlighted={
                isHighlighted ? 'true' : 'false'
              }
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${edge.source} - ${edge.target}: ${fv(weight)}`}
                data-section="chart-arc-diagram-edge-path"
                data-edge-index={i}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={Math.max(
                  1,
                  weight + (isHovered ? 1 : 0),
                )}
                strokeOpacity={op}
                strokeLinecap="round"
                onMouseEnter={() => handleEdgeEnter(i)}
                onMouseLeave={handleEdgeLeave}
                onFocus={() => handleEdgeEnter(i)}
                onBlur={handleEdgeLeave}
                onClick={
                  onEdgeClick
                    ? (event) => {
                        event.stopPropagation();
                        const sNode = nodeMap.get(edge.source);
                        const tNode = nodeMap.get(edge.target);
                        if (sNode && tNode) {
                          onEdgeClick({
                            edge,
                            source: sNode,
                            target: tNode,
                          });
                        }
                      }
                    : undefined
                }
                style={{
                  cursor: onEdgeClick ? 'pointer' : 'default',
                }}
              />
            </g>
          );
        })}
        {/* Nodes */}
        {nodes.map((node, i) => {
          const x = positions[i]!;
          const r = getArcDiagramNodeRadius(node, nodeRadius);
          const color = node.color ?? defaultNodeColor;
          const isHovered = hoveredNode === node.id;
          const isHighlighted = highlightedNodes.has(node.id);
          const op = highlightOnHover
            ? hoveredNode !== null || hoveredEdge !== null
              ? isHighlighted
                ? 1
                : 0.35
              : 0.92
            : 0.92;
          const degree = computeArcDiagramNodeDegree(
            node.id,
            edges,
          );
          return (
            <g
              key={`node-${node.id}`}
              data-section="chart-arc-diagram-node"
              data-node-id={node.id}
              data-node-group={node.group ?? ''}
              data-node-degree={degree}
              data-node-color={color}
              data-hovered={isHovered ? 'true' : 'false'}
              data-highlighted={
                isHighlighted ? 'true' : 'false'
              }
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <circle
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${node.label}: ${fv(degree)} edges`}
                data-section="chart-arc-diagram-node-circle"
                data-node-id={node.id}
                cx={x}
                cy={computedBaselineY}
                r={r}
                fill={color}
                fillOpacity={op}
                stroke={isHovered ? color : '#ffffff'}
                strokeWidth={isHovered ? 2 : 1.25}
                onMouseEnter={() => handleNodeEnter(node.id)}
                onMouseLeave={handleNodeLeave}
                onFocus={() => handleNodeEnter(node.id)}
                onBlur={handleNodeLeave}
                onClick={
                  onNodeClick
                    ? (event) => {
                        event.stopPropagation();
                        onNodeClick({
                          node,
                          index: i,
                          degree,
                        });
                      }
                    : undefined
                }
                style={{
                  cursor: onNodeClick ? 'pointer' : 'default',
                }}
              />
              {showLabels ? (
                <text
                  aria-hidden="true"
                  data-section="chart-arc-diagram-label"
                  data-node-id={node.id}
                  x={x}
                  y={
                    computedBaselineY + r + 12 + (i % 2) * 0
                  }
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={isHighlighted ? 0.9 : 0.65}
                >
                  {node.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {showTooltip && hoveredNodeData ? (
        <div
          role="tooltip"
          data-section="chart-arc-diagram-tooltip"
          data-node-id={hoveredNodeData.id}
          style={{ left: padding, top: padding }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-arc-diagram-tooltip-label"
            className="font-medium"
          >
            {hoveredNodeData.label}
          </div>
          <div
            data-section="chart-arc-diagram-tooltip-degree"
            className="font-mono text-muted-foreground"
          >
            degree:{' '}
            {fv(
              computeArcDiagramNodeDegree(
                hoveredNodeData.id,
                edges,
              ),
            )}
          </div>
          {hoveredNodeData.group ? (
            <div
              data-section="chart-arc-diagram-tooltip-group"
              className="text-muted-foreground"
            >
              group: {hoveredNodeData.group}
            </div>
          ) : null}
        </div>
      ) : null}
      {showTooltip && hoveredEdgeData && !hoveredNodeData ? (
        <div
          role="tooltip"
          data-section="chart-arc-diagram-edge-tooltip"
          data-source-id={hoveredEdgeData.source}
          data-target-id={hoveredEdgeData.target}
          style={{ left: padding, top: padding }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-arc-diagram-edge-tooltip-label"
            className="font-medium"
          >
            {hoveredEdgeData.source} - {hoveredEdgeData.target}
          </div>
          <div
            data-section="chart-arc-diagram-edge-tooltip-weight"
            className="font-mono"
          >
            weight: {fv(hoveredEdgeData.weight ?? 1)}
          </div>
        </div>
      ) : null}
    </div>
  );
});

ChartArcDiagram.displayName = 'ChartArcDiagram';
