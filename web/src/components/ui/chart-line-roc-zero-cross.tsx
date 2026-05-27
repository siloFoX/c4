import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';

/**
 * ChartLineRocZeroCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Rate of Change
 * (ROC) line in the bottom panel, marking bullish (cross up
 * through zero) / bearish (cross down through zero) momentum
 * baseline regime transition events at the zero line. Zero-
 * line cross variant of the ROC family that flags the
 * discrete ROC crossing of the zero baseline.
 *
 *   roc[i] = close[i-length] != 0
 *              ? (close[i] - close[i-length]) / |close[i-length]| * 100
 *              : 0
 *   bullish : prev roc <= 0 && cur roc > 0  (momentum up)
 *   bearish : prev roc >= 0 && cur roc < 0  (momentum down)
 *
 * Defaults: `length = 12` (canonical ROC window),
 * `threshold = 0` (zero baseline). Regime classifier `bullish`
 * (roc >= 0), `bearish` (roc < 0), `none` (roc null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: close[i] = close[i-length] = K every
 *   bar so the numerator is 0 -> roc = 0 (even when K = 0,
 *   the close[i-length] = 0 guard returns 0 rather than NaN).
 *   roc = 0 sits on the threshold but the strict-inequality
 *   detector never fires. regime `bullish` (roc >= 0). cross
 *   count = 0. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: roc = (i - (i-length)) /
 *   |i-length| * 100 = length / |i-length| * 100. Positive
 *   but decreasing toward 0 as i grows. regime `bullish`. 0
 *   crosses.
 * - **LINEAR DOWN close = -i**: roc = -length / (i - length)
 *   * 100. Negative, magnitude shrinking. regime `bearish`.
 *   0 crosses.
 */

export interface ChartLineRocZeroCrossPoint {
  x: number;
  close: number;
}

export type ChartLineRocZeroCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineRocZeroCrossSeriesId = 'price' | 'roc';

export type ChartLineRocZeroCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineRocZeroCrossCross {
  index: number;
  x: number;
  kind: ChartLineRocZeroCrossCrossKind;
}

export interface ChartLineRocZeroCrossSample {
  index: number;
  x: number;
  close: number;
  roc: number | null;
  regime: ChartLineRocZeroCrossRegime;
}

export interface ChartLineRocZeroCrossRun {
  series: ChartLineRocZeroCrossPoint[];
  length: number;
  threshold: number;
  rocValues: Array<number | null>;
  samples: ChartLineRocZeroCrossSample[];
  crosses: ChartLineRocZeroCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineRocZeroCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRocZeroCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  oscTop: number;
  oscBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineRocZeroCrossDot[];
  rocPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  thresholdY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineRocZeroCrossCrossKind;
  }>;
  run: ChartLineRocZeroCrossRun;
}

export interface ChartLineRocZeroCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRocZeroCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rocColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRoc?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRocZeroCrossSeriesId[];
  defaultHiddenSeries?: ChartLineRocZeroCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRocZeroCrossSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_LENGTH = 12;
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_ROC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ROC_ZERO_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineRocZeroCrossFinitePoints(
  data: readonly ChartLineRocZeroCrossPoint[] | null | undefined,
): ChartLineRocZeroCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRocZeroCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineRocZeroCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineRocZeroCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

export interface LineRocZeroCrossChannels {
  roc: Array<number | null>;
}

export function computeLineRocZeroCross(
  series: readonly ChartLineRocZeroCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineRocZeroCrossChannels {
  const cleaned = getLineRocZeroCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { roc: [] };
  }
  const length = normalizeLineRocZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ROC_ZERO_CROSS_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const roc: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = length; i < closes.length; i += 1) {
    const cur = closes[i]!;
    const prev = closes[i - length]!;
    if (prev === 0) {
      roc[i] = 0;
    } else {
      roc[i] = posZero(((cur - prev) / Math.abs(prev)) * 100);
    }
  }
  return { roc };
}

