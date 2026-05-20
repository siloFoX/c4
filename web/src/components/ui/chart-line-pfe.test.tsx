import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLinePfe,
  getLinePfeFinitePoints,
  normalizeLinePfePeriod,
  normalizeLinePfeSmooth,
  computeLinePfeRaw,
  computeLinePfe,
  runLinePfe,
  computeLinePfeLayout,
  describeLinePfeChart,
  DEFAULT_CHART_LINE_PFE_PERIOD,
  DEFAULT_CHART_LINE_PFE_SMOOTH,
  DEFAULT_CHART_LINE_PFE_THRESHOLD,
  type ChartLinePfePoint,
} from './chart-line-pfe';

afterEach(() => cleanup());

// A flat price travels its path in a perfectly straight line:
// the straight-line distance equals the path length, the
// efficiency is exactly 1, and the polarised reading is +100 --
// the only fully exact PFE anchor (every other case divides by
// an irrational sum of segment lengths).
const FLAT_CLOSES = [50, 50, 50, 50, 50, 50];
const RAMP_UP_CLOSES = [0, 10, 20, 30, 40, 50];
const RAMP_DOWN_CLOSES = [50, 40, 30, 20, 10, 0];
// Up 3 then down 3 ends where it started: straight distance 2,
// path 2*sqrt(10), so raw PFE = 100 / sqrt(10) ~ 31.6228.
const TURN_CLOSES = [0, 3, 0];

const PFE_CLOSES = [
  50, 50, 50, 50, 50, 50, 44, 40, 38, 30, 25, 40, 30, 45,
];
const PFE_DATA: ChartLinePfePoint[] = PFE_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = { period: 4, smooth: 1, threshold: 50 };

describe('normalizeLinePfePeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLinePfePeriod(10, 99)).toBe(10);
  });
  it('floors a fractional period', () => {
    expect(normalizeLinePfePeriod(5.8, 99)).toBe(5);
  });
  it('rejects a period below 2', () => {
    expect(normalizeLinePfePeriod(1, 99)).toBe(99);
  });
  it('rejects a zero period', () => {
    expect(normalizeLinePfePeriod(0, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLinePfePeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 2', () => {
    expect(normalizeLinePfePeriod(2, 99)).toBe(2);
  });
});

describe('normalizeLinePfeSmooth', () => {
  it('keeps a valid integer smooth', () => {
    expect(normalizeLinePfeSmooth(5, 99)).toBe(5);
  });
  it('accepts a smooth of 1 (no smoothing)', () => {
    expect(normalizeLinePfeSmooth(1, 99)).toBe(1);
  });
  it('floors a fractional smooth', () => {
    expect(normalizeLinePfeSmooth(3.9, 99)).toBe(3);
  });
  it('rejects a zero smooth', () => {
    expect(normalizeLinePfeSmooth(0, 99)).toBe(99);
  });
  it('rejects a negative smooth', () => {
    expect(normalizeLinePfeSmooth(-2, 99)).toBe(99);
  });
  it('rejects a non-finite smooth', () => {
    expect(normalizeLinePfeSmooth(Number.NaN, 99)).toBe(99);
  });
});

describe('getLinePfeFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLinePfePoint[];
    expect(getLinePfeFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLinePfeFinitePoints(null)).toEqual([]);
    expect(getLinePfeFinitePoints(undefined)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLinePfeFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, value: 1 },
      { x: 2, value: 2 },
    ] as ChartLinePfePoint[];
    expect(getLinePfeFinitePoints(points)).toEqual(points);
  });
});

