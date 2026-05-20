import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineUltimate,
  computeLineUltimateBpTr,
  computeLineUltimateAvg,
  computeLineUltimate,
  computeLineUltimateLayout,
  normalizeLineUltimatePeriod,
  getLineUltimateFinitePoints,
  runLineUltimate,
  describeLineUltimateChart,
  DEFAULT_CHART_LINE_ULTIMATE_SHORT_PERIOD,
  DEFAULT_CHART_LINE_ULTIMATE_MEDIUM_PERIOD,
  DEFAULT_CHART_LINE_ULTIMATE_LONG_PERIOD,
  type ChartLineUltimatePoint,
} from './chart-line-ultimate';

afterEach(() => cleanup());

const ULTIMATE_DATA: ChartLineUltimatePoint[] = [
  { x: 0, high: 12, low: 8, close: 10 },
  { x: 1, high: 16, low: 8, close: 14 },
  { x: 2, high: 16, low: 10, close: 12 },
  { x: 3, high: 20, low: 10, close: 18 },
  { x: 4, high: 20, low: 12, close: 16 },
  { x: 5, high: 24, low: 14, close: 20 },
  { x: 6, high: 22, low: 12, close: 14 },
];

// Hand-verified for short 1, medium 2, long 3:
//   bp = close - min(low, prevClose) = [null,6,2,8,4,6,2]
//   tr = max(high, prevClose) - min(low, prevClose) = [null,8,6,10,8,10,10]
//   uo = 100 * (4*avg1 + 2*avg2 + avg3) / 7
//      = [.,.,.,73.0952,55.9524,59.3424,28.9796]
const RUN_OPTS = {
  shortPeriod: 1,
  mediumPeriod: 2,
  longPeriod: 3,
  upperThreshold: 70,
  lowerThreshold: 30,
};

describe('getLineUltimateFinitePoints', () => {
  it('keeps only points with finite x, high, low and close', () => {
    const points = getLineUltimateFinitePoints([
      { x: 0, high: 5, low: 1, close: 3 },
      { x: NaN, high: 5, low: 1, close: 3 },
      { x: 1, high: Infinity, low: 1, close: 3 },
      { x: 2, high: 5, low: 1, close: NaN },
      { x: 3, high: 9, low: 4, close: 7 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 3]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineUltimateFinitePoints(null)).toEqual([]);
    expect(getLineUltimateFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineUltimatePeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineUltimatePeriod(7, 7)).toBe(7);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineUltimatePeriod(14.6, 14)).toBe(14);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineUltimatePeriod(0, 7)).toBe(7);
    expect(normalizeLineUltimatePeriod(-3, 7)).toBe(7);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineUltimatePeriod(NaN, 7)).toBe(7);
    expect(normalizeLineUltimatePeriod(Infinity, 7)).toBe(7);
  });
});

describe('computeLineUltimateBpTr', () => {
  it('takes buying pressure and true range against the prior close', () => {
    const { bp, tr } = computeLineUltimateBpTr(
      [12, 16, 16],
      [8, 8, 10],
      [10, 14, 12],
    );
    expect(bp).toEqual([null, 6, 2]);
    expect(tr).toEqual([null, 8, 6]);
  });

  it('leaves the first bar null with no prior close', () => {
    // i=1: lo = min(low 4, prevClose 4) = 4; bp = close 8 - 4 = 4; tr = 9 - 4 = 5
    const { bp, tr } = computeLineUltimateBpTr([5, 9], [3, 4], [4, 8]);
    expect(bp[0]).toBeNull();
    expect(tr[0]).toBeNull();
    expect(bp[1]).toBe(4);
    expect(tr[1]).toBe(5);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineUltimateBpTr(null, [1], [1])).toEqual({
      bp: [],
      tr: [],
    });
  });
});

describe('computeLineUltimateAvg', () => {
  it('divides the buying-pressure sum by the true-range sum', () => {
    const avg = computeLineUltimateAvg([null, 6, 2, 8], [null, 8, 6, 10], 1);
    expect(avg[0]).toBeNull();
    expect(avg[1]).toBe(0.75);
    expect(avg[3]!).toBeCloseTo(0.8, 6);
  });

  it('reads the neutral 0.5 for a zero total true range', () => {
    const avg = computeLineUltimateAvg([null, 0, 0], [null, 0, 0], 1);
    expect(avg[1]).toBe(0.5);
    expect(avg[2]).toBe(0.5);
  });

  it('sums buying pressure and true range over the period window', () => {
    const avg = computeLineUltimateAvg([null, 6, 2, 8], [null, 8, 6, 10], 2);
    expect(avg[1]).toBeNull();
    expect(avg[3]).toBe(0.625);
  });

  it('leaves a window containing a null undefined', () => {
    const avg = computeLineUltimateAvg([null, 6, 2], [null, 8, 6], 2);
    expect(avg[1]).toBeNull();
    expect(avg[2]!).toBeCloseTo(8 / 14, 6);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineUltimateAvg(null, [1], 2)).toEqual([]);
  });
});

