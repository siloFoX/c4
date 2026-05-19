import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_CLUSTER_WIDTH = 560;
export const DEFAULT_CHART_CLUSTER_HEIGHT = 360;
export const DEFAULT_CHART_CLUSTER_PADDING = 32;
export const DEFAULT_CHART_CLUSTER_AXIS_RESERVE = 48;
export const DEFAULT_CHART_CLUSTER_LEAF_LABEL_RESERVE = 48;
export const DEFAULT_CHART_CLUSTER_LEAF_RADIUS = 3;
export const DEFAULT_CHART_CLUSTER_NODE_RADIUS = 2;
export const DEFAULT_CHART_CLUSTER_TICK_COUNT = 5;
export const DEFAULT_CHART_CLUSTER_LINK_COLOR = '#475569';
export const DEFAULT_CHART_CLUSTER_LEAF_COLOR = '#0f172a';
export const DEFAULT_CHART_CLUSTER_INTERNAL_COLOR = '#64748b';
export const DEFAULT_CHART_CLUSTER_CUT_COLOR = '#dc2626';
export const DEFAULT_CHART_CLUSTER_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];

export interface ChartClusterNode {
  id: string;
  label: string;
  distance?: number;
  color?: string;
  children?: readonly ChartClusterNode[];
}

export interface ChartClusterFlatNode {
  id: string;
  label: string;
  color?: string;
  depth: number;
  parentId: string | null;
  path: string[];
  isLeaf: boolean;
  distance: number;
}

export interface ChartClusterLayoutNode {
  id: string;
  label: string;
  path: string[];
  depth: number;
  parentId: string | null;
  isLeaf: boolean;
  distance: number;
  x: number;
  y: number;
  leafIndex: number;
  leafCount: number;
  childCount: number;
  color: string;
  clusterId: string | null;
}

export interface ChartClusterLayoutLink {
  index: number;
  sourceId: string;
  targetId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  path: string;
  clusterId: string | null;
}

export interface ComputeClusterLayoutResult {
  nodes: ChartClusterLayoutNode[];
  links: ChartClusterLayoutLink[];
  flat: ChartClusterFlatNode[];
  leafCount: number;
  maxDistance: number;
  ticks: number[];
  clusterIds: string[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getClusterDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_CLUSTER_PALETTE[0]!;
  }
  return DEFAULT_CHART_CLUSTER_PALETTE[
    Math.floor(index) % DEFAULT_CHART_CLUSTER_PALETTE.length
  ]!;
}

export function getClusterNodeDistance(
  node: ChartClusterNode,
  depth: number,
  maxDepth: number
): number {
  if (isFiniteNumber(node.distance) && node.distance >= 0) {
    return node.distance;
  }
  if (!node.children?.length) return 0;
  if (maxDepth <= 0) return 1;
  return (maxDepth - depth) / maxDepth;
}

export function flattenClusterHierarchy(
  root: ChartClusterNode | null
): ChartClusterFlatNode[] {
  if (!root) return [];
  const out: ChartClusterFlatNode[] = [];
  let maxDepth = 0;
  const computeDepth = (
    node: ChartClusterNode,
    depth: number
  ): void => {
    if (depth > maxDepth) maxDepth = depth;
    if (node.children?.length) {
      for (const child of node.children) computeDepth(child, depth + 1);
    }
  };
  computeDepth(root, 0);
  const visit = (
    node: ChartClusterNode,
    parentId: string | null,
    path: string[]
  ) => {
    const depth = path.length;
    const distance = getClusterNodeDistance(node, depth, maxDepth);
    const entry: ChartClusterFlatNode = {
      id: node.id,
      label: node.label,
      depth,
      parentId,
      path: [...path, node.id],
      isLeaf: !node.children?.length,
      distance,
    };
    if (typeof node.color === 'string') entry.color = node.color;
    out.push(entry);
    if (node.children?.length) {
      for (const child of node.children) {
        visit(child, node.id, [...path, node.id]);
      }
    }
  };
  visit(root, null, []);
  return out;
}

