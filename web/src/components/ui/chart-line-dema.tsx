import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DEMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_DEMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_DEMA_PADDING = 40;
export const DEFAULT_CHART_LINE_DEMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DEMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DEMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DEMA_PERIOD = 20;
export const DEFAULT_CHART_LINE_DEMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_DEMA_DEMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_DEMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DEMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineDemaPosition = 'above' | 'below' | 'on';

export interface ChartLineDemaPoint {
  x: number;
  value: number;
}

export interface ChartLineDemaSample {
  index: number;
  x: number;
  value: number;
  ema1: number | null;
  ema2: number | null;
  dema: number | null;
  position: ChartLineDemaPosition;
}

export interface ChartLineDemaRun {
  series: ChartLineDemaPoint[];
  period: number;
  ema1: (number | null)[];
  ema2: (number | null)[];
  dema: (number | null)[];
  samples: ChartLineDemaSample[];
  demaFinal: number;
  demaMin: number;
  demaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineDemaPriceDot {
  index: number;
  x: number;
  value: number;
  ema1: number | null;
  ema2: number | null;
  dema: number | null;
  position: ChartLineDemaPosition;
  px: number;
  py: number;
}

export interface ChartLineDemaMarker {
  index: number;
  x: number;
  dema: number;
  px: number;
  py: number;
}

export interface ChartLineDemaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineDemaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineDemaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  demaPath: string;
  priceDots: ChartLineDemaPriceDot[];
  demaMarkers: ChartLineDemaMarker[];
  period: number;
  demaFinal: number;
  demaMin: number;
  demaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineDemaLayoutOptions {
  data: readonly ChartLineDemaPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineDemaProps {
  data: readonly ChartLineDemaPoint[];
  period?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  demaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDema?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineDemaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineDemaFinitePoints(
  points: readonly ChartLineDemaPoint[] | null | undefined,
): ChartLineDemaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineDemaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineDemaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * An exponential moving average over `period` values, tolerating the
 * leading `null` placeholders of a derived series. The seed is the
 * simple mean of the first `period` defined values placed at that
 * value's index; each later defined value folds in at weight
 * `2 / (period + 1)`.
 */
export function computeLineDemaEma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const idx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (isDefined(src[i])) idx.push(i);
  }
  if (idx.length < p) return out;
  const mult = 2 / (p + 1);
  let sum = 0;
  for (let k = 0; k < p; k += 1) sum += src[idx[k]!] as number;
  let ema = sum / p;
  out[idx[p - 1]!] = ema;
  for (let k = p; k < idx.length; k += 1) {
    const i = idx[k]!;
    ema = (src[i] as number) * mult + ema * (1 - mult);
    out[i] = ema;
  }
  return out;
}

/**
 * Patrick Mulloy's Double Exponential Moving Average. A plain EMA
 * lags the price; the EMA of that EMA lags twice as much, so the
 * gap `EMA - EMA(EMA)` is a measure of the lag itself. Adding that
 * gap back to the EMA -- `DEMA = 2 * EMA - EMA(EMA)` -- cancels most
 * of the lag while keeping the line smooth. The first EMA is defined
 * from index `period - 1`; the EMA of the EMA needs another
 * `period` defined values, so the DEMA is defined from index
 * `2 * period - 2` onward.
 */
export function computeLineDema(
  values: readonly number[] | null | undefined,
  period: number,
): {
  ema1: (number | null)[];
  ema2: (number | null)[];
  dema: (number | null)[];
} {
  if (!Array.isArray(values)) return { ema1: [], ema2: [], dema: [] };
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const ema1 = computeLineDemaEma(values, p);
  const ema2 = computeLineDemaEma(ema1, p);
  const dema: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    if (isDefined(ema1[i]) && isDefined(ema2[i])) {
      dema[i] = 2 * (ema1[i] as number) - (ema2[i] as number);
    }
  }
  return { ema1, ema2, dema };
}

function classifyPosition(
  value: number,
  dema: number | null,
): ChartLineDemaPosition {
  if (dema === null) return 'on';
  if (value > dema) return 'above';
  if (value < dema) return 'below';
  return 'on';
}

