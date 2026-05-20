import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineRvi,
  computeLineRviSwma,
  computeLineRviSma,
  computeLineRvi,
  computeLineRviLayout,
  normalizeLineRviPeriod,
  getLineRviFinitePoints,
  runLineRvi,
  describeLineRviChart,
  DEFAULT_CHART_LINE_RVI_PERIOD,
  type ChartLineRviPoint,
} from './chart-line-rvi';

afterEach(() => cleanup());

// open 10, high 30, low 6 throughout; close 16 (bars 0-5) or 22 (bars 6-9).
// The OHLC values are chosen so close-open and high-low land on clean
// integers through the 1/2/2/1 symmetric weighted average.
const RVI_DATA: ChartLineRviPoint[] = [
  { x: 0, open: 10, high: 30, low: 6, close: 16 },
  { x: 1, open: 10, high: 30, low: 6, close: 16 },
  { x: 2, open: 10, high: 30, low: 6, close: 16 },
  { x: 3, open: 10, high: 30, low: 6, close: 16 },
  { x: 4, open: 10, high: 30, low: 6, close: 16 },
  { x: 5, open: 10, high: 30, low: 6, close: 16 },
  { x: 6, open: 10, high: 30, low: 6, close: 22 },
  { x: 7, open: 10, high: 30, low: 6, close: 22 },
  { x: 8, open: 10, high: 30, low: 6, close: 22 },
  { x: 9, open: 10, high: 30, low: 6, close: 22 },
];

// Hand-verified for period 2:
//   co = close - open = [6,6,6,6,6,6,12,12,12,12]
//   hl = high - low   = [24,24,24,24,24,24,24,24,24,24]
//   numerator   = SWMA(co) = [.,.,.,6,6,6,7,9,11,12]
//   denominator = SWMA(hl) = [.,.,.,24,24,24,24,24,24,24]
//   rvi = SMA(numerator,2) / SMA(denominator,2)
//       = [.,.,.,.,0.25,0.25,6.5/24,8/24,10/24,11.5/24]
//   signal = SWMA(rvi) = [.,.,.,.,.,.,.,39/144,0.3125,0.375]
const RUN_OPTS = { period: 2 };

describe('getLineRviFinitePoints', () => {
  it('keeps only points with finite x, open, high, low and close', () => {
    const points = getLineRviFinitePoints([
      { x: 0, open: 1, high: 2, low: 0, close: 1 },
      { x: NaN, open: 1, high: 2, low: 0, close: 1 },
      { x: 1, open: Infinity, high: 2, low: 0, close: 1 },
      { x: 2, open: 1, high: 2, low: 0, close: NaN },
      { x: 3, open: 5, high: 9, low: 4, close: 7 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 3]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineRviFinitePoints(null)).toEqual([]);
    expect(getLineRviFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineRviPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineRviPeriod(10, 10)).toBe(10);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineRviPeriod(10.8, 10)).toBe(10);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineRviPeriod(0, 10)).toBe(10);
    expect(normalizeLineRviPeriod(-4, 10)).toBe(10);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineRviPeriod(NaN, 10)).toBe(10);
    expect(normalizeLineRviPeriod(Infinity, 10)).toBe(10);
  });
});

describe('computeLineRviSwma', () => {
  it('applies the fixed 1/2/2/1 symmetric weighted average', () => {
    expect(computeLineRviSwma([6, 6, 6, 6])).toEqual([null, null, null, 6]);
  });

  it('weights the two middle bars double', () => {
    // (6 + 2*12 + 2*6 + 0) / 6 = 42/6 = 7
    const swma = computeLineRviSwma([0, 6, 12, 6, 0]);
    expect(swma[3]).toBe(7);
    expect(swma[4]).toBe(7);
  });

  it('leaves a window containing a null undefined', () => {
    const swma = computeLineRviSwma([null, 1, 2, 3, 4]);
    expect(swma[3]).toBeNull();
    expect(swma[4]).toBe(2.5);
  });

  it('leaves all indices null when there are fewer than four bars', () => {
    expect(computeLineRviSwma([1, 2, 3])).toEqual([null, null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineRviSwma(null)).toEqual([]);
  });
});

describe('computeLineRviSma', () => {
  it('averages each window of the period', () => {
    expect(computeLineRviSma([2, 4, 6, 8], 2)).toEqual([null, 3, 5, 7]);
  });

  it('leaves a window containing a null undefined', () => {
    expect(computeLineRviSma([null, 2, 4, 6], 2)).toEqual([
      null,
      null,
      3,
      5,
    ]);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineRviSma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineRviSma(null, 2)).toEqual([]);
  });
});

