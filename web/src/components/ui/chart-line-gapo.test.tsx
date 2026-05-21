import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineGapo,
  getLineGapoFinitePoints,
  normalizeLineGapoPeriod,
  computeLineGapoRange,
  computeLineGapo,
  runLineGapo,
  computeLineGapoLayout,
  describeLineGapoChart,
  DEFAULT_CHART_LINE_GAPO_PERIOD,
  type ChartLineGapoPoint,
} from './chart-line-gapo';

afterEach(() => cleanup());

// With a lookback of 2 the index is the base-2 log of the
// two-bar range. The bars are tuned so each range is a power of
// two -- 1, 2, 4, 8, 16 -- so the index lands on 0, 1, 2, 3, 4.
// log(1) is exactly 0 and log(2)/log(2) is exactly 1; the higher
// powers are exact to floating point. The range then holds and
// collapses so the expanding / steady / contracting zones appear.
const GAPO_BARS: ChartLineGapoPoint[] = [
  { x: 0, high: 10, low: 9, close: 10 },
  { x: 1, high: 10, low: 9, close: 10 },
  { x: 2, high: 11, low: 9, close: 11 },
  { x: 3, high: 13, low: 9, close: 12 },
  { x: 4, high: 17, low: 9, close: 15 },
  { x: 5, high: 25, low: 9, close: 22 },
  { x: 6, high: 10, low: 9, close: 11 },
  { x: 7, high: 10, low: 9, close: 10 },
];
const OPTS = { period: 2 };

const RANGE_EXPECTED = [null, 1, 2, 4, 8, 16, 16, 1];
const ZONE_EXPECTED = [
  'none',
  'none',
  'expanding',
  'expanding',
  'expanding',
  'expanding',
  'steady',
  'contracting',
];

describe('getLineGapoFinitePoints', () => {
  it('keeps only bars with a finite x, high, low and close', () => {
    const points = [
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 1, high: Number.NaN, low: 3, close: 4 },
      { x: 2, high: 5, low: 3, close: Number.POSITIVE_INFINITY },
      { x: 3, high: 9, low: 7, close: 8 },
    ] as ChartLineGapoPoint[];
    expect(getLineGapoFinitePoints(points)).toEqual([
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 3, high: 9, low: 7, close: 8 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineGapoFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineGapoFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, high: 2, low: 1, close: 1.5 },
      { x: 2, high: 4, low: 3, close: 3.5 },
    ] as ChartLineGapoPoint[];
    expect(getLineGapoFinitePoints(points)).toEqual(points);
  });
});

describe('normalizeLineGapoPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineGapoPeriod(5, 99)).toBe(5);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineGapoPeriod(6.8, 99)).toBe(6);
  });
  it('rejects a period below 2', () => {
    expect(normalizeLineGapoPeriod(1, 99)).toBe(99);
  });
  it('rejects a zero period', () => {
    expect(normalizeLineGapoPeriod(0, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLineGapoPeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 2', () => {
    expect(normalizeLineGapoPeriod(2, 99)).toBe(2);
  });
});

describe('computeLineGapoRange', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineGapoRange(null, 2)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(computeLineGapoRange(GAPO_BARS, 2)[0]).toBeNull();
  });
  it('is the highest high minus the lowest low of the window', () => {
    expect(
      computeLineGapoRange(
        [
          { x: 0, high: 8, low: 2, close: 5 },
          { x: 1, high: 6, low: 1, close: 4 },
        ],
        2,
      ),
    ).toEqual([null, 7]);
  });
  it('computes the exact range series', () => {
    expect(computeLineGapoRange(GAPO_BARS, 2)).toEqual(RANGE_EXPECTED);
  });
  it('matches the input length', () => {
    expect(computeLineGapoRange(GAPO_BARS, 2)).toHaveLength(GAPO_BARS.length);
  });
});

describe('computeLineGapo', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineGapo(null, 2)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(computeLineGapo(GAPO_BARS, 2)[0]).toBeNull();
  });
  it('is exactly zero when the range is one', () => {
    expect(computeLineGapo(GAPO_BARS, 2)[1]).toBe(0);
  });
  it('is exactly one when the range equals the period', () => {
    expect(computeLineGapo(GAPO_BARS, 2)[2]).toBe(1);
  });
  it('reads the base-2 log of a power-of-two range', () => {
    const gapo = computeLineGapo(GAPO_BARS, 2);
    expect(gapo[3]!).toBeCloseTo(2, 9);
    expect(gapo[4]!).toBeCloseTo(3, 9);
    expect(gapo[5]!).toBeCloseTo(4, 9);
  });
  it('reads the base-3 log under a period of 3', () => {
    const gapo = computeLineGapo(
      [
        { x: 0, high: 9, low: 0, close: 5 },
        { x: 1, high: 9, low: 0, close: 5 },
        { x: 2, high: 9, low: 0, close: 5 },
      ],
      3,
    );
    expect(gapo[2]!).toBeCloseTo(2, 9);
  });
  it('is null when the range collapses to zero', () => {
    expect(
      computeLineGapo(
        [
          { x: 0, high: 5, low: 5, close: 5 },
          { x: 1, high: 5, low: 5, close: 5 },
        ],
        2,
      ),
    ).toEqual([null, null]);
  });
  it('matches the input length', () => {
    expect(computeLineGapo(GAPO_BARS, 2)).toHaveLength(GAPO_BARS.length);
  });
});

