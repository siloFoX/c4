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
 * ChartLineTrendPower -- pure-SVG dual-panel chart with the close
 * on the top panel and a Trend Power oscillator on the bottom panel.
 * Trend Power is the squared OLS regression slope scaled by the
 * inverse of the residual variance across the rolling lookback:
 *
 *   meanX             = (length - 1) / 2
 *   meanY[i]          = mean(close[i - length + 1 .. i])
 *   slope[i]          = sum((k - meanX) * (close[k] - meanY[i]))
 *                       / sum((k - meanX)^2)
 *   intercept[i]      = meanY[i] - slope[i] * meanX
 *   resVar[i]         = sum((close[k] - (slope[i]*k + intercept[i]))^2)
 *                       / length    (population)
 *   power[i]          = slope[i]^2 / max(resVar[i], MIN_RESIDUAL_VARIANCE)
 *
 * `power[i]` is `null` during warmup (`i < length - 1`) and
 * whenever any close in the window is non-finite.
 *
 * Bit-exact anchor: **CONST close** (`close = K`): `slope = 0`,
 * `residualVariance = 0`, so `power = 0 / MIN_RESIDUAL_VARIANCE = 0`
 * regardless of K. Verified across the integration sweep over
 * `(K, length)` combinations.
 *
 * Additional bit-exact anchor: **LINEAR close** (`close[k] = a*k`)
 * with integer `a`. The regression recovers `slope = a` exactly,
 * intercept = 0 exactly, residuals are all 0 exactly, and the
 * residualVariance is 0. The clamp pins the denominator to
 * `MIN_RESIDUAL_VARIANCE = 2^-50`, so
 * `power = a^2 / 2^-50 = a^2 * 2^50`. Since `2^50` is exact in IEEE
 * 754 and integer `a^2` is exact, the resulting power is bit-exact.
 * Verified explicitly for `a in {1, 2}` and `length in {4, 8}`.
 *
 * Defaults: `length = 14`, `strongThreshold = 1`. Markers fire on
 * bars where the power crosses the strong-trend threshold.
 */

export interface ChartLineTrendPowerPoint {
  x: number;
  close: number;
}

export type ChartLineTrendPowerZone =
  | 'strong-trend'
  | 'weak-trend'
  | 'flat'
  | 'none';

export type ChartLineTrendPowerSeriesId = 'price' | 'power';

export interface ChartLineTrendPowerSample {
  index: number;
  x: number;
  close: number;
  slope: number | null;
  intercept: number | null;
  residualVariance: number | null;
  power: number | null;
  zone: ChartLineTrendPowerZone;
}

export interface ChartLineTrendPowerRun {
  series: ChartLineTrendPowerPoint[];
  length: number;
  strongThreshold: number;
  slope: Array<number | null>;
  intercept: Array<number | null>;
  residualVariance: Array<number | null>;
  power: Array<number | null>;
  samples: ChartLineTrendPowerSample[];
  strongCount: number;
  weakCount: number;
  flatCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineTrendPowerMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  power: number;
  zone: ChartLineTrendPowerZone;
}

export interface ChartLineTrendPowerDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrendPowerLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  powerTop: number;
  powerBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineTrendPowerDot[];
  powerPath: string;
  thresholdY: number;
  markers: ChartLineTrendPowerMarker[];
  priceMin: number;
  priceMax: number;
  powerMin: number;
  powerMax: number;
  run: ChartLineTrendPowerRun;
}

export interface ChartLineTrendPowerProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrendPowerPoint[];
  length?: number;
  strongThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  powerColor?: string;
  strongColor?: string;
  weakColor?: string;
  flatColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPower?: boolean;
  showMarkers?: boolean;
  showThreshold?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrendPowerSeriesId[];
  defaultHiddenSeries?: ChartLineTrendPowerSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrendPowerSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineTrendPowerSample }) => void;
  formatPrice?: (value: number) => string;
  formatPower?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

// Dyadic floor on residual variance so the SNR ratio never explodes
// to Infinity when the fit is perfect. 2^-50 keeps powers-of-two
// arithmetic exact across IEEE 754.
export const MIN_RESIDUAL_VARIANCE = Math.pow(2, -50);

