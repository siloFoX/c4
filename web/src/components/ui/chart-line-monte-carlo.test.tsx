import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineMonteCarlo,
  DEFAULT_CHART_LINE_MONTE_CARLO_HORIZON,
  DEFAULT_CHART_LINE_MONTE_CARLO_SIMULATIONS,
  computeLineMonteCarloForecast,
  computeLineMonteCarloLayout,
  computeLineMonteCarloQuantile,
  computeLineMonteCarloReturns,
  createLineMonteCarloRng,
  describeLineMonteCarloChart,
  getLineMonteCarloFinitePoints,
  normalizeLineMonteCarloHorizon,
  normalizeLineMonteCarloQuantile,
  normalizeLineMonteCarloSeed,
  normalizeLineMonteCarloSimulations,
  runLineMonteCarlo,
  type ChartLineMonteCarloPoint,
} from './chart-line-monte-carlo';

const toPoints = (values: number[]): ChartLineMonteCarloPoint[] =>
  values.map((v, i) => ({ x: i, value: v }));

const CONST_FLAT: ChartLineMonteCarloPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);
const RISING_UNIT: ChartLineMonteCarloPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
]);
const FALLING_UNIT: ChartLineMonteCarloPoint[] = toPoints([
  19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
]);
const WAVE: ChartLineMonteCarloPoint[] = Array.from({ length: 30 }, (_, i) => ({
  x: i,
  value: 50 + 10 * Math.sin(i * 0.4),
}));

const OPTS = { horizon: 5, simulations: 50, seed: 7 } as const;

describe('getLineMonteCarloFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineMonteCarloFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineMonteCarloFinitePoints(
        'nope' as unknown as ChartLineMonteCarloPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x or value', () => {
    const points: ChartLineMonteCarloPoint[] = [
      { x: 0, value: 1 },
      { x: Number.NaN, value: 2 },
      { x: 1, value: Number.POSITIVE_INFINITY },
      { x: 2, value: 3 },
    ];
    expect(getLineMonteCarloFinitePoints(points)).toEqual([
      { x: 0, value: 1 },
      { x: 2, value: 3 },
    ]);
  });

  it('preserves input order', () => {
    const finite = getLineMonteCarloFinitePoints(RISING_UNIT.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...RISING_UNIT].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineMonteCarloHorizon', () => {
  it('keeps a valid integer horizon', () => {
    expect(normalizeLineMonteCarloHorizon(20, 20)).toBe(20);
  });

  it('floors a fractional horizon', () => {
    expect(normalizeLineMonteCarloHorizon(20.9, 20)).toBe(20);
  });

  it('falls back for a sub-1 horizon', () => {
    expect(normalizeLineMonteCarloHorizon(0, 20)).toBe(20);
  });

  it('falls back for a non-finite horizon', () => {
    expect(normalizeLineMonteCarloHorizon(Number.NaN, 20)).toBe(20);
  });

  it('falls back for a string horizon', () => {
    expect(normalizeLineMonteCarloHorizon('20' as unknown as number, 20)).toBe(
      20,
    );
  });
});

describe('normalizeLineMonteCarloSimulations', () => {
  it('keeps a valid integer count', () => {
    expect(normalizeLineMonteCarloSimulations(200, 200)).toBe(200);
  });

  it('floors a fractional count', () => {
    expect(normalizeLineMonteCarloSimulations(200.9, 200)).toBe(200);
  });

  it('falls back for a sub-1 count', () => {
    expect(normalizeLineMonteCarloSimulations(0, 200)).toBe(200);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineMonteCarloSimulations(Number.NaN, 200)).toBe(200);
  });

  it('falls back for a string', () => {
    expect(
      normalizeLineMonteCarloSimulations('200' as unknown as number, 200),
    ).toBe(200);
  });
});

describe('normalizeLineMonteCarloSeed', () => {
  it('keeps a non-negative integer seed', () => {
    expect(normalizeLineMonteCarloSeed(42, 1)).toBe(42);
  });

  it('takes the absolute value of a negative seed', () => {
    expect(normalizeLineMonteCarloSeed(-7, 1)).toBe(7);
  });

  it('floors a fractional seed', () => {
    expect(normalizeLineMonteCarloSeed(3.9, 1)).toBe(3);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineMonteCarloSeed(Number.NaN, 1)).toBe(1);
  });
});

