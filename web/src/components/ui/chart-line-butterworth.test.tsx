import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineButterworth,
  DEFAULT_CHART_LINE_BUTTERWORTH_PERIOD,
  DEFAULT_CHART_LINE_BUTTERWORTH_POLES,
  classifyLineButterworthSlope,
  computeLineButterworth,
  computeLineButterworthCoefficients,
  computeLineButterworthLayout,
  describeLineButterworthChart,
  getLineButterworthFinitePoints,
  normalizeLineButterworthPeriod,
  normalizeLineButterworthPoles,
  runLineButterworth,
  type ChartLineButterworthPoint,
} from './chart-line-butterworth';

const toPoints = (values: number[]): ChartLineButterworthPoint[] =>
  values.map((v, i) => ({ x: i, value: v }));

const CONST_FLAT: ChartLineButterworthPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);
const CONST_ZERO: ChartLineButterworthPoint[] = toPoints([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const RISING: ChartLineButterworthPoint[] = toPoints([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
]);
const FALLING: ChartLineButterworthPoint[] = toPoints([
  20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
]);
const WAVE: ChartLineButterworthPoint[] = Array.from({ length: 24 }, (_, i) => ({
  x: i,
  value: 50 + 10 * Math.sin(i * 0.4),
}));

const OPTS = { period: 4, poles: 2 } as const;

describe('getLineButterworthFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineButterworthFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineButterworthFinitePoints(
        'nope' as unknown as ChartLineButterworthPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x or value', () => {
    const points: ChartLineButterworthPoint[] = [
      { x: 0, value: 1 },
      { x: Number.NaN, value: 2 },
      { x: 1, value: Number.POSITIVE_INFINITY },
      { x: 2, value: 3 },
    ];
    expect(getLineButterworthFinitePoints(points)).toEqual([
      { x: 0, value: 1 },
      { x: 2, value: 3 },
    ]);
  });

  it('preserves input order', () => {
    const finite = getLineButterworthFinitePoints(RISING.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual([...RISING].reverse().map((p) => p.x));
  });
});

describe('normalizeLineButterworthPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineButterworthPeriod(15, 15)).toBe(15);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineButterworthPeriod(15.9, 15)).toBe(15);
  });

  it('falls back for a sub-2 period', () => {
    expect(normalizeLineButterworthPeriod(1, 15)).toBe(15);
  });

  it('falls back for non-finite period', () => {
    expect(normalizeLineButterworthPeriod(Number.NaN, 15)).toBe(15);
  });

  it('falls back for a string period', () => {
    expect(normalizeLineButterworthPeriod('15' as unknown as number, 15)).toBe(
      15,
    );
  });
});

describe('normalizeLineButterworthPoles', () => {
  it('keeps the value 2', () => {
    expect(normalizeLineButterworthPoles(2, 2)).toBe(2);
  });

  it('keeps the value 3', () => {
    expect(normalizeLineButterworthPoles(3, 2)).toBe(3);
  });

  it('floors a fractional 2 or 3', () => {
    expect(normalizeLineButterworthPoles(2.9, 2)).toBe(2);
    expect(normalizeLineButterworthPoles(3.4, 2)).toBe(3);
  });

  it('falls back for an out-of-range pole order', () => {
    expect(normalizeLineButterworthPoles(1, 2)).toBe(2);
    expect(normalizeLineButterworthPoles(4, 2)).toBe(2);
  });

  it('falls back for non-finite poles', () => {
    expect(normalizeLineButterworthPoles(Number.NaN, 2)).toBe(2);
  });
});

