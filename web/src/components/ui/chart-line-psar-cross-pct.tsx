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
 * ChartLinePsarCrossPct -- pure-SVG dual-panel chart with the
 * close overlaid with the Parabolic SAR (PSAR) in the top panel
 * and the `close - PSAR` deviation scaled to the close as a
 * percent in the bottom panel. The percent normalisation makes
 * the parabolic trend strength comparable across instruments at
 * different price magnitudes:
 *
 *   AF[i]   = acceleration factor (afStep..afMax, increments
 *             on each new extreme point)
 *   EP[i]   = extreme point in current trend (max close while
 *             up, min close while down)
 *   newSAR  = SAR[i-1] + AF[i-1] * (EP[i-1] - SAR[i-1])
 *           with cap = min(close[i-1], close[i-2]) when up,
 *                cap = max(close[i-1], close[i-2]) when down
 *           with reversal when newSAR crosses close[i]
 *   psarPct[i] = close[i] === 0 ? null
 *                               : (close[i] - SAR[i]) / close[i] * 100
 *
 * Defaults: `afStep = 0.02`, `afMax = 0.2` (canonical Wilder).
 * Regime classifier: `above` (psarPct > 0; close above SAR =
 * uptrend), `below` (close below SAR = downtrend),
 * `at` (close === SAR), `none` (null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: SAR initialises at K with EP =
 *   K. Each newSAR = K + AF * (K - K) = K, so SAR stays at K
 *   forever; no reversal triggers. `close - SAR = 0` ->
 *   `psarPct = 0 / K * 100 = 0` every bar. K = 0 triggers the
 *   divide-by-zero guard -> psarPct = null.
 */

export interface ChartLinePsarCrossPctPoint {
  x: number;
  close: number;
}

export type ChartLinePsarCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLinePsarCrossPctSeriesId = 'price' | 'psar' | 'pct';

export interface ChartLinePsarCrossPctSample {
  index: number;
  x: number;
  close: number;
  psar: number | null;
  psarPct: number | null;
  regime: ChartLinePsarCrossPctRegime;
}

export interface ChartLinePsarCrossPctRun {
  series: ChartLinePsarCrossPctPoint[];
  afStep: number;
  afMax: number;
  psarValues: Array<number | null>;
  pctValues: Array<number | null>;
  samples: ChartLinePsarCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLinePsarCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLinePsarCrossPctLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  pctTop: number;
  pctBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLinePsarCrossPctDot[];
  psarPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  zeroY: number;
  run: ChartLinePsarCrossPctRun;
}

export interface ChartLinePsarCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePsarCrossPctPoint[];
  afStep?: number;
  afMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  psarColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPsar?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePsarCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLinePsarCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLinePsarCrossPctSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatPct?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_STEP = 0.02;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_MAX = 0.2;
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PSAR_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PCT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PSAR_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLinePsarCrossPctFinitePoints(
  data: readonly ChartLinePsarCrossPctPoint[] | null | undefined,
): ChartLinePsarCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePsarCrossPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive number step in (0, 1]. */
export function normalizeLinePsarCrossPctAf(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0 && value <= 1) return value;
  return fallback;
}

export interface LinePsarCrossPctChannels {
  psar: Array<number | null>;
  pct: Array<number | null>;
}

export function computeLinePsarCrossPct(
  series: readonly ChartLinePsarCrossPctPoint[] | null | undefined,
  options: { afStep?: number; afMax?: number } = {},
): LinePsarCrossPctChannels {
  const cleaned = getLinePsarCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { psar: [], pct: [] };
  }
  const afStep = normalizeLinePsarCrossPctAf(
    options.afStep,
    DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_STEP,
  );
  const afMax = normalizeLinePsarCrossPctAf(
    options.afMax,
    DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_MAX,
  );

  const closes = cleaned.map((p) => p.close);
  const psar: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length === 0) return { psar, pct: [] };

  // Initialise: direction up, SAR = first close, EP = first close.
  let direction: 1 | -1 = 1;
  let sar = closes[0]!;
  let ep = closes[0]!;
  let af = afStep;
  psar[0] = sar;

  for (let i = 1; i < closes.length; i += 1) {
    let newSar = sar + af * (ep - sar);
    const close = closes[i]!;

    if (direction === 1) {
      // Cap SAR below recent lows (close-only simplification: use
      // close[i-1] and close[i-2] when available).
      if (i >= 1) newSar = Math.min(newSar, closes[i - 1]!);
      if (i >= 2) newSar = Math.min(newSar, closes[i - 2]!);

      if (newSar > close) {
        // Reversal: switch to downtrend.
        direction = -1;
        sar = ep;
        ep = close;
        af = afStep;
      } else {
        sar = newSar;
        if (close > ep) {
          ep = close;
          af = Math.min(af + afStep, afMax);
        }
      }
    } else {
      if (i >= 1) newSar = Math.max(newSar, closes[i - 1]!);
      if (i >= 2) newSar = Math.max(newSar, closes[i - 2]!);

      if (newSar < close) {
        direction = 1;
        sar = ep;
        ep = close;
        af = afStep;
      } else {
        sar = newSar;
        if (close < ep) {
          ep = close;
          af = Math.min(af + afStep, afMax);
        }
      }
    }
    psar[i] = posZero(sar);
  }

  const pct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const s = psar[i];
    if (s == null) continue;
    const c = closes[i]!;
    if (c === 0) continue;
    pct[i] = posZero(((c - s) / c) * 100);
  }

  return { psar, pct };
}

