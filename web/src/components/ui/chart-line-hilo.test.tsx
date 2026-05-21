import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHilo,
  getLineHiloFinitePoints,
  normalizeLineHiloPeriod,
  computeLineHiloSma,
  computeLineHilo,
  runLineHilo,
  computeLineHiloLayout,
  describeLineHiloChart,
  DEFAULT_CHART_LINE_HILO_PERIOD,
  type ChartLineHiloPoint,
} from './chart-line-hilo';

afterEach(() => cleanup());

// Integer OHLC bars whose highs and lows are all multiples of 3,
// so the three-bar moving averages are exact integers. The closes
// run up, drop below the low average to flip the stop down, then
// climb above the high average to flip it back up.
const HILO_BARS: ChartLineHiloPoint[] = [
  { x: 0, high: 30, low: 18, close: 24 },
  { x: 1, high: 33, low: 21, close: 30 },
  { x: 2, high: 36, low: 24, close: 33 },
  { x: 3, high: 39, low: 27, close: 36 },
  { x: 4, high: 42, low: 30, close: 39 },
  { x: 5, high: 42, low: 21, close: 24 },
  { x: 6, high: 39, low: 18, close: 21 },
  { x: 7, high: 36, low: 15, close: 18 },
  { x: 8, high: 45, low: 24, close: 42 },
  { x: 9, high: 48, low: 33, close: 45 },
];
const OPTS = { period: 3 };

const SMA_HIGH_EXPECTED = [null, null, 33, 36, 39, 41, 41, 39, 40, 43];
const SMA_LOW_EXPECTED = [null, null, 21, 24, 27, 26, 23, 18, 19, 24];
const HILO_EXPECTED = [null, null, 21, 24, 27, 41, 41, 39, 19, 24];
const TREND_EXPECTED = [
  null,
  null,
  'up',
  'up',
  'up',
  'down',
  'down',
  'down',
  'up',
  'up',
];
const FLIP_EXPECTED = [
  false,
  false,
  false,
  false,
  false,
  true,
  false,
  false,
  true,
  false,
];

describe('getLineHiloFinitePoints', () => {
  it('keeps only bars with a finite x, high, low and close', () => {
    const points = [
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 1, high: Number.NaN, low: 3, close: 4 },
      { x: 2, high: 5, low: 3, close: Number.POSITIVE_INFINITY },
      { x: 3, high: 9, low: 7, close: 8 },
    ] as ChartLineHiloPoint[];
    expect(getLineHiloFinitePoints(points)).toEqual([
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 3, high: 9, low: 7, close: 8 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineHiloFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineHiloFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, high: 2, low: 1, close: 1.5 },
      { x: 2, high: 4, low: 3, close: 3.5 },
    ] as ChartLineHiloPoint[];
    expect(getLineHiloFinitePoints(points)).toEqual(points);
  });
});

describe('normalizeLineHiloPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineHiloPeriod(3, 99)).toBe(3);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineHiloPeriod(5.8, 99)).toBe(5);
  });
  it('rejects a zero period', () => {
    expect(normalizeLineHiloPeriod(0, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLineHiloPeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 1', () => {
    expect(normalizeLineHiloPeriod(1, 99)).toBe(1);
  });
});

describe('computeLineHiloSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineHiloSma(null, 3)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(computeLineHiloSma([6, 9, 12, 15], 2).slice(0, 1)).toEqual([null]);
  });
  it('is the simple moving average of the window', () => {
    expect(computeLineHiloSma([6, 9, 12, 15], 2)).toEqual([
      null,
      7.5,
      10.5,
      13.5,
    ]);
  });
  it('computes the exact high moving average for the fixture', () => {
    expect(
      computeLineHiloSma(
        HILO_BARS.map((b) => b.high),
        3,
      ),
    ).toEqual(SMA_HIGH_EXPECTED);
  });
  it('matches the input length', () => {
    expect(computeLineHiloSma([1, 2, 3, 4], 3)).toHaveLength(4);
  });
});

describe('computeLineHilo', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineHilo(null, 3)).toEqual({
      smaHigh: [],
      smaLow: [],
      hilo: [],
      trend: [],
    });
  });
  it('computes the exact high and low moving averages', () => {
    const result = computeLineHilo(HILO_BARS, 3);
    expect(result.smaHigh).toEqual(SMA_HIGH_EXPECTED);
    expect(result.smaLow).toEqual(SMA_LOW_EXPECTED);
  });
  it('follows the low average in an uptrend and the high in a downtrend', () => {
    expect(computeLineHilo(HILO_BARS, 3).hilo).toEqual(HILO_EXPECTED);
  });
  it('flips the trend on the moving average cross', () => {
    expect(computeLineHilo(HILO_BARS, 3).trend).toEqual(TREND_EXPECTED);
  });
  it('is null before the moving averages are defined', () => {
    const result = computeLineHilo(HILO_BARS, 3);
    expect(result.hilo.slice(0, 2)).toEqual([null, null]);
    expect(result.trend.slice(0, 2)).toEqual([null, null]);
  });
  it('matches the input length', () => {
    expect(computeLineHilo(HILO_BARS, 3).hilo).toHaveLength(
      HILO_BARS.length,
    );
  });
});

