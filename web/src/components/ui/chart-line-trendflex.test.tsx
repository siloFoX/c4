import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineTrendflex,
  computeLineTrendflex,
  computeLineTrendflexSmoother,
  computeLineTrendflexSmootherCoefficients,
  computeLineTrendflexSum,
  computeLineTrendflexLayout,
  getLineTrendflexFinitePoints,
  normalizeLineTrendflexPeriod,
  runLineTrendflex,
  describeLineTrendflexChart,
  type ChartLineTrendflexPoint,
} from './chart-line-trendflex';

afterEach(() => cleanup());

// The Trendflex runs the price through a Super Smoother whose
// coefficients come from exp / cos and are irrational, so the
// pipeline values are asserted against the recursions themselves
// and against exact anchors. The trend sum is exact-testable on
// its own: fed a linear ramp it returns a constant.
const TRENDFLEX_DATA: ChartLineTrendflexPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 13 },
  { x: 2, value: 17 },
  { x: 3, value: 22 },
  { x: 4, value: 28 },
  { x: 5, value: 31 },
  { x: 6, value: 27 },
  { x: 7, value: 21 },
  { x: 8, value: 16 },
  { x: 9, value: 12 },
];

const RAMP = [0, 1, 2, 3, 4, 5, 6, 7, 8];

describe('getLineTrendflexFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineTrendflexFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineTrendflexFinitePoints(null)).toEqual([]);
    expect(getLineTrendflexFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineTrendflexPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineTrendflexPeriod(20.9, 20)).toBe(20);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLineTrendflexPeriod(1, 20)).toBe(20);
    expect(normalizeLineTrendflexPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineTrendflexPeriod(-5, 20)).toBe(20);
  });
});

describe('computeLineTrendflexSmootherCoefficients', () => {
  it('derives c2 from b1 and c3 from a1 squared', () => {
    const c = computeLineTrendflexSmootherCoefficients(20);
    expect(c.c2).toBe(c.b1);
    expect(c.c3).toBe(-(c.a1 * c.a1));
  });

  it('derives c1 so the coefficients sum to one', () => {
    const c = computeLineTrendflexSmootherCoefficients(20);
    expect(c.c1).toBe(1 - c.c2 - c.c3);
  });

  it('keeps a1 inside the unit interval', () => {
    const c = computeLineTrendflexSmootherCoefficients(20);
    expect(c.a1).toBeGreaterThan(0);
    expect(c.a1).toBeLessThan(1);
  });

  it('falls back to the default period for a sub-2 period', () => {
    expect(computeLineTrendflexSmootherCoefficients(1)).toEqual(
      computeLineTrendflexSmootherCoefficients(20),
    );
  });
});

describe('computeLineTrendflexSmoother', () => {
  it('seeds the first two bars straight from the input', () => {
    const out = computeLineTrendflexSmoother([7, 9, 4, 6], 4);
    expect(out[0]).toBe(7);
    expect(out[1]).toBe(9);
  });

  it('follows the two-pole smoother recursion', () => {
    const coeffs = computeLineTrendflexSmootherCoefficients(4);
    const input = [7, 9, 4, 6, 8];
    const out = computeLineTrendflexSmoother(input, 4);
    for (let i = 2; i < input.length; i += 1) {
      const expected =
        (coeffs.c1 * (input[i]! + input[i - 1]!)) / 2 +
        coeffs.c2 * out[i - 1]! +
        coeffs.c3 * out[i - 2]!;
      expect(out[i]).toBe(expected);
    }
  });

  it('holds an all-zero series at zero', () => {
    expect(computeLineTrendflexSmoother([0, 0, 0, 0], 4)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineTrendflexSmoother(null, 4)).toEqual([]);
  });
});

describe('computeLineTrendflexSum', () => {
  it('computes the average bar-to-bar displacement of the filter', () => {
    expect(computeLineTrendflexSum(RAMP, 4)).toEqual([
      null,
      null,
      null,
      null,
      2.5,
      2.5,
      2.5,
      2.5,
      2.5,
    ]);
  });

  it('reads negative for a falling filter', () => {
    expect(computeLineTrendflexSum([8, 7, 6, 5, 4, 3, 2, 1, 0], 4)).toEqual([
      null,
      null,
      null,
      null,
      -2.5,
      -2.5,
      -2.5,
      -2.5,
      -2.5,
    ]);
  });

  it('holds a flat filter at zero', () => {
    expect(computeLineTrendflexSum([5, 5, 5, 5, 5, 5], 4)).toEqual([
      null,
      null,
      null,
      null,
      0,
      0,
    ]);
  });

  it('is null until the lookback window is full', () => {
    const sum = computeLineTrendflexSum([1, 2, 3, 4, 5], 4);
    expect(sum.slice(0, 4)).toEqual([null, null, null, null]);
    expect(typeof sum[4]).toBe('number');
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineTrendflexSum(null, 4)).toEqual([]);
  });
});

