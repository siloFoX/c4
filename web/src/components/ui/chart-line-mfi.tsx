import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MFI_WIDTH = 560;
export const DEFAULT_CHART_LINE_MFI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_MFI_PADDING = 40;
export const DEFAULT_CHART_LINE_MFI_GAP = 26;
export const DEFAULT_CHART_LINE_MFI_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_MFI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MFI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MFI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MFI_PERIOD = 14;
export const DEFAULT_CHART_LINE_MFI_OVERBOUGHT = 80;
export const DEFAULT_CHART_LINE_MFI_OVERSOLD = 20;
export const DEFAULT_CHART_LINE_MFI_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_MFI_MFI_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_MFI_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MFI_OVERSOLD_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MFI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MFI_AXIS_COLOR = '#cbd5e1';

export type ChartLineMfiZone = 'overbought' | 'oversold' | 'neutral';

export interface ChartLineMfiPoint {
  x: number;
  price: number;
  volume: number;
}

export interface ChartLineMfiSample {
  index: number;
  x: number;
  price: number;
  volume: number;
  mfi: number | null;
  zone: ChartLineMfiZone;
}

export interface ChartLineMfiRun {
  series: ChartLineMfiPoint[];
  period: number;
  overbought: number;
  oversold: number;
  mfi: (number | null)[];
  samples: ChartLineMfiSample[];
  mfiFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  ok: boolean;
}

export interface ChartLineMfiPriceDot {
  index: number;
  x: number;
  price: number;
  volume: number;
  mfi: number | null;
  zone: ChartLineMfiZone;
  px: number;
  py: number;
}

export interface ChartLineMfiMarker {
  index: number;
  x: number;
  mfi: number;
  zone: ChartLineMfiZone;
  px: number;
  py: number;
}

export interface ChartLineMfiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineMfiLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineMfiPanel;
  mfiPanel: ChartLineMfiPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  mfiYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineMfiPriceDot[];
  mfiPath: string;
  markers: ChartLineMfiMarker[];
  overbought: number;
  oversold: number;
  overboughtY: number;
  oversoldY: number;
  overboughtZone: ChartLineMfiPanel;
  oversoldZone: ChartLineMfiPanel;
  period: number;
  mfiFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineMfiLayoutOptions {
  data: readonly ChartLineMfiPoint[];
  period?: number;
  overbought?: number;
  oversold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineMfiProps {
  data: readonly ChartLineMfiPoint[];
  period?: number;
  overbought?: number;
  oversold?: number;
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
  valueColor?: string;
  mfiColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMfi?: boolean;
  showZones?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineMfiPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineMfiFinitePoints(
  points: readonly ChartLineMfiPoint[] | null | undefined,
): ChartLineMfiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineMfiPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.price) &&
      isFiniteNumber(p.volume),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineMfiPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The Money Flow Index -- a volume-weighted momentum oscillator. Each
 * period's raw money flow is `price * volume`; the flow counts as
 * positive when the price rose from the prior period and negative
 * when it fell. Over a trailing window of `period` flows,
 * `MFI = 100 * positiveFlow / (positiveFlow + negativeFlow)`. A
 * window with no directional flow reads 50. MFI is defined from
 * index `period` onward; earlier indices read null.
 */
export function computeLineMfi(
  prices: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(prices) || !Array.isArray(volumes)) return [];
  const n = prices.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const posMF: number[] = new Array(n).fill(0);
  const negMF: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const rawFlow = prices[i]! * (volumes[i] ?? 0);
    if (prices[i]! > prices[i - 1]!) posMF[i] = rawFlow;
    else if (prices[i]! < prices[i - 1]!) negMF[i] = rawFlow;
  }
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let posSum = 0;
    let negSum = 0;
    for (let j = i - p + 1; j <= i; j += 1) {
      posSum += posMF[j]!;
      negSum += negMF[j]!;
    }
    const total = posSum + negSum;
    const raw = total === 0 ? 50 : (100 * posSum) / total;
    out[i] = raw === 0 ? 0 : raw;
  }
  return out;
}

