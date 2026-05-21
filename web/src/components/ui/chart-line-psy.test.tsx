import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLinePsy,
  getLinePsyFinitePoints,
  normalizeLinePsyPeriod,
  computeLinePsyUpBars,
  computeLinePsy,
  runLinePsy,
  computeLinePsyLayout,
  describeLinePsyChart,
  DEFAULT_CHART_LINE_PSY_PERIOD,
  type ChartLinePsyPoint,
} from './chart-line-psy';

afterEach(() => cleanup());

// The close climbs five bars, falls four, then climbs two and
// dips one. Over a four-bar window the share of up bars -- scaled
// to 0..100 -- is a count times 25, so every Psychological Line
// reading is an exact integer. The run covers a stretch of all-up
// bars (100) and all-down bars (0).
const PSY_CLOSES = [10, 12, 14, 16, 18, 20, 18, 16, 14, 12, 14, 16, 14];
const PSY_DATA: ChartLinePsyPoint[] = PSY_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = { period: 4, upperThreshold: 75, lowerThreshold: 25 };

const UP_EXPECTED = [
  null,
  true,
  true,
  true,
  true,
  true,
  false,
  false,
  false,
  false,
  true,
  true,
  false,
];
const PSY_EXPECTED = [
  null, null, null, null, 100, 100, 75, 50, 25, 0, 25, 50, 50,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'none',
  'overbought',
  'overbought',
  'neutral',
  'neutral',
  'neutral',
  'oversold',
  'neutral',
  'neutral',
  'neutral',
];

describe('getLinePsyFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLinePsyPoint[];
    expect(getLinePsyFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLinePsyFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLinePsyFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, value: 1 },
      { x: 2, value: 2 },
    ] as ChartLinePsyPoint[];
    expect(getLinePsyFinitePoints(points)).toEqual(points);
  });
});

describe('normalizeLinePsyPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLinePsyPeriod(12, 99)).toBe(12);
  });
  it('floors a fractional period', () => {
    expect(normalizeLinePsyPeriod(4.8, 99)).toBe(4);
  });
  it('rejects a zero period', () => {
    expect(normalizeLinePsyPeriod(0, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLinePsyPeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 1', () => {
    expect(normalizeLinePsyPeriod(1, 99)).toBe(1);
  });
});

describe('computeLinePsyUpBars', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLinePsyUpBars(null)).toEqual([]);
  });
  it('leaves the opening bar null', () => {
    expect(computeLinePsyUpBars([10, 12, 11])[0]).toBeNull();
  });
  it('flags a bar up when its close exceeds the prior close', () => {
    expect(computeLinePsyUpBars([10, 12, 11, 15])).toEqual([
      null,
      true,
      false,
      true,
    ]);
  });
  it('computes the exact up-bar flags for the fixture', () => {
    expect(computeLinePsyUpBars(PSY_CLOSES)).toEqual(UP_EXPECTED);
  });
  it('matches the input length', () => {
    expect(computeLinePsyUpBars(PSY_CLOSES)).toHaveLength(PSY_CLOSES.length);
  });
});

