import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_KAGI_WIDTH = 560;
export const DEFAULT_CHART_LINE_KAGI_HEIGHT = 320;
export const DEFAULT_CHART_LINE_KAGI_PADDING = 40;
export const DEFAULT_CHART_LINE_KAGI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KAGI_REVERSAL = 1;
export const DEFAULT_CHART_LINE_KAGI_THIN_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_KAGI_THICK_WIDTH = 4;
export const DEFAULT_CHART_LINE_KAGI_THIN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KAGI_THICK_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KAGI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KAGI_AXIS_COLOR = '#cbd5e1';

export type ChartLineKagiDirection = 'up' | 'down';

export type ChartLineKagiThickness = 'thin' | 'thick';

export interface ChartLineKagiPoint {
  x: number;
  value: number;
}

export interface ChartLineKagiSegment {
  index: number;
  fromValue: number;
  toValue: number;
  direction: ChartLineKagiDirection;
  thickness: ChartLineKagiThickness;
}

export interface ChartLineKagiRun {
  series: ChartLineKagiPoint[];
  reversalAmount: number;
  turns: number[];
  segments: ChartLineKagiSegment[];
  upCount: number;
  downCount: number;
  thinCount: number;
  thickCount: number;
  ok: boolean;
}

export interface ChartLineKagiSegmentLine {
  index: number;
  direction: ChartLineKagiDirection;
  thickness: ChartLineKagiThickness;
  fromValue: number;
  toValue: number;
  cx: number;
  fromY: number;
  toY: number;
  path: string;
}

