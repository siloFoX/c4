import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_FISHER_WIDTH = 560;
export const DEFAULT_CHART_LINE_FISHER_HEIGHT = 360;
export const DEFAULT_CHART_LINE_FISHER_PADDING = 40;
export const DEFAULT_CHART_LINE_FISHER_GAP = 26;
export const DEFAULT_CHART_LINE_FISHER_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_FISHER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FISHER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FISHER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FISHER_PERIOD = 9;
export const DEFAULT_CHART_LINE_FISHER_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_FISHER_FISHER_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_FISHER_TRIGGER_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_FISHER_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_FISHER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FISHER_AXIS_COLOR = '#cbd5e1';

export interface ChartLineFisherPoint {
  x: number;
  value: number;
}

export interface ChartLineFisherSeries {
  fisher: (number | null)[];
  trigger: (number | null)[];
}

export interface ChartLineFisherSample {
  index: number;
  x: number;
  value: number;
  fisher: number | null;
  trigger: number | null;
}

export interface ChartLineFisherRun {
  series: ChartLineFisherPoint[];
  period: number;
  fisher: (number | null)[];
  trigger: (number | null)[];
  samples: ChartLineFisherSample[];
  fisherFinal: number;
  triggerFinal: number;
  fisherMin: number;
  fisherMax: number;
  ok: boolean;
}

export interface ChartLineFisherPriceDot {
  index: number;
  x: number;
  value: number;
  fisher: number | null;
  trigger: number | null;
  px: number;
  py: number;
}

export interface ChartLineFisherMarker {
  index: number;
  x: number;
  fisher: number;
  px: number;
  py: number;
}

