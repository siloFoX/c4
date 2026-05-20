import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLinePpo,
  computeLinePpoEma,
  computeLinePpo,
  computeLinePpoLayout,
  normalizeLinePpoPeriod,
  getLinePpoFinitePoints,
  runLinePpo,
  describeLinePpoChart,
  DEFAULT_CHART_LINE_PPO_FAST_PERIOD,
  DEFAULT_CHART_LINE_PPO_SLOW_PERIOD,
  DEFAULT_CHART_LINE_PPO_SIGNAL_PERIOD,
  type ChartLinePpoPoint,
} from './chart-line-ppo';

afterEach(() => cleanup());

const PPO_DATA: ChartLinePpoPoint[] = [
  { x: 0, value: 4 },
  { x: 1, value: 4 },
  { x: 2, value: 4 },
  { x: 3, value: 12 },
  { x: 4, value: 12 },
  { x: 5, value: 12 },
  { x: 6, value: 12 },
  { x: 7, value: 12 },
];

// Hand-verified for fastPeriod 1, slowPeriod 3, signalPeriod 3:
//   fastEMA = values exactly             = [4,4,4,12,12,12,12,12]
//   slowEMA (mult 0.5, SMA seed at i=2)  = [.,.,4,8,10,11,11.5,11.75]
//   ppo = 100*(fast-slow)/slow           = [.,.,0,50,20,100/11,50/11.5,25/11.75]
//   signal (EMA of ppo, mult 0.5)        seeds at the 3rd defined ppo = mean(0,50,20) = 70/3
//   histogram = ppo - signal             defined from index 4 onward, all negative here
const RUN_OPTS = { fastPeriod: 1, slowPeriod: 3, signalPeriod: 3 };

const FLAT_DATA: ChartLinePpoPoint[] = [
  { x: 0, value: 100 },
  { x: 1, value: 100 },
  { x: 2, value: 100 },
  { x: 3, value: 100 },
  { x: 4, value: 100 },
  { x: 5, value: 100 },
];

describe('computeLinePpoEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    // period 2, mult 2/3: seed = mean(2,4) = 3; 6*(2/3) + 3*(1/3) = 5
    const ema = computeLinePpoEma([2, 4, 6], 2);
    expect(ema[0]).toBeNull();
    expect(ema[1]).toBe(3);
    expect(ema[2]).toBe(5);
  });

  it('uses the period-length mean as the seed', () => {
    // period 3, mult 0.5: seed = mean(4,4,4) = 4; 12*0.5 + 4*0.5 = 8
    const ema = computeLinePpoEma([4, 4, 4, 12], 3);
    expect(ema[2]).toBe(4);
    expect(ema[3]).toBe(8);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLinePpoEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('skips leading null placeholders before seeding', () => {
    // defined values 3,6,9: seed = mean(3,6) = 4.5; 9*(2/3) + 4.5*(1/3) = 7.5
    const ema = computeLinePpoEma([null, null, 3, 6, 9], 2);
    expect(ema[0]).toBeNull();
    expect(ema[2]).toBeNull();
    expect(ema[3]).toBe(4.5);
    expect(ema[4]).toBe(7.5);
  });

  it('returns all-null when there are fewer defined values than the period', () => {
    expect(computeLinePpoEma([1, 2], 3)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLinePpoEma(null, 2)).toEqual([]);
  });
});

describe('computeLinePpo', () => {
  it('matches the hand-verified PPO pipeline', () => {
    const values = PPO_DATA.map((p) => p.value);
    const { ppo } = computeLinePpo(values, 1, 3, 3);
    expect(ppo[0]).toBeNull();
    expect(ppo[1]).toBeNull();
    expect(ppo[2]).toBe(0);
    expect(ppo[3]).toBe(50);
    expect(ppo[4]).toBe(20);
    expect(ppo[5]!).toBeCloseTo(100 / 11, 6);
  });

  it('seeds the signal line from the simple mean of the first PPO values', () => {
    const values = PPO_DATA.map((p) => p.value);
    const { signal } = computeLinePpo(values, 1, 3, 3);
    expect(signal[3]).toBeNull();
    expect(signal[4]!).toBeCloseTo(70 / 3, 6);
  });

  it('derives the histogram as PPO minus signal', () => {
    const values = PPO_DATA.map((p) => p.value);
    const { histogram } = computeLinePpo(values, 1, 3, 3);
    expect(histogram[3]).toBeNull();
    expect(histogram[4]!).toBeCloseTo(-10 / 3, 6);
  });

  it('produces an all-zero oscillator for a flat series', () => {
    const values = FLAT_DATA.map((p) => p.value);
    const { ppo, signal, histogram } = computeLinePpo(values, 2, 3, 2);
    expect(ppo[5]).toBe(0);
    expect(signal[5]).toBe(0);
    expect(histogram[5]).toBe(0);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLinePpo(null, 12, 26, 9)).toEqual({
      ppo: [],
      signal: [],
      histogram: [],
    });
  });
});

