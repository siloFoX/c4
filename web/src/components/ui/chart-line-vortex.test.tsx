import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineVortex,
  getLineVortexFinitePoints,
  normalizeLineVortexPeriod,
  computeLineVortexMovement,
  computeLineVortex,
  runLineVortex,
  computeLineVortexLayout,
  describeLineVortexChart,
  DEFAULT_CHART_LINE_VORTEX_PERIOD,
  type ChartLineVortexPoint,
} from './chart-line-vortex';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,14,10,12,8,12], period 3.
 * Vortex movement (the up-part / down-part of each change):
 *   vmPlus    = [., 4, 0, 2, 0, 4]
 *   vmMinus   = [., 0, 4, 0, 4, 0]
 *   trueRange = [., 4, 4, 2, 4, 4]
 * VI = window sum(VM) / window sum(TR) over period 3:
 *   i=3 window 1..3: VI+ 6/10 = 0.6, VI- 4/10 = 0.4
 *   i=4 window 2..4: VI+ 2/10 = 0.2, VI- 8/10 = 0.8
 *   i=5 window 3..5: VI+ 6/10 = 0.6, VI- 4/10 = 0.4
 * viPlus = [.,.,.,0.6, 0.2, 0.6]; viMinus = [.,.,.,0.4, 0.8, 0.4].
 * Trend up -> down -> up, so VI+/VI- cross twice. trendFinal up.
 */
const VORTEX_DATA: ChartLineVortexPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 10 },
  { x: 3, value: 12 },
  { x: 4, value: 8 },
  { x: 5, value: 12 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineVortexFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineVortexFinitePoints(VORTEX_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineVortexFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineVortexFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineVortexFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineVortexFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 14 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineVortexPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineVortexPeriod(14, 10)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineVortexPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineVortexPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineVortexPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineVortexPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineVortexMovement', () => {
  it('computes the positive vortex movement', () => {
    expect(
      computeLineVortexMovement([10, 14, 10, 12, 8, 12]).vmPlus,
    ).toEqual([null, 4, 0, 2, 0, 4]);
  });

  it('computes the negative vortex movement', () => {
    expect(
      computeLineVortexMovement([10, 14, 10, 12, 8, 12]).vmMinus,
    ).toEqual([null, 0, 4, 0, 4, 0]);
  });

  it('computes the true range as the absolute change', () => {
    expect(
      computeLineVortexMovement([10, 14, 10, 12, 8, 12]).trueRange,
    ).toEqual([null, 4, 4, 2, 4, 4]);
  });

  it('reads null at index 0 for every series', () => {
    const m = computeLineVortexMovement([10, 14]);
    expect(m.vmPlus[0]).toBeNull();
    expect(m.vmMinus[0]).toBeNull();
    expect(m.trueRange[0]).toBeNull();
  });

  it('keeps positive and negative movement mutually exclusive', () => {
    const m = computeLineVortexMovement([10, 14, 10, 12, 8, 12]);
    for (let i = 1; i < 6; i += 1) {
      expect(m.vmPlus[i]! * m.vmMinus[i]!).toBe(0);
    }
  });

  it('keeps true range equal to the sum of the two movements', () => {
    const m = computeLineVortexMovement([10, 14, 10, 12, 8, 12]);
    for (let i = 1; i < 6; i += 1) {
      expect(m.vmPlus[i]! + m.vmMinus[i]!).toBe(m.trueRange[i]!);
    }
  });

  it('returns empty arrays for a non-array', () => {
    expect(computeLineVortexMovement(null).vmPlus).toEqual([]);
  });
});

