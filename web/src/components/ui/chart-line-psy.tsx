import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PSY_WIDTH = 560;
export const DEFAULT_CHART_LINE_PSY_HEIGHT = 360;
export const DEFAULT_CHART_LINE_PSY_PADDING = 40;
export const DEFAULT_CHART_LINE_PSY_GAP = 12;
export const DEFAULT_CHART_LINE_PSY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PSY_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PSY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PSY_PERIOD = 12;
export const DEFAULT_CHART_LINE_PSY_UPPER_THRESHOLD = 75;
export const DEFAULT_CHART_LINE_PSY_LOWER_THRESHOLD = 25;
export const DEFAULT_CHART_LINE_PSY_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_PSY_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_PSY_PSY_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_PSY_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PSY_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PSY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PSY_AXIS_COLOR = '#cbd5e1';

export type ChartLinePsyZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export interface ChartLinePsyPoint {
  x: number;
  value: number;
}

export interface ChartLinePsySample {
  index: number;
  x: number;
  value: number;
  psy: number | null;
  zone: ChartLinePsyZone;
}

export interface ChartLinePsyRun {
  series: ChartLinePsyPoint[];
  period: number;
  upperThreshold: number;
  lowerThreshold: number;
  psy: (number | null)[];
  samples: ChartLinePsySample[];
  psyFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLinePsyPriceDot {
  index: number;
  x: number;
  value: number;
  psy: number | null;
  zone: ChartLinePsyZone;
  px: number;
  py: number;
}

export interface ChartLinePsyMarker {
  index: number;
  x: number;
  psy: number;
  zone: ChartLinePsyZone;
  px: number;
  py: number;
}

export interface ChartLinePsyPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLinePsyLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLinePsyPanel;
  psyPanel: ChartLinePsyPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  psyYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLinePsyPriceDot[];
  psyPath: string;
  markers: ChartLinePsyMarker[];
  upperY: number;
  lowerY: number;
  period: number;
  upperThreshold: number;
  lowerThreshold: number;
  psyFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLinePsyLayoutOptions {
  data: readonly ChartLinePsyPoint[];
  period?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLinePsyProps {
  data: readonly ChartLinePsyPoint[];
  period?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
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
  psyColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPsy?: boolean;
  showLevels?: boolean;
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
  onPointClick?: (payload: { point: ChartLinePsyPriceDot }) => void;
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

export function getLinePsyFinitePoints(
  points: readonly ChartLinePsyPoint[] | null | undefined,
): ChartLinePsyPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLinePsyPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Psychological Line lookback to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a
 * fractional value floors.
 */
export function normalizeLinePsyPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The up-bar flags of a close series -- a bar is an up bar when
 * its close exceeds the prior close. The opening bar has no prior
 * close and is null.
 */
export function computeLinePsyUpBars(
  closes: readonly number[] | null | undefined,
): (boolean | null)[] {
  if (!Array.isArray(closes)) return [];
  const n = closes.length;
  const out: (boolean | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (isFiniteNumber(cur) && isFiniteNumber(prev)) {
      out[i] = cur > prev;
    }
  }
  return out;
}

/**
 * The Psychological Line -- the share of up bars over the
 * trailing `period` bars, scaled to 0..100. Bars before the
 * window of up-bar flags is full are null.
 */
export function computeLinePsy(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const up = computeLinePsyUpBars(closes);
  const p = normalizeLinePsyPeriod(period, DEFAULT_CHART_LINE_PSY_PERIOD);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let count = 0;
    let valid = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const u = up[j];
      if (u === null || u === undefined) {
        valid = false;
        break;
      }
      if (u) count += 1;
    }
    if (valid) out[i] = (100 * count) / p;
  }
  return out;
}

function normalizeThreshold(value: number | undefined, fallback: number): number {
  if (!isFiniteNumber(value) || value <= 0 || value >= 100) return fallback;
  return value;
}

function classifyZone(
  psy: number | null,
  upper: number,
  lower: number,
): ChartLinePsyZone {
  if (psy === null) return 'none';
  if (psy > upper) return 'overbought';
  if (psy < lower) return 'oversold';
  return 'neutral';
}

export function runLinePsy(
  points: readonly ChartLinePsyPoint[] | null | undefined,
  options?: {
    period?: number;
    upperThreshold?: number;
    lowerThreshold?: number;
  },
): ChartLinePsyRun {
  const finite = getLinePsyFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLinePsyPeriod(
    options?.period ?? DEFAULT_CHART_LINE_PSY_PERIOD,
    DEFAULT_CHART_LINE_PSY_PERIOD,
  );
  const upperThreshold = normalizeThreshold(
    options?.upperThreshold,
    DEFAULT_CHART_LINE_PSY_UPPER_THRESHOLD,
  );
  const lowerThreshold = normalizeThreshold(
    options?.lowerThreshold,
    DEFAULT_CHART_LINE_PSY_LOWER_THRESHOLD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      upperThreshold,
      lowerThreshold,
      psy: [],
      samples: [],
      psyFinal: NaN,
      overboughtCount: 0,
      oversoldCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const psy = computeLinePsy(closes, period);

  const samples: ChartLinePsySample[] = series.map((p, i) => {
    const v = psy[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      psy: v,
      zone: classifyZone(v, upperThreshold, lowerThreshold),
    };
  });

  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let psyFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'overbought') overboughtCount += 1;
    else if (s.zone === 'oversold') oversoldCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.psy !== null) psyFinal = s.psy;
  }

  return {
    series = [],
    period,
    upperThreshold,
    lowerThreshold,
    psy,
    samples,
    psyFinal,
    overboughtCount,
    oversoldCount,
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

export function computeLinePsyLayout(
  options: ComputeLinePsyLayoutOptions,
): ChartLinePsyLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_PSY_GAP,
    tickCount = DEFAULT_CHART_LINE_PSY_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_PSY_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLinePsy(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.upperThreshold)
      ? { upperThreshold: options.upperThreshold }
      : {}),
    ...(isFiniteNumber(options.lowerThreshold)
      ? { lowerThreshold: options.lowerThreshold }
      : {}),
  });

  const emptyPanel: ChartLinePsyPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLinePsyLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    psyPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    psyYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    psyPath: '',
    markers: [],
    upperY: 0,
    lowerY: 0,
    period: run.period,
    upperThreshold: run.upperThreshold,
    lowerThreshold: run.lowerThreshold,
    psyFinal: NaN,
    overboughtCount: 0,
    oversoldCount: 0,
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
  const psyHeight = usableHeight - priceHeight;

  const pricePanel: ChartLinePsyPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const psyPanel: ChartLinePsyPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: psyHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectPsyY = (v: number): number =>
    psyPanel.y + psyPanel.height - (clamp(v, 0, 100) / 100) * psyPanel.height;

  const priceDots: ChartLinePsyPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    psy: s.psy,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const psyPts: { px: number; py: number }[] = [];
  const markers: ChartLinePsyMarker[] = [];
  for (const s of run.samples) {
    if (s.psy === null) continue;
    const px = projectX(s.x);
    const py = projectPsyY(s.psy);
    psyPts.push({ px, py });
    markers.push({ index: s.index, x: s.x, psy: s.psy, zone: s.zone, px, py });
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    psyPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    psyYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectPsyY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    psyPath: buildPath(psyPts),
    markers,
    upperY: projectPsyY(run.upperThreshold),
    lowerY: projectPsyY(run.lowerThreshold),
    period: run.period,
    upperThreshold: run.upperThreshold,
    lowerThreshold: run.lowerThreshold,
    psyFinal: run.psyFinal,
    overboughtCount: run.overboughtCount,
    oversoldCount: run.oversoldCount,
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

export function describeLinePsyChart(
  data: readonly ChartLinePsyPoint[] | null | undefined,
  options?: {
    period?: number;
    upperThreshold?: number;
    lowerThreshold?: number;
  },
): string {
  const run = runLinePsy(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with the Psychological Line (period ${run.period}): the top panel plots the price; the bottom panel plots the Psychological Line. The line is the share of up bars -- bars that closed above the prior close -- over the trailing ${run.period} bars, scaled to 0..100. A reading above ${run.upperThreshold} marks an over-optimistic, overbought market; below ${run.lowerThreshold} an over-pessimistic, oversold one. The line is overbought on ${run.overboughtCount} bars, oversold on ${run.oversoldCount} and neutral on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const PSY_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLinePsy = forwardRef<HTMLDivElement, ChartLinePsyProps>(
  function ChartLinePsy(
    props: ChartLinePsyProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      upperThreshold,
      lowerThreshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_PSY_WIDTH,
      height = DEFAULT_CHART_LINE_PSY_HEIGHT,
      padding = DEFAULT_CHART_LINE_PSY_PADDING,
      gap = DEFAULT_CHART_LINE_PSY_GAP,
      tickCount = DEFAULT_CHART_LINE_PSY_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_PSY_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_PSY_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_PSY_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_PSY_PRICE_COLOR,
      psyColor = DEFAULT_CHART_LINE_PSY_PSY_COLOR,
      overboughtColor = DEFAULT_CHART_LINE_PSY_OVERBOUGHT_COLOR,
      oversoldColor = DEFAULT_CHART_LINE_PSY_OVERSOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_PSY_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_PSY_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showPsy = true,
      showLevels = true,
      showMarkers = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with the Psychological Line',
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
        computeLinePsyLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(upperThreshold)
            ? { upperThreshold }
            : {}),
          ...(isFiniteNumber(lowerThreshold)
            ? { lowerThreshold }
            : {}),
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
        upperThreshold,
        lowerThreshold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLinePsyChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(upperThreshold)
            ? { upperThreshold }
            : {}),
          ...(isFiniteNumber(lowerThreshold)
            ? { lowerThreshold }
            : {}),
        }),
      [ariaDescription, data, period, upperThreshold, lowerThreshold],
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
          data-section="chart-line-psy"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-psy-aria-desc"
            style={PSY_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const sp = layout.psyPanel;
    const priceVisible = !hiddenSet.has('price');
    const psyVisible = showPsy && !hiddenSet.has('psy');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLinePsyZone): string => {
      if (zone === 'overbought') return overboughtColor;
      if (zone === 'oversold') return oversoldColor;
      return psyColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'psy', label: 'PSY', color: psyColor },
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
        data-section="chart-line-psy"
        data-empty="false"
        data-period={layout.period}
        data-upper-threshold={layout.upperThreshold}
        data-lower-threshold={layout.lowerThreshold}
        data-psy-final={layout.psyFinal}
        data-overbought-count={layout.overboughtCount}
        data-oversold-count={layout.oversoldCount}
        data-neutral-count={layout.neutralCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-psy-aria-desc"
          style={PSY_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-psy-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-psy-badge"
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
                data-section="chart-line-psy-badge-icon"
                aria-hidden="true"
                style={{ color: psyColor }}
              >
                PSY
              </span>
              <span data-section="chart-line-psy-badge-config">
                {layout.period}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-psy-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-psy-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-psy-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.psyYTicks.map((t, i) => (
                  <line
                    key={`gs-${i}`}
                    data-section="chart-line-psy-grid-line"
                    data-panel="psy"
                    x1={sp.x}
                    x2={sp.x + sp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-psy-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-psy-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-psy-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-psy-axis"
                  data-panel="psy"
                  data-axis="y"
                  x1={sp.x}
                  y1={sp.y}
                  x2={sp.x}
                  y2={sp.y + sp.height}
                />
                <line
                  data-section="chart-line-psy-axis"
                  data-panel="psy"
                  data-axis="x"
                  x1={sp.x}
                  y1={sp.y + sp.height}
                  x2={sp.x + sp.width}
                  y2={sp.y + sp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-psy-tick-label"
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
                {layout.psyYTicks.map((t, i) => (
                  <text
                    key={`syt-${i}`}
                    data-section="chart-line-psy-tick-label"
                    data-panel="psy"
                    data-axis="y"
                    x={sp.x - 6}
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
                    data-section="chart-line-psy-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={sp.y + sp.height + 14}
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
              data-section="chart-line-psy-panel-label"
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
              data-section="chart-line-psy-panel-label"
              data-panel="psy"
              x={sp.x + 2}
              y={sp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Psychological Line
            </text>

            {showLevels ? (
              <g data-section="chart-line-psy-levels">
                <line
                  data-section="chart-line-psy-level-line"
                  data-level="upper"
                  x1={sp.x}
                  x2={sp.x + sp.width}
                  y1={layout.upperY}
                  y2={layout.upperY}
                  stroke={overboughtColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-psy-level-line"
                  data-level="lower"
                  x1={sp.x}
                  x2={sp.x + sp.width}
                  y1={layout.lowerY}
                  y2={layout.lowerY}
                  stroke={oversoldColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </g>
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-psy-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-psy-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-psy-dot"
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

            {psyVisible && layout.psyPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Psychological Line"
                data-section="chart-line-psy-psy-line"
                d={layout.psyPath}
                fill="none"
                stroke={psyColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {psyVisible && showMarkers ? (
              <g data-section="chart-line-psy-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Psychological Line at x ${formatX(m.x)}: ${formatValue(m.psy)}, ${m.zone}`}
                      data-section="chart-line-psy-marker"
                      data-point-index={m.index}
                      data-psy={m.psy}
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
                    data-section="chart-line-psy-tooltip"
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
                    <div data-section="chart-line-psy-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-psy-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-psy-tooltip-psy">
                      psy: {fmtNullable(d.psy)}
                    </div>
                    <div data-section="chart-line-psy-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-psy-legend"
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
                  data-section="chart-line-psy-legend-item"
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
                    data-section="chart-line-psy-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-psy-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-psy-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.overboughtCount} overbought, {layout.oversoldCount}{' '}
              oversold, {layout.neutralCount} neutral
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLinePsy.displayName = 'ChartLinePsy';
