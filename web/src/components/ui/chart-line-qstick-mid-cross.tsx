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
 * ChartLineQstickMidCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the body-only QStick line in the
 * bottom panel, marking bullish (cross up through the 0 midline)
 * / bearish (cross down through 0) candle body momentum
 * centerline regime transitions with bias coloring. Midline-cross
 * variant of the Tushar Chande QStick family that flags the
 * discrete QStick crossing of the 0 centerline.
 *
 * QStick is the simple moving average of the candle body
 * (`close - open`) over a fixed window. A positive QStick means
 * bullish bodies are dominating the window; a negative QStick
 * means bearish bodies dominate. Centerline crossovers mark the
 * regime transition from one body-momentum bias to the other --
 * a sharper signal than a single candle close because it filters
 * short-term body noise.
 *
 *   body_i    = close_i - open_i
 *   qstick_i  = SMA(body, length) at i (i >= length - 1)
 *   bullish   : prev qs <= 0 && cur qs > 0  (bodies turn green)
 *   bearish   : prev qs >= 0 && cur qs < 0  (bodies turn red)
 *
 * Defaults: `length = 14` (Chande's canonical window),
 * `threshold = 0` (midline / centerline). Regime classifier
 * `bullish` (qstick >= 0), `bearish` (qstick < 0), `none`
 * (qstick null). Cross markers + price-panel chevrons inherit
 * the bullish / bearish bias coloring so the regime is visually
 * obvious at the crossover bar.
 *
 * Bit-exact anchor:
 *
 * - **CONST open = close = K**: body = 0 every bar, so qstick =
 *   0 from `i = length - 1`. qstick = 0 sits on the threshold but
 *   the strict-inequality detector never fires. regime `bullish`
 *   (qstick >= 0). cross count = 0. Verified across K = 0..1234.
 * - **CONST body = +B (open = i, close = i + B)**: body = B every
 *   bar, qstick = B constant. regime `bullish` when B > 0,
 *   `bearish` when B < 0. 0 crosses.
 * - **Sign-flipping bodies (-B then +B)**: qstick transitions
 *   from -B to +B through zero over the smoothing window, firing
 *   exactly one bullish cross.
 */

export interface ChartLineQstickMidCrossPoint {
  x: number;
  open: number;
  close: number;
}

export type ChartLineQstickMidCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineQstickMidCrossSeriesId = 'price' | 'qstick';

export type ChartLineQstickMidCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineQstickMidCrossCross {
  index: number;
  x: number;
  kind: ChartLineQstickMidCrossCrossKind;
}

export interface ChartLineQstickMidCrossSample {
  index: number;
  x: number;
  open: number;
  close: number;
  body: number;
  qstick: number | null;
  regime: ChartLineQstickMidCrossRegime;
}

export interface ChartLineQstickMidCrossRun {
  series: ChartLineQstickMidCrossPoint[];
  length: number;
  threshold: number;
  bodyValues: number[];
  qstickValues: Array<number | null>;
  samples: ChartLineQstickMidCrossSample[];
  crosses: ChartLineQstickMidCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineQstickMidCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineQstickMidCrossLayout {
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
  priceDots: ChartLineQstickMidCrossDot[];
  qstickPath: string;
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
    kind: ChartLineQstickMidCrossCrossKind;
  }>;
  run: ChartLineQstickMidCrossRun;
}

export interface ChartLineQstickMidCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineQstickMidCrossPoint[];
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
  qstickColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showQstick?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineQstickMidCrossSeriesId[];
  defaultHiddenSeries?: ChartLineQstickMidCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineQstickMidCrossSeriesId;
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

export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_QSTICK_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_QSTICK_MID_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / open / close. */
export function getLineQstickMidCrossFinitePoints(
  data: readonly ChartLineQstickMidCrossPoint[] | null | undefined,
): ChartLineQstickMidCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineQstickMidCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.open) &&
      isFiniteNumber(point.close)
    ) {
      out.push({ x: point.x, open: point.open, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineQstickMidCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineQstickMidCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineQstickMidCrossSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(sum / length);
  }
  return out;
}

export interface LineQstickMidCrossChannels {
  body: number[];
  qstick: Array<number | null>;
  length: number;
}

export function computeLineQstickMidCross(
  series: readonly ChartLineQstickMidCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineQstickMidCrossChannels {
  const cleaned = getLineQstickMidCrossFinitePoints(series);
  const length = normalizeLineQstickMidCrossLength(
    options.length,
    DEFAULT_CHART_LINE_QSTICK_MID_CROSS_LENGTH,
  );
  if (cleaned.length === 0) {
    return { body: [], qstick: [], length };
  }
  const body: number[] = cleaned.map((p) => posZero(p.close - p.open));
  const qstick = applyLineQstickMidCrossSma(body, length);
  return { body, qstick, length };
}

export function classifyLineQstickMidCrossRegime(
  qstick: number | null,
  threshold: number,
): ChartLineQstickMidCrossRegime {
  if (qstick == null) return 'none';
  if (qstick >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineQstickMidCrossCrosses(
  series: readonly ChartLineQstickMidCrossPoint[],
  qstick: readonly (number | null)[],
  threshold: number,
): ChartLineQstickMidCrossCross[] {
  const out: ChartLineQstickMidCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = qstick[i - 1];
    const cur = qstick[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineQstickMidCross(
  data: ChartLineQstickMidCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): ChartLineQstickMidCrossRun {
  const cleaned = getLineQstickMidCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineQstickMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_QSTICK_MID_CROSS_THRESHOLD,
  );
  const channels = computeLineQstickMidCross(series, {
    length: options.length ?? undefined,
  });

  const samples: ChartLineQstickMidCrossSample[] = series.map((p, i) => {
    const v = channels.qstick[i] ?? null;
    return {
      index: i,
      x: p.x,
      open: p.open,
      close: p.close,
      body: channels.body[i] ?? 0,
      qstick: v,
      regime: classifyLineQstickMidCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineQstickMidCrossCrosses(
    series,
    channels.qstick,
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

  const ok = series.length > channels.length;

  return {
    series,
    length: channels.length,
    threshold,
    bodyValues: channels.body,
    qstickValues: channels.qstick,
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

export interface ComputeLineQstickMidCrossLayoutOptions {
  data: ChartLineQstickMidCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineQstickMidCrossLayout(
  opts: ComputeLineQstickMidCrossLayoutOptions,
): ChartLineQstickMidCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_QSTICK_MID_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_QSTICK_MID_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PANEL_GAP;
  const threshold = normalizeLineQstickMidCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_QSTICK_MID_CROSS_THRESHOLD,
  );

  const run = runLineQstickMidCross(opts.data, {
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
  for (const v of run.qstickValues) {
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
      qstickPath: '',
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
  const priceDots: ChartLineQstickMidCrossDot[] = [];
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

  let qstickPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.qstick == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.qstick);
    qstickPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  qstickPath = qstickPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.qstickValues[c.index] ?? threshold);
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
    qstickPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineQstickMidCrossChart(
  data: ChartLineQstickMidCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineQstickMidCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineQstickMidCrossLength(
    options.length,
    DEFAULT_CHART_LINE_QSTICK_MID_CROSS_LENGTH,
  );
  const threshold = normalizeLineQstickMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_QSTICK_MID_CROSS_THRESHOLD,
  );
  return (
    `QStick Mid Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, threshold ${threshold}). Top panel ` +
    `renders the close with bullish (candle body momentum ` +
    `centerline cross up) / bearish (cross down) chevron ` +
    `overlays at every QStick midline cross with bias coloring; ` +
    `bottom panel renders the body-only QStick line (SMA of ` +
    `close minus open) on an auto-fitted oscillator with the ` +
    `centerline ${threshold} reference band and marks QStick ` +
    `level ${threshold} centerline regime transition events.`
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

export const ChartLineQstickMidCross = forwardRef<
  HTMLDivElement,
  ChartLineQstickMidCrossProps
>(function ChartLineQstickMidCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_LENGTH,
    threshold = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PRICE_COLOR,
    qstickColor = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_QSTICK_COLOR,
    bullishColor = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_QSTICK_MID_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showQstick = true,
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
    () => getLineQstickMidCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineQstickMidCrossLayout({
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
    ChartLineQstickMidCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineQstickMidCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineQstickMidCrossSeriesId,
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
        data-section="chart-line-qstick-mid-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineQstickMidCrossChart(cleaned, { length, threshold });

  const showPrice = !hidden.has('price');
  const showQstickLine = !hidden.has('qstick') && showQstick;

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
      aria-label={ariaLabel ?? 'QStick Mid Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-qstick-mid-cross"
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
        data-section="chart-line-qstick-mid-cross-title"
      >
        {ariaLabel ?? 'QStick Mid Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-qstick-mid-cross-aria-desc"
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
        data-section="chart-line-qstick-mid-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-qstick-mid-cross-grid">
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
                  data-section="chart-line-qstick-mid-cross-grid-line-price"
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
                  data-section="chart-line-qstick-mid-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-qstick-mid-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-qstick-mid-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-qstick-mid-cross-axes">
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
                  data-section="chart-line-qstick-mid-cross-tick-price"
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
                  data-section="chart-line-qstick-mid-cross-tick-osc"
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
            data-section="chart-line-qstick-mid-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-qstick-mid-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-qstick-mid-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showQstickLine ? (
          <path
            d={layout.qstickPath}
            stroke={qstickColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-qstick-mid-cross-qstick-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-qstick-mid-cross-crosses"
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
                data-section={`chart-line-qstick-mid-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-qstick-mid-cross-overlay-crosses"
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
                data-section={`chart-line-qstick-mid-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-qstick-mid-cross-hover-targets">
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
                data-section="chart-line-qstick-mid-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-qstick-mid-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={244}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-qstick-mid-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-qstick-mid-cross-tooltip-open"
                >
                  open {formatPrice(tooltipSample.open)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-qstick-mid-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-qstick-mid-cross-tooltip-body"
                >
                  body {formatPrice(tooltipSample.body)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-qstick-mid-cross-tooltip-qstick"
                >
                  QStick{' '}
                  {tooltipSample.qstick == null
                    ? '--'
                    : formatOsc(tooltipSample.qstick)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-qstick-mid-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-qstick-mid-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-qstick-mid-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-qstick-mid-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length} | length{' '}
                  {layout.run.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-qstick-mid-cross-badge"
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
          data-section="chart-line-qstick-mid-cross-legend"
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
              { id: 'qstick' as const, color: qstickColor, label: 'QStick' },
            ] satisfies Array<{
              id: ChartLineQstickMidCrossSeriesId;
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

ChartLineQstickMidCross.displayName = 'ChartLineQstickMidCross';
