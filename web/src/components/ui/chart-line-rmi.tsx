import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_RMI_WIDTH = 560;
export const DEFAULT_CHART_LINE_RMI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_RMI_PADDING = 40;
export const DEFAULT_CHART_LINE_RMI_GAP = 12;
export const DEFAULT_CHART_LINE_RMI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RMI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RMI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RMI_PERIOD = 20;
export const DEFAULT_CHART_LINE_RMI_MOMENTUM_PERIOD = 5;
export const DEFAULT_CHART_LINE_RMI_OVERBOUGHT = 70;
export const DEFAULT_CHART_LINE_RMI_OVERSOLD = 30;
export const DEFAULT_CHART_LINE_RMI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_RMI_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_RMI_RMI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_RMI_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RMI_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RMI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RMI_AXIS_COLOR = '#cbd5e1';

export type ChartLineRmiZone = 'overbought' | 'oversold' | 'neutral' | 'none';

export interface ChartLineRmiPoint {
  x: number;
  value: number;
}

export interface ChartLineRmiSample {
  index: number;
  x: number;
  value: number;
  rmi: number | null;
  zone: ChartLineRmiZone;
}

export interface ChartLineRmiRun {
  series: ChartLineRmiPoint[];
  period: number;
  momentumPeriod: number;
  overbought: number;
  oversold: number;
  rmi: (number | null)[];
  samples: ChartLineRmiSample[];
  rmiFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineRmiPriceDot {
  index: number;
  x: number;
  value: number;
  rmi: number | null;
  zone: ChartLineRmiZone;
  px: number;
  py: number;
}

export interface ChartLineRmiMarker {
  index: number;
  x: number;
  rmi: number;
  zone: ChartLineRmiZone;
  px: number;
  py: number;
}

export interface ChartLineRmiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineRmiLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineRmiPanel;
  rmiPanel: ChartLineRmiPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  rmiYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineRmiPriceDot[];
  rmiPath: string;
  rmiMarkers: ChartLineRmiMarker[];
  overboughtY: number;
  oversoldY: number;
  period: number;
  momentumPeriod: number;
  overbought: number;
  oversold: number;
  rmiFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineRmiLayoutOptions {
  data: readonly ChartLineRmiPoint[];
  period?: number;
  momentumPeriod?: number;
  overbought?: number;
  oversold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineRmiProps {
  data: readonly ChartLineRmiPoint[];
  period?: number;
  momentumPeriod?: number;
  overbought?: number;
  oversold?: number;
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
  rmiColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRmi?: boolean;
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
  onPointClick?: (payload: { point: ChartLineRmiPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineRmiFinitePoints(
  points: readonly ChartLineRmiPoint[] | null | undefined,
): ChartLineRmiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineRmiPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a Relative Momentum Index period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a fractional
 * value floors.
 */
export function normalizeLineRmiPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The momentum change of the close -- each bar measured against
 * the close `momentumPeriod` bars earlier:
 * `change[i] = close[i] - close[i - momentumPeriod]`. Bars before
 * the lookback is available are null.
 */
export function computeLineRmiChange(
  closes: readonly number[] | null | undefined,
  momentumPeriod: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const mp = normalizeLineRmiPeriod(
    momentumPeriod,
    DEFAULT_CHART_LINE_RMI_MOMENTUM_PERIOD,
  );
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = mp; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - mp];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) continue;
    out[i] = cur - prev;
  }
  return out;
}

/**
 * The Relative Momentum Index -- the RSI formula applied across a
 * momentum lookback. Each bar's gain/loss is taken against the
 * close `momentumPeriod` bars earlier (rather than the prior
 * close), and the RMI is the share
 * `100 * avgGain / (avgGain + avgLoss)` over a `period`-bar simple
 * moving average of those gains and losses. A window with no
 * movement reads 50. With `momentumPeriod` 1 the RMI is the
 * ordinary RSI.
 */
export function computeLineRmi(
  closes: readonly number[] | null | undefined,
  period: number,
  momentumPeriod: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineRmiPeriod(period, DEFAULT_CHART_LINE_RMI_PERIOD);
  const mp = normalizeLineRmiPeriod(
    momentumPeriod,
    DEFAULT_CHART_LINE_RMI_MOMENTUM_PERIOD,
  );
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + mp) return out;
  const gains: number[] = new Array(n).fill(0);
  const losses: number[] = new Array(n).fill(0);
  for (let i = mp; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - mp];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) continue;
    const d = cur - prev;
    if (d > 0) gains[i] = d;
    else if (d < 0) losses[i] = -d;
  }
  for (let i = mp + p - 1; i < n; i += 1) {
    let gSum = 0;
    let lSum = 0;
    for (let k = 0; k < p; k += 1) {
      gSum += gains[i - k] ?? 0;
      lSum += losses[i - k] ?? 0;
    }
    const total = gSum + lSum;
    out[i] = total > 0 ? (100 * gSum) / total : 50;
  }
  return out;
}

