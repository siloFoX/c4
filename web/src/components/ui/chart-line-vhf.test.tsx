import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineVhf,
  computeLineVhf,
  computeLineVhfWindow,
  computeLineVhfLayout,
  getLineVhfFinitePoints,
  normalizeLineVhfPeriod,
  runLineVhf,
  describeLineVhfChart,
  type ChartLineVhfPoint,
} from './chart-line-vhf';

afterEach(() => cleanup());

// The VHF is range / travel -- a ratio of a max-minus-min and a
// sum of absolute moves, no transcendentals, so the whole pipeline
// is exact. The fixture (period 4) is hand-tuned so every window's
// travel is exactly 16, hence every VHF divides cleanly by 16.
const VHF_DATA: ChartLineVhfPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 20 },
  { x: 3, value: 26 },
  { x: 4, value: 30 },
  { x: 5, value: 24 },
  { x: 6, value: 30 },
  { x: 7, value: 26 },
  { x: 8, value: 32 },
  { x: 9, value: 26 },
  { x: 10, value: 30 },
  { x: 11, value: 24 },
];

const VHF_CLOSES = VHF_DATA.map((p) => p.value);
const EXPECTED_VHF = [
  null,
  null,
  null,
  1,
  1,
  0.625,
  0.375,
  0.375,
  0.5,
  0.375,
  0.375,
  0.5,
];

describe('getLineVhfFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineVhfFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineVhfFinitePoints(null)).toEqual([]);
    expect(getLineVhfFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineVhfPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineVhfPeriod(28.9, 28)).toBe(28);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLineVhfPeriod(1, 28)).toBe(28);
    expect(normalizeLineVhfPeriod(NaN, 28)).toBe(28);
    expect(normalizeLineVhfPeriod(-5, 28)).toBe(28);
  });
});

describe('computeLineVhfWindow', () => {
  it('computes the range, travel and vhf of a window', () => {
    expect(computeLineVhfWindow([10, 14, 20, 26])).toEqual({
      range: 16,
      travel: 16,
      vhf: 1,
    });
  });

  it('scores a zigzag window below one', () => {
    expect(computeLineVhfWindow([26, 30, 24, 30])).toEqual({
      range: 6,
      travel: 16,
      vhf: 0.375,
    });
  });

  it('reports a NaN vhf for a flat window', () => {
    const result = computeLineVhfWindow([5, 5, 5, 5]);
    expect(result.range).toBe(0);
    expect(result.travel).toBe(0);
    expect(Number.isNaN(result.vhf)).toBe(true);
  });

  it('reports a NaN vhf for a too-short window', () => {
    expect(Number.isNaN(computeLineVhfWindow([5]).vhf)).toBe(true);
  });

  it('returns zeros and a NaN vhf for non-array input', () => {
    const result = computeLineVhfWindow(null);
    expect(result.range).toBe(0);
    expect(result.travel).toBe(0);
    expect(Number.isNaN(result.vhf)).toBe(true);
  });
});

