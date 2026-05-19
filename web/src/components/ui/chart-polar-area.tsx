import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_POLAR_AREA_WIDTH = 360;
export const DEFAULT_CHART_POLAR_AREA_HEIGHT = 360;
export const DEFAULT_CHART_POLAR_AREA_PADDING = 32;
export const DEFAULT_CHART_POLAR_AREA_START_ANGLE = -Math.PI / 2;
export const DEFAULT_CHART_POLAR_AREA_PAD_ANGLE = 0;
export const DEFAULT_CHART_POLAR_AREA_TICK_COUNT = 4;
export const DEFAULT_CHART_POLAR_AREA_RADIUS_MODE = 'sqrt';
export const DEFAULT_CHART_POLAR_AREA_FILL_OPACITY = 0.7;
export const DEFAULT_CHART_POLAR_AREA_PALETTE = [
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

export type ChartPolarAreaRadiusMode = 'sqrt' | 'linear';

export interface ChartPolarAreaWedge {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartPolarAreaLayoutWedge {
  id: string;
  label: string;
  index: number;
  value: number;
  color: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  outerRadius: number;
  ratio: number;
  path: string;
  midLabelX: number;
  midLabelY: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getPolarAreaDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_POLAR_AREA_PALETTE[0]!;
  }
  return DEFAULT_CHART_POLAR_AREA_PALETTE[
    Math.floor(index) % DEFAULT_CHART_POLAR_AREA_PALETTE.length
  ]!;
}

export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angle: number
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function getPolarAreaMaxValue(
  wedges: readonly ChartPolarAreaWedge[]
): number {
  let max = 0;
  for (const w of wedges) {
    if (!isFiniteNumber(w.value)) continue;
    if (w.value > max) max = w.value;
  }
  return max;
}

export function getPolarAreaRadius(
  value: number,
  maxValue: number,
  outerRadius: number,
  mode: ChartPolarAreaRadiusMode
): number {
  if (!isFiniteNumber(value) || value <= 0) return 0;
  if (!isFiniteNumber(maxValue) || maxValue <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, value / maxValue));
  if (mode === 'linear') return outerRadius * ratio;
  return outerRadius * Math.sqrt(ratio);
}

function buildWedgePath(
  cx: number,
  cy: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  if (outerRadius <= 0) return '';
  const span = endAngle - startAngle;
  if (!Number.isFinite(span) || span <= 0) return '';
  if (span >= Math.PI * 2 - 1e-9) {
    const top = polarToCartesian(cx, cy, outerRadius, 0);
    const bottom = polarToCartesian(cx, cy, outerRadius, Math.PI);
    return [
      `M ${top.x} ${top.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${bottom.x} ${bottom.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${top.x} ${top.y}`,
      'Z',
    ].join(' ');
  }
  const largeArc = span > Math.PI ? 1 : 0;
  const startPt = polarToCartesian(cx, cy, outerRadius, startAngle);
  const endPt = polarToCartesian(cx, cy, outerRadius, endAngle);
  return [
    `M ${cx} ${cy}`,
    `L ${startPt.x} ${startPt.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`,
    'Z',
  ].join(' ');
}

export interface ComputePolarAreaLayoutInput {
  wedges: readonly ChartPolarAreaWedge[];
  hidden: ReadonlySet<string>;
  cx: number;
  cy: number;
  outerRadius: number;
  startAngle: number;
  padAngle: number;
  radiusMode: ChartPolarAreaRadiusMode;
  maxValueOverride?: number;
}

export interface ComputePolarAreaLayoutResult {
  wedges: ChartPolarAreaLayoutWedge[];
  maxValue: number;
}

