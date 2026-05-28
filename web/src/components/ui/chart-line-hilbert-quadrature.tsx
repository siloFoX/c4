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
 * ChartLineHilbertQuadrature -- pure-SVG dual-panel chart with the
 * close on top and the Hilbert Transform Quadrature component on the
 * bottom. The quadrature is computed by FIR-detrending the close
 * (subtracting the equal-weight SMA of length `length`) and shifting
 * the result by the quarter-cycle delay `floor(length / 4)`:
 *
 *   sma[i]       = mean(close[i - length + 1 .. i])
 *   detrend[i]   = close[i] - sma[i]
 *   quad[i]      = detrend[i - shift]   where shift = floor(length/4)
 *
 * `quad[i]` is `null` during the combined warmup
 * (`i < length - 1 + shift`) and propagates `null` from any null
 * detrend slot. Output is unbounded; the axis auto-fits but always
 * includes `0`.
 *
 * Bit-exact anchors:
 * - **CONST close=K**: `sma = K` so `detrend = 0` so `quad = 0`.
 * - **LINEAR UP** (`close[i] = i + 1`): `detrend = (length - 1) / 2`
 *   (dyadic for any L; exact in IEEE 754), `quad = detrend`.
 * - **LINEAR DOWN** (`close[i] = N - i`): `detrend = -(length-1)/2`,
 *   `quad = -detrend`.
 *
 * All three anchors hold across sweeps of `(K, length)` because the
 * SMA of consecutive integers reduces to a closed-form linear
 * expression in `i`, and the close-minus-sma difference cancels the
 * `i` terms exactly.
 */

export interface ChartLineHilbertQuadraturePoint {
  x: number;
  close: number;
}

export type ChartLineHilbertQuadratureZone =
  | 'positive'
  | 'negative'
  | 'neutral'
  | 'none';

export type ChartLineHilbertQuadratureCross = 'up' | 'down' | null;

export type ChartLineHilbertQuadratureSeriesId = 'price' | 'quadrature';

export interface ChartLineHilbertQuadratureSample {
  index: number;
  x: number;
  close: number;
  sma: number | null;
  detrend: number | null;
  quadrature: number | null;
  zone: ChartLineHilbertQuadratureZone;
  crossed: ChartLineHilbertQuadratureCross;
}

export interface ChartLineHilbertQuadratureRun {
  series: ChartLineHilbertQuadraturePoint[];
  length: number;
  shift: number;
  threshold: number;
  smaValues: Array<number | null>;
  detrendValues: Array<number | null>;
  quadratureValues: Array<number | null>;
  samples: ChartLineHilbertQuadratureSample[];
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineHilbertQuadratureMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  quadrature: number;
  crossed: 'up' | 'down';
}

export interface ChartLineHilbertQuadratureDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHilbertQuadratureLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  quadTop: number;
  quadBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineHilbertQuadratureDot[];
  quadraturePath: string;
  zeroY: number;
  positiveY: number;
  negativeY: number;
  markers: ChartLineHilbertQuadratureMarker[];
  priceMin: number;
  priceMax: number;
  quadMin: number;
  quadMax: number;
  run: ChartLineHilbertQuadratureRun;
}

export interface ChartLineHilbertQuadratureProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHilbertQuadraturePoint[];
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
  quadratureColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showQuadrature?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHilbertQuadratureSeriesId[];
  defaultHiddenSeries?: ChartLineHilbertQuadratureSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHilbertQuadratureSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineHilbertQuadratureSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatQuadrature?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_WIDTH = 720;
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_PADDING = 44;
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_LENGTH = 20;
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_QUAD_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HILBERT_QUADRATURE_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineHilbertQuadratureFinitePoints(
  data: readonly ChartLineHilbertQuadraturePoint[] | null | undefined,
): ChartLineHilbertQuadraturePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHilbertQuadraturePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 4 -- needed for shift >= 1). */
export function normalizeLineHilbertQuadratureLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 4) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative threshold value. */
export function normalizeLineHilbertQuadratureThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

/** Quarter-cycle delay derived from length. */
export function getLineHilbertQuadratureShift(length: number): number {
  return Math.max(1, Math.floor(length / 4));
}

/** Rolling SMA (nulls in window short-circuit to null). */
export function applyLineHilbertQuadratureSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? posZero(sum / length) : null);
  }
  return out;
}

