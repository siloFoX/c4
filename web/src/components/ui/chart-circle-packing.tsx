import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_CIRCLE_PACKING_WIDTH = 400;
export const DEFAULT_CHART_CIRCLE_PACKING_HEIGHT = 400;
export const DEFAULT_CHART_CIRCLE_PACKING_PADDING = 16;
export const DEFAULT_CHART_CIRCLE_PACKING_CHILD_PADDING = 4;
export const DEFAULT_CHART_CIRCLE_PACKING_FILL_OPACITY = 0.6;
export const DEFAULT_CHART_CIRCLE_PACKING_LABEL_MIN_RADIUS = 16;
export const DEFAULT_CHART_CIRCLE_PACKING_PALETTE = [
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

export interface ChartCirclePackingNode {
  id: string;
  label: string;
  value?: number;
  color?: string;
  children?: readonly ChartCirclePackingNode[];
}

export interface ChartCirclePackingFlatNode {
  id: string;
  label: string;
  color?: string;
  depth: number;
  parentId: string | null;
  path: string[];
  value: number;
  isLeaf: boolean;
}

export interface ChartCirclePackingLayoutCircle {
  id: string;
  label: string;
  path: string[];
  depth: number;
  parentId: string | null;
  value: number;
  share: number;
  globalShare: number;
  color: string;
  cx: number;
  cy: number;
  r: number;
  isFocus: boolean;
  isLeaf: boolean;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getCirclePackingDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_CIRCLE_PACKING_PALETTE[0]!;
  }
  return DEFAULT_CHART_CIRCLE_PACKING_PALETTE[
    Math.floor(index) % DEFAULT_CHART_CIRCLE_PACKING_PALETTE.length
  ]!;
}

export function getCirclePackingNodeValue(node: ChartCirclePackingNode): number {
  if (node.children?.length) {
    let sum = 0;
    for (const child of node.children) {
      sum += getCirclePackingNodeValue(child);
    }
    if (sum > 0) return sum;
    return isFiniteNumber(node.value) && node.value > 0 ? node.value : 0;
  }
  return isFiniteNumber(node.value) && node.value > 0 ? node.value : 0;
}

