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
 * ChartLineMomentumDivergence -- pure-SVG dual-panel chart with the
 * close on the top panel and a Momentum Divergence oscillator on the
 * bottom panel. The divergence highlights when the close's percent
 * change diverges from its absolute change across the lookback:
 *
 *   ROC[i]        = (close[i] - close[i - length]) / close[i - length] * 100
 *   momentum[i]   = close[i] - close[i - length]
 *   divergence[i] = ROC[i] - momentum[i]
 *
 * Defaults: `length = 14`. Bars before `i = length` are warmup nulls;
 * `close[i - length] === 0` causes ROC (and the divergence) to be
 * `null`.
 *
 * Bit-exact anchor: **CONST close** (`close = K`, `K != 0`):
 * `ROC = 0` and `momentum = 0` at every valid bar, so the divergence
 * collapses to `0 - 0 = 0`. Verified across `K in {1, 5, 100, -3}`
 * and `length in {3, 4, 7, 10}` in the integration sweep.
 *
 * Additional bit-exact anchor: **GEOMETRIC close** (`close[k] = 2^k`).
 * For every `L`, `ROC(L)[i] = (2^L - 1) * 100` and
 * `momentum(L)[i] = 2^(i - L) * (2^L - 1)`, so
 * `divergence[i] = (2^L - 1) * (100 - 2^(i - L))` -- a positive
 * integer for small `i` that flips sign once `2^(i - L)` exceeds 100.
 * Tested explicitly at `i = L` (close[i - L] = 1) and `i = L + 1`
 * (close[i - L] = 2) for `L = 4`.
 */

export interface ChartLineMomentumDivergencePoint {
  x: number;
  close: number;
}

export type ChartLineMomentumDivergenceZone =
  | 'positive'
  | 'negative'
  | 'zero'
  | 'none';

export type ChartLineMomentumDivergenceCross = 'up' | 'down' | null;

export type ChartLineMomentumDivergenceSeriesId = 'price' | 'divergence';

export interface ChartLineMomentumDivergenceSample {
  index: number;
  x: number;
  close: number;
  roc: number | null;
  momentum: number | null;
  divergence: number | null;
  zone: ChartLineMomentumDivergenceZone;
  crossed: ChartLineMomentumDivergenceCross;
}

export interface ChartLineMomentumDivergenceRun {
  series: ChartLineMomentumDivergencePoint[];
  length: number;
  rocValues: Array<number | null>;
  momentumValues: Array<number | null>;
  divergenceValues: Array<number | null>;
  samples: ChartLineMomentumDivergenceSample[];
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineMomentumDivergenceMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  divergence: number;
  crossed: 'up' | 'down';
}

export interface ChartLineMomentumDivergenceDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMomentumDivergenceLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  divergenceTop: number;
  divergenceBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineMomentumDivergenceDot[];
  divergencePath: string;
  zeroLineY: number;
  markers: ChartLineMomentumDivergenceMarker[];
  priceMin: number;
  priceMax: number;
  divergenceMin: number;
  divergenceMax: number;
  run: ChartLineMomentumDivergenceRun;
}

export interface ChartLineMomentumDivergenceProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMomentumDivergencePoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  divergenceColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroLineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDivergence?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMomentumDivergenceSeriesId[];
  defaultHiddenSeries?: ChartLineMomentumDivergenceSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMomentumDivergenceSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineMomentumDivergenceSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatDivergence?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_WIDTH = 720;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_PADDING = 44;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_LENGTH = 14;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_DIVERGENCE_COLOR =
  '#06b6d4';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_ZERO_LINE_COLOR =
  '#475569';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineMomentumDivergenceFinitePoints(
  data: readonly ChartLineMomentumDivergencePoint[] | null | undefined,
): ChartLineMomentumDivergencePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMomentumDivergencePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineMomentumDivergenceLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Rate of change in percent over a lookback period. */
export function applyLineMomentumDivergenceROC(
  closes: readonly (number | null)[],
  period: number,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < period) {
      out.push(null);
      continue;
    }
    const c = closes[i];
    const cPast = closes[i - period];
    if (
      c == null ||
      cPast == null ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(cPast) ||
      cPast === 0
    ) {
      out.push(null);
      continue;
    }
    const raw = ((c - cPast) / cPast) * 100;
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

/** Absolute momentum: close[i] - close[i - period]. */
export function applyLineMomentumDivergenceMomentum(
  closes: readonly (number | null)[],
  period: number,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < period) {
      out.push(null);
      continue;
    }
    const c = closes[i];
    const cPast = closes[i - period];
    if (
      c == null ||
      cPast == null ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(cPast)
    ) {
      out.push(null);
      continue;
    }
    const raw = c - cPast;
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

export interface ChartLineMomentumDivergenceOptions {
  length?: number;
}

