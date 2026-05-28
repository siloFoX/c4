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
 * ChartLineMassIndexSignal -- pure-SVG dual-panel chart with a
 * Mass Index oscillator panel beneath the close.
 *
 * Definition (Donald Dorsey, 1992):
 *
 *   range[i] = high[i] - low[i]
 *   ema1[i]  = EMA(range, emaLength)
 *   ema2[i]  = EMA(ema1,  emaLength)
 *   ratio[i] = ema1[i] / ema2[i]
 *   MI[i]    = sum(ratio[i - lookback + 1..i])
 *
 * `emaLength` is typically 9, `lookback` is typically 25. The
 * EMA uses `alpha = 2 / (emaLength + 1)` and seeds with the
 * first value. Bars before the lookback window are nulled
 * (warmup). When `ema2 == 0` the ratio is null and the
 * cumulative `MI` for that window is also null.
 *
 * Bit-exact anchor on integer / dyadic fixtures:
 *
 *   * **CONST_HL (high - low == K, K != 0)**: range = K
 *     constant. With EMA seeded at the first value, ema1 = K
 *     at every bar (EMA-of-constant lemma: `alpha * K +
 *     (1 - alpha) * K = K`). Then ema2 = K likewise. ratio =
 *     K / K = 1 at every bar, and `MI = lookback * 1 =
 *     lookback` bit-exact for every bar past the warmup.
 *   * **CONST high == low (range == 0)**: ema1 = ema2 = 0,
 *     ratio = 0 / 0 -> `null`, `MI = null` for every window
 *     that touches a singular ratio.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the Mass Index.
 */

export interface ChartLineMassIndexSignalPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineMassIndexSignalZone =
  | 'reversal'
  | 'normal'
  | 'none';

export type ChartLineMassIndexSignalSeriesId = 'price' | 'mass';

export interface ChartLineMassIndexSignalSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  mass: number | null;
  zone: ChartLineMassIndexSignalZone;
}

export interface ChartLineMassIndexSignalRun {
  series: ChartLineMassIndexSignalPoint[];
  emaLength: number;
  lookback: number;
  reversalThreshold: number;
  mass: Array<number | null>;
  samples: ChartLineMassIndexSignalSample[];
  massFinal: number | null;
  reversalCount: number;
  normalCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineMassIndexSignalMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  mass: number;
  zone: ChartLineMassIndexSignalZone;
}

export interface ChartLineMassIndexSignalDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMassIndexSignalLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  massTop: number;
  massBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineMassIndexSignalDot[];
  massPath: string;
  markers: ChartLineMassIndexSignalMarker[];
  priceMin: number;
  priceMax: number;
  massMin: number;
  massMax: number;
  thresholdY: number;
  run: ChartLineMassIndexSignalRun;
}

export interface ChartLineMassIndexSignalProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMassIndexSignalPoint[];
  emaLength?: number;
  lookback?: number;
  reversalThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  massColor?: string;
  reversalColor?: string;
  normalColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  thresholdColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMass?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showThreshold?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMassIndexSignalSeriesId[];
  defaultHiddenSeries?: ChartLineMassIndexSignalSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMassIndexSignalSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineMassIndexSignalSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatMass?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_PADDING = 44;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_EMA_LENGTH = 9;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_LOOKBACK = 25;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_REVERSAL_THRESHOLD = 27;
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_MASS_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_REVERSAL_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_NORMAL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_THRESHOLD_COLOR = '#dc2626';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineMassIndexSignalFinitePoints(
  data: readonly ChartLineMassIndexSignalPoint[] | null | undefined,
): ChartLineMassIndexSignalPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMassIndexSignalPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineMassIndexSignalLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer lookback (>= 2). */
export function normalizeLineMassIndexSignalLookback(
  lookback: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(lookback) && lookback >= 2) return Math.floor(lookback);
  return fallback;
}

/**
 * Single-pass EMA seeded at the first value.
 *
 *   alpha = 2 / (length + 1)
 *   ema[0] = x[0]
 *   ema[i] = alpha * x[i] + (1 - alpha) * ema[i - 1]
 *
 * Non-finite inputs null the bar and break the chain (the next
 * finite bar re-seeds).
 */
export function computeLineMassIndexSignalEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const alpha = 2 / (length + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev === null) {
      out.push(v);
      prev = v;
      continue;
    }
    const e: number = alpha * v + (1 - alpha) * prev;
    out.push(e);
    prev = e;
  }
  return out;
}

export interface ChartLineMassIndexSignalOptions {
  emaLength?: number;
  lookback?: number;
  reversalThreshold?: number;
}

/**
 * Compute the Mass Index per bar. Bars before
 * `i = lookback - 1` are `null` (warmup). When any ratio in the
 * cumulative window is non-finite or the divisor is zero the
 * `MI` for that bar is `null`.
 */
export function computeLineMassIndexSignal(
  bars: ReadonlyArray<{ high: number; low: number }> | null | undefined,
  options: { emaLength?: number; lookback?: number } = {},
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const emaLength = normalizeLineMassIndexSignalLength(
    options.emaLength,
    DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_EMA_LENGTH,
  );
  const lookback = normalizeLineMassIndexSignalLookback(
    options.lookback,
    DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_LOOKBACK,
  );
  const range: Array<number | null> = bars.map((bar) => {
    if (
      !bar ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low)
    ) {
      return null;
    }
    return bar.high - bar.low;
  });
  const ema1 = computeLineMassIndexSignalEma(range, emaLength);
  const ema2 = computeLineMassIndexSignalEma(ema1, emaLength);
  const ratio: Array<number | null> = ema1.map((e1, i) => {
    const e2 = ema2[i];
    if (
      e1 === null ||
      e1 === undefined ||
      e2 === null ||
      e2 === undefined ||
      !isFiniteNumber(e1) ||
      !isFiniteNumber(e2) ||
      e2 === 0
    ) {
      return null;
    }
    return e1 / e2;
  });
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < lookback - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < lookback; j += 1) {
      const r = ratio[i - j];
      if (r === null || r === undefined || !isFiniteNumber(r)) {
        ok = false;
        break;
      }
      sum += r;
    }
    out.push(ok ? sum : null);
  }
  return out;
}

/** Classify a Mass Index reading against the reversal threshold. */
export function classifyLineMassIndexSignalZone(
  value: number | null,
  threshold: number,
): ChartLineMassIndexSignalZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'reversal';
  return 'normal';
}

/** Run the full Mass Index pipeline plus sample classification. */
export function runLineMassIndexSignal(
  data: readonly ChartLineMassIndexSignalPoint[] | null | undefined,
  options: ChartLineMassIndexSignalOptions = {},
): ChartLineMassIndexSignalRun {
  const series = getLineMassIndexSignalFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const emaLength = normalizeLineMassIndexSignalLength(
    options.emaLength,
    DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_EMA_LENGTH,
  );
  const lookback = normalizeLineMassIndexSignalLookback(
    options.lookback,
    DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_LOOKBACK,
  );
  const reversalThreshold = isFiniteNumber(options.reversalThreshold)
    ? options.reversalThreshold
    : DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_REVERSAL_THRESHOLD;
  const mass = computeLineMassIndexSignal(series, {
    emaLength,
    lookback,
  });
  const samples: ChartLineMassIndexSignalSample[] = series.map(
    (point, index) => {
      const value = mass[index] ?? null;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        mass: value,
        zone: classifyLineMassIndexSignalZone(value, reversalThreshold),
      };
    },
  );
  let reversalCount = 0;
  let normalCount = 0;
  let noneCount = 0;
  let massFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'reversal') reversalCount += 1;
    else if (sample.zone === 'normal') normalCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.mass)) massFinal = sample.mass;
  }
  return {
    series = [],
    emaLength,
    lookback,
    reversalThreshold,
    mass,
    samples,
    massFinal,
    reversalCount,
    normalCount,
    noneCount,
    ok: series.length >= lookback,
  };
}

