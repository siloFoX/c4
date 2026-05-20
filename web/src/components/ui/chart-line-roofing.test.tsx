import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineRoofing,
  computeLineRoofing,
  computeLineRoofingHighpass,
  computeLineRoofingHighpassAlpha,
  computeLineRoofingSmoother,
  computeLineRoofingSmootherCoefficients,
  computeLineRoofingLayout,
  getLineRoofingFinitePoints,
  normalizeLineRoofingPeriod,
  runLineRoofing,
  describeLineRoofingChart,
  type ChartLineRoofingPoint,
} from './chart-line-roofing';

afterEach(() => cleanup());

// The Roofing filter chains a two-pole high-pass and a Super
// Smoother; its coefficients come from cos / sin / exp and are
// irrational, so the filter values are asserted against the
// recursion itself rather than hard-coded. A flat price series
// stays at zero through both stages.
const ROOFING_DATA: ChartLineRoofingPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 12 },
  { x: 2, value: 11 },
  { x: 3, value: 15 },
  { x: 4, value: 13 },
  { x: 5, value: 18 },
  { x: 6, value: 14 },
  { x: 7, value: 20 },
];

describe('getLineRoofingFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineRoofingFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineRoofingFinitePoints(null)).toEqual([]);
    expect(getLineRoofingFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineRoofingPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineRoofingPeriod(48.9, 48)).toBe(48);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineRoofingPeriod(0, 48)).toBe(48);
    expect(normalizeLineRoofingPeriod(NaN, 48)).toBe(48);
    expect(normalizeLineRoofingPeriod(-5, 48)).toBe(48);
  });
});