export function computePolarAreaLayout(
  input: ComputePolarAreaLayoutInput
): ComputePolarAreaLayoutResult {
  const {
    wedges,
    hidden,
    cx,
    cy,
    outerRadius,
    startAngle,
    padAngle,
    radiusMode,
    maxValueOverride,
  } = input;
  if (outerRadius <= 0 || !wedges.length) {
    return { wedges: [], maxValue: 0 };
  }
  const visible: { wedge: ChartPolarAreaWedge; index: number }[] = [];
  for (let i = 0; i < wedges.length; i++) {
    const w = wedges[i]!;
    if (hidden.has(w.id)) continue;
    visible.push({ wedge: w, index: i });
  }
  if (!visible.length) {
    return { wedges: [], maxValue: 0 };
  }
  const autoMax = getPolarAreaMaxValue(visible.map((v) => v.wedge));
  const maxValue =
    isFiniteNumber(maxValueOverride) && maxValueOverride > 0
      ? maxValueOverride
      : autoMax;
  if (maxValue <= 0) {
    return { wedges: [], maxValue: 0 };
  }
  const n = visible.length;
  const angularSpan = Math.PI * 2;
  const totalPad = Math.max(0, padAngle) * n;
  const wedgeSpan = Math.max(0, (angularSpan - totalPad) / n);
  const out: ChartPolarAreaLayoutWedge[] = [];
  for (let s = 0; s < visible.length; s++) {
    const entry = visible[s]!;
    const wStart = startAngle + s * (wedgeSpan + padAngle);
    const wEnd = wStart + wedgeSpan;
    const ratio = Math.max(
      0,
      Math.min(1, isFiniteNumber(entry.wedge.value) && maxValue > 0
        ? entry.wedge.value / maxValue
        : 0)
    );
    const radius = getPolarAreaRadius(
      entry.wedge.value,
      maxValue,
      outerRadius,
      radiusMode
    );
    const mid = (wStart + wEnd) / 2;
    const midPt = polarToCartesian(cx, cy, radius * 0.65, mid);
    const path = buildWedgePath(cx, cy, radius, wStart, wEnd);
    const color =
      entry.wedge.color ?? getPolarAreaDefaultColor(entry.index);
    out.push({
      id: entry.wedge.id,
      label: entry.wedge.label,
      index: entry.index,
      value: isFiniteNumber(entry.wedge.value) ? entry.wedge.value : 0,
      color,
      startAngle: wStart,
      endAngle: wEnd,
      midAngle: mid,
      outerRadius: radius,
      ratio,
      path,
      midLabelX: midPt.x,
      midLabelY: midPt.y,
    });
  }
  return { wedges: out, maxValue };
}

export function getPolarAreaTicks(
  max: number,
  count: number = DEFAULT_CHART_POLAR_AREA_TICK_COUNT
): number[] {
  const c = Math.max(2, Math.floor(count) || 0);
  if (!isFiniteNumber(max) || max <= 0) return [0];
  const step = max / (c - 1);
  return Array.from({ length: c }, (_, i) => step * i);
}

