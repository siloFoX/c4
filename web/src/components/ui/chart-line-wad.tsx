import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_WAD_WIDTH = 560;
export const DEFAULT_CHART_LINE_WAD_HEIGHT = 360;
export const DEFAULT_CHART_LINE_WAD_PADDING = 40;
export const DEFAULT_CHART_LINE_WAD_GAP = 12;
export const DEFAULT_CHART_LINE_WAD_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WAD_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WAD_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WAD_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_WAD_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_WAD_WAD_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_WAD_ACCUMULATION_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WAD_DISTRIBUTION_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WAD_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WAD_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_WAD_AXIS_COLOR = '#cbd5e1';

export type ChartLineWadZone =
  | 'accumulation'
  | 'distribution'
  | 'flat'
  | 'none';

export interface ChartLineWadPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineWadSample {
  index: number;
  x: number;
  close: number;
  trueRangeHigh: number | null;
  trueRangeLow: number | null;
  delta: number | null;
  wad: number;
  zone: ChartLineWadZone;
}

export interface ChartLineWadRun {
  series: ChartLineWadPoint[];
  trueRangeHigh: (number | null)[];
  trueRangeLow: (number | null)[];
  delta: (number | null)[];
  wad: (number | null)[];
  samples: ChartLineWadSample[];
  wadFinal: number;
  accumulationCount: number;
  distributionCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineWadPriceDot {
  index: number;
  x: number;
  close: number;
  delta: number | null;
  wad: number;
  zone: ChartLineWadZone;
  px: number;
  py: number;
}

export interface ChartLineWadMarker {
  index: number;
  x: number;
  wad: number;
  zone: ChartLineWadZone;
  px: number;
  py: number;
}

export interface ChartLineWadPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineWadLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineWadPanel;
  wadPanel: ChartLineWadPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  wadYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  wadYMin: number;
  wadYMax: number;
  pricePath: string;
  priceDots: ChartLineWadPriceDot[];
  wadPath: string;
  markers: ChartLineWadMarker[];
  zeroY: number;
  wadFinal: number;
  accumulationCount: number;
  distributionCount: number;
  flatCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineWadLayoutOptions {
  data: readonly ChartLineWadPoint[];
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineWadProps {
  data: readonly ChartLineWadPoint[];
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
  wadColor?: string;
  accumulationColor?: string;
  distributionColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showZeroLine?: boolean;
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
  onPointClick?: (payload: { point: ChartLineWadPriceDot }) => void;
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

export function getLineWadFinitePoints(
  points: readonly ChartLineWadPoint[] | null | undefined,
): ChartLineWadPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineWadPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * The Williams "true range high" of each bar -- the higher of the
 * bar's high and the prior close. The opening bar has no prior
 * close and is null.
 */
export function computeLineWadTrueRangeHigh(
  bars: readonly ChartLineWadPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (!cur || !prev) continue;
    if (!isFiniteNumber(cur.high) || !isFiniteNumber(prev.close)) continue;
    out[i] = Math.max(cur.high, prev.close);
  }
  return out;
}

/**
 * The Williams "true range low" of each bar -- the lower of the
 * bar's low and the prior close. The opening bar has no prior
 * close and is null.
 */
export function computeLineWadTrueRangeLow(
  bars: readonly ChartLineWadPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (!cur || !prev) continue;
    if (!isFiniteNumber(cur.low) || !isFiniteNumber(prev.close)) continue;
    out[i] = Math.min(cur.low, prev.close);
  }
  return out;
}

/**
 * The per-bar Williams accumulation/distribution amount. When the
 * close finishes above the prior close the gain is measured from
 * the true range low; when it finishes below, the loss is measured
 * from the true range high; an unchanged close contributes zero.
 * The opening bar has no prior close and is null.
 */
export function computeLineWadDelta(
  bars: readonly ChartLineWadPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (!cur || !prev) continue;
    const close = cur.close;
    const high = cur.high;
    const low = cur.low;
    const prevClose = prev.close;
    if (
      !isFiniteNumber(close) ||
      !isFiniteNumber(high) ||
      !isFiniteNumber(low) ||
      !isFiniteNumber(prevClose)
    ) {
      continue;
    }
    if (close > prevClose) {
      out[i] = close - Math.min(low, prevClose);
    } else if (close < prevClose) {
      out[i] = close - Math.max(high, prevClose);
    } else {
      out[i] = 0;
    }
  }
  return out;
}

/**
 * The Williams Accumulation/Distribution line -- the running
 * cumulative sum of the per-bar accumulation/distribution amount.
 * The line starts at zero on the opening bar.
 */
export function computeLineWad(
  bars: readonly ChartLineWadPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n === 0) return out;
  const delta = computeLineWadDelta(bars);
  let cumulative = 0;
  out[0] = 0;
  for (let i = 1; i < n; i += 1) {
    const d = delta[i];
    cumulative += isFiniteNumber(d) ? d : 0;
    out[i] = cumulative;
  }
  return out;
}

