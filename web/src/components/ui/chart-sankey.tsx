import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.467, TODO 11.449) ChartSankey primitive.
//
// Pure-SVG Sankey diagram. Nodes are arranged in vertical
// columns (layers) according to longest path from a source
// node; flows between nodes paint as smooth cubic bezier
// ribbons whose width is proportional to flow value.
// Hovering a node highlights both upstream + downstream
// paths so adopters can read conversion / energy / cost
// flow at a glance.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartSankeyNode {
  id: string;
  label: string;
  color?: string;
  category?: string;
}

export interface ChartSankeyLink {
  source: string;
  target: string;
  value: number;
  color?: string;
}

export interface ChartSankeyProps {
  nodes: readonly ChartSankeyNode[];
  links: readonly ChartSankeyLink[];
  width?: number;
  height?: number;
  nodeWidth?: number;
  nodePadding?: number;
  showLabels?: boolean;
  showTooltip?: boolean;
  showValues?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  onNodeClick?: (args: {
    node: ChartSankeyNode;
    value: number;
  }) => void;
  onLinkClick?: (args: {
    link: ChartSankeyLink;
    source: ChartSankeyNode;
    target: ChartSankeyNode;
  }) => void;
  highlightOnHover?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_SANKEY_WIDTH = 600;
export const DEFAULT_CHART_SANKEY_HEIGHT = 320;
export const DEFAULT_CHART_SANKEY_NODE_WIDTH = 14;
export const DEFAULT_CHART_SANKEY_NODE_PADDING = 10;
export const DEFAULT_CHART_SANKEY_NODE_COLOR = '#475569';
export const DEFAULT_CHART_SANKEY_LINK_COLOR = '#94a3b8';

// Compute the layer index of every node. Layer 0 are
// the sources (nodes with no incoming links). Layer N is
// max(Layer[u] + 1 for u in incoming(v)). Cycles short-
// circuit: any node still unresolved after one full pass
// is parked at the highest seen layer + 1 so the diagram
// still renders without throwing.
export function getSankeyNodeLayers(
  nodes: readonly ChartSankeyNode[],
  links: readonly ChartSankeyLink[],
): Map<string, number> {
  const layer = new Map<string, number>();
  const incoming = new Map<string, ChartSankeyLink[]>();
  for (const n of nodes) incoming.set(n.id, []);
  for (const link of links) {
    const list = incoming.get(link.target);
    if (list) list.push(link);
  }
  // Seed: sources first
  const remaining = new Set(nodes.map((n) => n.id));
  let guard = nodes.length * 2;
  while (remaining.size > 0 && guard > 0) {
    let advanced = false;
    for (const id of Array.from(remaining)) {
      const ins = incoming.get(id) ?? [];
      if (
        ins.length === 0 ||
        ins.every((link) => layer.has(link.source))
      ) {
        const layerIndex =
          ins.length === 0
            ? 0
            : Math.max(
                ...ins.map((link) => (layer.get(link.source) ?? 0) + 1),
              );
        layer.set(id, layerIndex);
        remaining.delete(id);
        advanced = true;
      }
    }
    if (!advanced) break;
    guard -= 1;
  }
  // Park leftovers (cycles) on the next layer
  if (remaining.size > 0) {
    const maxLayer =
      layer.size === 0
        ? 0
        : Math.max(...layer.values());
    for (const id of remaining) layer.set(id, maxLayer + 1);
  }
  return layer;
}

// Sum of incoming or outgoing link values for a node.
// Returns 0 when no flows match.
export function getSankeyNodeValue(
  nodeId: string,
  links: readonly ChartSankeyLink[],
): number {
  let inFlow = 0;
  let outFlow = 0;
  for (const link of links) {
    if (!Number.isFinite(link.value) || link.value <= 0) continue;
    if (link.target === nodeId) inFlow += link.value;
    if (link.source === nodeId) outFlow += link.value;
  }
  return Math.max(inFlow, outFlow);
}

// Compute every ancestor of `nodeId` (set of node ids
// reachable by walking incoming links upward). The result
// excludes `nodeId` itself.
export function findUpstreamNodes(
  nodeId: string,
  links: readonly ChartSankeyLink[],
): Set<string> {
  const result = new Set<string>();
  const queue: string[] = [nodeId];
  const visited = new Set<string>([nodeId]);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const link of links) {
      if (link.target !== curr) continue;
      const src = link.source;
      if (visited.has(src)) continue;
      visited.add(src);
      result.add(src);
      queue.push(src);
    }
  }
  return result;
}