export function classifyLineRocZeroCrossRegime(
  roc: number | null,
  threshold: number,
): ChartLineRocZeroCrossRegime {
  if (roc == null) return 'none';
  if (roc >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineRocZeroCrossCrosses(
  series: readonly ChartLineRocZeroCrossPoint[],
  roc: readonly (number | null)[],
  threshold: number,
): ChartLineRocZeroCrossCross[] {
  const out: ChartLineRocZeroCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = roc[i - 1];
    const cur = roc[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineRocZeroCross(
  data: ChartLineRocZeroCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): ChartLineRocZeroCrossRun {
  const cleaned = getLineRocZeroCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineRocZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ROC_ZERO_CROSS_LENGTH,
  );
  const threshold = normalizeLineRocZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_ROC_ZERO_CROSS_THRESHOLD,
  );

  const channels = computeLineRocZeroCross(series, { length });

  const samples: ChartLineRocZeroCrossSample[] = series.map((p, i) => {
    const v = channels.roc[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      roc: v,
      regime: classifyLineRocZeroCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineRocZeroCrossCrosses(
    series,
    channels.roc,
    threshold,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > length + 1;

  return {
    series,
    length,
    threshold,
    rocValues: channels.roc,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineRocZeroCrossLayoutOptions {
  data: ChartLineRocZeroCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineRocZeroCrossLayout(
  opts: ComputeLineRocZeroCrossLayoutOptions,
): ChartLineRocZeroCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ROC_ZERO_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ROC_ZERO_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PANEL_GAP;
  const threshold = normalizeLineRocZeroCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_ROC_ZERO_CROSS_THRESHOLD,
  );

  const run = runLineRocZeroCross(opts.data, {
    length: opts.length ?? undefined,
    threshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const v of run.rocValues) {
    if (v == null) continue;
    if (v < oscMin) oscMin = v;
    if (v > oscMax) oscMax = v;
  }
  if (oscMin > threshold) oscMin = threshold;
  if (oscMax < threshold) oscMax = threshold;
  if (
    !Number.isFinite(oscMin) ||
    !Number.isFinite(oscMax) ||
    oscMin === oscMax
  ) {
    oscMin = threshold - 1;
    oscMax = threshold + 1;
  } else {
    const padPct = 0.1;
    const range = oscMax - oscMin;
    oscMin -= range * padPct;
    oscMax += range * padPct;
  }
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const thresholdY = syOscBase(threshold);

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      oscTop,
      oscBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      rocPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      thresholdY,
      crossMarkers: [],
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);

  let pricePath = '';
  const priceDots: ChartLineRocZeroCrossDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  let rocPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.roc == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.roc);
    rocPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  rocPath = rocPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.rocValues[c.index] ?? threshold);
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
    };
  });

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    rocPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineRocZeroCrossChart(
  data: ChartLineRocZeroCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineRocZeroCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineRocZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ROC_ZERO_CROSS_LENGTH,
  );
  const threshold = normalizeLineRocZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_ROC_ZERO_CROSS_THRESHOLD,
  );
  return (
    `ROC Zero Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, threshold ${threshold}). Top panel ` +
    `renders the close with bullish (momentum baseline cross ` +
    `up) / bearish (cross down) chevron overlays at every ROC ` +
    `zero-line cross; bottom panel renders the close-only ` +
    `Rate of Change line on an auto-fitted oscillator with ` +
    `the zero baseline reference band and marks ROC level ` +
    `${threshold} regime trigger events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineRocZeroCross = forwardRef<
  HTMLDivElement,
  ChartLineRocZeroCrossProps
>(function ChartLineRocZeroCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_LENGTH,
    threshold = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PRICE_COLOR,
    rocColor = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_ROC_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_ROC_ZERO_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRoc = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatPrice = defaultPriceFormatter,
    formatOsc = defaultOscFormatter,
    formatX = defaultXFormatter,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...rest
  } = props;

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cleaned = useMemo(
    () => getLineRocZeroCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineRocZeroCrossLayout({
        data: cleaned,
        length,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, threshold, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineRocZeroCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineRocZeroCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineRocZeroCrossSeriesId,
  ): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLegendClick(seriesId);
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (cleaned.length === 0) {
    return (
      <div
        ref={ref}
        className={className}
        style={style}
        data-section="chart-line-roc-zero-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineRocZeroCrossChart(cleaned, { length, threshold });

  const showPrice = !hidden.has('price');
  const showRocLine = !hidden.has('roc') && showRoc;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, threshold, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'ROC Zero Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-roc-zero-cross"
      data-length={length}
      data-threshold={threshold}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-roc-zero-cross-title"
      >
        {ariaLabel ?? 'ROC Zero Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-roc-zero-cross-aria-desc"
      >
        {desc}
      </span>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={animate ? 'motion-safe:animate-fade-in' : undefined}
        data-section="chart-line-roc-zero-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-roc-zero-cross-grid">
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <line
                  key={`grid-price-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-roc-zero-cross-grid-line-price"
                />
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <line
                  key={`grid-osc-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-roc-zero-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-roc-zero-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-roc-zero-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-roc-zero-cross-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.priceTop}
              x2={layout.innerLeft}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.priceBottom}
              x2={layout.innerRight}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscTop}
              x2={layout.innerLeft}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscBottom}
              x2={layout.innerRight}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <text
                  key={`tick-price-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-roc-zero-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <text
                  key={`tick-osc-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-roc-zero-cross-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-roc-zero-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-roc-zero-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-roc-zero-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showRocLine ? (
          <path
            d={layout.rocPath}
            stroke={rocColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-roc-zero-cross-roc-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-roc-zero-cross-crosses"
            role="group"
            aria-label="cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-roc-zero-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-roc-zero-cross-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-roc-zero-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-roc-zero-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.oscBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-roc-zero-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-roc-zero-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={224}
                  height={118}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-zero-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-zero-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-zero-cross-tooltip-roc"
                >
                  ROC{' '}
                  {tooltipSample.roc == null
                    ? '--'
                    : formatOsc(tooltipSample.roc)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-zero-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-zero-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-zero-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-roc-zero-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-roc-zero-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | threshold {threshold} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-roc-zero-cross-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'close' },
              { id: 'roc' as const, color: rocColor, label: 'ROC' },
            ] satisfies Array<{
              id: ChartLineRocZeroCrossSeriesId;
              color: string;
              label: string;
            }>
          ).map(({ id, color, label }) => (
            <button
              key={id}
              type="button"
              data-series-id={id}
              aria-pressed={!hidden.has(id)}
              onClick={() => handleLegendClick(id)}
              onKeyDown={(e) => handleLegendKey(e, id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 11,
                opacity: hidden.has(id) ? 0.4 : 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: color,
                  borderRadius: 2,
                }}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

ChartLineRocZeroCross.displayName = 'ChartLineRocZeroCross';