describe('computeLineButterworthCoefficients', () => {
  it('returns four coefficients for the 2-pole order', () => {
    const c = computeLineButterworthCoefficients(15, 2);
    expect(c.poles).toBe(2);
    expect(c.c4).toBe(0);
  });

  it('returns four coefficients for the 3-pole order', () => {
    const c = computeLineButterworthCoefficients(15, 3);
    expect(c.poles).toBe(3);
    expect(c.c4).not.toBe(0);
  });

  it('the 2-pole DC gain is exactly one (4*c1 + c2 + c3 ~= 1)', () => {
    const c = computeLineButterworthCoefficients(15, 2);
    expect(4 * c.c1 + c.c2 + c.c3).toBeCloseTo(1, 10);
  });

  it('the 3-pole DC gain is exactly one (8*c1 + c2 + c3 + c4 ~= 1)', () => {
    const c = computeLineButterworthCoefficients(15, 3);
    expect(8 * c.c1 + c.c2 + c.c3 + c.c4).toBeCloseTo(1, 10);
  });

  it('falls back to defaults for non-finite inputs', () => {
    const c = computeLineButterworthCoefficients(Number.NaN, Number.NaN);
    expect(c.poles).toBe(DEFAULT_CHART_LINE_BUTTERWORTH_POLES);
    expect(Number.isFinite(c.c1)).toBe(true);
    expect(Number.isFinite(c.c2)).toBe(true);
    expect(Number.isFinite(c.c3)).toBe(true);
  });

  it('different period yields different coefficients', () => {
    const a = computeLineButterworthCoefficients(4, 2);
    const b = computeLineButterworthCoefficients(20, 2);
    expect(a.c1).not.toBe(b.c1);
    expect(a.c2).not.toBe(b.c2);
  });
});