describe('computeLineVhf', () => {
  it('computes the vertical horizontal filter', () => {
    expect(computeLineVhf(VHF_CLOSES, 4)).toEqual(EXPECTED_VHF);
  });

  it('is null through the warm-up window', () => {
    expect(computeLineVhf(VHF_CLOSES, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('reads 1 for a monotone trend', () => {
    expect(computeLineVhf([10, 12, 14, 16, 18], 4)).toEqual([
      null,
      null,
      null,
      1,
      1,
    ]);
  });

  it('is null for a flat series', () => {
    expect(computeLineVhf([5, 5, 5, 5, 5], 4)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('returns an all-null array for a series shorter than the period', () => {
    expect(computeLineVhf([10, 12], 5)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineVhf(null, 4)).toEqual([]);
  });
});

describe('runLineVhf', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineVhf(VHF_DATA, { period: 4 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineVhf(VHF_DATA, { period: 4 }).period).toBe(4);
  });

  it('exposes the vhf series', () => {
    expect(runLineVhf(VHF_DATA, { period: 4 }).vhf).toHaveLength(12);
  });

  it('computes the exact vhf series', () => {
    expect(runLineVhf(VHF_DATA, { period: 4 }).vhf).toEqual(EXPECTED_VHF);
  });

  it('leaves the vhf null until the window is full', () => {
    const run = runLineVhf(VHF_DATA, { period: 4 });
    expect(run.samples.slice(0, 3).every((s) => s.vhf === null)).toBe(true);
    expect(typeof run.samples[3]!.vhf).toBe('number');
  });

  it('classifies each sample against the 0.5 trend-versus-range level', () => {
    const run = runLineVhf(VHF_DATA, { period: 4 });
    for (const s of run.samples) {
      if (s.vhf === null || s.vhf === 0.5) {
        expect(s.regime).toBe('neutral');
      } else {
        expect(s.regime).toBe(s.vhf > 0.5 ? 'trending' : 'ranging');
      }
    }
  });

  it('counts the trending and ranging bars consistently', () => {
    const run = runLineVhf(VHF_DATA, { period: 4 });
    expect(run.trendingCount).toBe(3);
    expect(run.rangingCount).toBe(4);
    expect(run.trendingCount).toBe(
      run.vhf.filter((v) => v !== null && v > 0.5).length,
    );
    expect(run.rangingCount).toBe(
      run.vhf.filter((v) => v !== null && v < 0.5).length,
    );
  });

  it('reports the final vhf reading', () => {
    expect(runLineVhf(VHF_DATA, { period: 4 }).vhfFinal).toBe(0.5);
  });

  it('reports the min and max vhf readings', () => {
    const run = runLineVhf(VHF_DATA, { period: 4 });
    expect(run.vhfMin).toBe(0.375);
    expect(run.vhfMax).toBe(1);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineVhf([{ x: 0, value: 5 }], { period: 4 });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineVhf([], { period: 4 }).ok).toBe(false);
    expect(runLineVhf(null, { period: 4 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...VHF_DATA].reverse();
    const run = runLineVhf(shuffled, { period: 4 });
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(runLineVhf(VHF_DATA, { period: 4 }).samples).toHaveLength(12);
  });

  it('defaults to a period of 28', () => {
    expect(runLineVhf(VHF_DATA).period).toBe(28);
  });
});

describe('computeLineVhfLayout', () => {
  const base = {
    data: VHF_DATA,
    period: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineVhfLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(12);
  });

  it('stacks the price panel above the vhf panel', () => {
    const layout = computeLineVhfLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.vhfPanel.height).toBeGreaterThan(0);
    expect(layout.vhfPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and vhf paths', () => {
    const layout = computeLineVhfLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.vhfPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined vhf', () => {
    const layout = computeLineVhfLayout(base);
    expect(layout.priceDots).toHaveLength(12);
    expect(layout.vhfMarkers).toHaveLength(9);
  });

  it('fixes the vhf panel y-domain to the 0 to 1 range', () => {
    const layout = computeLineVhfLayout(base);
    expect(layout.vhfYMin).toBe(0);
    expect(layout.vhfYMax).toBe(1);
  });

  it('places the 0.5 reference line inside the vhf panel', () => {
    const layout = computeLineVhfLayout(base);
    expect(layout.refY).toBeGreaterThanOrEqual(layout.vhfPanel.y);
    expect(layout.refY).toBeLessThanOrEqual(
      layout.vhfPanel.y + layout.vhfPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineVhfLayout(base);
    expect(layout.period).toBe(4);
    expect(layout.vhfFinal).toBe(0.5);
    expect(layout.totalPoints).toBe(12);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineVhfLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.vhfPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineVhfLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineVhfChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineVhfChart(VHF_DATA, { period: 4 });
    expect(text).toContain('Vertical Horizontal Filter');
    expect(text).toContain('trending');
    expect(text).toContain('ranging');
    expect(text).toContain('travel');
  });

  it('reports the trending and ranging counts', () => {
    const run = runLineVhf(VHF_DATA, { period: 4 });
    const text = describeLineVhfChart(VHF_DATA, { period: 4 });
    expect(text).toContain(`trending on ${run.trendingCount}`);
    expect(text).toContain(`ranging on ${run.rangingCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineVhfChart([])).toBe('No data');
    expect(describeLineVhfChart(null)).toBe('No data');
  });
});

describe('<ChartLineVhf />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    const desc = container.querySelector(
      '[data-section="chart-line-vhf-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Vertical Horizontal Filter');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    const root = container.querySelector('[data-section="chart-line-vhf"]');
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-trending-count')).toBe('3');
    expect(root!.getAttribute('data-ranging-count')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('12');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and vhf lines', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-vhf-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vhf-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vhf-vhf-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-vhf-panel-label"]'),
    ).toHaveLength(2);
  });

  it('renders one vhf marker per defined value', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-vhf-marker"]'),
    ).toHaveLength(9);
  });

  it('classifies each marker with a regime attribute', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vhf-marker"]',
    );
    for (const m of markers) {
      expect(['trending', 'ranging', 'neutral']).toContain(
        m.getAttribute('data-regime'),
      );
    }
  });

  it('renders the 0.5 reference line', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-vhf-ref-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-vhf-legend-item"]'),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineVhf data={VHF_DATA} period={4} />);
    const badge = container.querySelector(
      '[data-section="chart-line-vhf-badge-period"]',
    );
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineVhf data={VHF_DATA} period={4} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vhf-price-path"]'),
    ).toBeNull();
  });

  it('hides the vhf line and markers when showVhf is false', () => {
    const { container } = render(
      <ChartLineVhf data={VHF_DATA} period={4} showVhf={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vhf-vhf-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-vhf-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the vhf line via the hidden set', () => {
    const { container } = render(
      <ChartLineVhf data={VHF_DATA} period={4} hiddenSeries={['vhf']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vhf-vhf-line"]'),
    ).toBeNull();
  });

  it('hides the reference line when showRefLine is false', () => {
    const { container } = render(
      <ChartLineVhf data={VHF_DATA} period={4} showRefLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vhf-ref-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineVhf
        data={VHF_DATA}
        period={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-vhf-legend-item"][data-series-id="vhf"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'vhf', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineVhf data={VHF_DATA} period={4} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-vhf-dot"]'),
    ).toHaveLength(12);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineVhf data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-vhf"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-vhf-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineVhf data={VHF_DATA} period={4} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vhf-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVhf ref={ref} data={VHF_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-vhf');
  });

  it('has a stable displayName', () => {
    expect(ChartLineVhf.displayName).toBe('ChartLineVhf');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineVhf data={VHF_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-vhf"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