describe('computeLineRvi', () => {
  const opens = RVI_DATA.map((p) => p.open);
  const highs = RVI_DATA.map((p) => p.high);
  const lows = RVI_DATA.map((p) => p.low);
  const closes = RVI_DATA.map((p) => p.close);

  it('takes the close-open and high-low spans', () => {
    const { co, hl } = computeLineRvi(opens, highs, lows, closes, 2);
    expect(co).toEqual([6, 6, 6, 6, 6, 6, 12, 12, 12, 12]);
    expect(hl).toEqual([24, 24, 24, 24, 24, 24, 24, 24, 24, 24]);
  });

  it('runs the spans through the symmetric weighted average', () => {
    const { numerator, denominator } = computeLineRvi(
      opens,
      highs,
      lows,
      closes,
      2,
    );
    expect(numerator).toEqual([null, null, null, 6, 6, 6, 7, 9, 11, 12]);
    expect(denominator).toEqual([
      null,
      null,
      null,
      24,
      24,
      24,
      24,
      24,
      24,
      24,
    ]);
  });

  it('divides the smoothed numerator by the smoothed denominator', () => {
    const { rvi } = computeLineRvi(opens, highs, lows, closes, 2);
    expect(rvi[3]).toBeNull();
    expect(rvi[4]).toBe(0.25);
    expect(rvi[5]).toBe(0.25);
    expect(rvi[9]!).toBeCloseTo(11.5 / 24, 6);
  });

  it('takes the signal line as the symmetric weighted average of the RVI', () => {
    const { signal } = computeLineRvi(opens, highs, lows, closes, 2);
    expect(signal[6]).toBeNull();
    expect(signal[8]!).toBeCloseTo(0.3125, 6);
    expect(signal[9]!).toBeCloseTo(0.375, 6);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineRvi(null, highs, lows, closes, 10)).toEqual({
      co: [],
      hl: [],
      numerator: [],
      denominator: [],
      rvi: [],
      signal: [],
    });
  });
});

