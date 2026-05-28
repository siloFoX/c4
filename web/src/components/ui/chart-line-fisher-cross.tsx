import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';

/**
 * ChartLineFisherCross -- pure-SVG dual-panel chart with the close
 * on top and John Ehlers' Fisher Transform plus its signal (the
 * one-bar-lagged Fisher value) on the bottom. The Fisher Transform
 * gaussian-normalises price action so extremes become more
 * obvious; markers fire at every Fisher-vs-signal crossover.
 *
 *   hl2[i]        = (high[i] + low[i]) / 2
 *   normalized[i] = (hi === lo)
 *                     ? 0.67 * normalized[i-1]
 *                     : 0.66 * ((hl2 - lo) / (hi - lo) - 0.5)
 *                       + 0.67 * normalized[i-1]
 *                   clamped to [-MAX_INPUT, MAX_INPUT]
 *   fisher[i]     = 0.5 * ln((1 + normalized[i]) / (1 - normalized[i]))
 *                   + 0.5 * fisher[i-1]
 *   signal[i]     = fisher[i-1]
 *
 * `MAX_INPUT = 0.999` clamps the normalized input to avoid the
 * singularity of the inverse hyperbolic tangent at +/-1.
 *
 * Cross events: `up` (Fisher newly exceeds signal -> regime
 * `accelerating-up`), `down` (Fisher newly drops below signal ->
 * regime `accelerating-down`).
 *
 * Bit-exact anchor:
 *
 * - **CONST h = l = close = K**: `hi === lo` is true on every
 *   bar, so the normalized update collapses to
 *   `0.67 * normalized[i-1]`. With `normalized[0] = 0`, the value
 *   stays at 0 forever -> Fisher = `0.5 * ln(1/1) + 0.5 * 0 = 0`,
 *   signal = 0. Relation `equal` forever, zero crosses.
 *   Verified across multiple K and length.
 */

export interface ChartLineFisherCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineFisherCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineFisherCrossCross = 'up' | 'down' | null;

export type ChartLineFisherCrossSeriesId = 'price' | 'fisher' | 'signal';

export interface ChartLineFisherCrossSample {
  index: number;
  x: number;
  close: number;
  normalized: number | null;
  fisher: number | null;
  signal: number | null;
  relation: ChartLineFisherCrossRelation;
  crossed: ChartLineFisherCrossCross;
}

export interface ChartLineFisherCrossRun {
  series: ChartLineFisherCrossPoint[];
  length: number;
  normalizedValues: Array<number | null>;
  fisherValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineFisherCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  bullishCount: number;
  bearishCount: number;
  equalCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineFisherCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  fisher: number;
  kind: 'up' | 'down';
}

export interface ChartLineFisherCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineFisherCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  oscTop: number;
  oscBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineFisherCrossDot[];
  fisherPath: string;
  signalPath: string;
  markers: ChartLineFisherCrossMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLineFisherCrossRun;
}

export interface ChartLineFisherCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFisherCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  fisherColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFisher?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFisherCrossSeriesId[];
  defaultHiddenSeries?: ChartLineFisherCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineFisherCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineFisherCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatFisher?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_FISHER_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_FISHER_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_FISHER_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FISHER_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FISHER_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FISHER_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_FISHER_CROSS_LENGTH = 10;
export const DEFAULT_CHART_LINE_FISHER_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_FISHER_CROSS_FISHER_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_FISHER_CROSS_SIGNAL_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_FISHER_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_FISHER_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FISHER_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_FISHER_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FISHER_CROSS_GRID_COLOR = '#e2e8f0';

export const FISHER_MAX_INPUT = 0.999;
export const FISHER_NORM_COEF_NEW = 0.66;
export const FISHER_NORM_COEF_OLD = 0.67;
export const FISHER_TRANSFORM_COEF = 0.5;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / high / low / close. */
export function getLineFisherCrossFinitePoints(
  data: readonly ChartLineFisherCrossPoint[] | null | undefined,
): ChartLineFisherCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFisherCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineFisherCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

export interface LineFisherCrossChannels {
  normalized: Array<number | null>;
  fisher: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineFisherCross(
  series: readonly ChartLineFisherCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineFisherCrossChannels {
  const cleaned = getLineFisherCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { normalized: [], fisher: [], signal: [] };
  }
  const length = normalizeLineFisherCrossLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_CROSS_LENGTH,
  );

  const n = cleaned.length;
  const normalized: Array<number | null> = new Array(n).fill(null);
  const fisher: Array<number | null> = new Array(n).fill(null);
  const signal: Array<number | null> = new Array(n).fill(null);

