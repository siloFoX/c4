import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineGauss,
  DEFAULT_CHART_LINE_GAUSS_PERIOD,
  DEFAULT_CHART_LINE_GAUSS_POLES,
  classifyLineGaussSlope,
  computeLineGauss,
  computeLineGaussAlpha,
  computeLineGaussLayout,
  describeLineGaussChart,
  getLineGaussFinitePoints,
  normalizeLineGaussPeriod,
  normalizeLineGaussPoles,
  runLineGauss,
  type ChartLineGaussPoint,
} from './chart-line-gauss';

const toPoints = (values: number[]): ChartLineGaussPoint[] =>
  values.map((v, i) => ({ x: i, value: v }));

const CONST_FLAT: ChartLineGaussPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);
const RISING: ChartLineGaussPoint[] = toPoints([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);
const FALLING: ChartLineGaussPoint[] = toPoints([
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
]);
const WAVE: ChartLineGaussPoint[] = Array.from({ length: 24 }, (_, i) => ({
  x: i,
  value: 50 + 10 * Math.sin(i * 0.4),
}));

const OPTS = { period: 4, poles: 2 } as const;

describe('getLineGaussFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineGaussFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineGaussFinitePoints('nope' as unknown as ChartLineGaussPoint[]),
    ).toEqual([]);
  });

  it('drops non-finite x or value', () => {
    const points: ChartLineGaussPoint[] = [
      { x: 0, value: 1 },
      { x: Number.NaN, value: 2 },
      { x: 1, value: Number.POSITIVE_INFINITY },
      { x: 2, value: 3 },
    ];
    const finite = getLineGaussFinitePoints(points);
    expect(finite).toEqual([
      { x: 0, value: 1 },
      { x: 2, value: 3 },
    ]);
  });

  it('preserves input order', () => {
    const finite = getLineGaussFinitePoints(RISING.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });
});

describe('normalizeLineGaussPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineGaussPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineGaussPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for a sub-2 period', () => {
    expect(normalizeLineGaussPeriod(1, 14)).toBe(14);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineGaussPeriod(Number.NaN, 14)).toBe(14);
  });

  it('falls back for a string period', () => {
    expect(normalizeLineGaussPeriod('14' as unknown as number, 14)).toBe(14);
  });
});

describe('normalizeLineGaussPoles', () => {
  it('keeps a valid pole count', () => {
    expect(normalizeLineGaussPoles(3, 4)).toBe(3);
  });

  it('clamps above eight', () => {
    expect(normalizeLineGaussPoles(20, 4)).toBe(8);
  });

  it('floors a fractional pole count', () => {
    expect(normalizeLineGaussPoles(2.9, 4)).toBe(2);
  });

  it('falls back for zero or negative', () => {
    expect(normalizeLineGaussPoles(0, 4)).toBe(4);
    expect(normalizeLineGaussPoles(-1, 4)).toBe(4);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineGaussPoles(Number.NaN, 4)).toBe(4);
  });
});

