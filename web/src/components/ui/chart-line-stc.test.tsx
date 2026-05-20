import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineStc,
  computeLineStcEma,
  computeLineStcMacd,
  computeLineStcStochK,
  computeLineStcSmooth,
  computeLineStc,
  computeLineStcLayout,
  normalizeLineStcPeriod,
  getLineStcFinitePoints,
  runLineStc,
  describeLineStcChart,
  DEFAULT_CHART_LINE_STC_FAST_PERIOD,
  DEFAULT_CHART_LINE_STC_SLOW_PERIOD,
  DEFAULT_CHART_LINE_STC_CYCLE_PERIOD,
  type ChartLineStcPoint,
} from './chart-line-stc';

afterEach(() => cleanup());

const STC_DATA: ChartLineStcPoint[] = [
  { x: 0, value: 4 },
  { x: 1, value: 4 },
  { x: 2, value: 4 },
  { x: 3, value: 12 },
  { x: 4, value: 12 },
  { x: 5, value: 12 },
  { x: 6, value: 4 },
  { x: 7, value: 4 },
  { x: 8, value: 4 },
  { x: 9, value: 12 },
];

// Hand-verified for fast 1, slow 3, cycle 2, factor 0.5:
//   macd = fastEMA - slowEMA = [.,.,0,4,2,1,-3.5,-1.75,-0.875,3.5625]
//   k1   = StochK(macd, 2)   = [.,.,.,100,0,0,0,100,100,100]
//   d1   = Smooth(k1, 0.5)   = [.,.,.,100,50,25,12.5,56.25,78.125,89.0625]
//   k2   = StochK(d1, 2)     = [.,.,.,.,0,0,0,100,100,100]
//   stc  = Smooth(k2, 0.5)   = [.,.,.,.,0,0,0,50,75,87.5]
const RUN_OPTS = {
  fastPeriod: 1,
  slowPeriod: 3,
  cyclePeriod: 2,
  factor: 0.5,
  upperThreshold: 75,
  lowerThreshold: 25,
};

describe('getLineStcFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineStcFinitePoints([
      { x: 0, value: 1 },
      { x: NaN, value: 2 },
      { x: 1, value: Infinity },
      { x: 2, value: 3 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineStcFinitePoints(null)).toEqual([]);
    expect(getLineStcFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineStcPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineStcPeriod(23, 23)).toBe(23);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineStcPeriod(10.6, 10)).toBe(10);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineStcPeriod(0, 10)).toBe(10);
    expect(normalizeLineStcPeriod(-3, 10)).toBe(10);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineStcPeriod(NaN, 10)).toBe(10);
    expect(normalizeLineStcPeriod(Infinity, 10)).toBe(10);
  });
});

describe('computeLineStcEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    expect(computeLineStcEma([2, 4, 6], 2)).toEqual([null, 3, 5]);
  });

  it('uses the period-length mean as the seed', () => {
    const ema = computeLineStcEma([4, 4, 4, 12], 3);
    expect(ema[2]).toBe(4);
    expect(ema[3]).toBe(8);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineStcEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineStcEma(null, 2)).toEqual([]);
  });
});

