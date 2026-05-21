import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineWad,
  getLineWadFinitePoints,
  computeLineWadTrueRangeHigh,
  computeLineWadTrueRangeLow,
  computeLineWadDelta,
  computeLineWad,
  runLineWad,
  computeLineWadLayout,
  describeLineWadChart,
  type ChartLineWadPoint,
} from './chart-line-wad';

afterEach(() => cleanup());

// OHLC bars chosen so every Williams AD branch fires: bar 1 closes
// up with the low dipping below the prior close, bar 3 closes down
// with the high spiking above it, bar 4 closes up with the low
// holding above the prior close, bar 5 closes down with the high
// exactly at the prior close, and bars 2 and 6 close unchanged.
// Integer OHLC keeps the whole pipeline exact.
const WAD_BARS: ChartLineWadPoint[] = [
  { x: 0, high: 12, low: 8, close: 10 },
  { x: 1, high: 15, low: 9, close: 14 },
  { x: 2, high: 16, low: 13, close: 14 },
  { x: 3, high: 16, low: 10, close: 11 },
  { x: 4, high: 14, low: 12, close: 13 },
  { x: 5, high: 13, low: 8, close: 9 },
  { x: 6, high: 11, low: 7, close: 9 },
  { x: 7, high: 16, low: 5, close: 15 },
];

const TRH_EXPECTED = [null, 15, 16, 16, 14, 13, 11, 16];
const TRL_EXPECTED = [null, 9, 13, 10, 11, 8, 7, 5];
const DELTA_EXPECTED = [null, 5, 0, -5, 2, -4, 0, 10];
const WAD_EXPECTED = [0, 5, 5, 0, 2, -2, -2, 8];
const ZONE_EXPECTED = [
  'none',
  'accumulation',
  'flat',
  'distribution',
  'accumulation',
  'distribution',
  'flat',
  'accumulation',
];

describe('getLineWadFinitePoints', () => {
  it('keeps only bars with a finite x, high, low and close', () => {
    const points = [
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 1, high: Number.NaN, low: 3, close: 4 },
      { x: 2, high: 5, low: 3, close: Number.POSITIVE_INFINITY },
      { x: 3, high: 9, low: 7, close: 8 },
    ] as ChartLineWadPoint[];
    expect(getLineWadFinitePoints(points)).toEqual([
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 3, high: 9, low: 7, close: 8 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineWadFinitePoints(null)).toEqual([]);
    expect(getLineWadFinitePoints(undefined)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineWadFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, high: 2, low: 1, close: 1.5 },
      { x: 2, high: 4, low: 3, close: 3.5 },
    ] as ChartLineWadPoint[];
    expect(getLineWadFinitePoints(points)).toEqual(points);
  });
});

describe('computeLineWadTrueRangeHigh', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWadTrueRangeHigh(null)).toEqual([]);
  });
  it('leaves the opening bar null', () => {
    expect(computeLineWadTrueRangeHigh(WAD_BARS)[0]).toBeNull();
  });
  it('is the higher of the bar high and the prior close', () => {
    expect(computeLineWadTrueRangeHigh(WAD_BARS)).toEqual(TRH_EXPECTED);
  });
  it('uses the prior close when it tops the bar high', () => {
    const bars = [
      { x: 0, high: 10, low: 5, close: 9 },
      { x: 1, high: 7, low: 4, close: 6 },
    ] as ChartLineWadPoint[];
    expect(computeLineWadTrueRangeHigh(bars)[1]).toBe(9);
  });
  it('matches the input length', () => {
    expect(computeLineWadTrueRangeHigh(WAD_BARS)).toHaveLength(
      WAD_BARS.length,
    );
  });
});

