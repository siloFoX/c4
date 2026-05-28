import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_VIX_FIX_WIDTH = 560;
export const DEFAULT_CHART_LINE_VIX_FIX_HEIGHT = 360;
export const DEFAULT_CHART_LINE_VIX_FIX_PADDING = 40;
export const DEFAULT_CHART_LINE_VIX_FIX_GAP = 12;
export const DEFAULT_CHART_LINE_VIX_FIX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VIX_FIX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VIX_FIX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VIX_FIX_PERIOD = 22;
export const DEFAULT_CHART_LINE_VIX_FIX_THRESHOLD = 10;
export const DEFAULT_CHART_LINE_VIX_FIX_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_VIX_FIX_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_VIX_FIX_VIX_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_VIX_FIX_SPIKE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VIX_FIX_CALM_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_VIX_FIX_THRESHOLD_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VIX_FIX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VIX_FIX_AXIS_COLOR = '#cbd5e1';

export type ChartLineVixFixZone = 'spike' | 'calm' | 'none';

export interface ChartLineVixFixPoint {
  x: number;
  value: number;
}

export interface ChartLineVixFixSample {
  index: number;
  x: number;
  value: number;
  highest: number | null;
  vixFix: number | null;
  zone: ChartLineVixFixZone;
}

export interface ChartLineVixFixRun {
  series: ChartLineVixFixPoint[];
  period: number;
  threshold: number;
  highest: (number | null)[];
  vixFix: (number | null)[];
  samples: ChartLineVixFixSample[];
  vixFixFinal: number;
  spikeCount: number;
  calmCount: number;
  ok: boolean;
}

export interface ChartLineVixFixPriceDot {
  index: number;
  x: number;
  value: number;
  vixFix: number | null;
  zone: ChartLineVixFixZone;
  px: number;
  py: number;
}

export interface ChartLineVixFixMarker {
  index: number;
  x: number;
  vixFix: number;
  zone: ChartLineVixFixZone;
  px: number;
  py: number;
}

export interface ChartLineVixFixPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineVixFixLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineVixFixPanel;
  vixPanel: ChartLineVixFixPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  vixYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  vixYMin: number;
  vixYMax: number;
  pricePath: string;
  priceDots: ChartLineVixFixPriceDot[];
  vixPath: string;
  vixMarkers: ChartLineVixFixMarker[];
  thresholdY: number;
  period: number;
  threshold: number;
  vixFixFinal: number;
  spikeCount: number;
  calmCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineVixFixLayoutOptions {
  data: readonly ChartLineVixFixPoint[];
  period?: number;
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineVixFixProps {
  data: readonly ChartLineVixFixPoint[];
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
  vixFixColor?: string;
  spikeColor?: string;
  calmColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVixFix?: boolean;
  showThreshold?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineVixFixPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineVixFixFinitePoints(
  points: readonly ChartLineVixFixPoint[] | null | undefined,
): ChartLineVixFixPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineVixFixPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Williams VIX Fix period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineVixFixPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The highest close over the trailing `period` bars. Bars before
 * the window is full are null.
 */
export function computeLineVixFixHighest(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineVixFixPeriod(period, DEFAULT_CHART_LINE_VIX_FIX_PERIOD);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let hi = Number.NEGATIVE_INFINITY;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = closes[i - k];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      if (v > hi) hi = v;
    }
    out[i] = valid ? hi : null;
  }
  return out;
}

/**
 * The Williams VIX Fix -- a synthetic volatility gauge derived
 * from price alone, measuring how far the close has fallen below
 * the highest close of the trailing `period` bars:
 *
 *   WVF[i] = 100 * (highestClose - close) / highestClose
 *
 * It sits at zero when the price makes a new high and spikes
 * when the price drops sharply. A non-positive highest close is
 * null.
 */
export function computeLineVixFix(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const highest = computeLineVixFixHighest(closes, period);
  return closes.map((c, i) => {
    const h = highest[i];
    if (!isFiniteNumber(c) || !isFiniteNumber(h) || h <= 0) return null;
    return (100 * (h - c)) / h;
  });
}

