import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_VZO_WIDTH = 560;
export const DEFAULT_CHART_LINE_VZO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_VZO_PADDING = 40;
export const DEFAULT_CHART_LINE_VZO_GAP = 12;
export const DEFAULT_CHART_LINE_VZO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VZO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VZO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VZO_PERIOD = 14;
export const DEFAULT_CHART_LINE_VZO_THRESHOLD = 40;
export const DEFAULT_CHART_LINE_VZO_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_VZO_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_VZO_VZO_COLOR = '#0284c7';
export const DEFAULT_CHART_LINE_VZO_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VZO_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VZO_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VZO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VZO_AXIS_COLOR = '#cbd5e1';

export type ChartLineVzoZone = 'bullish' | 'bearish' | 'neutral' | 'none';

export interface ChartLineVzoPoint {
  x: number;
  value: number;
  volume: number;
}

export interface ChartLineVzoSample {
  index: number;
  x: number;
  value: number;
  volume: number;
  signedVolume: number | null;
  totalVolume: number | null;
  vzo: number | null;
  zone: ChartLineVzoZone;
}

export interface ChartLineVzoRun {
  series: ChartLineVzoPoint[];
  period: number;
  threshold: number;
  signedVolume: (number | null)[];
  totalVolume: (number | null)[];
  vzo: (number | null)[];
  samples: ChartLineVzoSample[];
  vzoFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineVzoPriceDot {
  index: number;
  x: number;
  value: number;
  volume: number;
  vzo: number | null;
  zone: ChartLineVzoZone;
  px: number;
  py: number;
}

export interface ChartLineVzoMarker {
  index: number;
  x: number;
  vzo: number;
  zone: ChartLineVzoZone;
  px: number;
  py: number;
}

export interface ChartLineVzoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineVzoLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineVzoPanel;
  vzoPanel: ChartLineVzoPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  vzoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineVzoPriceDot[];
  vzoPath: string;
  vzoMarkers: ChartLineVzoMarker[];
  zeroY: number;
  upperY: number;
  lowerY: number;
  period: number;
  threshold: number;
  vzoFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineVzoLayoutOptions {
  data: readonly ChartLineVzoPoint[];
  period?: number;
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineVzoProps {
  data: readonly ChartLineVzoPoint[];
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
  vzoColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVzo?: boolean;
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
  onPointClick?: (payload: { point: ChartLineVzoPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineVzoFinitePoints(
  points: readonly ChartLineVzoPoint[] | null | undefined,
): ChartLineVzoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineVzoPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.value) &&
      isFiniteNumber(p.volume) &&
      p.volume >= 0,
  );
}

/**
 * Coerce a Volume Zone Oscillator period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a fractional
 * value floors.
 */
export function normalizeLineVzoPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The signed volume over a `period`-bar window -- the sum, over
 * the window, of each bar's volume signed by its price
 * direction: positive on an up bar (`close >= prior close`),
 * negative on a down bar. Bars before the window is full are
 * null.
 */
export function computeLineVzoSignedVolume(
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes) || !Array.isArray(volumes)) return [];
  const p = normalizeLineVzoPeriod(period, DEFAULT_CHART_LINE_VZO_PERIOD);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const idx = i - k;
      const cur = closes[idx];
      const prev = closes[idx - 1];
      const vol = volumes[idx];
      if (
        !isFiniteNumber(cur) ||
        !isFiniteNumber(prev) ||
        !isFiniteNumber(vol)
      ) {
        valid = false;
        break;
      }
      sum += (cur >= prev ? 1 : -1) * vol;
    }
    out[i] = valid ? sum : null;
  }
  return out;
}

/**
 * The total volume over a `period`-bar window -- the sum of the
 * raw bar volumes. Bars before the window is full are null.
 */
export function computeLineVzoTotalVolume(
  volumes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(volumes)) return [];
  const p = normalizeLineVzoPeriod(period, DEFAULT_CHART_LINE_VZO_PERIOD);
  const n = volumes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const vol = volumes[i - k];
      if (!isFiniteNumber(vol)) {
        valid = false;
        break;
      }
      sum += vol;
    }
    out[i] = valid ? sum : null;
  }
  return out;
}

/**
 * The Volume Zone Oscillator -- the ratio of the signed volume to
 * the total volume, scaled to -100..+100:
 *
 *   VZO[i] = 100 * signedVolume[i] / totalVolume[i]
 *
 * When buying volume dominates it reads near +100, when selling
 * volume dominates near -100. A window with no volume reads 0.
 */
export function computeLineVzo(
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes) || !Array.isArray(volumes)) return [];
  const signed = computeLineVzoSignedVolume(closes, volumes, period);
  const total = computeLineVzoTotalVolume(volumes, period);
  return signed.map((s, i) => {
    const t = total[i];
    if (s === null || !isFiniteNumber(t)) return null;
    return t > 0 ? (100 * s) / t : 0;
  });
}