describe('computeLinePfeRaw', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLinePfeRaw(null, 4)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(computeLinePfeRaw([], 4)).toEqual([]);
  });
  it('matches the input length', () => {
    expect(computeLinePfeRaw(PFE_CLOSES, 4)).toHaveLength(PFE_CLOSES.length);
  });
  it('is all null before the window is full', () => {
    expect(computeLinePfeRaw([1, 2, 3], 4)).toEqual([null, null, null]);
  });
  it('scores a flat price as an exact +100', () => {
    expect(computeLinePfeRaw(FLAT_CLOSES, 4)).toEqual([
      null,
      null,
      null,
      null,
      100,
      100,
    ]);
  });
  it('scores a constant up-ramp near +100 (an efficient trend)', () => {
    const raw = computeLinePfeRaw(RAMP_UP_CLOSES, 3);
    expect(raw[3]).toBeCloseTo(100, 6);
    expect(raw[4]).toBeCloseTo(100, 6);
    expect(raw[5]).toBeCloseTo(100, 6);
  });
  it('scores a constant down-ramp near -100', () => {
    const raw = computeLinePfeRaw(RAMP_DOWN_CLOSES, 3);
    expect(raw[3]).toBeCloseTo(-100, 6);
    expect(raw[5]).toBeCloseTo(-100, 6);
  });
  it('scores a there-and-back move as 100/sqrt(10)', () => {
    const raw = computeLinePfeRaw(TURN_CLOSES, 2);
    expect(raw[2]).toBeCloseTo(100 / Math.sqrt(10), 9);
  });
  it('stays within -100..+100', () => {
    for (const v of computeLinePfeRaw(PFE_CLOSES, 4)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
  it('is positive when the window closes up', () => {
    const raw = computeLinePfeRaw([10, 12, 14, 18, 26], 3);
    expect(raw[3]!).toBeGreaterThan(0);
    expect(raw[4]!).toBeGreaterThan(0);
  });
  it('is negative when the window closes down', () => {
    const raw = computeLinePfeRaw([26, 18, 14, 12, 10], 3);
    expect(raw[3]!).toBeLessThan(0);
    expect(raw[4]!).toBeLessThan(0);
  });
  it('yields null for windows touching a non-finite close', () => {
    const raw = computeLinePfeRaw([10, 20, 30, Number.NaN, 50, 60, 70], 2);
    expect(raw[3]).toBeNull();
    expect(raw[4]).toBeNull();
    expect(raw[5]).toBeNull();
    expect(typeof raw[6]).toBe('number');
  });
});

describe('computeLinePfe', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLinePfe(null, 4, 5)).toEqual([]);
  });
  it('matches the input length', () => {
    expect(computeLinePfe(PFE_CLOSES, 4, 5)).toHaveLength(PFE_CLOSES.length);
  });
  it('is null before the window is full', () => {
    const pfe = computeLinePfe(PFE_CLOSES, 4, 5);
    expect(pfe.slice(0, 4)).toEqual([null, null, null, null]);
  });
  it('equals the raw efficiency when smooth is 1', () => {
    expect(computeLinePfe(PFE_CLOSES, 4, 1)).toEqual(
      computeLinePfeRaw(PFE_CLOSES, 4),
    );
  });
  it('scores a flat price as +100 with no smoothing', () => {
    expect(computeLinePfe(FLAT_CLOSES, 4, 1)).toEqual([
      null,
      null,
      null,
      null,
      100,
      100,
    ]);
  });
  it('seeds the EMA with the first raw value', () => {
    const raw = computeLinePfeRaw(PFE_CLOSES, 4);
    const pfe = computeLinePfe(PFE_CLOSES, 4, 5);
    expect(pfe[4]).toBe(raw[4]);
  });
  it('follows the EMA recurrence after the seed', () => {
    const raw = computeLinePfeRaw(PFE_CLOSES, 4);
    const pfe = computeLinePfe(PFE_CLOSES, 4, 5);
    const alpha = 2 / 6;
    for (let i = 5; i < PFE_CLOSES.length; i += 1) {
      const expected = alpha * raw[i]! + (1 - alpha) * pfe[i - 1]!;
      expect(pfe[i]!).toBeCloseTo(expected, 6);
    }
  });
  it('smooths a sharp raw swing toward the prior value', () => {
    const raw = computeLinePfeRaw(PFE_CLOSES, 4);
    const pfe = computeLinePfe(PFE_CLOSES, 4, 5);
    expect(pfe[6]).not.toBeCloseTo(raw[6]!, 1);
  });
  it('stays within -100..+100', () => {
    for (const v of computeLinePfe(PFE_CLOSES, 4, 5)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('runLinePfe', () => {
  it('is not ok with fewer than two points', () => {
    const run = runLinePfe([{ x: 0, value: 1 }], OPTS);
    expect(run.ok).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLinePfe(PFE_DATA, OPTS).ok).toBe(true);
  });
  it('carries the resolved period, smooth and threshold', () => {
    const run = runLinePfe(PFE_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.smooth).toBe(1);
    expect(run.threshold).toBe(50);
  });
  it('falls back to the default options', () => {
    const run = runLinePfe(PFE_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_PFE_PERIOD);
    expect(run.smooth).toBe(DEFAULT_CHART_LINE_PFE_SMOOTH);
    expect(run.threshold).toBe(DEFAULT_CHART_LINE_PFE_THRESHOLD);
  });
  it('returns raw and pfe series matching the point count', () => {
    const run = runLinePfe(PFE_DATA, OPTS);
    expect(run.raw).toHaveLength(PFE_DATA.length);
    expect(run.pfe).toHaveLength(PFE_DATA.length);
  });
  it('returns one sample per point', () => {
    expect(runLinePfe(PFE_DATA, OPTS).samples).toHaveLength(PFE_DATA.length);
  });
  it('scores fully flat windows as an exact efficient +100', () => {
    const run = runLinePfe(PFE_DATA, OPTS);
    expect(run.samples[4]!.raw).toBe(100);
    expect(run.samples[4]!.pfe).toBe(100);
    expect(run.samples[4]!.zone).toBe('up');
    expect(run.samples[5]!.zone).toBe('up');
  });
  it('classifies each zone consistently with its pfe value', () => {
    const run = runLinePfe(PFE_DATA, OPTS);
    for (const s of run.samples) {
      if (s.pfe === null) {
        expect(s.zone).toBe('none');
      } else if (s.pfe > run.threshold) {
        expect(s.zone).toBe('up');
      } else if (s.pfe < -run.threshold) {
        expect(s.zone).toBe('down');
      } else {
        expect(s.zone).toBe('choppy');
      }
    }
  });
  it('produces every zone for a mixed series', () => {
    const run = runLinePfe(PFE_DATA, OPTS);
    expect(run.upCount).toBeGreaterThan(0);
    expect(run.downCount).toBeGreaterThan(0);
    expect(run.choppyCount).toBeGreaterThan(0);
  });
  it('keeps the zone counts within the sample count', () => {
    const run = runLinePfe(PFE_DATA, OPTS);
    expect(run.upCount + run.downCount + run.choppyCount).toBeLessThanOrEqual(
      run.samples.length,
    );
  });
  it('reports the last defined pfe as pfeFinal', () => {
    const run = runLinePfe(PFE_DATA, OPTS);
    const defined = run.pfe.filter((v): v is number => v !== null);
    expect(run.pfeFinal).toBe(defined[defined.length - 1]);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...PFE_DATA].reverse();
    const run = runLinePfe(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLinePfeLayout', () => {
  const base = {
    data: PFE_DATA,
    period: 4,
    smooth: 1,
    threshold: 50,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single point', () => {
    const layout = computeLinePfeLayout({
      ...base,
      data: [{ x: 0, value: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLinePfeLayout(base).ok).toBe(true);
  });
  it('stacks the price panel above the pfe panel', () => {
    const layout = computeLinePfeLayout(base);
    expect(layout.pricePanel.y).toBeLessThan(layout.pfePanel.y);
  });
  it('builds non-empty price and pfe paths', () => {
    const layout = computeLinePfeLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.pfePath.length).toBeGreaterThan(0);
  });
  it('emits one pfe marker per defined bar', () => {
    const layout = computeLinePfeLayout(base);
    expect(layout.pfeMarkers).toHaveLength(PFE_CLOSES.length - 4);
    expect(layout.priceDots).toHaveLength(PFE_CLOSES.length);
  });
  it('orders the upper, zero and lower level lines top to bottom', () => {
    const layout = computeLinePfeLayout(base);
    expect(layout.upperY).toBeLessThan(layout.zeroY);
    expect(layout.zeroY).toBeLessThan(layout.lowerY);
  });
  it('reports the total point count', () => {
    expect(computeLinePfeLayout(base).totalPoints).toBe(PFE_CLOSES.length);
  });
  it('carries the final pfe reading', () => {
    const layout = computeLinePfeLayout(base);
    const run = runLinePfe(PFE_DATA, OPTS);
    expect(layout.pfeFinal).toBe(run.pfeFinal);
  });
});

describe('describeLinePfeChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLinePfeChart([])).toBe('No data');
  });
  it('names the Polarized Fractal Efficiency', () => {
    expect(describeLinePfeChart(PFE_DATA, OPTS)).toContain(
      'Polarized Fractal Efficiency',
    );
  });
  it('explains the straight-line path efficiency', () => {
    const desc = describeLinePfeChart(PFE_DATA, OPTS);
    expect(desc).toContain('straight-line');
    expect(desc).toContain('path');
    expect(desc).toContain('efficient');
  });
  it('reports the zone counts', () => {
    const run = runLinePfe(PFE_DATA, OPTS);
    const desc = describeLinePfeChart(PFE_DATA, OPTS);
    expect(desc).toContain(`up-trend on ${run.upCount} bars`);
  });
});

describe('ChartLinePfe', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLinePfe data={PFE_DATA} {...OPTS} ariaLabel="PFE demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('PFE demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLinePfe data={[]} />);
    const root = container.querySelector('[data-section="chart-line-pfe"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-pfe"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the period, smooth and threshold as data attributes', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-pfe"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-smooth')).toBe('1');
    expect(root?.getAttribute('data-threshold')).toBe('50');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    const svg = container.querySelector('[data-section="chart-line-pfe-svg"]');
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the pfe line', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-pfe-pfe-line"]'),
    ).toBeTruthy();
  });
  it('renders one marker per defined bar', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pfe-marker"]',
    );
    expect(markers).toHaveLength(PFE_CLOSES.length - 4);
  });
  it('renders the three level lines', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    const lines = container.querySelectorAll(
      '[data-section="chart-line-pfe-level-line"]',
    );
    expect(lines).toHaveLength(3);
  });
  it('renders both panel labels', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-pfe-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });
  it('shows the period and smooth in the config badge', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-pfe-badge-config"]',
    );
    expect(cfg?.textContent).toBe('4/1');
  });
  it('renders three legend items', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-pfe-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });
  it('toggles a series off when its legend item is clicked', () => {
    const { container } = render(<ChartLinePfe data={PFE_DATA} {...OPTS} />);
    const pfeItem = container.querySelector(
      '[data-section="chart-line-pfe-legend-item"][data-series-id="pfe"]',
    ) as HTMLElement;
    expect(pfeItem.getAttribute('data-hidden')).toBe('false');
    fireEvent.click(pfeItem);
    const after = container.querySelector(
      '[data-section="chart-line-pfe-legend-item"][data-series-id="pfe"]',
    );
    expect(after?.getAttribute('data-hidden')).toBe('true');
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLinePfe
        data={PFE_DATA}
        {...OPTS}
        hiddenSeries={new Set(['pfe'])}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pfe-pfe-line"]'),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePfe ref={ref} data={PFE_DATA} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
