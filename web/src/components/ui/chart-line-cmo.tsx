import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CMO_WIDTH = 560;
export const DEFAULT_CHART_LINE_CMO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_CMO_PADDING = 40;
export const DEFAULT_CHART_LINE_CMO_GAP = 26;
export const DEFAULT_CHART_LINE_CMO_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_CMO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CMO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CMO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CMO_PERIOD = 14;
export const DEFAULT_CHART_LINE_CMO_OVERBOUGHT = 50;
export const DEFAULT_CHART_LINE_CMO_OVERSOLD = -50;
export const DEFAULT_CHART_LINE_CMO_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_CMO_CMO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CMO_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CMO_OVERSOLD_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CMO_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_CMO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CMO_AXIS_COLOR = '#cbd5e1';

export type ChartLineCmoZone = 'overbought' | 'oversold' | 'neutral';

export interface ChartLineCmoPoint {
  x: number;
  value: number;
}

export interface ChartLineCmoChanges {
  up: (number | null)[];
  down: (number | null)[];
}

export interface ChartLineCmoSample {
  index: number;
  x: number;
  value: number;
  cmo: number | null;
  zone: ChartLineCmoZone;
}

export interface ChartLineCmoRun {
  series: ChartLineCmoPoint[];
  period: number;
  overbought: number;
  oversold: number;
  cmo: (number | null)[];
  samples: ChartLineCmoSample[];
  cmoFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  ok: boolean;
}

export interface ChartLineCmoPriceDot {
  index: number;
  x: number;
  value: number;
  cmo: number | null;
  zone: ChartLineCmoZone;
  px: number;
  py: number;
}

export interface ChartLineCmoMarker {
  index: number;
  x: number;
  cmo: number;
  zone: ChartLineCmoZone;
  px: number;
  py: number;
}

