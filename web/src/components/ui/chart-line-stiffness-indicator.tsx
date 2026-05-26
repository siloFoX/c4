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
 * ChartLineStiffnessIndicator -- pure-SVG dual-panel chart with
 * the close on the top panel and the Markos Katsanos Stiffness
 * Indicator on the bottom panel.
 *
 * The Stiffness Indicator measures how often the close stays
 * above a noise band beneath the moving average:
 *
 *   middle[i]    = SMA(close, length)[i]
 *   stdDev[i]    = sqrt(sum((close - middle)^2) / length)
 *                  (population)
 *   threshold[i] = middle[i] - stiffnessFactor * stdDev[i]
 *   above[i]     = 1 if close[i] >= threshold[i] else 0
 *   stiffness[i] = sum(above, [i - length + 1, i]) / length * 100
 *
 * Defaults: `length = 20`, `stiffnessFactor = 0.2`. Bars before
 * `i = 2 * length - 2` are warmup (`stiffness = null`) because
 * the count window needs `length` valid `above` samples, and
 * `above` itself needs `length` close samples for the SMA /
 * stdDev.
 *
 * Bit-exact anchor: **CONST close** (`close = K`). The SMA
 * collapses to `K`, every centered residual is zero so
 * `stdDev = 0`, the threshold equals `K`, and the comparison
 * `close >= threshold` is always true, so every `above` is `1`
 * and `stiffness = length / length * 100 = 100` bit-exact past
 * warmup. The integration sweep verifies this across many `K`
 * (including 0 and negatives) and `(length, stiffnessFactor)`
 * combinations.
 */

export interface ChartLineStiffnessIndicatorPoint {
  x: number;
  close: number;
}

export type ChartLineStiffnessIndicatorZone =
  | 'rigid'
  | 'firm'
  | 'soft'
  | 'fluid'
  | 'none';

export type ChartLineStiffnessIndicatorSeriesId = 'price' | 'stiffness';

export interface ChartLineStiffnessIndicatorSample {
  index: number;
  x: number;
  close: number;
  stiffness: number | null;
  zone: ChartLineStiffnessIndicatorZone;
}

export interface ChartLineStiffnessIndicatorRun {
  series: ChartLineStiffnessIndicatorPoint[];
  length: number;
  stiffnessFactor: number;
  stiffness: Array<number | null>;
  samples: ChartLineStiffnessIndicatorSample[];
  stiffnessFinal: number | null;
  rigidCount: number;
  firmCount: number;
  softCount: number;
  fluidCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineStiffnessIndicatorMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  stiffness: number;
  zone: ChartLineStiffnessIndicatorZone;
}

export interface ChartLineStiffnessIndicatorDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStiffnessIndicatorLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  stiffnessTop: number;
  stiffnessBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineStiffnessIndicatorDot[];
  stiffnessPath: string;
  markers: ChartLineStiffnessIndicatorMarker[];
  priceMin: number;
  priceMax: number;
  stiffnessMin: number;
  stiffnessMax: number;
  midBaselineY: number;
  run: ChartLineStiffnessIndicatorRun;
}

export interface ChartLineStiffnessIndicatorProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStiffnessIndicatorPoint[];
  length?: number;
  stiffnessFactor?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  stiffnessColor?: string;
  rigidColor?: string;
  firmColor?: string;
  softColor?: string;
  fluidColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  baselineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStiffness?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBaseline?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStiffnessIndicatorSeriesId[];
  defaultHiddenSeries?: ChartLineStiffnessIndicatorSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStiffnessIndicatorSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineStiffnessIndicatorSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatStiffness?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_WIDTH = 720;
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_PADDING = 44;
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_LENGTH = 20;
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FACTOR = 0.2;
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_STIFFNESS_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_RIGID_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FIRM_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_SOFT_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FLUID_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineStiffnessIndicatorFinitePoints(
  data: readonly ChartLineStiffnessIndicatorPoint[] | null | undefined,
): ChartLineStiffnessIndicatorPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStiffnessIndicatorPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineStiffnessIndicatorLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite factor. */
export function normalizeLineStiffnessIndicatorFactor(
  factor: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(factor) && factor >= 0) return factor;
  return fallback;
}

