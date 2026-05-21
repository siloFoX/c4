import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMcclellan,
  getLineMcclellanFinitePoints,
  normalizeLineMcclellanPeriod,
  computeLineMcclellanEma,
  computeLineMcclellan,
  runLineMcclellan,
  computeLineMcclellanLayout,
  describeLineMcclellanChart,
  DEFAULT_CHART_LINE_MCCLELLAN_FAST_PERIOD,
  DEFAULT_CHART_LINE_MCCLELLAN_SLOW_PERIOD,
  type ChartLineMcclellanPoint,
} from './chart-line-mcclellan';

afterEach(() => cleanup());

// The advance-decline breadth values are integers and the EMA
// periods are chosen so the smoothing constants are exact
// dyadics: period 3 gives alpha 0.5, period 7 gives alpha 0.25.
// Both moving averages, and the oscillator spread between them,
// then stay on exact binary fractions.
const MCC_VALUES = [0, 16, 16, 0, -16, 0, 16, 8, -8, 24, -16, 0];
const MCC_DATA: ChartLineMcclellanPoint[] = MCC_VALUES.map((value, x) => ({
  x,
  value,
}));
const OPTS = { fastPeriod: 3, slowPeriod: 7 };

describe('normalizeLineMcclellanPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineMcclellanPeriod(19, 99)).toBe(19);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineMcclellanPeriod(7.8, 99)).toBe(7);
  });
  it('rejects a zero period', () => {
    expect(normalizeLineMcclellanPeriod(0, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLineMcclellanPeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 1', () => {
    expect(normalizeLineMcclellanPeriod(1, 99)).toBe(1);
  });
});

describe('getLineMcclellanFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineMcclellanPoint[];
    expect(getLineMcclellanFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineMcclellanFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineMcclellanFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, value: 1 },
      { x: 2, value: 2 },
    ] as ChartLineMcclellanPoint[];
    expect(getLineMcclellanFinitePoints(points)).toEqual(points);
  });
});

describe('computeLineMcclellanEma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineMcclellanEma(null, 3)).toEqual([]);
  });
  it('seeds with the first value', () => {
    expect(computeLineMcclellanEma([12, 4, 8], 3)[0]).toBe(12);
  });
  it('advances by the dyadic alpha for a period of three', () => {
    expect(computeLineMcclellanEma([0, 16, 16, 0], 3)).toEqual([0, 8, 12, 6]);
  });
  it('holds a constant input bit-exactly constant', () => {
    expect(computeLineMcclellanEma([5, 5, 5, 5], 7)).toEqual([5, 5, 5, 5]);
  });
  it('matches the input length', () => {
    expect(computeLineMcclellanEma(MCC_VALUES, 3)).toHaveLength(
      MCC_VALUES.length,
    );
  });
});

describe('computeLineMcclellan', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineMcclellan(null, 3, 7)).toEqual([]);
  });
  it('is the spread between the fast and slow EMAs', () => {
    const osc = computeLineMcclellan(MCC_VALUES, 3, 7);
    const fast = computeLineMcclellanEma(MCC_VALUES, 3);
    const slow = computeLineMcclellanEma(MCC_VALUES, 7);
    for (let i = 0; i < osc.length; i += 1) {
      expect(osc[i]).toBe((fast[i] as number) - (slow[i] as number));
    }
  });
  it('starts at zero with both EMAs seeded equal', () => {
    expect(computeLineMcclellan(MCC_VALUES, 3, 7)[0]).toBe(0);
  });
  it('takes an exact value on the early bars', () => {
    const osc = computeLineMcclellan(MCC_VALUES, 3, 7);
    expect(osc[1]).toBe(4);
    expect(osc[2]).toBe(5);
    expect(osc[3]).toBe(0.75);
  });
  it('collapses to zero for a constant breadth series', () => {
    expect(computeLineMcclellan([5, 5, 5, 5], 3, 7)).toEqual([0, 0, 0, 0]);
  });
  it('matches the input length', () => {
    expect(computeLineMcclellan(MCC_VALUES, 3, 7)).toHaveLength(
      MCC_VALUES.length,
    );
  });
});