describe('computeLineGaussAlpha', () => {
  it('returns a finite value for valid inputs', () => {
    expect(Number.isFinite(computeLineGaussAlpha(14, 4))).toBe(true);
  });

  it('returns alpha strictly inside (0, 1) for valid inputs', () => {
    const alpha = computeLineGaussAlpha(14, 4);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it('falls back for non-finite inputs', () => {
    const alpha = computeLineGaussAlpha(Number.NaN, Number.NaN);
    expect(Number.isFinite(alpha)).toBe(true);
    expect(alpha).toBeGreaterThan(0);
  });

  it('shorter period yields larger alpha than longer period (same poles)', () => {
    expect(computeLineGaussAlpha(4, 4)).toBeGreaterThan(
      computeLineGaussAlpha(20, 4),
    );
  });

  it('more poles yields larger alpha than fewer poles (same period)', () => {
    expect(computeLineGaussAlpha(14, 8)).toBeGreaterThan(
      computeLineGaussAlpha(14, 1),
    );
  });
});

describe('computeLineGauss', () => {
  it('returns an empty array for non-array input', () => {
    expect(
      computeLineGauss(null as unknown as number[], 4, 2),
    ).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineGauss([], 4, 2)).toEqual([]);
  });

  it('produces an output the same length as the input', () => {
    const out = computeLineGauss(
      RISING.map((p) => p.value),
      4,
      2,
    );
    expect(out).toHaveLength(RISING.length);
  });

  it('holds a constant series at its constant level for any period and any poles', () => {
    for (const period of [2, 4, 10, 20]) {
      for (const poles of [1, 2, 4, 8]) {
        const out = computeLineGauss(
          CONST_FLAT.map((p) => p.value),
          period,
          poles,
        );
        expect(out).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
      }
    }
  });

  it('seeds the first output at the first input', () => {
    const out = computeLineGauss(
      RISING.map((p) => p.value),
      4,
      2,
    );
    expect(out[0]).toBe(1);
  });

  it('returns the input value for a single-bar input', () => {
    const out = computeLineGauss([7], 4, 2);
    expect(out).toEqual([7]);
  });

  it('rises strictly across a strictly rising series', () => {
    const out = computeLineGauss(
      RISING.map((p) => p.value),
      4,
      2,
    );
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!).toBeGreaterThan(out[i - 1]!);
    }
  });

  it('falls strictly across a strictly falling series', () => {
    const out = computeLineGauss(
      FALLING.map((p) => p.value),
      4,
      2,
    );
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!).toBeLessThan(out[i - 1]!);
    }
  });

  it('every defined value is finite for finite input', () => {
    const out = computeLineGauss(
      WAVE.map((p) => p.value),
      4,
      2,
    );
    for (const value of out) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('matches the analytic two-bar form for poles=2', () => {
    const alpha = computeLineGaussAlpha(4, 2);
    const out = computeLineGauss([5, 10], 4, 2);
    expect(out[0]).toBe(5);
    expect(out[1]).toBeCloseTo(5 + 5 * alpha * alpha, 10);
  });
});

describe('classifyLineGaussSlope', () => {
  it('marks a rising step as up', () => {
    expect(classifyLineGaussSlope(1.5, 1)).toBe('up');
  });

  it('marks a falling step as down', () => {
    expect(classifyLineGaussSlope(0.5, 1)).toBe('down');
  });

  it('marks an equal pair as flat', () => {
    expect(classifyLineGaussSlope(1, 1)).toBe('flat');
  });

  it('marks a null previous as none', () => {
    expect(classifyLineGaussSlope(1, null)).toBe('none');
  });

  it('marks a null current as none', () => {
    expect(classifyLineGaussSlope(null, 1)).toBe('none');
  });
});

