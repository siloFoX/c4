import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ATR_WIDTH = 560;
export const DEFAULT_CHART_LINE_ATR_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ATR_PADDING = 40;
export const DEFAULT_CHART_LINE_ATR_GAP = 26;
export const DEFAULT_CHART_LINE_ATR_PRICE_PANEL_RATIO = 0.58;
export const DEFAULT_CHART_LINE_ATR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ATR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ATR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ATR_PERIOD = 14;
export const DEFAULT_CHART_LINE_ATR_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ATR_ATR_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ATR_TRUE_RANGE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ATR_AXIS_COLOR = '#cbd5e1';

export interface ChartLineAtrPoint {
  x: number;
  value: number;
}

export interface ChartLineAtrSample {
  index: number;
  x: number;
  price: number;
  trueRange: number | null;
  atr: number | null;
}

export interface ChartLineAtrRun {
  series: ChartLineAtrPoint[];
  period: number;
  trueRange: (number | null)[];
  atr: (number | null)[];
  samples: ChartLineAtrSample[];
  atrFinal: number;
  atrMax: number;
  ok: boolean;
}

export interface ChartLineAtrPriceDot {
  index: number;
  x: number;
  price: number;
  trueRange: number | null;
  atr: number | null;
  px: number;
  py: number;
}

export interface ChartLineAtrMarker {
  index: number;
  x: number;
  atr: number;
  px: number;
  py: number;
}

export interface ChartLineAtrBar {
  index: number;
  x: number;
  trueRange: number;
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

export interface ChartLineAtrPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineAtrLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineAtrPanel;
  atrPanel: ChartLineAtrPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  atrYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  atrYMax: number;
  pricePath: string;
  priceDots: ChartLineAtrPriceDot[];
  atrPath: string;
  atrMarkers: ChartLineAtrMarker[];
  trueRangeBars: ChartLineAtrBar[];
  period: number;
  atrFinal: number;
  atrMax: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineAtrLayoutOptions {
  data: readonly ChartLineAtrPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineAtrProps {
  data: readonly ChartLineAtrPoint[];
  period?: number;
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
  atrColor?: string;
  trueRangeColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAtr?: boolean;
  showTrueRange?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineAtrPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineAtrFinitePoints(
  points: readonly ChartLineAtrPoint[] | null | undefined,
): ChartLineAtrPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineAtrPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineAtrPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The per-period true range. For a single-value series the true
 * range is the absolute period-over-period change
 * `|v[i] - v[i-1]|`. Index 0 has no prior value and is `null`.
 */
export function computeLineAtrTrueRanges(
  values: readonly number[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 1; i < values.length; i += 1) {
    out[i] = Math.abs(values[i]! - values[i - 1]!);
  }
  return out;
}

/**
 * Welles Wilder's Average True Range. The first ATR (at index
 * `period`) is the simple mean of the first `period` true ranges;
 * subsequent values use Wilder smoothing
 * `(prev * (period - 1) + tr) / period`. Indices before the window
 * is full are `null`.
 */
export function computeLineAtr(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + 1) return out;
  let sum = 0;
  for (let i = 1; i <= p; i += 1) {
    sum += Math.abs(values[i]! - values[i - 1]!);
  }
  let atr = sum / p;
  out[p] = atr;
  for (let i = p + 1; i < n; i += 1) {
    const tr = Math.abs(values[i]! - values[i - 1]!);
    atr = (atr * (p - 1) + tr) / p;
    out[i] = atr;
  }
  return out;
}

export function runLineAtr(
  points: readonly ChartLineAtrPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineAtrRun {
  const finite = getLineAtrFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineAtrPeriod(
    options?.period ?? DEFAULT_CHART_LINE_ATR_PERIOD,
    DEFAULT_CHART_LINE_ATR_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      trueRange: [],
      atr: [],
      samples: [],
      atrFinal: NaN,
      atrMax: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const trueRange = computeLineAtrTrueRanges(values);
  const atr = computeLineAtr(values, period);
  const samples: ChartLineAtrSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    price: p.value,
    trueRange: trueRange[i] ?? null,
    atr: atr[i] ?? null,
  }));

  let atrFinal = NaN;
  let atrMax = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (atr[i] !== null) {
      atrFinal = atr[i]!;
      break;
    }
  }
  for (const a of atr) {
    if (a !== null && a > atrMax) atrMax = a;
  }