describe('runLineMcclellan', () => {
  it('is not ok with fewer than two points', () => {
    expect(runLineMcclellan([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineMcclellan(MCC_DATA, OPTS).ok).toBe(true);
  });
  it('carries the resolved fast and slow periods', () => {
    const run = runLineMcclellan(MCC_DATA, OPTS);
    expect(run.fastPeriod).toBe(3);
    expect(run.slowPeriod).toBe(7);
  });
  it('falls back to the classic default periods', () => {
    const run = runLineMcclellan(MCC_DATA);
    expect(run.fastPeriod).toBe(DEFAULT_CHART_LINE_MCCLELLAN_FAST_PERIOD);
    expect(run.slowPeriod).toBe(DEFAULT_CHART_LINE_MCCLELLAN_SLOW_PERIOD);
  });
  it('exposes the oscillator as the EMA spread', () => {
    const run = runLineMcclellan(MCC_DATA, OPTS);
    expect(run.osc).toEqual(computeLineMcclellan(MCC_VALUES, 3, 7));
  });
  it('exposes the fast and slow EMA series', () => {
    const run = runLineMcclellan(MCC_DATA, OPTS);
    expect(run.fastEma).toEqual(computeLineMcclellanEma(MCC_VALUES, 3));
    expect(run.slowEma).toEqual(computeLineMcclellanEma(MCC_VALUES, 7));
  });
  it('classifies each bar by the sign of the oscillator', () => {
    const run = runLineMcclellan(MCC_DATA, OPTS);
    for (const s of run.samples) {
      if (s.osc === null) continue;
      if (s.osc > 0) expect(s.zone).toBe('positive');
      else if (s.osc < 0) expect(s.zone).toBe('negative');
      else expect(s.zone).toBe('zero');
    }
  });
  it('crosses zero so both signs appear', () => {
    const run = runLineMcclellan(MCC_DATA, OPTS);
    expect(run.positiveCount).toBeGreaterThan(0);
    expect(run.negativeCount).toBeGreaterThan(0);
    expect(run.zeroCount).toBe(1);
  });
  it('returns one sample per point', () => {
    expect(runLineMcclellan(MCC_DATA, OPTS).samples).toHaveLength(
      MCC_DATA.length,
    );
  });
  it('reports the final oscillator reading', () => {
    const run = runLineMcclellan(MCC_DATA, OPTS);
    const defined = run.osc.filter((v): v is number => v !== null);
    expect(run.oscFinal).toBe(defined[defined.length - 1]);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...MCC_DATA].reverse();
    const run = runLineMcclellan(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineMcclellanLayout', () => {
  const base = {
    data: MCC_DATA,
    fastPeriod: 3,
    slowPeriod: 7,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single point', () => {
    expect(
      computeLineMcclellanLayout({ ...base, data: [{ x: 0, value: 1 }] }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineMcclellanLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineMcclellanLayout(base).ok).toBe(true);
  });
  it('stacks the breadth panel above the oscillator panel', () => {
    const layout = computeLineMcclellanLayout(base);
    expect(layout.breadthPanel.y).toBeLessThan(layout.oscPanel.y);
  });
  it('builds the breadth and oscillator paths', () => {
    const layout = computeLineMcclellanLayout(base);
    expect(layout.breadthPath.length).toBeGreaterThan(0);
    expect(layout.oscPath.length).toBeGreaterThan(0);
  });
  it('includes zero in the oscillator y-domain', () => {
    const layout = computeLineMcclellanLayout(base);
    expect(layout.oscYMin).toBeLessThanOrEqual(0);
    expect(layout.oscYMax).toBeGreaterThanOrEqual(0);
  });
  it('emits one marker per bar', () => {
    const layout = computeLineMcclellanLayout(base);
    expect(layout.markers).toHaveLength(MCC_VALUES.length);
    expect(layout.breadthDots).toHaveLength(MCC_VALUES.length);
  });
  it('reports the periods and total points', () => {
    const layout = computeLineMcclellanLayout(base);
    expect(layout.fastPeriod).toBe(3);
    expect(layout.slowPeriod).toBe(7);
    expect(layout.totalPoints).toBe(MCC_VALUES.length);
  });
});

describe('describeLineMcclellanChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineMcclellanChart([])).toBe('No data');
  });
  it('names the McClellan Oscillator', () => {
    expect(describeLineMcclellanChart(MCC_DATA, OPTS)).toContain(
      'McClellan Oscillator',
    );
  });
  it('explains the advance-decline EMA spread', () => {
    const desc = describeLineMcclellanChart(MCC_DATA, OPTS);
    expect(desc).toContain('advance-decline');
    expect(desc).toContain('spread');
    expect(desc).toContain('exponential moving average');
  });
  it('reports the zone counts', () => {
    const run = runLineMcclellan(MCC_DATA, OPTS);
    const desc = describeLineMcclellanChart(MCC_DATA, OPTS);
    expect(desc).toContain(`positive on ${run.positiveCount} bars`);
  });
});

describe('ChartLineMcclellan', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} />,
    );
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} ariaLabel="MCO demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('MCO demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineMcclellan data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-mcclellan"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mcclellan"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the periods as data attributes', () => {
    const { container } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mcclellan"]',
    );
    expect(root?.getAttribute('data-fast-period')).toBe('3');
    expect(root?.getAttribute('data-slow-period')).toBe('7');
  });
  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-mcclellan-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the oscillator line', () => {
    const { container } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mcclellan-osc-line"]'),
    ).toBeTruthy();
  });
  it('renders one marker per bar', () => {
    const { container } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-mcclellan-marker"]',
    );
    expect(markers).toHaveLength(MCC_VALUES.length);
  });
  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-mcclellan-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });
  it('shows the periods in the config badge', () => {
    const { container } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} />,
    );
    const cfg = container.querySelector(
      '[data-section="chart-line-mcclellan-badge-config"]',
    );
    expect(cfg?.textContent).toBe('3/7');
  });
  it('toggles the McClellan line off via its legend item', () => {
    const { container } = render(
      <ChartLineMcclellan data={MCC_DATA} {...OPTS} />,
    );
    const oscItem = container.querySelector(
      '[data-section="chart-line-mcclellan-legend-item"][data-series-id="osc"]',
    ) as HTMLElement;
    fireEvent.click(oscItem);
    expect(
      container.querySelector('[data-section="chart-line-mcclellan-osc-line"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineMcclellan
        data={MCC_DATA}
        {...OPTS}
        hiddenSeries={new Set(['breadth'])}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mcclellan-breadth-path"]',
      ),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMcclellan ref={ref} data={MCC_DATA} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
