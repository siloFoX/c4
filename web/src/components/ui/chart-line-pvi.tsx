import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PVI_WIDTH = 560;
export const DEFAULT_CHART_LINE_PVI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_PVI_PADDING = 40;
export const DEFAULT_CHART_LINE_PVI_GAP = 12;
export const DEFAULT_CHART_LINE_PVI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PVI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PVI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PVI_BASE = 1000;
export const DEFAULT_CHART_LINE_PVI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_PVI_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PVI_PVI_COLOR = '#c026d3';
export const DEFAULT_CHART_LINE_PVI_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PVI_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PVI_BASE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PVI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PVI_AXIS_COLOR = '#cbd5e1';

export type ChartLinePviState = 'up' | 'down' | 'flat';

export interface ChartLinePviPoint {
  x: number;
  value: number;
  volume: number;
}

export interface ChartLinePviSample {
  index: number;
  x: number;
  value: number;
  volume: number;
  pvi: number;
  state: ChartLinePviState;
}

export interface ChartLinePviRun {
  series: ChartLinePviPoint[];
  base: number;
  pvi: number[];
  samples: ChartLinePviSample[];
  pviFinal: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLinePviPriceDot {
  index: number;
  x: number;
  value: number;
  volume: number;
  pvi: number;
  state: ChartLinePviState;
  px: number;
  py: number;
}

export interface ChartLinePviMarker {
  index: number;
  x: number;
  pvi: number;
  state: ChartLinePviState;
  px: number;
  py: number;
}

export interface ChartLinePviPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLinePviLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLinePviPanel;
  pviPanel: ChartLinePviPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  pviYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pviYMin: number;
  pviYMax: number;
  pricePath: string;
  priceDots: ChartLinePviPriceDot[];
  pviPath: string;
  pviMarkers: ChartLinePviMarker[];
  baseY: number;
  base: number;
  pviFinal: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLinePviLayoutOptions {
  data: readonly ChartLinePviPoint[];
  base?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLinePviProps {
  data: readonly ChartLinePviPoint[];
  base?: number;
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
  pviColor?: string;
  upColor?: string;
  downColor?: string;
  baseColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPvi?: boolean;
  showBaseLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLinePviPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLinePviFinitePoints(
  points: readonly ChartLinePviPoint[] | null | undefined,
): ChartLinePviPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLinePviPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.value) &&
      isFiniteNumber(p.volume) &&
      p.volume >= 0,
  );
}

/**
 * Coerce a Positive Volume Index base value. A non-finite or
 * non-positive value falls back to `DEFAULT_CHART_LINE_PVI_BASE`.
 */
export function normalizeLinePviBase(base: number): number {
  if (!isFiniteNumber(base) || base <= 0) return DEFAULT_CHART_LINE_PVI_BASE;
  return base;
}

/**
 * The Positive Volume Index -- a cumulative index seeded at
 * `base` that updates only on bars whose volume rose from the
 * prior bar:
 *
 *   PVI[i] = PVI[i-1] * close[i] / close[i-1]   (higher-volume bar)
 *   PVI[i] = PVI[i-1]                           (otherwise)
 *
 * so it compounds the price's percent change on the loud bars
 * and holds flat on the rest.
 */
export function computeLinePviIndex(
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  base: number,
): number[] {
  if (!Array.isArray(closes) || !Array.isArray(volumes)) return [];
  const b = normalizeLinePviBase(base);
  const n = closes.length;
  const out: number[] = new Array(n).fill(b);
  if (n === 0) return out;
  out[0] = b;
  let prev = b;
  for (let i = 1; i < n; i += 1) {
    const cur = closes[i];
    const pc = closes[i - 1];
    const v = volumes[i];
    const pv = volumes[i - 1];
    let next = prev;
    if (
      isFiniteNumber(v) &&
      isFiniteNumber(pv) &&
      v > pv &&
      isFiniteNumber(cur) &&
      isFiniteNumber(pc) &&
      pc !== 0
    ) {
      next = (prev * cur) / pc;
    }
    out[i] = next;
    prev = next;
  }
  return out;
}