export interface ChartLineMomentumDivergenceChannels {
  roc: Array<number | null>;
  momentum: Array<number | null>;
  divergence: Array<number | null>;
}

/** Compute the divergence pipeline. */
export function computeLineMomentumDivergence(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineMomentumDivergenceOptions = {},
): ChartLineMomentumDivergenceChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { roc: [], momentum: [], divergence: [] };
  }
  const length = normalizeLineMomentumDivergenceLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_LENGTH,
  );
  const roc = applyLineMomentumDivergenceROC(closes, length);
  const momentum = applyLineMomentumDivergenceMomentum(closes, length);
  const divergence: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const r = roc[i];
    const m = momentum[i];
    if (r == null || m == null || !isFiniteNumber(r) || !isFiniteNumber(m)) {
      divergence.push(null);
    } else {
      const raw = r - m;
      divergence.push(raw === 0 ? 0 : raw);
    }
  }
  return { roc, momentum, divergence };
}

/** Classify a divergence reading. */
export function classifyLineMomentumDivergenceZone(
  value: number | null,
): ChartLineMomentumDivergenceZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}

/**
 * Detect zero-line crosses across a divergence sequence. A bar
 * transitions `'up'` when its divergence is strictly positive and the
 * previous defined value was `<= 0`; `'down'` is the mirror.
 */
export function detectLineMomentumDivergenceCrosses(
  values: readonly (number | null)[],
): Array<ChartLineMomentumDivergenceCross> {
  const out: Array<ChartLineMomentumDivergenceCross> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev <= 0 && v > 0) {
      out.push('up');
    } else if (prev >= 0 && v < 0) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineMomentumDivergence(
  data: readonly ChartLineMomentumDivergencePoint[] | null | undefined,
  options: ChartLineMomentumDivergenceOptions = {},
): ChartLineMomentumDivergenceRun {
  const series = getLineMomentumDivergenceFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineMomentumDivergenceLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineMomentumDivergence(closes, { length });
  const crosses = detectLineMomentumDivergenceCrosses(channels.divergence);
  const samples: ChartLineMomentumDivergenceSample[] = series.map(
    (point, index) => {
      const value = channels.divergence[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        roc: channels.roc[index] ?? null,
        momentum: channels.momentum[index] ?? null,
        divergence: value,
        zone: classifyLineMomentumDivergenceZone(value),
        crossed: crosses[index] ?? null,
      };
    },
  );
  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'zero') zeroCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series = [],
    length,
    rocValues: channels.roc,
    momentumValues: channels.momentum,
    divergenceValues: channels.divergence,
    samples,
    positiveCount,
    negativeCount,
    zeroCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length + 1,
  };
}

export interface ChartLineMomentumDivergenceLayoutOptions
  extends ChartLineMomentumDivergenceOptions {
  data: readonly ChartLineMomentumDivergencePoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

function buildLinePath(
  points: ReadonlyArray<{ x: number; y: number }>,
): string {
  if (points.length === 0) return '';
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (i < points.length - 1) d += ' ';
  }
  return d;
}

