import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_SPIDER_WEB_WIDTH = 420;
export const DEFAULT_CHART_SPIDER_WEB_HEIGHT = 420;
export const DEFAULT_CHART_SPIDER_WEB_PADDING = 32;
export const DEFAULT_CHART_SPIDER_WEB_HUB_RADIUS = 12;
export const DEFAULT_CHART_SPIDER_WEB_SPOKE_RADIUS = 8;
export const DEFAULT_CHART_SPIDER_WEB_START_ANGLE = -Math.PI / 2;
export const DEFAULT_CHART_SPIDER_WEB_HUB_COLOR = '#2563eb';
export const DEFAULT_CHART_SPIDER_WEB_SPOKE_COLOR = '#0891b2';
export const DEFAULT_CHART_SPIDER_WEB_EDGE_COLOR = '#94a3b8';
export const DEFAULT_CHART_SPIDER_WEB_RING_COLOR = '#e2e8f0';

export interface ChartSpiderWebNode {
  id: string;
  label: string;
  group?: string;
  weight?: number;
  color?: string;
}

export interface ChartSpiderWebEdge {
  source: string;
  target: string;
  weight?: number;
  color?: string;
}

export interface ChartSpiderWebLayoutNode {
  id: string;
  label: string;
  index: number;
  isHub: boolean;
  group: string;
  x: number;
  y: number;
  angle: number;
  radius: number;
  weight: number;
  color: string;
  degree: number;
}

export interface ChartSpiderWebLayoutEdge {
  index: number;
  source: string;
  target: string;
  isHubSpoke: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  weight: number;
  color: string;
}

export interface ComputeSpiderWebLayoutResult {
  hub: ChartSpiderWebLayoutNode | null;
  spokes: ChartSpiderWebLayoutNode[];
  edges: ChartSpiderWebLayoutEdge[];
  rings: { groups: string[]; radii: number[] };
  outerRadius: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angle: number
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function getSpiderWebNodeWeight(node: ChartSpiderWebNode): number {
  if (!isFiniteNumber(node.weight) || node.weight <= 0) return 1;
  return node.weight;
}

export function getSpiderWebGroups(
  nodes: readonly ChartSpiderWebNode[],
  hubId: string
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of nodes) {
    if (n.id === hubId) continue;
    const g = typeof n.group === 'string' && n.group.length ? n.group : '';
    if (!seen.has(g)) {
      seen.add(g);
      out.push(g);
    }
  }
  return out;
}

export function getSpiderWebDegree(
  nodeId: string,
  edges: readonly ChartSpiderWebEdge[]
): number {
  let deg = 0;
  for (const e of edges) {
    if (e.source === nodeId || e.target === nodeId) deg++;
  }
  return deg;
}

export interface ComputeSpiderWebLayoutInput {
  nodes: readonly ChartSpiderWebNode[];
  edges: readonly ChartSpiderWebEdge[];
  hubId?: string;
  cx: number;
  cy: number;
  outerRadius: number;
  startAngle: number;
  hubColor: string;
  spokeColor: string;
  edgeColor: string;
  groupRings: boolean;
}

