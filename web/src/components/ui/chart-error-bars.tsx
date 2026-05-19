import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_ERROR_BARS_WIDTH = 560;
export const DEFAULT_CHART_ERROR_BARS_HEIGHT = 320;
export const DEFAULT_CHART_ERROR_BARS_PADDING = 40;
export const DEFAULT_CHART_ERROR_BARS_TICK_COUNT = 5;
export const DEFAULT_CHART_ERROR_BARS_BAR_GAP = 12;
export const DEFAULT_CHART_ERROR_BARS_POINT_RADIUS = 4;
export const DEFAULT_CHART_ERROR_BARS_WHISKER_LENGTH = 6;
export const DEFAULT_CHART_ERROR_BARS_PRIMARY_COLOR = '#2563eb';
export const DEFAULT_CHART_ERROR_BARS_ERROR_COLOR = '#1e40af';

export type ChartErrorBarsMode = 'bar' | 'scatter';

export interface ChartErrorBarsPoint {
  id: string;
  label?: string;
  x?: number;
  y: number;
  category?: string;
  lower?: number;
  upper?: number;
  error?: number;
  xLower?: number;
  xUpper?: number;
  xError?: number;
  color?: string;
}

export interface ChartErrorBarsCIRange {
  lower: number;
  upper: number;
  hasError: boolean;
}

export interface ChartErrorBarsLayoutPoint {
  id: string;
  label: string;
  index: number;
  color: string;
  cx: number;
  cy: number;
  baselineY: number;
  yLowerY: number;
  yUpperY: number;
  hasY: boolean;
  xLowerX: number;
  xUpperX: number;
  hasX: boolean;
  value: number;
  yLower: number;
  yUpper: number;
  xValue: number;
  xLower: number;
  xUpper: number;
  category: string;
}

export interface ChartErrorBarsBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getDefaultErrorBarColor(_index: number): string {
  return DEFAULT_CHART_ERROR_BARS_PRIMARY_COLOR;
}

export function getErrorBarCIRange(point: ChartErrorBarsPoint): ChartErrorBarsCIRange {
  const value = isFiniteNumber(point.y) ? point.y : 0;
  let lower = value;
  let upper = value;
  let hasError = false;
  if (isFiniteNumber(point.lower)) {
    lower = point.lower;
    hasError = true;
  }
  if (isFiniteNumber(point.upper)) {
    upper = point.upper;
    hasError = true;
  }
  if (!hasError && isFiniteNumber(point.error) && point.error >= 0) {
    lower = value - point.error;
    upper = value + point.error;
    hasError = true;
  }
  if (lower > upper) {
    const tmp = lower;
    lower = upper;
    upper = tmp;
  }
  return { lower, upper, hasError };
}

export function getErrorBarXCIRange(
  point: ChartErrorBarsPoint
): ChartErrorBarsCIRange {
  const x = isFiniteNumber(point.x) ? point.x : 0;
  let lower = x;
  let upper = x;
  let hasError = false;
  if (isFiniteNumber(point.xLower)) {
    lower = point.xLower;
    hasError = true;
  }
  if (isFiniteNumber(point.xUpper)) {
    upper = point.xUpper;
    hasError = true;
  }
  if (!hasError && isFiniteNumber(point.xError) && point.xError >= 0) {
    lower = x - point.xError;
    upper = x + point.xError;
    hasError = true;
  }
  if (lower > upper) {
    const tmp = lower;
    lower = upper;
    upper = tmp;
  }
  return { lower, upper, hasError };
}

export function getErrorBarBounds(
  data: readonly ChartErrorBarsPoint[],
  mode: ChartErrorBarsMode
): ChartErrorBarsBounds {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < data.length; i++) {
    const p = data[i]!;
    if (!isFiniteNumber(p.y)) continue;
    const yCI = getErrorBarCIRange(p);
    if (yCI.lower < yMin) yMin = yCI.lower;
    if (yCI.upper > yMax) yMax = yCI.upper;
    if (mode === 'scatter') {
      const xv = isFiniteNumber(p.x) ? p.x : i;
      const xCI = getErrorBarXCIRange(p);
      const lo = xCI.hasError ? xCI.lower : xv;
      const hi = xCI.hasError ? xCI.upper : xv;
      if (lo < xMin) xMin = lo;
      if (hi > xMax) xMax = hi;
    } else {
      if (i < xMin) xMin = i;
      if (i > xMax) xMax = i;
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = 0;
    xMax = mode === 'scatter' ? 1 : Math.max(0, data.length - 1);
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (mode === 'bar' && yMin > 0) yMin = 0;
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  return { xMin, xMax, yMin, yMax };
}

export function getErrorBarTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_ERROR_BARS_TICK_COUNT
): number[] {
  const c = Math.max(2, Math.floor(count) || 0);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const step = (max - min) / (c - 1);
  return Array.from({ length: c }, (_, i) => min + step * i);
}

