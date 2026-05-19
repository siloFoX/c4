import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_SUNBURST_WIDTH = 400;
export const DEFAULT_CHART_SUNBURST_HEIGHT = 400;
export const DEFAULT_CHART_SUNBURST_PADDING = 24;
export const DEFAULT_CHART_SUNBURST_CENTER_RADIUS = 36;
export const DEFAULT_CHART_SUNBURST_FILL_OPACITY = 0.85;
export const DEFAULT_CHART_SUNBURST_LABEL_MIN_ARC = 0.18;
export const DEFAULT_CHART_SUNBURST_PALETTE = [
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

export interface ChartSunburstNode {
  id: string;
  label: string;
  value?: number;
  color?: string;
  children?: readonly ChartSunburstNode[];
}

export interface ChartSunburstFlatNode {
  id: string;
  label: string;
  color?: string;
  depth: number;
  parentId: string | null;
  path: string[];
  value: number;
  isLeaf: boolean;
  originalIndex: number;
}

export interface ChartSunburstLayoutArc {
  id: string;
  label: string;
  path: string[];
  depth: number;
  parentId: string | null;
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  value: number;
  share: number;
  globalShare: number;
  color: string;
  pathD: string;
  midAngle: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getSunburstDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_SUNBURST_PALETTE[0]!;
  }
  return DEFAULT_CHART_SUNBURST_PALETTE[
    Math.floor(index) % DEFAULT_CHART_SUNBURST_PALETTE.length
  ]!;
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

export function getSunburstNodeValue(node: ChartSunburstNode): number {
  if (isFiniteNumber(node.value) && node.value > 0) {
    if (!node.children?.length) return node.value;
    let childTotal = 0;
    for (const child of node.children) childTotal += getSunburstNodeValue(child);
    if (childTotal > 0) return childTotal;
    return node.value;
  }
  if (!node.children?.length) return 0;
  let sum = 0;
  for (const child of node.children) sum += getSunburstNodeValue(child);
  return sum;
}

export function flattenSunburstHierarchy(
  root: ChartSunburstNode | null
): ChartSunburstFlatNode[] {
  if (!root) return [];
  const out: ChartSunburstFlatNode[] = [];
  let counter = 0;
  const visit = (
    node: ChartSunburstNode,
    parentId: string | null,
    path: string[]
  ): void => {
    const value = getSunburstNodeValue(node);
    const isLeaf = !node.children?.length;
    const depth = path.length;
    const entry: ChartSunburstFlatNode = {
      id: node.id,
      label: node.label,
      depth,
      parentId,
      path: [...path, node.id],
      value,
      isLeaf,
      originalIndex: counter++,
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

export function getSunburstMaxDepth(
  nodes: readonly ChartSunburstFlatNode[]
): number {
  let max = 0;
  for (const n of nodes) {
    if (n.depth > max) max = n.depth;
  }
  return max;
}

export interface ComputeSunburstLayoutInput {
  root: ChartSunburstNode | null;
  focusPath: readonly string[];
  cx: number;
  cy: number;
  outerRadius: number;
  centerRadius: number;
  fallbackColor: string;
}

export interface ComputeSunburstLayoutResult {
  arcs: ChartSunburstLayoutArc[];
  flat: ChartSunburstFlatNode[];
  focusNode: ChartSunburstFlatNode | null;
  focusValue: number;
  maxDepth: number;
  ringWidth: number;
}

function buildArcPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  if (outerR <= 0) return '';
  const span = endAngle - startAngle;
  if (!Number.isFinite(span) || span <= 0) return '';
  const safeInner = Math.max(0, Math.min(innerR, outerR));
  if (span >= Math.PI * 2 - 1e-9) {
    const oTop = polarToCartesian(cx, cy, outerR, 0);
    const oBottom = polarToCartesian(cx, cy, outerR, Math.PI);
    if (safeInner > 0) {
      const iTop = polarToCartesian(cx, cy, safeInner, 0);
      const iBottom = polarToCartesian(cx, cy, safeInner, Math.PI);
      return [
        `M ${oTop.x} ${oTop.y}`,
        `A ${outerR} ${outerR} 0 1 1 ${oBottom.x} ${oBottom.y}`,
        `A ${outerR} ${outerR} 0 1 1 ${oTop.x} ${oTop.y}`,
        `M ${iTop.x} ${iTop.y}`,
        `A ${safeInner} ${safeInner} 0 1 0 ${iBottom.x} ${iBottom.y}`,
        `A ${safeInner} ${safeInner} 0 1 0 ${iTop.x} ${iTop.y}`,
        'Z',
      ].join(' ');
    }
    return [
      `M ${oTop.x} ${oTop.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${oBottom.x} ${oBottom.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${oTop.x} ${oTop.y}`,
      'Z',
    ].join(' ');
  }
  const largeArc = span > Math.PI ? 1 : 0;
  const startOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, endAngle);
  if (safeInner > 0) {
    const startInner = polarToCartesian(cx, cy, safeInner, endAngle);
    const endInner = polarToCartesian(cx, cy, safeInner, startAngle);
    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
      `L ${startInner.x} ${startInner.y}`,
      `A ${safeInner} ${safeInner} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
      'Z',
    ].join(' ');
  }
  return [
    `M ${cx} ${cy}`,
    `L ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    'Z',
  ].join(' ');
}

interface InternalNode {
  node: ChartSunburstNode;
  flatIndex: number;
  parentId: string | null;
  depth: number;
  path: string[];
  value: number;
  startAngle: number;
  endAngle: number;
  inheritedColorIndex: number;
}

export function computeSunburstLayout(
  input: ComputeSunburstLayoutInput
): ComputeSunburstLayoutResult {
  const { root, focusPath, cx, cy, outerRadius, centerRadius, fallbackColor } =
    input;
  const flat = flattenSunburstHierarchy(root);
  if (!root || !flat.length || outerRadius <= 0) {
    return {
      arcs: [],
      flat,
      focusNode: null,
      focusValue: 0,
      maxDepth: 0,
      ringWidth: 0,
    };
  }

  let focusNode = flat.find(
    (n) => focusPath.length > 0 && n.id === focusPath[focusPath.length - 1]
  );
  if (!focusNode) focusNode = flat[0]!;
  const focusValue = focusNode.value;
  const focusDepth = focusNode.depth;
  const focusPathRef = focusNode.path;

  let maxDepth = 0;
  for (const n of flat) {
    if (n.path.length >= focusPathRef.length) {
      let inFocus = true;
      for (let i = 0; i < focusPathRef.length; i++) {
        if (n.path[i] !== focusPathRef[i]) {
          inFocus = false;
          break;
        }
      }
      if (inFocus) {
        const relativeDepth = n.depth - focusDepth;
        if (relativeDepth > maxDepth) maxDepth = relativeDepth;
      }
    }
  }
  const ringCount = maxDepth + 1;
  const ringWidth =
    ringCount > 0 ? (outerRadius - centerRadius) / ringCount : 0;
  if (ringWidth <= 0 || focusValue <= 0) {
    return { arcs: [], flat, focusNode, focusValue, maxDepth, ringWidth };
  }

  const arcs: ChartSunburstLayoutArc[] = [];

  const recurse = (
    node: ChartSunburstNode,
    parentId: string | null,
    depth: number,
    path: string[],
    startAngle: number,
    endAngle: number,
    inheritedColorIndex: number
  ) => {
    const nodeValue = getSunburstNodeValue(node);
    const inFocusBranch =
      depth >= focusDepth &&
      focusPathRef.every((id, i) => path[i] === id);
    if (!inFocusBranch) {
      if (node.children?.length) {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i]!;
          recurse(
            child,
            node.id,
            depth + 1,
            [...path, child.id],
            startAngle,
            endAngle,
            inheritedColorIndex
          );
        }
      }
      return;
    }
    const relativeDepth = depth - focusDepth;
    if (relativeDepth >= ringCount) return;
    if (nodeValue <= 0) return;
    const innerR = centerRadius + relativeDepth * ringWidth;
    const outerR = centerRadius + (relativeDepth + 1) * ringWidth;
    const span = endAngle - startAngle;
    const share = focusValue > 0 ? nodeValue / focusValue : 0;
    const arcLabel = node.label;
    const baseFlatIndex = flat.findIndex((f) => f.id === node.id);
    const color =
      node.color ??
      (depth === focusDepth
        ? fallbackColor
        : getSunburstDefaultColor(inheritedColorIndex));
    arcs.push({
      id: node.id,
      label: arcLabel,
      path: [...path],
      depth,
      parentId,
      startAngle,
      endAngle,
      innerRadius: innerR,
      outerRadius: outerR,
      value: nodeValue,
      share,
      globalShare:
        flat[0] && flat[0].value > 0 ? nodeValue / flat[0].value : 0,
      color,
      pathD: buildArcPath(cx, cy, innerR, outerR, startAngle, endAngle),
      midAngle: (startAngle + endAngle) / 2,
    });
    baseFlatIndex; // referenced for potential future use
    if (!node.children?.length) return;
    const totalChildValue = node.children.reduce(
      (acc, c) => acc + getSunburstNodeValue(c),
      0
    );
    if (totalChildValue <= 0) return;
    let cursor = startAngle;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!;
      const childValue = getSunburstNodeValue(child);
      if (childValue <= 0) continue;
      const childSpan = (childValue / totalChildValue) * span;
      const childStart = cursor;
      const childEnd = cursor + childSpan;
      const nextColorIndex =
        depth === focusDepth ? i : inheritedColorIndex;
      recurse(
        child,
        node.id,
        depth + 1,
        [...path, child.id],
        childStart,
        childEnd,
        nextColorIndex
      );
      cursor = childEnd;
    }
  };

  recurse(
    root,
    null,
    0,
    [root.id],
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2,
    0
  );

  return { arcs, flat, focusNode, focusValue, maxDepth, ringWidth };
}

