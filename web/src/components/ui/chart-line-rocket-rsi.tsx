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
 * ChartLineRocketRsi -- pure-SVG two-panel Rocket RSI chart.
 *
 * The Rocket RSI applies the Fisher Transform to a double-smoothed
 * RSI to sharpen turning points. The pipeline:
 *
 *   1. Standard RSI of close-to-close changes over `rsiPeriod`. A
 *      flat window (no gains, no losses) yields `RSI = 50`.
 *   2. SMA smoothing of length `smooth1`.
 *   3. SMA smoothing of length `smooth2` (the "double" smoothing).
 *   4. Normalize to `[-1, 1]`: `x = RSI / 50 - 1`.
 *   5. Clamp `x` to `[-CLAMP, CLAMP]` (default 0.999) so the Fisher
 *      Transform stays finite.
 *   6. Fisher Transform: `rocket = 0.5 * ln( (1 + x) / (1 - x) )`.
 *
 * The Fisher Transform stretches values near the boundaries of the
 * input range: a price stuck at an extreme RSI keeps producing
 * extreme rocket-RSI values, so reversals stand out sharply. The
 * defining algebraic anchor is exact: a constant series has every
 * bar-to-bar change equal to zero, so the RSI by convention is 50,
 * the normalized `x` is 0, and `Fisher(0) = 0` bit-exact.
 */

export interface ChartLineRocketRsiPoint {
  x: number;
  value: number;
}

export type ChartLineRocketRsiZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineRocketRsiSeriesId = 'price' | 'rocket';

export interface ChartLineRocketRsiSample {
  index: number;
  x: number;
  value: number;
  rsi: number | null;
  rocketRsi: number | null;
  zone: ChartLineRocketRsiZone;
}

export interface ChartLineRocketRsiRun {
  series: ChartLineRocketRsiPoint[];
  rsiPeriod: number;
  smooth1: number;
  smooth2: number;
  clamp: number;
  rsi: Array<number | null>;
  rocketRsi: Array<number | null>;
  samples: ChartLineRocketRsiSample[];
  rocketFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineRocketRsiMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  rocketRsi: number;
  zone: ChartLineRocketRsiZone;
}

export interface ChartLineRocketRsiDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineRocketRsiLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  rocketPanelTop: number;
  rocketPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineRocketRsiDot[];
  rocketPath: string;
  markers: ChartLineRocketRsiMarker[];
  zeroY: number;
  rocketMin: number;
  rocketMax: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineRocketRsiRun;
}

export interface ChartLineRocketRsiProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRocketRsiPoint[];
  rsiPeriod?: number;
  smooth1?: number;
  smooth2?: number;
  clamp?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rocketColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  noneColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRocket?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRocketRsiSeriesId[];
  defaultHiddenSeries?: ChartLineRocketRsiSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRocketRsiSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineRocketRsiSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ROCKET_RSI_WIDTH = 720;
export const DEFAULT_CHART_LINE_ROCKET_RSI_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ROCKET_RSI_PADDING = 44;
export const DEFAULT_CHART_LINE_ROCKET_RSI_GAP = 12;
export const DEFAULT_CHART_LINE_ROCKET_RSI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ROCKET_RSI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ROCKET_RSI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ROCKET_RSI_RSI_PERIOD = 8;
export const DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH1 = 5;
export const DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH2 = 5;
export const DEFAULT_CHART_LINE_ROCKET_RSI_CLAMP = 0.999;
export const DEFAULT_CHART_LINE_ROCKET_RSI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ROCKET_RSI_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ROCKET_RSI_ROCKET_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ROCKET_RSI_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ROCKET_RSI_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ROCKET_RSI_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ROCKET_RSI_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ROCKET_RSI_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ROCKET_RSI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ROCKET_RSI_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and value. */
export function getLineRocketRsiFinitePoints(
  data: readonly ChartLineRocketRsiPoint[] | null | undefined,
): ChartLineRocketRsiPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRocketRsiPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a positive-integer parameter (>= 1). */
export function normalizeLineRocketRsiInteger(
  value: unknown,
  fallback: number,
  min = 1,
): number {
  if (isFiniteNumber(value) && value >= min) return Math.floor(value);
  return fallback;
}