describe('computeLineVortex', () => {
  it('computes the VI+ series for the fixture', () => {
    expect(computeLineVortex([10, 14, 10, 12, 8, 12], 3).viPlus).toEqual([
      null, null, null, 0.6, 0.2, 0.6,
    ]);
  });

  it('computes the VI- series for the fixture', () => {
    expect(computeLineVortex([10, 14, 10, 12, 8, 12], 3).viMinus).toEqual([
      null, null, null, 0.4, 0.8, 0.4,
    ]);
  });

  it('keeps VI+ and VI- summing to 1', () => {
    const v = computeLineVortex([10, 14, 10, 12, 8, 12], 3);
    for (let i = 3; i < 6; i += 1) {
      expect(v.viPlus[i]! + v.viMinus[i]!).toBeCloseTo(1, 9);
    }
  });

  it('leaves entries null before the window fills', () => {
    const v = computeLineVortex([10, 14, 10, 12, 8, 12], 3);
    expect(v.viPlus[2]).toBeNull();
    expect(v.viMinus[2]).toBeNull();
  });

  it('reads 0.5 for both lines on a flat series', () => {
    const v = computeLineVortex([5, 5, 5, 5], 3);
    expect(v.viPlus).toEqual([null, null, null, 0.5]);
    expect(v.viMinus).toEqual([null, null, null, 0.5]);
  });

  it('returns all null when the series is shorter than period + 1', () => {
    const v = computeLineVortex([10, 14, 10], 3);
    expect(v.viPlus).toEqual([null, null, null]);
  });

  it('returns empty series for a non-array', () => {
    expect(computeLineVortex(null, 3).viPlus).toEqual([]);
  });

  it('keeps every defined reading within 0 and 1', () => {
    const v = computeLineVortex([10, 14, 10, 12, 8, 12], 3);
    for (const arr of [v.viPlus, v.viMinus]) {
      for (const x of arr) {
        if (x !== null) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('reads VI+ above VI- on an uptrending window', () => {
    const v = computeLineVortex([10, 14, 10, 12, 8, 12], 3);
    expect(v.viPlus[3]!).toBeGreaterThan(v.viMinus[3]!);
  });

  it('reads VI- above VI+ on a downtrending window', () => {
    const v = computeLineVortex([10, 14, 10, 12, 8, 12], 3);
    expect(v.viMinus[4]!).toBeGreaterThan(v.viPlus[4]!);
  });

  it('clamps a sub-1 period to 1', () => {
    expect(
      computeLineVortex([10, 14, 10], 0).viPlus.some((v) => v !== null),
    ).toBe(true);
  });
});

describe('runLineVortex', () => {
  it('marks ok for a valid series', () => {
    expect(runLineVortex(VORTEX_DATA, { period: 3 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineVortex([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineVortex([]).ok).toBe(false);
  });

  it('computes the VI+ and VI- series', () => {
    const run = runLineVortex(VORTEX_DATA, { period: 3 });
    expect(run.viPlus).toEqual([null, null, null, 0.6, 0.2, 0.6]);
    expect(run.viMinus).toEqual([null, null, null, 0.4, 0.8, 0.4]);
  });

  it('reports the final VI+ and VI-', () => {
    const run = runLineVortex(VORTEX_DATA, { period: 3 });
    expect(run.viPlusFinal).toBe(0.6);
    expect(run.viMinusFinal).toBe(0.4);
  });

  it('reports the final trend', () => {
    expect(runLineVortex(VORTEX_DATA, { period: 3 }).trendFinal).toBe('up');
  });

  it('classifies each sample trend from the VI lines', () => {
    const run = runLineVortex(VORTEX_DATA, { period: 3 });
    expect(run.samples[3]!.trend).toBe('up');
    expect(run.samples[4]!.trend).toBe('down');
    expect(run.samples[5]!.trend).toBe('up');
  });

  it('counts the bullish and bearish crossings', () => {
    const run = runLineVortex(VORTEX_DATA, { period: 3 });
    expect(run.crossUpCount).toBe(1);
    expect(run.crossDownCount).toBe(1);
  });

  it('flags the samples where the trend crosses', () => {
    const run = runLineVortex(VORTEX_DATA, { period: 3 });
    expect(run.samples[3]!.cross).toBe(false);
    expect(run.samples[4]!.cross).toBe(true);
    expect(run.samples[5]!.cross).toBe(true);
  });

  it('emits one sample per point', () => {
    expect(runLineVortex(VORTEX_DATA, { period: 3 }).samples).toHaveLength(6);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineVortex(
      [
        { x: 5, value: 12 },
        { x: 0, value: 10 },
        { x: 3, value: 12 },
        { x: 1, value: 14 },
        { x: 4, value: 8 },
        { x: 2, value: 10 },
      ],
      { period: 3 },
    );
    expect(run.viPlus).toEqual([null, null, null, 0.6, 0.2, 0.6]);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineVortex(VORTEX_DATA).period).toBe(
      DEFAULT_CHART_LINE_VORTEX_PERIOD,
    );
  });

  it('is ok but reports a null trend when too short for the window', () => {
    const run = runLineVortex(
      [
        { x: 0, value: 10 },
        { x: 1, value: 14 },
      ],
      { period: 3 },
    );
    expect(run.ok).toBe(true);
    expect(run.trendFinal).toBeNull();
  });
});

describe('computeLineVortexLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineVortexLayout({ data: VORTEX_DATA, period: 3, ...LAYOUT_OPTS })
        .ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineVortexLayout({
      data: [{ x: 0, value: 1 }],
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the Vortex panel', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.vortexPanel.y);
  });

  it('reports the period', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(3);
  });

  it('reports the final VI lines and trend', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.viPlusFinal).toBe(0.6);
    expect(layout.viMinusFinal).toBe(0.4);
    expect(layout.trendFinal).toBe('up');
  });

  it('reports the crossing counts', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.crossUpCount).toBe(1);
    expect(layout.crossDownCount).toBe(1);
  });

  it('reports the total point count', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits a marker only where the VI is defined', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(3);
  });

  it('flags two markers as crossings', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers.filter((m) => m.cross)).toHaveLength(2);
  });

  it('builds non-empty VI+ and VI- paths', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.viPlusPath.startsWith('M')).toBe(true);
    expect(layout.viMinusPath.startsWith('M')).toBe(true);
  });

  it('builds a fixed 0 to 1 Vortex y-axis', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.vortexYTicks[0]!.value).toBe(0);
    expect(layout.vortexYTicks[layout.vortexYTicks.length - 1]!.value).toBe(1);
  });

  it('places the midline inside the Vortex panel', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.midY).toBeGreaterThan(layout.vortexPanel.y);
    expect(layout.midY).toBeLessThan(
      layout.vortexPanel.y + layout.vortexPanel.height,
    );
  });

  it('keeps markers inside the Vortex panel', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.vortexPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.vortexPanel.y + layout.vortexPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineVortexLayout({
      data: VORTEX_DATA,
      period: 3,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineVortexChart', () => {
  it('mentions the Vortex Indicator', () => {
    expect(describeLineVortexChart(VORTEX_DATA, { period: 3 })).toContain(
      'Vortex Indicator',
    );
  });

  it('mentions the VI+ and VI- lines', () => {
    const text = describeLineVortexChart(VORTEX_DATA, { period: 3 });
    expect(text).toContain('VI+');
    expect(text).toContain('VI-');
  });

  it('mentions vortex movement', () => {
    expect(describeLineVortexChart(VORTEX_DATA, { period: 3 })).toContain(
      'vortex movement',
    );
  });

  it('reports the period', () => {
    expect(describeLineVortexChart(VORTEX_DATA, { period: 3 })).toContain(
      'period 3',
    );
  });

  it('reports the final trend', () => {
    expect(describeLineVortexChart(VORTEX_DATA, { period: 3 })).toContain(
      'Final trend up',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineVortexChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineVortex />', () => {
  it('renders the root region', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-vortex"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-vortex"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineVortex data={[{ x: 0, value: 1 }]} period={3} />);
    const root = document.querySelector('[data-section="chart-line-vortex"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period as a data attribute', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-vortex"]');
    expect(root?.getAttribute('data-period')).toBe('3');
  });

  it('exposes the trend and crossing counts as data attributes', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-vortex"]');
    expect(root?.getAttribute('data-trend-final')).toBe('up');
    expect(root?.getAttribute('data-cross-up-count')).toBe('1');
    expect(root?.getAttribute('data-cross-down-count')).toBe('1');
  });

  it('renders an accessible description', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const desc = document.querySelector(
      '[data-section="chart-line-vortex-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Vortex Indicator');
  });

  it('renders the value path', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-vortex-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the VI+ line', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-vortex-vi-plus-line"]'),
    ).toBeTruthy();
  });

  it('renders the VI- line', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-vortex-vi-minus-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined VI value', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-vortex-marker"]'),
    ).toHaveLength(3);
  });

  it('flags two markers as crossings', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const crosses = Array.from(
      document.querySelectorAll('[data-section="chart-line-vortex-marker"]'),
    ).filter((m) => m.getAttribute('data-cross') === 'true');
    expect(crosses).toHaveLength(2);
  });

  it('renders the midline', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-vortex-midline"]'),
    ).toBeTruthy();
  });

  it('hides the midline when showMidline is false', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} showMidline={false} />);
    expect(
      document.querySelector('[data-section="chart-line-vortex-midline"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const labels = Array.from(
      document.querySelectorAll(
        '[data-section="chart-line-vortex-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('Vortex');
  });

  it('renders the config badge with period and trend', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-vortex-badge-period"]',
      )?.textContent,
    ).toBe('p=3');
    expect(
      document.querySelector(
        '[data-section="chart-line-vortex-badge-trend"]',
      )?.textContent,
    ).toBe('up');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(
      <ChartLineVortex data={VORTEX_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-vortex-badge"]'),
    ).toBeNull();
  });

  it('renders three legend items', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-vortex-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('toggles the VI+ series off via the legend', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const plusItem = document.querySelector(
      '[data-section="chart-line-vortex-legend-item"][data-series-id="viplus"]',
    ) as HTMLElement;
    fireEvent.click(plusItem);
    expect(
      document.querySelector('[data-section="chart-line-vortex-vi-plus-line"]'),
    ).toBeNull();
  });

  it('toggles the VI- series off via the legend', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const minusItem = document.querySelector(
      '[data-section="chart-line-vortex-legend-item"][data-series-id="viminus"]',
    ) as HTMLElement;
    fireEvent.click(minusItem);
    expect(
      document.querySelector('[data-section="chart-line-vortex-vi-minus-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineVortex
        data={VORTEX_DATA}
        period={3}
        onSeriesToggle={onSeriesToggle}
      />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-vortex-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the VI+ line when showViPlus is false', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} showViPlus={false} />);
    expect(
      document.querySelector('[data-section="chart-line-vortex-vi-plus-line"]'),
    ).toBeNull();
  });

  it('hides the VI- line when showViMinus is false', () => {
    render(
      <ChartLineVortex data={VORTEX_DATA} period={3} showViMinus={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-vortex-vi-minus-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-vortex-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-vortex-marker"]',
    );
    const m3 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '3',
    ) as Element;
    fireEvent.mouseEnter(m3);
    expect(
      document.querySelector(
        '[data-section="chart-line-vortex-tooltip-vi-plus"]',
      )?.textContent,
    ).toBe('VI+: 0.60');
    expect(
      document.querySelector(
        '[data-section="chart-line-vortex-tooltip-trend"]',
      )?.textContent,
    ).toBe('trend: up');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const marker = document.querySelector(
      '[data-section="chart-line-vortex-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-vortex-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-vortex-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineVortex
        data={VORTEX_DATA}
        period={3}
        onPointClick={onPointClick}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-vortex-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-vortex"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-vortex"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineVortex ref={ref} data={VORTEX_DATA} period={3} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(
      <ChartLineVortex data={VORTEX_DATA} period={3} className="custom-vx" />,
    );
    const root = document.querySelector('[data-section="chart-line-vortex"]');
    expect(root?.className).toContain('custom-vx');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the trend and crossings in the legend stats', () => {
    render(<ChartLineVortex data={VORTEX_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-vortex-legend-stats"]',
      )?.textContent,
    ).toContain('trend up, 2 crossings');
  });
});
