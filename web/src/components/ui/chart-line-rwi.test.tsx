import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineRwi,
  computeLineRwi,
  computeLineRwiTrueRange,
  computeLineRwiLayout,
  getLineRwiFinitePoints,
  normalizeLineRwiPeriod,
  runLineRwi,
  describeLineRwiChart,
  type ChartLineRwiPoint,
} from './chart-line-rwi';

afterEach(() => cleanup());

// Seven bars, each with a high-low range of 4 and no gaps, so every
// True Range is exactly 4 and the ATR of any window is 4. The price
// climbs a clean staircase to a peak at bar 3 then descends.
//   TR  = [4, 4, 4, 4, 4, 4, 4]
// With period 3 the RWI takes the max over lookbacks k = 2, 3 of
//   high: (high[i] - low[i-k]) / (atr * sqrt(k))
//   low:  (high[i-k] - low[i]) / (atr * sqrt(k))
// Hand-verified (atr = 4 throughout):
//   RWI-high = [.,.,., 2.5/sqrt3, 1.5/sqrt3, 0.5/sqrt3, 0]
//            ~= [.,.,., 1.443376, 0.866025, 0.288675, 0]
//   RWI-low  = [.,.,., 0, 1/sqrt2, sqrt2, 2.5/sqrt3]
//            ~= [.,.,., 0, 0.707107, 1.414214, 1.443376]
const RWI_DATA: ChartLineRwiPoint[] = [
  { x: 0, high: 4, low: 0, close: 2 },
  { x: 1, high: 6, low: 2, close: 4 },
  { x: 2, high: 8, low: 4, close: 6 },
  { x: 3, high: 10, low: 6, close: 8 },
  { x: 4, high: 8, low: 4, close: 6 },
  { x: 5, high: 6, low: 2, close: 4 },
  { x: 6, high: 4, low: 0, close: 2 },
];

describe('getLineRwiFinitePoints', () => {
  it('keeps only points with finite x, high, low and close', () => {
    const points = getLineRwiFinitePoints([
      { x: 0, high: 10, low: 4, close: 8 },
      { x: NaN, high: 10, low: 4, close: 8 },
      { x: 1, high: Infinity, low: 4, close: 8 },
      { x: 2, high: 10, low: NaN, close: 8 },
      { x: 3, high: 10, low: 4, close: Infinity },
      { x: 4, high: 10, low: 4, close: 8 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 4]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineRwiFinitePoints(null)).toEqual([]);
    expect(getLineRwiFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineRwiPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineRwiPeriod(8.7, 8)).toBe(8);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineRwiPeriod(0, 8)).toBe(8);
    expect(normalizeLineRwiPeriod(NaN, 8)).toBe(8);
    expect(normalizeLineRwiPeriod(-4, 8)).toBe(8);
  });
});

describe('computeLineRwiTrueRange', () => {
  it('uses the bare high-low span for the first bar', () => {
    expect(computeLineRwiTrueRange([10], [0], [5])).toEqual([10]);
  });

  it('uses the high-low span when the prior close is inside the bar', () => {
    const tr = computeLineRwiTrueRange([20, 25], [5, 10], [15, 20]);
    expect(tr[1]).toBe(15);
  });

  it('counts a gap from the prior close', () => {
    const tr = computeLineRwiTrueRange([10, 30], [5, 25], [8, 28]);
    expect(tr[1]).toBe(22);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineRwiTrueRange(null, [0], [0])).toEqual([]);
  });
});

