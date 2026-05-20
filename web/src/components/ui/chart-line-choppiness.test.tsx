import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineChoppiness,
  computeLineChoppiness,
  computeLineChoppinessTrueRange,
  computeLineChoppinessLayout,
  getLineChoppinessFinitePoints,
  normalizeLineChoppinessPeriod,
  runLineChoppiness,
  describeLineChoppinessChart,
  type ChartLineChoppinessPoint,
} from './chart-line-choppiness';

afterEach(() => cleanup());

// Every bar has a high-low range of 10 and no gaps, so the True Range
// of each bar is exactly 10. Bars 0-3 climb a clean staircase; bars
// 4-6 range inside [30, 40].
//   TR = [10, 10, 10, 10, 10, 10, 10]
// With period 4 the Choppiness Index = 100*log10(sumTR/extent)/log10(4):
//   CHOP[3] window 0..3: sumTR 40, extent 40-0=40, ratio 1 -> 0    (trend)
//   CHOP[4] window 1..4: sumTR 40, extent 40-10=30, ratio 4/3 -> ~20.752
//   CHOP[5] window 2..5: sumTR 40, extent 40-20=20, ratio 2   -> 50
//   CHOP[6] window 3..6: sumTR 40, extent 40-30=10, ratio 4   -> 100  (chop)
const CHOP_DATA: ChartLineChoppinessPoint[] = [
  { x: 0, high: 10, low: 0, close: 10 },
  { x: 1, high: 20, low: 10, close: 20 },
  { x: 2, high: 30, low: 20, close: 30 },
  { x: 3, high: 40, low: 30, close: 40 },
  { x: 4, high: 40, low: 30, close: 30 },
  { x: 5, high: 40, low: 30, close: 40 },
  { x: 6, high: 40, low: 30, close: 30 },
];

describe('getLineChoppinessFinitePoints', () => {
  it('keeps only points with finite x, high, low and close', () => {
    const points = getLineChoppinessFinitePoints([
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
    expect(getLineChoppinessFinitePoints(null)).toEqual([]);
    expect(getLineChoppinessFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineChoppinessPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineChoppinessPeriod(14.8, 14)).toBe(14);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineChoppinessPeriod(0, 14)).toBe(14);
    expect(normalizeLineChoppinessPeriod(NaN, 14)).toBe(14);
    expect(normalizeLineChoppinessPeriod(-2, 14)).toBe(14);
  });
});

describe('computeLineChoppinessTrueRange', () => {
  it('uses the bare high-low span for the first bar', () => {
    expect(computeLineChoppinessTrueRange([10], [0], [5])).toEqual([10]);
  });

  it('uses the high-low span when the prior close is inside the bar', () => {
    const tr = computeLineChoppinessTrueRange([20, 25], [5, 10], [15, 20]);
    expect(tr[1]).toBe(15);
  });

  it('counts a gap up from the prior close', () => {
    const tr = computeLineChoppinessTrueRange([10, 30], [5, 25], [8, 28]);
    expect(tr[1]).toBe(22);
  });

  it('counts a gap down from the prior close', () => {
    const tr = computeLineChoppinessTrueRange([20, 8], [15, 3], [18, 5]);
    expect(tr[1]).toBe(15);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineChoppinessTrueRange(null, [0], [0])).toEqual([]);
  });
});

