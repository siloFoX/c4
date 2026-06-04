import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PFE_WIDTH = 560;
export const DEFAULT_CHART_LINE_PFE_HEIGHT = 360;
export const DEFAULT_CHART_LINE_PFE_PADDING = 40;
export const DEFAULT_CHART_LINE_PFE_GAP = 12;
export const DEFAULT_CHART_LINE_PFE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PFE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PFE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PFE_PERIOD = 10;
export const DEFAULT_CHART_LINE_PFE_SMOOTH = 5;
export const DEFAULT_CHART_LINE_PFE_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_PFE_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_PFE_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PFE_PFE_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_PFE_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PFE_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PFE_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PFE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PFE_AXIS_COLOR = '#cbd5e1';

export type ChartLinePfeZone = 'up' | 'down' | 'choppy' | 'none';

export interface ChartLinePfePoint {
  x: number;
  value: number;
}

export interface ChartLinePfeSample {
  index: number;
  x: number;
  value: number;
  raw: number | null;
  pfe: number | null;
  zone: ChartLinePfeZone;
}

export interface ChartLinePfeRun {
  series: ChartLinePfePoint[];
  period: number;
  smooth: number;
  threshold: number;
  raw: (number | null)[];
  pfe: (number | null)[];
  samples: ChartLinePfeSample[];
  pfeFinal: number;
  upCount: number;
  downCount: number;
  choppyCount: number;
  ok: boolean;
}

export interface ChartLinePfePriceDot {
  index: number;
  x: number;
  value: number;
  raw: number | null;
  pfe: number | null;
  zone: ChartLinePfeZone;
  px: number;
  py: number;
}

export interface ChartLinePfeMarker {
  index: number;
  x: number;
  pfe: number;
  zone: ChartLinePfeZone;
  px: number;
  py: number;
}