export interface ComputeErrorBarLayoutInput {
  data: readonly ChartErrorBarsPoint[];
  mode: ChartErrorBarsMode;
  bounds: ChartErrorBarsBounds;
  innerW: number;
  innerH: number;
  padX: number;
  padY: number;
}

export function computeErrorBarLayout(
  input: ComputeErrorBarLayoutInput
): ChartErrorBarsLayoutPoint[] {
  const { data, mode, bounds, innerW, innerH, padX, padY } = input;
  if (innerW <= 0 || innerH <= 0) return [];
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const baselineYValue =
    mode === 'bar'
      ? Math.max(bounds.yMin, Math.min(0, bounds.yMax))
      : bounds.yMin;
  const baselineY =
    ySpan > 0
      ? padY + innerH - ((baselineYValue - bounds.yMin) / ySpan) * innerH
      : padY + innerH;
  const out: ChartErrorBarsLayoutPoint[] = [];
  for (let i = 0; i < data.length; i++) {
    const p = data[i]!;
    if (!isFiniteNumber(p.y)) continue;
    const yCI = getErrorBarCIRange(p);
    const xCI = getErrorBarXCIRange(p);
    const xValue =
      mode === 'scatter' ? (isFiniteNumber(p.x) ? p.x : i) : i;
    const xRatio = xSpan > 0 ? (xValue - bounds.xMin) / xSpan : 0.5;
    const cx = padX + xRatio * innerW;
    const cy =
      ySpan > 0
        ? padY + innerH - ((p.y - bounds.yMin) / ySpan) * innerH
        : padY + innerH / 2;
    const yLowerY =
      ySpan > 0
        ? padY + innerH - ((yCI.lower - bounds.yMin) / ySpan) * innerH
        : cy;
    const yUpperY =
      ySpan > 0
        ? padY + innerH - ((yCI.upper - bounds.yMin) / ySpan) * innerH
        : cy;
    const xLowerVal = mode === 'scatter' && xCI.hasError ? xCI.lower : xValue;
    const xUpperVal = mode === 'scatter' && xCI.hasError ? xCI.upper : xValue;
    const xLowerX =
      xSpan > 0
        ? padX + ((xLowerVal - bounds.xMin) / xSpan) * innerW
        : cx;
    const xUpperX =
      xSpan > 0
        ? padX + ((xUpperVal - bounds.xMin) / xSpan) * innerW
        : cx;
    out.push({
      id: p.id,
      label: p.label ?? p.id,
      index: i,
      color: p.color ?? getDefaultErrorBarColor(i),
      cx,
      cy,
      baselineY,
      yLowerY,
      yUpperY,
      hasY: yCI.hasError,
      xLowerX,
      xUpperX,
      hasX: mode === 'scatter' && xCI.hasError,
      value: p.y,
      yLower: yCI.lower,
      yUpper: yCI.upper,
      xValue,
      xLower: xCI.lower,
      xUpper: xCI.upper,
      category: typeof p.category === 'string' ? p.category : '',
    });
  }
  return out;
}