export function computeSpiderWebLayout(
  input: ComputeSpiderWebLayoutInput
): ComputeSpiderWebLayoutResult {
  const {
    nodes,
    edges,
    hubId,
    cx,
    cy,
    outerRadius,
    startAngle,
    hubColor,
    spokeColor,
    edgeColor,
    groupRings,
  } = input;
  if (outerRadius <= 0 || !nodes.length) {
    return {
      hub: null,
      spokes: [],
      edges: [],
      rings: { groups: [], radii: [] },
      outerRadius: 0,
    };
  }
  let resolvedHubId = hubId;
  if (!resolvedHubId) {
    resolvedHubId = nodes[0]!.id;
  }
  if (!nodes.some((n) => n.id === resolvedHubId)) {
    resolvedHubId = nodes[0]!.id;
  }
  const spokesInput = nodes.filter((n) => n.id !== resolvedHubId);
  const groups = groupRings
    ? getSpiderWebGroups(nodes, resolvedHubId)
    : [''];
  const ringCount = Math.max(1, groups.length);
  const ringStep =
    ringCount === 1 ? outerRadius : outerRadius / ringCount;
  const radii: number[] = [];
  for (let i = 1; i <= ringCount; i++) radii.push(ringStep * i);

  const hubNodeIn = nodes.find((n) => n.id === resolvedHubId)!;
  const hubDegree = getSpiderWebDegree(hubNodeIn.id, edges);
  const hub: ChartSpiderWebLayoutNode = {
    id: hubNodeIn.id,
    label: hubNodeIn.label,
    index: nodes.indexOf(hubNodeIn),
    isHub: true,
    group: '',
    x: cx,
    y: cy,
    angle: 0,
    radius: 0,
    weight: getSpiderWebNodeWeight(hubNodeIn),
    color: hubNodeIn.color ?? hubColor,
    degree: hubDegree,
  };

  const spokesByGroup = new Map<string, ChartSpiderWebNode[]>();
  for (const s of spokesInput) {
    const g = typeof s.group === 'string' && s.group.length ? s.group : '';
    if (!spokesByGroup.has(g)) spokesByGroup.set(g, []);
    spokesByGroup.get(g)!.push(s);
  }

  const spokes: ChartSpiderWebLayoutNode[] = [];
  if (groupRings) {
    for (let gi = 0; gi < groups.length; gi++) {
      const groupName = groups[gi]!;
      const groupSpokes = spokesByGroup.get(groupName) ?? [];
      if (!groupSpokes.length) continue;
      const ringRadius = radii[gi] ?? outerRadius;
      const angularStep = (Math.PI * 2) / groupSpokes.length;
      for (let i = 0; i < groupSpokes.length; i++) {
        const node = groupSpokes[i]!;
        const angle = startAngle + i * angularStep;
        const pt = polarToCartesian(cx, cy, ringRadius, angle);
        const degree = getSpiderWebDegree(node.id, edges);
        spokes.push({
          id: node.id,
          label: node.label,
          index: nodes.indexOf(node),
          isHub: false,
          group: groupName,
          x: pt.x,
          y: pt.y,
          angle,
          radius: ringRadius,
          weight: getSpiderWebNodeWeight(node),
          color: node.color ?? spokeColor,
          degree,
        });
      }
    }
  } else {
    const angularStep =
      spokesInput.length > 0 ? (Math.PI * 2) / spokesInput.length : 0;
    for (let i = 0; i < spokesInput.length; i++) {
      const node = spokesInput[i]!;
      const angle = startAngle + i * angularStep;
      const pt = polarToCartesian(cx, cy, outerRadius, angle);
      const degree = getSpiderWebDegree(node.id, edges);
      const group =
        typeof node.group === 'string' && node.group.length ? node.group : '';
      spokes.push({
        id: node.id,
        label: node.label,
        index: nodes.indexOf(node),
        isHub: false,
        group,
        x: pt.x,
        y: pt.y,
        angle,
        radius: outerRadius,
        weight: getSpiderWebNodeWeight(node),
        color: node.color ?? spokeColor,
        degree,
      });
    }
  }

  const nodeMap = new Map<string, ChartSpiderWebLayoutNode>();
  nodeMap.set(hub.id, hub);
  for (const s of spokes) nodeMap.set(s.id, s);

  const layoutEdges: ChartSpiderWebLayoutEdge[] = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;
    const isHubSpoke =
      src.id === resolvedHubId || tgt.id === resolvedHubId;
    const weight = isFiniteNumber(e.weight) && e.weight > 0 ? e.weight : 1;
    layoutEdges.push({
      index: i,
      source: e.source,
      target: e.target,
      isHubSpoke,
      x1: src.x,
      y1: src.y,
      x2: tgt.x,
      y2: tgt.y,
      weight,
      color: e.color ?? edgeColor,
    });
  }

  return {
    hub,
    spokes,
    edges: layoutEdges,
    rings: { groups, radii },
    outerRadius,
  };
}