export const DEFAULT_CHART_LINE_TREND_POWER_WIDTH = 720;
export const DEFAULT_CHART_LINE_TREND_POWER_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TREND_POWER_PADDING = 44;
export const DEFAULT_CHART_LINE_TREND_POWER_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TREND_POWER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TREND_POWER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TREND_POWER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TREND_POWER_LENGTH = 14;
export const DEFAULT_CHART_LINE_TREND_POWER_STRONG_THRESHOLD = 1;
export const DEFAULT_CHART_LINE_TREND_POWER_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TREND_POWER_POWER_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_TREND_POWER_STRONG_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_TREND_POWER_WEAK_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_TREND_POWER_FLAT_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TREND_POWER_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TREND_POWER_THRESHOLD_COLOR = '#475569';
export const DEFAULT_CHART_LINE_TREND_POWER_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TREND_POWER_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineTrendPowerFinitePoints(
  data: readonly ChartLineTrendPowerPoint[] | null | undefined,
): ChartLineTrendPowerPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrendPowerPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineTrendPowerLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite strong-trend threshold. */
export function normalizeLineTrendPowerStrongThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

/**
 * Fit OLS regression to a single window ending at `endIndex`.
 * Returns the slope, intercept, and population residualVariance,
 * or null if the window is invalid (warmup or non-finite values).
 */
export function fitLineTrendPowerWindow(
  closes: readonly (number | null)[],
  length: number,
  endIndex: number,
): { slope: number; intercept: number; residualVariance: number } | null {
  if (endIndex < length - 1) return null;
  let sumY = 0;
  for (let k = 0; k < length; k += 1) {
    const v = closes[endIndex - length + 1 + k];
    if (v == null || !isFiniteNumber(v)) return null;
    sumY += v;
  }
  const meanX = (length - 1) / 2;
  const meanY = sumY / length;
  let num = 0;
  let den = 0;
  for (let k = 0; k < length; k += 1) {
    const v = closes[endIndex - length + 1 + k];
    if (v == null) return null;
    const dx = k - meanX;
    const dy = v - meanY;
    num += dx * dy;
    den += dx * dx;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  let sumSqRes = 0;
  for (let k = 0; k < length; k += 1) {
    const v = closes[endIndex - length + 1 + k];
    if (v == null) return null;
    const pred = slope * k + intercept;
    const res = v - pred;
    sumSqRes += res * res;
  }
  const residualVariance = sumSqRes / length;
  return { slope, intercept, residualVariance };
}

export interface ChartLineTrendPowerOptions {
  length?: number;
  strongThreshold?: number;
}

export interface ChartLineTrendPowerChannels {
  slope: Array<number | null>;
  intercept: Array<number | null>;
  residualVariance: Array<number | null>;
  power: Array<number | null>;
}

/**
 * Compute the Trend Power pipeline per bar. Power is `null` during
 * warmup (`i < length - 1`) or when a close in the window is
 * non-finite. Otherwise it is `slope^2 / max(resVar, MIN_RESIDUAL_VARIANCE)`.
 */
export function computeLineTrendPower(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineTrendPowerOptions = {},
): ChartLineTrendPowerChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { slope: [], intercept: [], residualVariance: [], power: [] };
  }
  const length = normalizeLineTrendPowerLength(
    options.length,
    DEFAULT_CHART_LINE_TREND_POWER_LENGTH,
  );
  const slope: Array<number | null> = [];
  const intercept: Array<number | null> = [];
  const residualVariance: Array<number | null> = [];
  const power: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const fit = fitLineTrendPowerWindow(closes, length, i);
    if (fit === null) {
      slope.push(null);
      intercept.push(null);
      residualVariance.push(null);
      power.push(null);
      continue;
    }
    slope.push(fit.slope);
    intercept.push(fit.intercept);
    residualVariance.push(fit.residualVariance);
    const denom =
      fit.residualVariance > MIN_RESIDUAL_VARIANCE
        ? fit.residualVariance
        : MIN_RESIDUAL_VARIANCE;
    power.push((fit.slope * fit.slope) / denom);
  }
  return { slope, intercept, residualVariance, power };
}

/** Classify a power reading. */
export function classifyLineTrendPowerZone(
  value: number | null,
  strongThreshold: number,
): ChartLineTrendPowerZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= strongThreshold) return 'strong-trend';
  if (value > 0) return 'weak-trend';
  return 'flat';
}