function classifyZone(delta: number | null): ChartLineWadZone {
  if (delta === null) return 'none';
  if (delta > 0) return 'accumulation';
  if (delta < 0) return 'distribution';
  return 'flat';
}

export function runLineWad(
  points: readonly ChartLineWadPoint[] | null | undefined,
): ChartLineWadRun {
  const finite = getLineWadFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      trueRangeHigh: [],
      trueRangeLow: [],
      delta: [],
      wad: [],
      samples: [],
      wadFinal: NaN,
      accumulationCount: 0,
      distributionCount: 0,
      flatCount: 0,
      ok: false,
    };
  }

  const trueRangeHigh = computeLineWadTrueRangeHigh(series);
  const trueRangeLow = computeLineWadTrueRangeLow(series);
  const delta = computeLineWadDelta(series);
  const wad = computeLineWad(series);

  const samples: ChartLineWadSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    close: p.close,
    trueRangeHigh: trueRangeHigh[i] ?? null,
    trueRangeLow: trueRangeLow[i] ?? null,
    delta: delta[i] ?? null,
    wad: wad[i] ?? 0,
    zone: classifyZone(delta[i] ?? null),
  }));

  let accumulationCount = 0;
  let distributionCount = 0;
  let flatCount = 0;
  for (const s of samples) {
    if (s.zone === 'accumulation') accumulationCount += 1;
    else if (s.zone === 'distribution') distributionCount += 1;
    else if (s.zone === 'flat') flatCount += 1;
  }
  const last = samples[samples.length - 1];

  return {
    series = [],
    trueRangeHigh,
    trueRangeLow,
    delta,
    wad,
    samples,
    wadFinal: last ? last.wad : NaN,
    accumulationCount,
    distributionCount,
    flatCount,
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

export function computeLineWadLayout(
  options: ComputeLineWadLayoutOptions,
): ChartLineWadLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_WAD_GAP,
    tickCount = DEFAULT_CHART_LINE_WAD_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_WAD_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineWad(data);

  const emptyPanel: ChartLineWadPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineWadLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    wadPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    wadYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    wadYMin: 0,
    wadYMax: 0,
    pricePath: '',
    priceDots: [],
    wadPath: '',
    markers: [],
    zeroY: 0,
    wadFinal: NaN,
    accumulationCount: 0,
    distributionCount: 0,
    flatCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const wadHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineWadPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const wadPanel: ChartLineWadPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: wadHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let wadLo = 0;
  let wadHi = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < priceLo) priceLo = s.close;
    if (s.close > priceHi) priceHi = s.close;
    if (s.wad < wadLo) wadLo = s.wad;
    if (s.wad > wadHi) wadHi = s.wad;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  if (wadLo === wadHi) {
    wadLo -= 1;
    wadHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const wadRange = wadHi - wadLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectWadY = (v: number): number =>
    wadPanel.y + wadPanel.height - ((v - wadLo) / wadRange) * wadPanel.height;

  const priceDots: ChartLineWadPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    delta: s.delta,
    wad: s.wad,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const wadPts: { px: number; py: number }[] = [];
  const markers: ChartLineWadMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    const py = projectWadY(s.wad);
    wadPts.push({ px, py });
    if (s.zone !== 'none') {
      markers.push({ index: s.index, x: s.x, wad: s.wad, zone: s.zone, px, py });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    wadPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    wadYTicks: computeTicks(wadLo, wadHi, tickCount).map((v) => ({
      value: v,
      py: projectWadY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    wadYMin: wadLo,
    wadYMax: wadHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    wadPath: buildPath(wadPts),
    markers,
    zeroY: projectWadY(0),
    wadFinal: run.wadFinal,
    accumulationCount: run.accumulationCount,
    distributionCount: run.distributionCount,
    flatCount: run.flatCount,
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

export function describeLineWadChart(
  data: readonly ChartLineWadPoint[] | null | undefined,
): string {
  const run = runLineWad(data);
  if (!run.ok) return 'No data';
  return `Two-panel chart with the Williams Accumulation/Distribution: the top panel plots the close; the bottom panel plots the cumulative Williams AD line. Each bar adds an accumulation or distribution amount measured from the true range -- when the close finishes higher the gain is measured down to the true range low, the lower of this bar's low and the prior close; when it finishes lower the loss is measured up to the true range high, the higher of this bar's high and the prior close; an unchanged close adds nothing. The running total accumulates on ${run.accumulationCount} bars, distributes on ${run.distributionCount} and is flat on ${run.flatCount} across ${run.samples.length} bars.`;
}

const WAD_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineWad = forwardRef<HTMLDivElement, ChartLineWadProps>(
  function ChartLineWad(
    props: ChartLineWadProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_WAD_WIDTH,
      height = DEFAULT_CHART_LINE_WAD_HEIGHT,
      padding = DEFAULT_CHART_LINE_WAD_PADDING,
      gap = DEFAULT_CHART_LINE_WAD_GAP,
      tickCount = DEFAULT_CHART_LINE_WAD_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_WAD_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_WAD_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_WAD_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_WAD_PRICE_COLOR,
      wadColor = DEFAULT_CHART_LINE_WAD_WAD_COLOR,
      accumulationColor = DEFAULT_CHART_LINE_WAD_ACCUMULATION_COLOR,
      distributionColor = DEFAULT_CHART_LINE_WAD_DISTRIBUTION_COLOR,
      zeroColor = DEFAULT_CHART_LINE_WAD_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_WAD_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_WAD_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showZeroLine = true,
      showMarkers = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with the Williams Accumulation/Distribution',
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
        computeLineWadLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
        }),
      [data, width, height, padding, gap, tickCount, pricePanelRatio],
    );

    const summary = useMemo(
      () => ariaDescription ?? describeLineWadChart(data),
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
          data-section="chart-line-wad"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-wad-aria-desc"
            style={WAD_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const wp = layout.wadPanel;
    const priceVisible = !hiddenSet.has('price');
    const wadVisible = !hiddenSet.has('wad');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineWadZone): string => {
      if (zone === 'accumulation') return accumulationColor;
      if (zone === 'distribution') return distributionColor;
      return wadColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'wad', label: 'Williams AD', color: wadColor },
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
        data-section="chart-line-wad"
        data-empty="false"
        data-wad-final={layout.wadFinal}
        data-accumulation-count={layout.accumulationCount}
        data-distribution-count={layout.distributionCount}
        data-flat-count={layout.flatCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-wad-aria-desc"
          style={WAD_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-wad-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-wad-badge"
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
                data-section="chart-line-wad-badge-icon"
                aria-hidden="true"
                style={{ color: wadColor }}
              >
                WAD
              </span>
              <span data-section="chart-line-wad-badge-config">
                {layout.totalPoints} bars
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-wad-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-wad-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-wad-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.wadYTicks.map((t, i) => (
                  <line
                    key={`gw-${i}`}
                    data-section="chart-line-wad-grid-line"
                    data-panel="wad"
                    x1={wp.x}
                    x2={wp.x + wp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-wad-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-wad-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-wad-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-wad-axis"
                  data-panel="wad"
                  data-axis="y"
                  x1={wp.x}
                  y1={wp.y}
                  x2={wp.x}
                  y2={wp.y + wp.height}
                />
                <line
                  data-section="chart-line-wad-axis"
                  data-panel="wad"
                  data-axis="x"
                  x1={wp.x}
                  y1={wp.y + wp.height}
                  x2={wp.x + wp.width}
                  y2={wp.y + wp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-wad-tick-label"
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
                {layout.wadYTicks.map((t, i) => (
                  <text
                    key={`wyt-${i}`}
                    data-section="chart-line-wad-tick-label"
                    data-panel="wad"
                    data-axis="y"
                    x={wp.x - 6}
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
                    data-section="chart-line-wad-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={wp.y + wp.height + 14}
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
              data-section="chart-line-wad-panel-label"
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
              data-section="chart-line-wad-panel-label"
              data-panel="wad"
              x={wp.x + 2}
              y={wp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Williams AD
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-wad-zero-line"
                x1={wp.x}
                x2={wp.x + wp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-wad-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-wad-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-wad-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-close={d.close}
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

            {wadVisible && layout.wadPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Williams Accumulation/Distribution line"
                data-section="chart-line-wad-wad-line"
                d={layout.wadPath}
                fill="none"
                stroke={wadColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {wadVisible && showMarkers ? (
              <g data-section="chart-line-wad-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${m.index + 1} at x ${formatX(m.x)}: Williams AD ${formatValue(m.wad)}, ${m.zone}`}
                      data-section="chart-line-wad-marker"
                      data-point-index={m.index}
                      data-wad={m.wad}
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
                    data-section="chart-line-wad-tooltip"
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
                    <div data-section="chart-line-wad-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-wad-tooltip-close"
                      style={{ fontWeight: 600 }}
                    >
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-wad-tooltip-delta">
                      delta: {fmtNullable(d.delta)}
                    </div>
                    <div data-section="chart-line-wad-tooltip-wad">
                      williams ad: {formatValue(d.wad)}
                    </div>
                    <div data-section="chart-line-wad-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-wad-legend"
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
                  data-section="chart-line-wad-legend-item"
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
                    data-section="chart-line-wad-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-wad-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-wad-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.accumulationCount} acc, {layout.distributionCount} dist,{' '}
              {layout.flatCount} flat
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineWad.displayName = 'ChartLineWad';
