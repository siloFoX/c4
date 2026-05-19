import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_BUBBLE_WIDTH = 560;
export const DEFAULT_CHART_BUBBLE_HEIGHT = 360;
export const DEFAULT_CHART_BUBBLE_PADDING = 40;
export const DEFAULT_CHART_BUBBLE_TICK_COUNT = 5;
export const DEFAULT_CHART_BUBBLE_MIN_RADIUS = 4;
export const DEFAULT_CHART_BUBBLE_MAX_RADIUS = 28;
export const DEFAULT_CHART_BUBBLE_COLOR = '#2563eb';
export const DEFAULT_CHART_BUBBLE_PALETTE = [
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

export interface ChartBubblePoint {
  id: string;
  label?: string;
  x: number;
  y: number;
  size: number;
  category?: string;
  color?: string;
}

export interface ChartBubbleLayoutPoint {
  id: string;
  label: string;
  category: string | null;
  color: string;
  cx: number;
  cy: number;
  r: number;
  x: number;
  y: number;
  size: number;
  index: number;
}

export interface ChartBubbleBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  sizeMin: number;
  sizeMax: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getBubbleDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_BUBBLE_PALETTE[0]!;
  }
  return DEFAULT_CHART_BUBBLE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_BUBBLE_PALETTE.length
  ]!;
}

export function getBubbleBounds(
  points: readonly ChartBubblePoint[]
): ChartBubbleBounds {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let sMin = Number.POSITIVE_INFINITY;
  let sMax = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) continue;
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
    if (isFiniteNumber(p.size) && p.size >= 0) {
      if (p.size < sMin) sMin = p.size;
      if (p.size > sMax) sMax = p.size;
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = 0;
    xMax = 1;
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  if (!Number.isFinite(sMin) || !Number.isFinite(sMax)) {
    sMin = 0;
    sMax = 0;
  }
  return { xMin, xMax, yMin, yMax, sizeMin: sMin, sizeMax: sMax };
}

export function getBubbleRadius(
  size: number,
  sizeMin: number,
  sizeMax: number,
  minRadius: number,
  maxRadius: number
): number {
  const v = isFiniteNumber(size) && size >= 0 ? size : 0;
  if (!Number.isFinite(sizeMin) || !Number.isFinite(sizeMax)) return minRadius;
  if (sizeMax <= sizeMin) return (minRadius + maxRadius) / 2;
  const t = Math.max(0, Math.min(1, (v - sizeMin) / (sizeMax - sizeMin)));
  const tSqrt = Math.sqrt(t);
  return minRadius + (maxRadius - minRadius) * tSqrt;
}

export function getBubbleCategories(
  points: readonly ChartBubblePoint[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of points) {
    if (typeof p.category === 'string' && p.category.length && !seen.has(p.category)) {
      seen.add(p.category);
      out.push(p.category);
    }
  }
  return out;
}

export function getBubbleCategoryColor(
  category: string | null | undefined,
  categories: readonly string[]
): string {
  if (category == null) return DEFAULT_CHART_BUBBLE_COLOR;
  const idx = categories.indexOf(category);
  if (idx < 0) return DEFAULT_CHART_BUBBLE_COLOR;
  return getBubbleDefaultColor(idx);
}

export function getBubbleTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_BUBBLE_TICK_COUNT
): number[] {
  const c = Math.max(2, Math.floor(count) || 0);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const step = (max - min) / (c - 1);
  return Array.from({ length: c }, (_, i) => min + step * i);
}

export interface ComputeBubbleLayoutInput {
  points: readonly ChartBubblePoint[];
  hidden: ReadonlySet<string>;
  categories: readonly string[];
  bounds: ChartBubbleBounds;
  innerW: number;
  innerH: number;
  padX: number;
  padY: number;
  minRadius: number;
  maxRadius: number;
}