export function describeSpiderWebChart(
  nodes: readonly ChartSpiderWebNode[],
  edges: readonly ChartSpiderWebEdge[],
  hubId?: string
): string {
  if (!nodes.length) return 'No data';
  const resolvedHubId = hubId ?? nodes[0]?.id ?? '';
  const hub = nodes.find((n) => n.id === resolvedHubId);
  if (!hub) return 'No data';
  const spokes = nodes.length - 1;
  const hubDegree = getSpiderWebDegree(resolvedHubId, edges);
  return `Spider web chart centered on ${hub.label} with ${spokes} spoke node${spokes === 1 ? '' : 's'}, ${edges.length} edge${edges.length === 1 ? '' : 's'}; hub has ${hubDegree} connection${hubDegree === 1 ? '' : 's'}.`;
}

export interface ChartSpiderWebProps {
  nodes: readonly ChartSpiderWebNode[];
  edges?: readonly ChartSpiderWebEdge[];
  hubId?: string;
  width?: number;
  height?: number;
  padding?: number;
  hubRadius?: number;
  spokeRadius?: number;
  startAngle?: number;
  hubColor?: string;
  spokeColor?: string;
  edgeColor?: string;
  ringColor?: string;
  showRings?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  highlightOnHover?: boolean;
  groupRings?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  onNodeClick?: (args: {
    node: ChartSpiderWebNode;
    layout: ChartSpiderWebLayoutNode;
  }) => void;
  onEdgeClick?: (args: {
    edge: ChartSpiderWebEdge;
    layout: ChartSpiderWebLayoutEdge;
  }) => void;
  style?: CSSProperties;
}

function defaultFormatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000 || (Math.abs(v) > 0 && Math.abs(v) < 0.01)) {
    return v.toPrecision(3);
  }
  return String(Math.round(v * 100) / 100);
}

