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
 * ChartLineVrocPct -- pure-SVG dual-panel chart with the close
 * on top and the Volume Rate of Change percent oscillator on the
 * bottom. Identical to the VROC formula:
 *
 *   VROC[i] = volume[i - length] === 0 ? null
 *               : (volume[i] - volume[i - length])
 *                 / volume[i - length] * 100
 *
 * Renders just the oscillator (no signal cross) with a regime
 * classifier: `above` (VROC > 0), `below` (< 0), `at` (= 0),
 * `none` (null).
 *
 * Bit-exact anchor:
 *
 * - **CONST volume = V (V > 0)**: every difference is 0 -> VROC
 *   = 0 / V * 100 = 0 bit-exactly. Regime `at` everywhere after
 *   warmup. Verified across multiple V and length tuples. V = 0
 *   triggers the divide-by-zero guard -> VROC = null
 *   (regime `none`).
 */

export interface ChartLineVrocPctPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineVrocPctRegime = 'above' | 'below' | 'at' | 'none';

export type ChartLineVrocPctSeriesId = 'price' | 'vroc';

export interface ChartLineVrocPctSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  vroc: number | null;
  regime: ChartLineVrocPctRegime;
}

export interface ChartLineVrocPctRun {
  series: ChartLineVrocPctPoint[];
  length: number;
  vrocValues: Array<number | null>;
  samples: ChartLineVrocPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineVrocPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVrocPctLayout {
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
  priceDots: ChartLineVrocPctDot[];
  vrocPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLineVrocPctRun;
}

export interface ChartLineVrocPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVrocPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  vrocColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVroc?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVrocPctSeriesId[];
  defaultHiddenSeries?: ChartLineVrocPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVrocPctSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatVroc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VROC_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_VROC_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VROC_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_VROC_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VROC_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VROC_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VROC_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VROC_PCT_LENGTH = 12;
export const DEFAULT_CHART_LINE_VROC_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VROC_PCT_VROC_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_VROC_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_VROC_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VROC_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close / volume. */
export function getLineVrocPctFinitePoints(
  data: readonly ChartLineVrocPctPoint[] | null | undefined,
): ChartLineVrocPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVrocPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({
        x: point.x,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineVrocPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

export function computeLineVrocPct(
  series: readonly ChartLineVrocPctPoint[] | null | undefined,
  options: { length?: number } = {},
): Array<number | null> {
  const cleaned = getLineVrocPctFinitePoints(series);
  if (cleaned.length === 0) return [];
  const length = normalizeLineVrocPctLength(
    options.length,
    DEFAULT_CHART_LINE_VROC_PCT_LENGTH,
  );
  const vroc: Array<number | null> = new Array(cleaned.length).fill(null);
  for (let i = length; i < cleaned.length; i += 1) {
    const cur = cleaned[i];
    const past = cleaned[i - length];
    if (!cur || !past) continue;
    if (past.volume === 0) continue;
    vroc[i] = posZero(((cur.volume - past.volume) / past.volume) * 100);
  }
  return vroc;
}

export function classifyLineVrocPctRegime(
  vroc: number | null,
): ChartLineVrocPctRegime {
  if (vroc == null) return 'none';
  if (vroc > 0) return 'above';
  if (vroc < 0) return 'below';
  return 'at';
}

export function runLineVrocPct(
  data: ChartLineVrocPctPoint[],
  options: { length?: number } = {},
): ChartLineVrocPctRun {
  const cleaned = getLineVrocPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineVrocPctLength(
    options.length,
    DEFAULT_CHART_LINE_VROC_PCT_LENGTH,
  );

  const vrocValues = computeLineVrocPct(series, { length });

  const samples: ChartLineVrocPctSample[] = series.map((p, i) => {
    const vroc = vrocValues[i] ?? null;
    const regime = classifyLineVrocPctRegime(vroc);
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      vroc,
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

  const ok = series.length > length;

  return {
    series = [],
    length,
    vrocValues,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineVrocPctLayoutOptions {
  data: ChartLineVrocPctPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVrocPctLayout(
  opts: ComputeLineVrocPctLayoutOptions,
): ChartLineVrocPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VROC_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VROC_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_VROC_PCT_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_VROC_PCT_PANEL_GAP;

  const run = runLineVrocPct(opts.data, {
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
      vrocPath: '',
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
    if (s.vroc == null) continue;
    if (s.vroc < oscMin) oscMin = s.vroc;
    if (s.vroc > oscMax) oscMax = s.vroc;
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
  const priceDots: ChartLineVrocPctDot[] = [];
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

  let vrocPath = '';
  let vrocFirst = true;
  for (const s of run.samples) {
    if (s.vroc == null) {
      vrocFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.vroc);
    vrocPath += `${vrocFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    vrocFirst = false;
  }
  vrocPath = vrocPath.trim();

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
    vrocPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    run,
  };
}

export function describeLineVrocPctChart(
  data: ChartLineVrocPctPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineVrocPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineVrocPctLength(
    options.length,
    DEFAULT_CHART_LINE_VROC_PCT_LENGTH,
  );
  return (
    `VROC Pct chart over ${cleaned.length} bars (length ${length}). ` +
    `Top panel renders the close; bottom panel renders the Volume ` +
    `Rate of Change percent oscillator normalised to the baseline ` +
    `volume across the lookback.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultVrocFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineVrocPct = forwardRef<
  HTMLDivElement,
  ChartLineVrocPctProps
>(function ChartLineVrocPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_VROC_PCT_LENGTH,
    width = DEFAULT_CHART_LINE_VROC_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_VROC_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_VROC_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_VROC_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VROC_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VROC_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VROC_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VROC_PCT_PRICE_COLOR,
    vrocColor = DEFAULT_CHART_LINE_VROC_PCT_VROC_COLOR,
    zeroColor = DEFAULT_CHART_LINE_VROC_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_VROC_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VROC_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVroc = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatPrice = defaultPriceFormatter,
    formatVroc = defaultVrocFormatter,
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

  const cleaned = useMemo(() => getLineVrocPctFinitePoints(data), [data]);

  const layout = useMemo(
    () =>
      computeLineVrocPctLayout({
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
    ChartLineVrocPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVrocPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVrocPctSeriesId,
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
        data-section="chart-line-vroc-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineVrocPctChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showVrocLine = !hidden.has('vroc') && showVroc;

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

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'VROC Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-vroc-pct"
      data-length={length}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-vroc-pct-title"
      >
        {ariaLabel ?? 'VROC Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-vroc-pct-aria-desc"
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
        data-section="chart-line-vroc-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-vroc-pct-grid">
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
                  data-section="chart-line-vroc-pct-grid-line-price"
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
                  data-section="chart-line-vroc-pct-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-vroc-pct-axes">
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
                  data-section="chart-line-vroc-pct-tick-price"
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
                  data-section="chart-line-vroc-pct-tick-osc"
                >
                  {formatVroc(v)}
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
            data-section="chart-line-vroc-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vroc-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-vroc-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-vroc-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showVrocLine ? (
          <path
            d={layout.vrocPath}
            stroke={vrocColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vroc-pct-vroc"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-vroc-pct-hover-targets">
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
                data-section="chart-line-vroc-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-vroc-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={192}
                  height={102}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-pct-tooltip-volume"
                >
                  volume {formatVroc(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-pct-tooltip-vroc"
                >
                  vroc{' '}
                  {tooltipSample.vroc == null
                    ? '--'
                    : formatVroc(tooltipSample.vroc)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vroc-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-vroc-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | above {layout.run.aboveCount} | below{' '}
          {layout.run.belowCount} | at {layout.run.atCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-vroc-pct-legend"
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
              { id: 'vroc' as const, color: vrocColor, label: 'vroc' },
            ] satisfies Array<{
              id: ChartLineVrocPctSeriesId;
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

ChartLineVrocPct.displayName = 'ChartLineVrocPct';
