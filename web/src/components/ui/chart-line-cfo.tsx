import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CFO_WIDTH = 560;
export const DEFAULT_CHART_LINE_CFO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_CFO_PADDING = 40;
export const DEFAULT_CHART_LINE_CFO_GAP = 12;
export const DEFAULT_CHART_LINE_CFO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CFO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CFO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CFO_PERIOD = 14;
export const DEFAULT_CHART_LINE_CFO_THRESHOLD = 3;
export const DEFAULT_CHART_LINE_CFO_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_CFO_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_CFO_FORECAST_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_CFO_CFO_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_CFO_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CFO_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CFO_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CFO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CFO_AXIS_COLOR = '#cbd5e1';

export type ChartLineCfoZone = 'above' | 'below' | 'neutral' | 'none';

export interface ChartLineCfoPoint {
  x: number;
  value: number;
}

export interface ChartLineCfoSample {
  index: number;
  x: number;
  value: number;
  forecast: number | null;
  cfo: number | null;
  zone: ChartLineCfoZone;
}

export interface ChartLineCfoRun {
  series: ChartLineCfoPoint[];
  period: number;
  threshold: number;
  forecast: (number | null)[];
  cfo: (number | null)[];
  samples: ChartLineCfoSample[];
  cfoFinal: number;
  aboveCount: number;
  belowCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineCfoPriceDot {
  index: number;
  x: number;
  value: number;
  forecast: number | null;
  cfo: number | null;
  zone: ChartLineCfoZone;
  px: number;
  py: number;
}

export interface ChartLineCfoMarker {
  index: number;
  x: number;
  cfo: number;
  zone: ChartLineCfoZone;
  px: number;
  py: number;
}

export interface ChartLineCfoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineCfoLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineCfoPanel;
  cfoPanel: ChartLineCfoPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  cfoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  cfoYMin: number;
  cfoYMax: number;
  pricePath: string;
  forecastPath: string;
  priceDots: ChartLineCfoPriceDot[];
  cfoPath: string;
  cfoMarkers: ChartLineCfoMarker[];
  zeroY: number;
  upperY: number;
  lowerY: number;
  period: number;
  threshold: number;
  cfoFinal: number;
  aboveCount: number;
  belowCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineCfoLayoutOptions {
  data: readonly ChartLineCfoPoint[];
  period?: number;
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineCfoProps {
  data: readonly ChartLineCfoPoint[];
  period?: number;
  threshold?: number;
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
  forecastColor?: string;
  cfoColor?: string;
  aboveColor?: string;
  belowColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showForecast?: boolean;
  showCfo?: boolean;
  showLevels?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineCfoPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineCfoFinitePoints(
  points: readonly ChartLineCfoPoint[] | null | undefined,
): ChartLineCfoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineCfoPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Chande Forecast Oscillator period to an integer of at
 * least 2 (a linear regression needs two points). A non-finite or
 * sub-2 value falls back to `fallback`; a fractional value floors.
 */
export function normalizeLineCfoPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * The linear regression forecast -- the value a least-squares
 * line fitted through the trailing `period` closes predicts for
 * the current bar (the regression line evaluated at its
 * endpoint). Bars before the window is full are null.
 */
export function computeLineCfoForecast(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineCfoPeriod(period, DEFAULT_CHART_LINE_CFO_PERIOD);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const sumT = (p * (p - 1)) / 2;
  const sumT2 = ((p - 1) * p * (2 * p - 1)) / 6;
  const denom = p * sumT2 - sumT * sumT;
  if (denom === 0) return out;
  for (let i = p - 1; i < n; i += 1) {
    let sumY = 0;
    let sumTY = 0;
    let valid = true;
    for (let t = 0; t < p; t += 1) {
      const v = closes[i - p + 1 + t];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sumY += v;
      sumTY += t * v;
    }
    if (!valid) continue;
    const numB = p * sumTY - sumT * sumY;
    out[i] = (sumY * denom + numB * sumT) / (p * denom);
  }
  return out;
}

/**
 * The Chande Forecast Oscillator -- the percent gap between the
 * close and its linear regression forecast:
 *
 *   CFO[i] = 100 * (close[i] - forecast[i]) / close[i]
 *
 * A positive CFO means the price is running above the forecast,
 * a negative CFO below it. A bar with a zero close is null.
 */
export function computeLineCfo(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const forecast = computeLineCfoForecast(closes, period);
  return closes.map((v, i) => {
    const f = forecast[i];
    if (!isFiniteNumber(v) || !isFiniteNumber(f) || v === 0) return null;
    return (100 * (v - f)) / v;
  });
}

function classifyZone(
  cfo: number | null,
  threshold: number,
): ChartLineCfoZone {
  if (cfo === null) return 'none';
  if (cfo > threshold) return 'above';
  if (cfo < -threshold) return 'below';
  return 'neutral';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLineCfo(
  points: readonly ChartLineCfoPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): ChartLineCfoRun {
  const finite = getLineCfoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineCfoPeriod(
    options?.period ?? DEFAULT_CHART_LINE_CFO_PERIOD,
    DEFAULT_CHART_LINE_CFO_PERIOD,
  );
  const threshold =
    isFiniteNumber(options?.threshold) && (options?.threshold ?? 0) > 0
      ? (options?.threshold as number)
      : DEFAULT_CHART_LINE_CFO_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      threshold,
      forecast: [],
      cfo: [],
      samples: [],
      cfoFinal: NaN,
      aboveCount: 0,
      belowCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const forecast = computeLineCfoForecast(closes, period);
  const cfo = closes.map((v, i) => {
    const f = forecast[i];
    if (!isFiniteNumber(v) || !isFiniteNumber(f) || v === 0) return null;
    return (100 * (v - f)) / v;
  });

  const samples: ChartLineCfoSample[] = series.map((p, i) => {
    const c = cfo[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      forecast: forecast[i] ?? null,
      cfo: c,
      zone: classifyZone(c, threshold),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let neutralCount = 0;
  let cfoFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'above') aboveCount += 1;
    else if (s.zone === 'below') belowCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.cfo !== null) cfoFinal = s.cfo;
  }

  return {
    series = [],
    period,
    threshold,
    forecast,
    cfo,
    samples,
    cfoFinal,
    aboveCount,
    belowCount,
    neutralCount,
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

export function computeLineCfoLayout(
  options: ComputeLineCfoLayoutOptions,
): ChartLineCfoLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_CFO_GAP,
    tickCount = DEFAULT_CHART_LINE_CFO_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_CFO_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineCfo(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.threshold)
      ? { threshold: options.threshold }
      : {}),
  });

  const emptyPanel: ChartLineCfoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineCfoLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    cfoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    cfoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    cfoYMin: 0,
    cfoYMax: 0,
    pricePath: '',
    forecastPath: '',
    priceDots: [],
    cfoPath: '',
    cfoMarkers: [],
    zeroY: 0,
    upperY: 0,
    lowerY: 0,
    period: run.period,
    threshold: run.threshold,
    cfoFinal: NaN,
    aboveCount: 0,
    belowCount: 0,
    neutralCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const cfoHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineCfoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const cfoPanel: ChartLineCfoPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: cfoHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let cfoLo = 0;
  let cfoHi = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    for (const v of [s.value, s.forecast]) {
      if (v !== null) {
        if (v < priceLo) priceLo = v;
        if (v > priceHi) priceHi = v;
      }
    }
    if (s.cfo !== null) {
      if (s.cfo < cfoLo) cfoLo = s.cfo;
      if (s.cfo > cfoHi) cfoHi = s.cfo;
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
  cfoLo = Math.min(cfoLo, -run.threshold);
  cfoHi = Math.max(cfoHi, run.threshold);
  if (cfoLo === cfoHi) {
    cfoLo -= 1;
    cfoHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const cfoRange = cfoHi - cfoLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectCfoY = (v: number): number =>
    cfoPanel.y + cfoPanel.height - ((v - cfoLo) / cfoRange) * cfoPanel.height;

  const priceDots: ChartLineCfoPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    forecast: s.forecast,
    cfo: s.cfo,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const forecastPts: { px: number; py: number }[] = [];
  const cfoPts: { px: number; py: number }[] = [];
  const cfoMarkers: ChartLineCfoMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.forecast !== null) {
      forecastPts.push({ px, py: projectPriceY(s.forecast) });
    }
    if (s.cfo !== null) {
      const py = projectCfoY(s.cfo);
      cfoPts.push({ px, py });
      cfoMarkers.push({
        index: s.index,
        x: s.x,
        cfo: s.cfo,
        zone: s.zone,
        px,
        py,
      });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    cfoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    cfoYTicks: computeTicks(cfoLo, cfoHi, tickCount).map((v) => ({
      value: v,
      py: projectCfoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    cfoYMin: cfoLo,
    cfoYMax: cfoHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    forecastPath: buildPath(forecastPts),
    priceDots,
    cfoPath: buildPath(cfoPts),
    cfoMarkers,
    zeroY: projectCfoY(0),
    upperY: projectCfoY(run.threshold),
    lowerY: projectCfoY(-run.threshold),
    period: run.period,
    threshold: run.threshold,
    cfoFinal: run.cfoFinal,
    aboveCount: run.aboveCount,
    belowCount: run.belowCount,
    neutralCount: run.neutralCount,
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

export function describeLineCfoChart(
  data: readonly ChartLineCfoPoint[] | null | undefined,
  options?: { period?: number; threshold?: number },
): string {
  const run = runLineCfo(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Chande Forecast Oscillator (period ${run.period}): the top panel plots the price together with its linear regression forecast; the bottom panel plots the CFO. The CFO is the percent gap between the price and the forecast -- the value a least-squares line fitted through the trailing ${run.period} bars predicts for the current bar. A positive CFO means the price is running above the forecast, a negative CFO below it; the oscillator crosses zero whenever the price meets its regression line. Readings above +${run.threshold} are above-trend and below -${run.threshold} below-trend. The CFO is above-trend on ${run.aboveCount} bars, below-trend on ${run.belowCount} and neutral on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const CFO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineCfo = forwardRef<HTMLDivElement, ChartLineCfoProps>(
  function ChartLineCfo(
    props: ChartLineCfoProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      threshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_CFO_WIDTH,
      height = DEFAULT_CHART_LINE_CFO_HEIGHT,
      padding = DEFAULT_CHART_LINE_CFO_PADDING,
      gap = DEFAULT_CHART_LINE_CFO_GAP,
      tickCount = DEFAULT_CHART_LINE_CFO_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_CFO_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_CFO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_CFO_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_CFO_PRICE_COLOR,
      forecastColor = DEFAULT_CHART_LINE_CFO_FORECAST_COLOR,
      cfoColor = DEFAULT_CHART_LINE_CFO_CFO_COLOR,
      aboveColor = DEFAULT_CHART_LINE_CFO_ABOVE_COLOR,
      belowColor = DEFAULT_CHART_LINE_CFO_BELOW_COLOR,
      zeroColor = DEFAULT_CHART_LINE_CFO_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_CFO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_CFO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showForecast = true,
      showCfo = true,
      showLevels = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Chande Forecast Oscillator',
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
        computeLineCfoLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(threshold) ? { threshold } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        period,
        threshold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineCfoChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(threshold) ? { threshold } : {}),
        }),
      [ariaDescription, data, period, threshold],
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
          data-section="chart-line-cfo"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-cfo-aria-desc"
            style={CFO_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const cp = layout.cfoPanel;
    const priceVisible = !hiddenSet.has('price');
    const forecastVisible = showForecast && !hiddenSet.has('forecast');
    const cfoVisible = showCfo && !hiddenSet.has('cfo');
    const levelsVisible = showLevels && !hiddenSet.has('levels');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineCfoZone): string => {
      if (zone === 'above') return aboveColor;
      if (zone === 'below') return belowColor;
      return cfoColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'forecast', label: 'Forecast', color: forecastColor },
      { id: 'cfo', label: 'CFO', color: cfoColor },
      { id: 'levels', label: 'Levels', color: zeroColor },
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
        data-section="chart-line-cfo"
        data-empty="false"
        data-period={layout.period}
        data-threshold={layout.threshold}
        data-cfo-final={layout.cfoFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-neutral-count={layout.neutralCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-cfo-aria-desc"
          style={CFO_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-cfo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-cfo-badge"
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
                data-section="chart-line-cfo-badge-icon"
                aria-hidden="true"
                style={{ color: cfoColor }}
              >
                CFO
              </span>
              <span data-section="chart-line-cfo-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-cfo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-cfo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-cfo-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.cfoYTicks.map((t, i) => (
                  <line
                    key={`gc-${i}`}
                    data-section="chart-line-cfo-grid-line"
                    data-panel="cfo"
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
                data-section="chart-line-cfo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-cfo-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-cfo-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-cfo-axis"
                  data-panel="cfo"
                  data-axis="y"
                  x1={cp.x}
                  y1={cp.y}
                  x2={cp.x}
                  y2={cp.y + cp.height}
                />
                <line
                  data-section="chart-line-cfo-axis"
                  data-panel="cfo"
                  data-axis="x"
                  x1={cp.x}
                  y1={cp.y + cp.height}
                  x2={cp.x + cp.width}
                  y2={cp.y + cp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-cfo-tick-label"
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
                {layout.cfoYTicks.map((t, i) => (
                  <text
                    key={`cyt-${i}`}
                    data-section="chart-line-cfo-tick-label"
                    data-panel="cfo"
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
                ))}
                {layout.xTicks.map((t, i) => (
                  <text
                    key={`xt-${i}`}
                    data-section="chart-line-cfo-tick-label"
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
                ))}
              </g>
            ) : null}

            <text
              data-section="chart-line-cfo-panel-label"
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
              data-section="chart-line-cfo-panel-label"
              data-panel="cfo"
              x={cp.x + 2}
              y={cp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              CFO
            </text>

            {levelsVisible ? (
              <g data-section="chart-line-cfo-levels">
                <line
                  data-section="chart-line-cfo-level-line"
                  data-level="upper"
                  x1={cp.x}
                  x2={cp.x + cp.width}
                  y1={layout.upperY}
                  y2={layout.upperY}
                  stroke={aboveColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-cfo-level-line"
                  data-level="zero"
                  x1={cp.x}
                  x2={cp.x + cp.width}
                  y1={layout.zeroY}
                  y2={layout.zeroY}
                  stroke={zeroColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-cfo-level-line"
                  data-level="lower"
                  x1={cp.x}
                  x2={cp.x + cp.width}
                  y1={layout.lowerY}
                  y2={layout.lowerY}
                  stroke={belowColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </g>
            ) : null}

            {forecastVisible && layout.forecastPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Linear regression forecast line"
                data-section="chart-line-cfo-forecast-path"
                d={layout.forecastPath}
                fill="none"
                stroke={forecastColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-cfo-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-cfo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-cfo-dot"
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

            {cfoVisible && layout.cfoPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Chande Forecast Oscillator line"
                data-section="chart-line-cfo-cfo-line"
                d={layout.cfoPath}
                fill="none"
                stroke={cfoColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {cfoVisible ? (
              <g data-section="chart-line-cfo-markers">
                {layout.cfoMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`CFO at x ${formatX(m.x)}: ${formatValue(m.cfo)}, ${m.zone}`}
                      data-section="chart-line-cfo-marker"
                      data-point-index={m.index}
                      data-cfo={m.cfo}
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
                    data-section="chart-line-cfo-tooltip"
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
                    <div data-section="chart-line-cfo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-cfo-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-cfo-tooltip-forecast">
                      forecast: {fmtNullable(d.forecast)}
                    </div>
                    <div data-section="chart-line-cfo-tooltip-cfo">
                      cfo: {fmtNullable(d.cfo)}
                    </div>
                    <div data-section="chart-line-cfo-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-cfo-legend"
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
                  data-section="chart-line-cfo-legend-item"
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
                    data-section="chart-line-cfo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-cfo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-cfo-legend-stats"
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

ChartLineCfo.displayName = 'ChartLineCfo';
