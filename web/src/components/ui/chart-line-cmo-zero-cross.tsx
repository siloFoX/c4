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
 * ChartLineCmoZeroCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Chande Momentum
 * Oscillator (CMO) line in the bottom panel, marking bullish
 * (cross up through zero) / bearish (cross down through zero)
 * momentum baseline regime transition events. Zero-line cross
 * variant of the CMO family that flags the discrete CMO
 * crossing of the zero baseline.
 *
 *   delta[i] = close[i] - close[i-1]
 *   gain[i]  = max(delta, 0)
 *   loss[i]  = max(-delta, 0)
 *   sumGain  = sum gain over length window
 *   sumLoss  = sum loss over length window
 *   cmo[i]   = sumGain + sumLoss > 0
 *                ? (sumGain - sumLoss) / (sumGain + sumLoss) * 100
 *                : 0
 *   bullish  : prev cmo <= 0 && cur cmo > 0   (momentum up)
 *   bearish  : prev cmo >= 0 && cur cmo < 0   (momentum down)
 *
 * Defaults: `length = 14` (canonical CMO window),
 * `threshold = 0` (zero baseline). Regime classifier `bullish`
 * (cmo >= 0), `bearish` (cmo < 0), `none` (cmo null). CMO
 * range is bounded `[-100, +100]`.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: delta = 0 every bar -> gain = loss =
 *   0 -> sumGain + sumLoss = 0 -> cmo = 0 via the 0/0 short-
 *   circuit. cmo = 0 sits on the threshold but the strict-
 *   inequality detector never fires. regime `bullish` (cmo
 *   >= 0). cross count = 0. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: delta = +1 every bar -> sumGain
 *   = length, sumLoss = 0 -> cmo = length / length * 100 =
 *   100 constant. regime `bullish`. 0 crosses (cmo jumps from
 *   null to 100).
 * - **LINEAR DOWN close = -i**: cmo = -100 constant. regime
 *   `bearish`. 0 crosses.
 */

export interface ChartLineCmoZeroCrossPoint {
  x: number;
  close: number;
}

export type ChartLineCmoZeroCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineCmoZeroCrossSeriesId = 'price' | 'cmo';

export type ChartLineCmoZeroCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineCmoZeroCrossCross {
  index: number;
  x: number;
  kind: ChartLineCmoZeroCrossCrossKind;
}

export interface ChartLineCmoZeroCrossSample {
  index: number;
  x: number;
  close: number;
  cmo: number | null;
  regime: ChartLineCmoZeroCrossRegime;
}

export interface ChartLineCmoZeroCrossRun {
  series: ChartLineCmoZeroCrossPoint[];
  length: number;
  threshold: number;
  cmoValues: Array<number | null>;
  samples: ChartLineCmoZeroCrossSample[];
  crosses: ChartLineCmoZeroCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineCmoZeroCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCmoZeroCrossLayout {
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
  priceDots: ChartLineCmoZeroCrossDot[];
  cmoPath: string;
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
    kind: ChartLineCmoZeroCrossCrossKind;
  }>;
  run: ChartLineCmoZeroCrossRun;
}

export interface ChartLineCmoZeroCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCmoZeroCrossPoint[];
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
  cmoColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCmo?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCmoZeroCrossSeriesId[];
  defaultHiddenSeries?: ChartLineCmoZeroCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCmoZeroCrossSeriesId;
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

export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_CMO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineCmoZeroCrossFinitePoints(
  data: readonly ChartLineCmoZeroCrossPoint[] | null | undefined,
): ChartLineCmoZeroCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCmoZeroCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineCmoZeroCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold in [-100, 100]. */
export function normalizeLineCmoZeroCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= -100 && value <= 100) return value;
  return fallback;
}

export interface LineCmoZeroCrossChannels {
  cmo: Array<number | null>;
}

export function computeLineCmoZeroCross(
  series: readonly ChartLineCmoZeroCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineCmoZeroCrossChannels {
  const cleaned = getLineCmoZeroCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { cmo: [] };
  }
  const length = normalizeLineCmoZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const n = closes.length;
  const gain: number[] = new Array(n).fill(0);
  const loss: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const delta = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (delta > 0) gain[i] = delta;
    else if (delta < 0) loss[i] = -delta;
  }

  const cmo: Array<number | null> = new Array(n).fill(null);
  for (let i = length; i < n; i += 1) {
    let sumGain = 0;
    let sumLoss = 0;
    for (let j = i - length + 1; j <= i; j += 1) {
      sumGain += gain[j] ?? 0;
      sumLoss += loss[j] ?? 0;
    }
    const total = sumGain + sumLoss;
    if (total === 0) {
      cmo[i] = 0;
    } else {
      cmo[i] = posZero(((sumGain - sumLoss) / total) * 100);
    }
  }

  return { cmo };
}

