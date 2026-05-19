import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_DENDROGRAM_WIDTH = 560;
export const DEFAULT_CHART_DENDROGRAM_HEIGHT = 360;
export const DEFAULT_CHART_DENDROGRAM_PADDING = 24;
export const DEFAULT_CHART_DENDROGRAM_LABEL_GAP = 6;
export const DEFAULT_CHART_DENDROGRAM_NODE_RADIUS = 3;
export const DEFAULT_CHART_DENDROGRAM_LEAF_RADIUS = 4;
export const DEFAULT_CHART_DENDROGRAM_ORIENTATION = 'right';
export const DEFAULT_CHART_DENDROGRAM_LINK_COLOR = '#94a3b8';
export const DEFAULT_CHART_DENDROGRAM_LEAF_COLOR = '#2563eb';
export const DEFAULT_CHART_DENDROGRAM_INTERNAL_COLOR = '#64748b';

export type ChartDendrogramOrientation = 'right' | 'down' | 'left' | 'up';

export interface ChartDendrogramNode {
  id: string;
  label: string;
  color?: string;
  children?: readonly ChartDendrogramNode[];
}

export interface ChartDendrogramFlatNode {
  id: string;
  label: string;
  color?: string;
  depth: number;
  parentId: string | null;
  path: string[];
  isLeaf: boolean;
}

export interface ChartDendrogramLayoutNode {
  id: string;
  label: string;
  path: string[];
  depth: number;
  parentId: string | null;
  x: number;
  y: number;
  isLeaf: boolean;
  color: string;
  leafIndex: number; // for leaves
  leafCount: number; // for internal nodes (sub-tree size)
  childCount: number;
}

export interface ChartDendrogramLayoutLink {
  index: number;
  sourceId: string;
  targetId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  path: string;
}

export interface ComputeDendrogramLayoutResult {
  nodes: ChartDendrogramLayoutNode[];
  links: ChartDendrogramLayoutLink[];
  flat: ChartDendrogramFlatNode[];
  leafCount: number;
  maxDepth: number;
}

export function getDendrogramDefaultColor(
  isLeaf: boolean,
  leafColor: string,
  internalColor: string
): string {
  return isLeaf ? leafColor : internalColor;
}