/** close[i] - sma[i] with null propagation. */
export function applyLineHilbertQuadratureDetrend(
  closes: readonly number[],
  sma: readonly (number | null)[],
): Array<number | null> {
  const out: Array<number | null> = [];
  const n = Math.min(closes.length, sma.length);
  for (let i = 0; i < n; i += 1) {
    const c = closes[i];
    const s = sma[i];
    if (s == null || !isFiniteNumber(c)) {
      out.push(null);
      continue;
    }
    out.push(posZero(c - s));
  }
  return out;
}

/** Shift values back by N (out[i] = values[i - shift]; nulls before). */
export function applyLineHilbertQuadratureShift(
  values: readonly (number | null)[],
  shift: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < shift) {
      out.push(null);
      continue;
    }
    const v = values[i - shift];
    out.push(v == null ? null : v);
  }
  return out;
}

export interface LineHilbertQuadratureChannels {
  sma: Array<number | null>;
  detrend: Array<number | null>;
  quadrature: Array<number | null>;
}

/** Compute the full quadrature pipeline. */
export function computeLineHilbertQuadrature(
  series: readonly ChartLineHilbertQuadraturePoint[] | null | undefined,
  options: { length?: number } = {},
): LineHilbertQuadratureChannels {
  const cleaned = getLineHilbertQuadratureFinitePoints(series);
  if (cleaned.length === 0) {
    return { sma: [], detrend: [], quadrature: [] };
  }
  const length = normalizeLineHilbertQuadratureLength(
    options.length,
    DEFAULT_CHART_LINE_HILBERT_QUADRATURE_LENGTH,
  );
  const shift = getLineHilbertQuadratureShift(length);
  const closes = cleaned.map((p) => p.close);
  const sma = applyLineHilbertQuadratureSma(closes, length);
  const detrend = applyLineHilbertQuadratureDetrend(closes, sma);
  const quadrature = applyLineHilbertQuadratureShift(detrend, shift);
  return { sma, detrend, quadrature };
}

/** Classify a quadrature value relative to the zero threshold. */
export function classifyLineHilbertQuadratureZone(
  value: number | null,
  threshold: number,
): ChartLineHilbertQuadratureZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > threshold) return 'positive';
  if (value < -threshold) return 'negative';
  return 'neutral';
}

