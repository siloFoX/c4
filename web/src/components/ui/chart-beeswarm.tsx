import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_BEESWARM_WIDTH = 560;
export const DEFAULT_CHART_BEESWARM_HEIGHT = 320;
export const DEFAULT_CHART_BEESWARM_PADDING = 40;
export const DEFAULT_CHART_BEESWARM_LANE_GAP = 16;
export const DEFAULT_CHART_BEESWARM_TICK_COUNT = 5;
export const DEFAULT_CHART_BEESWARM_RADIUS = 3;
export const DEFAULT_CHART_BEESWARM_GAP = 1;
export const DEFAULT_CHART_BEESWARM_OPACITY = 0.85;
export const DEFAULT_CHART_BEESWARM_STROKE_WIDTH = 1;
export const DEFAULT_CHART_BEESWARM_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_BEESWARM_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_BEESWARM_ORIENTATION = 'horizontal';
export const DEFAULT_CHART_BEESWARM_PALETTE = [
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

export type ChartBeeswarmOrientation = 'horizontal' | 'vertical';

export interface ChartBeeswarmGroup {
  id: string;
  label: string;
  values: readonly number[];
  color?: string;
}

export interface ChartBeeswarmLayoutPoint {
  index: number;
  value: number;
  along: number;
  across: number;
  x: number;
  y: number;
}

export interface ChartBeeswarmLayoutGroup {
  id: string;
  label: string;
  index: number;
  color: string;
  laneCenter: number;
  laneStart: number;
  laneEnd: number;
  points: ChartBeeswarmLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  swarmExtent: number;
}

export interface ComputeBeeswarmLayoutResult {
  groups: ChartBeeswarmLayoutGroup[];
  ticks: { value: number; position: number }[];
  valueMin: number;
  valueMax: number;
  orientation: ChartBeeswarmOrientation;
  innerWidth: number;
  innerHeight: number;
  laneHeight: number;
  radius: number;
  gap: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getBeeswarmDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_BEESWARM_PALETTE[0]!;
  }
  return DEFAULT_CHART_BEESWARM_PALETTE[
    Math.floor(index) % DEFAULT_CHART_BEESWARM_PALETTE.length
  ]!;
}

export function getBeeswarmFiniteValues(values: readonly number[]): number[] {
  if (!Array.isArray(values)) return [];
  const out: number[] = [];
  for (const v of values) if (isFiniteNumber(v)) out.push(v);
  return out;
}

export function getBeeswarmBounds(
  groups: readonly ChartBeeswarmGroup[],
  hidden?: readonly string[],
): { min: number; max: number } {
  const hiddenSet = new Set(hidden ?? []);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const g of groups) {
    if (!g || typeof g.id !== 'string') continue;
    if (hiddenSet.has(g.id)) continue;
    for (const v of getBeeswarmFiniteValues(g.values ?? [])) {
      if (v < min) min = v;
      if (v > max) max = v;
      any = true;
    }
  }
  if (!any) return { min: 0, max: 1 };
  if (min === max) {
    return { min: min - 0.5, max: max + 0.5 };
  }
  return { min, max };
}

export function getBeeswarmTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(2, Math.floor(count ?? DEFAULT_CHART_BEESWARM_TICK_COUNT));
  if (min === max) return [{ value: min, position: 0 }];
  const step = (max - min) / (n - 1);
  const out: { value: number; position: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const value = min + step * i;
    const position = (value - min) / (max - min);
    out.push({ value, position });
  }
  return out;
}

export interface BeeswarmPackInput {
  index: number;
  value: number;
  along: number;
}

export interface BeeswarmPackOutput {
  index: number;
  value: number;
  along: number;
  across: number;
}

/**
 * Force-directed non-overlapping packing along a single axis.
 *
 * Each input point has a fixed `along` coordinate (the value axis position).
 * We greedily place points sorted by `along`. For each new point, candidate
 * `across` positions are: `laneCenter` plus, for every already-placed point
 * whose along distance is < spacing, the two y values that put the new point
 * exactly on the edge of the placed point's collision disk. We pick the
 * candidate closest to `laneCenter` that does not collide with any placed
 * point (D3 / Sergio Pegoraro algorithm). Result is deterministic and
 * symmetric around the lane center.
 *
 * `spacing` is the minimum allowed center-to-center distance, i.e.
 * `2 * radius + gap`.
 */
