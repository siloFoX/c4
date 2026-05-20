import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineReflex,
  computeLineReflex,
  computeLineReflexSmoother,
  computeLineReflexSmootherCoefficients,
  computeLineReflexSum,
  computeLineReflexLayout,
  getLineReflexFinitePoints,
  normalizeLineReflexPeriod,
  runLineReflex,
  describeLineReflexChart,
  type ChartLineReflexPoint,
} from './chart-line-reflex';

afterEach(() => cleanup());

// The Reflex runs the price through a Super Smoother whose
// coefficients come from exp / cos and are irrational, so the
// pipeline values are asserted against the recursions themselves
// and against exact anchors. The Reflex sum subtracts a trendline,
// so it is exact-testable on its own: fed a linear ramp it returns
// zero (no trend response); fed a curved filter it returns the
// exact deviation from the line.
const REFLEX_DATA: ChartLineReflexPoint[] = [
  { x: 0, value: 12 },
  { x: 1, value: 16 },
  { x: 2, value: 21 },
  { x: 3, value: 19 },
  { x: 4, value: 14 },
  { x: 5, value: 11 },
  { x: 6, value: 15 },
  { x: 7, value: 20 },
  { x: 8, value: 24 },
  { x: 9, value: 21 },
];

const RAMP = [0, 1, 2, 3, 4, 5, 6, 7, 8];

describe('getLineReflexFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineReflexFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineReflexFinitePoints(null)).toEqual([]);
    expect(getLineReflexFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineReflexPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineReflexPeriod(20.9, 20)).toBe(20);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLineReflexPeriod(1, 20)).toBe(20);
    expect(normalizeLineReflexPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineReflexPeriod(-5, 20)).toBe(20);
  });
});

describe('computeLineReflexSmootherCoefficients', () => {
  it('derives c2 from b1 and c3 from a1 squared', () => {
    const c = computeLineReflexSmootherCoefficients(20);
    expect(c.c2).toBe(c.b1);
    expect(c.c3).toBe(-(c.a1 * c.a1));
  });

  it('derives c1 so the coefficients sum to one', () => {
    const c = computeLineReflexSmootherCoefficients(20);
    expect(c.c1).toBe(1 - c.c2 - c.c3);
  });

  it('keeps a1 inside the unit interval', () => {
    const c = computeLineReflexSmootherCoefficients(20);
    expect(c.a1).toBeGreaterThan(0);
    expect(c.a1).toBeLessThan(1);
  });

  it('falls back to the default period for a sub-2 period', () => {
    expect(computeLineReflexSmootherCoefficients(1)).toEqual(
      computeLineReflexSmootherCoefficients(20),
    );
  });
});

describe('computeLineReflexSmoother', () => {
  it('seeds the first two bars straight from the input', () => {
    const out = computeLineReflexSmoother([7, 9, 4, 6], 4);
    expect(out[0]).toBe(7);
    expect(out[1]).toBe(9);
  });

  it('follows the two-pole smoother recursion', () => {
    const coeffs = computeLineReflexSmootherCoefficients(4);
    const input = [7, 9, 4, 6, 8];
    const out = computeLineReflexSmoother(input, 4);
    for (let i = 2; i < input.length; i += 1) {
      const expected =
        (coeffs.c1 * (input[i]! + input[i - 1]!)) / 2 +
        coeffs.c2 * out[i - 1]! +
        coeffs.c3 * out[i - 2]!;
      expect(out[i]).toBe(expected);
    }
  });

  it('holds an all-zero series at zero', () => {
    expect(computeLineReflexSmoother([0, 0, 0, 0], 4)).toEqual([0, 0, 0, 0]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineReflexSmoother(null, 4)).toEqual([]);
  });
});

