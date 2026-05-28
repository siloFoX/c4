import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TWIGGS_WIDTH = 560;
export const DEFAULT_CHART_LINE_TWIGGS_HEIGHT = 360;
export const DEFAULT_CHART_LINE_TWIGGS_PADDING = 40;
export const DEFAULT_CHART_LINE_TWIGGS_GAP = 12;
export const DEFAULT_CHART_LINE_TWIGGS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TWIGGS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TWIGGS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TWIGGS_PERIOD = 21;
export const DEFAULT_CHART_LINE_TWIGGS_THRESHOLD = 0.1;
export const DEFAULT_CHART_LINE_TWIGGS_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_TWIGGS_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TWIGGS_TWIGGS_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_TWIGGS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TWIGGS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TWIGGS_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TWIGGS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TWIGGS_AXIS_COLOR = '#cbd5e1';

export type ChartLineTwiggsZone = 'bullish' | 'bearish' | 'neutral' | 'none';

export interface ChartLineTwiggsPoint {
  x: number;
  value: number;
  high: number;
  low: number;
  volume: number;
}

export interface ChartLineTwiggsSample {
  index: number;
  x: number;
  value: number;
  high: number;
  low: number;
  volume: number;
  clv: number;
  tmf: number | null;
  zone: ChartLineTwiggsZone;
}

export interface ChartLineTwiggsRun {
  series: ChartLineTwiggsPoint[];
  period: number;
  threshold: number;
  clv: number[];
  tmf: (number | null)[];
  samples: ChartLineTwiggsSample[];
  twiggsFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineTwiggsPriceDot {
  index: number;
  x: number;
  value: number;
  clv: number;
  tmf: number | null;
  zone: ChartLineTwiggsZone;
  px: number;
  py: number;
}

export interface ChartLineTwiggsMarker {
  index: number;
  x: number;
  tmf: number;
  zone: ChartLineTwiggsZone;
  px: number;
  py: number;
}

export interface ChartLineTwiggsPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineTwiggsLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineTwiggsPanel;
  twiggsPanel: ChartLineTwiggsPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  twiggsYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineTwiggsPriceDot[];
  tmfPath: string;
  tmfMarkers: ChartLineTwiggsMarker[];
  zeroY: number;
  upperY: number;
  lowerY: number;
  period: number;
  threshold: number;
  twiggsFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineTwiggsLayoutOptions {
  data: readonly ChartLineTwiggsPoint[];
  period?: number;
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineTwiggsProps {
  data: readonly ChartLineTwiggsPoint[];
  period?: number;
  threshold?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  twiggsColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTwiggs?: boolean;
  showLevels?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineTwiggsPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineTwiggsFinitePoints(
  points: readonly ChartLineTwiggsPoint[] | null | undefined,
): ChartLineTwiggsPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTwiggsPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.value) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.volume) &&
      p.volume >= 0,
  );
}

/**
 * Coerce a Twiggs Money Flow period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineTwiggsPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The close location value of each bar -- where the close sits
 * within the true range, in [-1, 1]:
 *
 *   clv = ((close - trl) - (trh - close)) / (trh - trl)
 *
 * where the true range extends the bar's high and low to take in
 * the prior close (`trh = max(high, prevClose)`,
 * `trl = min(low, prevClose)`). A zero-width range reads 0.
 */
export function computeLineTwiggsClv(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
): number[] {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return [];
  }
  const n = closes.length;
  const out: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (!isFiniteNumber(h) || !isFiniteNumber(l) || !isFiniteNumber(c)) {
      out[i] = 0;
      continue;
    }
    let trh = h;
    let trl = l;
    const prev = closes[i - 1];
    if (i > 0 && isFiniteNumber(prev)) {
      trh = Math.max(h, prev);
      trl = Math.min(l, prev);
    }
    const range = trh - trl;
    out[i] = range > 0 ? (2 * c - trh - trl) / range : 0;
  }
  return out;
}

/**
 * The `period`-bar simple moving average of a (nullable) series.
 * A window containing a non-finite value is null.
 */
export function computeLineTwiggsSma(
  values: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineTwiggsPeriod(period, DEFAULT_CHART_LINE_TWIGGS_PERIOD);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = values[i - k];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sum += v;
    }
    out[i] = valid ? sum / p : null;
  }
  return out;
}

