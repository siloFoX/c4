import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineSuperSmoother,
  computeLineSuperSmoother,
  computeLineSuperSmootherCoefficients,
  computeLineSuperSmootherLayout,
  getLineSuperSmootherFinitePoints,
  normalizeLineSuperSmootherPeriod,
  runLineSuperSmoother,
  describeLineSuperSmootherChart,
  type ChartLineSuperSmootherPoint,
} from './chart-line-supersmoother';

afterEach(() => cleanup());

// The Super Smoother is a two-pole filter; its coefficients come
// from exp and cos and are irrational, so the filter values are
// asserted against the recursion itself rather than hard-coded.
// The price oscillates wildly (10, 10, 30, 8, 32, 6) while the
// filter stays in a smooth 10..19 band, so bars 2-5 are clearly
// above / below it with a wide margin: on, on, above, below,
// above, below.
const SUPERSMOOTHER_DATA: ChartLineSuperSmootherPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 10 },
  { x: 2, value: 30 },
  { x: 3, value: 8 },
  { x: 4, value: 32 },
  { x: 5, value: 6 },
];

describe('getLineSuperSmootherFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineSuperSmootherFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineSuperSmootherFinitePoints(null)).toEqual([]);
    expect(getLineSuperSmootherFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineSuperSmootherPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineSuperSmootherPeriod(10.8, 10)).toBe(10);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineSuperSmootherPeriod(0, 10)).toBe(10);
    expect(normalizeLineSuperSmootherPeriod(NaN, 10)).toBe(10);
    expect(normalizeLineSuperSmootherPeriod(-5, 10)).toBe(10);
  });
});

describe('computeLineSuperSmootherCoefficients', () => {
  it('derives c2 directly from b1', () => {
    const c = computeLineSuperSmootherCoefficients(10);
    expect(c.c2).toBe(c.b1);
  });

  it('derives c3 as the negative a1 squared', () => {
    const c = computeLineSuperSmootherCoefficients(10);
    expect(c.c3).toBe(-(c.a1 * c.a1));
  });

  it('derives c1 so the coefficients sum to one', () => {
    const c = computeLineSuperSmootherCoefficients(10);
    expect(c.c1).toBe(1 - c.c2 - c.c3);
  });

  it('keeps a1 inside the unit interval for a positive period', () => {
    const c = computeLineSuperSmootherCoefficients(10);
    expect(c.a1).toBeGreaterThan(0);
    expect(c.a1).toBeLessThan(1);
  });

  it('falls back to the default period for a non-positive period', () => {
    expect(computeLineSuperSmootherCoefficients(0)).toEqual(
      computeLineSuperSmootherCoefficients(10),
    );
    expect(computeLineSuperSmootherCoefficients(NaN)).toEqual(
      computeLineSuperSmootherCoefficients(10),
    );
  });
});

describe('computeLineSuperSmoother', () => {
  const values = SUPERSMOOTHER_DATA.map((p) => p.value);

  it('seeds the first two bars straight from the price', () => {
    const ss = computeLineSuperSmoother(values, 10);
    expect(ss[0]).toBe(10);
    expect(ss[1]).toBe(10);
  });

  it('follows the two-pole recursion from the third bar', () => {
    const coeffs = computeLineSuperSmootherCoefficients(10);
    const ss = computeLineSuperSmoother(values, 10);
    for (let i = 2; i < values.length; i += 1) {
      const expected =
        coeffs.c1 * (values[i]! + values[i - 1]!) / 2 +
        coeffs.c2 * ss[i - 1]! +
        coeffs.c3 * ss[i - 2]!;
      expect(ss[i]).toBe(expected);
    }
  });

  it('passes a flat series through at its constant', () => {
    const ss = computeLineSuperSmoother([5, 5, 5, 5], 10);
    for (const v of ss) {
      expect(v).toBeCloseTo(5, 8);
    }
  });

  it('returns the two seeds for a two-point series', () => {
    expect(computeLineSuperSmoother([7, 9], 10)).toEqual([7, 9]);
  });

  it('returns the lone value for a single-point series', () => {
    expect(computeLineSuperSmoother([5], 10)).toEqual([5]);
  });

  it('returns an empty array for non-array or empty input', () => {
    expect(computeLineSuperSmoother(null, 10)).toEqual([]);
    expect(computeLineSuperSmoother([], 10)).toEqual([]);
  });
});

describe('runLineSuperSmoother', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineSuperSmoother(SUPERSMOOTHER_DATA, { period: 10 }).ok).toBe(
      true,
    );
  });

  it('carries the period onto the run', () => {
    expect(
      runLineSuperSmoother(SUPERSMOOTHER_DATA, { period: 10 }).period,
    ).toBe(10);
  });

  it('exposes the Super Smoother series with no warm-up', () => {
    const run = runLineSuperSmoother(SUPERSMOOTHER_DATA, { period: 10 });
    expect(run.smoother).toHaveLength(6);
    expect(run.smoother[0]).toBe(10);
    expect(run.smoother[1]).toBe(10);
  });

  it('classifies each sample by price position versus the smoother', () => {
    const run = runLineSuperSmoother(SUPERSMOOTHER_DATA, { period: 10 });
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[2]!.position).toBe('above');
    expect(run.samples[3]!.position).toBe('below');
  });

  it('counts bars above and below the smoother', () => {
    const run = runLineSuperSmoother(SUPERSMOOTHER_DATA, { period: 10 });
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(2);
  });

  it('reports the final, min and max smoother readings', () => {
    const run = runLineSuperSmoother(SUPERSMOOTHER_DATA, { period: 10 });
    expect(run.smootherFinal).toBe(run.smoother[5]);
    expect(run.smootherMin).toBe(Math.min(...run.smoother));
    expect(run.smootherMax).toBe(Math.max(...run.smoother));
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineSuperSmoother([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineSuperSmoother([]).ok).toBe(false);
    expect(runLineSuperSmoother(null).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...SUPERSMOOTHER_DATA].reverse();
    const run = runLineSuperSmoother(shuffled, { period: 10 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.smoother[0]).toBe(10);
  });

  it('produces one sample per series point', () => {
    expect(
      runLineSuperSmoother(SUPERSMOOTHER_DATA, { period: 10 }).samples,
    ).toHaveLength(6);
  });

  it('defaults to period 10', () => {
    expect(runLineSuperSmoother(SUPERSMOOTHER_DATA).period).toBe(10);
  });
});

