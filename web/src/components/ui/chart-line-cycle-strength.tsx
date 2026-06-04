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
 * ChartLineCycleStrength -- pure-SVG dual-panel chart with the
 * close on the top panel and a Cycle Strength oscillator on the
 * bottom panel. The oscillator measures the rolling cycle
 * energy of the close relative to its total energy:
 *
 *   detrended[i] = close[i] - close[i - cycleLag]   (i >= cycleLag)
 *   cycleEnergy[i] = sum(detrended[j]^2, [i - length + 1, i])
 *   totalEnergy[i] = sum(close[j]^2,    [i - length + 1, i])
 *   strength[i]    = cycleEnergy[i] / totalEnergy[i]   (in [0, ~1])
 *
 * Defaults: `length = 14`, `cycleLag = 7`. Bars before
 * `i = cycleLag + length - 1` are warmup (`strength = null`)
 * because the cycle energy window must lie entirely within bars
 * where `detrended` is defined. When `totalEnergy == 0`
 * (singular: every close in the window is zero) strength is
 * `null`.
 *
 * Bit-exact anchor: **CONST close** (`close = K`, `K != 0`).
 * Every `detrended[i] = K - K = 0` for `i >= cycleLag`, so the
 * cycle-energy sum is exactly zero, and:
 *
 *   strength = 0 / (length * K^2) = 0
 *
 * exactly past warmup, regardless of the sign or magnitude of
 * `K`. The integration sweep verifies this across many `K` and
 * `(length, cycleLag)` combinations.
 *
 * `K = 0` is the singular case: `totalEnergy = 0` and strength
 * is `null`.
 */

export interface ChartLineCycleStrengthPoint {
  x: number;
  close: number;
}

export type ChartLineCycleStrengthZone =
  | 'cyclic'
  | 'mixed'
  | 'trending'
  | 'flat'
  | 'none';

export type ChartLineCycleStrengthSeriesId = 'price' | 'strength';

export interface ChartLineCycleStrengthSample {
  index: number;
  x: number;
  close: number;
  strength: number | null;
  zone: ChartLineCycleStrengthZone;
}

export interface ChartLineCycleStrengthRun {
  series: ChartLineCycleStrengthPoint[];
  length: number;
  cycleLag: number;
  detrended: Array<number | null>;
  strength: Array<number | null>;
  samples: ChartLineCycleStrengthSample[];
  strengthFinal: number | null;
  cyclicCount: number;
  mixedCount: number;
  trendingCount: number;
  flatCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineCycleStrengthMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  strength: number;
  zone: ChartLineCycleStrengthZone;
}

export interface ChartLineCycleStrengthDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCycleStrengthLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  strengthTop: number;
  strengthBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineCycleStrengthDot[];
  strengthPath: string;
  markers: ChartLineCycleStrengthMarker[];
  priceMin: number;
  priceMax: number;
  strengthMin: number;
  strengthMax: number;
  midBaselineY: number;
  run: ChartLineCycleStrengthRun;
}

export interface ChartLineCycleStrengthProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCycleStrengthPoint[];
  length?: number;
  cycleLag?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  strengthColor?: string;
  cyclicColor?: string;
  mixedColor?: string;
  trendingColor?: string;
  flatColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  baselineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStrength?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBaseline?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCycleStrengthSeriesId[];
  defaultHiddenSeries?: ChartLineCycleStrengthSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCycleStrengthSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineCycleStrengthSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatStrength?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_WIDTH = 720;
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_PADDING = 44;
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_LENGTH = 14;
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_CYCLE_LAG = 7;
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_STRENGTH_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_CYCLIC_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_MIXED_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_TRENDING_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_FLAT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CYCLE_STRENGTH_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineCycleStrengthFinitePoints(
  data: readonly ChartLineCycleStrengthPoint[] | null | undefined,
): ChartLineCycleStrengthPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCycleStrengthPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineCycleStrengthLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer cycle lag (>= 1). */
export function normalizeLineCycleStrengthCycleLag(
  cycleLag: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(cycleLag) && cycleLag >= 1) return Math.floor(cycleLag);
  return fallback;
}

/**
 * Compute the detrended series: `close[i] - close[i - cycleLag]`
 * for `i >= cycleLag`, `null` otherwise.
 */
