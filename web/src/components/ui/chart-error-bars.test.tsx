import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartErrorBars,
  computeErrorBarLayout,
  describeErrorBarChart,
  getDefaultErrorBarColor,
  getErrorBarBounds,
  getErrorBarCIRange,
  getErrorBarTicks,
  getErrorBarXCIRange,
  DEFAULT_CHART_ERROR_BARS_WIDTH,
  DEFAULT_CHART_ERROR_BARS_HEIGHT,
  DEFAULT_CHART_ERROR_BARS_PADDING,
  DEFAULT_CHART_ERROR_BARS_TICK_COUNT,
  DEFAULT_CHART_ERROR_BARS_PRIMARY_COLOR,
  DEFAULT_CHART_ERROR_BARS_ERROR_COLOR,
  DEFAULT_CHART_ERROR_BARS_POINT_RADIUS,
  DEFAULT_CHART_ERROR_BARS_WHISKER_LENGTH,
  DEFAULT_CHART_ERROR_BARS_BAR_GAP,
  type ChartErrorBarsPoint,
} from './chart-error-bars';

afterEach(() => cleanup());

const BAR_SAMPLE: ChartErrorBarsPoint[] = [
  { id: 'a', label: 'Alpha', y: 10, error: 2 },
  { id: 'b', label: 'Beta', y: 20, lower: 17, upper: 24 },
  { id: 'c', label: 'Gamma', y: 30 },
];

const SCATTER_SAMPLE: ChartErrorBarsPoint[] = [
  { id: 'a', label: 'A', x: 1, y: 10, error: 2, xError: 0.3 },
  { id: 'b', label: 'B', x: 2, y: 20 },
  { id: 'c', label: 'C', x: 3, y: 30, lower: 26, upper: 34 },
];

describe('chart-error-bars constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_ERROR_BARS_WIDTH).toBe(560);
    expect(DEFAULT_CHART_ERROR_BARS_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_ERROR_BARS_PADDING).toBe(40);
    expect(DEFAULT_CHART_ERROR_BARS_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_ERROR_BARS_POINT_RADIUS).toBe(4);
    expect(DEFAULT_CHART_ERROR_BARS_WHISKER_LENGTH).toBe(6);
    expect(DEFAULT_CHART_ERROR_BARS_BAR_GAP).toBe(12);
    expect(DEFAULT_CHART_ERROR_BARS_PRIMARY_COLOR).toBe('#2563eb');
    expect(DEFAULT_CHART_ERROR_BARS_ERROR_COLOR).toBe('#1e40af');
  });
});

describe('getDefaultErrorBarColor', () => {
  it('returns the primary color for any index', () => {
    expect(getDefaultErrorBarColor(0)).toBe(DEFAULT_CHART_ERROR_BARS_PRIMARY_COLOR);
    expect(getDefaultErrorBarColor(7)).toBe(DEFAULT_CHART_ERROR_BARS_PRIMARY_COLOR);
  });
});

describe('getErrorBarCIRange', () => {
  it('returns (y, y, false) when no CI fields are present', () => {
    const r = getErrorBarCIRange({ id: 'a', y: 5 });
    expect(r.lower).toBe(5);
    expect(r.upper).toBe(5);
    expect(r.hasError).toBe(false);
  });
  it('lower / upper take priority when both are present', () => {
    const r = getErrorBarCIRange({ id: 'a', y: 5, lower: 3, upper: 7, error: 100 });
    expect(r.lower).toBe(3);
    expect(r.upper).toBe(7);
    expect(r.hasError).toBe(true);
  });
  it('falls back to symmetric +/- error', () => {
    const r = getErrorBarCIRange({ id: 'a', y: 5, error: 2 });
    expect(r.lower).toBe(3);
    expect(r.upper).toBe(7);
    expect(r.hasError).toBe(true);
  });
  it('swaps when lower > upper', () => {
    const r = getErrorBarCIRange({ id: 'a', y: 5, lower: 9, upper: 1 });
    expect(r.lower).toBe(1);
    expect(r.upper).toBe(9);
  });
  it('non-finite y clamps to 0', () => {
    const r = getErrorBarCIRange({ id: 'a', y: Number.NaN });
    expect(r.lower).toBe(0);
    expect(r.upper).toBe(0);
    expect(r.hasError).toBe(false);
  });
  it('negative error is ignored', () => {
    const r = getErrorBarCIRange({ id: 'a', y: 5, error: -2 });
    expect(r.hasError).toBe(false);
    expect(r.lower).toBe(5);
    expect(r.upper).toBe(5);
  });
});