export function getClusterLeaves(
  root: ChartClusterNode | null
): ChartClusterFlatNode[] {
  return flattenClusterHierarchy(root).filter((n) => n.isLeaf);
}

export function getClusterMaxDistance(
  flat: readonly ChartClusterFlatNode[]
): number {
  let max = 0;
  for (const n of flat) {
    if (n.distance > max) max = n.distance;
  }
  return max > 0 ? max : 1;
}

export function getClusterTicks(
  max: number,
  count: number = DEFAULT_CHART_CLUSTER_TICK_COUNT
): number[] {
  const c = Math.max(2, Math.floor(count) || 0);
  if (!isFiniteNumber(max) || max <= 0) return [0];
  const step = max / (c - 1);
  return Array.from({ length: c }, (_, i) => step * i);
}

interface InternalNode {
  source: ChartClusterNode;
  parentId: string | null;
  depth: number;
  path: string[];
  children: InternalNode[];
  leafIndex: number;
  leafCount: number;
  distance: number;
}

function buildTree(
  node: ChartClusterNode,
  parentId: string | null,
  depth: number,
  path: string[],
  counter: { value: number },
  maxDepth: number
): InternalNode {
  const internal: InternalNode = {
    source: node,
    parentId,
    depth,
    path: [...path, node.id],
    children: [],
    leafIndex: -1,
    leafCount: 0,
    distance: getClusterNodeDistance(node, depth, maxDepth),
  };
  if (node.children?.length) {
    for (const child of node.children) {
      internal.children.push(
        buildTree(child, node.id, depth + 1, [...path, node.id], counter, maxDepth)
      );
    }
  } else {
    internal.leafIndex = counter.value++;
    internal.leafCount = 1;
  }
  return internal;
}

function computeSubtreeLeafCount(node: InternalNode): number {
  if (!node.children.length) return node.leafCount > 0 ? node.leafCount : 1;
  let sum = 0;
  for (const child of node.children) sum += computeSubtreeLeafCount(child);
  node.leafCount = sum;
  return sum;
}

function maxTreeDepth(node: ChartClusterNode, depth = 0): number {
  if (!node.children?.length) return depth;
  let max = depth;
  for (const child of node.children) {
    const childMax = maxTreeDepth(child, depth + 1);
    if (childMax > max) max = childMax;
  }
  return max;
}

export interface ComputeClusterLayoutInput {
  root: ChartClusterNode | null;
  width: number;
  height: number;
  padX: number;
  padY: number;
  axisReserve: number;
  leafLabelReserve: number;
  cutDistance?: number;
  leafColor: string;
  internalColor: string;
  tickCount: number;
}

