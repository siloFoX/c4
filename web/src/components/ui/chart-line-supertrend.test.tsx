import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineSupertrend,
  getLineSupertrendFinitePoints,
  normalizeLineSupertrendPeriod,
  normalizeLineSupertrendMultiplier,
  computeLineSupertrendTrueRanges,
  computeLineSupertrendATR,
  computeLineSupertrend,
  runLineSupertrend,
  computeLineSupertrendLayout,
  describeLineSupertrendChart,
  DEFAULT_CHART_LINE_SUPERTREND_PERIOD,
  DEFAULT_CHART_LINE_SUPERTREND_MULTIPLIER,
  type ChartLineSupertrendPoint,
} from './chart-line-supertrend';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,11,13,12,9,8], period 2,
 * multiplier 1.
 *
 * true range = [.,1,2,1,3,1]
 * ATR (period 2)   = [.,.,1.5,   1.25,  2.125,  1.5625]
 * basicUpper       = [.,.,14.5,  13.25, 11.125, 9.5625]
 * basicLower       = [.,.,11.5,  10.75, 6.875,  6.4375]
 * finalUpper       = [.,.,14.5,  13.25, 11.125, 9.5625]
 * finalLower       = [.,.,11.5,  11.5,  11.5,   6.4375]
 * supertrend       = [.,.,11.5,  11.5,  11.125, 9.5625]
 * direction        = [.,.,up,    up,    down,   down]
 * flip             = [F, F, F,   F,     T,      F]
 *
 * The trend opens as up (value rises 11 -> 13), the line trails the
 * lower band; at index 4 price 9 breaks below the lower band 11.5,
 * the trend flips to down and the line jumps to the upper band.
 * supertrendFinal = 9.5625, directionFinal = down, flipCount = 1.
 */
const ST_DATA: ChartLineSupertrendPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 11 },
  { x: 2, value: 13 },
  { x: 3, value: 12 },
  { x: 4, value: 9 },
  { x: 5, value: 8 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 320,
  padding: 40,
};

describe('getLineSupertrendFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineSupertrendFinitePoints(ST_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineSupertrendFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineSupertrendFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineSupertrendFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineSupertrendFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 11 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineSupertrendPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineSupertrendPeriod(10, 7)).toBe(10);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineSupertrendPeriod(8.9, 7)).toBe(8);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineSupertrendPeriod(0, 7)).toBe(7);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineSupertrendPeriod(NaN, 7)).toBe(7);
  });
});

describe('normalizeLineSupertrendMultiplier', () => {
  it('keeps a valid integer multiplier', () => {
    expect(normalizeLineSupertrendMultiplier(3, 2)).toBe(3);
  });

  it('keeps a fractional multiplier', () => {
    expect(normalizeLineSupertrendMultiplier(2.5, 2)).toBe(2.5);
  });

  it('falls back for a zero multiplier', () => {
    expect(normalizeLineSupertrendMultiplier(0, 2)).toBe(2);
  });

  it('falls back for a negative multiplier', () => {
    expect(normalizeLineSupertrendMultiplier(-1, 2)).toBe(2);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineSupertrendMultiplier(NaN, 2)).toBe(2);
  });
});

describe('computeLineSupertrendTrueRanges', () => {
  it('computes the absolute period-over-period change', () => {
    expect(computeLineSupertrendTrueRanges([10, 11, 13, 12, 9, 8])).toEqual([
      null, 1, 2, 1, 3, 1,
    ]);
  });

  it('reads null at index 0', () => {
    expect(computeLineSupertrendTrueRanges([5, 9])[0]).toBeNull();
  });

  it('returns empty for a non-array', () => {
    expect(computeLineSupertrendTrueRanges(null)).toEqual([]);
  });

  it('returns a single null for a one-element series', () => {
    expect(computeLineSupertrendTrueRanges([7])).toEqual([null]);
  });
});