export interface ChartLineKagiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineKagiLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineKagiPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  yMin: number;
  yMax: number;
  segmentCount: number;
  segmentLines: ChartLineKagiSegmentLine[];
  reversalAmount: number;
  upCount: number;
  downCount: number;
  thinCount: number;
  thickCount: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineKagiLayoutOptions {
  data: readonly ChartLineKagiPoint[];
  reversalAmount?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineKagiProps {
  data: readonly ChartLineKagiPoint[];
  reversalAmount?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  thinWidth?: number;
  thickWidth?: number;
  thinColor?: string;
  thickColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onSegmentClick?: (payload: { segment: ChartLineKagiSegmentLine }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineKagiFinitePoints(
  points: readonly ChartLineKagiPoint[] | null | undefined,
): ChartLineKagiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineKagiPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Kagi reversal amount to a positive finite number. A
 * non-finite or non-positive value falls back to `fallback`.
 */
export function normalizeLineKagiReversal(
  amount: number,
  fallback: number,
): number {
  if (isFiniteNumber(amount) && amount > 0) return amount;
  return fallback;
}

/**
 * The Kagi turning points. The line starts at the first price and
 * extends with the price while it advances; it reverses direction
 * only when the price moves back by at least `reversalAmount` from
 * the current segment extreme. The returned array is the sequence of
 * vertices -- the start, then each reversal price. The last entry is
 * the live extreme of the final segment. If the price never moves a
 * full reversal amount the array is a single starting vertex.
 */
export function computeLineKagiTurns(
  values: readonly number[] | null | undefined,
  reversalAmount: number,
): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  if (!isFiniteNumber(reversalAmount) || reversalAmount <= 0) return [];
  if (!isFiniteNumber(values[0])) return [];
  const turns: number[] = [values[0]!];
  let direction = 0;
  for (let i = 1; i < values.length; i += 1) {
    const p = values[i]!;
    if (!isFiniteNumber(p)) continue;
    const last = turns.length - 1;
    if (direction === 0) {
      if (p - turns[0]! >= reversalAmount) {
        direction = 1;
        turns.push(p);
      } else if (turns[0]! - p >= reversalAmount) {
        direction = -1;
        turns.push(p);
      }
    } else if (direction === 1) {
      const top = turns[last]!;
      if (p > top) turns[last] = p;
      else if (top - p >= reversalAmount) {
        direction = -1;
        turns.push(p);
      }
    } else {
      const bottom = turns[last]!;
      if (p < bottom) turns[last] = p;
      else if (p - bottom >= reversalAmount) {
        direction = 1;
        turns.push(p);
      }
    }
  }
  return turns;
}

/**
 * Derive Kagi segments from the turning points. Each segment runs
 * between two consecutive vertices and is `up` or `down`. The line's
 * thickness is a persistent state: it starts `thin` (yin) and flips
 * to `thick` (yang) when an up segment pushes past the vertex two
 * turns back (the prior shoulder), and back to `thin` when a down
 * segment breaks below the vertex two turns back (the prior waist).
 * A segment that confirms nothing carries the previous thickness.
 */
export function computeLineKagiSegments(
  turns: readonly number[] | null | undefined,
): ChartLineKagiSegment[] {
  if (!Array.isArray(turns) || turns.length < 2) return [];
  const segments: ChartLineKagiSegment[] = [];
  let thickness: ChartLineKagiThickness = 'thin';
  for (let k = 0; k < turns.length - 1; k += 1) {
    const from = turns[k]!;
    const to = turns[k + 1]!;
    const direction: ChartLineKagiDirection = to > from ? 'up' : 'down';
    if (k >= 1) {
      const prior = turns[k - 1]!;
      if (direction === 'up' && to > prior) thickness = 'thick';
      else if (direction === 'down' && to < prior) thickness = 'thin';
    }
    segments.push({ index: k, fromValue: from, toValue: to, direction, thickness });
  }
  return segments;
}

export function runLineKagi(
  points: readonly ChartLineKagiPoint[] | null | undefined,
  options?: { reversalAmount?: number },
): ChartLineKagiRun {
  const finite = getLineKagiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const reversalAmount = normalizeLineKagiReversal(
    options?.reversalAmount ?? DEFAULT_CHART_LINE_KAGI_REVERSAL,
    DEFAULT_CHART_LINE_KAGI_REVERSAL,
  );
  const turns = computeLineKagiTurns(
    series.map((p) => p.value),
    reversalAmount,
  );
  const segments = computeLineKagiSegments(turns);

  if (segments.length === 0) {
    return {
      series,
      reversalAmount,
      turns,
      segments: [],
      upCount: 0,
      downCount: 0,
      thinCount: 0,
      thickCount: 0,
      ok: false,
    };
  }

  let upCount = 0;
  let downCount = 0;
  let thinCount = 0;
  let thickCount = 0;
  for (const s of segments) {
    if (s.direction === 'up') upCount += 1;
    else downCount += 1;
    if (s.thickness === 'thick') thickCount += 1;
    else thinCount += 1;
  }

  return {
    series,
    reversalAmount,
    turns,
    segments,
    upCount,
    downCount,
    thinCount,
    thickCount,
    ok: true,
  };
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

export function computeLineKagiLayout(
  options: ComputeLineKagiLayoutOptions,
): ChartLineKagiLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_KAGI_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineKagiPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineKagi(data, {
    ...(isFiniteNumber(options.reversalAmount)
      ? { reversalAmount: options.reversalAmount }
      : {}),
  });
  const empty: ChartLineKagiLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    yMin: 0,
    yMax: 0,
    segmentCount: 0,
    segmentLines: [],
    reversalAmount: run.reversalAmount,
    upCount: 0,
    downCount: 0,
    thinCount: 0,
    thickCount: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineKagiPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let yLo = Math.min(...run.turns);
  let yHi = Math.max(...run.turns);
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }
  const yRange = yHi - yLo;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const m = run.segments.length;
  const colWidth = panel.width / m;
  const colCenter = (k: number): number =>
    panel.x + k * colWidth + colWidth / 2;

  const segmentLines: ChartLineKagiSegmentLine[] = run.segments.map((s, k) => {
    const cx = colCenter(k);
    const fromY = projectY(s.fromValue);
    const toY = projectY(s.toValue);
    let path = `M ${cx.toFixed(3)} ${fromY.toFixed(3)} L ${cx.toFixed(3)} ${toY.toFixed(3)}`;
    if (k < m - 1) {
      const nextCx = colCenter(k + 1);
      path += ` L ${nextCx.toFixed(3)} ${toY.toFixed(3)}`;
    }
    return {
      index: k,
      direction: s.direction,
      thickness: s.thickness,
      fromValue: s.fromValue,
      toValue: s.toValue,
      cx,
      fromY,
      toY,
      path,
    };
  });

  const xTicks = computeTicks(0, m - 1, Math.min(tickCount, m)).map((v) => {
    const i = Math.round(v);
    return { value: i, px: colCenter(i) };
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
    segmentCount: m,
    segmentLines,
    reversalAmount: run.reversalAmount,
    upCount: run.upCount,
    downCount: run.downCount,
    thinCount: run.thinCount,
    thickCount: run.thickCount,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineKagiChart(
  data: readonly ChartLineKagiPoint[] | null | undefined,
  options?: { reversalAmount?: number },
): string {
  const run = runLineKagi(data, options);
  if (!run.ok) return 'No data';
  return `Kagi line chart (reversal amount ${defaultFormatValue(run.reversalAmount)}): the price series is drawn as a continuous line of vertical segments that extend with the price and reverse direction only when the price moves back by the reversal amount. The line is drawn thin (yin) by default and thickens to yang on trend confirmation -- when an up segment pushes past the prior shoulder or a down segment breaks the prior waist. The chart carries ${run.segments.length} segments (${run.upCount} up, ${run.downCount} down; ${run.thinCount} thin, ${run.thickCount} thick).`;
}

const KAGI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineKagi = forwardRef<HTMLDivElement, ChartLineKagiProps>(
  function ChartLineKagi(
    props: ChartLineKagiProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      reversalAmount,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_KAGI_WIDTH,
      height = DEFAULT_CHART_LINE_KAGI_HEIGHT,
      padding = DEFAULT_CHART_LINE_KAGI_PADDING,
      tickCount = DEFAULT_CHART_LINE_KAGI_TICK_COUNT,
      thinWidth = DEFAULT_CHART_LINE_KAGI_THIN_WIDTH,
      thickWidth = DEFAULT_CHART_LINE_KAGI_THICK_WIDTH,
      thinColor = DEFAULT_CHART_LINE_KAGI_THIN_COLOR,
      thickColor = DEFAULT_CHART_LINE_KAGI_THICK_COLOR,
      gridColor = DEFAULT_CHART_LINE_KAGI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_KAGI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Kagi line chart',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      onSegmentClick,
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
        computeLineKagiLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(reversalAmount) ? { reversalAmount } : {}),
        }),
      [data, width, height, padding, tickCount, reversalAmount],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineKagiChart(data, {
          ...(isFiniteNumber(reversalAmount) ? { reversalAmount } : {}),
        }),
      [ariaDescription, data, reversalAmount],
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
          data-section="chart-line-kagi"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-kagi-aria-desc"
            style={KAGI_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const thinVisible = !hiddenSet.has('thin');
    const thickVisible = !hiddenSet.has('thick');

    const visibleSegments = layout.segmentLines.filter((s) =>
      s.thickness === 'thick' ? thickVisible : thinVisible,
    );

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'thin', label: 'Yin (thin)', color: thinColor },
      { id: 'thick', label: 'Yang (thick)', color: thickColor },
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
        data-section="chart-line-kagi"
        data-empty="false"
        data-reversal-amount={layout.reversalAmount}
        data-segment-count={layout.segmentCount}
        data-up-count={layout.upCount}
        data-down-count={layout.downCount}
        data-thin-count={layout.thinCount}
        data-thick-count={layout.thickCount}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-kagi-aria-desc"
          style={KAGI_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-kagi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-kagi-badge"
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
                data-section="chart-line-kagi-badge-icon"
                aria-hidden="true"
                style={{ color: thickColor }}
              >
                KAGI
              </span>
              <span data-section="chart-line-kagi-badge-reversal">
                r={formatValue(layout.reversalAmount)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-kagi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-kagi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-kagi-grid-line"
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
                data-section="chart-line-kagi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-kagi-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-kagi-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-kagi-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-kagi-tick-label"
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
                    data-section="chart-line-kagi-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-kagi-tick-label"
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

            <g data-section="chart-line-kagi-segments">
              {visibleSegments.map((s) => {
                const isHover = hoverIndex === s.index;
                const isThick = s.thickness === 'thick';
                const base = isThick ? thickWidth : thinWidth;
                return (
                  <path
                    key={`seg-${s.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Kagi segment ${s.index + 1}, ${s.direction}, ${s.thickness}, ${formatValue(s.fromValue)} to ${formatValue(s.toValue)}`}
                    data-section="chart-line-kagi-segment"
                    data-segment-index={s.index}
                    data-direction={s.direction}
                    data-thickness={s.thickness}
                    d={s.path}
                    fill="none"
                    stroke={isThick ? thickColor : thinColor}
                    strokeWidth={isHover ? base + 1.5 : base}
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                    onMouseEnter={() => {
                      setHoverIndex(s.index);
                      setTooltipPos({
                        px: s.cx,
                        py: (s.fromY + s.toY) / 2,
                      });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(s.index);
                      setTooltipPos({
                        px: s.cx,
                        py: (s.fromY + s.toY) / 2,
                      });
                    }}
                    onBlur={clearHover}
                    onClick={() => onSegmentClick?.({ segment: s })}
                  />
                );
              })}
            </g>
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const s = layout.segmentLines.find(
                  (x) => x.index === hoverIndex,
                );
                if (!s) return null;
                return (
                  <div
                    data-section="chart-line-kagi-tooltip"
                    data-segment-index={s.index}
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
                    <div data-section="chart-line-kagi-tooltip-index">
                      segment: {s.index + 1}
                    </div>
                    <div
                      data-section="chart-line-kagi-tooltip-direction"
                      style={{ fontWeight: 600 }}
                    >
                      direction: {s.direction}
                    </div>
                    <div data-section="chart-line-kagi-tooltip-thickness">
                      thickness: {s.thickness}
                    </div>
                    <div data-section="chart-line-kagi-tooltip-range">
                      {formatValue(s.fromValue)} to {formatValue(s.toValue)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-kagi-legend"
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
                  data-section="chart-line-kagi-legend-item"
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
                    data-section="chart-line-kagi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-kagi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-kagi-legend-stats"
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

ChartLineKagi.displayName = 'ChartLineKagi';
