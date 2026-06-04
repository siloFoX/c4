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
 * ChartLineMahalanobis -- pure-SVG two-panel Mahalanobis Distance chart.
 *
 * Each bar carries a BIVARIATE feature vector `f = [value, return]`
 * where `return = value[i] - value[i-1]`; the first bar's return is
 * undefined. For a rolling window of `window` features ending at bar
 * i, the sample mean vector `mu` and the sample covariance matrix
 * `Sigma` (with the `1/(window - 1)` normalization) are formed, and
 * the Mahalanobis distance of the current bar is
 *
 *   d(i) = sqrt( (f[i] - mu)^T * Sigma^(-1) * (f[i] - mu) )
 *
 * If `det(Sigma)` is below an epsilon (i.e. the rolling features are
 * collinear -- a constant series, a linear ramp, etc.) the distance is
 * left null because the inverse covariance is undefined.
 *
 * The distance is INVARIANT under any affine reparameterisation of
 * the feature vector. In particular:
 *   - translation: shifting every input value by a constant `k` leaves
 *     `d` unchanged (the constant cancels in both `f - mu` for the
 *     value component and in the return component which is unaffected).
 *   - scale: multiplying every input value by a constant `c > 0`
 *     scales `mu` by `c`, `Sigma` by `c^2`, `Sigma^(-1)` by `1/c^2`,
 *     `f - mu` by `c`, so `d^2` is unchanged.
 *
 * For integer fixtures and small integer translations or scale
 * factors these invariances are bit-exact, so the test suite uses
 * `toBe` to assert them.
 *
 * Two panels: the price on top; the distance below with a horizontal
 * threshold line that classifies each defined bar as `normal` (below
 * the threshold) or `outlier` (at or above).
 */

export interface ChartLineMahalanobisPoint {
  x: number;
  value: number;
}

export type ChartLineMahalanobisZone = 'normal' | 'outlier' | 'none';

export type ChartLineMahalanobisSeriesId = 'price' | 'distance';

export interface ChartLineMahalanobisFeature {
  value: number;
  ret: number;
}

export interface ChartLineMahalanobisStats {
  muValue: number;
  muRet: number;
  varValue: number;
  varRet: number;
  covValueRet: number;
  det: number;
}

export interface ChartLineMahalanobisSample {
  index: number;
  x: number;
  value: number;
  distance: number | null;
  zone: ChartLineMahalanobisZone;
}

export interface ChartLineMahalanobisRun {
  series: ChartLineMahalanobisPoint[];
  window: number;
  threshold: number;
  distance: Array<number | null>;
  samples: ChartLineMahalanobisSample[];
  distanceFinal: number | null;
  normalCount: number;
  outlierCount: number;
  ok: boolean;
}

export interface ChartLineMahalanobisMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  distance: number;
  zone: ChartLineMahalanobisZone;
}

export interface ChartLineMahalanobisDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineMahalanobisLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  distancePanelTop: number;
  distancePanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineMahalanobisDot[];
  distancePath: string;
  markers: ChartLineMahalanobisMarker[];
  thresholdY: number;
  priceMin: number;
  priceMax: number;
  distanceMin: number;
  distanceMax: number;
  run: ChartLineMahalanobisRun;
}

export interface ChartLineMahalanobisProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMahalanobisPoint[];
  window?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  distanceColor?: string;
  normalColor?: string;
  outlierColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDistance?: boolean;
  showThreshold?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMahalanobisSeriesId[];
  defaultHiddenSeries?: ChartLineMahalanobisSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMahalanobisSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineMahalanobisSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MAHALANOBIS_WIDTH = 720;
