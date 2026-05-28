import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PZO_WIDTH = 560;
export const DEFAULT_CHART_LINE_PZO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_PZO_PADDING = 40;
export const DEFAULT_CHART_LINE_PZO_GAP = 12;
export const DEFAULT_CHART_LINE_PZO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PZO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PZO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PZO_PERIOD = 14;
export const DEFAULT_CHART_LINE_PZO_THRESHOLD = 40;
export const DEFAULT_CHART_LINE_PZO_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_PZO_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PZO_PZO_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_PZO_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PZO_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PZO_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PZO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PZO_AXIS_COLOR = '#cbd5e1';

export type ChartLinePzoZone = 'bullish' | 'bearish' | 'neutral' | 'none';

export interface ChartLinePzoPoint {
  x: number;
  value: number;
}

export interface ChartLinePzoSample {
  index: number;
  x: number;
  value: number;
  signedChange: number | null;
  totalChange: number | null;
  pzo: number | null;
  zone: ChartLinePzoZone;
}

export interface ChartLinePzoRun {
  series: ChartLinePzoPoint[];
  period: number;
  threshold: number;
  signedChange: (number | null)[];
  totalChange: (number | null)[];
  pzo: (number | null)[];
  samples: ChartLinePzoSample[];
  pzoFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLinePzoPriceDot {
  index: number;
  x: number;
  value: number;
  signedChange: number | null;
  pzo: number | null;
  zone: ChartLinePzoZone;
  px: number;
  py: number;
}

export interface ChartLinePzoMarker {
  index: number;
  x: number;
  pzo: number;
  signedChange: number | null;
  zone: ChartLinePzoZone;
  px: number;
  py: number;
}

export interface ChartLinePzoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLinePzoLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLinePzoPanel;
  pzoPanel: ChartLinePzoPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  pzoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLinePzoPriceDot[];
  pzoPath: string;
  pzoMarkers: ChartLinePzoMarker[];
  zeroY: number;
  upperY: number;
  lowerY: number;
  period: number;
  threshold: number;
  pzoFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLinePzoLayoutOptions {
  data: readonly ChartLinePzoPoint[];
  period?: number;
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLinePzoProps {
  data: readonly ChartLinePzoPoint[];
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
  pzoColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPzo?: boolean;
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
  onPointClick?: (payload: { point: ChartLinePzoPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLinePzoFinitePoints(
  points: readonly ChartLinePzoPoint[] | null | undefined,
): ChartLinePzoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLinePzoPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Price Zone Oscillator period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a fractional
 * value floors.
 */
export function normalizeLinePzoPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The signed price change over a `period`-bar window -- the sum
 * of the signed bar-to-bar changes, which telescopes to the net
 * move `close[i] - close[i-period]`. Bars before the window is
 * full are null.
 */
export function computeLinePzoSignedChange(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLinePzoPeriod(period, DEFAULT_CHART_LINE_PZO_PERIOD);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const cur = closes[i - k];
      const prev = closes[i - k - 1];
      if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) {
        valid = false;
        break;
      }
      sum += cur - prev;
    }
    out[i] = valid ? sum : null;
  }
  return out;
}

/**
 * The total price change over a `period`-bar window -- the sum of
 * the absolute bar-to-bar changes. Bars before the window is full
 * are null.
 */
export function computeLinePzoTotalChange(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLinePzoPeriod(period, DEFAULT_CHART_LINE_PZO_PERIOD);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const cur = closes[i - k];
      const prev = closes[i - k - 1];
      if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) {
        valid = false;
        break;
      }
      sum += Math.abs(cur - prev);
    }
    out[i] = valid ? sum : null;
  }
  return out;
}

/**
 * The Price Zone Oscillator -- the ratio of the signed price
 * change to the total price change, scaled to -100..+100:
 *
 *   PZO[i] = 100 * signedChange[i] / totalChange[i]
 *
 * A clean up-trend reads +100, a clean down-trend -100, a choppy
 * range near zero. A window with no movement reads 0.
 */
export function computeLinePzo(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const signed = computeLinePzoSignedChange(closes, period);
  const total = computeLinePzoTotalChange(closes, period);
  return signed.map((s, i) => {
    const t = total[i];
    if (s === null || !isFiniteNumber(t)) return null;
    return t > 0 ? (100 * s) / t : 0;
  });
}