/** Project the run into a dual-panel SVG layout. */
export function computeLineMomentumDivergenceLayout(
  options: ChartLineMomentumDivergenceLayoutOptions,
): ChartLineMomentumDivergenceLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_PANEL_GAP;

  const run = runLineMomentumDivergence(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const divergenceHeight = Math.max(
    0,
    innerHeight - panelGap - priceHeight,
  );
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const divergenceTop = priceBottom + panelGap;
  const divergenceBottom = divergenceTop + divergenceHeight;

  const okGeom = innerWidth > 0 && innerHeight > panelGap;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < priceMin) priceMin = sample.close;
    if (sample.close > priceMax) priceMax = sample.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }
  const priceY = (value: number): number =>
    priceBottom - ((value - priceMin) / (priceMax - priceMin)) * priceHeight;

  let divergenceMin = Infinity;
  let divergenceMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.divergence)) {
      if (sample.divergence < divergenceMin) divergenceMin = sample.divergence;
      if (sample.divergence > divergenceMax) divergenceMax = sample.divergence;
    }
  }
  if (!Number.isFinite(divergenceMin) || !Number.isFinite(divergenceMax)) {
    divergenceMin = -1;
    divergenceMax = 1;
  }
  // Always include the zero line in the visible y-range.
  if (divergenceMin > 0) divergenceMin = 0;
  if (divergenceMax < 0) divergenceMax = 0;
  if (divergenceMin === divergenceMax) {
    divergenceMin -= 1;
    divergenceMax += 1;
  }
  const divergenceY = (value: number): number =>
    divergenceBottom -
    ((value - divergenceMin) / (divergenceMax - divergenceMin)) *
      divergenceHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineMomentumDivergenceDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const divergenceLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineMomentumDivergenceMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.divergence)) return;
    const cx = xAt(index);
    const yc = divergenceY(sample.divergence);
    divergenceLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        divergence: sample.divergence,
        crossed: sample.crossed,
      });
    }
  });

  const zeroLineY = divergenceY(0);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    divergenceTop,
    divergenceBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    divergencePath: buildLinePath(divergenceLinePoints),
    zeroLineY,
    markers,
    priceMin,
    priceMax,
    divergenceMin,
    divergenceMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineMomentumDivergenceChart(
  data: readonly ChartLineMomentumDivergencePoint[] | null | undefined,
  options: ChartLineMomentumDivergenceOptions = {},
): string {
  const run = runLineMomentumDivergence(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Momentum Divergence oscillator beneath ` +
    `the close (length ${run.length}). Divergence = ` +
    `ROC(close, length) - momentum(close, length), where ` +
    `ROC is the percent change and momentum is the absolute change ` +
    `over the lookback. Across ${total} bars the divergence was ` +
    `positive on ${run.positiveCount}, negative on ${run.negativeCount}, ` +
    `zero on ${run.zeroCount}, and undefined on ${run.noneCount}, with ` +
    `${run.bullishCrossCount} bullish and ${run.bearishCrossCount} ` +
    `bearish zero-line crosses.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatDivergence(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  if (Math.abs(value) >= 1e6) return value.toExponential(2);
  if (Math.abs(value) >= 100) return value.toFixed(2);
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function markerColorOf(
  crossed: 'up' | 'down',
  bullishColor: string,
  bearishColor: string,
): string {
  if (crossed === 'up') return bullishColor;
  return bearishColor;
}

function zoneLabelOf(zone: ChartLineMomentumDivergenceZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'zero') return 'Zero';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineMomentumDivergenceCross): string {
  if (crossed === 'up') return 'Bullish cross';
  if (crossed === 'down') return 'Bearish cross';
  return '-';
}

/** ChartLineMomentumDivergence -- dual-panel pure-SVG chart. */
export const ChartLineMomentumDivergence = forwardRef<
  HTMLDivElement,
  ChartLineMomentumDivergenceProps
>(function ChartLineMomentumDivergence(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_LENGTH,
    width = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_WIDTH,
    height = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_HEIGHT,
    padding = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_PADDING,
    panelGap = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_PRICE_COLOR,
    divergenceColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_DIVERGENCE_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_BEARISH_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_ZERO_LINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDivergence = true,
    showMarkers = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatDivergence = defaultFormatDivergence,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-momentum-divergence-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineMomentumDivergenceSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineMomentumDivergenceSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineMomentumDivergenceLayout({
        data,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineMomentumDivergenceChart(data, { length });
  const resolvedLabel =
    ariaLabel ??
    `Momentum Divergence chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineMomentumDivergenceSeriesId): void => {
    const next = isHidden(id);
    if (hiddenSeries === undefined) {
      setInternalHidden((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
    }
    onSeriesToggle?.({ seriesId: id, hidden: !next });
  };

  const handleActivate = (sampleIndex: number): void => {
    const sample = run.samples[sampleIndex];
    if (sample) onPointClick?.({ point: sample });
  };

  const handleKey = (
    event: KeyboardEvent<SVGElement>,
    sampleIndex: number,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate(sampleIndex);
    }
  };

  const tickValues: number[] = [];
  if (tickCount > 1) {
    for (let i = 0; i < tickCount; i += 1) {
      tickValues.push(i / (tickCount - 1));
    }
  }

  const containerStyle: CSSProperties = {
    display: 'inline-block',
    fontFamily:
      'var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif)',
    ...style,
  };

  const hoverSample =
    hover !== null && run.samples[hover] ? run.samples[hover]! : null;

  let tooltip: ReactNode = null;
  if (showTooltip && hoverSample && !isEmpty) {
    const dot = layout.priceDots[hoverSample.index];
    const anchorX = dot ? dot.cx : (layout.innerLeft + layout.innerRight) / 2;
    const tooltipW = 260;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-momentum-divergence-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={150}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-momentum-divergence-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-momentum-divergence-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-momentum-divergence-tooltip-roc"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`ROC(${run.length}): ${
            hoverSample.roc === null
              ? 'n/a'
              : formatDivergence(hoverSample.roc)
          }`}
        </text>
        <text
          data-section="chart-line-momentum-divergence-tooltip-momentum"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Momentum(${run.length}): ${
            hoverSample.momentum === null
              ? 'n/a'
              : formatDivergence(hoverSample.momentum)
          }`}
        </text>
        <text
          data-section="chart-line-momentum-divergence-tooltip-divergence"
          x={tx + 10}
          y={ty + 87}
          fill="#67e8f9"
          fontSize={11}
          fontWeight={600}
        >
          {`Divergence: ${
            hoverSample.divergence === null
              ? 'n/a'
              : formatDivergence(hoverSample.divergence)
          }`}
        </text>
        <text
          data-section="chart-line-momentum-divergence-tooltip-zone"
          x={tx + 10}
          y={ty + 105}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-momentum-divergence-tooltip-cross"
          x={tx + 10}
          y={ty + 121}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
        <text
          data-section="chart-line-momentum-divergence-tooltip-formula"
          x={tx + 10}
          y={ty + 137}
          fill="#94a3b8"
          fontSize={10}
        >
          {`ROC - Momentum`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const divergenceHidden = isHidden('divergence') || !showDivergence;

  const legendItems: Array<{
    id: ChartLineMomentumDivergenceSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'divergence', label: 'Divergence', color: divergenceColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-momentum-divergence"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-positive-count={run.positiveCount}
      data-negative-count={run.negativeCount}
      data-zero-count={run.zeroCount}
      data-none-count={run.noneCount}
      data-bullish-cross-count={run.bullishCrossCount}
      data-bearish-cross-count={run.bearishCrossCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-momentum-divergence-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {description}
      </span>

      {isEmpty ? (
        <svg
          data-section="chart-line-momentum-divergence-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-momentum-divergence-empty"
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill={axisColor}
            fontSize={13}
          >
            No data
          </text>
        </svg>
      ) : (
        <svg
          data-section="chart-line-momentum-divergence-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-momentum-divergence-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.divergenceBottom -
                  t * (layout.divergenceBottom - layout.divergenceTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-momentum-divergence-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-momentum-divergence-grid-line"
                      data-panel="divergence"
                      x1={layout.innerLeft}
                      y1={yk}
                      x2={layout.innerRight}
                      y2={yk}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-momentum-divergence-axes">
              <line
                data-section="chart-line-momentum-divergence-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-momentum-divergence-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-momentum-divergence-axis"
                data-panel="divergence"
                x1={layout.innerLeft}
                y1={layout.divergenceTop}
                x2={layout.innerLeft}
                y2={layout.divergenceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-momentum-divergence-axis"
                data-panel="divergence"
                x1={layout.innerLeft}
                y1={layout.divergenceBottom}
                x2={layout.innerRight}
                y2={layout.divergenceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-momentum-divergence-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-momentum-divergence-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-momentum-divergence-tick-label"
                data-panel="divergence"
                x={layout.innerLeft - 6}
                y={layout.divergenceTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatDivergence(layout.divergenceMax)}
              </text>
              <text
                data-section="chart-line-momentum-divergence-tick-label"
                data-panel="divergence"
                x={layout.innerLeft - 6}
                y={layout.divergenceBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatDivergence(layout.divergenceMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-momentum-divergence-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-momentum-divergence-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Close line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-momentum-divergence-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-momentum-divergence-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatPrice(
                    dot.close,
                  )}`}
                  onMouseEnter={() => setHover(dot.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(dot.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(dot.index)}
                  onKeyDown={(e) => handleKey(e, dot.index)}
                />
              ))}
            </g>
          ) : null}

          {!divergenceHidden ? (
            <path
              data-section="chart-line-momentum-divergence-line"
              d={layout.divergencePath}
              fill="none"
              stroke={divergenceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Momentum Divergence line, length ${run.length}`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-momentum-divergence-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-momentum-divergence-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-divergence={marker.divergence}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={markerColorOf(
                    marker.crossed,
                    bullishColor,
                    bearishColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, divergence ${formatDivergence(
                    marker.divergence,
                  )}, ${crossLabelOf(marker.crossed)}`}
                  onMouseEnter={() => setHover(marker.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(marker.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(marker.index)}
                  onKeyDown={(e) => handleKey(e, marker.index)}
                />
              ))}
            </g>
          ) : null}

          {showConfigBadge ? (
            <g data-section="chart-line-momentum-divergence-badge">
              <rect
                data-section="chart-line-momentum-divergence-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={200}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-momentum-divergence-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Mom. Divergence ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-momentum-divergence-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 12,
          }}
        >
          {legendItems.map((item) => {
            const hidden = isHidden(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-momentum-divergence-legend-item"
                data-series-id={item.id}
                data-hidden={hidden ? 'true' : 'false'}
                onClick={() => toggleSeries(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  opacity: hidden ? 0.4 : 1,
                  color: 'inherit',
                  font: 'inherit',
                }}
                aria-pressed={!hidden}
              >
                <span
                  data-section="chart-line-momentum-divergence-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-momentum-divergence-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-momentum-divergence-legend-stats"
            style={{ color: axisColor }}
          >
            {`pos ${run.positiveCount} / neg ${run.negativeCount} / crosses ${run.bullishCrossCount + run.bearishCrossCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMomentumDivergence.displayName = 'ChartLineMomentumDivergence';
