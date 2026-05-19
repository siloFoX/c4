import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.480, TODO 11.462) ChartChord primitive.
//
// Pure-SVG chord diagram. Categories sit as arcs around a
// ring; ribbons inside the ring connect pairs whose mutual
// flow value sets each ribbon's width at both endpoints.
// Hovering a ribbon highlights it and dims the others;
// hovering a category highlights every ribbon that touches
// it. Per-category and per-ribbon click handlers fire with
// full payloads.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartChordCategory {
  id: string;
  label: string;
  color?: string;
}

export interface ChartChordFlow {
  source: string;
  target: string;
  value: number;
}

export interface ChartChordProps {
  categories: readonly ChartChordCategory[];
  flows: readonly ChartChordFlow[];
  width?: number;
  height?: number;
  padding?: number;
  arcWidth?: number;
  arcGapDegrees?: number;
  ribbonOpacity?: number;
  showLabels?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  highlightOnHover?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  onCategoryClick?: (args: {
    category: ChartChordCategory;
    total: number;
  }) => void;
  onFlowClick?: (args: {
    flow: ChartChordFlow;
    source: ChartChordCategory;
    target: ChartChordCategory;
  }) => void;
}

export interface ChordArc {
  id: string;
  label: string;
  color?: string;
  total: number;
  start: number;
  end: number;
}

