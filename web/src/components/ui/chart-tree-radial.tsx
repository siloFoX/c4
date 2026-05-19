import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_TREE_RADIAL_WIDTH = 420;
export const DEFAULT_CHART_TREE_RADIAL_HEIGHT = 420;
export const DEFAULT_CHART_TREE_RADIAL_PADDING = 32;
export const DEFAULT_CHART_TREE_RADIAL_LEAF_LABEL_RESERVE = 60;
export const DEFAULT_CHART_TREE_RADIAL_NODE_RADIUS = 3;
export const DEFAULT_CHART_TREE_RADIAL_LEAF_RADIUS = 4;
export const DEFAULT_CHART_TREE_RADIAL_LABEL_GAP = 6;
export const DEFAULT_CHART_TREE_RADIAL_START_ANGLE = -Math.PI / 2;
export const DEFAULT_CHART_TREE_RADIAL_LINK_COLOR = '#94a3b8';
export const DEFAULT_CHART_TREE_RADIAL_LEAF_COLOR = '#2563eb';
export const DEFAULT_CHART_TREE_RADIAL_INTERNAL_COLOR = '#64748b';
export const DEFAULT_CHART_TREE_RADIAL_LINK_STYLE = 'curve';

export type ChartTreeRadialLinkStyle = 'curve' | 'elbow' | 'line';

export interface ChartTreeRadialNode {
  id: string;
  label: string;
  color?: string;
  children?: readonly ChartTreeRadialNode[];
}

export interface ChartTreeRadialFlatNode {
  id: string;
  label: string;
  color?: string;
  depth: number;
  parentId: string | null;
  path: string[];
  isLeaf: boolean;
}

export interface ChartTreeRadialLayoutNode {
  id: string;
  label: string;
  path: string[];
  depth: number;
  parentId: string | null;
  angle: number;
  radius: number;
  x: number;
  y: number;
  isLeaf: boolean;
  color: string;
  leafIndex: number;
  leafCount: number;
  childCount: number;
}

export interface ChartTreeRadialLayoutLink {
  index: number;
  sourceId: string;
  targetId: string;
  sourceAngle: number;
  sourceRadius: number;
  targetAngle: number;
  targetRadius: number;
  path: string;
}

