import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_RENKO_WIDTH = 560;
export const DEFAULT_CHART_LINE_RENKO_HEIGHT = 320;
export const DEFAULT_CHART_LINE_RENKO_PADDING = 40;
export const DEFAULT_CHART_LINE_RENKO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RENKO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RENKO_BRICK_SIZE = 1;
export const DEFAULT_CHART_LINE_RENKO_BRICK_GAP = 2;
export const DEFAULT_CHART_LINE_RENKO_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RENKO_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RENKO_TREND_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_RENKO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RENKO_AXIS_COLOR = '#cbd5e1';

export type ChartLineRenkoDirection = 'up' | 'down';

export interface ChartLineRenkoPoint {
  x: number;
  value: number;
}

export interface ChartLineRenkoBrick {
  index: number;
  sourceIndex: number;
  direction: ChartLineRenkoDirection;
  open: number;
  close: number;
}

export interface ChartLineRenkoRun {
  series: ChartLineRenkoPoint[];
  brickSize: number;
  bricks: ChartLineRenkoBrick[];
  upCount: number;
  downCount: number;
  priceMin: number;
  priceMax: number;
  lastClose: number;
  ok: boolean;
}

export interface ChartLineRenkoRect {
  index: number;
  sourceIndex: number;
  direction: ChartLineRenkoDirection;
  open: number;
  close: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  closeY: number;
}

export interface ChartLineRenkoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineRenkoLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineRenkoPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  yMin: number;
  yMax: number;
  brickCount: number;
  rects: ChartLineRenkoRect[];
  trendPath: string;
  brickSize: number;
  upCount: number;
  downCount: number;
  lastClose: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineRenkoLayoutOptions {
  data: readonly ChartLineRenkoPoint[];
  brickSize?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  brickGap?: number;
}

export interface ChartLineRenkoProps {
  data: readonly ChartLineRenkoPoint[];
  brickSize?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  brickGap?: number;
  upColor?: string;
  downColor?: string;
  trendColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showTrend?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onBrickClick?: (payload: { brick: ChartLineRenkoRect }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function noNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}

export function getLineRenkoFinitePoints(
  points: readonly ChartLineRenkoPoint[] | null | undefined,
): ChartLineRenkoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineRenkoPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Renko brick size to a positive finite number. A
 * non-finite or non-positive value falls back to `fallback`.
 */
export function normalizeLineRenkoBrickSize(
  size: number,
  fallback: number,
): number {
  if (isFiniteNumber(size) && size > 0) return size;
  return fallback;
}

/**
 * The Renko brick transform. The price series is walked from the
 * first value; a brick forms only when the price has moved a full
 * `brickSize` from the last brick boundary. An up move emits up
 * bricks, a down move emits down bricks, and a single large move
 * emits several bricks at once. Time and sub-brick wiggles are
 * discarded -- the chart advances only on fixed price moves.
 */
export function computeLineRenkoBricks(
  values: readonly number[] | null | undefined,
  brickSize: number,
): ChartLineRenkoBrick[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  if (!isFiniteNumber(brickSize) || brickSize <= 0) return [];
  if (!isFiniteNumber(values[0])) return [];
  const bricks: ChartLineRenkoBrick[] = [];
  let level = values[0]!;
  for (let i = 1; i < values.length; i += 1) {
    const p = values[i]!;
    if (!isFiniteNumber(p)) continue;
    while (p >= level + brickSize) {
      const close = level + brickSize;
      bricks.push({
        index: bricks.length,
        sourceIndex: i,
        direction: 'up',
        open: noNegativeZero(level),
        close: noNegativeZero(close),
      });
      level = close;
    }
    while (p <= level - brickSize) {
      const close = level - brickSize;
      bricks.push({
        index: bricks.length,
        sourceIndex: i,
        direction: 'down',
        open: noNegativeZero(level),
        close: noNegativeZero(close),
      });
      level = close;
    }
  }
  return bricks;
}

export function runLineRenko(
  points: readonly ChartLineRenkoPoint[] | null | undefined,
  options?: { brickSize?: number },
): ChartLineRenkoRun {
  const finite = getLineRenkoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const brickSize = normalizeLineRenkoBrickSize(
    options?.brickSize ?? DEFAULT_CHART_LINE_RENKO_BRICK_SIZE,
    DEFAULT_CHART_LINE_RENKO_BRICK_SIZE,
  );
  const bricks = computeLineRenkoBricks(
    series.map((p) => p.value),
    brickSize,
  );

  if (bricks.length === 0) {
    return {
      series,
      brickSize,
      bricks: [],
      upCount: 0,
      downCount: 0,
      priceMin: NaN,
      priceMax: NaN,
      lastClose: NaN,
      ok: false,
    };
  }

  let upCount = 0;
  let downCount = 0;
  let priceMin = Number.POSITIVE_INFINITY;
  let priceMax = Number.NEGATIVE_INFINITY;
  for (const b of bricks) {
    if (b.direction === 'up') upCount += 1;
    else downCount += 1;
    priceMin = Math.min(priceMin, b.open, b.close);
    priceMax = Math.max(priceMax, b.open, b.close);
  }

  return {
    series,
    brickSize,
    bricks,
    upCount,
    downCount,
    priceMin,
    priceMax,
    lastClose: bricks[bricks.length - 1]!.close,
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
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) {
    return isFiniteNumber(min) ? [min] : [];
  }
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineRenkoLayout(
  options: ComputeLineRenkoLayoutOptions,
): ChartLineRenkoLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_RENKO_TICK_COUNT,
    brickGap = DEFAULT_CHART_LINE_RENKO_BRICK_GAP,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineRenkoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineRenko(data, {
    ...(isFiniteNumber(options.brickSize)
      ? { brickSize: options.brickSize }
      : {}),
  });
  const empty: ChartLineRenkoLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    yMin: 0,
    yMax: 0,
    brickCount: 0,
    rects: [],
    trendPath: '',
    brickSize: run.brickSize,
    upCount: 0,
    downCount: 0,
    lastClose: NaN,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineRenkoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let yLo = run.priceMin;
  let yHi = run.priceMax;
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }
  const yRange = yHi - yLo;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const brickCount = run.bricks.length;
  const colWidth = panel.width / brickCount;
  const gap = Math.min(brickGap, colWidth * 0.4);