export function flattenDendrogramHierarchy(
  root: ChartDendrogramNode | null
): ChartDendrogramFlatNode[] {
  if (!root) return [];
  const out: ChartDendrogramFlatNode[] = [];
  const visit = (
    node: ChartDendrogramNode,
    parentId: string | null,
    path: string[]
  ) => {
    const entry: ChartDendrogramFlatNode = {
      id: node.id,
      label: node.label,
      depth: path.length,
      parentId,
      path: [...path, node.id],
      isLeaf: !node.children?.length,
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

export function getDendrogramLeaves(
  root: ChartDendrogramNode | null
): ChartDendrogramFlatNode[] {
  return flattenDendrogramHierarchy(root).filter((n) => n.isLeaf);
}

export function getDendrogramMaxDepth(
  flat: readonly ChartDendrogramFlatNode[]
): number {
  let max = 0;
  for (const n of flat) {
    if (n.depth > max) max = n.depth;
  }
  return max;
}

export function buildDendrogramElbowPath(
  source: { x: number; y: number },
  target: { x: number; y: number },
  orientation: ChartDendrogramOrientation
): string {
  if (orientation === 'right' || orientation === 'left') {
    // horizontal axis = x, vertical axis = y; elbow at (target.x, source.y) -> (target.x, target.y)
    return `M ${source.x.toFixed(2)} ${source.y.toFixed(2)} L ${target.x.toFixed(2)} ${source.y.toFixed(2)} L ${target.x.toFixed(2)} ${target.y.toFixed(2)}`;
  }
  // 'down' or 'up': depth axis = y, leaf axis = x; elbow at (source.x, target.y) -> (target.x, target.y)
  return `M ${source.x.toFixed(2)} ${source.y.toFixed(2)} L ${source.x.toFixed(2)} ${target.y.toFixed(2)} L ${target.x.toFixed(2)} ${target.y.toFixed(2)}`;
}

export interface ComputeDendrogramLayoutInput {
  root: ChartDendrogramNode | null;
  orientation: ChartDendrogramOrientation;
  width: number;
  height: number;
  padX: number;
  padY: number;
  labelGap: number;
  leafLabelReserve: number;
  leafColor: string;
  internalColor: string;
}

interface InternalLayoutNode {
  source: ChartDendrogramNode;
  parentId: string | null;
  depth: number;
  path: string[];
  children: InternalLayoutNode[];
  leafIndex: number;
  leafCount: number;
}

function buildTree(
  node: ChartDendrogramNode,
  parentId: string | null,
  depth: number,
  path: string[],
  leafCounter: { value: number }
): InternalLayoutNode {
  const internal: InternalLayoutNode = {
    source: node,
    parentId,
    depth,
    path: [...path, node.id],
    children: [],
    leafIndex: -1,
    leafCount: 0,
  };
  if (node.children?.length) {
    for (const child of node.children) {
      internal.children.push(
        buildTree(child, node.id, depth + 1, [...path, node.id], leafCounter)
      );
    }
  } else {
    internal.leafIndex = leafCounter.value++;
    internal.leafCount = 1;
  }
  return internal;
}

function computeLeafCount(node: InternalLayoutNode): number {
  if (!node.children.length) return node.leafCount > 0 ? node.leafCount : 1;
  let sum = 0;
  for (const child of node.children) sum += computeLeafCount(child);
  node.leafCount = sum;
  return sum;
}

export function computeDendrogramLayout(
  input: ComputeDendrogramLayoutInput
): ComputeDendrogramLayoutResult {
  const {
    root,
    orientation,
    width,
    height,
    padX,
    padY,
    labelGap,
    leafLabelReserve,
    leafColor,
    internalColor,
  } = input;
  const flat = flattenDendrogramHierarchy(root);
  if (!root || !flat.length || width <= 0 || height <= 0) {
    return { nodes: [], links: [], flat, leafCount: 0, maxDepth: 0 };
  }
  const leafCounter = { value: 0 };
  const tree = buildTree(root, null, 0, [], leafCounter);
  const leafCount = computeLeafCount(tree);
  const maxDepth = getDendrogramMaxDepth(flat);
  if (leafCount === 0) {
    return { nodes: [], links: [], flat, leafCount: 0, maxDepth };
  }

  const isHorizontal = orientation === 'right' || orientation === 'left';
  const reserve = Math.max(0, leafLabelReserve);
  const depthSpan = isHorizontal
    ? Math.max(0, width - reserve)
    : Math.max(0, height - reserve);
  const leafSpan = isHorizontal ? height : width;
  const depthStep = maxDepth > 0 ? depthSpan / maxDepth : 0;
  const leafStep = leafCount > 1 ? leafSpan / (leafCount - 1) : 0;

  const depthAxisOffset = (depth: number): number => {
    if (orientation === 'right') return padX + depth * depthStep;
    if (orientation === 'left') return padX + width - depth * depthStep;
    if (orientation === 'down') return padY + depth * depthStep;
    return padY + height - depth * depthStep;
  };
  const leafAxisOffset = (idx: number): number => {
    if (leafCount === 1) {
      return isHorizontal ? padY + height / 2 : padX + width / 2;
    }
    return isHorizontal ? padY + idx * leafStep : padX + idx * leafStep;
  };

  // Recursively assign positions
  const nodes: ChartDendrogramLayoutNode[] = [];
  const linksBuf: ChartDendrogramLayoutLink[] = [];
  const positions = new Map<string, { x: number; y: number }>();

  const assign = (node: InternalLayoutNode): { x: number; y: number } => {
    let pos: { x: number; y: number };
    if (node.children.length === 0) {
      const depthCoord = depthAxisOffset(maxDepth);
      const leafCoord = leafAxisOffset(node.leafIndex);
      pos = isHorizontal
        ? { x: depthCoord, y: leafCoord }
        : { x: leafCoord, y: depthCoord };
    } else {
      const childPositions = node.children.map(assign);
      const sum = childPositions.reduce(
        (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
        { x: 0, y: 0 }
      );
      const meanX = sum.x / childPositions.length;
      const meanY = sum.y / childPositions.length;
      const depthCoord = depthAxisOffset(node.depth);
      pos = isHorizontal
        ? { x: depthCoord, y: meanY }
        : { x: meanX, y: depthCoord };
    }
    positions.set(node.source.id, pos);
    const isLeaf = node.children.length === 0;
    const color =
      node.source.color ??
      getDendrogramDefaultColor(isLeaf, leafColor, internalColor);
    nodes.push({
      id: node.source.id,
      label: node.source.label,
      path: [...node.path],
      depth: node.depth,
      parentId: node.parentId,
      x: pos.x,
      y: pos.y,
      isLeaf,
      color,
      leafIndex: node.leafIndex,
      leafCount: node.leafCount,
      childCount: node.children.length,
    });
    return pos;
  };
  assign(tree);

  // Build links by walking the tree again
  const walkLinks = (node: InternalLayoutNode) => {
    const sourcePos = positions.get(node.source.id);
    if (!sourcePos) return;
    for (const child of node.children) {
      const targetPos = positions.get(child.source.id);
      if (!targetPos) continue;
      linksBuf.push({
        index: linksBuf.length,
        sourceId: node.source.id,
        targetId: child.source.id,
        x1: sourcePos.x,
        y1: sourcePos.y,
        x2: targetPos.x,
        y2: targetPos.y,
        path: buildDendrogramElbowPath(sourcePos, targetPos, orientation),
      });
      walkLinks(child);
    }
  };
  walkLinks(tree);

  // labelGap used in layout decisions; referenced for callers
  labelGap;

  return { nodes, links: linksBuf, flat, leafCount, maxDepth };
}

export function describeDendrogramChart(
  root: ChartDendrogramNode | null,
  orientation: ChartDendrogramOrientation
): string {
  if (!root) return 'No data';
  const flat = flattenDendrogramHierarchy(root);
  if (!flat.length) return 'No data';
  const leaves = flat.filter((n) => n.isLeaf).length;
  const maxDepth = getDendrogramMaxDepth(flat);
  return `Dendrogram (${orientation}) with ${flat.length} nodes, ${leaves} leaves, depth ${maxDepth}.`;
}

export interface ChartDendrogramProps {
  root: ChartDendrogramNode | null;
  width?: number;
  height?: number;
  padding?: number;
  orientation?: ChartDendrogramOrientation;
  labelGap?: number;
  leafLabelReserve?: number;
  nodeRadius?: number;
  leafRadius?: number;
  leafColor?: string;
  internalColor?: string;
  linkColor?: string;
  showLeafLabels?: boolean;
  showInternalLabels?: boolean;
  showNodes?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatLabel?: (
    label: string,
    node: ChartDendrogramLayoutNode
  ) => string;
  onNodeClick?: (args: { node: ChartDendrogramLayoutNode }) => void;
  onLinkClick?: (args: { link: ChartDendrogramLayoutLink }) => void;
  style?: CSSProperties;
}

const ChartDendrogramInner = (
  {
    root,
    width = DEFAULT_CHART_DENDROGRAM_WIDTH,
    height = DEFAULT_CHART_DENDROGRAM_HEIGHT,
    padding = DEFAULT_CHART_DENDROGRAM_PADDING,
    orientation = DEFAULT_CHART_DENDROGRAM_ORIENTATION,
    labelGap = DEFAULT_CHART_DENDROGRAM_LABEL_GAP,
    leafLabelReserve = 80,
    nodeRadius = DEFAULT_CHART_DENDROGRAM_NODE_RADIUS,
    leafRadius = DEFAULT_CHART_DENDROGRAM_LEAF_RADIUS,
    leafColor = DEFAULT_CHART_DENDROGRAM_LEAF_COLOR,
    internalColor = DEFAULT_CHART_DENDROGRAM_INTERNAL_COLOR,
    linkColor = DEFAULT_CHART_DENDROGRAM_LINK_COLOR,
    showLeafLabels = true,
    showInternalLabels = false,
    showNodes = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Dendrogram',
    ariaDescription,
    formatLabel,
    onNodeClick,
    onLinkClick,
    style,
  }: ChartDendrogramProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-dendrogram-desc-${reactId}`;
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const result = useMemo(
    () =>
      computeDendrogramLayout({
        root,
        orientation,
        width: innerW,
        height: innerH,
        padX: padding,
        padY: padding,
        labelGap,
        leafLabelReserve,
        leafColor,
        internalColor,
      }),
    [
      root,
      orientation,
      innerW,
      innerH,
      padding,
      labelGap,
      leafLabelReserve,
      leafColor,
      internalColor,
    ]
  );

  const autoDescription = useMemo(
    () => describeDendrogramChart(root, orientation),
    [root, orientation]
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

  const labelAnchor = (node: ChartDendrogramLayoutNode) => {
    if (!node.isLeaf) return 'middle';
    if (orientation === 'right') return 'start';
    if (orientation === 'left') return 'end';
    return 'middle';
  };
  const labelDX = (node: ChartDendrogramLayoutNode): number => {
    if (!node.isLeaf) return 0;
    if (orientation === 'right') return labelGap + leafRadius;
    if (orientation === 'left') return -(labelGap + leafRadius);
    return 0;
  };
  const labelDY = (node: ChartDendrogramLayoutNode): number => {
    if (!node.isLeaf) return -labelGap - 2;
    if (orientation === 'down') return labelGap + leafRadius + 10;
    if (orientation === 'up') return -(labelGap + leafRadius + 4);
    return 4;
  };

  return (
    <div
      ref={ref}
      data-section="chart-dendrogram"
      data-node-count={result.nodes.length}
      data-link-count={result.links.length}
      data-leaf-count={result.leafCount}
      data-max-depth={result.maxDepth}
      data-orientation={orientation}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-dendrogram flex flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-dendrogram-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-dendrogram-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-dendrogram-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-dendrogram-links">
            {result.links.map((link) => {
              const isHovered = hoveredLinkIndex === link.index;
              return (
                <path
                  key={`link-${link.index}`}
                  data-section="chart-dendrogram-link"
                  data-link-index={link.index}
                  data-link-source={link.sourceId}
                  data-link-target={link.targetId}
                  data-hovered={isHovered ? 'true' : 'false'}
                  d={link.path}
                  fill="none"
                  stroke={linkColor}
                  strokeOpacity={isHovered ? 1 : 0.7}
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
            <g data-section="chart-dendrogram-nodes">
              {result.nodes.map((node) => {
                const isHovered = hoveredNodeId === node.id;
                const r = node.isLeaf ? leafRadius : nodeRadius;
                return (
                  <g
                    key={`node-${node.id}`}
                    data-section="chart-dendrogram-node"
                    data-node-id={node.id}
                    data-node-depth={node.depth}
                    data-node-parent={node.parentId ?? ''}
                    data-node-is-leaf={node.isLeaf ? 'true' : 'false'}
                    data-node-leaf-index={node.leafIndex}
                    data-node-leaf-count={node.leafCount}
                    data-node-child-count={node.childCount}
                    data-node-color={node.color}
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
                      data-section="chart-dendrogram-node-circle"
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={node.color}
                      stroke="rgb(255 255 255)"
                      strokeWidth={1}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${node.label}${node.isLeaf ? '' : ` (${node.leafCount} leaves)`}`}
                    />
                    {(node.isLeaf ? showLeafLabels : showInternalLabels) && (
                      <text
                        data-section="chart-dendrogram-node-label"
                        x={node.x + labelDX(node)}
                        y={node.y + labelDY(node)}
                        textAnchor={labelAnchor(node)}
                        fontSize={node.isLeaf ? 11 : 10}
                        fontWeight={node.isLeaf ? 500 : 400}
                        fill="rgb(51 65 85)"
                        pointerEvents="none"
                      >
                        {formatLabel ? formatLabel(node.label, node) : node.label}
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
            data-section="chart-dendrogram-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-dendrogram-tooltip-label"
              className="font-semibold"
            >
              {hoveredNode.label}
            </div>
            <div
              data-section="chart-dendrogram-tooltip-depth"
              className="font-mono text-slate-700"
            >
              depth: {hoveredNode.depth}
            </div>
            <div
              data-section="chart-dendrogram-tooltip-leaves"
              className="font-mono text-slate-500"
            >
              {hoveredNode.isLeaf ? 'leaf' : `${hoveredNode.leafCount} leaves`}
            </div>
          </div>
        )}
        {showTooltip && hoveredLink && !hoveredNode && (
          <div
            data-section="chart-dendrogram-link-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-dendrogram-link-tooltip-label"
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

export const ChartDendrogram = forwardRef<
  HTMLDivElement,
  ChartDendrogramProps
>(ChartDendrogramInner);
ChartDendrogram.displayName = 'ChartDendrogram';