export function computeLineCycleStrengthDetrended(
  closes: readonly (number | null)[] | null | undefined,
  cycleLag: number,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < cycleLag) {
      out.push(null);
      continue;
    }
    const curr = closes[i];
    const past = closes[i - cycleLag];
    if (
      curr == null ||
      past == null ||
      !isFiniteNumber(curr) ||
      !isFiniteNumber(past)
    ) {
      out.push(null);
      continue;
    }
    out.push(curr - past);
  }
  return out;
}

export interface ChartLineCycleStrengthOptions {
  length?: number;
  cycleLag?: number;
}

/**
 * Compute Cycle Strength per bar. Bars before
 * `i = cycleLag + length - 1` are `null`. When `totalEnergy ==
 * 0` (every close in the window is zero) strength is `null`.
 */
export function computeLineCycleStrength(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineCycleStrengthOptions = {},
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const length = normalizeLineCycleStrengthLength(
    options.length,
    DEFAULT_CHART_LINE_CYCLE_STRENGTH_LENGTH,
  );
  const cycleLag = normalizeLineCycleStrengthCycleLag(
    options.cycleLag,
    DEFAULT_CHART_LINE_CYCLE_STRENGTH_CYCLE_LAG,
  );
  const detrended = computeLineCycleStrengthDetrended(closes, cycleLag);
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < cycleLag + length - 1) {
      out.push(null);
      continue;
    }
    let cycleEnergy = 0;
    let totalEnergy = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const d = detrended[i - j];
      const c = closes[i - j];
      if (
        d == null ||
        c == null ||
        !isFiniteNumber(d) ||
        !isFiniteNumber(c)
      ) {
        ok = false;
        break;
      }
      cycleEnergy += d * d;
      totalEnergy += c * c;
    }
    if (!ok || totalEnergy === 0) {
      out.push(null);
      continue;
    }
    const raw = cycleEnergy / totalEnergy;
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

/** Classify a Cycle Strength reading. */
export function classifyLineCycleStrengthZone(
  value: number | null,
): ChartLineCycleStrengthZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value === 0) return 'flat';
  if (value >= 0.5) return 'cyclic';
  if (value >= 0.1) return 'mixed';
  return 'trending';
}

/** Run the full pipeline plus sample classification. */
export function runLineCycleStrength(
  data: readonly ChartLineCycleStrengthPoint[] | null | undefined,
  options: ChartLineCycleStrengthOptions = {},
): ChartLineCycleStrengthRun {
  const series = getLineCycleStrengthFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineCycleStrengthLength(
    options.length,
    DEFAULT_CHART_LINE_CYCLE_STRENGTH_LENGTH,
  );
  const cycleLag = normalizeLineCycleStrengthCycleLag(
    options.cycleLag,
    DEFAULT_CHART_LINE_CYCLE_STRENGTH_CYCLE_LAG,
  );
  const closes = series.map((p) => p.close);
  const detrended = computeLineCycleStrengthDetrended(closes, cycleLag);
  const strength = computeLineCycleStrength(closes, { length, cycleLag });
  const samples: ChartLineCycleStrengthSample[] = series.map((point, index) => {
    const value = strength[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      strength: value,
      zone: classifyLineCycleStrengthZone(value),
    };
  });
  let cyclicCount = 0;
  let mixedCount = 0;
  let trendingCount = 0;
  let flatCount = 0;
  let noneCount = 0;
  let strengthFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'cyclic') cyclicCount += 1;
    else if (sample.zone === 'mixed') mixedCount += 1;
    else if (sample.zone === 'trending') trendingCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.strength)) strengthFinal = sample.strength;
  }
  return {
    series,
    length,
    cycleLag,
    detrended,
    strength,
    samples,
    strengthFinal,
    cyclicCount,
    mixedCount,
    trendingCount,
    flatCount,
    noneCount,
    ok: series.length >= cycleLag + length,
  };
}

