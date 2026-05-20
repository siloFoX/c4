import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SURVIVAL_WIDTH = 560;
export const DEFAULT_CHART_LINE_SURVIVAL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SURVIVAL_PADDING = 40;
export const DEFAULT_CHART_LINE_SURVIVAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SURVIVAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SURVIVAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SURVIVAL_CENSOR_TICK_HALF = 5;
export const DEFAULT_CHART_LINE_SURVIVAL_SURVIVAL_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_SURVIVAL_CENSOR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SURVIVAL_MEDIAN_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SURVIVAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SURVIVAL_AXIS_COLOR = '#cbd5e1';

export interface ChartLineSurvivalObservation {
  time: number;
  event: boolean;
}

export interface ChartLineSurvivalStep {
  time: number;
  survival: number;
  atRisk: number;
  deaths: number;
  censored: number;
}

export interface ChartLineSurvivalCensorTick {
  time: number;
  survival: number;
  count: number;
}

export interface ChartLineSurvivalResult {
  steps: ChartLineSurvivalStep[];
  censorTicks: ChartLineSurvivalCensorTick[];
  total: number;
  survivalFinal: number;
  eventCount: number;
  censorCount: number;
  medianSurvival: number | null;
}

export interface ChartLineSurvivalRun {
  observations: ChartLineSurvivalObservation[];
  steps: ChartLineSurvivalStep[];
  censorTicks: ChartLineSurvivalCensorTick[];
  total: number;
  survivalFinal: number;
  eventCount: number;
  censorCount: number;
  medianSurvival: number | null;
  ok: boolean;
}

export interface ChartLineSurvivalStepMarker {
  index: number;
  time: number;
  survival: number;
  atRisk: number;
  deaths: number;
  censored: number;
  px: number;
  py: number;
}

export interface ChartLineSurvivalCensorMark {
  time: number;
  survival: number;
  count: number;
  px: number;
  py: number;
}