describe('normalizeLineMonteCarloQuantile', () => {
  it('keeps a quantile inside (0, 1)', () => {
    expect(normalizeLineMonteCarloQuantile(0.25, 0.1)).toBe(0.25);
  });

  it('falls back for zero', () => {
    expect(normalizeLineMonteCarloQuantile(0, 0.1)).toBe(0.1);
  });

  it('falls back for one', () => {
    expect(normalizeLineMonteCarloQuantile(1, 0.1)).toBe(0.1);
  });

  it('falls back for negative', () => {
    expect(normalizeLineMonteCarloQuantile(-0.1, 0.1)).toBe(0.1);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineMonteCarloQuantile(Number.NaN, 0.1)).toBe(0.1);
  });
});

describe('computeLineMonteCarloReturns', () => {
  it('returns an empty list for non-array', () => {
    expect(
      computeLineMonteCarloReturns(null as unknown as number[]),
    ).toEqual([]);
  });

  it('returns an empty list for a single-bar input', () => {
    expect(computeLineMonteCarloReturns([5])).toEqual([]);
  });

  it('produces the bar-to-bar differences', () => {
    expect(computeLineMonteCarloReturns([10, 11, 12, 14])).toEqual([1, 1, 2]);
  });

  it('produces zero returns for a constant input', () => {
    expect(computeLineMonteCarloReturns([5, 5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('skips bars that point at a non-finite value', () => {
    const out = computeLineMonteCarloReturns([1, 2, Number.NaN, 5]);
    expect(out).toEqual([1]);
  });
});

describe('createLineMonteCarloRng', () => {
  it('returns values inside [0, 1)', () => {
    const rng = createLineMonteCarloRng(1);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = createLineMonteCarloRng(1);
    const b = createLineMonteCarloRng(1);
    for (let i = 0; i < 200; i += 1) expect(a()).toBe(b());
  });

  it('different seeds produce different sequences', () => {
    const a = createLineMonteCarloRng(1);
    const b = createLineMonteCarloRng(2);
    expect(a()).not.toBe(b());
  });

  it('produces finite values', () => {
    const rng = createLineMonteCarloRng(7);
    for (let i = 0; i < 100; i += 1) {
      expect(Number.isFinite(rng())).toBe(true);
    }
  });
});

describe('computeLineMonteCarloQuantile', () => {
  it('returns NaN for an empty array', () => {
    expect(Number.isNaN(computeLineMonteCarloQuantile([], 0.5))).toBe(true);
  });

  it('returns the only value for a single-element array', () => {
    expect(computeLineMonteCarloQuantile([42], 0.5)).toBe(42);
  });

  it('returns the floor-quantile index value', () => {
    expect(computeLineMonteCarloQuantile([1, 2, 3, 4], 0.5)).toBe(3);
    expect(computeLineMonteCarloQuantile([1, 2, 3, 4], 0.1)).toBe(1);
    expect(computeLineMonteCarloQuantile([1, 2, 3, 4], 0.9)).toBe(4);
  });

  it('clamps the index at the last position', () => {
    expect(computeLineMonteCarloQuantile([1, 2, 3], 0.999)).toBe(3);
  });
});

describe('computeLineMonteCarloForecast', () => {
  it('returns an empty list for an empty returns pool', () => {
    expect(computeLineMonteCarloForecast(100, [], OPTS)).toEqual([]);
  });

  it('returns an empty list for a non-finite last price', () => {
    expect(
      computeLineMonteCarloForecast(Number.NaN, [1, 1], OPTS),
    ).toEqual([]);
  });

  it('produces one step per horizon entry', () => {
    const out = computeLineMonteCarloForecast(100, [1, -1, 2], OPTS);
    expect(out).toHaveLength(5);
  });

  it('zero-variance pool: every fan reading equals the last price (the degenerate anchor)', () => {
    const out = computeLineMonteCarloForecast(
      100,
      [0, 0, 0, 0],
      { horizon: 5, simulations: 100, seed: 7 },
    );
    for (const step of out) {
      expect(step.lower).toBe(100);
      expect(step.median).toBe(100);
      expect(step.upper).toBe(100);
      expect(step.mean).toBe(100);
    }
  });

  it('single-value pool: every fan reading equals last + step * value (zero variance)', () => {
    const out = computeLineMonteCarloForecast(
      100,
      [1, 1, 1, 1],
      { horizon: 5, simulations: 100, seed: 7 },
    );
    for (const step of out) {
      const expected = 100 + step.step;
      expect(step.lower).toBe(expected);
      expect(step.median).toBe(expected);
      expect(step.upper).toBe(expected);
      expect(step.mean).toBe(expected);
    }
  });

  it('single-value negative pool: every fan reading equals last - step (zero variance)', () => {
    const out = computeLineMonteCarloForecast(
      100,
      [-1, -1, -1, -1],
      { horizon: 5, simulations: 100, seed: 7 },
    );
    for (const step of out) {
      const expected = 100 - step.step;
      expect(step.lower).toBe(expected);
      expect(step.median).toBe(expected);
      expect(step.upper).toBe(expected);
    }
  });

  it('the quantile order lower <= median <= upper holds at every step', () => {
    const out = computeLineMonteCarloForecast(
      100,
      [1, -1, 2, -2, 0.5, -0.5],
      { horizon: 10, simulations: 100, seed: 7 },
    );
    for (const step of out) {
      expect(step.lower).toBeLessThanOrEqual(step.median);
      expect(step.median).toBeLessThanOrEqual(step.upper);
    }
  });

  it('is deterministic for the same seed', () => {
    const opts = { horizon: 10, simulations: 100, seed: 42 } as const;
    const a = computeLineMonteCarloForecast(100, [1, -1, 2, -2], opts);
    const b = computeLineMonteCarloForecast(100, [1, -1, 2, -2], opts);
    expect(a).toEqual(b);
  });

  it('different seeds produce different fans (on a variable pool)', () => {
    const a = computeLineMonteCarloForecast(
      100,
      [1, -1, 2, -2],
      { horizon: 10, simulations: 50, seed: 1 },
    );
    const b = computeLineMonteCarloForecast(
      100,
      [1, -1, 2, -2],
      { horizon: 10, simulations: 50, seed: 2 },
    );
    expect(a).not.toEqual(b);
  });

  it('every value is finite', () => {
    const out = computeLineMonteCarloForecast(
      100,
      [1, -1, 2, -2, 0.5],
      OPTS,
    );
    for (const step of out) {
      expect(Number.isFinite(step.lower)).toBe(true);
      expect(Number.isFinite(step.median)).toBe(true);
      expect(Number.isFinite(step.upper)).toBe(true);
      expect(Number.isFinite(step.mean)).toBe(true);
    }
  });

  it('the step index runs 1..horizon and the x advances by step', () => {
    const out = computeLineMonteCarloForecast(
      100,
      [1, 1, 1],
      { horizon: 4, simulations: 10, seed: 7 },
      50,
    );
    expect(out.map((s) => s.step)).toEqual([1, 2, 3, 4]);
    expect(out.map((s) => s.x)).toEqual([51, 52, 53, 54]);
  });

  it('a wider pool with positive bias trends the median upward over horizon', () => {
    const out = computeLineMonteCarloForecast(
      100,
      [1, 1, 1, 2, 0],
      { horizon: 20, simulations: 200, seed: 7 },
    );
    expect(out[out.length - 1]!.median).toBeGreaterThan(out[0]!.median);
  });
});

describe('runLineMonteCarlo', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineMonteCarlo([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineMonteCarlo([]).ok).toBe(false);
    expect(runLineMonteCarlo(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineMonteCarlo(RISING_UNIT, OPTS).ok).toBe(true);
  });

  it('uses the default horizon and simulations', () => {
    const run = runLineMonteCarlo(RISING_UNIT);
    expect(run.horizon).toBe(DEFAULT_CHART_LINE_MONTE_CARLO_HORIZON);
    expect(run.simulations).toBe(DEFAULT_CHART_LINE_MONTE_CARLO_SIMULATIONS);
  });

  it('honours custom options', () => {
    const run = runLineMonteCarlo(RISING_UNIT, OPTS);
    expect(run.horizon).toBe(5);
    expect(run.simulations).toBe(50);
    expect(run.seed).toBe(7);
  });

  it('produces one forecast step per horizon entry', () => {
    const run = runLineMonteCarlo(RISING_UNIT, OPTS);
    expect(run.forecast).toHaveLength(5);
  });

  it('zero-return history produces a zero-variance fan at the last price', () => {
    const run = runLineMonteCarlo(CONST_FLAT, OPTS);
    for (const step of run.forecast) {
      expect(step.lower).toBe(5);
      expect(step.median).toBe(5);
      expect(step.upper).toBe(5);
    }
  });

  it('the rising unit history produces a strictly increasing median', () => {
    const run = runLineMonteCarlo(RISING_UNIT, OPTS);
    for (let i = 1; i < run.forecast.length; i += 1) {
      expect(run.forecast[i]!.median).toBeGreaterThan(
        run.forecast[i - 1]!.median,
      );
    }
  });

  it('sorts the history by x', () => {
    const shuffled = [...RISING_UNIT].sort(() => -1);
    const run = runLineMonteCarlo(shuffled, OPTS);
    const xs = run.history.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the last historical price', () => {
    const run = runLineMonteCarlo(RISING_UNIT, OPTS);
    expect(run.lastPrice).toBe(19);
  });
});

describe('computeLineMonteCarloLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLineMonteCarloLayout({
        data: [{ x: 0, value: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLineMonteCarloLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineMonteCarloLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('builds a non-empty history path and a non-empty median path', () => {
    const layout = computeLineMonteCarloLayout({ data: RISING_UNIT, ...OPTS });
    expect(layout.historyPath.length).toBeGreaterThan(0);
    expect(layout.medianPath.length).toBeGreaterThan(0);
  });

  it('builds a non-empty fan band path', () => {
    const layout = computeLineMonteCarloLayout({ data: RISING_UNIT, ...OPTS });
    expect(layout.fanPath.length).toBeGreaterThan(0);
  });

  it('emits one history dot per historical bar', () => {
    const layout = computeLineMonteCarloLayout({ data: RISING_UNIT, ...OPTS });
    expect(layout.historyDots).toHaveLength(RISING_UNIT.length);
  });

  it('emits one marker per horizon step', () => {
    const layout = computeLineMonteCarloLayout({ data: RISING_UNIT, ...OPTS });
    expect(layout.markers).toHaveLength(5);
  });

  it('the forecast divider sits past the last history dot', () => {
    const layout = computeLineMonteCarloLayout({ data: RISING_UNIT, ...OPTS });
    const lastDot = layout.historyDots[layout.historyDots.length - 1]!;
    expect(layout.forecastStartX).toBeGreaterThanOrEqual(lastDot.cx - 0.5);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineMonteCarloLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineMonteCarloLayout({ data: RISING_UNIT, ...OPTS });
    expect(layout.run.horizon).toBe(5);
    expect(layout.run.simulations).toBe(50);
  });
});

describe('describeLineMonteCarloChart', () => {
  it('names the indicator', () => {
    expect(describeLineMonteCarloChart(RISING_UNIT, OPTS)).toContain(
      'Monte Carlo',
    );
  });

  it('mentions the horizon and simulations', () => {
    const text = describeLineMonteCarloChart(RISING_UNIT, OPTS);
    expect(text).toContain('horizon 5');
    expect(text).toContain('simulations 50');
  });

  it('mentions the bootstrap with replacement', () => {
    expect(describeLineMonteCarloChart(RISING_UNIT, OPTS)).toContain(
      'replacement',
    );
  });

  it('mentions the final median', () => {
    expect(describeLineMonteCarloChart(RISING_UNIT, OPTS)).toContain(
      'final median',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineMonteCarloChart([])).toBe('No data');
    expect(describeLineMonteCarloChart(null)).toBe('No data');
  });
});

describe('<ChartLineMonteCarlo />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    expect(
      screen.getByRole('region', {
        name: /Monte Carlo forecast fan chart/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-monte-carlo-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Monte Carlo');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={[]}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-monte-carlo-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the horizon, simulations and seed on the root', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-monte-carlo"]',
    );
    expect(root?.getAttribute('data-horizon')).toBe('5');
    expect(root?.getAttribute('data-simulations')).toBe('50');
    expect(root?.getAttribute('data-seed')).toBe('7');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the history line and the forecast median line', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-monte-carlo-history-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-monte-carlo-median-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders the forecast fan band', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-monte-carlo-fan-band"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders the forecast divider', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-monte-carlo-forecast-divider"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per horizon step', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-monte-carlo-marker"]',
    );
    expect(markers.length).toBe(5);
  });

  it('renders the config badge with the horizon and simulations', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-monte-carlo-badge-config"]',
    );
    expect(badge?.textContent).toContain('MC H5 S50');
  });

  it('hides the fan via the legend toggle', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-monte-carlo-legend-item"][data-series-id="fan"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-monte-carlo-fan-band"]',
      ),
    ).toBeNull();
  });

  it('hides the median via the legend toggle', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-monte-carlo-legend-item"][data-series-id="median"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-monte-carlo-median-path"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineMonteCarlo
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
        onPointClick={({ step }) => {
          received = step.step;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-monte-carlo-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineMonteCarlo
        ref={ref}
        data={RISING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    expect(ref.current).not.toBeNull();
  });

  it('renders for a falling unit series', () => {
    const { container } = render(
      <ChartLineMonteCarlo
        data={FALLING_UNIT}
        horizon={5}
        simulations={50}
        seed={7}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-monte-carlo-marker"]',
    );
    expect(markers.length).toBe(5);
  });
});
