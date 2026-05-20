import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineChaikinOsc,
  computeLineChaikinOscMfm,
  computeLineChaikinOscAdl,
  computeLineChaikinOscEma,
  computeLineChaikinOsc,
  computeLineChaikinOscLayout,
  normalizeLineChaikinOscPeriod,
  getLineChaikinOscFinitePoints,
  runLineChaikinOsc,
  describeLineChaikinOscChart,
  DEFAULT_CHART_LINE_CHAIKIN_OSC_FAST_PERIOD,
  DEFAULT_CHART_LINE_CHAIKIN_OSC_SLOW_PERIOD,
  type ChartLineChaikinOscPoint,
} from './chart-line-chaikin-osc';

afterEach(() => cleanup());

// high 10, low 0 throughout; the close at high / low gives a money
// flow multiplier of +1 / -1. The ADL accumulates then declines.
const CHAIKIN_DATA: ChartLineChaikinOscPoint[] = [
  { x: 0, high: 10, low: 0, close: 10, volume: 4 },
  { x: 1, high: 10, low: 0, close: 10, volume: 4 },
  { x: 2, high: 10, low: 0, close: 10, volume: 4 },
  { x: 3, high: 10, low: 0, close: 10, volume: 4 },
  { x: 4, high: 10, low: 0, close: 0, volume: 8 },
  { x: 5, high: 10, low: 0, close: 0, volume: 8 },
];

// Hand-verified for fast 1, slow 3:
//   adl        = [4, 8, 12, 16, 8, 0]
//   fastEma    = EMA(adl, 1) = the ADL itself
//   slowEma    = EMA(adl, 3) = [.,.,8,12,10,5]
//   oscillator = fastEma - slowEma = [.,.,4,4,-2,-5]
const RUN_OPTS = { fastPeriod: 1, slowPeriod: 3 };

describe('getLineChaikinOscFinitePoints', () => {
  it('keeps only points with finite x, high, low, close and volume', () => {
    const points = getLineChaikinOscFinitePoints([
      { x: 0, high: 5, low: 1, close: 3, volume: 10 },
      { x: NaN, high: 5, low: 1, close: 3, volume: 10 },
      { x: 1, high: Infinity, low: 1, close: 3, volume: 10 },
      { x: 2, high: 5, low: 1, close: 3, volume: NaN },
      { x: 3, high: 9, low: 4, close: 7, volume: 20 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 3]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineChaikinOscFinitePoints(null)).toEqual([]);
    expect(getLineChaikinOscFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineChaikinOscPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineChaikinOscPeriod(10, 10)).toBe(10);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineChaikinOscPeriod(10.7, 10)).toBe(10);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineChaikinOscPeriod(0, 10)).toBe(10);
    expect(normalizeLineChaikinOscPeriod(-3, 10)).toBe(10);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineChaikinOscPeriod(NaN, 10)).toBe(10);
    expect(normalizeLineChaikinOscPeriod(Infinity, 10)).toBe(10);
  });
});

describe('computeLineChaikinOscMfm', () => {
  it('reads plus one when the close sits at the high', () => {
    expect(computeLineChaikinOscMfm([10], [0], [10])[0]).toBe(1);
  });

  it('reads minus one when the close sits at the low', () => {
    expect(computeLineChaikinOscMfm([10], [0], [0])[0]).toBe(-1);
  });

  it('reads zero when the close sits at the midpoint', () => {
    expect(computeLineChaikinOscMfm([10], [0], [5])[0]).toBe(0);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineChaikinOscMfm(null, [0], [5])).toEqual([]);
  });
});

describe('computeLineChaikinOscAdl', () => {
  const highs = CHAIKIN_DATA.map((p) => p.high);
  const lows = CHAIKIN_DATA.map((p) => p.low);
  const closes = CHAIKIN_DATA.map((p) => p.close);
  const volumes = CHAIKIN_DATA.map((p) => p.volume);

  it('scales the multiplier by volume into money flow volume', () => {
    const { mfv } = computeLineChaikinOscAdl(highs, lows, closes, volumes);
    expect(mfv).toEqual([4, 4, 4, 4, -8, -8]);
  });

  it('accumulates the money flow volume into the ADL', () => {
    const { adl } = computeLineChaikinOscAdl(highs, lows, closes, volumes);
    expect(adl).toEqual([4, 8, 12, 16, 8, 0]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineChaikinOscAdl(null, lows, closes, volumes)).toEqual({
      mfm: [],
      mfv: [],
      adl: [],
    });
  });
});