function classifyZone(
  vix: number | null,
  threshold: number,
): ChartLineVixFixZone {
  if (vix === null) return 'none';
  return vix > threshold ? 'spike' : 'calm';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLineVixFix(
  points: readonly ChartLineVixFixPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): ChartLineVixFixRun {
  const finite = getLineVixFixFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineVixFixPeriod(
    options?.period ?? DEFAULT_CHART_LINE_VIX_FIX_PERIOD,
    DEFAULT_CHART_LINE_VIX_FIX_PERIOD,
  );
  const threshold =
    isFiniteNumber(options?.threshold) && (options?.threshold ?? 0) > 0
      ? (options?.threshold as number)
      : DEFAULT_CHART_LINE_VIX_FIX_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      threshold,
      highest: [],
      vixFix: [],
      samples: [],
      vixFixFinal: NaN,
      spikeCount: 0,
      calmCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const highest = computeLineVixFixHighest(closes, period);
  const vixFix = closes.map((c, i) => {
    const h = highest[i];
    if (!isFiniteNumber(c) || !isFiniteNumber(h) || h <= 0) return null;
    return (100 * (h - c)) / h;
  });

  const samples: ChartLineVixFixSample[] = series.map((p, i) => {
    const v = vixFix[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      highest: highest[i] ?? null,
      vixFix: v,
      zone: classifyZone(v, threshold),
    };
  });

  let spikeCount = 0;
  let calmCount = 0;
  let vixFixFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'spike') spikeCount += 1;
    else if (s.zone === 'calm') calmCount += 1;
    if (s.vixFix !== null) vixFixFinal = s.vixFix;
  }

  return {
    series = [],
    period,
    threshold,
    highest,
    vixFix,
    samples,
    vixFixFinal,
    spikeCount,
    calmCount,
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

export function computeLineVixFixLayout(
  options: ComputeLineVixFixLayoutOptions,
): ChartLineVixFixLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_VIX_FIX_GAP,
    tickCount = DEFAULT_CHART_LINE_VIX_FIX_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_VIX_FIX_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineVixFix(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.threshold)
      ? { threshold: options.threshold }
      : {}),
  });

  const emptyPanel: ChartLineVixFixPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineVixFixLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    vixPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    vixYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    vixYMin: 0,
    vixYMax: 0,
    pricePath: '',
    priceDots: [],
    vixPath: '',
    vixMarkers: [],
    thresholdY: 0,
    period: run.period,
    threshold: run.threshold,
    vixFixFinal: NaN,
    spikeCount: 0,
    calmCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const vixHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineVixFixPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const vixPanel: ChartLineVixFixPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: vixHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let vixHi = run.threshold;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
    if (s.vixFix !== null && s.vixFix > vixHi) vixHi = s.vixFix;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  const vixLo = 0;
  if (vixHi <= vixLo) vixHi = vixLo + 1;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const vixRange = vixHi - vixLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectVixY = (v: number): number =>
    vixPanel.y + vixPanel.height - ((v - vixLo) / vixRange) * vixPanel.height;

  const priceDots: ChartLineVixFixPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    vixFix: s.vixFix,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const vixPts: { px: number; py: number }[] = [];
  const vixMarkers: ChartLineVixFixMarker[] = [];
  for (const s of run.samples) {
    if (s.vixFix === null) continue;
    const px = projectX(s.x);
    const py = projectVixY(s.vixFix);
    vixPts.push({ px, py });
    vixMarkers.push({
      index: s.index,
      x: s.x,
      vixFix: s.vixFix,
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
    vixPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    vixYTicks: computeTicks(vixLo, vixHi, tickCount).map((v) => ({
      value: v,
      py: projectVixY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    vixYMin: vixLo,
    vixYMax: vixHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    vixPath: buildPath(vixPts),
    vixMarkers,
    thresholdY: projectVixY(run.threshold),
    period: run.period,
    threshold: run.threshold,
    vixFixFinal: run.vixFixFinal,
    spikeCount: run.spikeCount,
    calmCount: run.calmCount,
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

export function describeLineVixFixChart(
  data: readonly ChartLineVixFixPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): string {
  const run = runLineVixFix(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Williams VIX Fix (period ${run.period}): the top panel plots the price; the bottom panel plots the VIX Fix. The VIX Fix estimates implied volatility from price alone -- it measures how far the close has fallen below the highest close of the last ${run.period} bars, as a percentage: 100 times the highest close minus the close, over the highest close. It sits at zero when the price makes a new high and spikes when the price drops sharply, mirroring a fear gauge. The VIX Fix spikes above the threshold on ${run.spikeCount} bars and is calm on ${run.calmCount} across ${run.samples.length} bars.`;
}

const VIX_FIX_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineVixFix = forwardRef<
  HTMLDivElement,
  ChartLineVixFixProps
>(function ChartLineVixFix(
  props: ChartLineVixFixProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    threshold,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_VIX_FIX_WIDTH,
    height = DEFAULT_CHART_LINE_VIX_FIX_HEIGHT,
    padding = DEFAULT_CHART_LINE_VIX_FIX_PADDING,
    gap = DEFAULT_CHART_LINE_VIX_FIX_GAP,
    tickCount = DEFAULT_CHART_LINE_VIX_FIX_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_VIX_FIX_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_VIX_FIX_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VIX_FIX_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VIX_FIX_PRICE_COLOR,
    vixFixColor = DEFAULT_CHART_LINE_VIX_FIX_VIX_COLOR,
    spikeColor = DEFAULT_CHART_LINE_VIX_FIX_SPIKE_COLOR,
    calmColor = DEFAULT_CHART_LINE_VIX_FIX_CALM_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_VIX_FIX_THRESHOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_VIX_FIX_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_VIX_FIX_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVixFix = true,
    showThreshold = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with a Williams VIX Fix',
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
      computeLineVixFixLayout({
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
      describeLineVixFixChart(data, {
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
        data-section="chart-line-vix-fix"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-vix-fix-aria-desc"
          style={VIX_FIX_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const vp = layout.vixPanel;
  const priceVisible = !hiddenSet.has('price');
  const vixVisible = showVixFix && !hiddenSet.has('vixfix');
  const thresholdVisible = showThreshold && !hiddenSet.has('threshold');

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const zoneColor = (zone: ChartLineVixFixZone): string => {
    if (zone === 'spike') return spikeColor;
    if (zone === 'calm') return calmColor;
    return vixFixColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'vixfix', label: 'VIX Fix', color: vixFixColor },
    { id: 'threshold', label: 'Threshold', color: thresholdColor },
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
      data-section="chart-line-vix-fix"
      data-empty="false"
      data-period={layout.period}
      data-threshold={layout.threshold}
      data-vix-fix-final={layout.vixFixFinal}
      data-spike-count={layout.spikeCount}
      data-calm-count={layout.calmCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-vix-fix-aria-desc"
        style={VIX_FIX_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-vix-fix-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-vix-fix-badge"
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
              data-section="chart-line-vix-fix-badge-icon"
              aria-hidden="true"
              style={{ color: vixFixColor }}
            >
              WVF
            </span>
            <span data-section="chart-line-vix-fix-badge-config">
              {layout.period}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-vix-fix-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-vix-fix-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-vix-fix-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.vixYTicks.map((t, i) => (
                <line
                  key={`gv-${i}`}
                  data-section="chart-line-vix-fix-grid-line"
                  data-panel="vix"
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
              data-section="chart-line-vix-fix-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-vix-fix-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-vix-fix-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-vix-fix-axis"
                data-panel="vix"
                data-axis="y"
                x1={vp.x}
                y1={vp.y}
                x2={vp.x}
                y2={vp.y + vp.height}
              />
              <line
                data-section="chart-line-vix-fix-axis"
                data-panel="vix"
                data-axis="x"
                x1={vp.x}
                y1={vp.y + vp.height}
                x2={vp.x + vp.width}
                y2={vp.y + vp.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-vix-fix-tick-label"
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
              {layout.vixYTicks.map((t, i) => (
                <text
                  key={`vyt-${i}`}
                  data-section="chart-line-vix-fix-tick-label"
                  data-panel="vix"
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
                  data-section="chart-line-vix-fix-tick-label"
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
            data-section="chart-line-vix-fix-panel-label"
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
            data-section="chart-line-vix-fix-panel-label"
            data-panel="vix"
            x={vp.x + 2}
            y={vp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            VIX Fix
          </text>

          {thresholdVisible ? (
            <line
              data-section="chart-line-vix-fix-threshold-line"
              x1={vp.x}
              x2={vp.x + vp.width}
              y1={layout.thresholdY}
              y2={layout.thresholdY}
              stroke={thresholdColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-vix-fix-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-vix-fix-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-vix-fix-dot"
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

          {vixVisible && layout.vixPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Williams VIX Fix line"
              data-section="chart-line-vix-fix-line"
              d={layout.vixPath}
              fill="none"
              stroke={vixFixColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {vixVisible ? (
            <g data-section="chart-line-vix-fix-markers">
              {layout.vixMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`VIX Fix at x ${formatX(m.x)}: ${formatValue(m.vixFix)}, ${m.zone}`}
                    data-section="chart-line-vix-fix-marker"
                    data-point-index={m.index}
                    data-vix={m.vixFix}
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
                  data-section="chart-line-vix-fix-tooltip"
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
                  <div data-section="chart-line-vix-fix-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-vix-fix-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-vix-fix-tooltip-vix">
                    vix fix: {fmtNullable(d.vixFix)}
                  </div>
                  <div data-section="chart-line-vix-fix-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-vix-fix-legend"
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
                data-section="chart-line-vix-fix-legend-item"
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
                  data-section="chart-line-vix-fix-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-vix-fix-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-vix-fix-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.spikeCount} spike, {layout.calmCount} calm
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineVixFix.displayName = 'ChartLineVixFix';
