import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineGator,
  computeLineGator,
  computeLineGatorSma,
  computeLineGatorLayout,
  getLineGatorFinitePoints,
  normalizeLineGatorPeriod,
  runLineGator,
  describeLineGatorChart,
  type ChartLineGatorPoint,
} from './chart-line-gator';

afterEach(() => cleanup());

// The Gator histograms are absolute gaps between simple moving
// averages -- no transcendentals, so the whole pipeline is exact.
// The fixture (jaw 4, teeth 3, lips 2) uses closes that are all
// multiples of 12, so every SMA is an integer and every histogram
// value divides cleanly.
const GATOR_DATA: ChartLineGatorPoint[] = [
  { x: 0, value: 12 },
  { x: 1, value: 24 },
  { x: 2, value: 36 },
  { x: 3, value: 48 },
  { x: 4, value: 36 },
  { x: 5, value: 24 },
  { x: 6, value: 12 },
  { x: 7, value: 24 },
  { x: 8, value: 36 },
  { x: 9, value: 48 },
  { x: 10, value: 36 },
  { x: 11, value: 24 },
];

const GATOR_CLOSES = GATOR_DATA.map((p) => p.value);
const EXPECTED_JAW = [null, null, null, 30, 36, 36, 30, 24, 24, 30, 36, 36];
const EXPECTED_TEETH = [null, null, 24, 36, 40, 36, 24, 20, 24, 36, 40, 36];
const EXPECTED_LIPS = [null, 18, 30, 42, 42, 30, 18, 18, 30, 42, 42, 30];
const EXPECTED_UPPER = [null, null, null, 6, 4, 0, 6, 4, 0, 6, 4, 0];
const EXPECTED_LOWER = [
  null,
  null,
  null,
  -6,
  -2,
  -6,
  -6,
  -2,
  -6,
  -6,
  -2,
  -6,
];

describe('getLineGatorFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineGatorFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineGatorFinitePoints(null)).toEqual([]);
    expect(getLineGatorFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineGatorPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineGatorPeriod(13.9, 13)).toBe(13);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineGatorPeriod(0, 13)).toBe(13);
    expect(normalizeLineGatorPeriod(NaN, 13)).toBe(13);
    expect(normalizeLineGatorPeriod(-5, 13)).toBe(13);
  });
});

describe('computeLineGatorSma', () => {
  it('computes the simple moving average', () => {
    expect(computeLineGatorSma(GATOR_CLOSES, 4)).toEqual(EXPECTED_JAW);
  });

  it('computes a shorter moving average', () => {
    expect(computeLineGatorSma(GATOR_CLOSES, 2)).toEqual(EXPECTED_LIPS);
  });

  it('is null through the warm-up window', () => {
    expect(computeLineGatorSma(GATOR_CLOSES, 4)[2]).toBeNull();
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineGatorSma(null, 4)).toEqual([]);
  });
});

describe('computeLineGator', () => {
  it('computes the jaw, teeth and lips moving averages', () => {
    const result = computeLineGator(GATOR_CLOSES, 4, 3, 2);
    expect(result.jaw).toEqual(EXPECTED_JAW);
    expect(result.teeth).toEqual(EXPECTED_TEETH);
    expect(result.lips).toEqual(EXPECTED_LIPS);
  });

  it('computes the upper histogram as the jaw-teeth gap', () => {
    expect(computeLineGator(GATOR_CLOSES, 4, 3, 2).upper).toEqual(
      EXPECTED_UPPER,
    );
  });

  it('computes the lower histogram as the negated teeth-lips gap', () => {
    expect(computeLineGator(GATOR_CLOSES, 4, 3, 2).lower).toEqual(
      EXPECTED_LOWER,
    );
  });

  it('keeps the upper histogram non-negative and the lower non-positive', () => {
    const result = computeLineGator(GATOR_CLOSES, 4, 3, 2);
    for (const u of result.upper) {
      if (u !== null) expect(u).toBeGreaterThanOrEqual(0);
    }
    for (const l of result.lower) {
      if (l !== null) expect(l).toBeLessThanOrEqual(0);
    }
  });

  it('is null through the warm-up window', () => {
    expect(computeLineGator(GATOR_CLOSES, 4, 3, 2).upper.slice(0, 3)).toEqual(
      [null, null, null],
    );
  });

  it('shares the jaw warm-up between both histograms', () => {
    expect(computeLineGator(GATOR_CLOSES, 4, 3, 2).lower[2]).toBeNull();
  });

  it('returns empty series for non-array input', () => {
    expect(computeLineGator(null, 4, 3, 2)).toEqual({
      jaw: [],
      teeth: [],
      lips: [],
      upper: [],
      lower: [],
    });
  });
});