function classifyZone(
  mfi: number | null,
  overbought: number,
  oversold: number,
): ChartLineMfiZone {
  if (mfi === null) return 'neutral';
  if (mfi > overbought) return 'overbought';
  if (mfi < oversold) return 'oversold';
  return 'neutral';
}

export function runLineMfi(
  points: readonly ChartLineMfiPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): ChartLineMfiRun {
  const finite = getLineMfiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineMfiPeriod(
    options?.period ?? DEFAULT_CHART_LINE_MFI_PERIOD,
    DEFAULT_CHART_LINE_MFI_PERIOD,
  );
  const overbought = isFiniteNumber(options?.overbought)
    ? options.overbought
    : DEFAULT_CHART_LINE_MFI_OVERBOUGHT;
  const oversold = isFiniteNumber(options?.oversold)
    ? options.oversold
    : DEFAULT_CHART_LINE_MFI_OVERSOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      overbought,
      oversold,
      mfi: [],
      samples: [],
      mfiFinal: NaN,
      overboughtCount: 0,
      oversoldCount: 0,
      ok: false,
    };
  }

  const prices = series.map((p) => p.price);
  const volumes = series.map((p) => p.volume);
  const mfi = computeLineMfi(prices, volumes, period);
  const samples: ChartLineMfiSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    price: p.price,
    volume: p.volume,
    mfi: mfi[i] ?? null,
    zone: classifyZone(mfi[i] ?? null, overbought, oversold),
  }));

  let mfiFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (mfi[i] !== null) {
      mfiFinal = mfi[i] as number;
      break;
    }
  }
  let overboughtCount = 0;
  let oversoldCount = 0;
  for (const s of samples) {
    if (s.zone === 'overbought') overboughtCount += 1;
    if (s.zone === 'oversold') oversoldCount += 1;
  }

  return {
    series,
    period,
    overbought,
    oversold,
    mfi,
    samples,
    mfiFinal,
    overboughtCount,
    oversoldCount,
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

export function computeLineMfiLayout(
  options: ComputeLineMfiLayoutOptions,
): ChartLineMfiLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_MFI_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_MFI_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_MFI_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineMfiPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineMfi(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.overbought)
      ? { overbought: options.overbought }
      : {}),
    ...(isFiniteNumber(options.oversold)
      ? { oversold: options.oversold }
      : {}),
  });
  const empty: ChartLineMfiLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    mfiPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    mfiYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    mfiPath: '',
    markers: [],
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtY: 0,
    oversoldY: 0,
    overboughtZone: emptyPanel,
    oversoldZone: emptyPanel,
    period: run.period,
    mfiFinal: NaN,
    overboughtCount: 0,
    oversoldCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const mfiH = usableHeight - priceH;
  if (priceH <= 0 || mfiH <= 0) return empty;

  const pricePanel: ChartLineMfiPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const mfiPanel: ChartLineMfiPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: mfiH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.price < pyLo) pyLo = s.price;
    if (s.price > pyHi) pyHi = s.price;
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
  const projectMfiY = (v: number): number =>
    mfiPanel.y + mfiPanel.height - (v / 100) * mfiPanel.height;

  const priceDots: ChartLineMfiPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    price: s.price,
    volume: s.volume,
    mfi: s.mfi,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.price),
  }));

  const markers: ChartLineMfiMarker[] = [];
  const mfiPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.mfi !== null) {
      const px = projectX(s.x);
      const py = projectMfiY(s.mfi);
      mfiPts.push({ px, py });
      markers.push({ index: s.index, x: s.x, mfi: s.mfi, zone: s.zone, px, py });
    }
  }

  const overboughtY = projectMfiY(run.overbought);
  const oversoldY = projectMfiY(run.oversold);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    mfiPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    mfiYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectMfiY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    mfiPath: buildPath(mfiPts),
    markers,
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtY,
    oversoldY,
    overboughtZone: {
      x: mfiPanel.x,
      y: mfiPanel.y,
      width: mfiPanel.width,
      height: Math.max(0, overboughtY - mfiPanel.y),
    },
    oversoldZone: {
      x: mfiPanel.x,
      y: oversoldY,
      width: mfiPanel.width,
      height: Math.max(0, mfiPanel.y + mfiPanel.height - oversoldY),
    },
    period: run.period,
    mfiFinal: run.mfiFinal,
    overboughtCount: run.overboughtCount,
    oversoldCount: run.oversoldCount,
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

