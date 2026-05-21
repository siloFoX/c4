import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStarc,
  getLineStarcFinitePoints,
  normalizeLineStarcPeriod,
  normalizeLineStarcMultiplier,
  computeLineStarcSma,
  computeLineStarcAtr,
  computeLineStarc,
  runLineStarc,
  computeLineStarcLayout,
  describeLineStarcChart,
  DEFAULT_CHART_LINE_STARC_MA_PERIOD,
  DEFAULT_CHART_LINE_STARC_ATR_PERIOD,
  type ChartLineStarcPoint,
} from './chart-line-starc';

afterEach(() => cleanup());

// Closes that step by exactly +/-6 keep the close-to-close true
// range a constant 6, so the Wilder ATR settles at exactly 6.
// Every three-bar window sums to a multiple of three, so the
// moving average is an exact integer. With a 0.5 multiplier the
// close walks above, below and inside the channel.
const STARC_CLOSES = [60, 66, 72, 66, 60, 66, 72, 78, 72, 66, 60, 54];
const STARC_DATA: ChartLineStarcPoint[] = STARC_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = { maPeriod: 3, atrPeriod: 4, multiplier: 0.5 };

const MIDDLE_EXPECTED = [
  null, null, 66, 68, 66, 64, 66, 72, 74, 72, 66, 60,
];
const ATR_EXPECTED = [
  null, null, null, null, 6, 6, 6, 6, 6, 6, 6, 6,
];
const UPPER_EXPECTED = [
  null, null, null, null, 69, 67, 69, 75, 77, 75, 69, 63,
];
const LOWER_EXPECTED = [
  null, null, null, null, 63, 61, 63, 69, 71, 69, 63, 57,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'none',
  'below',
  'inside',
  'above',
  'above',
  'inside',
  'below',
  'below',
  'below',
];

describe('getLineStarcFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineStarcPoint[];
    expect(getLineStarcFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineStarcFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineStarcFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, value: 1 },
      { x: 2, value: 2 },
    ] as ChartLineStarcPoint[];
    expect(getLineStarcFinitePoints(points)).toEqual(points);
  });
});

describe('normalizeLineStarcPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineStarcPeriod(6, 99)).toBe(6);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineStarcPeriod(4.8, 99)).toBe(4);
  });
  it('rejects a period below 2', () => {
    expect(normalizeLineStarcPeriod(1, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLineStarcPeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 2', () => {
    expect(normalizeLineStarcPeriod(2, 99)).toBe(2);
  });
});

describe('normalizeLineStarcMultiplier', () => {
  it('keeps a valid multiplier', () => {
    expect(normalizeLineStarcMultiplier(2, 99)).toBe(2);
  });
  it('keeps a fractional multiplier unchanged', () => {
    expect(normalizeLineStarcMultiplier(0.5, 99)).toBe(0.5);
  });
  it('rejects a zero multiplier', () => {
    expect(normalizeLineStarcMultiplier(0, 99)).toBe(99);
  });
  it('rejects a negative or non-finite multiplier', () => {
    expect(normalizeLineStarcMultiplier(-1, 99)).toBe(99);
    expect(normalizeLineStarcMultiplier(Number.NaN, 99)).toBe(99);
  });
});

describe('computeLineStarcSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineStarcSma(null, 3)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(computeLineStarcSma(STARC_CLOSES, 3).slice(0, 2)).toEqual([
      null,
      null,
    ]);
  });
  it('is the simple moving average of the close', () => {
    expect(computeLineStarcSma([3, 6, 9, 12], 2)).toEqual([
      null,
      4.5,
      7.5,
      10.5,
    ]);
  });
  it('computes the exact moving average series', () => {
    expect(computeLineStarcSma(STARC_CLOSES, 3)).toEqual(MIDDLE_EXPECTED);
  });
  it('matches the input length', () => {
    expect(computeLineStarcSma(STARC_CLOSES, 3)).toHaveLength(
      STARC_CLOSES.length,
    );
  });
});

