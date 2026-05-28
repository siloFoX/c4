import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_GAPO_WIDTH = 560;
export const DEFAULT_CHART_LINE_GAPO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_GAPO_PADDING = 40;
export const DEFAULT_CHART_LINE_GAPO_GAP = 12;
export const DEFAULT_CHART_LINE_GAPO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_GAPO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_GAPO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_GAPO_PERIOD = 5;
export const DEFAULT_CHART_LINE_GAPO_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_GAPO_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_GAPO_GAPO_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_GAPO_EXPANDING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_GAPO_CONTRACTING_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_GAPO_MEAN_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_GAPO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_GAPO_AXIS_COLOR = '#cbd5e1';

export type ChartLineGapoZone =
  | 'expanding'
  | 'contracting'
  | 'steady'
  | 'none';

export interface ChartLineGapoPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineGapoSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  range: number | null;
  gapo: number | null;
  zone: ChartLineGapoZone;
}

export interface ChartLineGapoRun {
  series: ChartLineGapoPoint[];
  period: number;
  range: (number | null)[];
  gapo: (number | null)[];
  gapoMean: number;
  samples: ChartLineGapoSample[];
  gapoFinal: number;
  expandingCount: number;
  contractingCount: number;
  steadyCount: number;
  ok: boolean;
}

export interface ChartLineGapoPriceDot {
  index: number;
  x: number;
  close: number;
  range: number | null;
  gapo: number | null;
  zone: ChartLineGapoZone;
  px: number;
  py: number;
}

export interface ChartLineGapoMarker {
  index: number;
  x: number;
  gapo: number;
  zone: ChartLineGapoZone;
  px: number;
  py: number;
}