export function computeBubbleLayout(
  input: ComputeBubbleLayoutInput
): ChartBubbleLayoutPoint[] {
  const {
    points,
    hidden,
    categories,
    bounds,
    innerW,
    innerH,
    padX,
    padY,
    minRadius,
    maxRadius,
  } = input;
  if (innerW <= 0 || innerH <= 0) return [];
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const out: ChartBubbleLayoutPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y)) continue;
    const cat = typeof p.category === 'string' && p.category.length ? p.category : null;
    if (cat != null && hidden.has(cat)) continue;
    if (hidden.has(p.id)) continue;
    const xRatio = xSpan > 0 ? (p.x - bounds.xMin) / xSpan : 0.5;
    const yRatio = ySpan > 0 ? (p.y - bounds.yMin) / ySpan : 0.5;
    const cx = padX + xRatio * innerW;
    const cy = padY + innerH - yRatio * innerH;
    const r = getBubbleRadius(
      p.size,
      bounds.sizeMin,
      bounds.sizeMax,
      minRadius,
      maxRadius
    );
    const color =
      p.color ??
      (cat != null
        ? getBubbleCategoryColor(cat, categories)
        : DEFAULT_CHART_BUBBLE_COLOR);
    out.push({
      id: p.id,
      label: p.label ?? p.id,
      category: cat,
      color,
      cx,
      cy,
      r,
      x: p.x,
      y: p.y,
      size: isFiniteNumber(p.size) && p.size >= 0 ? p.size : 0,
      index: i,
    });
  }
  return out;
}

