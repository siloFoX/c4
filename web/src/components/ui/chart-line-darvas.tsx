import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DARVAS_WIDTH = 560;
export const DEFAULT_CHART_LINE_DARVAS_HEIGHT = 360;
export const DEFAULT_CHART_LINE_DARVAS_PADDING = 40;
export const DEFAULT_CHART_LINE_DARVAS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DARVAS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DARVAS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DARVAS_CONFIRM = 3;
export const DEFAULT_CHART_LINE_DARVAS_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_DARVAS_BOX_FILL_COLOR = 'rgba(8,145,178,0.08)';
export const DEFAULT_CHART_LINE_DARVAS_BREAKOUT_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DARVAS_BREAKOUT_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DARVAS_ACTIVE_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_DARVAS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DARVAS_AXIS_COLOR = '#cbd5e1';

export type ChartLineDarvasBoxStatus = 'active' | 'broken-up' | 'broken-down';

export type ChartLineDarvasZone =
  | 'inside'
  | 'breakout-up'
  | 'breakout-down'
  | 'none';

export interface ChartLineDarvasPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineDarvasBox {
  startIndex: number;
  endIndex: number;
  top: number;
  bottom: number;
  status: ChartLineDarvasBoxStatus;
}

export interface ChartLineDarvasSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  boxIndex: number;
  zone: ChartLineDarvasZone;
}

export interface ChartLineDarvasRun {
  series: ChartLineDarvasPoint[];
  confirm: number;
  boxes: ChartLineDarvasBox[];
  samples: ChartLineDarvasSample[];
  boxCount: number;
  breakoutUpCount: number;
  breakoutDownCount: number;
  ok: boolean;
}

export interface ChartLineDarvasPriceDot {
  index: number;
  x: number;
  close: number;
  boxIndex: number;
  zone: ChartLineDarvasZone;
  px: number;
  py: number;
}

export interface ChartLineDarvasMarker {
  index: number;
  x: number;
  close: number;
  zone: ChartLineDarvasZone;
  px: number;
  py: number;
}