function classifyState(curr: number, prev: number): ChartLinePviState {
  if (curr > prev) return 'up';
  if (curr < prev) return 'down';
  return 'flat';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLinePvi(
  points: readonly ChartLinePviPoint[] | null | undefined,
  options?: { base?: number },
): ChartLinePviRun {
  const finite = getLinePviFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const base = normalizeLinePviBase(
    options?.base ?? DEFAULT_CHART_LINE_PVI_BASE,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      base,
      pvi: [],
      samples: [],
      pviFinal: NaN,
      upCount: 0,
      downCount: 0,
      flatCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const volumes = series.map((p) => p.volume);
  const pvi = computeLinePviIndex(closes, volumes, base);

  const samples: ChartLinePviSample[] = series.map((p, i) => {
    const v = pvi[i] ?? base;
    const prev = i > 0 ? (pvi[i - 1] ?? base) : v;
    return {
      index: i,
      x: p.x,
      value: p.value,
      volume: p.volume,
      pvi: v,
      state: i > 0 ? classifyState(v, prev) : 'flat',
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  for (const s of samples) {
    if (s.state === 'up') upCount += 1;
    else if (s.state === 'down') downCount += 1;
    else flatCount += 1;
  }

  return {
    series,
    base,
    pvi,
    samples,
    pviFinal: pvi[n - 1] ?? NaN,
    upCount,
    downCount,
    flatCount,
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

export function computeLinePviLayout(
  options: ComputeLinePviLayoutOptions,
): ChartLinePviLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_PVI_GAP,
    tickCount = DEFAULT_CHART_LINE_PVI_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_PVI_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLinePvi(data, {
    ...(isFiniteNumber(options.base) ? { base: options.base } : {}),
  });

  const emptyPanel: ChartLinePviPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLinePviLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    pviPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    pviYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pviYMin: 0,
    pviYMax: 0,
    pricePath: '',
    priceDots: [],
    pviPath: '',
    pviMarkers: [],
    baseY: 0,
    base: run.base,
    pviFinal: NaN,
    upCount: 0,
    downCount: 0,
    flatCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const pviHeight = usableHeight - priceHeight;

  const pricePanel: ChartLinePviPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const pviPanel: ChartLinePviPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: pviHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let pviLo = run.base;
  let pviHi = run.base;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
    if (s.pvi < pviLo) pviLo = s.pvi;
    if (s.pvi > pviHi) pviHi = s.pvi;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  if (pviLo === pviHi) {
    pviLo -= 1;
    pviHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const pviRange = pviHi - pviLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectPviY = (v: number): number =>
    pviPanel.y + pviPanel.height - ((v - pviLo) / pviRange) * pviPanel.height;

  const priceDots: ChartLinePviPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    volume: s.volume,
    pvi: s.pvi,
    state: s.state,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const pviMarkers: ChartLinePviMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    pvi: s.pvi,
    state: s.state,
    px: projectX(s.x),
    py: projectPviY(s.pvi),
  }));

  return {
    ok: true,
    width,
    height,
    pricePanel,
    pviPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    pviYTicks: computeTicks(pviLo, pviHi, tickCount).map((v) => ({
      value: v,
      py: projectPviY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pviYMin: pviLo,
    pviYMax: pviHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    pviPath: buildPath(pviMarkers.map((m) => ({ px: m.px, py: m.py }))),
    pviMarkers,
    baseY: projectPviY(run.base),
    base: run.base,
    pviFinal: run.pviFinal,
    upCount: run.upCount,
    downCount: run.downCount,
    flatCount: run.flatCount,
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

export function describeLinePviChart(
  data: readonly ChartLinePviPoint[] | null | undefined,
  options?: { base?: number },
): string {
  const run = runLinePvi(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Positive Volume Index (base ${run.base}): the top panel plots the price; the bottom panel plots the PVI. The PVI is a cumulative index that updates only on bars whose volume rose from the prior bar -- the higher-volume bars where the crowd is most active. On a higher-volume bar the index changes by the price's percent change; on a lower-volume bar it holds flat. An PVI above its starting base means the price has gained ground on the busy days. The PVI rose on ${run.upCount} bars, fell on ${run.downCount} and held on ${run.flatCount} across ${run.samples.length} bars.`;
}

const PVI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLinePvi = forwardRef<HTMLDivElement, ChartLinePviProps>(
  function ChartLinePvi(
    props: ChartLinePviProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      base,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_PVI_WIDTH,
      height = DEFAULT_CHART_LINE_PVI_HEIGHT,
      padding = DEFAULT_CHART_LINE_PVI_PADDING,
      gap = DEFAULT_CHART_LINE_PVI_GAP,
      tickCount = DEFAULT_CHART_LINE_PVI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_PVI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_PVI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_PVI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_PVI_PRICE_COLOR,
      pviColor = DEFAULT_CHART_LINE_PVI_PVI_COLOR,
      upColor = DEFAULT_CHART_LINE_PVI_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_PVI_DOWN_COLOR,
      baseColor = DEFAULT_CHART_LINE_PVI_BASE_COLOR,
      gridColor = DEFAULT_CHART_LINE_PVI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_PVI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showPvi = true,
      showBaseLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Positive Volume Index',
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
        computeLinePviLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(base) ? { base } : {}),
        }),
      [data, width, height, padding, gap, tickCount, pricePanelRatio, base],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLinePviChart(data, {
          ...(isFiniteNumber(base) ? { base } : {}),
        }),
      [ariaDescription, data, base],
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
          data-section="chart-line-pvi"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-pvi-aria-desc"
            style={PVI_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const vp = layout.pviPanel;
    const priceVisible = !hiddenSet.has('price');
    const pviVisible = showPvi && !hiddenSet.has('pvi');

    const stateColor = (state: ChartLinePviState): string => {
      if (state === 'up') return upColor;
      if (state === 'down') return downColor;
      return pviColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'pvi', label: 'PVI', color: pviColor },
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
        data-section="chart-line-pvi"
        data-empty="false"
        data-base={layout.base}
        data-pvi-final={layout.pviFinal}
        data-up-count={layout.upCount}
        data-down-count={layout.downCount}
        data-flat-count={layout.flatCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-pvi-aria-desc"
          style={PVI_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-pvi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-pvi-badge"
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
                data-section="chart-line-pvi-badge-icon"
                aria-hidden="true"
                style={{ color: pviColor }}
              >
                PVI
              </span>
              <span data-section="chart-line-pvi-badge-config">
                {layout.base}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-pvi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-pvi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-pvi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.pviYTicks.map((t, i) => (
                  <line
                    key={`gv-${i}`}
                    data-section="chart-line-pvi-grid-line"
                    data-panel="pvi"
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
                data-section="chart-line-pvi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-pvi-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pvi-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-pvi-axis"
                  data-panel="pvi"
                  data-axis="y"
                  x1={vp.x}
                  y1={vp.y}
                  x2={vp.x}
                  y2={vp.y + vp.height}
                />
                <line
                  data-section="chart-line-pvi-axis"
                  data-panel="pvi"
                  data-axis="x"
                  x1={vp.x}
                  y1={vp.y + vp.height}
                  x2={vp.x + vp.width}
                  y2={vp.y + vp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-pvi-tick-label"
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
                {layout.pviYTicks.map((t, i) => (
                  <text
                    key={`vyt-${i}`}
                    data-section="chart-line-pvi-tick-label"
                    data-panel="pvi"
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
                    data-section="chart-line-pvi-tick-label"
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
              data-section="chart-line-pvi-panel-label"
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
              data-section="chart-line-pvi-panel-label"
              data-panel="pvi"
              x={vp.x + 2}
              y={vp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              PVI
            </text>

            {pviVisible && showBaseLine ? (
              <line
                data-section="chart-line-pvi-base-line"
                x1={vp.x}
                x2={vp.x + vp.width}
                y1={layout.baseY}
                y2={layout.baseY}
                stroke={baseColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-pvi-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-pvi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-pvi-dot"
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

            {pviVisible && layout.pviPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Positive Volume Index line"
                data-section="chart-line-pvi-pvi-line"
                d={layout.pviPath}
                fill="none"
                stroke={pviColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {pviVisible ? (
              <g data-section="chart-line-pvi-markers">
                {layout.pviMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`PVI at x ${formatX(m.x)}: ${formatValue(m.pvi)}, ${m.state}`}
                      data-section="chart-line-pvi-marker"
                      data-point-index={m.index}
                      data-pvi={m.pvi}
                      data-state={m.state}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={stateColor(m.state)}
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
                    data-section="chart-line-pvi-tooltip"
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
                    <div data-section="chart-line-pvi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-pvi-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-pvi-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-pvi-tooltip-pvi">
                      pvi: {formatValue(d.pvi)}
                    </div>
                    <div data-section="chart-line-pvi-tooltip-state">
                      state: {d.state}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-pvi-legend"
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
                  data-section="chart-line-pvi-legend-item"
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
                    data-section="chart-line-pvi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-pvi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-pvi-legend-stats"
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

ChartLinePvi.displayName = 'ChartLinePvi';
