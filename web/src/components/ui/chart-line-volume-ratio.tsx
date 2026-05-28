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
 * ChartLineVolumeRatio -- pure-SVG dual-panel chart with the close on
 * top and the Volume Ratio oscillator on the bottom. Volume Ratio
 * divides the current volume by the rolling average volume across the
 * lookback:
 *
 *   avgVol[i] = mean(volume[i - length + 1 .. i])
 *   ratio[i]  = avgVol[i] === 0 ? null : volume[i] / avgVol[i]
 *
 * `ratio[i]` is `null` during warmup (`i < length - 1`) and whenever
 * the lookback's average volume is zero. The output is unbounded
 * above (current volume can dominate any rolling mean) but bounded
 * below by zero (volume is non-negative).
 *
 * Bit-exact anchors:
 * - **CONST volume = V > 0**: `avgVol = V`, `ratio = V / V = 1`
 *   bit-exact for every post-warmup index (identity division).
 * - **CONST volume = 0**: `avgVol = 0`, divide-by-zero guard returns
 *   `null` everywhere.
 * - **LINEAR UP volume = i + 1**: at `i = L - 1`,
 *   `avgVol = L - (L - 1) / 2 = (L + 1) / 2`, so
 *   `ratio = L / ((L + 1) / 2) = 2L / (L + 1)`. For
 *   `L in {3, 7, 15}` the constant `2L / (L + 1)` is dyadic
 *   (1.5, 1.75, 1.875) and exact in IEEE 754.
 */

export interface ChartLineVolumeRatioPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineVolumeRatioZone =
  | 'high'
  | 'low'
  | 'neutral'
  | 'none';

export type ChartLineVolumeRatioCross = 'up' | 'down' | null;

export type ChartLineVolumeRatioSeriesId = 'price' | 'ratio';

export interface ChartLineVolumeRatioSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  avgVolume: number | null;
  ratio: number | null;
  zone: ChartLineVolumeRatioZone;
  crossed: ChartLineVolumeRatioCross;
}

export interface ChartLineVolumeRatioRun {
  series: ChartLineVolumeRatioPoint[];
  length: number;
  highThreshold: number;
  lowThreshold: number;
  avgVolumeValues: Array<number | null>;
  ratioValues: Array<number | null>;
  samples: ChartLineVolumeRatioSample[];
  highCount: number;
  lowCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineVolumeRatioMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  ratio: number;
  crossed: 'up' | 'down';
}

export interface ChartLineVolumeRatioDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVolumeRatioLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  ratioTop: number;
  ratioBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineVolumeRatioDot[];
  ratioPath: string;
  highY: number;
  lowY: number;
  midlineY: number;
  markers: ChartLineVolumeRatioMarker[];
  priceMin: number;
  priceMax: number;
  ratioMin: number;
  ratioMax: number;
  run: ChartLineVolumeRatioRun;
}

export interface ChartLineVolumeRatioProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVolumeRatioPoint[];
  length?: number;
  highThreshold?: number;
  lowThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  ratioColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  midlineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRatio?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVolumeRatioSeriesId[];
  defaultHiddenSeries?: ChartLineVolumeRatioSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVolumeRatioSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineVolumeRatioSample }) => void;
  formatPrice?: (value: number) => string;
  formatRatio?: (value: number) => string;
  formatVolume?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VOLUME_RATIO_WIDTH = 720;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_PADDING = 44;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_LENGTH = 14;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_HIGH_THRESHOLD = 1.5;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_LOW_THRESHOLD = 0.5;