describe('computeLineTrendflex', () => {
  const values = TRENDFLEX_DATA.map((p) => p.value);

  it('holds an all-zero series at zero through the pipeline', () => {
    expect(computeLineTrendflex([0, 0, 0, 0, 0, 0], 4)).toEqual({
      filt: [0, 0, 0, 0, 0, 0],
      sum: [null, null, null, null, 0, 0],
      ms: [null, null, null, null, 0, 0],
      trendflex: [null, null, null, null, 0, 0],
    });
  });

  it('wires the smoother stage to the price', () => {
    const result = computeLineTrendflex(values, 4);
    expect(result.filt).toEqual(computeLineTrendflexSmoother(values, 4));
  });

  it('wires the sum stage to the smoothed series', () => {
    const result = computeLineTrendflex(values, 4);
    expect(result.sum).toEqual(computeLineTrendflexSum(result.filt, 4));
  });

  it('accumulates the mean square with the 0.04 / 0.96 recursion', () => {
    const result = computeLineTrendflex(values, 4);
    let prevMs = 0;
    for (let i = 0; i < result.sum.length; i += 1) {
      const s = result.sum[i];
      if (s === null || s === undefined) {
        expect(result.ms[i]).toBeNull();
        continue;
      }
      const expected = 0.04 * s * s + 0.96 * prevMs;
      expect(result.ms[i]).toBe(expected);
      prevMs = expected;
    }
  });

  it('normalizes the trendflex by the root mean square', () => {
    const result = computeLineTrendflex(values, 4);
    for (let i = 0; i < result.sum.length; i += 1) {
      const s = result.sum[i];
      const m = result.ms[i];
      if (s === null || s === undefined || m === null || m === undefined) {
        expect(result.trendflex[i]).toBeNull();
        continue;
      }
      const expected = m !== 0 ? s / Math.sqrt(m) : 0;
      expect(result.trendflex[i]).toBe(expected);
    }
  });

  it('returns empty series for non-array input', () => {
    expect(computeLineTrendflex(null, 4)).toEqual({
      filt: [],
      sum: [],
      ms: [],
      trendflex: [],
    });
  });
});

describe('runLineTrendflex', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineTrendflex(TRENDFLEX_DATA, { period: 4 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineTrendflex(TRENDFLEX_DATA, { period: 4 }).period).toBe(4);
  });

  it('exposes the filt, sum, ms and trendflex series', () => {
    const run = runLineTrendflex(TRENDFLEX_DATA, { period: 4 });
    expect(run.filt).toHaveLength(10);
    expect(run.sum).toHaveLength(10);
    expect(run.ms).toHaveLength(10);
    expect(run.trendflex).toHaveLength(10);
  });

  it('leaves the trendflex null until the lookback window is full', () => {
    const run = runLineTrendflex(TRENDFLEX_DATA, { period: 4 });
    expect(run.samples.slice(0, 4).every((s) => s.trendflex === null)).toBe(
      true,
    );
    expect(typeof run.samples[4]!.trendflex).toBe('number');
  });

  it('classifies each sample by the sign of the trendflex', () => {
    const run = runLineTrendflex(TRENDFLEX_DATA, { period: 4 });
    for (const s of run.samples) {
      if (s.trendflex === null || s.trendflex === 0) {
        expect(s.trend).toBe('flat');
      } else {
        expect(s.trend).toBe(s.trendflex > 0 ? 'up' : 'down');
      }
    }
  });

  it('counts the up and down bars consistently', () => {
    const run = runLineTrendflex(TRENDFLEX_DATA, { period: 4 });
    expect(run.upCount).toBe(
      run.trendflex.filter((v) => v !== null && v > 0).length,
    );
    expect(run.downCount).toBe(
      run.trendflex.filter((v) => v !== null && v < 0).length,
    );
  });

  it('reports the final trendflex reading', () => {
    const run = runLineTrendflex(TRENDFLEX_DATA, { period: 4 });
    expect(run.trendflexFinal).toBe(run.trendflex[9]);
    expect(Number.isFinite(run.trendflexFinal)).toBe(true);
  });

  it('reports the min and max trendflex readings', () => {
    const run = runLineTrendflex(TRENDFLEX_DATA, { period: 4 });
    const defined = run.trendflex.filter((v): v is number => v !== null);
    expect(run.trendflexMin).toBe(Math.min(...defined));
    expect(run.trendflexMax).toBe(Math.max(...defined));
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineTrendflex([{ x: 0, value: 5 }], { period: 4 });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineTrendflex([], { period: 4 }).ok).toBe(false);
    expect(runLineTrendflex(null, { period: 4 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...TRENDFLEX_DATA].reverse();
    const run = runLineTrendflex(shuffled, { period: 4 });
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(runLineTrendflex(TRENDFLEX_DATA, { period: 4 }).samples).toHaveLength(
      10,
    );
  });

  it('defaults to a period of 20', () => {
    expect(runLineTrendflex(TRENDFLEX_DATA).period).toBe(20);
  });
});