const ChartSpiderWebInner = (
  {
    nodes,
    edges = [],
    hubId,
    width = DEFAULT_CHART_SPIDER_WEB_WIDTH,
    height = DEFAULT_CHART_SPIDER_WEB_HEIGHT,
    padding = DEFAULT_CHART_SPIDER_WEB_PADDING,
    hubRadius = DEFAULT_CHART_SPIDER_WEB_HUB_RADIUS,
    spokeRadius = DEFAULT_CHART_SPIDER_WEB_SPOKE_RADIUS,
    startAngle = DEFAULT_CHART_SPIDER_WEB_START_ANGLE,
    hubColor = DEFAULT_CHART_SPIDER_WEB_HUB_COLOR,
    spokeColor = DEFAULT_CHART_SPIDER_WEB_SPOKE_COLOR,
    edgeColor = DEFAULT_CHART_SPIDER_WEB_EDGE_COLOR,
    ringColor = DEFAULT_CHART_SPIDER_WEB_RING_COLOR,
    showRings = false,
    showLabels = true,
    showTooltip = true,
    highlightOnHover = true,
    groupRings = false,
    animate = true,
    className,
    ariaLabel = 'Spider web chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    onNodeClick,
    onEdgeClick,
    style,
  }: ChartSpiderWebProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-spider-web-desc-${reactId}`;
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeIndex, setHoveredEdgeIndex] = useState<number | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const cx = padding + innerW / 2;
  const cy = padding + innerH / 2;
  const outerRadius = Math.max(0, Math.min(innerW, innerH) / 2 - spokeRadius - 4);

  const result = useMemo(
    () =>
      computeSpiderWebLayout({
        nodes,
        edges,
        ...(typeof hubId === 'string' ? { hubId } : {}),
        cx,
        cy,
        outerRadius,
        startAngle,
        hubColor,
        spokeColor,
        edgeColor,
        groupRings,
      }),
    [
      nodes,
      edges,
      hubId,
      cx,
      cy,
      outerRadius,
      startAngle,
      hubColor,
      spokeColor,
      edgeColor,
      groupRings,
    ]
  );

  const autoDescription = useMemo(
    () => describeSpiderWebChart(nodes, edges, hubId),
    [nodes, edges, hubId]
  );

  const neighborIds = useMemo(() => {
    if (!hoveredNodeId || !highlightOnHover) return null;
    const set = new Set<string>();
    set.add(hoveredNodeId);
    for (const e of edges) {
      if (e.source === hoveredNodeId) set.add(e.target);
      if (e.target === hoveredNodeId) set.add(e.source);
    }
    return set;
  }, [hoveredNodeId, edges, highlightOnHover]);

  const hoveredNode =
    [...(result.hub ? [result.hub] : []), ...result.spokes].find(
      (n) => n.id === hoveredNodeId
    ) ?? null;
  const hoveredEdge =
    hoveredEdgeIndex != null
      ? result.edges.find((e) => e.index === hoveredEdgeIndex) ?? null
      : null;

  const isNodeDim = (id: string) =>
    highlightOnHover && neighborIds != null && !neighborIds.has(id);
  const isEdgeDim = (e: ChartSpiderWebLayoutEdge) =>
    highlightOnHover &&
    hoveredNodeId != null &&
    !(e.source === hoveredNodeId || e.target === hoveredNodeId);

  return (
    <div
      ref={ref}
      data-section="chart-spider-web"
      data-node-count={nodes.length}
      data-spoke-count={result.spokes.length}
      data-edge-count={edges.length}
      data-hub-id={result.hub?.id ?? ''}
      data-group-rings={groupRings ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-spider-web flex flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-spider-web-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-spider-web-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-spider-web-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showRings && result.rings.radii.length > 0 && (
            <g data-section="chart-spider-web-rings" pointerEvents="none">
              {result.rings.radii.map((r, i) => (
                <circle
                  key={`ring-${i}`}
                  data-section="chart-spider-web-ring"
                  data-ring-index={i}
                  data-ring-radius={r}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              ))}
            </g>
          )}
          <g data-section="chart-spider-web-edges">
            {result.edges.map((edge) => {
              const isHoveredEdge = hoveredEdgeIndex === edge.index;
              const dim = isHoveredEdge ? 1 : isEdgeDim(edge) ? 0.18 : 1;
              return (
                <line
                  key={`edge-${edge.index}`}
                  data-section="chart-spider-web-edge"
                  data-edge-index={edge.index}
                  data-edge-source={edge.source}
                  data-edge-target={edge.target}
                  data-edge-weight={edge.weight}
                  data-edge-hub-spoke={edge.isHubSpoke ? 'true' : 'false'}
                  data-hovered={isHoveredEdge ? 'true' : 'false'}
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  stroke={edge.color}
                  strokeWidth={Math.max(0.8, Math.min(4, edge.weight))}
                  strokeOpacity={dim}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${edge.source} to ${edge.target}: weight ${formatValue(edge.weight)}`}
                  onMouseEnter={() => setHoveredEdgeIndex(edge.index)}
                  onMouseLeave={() =>
                    setHoveredEdgeIndex((cur) =>
                      cur === edge.index ? null : cur
                    )
                  }
                  onFocus={() => setHoveredEdgeIndex(edge.index)}
                  onBlur={() =>
                    setHoveredEdgeIndex((cur) =>
                      cur === edge.index ? null : cur
                    )
                  }
                  onClick={() => {
                    const orig = edges[edge.index];
                    if (orig) onEdgeClick?.({ edge: orig, layout: edge });
                  }}
                />
              );
            })}
          </g>
          <g data-section="chart-spider-web-nodes">
            {result.spokes.map((node) => {
              const isHovered = hoveredNodeId === node.id;
              const dim = isNodeDim(node.id) ? 0.3 : 1;
              return (
                <g
                  key={`node-${node.id}`}
                  data-section="chart-spider-web-node"
                  data-node-id={node.id}
                  data-node-index={node.index}
                  data-node-group={node.group}
                  data-node-color={node.color}
                  data-node-degree={node.degree}
                  data-node-weight={node.weight}
                  data-node-is-hub="false"
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() =>
                    setHoveredNodeId((cur) => (cur === node.id ? null : cur))
                  }
                  onFocus={() => setHoveredNodeId(node.id)}
                  onBlur={() =>
                    setHoveredNodeId((cur) => (cur === node.id ? null : cur))
                  }
                  onClick={() => {
                    const orig = nodes[node.index];
                    if (orig) onNodeClick?.({ node: orig, layout: node });
                  }}
                  style={{ opacity: dim }}
                >
                  <circle
                    data-section="chart-spider-web-node-circle"
                    cx={node.x}
                    cy={node.y}
                    r={spokeRadius * Math.sqrt(node.weight)}
                    fill={node.color}
                    fillOpacity={0.9}
                    stroke="rgb(255 255 255)"
                    strokeWidth={1.5}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${node.label}: degree ${node.degree}`}
                  />
                  {showLabels && (
                    <text
                      data-section="chart-spider-web-node-label"
                      x={node.x + Math.cos(node.angle) * (spokeRadius + 6)}
                      y={node.y + Math.sin(node.angle) * (spokeRadius + 6) + 3}
                      textAnchor={
                        Math.cos(node.angle) > 0.2
                          ? 'start'
                          : Math.cos(node.angle) < -0.2
                          ? 'end'
                          : 'middle'
                      }
                      fontSize={11}
                      fill="rgb(51 65 85)"
                      pointerEvents="none"
                    >
                      {node.label}
                    </text>
                  )}
                </g>
              );
            })}
            {result.hub && (
              <g
                data-section="chart-spider-web-node"
                data-node-id={result.hub.id}
                data-node-index={result.hub.index}
                data-node-group={result.hub.group}
                data-node-color={result.hub.color}
                data-node-degree={result.hub.degree}
                data-node-weight={result.hub.weight}
                data-node-is-hub="true"
                data-hovered={
                  hoveredNodeId === result.hub.id ? 'true' : 'false'
                }
                className={
                  animate ? 'motion-safe:animate-fade-in' : undefined
                }
                onMouseEnter={() => setHoveredNodeId(result.hub!.id)}
                onMouseLeave={() =>
                  setHoveredNodeId((cur) =>
                    cur === result.hub!.id ? null : cur
                  )
                }
                onFocus={() => setHoveredNodeId(result.hub!.id)}
                onBlur={() =>
                  setHoveredNodeId((cur) =>
                    cur === result.hub!.id ? null : cur
                  )
                }
                onClick={() => {
                  const orig = nodes[result.hub!.index];
                  if (orig) onNodeClick?.({ node: orig, layout: result.hub! });
                }}
                style={{
                  opacity:
                    isNodeDim(result.hub.id) ? 0.3 : 1,
                }}
              >
                <circle
                  data-section="chart-spider-web-node-circle"
                  cx={result.hub.x}
                  cy={result.hub.y}
                  r={hubRadius}
                  fill={result.hub.color}
                  stroke="rgb(255 255 255)"
                  strokeWidth={2}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Hub ${result.hub.label}: degree ${result.hub.degree}`}
                />
                {showLabels && (
                  <text
                    data-section="chart-spider-web-node-label"
                    x={result.hub.x}
                    y={result.hub.y + hubRadius + 14}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={600}
                    fill="rgb(51 65 85)"
                    pointerEvents="none"
                  >
                    {result.hub.label}
                  </text>
                )}
              </g>
            )}
          </g>
        </svg>
        {showTooltip && hoveredNode && (
          <div
            data-section="chart-spider-web-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-spider-web-tooltip-label"
              className="font-semibold"
            >
              {hoveredNode.isHub ? `Hub: ${hoveredNode.label}` : hoveredNode.label}
            </div>
            <div
              data-section="chart-spider-web-tooltip-degree"
              className="font-mono text-slate-700"
            >
              degree: {hoveredNode.degree}
            </div>
            {hoveredNode.group && (
              <div
                data-section="chart-spider-web-tooltip-group"
                className="font-mono text-slate-500"
              >
                group: {hoveredNode.group}
              </div>
            )}
          </div>
        )}
        {showTooltip && hoveredEdge && !hoveredNode && (
          <div
            data-section="chart-spider-web-edge-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-spider-web-edge-tooltip-label"
              className="font-semibold"
            >
              {hoveredEdge.source} - {hoveredEdge.target}
            </div>
            <div
              data-section="chart-spider-web-edge-tooltip-weight"
              className="font-mono text-slate-700"
            >
              weight: {formatValue(hoveredEdge.weight)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChartSpiderWeb = forwardRef<HTMLDivElement, ChartSpiderWebProps>(
  ChartSpiderWebInner
);
ChartSpiderWeb.displayName = 'ChartSpiderWeb';
