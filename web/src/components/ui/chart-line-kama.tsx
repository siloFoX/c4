import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_KAMA_WIDTH = 560;
export const DEFAULT_CHART_LINE_KAMA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_KAMA_PADDING = 40;
export const DEFAULT_CHART_LINE_KAMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KAMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KAMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KAMA_ER_PERIOD = 10;
export const DEFAULT_CHART_LINE_KAMA_FAST_PERIOD = 2;
export const DEFAULT_CHART_LINE_KAMA_SLOW_PERIOD = 30;
export const DEFAULT_CHART_LINE_KAMA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_KAMA_KAMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KAMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KAMA_AXIS_COLOR = '#cbd5e1';

export type ChartLineKamaPosition = 'above' | 'below' | 'on';

export interface ChartLineKamaPoint {
  x: number;
  value: number;
}

export interface ChartLineKamaSample {
  index: number;
  x: number;
  value: number;
  er: number | null;
  sc: number | null;
  kama: number | null;
  position: ChartLineKamaPosition;
}

export interface ChartLineKamaRun {
  series: ChartLineKamaPoint[];
  erPeriod: number;
  fastPeriod: number;
  slowPeriod: number;
  er: (number | null)[];
  sc: (number | null)[];
  kama: (number | null)[];
  samples: ChartLineKamaSample[];
  kamaFinal: number;
  kamaMin: number;
  kamaMax: number;
  aboveCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineKamaPriceDot {
  index: number;
  x: number;
  value: number;
  er: number | null;
  kama: number | null;
  position: ChartLineKamaPosition;
  px: number;
  py: number;
}

export interface ChartLineKamaMarker {
  index: number;
  x: number;
  kama: number;
  px: number;
  py: number;
}

export interface ChartLineKamaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineKamaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineKamaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  kamaPath: string;
  priceDots: ChartLineKamaPriceDot[];
  kamaMarkers: ChartLineKamaMarker[];
  erPeriod: number;
  fastPeriod: number;
  slowPeriod: number;
  kamaFinal: number;
  kamaMin: number;
  kamaMax: number;
  aboveCount: number;
  belowCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineKamaLayoutOptions {
  data: readonly ChartLineKamaPoint[];
  erPeriod?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineKamaProps {
  data: readonly ChartLineKamaPoint[];
  erPeriod?: number;
  fastPeriod?: number;
  slowPeriod?: number;
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
  kamaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKama?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineKamaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineKamaFinitePoints(
  points: readonly ChartLineKamaPoint[] | null | undefined,
): ChartLineKamaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineKamaPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineKamaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Perry Kaufman's Efficiency Ratio. Over a trailing window of
 * `erPeriod` bars the net price change is divided by the sum of the
 * bar-to-bar moves: `ER = |value[i] - value[i-erPeriod]| / sum(|move|)`.
 * The result runs 0 (pure noise, the moves cancel out) to 1 (a clean
 * trend where every move points the same way). A window with no
 * movement reads 0. ER is defined from index `erPeriod` onward.
 */
export function computeLineKamaEfficiencyRatio(
  values: readonly number[] | null | undefined,
  erPeriod: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = erPeriod < 1 ? 1 : Math.floor(erPeriod);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    const change = Math.abs(values[i]! - values[i - p]!);
    let volatility = 0;
    for (let j = i - p + 1; j <= i; j += 1) {
      volatility += Math.abs(values[j]! - values[j - 1]!);
    }
    out[i] = volatility === 0 ? 0 : change / volatility;
  }
  return out;
}

/**
 * Kaufman's Adaptive Moving Average. The Efficiency Ratio drives a
 * per-bar smoothing constant `SC = (ER * (fastSC - slowSC) + slowSC)^2`
 * where `fastSC = 2 / (fastPeriod + 1)` and
 * `slowSC = 2 / (slowPeriod + 1)`. The KAMA then folds each bar in at
 * its own SC: `KAMA[i] = KAMA[i-1] + SC * (value[i] - KAMA[i-1])`.
 * A high ER (clean trend) pushes SC toward the fast constant so the
 * average speeds up; a low ER (choppy noise) pushes SC toward the
 * slow constant so the average flattens. The KAMA is seeded at index
 * `erPeriod - 1` with that bar's price and is recursive from index
 * `erPeriod` onward; earlier bars read null.
 */
export function computeLineKama(
  values: readonly number[] | null | undefined,
  erPeriod: number,
  fastPeriod: number,
  slowPeriod: number,
): { er: (number | null)[]; sc: (number | null)[]; kama: (number | null)[] } {
  if (!Array.isArray(values)) return { er: [], sc: [], kama: [] };
  const n = values.length;
  const p = erPeriod < 1 ? 1 : Math.floor(erPeriod);
  const fast = fastPeriod < 1 ? 1 : Math.floor(fastPeriod);
  const slow = slowPeriod < 1 ? 1 : Math.floor(slowPeriod);
  const er = computeLineKamaEfficiencyRatio(values, p);
  const fastSc = 2 / (fast + 1);
  const slowSc = 2 / (slow + 1);
  const sc: (number | null)[] = new Array(n).fill(null);
  const kama: (number | null)[] = new Array(n).fill(null);
  if (p - 1 < n) kama[p - 1] = values[p - 1]!;
  for (let i = p; i < n; i += 1) {
    const erValue = er[i] ?? 0;
    const scaled = erValue * (fastSc - slowSc) + slowSc;
    const scValue = scaled * scaled;
    sc[i] = scValue;
    const prev = kama[i - 1] as number;
    kama[i] = prev + scValue * (values[i]! - prev);
  }
  return { er, sc, kama };
}

function classifyPosition(
  value: number,
  kama: number | null,
): ChartLineKamaPosition {
  if (kama === null) return 'on';
  if (value > kama) return 'above';
  if (value < kama) return 'below';
  return 'on';
}

export function runLineKama(
  points: readonly ChartLineKamaPoint[] | null | undefined,
  options?: { erPeriod?: number; fastPeriod?: number; slowPeriod?: number },
): ChartLineKamaRun {
  const finite = getLineKamaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const erPeriod = normalizeLineKamaPeriod(
    options?.erPeriod ?? DEFAULT_CHART_LINE_KAMA_ER_PERIOD,
    DEFAULT_CHART_LINE_KAMA_ER_PERIOD,
  );
  const fastPeriod = normalizeLineKamaPeriod(
    options?.fastPeriod ?? DEFAULT_CHART_LINE_KAMA_FAST_PERIOD,
    DEFAULT_CHART_LINE_KAMA_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineKamaPeriod(
    options?.slowPeriod ?? DEFAULT_CHART_LINE_KAMA_SLOW_PERIOD,
    DEFAULT_CHART_LINE_KAMA_SLOW_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      erPeriod,
      fastPeriod,
      slowPeriod,
      er: [],
      sc: [],
      kama: [],
      samples: [],
      kamaFinal: NaN,
      kamaMin: NaN,
      kamaMax: NaN,
      aboveCount: 0,
      belowCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { er, sc, kama } = computeLineKama(
    values,
    erPeriod,
    fastPeriod,
    slowPeriod,
  );

  const samples: ChartLineKamaSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    er: er[i] ?? null,
    sc: sc[i] ?? null,
    kama: kama[i] ?? null,
    position: classifyPosition(p.value, kama[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let kamaMin = NaN;
  let kamaMax = NaN;
  let aboveCount = 0;
  let belowCount = 0;
  for (const s of samples) {
    if (s.kama !== null) {
      if (Number.isNaN(kamaMin) || s.kama < kamaMin) kamaMin = s.kama;
      if (Number.isNaN(kamaMax) || s.kama > kamaMax) kamaMax = s.kama;
    }
    if (s.position === 'above') aboveCount += 1;
    if (s.position === 'below') belowCount += 1;
  }

  return {
    series = [],
    erPeriod,
    fastPeriod,
    slowPeriod,
    er,
    sc,
    kama,
    samples,
    kamaFinal: lastDefined(kama),
    kamaMin,
    kamaMax,
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

export function computeLineKamaLayout(
  options: ComputeLineKamaLayoutOptions,
): ChartLineKamaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_KAMA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const emptyPanel: ChartLineKamaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineKama(data, {
    ...(isFiniteNumber(options.erPeriod)
      ? { erPeriod: options.erPeriod }
      : {}),
    ...(isFiniteNumber(options.fastPeriod)
      ? { fastPeriod: options.fastPeriod }
      : {}),
    ...(isFiniteNumber(options.slowPeriod)
      ? { slowPeriod: options.slowPeriod }
      : {}),
  });
  const empty: ChartLineKamaLayout = {
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
    kamaPath: '',
    priceDots: [],
    kamaMarkers: [],
    erPeriod: run.erPeriod,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    kamaFinal: NaN,
    kamaMin: NaN,
    kamaMax: NaN,
    aboveCount: 0,
    belowCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineKamaPanel = {
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
    if (s.kama !== null) {
      if (s.kama < yLo) yLo = s.kama;
      if (s.kama > yHi) yHi = s.kama;
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

  const priceDots: ChartLineKamaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    er: s.er,
    kama: s.kama,
    position: s.position,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const kamaMarkers: ChartLineKamaMarker[] = [];
  const kamaPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.kama !== null) {
      const px = projectX(s.x);
      const py = projectY(s.kama);
      kamaPts.push({ px, py });
      kamaMarkers.push({ index: s.index, x: s.x, kama: s.kama, px, py });
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
    kamaPath: buildPath(kamaPts),
    priceDots,
    kamaMarkers,
    erPeriod: run.erPeriod,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    kamaFinal: run.kamaFinal,
    kamaMin: run.kamaMin,
    kamaMax: run.kamaMax,
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

export function describeLineKamaChart(
  data: readonly ChartLineKamaPoint[] | null | undefined,
  options?: { erPeriod?: number; fastPeriod?: number; slowPeriod?: number },
): string {
  const run = runLineKama(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Kaufman Adaptive Moving Average (KAMA) overlay (efficiency ratio period ${run.erPeriod}): KAMA measures trend efficiency -- the net price change over the window divided by the sum of the bar-to-bar moves -- and uses it to blend between a fast and a slow smoothing constant, so the average speeds up in a clean trend and slows down in choppy noise. The price runs above the KAMA on ${run.aboveCount} bars and below on ${run.belowCount} across ${run.samples.length} periods.`;
}

const KAMA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineKama = forwardRef<HTMLDivElement, ChartLineKamaProps>(
  function ChartLineKama(
    props: ChartLineKamaProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      erPeriod,
      fastPeriod,
      slowPeriod,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_KAMA_WIDTH,
      height = DEFAULT_CHART_LINE_KAMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_KAMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_KAMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_KAMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_KAMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_KAMA_PRICE_COLOR,
      kamaColor = DEFAULT_CHART_LINE_KAMA_KAMA_COLOR,
      gridColor = DEFAULT_CHART_LINE_KAMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_KAMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showKama = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Kaufman Adaptive Moving Average overlay',
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
        computeLineKamaLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(erPeriod) ? { erPeriod } : {}),
          ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
          ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        tickCount,
        erPeriod,
        fastPeriod,
        slowPeriod,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineKamaChart(data, {
          ...(isFiniteNumber(erPeriod) ? { erPeriod } : {}),
          ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
          ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
        }),
      [ariaDescription, data, erPeriod, fastPeriod, slowPeriod],
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
          data-section="chart-line-kama"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-kama-aria-desc"
            style={KAMA_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const cp = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const kamaVisible = showKama && !hiddenSet.has('kama');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'kama', label: 'KAMA', color: kamaColor },
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
        data-section="chart-line-kama"
        data-empty="false"
        data-er-period={layout.erPeriod}
        data-fast-period={layout.fastPeriod}
        data-slow-period={layout.slowPeriod}
        data-kama-final={layout.kamaFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-kama-aria-desc"
          style={KAMA_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-kama-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-kama-badge"
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
                data-section="chart-line-kama-badge-icon"
                aria-hidden="true"
                style={{ color: kamaColor }}
              >
                KAMA
              </span>
              <span data-section="chart-line-kama-badge-er">
                er={layout.erPeriod}
              </span>
              <span data-section="chart-line-kama-badge-bounds">
                sc={layout.fastPeriod}/{layout.slowPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-kama-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-kama-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-kama-grid-line"
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
                data-section="chart-line-kama-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-kama-axis"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-kama-axis"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                {layout.yTicks.map((t, i) => (
                  <g
                    key={`yt-${i}`}
                    data-section="chart-line-kama-tick"
                    data-axis="y"
                  >
                    <line x1={cp.x - 4} x2={cp.x} y1={t.py} y2={t.py} />
                    <text
                      data-section="chart-line-kama-tick-label"
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
                    data-section="chart-line-kama-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-kama-tick-label"
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
                data-section="chart-line-kama-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-kama-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-kama-dot"
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

            {kamaVisible && layout.kamaPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Kaufman Adaptive Moving Average line"
                data-section="chart-line-kama-kama-line"
                d={layout.kamaPath}
                fill="none"
                stroke={kamaColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {kamaVisible ? (
              <g data-section="chart-line-kama-markers">
                {layout.kamaMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`KAMA at x ${formatX(m.x)}: ${formatValue(m.kama)}`}
                      data-section="chart-line-kama-marker"
                      data-point-index={m.index}
                      data-kama={m.kama}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={kamaColor}
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
                    data-section="chart-line-kama-tooltip"
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
                    <div data-section="chart-line-kama-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-kama-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-kama-tooltip-kama">
                      kama: {d.kama === null ? 'n/a' : formatValue(d.kama)}
                    </div>
                    <div data-section="chart-line-kama-tooltip-er">
                      efficiency: {d.er === null ? 'n/a' : formatValue(d.er)}
                    </div>
                    <div data-section="chart-line-kama-tooltip-position">
                      position: {d.position}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-kama-legend"
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
                  data-section="chart-line-kama-legend-item"
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
                    data-section="chart-line-kama-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-kama-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-kama-legend-stats"
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

ChartLineKama.displayName = 'ChartLineKama';