function classifyZone(
  rmi: number | null,
  overbought: number,
  oversold: number,
): ChartLineRmiZone {
  if (rmi === null) return 'none';
  if (rmi > overbought) return 'overbought';
  if (rmi < oversold) return 'oversold';
  return 'neutral';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLineRmi(
  points: readonly ChartLineRmiPoint[] | null | undefined,
  options?: {
    period?: number;
    momentumPeriod?: number;
    overbought?: number;
    oversold?: number;
  },
): ChartLineRmiRun {
  const finite = getLineRmiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineRmiPeriod(
    options?.period ?? DEFAULT_CHART_LINE_RMI_PERIOD,
    DEFAULT_CHART_LINE_RMI_PERIOD,
  );
  const momentumPeriod = normalizeLineRmiPeriod(
    options?.momentumPeriod ?? DEFAULT_CHART_LINE_RMI_MOMENTUM_PERIOD,
    DEFAULT_CHART_LINE_RMI_MOMENTUM_PERIOD,
  );
  const overbought = isFiniteNumber(options?.overbought)
    ? clamp(options.overbought as number, 0, 100)
    : DEFAULT_CHART_LINE_RMI_OVERBOUGHT;
  const oversold = isFiniteNumber(options?.oversold)
    ? clamp(options.oversold as number, 0, 100)
    : DEFAULT_CHART_LINE_RMI_OVERSOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      momentumPeriod,
      overbought,
      oversold,
      rmi: [],
      samples: [],
      rmiFinal: NaN,
      overboughtCount: 0,
      oversoldCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const rmi = computeLineRmi(closes, period, momentumPeriod);

  const samples: ChartLineRmiSample[] = series.map((p, i) => {
    const r = rmi[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      rmi: r,
      zone: classifyZone(r, overbought, oversold),
    };
  });

  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let rmiFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'overbought') overboughtCount += 1;
    else if (s.zone === 'oversold') oversoldCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.rmi !== null) rmiFinal = s.rmi;
  }

  return {
    series = [],
    period,
    momentumPeriod,
    overbought,
    oversold,
    rmi,
    samples,
    rmiFinal,
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

export function computeLineRmiLayout(
  options: ComputeLineRmiLayoutOptions,
): ChartLineRmiLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_RMI_GAP,
    tickCount = DEFAULT_CHART_LINE_RMI_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_RMI_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineRmi(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.momentumPeriod)
      ? { momentumPeriod: options.momentumPeriod }
      : {}),
    ...(isFiniteNumber(options.overbought)
      ? { overbought: options.overbought }
      : {}),
    ...(isFiniteNumber(options.oversold)
      ? { oversold: options.oversold }
      : {}),
  });

  const emptyPanel: ChartLineRmiPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineRmiLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    rmiPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    rmiYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    rmiPath: '',
    rmiMarkers: [],
    overboughtY: 0,
    oversoldY: 0,
    period: run.period,
    momentumPeriod: run.momentumPeriod,
    overbought: run.overbought,
    oversold: run.oversold,
    rmiFinal: NaN,
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
  const rmiHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineRmiPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const rmiPanel: ChartLineRmiPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: rmiHeight,
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
  const projectRmiY = (v: number): number =>
    rmiPanel.y + rmiPanel.height - (v / 100) * rmiPanel.height;

  const priceDots: ChartLineRmiPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    rmi: s.rmi,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const rmiPts: { px: number; py: number }[] = [];
  const rmiMarkers: ChartLineRmiMarker[] = [];
  for (const s of run.samples) {
    if (s.rmi === null) continue;
    const px = projectX(s.x);
    const py = projectRmiY(s.rmi);
    rmiPts.push({ px, py });
    rmiMarkers.push({
      index: s.index,
      x: s.x,
      rmi: s.rmi,
      zone: s.zone,
      px,
      py,
    });
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    rmiPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    rmiYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectRmiY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    rmiPath: buildPath(rmiPts),
    rmiMarkers,
    overboughtY: projectRmiY(run.overbought),
    oversoldY: projectRmiY(run.oversold),
    period: run.period,
    momentumPeriod: run.momentumPeriod,
    overbought: run.overbought,
    oversold: run.oversold,
    rmiFinal: run.rmiFinal,
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

export function describeLineRmiChart(
  data: readonly ChartLineRmiPoint[] | null | undefined,
  options?: {
    period?: number;
    momentumPeriod?: number;
    overbought?: number;
    oversold?: number;
  },
): string {
  const run = runLineRmi(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Relative Momentum Index (period ${run.period}, momentum ${run.momentumPeriod}): the top panel plots the price; the bottom panel plots the RMI. The RMI applies the RSI formula -- the share of the average gains over the average gains plus losses -- but measures each bar's change against the close ${run.momentumPeriod} bars ago rather than the immediately prior close, so it reflects momentum over a longer lookback. Readings above the overbought level ${run.overbought} signal an extended advance, below the oversold level ${run.oversold} an extended decline. The RMI is overbought on ${run.overboughtCount} bars, oversold on ${run.oversoldCount} and neutral on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const RMI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineRmi = forwardRef<HTMLDivElement, ChartLineRmiProps>(
  function ChartLineRmi(
    props: ChartLineRmiProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      momentumPeriod,
      overbought,
      oversold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_RMI_WIDTH,
      height = DEFAULT_CHART_LINE_RMI_HEIGHT,
      padding = DEFAULT_CHART_LINE_RMI_PADDING,
      gap = DEFAULT_CHART_LINE_RMI_GAP,
      tickCount = DEFAULT_CHART_LINE_RMI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_RMI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_RMI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_RMI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_RMI_PRICE_COLOR,
      rmiColor = DEFAULT_CHART_LINE_RMI_RMI_COLOR,
      overboughtColor = DEFAULT_CHART_LINE_RMI_OVERBOUGHT_COLOR,
      oversoldColor = DEFAULT_CHART_LINE_RMI_OVERSOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_RMI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_RMI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showRmi = true,
      showLevels = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Relative Momentum Index',
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
        computeLineRmiLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(momentumPeriod) ? { momentumPeriod } : {}),
          ...(isFiniteNumber(overbought) ? { overbought } : {}),
          ...(isFiniteNumber(oversold) ? { oversold } : {}),
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
        momentumPeriod,
        overbought,
        oversold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineRmiChart(data, {
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(momentumPeriod) ? { momentumPeriod } : {}),
          ...(isFiniteNumber(overbought) ? { overbought } : {}),
          ...(isFiniteNumber(oversold) ? { oversold } : {}),
        }),
      [ariaDescription, data, period, momentumPeriod, overbought, oversold],
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
          data-section="chart-line-rmi"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-rmi-aria-desc"
            style={RMI_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const rp = layout.rmiPanel;
    const priceVisible = !hiddenSet.has('price');
    const rmiVisible = showRmi && !hiddenSet.has('rmi');
    const levelsVisible = showLevels && !hiddenSet.has('levels');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineRmiZone): string => {
      if (zone === 'overbought') return overboughtColor;
      if (zone === 'oversold') return oversoldColor;
      return rmiColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'rmi', label: 'RMI', color: rmiColor },
      { id: 'levels', label: 'Levels', color: overboughtColor },
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
        data-section="chart-line-rmi"
        data-empty="false"
        data-period={layout.period}
        data-momentum-period={layout.momentumPeriod}
        data-rmi-final={layout.rmiFinal}
        data-overbought-count={layout.overboughtCount}
        data-oversold-count={layout.oversoldCount}
        data-neutral-count={layout.neutralCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-rmi-aria-desc"
          style={RMI_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-rmi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-rmi-badge"
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
                data-section="chart-line-rmi-badge-icon"
                aria-hidden="true"
                style={{ color: rmiColor }}
              >
                RMI
              </span>
              <span data-section="chart-line-rmi-badge-config">
                {layout.period}/{layout.momentumPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-rmi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-rmi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-rmi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.rmiYTicks.map((t, i) => (
                  <line
                    key={`gr-${i}`}
                    data-section="chart-line-rmi-grid-line"
                    data-panel="rmi"
                    x1={rp.x}
                    x2={rp.x + rp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-rmi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-rmi-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-rmi-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-rmi-axis"
                  data-panel="rmi"
                  data-axis="y"
                  x1={rp.x}
                  y1={rp.y}
                  x2={rp.x}
                  y2={rp.y + rp.height}
                />
                <line
                  data-section="chart-line-rmi-axis"
                  data-panel="rmi"
                  data-axis="x"
                  x1={rp.x}
                  y1={rp.y + rp.height}
                  x2={rp.x + rp.width}
                  y2={rp.y + rp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-rmi-tick-label"
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
                {layout.rmiYTicks.map((t, i) => (
                  <text
                    key={`ryt-${i}`}
                    data-section="chart-line-rmi-tick-label"
                    data-panel="rmi"
                    data-axis="y"
                    x={rp.x - 6}
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
                    data-section="chart-line-rmi-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={rp.y + rp.height + 14}
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
              data-section="chart-line-rmi-panel-label"
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
              data-section="chart-line-rmi-panel-label"
              data-panel="rmi"
              x={rp.x + 2}
              y={rp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              RMI
            </text>

            {levelsVisible ? (
              <g data-section="chart-line-rmi-levels">
                <line
                  data-section="chart-line-rmi-level-line"
                  data-level="overbought"
                  x1={rp.x}
                  x2={rp.x + rp.width}
                  y1={layout.overboughtY}
                  y2={layout.overboughtY}
                  stroke={overboughtColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-rmi-level-line"
                  data-level="oversold"
                  x1={rp.x}
                  x2={rp.x + rp.width}
                  y1={layout.oversoldY}
                  y2={layout.oversoldY}
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
                data-section="chart-line-rmi-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-rmi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-rmi-dot"
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

            {rmiVisible && layout.rmiPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="RMI line"
                data-section="chart-line-rmi-rmi-line"
                d={layout.rmiPath}
                fill="none"
                stroke={rmiColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {rmiVisible ? (
              <g data-section="chart-line-rmi-markers">
                {layout.rmiMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`RMI at x ${formatX(m.x)}: ${formatValue(m.rmi)}, ${m.zone}`}
                      data-section="chart-line-rmi-marker"
                      data-point-index={m.index}
                      data-rmi={m.rmi}
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
                    data-section="chart-line-rmi-tooltip"
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
                      minWidth: 140,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-rmi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-rmi-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-rmi-tooltip-rmi">
                      rmi: {fmtNullable(d.rmi)}
                    </div>
                    <div data-section="chart-line-rmi-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-rmi-legend"
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
                  data-section="chart-line-rmi-legend-item"
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
                    data-section="chart-line-rmi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-rmi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-rmi-legend-stats"
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

ChartLineRmi.displayName = 'ChartLineRmi';
