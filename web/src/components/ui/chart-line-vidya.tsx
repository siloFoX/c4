import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_VIDYA_WIDTH = 560;
export const DEFAULT_CHART_LINE_VIDYA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_VIDYA_PADDING = 40;
export const DEFAULT_CHART_LINE_VIDYA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VIDYA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VIDYA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VIDYA_PERIOD = 14;
export const DEFAULT_CHART_LINE_VIDYA_CMO_PERIOD = 9;
export const DEFAULT_CHART_LINE_VIDYA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_VIDYA_VIDYA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_VIDYA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VIDYA_AXIS_COLOR = '#cbd5e1';

export type ChartLineVidyaPosition = 'above' | 'below' | 'on';

export interface ChartLineVidyaPoint {
  x: number;
  value: number;
}

export interface ChartLineVidyaSample {
  index: number;
  x: number;
  value: number;
  cmo: number | null;
  k: number | null;
  vidya: number | null;
  position: ChartLineVidyaPosition;
}

export interface ChartLineVidyaRun {
  series: ChartLineVidyaPoint[];
  period: number;
  cmoPeriod: number;
  cmo: (number | null)[];
  k: (number | null)[];
  vidya: (number | null)[];
  samples: ChartLineVidyaSample[];
  vidyaFinal: number;
  vidyaMin: number;
  vidyaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineVidyaPriceDot {
  index: number;
  x: number;
  value: number;
  cmo: number | null;
  k: number | null;
  vidya: number | null;
  position: ChartLineVidyaPosition;
  px: number;
  py: number;
}

export interface ChartLineVidyaMarker {
  index: number;
  x: number;
  vidya: number;
  px: number;
  py: number;
}

export interface ChartLineVidyaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineVidyaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineVidyaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  vidyaPath: string;
  priceDots: ChartLineVidyaPriceDot[];
  vidyaMarkers: ChartLineVidyaMarker[];
  period: number;
  cmoPeriod: number;
  vidyaFinal: number;
  vidyaMin: number;
  vidyaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineVidyaLayoutOptions {
  data: readonly ChartLineVidyaPoint[];
  period?: number;
  cmoPeriod?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineVidyaProps {
  data: readonly ChartLineVidyaPoint[];
  period?: number;
  cmoPeriod?: number;
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
  vidyaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVidya?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineVidyaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineVidyaFinitePoints(
  points: readonly ChartLineVidyaPoint[] | null | undefined,
): ChartLineVidyaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineVidyaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineVidyaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Tushar Chande's Momentum Oscillator, the volatility gauge that
 * drives the VIDYA. Over a trailing window of `cmoPeriod` price
 * changes the gains and losses are summed and
 * `CMO = 100 * (sumUp - sumDown) / (sumUp + sumDown)`. The result
 * runs -100 (all losses) to +100 (all gains); a window with no
 * movement reads 0. CMO is defined from index `cmoPeriod` onward.
 */
export function computeLineVidyaCmo(
  values: readonly number[] | null | undefined,
  cmoPeriod: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = cmoPeriod < 1 ? 1 : Math.floor(cmoPeriod);
  const up: number[] = new Array(n).fill(0);
  const down: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const change = values[i]! - values[i - 1]!;
    up[i] = change > 0 ? change : 0;
    down[i] = change < 0 ? -change : 0;
  }
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let sumUp = 0;
    let sumDown = 0;
    for (let j = i - p + 1; j <= i; j += 1) {
      sumUp += up[j]!;
      sumDown += down[j]!;
    }
    const total = sumUp + sumDown;
    const raw = total === 0 ? 0 : (100 * (sumUp - sumDown)) / total;
    out[i] = raw === 0 ? 0 : raw;
  }
  return out;
}

/**
 * Tushar Chande's Variable Index Dynamic Average. The VIDYA is an
 * exponential moving average whose smoothing constant is scaled,
 * bar by bar, by a volatility index `k = |CMO| / 100` (the absolute
 * Chande Momentum Oscillator divided by 100, so `k` runs 0..1):
 * `VIDYA[i] = alpha*k*value[i] + (1 - alpha*k)*VIDYA[i-1]` where
 * `alpha = 2 / (period + 1)` is the base smoothing constant. A
 * strong trend pushes `k` toward 1 so the average tracks the price
 * closely; a directionless market pushes `k` toward 0 so the
 * average freezes and holds its prior value. The VIDYA is seeded at
 * index `cmoPeriod - 1` with that bar's price and is recursive from
 * index `cmoPeriod` onward.
 */
export function computeLineVidya(
  values: readonly number[] | null | undefined,
  period: number,
  cmoPeriod: number,
): {
  cmo: (number | null)[];
  k: (number | null)[];
  vidya: (number | null)[];
} {
  if (!Array.isArray(values)) return { cmo: [], k: [], vidya: [] };
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const cp = cmoPeriod < 1 ? 1 : Math.floor(cmoPeriod);
  const cmo = computeLineVidyaCmo(values, cp);
  const alpha = 2 / (p + 1);
  const k: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    if (isDefined(cmo[i])) k[i] = Math.abs(cmo[i] as number) / 100;
  }
  const vidya: (number | null)[] = new Array(n).fill(null);
  if (cp - 1 >= 0 && cp - 1 < n) vidya[cp - 1] = values[cp - 1]!;
  for (let i = cp; i < n; i += 1) {
    const sc = alpha * (k[i] ?? 0);
    const prev = vidya[i - 1] as number;
    const raw = sc * values[i]! + (1 - sc) * prev;
    vidya[i] = raw === 0 ? 0 : raw;
  }
  return { cmo, k, vidya };
}