describe('computeLineRwi', () => {
  const highs = RWI_DATA.map((p) => p.high);
  const lows = RWI_DATA.map((p) => p.low);
  const closes = RWI_DATA.map((p) => p.close);

  it('exposes the true range series', () => {
    const { trueRange } = computeLineRwi(highs, lows, closes, 3);
    expect(trueRange).toEqual([4, 4, 4, 4, 4, 4, 4]);
  });

  it('computes the RWI-high line across the fixture', () => {
    const { rwiHigh } = computeLineRwi(highs, lows, closes, 3);
    expect(rwiHigh[3]).toBeCloseTo(1.44338, 4);
    expect(rwiHigh[4]).toBeCloseTo(0.86603, 4);
    expect(rwiHigh[5]).toBeCloseTo(0.28868, 4);
    expect(rwiHigh[6]).toBe(0);
  });

  it('computes the RWI-low line across the fixture', () => {
    const { rwiLow } = computeLineRwi(highs, lows, closes, 3);
    expect(rwiLow[3]).toBe(0);
    expect(rwiLow[4]).toBeCloseTo(0.70711, 4);
    expect(rwiLow[5]).toBeCloseTo(1.41421, 4);
    expect(rwiLow[6]).toBeCloseTo(1.44338, 4);
  });

  it('selects the largest ratio across the lookbacks', () => {
    // At index 4 the RWI-high peak comes from k=3 and the RWI-low
    // peak from k=2 -- the max is taken per line, per lookback.
    const { rwiHigh, rwiLow } = computeLineRwi(highs, lows, closes, 3);
    expect(rwiHigh[4]).toBeCloseTo(0.86603, 4);
    expect(rwiLow[4]).toBeCloseTo(0.70711, 4);
  });

  it('leaves the first period bars as a null warm-up', () => {
    const { rwiHigh, rwiLow } = computeLineRwi(highs, lows, closes, 3);
    expect(rwiHigh[0]).toBeNull();
    expect(rwiHigh[2]).toBeNull();
    expect(rwiHigh[3]).not.toBeNull();
    expect(rwiLow[2]).toBeNull();
  });

  it('clamps both lines to be non-negative', () => {
    const { rwiHigh, rwiLow } = computeLineRwi(highs, lows, closes, 3);
    for (const v of [...rwiHigh, ...rwiLow]) {
      if (v !== null) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('reads 0 for a zero-volatility window rather than dividing by zero', () => {
    const { rwiHigh, rwiLow } = computeLineRwi(
      [5, 5, 5, 5],
      [5, 5, 5, 5],
      [5, 5, 5, 5],
      3,
    );
    expect(rwiHigh[3]).toBe(0);
    expect(rwiLow[3]).toBe(0);
    expect(Number.isNaN(rwiHigh[3])).toBe(false);
  });

  it('leaves the index undefined for a period below 2', () => {
    const { rwiHigh, rwiLow } = computeLineRwi(highs, lows, closes, 1);
    expect(rwiHigh.every((v) => v === null)).toBe(true);
    expect(rwiLow.every((v) => v === null)).toBe(true);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineRwi(null, lows, closes, 3)).toEqual({
      trueRange: [],
      rwiHigh: [],
      rwiLow: [],
    });
  });
});

describe('runLineRwi', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineRwi(RWI_DATA, { period: 3 }).ok).toBe(true);
  });

  it('carries the period and trend threshold onto the run', () => {
    const run = runLineRwi(RWI_DATA, { period: 3 });
    expect(run.period).toBe(3);
    expect(run.trendThreshold).toBe(1);
  });

  it('exposes the true range and the two RWI lines', () => {
    const run = runLineRwi(RWI_DATA, { period: 3 });
    expect(run.trueRange).toEqual([4, 4, 4, 4, 4, 4, 4]);
    expect(run.rwiHigh[3]).toBeCloseTo(1.44338, 4);
    expect(run.rwiLow[5]).toBeCloseTo(1.41421, 4);
  });

  it('reports the final RWI-high and RWI-low readings', () => {
    const run = runLineRwi(RWI_DATA, { period: 3 });
    expect(run.rwiHighFinal).toBe(0);
    expect(run.rwiLowFinal).toBeCloseTo(1.44338, 4);
  });

  it('classifies each sample as uptrend, downtrend or ranging', () => {
    const run = runLineRwi(RWI_DATA, { period: 3 });
    expect(run.samples[2]!.state).toBe('ranging');
    expect(run.samples[3]!.state).toBe('uptrend');
    expect(run.samples[4]!.state).toBe('ranging');
    expect(run.samples[5]!.state).toBe('downtrend');
    expect(run.samples[6]!.state).toBe('downtrend');
  });

  it('counts uptrend and downtrend periods', () => {
    const run = runLineRwi(RWI_DATA, { period: 3 });
    expect(run.uptrendCount).toBe(1);
    expect(run.downtrendCount).toBe(2);
  });

  it('leaves warm-up samples with null RWI readings', () => {
    const run = runLineRwi(RWI_DATA, { period: 3 });
    expect(run.samples[0]!.rwiHigh).toBeNull();
    expect(run.samples[0]!.rwiLow).toBeNull();
    expect(run.samples[3]!.rwiHigh).not.toBeNull();
  });

  it('honours a custom trend threshold', () => {
    const run = runLineRwi(RWI_DATA, { period: 3, trendThreshold: 0.8 });
    expect(run.trendThreshold).toBe(0.8);
    // index 4 RWI-high 0.866 now clears the lowered threshold.
    expect(run.samples[4]!.state).toBe('uptrend');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...RWI_DATA].reverse();
    const run = runLineRwi(shuffled, { period: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.rwiHigh[3]).toBeCloseTo(1.44338, 4);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineRwi([{ x: 0, high: 10, low: 4, close: 8 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineRwi([]).ok).toBe(false);
    expect(runLineRwi(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineRwi(RWI_DATA, { period: 3 }).samples).toHaveLength(7);
  });

  it('defaults to period 8 and reads no index for a short series', () => {
    const run = runLineRwi(RWI_DATA);
    expect(run.period).toBe(8);
    expect(run.rwiHigh.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.rwiHighFinal)).toBe(true);
  });
});

