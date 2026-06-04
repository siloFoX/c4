import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CMF_WIDTH = 560;
export const DEFAULT_CHART_LINE_CMF_HEIGHT = 360;
export const DEFAULT_CHART_LINE_CMF_PADDING = 40;
export const DEFAULT_CHART_LINE_CMF_GAP = 26;
export const DEFAULT_CHART_LINE_CMF_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_CMF_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CMF_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CMF_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CMF_PERIOD = 20;
export const DEFAULT_CHART_LINE_CMF_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_CMF_CMF_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CMF_BUYING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CMF_SELLING_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CMF_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_CMF_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CMF_AXIS_COLOR = '#cbd5e1';

export type ChartLineCmfPressure = 'buying' | 'selling' | 'flat';

export interface ChartLineCmfPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartLineCmfSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  mfm: number;
  mfv: number;
  cmf: number | null;
  pressure: ChartLineCmfPressure;
}

export interface ChartLineCmfRun {
  series: ChartLineCmfPoint[];
  period: number;
  mfm: number[];
  mfv: number[];
  cmf: (number | null)[];
  samples: ChartLineCmfSample[];
  cmfFinal: number;
  buyingCount: number;
  sellingCount: number;
  ok: boolean;
}

export interface ChartLineCmfPriceDot {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  mfm: number;
  mfv: number;
  cmf: number | null;
  pressure: ChartLineCmfPressure;
  px: number;
  py: number;
}

export interface ChartLineCmfMarker {
  index: number;
  x: number;
  cmf: number;
  pressure: ChartLineCmfPressure;
  px: number;
  py: number;
}

export interface ChartLineCmfPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineCmfLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineCmfPanel;
  cmfPanel: ChartLineCmfPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  cmfYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineCmfPriceDot[];
  cmfPath: string;
  markers: ChartLineCmfMarker[];
  zeroY: number;
  period: number;
  cmfFinal: number;
  buyingCount: number;
  sellingCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineCmfLayoutOptions {
  data: readonly ChartLineCmfPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineCmfProps {
  data: readonly ChartLineCmfPoint[];
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
  cmfColor?: string;
  buyingColor?: string;
  sellingColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCmf?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineCmfPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineCmfFinitePoints(
  points: readonly ChartLineCmfPoint[] | null | undefined,
): ChartLineCmfPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineCmfPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close) &&
      isFiniteNumber(p.volume),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineCmfPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Marc Chaikin's Money Flow Multiplier: where the close sits within
 * the bar's high-low range, scaled to [-1, +1]. A close at the high
 * reads +1, at the low -1, at the midpoint 0. A zero-range bar reads
 * 0.
 */
export function computeLineCmfMfm(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
): number[] {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes)
  ) {
    return [];
  }
  const n = Math.min(highs.length, lows.length, closes.length);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const range = highs[i]! - lows[i]!;
    if (range === 0) {
      out[i] = 0;
    } else {
      const raw =
        (closes[i]! - lows[i]! - (highs[i]! - closes[i]!)) / range;
      out[i] = raw === 0 ? 0 : raw;
    }
  }
  return out;
}

/**
 * Marc Chaikin's Money Flow. Each bar's Money Flow Multiplier scales
 * its volume into Money Flow Volume; the CMF is the sum of money flow
 * volume over a trailing window of `period` bars divided by the sum
 * of volume over the same window -- a volume-weighted average of the
 * multiplier, bounded -1 to +1. CMF is defined from index
 * `period - 1` onward; earlier bars read null. A window with no
 * volume reads 0.
 */
export function computeLineCmf(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  period: number,
): { mfm: number[]; mfv: number[]; cmf: (number | null)[] } {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes) ||
    !Array.isArray(volumes)
  ) {
    return { mfm: [], mfv: [], cmf: [] };
  }
  const n = Math.min(
    highs.length,
    lows.length,
    closes.length,
    volumes.length,
  );
  const p = period < 1 ? 1 : Math.floor(period);
  const mfmFull = computeLineCmfMfm(highs, lows, closes);
  const mfm: number[] = new Array(n);
  const mfv: number[] = new Array(n);
  const cmf: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    mfm[i] = mfmFull[i]!;
    const rawMfv = mfm[i]! * volumes[i]!;
    mfv[i] = rawMfv === 0 ? 0 : rawMfv;
  }
  for (let i = p - 1; i < n; i += 1) {
    let sumMfv = 0;
    let sumVol = 0;
    for (let j = i - p + 1; j <= i; j += 1) {
      sumMfv += mfv[j]!;
      sumVol += volumes[j]!;
    }
    const raw = sumVol === 0 ? 0 : sumMfv / sumVol;
    cmf[i] = raw === 0 ? 0 : raw;
  }
  return { mfm, mfv, cmf };
}