export interface ComputeTreeRadialLayoutResult {
  nodes: ChartTreeRadialLayoutNode[];
  links: ChartTreeRadialLayoutLink[];
  flat: ChartTreeRadialFlatNode[];
  leafCount: number;
  maxDepth: number;
  outerRadius: number;
  centerX: number;
  centerY: number;
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

export function getTreeRadialDefaultColor(
  isLeaf: boolean,
  leafColor: string,
  internalColor: string
): string {
  return isLeaf ? leafColor : internalColor;
}

export function flattenTreeRadialHierarchy(
  root: ChartTreeRadialNode | null
): ChartTreeRadialFlatNode[] {
  if (!root) return [];
  const out: ChartTreeRadialFlatNode[] = [];
  const visit = (
    node: ChartTreeRadialNode,
    parentId: string | null,
    path: string[]
  ) => {
    const entry: ChartTreeRadialFlatNode = {
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

export function getTreeRadialLeaves(
  root: ChartTreeRadialNode | null
): ChartTreeRadialFlatNode[] {
  return flattenTreeRadialHierarchy(root).filter((n) => n.isLeaf);
}

export function getTreeRadialMaxDepth(
  flat: readonly ChartTreeRadialFlatNode[]
): number {
  let max = 0;
  for (const n of flat) {
    if (n.depth > max) max = n.depth;
  }
  return max;
}

export function buildTreeRadialLinkPath(
  source: { angle: number; radius: number },
  target: { angle: number; radius: number },
  centerX: number,
  centerY: number,
  style: ChartTreeRadialLinkStyle
): string {
  const sPt = polarToCartesian(centerX, centerY, source.radius, source.angle);
  const tPt = polarToCartesian(centerX, centerY, target.radius, target.angle);
  if (style === 'line') {
    return `M ${sPt.x.toFixed(2)} ${sPt.y.toFixed(2)} L ${tPt.x.toFixed(2)} ${tPt.y.toFixed(2)}`;
  }
  if (style === 'elbow') {
    // arc along the source radius from source angle to target angle, then straight out to target
    const arcEnd = polarToCartesian(
      centerX,
      centerY,
      source.radius,
      target.angle
    );
    const angularSpan = Math.abs(target.angle - source.angle);
    if (source.radius <= 0 || angularSpan === 0) {
      return `M ${sPt.x.toFixed(2)} ${sPt.y.toFixed(2)} L ${tPt.x.toFixed(2)} ${tPt.y.toFixed(2)}`;
    }
    const largeArc = angularSpan > Math.PI ? 1 : 0;
    const sweep = target.angle > source.angle ? 1 : 0;
    return `M ${sPt.x.toFixed(2)} ${sPt.y.toFixed(2)} A ${source.radius.toFixed(2)} ${source.radius.toFixed(2)} 0 ${largeArc} ${sweep} ${arcEnd.x.toFixed(2)} ${arcEnd.y.toFixed(2)} L ${tPt.x.toFixed(2)} ${tPt.y.toFixed(2)}`;
  }
  // 'curve' (default): cubic bezier with control points midway along each radial spoke
  const c1 = polarToCartesian(
    centerX,
    centerY,
    source.radius,
    source.angle + (target.angle - source.angle) * 0.5
  );
  const c2 = polarToCartesian(
    centerX,
    centerY,
    target.radius,
    source.angle + (target.angle - source.angle) * 0.5
  );
  return `M ${sPt.x.toFixed(2)} ${sPt.y.toFixed(2)} C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${tPt.x.toFixed(2)} ${tPt.y.toFixed(2)}`;
}

interface InternalNode {
  source: ChartTreeRadialNode;
  parentId: string | null;
  depth: number;
  path: string[];
  children: InternalNode[];
  leafIndex: number;
  leafCount: number;
}

function buildTree(
  node: ChartTreeRadialNode,
  parentId: string | null,
  depth: number,
  path: string[],
  counter: { value: number }
): InternalNode {
  const internal: InternalNode = {
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
        buildTree(child, node.id, depth + 1, [...path, node.id], counter)
      );
    }
  } else {
    internal.leafIndex = counter.value++;
    internal.leafCount = 1;
  }
  return internal;
}

function computeSubtreeLeafCount(node: InternalNode): number {
  if (!node.children.length) {
    return node.leafCount > 0 ? node.leafCount : 1;
  }
  let sum = 0;
  for (const child of node.children) {
    sum += computeSubtreeLeafCount(child);
  }
  node.leafCount = sum;
  return sum;
}

export interface ComputeTreeRadialLayoutInput {
  root: ChartTreeRadialNode | null;
  centerX: number;
  centerY: number;
  outerRadius: number;
  startAngle: number;
  linkStyle: ChartTreeRadialLinkStyle;
  leafColor: string;
  internalColor: string;
}

export function computeTreeRadialLayout(
  input: ComputeTreeRadialLayoutInput
): ComputeTreeRadialLayoutResult {
  const {
    root,
    centerX,
    centerY,
    outerRadius,
    startAngle,
    linkStyle,
    leafColor,
    internalColor,
  } = input;
  const flat = flattenTreeRadialHierarchy(root);
  if (!root || !flat.length || outerRadius <= 0) {
    return {
      nodes: [],
      links: [],
      flat,
      leafCount: 0,
      maxDepth: 0,
      outerRadius: 0,
      centerX,
      centerY,
    };
  }
  const counter = { value: 0 };
  const tree = buildTree(root, null, 0, [], counter);
  const leafCount = computeSubtreeLeafCount(tree);
  const maxDepth = getTreeRadialMaxDepth(flat);
  if (leafCount === 0) {
    return {
      nodes: [],
      links: [],
      flat,
      leafCount: 0,
      maxDepth,
      outerRadius,
      centerX,
      centerY,
    };
  }
  const angularStep = (Math.PI * 2) / leafCount;
  const depthStep = maxDepth > 0 ? outerRadius / maxDepth : 0;

  const positions = new Map<
    string,
    { angle: number; radius: number; x: number; y: number }
  >();
  const nodes: ChartTreeRadialLayoutNode[] = [];

  const assign = (
    node: InternalNode
  ): { angle: number; radius: number; x: number; y: number } => {
    let angle: number;
    let radius: number;
    if (node.children.length === 0) {
      angle = startAngle + node.leafIndex * angularStep;
      radius = outerRadius;
    } else {
      const childPositions = node.children.map(assign);
      let sumAngle = 0;
      for (const p of childPositions) sumAngle += p.angle;
      angle = sumAngle / childPositions.length;
      radius = node.depth * depthStep;
    }
    const pt = polarToCartesian(centerX, centerY, radius, angle);
    positions.set(node.source.id, { angle, radius, x: pt.x, y: pt.y });
    const isLeaf = node.children.length === 0;
    const color =
      node.source.color ??
      getTreeRadialDefaultColor(isLeaf, leafColor, internalColor);
    nodes.push({
      id: node.source.id,
      label: node.source.label,
      path: [...node.path],
      depth: node.depth,
      parentId: node.parentId,
      angle,
      radius,
      x: pt.x,
      y: pt.y,
      isLeaf,
      color,
      leafIndex: node.leafIndex,
      leafCount: node.leafCount,
      childCount: node.children.length,
    });
    return { angle, radius, x: pt.x, y: pt.y };
  };
  assign(tree);

  const links: ChartTreeRadialLayoutLink[] = [];
  const walkLinks = (node: InternalNode) => {
    const src = positions.get(node.source.id);
    if (!src) return;
    for (const child of node.children) {
      const tgt = positions.get(child.source.id);
      if (!tgt) continue;
      links.push({
        index: links.length,
        sourceId: node.source.id,
        targetId: child.source.id,
        sourceAngle: src.angle,
        sourceRadius: src.radius,
        targetAngle: tgt.angle,
        targetRadius: tgt.radius,
        path: buildTreeRadialLinkPath(
          { angle: src.angle, radius: src.radius },
          { angle: tgt.angle, radius: tgt.radius },
          centerX,
          centerY,
          linkStyle
        ),
      });
      walkLinks(child);
    }
  };
  walkLinks(tree);

  return {
    nodes,
    links,
    flat,
    leafCount,
    maxDepth,
    outerRadius,
    centerX,
    centerY,
  };
}

export function describeTreeRadialChart(
  root: ChartTreeRadialNode | null
): string {
  if (!root) return 'No data';
  const flat = flattenTreeRadialHierarchy(root);
  if (!flat.length) return 'No data';
  const leaves = flat.filter((n) => n.isLeaf).length;
  const maxDepth = getTreeRadialMaxDepth(flat);
  return `Radial tree with ${flat.length} nodes, ${leaves} leaves, depth ${maxDepth}.`;
}

export interface ChartTreeRadialProps {
  root: ChartTreeRadialNode | null;
  width?: number;
  height?: number;
  padding?: number;
  leafLabelReserve?: number;
  startAngle?: number;
  linkStyle?: ChartTreeRadialLinkStyle;
  nodeRadius?: number;
  leafRadius?: number;
  labelGap?: number;
  leafColor?: string;
  internalColor?: string;
  linkColor?: string;
  showLeafLabels?: boolean;
  showInternalLabels?: boolean;
  showNodes?: boolean;
  showTooltip?: boolean;
  rotateLeafLabels?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatLabel?: (
    label: string,
    node: ChartTreeRadialLayoutNode
  ) => string;
  onNodeClick?: (args: { node: ChartTreeRadialLayoutNode }) => void;
  onLinkClick?: (args: { link: ChartTreeRadialLayoutLink }) => void;
  style?: CSSProperties;
}

const ChartTreeRadialInner = (
  {
    root,
    width = DEFAULT_CHART_TREE_RADIAL_WIDTH,
    height = DEFAULT_CHART_TREE_RADIAL_HEIGHT,
    padding = DEFAULT_CHART_TREE_RADIAL_PADDING,
    leafLabelReserve = DEFAULT_CHART_TREE_RADIAL_LEAF_LABEL_RESERVE,
    startAngle = DEFAULT_CHART_TREE_RADIAL_START_ANGLE,
    linkStyle = DEFAULT_CHART_TREE_RADIAL_LINK_STYLE,
    nodeRadius = DEFAULT_CHART_TREE_RADIAL_NODE_RADIUS,
    leafRadius = DEFAULT_CHART_TREE_RADIAL_LEAF_RADIUS,
    labelGap = DEFAULT_CHART_TREE_RADIAL_LABEL_GAP,
    leafColor = DEFAULT_CHART_TREE_RADIAL_LEAF_COLOR,
    internalColor = DEFAULT_CHART_TREE_RADIAL_INTERNAL_COLOR,
    linkColor = DEFAULT_CHART_TREE_RADIAL_LINK_COLOR,
    showLeafLabels = true,
    showInternalLabels = false,
    showNodes = true,
    showTooltip = true,
    rotateLeafLabels = true,
    animate = true,
    className,
    ariaLabel = 'Radial tree',
    ariaDescription,
    formatLabel,
    onNodeClick,
    onLinkClick,
    style,
  }: ChartTreeRadialProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-tree-radial-desc-${reactId}`;
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const reserve = Math.max(0, leafLabelReserve);
  const outerRadius = Math.max(
    0,
    Math.min(innerW, innerH) / 2 - reserve
  );
  const centerX = padding + innerW / 2;
  const centerY = padding + innerH / 2;

  const result = useMemo(
    () =>
      computeTreeRadialLayout({
        root,
        centerX,
        centerY,
        outerRadius,
        startAngle,
        linkStyle,
        leafColor,
        internalColor,
      }),
    [
      root,
      centerX,
      centerY,
      outerRadius,
      startAngle,
      linkStyle,
      leafColor,
      internalColor,
    ]
  );

  const autoDescription = useMemo(
    () => describeTreeRadialChart(root),
    [root]
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

  return (
    <div
      ref={ref}
      data-section="chart-tree-radial"
      data-node-count={result.nodes.length}
      data-link-count={result.links.length}
      data-leaf-count={result.leafCount}
      data-max-depth={result.maxDepth}
      data-link-style={linkStyle}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-tree-radial flex flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-tree-radial-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-tree-radial-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-tree-radial-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-tree-radial-links">
            {result.links.map((link) => {
              const isHovered = hoveredLinkIndex === link.index;
              return (
                <path
                  key={`link-${link.index}`}
                  data-section="chart-tree-radial-link"
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
            <g data-section="chart-tree-radial-nodes">
              {result.nodes.map((node) => {
                const isHovered = hoveredNodeId === node.id;
                const r = node.isLeaf ? leafRadius : nodeRadius;
                const labelAngleDeg = (node.angle * 180) / Math.PI;
                const flipped = node.angle > Math.PI / 2 && node.angle < (3 * Math.PI) / 2;
                const labelOffsetR = r + labelGap;
                const showLabel = node.isLeaf ? showLeafLabels : showInternalLabels;
                const labelText = formatLabel
                  ? formatLabel(node.label, node)
                  : node.label;
                return (
                  <g
                    key={`node-${node.id}`}
                    data-section="chart-tree-radial-node"
                    data-node-id={node.id}
                    data-node-depth={node.depth}
                    data-node-parent={node.parentId ?? ''}
                    data-node-is-leaf={node.isLeaf ? 'true' : 'false'}
                    data-node-leaf-index={node.leafIndex}
                    data-node-leaf-count={node.leafCount}
                    data-node-child-count={node.childCount}
                    data-node-color={node.color}
                    data-node-angle={node.angle}
                    data-node-radius={node.radius}
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
                      data-section="chart-tree-radial-node-circle"
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
                    {showLabel && node.isLeaf && rotateLeafLabels && (
                      <text
                        data-section="chart-tree-radial-node-label"
                        x={node.x}
                        y={node.y}
                        fontSize={11}
                        fontWeight={500}
                        fill="rgb(51 65 85)"
                        pointerEvents="none"
                        textAnchor={flipped ? 'end' : 'start'}
                        transform={`rotate(${flipped ? labelAngleDeg + 180 : labelAngleDeg} ${node.x} ${node.y}) translate(${flipped ? -labelOffsetR : labelOffsetR} 4)`}
                      >
                        {labelText}
                      </text>
                    )}
                    {showLabel && node.isLeaf && !rotateLeafLabels && (
                      <text
                        data-section="chart-tree-radial-node-label"
                        x={node.x + Math.cos(node.angle) * (r + labelGap)}
                        y={node.y + Math.sin(node.angle) * (r + labelGap) + 4}
                        fontSize={11}
                        fontWeight={500}
                        fill="rgb(51 65 85)"
                        pointerEvents="none"
                        textAnchor={
                          Math.cos(node.angle) > 0.2
                            ? 'start'
                            : Math.cos(node.angle) < -0.2
                            ? 'end'
                            : 'middle'
                        }
                      >
                        {labelText}
                      </text>
                    )}
                    {showLabel && !node.isLeaf && (
                      <text
                        data-section="chart-tree-radial-node-label"
                        x={node.x}
                        y={node.y - r - labelGap}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={500}
                        fill="rgb(51 65 85)"
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
            data-section="chart-tree-radial-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-tree-radial-tooltip-label"
              className="font-semibold"
            >
              {hoveredNode.label}
            </div>
            <div
              data-section="chart-tree-radial-tooltip-depth"
              className="font-mono text-slate-700"
            >
              depth: {hoveredNode.depth}
            </div>
            <div
              data-section="chart-tree-radial-tooltip-leaves"
              className="font-mono text-slate-500"
            >
              {hoveredNode.isLeaf ? 'leaf' : `${hoveredNode.leafCount} leaves`}
            </div>
          </div>
        )}
        {showTooltip && hoveredLink && !hoveredNode && (
          <div
            data-section="chart-tree-radial-link-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-tree-radial-link-tooltip-label"
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

export const ChartTreeRadial = forwardRef<
  HTMLDivElement,
  ChartTreeRadialProps
>(ChartTreeRadialInner);
ChartTreeRadial.displayName = 'ChartTreeRadial';
