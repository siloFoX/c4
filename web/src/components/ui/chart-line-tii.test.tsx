import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineTii,
  computeLineTii,
  computeLineTiiDeviations,
  computeLineTiiLayout,
  getLineTiiFinitePoints,
  normalizeLineTiiPeriod,
  runLineTii,
  describeLineTiiChart,
  type ChartLineTiiPoint,
} from './chart-line-tii';

afterEach(() => cleanup());

// The TII is 100 * SDPos / (SDPos + SDNeg) -- a ratio of summed
// deviations, no transcendentals, so the whole pipeline is exact.
// The fixture (period 2) is hand-tuned: the deviations are
// [., 2, 6, -2, -6, 4, -1, 1, 3, -5] and each TII window total
// divides cleanly, so every TII lands on an exact number.
const TII_DATA: ChartLineTiiPoint[] = [
  { x: 0, value: 30 },
  { x: 1, value: 34 },
  { x: 2, value: 46 },
  { x: 3, value: 42 },
  { x: 4, value: 30 },
  { x: 5, value: 38 },
  { x: 6, value: 36 },
  { x: 7, value: 38 },
  { x: 8, value: 44 },
  { x: 9, value: 34 },
];

const TII_CLOSES = TII_DATA.map((p) => p.value);
const EXPECTED_DEVIATIONS = [null, 2, 6, -2, -6, 4, -1, 1, 3, -5];
const EXPECTED_TII = [null, null, 100, 75, 0, 40, 80, 50, 100, 37.5];

describe('getLineTiiFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineTiiFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineTiiFinitePoints(null)).toEqual([]);
    expect(getLineTiiFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineTiiPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineTiiPeriod(20.9, 20)).toBe(20);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLineTiiPeriod(1, 20)).toBe(20);
    expect(normalizeLineTiiPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineTiiPeriod(-5, 20)).toBe(20);
  });
});

