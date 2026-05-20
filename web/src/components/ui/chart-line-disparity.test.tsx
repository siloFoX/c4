import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineDisparity,
  computeLineDisparity,
  computeLineDisparitySma,
  computeLineDisparityLayout,
  getLineDisparityFinitePoints,
  normalizeLineDisparityPeriod,
  runLineDisparity,
  describeLineDisparityChart,
  type ChartLineDisparityPoint,
} from './chart-line-disparity';

afterEach(() => cleanup());

// Six prices whose every three-bar window sums to 30, so the
// period-3 simple moving average is exactly 10 throughout. The
// Disparity Index is then 100 * (price - 10) / 10 = 10*price - 100:
//   disparity = [null, null, 50, -40, -10, 50]
const DISPARITY_DATA: ChartLineDisparityPoint[] = [
  { x: 0, value: 6 },
  { x: 1, value: 9 },
  { x: 2, value: 15 },
  { x: 3, value: 6 },
  { x: 4, value: 9 },
  { x: 5, value: 15 },
];

describe('getLineDisparityFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineDisparityFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineDisparityFinitePoints(null)).toEqual([]);
    expect(getLineDisparityFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineDisparityPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineDisparityPeriod(14.8, 14)).toBe(14);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineDisparityPeriod(0, 14)).toBe(14);
    expect(normalizeLineDisparityPeriod(NaN, 14)).toBe(14);
    expect(normalizeLineDisparityPeriod(-3, 14)).toBe(14);
  });
});

describe('computeLineDisparitySma', () => {
  it('averages each trailing window of the period', () => {
    expect(computeLineDisparitySma([6, 9, 15, 6], 3)).toEqual([
      null,
      null,
      10,
      10,
    ]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const sma = computeLineDisparitySma([6, 9, 15, 6], 3);
    expect(sma[1]).toBeNull();
    expect(sma[2]).not.toBeNull();
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineDisparitySma([3, 7, 9], 1)).toEqual([3, 7, 9]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineDisparitySma(null, 3)).toEqual([]);
  });
});

describe('computeLineDisparity', () => {
  const values = DISPARITY_DATA.map((p) => p.value);

  it('exposes the simple moving average series', () => {
    const { sma } = computeLineDisparity(values, 3);
    expect(sma).toEqual([null, null, 10, 10, 10, 10]);
  });

  it('rates the price distance from the average as a percent', () => {
    const { disparity } = computeLineDisparity(values, 3);
    expect(disparity).toEqual([null, null, 50, -40, -10, 50]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const { disparity } = computeLineDisparity(values, 3);
    expect(disparity[0]).toBeNull();
    expect(disparity[1]).toBeNull();
    expect(disparity[2]).not.toBeNull();
  });

  it('reads 0 when the price equals its moving average', () => {
    const { disparity } = computeLineDisparity([5, 5, 5, 5], 3);
    expect(disparity).toEqual([null, null, 0, 0]);
  });

  it('reads 0 for a zero moving average rather than dividing by zero', () => {
    const { sma, disparity } = computeLineDisparity([3, -3, 0], 3);
    expect(sma[2]).toBe(0);
    expect(disparity[2]).toBe(0);
    expect(Number.isNaN(disparity[2])).toBe(false);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineDisparity(null, 3)).toEqual({ sma: [], disparity: [] });
  });
});

describe('runLineDisparity', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineDisparity(DISPARITY_DATA, { period: 3 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineDisparity(DISPARITY_DATA, { period: 3 }).period).toBe(3);
  });

  it('exposes the sma and disparity series', () => {
    const run = runLineDisparity(DISPARITY_DATA, { period: 3 });
    expect(run.sma).toEqual([null, null, 10, 10, 10, 10]);
    expect(run.disparity).toEqual([null, null, 50, -40, -10, 50]);
  });

  it('reports the final, min and max disparity readings', () => {
    const run = runLineDisparity(DISPARITY_DATA, { period: 3 });
    expect(run.disparityFinal).toBe(50);
    expect(run.disparityMin).toBe(-40);
    expect(run.disparityMax).toBe(50);
  });

  it('classifies each sample by the sign of the disparity', () => {
    const run = runLineDisparity(DISPARITY_DATA, { period: 3 });
    expect(run.samples[1]!.sign).toBe('zero');
    expect(run.samples[2]!.sign).toBe('positive');
    expect(run.samples[3]!.sign).toBe('negative');
    expect(run.samples[4]!.sign).toBe('negative');
    expect(run.samples[5]!.sign).toBe('positive');
  });

  it('counts positive and negative readings', () => {
    const run = runLineDisparity(DISPARITY_DATA, { period: 3 });
    expect(run.positiveCount).toBe(2);
    expect(run.negativeCount).toBe(2);
  });

  it('leaves warm-up samples with a null disparity', () => {
    const run = runLineDisparity(DISPARITY_DATA, { period: 3 });
    expect(run.samples[0]!.disparity).toBeNull();
    expect(run.samples[2]!.disparity).toBe(50);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...DISPARITY_DATA].reverse();
    const run = runLineDisparity(shuffled, { period: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.disparity).toEqual([null, null, 50, -40, -10, 50]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineDisparity([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineDisparity([]).ok).toBe(false);
    expect(runLineDisparity(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineDisparity(DISPARITY_DATA, { period: 3 }).samples).toHaveLength(
      6,
    );
  });

  it('defaults to period 14 and reads no disparity for a short series', () => {
    const run = runLineDisparity(DISPARITY_DATA);
    expect(run.period).toBe(14);
    expect(run.disparity.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.disparityFinal)).toBe(true);
  });
});