export function classifyLinePsarCrossPctRegime(
  pct: number | null,
): ChartLinePsarCrossPctRegime {
  if (pct == null) return 'none';
  if (pct > 0) return 'above';
  if (pct < 0) return 'below';
  return 'at';
}

export function runLinePsarCrossPct(
  data: ChartLinePsarCrossPctPoint[],
  options: { afStep?: number; afMax?: number } = {},
): ChartLinePsarCrossPctRun {
  const cleaned = getLinePsarCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const afStep = normalizeLinePsarCrossPctAf(
    options.afStep,
    DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_STEP,
  );
  const afMax = normalizeLinePsarCrossPctAf(
    options.afMax,
    DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_MAX,
  );

  const channels = computeLinePsarCrossPct(series, { afStep, afMax });

  const samples: ChartLinePsarCrossPctSample[] = series.map((p, i) => {
    const psar = channels.psar[i] ?? null;
    const pct = channels.pct[i] ?? null;
    const regime = classifyLinePsarCrossPctRegime(pct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      psar,
      psarPct: pct,
      regime,
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let atCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'above') aboveCount += 1;
    else if (s.regime === 'below') belowCount += 1;
    else if (s.regime === 'at') atCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > 2;

  return {
    series = [],
    afStep,
    afMax,
    psarValues: channels.psar,
    pctValues: channels.pct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLinePsarCrossPctLayoutOptions {
  data: ChartLinePsarCrossPctPoint[];
  afStep?: number;
  afMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLinePsarCrossPctLayout(
  opts: ComputeLinePsarCrossPctLayoutOptions,
): ChartLinePsarCrossPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_PSAR_CROSS_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_PSAR_CROSS_PCT_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PANEL_GAP;

  const run = runLinePsarCrossPct(opts.data, {
    afStep: opts.afStep ?? undefined,
    afMax: opts.afMax ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const pctTop = priceBottom + panelGap;
  const pctBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      pctTop,
      pctBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      psarPath: '',
      pctPath: '',
      priceMin: 0,
      priceMax: 0,
      pctMin: -1,
      pctMax: 1,
      zeroY: (pctTop + pctBottom) / 2,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
    if (s.psar != null) {
      if (s.psar < priceMin) priceMin = s.psar;
      if (s.psar > priceMax) priceMax = s.psar;
    }
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let pctMin = Infinity;
  let pctMax = -Infinity;
  for (const s of run.samples) {
    if (s.psarPct == null) continue;
    if (s.psarPct < pctMin) pctMin = s.psarPct;
    if (s.psarPct > pctMax) pctMax = s.psarPct;
  }
  if (!Number.isFinite(pctMin) || !Number.isFinite(pctMax)) {
    pctMin = -1;
    pctMax = 1;
  }
  if (pctMin === pctMax) {
    pctMin -= 1;
    pctMax += 1;
  }
  if (pctMin > 0) pctMin = 0;
  if (pctMax < 0) pctMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syPct = (y: number): number =>
    pctBottom - ((y - pctMin) / (pctMax - pctMin)) * (pctBottom - pctTop);

  let pricePath = '';
  const priceDots: ChartLinePsarCrossPctDot[] = [];
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

  let psarPath = '';
  let psarFirst = true;
  for (const s of run.samples) {
    if (s.psar == null) {
      psarFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.psar);
    psarPath += `${psarFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    psarFirst = false;
  }
  psarPath = psarPath.trim();

  let pctPath = '';
  let pctFirst = true;
  for (const s of run.samples) {
    if (s.psarPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.psarPct);
    pctPath += `${pctFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    pctFirst = false;
  }
  pctPath = pctPath.trim();

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    pctTop,
    pctBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    psarPath,
    pctPath,
    priceMin,
    priceMax,
    pctMin,
    pctMax,
    zeroY: syPct(0),
    run,
  };
}

export function describeLinePsarCrossPctChart(
  data: ChartLinePsarCrossPctPoint[],
  options: { afStep?: number; afMax?: number } = {},
): string {
  const cleaned = getLinePsarCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const afStep = normalizeLinePsarCrossPctAf(
    options.afStep,
    DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_STEP,
  );
  const afMax = normalizeLinePsarCrossPctAf(
    options.afMax,
    DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_MAX,
  );
  return (
    `PSAR Cross Pct chart over ${cleaned.length} bars (afStep ` +
    `${afStep}, afMax ${afMax}). Top panel overlays the close ` +
    `with the Parabolic SAR; bottom panel renders the (close - ` +
    `PSAR) / close * 100 percent deviation scaled to price ` +
    `magnitude for cross-instrument comparable parabolic trend ` +
    `strength.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLinePsarCrossPct = forwardRef<
  HTMLDivElement,
  ChartLinePsarCrossPctProps
>(function ChartLinePsarCrossPct(props, ref): ReactNode {
  const {
    data,
    afStep = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_STEP,
    afMax = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AF_MAX,
    width = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PRICE_COLOR,
    psarColor = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PSAR_COLOR,
    pctColor = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_PSAR_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPsar = true,
    showPct = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatPrice = defaultPriceFormatter,
    formatPct = defaultPctFormatter,
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
    () => getLinePsarCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLinePsarCrossPctLayout({
        data: cleaned,
        afStep,
        afMax,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, afStep, afMax, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLinePsarCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLinePsarCrossPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLinePsarCrossPctSeriesId,
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
        data-section="chart-line-psar-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLinePsarCrossPctChart(cleaned, { afStep, afMax });

  const showPrice = !hidden.has('price');
  const showPsarLine = !hidden.has('psar') && showPsar;
  const showPctLine = !hidden.has('pct') && showPct;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickPctValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPctValues.push(
      layout.pctMin + ((layout.pctMax - layout.pctMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'PSAR Cross Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-psar-cross-pct"
      data-af-step={afStep}
      data-af-max={afMax}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-psar-cross-pct-title"
      >
        {ariaLabel ?? 'PSAR Cross Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-psar-cross-pct-aria-desc"
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
        data-section="chart-line-psar-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-psar-cross-pct-grid">
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
                  data-section="chart-line-psar-cross-pct-grid-line-price"
                />
              );
            })}
            {tickPctValues.map((v, i) => {
              const y =
                layout.pctBottom -
                ((v - layout.pctMin) /
                  (layout.pctMax - layout.pctMin)) *
                  (layout.pctBottom - layout.pctTop);
              return (
                <line
                  key={`grid-pct-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-psar-cross-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-psar-cross-pct-axes">
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
              y1={layout.pctTop}
              x2={layout.innerLeft}
              y2={layout.pctBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.pctBottom}
              x2={layout.innerRight}
              y2={layout.pctBottom}
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
                  data-section="chart-line-psar-cross-pct-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickPctValues.map((v, i) => {
              const y =
                layout.pctBottom -
                ((v - layout.pctMin) /
                  (layout.pctMax - layout.pctMin)) *
                  (layout.pctBottom - layout.pctTop);
              return (
                <text
                  key={`tick-pct-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-psar-cross-pct-tick-pct"
                >
                  {formatPct(v)}
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
            data-section="chart-line-psar-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-psar-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-psar-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-psar-cross-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showPsarLine ? (
          <path
            d={layout.psarPath}
            stroke={psarColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-psar-cross-pct-psar"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-psar-cross-pct-pct"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-psar-cross-pct-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.pctBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-psar-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-psar-cross-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={196}
                  height={116}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-pct-tooltip-psar"
                >
                  psar{' '}
                  {tooltipSample.psar == null
                    ? '--'
                    : formatPrice(tooltipSample.psar)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-pct-tooltip-pct"
                >
                  psarPct{' '}
                  {tooltipSample.psarPct == null
                    ? '--'
                    : formatPct(tooltipSample.psarPct)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-psar-cross-pct-tooltip-counts2"
                >
                  at {layout.run.atCount} | none {layout.run.noneCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-psar-cross-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          step {afStep} | max {afMax} | above{' '}
          {layout.run.aboveCount} | below {layout.run.belowCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-psar-cross-pct-legend"
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
              { id: 'psar' as const, color: psarColor, label: 'psar' },
              { id: 'pct' as const, color: pctColor, label: 'psarPct' },
            ] satisfies Array<{
              id: ChartLinePsarCrossPctSeriesId;
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

ChartLinePsarCrossPct.displayName = 'ChartLinePsarCrossPct';