describe('computeLineChoppiness', () => {
  const highs = CHOP_DATA.map((p) => p.high);
  const lows = CHOP_DATA.map((p) => p.low);
  const closes = CHOP_DATA.map((p) => p.close);

  it('exposes the true range series', () => {
    const { trueRange } = computeLineChoppiness(highs, lows, closes, 4);
    expect(trueRange).toEqual([10, 10, 10, 10, 10, 10, 10]);
  });

  it('reads 0 for a trending staircase window', () => {
    const { chop } = computeLineChoppiness(highs, lows, closes, 4);
    expect(chop[3]).toBe(0);
  });

  it('reads 100 for a fully retracing window', () => {
    const { chop } = computeLineChoppiness(highs, lows, closes, 4);
    expect(chop[6]).toBeCloseTo(100, 6);
  });

  it('rates the intermediate windows between 0 and 100', () => {
    const { chop } = computeLineChoppiness(highs, lows, closes, 4);
    expect(chop[4]).toBeCloseTo(20.752, 2);
    expect(chop[5]).toBeCloseTo(50, 3);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const { chop } = computeLineChoppiness(highs, lows, closes, 4);
    expect(chop[0]).toBeNull();
    expect(chop[1]).toBeNull();
    expect(chop[2]).toBeNull();
    expect(chop[3]).not.toBeNull();
  });

  it('stays within the 0 to 100 bound', () => {
    const { chop } = computeLineChoppiness(highs, lows, closes, 4);
    for (const v of chop) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('reads 0 for a zero-extent window rather than dividing by zero', () => {
    const { chop } = computeLineChoppiness([5, 5, 5], [5, 5, 5], [5, 5, 5], 3);
    expect(chop[2]).toBe(0);
    expect(Number.isNaN(chop[2])).toBe(false);
  });

  it('leaves the index undefined for a period below 2', () => {
    const { chop } = computeLineChoppiness(highs, lows, closes, 1);
    expect(chop.every((v) => v === null)).toBe(true);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineChoppiness(null, lows, closes, 4)).toEqual({
      trueRange: [],
      chop: [],
    });
  });
});

describe('runLineChoppiness', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineChoppiness(CHOP_DATA, { period: 4 }).ok).toBe(true);
  });

  it('carries the period and thresholds onto the run', () => {
    const run = runLineChoppiness(CHOP_DATA, { period: 4 });
    expect(run.period).toBe(4);
    expect(run.choppyThreshold).toBe(61.8);
    expect(run.trendingThreshold).toBe(38.2);
  });

  it('exposes the true range and Choppiness Index series', () => {
    const run = runLineChoppiness(CHOP_DATA, { period: 4 });
    expect(run.trueRange).toEqual([10, 10, 10, 10, 10, 10, 10]);
    expect(run.chop[3]).toBe(0);
    expect(run.chop[6]).toBeCloseTo(100, 6);
  });

  it('reports the final Choppiness Index reading', () => {
    const run = runLineChoppiness(CHOP_DATA, { period: 4 });
    expect(run.chopFinal).toBeCloseTo(100, 6);
  });

  it('classifies each sample as choppy, trending or neutral', () => {
    const run = runLineChoppiness(CHOP_DATA, { period: 4 });
    expect(run.samples[2]!.state).toBe('neutral');
    expect(run.samples[3]!.state).toBe('trending');
    expect(run.samples[4]!.state).toBe('trending');
    expect(run.samples[5]!.state).toBe('neutral');
    expect(run.samples[6]!.state).toBe('choppy');
  });

  it('counts choppy and trending periods', () => {
    const run = runLineChoppiness(CHOP_DATA, { period: 4 });
    expect(run.choppyCount).toBe(1);
    expect(run.trendingCount).toBe(2);
  });

  it('leaves warm-up samples with a null Choppiness Index', () => {
    const run = runLineChoppiness(CHOP_DATA, { period: 4 });
    expect(run.samples[0]!.chop).toBeNull();
    expect(run.samples[3]!.chop).toBe(0);
  });

  it('honours custom choppy and trending thresholds', () => {
    const run = runLineChoppiness(CHOP_DATA, {
      period: 4,
      choppyThreshold: 45,
      trendingThreshold: 15,
    });
    expect(run.choppyThreshold).toBe(45);
    expect(run.samples[5]!.state).toBe('choppy');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...CHOP_DATA].reverse();
    const run = runLineChoppiness(shuffled, { period: 4 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.chop[3]).toBe(0);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineChoppiness([
      { x: 0, high: 10, low: 4, close: 8 },
    ]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineChoppiness([]).ok).toBe(false);
    expect(runLineChoppiness(null).ok).toBe(false);
  });

  it('defaults to period 14 and reads no index for a short series', () => {
    const run = runLineChoppiness(CHOP_DATA);
    expect(run.period).toBe(14);
    expect(run.chop.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.chopFinal)).toBe(true);
  });
});