export function describeLineMfiChart(
  data: readonly ChartLineMfiPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): string {
  const run = runLineMfi(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Money Flow Index panel (period ${run.period}): MFI is a volume-weighted momentum oscillator -- it ranks each period's price move by the money flow (price times volume) behind it; readings above 80 are overbought and below 20 oversold. ${run.overboughtCount} overbought and ${run.oversoldCount} oversold across ${run.samples.length} periods.`;
}

const MFI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineMfi = forwardRef<HTMLDivElement, ChartLineMfiProps>(
  function ChartLineMfi(
    props: ChartLineMfiProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      overbought,
      oversold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_MFI_WIDTH,
      height = DEFAULT_CHART_LINE_MFI_HEIGHT,
      padding = DEFAULT_CHART_LINE_MFI_PADDING,
      gap = DEFAULT_CHART_LINE_MFI_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_MFI_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_MFI_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_MFI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_MFI_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_MFI_VALUE_COLOR,
      mfiColor = DEFAULT_CHART_LINE_MFI_MFI_COLOR,
      overboughtColor = DEFAULT_CHART_LINE_MFI_OVERBOUGHT_COLOR,
      oversoldColor = DEFAULT_CHART_LINE_MFI_OVERSOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_MFI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_MFI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showMfi = true,
      showZones = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Money Flow Index panel',
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
        computeLineMfiLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(overbought) ? { overbought } : {}),
          ...(isFiniteNumber(oversold) ? { oversold } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        period,
        overbought,
        oversold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineMfiChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(overbought) ? { overbought } : {}),
          ...(isFiniteNumber(oversold) ? { oversold } : {}),
        }),
      [ariaDescription, data, period, overbought, oversold],
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

    const zoneColor = useCallback(
      (z: ChartLineMfiZone): string =>
        z === 'overbought'
          ? overboughtColor
          : z === 'oversold'
            ? oversoldColor
            : mfiColor,
      [overboughtColor, oversoldColor, mfiColor],
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
          data-section="chart-line-mfi"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-mfi-aria-desc" style={MFI_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const mp = layout.mfiPanel;
    const valueVisible = !hiddenSet.has('value');
    const mfiVisible = showMfi && !hiddenSet.has('mfi');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Price', color: valueColor },
      { id: 'mfi', label: 'MFI', color: mfiColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-mfi"
        data-empty="false"
        data-period={layout.period}
        data-mfi-final={layout.mfiFinal}
        data-overbought-count={layout.overboughtCount}
        data-oversold-count={layout.oversoldCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-mfi-aria-desc" style={MFI_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-mfi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-mfi-badge"
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
                data-section="chart-line-mfi-badge-icon"
                aria-hidden="true"
                style={{ color: mfiColor }}
              >
                MFI
              </span>
              <span data-section="chart-line-mfi-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-mfi-badge-extremes">
                ext={layout.overboughtCount + layout.oversoldCount}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-mfi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showZones ? (
              <g data-section="chart-line-mfi-zones">
                <rect
                  data-section="chart-line-mfi-zone"
                  data-zone="overbought"
                  x={layout.overboughtZone.x}
                  y={layout.overboughtZone.y}
                  width={layout.overboughtZone.width}
                  height={layout.overboughtZone.height}
                  fill={overboughtColor}
                  fillOpacity={0.12}
                />
                <rect
                  data-section="chart-line-mfi-zone"
                  data-zone="oversold"
                  x={layout.oversoldZone.x}
                  y={layout.oversoldZone.y}
                  width={layout.oversoldZone.width}
                  height={layout.oversoldZone.height}
                  fill={oversoldColor}
                  fillOpacity={0.12}
                />
              </g>
            ) : null}

            {showGrid ? (
              <g
                data-section="chart-line-mfi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-mfi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.mfiYTicks.map((t, i) => (
                  <line
                    key={`mgy-${i}`}
                    data-section="chart-line-mfi-grid-line"
                    data-panel="mfi"
                    x1={mp.x}
                    x2={mp.x + mp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZones ? (
              <g data-section="chart-line-mfi-levels">
                {[
                  { name: 'overbought', y: layout.overboughtY, level: layout.overbought },
                  { name: 'oversold', y: layout.oversoldY, level: layout.oversold },
                ].map((lv) => (
                  <g
                    key={`lv-${lv.name}`}
                    data-section="chart-line-mfi-level"
                    data-level={lv.name}
                  >
                    <line
                      data-section="chart-line-mfi-level-line"
                      data-level={lv.name}
                      x1={mp.x}
                      x2={mp.x + mp.width}
                      y1={lv.y}
                      y2={lv.y}
                      stroke={
                        lv.name === 'overbought'
                          ? overboughtColor
                          : oversoldColor
                      }
                      strokeWidth={1}
                      strokeDasharray="4 3"
                    />
                    <text
                      data-section="chart-line-mfi-level-label"
                      data-level={lv.name}
                      x={mp.x + mp.width - 2}
                      y={lv.y - 3}
                      textAnchor="end"
                      fontSize={9}
                      fill={
                        lv.name === 'overbought'
                          ? overboughtColor
                          : oversoldColor
                      }
                      stroke="none"
                    >
                      {formatValue(lv.level)}
                    </text>
                  </g>
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-mfi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: mp, name: 'mfi', yt: layout.mfiYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-mfi-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-mfi-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-mfi-axis"
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
                        data-section="chart-line-mfi-tick"
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
                          data-section="chart-line-mfi-tick-label"
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
                <g data-section="chart-line-mfi-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-mfi-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={mp.y + mp.height}
                        y2={mp.y + mp.height + 4}
                      />
                      <text
                        data-section="chart-line-mfi-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={mp.y + mp.height + 14}
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

            <g data-section="chart-line-mfi-panel-labels">
              <text
                data-section="chart-line-mfi-panel-label"
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
                data-section="chart-line-mfi-panel-label"
                data-panel="mfi"
                x={mp.x + mp.width / 2}
                y={mp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                MFI
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-mfi-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-mfi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, price ${formatValue(d.price)}`}
                      data-section="chart-line-mfi-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-price={d.price}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={valueColor}
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

            {mfiVisible && layout.mfiPath ? (
              <path
                data-section="chart-line-mfi-mfi-line"
                d={layout.mfiPath}
                fill="none"
                stroke={mfiColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {mfiVisible ? (
              <g data-section="chart-line-mfi-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`MFI at x ${formatX(m.x)}: ${formatValue(m.mfi)} (${m.zone})`}
                      data-section="chart-line-mfi-marker"
                      data-point-index={m.index}
                      data-mfi={m.mfi}
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
                const d = layout.priceDots.find(
                  (x) => x.index === hoverIndex,
                );
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-mfi-tooltip"
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
                    <div data-section="chart-line-mfi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-mfi-tooltip-price"
                      style={{ fontWeight: 600 }}
                    >
                      price: {formatValue(d.price)}
                    </div>
                    <div data-section="chart-line-mfi-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-mfi-tooltip-mfi">
                      mfi: {d.mfi === null ? 'n/a' : formatValue(d.mfi)}
                    </div>
                    <div data-section="chart-line-mfi-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-mfi-legend"
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
                  data-section="chart-line-mfi-legend-item"
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
                    data-section="chart-line-mfi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-mfi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-mfi-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.overboughtCount} overbought, {layout.oversoldCount}{' '}
              oversold
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineMfi.displayName = 'ChartLineMfi';
