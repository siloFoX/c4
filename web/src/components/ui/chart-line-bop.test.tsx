import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineBop,
  getLineBopFinitePoints,
  normalizeLineBopPeriod,
  computeLineBopRaw,
  computeLineBop,
  runLineBop,
  computeLineBopLayout,
  describeLineBopChart,
  DEFAULT_CHART_LINE_BOP_PERIOD,
  type ChartLineBopPoint,
} from './chart-line-bop';

afterEach(() => cleanup());

// Every bar has a high-to-low range of exactly 8 (a power of two),
// so each raw Balance of Power -- (close - open) / 8 -- lands on an
// eighth, and a four-bar signal SMA stays on a thirty-second:
// the whole pipeline is exact. The close-minus-open spread runs
// the full +8..-8 swing including dojis.
const BOP_BARS: ChartLineBopPoint[] = [
  { x: 0, open: 10, high: 18, low: 10, close: 18 },
  { x: 1, open: 12, high: 18, low: 10, close: 16 },
  { x: 2, open: 14, high: 18, low: 10, close: 14 },
  { x: 3, open: 16, high: 18, low: 10, close: 12 },
  { x: 4, open: 18, high: 18, low: 10, close: 10 },
  { x: 5, open: 13, high: 18, low: 10, close: 15 },
  { x: 6, open: 15, high: 18, low: 10, close: 13 },
  { x: 7, open: 10, high: 18, low: 10, close: 18 },
  { x: 8, open: 18, high: 18, low: 10, close: 10 },
  { x: 9, open: 14, high: 18, low: 10, close: 14 },
  { x: 10, open: 11, high: 18, low: 10, close: 17 },
  { x: 11, open: 17, high: 18, low: 10, close: 11 },
];
const OPTS = { period: 4 };

const RAW_EXPECTED = [
  1, 0.5, 0, -0.5, -1, 0.25, -0.25, 1, -1, 0, 0.75, -0.75,
];
const SIGNAL_EXPECTED = [
  null, null, null, 0.25, -0.25, -0.3125, -0.375, 0, 0, -0.0625, 0.1875,
  -0.25,
];
const ZONE_EXPECTED = [
  'buy',
  'buy',
  'balanced',
  'sell',
  'sell',
  'buy',
  'sell',
  'buy',
  'sell',
  'balanced',
  'buy',
  'sell',
];

describe('getLineBopFinitePoints', () => {
  it('keeps only bars with a finite x, open, high, low and close', () => {
    const points = [
      { x: 0, open: 1, high: 3, low: 0, close: 2 },
      { x: 1, open: Number.NaN, high: 3, low: 0, close: 2 },
      { x: 2, open: 1, high: 3, low: 0, close: Number.POSITIVE_INFINITY },
      { x: 3, open: 4, high: 6, low: 3, close: 5 },
    ] as ChartLineBopPoint[];
    expect(getLineBopFinitePoints(points)).toEqual([
      { x: 0, open: 1, high: 3, low: 0, close: 2 },
      { x: 3, open: 4, high: 6, low: 3, close: 5 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineBopFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineBopFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, open: 1, high: 2, low: 0, close: 1 },
      { x: 2, open: 3, high: 4, low: 2, close: 3 },
    ] as ChartLineBopPoint[];
    expect(getLineBopFinitePoints(points)).toEqual(points);
  });
});

describe('normalizeLineBopPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineBopPeriod(14, 99)).toBe(14);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineBopPeriod(4.8, 99)).toBe(4);
  });
  it('rejects a zero period', () => {
    expect(normalizeLineBopPeriod(0, 99)).toBe(99);
  });
  it('rejects a negative period', () => {
    expect(normalizeLineBopPeriod(-2, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLineBopPeriod(Number.NaN, 99)).toBe(99);
  });
});

