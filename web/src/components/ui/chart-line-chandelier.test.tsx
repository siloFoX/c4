import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineChandelier,
  getLineChandelierFinitePoints,
  normalizeLineChandelierPeriod,
  normalizeLineChandelierMultiplier,
  computeLineChandelierTrueRanges,
  computeLineChandelierAtr,
  computeLineChandelierRollingMax,
  computeLineChandelierRollingMin,
  computeLineChandelierExit,
  runLineChandelier,
  computeLineChandelierLayout,
  describeLineChandelierChart,
  DEFAULT_CHART_LINE_CHANDELIER_PERIOD,
  DEFAULT_CHART_LINE_CHANDELIER_MULTIPLIER,
  type ChartLineChandelierPoint,
} from './chart-line-chandelier';

afterEach(() => cleanup());

// Every close steps by exactly +/-10, so the close-to-close true
// range is a constant 10 and the Wilder ATR settles at exactly 10
// -- which keeps the whole Chandelier Exit pipeline on exact
// integers (asserted with toEqual). The price ramps up to 50,
// crashes to 0, then ramps to 60.
const CHAN_CLOSES = [
  0, 10, 20, 30, 40, 50, 40, 30, 20, 10, 0, 10, 20, 30, 40, 50, 60,
];
const CHAN_DATA: ChartLineChandelierPoint[] = CHAN_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = { period: 5, multiplier: 3 };

const TR_EXPECTED = [
  null, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
];
const ATR_EXPECTED = [
  null, null, null, null, null, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
  10,
];
const HIGH_EXPECTED = [
  null, null, null, null, 40, 50, 50, 50, 50, 50, 40, 30, 20, 30, 40, 50, 60,
];
const LOW_EXPECTED = [
  null, null, null, null, 0, 10, 20, 30, 20, 10, 0, 0, 0, 0, 0, 10, 20,
];
const LONG_EXPECTED = [
  null, null, null, null, null, 20, 20, 20, 20, 20, 10, 0, -10, 0, 10, 20, 30,
];
const SHORT_EXPECTED = [
  null, null, null, null, null, 40, 50, 60, 50, 40, 30, 30, 30, 30, 30, 40,
  50,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'none',
  'none',
  'above',
  'inside',
  'inside',
  'inside',
  'below',
  'below',
  'inside',
  'inside',
  'inside',
  'above',
  'above',
  'above',
];

describe('normalizeLineChandelierPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineChandelierPeriod(22, 99)).toBe(22);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineChandelierPeriod(5.7, 99)).toBe(5);
  });
  it('rejects a period below 2', () => {
    expect(normalizeLineChandelierPeriod(1, 99)).toBe(99);
  });
  it('rejects a zero period', () => {
    expect(normalizeLineChandelierPeriod(0, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLineChandelierPeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 2', () => {
    expect(normalizeLineChandelierPeriod(2, 99)).toBe(2);
  });
});

describe('normalizeLineChandelierMultiplier', () => {
  it('keeps a valid multiplier', () => {
    expect(normalizeLineChandelierMultiplier(3, 99)).toBe(3);
  });
  it('keeps a fractional multiplier unchanged', () => {
    expect(normalizeLineChandelierMultiplier(2.5, 99)).toBe(2.5);
  });
  it('rejects a zero multiplier', () => {
    expect(normalizeLineChandelierMultiplier(0, 99)).toBe(99);
  });
  it('rejects a negative multiplier', () => {
    expect(normalizeLineChandelierMultiplier(-1, 99)).toBe(99);
  });
  it('rejects a non-finite multiplier', () => {
    expect(normalizeLineChandelierMultiplier(Number.NaN, 99)).toBe(99);
    expect(normalizeLineChandelierMultiplier(Number.POSITIVE_INFINITY, 99)).toBe(
      99,
    );
  });
});

describe('getLineChandelierFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineChandelierPoint[];
    expect(getLineChandelierFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineChandelierFinitePoints(null)).toEqual([]);
    expect(getLineChandelierFinitePoints(undefined)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineChandelierFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, value: 1 },
      { x: 2, value: 2 },
    ] as ChartLineChandelierPoint[];
    expect(getLineChandelierFinitePoints(points)).toEqual(points);
  });
});

describe('computeLineChandelierTrueRanges', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineChandelierTrueRanges(null)).toEqual([]);
  });
  it('leaves index 0 null with no prior close', () => {
    expect(computeLineChandelierTrueRanges([10, 13, 9])[0]).toBeNull();
  });
  it('is the absolute close-to-close change', () => {
    expect(computeLineChandelierTrueRanges([10, 13, 9, 9, 15])).toEqual([
      null,
      3,
      4,
      0,
      6,
    ]);
  });
  it('matches the input length', () => {
    expect(computeLineChandelierTrueRanges(CHAN_CLOSES)).toHaveLength(
      CHAN_CLOSES.length,
    );
  });
  it('is a constant 10 for the equal-step fixture', () => {
    expect(computeLineChandelierTrueRanges(CHAN_CLOSES)).toEqual(TR_EXPECTED);
  });
});