export function classifyLineCmoZeroCrossRegime(
  cmo: number | null,
  threshold: number,
): ChartLineCmoZeroCrossRegime {
  if (cmo == null) return 'none';
  if (cmo >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineCmoZeroCrossCrosses(
  series: readonly ChartLineCmoZeroCrossPoint[],
  cmo: readonly (number | null)[],
  threshold: number,
): ChartLineCmoZeroCrossCross[] {
  const out: ChartLineCmoZeroCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = cmo[i - 1];
    const cur = cmo[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineCmoZeroCross(
  data: ChartLineCmoZeroCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): ChartLineCmoZeroCrossRun {
  const cleaned = getLineCmoZeroCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineCmoZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_LENGTH,
  );
  const threshold = normalizeLineCmoZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_THRESHOLD,
  );

  const channels = computeLineCmoZeroCross(series, { length });

  const samples: ChartLineCmoZeroCrossSample[] = series.map((p, i) => {
    const v = channels.cmo[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      cmo: v,
      regime: classifyLineCmoZeroCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineCmoZeroCrossCrosses(
    series,
    channels.cmo,
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
    cmoValues: channels.cmo,
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

export interface ComputeLineCmoZeroCrossLayoutOptions {
  data: ChartLineCmoZeroCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineCmoZeroCrossLayout(
  opts: ComputeLineCmoZeroCrossLayoutOptions,
): ChartLineCmoZeroCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_CMO_ZERO_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_CMO_ZERO_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_CMO_ZERO_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_CMO_ZERO_CROSS_PANEL_GAP;
  const threshold = normalizeLineCmoZeroCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_THRESHOLD,
  );

  const run = runLineCmoZeroCross(opts.data, {
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

  const oscMin = -100;
  const oscMax = 100;
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
      cmoPath: '',
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
  const priceDots: ChartLineCmoZeroCrossDot[] = [];
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

  let cmoPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.cmo == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.cmo);
    cmoPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  cmoPath = cmoPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.cmoValues[c.index] ?? threshold);
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
    cmoPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineCmoZeroCrossChart(
  data: ChartLineCmoZeroCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineCmoZeroCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineCmoZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_LENGTH,
  );
  const threshold = normalizeLineCmoZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_THRESHOLD,
  );
  return (
    `CMO Zero Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, threshold ${threshold}). Top panel ` +
    `renders the close with bullish (momentum baseline cross ` +
    `up) / bearish (cross down) chevron overlays at every ` +
    `Chande Momentum Oscillator zero-line cross; bottom panel ` +
    `renders the close-only CMO line on a fixed -100 to 100 ` +
    `oscillator with the zero baseline reference band and ` +
    `marks CMO level ${threshold} regime trigger events.`
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

export const ChartLineCmoZeroCross = forwardRef<
  HTMLDivElement,
  ChartLineCmoZeroCrossProps
>(function ChartLineCmoZeroCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_LENGTH,
    threshold = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_PRICE_COLOR,
    cmoColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_CMO_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCmo = true,
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
    () => getLineCmoZeroCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineCmoZeroCrossLayout({
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
    ChartLineCmoZeroCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineCmoZeroCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineCmoZeroCrossSeriesId,
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
        data-section="chart-line-cmo-zero-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineCmoZeroCrossChart(cleaned, { length, threshold });

  const showPrice = !hidden.has('price');
  const showCmoLine = !hidden.has('cmo') && showCmo;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [-100, threshold, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'CMO Zero Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-cmo-zero-cross"
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
        data-section="chart-line-cmo-zero-cross-title"
      >
        {ariaLabel ?? 'CMO Zero Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-cmo-zero-cross-aria-desc"
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
        data-section="chart-line-cmo-zero-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-cmo-zero-cross-grid">
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
                  data-section="chart-line-cmo-zero-cross-grid-line-price"
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
                  data-section="chart-line-cmo-zero-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-cmo-zero-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-cmo-zero-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-cmo-zero-cross-axes">
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
                  data-section="chart-line-cmo-zero-cross-tick-price"
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
                  data-section="chart-line-cmo-zero-cross-tick-osc"
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
            data-section="chart-line-cmo-zero-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-cmo-zero-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-cmo-zero-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCmoLine ? (
          <path
            d={layout.cmoPath}
            stroke={cmoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cmo-zero-cross-cmo-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-cmo-zero-cross-crosses"
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
                data-section={`chart-line-cmo-zero-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-cmo-zero-cross-overlay-crosses"
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
                data-section={`chart-line-cmo-zero-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-cmo-zero-cross-hover-targets">
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
                data-section="chart-line-cmo-zero-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-cmo-zero-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={220}
                  height={118}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-tooltip-cmo"
                >
                  CMO{' '}
                  {tooltipSample.cmo == null
                    ? '--'
                    : formatOsc(tooltipSample.cmo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-tooltip-crosses"
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
          data-section="chart-line-cmo-zero-cross-badge"
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
          data-section="chart-line-cmo-zero-cross-legend"
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
              { id: 'cmo' as const, color: cmoColor, label: 'CMO' },
            ] satisfies Array<{
              id: ChartLineCmoZeroCrossSeriesId;
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

ChartLineCmoZeroCross.displayName = 'ChartLineCmoZeroCross';
