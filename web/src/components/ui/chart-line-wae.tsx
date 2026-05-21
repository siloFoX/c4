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
 * ChartLineWae -- pure-SVG two-panel Waddah Attar Explosion chart.
 *
 * The Waddah Attar Explosion pits a MACD-derived momentum reading against
 * a Bollinger Band width "explosion line". The momentum is the change in
 * the MACD scaled by a sensitivity factor -- positive for an up push,
 * negative for a down push. The explosion line is the width of the
 * Bollinger Band (twice the multiplier times the rolling standard
 * deviation). A bar EXPLODES -- a tradeable breakout -- when the
 * magnitude of the momentum exceeds the explosion line; the sign of the
 * momentum gives the direction.
 *
 * The top panel plots the price; the bottom panel plots the signed
 * momentum line bracketed by the explosion band.
 */

export interface ChartLineWaePoint {
  x: number;
  value: number;
}

export type ChartLineWaeZone =
  | 'explosive-up'
  | 'explosive-down'
  | 'quiet'
  | 'none';

export type ChartLineWaeSeriesId = 'price' | 'momentum' | 'explosion';

export interface ChartLineWaeSample {
  index: number;
  x: number;
  value: number;
  trend: number | null;
  explosion: number | null;
  zone: ChartLineWaeZone;
}

export interface ChartLineWaeRun {
  series: ChartLineWaePoint[];
  fastPeriod: number;
  slowPeriod: number;
  bbPeriod: number;
  bbMult: number;
  sensitivity: number;
  macd: (number | null)[];
  trend: (number | null)[];
  explosion: (number | null)[];
  samples: ChartLineWaeSample[];
  trendFinal: number | null;
  explosiveUpCount: number;
  explosiveDownCount: number;
  quietCount: number;
  ok: boolean;
}

export interface ChartLineWaeMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  trend: number;
  zone: ChartLineWaeZone;
}

export interface ChartLineWaeDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineWaeLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  waePanelTop: number;
  waePanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineWaeDot[];
  momentumPath: string;
  explosionPath: string;
  explosionMirrorPath: string;
  markers: ChartLineWaeMarker[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  waeMin: number;
  waeMax: number;
  run: ChartLineWaeRun;
}

export interface ChartLineWaeProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineWaePoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  bbPeriod?: number;
  bbMult?: number;
  sensitivity?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  momentumColor?: string;
  explosionColor?: string;
  explosiveUpColor?: string;
  explosiveDownColor?: string;
  quietColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMomentum?: boolean;
  showExplosion?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineWaeSeriesId[];
  defaultHiddenSeries?: ChartLineWaeSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineWaeSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineWaeSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_WAE_WIDTH = 720;
export const DEFAULT_CHART_LINE_WAE_HEIGHT = 400;
export const DEFAULT_CHART_LINE_WAE_PADDING = 44;
export const DEFAULT_CHART_LINE_WAE_GAP = 12;
export const DEFAULT_CHART_LINE_WAE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WAE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WAE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WAE_FAST_PERIOD = 20;
export const DEFAULT_CHART_LINE_WAE_SLOW_PERIOD = 40;
export const DEFAULT_CHART_LINE_WAE_BB_PERIOD = 20;
export const DEFAULT_CHART_LINE_WAE_BB_MULT = 2;
export const DEFAULT_CHART_LINE_WAE_SENSITIVITY = 150;
export const DEFAULT_CHART_LINE_WAE_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_WAE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WAE_MOMENTUM_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_WAE_EXPLOSION_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_WAE_EXPLOSIVE_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WAE_EXPLOSIVE_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WAE_QUIET_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_WAE_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WAE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_WAE_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineWaeFinitePoints(
  data: readonly ChartLineWaePoint[] | null | undefined,
): ChartLineWaePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineWaePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLineWaePeriod(period: unknown, fallback: number): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/** EMA seeded from the first finite value (alpha = 2 / (period + 1)). */
export function computeLineWaeEma(
  values: readonly (number | null | undefined)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineWaePeriod(period, 1);
  const alpha = 2 / (p + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (const v of values) {
    if (!isFiniteNumber(v)) {
      out.push(prev);
      continue;
    }
    prev = prev === null ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/** MACD line: the fast EMA of the values minus the slow EMA. */
export function computeLineWaeMacd(
  values: readonly number[] | null | undefined,
  fastPeriod: number,
  slowPeriod: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const fast = computeLineWaeEma(values, fastPeriod);
  const slow = computeLineWaeEma(values, slowPeriod);
  return values.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return isFiniteNumber(f) && isFiniteNumber(s) ? f - s : null;
  });
}

/** Population standard deviation over the trailing window. */
export function computeLineWaeStdev(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineWaePeriod(period, 1);
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < p) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const v = values[k];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const mean = sum / p;
    let sq = 0;
    for (let k = i - p + 1; k <= i; k += 1) {
      const d = (values[k] as number) - mean;
      sq += d * d;
    }
    out.push(Math.sqrt(sq / p));
  }
  return out;
}

