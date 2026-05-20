import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineCog,
  computeLineCog,
  computeLineCogWeightedSum,
  computeLineCogLayout,
  getLineCogFinitePoints,
  normalizeLineCogPeriod,
  runLineCog,
  describeLineCogChart,
  type ChartLineCogPoint,
} from './chart-line-cog';

afterEach(() => cleanup());

// The Center of Gravity is a ratio of two weighted sums plus a
// constant offset -- no transcendentals, so the whole pipeline is
// exact. The fixture is a period-4 periodic series [4,12,20,28]:
// every window sums to 64 (a power of two), so every CoG divides
// cleanly. The weighted numerators cycle 120 / 168 / 184 / 168,
// giving CoG -120/64 + 2.5 = 0.625, etc.
const COG_DATA: ChartLineCogPoint[] = [
  { x: 0, value: 4 },
  { x: 1, value: 12 },
  { x: 2, value: 20 },
  { x: 3, value: 28 },
  { x: 4, value: 4 },
  { x: 5, value: 12 },
  { x: 6, value: 20 },
  { x: 7, value: 28 },
  { x: 8, value: 4 },
  { x: 9, value: 12 },
];

const COG_VALUES = COG_DATA.map((p) => p.value);
const EXPECTED_COG = [
  null,
  null,
  null,
  0.625,
  -0.125,
  -0.375,
  -0.125,
  0.625,
  -0.125,
  -0.375,
];

describe('getLineCogFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineCogFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineCogFinitePoints(null)).toEqual([]);
    expect(getLineCogFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineCogPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineCogPeriod(10.9, 10)).toBe(10);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLineCogPeriod(1, 10)).toBe(10);
    expect(normalizeLineCogPeriod(NaN, 10)).toBe(10);
    expect(normalizeLineCogPeriod(-5, 10)).toBe(10);
  });
});

describe('computeLineCogWeightedSum', () => {
  it('computes the weighted numerator and the denominator', () => {
    expect(computeLineCogWeightedSum([4, 12, 20, 28])).toEqual({
      numerator: 120,
      denominator: 64,
    });
  });

  it('weights the oldest bar the heaviest', () => {
    expect(computeLineCogWeightedSum([1, 0, 0, 0]).numerator).toBe(4);
    expect(computeLineCogWeightedSum([0, 0, 0, 1]).numerator).toBe(1);
  });

  it('handles a single-element window', () => {
    expect(computeLineCogWeightedSum([5])).toEqual({
      numerator: 5,
      denominator: 5,
    });
  });

  it('returns zeros for an empty window', () => {
    expect(computeLineCogWeightedSum([])).toEqual({
      numerator: 0,
      denominator: 0,
    });
  });

  it('returns zeros for non-array input', () => {
    expect(computeLineCogWeightedSum(null)).toEqual({
      numerator: 0,
      denominator: 0,
    });
  });
});

