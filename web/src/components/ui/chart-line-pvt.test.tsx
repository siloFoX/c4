import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLinePvt,
  computeLinePvt,
  computeLinePvtLayout,
  getLinePvtFinitePoints,
  runLinePvt,
  describeLinePvtChart,
  type ChartLinePvtPoint,
} from './chart-line-pvt';

afterEach(() => cleanup());

// Closes are powers-of-two ratios so the percentage change is exact:
// roc = [0, 0.5, -0.5, 0, 1].
const PVT_DATA: ChartLinePvtPoint[] = [
  { x: 0, close: 8, volume: 100 },
  { x: 1, close: 12, volume: 20 },
  { x: 2, close: 6, volume: 40 },
  { x: 3, close: 6, volume: 100 },
  { x: 4, close: 12, volume: 30 },
];

// Hand-verified:
//   roc = (close[i] - close[i-1]) / close[i-1] = [0, 0.5, -0.5, 0, 1]
//   pvc = volume * roc                         = [0, 10, -20, 0, 30]
//   pvt = running cumulative total of pvc       = [0, 10, -10, -10, 20]

describe('getLinePvtFinitePoints', () => {
  it('keeps only points with finite x, close and volume', () => {
    const points = getLinePvtFinitePoints([
      { x: 0, close: 5, volume: 10 },
      { x: NaN, close: 5, volume: 10 },
      { x: 1, close: Infinity, volume: 10 },
      { x: 2, close: 5, volume: NaN },
      { x: 3, close: 9, volume: 20 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 3]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLinePvtFinitePoints(null)).toEqual([]);
    expect(getLinePvtFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeLinePvt', () => {
  const closes = PVT_DATA.map((p) => p.close);
  const volumes = PVT_DATA.map((p) => p.volume);

  it('takes the percentage price change as the rate of change', () => {
    const { roc } = computeLinePvt([8, 12, 6], [1, 1, 1]);
    expect(roc).toEqual([0, 0.5, -0.5]);
  });

  it('scales the rate of change by volume into a contribution', () => {
    const { pvc } = computeLinePvt(closes, volumes);
    expect(pvc).toEqual([0, 10, -20, 0, 30]);
  });

  it('accumulates the contribution into the running PVT', () => {
    const { pvt } = computeLinePvt(closes, volumes);
    expect(pvt).toEqual([0, 10, -10, -10, 20]);
  });

  it('seeds the first PVT at zero with no prior close', () => {
    const { pvt } = computeLinePvt([8, 12], [100, 20]);
    expect(pvt[0]).toBe(0);
  });

  it('reads a zero rate of change when the prior close is zero', () => {
    const { roc, pvt } = computeLinePvt([0, 5], [1, 1]);
    expect(roc).toEqual([0, 0]);
    expect(pvt).toEqual([0, 0]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLinePvt(null, volumes)).toEqual({
      roc: [],
      pvc: [],
      pvt: [],
    });
  });
});

describe('runLinePvt', () => {
  it('reports ok for a sufficient series', () => {
    const run = runLinePvt(PVT_DATA);
    expect(run.ok).toBe(true);
  });

  it('exposes the rate-of-change, contribution and PVT series', () => {
    const run = runLinePvt(PVT_DATA);
    expect(run.roc).toEqual([0, 0.5, -0.5, 0, 1]);
    expect(run.pvc).toEqual([0, 10, -20, 0, 30]);
    expect(run.pvt).toEqual([0, 10, -10, -10, 20]);
  });

  it('reports the final, min and max PVT readings', () => {
    const run = runLinePvt(PVT_DATA);
    expect(run.pvtFinal).toBe(20);
    expect(run.pvtMin).toBe(-10);
    expect(run.pvtMax).toBe(20);
  });

  it('counts rising and falling bars', () => {
    const run = runLinePvt(PVT_DATA);
    expect(run.risingCount).toBe(2);
    expect(run.fallingCount).toBe(1);
  });

  it('classifies each sample by contribution direction', () => {
    const run = runLinePvt(PVT_DATA);
    expect(run.samples[0]!.flow).toBe('flat');
    expect(run.samples[1]!.flow).toBe('rising');
    expect(run.samples[2]!.flow).toBe('falling');
    expect(run.samples[3]!.flow).toBe('flat');
    expect(run.samples[4]!.flow).toBe('rising');
  });

  it('defines the PVT for every sample with no warm-up', () => {
    const run = runLinePvt(PVT_DATA);
    for (const s of run.samples) {
      expect(Number.isFinite(s.pvt)).toBe(true);
    }
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...PVT_DATA].reverse();
    const run = runLinePvt(shuffled);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.pvt).toEqual([0, 10, -10, -10, 20]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLinePvt([{ x: 0, close: 5, volume: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLinePvt([]).ok).toBe(false);
    expect(runLinePvt(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    const run = runLinePvt(PVT_DATA);
    expect(run.samples).toHaveLength(PVT_DATA.length);
  });

  it('exposes the contribution on every sample', () => {
    const run = runLinePvt(PVT_DATA);
    expect(run.samples[2]!.pvc).toBe(-20);
  });
});

describe('computeLinePvtLayout', () => {
  const base = {
    data: PVT_DATA,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLinePvtLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('stacks the price panel above the PVT panel', () => {
    const layout = computeLinePvtLayout(base);
    expect(layout.pvtPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.pvtPanel.width);
  });

  it('builds non-empty price and PVT paths', () => {
    const layout = computeLinePvtLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.pvtPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per sample since the PVT has no warm-up', () => {
    const layout = computeLinePvtLayout(base);
    expect(layout.markers).toHaveLength(5);
    expect(layout.priceDots).toHaveLength(5);
  });

  it('uses a data-driven PVT y domain', () => {
    const layout = computeLinePvtLayout(base);
    expect(layout.pvtYMin).toBe(-10);
    expect(layout.pvtYMax).toBe(20);
  });

  it('places the zero line inside the PVT panel when zero is in range', () => {
    const layout = computeLinePvtLayout(base);
    expect(layout.zeroInRange).toBe(true);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.pvtPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.pvtPanel.y + layout.pvtPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLinePvtLayout(base);
    expect(layout.pvtFinal).toBe(20);
    expect(layout.risingCount).toBe(2);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLinePvtLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.pvtPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLinePvtLayout({
      ...base,
      data: [{ x: 0, close: 5, volume: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLinePvtChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLinePvtChart(PVT_DATA);
    expect(text).toContain('Price Volume Trend');
    expect(text).toContain('PVT');
    expect(text).toContain('volume');
    expect(text).toContain('cumulative');
    expect(text).toContain('percentage price change');
    expect(text).toContain('rising');
    expect(text).toContain('falling');
  });

  it('reports the rising and falling counts', () => {
    const text = describeLinePvtChart(PVT_DATA);
    expect(text).toContain('2 rising');
    expect(text).toContain('1 falling');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLinePvtChart([])).toBe('No data');
    expect(describeLinePvtChart(null)).toBe('No data');
  });
});

describe('<ChartLinePvt />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    const desc = container.querySelector(
      '[data-section="chart-line-pvt-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Price Volume Trend');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    const root = container.querySelector('[data-section="chart-line-pvt"]');
    expect(root!.getAttribute('data-pvt-final')).toBe('20');
    expect(root!.getAttribute('data-rising-count')).toBe('2');
    expect(root!.getAttribute('data-falling-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and PVT lines', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-pvt-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-pvt-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-pvt-pvt-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per sample', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pvt-marker"]',
    );
    expect(markers).toHaveLength(5);
  });

  it('marks the rising and falling markers with their flow', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    const rising = container.querySelector(
      '[data-section="chart-line-pvt-marker"][data-flow="rising"]',
    );
    const falling = container.querySelector(
      '[data-section="chart-line-pvt-marker"][data-flow="falling"]',
    );
    expect(rising).not.toBeNull();
    expect(falling).not.toBeNull();
  });

  it('renders the zero line', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-pvt-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-pvt-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-pvt-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} />);
    const badge = container.querySelector(
      '[data-section="chart-line-pvt-badge-icon"]',
    );
    expect(badge!.textContent).toContain('PVT');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLinePvt data={PVT_DATA} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pvt-price-path"]'),
    ).toBeNull();
  });

  it('hides the PVT line and markers when showPvt is false', () => {
    const { container } = render(
      <ChartLinePvt data={PVT_DATA} showPvt={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pvt-pvt-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-pvt-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLinePvt data={PVT_DATA} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pvt-zero-line"]'),
    ).toBeNull();
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(<ChartLinePvt data={PVT_DATA} showDots />);
    expect(
      container.querySelectorAll('[data-section="chart-line-pvt-dot"]'),
    ).toHaveLength(5);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLinePvt data={[{ x: 0, close: 5, volume: 1 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-pvt"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-pvt-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLinePvt data={PVT_DATA} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pvt-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePvt ref={ref} data={PVT_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-pvt');
  });

  it('has a stable displayName', () => {
    expect(ChartLinePvt.displayName).toBe('ChartLinePvt');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLinePvt data={PVT_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-pvt"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
