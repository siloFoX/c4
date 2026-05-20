import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineElderRay,
  computeLineElderRayEma,
  computeLineElderRay,
  computeLineElderRayLayout,
  normalizeLineElderRayPeriod,
  getLineElderRayFinitePoints,
  runLineElderRay,
  describeLineElderRayChart,
  DEFAULT_CHART_LINE_ELDER_RAY_EMA_PERIOD,
  type ChartLineElderRayPoint,
} from './chart-line-elder-ray';

afterEach(() => cleanup());

const ELDER_DATA: ChartLineElderRayPoint[] = [
  { x: 0, high: 10, low: 2, close: 4 },
  { x: 1, high: 10, low: 2, close: 4 },
  { x: 2, high: 10, low: 1, close: 4 },
  { x: 3, high: 14, low: 5, close: 12 },
  { x: 4, high: 18, low: 4, close: 12 },
  { x: 5, high: 15, low: 9, close: 12 },
];

// Hand-verified for emaPeriod 3:
//   ema       = EMA(close, 3) = [null,null,4,8,10,11]   (mult 0.5)
//   bullPower = high - ema    = [null,null,6,6,8,4]
//   bearPower = low - ema     = [null,null,-3,-3,-6,-2]
const RUN_OPTS = { emaPeriod: 3 };

describe('getLineElderRayFinitePoints', () => {
  it('keeps only points with finite x, high, low and close', () => {
    const points = getLineElderRayFinitePoints([
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
    expect(getLineElderRayFinitePoints(null)).toEqual([]);
    expect(getLineElderRayFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineElderRayPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineElderRayPeriod(13, 13)).toBe(13);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineElderRayPeriod(13.9, 13)).toBe(13);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineElderRayPeriod(0, 13)).toBe(13);
    expect(normalizeLineElderRayPeriod(-2, 13)).toBe(13);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineElderRayPeriod(NaN, 13)).toBe(13);
    expect(normalizeLineElderRayPeriod(Infinity, 13)).toBe(13);
  });
});

describe('computeLineElderRayEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    expect(computeLineElderRayEma([2, 4, 6], 2)).toEqual([null, 3, 5]);
  });

  it('uses the period-length mean as the seed', () => {
    const ema = computeLineElderRayEma([4, 4, 4, 12], 3);
    expect(ema[2]).toBe(4);
    expect(ema[3]).toBe(8);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineElderRayEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineElderRayEma(null, 2)).toEqual([]);
  });
});

describe('computeLineElderRay', () => {
  const highs = ELDER_DATA.map((p) => p.high);
  const lows = ELDER_DATA.map((p) => p.low);
  const closes = ELDER_DATA.map((p) => p.close);

  it('takes the EMA of the close as the trend baseline', () => {
    const { ema } = computeLineElderRay(highs, lows, closes, 3);
    expect(ema).toEqual([null, null, 4, 8, 10, 11]);
  });

  it('takes bull power as the high minus the baseline', () => {
    const { bullPower } = computeLineElderRay(highs, lows, closes, 3);
    expect(bullPower).toEqual([null, null, 6, 6, 8, 4]);
  });

  it('takes bear power as the low minus the baseline', () => {
    const { bearPower } = computeLineElderRay(highs, lows, closes, 3);
    expect(bearPower).toEqual([null, null, -3, -3, -6, -2]);
  });

  it('leaves power undefined before the baseline is defined', () => {
    const { bullPower, bearPower } = computeLineElderRay(
      highs,
      lows,
      closes,
      3,
    );
    expect(bullPower[1]).toBeNull();
    expect(bearPower[1]).toBeNull();
    expect(bullPower[2]).toBe(6);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineElderRay(null, lows, closes, 13)).toEqual({
      ema: [],
      bullPower: [],
      bearPower: [],
    });
  });
});

