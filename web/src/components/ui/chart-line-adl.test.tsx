import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineAdl,
  computeLineAdlMfm,
  computeLineAdl,
  computeLineAdlLayout,
  getLineAdlFinitePoints,
  runLineAdl,
  describeLineAdlChart,
  type ChartLineAdlPoint,
} from './chart-line-adl';

afterEach(() => cleanup());

// high 10, low 0 throughout; close at high / low / mid gives a money
// flow multiplier of +1 / -1 / 0.
const ADL_DATA: ChartLineAdlPoint[] = [
  { x: 0, high: 10, low: 0, close: 10, volume: 100 },
  { x: 1, high: 10, low: 0, close: 0, volume: 100 },
  { x: 2, high: 10, low: 0, close: 5, volume: 100 },
  { x: 3, high: 10, low: 0, close: 10, volume: 200 },
  { x: 4, high: 10, low: 0, close: 0, volume: 50 },
];

// Hand-verified:
//   mfm = ((close-low)-(high-close))/(high-low) = [1,-1,0,1,-1]
//   mfv = mfm * volume                         = [100,-100,0,200,-50]
//   adl = running cumulative total of mfv       = [100,0,0,200,150]

describe('getLineAdlFinitePoints', () => {
  it('keeps only points with finite x, high, low, close and volume', () => {
    const points = getLineAdlFinitePoints([
      { x: 0, high: 5, low: 1, close: 3, volume: 10 },
      { x: NaN, high: 5, low: 1, close: 3, volume: 10 },
      { x: 1, high: Infinity, low: 1, close: 3, volume: 10 },
      { x: 2, high: 5, low: 1, close: 3, volume: NaN },
      { x: 3, high: 9, low: 4, close: 7, volume: 20 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 3]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineAdlFinitePoints(null)).toEqual([]);
    expect(getLineAdlFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeLineAdlMfm', () => {
  it('reads plus one when the close sits at the high', () => {
    expect(computeLineAdlMfm([10], [0], [10])[0]).toBe(1);
  });

  it('reads minus one when the close sits at the low', () => {
    expect(computeLineAdlMfm([10], [0], [0])[0]).toBe(-1);
  });

  it('reads zero when the close sits at the midpoint', () => {
    expect(computeLineAdlMfm([10], [0], [5])[0]).toBe(0);
  });

  it('reads zero for a zero-range bar', () => {
    expect(computeLineAdlMfm([5], [5], [5])[0]).toBe(0);
  });

  it('computes the multiplier across a multi-bar series', () => {
    expect(computeLineAdlMfm([10, 10, 10], [0, 0, 0], [10, 0, 5])).toEqual([
      1,
      -1,
      0,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineAdlMfm(null, [0], [5])).toEqual([]);
  });
});

describe('computeLineAdl', () => {
  const highs = ADL_DATA.map((p) => p.high);
  const lows = ADL_DATA.map((p) => p.low);
  const closes = ADL_DATA.map((p) => p.close);
  const volumes = ADL_DATA.map((p) => p.volume);

  it('takes the money flow multiplier per bar', () => {
    const { mfm } = computeLineAdl(highs, lows, closes, volumes);
    expect(mfm).toEqual([1, -1, 0, 1, -1]);
  });

  it('scales the multiplier by volume into money flow volume', () => {
    const { mfv } = computeLineAdl(highs, lows, closes, volumes);
    expect(mfv).toEqual([100, -100, 0, 200, -50]);
  });

  it('accumulates the money flow volume into the ADL', () => {
    const { adl } = computeLineAdl(highs, lows, closes, volumes);
    expect(adl).toEqual([100, 0, 0, 200, 150]);
  });

  it('seeds the ADL with the first bar money flow volume', () => {
    const { mfv, adl } = computeLineAdl(highs, lows, closes, volumes);
    expect(adl[0]).toBe(mfv[0]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineAdl(null, lows, closes, volumes)).toEqual({
      mfm: [],
      mfv: [],
      adl: [],
    });
  });
});

describe('runLineAdl', () => {
  it('reports ok for a sufficient series', () => {
    const run = runLineAdl(ADL_DATA);
    expect(run.ok).toBe(true);
  });

  it('exposes the money flow and ADL series', () => {
    const run = runLineAdl(ADL_DATA);
    expect(run.mfv).toEqual([100, -100, 0, 200, -50]);
    expect(run.adl).toEqual([100, 0, 0, 200, 150]);
  });

  it('reports the final, min and max ADL readings', () => {
    const run = runLineAdl(ADL_DATA);
    expect(run.adlFinal).toBe(150);
    expect(run.adlMin).toBe(0);
    expect(run.adlMax).toBe(200);
  });

  it('counts accumulation and distribution bars', () => {
    const run = runLineAdl(ADL_DATA);
    expect(run.accumulationCount).toBe(2);
    expect(run.distributionCount).toBe(2);
  });

  it('classifies each sample by money flow direction', () => {
    const run = runLineAdl(ADL_DATA);
    expect(run.samples[0]!.flow).toBe('accumulation');
    expect(run.samples[1]!.flow).toBe('distribution');
    expect(run.samples[2]!.flow).toBe('neutral');
    expect(run.samples[3]!.flow).toBe('accumulation');
    expect(run.samples[4]!.flow).toBe('distribution');
  });

  it('defines the ADL for every sample with no warm-up', () => {
    const run = runLineAdl(ADL_DATA);
    for (const s of run.samples) {
      expect(Number.isFinite(s.adl)).toBe(true);
    }
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...ADL_DATA].reverse();
    const run = runLineAdl(shuffled);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.adl).toEqual([100, 0, 0, 200, 150]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineAdl([{ x: 0, high: 5, low: 1, close: 3, volume: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineAdl([]).ok).toBe(false);
    expect(runLineAdl(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    const run = runLineAdl(ADL_DATA);
    expect(run.samples).toHaveLength(ADL_DATA.length);
  });
});

describe('computeLineAdlLayout', () => {
  const base = {
    data: ADL_DATA,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineAdlLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('stacks the price panel above the ADL panel', () => {
    const layout = computeLineAdlLayout(base);
    expect(layout.adlPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.adlPanel.width);
  });

  it('builds non-empty price and ADL paths', () => {
    const layout = computeLineAdlLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.adlPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per sample since the ADL has no warm-up', () => {
    const layout = computeLineAdlLayout(base);
    expect(layout.markers).toHaveLength(5);
    expect(layout.priceDots).toHaveLength(5);
  });

  it('uses a data-driven ADL y domain', () => {
    const layout = computeLineAdlLayout(base);
    expect(layout.adlYMin).toBe(0);
    expect(layout.adlYMax).toBe(200);
  });

  it('places the zero line inside the ADL panel when zero is in range', () => {
    const layout = computeLineAdlLayout(base);
    expect(layout.zeroInRange).toBe(true);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.adlPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.adlPanel.y + layout.adlPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineAdlLayout(base);
    expect(layout.adlFinal).toBe(150);
    expect(layout.accumulationCount).toBe(2);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineAdlLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.adlPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineAdlLayout({
      ...base,
      data: [{ x: 0, high: 5, low: 1, close: 3, volume: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAdlChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineAdlChart(ADL_DATA);
    expect(text).toContain('Accumulation Distribution Line');
    expect(text).toContain('ADL');
    expect(text).toContain('money flow');
    expect(text).toContain('volume');
    expect(text).toContain('cumulative');
    expect(text).toContain('accumulation');
    expect(text).toContain('distribution');
  });

  it('reports the accumulation and distribution counts', () => {
    const text = describeLineAdlChart(ADL_DATA);
    expect(text).toContain('2 accumulation');
    expect(text).toContain('2 distribution');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineAdlChart([])).toBe('No data');
    expect(describeLineAdlChart(null)).toBe('No data');
  });
});

describe('<ChartLineAdl />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    const desc = container.querySelector(
      '[data-section="chart-line-adl-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Accumulation Distribution Line');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    const root = container.querySelector('[data-section="chart-line-adl"]');
    expect(root!.getAttribute('data-adl-final')).toBe('150');
    expect(root!.getAttribute('data-accumulation-count')).toBe('2');
    expect(root!.getAttribute('data-distribution-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and ADL lines', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-adl-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-adl-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-adl-adl-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per sample', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-adl-marker"]',
    );
    expect(markers).toHaveLength(5);
  });

  it('marks the accumulation and distribution markers with their flow', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    const accum = container.querySelector(
      '[data-section="chart-line-adl-marker"][data-flow="accumulation"]',
    );
    const dist = container.querySelector(
      '[data-section="chart-line-adl-marker"][data-flow="distribution"]',
    );
    expect(accum).not.toBeNull();
    expect(dist).not.toBeNull();
  });

  it('renders the zero line', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-adl-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-adl-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-adl-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge', () => {
    const { container } = render(<ChartLineAdl data={ADL_DATA} />);
    const badge = container.querySelector(
      '[data-section="chart-line-adl-badge-icon"]',
    );
    expect(badge!.textContent).toContain('ADL');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineAdl data={ADL_DATA} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adl-price-path"]'),
    ).toBeNull();
  });

  it('hides the ADL line and markers when showAdl is false', () => {
    const { container } = render(
      <ChartLineAdl data={ADL_DATA} showAdl={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adl-adl-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-adl-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineAdl data={ADL_DATA} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adl-zero-line"]'),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineAdl data={[{ x: 0, high: 5, low: 1, close: 3, volume: 1 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-adl"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-adl-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineAdl data={ADL_DATA} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adl-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAdl ref={ref} data={ADL_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-adl');
  });

  it('has a stable displayName', () => {
    expect(ChartLineAdl.displayName).toBe('ChartLineAdl');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineAdl data={ADL_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-adl"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
