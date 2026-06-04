import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CCI_WIDTH = 560;
export const DEFAULT_CHART_LINE_CCI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_CCI_PADDING = 40;
export const DEFAULT_CHART_LINE_CCI_GAP = 26;
export const DEFAULT_CHART_LINE_CCI_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_CCI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CCI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CCI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CCI_PERIOD = 20;
export const DEFAULT_CHART_LINE_CCI_CONSTANT = 0.015;
export const DEFAULT_CHART_LINE_CCI_OVERBOUGHT = 100;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD = -100;
export const DEFAULT_CHART_LINE_CCI_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_CCI_CCI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CCI_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CCI_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_CCI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CCI_AXIS_COLOR = '#cbd5e1';

export type ChartLineCciZone = 'overbought' | 'oversold' | 'neutral';

export interface ChartLineCciPoint {
  x: number;
  value: number;
}

export interface ChartLineCciSample {
  index: number;
  x: number;
  value: number;
  cci: number | null;
  zone: ChartLineCciZone;
}

export interface ChartLineCciRun {
  series: ChartLineCciPoint[];
  period: number;
  overbought: number;
  oversold: number;
  cci: (number | null)[];
  samples: ChartLineCciSample[];
  cciFinal: number;
  cciMin: number;
  cciMax: number;
  overboughtCount: number;
  oversoldCount: number;
  ok: boolean;
}

export interface ChartLineCciPriceDot {
  index: number;
  x: number;
  value: number;
  cci: number | null;
  zone: ChartLineCciZone;
  px: number;
  py: number;
}

export interface ChartLineCciMarker {
  index: number;
  x: number;
  cci: number;
  zone: ChartLineCciZone;
  px: number;
  py: number;
}