describe('getErrorBarXCIRange', () => {
  it('returns (x, x, false) without CI fields', () => {
    const r = getErrorBarXCIRange({ id: 'a', x: 5, y: 0 });
    expect(r.lower).toBe(5);
    expect(r.upper).toBe(5);
    expect(r.hasError).toBe(false);
  });
  it('uses xLower / xUpper when provided', () => {
    const r = getErrorBarXCIRange({ id: 'a', x: 5, y: 0, xLower: 3, xUpper: 7 });
    expect(r.lower).toBe(3);
    expect(r.upper).toBe(7);
    expect(r.hasError).toBe(true);
  });
  it('falls back to symmetric +/- xError', () => {
    const r = getErrorBarXCIRange({ id: 'a', x: 5, y: 0, xError: 1.5 });
    expect(r.lower).toBe(3.5);
    expect(r.upper).toBe(6.5);
  });
});

describe('getErrorBarBounds', () => {
  it('returns sensible defaults for empty data', () => {
    const b = getErrorBarBounds([], 'bar');
    expect(Number.isFinite(b.xMin)).toBe(true);
    expect(Number.isFinite(b.xMax)).toBe(true);
    expect(Number.isFinite(b.yMin)).toBe(true);
    expect(Number.isFinite(b.yMax)).toBe(true);
  });
  it('bar mode includes 0 baseline when min > 0', () => {
    const b = getErrorBarBounds(BAR_SAMPLE, 'bar');
    expect(b.yMin).toBeLessThanOrEqual(0);
    expect(b.yMax).toBeGreaterThanOrEqual(24);
  });
  it('uses CI lower / upper for yMin / yMax', () => {
    const b = getErrorBarBounds(BAR_SAMPLE, 'bar');
    expect(b.yMax).toBeGreaterThanOrEqual(24);
  });
  it('scatter mode uses x range', () => {
    const b = getErrorBarBounds(SCATTER_SAMPLE, 'scatter');
    expect(b.xMin).toBeLessThanOrEqual(0.7);
    expect(b.xMax).toBeGreaterThanOrEqual(3);
  });
  it('bar mode x range is index-based', () => {
    const b = getErrorBarBounds(BAR_SAMPLE, 'bar');
    expect(b.xMin).toBe(0);
    expect(b.xMax).toBe(2);
  });
});