describe('computeLineChaikinOscEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    expect(computeLineChaikinOscEma([2, 4, 6], 2)).toEqual([null, 3, 5]);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineChaikinOscEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('uses the period-length mean as the seed', () => {
    const ema = computeLineChaikinOscEma([4, 8, 12, 16], 3);
    expect(ema[2]).toBe(8);
    expect(ema[3]).toBe(12);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineChaikinOscEma(null, 3)).toEqual([]);
  });
});

describe('computeLineChaikinOsc', () => {
  const highs = CHAIKIN_DATA.map((p) => p.high);
  const lows = CHAIKIN_DATA.map((p) => p.low);
  const closes = CHAIKIN_DATA.map((p) => p.close);
  const volumes = CHAIKIN_DATA.map((p) => p.volume);

  it('exposes the Accumulation Distribution Line', () => {
    const { adl } = computeLineChaikinOsc(highs, lows, closes, volumes, 1, 3);
    expect(adl).toEqual([4, 8, 12, 16, 8, 0]);
  });

  it('takes the fast and slow EMA of the ADL', () => {
    const { fastEma, slowEma } = computeLineChaikinOsc(
      highs,
      lows,
      closes,
      volumes,
      1,
      3,
    );
    expect(fastEma).toEqual([4, 8, 12, 16, 8, 0]);
    expect(slowEma).toEqual([null, null, 8, 12, 10, 5]);
  });

  it('takes the oscillator as the fast minus the slow EMA', () => {
    const { oscillator } = computeLineChaikinOsc(
      highs,
      lows,
      closes,
      volumes,
      1,
      3,
    );
    expect(oscillator).toEqual([null, null, 4, 4, -2, -5]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineChaikinOsc(null, lows, closes, volumes, 3, 10)).toEqual(
      {
        adl: [],
        fastEma: [],
        slowEma: [],
        oscillator: [],
      },
    );
  });
});

