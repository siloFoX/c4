import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PARABOLIC_SAR_WIDTH = 560;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_HEIGHT = 320;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_PADDING = 40;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_SAR_RADIUS = 2.6;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_REVERSAL_RADIUS = 5;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_STEP = 0.02;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_MAX_STEP = 0.2;
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_REVERSAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PARABOLIC_SAR_AXIS_COLOR = '#cbd5e1';

export type ChartLineParabolicSarTrend = 'up' | 'down';

export interface ChartLineParabolicSarPoint {
  x: number;
  value: number;
}

export interface ChartLineParabolicSarSample {
  index: number;
  x: number;
  value: number;
  sar: number;
  trend: ChartLineParabolicSarTrend;
  reversed: boolean;
}

export interface ChartLineParabolicSarRun {
  series: ChartLineParabolicSarPoint[];
  step: number;
  maxStep: number;
  samples: ChartLineParabolicSarSample[];
  reversalCount: number;
  upCount: number;
  downCount: number;
  ok: boolean;
}

export interface ChartLineParabolicSarPriceDot {
  index: number;
  x: number;
  value: number;
  px: number;
  py: number;
}

export interface ChartLineParabolicSarSarDot extends ChartLineParabolicSarSample {
  px: number;
  sarPy: number;
  pricePy: number;
}

export interface ChartLineParabolicSarLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  pricePath: string;
  priceDots: ChartLineParabolicSarPriceDot[];
  sarDots: ChartLineParabolicSarSarDot[];
  step: number;
  maxStep: number;
  reversalCount: number;
  upCount: number;
  downCount: number;
  totalPoints: number;
}

