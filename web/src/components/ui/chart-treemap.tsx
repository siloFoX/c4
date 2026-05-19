import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { interpolateColor } from './chart-funnel';

// (v1.11.466, TODO 11.448) ChartTreemap primitive.
//
// Pure-SVG hierarchical treemap with a squarified layout
// (Bruls / Huijsen / van Wijk, 1999). Each node is drawn
// as a rectangle whose area is proportional to its value;
// the squarified algorithm keeps aspect ratios close to 1
// so labels stay legible. Click-to-drill descends into the
// hovered node; the drill path is fully controllable and
// emits `onDrillChange` so adopters can wire breadcrumbs
// or back buttons. Colour-by-value gradient highlights
// outliers.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartTreemapNode {
  id: string;
  label: string;
  value?: number;
  children?: readonly ChartTreemapNode[];
  color?: string;
}

export interface ChartTreemapProps {
  data: ChartTreemapNode;
  width?: number;
  height?: number;
  padding?: number;
  showLabels?: boolean;
  showValues?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  gradient?: { from?: string; to?: string };
  onNodeClick?: (args: {
    node: ChartTreemapNode;
    path: string[];
    value: number;
    rect: TreemapRect;
  }) => void;
  drillPath?: readonly string[];
  defaultDrillPath?: readonly string[];
  onDrillChange?: (path: string[]) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_TREEMAP_WIDTH = 480;
export const DEFAULT_CHART_TREEMAP_HEIGHT = 320;
export const DEFAULT_CHART_TREEMAP_PADDING = 2;
export const DEFAULT_CHART_TREEMAP_GRADIENT_FROM = '#bfdbfe';
export const DEFAULT_CHART_TREEMAP_GRADIENT_TO = '#1d4ed8';

export interface TreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreemapLayoutCell {
  node: ChartTreemapNode;
  value: number;
  rect: TreemapRect;
}

// Sum of values across a tree. Leaves contribute their
// `value`; parents sum their children unless they declare
// their own `value` explicitly (parent declared > children
// sum). Non-finite / negative values clamp to 0.
export function getNodeValue(node: ChartTreemapNode): number {
  if (node.value !== undefined && Number.isFinite(node.value)) {
    if (node.value <= 0) return 0;
    return node.value;
  }
  if (!node.children || node.children.length === 0) return 0;
  let sum = 0;
  for (const child of node.children) {
    sum += getNodeValue(child);
  }
  return sum;
}

// Walk a drill path from the root; returns the matched
// node + the path tokens that were resolved. Unknown ids
// stop the walk and the caller can fall back to the
// last resolved ancestor.
export function findNodeByPath(
  root: ChartTreemapNode,
  path: readonly string[],
): {
  node: ChartTreemapNode;
  resolved: string[];
} {
  let current = root;
  const resolved: string[] = [];
  for (const id of path) {
    const next = current.children?.find((c) => c.id === id);
    if (!next) break;
    current = next;
    resolved.push(id);
  }
  return { node: current, resolved };
}

// Compute the worst aspect ratio for a row of areas placed
// along a side of length `length`. Used by the squarified
// algorithm. Lower is better (1 = perfect square).
export function worstAspectRatio(
  areas: readonly number[],
  length: number,
): number {
  if (areas.length === 0 || length <= 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const a of areas) {
    sum += a;
    if (a < min) min = a;
    if (a > max) max = a;
  }
  if (sum <= 0 || min <= 0) return Number.POSITIVE_INFINITY;
  const l2 = length * length;
  const s2 = sum * sum;
  return Math.max((l2 * max) / s2, s2 / (l2 * min));
}

// Squarified treemap layout. Given a list of items with
// numeric `value`, partition the supplied `rect` into one
// rect per item, with areas proportional to value and
// aspect ratios close to 1. Items with value <= 0 are
// dropped.
export function squarifyTreemap<
  T extends { value: number },
>(items: readonly T[], rect: TreemapRect): {
  item: T;
  rect: TreemapRect;
}[] {
  const positive = items.filter(
    (i) => Number.isFinite(i.value) && i.value > 0,
  );
  if (positive.length === 0 || rect.w <= 0 || rect.h <= 0) {
    return [];
  }
  const total = positive.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];
  const rectArea = rect.w * rect.h;
  const scaled = positive.map((item) => ({
    item,
    area: (item.value / total) * rectArea,
  }));

  const result: { item: T; rect: TreemapRect }[] = [];
  let remaining = [...scaled];
  let cursor: TreemapRect = { ...rect };