export function flattenCirclePackingHierarchy(
  root: ChartCirclePackingNode | null
): ChartCirclePackingFlatNode[] {
  if (!root) return [];
  const out: ChartCirclePackingFlatNode[] = [];
  const visit = (
    node: ChartCirclePackingNode,
    parentId: string | null,
    path: string[]
  ): void => {
    const value = getCirclePackingNodeValue(node);
    const entry: ChartCirclePackingFlatNode = {
      id: node.id,
      label: node.label,
      depth: path.length,
      parentId,
      path: [...path, node.id],
      value,
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

interface PackedCircle {
  x: number;
  y: number;
  r: number;
  next?: PackedCircle;
  prev?: PackedCircle;
}

function distance(a: PackedCircle, b: PackedCircle): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function circlesIntersect(
  a: PackedCircle,
  b: PackedCircle,
  epsilon = 1e-6
): boolean {
  return distance(a, b) + epsilon < a.r + b.r;
}

function placeTangentToTwo(
  a: PackedCircle,
  b: PackedCircle,
  r: number
): PackedCircle | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return null;
  const r1 = a.r + r;
  const r2 = b.r + r;
  const x = (dx * dx + dy * dy + r1 * r1 - r2 * r2) / (2 * d * d);
  const y2 = r1 * r1 / (d * d) - x * x;
  if (y2 < 0) return null;
  const y = Math.sqrt(Math.max(0, y2));
  const cx = a.x + x * dx - y * dy;
  const cy = a.y + x * dy + y * dx;
  return { x: cx, y: cy, r };
}

/**
 * Pack circles using a front-chain algorithm (Wang et al. 2006).
 * Returns circles with their relative positions; caller is responsible for
 * translating + scaling them.
 */
export function packCirclesFrontChain(
  radii: readonly number[]
): { x: number; y: number; r: number }[] {
  const positive: { idx: number; r: number }[] = [];
  for (let i = 0; i < radii.length; i++) {
    if (isFiniteNumber(radii[i]) && radii[i]! > 0) {
      positive.push({ idx: i, r: radii[i]! });
    }
  }
  const out = new Array<{ x: number; y: number; r: number } | null>(
    radii.length
  ).fill(null);
  if (positive.length === 0) {
    return Array.from({ length: radii.length }, () => ({ x: 0, y: 0, r: 0 }));
  }
  if (positive.length === 1) {
    out[positive[0]!.idx] = { x: 0, y: 0, r: positive[0]!.r };
    return out.map((c) => c ?? { x: 0, y: 0, r: 0 });
  }
  // Place first two circles tangent along x-axis
  const c0: PackedCircle = { x: -positive[1]!.r, y: 0, r: positive[0]!.r };
  const c1: PackedCircle = { x: positive[0]!.r, y: 0, r: positive[1]!.r };
  // Actually for two-tangent, first circle at (-r1, 0), second at (r0, 0)? Let me recompute.
  // place c0 at (-r1, 0) -> distance from origin r1. c1 at (r0, 0) -> distance from origin r0.
  // distance(c0, c1) = r0 + r1 ✓
  out[positive[0]!.idx] = { x: c0.x, y: c0.y, r: c0.r };
  out[positive[1]!.idx] = { x: c1.x, y: c1.y, r: c1.r };

  if (positive.length === 2) {
    return out.map((c) => c ?? { x: 0, y: 0, r: 0 });
  }
  // Place third circle tangent to first two
  const c2candidate = placeTangentToTwo(c0, c1, positive[2]!.r);
  const c2: PackedCircle = c2candidate
    ? { x: c2candidate.x, y: c2candidate.y, r: positive[2]!.r }
    : { x: 0, y: c0.r + positive[2]!.r, r: positive[2]!.r };
  out[positive[2]!.idx] = { x: c2.x, y: c2.y, r: c2.r };

  // Build front chain (doubly-linked) c0 -> c1 -> c2 -> c0
  c0.next = c1;
  c1.prev = c0;
  c1.next = c2;
  c2.prev = c1;
  c2.next = c0;
  c0.prev = c2;

  for (let i = 3; i < positive.length; i++) {
    const newR = positive[i]!.r;
    // Find tangent placement that doesn't intersect any front circle
    let cN: PackedCircle | null = null;
    let aBest: PackedCircle | null = null;
    let bBest: PackedCircle | null = null;
    let bestDistToOrigin = Number.POSITIVE_INFINITY;

    // walk the front and try each adjacent pair (a, b)
    let a: PackedCircle = c0;
    do {
      const b = a.next!;
      const placed = placeTangentToTwo(a, b, newR);
      if (placed) {
        const candidate: PackedCircle = { x: placed.x, y: placed.y, r: newR };
        let intersects = false;
        // check against entire front
        let walker: PackedCircle = c0;
        do {
          if (walker !== a && walker !== b) {
            if (circlesIntersect(walker, candidate)) {
              intersects = true;
              break;
            }
          }
          walker = walker.next!;
        } while (walker !== c0);
        if (!intersects) {
          const distToOrigin = Math.hypot(candidate.x, candidate.y);
          if (distToOrigin < bestDistToOrigin) {
            bestDistToOrigin = distToOrigin;
            cN = candidate;
            aBest = a;
            bBest = b;
          }
        }
      }
      a = a.next!;
    } while (a !== c0);

    if (!cN || !aBest || !bBest) {
      // Fallback: place far from origin in deterministic spot
      const angle = (i * 137.5 * Math.PI) / 180;
      const dist = c0.r * 4 + newR;
      cN = {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        r: newR,
      };
    } else {
      // Insert cN into front between aBest and bBest
      aBest.next = cN;
      cN.prev = aBest;
      cN.next = bBest;
      bBest.prev = cN;
    }
    out[positive[i]!.idx] = { x: cN.x, y: cN.y, r: cN.r };
  }

  return out.map((c) => c ?? { x: 0, y: 0, r: 0 });
}

export function getCirclePackingEnclosingCircle(
  circles: readonly { x: number; y: number; r: number }[]
): { x: number; y: number; r: number } {
  if (!circles.length) return { x: 0, y: 0, r: 0 };
  // Iterative minimum-enclosing-circle approximation (sufficient for v1).
  let cx = 0;
  let cy = 0;
  let weight = 0;
  for (const c of circles) {
    const w = c.r * c.r;
    cx += c.x * w;
    cy += c.y * w;
    weight += w;
  }
  if (weight > 0) {
    cx /= weight;
    cy /= weight;
  }
  let r = 0;
  for (const c of circles) {
    const d = Math.hypot(c.x - cx, c.y - cy) + c.r;
    if (d > r) r = d;
  }
  return { x: cx, y: cy, r };
}

export interface ComputeCirclePackingLayoutInput {
  root: ChartCirclePackingNode | null;
  cx: number;
  cy: number;
  radius: number;
  childPadding: number;
  fallbackColor: string;
}

export interface ComputeCirclePackingLayoutResult {
  circles: ChartCirclePackingLayoutCircle[];
  flat: ChartCirclePackingFlatNode[];
  rootValue: number;
}

function packRecurse(
  node: ChartCirclePackingNode,
  parentId: string | null,
  depth: number,
  path: string[],
  flatLookup: Map<string, ChartCirclePackingFlatNode>,
  cx: number,
  cy: number,
  radius: number,
  childPadding: number,
  fallbackColor: string,
  inheritedColorIndex: number,
  rootValue: number,
  out: ChartCirclePackingLayoutCircle[]
) {
  const value = getCirclePackingNodeValue(node);
  const flatEntry = flatLookup.get(node.id);
  const color =
    node.color ??
    (depth === 0 ? fallbackColor : getCirclePackingDefaultColor(inheritedColorIndex));
  const isLeaf = !node.children?.length;
  out.push({
    id: node.id,
    label: node.label,
    path: [...path, node.id],
    depth,
    parentId,
    value,
    share: rootValue > 0 ? value / rootValue : 0,
    globalShare: rootValue > 0 ? value / rootValue : 0,
    color,
    cx,
    cy,
    r: radius,
    isFocus: depth === 0,
    isLeaf,
  });
  if (!node.children?.length || radius <= 0) return;

  const childValues: number[] = [];
  const childOrdered: ChartCirclePackingNode[] = [];
  for (const child of node.children) {
    const v = getCirclePackingNodeValue(child);
    if (v <= 0) continue;
    childValues.push(v);
    childOrdered.push(child);
  }
  if (!childOrdered.length) return;

  const innerRadius = Math.max(0, radius - childPadding);
  if (innerRadius <= 0) return;

  // Radii proportional to sqrt(value), normalised so enclosing fits innerRadius
  const sqrtSum = childValues.reduce((acc, v) => acc + Math.sqrt(v), 0);
  const unitRadii = childValues.map((v) => Math.sqrt(v));
  const packed = packCirclesFrontChain(unitRadii);
  const enclosing = getCirclePackingEnclosingCircle(packed);
  const scale =
    enclosing.r > 0 ? innerRadius / enclosing.r : innerRadius / Math.max(1, sqrtSum);
  for (let i = 0; i < childOrdered.length; i++) {
    const placement = packed[i]!;
    const childRadius = placement.r * scale;
    const childCx = cx + (placement.x - enclosing.x) * scale;
    const childCy = cy + (placement.y - enclosing.y) * scale;
    const nextColorIndex =
      depth === 0 ? i : inheritedColorIndex;
    packRecurse(
      childOrdered[i]!,
      node.id,
      depth + 1,
      [...path, node.id],
      flatLookup,
      childCx,
      childCy,
      childRadius,
      childPadding,
      fallbackColor,
      nextColorIndex,
      rootValue,
      out
    );
  }
  flatEntry; // referenced (no-op)
}

export function computeCirclePackingLayout(
  input: ComputeCirclePackingLayoutInput
): ComputeCirclePackingLayoutResult {
  const { root, cx, cy, radius, childPadding, fallbackColor } = input;
  const flat = flattenCirclePackingHierarchy(root);
  if (!root || !flat.length || radius <= 0) {
    return { circles: [], flat, rootValue: 0 };
  }
  const rootValue = flat[0]!.value;
  if (rootValue <= 0) {
    return { circles: [], flat, rootValue: 0 };
  }
  const flatLookup = new Map<string, ChartCirclePackingFlatNode>();
  for (const f of flat) flatLookup.set(f.id, f);
  const circles: ChartCirclePackingLayoutCircle[] = [];
  packRecurse(
    root,
    null,
    0,
    [],
    flatLookup,
    cx,
    cy,
    radius,
    Math.max(0, childPadding),
    fallbackColor,
    0,
    rootValue,
    circles
  );
  return { circles, flat, rootValue };
}

export function describeCirclePackingChart(
  root: ChartCirclePackingNode | null,
  formatValue?: (v: number) => string
): string {
  if (!root) return 'No data';
  const flat = flattenCirclePackingHierarchy(root);
  if (!flat.length || flat[0]!.value <= 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  let maxDepth = 0;
  for (const f of flat) {
    if (f.depth > maxDepth) maxDepth = f.depth;
  }
  return `Circle packing chart with ${flat.length} nodes across ${maxDepth + 1} levels, total ${fmt(flat[0]!.value)}.`;
}

export interface ChartCirclePackingProps {
  root: ChartCirclePackingNode | null;
  width?: number;
  height?: number;
  padding?: number;
  childPadding?: number;
  fillOpacity?: number;
  labelMinRadius?: number;
  showLabels?: boolean;
  showTooltip?: boolean;
  showLeafLabelsOnly?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (p: number) => string;
  fallbackColor?: string;
  onCircleClick?: (args: {
    circle: ChartCirclePackingLayoutCircle;
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

function defaultFormatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

const ChartCirclePackingInner = (
  {
    root,
    width = DEFAULT_CHART_CIRCLE_PACKING_WIDTH,
    height = DEFAULT_CHART_CIRCLE_PACKING_HEIGHT,
    padding = DEFAULT_CHART_CIRCLE_PACKING_PADDING,
    childPadding = DEFAULT_CHART_CIRCLE_PACKING_CHILD_PADDING,
    fillOpacity = DEFAULT_CHART_CIRCLE_PACKING_FILL_OPACITY,
    labelMinRadius = DEFAULT_CHART_CIRCLE_PACKING_LABEL_MIN_RADIUS,
    showLabels = true,
    showTooltip = true,
    showLeafLabelsOnly = true,
    animate = true,
    className,
    ariaLabel = 'Circle packing chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    fallbackColor = '#94a3b8',
    onCircleClick,
    style,
  }: ChartCirclePackingProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-circle-packing-desc-${reactId}`;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const outerRadius = Math.max(0, Math.min(innerW, innerH) / 2);
  const centerX = padding + innerW / 2;
  const centerY = padding + innerH / 2;

  const result = useMemo(
    () =>
      computeCirclePackingLayout({
        root,
        cx: centerX,
        cy: centerY,
        radius: outerRadius,
        childPadding,
        fallbackColor,
      }),
    [root, centerX, centerY, outerRadius, childPadding, fallbackColor]
  );

  const autoDescription = useMemo(
    () => describeCirclePackingChart(root, formatValue),
    [root, formatValue]
  );

  const handleClick = useCallback(
    (circle: ChartCirclePackingLayoutCircle) => {
      onCircleClick?.({ circle });
    },
    [onCircleClick]
  );

  const hovered = useMemo(
    () => result.circles.find((c) => c.id === hoveredId) ?? null,
    [result.circles, hoveredId]
  );

  return (
    <div
      ref={ref}
      data-section="chart-circle-packing"
      data-node-count={result.flat.length}
      data-circle-count={result.circles.length}
      data-root-value={result.rootValue}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-circle-packing flex flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-circle-packing-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-circle-packing-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-circle-packing-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-circle-packing-circles">
            {result.circles.map((circle) => {
              const isHovered = hoveredId === circle.id;
              const showLabel =
                showLabels &&
                circle.r >= labelMinRadius &&
                (!showLeafLabelsOnly || circle.isLeaf || circle.isFocus);
              return (
                <g
                  key={circle.id}
                  data-section="chart-circle-packing-circle"
                  data-circle-id={circle.id}
                  data-circle-depth={circle.depth}
                  data-circle-parent={circle.parentId ?? ''}
                  data-circle-value={circle.value}
                  data-circle-share={circle.share}
                  data-circle-color={circle.color}
                  data-circle-radius={circle.r}
                  data-circle-is-leaf={circle.isLeaf ? 'true' : 'false'}
                  data-circle-is-focus={circle.isFocus ? 'true' : 'false'}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(circle.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === circle.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(circle.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === circle.id ? null : cur))
                  }
                  onClick={() => handleClick(circle)}
                >
                  <circle
                    data-section="chart-circle-packing-shape"
                    cx={circle.cx}
                    cy={circle.cy}
                    r={Math.max(0, circle.r)}
                    fill={circle.color}
                    fillOpacity={
                      circle.isLeaf ? fillOpacity : fillOpacity * 0.35
                    }
                    stroke={circle.color}
                    strokeWidth={1}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${circle.label}: ${formatValue(circle.value)} (${formatPercent(circle.share)})`}
                  />
                  {showLabel && (
                    <text
                      data-section="chart-circle-packing-label"
                      x={circle.cx}
                      y={circle.cy + 3}
                      textAnchor="middle"
                      fontSize={Math.min(13, Math.max(9, circle.r * 0.35))}
                      fontWeight={circle.isLeaf ? 500 : 600}
                      fill="rgb(15 23 42)"
                      pointerEvents="none"
                    >
                      {circle.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-circle-packing-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-circle-packing-tooltip-label"
              className="font-semibold"
            >
              {hovered.path.join(' / ')}
            </div>
            <div
              data-section="chart-circle-packing-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.value)}
            </div>
            <div
              data-section="chart-circle-packing-tooltip-share"
              className="font-mono text-slate-500"
            >
              share: {formatPercent(hovered.share)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChartCirclePacking = forwardRef<
  HTMLDivElement,
  ChartCirclePackingProps
>(ChartCirclePackingInner);
ChartCirclePacking.displayName = 'ChartCirclePacking';