export interface ChartLineCciPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineCciLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineCciPanel;
  cciPanel: ChartLineCciPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  cciYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  cciYBound: number;
  pricePath: string;
  priceDots: ChartLineCciPriceDot[];
  cciPath: string;
  markers: ChartLineCciMarker[];
  zeroY: number;
  overbought: number;
  oversold: number;
  overboughtY: number;
  oversoldY: number;
  overboughtZone: ChartLineCciPanel;
  oversoldZone: ChartLineCciPanel;
  period: number;
  cciFinal: number;
  cciMin: number;
  cciMax: number;
  overboughtCount: number;
  oversoldCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineCciLayoutOptions {
  data: readonly ChartLineCciPoint[];
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

export interface ChartLineCciProps {
  data: readonly ChartLineCciPoint[];
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
  cciColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCci?: boolean;
  showZones?: boolean;
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
  onPointClick?: (payload: { point: ChartLineCciPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineCciFinitePoints(
  points: readonly ChartLineCciPoint[] | null | undefined,
): ChartLineCciPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineCciPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineCciPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Donald Lambert's Commodity Channel Index. For each index from
 * `period - 1` onward the window of `period` values is reduced to
 * `CCI = (value - SMA) / (0.015 * meanDeviation)`, where SMA is the
 * window mean and meanDeviation is the mean of the absolute
 * deviations from that mean. The 0.015 constant scales the result so
 * most readings fall within +/-100. A flat window (zero deviation)
 * reads 0. Indices before the window fills read null.
 */
export function computeLineCci(
  values: readonly number[] | null | undefined,
  period: number,
  constant: number = DEFAULT_CHART_LINE_CCI_CONSTANT,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const k = isFiniteNumber(constant) && constant > 0 ? constant : DEFAULT_CHART_LINE_CCI_CONSTANT;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    for (let j = i - p + 1; j <= i; j += 1) sum += values[j]!;
    const sma = sum / p;
    let devSum = 0;
    for (let j = i - p + 1; j <= i; j += 1) {
      devSum += Math.abs(values[j]! - sma);
    }
    const meanDev = devSum / p;
    out[i] = meanDev === 0 ? 0 : (values[i]! - sma) / (k * meanDev);
  }
  return out;
}

function classifyZone(
  cci: number | null,
  overbought: number,
  oversold: number,
): ChartLineCciZone {
  if (cci === null) return 'neutral';
  if (cci > overbought) return 'overbought';
  if (cci < oversold) return 'oversold';
  return 'neutral';
}

export function runLineCci(
  points: readonly ChartLineCciPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): ChartLineCciRun {
  const finite = getLineCciFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineCciPeriod(
    options?.period ?? DEFAULT_CHART_LINE_CCI_PERIOD,
    DEFAULT_CHART_LINE_CCI_PERIOD,
  );
  const overbought = isFiniteNumber(options?.overbought)
    ? options.overbought
    : DEFAULT_CHART_LINE_CCI_OVERBOUGHT;
  const oversold = isFiniteNumber(options?.oversold)
    ? options.oversold
    : DEFAULT_CHART_LINE_CCI_OVERSOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      overbought,
      oversold,
      cci: [],
      samples: [],
      cciFinal: NaN,
      cciMin: NaN,
      cciMax: NaN,
      overboughtCount: 0,
      oversoldCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const cci = computeLineCci(values, period);
  const samples: ChartLineCciSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    cci: cci[i] ?? null,
    zone: classifyZone(cci[i] ?? null, overbought, oversold),
  }));

  let cciFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (cci[i] !== null) {
      cciFinal = cci[i] as number;
      break;
    }
  }
  let cciMin = NaN;
  let cciMax = NaN;
  let overboughtCount = 0;
  let oversoldCount = 0;
  for (const s of samples) {
    if (s.cci !== null) {
      if (Number.isNaN(cciMin) || s.cci < cciMin) cciMin = s.cci;
      if (Number.isNaN(cciMax) || s.cci > cciMax) cciMax = s.cci;
    }
    if (s.zone === 'overbought') overboughtCount += 1;
    if (s.zone === 'oversold') oversoldCount += 1;
  }

  return {
    series,
    period,
    overbought,
    oversold,
    cci,
    samples,
    cciFinal,
    cciMin,
    cciMax,
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

export function computeLineCciLayout(
  options: ComputeLineCciLayoutOptions,
): ChartLineCciLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_CCI_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_CCI_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_CCI_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineCciPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineCci(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.overbought)
      ? { overbought: options.overbought }
      : {}),
    ...(isFiniteNumber(options.oversold)
      ? { oversold: options.oversold }
      : {}),
  });
  const empty: ChartLineCciLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    cciPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    cciYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    cciYBound: 0,
    pricePath: '',
    priceDots: [],
    cciPath: '',
    markers: [],
    zeroY: 0,
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtY: 0,
    oversoldY: 0,
    overboughtZone: emptyPanel,
    oversoldZone: emptyPanel,
    period: run.period,
    cciFinal: NaN,
    cciMin: NaN,
    cciMax: NaN,
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
  const cciH = usableHeight - priceH;
  if (priceH <= 0 || cciH <= 0) return empty;

  const pricePanel: ChartLineCciPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const cciPanel: ChartLineCciPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: cciH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = Math.max(Math.abs(run.overbought), Math.abs(run.oversold));
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
    if (s.cci !== null && Math.abs(s.cci) > bound) bound = Math.abs(s.cci);
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  if (bound <= 0) bound = 100;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectCciY = (v: number): number =>
    cciPanel.y + cciPanel.height - ((v + bound) / (2 * bound)) * cciPanel.height;

  const priceDots: ChartLineCciPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    cci: s.cci,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineCciMarker[] = [];
  const cciPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.cci !== null) {
      const px = projectX(s.x);
      const py = projectCciY(s.cci);
      cciPts.push({ px, py });
      markers.push({ index: s.index, x: s.x, cci: s.cci, zone: s.zone, px, py });
    }
  }

  const overboughtY = projectCciY(run.overbought);
  const oversoldY = projectCciY(run.oversold);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    cciPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    cciYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectCciY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    cciYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    cciPath: buildPath(cciPts),
    markers,
    zeroY: projectCciY(0),
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtY,
    oversoldY,
    overboughtZone: {
      x: cciPanel.x,
      y: cciPanel.y,
      width: cciPanel.width,
      height: Math.max(0, overboughtY - cciPanel.y),
    },
    oversoldZone: {
      x: cciPanel.x,
      y: oversoldY,
      width: cciPanel.width,
      height: Math.max(0, cciPanel.y + cciPanel.height - oversoldY),
    },
    period: run.period,
    cciFinal: run.cciFinal,
    cciMin: run.cciMin,
    cciMax: run.cciMax,
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

