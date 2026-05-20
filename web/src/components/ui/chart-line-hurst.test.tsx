import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineHurst,
  computeLineHurst,
  computeLineHurstRescaledRange,
  computeLineHurstLayout,
  getLineHurstFinitePoints,
  normalizeLineHurstPeriod,
  runLineHurst,
  describeLineHurstChart,
  type ChartLineHurstPoint,
} from './chart-line-hurst';

afterEach(() => cleanup());

// The Hurst exponent H = log(R/S) / log(period) involves log and
// sqrt and is generally irrational, so it is asserted with
// toBeCloseTo plus exact anchors. The rescaled range R/S is
// exact-testable on its own with hand-picked windows: an
// alternating window gives R/S = 1 (H = 0, perfectly mean
// reverting); a trending step gives a larger R/S.
const HURST_DATA: ChartLineHurstPoint[] = [
  { x: 0, value: 20 },
  { x: 1, value: 24 },
  { x: 2, value: 19 },
  { x: 3, value: 27 },
  { x: 4, value: 22 },
  { x: 5, value: 30 },
  { x: 6, value: 25 },
  { x: 7, value: 33 },
  { x: 8, value: 28 },
  { x: 9, value: 36 },
  { x: 10, value: 31 },
  { x: 11, value: 40 },
];

// An alternating series: every 4-bar window has R/S = 1, so the
// Hurst exponent is exactly 0 -- maximally mean reverting.
const ALT_DATA: ChartLineHurstPoint[] = [
  { x: 0, value: 12 },
  { x: 1, value: 8 },
  { x: 2, value: 12 },
  { x: 3, value: 8 },
  { x: 4, value: 12 },
  { x: 5, value: 8 },
  { x: 6, value: 12 },
  { x: 7, value: 8 },
];

// A trending step: the single 8-bar window has R/S = 4, so the
// Hurst exponent is log(4)/log(8) ~ 0.667 -- trending.
const TREND_DATA: ChartLineHurstPoint[] = [
  { x: 0, value: 8 },
  { x: 1, value: 8 },
  { x: 2, value: 8 },
  { x: 3, value: 8 },
  { x: 4, value: 12 },
  { x: 5, value: 12 },
  { x: 6, value: 12 },
  { x: 7, value: 12 },
];

describe('getLineHurstFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineHurstFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineHurstFinitePoints(null)).toEqual([]);
    expect(getLineHurstFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineHurstPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineHurstPeriod(20.9, 20)).toBe(20);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLineHurstPeriod(1, 20)).toBe(20);
    expect(normalizeLineHurstPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineHurstPeriod(-5, 20)).toBe(20);
  });
});

describe('computeLineHurstRescaledRange', () => {
  it('computes the range, stddev and rescaled range of a window', () => {
    expect(computeLineHurstRescaledRange([8, 8, 12, 12])).toEqual({
      range: 4,
      stddev: 2,
      rs: 2,
    });
  });

  it('reads a unit rescaled range for an alternating window', () => {
    expect(computeLineHurstRescaledRange([12, 8, 12, 8])).toEqual({
      range: 2,
      stddev: 2,
      rs: 1,
    });
  });

  it('reads a larger rescaled range for a trending step', () => {
    expect(
      computeLineHurstRescaledRange([8, 8, 8, 8, 12, 12, 12, 12]),
    ).toEqual({ range: 8, stddev: 2, rs: 4 });
  });

  it('reports a NaN rescaled range for a flat window', () => {
    const result = computeLineHurstRescaledRange([5, 5, 5, 5]);
    expect(result.range).toBe(0);
    expect(result.stddev).toBe(0);
    expect(Number.isNaN(result.rs)).toBe(true);
  });

  it('reports a NaN rescaled range for a too-short window', () => {
    expect(Number.isNaN(computeLineHurstRescaledRange([5]).rs)).toBe(true);
  });

  it('handles non-array input', () => {
    expect(Number.isNaN(computeLineHurstRescaledRange(null).rs)).toBe(true);
  });
});

