import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineHilbert,
  computeLineHilbertCycle,
  computeLineHilbertSmooth,
  computeLineHilbertTransform,
  computeLineHilbertLayout,
  getLineHilbertFinitePoints,
  normalizeLineHilbertPeriod,
  runLineHilbert,
  describeLineHilbertChart,
  type ChartLineHilbertPoint,
} from './chart-line-hilbert';

afterEach(() => cleanup());

// The Hilbert Transform dominant cycle pre-smooths the price,
// detrends it through the Hilbert transform filter, takes a second
// transform for the quadrature, and reads the dominant cycle period
// from the phase rotation. The phase uses atan2, so the period
// values are irrational -- they are asserted via the [min, max]
// clamp band and the recursions, with a flat series reporting the
// maximum period.
const HILBERT_DATA: ChartLineHilbertPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 13 },
  { x: 2, value: 16 },
  { x: 3, value: 17 },
  { x: 4, value: 16 },
  { x: 5, value: 13 },
  { x: 6, value: 10 },
  { x: 7, value: 7 },
  { x: 8, value: 4 },
  { x: 9, value: 3 },
  { x: 10, value: 4 },
  { x: 11, value: 7 },
  { x: 12, value: 10 },
  { x: 13, value: 13 },
];

describe('getLineHilbertFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineHilbertFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineHilbertFinitePoints(null)).toEqual([]);
    expect(getLineHilbertFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineHilbertPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineHilbertPeriod(6.9, 6)).toBe(6);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineHilbertPeriod(0, 6)).toBe(6);
    expect(normalizeLineHilbertPeriod(NaN, 6)).toBe(6);
    expect(normalizeLineHilbertPeriod(-3, 6)).toBe(6);
  });
});