function classifyZone(
  vzo: number | null,
  threshold: number,
): ChartLineVzoZone {
  if (vzo === null) return 'none';
  if (vzo > threshold) return 'bullish';
  if (vzo < -threshold) return 'bearish';
  return 'neutral';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLineVzo(
  points: readonly ChartLineVzoPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): ChartLineVzoRun {
  const finite = getLineVzoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineVzoPeriod(
    options?.period ?? DEFAULT_CHART_LINE_VZO_PERIOD,
    DEFAULT_CHART_LINE_VZO_PERIOD,
  );
  const threshold =
    isFiniteNumber(options?.threshold) &&
    (options?.threshold ?? 0) > 0 &&
    (options?.threshold ?? 0) < 100
      ? (options?.threshold as number)
      : DEFAULT_CHART_LINE_VZO_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      threshold,
      signedVolume: [],
      totalVolume: [],
      vzo: [],
      samples: [],
      vzoFinal: NaN,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const volumes = series.map((p) => p.volume);
  const signedVolume = computeLineVzoSignedVolume(closes, volumes, period);
  const totalVolume = computeLineVzoTotalVolume(volumes, period);
  const vzo = signedVolume.map((s, i) => {
    const t = totalVolume[i];
    if (s === null || !isFiniteNumber(t)) return null;
    return t > 0 ? (100 * s) / t : 0;
  });

  const samples: ChartLineVzoSample[] = series.map((p, i) => {
    const v = vzo[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      volume: p.volume,
      signedVolume: signedVolume[i] ?? null,
      totalVolume: totalVolume[i] ?? null,
      vzo: v,
      zone: classifyZone(v, threshold),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let vzoFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.vzo !== null) vzoFinal = s.vzo;
  }

  return {
    series = [],
    period,
    threshold,
    signedVolume,
    totalVolume,
    vzo,
    samples,
    vzoFinal,
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

export function computeLineVzoLayout(
  options: ComputeLineVzoLayoutOptions,
): ChartLineVzoLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_VZO_GAP,
    tickCount = DEFAULT_CHART_LINE_VZO_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_VZO_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineVzo(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.threshold)
      ? { threshold: options.threshold }
      : {}),
  });

  const emptyPanel: ChartLineVzoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineVzoLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    vzoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    vzoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    vzoPath: '',
    vzoMarkers: [],
    zeroY: 0,
    upperY: 0,
    lowerY: 0,
    period: run.period,
    threshold: run.threshold,
    vzoFinal: NaN,
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
  const vzoHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineVzoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const vzoPanel: ChartLineVzoPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: vzoHeight,
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
  const projectVzoY = (v: number): number =>
    vzoPanel.y + vzoPanel.height - ((v + 100) / 200) * vzoPanel.height;

  const priceDots: ChartLineVzoPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    volume: s.volume,
    vzo: s.vzo,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const vzoPts: { px: number; py: number }[] = [];
  const vzoMarkers: ChartLineVzoMarker[] = [];
  for (const s of run.samples) {
    if (s.vzo === null) continue;
    const px = projectX(s.x);
    const py = projectVzoY(s.vzo);
    vzoPts.push({ px, py });
    vzoMarkers.push({
      index: s.index,
      x: s.x,
      vzo: s.vzo,
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
    vzoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    vzoYTicks: computeTicks(-100, 100, tickCount).map((v) => ({
      value: v,
      py: projectVzoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    vzoPath: buildPath(vzoPts),
    vzoMarkers,
    zeroY: projectVzoY(0),
    upperY: projectVzoY(run.threshold),
    lowerY: projectVzoY(-run.threshold),
    period: run.period,
    threshold: run.threshold,
    vzoFinal: run.vzoFinal,
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

export function describeLineVzoChart(
  data: readonly ChartLineVzoPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): string {
  const run = runLineVzo(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Volume Zone Oscillator (period ${run.period}): the top panel plots the price; the bottom panel plots the VZO. The VZO is the ratio of the signed volume to the total volume over the lookback, scaled to -100..+100: each bar's volume is signed by the price direction -- positive on an up bar, negative on a down bar -- and the signed volume is their sum, while the total volume is the sum of the raw volumes. When buying volume dominates the VZO reads near +100, when selling volume dominates near -100. Readings above +${run.threshold} are bullish and below -${run.threshold} bearish. The VZO is bullish on ${run.bullishCount} bars, bearish on ${run.bearishCount} and neutral on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const VZO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineVzo = forwardRef<HTMLDivElement, ChartLineVzoProps>(
  function ChartLineVzo(
    props: ChartLineVzoProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      threshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_VZO_WIDTH,
      height = DEFAULT_CHART_LINE_VZO_HEIGHT,
      padding = DEFAULT_CHART_LINE_VZO_PADDING,
      gap = DEFAULT_CHART_LINE_VZO_GAP,
      tickCount = DEFAULT_CHART_LINE_VZO_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_VZO_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_VZO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VZO_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_VZO_PRICE_COLOR,
      vzoColor = DEFAULT_CHART_LINE_VZO_VZO_COLOR,
      bullishColor = DEFAULT_CHART_LINE_VZO_BULLISH_COLOR,
      bearishColor = DEFAULT_CHART_LINE_VZO_BEARISH_COLOR,
      zeroColor = DEFAULT_CHART_LINE_VZO_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_VZO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VZO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showVzo = true,
      showLevels = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Volume Zone Oscillator',
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
        computeLineVzoLayout({
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
        describeLineVzoChart(data, {
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
          data-section="chart-line-vzo"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-vzo-aria-desc"
            style={VZO_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const vp = layout.vzoPanel;
    const priceVisible = !hiddenSet.has('price');
    const vzoVisible = showVzo && !hiddenSet.has('vzo');
    const levelsVisible = showLevels && !hiddenSet.has('levels');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineVzoZone): string => {
      if (zone === 'bullish') return bullishColor;
      if (zone === 'bearish') return bearishColor;
      return vzoColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'vzo', label: 'VZO', color: vzoColor },
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
        data-section="chart-line-vzo"
        data-empty="false"
        data-period={layout.period}
        data-threshold={layout.threshold}
        data-vzo-final={layout.vzoFinal}
        data-bullish-count={layout.bullishCount}
        data-bearish-count={layout.bearishCount}
        data-neutral-count={layout.neutralCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-vzo-aria-desc"
          style={VZO_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-vzo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-vzo-badge"
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
                data-section="chart-line-vzo-badge-icon"
                aria-hidden="true"
                style={{ color: vzoColor }}
              >
                VZO
              </span>
              <span data-section="chart-line-vzo-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-vzo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-vzo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-vzo-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.vzoYTicks.map((t, i) => (
                  <line
                    key={`gv-${i}`}
                    data-section="chart-line-vzo-grid-line"
                    data-panel="vzo"
                    x1={vp.x}
                    x2={vp.x + vp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-vzo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-vzo-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-vzo-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-vzo-axis"
                  data-panel="vzo"
                  data-axis="y"
                  x1={vp.x}
                  y1={vp.y}
                  x2={vp.x}
                  y2={vp.y + vp.height}
                />
                <line
                  data-section="chart-line-vzo-axis"
                  data-panel="vzo"
                  data-axis="x"
                  x1={vp.x}
                  y1={vp.y + vp.height}
                  x2={vp.x + vp.width}
                  y2={vp.y + vp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-vzo-tick-label"
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
                {layout.vzoYTicks.map((t, i) => (
                  <text
                    key={`vyt-${i}`}
                    data-section="chart-line-vzo-tick-label"
                    data-panel="vzo"
                    data-axis="y"
                    x={vp.x - 6}
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
                    data-section="chart-line-vzo-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={vp.y + vp.height + 14}
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
              data-section="chart-line-vzo-panel-label"
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
              data-section="chart-line-vzo-panel-label"
              data-panel="vzo"
              x={vp.x + 2}
              y={vp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              VZO
            </text>

            {levelsVisible ? (
              <g data-section="chart-line-vzo-levels">
                <line
                  data-section="chart-line-vzo-level-line"
                  data-level="upper"
                  x1={vp.x}
                  x2={vp.x + vp.width}
                  y1={layout.upperY}
                  y2={layout.upperY}
                  stroke={bullishColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-vzo-level-line"
                  data-level="zero"
                  x1={vp.x}
                  x2={vp.x + vp.width}
                  y1={layout.zeroY}
                  y2={layout.zeroY}
                  stroke={zeroColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-vzo-level-line"
                  data-level="lower"
                  x1={vp.x}
                  x2={vp.x + vp.width}
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
                data-section="chart-line-vzo-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-vzo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-vzo-dot"
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

            {vzoVisible && layout.vzoPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Volume Zone Oscillator line"
                data-section="chart-line-vzo-vzo-line"
                d={layout.vzoPath}
                fill="none"
                stroke={vzoColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {vzoVisible ? (
              <g data-section="chart-line-vzo-markers">
                {layout.vzoMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`VZO at x ${formatX(m.x)}: ${formatValue(m.vzo)}, ${m.zone}`}
                      data-section="chart-line-vzo-marker"
                      data-point-index={m.index}
                      data-vzo={m.vzo}
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
                    data-section="chart-line-vzo-tooltip"
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
                    <div data-section="chart-line-vzo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-vzo-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-vzo-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-vzo-tooltip-vzo">
                      vzo: {fmtNullable(d.vzo)}
                    </div>
                    <div data-section="chart-line-vzo-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-vzo-legend"
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
                  data-section="chart-line-vzo-legend-item"
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
                    data-section="chart-line-vzo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-vzo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vzo-legend-stats"
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

ChartLineVzo.displayName = 'ChartLineVzo';
