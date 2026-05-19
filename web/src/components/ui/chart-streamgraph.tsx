import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_STREAMGRAPH_WIDTH = 640;
export const DEFAULT_CHART_STREAMGRAPH_HEIGHT = 280;
export const DEFAULT_CHART_STREAMGRAPH_PADDING = 32;
export const DEFAULT_CHART_STREAMGRAPH_BASELINE = 'silhouette';
export const DEFAULT_CHART_STREAMGRAPH_CURVE = 'cardinal';
export const DEFAULT_CHART_STREAMGRAPH_TENSION = 0.5;
export const DEFAULT_CHART_STREAMGRAPH_FILL_OPACITY = 0.7;
export const DEFAULT_CHART_STREAMGRAPH_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];

export type ChartStreamgraphBaseline =
  | 'silhouette'
  | 'wiggle'
  | 'expand'
  | 'zero';

export type ChartStreamgraphCurve =
  | 'cardinal'
  | 'catmullRom'
  | 'linear'
  | 'step';

export interface ChartStreamgraphSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
}

export interface ChartStreamgraphLayerPoint {
  x: number;
  baseValue: number;
  topValue: number;
  rawValue: number;
}

export interface ChartStreamgraphLayer {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartStreamgraphLayerPoint[];
  topPath: string;
  bottomPath: string;
  areaPath: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampToZero(v: number): number {
  if (!isFiniteNumber(v)) return 0;
  return v > 0 ? v : 0;
}

export function getStreamgraphDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_STREAMGRAPH_PALETTE[0]!;
  }
  return DEFAULT_CHART_STREAMGRAPH_PALETTE[
    Math.floor(index) % DEFAULT_CHART_STREAMGRAPH_PALETTE.length
  ]!;
}

export function getStreamgraphTotals(
  series: readonly ChartStreamgraphSeries[],
  sampleCount: number
): number[] {
  const totals = new Array(sampleCount).fill(0);
  for (const s of series) {
    for (let i = 0; i < sampleCount; i++) {
      totals[i] += clampToZero(s.data[i] ?? 0);
    }
  }
  return totals;
}

export function getStreamgraphSampleCount(
  series: readonly ChartStreamgraphSeries[]
): number {
  let max = 0;
  for (const s of series) {
    if (s.data.length > max) max = s.data.length;
  }
  return max;
}

export function computeStreamgraphBaseline(
  series: readonly ChartStreamgraphSeries[],
  sampleCount: number,
  baseline: ChartStreamgraphBaseline
): number[] {
  if (sampleCount <= 0) return [];
  const totals = getStreamgraphTotals(series, sampleCount);
  if (baseline === 'zero') {
    return new Array(sampleCount).fill(0);
  }
  if (baseline === 'expand') {
    return new Array(sampleCount).fill(0);
  }
  if (baseline === 'silhouette') {
    return totals.map((t) => -t / 2);
  }
  // wiggle
  const n = series.length;
  const offsets = new Array(sampleCount).fill(0);
  if (n === 0) return offsets;
  let prev = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (totals[i] === 0) {
      offsets[i] = prev;
      continue;
    }
    let sumNumerator = 0;
    for (let s = 0; s < n; s++) {
      const sCur = clampToZero(series[s]!.data[i] ?? 0);
      let above = 0;
      for (let k = s + 1; k < n; k++) {
        above += clampToZero(series[k]!.data[i] ?? 0);
      }
      sumNumerator += (above + sCur / 2) * sCur;
    }
    const offset = -(sumNumerator / totals[i]);
    offsets[i] = offset;
    prev = offset;
  }
  return offsets;
}