describe('computeLineStarcAtr', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineStarcAtr(null, 4)).toEqual([]);
  });
  it('is all null when the series is shorter than the window', () => {
    expect(computeLineStarcAtr([1, 2, 3], 4)).toEqual([null, null, null]);
  });
  it('applies Wilder smoothing after the seed', () => {
    expect(computeLineStarcAtr([0, 2, 2, 4, 4], 2)).toEqual([
      null,
      null,
      1,
      1.5,
      0.75,
    ]);
  });
  it('settles at the constant true range for the fixture', () => {
    expect(computeLineStarcAtr(STARC_CLOSES, 4)).toEqual(ATR_EXPECTED);
  });
  it('matches the input length', () => {
    expect(computeLineStarcAtr(STARC_CLOSES, 4)).toHaveLength(
      STARC_CLOSES.length,
    );
  });
});

describe('computeLineStarc', () => {
  it('returns empty bands for a non-array input', () => {
    expect(computeLineStarc(null, 3, 4, 0.5)).toEqual({
      middle: [],
      upper: [],
      lower: [],
    });
  });
  it('places the middle band at the moving average', () => {
    expect(computeLineStarc(STARC_CLOSES, 3, 4, 0.5).middle).toEqual(
      MIDDLE_EXPECTED,
    );
  });
  it('places the upper band above and the lower band below', () => {
    const bands = computeLineStarc(STARC_CLOSES, 3, 4, 0.5);
    expect(bands.upper).toEqual(UPPER_EXPECTED);
    expect(bands.lower).toEqual(LOWER_EXPECTED);
  });
  it('is null until both the moving average and ATR exist', () => {
    const bands = computeLineStarc(STARC_CLOSES, 3, 4, 0.5);
    expect(bands.upper.slice(0, 4)).toEqual([null, null, null, null]);
  });
  it('widens the channel with a larger multiplier', () => {
    const narrow = computeLineStarc(STARC_CLOSES, 3, 4, 0.5);
    const wide = computeLineStarc(STARC_CLOSES, 3, 4, 1);
    expect(wide.upper[4]!).toBeGreaterThan(narrow.upper[4]!);
    expect(wide.lower[4]!).toBeLessThan(narrow.lower[4]!);
  });
  it('matches the input length', () => {
    expect(computeLineStarc(STARC_CLOSES, 3, 4, 0.5).upper).toHaveLength(
      STARC_CLOSES.length,
    );
  });
});

