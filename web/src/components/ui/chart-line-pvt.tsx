import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PVT_WIDTH = 560;
export const DEFAULT_CHART_LINE_PVT_HEIGHT = 360;
export const DEFAULT_CHART_LINE_PVT_PADDING = 40;
export const DEFAULT_CHART_LINE_PVT_GAP = 26;
export const DEFAULT_CHART_LINE_PVT_PRICE_PANEL_RATIO = 0.5;
export const DEFAULT_CHART_LINE_PVT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PVT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PVT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PVT_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PVT_PVT_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_PVT_RISING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PVT_FALLING_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PVT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_PVT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PVT_AXIS_COLOR = '#cbd5e1';

export type ChartLinePvtFlow = 'rising' | 'falling' | 'flat';

export interface ChartLinePvtPoint {
  x: number;
  close: number;
  volume: number;
}

export interface ChartLinePvtSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  roc: number;
  pvc: number;
  pvt: number;
  flow: ChartLinePvtFlow;
}

export interface ChartLinePvtRun {
  series: ChartLinePvtPoint[];
  roc: number[];
  pvc: number[];
  pvt: number[];
  samples: ChartLinePvtSample[];
  pvtFinal: number;
  pvtMin: number;
  pvtMax: number;
  risingCount: number;
  fallingCount: number;
  ok: boolean;
}

export interface ChartLinePvtPriceDot {
  index: number;
  x: number;
  close: number;
  volume: number;
  roc: number;
  pvc: number;
  pvt: number;
  flow: ChartLinePvtFlow;
  px: number;
  py: number;
}

export interface ChartLinePvtMarker {
  index: number;
  x: number;
  pvt: number;
  flow: ChartLinePvtFlow;
  px: number;
  py: number;
}

export interface ChartLinePvtPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLinePvtLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLinePvtPanel;
  pvtPanel: ChartLinePvtPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  pvtYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pvtYMin: number;
  pvtYMax: number;
  pricePath: string;
  priceDots: ChartLinePvtPriceDot[];
  pvtPath: string;
  markers: ChartLinePvtMarker[];
  zeroY: number;
  zeroInRange: boolean;
  pvtFinal: number;
  pvtMin: number;
  pvtMax: number;
  risingCount: number;
  fallingCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLinePvtLayoutOptions {
  data: readonly ChartLinePvtPoint[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLinePvtProps {
  data: readonly ChartLinePvtPoint[];
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
  priceColor?: string;
  pvtColor?: string;
  risingColor?: string;
  fallingColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPvt?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLinePvtPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLinePvtFinitePoints(
  points: readonly ChartLinePvtPoint[] | null | undefined,
): ChartLinePvtPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLinePvtPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.close) &&
      isFiniteNumber(p.volume),
  );
}

/**
 * The Price Volume Trend. Each bar's volume is scaled by its
 * percentage price change `(close[i] - close[i-1]) / close[i-1]` into
 * a price-volume contribution, and the PVT is the running cumulative
 * total of that contribution. Index 0 has no prior close so its
 * contribution is zero.
 */
export function computeLinePvt(
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
): { roc: number[]; pvc: number[]; pvt: number[] } {
  if (!Array.isArray(closes) || !Array.isArray(volumes)) {
    return { roc: [], pvc: [], pvt: [] };
  }
  const n = Math.min(closes.length, volumes.length);
  const roc: number[] = new Array(n);
  const pvc: number[] = new Array(n);
  const pvt: number[] = new Array(n);
  let running = 0;
  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      roc[i] = 0;
    } else {
      const base = closes[i - 1]!;
      const rawRoc = base === 0 ? 0 : (closes[i]! - base) / base;
      roc[i] = rawRoc === 0 ? 0 : rawRoc;
    }
    const rawPvc = volumes[i]! * roc[i]!;
    pvc[i] = rawPvc === 0 ? 0 : rawPvc;
    running = i === 0 ? pvc[i]! : running + pvc[i]!;
    pvt[i] = running === 0 ? 0 : running;
  }
  return { roc, pvc, pvt };
}

function classifyFlow(pvc: number): ChartLinePvtFlow {
  if (pvc > 0) return 'rising';
  if (pvc < 0) return 'falling';
  return 'flat';
}