export const DEFAULT_CHART_LINE_VOLUME_RATIO_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VOLUME_RATIO_RATIO_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_VOLUME_RATIO_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VOLUME_RATIO_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VOLUME_RATIO_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_VOLUME_RATIO_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_VOLUME_RATIO_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VOLUME_RATIO_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x, close and non-negative volume. */
export function getLineVolumeRatioFinitePoints(
  data: readonly ChartLineVolumeRatioPoint[] | null | undefined,
): ChartLineVolumeRatioPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVolumeRatioPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume) &&
      point.volume >= 0
    ) {
      out.push({
        x: point.x,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineVolumeRatioLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative threshold value. */
export function normalizeLineVolumeRatioThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

/** Rolling SMA over a window of length bars. */
export function applyLineVolumeRatioSma(
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

export interface LineVolumeRatioChannels {
  avgVolume: Array<number | null>;
  ratio: Array<number | null>;
}

/** Compute the avg-volume and ratio channels. */
export function computeLineVolumeRatio(
  series: readonly ChartLineVolumeRatioPoint[] | null | undefined,
  options: { length?: number } = {},
): LineVolumeRatioChannels {
  const cleaned = getLineVolumeRatioFinitePoints(series);
  if (cleaned.length === 0) {
    return { avgVolume: [], ratio: [] };
  }
  const length = normalizeLineVolumeRatioLength(
    options.length,
    DEFAULT_CHART_LINE_VOLUME_RATIO_LENGTH,
  );
  const volumes = cleaned.map((p) => p.volume);
  const avgVolume = applyLineVolumeRatioSma(volumes, length);
  const ratio: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const a = avgVolume[i];
    const v = volumes[i]!;
    if (a == null || a === 0) {
      ratio.push(null);
      continue;
    }
    const raw = v / a;
    ratio.push(Number.isFinite(raw) ? posZero(raw) : null);
  }
  return { avgVolume, ratio };
}

export function classifyLineVolumeRatioZone(
  value: number | null,
  highThreshold: number,
  lowThreshold: number,
): ChartLineVolumeRatioZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= highThreshold) return 'high';
  if (value <= lowThreshold) return 'low';
  return 'neutral';
}

export function detectLineVolumeRatioCrosses(
  values: readonly (number | null)[],
  highThreshold: number,
  lowThreshold: number,
): ChartLineVolumeRatioCross[] {
  const out: ChartLineVolumeRatioCross[] = [];
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
    if (prev < highThreshold && v >= highThreshold) {
      out.push('up');
    } else if (prev > lowThreshold && v <= lowThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineVolumeRatio(
  data: ChartLineVolumeRatioPoint[],
  options: {
    length?: number;
    highThreshold?: number;
    lowThreshold?: number;
  } = {},
): ChartLineVolumeRatioRun {
  const cleaned = getLineVolumeRatioFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineVolumeRatioLength(
    options.length,
    DEFAULT_CHART_LINE_VOLUME_RATIO_LENGTH,
  );
  const highThreshold = normalizeLineVolumeRatioThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_VOLUME_RATIO_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineVolumeRatioThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_VOLUME_RATIO_LOW_THRESHOLD,
  );

  const channels = computeLineVolumeRatio(series, { length });
  const crosses = detectLineVolumeRatioCrosses(
    channels.ratio,
    highThreshold,
    lowThreshold,
  );

  const samples: ChartLineVolumeRatioSample[] = series.map((p, i) => {
    const avgVolume = channels.avgVolume[i] ?? null;
    const ratio = channels.ratio[i] ?? null;
    const zone = classifyLineVolumeRatioZone(
      ratio,
      highThreshold,
      lowThreshold,
    );
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      avgVolume,
      ratio,
      zone,
      crossed,
    };
  });

  let highCount = 0;
  let lowCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'high') highCount += 1;
    else if (s.zone === 'low') lowCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length >= length;

  return {
    series = [],
    length,
    highThreshold,
    lowThreshold,
    avgVolumeValues: channels.avgVolume,
    ratioValues: channels.ratio,
    samples,
    highCount,
    lowCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineVolumeRatioLayoutOptions {
  data: ChartLineVolumeRatioPoint[];
  length?: number;
  highThreshold?: number;
  lowThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVolumeRatioLayout(
  opts: ComputeLineVolumeRatioLayoutOptions,
): ChartLineVolumeRatioLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VOLUME_RATIO_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VOLUME_RATIO_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_VOLUME_RATIO_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_VOLUME_RATIO_PANEL_GAP;

  const run = runLineVolumeRatio(opts.data, {
    length: opts.length ?? undefined,
    highThreshold: opts.highThreshold ?? undefined,
    lowThreshold: opts.lowThreshold ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const ratioTop = priceBottom + panelGap;
  const ratioBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      ratioTop,
      ratioBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      ratioPath: '',
      highY: ratioTop,
      lowY: ratioBottom,
      midlineY: (ratioTop + ratioBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      ratioMin: 0,
      ratioMax: 2,
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

  let ratioMin = 0;
  let ratioMax = Math.max(
    run.highThreshold + 0.5,
    run.lowThreshold + 0.5,
    2,
  );
  for (const s of run.samples) {
    if (s.ratio == null) continue;
    if (s.ratio > ratioMax) ratioMax = s.ratio;
  }
  if (ratioMin === ratioMax) ratioMax += 1;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syRatio = (y: number): number =>
    ratioBottom -
    ((y - ratioMin) / (ratioMax - ratioMin)) * (ratioBottom - ratioTop);

  let pricePath = '';
  const priceDots: ChartLineVolumeRatioDot[] = [];
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

  let ratioPath = '';
  let firstR = true;
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s || s.ratio == null) {
      firstR = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syRatio(s.ratio);
    ratioPath += `${firstR ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstR = false;
  }

  const markers: ChartLineVolumeRatioMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.ratio == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syRatio(s.ratio),
      close: s.close,
      ratio: s.ratio,
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
    ratioTop,
    ratioBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    ratioPath: ratioPath.trim(),
    highY: syRatio(run.highThreshold),
    lowY: syRatio(run.lowThreshold),
    midlineY: syRatio(1),
    markers,
    priceMin,
    priceMax,
    ratioMin,
    ratioMax,
    run,
  };
}

export function describeLineVolumeRatioChart(
  data: ChartLineVolumeRatioPoint[],
  options: {
    length?: number;
    highThreshold?: number;
    lowThreshold?: number;
  } = {},
): string {
  const cleaned = getLineVolumeRatioFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineVolumeRatioLength(
    options.length,
    DEFAULT_CHART_LINE_VOLUME_RATIO_LENGTH,
  );
  const highThreshold = normalizeLineVolumeRatioThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_VOLUME_RATIO_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineVolumeRatioThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_VOLUME_RATIO_LOW_THRESHOLD,
  );
  return (
    `Volume Ratio chart over ${cleaned.length} bars ` +
    `(length ${length}, highThreshold ${highThreshold}, ` +
    `lowThreshold ${lowThreshold}). Top panel renders the close; ` +
    `bottom panel renders the current volume over the rolling ` +
    `average volume across the lookback.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultRatioFormatter = (value: number): string => formatNumber(value);
const defaultVolumeFormatter = (value: number): string =>
  formatNumber(value, 0);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineVolumeRatio = forwardRef<
  HTMLDivElement,
  ChartLineVolumeRatioProps
>(function ChartLineVolumeRatio(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_VOLUME_RATIO_LENGTH,
    highThreshold = DEFAULT_CHART_LINE_VOLUME_RATIO_HIGH_THRESHOLD,
    lowThreshold = DEFAULT_CHART_LINE_VOLUME_RATIO_LOW_THRESHOLD,
    width = DEFAULT_CHART_LINE_VOLUME_RATIO_WIDTH,
    height = DEFAULT_CHART_LINE_VOLUME_RATIO_HEIGHT,
    padding = DEFAULT_CHART_LINE_VOLUME_RATIO_PADDING,
    panelGap = DEFAULT_CHART_LINE_VOLUME_RATIO_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VOLUME_RATIO_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VOLUME_RATIO_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VOLUME_RATIO_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VOLUME_RATIO_PRICE_COLOR,
    ratioColor = DEFAULT_CHART_LINE_VOLUME_RATIO_RATIO_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VOLUME_RATIO_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VOLUME_RATIO_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_VOLUME_RATIO_THRESHOLD_COLOR,
    midlineColor = DEFAULT_CHART_LINE_VOLUME_RATIO_MIDLINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_VOLUME_RATIO_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VOLUME_RATIO_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRatio = true,
    showMarkers = true,
    showThresholds = true,
    showMidline = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultPriceFormatter,
    formatRatio = defaultRatioFormatter,
    formatVolume = defaultVolumeFormatter,
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
    () => getLineVolumeRatioFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVolumeRatioLayout({
        data: cleaned,
        length,
        highThreshold,
        lowThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      highThreshold,
      lowThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineVolumeRatioSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVolumeRatioSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVolumeRatioSeriesId,
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
        data-section="chart-line-volume-ratio-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineVolumeRatioChart(cleaned, {
      length,
      highThreshold,
      lowThreshold,
    });

  const showPrice = !hidden.has('price');
  const showRatioLine = !hidden.has('ratio') && showRatio;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickRatioValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickRatioValues.push(
      layout.ratioMin + ((layout.ratioMax - layout.ratioMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Volume Ratio chart'}
      aria-describedby={descId}
      data-section="chart-line-volume-ratio"
      data-length={length}
      data-high-threshold={highThreshold}
      data-low-threshold={lowThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-volume-ratio-title"
      >
        {ariaLabel ?? 'Volume Ratio chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-volume-ratio-aria-desc"
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
        data-section="chart-line-volume-ratio-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-volume-ratio-grid">
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
                  data-section="chart-line-volume-ratio-grid-line-price"
                />
              );
            })}
            {tickRatioValues.map((v, i) => {
              const y =
                layout.ratioBottom -
                ((v - layout.ratioMin) /
                  (layout.ratioMax - layout.ratioMin)) *
                  (layout.ratioBottom - layout.ratioTop);
              return (
                <line
                  key={`grid-ratio-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-volume-ratio-grid-line-ratio"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-volume-ratio-axes">
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
              y1={layout.ratioTop}
              x2={layout.innerLeft}
              y2={layout.ratioBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.ratioBottom}
              x2={layout.innerRight}
              y2={layout.ratioBottom}
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
                  data-section="chart-line-volume-ratio-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickRatioValues.map((v, i) => {
              const y =
                layout.ratioBottom -
                ((v - layout.ratioMin) /
                  (layout.ratioMax - layout.ratioMin)) *
                  (layout.ratioBottom - layout.ratioTop);
              return (
                <text
                  key={`tick-ratio-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-volume-ratio-tick-ratio"
                >
                  {formatRatio(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showMidline ? (
          <line
            x1={layout.innerLeft}
            y1={layout.midlineY}
            x2={layout.innerRight}
            y2={layout.midlineY}
            stroke={midlineColor}
            strokeDasharray="2 4"
            data-section="chart-line-volume-ratio-midline"
          />
        ) : null}

        {showThresholds ? (
          <g data-section="chart-line-volume-ratio-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.highY}
              x2={layout.innerRight}
              y2={layout.highY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-volume-ratio-high-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.lowY}
              x2={layout.innerRight}
              y2={layout.lowY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-volume-ratio-low-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-volume-ratio-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-volume-ratio-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-volume-ratio-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showRatioLine ? (
          <path
            d={layout.ratioPath}
            stroke={ratioColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-volume-ratio-line"
          />
        ) : null}

        {showMarkers && showRatioLine ? (
          <g data-section="chart-line-volume-ratio-markers">
            {layout.markers.map((m) => (
              <circle
                key={`ratio-marker-${m.index}`}
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
                data-section="chart-line-volume-ratio-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-volume-ratio-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.ratioBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-volume-ratio-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-volume-ratio-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={122}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-ratio-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-ratio-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-ratio-tooltip-volume"
                >
                  vol {formatVolume(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-ratio-tooltip-avg"
                >
                  avgVol{' '}
                  {tooltipSample.avgVolume == null
                    ? '--'
                    : formatVolume(tooltipSample.avgVolume)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-ratio-tooltip-ratio"
                >
                  ratio{' '}
                  {tooltipSample.ratio == null
                    ? '--'
                    : formatRatio(tooltipSample.ratio)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-ratio-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-ratio-tooltip-cross"
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
          data-section="chart-line-volume-ratio-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | high {highThreshold} | low {lowThreshold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-volume-ratio-legend"
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
            data-series-id="ratio"
            aria-pressed={!hidden.has('ratio')}
            onClick={() => handleLegendClick('ratio')}
            onKeyDown={(e) => handleLegendKey(e, 'ratio')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('ratio') ? 0.4 : 1,
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
                background: ratioColor,
                borderRadius: 2,
              }}
            />
            volume ratio
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineVolumeRatio.displayName = 'ChartLineVolumeRatio';
