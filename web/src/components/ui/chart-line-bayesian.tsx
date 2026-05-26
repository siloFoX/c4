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
 * ChartLineBayesian -- pure-SVG two-panel Bayesian Trend probability
 * chart.
 *
 * Three hypotheses about the rolling-window return generator are kept:
 *   H_up   : returns drawn from N(+delta, sigma^2)
 *   H_flat : returns drawn from N(    0, sigma^2)
 *   H_down : returns drawn from N(-delta, sigma^2)
 *
 * For each bar the lookback of `window` returns ending at the bar is
 * formed, the log-likelihood of each hypothesis is summed, and the
 * posterior probabilities `(pUp, pFlat, pDown)` are obtained by a
 * softmax over the three log-likelihoods with equal priors. The
 * normal-density constants cancel in the softmax so the implementation
 * keeps only the `-0.5 * ((r - mu) / sigma)^2` term.
 *
 * Two panels: the price line on top, the three probability curves in
 * a fixed `[0, 1]` band on the bottom. Each defined bar is classified
 * by `argmax`: `'up'` if `pUp` leads, `'down'` if `pDown` leads,
 * `'flat'` if `pFlat` leads (ties favour flat over up over down). The
 * warm-up bars (before the lookback fills) are marked `'none'`.
 */

export interface ChartLineBayesianPoint {
  x: number;
  value: number;
}

export type ChartLineBayesianZone = 'up' | 'flat' | 'down' | 'none';

export type ChartLineBayesianSeriesId = 'price' | 'pUp' | 'pFlat' | 'pDown';

export interface ChartLineBayesianPosterior {
  pUp: number;
  pFlat: number;
  pDown: number;
}

export interface ChartLineBayesianSample {
  index: number;
  x: number;
  value: number;
  pUp: number | null;
  pFlat: number | null;
  pDown: number | null;
  zone: ChartLineBayesianZone;
}

export interface ChartLineBayesianRun {
  series: ChartLineBayesianPoint[];
  window: number;
  delta: number;
  sigma: number;
  posterior: Array<ChartLineBayesianPosterior | null>;
  samples: ChartLineBayesianSample[];
  pUpFinal: number | null;
  pFlatFinal: number | null;
  pDownFinal: number | null;
  upCount: number;
  flatCount: number;
  downCount: number;
  ok: boolean;
}

export interface ChartLineBayesianMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  pUp: number;
  pFlat: number;
  pDown: number;
  zone: ChartLineBayesianZone;
}

export interface ChartLineBayesianDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineBayesianLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  probPanelTop: number;
  probPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineBayesianDot[];
  pUpPath: string;
  pFlatPath: string;
  pDownPath: string;
  markers: ChartLineBayesianMarker[];
  midlineY: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineBayesianRun;
}

export interface ChartLineBayesianProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineBayesianPoint[];
  window?: number;
  delta?: number;
  sigma?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  noneColor?: string;
  midlineColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showProb?: boolean;
  showMidline?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineBayesianSeriesId[];
  defaultHiddenSeries?: ChartLineBayesianSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineBayesianSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineBayesianSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_BAYESIAN_WIDTH = 720;
export const DEFAULT_CHART_LINE_BAYESIAN_HEIGHT = 400;
export const DEFAULT_CHART_LINE_BAYESIAN_PADDING = 44;
export const DEFAULT_CHART_LINE_BAYESIAN_GAP = 12;
export const DEFAULT_CHART_LINE_BAYESIAN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BAYESIAN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_BAYESIAN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BAYESIAN_WINDOW = 10;
export const DEFAULT_CHART_LINE_BAYESIAN_DELTA = 0.01;
export const DEFAULT_CHART_LINE_BAYESIAN_SIGMA = 0.02;
export const DEFAULT_CHART_LINE_BAYESIAN_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_BAYESIAN_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_BAYESIAN_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BAYESIAN_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BAYESIAN_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_BAYESIAN_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_BAYESIAN_MIDLINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BAYESIAN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BAYESIAN_AXIS_COLOR = '#94a3b8';