export const DEFAULT_CHART_LINE_MAHALANOBIS_HEIGHT = 400;
export const DEFAULT_CHART_LINE_MAHALANOBIS_PADDING = 44;
export const DEFAULT_CHART_LINE_MAHALANOBIS_GAP = 12;
export const DEFAULT_CHART_LINE_MAHALANOBIS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MAHALANOBIS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MAHALANOBIS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MAHALANOBIS_WINDOW = 20;
export const DEFAULT_CHART_LINE_MAHALANOBIS_THRESHOLD = 2;
export const DEFAULT_CHART_LINE_MAHALANOBIS_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_MAHALANOBIS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MAHALANOBIS_DISTANCE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MAHALANOBIS_NORMAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_MAHALANOBIS_OUTLIER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MAHALANOBIS_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_MAHALANOBIS_THRESHOLD_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MAHALANOBIS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MAHALANOBIS_AXIS_COLOR = '#94a3b8';

/** A singular-covariance guard: anything with `|det| < EPS` is treated as singular. */
export const CHART_LINE_MAHALANOBIS_DET_EPSILON = 1e-12;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and value. */
export function getLineMahalanobisFinitePoints(
  data: readonly ChartLineMahalanobisPoint[] | null | undefined,
): ChartLineMahalanobisPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMahalanobisPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the rolling window to an integer of at least 3. */
export function normalizeLineMahalanobisWindow(
  window: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(window) && window >= 3) return Math.floor(window);
  return fallback;
}

/** Coerce the outlier threshold to a strictly positive finite. */
export function normalizeLineMahalanobisThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

/** Compute the bivariate features `[value, return]`. The first bar's return is null. */
export function computeLineMahalanobisFeatures(
  values: readonly number[] | null | undefined,
): Array<ChartLineMahalanobisFeature | null> {
  if (!Array.isArray(values)) return [];
  const out: Array<ChartLineMahalanobisFeature | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const a = values[i - 1];
    const b = values[i];
    if (!isFiniteNumber(a) || !isFiniteNumber(b)) {
      out.push(null);
      continue;
    }
    out.push({ value: b, ret: b - a });
  }
  return out;
}

/**
 * Compute the sample mean vector and the 2x2 sample covariance matrix
 * (with the `1/(N - 1)` normalization) over a non-empty list of
 * features. Returns the four matrix entries plus the determinant.
 */
export function computeLineMahalanobisStats(
  features: ReadonlyArray<ChartLineMahalanobisFeature>,
): ChartLineMahalanobisStats {
  const n = features.length;
  if (n === 0) {
    return {
      muValue: 0,
      muRet: 0,
      varValue: 0,
      varRet: 0,
      covValueRet: 0,
      det: 0,
    };
  }
  let sumV = 0;
  let sumR = 0;
  for (const f of features) {
    sumV += f.value;
    sumR += f.ret;
  }
  const muValue = sumV / n;
  const muRet = sumR / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const f of features) {
    const dv = f.value - muValue;
    const dr = f.ret - muRet;
    sxx += dv * dv;
    syy += dr * dr;
    sxy += dv * dr;
  }
  const denom = n > 1 ? n - 1 : 1;
  const varValue = sxx / denom;
  const varRet = syy / denom;
  const covValueRet = sxy / denom;
  const det = varValue * varRet - covValueRet * covValueRet;
  return { muValue, muRet, varValue, varRet, covValueRet, det };
}

/**
 * The squared Mahalanobis distance of a single bivariate feature
 * against the given stats. Returns null when the covariance matrix is
 * singular (`|det| < CHART_LINE_MAHALANOBIS_DET_EPSILON`).
 */
export function computeLineMahalanobisDistance(
  feature: ChartLineMahalanobisFeature,
  stats: ChartLineMahalanobisStats,
): number | null {
  if (Math.abs(stats.det) < CHART_LINE_MAHALANOBIS_DET_EPSILON) return null;
  const dv = feature.value - stats.muValue;
  const dr = feature.ret - stats.muRet;
  const inv00 = stats.varRet / stats.det;
  const inv11 = stats.varValue / stats.det;
  const inv01 = -stats.covValueRet / stats.det;
  const d2 = dv * dv * inv00 + 2 * dv * dr * inv01 + dr * dr * inv11;
  if (!isFiniteNumber(d2) || d2 < 0) return null;
  return Math.sqrt(d2);
}

