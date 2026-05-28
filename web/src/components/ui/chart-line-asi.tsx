import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ASI_WIDTH = 560;
export const DEFAULT_CHART_LINE_ASI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_ASI_PADDING = 40;
export const DEFAULT_CHART_LINE_ASI_GAP = 12;
export const DEFAULT_CHART_LINE_ASI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ASI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ASI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ASI_LIMIT_MOVE = 3;
export const DEFAULT_CHART_LINE_ASI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ASI_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ASI_ASI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ASI_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ASI_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ASI_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ASI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ASI_AXIS_COLOR = '#cbd5e1';

export type ChartLineAsiZone = 'up' | 'down' | 'flat' | 'none';

export interface ChartLineAsiPoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineAsiSample {
  index: number;
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  swingIndex: number | null;
  asi: number;
  zone: ChartLineAsiZone;
}

export interface ChartLineAsiRun {
  series: ChartLineAsiPoint[];
  limitMove: number;
  swingIndex: (number | null)[];
  asi: (number | null)[];
  samples: ChartLineAsiSample[];
  asiFinal: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineAsiPriceDot {
  index: number;
  x: number;
  close: number;
  swingIndex: number | null;
  asi: number;
  zone: ChartLineAsiZone;
  px: number;
  py: number;
}

export interface ChartLineAsiMarker {
  index: number;
  x: number;
  asi: number;
  zone: ChartLineAsiZone;
  px: number;
  py: number;
}

export interface ChartLineAsiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineAsiLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineAsiPanel;
  asiPanel: ChartLineAsiPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  asiYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  asiYMin: number;
  asiYMax: number;
  pricePath: string;
  priceDots: ChartLineAsiPriceDot[];
  asiPath: string;
  markers: ChartLineAsiMarker[];
  zeroY: number;
  limitMove: number;
  asiFinal: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineAsiLayoutOptions {
  data: readonly ChartLineAsiPoint[];
  limitMove?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineAsiProps {
  data: readonly ChartLineAsiPoint[];
  limitMove?: number;
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
  asiColor?: string;
  upColor?: string;
  downColor?: string;
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
  onPointClick?: (payload: { point: ChartLineAsiPriceDot }) => void;
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

export function getLineAsiFinitePoints(
  points: readonly ChartLineAsiPoint[] | null | undefined,
): ChartLineAsiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineAsiPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.open) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce a Swing Index limit-move value to a positive finite
 * number. A non-finite or non-positive value falls back to
 * `fallback`.
 */
export function normalizeLineAsiLimitMove(
  limitMove: number,
  fallback: number,
): number {
  if (!isFiniteNumber(limitMove) || limitMove <= 0) return fallback;
  return limitMove;
}

/**
 * Welles Wilder's Swing Index for each bar -- a score of the
 * bar-to-bar price swing. With the current bar (O, H, L, C) and
 * the prior bar (Op, Cp):
 *
 *   K = max(|H - Cp|, |L - Cp|)
 *   R is picked from |H - Cp|, |L - Cp| and |H - L| by which is
 *     largest, each branch adding 0.25 * |Cp - Op|
 *   N = (C - Cp) + 0.5 * (C - O) + 0.25 * (Cp - Op)
 *   SI = 50 * (N / R) * (K / limitMove)   (0 when R is 0)
 *
 * The opening bar has no prior bar and is null.
 */
export function computeLineAsiSwingIndex(
  bars: readonly ChartLineAsiPoint[] | null | undefined,
  limitMove: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const t = normalizeLineAsiLimitMove(
    limitMove,
    DEFAULT_CHART_LINE_ASI_LIMIT_MOVE,
  );
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (!cur || !prev) continue;
    const o = cur.open;
    const h = cur.high;
    const l = cur.low;
    const c = cur.close;
    const op = prev.open;
    const cp = prev.close;
    if (
      !isFiniteNumber(o) ||
      !isFiniteNumber(h) ||
      !isFiniteNumber(l) ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(op) ||
      !isFiniteNumber(cp)
    ) {
      continue;
    }
    const aVal = Math.abs(h - cp);
    const bVal = Math.abs(l - cp);
    const cVal = Math.abs(h - l);
    const moveCp = Math.abs(cp - op);
    let r: number;
    if (aVal >= bVal && aVal >= cVal) {
      r = aVal - 0.5 * bVal + 0.25 * moveCp;
    } else if (bVal >= aVal && bVal >= cVal) {
      r = bVal - 0.5 * aVal + 0.25 * moveCp;
    } else {
      r = cVal + 0.25 * moveCp;
    }
    if (r === 0) {
      out[i] = 0;
      continue;
    }
    const k = Math.max(aVal, bVal);
    const numerator = c - cp + 0.5 * (c - o) + 0.25 * (cp - op);
    out[i] = 50 * (numerator / r) * (k / t);
  }
  return out;
}

/**
 * The Accumulative Swing Index -- the running cumulative sum of
 * the Wilder Swing Index. The line starts at zero on the opening
 * bar.
 */
export function computeLineAsi(
  bars: readonly ChartLineAsiPoint[] | null | undefined,
  limitMove: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n === 0) return out;
  const si = computeLineAsiSwingIndex(bars, limitMove);
  let cumulative = 0;
  out[0] = 0;
  for (let i = 1; i < n; i += 1) {
    const s = si[i];
    cumulative += isFiniteNumber(s) ? s : 0;
    out[i] = cumulative;
  }
  return out;
}