describe('computeLineHurst', () => {
  it('computes a zero Hurst exponent for an alternating series', () => {
    expect(
      computeLineHurst([12, 8, 12, 8, 12, 8, 12, 8], 4).hurst,
    ).toEqual([null, null, null, 0, 0, 0, 0, 0]);
  });

  it('exposes the rescaled range per bar', () => {
    expect(computeLineHurst([12, 8, 12, 8, 12, 8, 12, 8], 4).rs).toEqual([
      null,
      null,
      null,
      1,
      1,
      1,
      1,
      1,
    ]);
  });

  it('computes a Hurst above 0.5 for a trending step', () => {
    const result = computeLineHurst([8, 8, 8, 8, 12, 12, 12, 12], 8);
    expect(result.rs[7]).toBe(4);
    expect(result.hurst[7]).toBeCloseTo(Math.log(4) / Math.log(8));
    expect(result.hurst[7]!).toBeGreaterThan(0.5);
  });

  it('reports a null Hurst for a flat series', () => {
    expect(computeLineHurst([5, 5, 5, 5, 5, 5], 4).hurst).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('is null through the warm-up window', () => {
    const values = HURST_DATA.map((p) => p.value);
    expect(computeLineHurst(values, 4).hurst.slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('clamps the Hurst exponent into the unit interval', () => {
    const values = HURST_DATA.map((p) => p.value);
    for (const h of computeLineHurst(values, 4).hurst) {
      if (h === null) continue;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty series for non-array input', () => {
    expect(computeLineHurst(null, 4)).toEqual({ hurst: [], rs: [] });
  });
});

describe('runLineHurst', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineHurst(HURST_DATA, { period: 4 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineHurst(HURST_DATA, { period: 4 }).period).toBe(4);
  });

  it('exposes the hurst and rescaled-range series', () => {
    const run = runLineHurst(HURST_DATA, { period: 4 });
    expect(run.hurst).toHaveLength(12);
    expect(run.rs).toHaveLength(12);
  });

  it('leaves the hurst null until the window is full', () => {
    const run = runLineHurst(HURST_DATA, { period: 4 });
    expect(run.samples.slice(0, 3).every((s) => s.hurst === null)).toBe(true);
    expect(typeof run.samples[3]!.hurst).toBe('number');
  });

  it('classifies each sample against the 0.5 random-walk level', () => {
    const run = runLineHurst(HURST_DATA, { period: 4 });
    for (const s of run.samples) {
      if (s.hurst === null || s.hurst === 0.5) {
        expect(s.classification).toBe('random');
      } else {
        expect(s.classification).toBe(
          s.hurst > 0.5 ? 'trending' : 'reverting',
        );
      }
    }
  });

  it('counts the trending and reverting bars consistently', () => {
    const run = runLineHurst(HURST_DATA, { period: 4 });
    expect(run.trendingCount).toBe(
      run.hurst.filter((v) => v !== null && v > 0.5).length,
    );
    expect(run.revertingCount).toBe(
      run.hurst.filter((v) => v !== null && v < 0.5).length,
    );
  });

  it('classifies an alternating series as mean reverting', () => {
    const run = runLineHurst(ALT_DATA, { period: 4 });
    expect(run.revertingCount).toBe(5);
    expect(run.trendingCount).toBe(0);
    expect(
      run.samples.slice(3).every((s) => s.classification === 'reverting'),
    ).toBe(true);
  });

  it('classifies a trending step as trending', () => {
    const run = runLineHurst(TREND_DATA, { period: 8 });
    expect(run.trendingCount).toBe(1);
    expect(run.samples[7]!.classification).toBe('trending');
  });

  it('reports the final hurst reading', () => {
    const run = runLineHurst(HURST_DATA, { period: 4 });
    expect(run.hurstFinal).toBe(run.hurst[11]);
    expect(Number.isFinite(run.hurstFinal)).toBe(true);
  });

  it('reports the min and max hurst readings', () => {
    const run = runLineHurst(HURST_DATA, { period: 4 });
    const defined = run.hurst.filter((v): v is number => v !== null);
    expect(run.hurstMin).toBe(Math.min(...defined));
    expect(run.hurstMax).toBe(Math.max(...defined));
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineHurst([{ x: 0, value: 5 }], { period: 4 });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineHurst([], { period: 4 }).ok).toBe(false);
    expect(runLineHurst(null, { period: 4 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...HURST_DATA].reverse();
    const run = runLineHurst(shuffled, { period: 4 });
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(runLineHurst(HURST_DATA, { period: 4 }).samples).toHaveLength(12);
  });

  it('defaults to a period of 20', () => {
    expect(runLineHurst(HURST_DATA).period).toBe(20);
  });
});

describe('computeLineHurstLayout', () => {
  const base = {
    data: HURST_DATA,
    period: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineHurstLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(12);
  });

  it('stacks the price panel above the hurst panel', () => {
    const layout = computeLineHurstLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.hurstPanel.height).toBeGreaterThan(0);
    expect(layout.hurstPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and hurst paths', () => {
    const layout = computeLineHurstLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.hurstPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined hurst', () => {
    const layout = computeLineHurstLayout(base);
    expect(layout.priceDots).toHaveLength(12);
    expect(layout.hurstMarkers).toHaveLength(9);
  });

  it('fixes the hurst panel y-domain to the unit interval', () => {
    const layout = computeLineHurstLayout(base);
    expect(layout.hurstYMin).toBe(0);
    expect(layout.hurstYMax).toBe(1);
  });

  it('places the 0.5 reference line inside the hurst panel', () => {
    const layout = computeLineHurstLayout(base);
    expect(layout.refY).toBeGreaterThanOrEqual(layout.hurstPanel.y);
    expect(layout.refY).toBeLessThanOrEqual(
      layout.hurstPanel.y + layout.hurstPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineHurstLayout(base);
    expect(layout.period).toBe(4);
    expect(layout.totalPoints).toBe(12);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineHurstLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.hurstPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineHurstLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineHurstChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineHurstChart(HURST_DATA, { period: 4 });
    expect(text).toContain('Hurst exponent');
    expect(text).toContain('rescaled range');
    expect(text).toContain('trending');
    expect(text).toContain('mean reverting');
  });

  it('reports the trending and reverting counts', () => {
    const run = runLineHurst(HURST_DATA, { period: 4 });
    const text = describeLineHurstChart(HURST_DATA, { period: 4 });
    expect(text).toContain(`trending on ${run.trendingCount}`);
    expect(text).toContain(`mean reverting on ${run.revertingCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineHurstChart([])).toBe('No data');
    expect(describeLineHurstChart(null)).toBe('No data');
  });
});

describe('<ChartLineHurst />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-hurst-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Hurst exponent');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    const root = container.querySelector('[data-section="chart-line-hurst"]');
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('12');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and hurst lines', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hurst-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-hurst-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-hurst-hurst-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hurst-panel-label"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one hurst marker per defined value', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-hurst-marker"]'),
    ).toHaveLength(9);
  });

  it('classifies each marker with a class attribute', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-hurst-marker"]',
    );
    for (const m of markers) {
      const cls = m.getAttribute('data-class');
      expect(['trending', 'reverting', 'random']).toContain(cls);
    }
  });

  it('renders the 0.5 reference line', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hurst-ref-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hurst-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-hurst-badge-period"]',
    );
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hurst-price-path"]'),
    ).toBeNull();
  });

  it('hides the hurst line and markers when showHurst is false', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} showHurst={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hurst-hurst-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-hurst-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the hurst line via the hidden set', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} hiddenSeries={['hurst']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hurst-hurst-line"]'),
    ).toBeNull();
  });

  it('hides the reference line when showRefLine is false', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} showRefLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hurst-ref-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineHurst
        data={HURST_DATA}
        period={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-hurst-legend-item"][data-series-id="hurst"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'hurst', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-hurst-dot"]'),
    ).toHaveLength(12);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineHurst data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-hurst"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-hurst-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} period={4} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hurst-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHurst ref={ref} data={HURST_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-hurst');
  });

  it('has a stable displayName', () => {
    expect(ChartLineHurst.displayName).toBe('ChartLineHurst');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineHurst data={HURST_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-hurst"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
