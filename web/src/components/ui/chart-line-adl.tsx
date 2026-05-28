import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ADL_WIDTH = 560;
export const DEFAULT_CHART_LINE_ADL_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ADL_PADDING = 40;
export const DEFAULT_CHART_LINE_ADL_GAP = 26;
export const DEFAULT_CHART_LINE_ADL_PRICE_PANEL_RATIO = 0.5;
export const DEFAULT_CHART_LINE_ADL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADL_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ADL_ADL_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ADL_ACCUMULATION_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADL_DISTRIBUTION_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADL_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_ADL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ADL_AXIS_COLOR = '#cbd5e1';

export type ChartLineAdlFlow = 'accumulation' | 'distribution' | 'neutral';

export interface ChartLineAdlPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartLineAdlSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  mfm: number;
  mfv: number;
  adl: number;
  flow: ChartLineAdlFlow;
}

export interface ChartLineAdlRun {
  series: ChartLineAdlPoint[];
  mfm: number[];
  mfv: number[];
  adl: number[];
  samples: ChartLineAdlSample[];
  adlFinal: number;
  adlMin: number;
  adlMax: number;
  accumulationCount: number;
  distributionCount: number;
  ok: boolean;
}

export interface ChartLineAdlPriceDot {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  mfm: number;
  mfv: number;
  adl: number;
  flow: ChartLineAdlFlow;
  px: number;
  py: number;
}

export interface ChartLineAdlMarker {
  index: number;
  x: number;
  adl: number;
  flow: ChartLineAdlFlow;
  px: number;
  py: number;
}