  let prevNorm = 0;
  let prevFisher = 0;

  for (let i = 0; i < n; i += 1) {
    const cur = cleaned[i];
    if (!cur) continue;
    let hi = -Infinity;
    let lo = Infinity;
    let ok = i >= length - 1;
    if (ok) {
      for (let k = i - length + 1; k <= i; k += 1) {
        const p = cleaned[k];
        if (!p) {
          ok = false;
          break;
        }
        const mid = (p.high + p.low) / 2;
        if (mid < lo) lo = mid;
        if (mid > hi) hi = mid;
      }
    }
    if (!ok) continue;

    const hl2 = (cur.high + cur.low) / 2;
    let norm: number;
    if (hi === lo) {
      norm = FISHER_NORM_COEF_OLD * prevNorm;
    } else {
      norm =
        FISHER_NORM_COEF_NEW * ((hl2 - lo) / (hi - lo) - 0.5) +
        FISHER_NORM_COEF_OLD * prevNorm;
    }
    if (norm > FISHER_MAX_INPUT) norm = FISHER_MAX_INPUT;
    else if (norm < -FISHER_MAX_INPUT) norm = -FISHER_MAX_INPUT;

    const fish =
      FISHER_TRANSFORM_COEF * Math.log((1 + norm) / (1 - norm)) +
      FISHER_TRANSFORM_COEF * prevFisher;

    normalized[i] = posZero(norm);
    fisher[i] = posZero(fish);
    signal[i] = posZero(prevFisher);

    prevNorm = norm;
    prevFisher = fish;
  }

  return { normalized, fisher, signal };
}

export function classifyLineFisherCrossRelation(
  fisher: number | null,
  signal: number | null,
): ChartLineFisherCrossRelation {
  if (fisher == null || signal == null) return 'none';
  if (fisher > signal) return 'bullish';
  if (fisher < signal) return 'bearish';
  return 'equal';
}