export interface ChartLineCycleStrengthLayoutOptions
  extends ChartLineCycleStrengthOptions {
  data: readonly ChartLineCycleStrengthPoint[] | null | undefined;
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
export function computeLineCycleStrengthLayout(
  options: ChartLineCycleStrengthLayoutOptions,
): ChartLineCycleStrengthLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CYCLE_STRENGTH_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CYCLE_STRENGTH_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CYCLE_STRENGTH_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_CYCLE_STRENGTH_PANEL_GAP;

  const run = runLineCycleStrength(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.cycleLag !== undefined
      ? { cycleLag: options.cycleLag }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const strengthHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const strengthTop = priceBottom + panelGap;
  const strengthBottom = strengthTop + strengthHeight;

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

  // Cycle Strength is a normalized ratio expected in [0, ~1]
  // for stationary signals, but theoretically can exceed 1 for
  // pathological inputs. Use [0, 1] as the default range and
  // expand if needed.
  let strengthMin = 0;
  let strengthMax = 1;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.strength)) {
      if (sample.strength > strengthMax) strengthMax = sample.strength;
    }
  }
  if (strengthMin === strengthMax) {
    strengthMax += 1;
  }
  const strengthY = (value: number): number =>
    strengthBottom -
    ((value - strengthMin) / (strengthMax - strengthMin)) * strengthHeight;
  const midBaselineY = strengthY(0.5);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineCycleStrengthDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const strengthLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineCycleStrengthMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.strength)) return;
    const cx = xAt(index);
    const yc = strengthY(sample.strength);
    strengthLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      strength: sample.strength,
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
    strengthTop,
    strengthBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    strengthPath: buildLinePath(strengthLinePoints),
    markers,
    priceMin,
    priceMax,
    strengthMin,
    strengthMax,
    midBaselineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineCycleStrengthChart(
  data: readonly ChartLineCycleStrengthPoint[] | null | undefined,
  options: ChartLineCycleStrengthOptions = {},
): string {
  const run = runLineCycleStrength(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.strengthFinal === null ? 'n/a' : run.strengthFinal.toFixed(4);
  return (
    `Dual-panel chart with a Cycle Strength oscillator panel ` +
    `beneath the close (length ${run.length}, cycleLag ` +
    `${run.cycleLag}). Cycle Strength = sum((close - ` +
    `close[i - cycleLag])^2, length) / sum(close^2, length). ` +
    `Across ${total} bars the strength reads cyclic (>= 0.5) on ` +
    `${run.cyclicCount}, mixed (0.1..0.5) on ${run.mixedCount}, ` +
    `trending (< 0.1) on ${run.trendingCount}, flat (zero) on ` +
    `${run.flatCount}, and undefined on ${run.noneCount}. The ` +
    `final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatStrength(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineCycleStrengthZone,
  cyclicColor: string,
  mixedColor: string,
  trendingColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'cyclic') return cyclicColor;
  if (zone === 'mixed') return mixedColor;
  if (zone === 'trending') return trendingColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineCycleStrengthZone): string {
  if (zone === 'cyclic') return 'Cyclic';
  if (zone === 'mixed') return 'Mixed';
  if (zone === 'trending') return 'Trending';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineCycleStrength -- dual-panel pure-SVG Cycle Strength
 * chart.
 */
export const ChartLineCycleStrength = forwardRef<
  HTMLDivElement,
  ChartLineCycleStrengthProps
>(function ChartLineCycleStrength(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_CYCLE_STRENGTH_LENGTH,
    cycleLag = DEFAULT_CHART_LINE_CYCLE_STRENGTH_CYCLE_LAG,
    width = DEFAULT_CHART_LINE_CYCLE_STRENGTH_WIDTH,
    height = DEFAULT_CHART_LINE_CYCLE_STRENGTH_HEIGHT,
    padding = DEFAULT_CHART_LINE_CYCLE_STRENGTH_PADDING,
    panelGap = DEFAULT_CHART_LINE_CYCLE_STRENGTH_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CYCLE_STRENGTH_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CYCLE_STRENGTH_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CYCLE_STRENGTH_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_PRICE_COLOR,
    strengthColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_STRENGTH_COLOR,
    cyclicColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_CYCLIC_COLOR,
    mixedColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_MIXED_COLOR,
    trendingColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_TRENDING_COLOR,
    flatColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_CYCLE_STRENGTH_BASELINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStrength = true,
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
    formatStrength = defaultFormatStrength,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-cycle-strength-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineCycleStrengthSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineCycleStrengthSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineCycleStrengthLayout({
        data,
        length,
        cycleLag,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, cycleLag, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineCycleStrengthChart(data, { length, cycleLag });
  const resolvedLabel =
    ariaLabel ??
    `Cycle Strength chart, length ${run.length}, cycleLag ${run.cycleLag}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineCycleStrengthSeriesId): void => {
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
        data-section="chart-line-cycle-strength-tooltip"
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
          data-section="chart-line-cycle-strength-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-cycle-strength-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-cycle-strength-tooltip-strength"
          x={tx + 10}
          y={ty + 51}
          fill="#d8b4fe"
          fontSize={11}
          fontWeight={600}
        >
          {`Cycle Strength: ${
            hoverSample.strength === null
              ? 'n/a'
              : formatStrength(hoverSample.strength)
          }`}
        </text>
        <text
          data-section="chart-line-cycle-strength-tooltip-zone"
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
  const strengthHidden = isHidden('strength') || !showStrength;

  const legendItems: Array<{
    id: ChartLineCycleStrengthSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'strength', label: 'Cycle Strength', color: strengthColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-cycle-strength"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-cycle-lag={run.cycleLag}
      data-strength-final={
        run.strengthFinal === null ? '' : run.strengthFinal
      }
      data-cyclic-count={run.cyclicCount}
      data-mixed-count={run.mixedCount}
      data-trending-count={run.trendingCount}
      data-flat-count={run.flatCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-cycle-strength-aria-desc"
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
          data-section="chart-line-cycle-strength-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-cycle-strength-empty"
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
          data-section="chart-line-cycle-strength-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-cycle-strength-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.strengthBottom -
                  t * (layout.strengthBottom - layout.strengthTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-cycle-strength-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-cycle-strength-grid-line"
                      data-panel="strength"
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
            <g data-section="chart-line-cycle-strength-axes">
              <line
                data-section="chart-line-cycle-strength-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cycle-strength-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cycle-strength-axis"
                data-panel="strength"
                x1={layout.innerLeft}
                y1={layout.strengthTop}
                x2={layout.innerLeft}
                y2={layout.strengthBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cycle-strength-axis"
                data-panel="strength"
                x1={layout.innerLeft}
                y1={layout.strengthBottom}
                x2={layout.innerRight}
                y2={layout.strengthBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-cycle-strength-tick-label"
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
                data-section="chart-line-cycle-strength-tick-label"
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
                data-section="chart-line-cycle-strength-tick-label"
                data-panel="strength"
                x={layout.innerLeft - 6}
                y={layout.strengthTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatStrength(layout.strengthMax)}
              </text>
              <text
                data-section="chart-line-cycle-strength-tick-label"
                data-panel="strength"
                x={layout.innerLeft - 6}
                y={layout.strengthBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatStrength(layout.strengthMin)}
              </text>
            </g>
          ) : null}

          {showBaseline ? (
            <line
              data-section="chart-line-cycle-strength-baseline"
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
              data-section="chart-line-cycle-strength-price-path"
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
            <g data-section="chart-line-cycle-strength-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-cycle-strength-dot"
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

          {!strengthHidden ? (
            <path
              data-section="chart-line-cycle-strength-line"
              d={layout.strengthPath}
              fill="none"
              stroke={strengthColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Cycle Strength line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-cycle-strength-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-cycle-strength-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-strength={marker.strength}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    cyclicColor,
                    mixedColor,
                    trendingColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Cycle Strength ${formatStrength(marker.strength)}, ${zoneLabelOf(
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
            <g data-section="chart-line-cycle-strength-badge">
              <rect
                data-section="chart-line-cycle-strength-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-cycle-strength-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Cycle Strength ${run.length}/${run.cycleLag}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-cycle-strength-legend"
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
                data-section="chart-line-cycle-strength-legend-item"
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
                  data-section="chart-line-cycle-strength-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-cycle-strength-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-cycle-strength-legend-stats"
            style={{ color: axisColor }}
          >
            {`cyclic ${run.cyclicCount} / mixed ${run.mixedCount} / trending ${run.trendingCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCycleStrength.displayName = 'ChartLineCycleStrength';
