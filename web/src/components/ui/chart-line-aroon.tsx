import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_AROON_WIDTH = 560;
export const DEFAULT_CHART_LINE_AROON_HEIGHT = 360;
export const DEFAULT_CHART_LINE_AROON_PADDING = 40;
export const DEFAULT_CHART_LINE_AROON_GAP = 26;
export const DEFAULT_CHART_LINE_AROON_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_AROON_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_AROON_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_AROON_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_AROON_PERIOD = 25;
export const DEFAULT_CHART_LINE_AROON_UPPER_LEVEL = 70;
export const DEFAULT_CHART_LINE_AROON_LOWER_LEVEL = 30;
export const DEFAULT_CHART_LINE_AROON_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_AROON_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_AROON_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_AROON_LEVEL_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_AROON_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_AROON_AXIS_COLOR = '#cbd5e1';

export interface ChartLineAroonPoint {
  x: number;
  value: number;
}

export interface ChartLineAroonSeries {
  aroonUp: (number | null)[];
  aroonDown: (number | null)[];
}

export interface ChartLineAroonSample {
  index: number;
  x: number;
  value: number;
  aroonUp: number | null;
  aroonDown: number | null;
  oscillator: number | null;
}

export interface ChartLineAroonRun {
  series: ChartLineAroonPoint[];
  period: number;
  aroonUp: (number | null)[];
  aroonDown: (number | null)[];
  oscillator: (number | null)[];
  samples: ChartLineAroonSample[];
  aroonUpFinal: number;
  aroonDownFinal: number;
  oscillatorFinal: number;
  ok: boolean;
}

export interface ChartLineAroonPriceDot {
  index: number;
  x: number;
  value: number;
  aroonUp: number | null;
  aroonDown: number | null;
  oscillator: number | null;
  px: number;
  py: number;
}

export interface ChartLineAroonMarker {
  index: number;
  x: number;
  aroonUp: number;
  px: number;
  py: number;
}

