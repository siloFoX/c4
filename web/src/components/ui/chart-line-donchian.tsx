import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH = 560;
export const DEFAULT_CHART_LINE_DONCHIAN_HEIGHT = 360;
export const DEFAULT_CHART_LINE_DONCHIAN_PADDING = 40;
export const DEFAULT_CHART_LINE_DONCHIAN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DONCHIAN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DONCHIAN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DONCHIAN_PERIOD = 20;
export const DEFAULT_CHART_LINE_DONCHIAN_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_DONCHIAN_CHANNEL_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_DONCHIAN_MIDDLE_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_DONCHIAN_FILL_COLOR = 'rgba(8,145,178,0.10)';
export const DEFAULT_CHART_LINE_DONCHIAN_UPPER_ZONE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DONCHIAN_LOWER_ZONE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DONCHIAN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DONCHIAN_AXIS_COLOR = '#cbd5e1';

export type ChartLineDonchianZone = 'upper' | 'lower' | 'mid' | 'none';

export interface ChartLineDonchianPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineDonchianSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  upper: number | null;
  lower: number | null;
  middle: number | null;
  zone: ChartLineDonchianZone;
}

export interface ChartLineDonchianRun {
  series: ChartLineDonchianPoint[];
  period: number;
  upper: (number | null)[];
  lower: (number | null)[];
  middle: (number | null)[];
  samples: ChartLineDonchianSample[];
  upperFinal: number;
  lowerFinal: number;
  middleFinal: number;
  upperCount: number;
  lowerCount: number;
  midCount: number;
  ok: boolean;
}

export interface ChartLineDonchianPriceDot {
  index: number;
  x: number;
  close: number;
  upper: number | null;
  lower: number | null;
  middle: number | null;
  zone: ChartLineDonchianZone;
  px: number;
  py: number;
}

export interface ChartLineDonchianMarker {
  index: number;
  x: number;
  close: number;
  zone: ChartLineDonchianZone;
  px: number;
  py: number;
}

export interface ChartLineDonchianPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineDonchianLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineDonchianPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineDonchianPriceDot[];
  upperPath: string;
  lowerPath: string;
  middlePath: string;
  channelArea: string;
  markers: ChartLineDonchianMarker[];
  period: number;
  upperFinal: number;
  lowerFinal: number;
  middleFinal: number;
  upperCount: number;
  lowerCount: number;
  midCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineDonchianLayoutOptions {
  data: readonly ChartLineDonchianPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineDonchianProps {
  data: readonly ChartLineDonchianPoint[];
  period?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  channelColor?: string;
  middleColor?: string;
  fillColor?: string;
  upperZoneColor?: string;
  lowerZoneColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showChannel?: boolean;
  showMiddle?: boolean;
  showChannelFill?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineDonchianPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineDonchianFinitePoints(
  points: readonly ChartLineDonchianPoint[] | null | undefined,
): ChartLineDonchianPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineDonchianPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a Donchian Channel lookback to an integer of at least 2.
 * A non-finite or sub-2 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineDonchianPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * The Donchian upper band -- the highest high over each trailing
 * window of `period` bars. Bars before the window is full are
 * null.
 */
export function computeLineDonchianUpper(
  bars: readonly ChartLineDonchianPoint[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const p = normalizeLineDonchianPeriod(
    period,
    DEFAULT_CHART_LINE_DONCHIAN_PERIOD,
  );
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let mx = Number.NEGATIVE_INFINITY;
    let valid = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const b = bars[k];
      if (!b || !isFiniteNumber(b.high)) {
        valid = false;
        break;
      }
      if (b.high > mx) mx = b.high;
    }
    if (valid) out[i] = mx;
  }
  return out;
}

/**
 * The Donchian lower band -- the lowest low over each trailing
 * window of `period` bars. Bars before the window is full are
 * null.
 */
export function computeLineDonchianLower(
  bars: readonly ChartLineDonchianPoint[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const p = normalizeLineDonchianPeriod(
    period,
    DEFAULT_CHART_LINE_DONCHIAN_PERIOD,
  );
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let mn = Number.POSITIVE_INFINITY;
    let valid = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const b = bars[k];
      if (!b || !isFiniteNumber(b.low)) {
        valid = false;
        break;
      }
      if (b.low < mn) mn = b.low;
    }
    if (valid) out[i] = mn;
  }
  return out;
}