function classifyPosition(
  value: number,
  vidya: number | null,
): ChartLineVidyaPosition {
  if (vidya === null) return 'on';
  if (value > vidya) return 'above';
  if (value < vidya) return 'below';
  return 'on';
}

export function runLineVidya(
  points: readonly ChartLineVidyaPoint[] | null | undefined,
  options?: { period?: number; cmoPeriod?: number },
): ChartLineVidyaRun {
  const finite = getLineVidyaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineVidyaPeriod(
    options?.period ?? DEFAULT_CHART_LINE_VIDYA_PERIOD,
    DEFAULT_CHART_LINE_VIDYA_PERIOD,
  );
  const cmoPeriod = normalizeLineVidyaPeriod(
    options?.cmoPeriod ?? DEFAULT_CHART_LINE_VIDYA_CMO_PERIOD,
    DEFAULT_CHART_LINE_VIDYA_CMO_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      cmoPeriod,
      cmo: [],
      k: [],
      vidya: [],
      samples: [],
      vidyaFinal: NaN,
      vidyaMin: NaN,
      vidyaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { cmo, k, vidya } = computeLineVidya(values, period, cmoPeriod);

  const samples: ChartLineVidyaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    cmo: cmo[i] ?? null,
    k: k[i] ?? null,
    vidya: vidya[i] ?? null,
    position: classifyPosition(p.value, vidya[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let vidyaMin = NaN;
  let vidyaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.vidya !== null) {
      if (Number.isNaN(vidyaMin) || s.vidya < vidyaMin) vidyaMin = s.vidya;
      if (Number.isNaN(vidyaMax) || s.vidya > vidyaMax) vidyaMax = s.vidya;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series,
    period,
    cmoPeriod,
    cmo,
    k,
    vidya,
    samples,
    vidyaFinal: lastDefined(vidya),
    vidyaMin,
    vidyaMax,
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

export function computeLineVidyaLayout(
  options: ComputeLineVidyaLayoutOptions,
): ChartLineVidyaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_VIDYA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineVidyaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineVidya(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.cmoPeriod)
      ? { cmoPeriod: options.cmoPeriod }
      : {}),
  });
  const empty: ChartLineVidyaLayout = {
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
    vidyaPath: '',
    priceDots: [],
    vidyaMarkers: [],
    period: run.period,
    cmoPeriod: run.cmoPeriod,
    vidyaFinal: NaN,
    vidyaMin: NaN,
    vidyaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineVidyaPanel = {
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
    if (s.vidya !== null) {
      if (s.vidya < yLo) yLo = s.vidya;
      if (s.vidya > yHi) yHi = s.vidya;
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

  const priceDots: ChartLineVidyaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    cmo: s.cmo,
    k: s.k,
    vidya: s.vidya,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const vidyaMarkers: ChartLineVidyaMarker[] = [];
  const vidyaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.vidya !== null) {
      const px = projectX(s.x);
      const py = projectY(s.vidya);
      vidyaPts.push({ px, py });
      vidyaMarkers.push({ index: s.index, x: s.x, vidya: s.vidya, px, py });
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
    vidyaPath: buildPath(vidyaPts),
    priceDots,
    vidyaMarkers,
    period: run.period,
    cmoPeriod: run.cmoPeriod,
    vidyaFinal: run.vidyaFinal,
    vidyaMin: run.vidyaMin,
    vidyaMax: run.vidyaMax,
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

export function describeLineVidyaChart(
  data: readonly ChartLineVidyaPoint[] | null | undefined,
  options?: { period?: number; cmoPeriod?: number },
): string {
  const run = runLineVidya(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Variable Index Dynamic Average (VIDYA) overlay (period ${run.period}): the VIDYA is an adaptive moving average whose smoothing speeds up in volatile trending markets and freezes in quiet ones. It scales the base exponential smoothing constant by a volatility index -- the absolute Chande Momentum Oscillator divided by 100 -- so a strong trend pushes the index toward 1 and the average tracks the price closely, while a directionless market pushes it toward 0 and the average barely moves. The price runs above the VIDYA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const VIDYA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineVidya = forwardRef<HTMLDivElement, ChartLineVidyaProps>(
  function ChartLineVidya(
    props: ChartLineVidyaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      cmoPeriod,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_VIDYA_WIDTH,
      height = DEFAULT_CHART_LINE_VIDYA_HEIGHT,
      padding = DEFAULT_CHART_LINE_VIDYA_PADDING,
      tickCount = DEFAULT_CHART_LINE_VIDYA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_VIDYA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VIDYA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_VIDYA_PRICE_COLOR,
      vidyaColor = DEFAULT_CHART_LINE_VIDYA_VIDYA_COLOR,
      gridColor = DEFAULT_CHART_LINE_VIDYA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VIDYA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showVidya = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Variable Index Dynamic Average overlay',
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
        computeLineVidyaLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(cmoPeriod) ? { cmoPeriod } : {}),
        }),
      [data, width, height, padding, tickCount, period, cmoPeriod],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineVidyaChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(cmoPeriod) ? { cmoPeriod } : {}),
        }),
      [ariaDescription, data, period, cmoPeriod],
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
          data-section="chart-line-vidya"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-vidya-aria-desc"
            style={VIDYA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const vidyaVisible = showVidya && !hiddenSet.has('vidya');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'vidya', label: 'VIDYA', color: vidyaColor },
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
        data-section="chart-line-vidya"
        data-empty="false"
        data-period={layout.period}
        data-cmo-period={layout.cmoPeriod}
        data-vidya-final={layout.vidyaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-vidya-aria-desc"
          style={VIDYA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-vidya-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-vidya-badge"
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
                data-section="chart-line-vidya-badge-icon"
                aria-hidden="true"
                style={{ color: vidyaColor }}
              >
                VIDYA
              </span>
              <span data-section="chart-line-vidya-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-vidya-badge-cmo">
                cmo={layout.cmoPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-vidya-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-vidya-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-vidya-grid-line"
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
                data-section="chart-line-vidya-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-vidya-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-vidya-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-vidya-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-vidya-tick-label"
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
                    data-section="chart-line-vidya-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-vidya-tick-label"
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
                data-section="chart-line-vidya-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-vidya-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-vidya-dot"
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

            {vidyaVisible && layout.vidyaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Variable Index Dynamic Average line"
                data-section="chart-line-vidya-vidya-line"
                d={layout.vidyaPath}
                fill="none"
                stroke={vidyaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {vidyaVisible ? (
              <g data-section="chart-line-vidya-markers">
                {layout.vidyaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`VIDYA at x ${formatX(m.x)}: ${formatValue(m.vidya)}`}
                      data-section="chart-line-vidya-marker"
                      data-point-index={m.index}
                      data-vidya={m.vidya}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={vidyaColor}
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
                    data-section="chart-line-vidya-tooltip"
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
                    <div data-section="chart-line-vidya-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-vidya-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-vidya-tooltip-vidya">
                      vidya: {d.vidya === null ? 'n/a' : formatValue(d.vidya)}
                    </div>
                    <div data-section="chart-line-vidya-tooltip-k">
                      volatility index:{' '}
                      {d.k === null ? 'n/a' : formatValue(d.k)}
                    </div>
                    <div data-section="chart-line-vidya-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-vidya-legend"
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
                  data-section="chart-line-vidya-legend-item"
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
                    data-section="chart-line-vidya-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-vidya-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vidya-legend-stats"
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

ChartLineVidya.displayName = 'ChartLineVidya';