describe('computeLinePsy', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLinePsy(null, 4)).toEqual([]);
  });
  it('is null before the window of up-bar flags is full', () => {
    expect(computeLinePsy(PSY_CLOSES, 4).slice(0, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
  it('is the share of up bars over the window', () => {
    expect(computeLinePsy(PSY_CLOSES, 4)).toEqual(PSY_EXPECTED);
  });
  it('stays within 0..100', () => {
    for (const v of computeLinePsy(PSY_CLOSES, 4)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
  it('matches the input length', () => {
    expect(computeLinePsy(PSY_CLOSES, 4)).toHaveLength(PSY_CLOSES.length);
  });
});

describe('runLinePsy', () => {
  it('is not ok with fewer than two points', () => {
    expect(runLinePsy([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLinePsy(PSY_DATA, OPTS).ok).toBe(true);
  });
  it('carries the resolved period and thresholds', () => {
    const run = runLinePsy(PSY_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.upperThreshold).toBe(75);
    expect(run.lowerThreshold).toBe(25);
  });
  it('falls back to the default period and thresholds', () => {
    const run = runLinePsy(PSY_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_PSY_PERIOD);
    expect(run.upperThreshold).toBe(75);
    expect(run.lowerThreshold).toBe(25);
  });
  it('exposes the exact Psychological Line series', () => {
    expect(runLinePsy(PSY_DATA, OPTS).psy).toEqual(PSY_EXPECTED);
  });
  it('classifies each bar against the thresholds', () => {
    expect(runLinePsy(PSY_DATA, OPTS).samples.map((s) => s.zone)).toEqual(
      ZONE_EXPECTED,
    );
  });
  it('returns one sample per point', () => {
    expect(runLinePsy(PSY_DATA, OPTS).samples).toHaveLength(PSY_DATA.length);
  });
  it('counts the overbought, oversold and neutral bars', () => {
    const run = runLinePsy(PSY_DATA, OPTS);
    expect(run.overboughtCount).toBe(2);
    expect(run.oversoldCount).toBe(1);
    expect(run.neutralCount).toBe(6);
  });
  it('reports the final Psychological Line reading', () => {
    expect(runLinePsy(PSY_DATA, OPTS).psyFinal).toBe(50);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...PSY_DATA].reverse();
    const run = runLinePsy(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLinePsyLayout', () => {
  const base = {
    data: PSY_DATA,
    period: 4,
    upperThreshold: 75,
    lowerThreshold: 25,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single point', () => {
    expect(
      computeLinePsyLayout({ ...base, data: [{ x: 0, value: 1 }] }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLinePsyLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLinePsyLayout(base).ok).toBe(true);
  });
  it('stacks the price panel above the Psychological Line panel', () => {
    const layout = computeLinePsyLayout(base);
    expect(layout.pricePanel.y).toBeLessThan(layout.psyPanel.y);
  });
  it('builds the price and Psychological Line paths', () => {
    const layout = computeLinePsyLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.psyPath.length).toBeGreaterThan(0);
  });
  it('orders the upper threshold line above the lower', () => {
    const layout = computeLinePsyLayout(base);
    expect(layout.upperY).toBeLessThan(layout.lowerY);
  });
  it('emits one marker per defined bar', () => {
    const layout = computeLinePsyLayout(base);
    expect(layout.markers).toHaveLength(PSY_CLOSES.length - 4);
    expect(layout.priceDots).toHaveLength(PSY_CLOSES.length);
  });
  it('reports the total point count and final reading', () => {
    const layout = computeLinePsyLayout(base);
    expect(layout.totalPoints).toBe(PSY_CLOSES.length);
    expect(layout.psyFinal).toBe(50);
  });
});

describe('describeLinePsyChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLinePsyChart([])).toBe('No data');
  });
  it('names the Psychological Line', () => {
    expect(describeLinePsyChart(PSY_DATA, OPTS)).toContain(
      'Psychological Line',
    );
  });
  it('explains the share of up bars', () => {
    const desc = describeLinePsyChart(PSY_DATA, OPTS);
    expect(desc).toContain('up bars');
    expect(desc).toContain('overbought');
  });
  it('reports the zone counts', () => {
    expect(describeLinePsyChart(PSY_DATA, OPTS)).toContain(
      'overbought on 2 bars',
    );
  });
});

describe('ChartLinePsy', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLinePsy data={PSY_DATA} {...OPTS} ariaLabel="PSY demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('PSY demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLinePsy data={[]} />);
    const root = container.querySelector('[data-section="chart-line-psy"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-psy"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the period and thresholds as data attributes', () => {
    const { container } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-psy"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-upper-threshold')).toBe('75');
    expect(root?.getAttribute('data-lower-threshold')).toBe('25');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    const svg = container.querySelector('[data-section="chart-line-psy-svg"]');
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the Psychological Line', () => {
    const { container } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-psy-psy-line"]'),
    ).toBeTruthy();
  });
  it('renders the two threshold lines', () => {
    const { container } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    const lines = container.querySelectorAll(
      '[data-section="chart-line-psy-level-line"]',
    );
    expect(lines).toHaveLength(2);
  });
  it('renders one marker per defined bar', () => {
    const { container } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-psy-marker"]',
    );
    expect(markers).toHaveLength(PSY_CLOSES.length - 4);
  });
  it('renders both panel labels', () => {
    const { container } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-psy-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });
  it('shows the period in the config badge', () => {
    const { container } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-psy-badge-config"]',
    );
    expect(cfg?.textContent).toBe('4');
  });
  it('toggles the Psychological Line off via its legend item', () => {
    const { container } = render(<ChartLinePsy data={PSY_DATA} {...OPTS} />);
    const psyItem = container.querySelector(
      '[data-section="chart-line-psy-legend-item"][data-series-id="psy"]',
    ) as HTMLElement;
    fireEvent.click(psyItem);
    expect(
      container.querySelector('[data-section="chart-line-psy-psy-line"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLinePsy data={PSY_DATA} {...OPTS} hiddenSeries={new Set(['price'])} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-psy-price-path"]'),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePsy ref={ref} data={PSY_DATA} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
