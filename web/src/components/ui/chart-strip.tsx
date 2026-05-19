import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_STRIP_WIDTH = 560;
export const DEFAULT_CHART_STRIP_HEIGHT = 320;
export const DEFAULT_CHART_STRIP_PADDING = 40;
export const DEFAULT_CHART_STRIP_LANE_GAP = 8;
export const DEFAULT_CHART_STRIP_TICK_COUNT = 5;
export const DEFAULT_CHART_STRIP_MARK_TICK_SIZE = 14;
export const DEFAULT_CHART_STRIP_MARK_DOT_SIZE = 3;
export const DEFAULT_CHART_STRIP_MARK_OPACITY = 0.65;
export const DEFAULT_CHART_STRIP_STROKE_WIDTH = 1.2;
export const DEFAULT_CHART_STRIP_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_STRIP_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_STRIP_ORIENTATION = 'horizontal';
export const DEFAULT_CHART_STRIP_MARK = 'tick';
export const DEFAULT_CHART_STRIP_JITTER = 0;
export const DEFAULT_CHART_STRIP_JITTER_SEED = 1;
export const DEFAULT_CHART_STRIP_PALETTE = [
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

export type ChartStripOrientation = 'horizontal' | 'vertical';
export type ChartStripMark = 'tick' | 'dot';

export interface ChartStripGroup {
  id: string;
  label: string;
  values: readonly number[];
  color?: string;
}

export interface ChartStripLayoutPoint {
  index: number;
  value: number;
  jitterOffset: number;
  x: number;
  y: number;
}

export interface ChartStripLayoutGroup {
  id: string;
  label: string;
  index: number;
  color: string;
  laneCenter: number;
  laneStart: number;
  laneEnd: number;
  points: ChartStripLayoutPoint[];
  finiteCount: number;
  totalCount: number;
}

export interface ComputeStripLayoutResult {
  groups: ChartStripLayoutGroup[];
  ticks: { value: number; position: number }[];
  valueMin: number;
  valueMax: number;
  orientation: ChartStripOrientation;
  mark: ChartStripMark;
  innerWidth: number;
  innerHeight: number;
  laneHeight: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getStripDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_STRIP_PALETTE[0]!;
  }
  return DEFAULT_CHART_STRIP_PALETTE[
    Math.floor(index) % DEFAULT_CHART_STRIP_PALETTE.length
  ]!;
}

export function getStripFiniteValues(values: readonly number[]): number[] {
  if (!Array.isArray(values)) return [];
  const out: number[] = [];
  for (const v of values) if (isFiniteNumber(v)) out.push(v);
  return out;
}