export function packBeeswarmGroup(
  items: readonly BeeswarmPackInput[],
  laneCenter: number,
  radius: number,
  gap: number,
): BeeswarmPackOutput[] {
  const spacing = Math.max(0, 2 * radius + gap);
  if (spacing <= 0) {
    return items.map((it) => ({
      index: it.index,
      value: it.value,
      along: it.along,
      across: laneCenter,
    }));
  }
  const sp2 = spacing * spacing;
  const eps = 1e-9;
  const sorted = items
    .map((it) => ({ ...it }))
    .sort((a, b) => a.along - b.along || a.index - b.index);
  const placed: BeeswarmPackOutput[] = [];
  for (const it of sorted) {
    const candidates: number[] = [laneCenter];
    for (const p of placed) {
      const dx = it.along - p.along;
      if (Math.abs(dx) < spacing) {
        const dy = Math.sqrt(sp2 - dx * dx);
        candidates.push(p.across + dy, p.across - dy);
      }
    }
    candidates.sort(
      (a, b) => Math.abs(a - laneCenter) - Math.abs(b - laneCenter),
    );
    let chosen = laneCenter;
    for (const c of candidates) {
      let ok = true;
      for (const p of placed) {
        const dx = it.along - p.along;
        const dy = c - p.across;
        if (dx * dx + dy * dy < sp2 - eps) {
          ok = false;
          break;
        }
      }
      if (ok) {
        chosen = c;
        break;
      }
    }
    placed.push({
      index: it.index,
      value: it.value,
      along: it.along,
      across: chosen,
    });
  }
  placed.sort((a, b) => a.index - b.index);
  return placed;
}

export interface ComputeBeeswarmLayoutInput {
  groups: readonly ChartBeeswarmGroup[];
  hidden?: readonly string[];
  orientation?: ChartBeeswarmOrientation;
  radius?: number;
  gap?: number;
  valueMin?: number;
  valueMax?: number;
  width: number;
  height: number;
  padding: number;
  laneGap?: number;
  tickCount?: number;
}

export function computeBeeswarmLayout(
  input: ComputeBeeswarmLayoutInput,
): ComputeBeeswarmLayoutResult {
  const orientation: ChartBeeswarmOrientation =
    input.orientation ?? DEFAULT_CHART_BEESWARM_ORIENTATION;
  const radius = Math.max(0, input.radius ?? DEFAULT_CHART_BEESWARM_RADIUS);
  const gap = Math.max(0, input.gap ?? DEFAULT_CHART_BEESWARM_GAP);
  const padding = Math.max(0, input.padding);
  const laneGap = Math.max(
    0,
    input.laneGap ?? DEFAULT_CHART_BEESWARM_LANE_GAP,
  );
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeBeeswarmLayoutResult = {
    groups: [],
    ticks: [],
    valueMin: 0,
    valueMax: 1,
    orientation,
    innerWidth,
    innerHeight,
    laneHeight: 0,
    radius,
    gap,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.groups || input.groups.length === 0) return empty;

  const hiddenSet = new Set(input.hidden ?? []);
  const visible = input.groups.filter(
    (g) => g && typeof g.id === 'string' && !hiddenSet.has(g.id),
  );
  if (visible.length === 0) return empty;

  const bounds = getBeeswarmBounds(input.groups, input.hidden);
  let vMin = isFiniteNumber(input.valueMin) ? input.valueMin : bounds.min;
  let vMax = isFiniteNumber(input.valueMax) ? input.valueMax : bounds.max;
  if (vMax < vMin) [vMin, vMax] = [vMax, vMin];
  if (vMin === vMax) {
    vMin -= 0.5;
    vMax += 0.5;
  }
  const range = vMax - vMin;

  const laneAxisLength = orientation === 'horizontal' ? innerHeight : innerWidth;
  const laneCount = visible.length;
  const totalGap = laneGap * Math.max(0, laneCount - 1);
  const laneHeight = Math.max(
    0,
    (laneAxisLength - totalGap) / Math.max(1, laneCount),
  );

  const indexById = new Map(input.groups.map((g, i) => [g.id, i]));
  const groupsOut: ChartBeeswarmLayoutGroup[] = visible.map((g, laneIndex) => {
    const groupIndex = indexById.get(g.id) ?? laneIndex;
    const color = g.color ?? getBeeswarmDefaultColor(groupIndex);
    const laneStart = padding + laneIndex * (laneHeight + laneGap);
    const laneEnd = laneStart + laneHeight;
    const laneCenter = laneStart + laneHeight / 2;
    const valuesArr = Array.isArray(g.values) ? g.values : [];

    const inputs: BeeswarmPackInput[] = [];
    let finiteCount = 0;
    for (let i = 0; i < valuesArr.length; i += 1) {
      const value = valuesArr[i]!;
      if (!isFiniteNumber(value)) continue;
      finiteCount += 1;
      const clamped = value < vMin ? vMin : value > vMax ? vMax : value;
      const pos = range === 0 ? 0.5 : (clamped - vMin) / range;
      const along =
        orientation === 'horizontal'
          ? padding + pos * innerWidth
          : padding + innerHeight - pos * innerHeight;
      inputs.push({ index: i, value, along });
    }

    const packed = packBeeswarmGroup(inputs, laneCenter, radius, gap);
    let swarmExtent = 0;
    const points: ChartBeeswarmLayoutPoint[] = packed.map((p) => {
      const dist = Math.abs(p.across - laneCenter);
      if (dist > swarmExtent) swarmExtent = dist;
      const isH = orientation === 'horizontal';
      const x = isH ? p.along : p.across;
      const y = isH ? p.across : p.along;
      return {
        index: p.index,
        value: p.value,
        along: p.along,
        across: p.across,
        x,
        y,
      };
    });

    return {
      id: g.id,
      label: g.label,
      index: groupIndex,
      color,
      laneCenter,
      laneStart,
      laneEnd,
      points,
      finiteCount,
      totalCount: valuesArr.length,
      swarmExtent,
    };
  });

  const tickCountAttempt =
    input.tickCount ?? DEFAULT_CHART_BEESWARM_TICK_COUNT;
  const ticks = getBeeswarmTicks(vMin, vMax, tickCountAttempt).map((t) => ({
    value: t.value,
    position:
      orientation === 'horizontal'
        ? padding + t.position * innerWidth
        : padding + innerHeight - t.position * innerHeight,
  }));

  return {
    groups: groupsOut,
    ticks,
    valueMin: vMin,
    valueMax: vMax,
    orientation,
    innerWidth,
    innerHeight,
    laneHeight,
    radius,
    gap,
  };
}