export interface ChartLineMassIndexSignalLayoutOptions
  extends ChartLineMassIndexSignalOptions {
  data: readonly ChartLineMassIndexSignalPoint[] | null | undefined;
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
export function computeLineMassIndexSignalLayout(
  options: ChartLineMassIndexSignalLayoutOptions,
): ChartLineMassIndexSignalLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_PANEL_GAP;

  const run = runLineMassIndexSignal(options.data, {
    ...(options.emaLength !== undefined ? { emaLength: options.emaLength } : {}),
    ...(options.lookback !== undefined ? { lookback: options.lookback } : {}),
    ...(options.reversalThreshold !== undefined
      ? { reversalThreshold: options.reversalThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const massHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const massTop = priceBottom + panelGap;
  const massBottom = massTop + massHeight;

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

  let massMin = Infinity;
  let massMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.mass)) {
      if (sample.mass < massMin) massMin = sample.mass;
      if (sample.mass > massMax) massMax = sample.mass;
    }
  }
  if (!Number.isFinite(massMin) || !Number.isFinite(massMax)) {
    massMin = 0;
    massMax = run.reversalThreshold + 1;
  }
  // Always include the reversal threshold in the visible range.
  if (run.reversalThreshold < massMin) massMin = run.reversalThreshold;
  if (run.reversalThreshold > massMax) massMax = run.reversalThreshold;
  if (massMin === massMax) {
    massMin -= 1;
    massMax += 1;
  }
  const massY = (value: number): number =>
    massBottom -
    ((value - massMin) / (massMax - massMin)) * massHeight;
  const thresholdY = massY(run.reversalThreshold);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineMassIndexSignalDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const massLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineMassIndexSignalMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.mass)) return;
    const cx = xAt(index);
    const yc = massY(sample.mass);
    massLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      mass: sample.mass,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    massTop,
    massBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    massPath: buildLinePath(massLinePoints),
    markers,
    priceMin,
    priceMax,
    massMin,
    massMax,
    thresholdY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineMassIndexSignalChart(
  data: readonly ChartLineMassIndexSignalPoint[] | null | undefined,
  options: ChartLineMassIndexSignalOptions = {},
): string {
  const run = runLineMassIndexSignal(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.massFinal === null ? 'n/a' : run.massFinal.toFixed(4);
  return (
    `Dual-panel chart with a Mass Index oscillator panel beneath ` +
    `the close (EMA length ${run.emaLength}, lookback ` +
    `${run.lookback}, reversal threshold ${run.reversalThreshold}). ` +
    `The Mass Index sums the ratio of EMA(high - low) to ` +
    `EMA(EMA(high - low)) across the lookback window; a ` +
    `reversal bulge crosses above the threshold. Across ${total} ` +
    `bars the oscillator is in the reversal zone on ` +
    `${run.reversalCount}, in the normal zone on ${run.normalCount}, ` +
    `and undefined on ${run.noneCount}. The final reading is ` +
    `${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatMass(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineMassIndexSignalZone,
  reversalColor: string,
  normalColor: string,
  noneColor: string,
): string {
  if (zone === 'reversal') return reversalColor;
  if (zone === 'normal') return normalColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineMassIndexSignalZone): string {
  if (zone === 'reversal') return 'Reversal';
  if (zone === 'normal') return 'Normal';
  return 'n/a';
}

/**
 * ChartLineMassIndexSignal -- dual-panel pure-SVG Mass Index
 * chart.
 */
export const ChartLineMassIndexSignal = forwardRef<
  HTMLDivElement,
  ChartLineMassIndexSignalProps
>(function ChartLineMassIndexSignal(props, ref) {
  const {
    data,
    emaLength = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_EMA_LENGTH,
    lookback = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_LOOKBACK,
    reversalThreshold = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_REVERSAL_THRESHOLD,
    width = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_WIDTH,
    height = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_PADDING,
    panelGap = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_PRICE_COLOR,
    massColor = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_MASS_COLOR,
    reversalColor = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_REVERSAL_COLOR,
    normalColor = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_NORMAL_COLOR,
    noneColor = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_GRID_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_MASS_INDEX_SIGNAL_THRESHOLD_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMass = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showThreshold = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatMass = defaultFormatMass,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-mass-index-signal-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineMassIndexSignalSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineMassIndexSignalSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineMassIndexSignalLayout({
        data,
        emaLength,
        lookback,
        reversalThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      emaLength,
      lookback,
      reversalThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineMassIndexSignalChart(data, {
      emaLength,
      lookback,
      reversalThreshold,
    });
  const resolvedLabel =
    ariaLabel ??
    `Mass Index chart, EMA ${run.emaLength}, lookback ${run.lookback}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineMassIndexSignalSeriesId): void => {
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
    const tooltipW = 240;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-mass-index-signal-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={102}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-mass-index-signal-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-mass-index-signal-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-mass-index-signal-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-mass-index-signal-tooltip-mass"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`MI: ${
            hoverSample.mass === null
              ? 'n/a'
              : formatMass(hoverSample.mass)
          }`}
        </text>
        <text
          data-section="chart-line-mass-index-signal-tooltip-zone"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const massHidden = isHidden('mass') || !showMass;

  const legendItems: Array<{
    id: ChartLineMassIndexSignalSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'mass', label: 'Mass Index', color: massColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-mass-index-signal"
      data-empty={isEmpty ? 'true' : 'false'}
      data-ema-length={run.emaLength}
      data-lookback={run.lookback}
      data-reversal-threshold={run.reversalThreshold}
      data-mass-final={run.massFinal === null ? '' : run.massFinal}
      data-reversal-count={run.reversalCount}
      data-normal-count={run.normalCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-mass-index-signal-aria-desc"
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
          data-section="chart-line-mass-index-signal-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-mass-index-signal-empty"
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
          data-section="chart-line-mass-index-signal-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-mass-index-signal-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const ym =
                  layout.massBottom -
                  t * (layout.massBottom - layout.massTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-mass-index-signal-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-mass-index-signal-grid-line"
                      data-panel="mass"
                      x1={layout.innerLeft}
                      y1={ym}
                      x2={layout.innerRight}
                      y2={ym}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-mass-index-signal-axes">
              <line
                data-section="chart-line-mass-index-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-mass-index-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-mass-index-signal-axis"
                data-panel="mass"
                x1={layout.innerLeft}
                y1={layout.massTop}
                x2={layout.innerLeft}
                y2={layout.massBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-mass-index-signal-axis"
                data-panel="mass"
                x1={layout.innerLeft}
                y1={layout.massBottom}
                x2={layout.innerRight}
                y2={layout.massBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-mass-index-signal-tick-label"
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
                data-section="chart-line-mass-index-signal-tick-label"
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
                data-section="chart-line-mass-index-signal-tick-label"
                data-panel="mass"
                x={layout.innerLeft - 6}
                y={layout.massTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatMass(layout.massMax)}
              </text>
              <text
                data-section="chart-line-mass-index-signal-tick-label"
                data-panel="mass"
                x={layout.innerLeft - 6}
                y={layout.massBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatMass(layout.massMin)}
              </text>
            </g>
          ) : null}

          {showThreshold ? (
            <line
              data-section="chart-line-mass-index-signal-threshold"
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={thresholdColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-mass-index-signal-price-path"
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
            <g data-section="chart-line-mass-index-signal-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-mass-index-signal-dot"
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

          {!massHidden ? (
            <path
              data-section="chart-line-mass-index-signal-line"
              d={layout.massPath}
              fill="none"
              stroke={massColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Mass Index line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-mass-index-signal-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-mass-index-signal-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-mass={marker.mass}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    reversalColor,
                    normalColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, MI ${formatMass(marker.mass)}, ${zoneLabelOf(
                    marker.zone,
                  )}`}
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
            <g data-section="chart-line-mass-index-signal-badge">
              <rect
                data-section="chart-line-mass-index-signal-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-mass-index-signal-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Mass Index ${run.emaLength}/${run.lookback}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-mass-index-signal-legend"
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
                data-section="chart-line-mass-index-signal-legend-item"
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
                  data-section="chart-line-mass-index-signal-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-mass-index-signal-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-mass-index-signal-legend-stats"
            style={{ color: axisColor }}
          >
            {`reversal ${run.reversalCount} / normal ${run.normalCount} / undefined ${run.noneCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMassIndexSignal.displayName = 'ChartLineMassIndexSignal';