export interface ChartLineCmoPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineCmoLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineCmoPanel;
  cmoPanel: ChartLineCmoPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  cmoYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineCmoPriceDot[];
  cmoPath: string;
  markers: ChartLineCmoMarker[];
  zeroY: number;
  overbought: number;
  oversold: number;
  overboughtY: number;
  oversoldY: number;
  overboughtZone: ChartLineCmoPanel;
  oversoldZone: ChartLineCmoPanel;
  period: number;
  cmoFinal: number;
  overboughtCount: number;
  oversoldCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineCmoLayoutOptions {
  data: readonly ChartLineCmoPoint[];
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

export interface ChartLineCmoProps {
  data: readonly ChartLineCmoPoint[];
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
  cmoColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCmo?: boolean;
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
  onPointClick?: (payload: { point: ChartLineCmoPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineCmoFinitePoints(
  points: readonly ChartLineCmoPoint[] | null | undefined,
): ChartLineCmoPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineCmoPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineCmoPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The per-period gains and losses. Each period's change splits into
 * an up amount (the positive part) and a down amount (the magnitude
 * of the negative part). Index 0 has no prior value and reads null.
 */
export function computeLineCmoChanges(
  values: readonly number[] | null | undefined,
): ChartLineCmoChanges {
  if (!Array.isArray(values)) return { up: [], down: [] };
  const n = values.length;
  const up: (number | null)[] = new Array(n).fill(null);
  const down: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const change = values[i]! - values[i - 1]!;
    up[i] = change > 0 ? change : 0;
    down[i] = change < 0 ? -change : 0;
  }
  return { up, down };
}

/**
 * Tushar Chande's Momentum Oscillator. Over a trailing window of
 * `period` changes the gains and losses are summed with a plain
 * sum -- no Wilder smoothing -- and `CMO = 100 * (sumUp - sumDown) /
 * (sumUp + sumDown)`. The result runs -100 (all losses) to +100 (all
 * gains), centred on zero. A window with no movement reads 0. CMO is
 * defined from index `period` onward.
 */
export function computeLineCmo(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const { up, down } = computeLineCmoChanges(values);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let sumUp = 0;
    let sumDown = 0;
    for (let j = i - p + 1; j <= i; j += 1) {
      sumUp += up[j] ?? 0;
      sumDown += down[j] ?? 0;
    }
    const total = sumUp + sumDown;
    const raw = total === 0 ? 0 : (100 * (sumUp - sumDown)) / total;
    out[i] = raw === 0 ? 0 : raw;
  }
  return out;
}

function classifyZone(
  cmo: number | null,
  overbought: number,
  oversold: number,
): ChartLineCmoZone {
  if (cmo === null) return 'neutral';
  if (cmo > overbought) return 'overbought';
  if (cmo < oversold) return 'oversold';
  return 'neutral';
}

export function runLineCmo(
  points: readonly ChartLineCmoPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): ChartLineCmoRun {
  const finite = getLineCmoFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineCmoPeriod(
    options?.period ?? DEFAULT_CHART_LINE_CMO_PERIOD,
    DEFAULT_CHART_LINE_CMO_PERIOD,
  );
  const overbought = isFiniteNumber(options?.overbought)
    ? options.overbought
    : DEFAULT_CHART_LINE_CMO_OVERBOUGHT;
  const oversold = isFiniteNumber(options?.oversold)
    ? options.oversold
    : DEFAULT_CHART_LINE_CMO_OVERSOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      overbought,
      oversold,
      cmo: [],
      samples: [],
      cmoFinal: NaN,
      overboughtCount: 0,
      oversoldCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const cmo = computeLineCmo(values, period);
  const samples: ChartLineCmoSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    cmo: cmo[i] ?? null,
    zone: classifyZone(cmo[i] ?? null, overbought, oversold),
  }));

  let cmoFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (cmo[i] !== null) {
      cmoFinal = cmo[i] as number;
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
    series = [],
    period,
    overbought,
    oversold,
    cmo,
    samples,
    cmoFinal,
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

export function computeLineCmoLayout(
  options: ComputeLineCmoLayoutOptions,
): ChartLineCmoLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_CMO_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_CMO_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_CMO_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineCmoPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineCmo(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.overbought)
      ? { overbought: options.overbought }
      : {}),
    ...(isFiniteNumber(options.oversold)
      ? { oversold: options.oversold }
      : {}),
  });
  const empty: ChartLineCmoLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    cmoPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    cmoYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    cmoPath: '',
    markers: [],
    zeroY: 0,
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtY: 0,
    oversoldY: 0,
    overboughtZone: emptyPanel,
    oversoldZone: emptyPanel,
    period: run.period,
    cmoFinal: NaN,
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
  const cmoH = usableHeight - priceH;
  if (priceH <= 0 || cmoH <= 0) return empty;

  const pricePanel: ChartLineCmoPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const cmoPanel: ChartLineCmoPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: cmoH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
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
  // CMO is bounded to -100..+100.
  const projectCmoY = (v: number): number =>
    cmoPanel.y + cmoPanel.height - ((v + 100) / 200) * cmoPanel.height;

  const priceDots: ChartLineCmoPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    cmo: s.cmo,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineCmoMarker[] = [];
  const cmoPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.cmo !== null) {
      const px = projectX(s.x);
      const py = projectCmoY(s.cmo);
      cmoPts.push({ px, py });
      markers.push({ index: s.index, x: s.x, cmo: s.cmo, zone: s.zone, px, py });
    }
  }

  const overboughtY = projectCmoY(run.overbought);
  const oversoldY = projectCmoY(run.oversold);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    cmoPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    cmoYTicks: computeTicks(-100, 100, tickCount).map((v) => ({
      value: v,
      py: projectCmoY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    cmoPath: buildPath(cmoPts),
    markers,
    zeroY: projectCmoY(0),
    overbought: run.overbought,
    oversold: run.oversold,
    overboughtY,
    oversoldY,
    overboughtZone: {
      x: cmoPanel.x,
      y: cmoPanel.y,
      width: cmoPanel.width,
      height: Math.max(0, overboughtY - cmoPanel.y),
    },
    oversoldZone: {
      x: cmoPanel.x,
      y: oversoldY,
      width: cmoPanel.width,
      height: Math.max(0, cmoPanel.y + cmoPanel.height - oversoldY),
    },
    period: run.period,
    cmoFinal: run.cmoFinal,
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

export function describeLineCmoChart(
  data: readonly ChartLineCmoPoint[] | null | undefined,
  options?: { period?: number; overbought?: number; oversold?: number },
): string {
  const run = runLineCmo(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Chande Momentum Oscillator panel (period ${run.period}): CMO sums the gains and losses over the window and reports their net as a percentage on a -100 to +100 scale; readings above +50 are overbought and below -50 oversold. ${run.overboughtCount} overbought and ${run.oversoldCount} oversold across ${run.samples.length} periods.`;
}

const CMO_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineCmo = forwardRef<HTMLDivElement, ChartLineCmoProps>(
  function ChartLineCmo(
    props: ChartLineCmoProps,
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
      width = DEFAULT_CHART_LINE_CMO_WIDTH,
      height = DEFAULT_CHART_LINE_CMO_HEIGHT,
      padding = DEFAULT_CHART_LINE_CMO_PADDING,
      gap = DEFAULT_CHART_LINE_CMO_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_CMO_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_CMO_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_CMO_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_CMO_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_CMO_VALUE_COLOR,
      cmoColor = DEFAULT_CHART_LINE_CMO_CMO_COLOR,
      overboughtColor = DEFAULT_CHART_LINE_CMO_OVERBOUGHT_COLOR,
      oversoldColor = DEFAULT_CHART_LINE_CMO_OVERSOLD_COLOR,
      zeroColor = DEFAULT_CHART_LINE_CMO_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_CMO_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_CMO_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showCmo = true,
      showZones = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Chande Momentum Oscillator panel',
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
        computeLineCmoLayout({
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
        describeLineCmoChart(data, {
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
      (z: ChartLineCmoZone): string =>
        z === 'overbought'
          ? overboughtColor
          : z === 'oversold'
            ? oversoldColor
            : cmoColor,
      [overboughtColor, oversoldColor, cmoColor],
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
          data-section="chart-line-cmo"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-cmo-aria-desc" style={CMO_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const cp = layout.cmoPanel;
    const valueVisible = !hiddenSet.has('value');
    const cmoVisible = showCmo && !hiddenSet.has('cmo');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Value', color: valueColor },
      { id: 'cmo', label: 'CMO', color: cmoColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-cmo"
        data-empty="false"
        data-period={layout.period}
        data-cmo-final={layout.cmoFinal}
        data-overbought-count={layout.overboughtCount}
        data-oversold-count={layout.oversoldCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-cmo-aria-desc" style={CMO_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-cmo-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-cmo-badge"
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
                data-section="chart-line-cmo-badge-icon"
                aria-hidden="true"
                style={{ color: cmoColor }}
              >
                CMO
              </span>
              <span data-section="chart-line-cmo-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-cmo-badge-extremes">
                ext={layout.overboughtCount + layout.oversoldCount}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-cmo-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showZones ? (
              <g data-section="chart-line-cmo-zones">
                <rect
                  data-section="chart-line-cmo-zone"
                  data-zone="overbought"
                  x={layout.overboughtZone.x}
                  y={layout.overboughtZone.y}
                  width={layout.overboughtZone.width}
                  height={layout.overboughtZone.height}
                  fill={overboughtColor}
                  fillOpacity={0.12}
                />
                <rect
                  data-section="chart-line-cmo-zone"
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
                data-section="chart-line-cmo-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-cmo-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.cmoYTicks.map((t, i) => (
                  <line
                    key={`cgy-${i}`}
                    data-section="chart-line-cmo-grid-line"
                    data-panel="cmo"
                    x1={cp.x}
                    x2={cp.x + cp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZones ? (
              <g data-section="chart-line-cmo-levels">
                {[
                  { name: 'overbought', y: layout.overboughtY, level: layout.overbought },
                  { name: 'oversold', y: layout.oversoldY, level: layout.oversold },
                ].map((lv) => (
                  <g
                    key={`lv-${lv.name}`}
                    data-section="chart-line-cmo-level"
                    data-level={lv.name}
                  >
                    <line
                      data-section="chart-line-cmo-level-line"
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
                      data-section="chart-line-cmo-level-label"
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
                data-section="chart-line-cmo-zero-line"
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
                data-section="chart-line-cmo-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: cp, name: 'cmo', yt: layout.cmoYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-cmo-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-cmo-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-cmo-axis"
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
                        data-section="chart-line-cmo-tick"
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
                          data-section="chart-line-cmo-tick-label"
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
                <g data-section="chart-line-cmo-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-cmo-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={cp.y + cp.height}
                        y2={cp.y + cp.height + 4}
                      />
                      <text
                        data-section="chart-line-cmo-tick-label"
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

            <g data-section="chart-line-cmo-panel-labels">
              <text
                data-section="chart-line-cmo-panel-label"
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
                data-section="chart-line-cmo-panel-label"
                data-panel="cmo"
                x={cp.x + cp.width / 2}
                y={cp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                CMO
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Value line"
                data-section="chart-line-cmo-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-cmo-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-cmo-dot"
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

            {cmoVisible && layout.cmoPath ? (
              <path
                data-section="chart-line-cmo-cmo-line"
                d={layout.cmoPath}
                fill="none"
                stroke={cmoColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {cmoVisible ? (
              <g data-section="chart-line-cmo-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`CMO at x ${formatX(m.x)}: ${formatValue(m.cmo)} (${m.zone})`}
                      data-section="chart-line-cmo-marker"
                      data-point-index={m.index}
                      data-cmo={m.cmo}
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
                    data-section="chart-line-cmo-tooltip"
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
                    <div data-section="chart-line-cmo-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-cmo-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-cmo-tooltip-cmo">
                      cmo: {d.cmo === null ? 'n/a' : formatValue(d.cmo)}
                    </div>
                    <div data-section="chart-line-cmo-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-cmo-legend"
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
                  data-section="chart-line-cmo-legend-item"
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
                    data-section="chart-line-cmo-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-cmo-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-cmo-legend-stats"
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

ChartLineCmo.displayName = 'ChartLineCmo';