describe('computeLineBopRaw', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineBopRaw(null)).toEqual([]);
  });
  it('is the close-minus-open spread over the bar range', () => {
    expect(computeLineBopRaw(BOP_BARS)).toEqual(RAW_EXPECTED);
  });
  it('reads +1 when the bar opens at its low and closes at its high', () => {
    expect(
      computeLineBopRaw([{ x: 0, open: 10, high: 18, low: 10, close: 18 }]),
    ).toEqual([1]);
  });
  it('reads -1 when the bar opens at its high and closes at its low', () => {
    expect(
      computeLineBopRaw([{ x: 0, open: 18, high: 18, low: 10, close: 10 }]),
    ).toEqual([-1]);
  });
  it('reads zero for a doji that closes where it opened', () => {
    expect(
      computeLineBopRaw([{ x: 0, open: 14, high: 18, low: 10, close: 14 }]),
    ).toEqual([0]);
  });
  it('reads zero for a bar with no range', () => {
    expect(
      computeLineBopRaw([{ x: 0, open: 5, high: 5, low: 5, close: 5 }]),
    ).toEqual([0]);
  });
  it('clamps a malformed out-of-range bar to -1..+1', () => {
    expect(
      computeLineBopRaw([{ x: 0, open: 0, high: 18, low: 10, close: 30 }]),
    ).toEqual([1]);
  });
  it('yields null for a bar with a non-finite field', () => {
    expect(
      computeLineBopRaw([
        { x: 0, open: 1, high: Number.NaN, low: 0, close: 1 },
      ]),
    ).toEqual([null]);
  });
  it('matches the input length', () => {
    expect(computeLineBopRaw(BOP_BARS)).toHaveLength(BOP_BARS.length);
  });
});

