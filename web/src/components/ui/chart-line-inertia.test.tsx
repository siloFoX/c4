import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineInertia,
  getLineInertiaFinitePoints,
  normalizeLineInertiaPeriod,
  computeLineInertiaRvgi,
  computeLineInertiaLinReg,
  computeLineInertia,
  runLineInertia,
  computeLineInertiaLayout,
  describeLineInertiaChart,
  DEFAULT_CHART_LINE_INERTIA_VIGOR_PERIOD,
  DEFAULT_CHART_LINE_INERTIA_REG_PERIOD,
  type ChartLineInertiaPoint,
} from './chart-line-inertia';

afterEach(() => cleanup());

// OHLC bars all with a high-to-low range of 8 and a close-minus-
// open spread of -8, 0 or +8, so each four-bar Relative Vigor
// Index -- sum of spreads over sum of ranges (= /32) -- lands on
// an exact eighth. The spreads run the vigor up then down so the
// regression-smoothed Inertia crosses zero.
const INERTIA_BARS: ChartLineInertiaPoint[] = [
  { x: 0, open: 10, high: 18, low: 10, close: 18 },
  { x: 1, open: 14, high: 18, low: 10, close: 14 },
  { x: 2, open: 10, high: 18, low: 10, close: 18 },
  { x: 3, open: 10, high: 18, low: 10, close: 18 },
  { x: 4, open: 14, high: 18, low: 10, close: 14 },
  { x: 5, open: 10, high: 18, low: 10, close: 18 },
  { x: 6, open: 18, high: 18, low: 10, close: 10 },
  { x: 7, open: 14, high: 18, low: 10, close: 14 },
  { x: 8, open: 18, high: 18, low: 10, close: 10 },
  { x: 9, open: 18, high: 18, low: 10, close: 10 },
  { x: 10, open: 14, high: 18, low: 10, close: 14 },
  { x: 11, open: 18, high: 18, low: 10, close: 10 },
];
const OPTS = { vigorPeriod: 4, regPeriod: 3 };

const RVGI_EXPECTED = [
  null, null, null, 0.75, 0.5, 0.75, 0.25, 0, -0.25, -0.75, -0.5, -0.75,
];

// Identical bars: every Relative Vigor Index settles at 0.5 and
// the regression of a constant is that constant, so the Inertia
// is an exact 0.5.
const CONST_BARS: ChartLineInertiaPoint[] = Array.from(
  { length: 8 },
  (_, x) => ({ x, open: 10, high: 18, low: 10, close: 14 }),
);

describe('getLineInertiaFinitePoints', () => {
  it('keeps only bars with a finite x, open, high, low and close', () => {
    const points = [
      { x: 0, open: 1, high: 3, low: 0, close: 2 },
      { x: 1, open: Number.NaN, high: 3, low: 0, close: 2 },
      { x: 2, open: 1, high: 3, low: 0, close: Number.POSITIVE_INFINITY },
      { x: 3, open: 4, high: 6, low: 3, close: 5 },
    ] as ChartLineInertiaPoint[];
    expect(getLineInertiaFinitePoints(points)).toEqual([
      { x: 0, open: 1, high: 3, low: 0, close: 2 },
      { x: 3, open: 4, high: 6, low: 3, close: 5 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineInertiaFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineInertiaFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, open: 1, high: 2, low: 0, close: 1 },
      { x: 2, open: 3, high: 4, low: 2, close: 3 },
    ] as ChartLineInertiaPoint[];
    expect(getLineInertiaFinitePoints(points)).toEqual(points);
  });
});

describe('normalizeLineInertiaPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineInertiaPeriod(10, 99)).toBe(10);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineInertiaPeriod(4.8, 99)).toBe(4);
  });
  it('rejects a period below 2', () => {
    expect(normalizeLineInertiaPeriod(1, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLineInertiaPeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 2', () => {
    expect(normalizeLineInertiaPeriod(2, 99)).toBe(2);
  });
});