describe('runLineRvi', () => {
  it('reports ok with the resolved period', () => {
    const run = runLineRvi(RVI_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.period).toBe(2);
  });

  it('exposes the RVI and signal series', () => {
    const run = runLineRvi(RVI_DATA, RUN_OPTS);
    expect(run.rvi[4]).toBe(0.25);
    expect(run.rvi[9]!).toBeCloseTo(11.5 / 24, 6);
    expect(run.signal[9]!).toBeCloseTo(0.375, 6);
  });

  it('exposes the close-open and high-low spans', () => {
    const run = runLineRvi(RVI_DATA, RUN_OPTS);
    expect(run.co).toEqual([6, 6, 6, 6, 6, 6, 12, 12, 12, 12]);
    expect(run.hl).toEqual([24, 24, 24, 24, 24, 24, 24, 24, 24, 24]);
  });

  it('reports the final, min and max RVI readings', () => {
    const run = runLineRvi(RVI_DATA, RUN_OPTS);
    expect(run.rviFinal!).toBeCloseTo(11.5 / 24, 6);
    expect(run.signalFinal!).toBeCloseTo(0.375, 6);
    expect(run.rviMin).toBe(0.25);
    expect(run.rviMax!).toBeCloseTo(11.5 / 24, 6);
  });

  it('counts readings above and below the zero line', () => {
    const run = runLineRvi(RVI_DATA, RUN_OPTS);
    expect(run.positiveCount).toBe(6);
    expect(run.negativeCount).toBe(0);
  });

  it('classifies each sample by RVI sign', () => {
    const run = runLineRvi(RVI_DATA, RUN_OPTS);
    expect(run.samples[0]!.sign).toBe('zero');
    expect(run.samples[3]!.sign).toBe('zero');
    expect(run.samples[4]!.sign).toBe('positive');
    expect(run.samples[9]!.sign).toBe('positive');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...RVI_DATA].reverse();
    const run = runLineRvi(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(run.rvi[4]).toBe(0.25);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineRvi([
      { x: 0, open: 1, high: 2, low: 0, close: 1 },
    ]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineRvi([]).ok).toBe(false);
    expect(runLineRvi(null).ok).toBe(false);
  });

  it('defaults the period when no options are given', () => {
    const run = runLineRvi(RVI_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_RVI_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineRvi(RVI_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(RVI_DATA.length);
  });
});

describe('computeLineRviLayout', () => {
  const base = {
    data: RVI_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineRviLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('stacks the price panel above the RVI panel', () => {
    const layout = computeLineRviLayout(base);
    expect(layout.rviPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.rviPanel.width);
  });

  it('builds non-empty close, band, RVI and signal paths', () => {
    const layout = computeLineRviLayout(base);
    expect(layout.closePath.startsWith('M')).toBe(true);
    expect(layout.bandPath.startsWith('M')).toBe(true);
    expect(layout.bandPath.endsWith('Z')).toBe(true);
    expect(layout.rviPath.startsWith('M')).toBe(true);
    expect(layout.signalPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined RVI reading', () => {
    const layout = computeLineRviLayout(base);
    expect(layout.markers).toHaveLength(6);
    expect(layout.priceDots).toHaveLength(10);
  });

  it('places the zero line inside the RVI panel', () => {
    const layout = computeLineRviLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.rviPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.rviPanel.y + layout.rviPanel.height,
    );
  });

  it('uses a symmetric y-bound covering the widest reading', () => {
    const layout = computeLineRviLayout(base);
    expect(layout.rviYBound).toBeCloseTo(11.5 / 24, 6);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineRviLayout(base);
    expect(layout.positiveCount).toBe(6);
    expect(layout.rviMin).toBe(0.25);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineRviLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.rviPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineRviLayout({
      ...base,
      data: [{ x: 0, open: 1, high: 2, low: 0, close: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineRviChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineRviChart(RVI_DATA, RUN_OPTS);
    expect(text).toContain('Relative Vigor Index');
    expect(text).toContain('RVI');
    expect(text).toContain('vigor');
    expect(text).toContain('close-open');
    expect(text).toContain('high-low range');
    expect(text).toContain('signal');
    expect(text).toContain('zero');
  });

  it('reports the period and the reading counts', () => {
    const text = describeLineRviChart(RVI_DATA, RUN_OPTS);
    expect(text).toContain('period 2');
    expect(text).toContain('6 readings above');
    expect(text).toContain('0 below');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineRviChart([])).toBe('No data');
    expect(describeLineRviChart(null)).toBe('No data');
  });
});

describe('<ChartLineRvi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineRvi data={RVI_DATA} {...RUN_OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineRvi data={RVI_DATA} {...RUN_OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-rvi-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Relative Vigor Index');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineRvi data={RVI_DATA} {...RUN_OPTS} />);
    const root = container.querySelector('[data-section="chart-line-rvi"]');
    expect(root!.getAttribute('data-period')).toBe('2');
    expect(root!.getAttribute('data-positive-count')).toBe('6');
    expect(root!.getAttribute('data-negative-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the close, RVI and signal lines', () => {
    const { container } = render(<ChartLineRvi data={RVI_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-rvi-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-rvi-close-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-rvi-rvi-line"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-rvi-signal-line"]'),
    ).not.toBeNull();
  });

  it('renders the high-low band by default', () => {
    const { container } = render(<ChartLineRvi data={RVI_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-rvi-band"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined RVI reading', () => {
    const { container } = render(<ChartLineRvi data={RVI_DATA} {...RUN_OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-rvi-marker"]',
    );
    expect(markers).toHaveLength(6);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineRvi data={RVI_DATA} {...RUN_OPTS} />);
    const period = container.querySelector(
      '[data-section="chart-line-rvi-badge-period"]',
    );
    expect(period!.textContent).toContain('2');
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineRvi data={RVI_DATA} {...RUN_OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-rvi-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a three-item legend', () => {
    const { container } = render(<ChartLineRvi data={RVI_DATA} {...RUN_OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-rvi-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });

  it('hides the close path and band when close is hidden', () => {
    const { container } = render(
      <ChartLineRvi data={RVI_DATA} {...RUN_OPTS} hiddenSeries={['close']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rvi-close-path"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-rvi-band"]'),
    ).toBeNull();
  });

  it('hides the RVI line when showRvi is false', () => {
    const { container } = render(
      <ChartLineRvi data={RVI_DATA} {...RUN_OPTS} showRvi={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rvi-rvi-line"]'),
    ).toBeNull();
  });

  it('hides the signal line when showSignal is false', () => {
    const { container } = render(
      <ChartLineRvi data={RVI_DATA} {...RUN_OPTS} showSignal={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rvi-signal-line"]'),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineRvi data={[{ x: 0, open: 1, high: 2, low: 0, close: 1 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-rvi"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-rvi-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineRvi data={RVI_DATA} {...RUN_OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rvi-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRvi ref={ref} data={RVI_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-rvi');
  });

  it('has a stable displayName', () => {
    expect(ChartLineRvi.displayName).toBe('ChartLineRvi');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineRvi data={RVI_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-rvi"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