function buildLinearPath(
  points: { x: number; y: number }[],
  startCommand: 'M' | 'L'
): string {
  if (!points.length) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    parts.push(
      `${i === 0 ? startCommand : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
    );
  }
  return parts.join(' ');
}

function buildStepPath(
  points: { x: number; y: number }[],
  startCommand: 'M' | 'L'
): string {
  if (!points.length) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i === 0) {
      parts.push(`${startCommand} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
      continue;
    }
    const prev = points[i - 1]!;
    parts.push(
      `L ${p.x.toFixed(2)} ${prev.y.toFixed(2)} L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
    );
  }
  return parts.join(' ');
}

function buildCardinalPath(
  points: { x: number; y: number }[],
  startCommand: 'M' | 'L',
  tension: number
): string {
  if (!points.length) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `${startCommand} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  const t = Math.max(0, Math.min(1, tension));
  const k = (1 - t) / 6;
  const parts: string[] = [];
  const first = points[0]!;
  parts.push(`${startCommand} ${first.x.toFixed(2)} ${first.y.toFixed(2)}`);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? points[i + 1]!;
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    parts.push(
      `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
    );
  }
  return parts.join(' ');
}

function buildCatmullRomPath(
  points: { x: number; y: number }[],
  startCommand: 'M' | 'L'
): string {
  return buildCardinalPath(points, startCommand, 0);
}

export function buildStreamgraphCurve(
  points: { x: number; y: number }[],
  curve: ChartStreamgraphCurve,
  startCommand: 'M' | 'L',
  tension: number
): string {
  switch (curve) {
    case 'linear':
      return buildLinearPath(points, startCommand);
    case 'step':
      return buildStepPath(points, startCommand);
    case 'catmullRom':
      return buildCatmullRomPath(points, startCommand);
    case 'cardinal':
    default:
      return buildCardinalPath(points, startCommand, tension);
  }
}

export interface ComputeStreamgraphLayersInput {
  series: readonly ChartStreamgraphSeries[];
  baseline: ChartStreamgraphBaseline;
  curve: ChartStreamgraphCurve;
  tension: number;
  hidden: ReadonlySet<string>;
  innerW: number;
  innerH: number;
  padX: number;
  padY: number;
}

export interface ComputeStreamgraphLayersResult {
  layers: ChartStreamgraphLayer[];
  sampleCount: number;
  baselineValues: number[];
  totals: number[];
  yMin: number;
  yMax: number;
}

export function computeStreamgraphLayers(
  input: ComputeStreamgraphLayersInput
): ComputeStreamgraphLayersResult {
  const {
    series,
    baseline,
    curve,
    tension,
    hidden,
    innerW,
    innerH,
    padX,
    padY,
  } = input;
  if (innerW <= 0 || innerH <= 0) {
    return {
      layers: [],
      sampleCount: 0,
      baselineValues: [],
      totals: [],
      yMin: 0,
      yMax: 0,
    };
  }
  const visibleSeries: { series: ChartStreamgraphSeries; index: number }[] = [];
  for (let i = 0; i < series.length; i++) {
    const s = series[i]!;
    if (hidden.has(s.id)) continue;
    visibleSeries.push({ series: s, index: i });
  }
  const sampleCount = getStreamgraphSampleCount(
    visibleSeries.map((v) => v.series)
  );
  if (sampleCount <= 0 || !visibleSeries.length) {
    return {
      layers: [],
      sampleCount: 0,
      baselineValues: [],
      totals: [],
      yMin: 0,
      yMax: 0,
    };
  }
  const totals = getStreamgraphTotals(
    visibleSeries.map((v) => v.series),
    sampleCount
  );
  const baselineValues = computeStreamgraphBaseline(
    visibleSeries.map((v) => v.series),
    sampleCount,
    baseline
  );

  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  const cumulativeBottoms: number[] = baselineValues.slice();

  const valueByLayer: number[][] = [];
  for (let s = 0; s < visibleSeries.length; s++) {
    valueByLayer.push(new Array(sampleCount).fill(0));
  }

  for (let i = 0; i < sampleCount; i++) {
    let cur = cumulativeBottoms[i] ?? 0;
    if (baseline === 'expand') {
      const t = totals[i] ?? 0;
      if (t > 0) {
        for (let s = 0; s < visibleSeries.length; s++) {
          const raw = clampToZero(visibleSeries[s]!.series.data[i] ?? 0);
          const share = raw / t;
          valueByLayer[s]![i] = share;
        }
      }
      cumulativeBottoms[i] = 0;
      cur = 0;
    } else {
      for (let s = 0; s < visibleSeries.length; s++) {
        const raw = clampToZero(visibleSeries[s]!.series.data[i] ?? 0);
        valueByLayer[s]![i] = raw;
      }
    }
  }

  const denomMax: number[] = new Array(sampleCount).fill(0);
  if (baseline === 'expand') {
    for (let i = 0; i < sampleCount; i++) denomMax[i] = 1;
  } else {
    for (let i = 0; i < sampleCount; i++) {
      const base = baselineValues[i] ?? 0;
      const top = base + (totals[i] ?? 0);
      if (base < yMin) yMin = base;
      if (top > yMax) yMax = top;
    }
  }

  if (baseline === 'expand') {
    yMin = 0;
    yMax = 1;
  }

  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
    yMin = -1;
    yMax = 1;
  }

  const xPos = (i: number) =>
    sampleCount > 1
      ? padX + (i / (sampleCount - 1)) * innerW
      : padX + innerW / 2;
  const yPos = (v: number) =>
    padY + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const cumulative = new Array(sampleCount).fill(0);
  for (let i = 0; i < sampleCount; i++) {
    cumulative[i] = baselineValues[i] ?? 0;
    if (baseline === 'expand') cumulative[i] = 0;
  }

  const layers: ChartStreamgraphLayer[] = [];
  for (let s = 0; s < visibleSeries.length; s++) {
    const entry = visibleSeries[s]!;
    const points: ChartStreamgraphLayerPoint[] = [];
    const topPx: { x: number; y: number }[] = [];
    const bottomPx: { x: number; y: number }[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const x = xPos(i);
      const base = cumulative[i] ?? 0;
      const raw = valueByLayer[s]![i] ?? 0;
      const top = base + raw;
      const baseY = yPos(base);
      const topY = yPos(top);
      points.push({ x, baseValue: base, topValue: top, rawValue: raw });
      topPx.push({ x, y: topY });
      bottomPx.push({ x, y: baseY });
      cumulative[i] = top;
    }
    const topPath = buildStreamgraphCurve(topPx, curve, 'M', tension);
    const bottomReversed = [...bottomPx].reverse();
    const bottomPath = buildStreamgraphCurve(bottomReversed, curve, 'L', tension);
    const areaPath = `${topPath} ${bottomPath} Z`;
    const color =
      entry.series.color ?? getStreamgraphDefaultColor(entry.index);
    layers.push({
      id: entry.series.id,
      label: entry.series.label,
      index: entry.index,
      color,
      points,
      topPath,
      bottomPath,
      areaPath,
    });
  }

  return {
    layers,
    sampleCount,
    baselineValues,
    totals,
    yMin,
    yMax,
  };
}

export function describeStreamgraphChart(
  series: readonly ChartStreamgraphSeries[],
  hidden: ReadonlySet<string>,
  baseline: ChartStreamgraphBaseline,
  formatValue?: (v: number) => string
): string {
  if (!series.length) return 'No data';
  const visible = series.filter((s) => !hidden.has(s.id));
  if (!visible.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const sampleCount = getStreamgraphSampleCount(visible);
  if (sampleCount <= 0) return 'No data';
  const totals = getStreamgraphTotals(visible, sampleCount);
  let totalSum = 0;
  for (const t of totals) totalSum += t;
  let peak = 0;
  for (const t of totals) if (t > peak) peak = t;
  return `Streamgraph (${baseline}) with ${visible.length} series across ${sampleCount} samples. Total ${fmt(totalSum)}, peak total ${fmt(peak)}.`;
}

export interface ChartStreamgraphProps {
  series: readonly ChartStreamgraphSeries[];
  xLabels?: readonly (string | number)[];
  baseline?: ChartStreamgraphBaseline;
  curve?: ChartStreamgraphCurve;
  tension?: number;
  width?: number;
  height?: number;
  padding?: number;
  fillOpacity?: number;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showLegend?: boolean;
  showTooltip?: boolean;
  showXAxis?: boolean;
  showXLabels?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatXLabel?: (label: string | number, index: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onLayerClick?: (args: {
    series: ChartStreamgraphSeries;
    layer: ChartStreamgraphLayer;
  }) => void;
  onSeriesToggle?: (args: {
    series: ChartStreamgraphSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isControlled<T>(prop: T | undefined): prop is T {
  return prop !== undefined;
}

function defaultFormatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000 || (Math.abs(v) > 0 && Math.abs(v) < 0.01)) {
    return v.toPrecision(3);
  }
  return String(Math.round(v * 100) / 100);
}

const ChartStreamgraphInner = (
  {
    series,
    xLabels,
    baseline = DEFAULT_CHART_STREAMGRAPH_BASELINE,
    curve = DEFAULT_CHART_STREAMGRAPH_CURVE,
    tension = DEFAULT_CHART_STREAMGRAPH_TENSION,
    width = DEFAULT_CHART_STREAMGRAPH_WIDTH,
    height = DEFAULT_CHART_STREAMGRAPH_HEIGHT,
    padding = DEFAULT_CHART_STREAMGRAPH_PADDING,
    fillOpacity = DEFAULT_CHART_STREAMGRAPH_FILL_OPACITY,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showLegend = true,
    showTooltip = true,
    showXAxis = true,
    showXLabels = true,
    animate = true,
    className,
    ariaLabel = 'Streamgraph',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatXLabel,
    legendPlacement = 'bottom',
    onLayerClick,
    onSeriesToggle,
    style,
  }: ChartStreamgraphProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-streamgraph-desc-${reactId}`;
  const [internalHidden, setInternalHidden] = useState<Set<string>>(
    () => new Set(defaultHiddenSeries ?? [])
  );
  const hiddenSet = useMemo(
    () =>
      isControlled(hiddenSeries) ? new Set(hiddenSeries) : internalHidden,
    [hiddenSeries, internalHidden]
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const result = useMemo(
    () =>
      computeStreamgraphLayers({
        series,
        baseline,
        curve,
        tension,
        hidden: hiddenSet,
        innerW,
        innerH,
        padX: padding,
        padY: padding,
      }),
    [series, baseline, curve, tension, hiddenSet, innerW, innerH, padding]
  );

  const xLabelText = (i: number): string => {
    const raw = xLabels?.[i];
    if (formatXLabel)
      return formatXLabel(raw ?? i, i);
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    return String(i);
  };

  const autoDescription = useMemo(
    () => describeStreamgraphChart(series, hiddenSet, baseline, formatValue),
    [series, hiddenSet, baseline, formatValue]
  );

  const toggleSeries = (s: ChartStreamgraphSeries) => {
    const next = new Set(hiddenSet);
    const willHide = !next.has(s.id);
    if (willHide) next.add(s.id);
    else next.delete(s.id);
    if (!isControlled(hiddenSeries)) setInternalHidden(next);
    onHiddenSeriesChange?.(Array.from(next));
    onSeriesToggle?.({ series: s, hidden: willHide });
  };

  const showRightLegend = showLegend && legendPlacement === 'right';
  const showBottomLegend = showLegend && legendPlacement === 'bottom';

  const labelIndices = useMemo(() => {
    if (!result.sampleCount) return [];
    if (result.sampleCount <= 8) {
      return Array.from({ length: result.sampleCount }, (_, i) => i);
    }
    const indices: number[] = [];
    const step = Math.max(1, Math.floor(result.sampleCount / 7));
    for (let i = 0; i < result.sampleCount; i += step) indices.push(i);
    if (indices[indices.length - 1] !== result.sampleCount - 1) {
      indices.push(result.sampleCount - 1);
    }
    return indices;
  }, [result.sampleCount]);

  return (
    <div
      ref={ref}
      data-section="chart-streamgraph"
      data-series-count={series.length}
      data-visible-count={result.layers.length}
      data-sample-count={result.sampleCount}
      data-baseline={baseline}
      data-curve={curve}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-streamgraph flex',
        showRightLegend ? 'flex-row items-start gap-4' : 'flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-streamgraph-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-streamgraph-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-streamgraph-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-streamgraph-layers">
            {result.layers.map((layer) => {
              const isHovered = hoveredId === layer.id;
              const dim = hoveredId != null && !isHovered ? 0.3 : 1;
              return (
                <g
                  key={layer.id}
                  data-section="chart-streamgraph-layer"
                  data-series-id={layer.id}
                  data-series-index={layer.index}
                  data-series-color={layer.color}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(layer.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === layer.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(layer.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === layer.id ? null : cur))
                  }
                  onClick={() => {
                    const s = series[layer.index];
                    if (s) onLayerClick?.({ series: s, layer });
                  }}
                  style={{ opacity: dim }}
                >
                  <path
                    data-section="chart-streamgraph-area"
                    d={layer.areaPath}
                    fill={layer.color}
                    fillOpacity={fillOpacity}
                    stroke={layer.color}
                    strokeWidth={1}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${layer.label} stream layer`}
                  />
                </g>
              );
            })}
          </g>
          {showXAxis && (
            <line
              data-section="chart-streamgraph-x-axis"
              x1={padding}
              x2={padding + innerW}
              y1={padding + innerH}
              y2={padding + innerH}
              stroke="rgb(148 163 184)"
              strokeWidth={1}
            />
          )}
          {showXLabels && labelIndices.length > 0 && (
            <g data-section="chart-streamgraph-x-labels">
              {labelIndices.map((i) => {
                const x =
                  result.sampleCount > 1
                    ? padding + (i / (result.sampleCount - 1)) * innerW
                    : padding + innerW / 2;
                return (
                  <text
                    key={`xl-${i}`}
                    data-section="chart-streamgraph-x-label"
                    data-sample-index={i}
                    x={x}
                    y={padding + innerH + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="rgb(100 116 139)"
                  >
                    {xLabelText(i)}
                  </text>
                );
              })}
            </g>
          )}
        </svg>
        {showTooltip && hoveredId && (
          (() => {
            const layer = result.layers.find((l) => l.id === hoveredId);
            if (!layer) return null;
            let total = 0;
            for (const p of layer.points) total += p.rawValue;
            return (
              <div
                data-section="chart-streamgraph-tooltip"
                className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              >
                <div
                  data-section="chart-streamgraph-tooltip-label"
                  className="font-semibold"
                >
                  {layer.label}
                </div>
                <div
                  data-section="chart-streamgraph-tooltip-total"
                  className="font-mono text-slate-700"
                >
                  total: {formatValue(total)}
                </div>
                <div
                  data-section="chart-streamgraph-tooltip-samples"
                  className="font-mono text-slate-500"
                >
                  samples: {layer.points.length}
                </div>
              </div>
            );
          })()
        )}
      </div>
      {showBottomLegend && (
        <ul
          data-section="chart-streamgraph-legend"
          data-placement="bottom"
          className="flex flex-wrap gap-2 text-xs"
        >
          {series.map((s, idx) => {
            const color = s.color ?? getStreamgraphDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-streamgraph-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-streamgraph-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${s.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-streamgraph-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-streamgraph-legend-label"
                    className="text-slate-700"
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showRightLegend && (
        <ul
          data-section="chart-streamgraph-legend"
          data-placement="right"
          className="flex flex-col gap-1 text-xs"
        >
          {series.map((s, idx) => {
            const color = s.color ?? getStreamgraphDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-streamgraph-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-streamgraph-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${s.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-streamgraph-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-streamgraph-legend-label"
                    className="text-slate-700"
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const ChartStreamgraph = forwardRef<
  HTMLDivElement,
  ChartStreamgraphProps
>(ChartStreamgraphInner);
ChartStreamgraph.displayName = 'ChartStreamgraph';