describe('runLineHilo', () => {
  it('is not ok with fewer than two bars', () => {
    expect(runLineHilo([{ x: 0, high: 2, low: 1, close: 1.5 }], OPTS).ok).toBe(
      false,
    );
  });
  it('is ok with a usable series', () => {
    expect(runLineHilo(HILO_BARS, OPTS).ok).toBe(true);
  });
  it('carries the resolved period', () => {
    expect(runLineHilo(HILO_BARS, OPTS).period).toBe(3);
  });
  it('falls back to the default period', () => {
    expect(runLineHilo(HILO_BARS).period).toBe(DEFAULT_CHART_LINE_HILO_PERIOD);
  });
  it('exposes the exact HiLo Activator series', () => {
    expect(runLineHilo(HILO_BARS, OPTS).hilo).toEqual(HILO_EXPECTED);
  });
  it('exposes the exact trend series', () => {
    expect(runLineHilo(HILO_BARS, OPTS).trend).toEqual(TREND_EXPECTED);
  });
  it('flags the flip bars on the samples', () => {
    expect(runLineHilo(HILO_BARS, OPTS).samples.map((s) => s.flip)).toEqual(
      FLIP_EXPECTED,
    );
  });
  it('returns one sample per bar', () => {
    expect(runLineHilo(HILO_BARS, OPTS).samples).toHaveLength(
      HILO_BARS.length,
    );
  });
  it('counts the up, down and flip bars', () => {
    const run = runLineHilo(HILO_BARS, OPTS);
    expect(run.upCount).toBe(5);
    expect(run.downCount).toBe(3);
    expect(run.flipCount).toBe(2);
  });
  it('reports the final stop and trend', () => {
    const run = runLineHilo(HILO_BARS, OPTS);
    expect(run.hiloFinal).toBe(24);
    expect(run.trendFinal).toBe('up');
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...HILO_BARS].reverse();
    const run = runLineHilo(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineHiloLayout', () => {
  const base = {
    data: HILO_BARS,
    period: 3,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single bar', () => {
    expect(
      computeLineHiloLayout({
        ...base,
        data: [{ x: 0, high: 2, low: 1, close: 1.5 }],
      }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineHiloLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineHiloLayout(base).ok).toBe(true);
  });
  it('builds the price and HiLo Activator paths', () => {
    const layout = computeLineHiloLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.hiloPath.length).toBeGreaterThan(0);
  });
  it('spans the y-domain across the price and the stop', () => {
    const layout = computeLineHiloLayout(base);
    expect(layout.yMin).toBe(18);
    expect(layout.yMax).toBe(45);
  });
  it('emits one marker per flip bar', () => {
    const layout = computeLineHiloLayout(base);
    expect(layout.markers).toHaveLength(2);
    expect(layout.priceDots).toHaveLength(HILO_BARS.length);
  });
  it('colours the markers by the new trend', () => {
    const layout = computeLineHiloLayout(base);
    expect(layout.markers[0]!.trend).toBe('down');
    expect(layout.markers[1]!.trend).toBe('up');
  });
  it('reports the trend, flip count and total points', () => {
    const layout = computeLineHiloLayout(base);
    expect(layout.trendFinal).toBe('up');
    expect(layout.flipCount).toBe(2);
    expect(layout.totalPoints).toBe(HILO_BARS.length);
  });
});

describe('describeLineHiloChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineHiloChart([])).toBe('No data');
  });
  it('names the Gann HiLo Activator', () => {
    expect(describeLineHiloChart(HILO_BARS, OPTS)).toContain(
      'Gann HiLo Activator',
    );
  });
  it('explains the trailing stop on a moving average cross', () => {
    const desc = describeLineHiloChart(HILO_BARS, OPTS);
    expect(desc).toContain('trailing stop');
    expect(desc).toContain('moving average');
  });
  it('reports the flip count', () => {
    expect(describeLineHiloChart(HILO_BARS, OPTS)).toContain(
      'flipping 2 times',
    );
  });
});

describe('ChartLineHilo', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLineHilo data={HILO_BARS} {...OPTS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineHilo data={HILO_BARS} {...OPTS} ariaLabel="HiLo demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('HiLo demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineHilo data={[]} />);
    const root = container.querySelector('[data-section="chart-line-hilo"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLineHilo data={HILO_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-hilo"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the period and final trend as data attributes', () => {
    const { container } = render(<ChartLineHilo data={HILO_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-hilo"]');
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-trend-final')).toBe('up');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineHilo data={HILO_BARS} {...OPTS} />);
    const svg = container.querySelector('[data-section="chart-line-hilo-svg"]');
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the HiLo Activator line', () => {
    const { container } = render(<ChartLineHilo data={HILO_BARS} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-hilo-hilo-line"]'),
    ).toBeTruthy();
  });
  it('renders one marker per flip bar', () => {
    const { container } = render(<ChartLineHilo data={HILO_BARS} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-hilo-marker"]',
    );
    expect(markers).toHaveLength(2);
  });
  it('shows the period in the config badge', () => {
    const { container } = render(<ChartLineHilo data={HILO_BARS} {...OPTS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-hilo-badge-config"]',
    );
    expect(cfg?.textContent).toBe('3');
  });
  it('renders two legend items', () => {
    const { container } = render(<ChartLineHilo data={HILO_BARS} {...OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-hilo-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });
  it('toggles the HiLo Activator off via its legend item', () => {
    const { container } = render(<ChartLineHilo data={HILO_BARS} {...OPTS} />);
    const hiloItem = container.querySelector(
      '[data-section="chart-line-hilo-legend-item"][data-series-id="hilo"]',
    ) as HTMLElement;
    fireEvent.click(hiloItem);
    expect(
      container.querySelector('[data-section="chart-line-hilo-hilo-line"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineHilo
        data={HILO_BARS}
        {...OPTS}
        hiddenSeries={new Set(['price'])}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hilo-price-path"]'),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHilo ref={ref} data={HILO_BARS} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