/** The probability panel's natural midline (equal posterior threshold). */
export const CHART_LINE_BAYESIAN_MIDLINE = 0.5;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and value. */
export function getLineBayesianFinitePoints(
  data: readonly ChartLineBayesianPoint[] | null | undefined,
): ChartLineBayesianPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineBayesianPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the lookback window to an integer of at least 2. */
export function normalizeLineBayesianWindow(
  window: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(window) && window >= 2) return Math.floor(window);
  return fallback;
}

/** Coerce the drift delta to a strictly positive finite number. */
export function normalizeLineBayesianDelta(
  delta: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(delta) && delta > 0) return delta;
  return fallback;
}

/** Coerce sigma to a strictly positive finite number. */
export function normalizeLineBayesianSigma(
  sigma: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(sigma) && sigma > 0) return sigma;
  return fallback;
}

/** Compute bar-to-bar returns. The first bar is null. */
export function computeLineBayesianReturns(
  values: readonly number[] | null | undefined,
): Array<number | null> {
  if (!Array.isArray(values)) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (i === 0) {
      out.push(null);
      continue;
    }
    const prev = values[i - 1];
    if (!isFiniteNumber(v) || !isFiniteNumber(prev)) {
      out.push(null);
    } else {
      out.push(v - prev);
    }
  }
  return out;
}

/** Compute the posterior for a single window of returns. */
export function computeLineBayesianPosteriorWindow(
  returns: readonly number[],
  delta: number,
  sigma: number,
): ChartLineBayesianPosterior {
  let lUp = 0;
  let lFlat = 0;
  let lDown = 0;
  for (const r of returns) {
    const dUp = (r - delta) / sigma;
    const dFlat = r / sigma;
    const dDown = (r + delta) / sigma;
    lUp += -0.5 * dUp * dUp;
    lFlat += -0.5 * dFlat * dFlat;
    lDown += -0.5 * dDown * dDown;
  }
  const m = Math.max(lUp, lFlat, lDown);
  const eUp = Math.exp(lUp - m);
  const eFlat = Math.exp(lFlat - m);
  const eDown = Math.exp(lDown - m);
  const s = eUp + eFlat + eDown;
  return { pUp: eUp / s, pFlat: eFlat / s, pDown: eDown / s };
}

/**
 * Per-bar Bayesian posterior with a rolling window of returns. The
 * first `window` bars are null (the lookback has not yet filled).
 */
export function computeLineBayesianPosterior(
  values: readonly number[] | null | undefined,
  window: unknown,
  delta: unknown,
  sigma: unknown,
): Array<ChartLineBayesianPosterior | null> {
  if (!Array.isArray(values)) return [];
  const w = normalizeLineBayesianWindow(
    window,
    DEFAULT_CHART_LINE_BAYESIAN_WINDOW,
  );
  const d = normalizeLineBayesianDelta(
    delta,
    DEFAULT_CHART_LINE_BAYESIAN_DELTA,
  );
  const s = normalizeLineBayesianSigma(
    sigma,
    DEFAULT_CHART_LINE_BAYESIAN_SIGMA,
  );
  const out: Array<ChartLineBayesianPosterior | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < w) {
      out.push(null);
      continue;
    }
    const returns: number[] = [];
    let ok = true;
    for (let j = i - w + 1; j <= i; j += 1) {
      const a = values[j - 1];
      const b = values[j];
      if (!isFiniteNumber(a) || !isFiniteNumber(b)) {
        ok = false;
        break;
      }
      returns.push(b - a);
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(computeLineBayesianPosteriorWindow(returns, d, s));
  }
  return out;
}

/** Classify a posterior by argmax: up | flat | down | none. */
export function classifyLineBayesianZone(
  posterior: ChartLineBayesianPosterior | null,
): ChartLineBayesianZone {
  if (!posterior) return 'none';
  const { pUp, pFlat, pDown } = posterior;
  if (!isFiniteNumber(pUp) || !isFiniteNumber(pFlat) || !isFiniteNumber(pDown))
    return 'none';
  if (pFlat >= pUp && pFlat >= pDown) return 'flat';
  if (pUp >= pDown) return 'up';
  return 'down';
}

export interface ChartLineBayesianOptions {
  window?: number;
  delta?: number;
  sigma?: number;
}

