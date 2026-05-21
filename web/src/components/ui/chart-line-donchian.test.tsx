import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDonchian,
  getLineDonchianFinitePoints,
  normalizeLineDonchianPeriod,
  computeLineDonchianUpper,
  computeLineDonchianLower,
  computeLineDonchianMiddle,
  runLineDonchian,
  computeLineDonchianLayout,
  describeLineDonchianChart,
  DEFAULT_CHART_LINE_DONCHIAN_PERIOD,
  type ChartLineDonchianPoint,
} from './chart-line-donchian';

afterEach(() => cleanup());

// Integer OHLC bars: the Donchian Channel is a rolling max of the
// high and a rolling min of the low, so the whole pipeline is
// exact. The closes are placed above and below the channel
// midpoint -- and one exactly on it -- to exercise every zone.
const DONCHIAN_BARS: ChartLineDonchianPoint[] = [
  { x: 0, high: 20, low: 10, close: 15 },
  { x: 1, high: 22, low: 12, close: 20 },
  { x: 2, high: 24, low: 14, close: 16 },
  { x: 3, high: 22, low: 12, close: 21 },
  { x: 4, high: 20, low: 8, close: 10 },
  { x: 5, high: 18, low: 10, close: 17 },
  { x: 6, high: 26, low: 16, close: 25 },
  { x: 7, high: 24, low: 18, close: 20 },
  { x: 8, high: 20, low: 12, close: 13 },
  { x: 9, high: 22, low: 14, close: 18 },
];
const OPTS = { period: 3 };

const UPPER_EXPECTED = [null, null, 24, 24, 24, 22, 26, 26, 26, 24];
const LOWER_EXPECTED = [null, null, 10, 12, 8, 8, 8, 10, 12, 12];
const MIDDLE_EXPECTED = [null, null, 17, 18, 16, 15, 17, 18, 19, 18];
const ZONE_EXPECTED = [
  'none',
  'none',
  'lower',
  'upper',
  'lower',
  'upper',
  'upper',
  'upper',
  'lower',
  'mid',
];

describe('getLineDonchianFinitePoints', () => {
  it('keeps only bars with a finite x, high, low and close', () => {
    const points = [
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 1, high: Number.NaN, low: 3, close: 4 },
      { x: 2, high: 5, low: 3, close: Number.POSITIVE_INFINITY },
      { x: 3, high: 9, low: 7, close: 8 },
    ] as ChartLineDonchianPoint[];
    expect(getLineDonchianFinitePoints(points)).toEqual([
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 3, high: 9, low: 7, close: 8 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineDonchianFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineDonchianFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, high: 2, low: 1, close: 1.5 },
      { x: 2, high: 4, low: 3, close: 3.5 },
    ] as ChartLineDonchianPoint[];
    expect(getLineDonchianFinitePoints(points)).toEqual(points);
  });
});

describe('normalizeLineDonchianPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineDonchianPeriod(20, 99)).toBe(20);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineDonchianPeriod(3.8, 99)).toBe(3);
  });
  it('rejects a period below 2', () => {
    expect(normalizeLineDonchianPeriod(1, 99)).toBe(99);
  });
  it('rejects a zero period', () => {
    expect(normalizeLineDonchianPeriod(0, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLineDonchianPeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 2', () => {
    expect(normalizeLineDonchianPeriod(2, 99)).toBe(2);
  });
});

describe('computeLineDonchianUpper', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineDonchianUpper(null, 3)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(computeLineDonchianUpper(DONCHIAN_BARS, 3).slice(0, 2)).toEqual([
      null,
      null,
    ]);
  });
  it('takes the highest high of the trailing window', () => {
    expect(
      computeLineDonchianUpper(
        [
          { x: 0, high: 5, low: 1, close: 3 },
          { x: 1, high: 8, low: 2, close: 6 },
          { x: 2, high: 6, low: 3, close: 5 },
        ],
        2,
      ),
    ).toEqual([null, 8, 8]);
  });
  it('computes the exact upper band series', () => {
    expect(computeLineDonchianUpper(DONCHIAN_BARS, 3)).toEqual(UPPER_EXPECTED);
  });
  it('matches the input length', () => {
    expect(computeLineDonchianUpper(DONCHIAN_BARS, 3)).toHaveLength(
      DONCHIAN_BARS.length,
    );
  });
});