describe('runLineChaikinOsc', () => {
  it('reports ok with the resolved periods', () => {
    const run = runLineChaikinOsc(CHAIKIN_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.fastPeriod).toBe(1);
    expect(run.slowPeriod).toBe(3);
  });

  it('exposes the ADL and oscillator series', () => {
    const run = runLineChaikinOsc(CHAIKIN_DATA, RUN_OPTS);
    expect(run.adl).toEqual([4, 8, 12, 16, 8, 0]);
    expect(run.oscillator).toEqual([null, null, 4, 4, -2, -5]);
  });

  it('reports the final, min and max oscillator readings', () => {
    const run = runLineChaikinOsc(CHAIKIN_DATA, RUN_OPTS);
    expect(run.oscFinal).toBe(-5);
    expect(run.oscMin).toBe(-5);
    expect(run.oscMax).toBe(4);
  });

  it('counts readings above and below the zero line', () => {
    const run = runLineChaikinOsc(CHAIKIN_DATA, RUN_OPTS);
    expect(run.positiveCount).toBe(2);
    expect(run.negativeCount).toBe(2);
  });

  it('classifies each sample by oscillator sign', () => {
    const run = runLineChaikinOsc(CHAIKIN_DATA, RUN_OPTS);
    expect(run.samples[0]!.sign).toBe('zero');
    expect(run.samples[2]!.sign).toBe('positive');
    expect(run.samples[3]!.sign).toBe('positive');
    expect(run.samples[4]!.sign).toBe('negative');
    expect(run.samples[5]!.sign).toBe('negative');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...CHAIKIN_DATA].reverse();
    const run = runLineChaikinOsc(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.adl).toEqual([4, 8, 12, 16, 8, 0]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineChaikinOsc([
      { x: 0, high: 5, low: 1, close: 3, volume: 1 },
    ]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineChaikinOsc([]).ok).toBe(false);
    expect(runLineChaikinOsc(null).ok).toBe(false);
  });

  it('defaults the periods when no options are given', () => {
    const run = runLineChaikinOsc(CHAIKIN_DATA);
    expect(run.fastPeriod).toBe(DEFAULT_CHART_LINE_CHAIKIN_OSC_FAST_PERIOD);
    expect(run.slowPeriod).toBe(DEFAULT_CHART_LINE_CHAIKIN_OSC_SLOW_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineChaikinOsc(CHAIKIN_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(CHAIKIN_DATA.length);
  });

  it('exposes the ADL on every sample', () => {
    const run = runLineChaikinOsc(CHAIKIN_DATA, RUN_OPTS);
    expect(run.samples[0]!.adl).toBe(4);
    expect(run.samples[5]!.adl).toBe(0);
  });
});

describe('computeLineChaikinOscLayout', () => {
  const base = {
    data: CHAIKIN_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineChaikinOscLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(6);
  });

  it('stacks the price panel above the oscillator panel', () => {
    const layout = computeLineChaikinOscLayout(base);
    expect(layout.oscPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.oscPanel.width);
  });

  it('builds non-empty price and oscillator paths', () => {
    const layout = computeLineChaikinOscLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.oscPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined oscillator reading', () => {
    const layout = computeLineChaikinOscLayout(base);
    expect(layout.markers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(6);
  });

  it('places the zero line inside the oscillator panel', () => {
    const layout = computeLineChaikinOscLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.oscPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.oscPanel.y + layout.oscPanel.height,
    );
  });

  it('uses a symmetric y-bound covering the widest reading', () => {
    const layout = computeLineChaikinOscLayout(base);
    expect(layout.oscYBound).toBe(5);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineChaikinOscLayout(base);
    expect(layout.oscFinal).toBe(-5);
    expect(layout.positiveCount).toBe(2);
    expect(layout.negativeCount).toBe(2);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineChaikinOscLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.oscPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineChaikinOscLayout({
      ...base,
      data: [{ x: 0, high: 5, low: 1, close: 3, volume: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineChaikinOscChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineChaikinOscChart(CHAIKIN_DATA, RUN_OPTS);
    expect(text).toContain('Chaikin Oscillator');
    expect(text).toContain('Accumulation Distribution');
    expect(text).toContain('momentum');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('difference');
    expect(text).toContain('zero');
  });

  it('reports the EMA periods and reading counts', () => {
    const text = describeLineChaikinOscChart(CHAIKIN_DATA, RUN_OPTS);
    expect(text).toContain('EMA 1/3');
    expect(text).toContain('2 readings above');
    expect(text).toContain('2 below');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineChaikinOscChart([])).toBe('No data');
    expect(describeLineChaikinOscChart(null)).toBe('No data');
  });
});

describe('<ChartLineChaikinOsc />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-chaikin-osc-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Chaikin Oscillator');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-osc"]',
    );
    expect(root!.getAttribute('data-fast-period')).toBe('1');
    expect(root!.getAttribute('data-slow-period')).toBe('3');
    expect(root!.getAttribute('data-positive-count')).toBe('2');
    expect(root!.getAttribute('data-negative-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('6');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and oscillator lines', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-chaikin-osc-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-osc-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-osc-osc-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one marker per defined oscillator reading', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-chaikin-osc-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('renders the config badge with the EMA periods', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    const ema = container.querySelector(
      '[data-section="chart-line-chaikin-osc-badge-ema"]',
    );
    expect(ema!.textContent).toContain('1/3');
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-chaikin-osc-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-osc-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-chaikin-osc-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineChaikinOsc
        data={CHAIKIN_DATA}
        {...RUN_OPTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-osc-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the oscillator line and markers when showOscillator is false', () => {
    const { container } = render(
      <ChartLineChaikinOsc
        data={CHAIKIN_DATA}
        {...RUN_OPTS}
        showOscillator={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-osc-osc-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-chaikin-osc-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineChaikinOsc
        data={CHAIKIN_DATA}
        {...RUN_OPTS}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-osc-zero-line"]',
      ),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineChaikinOsc
        data={[{ x: 0, high: 5, low: 1, close: 3, volume: 1 }]}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-osc"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-chaikin-osc-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineChaikinOsc
        data={CHAIKIN_DATA}
        {...RUN_OPTS}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-chaikin-osc-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineChaikinOsc ref={ref} data={CHAIKIN_DATA} {...RUN_OPTS} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-chaikin-osc',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineChaikinOsc.displayName).toBe('ChartLineChaikinOsc');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineChaikinOsc data={CHAIKIN_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-osc"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