/** SMA; nulls in the window null the bar. */
export function applyLineStiffnessIndicatorSma(
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
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / length : null);
  }
  return out;
}

/** Population standard deviation over a rolling window. */
export function applyLineStiffnessIndicatorPopulationStdDev(
  values: readonly (number | null)[],
  means: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    const m = means[i];
    if (i < length - 1 || m == null || !isFiniteNumber(m)) {
      out.push(null);
      continue;
    }
    let sumSq = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      const d = v - m;
      sumSq += d * d;
    }
    out.push(ok ? Math.sqrt(sumSq / length) : null);
  }
  return out;
}

export interface ChartLineStiffnessIndicatorOptions {
  length?: number;
  stiffnessFactor?: number;
}

/**
 * Compute the Stiffness Indicator per bar. Bars before
 * `i = 2 * length - 2` are `null` because the count window
 * needs `length` valid `above` samples, and `above` itself
 * needs `length` close samples for the SMA / stdDev.
 */
export function computeLineStiffnessIndicator(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineStiffnessIndicatorOptions = {},
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const length = normalizeLineStiffnessIndicatorLength(
    options.length,
    DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_LENGTH,
  );
  const factor = normalizeLineStiffnessIndicatorFactor(
    options.stiffnessFactor,
    DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FACTOR,
  );
  const middle = applyLineStiffnessIndicatorSma(closes, length);
  const stdDev = applyLineStiffnessIndicatorPopulationStdDev(
    closes,
    middle,
    length,
  );
  const above: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    const m = middle[i];
    const s = stdDev[i];
    if (
      c == null ||
      m == null ||
      s == null ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(m) ||
      !isFiniteNumber(s)
    ) {
      above.push(null);
      continue;
    }
    const threshold = m - factor * s;
    above.push(c >= threshold ? 1 : 0);
  }
  const stiffness: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < 2 * length - 2) {
      stiffness.push(null);
      continue;
    }
    let count = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const a = above[i - j];
      if (a == null) {
        ok = false;
        break;
      }
      count += a;
    }
    stiffness.push(ok ? (count / length) * 100 : null);
  }
  return stiffness;
}

/** Classify a Stiffness reading. */
export function classifyLineStiffnessIndicatorZone(
  value: number | null,
): ChartLineStiffnessIndicatorZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= 75) return 'rigid';
  if (value >= 50) return 'firm';
  if (value >= 25) return 'soft';
  return 'fluid';
}

/** Run the full pipeline plus sample classification. */
export function runLineStiffnessIndicator(
  data: readonly ChartLineStiffnessIndicatorPoint[] | null | undefined,
  options: ChartLineStiffnessIndicatorOptions = {},
): ChartLineStiffnessIndicatorRun {
  const series = getLineStiffnessIndicatorFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineStiffnessIndicatorLength(
    options.length,
    DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_LENGTH,
  );
  const stiffnessFactor = normalizeLineStiffnessIndicatorFactor(
    options.stiffnessFactor,
    DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FACTOR,
  );
  const closes = series.map((p) => p.close);
  const stiffness = computeLineStiffnessIndicator(closes, {
    length,
    stiffnessFactor,
  });
  const samples: ChartLineStiffnessIndicatorSample[] = series.map((point, index) => {
    const value = stiffness[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      stiffness: value,
      zone: classifyLineStiffnessIndicatorZone(value),
    };
  });
  let rigidCount = 0;
  let firmCount = 0;
  let softCount = 0;
  let fluidCount = 0;
  let noneCount = 0;
  let stiffnessFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'rigid') rigidCount += 1;
    else if (sample.zone === 'firm') firmCount += 1;
    else if (sample.zone === 'soft') softCount += 1;
    else if (sample.zone === 'fluid') fluidCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.stiffness)) stiffnessFinal = sample.stiffness;
  }
  return {
    series,
    length,
    stiffnessFactor,
    stiffness,
    samples,
    stiffnessFinal,
    rigidCount,
    firmCount,
    softCount,
    fluidCount,
    noneCount,
    ok: series.length >= 2 * length - 1,
  };
}