export interface ChartLineAroonPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineAroonLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineAroonPanel;
  aroonPanel: ChartLineAroonPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  aroonYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineAroonPriceDot[];
  aroonUpPath: string;
  aroonDownPath: string;
  markers: ChartLineAroonMarker[];
  upperLevel: number;
  lowerLevel: number;
  upperLevelY: number;
  lowerLevelY: number;
  period: number;
  aroonUpFinal: number;
  aroonDownFinal: number;
  oscillatorFinal: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineAroonLayoutOptions {
  data: readonly ChartLineAroonPoint[];
  period?: number;
  upperLevel?: number;
  lowerLevel?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineAroonProps {
  data: readonly ChartLineAroonPoint[];
  period?: number;
  upperLevel?: number;
  lowerLevel?: number;
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
  aroonUpColor?: string;
  aroonDownColor?: string;
  levelColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAroonUp?: boolean;
  showAroonDown?: boolean;
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
  onPointClick?: (payload: { point: ChartLineAroonPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineAroonFinitePoints(
  points: readonly ChartLineAroonPoint[] | null | undefined,
): ChartLineAroonPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineAroonPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineAroonPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Tushar Chande's Aroon. For each index from `period` onward the
 * window of `period + 1` values ending at that index is scanned;
 * `Aroon-up = 100 * (period - periodsSinceHigh) / period` and
 * `Aroon-down` likewise from the low. A reading of 100 means the
 * extreme is the current bar (a fresh high/low); 0 means the
 * extreme is the oldest bar in the window. On ties the most recent
 * occurrence wins. Indices before the window fills read null.
 */
export function computeLineAroon(
  values: readonly number[] | null | undefined,
  period: number,
): ChartLineAroonSeries {
  if (!Array.isArray(values)) return { aroonUp: [], aroonDown: [] };
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const aroonUp: (number | null)[] = new Array(n).fill(null);
  const aroonDown: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    let maxIdx = i - p;
    let minIdx = i - p;
    let maxV = values[i - p]!;
    let minV = values[i - p]!;
    for (let j = i - p + 1; j <= i; j += 1) {
      if (values[j]! >= maxV) {
        maxV = values[j]!;
        maxIdx = j;
      }
      if (values[j]! <= minV) {
        minV = values[j]!;
        minIdx = j;
      }
    }
    aroonUp[i] = (100 * (p - (i - maxIdx))) / p;
    aroonDown[i] = (100 * (p - (i - minIdx))) / p;
  }
  return { aroonUp, aroonDown };
}

export function runLineAroon(
  points: readonly ChartLineAroonPoint[] | null | undefined,
  options?: { period?: number },
): ChartLineAroonRun {
  const finite = getLineAroonFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineAroonPeriod(
    options?.period ?? DEFAULT_CHART_LINE_AROON_PERIOD,
    DEFAULT_CHART_LINE_AROON_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      aroonUp: [],
      aroonDown: [],
      oscillator: [],
      samples: [],
      aroonUpFinal: NaN,
      aroonDownFinal: NaN,
      oscillatorFinal: NaN,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { aroonUp, aroonDown } = computeLineAroon(values, period);
  const oscillator: (number | null)[] = aroonUp.map((u, i) =>
    u !== null && aroonDown[i] !== null ? u - (aroonDown[i] as number) : null,
  );
  const samples: ChartLineAroonSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    aroonUp: aroonUp[i] ?? null,
    aroonDown: aroonDown[i] ?? null,
    oscillator: oscillator[i] ?? null,
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null) return arr[i] as number;
    }
    return NaN;
  };

  return {
    series = [],
    period,
    aroonUp,
    aroonDown,
    oscillator,
    samples,
    aroonUpFinal: lastDefined(aroonUp),
    aroonDownFinal: lastDefined(aroonDown),
    oscillatorFinal: lastDefined(oscillator),
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

function clampLevel(v: number | undefined, fallback: number): number {
  if (!isFiniteNumber(v)) return fallback;
  return Math.min(100, Math.max(0, v));
}

export function computeLineAroonLayout(
  options: ComputeLineAroonLayoutOptions,
): ChartLineAroonLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_AROON_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_AROON_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_AROON_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));
  const upperLevel = clampLevel(
    options.upperLevel,
    DEFAULT_CHART_LINE_AROON_UPPER_LEVEL,
  );
  const lowerLevel = clampLevel(
    options.lowerLevel,
    DEFAULT_CHART_LINE_AROON_LOWER_LEVEL,
  );

  const emptyPanel: ChartLineAroonPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineAroon(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
  });
  const empty: ChartLineAroonLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    aroonPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    aroonYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    aroonUpPath: '',
    aroonDownPath: '',
    markers: [],
    upperLevel,
    lowerLevel,
    upperLevelY: 0,
    lowerLevelY: 0,
    period: run.period,
    aroonUpFinal: NaN,
    aroonDownFinal: NaN,
    oscillatorFinal: NaN,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const aroonH = usableHeight - priceH;
  if (priceH <= 0 || aroonH <= 0) return empty;

  const pricePanel: ChartLineAroonPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const aroonPanel: ChartLineAroonPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: aroonH,
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
  const projectAroonY = (v: number): number =>
    aroonPanel.y + aroonPanel.height - (v / 100) * aroonPanel.height;

  const priceDots: ChartLineAroonPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    aroonUp: s.aroonUp,
    aroonDown: s.aroonDown,
    oscillator: s.oscillator,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineAroonMarker[] = [];
  const upPts: { px: number; py: number }[] = [];
  const downPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.aroonUp !== null) {
      const py = projectAroonY(s.aroonUp);
      upPts.push({ px, py });
      markers.push({ index: s.index, x: s.x, aroonUp: s.aroonUp, px, py });
    }
    if (s.aroonDown !== null) {
      downPts.push({ px, py: projectAroonY(s.aroonDown) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    aroonPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    aroonYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectAroonY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    aroonUpPath: buildPath(upPts),
    aroonDownPath: buildPath(downPts),
    markers,
    upperLevel,
    lowerLevel,
    upperLevelY: projectAroonY(upperLevel),
    lowerLevelY: projectAroonY(lowerLevel),
    period: run.period,
    aroonUpFinal: run.aroonUpFinal,
    aroonDownFinal: run.aroonDownFinal,
    oscillatorFinal: run.oscillatorFinal,
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

export function describeLineAroonChart(
  data: readonly ChartLineAroonPoint[] | null | undefined,
  options?: { period?: number; formatValue?: (n: number) => string },
): string {
  const run = runLineAroon(data, options);
  if (!run.ok) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Line chart with an Aroon panel (period ${run.period}): the Aroon-up and Aroon-down lines measure how recently the window made a new high or low -- a reading near 100 means a fresh extreme, near 0 means the extreme is stale. Final Aroon-up ${fmt(run.aroonUpFinal)}, Aroon-down ${fmt(run.aroonDownFinal)}, across ${run.samples.length} periods.`;
}

const AROON_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineAroon = forwardRef<HTMLDivElement, ChartLineAroonProps>(
  function ChartLineAroon(
    props: ChartLineAroonProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      period,
      upperLevel,
      lowerLevel,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_AROON_WIDTH,
      height = DEFAULT_CHART_LINE_AROON_HEIGHT,
      padding = DEFAULT_CHART_LINE_AROON_PADDING,
      gap = DEFAULT_CHART_LINE_AROON_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_AROON_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_AROON_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_AROON_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_AROON_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_AROON_VALUE_COLOR,
      aroonUpColor = DEFAULT_CHART_LINE_AROON_UP_COLOR,
      aroonDownColor = DEFAULT_CHART_LINE_AROON_DOWN_COLOR,
      levelColor = DEFAULT_CHART_LINE_AROON_LEVEL_COLOR,
      gridColor = DEFAULT_CHART_LINE_AROON_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_AROON_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showAroonUp = true,
      showAroonDown = true,
      showLevels = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with an Aroon panel',
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
        computeLineAroonLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(period) ? { period } : {}),
          ...(isFiniteNumber(upperLevel) ? { upperLevel } : {}),
          ...(isFiniteNumber(lowerLevel) ? { lowerLevel } : {}),
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
        upperLevel,
        lowerLevel,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineAroonChart(data, {
          formatValue,
          ...(isFiniteNumber(period) ? { period } : {}),
        }),
      [ariaDescription, data, period, formatValue],
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
          data-section="chart-line-aroon"
          data-empty="true"
          data-period={layout.period}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-aroon-aria-desc" style={AROON_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const ap = layout.aroonPanel;
    const valueVisible = !hiddenSet.has('value');
    const upVisible = showAroonUp && !hiddenSet.has('aroonup');
    const downVisible = showAroonDown && !hiddenSet.has('aroondown');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Value', color: valueColor },
      { id: 'aroonup', label: 'Aroon-up', color: aroonUpColor },
      { id: 'aroondown', label: 'Aroon-down', color: aroonDownColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-aroon"
        data-empty="false"
        data-period={layout.period}
        data-aroon-up-final={layout.aroonUpFinal}
        data-aroon-down-final={layout.aroonDownFinal}
        data-oscillator-final={layout.oscillatorFinal}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-aroon-aria-desc" style={AROON_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-aroon-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-aroon-badge"
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
                data-section="chart-line-aroon-badge-icon"
                aria-hidden="true"
                style={{ color: aroonUpColor }}
              >
                AROON
              </span>
              <span data-section="chart-line-aroon-badge-period">
                p={layout.period}
              </span>
              <span data-section="chart-line-aroon-badge-osc">
                osc={formatValue(layout.oscillatorFinal)}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-aroon-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-aroon-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-aroon-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.aroonYTicks.map((t, i) => (
                  <line
                    key={`agy-${i}`}
                    data-section="chart-line-aroon-grid-line"
                    data-panel="aroon"
                    x1={ap.x}
                    x2={ap.x + ap.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showLevels ? (
              <g data-section="chart-line-aroon-levels">
                {[
                  { name: 'upper', level: layout.upperLevel, y: layout.upperLevelY },
                  { name: 'lower', level: layout.lowerLevel, y: layout.lowerLevelY },
                ].map((lv) => (
                  <g
                    key={`lv-${lv.name}`}
                    data-section="chart-line-aroon-level"
                    data-level={lv.name}
                  >
                    <line
                      data-section="chart-line-aroon-level-line"
                      data-level={lv.name}
                      x1={ap.x}
                      x2={ap.x + ap.width}
                      y1={lv.y}
                      y2={lv.y}
                      stroke={levelColor}
                      strokeWidth={1}
                      strokeDasharray="4 3"
                    />
                    <text
                      data-section="chart-line-aroon-level-label"
                      data-level={lv.name}
                      x={ap.x + ap.width - 2}
                      y={lv.y - 3}
                      textAnchor="end"
                      fontSize={9}
                      fill={levelColor}
                      stroke="none"
                    >
                      {formatValue(lv.level)}
                    </text>
                  </g>
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-aroon-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: ap, name: 'aroon', yt: layout.aroonYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-aroon-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-aroon-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-aroon-axis"
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
                        data-section="chart-line-aroon-tick"
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
                          data-section="chart-line-aroon-tick-label"
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
                <g data-section="chart-line-aroon-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-aroon-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={ap.y + ap.height}
                        y2={ap.y + ap.height + 4}
                      />
                      <text
                        data-section="chart-line-aroon-tick-label"
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
                    </g>
                  ))}
                </g>
              </g>
            ) : null}

            <g data-section="chart-line-aroon-panel-labels">
              <text
                data-section="chart-line-aroon-panel-label"
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
                data-section="chart-line-aroon-panel-label"
                data-panel="aroon"
                x={ap.x + ap.width / 2}
                y={ap.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Aroon
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Value line"
                data-section="chart-line-aroon-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-aroon-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-aroon-dot"
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

            {upVisible && layout.aroonUpPath ? (
              <path
                data-section="chart-line-aroon-up-line"
                d={layout.aroonUpPath}
                fill="none"
                stroke={aroonUpColor}
                strokeWidth={1.75}
              />
            ) : null}

            {downVisible && layout.aroonDownPath ? (
              <path
                data-section="chart-line-aroon-down-line"
                d={layout.aroonDownPath}
                fill="none"
                stroke={aroonDownColor}
                strokeWidth={1.75}
              />
            ) : null}

            {upVisible ? (
              <g data-section="chart-line-aroon-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Aroon-up at x ${formatX(m.x)}: ${formatValue(m.aroonUp)}`}
                      data-section="chart-line-aroon-marker"
                      data-point-index={m.index}
                      data-aroon-up={m.aroonUp}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={aroonUpColor}
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
                    data-section="chart-line-aroon-tooltip"
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
                    <div data-section="chart-line-aroon-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-aroon-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-aroon-tooltip-aroon-up">
                      aroon-up:{' '}
                      {d.aroonUp === null ? 'n/a' : formatValue(d.aroonUp)}
                    </div>
                    <div data-section="chart-line-aroon-tooltip-aroon-down">
                      aroon-down:{' '}
                      {d.aroonDown === null
                        ? 'n/a'
                        : formatValue(d.aroonDown)}
                    </div>
                    <div data-section="chart-line-aroon-tooltip-oscillator">
                      oscillator:{' '}
                      {d.oscillator === null
                        ? 'n/a'
                        : formatValue(d.oscillator)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-aroon-legend"
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
                  data-section="chart-line-aroon-legend-item"
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
                    data-section="chart-line-aroon-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-aroon-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-aroon-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              up {formatValue(layout.aroonUpFinal)} / down{' '}
              {formatValue(layout.aroonDownFinal)}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineAroon.displayName = 'ChartLineAroon';