describe('computeLineStcMacd', () => {
  it('matches the hand-verified fast-minus-slow EMA difference', () => {
    const macd = computeLineStcMacd(
      STC_DATA.map((p) => p.value),
      1,
      3,
    );
    expect(macd).toEqual([
      null,
      null,
      0,
      4,
      2,
      1,
      -3.5,
      -1.75,
      -0.875,
      3.5625,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineStcMacd(null, 12, 26)).toEqual([]);
  });
});

describe('computeLineStcStochK', () => {
  it('scales each value to its position in the window range', () => {
    expect(computeLineStcStochK([2, 8, 4, 10], 2)).toEqual([
      null,
      100,
      0,
      100,
    ]);
  });

  it('reads zero when the value sits at the window low', () => {
    expect(computeLineStcStochK([8, 2], 2)[1]).toBe(0);
  });

  it('reads the neutral 50 for a flat window', () => {
    expect(computeLineStcStochK([5, 5, 5], 2)).toEqual([null, 50, 50]);
  });

  it('leaves a window containing a null undefined', () => {
    expect(computeLineStcStochK([null, 2, 8, 4], 2)).toEqual([
      null,
      null,
      100,
      0,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineStcStochK(null, 2)).toEqual([]);
  });
});

describe('computeLineStcSmooth', () => {
  it('applies the modified-EMA smoothing seeded with the first value', () => {
    expect(computeLineStcSmooth([100, 0, 0, 0], 0.5)).toEqual([
      100,
      50,
      25,
      12.5,
    ]);
  });

  it('skips leading nulls before seeding', () => {
    expect(computeLineStcSmooth([null, 100, 0], 0.5)).toEqual([
      null,
      100,
      50,
    ]);
  });

  it('honours the smoothing factor', () => {
    expect(computeLineStcSmooth([10, 20], 0.25)).toEqual([10, 12.5]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineStcSmooth(null, 0.5)).toEqual([]);
  });
});

describe('computeLineStc', () => {
  const values = STC_DATA.map((p) => p.value);

  it('matches the hand-verified MACD line', () => {
    const { macd } = computeLineStc(values, 1, 3, 2, 0.5);
    expect(macd).toEqual([
      null,
      null,
      0,
      4,
      2,
      1,
      -3.5,
      -1.75,
      -0.875,
      3.5625,
    ]);
  });

  it('matches the hand-verified first smoothed stochastic', () => {
    const { d1 } = computeLineStc(values, 1, 3, 2, 0.5);
    expect(d1).toEqual([
      null,
      null,
      null,
      100,
      50,
      25,
      12.5,
      56.25,
      78.125,
      89.0625,
    ]);
  });

  it('matches the hand-verified Schaff Trend Cycle', () => {
    const { stc } = computeLineStc(values, 1, 3, 2, 0.5);
    expect(stc).toEqual([
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      50,
      75,
      87.5,
    ]);
  });

  it('keeps every defined STC reading within 0 and 100', () => {
    const rising: number[] = Array.from({ length: 30 }, (_, i) => 10 + i * i);
    const { stc } = computeLineStc(rising, 3, 6, 4, 0.5);
    for (const v of stc) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineStc(null, 23, 50, 10, 0.5)).toEqual({
      macd: [],
      k1: [],
      d1: [],
      k2: [],
      stc: [],
    });
  });
});

describe('runLineStc', () => {
  it('reports ok with the resolved config', () => {
    const run = runLineStc(STC_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.fastPeriod).toBe(1);
    expect(run.slowPeriod).toBe(3);
    expect(run.cyclePeriod).toBe(2);
    expect(run.upperThreshold).toBe(75);
    expect(run.lowerThreshold).toBe(25);
  });

  it('exposes the STC series', () => {
    const run = runLineStc(STC_DATA, RUN_OPTS);
    expect(run.stc).toEqual([
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      50,
      75,
      87.5,
    ]);
  });

  it('reports the final, min and max STC readings', () => {
    const run = runLineStc(STC_DATA, RUN_OPTS);
    expect(run.stcFinal).toBe(87.5);
    expect(run.stcMin).toBe(0);
    expect(run.stcMax).toBe(87.5);
  });

  it('counts overbought and oversold readings', () => {
    const run = runLineStc(STC_DATA, RUN_OPTS);
    expect(run.overboughtCount).toBe(2);
    expect(run.oversoldCount).toBe(3);
  });

  it('classifies each sample into a zone', () => {
    const run = runLineStc(STC_DATA, RUN_OPTS);
    expect(run.samples[0]!.zone).toBe('neutral');
    expect(run.samples[4]!.zone).toBe('oversold');
    expect(run.samples[7]!.zone).toBe('neutral');
    expect(run.samples[8]!.zone).toBe('overbought');
    expect(run.samples[9]!.zone).toBe('overbought');
  });

  it('honours custom thresholds', () => {
    const run = runLineStc(STC_DATA, { ...RUN_OPTS, upperThreshold: 50 });
    expect(run.samples[7]!.zone).toBe('overbought');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...STC_DATA].reverse();
    const run = runLineStc(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(run.stc[9]).toBe(87.5);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineStc([{ x: 0, value: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineStc([]).ok).toBe(false);
    expect(runLineStc(null).ok).toBe(false);
  });

  it('defaults the config when no options are given', () => {
    const run = runLineStc(STC_DATA);
    expect(run.fastPeriod).toBe(DEFAULT_CHART_LINE_STC_FAST_PERIOD);
    expect(run.slowPeriod).toBe(DEFAULT_CHART_LINE_STC_SLOW_PERIOD);
    expect(run.cyclePeriod).toBe(DEFAULT_CHART_LINE_STC_CYCLE_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineStc(STC_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(STC_DATA.length);
  });
});

describe('computeLineStcLayout', () => {
  const base = {
    data: STC_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineStcLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('stacks the price panel above the STC panel', () => {
    const layout = computeLineStcLayout(base);
    expect(layout.stcPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.stcPanel.width);
  });

  it('builds non-empty price and STC paths', () => {
    const layout = computeLineStcLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.stcPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined STC reading', () => {
    const layout = computeLineStcLayout(base);
    expect(layout.markers).toHaveLength(6);
    expect(layout.priceDots).toHaveLength(10);
  });

  it('spans the STC y axis ticks from 0 to 100', () => {
    const layout = computeLineStcLayout(base);
    const values = layout.stcYTicks.map((t) => t.value);
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(100);
  });

  it('places the upper threshold above the lower threshold', () => {
    const layout = computeLineStcLayout(base);
    expect(layout.upperY).toBeLessThan(layout.lowerY);
    expect(layout.upperY).toBeGreaterThanOrEqual(layout.stcPanel.y);
    expect(layout.lowerY).toBeLessThanOrEqual(
      layout.stcPanel.y + layout.stcPanel.height,
    );
  });

  it('builds overbought and oversold zone rects with positive height', () => {
    const layout = computeLineStcLayout(base);
    expect(layout.overboughtRect.height).toBeGreaterThan(0);
    expect(layout.oversoldRect.height).toBeGreaterThan(0);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineStcLayout(base);
    expect(layout.stcFinal).toBe(87.5);
    expect(layout.overboughtCount).toBe(2);
    expect(layout.oversoldCount).toBe(3);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineStcLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.stcPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineStcLayout({
      ...base,
      data: [{ x: 0, value: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineStcChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineStcChart(STC_DATA, RUN_OPTS);
    expect(text).toContain('Schaff Trend Cycle');
    expect(text).toContain('STC');
    expect(text).toContain('MACD');
    expect(text).toContain('stochastic');
    expect(text).toContain('0-100');
    expect(text).toContain('overbought');
    expect(text).toContain('oversold');
  });

  it('reports the zone counts', () => {
    const text = describeLineStcChart(STC_DATA, RUN_OPTS);
    expect(text).toContain('2 overbought');
    expect(text).toContain('3 oversold');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineStcChart([])).toBe('No data');
    expect(describeLineStcChart(null)).toBe('No data');
  });
});

describe('<ChartLineStc />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-stc-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Schaff Trend Cycle');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    const root = container.querySelector('[data-section="chart-line-stc"]');
    expect(root!.getAttribute('data-fast-period')).toBe('1');
    expect(root!.getAttribute('data-slow-period')).toBe('3');
    expect(root!.getAttribute('data-cycle-period')).toBe('2');
    expect(root!.getAttribute('data-upper-threshold')).toBe('75');
    expect(root!.getAttribute('data-lower-threshold')).toBe('25');
    expect(root!.getAttribute('data-overbought-count')).toBe('2');
    expect(root!.getAttribute('data-oversold-count')).toBe('3');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and STC lines', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-stc-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-stc-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-stc-stc-line"]'),
    ).not.toBeNull();
  });

  it('renders the overbought and oversold zones', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-zone"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-zone"]',
      ),
    ).not.toBeNull();
  });

  it('renders both threshold lines', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    const lines = container.querySelectorAll(
      '[data-section="chart-line-stc-threshold-line"]',
    );
    expect(lines).toHaveLength(2);
  });

  it('renders one marker per defined STC reading', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stc-marker"]',
    );
    expect(markers).toHaveLength(6);
  });

  it('marks the overbought and oversold markers with their zone', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    const ob = container.querySelector(
      '[data-section="chart-line-stc-marker"][data-zone="overbought"]',
    );
    const os = container.querySelector(
      '[data-section="chart-line-stc-marker"][data-zone="oversold"]',
    );
    expect(ob).not.toBeNull();
    expect(os).not.toBeNull();
  });

  it('renders the config badge with the MACD and cycle periods', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    const macd = container.querySelector(
      '[data-section="chart-line-stc-badge-macd"]',
    );
    const cycle = container.querySelector(
      '[data-section="chart-line-stc-badge-cycle"]',
    );
    expect(macd!.textContent).toContain('1/3');
    expect(cycle!.textContent).toContain('2');
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-stc-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineStc data={STC_DATA} {...RUN_OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-stc-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineStc data={STC_DATA} {...RUN_OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stc-price-path"]'),
    ).toBeNull();
  });

  it('hides the STC line when showStc is false', () => {
    const { container } = render(
      <ChartLineStc data={STC_DATA} {...RUN_OPTS} showStc={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stc-stc-line"]'),
    ).toBeNull();
  });

  it('hides the zones when showZones is false', () => {
    const { container } = render(
      <ChartLineStc data={STC_DATA} {...RUN_OPTS} showZones={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stc-zones"]'),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineStc data={[{ x: 0, value: 1 }]} />);
    const root = container.querySelector('[data-section="chart-line-stc"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-stc-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineStc data={STC_DATA} {...RUN_OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stc-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStc ref={ref} data={STC_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-stc');
  });

  it('has a stable displayName', () => {
    expect(ChartLineStc.displayName).toBe('ChartLineStc');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineStc data={STC_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-stc"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