describe('computeLineSupertrendATR', () => {
  it('computes the Wilder ATR for the fixture', () => {
    expect(computeLineSupertrendATR([10, 11, 13, 12, 9, 8], 2)).toEqual([
      null, null, 1.5, 1.25, 2.125, 1.5625,
    ]);
  });

  it('seeds the first ATR with a simple mean', () => {
    expect(computeLineSupertrendATR([10, 11, 13, 12, 9, 8], 2)[2]).toBe(1.5);
  });

  it('returns all null when the series is shorter than period + 1', () => {
    expect(computeLineSupertrendATR([10, 11], 2)).toEqual([null, null]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineSupertrendATR(null, 2)).toEqual([]);
  });

  it('leaves null entries before the window fills', () => {
    const atr = computeLineSupertrendATR([10, 11, 13, 12, 9, 8], 2);
    expect(atr[0]).toBeNull();
    expect(atr[1]).toBeNull();
  });

  it('produces a non-negative ATR', () => {
    const atr = computeLineSupertrendATR([10, 11, 13, 12, 9, 8], 2);
    for (const a of atr) {
      if (a !== null) expect(a).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('computeLineSupertrend', () => {
  it('computes the ATR series', () => {
    expect(computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1).atr).toEqual([
      null, null, 1.5, 1.25, 2.125, 1.5625,
    ]);
  });

  it('computes the basic upper and lower bands', () => {
    const core = computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1);
    expect(core.basicUpper).toEqual([
      null, null, 14.5, 13.25, 11.125, 9.5625,
    ]);
    expect(core.basicLower).toEqual([
      null, null, 11.5, 10.75, 6.875, 6.4375,
    ]);
  });

  it('computes the trailing final upper band', () => {
    expect(
      computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1).finalUpper,
    ).toEqual([null, null, 14.5, 13.25, 11.125, 9.5625]);
  });

  it('computes the trailing final lower band', () => {
    expect(
      computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1).finalLower,
    ).toEqual([null, null, 11.5, 11.5, 11.5, 6.4375]);
  });

  it('computes the SuperTrend line', () => {
    expect(
      computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1).supertrend,
    ).toEqual([null, null, 11.5, 11.5, 11.125, 9.5625]);
  });

  it('computes the trend direction series', () => {
    expect(
      computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1).direction,
    ).toEqual([null, null, 'up', 'up', 'down', 'down']);
  });

  it('flags the bar where the trend flips', () => {
    expect(computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1).flip).toEqual([
      false, false, false, false, true, false,
    ]);
  });

  it('puts the SuperTrend line below price in an uptrend', () => {
    const core = computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1);
    expect(core.supertrend[2]).toBe(core.finalLower[2]);
  });

  it('puts the SuperTrend line above price in a downtrend', () => {
    const core = computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1);
    expect(core.supertrend[4]).toBe(core.finalUpper[4]);
  });

  it('widens the bands with a larger multiplier', () => {
    const narrow = computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1);
    const wide = computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 3);
    expect(wide.basicUpper[2]!).toBeGreaterThan(narrow.basicUpper[2]!);
  });

  it('returns all-null series for a series shorter than period + 1', () => {
    const core = computeLineSupertrend([10, 11], 2, 1);
    expect(core.supertrend).toEqual([null, null]);
    expect(core.direction).toEqual([null, null]);
  });

  it('returns empty series for a non-array', () => {
    expect(computeLineSupertrend(null, 2, 1).supertrend).toEqual([]);
  });

  it('keeps no flip flag set before the first defined index', () => {
    const core = computeLineSupertrend([10, 11, 13, 12, 9, 8], 2, 1);
    expect(core.flip[0]).toBe(false);
    expect(core.flip[1]).toBe(false);
    expect(core.flip[2]).toBe(false);
  });
});

