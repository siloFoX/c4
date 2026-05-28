import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_LAG_PLOT_WIDTH = 640;
export const DEFAULT_CHART_LINE_LAG_PLOT_HEIGHT = 320;
export const DEFAULT_CHART_LINE_LAG_PLOT_PADDING = 40;
export const DEFAULT_CHART_LINE_LAG_PLOT_GAP = 28;
export const DEFAULT_CHART_LINE_LAG_PLOT_LINE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_LAG_PLOT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_LAG_PLOT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_LAG_PLOT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_LAG_PLOT_SCATTER_DOT_RADIUS = 3.5;
export const DEFAULT_CHART_LINE_LAG_PLOT_LAG = 1;
export const DEFAULT_CHART_LINE_LAG_PLOT_SERIES_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_LAG_PLOT_SCATTER_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_LAG_PLOT_IDENTITY_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_LAG_PLOT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_LAG_PLOT_AXIS_COLOR = '#cbd5e1';

export interface ChartLineLagPlotPoint {
  x: number;
  value: number;
}

export interface ChartLineLagPlotPair {
  index: number;
  t: number;
  laggedValue: number;
  currentValue: number;
  aboveDiagonal: boolean;
}

export interface ChartLineLagPlotRun {
  series: ChartLineLagPlotPoint[];
  lag: number;
  pairs: ChartLineLagPlotPair[];
  pairCount: number;
  correlation: number;
  valueMin: number;
  valueMax: number;
  ok: boolean;
}

export interface ChartLineLagPlotSeriesDot {
  index: number;
  x: number;
  value: number;
  px: number;
  py: number;
}

export interface ChartLineLagPlotScatterDot extends ChartLineLagPlotPair {
  px: number;
  py: number;
}