/** Run the full pipeline plus sample classification. */
export function runLineTrendPower(
  data: readonly ChartLineTrendPowerPoint[] | null | undefined,
  options: ChartLineTrendPowerOptions = {},
): ChartLineTrendPowerRun {
  const series = getLineTrendPowerFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineTrendPowerLength(
    options.length,
    DEFAULT_CHART_LINE_TREND_POWER_LENGTH,
  );
  const strongThreshold = normalizeLineTrendPowerStrongThreshold(
    options.strongThreshold,
    DEFAULT_CHART_LINE_TREND_POWER_STRONG_THRESHOLD,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineTrendPower(closes, { length });
  const samples: ChartLineTrendPowerSample[] = series.map((point, index) => {
    const value = channels.power[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      slope: channels.slope[index] ?? null,
      intercept: channels.intercept[index] ?? null,
      residualVariance: channels.residualVariance[index] ?? null,
      power: value,
      zone: classifyLineTrendPowerZone(value, strongThreshold),
    };
  });
  let strongCount = 0;
  let weakCount = 0;
  let flatCount = 0;
  let noneCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'strong-trend') strongCount += 1;
    else if (sample.zone === 'weak-trend') weakCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else noneCount += 1;
  }
  return {
    series,
    length,
    strongThreshold,
    slope: channels.slope,
    intercept: channels.intercept,
    residualVariance: channels.residualVariance,
    power: channels.power,
    samples,
    strongCount,
    weakCount,
    flatCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineTrendPowerLayoutOptions
  extends ChartLineTrendPowerOptions {
  data: readonly ChartLineTrendPowerPoint[] | null | undefined;
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
export function computeLineTrendPowerLayout(
  options: ChartLineTrendPowerLayoutOptions,
): ChartLineTrendPowerLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TREND_POWER_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TREND_POWER_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TREND_POWER_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_TREND_POWER_PANEL_GAP;

  const run = runLineTrendPower(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.strongThreshold !== undefined
      ? { strongThreshold: options.strongThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const powerHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const powerTop = priceBottom + panelGap;
  const powerBottom = powerTop + powerHeight;

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

  let powerMax = 0;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.power) && sample.power > powerMax) {
      powerMax = sample.power;
    }
  }
  // Always include the threshold line in the visible range so it
  // remains a useful reference even when all powers are tiny.
  if (run.strongThreshold > powerMax) powerMax = run.strongThreshold * 1.25;
  if (powerMax === 0) powerMax = 1;
  const powerMin = 0;
  const powerY = (value: number): number =>
    powerBottom - ((value - powerMin) / (powerMax - powerMin)) * powerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineTrendPowerDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const powerLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineTrendPowerMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.power)) return;
    const cx = xAt(index);
    const yc = powerY(sample.power);
    powerLinePoints.push({ x: cx, y: yc });
    if (sample.zone === 'strong-trend') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        power: sample.power,
        zone: sample.zone,
      });
    }
  });

  const thresholdY = powerY(run.strongThreshold);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    powerTop,
    powerBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    powerPath: buildLinePath(powerLinePoints),
    thresholdY,
    markers,
    priceMin,
    priceMax,
    powerMin,
    powerMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineTrendPowerChart(
  data: readonly ChartLineTrendPowerPoint[] | null | undefined,
  options: ChartLineTrendPowerOptions = {},
): string {
  const run = runLineTrendPower(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Trend Power oscillator panel beneath ` +
    `the close (length ${run.length}, strongThreshold ` +
    `${run.strongThreshold}). Trend Power is the squared OLS ` +
    `regression slope scaled by the inverse of the residual variance ` +
    `(slope^2 / max(residualVariance, MIN_RESIDUAL_VARIANCE)). Across ` +
    `${total} bars the detector saw ${run.strongCount} strong-trend, ` +
    `${run.weakCount} weak-trend, ${run.flatCount} flat, and ` +
    `${run.noneCount} undefined readings.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatPower(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  if (Math.abs(value) >= 1e6) return value.toExponential(2);
  if (Math.abs(value) >= 100) return value.toFixed(2);
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineTrendPowerZone,
  strongColor: string,
  weakColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'strong-trend') return strongColor;
  if (zone === 'weak-trend') return weakColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineTrendPowerZone): string {
  if (zone === 'strong-trend') return 'Strong Trend';
  if (zone === 'weak-trend') return 'Weak Trend';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/** ChartLineTrendPower -- dual-panel pure-SVG chart. */
export const ChartLineTrendPower = forwardRef<
  HTMLDivElement,
  ChartLineTrendPowerProps
>(function ChartLineTrendPower(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_TREND_POWER_LENGTH,
    strongThreshold = DEFAULT_CHART_LINE_TREND_POWER_STRONG_THRESHOLD,
    width = DEFAULT_CHART_LINE_TREND_POWER_WIDTH,
    height = DEFAULT_CHART_LINE_TREND_POWER_HEIGHT,
    padding = DEFAULT_CHART_LINE_TREND_POWER_PADDING,
    panelGap = DEFAULT_CHART_LINE_TREND_POWER_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TREND_POWER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TREND_POWER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TREND_POWER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TREND_POWER_PRICE_COLOR,
    powerColor = DEFAULT_CHART_LINE_TREND_POWER_POWER_COLOR,
    strongColor = DEFAULT_CHART_LINE_TREND_POWER_STRONG_COLOR,
    weakColor = DEFAULT_CHART_LINE_TREND_POWER_WEAK_COLOR,
    flatColor = DEFAULT_CHART_LINE_TREND_POWER_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_TREND_POWER_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_TREND_POWER_THRESHOLD_COLOR,
    axisColor = DEFAULT_CHART_LINE_TREND_POWER_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TREND_POWER_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPower = true,
    showMarkers = true,
    showThreshold = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatPower = defaultFormatPower,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-trend-power-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineTrendPowerSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineTrendPowerSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineTrendPowerLayout({
        data,
        length,
        strongThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, strongThreshold, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineTrendPowerChart(data, { length, strongThreshold });
  const resolvedLabel =
    ariaLabel ?? `Trend Power chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineTrendPowerSeriesId): void => {
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
        data-section="chart-line-trend-power-tooltip"
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
          data-section="chart-line-trend-power-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-trend-power-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-trend-power-tooltip-slope"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Slope: ${
            hoverSample.slope === null
              ? 'n/a'
              : formatPower(hoverSample.slope)
          }`}
        </text>
        <text
          data-section="chart-line-trend-power-tooltip-intercept"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Intercept: ${
            hoverSample.intercept === null
              ? 'n/a'
              : formatPower(hoverSample.intercept)
          }`}
        </text>
        <text
          data-section="chart-line-trend-power-tooltip-resvar"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`ResVar: ${
            hoverSample.residualVariance === null
              ? 'n/a'
              : formatPower(hoverSample.residualVariance)
          }`}
        </text>
        <text
          data-section="chart-line-trend-power-tooltip-power"
          x={tx + 10}
          y={ty + 103}
          fill="#fdba74"
          fontSize={11}
          fontWeight={600}
        >
          {`Power: ${
            hoverSample.power === null
              ? 'n/a'
              : formatPower(hoverSample.power)
          }`}
        </text>
        <text
          data-section="chart-line-trend-power-tooltip-zone"
          x={tx + 10}
          y={ty + 121}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-trend-power-tooltip-threshold"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Threshold: ${formatPower(run.strongThreshold)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const powerHidden = isHidden('power') || !showPower;

  const legendItems: Array<{
    id: ChartLineTrendPowerSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'power', label: 'Trend Power', color: powerColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-trend-power"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-strong-threshold={run.strongThreshold}
      data-strong-count={run.strongCount}
      data-weak-count={run.weakCount}
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
        data-section="chart-line-trend-power-aria-desc"
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
          data-section="chart-line-trend-power-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-trend-power-empty"
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
          data-section="chart-line-trend-power-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-trend-power-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.powerBottom -
                  t * (layout.powerBottom - layout.powerTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-trend-power-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-trend-power-grid-line"
                      data-panel="power"
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
            <g data-section="chart-line-trend-power-axes">
              <line
                data-section="chart-line-trend-power-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-power-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-power-axis"
                data-panel="power"
                x1={layout.innerLeft}
                y1={layout.powerTop}
                x2={layout.innerLeft}
                y2={layout.powerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-power-axis"
                data-panel="power"
                x1={layout.innerLeft}
                y1={layout.powerBottom}
                x2={layout.innerRight}
                y2={layout.powerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-trend-power-tick-label"
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
                data-section="chart-line-trend-power-tick-label"
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
                data-section="chart-line-trend-power-tick-label"
                data-panel="power"
                x={layout.innerLeft - 6}
                y={layout.powerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPower(layout.powerMax)}
              </text>
              <text
                data-section="chart-line-trend-power-tick-label"
                data-panel="power"
                x={layout.innerLeft - 6}
                y={layout.powerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`0`}
              </text>
            </g>
          ) : null}

          {showThreshold ? (
            <line
              data-section="chart-line-trend-power-threshold-line"
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={thresholdColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-trend-power-price-path"
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
            <g data-section="chart-line-trend-power-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-trend-power-dot"
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

          {!powerHidden ? (
            <path
              data-section="chart-line-trend-power-line"
              d={layout.powerPath}
              fill="none"
              stroke={powerColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Trend Power line, ${run.length} bar lookback`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-trend-power-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-trend-power-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-power={marker.power}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongColor,
                    weakColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, power ${formatPower(marker.power)}, ${zoneLabelOf(
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
            <g data-section="chart-line-trend-power-badge">
              <rect
                data-section="chart-line-trend-power-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={200}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-trend-power-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Trend Power ${run.length}/T>=${run.strongThreshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-trend-power-legend"
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
                data-section="chart-line-trend-power-legend-item"
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
                  data-section="chart-line-trend-power-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-trend-power-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-trend-power-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong ${run.strongCount} / weak ${run.weakCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTrendPower.displayName = 'ChartLineTrendPower';