describe('computeLineChoppinessLayout', () => {
  const base = {
    data: CHOP_DATA,
    period: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineChoppinessLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('stacks the price panel above the Choppiness panel', () => {
    const layout = computeLineChoppinessLayout(base);
    expect(layout.chopPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.chopPanel.width);
  });

  it('builds non-empty price and Choppiness paths', () => {
    const layout = computeLineChoppinessLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.chopPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the index is defined', () => {
    const layout = computeLineChoppinessLayout(base);
    expect(layout.markers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('uses a fixed 0 to 100 Choppiness y-axis', () => {
    const layout = computeLineChoppinessLayout(base);
    const values = layout.chopYTicks.map((t) => t.value);
    expect(Math.min(...values)).toBe(0);
    expect(Math.max(...values)).toBe(100);
  });

  it('places the choppy threshold line above the trending line', () => {
    const layout = computeLineChoppinessLayout(base);
    expect(layout.choppyY).toBeLessThan(layout.trendingY);
  });

  it('gives both threshold zones a positive height', () => {
    const layout = computeLineChoppinessLayout(base);
    expect(layout.choppyZone.height).toBeGreaterThan(0);
    expect(layout.trendingZone.height).toBeGreaterThan(0);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineChoppinessLayout(base);
    expect(layout.chopFinal).toBeCloseTo(100, 6);
    expect(layout.choppyCount).toBe(1);
    expect(layout.trendingCount).toBe(2);
    expect(layout.period).toBe(4);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineChoppinessLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.chopPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineChoppinessLayout({
      ...base,
      data: [{ x: 0, high: 10, low: 4, close: 8 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineChoppinessChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineChoppinessChart(CHOP_DATA, { period: 4 });
    expect(text).toContain('Choppiness Index');
    expect(text).toContain('true range');
    expect(text).toContain('trending');
    expect(text).toContain('ranging');
    expect(text).toContain('0 to 100');
  });

  it('reports the choppy and trending counts', () => {
    const text = describeLineChoppinessChart(CHOP_DATA, { period: 4 });
    expect(text).toContain('1 choppy');
    expect(text).toContain('2 trending');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineChoppinessChart([])).toBe('No data');
    expect(describeLineChoppinessChart(null)).toBe('No data');
  });
});

describe('<ChartLineChoppiness />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-choppiness-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Choppiness Index');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-choppiness"]',
    );
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-choppy-count')).toBe('1');
    expect(root!.getAttribute('data-trending-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and Choppiness lines', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-choppiness-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-chop-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one marker per defined Choppiness value', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-choppiness-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('tags markers with their choppy or trending state', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    const choppy = container.querySelector(
      '[data-section="chart-line-choppiness-marker"][data-state="choppy"]',
    );
    const trending = container.querySelector(
      '[data-section="chart-line-choppiness-marker"][data-state="trending"]',
    );
    expect(choppy).not.toBeNull();
    expect(trending).not.toBeNull();
  });

  it('renders both threshold zone rectangles', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    const zones = container.querySelectorAll(
      '[data-section="chart-line-choppiness-zone"]',
    );
    expect(zones).toHaveLength(2);
  });

  it('hides the zones when showZones is false', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} showZones={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-choppiness-zone"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-choppiness-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-choppiness-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-choppiness-badge-period"]',
    );
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineChoppiness
        data={CHOP_DATA}
        period={4}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the Choppiness line and markers when showChop is false', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} showChop={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-chop-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-choppiness-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-choppiness-dot"]'),
    ).toHaveLength(7);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineChoppiness data={[{ x: 0, high: 10, low: 4, close: 8 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-choppiness"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-choppiness-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineChoppiness
        data={CHOP_DATA}
        period={4}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-choppiness-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineChoppiness ref={ref} data={CHOP_DATA} period={4} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-choppiness',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineChoppiness.displayName).toBe('ChartLineChoppiness');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineChoppiness data={CHOP_DATA} period={4} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-choppiness"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