/** Per-bar rolling Mahalanobis distance; warm-up bars are null. */
export function computeLineMahalanobisRolling(
  values: readonly number[] | null | undefined,
  window: unknown,
): Array<number | null> {
  if (!Array.isArray(values)) return [];
  const w = normalizeLineMahalanobisWindow(
    window,
    DEFAULT_CHART_LINE_MAHALANOBIS_WINDOW,
  );
  const features = computeLineMahalanobisFeatures(values);
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < w) {
      out.push(null);
      continue;
    }
    const winFeatures: ChartLineMahalanobisFeature[] = [];
    let ok = true;
    for (let j = i - w + 1; j <= i; j += 1) {
      const f = features[j];
      if (!f) {
        ok = false;
        break;
      }
      winFeatures.push(f);
    }
    if (!ok || winFeatures.length === 0) {
      out.push(null);
      continue;
    }
    const stats = computeLineMahalanobisStats(winFeatures);
    const current = winFeatures[winFeatures.length - 1]!;
    out.push(computeLineMahalanobisDistance(current, stats));
  }
  return out;
}

/** Classify a distance against the outlier threshold. */
export function classifyLineMahalanobisZone(
  distance: number | null,
  threshold: number,
): ChartLineMahalanobisZone {
  if (!isFiniteNumber(distance)) return 'none';
  if (distance >= threshold) return 'outlier';
  return 'normal';
}

export interface ChartLineMahalanobisOptions {
  window?: number;
  threshold?: number;
}