export interface ChartLineLagPlotPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineLagPlotLayout {
  ok: boolean;
  width: number;
  height: number;
  seriesPanel: ChartLineLagPlotPanel;
  scatterPanel: ChartLineLagPlotPanel;
  seriesXTicks: { value: number; px: number }[];
  seriesYTicks: { value: number; py: number }[];
  scatterXTicks: { value: number; px: number }[];
  scatterYTicks: { value: number; py: number }[];
  seriesXMin: number;
  seriesXMax: number;
  seriesYMin: number;
  seriesYMax: number;
  scatterMin: number;
  scatterMax: number;
  linePath: string;
  seriesDots: ChartLineLagPlotSeriesDot[];
  scatterDots: ChartLineLagPlotScatterDot[];
  identityPath: string;
  lag: number;
  pairCount: number;
  correlation: number;
  valueMin: number;
  valueMax: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineLagPlotLayoutOptions {
  data: readonly ChartLineLagPlotPoint[];
  lag?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  linePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineLagPlotProps {
  data: readonly ChartLineLagPlotPoint[];
  lag?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  linePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  scatterDotRadius?: number;
  seriesColor?: string;
  scatterColor?: string;
  identityColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showSeriesDots?: boolean;
  showIdentityLine?: boolean;
  showPanelLabels?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showFooter?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onSampleClick?: (payload: { point: ChartLineLagPlotSeriesDot }) => void;
  onPairClick?: (payload: { pair: ChartLineLagPlotScatterDot }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineLagPlotFinitePoints(
  points: readonly ChartLineLagPlotPoint[] | null | undefined,
): ChartLineLagPlotPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineLagPlotPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a lag argument to a positive integer. A non-finite or
 * sub-1 lag falls back to 1; a fractional lag is floored.
 */
export function normalizeLineLagPlotLag(lag: number): number {
  if (!isFiniteNumber(lag)) return 1;
  const k = Math.floor(lag);
  return k < 1 ? 1 : k;
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i += 1) {
    sa += a[i]!;
    sb += b[i]!;
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return NaN;
  return cov / Math.sqrt(va * vb);
}

/**
 * Build the lag-k pairs of a time series. For a series sorted by x,
 * each pair `(y[t-k], y[t])` joins a value with the value `k` steps
 * earlier; the lag plot scatters the lagged value (x) against the
 * current value (y). The lag-k autocorrelation is the Pearson
 * correlation of those two columns.
 */
export function runLineLagPlot(
  points: readonly ChartLineLagPlotPoint[] | null | undefined,
  lag: number = DEFAULT_CHART_LINE_LAG_PLOT_LAG,
): ChartLineLagPlotRun {
  const finite = getLineLagPlotFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const k = normalizeLineLagPlotLag(lag);
  const n = series.length;

  let valueMin = Number.POSITIVE_INFINITY;
  let valueMax = Number.NEGATIVE_INFINITY;
  for (const p of series) {
    if (p.value < valueMin) valueMin = p.value;
    if (p.value > valueMax) valueMax = p.value;
  }
  if (n === 0) {
    valueMin = NaN;
    valueMax = NaN;
  }

  const pairs: ChartLineLagPlotPair[] = [];
  for (let t = k; t < n; t += 1) {
    const laggedValue = series[t - k]!.value;
    const currentValue = series[t]!.value;
    pairs.push({
      index: t - k,
      t,
      laggedValue,
      currentValue,
      aboveDiagonal: currentValue > laggedValue,
    });
  }

  const correlation = pearson(
    pairs.map((p) => p.laggedValue),
    pairs.map((p) => p.currentValue),
  );

  return {
    series = [],
    lag: k,
    pairs,
    pairCount: pairs.length,
    correlation,
    valueMin,
    valueMax,
    ok: n >= 2 && pairs.length >= 1,
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

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineLagPlotLayout(
  options: ComputeLineLagPlotLayoutOptions,
): ChartLineLagPlotLayout {
  const {
    data,
    lag,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_LAG_PLOT_GAP,
    linePanelRatio = DEFAULT_CHART_LINE_LAG_PLOT_LINE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_LAG_PLOT_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.2, linePanelRatio));

  const emptyPanel: ChartLineLagPlotPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: innerHeight,
  };
  const empty: ChartLineLagPlotLayout = {
    ok: false,
    width,
    height,
    seriesPanel: emptyPanel,
    scatterPanel: emptyPanel,
    seriesXTicks: [],
    seriesYTicks: [],
    scatterXTicks: [],
    scatterYTicks: [],
    seriesXMin: 0,
    seriesXMax: 0,
    seriesYMin: 0,
    seriesYMax: 0,
    scatterMin: 0,
    scatterMax: 0,
    linePath: '',
    seriesDots: [],
    scatterDots: [],
    identityPath: '',
    lag: normalizeLineLagPlotLag(lag ?? DEFAULT_CHART_LINE_LAG_PLOT_LAG),
    pairCount: 0,
    correlation: NaN,
    valueMin: NaN,
    valueMax: NaN,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableWidth = innerWidth - gap;
  if (usableWidth <= 0) return empty;

  const run = runLineLagPlot(data, lag ?? DEFAULT_CHART_LINE_LAG_PLOT_LAG);
  if (!run.ok) return empty;

  const seriesPanelW = usableWidth * ratio;
  const scatterPanelW = usableWidth - seriesPanelW;
  if (seriesPanelW <= 0 || scatterPanelW <= 0) return empty;

  const seriesPanel: ChartLineLagPlotPanel = {
    x: padding,
    y: padding,
    width: seriesPanelW,
    height: innerHeight,
  };
  const scatterPanel: ChartLineLagPlotPanel = {
    x: padding + seriesPanelW + gap,
    y: padding,
    width: scatterPanelW,
    height: innerHeight,
  };

  // ----- series panel -----
  let sxLo = Number.POSITIVE_INFINITY;
  let sxHi = Number.NEGATIVE_INFINITY;
  let syLo = Number.POSITIVE_INFINITY;
  let syHi = Number.NEGATIVE_INFINITY;
  for (const p of run.series) {
    if (p.x < sxLo) sxLo = p.x;
    if (p.x > sxHi) sxHi = p.x;
    if (p.value < syLo) syLo = p.value;
    if (p.value > syHi) syHi = p.value;
  }
  if (sxLo === sxHi) {
    sxLo -= 0.5;
    sxHi += 0.5;
  }
  if (syLo === syHi) {
    syLo -= 0.5;
    syHi += 0.5;
  }
  const sProjectX = (x: number): number =>
    seriesPanel.x + ((x - sxLo) / (sxHi - sxLo)) * seriesPanel.width;
  const sProjectY = (v: number): number =>
    seriesPanel.y +
    seriesPanel.height -
    ((v - syLo) / (syHi - syLo)) * seriesPanel.height;

  const seriesDots: ChartLineLagPlotSeriesDot[] = run.series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    px: sProjectX(p.x),
    py: sProjectY(p.value),
  }));

  // ----- scatter panel: both axes share the value domain -----
  let vLo = run.valueMin;
  let vHi = run.valueMax;
  if (vLo === vHi) {
    vLo -= 0.5;
    vHi += 0.5;
  }
  const cProjectX = (v: number): number =>
    scatterPanel.x + ((v - vLo) / (vHi - vLo)) * scatterPanel.width;
  const cProjectY = (v: number): number =>
    scatterPanel.y +
    scatterPanel.height -
    ((v - vLo) / (vHi - vLo)) * scatterPanel.height;

  const scatterDots: ChartLineLagPlotScatterDot[] = run.pairs.map((p) => ({
    ...p,
    px: cProjectX(p.laggedValue),
    py: cProjectY(p.currentValue),
  }));

  const identityPath = buildPath([
    { px: cProjectX(vLo), py: cProjectY(vLo) },
    { px: cProjectX(vHi), py: cProjectY(vHi) },
  ]);

  return {
    ok: true,
    width,
    height,
    seriesPanel,
    scatterPanel,
    seriesXTicks: computeTicks(sxLo, sxHi, tickCount).map((v) => ({
      value: v,
      px: sProjectX(v),
    })),
    seriesYTicks: computeTicks(syLo, syHi, tickCount).map((v) => ({
      value: v,
      py: sProjectY(v),
    })),
    scatterXTicks: computeTicks(vLo, vHi, tickCount).map((v) => ({
      value: v,
      px: cProjectX(v),
    })),
    scatterYTicks: computeTicks(vLo, vHi, tickCount).map((v) => ({
      value: v,
      py: cProjectY(v),
    })),
    seriesXMin: sxLo,
    seriesXMax: sxHi,
    seriesYMin: syLo,
    seriesYMax: syHi,
    scatterMin: vLo,
    scatterMax: vHi,
    linePath: buildPath(seriesDots.map((d) => ({ px: d.px, py: d.py }))),
    seriesDots,
    scatterDots,
    identityPath,
    lag: run.lag,
    pairCount: run.pairCount,
    correlation: run.correlation,
    valueMin: run.valueMin,
    valueMax: run.valueMax,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function formatCorrelation(n: number): string {
  return isFiniteNumber(n) ? n.toFixed(3) : 'n/a';
}

export function describeLineLagPlotChart(
  data: readonly ChartLineLagPlotPoint[] | null | undefined,
  options?: { lag?: number },
): string {
  const run = runLineLagPlot(
    data,
    options?.lag ?? DEFAULT_CHART_LINE_LAG_PLOT_LAG,
  );
  if (!run.ok) return 'No data';
  return `Line chart with a lag-${run.lag} scatter side panel: ${run.pairCount} lag pairs, lag-${run.lag} autocorrelation ${formatCorrelation(run.correlation)}.`;
}

function srOnly(): CSSProperties {
  return {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  };
}

export const ChartLineLagPlot = forwardRef<
  HTMLDivElement,
  ChartLineLagPlotProps
>(function ChartLineLagPlot(
  props: ChartLineLagPlotProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    lag = DEFAULT_CHART_LINE_LAG_PLOT_LAG,
    width = DEFAULT_CHART_LINE_LAG_PLOT_WIDTH,
    height = DEFAULT_CHART_LINE_LAG_PLOT_HEIGHT,
    padding = DEFAULT_CHART_LINE_LAG_PLOT_PADDING,
    gap = DEFAULT_CHART_LINE_LAG_PLOT_GAP,
    linePanelRatio = DEFAULT_CHART_LINE_LAG_PLOT_LINE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_LAG_PLOT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_LAG_PLOT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_LAG_PLOT_DOT_RADIUS,
    scatterDotRadius = DEFAULT_CHART_LINE_LAG_PLOT_SCATTER_DOT_RADIUS,
    seriesColor = DEFAULT_CHART_LINE_LAG_PLOT_SERIES_COLOR,
    scatterColor = DEFAULT_CHART_LINE_LAG_PLOT_SCATTER_COLOR,
    identityColor = DEFAULT_CHART_LINE_LAG_PLOT_IDENTITY_COLOR,
    gridColor = DEFAULT_CHART_LINE_LAG_PLOT_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_LAG_PLOT_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showSeriesDots = true,
    showIdentityLine = true,
    showPanelLabels = true,
    showTooltip = true,
    showConfigBadge = true,
    showFooter = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a lag scatter side panel',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    onSampleClick,
    onPairClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const layout = useMemo(
    () =>
      computeLineLagPlotLayout({
        data,
        lag,
        width,
        height,
        padding,
        gap,
        linePanelRatio,
        tickCount,
      }),
    [data, lag, width, height, padding, gap, linePanelRatio, tickCount],
  );

  const summary = useMemo(
    () => ariaDescription ?? describeLineLagPlotChart(data, { lag }),
    [ariaDescription, data, lag],
  );

  const [hover, setHover] = useState<
    | { kind: 'series'; index: number }
    | { kind: 'scatter'; index: number }
    | null
  >(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHover(null);
    setTooltipPos(null);
  }, []);

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
        data-section="chart-line-lag-plot"
        data-empty="true"
        data-lag={layout.lag}
        data-pair-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-lag-plot-aria-desc" style={srOnly()}>
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const sp = layout.seriesPanel;
  const cp = layout.scatterPanel;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-lag-plot"
      data-empty="false"
      data-lag={layout.lag}
      data-pair-count={layout.pairCount}
      data-correlation={layout.correlation}
      data-animate={animate ? 'true' : 'false'}
    >
      <span id={descId} data-section="chart-line-lag-plot-aria-desc" style={srOnly()}>
        {summary}
      </span>

      <div
        data-section="chart-line-lag-plot-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-lag-plot-badge"
            data-lag={layout.lag}
            data-correlation={layout.correlation}
            data-pair-count={layout.pairCount}
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
            <span data-section="chart-line-lag-plot-badge-icon" aria-hidden="true">
              LAG
            </span>
            <span data-section="chart-line-lag-plot-badge-lag">
              k={layout.lag}
            </span>
            <span data-section="chart-line-lag-plot-badge-correlation">
              r={formatCorrelation(layout.correlation)}
            </span>
            <span data-section="chart-line-lag-plot-badge-count">
              n={layout.pairCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-lag-plot-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-lag-plot-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.seriesYTicks.map((t, i) => (
                <line
                  key={`sgy-${i}`}
                  data-section="chart-line-lag-plot-grid-line"
                  data-panel="series"
                  x1={sp.x}
                  x2={sp.x + sp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.scatterYTicks.map((t, i) => (
                <line
                  key={`cgy-${i}`}
                  data-section="chart-line-lag-plot-grid-line"
                  data-panel="scatter"
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
              data-section="chart-line-lag-plot-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                {
                  panel: sp,
                  name: 'series',
                  xt: layout.seriesXTicks,
                  yt: layout.seriesYTicks,
                  fx: formatX,
                },
                {
                  panel: cp,
                  name: 'scatter',
                  xt: layout.scatterXTicks,
                  yt: layout.scatterYTicks,
                  fx: formatValue,
                },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-lag-plot-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-lag-plot-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-lag-plot-axis"
                    data-panel={cfg.name}
                    data-axis="y"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y}
                    x2={cfg.panel.x}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  {cfg.xt.map((t, i) => (
                    <g
                      key={`xt-${cfg.name}-${i}`}
                      data-section="chart-line-lag-plot-tick"
                      data-panel={cfg.name}
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={cfg.panel.y + cfg.panel.height}
                        y2={cfg.panel.y + cfg.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-lag-plot-tick-label"
                        data-panel={cfg.name}
                        data-axis="x"
                        x={t.px}
                        y={cfg.panel.y + cfg.panel.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {cfg.fx(t.value)}
                      </text>
                    </g>
                  ))}
                  {cfg.yt.map((t, i) => (
                    <g
                      key={`yt-${cfg.name}-${i}`}
                      data-section="chart-line-lag-plot-tick"
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
                        data-section="chart-line-lag-plot-tick-label"
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
            </g>
          ) : null}

          {showPanelLabels ? (
            <g data-section="chart-line-lag-plot-panel-labels">
              <text
                data-section="chart-line-lag-plot-panel-label"
                data-panel="series"
                x={sp.x + sp.width / 2}
                y={sp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Series
              </text>
              <text
                data-section="chart-line-lag-plot-panel-label"
                data-panel="scatter"
                x={cp.x + cp.width / 2}
                y={cp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Lag-{layout.lag} Scatter
              </text>
            </g>
          ) : null}

          <path
            role="graphics-symbol"
            tabIndex={0}
            aria-label="Series line"
            data-section="chart-line-lag-plot-line-path"
            d={layout.linePath}
            fill="none"
            stroke={seriesColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {showSeriesDots ? (
            <g data-section="chart-line-lag-plot-series-dots">
              {layout.seriesDots.map((d) => {
                const isHover =
                  hover?.kind === 'series' && hover.index === d.index;
                return (
                  <circle
                    key={`sd-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Sample ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-lag-plot-series-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={seriesColor}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    onMouseEnter={() => {
                      setHover({ kind: 'series', index: d.index });
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHover({ kind: 'series', index: d.index });
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onSampleClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}

          {showIdentityLine && layout.identityPath ? (
            <path
              data-section="chart-line-lag-plot-identity-line"
              d={layout.identityPath}
              fill="none"
              stroke={identityColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
            />
          ) : null}

          <g data-section="chart-line-lag-plot-scatter-dots">
            {layout.scatterDots.map((p) => {
              const isHover =
                hover?.kind === 'scatter' && hover.index === p.index;
              return (
                <circle
                  key={`cd-${p.index}`}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Lag pair at t ${p.t}: lagged ${formatValue(p.laggedValue)}, current ${formatValue(p.currentValue)}`}
                  data-section="chart-line-lag-plot-scatter-dot"
                  data-pair-index={p.index}
                  data-t={p.t}
                  data-lagged-value={p.laggedValue}
                  data-current-value={p.currentValue}
                  data-above-diagonal={p.aboveDiagonal ? 'true' : 'false'}
                  cx={p.px}
                  cy={p.py}
                  r={isHover ? scatterDotRadius + 1.5 : scatterDotRadius}
                  fill={scatterColor}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  onMouseEnter={() => {
                    setHover({ kind: 'scatter', index: p.index });
                    setTooltipPos({ px: p.px, py: p.py });
                  }}
                  onMouseLeave={clearHover}
                  onFocus={() => {
                    setHover({ kind: 'scatter', index: p.index });
                    setTooltipPos({ px: p.px, py: p.py });
                  }}
                  onBlur={clearHover}
                  onClick={() => onPairClick?.({ pair: p })}
                />
              );
            })}
          </g>
        </svg>

        {showTooltip && hover && tooltipPos
          ? (() => {
              if (hover.kind === 'series') {
                const d = layout.seriesDots.find(
                  (x) => x.index === hover.index,
                );
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-lag-plot-tooltip"
                    data-tooltip-kind="series"
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
                      minWidth: 130,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-lag-plot-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-lag-plot-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                  </div>
                );
              }
              const p = layout.scatterDots.find(
                (x) => x.index === hover.index,
              );
              if (!p) return null;
              return (
                <div
                  data-section="chart-line-lag-plot-tooltip"
                  data-tooltip-kind="scatter"
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
                    minWidth: 180,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-lag-plot-tooltip-pair"
                    style={{ color: scatterColor, fontWeight: 600 }}
                  >
                    Pair t={p.t}
                  </div>
                  <div data-section="chart-line-lag-plot-tooltip-lagged">
                    lagged (t-{layout.lag}): {formatValue(p.laggedValue)}
                  </div>
                  <div data-section="chart-line-lag-plot-tooltip-current">
                    current (t): {formatValue(p.currentValue)}
                  </div>
                  <div data-section="chart-line-lag-plot-tooltip-delta">
                    delta: {p.currentValue - p.laggedValue >= 0 ? '+' : ''}
                    {formatValue(p.currentValue - p.laggedValue)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showFooter ? (
        <div
          data-section="chart-line-lag-plot-footer"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 10,
            color: '#64748b',
          }}
        >
          <span data-section="chart-line-lag-plot-footer-stats">
            lag={layout.lag} pairs={layout.pairCount} r=
            {formatCorrelation(layout.correlation)}
          </span>
          <span data-section="chart-line-lag-plot-footer-identity">
            diagonal: y = x identity
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineLagPlot.displayName = 'ChartLineLagPlot';
