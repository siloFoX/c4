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
 * ChartLineStochRsi -- pure-SVG two-panel Stochastic RSI chart.
 *
 * The Stochastic RSI applies the stochastic oscillator formula to the RSI
 * series rather than to the price: it measures where the current RSI sits
 * within its own recent high-low range, on a 0..100 scale. It is an
 * "indicator of an indicator" -- far more sensitive than the plain RSI,
 * cycling between overbought and oversold readings much more often.
 *
 * The top panel plots the price; the bottom panel plots the Stochastic RSI
 * on a fixed 0..100 scale with dashed overbought / oversold threshold
 * lines and per-bar zone markers.
 */

export interface ChartLineStochRsiPoint {
  x: number;
  value: number;
}

export type ChartLineStochRsiZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineStochRsiSeriesId = 'price' | 'stoch';

export interface ChartLineStochRsiSample {
  index: number;
  x: number;
  value: number;
  rsi: number | null;
  stochRsi: number | null;
  zone: ChartLineStochRsiZone;
}

export interface ChartLineStochRsiRun {
  series: ChartLineStochRsiPoint[];
  rsiPeriod: number;
  stochPeriod: number;
  upperThreshold: number;
  lowerThreshold: number;
  rsi: (number | null)[];
  stochRsi: (number | null)[];
  samples: ChartLineStochRsiSample[];
  stochRsiFinal: number | null;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineStochRsiMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  stochRsi: number;
  zone: ChartLineStochRsiZone;
}

export interface ChartLineStochRsiDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineStochRsiLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  stochPanelTop: number;
  stochPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineStochRsiDot[];
  stochPath: string;
  markers: ChartLineStochRsiMarker[];
  upperY: number;
  lowerY: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineStochRsiRun;
}

export interface ChartLineStochRsiProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochRsiPoint[];
  rsiPeriod?: number;
  stochPeriod?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  stochColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  neutralColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStoch?: boolean;
  showThresholds?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochRsiSeriesId[];
  defaultHiddenSeries?: ChartLineStochRsiSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineStochRsiSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineStochRsiSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STOCH_RSI_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_RSI_HEIGHT = 400;
export const DEFAULT_CHART_LINE_STOCH_RSI_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_RSI_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_RSI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_RSI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_RSI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_RSI_RSI_PERIOD = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_STOCH_PERIOD = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_UPPER_THRESHOLD = 80;
export const DEFAULT_CHART_LINE_STOCH_RSI_LOWER_THRESHOLD = 20;
export const DEFAULT_CHART_LINE_STOCH_RSI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_STOCH_RSI_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_RSI_STOCH_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_RSI_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_STOCH_RSI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STOCH_RSI_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineStochRsiFinitePoints(
  data: readonly ChartLineStochRsiPoint[] | null | undefined,
): ChartLineStochRsiPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochRsiPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLineStochRsiPeriod(
  period: unknown,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/**
 * Wilder's Relative Strength Index of a close series. A strictly rising
 * series has no losses, so the RSI pins at 100; a strictly falling one
 * pins at 0; a wholly flat series reads 50. Defined from bar `rsiPeriod`.
 */
export function computeLineStochRsiRsi(
  closes: readonly number[] | null | undefined,
  rsiPeriod: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineStochRsiPeriod(rsiPeriod, 1);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + 1) return out;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < n; i += 1) {
    const d = (closes[i] as number) - (closes[i - 1] as number);
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }

  const rsiFrom = (ag: number, al: number): number => {
    if (ag + al === 0) return 50;
    return (100 * ag) / (ag + al);
  };

  let avgGain = 0;
  let avgLoss = 0;
  for (let k = 0; k < p; k += 1) {
    avgGain += gains[k] as number;
    avgLoss += losses[k] as number;
  }
  avgGain /= p;
  avgLoss /= p;
  out[p] = rsiFrom(avgGain, avgLoss);

  for (let i = p + 1; i < n; i += 1) {
    const g = gains[i - 1] as number;
    const l = losses[i - 1] as number;
    avgGain = (avgGain * (p - 1) + g) / p;
    avgLoss = (avgLoss * (p - 1) + l) / p;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

/**
 * Apply the stochastic oscillator formula to an array:
 * `100 * (value - lowest) / (highest - lowest)` over the trailing window.
 * A window touching a non-finite slot, or a flat window (highest equals
 * lowest), yields null.
 */
export function computeLineStochRsiStoch(
  values: readonly (number | null | undefined)[] | null | undefined,
  stochPeriod: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineStochRsiPeriod(stochPeriod, 1);
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < p) {
      out.push(null);
      continue;
    }
    let lo = Infinity;
    let hi = -Infinity;
    let ok = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const v = values[k];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const cur = values[i] as number;
    out.push(hi === lo ? null : (100 * (cur - lo)) / (hi - lo));
  }
  return out;
}

