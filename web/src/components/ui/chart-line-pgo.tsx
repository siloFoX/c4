import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PGO_WIDTH = 560;
export const DEFAULT_CHART_LINE_PGO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_PGO_PADDING = 40;
export const DEFAULT_CHART_LINE_PGO_GAP = 12;
export const DEFAULT_CHART_LINE_PGO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PGO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PGO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PGO_PERIOD = 14;
export const DEFAULT_CHART_LINE_PGO_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_PGO_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PGO_PGO_COLOR = '#db2777';
export const DEFAULT_CHART_LINE_PGO_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PGO_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PGO_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PGO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PGO_AXIS_COLOR = '#cbd5e1';

export type ChartLinePgoSign = 'positive' | 'negative' | 'zero';

export interface ChartLinePgoPoint {
  x: number;
  value: number;
  high: number;
  low: number;
}

export interface ChartLinePgoSample {
  index: number;
  x: number;
  value: number;
  high: number;
  low: number;
  pgo: number | null;
  sign: ChartLinePgoSign;
}

export interface ChartLinePgoRun {
  series: ChartLinePgoPoint[];
  period: number;
  pgo: (number | null)[];
  samples: ChartLinePgoSample[];
  pgoFinal: number;
  pgoMin: number;
  pgoMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLinePgoPriceDot {
  index: number;
  x: number;
  value: number;
  high: number;
  low: number;
  pgo: number | null;
  sign: ChartLinePgoSign;
  px: number;
  py: number;
}

export interface ChartLinePgoMarker {
  index: number;
  x: number;
  pgo: number;
  sign: ChartLinePgoSign;
  px: number;
  py: number;
}

export interface ChartLinePgoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLinePgoLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLinePgoPanel;
  pgoPanel: ChartLinePgoPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  pgoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pgoYMin: number;
  pgoYMax: number;
  pricePath: string;
  priceDots: ChartLinePgoPriceDot[];
  pgoPath: string;
  pgoMarkers: ChartLinePgoMarker[];
  zeroY: number;
  period: number;
  pgoFinal: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLinePgoLayoutOptions {
  data: readonly ChartLinePgoPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLinePgoProps {
  data: readonly ChartLinePgoPoint[];
  period?: number;
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
  pgoColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPgo?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLinePgoPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLinePgoFinitePoints(
  points: readonly ChartLinePgoPoint[] | null | undefined,
): ChartLinePgoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLinePgoPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.value) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low),
  );
}

/**
 * Coerce the Pretty Good Oscillator period to an integer of at
 * least 2. A non-finite or sub-2 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLinePgoPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

function simpleMovingAverage(
  values: readonly number[],
  period: number,
): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period) return out;
  for (let i = period - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < period; k += 1) {
      const v = values[i - k];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sum += v;
    }
    out[i] = valid ? sum / period : null;
  }
  return out;
}

/**
 * The per-bar true range. The first bar has no prior close so its
 * true range is simply `high - low`; every later bar is the widest
 * of the bar range and the two gaps from the prior close:
 *
 *   TR[i] = max(high[i] - low[i],
 *               abs(high[i] - close[i-1]),
 *               abs(low[i] - close[i-1]))
 */
export function computeLinePgoTrueRange(
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
  const n = highs.length;
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const h = highs[i];
    const l = lows[i];
    if (!isFiniteNumber(h) || !isFiniteNumber(l)) {
      out[i] = 0;
      continue;
    }
    const hl = h - l;
    const pc = i > 0 ? closes[i - 1] : undefined;
    if (i === 0 || !isFiniteNumber(pc)) {
      out[i] = hl;
      continue;
    }
    out[i] = Math.max(hl, Math.abs(h - pc), Math.abs(l - pc));
  }
  return out;
}

/**
 * The Average True Range -- the `period`-bar simple moving average
 * of the true range. Null through the warm-up.
 */
export function computeLinePgoAtr(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  const tr = computeLinePgoTrueRange(highs, lows, closes);
  if (tr.length === 0) return [];
  const p = normalizeLinePgoPeriod(period, DEFAULT_CHART_LINE_PGO_PERIOD);
  return simpleMovingAverage(tr, p);
}

/**
 * The Pretty Good Oscillator (Mark Johnson). The PGO is the
 * distance of the close from its `period`-bar moving average,
 * normalized by the average true range:
 *
 *   PGO[i] = (close[i] - SMA(close, period)) / ATR(period)
 *
 * so it reads the price displacement in ATR units. A positive PGO
 * marks the close above its moving average, a negative PGO below.
 * A window whose ATR is zero (a perfectly flat market) has an
 * undefined PGO and is null, as are bars before the window is
 * full.
 */