  while (remaining.length > 0) {
    let row: typeof scaled = [];
    let length = Math.min(cursor.w, cursor.h);
    if (length <= 0) break;
    let bestRatio = Number.POSITIVE_INFINITY;
    while (remaining.length > 0) {
      const candidate = [...row, remaining[0]!];
      const ratio = worstAspectRatio(
        candidate.map((c) => c.area),
        length,
      );
      if (ratio <= bestRatio || row.length === 0) {
        row = candidate;
        bestRatio = ratio;
        remaining = remaining.slice(1);
      } else {
        break;
      }
    }
    const rowSum = row.reduce((s, r) => s + r.area, 0);
    const rowLength = rowSum / length;
    if (cursor.w <= cursor.h) {
      // horizontal row at the top
      let x = cursor.x;
      for (const r of row) {
        const w = r.area / rowLength;
        result.push({
          item: r.item,
          rect: {
            x,
            y: cursor.y,
            w,
            h: rowLength,
          },
        });
        x += w;
      }
      cursor = {
        x: cursor.x,
        y: cursor.y + rowLength,
        w: cursor.w,
        h: cursor.h - rowLength,
      };
    } else {
      // vertical row at the left
      let y = cursor.y;
      for (const r of row) {
        const h = r.area / rowLength;
        result.push({
          item: r.item,
          rect: {
            x: cursor.x,
            y,
            w: rowLength,
            h,
          },
        });
        y += h;
      }
      cursor = {
        x: cursor.x + rowLength,
        y: cursor.y,
        w: cursor.w - rowLength,
        h: cursor.h,
      };
    }
  }
  return result;
}

// Decide each child's colour using value-proportional
// gradient interpolation. Min and max bound the gradient
// span across the children at the current drill level.
export function getTreemapColor(
  value: number,
  min: number,
  max: number,
  from: string,
  to: string,
): string {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    return from;
  }
  if (max <= min) return to;
  const t = (value - min) / (max - min);
  return interpolateColor(from, to, t);
}

