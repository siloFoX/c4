import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_NVI_WIDTH = 560;
export const DEFAULT_CHART_LINE_NVI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_NVI_PADDING = 40;
export const DEFAULT_CHART_LINE_NVI_GAP = 12;
export const DEFAULT_CHART_LINE_NVI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_NVI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_NVI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_NVI_BASE = 1000;
export const DEFAULT_CHART_LINE_NVI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_NVI_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_NVI_NVI_COLOR = '#4f46e5';
export const DEFAULT_CHART_LINE_NVI_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_NVI_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_NVI_BASE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_NVI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_NVI_AXIS_COLOR = '#cbd5e1';

export type ChartLineNviState = 'up' | 'down' | 'flat';

export interface ChartLineNviPoint {
  x: number;
  value: number;
  volume: number;
}

export interface ChartLineNviSample {
  index: number;
  x: number;
  value: number;
  volume: number;
  nvi: number;
  state: ChartLineNviState;
}

export interface ChartLineNviRun {
  series: ChartLineNviPoint[];
  base: number;
  nvi: number[];
  samples: ChartLineNviSample[];
  nviFinal: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineNviPriceDot {
  index: number;
  x: number;
  value: number;
  volume: number;
  nvi: number;
  state: ChartLineNviState;
  px: number;
  py: number;
}

export interface ChartLineNviMarker {
  index: number;
  x: number;
  nvi: number;
  state: ChartLineNviState;
  px: number;
  py: number;
}

export interface ChartLineNviPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineNviLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineNviPanel;
  nviPanel: ChartLineNviPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  nviYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  nviYMin: number;
  nviYMax: number;
  pricePath: string;
  priceDots: ChartLineNviPriceDot[];
  nviPath: string;
  nviMarkers: ChartLineNviMarker[];
  baseY: number;
  base: number;
  nviFinal: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineNviLayoutOptions {
  data: readonly ChartLineNviPoint[];
  base?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineNviProps {
  data: readonly ChartLineNviPoint[];
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
  nviColor?: string;
  upColor?: string;
  downColor?: string;
  baseColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showNvi?: boolean;
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
  onPointClick?: (payload: { point: ChartLineNviPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineNviFinitePoints(
  points: readonly ChartLineNviPoint[] | null | undefined,
): ChartLineNviPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineNviPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.value) &&
      isFiniteNumber(p.volume) &&
      p.volume >= 0,
  );
}

/**
 * Coerce a Negative Volume Index base value. A non-finite or
 * non-positive value falls back to `DEFAULT_CHART_LINE_NVI_BASE`.
 */
export function normalizeLineNviBase(base: number): number {
  if (!isFiniteNumber(base) || base <= 0) return DEFAULT_CHART_LINE_NVI_BASE;
  return base;
}

/**
 * The Negative Volume Index -- a cumulative index seeded at
 * `base` that updates only on bars whose volume fell from the
 * prior bar:
 *
 *   NVI[i] = NVI[i-1] * close[i] / close[i-1]   (lower-volume bar)
 *   NVI[i] = NVI[i-1]                           (otherwise)
 *
 * so it compounds the price's percent change on the quiet bars
 * and holds flat on the rest.
 */
export function computeLineNviIndex(
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  base: number,
): number[] {
  if (!Array.isArray(closes) || !Array.isArray(volumes)) return [];
  const b = normalizeLineNviBase(base);
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
      v < pv &&
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

function classifyState(curr: number, prev: number): ChartLineNviState {
  if (curr > prev) return 'up';
  if (curr < prev) return 'down';
  return 'flat';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLineNvi(
  points: readonly ChartLineNviPoint[] | null | undefined,
  options?: { base?: number },
): ChartLineNviRun {
  const finite = getLineNviFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const base = normalizeLineNviBase(
    options?.base ?? DEFAULT_CHART_LINE_NVI_BASE,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      base,
      nvi: [],
      samples: [],
      nviFinal: NaN,
      upCount: 0,
      downCount: 0,
      flatCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const volumes = series.map((p) => p.volume);
  const nvi = computeLineNviIndex(closes, volumes, base);

  const samples: ChartLineNviSample[] = series.map((p, i) => {
    const v = nvi[i] ?? base;
    const prev = i > 0 ? (nvi[i - 1] ?? base) : v;
    return {
      index: i,
      x: p.x,
      value: p.value,
      volume: p.volume,
      nvi: v,
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
    nvi,
    samples,
    nviFinal: nvi[n - 1] ?? NaN,
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

export function computeLineNviLayout(
  options: ComputeLineNviLayoutOptions,
): ChartLineNviLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_NVI_GAP,
    tickCount = DEFAULT_CHART_LINE_NVI_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_NVI_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineNvi(data, {
    ...(isFiniteNumber(options.base) ? { base: options.base } : {}),
  });

  const emptyPanel: ChartLineNviPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineNviLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    nviPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    nviYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    nviYMin: 0,
    nviYMax: 0,
    pricePath: '',
    priceDots: [],
    nviPath: '',
    nviMarkers: [],
    baseY: 0,
    base: run.base,
    nviFinal: NaN,
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
  const nviHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineNviPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const nviPanel: ChartLineNviPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: nviHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let nviLo = run.base;
  let nviHi = run.base;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
    if (s.nvi < nviLo) nviLo = s.nvi;
    if (s.nvi > nviHi) nviHi = s.nvi;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  if (nviLo === nviHi) {
    nviLo -= 1;
    nviHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const nviRange = nviHi - nviLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectNviY = (v: number): number =>
    nviPanel.y + nviPanel.height - ((v - nviLo) / nviRange) * nviPanel.height;

  const priceDots: ChartLineNviPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    volume: s.volume,
    nvi: s.nvi,
    state: s.state,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const nviMarkers: ChartLineNviMarker[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    nvi: s.nvi,
    state: s.state,
    px: projectX(s.x),
    py: projectNviY(s.nvi),
  }));

  return {
    ok: true,
    width,
    height,
    pricePanel,
    nviPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    nviYTicks: computeTicks(nviLo, nviHi, tickCount).map((v) => ({
      value: v,
      py: projectNviY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    nviYMin: nviLo,
    nviYMax: nviHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    nviPath: buildPath(nviMarkers.map((m) => ({ px: m.px, py: m.py }))),
    nviMarkers,
    baseY: projectNviY(run.base),
    base: run.base,
    nviFinal: run.nviFinal,
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

export function describeLineNviChart(
  data: readonly ChartLineNviPoint[] | null | undefined,
  options?: { base?: number },
): string {
  const run = runLineNvi(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Negative Volume Index (base ${run.base}): the top panel plots the price; the bottom panel plots the NVI. The NVI is a cumulative index that updates only on bars whose volume fell from the prior bar -- the lower-volume bars where, by Dysart's theory, informed money trades quietly. On a lower-volume bar the index changes by the price's percent change; on a higher-volume bar it holds flat. An NVI above its starting base means the price has gained ground on quiet days. The NVI rose on ${run.upCount} bars, fell on ${run.downCount} and held on ${run.flatCount} across ${run.samples.length} bars.`;
}

const NVI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineNvi = forwardRef<HTMLDivElement, ChartLineNviProps>(
  function ChartLineNvi(
    props: ChartLineNviProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      base,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_NVI_WIDTH,
      height = DEFAULT_CHART_LINE_NVI_HEIGHT,
      padding = DEFAULT_CHART_LINE_NVI_PADDING,
      gap = DEFAULT_CHART_LINE_NVI_GAP,
      tickCount = DEFAULT_CHART_LINE_NVI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_NVI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_NVI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_NVI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_NVI_PRICE_COLOR,
      nviColor = DEFAULT_CHART_LINE_NVI_NVI_COLOR,
      upColor = DEFAULT_CHART_LINE_NVI_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_NVI_DOWN_COLOR,
      baseColor = DEFAULT_CHART_LINE_NVI_BASE_COLOR,
      gridColor = DEFAULT_CHART_LINE_NVI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_NVI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showNvi = true,
      showBaseLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Negative Volume Index',
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
        computeLineNviLayout({
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
        describeLineNviChart(data, {
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
          data-section="chart-line-nvi"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-nvi-aria-desc"
            style={NVI_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const np = layout.nviPanel;
    const priceVisible = !hiddenSet.has('price');
    const nviVisible = showNvi && !hiddenSet.has('nvi');

    const stateColor = (state: ChartLineNviState): string => {
      if (state === 'up') return upColor;
      if (state === 'down') return downColor;
      return nviColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'nvi', label: 'NVI', color: nviColor },
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
        data-section="chart-line-nvi"
        data-empty="false"
        data-base={layout.base}
        data-nvi-final={layout.nviFinal}
        data-up-count={layout.upCount}
        data-down-count={layout.downCount}
        data-flat-count={layout.flatCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-nvi-aria-desc"
          style={NVI_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-nvi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-nvi-badge"
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
                data-section="chart-line-nvi-badge-icon"
                aria-hidden="true"
                style={{ color: nviColor }}
              >
                NVI
              </span>
              <span data-section="chart-line-nvi-badge-config">
                {layout.base}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-nvi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-nvi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-nvi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.nviYTicks.map((t, i) => (
                  <line
                    key={`gn-${i}`}
                    data-section="chart-line-nvi-grid-line"
                    data-panel="nvi"
                    x1={np.x}
                    x2={np.x + np.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-nvi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-nvi-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-nvi-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-nvi-axis"
                  data-panel="nvi"
                  data-axis="y"
                  x1={np.x}
                  y1={np.y}
                  x2={np.x}
                  y2={np.y + np.height}
                />
                <line
                  data-section="chart-line-nvi-axis"
                  data-panel="nvi"
                  data-axis="x"
                  x1={np.x}
                  y1={np.y + np.height}
                  x2={np.x + np.width}
                  y2={np.y + np.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-nvi-tick-label"
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
                {layout.nviYTicks.map((t, i) => (
                  <text
                    key={`nyt-${i}`}
                    data-section="chart-line-nvi-tick-label"
                    data-panel="nvi"
                    data-axis="y"
                    x={np.x - 6}
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
                    data-section="chart-line-nvi-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={np.y + np.height + 14}
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
              data-section="chart-line-nvi-panel-label"
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
              data-section="chart-line-nvi-panel-label"
              data-panel="nvi"
              x={np.x + 2}
              y={np.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              NVI
            </text>

            {nviVisible && showBaseLine ? (
              <line
                data-section="chart-line-nvi-base-line"
                x1={np.x}
                x2={np.x + np.width}
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
                data-section="chart-line-nvi-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-nvi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-nvi-dot"
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

            {nviVisible && layout.nviPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Negative Volume Index line"
                data-section="chart-line-nvi-nvi-line"
                d={layout.nviPath}
                fill="none"
                stroke={nviColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {nviVisible ? (
              <g data-section="chart-line-nvi-markers">
                {layout.nviMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`NVI at x ${formatX(m.x)}: ${formatValue(m.nvi)}, ${m.state}`}
                      data-section="chart-line-nvi-marker"
                      data-point-index={m.index}
                      data-nvi={m.nvi}
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
                    data-section="chart-line-nvi-tooltip"
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
                    <div data-section="chart-line-nvi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-nvi-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-nvi-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-nvi-tooltip-nvi">
                      nvi: {formatValue(d.nvi)}
                    </div>
                    <div data-section="chart-line-nvi-tooltip-state">
                      state: {d.state}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-nvi-legend"
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
                  data-section="chart-line-nvi-legend-item"
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
                    data-section="chart-line-nvi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-nvi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-nvi-legend-stats"
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

ChartLineNvi.displayName = 'ChartLineNvi';