export function getStripBounds(
  groups: readonly ChartStripGroup[],
  hidden?: readonly string[],
): { min: number; max: number } {
  const hiddenSet = new Set(hidden ?? []);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const g of groups) {
    if (!g || typeof g.id !== 'string') continue;
    if (hiddenSet.has(g.id)) continue;
    for (const v of getStripFiniteValues(g.values ?? [])) {
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

export function getStripTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(2, Math.floor(count ?? DEFAULT_CHART_STRIP_TICK_COUNT));
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

/**
 * Deterministic jitter in the range [-1, 1] based on integer seed + indices.
 * Uses a small mulberry32-style mixer so the same point always lands in the
 * same spot across renders (no animation reshuffles).
 */
export function getStripJitter(
  seed: number,
  groupIndex: number,
  pointIndex: number,
): number {
  const s =
    (Math.floor(seed) | 0) ^
    (Math.floor(groupIndex) * 0x9e3779b1) ^
    (Math.floor(pointIndex) * 0x85ebca6b);
  let t = (s + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const u = ((t ^ (t >>> 14)) >>> 0) / 4294967295;
  return u * 2 - 1;
}

export interface ComputeStripLayoutInput {
  groups: readonly ChartStripGroup[];
  hidden?: readonly string[];
  orientation?: ChartStripOrientation;
  mark?: ChartStripMark;
  jitter?: number;
  jitterSeed?: number;
  valueMin?: number;
  valueMax?: number;
  width: number;
  height: number;
  padding: number;
  laneGap?: number;
  tickCount?: number;
}

export function computeStripLayout(
  input: ComputeStripLayoutInput,
): ComputeStripLayoutResult {
  const orientation: ChartStripOrientation =
    input.orientation ?? DEFAULT_CHART_STRIP_ORIENTATION;
  const mark: ChartStripMark = input.mark ?? DEFAULT_CHART_STRIP_MARK;
  const jitter = Math.max(0, Math.min(1, input.jitter ?? 0));
  const seed = input.jitterSeed ?? DEFAULT_CHART_STRIP_JITTER_SEED;
  const padding = Math.max(0, input.padding);
  const laneGap = Math.max(0, input.laneGap ?? DEFAULT_CHART_STRIP_LANE_GAP);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeStripLayoutResult = {
    groups: [],
    ticks: [],
    valueMin: 0,
    valueMax: 1,
    orientation,
    mark,
    innerWidth,
    innerHeight,
    laneHeight: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.groups || input.groups.length === 0) return empty;

  const hiddenSet = new Set(input.hidden ?? []);
  const visible = input.groups.filter(
    (g) => g && typeof g.id === 'string' && !hiddenSet.has(g.id),
  );
  if (visible.length === 0) return empty;

  const bounds = getStripBounds(input.groups, input.hidden);
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
  const groups: ChartStripLayoutGroup[] = visible.map((g, laneIndex) => {
    const groupIndex = indexById.get(g.id) ?? laneIndex;
    const color = g.color ?? getStripDefaultColor(groupIndex);
    const laneStart =
      padding +
      laneIndex * (laneHeight + laneGap) -
      (orientation === 'horizontal' ? 0 : 0);
    const laneEnd = laneStart + laneHeight;
    const laneCenter = laneStart + laneHeight / 2;
    const valuesArr = Array.isArray(g.values) ? g.values : [];
    const points: ChartStripLayoutPoint[] = [];
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
      const jOff =
        jitter > 0 ? getStripJitter(seed, groupIndex, i) * (laneHeight / 2) * jitter : 0;
      const across = laneCenter + jOff;
      const x = orientation === 'horizontal' ? along : across;
      const y = orientation === 'horizontal' ? across : along;
      points.push({ index: i, value, jitterOffset: jOff, x, y });
    }
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
    };
  });

  const tickCountAttempt = input.tickCount ?? DEFAULT_CHART_STRIP_TICK_COUNT;
  const ticks = getStripTicks(vMin, vMax, tickCountAttempt).map((t) => ({
    value: t.value,
    position:
      orientation === 'horizontal'
        ? padding + t.position * innerWidth
        : padding + innerHeight - t.position * innerHeight,
  }));

  return {
    groups,
    ticks,
    valueMin: vMin,
    valueMax: vMax,
    orientation,
    mark,
    innerWidth,
    innerHeight,
    laneHeight,
  };
}

export function describeStripChart(
  groups: readonly ChartStripGroup[],
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
    for (const v of getStripFiniteValues(g.values ?? [])) allFinite.push(v);
  }
  if (allFinite.length === 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const min = Math.min(...allFinite);
  const max = Math.max(...allFinite);
  return `Strip plot of ${allFinite.length} values across ${visible.length} group${visible.length === 1 ? '' : 's'}, range ${fmt(min)} to ${fmt(max)}.`;
}

export interface ChartStripPointClick {
  group: ChartStripLayoutGroup;
  point: ChartStripLayoutPoint;
}

export interface ChartStripGroupToggle {
  group: ChartStripGroup;
  hidden: boolean;
}

export interface ChartStripProps {
  groups: readonly ChartStripGroup[];
  orientation?: ChartStripOrientation;
  mark?: ChartStripMark;
  jitter?: number;
  jitterSeed?: number;
  valueMin?: number;
  valueMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  laneGap?: number;
  tickCount?: number;
  markSize?: number;
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
  formatGroup?: (group: ChartStripGroup) => string;
  valueLabel?: string;
  onPointClick?: (info: ChartStripPointClick) => void;
  onGroupToggle?: (info: ChartStripGroupToggle) => void;
  style?: CSSProperties;
}

export const ChartStrip = forwardRef(function ChartStrip(
  {
    groups,
    orientation = DEFAULT_CHART_STRIP_ORIENTATION,
    mark = DEFAULT_CHART_STRIP_MARK,
    jitter = DEFAULT_CHART_STRIP_JITTER,
    jitterSeed = DEFAULT_CHART_STRIP_JITTER_SEED,
    valueMin,
    valueMax,
    width = DEFAULT_CHART_STRIP_WIDTH,
    height = DEFAULT_CHART_STRIP_HEIGHT,
    padding = DEFAULT_CHART_STRIP_PADDING,
    laneGap = DEFAULT_CHART_STRIP_LANE_GAP,
    tickCount = DEFAULT_CHART_STRIP_TICK_COUNT,
    markSize,
    markOpacity = DEFAULT_CHART_STRIP_MARK_OPACITY,
    strokeWidth = DEFAULT_CHART_STRIP_STROKE_WIDTH,
    gridColor = DEFAULT_CHART_STRIP_GRID_COLOR,
    axisColor = DEFAULT_CHART_STRIP_AXIS_COLOR,
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
    ariaLabel = 'Strip plot',
    ariaDescription,
    formatValue,
    formatGroup,
    valueLabel,
    onPointClick,
    onGroupToggle,
    style,
  }: ChartStripProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const fmtValue = useCallback(
    (n: number) => (formatValue ? formatValue(n) : String(n)),
    [formatValue],
  );
  const fmtGroup = useCallback(
    (g: ChartStripGroup) => (formatGroup ? formatGroup(g) : g.label),
    [formatGroup],
  );

  const [internalHidden, setInternalHidden] = useState<string[]>(
    Array.from(defaultHiddenGroups ?? []),
  );
  const controlledHidden = hiddenGroups !== undefined;
  const effectiveHidden = controlledHidden
    ? Array.from(hiddenGroups ?? [])
    : internalHidden;

  const hoveredKeyState = useState<string | null>(null);
  const hoveredKey = hoveredKeyState[0];
  const setHoveredKey = hoveredKeyState[1];

  const layout = useMemo(
    () =>
      computeStripLayout({
        groups,
        hidden: effectiveHidden,
        orientation,
        mark,
        jitter,
        jitterSeed,
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
      mark,
      jitter,
      jitterSeed,
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
    ariaDescription ?? describeStripChart(groups, effectiveHidden, fmtValue);
  const visibleCount = layout.groups.length;
  const totalFiniteCount = layout.groups.reduce(
    (acc, g) => acc + g.finiteCount,
    0,
  );

  const toggleGroup = useCallback(
    (g: ChartStripGroup) => {
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

  const resolvedMarkSize =
    markSize ??
    (mark === 'tick'
      ? DEFAULT_CHART_STRIP_MARK_TICK_SIZE
      : DEFAULT_CHART_STRIP_MARK_DOT_SIZE);

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
      data-section="chart-strip"
      data-orientation={orientation}
      data-mark={mark}
      data-jitter={jitter}
      data-group-count={groups.length}
      data-visible-group-count={visibleCount}
      data-finite-count={totalFiniteCount}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-strip-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-strip-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-strip-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid && layout.ticks.length > 0 ? (
            <g data-section="chart-strip-grid">
              {layout.ticks.map((t) => {
                const isH = orientation === 'horizontal';
                return (
                  <line
                    key={`grid-${t.value}`}
                    data-section="chart-strip-grid-line"
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
            <g data-section="chart-strip-axes">
              <line
                data-section="chart-strip-axis"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.ticks.length > 0 ? (
                <g data-section="chart-strip-ticks">
                  {layout.ticks.map((t) => {
                    const isH = orientation === 'horizontal';
                    const baseX = isH ? t.position : padding;
                    const baseY = isH ? padding + layout.innerHeight : t.position;
                    return (
                      <g key={`tick-${t.value}`} data-section="chart-strip-tick">
                        <line
                          x1={baseX}
                          y1={baseY}
                          x2={isH ? baseX : baseX - 4}
                          y2={isH ? baseY + 4 : baseY}
                          stroke={axisColor}
                          strokeWidth={1}
                        />
                        <text
                          data-section="chart-strip-tick-label"
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
                  data-section="chart-strip-value-label"
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
            <g data-section="chart-strip-lane-labels">
              {layout.groups.map((g) => {
                const isH = orientation === 'horizontal';
                return (
                  <text
                    key={`lane-${g.id}`}
                    data-section="chart-strip-lane-label"
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

          <g data-section="chart-strip-groups">
            {layout.groups.map((g) => (
              <g
                key={g.id}
                data-section="chart-strip-group"
                data-group-id={g.id}
                data-group-index={g.index}
                data-group-color={g.color}
                data-group-point-count={g.points.length}
                data-group-finite-count={g.finiteCount}
                style={{ color: g.color }}
              >
                {g.points.map((p) => {
                  const key = `${g.id}-${p.index}`;
                  const isHovered = hoveredKey === key;
                  const isDim =
                    hoveredKey !== null && !isHovered ? 0.35 : markOpacity;
                  const aria = `${fmtGroup({ id: g.id, label: g.label, values: [] })}: ${fmtValue(p.value)}`;
                  const handleClick = () => {
                    if (onPointClick) onPointClick({ group: g, point: p });
                  };
                  if (mark === 'dot') {
                    return (
                      <circle
                        key={key}
                        data-section="chart-strip-mark"
                        data-mark-kind="dot"
                        data-group-id={g.id}
                        data-point-index={p.index}
                        data-value={p.value}
                        data-jitter-offset={p.jitterOffset}
                        data-hovered={isHovered ? 'true' : 'false'}
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={aria}
                        cx={p.x}
                        cy={p.y}
                        r={resolvedMarkSize}
                        fill={g.color}
                        fillOpacity={isDim}
                        stroke={g.color}
                        strokeWidth={isHovered ? strokeWidth + 0.6 : strokeWidth}
                        onMouseEnter={() => setHoveredKey(key)}
                        onMouseLeave={() => setHoveredKey(null)}
                        onFocus={() => setHoveredKey(key)}
                        onBlur={() => setHoveredKey(null)}
                        onClick={handleClick}
                      />
                    );
                  }
                  const isH = orientation === 'horizontal';
                  const half = resolvedMarkSize / 2;
                  const x1 = isH ? p.x : p.x - half;
                  const x2 = isH ? p.x : p.x + half;
                  const y1 = isH ? p.y - half : p.y;
                  const y2 = isH ? p.y + half : p.y;
                  return (
                    <line
                      key={key}
                      data-section="chart-strip-mark"
                      data-mark-kind="tick"
                      data-group-id={g.id}
                      data-point-index={p.index}
                      data-value={p.value}
                      data-jitter-offset={p.jitterOffset}
                      data-hovered={isHovered ? 'true' : 'false'}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={aria}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={g.color}
                      strokeOpacity={isDim}
                      strokeWidth={isHovered ? strokeWidth + 0.8 : strokeWidth}
                      strokeLinecap="round"
                      onMouseEnter={() => setHoveredKey(key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      onFocus={() => setHoveredKey(key)}
                      onBlur={() => setHoveredKey(null)}
                      onClick={handleClick}
                    />
                  );
                })}
              </g>
            ))}
          </g>
        </svg>

        {showTooltip && hoveredKey ? (() => {
          const [hid, idxStr] = hoveredKey.split('-');
          const idx = Number(idxStr);
          const g = layout.groups.find((x) => x.id === hid);
          if (!g) return null;
          const p = g.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.x + 8, 0), width - 120);
          const ty = Math.min(Math.max(p.y - 30, 0), height - 36);
          return (
            <div
              data-section="chart-strip-tooltip"
              data-group-id={g.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div data-section="chart-strip-tooltip-label" className="font-medium">
                {fmtGroup({ id: g.id, label: g.label, values: [] })}
              </div>
              <div data-section="chart-strip-tooltip-value" className="text-slate-600">
                {fmtValue(p.value)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && groups.length > 0 ? (
        <ul
          data-section="chart-strip-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {groups.map((g, i) => {
            const isHidden = effectiveHidden.includes(g.id);
            const color = g.color ?? getStripDefaultColor(i);
            return (
              <li
                key={g.id}
                data-section="chart-strip-legend-item"
                data-group-id={g.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-strip-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleGroup(g)}
                >
                  <span
                    data-section="chart-strip-legend-swatch"
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span data-section="chart-strip-legend-label">{g.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartStrip.displayName = 'ChartStrip';