export interface ChordRibbon {
  source: string;
  target: string;
  value: number;
  sourceStart: number;
  sourceEnd: number;
  targetStart: number;
  targetEnd: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_CHORD_WIDTH = 380;
export const DEFAULT_CHART_CHORD_HEIGHT = 380;
export const DEFAULT_CHART_CHORD_PADDING = 36;
export const DEFAULT_CHART_CHORD_ARC_WIDTH = 16;
export const DEFAULT_CHART_CHORD_ARC_GAP = 2;
export const DEFAULT_CHART_CHORD_RIBBON_OPACITY = 0.55;
export const DEFAULT_CHART_CHORD_CATEGORY_COLOR = '#475569';

// Compute the total flow value touching each category.
// Non-finite / non-positive flows and unknown source /
// target ids are skipped. Self-loops contribute once.
export function getChordCategoryTotals(
  categories: readonly ChartChordCategory[],
  flows: readonly ChartChordFlow[],
): Map<string, number> {
  const ids = new Set(categories.map((c) => c.id));
  const out = new Map<string, number>();
  for (const c of categories) out.set(c.id, 0);
  for (const f of flows) {
    if (!Number.isFinite(f.value) || f.value <= 0) continue;
    if (!ids.has(f.source) || !ids.has(f.target)) continue;
    out.set(f.source, (out.get(f.source) ?? 0) + f.value);
    if (f.source !== f.target) {
      out.set(f.target, (out.get(f.target) ?? 0) + f.value);
    }
  }
  return out;
}

// Convert polar (radius, angle in radians) -> cartesian.
// Used by ribbon + arc path builders.
export function chordPolarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

// Build the SVG path for one annular arc segment from
// `startAngle` to `endAngle` between `innerRadius` and
// `outerRadius`. Empty path when angles collapse.
export function buildChordArcPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  if (innerRadius >= outerRadius) return '';
  if (Math.abs(endAngle - startAngle) < 0.0001) return '';
  const sweep = endAngle - startAngle;
  const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
  const p1 = chordPolarToCartesian(cx, cy, outerRadius, startAngle);
  const p2 = chordPolarToCartesian(cx, cy, outerRadius, endAngle);
  const p3 = chordPolarToCartesian(cx, cy, innerRadius, endAngle);
  const p4 = chordPolarToCartesian(cx, cy, innerRadius, startAngle);
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// Build the SVG path for one ribbon connecting a source
// arc sub-segment (sourceStart, sourceEnd) to a target arc
// sub-segment (targetStart, targetEnd). Both segments sit
// on the inner edge of the ring; the bezier control point
// is the chart centre so the ribbon curves cleanly.
export function buildChordRibbonPath(
  cx: number,
  cy: number,
  innerRadius: number,
  sourceStart: number,
  sourceEnd: number,
  targetStart: number,
  targetEnd: number,
): string {
  if (innerRadius <= 0) return '';
  const sourceLength = Math.abs(sourceEnd - sourceStart);
  const targetLength = Math.abs(targetEnd - targetStart);
  if (sourceLength < 0.0001 && targetLength < 0.0001) return '';
  const sLarge = sourceLength > Math.PI ? 1 : 0;
  const tLarge = targetLength > Math.PI ? 1 : 0;
  const s1 = chordPolarToCartesian(
    cx,
    cy,
    innerRadius,
    sourceStart,
  );
  const s2 = chordPolarToCartesian(
    cx,
    cy,
    innerRadius,
    sourceEnd,
  );
  const t1 = chordPolarToCartesian(
    cx,
    cy,
    innerRadius,
    targetStart,
  );
  const t2 = chordPolarToCartesian(
    cx,
    cy,
    innerRadius,
    targetEnd,
  );
  return [
    `M ${s1.x.toFixed(2)} ${s1.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${sLarge} 1 ${s2.x.toFixed(2)} ${s2.y.toFixed(2)}`,
    `Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${t1.x.toFixed(2)} ${t1.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${tLarge} 1 ${t2.x.toFixed(2)} ${t2.y.toFixed(2)}`,
    `Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${s1.x.toFixed(2)} ${s1.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// Allocate angular space for each category arc (and the
// sub-arcs for each flow). Self-loops occupy both source
// and target sub-arcs within the same category.
export function buildChordLayout(
  categories: readonly ChartChordCategory[],
  flows: readonly ChartChordFlow[],
  arcGapDegrees: number,
): { arcs: ChordArc[]; ribbons: ChordRibbon[] } {
  const totals = getChordCategoryTotals(categories, flows);
  const active = categories.filter(
    (c) => (totals.get(c.id) ?? 0) > 0,
  );
  if (active.length === 0) return { arcs: [], ribbons: [] };
  const grandTotal = active.reduce(
    (s, c) => s + (totals.get(c.id) ?? 0),
    0,
  );
  if (grandTotal <= 0) return { arcs: [], ribbons: [] };
  const safeGap = Math.max(0, arcGapDegrees);
  const gapRad = (safeGap * Math.PI) / 180;
  const totalGap = gapRad * active.length;
  const angleBudget = Math.max(
    0,
    2 * Math.PI - totalGap,
  );
  let cursor = -Math.PI / 2;
  const arcs: ChordArc[] = active.map((cat) => {
    const total = totals.get(cat.id) ?? 0;
    const size = (total / grandTotal) * angleBudget;
    const start = cursor;
    const end = cursor + size;
    cursor = end + gapRad;
    return {
      id: cat.id,
      label: cat.label,
      color: cat.color,
      total,
      start,
      end,
    };
  });
  const subCursor = new Map<string, number>(
    arcs.map((a) => [a.id, a.start]),
  );
  const ribbons: ChordRibbon[] = [];
  const orderedFlows = [...flows]
    .filter(
      (f) =>
        Number.isFinite(f.value) &&
        f.value > 0 &&
        totals.has(f.source) &&
        totals.has(f.target) &&
        (totals.get(f.source) ?? 0) > 0 &&
        (totals.get(f.target) ?? 0) > 0,
    )
    .sort((a, b) => {
      const sa = a.source.localeCompare(b.source);
      if (sa !== 0) return sa;
      return a.target.localeCompare(b.target);
    });
  for (const flow of orderedFlows) {
    const srcArc = arcs.find((a) => a.id === flow.source);
    const tgtArc = arcs.find((a) => a.id === flow.target);
    if (!srcArc || !tgtArc) continue;
    const srcTotal = srcArc.total;
    const tgtTotal = tgtArc.total;
    const srcSize =
      (flow.value / srcTotal) * (srcArc.end - srcArc.start);
    const tgtSize =
      (flow.value / tgtTotal) * (tgtArc.end - tgtArc.start);
    const srcStart = subCursor.get(srcArc.id) ?? srcArc.start;
    const srcEnd = srcStart + srcSize;
    subCursor.set(srcArc.id, srcEnd);
    let tgtStart: number;
    if (flow.source === flow.target) {
      tgtStart = subCursor.get(tgtArc.id) ?? tgtArc.start;
      subCursor.set(tgtArc.id, tgtStart + tgtSize);
    } else {
      tgtStart = subCursor.get(tgtArc.id) ?? tgtArc.start;
      subCursor.set(tgtArc.id, tgtStart + tgtSize);
    }
    ribbons.push({
      source: flow.source,
      target: flow.target,
      value: flow.value,
      sourceStart: srcStart,
      sourceEnd: srcEnd,
      targetStart: tgtStart,
      targetEnd: tgtStart + tgtSize,
    });
  }
  return { arcs, ribbons };
}

// One-line ARIA summary.
export function describeChordChart(
  categories: readonly ChartChordCategory[],
  flows: readonly ChartChordFlow[],
  formatValue?: (v: number) => string,
): string {
  if (categories.length === 0 || flows.length === 0) {
    return 'No data';
  }
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const totals = getChordCategoryTotals(categories, flows);
  const summary = categories
    .map((c) => `${c.label} ${fv(totals.get(c.id) ?? 0)}`)
    .join(', ');
  return `Chord diagram with ${categories.length} categories, ${flows.length} flows. ${summary}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartChord = forwardRef(function ChartChord(
  {
    categories,
    flows,
    width = DEFAULT_CHART_CHORD_WIDTH,
    height = DEFAULT_CHART_CHORD_HEIGHT,
    padding = DEFAULT_CHART_CHORD_PADDING,
    arcWidth = DEFAULT_CHART_CHORD_ARC_WIDTH,
    arcGapDegrees = DEFAULT_CHART_CHORD_ARC_GAP,
    ribbonOpacity = DEFAULT_CHART_CHORD_RIBBON_OPACITY,
    showLabels = true,
    showTooltip = true,
    animate = true,
    highlightOnHover = true,
    className,
    ariaLabel = 'Chord diagram',
    ariaDescription,
    formatValue,
    onCategoryClick,
    onFlowClick,
  }: ChartChordProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.max(
    0,
    Math.min(cx, cy) - padding,
  );
  const innerRadius = Math.max(0, outerRadius - arcWidth);

  const layout = useMemo(
    () => buildChordLayout(categories, flows, arcGapDegrees),
    [arcGapDegrees, categories, flows],
  );

  const totalsMap = useMemo(
    () => getChordCategoryTotals(categories, flows),
    [categories, flows],
  );

  const catById = useMemo(() => {
    const m = new Map<string, ChartChordCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const description = useMemo(
    () =>
      ariaDescription ??
      describeChordChart(categories, flows, formatValue),
    [ariaDescription, categories, flows, formatValue],
  );

  const [hoveredCategory, setHoveredCategory] = useState<
    string | null
  >(null);
  const [hoveredRibbon, setHoveredRibbon] = useState<
    number | null
  >(null);

  const handleCategoryEnter = useCallback((id: string) => {
    setHoveredCategory(id);
  }, []);
  const handleCategoryLeave = useCallback(() => {
    setHoveredCategory(null);
  }, []);
  const handleRibbonEnter = useCallback((idx: number) => {
    setHoveredRibbon(idx);
  }, []);
  const handleRibbonLeave = useCallback(() => {
    setHoveredRibbon(null);
  }, []);

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const hoveredFlow =
    hoveredRibbon !== null
      ? layout.ribbons[hoveredRibbon]
      : null;
  const hoveredCategoryRecord =
    hoveredCategory !== null
      ? catById.get(hoveredCategory)
      : null;

  const isRibbonHighlighted = useCallback(
    (ribbon: ChordRibbon, idx: number): boolean => {
      if (hoveredCategory) {
        return (
          ribbon.source === hoveredCategory ||
          ribbon.target === hoveredCategory
        );
      }
      if (hoveredRibbon !== null) return idx === hoveredRibbon;
      return false;
    },
    [hoveredCategory, hoveredRibbon],
  );

  const isCategoryHighlighted = useCallback(
    (id: string): boolean => {
      if (hoveredCategory) return id === hoveredCategory;
      if (hoveredFlow) {
        return (
          id === hoveredFlow.source || id === hoveredFlow.target
        );
      }
      return false;
    },
    [hoveredCategory, hoveredFlow],
  );

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-chord"
      data-category-count={categories.length}
      data-flow-count={flows.length}
      data-arc-count={layout.arcs.length}
      data-ribbon-count={layout.ribbons.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-chord-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-chord-svg"
        className="h-auto w-full"
      >
        {/* Ribbons (paint first, behind arcs) */}
        {layout.ribbons.map((ribbon, i) => {
          const sourceCat = catById.get(ribbon.source);
          const fill =
            sourceCat?.color ??
            DEFAULT_CHART_CHORD_CATEGORY_COLOR;
          const isHovered = hoveredRibbon === i;
          const isHighlighted = isRibbonHighlighted(ribbon, i);
          const op = highlightOnHover
            ? hoveredCategory || hoveredRibbon !== null
              ? isHighlighted
                ? Math.max(ribbonOpacity, 0.85)
                : 0.08
              : ribbonOpacity
            : ribbonOpacity;
          const path = buildChordRibbonPath(
            cx,
            cy,
            innerRadius,
            ribbon.sourceStart,
            ribbon.sourceEnd,
            ribbon.targetStart,
            ribbon.targetEnd,
          );
          return (
            <g
              key={`ribbon-${i}`}
              data-section="chart-chord-ribbon"
              data-ribbon-index={i}
              data-source-id={ribbon.source}
              data-target-id={ribbon.target}
              data-ribbon-value={ribbon.value}
              data-ribbon-color={fill}
              data-hovered={isHovered ? 'true' : 'false'}
              data-highlighted={isHighlighted ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${ribbon.source} to ${ribbon.target}: ${fv(ribbon.value)}`}
                data-section="chart-chord-ribbon-path"
                data-ribbon-index={i}
                d={path}
                fill={fill}
                fillOpacity={op}
                stroke="none"
                onMouseEnter={() => handleRibbonEnter(i)}
                onMouseLeave={handleRibbonLeave}
                onFocus={() => handleRibbonEnter(i)}
                onBlur={handleRibbonLeave}
                onClick={
                  onFlowClick
                    ? (e) => {
                        e.stopPropagation();
                        const src = catById.get(ribbon.source);
                        const tgt = catById.get(ribbon.target);
                        if (src && tgt) {
                          onFlowClick({
                            flow: {
                              source: ribbon.source,
                              target: ribbon.target,
                              value: ribbon.value,
                            },
                            source: src,
                            target: tgt,
                          });
                        }
                      }
                    : undefined
                }
                style={{
                  cursor: onFlowClick ? 'pointer' : 'default',
                }}
              />
            </g>
          );
        })}
        {/* Arcs */}
        {layout.arcs.map((arc) => {
          const cat = catById.get(arc.id);
          const color =
            cat?.color ?? DEFAULT_CHART_CHORD_CATEGORY_COLOR;
          const path = buildChordArcPath(
            cx,
            cy,
            innerRadius,
            outerRadius,
            arc.start,
            arc.end,
          );
          const isHovered = hoveredCategory === arc.id;
          const isHighlighted = isCategoryHighlighted(arc.id);
          const op = highlightOnHover
            ? hoveredCategory || hoveredRibbon !== null
              ? isHighlighted
                ? 1
                : 0.45
              : 0.95
            : 0.95;
          return (
            <g
              key={`arc-${arc.id}`}
              data-section="chart-chord-arc"
              data-category-id={arc.id}
              data-category-total={arc.total}
              data-category-color={color}
              data-arc-start={arc.start.toFixed(4)}
              data-arc-end={arc.end.toFixed(4)}
              data-hovered={isHovered ? 'true' : 'false'}
              data-highlighted={isHighlighted ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${arc.label}: total ${fv(arc.total)}`}
                data-section="chart-chord-arc-path"
                data-category-id={arc.id}
                d={path}
                fill={color}
                fillOpacity={op}
                stroke="#ffffff"
                strokeWidth={1}
                onMouseEnter={() => handleCategoryEnter(arc.id)}
                onMouseLeave={handleCategoryLeave}
                onFocus={() => handleCategoryEnter(arc.id)}
                onBlur={handleCategoryLeave}
                onClick={
                  onCategoryClick && cat
                    ? () =>
                        onCategoryClick({
                          category: cat,
                          total: arc.total,
                        })
                    : undefined
                }
                style={{
                  cursor: onCategoryClick
                    ? 'pointer'
                    : 'default',
                }}
              />
              {showLabels ? (
                (() => {
                  const mid = (arc.start + arc.end) / 2;
                  const labelRadius = outerRadius + 8;
                  const lx = cx + labelRadius * Math.cos(mid);
                  const ly = cy + labelRadius * Math.sin(mid);
                  const anchor =
                    Math.cos(mid) > 0.05
                      ? 'start'
                      : Math.cos(mid) < -0.05
                        ? 'end'
                        : 'middle';
                  return (
                    <text
                      aria-hidden="true"
                      data-section="chart-chord-arc-label"
                      data-category-id={arc.id}
                      x={lx}
                      y={ly}
                      textAnchor={anchor}
                      alignmentBaseline="middle"
                      fontSize={11}
                      fill="currentColor"
                      fillOpacity={0.85}
                    >
                      {arc.label}
                    </text>
                  );
                })()
              ) : null}
            </g>
          );
        })}
      </svg>
      {showTooltip && hoveredCategoryRecord ? (
        <div
          role="tooltip"
          data-section="chart-chord-tooltip"
          data-category-id={hoveredCategoryRecord.id}
          style={{ left: padding, top: padding }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-chord-tooltip-label"
            className="font-medium"
          >
            {hoveredCategoryRecord.label}
          </div>
          <div
            data-section="chart-chord-tooltip-total"
            className="font-mono text-muted-foreground"
          >
            total: {fv(totalsMap.get(hoveredCategoryRecord.id) ?? 0)}
          </div>
        </div>
      ) : null}
      {showTooltip && hoveredFlow && !hoveredCategoryRecord ? (
        <div
          role="tooltip"
          data-section="chart-chord-ribbon-tooltip"
          data-source-id={hoveredFlow.source}
          data-target-id={hoveredFlow.target}
          style={{ left: padding, top: padding }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-chord-ribbon-tooltip-label"
            className="font-medium"
          >
            {hoveredFlow.source} -&gt; {hoveredFlow.target}
          </div>
          <div
            data-section="chart-chord-ribbon-tooltip-value"
            className="font-mono"
          >
            value: {fv(hoveredFlow.value)}
          </div>
        </div>
      ) : null}
    </div>
  );
});

ChartChord.displayName = 'ChartChord';
