import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_WILLIAMS_R_WIDTH = 560;
export const DEFAULT_CHART_LINE_WILLIAMS_R_HEIGHT = 360;
export const DEFAULT_CHART_LINE_WILLIAMS_R_PADDING = 40;
export const DEFAULT_CHART_LINE_WILLIAMS_R_GAP = 26;
export const DEFAULT_CHART_LINE_WILLIAMS_R_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_WILLIAMS_R_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WILLIAMS_R_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WILLIAMS_R_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WILLIAMS_R_PERIOD = 14;
export const DEFAULT_CHART_LINE_WILLIAMS_R_OVERBOUGHT = -20;
export const DEFAULT_CHART_LINE_WILLIAMS_R_OVERSOLD = -80;
export const DEFAULT_CHART_LINE_WILLIAMS_R_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_WILLIAMS_R_WR_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_WILLIAMS_R_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WILLIAMS_R_OVERSOLD_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WILLIAMS_R_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_WILLIAMS_R_AXIS_COLOR = '#cbd5e1';

export type ChartLineWilliamsRZone = 'overbought' | 'oversold' | 'neutral';

export interface ChartLineWilliamsRPoint {
  x: number;
  value: number;
}

export interface ChartLineWilliamsRSample {
  index: number;
  x: number;
  value: number;
  williamsR: number | null;
  zone: ChartLineWilliamsRZone;
}

export interface ChartLineWilliamsRRun {
  series: ChartLineWilliamsRPoint[];
  period: number;
  overbought: number;
  oversold: number;
  williamsR: (number | null)[];
  samples: ChartLineWilliamsRSample[];
  williamsRFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  ok: boolean;
}

export interface ChartLineWilliamsRPriceDot {
  index: number;
  x: number;
  value: number;
  williamsR: number | null;
  zone: ChartLineWilliamsRZone;
  px: number;
  py: number;
}

export interface ChartLineWilliamsRMarker {
  index: number;
  x: number;
  williamsR: number;
  zone: ChartLineWilliamsRZone;
  px: number;
  py: number;
}

export interface ChartLineWilliamsRPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineWilliamsRLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineWilliamsRPanel;
  wrPanel: ChartLineWilliamsRPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  wrYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineWilliamsRPriceDot[];
  wrPath: string;
  markers: ChartLineWilliamsRMarker[];
  overbought: number;
  oversold: number;
  overboughtY: number;
  oversoldY: number;
  overboughtZone: ChartLineWilliamsRPanel;
  oversoldZone: ChartLineWilliamsRPanel;
  period: number;
  williamsRFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineWilliamsRLayoutOptions {
  data: readonly ChartLineWilliamsRPoint[];
  period?: number;
  overbought?: number;
  oversold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineWilliamsRProps {
  data: readonly ChartLineWilliamsRPoint[];
  period?: number;
  overbought?: number;
  oversold?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  valueColor?: string;
  wrColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showWilliamsR?: boolean;
  showZones?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineWilliamsRPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineWilliamsRFinitePoints(
  points: readonly ChartLineWilliamsRPoint[] | null | undefined,
): ChartLineWilliamsRPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineWilliamsRPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineWilliamsRPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Larry Williams' Percent Range (%R). For each index from
 * `period - 1` onward the window of `period` values yields
 * `%R = -100 * (highestHigh - value) / (highestHigh - lowestLow)`.
 * The result runs 0 (value at the window high) down to -100 (value
 * at the window low). A flat window (zero range) reads -50, the
 * neutral middle. Indices before the window fills read null.
 */
export function computeLineWilliamsR(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let hh = values[i - p + 1]!;
    let ll = values[i - p + 1]!;
    for (let j = i - p + 2; j <= i; j += 1) {
      if (values[j]! > hh) hh = values[j]!;
      if (values[j]! < ll) ll = values[j]!;
    }
    const range = hh - ll;
    const raw = range === 0 ? -50 : (-100 * (hh - values[i]!)) / range;
    out[i] = raw === 0 ? 0 : raw;
  }
  return out;
}

function classifyZone(
  wr: number | null,
  overbought: number,
  oversold: number,
): ChartLineWilliamsRZone {
  if (wr === null) return 'neutral';
  if (wr > overbought) return 'overbought';
  if (wr < oversold) return 'oversold';
  return 'neutral';
}

export function runLineWilliamsR(
  points: readonly ChartLineWilliamsRPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): ChartLineWilliamsRRun {
  const finite = getLineWilliamsRFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineWilliamsRPeriod(
    options?.period ?? DEFAULT_CHART_LINE_WILLIAMS_R_PERIOD,
    DEFAULT_CHART_LINE_WILLIAMS_R_PERIOD,
  );
  const overbought = isFiniteNumber(options?.overbought)
    ? options.overbought
    : DEFAULT_CHART_LINE_WILLIAMS_R_OVERBOUGHT;
  const oversold = isFiniteNumber(options?.oversold)
    ? options.oversold
    : DEFAULT_CHART_LINE_WILLIAMS_R_OVERSOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      overbought,
      oversold,
      williamsR: [],
      samples: [],
      williamsRFinal: NaN,
      overboughtCount: 0,
      oversoldCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const williamsR = computeLineWilliamsR(values, period);
  const samples: ChartLineWilliamsRSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    williamsR: williamsR[i] ?? null,
    zone: classifyZone(williamsR[i] ?? null, overbought, oversold),
  }));

  let williamsRFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (williamsR[i] !== null) {
      williamsRFinal = williamsR[i] as number;
      break;
    }
  }
  let overboughtCount = 0;
  let oversoldCount = 0;
  for (const s of samples) {
    if (s.zone === 'overbought') overboughtCount += 1;
    if (s.zone === 'oversold') oversoldCount += 1;
  }

  return {
    series,
    period,
    overbought,
    oversold,
    williamsR,
    samples,
    williamsRFinal,
    overboughtCount,
    oversoldCount,
    ok: true,
  };
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
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