export function describePolarAreaChart(
  wedges: readonly ChartPolarAreaWedge[],
  hidden: ReadonlySet<string>,
  radiusMode: ChartPolarAreaRadiusMode,
  formatValue?: (v: number) => string
): string {
  if (!wedges.length) return 'No data';
  const visible: { label: string; value: number }[] = [];
  for (const w of wedges) {
    if (hidden.has(w.id)) continue;
    if (!isFiniteNumber(w.value)) continue;
    visible.push({ label: w.label, value: w.value });
  }
  if (!visible.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const max = visible.reduce(
    (acc, v) => (v.value > acc ? v.value : acc),
    0
  );
  return `Polar area chart (${radiusMode} radius) with ${visible.length} wedges, peak value ${fmt(max)}.`;
}

export interface ChartPolarAreaProps {
  wedges: readonly ChartPolarAreaWedge[];
  width?: number;
  height?: number;
  padding?: number;
  startAngle?: number;
  padAngle?: number;
  radiusMode?: ChartPolarAreaRadiusMode;
  maxValue?: number;
  tickCount?: number;
  fillOpacity?: number;
  hiddenWedges?: readonly string[];
  defaultHiddenWedges?: readonly string[];
  onHiddenWedgesChange?: (hidden: string[]) => void;
  showLegend?: boolean;
  showTooltip?: boolean;
  showAxisRings?: boolean;
  showAxisLabels?: boolean;
  showWedgeLabels?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onWedgeClick?: (args: {
    wedge: ChartPolarAreaWedge;
    layout: ChartPolarAreaLayoutWedge;
  }) => void;
  onWedgeToggle?: (args: {
    wedge: ChartPolarAreaWedge;
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

const ChartPolarAreaInner = (
  {
    wedges,
    width = DEFAULT_CHART_POLAR_AREA_WIDTH,
    height = DEFAULT_CHART_POLAR_AREA_HEIGHT,
    padding = DEFAULT_CHART_POLAR_AREA_PADDING,
    startAngle = DEFAULT_CHART_POLAR_AREA_START_ANGLE,
    padAngle = DEFAULT_CHART_POLAR_AREA_PAD_ANGLE,
    radiusMode = DEFAULT_CHART_POLAR_AREA_RADIUS_MODE,
    maxValue,
    tickCount = DEFAULT_CHART_POLAR_AREA_TICK_COUNT,
    fillOpacity = DEFAULT_CHART_POLAR_AREA_FILL_OPACITY,
    hiddenWedges,
    defaultHiddenWedges,
    onHiddenWedgesChange,
    showLegend = true,
    showTooltip = true,
    showAxisRings = true,
    showAxisLabels = true,
    showWedgeLabels = false,
    animate = true,
    className,
    ariaLabel = 'Polar area chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    legendPlacement = 'bottom',
    onWedgeClick,
    onWedgeToggle,
    style,
  }: ChartPolarAreaProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-polar-area-desc-${reactId}`;
  const [internalHidden, setInternalHidden] = useState<Set<string>>(
    () => new Set(defaultHiddenWedges ?? [])
  );
  const hiddenSet = useMemo(
    () =>
      isControlled(hiddenWedges) ? new Set(hiddenWedges) : internalHidden,
    [hiddenWedges, internalHidden]
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const outerRadius = Math.max(0, Math.min(innerW, innerH) / 2);
  const cx = padding + innerW / 2;
  const cy = padding + innerH / 2;

  const result = useMemo(
    () =>
      computePolarAreaLayout({
        wedges,
        hidden: hiddenSet,
        cx,
        cy,
        outerRadius,
        startAngle,
        padAngle,
        radiusMode,
        ...(isFiniteNumber(maxValue) ? { maxValueOverride: maxValue } : {}),
      }),
    [
      wedges,
      hiddenSet,
      cx,
      cy,
      outerRadius,
      startAngle,
      padAngle,
      radiusMode,
      maxValue,
    ]
  );

  const ticks = useMemo(
    () => getPolarAreaTicks(result.maxValue, tickCount),
    [result.maxValue, tickCount]
  );

  const autoDescription = useMemo(
    () => describePolarAreaChart(wedges, hiddenSet, radiusMode, formatValue),
    [wedges, hiddenSet, radiusMode, formatValue]
  );

  const toggleWedge = (w: ChartPolarAreaWedge) => {
    const next = new Set(hiddenSet);
    const willHide = !next.has(w.id);
    if (willHide) next.add(w.id);
    else next.delete(w.id);
    if (!isControlled(hiddenWedges)) setInternalHidden(next);
    onHiddenWedgesChange?.(Array.from(next));
    onWedgeToggle?.({ wedge: w, hidden: willHide });
  };

  const hovered = useMemo(
    () => result.wedges.find((w) => w.id === hoveredId) ?? null,
    [result.wedges, hoveredId]
  );

  const showRightLegend = showLegend && legendPlacement === 'right';
  const showBottomLegend = showLegend && legendPlacement === 'bottom';

  return (
    <div
      ref={ref}
      data-section="chart-polar-area"
      data-wedge-count={wedges.length}
      data-visible-count={result.wedges.length}
      data-max-value={result.maxValue}
      data-radius-mode={radiusMode}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-polar-area flex',
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
        data-section="chart-polar-area-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-polar-area-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-polar-area-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showAxisRings && (
            <g data-section="chart-polar-area-rings" pointerEvents="none">
              {ticks.map((t, i) => {
                const r = getPolarAreaRadius(
                  t,
                  result.maxValue,
                  outerRadius,
                  radiusMode
                );
                if (r <= 0) return null;
                return (
                  <circle
                    key={`ring-${i}`}
                    data-section="chart-polar-area-ring"
                    data-tick-value={t}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="rgb(226 232 240)"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          )}
          <g data-section="chart-polar-area-wedges">
            {result.wedges.map((w) => {
              const isHovered = hoveredId === w.id;
              const dim = hoveredId != null && !isHovered ? 0.3 : 1;
              return (
                <g
                  key={w.id}
                  data-section="chart-polar-area-wedge"
                  data-wedge-id={w.id}
                  data-wedge-index={w.index}
                  data-wedge-value={w.value}
                  data-wedge-ratio={w.ratio}
                  data-wedge-color={w.color}
                  data-wedge-radius={w.outerRadius}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(w.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === w.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(w.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === w.id ? null : cur))
                  }
                  onClick={() => {
                    const orig = wedges[w.index];
                    if (orig) onWedgeClick?.({ wedge: orig, layout: w });
                  }}
                  style={{ opacity: dim }}
                >
                  {w.path && (
                    <path
                      data-section="chart-polar-area-path"
                      d={w.path}
                      fill={w.color}
                      fillOpacity={fillOpacity}
                      stroke={w.color}
                      strokeWidth={1}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${w.label}: ${formatValue(w.value)}`}
                    />
                  )}
                  {showWedgeLabels && w.outerRadius > 8 && (
                    <text
                      data-section="chart-polar-area-wedge-label"
                      x={w.midLabelX}
                      y={w.midLabelY + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={500}
                      fill="rgb(255 255 255)"
                      pointerEvents="none"
                    >
                      {formatValue(w.value)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          {showAxisLabels && (
            <g data-section="chart-polar-area-axis-labels" pointerEvents="none">
              {ticks.map((t, i) => {
                if (i === 0) return null;
                const r = getPolarAreaRadius(
                  t,
                  result.maxValue,
                  outerRadius,
                  radiusMode
                );
                if (r <= 0) return null;
                return (
                  <text
                    key={`al-${i}`}
                    data-section="chart-polar-area-axis-label"
                    data-tick-value={t}
                    x={cx + 2}
                    y={cy - r + 4}
                    textAnchor="start"
                    fontSize={9}
                    fill="rgb(100 116 139)"
                  >
                    {formatValue(t)}
                  </text>
                );
              })}
            </g>
          )}
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-polar-area-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-polar-area-tooltip-label"
              className="font-semibold"
            >
              {hovered.label}
            </div>
            <div
              data-section="chart-polar-area-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.value)}
            </div>
            <div
              data-section="chart-polar-area-tooltip-ratio"
              className="font-mono text-slate-500"
            >
              ratio: {Math.round(hovered.ratio * 100)}%
            </div>
          </div>
        )}
      </div>
      {showBottomLegend && (
        <ul
          data-section="chart-polar-area-legend"
          data-placement="bottom"
          className="flex flex-wrap gap-2 text-xs"
        >
          {wedges.map((w, idx) => {
            const color = w.color ?? getPolarAreaDefaultColor(idx);
            const isHidden = hiddenSet.has(w.id);
            return (
              <li
                key={w.id}
                data-section="chart-polar-area-legend-item"
                data-wedge-id={w.id}
                data-wedge-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-polar-area-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${w.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleWedge(w)}
                >
                  <span
                    data-section="chart-polar-area-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-polar-area-legend-label"
                    className="text-slate-700"
                  >
                    {w.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showRightLegend && (
        <ul
          data-section="chart-polar-area-legend"
          data-placement="right"
          className="flex flex-col gap-1 text-xs"
        >
          {wedges.map((w, idx) => {
            const color = w.color ?? getPolarAreaDefaultColor(idx);
            const isHidden = hiddenSet.has(w.id);
            return (
              <li
                key={w.id}
                data-section="chart-polar-area-legend-item"
                data-wedge-id={w.id}
                data-wedge-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-polar-area-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${w.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleWedge(w)}
                >
                  <span
                    data-section="chart-polar-area-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-polar-area-legend-label"
                    className="text-slate-700"
                  >
                    {w.label}
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

export const ChartPolarArea = forwardRef<HTMLDivElement, ChartPolarAreaProps>(
  ChartPolarAreaInner
);
ChartPolarArea.displayName = 'ChartPolarArea';