export interface ChartLinePfePanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLinePfeLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLinePfePanel;
  pfePanel: ChartLinePfePanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  pfeYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLinePfePriceDot[];
  pfePath: string;
  pfeMarkers: ChartLinePfeMarker[];
  zeroY: number;
  upperY: number;
  lowerY: number;
  period: number;
  smooth: number;
  threshold: number;
  pfeFinal: number;
  upCount: number;
  downCount: number;
  choppyCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLinePfeLayoutOptions {
  data: readonly ChartLinePfePoint[];
  period?: number;
  smooth?: number;
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLinePfeProps {
  data: readonly ChartLinePfePoint[];
  period?: number;
  smooth?: number;
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
  pfeColor?: string;
  upColor?: string;
  downColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPfe?: boolean;
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
  onPointClick?: (payload: { point: ChartLinePfePriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function getLinePfeFinitePoints(
  points: readonly ChartLinePfePoint[] | null | undefined,
): ChartLinePfePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLinePfePoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Polarized Fractal Efficiency period to an integer of
 * at least 2. A non-finite or sub-2 value falls back to
 * `fallback`; a fractional value floors.
 */
export function normalizeLinePfePeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * Coerce a PFE smoothing period to a positive integer (1 means
 * no smoothing). A non-finite or sub-1 value falls back to
 * `fallback`.
 */
export function normalizeLinePfeSmooth(
  smooth: number,
  fallback: number,
): number {
  if (!isFiniteNumber(smooth)) return fallback;
  const s = Math.floor(smooth);
  return s < 1 ? fallback : s;
}

/**
 * The raw Polarized Fractal Efficiency -- how directly the price
 * travels its path over the trailing `period` bars. The
 * straight-line distance from the start of the window to its end
 * is divided by the total length of the zig-zag path the price
 * actually took, the ratio is polarized by the window's trend
 * direction, and scaled to -100..+100:
 *
 *   straight  = sqrt( (close[i] - close[i-period])^2 + period^2 )
 *   path      = sum of sqrt( barChange^2 + 1 ) over the window
 *   raw       = sign * 100 * straight / path
 *
 * A reading near +100 is an efficient up-trend, near -100 an
 * efficient down-trend, near zero a choppy market. Bars before
 * the window is full are null.
 */
export function computeLinePfeRaw(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLinePfePeriod(period, DEFAULT_CHART_LINE_PFE_PERIOD);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    const cur = closes[i];
    const start = closes[i - p];
    if (!isFiniteNumber(cur) || !isFiniteNumber(start)) continue;
    let path = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const a = closes[i - k];
      const b = closes[i - k - 1];
      if (!isFiniteNumber(a) || !isFiniteNumber(b)) {
        valid = false;
        break;
      }
      const d = a - b;
      path += Math.sqrt(d * d + 1);
    }
    if (!valid || path <= 0) continue;
    const dPrice = cur - start;
    const straight = Math.sqrt(dPrice * dPrice + p * p);
    const sign = cur >= start ? 1 : -1;
    out[i] = clamp((sign * 100 * straight) / path, -100, 100);
  }
  return out;
}

/**
 * The Polarized Fractal Efficiency -- the raw efficiency
 * exponentially smoothed over `smooth` bars (a smooth of 1
 * leaves the raw value unchanged).
 */
export function computeLinePfe(
  closes: readonly number[] | null | undefined,
  period: number,
  smooth: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const raw = computeLinePfeRaw(closes, period);
  const s = normalizeLinePfeSmooth(smooth, DEFAULT_CHART_LINE_PFE_SMOOTH);
  const alpha = 2 / (s + 1);
  const n = raw.length;
  const out: (number | null)[] = new Array(n).fill(null);
  let ema: number | null = null;
  for (let i = 0; i < n; i += 1) {
    const r = raw[i];
    if (!isFiniteNumber(r)) continue;
    ema = ema === null ? r : alpha * r + (1 - alpha) * ema;
    out[i] = ema;
  }
  return out;
}

function classifyZone(
  pfe: number | null,
  threshold: number,
): ChartLinePfeZone {
  if (pfe === null) return 'none';
  if (pfe > threshold) return 'up';
  if (pfe < -threshold) return 'down';
  return 'choppy';
}

export function runLinePfe(
  points: readonly ChartLinePfePoint[] | null | undefined,
  options?: { period?: number; smooth?: number; threshold?: number },
): ChartLinePfeRun {
  const finite = getLinePfeFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLinePfePeriod(
    options?.period ?? DEFAULT_CHART_LINE_PFE_PERIOD,
    DEFAULT_CHART_LINE_PFE_PERIOD,
  );
  const smooth = normalizeLinePfeSmooth(
    options?.smooth ?? DEFAULT_CHART_LINE_PFE_SMOOTH,
    DEFAULT_CHART_LINE_PFE_SMOOTH,
  );
  const threshold =
    isFiniteNumber(options?.threshold) &&
    (options?.threshold ?? 0) > 0 &&
    (options?.threshold ?? 0) < 100
      ? (options?.threshold as number)
      : DEFAULT_CHART_LINE_PFE_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      smooth,
      threshold,
      raw: [],
      pfe: [],
      samples: [],
      pfeFinal: NaN,
      upCount: 0,
      downCount: 0,
      choppyCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const raw = computeLinePfeRaw(closes, period);
  const pfe = computeLinePfe(closes, period, smooth);

  const samples: ChartLinePfeSample[] = series.map((p, i) => {
    const v = pfe[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      raw: raw[i] ?? null,
      pfe: v,
      zone: classifyZone(v, threshold),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let choppyCount = 0;
  let pfeFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'up') upCount += 1;
    else if (s.zone === 'down') downCount += 1;
    else if (s.zone === 'choppy') choppyCount += 1;
    if (s.pfe !== null) pfeFinal = s.pfe;
  }

  return {
    series,
    period,
    smooth,
    threshold,
    raw,
    pfe,
    samples,
    pfeFinal,
    upCount,
    downCount,
    choppyCount,
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

export function computeLinePfeLayout(
  options: ComputeLinePfeLayoutOptions,
): ChartLinePfeLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_PFE_GAP,
    tickCount = DEFAULT_CHART_LINE_PFE_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_PFE_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLinePfe(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.smooth) ? { smooth: options.smooth } : {}),
    ...(isFiniteNumber(options.threshold)
      ? { threshold: options.threshold }
      : {}),
  });

  const emptyPanel: ChartLinePfePanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLinePfeLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    pfePanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    pfeYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    pfePath: '',
    pfeMarkers: [],
    zeroY: 0,
    upperY: 0,
    lowerY: 0,
    period: run.period,
    smooth: run.smooth,
    threshold: run.threshold,
    pfeFinal: NaN,
    upCount: 0,
    downCount: 0,
    choppyCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const pfeHeight = usableHeight - priceHeight;

  const pricePanel: ChartLinePfePanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const pfePanel: ChartLinePfePanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: pfeHeight,
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
  const projectPfeY = (v: number): number =>
    pfePanel.y +
    pfePanel.height -
    ((clamp(v, -100, 100) + 100) / 200) * pfePanel.height;

  const priceDots: ChartLinePfePriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    raw: s.raw,
    pfe: s.pfe,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const pfePts: { px: number; py: number }[] = [];
  const pfeMarkers: ChartLinePfeMarker[] = [];
  for (const s of run.samples) {
    if (s.pfe === null) continue;
    const px = projectX(s.x);
    const py = projectPfeY(s.pfe);
    pfePts.push({ px, py });
    pfeMarkers.push({
      index: s.index,
      x: s.x,
      pfe: s.pfe,
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
    pfePanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    pfeYTicks: computeTicks(-100, 100, tickCount).map((v) => ({
      value: v,
      py: projectPfeY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    pfePath: buildPath(pfePts),
    pfeMarkers,
    zeroY: projectPfeY(0),
    upperY: projectPfeY(run.threshold),
    lowerY: projectPfeY(-run.threshold),
    period: run.period,
    smooth: run.smooth,
    threshold: run.threshold,
    pfeFinal: run.pfeFinal,
    upCount: run.upCount,
    downCount: run.downCount,
    choppyCount: run.choppyCount,
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

export function describeLinePfeChart(
  data: readonly ChartLinePfePoint[] | null | undefined,
  options?: { period?: number; smooth?: number; threshold?: number },
): string {
  const run = runLinePfe(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Polarized Fractal Efficiency (period ${run.period}): the top panel plots the price; the bottom panel plots the PFE. The PFE scores how directly the price travels its path -- it divides the straight-line distance across the lookback by the total length of the zig-zag path the price actually took, polarizes the ratio by the trend direction, and scales it to -100..+100. A reading near +100 is an efficient up-trend, near -100 an efficient down-trend, near zero a choppy, inefficient market. The PFE is an efficient up-trend on ${run.upCount} bars, down on ${run.downCount} and choppy on ${run.choppyCount} across ${run.samples.length} bars.`;
}

const PFE_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLinePfe = forwardRef<HTMLDivElement, ChartLinePfeProps>(
  function ChartLinePfe(
    props: ChartLinePfeProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      smooth,
      threshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_PFE_WIDTH,
      height = DEFAULT_CHART_LINE_PFE_HEIGHT,
      padding = DEFAULT_CHART_LINE_PFE_PADDING,
      gap = DEFAULT_CHART_LINE_PFE_GAP,
      tickCount = DEFAULT_CHART_LINE_PFE_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_PFE_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_PFE_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_PFE_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_PFE_PRICE_COLOR,
      pfeColor = DEFAULT_CHART_LINE_PFE_PFE_COLOR,
      upColor = DEFAULT_CHART_LINE_PFE_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_PFE_DOWN_COLOR,
      zeroColor = DEFAULT_CHART_LINE_PFE_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_PFE_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_PFE_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showPfe = true,
      showLevels = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Polarized Fractal Efficiency',
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
        computeLinePfeLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(smooth) ? { smooth } : {}),
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
        smooth,
        threshold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLinePfeChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(smooth) ? { smooth } : {}),
          ...(isFiniteNumber(threshold) ? { threshold } : {}),
        }),
      [ariaDescription, data, period, smooth, threshold],
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
          data-section="chart-line-pfe"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-pfe-aria-desc"
            style={PFE_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const fp = layout.pfePanel;
    const priceVisible = !hiddenSet.has('price');
    const pfeVisible = showPfe && !hiddenSet.has('pfe');
    const levelsVisible = showLevels && !hiddenSet.has('levels');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLinePfeZone): string => {
      if (zone === 'up') return upColor;
      if (zone === 'down') return downColor;
      return pfeColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'pfe', label: 'PFE', color: pfeColor },
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
        data-section="chart-line-pfe"
        data-empty="false"
        data-period={layout.period}
        data-smooth={layout.smooth}
        data-threshold={layout.threshold}
        data-pfe-final={layout.pfeFinal}
        data-up-count={layout.upCount}
        data-down-count={layout.downCount}
        data-choppy-count={layout.choppyCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-pfe-aria-desc"
          style={PFE_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-pfe-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-pfe-badge"
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
                data-section="chart-line-pfe-badge-icon"
                aria-hidden="true"
                style={{ color: pfeColor }}
              >
                PFE
              </span>
              <span data-section="chart-line-pfe-badge-config">
                {layout.period}/{layout.smooth}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-pfe-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-pfe-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-pfe-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.pfeYTicks.map((t, i) => (
                  <line
                    key={`gf-${i}`}
                    data-section="chart-line-pfe-grid-line"
                    data-panel="pfe"
                    x1={fp.x}
                    x2={fp.x + fp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-pfe-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-pfe-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pfe-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pfe-axis"
                  data-panel="pfe"
                  data-axis="y"
                  x1={fp.x}
                  y1={fp.y}
                  x2={fp.x}
                  y2={fp.y + fp.height}
                />
                <line
                  data-section="chart-line-pfe-axis"
                  data-panel="pfe"
                  data-axis="x"
                  x1={fp.x}
                  y1={fp.y + fp.height}
                  x2={fp.x + fp.width}
                  y2={fp.y + fp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-pfe-tick-label"
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
                {layout.pfeYTicks.map((t, i) => (
                  <text
                    key={`fyt-${i}`}
                    data-section="chart-line-pfe-tick-label"
                    data-panel="pfe"
                    data-axis="y"
                    x={fp.x - 6}
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
                    data-section="chart-line-pfe-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={fp.y + fp.height + 14}
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
              data-section="chart-line-pfe-panel-label"
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
              data-section="chart-line-pfe-panel-label"
              data-panel="pfe"
              x={fp.x + 2}
              y={fp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              PFE
            </text>

            {levelsVisible ? (
              <g data-section="chart-line-pfe-levels">
                <line
                  data-section="chart-line-pfe-level-line"
                  data-level="upper"
                  x1={fp.x}
                  x2={fp.x + fp.width}
                  y1={layout.upperY}
                  y2={layout.upperY}
                  stroke={upColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-pfe-level-line"
                  data-level="zero"
                  x1={fp.x}
                  x2={fp.x + fp.width}
                  y1={layout.zeroY}
                  y2={layout.zeroY}
                  stroke={zeroColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-pfe-level-line"
                  data-level="lower"
                  x1={fp.x}
                  x2={fp.x + fp.width}
                  y1={layout.lowerY}
                  y2={layout.lowerY}
                  stroke={downColor}
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
                data-section="chart-line-pfe-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-pfe-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-pfe-dot"
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

            {pfeVisible && layout.pfePath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Polarized Fractal Efficiency line"
                data-section="chart-line-pfe-pfe-line"
                d={layout.pfePath}
                fill="none"
                stroke={pfeColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {pfeVisible ? (
              <g data-section="chart-line-pfe-markers">
                {layout.pfeMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`PFE at x ${formatX(m.x)}: ${formatValue(m.pfe)}, ${m.zone}`}
                      data-section="chart-line-pfe-marker"
                      data-point-index={m.index}
                      data-pfe={m.pfe}
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
                    data-section="chart-line-pfe-tooltip"
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
                    <div data-section="chart-line-pfe-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-pfe-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-pfe-tooltip-pfe">
                      pfe: {fmtNullable(d.pfe)}
                    </div>
                    <div data-section="chart-line-pfe-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-pfe-legend"
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
                  data-section="chart-line-pfe-legend-item"
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
                    data-section="chart-line-pfe-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-pfe-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-pfe-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.upCount} up, {layout.downCount} down,{' '}
              {layout.choppyCount} choppy
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLinePfe.displayName = 'ChartLinePfe';