/** Run the full Bayesian Trend pipeline. */
export function runLineBayesian(
  data: readonly ChartLineBayesianPoint[] | null | undefined,
  options: ChartLineBayesianOptions = {},
): ChartLineBayesianRun {
  const series = getLineBayesianFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const window = normalizeLineBayesianWindow(
    options.window,
    DEFAULT_CHART_LINE_BAYESIAN_WINDOW,
  );
  const delta = normalizeLineBayesianDelta(
    options.delta,
    DEFAULT_CHART_LINE_BAYESIAN_DELTA,
  );
  const sigma = normalizeLineBayesianSigma(
    options.sigma,
    DEFAULT_CHART_LINE_BAYESIAN_SIGMA,
  );
  const posterior = computeLineBayesianPosterior(
    series.map((p) => p.value),
    window,
    delta,
    sigma,
  );
  const samples: ChartLineBayesianSample[] = series.map((point, index) => {
    const post = posterior[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      pUp: post ? post.pUp : null,
      pFlat: post ? post.pFlat : null,
      pDown: post ? post.pDown : null,
      zone: classifyLineBayesianZone(post),
    };
  });
  let upCount = 0;
  let flatCount = 0;
  let downCount = 0;
  let pUpFinal: number | null = null;
  let pFlatFinal: number | null = null;
  let pDownFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    if (isFiniteNumber(sample.pUp)) pUpFinal = sample.pUp;
    if (isFiniteNumber(sample.pFlat)) pFlatFinal = sample.pFlat;
    if (isFiniteNumber(sample.pDown)) pDownFinal = sample.pDown;
  }
  return {
    series,
    window,
    delta,
    sigma,
    posterior,
    samples,
    pUpFinal,
    pFlatFinal,
    pDownFinal,
    upCount,
    flatCount,
    downCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineBayesianLayoutOptions
  extends ChartLineBayesianOptions {
  data: readonly ChartLineBayesianPoint[] | null | undefined;
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
export function computeLineBayesianLayout(
  options: ChartLineBayesianLayoutOptions,
): ChartLineBayesianLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_BAYESIAN_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_BAYESIAN_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_BAYESIAN_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_BAYESIAN_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_BAYESIAN_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineBayesian(options.data, {
    ...(options.window !== undefined ? { window: options.window } : {}),
    ...(options.delta !== undefined ? { delta: options.delta } : {}),
    ...(options.sigma !== undefined ? { sigma: options.sigma } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const probPanelTop = pricePanelBottom + gap;
  const probPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    probPanelBottom - probPanelTop > 0;
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

  const probPanelHeight = probPanelBottom - probPanelTop;
  const probYAt = (value: number): number =>
    probPanelBottom - value * probPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineBayesianDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, value: sample.value });
  });

  const pUpPoints: Array<{ x: number; y: number }> = [];
  const pFlatPoints: Array<{ x: number; y: number }> = [];
  const pDownPoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineBayesianMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (
      !isFiniteNumber(sample.pUp) ||
      !isFiniteNumber(sample.pFlat) ||
      !isFiniteNumber(sample.pDown)
    )
      return;
    const cx = xAt(index);
    pUpPoints.push({ x: cx, y: probYAt(sample.pUp) });
    pFlatPoints.push({ x: cx, y: probYAt(sample.pFlat) });
    pDownPoints.push({ x: cx, y: probYAt(sample.pDown) });
    const leader =
      sample.zone === 'up'
        ? sample.pUp
        : sample.zone === 'down'
          ? sample.pDown
          : sample.pFlat;
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: probYAt(leader),
      pUp: sample.pUp,
      pFlat: sample.pFlat,
      pDown: sample.pDown,
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
    probPanelTop,
    probPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    pUpPath: buildLinePath(pUpPoints),
    pFlatPath: buildLinePath(pFlatPoints),
    pDownPath: buildLinePath(pDownPoints),
    markers,
    midlineY: probYAt(CHART_LINE_BAYESIAN_MIDLINE),
    priceMin,
    priceMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineBayesianChart(
  data: readonly ChartLineBayesianPoint[] | null | undefined,
  options: ChartLineBayesianOptions = {},
): string {
  const run = runLineBayesian(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = (v: number | null): string =>
    v === null ? 'n/a' : v.toFixed(3);
  return (
    `Two-panel chart with a Bayesian Trend posterior (window ` +
    `${run.window}, drift ${run.delta}, sigma ${run.sigma}): the top ` +
    `panel plots the price, the bottom panel plots the posterior ` +
    `probability of three trend hypotheses given the observed returns. ` +
    `For each bar the lookback of returns is scored against the up, ` +
    `flat and down hypotheses; equal priors and a softmax over the ` +
    `log-likelihoods give the posterior. Across ${total} bars the ` +
    `up hypothesis leads on ${run.upCount}, the flat hypothesis on ` +
    `${run.flatCount} and the down hypothesis on ${run.downCount}. ` +
    `The final posterior is up=${finalText(run.pUpFinal)}, ` +
    `flat=${finalText(run.pFlatFinal)}, down=${finalText(run.pDownFinal)}.`
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
  zone: ChartLineBayesianZone,
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

function zoneLabelOf(zone: ChartLineBayesianZone): string {
  if (zone === 'up') return 'Up trend';
  if (zone === 'down') return 'Down trend';
  if (zone === 'flat') return 'No trend';
  return 'n/a';
}

/**
 * ChartLineBayesian -- two-panel pure-SVG Bayesian Trend probability
 * chart.
 */
export const ChartLineBayesian = forwardRef<
  HTMLDivElement,
  ChartLineBayesianProps
>(function ChartLineBayesian(props, ref) {
  const {
    data,
    window: windowProp = DEFAULT_CHART_LINE_BAYESIAN_WINDOW,
    delta = DEFAULT_CHART_LINE_BAYESIAN_DELTA,
    sigma = DEFAULT_CHART_LINE_BAYESIAN_SIGMA,
    width = DEFAULT_CHART_LINE_BAYESIAN_WIDTH,
    height = DEFAULT_CHART_LINE_BAYESIAN_HEIGHT,
    padding = DEFAULT_CHART_LINE_BAYESIAN_PADDING,
    gap = DEFAULT_CHART_LINE_BAYESIAN_GAP,
    tickCount = DEFAULT_CHART_LINE_BAYESIAN_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_BAYESIAN_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_BAYESIAN_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BAYESIAN_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_BAYESIAN_PRICE_COLOR,
    upColor = DEFAULT_CHART_LINE_BAYESIAN_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_BAYESIAN_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_BAYESIAN_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_BAYESIAN_NONE_COLOR,
    midlineColor = DEFAULT_CHART_LINE_BAYESIAN_MIDLINE_COLOR,
    gridColor = DEFAULT_CHART_LINE_BAYESIAN_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_BAYESIAN_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showProb = true,
    showMidline = true,
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
  const baseId = `chart-line-bayesian-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineBayesianSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineBayesianSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineBayesianLayout({
        data,
        window: windowProp,
        delta,
        sigma,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      windowProp,
      delta,
      sigma,
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
    describeLineBayesianChart(data, {
      window: windowProp,
      delta,
      sigma,
    });
  const resolvedLabel =
    ariaLabel ??
    `Bayesian Trend probability chart, window ${run.window}, drift ${run.delta}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineBayesianSeriesId): void => {
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
      <g data-section="chart-line-bayesian-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={120}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-bayesian-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-bayesian-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-bayesian-tooltip-p-up"
          x={tx + 10}
          y={ty + 51}
          fill="#86efac"
          fontSize={11}
        >
          {`P(up): ${
            hoverSample.pUp === null ? 'n/a' : hoverSample.pUp.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-bayesian-tooltip-p-flat"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`P(flat): ${
            hoverSample.pFlat === null ? 'n/a' : hoverSample.pFlat.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-bayesian-tooltip-p-down"
          x={tx + 10}
          y={ty + 83}
          fill="#fca5a5"
          fontSize={11}
        >
          {`P(down): ${
            hoverSample.pDown === null ? 'n/a' : hoverSample.pDown.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-bayesian-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Bias: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const pUpHidden = isHidden('pUp');
  const pFlatHidden = isHidden('pFlat');
  const pDownHidden = isHidden('pDown');
  const allProbHidden = !showProb || (pUpHidden && pFlatHidden && pDownHidden);

  const legendItems: Array<{
    id: ChartLineBayesianSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'pUp', label: 'P(up)', color: upColor },
    { id: 'pFlat', label: 'P(flat)', color: flatColor },
    { id: 'pDown', label: 'P(down)', color: downColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-bayesian"
      data-empty={isEmpty ? 'true' : 'false'}
      data-window={run.window}
      data-delta={run.delta}
      data-sigma={run.sigma}
      data-p-up-final={run.pUpFinal === null ? '' : run.pUpFinal}
      data-p-flat-final={run.pFlatFinal === null ? '' : run.pFlatFinal}
      data-p-down-final={run.pDownFinal === null ? '' : run.pDownFinal}
      data-up-count={run.upCount}
      data-flat-count={run.flatCount}
      data-down-count={run.downCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-bayesian-aria-desc"
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
          data-section="chart-line-bayesian-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-bayesian-empty"
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
          data-section="chart-line-bayesian-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-bayesian-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-bayesian-grid-line"
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
                  layout.probPanelBottom -
                  t * (layout.probPanelBottom - layout.probPanelTop);
                return (
                  <line
                    key={`probg-${i}`}
                    data-section="chart-line-bayesian-grid-line"
                    data-panel="prob"
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
            <g data-section="chart-line-bayesian-axes">
              <line
                data-section="chart-line-bayesian-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-bayesian-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-bayesian-axis"
                data-panel="prob"
                x1={layout.innerLeft}
                y1={layout.probPanelTop}
                x2={layout.innerLeft}
                y2={layout.probPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-bayesian-axis"
                data-panel="prob"
                x1={layout.innerLeft}
                y1={layout.probPanelBottom}
                x2={layout.innerRight}
                y2={layout.probPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-bayesian-tick-label"
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
                data-section="chart-line-bayesian-tick-label"
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
                data-section="chart-line-bayesian-tick-label"
                data-panel="prob"
                x={layout.innerLeft - 6}
                y={layout.probPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                1
              </text>
              <text
                data-section="chart-line-bayesian-tick-label"
                data-panel="prob"
                x={layout.innerLeft - 6}
                y={layout.probPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                0
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-bayesian-panel-label"
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
            data-section="chart-line-bayesian-panel-label"
            data-panel="prob"
            x={layout.innerRight}
            y={layout.probPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Trend Posterior
          </text>

          {showMidline ? (
            <line
              data-section="chart-line-bayesian-midline"
              x1={layout.innerLeft}
              y1={layout.midlineY}
              x2={layout.innerRight}
              y2={layout.midlineY}
              stroke={midlineColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-bayesian-price-path"
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
            <g data-section="chart-line-bayesian-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-bayesian-dot"
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

          {!allProbHidden ? (
            <g data-section="chart-line-bayesian-prob-paths">
              {!pUpHidden ? (
                <path
                  data-section="chart-line-bayesian-p-up-line"
                  d={layout.pUpPath}
                  fill="none"
                  stroke={upColor}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label="P(up) line"
                />
              ) : null}
              {!pFlatHidden ? (
                <path
                  data-section="chart-line-bayesian-p-flat-line"
                  d={layout.pFlatPath}
                  fill="none"
                  stroke={flatColor}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label="P(flat) line"
                />
              ) : null}
              {!pDownHidden ? (
                <path
                  data-section="chart-line-bayesian-p-down-line"
                  d={layout.pDownPath}
                  fill="none"
                  stroke={downColor}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label="P(down) line"
                />
              ) : null}
            </g>
          ) : null}

          {!allProbHidden && showMarkers ? (
            <g data-section="chart-line-bayesian-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-bayesian-marker"
                  data-zone={marker.zone}
                  data-p-up={marker.pUp}
                  data-p-flat={marker.pFlat}
                  data-p-down={marker.pDown}
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
                  aria-label={`Bar ${formatX(marker.x)}, ${zoneLabelOf(
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
            <g data-section="chart-line-bayesian-badge">
              <rect
                data-section="chart-line-bayesian-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={88}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-bayesian-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`BAYES ${run.window}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-bayesian-legend"
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
                data-section="chart-line-bayesian-legend-item"
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
                  data-section="chart-line-bayesian-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-bayesian-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-bayesian-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / flat ${run.flatCount} / down ${run.downCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineBayesian.displayName = 'ChartLineBayesian';
