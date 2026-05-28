import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DPO_WIDTH = 560;
export const DEFAULT_CHART_LINE_DPO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_DPO_PADDING = 40;
export const DEFAULT_CHART_LINE_DPO_GAP = 26;
export const DEFAULT_CHART_LINE_DPO_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_DPO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DPO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DPO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DPO_PERIOD = 20;
export const DEFAULT_CHART_LINE_DPO_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_DPO_DPO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_DPO_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DPO_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DPO_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_DPO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DPO_AXIS_COLOR = '#cbd5e1';

export type ChartLineDpoSign = 'positive' | 'negative' | 'zero';

export interface ChartLineDpoPoint {
  x: number;
  value: number;
}

export interface ChartLineDpoSample {
  index: number;
  x: number;
  value: number;
  dpo: number | null;
  sign: ChartLineDpoSign;
}

export interface ChartLineDpoRun {
  series: ChartLineDpoPoint[];
  period: number;
  shift: number;
  dpo: (number | null)[];
  samples: ChartLineDpoSample[];
  dpoFinal: number;
  dpoMin: number;
  dpoMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineDpoPriceDot {
  index: number;
  x: number;
  value: number;
  dpo: number | null;
  sign: ChartLineDpoSign;
  px: number;
  py: number;
}

export interface ChartLineDpoMarker {
  index: number;
  x: number;
  dpo: number;
  sign: ChartLineDpoSign;
  px: number;
  py: number;
}

export interface ChartLineDpoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineDpoLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineDpoPanel;
  dpoPanel: ChartLineDpoPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  dpoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  dpoYBound: number;
  pricePath: string;
  priceDots: ChartLineDpoPriceDot[];
  dpoPath: string;
  markers: ChartLineDpoMarker[];
  zeroY: number;
  period: number;
  shift: number;
  dpoFinal: number;
  dpoMin: number;
  dpoMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineDpoLayoutOptions {
  data: readonly ChartLineDpoPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineDpoProps {
  data: readonly ChartLineDpoPoint[];
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
  valueColor?: string;
  dpoColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDpo?: boolean;
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
  onPointClick?: (payload: { point: ChartLineDpoPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineDpoFinitePoints(
  points: readonly ChartLineDpoPoint[] | null | undefined,
): ChartLineDpoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineDpoPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineDpoPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The DPO displacement: `floor(period / 2) + 1`. The detrended price
 * oscillator compares the price this many bars in the past with the
 * current moving average, which is what shifts the trend out of the
 * way and leaves the cycle.
 */
export function computeLineDpoShift(period: number): number {
  const p = period < 1 ? 1 : Math.floor(period);
  return Math.floor(p / 2) + 1;
}

/**
 * The Detrended Price Oscillator. For each index the simple moving
 * average over `period` values is subtracted from the price
 * `shift = floor(period/2) + 1` bars earlier:
 * `DPO[i] = value[i - shift] - SMA(period)[i]`. The displaced
 * subtraction removes the longer trend and leaves the shorter cycle
 * oscillating around zero. Indices before both windows are available
 * read null.
 */
export function computeLineDpo(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const shift = Math.floor(p / 2) + 1;
  const out: (number | null)[] = new Array(n).fill(null);
  const start = Math.max(p - 1, shift);
  for (let i = start; i < n; i += 1) {
    let sum = 0;
    for (let j = i - p + 1; j <= i; j += 1) sum += values[j]!;
    const sma = sum / p;
    const raw = values[i - shift]! - sma;
    out[i] = raw === 0 ? 0 : raw;
  }
  return out;
}

function classifySign(dpo: number | null): ChartLineDpoSign {
  if (dpo === null) return 'zero';
  if (dpo > 0) return 'positive';
  if (dpo < 0) return 'negative';
  return 'zero';
}

export function runLineDpo(
  points: readonly ChartLineDpoPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineDpoRun {
  const finite = getLineDpoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineDpoPeriod(
    options?.period ?? DEFAULT_CHART_LINE_DPO_PERIOD,
    DEFAULT_CHART_LINE_DPO_PERIOD,
  );
  const shift = computeLineDpoShift(period);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      shift,
      dpo: [],
      samples: [],
      dpoFinal: NaN,
      dpoMin: NaN,
      dpoMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const dpo = computeLineDpo(values, period);
  const samples: ChartLineDpoSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    dpo: dpo[i] ?? null,
    sign: classifySign(dpo[i] ?? null),
  }));

  let dpoFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (dpo[i] !== null) {
      dpoFinal = dpo[i] as number;
      break;
    }
  }
  let dpoMin = NaN;
  let dpoMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.dpo !== null) {
      if (Number.isNaN(dpoMin) || s.dpo < dpoMin) dpoMin = s.dpo;
      if (Number.isNaN(dpoMax) || s.dpo > dpoMax) dpoMax = s.dpo;
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series = [],
    period,
    shift,
    dpo,
    samples,
    dpoFinal,
    dpoMin,
    dpoMax,
    positiveCount,
    negativeCount,
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

export function computeLineDpoLayout(
  options: ComputeLineDpoLayoutOptions,
): ChartLineDpoLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_DPO_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_DPO_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_DPO_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineDpoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineDpo(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineDpoLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    dpoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    dpoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    dpoYBound: 0,
    pricePath: '',
    priceDots: [],
    dpoPath: '',
    markers: [],
    zeroY: 0,
    period: run.period,
    shift: run.shift,
    dpoFinal: NaN,
    dpoMin: NaN,
    dpoMax: NaN,
    positiveCount: 0,
    negativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const dpoH = usableHeight - priceH;
  if (priceH <= 0 || dpoH <= 0) return empty;

  const pricePanel: ChartLineDpoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const dpoPanel: ChartLineDpoPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: dpoH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
    if (s.dpo !== null && Math.abs(s.dpo) > bound) bound = Math.abs(s.dpo);
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  if (bound <= 0) bound = 1;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectDpoY = (v: number): number =>
    dpoPanel.y + dpoPanel.height - ((v + bound) / (2 * bound)) * dpoPanel.height;

  const priceDots: ChartLineDpoPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    dpo: s.dpo,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineDpoMarker[] = [];
  const dpoPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.dpo !== null) {
      const px = projectX(s.x);
      const py = projectDpoY(s.dpo);
      dpoPts.push({ px, py });
      markers.push({ index: s.index, x: s.x, dpo: s.dpo, sign: s.sign, px, py });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    dpoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    dpoYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectDpoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    dpoYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    dpoPath: buildPath(dpoPts),
    markers,
    zeroY: projectDpoY(0),
    period: run.period,
    shift: run.shift,
    dpoFinal: run.dpoFinal,
    dpoMin: run.dpoMin,
    dpoMax: run.dpoMax,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
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

export function describeLineDpoChart(
  data: readonly ChartLineDpoPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineDpo(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Detrended Price Oscillator panel (period ${run.period}): DPO subtracts a displaced ${run.period}-period moving average from the price, removing the long-term trend so the shorter cycles stand out; the line oscillates around zero. ${run.positiveCount} above and ${run.negativeCount} below the zero line across ${run.samples.length} periods.`;
}

const DPO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineDpo = forwardRef<HTMLDivElement, ChartLineDpoProps>(
  function ChartLineDpo(
    props: ChartLineDpoProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_DPO_WIDTH,
      height = DEFAULT_CHART_LINE_DPO_HEIGHT,
      padding = DEFAULT_CHART_LINE_DPO_PADDING,
      gap = DEFAULT_CHART_LINE_DPO_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_DPO_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_DPO_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_DPO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_DPO_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_DPO_VALUE_COLOR,
      dpoColor = DEFAULT_CHART_LINE_DPO_DPO_COLOR,
      positiveColor = DEFAULT_CHART_LINE_DPO_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_DPO_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_DPO_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_DPO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_DPO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showDpo = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Detrended Price Oscillator panel',
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
        computeLineDpoLayout({
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
        describeLineDpoChart(data, {
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

    const signColor = useCallback(
      (s: ChartLineDpoSign): string =>
        s === 'positive'
          ? positiveColor
          : s === 'negative'
            ? negativeColor
            : dpoColor,
      [positiveColor, negativeColor, dpoColor],
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
          data-section="chart-line-dpo"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-dpo-aria-desc" style={DPO_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const dp = layout.dpoPanel;
    const valueVisible = !hiddenSet.has('value');
    const dpoVisible = showDpo && !hiddenSet.has('dpo');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Value', color: valueColor },
      { id: 'dpo', label: 'DPO', color: dpoColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-dpo"
        data-empty="false"
        data-period={layout.period}
        data-shift={layout.shift}
        data-dpo-final={layout.dpoFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-dpo-aria-desc" style={DPO_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-dpo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-dpo-badge"
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
                data-section="chart-line-dpo-badge-icon"
                aria-hidden="true"
                style={{ color: dpoColor }}
              >
                DPO
              </span>
              <span data-section="chart-line-dpo-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-dpo-badge-shift">
                d={layout.shift}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-dpo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-dpo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-dpo-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.dpoYTicks.map((t, i) => (
                  <line
                    key={`dgy-${i}`}
                    data-section="chart-line-dpo-grid-line"
                    data-panel="dpo"
                    x1={dp.x}
                    x2={dp.x + dp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZeroLine ? (
              <line
                data-section="chart-line-dpo-zero-line"
                x1={dp.x}
                x2={dp.x + dp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-dpo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: dp, name: 'dpo', yt: layout.dpoYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-dpo-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-dpo-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-dpo-axis"
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
                        data-section="chart-line-dpo-tick"
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
                          data-section="chart-line-dpo-tick-label"
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
                <g data-section="chart-line-dpo-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-dpo-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={dp.y + dp.height}
                        y2={dp.y + dp.height + 4}
                      />
                      <text
                        data-section="chart-line-dpo-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={dp.y + dp.height + 14}
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

            <g data-section="chart-line-dpo-panel-labels">
              <text
                data-section="chart-line-dpo-panel-label"
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
                data-section="chart-line-dpo-panel-label"
                data-panel="dpo"
                x={dp.x + dp.width / 2}
                y={dp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                DPO
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Value line"
                data-section="chart-line-dpo-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-dpo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-dpo-dot"
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

            {dpoVisible && layout.dpoPath ? (
              <path
                data-section="chart-line-dpo-dpo-line"
                d={layout.dpoPath}
                fill="none"
                stroke={dpoColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {dpoVisible ? (
              <g data-section="chart-line-dpo-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`DPO at x ${formatX(m.x)}: ${formatValue(m.dpo)} (${m.sign})`}
                      data-section="chart-line-dpo-marker"
                      data-point-index={m.index}
                      data-dpo={m.dpo}
                      data-sign={m.sign}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={signColor(m.sign)}
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
                    data-section="chart-line-dpo-tooltip"
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
                    <div data-section="chart-line-dpo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-dpo-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-dpo-tooltip-dpo">
                      dpo: {d.dpo === null ? 'n/a' : formatValue(d.dpo)}
                    </div>
                    <div data-section="chart-line-dpo-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-dpo-legend"
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
                  data-section="chart-line-dpo-legend-item"
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
                    data-section="chart-line-dpo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-dpo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-dpo-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.positiveCount} above, {layout.negativeCount} below
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineDpo.displayName = 'ChartLineDpo';