describe('runLineSupertrend', () => {
  it('marks ok for a valid series', () => {
    expect(runLineSupertrend(ST_DATA, { period: 2, multiplier: 1 }).ok).toBe(
      true,
    );
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineSupertrend([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineSupertrend([]).ok).toBe(false);
  });

  it('reports the final SuperTrend value', () => {
    expect(
      runLineSupertrend(ST_DATA, { period: 2, multiplier: 1 }).supertrendFinal,
    ).toBe(9.5625);
  });

  it('reports the final trend direction', () => {
    expect(
      runLineSupertrend(ST_DATA, { period: 2, multiplier: 1 }).directionFinal,
    ).toBe('down');
  });

  it('counts the trend flips', () => {
    expect(
      runLineSupertrend(ST_DATA, { period: 2, multiplier: 1 }).flipCount,
    ).toBe(1);
  });

  it('emits one sample per point', () => {
    expect(
      runLineSupertrend(ST_DATA, { period: 2, multiplier: 1 }).samples,
    ).toHaveLength(6);
  });

  it('carries the SuperTrend and direction onto each sample', () => {
    const s = runLineSupertrend(ST_DATA, { period: 2, multiplier: 1 })
      .samples[4]!;
    expect(s.supertrend).toBe(11.125);
    expect(s.direction).toBe('down');
    expect(s.flip).toBe(true);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineSupertrend(
      [
        { x: 5, value: 8 },
        { x: 0, value: 10 },
        { x: 3, value: 12 },
        { x: 1, value: 11 },
        { x: 4, value: 9 },
        { x: 2, value: 13 },
      ],
      { period: 2, multiplier: 1 },
    );
    expect(run.supertrendFinal).toBe(9.5625);
  });

  it('defaults the period and multiplier when unspecified', () => {
    const run = runLineSupertrend(ST_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_SUPERTREND_PERIOD);
    expect(run.multiplier).toBe(DEFAULT_CHART_LINE_SUPERTREND_MULTIPLIER);
  });

  it('is ok but reports a null direction when too short for the ATR', () => {
    const run = runLineSupertrend(
      [
        { x: 0, value: 10 },
        { x: 1, value: 11 },
      ],
      { period: 2 },
    );
    expect(run.ok).toBe(true);
    expect(run.directionFinal).toBeNull();
  });

  it('drops non-finite points before computing', () => {
    const run = runLineSupertrend(
      [
        { x: 0, value: 10 },
        { x: 1, value: NaN },
        { x: 2, value: 13 },
      ],
      { period: 2, multiplier: 1 },
    );
    expect(run.samples).toHaveLength(2);
  });
});

describe('computeLineSupertrendLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineSupertrendLayout({
        data: ST_DATA,
        period: 2,
        multiplier: 1,
        ...LAYOUT_OPTS,
      }).ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineSupertrendLayout({
      data: [{ x: 0, value: 1 }],
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('reports the period and multiplier', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(2);
    expect(layout.multiplier).toBe(1);
  });

  it('reports the final SuperTrend and direction', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.supertrendFinal).toBe(9.5625);
    expect(layout.directionFinal).toBe('down');
  });

  it('reports the flip count', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.flipCount).toBe(1);
  });

  it('reports the total point count', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one price dot per point', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('splits the SuperTrend line into one segment per trend run', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.segments).toHaveLength(2);
    expect(layout.segments[0]!.direction).toBe('up');
    expect(layout.segments[1]!.direction).toBe('down');
  });

  it('groups the contiguous same-direction points into each segment', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.segments[0]!.points).toHaveLength(2);
    expect(layout.segments[1]!.points).toHaveLength(2);
  });

  it('emits a marker only where the SuperTrend is defined', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(4);
  });

  it('flags exactly one marker as a flip', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers.filter((m) => m.flip)).toHaveLength(1);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('keeps markers inside the panel', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.panel.y + layout.panel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineSupertrendLayout({
      data: ST_DATA,
      period: 2,
      multiplier: 1,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineSupertrendChart', () => {
  it('mentions SuperTrend', () => {
    expect(
      describeLineSupertrendChart(ST_DATA, { period: 2, multiplier: 1 }),
    ).toContain('SuperTrend');
  });

  it('mentions the ATR trailing-stop band', () => {
    const text = describeLineSupertrendChart(ST_DATA, {
      period: 2,
      multiplier: 1,
    });
    expect(text).toContain('ATR');
    expect(text).toContain('trailing-stop');
  });

  it('reports the period and multiplier', () => {
    expect(
      describeLineSupertrendChart(ST_DATA, { period: 2, multiplier: 1 }),
    ).toContain('period 2, multiplier 1');
  });

  it('reports the final trend direction', () => {
    expect(
      describeLineSupertrendChart(ST_DATA, { period: 2, multiplier: 1 }),
    ).toContain('Final trend down');
  });

  it('reports the flip count with singular grammar', () => {
    expect(
      describeLineSupertrendChart(ST_DATA, { period: 2, multiplier: 1 }),
    ).toContain('1 flip,');
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineSupertrendChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineSupertrend />', () => {
  it('renders the root region', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    expect(
      document.querySelector('[data-section="chart-line-supertrend"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const root = document.querySelector(
      '[data-section="chart-line-supertrend"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineSupertrend data={[{ x: 0, value: 1 }]} period={2} />);
    const root = document.querySelector(
      '[data-section="chart-line-supertrend"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period and multiplier as data attributes', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const root = document.querySelector(
      '[data-section="chart-line-supertrend"]',
    );
    expect(root?.getAttribute('data-period')).toBe('2');
    expect(root?.getAttribute('data-multiplier')).toBe('1');
  });

  it('exposes the final direction and flip count', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const root = document.querySelector(
      '[data-section="chart-line-supertrend"]',
    );
    expect(root?.getAttribute('data-direction-final')).toBe('down');
    expect(root?.getAttribute('data-flip-count')).toBe('1');
  });

  it('renders an accessible description', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const desc = document.querySelector(
      '[data-section="chart-line-supertrend-aria-desc"]',
    );
    expect(desc?.textContent).toContain('SuperTrend');
  });

  it('renders the price path', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders one segment per trend run', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-supertrend-segment"]',
      ),
    ).toHaveLength(2);
  });

  it('tags each segment with its trend direction', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const dirs = Array.from(
      document.querySelectorAll(
        '[data-section="chart-line-supertrend-segment"]',
      ),
    ).map((s) => s.getAttribute('data-direction'));
    expect(dirs).toEqual(['up', 'down']);
  });

  it('renders one marker per defined SuperTrend point', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-supertrend-marker"]',
      ),
    ).toHaveLength(4);
  });

  it('flags exactly one marker as a flip', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const flips = Array.from(
      document.querySelectorAll(
        '[data-section="chart-line-supertrend-marker"]',
      ),
    ).filter((m) => m.getAttribute('data-flip') === 'true');
    expect(flips).toHaveLength(1);
  });

  it('renders the config badge with period and multiplier', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-badge-period"]',
      )?.textContent,
    ).toBe('p=2');
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-badge-mult"]',
      )?.textContent,
    ).toBe('m=1');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(
      <ChartLineSupertrend
        data={ST_DATA}
        period={2}
        multiplier={1}
        showConfigBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-supertrend-badge"]'),
    ).toBeNull();
  });

  it('renders three legend items', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-supertrend-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('toggles the uptrend segments off via the legend', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const upItem = document.querySelector(
      '[data-section="chart-line-supertrend-legend-item"][data-series-id="uptrend"]',
    ) as HTMLElement;
    fireEvent.click(upItem);
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-segment"][data-direction="up"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-segment"][data-direction="down"]',
      ),
    ).toBeTruthy();
  });

  it('toggles the downtrend segments off via the legend', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const downItem = document.querySelector(
      '[data-section="chart-line-supertrend-legend-item"][data-series-id="downtrend"]',
    ) as HTMLElement;
    fireEvent.click(downItem);
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-segment"][data-direction="down"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineSupertrend
        data={ST_DATA}
        period={2}
        multiplier={1}
        onSeriesToggle={onSeriesToggle}
      />,
    );
    const priceItem = document.querySelector(
      '[data-section="chart-line-supertrend-legend-item"][data-series-id="price"]',
    ) as HTMLElement;
    fireEvent.click(priceItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'price',
      hidden: true,
    });
  });

  it('hides the SuperTrend segments and markers when showSupertrend is false', () => {
    render(
      <ChartLineSupertrend
        data={ST_DATA}
        period={2}
        multiplier={1}
        showSupertrend={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-segment"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-supertrend-marker"]'),
    ).toBeNull();
  });

  it('hides the markers but keeps the segments when showMarkers is false', () => {
    render(
      <ChartLineSupertrend
        data={ST_DATA}
        period={2}
        multiplier={1}
        showMarkers={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-supertrend-marker"]'),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-segment"]',
      ),
    ).toBeTruthy();
  });

  it('renders price dots when showDots is true', () => {
    render(
      <ChartLineSupertrend
        data={ST_DATA}
        period={2}
        multiplier={1}
        showDots
      />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-supertrend-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-supertrend-marker"]',
    );
    const last = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '5',
    ) as Element;
    fireEvent.mouseEnter(last);
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-tooltip-supertrend"]',
      )?.textContent,
    ).toBe('supertrend: 9.56');
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-tooltip-direction"]',
      )?.textContent,
    ).toBe('direction: down');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const marker = document.querySelector(
      '[data-section="chart-line-supertrend-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-supertrend-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-supertrend-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineSupertrend
        data={ST_DATA}
        period={2}
        multiplier={1}
        onPointClick={onPointClick}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-supertrend-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    const root = document.querySelector(
      '[data-section="chart-line-supertrend"]',
    );
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(
      <ChartLineSupertrend
        data={ST_DATA}
        period={2}
        multiplier={1}
        animate={false}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-supertrend"]',
    );
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineSupertrend
        ref={ref}
        data={ST_DATA}
        period={2}
        multiplier={1}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(
      <ChartLineSupertrend
        data={ST_DATA}
        period={2}
        multiplier={1}
        className="custom-st"
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-supertrend"]',
    );
    expect(root?.className).toContain('custom-st');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the trend and flip count in the legend stats', () => {
    render(<ChartLineSupertrend data={ST_DATA} period={2} multiplier={1} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-supertrend-legend-stats"]',
      )?.textContent,
    ).toContain('trend down, 1 flip');
  });
});
