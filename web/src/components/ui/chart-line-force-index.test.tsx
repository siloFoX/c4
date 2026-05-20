import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineForceIndex,
  computeLineForceIndexEma,
  computeLineForceIndexRaw,
  computeLineForceIndex,
  computeLineForceIndexLayout,
  normalizeLineForceIndexPeriod,
  getLineForceIndexFinitePoints,
  runLineForceIndex,
  describeLineForceIndexChart,
  DEFAULT_CHART_LINE_FORCE_INDEX_EMA_PERIOD,
  type ChartLineForceIndexPoint,
} from './chart-line-force-index';

afterEach(() => cleanup());

const FORCE_DATA: ChartLineForceIndexPoint[] = [
  { x: 0, price: 10, volume: 100 },
  { x: 1, price: 12, volume: 100 },
  { x: 2, price: 16, volume: 100 },
  { x: 3, price: 16, volume: 100 },
  { x: 4, price: 14, volume: 100 },
  { x: 5, price: 14, volume: 100 },
];

// Hand-verified for emaPeriod 2:
//   rawForce   = (priceChange) * volume
//              = [null, 200, 400, 0, -200, 0]
//   forceIndex = EMA(rawForce, 2)  (mult 2/3, SMA seed at index 2)
//              = [null, null, 300, 100, -100, -100/3]
const RUN_OPTS = { emaPeriod: 2 };

describe('getLineForceIndexFinitePoints', () => {
  it('keeps only points with finite x, price and volume', () => {
    const points = getLineForceIndexFinitePoints([
      { x: 0, price: 5, volume: 10 },
      { x: NaN, price: 5, volume: 10 },
      { x: 1, price: Infinity, volume: 10 },
      { x: 2, price: 5, volume: NaN },
      { x: 3, price: 9, volume: 20 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 3]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineForceIndexFinitePoints(null)).toEqual([]);
    expect(getLineForceIndexFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineForceIndexPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineForceIndexPeriod(13, 13)).toBe(13);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineForceIndexPeriod(13.8, 13)).toBe(13);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineForceIndexPeriod(0, 13)).toBe(13);
    expect(normalizeLineForceIndexPeriod(-5, 13)).toBe(13);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineForceIndexPeriod(NaN, 13)).toBe(13);
    expect(normalizeLineForceIndexPeriod(Infinity, 13)).toBe(13);
  });
});

describe('computeLineForceIndexEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    // period 2, mult 2/3: seed = mean(2,4) = 3; 6*(2/3) + 3*(1/3) = 5
    expect(computeLineForceIndexEma([2, 4, 6], 2)).toEqual([null, 3, 5]);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineForceIndexEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('skips leading null placeholders before seeding', () => {
    const ema = computeLineForceIndexEma([null, 3, 6, 9], 2);
    expect(ema[0]).toBeNull();
    expect(ema[1]).toBeNull();
    expect(ema[2]).toBe(4.5);
    expect(ema[3]).toBe(7.5);
  });

  it('returns all-null when there are fewer defined values than the period', () => {
    expect(computeLineForceIndexEma([1, 2], 3)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineForceIndexEma(null, 2)).toEqual([]);
  });
});

describe('computeLineForceIndexRaw', () => {
  it('multiplies the price change by the volume', () => {
    const raw = computeLineForceIndexRaw([10, 12, 16], [0, 100, 100]);
    expect(raw[0]).toBeNull();
    expect(raw[1]).toBe(200);
    expect(raw[2]).toBe(400);
  });

  it('produces a negative raw force on a price drop', () => {
    const raw = computeLineForceIndexRaw([10, 8], [0, 50]);
    expect(raw[1]).toBe(-100);
  });

  it('normalises a negative-zero raw force to positive zero', () => {
    const raw = computeLineForceIndexRaw([10, 10], [0, -5]);
    expect(raw[1]).toBe(0);
    expect(Object.is(raw[1], -0)).toBe(false);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineForceIndexRaw(null, [1, 2])).toEqual([]);
    expect(computeLineForceIndexRaw([1, 2], null)).toEqual([]);
  });
});

describe('computeLineForceIndex', () => {
  const prices = FORCE_DATA.map((p) => p.price);
  const volumes = FORCE_DATA.map((p) => p.volume);

  it('matches the hand-verified raw Force Index', () => {
    const { rawForce } = computeLineForceIndex(prices, volumes, 2);
    expect(rawForce).toEqual([null, 200, 400, 0, -200, 0]);
  });

  it('smooths the raw Force Index into the Force Index line', () => {
    const { forceIndex } = computeLineForceIndex(prices, volumes, 2);
    expect(forceIndex[0]).toBeNull();
    expect(forceIndex[1]).toBeNull();
    expect(forceIndex[2]).toBe(300);
    expect(forceIndex[3]!).toBeCloseTo(100, 6);
    expect(forceIndex[4]!).toBeCloseTo(-100, 6);
    expect(forceIndex[5]!).toBeCloseTo(-100 / 3, 6);
  });
});