  return {
    series,
    period,
    trueRange,
    atr,
    samples,
    atrFinal,
    atrMax,
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

export function computeLineAtrLayout(
  options: ComputeLineAtrLayoutOptions,
): ChartLineAtrLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ATR_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_ATR_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_ATR_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineAtrPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineAtr(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineAtrLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    atrPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    atrYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    atrYMax: 0,
    pricePath: '',
    priceDots: [],
    atrPath: '',
    atrMarkers: [],
    trueRangeBars: [],
    period: run.period,
    atrFinal: NaN,
    atrMax: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const atrH = usableHeight - priceH;
  if (priceH <= 0 || atrH <= 0) return empty;

  const pricePanel: ChartLineAtrPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const atrPanel: ChartLineAtrPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: atrH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let atrYMax = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.price < pyLo) pyLo = s.price;
    if (s.price > pyHi) pyHi = s.price;
    if (s.atr !== null && s.atr > atrYMax) atrYMax = s.atr;
    if (s.trueRange !== null && s.trueRange > atrYMax) atrYMax = s.trueRange;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  if (atrYMax <= 0) atrYMax = 1;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectAtrY = (v: number): number =>
    atrPanel.y + atrPanel.height - (v / atrYMax) * atrPanel.height;

  const priceDots: ChartLineAtrPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    price: s.price,
    trueRange: s.trueRange,
    atr: s.atr,
    px: projectX(s.x),
    py: projectPriceY(s.price),
  }));

  const atrMarkers: ChartLineAtrMarker[] = [];
  const atrPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.atr !== null) {
      const px = projectX(s.x);
      const py = projectAtrY(s.atr);
      atrPts.push({ px, py });
      atrMarkers.push({ index: s.index, x: s.x, atr: s.atr, px, py });
    }
  }

  const baselineY = atrPanel.y + atrPanel.height;
  const barWidth = (atrPanel.width / Math.max(1, run.samples.length)) * 0.55;
  const trueRangeBars: ChartLineAtrBar[] = [];
  for (const s of run.samples) {
    if (s.trueRange !== null) {
      const bh = (s.trueRange / atrYMax) * atrPanel.height;
      trueRangeBars.push({
        index: s.index,
        x: s.x,
        trueRange: s.trueRange,
        bx: projectX(s.x) - barWidth / 2,
        by: baselineY - bh,
        bw: barWidth,
        bh,
      });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    atrPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    atrYTicks: computeTicks(0, atrYMax, tickCount).map((v) => ({
      value: v,
      py: projectAtrY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    atrYMax,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    atrPath: buildPath(atrPts),
    atrMarkers,
    trueRangeBars,
    period: run.period,
    atrFinal: run.atrFinal,
    atrMax: run.atrMax,
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

export function describeLineAtrChart(
  data: readonly ChartLineAtrPoint[] | null | undefined,
  options?: { period?: number; formatValue?: (n: number) => string },
): string {
  const run = runLineAtr(data, options);
  if (!run.ok) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Line chart with an Average True Range volatility panel (period ${run.period}): the ATR line tracks the typical size of each period's move. Final ATR ${fmt(run.atrFinal)}, peak ${fmt(run.atrMax)}, across ${run.samples.length} periods.`;
}

const ATR_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineAtr = forwardRef<HTMLDivElement, ChartLineAtrProps>(
  function ChartLineAtr(
    props: ChartLineAtrProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_ATR_WIDTH,
      height = DEFAULT_CHART_LINE_ATR_HEIGHT,
      padding = DEFAULT_CHART_LINE_ATR_PADDING,
      gap = DEFAULT_CHART_LINE_ATR_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_ATR_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_ATR_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_ATR_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_ATR_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_ATR_PRICE_COLOR,
      atrColor = DEFAULT_CHART_LINE_ATR_ATR_COLOR,
      trueRangeColor = DEFAULT_CHART_LINE_ATR_TRUE_RANGE_COLOR,
      gridColor = DEFAULT_CHART_LINE_ATR_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_ATR_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showAtr = true,
      showTrueRange = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with an Average True Range volatility panel',
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
        computeLineAtrLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [data, width, height, padding, gap, pricePanelRatio, tickCount, period],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineAtrChart(data, {
          formatValue,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [ariaDescription, data, period, formatValue],
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
          data-section="chart-line-atr"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-atr-aria-desc" style={ATR_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const ap = layout.atrPanel;
    const priceVisible = !hiddenSet.has('price');
    const atrVisible = showAtr && !hiddenSet.has('atr');
    const trueRangeVisible = showTrueRange && !hiddenSet.has('truerange');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'atr', label: 'ATR', color: atrColor },
      { id: 'truerange', label: 'True Range', color: trueRangeColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-atr"
        data-empty="false"
        data-period={layout.period}
        data-atr-final={layout.atrFinal}
        data-atr-max={layout.atrMax}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-atr-aria-desc" style={ATR_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-atr-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-atr-badge"
              data-period={layout.period}
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
                data-section="chart-line-atr-badge-icon"
                aria-hidden="true"
                style={{ color: atrColor }}
              >
                ATR
              </span>
              <span data-section="chart-line-atr-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-atr-badge-max">
                max={formatValue(layout.atrMax)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-atr-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-atr-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-atr-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.atrYTicks.map((t, i) => (
                  <line
                    key={`agy-${i}`}
                    data-section="chart-line-atr-grid-line"
                    data-panel="atr"
                    x1={ap.x}
                    x2={ap.x + ap.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {trueRangeVisible ? (
              <g data-section="chart-line-atr-true-range">
                {layout.trueRangeBars.map((b) => (
                  <rect
                    key={`tr-${b.index}`}
                    data-section="chart-line-atr-true-range-bar"
                    data-point-index={b.index}
                    data-true-range={b.trueRange}
                    x={b.bx}
                    y={b.by}
                    width={b.bw}
                    height={b.bh}
                    fill={trueRangeColor}
                    fillOpacity={0.35}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-atr-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: ap, name: 'atr', yt: layout.atrYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-atr-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-atr-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-atr-axis"
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
                        data-section="chart-line-atr-tick"
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
                          data-section="chart-line-atr-tick-label"
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
                <g data-section="chart-line-atr-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-atr-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={ap.y + ap.height}
                        y2={ap.y + ap.height + 4}
                      />
                      <text
                        data-section="chart-line-atr-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={ap.y + ap.height + 14}
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

            <g data-section="chart-line-atr-panel-labels">
              <text
                data-section="chart-line-atr-panel-label"
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
                data-section="chart-line-atr-panel-label"
                data-panel="atr"
                x={ap.x + ap.width / 2}
                y={ap.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                ATR
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-atr-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-atr-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, price ${formatValue(d.price)}`}
                      data-section="chart-line-atr-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-price={d.price}
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

            {atrVisible && layout.atrPath ? (
              <path
                data-section="chart-line-atr-atr-line"
                d={layout.atrPath}
                fill="none"
                stroke={atrColor}
                strokeWidth={1.75}
              />
            ) : null}

            {atrVisible ? (
              <g data-section="chart-line-atr-markers">
                {layout.atrMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`ATR at x ${formatX(m.x)}: ${formatValue(m.atr)}`}
                      data-section="chart-line-atr-marker"
                      data-point-index={m.index}
                      data-atr={m.atr}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={atrColor}
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
                const d = layout.priceDots.find(
                  (x) => x.index === hoverIndex,
                );
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-atr-tooltip"
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
                    <div data-section="chart-line-atr-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-atr-tooltip-price"
                      style={{ fontWeight: 600 }}
                    >
                      price: {formatValue(d.price)}
                    </div>
                    <div data-section="chart-line-atr-tooltip-true-range">
                      true range:{' '}
                      {d.trueRange === null
                        ? 'n/a'
                        : formatValue(d.trueRange)}
                    </div>
                    <div data-section="chart-line-atr-tooltip-atr">
                      atr: {d.atr === null ? 'n/a' : formatValue(d.atr)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-atr-legend"
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
                  data-section="chart-line-atr-legend-item"
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
                    data-section="chart-line-atr-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-atr-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-atr-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              final ATR {formatValue(layout.atrFinal)}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineAtr.displayName = 'ChartLineAtr';