export interface ChartLineAdlPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineAdlLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineAdlPanel;
  adlPanel: ChartLineAdlPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  adlYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  adlYMin: number;
  adlYMax: number;
  pricePath: string;
  priceDots: ChartLineAdlPriceDot[];
  adlPath: string;
  markers: ChartLineAdlMarker[];
  zeroY: number;
  zeroInRange: boolean;
  adlFinal: number;
  adlMin: number;
  adlMax: number;
  accumulationCount: number;
  distributionCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineAdlLayoutOptions {
  data: readonly ChartLineAdlPoint[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineAdlProps {
  data: readonly ChartLineAdlPoint[];
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
  adlColor?: string;
  accumulationColor?: string;
  distributionColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdl?: boolean;
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
  onPointClick?: (payload: { point: ChartLineAdlPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineAdlFinitePoints(
  points: readonly ChartLineAdlPoint[] | null | undefined,
): ChartLineAdlPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineAdlPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close) &&
      isFiniteNumber(p.volume),
  );
}

/**
 * Marc Chaikin's Money Flow Multiplier: where the close sits within
 * the bar's high-low range, scaled to [-1, +1]. A close at the high
 * reads +1, at the low -1, at the midpoint 0. A zero-range bar reads
 * 0.
 */
export function computeLineAdlMfm(
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
 * The Accumulation/Distribution Line. Each bar's Money Flow
 * Multiplier scales its volume into Money Flow Volume; the ADL is the
 * running cumulative total of that money flow volume. A rising ADL
 * signals accumulation, a falling ADL distribution.
 */
export function computeLineAdl(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  closes: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
): { mfm: number[]; mfv: number[]; adl: number[] } {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes) ||
    !Array.isArray(volumes)
  ) {
    return { mfm: [], mfv: [], adl: [] };
  }
  const n = Math.min(
    highs.length,
    lows.length,
    closes.length,
    volumes.length,
  );
  const mfmFull = computeLineAdlMfm(highs, lows, closes);
  const mfm: number[] = new Array(n);
  const mfv: number[] = new Array(n);
  const adl: number[] = new Array(n);
  let running = 0;
  for (let i = 0; i < n; i += 1) {
    mfm[i] = mfmFull[i]!;
    const rawMfv = mfm[i]! * volumes[i]!;
    mfv[i] = rawMfv === 0 ? 0 : rawMfv;
    running = i === 0 ? mfv[i]! : running + mfv[i]!;
    adl[i] = running === 0 ? 0 : running;
  }
  return { mfm, mfv, adl };
}

function classifyFlow(mfv: number): ChartLineAdlFlow {
  if (mfv > 0) return 'accumulation';
  if (mfv < 0) return 'distribution';
  return 'neutral';
}

export function runLineAdl(
  points: readonly ChartLineAdlPoint[] | null | undefined,
): ChartLineAdlRun {
  const finite = getLineAdlFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      mfm: [],
      mfv: [],
      adl: [],
      samples: [],
      adlFinal: NaN,
      adlMin: NaN,
      adlMax: NaN,
      accumulationCount: 0,
      distributionCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const closes = series.map((p) => p.close);
  const volumes = series.map((p) => p.volume);
  const { mfm, mfv, adl } = computeLineAdl(highs, lows, closes, volumes);

  const samples: ChartLineAdlSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
    mfm: mfm[i]!,
    mfv: mfv[i]!,
    adl: adl[i]!,
    flow: classifyFlow(mfv[i]!),
  }));

  let adlMin = NaN;
  let adlMax = NaN;
  let accumulationCount = 0;
  let distributionCount = 0;
  for (const s of samples) {
    if (Number.isNaN(adlMin) || s.adl < adlMin) adlMin = s.adl;
    if (Number.isNaN(adlMax) || s.adl > adlMax) adlMax = s.adl;
    if (s.flow === 'accumulation') accumulationCount += 1;
    if (s.flow === 'distribution') distributionCount += 1;
  }

  return {
    series = [],
    mfm,
    mfv,
    adl,
    samples,
    adlFinal: adl[n - 1]!,
    adlMin,
    adlMax,
    accumulationCount,
    distributionCount,
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

export function computeLineAdlLayout(
  options: ComputeLineAdlLayoutOptions,
): ChartLineAdlLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ADL_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_ADL_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_ADL_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineAdlPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineAdl(data);
  const empty: ChartLineAdlLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    adlPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    adlYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    adlYMin: 0,
    adlYMax: 0,
    pricePath: '',
    priceDots: [],
    adlPath: '',
    markers: [],
    zeroY: 0,
    zeroInRange: false,
    adlFinal: NaN,
    adlMin: NaN,
    adlMax: NaN,
    accumulationCount: 0,
    distributionCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const adlH = usableHeight - priceH;
  if (priceH <= 0 || adlH <= 0) return empty;

  const pricePanel: ChartLineAdlPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const adlPanel: ChartLineAdlPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: adlH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let aLo = Number.POSITIVE_INFINITY;
  let aHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < pyLo) pyLo = s.close;
    if (s.close > pyHi) pyHi = s.close;
    if (s.adl < aLo) aLo = s.adl;
    if (s.adl > aHi) aHi = s.adl;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  if (aLo === aHi) {
    aLo -= 0.5;
    aHi += 0.5;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectAdlY = (v: number): number =>
    adlPanel.y + adlPanel.height - ((v - aLo) / (aHi - aLo)) * adlPanel.height;

  const priceDots: ChartLineAdlPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    close: s.close,
    volume: s.volume,
    mfm: s.mfm,
    mfv: s.mfv,
    adl: s.adl,
    flow: s.flow,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const adlPts: { px: number; py: number }[] = [];
  const markers: ChartLineAdlMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    const py = projectAdlY(s.adl);
    adlPts.push({ px, py });
    markers.push({ index: s.index, x: s.x, adl: s.adl, flow: s.flow, px, py });
  }

  const zeroInRange = aLo <= 0 && aHi >= 0;

  return {
    ok: true,
    width,
    height,
    pricePanel,
    adlPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    adlYTicks: computeTicks(aLo, aHi, tickCount).map((v) => ({
      value: v,
      py: projectAdlY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    adlYMin: aLo,
    adlYMax: aHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    adlPath: buildPath(adlPts),
    markers,
    zeroY: projectAdlY(0),
    zeroInRange,
    adlFinal: run.adlFinal,
    adlMin: run.adlMin,
    adlMax: run.adlMax,
    accumulationCount: run.accumulationCount,
    distributionCount: run.distributionCount,
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

export function describeLineAdlChart(
  data: readonly ChartLineAdlPoint[] | null | undefined,
): string {
  const run = runLineAdl(data);
  if (!run.ok) return 'No data';
  return `Line chart with an Accumulation Distribution Line (ADL) panel: each bar's money flow multiplier -- where the close sits in the high-low range -- scales its volume into money flow volume, and the ADL is the running cumulative total. A rising ADL signals accumulation, a falling ADL signals distribution. ${run.accumulationCount} accumulation and ${run.distributionCount} distribution bars across ${run.samples.length} periods.`;
}

const ADL_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineAdl = forwardRef<HTMLDivElement, ChartLineAdlProps>(
  function ChartLineAdl(
    props: ChartLineAdlProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_ADL_WIDTH,
      height = DEFAULT_CHART_LINE_ADL_HEIGHT,
      padding = DEFAULT_CHART_LINE_ADL_PADDING,
      gap = DEFAULT_CHART_LINE_ADL_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_ADL_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_ADL_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_ADL_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_ADL_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_ADL_PRICE_COLOR,
      adlColor = DEFAULT_CHART_LINE_ADL_ADL_COLOR,
      accumulationColor = DEFAULT_CHART_LINE_ADL_ACCUMULATION_COLOR,
      distributionColor = DEFAULT_CHART_LINE_ADL_DISTRIBUTION_COLOR,
      zeroColor = DEFAULT_CHART_LINE_ADL_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_ADL_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_ADL_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showAdl = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with an Accumulation Distribution Line panel',
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
        computeLineAdlLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
        }),
      [data, width, height, padding, gap, pricePanelRatio, tickCount],
    );

    const summary = useMemo(
      () => ariaDescription ?? describeLineAdlChart(data),
      [ariaDescription, data],
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

    const flowColor = useCallback(
      (f: ChartLineAdlFlow): string =>
        f === 'accumulation'
          ? accumulationColor
          : f === 'distribution'
            ? distributionColor
            : adlColor,
      [accumulationColor, distributionColor, adlColor],
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
          data-section="chart-line-adl"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-adl-aria-desc"
            style={ADL_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const ap = layout.adlPanel;
    const priceVisible = !hiddenSet.has('price');
    const adlVisible = showAdl && !hiddenSet.has('adl');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'adl', label: 'ADL', color: adlColor },
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
        data-section="chart-line-adl"
        data-empty="false"
        data-adl-final={layout.adlFinal}
        data-adl-min={layout.adlMin}
        data-adl-max={layout.adlMax}
        data-accumulation-count={layout.accumulationCount}
        data-distribution-count={layout.distributionCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-adl-aria-desc"
          style={ADL_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-adl-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-adl-badge"
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
                data-section="chart-line-adl-badge-icon"
                aria-hidden="true"
                style={{ color: adlColor }}
              >
                ADL
              </span>
              <span data-section="chart-line-adl-badge-flow">
                cumulative
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-adl-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-adl-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-adl-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.adlYTicks.map((t, i) => (
                  <line
                    key={`agy-${i}`}
                    data-section="chart-line-adl-grid-line"
                    data-panel="adl"
                    x1={ap.x}
                    x2={ap.x + ap.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZeroLine && layout.zeroInRange ? (
              <line
                data-section="chart-line-adl-zero-line"
                x1={ap.x}
                x2={ap.x + ap.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-adl-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: ap, name: 'adl', yt: layout.adlYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-adl-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-adl-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-adl-axis"
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
                        data-section="chart-line-adl-tick"
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
                          data-section="chart-line-adl-tick-label"
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
                <g data-section="chart-line-adl-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-adl-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={ap.y + ap.height}
                        y2={ap.y + ap.height + 4}
                      />
                      <text
                        data-section="chart-line-adl-tick-label"
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

            <g data-section="chart-line-adl-panel-labels">
              <text
                data-section="chart-line-adl-panel-label"
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
                data-section="chart-line-adl-panel-label"
                data-panel="adl"
                x={ap.x + ap.width / 2}
                y={ap.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Accumulation Distribution Line
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-adl-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-adl-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-adl-dot"
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

            {adlVisible && layout.adlPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Accumulation Distribution Line"
                data-section="chart-line-adl-adl-line"
                d={layout.adlPath}
                fill="none"
                stroke={adlColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {adlVisible ? (
              <g data-section="chart-line-adl-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`ADL at x ${formatX(m.x)}: ${formatValue(m.adl)} (${m.flow})`}
                      data-section="chart-line-adl-marker"
                      data-point-index={m.index}
                      data-adl={m.adl}
                      data-flow={m.flow}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={flowColor(m.flow)}
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
                    data-section="chart-line-adl-tooltip"
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
                    <div data-section="chart-line-adl-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div data-section="chart-line-adl-tooltip-high">
                      high: {formatValue(d.high)}
                    </div>
                    <div data-section="chart-line-adl-tooltip-low">
                      low: {formatValue(d.low)}
                    </div>
                    <div data-section="chart-line-adl-tooltip-close">
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-adl-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-adl-tooltip-mfv">
                      money flow: {formatValue(d.mfv)}
                    </div>
                    <div
                      data-section="chart-line-adl-tooltip-adl"
                      style={{ fontWeight: 600 }}
                    >
                      adl: {formatValue(d.adl)}
                    </div>
                    <div data-section="chart-line-adl-tooltip-flow">
                      flow: {d.flow}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-adl-legend"
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
                  data-section="chart-line-adl-legend-item"
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
                    data-section="chart-line-adl-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-adl-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-adl-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.accumulationCount} accum, {layout.distributionCount}{' '}
              dist
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineAdl.displayName = 'ChartLineAdl';