  const rects: ChartLineRenkoRect[] = run.bricks.map((b, i) => {
    const lo = Math.min(b.open, b.close);
    const hi = Math.max(b.open, b.close);
    const top = projectY(hi);
    const bottom = projectY(lo);
    const cx = panel.x + i * colWidth + colWidth / 2;
    return {
      index: i,
      sourceIndex: b.sourceIndex,
      direction: b.direction,
      open: b.open,
      close: b.close,
      x: panel.x + i * colWidth + gap / 2,
      y: top,
      width: Math.max(0, colWidth - gap),
      height: Math.max(0, bottom - top),
      cx,
      closeY: projectY(b.close),
    };
  });

  const xTicks = computeTicks(0, brickCount - 1, Math.min(tickCount, brickCount))
    .map((v) => {
      const i = Math.round(v);
      return {
        value: i,
        px: panel.x + i * colWidth + colWidth / 2,
      };
    });

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks,
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    yMin: yLo,
    yMax: yHi,
    brickCount,
    rects,
    trendPath: buildPath(rects.map((r) => ({ px: r.cx, py: r.closeY }))),
    brickSize: run.brickSize,
    upCount: run.upCount,
    downCount: run.downCount,
    lastClose: run.lastClose,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineRenkoChart(
  data: readonly ChartLineRenkoPoint[] | null | undefined,
  options?: { brickSize?: number },
): string {
  const run = runLineRenko(data, options);
  if (!run.ok) return 'No data';
  return `Renko brick chart (brick size ${defaultFormatValue(run.brickSize)}): the price series is transformed into a row of fixed-size bricks, each advancing only when the price moves a full brick size -- time and sub-brick noise are discarded. An up brick is added for every brick-size rise and a down brick for every brick-size fall. The chart carries ${run.bricks.length} bricks (${run.upCount} up, ${run.downCount} down) spanning the price range ${defaultFormatValue(run.priceMin)} to ${defaultFormatValue(run.priceMax)}.`;
}

const RENKO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineRenko = forwardRef<HTMLDivElement, ChartLineRenkoProps>(
  function ChartLineRenko(
    props: ChartLineRenkoProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      brickSize,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_RENKO_WIDTH,
      height = DEFAULT_CHART_LINE_RENKO_HEIGHT,
      padding = DEFAULT_CHART_LINE_RENKO_PADDING,
      tickCount = DEFAULT_CHART_LINE_RENKO_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_RENKO_STROKE_WIDTH,
      brickGap = DEFAULT_CHART_LINE_RENKO_BRICK_GAP,
      upColor = DEFAULT_CHART_LINE_RENKO_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_RENKO_DOWN_COLOR,
      trendColor = DEFAULT_CHART_LINE_RENKO_TREND_COLOR,
      gridColor = DEFAULT_CHART_LINE_RENKO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_RENKO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showTrend = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Renko brick chart',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      onBrickClick,
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
        computeLineRenkoLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          brickGap,
          ...(isFiniteNumber(brickSize) ? { brickSize } : {}),
        }),
      [data, width, height, padding, tickCount, brickGap, brickSize],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineRenkoChart(data, {
          ...(isFiniteNumber(brickSize) ? { brickSize } : {}),
        }),
      [ariaDescription, data, brickSize],
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
          data-section="chart-line-renko"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-renko-aria-desc"
            style={RENKO_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const upVisible = !hiddenSet.has('up');
    const downVisible = !hiddenSet.has('down');
    const trendVisible = showTrend && !hiddenSet.has('trend');

    const visibleRects = layout.rects.filter((r) =>
      r.direction === 'up' ? upVisible : downVisible,
    );

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'up', label: 'Up brick', color: upColor },
      { id: 'down', label: 'Down brick', color: downColor },
      { id: 'trend', label: 'Trend', color: trendColor },
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
        data-section="chart-line-renko"
        data-empty="false"
        data-brick-size={layout.brickSize}
        data-brick-count={layout.brickCount}
        data-up-count={layout.upCount}
        data-down-count={layout.downCount}
        data-last-close={layout.lastClose}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-renko-aria-desc"
          style={RENKO_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-renko-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-renko-badge"
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
                data-section="chart-line-renko-badge-icon"
                aria-hidden="true"
                style={{ color: upColor }}
              >
                RENKO
              </span>
              <span data-section="chart-line-renko-badge-brick">
                b={formatValue(layout.brickSize)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-renko-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-renko-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-renko-grid-line"
                    x1={cp.x}
                    x2={cp.x + cp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-renko-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-renko-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-renko-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-renko-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-renko-tick-label"
                      data-axis="y"
                      x={cp.x - 6}
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
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`xt-${i}`}
                    data-section="chart-line-renko-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-renko-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={cp.y + cp.height + 14}
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
            ) : null}