describe('computeLineInertiaRvgi', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineInertiaRvgi(null, 4)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(computeLineInertiaRvgi(INERTIA_BARS, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });
  it('is the summed spread over the summed range', () => {
    expect(computeLineInertiaRvgi(INERTIA_BARS, 4)).toEqual(RVGI_EXPECTED);
  });
  it('is null when the total range collapses to zero', () => {
    const flat = Array.from({ length: 4 }, (_, x) => ({
      x,
      open: 5,
      high: 5,
      low: 5,
      close: 5,
    }));
    expect(computeLineInertiaRvgi(flat, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
  it('matches the input length', () => {
    expect(computeLineInertiaRvgi(INERTIA_BARS, 4)).toHaveLength(
      INERTIA_BARS.length,
    );
  });
});

describe('computeLineInertiaLinReg', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineInertiaLinReg(null, 3)).toEqual([]);
  });
  it('holds a constant input at the constant', () => {
    expect(computeLineInertiaLinReg([5, 5, 5, 5], 3)).toEqual([
      null,
      null,
      5,
      5,
    ]);
  });
  it('reproduces a linear input at its endpoint', () => {
    expect(computeLineInertiaLinReg([0, 2, 4, 6, 8], 3)).toEqual([
      null,
      null,
      4,
      6,
      8,
    ]);
  });
  it('fits the least-squares endpoint of a non-linear window', () => {
    expect(computeLineInertiaLinReg([0, 0, 3], 3)).toEqual([
      null,
      null,
      2.5,
    ]);
  });
  it('is null while the window holds a null', () => {
    expect(computeLineInertiaLinReg([null, null, 1, 2, 3], 3)).toEqual([
      null,
      null,
      null,
      null,
      3,
    ]);
  });
  it('matches the input length', () => {
    expect(computeLineInertiaLinReg([1, 2, 3, 4], 3)).toHaveLength(4);
  });
});

describe('computeLineInertia', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineInertia(null, 4, 3)).toEqual([]);
  });
  it('is the regression smoothing of the Relative Vigor Index', () => {
    expect(computeLineInertia(INERTIA_BARS, 4, 3)).toEqual(
      computeLineInertiaLinReg(
        computeLineInertiaRvgi(INERTIA_BARS, 4),
        3,
      ),
    );
  });
  it('holds an exact constant for identical bars', () => {
    expect(computeLineInertia(CONST_BARS, 4, 3)).toEqual([
      null,
      null,
      null,
      null,
      null,
      0.5,
      0.5,
      0.5,
    ]);
  });
  it('matches the input length', () => {
    expect(computeLineInertia(INERTIA_BARS, 4, 3)).toHaveLength(
      INERTIA_BARS.length,
    );
  });
});

describe('runLineInertia', () => {
  it('is not ok with fewer than two bars', () => {
    expect(
      runLineInertia([{ x: 0, open: 1, high: 2, low: 0, close: 1 }], OPTS).ok,
    ).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineInertia(INERTIA_BARS, OPTS).ok).toBe(true);
  });
  it('carries the resolved vigor and regression periods', () => {
    const run = runLineInertia(INERTIA_BARS, OPTS);
    expect(run.vigorPeriod).toBe(4);
    expect(run.regPeriod).toBe(3);
  });
  it('falls back to the default periods', () => {
    const run = runLineInertia(INERTIA_BARS);
    expect(run.vigorPeriod).toBe(DEFAULT_CHART_LINE_INERTIA_VIGOR_PERIOD);
    expect(run.regPeriod).toBe(DEFAULT_CHART_LINE_INERTIA_REG_PERIOD);
  });
  it('exposes the exact Relative Vigor Index series', () => {
    expect(runLineInertia(INERTIA_BARS, OPTS).rvgi).toEqual(RVGI_EXPECTED);
  });
  it('keeps the Inertia equal to the regression of the index', () => {
    const run = runLineInertia(INERTIA_BARS, OPTS);
    expect(run.inertia).toEqual(computeLineInertiaLinReg(run.rvgi, 3));
  });
  it('classifies each bar by the sign of the Inertia', () => {
    const run = runLineInertia(INERTIA_BARS, OPTS);
    for (const s of run.samples) {
      if (s.inertia === null) expect(s.zone).toBe('none');
      else if (s.inertia > 0) expect(s.zone).toBe('bull');
      else if (s.inertia < 0) expect(s.zone).toBe('bear');
      else expect(s.zone).toBe('neutral');
    }
  });
  it('crosses zero so both bull and bear appear', () => {
    const run = runLineInertia(INERTIA_BARS, OPTS);
    expect(run.bullCount).toBeGreaterThan(0);
    expect(run.bearCount).toBeGreaterThan(0);
  });
  it('returns one sample per bar', () => {
    expect(runLineInertia(INERTIA_BARS, OPTS).samples).toHaveLength(
      INERTIA_BARS.length,
    );
  });
  it('reports the final Inertia reading', () => {
    const run = runLineInertia(INERTIA_BARS, OPTS);
    const defined = run.inertia.filter((v): v is number => v !== null);
    expect(run.inertiaFinal).toBe(defined[defined.length - 1]);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...INERTIA_BARS].reverse();
    const run = runLineInertia(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineInertiaLayout', () => {
  const base = {
    data: INERTIA_BARS,
    vigorPeriod: 4,
    regPeriod: 3,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single bar', () => {
    expect(
      computeLineInertiaLayout({
        ...base,
        data: [{ x: 0, open: 1, high: 2, low: 0, close: 1 }],
      }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineInertiaLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineInertiaLayout(base).ok).toBe(true);
  });
  it('stacks the price panel above the Inertia panel', () => {
    const layout = computeLineInertiaLayout(base);
    expect(layout.pricePanel.y).toBeLessThan(layout.inertiaPanel.y);
  });
  it('builds the price, Inertia and Relative Vigor Index paths', () => {
    const layout = computeLineInertiaLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.inertiaPath.length).toBeGreaterThan(0);
    expect(layout.rvgiPath.length).toBeGreaterThan(0);
  });
  it('includes zero in the Inertia y-domain', () => {
    const layout = computeLineInertiaLayout(base);
    expect(layout.inertiaYMin).toBeLessThanOrEqual(0);
    expect(layout.inertiaYMax).toBeGreaterThanOrEqual(0);
  });
  it('emits one marker per defined Inertia bar', () => {
    const layout = computeLineInertiaLayout(base);
    expect(layout.markers).toHaveLength(INERTIA_BARS.length - 5);
    expect(layout.priceDots).toHaveLength(INERTIA_BARS.length);
  });
  it('reports the periods and total points', () => {
    const layout = computeLineInertiaLayout(base);
    expect(layout.vigorPeriod).toBe(4);
    expect(layout.regPeriod).toBe(3);
    expect(layout.totalPoints).toBe(INERTIA_BARS.length);
  });
});