describe('runLineGator', () => {
  const OPTS = { jawPeriod: 4, teethPeriod: 3, lipsPeriod: 2 };

  it('reports ok for a sufficient series', () => {
    expect(runLineGator(GATOR_DATA, OPTS).ok).toBe(true);
  });

  it('carries the jaw, teeth and lips periods onto the run', () => {
    const run = runLineGator(GATOR_DATA, OPTS);
    expect(run.jawPeriod).toBe(4);
    expect(run.teethPeriod).toBe(3);
    expect(run.lipsPeriod).toBe(2);
  });

  it('exposes the upper and lower histogram series', () => {
    const run = runLineGator(GATOR_DATA, OPTS);
    expect(run.upper).toHaveLength(12);
    expect(run.lower).toHaveLength(12);
  });

  it('computes the exact upper histogram', () => {
    expect(runLineGator(GATOR_DATA, OPTS).upper).toEqual(EXPECTED_UPPER);
  });

  it('computes the exact lower histogram', () => {
    expect(runLineGator(GATOR_DATA, OPTS).lower).toEqual(EXPECTED_LOWER);
  });

  it('leaves the histograms null until all three averages are full', () => {
    const run = runLineGator(GATOR_DATA, OPTS);
    expect(run.samples.slice(0, 3).every((s) => s.upper === null)).toBe(true);
    expect(typeof run.samples[3]!.upper).toBe('number');
  });

  it('classifies each sample by the change in gator spread', () => {
    const run = runLineGator(GATOR_DATA, OPTS);
    expect(run.samples.map((s) => s.phase)).toEqual([
      'steady',
      'steady',
      'steady',
      'steady',
      'sleeping',
      'steady',
      'feeding',
      'sleeping',
      'steady',
      'feeding',
      'sleeping',
      'steady',
    ]);
  });

  it('counts the feeding and sleeping bars consistently', () => {
    const run = runLineGator(GATOR_DATA, OPTS);
    expect(run.feedingCount).toBe(2);
    expect(run.sleepingCount).toBe(3);
    expect(run.feedingCount).toBe(
      run.samples.filter((s) => s.phase === 'feeding').length,
    );
    expect(run.sleepingCount).toBe(
      run.samples.filter((s) => s.phase === 'sleeping').length,
    );
  });

  it('reports the final histogram readings', () => {
    const run = runLineGator(GATOR_DATA, OPTS);
    expect(run.upperFinal).toBe(0);
    expect(run.lowerFinal).toBe(-6);
  });

  it('reports the upper max and the lower min', () => {
    const run = runLineGator(GATOR_DATA, OPTS);
    expect(run.upperMax).toBe(6);
    expect(run.lowerMin).toBe(-6);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineGator([{ x: 0, value: 5 }], OPTS);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineGator([], OPTS).ok).toBe(false);
    expect(runLineGator(null, OPTS).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...GATOR_DATA].reverse();
    const run = runLineGator(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(runLineGator(GATOR_DATA, OPTS).samples).toHaveLength(12);
  });

  it('defaults to a 13 / 8 / 5 alligator configuration', () => {
    const run = runLineGator(GATOR_DATA);
    expect(run.jawPeriod).toBe(13);
    expect(run.teethPeriod).toBe(8);
    expect(run.lipsPeriod).toBe(5);
  });
});