describe('computeLineSuperSmootherLayout', () => {
  const base = {
    data: SUPERSMOOTHER_DATA,
    period: 10,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineSuperSmootherLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(6);
  });

  it('builds non-empty price and smoother paths', () => {
    const layout = computeLineSuperSmootherLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.smootherPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot and one marker per bar', () => {
    const layout = computeLineSuperSmootherLayout(base);
    expect(layout.priceDots).toHaveLength(6);
    expect(layout.smootherMarkers).toHaveLength(6);
  });

  it('spans a y domain covering both the price and the smoother', () => {
    const layout = computeLineSuperSmootherLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(6);
    expect(layout.yMax).toBeGreaterThanOrEqual(32);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineSuperSmootherLayout(base);
    expect(layout.aboveCount).toBe(2);
    expect(layout.belowCount).toBe(2);
    expect(layout.period).toBe(10);
  });

  it('keeps the smoother markers inside the panel', () => {
    const layout = computeLineSuperSmootherLayout(base);
    for (const m of layout.smootherMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineSuperSmootherLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.smootherPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineSuperSmootherLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineSuperSmootherChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineSuperSmootherChart(SUPERSMOOTHER_DATA, {
      period: 10,
    });
    expect(text).toContain('Ehlers');
    expect(text).toContain('Super Smoother');
    expect(text).toContain('two-pole');
    expect(text).toContain('filter');
  });

  it('reports the above and below counts', () => {
    const text = describeLineSuperSmootherChart(SUPERSMOOTHER_DATA, {
      period: 10,
    });
    expect(text).toContain('above the Super Smoother on 2');
    expect(text).toContain('below on 2');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineSuperSmootherChart([])).toBe('No data');
    expect(describeLineSuperSmootherChart(null)).toBe('No data');
  });
});

describe('<ChartLineSuperSmoother />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineSuperSmoother data={SUPERSMOOTHER_DATA} period={10} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineSuperSmoother data={SUPERSMOOTHER_DATA} period={10} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-supersmoother-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Super Smoother');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineSuperSmoother data={SUPERSMOOTHER_DATA} period={10} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supersmoother"]',
    );
    expect(root!.getAttribute('data-period')).toBe('10');
    expect(root!.getAttribute('data-above-count')).toBe('2');
    expect(root!.getAttribute('data-below-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('6');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and Super Smoother lines', () => {
    const { container } = render(
      <ChartLineSuperSmoother data={SUPERSMOOTHER_DATA} period={10} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-supersmoother-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-supersmoother-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-supersmoother-smoother-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one smoother marker per bar', () => {
    const { container } = render(
      <ChartLineSuperSmoother data={SUPERSMOOTHER_DATA} period={10} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-supersmoother-marker"]',
      ),
    ).toHaveLength(6);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineSuperSmoother data={SUPERSMOOTHER_DATA} period={10} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-supersmoother-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineSuperSmoother data={SUPERSMOOTHER_DATA} period={10} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-supersmoother-badge-period"]',
    );
    expect(badge!.textContent).toContain('10');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineSuperSmoother
        data={SUPERSMOOTHER_DATA}
        period={10}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supersmoother-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the smoother line and markers when showSmoother is false', () => {
    const { container } = render(
      <ChartLineSuperSmoother
        data={SUPERSMOOTHER_DATA}
        period={10}
        showSmoother={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supersmoother-smoother-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-supersmoother-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the smoother line via the hidden set', () => {
    const { container } = render(
      <ChartLineSuperSmoother
        data={SUPERSMOOTHER_DATA}
        period={10}
        hiddenSeries={['smoother']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supersmoother-smoother-line"]',
      ),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineSuperSmoother
        data={SUPERSMOOTHER_DATA}
        period={10}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-supersmoother-legend-item"][data-series-id="smoother"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'smoother', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineSuperSmoother data={SUPERSMOOTHER_DATA} period={10} showDots />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-supersmoother-dot"]',
      ),
    ).toHaveLength(6);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineSuperSmoother data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supersmoother"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-supersmoother-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineSuperSmoother
        data={SUPERSMOOTHER_DATA}
        period={10}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supersmoother-badge"]',
      ),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineSuperSmoother
        ref={ref}
        data={SUPERSMOOTHER_DATA}
        period={10}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-supersmoother',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineSuperSmoother.displayName).toBe('ChartLineSuperSmoother');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineSuperSmoother
        data={SUPERSMOOTHER_DATA}
        period={10}
        animate={false}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supersmoother"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