/**
 * The Donchian middle band -- the midpoint of the upper and lower
 * bands.
 */
export function computeLineDonchianMiddle(
  bars: readonly ChartLineDonchianPoint[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const upper = computeLineDonchianUpper(bars, period);
  const lower = computeLineDonchianLower(bars, period);
  const n = upper.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const u = upper[i];
    const l = lower[i];
    if (isFiniteNumber(u) && isFiniteNumber(l)) out[i] = (u + l) / 2;
  }
  return out;
}

function classifyZone(
  close: number,
  middle: number | null,
): ChartLineDonchianZone {
  if (middle === null) return 'none';
  if (close > middle) return 'upper';
  if (close < middle) return 'lower';
  return 'mid';
}

export function runLineDonchian(
  points: readonly ChartLineDonchianPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineDonchianRun {
  const finite = getLineDonchianFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineDonchianPeriod(
    options?.period ?? DEFAULT_CHART_LINE_DONCHIAN_PERIOD,
    DEFAULT_CHART_LINE_DONCHIAN_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      upper: [],
      lower: [],
      middle: [],
      samples: [],
      upperFinal: NaN,
      lowerFinal: NaN,
      middleFinal: NaN,
      upperCount: 0,
      lowerCount: 0,
      midCount: 0,
      ok: false,
    };
  }

  const upper = computeLineDonchianUpper(series, period);
  const lower = computeLineDonchianLower(series, period);
  const middle = computeLineDonchianMiddle(series, period);

  const samples: ChartLineDonchianSample[] = series.map((p, i) => {
    const m = middle[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      upper: upper[i] ?? null,
      lower: lower[i] ?? null,
      middle: m,
      zone: classifyZone(p.close, m),
    };
  });

  let upperCount = 0;
  let lowerCount = 0;
  let midCount = 0;
  let upperFinal = NaN;
  let lowerFinal = NaN;
  let middleFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'upper') upperCount += 1;
    else if (s.zone === 'lower') lowerCount += 1;
    else if (s.zone === 'mid') midCount += 1;
    if (s.upper !== null) upperFinal = s.upper;
    if (s.lower !== null) lowerFinal = s.lower;
    if (s.middle !== null) middleFinal = s.middle;
  }

  return {
    series,
    period,
    upper,
    lower,
    middle,
    samples,
    upperFinal,
    lowerFinal,
    middleFinal,
    upperCount,
    lowerCount,
    midCount,
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

export function computeLineDonchianLayout(
  options: ComputeLineDonchianLayoutOptions,
): ChartLineDonchianLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_DONCHIAN_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineDonchian(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineDonchianPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineDonchianLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    priceDots: [],
    upperPath: '',
    lowerPath: '',
    middlePath: '',
    channelArea: '',
    markers: [],
    period: run.period,
    upperFinal: NaN,
    lowerFinal: NaN,
    middleFinal: NaN,
    upperCount: 0,
    lowerCount: 0,
    midCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineDonchianPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < yLo) yLo = s.close;
    if (s.close > yHi) yHi = s.close;
    if (s.upper !== null) {
      if (s.upper < yLo) yLo = s.upper;
      if (s.upper > yHi) yHi = s.upper;
    }
    if (s.lower !== null) {
      if (s.lower < yLo) yLo = s.lower;
      if (s.lower > yHi) yHi = s.lower;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLineDonchianPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    upper: s.upper,
    lower: s.lower,
    middle: s.middle,
    zone: s.zone,
    px: projectX(s.x),
    py: projectY(s.close),
  }));

  const upperPts: { px: number; py: number }[] = [];
  const lowerPts: { px: number; py: number }[] = [];
  const middlePts: { px: number; py: number }[] = [];
  const markers: ChartLineDonchianMarker[] = [];
  for (const s of run.samples) {
    if (s.upper !== null) {
      upperPts.push({ px: projectX(s.x), py: projectY(s.upper) });
    }
    if (s.lower !== null) {
      lowerPts.push({ px: projectX(s.x), py: projectY(s.lower) });
    }
    if (s.middle !== null) {
      middlePts.push({ px: projectX(s.x), py: projectY(s.middle) });
    }
    if (s.zone !== 'none') {
      markers.push({
        index: s.index,
        x: s.x,
        close: s.close,
        zone: s.zone,
        px: projectX(s.x),
        py: projectY(s.close),
      });
    }
  }

  let channelArea = '';
  if (upperPts.length > 0 && lowerPts.length === upperPts.length) {
    const parts: string[] = [];
    for (let i = 0; i < upperPts.length; i += 1) {
      const p = upperPts[i]!;
      parts.push(
        `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`,
      );
    }
    for (let i = lowerPts.length - 1; i >= 0; i -= 1) {
      const p = lowerPts[i]!;
      parts.push(`L ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
    }
    parts.push('Z');
    channelArea = parts.join(' ');
  }

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    upperPath: buildPath(upperPts),
    lowerPath: buildPath(lowerPts),
    middlePath: buildPath(middlePts),
    channelArea,
    markers,
    period: run.period,
    upperFinal: run.upperFinal,
    lowerFinal: run.lowerFinal,
    middleFinal: run.middleFinal,
    upperCount: run.upperCount,
    lowerCount: run.lowerCount,
    midCount: run.midCount,
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

export function describeLineDonchianChart(
  data: readonly ChartLineDonchianPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineDonchian(data, options);
  if (!run.ok) return 'No data';
  return `Single-panel line chart with a Donchian Channel (period ${run.period}): the price line is overlaid with the channel. The upper band is the highest high of the last ${run.period} bars, the lower band the lowest low, and the middle band their midpoint. The channel frames the price's recent range -- the bands widen as the range expands and a flat band marks a quiet market. The close sits in the upper half of the channel on ${run.upperCount} bars, the lower half on ${run.lowerCount} and on the midline on ${run.midCount} across ${run.samples.length} bars.`;
}

const DONCHIAN_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineDonchian = forwardRef<
  HTMLDivElement,
  ChartLineDonchianProps
>(function ChartLineDonchian(
  props: ChartLineDonchianProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_DONCHIAN_WIDTH,
    height = DEFAULT_CHART_LINE_DONCHIAN_HEIGHT,
    padding = DEFAULT_CHART_LINE_DONCHIAN_PADDING,
    tickCount = DEFAULT_CHART_LINE_DONCHIAN_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DONCHIAN_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DONCHIAN_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DONCHIAN_PRICE_COLOR,
    channelColor = DEFAULT_CHART_LINE_DONCHIAN_CHANNEL_COLOR,
    middleColor = DEFAULT_CHART_LINE_DONCHIAN_MIDDLE_COLOR,
    fillColor = DEFAULT_CHART_LINE_DONCHIAN_FILL_COLOR,
    upperZoneColor = DEFAULT_CHART_LINE_DONCHIAN_UPPER_ZONE_COLOR,
    lowerZoneColor = DEFAULT_CHART_LINE_DONCHIAN_LOWER_ZONE_COLOR,
    gridColor = DEFAULT_CHART_LINE_DONCHIAN_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_DONCHIAN_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showChannel = true,
    showMiddle = true,
    showChannelFill = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Donchian Channel overlay',
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
      computeLineDonchianLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(period) ? { period } : {}),
      }),
    [data, width, height, padding, tickCount, period],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineDonchianChart(data, {
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
        data-section="chart-line-donchian"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-donchian-aria-desc"
          style={DONCHIAN_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const panel = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const channelVisible = showChannel && !hiddenSet.has('channel');
  const middleVisible = showMiddle && !hiddenSet.has('middle');

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const zoneColor = (zone: ChartLineDonchianZone): string => {
    if (zone === 'upper') return upperZoneColor;
    if (zone === 'lower') return lowerZoneColor;
    return middleColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'channel', label: 'Channel', color: channelColor },
    { id: 'middle', label: 'Middle', color: middleColor },
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
      data-section="chart-line-donchian"
      data-empty="false"
      data-period={layout.period}
      data-upper-final={layout.upperFinal}
      data-lower-final={layout.lowerFinal}
      data-middle-final={layout.middleFinal}
      data-upper-count={layout.upperCount}
      data-lower-count={layout.lowerCount}
      data-mid-count={layout.midCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-donchian-aria-desc"
        style={DONCHIAN_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-donchian-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-donchian-badge"
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
              data-section="chart-line-donchian-badge-icon"
              aria-hidden="true"
              style={{ color: channelColor }}
            >
              DC
            </span>
            <span data-section="chart-line-donchian-badge-config">
              {layout.period}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-donchian-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-donchian-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-donchian-grid-line"
                  x1={panel.x}
                  x2={panel.x + panel.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-donchian-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-donchian-axis"
                data-axis="y"
                x1={panel.x}
                y1={panel.y}
                x2={panel.x}
                y2={panel.y + panel.height}
              />
              <line
                data-section="chart-line-donchian-axis"
                data-axis="x"
                x1={panel.x}
                y1={panel.y + panel.height}
                x2={panel.x + panel.width}
                y2={panel.y + panel.height}
              />
              {layout.yTicks.map((t, i) => (
                <text
                  key={`yt-${i}`}
                  data-section="chart-line-donchian-tick-label"
                  data-axis="y"
                  x={panel.x - 6}
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
                  data-section="chart-line-donchian-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={panel.y + panel.height + 14}
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

          {channelVisible && showChannelFill && layout.channelArea ? (
            <path
              data-section="chart-line-donchian-channel-area"
              d={layout.channelArea}
              fill={fillColor}
              stroke="none"
            />
          ) : null}

          {channelVisible && layout.upperPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Donchian upper band"
              data-section="chart-line-donchian-upper-path"
              d={layout.upperPath}
              fill="none"
              stroke={channelColor}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {channelVisible && layout.lowerPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Donchian lower band"
              data-section="chart-line-donchian-lower-path"
              d={layout.lowerPath}
              fill="none"
              stroke={channelColor}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {middleVisible && layout.middlePath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Donchian middle band"
              data-section="chart-line-donchian-middle-path"
              d={layout.middlePath}
              fill="none"
              stroke={middleColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-donchian-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-donchian-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-donchian-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-close={d.close}
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

          {priceVisible && showMarkers ? (
            <g data-section="chart-line-donchian-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${m.index + 1} at x ${formatX(m.x)}: close ${formatValue(m.close)}, ${m.zone} half`}
                    data-section="chart-line-donchian-marker"
                    data-point-index={m.index}
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
                  data-section="chart-line-donchian-tooltip"
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
                  <div data-section="chart-line-donchian-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-donchian-tooltip-close"
                    style={{ fontWeight: 600 }}
                  >
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-donchian-tooltip-upper">
                    upper: {fmtNullable(d.upper)}
                  </div>
                  <div data-section="chart-line-donchian-tooltip-lower">
                    lower: {fmtNullable(d.lower)}
                  </div>
                  <div data-section="chart-line-donchian-tooltip-middle">
                    middle: {fmtNullable(d.middle)}
                  </div>
                  <div data-section="chart-line-donchian-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-donchian-legend"
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
                data-section="chart-line-donchian-legend-item"
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
                  data-section="chart-line-donchian-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-donchian-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-donchian-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.upperCount} upper, {layout.lowerCount} lower,{' '}
            {layout.midCount} mid
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDonchian.displayName = 'ChartLineDonchian';
