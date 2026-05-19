import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.472, TODO 11.454) ChartNetwork primitive.
//
// Pure-SVG force-directed network graph. Nodes are placed
// by a simple physics simulation (repulsion + edge spring +
// center gravity) that runs `iterations` steps on mount or
// data change. Edges paint as thin lines between nodes,
// with thickness scaling to edge weight. Drag a node to
// reposition it; the pinned node stays put while the
// simulation re-runs around it. Mouse wheel zooms; drag
// the background to pan.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartNetworkNode {
  id: string;
  label: string;
  group?: string;
  weight?: number;
  color?: string;
  x?: number;
  y?: number;
  fixed?: boolean;
}

export interface ChartNetworkEdge {
  source: string;
  target: string;
  weight?: number;
  label?: string;
  color?: string;
}

export interface ChartNetworkProps {
  nodes: readonly ChartNetworkNode[];
  edges: readonly ChartNetworkEdge[];
  width?: number;
  height?: number;
  iterations?: number;
  repulsion?: number;
  springLength?: number;
  springStrength?: number;
  gravity?: number;
  damping?: number;
  defaultNodeRadius?: number;
  defaultNodeColor?: string;
  defaultEdgeColor?: string;
  showLabels?: boolean;
  showTooltip?: boolean;
  showZoomControls?: boolean;
  enableDrag?: boolean;
  enableZoom?: boolean;
  enablePan?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  onNodeClick?: (args: {
    node: ChartNetworkNode;
    degree: number;
  }) => void;
  onEdgeClick?: (args: {
    edge: ChartNetworkEdge;
    source: ChartNetworkNode;
    target: ChartNetworkNode;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_NETWORK_WIDTH = 600;
export const DEFAULT_CHART_NETWORK_HEIGHT = 400;
export const DEFAULT_CHART_NETWORK_ITERATIONS = 80;
export const DEFAULT_CHART_NETWORK_REPULSION = 800;
export const DEFAULT_CHART_NETWORK_SPRING_LENGTH = 50;
export const DEFAULT_CHART_NETWORK_SPRING_STRENGTH = 0.05;
export const DEFAULT_CHART_NETWORK_GRAVITY = 0.005;
export const DEFAULT_CHART_NETWORK_DAMPING = 0.85;
export const DEFAULT_CHART_NETWORK_NODE_RADIUS = 8;
export const DEFAULT_CHART_NETWORK_NODE_COLOR = '#2563eb';
export const DEFAULT_CHART_NETWORK_EDGE_COLOR = '#94a3b8';

export interface NetworkSimulationParams {
  width: number;
  height: number;
  repulsion: number;
  springLength: number;
  springStrength: number;
  gravity: number;
  damping: number;
}

export interface NetworkSimulationNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
}

// Deterministic initial layout using a golden-angle spiral
// centered on (cx, cy). Nodes that declare their own
// (x, y) keep that position.
export function seedNetworkPositions(
  nodes: readonly ChartNetworkNode[],
  width: number,
  height: number,
): NetworkSimulationNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const phi = Math.PI * (3 - Math.sqrt(5));
  const baseRadius = Math.min(width, height) / 4;
  return nodes.map((n, i) => {
    if (
      n.x !== undefined &&
      Number.isFinite(n.x) &&
      n.y !== undefined &&
      Number.isFinite(n.y)
    ) {
      return {
        id: n.id,
        x: n.x,
        y: n.y,
        vx: 0,
        vy: 0,
        fixed: n.fixed === true,
      };
    }
    const angle = i * phi;
    const r =
      baseRadius * Math.sqrt(i / Math.max(1, nodes.length));
    return {
      id: n.id,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      vx: 0,
      vy: 0,
      fixed: n.fixed === true,
    };
  });
}

// Run one iteration of the force simulation. Pure function:
// returns a new node array with updated positions and
// velocities. Pinned nodes do not move.
export function stepForceSimulation(
  nodes: readonly NetworkSimulationNode[],
  edges: readonly ChartNetworkEdge[],
  params: NetworkSimulationParams,
): NetworkSimulationNode[] {
  const cx = params.width / 2;
  const cy = params.height / 2;
  const next = nodes.map((n) => ({ ...n }));
  for (let i = 0; i < next.length; i += 1) {
    const a = next[i]!;
    if (a.fixed) {
      a.vx = 0;
      a.vy = 0;
      continue;
    }
    let fx = 0;
    let fy = 0;
    // Repulsion (Coulomb)
    for (let j = 0; j < next.length; j += 1) {
      if (i === j) continue;
      const b = next[j]!;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 0.01) {
        // jitter slightly to avoid NaN
        dx = 0.5;
        dy = 0.5;
        distSq = 0.5;
      }
      const force = params.repulsion / distSq;
      const dist = Math.sqrt(distSq);
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
    }
    // Spring attraction along edges
    for (const e of edges) {
      const peer =
        e.source === a.id
          ? e.target
          : e.target === a.id
            ? e.source
            : null;
      if (peer === null) continue;
      const other = next.find((n) => n.id === peer);
      if (!other) continue;
      const dx = other.x - a.x;
      const dy = other.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const displacement = dist - params.springLength;
      const strength = params.springStrength;
      fx += (dx / dist) * displacement * strength;
      fy += (dy / dist) * displacement * strength;
    }
    // Gravity toward center
    fx += (cx - a.x) * params.gravity;
    fy += (cy - a.y) * params.gravity;
    // Damping velocity update
    a.vx = (a.vx + fx) * params.damping;
    a.vy = (a.vy + fy) * params.damping;
    a.x += a.vx;
    a.y += a.vy;
  }
  return next;
}