/**
 * Stochastic RSI: the stochastic oscillator formula applied to the RSI of
 * the close series.
 */
export function computeLineStochRsi(
  closes: readonly number[] | null | undefined,
  rsiPeriod: number,
  stochPeriod: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const rsi = computeLineStochRsiRsi(closes, rsiPeriod);
  return computeLineStochRsiStoch(rsi, stochPeriod);
}

/** Classify a bar by the Stochastic RSI against the thresholds. */
export function classifyLineStochRsiZone(
  stochRsi: number | null,
  upperThreshold: number,
  lowerThreshold: number,
): ChartLineStochRsiZone {
  if (!isFiniteNumber(stochRsi)) return 'none';
  if (stochRsi > upperThreshold) return 'overbought';
  if (stochRsi < lowerThreshold) return 'oversold';
  return 'neutral';
}

export interface ChartLineStochRsiOptions {
  rsiPeriod?: number;
  stochPeriod?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
}

function normalizeThreshold(value: unknown, fallback: number): number {
  if (isFiniteNumber(value) && value > 0 && value < 100) return value;
  return fallback;
}

/** Run the full Stochastic RSI pipeline over a set of points. */
export function runLineStochRsi(
  data: readonly ChartLineStochRsiPoint[] | null | undefined,
  options: ChartLineStochRsiOptions = {},
): ChartLineStochRsiRun {
  const series = getLineStochRsiFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const rsiPeriod = normalizeLineStochRsiPeriod(
    options.rsiPeriod,
    DEFAULT_CHART_LINE_STOCH_RSI_RSI_PERIOD,
  );
  const stochPeriod = normalizeLineStochRsiPeriod(
    options.stochPeriod,
    DEFAULT_CHART_LINE_STOCH_RSI_STOCH_PERIOD,
  );
  const upperThreshold = normalizeThreshold(
    options.upperThreshold,
    DEFAULT_CHART_LINE_STOCH_RSI_UPPER_THRESHOLD,
  );
  const lowerThreshold = normalizeThreshold(
    options.lowerThreshold,
    DEFAULT_CHART_LINE_STOCH_RSI_LOWER_THRESHOLD,
  );

  const closes = series.map((point) => point.value);
  const rsi = computeLineStochRsiRsi(closes, rsiPeriod);
  const stochRsi = computeLineStochRsiStoch(rsi, stochPeriod);

  const samples: ChartLineStochRsiSample[] = series.map((point, index) => {
    const stochValue = stochRsi[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      rsi: rsi[index] ?? null,
      stochRsi: stochValue,
      zone: classifyLineStochRsiZone(stochValue, upperThreshold, lowerThreshold),
    };
  });

  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let stochRsiFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    if (isFiniteNumber(sample.stochRsi)) stochRsiFinal = sample.stochRsi;
  }

  return {
    series = [],
    rsiPeriod,
    stochPeriod,
    upperThreshold,
    lowerThreshold,
    rsi,
    stochRsi,
    samples,
    stochRsiFinal,
    overboughtCount,
    oversoldCount,
    neutralCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineStochRsiLayoutOptions extends ChartLineStochRsiOptions {
  data: readonly ChartLineStochRsiPoint[] | null | undefined;
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
export function computeLineStochRsiLayout(
  options: ChartLineStochRsiLayoutOptions,
): ChartLineStochRsiLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_STOCH_RSI_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_STOCH_RSI_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_STOCH_RSI_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_STOCH_RSI_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_STOCH_RSI_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineStochRsi(options.data, {
    ...(options.rsiPeriod !== undefined ? { rsiPeriod: options.rsiPeriod } : {}),
    ...(options.stochPeriod !== undefined
      ? { stochPeriod: options.stochPeriod }
      : {}),
    ...(options.upperThreshold !== undefined
      ? { upperThreshold: options.upperThreshold }
      : {}),
    ...(options.lowerThreshold !== undefined
      ? { lowerThreshold: options.lowerThreshold }
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
  const stochPanelTop = pricePanelBottom + gap;
  const stochPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && stochPanelBottom - stochPanelTop > 0;
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

  const stochPanelHeight = stochPanelBottom - stochPanelTop;
  const stochYAt = (value: number): number =>
    stochPanelBottom - (value / 100) * stochPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineStochRsiDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const stochLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineStochRsiMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.stochRsi)) return;
    const cx = xAt(index);
    const cy = stochYAt(sample.stochRsi);
    stochLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      stochRsi: sample.stochRsi,
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
    stochPanelTop,
    stochPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    stochPath: buildLinePath(stochLinePoints),
    markers,
    upperY: stochYAt(run.upperThreshold),
    lowerY: stochYAt(run.lowerThreshold),
    priceMin,
    priceMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineStochRsiChart(
  data: readonly ChartLineStochRsiPoint[] | null | undefined,
  options: ChartLineStochRsiOptions = {},
): string {
  const run = runLineStochRsi(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.stochRsiFinal === null ? 'n/a' : run.stochRsiFinal.toFixed(2);
  return (
    `Two-panel chart with the Stochastic RSI (RSI ${run.rsiPeriod}, stoch ` +
    `${run.stochPeriod}): the top panel plots the price, the bottom panel ` +
    `plots the Stochastic RSI. The Stochastic RSI applies the stochastic ` +
    `oscillator formula to the RSI series -- it measures where the current ` +
    `RSI sits within its own recent high-low range, on a 0 to 100 scale. ` +
    `Across ${total} bars it is overbought on ${run.overboughtCount}, ` +
    `oversold on ${run.oversoldCount} and neutral on ${run.neutralCount}. ` +
    `The final reading is ${finalText}.`
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
  zone: ChartLineStochRsiZone,
  overboughtColor: string,
  oversoldColor: string,
  neutralColor: string,
): string {
  if (zone === 'overbought') return overboughtColor;
  if (zone === 'oversold') return oversoldColor;
  return neutralColor;
}

function zoneLabelOf(zone: ChartLineStochRsiZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

/**
 * ChartLineStochRsi -- two-panel pure-SVG Stochastic RSI chart.
 */
export const ChartLineStochRsi = forwardRef<HTMLDivElement, ChartLineStochRsiProps>(
  function ChartLineStochRsi(props, ref) {
    const {
      data,
      rsiPeriod = DEFAULT_CHART_LINE_STOCH_RSI_RSI_PERIOD,
      stochPeriod = DEFAULT_CHART_LINE_STOCH_RSI_STOCH_PERIOD,
      upperThreshold = DEFAULT_CHART_LINE_STOCH_RSI_UPPER_THRESHOLD,
      lowerThreshold = DEFAULT_CHART_LINE_STOCH_RSI_LOWER_THRESHOLD,
      width = DEFAULT_CHART_LINE_STOCH_RSI_WIDTH,
      height = DEFAULT_CHART_LINE_STOCH_RSI_HEIGHT,
      padding = DEFAULT_CHART_LINE_STOCH_RSI_PADDING,
      gap = DEFAULT_CHART_LINE_STOCH_RSI_GAP,
      tickCount = DEFAULT_CHART_LINE_STOCH_RSI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_STOCH_RSI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_STOCH_RSI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_STOCH_RSI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_STOCH_RSI_PRICE_COLOR,
      stochColor = DEFAULT_CHART_LINE_STOCH_RSI_STOCH_COLOR,
      overboughtColor = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_COLOR,
      oversoldColor = DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_COLOR,
      neutralColor = DEFAULT_CHART_LINE_STOCH_RSI_NEUTRAL_COLOR,
      gridColor = DEFAULT_CHART_LINE_STOCH_RSI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_STOCH_RSI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showStoch = true,
      showThresholds = true,
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
    const baseId = `chart-line-stoch-rsi-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineStochRsiSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineStochRsiSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineStochRsiLayout({
          data,
          rsiPeriod,
          stochPeriod,
          upperThreshold,
          lowerThreshold,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
        }),
      [
        data,
        rsiPeriod,
        stochPeriod,
        upperThreshold,
        lowerThreshold,
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
      describeLineStochRsiChart(data, {
        rsiPeriod,
        stochPeriod,
        upperThreshold,
        lowerThreshold,
      });
    const resolvedLabel =
      ariaLabel ??
      `Stochastic RSI chart, RSI ${run.rsiPeriod}, stoch ${run.stochPeriod}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineStochRsiSeriesId): void => {
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
      const tooltipW = 168;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.pricePanelTop + 6;
      tooltip = (
        <g data-section="chart-line-stoch-rsi-tooltip" pointerEvents="none">
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
            data-section="chart-line-stoch-rsi-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-stoch-rsi-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-stoch-rsi-tooltip-rsi"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`RSI: ${
              hoverSample.rsi === null ? 'n/a' : formatValue(hoverSample.rsi)
            }`}
          </text>
          <text
            data-section="chart-line-stoch-rsi-tooltip-stoch"
            x={tx + 10}
            y={ty + 67}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`StochRSI: ${
              hoverSample.stochRsi === null
                ? 'n/a'
                : formatValue(hoverSample.stochRsi)
            }`}
          </text>
          <text
            data-section="chart-line-stoch-rsi-tooltip-zone"
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
    const stochHidden = isHidden('stoch') || !showStoch;

    const legendItems: Array<{
      id: ChartLineStochRsiSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'stoch', label: 'StochRSI', color: stochColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-stoch-rsi"
        data-empty={isEmpty ? 'true' : 'false'}
        data-rsi-period={run.rsiPeriod}
        data-stoch-period={run.stochPeriod}
        data-upper-threshold={run.upperThreshold}
        data-lower-threshold={run.lowerThreshold}
        data-stoch-rsi-final={run.stochRsiFinal === null ? '' : run.stochRsiFinal}
        data-overbought-count={run.overboughtCount}
        data-oversold-count={run.oversoldCount}
        data-neutral-count={run.neutralCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-stoch-rsi-aria-desc"
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
            data-section="chart-line-stoch-rsi-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-stoch-rsi-empty"
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
            data-section="chart-line-stoch-rsi-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-stoch-rsi-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-stoch-rsi-grid-line"
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
                  const sy =
                    layout.stochPanelBottom -
                    t * (layout.stochPanelBottom - layout.stochPanelTop);
                  return (
                    <line
                      key={`sg-${i}`}
                      data-section="chart-line-stoch-rsi-grid-line"
                      data-panel="stoch"
                      x1={layout.innerLeft}
                      y1={sy}
                      x2={layout.innerRight}
                      y2={sy}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g data-section="chart-line-stoch-rsi-axes">
                <line
                  data-section="chart-line-stoch-rsi-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-stoch-rsi-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-stoch-rsi-axis"
                  data-panel="stoch"
                  x1={layout.innerLeft}
                  y1={layout.stochPanelTop}
                  x2={layout.innerLeft}
                  y2={layout.stochPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-stoch-rsi-axis"
                  data-panel="stoch"
                  x1={layout.innerLeft}
                  y1={layout.stochPanelBottom}
                  x2={layout.innerRight}
                  y2={layout.stochPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-stoch-rsi-tick-label"
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
                  data-section="chart-line-stoch-rsi-tick-label"
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
                  data-section="chart-line-stoch-rsi-tick-label"
                  data-panel="stoch"
                  x={layout.innerLeft - 6}
                  y={layout.stochPanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  100
                </text>
                <text
                  data-section="chart-line-stoch-rsi-tick-label"
                  data-panel="stoch"
                  x={layout.innerLeft - 6}
                  y={layout.stochPanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  0
                </text>
              </g>
            ) : null}

            <text
              data-section="chart-line-stoch-rsi-panel-label"
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
              data-section="chart-line-stoch-rsi-panel-label"
              data-panel="stoch"
              x={layout.innerRight}
              y={layout.stochPanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Stochastic RSI
            </text>

            {showThresholds ? (
              <g data-section="chart-line-stoch-rsi-thresholds">
                <line
                  data-section="chart-line-stoch-rsi-threshold-line"
                  data-level="upper"
                  x1={layout.innerLeft}
                  y1={layout.upperY}
                  x2={layout.innerRight}
                  y2={layout.upperY}
                  stroke={overboughtColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-stoch-rsi-threshold-line"
                  data-level="lower"
                  x1={layout.innerLeft}
                  y1={layout.lowerY}
                  x2={layout.innerRight}
                  y2={layout.lowerY}
                  stroke={oversoldColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </g>
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-stoch-rsi-price-path"
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
              <g data-section="chart-line-stoch-rsi-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-stoch-rsi-dot"
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

            {!stochHidden ? (
              <path
                data-section="chart-line-stoch-rsi-stoch-line"
                d={layout.stochPath}
                fill="none"
                stroke={stochColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Stochastic RSI line, ${layout.markers.length} points`}
              />
            ) : null}

            {!stochHidden && showMarkers ? (
              <g data-section="chart-line-stoch-rsi-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-stoch-rsi-marker"
                    data-zone={marker.zone}
                    data-stoch-rsi={marker.stochRsi}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      overboughtColor,
                      oversoldColor,
                      neutralColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, Stochastic RSI ${formatValue(
                      marker.stochRsi,
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
              <g data-section="chart-line-stoch-rsi-badge">
                <rect
                  data-section="chart-line-stoch-rsi-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={92}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-stoch-rsi-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`SRSI ${run.rsiPeriod}/${run.stochPeriod}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-stoch-rsi-legend"
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
                  data-section="chart-line-stoch-rsi-legend-item"
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
                    data-section="chart-line-stoch-rsi-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-stoch-rsi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-stoch-rsi-legend-stats"
              style={{ color: axisColor }}
            >
              {`overbought ${run.overboughtCount} / oversold ${run.oversoldCount} / neutral ${run.neutralCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineStochRsi.displayName = 'ChartLineStochRsi';