export interface ChartLineStiffnessIndicatorLayoutOptions
  extends ChartLineStiffnessIndicatorOptions {
  data: readonly ChartLineStiffnessIndicatorPoint[] | null | undefined;
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
export function computeLineStiffnessIndicatorLayout(
  options: ChartLineStiffnessIndicatorLayoutOptions,
): ChartLineStiffnessIndicatorLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_PANEL_GAP;

  const run = runLineStiffnessIndicator(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.stiffnessFactor !== undefined
      ? { stiffnessFactor: options.stiffnessFactor }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const stiffnessHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const stiffnessTop = priceBottom + panelGap;
  const stiffnessBottom = stiffnessTop + stiffnessHeight;

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

  // Stiffness is a percent in [0, 100].
  const stiffnessMin = 0;
  const stiffnessMax = 100;
  const stiffnessY = (value: number): number =>
    stiffnessBottom -
    ((value - stiffnessMin) / (stiffnessMax - stiffnessMin)) * stiffnessHeight;
  const midBaselineY = stiffnessY(50);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineStiffnessIndicatorDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const stiffnessLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineStiffnessIndicatorMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.stiffness)) return;
    const cx = xAt(index);
    const yc = stiffnessY(sample.stiffness);
    stiffnessLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      stiffness: sample.stiffness,
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
    stiffnessTop,
    stiffnessBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    stiffnessPath: buildLinePath(stiffnessLinePoints),
    markers,
    priceMin,
    priceMax,
    stiffnessMin,
    stiffnessMax,
    midBaselineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineStiffnessIndicatorChart(
  data: readonly ChartLineStiffnessIndicatorPoint[] | null | undefined,
  options: ChartLineStiffnessIndicatorOptions = {},
): string {
  const run = runLineStiffnessIndicator(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.stiffnessFinal === null ? 'n/a' : run.stiffnessFinal.toFixed(4);
  return (
    `Dual-panel chart with a Markos Katsanos Stiffness Indicator ` +
    `oscillator panel beneath the close (length ${run.length}, ` +
    `stiffnessFactor ${run.stiffnessFactor}). Stiffness counts how ` +
    `often the close is at or above (SMA - stiffnessFactor * ` +
    `populationStdDev) across the lookback, scaled to percent. ` +
    `Across ${total} bars the stiffness reads rigid (>= 75) on ` +
    `${run.rigidCount}, firm (50..75) on ${run.firmCount}, soft ` +
    `(25..50) on ${run.softCount}, fluid (< 25) on ` +
    `${run.fluidCount}, and undefined on ${run.noneCount}. The ` +
    `final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatStiffness(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineStiffnessIndicatorZone,
  rigidColor: string,
  firmColor: string,
  softColor: string,
  fluidColor: string,
  noneColor: string,
): string {
  if (zone === 'rigid') return rigidColor;
  if (zone === 'firm') return firmColor;
  if (zone === 'soft') return softColor;
  if (zone === 'fluid') return fluidColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineStiffnessIndicatorZone): string {
  if (zone === 'rigid') return 'Rigid';
  if (zone === 'firm') return 'Firm';
  if (zone === 'soft') return 'Soft';
  if (zone === 'fluid') return 'Fluid';
  return 'n/a';
}

/**
 * ChartLineStiffnessIndicator -- dual-panel pure-SVG chart.
 */
export const ChartLineStiffnessIndicator = forwardRef<
  HTMLDivElement,
  ChartLineStiffnessIndicatorProps
>(function ChartLineStiffnessIndicator(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_LENGTH,
    stiffnessFactor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FACTOR,
    width = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_WIDTH,
    height = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_HEIGHT,
    padding = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_PADDING,
    panelGap = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_PRICE_COLOR,
    stiffnessColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_STIFFNESS_COLOR,
    rigidColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_RIGID_COLOR,
    firmColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FIRM_COLOR,
    softColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_SOFT_COLOR,
    fluidColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FLUID_COLOR,
    noneColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_BASELINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStiffness = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBaseline = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatStiffness = defaultFormatStiffness,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-stiffness-indicator-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineStiffnessIndicatorSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineStiffnessIndicatorSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineStiffnessIndicatorLayout({
        data,
        length,
        stiffnessFactor,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, stiffnessFactor, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineStiffnessIndicatorChart(data, { length, stiffnessFactor });
  const resolvedLabel =
    ariaLabel ??
    `Stiffness Indicator chart, length ${run.length}, factor ${run.stiffnessFactor}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineStiffnessIndicatorSeriesId): void => {
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
        data-section="chart-line-stiffness-indicator-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={86}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-stiffness-indicator-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-stiffness-indicator-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-stiffness-indicator-tooltip-stiffness"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Stiffness %: ${
            hoverSample.stiffness === null
              ? 'n/a'
              : formatStiffness(hoverSample.stiffness)
          }`}
        </text>
        <text
          data-section="chart-line-stiffness-indicator-tooltip-zone"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const stiffnessHidden = isHidden('stiffness') || !showStiffness;

  const legendItems: Array<{
    id: ChartLineStiffnessIndicatorSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'stiffness', label: 'Stiffness %', color: stiffnessColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-stiffness-indicator"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-stiffness-factor={run.stiffnessFactor}
      data-stiffness-final={
        run.stiffnessFinal === null ? '' : run.stiffnessFinal
      }
      data-rigid-count={run.rigidCount}
      data-firm-count={run.firmCount}
      data-soft-count={run.softCount}
      data-fluid-count={run.fluidCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-stiffness-indicator-aria-desc"
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
          data-section="chart-line-stiffness-indicator-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-stiffness-indicator-empty"
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
          data-section="chart-line-stiffness-indicator-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-stiffness-indicator-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.stiffnessBottom -
                  t * (layout.stiffnessBottom - layout.stiffnessTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-stiffness-indicator-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-stiffness-indicator-grid-line"
                      data-panel="stiffness"
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
            <g data-section="chart-line-stiffness-indicator-axes">
              <line
                data-section="chart-line-stiffness-indicator-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stiffness-indicator-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stiffness-indicator-axis"
                data-panel="stiffness"
                x1={layout.innerLeft}
                y1={layout.stiffnessTop}
                x2={layout.innerLeft}
                y2={layout.stiffnessBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stiffness-indicator-axis"
                data-panel="stiffness"
                x1={layout.innerLeft}
                y1={layout.stiffnessBottom}
                x2={layout.innerRight}
                y2={layout.stiffnessBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-stiffness-indicator-tick-label"
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
                data-section="chart-line-stiffness-indicator-tick-label"
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
                data-section="chart-line-stiffness-indicator-tick-label"
                data-panel="stiffness"
                x={layout.innerLeft - 6}
                y={layout.stiffnessTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatStiffness(layout.stiffnessMax)}
              </text>
              <text
                data-section="chart-line-stiffness-indicator-tick-label"
                data-panel="stiffness"
                x={layout.innerLeft - 6}
                y={layout.stiffnessBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatStiffness(layout.stiffnessMin)}
              </text>
            </g>
          ) : null}

          {showBaseline ? (
            <line
              data-section="chart-line-stiffness-indicator-baseline"
              x1={layout.innerLeft}
              y1={layout.midBaselineY}
              x2={layout.innerRight}
              y2={layout.midBaselineY}
              stroke={baselineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-stiffness-indicator-price-path"
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
            <g data-section="chart-line-stiffness-indicator-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-stiffness-indicator-dot"
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

          {!stiffnessHidden ? (
            <path
              data-section="chart-line-stiffness-indicator-line"
              d={layout.stiffnessPath}
              fill="none"
              stroke={stiffnessColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Stiffness line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-stiffness-indicator-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-stiffness-indicator-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-stiffness={marker.stiffness}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    rigidColor,
                    firmColor,
                    softColor,
                    fluidColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, stiffness ${formatStiffness(marker.stiffness)}, ${zoneLabelOf(
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
            <g data-section="chart-line-stiffness-indicator-badge">
              <rect
                data-section="chart-line-stiffness-indicator-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-stiffness-indicator-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Stiffness ${run.length}/${run.stiffnessFactor}sd`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-stiffness-indicator-legend"
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
                data-section="chart-line-stiffness-indicator-legend-item"
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
                  data-section="chart-line-stiffness-indicator-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-stiffness-indicator-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-stiffness-indicator-legend-stats"
            style={{ color: axisColor }}
          >
            {`rigid ${run.rigidCount} / firm ${run.firmCount} / soft ${run.softCount} / fluid ${run.fluidCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineStiffnessIndicator.displayName = 'ChartLineStiffnessIndicator';
