import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_IFT_WIDTH = 560;
export const DEFAULT_CHART_LINE_IFT_HEIGHT = 360;
export const DEFAULT_CHART_LINE_IFT_PADDING = 40;
export const DEFAULT_CHART_LINE_IFT_GAP = 12;
export const DEFAULT_CHART_LINE_IFT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_IFT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_IFT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_IFT_PERIOD = 9;
export const DEFAULT_CHART_LINE_IFT_SCALE = 0.5;
export const DEFAULT_CHART_LINE_IFT_THRESHOLD = 0.5;
export const DEFAULT_CHART_LINE_IFT_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_IFT_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_IFT_IFT_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_IFT_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_IFT_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_IFT_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_IFT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_IFT_AXIS_COLOR = '#cbd5e1';

export type ChartLineIftZone = 'bullish' | 'bearish' | 'neutral' | 'none';

export interface ChartLineIftPoint {
  x: number;
  value: number;
}

export interface ChartLineIftSample {
  index: number;
  x: number;
  value: number;
  oscillator: number | null;
  ift: number | null;
  zone: ChartLineIftZone;
}

export interface ChartLineIftRun {
  series: ChartLineIftPoint[];
  period: number;
  scale: number;
  threshold: number;
  oscillator: (number | null)[];
  ift: (number | null)[];
  samples: ChartLineIftSample[];
  iftFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineIftPriceDot {
  index: number;
  x: number;
  value: number;
  oscillator: number | null;
  ift: number | null;
  zone: ChartLineIftZone;
  px: number;
  py: number;
}

export interface ChartLineIftMarker {
  index: number;
  x: number;
  ift: number;
  oscillator: number | null;
  zone: ChartLineIftZone;
  px: number;
  py: number;
}

export interface ChartLineIftPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineIftLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineIftPanel;
  iftPanel: ChartLineIftPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  iftYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineIftPriceDot[];
  iftPath: string;
  iftMarkers: ChartLineIftMarker[];
  zeroY: number;
  upperY: number;
  lowerY: number;
  period: number;
  scale: number;
  threshold: number;
  iftFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineIftLayoutOptions {
  data: readonly ChartLineIftPoint[];
  period?: number;
  scale?: number;
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineIftProps {
  data: readonly ChartLineIftPoint[];
  period?: number;
  scale?: number;
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
  iftColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showIft?: boolean;
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
  onPointClick?: (payload: { point: ChartLineIftPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineIftFinitePoints(
  points: readonly ChartLineIftPoint[] | null | undefined,
): ChartLineIftPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineIftPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce an Inverse Fisher Transform period to a positive
 * integer. A non-finite or sub-1 value falls back to `fallback`;
 * a fractional value floors.
 */
export function normalizeLineIftPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The Inverse Fisher Transform of a scalar:
 *
 *   IFT(x) = (exp(2x) - 1) / (exp(2x) + 1)
 *
 * which compresses any real input into the open interval
 * (-1, 1). It is computed in the overflow-safe form so a large
 * positive input saturates cleanly at +1 rather than producing a
 * NaN. IFT(0) is exactly 0, and the transform is odd.
 */
export function computeLineIftTransform(x: number): number {
  if (!isFiniteNumber(x)) return 0;
  if (x >= 0) {
    const e = Math.exp(-2 * x);
    return (1 - e) / (1 + e);
  }
  const e = Math.exp(2 * x);
  return (e - 1) / (e + 1);
}

/**
 * The `period`-bar simple moving average of a (nullable) series.
 * A window containing a null is null.
 */
export function computeLineIftSma(
  values: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineIftPeriod(period, DEFAULT_CHART_LINE_IFT_PERIOD);
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
 * The oscillator fed into the transform -- the scaled deviation
 * of the close from its `period`-bar moving average:
 * `osc[i] = scale * (close[i] - sma[i])`.
 */
export function computeLineIftOscillator(
  closes: readonly number[] | null | undefined,
  period: number,
  scale: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const s = isFiniteNumber(scale) && scale > 0 ? scale : DEFAULT_CHART_LINE_IFT_SCALE;
  const sma = computeLineIftSma(closes, period);
  return closes.map((v, i) => {
    const m = sma[i];
    if (!isFiniteNumber(v) || !isFiniteNumber(m)) return null;
    return s * (v - m);
  });
}

/**
 * The Inverse Fisher Transform of the price oscillator -- the
 * scaled deviation of the close from its moving average,
 * compressed through `computeLineIftTransform` into a sharp
 * signal bounded in (-1, 1).
 */
export function computeLineIft(
  closes: readonly number[] | null | undefined,
  period: number,
  scale: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const osc = computeLineIftOscillator(closes, period, scale);
  return osc.map((v) => (v === null ? null : computeLineIftTransform(v)));
}

function classifyZone(
  ift: number | null,
  threshold: number,
): ChartLineIftZone {
  if (ift === null) return 'none';
  if (ift > threshold) return 'bullish';
  if (ift < -threshold) return 'bearish';
  return 'neutral';
}

export function runLineIft(
  points: readonly ChartLineIftPoint[] | null | undefined,
  options?: { period?: number; scale?: number; threshold?: number },
): ChartLineIftRun {
  const finite = getLineIftFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineIftPeriod(
    options?.period ?? DEFAULT_CHART_LINE_IFT_PERIOD,
    DEFAULT_CHART_LINE_IFT_PERIOD,
  );
  const scale =
    isFiniteNumber(options?.scale) && (options?.scale ?? 0) > 0
      ? (options?.scale as number)
      : DEFAULT_CHART_LINE_IFT_SCALE;
  const threshold =
    isFiniteNumber(options?.threshold) &&
    (options?.threshold ?? 0) > 0 &&
    (options?.threshold ?? 0) < 1
      ? (options?.threshold as number)
      : DEFAULT_CHART_LINE_IFT_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      scale,
      threshold,
      oscillator: [],
      ift: [],
      samples: [],
      iftFinal: NaN,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const oscillator = computeLineIftOscillator(closes, period, scale);
  const ift = oscillator.map((v) =>
    v === null ? null : computeLineIftTransform(v),
  );

  const samples: ChartLineIftSample[] = series.map((p, i) => {
    const t = ift[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      oscillator: oscillator[i] ?? null,
      ift: t,
      zone: classifyZone(t, threshold),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let iftFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.ift !== null) iftFinal = s.ift;
  }

  return {
    series = [],
    period,
    scale,
    threshold,
    oscillator,
    ift,
    samples,
    iftFinal,
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

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function computeLineIftLayout(
  options: ComputeLineIftLayoutOptions,
): ChartLineIftLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_IFT_GAP,
    tickCount = DEFAULT_CHART_LINE_IFT_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_IFT_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineIft(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.scale) ? { scale: options.scale } : {}),
    ...(isFiniteNumber(options.threshold)
      ? { threshold: options.threshold }
      : {}),
  });

  const emptyPanel: ChartLineIftPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineIftLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    iftPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    iftYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    iftPath: '',
    iftMarkers: [],
    zeroY: 0,
    upperY: 0,
    lowerY: 0,
    period: run.period,
    scale: run.scale,
    threshold: run.threshold,
    iftFinal: NaN,
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
  const iftHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineIftPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const iftPanel: ChartLineIftPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: iftHeight,
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
  const projectIftY = (v: number): number =>
    iftPanel.y + iftPanel.height - ((v + 1) / 2) * iftPanel.height;

  const priceDots: ChartLineIftPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    oscillator: s.oscillator,
    ift: s.ift,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const iftPts: { px: number; py: number }[] = [];
  const iftMarkers: ChartLineIftMarker[] = [];
  for (const s of run.samples) {
    if (s.ift === null) continue;
    const px = projectX(s.x);
    const py = projectIftY(s.ift);
    iftPts.push({ px, py });
    iftMarkers.push({
      index: s.index,
      x: s.x,
      ift: s.ift,
      oscillator: s.oscillator,
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
    iftPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    iftYTicks: computeTicks(-1, 1, tickCount).map((v) => ({
      value: v,
      py: projectIftY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    iftPath: buildPath(iftPts),
    iftMarkers,
    zeroY: projectIftY(0),
    upperY: projectIftY(run.threshold),
    lowerY: projectIftY(-run.threshold),
    period: run.period,
    scale: run.scale,
    threshold: run.threshold,
    iftFinal: run.iftFinal,
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

export function describeLineIftChart(
  data: readonly ChartLineIftPoint[] | null | undefined,
  options?: { period?: number; scale?: number; threshold?: number },
): string {
  const run = runLineIft(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with an Inverse Fisher Transform (period ${run.period}): the top panel plots the price; the bottom panel plots the IFT. The IFT takes an oscillator -- here the scaled deviation of the price from its moving average -- and compresses it through the function (exp(2x) - 1) / (exp(2x) + 1), which squashes any input into a sharp signal bounded in -1 to +1. Large positive inputs saturate near +1, large negative near -1, with a fast transition through zero. Readings above +${run.threshold} are bullish and below -${run.threshold} bearish. The IFT is bullish on ${run.bullishCount} bars, bearish on ${run.bearishCount} and neutral on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const IFT_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineIft = forwardRef<HTMLDivElement, ChartLineIftProps>(
  function ChartLineIft(
    props: ChartLineIftProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      scale,
      threshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_IFT_WIDTH,
      height = DEFAULT_CHART_LINE_IFT_HEIGHT,
      padding = DEFAULT_CHART_LINE_IFT_PADDING,
      gap = DEFAULT_CHART_LINE_IFT_GAP,
      tickCount = DEFAULT_CHART_LINE_IFT_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_IFT_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_IFT_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_IFT_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_IFT_PRICE_COLOR,
      iftColor = DEFAULT_CHART_LINE_IFT_IFT_COLOR,
      bullishColor = DEFAULT_CHART_LINE_IFT_BULLISH_COLOR,
      bearishColor = DEFAULT_CHART_LINE_IFT_BEARISH_COLOR,
      zeroColor = DEFAULT_CHART_LINE_IFT_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_IFT_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_IFT_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showIft = true,
      showLevels = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with an Inverse Fisher Transform',
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
        computeLineIftLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(scale) ? { scale } : {}),
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
        scale,
        threshold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineIftChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(scale) ? { scale } : {}),
          ...(isFiniteNumber(threshold) ? { threshold } : {}),
        }),
      [ariaDescription, data, period, scale, threshold],
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
          data-section="chart-line-ift"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-ift-aria-desc"
            style={IFT_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const ip = layout.iftPanel;
    const priceVisible = !hiddenSet.has('price');
    const iftVisible = showIft && !hiddenSet.has('ift');
    const levelsVisible = showLevels && !hiddenSet.has('levels');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineIftZone): string => {
      if (zone === 'bullish') return bullishColor;
      if (zone === 'bearish') return bearishColor;
      return iftColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'ift', label: 'IFT', color: iftColor },
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
        data-section="chart-line-ift"
        data-empty="false"
        data-period={layout.period}
        data-scale={layout.scale}
        data-ift-final={layout.iftFinal}
        data-bullish-count={layout.bullishCount}
        data-bearish-count={layout.bearishCount}
        data-neutral-count={layout.neutralCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-ift-aria-desc"
          style={IFT_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-ift-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-ift-badge"
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
                data-section="chart-line-ift-badge-icon"
                aria-hidden="true"
                style={{ color: iftColor }}
              >
                IFT
              </span>
              <span data-section="chart-line-ift-badge-config">
                {layout.period}/{layout.scale}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-ift-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-ift-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-ift-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.iftYTicks.map((t, i) => (
                  <line
                    key={`gi-${i}`}
                    data-section="chart-line-ift-grid-line"
                    data-panel="ift"
                    x1={ip.x}
                    x2={ip.x + ip.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-ift-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-ift-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-ift-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-ift-axis"
                  data-panel="ift"
                  data-axis="y"
                  x1={ip.x}
                  y1={ip.y}
                  x2={ip.x}
                  y2={ip.y + ip.height}
                />
                <line
                  data-section="chart-line-ift-axis"
                  data-panel="ift"
                  data-axis="x"
                  x1={ip.x}
                  y1={ip.y + ip.height}
                  x2={ip.x + ip.width}
                  y2={ip.y + ip.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-ift-tick-label"
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
                {layout.iftYTicks.map((t, i) => (
                  <text
                    key={`iyt-${i}`}
                    data-section="chart-line-ift-tick-label"
                    data-panel="ift"
                    data-axis="y"
                    x={ip.x - 6}
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
                    data-section="chart-line-ift-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={ip.y + ip.height + 14}
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
              data-section="chart-line-ift-panel-label"
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
              data-section="chart-line-ift-panel-label"
              data-panel="ift"
              x={ip.x + 2}
              y={ip.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              IFT
            </text>

            {levelsVisible ? (
              <g data-section="chart-line-ift-levels">
                <line
                  data-section="chart-line-ift-level-line"
                  data-level="upper"
                  x1={ip.x}
                  x2={ip.x + ip.width}
                  y1={layout.upperY}
                  y2={layout.upperY}
                  stroke={bullishColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-ift-level-line"
                  data-level="zero"
                  x1={ip.x}
                  x2={ip.x + ip.width}
                  y1={layout.zeroY}
                  y2={layout.zeroY}
                  stroke={zeroColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-ift-level-line"
                  data-level="lower"
                  x1={ip.x}
                  x2={ip.x + ip.width}
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
                data-section="chart-line-ift-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-ift-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-ift-dot"
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

            {iftVisible && layout.iftPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Inverse Fisher Transform line"
                data-section="chart-line-ift-ift-line"
                d={layout.iftPath}
                fill="none"
                stroke={iftColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {iftVisible ? (
              <g data-section="chart-line-ift-markers">
                {layout.iftMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`IFT at x ${formatX(m.x)}: ${formatValue(m.ift)}, ${m.zone}`}
                      data-section="chart-line-ift-marker"
                      data-point-index={m.index}
                      data-ift={m.ift}
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
                    data-section="chart-line-ift-tooltip"
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
                    <div data-section="chart-line-ift-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-ift-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-ift-tooltip-osc">
                      osc: {fmtNullable(d.oscillator)}
                    </div>
                    <div data-section="chart-line-ift-tooltip-ift">
                      ift: {fmtNullable(d.ift)}
                    </div>
                    <div data-section="chart-line-ift-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-ift-legend"
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
                  data-section="chart-line-ift-legend-item"
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
                    data-section="chart-line-ift-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-ift-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-ift-legend-stats"
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

ChartLineIft.displayName = 'ChartLineIft';