describe('computeLineHilbertSmooth', () => {
  const values = HILBERT_DATA.map((p) => p.value);

  it('passes the first three bars through raw', () => {
    const smooth = computeLineHilbertSmooth(values);
    expect(smooth[0]).toBe(10);
    expect(smooth[1]).toBe(13);
    expect(smooth[2]).toBe(16);
  });

  it('applies the 4-3-2-1 weighted average from the fourth bar', () => {
    const smooth = computeLineHilbertSmooth(values);
    expect(smooth[3]).toBe((4 * 17 + 3 * 16 + 2 * 13 + 10) / 10);
  });

  it('holds a flat series at its constant', () => {
    expect(computeLineHilbertSmooth([5, 5, 5, 5, 5])).toEqual([
      5, 5, 5, 5, 5,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineHilbertSmooth(null)).toEqual([]);
  });
});

describe('computeLineHilbertTransform', () => {
  const values = HILBERT_DATA.map((p) => p.value);

  it('seeds the first six bars at zero', () => {
    const ht = computeLineHilbertTransform(values);
    expect(ht.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('applies the seven-tap quadrature filter', () => {
    const ht = computeLineHilbertTransform(values);
    for (let i = 6; i < values.length; i += 1) {
      const expected =
        0.0962 * (values[i]! - values[i - 6]!) +
        0.5769 * (values[i - 2]! - values[i - 4]!);
      expect(ht[i]).toBe(expected);
    }
  });

  it('transforms a constant series to zero', () => {
    expect(computeLineHilbertTransform([5, 5, 5, 5, 5, 5, 5, 5])).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineHilbertTransform(null)).toEqual([]);
  });
});

describe('computeLineHilbertCycle', () => {
  const values = HILBERT_DATA.map((p) => p.value);

  it('reports the maximum period for a flat series', () => {
    expect(
      computeLineHilbertCycle([5, 5, 5, 5, 5, 5, 5, 5, 5, 5], 6, 50),
    ).toEqual([50, 50, 50, 50, 50, 50, 50, 50, 50, 50]);
  });

  it('keeps every period inside the clamp band', () => {
    const cycle = computeLineHilbertCycle(values, 6, 50);
    for (const v of cycle) {
      expect(v).toBeGreaterThanOrEqual(6);
      expect(v).toBeLessThanOrEqual(50);
    }
  });

  it('seeds the first bar at the maximum period', () => {
    expect(computeLineHilbertCycle(values, 6, 50)[0]).toBe(50);
  });

  it('returns one period per input value', () => {
    expect(computeLineHilbertCycle(values, 6, 50)).toHaveLength(
      values.length,
    );
  });

  it('honours custom period bounds', () => {
    const cycle = computeLineHilbertCycle(values, 10, 30);
    for (const v of cycle) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(30);
    }
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineHilbertCycle(null, 6, 50)).toEqual([]);
  });
});

describe('runLineHilbert', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineHilbert(HILBERT_DATA).ok).toBe(true);
  });

  it('carries the period bounds onto the run', () => {
    const run = runLineHilbert(HILBERT_DATA, { minPeriod: 6, maxPeriod: 50 });
    expect(run.minPeriod).toBe(6);
    expect(run.maxPeriod).toBe(50);
  });

  it('exposes the smooth and period series', () => {
    const run = runLineHilbert(HILBERT_DATA);
    expect(run.smooth).toHaveLength(14);
    expect(run.period).toHaveLength(14);
  });

  it('classes the first bar as a slow cycle', () => {
    const run = runLineHilbert(HILBERT_DATA);
    expect(run.samples[0]!.cycleClass).toBe('slow');
  });

  it('counts the fast and slow bars consistently', () => {
    const run = runLineHilbert(HILBERT_DATA);
    const mid = (run.minPeriod + run.maxPeriod) / 2;
    expect(run.fastCount).toBe(run.period.filter((v) => v < mid).length);
    expect(run.slowCount).toBe(run.period.filter((v) => v > mid).length);
  });

  it('reports the final, min and max period readings', () => {
    const run = runLineHilbert(HILBERT_DATA);
    expect(run.periodFinal).toBe(run.period[13]);
    expect(run.periodMin).toBe(Math.min(...run.period));
    expect(run.periodMax).toBe(Math.max(...run.period));
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineHilbert([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineHilbert([]).ok).toBe(false);
    expect(runLineHilbert(null).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...HILBERT_DATA].reverse();
    const run = runLineHilbert(shuffled);
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(runLineHilbert(HILBERT_DATA).samples).toHaveLength(14);
  });

  it('defaults to a 6 to 50 bar period band', () => {
    const run = runLineHilbert(HILBERT_DATA);
    expect(run.minPeriod).toBe(6);
    expect(run.maxPeriod).toBe(50);
  });

  it('repairs a max period that is not above the min', () => {
    const run = runLineHilbert(HILBERT_DATA, { minPeriod: 20, maxPeriod: 10 });
    expect(run.maxPeriod).toBe(21);
  });
});

