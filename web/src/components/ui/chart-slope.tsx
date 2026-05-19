import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_SLOPE_WIDTH = 560;
export const DEFAULT_CHART_SLOPE_HEIGHT = 320;
export const DEFAULT_CHART_SLOPE_PADDING = 40;
export const DEFAULT_CHART_SLOPE_LABEL_GAP = 8;
export const DEFAULT_CHART_SLOPE_POINT_RADIUS = 4;
export const DEFAULT_CHART_SLOPE_TICK_COUNT = 5;
export const DEFAULT_CHART_SLOPE_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_SLOPE_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_SLOPE_FLAT_COLOR = '#64748b';

export type ChartSlopeDirection = 'up' | 'down' | 'flat';

export interface ChartSlopeItem {
  id: string;
  label: string;
  before: number;
  after: number;
  color?: string;
}

export interface ChartSlopeLayoutItem {
  id: string;
  label: string;
  index: number;
  color: string;
  direction: ChartSlopeDirection;
  before: number;
  after: number;
  delta: number;
  pctChange: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  isValid: boolean;
}

export interface ChartSlopeBounds {
  yMin: number;
  yMax: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getSlopeDirection(
  before: number,
  after: number,
  epsilon: number = 0
): ChartSlopeDirection {
  if (!isFiniteNumber(before) || !isFiniteNumber(after)) return 'flat';
  const eps = isFiniteNumber(epsilon) && epsilon > 0 ? epsilon : 0;
  if (after - before > eps) return 'up';
  if (before - after > eps) return 'down';
  return 'flat';
}

export function getSlopePctChange(before: number, after: number): number {
  if (!isFiniteNumber(before) || !isFiniteNumber(after)) return 0;
  if (before === 0) {
    if (after === 0) return 0;
    return after > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  return (after - before) / Math.abs(before);
}

export function getSlopeDirectionColor(
  direction: ChartSlopeDirection,
  upColor: string,
  downColor: string,
  flatColor: string
): string {
  if (direction === 'up') return upColor;
  if (direction === 'down') return downColor;
  return flatColor;
}

export function getSlopeBounds(
  items: readonly ChartSlopeItem[]
): ChartSlopeBounds {
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (isFiniteNumber(item.before)) {
      if (item.before < yMin) yMin = item.before;
      if (item.before > yMax) yMax = item.before;
    }
    if (isFiniteNumber(item.after)) {
      if (item.after < yMin) yMin = item.after;
      if (item.after > yMax) yMax = item.after;
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return { yMin: 0, yMax: 1 };
  }
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  return { yMin, yMax };
}

export function getSlopeTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_SLOPE_TICK_COUNT
): number[] {
  const c = Math.max(2, Math.floor(count) || 0);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const step = (max - min) / (c - 1);
  return Array.from({ length: c }, (_, i) => min + step * i);
}

export interface ComputeSlopeLayoutInput {
  items: readonly ChartSlopeItem[];
  bounds: ChartSlopeBounds;
  innerW: number;
  innerH: number;
  padX: number;
  padY: number;
  upColor: string;
  downColor: string;
  flatColor: string;
  epsilon?: number;
}

export function computeSlopeLayout(
  input: ComputeSlopeLayoutInput
): ChartSlopeLayoutItem[] {
  const {
    items,
    bounds,
    innerW,
    innerH,
    padX,
    padY,
    upColor,
    downColor,
    flatColor,
    epsilon = 0,
  } = input;
  if (innerW <= 0 || innerH <= 0 || !items.length) return [];
  const ySpan = bounds.yMax - bounds.yMin;
  const leftX = padX;
  const rightX = padX + innerW;
  const out: ChartSlopeLayoutItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const validBefore = isFiniteNumber(item.before);
    const validAfter = isFiniteNumber(item.after);
    const direction = getSlopeDirection(item.before, item.after, epsilon);
    const delta =
      validBefore && validAfter ? item.after - item.before : 0;
    const pctChange = getSlopePctChange(item.before, item.after);
    const yPos = (yv: number) =>
      ySpan > 0
        ? padY + innerH - ((yv - bounds.yMin) / ySpan) * innerH
        : padY + innerH / 2;
    const leftY = validBefore ? yPos(item.before) : padY + innerH / 2;
    const rightY = validAfter ? yPos(item.after) : padY + innerH / 2;
    const directionColor = getSlopeDirectionColor(
      direction,
      upColor,
      downColor,
      flatColor
    );
    out.push({
      id: item.id,
      label: item.label,
      index: i,
      color: item.color ?? directionColor,
      direction,
      before: validBefore ? item.before : 0,
      after: validAfter ? item.after : 0,
      delta,
      pctChange,
      leftX,
      leftY,
      rightX,
      rightY,
      isValid: validBefore && validAfter,
    });
  }
  return out;
}