describe('getErrorBarTicks', () => {
  it('returns count evenly-spaced inclusive ticks', () => {
    const t = getErrorBarTicks(0, 10, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBe(0);
    expect(t[4]).toBe(10);
  });
  it('collapsed range returns [min]', () => {
    expect(getErrorBarTicks(5, 5, 5)).toEqual([5]);
  });
  it('clamps count to >= 2', () => {
    expect(getErrorBarTicks(0, 1, 1).length).toBe(2);
  });
});

describe('computeErrorBarLayout', () => {
  const innerW = 480;
  const innerH = 240;
  const padX = 40;
  const padY = 40;

  it('returns one entry per visible valid point', () => {
    const bounds = getErrorBarBounds(BAR_SAMPLE, 'bar');
    const out = computeErrorBarLayout({
      data: BAR_SAMPLE,
      mode: 'bar',
      bounds,
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(out).toHaveLength(3);
  });

  it('skips non-finite y', () => {
    const data: ChartErrorBarsPoint[] = [
      { id: 'a', y: Number.NaN },
      { id: 'b', y: 1 },
    ];
    const bounds = getErrorBarBounds(data, 'bar');
    const out = computeErrorBarLayout({
      data,
      mode: 'bar',
      bounds,
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('b');
  });

  it('hasY mirrors the CI presence', () => {
    const bounds = getErrorBarBounds(BAR_SAMPLE, 'bar');
    const out = computeErrorBarLayout({
      data: BAR_SAMPLE,
      mode: 'bar',
      bounds,
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(out[0]!.hasY).toBe(true);
    expect(out[1]!.hasY).toBe(true);
    expect(out[2]!.hasY).toBe(false);
  });

  it('hasX is true only in scatter mode + when xError fields present', () => {
    const sb = getErrorBarBounds(SCATTER_SAMPLE, 'scatter');
    const sc = computeErrorBarLayout({
      data: SCATTER_SAMPLE,
      mode: 'scatter',
      bounds: sb,
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(sc[0]!.hasX).toBe(true);
    expect(sc[1]!.hasX).toBe(false);
    const bb = getErrorBarBounds(BAR_SAMPLE, 'bar');
    const bc = computeErrorBarLayout({
      data: BAR_SAMPLE,
      mode: 'bar',
      bounds: bb,
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(bc[0]!.hasX).toBe(false);
  });

  it('upper CI maps to a smaller y (higher on canvas) than lower CI', () => {
    const bounds = getErrorBarBounds(BAR_SAMPLE, 'bar');
    const out = computeErrorBarLayout({
      data: BAR_SAMPLE,
      mode: 'bar',
      bounds,
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(out[0]!.yUpperY).toBeLessThan(out[0]!.yLowerY);
  });

  it('scatter mode places x at the configured x value', () => {
    const bounds = getErrorBarBounds(SCATTER_SAMPLE, 'scatter');
    const out = computeErrorBarLayout({
      data: SCATTER_SAMPLE,
      mode: 'scatter',
      bounds,
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(out[0]!.cx).toBeLessThan(out[1]!.cx);
    expect(out[1]!.cx).toBeLessThan(out[2]!.cx);
  });

  it('baselineY is 0-line for bar mode when y range includes 0', () => {
    const bounds = getErrorBarBounds(BAR_SAMPLE, 'bar');
    const out = computeErrorBarLayout({
      data: BAR_SAMPLE,
      mode: 'bar',
      bounds,
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(out[0]!.baselineY).toBeCloseTo(padY + innerH);
  });

  it('returns [] for non-positive inner dimensions', () => {
    const bounds = getErrorBarBounds(BAR_SAMPLE, 'bar');
    const out = computeErrorBarLayout({
      data: BAR_SAMPLE,
      mode: 'bar',
      bounds,
      innerW: 0,
      innerH: 0,
      padX,
      padY,
    });
    expect(out).toEqual([]);
  });
});

describe('describeErrorBarChart', () => {
  it('returns "No data" for empty', () => {
    expect(describeErrorBarChart([], 'bar')).toBe('No data');
  });
  it('returns "No data" when all y are non-finite', () => {
    expect(
      describeErrorBarChart(
        [{ id: 'a', y: Number.NaN }, { id: 'b', y: Number.NaN }],
        'bar'
      )
    ).toBe('No data');
  });
  it('includes count + CI count + y range', () => {
    const d = describeErrorBarChart(BAR_SAMPLE, 'bar');
    expect(d).toContain('Error bar chart (bar)');
    expect(d).toContain('3 points');
    expect(d).toContain('2 with confidence intervals');
    expect(d).toContain('y range');
  });
  it('honors formatValue', () => {
    const d = describeErrorBarChart(BAR_SAMPLE, 'bar', (v) => `$${v}`);
    expect(d).toContain('$0');
  });
});

describe('<ChartErrorBars> component', () => {
  it('renders a region with role + custom aria-label', () => {
    const { getByRole } = render(
      <ChartErrorBars data={BAR_SAMPLE} ariaLabel="Test error bars" />
    );
    expect(getByRole('region', { name: 'Test error bars' })).toBeTruthy();
  });

  it('renders one mark per visible point (bar mode)', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const marks = container.querySelectorAll(
      '[data-section="chart-error-bars-mark"]'
    );
    expect(marks.length).toBe(3);
    expect(
      container.querySelectorAll('[data-section="chart-error-bars-bar"]').length
    ).toBe(3);
  });

  it('renders circles in scatter mode', () => {
    const { container } = render(
      <ChartErrorBars data={SCATTER_SAMPLE} mode="scatter" />
    );
    expect(
      container.querySelectorAll('[data-section="chart-error-bars-point"]')
        .length
    ).toBe(3);
    expect(
      container.querySelector('[data-section="chart-error-bars-bar"]')
    ).toBeNull();
  });

  it('y whisker renders for points with CI; missing for those without', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const whiskers = container.querySelectorAll(
      '[data-section="chart-error-bars-y-whisker"]'
    );
    expect(whiskers.length).toBe(2);
  });

  it('y whisker has stem + 2 caps', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const stems = container.querySelectorAll(
      '[data-section="chart-error-bars-y-stem"]'
    );
    const caps = container.querySelectorAll(
      '[data-section="chart-error-bars-y-cap"]'
    );
    expect(stems.length).toBe(2);
    expect(caps.length).toBe(4);
  });

  it('x whisker only renders in scatter mode with xError fields', () => {
    const { container } = render(
      <ChartErrorBars data={SCATTER_SAMPLE} mode="scatter" />
    );
    const xw = container.querySelectorAll(
      '[data-section="chart-error-bars-x-whisker"]'
    );
    expect(xw.length).toBe(1);
  });

  it('showYErrorBars=false suppresses y whiskers', () => {
    const { container } = render(
      <ChartErrorBars data={BAR_SAMPLE} showYErrorBars={false} />
    );
    expect(
      container.querySelector('[data-section="chart-error-bars-y-whisker"]')
    ).toBeNull();
  });

  it('showXErrorBars=false suppresses x whiskers', () => {
    const { container } = render(
      <ChartErrorBars
        data={SCATTER_SAMPLE}
        mode="scatter"
        showXErrorBars={false}
      />
    );
    expect(
      container.querySelector('[data-section="chart-error-bars-x-whisker"]')
    ).toBeNull();
  });

  it('per-mark data attrs carry value + CI presence + range', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const marks = container.querySelectorAll(
      '[data-section="chart-error-bars-mark"]'
    );
    expect(marks[0]!.getAttribute('data-point-id')).toBe('a');
    expect(marks[0]!.getAttribute('data-point-value')).toBe('10');
    expect(marks[0]!.getAttribute('data-point-has-y-error')).toBe('true');
    expect(marks[0]!.getAttribute('data-point-y-lower')).toBe('8');
    expect(marks[0]!.getAttribute('data-point-y-upper')).toBe('12');
    expect(marks[2]!.getAttribute('data-point-has-y-error')).toBe('false');
  });

  it('bar mark is role=graphics-symbol with aria-label including CI', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const bar = container.querySelector(
      '[data-section="chart-error-bars-bar"]'
    ) as SVGRectElement;
    expect(bar.getAttribute('role')).toBe('graphics-symbol');
    expect(bar.getAttribute('tabindex')).toBe('0');
    expect(bar.getAttribute('aria-label')).toContain('Alpha');
    expect(bar.getAttribute('aria-label')).toContain('CI');
  });

  it('scatter mark is role=graphics-symbol with aria-label including x + y CI', () => {
    const { container } = render(
      <ChartErrorBars data={SCATTER_SAMPLE} mode="scatter" />
    );
    const point = container.querySelector(
      '[data-section="chart-error-bars-point"]'
    ) as SVGCircleElement;
    expect(point.getAttribute('role')).toBe('graphics-symbol');
    expect(point.getAttribute('tabindex')).toBe('0');
    expect(point.getAttribute('aria-label')).toContain('x 1');
    expect(point.getAttribute('aria-label')).toContain('y 10');
    expect(point.getAttribute('aria-label')).toContain('y CI');
    expect(point.getAttribute('aria-label')).toContain('x CI');
  });

  it('root mirrors mode + counts + error-count + animate', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const root = container.querySelector('[data-section="chart-error-bars"]');
    expect(root?.getAttribute('data-mode')).toBe('bar');
    expect(root?.getAttribute('data-point-count')).toBe('3');
    expect(root?.getAttribute('data-visible-count')).toBe('3');
    expect(root?.getAttribute('data-error-count')).toBe('2');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('axis ticks + grid render by default and can be suppressed', () => {
    const a = render(<ChartErrorBars data={BAR_SAMPLE} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-error-bars-tick"]'
      ).length
    ).toBeGreaterThan(0);
    expect(
      a.container.querySelector('[data-section="chart-error-bars-grid"]')
    ).not.toBeNull();
    cleanup();
    const b = render(
      <ChartErrorBars
        data={BAR_SAMPLE}
        showAxisTicks={false}
        showGrid={false}
      />
    );
    expect(
      b.container.querySelector('[data-section="chart-error-bars-ticks"]')
    ).toBeNull();
    expect(
      b.container.querySelector('[data-section="chart-error-bars-grid"]')
    ).toBeNull();
  });

  it('category labels render for bar mode by default', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-error-bars-category-label"]'
    );
    expect(labels.length).toBe(3);
    expect(labels[0]!.textContent).toBe('Alpha');
  });

  it('formatCategory rewrites the category labels', () => {
    const { container } = render(
      <ChartErrorBars
        data={BAR_SAMPLE}
        formatCategory={(label, idx) => `${idx}:${label}`}
      />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-error-bars-category-label"]'
    );
    expect(labels[0]!.textContent).toBe('0:Alpha');
  });

  it('showCategoryLabels=false suppresses category labels', () => {
    const { container } = render(
      <ChartErrorBars data={BAR_SAMPLE} showCategoryLabels={false} />
    );
    expect(
      container.querySelector('[data-section="chart-error-bars-categories"]')
    ).toBeNull();
  });

  it('tooltip opens on mark hover with label + value + ranges', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const marks = container.querySelectorAll(
      '[data-section="chart-error-bars-mark"]'
    );
    fireEvent.mouseEnter(marks[0]! as HTMLElement);
    expect(
      container.querySelector('[data-section="chart-error-bars-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-error-bars-tooltip-label"]'
      )?.textContent
    ).toBe('Alpha');
    expect(
      container.querySelector(
        '[data-section="chart-error-bars-tooltip-value"]'
      )?.textContent
    ).toBe('10');
    expect(
      container.querySelector(
        '[data-section="chart-error-bars-tooltip-y-range"]'
      )?.textContent
    ).toContain('8');
  });

  it('scatter tooltip formats as (x, y)', () => {
    const { container } = render(
      <ChartErrorBars data={SCATTER_SAMPLE} mode="scatter" />
    );
    const marks = container.querySelectorAll(
      '[data-section="chart-error-bars-mark"]'
    );
    fireEvent.mouseEnter(marks[0]! as HTMLElement);
    expect(
      container.querySelector(
        '[data-section="chart-error-bars-tooltip-value"]'
      )?.textContent
    ).toBe('(1, 10)');
    expect(
      container.querySelector(
        '[data-section="chart-error-bars-tooltip-x-range"]'
      )?.textContent
    ).toContain('0.7');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const mark = container.querySelector(
      '[data-section="chart-error-bars-mark"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(mark);
    expect(
      container.querySelector('[data-section="chart-error-bars-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(mark);
    expect(
      container.querySelector('[data-section="chart-error-bars-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses the tooltip', () => {
    const { container } = render(
      <ChartErrorBars data={BAR_SAMPLE} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-error-bars-mark"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-error-bars-tooltip"]')
    ).toBeNull();
  });

  it('formatValue reaches tooltip + aria-label', () => {
    const { container } = render(
      <ChartErrorBars data={BAR_SAMPLE} formatValue={(v) => `${v}u`} />
    );
    fireEvent.mouseEnter(
      container.querySelector(
        '[data-section="chart-error-bars-mark"]'
      )! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-error-bars-tooltip-value"]'
      )?.textContent
    ).toBe('10u');
    const bar = container.querySelector(
      '[data-section="chart-error-bars-bar"]'
    ) as SVGRectElement;
    expect(bar.getAttribute('aria-label')).toContain('10u');
  });

  it('onPointClick fires with point + layout', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartErrorBars data={BAR_SAMPLE} onPointClick={onPointClick} />
    );
    const marks = container.querySelectorAll(
      '[data-section="chart-error-bars-mark"]'
    );
    fireEvent.click(marks[1]! as HTMLElement);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const payload = onPointClick.mock.calls[0]![0];
    expect(payload.point.id).toBe('b');
    expect(payload.layout.hasY).toBe(true);
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    const mark = container.querySelector(
      '[data-section="chart-error-bars-mark"]'
    ) as HTMLElement;
    expect(mark.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(mark);
    expect(mark.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(mark);
    expect(mark.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartErrorBars data={BAR_SAMPLE} />);
    expect(
      container.querySelector('[data-section="chart-error-bars-aria-desc"]')
        ?.textContent
    ).toContain('3 points');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartErrorBars data={BAR_SAMPLE} ariaDescription="Override" />
    );
    expect(
      container.querySelector('[data-section="chart-error-bars-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartErrorBars data={BAR_SAMPLE} width={400} height={200} />
    );
    const svg = container.querySelector(
      '[data-section="chart-error-bars-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty data renders without crashing', () => {
    const { container } = render(<ChartErrorBars data={[]} />);
    expect(
      container.querySelectorAll('[data-section="chart-error-bars-mark"]').length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-error-bars-aria-desc"]')!
        .textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartErrorBars data={BAR_SAMPLE} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-error-bars');
  });

  it('displayName stable', () => {
    expect(ChartErrorBars.displayName).toBe('ChartErrorBars');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartErrorBars data={BAR_SAMPLE} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-error-bars"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });

  it('per-point color override beats primaryColor', () => {
    const data: ChartErrorBarsPoint[] = [
      { id: 'a', y: 5, color: '#abcdef' },
    ];
    const { container } = render(<ChartErrorBars data={data} />);
    const mark = container.querySelector(
      '[data-section="chart-error-bars-mark"]'
    );
    expect(mark?.getAttribute('data-point-color')).toBe('#abcdef');
  });
});