export interface ComputeLineParabolicSarLayoutOptions {
  data: readonly ChartLineParabolicSarPoint[];
  step?: number;
  maxStep?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineParabolicSarProps {
  data: readonly ChartLineParabolicSarPoint[];
  step?: number;
  maxStep?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  sarRadius?: number;
  reversalRadius?: number;
  priceColor?: string;
  upColor?: string;
  downColor?: string;
  reversalColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSar?: boolean;
  showReversals?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showFooter?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onSarClick?: (payload: { sample: ChartLineParabolicSarSarDot }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineParabolicSarFinitePoints(
  points: readonly ChartLineParabolicSarPoint[] | null | undefined,
): ChartLineParabolicSarPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineParabolicSarPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce an acceleration-factor parameter to a positive number. A
 * non-finite or non-positive value falls back to `fallback`.
 */
export function normalizeLineParabolicSarStep(
  value: number,
  fallback: number,
): number {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

/**
 * Welles Wilder's Parabolic SAR (Stop And Reverse), adapted to a
 * single-value series. The initial trend is taken from the first
 * move. Each period the SAR advances toward the extreme point by an
 * acceleration factor (`af`): `sar += af * (ep - sar)`. The factor
 * starts at `step` and grows by `step` (capped at `maxStep`) each
 * time the trend posts a new extreme. The SAR is clamped so it
 * cannot cross into the prior one or two values. When price pierces
 * the SAR the trend STOPS AND REVERSES -- the SAR jumps to the prior
 * extreme point, the new extreme point becomes the current value,
 * and the acceleration factor resets.
 */
export function runLineParabolicSar(
  points: readonly ChartLineParabolicSarPoint[] | null | undefined,
  options?: { step?: number; maxStep?: number },
): ChartLineParabolicSarRun {
  const finite = getLineParabolicSarFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const step = normalizeLineParabolicSarStep(
    options?.step ?? DEFAULT_CHART_LINE_PARABOLIC_SAR_STEP,
    DEFAULT_CHART_LINE_PARABOLIC_SAR_STEP,
  );
  const maxStep = Math.max(
    step,
    normalizeLineParabolicSarStep(
      options?.maxStep ?? DEFAULT_CHART_LINE_PARABOLIC_SAR_MAX_STEP,
      DEFAULT_CHART_LINE_PARABOLIC_SAR_MAX_STEP,
    ),
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      step,
      maxStep,
      samples: [],
      reversalCount: 0,
      upCount: 0,
      downCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  let trend: ChartLineParabolicSarTrend =
    values[1]! >= values[0]! ? 'up' : 'down';
  let af = step;
  let sar = values[0]!;
  let ep = values[0]!;

  const samples: ChartLineParabolicSarSample[] = [
    {
      index: 0,
      x: series[0]!.x,
      value: values[0]!,
      sar: values[0]!,
      trend,
      reversed: false,
    },
  ];
  let reversalCount = 0;

  for (let i = 1; i < n; i += 1) {
    const v = values[i]!;
    let nextSar = sar + af * (ep - sar);
    let reversed = false;

    if (trend === 'up') {
      nextSar = Math.min(nextSar, values[i - 1]!);
      if (i >= 2) nextSar = Math.min(nextSar, values[i - 2]!);
      if (v < nextSar) {
        reversed = true;
        trend = 'down';
        nextSar = ep;
        ep = v;
        af = step;
      } else if (v > ep) {
        ep = v;
        af = Math.min(af + step, maxStep);
      }
    } else {
      nextSar = Math.max(nextSar, values[i - 1]!);
      if (i >= 2) nextSar = Math.max(nextSar, values[i - 2]!);
      if (v > nextSar) {
        reversed = true;
        trend = 'up';
        nextSar = ep;
        ep = v;
        af = step;
      } else if (v < ep) {
        ep = v;
        af = Math.min(af + step, maxStep);
      }
    }

    sar = nextSar;
    if (reversed) reversalCount += 1;
    samples.push({
      index: i,
      x: series[i]!.x,
      value: v,
      sar,
      trend,
      reversed,
    });
  }

  let upCount = 0;
  for (const s of samples) if (s.trend === 'up') upCount += 1;

  return {
    series,
    step,
    maxStep,
    samples,
    reversalCount,
    upCount,
    downCount: samples.length - upCount,
    ok: true,
  };
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineParabolicSarLayout(
  options: ComputeLineParabolicSarLayoutOptions,
): ChartLineParabolicSarLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_PARABOLIC_SAR_TICK_COUNT,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const run = runLineParabolicSar(data, {
    ...(isFiniteNumber(options.step) ? { step: options.step } : {}),
    ...(isFiniteNumber(options.maxStep) ? { maxStep: options.maxStep } : {}),
  });
  const empty: ChartLineParabolicSarLayout = {
    ok: false,
    width,
    height,
    panel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    pricePath: '',
    priceDots: [],
    sarDots: [],
    step: run.step,
    maxStep: run.maxStep,
    reversalCount: 0,
    upCount: 0,
    downCount: 0,
    totalPoints: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
    if (s.sar < yLo) yLo = s.sar;
    if (s.sar > yHi) yHi = s.sar;
  }

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (isFiniteNumber(yMinOverride)) yLo = yMinOverride;
  if (isFiniteNumber(yMaxOverride)) yHi = yMaxOverride;

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLineParabolicSarPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    px: projectX(s.x),
    py: projectY(s.value),
  }));
  const sarDots: ChartLineParabolicSarSarDot[] = run.samples.map((s) => ({
    ...s,
    px: projectX(s.x),
    sarPy: projectY(s.sar),
    pricePy: projectY(s.value),
  }));

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    sarDots,
    step: run.step,
    maxStep: run.maxStep,
    reversalCount: run.reversalCount,
    upCount: run.upCount,
    downCount: run.downCount,
    totalPoints: run.samples.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineParabolicSarChart(
  data: readonly ChartLineParabolicSarPoint[] | null | undefined,
  options?: { step?: number; maxStep?: number },
): string {
  const run = runLineParabolicSar(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Parabolic SAR stop-and-reverse overlay (step ${run.step}, max ${run.maxStep}): ${run.reversalCount} trend flip${run.reversalCount === 1 ? '' : 's'} across ${run.samples.length} periods (${run.upCount} up, ${run.downCount} down).`;
}

const PSAR_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineParabolicSar = forwardRef<
  HTMLDivElement,
  ChartLineParabolicSarProps
>(function ChartLineParabolicSar(
  props: ChartLineParabolicSarProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    step,
    maxStep,
    width = DEFAULT_CHART_LINE_PARABOLIC_SAR_WIDTH,
    height = DEFAULT_CHART_LINE_PARABOLIC_SAR_HEIGHT,
    padding = DEFAULT_CHART_LINE_PARABOLIC_SAR_PADDING,
    tickCount = DEFAULT_CHART_LINE_PARABOLIC_SAR_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PARABOLIC_SAR_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PARABOLIC_SAR_DOT_RADIUS,
    sarRadius = DEFAULT_CHART_LINE_PARABOLIC_SAR_SAR_RADIUS,
    reversalRadius = DEFAULT_CHART_LINE_PARABOLIC_SAR_REVERSAL_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PARABOLIC_SAR_PRICE_COLOR,
    upColor = DEFAULT_CHART_LINE_PARABOLIC_SAR_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_PARABOLIC_SAR_DOWN_COLOR,
    reversalColor = DEFAULT_CHART_LINE_PARABOLIC_SAR_REVERSAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_PARABOLIC_SAR_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_PARABOLIC_SAR_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSar = true,
    showReversals = true,
    showTooltip = true,
    showConfigBadge = true,
    showFooter = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Parabolic SAR overlay',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    yLabel,
    onSarClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const layout = useMemo(
    () =>
      computeLineParabolicSarLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(step) ? { step } : {}),
        ...(isFiniteNumber(maxStep) ? { maxStep } : {}),
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [data, width, height, padding, tickCount, step, maxStep, xMin, xMax, yMin, yMax],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineParabolicSarChart(data, {
        ...(isFiniteNumber(step) ? { step } : {}),
        ...(isFiniteNumber(maxStep) ? { maxStep } : {}),
      }),
    [ariaDescription, data, step, maxStep],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverIndex(null);
    setTooltipPos(null);
  }, []);

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (!layout.ok) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-parabolic-sar"
        data-empty="true"
        data-reversal-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-parabolic-sar-aria-desc" style={PSAR_SR_STYLE}>
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const reversalDots = layout.sarDots.filter((d) => d.reversed);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-parabolic-sar"
      data-empty="false"
      data-reversal-count={layout.reversalCount}
      data-up-count={layout.upCount}
      data-down-count={layout.downCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span id={descId} data-section="chart-line-parabolic-sar-aria-desc" style={PSAR_SR_STYLE}>
        {summary}
      </span>

      <div
        data-section="chart-line-parabolic-sar-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-parabolic-sar-badge"
            data-step={layout.step}
            data-reversal-count={layout.reversalCount}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span data-section="chart-line-parabolic-sar-badge-icon" aria-hidden="true">
              SAR
            </span>
            <span data-section="chart-line-parabolic-sar-badge-step">
              af={String(layout.step)}
            </span>
            <span data-section="chart-line-parabolic-sar-badge-max">
              max={String(layout.maxStep)}
            </span>
            <span data-section="chart-line-parabolic-sar-badge-flips">
              flips={layout.reversalCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-parabolic-sar-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-parabolic-sar-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => {
                const py =
                  layout.panel.y +
                  layout.panel.height -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.panel.height;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-parabolic-sar-grid-line"
                    data-axis="y"
                    x1={layout.panel.x}
                    x2={layout.panel.x + layout.panel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.xTicks.map((t, i) => {
                const px =
                  layout.panel.x +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.panel.width;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-parabolic-sar-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={layout.panel.y}
                    y2={layout.panel.y + layout.panel.height}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-parabolic-sar-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-parabolic-sar-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-parabolic-sar-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-parabolic-sar-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-parabolic-sar-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-parabolic-sar-tick-label"
                        data-axis="x"
                        x={px}
                        y={layout.panel.y + layout.panel.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatX(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g data-section="chart-line-parabolic-sar-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-parabolic-sar-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-parabolic-sar-tick-label"
                        data-axis="y"
                        x={layout.panel.x - 6}
                        y={py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-parabolic-sar-x-label"
                  x={layout.panel.x + layout.panel.width / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-parabolic-sar-y-label"
                  transform={`rotate(-90 12 ${layout.panel.y + layout.panel.height / 2})`}
                  x={12}
                  y={layout.panel.y + layout.panel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          <path
            role="graphics-symbol"
            tabIndex={0}
            aria-label="Price line"
            data-section="chart-line-parabolic-sar-price-path"
            d={layout.pricePath}
            fill="none"
            stroke={priceColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {showDots ? (
            <g data-section="chart-line-parabolic-sar-price-dots">
              {layout.priceDots.map((d) => (
                <circle
                  key={`pd-${d.index}`}
                  data-section="chart-line-parabolic-sar-price-dot"
                  data-point-index={d.index}
                  cx={d.px}
                  cy={d.py}
                  r={dotRadius}
                  fill={priceColor}
                  stroke="#ffffff"
                  strokeWidth={1}
                />
              ))}
            </g>
          ) : null}

          {showReversals ? (
            <g data-section="chart-line-parabolic-sar-reversals">
              {reversalDots.map((d) => (
                <circle
                  key={`rv-${d.index}`}
                  data-section="chart-line-parabolic-sar-reversal"
                  data-point-index={d.index}
                  data-trend={d.trend}
                  cx={d.px}
                  cy={d.sarPy}
                  r={reversalRadius}
                  fill="none"
                  stroke={reversalColor}
                  strokeWidth={2}
                />
              ))}
            </g>
          ) : null}

          {showSar ? (
            <g data-section="chart-line-parabolic-sar-dots">
              {layout.sarDots.map((d) => {
                const isHover = hoverIndex === d.index;
                const color = d.trend === 'up' ? upColor : downColor;
                return (
                  <circle
                    key={`sd-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`SAR ${d.index + 1}: ${d.trend} trend, stop ${formatValue(d.sar)}`}
                    data-section="chart-line-parabolic-sar-dot"
                    data-point-index={d.index}
                    data-trend={d.trend}
                    data-reversed={d.reversed ? 'true' : 'false'}
                    data-sar={d.sar}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.sarPy}
                    r={isHover ? sarRadius + 1.5 : sarRadius}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.sarPy });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.sarPy });
                    }}
                    onBlur={clearHover}
                    onClick={() => onSarClick?.({ sample: d })}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.sarDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-parabolic-sar-tooltip"
                  data-point-index={d.index}
                  style={{
                    position: 'absolute',
                    left: tooltipPos.px + 8,
                    top: tooltipPos.py + 8,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    pointerEvents: 'none',
                    minWidth: 150,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-parabolic-sar-tooltip-trend"
                    style={{
                      color: d.trend === 'up' ? upColor : downColor,
                      fontWeight: 600,
                    }}
                  >
                    {d.trend} trend
                  </div>
                  <div data-section="chart-line-parabolic-sar-tooltip-sar">
                    SAR: {formatValue(d.sar)}
                  </div>
                  <div data-section="chart-line-parabolic-sar-tooltip-price">
                    price: {formatValue(d.value)}
                  </div>
                  {d.reversed ? (
                    <div
                      data-section="chart-line-parabolic-sar-tooltip-reversal"
                      style={{ color: reversalColor, fontWeight: 600 }}
                    >
                      stop and reverse
                    </div>
                  ) : null}
                </div>
              );
            })()
          : null}
      </div>

      {showFooter ? (
        <div
          data-section="chart-line-parabolic-sar-footer"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 10,
            color: '#64748b',
          }}
        >
          <span data-section="chart-line-parabolic-sar-footer-stats">
            step={String(layout.step)} max={String(layout.maxStep)} flips=
            {layout.reversalCount}
          </span>
          <span data-section="chart-line-parabolic-sar-footer-trend">
            {layout.upCount} up / {layout.downCount} down
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineParabolicSar.displayName = 'ChartLineParabolicSar';
