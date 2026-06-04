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
 * ChartLineTrendStrength -- pure-SVG dual-panel chart with the
 * close on the top panel and a Trend Strength oscillator on the
 * bottom panel. The oscillator measures how dominant the linear
 * trend is relative to the residual noise across the lookback:
 *
 *   For window of `length` bars ending at i (x = 0 .. length-1,
 *   y = close[i - length + 1 .. i]):
 *     meanX = (length - 1) / 2
 *     meanY = sum(y) / length
 *     sumXY = sum((x[k] - meanX) * (y[k] - meanY))
 *     sumXX = sum((x[k] - meanX)^2)
 *     slope     = sumXY / sumXX
 *     intercept = meanY - slope * meanX
 *     residual[k] = y[k] - (intercept + slope * x[k])
 *     stdErr    = sqrt(sum(residual^2) / length)
 *     trendStrength = |slope| / (|slope| + stdErr)
 *
 * Defaults: `length = 14`. Bars before `i = length - 1` are
 * warmup (`trendStrength = null`). When `|slope| + stdErr == 0`
 * (singular: a flat constant series with zero residual) the
 * strength is `null`.
 *
 * Bit-exact anchor: **PERFECT LINE** (`close[i] = a * i` for
 * integer `a != 0`):
 *
 *   * `slope = a` bit-exact (`sumXY = a * sumXX`).
 *   * `intercept = meanY - a * meanX = a * meanX - a * meanX = 0`
 *     bit-exact (for the canonical form `close = a * i`).
 *   * Every residual is `0` bit-exact.
 *   * `stdErr = 0`.
 *   * `trendStrength = |a| / (|a| + 0) = 1` bit-exact past
 *     warmup.
 *
 * The integration sweep verifies this across `a` in
 * `{1, 2, 3, -1, -5}` and `length` in `{3, 5, 7, 14}`.
 *
 * **CONST close** (`close = K`): `slope = 0`, `stdErr = 0`,
 * `|slope| + stdErr = 0`; trendStrength is `null` (singular).
 */

export interface ChartLineTrendStrengthPoint {
  x: number;
  close: number;
}

export type ChartLineTrendStrengthZone =
  | 'strong'
  | 'firm'
  | 'soft'
  | 'choppy'
  | 'none';

export type ChartLineTrendStrengthSeriesId = 'price' | 'strength';

export interface ChartLineTrendStrengthSample {
  index: number;
  x: number;
  close: number;
  slope: number | null;
  stdErr: number | null;
  strength: number | null;
  zone: ChartLineTrendStrengthZone;
}

export interface ChartLineTrendStrengthRun {
  series: ChartLineTrendStrengthPoint[];
  length: number;
  slope: Array<number | null>;
  stdErr: Array<number | null>;
  strength: Array<number | null>;
  samples: ChartLineTrendStrengthSample[];
  strengthFinal: number | null;
  strongCount: number;
  firmCount: number;
  softCount: number;
  choppyCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineTrendStrengthMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  strength: number;
  zone: ChartLineTrendStrengthZone;
}

export interface ChartLineTrendStrengthDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrendStrengthLayout {
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
  priceDots: ChartLineTrendStrengthDot[];
  strengthPath: string;
  markers: ChartLineTrendStrengthMarker[];
  priceMin: number;
  priceMax: number;
  strengthMin: number;
  strengthMax: number;
  midBaselineY: number;
  run: ChartLineTrendStrengthRun;
}

export interface ChartLineTrendStrengthProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrendStrengthPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  strengthColor?: string;
  strongColor?: string;
  firmColor?: string;
  softColor?: string;
  choppyColor?: string;
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
  hiddenSeries?: ChartLineTrendStrengthSeriesId[];
  defaultHiddenSeries?: ChartLineTrendStrengthSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrendStrengthSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineTrendStrengthSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatStrength?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TREND_STRENGTH_WIDTH = 720;
