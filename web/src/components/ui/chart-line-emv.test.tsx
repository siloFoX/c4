import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineEmv,
  computeLineEmvSma,
  computeLineEmvRaw,
  computeLineEmv,
  computeLineEmvLayout,
  normalizeLineEmvPeriod,
  getLineEmvFinitePoints,
  runLineEmv,
  describeLineEmvChart,
  DEFAULT_CHART_LINE_EMV_SMA_PERIOD,
  DEFAULT_CHART_LINE_EMV_VOLUME_DIVISOR,
  type ChartLineEmvPoint,
} from './chart-line-emv';

afterEach(() => cleanup());

const EMV_DATA: ChartLineEmvPoint[] = [
  { x: 0, high: 12, low: 8, volume: 8 },
  { x: 1, high: 16, low: 12, volume: 8 },
  { x: 2, high: 22, low: 18, volume: 8 },
  { x: 3, high: 20, low: 16, volume: 8 },
  { x: 4, high: 14, low: 10, volume: 8 },
];

// Hand-verified for smaPeriod 2, volumeDivisor 1:
//   midpoint = [10, 14, 20, 18, 12]   range = [4,4,4,4,4]
//   emv1[i]  = distanceMoved * range / volume
//            = [null, 2, 3, -1, -3]
//   emv      = SMA(emv1, 2) = [null, null, 2.5, 1, -2]
const RUN_OPTS = { smaPeriod: 2, volumeDivisor: 1 };

describe('getLineEmvFinitePoints', () => {
  it('keeps only points with finite x, high, low and volume', () => {
    const points = getLineEmvFinitePoints([
      { x: 0, high: 5, low: 1, volume: 10 },
      { x: NaN, high: 5, low: 1, volume: 10 },
      { x: 1, high: Infinity, low: 1, volume: 10 },
      { x: 2, high: 5, low: 1, volume: NaN },
      { x: 3, high: 9, low: 2, volume: 20 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 3]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineEmvFinitePoints(null)).toEqual([]);
    expect(getLineEmvFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineEmvPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineEmvPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineEmvPeriod(14.9, 14)).toBe(14);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineEmvPeriod(0, 14)).toBe(14);
    expect(normalizeLineEmvPeriod(-3, 14)).toBe(14);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineEmvPeriod(NaN, 14)).toBe(14);
    expect(normalizeLineEmvPeriod(Infinity, 14)).toBe(14);
  });
});