export function runLineDema(
  points: readonly ChartLineDemaPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineDemaRun {
  const finite = getLineDemaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineDemaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_DEMA_PERIOD,
    DEFAULT_CHART_LINE_DEMA_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      ema1: [],
      ema2: [],
      dema: [],
      samples: [],
      demaFinal: NaN,
      demaMin: NaN,
      demaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { ema1, ema2, dema } = computeLineDema(values, period);

  const samples: ChartLineDemaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    ema1: ema1[i] ?? null,
    ema2: ema2[i] ?? null,
    dema: dema[i] ?? null,
    position: classifyPosition(p.value, dema[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let demaMin = NaN;
  let demaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.dema !== null) {
      if (Number.isNaN(demaMin) || s.dema < demaMin) demaMin = s.dema;
      if (Number.isNaN(demaMax) || s.dema > demaMax) demaMax = s.dema;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    period,
    ema1,
    ema2,
    dema,
    samples,
    demaFinal: lastDefined(dema),
    demaMin,
    demaMax,
    aboveCount,
    belowCount,
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

export function computeLineDemaLayout(
  options: ComputeLineDemaLayoutOptions,
): ChartLineDemaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_DEMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineDemaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineDema(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineDemaLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    demaPath: '',
    priceDots: [],
    demaMarkers: [],
    period: run.period,
    demaFinal: NaN,
    demaMin: NaN,
    demaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineDemaPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
    if (s.dema !== null) {
      if (s.dema < yLo) yLo = s.dema;
      if (s.dema > yHi) yHi = s.dema;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLineDemaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    ema1: s.ema1,
    ema2: s.ema2,
    dema: s.dema,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const demaMarkers: ChartLineDemaMarker[] = [];
  const demaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.dema !== null) {
      const px = projectX(s.x);
      const py = projectY(s.dema);
      demaPts.push({ px, py });
      demaMarkers.push({ index: s.index, x: s.x, dema: s.dema, px, py });
    }
  }

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    demaPath: buildPath(demaPts),
    priceDots,
    demaMarkers,
    period: run.period,
    demaFinal: run.demaFinal,
    demaMin: run.demaMin,
    demaMax: run.demaMax,
    aboveCount: run.aboveCount,
    belowCount: run.belowCount,
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

export function describeLineDemaChart(
  data: readonly ChartLineDemaPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineDema(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Double Exponential Moving Average (DEMA) overlay (period ${run.period}): the DEMA cuts the lag of a plain exponential moving average by taking 2 * EMA - EMA(EMA) -- the EMA of the EMA measures the lag, so doubling the EMA and subtracting that second smoothing back removes most of the lag while keeping the line smooth. The price runs above the DEMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const DEMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineDema = forwardRef<HTMLDivElement, ChartLineDemaProps>(
  function ChartLineDema(
    props: ChartLineDemaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_DEMA_WIDTH,
      height = DEFAULT_CHART_LINE_DEMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_DEMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_DEMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_DEMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_DEMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_DEMA_PRICE_COLOR,
      demaColor = DEFAULT_CHART_LINE_DEMA_DEMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_DEMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_DEMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showDema = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Double Exponential Moving Average overlay',
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
        computeLineDemaLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [data, width, height, padding, tickCount, period],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineDemaChart(data, {
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
          data-section="chart-line-dema"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-dema-aria-desc"
            style={DEMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const demaVisible = showDema && !hiddenSet.has('dema');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'dema', label: 'DEMA', color: demaColor },
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
        data-section="chart-line-dema"
        data-empty="false"
        data-period={layout.period}
        data-dema-final={layout.demaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-dema-aria-desc"
          style={DEMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-dema-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-dema-badge"
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
                data-section="chart-line-dema-badge-icon"
                aria-hidden="true"
                style={{ color: demaColor }}
              >
                DEMA
              </span>
              <span data-section="chart-line-dema-badge-period">
                p={layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-dema-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-dema-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-dema-grid-line"
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
                data-section="chart-line-dema-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-dema-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-dema-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-dema-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-dema-tick-label"
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
                    data-section="chart-line-dema-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-dema-tick-label"
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

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-dema-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-dema-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-dema-dot"
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

            {demaVisible && layout.demaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Double Exponential Moving Average line"
                data-section="chart-line-dema-dema-line"
                d={layout.demaPath}
                fill="none"
                stroke={demaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {demaVisible ? (
              <g data-section="chart-line-dema-markers">
                {layout.demaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`DEMA at x ${formatX(m.x)}: ${formatValue(m.dema)}`}
                      data-section="chart-line-dema-marker"
                      data-point-index={m.index}
                      data-dema={m.dema}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={demaColor}
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
                    data-section="chart-line-dema-tooltip"
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
                    <div data-section="chart-line-dema-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-dema-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-dema-tooltip-dema">
                      dema: {d.dema === null ? 'n/a' : formatValue(d.dema)}
                    </div>
                    <div data-section="chart-line-dema-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-dema-legend"
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
                  data-section="chart-line-dema-legend-item"
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
                    data-section="chart-line-dema-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-dema-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-dema-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.aboveCount} above, {layout.belowCount} below
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineDema.displayName = 'ChartLineDema';