export const DEFAULT_CHART_LINE_TREND_STRENGTH_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TREND_STRENGTH_PADDING = 44;
export const DEFAULT_CHART_LINE_TREND_STRENGTH_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TREND_STRENGTH_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TREND_STRENGTH_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TREND_STRENGTH_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TREND_STRENGTH_LENGTH = 14;
export const DEFAULT_CHART_LINE_TREND_STRENGTH_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TREND_STRENGTH_STRENGTH_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_TREND_STRENGTH_STRONG_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TREND_STRENGTH_FIRM_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_TREND_STRENGTH_SOFT_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_TREND_STRENGTH_CHOPPY_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TREND_STRENGTH_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TREND_STRENGTH_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TREND_STRENGTH_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TREND_STRENGTH_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineTrendStrengthFinitePoints(
  data: readonly ChartLineTrendStrengthPoint[] | null | undefined,
): ChartLineTrendStrengthPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrendStrengthPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 3). */
export function normalizeLineTrendStrengthLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 3) return Math.floor(length);
  return fallback;
}

/**
 * Compute slope and population standard error of residuals from
 * a least-squares fit of close vs window index over `length`
 * bars. Returns `{ slope, stdErr }` or `{ slope: null, stdErr:
 * null }` if any close is missing.
 */
export function computeLineTrendStrengthRegression(
  closes: readonly (number | null)[],
  endIndex: number,
  length: number,
): { slope: number | null; stdErr: number | null } {
  if (endIndex < length - 1) return { slope: null, stdErr: null };
  const meanX = (length - 1) / 2;
  let sumY = 0;
  let ok = true;
  for (let j = 0; j < length; j += 1) {
    const v = closes[endIndex - (length - 1) + j];
    if (v === null || v === undefined || !isFiniteNumber(v)) {
      ok = false;
      break;
    }
    sumY += v;
  }
  if (!ok) return { slope: null, stdErr: null };
  const meanY = sumY / length;
  let sumXY = 0;
  let sumXX = 0;
  for (let j = 0; j < length; j += 1) {
    const dx = j - meanX;
    const v = closes[endIndex - (length - 1) + j]!;
    sumXY += dx * (v - meanY);
    sumXX += dx * dx;
  }
  if (sumXX === 0) return { slope: null, stdErr: null };
  const slope = sumXY / sumXX;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (let j = 0; j < length; j += 1) {
    const v = closes[endIndex - (length - 1) + j]!;
    const residual = v - (intercept + slope * j);
    sse += residual * residual;
  }
  const stdErr = Math.sqrt(sse / length);
  return { slope, stdErr };
}

export interface ChartLineTrendStrengthOptions {
  length?: number;
}

export interface ChartLineTrendStrengthChannels {
  slope: Array<number | null>;
  stdErr: Array<number | null>;
  strength: Array<number | null>;
}

/**
 * Compute the Trend Strength pipeline per bar. Bars before
 * `i = length - 1` are `null`. When `|slope| + stdErr == 0`
 * (singular: a flat constant series) strength is `null`.
 */
export function computeLineTrendStrength(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineTrendStrengthOptions = {},
): ChartLineTrendStrengthChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { slope: [], stdErr: [], strength: [] };
  }
  const length = normalizeLineTrendStrengthLength(
    options.length,
    DEFAULT_CHART_LINE_TREND_STRENGTH_LENGTH,
  );
  const slope: Array<number | null> = [];
  const stdErr: Array<number | null> = [];
  const strength: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < length - 1) {
      slope.push(null);
      stdErr.push(null);
      strength.push(null);
      continue;
    }
    const reg = computeLineTrendStrengthRegression(closes, i, length);
    slope.push(reg.slope);
    stdErr.push(reg.stdErr);
    if (
      reg.slope == null ||
      reg.stdErr == null ||
      !isFiniteNumber(reg.slope) ||
      !isFiniteNumber(reg.stdErr)
    ) {
      strength.push(null);
      continue;
    }
    const absSlope = Math.abs(reg.slope);
    const denom = absSlope + reg.stdErr;
    if (denom === 0) {
      strength.push(null);
      continue;
    }
    strength.push(absSlope / denom);
  }
  return { slope, stdErr, strength };
}

/** Classify a Trend Strength reading. */
export function classifyLineTrendStrengthZone(
  value: number | null,
): ChartLineTrendStrengthZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= 0.75) return 'strong';
  if (value >= 0.5) return 'firm';
  if (value >= 0.25) return 'soft';
  return 'choppy';
}