export interface ChartLineGapoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineGapoLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineGapoPanel;
  gapoPanel: ChartLineGapoPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  gapoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  gapoYMin: number;
  gapoYMax: number;
  pricePath: string;
  priceDots: ChartLineGapoPriceDot[];
  gapoPath: string;
  markers: ChartLineGapoMarker[];
  meanY: number;
  hasMean: boolean;
  period: number;
  gapoFinal: number;
  gapoMean: number;
  expandingCount: number;
  contractingCount: number;
  steadyCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineGapoLayoutOptions {
  data: readonly ChartLineGapoPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineGapoProps {
  data: readonly ChartLineGapoPoint[];
  period?: number;
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
  gapoColor?: string;
  expandingColor?: string;
  contractingColor?: string;
  meanColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMeanLine?: boolean;
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
  onPointClick?: (payload: { point: ChartLineGapoPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function getLineGapoFinitePoints(
  points: readonly ChartLineGapoPoint[] | null | undefined,
): ChartLineGapoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineGapoPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a Gopalakrishnan Range Index lookback to an integer of
 * at least 2 -- the index divides by the natural log of the
 * period, which is positive only when the period exceeds 1. A
 * non-finite or sub-2 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLineGapoPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * The high-to-low range over each trailing window of `period`
 * bars -- the highest high minus the lowest low. Bars before the
 * window is full are null.
 */
export function computeLineGapoRange(
  bars: readonly ChartLineGapoPoint[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const p = normalizeLineGapoPeriod(period, DEFAULT_CHART_LINE_GAPO_PERIOD);
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let hi = Number.NEGATIVE_INFINITY;
    let lo = Number.POSITIVE_INFINITY;
    let valid = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const b = bars[k];
      if (!b || !isFiniteNumber(b.high) || !isFiniteNumber(b.low)) {
        valid = false;
        break;
      }
      if (b.high > hi) hi = b.high;
      if (b.low < lo) lo = b.low;
    }
    if (valid) out[i] = hi - lo;
  }
  return out;
}

/**
 * The Gopalakrishnan Range Index -- the natural log of the
 * high-to-low range over the lookback span divided by the natural
 * log of the span. It climbs as the trading range widens. A bar
 * whose range is not positive (no movement) is null.
 */
export function computeLineGapo(
  bars: readonly ChartLineGapoPoint[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const p = normalizeLineGapoPeriod(period, DEFAULT_CHART_LINE_GAPO_PERIOD);
  const range = computeLineGapoRange(bars, p);
  const lnPeriod = Math.log(p);
  const n = range.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const r = range[i];
    if (r === null || r === undefined || r <= 0) continue;
    out[i] = Math.log(r) / lnPeriod;
  }
  return out;
}

export function runLineGapo(
  points: readonly ChartLineGapoPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineGapoRun {
  const finite = getLineGapoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineGapoPeriod(
    options?.period ?? DEFAULT_CHART_LINE_GAPO_PERIOD,
    DEFAULT_CHART_LINE_GAPO_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      range: [],
      gapo: [],
      gapoMean: NaN,
      samples: [],
      gapoFinal: NaN,
      expandingCount: 0,
      contractingCount: 0,
      steadyCount: 0,
      ok: false,
    };
  }

  const range = computeLineGapoRange(series, period);
  const gapo = computeLineGapo(series, period);

  let prevGapo: number | null = null;
  const samples: ChartLineGapoSample[] = series.map((p, i) => {
    const g = gapo[i] ?? null;
    let zone: ChartLineGapoZone;
    if (g === null || prevGapo === null) {
      zone = 'none';
    } else if (g > prevGapo) {
      zone = 'expanding';
    } else if (g < prevGapo) {
      zone = 'contracting';
    } else {
      zone = 'steady';
    }
    if (g !== null) prevGapo = g;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      range: range[i] ?? null,
      gapo: g,
      zone,
    };
  });

  let expandingCount = 0;
  let contractingCount = 0;
  let steadyCount = 0;
  let gapoFinal = NaN;
  let sum = 0;
  let definedCount = 0;
  for (const s of samples) {
    if (s.zone === 'expanding') expandingCount += 1;
    else if (s.zone === 'contracting') contractingCount += 1;
    else if (s.zone === 'steady') steadyCount += 1;
    if (s.gapo !== null) {
      gapoFinal = s.gapo;
      sum += s.gapo;
      definedCount += 1;
    }
  }

  return {
    series = [],
    period,
    range,
    gapo,
    gapoMean: definedCount > 0 ? sum / definedCount : NaN,
    samples,
    gapoFinal,
    expandingCount,
    contractingCount,
    steadyCount,
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

export function computeLineGapoLayout(
  options: ComputeLineGapoLayoutOptions,
): ChartLineGapoLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_GAPO_GAP,
    tickCount = DEFAULT_CHART_LINE_GAPO_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_GAPO_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineGapo(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });

  const emptyPanel: ChartLineGapoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineGapoLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    gapoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    gapoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    gapoYMin: 0,
    gapoYMax: 0,
    pricePath: '',
    priceDots: [],
    gapoPath: '',
    markers: [],
    meanY: 0,
    hasMean: false,
    period: run.period,
    gapoFinal: NaN,
    gapoMean: NaN,
    expandingCount: 0,
    contractingCount: 0,
    steadyCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const gapoHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineGapoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const gapoPanel: ChartLineGapoPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: gapoHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let gapoLo = Number.POSITIVE_INFINITY;
  let gapoHi = Number.NEGATIVE_INFINITY;
  let hasGapo = false;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < priceLo) priceLo = s.close;
    if (s.close > priceHi) priceHi = s.close;
    if (s.gapo !== null) {
      hasGapo = true;
      if (s.gapo < gapoLo) gapoLo = s.gapo;
      if (s.gapo > gapoHi) gapoHi = s.gapo;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  if (!hasGapo) {
    gapoLo = 0;
    gapoHi = 1;
  } else if (gapoLo === gapoHi) {
    gapoLo -= 1;
    gapoHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const gapoRange = gapoHi - gapoLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectGapoY = (v: number): number =>
    gapoPanel.y +
    gapoPanel.height -
    ((v - gapoLo) / gapoRange) * gapoPanel.height;

  const priceDots: ChartLineGapoPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    range: s.range,
    gapo: s.gapo,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const gapoPts: { px: number; py: number }[] = [];
  const markers: ChartLineGapoMarker[] = [];
  for (const s of run.samples) {
    if (s.gapo === null) continue;
    const px = projectX(s.x);
    const py = projectGapoY(s.gapo);
    gapoPts.push({ px, py });
    if (s.zone !== 'none') {
      markers.push({ index: s.index, x: s.x, gapo: s.gapo, zone: s.zone, px, py });
    }
  }

  const hasMean = isFiniteNumber(run.gapoMean);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    gapoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    gapoYTicks: computeTicks(gapoLo, gapoHi, tickCount).map((v) => ({
      value: v,
      py: projectGapoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    gapoYMin: gapoLo,
    gapoYMax: gapoHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    gapoPath: buildPath(gapoPts),
    markers,
    meanY: hasMean ? projectGapoY(run.gapoMean) : 0,
    hasMean,
    period: run.period,
    gapoFinal: run.gapoFinal,
    gapoMean: run.gapoMean,
    expandingCount: run.expandingCount,
    contractingCount: run.contractingCount,
    steadyCount: run.steadyCount,
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

export function describeLineGapoChart(
  data: readonly ChartLineGapoPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineGapo(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with the Gopalakrishnan Range Index (period ${run.period}): the top panel plots the close; the bottom panel plots the Gopalakrishnan Range Index. Each bar's reading is the natural log of the high-to-low range over the lookback span, divided by the log of the span -- a fractal-style gauge that climbs as the trading range widens and falls as it narrows. A dashed line marks the mean reading. The range is expanding on ${run.expandingCount} bars, contracting on ${run.contractingCount} and steady on ${run.steadyCount} across ${run.samples.length} bars.`;
}

const GAPO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineGapo = forwardRef<HTMLDivElement, ChartLineGapoProps>(
  function ChartLineGapo(
    props: ChartLineGapoProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_GAPO_WIDTH,
      height = DEFAULT_CHART_LINE_GAPO_HEIGHT,
      padding = DEFAULT_CHART_LINE_GAPO_PADDING,
      gap = DEFAULT_CHART_LINE_GAPO_GAP,
      tickCount = DEFAULT_CHART_LINE_GAPO_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_GAPO_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_GAPO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_GAPO_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_GAPO_PRICE_COLOR,
      gapoColor = DEFAULT_CHART_LINE_GAPO_GAPO_COLOR,
      expandingColor = DEFAULT_CHART_LINE_GAPO_EXPANDING_COLOR,
      contractingColor = DEFAULT_CHART_LINE_GAPO_CONTRACTING_COLOR,
      meanColor = DEFAULT_CHART_LINE_GAPO_MEAN_COLOR,
      gridColor = DEFAULT_CHART_LINE_GAPO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_GAPO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showMeanLine = true,
      showMarkers = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with the Gopalakrishnan Range Index',
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
        computeLineGapoLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [data, width, height, padding, gap, tickCount, pricePanelRatio, period],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineGapoChart(data, {
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
          data-section="chart-line-gapo"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-gapo-aria-desc"
            style={GAPO_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const gp = layout.gapoPanel;
    const priceVisible = !hiddenSet.has('price');
    const gapoVisible = !hiddenSet.has('gapo');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineGapoZone): string => {
      if (zone === 'expanding') return expandingColor;
      if (zone === 'contracting') return contractingColor;
      return gapoColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'gapo', label: 'GAPO', color: gapoColor },
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
        data-section="chart-line-gapo"
        data-empty="false"
        data-period={layout.period}
        data-gapo-final={layout.gapoFinal}
        data-gapo-mean={layout.gapoMean}
        data-expanding-count={layout.expandingCount}
        data-contracting-count={layout.contractingCount}
        data-steady-count={layout.steadyCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-gapo-aria-desc"
          style={GAPO_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-gapo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-gapo-badge"
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
                data-section="chart-line-gapo-badge-icon"
                aria-hidden="true"
                style={{ color: gapoColor }}
              >
                GAPO
              </span>
              <span data-section="chart-line-gapo-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-gapo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-gapo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-gapo-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.gapoYTicks.map((t, i) => (
                  <line
                    key={`gg-${i}`}
                    data-section="chart-line-gapo-grid-line"
                    data-panel="gapo"
                    x1={gp.x}
                    x2={gp.x + gp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-gapo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-gapo-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-gapo-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-gapo-axis"
                  data-panel="gapo"
                  data-axis="y"
                  x1={gp.x}
                  y1={gp.y}
                  x2={gp.x}
                  y2={gp.y + gp.height}
                />
                <line
                  data-section="chart-line-gapo-axis"
                  data-panel="gapo"
                  data-axis="x"
                  x1={gp.x}
                  y1={gp.y + gp.height}
                  x2={gp.x + gp.width}
                  y2={gp.y + gp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-gapo-tick-label"
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
                {layout.gapoYTicks.map((t, i) => (
                  <text
                    key={`gyt-${i}`}
                    data-section="chart-line-gapo-tick-label"
                    data-panel="gapo"
                    data-axis="y"
                    x={gp.x - 6}
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
                    data-section="chart-line-gapo-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={gp.y + gp.height + 14}
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
              data-section="chart-line-gapo-panel-label"
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
              data-section="chart-line-gapo-panel-label"
              data-panel="gapo"
              x={gp.x + 2}
              y={gp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Gopalakrishnan Range Index
            </text>

            {showMeanLine && layout.hasMean ? (
              <line
                data-section="chart-line-gapo-mean-line"
                x1={gp.x}
                x2={gp.x + gp.width}
                y1={layout.meanY}
                y2={layout.meanY}
                stroke={meanColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-gapo-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-gapo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-gapo-dot"
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

            {gapoVisible && layout.gapoPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Gopalakrishnan Range Index line"
                data-section="chart-line-gapo-gapo-line"
                d={layout.gapoPath}
                fill="none"
                stroke={gapoColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {gapoVisible && showMarkers ? (
              <g data-section="chart-line-gapo-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${m.index + 1} at x ${formatX(m.x)}: GAPO ${formatValue(m.gapo)}, ${m.zone}`}
                      data-section="chart-line-gapo-marker"
                      data-point-index={m.index}
                      data-gapo={m.gapo}
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
                    data-section="chart-line-gapo-tooltip"
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
                    <div data-section="chart-line-gapo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-gapo-tooltip-close"
                      style={{ fontWeight: 600 }}
                    >
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-gapo-tooltip-range">
                      range: {fmtNullable(d.range)}
                    </div>
                    <div data-section="chart-line-gapo-tooltip-gapo">
                      gapo: {fmtNullable(d.gapo)}
                    </div>
                    <div data-section="chart-line-gapo-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-gapo-legend"
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
                  data-section="chart-line-gapo-legend-item"
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
                    data-section="chart-line-gapo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-gapo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-gapo-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.expandingCount} expanding, {layout.contractingCount}{' '}
              contracting, {layout.steadyCount} steady
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineGapo.displayName = 'ChartLineGapo';