            <g data-section="chart-line-renko-bricks">
              {visibleRects.map((r) => {
                const isHover = hoverIndex === r.index;
                const color = r.direction === 'up' ? upColor : downColor;
                return (
                  <rect
                    key={`brick-${r.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Renko brick ${r.index + 1}, ${r.direction}, open ${formatValue(r.open)}, close ${formatValue(r.close)}`}
                    data-section="chart-line-renko-brick"
                    data-brick-index={r.index}
                    data-direction={r.direction}
                    data-open={r.open}
                    data-close={r.close}
                    x={r.x}
                    y={r.y}
                    width={r.width}
                    height={r.height}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={isHover ? 2 : 1}
                    onMouseEnter={() => {
                      setHoverIndex(r.index);
                      setTooltipPos({ px: r.cx, py: r.y });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(r.index);
                      setTooltipPos({ px: r.cx, py: r.y });
                    }}
                    onBlur={clearHover}
                    onClick={() => onBrickClick?.({ brick: r })}
                  />
                );
              })}
            </g>

            {trendVisible && layout.trendPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Renko trend line"
                data-section="chart-line-renko-trend-line"
                d={layout.trendPath}
                fill="none"
                stroke={trendColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const r = layout.rects.find((x) => x.index === hoverIndex);
                if (!r) return null;
                return (
                  <div
                    data-section="chart-line-renko-tooltip"
                    data-brick-index={r.index}
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
                    <div data-section="chart-line-renko-tooltip-index">
                      brick: {r.index + 1}
                    </div>
                    <div
                      data-section="chart-line-renko-tooltip-direction"
                      style={{ fontWeight: 600 }}
                    >
                      direction: {r.direction}
                    </div>
                    <div data-section="chart-line-renko-tooltip-open">
                      open: {formatValue(r.open)}
                    </div>
                    <div data-section="chart-line-renko-tooltip-close">
                      close: {formatValue(r.close)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-renko-legend"
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
                  data-section="chart-line-renko-legend-item"
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
                    data-section="chart-line-renko-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-renko-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-renko-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.upCount} up, {layout.downCount} down
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineRenko.displayName = 'ChartLineRenko';