describe('computeLineChandelierAtr', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineChandelierAtr(null, 5)).toEqual([]);
  });
  it('is all null when the series is shorter than the window', () => {
    expect(computeLineChandelierAtr([1, 2, 3], 5)).toEqual([
      null,
      null,
      null,
    ]);
  });
  it('seeds with the simple mean of the first period true ranges', () => {
    expect(computeLineChandelierAtr([0, 10, 20, 30, 40, 50], 3)).toEqual([
      null,
      null,
      null,
      10,
      10,
      10,
    ]);
  });
  it('applies Wilder smoothing after the seed', () => {
    expect(computeLineChandelierAtr([0, 2, 2, 4, 4], 2)).toEqual([
      null,
      null,
      1,
      1.5,
      0.75,
    ]);
  });
  it('settles at the constant true range for the fixture', () => {
    expect(computeLineChandelierAtr(CHAN_CLOSES, 5)).toEqual(ATR_EXPECTED);
  });
  it('matches the input length', () => {
    expect(computeLineChandelierAtr(CHAN_CLOSES, 5)).toHaveLength(
      CHAN_CLOSES.length,
    );
  });
});

describe('computeLineChandelierRollingMax', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineChandelierRollingMax(null, 3)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(
      computeLineChandelierRollingMax([5, 3, 8, 1], 3).slice(0, 2),
    ).toEqual([null, null]);
  });
  it('takes the highest close of the trailing window', () => {
    expect(computeLineChandelierRollingMax([5, 3, 8, 1, 9, 2], 3)).toEqual([
      null,
      null,
      8,
      8,
      9,
      9,
    ]);
  });
  it('tracks the highest close for the fixture', () => {
    expect(computeLineChandelierRollingMax(CHAN_CLOSES, 5)).toEqual(
      HIGH_EXPECTED,
    );
  });
});

describe('computeLineChandelierRollingMin', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineChandelierRollingMin(null, 3)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(
      computeLineChandelierRollingMin([5, 3, 8, 1], 3).slice(0, 2),
    ).toEqual([null, null]);
  });
  it('takes the lowest close of the trailing window', () => {
    expect(computeLineChandelierRollingMin([5, 3, 8, 1, 9, 2], 3)).toEqual([
      null,
      null,
      3,
      1,
      1,
      1,
    ]);
  });
  it('tracks the lowest close for the fixture', () => {
    expect(computeLineChandelierRollingMin(CHAN_CLOSES, 5)).toEqual(
      LOW_EXPECTED,
    );
  });
});

describe('computeLineChandelierExit', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineChandelierExit(null, 5, 3)).toEqual({
      long: [],
      short: [],
    });
  });
  it('hangs the long exit below the highest close', () => {
    expect(computeLineChandelierExit(CHAN_CLOSES, 5, 3).long).toEqual(
      LONG_EXPECTED,
    );
  });
  it('places the short exit above the lowest close', () => {
    expect(computeLineChandelierExit(CHAN_CLOSES, 5, 3).short).toEqual(
      SHORT_EXPECTED,
    );
  });
  it('is null until the ATR window is full', () => {
    const exit = computeLineChandelierExit(CHAN_CLOSES, 5, 3);
    expect(exit.long.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(exit.short.slice(0, 5)).toEqual([null, null, null, null, null]);
  });
  it('widens the channel with a larger multiplier', () => {
    const narrow = computeLineChandelierExit(CHAN_CLOSES, 5, 1);
    const wide = computeLineChandelierExit(CHAN_CLOSES, 5, 5);
    expect(wide.long[16]!).toBeLessThan(narrow.long[16]!);
    expect(wide.short[16]!).toBeGreaterThan(narrow.short[16]!);
  });
  it('matches the input length', () => {
    const exit = computeLineChandelierExit(CHAN_CLOSES, 5, 3);
    expect(exit.long).toHaveLength(CHAN_CLOSES.length);
    expect(exit.short).toHaveLength(CHAN_CLOSES.length);
  });
});