export function describeSunburstChart(
  root: ChartSunburstNode | null,
  focusPath: readonly string[],
  formatValue?: (v: number) => string
): string {
  if (!root) return 'No data';
  const flat = flattenSunburstHierarchy(root);
  if (!flat.length || flat[0]!.value <= 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const focusId = focusPath[focusPath.length - 1] ?? root.id;
  const focus = flat.find((n) => n.id === focusId) ?? flat[0]!;
  const totalNodes = flat.length;
  const maxDepth = getSunburstMaxDepth(flat);
  return `Sunburst chart with ${totalNodes} nodes across ${maxDepth + 1} levels, total ${fmt(flat[0]!.value)}. Focused on ${focus.label} (depth ${focus.depth}).`;
}

export interface ChartSunburstProps {
  root: ChartSunburstNode | null;
  width?: number;
  height?: number;
  padding?: number;
  centerRadius?: number;
  fillOpacity?: number;
  labelMinArc?: number;
  focusPath?: readonly string[];
  defaultFocusPath?: readonly string[];
  onFocusPathChange?: (path: string[]) => void;
  showCenterLabel?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (p: number) => string;
  fallbackColor?: string;
  onArcClick?: (args: {
    node: ChartSunburstLayoutArc;
    becameFocus: boolean;
  }) => void;
  style?: CSSProperties;
}

function isControlled<T>(prop: T | undefined): prop is T {
  return prop !== undefined;
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

const ChartSunburstInner = (
  {
    root,
    width = DEFAULT_CHART_SUNBURST_WIDTH,
    height = DEFAULT_CHART_SUNBURST_HEIGHT,
    padding = DEFAULT_CHART_SUNBURST_PADDING,
    centerRadius = DEFAULT_CHART_SUNBURST_CENTER_RADIUS,
    fillOpacity = DEFAULT_CHART_SUNBURST_FILL_OPACITY,
    labelMinArc = DEFAULT_CHART_SUNBURST_LABEL_MIN_ARC,
    focusPath,
    defaultFocusPath,
    onFocusPathChange,
    showCenterLabel = true,
    showLabels = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Sunburst chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    fallbackColor = '#94a3b8',
    onArcClick,
    style,
  }: ChartSunburstProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-sunburst-desc-${reactId}`;
  const initialFocus = useMemo<string[]>(() => {
    if (defaultFocusPath && defaultFocusPath.length) return [...defaultFocusPath];
    if (root) return [root.id];
    return [];
  }, [defaultFocusPath, root]);
  const [internalFocus, setInternalFocus] = useState<string[]>(initialFocus);
  const focusPathResolved = useMemo<string[]>(() => {
    if (isControlled(focusPath)) return [...focusPath];
    return internalFocus;
  }, [focusPath, internalFocus]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const outerRadius = Math.max(0, Math.min(innerW, innerH) / 2);
  const cx = padding + innerW / 2;
  const cy = padding + innerH / 2;

  const result = useMemo(
    () =>
      computeSunburstLayout({
        root,
        focusPath: focusPathResolved,
        cx,
        cy,
        outerRadius,
        centerRadius,
        fallbackColor,
      }),
    [root, focusPathResolved, cx, cy, outerRadius, centerRadius, fallbackColor]
  );

  const autoDescription = useMemo(
    () => describeSunburstChart(root, focusPathResolved, formatValue),
    [root, focusPathResolved, formatValue]
  );

  const setFocus = useCallback(
    (path: string[]) => {
      if (!isControlled(focusPath)) setInternalFocus(path);
      onFocusPathChange?.(path);
    },
    [focusPath, onFocusPathChange]
  );

  const handleArcClick = useCallback(
    (arc: ChartSunburstLayoutArc) => {
      const isFocus =
        arc.path.length === focusPathResolved.length &&
        arc.path.every((id, i) => focusPathResolved[i] === id);
      const becameFocus = !isFocus;
      if (becameFocus) setFocus([...arc.path]);
      onArcClick?.({ node: arc, becameFocus });
    },
    [focusPathResolved, setFocus, onArcClick]
  );

  const handleCenterClick = useCallback(() => {
    if (focusPathResolved.length > 1) {
      setFocus(focusPathResolved.slice(0, -1));
    } else if (root) {
      setFocus([root.id]);
    }
  }, [focusPathResolved, root, setFocus]);

  const hovered = useMemo(
    () => result.arcs.find((a) => a.id === hoveredId) ?? null,
    [result.arcs, hoveredId]
  );

  const focusLabel = result.focusNode?.label ?? '';

  return (
    <div
      ref={ref}
      data-section="chart-sunburst"
      data-node-count={result.flat.length}
      data-arc-count={result.arcs.length}
      data-focus-id={result.focusNode?.id ?? ''}
      data-focus-depth={result.focusNode?.depth ?? 0}
      data-max-depth={result.maxDepth}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-sunburst flex flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-sunburst-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-sunburst-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-sunburst-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-sunburst-arcs">
            {result.arcs.map((arc) => {
              const isHovered = hoveredId === arc.id;
              const isFocus =
                arc.path.length === focusPathResolved.length &&
                arc.path.every((id, i) => focusPathResolved[i] === id);
              const span = arc.endAngle - arc.startAngle;
              const showLabel =
                showLabels && span >= labelMinArc &&
                arc.outerRadius - arc.innerRadius >= 14;
              const labelR = (arc.innerRadius + arc.outerRadius) / 2;
              const labelPos = polarToCartesian(cx, cy, labelR, arc.midAngle);
              return (
                <g
                  key={arc.id}
                  data-section="chart-sunburst-arc"
                  data-arc-id={arc.id}
                  data-arc-depth={arc.depth}
                  data-arc-parent={arc.parentId ?? ''}
                  data-arc-value={arc.value}
                  data-arc-share={arc.share}
                  data-arc-global-share={arc.globalShare}
                  data-arc-color={arc.color}
                  data-arc-is-focus={isFocus ? 'true' : 'false'}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(arc.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === arc.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(arc.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === arc.id ? null : cur))
                  }
                  onClick={() => handleArcClick(arc)}
                >
                  <path
                    data-section="chart-sunburst-path"
                    d={arc.pathD}
                    fill={arc.color}
                    fillOpacity={fillOpacity}
                    stroke="rgb(255 255 255)"
                    strokeWidth={1}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${arc.label}: ${formatValue(arc.value)} (${formatPercent(arc.share)})`}
                  />
                  {showLabel && (
                    <text
                      data-section="chart-sunburst-arc-label"
                      x={labelPos.x}
                      y={labelPos.y + 3}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={500}
                      fill="rgb(255 255 255)"
                      pointerEvents="none"
                    >
                      {arc.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          {showCenterLabel && result.focusNode && (
            <g
              data-section="chart-sunburst-center"
              onClick={handleCenterClick}
              style={{ cursor: focusPathResolved.length > 1 ? 'pointer' : 'default' }}
              role="button"
              tabIndex={0}
              aria-label={
                focusPathResolved.length > 1
                  ? `Zoom out from ${focusLabel}`
                  : `Focused on ${focusLabel}`
              }
            >
              <circle
                data-section="chart-sunburst-center-disc"
                cx={cx}
                cy={cy}
                r={centerRadius}
                fill="rgb(255 255 255)"
                stroke="rgb(226 232 240)"
                strokeWidth={1}
              />
              <text
                data-section="chart-sunburst-center-label"
                x={cx}
                y={cy - 2}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="rgb(51 65 85)"
                pointerEvents="none"
              >
                {focusLabel}
              </text>
              <text
                data-section="chart-sunburst-center-value"
                x={cx}
                y={cy + 12}
                textAnchor="middle"
                fontSize={10}
                fill="rgb(100 116 139)"
                pointerEvents="none"
              >
                {formatValue(result.focusValue)}
              </text>
            </g>
          )}
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-sunburst-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-sunburst-tooltip-label"
              className="font-semibold"
            >
              {hovered.path.join(' / ')}
            </div>
            <div
              data-section="chart-sunburst-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.value)}
            </div>
            <div
              data-section="chart-sunburst-tooltip-share"
              className="font-mono text-slate-500"
            >
              share: {formatPercent(hovered.share)}
            </div>
            <div
              data-section="chart-sunburst-tooltip-global"
              className="font-mono text-slate-500"
            >
              of total: {formatPercent(hovered.globalShare)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChartSunburst = forwardRef<HTMLDivElement, ChartSunburstProps>(
  ChartSunburstInner
);
ChartSunburst.displayName = 'ChartSunburst';