export function describeBubbleChart(
  points: readonly ChartBubblePoint[],
  formatValue?: (v: number) => string
): string {
  if (!points.length) return 'No data';
  const valid = points.filter(
    (p) => isFiniteNumber(p.x) && isFiniteNumber(p.y)
  );
  if (!valid.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const bounds = getBubbleBounds(valid);
  const cats = getBubbleCategories(valid);
  const catStr = cats.length ? ` across ${cats.length} categories` : '';
  return `Bubble chart with ${valid.length} bubbles${catStr}. x range ${fmt(bounds.xMin)} to ${fmt(bounds.xMax)}; y range ${fmt(bounds.yMin)} to ${fmt(bounds.yMax)}.`;
}

export interface ChartBubbleProps {
  data: readonly ChartBubblePoint[];
  width?: number;
  height?: number;
  padding?: number;
  minRadius?: number;
  maxRadius?: number;
  tickCount?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  hiddenCategories?: readonly string[];
  defaultHiddenCategories?: readonly string[];
  onHiddenCategoriesChange?: (hidden: string[]) => void;
  showLegend?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showGrid?: boolean;
  showXLabel?: boolean;
  showYLabel?: boolean;
  xLabel?: string;
  yLabel?: string;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatSize?: (v: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onBubbleClick?: (args: { point: ChartBubblePoint; layout: ChartBubbleLayoutPoint }) => void;
  onCategoryToggle?: (args: { category: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isControlled<T>(prop: T | undefined): prop is T {
  return prop !== undefined;
}

function defaultFormatValue(v: number): string {
  return String(v);
}

const ChartBubbleInner = (
  {
    data,
    width = DEFAULT_CHART_BUBBLE_WIDTH,
    height = DEFAULT_CHART_BUBBLE_HEIGHT,
    padding = DEFAULT_CHART_BUBBLE_PADDING,
    minRadius = DEFAULT_CHART_BUBBLE_MIN_RADIUS,
    maxRadius = DEFAULT_CHART_BUBBLE_MAX_RADIUS,
    tickCount = DEFAULT_CHART_BUBBLE_TICK_COUNT,
    xMin,
    xMax,
    yMin,
    yMax,
    hiddenCategories,
    defaultHiddenCategories,
    onHiddenCategoriesChange,
    showLegend = true,
    showTooltip = true,
    showAxisTicks = true,
    showGrid = true,
    showXLabel = true,
    showYLabel = true,
    xLabel,
    yLabel,
    animate = true,
    className,
    ariaLabel = 'Bubble chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatSize,
    legendPlacement = 'bottom',
    onBubbleClick,
    onCategoryToggle,
    style,
  }: ChartBubbleProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-bubble-desc-${reactId}`;
  const [internalHidden, setInternalHidden] = useState<Set<string>>(
    () => new Set(defaultHiddenCategories ?? [])
  );
  const hiddenSet = useMemo(
    () =>
      isControlled(hiddenCategories)
        ? new Set(hiddenCategories)
        : internalHidden,
    [hiddenCategories, internalHidden]
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const categories = useMemo(() => getBubbleCategories(data), [data]);

  const autoBounds = useMemo(() => getBubbleBounds(data), [data]);
  const bounds: ChartBubbleBounds = useMemo(
    () => ({
      xMin: isControlled(xMin) ? xMin : autoBounds.xMin,
      xMax: isControlled(xMax) ? xMax : autoBounds.xMax,
      yMin: isControlled(yMin) ? yMin : autoBounds.yMin,
      yMax: isControlled(yMax) ? yMax : autoBounds.yMax,
      sizeMin: autoBounds.sizeMin,
      sizeMax: autoBounds.sizeMax,
    }),
    [autoBounds, xMin, xMax, yMin, yMax]
  );

  const layout = useMemo(
    () =>
      computeBubbleLayout({
        points: data,
        hidden: hiddenSet,
        categories,
        bounds,
        innerW,
        innerH,
        padX: padding,
        padY: padding,
        minRadius,
        maxRadius,
      }),
    [
      data,
      hiddenSet,
      categories,
      bounds,
      innerW,
      innerH,
      padding,
      minRadius,
      maxRadius,
    ]
  );

  const xTicks = useMemo(
    () => getBubbleTicks(bounds.xMin, bounds.xMax, tickCount),
    [bounds.xMin, bounds.xMax, tickCount]
  );
  const yTicks = useMemo(
    () => getBubbleTicks(bounds.yMin, bounds.yMax, tickCount),
    [bounds.yMin, bounds.yMax, tickCount]
  );

  const autoDescription = useMemo(
    () => describeBubbleChart(data, formatValue),
    [data, formatValue]
  );

  const toggleCategory = useCallback(
    (category: string) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(category);
      if (willHide) next.add(category);
      else next.delete(category);
      if (!isControlled(hiddenCategories)) setInternalHidden(next);
      onHiddenCategoriesChange?.(Array.from(next));
      onCategoryToggle?.({ category, hidden: willHide });
    },
    [hiddenSet, hiddenCategories, onHiddenCategoriesChange, onCategoryToggle]
  );

  const hovered = useMemo(
    () => layout.find((p) => p.id === hoveredId) ?? null,
    [layout, hoveredId]
  );

  const showLegendList = showLegend && categories.length > 0;
  const showRightLegend = showLegendList && legendPlacement === 'right';
  const showBottomLegend = showLegendList && legendPlacement === 'bottom';

  const fmtSize = formatSize ?? formatValue;

  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const xPos = (xv: number) =>
    xSpan > 0
      ? padding + ((xv - bounds.xMin) / xSpan) * innerW
      : padding + innerW / 2;
  const yPos = (yv: number) =>
    ySpan > 0
      ? padding + innerH - ((yv - bounds.yMin) / ySpan) * innerH
      : padding + innerH / 2;

  return (
    <div
      ref={ref}
      data-section="chart-bubble"
      data-bubble-count={data.length}
      data-visible-count={layout.length}
      data-category-count={categories.length}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-bubble flex',
        showRightLegend ? 'flex-row items-start gap-4' : 'flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-bubble-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-bubble-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-bubble-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showGrid && (
            <g data-section="chart-bubble-grid" pointerEvents="none">
              {yTicks.map((t, i) => {
                const y = yPos(t);
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-bubble-grid-line"
                    data-axis="y"
                    x1={padding}
                    x2={padding + innerW}
                    y1={y}
                    y2={y}
                    stroke="rgb(226 232 240)"
                    strokeWidth={1}
                  />
                );
              })}
              {xTicks.map((t, i) => {
                const x = xPos(t);
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-bubble-grid-line"
                    data-axis="x"
                    x1={x}
                    x2={x}
                    y1={padding}
                    y2={padding + innerH}
                    stroke="rgb(226 232 240)"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          )}
          <g data-section="chart-bubble-axes">
            <line
              data-section="chart-bubble-axis"
              data-axis="x"
              x1={padding}
              x2={padding + innerW}
              y1={padding + innerH}
              y2={padding + innerH}
              stroke="rgb(148 163 184)"
              strokeWidth={1}
            />
            <line
              data-section="chart-bubble-axis"
              data-axis="y"
              x1={padding}
              x2={padding}
              y1={padding}
              y2={padding + innerH}
              stroke="rgb(148 163 184)"
              strokeWidth={1}
            />
          </g>
          {showAxisTicks && (
            <g data-section="chart-bubble-ticks" pointerEvents="none">
              {xTicks.map((t, i) => {
                const x = xPos(t);
                return (
                  <g key={`tx-${i}`} data-section="chart-bubble-tick" data-axis="x">
                    <line
                      x1={x}
                      x2={x}
                      y1={padding + innerH}
                      y2={padding + innerH + 4}
                      stroke="rgb(148 163 184)"
                      strokeWidth={1}
                    />
                    <text
                      data-section="chart-bubble-tick-label"
                      x={x}
                      y={padding + innerH + 16}
                      textAnchor="middle"
                      fontSize={10}
                      fill="rgb(100 116 139)"
                    >
                      {formatValue(t)}
                    </text>
                  </g>
                );
              })}
              {yTicks.map((t, i) => {
                const y = yPos(t);
                return (
                  <g key={`ty-${i}`} data-section="chart-bubble-tick" data-axis="y">
                    <line
                      x1={padding - 4}
                      x2={padding}
                      y1={y}
                      y2={y}
                      stroke="rgb(148 163 184)"
                      strokeWidth={1}
                    />
                    <text
                      data-section="chart-bubble-tick-label"
                      x={padding - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize={10}
                      fill="rgb(100 116 139)"
                    >
                      {formatValue(t)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          {showXLabel && xLabel && (
            <text
              data-section="chart-bubble-x-label"
              x={padding + innerW / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize={11}
              fill="rgb(71 85 105)"
            >
              {xLabel}
            </text>
          )}
          {showYLabel && yLabel && (
            <text
              data-section="chart-bubble-y-label"
              x={12}
              y={padding + innerH / 2}
              textAnchor="middle"
              fontSize={11}
              fill="rgb(71 85 105)"
              transform={`rotate(-90 12 ${padding + innerH / 2})`}
            >
              {yLabel}
            </text>
          )}
          <g data-section="chart-bubble-bubbles">
            {layout.map((p) => {
              const point = data[p.index]!;
              const isHovered = hoveredId === p.id;
              return (
                <g
                  key={p.id}
                  data-section="chart-bubble-point"
                  data-point-id={p.id}
                  data-point-index={p.index}
                  data-point-x={p.x}
                  data-point-y={p.y}
                  data-point-size={p.size}
                  data-point-color={p.color}
                  data-point-category={p.category ?? ''}
                  data-point-r={p.r}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === p.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(p.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === p.id ? null : cur))
                  }
                  onClick={() => onBubbleClick?.({ point, layout: p })}
                >
                  <circle
                    data-section="chart-bubble-circle"
                    cx={p.cx}
                    cy={p.cy}
                    r={p.r}
                    fill={p.color}
                    fillOpacity={0.6}
                    stroke={p.color}
                    strokeWidth={1.2}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${p.label}: x ${formatValue(p.x)}, y ${formatValue(p.y)}, size ${fmtSize(p.size)}`}
                  />
                </g>
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-bubble-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div data-section="chart-bubble-tooltip-label" className="font-semibold">
              {hovered.label}
            </div>
            {hovered.category && (
              <div
                data-section="chart-bubble-tooltip-category"
                className="text-slate-500"
              >
                {hovered.category}
              </div>
            )}
            <div
              data-section="chart-bubble-tooltip-x"
              className="font-mono text-slate-700"
            >
              x: {formatValue(hovered.x)}
            </div>
            <div
              data-section="chart-bubble-tooltip-y"
              className="font-mono text-slate-700"
            >
              y: {formatValue(hovered.y)}
            </div>
            <div
              data-section="chart-bubble-tooltip-size"
              className="font-mono text-slate-500"
            >
              size: {fmtSize(hovered.size)}
            </div>
          </div>
        )}
      </div>
      {showBottomLegend && (
        <ul
          data-section="chart-bubble-legend"
          data-placement="bottom"
          className="flex flex-wrap gap-2 text-xs"
        >
          {categories.map((cat, idx) => {
            const isHidden = hiddenSet.has(cat);
            const color = getBubbleDefaultColor(idx);
            return (
              <li
                key={cat}
                data-section="chart-bubble-legend-item"
                data-category={cat}
                data-category-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-bubble-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${cat}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleCategory(cat)}
                >
                  <span
                    data-section="chart-bubble-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-bubble-legend-label"
                    className="text-slate-700"
                  >
                    {cat}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showRightLegend && (
        <ul
          data-section="chart-bubble-legend"
          data-placement="right"
          className="flex flex-col gap-1 text-xs"
        >
          {categories.map((cat, idx) => {
            const isHidden = hiddenSet.has(cat);
            const color = getBubbleDefaultColor(idx);
            return (
              <li
                key={cat}
                data-section="chart-bubble-legend-item"
                data-category={cat}
                data-category-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-bubble-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${cat}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleCategory(cat)}
                >
                  <span
                    data-section="chart-bubble-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-bubble-legend-label"
                    className="text-slate-700"
                  >
                    {cat}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const ChartBubble = forwardRef<HTMLDivElement, ChartBubbleProps>(
  ChartBubbleInner
);
ChartBubble.displayName = 'ChartBubble';