/** Run the full pipeline plus sample classification. */
export function runLineTrendStrength(
  data: readonly ChartLineTrendStrengthPoint[] | null | undefined,
  options: ChartLineTrendStrengthOptions = {},
): ChartLineTrendStrengthRun {
  const series = getLineTrendStrengthFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineTrendStrengthLength(
    options.length,
    DEFAULT_CHART_LINE_TREND_STRENGTH_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineTrendStrength(closes, { length });
  const samples: ChartLineTrendStrengthSample[] = series.map((point, index) => {
    const value = channels.strength[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      slope: channels.slope[index] ?? null,
      stdErr: channels.stdErr[index] ?? null,
      strength: value,
      zone: classifyLineTrendStrengthZone(value),
    };
  });
  let strongCount = 0;
  let firmCount = 0;
  let softCount = 0;
  let choppyCount = 0;
  let noneCount = 0;
  let strengthFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong') strongCount += 1;
    else if (sample.zone === 'firm') firmCount += 1;
    else if (sample.zone === 'soft') softCount += 1;
    else if (sample.zone === 'choppy') choppyCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.strength)) strengthFinal = sample.strength;
  }
  return {
    series,
    length,
    slope: channels.slope,
    stdErr: channels.stdErr,
    strength: channels.strength,
    samples,
    strengthFinal,
    strongCount,
    firmCount,
    softCount,
    choppyCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineTrendStrengthLayoutOptions
  extends ChartLineTrendStrengthOptions {
  data: readonly ChartLineTrendStrengthPoint[] | null | undefined;
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
export function computeLineTrendStrengthLayout(
  options: ChartLineTrendStrengthLayoutOptions,
): ChartLineTrendStrengthLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TREND_STRENGTH_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TREND_STRENGTH_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TREND_STRENGTH_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_TREND_STRENGTH_PANEL_GAP;

  const run = runLineTrendStrength(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
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

  // Trend Strength is a normalized ratio in [0, 1].
  const strengthMin = 0;
  const strengthMax = 1;
  const strengthY = (value: number): number =>
    strengthBottom -
    ((value - strengthMin) / (strengthMax - strengthMin)) * strengthHeight;
  const midBaselineY = strengthY(0.5);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineTrendStrengthDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const strengthLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineTrendStrengthMarker[] = [];
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
export function describeLineTrendStrengthChart(
  data: readonly ChartLineTrendStrengthPoint[] | null | undefined,
  options: ChartLineTrendStrengthOptions = {},
): string {
  const run = runLineTrendStrength(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.strengthFinal === null ? 'n/a' : run.strengthFinal.toFixed(4);
  return (
    `Dual-panel chart with a Trend Strength oscillator panel ` +
    `beneath the close (length ${run.length}). Trend Strength = ` +
    `|slope| / (|slope| + standardError), where slope is the ` +
    `linear regression slope of close vs window index and ` +
    `standardError is the RMS of the residuals over the lookback. ` +
    `Across ${total} bars the strength reads strong (>= 0.75) on ` +
    `${run.strongCount}, firm (0.5..0.75) on ${run.firmCount}, ` +
    `soft (0.25..0.5) on ${run.softCount}, choppy (< 0.25) on ` +
    `${run.choppyCount}, and undefined on ${run.noneCount}. The ` +
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
  zone: ChartLineTrendStrengthZone,
  strongColor: string,
  firmColor: string,
  softColor: string,
  choppyColor: string,
  noneColor: string,
): string {
  if (zone === 'strong') return strongColor;
  if (zone === 'firm') return firmColor;
  if (zone === 'soft') return softColor;
  if (zone === 'choppy') return choppyColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineTrendStrengthZone): string {
  if (zone === 'strong') return 'Strong';
  if (zone === 'firm') return 'Firm';
  if (zone === 'soft') return 'Soft';
  if (zone === 'choppy') return 'Choppy';
  return 'n/a';
}

/** ChartLineTrendStrength -- dual-panel pure-SVG chart. */
export const ChartLineTrendStrength = forwardRef<
  HTMLDivElement,
  ChartLineTrendStrengthProps
>(function ChartLineTrendStrength(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_TREND_STRENGTH_LENGTH,
    width = DEFAULT_CHART_LINE_TREND_STRENGTH_WIDTH,
    height = DEFAULT_CHART_LINE_TREND_STRENGTH_HEIGHT,
    padding = DEFAULT_CHART_LINE_TREND_STRENGTH_PADDING,
    panelGap = DEFAULT_CHART_LINE_TREND_STRENGTH_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TREND_STRENGTH_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TREND_STRENGTH_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TREND_STRENGTH_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TREND_STRENGTH_PRICE_COLOR,
    strengthColor = DEFAULT_CHART_LINE_TREND_STRENGTH_STRENGTH_COLOR,
    strongColor = DEFAULT_CHART_LINE_TREND_STRENGTH_STRONG_COLOR,
    firmColor = DEFAULT_CHART_LINE_TREND_STRENGTH_FIRM_COLOR,
    softColor = DEFAULT_CHART_LINE_TREND_STRENGTH_SOFT_COLOR,
    choppyColor = DEFAULT_CHART_LINE_TREND_STRENGTH_CHOPPY_COLOR,
    noneColor = DEFAULT_CHART_LINE_TREND_STRENGTH_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_TREND_STRENGTH_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TREND_STRENGTH_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_TREND_STRENGTH_BASELINE_COLOR,
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
  const baseId = `chart-line-trend-strength-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineTrendStrengthSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineTrendStrengthSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineTrendStrengthLayout({
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
    ariaDescription ?? describeLineTrendStrengthChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Trend Strength chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineTrendStrengthSeriesId): void => {
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
    const tooltipW = 250;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-trend-strength-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={118}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-trend-strength-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-trend-strength-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-trend-strength-tooltip-slope"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Slope: ${
            hoverSample.slope === null
              ? 'n/a'
              : formatStrength(hoverSample.slope)
          }`}
        </text>
        <text
          data-section="chart-line-trend-strength-tooltip-stderr"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`StdErr: ${
            hoverSample.stdErr === null
              ? 'n/a'
              : formatStrength(hoverSample.stdErr)
          }`}
        </text>
        <text
          data-section="chart-line-trend-strength-tooltip-strength"
          x={tx + 10}
          y={ty + 83}
          fill="#7dd3fc"
          fontSize={11}
          fontWeight={600}
        >
          {`Trend Strength: ${
            hoverSample.strength === null
              ? 'n/a'
              : formatStrength(hoverSample.strength)
          }`}
        </text>
        <text
          data-section="chart-line-trend-strength-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
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
    id: ChartLineTrendStrengthSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'strength', label: 'Trend Strength', color: strengthColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-trend-strength"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-strength-final={
        run.strengthFinal === null ? '' : run.strengthFinal
      }
      data-strong-count={run.strongCount}
      data-firm-count={run.firmCount}
      data-soft-count={run.softCount}
      data-choppy-count={run.choppyCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-trend-strength-aria-desc"
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
          data-section="chart-line-trend-strength-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-trend-strength-empty"
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
          data-section="chart-line-trend-strength-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-trend-strength-grid">
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
                      data-section="chart-line-trend-strength-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-trend-strength-grid-line"
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
            <g data-section="chart-line-trend-strength-axes">
              <line
                data-section="chart-line-trend-strength-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-strength-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-strength-axis"
                data-panel="strength"
                x1={layout.innerLeft}
                y1={layout.strengthTop}
                x2={layout.innerLeft}
                y2={layout.strengthBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-strength-axis"
                data-panel="strength"
                x1={layout.innerLeft}
                y1={layout.strengthBottom}
                x2={layout.innerRight}
                y2={layout.strengthBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-trend-strength-tick-label"
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
                data-section="chart-line-trend-strength-tick-label"
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
                data-section="chart-line-trend-strength-tick-label"
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
                data-section="chart-line-trend-strength-tick-label"
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
              data-section="chart-line-trend-strength-baseline"
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
              data-section="chart-line-trend-strength-price-path"
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
            <g data-section="chart-line-trend-strength-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-trend-strength-dot"
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
              data-section="chart-line-trend-strength-line"
              d={layout.strengthPath}
              fill="none"
              stroke={strengthColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Trend Strength line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-trend-strength-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-trend-strength-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-strength={marker.strength}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongColor,
                    firmColor,
                    softColor,
                    choppyColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Trend Strength ${formatStrength(marker.strength)}, ${zoneLabelOf(
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
            <g data-section="chart-line-trend-strength-badge">
              <rect
                data-section="chart-line-trend-strength-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-trend-strength-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Trend Strength ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-trend-strength-legend"
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
                data-section="chart-line-trend-strength-legend-item"
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
                  data-section="chart-line-trend-strength-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-trend-strength-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-trend-strength-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong ${run.strongCount} / firm ${run.firmCount} / soft ${run.softCount} / choppy ${run.choppyCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTrendStrength.displayName = 'ChartLineTrendStrength';