export interface ChartLineDarvasBoxRect {
  boxIndex: number;
  status: ChartLineDarvasBoxStatus;
  top: number;
  bottom: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineDarvasPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineDarvasLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineDarvasPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineDarvasPriceDot[];
  boxRects: ChartLineDarvasBoxRect[];
  markers: ChartLineDarvasMarker[];
  confirm: number;
  boxCount: number;
  breakoutUpCount: number;
  breakoutDownCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineDarvasLayoutOptions {
  data: readonly ChartLineDarvasPoint[];
  confirm?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineDarvasProps {
  data: readonly ChartLineDarvasPoint[];
  confirm?: number;
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
  boxFillColor?: string;
  breakoutUpColor?: string;
  breakoutDownColor?: string;
  activeColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBoxes?: boolean;
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
  onPointClick?: (payload: { point: ChartLineDarvasPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineDarvasFinitePoints(
  points: readonly ChartLineDarvasPoint[] | null | undefined,
): ChartLineDarvasPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineDarvasPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a Darvas box confirmation count to an integer of at
 * least 1 -- the number of bars a new high must hold without
 * being exceeded before the box top is locked. A non-finite or
 * sub-1 value falls back to `fallback`; a fractional value floors.
 */
export function normalizeLineDarvasConfirm(
  confirm: number,
  fallback: number,
): number {
  if (!isFiniteNumber(confirm)) return fallback;
  const c = Math.floor(confirm);
  return c < 1 ? fallback : c;
}

/**
 * Detect Darvas boxes. Walking the bars, a box top is the highest
 * high of a formation; once `confirm` bars pass with no higher
 * high, the top locks and the box bottom is fixed at the lowest
 * low recorded since the top bar. The box then runs until a bar
 * closes above the top (an upward breakout) or below the bottom
 * (a downward breakout), at which point the next formation
 * begins. A box still open at the end of the data is `active`.
 */
export function computeLineDarvasBoxes(
  bars: readonly ChartLineDarvasPoint[] | null | undefined,
  confirm: number,
): ChartLineDarvasBox[] {
  if (!Array.isArray(bars)) return [];
  const c = normalizeLineDarvasConfirm(confirm, DEFAULT_CHART_LINE_DARVAS_CONFIRM);
  const n = bars.length;
  const boxes: ChartLineDarvasBox[] = [];
  let i = 0;
  while (i < n) {
    const first = bars[i];
    if (!first) {
      i += 1;
      continue;
    }
    let topHigh = first.high;
    let topIndex = i;
    let lowLow = first.low;
    let j = i + 1;
    let confirmed = false;
    while (j < n) {
      const b = bars[j];
      if (!b) break;
      if (b.high > topHigh) {
        topHigh = b.high;
        topIndex = j;
        lowLow = b.low;
      } else if (b.low < lowLow) {
        lowLow = b.low;
      }
      if (j - topIndex >= c) {
        confirmed = true;
        break;
      }
      j += 1;
    }
    if (!confirmed) break;
    const top = topHigh;
    const bottom = lowLow;
    const startIndex = topIndex;
    let status: ChartLineDarvasBoxStatus = 'active';
    let endIndex = n - 1;
    let k = j + 1;
    while (k < n) {
      const b = bars[k];
      if (!b) {
        endIndex = k - 1;
        break;
      }
      if (b.close > top) {
        status = 'broken-up';
        endIndex = k;
        break;
      }
      if (b.close < bottom) {
        status = 'broken-down';
        endIndex = k;
        break;
      }
      k += 1;
    }
    boxes.push({ startIndex, endIndex, top, bottom, status });
    if (status === 'active') break;
    i = endIndex + 1;
  }
  return boxes;
}

export function runLineDarvas(
  points: readonly ChartLineDarvasPoint[] | null | undefined,
  options?: { confirm?: number },
): ChartLineDarvasRun {
  const finite = getLineDarvasFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const confirm = normalizeLineDarvasConfirm(
    options?.confirm ?? DEFAULT_CHART_LINE_DARVAS_CONFIRM,
    DEFAULT_CHART_LINE_DARVAS_CONFIRM,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      confirm,
      boxes: [],
      samples: [],
      boxCount: 0,
      breakoutUpCount: 0,
      breakoutDownCount: 0,
      ok: false,
    };
  }

  const boxes = computeLineDarvasBoxes(series, confirm);
  const boxOfBar = new Array<number>(n).fill(-1);
  boxes.forEach((box, bi) => {
    for (let k = box.startIndex; k <= box.endIndex && k < n; k += 1) {
      boxOfBar[k] = bi;
    }
  });

  const samples: ChartLineDarvasSample[] = series.map((p, i) => {
    const bi = boxOfBar[i] ?? -1;
    let zone: ChartLineDarvasZone = 'none';
    if (bi >= 0) {
      const box = boxes[bi]!;
      if (i === box.endIndex && box.status === 'broken-up') {
        zone = 'breakout-up';
      } else if (i === box.endIndex && box.status === 'broken-down') {
        zone = 'breakout-down';
      } else {
        zone = 'inside';
      }
    }
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      boxIndex: bi,
      zone,
    };
  });

  let breakoutUpCount = 0;
  let breakoutDownCount = 0;
  for (const box of boxes) {
    if (box.status === 'broken-up') breakoutUpCount += 1;
    else if (box.status === 'broken-down') breakoutDownCount += 1;
  }

  return {
    series = [],
    confirm,
    boxes,
    samples,
    boxCount: boxes.length,
    breakoutUpCount,
    breakoutDownCount,
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

export function computeLineDarvasLayout(
  options: ComputeLineDarvasLayoutOptions,
): ChartLineDarvasLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_DARVAS_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineDarvas(data, {
    ...(isFiniteNumber(options.confirm) ? { confirm: options.confirm } : {}),
  });

  const emptyPanel: ChartLineDarvasPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineDarvasLayout = {
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
    boxRects: [],
    markers: [],
    confirm: run.confirm,
    boxCount: 0,
    breakoutUpCount: 0,
    breakoutDownCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineDarvasPanel = {
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
  }
  for (const box of run.boxes) {
    if (box.bottom < yLo) yLo = box.bottom;
    if (box.top > yHi) yHi = box.top;
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

  const priceDots: ChartLineDarvasPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    boxIndex: s.boxIndex,
    zone: s.zone,
    px: projectX(s.x),
    py: projectY(s.close),
  }));

  const boxRects: ChartLineDarvasBoxRect[] = run.boxes.map((box, bi) => {
    const startX = projectX(run.series[box.startIndex]!.x);
    const endX = projectX(run.series[box.endIndex]!.x);
    const topY = projectY(box.top);
    const bottomY = projectY(box.bottom);
    return {
      boxIndex: bi,
      status: box.status,
      top: box.top,
      bottom: box.bottom,
      x: startX,
      y: topY,
      width: endX - startX,
      height: bottomY - topY,
    };
  });

  const markers: ChartLineDarvasMarker[] = run.samples
    .filter((s) => s.zone === 'breakout-up' || s.zone === 'breakout-down')
    .map((s) => ({
      index: s.index,
      x: s.x,
      close: s.close,
      zone: s.zone,
      px: projectX(s.x),
      py: projectY(s.close),
    }));

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
    boxRects,
    markers,
    confirm: run.confirm,
    boxCount: run.boxCount,
    breakoutUpCount: run.breakoutUpCount,
    breakoutDownCount: run.breakoutDownCount,
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

export function describeLineDarvasChart(
  data: readonly ChartLineDarvasPoint[] | null | undefined,
  options?: { confirm?: number },
): string {
  const run = runLineDarvas(data, options);
  if (!run.ok) return 'No data';
  return `Single-panel line chart with Darvas Boxes (confirm ${run.confirm}): the price line is overlaid with consolidation boxes. A box top is a new high that holds for ${run.confirm} bars without being exceeded; the box bottom is the lowest low recorded while the top forms. Each box is a fixed rectangle that ends when the price closes above its top -- an upward breakout -- or below its bottom, a downward breakout. The chart found ${run.boxCount} boxes, ${run.breakoutUpCount} ending on an upward breakout and ${run.breakoutDownCount} on a downward breakout across ${run.samples.length} bars.`;
}

const DARVAS_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineDarvas = forwardRef<
  HTMLDivElement,
  ChartLineDarvasProps
>(function ChartLineDarvas(
  props: ChartLineDarvasProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    confirm,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_DARVAS_WIDTH,
    height = DEFAULT_CHART_LINE_DARVAS_HEIGHT,
    padding = DEFAULT_CHART_LINE_DARVAS_PADDING,
    tickCount = DEFAULT_CHART_LINE_DARVAS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DARVAS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DARVAS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DARVAS_PRICE_COLOR,
    boxFillColor = DEFAULT_CHART_LINE_DARVAS_BOX_FILL_COLOR,
    breakoutUpColor = DEFAULT_CHART_LINE_DARVAS_BREAKOUT_UP_COLOR,
    breakoutDownColor = DEFAULT_CHART_LINE_DARVAS_BREAKOUT_DOWN_COLOR,
    activeColor = DEFAULT_CHART_LINE_DARVAS_ACTIVE_COLOR,
    gridColor = DEFAULT_CHART_LINE_DARVAS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_DARVAS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBoxes = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Darvas Box overlay',
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
      computeLineDarvasLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(confirm) ? { confirm } : {}),
      }),
    [data, width, height, padding, tickCount, confirm],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineDarvasChart(data, {
        ...(isFiniteNumber(confirm) ? { confirm } : {}),
      }),
    [ariaDescription, data, confirm],
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
        data-section="chart-line-darvas"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-darvas-aria-desc"
          style={DARVAS_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const panel = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const boxesVisible = showBoxes && !hiddenSet.has('boxes');

  const statusColor = (status: ChartLineDarvasBoxStatus): string => {
    if (status === 'broken-up') return breakoutUpColor;
    if (status === 'broken-down') return breakoutDownColor;
    return activeColor;
  };

  const zoneColor = (zone: ChartLineDarvasZone): string => {
    if (zone === 'breakout-up') return breakoutUpColor;
    if (zone === 'breakout-down') return breakoutDownColor;
    return activeColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'boxes', label: 'Boxes', color: activeColor },
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
      data-section="chart-line-darvas"
      data-empty="false"
      data-confirm={layout.confirm}
      data-box-count={layout.boxCount}
      data-breakout-up-count={layout.breakoutUpCount}
      data-breakout-down-count={layout.breakoutDownCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-darvas-aria-desc"
        style={DARVAS_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-darvas-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-darvas-badge"
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
              data-section="chart-line-darvas-badge-icon"
              aria-hidden="true"
              style={{ color: activeColor }}
            >
              DARVAS
            </span>
            <span data-section="chart-line-darvas-badge-config">
              {layout.confirm}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-darvas-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-darvas-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-darvas-grid-line"
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
              data-section="chart-line-darvas-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-darvas-axis"
                data-axis="y"
                x1={panel.x}
                y1={panel.y}
                x2={panel.x}
                y2={panel.y + panel.height}
              />
              <line
                data-section="chart-line-darvas-axis"
                data-axis="x"
                x1={panel.x}
                y1={panel.y + panel.height}
                x2={panel.x + panel.width}
                y2={panel.y + panel.height}
              />
              {layout.yTicks.map((t, i) => (
                <text
                  key={`yt-${i}`}
                  data-section="chart-line-darvas-tick-label"
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
                  data-section="chart-line-darvas-tick-label"
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

          {boxesVisible ? (
            <g data-section="chart-line-darvas-boxes">
              {layout.boxRects.map((box) => (
                <rect
                  key={`box-${box.boxIndex}`}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Darvas box ${box.boxIndex + 1}: top ${formatValue(box.top)}, bottom ${formatValue(box.bottom)}, ${box.status}`}
                  data-section="chart-line-darvas-box"
                  data-box-index={box.boxIndex}
                  data-status={box.status}
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill={boxFillColor}
                  stroke={statusColor(box.status)}
                  strokeWidth={1.25}
                />
              ))}
            </g>
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-darvas-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-darvas-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-darvas-dot"
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
            <g data-section="chart-line-darvas-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${m.index + 1} at x ${formatX(m.x)}: ${m.zone}`}
                    data-section="chart-line-darvas-marker"
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
              const box =
                d.boxIndex >= 0 ? layout.boxRects[d.boxIndex] : undefined;
              return (
                <div
                  data-section="chart-line-darvas-tooltip"
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
                  <div data-section="chart-line-darvas-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-darvas-tooltip-close"
                    style={{ fontWeight: 600 }}
                  >
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-darvas-tooltip-box">
                    box:{' '}
                    {box
                      ? `${formatValue(box.bottom)} - ${formatValue(box.top)}`
                      : 'n/a'}
                  </div>
                  <div data-section="chart-line-darvas-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-darvas-legend"
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
                data-section="chart-line-darvas-legend-item"
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
                  data-section="chart-line-darvas-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-darvas-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-darvas-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.boxCount} boxes, {layout.breakoutUpCount} up,{' '}
            {layout.breakoutDownCount} down
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDarvas.displayName = 'ChartLineDarvas';