describe('computeLineRoofingHighpassAlpha', () => {
  it('produces an alpha inside the unit interval', () => {
    const alpha = computeLineRoofingHighpassAlpha(48);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it('falls back to the default period for a non-positive period', () => {
    expect(computeLineRoofingHighpassAlpha(0)).toBe(
      computeLineRoofingHighpassAlpha(48),
    );
  });
});

describe('computeLineRoofingHighpass', () => {
  const values = ROOFING_DATA.map((p) => p.value);

  it('seeds the first two bars at zero', () => {
    const hp = computeLineRoofingHighpass(values, 48);
    expect(hp).toHaveLength(8);
    expect(hp[0]).toBe(0);
    expect(hp[1]).toBe(0);
  });

  it('follows the two-pole high-pass recursion', () => {
    const alpha1 = computeLineRoofingHighpassAlpha(48);
    const hp = computeLineRoofingHighpass(values, 48);
    const k = 1 - alpha1 / 2;
    const inputCoeff = k * k;
    const oneMinusA = 1 - alpha1;
    const fb1 = 2 * oneMinusA;
    const fb2 = oneMinusA * oneMinusA;
    for (let i = 2; i < values.length; i += 1) {
      const expected =
        inputCoeff * (values[i]! - 2 * values[i - 1]! + values[i - 2]!) +
        fb1 * hp[i - 1]! -
        fb2 * hp[i - 2]!;
      expect(hp[i]).toBe(expected);
    }
  });

  it('holds a flat series at zero', () => {
    expect(computeLineRoofingHighpass([5, 5, 5, 5], 48)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('returns a single zero for a single-point series', () => {
    expect(computeLineRoofingHighpass([5], 48)).toEqual([0]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineRoofingHighpass(null, 48)).toEqual([]);
  });
});

describe('computeLineRoofingSmootherCoefficients', () => {
  it('derives c2 from b1 and c3 from a1 squared', () => {
    const c = computeLineRoofingSmootherCoefficients(10);
    expect(c.c2).toBe(c.b1);
    expect(c.c3).toBe(-(c.a1 * c.a1));
  });

  it('derives c1 so the coefficients sum to one', () => {
    const c = computeLineRoofingSmootherCoefficients(10);
    expect(c.c1).toBe(1 - c.c2 - c.c3);
  });

  it('keeps a1 inside the unit interval', () => {
    const c = computeLineRoofingSmootherCoefficients(10);
    expect(c.a1).toBeGreaterThan(0);
    expect(c.a1).toBeLessThan(1);
  });

  it('falls back to the default period for a non-positive period', () => {
    expect(computeLineRoofingSmootherCoefficients(0)).toEqual(
      computeLineRoofingSmootherCoefficients(10),
    );
  });
});

describe('computeLineRoofingSmoother', () => {
  it('seeds the first two bars straight from the input', () => {
    const out = computeLineRoofingSmoother([7, 9, 4, 6], 10);
    expect(out[0]).toBe(7);
    expect(out[1]).toBe(9);
  });

  it('follows the two-pole smoother recursion', () => {
    const coeffs = computeLineRoofingSmootherCoefficients(10);
    const input = [7, 9, 4, 6, 8];
    const out = computeLineRoofingSmoother(input, 10);
    for (let i = 2; i < input.length; i += 1) {
      const expected =
        coeffs.c1 * (input[i]! + input[i - 1]!) / 2 +
        coeffs.c2 * out[i - 1]! +
        coeffs.c3 * out[i - 2]!;
      expect(out[i]).toBe(expected);
    }
  });

  it('holds an all-zero input at zero', () => {
    expect(computeLineRoofingSmoother([0, 0, 0, 0], 10)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineRoofingSmoother(null, 10)).toEqual([]);
  });
});

describe('computeLineRoofing', () => {
  const values = ROOFING_DATA.map((p) => p.value);

  it('is the smoother of the high-pass of the price', () => {
    expect(computeLineRoofing(values, 48, 10)).toEqual(
      computeLineRoofingSmoother(
        computeLineRoofingHighpass(values, 48),
        10,
      ),
    );
  });

  it('seeds the first two bars at zero', () => {
    const roofing = computeLineRoofing(values, 48, 10);
    expect(roofing[0]).toBe(0);
    expect(roofing[1]).toBe(0);
  });

  it('holds a flat series at zero', () => {
    expect(computeLineRoofing([5, 5, 5, 5], 48, 10)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineRoofing(null, 48, 10)).toEqual([]);
  });
});

describe('runLineRoofing', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineRoofing(ROOFING_DATA).ok).toBe(true);
  });

  it('carries the high-pass and smoother periods onto the run', () => {
    const run = runLineRoofing(ROOFING_DATA, { hpPeriod: 48, ssPeriod: 10 });
    expect(run.hpPeriod).toBe(48);
    expect(run.ssPeriod).toBe(10);
  });

  it('exposes the high-pass and roofing series', () => {
    const run = runLineRoofing(ROOFING_DATA);
    expect(run.highpass).toHaveLength(8);
    expect(run.roofing).toHaveLength(8);
  });

  it('seeds the roofing series at zero for the first two bars', () => {
    const run = runLineRoofing(ROOFING_DATA);
    expect(run.samples[0]!.sign).toBe('zero');
    expect(run.samples[1]!.sign).toBe('zero');
  });

  it('counts the positive and negative bars consistently', () => {
    const run = runLineRoofing(ROOFING_DATA);
    expect(run.positiveCount).toBe(
      run.roofing.filter((v) => v > 0).length,
    );
    expect(run.negativeCount).toBe(
      run.roofing.filter((v) => v < 0).length,
    );
  });

  it('reports the final, min and max roofing readings', () => {
    const run = runLineRoofing(ROOFING_DATA);
    expect(run.roofingFinal).toBe(run.roofing[7]);
    expect(run.roofingMin).toBe(Math.min(...run.roofing));
    expect(run.roofingMax).toBe(Math.max(...run.roofing));
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineRoofing([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineRoofing([]).ok).toBe(false);
    expect(runLineRoofing(null).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...ROOFING_DATA].reverse();
    const run = runLineRoofing(shuffled);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('produces one sample per series point', () => {
    expect(runLineRoofing(ROOFING_DATA).samples).toHaveLength(8);
  });

  it('defaults to a 48-bar high-pass and a 10-bar smoother', () => {
    const run = runLineRoofing(ROOFING_DATA);
    expect(run.hpPeriod).toBe(48);
    expect(run.ssPeriod).toBe(10);
  });
});

describe('computeLineRoofingLayout', () => {
  const base = {
    data: ROOFING_DATA,
    hpPeriod: 48,
    ssPeriod: 10,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineRoofingLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(8);
  });

  it('stacks the price panel above the roofing panel', () => {
    const layout = computeLineRoofingLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.roofingPanel.height).toBeGreaterThan(0);
    expect(layout.roofingPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and roofing paths', () => {
    const layout = computeLineRoofingLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.roofingPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot and one marker per bar', () => {
    const layout = computeLineRoofingLayout(base);
    expect(layout.priceDots).toHaveLength(8);
    expect(layout.roofingMarkers).toHaveLength(8);
  });

  it('places the zero line inside the roofing panel', () => {
    const layout = computeLineRoofingLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.roofingPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.roofingPanel.y + layout.roofingPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineRoofingLayout(base);
    expect(layout.hpPeriod).toBe(48);
    expect(layout.ssPeriod).toBe(10);
    expect(layout.totalPoints).toBe(8);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineRoofingLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.roofingPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineRoofingLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineRoofingChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineRoofingChart(ROOFING_DATA);
    expect(text).toContain('Roofing filter');
    expect(text).toContain('high-pass');
    expect(text).toContain('Super Smoother');
    expect(text).toContain('band-pass');
  });

  it('reports the positive and negative counts', () => {
    const run = runLineRoofing(ROOFING_DATA);
    const text = describeLineRoofingChart(ROOFING_DATA);
    expect(text).toContain(`positive on ${run.positiveCount}`);
    expect(text).toContain(`negative on ${run.negativeCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineRoofingChart([])).toBe('No data');
    expect(describeLineRoofingChart(null)).toBe('No data');
  });
});

describe('<ChartLineRoofing />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineRoofing data={ROOFING_DATA} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineRoofing data={ROOFING_DATA} />);
    const desc = container.querySelector(
      '[data-section="chart-line-roofing-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Roofing filter');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineRoofing data={ROOFING_DATA} />);
    const root = container.querySelector('[data-section="chart-line-roofing"]');
    expect(root!.getAttribute('data-hp-period')).toBe('48');
    expect(root!.getAttribute('data-ss-period')).toBe('10');
    expect(root!.getAttribute('data-total-points')).toBe('8');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and roofing lines', () => {
    const { container } = render(<ChartLineRoofing data={ROOFING_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-roofing-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-roofing-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-roofing-roofing-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineRoofing data={ROOFING_DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-roofing-panel-label"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one roofing marker per bar', () => {
    const { container } = render(<ChartLineRoofing data={ROOFING_DATA} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-roofing-marker"]'),
    ).toHaveLength(8);
  });

  it('renders the zero line', () => {
    const { container } = render(<ChartLineRoofing data={ROOFING_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-roofing-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineRoofing data={ROOFING_DATA} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-roofing-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with both periods', () => {
    const { container } = render(<ChartLineRoofing data={ROOFING_DATA} />);
    const badge = container.querySelector(
      '[data-section="chart-line-roofing-badge-periods"]',
    );
    expect(badge!.textContent).toContain('48');
    expect(badge!.textContent).toContain('10');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineRoofing data={ROOFING_DATA} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-roofing-price-path"]'),
    ).toBeNull();
  });

  it('hides the roofing line and markers when showRoofing is false', () => {
    const { container } = render(
      <ChartLineRoofing data={ROOFING_DATA} showRoofing={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roofing-roofing-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-roofing-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the roofing line via the hidden set', () => {
    const { container } = render(
      <ChartLineRoofing data={ROOFING_DATA} hiddenSeries={['roofing']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roofing-roofing-line"]',
      ),
    ).toBeNull();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineRoofing data={ROOFING_DATA} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-roofing-zero-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineRoofing
        data={ROOFING_DATA}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-roofing-legend-item"][data-series-id="roofing"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'roofing', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineRoofing data={ROOFING_DATA} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-roofing-dot"]'),
    ).toHaveLength(8);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineRoofing data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-roofing"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-roofing-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineRoofing data={ROOFING_DATA} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-roofing-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRoofing ref={ref} data={ROOFING_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-roofing',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineRoofing.displayName).toBe('ChartLineRoofing');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineRoofing data={ROOFING_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-roofing"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