export interface ChartLineFisherPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineFisherLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineFisherPanel;
  fisherPanel: ChartLineFisherPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  fisherYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  fisherYBound: number;
  pricePath: string;
  priceDots: ChartLineFisherPriceDot[];
  fisherPath: string;
  triggerPath: string;
  markers: ChartLineFisherMarker[];
  zeroY: number;
  period: number;
  fisherFinal: number;
  triggerFinal: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineFisherLayoutOptions {
  data: readonly ChartLineFisherPoint[];
  period?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineFisherProps {
  data: readonly ChartLineFisherPoint[];
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
  fisherColor?: string;
  triggerColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFisher?: boolean;
  showTrigger?: boolean;
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
  onPointClick?: (payload: { point: ChartLineFisherPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineFisherFinitePoints(
  points: readonly ChartLineFisherPoint[] | null | undefined,
): ChartLineFisherPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineFisherPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineFisherPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * John Ehlers' Fisher Transform. For each index from `period - 1`
 * onward the value is normalized to a -1..+1 position within the
 * window's high-low range, recursively smoothed (weight 0.33), and
 * clamped just inside +/-1. The Fisher line applies the
 * inverse-hyperbolic-tangent transform
 * `0.5 * ln((1 + v) / (1 - v))` plus half the previous Fisher,
 * which steepens near the +/-1 extremes and so sharpens turning
 * points. The trigger line is the Fisher lagged by one bar.
 */
export function computeLineFisher(
  values: readonly number[] | null | undefined,
  period: number,
): ChartLineFisherSeries {
  if (!Array.isArray(values)) return { fisher: [], trigger: [] };
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const fisher: (number | null)[] = new Array(n).fill(null);
  const trigger: (number | null)[] = new Array(n).fill(null);
  let smoothed = 0;
  let prevFisher = 0;
  let started = false;
  for (let i = p - 1; i < n; i += 1) {
    let hi = values[i - p + 1]!;
    let lo = values[i - p + 1]!;
    for (let j = i - p + 2; j <= i; j += 1) {
      if (values[j]! > hi) hi = values[j]!;
      if (values[j]! < lo) lo = values[j]!;
    }
    const range = hi - lo;
    const rawNorm = range === 0 ? 0 : (2 * (values[i]! - lo)) / range - 1;
    smoothed = started ? 0.33 * rawNorm + 0.67 * smoothed : rawNorm;
    started = true;
    if (smoothed > 0.999) smoothed = 0.999;
    else if (smoothed < -0.999) smoothed = -0.999;
    const f =
      0.5 * Math.log((1 + smoothed) / (1 - smoothed)) + 0.5 * prevFisher;
    fisher[i] = f;
    prevFisher = f;
  }
  for (let i = 1; i < n; i += 1) {
    trigger[i] = fisher[i - 1];
  }
  return { fisher, trigger };
}

export function runLineFisher(
  points: readonly ChartLineFisherPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineFisherRun {
  const finite = getLineFisherFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineFisherPeriod(
    options?.period ?? DEFAULT_CHART_LINE_FISHER_PERIOD,
    DEFAULT_CHART_LINE_FISHER_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      fisher: [],
      trigger: [],
      samples: [],
      fisherFinal: NaN,
      triggerFinal: NaN,
      fisherMin: NaN,
      fisherMax: NaN,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { fisher, trigger } = computeLineFisher(values, period);
  const samples: ChartLineFisherSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    fisher: fisher[i] ?? null,
    trigger: trigger[i] ?? null,
  }));

  const lastDefined = (arr: readonly (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null) return arr[i] as number;
    }
    return NaN;
  };
  let fisherMin = NaN;
  let fisherMax = NaN;
  for (const arr of [fisher, trigger]) {
    for (const v of arr) {
      if (v === null) continue;
      if (Number.isNaN(fisherMin) || v < fisherMin) fisherMin = v;
      if (Number.isNaN(fisherMax) || v > fisherMax) fisherMax = v;
    }
  }

  return {
    series = [],
    period,
    fisher,
    trigger,
    samples,
    fisherFinal: lastDefined(fisher),
    triggerFinal: lastDefined(trigger),
    fisherMin,
    fisherMax,
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

export function computeLineFisherLayout(
  options: ComputeLineFisherLayoutOptions,
): ChartLineFisherLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_FISHER_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_FISHER_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_FISHER_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineFisherPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineFisher(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineFisherLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    fisherPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    fisherYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    fisherYBound: 0,
    pricePath: '',
    priceDots: [],
    fisherPath: '',
    triggerPath: '',
    markers: [],
    zeroY: 0,
    period: run.period,
    fisherFinal: NaN,
    triggerFinal: NaN,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const fisherH = usableHeight - priceH;
  if (priceH <= 0 || fisherH <= 0) return empty;

  const pricePanel: ChartLineFisherPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const fisherPanel: ChartLineFisherPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: fisherH,
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
    if (s.fisher !== null && Math.abs(s.fisher) > bound) {
      bound = Math.abs(s.fisher);
    }
    if (s.trigger !== null && Math.abs(s.trigger) > bound) {
      bound = Math.abs(s.trigger);
    }
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
  const projectFisherY = (v: number): number =>
    fisherPanel.y +
    fisherPanel.height -
    ((v + bound) / (2 * bound)) * fisherPanel.height;

  const priceDots: ChartLineFisherPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    fisher: s.fisher,
    trigger: s.trigger,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineFisherMarker[] = [];
  const fisherPts: { px: number; py: number }[] = [];
  const triggerPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.fisher !== null) {
      const py = projectFisherY(s.fisher);
      fisherPts.push({ px, py });
      markers.push({ index: s.index, x: s.x, fisher: s.fisher, px, py });
    }
    if (s.trigger !== null) {
      triggerPts.push({ px, py: projectFisherY(s.trigger) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    fisherPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    fisherYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectFisherY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    fisherYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    fisherPath: buildPath(fisherPts),
    triggerPath: buildPath(triggerPts),
    markers,
    zeroY: projectFisherY(0),
    period: run.period,
    fisherFinal: run.fisherFinal,
    triggerFinal: run.triggerFinal,
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

export function describeLineFisherChart(
  data: readonly ChartLineFisherPoint[] | null | undefined,
  options?: { period?: number },
): string {
  const run = runLineFisher(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Fisher Transform panel (period ${run.period}): the Fisher Transform normalizes the value within its recent range and applies an inverse-hyperbolic-tangent transform that sharpens turning points into pronounced peaks; a one-bar-lagged trigger line crosses it to flag the turns. Across ${run.samples.length} periods.`;
}

const FISHER_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineFisher = forwardRef<
  HTMLDivElement,
  ChartLineFisherProps
>(function ChartLineFisher(
  props: ChartLineFisherProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_FISHER_WIDTH,
    height = DEFAULT_CHART_LINE_FISHER_HEIGHT,
    padding = DEFAULT_CHART_LINE_FISHER_PADDING,
    gap = DEFAULT_CHART_LINE_FISHER_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_FISHER_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_FISHER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FISHER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FISHER_DOT_RADIUS,
    valueColor = DEFAULT_CHART_LINE_FISHER_VALUE_COLOR,
    fisherColor = DEFAULT_CHART_LINE_FISHER_FISHER_COLOR,
    triggerColor = DEFAULT_CHART_LINE_FISHER_TRIGGER_COLOR,
    zeroColor = DEFAULT_CHART_LINE_FISHER_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_FISHER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_FISHER_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFisher = true,
    showTrigger = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Fisher Transform panel',
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
      computeLineFisherLayout({
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
      describeLineFisherChart(data, {
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
        data-section="chart-line-fisher"
        data-empty="true"
        data-period={layout.period}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-fisher-aria-desc" style={FISHER_SR_STYLE}>
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const fp = layout.fisherPanel;
  const valueVisible = !hiddenSet.has('value');
  const fisherVisible = showFisher && !hiddenSet.has('fisher');
  const triggerVisible = showTrigger && !hiddenSet.has('trigger');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'value', label: 'Value', color: valueColor },
    { id: 'fisher', label: 'Fisher', color: fisherColor },
    { id: 'trigger', label: 'Trigger', color: triggerColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-fisher"
      data-empty="false"
      data-period={layout.period}
      data-fisher-final={layout.fisherFinal}
      data-trigger-final={layout.triggerFinal}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span id={descId} data-section="chart-line-fisher-aria-desc" style={FISHER_SR_STYLE}>
        {summary}
      </span>

      <div
        data-section="chart-line-fisher-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-fisher-badge"
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
              data-section="chart-line-fisher-badge-icon"
              aria-hidden="true"
              style={{ color: fisherColor }}
            >
              FISHER
            </span>
            <span data-section="chart-line-fisher-badge-period">
              p={layout.period}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-fisher-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-fisher-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-fisher-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.fisherYTicks.map((t, i) => (
                <line
                  key={`fgy-${i}`}
                  data-section="chart-line-fisher-grid-line"
                  data-panel="fisher"
                  x1={fp.x}
                  x2={fp.x + fp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-fisher-zero-line"
              x1={fp.x}
              x2={fp.x + fp.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-fisher-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: fp, name: 'fisher', yt: layout.fisherYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-fisher-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-fisher-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-fisher-axis"
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
                      data-section="chart-line-fisher-tick"
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
                        data-section="chart-line-fisher-tick-label"
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
              <g data-section="chart-line-fisher-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-fisher-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={fp.y + fp.height}
                      y2={fp.y + fp.height + 4}
                    />
                    <text
                      data-section="chart-line-fisher-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={fp.y + fp.height + 14}
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

          <g data-section="chart-line-fisher-panel-labels">
            <text
              data-section="chart-line-fisher-panel-label"
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
              data-section="chart-line-fisher-panel-label"
              data-panel="fisher"
              x={fp.x + fp.width / 2}
              y={fp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Fisher
            </text>
          </g>

          {valueVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Value line"
              data-section="chart-line-fisher-value-path"
              d={layout.pricePath}
              fill="none"
              stroke={valueColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {valueVisible && showDots ? (
            <g data-section="chart-line-fisher-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-fisher-dot"
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

          {triggerVisible && layout.triggerPath ? (
            <path
              data-section="chart-line-fisher-trigger-line"
              d={layout.triggerPath}
              fill="none"
              stroke={triggerColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
            />
          ) : null}

          {fisherVisible && layout.fisherPath ? (
            <path
              data-section="chart-line-fisher-fisher-line"
              d={layout.fisherPath}
              fill="none"
              stroke={fisherColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {fisherVisible ? (
            <g data-section="chart-line-fisher-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Fisher at x ${formatX(m.x)}: ${formatValue(m.fisher)}`}
                    data-section="chart-line-fisher-marker"
                    data-point-index={m.index}
                    data-fisher={m.fisher}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={fisherColor}
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
                  data-section="chart-line-fisher-tooltip"
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
                  <div data-section="chart-line-fisher-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-fisher-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-fisher-tooltip-fisher">
                    fisher:{' '}
                    {d.fisher === null ? 'n/a' : formatValue(d.fisher)}
                  </div>
                  <div data-section="chart-line-fisher-tooltip-trigger">
                    trigger:{' '}
                    {d.trigger === null ? 'n/a' : formatValue(d.trigger)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-fisher-legend"
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
                data-section="chart-line-fisher-legend-item"
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
                  data-section="chart-line-fisher-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-fisher-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-fisher-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            final Fisher {formatValue(layout.fisherFinal)}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineFisher.displayName = 'ChartLineFisher';