/** Coerce the Fisher clamp to a finite value strictly inside `(0, 1)`. */
export function normalizeLineRocketRsiClamp(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0 && value < 1) return value;
  return fallback;
}

/**
 * Standard RSI of close-to-close changes over `period`. A flat window
 * (no gains, no losses) returns 50 by convention; bars before the
 * lookback fills are null.
 */
export function computeLineRocketRsiRSI(
  values: readonly number[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const p = normalizeLineRocketRsiInteger(
    period,
    DEFAULT_CHART_LINE_ROCKET_RSI_RSI_PERIOD,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < p) {
      out.push(null);
      continue;
    }
    let sumGain = 0;
    let sumLoss = 0;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const curr = values[j];
      const prev = values[j - 1];
      if (!isFiniteNumber(curr) || !isFiniteNumber(prev)) {
        ok = false;
        break;
      }
      const diff = curr - prev;
      if (diff > 0) sumGain += diff;
      else if (diff < 0) sumLoss += -diff;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const total = sumGain + sumLoss;
    if (total === 0) {
      out.push(50);
      continue;
    }
    out.push((100 * sumGain) / total);
  }
  return out;
}

/**
 * SMA-smooth a numeric (or nullable) series with a fixed window. The
 * smoothed value at bar i is the mean of the most recent `window`
 * defined values; if any value in the window is null the output is
 * null.
 */
export function computeLineRocketRsiSmooth(
  values: ReadonlyArray<number | null> | null | undefined,
  window: unknown,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const w = normalizeLineRocketRsiInteger(
    window,
    DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH1,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < w - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = i - w + 1; j <= i; j += 1) {
      const v = values[j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / w : null);
  }
  return out;
}

/**
 * Fisher Transform of `x` after clamping to `[-clamp, clamp]`:
 *   `fisher(x) = 0.5 * ln( (1 + x_clamped) / (1 - x_clamped) )`.
 *
 * `fisher(0) === 0` bit-exact: `ln(1) === 0` and `0.5 * 0 === 0`.
 */
export function computeLineRocketRsiFisher(
  x: number,
  clamp: number = DEFAULT_CHART_LINE_ROCKET_RSI_CLAMP,
): number {
  if (!isFiniteNumber(x)) return 0;
  const c = clamp > 0 && clamp < 1 ? clamp : DEFAULT_CHART_LINE_ROCKET_RSI_CLAMP;
  const xc = Math.max(-c, Math.min(c, x));
  return 0.5 * Math.log((1 + xc) / (1 - xc));
}

/** Classify a Rocket RSI value by its sign. */
export function classifyLineRocketRsiZone(
  value: number | null,
): ChartLineRocketRsiZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

export interface ChartLineRocketRsiOptions {
  rsiPeriod?: number;
  smooth1?: number;
  smooth2?: number;
  clamp?: number;
}

/**
 * Run the full Rocket RSI pipeline: RSI -> smooth1 -> smooth2 ->
 * normalize -> Fisher.
 */
export function computeLineRocketRsi(
  values: readonly number[] | null | undefined,
  options: ChartLineRocketRsiOptions = {},
): {
  rsi: Array<number | null>;
  smoothed: Array<number | null>;
  rocketRsi: Array<number | null>;
} {
  if (!Array.isArray(values) || values.length === 0) {
    return { rsi: [], smoothed: [], rocketRsi: [] };
  }
  const rsiPeriod = normalizeLineRocketRsiInteger(
    options.rsiPeriod,
    DEFAULT_CHART_LINE_ROCKET_RSI_RSI_PERIOD,
  );
  const smooth1 = normalizeLineRocketRsiInteger(
    options.smooth1,
    DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH1,
  );
  const smooth2 = normalizeLineRocketRsiInteger(
    options.smooth2,
    DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH2,
  );
  const clamp = normalizeLineRocketRsiClamp(
    options.clamp,
    DEFAULT_CHART_LINE_ROCKET_RSI_CLAMP,
  );
  const rsi = computeLineRocketRsiRSI(values, rsiPeriod);
  const pass1 = computeLineRocketRsiSmooth(rsi, smooth1);
  const smoothed = computeLineRocketRsiSmooth(pass1, smooth2);
  const rocketRsi: Array<number | null> = smoothed.map((v) => {
    if (!isFiniteNumber(v)) return null;
    const normalized = v / 50 - 1;
    return computeLineRocketRsiFisher(normalized, clamp);
  });
  return { rsi, smoothed, rocketRsi };
}