export function computeLinePgo(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return [];
  }
  const p = normalizeLinePgoPeriod(period, DEFAULT_CHART_LINE_PGO_PERIOD);
  const tr = computeLinePgoTrueRange(highs, lows, closes);
  const atr = simpleMovingAverage(tr, p);
  const smaClose = simpleMovingAverage(closes, p);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const a = atr[i];
    const s = smaClose[i];
    const c = closes[i];
    if (
      isFiniteNumber(a) &&
      a !== 0 &&
      isFiniteNumber(s) &&
      isFiniteNumber(c)
    ) {
      out[i] = (c - s) / a;
    }
  }
  return out;
}

function classifySign(v: number | null): ChartLinePgoSign {
  if (v === null || v === 0) return 'zero';
  return v > 0 ? 'positive' : 'negative';
}

export function runLinePgo(
  points: readonly ChartLinePgoPoint[] | null | undefined,
  options?: { period?: number },
): ChartLinePgoRun {
  const finite = getLinePgoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLinePgoPeriod(
    options?.period ?? DEFAULT_CHART_LINE_PGO_PERIOD,
    DEFAULT_CHART_LINE_PGO_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      pgo: [],
      samples: [],
      pgoFinal: NaN,
      pgoMin: NaN,
      pgoMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.value);
  const pgo = computeLinePgo(highs, lows, closes, period);

  const samples: ChartLinePgoSample[] = series.map((p, i) => {
    const v = pgo[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      high: p.high,
      low: p.low,
      pgo: v,
      sign: classifySign(v),
    };
  });

  let positiveCount = 0;
  let negativeCount = 0;
  let pMin = Number.POSITIVE_INFINITY;
  let pMax = Number.NEGATIVE_INFINITY;
  let pFinal = NaN;
  for (const s of samples) {
    if (s.sign === 'positive') positiveCount += 1;
    else if (s.sign === 'negative') negativeCount += 1;
    if (s.pgo !== null) {
      if (s.pgo < pMin) pMin = s.pgo;
      if (s.pgo > pMax) pMax = s.pgo;
      pFinal = s.pgo;
    }
  }

  return {
    series = [],
    period,
    pgo,
    samples,
    pgoFinal: pFinal,
    pgoMin: isFiniteNumber(pMin) ? pMin : NaN,
    pgoMax: isFiniteNumber(pMax) ? pMax : NaN,
    positiveCount,
    negativeCount,
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

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function computeLinePgoLayout(
  options: ComputeLinePgoLayoutOptions,
): ChartLinePgoLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_PGO_GAP,
    tickCount = DEFAULT_CHART_LINE_PGO_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_PGO_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLinePgo(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLinePgoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLinePgoLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    pgoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    pgoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pgoYMin: 0,
    pgoYMax: 0,
    pricePath: '',
    priceDots: [],
    pgoPath: '',
    pgoMarkers: [],
    zeroY: 0,
    period: run.period,
    pgoFinal: NaN,
    positiveCount: 0,
    negativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const pgoHeight = usableHeight - priceHeight;

  const pricePanel: ChartLinePgoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const pgoPanel: ChartLinePgoPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: pgoHeight,
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

  let bound = Math.max(Math.abs(run.pgoMin), Math.abs(run.pgoMax));
  if (!isFiniteNumber(bound) || bound <= 0) bound = 1;
  const pgoLo = -bound;
  const pgoHi = bound;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const pgoRange = pgoHi - pgoLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectPgoY = (v: number): number =>
    pgoPanel.y + pgoPanel.height - ((v - pgoLo) / pgoRange) * pgoPanel.height;

  const priceDots: ChartLinePgoPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    high: s.high,
    low: s.low,
    pgo: s.pgo,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const pgoMarkers: ChartLinePgoMarker[] = run.samples
    .filter((s) => s.pgo !== null)
    .map((s) => {
      const v = s.pgo!;
      return {
        index: s.index,
        x: s.x,
        pgo: v,
        sign: s.sign,
        px: projectX(s.x),
        py: projectPgoY(v),
      };
    });

  return {
    ok: true,
    width,
    height,
    pricePanel,
    pgoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    pgoYTicks: computeTicks(pgoLo, pgoHi, tickCount).map((v) => ({
      value: v,
      py: projectPgoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pgoYMin: pgoLo,
    pgoYMax: pgoHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    pgoPath: buildPath(pgoMarkers.map((m) => ({ px: m.px, py: m.py }))),
    pgoMarkers,
    zeroY: projectPgoY(0),
    period: run.period,
    pgoFinal: run.pgoFinal,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
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

export function describeLinePgoChart(
  data: readonly ChartLinePgoPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLinePgo(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Pretty Good Oscillator (period ${run.period}): the top panel plots the raw price; the bottom panel plots the PGO, a zero-centred oscillator. The PGO is the distance of the close from its ${run.period}-bar moving average, divided by the average true range, so it reads the price displacement in ATR units. A positive PGO marks the close above its moving average, a negative PGO below. The PGO reads positive on ${run.positiveCount} bars and negative on ${run.negativeCount} across ${run.samples.length} bars.`;
}

const PGO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLinePgo = forwardRef<HTMLDivElement, ChartLinePgoProps>(
  function ChartLinePgo(
    props: ChartLinePgoProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_PGO_WIDTH,
      height = DEFAULT_CHART_LINE_PGO_HEIGHT,
      padding = DEFAULT_CHART_LINE_PGO_PADDING,
      gap = DEFAULT_CHART_LINE_PGO_GAP,
      tickCount = DEFAULT_CHART_LINE_PGO_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_PGO_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_PGO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_PGO_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_PGO_PRICE_COLOR,
      pgoColor = DEFAULT_CHART_LINE_PGO_PGO_COLOR,
      positiveColor = DEFAULT_CHART_LINE_PGO_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_PGO_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_PGO_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_PGO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_PGO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showPgo = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Pretty Good Oscillator',
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
        computeLinePgoLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [data, width, height, padding, gap, tickCount, pricePanelRatio, period],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLinePgoChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [ariaDescription, data, period],
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
          data-section="chart-line-pgo"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-pgo-aria-desc"
            style={PGO_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const op = layout.pgoPanel;
    const priceVisible = !hiddenSet.has('price');
    const pgoVisible = showPgo && !hiddenSet.has('pgo');

    const signColor = (sign: ChartLinePgoSign): string =>
      sign === 'positive'
        ? positiveColor
        : sign === 'negative'
          ? negativeColor
          : zeroColor;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'pgo', label: 'PGO', color: pgoColor },
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
        data-section="chart-line-pgo"
        data-empty="false"
        data-period={layout.period}
        data-pgo-final={layout.pgoFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-pgo-aria-desc"
          style={PGO_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-pgo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-pgo-badge"
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
                data-section="chart-line-pgo-badge-icon"
                aria-hidden="true"
                style={{ color: pgoColor }}
              >
                PGO
              </span>
              <span data-section="chart-line-pgo-badge-period">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-pgo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-pgo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-pgo-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.pgoYTicks.map((t, i) => (
                  <line
                    key={`go-${i}`}
                    data-section="chart-line-pgo-grid-line"
                    data-panel="pgo"
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
                data-section="chart-line-pgo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-pgo-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pgo-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pgo-axis"
                  data-panel="pgo"
                  data-axis="y"
                  x1={op.x}
                  y1={op.y}
                  x2={op.x}
                  y2={op.y + op.height}
                />
                <line
                  data-section="chart-line-pgo-axis"
                  data-panel="pgo"
                  data-axis="x"
                  x1={op.x}
                  y1={op.y + op.height}
                  x2={op.x + op.width}
                  y2={op.y + op.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-pgo-tick-label"
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
                {layout.pgoYTicks.map((t, i) => (
                  <text
                    key={`oyt-${i}`}
                    data-section="chart-line-pgo-tick-label"
                    data-panel="pgo"
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
                    data-section="chart-line-pgo-tick-label"
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
              data-section="chart-line-pgo-panel-label"
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
              data-section="chart-line-pgo-panel-label"
              data-panel="pgo"
              x={op.x + 2}
              y={op.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              PGO
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-pgo-zero-line"
                x1={op.x}
                x2={op.x + op.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-pgo-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-pgo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.value)}`}
                      data-section="chart-line-pgo-dot"
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

            {pgoVisible && layout.pgoPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Pretty Good Oscillator line"
                data-section="chart-line-pgo-pgo-line"
                d={layout.pgoPath}
                fill="none"
                stroke={pgoColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {pgoVisible ? (
              <g data-section="chart-line-pgo-markers">
                {layout.pgoMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Pretty Good Oscillator at x ${formatX(m.x)}: ${formatValue(m.pgo)}, ${m.sign}`}
                      data-section="chart-line-pgo-marker"
                      data-point-index={m.index}
                      data-pgo={m.pgo}
                      data-sign={m.sign}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={signColor(m.sign)}
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
                    data-section="chart-line-pgo-tooltip"
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
                    <div data-section="chart-line-pgo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-pgo-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      close: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-pgo-tooltip-high">
                      high: {formatValue(d.high)}
                    </div>
                    <div data-section="chart-line-pgo-tooltip-low">
                      low: {formatValue(d.low)}
                    </div>
                    <div data-section="chart-line-pgo-tooltip-pgo">
                      pgo: {fmtNullable(d.pgo)}
                    </div>
                    <div data-section="chart-line-pgo-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-pgo-legend"
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
                  data-section="chart-line-pgo-legend-item"
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
                    data-section="chart-line-pgo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-pgo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-pgo-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.positiveCount} positive, {layout.negativeCount} negative
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLinePgo.displayName = 'ChartLinePgo';