// One-line ARIA summary of the current drill view.
export function describeTreemap(
  root: ChartTreemapNode,
  path: readonly string[],
  formatValue?: (v: number) => string,
): string {
  const fmt = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const { node } = findNodeByPath(root, path);
  const children = node.children ?? [];
  if (children.length === 0) {
    return `${node.label} (leaf): ${fmt(getNodeValue(node))}`;
  }
  const summary = children
    .map((c) => `${c.label} ${fmt(getNodeValue(c))}`)
    .join(', ');
  return `Treemap of ${node.label} with ${children.length} children: ${summary}`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartTreemap = forwardRef(function ChartTreemap(
  {
    data,
    width = DEFAULT_CHART_TREEMAP_WIDTH,
    height = DEFAULT_CHART_TREEMAP_HEIGHT,
    padding = DEFAULT_CHART_TREEMAP_PADDING,
    showLabels = true,
    showValues = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Treemap',
    ariaDescription,
    formatValue,
    gradient,
    onNodeClick,
    drillPath,
    defaultDrillPath,
    onDrillChange,
  }: ChartTreemapProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const [internalPath, setInternalPath] = useState<string[]>(
    () =>
      drillPath !== undefined
        ? [...drillPath]
        : defaultDrillPath !== undefined
          ? [...defaultDrillPath]
          : [],
  );
  const activePath = drillPath ?? internalPath;

  const { node: currentNode, resolved } = useMemo(
    () => findNodeByPath(data, activePath),
    [activePath, data],
  );

  const children = currentNode.children ?? [];
  const fromColor =
    gradient?.from ?? DEFAULT_CHART_TREEMAP_GRADIENT_FROM;
  const toColor =
    gradient?.to ?? DEFAULT_CHART_TREEMAP_GRADIENT_TO;

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const items = useMemo(() => {
    return children.map((c) => ({
      node: c,
      value: getNodeValue(c),
    }));
  }, [children]);

  const valueRange = useMemo(() => {
    if (items.length === 0) return { min: 0, max: 0 };
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const i of items) {
      if (i.value < min) min = i.value;
      if (i.value > max) max = i.value;
    }
    return { min, max };
  }, [items]);

  const layout = useMemo(() => {
    return squarifyTreemap(items, {
      x: 0,
      y: 0,
      w: width,
      h: height,
    });
  }, [height, items, width]);

  const description = useMemo(
    () =>
      ariaDescription ??
      describeTreemap(data, activePath, formatValue),
    [activePath, ariaDescription, data, formatValue],
  );

  const [hovered, setHovered] = useState<string | null>(null);
  const handleEnter = useCallback((id: string) => {
    setHovered(id);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const handleNodeActivate = useCallback(
    (
      child: ChartTreemapNode,
      rect: TreemapRect,
    ) => {
      const childPath = [...resolved, child.id];
      onNodeClick?.({
        node: child,
        path: childPath,
        value: getNodeValue(child),
        rect,
      });
      if (
        child.children &&
        child.children.length > 0
      ) {
        if (drillPath === undefined) {
          setInternalPath(childPath);
        }
        onDrillChange?.(childPath);
      }
    },
    [drillPath, onDrillChange, onNodeClick, resolved],
  );

  const hoveredCell =
    hovered !== null
      ? layout.find((l) => l.item.node.id === hovered)
      : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-treemap"
      data-node-id={currentNode.id}
      data-depth={resolved.length}
      data-child-count={children.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-treemap-aria-desc"
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
        data-section="chart-treemap-svg"
        className="h-auto w-full"
      >
        {layout.map(({ item, rect }) => {
          const id = item.node.id;
          const value = item.value;
          const fill =
            item.node.color ??
            getTreemapColor(
              value,
              valueRange.min,
              valueRange.max,
              fromColor,
              toColor,
            );
          const isHovered = hovered === id;
          const padded: TreemapRect = {
            x: rect.x + padding,
            y: rect.y + padding,
            w: Math.max(0, rect.w - padding * 2),
            h: Math.max(0, rect.h - padding * 2),
          };
          const showInsideLabel =
            padded.w > 40 && padded.h > 18;
          return (
            <g
              key={id}
              data-section="chart-treemap-cell"
              data-node-id={id}
              data-value={value}
              data-color={fill}
              data-hovered={isHovered ? 'true' : 'false'}
              data-has-children={
                item.node.children &&
                item.node.children.length > 0
                  ? 'true'
                  : 'false'
              }
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <rect
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${item.node.label}: ${fv(value)}`}
                data-section="chart-treemap-rect"
                data-node-id={id}
                x={padded.x}
                y={padded.y}
                width={padded.w}
                height={padded.h}
                fill={fill}
                fillOpacity={isHovered ? 1 : 0.92}
                stroke={isHovered ? '#0f172a' : '#ffffff'}
                strokeWidth={isHovered ? 1.5 : 1}
                onMouseEnter={() => handleEnter(id)}
                onMouseLeave={handleLeave}
                onFocus={() => handleEnter(id)}
                onBlur={handleLeave}
                onClick={() =>
                  handleNodeActivate(item.node, padded)
                }
                style={{ cursor: 'pointer' }}
              />
              {showLabels && showInsideLabel ? (
                <text
                  aria-hidden="true"
                  data-section="chart-treemap-label"
                  data-node-id={id}
                  x={padded.x + 6}
                  y={padded.y + 14}
                  fontSize={11}
                  fontWeight={600}
                  fill="#ffffff"
                  style={{ pointerEvents: 'none' }}
                >
                  {item.node.label}
                </text>
              ) : null}
              {showValues && showInsideLabel ? (
                <text
                  aria-hidden="true"
                  data-section="chart-treemap-value"
                  data-node-id={id}
                  x={padded.x + 6}
                  y={padded.y + 28}
                  fontSize={10}
                  fill="#ffffff"
                  fillOpacity={0.85}
                  style={{ pointerEvents: 'none' }}
                >
                  {fv(value)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {showTooltip && hoveredCell ? (
        <div
          role="tooltip"
          data-section="chart-treemap-tooltip"
          data-node-id={hoveredCell.item.node.id}
          style={{
            left:
              hoveredCell.rect.x +
              hoveredCell.rect.w / 2 +
              12,
            top:
              hoveredCell.rect.y +
              hoveredCell.rect.h / 2,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-treemap-tooltip-label"
            className="font-medium"
          >
            {hoveredCell.item.node.label}
          </div>
          <div
            data-section="chart-treemap-tooltip-value"
            className="font-mono"
          >
            {fv(hoveredCell.item.value)}
          </div>
          {hoveredCell.item.node.children &&
          hoveredCell.item.node.children.length > 0 ? (
            <div
              data-section="chart-treemap-tooltip-drill-hint"
              className="text-muted-foreground"
            >
              click to drill in
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ChartTreemap.displayName = 'ChartTreemap';