export function computeLineWilliamsRLayout(
  options: ComputeLineWilliamsRLayoutOptions,
): ChartLineWilliamsRLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_WILLIAMS_R_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_WILLIAMS_R_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_WILLIAMS_R_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineWilliamsRPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineWilliamsR(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.overbought)
      ? { overbought: options.overbought }
      : {}),
    ...(isFiniteNumber(options.oversold)
      ? { oversold: options.oversold }
      : {}),
  });
  const empty: ChartLineWilliamsRLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    wrPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    wrYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    wrPath: '',
    markers: [],
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtY: 0,
    oversoldY: 0,
    overboughtZone: emptyPanel,
    oversoldZone: emptyPanel,
    period: run.period,
    williamsRFinal: NaN,
    overboughtCount: 0,
    oversoldCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const wrH = usableHeight - priceH;
  if (priceH <= 0 || wrH <= 0) return empty;

  const pricePanel: ChartLineWilliamsRPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const wrPanel: ChartLineWilliamsRPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: wrH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  // %R runs 0 (top) to -100 (bottom).
  const projectWrY = (v: number): number =>
    wrPanel.y + ((0 - v) / 100) * wrPanel.height;

  const priceDots: ChartLineWilliamsRPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    williamsR: s.williamsR,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineWilliamsRMarker[] = [];
  const wrPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.williamsR !== null) {
      const px = projectX(s.x);
      const py = projectWrY(s.williamsR);
      wrPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        williamsR: s.williamsR,
        zone: s.zone,
        px,
        py,
      });
    }
  }

  const overboughtY = projectWrY(run.overbought);
  const oversoldY = projectWrY(run.oversold);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    wrPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    wrYTicks: computeTicks(0, -100, tickCount).map((v) => ({
      value: v,
      py: projectWrY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    wrPath: buildPath(wrPts),
    markers,
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtY,
    oversoldY,
    overboughtZone: {
      x: wrPanel.x,
      y: wrPanel.y,
      width: wrPanel.width,
      height: Math.max(0, overboughtY - wrPanel.y),
    },
    oversoldZone: {
      x: wrPanel.x,
      y: oversoldY,
      width: wrPanel.width,
      height: Math.max(0, wrPanel.y + wrPanel.height - oversoldY),
    },
    period: run.period,
    williamsRFinal: run.williamsRFinal,
    overboughtCount: run.overboughtCount,
    oversoldCount: run.oversoldCount,
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

export function describeLineWilliamsRChart(
  data: readonly ChartLineWilliamsRPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): string {
  const run = runLineWilliamsR(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Williams %R momentum oscillator panel (period ${run.period}): %R measures where the value sits within its trailing high-low range on a 0 to -100 scale; readings above -20 are overbought and below -80 oversold. ${run.overboughtCount} overbought and ${run.oversoldCount} oversold across ${run.samples.length} periods.`;
}

const WILLIAMS_R_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineWilliamsR = forwardRef<
  HTMLDivElement,
  ChartLineWilliamsRProps
>(function ChartLineWilliamsR(
  props: ChartLineWilliamsRProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    overbought,
    oversold,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_WILLIAMS_R_WIDTH,
    height = DEFAULT_CHART_LINE_WILLIAMS_R_HEIGHT,
    padding = DEFAULT_CHART_LINE_WILLIAMS_R_PADDING,
    gap = DEFAULT_CHART_LINE_WILLIAMS_R_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_WILLIAMS_R_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_WILLIAMS_R_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_WILLIAMS_R_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_WILLIAMS_R_DOT_RADIUS,
    valueColor = DEFAULT_CHART_LINE_WILLIAMS_R_VALUE_COLOR,
    wrColor = DEFAULT_CHART_LINE_WILLIAMS_R_WR_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_WILLIAMS_R_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_WILLIAMS_R_OVERSOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_WILLIAMS_R_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_WILLIAMS_R_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWilliamsR = true,
    showZones = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Williams %R momentum oscillator panel',
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
      computeLineWilliamsRLayout({
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(overbought) ? { overbought } : {}),
        ...(isFiniteNumber(oversold) ? { oversold } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      pricePanelRatio,
      tickCount,
      period,
      overbought,
      oversold,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineWilliamsRChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(overbought) ? { overbought } : {}),
        ...(isFiniteNumber(oversold) ? { oversold } : {}),
      }),
    [ariaDescription, data, period, overbought, oversold],
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

  const zoneColor = useCallback(
    (z: ChartLineWilliamsRZone): string =>
      z === 'overbought'
        ? overboughtColor
        : z === 'oversold'
          ? oversoldColor
          : wrColor,
    [overboughtColor, oversoldColor, wrColor],
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
        data-section="chart-line-williams-r"
        data-empty="true"
        data-period={layout.period}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-williams-r-aria-desc"
          style={WILLIAMS_R_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const wp = layout.wrPanel;
  const valueVisible = !hiddenSet.has('value');
  const wrVisible = showWilliamsR && !hiddenSet.has('wr');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'value', label: 'Value', color: valueColor },
    { id: 'wr', label: '%R', color: wrColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-williams-r"
      data-empty="false"
      data-period={layout.period}
      data-williams-r-final={layout.williamsRFinal}
      data-overbought-count={layout.overboughtCount}
      data-oversold-count={layout.oversoldCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-williams-r-aria-desc"
        style={WILLIAMS_R_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-williams-r-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-williams-r-badge"
            data-period={layout.period}
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
              data-section="chart-line-williams-r-badge-icon"
              aria-hidden="true"
              style={{ color: wrColor }}
            >
              WR
            </span>
            <span data-section="chart-line-williams-r-badge-period">
              p={layout.period}
            </span>
            <span data-section="chart-line-williams-r-badge-extremes">
              ext={layout.overboughtCount + layout.oversoldCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-williams-r-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showZones ? (
            <g data-section="chart-line-williams-r-zones">
              <rect
                data-section="chart-line-williams-r-zone"
                data-zone="overbought"
                x={layout.overboughtZone.x}
                y={layout.overboughtZone.y}
                width={layout.overboughtZone.width}
                height={layout.overboughtZone.height}
                fill={overboughtColor}
                fillOpacity={0.12}
              />
              <rect
                data-section="chart-line-williams-r-zone"
                data-zone="oversold"
                x={layout.oversoldZone.x}
                y={layout.oversoldZone.y}
                width={layout.oversoldZone.width}
                height={layout.oversoldZone.height}
                fill={oversoldColor}
                fillOpacity={0.12}
              />
            </g>
          ) : null}

          {showGrid ? (
            <g
              data-section="chart-line-williams-r-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-williams-r-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.wrYTicks.map((t, i) => (
                <line
                  key={`wgy-${i}`}
                  data-section="chart-line-williams-r-grid-line"
                  data-panel="wr"
                  x1={wp.x}
                  x2={wp.x + wp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZones ? (
            <g data-section="chart-line-williams-r-levels">
              {[
                { name: 'overbought', y: layout.overboughtY, level: layout.overbought },
                { name: 'oversold', y: layout.oversoldY, level: layout.oversold },
              ].map((lv) => (
                <g
                  key={`lv-${lv.name}`}
                  data-section="chart-line-williams-r-level"
                  data-level={lv.name}
                >
                  <line
                    data-section="chart-line-williams-r-level-line"
                    data-level={lv.name}
                    x1={wp.x}
                    x2={wp.x + wp.width}
                    y1={lv.y}
                    y2={lv.y}
                    stroke={
                      lv.name === 'overbought'
                        ? overboughtColor
                        : oversoldColor
                    }
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                  <text
                    data-section="chart-line-williams-r-level-label"
                    data-level={lv.name}
                    x={wp.x + wp.width - 2}
                    y={lv.y - 3}
                    textAnchor="end"
                    fontSize={9}
                    fill={
                      lv.name === 'overbought'
                        ? overboughtColor
                        : oversoldColor
                    }
                    stroke="none"
                  >
                    {formatValue(lv.level)}
                  </text>
                </g>
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-williams-r-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: wp, name: 'wr', yt: layout.wrYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-williams-r-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-williams-r-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-williams-r-axis"
                    data-panel={cfg.name}
                    data-axis="y"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y}
                    x2={cfg.panel.x}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  {cfg.yt.map((t, i) => (
                    <g
                      key={`yt-${cfg.name}-${i}`}
                      data-section="chart-line-williams-r-tick"
                      data-panel={cfg.name}
                      data-axis="y"
                    >
                      <line
                        x1={cfg.panel.x - 4}
                        x2={cfg.panel.x}
                        y1={t.py}
                        y2={t.py}
                      />
                      <text
                        data-section="chart-line-williams-r-tick-label"
                        data-panel={cfg.name}
                        data-axis="y"
                        x={cfg.panel.x - 6}
                        y={t.py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
              <g data-section="chart-line-williams-r-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-williams-r-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={wp.y + wp.height}
                      y2={wp.y + wp.height + 4}
                    />
                    <text
                      data-section="chart-line-williams-r-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={wp.y + wp.height + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill={axisColor}
                      stroke="none"
                    >
                      {formatX(t.value)}
                    </text>
                  </g>
                ))}
              </g>
            </g>
          ) : null}

          <g data-section="chart-line-williams-r-panel-labels">
            <text
              data-section="chart-line-williams-r-panel-label"
              data-panel="price"
              x={pp.x + pp.width / 2}
              y={pp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Value
            </text>
            <text
              data-section="chart-line-williams-r-panel-label"
              data-panel="wr"
              x={wp.x + wp.width / 2}
              y={wp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Williams %R
            </text>
          </g>

          {valueVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Value line"
              data-section="chart-line-williams-r-value-path"
              d={layout.pricePath}
              fill="none"
              stroke={valueColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {valueVisible && showDots ? (
            <g data-section="chart-line-williams-r-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-williams-r-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={valueColor}
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

          {wrVisible && layout.wrPath ? (
            <path
              data-section="chart-line-williams-r-wr-line"
              d={layout.wrPath}
              fill="none"
              stroke={wrColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {wrVisible ? (
            <g data-section="chart-line-williams-r-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Williams %R at x ${formatX(m.x)}: ${formatValue(m.williamsR)} (${m.zone})`}
                    data-section="chart-line-williams-r-marker"
                    data-point-index={m.index}
                    data-williams-r={m.williamsR}
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
                  data-section="chart-line-williams-r-tooltip"
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
                  <div data-section="chart-line-williams-r-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-williams-r-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-williams-r-tooltip-wr">
                    %R:{' '}
                    {d.williamsR === null
                      ? 'n/a'
                      : formatValue(d.williamsR)}
                  </div>
                  <div data-section="chart-line-williams-r-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-williams-r-legend"
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
                data-section="chart-line-williams-r-legend-item"
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
                  data-section="chart-line-williams-r-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-williams-r-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-williams-r-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.overboughtCount} overbought, {layout.oversoldCount}{' '}
            oversold
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineWilliamsR.displayName = 'ChartLineWilliamsR';