describe('computeLineCog', () => {
  it('computes the center of gravity oscillator', () => {
    expect(computeLineCog(COG_VALUES, 4)).toEqual(EXPECTED_COG);
  });

  it('is null through the warm-up window', () => {
    expect(computeLineCog(COG_VALUES, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('is zero for a flat series', () => {
    expect(computeLineCog([7, 7, 7, 7, 7, 7], 4)).toEqual([
      null,
      null,
      null,
      0,
      0,
      0,
    ]);
  });

  it('is null when the window sums to zero', () => {
    expect(computeLineCog([0, 0, 0, 0], 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('returns an all-null array for a series shorter than the period', () => {
    expect(computeLineCog([4, 12], 4)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineCog(null, 4)).toEqual([]);
  });
});

describe('runLineCog', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineCog(COG_DATA, { period: 4 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineCog(COG_DATA, { period: 4 }).period).toBe(4);
  });

  it('exposes the cog series', () => {
    expect(runLineCog(COG_DATA, { period: 4 }).cog).toHaveLength(10);
  });

  it('computes the exact cog series', () => {
    expect(runLineCog(COG_DATA, { period: 4 }).cog).toEqual(EXPECTED_COG);
  });

  it('leaves the cog null until the window is full', () => {
    const run = runLineCog(COG_DATA, { period: 4 });
    expect(run.samples.slice(0, 3).every((s) => s.cog === null)).toBe(true);
    expect(typeof run.samples[3]!.cog).toBe('number');
  });

  it('classifies each sample by the sign of the cog', () => {
    const run = runLineCog(COG_DATA, { period: 4 });
    for (const s of run.samples) {
      if (s.cog === null || s.cog === 0) {
        expect(s.sign).toBe('zero');
      } else {
        expect(s.sign).toBe(s.cog > 0 ? 'positive' : 'negative');
      }
    }
  });

  it('counts the positive and negative bars consistently', () => {
    const run = runLineCog(COG_DATA, { period: 4 });
    expect(run.positiveCount).toBe(2);
    expect(run.negativeCount).toBe(5);
    expect(run.positiveCount).toBe(
      run.cog.filter((v) => v !== null && v > 0).length,
    );
    expect(run.negativeCount).toBe(
      run.cog.filter((v) => v !== null && v < 0).length,
    );
  });

  it('reports the final cog reading', () => {
    expect(runLineCog(COG_DATA, { period: 4 }).cogFinal).toBe(-0.375);
  });

  it('reports the min and max cog readings', () => {
    const run = runLineCog(COG_DATA, { period: 4 });
    expect(run.cogMin).toBe(-0.375);
    expect(run.cogMax).toBe(0.625);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineCog([{ x: 0, value: 5 }], { period: 4 });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineCog([], { period: 4 }).ok).toBe(false);
    expect(runLineCog(null, { period: 4 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...COG_DATA].reverse();
    const run = runLineCog(shuffled, { period: 4 });
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(runLineCog(COG_DATA, { period: 4 }).samples).toHaveLength(10);
  });

  it('defaults to a period of 10', () => {
    expect(runLineCog(COG_DATA).period).toBe(10);
  });
});

describe('computeLineCogLayout', () => {
  const base = {
    data: COG_DATA,
    period: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineCogLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('stacks the price panel above the cog panel', () => {
    const layout = computeLineCogLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.cogPanel.height).toBeGreaterThan(0);
    expect(layout.cogPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and cog paths', () => {
    const layout = computeLineCogLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.cogPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined cog', () => {
    const layout = computeLineCogLayout(base);
    expect(layout.priceDots).toHaveLength(10);
    expect(layout.cogMarkers).toHaveLength(7);
  });

  it('places the zero line inside the cog panel', () => {
    const layout = computeLineCogLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.cogPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.cogPanel.y + layout.cogPanel.height,
    );
  });

  it('centres the cog panel y-domain on zero', () => {
    const layout = computeLineCogLayout(base);
    expect(layout.cogYMin).toBe(-layout.cogYMax);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineCogLayout(base);
    expect(layout.period).toBe(4);
    expect(layout.cogFinal).toBe(-0.375);
    expect(layout.totalPoints).toBe(10);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineCogLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.cogPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineCogLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCogChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineCogChart(COG_DATA, { period: 4 });
    expect(text).toContain('Center of Gravity');
    expect(text).toContain('oscillator');
    expect(text).toContain('weighted');
    expect(text).toContain('centroid');
  });

  it('reports the positive and negative counts', () => {
    const run = runLineCog(COG_DATA, { period: 4 });
    const text = describeLineCogChart(COG_DATA, { period: 4 });
    expect(text).toContain(`positive on ${run.positiveCount}`);
    expect(text).toContain(`negative on ${run.negativeCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineCogChart([])).toBe('No data');
    expect(describeLineCogChart(null)).toBe('No data');
  });
});

describe('<ChartLineCog />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    const desc = container.querySelector(
      '[data-section="chart-line-cog-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Center of Gravity');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    const root = container.querySelector('[data-section="chart-line-cog"]');
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-positive-count')).toBe('2');
    expect(root!.getAttribute('data-negative-count')).toBe('5');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and cog lines', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-cog-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-cog-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-cog-cog-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-cog-panel-label"]'),
    ).toHaveLength(2);
  });

  it('renders one cog marker per defined value', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-cog-marker"]'),
    ).toHaveLength(7);
  });

  it('classifies each marker with a sign attribute', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-cog-marker"]',
    );
    for (const m of markers) {
      expect(['positive', 'negative', 'zero']).toContain(
        m.getAttribute('data-sign'),
      );
    }
  });

  it('renders the zero line', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-cog-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-cog-legend-item"]'),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineCog data={COG_DATA} period={4} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cog-badge-period"]',
    );
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineCog data={COG_DATA} period={4} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cog-price-path"]'),
    ).toBeNull();
  });

  it('hides the cog line and markers when showCog is false', () => {
    const { container } = render(
      <ChartLineCog data={COG_DATA} period={4} showCog={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cog-cog-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-cog-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the cog line via the hidden set', () => {
    const { container } = render(
      <ChartLineCog data={COG_DATA} period={4} hiddenSeries={['cog']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cog-cog-line"]'),
    ).toBeNull();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineCog data={COG_DATA} period={4} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cog-zero-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineCog
        data={COG_DATA}
        period={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-cog-legend-item"][data-series-id="cog"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'cog', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineCog data={COG_DATA} period={4} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-cog-dot"]'),
    ).toHaveLength(10);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineCog data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-cog"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-cog-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineCog data={COG_DATA} period={4} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cog-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCog ref={ref} data={COG_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-cog');
  });

  it('has a stable displayName', () => {
    expect(ChartLineCog.displayName).toBe('ChartLineCog');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineCog data={COG_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-cog"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