// Run the simulation for N steps and return the final
// positions. Deterministic given the same inputs.
export function runForceLayout(
  nodes: readonly ChartNetworkNode[],
  edges: readonly ChartNetworkEdge[],
  params: NetworkSimulationParams,
  iterations: number,
): NetworkSimulationNode[] {
  let current = seedNetworkPositions(
    nodes,
    params.width,
    params.height,
  );
  const safeIterations = Math.max(0, Math.floor(iterations));
  for (let i = 0; i < safeIterations; i += 1) {
    current = stepForceSimulation(current, edges, params);
  }
  return current;
}

// Compute the bounding box across the node array.
export function getNetworkBounds(
  nodes: readonly { x: number; y: number }[],
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    if (Number.isFinite(n.x)) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
    }
    if (Number.isFinite(n.y)) {
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}

// Count the number of edges incident on a node.
export function computeNodeDegree(
  nodeId: string,
  edges: readonly ChartNetworkEdge[],
): number {
  let count = 0;
  for (const e of edges) {
    if (e.source === nodeId || e.target === nodeId) count += 1;
  }
  return count;
}

// Find a node within `radius` of (x, y); returns the
// closest node's id or null.
export function findNodeAtPoint(
  nodes: readonly { id: string; x: number; y: number }[],
  x: number,
  y: number,
  radius: number,
): string | null {
  let bestId: string | null = null;
  let bestDist = radius;
  for (const n of nodes) {
    const dx = n.x - x;
    const dy = n.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= bestDist) {
      bestDist = dist;
      bestId = n.id;
    }
  }
  return bestId;
}

