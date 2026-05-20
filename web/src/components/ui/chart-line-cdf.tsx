import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CDF_WIDTH = 560;
export const DEFAULT_CHART_LINE_CDF_HEIGHT = 320;
export const DEFAULT_CHART_LINE_CDF_PADDING = 40;
export const DEFAULT_CHART_LINE_CDF_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CDF_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CDF_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CDF_CURVE_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_CDF_MEDIAN_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_CDF_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CDF_AXIS_COLOR = '#cbd5e1';

export interface ChartLineCdfStep {
  value: number;
  count: number;
  cumulative: number;
  probability: number;
}

export interface ChartLineCdfRun {
  values: number[];
  n: number;
  steps: ChartLineCdfStep[];
  distinctCount: number;
  minValue: number;
  maxValue: number;
  median: number | null;
  ok: boolean;
}

export interface ChartLineCdfStepMarker {
  index: number;
  value: number;
  count: number;
  cumulative: number;
  probability: number;
  px: number;
  py: number;
}

export interface ChartLineCdfPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineCdfLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineCdfPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  stepPath: string;
  stepMarkers: ChartLineCdfStepMarker[];
  n: number;
  distinctCount: number;
  minValue: number;
  maxValue: number;
  median: number | null;
  medianX: number | null;
  totalSteps: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineCdfLayoutOptions {
  data: readonly number[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineCdfProps {
  data: readonly number[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  curveColor?: string;
  medianColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showMarkers?: boolean;
  showMedianLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onStepClick?: (payload: { step: ChartLineCdfStepMarker }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Keep only the finite sample values. Order is preserved; the ECDF
 * computation sorts as needed.
 */
export function getLineCdfFiniteValues(
  values: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(values)) return [];
  return values.filter((v): v is number => isFiniteNumber(v));
}

/**
 * The empirical cumulative distribution function. The finite sample
 * values are sorted ascending and grouped by distinct value; each
 * distinct value `v` carries a `count` (its multiplicity), a
 * `cumulative` count of sample values at or below it, and a
 * `probability = cumulative / n`. The last step always reaches 1.
 */
export function computeLineCdf(
  values: readonly number[] | null | undefined,
): ChartLineCdfStep[] {
  const finite = getLineCdfFiniteValues(values);
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [];
  const steps: ChartLineCdfStep[] = [];
  let i = 0;
  while (i < n) {
    const v = sorted[i]!;
    let count = 0;
    while (i < n && sorted[i] === v) {
      count += 1;
      i += 1;
    }
    steps.push({ value: v, count, cumulative: i, probability: i / n });
  }
  return steps;
}

/**
 * The empirical median: the smallest distinct value at which the
 * ECDF reaches 0.5 or more. Returns null only for an empty step
 * list, since a non-empty ECDF always reaches 1.
 */
export function computeLineCdfMedian(
  steps: readonly ChartLineCdfStep[] | null | undefined,
): number | null {
  if (!Array.isArray(steps)) return null;
  for (const s of steps) {
    if (s.probability >= 0.5) return s.value;
  }
  return null;
}

export function runLineCdf(
  values: readonly number[] | null | undefined,
): ChartLineCdfRun {
  const finite = getLineCdfFiniteValues(values);
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;

  if (n < 2) {
    return {
      values: sorted,
      n,
      steps: [],
      distinctCount: 0,
      minValue: NaN,
      maxValue: NaN,
      median: null,
      ok: false,
    };
  }

  const steps = computeLineCdf(sorted);
  return {
    values: sorted,
    n,
    steps,
    distinctCount: steps.length,
    minValue: sorted[0]!,
    maxValue: sorted[n - 1]!,
    median: computeLineCdfMedian(steps),
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

export function computeLineCdfLayout(
  options: ComputeLineCdfLayoutOptions,
): ChartLineCdfLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_CDF_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineCdf(data);
  const empty: ChartLineCdfLayout = {
    ok: false,
    width,
    height,
    panel: { x: padding, y: padding, width: 0, height: 0 },
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    stepPath: '',
    stepMarkers: [],
    n: run.n,
    distinctCount: 0,
    minValue: NaN,
    maxValue: NaN,
    median: null,
    medianX: null,
    totalSteps: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok || run.steps.length === 0) return empty;

  const panel: ChartLineCdfPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = run.minValue;
  let xHi = run.maxValue;
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }

  const projectX = (v: number): number =>
    panel.x + ((v - xLo) / (xHi - xLo)) * panel.width;
  const projectY = (p: number): number =>
    panel.y + panel.height - p * panel.height;

  const corners: { px: number; py: number }[] = [
    { px: projectX(xLo), py: projectY(0) },
  ];
  let prevP = 0;
  for (const step of run.steps) {
    corners.push({ px: projectX(step.value), py: projectY(prevP) });
    corners.push({ px: projectX(step.value), py: projectY(step.probability) });
    prevP = step.probability;
  }

  const stepMarkers: ChartLineCdfStepMarker[] = run.steps.map(
    (step, index) => ({
      index,
      value: step.value,
      count: step.count,
      cumulative: step.cumulative,
      probability: step.probability,
      px: projectX(step.value),
      py: projectY(step.probability),
    }),
  );

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(0, 1, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    stepPath: buildPath(corners),
    stepMarkers,
    n: run.n,
    distinctCount: run.distinctCount,
    minValue: run.minValue,
    maxValue: run.maxValue,
    median: run.median,
    medianX: run.median !== null ? projectX(run.median) : null,
    totalSteps: run.steps.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineCdfChart(
  data: readonly number[] | null | undefined,
): string {
  const run = runLineCdf(data);
  if (!run.ok) return 'No data';
  return `Empirical cumulative distribution function (ECDF) over ${run.n} values: the step curve rises from zero to one, jumping at each sorted observation, so the cumulative fraction of the sample at or below any value reads straight off the curve. ${run.distinctCount} distinct values across ${run.n} observations.`;
}

const CDF_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineCdf = forwardRef<HTMLDivElement, ChartLineCdfProps>(
  function ChartLineCdf(
    props: ChartLineCdfProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_CDF_WIDTH,
      height = DEFAULT_CHART_LINE_CDF_HEIGHT,
      padding = DEFAULT_CHART_LINE_CDF_PADDING,
      tickCount = DEFAULT_CHART_LINE_CDF_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_CDF_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_CDF_DOT_RADIUS,
      curveColor = DEFAULT_CHART_LINE_CDF_CURVE_COLOR,
      medianColor = DEFAULT_CHART_LINE_CDF_MEDIAN_COLOR,
      gridColor = DEFAULT_CHART_LINE_CDF_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_CDF_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showMarkers = true,
      showMedianLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Empirical cumulative distribution function curve',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      onStepClick,
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
      () => computeLineCdfLayout({ data, width, height, padding, tickCount }),
      [data, width, height, padding, tickCount],
    );

    const summary = useMemo(
      () => ariaDescription ?? describeLineCdfChart(data),
      [ariaDescription, data],
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
          data-section="chart-line-cdf"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-cdf-aria-desc" style={CDF_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pn = layout.panel;
    const curveVisible = !hiddenSet.has('cdf');
    const medianVisible =
      showMedianLine && !hiddenSet.has('median') && layout.medianX !== null;

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'cdf', label: 'ECDF', color: curveColor },
      { id: 'median', label: 'Median', color: medianColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-cdf"
        data-empty="false"
        data-n={layout.n}
        data-distinct-count={layout.distinctCount}
        data-median={layout.median ?? ''}
        data-min-value={layout.minValue}
        data-max-value={layout.maxValue}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-cdf-aria-desc" style={CDF_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-cdf-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-cdf-badge"
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
                data-section="chart-line-cdf-badge-icon"
                aria-hidden="true"
                style={{ color: curveColor }}
              >
                ECDF
              </span>
              <span data-section="chart-line-cdf-badge-n">
                n={layout.n}
              </span>
              <span data-section="chart-line-cdf-badge-median">
                median=
                {layout.median === null
                  ? 'n/a'
                  : formatX(layout.median)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-cdf-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-cdf-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-cdf-grid-line"
                    x1={pn.x}
                    x2={pn.x + pn.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {medianVisible ? (
              <line
                data-section="chart-line-cdf-median-line"
                data-median={layout.median ?? undefined}
                x1={layout.medianX as number}
                x2={layout.medianX as number}
                y1={pn.y}
                y2={pn.y + pn.height}
                stroke={medianColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-cdf-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-cdf-axis"
                  data-axis="x"
                  x1={pn.x}
                  y1={pn.y + pn.height}
                  x2={pn.x + pn.width}
                  y2={pn.y + pn.height}
                />
                <line
                  data-section="chart-line-cdf-axis"
                  data-axis="y"
                  x1={pn.x}
                  y1={pn.y}
                  x2={pn.x}
                  y2={pn.y + pn.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-cdf-tick"
                    data-axis="y"
                  >
                    <line x1={pn.x - 4} x2={pn.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-cdf-tick-label"
                      data-axis="y"
                      x={pn.x - 6}
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
                    data-section="chart-line-cdf-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={pn.y + pn.height}
                      y2={pn.y + pn.height + 4}
                    />
                    <text
                      data-section="chart-line-cdf-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={pn.y + pn.height + 14}
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

            {curveVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="ECDF step curve"
                data-section="chart-line-cdf-step-path"
                d={layout.stepPath}
                fill="none"
                stroke={curveColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {curveVisible && showMarkers ? (
              <g data-section="chart-line-cdf-markers">
                {layout.stepMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Value ${formatX(m.value)}: cumulative probability ${formatValue(m.probability)}`}
                      data-section="chart-line-cdf-marker"
                      data-point-index={m.index}
                      data-value={m.value}
                      data-probability={m.probability}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={curveColor}
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
                      onClick={() => onStepClick?.({ step: m })}
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const m = layout.stepMarkers.find(
                  (x) => x.index === hoverIndex,
                );
                if (!m) return null;
                return (
                  <div
                    data-section="chart-line-cdf-tooltip"
                    data-point-index={m.index}
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
                    <div
                      data-section="chart-line-cdf-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatX(m.value)}
                    </div>
                    <div data-section="chart-line-cdf-tooltip-probability">
                      probability: {formatValue(m.probability)}
                    </div>
                    <div data-section="chart-line-cdf-tooltip-count">
                      count: {formatValue(m.count)}
                    </div>
                    <div data-section="chart-line-cdf-tooltip-cumulative">
                      cumulative: {formatValue(m.cumulative)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-cdf-legend"
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
                  data-section="chart-line-cdf-legend-item"
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
                    data-section="chart-line-cdf-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-cdf-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-cdf-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.n} values, {layout.distinctCount} distinct
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineCdf.displayName = 'ChartLineCdf';