export function describeBeeswarmChart(
  groups: readonly ChartBeeswarmGroup[],
  hidden?: readonly string[],
  formatValue?: (n: number) => string,
): string {
  const hiddenSet = new Set(hidden ?? []);
  const visible = (groups ?? []).filter(
    (g) => g && typeof g.id === 'string' && !hiddenSet.has(g.id),
  );
  if (visible.length === 0) return 'No data';
  const allFinite: number[] = [];
  for (const g of visible) {
    for (const v of getBeeswarmFiniteValues(g.values ?? [])) allFinite.push(v);
  }
  if (allFinite.length === 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const min = Math.min(...allFinite);
  const max = Math.max(...allFinite);
  return `Beeswarm plot of ${allFinite.length} values across ${visible.length} group${visible.length === 1 ? '' : 's'}, range ${fmt(min)} to ${fmt(max)}.`;
}

export interface ChartBeeswarmPointClick {
  group: ChartBeeswarmLayoutGroup;
  point: ChartBeeswarmLayoutPoint;
}

export interface ChartBeeswarmGroupToggle {
  group: ChartBeeswarmGroup;
  hidden: boolean;
}

export interface ChartBeeswarmProps {
  groups: readonly ChartBeeswarmGroup[];
  orientation?: ChartBeeswarmOrientation;
  radius?: number;
  gap?: number;
  valueMin?: number;
  valueMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  laneGap?: number;
  tickCount?: number;
  markOpacity?: number;
  strokeWidth?: number;
  gridColor?: string;
  axisColor?: string;
  hiddenGroups?: readonly string[];
  defaultHiddenGroups?: readonly string[];
  onHiddenGroupsChange?: (hidden: string[]) => void;
  showAxis?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  showLaneLabels?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatGroup?: (group: ChartBeeswarmGroup) => string;
  valueLabel?: string;
  onPointClick?: (info: ChartBeeswarmPointClick) => void;
  onGroupToggle?: (info: ChartBeeswarmGroupToggle) => void;
  style?: CSSProperties;
}

export const ChartBeeswarm = forwardRef(function ChartBeeswarm(
  {
    groups,
    orientation = DEFAULT_CHART_BEESWARM_ORIENTATION,
    radius = DEFAULT_CHART_BEESWARM_RADIUS,
    gap = DEFAULT_CHART_BEESWARM_GAP,
    valueMin,
    valueMax,
    width = DEFAULT_CHART_BEESWARM_WIDTH,
    height = DEFAULT_CHART_BEESWARM_HEIGHT,
    padding = DEFAULT_CHART_BEESWARM_PADDING,
    laneGap = DEFAULT_CHART_BEESWARM_LANE_GAP,
    tickCount = DEFAULT_CHART_BEESWARM_TICK_COUNT,
    markOpacity = DEFAULT_CHART_BEESWARM_OPACITY,
    strokeWidth = DEFAULT_CHART_BEESWARM_STROKE_WIDTH,
    gridColor = DEFAULT_CHART_BEESWARM_GRID_COLOR,
    axisColor = DEFAULT_CHART_BEESWARM_AXIS_COLOR,
    hiddenGroups,
    defaultHiddenGroups,
    onHiddenGroupsChange,
    showAxis = true,
    showGrid = true,
    showLegend = true,
    showLaneLabels = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Beeswarm plot',
    ariaDescription,
    formatValue,
    formatGroup,
    valueLabel,
    onPointClick,
    onGroupToggle,
    style,
  }: ChartBeeswarmProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const fmtValue = useCallback(
    (n: number) => (formatValue ? formatValue(n) : String(n)),
    [formatValue],
  );
  const fmtGroup = useCallback(
    (g: ChartBeeswarmGroup) => (formatGroup ? formatGroup(g) : g.label),
    [formatGroup],
  );

  const [internalHidden, setInternalHidden] = useState<string[]>(
    Array.from(defaultHiddenGroups ?? []),
  );
  const controlledHidden = hiddenGroups !== undefined;
  const effectiveHidden = controlledHidden
    ? Array.from(hiddenGroups ?? [])
    : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeBeeswarmLayout({
        groups,
        hidden: effectiveHidden,
        orientation,
        radius,
        gap,
        ...(valueMin !== undefined ? { valueMin } : {}),
        ...(valueMax !== undefined ? { valueMax } : {}),
        width,
        height,
        padding,
        laneGap,
        tickCount,
      }),
    [
      groups,
      effectiveHidden,
      orientation,
      radius,
      gap,
      valueMin,
      valueMax,
      width,
      height,
      padding,
      laneGap,
      tickCount,
    ],
  );

  const description =
    ariaDescription ?? describeBeeswarmChart(groups, effectiveHidden, fmtValue);
  const visibleCount = layout.groups.length;
  const totalFiniteCount = layout.groups.reduce(
    (acc, g) => acc + g.finiteCount,
    0,
  );

  const toggleGroup = useCallback(
    (g: ChartBeeswarmGroup) => {
      const isHidden = effectiveHidden.includes(g.id);
      const next = isHidden
        ? effectiveHidden.filter((id) => id !== g.id)
        : [...effectiveHidden, g.id];
      if (!controlledHidden) setInternalHidden(next);
      if (onHiddenGroupsChange) onHiddenGroupsChange(next);
      if (onGroupToggle) onGroupToggle({ group: g, hidden: !isHidden });
    },
    [effectiveHidden, controlledHidden, onHiddenGroupsChange, onGroupToggle],
  );

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-beeswarm"
      data-orientation={orientation}
      data-radius={radius}
      data-gap={gap}
      data-group-count={groups.length}
      data-visible-group-count={visibleCount}
      data-finite-count={totalFiniteCount}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-beeswarm-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-beeswarm-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-beeswarm-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid && layout.ticks.length > 0 ? (
            <g data-section="chart-beeswarm-grid">
              {layout.ticks.map((t) => {
                const isH = orientation === 'horizontal';
                return (
                  <line
                    key={`grid-${t.value}`}
                    data-section="chart-beeswarm-grid-line"
                    x1={isH ? t.position : padding}
                    y1={isH ? padding : t.position}
                    x2={isH ? t.position : padding + layout.innerWidth}
                    y2={isH ? padding + layout.innerHeight : t.position}
                    stroke={gridColor}
                    strokeDasharray="2 4"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-beeswarm-axes">
              <line
                data-section="chart-beeswarm-axis"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.ticks.length > 0 ? (
                <g data-section="chart-beeswarm-ticks">
                  {layout.ticks.map((t) => {
                    const isH = orientation === 'horizontal';
                    const baseX = isH ? t.position : padding;
                    const baseY = isH ? padding + layout.innerHeight : t.position;
                    return (
                      <g key={`tick-${t.value}`} data-section="chart-beeswarm-tick">
                        <line
                          x1={baseX}
                          y1={baseY}
                          x2={isH ? baseX : baseX - 4}
                          y2={isH ? baseY + 4 : baseY}
                          stroke={axisColor}
                          strokeWidth={1}
                        />
                        <text
                          data-section="chart-beeswarm-tick-label"
                          data-tick-value={t.value}
                          x={isH ? baseX : baseX - 6}
                          y={isH ? baseY + 14 : baseY + 3}
                          textAnchor={isH ? 'middle' : 'end'}
                          fontSize={10}
                          fill="currentColor"
                        >
                          {fmtValue(t.value)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ) : null}
              {valueLabel ? (
                <text
                  data-section="chart-beeswarm-value-label"
                  x={padding + layout.innerWidth / 2}
                  y={padding + layout.innerHeight + 30}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {valueLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {showLaneLabels ? (
            <g data-section="chart-beeswarm-lane-labels">
              {layout.groups.map((g) => {
                const isH = orientation === 'horizontal';
                return (
                  <text
                    key={`lane-${g.id}`}
                    data-section="chart-beeswarm-lane-label"
                    data-group-id={g.id}
                    x={isH ? padding - 6 : g.laneCenter}
                    y={isH ? g.laneCenter + 3 : padding - 6}
                    textAnchor={isH ? 'end' : 'middle'}
                    fontSize={11}
                    fill="currentColor"
                  >
                    {g.label}
                  </text>
                );
              })}
            </g>
          ) : null}

          <g data-section="chart-beeswarm-groups">
            {layout.groups.map((g) => (
              <g
                key={g.id}
                data-section="chart-beeswarm-group"
                data-group-id={g.id}
                data-group-index={g.index}
                data-group-color={g.color}
                data-group-point-count={g.points.length}
                data-group-finite-count={g.finiteCount}
                data-group-swarm-extent={g.swarmExtent}
                style={{ color: g.color }}
              >
                {g.points.map((p) => {
                  const key = `${g.id}-${p.index}`;
                  const isHovered = hoveredKey === key;
                  const isDim =
                    hoveredKey !== null && !isHovered ? 0.3 : markOpacity;
                  const aria = `${fmtGroup({ id: g.id, label: g.label, values: [] })}: ${fmtValue(p.value)}`;
                  return (
                    <circle
                      key={key}
                      data-section="chart-beeswarm-mark"
                      data-group-id={g.id}
                      data-point-index={p.index}
                      data-value={p.value}
                      data-along={p.along}
                      data-across={p.across}
                      data-hovered={isHovered ? 'true' : 'false'}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={aria}
                      cx={p.x}
                      cy={p.y}
                      r={radius}
                      fill={g.color}
                      fillOpacity={isDim}
                      stroke={g.color}
                      strokeWidth={isHovered ? strokeWidth + 0.6 : strokeWidth}
                      onMouseEnter={() => setHoveredKey(key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      onFocus={() => setHoveredKey(key)}
                      onBlur={() => setHoveredKey(null)}
                      onClick={() => {
                        if (onPointClick) onPointClick({ group: g, point: p });
                      }}
                    />
                  );
                })}
              </g>
            ))}
          </g>
        </svg>

        {showTooltip && hoveredKey ? (() => {
          const dashIdx = hoveredKey.lastIndexOf('-');
          const hid = hoveredKey.slice(0, dashIdx);
          const idxStr = hoveredKey.slice(dashIdx + 1);
          const idx = Number(idxStr);
          const g = layout.groups.find((x) => x.id === hid);
          if (!g) return null;
          const p = g.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.x + 8, 0), width - 120);
          const ty = Math.min(Math.max(p.y - 30, 0), height - 36);
          return (
            <div
              data-section="chart-beeswarm-tooltip"
              data-group-id={g.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div data-section="chart-beeswarm-tooltip-label" className="font-medium">
                {fmtGroup({ id: g.id, label: g.label, values: [] })}
              </div>
              <div data-section="chart-beeswarm-tooltip-value" className="text-slate-600">
                {fmtValue(p.value)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && groups.length > 0 ? (
        <ul
          data-section="chart-beeswarm-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {groups.map((g, i) => {
            const isHidden = effectiveHidden.includes(g.id);
            const color = g.color ?? getBeeswarmDefaultColor(i);
            return (
              <li
                key={g.id}
                data-section="chart-beeswarm-legend-item"
                data-group-id={g.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-beeswarm-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleGroup(g)}
                >
                  <span
                    data-section="chart-beeswarm-legend-swatch"
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span data-section="chart-beeswarm-legend-label">{g.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartBeeswarm.displayName = 'ChartBeeswarm';