export function describeLineCciChart(
  data: readonly ChartLineCciPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): string {
  const run = runLineCci(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Commodity Channel Index oscillator panel (period ${run.period}): CCI measures how far the value sits from its moving average, scaled by mean absolute deviation; readings above +100 are overbought and below -100 oversold. ${run.overboughtCount} overbought and ${run.oversoldCount} oversold across ${run.samples.length} periods.`;
}

const CCI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineCci = forwardRef<HTMLDivElement, ChartLineCciProps>(
  function ChartLineCci(
    props: ChartLineCciProps,
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
      width = DEFAULT_CHART_LINE_CCI_WIDTH,
      height = DEFAULT_CHART_LINE_CCI_HEIGHT,
      padding = DEFAULT_CHART_LINE_CCI_PADDING,
      gap = DEFAULT_CHART_LINE_CCI_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_CCI_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_CCI_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_CCI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_CCI_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_CCI_VALUE_COLOR,
      cciColor = DEFAULT_CHART_LINE_CCI_CCI_COLOR,
      overboughtColor = DEFAULT_CHART_LINE_CCI_OVERBOUGHT_COLOR,
      oversoldColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_COLOR,
      zeroColor = DEFAULT_CHART_LINE_CCI_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_CCI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_CCI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showCci = true,
      showZones = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Commodity Channel Index oscillator panel',
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
        computeLineCciLayout({
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
        describeLineCciChart(data, {
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
      (z: ChartLineCciZone): string =>
        z === 'overbought'
          ? overboughtColor
          : z === 'oversold'
            ? oversoldColor
            : cciColor,
      [overboughtColor, oversoldColor, cciColor],
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
          data-section="chart-line-cci"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-cci-aria-desc" style={CCI_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const cp = layout.cciPanel;
    const valueVisible = !hiddenSet.has('value');
    const cciVisible = showCci && !hiddenSet.has('cci');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Value', color: valueColor },
      { id: 'cci', label: 'CCI', color: cciColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-cci"
        data-empty="false"
        data-period={layout.period}
        data-cci-final={layout.cciFinal}
        data-overbought-count={layout.overboughtCount}
        data-oversold-count={layout.oversoldCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-cci-aria-desc" style={CCI_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-cci-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-cci-badge"
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
                data-section="chart-line-cci-badge-icon"
                aria-hidden="true"
                style={{ color: cciColor }}
              >
                CCI
              </span>
              <span data-section="chart-line-cci-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-cci-badge-extremes">
                ext={layout.overboughtCount + layout.oversoldCount}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-cci-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showZones ? (
              <g data-section="chart-line-cci-zones">
                <rect
                  data-section="chart-line-cci-zone"
                  data-zone="overbought"
                  x={layout.overboughtZone.x}
                  y={layout.overboughtZone.y}
                  width={layout.overboughtZone.width}
                  height={layout.overboughtZone.height}
                  fill={overboughtColor}
                  fillOpacity={0.12}
                />
                <rect
                  data-section="chart-line-cci-zone"
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
                data-section="chart-line-cci-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-cci-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.cciYTicks.map((t, i) => (
                  <line
                    key={`cgy-${i}`}
                    data-section="chart-line-cci-grid-line"
                    data-panel="cci"
                    x1={cp.x}
                    x2={cp.x + cp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZones ? (
              <g data-section="chart-line-cci-levels">
                {[
                  { name: 'overbought', y: layout.overboughtY, level: layout.overbought },
                  { name: 'oversold', y: layout.oversoldY, level: layout.oversold },
                ].map((lv) => (
                  <g
                    key={`lv-${lv.name}`}
                    data-section="chart-line-cci-level"
                    data-level={lv.name}
                  >
                    <line
                      data-section="chart-line-cci-level-line"
                      data-level={lv.name}
                      x1={cp.x}
                      x2={cp.x + cp.width}
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
                      data-section="chart-line-cci-level-label"
                      data-level={lv.name}
                      x={cp.x + cp.width - 2}
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

            {showZeroLine ? (
              <line
                data-section="chart-line-cci-zero-line"
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
                data-section="chart-line-cci-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: cp, name: 'cci', yt: layout.cciYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-cci-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-cci-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-cci-axis"
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
                        data-section="chart-line-cci-tick"
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
                          data-section="chart-line-cci-tick-label"
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
                <g data-section="chart-line-cci-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-cci-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={cp.y + cp.height}
                        y2={cp.y + cp.height + 4}
                      />
                      <text
                        data-section="chart-line-cci-tick-label"
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

            <g data-section="chart-line-cci-panel-labels">
              <text
                data-section="chart-line-cci-panel-label"
                data-panel="price"
                x={pp.x + pp.width / 2}
                y={pp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Value
              </text>
              <text
                data-section="chart-line-cci-panel-label"
                data-panel="cci"
                x={cp.x + cp.width / 2}
                y={cp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                CCI
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Value line"
                data-section="chart-line-cci-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-cci-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-cci-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
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

            {cciVisible && layout.cciPath ? (
              <path
                data-section="chart-line-cci-cci-line"
                d={layout.cciPath}
                fill="none"
                stroke={cciColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {cciVisible ? (
              <g data-section="chart-line-cci-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`CCI at x ${formatX(m.x)}: ${formatValue(m.cci)} (${m.zone})`}
                      data-section="chart-line-cci-marker"
                      data-point-index={m.index}
                      data-cci={m.cci}
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
                    data-section="chart-line-cci-tooltip"
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
                    <div data-section="chart-line-cci-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-cci-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-cci-tooltip-cci">
                      cci: {d.cci === null ? 'n/a' : formatValue(d.cci)}
                    </div>
                    <div data-section="chart-line-cci-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-cci-legend"
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
                  data-section="chart-line-cci-legend-item"
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
                    data-section="chart-line-cci-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-cci-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-cci-legend-stats"
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

ChartLineCci.displayName = 'ChartLineCci';