describe('computeLineGatorLayout', () => {
  const base = {
    data: GATOR_DATA,
    jawPeriod: 4,
    teethPeriod: 3,
    lipsPeriod: 2,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineGatorLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(12);
  });

  it('stacks the price panel above the gator panel', () => {
    const layout = computeLineGatorLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.gatorPanel.height).toBeGreaterThan(0);
    expect(layout.gatorPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds a non-empty price path and a positive bar width', () => {
    const layout = computeLineGatorLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.barWidth).toBeGreaterThan(0);
  });

  it('emits one price dot per bar and one gator bar per defined sample', () => {
    const layout = computeLineGatorLayout(base);
    expect(layout.priceDots).toHaveLength(12);
    expect(layout.gatorBars).toHaveLength(9);
  });

  it('places the zero line inside the gator panel', () => {
    const layout = computeLineGatorLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.gatorPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.gatorPanel.y + layout.gatorPanel.height,
    );
  });

  it('centres the gator panel y-domain on zero', () => {
    const layout = computeLineGatorLayout(base);
    expect(layout.gatorYMin).toBe(-layout.gatorYMax);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineGatorLayout(base);
    expect(layout.jawPeriod).toBe(4);
    expect(layout.upperFinal).toBe(0);
    expect(layout.totalPoints).toBe(12);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineGatorLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.gatorBars).toEqual([]);
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineGatorLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineGatorChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineGatorChart(GATOR_DATA, {
      jawPeriod: 4,
      teethPeriod: 3,
      lipsPeriod: 2,
    });
    expect(text).toContain('Gator Oscillator');
    expect(text).toContain('Alligator');
    expect(text).toContain('jaw');
    expect(text).toContain('histogram');
  });

  it('reports the feeding and sleeping counts', () => {
    const run = runLineGator(GATOR_DATA, {
      jawPeriod: 4,
      teethPeriod: 3,
      lipsPeriod: 2,
    });
    const text = describeLineGatorChart(GATOR_DATA, {
      jawPeriod: 4,
      teethPeriod: 3,
      lipsPeriod: 2,
    });
    expect(text).toContain(`feeding on ${run.feedingCount}`);
    expect(text).toContain(`sleeping on ${run.sleepingCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineGatorChart([])).toBe('No data');
    expect(describeLineGatorChart(null)).toBe('No data');
  });
});

describe('<ChartLineGator />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-gator-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Gator Oscillator');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    const root = container.querySelector('[data-section="chart-line-gator"]');
    expect(root!.getAttribute('data-jaw-period')).toBe('4');
    expect(root!.getAttribute('data-teeth-period')).toBe('3');
    expect(root!.getAttribute('data-lips-period')).toBe('2');
    expect(root!.getAttribute('data-feeding-count')).toBe('2');
    expect(root!.getAttribute('data-sleeping-count')).toBe('3');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price line', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gator-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-gator-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gator-panel-label"]'),
    ).toHaveLength(2);
  });

  it('renders one upper bar per defined sample', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gator-upper-bar"]'),
    ).toHaveLength(9);
  });

  it('renders one lower bar per defined sample', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gator-lower-bar"]'),
    ).toHaveLength(9);
  });

  it('marks each gator bar with a phase attribute', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-line-gator-upper-bar"]',
    );
    for (const b of bars) {
      expect(['feeding', 'sleeping', 'steady']).toContain(
        b.getAttribute('data-phase'),
      );
    }
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gator-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gator-legend-item"]'),
    ).toHaveLength(3);
  });

  it('renders the config badge with all three periods', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} jawPeriod={4} teethPeriod={3} lipsPeriod={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-gator-badge-config"]',
    );
    expect(badge!.textContent).toContain('4');
    expect(badge!.textContent).toContain('3');
    expect(badge!.textContent).toContain('2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineGator
        data={GATOR_DATA}
        jawPeriod={4}
        teethPeriod={3}
        lipsPeriod={2}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gator-price-path"]'),
    ).toBeNull();
  });

  it('hides the upper histogram when showUpper is false', () => {
    const { container } = render(
      <ChartLineGator
        data={GATOR_DATA}
        jawPeriod={4}
        teethPeriod={3}
        lipsPeriod={2}
        showUpper={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gator-upper-bar"]'),
    ).toHaveLength(0);
  });

  it('hides the lower histogram when showLower is false', () => {
    const { container } = render(
      <ChartLineGator
        data={GATOR_DATA}
        jawPeriod={4}
        teethPeriod={3}
        lipsPeriod={2}
        showLower={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gator-lower-bar"]'),
    ).toHaveLength(0);
  });

  it('hides the upper histogram via the hidden set', () => {
    const { container } = render(
      <ChartLineGator
        data={GATOR_DATA}
        jawPeriod={4}
        teethPeriod={3}
        lipsPeriod={2}
        hiddenSeries={['upper']}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gator-upper-bar"]'),
    ).toHaveLength(0);
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineGator
        data={GATOR_DATA}
        jawPeriod={4}
        teethPeriod={3}
        lipsPeriod={2}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gator-zero-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineGator
        data={GATOR_DATA}
        jawPeriod={4}
        teethPeriod={3}
        lipsPeriod={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-gator-legend-item"][data-series-id="upper"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'upper', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineGator
        data={GATOR_DATA}
        jawPeriod={4}
        teethPeriod={3}
        lipsPeriod={2}
        showDots
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gator-dot"]'),
    ).toHaveLength(12);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineGator data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-gator"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-gator-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineGator
        data={GATOR_DATA}
        jawPeriod={4}
        teethPeriod={3}
        lipsPeriod={2}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gator-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineGator ref={ref} data={GATOR_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-gator');
  });

  it('has a stable displayName', () => {
    expect(ChartLineGator.displayName).toBe('ChartLineGator');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineGator data={GATOR_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-gator"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