export function describeErrorBarChart(
  data: readonly ChartErrorBarsPoint[],
  mode: ChartErrorBarsMode,
  formatValue?: (v: number) => string
): string {
  if (!data.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  let errorCount = 0;
  let validCount = 0;
  for (const p of data) {
    if (!isFiniteNumber(p.y)) continue;
    validCount++;
    const yCI = getErrorBarCIRange(p);
    const xCI = getErrorBarXCIRange(p);
    if (yCI.hasError || (mode === 'scatter' && xCI.hasError)) errorCount++;
  }
  if (!validCount) return 'No data';
  const bounds = getErrorBarBounds(data, mode);
  return `Error bar chart (${mode}) with ${validCount} points, ${errorCount} with confidence intervals. y range ${fmt(bounds.yMin)} to ${fmt(bounds.yMax)}.`;
}

export interface ChartErrorBarsProps {
  data: readonly ChartErrorBarsPoint[];
  mode?: ChartErrorBarsMode;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  pointRadius?: number;
  whiskerLength?: number;
  barGap?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showGrid?: boolean;
  showCategoryLabels?: boolean;
  showXErrorBars?: boolean;
  showYErrorBars?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  primaryColor?: string;
  errorColor?: string;
  formatValue?: (v: number) => string;
  formatCategory?: (label: string, index: number) => string;
  onPointClick?: (args: {
    point: ChartErrorBarsPoint;
    layout: ChartErrorBarsLayoutPoint;
  }) => void;
  style?: CSSProperties;
}

function defaultFormatValue(v: number): string {
  return String(v);
}

const ChartErrorBarsInner = (
  {
    data,
    mode = 'bar',
    width = DEFAULT_CHART_ERROR_BARS_WIDTH,
    height = DEFAULT_CHART_ERROR_BARS_HEIGHT,
    padding = DEFAULT_CHART_ERROR_BARS_PADDING,
    tickCount = DEFAULT_CHART_ERROR_BARS_TICK_COUNT,
    pointRadius = DEFAULT_CHART_ERROR_BARS_POINT_RADIUS,
    whiskerLength = DEFAULT_CHART_ERROR_BARS_WHISKER_LENGTH,
    barGap = DEFAULT_CHART_ERROR_BARS_BAR_GAP,
    xMin,
    xMax,
    yMin,
    yMax,
    showTooltip = true,
    showAxisTicks = true,
    showGrid = true,
    showCategoryLabels = true,
    showXErrorBars = true,
    showYErrorBars = true,
    animate = true,
    className,
    ariaLabel = 'Error bar chart',
    ariaDescription,
    primaryColor = DEFAULT_CHART_ERROR_BARS_PRIMARY_COLOR,
    errorColor = DEFAULT_CHART_ERROR_BARS_ERROR_COLOR,
    formatValue = defaultFormatValue,
    formatCategory,
    onPointClick,
    style,
  }: ChartErrorBarsProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-error-bars-desc-${reactId}`;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const autoBounds = useMemo(() => getErrorBarBounds(data, mode), [data, mode]);
  const bounds: ChartErrorBarsBounds = useMemo(
    () => ({
      xMin: isFiniteNumber(xMin) ? xMin : autoBounds.xMin,
      xMax: isFiniteNumber(xMax) ? xMax : autoBounds.xMax,
      yMin: isFiniteNumber(yMin) ? yMin : autoBounds.yMin,
      yMax: isFiniteNumber(yMax) ? yMax : autoBounds.yMax,
    }),
    [autoBounds, xMin, xMax, yMin, yMax]
  );

  const layout = useMemo(
    () =>
      computeErrorBarLayout({
        data,
        mode,
        bounds,
        innerW,
        innerH,
        padX: padding,
        padY: padding,
      }),
    [data, mode, bounds, innerW, innerH, padding]
  );

  const yTicks = useMemo(
    () => getErrorBarTicks(bounds.yMin, bounds.yMax, tickCount),
    [bounds.yMin, bounds.yMax, tickCount]
  );

  const xTicks = useMemo(
    () =>
      mode === 'scatter'
        ? getErrorBarTicks(bounds.xMin, bounds.xMax, tickCount)
        : [],
    [mode, bounds.xMin, bounds.xMax, tickCount]
  );

  const ySpan = bounds.yMax - bounds.yMin;
  const yPos = (yv: number) =>
    ySpan > 0
      ? padding + innerH - ((yv - bounds.yMin) / ySpan) * innerH
      : padding + innerH / 2;
  const xSpan = bounds.xMax - bounds.xMin;
  const xPos = (xv: number) =>
    xSpan > 0
      ? padding + ((xv - bounds.xMin) / xSpan) * innerW
      : padding + innerW / 2;

  const barSlotWidth =
    mode === 'bar' && data.length > 0 ? innerW / data.length : 0;
  const barWidth = Math.max(2, barSlotWidth - barGap);

  const hovered = useMemo(
    () => layout.find((p) => p.id === hoveredId) ?? null,
    [layout, hoveredId]
  );

  const autoDescription = useMemo(
    () => describeErrorBarChart(data, mode, formatValue),
    [data, mode, formatValue]
  );

  const errorCount = useMemo(
    () => layout.filter((p) => p.hasY || p.hasX).length,
    [layout]
  );

  return (
    <div
      ref={ref}
      data-section="chart-error-bars"
      data-mode={mode}
      data-point-count={data.length}
      data-visible-count={layout.length}
      data-error-count={errorCount}
      data-animate={animate ? 'true' : 'false'}
      className={['chart-error-bars flex flex-col gap-2', className ?? '']
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-error-bars-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-error-bars-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-error-bars-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showGrid && (
            <g data-section="chart-error-bars-grid" pointerEvents="none">
              {yTicks.map((t, i) => {
                const y = yPos(t);
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-error-bars-grid-line"
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
              {mode === 'scatter' &&
                xTicks.map((t, i) => {
                  const x = xPos(t);
                  return (
                    <line
                      key={`gx-${i}`}
                      data-section="chart-error-bars-grid-line"
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
          <g data-section="chart-error-bars-axes">
            <line
              data-section="chart-error-bars-axis"
              data-axis="x"
              x1={padding}
              x2={padding + innerW}
              y1={padding + innerH}
              y2={padding + innerH}
              stroke="rgb(148 163 184)"
              strokeWidth={1}
            />
            <line
              data-section="chart-error-bars-axis"
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
            <g data-section="chart-error-bars-ticks" pointerEvents="none">
              {yTicks.map((t, i) => {
                const y = yPos(t);
                return (
                  <g
                    key={`ty-${i}`}
                    data-section="chart-error-bars-tick"
                    data-axis="y"
                  >
                    <line
                      x1={padding - 4}
                      x2={padding}
                      y1={y}
                      y2={y}
                      stroke="rgb(148 163 184)"
                      strokeWidth={1}
                    />
                    <text
                      data-section="chart-error-bars-tick-label"
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
              {mode === 'scatter' &&
                xTicks.map((t, i) => {
                  const x = xPos(t);
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-error-bars-tick"
                      data-axis="x"
                    >
                      <line
                        x1={x}
                        x2={x}
                        y1={padding + innerH}
                        y2={padding + innerH + 4}
                        stroke="rgb(148 163 184)"
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-error-bars-tick-label"
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
            </g>
          )}
          {mode === 'bar' && showCategoryLabels && (
            <g data-section="chart-error-bars-categories" pointerEvents="none">
              {layout.map((p) => {
                const cat = p.category || p.label;
                const label = formatCategory ? formatCategory(cat, p.index) : cat;
                return (
                  <text
                    key={`cat-${p.id}`}
                    data-section="chart-error-bars-category-label"
                    data-point-id={p.id}
                    x={p.cx}
                    y={padding + innerH + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="rgb(100 116 139)"
                  >
                    {label}
                  </text>
                );
              })}
            </g>
          )}
          <g data-section="chart-error-bars-marks">
            {layout.map((p) => {
              const isHovered = hoveredId === p.id;
              const fillColor = p.color || primaryColor;
              const stroke = errorColor;
              return (
                <g
                  key={p.id}
                  data-section="chart-error-bars-mark"
                  data-point-id={p.id}
                  data-point-index={p.index}
                  data-point-value={p.value}
                  data-point-color={fillColor}
                  data-point-has-y-error={p.hasY ? 'true' : 'false'}
                  data-point-has-x-error={p.hasX ? 'true' : 'false'}
                  data-point-y-lower={p.yLower}
                  data-point-y-upper={p.yUpper}
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
                    const point = data[p.index];
                    if (point) onPointClick?.({ point, layout: p });
                  }}
                >
                  {mode === 'bar' && (
                    <rect
                      data-section="chart-error-bars-bar"
                      x={p.cx - barWidth / 2}
                      y={Math.min(p.cy, p.baselineY)}
                      width={barWidth}
                      height={Math.abs(p.baselineY - p.cy)}
                      fill={fillColor}
                      fillOpacity={0.7}
                      stroke={fillColor}
                      strokeWidth={1}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${p.label}: ${formatValue(p.value)}${
                        p.hasY
                          ? ` (CI ${formatValue(p.yLower)} to ${formatValue(
                              p.yUpper
                            )})`
                          : ''
                      }`}
                    />
                  )}
                  {mode === 'scatter' && (
                    <circle
                      data-section="chart-error-bars-point"
                      cx={p.cx}
                      cy={p.cy}
                      r={pointRadius}
                      fill={fillColor}
                      stroke={fillColor}
                      strokeWidth={1.2}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${p.label}: x ${formatValue(
                        p.xValue
                      )}, y ${formatValue(p.value)}${
                        p.hasY
                          ? ` (y CI ${formatValue(p.yLower)} to ${formatValue(
                              p.yUpper
                            )})`
                          : ''
                      }${
                        p.hasX
                          ? ` (x CI ${formatValue(p.xLower)} to ${formatValue(
                              p.xUpper
                            )})`
                          : ''
                      }`}
                    />
                  )}
                  {showYErrorBars && p.hasY && (
                    <g
                      data-section="chart-error-bars-y-whisker"
                      pointerEvents="none"
                    >
                      <line
                        data-section="chart-error-bars-y-stem"
                        x1={p.cx}
                        x2={p.cx}
                        y1={p.yLowerY}
                        y2={p.yUpperY}
                        stroke={stroke}
                        strokeWidth={1.4}
                      />
                      <line
                        data-section="chart-error-bars-y-cap"
                        data-cap="lower"
                        x1={p.cx - whiskerLength / 2}
                        x2={p.cx + whiskerLength / 2}
                        y1={p.yLowerY}
                        y2={p.yLowerY}
                        stroke={stroke}
                        strokeWidth={1.4}
                      />
                      <line
                        data-section="chart-error-bars-y-cap"
                        data-cap="upper"
                        x1={p.cx - whiskerLength / 2}
                        x2={p.cx + whiskerLength / 2}
                        y1={p.yUpperY}
                        y2={p.yUpperY}
                        stroke={stroke}
                        strokeWidth={1.4}
                      />
                    </g>
                  )}
                  {showXErrorBars && p.hasX && (
                    <g
                      data-section="chart-error-bars-x-whisker"
                      pointerEvents="none"
                    >
                      <line
                        data-section="chart-error-bars-x-stem"
                        x1={p.xLowerX}
                        x2={p.xUpperX}
                        y1={p.cy}
                        y2={p.cy}
                        stroke={stroke}
                        strokeWidth={1.4}
                      />
                      <line
                        data-section="chart-error-bars-x-cap"
                        data-cap="lower"
                        x1={p.xLowerX}
                        x2={p.xLowerX}
                        y1={p.cy - whiskerLength / 2}
                        y2={p.cy + whiskerLength / 2}
                        stroke={stroke}
                        strokeWidth={1.4}
                      />
                      <line
                        data-section="chart-error-bars-x-cap"
                        data-cap="upper"
                        x1={p.xUpperX}
                        x2={p.xUpperX}
                        y1={p.cy - whiskerLength / 2}
                        y2={p.cy + whiskerLength / 2}
                        stroke={stroke}
                        strokeWidth={1.4}
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-error-bars-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-error-bars-tooltip-label"
              className="font-semibold"
            >
              {hovered.label}
            </div>
            <div
              data-section="chart-error-bars-tooltip-value"
              className="font-mono text-slate-700"
            >
              {mode === 'scatter'
                ? `(${formatValue(hovered.xValue)}, ${formatValue(hovered.value)})`
                : formatValue(hovered.value)}
            </div>
            {hovered.hasY && (
              <div
                data-section="chart-error-bars-tooltip-y-range"
                className="font-mono text-slate-500"
              >
                y CI: {formatValue(hovered.yLower)} -{' '}
                {formatValue(hovered.yUpper)}
              </div>
            )}
            {hovered.hasX && (
              <div
                data-section="chart-error-bars-tooltip-x-range"
                className="font-mono text-slate-500"
              >
                x CI: {formatValue(hovered.xLower)} -{' '}
                {formatValue(hovered.xUpper)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ChartErrorBars = forwardRef<HTMLDivElement, ChartErrorBarsProps>(
  ChartErrorBarsInner
);
ChartErrorBars.displayName = 'ChartErrorBars';