export function computeClusterLayout(
  input: ComputeClusterLayoutInput
): ComputeClusterLayoutResult {
  const {
    root,
    width,
    height,
    padX,
    padY,
    axisReserve,
    leafLabelReserve,
    cutDistance,
    leafColor,
    internalColor,
    tickCount,
  } = input;
  const flat = flattenClusterHierarchy(root);
  if (!root || !flat.length || width <= 0 || height <= 0) {
    return {
      nodes: [],
      links: [],
      flat,
      leafCount: 0,
      maxDistance: 0,
      ticks: [],
      clusterIds: [],
    };
  }
  const maxDepth = maxTreeDepth(root);
  const counter = { value: 0 };
  const tree = buildTree(root, null, 0, [], counter, maxDepth);
  const leafCount = computeSubtreeLeafCount(tree);
  const maxDistance = getClusterMaxDistance(flat);
  if (leafCount === 0) {
    return {
      nodes: [],
      links: [],
      flat,
      leafCount: 0,
      maxDistance,
      ticks: [],
      clusterIds: [],
    };
  }
  const innerW = Math.max(0, width - axisReserve);
  const innerH = Math.max(0, height - leafLabelReserve);
  if (innerW <= 0 || innerH <= 0) {
    return {
      nodes: [],
      links: [],
      flat,
      leafCount,
      maxDistance,
      ticks: getClusterTicks(maxDistance, tickCount),
      clusterIds: [],
    };
  }
  const leafStep = leafCount > 1 ? innerW / (leafCount - 1) : 0;

  const xOf = (leafIndex: number) =>
    leafCount === 1
      ? padX + axisReserve + innerW / 2
      : padX + axisReserve + leafIndex * leafStep;
  const yOf = (distance: number) =>
    padY + innerH - (distance / maxDistance) * innerH;

  // Assign cluster IDs: for each internal node whose distance is below
  // `cutDistance`, mark its descendants with a shared cluster id (the
  // root of the cluster). Internal nodes above the cut have no clusterId.
  const clusterRoots: { id: string; node: InternalNode }[] = [];
  const clusterMap = new Map<string, string>();
  const assignCluster = (node: InternalNode, currentClusterId: string | null) => {
    let nextClusterId = currentClusterId;
    if (
      currentClusterId === null &&
      isFiniteNumber(cutDistance) &&
      node.distance <= cutDistance &&
      node.children.length > 0
    ) {
      // First node at/below the cut starts a new cluster
      nextClusterId = node.source.id;
      clusterRoots.push({ id: nextClusterId, node });
    }
    if (nextClusterId) clusterMap.set(node.source.id, nextClusterId);
    for (const child of node.children) assignCluster(child, nextClusterId);
    if (!node.children.length && nextClusterId) {
      clusterMap.set(node.source.id, nextClusterId);
    }
  };
  assignCluster(tree, null);

  const clusterIds = clusterRoots.map((c) => c.id);
  const clusterColorIndex = new Map<string, number>();
  for (let i = 0; i < clusterIds.length; i++) {
    clusterColorIndex.set(clusterIds[i]!, i);
  }

  // Assign positions
  const nodes: ChartClusterLayoutNode[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  const assign = (
    node: InternalNode
  ): { x: number; y: number } => {
    let x: number;
    let y: number;
    if (node.children.length === 0) {
      x = xOf(node.leafIndex);
      y = yOf(0);
    } else {
      const childPos = node.children.map(assign);
      const sum = childPos.reduce((acc, p) => acc + p.x, 0);
      x = sum / childPos.length;
      y = yOf(node.distance);
    }
    positions.set(node.source.id, { x, y });
    const isLeaf = node.children.length === 0;
    const clusterId = clusterMap.get(node.source.id) ?? null;
    let color: string;
    if (typeof node.source.color === 'string') {
      color = node.source.color;
    } else if (clusterId) {
      const idx = clusterColorIndex.get(clusterId);
      color =
        idx != null ? getClusterDefaultColor(idx) : isLeaf ? leafColor : internalColor;
    } else {
      color = isLeaf ? leafColor : internalColor;
    }
    nodes.push({
      id: node.source.id,
      label: node.source.label,
      path: [...node.path],
      depth: node.depth,
      parentId: node.parentId,
      isLeaf,
      distance: node.distance,
      x,
      y,
      leafIndex: node.leafIndex,
      leafCount: node.leafCount,
      childCount: node.children.length,
      color,
      clusterId,
    });
    return { x, y };
  };
  assign(tree);

  const links: ChartClusterLayoutLink[] = [];
  const walkLinks = (node: InternalNode) => {
    const sourcePos = positions.get(node.source.id);
    if (!sourcePos) return;
    for (const child of node.children) {
      const targetPos = positions.get(child.source.id);
      if (!targetPos) continue;
      const clusterId = clusterMap.get(child.source.id) ?? null;
      // Cluster dendrogram convention: vertical drop from parent y to child y at child.x,
      // joined horizontally from sourcePos.x to child.x at sourcePos.y.
      const path =
        `M ${sourcePos.x.toFixed(2)} ${sourcePos.y.toFixed(2)} ` +
        `L ${targetPos.x.toFixed(2)} ${sourcePos.y.toFixed(2)} ` +
        `L ${targetPos.x.toFixed(2)} ${targetPos.y.toFixed(2)}`;
      links.push({
        index: links.length,
        sourceId: node.source.id,
        targetId: child.source.id,
        x1: sourcePos.x,
        y1: sourcePos.y,
        x2: targetPos.x,
        y2: targetPos.y,
        path,
        clusterId,
      });
      walkLinks(child);
    }
  };
  walkLinks(tree);

  const ticks = getClusterTicks(maxDistance, tickCount);

  return {
    nodes,
    links,
    flat,
    leafCount,
    maxDistance,
    ticks,
    clusterIds,
  };
}

export function describeClusterChart(
  root: ChartClusterNode | null,
  cutDistance?: number
): string {
  if (!root) return 'No data';
  const flat = flattenClusterHierarchy(root);
  if (!flat.length) return 'No data';
  const leaves = flat.filter((n) => n.isLeaf).length;
  const maxDistance = getClusterMaxDistance(flat);
  const cutPart =
    isFiniteNumber(cutDistance) && cutDistance > 0
      ? `, cut at ${cutDistance}`
      : '';
  return `Cluster dendrogram with ${flat.length} nodes, ${leaves} leaves, max distance ${Math.round(maxDistance * 1000) / 1000}${cutPart}.`;
}

export interface ChartClusterProps {
  root: ChartClusterNode | null;
  width?: number;
  height?: number;
  padding?: number;
  axisReserve?: number;
  leafLabelReserve?: number;
  cutDistance?: number;
  tickCount?: number;
  leafRadius?: number;
  nodeRadius?: number;
  leafColor?: string;
  internalColor?: string;
  linkColor?: string;
  cutColor?: string;
  showLeafLabels?: boolean;
  showInternalLabels?: boolean;
  showNodes?: boolean;
  showDistanceAxis?: boolean;
  showCutLine?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatLabel?: (label: string, node: ChartClusterLayoutNode) => string;
  formatDistance?: (v: number) => string;
  onNodeClick?: (args: { node: ChartClusterLayoutNode }) => void;
  onLinkClick?: (args: { link: ChartClusterLayoutLink }) => void;
  style?: CSSProperties;
}

function defaultFormatDistance(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  return String(Math.round(v * 100) / 100);
}

const ChartClusterInner = (
  {
    root,
    width = DEFAULT_CHART_CLUSTER_WIDTH,
    height = DEFAULT_CHART_CLUSTER_HEIGHT,
    padding = DEFAULT_CHART_CLUSTER_PADDING,
    axisReserve = DEFAULT_CHART_CLUSTER_AXIS_RESERVE,
    leafLabelReserve = DEFAULT_CHART_CLUSTER_LEAF_LABEL_RESERVE,
    cutDistance,
    tickCount = DEFAULT_CHART_CLUSTER_TICK_COUNT,
    leafRadius = DEFAULT_CHART_CLUSTER_LEAF_RADIUS,
    nodeRadius = DEFAULT_CHART_CLUSTER_NODE_RADIUS,
    leafColor = DEFAULT_CHART_CLUSTER_LEAF_COLOR,
    internalColor = DEFAULT_CHART_CLUSTER_INTERNAL_COLOR,
    linkColor = DEFAULT_CHART_CLUSTER_LINK_COLOR,
    cutColor = DEFAULT_CHART_CLUSTER_CUT_COLOR,
    showLeafLabels = true,
    showInternalLabels = false,
    showNodes = true,
    showDistanceAxis = true,
    showCutLine = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Cluster dendrogram',
    ariaDescription,
    formatLabel,
    formatDistance = defaultFormatDistance,
    onNodeClick,
    onLinkClick,
    style,
  }: ChartClusterProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-cluster-desc-${reactId}`;
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const result = useMemo(
    () =>
      computeClusterLayout({
        root,
        width: innerW,
        height: innerH,
        padX: padding,
        padY: padding,
        axisReserve,
        leafLabelReserve,
        ...(isFiniteNumber(cutDistance) ? { cutDistance } : {}),
        leafColor,
        internalColor,
        tickCount,
      }),
    [
      root,
      innerW,
      innerH,
      padding,
      axisReserve,
      leafLabelReserve,
      cutDistance,
      leafColor,
      internalColor,
      tickCount,
    ]
  );

  const autoDescription = useMemo(
    () => describeClusterChart(root, cutDistance),
    [root, cutDistance]
  );

  const hoveredNode = useMemo(
    () => result.nodes.find((n) => n.id === hoveredNodeId) ?? null,
    [result.nodes, hoveredNodeId]
  );
  const hoveredLink = useMemo(
    () =>
      hoveredLinkIndex != null
        ? result.links.find((l) => l.index === hoveredLinkIndex) ?? null
        : null,
    [result.links, hoveredLinkIndex]
  );

  const axisX = padding + axisReserve;
  const innerHeight = Math.max(0, innerH - leafLabelReserve);

  const yOf = (distance: number) =>
    padding + innerHeight - (distance / Math.max(1e-9, result.maxDistance)) * innerHeight;

  const showCut =
    showCutLine &&
    isFiniteNumber(cutDistance) &&
    cutDistance > 0 &&
    cutDistance <= result.maxDistance;

  return (
    <div
      ref={ref}
      data-section="chart-cluster"
      data-node-count={result.nodes.length}
      data-link-count={result.links.length}
      data-leaf-count={result.leafCount}
      data-max-distance={result.maxDistance}
      data-cluster-count={result.clusterIds.length}
      data-cut-distance={isFiniteNumber(cutDistance) ? cutDistance : ''}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-cluster flex flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-cluster-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-cluster-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-cluster-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showDistanceAxis && result.maxDistance > 0 && (
            <g data-section="chart-cluster-axis">
              <line
                data-section="chart-cluster-axis-line"
                x1={axisX}
                x2={axisX}
                y1={padding}
                y2={padding + innerHeight}
                stroke="rgb(148 163 184)"
                strokeWidth={1}
              />
              {result.ticks.map((t, i) => {
                const y = yOf(t);
                return (
                  <g
                    key={`tick-${i}`}
                    data-section="chart-cluster-axis-tick"
                    data-tick-value={t}
                  >
                    <line
                      x1={axisX - 4}
                      x2={axisX}
                      y1={y}
                      y2={y}
                      stroke="rgb(148 163 184)"
                      strokeWidth={1}
                    />
                    <text
                      data-section="chart-cluster-axis-tick-label"
                      x={axisX - 6}
                      y={y + 3}
                      textAnchor="end"
                      fontSize={10}
                      fill="rgb(100 116 139)"
                    >
                      {formatDistance(t)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          {showCut && cutDistance != null && (
            <g data-section="chart-cluster-cut">
              <line
                data-section="chart-cluster-cut-line"
                data-cut-distance={cutDistance}
                x1={axisX}
                x2={padding + innerW}
                y1={yOf(cutDistance)}
                y2={yOf(cutDistance)}
                stroke={cutColor}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                data-section="chart-cluster-cut-label"
                x={padding + innerW - 4}
                y={yOf(cutDistance) - 4}
                textAnchor="end"
                fontSize={10}
                fontWeight={600}
                fill={cutColor}
              >
                cut {formatDistance(cutDistance)}
              </text>
            </g>
          )}
          <g data-section="chart-cluster-links">
            {result.links.map((link) => {
              const isHovered = hoveredLinkIndex === link.index;
              const color = link.clusterId
                ? result.nodes.find((n) => n.id === link.targetId)?.color ??
                  linkColor
                : linkColor;
              return (
                <path
                  key={`link-${link.index}`}
                  data-section="chart-cluster-link"
                  data-link-index={link.index}
                  data-link-source={link.sourceId}
                  data-link-target={link.targetId}
                  data-link-cluster={link.clusterId ?? ''}
                  data-hovered={isHovered ? 'true' : 'false'}
                  d={link.path}
                  fill="none"
                  stroke={color}
                  strokeOpacity={isHovered ? 1 : 0.85}
                  strokeWidth={isHovered ? 2 : 1.2}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Link ${link.sourceId} to ${link.targetId}`}
                  onMouseEnter={() => setHoveredLinkIndex(link.index)}
                  onMouseLeave={() =>
                    setHoveredLinkIndex((cur) =>
                      cur === link.index ? null : cur
                    )
                  }
                  onFocus={() => setHoveredLinkIndex(link.index)}
                  onBlur={() =>
                    setHoveredLinkIndex((cur) =>
                      cur === link.index ? null : cur
                    )
                  }
                  onClick={() => onLinkClick?.({ link })}
                />
              );
            })}
          </g>
          {showNodes && (
            <g data-section="chart-cluster-nodes">
              {result.nodes.map((node) => {
                const isHovered = hoveredNodeId === node.id;
                const r = node.isLeaf ? leafRadius : nodeRadius;
                const showLabel = node.isLeaf ? showLeafLabels : showInternalLabels;
                const labelText = formatLabel
                  ? formatLabel(node.label, node)
                  : node.label;
                return (
                  <g
                    key={`node-${node.id}`}
                    data-section="chart-cluster-node"
                    data-node-id={node.id}
                    data-node-depth={node.depth}
                    data-node-parent={node.parentId ?? ''}
                    data-node-is-leaf={node.isLeaf ? 'true' : 'false'}
                    data-node-leaf-index={node.leafIndex}
                    data-node-leaf-count={node.leafCount}
                    data-node-child-count={node.childCount}
                    data-node-distance={node.distance}
                    data-node-color={node.color}
                    data-node-cluster={node.clusterId ?? ''}
                    data-hovered={isHovered ? 'true' : 'false'}
                    className={
                      animate ? 'motion-safe:animate-fade-in' : undefined
                    }
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() =>
                      setHoveredNodeId((cur) =>
                        cur === node.id ? null : cur
                      )
                    }
                    onFocus={() => setHoveredNodeId(node.id)}
                    onBlur={() =>
                      setHoveredNodeId((cur) =>
                        cur === node.id ? null : cur
                      )
                    }
                    onClick={() => onNodeClick?.({ node })}
                  >
                    <circle
                      data-section="chart-cluster-node-circle"
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={node.color}
                      stroke="rgb(255 255 255)"
                      strokeWidth={1}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${node.label}${node.isLeaf ? '' : ` (${node.leafCount} leaves, distance ${formatDistance(node.distance)})`}`}
                    />
                    {showLabel && node.isLeaf && (
                      <text
                        data-section="chart-cluster-node-label"
                        x={node.x}
                        y={node.y + r + 12}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={500}
                        fill="rgb(51 65 85)"
                        pointerEvents="none"
                        transform={`rotate(45 ${node.x} ${node.y + r + 12})`}
                      >
                        {labelText}
                      </text>
                    )}
                    {showLabel && !node.isLeaf && (
                      <text
                        data-section="chart-cluster-node-label"
                        x={node.x + 4}
                        y={node.y - 4}
                        textAnchor="start"
                        fontSize={9}
                        fontWeight={400}
                        fill="rgb(71 85 105)"
                        pointerEvents="none"
                      >
                        {labelText}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        {showTooltip && hoveredNode && (
          <div
            data-section="chart-cluster-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-cluster-tooltip-label"
              className="font-semibold"
            >
              {hoveredNode.label}
            </div>
            <div
              data-section="chart-cluster-tooltip-distance"
              className="font-mono text-slate-700"
            >
              distance: {formatDistance(hoveredNode.distance)}
            </div>
            <div
              data-section="chart-cluster-tooltip-leaves"
              className="font-mono text-slate-500"
            >
              {hoveredNode.isLeaf ? 'leaf' : `${hoveredNode.leafCount} leaves`}
            </div>
            {hoveredNode.clusterId && (
              <div
                data-section="chart-cluster-tooltip-cluster"
                className="font-mono text-slate-500"
              >
                cluster: {hoveredNode.clusterId}
              </div>
            )}
          </div>
        )}
        {showTooltip && hoveredLink && !hoveredNode && (
          <div
            data-section="chart-cluster-link-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-cluster-link-tooltip-label"
              className="font-mono text-slate-700"
            >
              {hoveredLink.sourceId} -&gt; {hoveredLink.targetId}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChartCluster = forwardRef<HTMLDivElement, ChartClusterProps>(
  ChartClusterInner
);
ChartCluster.displayName = 'ChartCluster';