describe('runLineChandelier', () => {
  it('is not ok with fewer than two points', () => {
    expect(runLineChandelier([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineChandelier(CHAN_DATA, OPTS).ok).toBe(true);
  });
  it('carries the resolved period and multiplier', () => {
    const run = runLineChandelier(CHAN_DATA, OPTS);
    expect(run.period).toBe(5);
    expect(run.multiplier).toBe(3);
  });
  it('falls back to the default options', () => {
    const run = runLineChandelier(CHAN_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_CHANDELIER_PERIOD);
    expect(run.multiplier).toBe(DEFAULT_CHART_LINE_CHANDELIER_MULTIPLIER);
  });
  it('exposes the exact true range and ATR series', () => {
    const run = runLineChandelier(CHAN_DATA, OPTS);
    expect(run.trueRange).toEqual(TR_EXPECTED);
    expect(run.atr).toEqual(ATR_EXPECTED);
  });
  it('exposes the exact highest and lowest close series', () => {
    const run = runLineChandelier(CHAN_DATA, OPTS);
    expect(run.highestClose).toEqual(HIGH_EXPECTED);
    expect(run.lowestClose).toEqual(LOW_EXPECTED);
  });
  it('exposes the exact long and short exit series', () => {
    const run = runLineChandelier(CHAN_DATA, OPTS);
    expect(run.longExit).toEqual(LONG_EXPECTED);
    expect(run.shortExit).toEqual(SHORT_EXPECTED);
  });
  it('classifies each bar against the exit channel', () => {
    const run = runLineChandelier(CHAN_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });
  it('returns one sample per point', () => {
    expect(runLineChandelier(CHAN_DATA, OPTS).samples).toHaveLength(
      CHAN_DATA.length,
    );
  });
  it('counts the above, below and inside zones', () => {
    const run = runLineChandelier(CHAN_DATA, OPTS);
    expect(run.aboveCount).toBe(4);
    expect(run.belowCount).toBe(2);
    expect(run.insideCount).toBe(6);
  });
  it('reports the final long and short exit readings', () => {
    const run = runLineChandelier(CHAN_DATA, OPTS);
    expect(run.longExitFinal).toBe(30);
    expect(run.shortExitFinal).toBe(50);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...CHAN_DATA].reverse();
    const run = runLineChandelier(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineChandelierLayout', () => {
  const base = {
    data: CHAN_DATA,
    period: 5,
    multiplier: 3,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single point', () => {
    expect(
      computeLineChandelierLayout({ ...base, data: [{ x: 0, value: 1 }] }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineChandelierLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineChandelierLayout(base).ok).toBe(true);
  });
  it('builds price, long and short exit paths', () => {
    const layout = computeLineChandelierLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.longExitPath.length).toBeGreaterThan(0);
    expect(layout.shortExitPath.length).toBeGreaterThan(0);
  });
  it('spans the y-domain across price and both exits', () => {
    const layout = computeLineChandelierLayout(base);
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(60);
  });
  it('emits one marker per classified bar', () => {
    const layout = computeLineChandelierLayout(base);
    expect(layout.markers).toHaveLength(12);
    expect(layout.priceDots).toHaveLength(CHAN_CLOSES.length);
  });
  it('reports the total point count', () => {
    expect(computeLineChandelierLayout(base).totalPoints).toBe(
      CHAN_CLOSES.length,
    );
  });
  it('carries the final exit readings', () => {
    const layout = computeLineChandelierLayout(base);
    expect(layout.longExitFinal).toBe(30);
    expect(layout.shortExitFinal).toBe(50);
  });
});

describe('describeLineChandelierChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineChandelierChart([])).toBe('No data');
  });
  it('names the Chandelier Exit', () => {
    expect(describeLineChandelierChart(CHAN_DATA, OPTS)).toContain(
      'Chandelier Exit',
    );
  });
  it('explains the average true range trailing stop', () => {
    const desc = describeLineChandelierChart(CHAN_DATA, OPTS);
    expect(desc).toContain('average true range');
    expect(desc).toContain('trailing');
    expect(desc).toContain('highest close');
  });
  it('reports the zone counts', () => {
    const desc = describeLineChandelierChart(CHAN_DATA, OPTS);
    expect(desc).toContain('above the short stop on 4 bars');
  });
});

describe('ChartLineChandelier', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} />,
    );
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} ariaLabel="CE demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('CE demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineChandelier data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-chandelier"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chandelier"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the period and multiplier as data attributes', () => {
    const { container } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chandelier"]',
    );
    expect(root?.getAttribute('data-period')).toBe('5');
    expect(root?.getAttribute('data-multiplier')).toBe('3');
  });
  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-chandelier-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the long and short exit lines', () => {
    const { container } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chandelier-long-exit-path"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-chandelier-short-exit-path"]',
      ),
    ).toBeTruthy();
  });
  it('renders one marker per classified bar', () => {
    const { container } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-chandelier-marker"]',
    );
    expect(markers).toHaveLength(12);
  });
  it('shows the period and multiplier in the config badge', () => {
    const { container } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} />,
    );
    const cfg = container.querySelector(
      '[data-section="chart-line-chandelier-badge-config"]',
    );
    expect(cfg?.textContent).toBe('5x3');
  });
  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-chandelier-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });
  it('toggles the long exit off when its legend item is clicked', () => {
    const { container } = render(
      <ChartLineChandelier data={CHAN_DATA} {...OPTS} />,
    );
    const longItem = container.querySelector(
      '[data-section="chart-line-chandelier-legend-item"][data-series-id="long"]',
    ) as HTMLElement;
    fireEvent.click(longItem);
    expect(
      container.querySelector(
        '[data-section="chart-line-chandelier-long-exit-path"]',
      ),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineChandelier
        data={CHAN_DATA}
        {...OPTS}
        hiddenSeries={new Set(['short'])}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chandelier-short-exit-path"]',
      ),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineChandelier ref={ref} data={CHAN_DATA} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