describe('runLineForceIndex', () => {
  it('reports ok with the resolved EMA period', () => {
    const run = runLineForceIndex(FORCE_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.emaPeriod).toBe(2);
  });

  it('exposes the raw and smoothed Force Index series', () => {
    const run = runLineForceIndex(FORCE_DATA, RUN_OPTS);
    expect(run.rawForce).toEqual([null, 200, 400, 0, -200, 0]);
    expect(run.forceIndex[2]).toBe(300);
  });

  it('reports the final, min and max Force Index readings', () => {
    const run = runLineForceIndex(FORCE_DATA, RUN_OPTS);
    expect(run.forceFinal!).toBeCloseTo(-100 / 3, 6);
    expect(run.rawFinal).toBe(0);
    expect(run.forceMin!).toBeCloseTo(-100, 6);
    expect(run.forceMax).toBe(300);
  });

  it('counts readings above and below the zero line', () => {
    const run = runLineForceIndex(FORCE_DATA, RUN_OPTS);
    expect(run.positiveCount).toBe(2);
    expect(run.negativeCount).toBe(2);
  });

  it('classifies each sample by Force Index sign', () => {
    const run = runLineForceIndex(FORCE_DATA, RUN_OPTS);
    expect(run.samples[0]!.sign).toBe('zero');
    expect(run.samples[2]!.sign).toBe('positive');
    expect(run.samples[3]!.sign).toBe('positive');
    expect(run.samples[4]!.sign).toBe('negative');
    expect(run.samples[5]!.sign).toBe('negative');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...FORCE_DATA].reverse();
    const run = runLineForceIndex(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.rawForce).toEqual([null, 200, 400, 0, -200, 0]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineForceIndex([{ x: 0, price: 1, volume: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineForceIndex([]).ok).toBe(false);
    expect(runLineForceIndex(null).ok).toBe(false);
  });

  it('defaults the EMA period when no options are given', () => {
    const run = runLineForceIndex(FORCE_DATA);
    expect(run.emaPeriod).toBe(DEFAULT_CHART_LINE_FORCE_INDEX_EMA_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineForceIndex(FORCE_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(FORCE_DATA.length);
  });
});

describe('computeLineForceIndexLayout', () => {
  const base = {
    data: FORCE_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineForceIndexLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(6);
  });

  it('stacks the price panel above the Force Index panel', () => {
    const layout = computeLineForceIndexLayout(base);
    expect(layout.forcePanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.forcePanel.width);
  });

  it('builds non-empty price, raw and Force Index paths', () => {
    const layout = computeLineForceIndexLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.rawPath.startsWith('M')).toBe(true);
    expect(layout.forcePath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined Force Index reading', () => {
    const layout = computeLineForceIndexLayout(base);
    expect(layout.markers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(6);
  });

  it('places the zero line inside the Force Index panel', () => {
    const layout = computeLineForceIndexLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.forcePanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.forcePanel.y + layout.forcePanel.height,
    );
  });

  it('uses a symmetric y-bound covering the widest raw and smoothed reading', () => {
    const layout = computeLineForceIndexLayout(base);
    expect(layout.forceYBound).toBe(400);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineForceIndexLayout(base);
    expect(layout.forceMin!).toBeCloseTo(-100, 6);
    expect(layout.forceMax).toBe(300);
    expect(layout.positiveCount).toBe(2);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineForceIndexLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.forcePath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineForceIndexLayout({
      ...base,
      data: [{ x: 0, price: 1, volume: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineForceIndexChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineForceIndexChart(FORCE_DATA, RUN_OPTS);
    expect(text).toContain('Elder Force Index');
    expect(text).toContain('Force Index');
    expect(text).toContain('volume');
    expect(text).toContain('price change');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('power');
    expect(text).toContain('zero');
  });

  it('reports the EMA period and the reading counts', () => {
    const text = describeLineForceIndexChart(FORCE_DATA, RUN_OPTS);
    expect(text).toContain('EMA 2');
    expect(text).toContain('2 readings above');
    expect(text).toContain('2 below');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineForceIndexChart([])).toBe('No data');
    expect(describeLineForceIndexChart(null)).toBe('No data');
  });
});

describe('<ChartLineForceIndex />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-force-index-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Force Index');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-force-index"]',
    );
    expect(root!.getAttribute('data-ema-period')).toBe('2');
    expect(root!.getAttribute('data-positive-count')).toBe('2');
    expect(root!.getAttribute('data-negative-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('6');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price, raw and Force Index lines', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-force-index-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-force-index-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-force-index-raw-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-force-index-force-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one marker per defined Force Index reading', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-force-index-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('renders the config badge with the EMA period', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} />,
    );
    const ema = container.querySelector(
      '[data-section="chart-line-force-index-badge-ema"]',
    );
    expect(ema!.textContent).toContain('2');
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-force-index-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-force-index-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineForceIndex
        data={FORCE_DATA}
        {...RUN_OPTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-force-index-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the Force Index line when showForce is false', () => {
    const { container } = render(
      <ChartLineForceIndex
        data={FORCE_DATA}
        {...RUN_OPTS}
        showForce={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-force-index-force-line"]',
      ),
    ).toBeNull();
  });

  it('hides the raw Force line when showRaw is false', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} showRaw={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-force-index-raw-line"]',
      ),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineForceIndex data={[{ x: 0, price: 1, volume: 1 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-force-index"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-force-index-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineForceIndex
        data={FORCE_DATA}
        {...RUN_OPTS}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-force-index-badge"]',
      ),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineForceIndex ref={ref} data={FORCE_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-force-index',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineForceIndex.displayName).toBe('ChartLineForceIndex');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineForceIndex data={FORCE_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-force-index"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