describe('computeLineDisparityLayout', () => {
  const base = {
    data: DISPARITY_DATA,
    period: 3,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineDisparityLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(6);
  });

  it('stacks the price panel above the Disparity panel', () => {
    const layout = computeLineDisparityLayout(base);
    expect(layout.disparityPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.disparityPanel.width);
  });

  it('builds non-empty price and Disparity paths', () => {
    const layout = computeLineDisparityLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.disparityPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the disparity is defined', () => {
    const layout = computeLineDisparityLayout(base);
    expect(layout.markers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(6);
  });

  it('uses a symmetric Disparity y-domain around zero', () => {
    const layout = computeLineDisparityLayout(base);
    expect(layout.disparityYMin).toBe(-50);
    expect(layout.disparityYMax).toBe(50);
  });

  it('centres the zero line in the Disparity panel', () => {
    const layout = computeLineDisparityLayout(base);
    const mid = layout.disparityPanel.y + layout.disparityPanel.height / 2;
    expect(layout.zeroY).toBeCloseTo(mid, 6);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineDisparityLayout(base);
    expect(layout.disparityFinal).toBe(50);
    expect(layout.positiveCount).toBe(2);
    expect(layout.negativeCount).toBe(2);
    expect(layout.period).toBe(3);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineDisparityLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.disparityPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineDisparityLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineDisparityChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineDisparityChart(DISPARITY_DATA, { period: 3 });
    expect(text).toContain('Disparity Index');
    expect(text).toContain('moving average');
    expect(text).toContain('percentage');
    expect(text).toContain('positive');
    expect(text).toContain('negative');
  });

  it('reports the positive and negative counts', () => {
    const text = describeLineDisparityChart(DISPARITY_DATA, { period: 3 });
    expect(text).toContain('2 positive');
    expect(text).toContain('2 negative');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineDisparityChart([])).toBe('No data');
    expect(describeLineDisparityChart(null)).toBe('No data');
  });
});

describe('<ChartLineDisparity />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-disparity-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Disparity Index');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-disparity"]',
    );
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-disparity-final')).toBe('50');
    expect(root!.getAttribute('data-positive-count')).toBe('2');
    expect(root!.getAttribute('data-negative-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('6');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and Disparity lines', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-disparity-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-disparity-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-disparity-disparity-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one marker per defined disparity value', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-disparity-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('tags markers with their positive or negative sign', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    const positive = container.querySelector(
      '[data-section="chart-line-disparity-marker"][data-sign="positive"]',
    );
    const negative = container.querySelector(
      '[data-section="chart-line-disparity-marker"][data-sign="negative"]',
    );
    expect(positive).not.toBeNull();
    expect(negative).not.toBeNull();
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-disparity-zero-line"]'),
    ).not.toBeNull();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineDisparity
        data={DISPARITY_DATA}
        period={3}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-disparity-zero-line"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-disparity-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-disparity-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-disparity-badge-period"]',
    );
    expect(badge!.textContent).toContain('3');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineDisparity
        data={DISPARITY_DATA}
        period={3}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-disparity-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the Disparity line and markers when showDisparity is false', () => {
    const { container } = render(
      <ChartLineDisparity
        data={DISPARITY_DATA}
        period={3}
        showDisparity={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-disparity-disparity-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-disparity-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-disparity-dot"]'),
    ).toHaveLength(6);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineDisparity data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-disparity"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-disparity-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineDisparity
        data={DISPARITY_DATA}
        period={3}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-disparity-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDisparity ref={ref} data={DISPARITY_DATA} period={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-disparity',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineDisparity.displayName).toBe('ChartLineDisparity');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineDisparity data={DISPARITY_DATA} period={3} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-disparity"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