describe('computeLineWadTrueRangeLow', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWadTrueRangeLow(null)).toEqual([]);
  });
  it('leaves the opening bar null', () => {
    expect(computeLineWadTrueRangeLow(WAD_BARS)[0]).toBeNull();
  });
  it('is the lower of the bar low and the prior close', () => {
    expect(computeLineWadTrueRangeLow(WAD_BARS)).toEqual(TRL_EXPECTED);
  });
  it('uses the prior close when it undercuts the bar low', () => {
    const bars = [
      { x: 0, high: 10, low: 5, close: 6 },
      { x: 1, high: 12, low: 8, close: 11 },
    ] as ChartLineWadPoint[];
    expect(computeLineWadTrueRangeLow(bars)[1]).toBe(6);
  });
  it('matches the input length', () => {
    expect(computeLineWadTrueRangeLow(WAD_BARS)).toHaveLength(
      WAD_BARS.length,
    );
  });
});

describe('computeLineWadDelta', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWadDelta(null)).toEqual([]);
  });
  it('leaves the opening bar null', () => {
    expect(computeLineWadDelta(WAD_BARS)[0]).toBeNull();
  });
  it('measures an up-close from the true range low', () => {
    expect(computeLineWadDelta(WAD_BARS)[1]).toBe(5);
  });
  it('measures a down-close from the true range high', () => {
    expect(computeLineWadDelta(WAD_BARS)[3]).toBe(-5);
  });
  it('contributes zero on an unchanged close', () => {
    expect(computeLineWadDelta(WAD_BARS)[2]).toBe(0);
  });
  it('computes the exact accumulation/distribution series', () => {
    expect(computeLineWadDelta(WAD_BARS)).toEqual(DELTA_EXPECTED);
  });
  it('matches the input length', () => {
    expect(computeLineWadDelta(WAD_BARS)).toHaveLength(WAD_BARS.length);
  });
});

describe('computeLineWad', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWad(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(computeLineWad([])).toEqual([]);
  });
  it('starts the cumulative line at zero', () => {
    expect(computeLineWad(WAD_BARS)[0]).toBe(0);
  });
  it('accumulates the delta into an exact running total', () => {
    expect(computeLineWad(WAD_BARS)).toEqual(WAD_EXPECTED);
  });
  it('returns a single zero for a one-bar series', () => {
    expect(
      computeLineWad([{ x: 0, high: 2, low: 1, close: 1.5 }]),
    ).toEqual([0]);
  });
  it('matches the input length', () => {
    expect(computeLineWad(WAD_BARS)).toHaveLength(WAD_BARS.length);
  });
});

describe('runLineWad', () => {
  it('is not ok with fewer than two bars', () => {
    expect(runLineWad([{ x: 0, high: 2, low: 1, close: 1.5 }]).ok).toBe(
      false,
    );
  });
  it('is ok with a usable series', () => {
    expect(runLineWad(WAD_BARS).ok).toBe(true);
  });
  it('exposes the exact true range high and low series', () => {
    const run = runLineWad(WAD_BARS);
    expect(run.trueRangeHigh).toEqual(TRH_EXPECTED);
    expect(run.trueRangeLow).toEqual(TRL_EXPECTED);
  });
  it('exposes the exact delta series', () => {
    expect(runLineWad(WAD_BARS).delta).toEqual(DELTA_EXPECTED);
  });
  it('exposes the exact cumulative Williams AD series', () => {
    expect(runLineWad(WAD_BARS).wad).toEqual(WAD_EXPECTED);
  });
  it('classifies each bar by the sign of its delta', () => {
    expect(runLineWad(WAD_BARS).samples.map((s) => s.zone)).toEqual(
      ZONE_EXPECTED,
    );
  });
  it('returns one sample per bar', () => {
    expect(runLineWad(WAD_BARS).samples).toHaveLength(WAD_BARS.length);
  });
  it('counts the accumulation, distribution and flat bars', () => {
    const run = runLineWad(WAD_BARS);
    expect(run.accumulationCount).toBe(3);
    expect(run.distributionCount).toBe(2);
    expect(run.flatCount).toBe(2);
  });
  it('reports the final Williams AD reading', () => {
    expect(runLineWad(WAD_BARS).wadFinal).toBe(8);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...WAD_BARS].reverse();
    const run = runLineWad(shuffled);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineWadLayout', () => {
  const base = {
    data: WAD_BARS,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single bar', () => {
    expect(
      computeLineWadLayout({
        ...base,
        data: [{ x: 0, high: 2, low: 1, close: 1.5 }],
      }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineWadLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineWadLayout(base).ok).toBe(true);
  });
  it('stacks the price panel above the Williams AD panel', () => {
    const layout = computeLineWadLayout(base);
    expect(layout.pricePanel.y).toBeLessThan(layout.wadPanel.y);
  });
  it('builds the price and Williams AD paths', () => {
    const layout = computeLineWadLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.wadPath.length).toBeGreaterThan(0);
  });
  it('includes zero in the Williams AD y-domain', () => {
    const layout = computeLineWadLayout(base);
    expect(layout.wadYMin).toBeLessThanOrEqual(0);
    expect(layout.wadYMax).toBeGreaterThanOrEqual(0);
  });
  it('emits one marker per classified bar', () => {
    const layout = computeLineWadLayout(base);
    expect(layout.markers).toHaveLength(7);
    expect(layout.priceDots).toHaveLength(WAD_BARS.length);
  });
  it('reports the total bar count and final reading', () => {
    const layout = computeLineWadLayout(base);
    expect(layout.totalPoints).toBe(WAD_BARS.length);
    expect(layout.wadFinal).toBe(8);
  });
});