/**
 * The Twiggs Money Flow -- each bar's volume weighted by its
 * close location value, smoothed with a moving average and
 * divided by the smoothed raw volume:
 *
 *   TMF[i] = SMA(clv * volume, period)[i] / SMA(volume, period)[i]
 *
 * A window of zero volume is null.
 */
export function computeLineTwiggs(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes) ||
    !Array.isArray(volumes)
  ) {
    return [];
  }
  const clv = computeLineTwiggsClv(highs, lows, closes);
  const adVolume: (number | null)[] = clv.map((c, i) => {
    const v = volumes[i];
    return isFiniteNumber(v) ? c * v : null;
  });
  const volumeSeries: (number | null)[] = volumes.map((v) =>
    isFiniteNumber(v) ? v : null,
  );
  const smAdVolume = computeLineTwiggsSma(adVolume, period);
  const smVolume = computeLineTwiggsSma(volumeSeries, period);
  return smAdVolume.map((sa, i) => {
    const sv = smVolume[i];
    if (!isFiniteNumber(sa) || !isFiniteNumber(sv) || sv === 0) return null;
    return sa / sv;
  });
}

function classifyZone(
  tmf: number | null,
  threshold: number,
): ChartLineTwiggsZone {
  if (tmf === null) return 'none';
  if (tmf > threshold) return 'bullish';
  if (tmf < -threshold) return 'bearish';
  return 'neutral';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLineTwiggs(
  points: readonly ChartLineTwiggsPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): ChartLineTwiggsRun {
  const finite = getLineTwiggsFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineTwiggsPeriod(
    options?.period ?? DEFAULT_CHART_LINE_TWIGGS_PERIOD,
    DEFAULT_CHART_LINE_TWIGGS_PERIOD,
  );
  const threshold =
    isFiniteNumber(options?.threshold) && (options?.threshold ?? 0) > 0
      ? (options?.threshold as number)
      : DEFAULT_CHART_LINE_TWIGGS_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      threshold,
      clv: [],
      tmf: [],
      samples: [],
      twiggsFinal: NaN,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.value);
  const volumes = series.map((p) => p.volume);
  const clv = computeLineTwiggsClv(highs, lows, closes);
  const tmf = computeLineTwiggs(highs, lows, closes, volumes, period);

  const samples: ChartLineTwiggsSample[] = series.map((p, i) => {
    const t = tmf[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      high: p.high,
      low: p.low,
      volume: p.volume,
      clv: clv[i] ?? 0,
      tmf: t,
      zone: classifyZone(t, threshold),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let twiggsFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.tmf !== null) twiggsFinal = s.tmf;
  }

  return {
    series = [],
    period,
    threshold,
    clv,
    tmf,
    samples,
    twiggsFinal,
    bullishCount,
    bearishCount,
    neutralCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineTwiggsLayout(
  options: ComputeLineTwiggsLayoutOptions,
): ChartLineTwiggsLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_TWIGGS_GAP,
    tickCount = DEFAULT_CHART_LINE_TWIGGS_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_TWIGGS_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineTwiggs(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.threshold)
      ? { threshold: options.threshold }
      : {}),
  });

  const emptyPanel: ChartLineTwiggsPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineTwiggsLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    twiggsPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    twiggsYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    tmfPath: '',
    tmfMarkers: [],
    zeroY: 0,
    upperY: 0,
    lowerY: 0,
    period: run.period,
    threshold: run.threshold,
    twiggsFinal: NaN,
    bullishCount: 0,
    bearishCount: 0,
    neutralCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const twiggsHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineTwiggsPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const twiggsPanel: ChartLineTwiggsPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: twiggsHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectTwiggsY = (v: number): number =>
    twiggsPanel.y + twiggsPanel.height - ((v + 1) / 2) * twiggsPanel.height;

  const priceDots: ChartLineTwiggsPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    clv: s.clv,
    tmf: s.tmf,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const tmfPts: { px: number; py: number }[] = [];
  const tmfMarkers: ChartLineTwiggsMarker[] = [];
  for (const s of run.samples) {
    if (s.tmf === null) continue;
    const px = projectX(s.x);
    const py = projectTwiggsY(s.tmf);
    tmfPts.push({ px, py });
    tmfMarkers.push({
      index: s.index,
      x: s.x,
      tmf: s.tmf,
      zone: s.zone,
      px,
      py,
    });
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    twiggsPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    twiggsYTicks: computeTicks(-1, 1, tickCount).map((v) => ({
      value: v,
      py: projectTwiggsY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    tmfPath: buildPath(tmfPts),
    tmfMarkers,
    zeroY: projectTwiggsY(0),
    upperY: projectTwiggsY(run.threshold),
    lowerY: projectTwiggsY(-run.threshold),
    period: run.period,
    threshold: run.threshold,
    twiggsFinal: run.twiggsFinal,
    bullishCount: run.bullishCount,
    bearishCount: run.bearishCount,
    neutralCount: run.neutralCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineTwiggsChart(
  data: readonly ChartLineTwiggsPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): string {
  const run = runLineTwiggs(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Twiggs Money Flow (period ${run.period}): the top panel plots the price; the bottom panel plots the TMF. The TMF weights each bar's volume by its close location value -- where the close sits within the true range -- then smooths the weighted volume and the raw volume with a moving average and takes their ratio. A positive TMF signals accumulation (buying pressure), a negative TMF distribution (selling). The TMF is bullish on ${run.bullishCount} bars, bearish on ${run.bearishCount} and neutral on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const TWIGGS_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineTwiggs = forwardRef<
  HTMLDivElement,
  ChartLineTwiggsProps
>(function ChartLineTwiggs(
  props: ChartLineTwiggsProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    threshold,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_TWIGGS_WIDTH,
    height = DEFAULT_CHART_LINE_TWIGGS_HEIGHT,
    padding = DEFAULT_CHART_LINE_TWIGGS_PADDING,
    gap = DEFAULT_CHART_LINE_TWIGGS_GAP,
    tickCount = DEFAULT_CHART_LINE_TWIGGS_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_TWIGGS_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_TWIGGS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TWIGGS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TWIGGS_PRICE_COLOR,
    twiggsColor = DEFAULT_CHART_LINE_TWIGGS_TWIGGS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TWIGGS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TWIGGS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TWIGGS_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_TWIGGS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_TWIGGS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTwiggs = true,
    showLevels = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with a Twiggs Money Flow',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    onPointClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlled = controlledHidden !== undefined;
  const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
    normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlled
    ? normaliseHidden(controlledHidden)
    : uncontrolled;

  const layout = useMemo(
    () =>
      computeLineTwiggsLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(threshold) ? { threshold } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      tickCount,
      pricePanelRatio,
      period,
      threshold,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineTwiggsChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(threshold) ? { threshold } : {}),
      }),
    [ariaDescription, data, period, threshold],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverIndex(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (seriesId: string) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(seriesId);
      if (willHide) next.add(seriesId);
      else next.delete(seriesId);
      if (!isControlled) setUncontrolled(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ seriesId, hidden: willHide });
    },
    [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
  );

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (!layout.ok) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-twiggs"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-twiggs-aria-desc"
          style={TWIGGS_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const tp = layout.twiggsPanel;
  const priceVisible = !hiddenSet.has('price');
  const twiggsVisible = showTwiggs && !hiddenSet.has('twiggs');
  const levelsVisible = showLevels && !hiddenSet.has('levels');

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const zoneColor = (zone: ChartLineTwiggsZone): string => {
    if (zone === 'bullish') return bullishColor;
    if (zone === 'bearish') return bearishColor;
    return twiggsColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'twiggs', label: 'TMF', color: twiggsColor },
    { id: 'levels', label: 'Levels', color: zeroColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={
        [className, animateClass].filter(Boolean).join(' ') || undefined
      }
      style={containerStyle}
      data-section="chart-line-twiggs"
      data-empty="false"
      data-period={layout.period}
      data-threshold={layout.threshold}
      data-twiggs-final={layout.twiggsFinal}
      data-bullish-count={layout.bullishCount}
      data-bearish-count={layout.bearishCount}
      data-neutral-count={layout.neutralCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-twiggs-aria-desc"
        style={TWIGGS_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-twiggs-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-twiggs-badge"
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-twiggs-badge-icon"
              aria-hidden="true"
              style={{ color: twiggsColor }}
            >
              TMF
            </span>
            <span data-section="chart-line-twiggs-badge-config">
              {layout.period}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-twiggs-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-twiggs-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-twiggs-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.twiggsYTicks.map((t, i) => (
                <line
                  key={`gt-${i}`}
                  data-section="chart-line-twiggs-grid-line"
                  data-panel="twiggs"
                  x1={tp.x}
                  x2={tp.x + tp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-twiggs-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-twiggs-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-twiggs-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-twiggs-axis"
                data-panel="twiggs"
                data-axis="y"
                x1={tp.x}
                y1={tp.y}
                x2={tp.x}
                y2={tp.y + tp.height}
              />
              <line
                data-section="chart-line-twiggs-axis"
                data-panel="twiggs"
                data-axis="x"
                x1={tp.x}
                y1={tp.y + tp.height}
                x2={tp.x + tp.width}
                y2={tp.y + tp.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-twiggs-tick-label"
                  data-panel="price"
                  data-axis="y"
                  x={pp.x - 6}
                  y={t.py + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatValue(t.value)}
                </text>
              ))}
              {layout.twiggsYTicks.map((t, i) => (
                <text
                  key={`tyt-${i}`}
                  data-section="chart-line-twiggs-tick-label"
                  data-panel="twiggs"
                  data-axis="y"
                  x={tp.x - 6}
                  y={t.py + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatValue(t.value)}
                </text>
              ))}
              {layout.xTicks.map((t, i) => (
                <text
                  key={`xt-${i}`}
                  data-section="chart-line-twiggs-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={tp.y + tp.height + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatX(t.value)}
                </text>
              ))}
            </g>
          ) : null}

          <text
            data-section="chart-line-twiggs-panel-label"
            data-panel="price"
            x={pp.x + 2}
            y={pp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Price
          </text>
          <text
            data-section="chart-line-twiggs-panel-label"
            data-panel="twiggs"
            x={tp.x + 2}
            y={tp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            TMF
          </text>

          {levelsVisible ? (
            <g data-section="chart-line-twiggs-levels">
              <line
                data-section="chart-line-twiggs-level-line"
                data-level="upper"
                x1={tp.x}
                x2={tp.x + tp.width}
                y1={layout.upperY}
                y2={layout.upperY}
                stroke={bullishColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-twiggs-level-line"
                data-level="zero"
                x1={tp.x}
                x2={tp.x + tp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-twiggs-level-line"
                data-level="lower"
                x1={tp.x}
                x2={tp.x + tp.width}
                y1={layout.lowerY}
                y2={layout.lowerY}
                stroke={bearishColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-twiggs-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-twiggs-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-twiggs-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={priceColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}

          {twiggsVisible && layout.tmfPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Twiggs Money Flow line"
              data-section="chart-line-twiggs-tmf-line"
              d={layout.tmfPath}
              fill="none"
              stroke={twiggsColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {twiggsVisible ? (
            <g data-section="chart-line-twiggs-markers">
              {layout.tmfMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`TMF at x ${formatX(m.x)}: ${formatValue(m.tmf)}, ${m.zone}`}
                    data-section="chart-line-twiggs-marker"
                    data-point-index={m.index}
                    data-tmf={m.tmf}
                    data-zone={m.zone}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={zoneColor(m.zone)}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => {
                      const d = layout.priceDots.find(
                        (x) => x.index === m.index,
                      );
                      if (d) onPointClick?.({ point: d });
                    }}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.priceDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-twiggs-tooltip"
                  data-point-index={d.index}
                  style={{
                    position: 'absolute',
                    left: tooltipPos.px + 8,
                    top: tooltipPos.py + 8,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    pointerEvents: 'none',
                    minWidth: 140,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div data-section="chart-line-twiggs-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-twiggs-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-twiggs-tooltip-clv">
                    clv: {formatValue(d.clv)}
                  </div>
                  <div data-section="chart-line-twiggs-tooltip-tmf">
                    tmf: {fmtNullable(d.tmf)}
                  </div>
                  <div data-section="chart-line-twiggs-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-twiggs-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {legendItems.map((item) => {
            const isHidden = hiddenSet.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-twiggs-legend-item"
                data-series-id={item.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  opacity: isHidden ? 0.5 : 1,
                }}
              >
                <span
                  data-section="chart-line-twiggs-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-twiggs-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-twiggs-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.bullishCount} bullish, {layout.bearishCount} bearish
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTwiggs.displayName = 'ChartLineTwiggs';