describe('runLineStarc', () => {
  it('is not ok with fewer than two points', () => {
    expect(runLineStarc([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineStarc(STARC_DATA, OPTS).ok).toBe(true);
  });
  it('carries the resolved periods and multiplier', () => {
    const run = runLineStarc(STARC_DATA, OPTS);
    expect(run.maPeriod).toBe(3);
    expect(run.atrPeriod).toBe(4);
    expect(run.multiplier).toBe(0.5);
  });
  it('falls back to the default periods', () => {
    const run = runLineStarc(STARC_DATA);
    expect(run.maPeriod).toBe(DEFAULT_CHART_LINE_STARC_MA_PERIOD);
    expect(run.atrPeriod).toBe(DEFAULT_CHART_LINE_STARC_ATR_PERIOD);
  });
  it('exposes the exact middle, upper and lower band series', () => {
    const run = runLineStarc(STARC_DATA, OPTS);
    expect(run.middle).toEqual(MIDDLE_EXPECTED);
    expect(run.upper).toEqual(UPPER_EXPECTED);
    expect(run.lower).toEqual(LOWER_EXPECTED);
  });
  it('classifies each bar against the channel', () => {
    expect(runLineStarc(STARC_DATA, OPTS).samples.map((s) => s.zone)).toEqual(
      ZONE_EXPECTED,
    );
  });
  it('returns one sample per point', () => {
    expect(runLineStarc(STARC_DATA, OPTS).samples).toHaveLength(
      STARC_DATA.length,
    );
  });
  it('counts the above, below and inside bars', () => {
    const run = runLineStarc(STARC_DATA, OPTS);
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(4);
    expect(run.insideCount).toBe(2);
  });
  it('reports the final band readings', () => {
    const run = runLineStarc(STARC_DATA, OPTS);
    expect(run.middleFinal).toBe(60);
    expect(run.upperFinal).toBe(63);
    expect(run.lowerFinal).toBe(57);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...STARC_DATA].reverse();
    const run = runLineStarc(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineStarcLayout', () => {
  const base = {
    data: STARC_DATA,
    maPeriod: 3,
    atrPeriod: 4,
    multiplier: 0.5,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single point', () => {
    expect(
      computeLineStarcLayout({ ...base, data: [{ x: 0, value: 1 }] }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineStarcLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineStarcLayout(base).ok).toBe(true);
  });
  it('builds the price, upper, lower and middle paths', () => {
    const layout = computeLineStarcLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.upperPath.length).toBeGreaterThan(0);
    expect(layout.lowerPath.length).toBeGreaterThan(0);
    expect(layout.middlePath.length).toBeGreaterThan(0);
  });
  it('builds a closed channel area path', () => {
    const layout = computeLineStarcLayout(base);
    expect(layout.channelArea.length).toBeGreaterThan(0);
    expect(layout.channelArea.endsWith('Z')).toBe(true);
  });
  it('spans the y-domain across the price and the bands', () => {
    const layout = computeLineStarcLayout(base);
    expect(layout.yMin).toBe(54);
    expect(layout.yMax).toBe(78);
  });
  it('emits one marker per classified bar', () => {
    const layout = computeLineStarcLayout(base);
    expect(layout.markers).toHaveLength(8);
    expect(layout.priceDots).toHaveLength(STARC_CLOSES.length);
  });
  it('reports the total point count and final readings', () => {
    const layout = computeLineStarcLayout(base);
    expect(layout.totalPoints).toBe(STARC_CLOSES.length);
    expect(layout.upperFinal).toBe(63);
  });
});

describe('describeLineStarcChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineStarcChart([])).toBe('No data');
  });
  it('names the STARC Bands', () => {
    expect(describeLineStarcChart(STARC_DATA, OPTS)).toContain('STARC Bands');
  });
  it('explains the ATR bands around a moving average', () => {
    const desc = describeLineStarcChart(STARC_DATA, OPTS);
    expect(desc).toContain('average true range');
    expect(desc).toContain('moving average');
  });
  it('reports the zone counts', () => {
    expect(describeLineStarcChart(STARC_DATA, OPTS)).toContain(
      'above the upper band on 2 bars',
    );
  });
});

describe('ChartLineStarc', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineStarc data={STARC_DATA} {...OPTS} ariaLabel="STARC demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('STARC demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineStarc data={[]} />);
    const root = container.querySelector('[data-section="chart-line-starc"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-starc"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the periods and multiplier as data attributes', () => {
    const { container } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-starc"]');
    expect(root?.getAttribute('data-ma-period')).toBe('3');
    expect(root?.getAttribute('data-atr-period')).toBe('4');
    expect(root?.getAttribute('data-multiplier')).toBe('0.5');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    const svg = container.querySelector('[data-section="chart-line-starc-svg"]');
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the upper, lower and middle bands', () => {
    const { container } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-starc-upper-path"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-starc-lower-path"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-starc-middle-path"]'),
    ).toBeTruthy();
  });
  it('draws the channel fill area', () => {
    const { container } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-starc-channel-area"]'),
    ).toBeTruthy();
  });
  it('renders one marker per classified bar', () => {
    const { container } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-starc-marker"]',
    );
    expect(markers).toHaveLength(8);
  });
  it('shows the periods in the config badge', () => {
    const { container } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-starc-badge-config"]',
    );
    expect(cfg?.textContent).toBe('3/4');
  });
  it('renders three legend items', () => {
    const { container } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-starc-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });
  it('toggles the bands off when the legend item is clicked', () => {
    const { container } = render(<ChartLineStarc data={STARC_DATA} {...OPTS} />);
    const bandsItem = container.querySelector(
      '[data-section="chart-line-starc-legend-item"][data-series-id="bands"]',
    ) as HTMLElement;
    fireEvent.click(bandsItem);
    expect(
      container.querySelector('[data-section="chart-line-starc-upper-path"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineStarc
        data={STARC_DATA}
        {...OPTS}
        hiddenSeries={new Set(['middle'])}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-starc-middle-path"]'),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStarc ref={ref} data={STARC_DATA} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