/** Bollinger Band width: `2 * multiplier * rolling standard deviation`. */
export function computeLineWaeBollWidth(
  values: readonly number[] | null | undefined,
  bbPeriod: number,
  bbMult: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const mult = isFiniteNumber(bbMult) && bbMult > 0 ? bbMult : DEFAULT_CHART_LINE_WAE_BB_MULT;
  const stdev = computeLineWaeStdev(values, bbPeriod);
  return stdev.map((s) => (isFiniteNumber(s) ? 2 * mult * s : null));
}

/** Classify a bar by the momentum against the explosion line. */
export function classifyLineWaeZone(
  trend: number | null,
  explosion: number | null,
): ChartLineWaeZone {
  if (!isFiniteNumber(trend) || !isFiniteNumber(explosion)) return 'none';
  if (Math.abs(trend) > explosion) {
    return trend >= 0 ? 'explosive-up' : 'explosive-down';
  }
  return 'quiet';
}

export interface ChartLineWaeOptions {
  fastPeriod?: number;
  slowPeriod?: number;
  bbPeriod?: number;
  bbMult?: number;
  sensitivity?: number;
}

export interface ChartLineWaeComputed {
  macd: (number | null)[];
  trend: (number | null)[];
  explosion: (number | null)[];
}

/** Compute the full Waddah Attar Explosion pipeline for a close series. */
export function computeLineWae(
  values: readonly number[] | null | undefined,
  options: ChartLineWaeOptions = {},
): ChartLineWaeComputed {
  if (!Array.isArray(values)) return { macd: [], trend: [], explosion: [] };
  const fastPeriod = normalizeLineWaePeriod(
    options.fastPeriod,
    DEFAULT_CHART_LINE_WAE_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineWaePeriod(
    options.slowPeriod,
    DEFAULT_CHART_LINE_WAE_SLOW_PERIOD,
  );
  const bbPeriod = normalizeLineWaePeriod(
    options.bbPeriod,
    DEFAULT_CHART_LINE_WAE_BB_PERIOD,
  );
  const bbMult =
    isFiniteNumber(options.bbMult) && options.bbMult > 0
      ? options.bbMult
      : DEFAULT_CHART_LINE_WAE_BB_MULT;
  const sensitivity =
    isFiniteNumber(options.sensitivity) && options.sensitivity > 0
      ? options.sensitivity
      : DEFAULT_CHART_LINE_WAE_SENSITIVITY;

  const macd = computeLineWaeMacd(values, fastPeriod, slowPeriod);
  const trend: (number | null)[] = macd.map((m, i) => {
    if (i === 0) return null;
    const prev = macd[i - 1];
    return isFiniteNumber(m) && isFiniteNumber(prev)
      ? (m - prev) * sensitivity
      : null;
  });
  const explosion = computeLineWaeBollWidth(values, bbPeriod, bbMult);
  return { macd, trend, explosion };
}

/** Run the full Waddah Attar Explosion pipeline over a set of points. */
export function runLineWae(
  data: readonly ChartLineWaePoint[] | null | undefined,
  options: ChartLineWaeOptions = {},
): ChartLineWaeRun {
  const series = getLineWaeFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const fastPeriod = normalizeLineWaePeriod(
    options.fastPeriod,
    DEFAULT_CHART_LINE_WAE_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineWaePeriod(
    options.slowPeriod,
    DEFAULT_CHART_LINE_WAE_SLOW_PERIOD,
  );
  const bbPeriod = normalizeLineWaePeriod(
    options.bbPeriod,
    DEFAULT_CHART_LINE_WAE_BB_PERIOD,
  );
  const bbMult =
    isFiniteNumber(options.bbMult) && options.bbMult > 0
      ? options.bbMult
      : DEFAULT_CHART_LINE_WAE_BB_MULT;
  const sensitivity =
    isFiniteNumber(options.sensitivity) && options.sensitivity > 0
      ? options.sensitivity
      : DEFAULT_CHART_LINE_WAE_SENSITIVITY;

  const values = series.map((point) => point.value);
  const { macd, trend, explosion } = computeLineWae(values, {
    fastPeriod,
    slowPeriod,
    bbPeriod,
    bbMult,
    sensitivity,
  });

  const samples: ChartLineWaeSample[] = series.map((point, index) => {
    const trendValue = trend[index] ?? null;
    const explosionValue = explosion[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      trend: trendValue,
      explosion: explosionValue,
      zone: classifyLineWaeZone(trendValue, explosionValue),
    };
  });

  let explosiveUpCount = 0;
  let explosiveDownCount = 0;
  let quietCount = 0;
  let trendFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'explosive-up') explosiveUpCount += 1;
    else if (sample.zone === 'explosive-down') explosiveDownCount += 1;
    else if (sample.zone === 'quiet') quietCount += 1;
    if (isFiniteNumber(sample.trend)) trendFinal = sample.trend;
  }

  return {
    series,
    fastPeriod,
    slowPeriod,
    bbPeriod,
    bbMult,
    sensitivity,
    macd,
    trend,
    explosion,
    samples,
    trendFinal,
    explosiveUpCount,
    explosiveDownCount,
    quietCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineWaeLayoutOptions extends ChartLineWaeOptions {
  data: readonly ChartLineWaePoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
}

function buildLinePath(points: ReadonlyArray<{ x: number; y: number }>): string {
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
export function computeLineWaeLayout(
  options: ChartLineWaeLayoutOptions,
): ChartLineWaeLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_WAE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_WAE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_WAE_PADDING;
  const gap = isFiniteNumber(options.gap) ? options.gap : DEFAULT_CHART_LINE_WAE_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_WAE_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineWae(options.data, {
    ...(options.fastPeriod !== undefined ? { fastPeriod: options.fastPeriod } : {}),
    ...(options.slowPeriod !== undefined ? { slowPeriod: options.slowPeriod } : {}),
    ...(options.bbPeriod !== undefined ? { bbPeriod: options.bbPeriod } : {}),
    ...(options.bbMult !== undefined ? { bbMult: options.bbMult } : {}),
    ...(options.sensitivity !== undefined
      ? { sensitivity: options.sensitivity }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const waePanelTop = pricePanelBottom + gap;
  const waePanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && waePanelBottom - waePanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const point of run.series) {
    if (point.value < priceMin) priceMin = point.value;
    if (point.value > priceMax) priceMax = point.value;
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

  let waeMin = 0;
  let waeMax = 0;
  for (const v of run.trend) {
    if (!isFiniteNumber(v)) continue;
    if (v < waeMin) waeMin = v;
    if (v > waeMax) waeMax = v;
  }
  for (const v of run.explosion) {
    if (!isFiniteNumber(v)) continue;
    if (v > waeMax) waeMax = v;
    if (-v < waeMin) waeMin = -v;
  }
  if (waeMin === waeMax) {
    waeMin -= 1;
    waeMax += 1;
  }
  const waePanelHeight = waePanelBottom - waePanelTop;
  const waeYAt = (value: number): number =>
    waePanelBottom - ((value - waeMin) / (waeMax - waeMin)) * waePanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineWaeDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const momentumLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineWaeMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.trend)) return;
    const cx = xAt(index);
    const cy = waeYAt(sample.trend);
    momentumLinePoints.push({ x: cx, y: cy });
    markers.push({ index, x: sample.x, cx, cy, trend: sample.trend, zone: sample.zone });
  });

  const explosionLinePoints: Array<{ x: number; y: number }> = [];
  const explosionMirrorPoints: Array<{ x: number; y: number }> = [];
  run.explosion.forEach((v, index) => {
    if (!isFiniteNumber(v)) return;
    const cx = xAt(index);
    explosionLinePoints.push({ x: cx, y: waeYAt(v) });
    explosionMirrorPoints.push({ x: cx, y: waeYAt(-v) });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    waePanelTop,
    waePanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    momentumPath: buildLinePath(momentumLinePoints),
    explosionPath: buildLinePath(explosionLinePoints),
    explosionMirrorPath: buildLinePath(explosionMirrorPoints),
    markers,
    zeroY: waeYAt(0),
    priceMin,
    priceMax,
    waeMin,
    waeMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineWaeChart(
  data: readonly ChartLineWaePoint[] | null | undefined,
  options: ChartLineWaeOptions = {},
): string {
  const run = runLineWae(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.trendFinal === null ? 'n/a' : run.trendFinal.toFixed(2);
  return (
    `Two-panel chart with the Waddah Attar Explosion (WAE, MACD ` +
    `${run.fastPeriod}/${run.slowPeriod}, Bollinger ${run.bbPeriod}): the ` +
    `top panel plots the price, the bottom panel plots the WAE momentum and ` +
    `the explosion line. The momentum is the change in the MACD scaled by a ` +
    `sensitivity factor; the explosion line is the Bollinger Band width. A ` +
    `bar explodes -- a tradeable breakout -- when the momentum magnitude ` +
    `exceeds the explosion line. Across ${total} bars it explodes up on ` +
    `${run.explosiveUpCount}, down on ${run.explosiveDownCount} and is quiet ` +
    `on ${run.quietCount}. The final momentum is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineWaeZone,
  upColor: string,
  downColor: string,
  quietColor: string,
): string {
  if (zone === 'explosive-up') return upColor;
  if (zone === 'explosive-down') return downColor;
  return quietColor;
}

function zoneLabelOf(zone: ChartLineWaeZone): string {
  if (zone === 'explosive-up') return 'Explosive up';
  if (zone === 'explosive-down') return 'Explosive down';
  if (zone === 'quiet') return 'Quiet';
  return 'n/a';
}

/**
 * ChartLineWae -- two-panel pure-SVG Waddah Attar Explosion chart.
 */
export const ChartLineWae = forwardRef<HTMLDivElement, ChartLineWaeProps>(
  function ChartLineWae(props, ref) {
    const {
      data,
      fastPeriod = DEFAULT_CHART_LINE_WAE_FAST_PERIOD,
      slowPeriod = DEFAULT_CHART_LINE_WAE_SLOW_PERIOD,
      bbPeriod = DEFAULT_CHART_LINE_WAE_BB_PERIOD,
      bbMult = DEFAULT_CHART_LINE_WAE_BB_MULT,
      sensitivity = DEFAULT_CHART_LINE_WAE_SENSITIVITY,
      width = DEFAULT_CHART_LINE_WAE_WIDTH,
      height = DEFAULT_CHART_LINE_WAE_HEIGHT,
      padding = DEFAULT_CHART_LINE_WAE_PADDING,
      gap = DEFAULT_CHART_LINE_WAE_GAP,
      tickCount = DEFAULT_CHART_LINE_WAE_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_WAE_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_WAE_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_WAE_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_WAE_PRICE_COLOR,
      momentumColor = DEFAULT_CHART_LINE_WAE_MOMENTUM_COLOR,
      explosionColor = DEFAULT_CHART_LINE_WAE_EXPLOSION_COLOR,
      explosiveUpColor = DEFAULT_CHART_LINE_WAE_EXPLOSIVE_UP_COLOR,
      explosiveDownColor = DEFAULT_CHART_LINE_WAE_EXPLOSIVE_DOWN_COLOR,
      quietColor = DEFAULT_CHART_LINE_WAE_QUIET_COLOR,
      zeroColor = DEFAULT_CHART_LINE_WAE_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_WAE_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_WAE_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showMomentum = true,
      showExplosion = true,
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
    const baseId = `chart-line-wae-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineWaeSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineWaeSeriesId): boolean => hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineWaeLayout({
          data,
          fastPeriod,
          slowPeriod,
          bbPeriod,
          bbMult,
          sensitivity,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
        }),
      [
        data,
        fastPeriod,
        slowPeriod,
        bbPeriod,
        bbMult,
        sensitivity,
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
      describeLineWaeChart(data, {
        fastPeriod,
        slowPeriod,
        bbPeriod,
        bbMult,
        sensitivity,
      });
    const resolvedLabel =
      ariaLabel ??
      `Waddah Attar Explosion chart, MACD ${run.fastPeriod}/${run.slowPeriod}, Bollinger ${run.bbPeriod}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineWaeSeriesId): void => {
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
      const tooltipW = 178;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.pricePanelTop + 6;
      tooltip = (
        <g data-section="chart-line-wae-tooltip" pointerEvents="none">
          <rect
            x={tx}
            y={ty}
            width={tooltipW}
            height={96}
            rx={6}
            fill="#0f172a"
            opacity={0.92}
          />
          <text
            data-section="chart-line-wae-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-wae-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-wae-tooltip-momentum"
            x={tx + 10}
            y={ty + 51}
            fill="#c4b5fd"
            fontSize={11}
          >
            {`Momentum: ${
              hoverSample.trend === null ? 'n/a' : formatValue(hoverSample.trend)
            }`}
          </text>
          <text
            data-section="chart-line-wae-tooltip-explosion"
            x={tx + 10}
            y={ty + 67}
            fill="#fdba74"
            fontSize={11}
          >
            {`Explosion: ${
              hoverSample.explosion === null
                ? 'n/a'
                : formatValue(hoverSample.explosion)
            }`}
          </text>
          <text
            data-section="chart-line-wae-tooltip-zone"
            x={tx + 10}
            y={ty + 83}
            fill="#cbd5e1"
            fontSize={11}
            fontWeight={600}
          >
            {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const momentumHidden = isHidden('momentum') || !showMomentum;
    const explosionHidden = isHidden('explosion') || !showExplosion;

    const legendItems: Array<{
      id: ChartLineWaeSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'momentum', label: 'Momentum', color: momentumColor },
      { id: 'explosion', label: 'Explosion', color: explosionColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-wae"
        data-empty={isEmpty ? 'true' : 'false'}
        data-fast-period={run.fastPeriod}
        data-slow-period={run.slowPeriod}
        data-bb-period={run.bbPeriod}
        data-bb-mult={run.bbMult}
        data-sensitivity={run.sensitivity}
        data-trend-final={run.trendFinal === null ? '' : run.trendFinal}
        data-explosive-up-count={run.explosiveUpCount}
        data-explosive-down-count={run.explosiveDownCount}
        data-quiet-count={run.quietCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-wae-aria-desc"
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
            data-section="chart-line-wae-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-wae-empty"
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
            data-section="chart-line-wae-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-wae-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-wae-grid-line"
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
                  const wy =
                    layout.waePanelBottom -
                    t * (layout.waePanelBottom - layout.waePanelTop);
                  return (
                    <line
                      key={`wg-${i}`}
                      data-section="chart-line-wae-grid-line"
                      data-panel="wae"
                      x1={layout.innerLeft}
                      y1={wy}
                      x2={layout.innerRight}
                      y2={wy}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g data-section="chart-line-wae-axes">
                <line
                  data-section="chart-line-wae-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-wae-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-wae-axis"
                  data-panel="wae"
                  x1={layout.innerLeft}
                  y1={layout.waePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.waePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-wae-axis"
                  data-panel="wae"
                  x1={layout.innerLeft}
                  y1={layout.waePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.waePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-wae-tick-label"
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
                  data-section="chart-line-wae-tick-label"
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
                  data-section="chart-line-wae-tick-label"
                  data-panel="wae"
                  x={layout.innerLeft - 6}
                  y={layout.waePanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.waeMax)}
                </text>
                <text
                  data-section="chart-line-wae-tick-label"
                  data-panel="wae"
                  x={layout.innerLeft - 6}
                  y={layout.waePanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.waeMin)}
                </text>
              </g>
            ) : null}

            <text
              data-section="chart-line-wae-panel-label"
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
              data-section="chart-line-wae-panel-label"
              data-panel="wae"
              x={layout.innerRight}
              y={layout.waePanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Waddah Attar Explosion
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-wae-zero-line"
                x1={layout.innerLeft}
                y1={layout.zeroY}
                x2={layout.innerRight}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
              />
            ) : null}

            {!explosionHidden ? (
              <g data-section="chart-line-wae-explosion">
                <path
                  data-section="chart-line-wae-explosion-line"
                  d={layout.explosionPath}
                  fill="none"
                  stroke={explosionColor}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="5 3"
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label="Explosion line, the Bollinger Band width"
                />
                <path
                  data-section="chart-line-wae-explosion-mirror"
                  d={layout.explosionMirrorPath}
                  fill="none"
                  stroke={explosionColor}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="5 3"
                />
              </g>
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-wae-price-path"
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
              <g data-section="chart-line-wae-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-wae-dot"
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

            {!momentumHidden ? (
              <path
                data-section="chart-line-wae-momentum-line"
                d={layout.momentumPath}
                fill="none"
                stroke={momentumColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`WAE momentum line, ${layout.markers.length} points`}
              />
            ) : null}

            {!momentumHidden && showMarkers ? (
              <g data-section="chart-line-wae-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-wae-marker"
                    data-zone={marker.zone}
                    data-trend={marker.trend}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      explosiveUpColor,
                      explosiveDownColor,
                      quietColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, momentum ${formatValue(
                      marker.trend,
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
              <g data-section="chart-line-wae-badge">
                <rect
                  data-section="chart-line-wae-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={88}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-wae-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`WAE ${run.fastPeriod}/${run.slowPeriod}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-wae-legend"
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
                  data-section="chart-line-wae-legend-item"
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
                    data-section="chart-line-wae-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-wae-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-wae-legend-stats"
              style={{ color: axisColor }}
            >
              {`up ${run.explosiveUpCount} / down ${run.explosiveDownCount} / quiet ${run.quietCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineWae.displayName = 'ChartLineWae';