describe('computeLineRwiLayout', () => {
  const base = {
    data: RWI_DATA,
    period: 3,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineRwiLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('stacks the price panel above the RWI panel', () => {
    const layout = computeLineRwiLayout(base);
    expect(layout.rwiPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.rwiPanel.width);
  });

  it('builds non-empty price and RWI-high and RWI-low paths', () => {
    const layout = computeLineRwiLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.rwiHighPath.startsWith('M')).toBe(true);
    expect(layout.rwiLowPath.startsWith('M')).toBe(true);
  });

  it('emits a marker per line only where the index is defined', () => {
    const layout = computeLineRwiLayout(base);
    expect(layout.rwiHighMarkers).toHaveLength(4);
    expect(layout.rwiLowMarkers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('anchors the RWI y-domain at zero', () => {
    const layout = computeLineRwiLayout(base);
    expect(layout.rwiYMin).toBe(0);
    expect(layout.rwiYMax).toBeGreaterThan(1);
  });

  it('places the threshold line inside the RWI panel', () => {
    const layout = computeLineRwiLayout(base);
    expect(layout.thresholdValue).toBe(1);
    expect(layout.thresholdY).toBeGreaterThanOrEqual(layout.rwiPanel.y);
    expect(layout.thresholdY).toBeLessThanOrEqual(
      layout.rwiPanel.y + layout.rwiPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineRwiLayout(base);
    expect(layout.rwiHighFinal).toBe(0);
    expect(layout.uptrendCount).toBe(1);
    expect(layout.downtrendCount).toBe(2);
    expect(layout.period).toBe(3);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineRwiLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.rwiHighPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineRwiLayout({
      ...base,
      data: [{ x: 0, high: 10, low: 4, close: 8 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineRwiChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineRwiChart(RWI_DATA, { period: 3 });
    expect(text).toContain('Random Walk Index');
    expect(text).toContain('random walk');
    expect(text).toContain('true range');
    expect(text).toContain('square root');
    expect(text).toContain('uptrend');
    expect(text).toContain('downtrend');
  });

  it('reports the uptrend and downtrend counts', () => {
    const text = describeLineRwiChart(RWI_DATA, { period: 3 });
    expect(text).toContain('1 uptrend');
    expect(text).toContain('2 downtrend');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineRwiChart([])).toBe('No data');
    expect(describeLineRwiChart(null)).toBe('No data');
  });
});

describe('<ChartLineRwi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineRwi data={RWI_DATA} period={3} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineRwi data={RWI_DATA} period={3} />);
    const desc = container.querySelector(
      '[data-section="chart-line-rwi-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Random Walk Index');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineRwi data={RWI_DATA} period={3} />);
    const root = container.querySelector('[data-section="chart-line-rwi"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-uptrend-count')).toBe('1');
    expect(root!.getAttribute('data-downtrend-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
    expect(
      Number(root!.getAttribute('data-rwi-low-final')),
    ).toBeCloseTo(1.44338, 2);
  });

  it('renders an svg with the price and both RWI lines', () => {
    const { container } = render(<ChartLineRwi data={RWI_DATA} period={3} />);
    expect(
      container.querySelector('[data-section="chart-line-rwi-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-rwi-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-rwi-high-line"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-rwi-low-line"]'),
    ).not.toBeNull();
  });

  it('renders markers for both RWI lines', () => {
    const { container } = render(<ChartLineRwi data={RWI_DATA} period={3} />);
    const highMarkers = container.querySelectorAll(
      '[data-section="chart-line-rwi-marker"][data-line="high"]',
    );
    const lowMarkers = container.querySelectorAll(
      '[data-section="chart-line-rwi-marker"][data-line="low"]',
    );
    expect(highMarkers).toHaveLength(4);
    expect(lowMarkers).toHaveLength(4);
  });

  it('renders the threshold line', () => {
    const { container } = render(<ChartLineRwi data={RWI_DATA} period={3} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rwi-threshold-line"]',
      ),
    ).not.toBeNull();
  });

  it('hides the threshold line when showThreshold is false', () => {
    const { container } = render(
      <ChartLineRwi data={RWI_DATA} period={3} showThreshold={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rwi-threshold-line"]',
      ),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineRwi data={RWI_DATA} period={3} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-rwi-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a three-item legend', () => {
    const { container } = render(<ChartLineRwi data={RWI_DATA} period={3} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-rwi-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineRwi data={RWI_DATA} period={3} />);
    const badge = container.querySelector(
      '[data-section="chart-line-rwi-badge-period"]',
    );
    expect(badge!.textContent).toContain('3');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineRwi data={RWI_DATA} period={3} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rwi-price-path"]'),
    ).toBeNull();
  });

  it('hides the RWI-high line and markers when showRwiHigh is false', () => {
    const { container } = render(
      <ChartLineRwi data={RWI_DATA} period={3} showRwiHigh={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rwi-high-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-rwi-marker"][data-line="high"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the RWI-low line via the hidden set', () => {
    const { container } = render(
      <ChartLineRwi data={RWI_DATA} period={3} hiddenSeries={['rwiLow']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rwi-low-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineRwi
        data={RWI_DATA}
        period={3}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-rwi-legend-item"][data-series-id="rwiHigh"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'rwiHigh', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineRwi data={RWI_DATA} period={3} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-rwi-dot"]'),
    ).toHaveLength(7);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineRwi data={[{ x: 0, high: 10, low: 4, close: 8 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-rwi"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-rwi-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineRwi data={RWI_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rwi-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRwi ref={ref} data={RWI_DATA} period={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-rwi');
  });

  it('has a stable displayName', () => {
    expect(ChartLineRwi.displayName).toBe('ChartLineRwi');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineRwi data={RWI_DATA} period={3} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-rwi"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