describe('computeLineHilbertLayout', () => {
  const base = {
    data: HILBERT_DATA,
    minPeriod: 6,
    maxPeriod: 50,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineHilbertLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(14);
  });

  it('stacks the price panel above the cycle panel', () => {
    const layout = computeLineHilbertLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.cyclePanel.height).toBeGreaterThan(0);
    expect(layout.cyclePanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and cycle paths', () => {
    const layout = computeLineHilbertLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.cyclePath.startsWith('M')).toBe(true);
  });

  it('emits one price dot and one marker per bar', () => {
    const layout = computeLineHilbertLayout(base);
    expect(layout.priceDots).toHaveLength(14);
    expect(layout.cycleMarkers).toHaveLength(14);
  });

  it('fixes the cycle panel y domain to the period band', () => {
    const layout = computeLineHilbertLayout(base);
    expect(layout.cycleYMin).toBe(6);
    expect(layout.cycleYMax).toBe(50);
  });

  it('places the midline inside the cycle panel', () => {
    const layout = computeLineHilbertLayout(base);
    expect(layout.midInRange).toBe(true);
    expect(layout.midY).toBeGreaterThanOrEqual(layout.cyclePanel.y);
    expect(layout.midY).toBeLessThanOrEqual(
      layout.cyclePanel.y + layout.cyclePanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineHilbertLayout(base);
    expect(layout.minPeriod).toBe(6);
    expect(layout.maxPeriod).toBe(50);
    expect(layout.totalPoints).toBe(14);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineHilbertLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.cyclePath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineHilbertLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineHilbertChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineHilbertChart(HILBERT_DATA);
    expect(text).toContain('Hilbert Transform');
    expect(text).toContain('dominant cycle');
    expect(text).toContain('quadrature');
    expect(text).toContain('phase');
  });

  it('reports the fast and slow counts', () => {
    const run = runLineHilbert(HILBERT_DATA);
    const text = describeLineHilbertChart(HILBERT_DATA);
    expect(text).toContain(`fast (below the 28-bar midpoint) on ${run.fastCount}`);
    expect(text).toContain(`slow on ${run.slowCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineHilbertChart([])).toBe('No data');
    expect(describeLineHilbertChart(null)).toBe('No data');
  });
});

describe('<ChartLineHilbert />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineHilbert data={HILBERT_DATA} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineHilbert data={HILBERT_DATA} />);
    const desc = container.querySelector(
      '[data-section="chart-line-hilbert-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Hilbert Transform');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineHilbert data={HILBERT_DATA} />);
    const root = container.querySelector('[data-section="chart-line-hilbert"]');
    expect(root!.getAttribute('data-min-period')).toBe('6');
    expect(root!.getAttribute('data-max-period')).toBe('50');
    expect(root!.getAttribute('data-total-points')).toBe('14');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and cycle lines', () => {
    const { container } = render(<ChartLineHilbert data={HILBERT_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-hilbert-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-hilbert-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-hilbert-cycle-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineHilbert data={HILBERT_DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hilbert-panel-label"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one cycle marker per bar', () => {
    const { container } = render(<ChartLineHilbert data={HILBERT_DATA} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-hilbert-marker"]'),
    ).toHaveLength(14);
  });

  it('renders the fast/slow midline', () => {
    const { container } = render(<ChartLineHilbert data={HILBERT_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-hilbert-midline"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineHilbert data={HILBERT_DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hilbert-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period range', () => {
    const { container } = render(<ChartLineHilbert data={HILBERT_DATA} />);
    const badge = container.querySelector(
      '[data-section="chart-line-hilbert-badge-range"]',
    );
    expect(badge!.textContent).toContain('6');
    expect(badge!.textContent).toContain('50');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineHilbert data={HILBERT_DATA} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hilbert-price-path"]'),
    ).toBeNull();
  });

  it('hides the cycle line and markers when showCycle is false', () => {
    const { container } = render(
      <ChartLineHilbert data={HILBERT_DATA} showCycle={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hilbert-cycle-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-hilbert-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the cycle line via the hidden set', () => {
    const { container } = render(
      <ChartLineHilbert data={HILBERT_DATA} hiddenSeries={['cycle']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hilbert-cycle-line"]'),
    ).toBeNull();
  });

  it('hides the midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineHilbert data={HILBERT_DATA} showMidline={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hilbert-midline"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineHilbert
        data={HILBERT_DATA}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-hilbert-legend-item"][data-series-id="cycle"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'cycle', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineHilbert data={HILBERT_DATA} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-hilbert-dot"]'),
    ).toHaveLength(14);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineHilbert data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-hilbert"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-hilbert-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineHilbert data={HILBERT_DATA} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hilbert-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHilbert ref={ref} data={HILBERT_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-hilbert',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineHilbert.displayName).toBe('ChartLineHilbert');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineHilbert data={HILBERT_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-hilbert"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