export function detectLineFisherCrossCrosses(
  fisherValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineFisherCrossCross[] {
  const out: ChartLineFisherCrossCross[] = [];
  let prevF: number | null = null;
  let prevS: number | null = null;
  for (let i = 0; i < fisherValues.length; i += 1) {
    const f = fisherValues[i];
    const s = signalValues[i];
    if (f == null || s == null) {
      out.push(null);
      prevF = null;
      prevS = null;
      continue;
    }
    if (prevF == null || prevS == null) {
      out.push(null);
      prevF = f;
      prevS = s;
      continue;
    }
    if (prevF <= prevS && f > s) {
      out.push('up');
    } else if (prevF >= prevS && f < s) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevF = f;
    prevS = s;
  }
  return out;
}

export function runLineFisherCross(
  data: ChartLineFisherCrossPoint[],
  options: { length?: number } = {},
): ChartLineFisherCrossRun {
  const cleaned = getLineFisherCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineFisherCrossLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_CROSS_LENGTH,
  );

  const channels = computeLineFisherCross(series, { length });
  const crosses = detectLineFisherCrossCrosses(
    channels.fisher,
    channels.signal,
  );

  const samples: ChartLineFisherCrossSample[] = series.map((p, i) => {
    const fisher = channels.fisher[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const normalized = channels.normalized[i] ?? null;
    const relation = classifyLineFisherCrossRelation(fisher, signal);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      normalized,
      fisher,
      signal,
      relation,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let equalCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.relation === 'bullish') bullishCount += 1;
    else if (s.relation === 'bearish') bearishCount += 1;
    else if (s.relation === 'equal') equalCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length;

  return {
    series = [],
    length,
    normalizedValues: channels.normalized,
    fisherValues: channels.fisher,
    signalValues: channels.signal,
    samples,
    upCrossCount,
    downCrossCount,
    bullishCount,
    bearishCount,
    equalCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineFisherCrossLayoutOptions {
  data: ChartLineFisherCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineFisherCrossLayout(
  opts: ComputeLineFisherCrossLayoutOptions,
): ChartLineFisherCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_FISHER_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_FISHER_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_FISHER_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_FISHER_CROSS_PANEL_GAP;

  const run = runLineFisherCross(opts.data, {
    length: opts.length ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      oscTop,
      oscBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      fisherPath: '',
      signalPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.fisher != null) {
      if (s.fisher < oscMin) oscMin = s.fisher;
      if (s.fisher > oscMax) oscMax = s.fisher;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineFisherCrossDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  const buildPath = (key: 'fisher' | 'signal'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syOsc(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const fisherPath = buildPath('fisher');
  const signalPath = buildPath('signal');

  const markers: ChartLineFisherCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.fisher == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.fisher),
      fisher: s.fisher,
      kind: s.crossed,
    });
  }

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    fisherPath,
    signalPath,
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    run,
  };
}

export function describeLineFisherCrossChart(
  data: ChartLineFisherCrossPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineFisherCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineFisherCrossLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_CROSS_LENGTH,
  );
  return (
    `Fisher Cross chart over ${cleaned.length} bars (length ` +
    `${length}). Top panel renders the close; bottom panel renders ` +
    `Ehlers Fisher Transform and its signal (one-bar-lagged ` +
    `Fisher) with markers at every cross (up -> accelerating-up, ` +
    `down -> accelerating-down).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultFisherFormatter = (value: number): string =>
  formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineFisherCross = forwardRef<
  HTMLDivElement,
  ChartLineFisherCrossProps
>(function ChartLineFisherCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_FISHER_CROSS_LENGTH,
    width = DEFAULT_CHART_LINE_FISHER_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_FISHER_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_FISHER_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_FISHER_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_FISHER_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FISHER_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FISHER_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_FISHER_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FISHER_CROSS_PRICE_COLOR,
    fisherColor = DEFAULT_CHART_LINE_FISHER_CROSS_FISHER_COLOR,
    signalColor = DEFAULT_CHART_LINE_FISHER_CROSS_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_FISHER_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_FISHER_CROSS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_FISHER_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_FISHER_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_FISHER_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFisher = true,
    showSignal = true,
    showMarkers = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatFisher = defaultFisherFormatter,
    formatX = defaultXFormatter,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...rest
  } = props;

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cleaned = useMemo(
    () => getLineFisherCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineFisherCrossLayout({
        data: cleaned,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineFisherCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineFisherCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineFisherCrossSeriesId,
  ): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLegendClick(seriesId);
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (cleaned.length === 0) {
    return (
      <div
        ref={ref}
        className={className}
        style={style}
        data-section="chart-line-fisher-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineFisherCrossChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showFisherLine = !hidden.has('fisher') && showFisher;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  const markerColor = (kind: 'up' | 'down'): string =>
    kind === 'up' ? bullishColor : bearishColor;

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Fisher Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-fisher-cross"
      data-length={length}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-fisher-cross-title"
      >
        {ariaLabel ?? 'Fisher Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-fisher-cross-aria-desc"
      >
        {desc}
      </span>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={animate ? 'motion-safe:animate-fade-in' : undefined}
        data-section="chart-line-fisher-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-fisher-cross-grid">
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <line
                  key={`grid-price-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-fisher-cross-grid-line-price"
                />
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <line
                  key={`grid-osc-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-fisher-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-fisher-cross-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.priceTop}
              x2={layout.innerLeft}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.priceBottom}
              x2={layout.innerRight}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscTop}
              x2={layout.innerLeft}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscBottom}
              x2={layout.innerRight}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <text
                  key={`tick-price-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-fisher-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <text
                  key={`tick-osc-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-fisher-cross-tick-osc"
                >
                  {formatFisher(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-fisher-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fisher-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-fisher-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-fisher-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fisher-cross-signal"
          />
        ) : null}

        {showFisherLine ? (
          <path
            d={layout.fisherPath}
            stroke={fisherColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fisher-cross-fisher"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-fisher-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.kind)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-fisher-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-fisher-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.oscBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-fisher-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-fisher-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={200}
                  height={140}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-tooltip-norm"
                >
                  normalized{' '}
                  {tooltipSample.normalized == null
                    ? '--'
                    : formatFisher(tooltipSample.normalized)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-tooltip-fisher"
                >
                  fisher{' '}
                  {tooltipSample.fisher == null
                    ? '--'
                    : formatFisher(tooltipSample.fisher)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatFisher(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-cross-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-fisher-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | up {layout.run.upCrossCount} | down{' '}
          {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-fisher-cross-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'close' },
              { id: 'fisher' as const, color: fisherColor, label: 'fisher' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineFisherCrossSeriesId;
              color: string;
              label: string;
            }>
          ).map(({ id, color, label }) => (
            <button
              key={id}
              type="button"
              data-series-id={id}
              aria-pressed={!hidden.has(id)}
              onClick={() => handleLegendClick(id)}
              onKeyDown={(e) => handleLegendKey(e, id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 11,
                opacity: hidden.has(id) ? 0.4 : 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: color,
                  borderRadius: 2,
                }}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

ChartLineFisherCross.displayName = 'ChartLineFisherCross';