describe('computeLineTrendflexLayout', () => {
  const base = {
    data: TRENDFLEX_DATA,
    period: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineTrendflexLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('stacks the price panel above the trendflex panel', () => {
    const layout = computeLineTrendflexLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.trendflexPanel.height).toBeGreaterThan(0);
    expect(layout.trendflexPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and trendflex paths', () => {
    const layout = computeLineTrendflexLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.trendflexPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined trendflex', () => {
    const layout = computeLineTrendflexLayout(base);
    expect(layout.priceDots).toHaveLength(10);
    expect(layout.trendflexMarkers).toHaveLength(6);
  });

  it('places the zero line inside the trendflex panel', () => {
    const layout = computeLineTrendflexLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.trendflexPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.trendflexPanel.y + layout.trendflexPanel.height,
    );
  });

  it('centres the trendflex panel y-domain on zero', () => {
    const layout = computeLineTrendflexLayout(base);
    expect(layout.trendflexYMin).toBe(-layout.trendflexYMax);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineTrendflexLayout(base);
    expect(layout.period).toBe(4);
    expect(layout.totalPoints).toBe(10);
    expect(Number.isFinite(layout.trendflexFinal)).toBe(true);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineTrendflexLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.trendflexPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineTrendflexLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTrendflexChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineTrendflexChart(TRENDFLEX_DATA, { period: 4 });
    expect(text).toContain('Trendflex');
    expect(text).toContain('Super Smoother');
    expect(text).toContain('trend strength');
    expect(text).toContain('root mean square');
  });

  it('reports the up and down counts', () => {
    const run = runLineTrendflex(TRENDFLEX_DATA, { period: 4 });
    const text = describeLineTrendflexChart(TRENDFLEX_DATA, { period: 4 });
    expect(text).toContain(`up on ${run.upCount}`);
    expect(text).toContain(`down on ${run.downCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineTrendflexChart([])).toBe('No data');
    expect(describeLineTrendflexChart(null)).toBe('No data');
  });
});

describe('<ChartLineTrendflex />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trendflex-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Trendflex');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trendflex"]',
    );
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and trendflex lines', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trendflex-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-trendflex-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-trendflex-trendflex-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trendflex-panel-label"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one trendflex marker per defined value', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trendflex-marker"]',
      ),
    ).toHaveLength(6);
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trendflex-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trendflex-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-trendflex-badge-period"]',
    );
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineTrendflex
        data={TRENDFLEX_DATA}
        period={4}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trendflex-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the trendflex line and markers when showTrendflex is false', () => {
    const { container } = render(
      <ChartLineTrendflex
        data={TRENDFLEX_DATA}
        period={4}
        showTrendflex={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trendflex-trendflex-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trendflex-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the trendflex line via the hidden set', () => {
    const { container } = render(
      <ChartLineTrendflex
        data={TRENDFLEX_DATA}
        period={4}
        hiddenSeries={['trendflex']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trendflex-trendflex-line"]',
      ),
    ).toBeNull();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineTrendflex
        data={TRENDFLEX_DATA}
        period={4}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trendflex-zero-line"]',
      ),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineTrendflex
        data={TRENDFLEX_DATA}
        period={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-trendflex-legend-item"][data-series-id="trendflex"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'trendflex', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} period={4} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-trendflex-dot"]'),
    ).toHaveLength(10);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineTrendflex data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trendflex"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-trendflex-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineTrendflex
        data={TRENDFLEX_DATA}
        period={4}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trendflex-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTrendflex ref={ref} data={TRENDFLEX_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-trendflex',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineTrendflex.displayName).toBe('ChartLineTrendflex');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineTrendflex data={TRENDFLEX_DATA} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trendflex"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