describe('describeLineInertiaChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineInertiaChart([])).toBe('No data');
  });
  it('names the Inertia indicator', () => {
    expect(describeLineInertiaChart(INERTIA_BARS, OPTS)).toContain('Inertia');
  });
  it('explains the regression-smoothed Relative Vigor Index', () => {
    const desc = describeLineInertiaChart(INERTIA_BARS, OPTS);
    expect(desc).toContain('Relative Vigor Index');
    expect(desc).toContain('linear regression');
  });
  it('reports the zone counts', () => {
    const run = runLineInertia(INERTIA_BARS, OPTS);
    const desc = describeLineInertiaChart(INERTIA_BARS, OPTS);
    expect(desc).toContain(`bullish on ${run.bullCount} bars`);
  });
});

describe('ChartLineInertia', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} />,
    );
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} ariaLabel="INRT demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('INRT demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineInertia data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-inertia"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-inertia"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the periods as data attributes', () => {
    const { container } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-inertia"]',
    );
    expect(root?.getAttribute('data-vigor-period')).toBe('4');
    expect(root?.getAttribute('data-reg-period')).toBe('3');
  });
  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-inertia-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the Inertia and Relative Vigor Index lines', () => {
    const { container } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-inertia-inertia-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-inertia-rvgi-line"]'),
    ).toBeTruthy();
  });
  it('renders one marker per defined Inertia bar', () => {
    const { container } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-inertia-marker"]',
    );
    expect(markers).toHaveLength(INERTIA_BARS.length - 5);
  });
  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-inertia-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });
  it('shows the periods in the config badge', () => {
    const { container } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} />,
    );
    const cfg = container.querySelector(
      '[data-section="chart-line-inertia-badge-config"]',
    );
    expect(cfg?.textContent).toBe('4/3');
  });
  it('toggles the Relative Vigor Index off via its legend item', () => {
    const { container } = render(
      <ChartLineInertia data={INERTIA_BARS} {...OPTS} />,
    );
    const rvgiItem = container.querySelector(
      '[data-section="chart-line-inertia-legend-item"][data-series-id="rvgi"]',
    ) as HTMLElement;
    fireEvent.click(rvgiItem);
    expect(
      container.querySelector('[data-section="chart-line-inertia-rvgi-line"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineInertia
        data={INERTIA_BARS}
        {...OPTS}
        hiddenSeries={new Set(['inertia'])}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-inertia-inertia-line"]',
      ),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineInertia ref={ref} data={INERTIA_BARS} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