// Scale a node's render radius by `weight` (default 1).
export function getNodeRadius(
  node: ChartNetworkNode,
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

// Build the default ARIA description.
export function describeNetworkChart(
  nodes: readonly ChartNetworkNode[],
  edges: readonly ChartNetworkEdge[],
  formatValue?: (v: number) => string,
): string {
  if (nodes.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const top = nodes
    .map((n) => ({
      label: n.label,
      degree: computeNodeDegree(n.id, edges),
    }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 5);
  const summary = top
    .map((t) => `${t.label} degree ${fv(t.degree)}`)
    .join(', ');
  return `Network graph with ${nodes.length} nodes, ${edges.length} edges. Top: ${summary}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartNetwork = forwardRef(function ChartNetwork(
  {
    nodes,
    edges,
    width = DEFAULT_CHART_NETWORK_WIDTH,
    height = DEFAULT_CHART_NETWORK_HEIGHT,
    iterations = DEFAULT_CHART_NETWORK_ITERATIONS,
    repulsion = DEFAULT_CHART_NETWORK_REPULSION,
    springLength = DEFAULT_CHART_NETWORK_SPRING_LENGTH,
    springStrength = DEFAULT_CHART_NETWORK_SPRING_STRENGTH,
    gravity = DEFAULT_CHART_NETWORK_GRAVITY,
    damping = DEFAULT_CHART_NETWORK_DAMPING,
    defaultNodeRadius = DEFAULT_CHART_NETWORK_NODE_RADIUS,
    defaultNodeColor = DEFAULT_CHART_NETWORK_NODE_COLOR,
    defaultEdgeColor = DEFAULT_CHART_NETWORK_EDGE_COLOR,
    showLabels = true,
    showTooltip = true,
    showZoomControls = true,
    enableDrag = true,
    enableZoom = true,
    enablePan = true,
    animate = true,
    className,
    ariaLabel = 'Network graph',
    ariaDescription,
    formatValue,
    onNodeClick,
    onEdgeClick,
  }: ChartNetworkProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const params: NetworkSimulationParams = useMemo(
    () => ({
      width,
      height,
      repulsion,
      springLength,
      springStrength,
      gravity,
      damping,
    }),
    [
      damping,
      gravity,
      height,
      repulsion,
      springLength,
      springStrength,
      width,
    ],
  );

  const [positions, setPositions] = useState<
    NetworkSimulationNode[]
  >(() => runForceLayout(nodes, edges, params, iterations));

  useEffect(() => {
    setPositions(runForceLayout(nodes, edges, params, iterations));
  }, [edges, iterations, nodes, params]);

  // Pan / zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Drag state
  const draggingRef = useRef<string | null>(null);
  const panningRef = useRef<{ x: number; y: number } | null>(
    null,
  );
  const svgRef = useRef<SVGSVGElement | null>(null);

  const description = useMemo(
    () =>
      ariaDescription ??
      describeNetworkChart(nodes, edges, formatValue),
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

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const sx = ((clientX - rect.left) / rect.width) * width;
      const sy = ((clientY - rect.top) / rect.height) * height;
      return {
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      };
    },
    [height, pan.x, pan.y, width, zoom],
  );

  const handleNodeMouseDown = useCallback(
    (id: string, e: ReactMouseEvent<SVGElement>) => {
      if (!enableDrag) return;
      e.stopPropagation();
      draggingRef.current = id;
    },
    [enableDrag],
  );

  const handleSvgMouseDown = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (draggingRef.current !== null) return;
      if (!enablePan) return;
      panningRef.current = { x: e.clientX, y: e.clientY };
    },
    [enablePan],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (draggingRef.current) {
        const id = draggingRef.current;
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        setPositions((prev) =>
          prev.map((n) =>
            n.id === id ? { ...n, x, y, vx: 0, vy: 0 } : n,
          ),
        );
      } else if (panningRef.current) {
        const dx = e.clientX - panningRef.current.x;
        const dy = e.clientY - panningRef.current.y;
        panningRef.current = { x: e.clientX, y: e.clientY };
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
    },
    [screenToWorld],
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
    panningRef.current = null;
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      if (!enableZoom) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) =>
        Math.max(0.25, Math.min(4, z * delta)),
      );
    },
    [enableZoom],
  );

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(4, z * 1.2));
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.25, z * (1 / 1.2)));
  }, []);
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const nodeMap = useMemo(() => {
    const m = new Map<string, ChartNetworkNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const posMap = useMemo(() => {
    const m = new Map<string, NetworkSimulationNode>();
    for (const p of positions) m.set(p.id, p);
    return m;
  }, [positions]);

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const hoveredNodeData =
    hoveredNode !== null ? nodeMap.get(hoveredNode) : null;
  const hoveredNodePos =
    hoveredNode !== null ? posMap.get(hoveredNode) : null;
  const hoveredEdgeData =
    hoveredEdge !== null ? edges[hoveredEdge] : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-network"
      data-node-count={nodes.length}
      data-edge-count={edges.length}
      data-zoom={zoom.toFixed(3)}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-network-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-network-svg"
        className="h-auto w-full"
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor:
            draggingRef.current !== null
              ? 'grabbing'
              : panningRef.current
                ? 'grabbing'
                : 'grab',
          touchAction: 'none',
        }}
      >
        <g
          data-section="chart-network-viewport"
          transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
        >
          {/* Edges */}
          {edges.map((e, i) => {
            const src = posMap.get(e.source);
            const tgt = posMap.get(e.target);
            if (!src || !tgt) return null;
            const color = e.color ?? defaultEdgeColor;
            const weight =
              e.weight !== undefined &&
              Number.isFinite(e.weight) &&
              e.weight > 0
                ? e.weight
                : 1;
            const isHovered = hoveredEdge === i;
            return (
              <g
                key={`edge-${i}`}
                data-section="chart-network-edge"
                data-edge-index={i}
                data-source-id={e.source}
                data-target-id={e.target}
                data-edge-weight={weight}
                data-hovered={isHovered ? 'true' : 'false'}
              >
                <line
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${e.source} to ${e.target}: ${fv(weight)}`}
                  data-section="chart-network-edge-line"
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={color}
                  strokeWidth={Math.max(1, weight)}
                  strokeOpacity={isHovered ? 1 : 0.55}
                  onMouseEnter={() => handleEdgeEnter(i)}
                  onMouseLeave={handleEdgeLeave}
                  onFocus={() => handleEdgeEnter(i)}
                  onBlur={handleEdgeLeave}
                  onClick={
                    onEdgeClick
                      ? (event) => {
                          event.stopPropagation();
                          const sNode = nodeMap.get(e.source);
                          const tNode = nodeMap.get(e.target);
                          if (sNode && tNode) {
                            onEdgeClick({
                              edge: e,
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
          {nodes.map((n) => {
            const p = posMap.get(n.id);
            if (!p) return null;
            const r = getNodeRadius(n, defaultNodeRadius);
            const color = n.color ?? defaultNodeColor;
            const isHovered = hoveredNode === n.id;
            const degree = computeNodeDegree(n.id, edges);
            return (
              <g
                key={n.id}
                data-section="chart-network-node"
                data-node-id={n.id}
                data-node-group={n.group ?? ''}
                data-node-degree={degree}
                data-node-color={color}
                data-hovered={isHovered ? 'true' : 'false'}
                data-fixed={n.fixed ? 'true' : 'false'}
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                <circle
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${n.label}: ${fv(degree)} edges`}
                  data-section="chart-network-node-circle"
                  data-node-id={n.id}
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={color}
                  fillOpacity={isHovered ? 1 : 0.92}
                  stroke={
                    isHovered ? color : '#ffffff'
                  }
                  strokeWidth={isHovered ? 2 : 1.5}
                  onMouseDown={(event) =>
                    handleNodeMouseDown(n.id, event)
                  }
                  onMouseEnter={() => handleNodeEnter(n.id)}
                  onMouseLeave={handleNodeLeave}
                  onFocus={() => handleNodeEnter(n.id)}
                  onBlur={handleNodeLeave}
                  onClick={
                    onNodeClick
                      ? (event) => {
                          event.stopPropagation();
                          onNodeClick({
                            node: n,
                            degree,
                          });
                        }
                      : undefined
                  }
                  style={{
                    cursor: enableDrag
                      ? 'grab'
                      : onNodeClick
                        ? 'pointer'
                        : 'default',
                  }}
                />
                {showLabels ? (
                  <text
                    aria-hidden="true"
                    data-section="chart-network-label"
                    data-node-id={n.id}
                    x={p.x + r + 4}
                    y={p.y + 3}
                    fontSize={11}
                    fill="currentColor"
                    fillOpacity={0.85}
                    style={{ pointerEvents: 'none' }}
                  >
                    {n.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      {showZoomControls ? (
        <div
          data-section="chart-network-zoom-controls"
          className="absolute right-2 top-2 flex flex-col gap-1"
        >
          <button
            type="button"
            data-section="chart-network-zoom-in"
            aria-label="Zoom in"
            onClick={zoomIn}
            className="rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground hover:bg-accent"
          >
            +
          </button>
          <button
            type="button"
            data-section="chart-network-zoom-out"
            aria-label="Zoom out"
            onClick={zoomOut}
            className="rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground hover:bg-accent"
          >
            -
          </button>
          <button
            type="button"
            data-section="chart-network-zoom-reset"
            aria-label="Reset view"
            onClick={resetView}
            className="rounded border border-border bg-popover px-1 py-1 text-[10px] text-popover-foreground hover:bg-accent"
          >
            1:1
          </button>
        </div>
      ) : null}
      {showTooltip && hoveredNodeData && hoveredNodePos ? (
        <div
          role="tooltip"
          data-section="chart-network-node-tooltip"
          data-node-id={hoveredNodeData.id}
          style={{
            left: hoveredNodePos.x * zoom + pan.x + 12,
            top: hoveredNodePos.y * zoom + pan.y - 8,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-network-tooltip-label"
            className="font-medium"
          >
            {hoveredNodeData.label}
          </div>
          <div
            data-section="chart-network-tooltip-degree"
            className="text-muted-foreground"
          >
            degree:{' '}
            {fv(computeNodeDegree(hoveredNodeData.id, edges))}
          </div>
          {hoveredNodeData.group ? (
            <div
              data-section="chart-network-tooltip-group"
              className="text-muted-foreground"
            >
              group: {hoveredNodeData.group}
            </div>
          ) : null}
        </div>
      ) : null}
      {showTooltip && hoveredEdgeData && hoveredNode === null ? (
        <div
          role="tooltip"
          data-section="chart-network-edge-tooltip"
          data-source-id={hoveredEdgeData.source}
          data-target-id={hoveredEdgeData.target}
          style={{
            left: width / 2 + pan.x + 12,
            top: height / 2 + pan.y + 12,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-network-edge-tooltip-label"
            className="font-medium"
          >
            {hoveredEdgeData.source} - {hoveredEdgeData.target}
          </div>
          <div
            data-section="chart-network-edge-tooltip-weight"
            className="font-mono"
          >
            weight: {fv(hoveredEdgeData.weight ?? 1)}
          </div>
        </div>
      ) : null}
    </div>
  );
});

ChartNetwork.displayName = 'ChartNetwork';