describe('computeLineUltimate', () => {
  const highs = ULTIMATE_DATA.map((p) => p.high);
  const lows = ULTIMATE_DATA.map((p) => p.low);
  const closes = ULTIMATE_DATA.map((p) => p.close);

  it('matches the hand-verified buying pressure and true range', () => {
    const { bp, tr } = computeLineUltimate(highs, lows, closes, 1, 2, 3);
    expect(bp).toEqual([null, 6, 2, 8, 4, 6, 2]);
    expect(tr).toEqual([null, 8, 6, 10, 8, 10, 10]);
  });

  it('matches the hand-verified Ultimate Oscillator', () => {
    const { uo } = computeLineUltimate(highs, lows, closes, 1, 2, 3);
    expect(uo[2]).toBeNull();
    expect(uo[3]!).toBeCloseTo(73.0952381, 4);
    expect(uo[6]!).toBeCloseTo(28.9795918, 4);
  });

  it('keeps every defined reading within 0 and 100', () => {
    const bars = Array.from({ length: 20 }, (_, i) => {
      const base = 100 + i * 2;
      return { high: base + 6, low: base - 6, close: base + ((i % 7) - 3) };
    });
    const { uo } = computeLineUltimate(
      bars.map((b) => b.high),
      bars.map((b) => b.low),
      bars.map((b) => b.close),
      7,
      14,
      28,
    );
    for (const v of uo) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineUltimate(null, lows, closes, 7, 14, 28)).toEqual({
      bp: [],
      tr: [],
      avg1: [],
      avg2: [],
      avg3: [],
      uo: [],
    });
  });
});