describe('computeLineDonchianLower', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineDonchianLower(null, 3)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(computeLineDonchianLower(DONCHIAN_BARS, 3).slice(0, 2)).toEqual([
      null,
      null,
    ]);
  });
  it('takes the lowest low of the trailing window', () => {
    expect(
      computeLineDonchianLower(
        [
          { x: 0, high: 5, low: 1, close: 3 },
          { x: 1, high: 8, low: 2, close: 6 },
          { x: 2, high: 6, low: 3, close: 5 },
        ],
        2,
      ),
    ).toEqual([null, 1, 2]);
  });
  it('computes the exact lower band series', () => {
    expect(computeLineDonchianLower(DONCHIAN_BARS, 3)).toEqual(LOWER_EXPECTED);
  });
  it('matches the input length', () => {
    expect(computeLineDonchianLower(DONCHIAN_BARS, 3)).toHaveLength(
      DONCHIAN_BARS.length,
    );
  });
});

describe('computeLineDonchianMiddle', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineDonchianMiddle(null, 3)).toEqual([]);
  });
  it('is the midpoint of the upper and lower bands', () => {
    expect(
      computeLineDonchianMiddle(
        [
          { x: 0, high: 5, low: 1, close: 3 },
          { x: 1, high: 8, low: 2, close: 6 },
          { x: 2, high: 6, low: 3, close: 5 },
        ],
        2,
      ),
    ).toEqual([null, 4.5, 5]);
  });
  it('computes the exact middle band series', () => {
    expect(computeLineDonchianMiddle(DONCHIAN_BARS, 3)).toEqual(
      MIDDLE_EXPECTED,
    );
  });
  it('matches the input length', () => {
    expect(computeLineDonchianMiddle(DONCHIAN_BARS, 3)).toHaveLength(
      DONCHIAN_BARS.length,
    );
  });
});

describe('runLineDonchian', () => {
  it('is not ok with fewer than two bars', () => {
    expect(
      runLineDonchian([{ x: 0, high: 2, low: 1, close: 1.5 }], OPTS).ok,
    ).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineDonchian(DONCHIAN_BARS, OPTS).ok).toBe(true);
  });
  it('carries the resolved period', () => {
    expect(runLineDonchian(DONCHIAN_BARS, OPTS).period).toBe(3);
  });
  it('falls back to the default period', () => {
    expect(runLineDonchian(DONCHIAN_BARS).period).toBe(
      DEFAULT_CHART_LINE_DONCHIAN_PERIOD,
    );
  });
  it('exposes the exact upper, lower and middle band series', () => {
    const run = runLineDonchian(DONCHIAN_BARS, OPTS);
    expect(run.upper).toEqual(UPPER_EXPECTED);
    expect(run.lower).toEqual(LOWER_EXPECTED);
    expect(run.middle).toEqual(MIDDLE_EXPECTED);
  });
  it('classifies each bar by the close against the midline', () => {
    expect(runLineDonchian(DONCHIAN_BARS, OPTS).samples.map((s) => s.zone)).toEqual(
      ZONE_EXPECTED,
    );
  });
  it('returns one sample per bar', () => {
    expect(runLineDonchian(DONCHIAN_BARS, OPTS).samples).toHaveLength(
      DONCHIAN_BARS.length,
    );
  });
  it('counts the upper, lower and mid bars', () => {
    const run = runLineDonchian(DONCHIAN_BARS, OPTS);
    expect(run.upperCount).toBe(4);
    expect(run.lowerCount).toBe(3);
    expect(run.midCount).toBe(1);
  });
  it('reports the final band readings', () => {
    const run = runLineDonchian(DONCHIAN_BARS, OPTS);
    expect(run.upperFinal).toBe(24);
    expect(run.lowerFinal).toBe(12);
    expect(run.middleFinal).toBe(18);
  });
  it('keeps the close within the channel bounds', () => {
    const run = runLineDonchian(DONCHIAN_BARS, OPTS);
    for (const s of run.samples) {
      if (s.upper !== null && s.lower !== null) {
        expect(s.close).toBeLessThanOrEqual(s.upper);
        expect(s.close).toBeGreaterThanOrEqual(s.lower);
      }
    }
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...DONCHIAN_BARS].reverse();
    const run = runLineDonchian(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineDonchianLayout', () => {
  const base = {
    data: DONCHIAN_BARS,
    period: 3,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single bar', () => {
    expect(
      computeLineDonchianLayout({
        ...base,
        data: [{ x: 0, high: 2, low: 1, close: 1.5 }],
      }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineDonchianLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineDonchianLayout(base).ok).toBe(true);
  });
  it('builds the price, upper, lower and middle paths', () => {
    const layout = computeLineDonchianLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.upperPath.length).toBeGreaterThan(0);
    expect(layout.lowerPath.length).toBeGreaterThan(0);
    expect(layout.middlePath.length).toBeGreaterThan(0);
  });
  it('builds a closed channel area path', () => {
    const layout = computeLineDonchianLayout(base);
    expect(layout.channelArea.length).toBeGreaterThan(0);
    expect(layout.channelArea.endsWith('Z')).toBe(true);
  });
  it('spans the y-domain across the price and the bands', () => {
    const layout = computeLineDonchianLayout(base);
    expect(layout.yMin).toBe(8);
    expect(layout.yMax).toBe(26);
  });
  it('emits one marker per classified bar', () => {
    const layout = computeLineDonchianLayout(base);
    expect(layout.markers).toHaveLength(8);
    expect(layout.priceDots).toHaveLength(DONCHIAN_BARS.length);
  });
  it('reports the total bar count and final readings', () => {
    const layout = computeLineDonchianLayout(base);
    expect(layout.totalPoints).toBe(DONCHIAN_BARS.length);
    expect(layout.upperFinal).toBe(24);
  });
});