function classifyZone(swingIndex: number | null): ChartLineAsiZone {
  if (swingIndex === null) return 'none';
  if (swingIndex > 0) return 'up';
  if (swingIndex < 0) return 'down';
  return 'flat';
}

export function runLineAsi(
  points: readonly ChartLineAsiPoint[] | null | undefined,
  options?: { limitMove?: number },
): ChartLineAsiRun {
  const finite = getLineAsiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const limitMove = normalizeLineAsiLimitMove(
    options?.limitMove ?? DEFAULT_CHART_LINE_ASI_LIMIT_MOVE,
    DEFAULT_CHART_LINE_ASI_LIMIT_MOVE,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      limitMove,
      swingIndex: [],
      asi: [],
      samples: [],
      asiFinal: NaN,
      upCount: 0,
      downCount: 0,
      flatCount: 0,
      ok: false,
    };
  }

  const swingIndex = computeLineAsiSwingIndex(series, limitMove);
  const asi = computeLineAsi(series, limitMove);

  const samples: ChartLineAsiSample[] = series.map((p, i) => {
    const si = swingIndex[i] ?? null;
    return {
      index: i,
      x: p.x,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      swingIndex: si,
      asi: asi[i] ?? 0,
      zone: classifyZone(si),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  for (const s of samples) {
    if (s.zone === 'up') upCount += 1;
    else if (s.zone === 'down') downCount += 1;
    else if (s.zone === 'flat') flatCount += 1;
  }
  const last = samples[samples.length - 1];

  return {
    series = [],
    limitMove,
    swingIndex,
    asi,
    samples,
    asiFinal: last ? last.asi : NaN,
    upCount,
    downCount,
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

export function computeLineAsiLayout(
  options: ComputeLineAsiLayoutOptions,
): ChartLineAsiLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_ASI_GAP,
    tickCount = DEFAULT_CHART_LINE_ASI_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ASI_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineAsi(data, {
    ...(isFiniteNumber(options.limitMove)
      ? { limitMove: options.limitMove }
      : {}),
  });

  const emptyPanel: ChartLineAsiPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineAsiLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    asiPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    asiYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    asiYMin: 0,
    asiYMax: 0,
    pricePath: '',
    priceDots: [],
    asiPath: '',
    markers: [],
    zeroY: 0,
    limitMove: run.limitMove,
    asiFinal: NaN,
    upCount: 0,
    downCount: 0,
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
  const asiHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineAsiPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const asiPanel: ChartLineAsiPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: asiHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let asiLo = 0;
  let asiHi = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < priceLo) priceLo = s.close;
    if (s.close > priceHi) priceHi = s.close;
    if (s.asi < asiLo) asiLo = s.asi;
    if (s.asi > asiHi) asiHi = s.asi;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  if (asiLo === asiHi) {
    asiLo -= 1;
    asiHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const asiRange = asiHi - asiLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectAsiY = (v: number): number =>
    asiPanel.y + asiPanel.height - ((v - asiLo) / asiRange) * asiPanel.height;

  const priceDots: ChartLineAsiPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    swingIndex: s.swingIndex,
    asi: s.asi,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const asiPts: { px: number; py: number }[] = [];
  const markers: ChartLineAsiMarker[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    const py = projectAsiY(s.asi);
    asiPts.push({ px, py });
    if (s.zone !== 'none') {
      markers.push({ index: s.index, x: s.x, asi: s.asi, zone: s.zone, px, py });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    asiPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    asiYTicks: computeTicks(asiLo, asiHi, tickCount).map((v) => ({
      value: v,
      py: projectAsiY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    asiYMin: asiLo,
    asiYMax: asiHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    asiPath: buildPath(asiPts),
    markers,
    zeroY: projectAsiY(0),
    limitMove: run.limitMove,
    asiFinal: run.asiFinal,
    upCount: run.upCount,
    downCount: run.downCount,
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

export function describeLineAsiChart(
  data: readonly ChartLineAsiPoint[] | null | undefined,
  options?: { limitMove?: number },
): string {
  const run = runLineAsi(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with the Accumulative Swing Index (limit move ${run.limitMove}): the top panel plots the close; the bottom panel plots the Accumulative Swing Index. Each bar's Wilder Swing Index scores the bar-to-bar price swing -- it weighs the close-to-close change against the bar's open, the prior close and a special true-range term, scaled by the limit move. The Accumulative Swing Index sums those swing scores into a running total that confirms the price trend. The swing runs up on ${run.upCount} bars, down on ${run.downCount} and flat on ${run.flatCount} across ${run.samples.length} bars.`;
}

const ASI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineAsi = forwardRef<HTMLDivElement, ChartLineAsiProps>(
  function ChartLineAsi(
    props: ChartLineAsiProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      limitMove,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_ASI_WIDTH,
      height = DEFAULT_CHART_LINE_ASI_HEIGHT,
      padding = DEFAULT_CHART_LINE_ASI_PADDING,
      gap = DEFAULT_CHART_LINE_ASI_GAP,
      tickCount = DEFAULT_CHART_LINE_ASI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_ASI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_ASI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_ASI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_ASI_PRICE_COLOR,
      asiColor = DEFAULT_CHART_LINE_ASI_ASI_COLOR,
      upColor = DEFAULT_CHART_LINE_ASI_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_ASI_DOWN_COLOR,
      zeroColor = DEFAULT_CHART_LINE_ASI_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_ASI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_ASI_AXIS_COLOR,
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
      ariaLabel = 'Two-panel chart with the Accumulative Swing Index',
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
        computeLineAsiLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(limitMove) ? { limitMove } : {}),
        }),
      [data, width, height, padding, gap, tickCount, pricePanelRatio, limitMove],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineAsiChart(data, {
          ...(isFiniteNumber(limitMove) ? { limitMove } : {}),
        }),
      [ariaDescription, data, limitMove],
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
          data-section="chart-line-asi"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-asi-aria-desc"
            style={ASI_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const ap = layout.asiPanel;
    const priceVisible = !hiddenSet.has('price');
    const asiVisible = !hiddenSet.has('asi');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineAsiZone): string => {
      if (zone === 'up') return upColor;
      if (zone === 'down') return downColor;
      return asiColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'asi', label: 'ASI', color: asiColor },
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
        data-section="chart-line-asi"
        data-empty="false"
        data-limit-move={layout.limitMove}
        data-asi-final={layout.asiFinal}
        data-up-count={layout.upCount}
        data-down-count={layout.downCount}
        data-flat-count={layout.flatCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-asi-aria-desc"
          style={ASI_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-asi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-asi-badge"
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
                data-section="chart-line-asi-badge-icon"
                aria-hidden="true"
                style={{ color: asiColor }}
              >
                ASI
              </span>
              <span data-section="chart-line-asi-badge-config">
                {layout.limitMove}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-asi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-asi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-asi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.asiYTicks.map((t, i) => (
                  <line
                    key={`ga-${i}`}
                    data-section="chart-line-asi-grid-line"
                    data-panel="asi"
                    x1={ap.x}
                    x2={ap.x + ap.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-asi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-asi-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-asi-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-asi-axis"
                  data-panel="asi"
                  data-axis="y"
                  x1={ap.x}
                  y1={ap.y}
                  x2={ap.x}
                  y2={ap.y + ap.height}
                />
                <line
                  data-section="chart-line-asi-axis"
                  data-panel="asi"
                  data-axis="x"
                  x1={ap.x}
                  y1={ap.y + ap.height}
                  x2={ap.x + ap.width}
                  y2={ap.y + ap.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-asi-tick-label"
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
                {layout.asiYTicks.map((t, i) => (
                  <text
                    key={`ayt-${i}`}
                    data-section="chart-line-asi-tick-label"
                    data-panel="asi"
                    data-axis="y"
                    x={ap.x - 6}
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
                    data-section="chart-line-asi-tick-label"
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
                ))}
              </g>
            ) : null}

            <text
              data-section="chart-line-asi-panel-label"
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
              data-section="chart-line-asi-panel-label"
              data-panel="asi"
              x={ap.x + 2}
              y={ap.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Accumulative Swing Index
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-asi-zero-line"
                x1={ap.x}
                x2={ap.x + ap.width}
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
                data-section="chart-line-asi-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-asi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                      data-section="chart-line-asi-dot"
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

            {asiVisible && layout.asiPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Accumulative Swing Index line"
                data-section="chart-line-asi-asi-line"
                d={layout.asiPath}
                fill="none"
                stroke={asiColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {asiVisible && showMarkers ? (
              <g data-section="chart-line-asi-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${m.index + 1} at x ${formatX(m.x)}: ASI ${formatValue(m.asi)}, swing ${m.zone}`}
                      data-section="chart-line-asi-marker"
                      data-point-index={m.index}
                      data-asi={m.asi}
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
                    data-section="chart-line-asi-tooltip"
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
                    <div data-section="chart-line-asi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-asi-tooltip-close"
                      style={{ fontWeight: 600 }}
                    >
                      close: {formatValue(d.close)}
                    </div>
                    <div data-section="chart-line-asi-tooltip-si">
                      swing index: {fmtNullable(d.swingIndex)}
                    </div>
                    <div data-section="chart-line-asi-tooltip-asi">
                      asi: {formatValue(d.asi)}
                    </div>
                    <div data-section="chart-line-asi-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-asi-legend"
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
                  data-section="chart-line-asi-legend-item"
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
                    data-section="chart-line-asi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-asi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-asi-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.upCount} up, {layout.downCount} down,{' '}
              {layout.flatCount} flat
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineAsi.displayName = 'ChartLineAsi';