export function runLinePvt(
  points: readonly ChartLinePvtPoint[] | null | undefined,
): ChartLinePvtRun {
  const finite = getLinePvtFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      roc: [],
      pvc: [],
      pvt: [],
      samples: [],
      pvtFinal: NaN,
      pvtMin: NaN,
      pvtMax: NaN,
      risingCount: 0,
      fallingCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.close);
  const volumes = series.map((p) => p.volume);
  const { roc, pvc, pvt } = computeLinePvt(closes, volumes);

  const samples: ChartLinePvtSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    close: p.close,
    volume: p.volume,
    roc: roc[i]!,
    pvc: pvc[i]!,
    pvt: pvt[i]!,
    flow: classifyFlow(pvc[i]!),
  }));

  let pvtMin = NaN;
  let pvtMax = NaN;
  let risingCount = 0;
  let fallingCount = 0;
  for (const s of samples) {
    if (Number.isNaN(pvtMin) || s.pvt < pvtMin) pvtMin = s.pvt;
    if (Number.isNaN(pvtMax) || s.pvt > pvtMax) pvtMax = s.pvt;
    if (s.flow === 'rising') risingCount += 1;
    if (s.flow === 'falling') fallingCount += 1;
  }

  return {
    series,
    roc,
    pvc,
    pvt,
    samples,
    pvtFinal: pvt[n - 1]!,
    pvtMin,
    pvtMax,
    risingCount,
    fallingCount,
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

export function computeLinePvtLayout(
  options: ComputeLinePvtLayoutOptions,
): ChartLinePvtLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_PVT_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_PVT_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_PVT_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLinePvtPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLinePvt(data);
  const empty: ChartLinePvtLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    pvtPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    pvtYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pvtYMin: 0,
    pvtYMax: 0,
    pricePath: '',
    priceDots: [],
    pvtPath: '',
    markers: [],
    zeroY: 0,
    zeroInRange: false,
    pvtFinal: NaN,
    pvtMin: NaN,
    pvtMax: NaN,
    risingCount: 0,
    fallingCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const pvtH = usableHeight - priceH;
  if (priceH <= 0 || pvtH <= 0) return empty;

  const pricePanel: ChartLinePvtPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const pvtPanel: ChartLinePvtPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: pvtH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let vLo = Number.POSITIVE_INFINITY;
  let vHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < pyLo) pyLo = s.close;
    if (s.close > pyHi) pyHi = s.close;
    if (s.pvt < vLo) vLo = s.pvt;
    if (s.pvt > vHi) vHi = s.pvt;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  if (vLo === vHi) {
    vLo -= 0.5;
    vHi += 0.5;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectPvtY = (v: number): number =>
    pvtPanel.y + pvtPanel.height - ((v - vLo) / (vHi - vLo)) * pvtPanel.height;

  const priceDots: ChartLinePvtPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    volume: s.volume,
    roc: s.roc,
    pvc: s.pvc,
    pvt: s.pvt,
    flow: s.flow,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const pvtPts: { px: number; py: number }[] = [];
  const markers: ChartLinePvtMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    const py = projectPvtY(s.pvt);
    pvtPts.push({ px, py });
    markers.push({ index: s.index, x: s.x, pvt: s.pvt, flow: s.flow, px, py });
  }

  const zeroInRange = vLo <= 0 && vHi >= 0;

  return {
    ok: true,
    width,
    height,
    pricePanel,
    pvtPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    pvtYTicks: computeTicks(vLo, vHi, tickCount).map((v) => ({
      value: v,
      py: projectPvtY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pvtYMin: vLo,
    pvtYMax: vHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    pvtPath: buildPath(pvtPts),
    markers,
    zeroY: projectPvtY(0),
    zeroInRange,
    pvtFinal: run.pvtFinal,
    pvtMin: run.pvtMin,
    pvtMax: run.pvtMax,
    risingCount: run.risingCount,
    fallingCount: run.fallingCount,
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

export function describeLinePvtChart(
  data: readonly ChartLinePvtPoint[] | null | undefined,
): string {
  const run = runLinePvt(data);
  if (!run.ok) return 'No data';
  return `Line chart with a Price Volume Trend (PVT) panel: each bar adds its volume scaled by the percentage price change to a running cumulative total, so volume on a larger move shifts the line further. A rising PVT signals buying pressure, a falling PVT signals selling pressure. ${run.risingCount} rising and ${run.fallingCount} falling bars across ${run.samples.length} periods.`;
}

const PVT_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLinePvt = forwardRef<HTMLDivElement, ChartLinePvtProps>(
  function ChartLinePvt(
    props: ChartLinePvtProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_PVT_WIDTH,
      height = DEFAULT_CHART_LINE_PVT_HEIGHT,
      padding = DEFAULT_CHART_LINE_PVT_PADDING,
      gap = DEFAULT_CHART_LINE_PVT_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_PVT_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_PVT_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_PVT_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_PVT_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_PVT_PRICE_COLOR,
      pvtColor = DEFAULT_CHART_LINE_PVT_PVT_COLOR,
      risingColor = DEFAULT_CHART_LINE_PVT_RISING_COLOR,
      fallingColor = DEFAULT_CHART_LINE_PVT_FALLING_COLOR,
      zeroColor = DEFAULT_CHART_LINE_PVT_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_PVT_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_PVT_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showPvt = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Price Volume Trend panel',
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
        computeLinePvtLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
        }),
      [data, width, height, padding, gap, pricePanelRatio, tickCount],
    );

    const summary = useMemo(
      () => ariaDescription ?? describeLinePvtChart(data),
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

    const flowColor = useCallback(
      (f: ChartLinePvtFlow): string =>
        f === 'rising'
          ? risingColor
          : f === 'falling'
            ? fallingColor
            : pvtColor,
      [risingColor, fallingColor, pvtColor],
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
          data-section="chart-line-pvt"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-pvt-aria-desc"
            style={PVT_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const vp = layout.pvtPanel;
    const priceVisible = !hiddenSet.has('price');
    const pvtVisible = showPvt && !hiddenSet.has('pvt');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'pvt', label: 'PVT', color: pvtColor },
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
        data-section="chart-line-pvt"
        data-empty="false"
        data-pvt-final={layout.pvtFinal}
        data-pvt-min={layout.pvtMin}
        data-pvt-max={layout.pvtMax}
        data-rising-count={layout.risingCount}
        data-falling-count={layout.fallingCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-pvt-aria-desc"
          style={PVT_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-pvt-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-pvt-badge"
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
                data-section="chart-line-pvt-badge-icon"
                aria-hidden="true"
                style={{ color: pvtColor }}
              >
                PVT
              </span>
              <span data-section="chart-line-pvt-badge-flow">
                cumulative
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-pvt-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-pvt-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-pvt-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.pvtYTicks.map((t, i) => (
                  <line
                    key={`vgy-${i}`}
                    data-section="chart-line-pvt-grid-line"
                    data-panel="pvt"
                    x1={vp.x}
                    x2={vp.x + vp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZeroLine && layout.zeroInRange ? (
              <line
                data-section="chart-line-pvt-zero-line"
                x1={vp.x}
                x2={vp.x + vp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-pvt-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: vp, name: 'pvt', yt: layout.pvtYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-pvt-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-pvt-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-pvt-axis"
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
                        data-section="chart-line-pvt-tick"
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
                          data-section="chart-line-pvt-tick-label"
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
                <g data-section="chart-line-pvt-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-pvt-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={vp.y + vp.height}
                        y2={vp.y + vp.height + 4}
                      />
                      <text
                        data-section="chart-line-pvt-tick-label"
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
                    </g>
                  ))}
                </g>
              </g>
            ) : null}

            <g data-section="chart-line-pvt-panel-labels">
              <text
                data-section="chart-line-pvt-panel-label"
                data-panel="price"
                x={pp.x + pp.width / 2}
                y={pp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Price
              </text>
              <text
                data-section="chart-line-pvt-panel-label"
                data-panel="pvt"
                x={vp.x + vp.width / 2}
                y={vp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Price Volume Trend
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-pvt-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-pvt-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-pvt-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.close}
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

            {pvtVisible && layout.pvtPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price Volume Trend line"
                data-section="chart-line-pvt-pvt-line"
                d={layout.pvtPath}
                fill="none"
                stroke={pvtColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {pvtVisible ? (
              <g data-section="chart-line-pvt-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`PVT at x ${formatX(m.x)}: ${formatValue(m.pvt)} (${m.flow})`}
                      data-section="chart-line-pvt-marker"
                      data-point-index={m.index}
                      data-pvt={m.pvt}
                      data-flow={m.flow}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={flowColor(m.flow)}
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
                    data-section="chart-line-pvt-tooltip"
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
                    <div data-section="chart-line-pvt-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div data-section="chart-line-pvt-tooltip-close">
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-pvt-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-pvt-tooltip-pvc">
                      contribution: {formatValue(d.pvc)}
                    </div>
                    <div
                      data-section="chart-line-pvt-tooltip-pvt"
                      style={{ fontWeight: 600 }}
                    >
                      pvt: {formatValue(d.pvt)}
                    </div>
                    <div data-section="chart-line-pvt-tooltip-flow">
                      flow: {d.flow}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-pvt-legend"
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
                  data-section="chart-line-pvt-legend-item"
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
                    data-section="chart-line-pvt-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-pvt-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-pvt-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.risingCount} rising, {layout.fallingCount} falling
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLinePvt.displayName = 'ChartLinePvt';