export function describeSlopeChart(
  items: readonly ChartSlopeItem[],
  beforeLabel: string,
  afterLabel: string,
  formatValue?: (v: number) => string
): string {
  if (!items.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  let up = 0;
  let down = 0;
  let flat = 0;
  let valid = 0;
  for (const item of items) {
    if (!isFiniteNumber(item.before) || !isFiniteNumber(item.after)) continue;
    valid++;
    const d = getSlopeDirection(item.before, item.after);
    if (d === 'up') up++;
    else if (d === 'down') down++;
    else flat++;
  }
  if (valid === 0) return 'No data';
  const bounds = getSlopeBounds(items);
  return `Slope chart from ${beforeLabel} to ${afterLabel} comparing ${valid} items: ${up} up, ${down} down, ${flat} flat. Value range ${fmt(bounds.yMin)} to ${fmt(bounds.yMax)}.`;
}

export interface ChartSlopeProps {
  items: readonly ChartSlopeItem[];
  beforeLabel?: string;
  afterLabel?: string;
  width?: number;
  height?: number;
  padding?: number;
  labelGap?: number;
  pointRadius?: number;
  tickCount?: number;
  yMin?: number;
  yMax?: number;
  epsilon?: number;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  showLeftLabels?: boolean;
  showRightLabels?: boolean;
  showLeftValues?: boolean;
  showRightValues?: boolean;
  showAxes?: boolean;
  showAxisTicks?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showColumnHeaders?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatLabel?: (label: string, item: ChartSlopeLayoutItem) => string;
  onItemClick?: (args: {
    item: ChartSlopeItem;
    layout: ChartSlopeLayoutItem;
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

const ChartSlopeInner = (
  {
    items,
    beforeLabel = 'Before',
    afterLabel = 'After',
    width = DEFAULT_CHART_SLOPE_WIDTH,
    height = DEFAULT_CHART_SLOPE_HEIGHT,
    padding = DEFAULT_CHART_SLOPE_PADDING,
    labelGap = DEFAULT_CHART_SLOPE_LABEL_GAP,
    pointRadius = DEFAULT_CHART_SLOPE_POINT_RADIUS,
    tickCount = DEFAULT_CHART_SLOPE_TICK_COUNT,
    yMin,
    yMax,
    epsilon = 0,
    upColor = DEFAULT_CHART_SLOPE_UP_COLOR,
    downColor = DEFAULT_CHART_SLOPE_DOWN_COLOR,
    flatColor = DEFAULT_CHART_SLOPE_FLAT_COLOR,
    showLeftLabels = true,
    showRightLabels = true,
    showLeftValues = true,
    showRightValues = true,
    showAxes = true,
    showAxisTicks = false,
    showGrid = false,
    showTooltip = true,
    showColumnHeaders = true,
    animate = true,
    className,
    ariaLabel = 'Slope chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatLabel,
    onItemClick,
    style,
  }: ChartSlopeProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-slope-desc-${reactId}`;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const labelMargin = 90;
  const innerW = Math.max(0, width - padding * 2 - labelMargin * 2);
  const innerH = Math.max(
    0,
    height - padding * 2 - (showColumnHeaders ? 20 : 0)
  );
  const chartTopY = padding + (showColumnHeaders ? 20 : 0);
  const chartBottomY = chartTopY + innerH;
  const chartLeftX = padding + labelMargin;
  const chartRightX = chartLeftX + innerW;

  const autoBounds = useMemo(() => getSlopeBounds(items), [items]);
  const bounds: ChartSlopeBounds = useMemo(
    () => ({
      yMin: isFiniteNumber(yMin) ? yMin : autoBounds.yMin,
      yMax: isFiniteNumber(yMax) ? yMax : autoBounds.yMax,
    }),
    [autoBounds, yMin, yMax]
  );

  const layout = useMemo(
    () =>
      computeSlopeLayout({
        items,
        bounds,
        innerW,
        innerH,
        padX: chartLeftX,
        padY: chartTopY,
        upColor,
        downColor,
        flatColor,
        epsilon,
      }),
    [
      items,
      bounds,
      innerW,
      innerH,
      chartLeftX,
      chartTopY,
      upColor,
      downColor,
      flatColor,
      epsilon,
    ]
  );

  const yTicks = useMemo(
    () => getSlopeTicks(bounds.yMin, bounds.yMax, tickCount),
    [bounds.yMin, bounds.yMax, tickCount]
  );

  const ySpan = bounds.yMax - bounds.yMin;
  const yPos = (yv: number) =>
    ySpan > 0
      ? chartTopY + innerH - ((yv - bounds.yMin) / ySpan) * innerH
      : chartTopY + innerH / 2;

  const counts = useMemo(() => {
    let up = 0;
    let down = 0;
    let flat = 0;
    for (const item of layout) {
      if (!item.isValid) continue;
      if (item.direction === 'up') up++;
      else if (item.direction === 'down') down++;
      else flat++;
    }
    return { up, down, flat };
  }, [layout]);

  const autoDescription = useMemo(
    () => describeSlopeChart(items, beforeLabel, afterLabel, formatValue),
    [items, beforeLabel, afterLabel, formatValue]
  );

  const hovered = useMemo(
    () => layout.find((p) => p.id === hoveredId) ?? null,
    [layout, hoveredId]
  );

  return (
    <div
      ref={ref}
      data-section="chart-slope"
      data-item-count={items.length}
      data-visible-count={layout.length}
      data-up-count={counts.up}
      data-down-count={counts.down}
      data-flat-count={counts.flat}
      data-animate={animate ? 'true' : 'false'}
      className={['chart-slope flex flex-col gap-2', className ?? '']
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-slope-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-slope-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-slope-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showColumnHeaders && (
            <g data-section="chart-slope-headers">
              <text
                data-section="chart-slope-header"
                data-side="left"
                x={chartLeftX}
                y={chartTopY - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="rgb(51 65 85)"
              >
                {beforeLabel}
              </text>
              <text
                data-section="chart-slope-header"
                data-side="right"
                x={chartRightX}
                y={chartTopY - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="rgb(51 65 85)"
              >
                {afterLabel}
              </text>
            </g>
          )}
          {showGrid && (
            <g data-section="chart-slope-grid" pointerEvents="none">
              {yTicks.map((t, i) => {
                const y = yPos(t);
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-slope-grid-line"
                    x1={chartLeftX}
                    x2={chartRightX}
                    y1={y}
                    y2={y}
                    stroke="rgb(226 232 240)"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          )}
          {showAxes && (
            <g data-section="chart-slope-axes">
              <line
                data-section="chart-slope-axis"
                data-side="left"
                x1={chartLeftX}
                x2={chartLeftX}
                y1={chartTopY}
                y2={chartBottomY}
                stroke="rgb(148 163 184)"
                strokeWidth={1}
              />
              <line
                data-section="chart-slope-axis"
                data-side="right"
                x1={chartRightX}
                x2={chartRightX}
                y1={chartTopY}
                y2={chartBottomY}
                stroke="rgb(148 163 184)"
                strokeWidth={1}
              />
            </g>
          )}
          {showAxisTicks && (
            <g data-section="chart-slope-ticks" pointerEvents="none">
              {yTicks.map((t, i) => {
                const y = yPos(t);
                return (
                  <g key={`ty-${i}`} data-section="chart-slope-tick">
                    <line
                      x1={chartLeftX - 4}
                      x2={chartLeftX}
                      y1={y}
                      y2={y}
                      stroke="rgb(148 163 184)"
                      strokeWidth={1}
                    />
                    <text
                      data-section="chart-slope-tick-label"
                      x={chartLeftX - 6}
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
          <g data-section="chart-slope-items">
            {layout.map((p) => {
              const isHovered = hoveredId === p.id;
              const dim = hoveredId != null && !isHovered ? 0.3 : 1;
              if (!p.isValid) return null;
              const formattedLabel = formatLabel
                ? formatLabel(p.label, p)
                : p.label;
              return (
                <g
                  key={p.id}
                  data-section="chart-slope-item"
                  data-item-id={p.id}
                  data-item-index={p.index}
                  data-item-direction={p.direction}
                  data-item-before={p.before}
                  data-item-after={p.after}
                  data-item-delta={p.delta}
                  data-item-pct-change={p.pctChange}
                  data-item-color={p.color}
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
                  onClick={() => {
                    const orig = items[p.index];
                    if (orig) onItemClick?.({ item: orig, layout: p });
                  }}
                  style={{ opacity: dim }}
                >
                  <line
                    data-section="chart-slope-line"
                    x1={p.leftX}
                    x2={p.rightX}
                    y1={p.leftY}
                    y2={p.rightY}
                    stroke={p.color}
                    strokeWidth={isHovered ? 2.5 : 1.6}
                    strokeLinecap="round"
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${p.label}: ${formatValue(p.before)} -> ${formatValue(p.after)} (${p.direction})`}
                  />
                  <circle
                    data-section="chart-slope-point"
                    data-side="left"
                    cx={p.leftX}
                    cy={p.leftY}
                    r={pointRadius}
                    fill="rgb(255 255 255)"
                    stroke={p.color}
                    strokeWidth={1.4}
                  />
                  <circle
                    data-section="chart-slope-point"
                    data-side="right"
                    cx={p.rightX}
                    cy={p.rightY}
                    r={pointRadius}
                    fill={p.color}
                    stroke={p.color}
                    strokeWidth={1.4}
                  />
                  {showLeftValues && (
                    <text
                      data-section="chart-slope-value"
                      data-side="left"
                      x={p.leftX - labelGap}
                      y={p.leftY + 4}
                      textAnchor="end"
                      fontSize={11}
                      fontWeight={500}
                      fill="rgb(51 65 85)"
                    >
                      {formatValue(p.before)}
                    </text>
                  )}
                  {showRightValues && (
                    <text
                      data-section="chart-slope-value"
                      data-side="right"
                      x={p.rightX + labelGap}
                      y={p.rightY + 4}
                      textAnchor="start"
                      fontSize={11}
                      fontWeight={500}
                      fill="rgb(51 65 85)"
                    >
                      {formatValue(p.after)}
                    </text>
                  )}
                  {showLeftLabels && (
                    <text
                      data-section="chart-slope-label"
                      data-side="left"
                      x={p.leftX - labelGap - 38}
                      y={p.leftY + 4}
                      textAnchor="end"
                      fontSize={11}
                      fill="rgb(100 116 139)"
                    >
                      {formattedLabel}
                    </text>
                  )}
                  {showRightLabels && (
                    <text
                      data-section="chart-slope-label"
                      data-side="right"
                      x={p.rightX + labelGap + 38}
                      y={p.rightY + 4}
                      textAnchor="start"
                      fontSize={11}
                      fill="rgb(100 116 139)"
                    >
                      {formattedLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && hovered.isValid && (
          <div
            data-section="chart-slope-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-slope-tooltip-label"
              className="font-semibold"
            >
              {hovered.label}
            </div>
            <div
              data-section="chart-slope-tooltip-before"
              className="font-mono text-slate-700"
            >
              {beforeLabel}: {formatValue(hovered.before)}
            </div>
            <div
              data-section="chart-slope-tooltip-after"
              className="font-mono text-slate-700"
            >
              {afterLabel}: {formatValue(hovered.after)}
            </div>
            <div
              data-section="chart-slope-tooltip-delta"
              className="font-mono text-slate-500"
            >
              delta: {formatValue(hovered.delta)} ({hovered.direction})
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChartSlope = forwardRef<HTMLDivElement, ChartSlopeProps>(
  ChartSlopeInner
);
ChartSlope.displayName = 'ChartSlope';