describe('computeLineReflexSum', () => {
  it('computes zero for a linear ramp (no trend response)', () => {
    expect(computeLineReflexSum(RAMP, 4)).toEqual([
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it('computes a non-zero deviation for a curved filter', () => {
    expect(computeLineReflexSum([0, 2, 4, 2, 0], 4)).toEqual([
      null,
      null,
      null,
      null,
      -2,
    ]);
  });

  it('holds a flat filter at zero', () => {
    expect(computeLineReflexSum([5, 5, 5, 5, 5, 5], 4)).toEqual([
      null,
      null,
      null,
      null,
      0,
      0,
    ]);
  });

  it('is null until the lookback window is full', () => {
    const sum = computeLineReflexSum([1, 2, 3, 4, 5], 4);
    expect(sum.slice(0, 4)).toEqual([null, null, null, null]);
    expect(typeof sum[4]).toBe('number');
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineReflexSum(null, 4)).toEqual([]);
  });
});

describe('computeLineReflex', () => {
  const values = REFLEX_DATA.map((p) => p.value);

  it('holds an all-zero series at zero through the pipeline', () => {
    expect(computeLineReflex([0, 0, 0, 0, 0, 0], 4)).toEqual({
      filt: [0, 0, 0, 0, 0, 0],
      sum: [null, null, null, null, 0, 0],
      ms: [null, null, null, null, 0, 0],
      reflex: [null, null, null, null, 0, 0],
    });
  });

  it('wires the smoother stage to the price', () => {
    const result = computeLineReflex(values, 4);
    expect(result.filt).toEqual(computeLineReflexSmoother(values, 4));
  });

  it('wires the sum stage to the smoothed series', () => {
    const result = computeLineReflex(values, 4);
    expect(result.sum).toEqual(computeLineReflexSum(result.filt, 4));
  });

  it('accumulates the mean square with the 0.04 / 0.96 recursion', () => {
    const result = computeLineReflex(values, 4);
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

  it('normalizes the reflex by the root mean square', () => {
    const result = computeLineReflex(values, 4);
    for (let i = 0; i < result.sum.length; i += 1) {
      const s = result.sum[i];
      const m = result.ms[i];
      if (s === null || s === undefined || m === null || m === undefined) {
        expect(result.reflex[i]).toBeNull();
        continue;
      }
      const expected = m !== 0 ? s / Math.sqrt(m) : 0;
      expect(result.reflex[i]).toBe(expected);
    }
  });

  it('returns empty series for non-array input', () => {
    expect(computeLineReflex(null, 4)).toEqual({
      filt: [],
      sum: [],
      ms: [],
      reflex: [],
    });
  });
});

describe('runLineReflex', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineReflex(REFLEX_DATA, { period: 4 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineReflex(REFLEX_DATA, { period: 4 }).period).toBe(4);
  });

  it('exposes the filt, sum, ms and reflex series', () => {
    const run = runLineReflex(REFLEX_DATA, { period: 4 });
    expect(run.filt).toHaveLength(10);
    expect(run.sum).toHaveLength(10);
    expect(run.ms).toHaveLength(10);
    expect(run.reflex).toHaveLength(10);
  });

  it('leaves the reflex null until the lookback window is full', () => {
    const run = runLineReflex(REFLEX_DATA, { period: 4 });
    expect(run.samples.slice(0, 4).every((s) => s.reflex === null)).toBe(true);
    expect(typeof run.samples[4]!.reflex).toBe('number');
  });

  it('classifies each sample by the sign of the reflex', () => {
    const run = runLineReflex(REFLEX_DATA, { period: 4 });
    for (const s of run.samples) {
      if (s.reflex === null || s.reflex === 0) {
        expect(s.sign).toBe('zero');
      } else {
        expect(s.sign).toBe(s.reflex > 0 ? 'positive' : 'negative');
      }
    }
  });

  it('counts the positive and negative bars consistently', () => {
    const run = runLineReflex(REFLEX_DATA, { period: 4 });
    expect(run.positiveCount).toBe(
      run.reflex.filter((v) => v !== null && v > 0).length,
    );
    expect(run.negativeCount).toBe(
      run.reflex.filter((v) => v !== null && v < 0).length,
    );
  });

  it('reports the final reflex reading', () => {
    const run = runLineReflex(REFLEX_DATA, { period: 4 });
    expect(run.reflexFinal).toBe(run.reflex[9]);
    expect(Number.isFinite(run.reflexFinal)).toBe(true);
  });

  it('reports the min and max reflex readings', () => {
    const run = runLineReflex(REFLEX_DATA, { period: 4 });
    const defined = run.reflex.filter((v): v is number => v !== null);
    expect(run.reflexMin).toBe(Math.min(...defined));
    expect(run.reflexMax).toBe(Math.max(...defined));
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineReflex([{ x: 0, value: 5 }], { period: 4 });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineReflex([], { period: 4 }).ok).toBe(false);
    expect(runLineReflex(null, { period: 4 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...REFLEX_DATA].reverse();
    const run = runLineReflex(shuffled, { period: 4 });
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(runLineReflex(REFLEX_DATA, { period: 4 }).samples).toHaveLength(10);
  });

  it('defaults to a period of 20', () => {
    expect(runLineReflex(REFLEX_DATA).period).toBe(20);
  });
});

describe('computeLineReflexLayout', () => {
  const base = {
    data: REFLEX_DATA,
    period: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineReflexLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('stacks the price panel above the reflex panel', () => {
    const layout = computeLineReflexLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.reflexPanel.height).toBeGreaterThan(0);
    expect(layout.reflexPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and reflex paths', () => {
    const layout = computeLineReflexLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.reflexPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined reflex', () => {
    const layout = computeLineReflexLayout(base);
    expect(layout.priceDots).toHaveLength(10);
    expect(layout.reflexMarkers).toHaveLength(6);
  });

  it('places the zero line inside the reflex panel', () => {
    const layout = computeLineReflexLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.reflexPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.reflexPanel.y + layout.reflexPanel.height,
    );
  });

  it('centres the reflex panel y-domain on zero', () => {
    const layout = computeLineReflexLayout(base);
    expect(layout.reflexYMin).toBe(-layout.reflexYMax);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineReflexLayout(base);
    expect(layout.period).toBe(4);
    expect(layout.totalPoints).toBe(10);
    expect(Number.isFinite(layout.reflexFinal)).toBe(true);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineReflexLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.reflexPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineReflexLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineReflexChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineReflexChart(REFLEX_DATA, { period: 4 });
    expect(text).toContain('Reflex');
    expect(text).toContain('Super Smoother');
    expect(text).toContain('turning point');
    expect(text).toContain('root mean square');
  });

  it('reports the positive and negative counts', () => {
    const run = runLineReflex(REFLEX_DATA, { period: 4 });
    const text = describeLineReflexChart(REFLEX_DATA, { period: 4 });
    expect(text).toContain(`positive on ${run.positiveCount}`);
    expect(text).toContain(`negative on ${run.negativeCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineReflexChart([])).toBe('No data');
    expect(describeLineReflexChart(null)).toBe('No data');
  });
});

describe('<ChartLineReflex />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-reflex-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Reflex');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} />,
    );
    const root = container.querySelector('[data-section="chart-line-reflex"]');
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and reflex lines', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-reflex-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-reflex-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-reflex-reflex-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-reflex-panel-label"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one reflex marker per defined value', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-reflex-marker"]'),
    ).toHaveLength(6);
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-reflex-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-reflex-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-reflex-badge-period"]',
    );
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineReflex
        data={REFLEX_DATA}
        period={4}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-reflex-price-path"]'),
    ).toBeNull();
  });

  it('hides the reflex line and markers when showReflex is false', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} showReflex={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-reflex-reflex-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-reflex-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the reflex line via the hidden set', () => {
    const { container } = render(
      <ChartLineReflex
        data={REFLEX_DATA}
        period={4}
        hiddenSeries={['reflex']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-reflex-reflex-line"]'),
    ).toBeNull();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-reflex-zero-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineReflex
        data={REFLEX_DATA}
        period={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-reflex-legend-item"][data-series-id="reflex"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'reflex', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} period={4} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-reflex-dot"]'),
    ).toHaveLength(10);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineReflex data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-reflex"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-reflex-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineReflex
        data={REFLEX_DATA}
        period={4}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-reflex-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineReflex ref={ref} data={REFLEX_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-reflex',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineReflex.displayName).toBe('ChartLineReflex');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineReflex data={REFLEX_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-reflex"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