describe('computeLineTiiDeviations', () => {
  it('computes the deviation of the close from its moving average', () => {
    expect(computeLineTiiDeviations(TII_CLOSES, 2)).toEqual(
      EXPECTED_DEVIATIONS,
    );
  });

  it('is null through the moving-average warm-up', () => {
    expect(computeLineTiiDeviations(TII_CLOSES, 2)[0]).toBeNull();
  });

  it('is zero for a flat series', () => {
    expect(computeLineTiiDeviations([20, 20, 20], 2)).toEqual([
      null,
      0,
      0,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineTiiDeviations(null, 2)).toEqual([]);
  });
});

describe('computeLineTii', () => {
  it('computes the trend intensity index', () => {
    expect(computeLineTii(TII_CLOSES, 2)).toEqual(EXPECTED_TII);
  });

  it('is null through the warm-up window', () => {
    expect(computeLineTii(TII_CLOSES, 2).slice(0, 2)).toEqual([null, null]);
  });

  it('is null for a flat series', () => {
    expect(computeLineTii([20, 20, 20, 20], 2)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('reads 100 when every deviation is positive', () => {
    expect(computeLineTii([10, 12, 14, 16, 18], 2)).toEqual([
      null,
      null,
      100,
      100,
      100,
    ]);
  });

  it('reads 0 when every deviation is negative', () => {
    expect(computeLineTii([18, 16, 14, 12, 10], 2)).toEqual([
      null,
      null,
      0,
      0,
      0,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineTii(null, 2)).toEqual([]);
  });
});

describe('runLineTii', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineTii(TII_DATA, { period: 2 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineTii(TII_DATA, { period: 2 }).period).toBe(2);
  });

  it('exposes the tii series', () => {
    expect(runLineTii(TII_DATA, { period: 2 }).tii).toHaveLength(10);
  });

  it('computes the exact tii series', () => {
    expect(runLineTii(TII_DATA, { period: 2 }).tii).toEqual(EXPECTED_TII);
  });

  it('exposes the deviations', () => {
    expect(runLineTii(TII_DATA, { period: 2 }).deviations).toEqual(
      EXPECTED_DEVIATIONS,
    );
  });

  it('leaves the tii null until the window is full', () => {
    const run = runLineTii(TII_DATA, { period: 2 });
    expect(run.samples.slice(0, 2).every((s) => s.tii === null)).toBe(true);
    expect(typeof run.samples[2]!.tii).toBe('number');
  });

  it('classifies each sample against the 50 no-trend level', () => {
    const run = runLineTii(TII_DATA, { period: 2 });
    for (const s of run.samples) {
      if (s.tii === null || s.tii === 50) {
        expect(s.trend).toBe('neutral');
      } else {
        expect(s.trend).toBe(s.tii > 50 ? 'up' : 'down');
      }
    }
  });

  it('counts the up and down bars consistently', () => {
    const run = runLineTii(TII_DATA, { period: 2 });
    expect(run.upCount).toBe(4);
    expect(run.downCount).toBe(3);
    expect(run.upCount).toBe(
      run.tii.filter((v) => v !== null && v > 50).length,
    );
    expect(run.downCount).toBe(
      run.tii.filter((v) => v !== null && v < 50).length,
    );
  });

  it('reports the final tii reading', () => {
    expect(runLineTii(TII_DATA, { period: 2 }).tiiFinal).toBe(37.5);
  });

  it('reports the min and max tii readings', () => {
    const run = runLineTii(TII_DATA, { period: 2 });
    expect(run.tiiMin).toBe(0);
    expect(run.tiiMax).toBe(100);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineTii([{ x: 0, value: 5 }], { period: 2 });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineTii([], { period: 2 }).ok).toBe(false);
    expect(runLineTii(null, { period: 2 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...TII_DATA].reverse();
    const run = runLineTii(shuffled, { period: 2 });
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(runLineTii(TII_DATA, { period: 2 }).samples).toHaveLength(10);
  });

  it('defaults to a period of 20', () => {
    expect(runLineTii(TII_DATA).period).toBe(20);
  });
});

describe('computeLineTiiLayout', () => {
  const base = {
    data: TII_DATA,
    period: 2,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineTiiLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('stacks the price panel above the tii panel', () => {
    const layout = computeLineTiiLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.tiiPanel.height).toBeGreaterThan(0);
    expect(layout.tiiPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and tii paths', () => {
    const layout = computeLineTiiLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.tiiPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined tii', () => {
    const layout = computeLineTiiLayout(base);
    expect(layout.priceDots).toHaveLength(10);
    expect(layout.tiiMarkers).toHaveLength(8);
  });

  it('fixes the tii panel y-domain to the 0 to 100 range', () => {
    const layout = computeLineTiiLayout(base);
    expect(layout.tiiYMin).toBe(0);
    expect(layout.tiiYMax).toBe(100);
  });

  it('places the 50 reference line inside the tii panel', () => {
    const layout = computeLineTiiLayout(base);
    expect(layout.refY).toBeGreaterThanOrEqual(layout.tiiPanel.y);
    expect(layout.refY).toBeLessThanOrEqual(
      layout.tiiPanel.y + layout.tiiPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineTiiLayout(base);
    expect(layout.period).toBe(2);
    expect(layout.tiiFinal).toBe(37.5);
    expect(layout.totalPoints).toBe(10);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineTiiLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.tiiPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineTiiLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTiiChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineTiiChart(TII_DATA, { period: 2 });
    expect(text).toContain('Trend Intensity Index');
    expect(text).toContain('deviation');
    expect(text).toContain('moving average');
    expect(text).toContain('share');
  });

  it('reports the up and down counts', () => {
    const run = runLineTii(TII_DATA, { period: 2 });
    const text = describeLineTiiChart(TII_DATA, { period: 2 });
    expect(text).toContain(`up on ${run.upCount}`);
    expect(text).toContain(`down on ${run.downCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineTiiChart([])).toBe('No data');
    expect(describeLineTiiChart(null)).toBe('No data');
  });
});

describe('<ChartLineTii />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    const desc = container.querySelector(
      '[data-section="chart-line-tii-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Trend Intensity Index');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    const root = container.querySelector('[data-section="chart-line-tii"]');
    expect(root!.getAttribute('data-period')).toBe('2');
    expect(root!.getAttribute('data-up-count')).toBe('4');
    expect(root!.getAttribute('data-down-count')).toBe('3');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and tii lines', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    expect(
      container.querySelector('[data-section="chart-line-tii-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-tii-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-tii-tii-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-tii-panel-label"]'),
    ).toHaveLength(2);
  });

  it('renders one tii marker per defined value', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-tii-marker"]'),
    ).toHaveLength(8);
  });

  it('classifies each marker with a trend attribute', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tii-marker"]',
    );
    for (const m of markers) {
      expect(['up', 'down', 'neutral']).toContain(
        m.getAttribute('data-trend'),
      );
    }
  });

  it('renders the 50 reference line', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    expect(
      container.querySelector('[data-section="chart-line-tii-ref-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-tii-legend-item"]'),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineTii data={TII_DATA} period={2} />);
    const badge = container.querySelector(
      '[data-section="chart-line-tii-badge-period"]',
    );
    expect(badge!.textContent).toContain('2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineTii data={TII_DATA} period={2} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tii-price-path"]'),
    ).toBeNull();
  });

  it('hides the tii line and markers when showTii is false', () => {
    const { container } = render(
      <ChartLineTii data={TII_DATA} period={2} showTii={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tii-tii-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-tii-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the tii line via the hidden set', () => {
    const { container } = render(
      <ChartLineTii data={TII_DATA} period={2} hiddenSeries={['tii']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tii-tii-line"]'),
    ).toBeNull();
  });

  it('hides the reference line when showRefLine is false', () => {
    const { container } = render(
      <ChartLineTii data={TII_DATA} period={2} showRefLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tii-ref-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineTii
        data={TII_DATA}
        period={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-tii-legend-item"][data-series-id="tii"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'tii', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineTii data={TII_DATA} period={2} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-tii-dot"]'),
    ).toHaveLength(10);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineTii data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-tii"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-tii-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineTii data={TII_DATA} period={2} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tii-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTii ref={ref} data={TII_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-tii');
  });

  it('has a stable displayName', () => {
    expect(ChartLineTii.displayName).toBe('ChartLineTii');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineTii data={TII_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-tii"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