/** Detect zero-line crossings between adjacent defined quadrature samples. */
export function detectLineHilbertQuadratureCrosses(
  values: readonly (number | null)[],
  threshold: number,
): ChartLineHilbertQuadratureCross[] {
  const out: ChartLineHilbertQuadratureCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev <= threshold && v > threshold) {
      out.push('up');
    } else if (prev >= -threshold && v < -threshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline with sample objects. */
export function runLineHilbertQuadrature(
  data: ChartLineHilbertQuadraturePoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): ChartLineHilbertQuadratureRun {
  const cleaned = getLineHilbertQuadratureFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineHilbertQuadratureLength(
    options.length,
    DEFAULT_CHART_LINE_HILBERT_QUADRATURE_LENGTH,
  );
  const threshold = normalizeLineHilbertQuadratureThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_HILBERT_QUADRATURE_THRESHOLD,
  );
  const shift = getLineHilbertQuadratureShift(length);

  const channels = computeLineHilbertQuadrature(series, { length });
  const crosses = detectLineHilbertQuadratureCrosses(
    channels.quadrature,
    threshold,
  );

  const samples: ChartLineHilbertQuadratureSample[] = series.map((p, i) => {
    const sma = channels.sma[i] ?? null;
    const detrend = channels.detrend[i] ?? null;
    const quadrature = channels.quadrature[i] ?? null;
    const zone = classifyLineHilbertQuadratureZone(quadrature, threshold);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      sma,
      detrend,
      quadrature,
      zone,
      crossed,
    };
  });

  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'positive') positiveCount += 1;
    else if (s.zone === 'negative') negativeCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length >= length + shift;

  return {
    series = [],
    length,
    shift,
    threshold,
    smaValues: channels.sma,
    detrendValues: channels.detrend,
    quadratureValues: channels.quadrature,
    samples,
    positiveCount,
    negativeCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineHilbertQuadratureLayoutOptions {
  data: ChartLineHilbertQuadraturePoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineHilbertQuadratureLayout(
  opts: ComputeLineHilbertQuadratureLayoutOptions,
): ChartLineHilbertQuadratureLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_HILBERT_QUADRATURE_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_HILBERT_QUADRATURE_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_HILBERT_QUADRATURE_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_HILBERT_QUADRATURE_PANEL_GAP;

  const run = runLineHilbertQuadrature(opts.data, {
    length: opts.length ?? undefined,
    threshold: opts.threshold ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const quadTop = priceBottom + panelGap;
  const quadBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      quadTop,
      quadBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      quadraturePath: '',
      zeroY: (quadTop + quadBottom) / 2,
      positiveY: quadTop,
      negativeY: quadBottom,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      quadMin: 0,
      quadMax: 0,
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

  let quadMin = Infinity;
  let quadMax = -Infinity;
  for (const s of run.samples) {
    if (s.quadrature == null) continue;
    if (s.quadrature < quadMin) quadMin = s.quadrature;
    if (s.quadrature > quadMax) quadMax = s.quadrature;
  }
  if (!Number.isFinite(quadMin) || !Number.isFinite(quadMax)) {
    quadMin = -1;
    quadMax = 1;
  }
  if (quadMin > 0) quadMin = 0;
  if (quadMax < 0) quadMax = 0;
  if (quadMin === quadMax) {
    quadMin -= 1;
    quadMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom - ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syQuad = (y: number): number =>
    quadBottom - ((y - quadMin) / (quadMax - quadMin)) * (quadBottom - quadTop);

  let pricePath = '';
  const priceDots: ChartLineHilbertQuadratureDot[] = [];
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

  let quadraturePath = '';
  let firstQ = true;
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s || s.quadrature == null) {
      firstQ = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syQuad(s.quadrature);
    quadraturePath += `${firstQ ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstQ = false;
  }

  const markers: ChartLineHilbertQuadratureMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.quadrature == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syQuad(s.quadrature),
      close: s.close,
      quadrature: s.quadrature,
      crossed: s.crossed,
    });
  }

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    quadTop,
    quadBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    quadraturePath: quadraturePath.trim(),
    zeroY: syQuad(0),
    positiveY: syQuad(run.threshold),
    negativeY: syQuad(-run.threshold),
    markers,
    priceMin,
    priceMax,
    quadMin,
    quadMax,
    run,
  };
}

export function describeLineHilbertQuadratureChart(
  data: ChartLineHilbertQuadraturePoint[],
  options: { length?: number; threshold?: number } = {},
): string {
  const cleaned = getLineHilbertQuadratureFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineHilbertQuadratureLength(
    options.length,
    DEFAULT_CHART_LINE_HILBERT_QUADRATURE_LENGTH,
  );
  const threshold = normalizeLineHilbertQuadratureThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_HILBERT_QUADRATURE_THRESHOLD,
  );
  const shift = getLineHilbertQuadratureShift(length);
  return (
    `Hilbert Quadrature chart over ${cleaned.length} bars ` +
    `(length ${length}, shift ${shift}, threshold ${threshold}). ` +
    `Top panel renders the close; bottom panel renders the ` +
    `FIR-detrended close shifted by the quarter-cycle delay.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value);
const defaultQuadFormatter = (value: number): string =>
  formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineHilbertQuadrature = forwardRef<
  HTMLDivElement,
  ChartLineHilbertQuadratureProps
>(function ChartLineHilbertQuadrature(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_LENGTH,
    threshold = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_THRESHOLD,
    width = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_WIDTH,
    height = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_HEIGHT,
    padding = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_PADDING,
    panelGap = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_PRICE_COLOR,
    quadratureColor = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_QUAD_COLOR,
    bullishColor = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HILBERT_QUADRATURE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showQuadrature = true,
    showMarkers = true,
    showThresholds = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultPriceFormatter,
    formatQuadrature = defaultQuadFormatter,
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
    () => getLineHilbertQuadratureFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineHilbertQuadratureLayout({
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
    ChartLineHilbertQuadratureSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineHilbertQuadratureSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineHilbertQuadratureSeriesId,
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
        data-section="chart-line-hilbert-quadrature-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineHilbertQuadratureChart(cleaned, {
      length,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showQuad = !hidden.has('quadrature') && showQuadrature;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickQuadValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickQuadValues.push(
      layout.quadMin + ((layout.quadMax - layout.quadMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Hilbert Quadrature chart'}
      aria-describedby={descId}
      data-section="chart-line-hilbert-quadrature"
      data-length={length}
      data-threshold={threshold}
      data-shift={layout.run.shift}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-hilbert-quadrature-title"
      >
        {ariaLabel ?? 'Hilbert Quadrature chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-hilbert-quadrature-aria-desc"
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
        data-section="chart-line-hilbert-quadrature-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-hilbert-quadrature-grid">
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
                  data-section="chart-line-hilbert-quadrature-grid-line-price"
                />
              );
            })}
            {tickQuadValues.map((v, i) => {
              const y =
                layout.quadBottom -
                ((v - layout.quadMin) /
                  (layout.quadMax - layout.quadMin)) *
                  (layout.quadBottom - layout.quadTop);
              return (
                <line
                  key={`grid-quad-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-hilbert-quadrature-grid-line-quad"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-hilbert-quadrature-axes">
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
              y1={layout.quadTop}
              x2={layout.innerLeft}
              y2={layout.quadBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.quadBottom}
              x2={layout.innerRight}
              y2={layout.quadBottom}
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
                  data-section="chart-line-hilbert-quadrature-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickQuadValues.map((v, i) => {
              const y =
                layout.quadBottom -
                ((v - layout.quadMin) /
                  (layout.quadMax - layout.quadMin)) *
                  (layout.quadBottom - layout.quadTop);
              return (
                <text
                  key={`tick-quad-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-hilbert-quadrature-tick-quad"
                >
                  {formatQuadrature(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-hilbert-quadrature-zero-line"
          />
        ) : null}

        {showThresholds && threshold > 0 ? (
          <g data-section="chart-line-hilbert-quadrature-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.positiveY}
              x2={layout.innerRight}
              y2={layout.positiveY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-hilbert-quadrature-positive-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.negativeY}
              x2={layout.innerRight}
              y2={layout.negativeY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-hilbert-quadrature-negative-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hilbert-quadrature-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-hilbert-quadrature-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-hilbert-quadrature-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showQuad ? (
          <path
            d={layout.quadraturePath}
            stroke={quadratureColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hilbert-quadrature-line"
          />
        ) : null}

        {showMarkers && showQuad ? (
          <g data-section="chart-line-hilbert-quadrature-markers">
            {layout.markers.map((m) => (
              <circle
                key={`hq-marker-${m.index}`}
                cx={m.cx}
                cy={m.cy}
                r={dotRadius + 2}
                fill={m.crossed === 'up' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onPointClick?.({ point: sample });
                }}
                data-section="chart-line-hilbert-quadrature-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-hilbert-quadrature-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.quadBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-hilbert-quadrature-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-hilbert-quadrature-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={170}
                  height={108}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hilbert-quadrature-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hilbert-quadrature-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hilbert-quadrature-tooltip-sma"
                >
                  sma{' '}
                  {tooltipSample.sma == null
                    ? '--'
                    : formatPrice(tooltipSample.sma)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hilbert-quadrature-tooltip-detrend"
                >
                  detrend{' '}
                  {tooltipSample.detrend == null
                    ? '--'
                    : formatQuadrature(tooltipSample.detrend)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hilbert-quadrature-tooltip-quadrature"
                >
                  quadrature{' '}
                  {tooltipSample.quadrature == null
                    ? '--'
                    : formatQuadrature(tooltipSample.quadrature)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hilbert-quadrature-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hilbert-quadrature-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-hilbert-quadrature-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | shift {layout.run.shift} | threshold{' '}
          {threshold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-hilbert-quadrature-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            data-series-id="price"
            aria-pressed={!hidden.has('price')}
            onClick={() => handleLegendClick('price')}
            onKeyDown={(e) => handleLegendKey(e, 'price')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('price') ? 0.4 : 1,
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
                background: priceColor,
                borderRadius: 2,
              }}
            />
            close
          </button>
          <button
            type="button"
            data-series-id="quadrature"
            aria-pressed={!hidden.has('quadrature')}
            onClick={() => handleLegendClick('quadrature')}
            onKeyDown={(e) => handleLegendKey(e, 'quadrature')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('quadrature') ? 0.4 : 1,
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
                background: quadratureColor,
                borderRadius: 2,
              }}
            />
            quadrature
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHilbertQuadrature.displayName = 'ChartLineHilbertQuadrature';