describe('computeLineButterworth', () => {
  it('returns an empty array for non-array input', () => {
    expect(
      computeLineButterworth(null as unknown as number[], 4, 2),
    ).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineButterworth([], 4, 2)).toEqual([]);
  });

  it('output matches input length', () => {
    const out = computeLineButterworth(
      RISING.map((p) => p.value),
      4,
      2,
    );
    expect(out).toHaveLength(RISING.length);
  });

  it('holds a zero series exactly at zero (2-pole, any period, by IEEE 754 zero-multiply)', () => {
    for (const period of [3, 4, 10, 20]) {
      const out = computeLineButterworth(
        CONST_ZERO.map((p) => p.value),
        period,
        2,
      );
      expect(out).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
  });

  it('holds a zero series exactly at zero (3-pole, any period)', () => {
    for (const period of [3, 4, 10, 20]) {
      const out = computeLineButterworth(
        CONST_ZERO.map((p) => p.value),
        period,
        3,
      );
      expect(out).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
  });

  it('holds a constant series within ULP of its constant level (2-pole)', () => {
    for (const period of [3, 4, 10, 20]) {
      const out = computeLineButterworth(
        CONST_FLAT.map((p) => p.value),
        period,
        2,
      );
      for (const v of out) expect(v).toBeCloseTo(5, 10);
    }
  });

  it('holds a constant series within ULP of its constant level (3-pole)', () => {
    for (const period of [3, 4, 10, 20]) {
      const out = computeLineButterworth(
        CONST_FLAT.map((p) => p.value),
        period,
        3,
      );
      for (const v of out) expect(v).toBeCloseTo(5, 10);
    }
  });

  it('seeds the first two outputs at the first two inputs for 2-pole', () => {
    const out = computeLineButterworth(
      RISING.map((p) => p.value),
      4,
      2,
    );
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(2);
  });

  it('seeds the first three outputs at the first three inputs for 3-pole', () => {
    const out = computeLineButterworth(
      RISING.map((p) => p.value),
      4,
      3,
    );
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(2);
    expect(out[2]).toBe(3);
  });

  it('returns a single-value input unchanged', () => {
    expect(computeLineButterworth([7], 4, 2)).toEqual([7]);
  });

  it('strictly rises after the warm-up on a rising series (2-pole)', () => {
    const out = computeLineButterworth(
      RISING.map((p) => p.value),
      4,
      2,
    );
    for (let i = 2; i < out.length; i += 1) {
      expect(out[i]!).toBeGreaterThan(out[i - 1]!);
    }
  });

  it('the filter trends with the input over many bars (3-pole rising)', () => {
    const out = computeLineButterworth(
      RISING.map((p) => p.value),
      4,
      3,
    );
    expect(out[out.length - 1]!).toBeGreaterThan(out[0]!);
  });

  it('the filter trends with the input over many bars (2-pole falling)', () => {
    const out = computeLineButterworth(
      FALLING.map((p) => p.value),
      4,
      2,
    );
    expect(out[out.length - 1]!).toBeLessThan(out[0]!);
  });

  it('produces finite output for finite input', () => {
    const out = computeLineButterworth(
      WAVE.map((p) => p.value),
      4,
      2,
    );
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('classifyLineButterworthSlope', () => {
  it('marks a rising step as up', () => {
    expect(classifyLineButterworthSlope(2, 1)).toBe('up');
  });

  it('marks a falling step as down', () => {
    expect(classifyLineButterworthSlope(0.5, 1)).toBe('down');
  });

  it('marks an equal pair as flat', () => {
    expect(classifyLineButterworthSlope(1, 1)).toBe('flat');
  });

  it('marks a null previous as none', () => {
    expect(classifyLineButterworthSlope(1, null)).toBe('none');
  });

  it('marks a null current as none', () => {
    expect(classifyLineButterworthSlope(null, 1)).toBe('none');
  });
});

describe('runLineButterworth', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineButterworth([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineButterworth([]).ok).toBe(false);
    expect(runLineButterworth(null).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineButterworth(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period and pole order', () => {
    const run = runLineButterworth(RISING);
    expect(run.period).toBe(DEFAULT_CHART_LINE_BUTTERWORTH_PERIOD);
    expect(run.poles).toBe(DEFAULT_CHART_LINE_BUTTERWORTH_POLES);
  });

  it('honours custom options', () => {
    const run = runLineButterworth(RISING, { period: 8, poles: 3 });
    expect(run.period).toBe(8);
    expect(run.poles).toBe(3);
  });

  it('exposes the coefficients', () => {
    const run = runLineButterworth(RISING, OPTS);
    expect(Number.isFinite(run.coefficients.c1)).toBe(true);
    expect(run.coefficients.poles).toBe(2);
  });

  it('holds the filter at the constant level for a zero series (bit-exact)', () => {
    const run = runLineButterworth(CONST_ZERO, OPTS);
    for (const v of run.filter) expect(v).toBe(0);
  });

  it('holds the filter within ULP of the constant for a non-zero flat series', () => {
    const run = runLineButterworth(CONST_FLAT, OPTS);
    for (const v of run.filter) expect(v).toBeCloseTo(5, 10);
  });

  it('classifies a zero series as flat after the first bar (bit-exact)', () => {
    const run = runLineButterworth(CONST_ZERO, OPTS);
    expect(run.flatCount).toBe(CONST_ZERO.length - 1);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('rises across a rising series (2-pole)', () => {
    const run = runLineButterworth(RISING, OPTS);
    expect(run.upCount).toBe(RISING.length - 1);
    expect(run.downCount).toBe(0);
  });

  it('self-consistent slope counts equal sample length', () => {
    const run = runLineButterworth(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.slope === 'none') none += 1;
    }
    expect(run.upCount + run.downCount + run.flatCount + none).toBe(
      run.samples.length,
    );
  });

  it('produces one sample per finite point', () => {
    const run = runLineButterworth(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineButterworth(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final filter value', () => {
    const run = runLineButterworth(CONST_ZERO, OPTS);
    expect(run.filterFinal).toBe(0);
  });
});

describe('computeLineButterworthLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLineButterworthLayout({
        data: [{ x: 0, value: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLineButterworthLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineButterworthLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineButterworthLayout({ data: RISING, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineButterworthLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one filter segment between each pair of bars', () => {
    const layout = computeLineButterworthLayout({ data: RISING, ...OPTS });
    expect(layout.segments).toHaveLength(RISING.length - 1);
  });

  it('emits one marker per bar', () => {
    const layout = computeLineButterworthLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineButterworthLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('the value domain covers the input range', () => {
    const layout = computeLineButterworthLayout({ data: RISING, ...OPTS });
    expect(layout.valueMin).toBeLessThanOrEqual(1);
    expect(layout.valueMax).toBeGreaterThanOrEqual(20);
  });

  it('carries the run', () => {
    const layout = computeLineButterworthLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.poles).toBe(2);
    expect(layout.run.samples).toHaveLength(RISING.length);
  });
});

describe('describeLineButterworthChart', () => {
  it('names the indicator', () => {
    expect(describeLineButterworthChart(RISING, OPTS)).toContain(
      'Butterworth Filter',
    );
  });

  it('mentions the pole order', () => {
    expect(describeLineButterworthChart(RISING, { period: 4, poles: 3 })).toContain(
      '3-pole',
    );
  });

  it('mentions the lookback period', () => {
    expect(
      describeLineButterworthChart(RISING, { period: 9, poles: 2 }),
    ).toContain('period 9');
  });

  it('mentions DC gain unity (constant passthrough)', () => {
    expect(describeLineButterworthChart(RISING, OPTS)).toContain(
      'passes through unchanged',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineButterworthChart([])).toBe('No data');
    expect(describeLineButterworthChart(null)).toBe('No data');
  });
});

describe('<ChartLineButterworth />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineButterworth data={RISING} period={4} poles={2} />);
    expect(
      screen.getByRole('region', { name: /Ehlers Butterworth Filter chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineButterworth data={RISING} period={4} poles={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-butterworth-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Butterworth Filter');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineButterworth data={[]} period={4} poles={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-butterworth-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors period, poles and total-points on the root', () => {
    const { container } = render(
      <ChartLineButterworth data={RISING} period={4} poles={2} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-butterworth"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-poles')).toBe('2');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineButterworth data={RISING} period={4} poles={2} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(
      <ChartLineButterworth data={RISING} period={4} poles={2} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-butterworth-price-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one filter segment between each pair of bars', () => {
    const { container } = render(
      <ChartLineButterworth data={RISING} period={4} poles={2} />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-butterworth-segment"]',
    );
    expect(segments).toHaveLength(RISING.length - 1);
  });

  it('renders one marker per bar', () => {
    const { container } = render(
      <ChartLineButterworth data={RISING} period={4} poles={2} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-butterworth-marker"]',
    );
    expect(markers).toHaveLength(RISING.length);
  });

  it('marks every marker with a valid slope', () => {
    const { container } = render(
      <ChartLineButterworth data={RISING} period={4} poles={2} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-butterworth-marker"]',
    );
    for (const m of markers) {
      const slope = m.getAttribute('data-slope');
      expect(['up', 'down', 'flat', 'none']).toContain(slope);
    }
  });

  it('renders the config badge with the period and pole order', () => {
    const { container } = render(
      <ChartLineButterworth data={RISING} period={4} poles={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-butterworth-badge-config"]',
    );
    expect(badge?.textContent).toContain('BWORTH 4/2P');
  });

  it('hides the filter via the legend toggle', () => {
    const { container } = render(
      <ChartLineButterworth data={RISING} period={4} poles={2} />,
    );
    const filterBtn = container.querySelector(
      '[data-section="chart-line-butterworth-legend-item"][data-series-id="filter"]',
    );
    expect(filterBtn).toBeInTheDocument();
    fireEvent.click(filterBtn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-butterworth-segments"]',
      ),
    ).toBeNull();
  });

  it('hides the filter via showFilter=false', () => {
    const { container } = render(
      <ChartLineButterworth
        data={RISING}
        period={4}
        poles={2}
        showFilter={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-butterworth-segments"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineButterworth
        data={RISING}
        period={4}
        poles={2}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-butterworth-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineButterworth ref={ref} data={RISING} period={4} poles={2} />,
    );
    expect(ref.current).not.toBeNull();
  });
});