/** Run the full Mahalanobis pipeline. */
export function runLineMahalanobis(
  data: readonly ChartLineMahalanobisPoint[] | null | undefined,
  options: ChartLineMahalanobisOptions = {},
): ChartLineMahalanobisRun {
  const series = getLineMahalanobisFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const window = normalizeLineMahalanobisWindow(
    options.window,
    DEFAULT_CHART_LINE_MAHALANOBIS_WINDOW,
  );
  const threshold = normalizeLineMahalanobisThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_MAHALANOBIS_THRESHOLD,
  );
  const distance = computeLineMahalanobisRolling(
    series.map((p) => p.value),
    window,
  );
  const samples: ChartLineMahalanobisSample[] = series.map((point, index) => {
    const d = distance[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      distance: d,
      zone: classifyLineMahalanobisZone(d, threshold),
    };
  });
  let normalCount = 0;
  let outlierCount = 0;
  let distanceFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'normal') normalCount += 1;
    else if (sample.zone === 'outlier') outlierCount += 1;
    if (isFiniteNumber(sample.distance)) distanceFinal = sample.distance;
  }
  return {
    series,
    window,
    threshold,
    distance,
    samples,
    distanceFinal,
    normalCount,
    outlierCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineMahalanobisLayoutOptions
  extends ChartLineMahalanobisOptions {
  data: readonly ChartLineMahalanobisPoint[] | null | undefined;
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
export function computeLineMahalanobisLayout(
  options: ChartLineMahalanobisLayoutOptions,
): ChartLineMahalanobisLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_MAHALANOBIS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_MAHALANOBIS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_MAHALANOBIS_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_MAHALANOBIS_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_MAHALANOBIS_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineMahalanobis(options.data, {
    ...(options.window !== undefined ? { window: options.window } : {}),
    ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const distancePanelTop = pricePanelBottom + gap;
  const distancePanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    distancePanelBottom - distancePanelTop > 0;
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

  let dMax = run.threshold * 1.5;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.distance) && sample.distance > dMax) {
      dMax = sample.distance;
    }
  }
  const distanceMin = 0;
  const distanceMax = Math.max(dMax, run.threshold * 1.2);
  const distancePanelHeight = distancePanelBottom - distancePanelTop;
  const distanceYAt = (value: number): number =>
    distancePanelBottom -
    ((value - distanceMin) / (distanceMax - distanceMin)) * distancePanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineMahalanobisDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, value: sample.value });
  });

  const distanceLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineMahalanobisMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.distance)) return;
    const cx = xAt(index);
    const cy = distanceYAt(sample.distance);
    distanceLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      distance: sample.distance,
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
    distancePanelTop,
    distancePanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    distancePath: buildLinePath(distanceLinePoints),
    markers,
    thresholdY: distanceYAt(run.threshold),
    priceMin,
    priceMax,
    distanceMin,
    distanceMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineMahalanobisChart(
  data: readonly ChartLineMahalanobisPoint[] | null | undefined,
  options: ChartLineMahalanobisOptions = {},
): string {
  const run = runLineMahalanobis(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.distanceFinal === null ? 'n/a' : run.distanceFinal.toFixed(3);
  return (
    `Two-panel chart with a Mahalanobis Distance panel (window ` +
    `${run.window}, threshold ${run.threshold}): the top panel plots ` +
    `the price, the bottom panel plots the distance of the bivariate ` +
    `feature vector [value, return] from the rolling-window mean and ` +
    `covariance. A singular covariance (a constant series or a linear ` +
    `ramp) leaves the distance null. Across ${total} bars the distance ` +
    `is normal on ${run.normalCount} and an outlier on ` +
    `${run.outlierCount}. The final distance is ${finalText}.`
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
  zone: ChartLineMahalanobisZone,
  normalColor: string,
  outlierColor: string,
  noneColor: string,
): string {
  if (zone === 'normal') return normalColor;
  if (zone === 'outlier') return outlierColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineMahalanobisZone): string {
  if (zone === 'normal') return 'Within band';
  if (zone === 'outlier') return 'Outlier';
  return 'n/a';
}

/**
 * ChartLineMahalanobis -- two-panel pure-SVG Mahalanobis Distance chart.
 */
export const ChartLineMahalanobis = forwardRef<
  HTMLDivElement,
  ChartLineMahalanobisProps
>(function ChartLineMahalanobis(props, ref) {
  const {
    data,
    window: windowProp = DEFAULT_CHART_LINE_MAHALANOBIS_WINDOW,
    threshold = DEFAULT_CHART_LINE_MAHALANOBIS_THRESHOLD,
    width = DEFAULT_CHART_LINE_MAHALANOBIS_WIDTH,
    height = DEFAULT_CHART_LINE_MAHALANOBIS_HEIGHT,
    padding = DEFAULT_CHART_LINE_MAHALANOBIS_PADDING,
    gap = DEFAULT_CHART_LINE_MAHALANOBIS_GAP,
    tickCount = DEFAULT_CHART_LINE_MAHALANOBIS_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_MAHALANOBIS_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_MAHALANOBIS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MAHALANOBIS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MAHALANOBIS_PRICE_COLOR,
    distanceColor = DEFAULT_CHART_LINE_MAHALANOBIS_DISTANCE_COLOR,
    normalColor = DEFAULT_CHART_LINE_MAHALANOBIS_NORMAL_COLOR,
    outlierColor = DEFAULT_CHART_LINE_MAHALANOBIS_OUTLIER_COLOR,
    noneColor = DEFAULT_CHART_LINE_MAHALANOBIS_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_MAHALANOBIS_THRESHOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_MAHALANOBIS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MAHALANOBIS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDistance = true,
    showThreshold = true,
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
  const baseId = `chart-line-mahalanobis-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineMahalanobisSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineMahalanobisSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineMahalanobisLayout({
        data,
        window: windowProp,
        threshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      windowProp,
      threshold,
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
    describeLineMahalanobisChart(data, { window: windowProp, threshold });
  const resolvedLabel =
    ariaLabel ??
    `Mahalanobis Distance chart, window ${run.window}, threshold ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineMahalanobisSeriesId): void => {
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
    const tooltipW = 196;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-mahalanobis-tooltip" pointerEvents="none">
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
          data-section="chart-line-mahalanobis-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-mahalanobis-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-mahalanobis-tooltip-distance"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Distance: ${
            hoverSample.distance === null
              ? 'n/a'
              : hoverSample.distance.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-mahalanobis-tooltip-threshold"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Threshold: ${run.threshold}`}
        </text>
        <text
          data-section="chart-line-mahalanobis-tooltip-zone"
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
  const distanceHidden = isHidden('distance') || !showDistance;

  const legendItems: Array<{
    id: ChartLineMahalanobisSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'distance', label: 'Distance', color: distanceColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-mahalanobis"
      data-empty={isEmpty ? 'true' : 'false'}
      data-window={run.window}
      data-threshold={run.threshold}
      data-distance-final={run.distanceFinal === null ? '' : run.distanceFinal}
      data-normal-count={run.normalCount}
      data-outlier-count={run.outlierCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-mahalanobis-aria-desc"
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
          data-section="chart-line-mahalanobis-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-mahalanobis-empty"
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
          data-section="chart-line-mahalanobis-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-mahalanobis-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-mahalanobis-grid-line"
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
                  layout.distancePanelBottom -
                  t * (layout.distancePanelBottom - layout.distancePanelTop);
                return (
                  <line
                    key={`dg-${i}`}
                    data-section="chart-line-mahalanobis-grid-line"
                    data-panel="distance"
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
            <g data-section="chart-line-mahalanobis-axes">
              <line
                data-section="chart-line-mahalanobis-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-mahalanobis-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-mahalanobis-axis"
                data-panel="distance"
                x1={layout.innerLeft}
                y1={layout.distancePanelTop}
                x2={layout.innerLeft}
                y2={layout.distancePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-mahalanobis-axis"
                data-panel="distance"
                x1={layout.innerLeft}
                y1={layout.distancePanelBottom}
                x2={layout.innerRight}
                y2={layout.distancePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-mahalanobis-tick-label"
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
                data-section="chart-line-mahalanobis-tick-label"
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
                data-section="chart-line-mahalanobis-tick-label"
                data-panel="distance"
                x={layout.innerLeft - 6}
                y={layout.distancePanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {layout.distanceMax.toFixed(1)}
              </text>
              <text
                data-section="chart-line-mahalanobis-tick-label"
                data-panel="distance"
                x={layout.innerLeft - 6}
                y={layout.distancePanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                0
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-mahalanobis-panel-label"
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
            data-section="chart-line-mahalanobis-panel-label"
            data-panel="distance"
            x={layout.innerRight}
            y={layout.distancePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Mahalanobis Distance
          </text>

          {showThreshold ? (
            <line
              data-section="chart-line-mahalanobis-threshold"
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
              data-section="chart-line-mahalanobis-price-path"
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
            <g data-section="chart-line-mahalanobis-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-mahalanobis-dot"
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

          {!distanceHidden ? (
            <path
              data-section="chart-line-mahalanobis-distance-path"
              d={layout.distancePath}
              fill="none"
              stroke={distanceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Mahalanobis Distance line, ${layout.markers.length} points`}
            />
          ) : null}

          {!distanceHidden && showMarkers ? (
            <g data-section="chart-line-mahalanobis-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-mahalanobis-marker"
                  data-zone={marker.zone}
                  data-distance={marker.distance}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    normalColor,
                    outlierColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, distance ${formatValue(
                    marker.distance,
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
            <g data-section="chart-line-mahalanobis-badge">
              <rect
                data-section="chart-line-mahalanobis-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={96}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-mahalanobis-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`MAHA ${run.window}/${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-mahalanobis-legend"
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
                data-section="chart-line-mahalanobis-legend-item"
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
                  data-section="chart-line-mahalanobis-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-mahalanobis-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-mahalanobis-legend-stats"
            style={{ color: axisColor }}
          >
            {`normal ${run.normalCount} / outlier ${run.outlierCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMahalanobis.displayName = 'ChartLineMahalanobis';