/** Run the full pipeline including sample assembly. */
export function runLineRocketRsi(
  data: readonly ChartLineRocketRsiPoint[] | null | undefined,
  options: ChartLineRocketRsiOptions = {},
): ChartLineRocketRsiRun {
  const series = getLineRocketRsiFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const rsiPeriod = normalizeLineRocketRsiInteger(
    options.rsiPeriod,
    DEFAULT_CHART_LINE_ROCKET_RSI_RSI_PERIOD,
  );
  const smooth1 = normalizeLineRocketRsiInteger(
    options.smooth1,
    DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH1,
  );
  const smooth2 = normalizeLineRocketRsiInteger(
    options.smooth2,
    DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH2,
  );
  const clamp = normalizeLineRocketRsiClamp(
    options.clamp,
    DEFAULT_CHART_LINE_ROCKET_RSI_CLAMP,
  );
  const { rsi, rocketRsi } = computeLineRocketRsi(
    series.map((p) => p.value),
    { rsiPeriod, smooth1, smooth2, clamp },
  );
  const samples: ChartLineRocketRsiSample[] = series.map((point, index) => {
    const r = rocketRsi[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      rsi: rsi[index] ?? null,
      rocketRsi: r,
      zone: classifyLineRocketRsiZone(r),
    };
  });
  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let rocketFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.rocketRsi)) rocketFinal = sample.rocketRsi;
  }
  return {
    series = [],
    rsiPeriod,
    smooth1,
    smooth2,
    clamp,
    rsi,
    rocketRsi,
    samples,
    rocketFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineRocketRsiLayoutOptions
  extends ChartLineRocketRsiOptions {
  data: readonly ChartLineRocketRsiPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
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

/** Project the run into a two-panel SVG layout. */
export function computeLineRocketRsiLayout(
  options: ChartLineRocketRsiLayoutOptions,
): ChartLineRocketRsiLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ROCKET_RSI_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ROCKET_RSI_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ROCKET_RSI_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_ROCKET_RSI_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_ROCKET_RSI_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineRocketRsi(options.data, {
    ...(options.rsiPeriod !== undefined ? { rsiPeriod: options.rsiPeriod } : {}),
    ...(options.smooth1 !== undefined ? { smooth1: options.smooth1 } : {}),
    ...(options.smooth2 !== undefined ? { smooth2: options.smooth2 } : {}),
    ...(options.clamp !== undefined ? { clamp: options.clamp } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;
  const innerWidth = innerRight - innerLeft;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const rocketPanelTop = pricePanelBottom + gap;
  const rocketPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    rocketPanelBottom - rocketPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.value < priceMin) priceMin = sample.value;
    if (sample.value > priceMax) priceMax = sample.value;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }
  const priceYAt = (value: number): number =>
    pricePanelBottom -
    ((value - priceMin) / (priceMax - priceMin)) * pricePanelHeight;

  let rocketMag = 0;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.rocketRsi)) {
      const a = Math.abs(sample.rocketRsi);
      if (a > rocketMag) rocketMag = a;
    }
  }
  const rocketBound = Math.max(rocketMag * 1.1, 1);
  const rocketMin = -rocketBound;
  const rocketMax = rocketBound;
  const rocketPanelHeight = rocketPanelBottom - rocketPanelTop;
  const rocketYAt = (value: number): number =>
    rocketPanelBottom -
    ((value - rocketMin) / (rocketMax - rocketMin)) * rocketPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineRocketRsiDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, value: sample.value });
  });

  const rocketLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineRocketRsiMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.rocketRsi)) return;
    const cx = xAt(index);
    const cy = rocketYAt(sample.rocketRsi);
    rocketLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      rocketRsi: sample.rocketRsi,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    rocketPanelTop,
    rocketPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    rocketPath: buildLinePath(rocketLinePoints),
    markers,
    zeroY: rocketYAt(0),
    rocketMin,
    rocketMax,
    priceMin,
    priceMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineRocketRsiChart(
  data: readonly ChartLineRocketRsiPoint[] | null | undefined,
  options: ChartLineRocketRsiOptions = {},
): string {
  const run = runLineRocketRsi(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.rocketFinal === null ? 'n/a' : run.rocketFinal.toFixed(3);
  return (
    `Two-panel chart with a Rocket RSI panel (rsiPeriod ${run.rsiPeriod}, ` +
    `smooth1 ${run.smooth1}, smooth2 ${run.smooth2}): the top panel ` +
    `plots the price, the bottom panel plots the Fisher Transform of a ` +
    `double-smoothed RSI. The standard RSI is smoothed twice with ` +
    `simple moving averages, normalized to [-1, 1], clamped past the ` +
    `singularity, and run through the Fisher Transform to sharpen the ` +
    `turning points. Across ${total} bars the rocket is positive on ` +
    `${run.upCount}, negative on ${run.downCount} and at zero on ` +
    `${run.flatCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineRocketRsiZone,
  upColor: string,
  downColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineRocketRsiZone): string {
  if (zone === 'up') return 'Bull bias';
  if (zone === 'down') return 'Bear bias';
  if (zone === 'flat') return 'Balanced';
  return 'n/a';
}

/**
 * ChartLineRocketRsi -- two-panel pure-SVG Rocket RSI chart.
 */
export const ChartLineRocketRsi = forwardRef<
  HTMLDivElement,
  ChartLineRocketRsiProps
>(function ChartLineRocketRsi(props, ref) {
  const {
    data,
    rsiPeriod = DEFAULT_CHART_LINE_ROCKET_RSI_RSI_PERIOD,
    smooth1 = DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH1,
    smooth2 = DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH2,
    clamp = DEFAULT_CHART_LINE_ROCKET_RSI_CLAMP,
    width = DEFAULT_CHART_LINE_ROCKET_RSI_WIDTH,
    height = DEFAULT_CHART_LINE_ROCKET_RSI_HEIGHT,
    padding = DEFAULT_CHART_LINE_ROCKET_RSI_PADDING,
    gap = DEFAULT_CHART_LINE_ROCKET_RSI_GAP,
    tickCount = DEFAULT_CHART_LINE_ROCKET_RSI_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ROCKET_RSI_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_ROCKET_RSI_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ROCKET_RSI_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ROCKET_RSI_PRICE_COLOR,
    rocketColor = DEFAULT_CHART_LINE_ROCKET_RSI_ROCKET_COLOR,
    upColor = DEFAULT_CHART_LINE_ROCKET_RSI_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_ROCKET_RSI_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_ROCKET_RSI_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_ROCKET_RSI_NONE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ROCKET_RSI_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_ROCKET_RSI_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ROCKET_RSI_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRocket = true,
    showZeroLine = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatValue = defaultFormatValue,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-rocket-rsi-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineRocketRsiSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineRocketRsiSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineRocketRsiLayout({
        data,
        rsiPeriod,
        smooth1,
        smooth2,
        clamp,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      rsiPeriod,
      smooth1,
      smooth2,
      clamp,
      width,
      height,
      padding,
      gap,
      pricePanelRatio,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineRocketRsiChart(data, {
      rsiPeriod,
      smooth1,
      smooth2,
      clamp,
    });
  const resolvedLabel =
    ariaLabel ??
    `Rocket RSI chart, rsiPeriod ${run.rsiPeriod}, smoothing ${run.smooth1}/${run.smooth2}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineRocketRsiSeriesId): void => {
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
    const tooltipW = 200;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-rocket-rsi-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={104}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-rocket-rsi-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-rocket-rsi-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-rocket-rsi-tooltip-rsi"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`RSI: ${
            hoverSample.rsi === null ? 'n/a' : hoverSample.rsi.toFixed(2)
          }`}
        </text>
        <text
          data-section="chart-line-rocket-rsi-tooltip-rocket"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Rocket: ${
            hoverSample.rocketRsi === null
              ? 'n/a'
              : hoverSample.rocketRsi.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-rocket-rsi-tooltip-zone"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Bias: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const rocketHidden = isHidden('rocket') || !showRocket;

  const legendItems: Array<{
    id: ChartLineRocketRsiSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'rocket', label: 'Rocket RSI', color: rocketColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-rocket-rsi"
      data-empty={isEmpty ? 'true' : 'false'}
      data-rsi-period={run.rsiPeriod}
      data-smooth1={run.smooth1}
      data-smooth2={run.smooth2}
      data-clamp={run.clamp}
      data-rocket-final={run.rocketFinal === null ? '' : run.rocketFinal}
      data-up-count={run.upCount}
      data-down-count={run.downCount}
      data-flat-count={run.flatCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-rocket-rsi-aria-desc"
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
          data-section="chart-line-rocket-rsi-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-rocket-rsi-empty"
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
          data-section="chart-line-rocket-rsi-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-rocket-rsi-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-rocket-rsi-grid-line"
                    data-panel="price"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
              {tickValues.map((t, i) => {
                const py =
                  layout.rocketPanelBottom -
                  t * (layout.rocketPanelBottom - layout.rocketPanelTop);
                return (
                  <line
                    key={`rg-${i}`}
                    data-section="chart-line-rocket-rsi-grid-line"
                    data-panel="rocket"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-rocket-rsi-axes">
              <line
                data-section="chart-line-rocket-rsi-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-rocket-rsi-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-rocket-rsi-axis"
                data-panel="rocket"
                x1={layout.innerLeft}
                y1={layout.rocketPanelTop}
                x2={layout.innerLeft}
                y2={layout.rocketPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-rocket-rsi-axis"
                data-panel="rocket"
                x1={layout.innerLeft}
                y1={layout.rocketPanelBottom}
                x2={layout.innerRight}
                y2={layout.rocketPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-rocket-rsi-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.pricePanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-rocket-rsi-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.pricePanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-rocket-rsi-tick-label"
                data-panel="rocket"
                x={layout.innerLeft - 6}
                y={layout.rocketPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {layout.rocketMax.toFixed(2)}
              </text>
              <text
                data-section="chart-line-rocket-rsi-tick-label"
                data-panel="rocket"
                x={layout.innerLeft - 6}
                y={layout.rocketPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {layout.rocketMin.toFixed(2)}
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-rocket-rsi-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Price
          </text>
          <text
            data-section="chart-line-rocket-rsi-panel-label"
            data-panel="rocket"
            x={layout.innerRight}
            y={layout.rocketPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Rocket RSI
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-rocket-rsi-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-rocket-rsi-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Price line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-rocket-rsi-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-rocket-rsi-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, price ${formatValue(
                    dot.value,
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

          {!rocketHidden ? (
            <path
              data-section="chart-line-rocket-rsi-rocket-line"
              d={layout.rocketPath}
              fill="none"
              stroke={rocketColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Rocket RSI line, ${layout.markers.length} points`}
            />
          ) : null}

          {!rocketHidden && showMarkers ? (
            <g data-section="chart-line-rocket-rsi-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-rocket-rsi-marker"
                  data-zone={marker.zone}
                  data-rocket-rsi={marker.rocketRsi}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    upColor,
                    downColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, rocket ${formatValue(
                    marker.rocketRsi,
                  )}, ${zoneLabelOf(marker.zone)}`}
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
            <g data-section="chart-line-rocket-rsi-badge">
              <rect
                data-section="chart-line-rocket-rsi-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-rocket-rsi-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ROCKET ${run.rsiPeriod}/${run.smooth1}/${run.smooth2}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-rocket-rsi-legend"
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
                data-section="chart-line-rocket-rsi-legend-item"
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
                  data-section="chart-line-rocket-rsi-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-rocket-rsi-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-rocket-rsi-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineRocketRsi.displayName = 'ChartLineRocketRsi';