describe('runLineElderRay', () => {
  it('reports ok with the resolved EMA period', () => {
    const run = runLineElderRay(ELDER_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.emaPeriod).toBe(3);
  });

  it('exposes the bull and bear power series', () => {
    const run = runLineElderRay(ELDER_DATA, RUN_OPTS);
    expect(run.bullPower).toEqual([null, null, 6, 6, 8, 4]);
    expect(run.bearPower).toEqual([null, null, -3, -3, -6, -2]);
  });

  it('reports the final, max and min power readings', () => {
    const run = runLineElderRay(ELDER_DATA, RUN_OPTS);
    expect(run.bullFinal).toBe(4);
    expect(run.bearFinal).toBe(-2);
    expect(run.bullMax).toBe(8);
    expect(run.bearMin).toBe(-6);
  });

  it('counts positive bull power and negative bear power bars', () => {
    const run = runLineElderRay(ELDER_DATA, RUN_OPTS);
    expect(run.bullPositiveCount).toBe(4);
    expect(run.bearNegativeCount).toBe(4);
  });

  it('exposes per-sample bull and bear power', () => {
    const run = runLineElderRay(ELDER_DATA, RUN_OPTS);
    expect(run.samples[1]!.bullPower).toBeNull();
    expect(run.samples[4]!.bullPower).toBe(8);
    expect(run.samples[4]!.bearPower).toBe(-6);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...ELDER_DATA].reverse();
    const run = runLineElderRay(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.bullPower[4]).toBe(8);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineElderRay([{ x: 0, high: 5, low: 1, close: 3 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineElderRay([]).ok).toBe(false);
    expect(runLineElderRay(null).ok).toBe(false);
  });

  it('defaults the EMA period when no options are given', () => {
    const run = runLineElderRay(ELDER_DATA);
    expect(run.emaPeriod).toBe(DEFAULT_CHART_LINE_ELDER_RAY_EMA_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineElderRay(ELDER_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(ELDER_DATA.length);
  });
});

describe('computeLineElderRayLayout', () => {
  const base = {
    data: ELDER_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineElderRayLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(6);
  });

  it('stacks the price panel above the Elder Ray panel', () => {
    const layout = computeLineElderRayLayout(base);
    expect(layout.rayPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.rayPanel.width);
  });

  it('builds non-empty close, EMA, bull and bear paths', () => {
    const layout = computeLineElderRayLayout(base);
    expect(layout.closePath.startsWith('M')).toBe(true);
    expect(layout.emaPath.startsWith('M')).toBe(true);
    expect(layout.bullPath.startsWith('M')).toBe(true);
    expect(layout.bearPath.startsWith('M')).toBe(true);
  });

  it('emits one bull and one bear marker per defined reading', () => {
    const layout = computeLineElderRayLayout(base);
    expect(layout.bullMarkers).toHaveLength(4);
    expect(layout.bearMarkers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(6);
  });

  it('places the zero line inside the Elder Ray panel', () => {
    const layout = computeLineElderRayLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.rayPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.rayPanel.y + layout.rayPanel.height,
    );
  });

  it('uses a symmetric y-bound covering the widest power reading', () => {
    const layout = computeLineElderRayLayout(base);
    expect(layout.rayYBound).toBe(8);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineElderRayLayout(base);
    expect(layout.bullPositiveCount).toBe(4);
    expect(layout.bearNegativeCount).toBe(4);
    expect(layout.bullMax).toBe(8);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineElderRayLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.bullPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineElderRayLayout({
      ...base,
      data: [{ x: 0, high: 5, low: 1, close: 3 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineElderRayChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineElderRayChart(ELDER_DATA, RUN_OPTS);
    expect(text).toContain('Elder Ray');
    expect(text).toContain('bull power');
    expect(text).toContain('bear power');
    expect(text).toContain('EMA');
    expect(text).toContain('baseline');
    expect(text).toContain('zero');
  });

  it('reports the power-bar counts', () => {
    const text = describeLineElderRayChart(ELDER_DATA, RUN_OPTS);
    expect(text).toContain('4 bars of positive bull power');
    expect(text).toContain('4 bars of negative bear power');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineElderRayChart([])).toBe('No data');
    expect(describeLineElderRayChart(null)).toBe('No data');
  });
});

describe('<ChartLineElderRay />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-elder-ray-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Elder Ray');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-ray"]',
    );
    expect(root!.getAttribute('data-ema-period')).toBe('3');
    expect(root!.getAttribute('data-bull-positive-count')).toBe('4');
    expect(root!.getAttribute('data-bear-negative-count')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('6');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the close, EMA, bull and bear lines', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-elder-ray-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-close-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-ema-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-bull-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-bear-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one bull and one bear marker per defined reading', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} />,
    );
    const bull = container.querySelectorAll(
      '[data-section="chart-line-elder-ray-marker"][data-kind="bull"]',
    );
    const bear = container.querySelectorAll(
      '[data-section="chart-line-elder-ray-marker"][data-kind="bear"]',
    );
    expect(bull).toHaveLength(4);
    expect(bear).toHaveLength(4);
  });

  it('renders the config badge with the EMA period', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} />,
    );
    const ema = container.querySelector(
      '[data-section="chart-line-elder-ray-badge-ema"]',
    );
    expect(ema!.textContent).toContain('3');
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-elder-ray-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a four-item legend', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-elder-ray-legend-item"]',
    );
    expect(items).toHaveLength(4);
  });

  it('hides the close path when close is in the hidden set', () => {
    const { container } = render(
      <ChartLineElderRay
        data={ELDER_DATA}
        {...RUN_OPTS}
        hiddenSeries={['close']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-close-path"]',
      ),
    ).toBeNull();
  });

  it('hides the EMA path when showEma is false', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} showEma={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-ema-path"]',
      ),
    ).toBeNull();
  });

  it('hides the bull line and bull markers when showBull is false', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} showBull={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-bull-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-elder-ray-marker"][data-kind="bull"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the bear line when showBear is false', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} showBear={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-bear-line"]',
      ),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineElderRay data={[{ x: 0, high: 5, low: 1, close: 3 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-ray"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-elder-ray-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineElderRay
        data={ELDER_DATA}
        {...RUN_OPTS}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-elder-ray-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineElderRay ref={ref} data={ELDER_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-elder-ray',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineElderRay.displayName).toBe('ChartLineElderRay');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineElderRay data={ELDER_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-ray"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