function classifyZone(
  pzo: number | null,
  threshold: number,
): ChartLinePzoZone {
  if (pzo === null) return 'none';
  if (pzo > threshold) return 'bullish';
  if (pzo < -threshold) return 'bearish';
  return 'neutral';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLinePzo(
  points: readonly ChartLinePzoPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): ChartLinePzoRun {
  const finite = getLinePzoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLinePzoPeriod(
    options?.period ?? DEFAULT_CHART_LINE_PZO_PERIOD,
    DEFAULT_CHART_LINE_PZO_PERIOD,
  );
  const threshold =
    isFiniteNumber(options?.threshold) &&
    (options?.threshold ?? 0) > 0 &&
    (options?.threshold ?? 0) < 100
      ? (options?.threshold as number)
      : DEFAULT_CHART_LINE_PZO_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      threshold,
      signedChange: [],
      totalChange: [],
      pzo: [],
      samples: [],
      pzoFinal: NaN,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const signedChange = computeLinePzoSignedChange(closes, period);
  const totalChange = computeLinePzoTotalChange(closes, period);
  const pzo = signedChange.map((s, i) => {
    const t = totalChange[i];
    if (s === null || !isFiniteNumber(t)) return null;
    return t > 0 ? (100 * s) / t : 0;
  });

  const samples: ChartLinePzoSample[] = series.map((p, i) => {
    const v = pzo[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      signedChange: signedChange[i] ?? null,
      totalChange: totalChange[i] ?? null,
      pzo: v,
      zone: classifyZone(v, threshold),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let pzoFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.pzo !== null) pzoFinal = s.pzo;
  }

  return {
    series = [],
    period,
    threshold,
    signedChange,
    totalChange,
    pzo,
    samples,
    pzoFinal,
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

export function computeLinePzoLayout(
  options: ComputeLinePzoLayoutOptions,
): ChartLinePzoLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_PZO_GAP,
    tickCount = DEFAULT_CHART_LINE_PZO_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_PZO_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLinePzo(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.threshold)
      ? { threshold: options.threshold }
      : {}),
  });

  const emptyPanel: ChartLinePzoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLinePzoLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    pzoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    pzoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    pzoPath: '',
    pzoMarkers: [],
    zeroY: 0,
    upperY: 0,
    lowerY: 0,
    period: run.period,
    threshold: run.threshold,
    pzoFinal: NaN,
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
  const pzoHeight = usableHeight - priceHeight;

  const pricePanel: ChartLinePzoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const pzoPanel: ChartLinePzoPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: pzoHeight,
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
  const projectPzoY = (v: number): number =>
    pzoPanel.y + pzoPanel.height - ((v + 100) / 200) * pzoPanel.height;

  const priceDots: ChartLinePzoPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    signedChange: s.signedChange,
    pzo: s.pzo,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const pzoPts: { px: number; py: number }[] = [];
  const pzoMarkers: ChartLinePzoMarker[] = [];
  for (const s of run.samples) {
    if (s.pzo === null) continue;
    const px = projectX(s.x);
    const py = projectPzoY(s.pzo);
    pzoPts.push({ px, py });
    pzoMarkers.push({
      index: s.index,
      x: s.x,
      pzo: s.pzo,
      signedChange: s.signedChange,
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
    pzoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    pzoYTicks: computeTicks(-100, 100, tickCount).map((v) => ({
      value: v,
      py: projectPzoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    pzoPath: buildPath(pzoPts),
    pzoMarkers,
    zeroY: projectPzoY(0),
    upperY: projectPzoY(run.threshold),
    lowerY: projectPzoY(-run.threshold),
    period: run.period,
    threshold: run.threshold,
    pzoFinal: run.pzoFinal,
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

export function describeLinePzoChart(
  data: readonly ChartLinePzoPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): string {
  const run = runLinePzo(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Price Zone Oscillator (period ${run.period}): the top panel plots the price; the bottom panel plots the PZO. The PZO is the ratio of the signed price change to the total price change over the lookback, scaled to -100..+100: the signed change is the net move -- the sum of the up and down steps -- and the total change is the sum of their magnitudes. A clean up-trend reads +100, a clean down-trend -100, and a choppy range near zero. Readings above +${run.threshold} are bullish and below -${run.threshold} bearish. The PZO is bullish on ${run.bullishCount} bars, bearish on ${run.bearishCount} and neutral on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const PZO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLinePzo = forwardRef<HTMLDivElement, ChartLinePzoProps>(
  function ChartLinePzo(
    props: ChartLinePzoProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      threshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_PZO_WIDTH,
      height = DEFAULT_CHART_LINE_PZO_HEIGHT,
      padding = DEFAULT_CHART_LINE_PZO_PADDING,
      gap = DEFAULT_CHART_LINE_PZO_GAP,
      tickCount = DEFAULT_CHART_LINE_PZO_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_PZO_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_PZO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_PZO_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_PZO_PRICE_COLOR,
      pzoColor = DEFAULT_CHART_LINE_PZO_PZO_COLOR,
      bullishColor = DEFAULT_CHART_LINE_PZO_BULLISH_COLOR,
      bearishColor = DEFAULT_CHART_LINE_PZO_BEARISH_COLOR,
      zeroColor = DEFAULT_CHART_LINE_PZO_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_PZO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_PZO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showPzo = true,
      showLevels = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Price Zone Oscillator',
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
        computeLinePzoLayout({
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
        describeLinePzoChart(data, {
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
          data-section="chart-line-pzo"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-pzo-aria-desc"
            style={PZO_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const op = layout.pzoPanel;
    const priceVisible = !hiddenSet.has('price');
    const pzoVisible = showPzo && !hiddenSet.has('pzo');
    const levelsVisible = showLevels && !hiddenSet.has('levels');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLinePzoZone): string => {
      if (zone === 'bullish') return bullishColor;
      if (zone === 'bearish') return bearishColor;
      return pzoColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'pzo', label: 'PZO', color: pzoColor },
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
        data-section="chart-line-pzo"
        data-empty="false"
        data-period={layout.period}
        data-threshold={layout.threshold}
        data-pzo-final={layout.pzoFinal}
        data-bullish-count={layout.bullishCount}
        data-bearish-count={layout.bearishCount}
        data-neutral-count={layout.neutralCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-pzo-aria-desc"
          style={PZO_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-pzo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-pzo-badge"
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
                data-section="chart-line-pzo-badge-icon"
                aria-hidden="true"
                style={{ color: pzoColor }}
              >
                PZO
              </span>
              <span data-section="chart-line-pzo-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-pzo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-pzo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-pzo-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.pzoYTicks.map((t, i) => (
                  <line
                    key={`go-${i}`}
                    data-section="chart-line-pzo-grid-line"
                    data-panel="pzo"
                    x1={op.x}
                    x2={op.x + op.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-pzo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-pzo-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pzo-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pzo-axis"
                  data-panel="pzo"
                  data-axis="y"
                  x1={op.x}
                  y1={op.y}
                  x2={op.x}
                  y2={op.y + op.height}
                />
                <line
                  data-section="chart-line-pzo-axis"
                  data-panel="pzo"
                  data-axis="x"
                  x1={op.x}
                  y1={op.y + op.height}
                  x2={op.x + op.width}
                  y2={op.y + op.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-pzo-tick-label"
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
                {layout.pzoYTicks.map((t, i) => (
                  <text
                    key={`oyt-${i}`}
                    data-section="chart-line-pzo-tick-label"
                    data-panel="pzo"
                    data-axis="y"
                    x={op.x - 6}
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
                    data-section="chart-line-pzo-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={op.y + op.height + 14}
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
              data-section="chart-line-pzo-panel-label"
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
              data-section="chart-line-pzo-panel-label"
              data-panel="pzo"
              x={op.x + 2}
              y={op.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              PZO
            </text>

            {levelsVisible ? (
              <g data-section="chart-line-pzo-levels">
                <line
                  data-section="chart-line-pzo-level-line"
                  data-level="upper"
                  x1={op.x}
                  x2={op.x + op.width}
                  y1={layout.upperY}
                  y2={layout.upperY}
                  stroke={bullishColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-pzo-level-line"
                  data-level="zero"
                  x1={op.x}
                  x2={op.x + op.width}
                  y1={layout.zeroY}
                  y2={layout.zeroY}
                  stroke={zeroColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-pzo-level-line"
                  data-level="lower"
                  x1={op.x}
                  x2={op.x + op.width}
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
                data-section="chart-line-pzo-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-pzo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-pzo-dot"
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

            {pzoVisible && layout.pzoPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price Zone Oscillator line"
                data-section="chart-line-pzo-pzo-line"
                d={layout.pzoPath}
                fill="none"
                stroke={pzoColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {pzoVisible ? (
              <g data-section="chart-line-pzo-markers">
                {layout.pzoMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`PZO at x ${formatX(m.x)}: ${formatValue(m.pzo)}, ${m.zone}`}
                      data-section="chart-line-pzo-marker"
                      data-point-index={m.index}
                      data-pzo={m.pzo}
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
                    data-section="chart-line-pzo-tooltip"
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
                      minWidth: 150,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-pzo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-pzo-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-pzo-tooltip-signed">
                      signed: {fmtNullable(d.signedChange)}
                    </div>
                    <div data-section="chart-line-pzo-tooltip-pzo">
                      pzo: {fmtNullable(d.pzo)}
                    </div>
                    <div data-section="chart-line-pzo-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-pzo-legend"
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
                  data-section="chart-line-pzo-legend-item"
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
                    data-section="chart-line-pzo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-pzo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-pzo-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.bullishCount} bullish, {layout.bearishCount} bearish
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLinePzo.displayName = 'ChartLinePzo';