describe('runLineGapo', () => {
  it('is not ok with fewer than two bars', () => {
    expect(
      runLineGapo([{ x: 0, high: 2, low: 1, close: 1.5 }], OPTS).ok,
    ).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineGapo(GAPO_BARS, OPTS).ok).toBe(true);
  });
  it('carries the resolved period', () => {
    expect(runLineGapo(GAPO_BARS, OPTS).period).toBe(2);
  });
  it('falls back to the default period', () => {
    expect(runLineGapo(GAPO_BARS).period).toBe(DEFAULT_CHART_LINE_GAPO_PERIOD);
  });
  it('exposes the exact range series', () => {
    expect(runLineGapo(GAPO_BARS, OPTS).range).toEqual(RANGE_EXPECTED);
  });
  it('exposes the index with exact integer anchors', () => {
    const run = runLineGapo(GAPO_BARS, OPTS);
    expect(run.gapo[1]).toBe(0);
    expect(run.gapo[2]).toBe(1);
    expect(run.gapo[5]!).toBeCloseTo(4, 9);
  });
  it('classifies each bar by the change in the index', () => {
    expect(runLineGapo(GAPO_BARS, OPTS).samples.map((s) => s.zone)).toEqual(
      ZONE_EXPECTED,
    );
  });
  it('reports the mean index reading', () => {
    expect(runLineGapo(GAPO_BARS, OPTS).gapoMean).toBeCloseTo(2, 6);
  });
  it('returns one sample per bar', () => {
    expect(runLineGapo(GAPO_BARS, OPTS).samples).toHaveLength(
      GAPO_BARS.length,
    );
  });
  it('counts the expanding, contracting and steady bars', () => {
    const run = runLineGapo(GAPO_BARS, OPTS);
    expect(run.expandingCount).toBe(4);
    expect(run.contractingCount).toBe(1);
    expect(run.steadyCount).toBe(1);
  });
  it('reports the final index reading', () => {
    expect(runLineGapo(GAPO_BARS, OPTS).gapoFinal).toBe(0);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...GAPO_BARS].reverse();
    const run = runLineGapo(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineGapoLayout', () => {
  const base = {
    data: GAPO_BARS,
    period: 2,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single bar', () => {
    expect(
      computeLineGapoLayout({
        ...base,
        data: [{ x: 0, high: 2, low: 1, close: 1.5 }],
      }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineGapoLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineGapoLayout(base).ok).toBe(true);
  });
  it('stacks the price panel above the index panel', () => {
    const layout = computeLineGapoLayout(base);
    expect(layout.pricePanel.y).toBeLessThan(layout.gapoPanel.y);
  });
  it('builds the price and index paths', () => {
    const layout = computeLineGapoLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.gapoPath.length).toBeGreaterThan(0);
  });
  it('places the mean line within the index panel', () => {
    const layout = computeLineGapoLayout(base);
    expect(layout.hasMean).toBe(true);
    expect(layout.meanY).toBeGreaterThanOrEqual(layout.gapoPanel.y);
    expect(layout.meanY).toBeLessThanOrEqual(
      layout.gapoPanel.y + layout.gapoPanel.height,
    );
  });
  it('emits one marker per classified bar', () => {
    const layout = computeLineGapoLayout(base);
    expect(layout.markers).toHaveLength(6);
    expect(layout.priceDots).toHaveLength(GAPO_BARS.length);
  });
  it('reports the total bar count and final reading', () => {
    const layout = computeLineGapoLayout(base);
    expect(layout.totalPoints).toBe(GAPO_BARS.length);
    expect(layout.gapoFinal).toBe(0);
  });
});

describe('describeLineGapoChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineGapoChart([])).toBe('No data');
  });
  it('names the Gopalakrishnan Range Index', () => {
    expect(describeLineGapoChart(GAPO_BARS, OPTS)).toContain(
      'Gopalakrishnan Range Index',
    );
  });
  it('explains the log of the range over the lookback span', () => {
    const desc = describeLineGapoChart(GAPO_BARS, OPTS);
    expect(desc).toContain('log');
    expect(desc).toContain('range');
  });
  it('reports the zone counts', () => {
    expect(describeLineGapoChart(GAPO_BARS, OPTS)).toContain(
      'expanding on 4 bars',
    );
  });
});

describe('ChartLineGapo', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineGapo data={GAPO_BARS} {...OPTS} ariaLabel="GAPO demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('GAPO demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineGapo data={[]} />);
    const root = container.querySelector('[data-section="chart-line-gapo"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-gapo"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the period and counts as data attributes', () => {
    const { container } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-gapo"]');
    expect(root?.getAttribute('data-period')).toBe('2');
    expect(root?.getAttribute('data-expanding-count')).toBe('4');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    const svg = container.querySelector(
      '[data-section="chart-line-gapo-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the index line', () => {
    const { container } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-gapo-gapo-line"]'),
    ).toBeTruthy();
  });
  it('draws the mean reference line', () => {
    const { container } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-gapo-mean-line"]'),
    ).toBeTruthy();
  });
  it('renders one marker per classified bar', () => {
    const { container } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-gapo-marker"]',
    );
    expect(markers).toHaveLength(6);
  });
  it('shows the period in the config badge', () => {
    const { container } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-gapo-badge-config"]',
    );
    expect(cfg?.textContent).toBe('2');
  });
  it('renders two legend items', () => {
    const { container } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-gapo-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });
  it('toggles the index off when its legend item is clicked', () => {
    const { container } = render(<ChartLineGapo data={GAPO_BARS} {...OPTS} />);
    const gapoItem = container.querySelector(
      '[data-section="chart-line-gapo-legend-item"][data-series-id="gapo"]',
    ) as HTMLElement;
    fireEvent.click(gapoItem);
    expect(
      container.querySelector('[data-section="chart-line-gapo-gapo-line"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineGapo
        data={GAPO_BARS}
        {...OPTS}
        hiddenSeries={new Set(['price'])}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gapo-price-path"]'),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineGapo ref={ref} data={GAPO_BARS} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