describe('normalizeLinePpoPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLinePpoPeriod(26, 9)).toBe(26);
  });

  it('floors a fractional period', () => {
    expect(normalizeLinePpoPeriod(12.9, 9)).toBe(12);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLinePpoPeriod(0, 9)).toBe(9);
    expect(normalizeLinePpoPeriod(-4, 9)).toBe(9);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLinePpoPeriod(NaN, 12)).toBe(12);
    expect(normalizeLinePpoPeriod(Infinity, 12)).toBe(12);
  });
});

describe('getLinePpoFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLinePpoFinitePoints([
      { x: 0, value: 1 },
      { x: NaN, value: 2 },
      { x: 1, value: Infinity },
      { x: 2, value: 3 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLinePpoFinitePoints(null)).toEqual([]);
  });
});

describe('runLinePpo', () => {
  it('reports ok with the resolved periods', () => {
    const run = runLinePpo(PPO_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.fastPeriod).toBe(1);
    expect(run.slowPeriod).toBe(3);
    expect(run.signalPeriod).toBe(3);
  });

  it('exposes the PPO, signal and histogram series', () => {
    const run = runLinePpo(PPO_DATA, RUN_OPTS);
    expect(run.ppo[3]).toBe(50);
    expect(run.signal[4]!).toBeCloseTo(70 / 3, 6);
    expect(run.histogram[4]!).toBeCloseTo(-10 / 3, 6);
  });

  it('reports the final readings and the PPO range', () => {
    const run = runLinePpo(PPO_DATA, RUN_OPTS);
    expect(run.ppoFinal!).toBeCloseTo(25 / 11.75, 6);
    expect(run.ppoMin).toBe(0);
    expect(run.ppoMax).toBe(50);
  });

  it('counts histogram readings above and below the zero line', () => {
    const run = runLinePpo(PPO_DATA, RUN_OPTS);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(4);
  });

  it('classifies each sample by histogram sign', () => {
    const run = runLinePpo(PPO_DATA, RUN_OPTS);
    expect(run.samples[0]!.sign).toBe('zero');
    expect(run.samples[3]!.sign).toBe('zero');
    expect(run.samples[4]!.sign).toBe('negative');
    expect(run.samples[7]!.sign).toBe('negative');
  });

  it('reads a positive PPO for a steadily rising series', () => {
    const rising: ChartLinePpoPoint[] = Array.from({ length: 12 }, (_, i) => ({
      x: i,
      value: 10 + i * 2,
    }));
    const run = runLinePpo(rising, { fastPeriod: 2, slowPeriod: 5 });
    expect(run.ppoFinal).toBeGreaterThan(0);
  });

  it('reads a negative PPO for a steadily falling series', () => {
    const falling: ChartLinePpoPoint[] = Array.from(
      { length: 12 },
      (_, i) => ({ x: i, value: 60 - i * 2 }),
    );
    const run = runLinePpo(falling, { fastPeriod: 2, slowPeriod: 5 });
    expect(run.ppoFinal).toBeLessThan(0);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...PPO_DATA].reverse();
    const run = runLinePpo(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(run.ppo[3]).toBe(50);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLinePpo([{ x: 0, value: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLinePpo([]).ok).toBe(false);
    expect(runLinePpo(null).ok).toBe(false);
  });

  it('defaults the periods when no options are given', () => {
    const run = runLinePpo(PPO_DATA);
    expect(run.fastPeriod).toBe(DEFAULT_CHART_LINE_PPO_FAST_PERIOD);
    expect(run.slowPeriod).toBe(DEFAULT_CHART_LINE_PPO_SLOW_PERIOD);
    expect(run.signalPeriod).toBe(DEFAULT_CHART_LINE_PPO_SIGNAL_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLinePpo(PPO_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(PPO_DATA.length);
  });
});

describe('computeLinePpoLayout', () => {
  const base = {
    data: PPO_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLinePpoLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(8);
  });

  it('stacks the value panel above the PPO panel', () => {
    const layout = computeLinePpoLayout(base);
    expect(layout.ppoPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.ppoPanel.width);
  });

  it('builds non-empty value, PPO and signal paths', () => {
    const layout = computeLinePpoLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.ppoPath.startsWith('M')).toBe(true);
    expect(layout.signalPath.startsWith('M')).toBe(true);
  });

  it('emits one histogram bar per defined histogram reading', () => {
    const layout = computeLinePpoLayout(base);
    expect(layout.histogramBars).toHaveLength(4);
  });

  it('emits one marker per defined PPO reading', () => {
    const layout = computeLinePpoLayout(base);
    expect(layout.markers).toHaveLength(6);
    expect(layout.priceDots).toHaveLength(8);
  });

  it('places the zero line inside the PPO panel', () => {
    const layout = computeLinePpoLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.ppoPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.ppoPanel.y + layout.ppoPanel.height,
    );
  });

  it('uses a symmetric y-bound covering the widest reading', () => {
    const layout = computeLinePpoLayout(base);
    expect(layout.ppoYBound).toBe(50);
  });

  it('anchors each histogram bar on the zero line', () => {
    const layout = computeLinePpoLayout(base);
    for (const bar of layout.histogramBars) {
      const top = bar.by;
      const bottom = bar.by + bar.bh;
      expect(layout.zeroY).toBeGreaterThanOrEqual(top - 0.001);
      expect(layout.zeroY).toBeLessThanOrEqual(bottom + 0.001);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLinePpoLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.ppoPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLinePpoLayout({
      ...base,
      data: [{ x: 0, value: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLinePpoChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLinePpoChart(PPO_DATA, RUN_OPTS);
    expect(text).toContain('Percentage Price Oscillator');
    expect(text).toContain('PPO');
    expect(text).toContain('signal');
    expect(text).toContain('histogram');
    expect(text).toContain('percentage');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('zero');
  });

  it('reports the histogram counts and the EMA periods', () => {
    const text = describeLinePpoChart(PPO_DATA, RUN_OPTS);
    expect(text).toContain('EMA 1/3');
    expect(text).toContain('0 histogram readings above');
    expect(text).toContain('4 below');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLinePpoChart([])).toBe('No data');
    expect(describeLinePpoChart(null)).toBe('No data');
  });
});

describe('<ChartLinePpo />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ppo-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Percentage Price Oscillator');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-ppo"]');
    expect(root!.getAttribute('data-fast-period')).toBe('1');
    expect(root!.getAttribute('data-slow-period')).toBe('3');
    expect(root!.getAttribute('data-signal-period')).toBe('3');
    expect(root!.getAttribute('data-positive-count')).toBe('0');
    expect(root!.getAttribute('data-negative-count')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('8');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the value, PPO and signal lines', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-ppo-value-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-ppo-ppo-line"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-ppo-signal-line"]'),
    ).not.toBeNull();
  });

  it('renders one histogram bar per defined reading', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} />,
    );
    const bars = container.querySelectorAll(
      '[data-section="chart-line-ppo-histogram-bar"]',
    );
    expect(bars).toHaveLength(4);
  });

  it('renders one marker per defined PPO reading', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ppo-marker"]',
    );
    expect(markers).toHaveLength(6);
  });

  it('renders the config badge with EMA and signal periods', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} />,
    );
    const ema = container.querySelector(
      '[data-section="chart-line-ppo-badge-ema"]',
    );
    const signal = container.querySelector(
      '[data-section="chart-line-ppo-badge-signal"]',
    );
    expect(ema!.textContent).toContain('1/3');
    expect(signal!.textContent).toContain('3');
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-ppo-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a four-item legend', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-ppo-legend-item"]',
    );
    expect(items).toHaveLength(4);
  });

  it('hides the value path when value is in the hidden set', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} hiddenSeries={['value']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-value-path"]'),
    ).toBeNull();
  });

  it('hides the signal line when showSignal is false', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} showSignal={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-signal-line"]'),
    ).toBeNull();
  });

  it('hides the histogram when showHistogram is false', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} showHistogram={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-histogram"]'),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLinePpo data={[{ x: 0, value: 1 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-ppo"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-ppo-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePpo ref={ref} data={PPO_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-ppo');
  });

  it('has a stable displayName', () => {
    expect(ChartLinePpo.displayName).toBe('ChartLinePpo');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLinePpo data={PPO_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-ppo"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