describe('runLineGauss', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      runLineGauss([{ x: 0, value: 1 }], OPTS).ok,
    ).toBe(false);
  });

  it('marks empty input as not ok', () => {
    expect(runLineGauss([]).ok).toBe(false);
    expect(runLineGauss(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineGauss(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period and pole count', () => {
    const run = runLineGauss(RISING);
    expect(run.period).toBe(DEFAULT_CHART_LINE_GAUSS_PERIOD);
    expect(run.poles).toBe(DEFAULT_CHART_LINE_GAUSS_POLES);
  });

  it('honours custom options', () => {
    const run = runLineGauss(RISING, { period: 8, poles: 3 });
    expect(run.period).toBe(8);
    expect(run.poles).toBe(3);
  });

  it('exposes the computed alpha', () => {
    const run = runLineGauss(RISING, OPTS);
    expect(run.alpha).toBe(computeLineGaussAlpha(4, 2));
  });

  it('holds the filter at the constant level for a flat series', () => {
    const run = runLineGauss(CONST_FLAT, OPTS);
    for (const v of run.gauss) expect(v).toBe(5);
  });

  it('classifies a flat series as flat after the first bar', () => {
    const run = runLineGauss(CONST_FLAT, OPTS);
    expect(run.flatCount).toBe(CONST_FLAT.length - 1);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('rises through a rising series', () => {
    const run = runLineGauss(RISING, OPTS);
    expect(run.upCount).toBe(RISING.length - 1);
    expect(run.downCount).toBe(0);
  });

  it('falls through a falling series', () => {
    const run = runLineGauss(FALLING, OPTS);
    expect(run.downCount).toBe(FALLING.length - 1);
    expect(run.upCount).toBe(0);
  });

  it('self-consistent slope counts equal sample length', () => {
    const run = runLineGauss(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.slope === 'none') none += 1;
    }
    expect(run.upCount + run.downCount + run.flatCount + none).toBe(
      run.samples.length,
    );
  });

  it('produces one sample per finite point', () => {
    const run = runLineGauss(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineGauss(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final filter value', () => {
    const run = runLineGauss(CONST_FLAT, OPTS);
    expect(run.gaussFinal).toBe(5);
  });
});

describe('computeLineGaussLayout', () => {
  it('marks a single-point input as not ok', () => {
    const layout = computeLineGaussLayout({
      data: [{ x: 0, value: 1 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    const layout = computeLineGaussLayout({
      data: WAVE,
      width: 60,
      height: 60,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    const layout = computeLineGaussLayout({ data: WAVE, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineGaussLayout({ data: RISING, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineGaussLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one filter segment between each pair of bars', () => {
    const layout = computeLineGaussLayout({ data: RISING, ...OPTS });
    expect(layout.segments).toHaveLength(RISING.length - 1);
  });

  it('emits one marker per bar', () => {
    const layout = computeLineGaussLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineGaussLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('spans the value domain across the price and the filter', () => {
    const layout = computeLineGaussLayout({ data: RISING, ...OPTS });
    expect(layout.valueMin).toBeLessThanOrEqual(1);
    expect(layout.valueMax).toBeGreaterThanOrEqual(10);
  });

  it('carries the run', () => {
    const layout = computeLineGaussLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.poles).toBe(2);
    expect(layout.run.samples).toHaveLength(RISING.length);
  });
});

describe('describeLineGaussChart', () => {
  it('names the indicator', () => {
    expect(describeLineGaussChart(RISING, OPTS)).toContain(
      'Gaussian Filter',
    );
  });

  it('mentions the N-pole cascade', () => {
    expect(describeLineGaussChart(RISING, OPTS)).toContain('N-pole');
  });

  it('mentions the lookback period', () => {
    expect(describeLineGaussChart(RISING, { period: 9, poles: 3 })).toContain(
      'period 9',
    );
  });

  it('mentions the pole count', () => {
    expect(describeLineGaussChart(RISING, { period: 9, poles: 3 })).toContain(
      'poles 3',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineGaussChart([])).toBe('No data');
    expect(describeLineGaussChart(null)).toBe('No data');
  });
});

describe('<ChartLineGauss />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineGauss data={RISING} period={4} poles={2} />);
    expect(
      screen.getByRole('region', { name: /Ehlers Gaussian Filter chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-gauss-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Gaussian Filter');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineGauss data={[]} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-gauss-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the period, pole count and total-points on the root', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-gauss"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-poles')).toBe('2');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gauss-price-path"]'),
    ).toBeInTheDocument();
  });

  it('renders one filter segment between each pair of bars', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-gauss-segment"]',
    );
    expect(segments).toHaveLength(RISING.length - 1);
  });

  it('renders one marker per bar', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-gauss-marker"]',
    );
    expect(markers).toHaveLength(RISING.length);
  });

  it('marks every marker with a valid slope', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-gauss-marker"]',
    );
    for (const m of markers) {
      const slope = m.getAttribute('data-slope');
      expect(['up', 'down', 'flat', 'none']).toContain(slope);
    }
  });

  it('renders the config badge with the period and the pole count', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-gauss-badge-config"]',
    );
    expect(badge?.textContent).toContain('GAUSS 4/2');
  });

  it('hides the filter via the legend toggle', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} />,
    );
    const gaussBtn = container.querySelector(
      '[data-section="chart-line-gauss-legend-item"][data-series-id="gauss"]',
    );
    expect(gaussBtn).toBeInTheDocument();
    fireEvent.click(gaussBtn as Element);
    expect(
      container.querySelector('[data-section="chart-line-gauss-segments"]'),
    ).toBeNull();
  });

  it('hides the filter via showGauss=false', () => {
    const { container } = render(
      <ChartLineGauss data={RISING} period={4} poles={2} showGauss={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gauss-segments"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineGauss
        data={RISING}
        period={4}
        poles={2}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-gauss-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineGauss ref={ref} data={RISING} period={4} poles={2} />);
    expect(ref.current).not.toBeNull();
  });
});