describe('describeLineWadChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineWadChart([])).toBe('No data');
  });
  it('names the Williams Accumulation/Distribution', () => {
    expect(describeLineWadChart(WAD_BARS)).toContain(
      'Williams Accumulation/Distribution',
    );
  });
  it('explains the cumulative true range measure', () => {
    const desc = describeLineWadChart(WAD_BARS);
    expect(desc).toContain('true range');
    expect(desc).toContain('cumulative');
  });
  it('reports the zone counts', () => {
    expect(describeLineWadChart(WAD_BARS)).toContain(
      'accumulates on 3 bars',
    );
  });
});

describe('ChartLineWad', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLineWad data={WAD_BARS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineWad data={WAD_BARS} ariaLabel="WAD demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('WAD demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineWad data={[]} />);
    const root = container.querySelector('[data-section="chart-line-wad"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLineWad data={WAD_BARS} />);
    const root = container.querySelector('[data-section="chart-line-wad"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the final reading and zone counts as data attributes', () => {
    const { container } = render(<ChartLineWad data={WAD_BARS} />);
    const root = container.querySelector('[data-section="chart-line-wad"]');
    expect(root?.getAttribute('data-wad-final')).toBe('8');
    expect(root?.getAttribute('data-accumulation-count')).toBe('3');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineWad data={WAD_BARS} />);
    const svg = container.querySelector('[data-section="chart-line-wad-svg"]');
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the Williams AD line', () => {
    const { container } = render(<ChartLineWad data={WAD_BARS} />);
    expect(
      container.querySelector('[data-section="chart-line-wad-wad-line"]'),
    ).toBeTruthy();
  });
  it('renders one marker per classified bar', () => {
    const { container } = render(<ChartLineWad data={WAD_BARS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-wad-marker"]',
    );
    expect(markers).toHaveLength(7);
  });
  it('renders both panel labels', () => {
    const { container } = render(<ChartLineWad data={WAD_BARS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-wad-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });
  it('shows the bar count in the config badge', () => {
    const { container } = render(<ChartLineWad data={WAD_BARS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-wad-badge-config"]',
    );
    expect(cfg?.textContent).toBe('8 bars');
  });
  it('renders two legend items', () => {
    const { container } = render(<ChartLineWad data={WAD_BARS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-wad-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });
  it('toggles the Williams AD off when its legend item is clicked', () => {
    const { container } = render(<ChartLineWad data={WAD_BARS} />);
    const wadItem = container.querySelector(
      '[data-section="chart-line-wad-legend-item"][data-series-id="wad"]',
    ) as HTMLElement;
    fireEvent.click(wadItem);
    expect(
      container.querySelector('[data-section="chart-line-wad-wad-line"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineWad data={WAD_BARS} hiddenSeries={new Set(['price'])} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wad-price-path"]'),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineWad ref={ref} data={WAD_BARS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