export interface ChartLineSurvivalPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineSurvivalLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineSurvivalPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  stepPath: string;
  stepMarkers: ChartLineSurvivalStepMarker[];
  censorMarks: ChartLineSurvivalCensorMark[];
  total: number;
  survivalFinal: number;
  eventCount: number;
  censorCount: number;
  medianSurvival: number | null;
  medianX: number | null;
  totalSteps: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineSurvivalLayoutOptions {
  data: readonly ChartLineSurvivalObservation[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineSurvivalProps {
  data: readonly ChartLineSurvivalObservation[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  censorTickHalf?: number;
  survivalColor?: string;
  censorColor?: string;
  medianColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showMarkers?: boolean;
  showCensorTicks?: boolean;
  showMedianLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatTime?: (n: number) => string;
  onStepClick?: (payload: { step: ChartLineSurvivalStepMarker }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Drop observations with a non-finite time and coerce the event flag
 * to a strict boolean -- only `event === true` counts as an observed
 * event; anything else is treated as a censored observation.
 */
export function getLineSurvivalFiniteObservations(
  observations: readonly ChartLineSurvivalObservation[] | null | undefined,
): ChartLineSurvivalObservation[] {
  if (!Array.isArray(observations)) return [];
  const out: ChartLineSurvivalObservation[] = [];
  for (const o of observations) {
    if (o && isFiniteNumber(o.time)) {
      out.push({ time: o.time, event: o.event === true });
    }
  }
  return out;
}

/**
 * The median survival time: the earliest step time at which the
 * survival estimate has fallen to 0.5 or below. Returns null when the
 * curve never reaches 0.5.
 */
export function computeLineSurvivalMedian(
  steps: readonly ChartLineSurvivalStep[] | null | undefined,
): number | null {
  if (!Array.isArray(steps)) return null;
  for (const s of steps) {
    if (s.survival <= 0.5) return s.time;
  }
  return null;
}

/**
 * The Kaplan-Meier survival estimate. Observations are grouped by
 * distinct time; at each time with `d` events out of `n` subjects at
 * risk the survival estimate is multiplied by `(1 - d/n)`. Censored
 * observations do not lower the estimate but reduce the at-risk count
 * for later times. The result is a descending step function.
 */
export function computeKaplanMeier(
  observations: readonly ChartLineSurvivalObservation[] | null | undefined,
): ChartLineSurvivalResult {
  const empty: ChartLineSurvivalResult = {
    steps: [],
    censorTicks: [],
    total: 0,
    survivalFinal: NaN,
    eventCount: 0,
    censorCount: 0,
    medianSurvival: null,
  };
  if (!Array.isArray(observations) || observations.length === 0) {
    return empty;
  }
  const sorted = [...observations].sort((a, b) => a.time - b.time);
  const total = sorted.length;
  let n = total;
  let survival = 1;
  let eventCount = 0;
  let censorCount = 0;
  const steps: ChartLineSurvivalStep[] = [];
  const censorTicks: ChartLineSurvivalCensorTick[] = [];
  let i = 0;
  while (i < total) {
    const t = sorted[i]!.time;
    let deaths = 0;
    let censored = 0;
    while (i < total && sorted[i]!.time === t) {
      if (sorted[i]!.event === true) deaths += 1;
      else censored += 1;
      i += 1;
    }
    const atRisk = n;
    if (deaths > 0 && n > 0) {
      survival = survival * (1 - deaths / n);
    }
    steps.push({ time: t, survival, atRisk, deaths, censored });
    if (censored > 0) {
      censorTicks.push({ time: t, survival, count: censored });
    }
    eventCount += deaths;
    censorCount += censored;
    n -= deaths + censored;
  }
  return {
    steps,
    censorTicks,
    total,
    survivalFinal: survival,
    eventCount,
    censorCount,
    medianSurvival: computeLineSurvivalMedian(steps),
  };
}

export function runLineSurvival(
  observations: readonly ChartLineSurvivalObservation[] | null | undefined,
): ChartLineSurvivalRun {
  const finite = getLineSurvivalFiniteObservations(observations);
  const sorted = [...finite].sort((a, b) => a.time - b.time);
  const total = sorted.length;

  if (total < 2) {
    return {
      observations: sorted,
      steps: [],
      censorTicks: [],
      total,
      survivalFinal: NaN,
      eventCount: 0,
      censorCount: 0,
      medianSurvival: null,
      ok: false,
    };
  }

  const km = computeKaplanMeier(sorted);
  return {
    observations: sorted,
    steps: km.steps,
    censorTicks: km.censorTicks,
    total: km.total,
    survivalFinal: km.survivalFinal,
    eventCount: km.eventCount,
    censorCount: km.censorCount,
    medianSurvival: km.medianSurvival,
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

export function computeLineSurvivalLayout(
  options: ComputeLineSurvivalLayoutOptions,
): ChartLineSurvivalLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_SURVIVAL_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineSurvival(data);
  const empty: ChartLineSurvivalLayout = {
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
    censorMarks: [],
    total: run.total,
    survivalFinal: NaN,
    eventCount: 0,
    censorCount: 0,
    medianSurvival: null,
    medianX: null,
    totalSteps: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok || run.steps.length === 0) return empty;

  const panel: ChartLineSurvivalPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = run.steps[0]!.time;
  let xHi = run.steps[run.steps.length - 1]!.time;
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }

  const projectX = (t: number): number =>
    panel.x + ((t - xLo) / (xHi - xLo)) * panel.width;
  const projectY = (s: number): number =>
    panel.y + panel.height - s * panel.height;

  const corners: { px: number; py: number }[] = [
    { px: projectX(xLo), py: projectY(1) },
  ];
  let prevS = 1;
  for (const step of run.steps) {
    corners.push({ px: projectX(step.time), py: projectY(prevS) });
    corners.push({ px: projectX(step.time), py: projectY(step.survival) });
    prevS = step.survival;
  }

  const stepMarkers: ChartLineSurvivalStepMarker[] = run.steps.map(
    (step, index) => ({
      index,
      time: step.time,
      survival: step.survival,
      atRisk: step.atRisk,
      deaths: step.deaths,
      censored: step.censored,
      px: projectX(step.time),
      py: projectY(step.survival),
    }),
  );

  const censorMarks: ChartLineSurvivalCensorMark[] = run.censorTicks.map(
    (tick) => ({
      time: tick.time,
      survival: tick.survival,
      count: tick.count,
      px: projectX(tick.time),
      py: projectY(tick.survival),
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
    censorMarks,
    total: run.total,
    survivalFinal: run.survivalFinal,
    eventCount: run.eventCount,
    censorCount: run.censorCount,
    medianSurvival: run.medianSurvival,
    medianX: run.medianSurvival !== null ? projectX(run.medianSurvival) : null,
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

export function describeLineSurvivalChart(
  data: readonly ChartLineSurvivalObservation[] | null | undefined,
): string {
  const run = runLineSurvival(data);
  if (!run.ok) return 'No data';
  return `Kaplan-Meier survival curve over ${run.total} subjects: a descending step line drops at each observed event and holds flat between them, with censored observations marked by ticks. ${run.eventCount} events and ${run.censorCount} censored.`;
}

const SURVIVAL_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineSurvival = forwardRef<
  HTMLDivElement,
  ChartLineSurvivalProps
>(function ChartLineSurvival(
  props: ChartLineSurvivalProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_SURVIVAL_WIDTH,
    height = DEFAULT_CHART_LINE_SURVIVAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_SURVIVAL_PADDING,
    tickCount = DEFAULT_CHART_LINE_SURVIVAL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SURVIVAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SURVIVAL_DOT_RADIUS,
    censorTickHalf = DEFAULT_CHART_LINE_SURVIVAL_CENSOR_TICK_HALF,
    survivalColor = DEFAULT_CHART_LINE_SURVIVAL_SURVIVAL_COLOR,
    censorColor = DEFAULT_CHART_LINE_SURVIVAL_CENSOR_COLOR,
    medianColor = DEFAULT_CHART_LINE_SURVIVAL_MEDIAN_COLOR,
    gridColor = DEFAULT_CHART_LINE_SURVIVAL_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SURVIVAL_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showMarkers = true,
    showCensorTicks = true,
    showMedianLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Kaplan-Meier survival curve',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatTime = defaultFormatValue,
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
    () =>
      computeLineSurvivalLayout({ data, width, height, padding, tickCount }),
    [data, width, height, padding, tickCount],
  );

  const summary = useMemo(
    () => ariaDescription ?? describeLineSurvivalChart(data),
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
        data-section="chart-line-survival"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-survival-aria-desc"
          style={SURVIVAL_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pn = layout.panel;
  const survivalVisible = !hiddenSet.has('survival');
  const censorVisible = showCensorTicks && !hiddenSet.has('censored');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'survival', label: 'Survival', color: survivalColor },
    { id: 'censored', label: 'Censored', color: censorColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-survival"
      data-empty="false"
      data-total={layout.total}
      data-event-count={layout.eventCount}
      data-censor-count={layout.censorCount}
      data-survival-final={layout.survivalFinal}
      data-median={layout.medianSurvival ?? ''}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-survival-aria-desc"
        style={SURVIVAL_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-survival-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-survival-badge"
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
              data-section="chart-line-survival-badge-icon"
              aria-hidden="true"
              style={{ color: survivalColor }}
            >
              KM
            </span>
            <span data-section="chart-line-survival-badge-subjects">
              n={layout.total}
            </span>
            <span data-section="chart-line-survival-badge-median">
              median=
              {layout.medianSurvival === null
                ? 'n/a'
                : formatTime(layout.medianSurvival)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-survival-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-survival-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-survival-grid-line"
                  x1={pn.x}
                  x2={pn.x + pn.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showMedianLine && layout.medianX !== null ? (
            <line
              data-section="chart-line-survival-median-line"
              data-median={layout.medianSurvival ?? undefined}
              x1={layout.medianX}
              x2={layout.medianX}
              y1={pn.y}
              y2={pn.y + pn.height}
              stroke={medianColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-survival-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-survival-axis"
                data-axis="x"
                x1={pn.x}
                y1={pn.y + pn.height}
                x2={pn.x + pn.width}
                y2={pn.y + pn.height}
              />
              <line
                data-section="chart-line-survival-axis"
                data-axis="y"
                x1={pn.x}
                y1={pn.y}
                x2={pn.x}
                y2={pn.y + pn.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-survival-tick"
                  data-axis="y"
                >
                  <line x1={pn.x - 4} x2={pn.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-survival-tick-label"
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
                  data-section="chart-line-survival-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={pn.y + pn.height}
                    y2={pn.y + pn.height + 4}
                  />
                  <text
                    data-section="chart-line-survival-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={pn.y + pn.height + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatTime(t.value)}
                  </text>
                </g>
              ))}
            </g>
          ) : null}

          {survivalVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Survival step curve"
              data-section="chart-line-survival-step-path"
              d={layout.stepPath}
              fill="none"
              stroke={survivalColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {censorVisible ? (
            <g data-section="chart-line-survival-censor-ticks">
              {layout.censorMarks.map((c, i) => (
                <line
                  key={`c-${i}`}
                  data-section="chart-line-survival-censor-tick"
                  data-time={c.time}
                  data-count={c.count}
                  x1={c.px}
                  x2={c.px}
                  y1={c.py - censorTickHalf}
                  y2={c.py + censorTickHalf}
                  stroke={censorColor}
                  strokeWidth={1.75}
                />
              ))}
            </g>
          ) : null}

          {survivalVisible && showMarkers ? (
            <g data-section="chart-line-survival-markers">
              {layout.stepMarkers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Time ${formatTime(m.time)}: survival ${formatValue(m.survival)}, ${m.deaths} events, ${m.atRisk} at risk`}
                    data-section="chart-line-survival-marker"
                    data-point-index={m.index}
                    data-time={m.time}
                    data-survival={m.survival}
                    data-deaths={m.deaths}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={survivalColor}
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
                  data-section="chart-line-survival-tooltip"
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
                  <div data-section="chart-line-survival-tooltip-time">
                    time: {formatTime(m.time)}
                  </div>
                  <div
                    data-section="chart-line-survival-tooltip-survival"
                    style={{ fontWeight: 600 }}
                  >
                    survival: {formatValue(m.survival)}
                  </div>
                  <div data-section="chart-line-survival-tooltip-at-risk">
                    at risk: {formatValue(m.atRisk)}
                  </div>
                  <div data-section="chart-line-survival-tooltip-events">
                    events: {formatValue(m.deaths)}
                  </div>
                  <div data-section="chart-line-survival-tooltip-censored">
                    censored: {formatValue(m.censored)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-survival-legend"
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
                data-section="chart-line-survival-legend-item"
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
                  data-section="chart-line-survival-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-survival-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-survival-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.eventCount} events, {layout.censorCount} censored
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSurvival.displayName = 'ChartLineSurvival';