describe('describeLineDonchianChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineDonchianChart([])).toBe('No data');
  });
  it('names the Donchian Channel', () => {
    expect(describeLineDonchianChart(DONCHIAN_BARS, OPTS)).toContain(
      'Donchian Channel',
    );
  });
  it('explains the highest high and lowest low bands', () => {
    const desc = describeLineDonchianChart(DONCHIAN_BARS, OPTS);
    expect(desc).toContain('highest high');
    expect(desc).toContain('lowest low');
  });
  it('reports the zone counts', () => {
    expect(describeLineDonchianChart(DONCHIAN_BARS, OPTS)).toContain(
      'upper half of the channel on 4 bars',
    );
  });
});

describe('ChartLineDonchian', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} ariaLabel="DC demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('DC demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineDonchian data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-donchian"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the period and final bands as data attributes', () => {
    const { container } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian"]',
    );
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-upper-final')).toBe('24');
  });
  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-donchian-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the upper, lower and middle bands', () => {
    const { container } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-donchian-upper-path"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-donchian-lower-path"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-middle-path"]',
      ),
    ).toBeTruthy();
  });
  it('draws the channel fill area', () => {
    const { container } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-channel-area"]',
      ),
    ).toBeTruthy();
  });
  it('renders one marker per classified bar', () => {
    const { container } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-donchian-marker"]',
    );
    expect(markers).toHaveLength(8);
  });
  it('shows the period in the config badge', () => {
    const { container } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    const cfg = container.querySelector(
      '[data-section="chart-line-donchian-badge-config"]',
    );
    expect(cfg?.textContent).toBe('3');
  });
  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-donchian-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });
  it('toggles the channel off when its legend item is clicked', () => {
    const { container } = render(
      <ChartLineDonchian data={DONCHIAN_BARS} {...OPTS} />,
    );
    const channelItem = container.querySelector(
      '[data-section="chart-line-donchian-legend-item"][data-series-id="channel"]',
    ) as HTMLElement;
    fireEvent.click(channelItem);
    expect(
      container.querySelector('[data-section="chart-line-donchian-upper-path"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineDonchian
        data={DONCHIAN_BARS}
        {...OPTS}
        hiddenSeries={new Set(['middle'])}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-middle-path"]',
      ),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDonchian ref={ref} data={DONCHIAN_BARS} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