describe('computeLineBop', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineBop(null, 4)).toEqual([]);
  });
  it('is the simple moving average of the raw Balance of Power', () => {
    expect(computeLineBop(BOP_BARS, 4)).toEqual(SIGNAL_EXPECTED);
  });
  it('is null before the signal window is full', () => {
    expect(computeLineBop(BOP_BARS, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });
  it('stays within -1..+1', () => {
    for (const v of computeLineBop(BOP_BARS, 4)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
  it('matches the input length', () => {
    expect(computeLineBop(BOP_BARS, 4)).toHaveLength(BOP_BARS.length);
  });
});

describe('runLineBop', () => {
  it('is not ok with fewer than two bars', () => {
    expect(
      runLineBop([{ x: 0, open: 1, high: 2, low: 0, close: 1 }], OPTS).ok,
    ).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineBop(BOP_BARS, OPTS).ok).toBe(true);
  });
  it('carries the resolved signal period', () => {
    expect(runLineBop(BOP_BARS, OPTS).period).toBe(4);
  });
  it('falls back to the default signal period', () => {
    expect(runLineBop(BOP_BARS).period).toBe(DEFAULT_CHART_LINE_BOP_PERIOD);
  });
  it('exposes the exact raw Balance of Power series', () => {
    expect(runLineBop(BOP_BARS, OPTS).raw).toEqual(RAW_EXPECTED);
  });
  it('exposes the exact signal series', () => {
    expect(runLineBop(BOP_BARS, OPTS).signal).toEqual(SIGNAL_EXPECTED);
  });
  it('classifies each bar by the sign of the raw Balance of Power', () => {
    expect(runLineBop(BOP_BARS, OPTS).samples.map((s) => s.zone)).toEqual(
      ZONE_EXPECTED,
    );
  });
  it('returns one sample per bar', () => {
    expect(runLineBop(BOP_BARS, OPTS).samples).toHaveLength(BOP_BARS.length);
  });
  it('counts the buy, sell and balanced bars', () => {
    const run = runLineBop(BOP_BARS, OPTS);
    expect(run.buyCount).toBe(5);
    expect(run.sellCount).toBe(5);
    expect(run.balancedCount).toBe(2);
  });
  it('reports the final Balance of Power and signal readings', () => {
    const run = runLineBop(BOP_BARS, OPTS);
    expect(run.bopFinal).toBe(-0.75);
    expect(run.signalFinal).toBe(-0.25);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...BOP_BARS].reverse();
    const run = runLineBop(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineBopLayout', () => {
  const base = {
    data: BOP_BARS,
    period: 4,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single bar', () => {
    expect(
      computeLineBopLayout({
        ...base,
        data: [{ x: 0, open: 1, high: 2, low: 0, close: 1 }],
      }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineBopLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineBopLayout(base).ok).toBe(true);
  });
  it('stacks the price panel above the Balance of Power panel', () => {
    const layout = computeLineBopLayout(base);
    expect(layout.pricePanel.y).toBeLessThan(layout.bopPanel.y);
  });
  it('builds the price, Balance of Power and signal paths', () => {
    const layout = computeLineBopLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.bopPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });
  it('places the zero line within the Balance of Power panel', () => {
    const layout = computeLineBopLayout(base);
    expect(layout.zeroY).toBeGreaterThan(layout.bopPanel.y);
    expect(layout.zeroY).toBeLessThan(layout.bopPanel.y + layout.bopPanel.height);
  });
  it('emits one marker per bar', () => {
    const layout = computeLineBopLayout(base);
    expect(layout.markers).toHaveLength(BOP_BARS.length);
    expect(layout.priceDots).toHaveLength(BOP_BARS.length);
  });
  it('reports the total point count and final readings', () => {
    const layout = computeLineBopLayout(base);
    expect(layout.totalPoints).toBe(BOP_BARS.length);
    expect(layout.bopFinal).toBe(-0.75);
  });
});

describe('describeLineBopChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineBopChart([])).toBe('No data');
  });
  it('names the Balance of Power', () => {
    expect(describeLineBopChart(BOP_BARS, OPTS)).toContain(
      'Balance of Power',
    );
  });
  it('explains the close-minus-open spread over the range', () => {
    const desc = describeLineBopChart(BOP_BARS, OPTS);
    expect(desc).toContain('range');
    expect(desc).toContain('signal');
  });
  it('reports the zone counts', () => {
    expect(describeLineBopChart(BOP_BARS, OPTS)).toContain(
      'buyers on 5 bars',
    );
  });
});

describe('ChartLineBop', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineBop data={BOP_BARS} {...OPTS} ariaLabel="BOP demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('BOP demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineBop data={[]} />);
    const root = container.querySelector('[data-section="chart-line-bop"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-bop"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the period and counts as data attributes', () => {
    const { container } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-bop"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-buy-count')).toBe('5');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    const svg = container.querySelector('[data-section="chart-line-bop-svg"]');
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the Balance of Power and signal lines', () => {
    const { container } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-bop-bop-line"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-bop-signal-line"]'),
    ).toBeTruthy();
  });
  it('renders one marker per bar', () => {
    const { container } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-bop-marker"]',
    );
    expect(markers).toHaveLength(BOP_BARS.length);
  });
  it('renders both panel labels', () => {
    const { container } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-bop-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });
  it('shows the period in the config badge', () => {
    const { container } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-bop-badge-config"]',
    );
    expect(cfg?.textContent).toBe('4');
  });
  it('renders three legend items', () => {
    const { container } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-bop-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });
  it('toggles the signal off when its legend item is clicked', () => {
    const { container } = render(<ChartLineBop data={BOP_BARS} {...OPTS} />);
    const signalItem = container.querySelector(
      '[data-section="chart-line-bop-legend-item"][data-series-id="signal"]',
    ) as HTMLElement;
    fireEvent.click(signalItem);
    expect(
      container.querySelector('[data-section="chart-line-bop-signal-line"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineBop data={BOP_BARS} {...OPTS} hiddenSeries={new Set(['bop'])} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bop-bop-line"]'),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineBop ref={ref} data={BOP_BARS} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
