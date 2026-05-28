import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TEMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_TEMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_TEMA_PADDING = 40;
export const DEFAULT_CHART_LINE_TEMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TEMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TEMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TEMA_PERIOD = 14;
export const DEFAULT_CHART_LINE_TEMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TEMA_TEMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TEMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TEMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineTemaPosition = 'above' | 'below' | 'on';

export interface ChartLineTemaPoint {
  x: number;
  value: number;
}

export interface ChartLineTemaSample {
  index: number;
  x: number;
  value: number;
  ema1: number | null;
  ema2: number | null;
  ema3: number | null;
  tema: number | null;
  position: ChartLineTemaPosition;
}

export interface ChartLineTemaRun {
  series: ChartLineTemaPoint[];
  period: number;
  ema1: (number | null)[];
  ema2: (number | null)[];
  ema3: (number | null)[];
  tema: (number | null)[];
  samples: ChartLineTemaSample[];
  temaFinal: number;
  temaMin: number;
  temaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineTemaPriceDot {
  index: number;
  x: number;
  value: number;
  ema1: number | null;
  ema2: number | null;
  ema3: number | null;
  tema: number | null;
  position: ChartLineTemaPosition;
  px: number;
  py: number;
}

export interface ChartLineTemaMarker {
  index: number;
  x: number;
  tema: number;
  px: number;
  py: number;
}

export interface ChartLineTemaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineTemaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineTemaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  temaPath: string;
  priceDots: ChartLineTemaPriceDot[];
  temaMarkers: ChartLineTemaMarker[];
  period: number;
  temaFinal: number;
  temaMin: number;
  temaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineTemaLayoutOptions {
  data: readonly ChartLineTemaPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineTemaProps {
  data: readonly ChartLineTemaPoint[];
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
  temaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTema?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineTemaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineTemaFinitePoints(
  points: readonly ChartLineTemaPoint[] | null | undefined,
): ChartLineTemaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTemaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineTemaPeriod(
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
export function computeLineTemaEma(
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
 * Patrick Mulloy's Triple Exponential Moving Average. A plain EMA
 * lags the price; nesting three EMAs and combining them as
 * `TEMA = 3 * EMA1 - 3 * EMA2 + EMA3` cancels the lag to third
 * order, driving it lower than a double EMA can while keeping the
 * line smooth. EMA1 is defined from index `period - 1`; each later
 * nesting needs another `period` defined values, so EMA2 begins at
 * `2 * period - 2`, EMA3 at `3 * period - 3`, and the TEMA is
 * defined from index `3 * period - 3` onward.
 */
export function computeLineTema(
  values: readonly number[] | null | undefined,
  period: number,
): {
  ema1: (number | null)[];
  ema2: (number | null)[];
  ema3: (number | null)[];
  tema: (number | null)[];
} {
  if (!Array.isArray(values)) {
    return { ema1: [], ema2: [], ema3: [], tema: [] };
  }
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const ema1 = computeLineTemaEma(values, p);
  const ema2 = computeLineTemaEma(ema1, p);
  const ema3 = computeLineTemaEma(ema2, p);
  const tema: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    if (isDefined(ema1[i]) && isDefined(ema2[i]) && isDefined(ema3[i])) {
      tema[i] =
        3 * (ema1[i] as number) -
        3 * (ema2[i] as number) +
        (ema3[i] as number);
    }
  }
  return { ema1, ema2, ema3, tema };
}

function classifyPosition(
  value: number,
  tema: number | null,
): ChartLineTemaPosition {
  if (tema === null) return 'on';
  if (value > tema) return 'above';
  if (value < tema) return 'below';
  return 'on';
}

export function runLineTema(
  points: readonly ChartLineTemaPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineTemaRun {
  const finite = getLineTemaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineTemaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_TEMA_PERIOD,
    DEFAULT_CHART_LINE_TEMA_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      ema1: [],
      ema2: [],
      ema3: [],
      tema: [],
      samples: [],
      temaFinal: NaN,
      temaMin: NaN,
      temaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { ema1, ema2, ema3, tema } = computeLineTema(values, period);

  const samples: ChartLineTemaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    ema1: ema1[i] ?? null,
    ema2: ema2[i] ?? null,
    ema3: ema3[i] ?? null,
    tema: tema[i] ?? null,
    position: classifyPosition(p.value, tema[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let temaMin = NaN;
  let temaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.tema !== null) {
      if (Number.isNaN(temaMin) || s.tema < temaMin) temaMin = s.tema;
      if (Number.isNaN(temaMax) || s.tema > temaMax) temaMax = s.tema;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    period,
    ema1,
    ema2,
    ema3,
    tema,
    samples,
    temaFinal: lastDefined(tema),
    temaMin,
    temaMax,
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

export function computeLineTemaLayout(
  options: ComputeLineTemaLayoutOptions,
): ChartLineTemaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_TEMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineTemaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineTema(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineTemaLayout = {
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
    temaPath: '',
    priceDots: [],
    temaMarkers: [],
    period: run.period,
    temaFinal: NaN,
    temaMin: NaN,
    temaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineTemaPanel = {
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
    if (s.tema !== null) {
      if (s.tema < yLo) yLo = s.tema;
      if (s.tema > yHi) yHi = s.tema;
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

  const priceDots: ChartLineTemaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    ema1: s.ema1,
    ema2: s.ema2,
    ema3: s.ema3,
    tema: s.tema,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const temaMarkers: ChartLineTemaMarker[] = [];
  const temaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.tema !== null) {
      const px = projectX(s.x);
      const py = projectY(s.tema);
      temaPts.push({ px, py });
      temaMarkers.push({ index: s.index, x: s.x, tema: s.tema, px, py });
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
    temaPath: buildPath(temaPts),
    priceDots,
    temaMarkers,
    period: run.period,
    temaFinal: run.temaFinal,
    temaMin: run.temaMin,
    temaMax: run.temaMax,
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

export function describeLineTemaChart(
  data: readonly ChartLineTemaPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineTema(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Triple Exponential Moving Average (TEMA) overlay (period ${run.period}): the TEMA drives the lag of a plain exponential moving average lower than a double EMA can by taking 3 * EMA - 3 * EMA(EMA) + EMA(EMA(EMA)) -- three nested EMAs combined so their lags cancel to third order, giving a very responsive yet smooth line. The price runs above the TEMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const TEMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineTema = forwardRef<HTMLDivElement, ChartLineTemaProps>(
  function ChartLineTema(
    props: ChartLineTemaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_TEMA_WIDTH,
      height = DEFAULT_CHART_LINE_TEMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_TEMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_TEMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_TEMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TEMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_TEMA_PRICE_COLOR,
      temaColor = DEFAULT_CHART_LINE_TEMA_TEMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_TEMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TEMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showTema = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Triple Exponential Moving Average overlay',
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
        computeLineTemaLayout({
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
        describeLineTemaChart(data, {
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
          data-section="chart-line-tema"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-tema-aria-desc"
            style={TEMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const temaVisible = showTema && !hiddenSet.has('tema');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'tema', label: 'TEMA', color: temaColor },
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
        data-section="chart-line-tema"
        data-empty="false"
        data-period={layout.period}
        data-tema-final={layout.temaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-tema-aria-desc"
          style={TEMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-tema-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-tema-badge"
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
                data-section="chart-line-tema-badge-icon"
                aria-hidden="true"
                style={{ color: temaColor }}
              >
                TEMA
              </span>
              <span data-section="chart-line-tema-badge-period">
                p={layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-tema-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-tema-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-tema-grid-line"
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
                data-section="chart-line-tema-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-tema-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-tema-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-tema-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-tema-tick-label"
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
                    data-section="chart-line-tema-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-tema-tick-label"
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
                data-section="chart-line-tema-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-tema-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-tema-dot"
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

            {temaVisible && layout.temaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Triple Exponential Moving Average line"
                data-section="chart-line-tema-tema-line"
                d={layout.temaPath}
                fill="none"
                stroke={temaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {temaVisible ? (
              <g data-section="chart-line-tema-markers">
                {layout.temaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`TEMA at x ${formatX(m.x)}: ${formatValue(m.tema)}`}
                      data-section="chart-line-tema-marker"
                      data-point-index={m.index}
                      data-tema={m.tema}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={temaColor}
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
                    data-section="chart-line-tema-tooltip"
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
                    <div data-section="chart-line-tema-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-tema-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-tema-tooltip-tema">
                      tema: {d.tema === null ? 'n/a' : formatValue(d.tema)}
                    </div>
                    <div data-section="chart-line-tema-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-tema-legend"
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
                  data-section="chart-line-tema-legend-item"
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
                    data-section="chart-line-tema-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-tema-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-tema-legend-stats"
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

ChartLineTema.displayName = 'ChartLineTema';
