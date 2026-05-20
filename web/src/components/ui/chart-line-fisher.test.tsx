import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineFisher,
  getLineFisherFinitePoints,
  normalizeLineFisherPeriod,
  computeLineFisher,
  runLineFisher,
  computeLineFisherLayout,
  describeLineFisherChart,
  DEFAULT_CHART_LINE_FISHER_PERIOD,
  type ChartLineFisherPoint,
} from './chart-line-fisher';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,30,20,40,30,50], period 3.
 * Each window's value normalizes to a -1..+1 range position:
 *   rawNorm = [., ., 0, 1, 0, 1]
 * smoothed (0.33 * rawNorm + 0.67 * prev, seeded at index 2):
 *   smoothed = [., ., 0, 0.33, 0.2211, 0.478137]
 * Fisher = arctanh(smoothed) + 0.5 * prevFisher:
 *   fisher = [., ., 0, 0.342828, 0.396226, 0.718681]
 * The trigger line is the Fisher lagged one bar:
 *   trigger = [., ., ., 0, 0.342828, 0.396226]
 */
const FISHER_DATA: ChartLineFisherPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 30 },
  { x: 2, value: 20 },
  { x: 3, value: 40 },
  { x: 4, value: 30 },
  { x: 5, value: 50 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineFisherFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineFisherFinitePoints(FISHER_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineFisherFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineFisherFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineFisherFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineFisherFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 30 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineFisherPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineFisherPeriod(9, 10)).toBe(9);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineFisherPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineFisherPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineFisherPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineFisherPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineFisher', () => {
  it('reads Fisher 0 at the first index when the value is mid-range', () => {
    expect(computeLineFisher([10, 30, 20, 40, 30, 50], 3).fisher[2]).toBe(0);
  });

  it('computes the Fisher Transform series', () => {
    const f = computeLineFisher([10, 30, 20, 40, 30, 50], 3).fisher;
    expect(f[3]!).toBeCloseTo(0.342828, 3);
    expect(f[4]!).toBeCloseTo(0.396226, 3);
    expect(f[5]!).toBeCloseTo(0.718681, 3);
  });

  it('lags the trigger line one bar behind the Fisher line', () => {
    const { fisher, trigger } = computeLineFisher(
      [10, 30, 20, 40, 30, 50],
      3,
    );
    expect(trigger[3]).toBe(fisher[2]);
    expect(trigger[4]).toBe(fisher[3]);
    expect(trigger[5]).toBe(fisher[4]);
  });

  it('leaves the Fisher line null before the window fills', () => {
    const f = computeLineFisher([10, 30, 20, 40, 30, 50], 3).fisher;
    expect(f[0]).toBeNull();
    expect(f[1]).toBeNull();
  });

  it('leaves the trigger line null until the second defined bar', () => {
    const t = computeLineFisher([10, 30, 20, 40, 30, 50], 3).trigger;
    expect(t[2]).toBeNull();
    expect(t[3]).not.toBeNull();
  });

  it('reads 0 throughout for a flat series', () => {
    expect(computeLineFisher([5, 5, 5, 5], 3).fisher).toEqual([
      null, null, 0, 0,
    ]);
  });

  it('keeps the Fisher line finite even for a clamped rising series', () => {
    const f = computeLineFisher([1, 2, 3, 4, 5], 3).fisher;
    for (const v of f) {
      if (v !== null) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('reads a positive Fisher for a rising window', () => {
    const f = computeLineFisher([1, 2, 3, 4, 5], 3).fisher;
    expect(f[4]!).toBeGreaterThan(0);
  });

  it('returns empty series for a non-array', () => {
    expect(computeLineFisher(null, 3).fisher).toEqual([]);
  });

  it('returns all null when the series is shorter than the period', () => {
    expect(computeLineFisher([10, 30], 3).fisher).toEqual([null, null]);
  });

  it('emits one Fisher entry per value', () => {
    expect(computeLineFisher([10, 30, 20, 40, 30, 50], 3).fisher).toHaveLength(
      6,
    );
  });

  it('clamps a sub-1 period to 1', () => {
    const f = computeLineFisher([10, 30, 20], 0).fisher;
    expect(f.some((v) => v !== null)).toBe(true);
  });

  it('keeps the Fisher line defined from the period-1 index onward', () => {
    const f = computeLineFisher([10, 30, 20, 40, 30, 50], 3).fisher;
    expect(f[2]).not.toBeNull();
    expect(f[5]).not.toBeNull();
  });
});

describe('runLineFisher', () => {
  it('marks ok for a valid series', () => {
    expect(runLineFisher(FISHER_DATA, { period: 3 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineFisher([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineFisher([]).ok).toBe(false);
  });

  it('computes the Fisher series', () => {
    const run = runLineFisher(FISHER_DATA, { period: 3 });
    expect(run.fisher[2]).toBe(0);
    expect(run.fisher[5]!).toBeCloseTo(0.718681, 3);
  });

  it('computes the trigger line', () => {
    const run = runLineFisher(FISHER_DATA, { period: 3 });
    expect(run.trigger[3]).toBe(run.fisher[2]);
    expect(run.trigger[5]).toBe(run.fisher[4]);
  });

  it('reports the final Fisher and trigger', () => {
    const run = runLineFisher(FISHER_DATA, { period: 3 });
    expect(run.fisherFinal).toBeCloseTo(0.718681, 3);
    expect(run.triggerFinal).toBeCloseTo(0.396226, 3);
  });

  it('emits one sample per point', () => {
    expect(runLineFisher(FISHER_DATA, { period: 3 }).samples).toHaveLength(6);
  });

  it('carries the Fisher onto each sample', () => {
    expect(runLineFisher(FISHER_DATA, { period: 3 }).samples[2]!.fisher).toBe(
      0,
    );
  });

  it('reports the Fisher range', () => {
    const run = runLineFisher(FISHER_DATA, { period: 3 });
    expect(run.fisherMin).toBe(0);
    expect(run.fisherMax!).toBeCloseTo(0.718681, 3);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineFisher(
      [
        { x: 5, value: 50 },
        { x: 0, value: 10 },
        { x: 3, value: 40 },
        { x: 1, value: 30 },
        { x: 4, value: 30 },
        { x: 2, value: 20 },
      ],
      { period: 3 },
    );
    expect(run.fisher[5]!).toBeCloseTo(0.718681, 3);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineFisher(FISHER_DATA).period).toBe(
      DEFAULT_CHART_LINE_FISHER_PERIOD,
    );
  });

  it('emits one Fisher entry per sample', () => {
    expect(runLineFisher(FISHER_DATA, { period: 3 }).fisher).toHaveLength(6);
  });
});

describe('computeLineFisherLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineFisherLayout({ data: FISHER_DATA, period: 3, ...LAYOUT_OPTS })
        .ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineFisherLayout({
      data: [{ x: 0, value: 1 }],
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the Fisher panel', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.fisherPanel.y);
  });

  it('reports the period', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(3);
  });

  it('reports the final Fisher and trigger', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.fisherFinal).toBeCloseTo(0.718681, 3);
    expect(layout.triggerFinal).toBeCloseTo(0.396226, 3);
  });

  it('reports the total point count', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits a marker only where the Fisher is defined', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(4);
  });

  it('builds non-empty Fisher and trigger paths', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.fisherPath.startsWith('M')).toBe(true);
    expect(layout.triggerPath.startsWith('M')).toBe(true);
  });

  it('sets the symmetric y-bound to the largest Fisher magnitude', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.fisherYBound).toBeCloseTo(0.718681, 3);
  });

  it('places the zero line inside the Fisher panel', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.zeroY).toBeGreaterThan(layout.fisherPanel.y);
    expect(layout.zeroY).toBeLessThan(
      layout.fisherPanel.y + layout.fisherPanel.height,
    );
  });

  it('keeps markers inside the Fisher panel', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.fisherPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.fisherPanel.y + layout.fisherPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineFisherLayout({
      data: FISHER_DATA,
      period: 3,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineFisherChart', () => {
  it('mentions the Fisher Transform', () => {
    expect(describeLineFisherChart(FISHER_DATA, { period: 3 })).toContain(
      'Fisher Transform',
    );
  });

  it('mentions that it sharpens turning points', () => {
    const text = describeLineFisherChart(FISHER_DATA, { period: 3 });
    expect(text).toContain('sharpens');
    expect(text).toContain('turning points');
  });

  it('mentions the trigger line', () => {
    expect(describeLineFisherChart(FISHER_DATA, { period: 3 })).toContain(
      'trigger line',
    );
  });

  it('reports the period', () => {
    expect(describeLineFisherChart(FISHER_DATA, { period: 3 })).toContain(
      'period 3',
    );
  });

  it('reports the period count', () => {
    expect(describeLineFisherChart(FISHER_DATA, { period: 3 })).toContain(
      'Across 6 periods',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineFisherChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineFisher />', () => {
  it('renders the root region', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-fisher"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-fisher"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineFisher data={[{ x: 0, value: 1 }]} period={3} />);
    const root = document.querySelector('[data-section="chart-line-fisher"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period as a data attribute', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-fisher"]');
    expect(root?.getAttribute('data-period')).toBe('3');
  });

  it('renders an accessible description', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    const desc = document.querySelector(
      '[data-section="chart-line-fisher-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Fisher Transform');
  });

  it('renders the value path', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-fisher-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the Fisher line', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-fisher-fisher-line"]'),
    ).toBeTruthy();
  });

  it('renders the trigger line', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-fisher-trigger-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined Fisher value', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-fisher-marker"]'),
    ).toHaveLength(4);
  });

  it('renders the zero line', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-fisher-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} showZeroLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-fisher-zero-line"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    const labels = Array.from(
      document.querySelectorAll(
        '[data-section="chart-line-fisher-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('Fisher');
  });

  it('renders the config badge with the period', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-fisher-badge-period"]',
      )?.textContent,
    ).toBe('p=3');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(
      <ChartLineFisher data={FISHER_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-fisher-badge"]'),
    ).toBeNull();
  });

  it('renders three legend items', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-fisher-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('toggles the Fisher series off via the legend', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    const fisherItem = document.querySelector(
      '[data-section="chart-line-fisher-legend-item"][data-series-id="fisher"]',
    ) as HTMLElement;
    fireEvent.click(fisherItem);
    expect(
      document.querySelector('[data-section="chart-line-fisher-fisher-line"]'),
    ).toBeNull();
  });

  it('toggles the trigger series off via the legend', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    const triggerItem = document.querySelector(
      '[data-section="chart-line-fisher-legend-item"][data-series-id="trigger"]',
    ) as HTMLElement;
    fireEvent.click(triggerItem);
    expect(
      document.querySelector('[data-section="chart-line-fisher-trigger-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineFisher
        data={FISHER_DATA}
        period={3}
        onSeriesToggle={onSeriesToggle}
      />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-fisher-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the Fisher line when showFisher is false', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} showFisher={false} />);
    expect(
      document.querySelector('[data-section="chart-line-fisher-fisher-line"]'),
    ).toBeNull();
  });

  it('hides the trigger line when showTrigger is false', () => {
    render(
      <ChartLineFisher data={FISHER_DATA} period={3} showTrigger={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-fisher-trigger-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-fisher-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    const marker = document.querySelector(
      '[data-section="chart-line-fisher-marker"][data-point-index="3"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector(
        '[data-section="chart-line-fisher-tooltip-fisher"]',
      )?.textContent,
    ).toBe('fisher: 0.34');
    expect(
      document.querySelector(
        '[data-section="chart-line-fisher-tooltip-trigger"]',
      )?.textContent,
    ).toBe('trigger: 0');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    const marker = document.querySelector(
      '[data-section="chart-line-fisher-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-fisher-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-fisher-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineFisher
        data={FISHER_DATA}
        period={3}
        onPointClick={onPointClick}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-fisher-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-fisher"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-fisher"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineFisher ref={ref} data={FISHER_DATA} period={3} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(
      <ChartLineFisher data={FISHER_DATA} period={3} className="custom-ft" />,
    );
    const root = document.querySelector('[data-section="chart-line-fisher"]');
    expect(root?.className).toContain('custom-ft');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the final Fisher in the legend stats', () => {
    render(<ChartLineFisher data={FISHER_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-fisher-legend-stats"]',
      )?.textContent,
    ).toContain('final Fisher');
  });
});