function classifyPressure(cmf: number | null): ChartLineCmfPressure {
  if (cmf === null) return 'flat';
  if (cmf > 0) return 'buying';
  if (cmf < 0) return 'selling';
  return 'flat';
}

export function runLineCmf(
  points: readonly ChartLineCmfPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineCmfRun {
  const finite = getLineCmfFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineCmfPeriod(
    options?.period ?? DEFAULT_CHART_LINE_CMF_PERIOD,
    DEFAULT_CHART_LINE_CMF_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      mfm: [],
      mfv: [],
      cmf: [],
      samples: [],
      cmfFinal: NaN,
      buyingCount: 0,
      sellingCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.close);
  const volumes = series.map((p) => p.volume);
  const { mfm, mfv, cmf } = computeLineCmf(
    highs,
    lows,
    closes,
    volumes,
    period,
  );

  const samples: ChartLineCmfSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    mfm: mfm[i]!,
    mfv: mfv[i]!,
    cmf: cmf[i] ?? null,
    pressure: classifyPressure(cmf[i] ?? null),
  }));

  let cmfFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (cmf[i] !== null && cmf[i] !== undefined) {
      cmfFinal = cmf[i] as number;
      break;
    }
  }
  let buyingCount = 0;
  let sellingCount = 0;
  for (const s of samples) {
    if (s.pressure === 'buying') buyingCount += 1;
    if (s.pressure === 'selling') sellingCount += 1;
  }

  return {
    series,
    period,
    mfm,
    mfv,
    cmf,
    samples,
    cmfFinal,
    buyingCount,
    sellingCount,
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

export function computeLineCmfLayout(
  options: ComputeLineCmfLayoutOptions,
): ChartLineCmfLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_CMF_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_CMF_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_CMF_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineCmfPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineCmf(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineCmfLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    cmfPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    cmfYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    cmfPath: '',
    markers: [],
    zeroY: 0,
    period: run.period,
    cmfFinal: NaN,
    buyingCount: 0,
    sellingCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const cmfH = usableHeight - priceH;
  if (priceH <= 0 || cmfH <= 0) return empty;

  const pricePanel: ChartLineCmfPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const cmfPanel: ChartLineCmfPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: cmfH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < pyLo) pyLo = s.close;
    if (s.close > pyHi) pyHi = s.close;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  // CMF is a volume-weighted average of the multiplier, bounded -1..+1.
  const projectCmfY = (v: number): number =>
    cmfPanel.y + cmfPanel.height - ((v + 1) / 2) * cmfPanel.height;

  const priceDots: ChartLineCmfPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    close: s.close,
    volume: s.volume,
    mfm: s.mfm,
    mfv: s.mfv,
    cmf: s.cmf,
    pressure: s.pressure,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const cmfPts: { px: number; py: number }[] = [];
  const markers: ChartLineCmfMarker[] = [];
  for (const s of run.samples) {
    if (s.cmf !== null) {
      const px = projectX(s.x);
      const py = projectCmfY(s.cmf);
      cmfPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        cmf: s.cmf,
        pressure: s.pressure,
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
    cmfPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    cmfYTicks: computeTicks(-1, 1, tickCount).map((v) => ({
      value: v,
      py: projectCmfY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    cmfPath: buildPath(cmfPts),
    markers,
    zeroY: projectCmfY(0),
    period: run.period,
    cmfFinal: run.cmfFinal,
    buyingCount: run.buyingCount,
    sellingCount: run.sellingCount,
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

export function describeLineCmfChart(
  data: readonly ChartLineCmfPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineCmf(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Chaikin Money Flow (CMF) panel (period ${run.period}): each bar's money flow multiplier -- where the close sits in the high-low range -- scales its volume into money flow volume, and the CMF is the sum of money flow volume over the window divided by the sum of volume, a volume-weighted average bounded -1 to +1. A positive CMF signals buying pressure, a negative CMF selling pressure. ${run.buyingCount} buying and ${run.sellingCount} selling across ${run.samples.length} periods.`;
}

const CMF_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineCmf = forwardRef<HTMLDivElement, ChartLineCmfProps>(
  function ChartLineCmf(
    props: ChartLineCmfProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_CMF_WIDTH,
      height = DEFAULT_CHART_LINE_CMF_HEIGHT,
      padding = DEFAULT_CHART_LINE_CMF_PADDING,
      gap = DEFAULT_CHART_LINE_CMF_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_CMF_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_CMF_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_CMF_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_CMF_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_CMF_PRICE_COLOR,
      cmfColor = DEFAULT_CHART_LINE_CMF_CMF_COLOR,
      buyingColor = DEFAULT_CHART_LINE_CMF_BUYING_COLOR,
      sellingColor = DEFAULT_CHART_LINE_CMF_SELLING_COLOR,
      zeroColor = DEFAULT_CHART_LINE_CMF_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_CMF_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_CMF_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showCmf = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Chaikin Money Flow panel',
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
        computeLineCmfLayout({
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
        describeLineCmfChart(data, {
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

    const pressureColor = useCallback(
      (p: ChartLineCmfPressure): string =>
        p === 'buying'
          ? buyingColor
          : p === 'selling'
            ? sellingColor
            : cmfColor,
      [buyingColor, sellingColor, cmfColor],
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
          data-section="chart-line-cmf"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-cmf-aria-desc"
            style={CMF_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const cp = layout.cmfPanel;
    const priceVisible = !hiddenSet.has('price');
    const cmfVisible = showCmf && !hiddenSet.has('cmf');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'cmf', label: 'CMF', color: cmfColor },
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
        data-section="chart-line-cmf"
        data-empty="false"
        data-period={layout.period}
        data-cmf-final={layout.cmfFinal}
        data-buying-count={layout.buyingCount}
        data-selling-count={layout.sellingCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-cmf-aria-desc"
          style={CMF_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-cmf-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-cmf-badge"
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
                data-section="chart-line-cmf-badge-icon"
                aria-hidden="true"
                style={{ color: cmfColor }}
              >
                CMF
              </span>
              <span data-section="chart-line-cmf-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-cmf-badge-pressure">
                buy={layout.buyingCount} sell={layout.sellingCount}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-cmf-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-cmf-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-cmf-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.cmfYTicks.map((t, i) => (
                  <line
                    key={`cgy-${i}`}
                    data-section="chart-line-cmf-grid-line"
                    data-panel="cmf"
                    x1={cp.x}
                    x2={cp.x + cp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZeroLine ? (
              <line
                data-section="chart-line-cmf-zero-line"
                x1={cp.x}
                x2={cp.x + cp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-cmf-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: cp, name: 'cmf', yt: layout.cmfYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-cmf-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-cmf-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-cmf-axis"
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
                        data-section="chart-line-cmf-tick"
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
                          data-section="chart-line-cmf-tick-label"
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
                <g data-section="chart-line-cmf-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-cmf-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={cp.y + cp.height}
                        y2={cp.y + cp.height + 4}
                      />
                      <text
                        data-section="chart-line-cmf-tick-label"
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
              </g>
            ) : null}

            <g data-section="chart-line-cmf-panel-labels">
              <text
                data-section="chart-line-cmf-panel-label"
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
                data-section="chart-line-cmf-panel-label"
                data-panel="cmf"
                x={cp.x + cp.width / 2}
                y={cp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Chaikin Money Flow
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-cmf-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-cmf-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-cmf-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.close}
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

            {cmfVisible && layout.cmfPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Chaikin Money Flow line"
                data-section="chart-line-cmf-cmf-line"
                d={layout.cmfPath}
                fill="none"
                stroke={cmfColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {cmfVisible ? (
              <g data-section="chart-line-cmf-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`CMF at x ${formatX(m.x)}: ${formatValue(m.cmf)} (${m.pressure})`}
                      data-section="chart-line-cmf-marker"
                      data-point-index={m.index}
                      data-cmf={m.cmf}
                      data-pressure={m.pressure}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={pressureColor(m.pressure)}
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
                    data-section="chart-line-cmf-tooltip"
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
                    <div data-section="chart-line-cmf-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div data-section="chart-line-cmf-tooltip-high">
                      high: {formatValue(d.high)}
                    </div>
                    <div data-section="chart-line-cmf-tooltip-low">
                      low: {formatValue(d.low)}
                    </div>
                    <div data-section="chart-line-cmf-tooltip-close">
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-cmf-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-cmf-tooltip-mfm">
                      multiplier: {formatValue(d.mfm)}
                    </div>
                    <div
                      data-section="chart-line-cmf-tooltip-cmf"
                      style={{ fontWeight: 600 }}
                    >
                      cmf: {d.cmf === null ? 'n/a' : formatValue(d.cmf)}
                    </div>
                    <div data-section="chart-line-cmf-tooltip-pressure">
                      pressure: {d.pressure}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-cmf-legend"
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
                  data-section="chart-line-cmf-legend-item"
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
                    data-section="chart-line-cmf-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-cmf-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-cmf-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.buyingCount} buying, {layout.sellingCount} selling
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineCmf.displayName = 'ChartLineCmf';
