import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineKlinger,
  computeLineKlingerVf,
  computeLineKlingerEma,
  computeLineKlinger,
  computeLineKlingerLayout,
  normalizeLineKlingerPeriod,
  getLineKlingerFinitePoints,
  runLineKlinger,
  describeLineKlingerChart,
  DEFAULT_CHART_LINE_KLINGER_FAST_PERIOD,
  DEFAULT_CHART_LINE_KLINGER_SLOW_PERIOD,
  DEFAULT_CHART_LINE_KLINGER_SIGNAL_PERIOD,
  type ChartLineKlingerPoint,
} from './chart-line-klinger';

afterEach(() => cleanup());

// The typical price alternates direction so the trend flips every
// bar; the daily measurement is a constant 6, so the daily/cumulative
// ratio settles at 0.5 and the volume force is volume * trend * 100.
const KLINGER_DATA: ChartLineKlingerPoint[] = [
  { x: 0, high: 16, low: 10, close: 13, volume: 1 },
  { x: 1, high: 10, low: 4, close: 7, volume: 1 },
  { x: 2, high: 22, low: 16, close: 19, volume: 4 },
  { x: 3, high: 8, low: 2, close: 5, volume: 1 },
  { x: 4, high: 26, low: 20, close: 23, volume: 2 },
  { x: 5, high: 6, low: 0, close: 3, volume: 1 },
];

// Hand-verified for fast 1, slow 3, signal 3:
//   hlc   = [13,7,19,5,23,3]   trend = [1,-1,1,-1,1,-1]   dm = [6,6,6,6,6,6]
//   cm    = [6,12,12,12,12,12]
//   vf    = volume * trend * 100 = [0,-100,400,-100,200,-100]
//   kvo   = EMA(vf,1) - EMA(vf,3) = [.,.,300,-100,100,-100]
//   signal = EMA(kvo,3) = [.,.,.,.,100,0]
const RUN_OPTS = { fastPeriod: 1, slowPeriod: 3, signalPeriod: 3 };

describe('getLineKlingerFinitePoints', () => {
  it('keeps only points with finite x, high, low, close and volume', () => {
    const points = getLineKlingerFinitePoints([
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
    expect(getLineKlingerFinitePoints(null)).toEqual([]);
    expect(getLineKlingerFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineKlingerPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineKlingerPeriod(34, 34)).toBe(34);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineKlingerPeriod(34.8, 34)).toBe(34);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineKlingerPeriod(0, 34)).toBe(34);
    expect(normalizeLineKlingerPeriod(-5, 34)).toBe(34);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineKlingerPeriod(NaN, 34)).toBe(34);
    expect(normalizeLineKlingerPeriod(Infinity, 34)).toBe(34);
  });
});

describe('computeLineKlingerVf', () => {
  const highs = KLINGER_DATA.map((p) => p.high);
  const lows = KLINGER_DATA.map((p) => p.low);
  const closes = KLINGER_DATA.map((p) => p.close);
  const volumes = KLINGER_DATA.map((p) => p.volume);

  it('takes the typical price as the high-low-close average', () => {
    const { hlc } = computeLineKlingerVf(highs, lows, closes, volumes);
    expect(hlc).toEqual([13, 7, 19, 5, 23, 3]);
  });

  it('takes the trend as the typical-price direction', () => {
    const { trend } = computeLineKlingerVf(highs, lows, closes, volumes);
    expect(trend).toEqual([1, -1, 1, -1, 1, -1]);
  });

  it('takes the daily measurement as the high-low range', () => {
    const { dm } = computeLineKlingerVf(highs, lows, closes, volumes);
    expect(dm).toEqual([6, 6, 6, 6, 6, 6]);
  });

  it('resets the cumulative measurement when the trend flips', () => {
    const { cm } = computeLineKlingerVf(highs, lows, closes, volumes);
    expect(cm).toEqual([6, 12, 12, 12, 12, 12]);
  });

  it('takes the volume force from volume, trend and the daily ratio', () => {
    const { vf } = computeLineKlingerVf(highs, lows, closes, volumes);
    expect(vf).toEqual([0, -100, 400, -100, 200, -100]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineKlingerVf(null, lows, closes, volumes)).toEqual({
      hlc: [],
      trend: [],
      dm: [],
      cm: [],
      vf: [],
    });
  });
});