describe('runLineUltimate', () => {
  it('reports ok with the resolved config', () => {
    const run = runLineUltimate(ULTIMATE_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.shortPeriod).toBe(1);
    expect(run.mediumPeriod).toBe(2);
    expect(run.longPeriod).toBe(3);
    expect(run.upperThreshold).toBe(70);
    expect(run.lowerThreshold).toBe(30);
  });

  it('exposes the buying pressure, true range and oscillator series', () => {
    const run = runLineUltimate(ULTIMATE_DATA, RUN_OPTS);
    expect(run.bp).toEqual([null, 6, 2, 8, 4, 6, 2]);
    expect(run.tr).toEqual([null, 8, 6, 10, 8, 10, 10]);
    expect(run.uo[3]!).toBeCloseTo(73.0952381, 4);
  });

  it('reports the final, min and max oscillator readings', () => {
    const run = runLineUltimate(ULTIMATE_DATA, RUN_OPTS);
    expect(run.uoFinal!).toBeCloseTo(28.9795918, 4);
    expect(run.uoMin!).toBeCloseTo(28.9795918, 4);
    expect(run.uoMax!).toBeCloseTo(73.0952381, 4);
  });

  it('counts overbought and oversold readings', () => {
    const run = runLineUltimate(ULTIMATE_DATA, RUN_OPTS);
    expect(run.overboughtCount).toBe(1);
    expect(run.oversoldCount).toBe(1);
  });

  it('classifies each sample into a zone', () => {
    const run = runLineUltimate(ULTIMATE_DATA, RUN_OPTS);
    expect(run.samples[0]!.zone).toBe('neutral');
    expect(run.samples[3]!.zone).toBe('overbought');
    expect(run.samples[4]!.zone).toBe('neutral');
    expect(run.samples[6]!.zone).toBe('oversold');
  });

  it('honours custom thresholds', () => {
    const run = runLineUltimate(ULTIMATE_DATA, {
      ...RUN_OPTS,
      upperThreshold: 55,
    });
    expect(run.samples[4]!.zone).toBe('overbought');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...ULTIMATE_DATA].reverse();
    const run = runLineUltimate(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.bp).toEqual([null, 6, 2, 8, 4, 6, 2]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineUltimate([{ x: 0, high: 5, low: 1, close: 3 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineUltimate([]).ok).toBe(false);
    expect(runLineUltimate(null).ok).toBe(false);
  });

  it('defaults the config when no options are given', () => {
    const run = runLineUltimate(ULTIMATE_DATA);
    expect(run.shortPeriod).toBe(DEFAULT_CHART_LINE_ULTIMATE_SHORT_PERIOD);
    expect(run.mediumPeriod).toBe(DEFAULT_CHART_LINE_ULTIMATE_MEDIUM_PERIOD);
    expect(run.longPeriod).toBe(DEFAULT_CHART_LINE_ULTIMATE_LONG_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineUltimate(ULTIMATE_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(ULTIMATE_DATA.length);
  });
});

describe('computeLineUltimateLayout', () => {
  const base = {
    data: ULTIMATE_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineUltimateLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('stacks the price panel above the Ultimate Oscillator panel', () => {
    const layout = computeLineUltimateLayout(base);
    expect(layout.uoPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.uoPanel.width);
  });

  it('builds non-empty price and oscillator paths', () => {
    const layout = computeLineUltimateLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.uoPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined oscillator reading', () => {
    const layout = computeLineUltimateLayout(base);
    expect(layout.markers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('spans the oscillator y axis ticks from 0 to 100', () => {
    const layout = computeLineUltimateLayout(base);
    const values = layout.uoYTicks.map((t) => t.value);
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(100);
  });

  it('places the upper threshold above the lower threshold', () => {
    const layout = computeLineUltimateLayout(base);
    expect(layout.upperY).toBeLessThan(layout.lowerY);
  });

  it('builds overbought and oversold zone rects with positive height', () => {
    const layout = computeLineUltimateLayout(base);
    expect(layout.overboughtRect.height).toBeGreaterThan(0);
    expect(layout.oversoldRect.height).toBeGreaterThan(0);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineUltimateLayout(base);
    expect(layout.overboughtCount).toBe(1);
    expect(layout.oversoldCount).toBe(1);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineUltimateLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.uoPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineUltimateLayout({
      ...base,
      data: [{ x: 0, high: 5, low: 1, close: 3 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineUltimateChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineUltimateChart(ULTIMATE_DATA, RUN_OPTS);
    expect(text).toContain('Ultimate Oscillator');
    expect(text).toContain('lookback');
    expect(text).toContain('buying pressure');
    expect(text).toContain('true range');
    expect(text).toContain('0-100');
    expect(text).toContain('overbought');
    expect(text).toContain('oversold');
  });

  it('reports the zone counts', () => {
    const text = describeLineUltimateChart(ULTIMATE_DATA, RUN_OPTS);
    expect(text).toContain('1 overbought');
    expect(text).toContain('1 oversold');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineUltimateChart([])).toBe('No data');
    expect(describeLineUltimateChart(null)).toBe('No data');
  });
});

describe('<ChartLineUltimate />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ultimate-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Ultimate Oscillator');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ultimate"]',
    );
    expect(root!.getAttribute('data-short-period')).toBe('1');
    expect(root!.getAttribute('data-medium-period')).toBe('2');
    expect(root!.getAttribute('data-long-period')).toBe('3');
    expect(root!.getAttribute('data-upper-threshold')).toBe('70');
    expect(root!.getAttribute('data-lower-threshold')).toBe('30');
    expect(root!.getAttribute('data-overbought-count')).toBe('1');
    expect(root!.getAttribute('data-oversold-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and oscillator lines', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ultimate-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ultimate-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-ultimate-uo-line"]'),
    ).not.toBeNull();
  });

  it('renders the overbought and oversold zones', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ultimate-overbought-zone"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ultimate-oversold-zone"]',
      ),
    ).not.toBeNull();
  });

  it('renders both threshold lines', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-line-ultimate-threshold-line"]',
    );
    expect(lines).toHaveLength(2);
  });

  it('renders one marker per defined oscillator reading', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ultimate-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('marks the overbought and oversold markers with their zone', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    const ob = container.querySelector(
      '[data-section="chart-line-ultimate-marker"][data-zone="overbought"]',
    );
    const os = container.querySelector(
      '[data-section="chart-line-ultimate-marker"][data-zone="oversold"]',
    );
    expect(ob).not.toBeNull();
    expect(os).not.toBeNull();
  });

  it('renders the config badge with the three lookback periods', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    const periods = container.querySelector(
      '[data-section="chart-line-ultimate-badge-periods"]',
    );
    expect(periods!.textContent).toContain('1/2/3');
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-ultimate-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-ultimate-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineUltimate
        data={ULTIMATE_DATA}
        {...RUN_OPTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ultimate-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the oscillator line when showUo is false', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} showUo={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ultimate-uo-line"]'),
    ).toBeNull();
  });

  it('hides the zones when showZones is false', () => {
    const { container } = render(
      <ChartLineUltimate
        data={ULTIMATE_DATA}
        {...RUN_OPTS}
        showZones={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ultimate-zones"]'),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineUltimate data={[{ x: 0, high: 5, low: 1, close: 3 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ultimate"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-ultimate-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineUltimate
        data={ULTIMATE_DATA}
        {...RUN_OPTS}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ultimate-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineUltimate ref={ref} data={ULTIMATE_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-ultimate',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineUltimate.displayName).toBe('ChartLineUltimate');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineUltimate data={ULTIMATE_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ultimate"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