describe('computeLineEmvSma', () => {
  it('averages each window of the period', () => {
    expect(computeLineEmvSma([2, 4, 6, 8], 2)).toEqual([null, 3, 5, 7]);
  });

  it('leaves a window containing a null undefined', () => {
    expect(computeLineEmvSma([null, 2, 4, 6], 2)).toEqual([
      null,
      null,
      3,
      5,
    ]);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineEmvSma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('leaves indices before the first full window null', () => {
    expect(computeLineEmvSma([1], 2)).toEqual([null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineEmvSma(null, 2)).toEqual([]);
  });
});

describe('computeLineEmvRaw', () => {
  it('divides the midpoint move by the box ratio', () => {
    // midpoint [10,14], distanceMoved 4, range 4, volume 8 -> 4*4/8 = 2
    const raw = computeLineEmvRaw([12, 16], [8, 12], [8, 8], 1);
    expect(raw[0]).toBeNull();
    expect(raw[1]).toBe(2);
  });

  it('produces a negative reading on a downward midpoint move', () => {
    const raw = computeLineEmvRaw([20, 16], [16, 12], [8, 8], 1);
    expect(raw[1]).toBe(-2);
  });

  it('scales the reading by the volume divisor', () => {
    const raw = computeLineEmvRaw([12, 16], [8, 12], [8, 8], 2);
    expect(raw[1]).toBe(4);
  });

  it('reads zero when the volume is zero', () => {
    const raw = computeLineEmvRaw([12, 16], [8, 12], [8, 0], 1);
    expect(raw[1]).toBe(0);
  });

  it('reads zero when the bar range is zero', () => {
    const raw = computeLineEmvRaw([8, 14], [4, 14], [10, 10], 1);
    expect(raw[1]).toBe(0);
  });

  it('normalises a negative-zero reading to positive zero', () => {
    const raw = computeLineEmvRaw([10, 14], [10, 6], [100, -5], 1);
    expect(raw[1]).toBe(0);
    expect(Object.is(raw[1], -0)).toBe(false);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineEmvRaw(null, [1], [1], 1)).toEqual([]);
  });
});

describe('computeLineEmv', () => {
  const highs = EMV_DATA.map((p) => p.high);
  const lows = EMV_DATA.map((p) => p.low);
  const volumes = EMV_DATA.map((p) => p.volume);

  it('takes the midpoint as the high-low average', () => {
    const { midpoint } = computeLineEmv(highs, lows, volumes, 2, 1);
    expect(midpoint).toEqual([10, 14, 20, 18, 12]);
  });

  it('takes the range as high minus low', () => {
    const { range } = computeLineEmv(highs, lows, volumes, 2, 1);
    expect(range).toEqual([4, 4, 4, 4, 4]);
  });

  it('matches the hand-verified raw EMV', () => {
    const { emv1 } = computeLineEmv(highs, lows, volumes, 2, 1);
    expect(emv1).toEqual([null, 2, 3, -1, -3]);
  });

  it('smooths the raw EMV into the Ease of Movement', () => {
    const { emv } = computeLineEmv(highs, lows, volumes, 2, 1);
    expect(emv).toEqual([null, null, 2.5, 1, -2]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineEmv(null, lows, volumes, 14, 1)).toEqual({
      midpoint: [],
      range: [],
      emv1: [],
      emv: [],
    });
  });
});

describe('runLineEmv', () => {
  it('reports ok with the resolved period and divisor', () => {
    const run = runLineEmv(EMV_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.smaPeriod).toBe(2);
    expect(run.volumeDivisor).toBe(1);
  });

  it('exposes the raw and smoothed EMV series', () => {
    const run = runLineEmv(EMV_DATA, RUN_OPTS);
    expect(run.emv1).toEqual([null, 2, 3, -1, -3]);
    expect(run.emv).toEqual([null, null, 2.5, 1, -2]);
  });

  it('reports the final, min and max EMV readings', () => {
    const run = runLineEmv(EMV_DATA, RUN_OPTS);
    expect(run.emvFinal).toBe(-2);
    expect(run.emvMin).toBe(-2);
    expect(run.emvMax).toBe(2.5);
  });

  it('counts readings above and below the zero line', () => {
    const run = runLineEmv(EMV_DATA, RUN_OPTS);
    expect(run.positiveCount).toBe(2);
    expect(run.negativeCount).toBe(1);
  });

  it('classifies each sample by EMV sign', () => {
    const run = runLineEmv(EMV_DATA, RUN_OPTS);
    expect(run.samples[0]!.sign).toBe('zero');
    expect(run.samples[2]!.sign).toBe('positive');
    expect(run.samples[3]!.sign).toBe('positive');
    expect(run.samples[4]!.sign).toBe('negative');
  });

  it('falls back to the default divisor for a non-positive divisor', () => {
    const run = runLineEmv(EMV_DATA, { smaPeriod: 2, volumeDivisor: 0 });
    expect(run.volumeDivisor).toBe(DEFAULT_CHART_LINE_EMV_VOLUME_DIVISOR);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...EMV_DATA].reverse();
    const run = runLineEmv(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.emv1).toEqual([null, 2, 3, -1, -3]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineEmv([{ x: 0, high: 5, low: 1, volume: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineEmv([]).ok).toBe(false);
    expect(runLineEmv(null).ok).toBe(false);
  });

  it('defaults the period and divisor when no options are given', () => {
    const run = runLineEmv(EMV_DATA);
    expect(run.smaPeriod).toBe(DEFAULT_CHART_LINE_EMV_SMA_PERIOD);
    expect(run.volumeDivisor).toBe(DEFAULT_CHART_LINE_EMV_VOLUME_DIVISOR);
  });

  it('produces one sample per series point', () => {
    const run = runLineEmv(EMV_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(EMV_DATA.length);
  });
});

describe('computeLineEmvLayout', () => {
  const base = {
    data: EMV_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineEmvLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('stacks the price panel above the EMV panel', () => {
    const layout = computeLineEmvLayout(base);
    expect(layout.emvPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.emvPanel.width);
  });

  it('builds non-empty midpoint, band and EMV paths', () => {
    const layout = computeLineEmvLayout(base);
    expect(layout.midpointPath.startsWith('M')).toBe(true);
    expect(layout.bandPath.startsWith('M')).toBe(true);
    expect(layout.bandPath.endsWith('Z')).toBe(true);
    expect(layout.emvPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined EMV reading', () => {
    const layout = computeLineEmvLayout(base);
    expect(layout.markers).toHaveLength(3);
    expect(layout.priceDots).toHaveLength(5);
  });

  it('places the zero line inside the EMV panel', () => {
    const layout = computeLineEmvLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.emvPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.emvPanel.y + layout.emvPanel.height,
    );
  });

  it('uses a symmetric y-bound covering the widest EMV reading', () => {
    const layout = computeLineEmvLayout(base);
    expect(layout.emvYBound).toBe(2.5);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineEmvLayout(base);
    expect(layout.emvFinal).toBe(-2);
    expect(layout.positiveCount).toBe(2);
    expect(layout.negativeCount).toBe(1);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineEmvLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.emvPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineEmvLayout({
      ...base,
      data: [{ x: 0, high: 5, low: 1, volume: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineEmvChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineEmvChart(EMV_DATA, RUN_OPTS);
    expect(text).toContain('Ease of Movement');
    expect(text).toContain('EMV');
    expect(text).toContain('volume');
    expect(text).toContain('price change');
    expect(text).toContain('simple moving average');
    expect(text).toContain('range');
    expect(text).toContain('zero');
  });

  it('reports the SMA period and the reading counts', () => {
    const text = describeLineEmvChart(EMV_DATA, RUN_OPTS);
    expect(text).toContain('SMA 2');
    expect(text).toContain('2 readings above');
    expect(text).toContain('1 below');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineEmvChart([])).toBe('No data');
    expect(describeLineEmvChart(null)).toBe('No data');
  });
});

describe('<ChartLineEmv />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineEmv data={EMV_DATA} {...RUN_OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineEmv data={EMV_DATA} {...RUN_OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-emv-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Ease of Movement');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineEmv data={EMV_DATA} {...RUN_OPTS} />);
    const root = container.querySelector('[data-section="chart-line-emv"]');
    expect(root!.getAttribute('data-sma-period')).toBe('2');
    expect(root!.getAttribute('data-volume-divisor')).toBe('1');
    expect(root!.getAttribute('data-positive-count')).toBe('2');
    expect(root!.getAttribute('data-negative-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the midpoint and EMV lines', () => {
    const { container } = render(<ChartLineEmv data={EMV_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-emv-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-emv-midpoint-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-emv-emv-line"]'),
    ).not.toBeNull();
  });

  it('renders the high-low band by default', () => {
    const { container } = render(<ChartLineEmv data={EMV_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-emv-band"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined EMV reading', () => {
    const { container } = render(<ChartLineEmv data={EMV_DATA} {...RUN_OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-emv-marker"]',
    );
    expect(markers).toHaveLength(3);
  });

  it('renders the config badge with the SMA period', () => {
    const { container } = render(<ChartLineEmv data={EMV_DATA} {...RUN_OPTS} />);
    const sma = container.querySelector(
      '[data-section="chart-line-emv-badge-sma"]',
    );
    expect(sma!.textContent).toContain('2');
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineEmv data={EMV_DATA} {...RUN_OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-emv-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineEmv data={EMV_DATA} {...RUN_OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-emv-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('hides the midpoint path and band when midpoint is hidden', () => {
    const { container } = render(
      <ChartLineEmv
        data={EMV_DATA}
        {...RUN_OPTS}
        hiddenSeries={['midpoint']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-emv-midpoint-path"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-emv-band"]'),
    ).toBeNull();
  });

  it('hides the EMV line when showEmv is false', () => {
    const { container } = render(
      <ChartLineEmv data={EMV_DATA} {...RUN_OPTS} showEmv={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-emv-emv-line"]'),
    ).toBeNull();
  });

  it('hides the band when showBand is false', () => {
    const { container } = render(
      <ChartLineEmv data={EMV_DATA} {...RUN_OPTS} showBand={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-emv-band"]'),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineEmv data={[{ x: 0, high: 5, low: 1, volume: 1 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-emv"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-emv-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineEmv data={EMV_DATA} {...RUN_OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-emv-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineEmv ref={ref} data={EMV_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-emv');
  });

  it('has a stable displayName', () => {
    expect(ChartLineEmv.displayName).toBe('ChartLineEmv');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineEmv data={EMV_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-emv"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