describe('computeLineKlingerEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    expect(computeLineKlingerEma([2, 4, 6], 2)).toEqual([null, 3, 5]);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineKlingerEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('skips leading null placeholders before seeding', () => {
    expect(computeLineKlingerEma([null, 6, 9, 12], 2)).toEqual([
      null,
      null,
      7.5,
      10.5,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineKlingerEma(null, 3)).toEqual([]);
  });
});

describe('computeLineKlinger', () => {
  const highs = KLINGER_DATA.map((p) => p.high);
  const lows = KLINGER_DATA.map((p) => p.low);
  const closes = KLINGER_DATA.map((p) => p.close);
  const volumes = KLINGER_DATA.map((p) => p.volume);

  it('exposes the volume force', () => {
    const { vf } = computeLineKlinger(highs, lows, closes, volumes, 1, 3, 3);
    expect(vf).toEqual([0, -100, 400, -100, 200, -100]);
  });

  it('takes the oscillator as the fast minus slow EMA of the volume force', () => {
    const { kvo } = computeLineKlinger(highs, lows, closes, volumes, 1, 3, 3);
    expect(kvo).toEqual([null, null, 300, -100, 100, -100]);
  });

  it('takes the signal line as an EMA of the oscillator', () => {
    const { signal } = computeLineKlinger(
      highs,
      lows,
      closes,
      volumes,
      1,
      3,
      3,
    );
    expect(signal).toEqual([null, null, null, null, 100, 0]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(
      computeLineKlinger(null, lows, closes, volumes, 34, 55, 13),
    ).toEqual({
      vf: [],
      fastEma: [],
      slowEma: [],
      kvo: [],
      signal: [],
    });
  });
});

describe('runLineKlinger', () => {
  it('reports ok with the resolved periods', () => {
    const run = runLineKlinger(KLINGER_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.fastPeriod).toBe(1);
    expect(run.slowPeriod).toBe(3);
    expect(run.signalPeriod).toBe(3);
  });

  it('exposes the volume force, oscillator and signal series', () => {
    const run = runLineKlinger(KLINGER_DATA, RUN_OPTS);
    expect(run.vf).toEqual([0, -100, 400, -100, 200, -100]);
    expect(run.kvo).toEqual([null, null, 300, -100, 100, -100]);
    expect(run.signal).toEqual([null, null, null, null, 100, 0]);
  });

  it('reports the final, min and max oscillator readings', () => {
    const run = runLineKlinger(KLINGER_DATA, RUN_OPTS);
    expect(run.kvoFinal).toBe(-100);
    expect(run.signalFinal).toBe(0);
    expect(run.kvoMin).toBe(-100);
    expect(run.kvoMax).toBe(300);
  });

  it('counts readings above and below the zero line', () => {
    const run = runLineKlinger(KLINGER_DATA, RUN_OPTS);
    expect(run.positiveCount).toBe(2);
    expect(run.negativeCount).toBe(2);
  });

  it('classifies each sample by oscillator sign', () => {
    const run = runLineKlinger(KLINGER_DATA, RUN_OPTS);
    expect(run.samples[0]!.sign).toBe('zero');
    expect(run.samples[2]!.sign).toBe('positive');
    expect(run.samples[3]!.sign).toBe('negative');
    expect(run.samples[4]!.sign).toBe('positive');
    expect(run.samples[5]!.sign).toBe('negative');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...KLINGER_DATA].reverse();
    const run = runLineKlinger(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.vf).toEqual([0, -100, 400, -100, 200, -100]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineKlinger([
      { x: 0, high: 5, low: 1, close: 3, volume: 1 },
    ]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineKlinger([]).ok).toBe(false);
    expect(runLineKlinger(null).ok).toBe(false);
  });

  it('defaults the periods when no options are given', () => {
    const run = runLineKlinger(KLINGER_DATA);
    expect(run.fastPeriod).toBe(DEFAULT_CHART_LINE_KLINGER_FAST_PERIOD);
    expect(run.slowPeriod).toBe(DEFAULT_CHART_LINE_KLINGER_SLOW_PERIOD);
    expect(run.signalPeriod).toBe(DEFAULT_CHART_LINE_KLINGER_SIGNAL_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineKlinger(KLINGER_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(KLINGER_DATA.length);
  });

  it('exposes the volume force on every sample', () => {
    const run = runLineKlinger(KLINGER_DATA, RUN_OPTS);
    expect(run.samples[2]!.vf).toBe(400);
  });
});

describe('computeLineKlingerLayout', () => {
  const base = {
    data: KLINGER_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineKlingerLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(6);
  });

  it('stacks the price panel above the oscillator panel', () => {
    const layout = computeLineKlingerLayout(base);
    expect(layout.kvoPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.kvoPanel.width);
  });

  it('builds non-empty price, oscillator and signal paths', () => {
    const layout = computeLineKlingerLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.kvoPath.startsWith('M')).toBe(true);
    expect(layout.signalPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined oscillator reading', () => {
    const layout = computeLineKlingerLayout(base);
    expect(layout.markers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(6);
  });

  it('places the zero line inside the oscillator panel', () => {
    const layout = computeLineKlingerLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.kvoPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.kvoPanel.y + layout.kvoPanel.height,
    );
  });

  it('uses a symmetric y-bound covering the widest reading', () => {
    const layout = computeLineKlingerLayout(base);
    expect(layout.kvoYBound).toBe(300);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineKlingerLayout(base);
    expect(layout.kvoFinal).toBe(-100);
    expect(layout.positiveCount).toBe(2);
    expect(layout.negativeCount).toBe(2);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineKlingerLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.kvoPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineKlingerLayout({
      ...base,
      data: [{ x: 0, high: 5, low: 1, close: 3, volume: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineKlingerChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineKlingerChart(KLINGER_DATA, RUN_OPTS);
    expect(text).toContain('Klinger Volume Oscillator');
    expect(text).toContain('volume');
    expect(text).toContain('trend');
    expect(text).toContain('signal');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('zero');
  });

  it('reports the EMA periods and reading counts', () => {
    const text = describeLineKlingerChart(KLINGER_DATA, RUN_OPTS);
    expect(text).toContain('EMA 1/3');
    expect(text).toContain('2 readings above');
    expect(text).toContain('2 below');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineKlingerChart([])).toBe('No data');
    expect(describeLineKlingerChart(null)).toBe('No data');
  });
});

describe('<ChartLineKlinger />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-klinger-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Klinger Volume Oscillator');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-klinger"]');
    expect(root!.getAttribute('data-fast-period')).toBe('1');
    expect(root!.getAttribute('data-slow-period')).toBe('3');
    expect(root!.getAttribute('data-signal-period')).toBe('3');
    expect(root!.getAttribute('data-positive-count')).toBe('2');
    expect(root!.getAttribute('data-negative-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('6');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price, oscillator and signal lines', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-klinger-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-klinger-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-klinger-kvo-line"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-klinger-signal-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one marker per defined oscillator reading', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-klinger-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('renders the config badge with the EMA and signal periods', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} />,
    );
    const ema = container.querySelector(
      '[data-section="chart-line-klinger-badge-ema"]',
    );
    const signal = container.querySelector(
      '[data-section="chart-line-klinger-badge-signal"]',
    );
    expect(ema!.textContent).toContain('1/3');
    expect(signal!.textContent).toContain('3');
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-klinger-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-klinger-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-klinger-zero-line"]'),
    ).not.toBeNull();
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineKlinger
        data={KLINGER_DATA}
        {...RUN_OPTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-klinger-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the oscillator line and markers when showKvo is false', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} showKvo={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-klinger-kvo-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-klinger-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the signal line when showSignal is false', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} showSignal={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-klinger-signal-line"]',
      ),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineKlinger
        data={[{ x: 0, high: 5, low: 1, close: 3, volume: 1 }]}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-klinger"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-klinger-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineKlinger
        data={KLINGER_DATA}
        {...RUN_OPTS}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-klinger-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKlinger ref={ref} data={KLINGER_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-klinger',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineKlinger.displayName).toBe('ChartLineKlinger');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineKlinger data={KLINGER_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-klinger"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