// Compute every descendant of `nodeId`.
export function findDownstreamNodes(
  nodeId: string,
  links: readonly ChartSankeyLink[],
): Set<string> {
  const result = new Set<string>();
  const queue: string[] = [nodeId];
  const visited = new Set<string>([nodeId]);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const link of links) {
      if (link.source !== curr) continue;
      const tgt = link.target;
      if (visited.has(tgt)) continue;
      visited.add(tgt);
      result.add(tgt);
      queue.push(tgt);
    }
  }
  return result;
}

// Build a cubic bezier ribbon path for a flow. The flow
// width is constant: at the source it extends
// [sourceY ... sourceY + thickness], at the target it
// extends [targetY ... targetY + thickness]. We draw a
// closed path connecting the four corners.
export function buildSankeyLinkPath(
  x1: number,
  x2: number,
  sourceY: number,
  targetY: number,
  thickness: number,
): string {
  const mid = (x1 + x2) / 2;
  const sy1 = sourceY;
  const sy2 = sourceY + thickness;
  const ty1 = targetY;
  const ty2 = targetY + thickness;
  return [
    `M ${x1.toFixed(2)} ${sy1.toFixed(2)}`,
    `C ${mid.toFixed(2)} ${sy1.toFixed(2)} ${mid.toFixed(2)} ${ty1.toFixed(2)} ${x2.toFixed(2)} ${ty1.toFixed(2)}`,
    `L ${x2.toFixed(2)} ${ty2.toFixed(2)}`,
    `C ${mid.toFixed(2)} ${ty2.toFixed(2)} ${mid.toFixed(2)} ${sy2.toFixed(2)} ${x1.toFixed(2)} ${sy2.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// Build the default ARIA description summarising every
// node + outgoing flow value.
export function describeSankeyChart(
  nodes: readonly ChartSankeyNode[],
  links: readonly ChartSankeyLink[],
  formatValue?: (v: number) => string,
): string {
  if (nodes.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const summary = nodes.map((n) => {
    const value = getSankeyNodeValue(n.id, links);
    return `${n.label} ${fv(value)}`;
  });
  return `Sankey with ${nodes.length} nodes, ${links.length} flows. ${summary.join(', ')}.`;
}

// ---------------------------------------------------------------
// Layout (internal)
// ---------------------------------------------------------------

interface NodeRect {
  node: ChartSankeyNode;
  layer: number;
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
}

interface LinkPlacement {
  link: ChartSankeyLink;
  source: ChartSankeyNode;
  target: ChartSankeyNode;
  x1: number;
  x2: number;
  sourceY: number;
  targetY: number;
  thickness: number;
}

interface SankeyLayout {
  nodes: NodeRect[];
  links: LinkPlacement[];
}

function buildSankeyLayout(
  nodes: readonly ChartSankeyNode[],
  links: readonly ChartSankeyLink[],
  width: number,
  height: number,
  nodeWidth: number,
  nodePadding: number,
): SankeyLayout {
  if (nodes.length === 0 || width <= 0 || height <= 0) {
    return { nodes: [], links: [] };
  }
  const layerMap = getSankeyNodeLayers(nodes, links);
  const layerCount =
    layerMap.size === 0
      ? 1
      : Math.max(...layerMap.values()) + 1;

  const layerWidth =
    layerCount === 1
      ? 0
      : (width - nodeWidth) / Math.max(1, layerCount - 1);

  // Bucket nodes by layer in their original declaration order
  const byLayer = new Map<number, ChartSankeyNode[]>();
  for (const n of nodes) {
    const li = layerMap.get(n.id) ?? 0;
    const arr = byLayer.get(li) ?? [];
    arr.push(n);
    byLayer.set(li, arr);
  }

  // Find max total value at any layer to derive vertical scale
  const layerTotals: Record<number, number> = {};
  for (const [li, ns] of byLayer.entries()) {
    let total = 0;
    for (const n of ns) {
      total += getSankeyNodeValue(n.id, links);
    }
    layerTotals[li] = total;
  }
  const maxLayerTotal = Math.max(
    1,
    ...Object.values(layerTotals),
  );
  // Account for padding budget: subtract padding between
  // nodes from the available height per column
  const padBudget = (nodes: number) =>
    Math.max(0, (nodes - 1) * nodePadding);

  // Layout node rects + remember per-link source/target Y offsets
  const nodeRects: NodeRect[] = [];
  const sourceCursor = new Map<string, number>();
  const targetCursor = new Map<string, number>();

  for (let li = 0; li < layerCount; li += 1) {
    const ns = byLayer.get(li) ?? [];
    if (ns.length === 0) continue;
    const colTotal = layerTotals[li] ?? 0;
    const padded = padBudget(ns.length);
    const colAvailable = Math.max(
      0,
      height - padded,
    );
    const scale = colTotal > 0 ? colAvailable / maxLayerTotal : 0;
    let y = 0;
    for (const n of ns) {
      const value = getSankeyNodeValue(n.id, links);
      const h = Math.max(2, value * scale);
      nodeRects.push({
        node: n,
        layer: li,
        x: li * layerWidth,
        y,
        w: nodeWidth,
        h,
        value,
      });
      sourceCursor.set(n.id, y);
      targetCursor.set(n.id, y);
      y += h + nodePadding;
    }
  }

  // Build link placements
  const linkPlacements: LinkPlacement[] = [];
  for (const link of links) {
    if (!Number.isFinite(link.value) || link.value <= 0) continue;
    const sourceNode = nodeRects.find(
      (n) => n.node.id === link.source,
    );
    const targetNode = nodeRects.find(
      (n) => n.node.id === link.target,
    );
    if (!sourceNode || !targetNode) continue;
    const sourceValue = sourceNode.value;
    const targetValue = targetNode.value;
    const thickness =
      sourceValue > 0
        ? (link.value / sourceValue) * sourceNode.h
        : 0;
    const sourceY = sourceCursor.get(link.source) ?? 0;
    const targetThickness =
      targetValue > 0
        ? (link.value / targetValue) * targetNode.h
        : 0;
    const targetY = targetCursor.get(link.target) ?? 0;
    linkPlacements.push({
      link,
      source: sourceNode.node,
      target: targetNode.node,
      x1: sourceNode.x + sourceNode.w,
      x2: targetNode.x,
      sourceY,
      targetY,
      thickness: Math.max(thickness, targetThickness),
    });
    sourceCursor.set(link.source, sourceY + thickness);
    targetCursor.set(link.target, targetY + targetThickness);
  }

  return { nodes: nodeRects, links: linkPlacements };
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartSankey = forwardRef(function ChartSankey(
  {
    nodes,
    links,
    width = DEFAULT_CHART_SANKEY_WIDTH,
    height = DEFAULT_CHART_SANKEY_HEIGHT,
    nodeWidth = DEFAULT_CHART_SANKEY_NODE_WIDTH,
    nodePadding = DEFAULT_CHART_SANKEY_NODE_PADDING,
    showLabels = true,
    showTooltip = true,
    showValues = true,
    animate = true,
    className,
    ariaLabel = 'Sankey diagram',
    ariaDescription,
    formatValue,
    onNodeClick,
    onLinkClick,
    highlightOnHover = true,
  }: ChartSankeyProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const padX = 8;
  const padY = 8;
  const innerWidth = Math.max(0, width - padX * 2);
  const innerHeight = Math.max(0, height - padY * 2);
  const layout = useMemo(
    () =>
      buildSankeyLayout(
        nodes,
        links,
        innerWidth,
        innerHeight,
        nodeWidth,
        nodePadding,
      ),
    [
      innerHeight,
      innerWidth,
      links,
      nodePadding,
      nodes,
      nodeWidth,
    ],
  );
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const description = useMemo(
    () =>
      ariaDescription ??
      describeSankeyChart(nodes, links, formatValue),
    [ariaDescription, formatValue, links, nodes],
  );

  const [hoveredNode, setHoveredNode] = useState<string | null>(
    null,
  );
  const [hoveredLink, setHoveredLink] = useState<number | null>(
    null,
  );

  const handleNodeEnter = useCallback((id: string) => {
    setHoveredNode(id);
  }, []);
  const handleNodeLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);
  const handleLinkEnter = useCallback((idx: number) => {
    setHoveredLink(idx);
  }, []);
  const handleLinkLeave = useCallback(() => {
    setHoveredLink(null);
  }, []);

  const highlightedNodes = useMemo(() => {
    if (!highlightOnHover || hoveredNode === null) {
      return new Set<string>();
    }
    const up = findUpstreamNodes(hoveredNode, links);
    const down = findDownstreamNodes(hoveredNode, links);
    up.add(hoveredNode);
    for (const id of down) up.add(id);
    return up;
  }, [highlightOnHover, hoveredNode, links]);

  const highlightedLinks = useMemo(() => {
    if (!highlightOnHover || hoveredNode === null) {
      return new Set<number>();
    }
    const set = new Set<number>();
    for (let i = 0; i < layout.links.length; i += 1) {
      const link = layout.links[i]!.link;
      if (
        link.source === hoveredNode ||
        link.target === hoveredNode ||
        (highlightedNodes.has(link.source) &&
          highlightedNodes.has(link.target))
      ) {
        set.add(i);
      }
    }
    return set;
  }, [
    highlightOnHover,
    highlightedNodes,
    hoveredNode,
    layout.links,
  ]);

  const hoveredNodeRect = useMemo(() => {
    if (hoveredNode === null) return null;
    return (
      layout.nodes.find((n) => n.node.id === hoveredNode) ?? null
    );
  }, [hoveredNode, layout.nodes]);

  const hoveredLinkPlacement = useMemo(() => {
    if (hoveredLink === null) return null;
    return layout.links[hoveredLink] ?? null;
  }, [hoveredLink, layout.links]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-sankey"
      data-node-count={nodes.length}
      data-link-count={links.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-sankey-aria-desc"
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
        data-section="chart-sankey-svg"
        className="h-auto w-full"
      >
        <g transform={`translate(${padX}, ${padY})`}>
          {/* Links first so nodes paint on top */}
          {layout.links.map((placement, idx) => {
            const isHighlighted = highlightedLinks.has(idx);
            const isHovered = hoveredLink === idx;
            const linkColor =
              placement.link.color ??
              DEFAULT_CHART_SANKEY_LINK_COLOR;
            const path = buildSankeyLinkPath(
              placement.x1,
              placement.x2,
              placement.sourceY,
              placement.targetY,
              placement.thickness,
            );
            return (
              <path
                key={`link-${idx}`}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${placement.source.label} to ${placement.target.label}: ${fv(placement.link.value)}`}
                data-section="chart-sankey-link"
                data-source-id={placement.link.source}
                data-target-id={placement.link.target}
                data-link-index={idx}
                data-hovered={isHovered ? 'true' : 'false'}
                data-highlighted={
                  isHighlighted ? 'true' : 'false'
                }
                d={path}
                fill={linkColor}
                fillOpacity={
                  hoveredNode !== null || hoveredLink !== null
                    ? isHighlighted || isHovered
                      ? 0.6
                      : 0.12
                    : 0.4
                }
                stroke="none"
                onMouseEnter={() => handleLinkEnter(idx)}
                onMouseLeave={handleLinkLeave}
                onFocus={() => handleLinkEnter(idx)}
                onBlur={handleLinkLeave}
                onClick={
                  onLinkClick
                    ? () =>
                        onLinkClick({
                          link: placement.link,
                          source: placement.source,
                          target: placement.target,
                        })
                    : undefined
                }
                style={{
                  cursor: onLinkClick ? 'pointer' : 'default',
                }}
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              />
            );
          })}
          {/* Nodes */}
          {layout.nodes.map((n) => {
            const isHovered = hoveredNode === n.node.id;
            const isHighlighted = highlightedNodes.has(n.node.id);
            const color =
              n.node.color ?? DEFAULT_CHART_SANKEY_NODE_COLOR;
            return (
              <g
                key={n.node.id}
                data-section="chart-sankey-node"
                data-node-id={n.node.id}
                data-layer={n.layer}
                data-hovered={isHovered ? 'true' : 'false'}
                data-highlighted={
                  isHighlighted ? 'true' : 'false'
                }
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                <rect
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${n.node.label}: ${fv(n.value)}`}
                  data-section="chart-sankey-node-rect"
                  data-node-id={n.node.id}
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  fill={color}
                  fillOpacity={
                    hoveredNode !== null
                      ? isHighlighted || isHovered
                        ? 1
                        : 0.35
                      : 0.9
                  }
                  stroke={isHovered ? '#0f172a' : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  onMouseEnter={() => handleNodeEnter(n.node.id)}
                  onMouseLeave={handleNodeLeave}
                  onFocus={() => handleNodeEnter(n.node.id)}
                  onBlur={handleNodeLeave}
                  onClick={
                    onNodeClick
                      ? () =>
                          onNodeClick({
                            node: n.node,
                            value: n.value,
                          })
                      : undefined
                  }
                  style={{
                    cursor: onNodeClick ? 'pointer' : 'default',
                  }}
                />
                {showLabels ? (
                  <text
                    aria-hidden="true"
                    data-section="chart-sankey-label"
                    data-node-id={n.node.id}
                    x={
                      n.x + n.w / 2 < innerWidth / 2
                        ? n.x + n.w + 4
                        : n.x - 4
                    }
                    y={n.y + n.h / 2}
                    textAnchor={
                      n.x + n.w / 2 < innerWidth / 2
                        ? 'start'
                        : 'end'
                    }
                    alignmentBaseline="middle"
                    fontSize={11}
                    fill="currentColor"
                    fillOpacity={0.85}
                  >
                    {n.node.label}
                    {showValues ? ` (${fv(n.value)})` : ''}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      {showTooltip && hoveredNodeRect ? (
        <div
          role="tooltip"
          data-section="chart-sankey-node-tooltip"
          data-node-id={hoveredNodeRect.node.id}
          style={{
            left:
              hoveredNodeRect.x + padX + hoveredNodeRect.w + 8,
            top: hoveredNodeRect.y + padY,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-sankey-tooltip-label"
            className="font-medium"
          >
            {hoveredNodeRect.node.label}
          </div>
          <div
            data-section="chart-sankey-tooltip-value"
            className="font-mono"
          >
            {fv(hoveredNodeRect.value)}
          </div>
        </div>
      ) : null}
      {showTooltip && hoveredLinkPlacement && !hoveredNode ? (
        <div
          role="tooltip"
          data-section="chart-sankey-link-tooltip"
          data-source-id={hoveredLinkPlacement.link.source}
          data-target-id={hoveredLinkPlacement.link.target}
          style={{
            left:
              (hoveredLinkPlacement.x1 + hoveredLinkPlacement.x2) /
                2 +
              padX,
            top:
              (hoveredLinkPlacement.sourceY +
                hoveredLinkPlacement.targetY) /
                2 +
              padY,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-sankey-link-tooltip-label"
            className="font-medium"
          >
            {hoveredLinkPlacement.source.label}
            {' → '}
            {hoveredLinkPlacement.target.label}
          </div>
          <div
            data-section="chart-sankey-link-tooltip-value"
            className="font-mono"
          >
            {fv(hoveredLinkPlacement.link.value)}
          </div>
        </div>
      ) : null}
    </div>
  );
});

ChartSankey.displayName = 'ChartSankey';
