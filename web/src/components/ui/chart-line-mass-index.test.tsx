import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineMassIndex,
  computeLineMassIndexEma,
  computeLineMassIndex,
  computeLineMassIndexLayout,
  normalizeLineMassIndexPeriod,
  getLineMassIndexFinitePoints,
  runLineMassIndex,
  describeLineMassIndexChart,
  DEFAULT_CHART_LINE_MASS_INDEX_EMA_PERIOD,
  DEFAULT_CHART_LINE_MASS_INDEX_SUM_PERIOD,
  DEFAULT_CHART_LINE_MASS_INDEX_SETUP_THRESHOLD,
  DEFAULT_CHART_LINE_MASS_INDEX_TRIGGER_THRESHOLD,
  type ChartLineMassIndexPoint,
} from './chart-line-mass-index';

afterEach(() => cleanup());

// low = 0 everywhere, so range = high. Ranges widen at index 5.
const MASS_DATA: ChartLineMassIndexPoint[] = [
  { x: 0, high: 6, low: 0 },
  { x: 1, high: 6, low: 0 },
  { x: 2, high: 6, low: 0 },
  { x: 3, high: 6, low: 0 },
  { x: 4, high: 6, low: 0 },
  { x: 5, high: 18, low: 0 },
  { x: 6, high: 18, low: 0 },
  { x: 7, high: 18, low: 0 },
  { x: 8, high: 18, low: 0 },
  { x: 9, high: 18, low: 0 },
];

// Hand-verified for emaPeriod 2, sumPeriod 3:
//   range  = [6,6,6,6,6,18,18,18,18,18]
//   single = [.,6,6,6,6,14,50/3,158/9,482/27,1454/81]   (EMA mult 2/3)
//   double = [.,.,6,6,6,34/3,134/9,50/3,1414/81,4322/243]
//   ratio  = [.,.,1,1,1,21/17,75/67,79/75,723/707,2181/2161]
//   mass   = [.,.,.,.,3,55/17,3.354697,3.408030,3.195367,3.085219]
// With setup 3.4 / trigger 3.3: mass crosses above 3.4 at i=7 (bulge),
// then drops below 3.3 at i=8 (signal) -> one reversal bulge.
const RUN_OPTS = {
  emaPeriod: 2,
  sumPeriod: 3,
  setupThreshold: 3.4,
  triggerThreshold: 3.3,
};

describe('getLineMassIndexFinitePoints', () => {
  it('keeps only points with finite x, high and low', () => {
    const points = getLineMassIndexFinitePoints([
      { x: 0, high: 5, low: 1 },
      { x: NaN, high: 5, low: 1 },
      { x: 1, high: Infinity, low: 1 },
      { x: 2, high: 5, low: NaN },
      { x: 3, high: 9, low: 2 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 3]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineMassIndexFinitePoints(null)).toEqual([]);
    expect(getLineMassIndexFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineMassIndexPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineMassIndexPeriod(25, 9)).toBe(25);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineMassIndexPeriod(9.7, 25)).toBe(9);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineMassIndexPeriod(0, 9)).toBe(9);
    expect(normalizeLineMassIndexPeriod(-2, 9)).toBe(9);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineMassIndexPeriod(NaN, 25)).toBe(25);
    expect(normalizeLineMassIndexPeriod(Infinity, 25)).toBe(25);
  });
});

describe('computeLineMassIndexEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    // period 2, mult 2/3: seed = mean(2,4) = 3; 6*(2/3) + 3*(1/3) = 5
    const ema = computeLineMassIndexEma([2, 4, 6], 2);
    expect(ema).toEqual([null, 3, 5]);
  });

  it('uses the period-length mean as the seed', () => {
    const ema = computeLineMassIndexEma([4, 4, 4, 12], 3);
    expect(ema[2]).toBe(4);
    expect(ema[3]).toBe(8);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineMassIndexEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('skips leading null placeholders before seeding', () => {
    const ema = computeLineMassIndexEma([null, 3, 6, 9], 2);
    expect(ema[0]).toBeNull();
    expect(ema[1]).toBeNull();
    expect(ema[2]).toBe(4.5);
    expect(ema[3]).toBe(7.5);
  });

  it('returns all-null when there are fewer defined values than the period', () => {
    expect(computeLineMassIndexEma([1, 2], 3)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineMassIndexEma(null, 2)).toEqual([]);
  });
});

describe('computeLineMassIndex', () => {
  const highs = MASS_DATA.map((p) => p.high);
  const lows = MASS_DATA.map((p) => p.low);

  it('takes the range as high minus low', () => {
    const { range } = computeLineMassIndex(highs, lows, 2, 3);
    expect(range).toEqual([6, 6, 6, 6, 6, 18, 18, 18, 18, 18]);
  });

  it('smooths the range into a single then a double EMA', () => {
    const { single, double } = computeLineMassIndex(highs, lows, 2, 3);
    expect(single[1]).toBe(6);
    expect(single[5]).toBe(14);
    expect(double[2]).toBe(6);
    expect(double[5]!).toBeCloseTo(34 / 3, 6);
  });

  it('takes the ratio of the single to the double EMA', () => {
    const { ratio } = computeLineMassIndex(highs, lows, 2, 3);
    expect(ratio[4]).toBe(1);
    expect(ratio[5]!).toBeCloseTo(21 / 17, 6);
  });

  it('sums the ratio over the sum period for the Mass Index', () => {
    const { massIndex } = computeLineMassIndex(highs, lows, 2, 3);
    expect(massIndex[3]).toBeNull();
    expect(massIndex[4]).toBe(3);
    expect(massIndex[5]!).toBeCloseTo(55 / 17, 6);
    expect(massIndex[7]!).toBeCloseTo(3.4080304, 5);
  });

  it('produces a flat Mass Index for a constant range', () => {
    const { ratio, massIndex } = computeLineMassIndex(
      [6, 6, 6, 6, 6, 6],
      [0, 0, 0, 0, 0, 0],
      2,
      3,
    );
    expect(ratio[3]).toBe(1);
    expect(massIndex[4]).toBe(3);
    expect(massIndex[5]).toBe(3);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineMassIndex(null, lows, 9, 25)).toEqual({
      range: [],
      single: [],
      double: [],
      ratio: [],
      massIndex: [],
    });
  });
});

describe('runLineMassIndex', () => {
  it('reports ok with the resolved periods and thresholds', () => {
    const run = runLineMassIndex(MASS_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.emaPeriod).toBe(2);
    expect(run.sumPeriod).toBe(3);
    expect(run.setupThreshold).toBe(3.4);
    expect(run.triggerThreshold).toBe(3.3);
  });

  it('exposes the Mass Index series', () => {
    const run = runLineMassIndex(MASS_DATA, RUN_OPTS);
    expect(run.massIndex[4]).toBe(3);
    expect(run.massIndex[7]!).toBeCloseTo(3.4080304, 5);
  });

  it('reports the final, min and max Mass Index readings', () => {
    const run = runLineMassIndex(MASS_DATA, RUN_OPTS);
    expect(run.massIndexFinal!).toBeCloseTo(3.0852191, 5);
    expect(run.massIndexMin).toBe(3);
    expect(run.massIndexMax!).toBeCloseTo(3.4080304, 5);
  });

  it('detects the reversal bulge', () => {
    const run = runLineMassIndex(MASS_DATA, RUN_OPTS);
    expect(run.bulgeCount).toBe(1);
  });

  it('classifies the bulge and signal bars by phase', () => {
    const run = runLineMassIndex(MASS_DATA, RUN_OPTS);
    expect(run.samples[4]!.phase).toBe('calm');
    expect(run.samples[6]!.phase).toBe('calm');
    expect(run.samples[7]!.phase).toBe('bulge');
    expect(run.samples[8]!.phase).toBe('signal');
    expect(run.samples[9]!.phase).toBe('calm');
  });

  it('detects no bulge when the Mass Index never reaches the setup threshold', () => {
    const run = runLineMassIndex(MASS_DATA, {
      emaPeriod: 2,
      sumPeriod: 3,
      setupThreshold: 99,
      triggerThreshold: 98,
    });
    expect(run.bulgeCount).toBe(0);
    expect(run.samples.every((s) => s.phase !== 'signal')).toBe(true);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...MASS_DATA].reverse();
    const run = runLineMassIndex(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(run.massIndex[4]).toBe(3);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineMassIndex([{ x: 0, high: 5, low: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
    expect(run.bulgeCount).toBe(0);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineMassIndex([]).ok).toBe(false);
    expect(runLineMassIndex(null).ok).toBe(false);
  });

  it('defaults the periods and thresholds when no options are given', () => {
    const run = runLineMassIndex(MASS_DATA);
    expect(run.emaPeriod).toBe(DEFAULT_CHART_LINE_MASS_INDEX_EMA_PERIOD);
    expect(run.sumPeriod).toBe(DEFAULT_CHART_LINE_MASS_INDEX_SUM_PERIOD);
    expect(run.setupThreshold).toBe(
      DEFAULT_CHART_LINE_MASS_INDEX_SETUP_THRESHOLD,
    );
    expect(run.triggerThreshold).toBe(
      DEFAULT_CHART_LINE_MASS_INDEX_TRIGGER_THRESHOLD,
    );
  });

  it('produces one sample per series point', () => {
    const run = runLineMassIndex(MASS_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(MASS_DATA.length);
  });
});

describe('computeLineMassIndexLayout', () => {
  const base = {
    data: MASS_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineMassIndexLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('stacks the range panel above the Mass Index panel', () => {
    const layout = computeLineMassIndexLayout(base);
    expect(layout.massPanel.y).toBeGreaterThan(layout.rangePanel.y);
    expect(layout.rangePanel.width).toBe(layout.massPanel.width);
  });

  it('builds non-empty high, low, band and Mass Index paths', () => {
    const layout = computeLineMassIndexLayout(base);
    expect(layout.highPath.startsWith('M')).toBe(true);
    expect(layout.lowPath.startsWith('M')).toBe(true);
    expect(layout.bandPath.startsWith('M')).toBe(true);
    expect(layout.bandPath.endsWith('Z')).toBe(true);
    expect(layout.massPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined Mass Index reading', () => {
    const layout = computeLineMassIndexLayout(base);
    expect(layout.markers).toHaveLength(6);
    expect(layout.rangeDots).toHaveLength(10);
  });

  it('places both threshold lines inside the Mass Index panel', () => {
    const layout = computeLineMassIndexLayout(base);
    expect(layout.setupY).toBeGreaterThanOrEqual(layout.massPanel.y);
    expect(layout.setupY).toBeLessThanOrEqual(
      layout.massPanel.y + layout.massPanel.height,
    );
    expect(layout.triggerY).toBeGreaterThanOrEqual(layout.massPanel.y);
    expect(layout.triggerY).toBeLessThanOrEqual(
      layout.massPanel.y + layout.massPanel.height,
    );
  });

  it('puts the higher setup threshold above the trigger threshold', () => {
    const layout = computeLineMassIndexLayout(base);
    expect(layout.setupY).toBeLessThan(layout.triggerY);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineMassIndexLayout(base);
    expect(layout.bulgeCount).toBe(1);
    expect(layout.massIndexMin).toBe(3);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineMassIndexLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.massPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineMassIndexLayout({
      ...base,
      data: [{ x: 0, high: 5, low: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineMassIndexChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineMassIndexChart(MASS_DATA, RUN_OPTS);
    expect(text).toContain('Mass Index');
    expect(text).toContain('reversal');
    expect(text).toContain('bulge');
    expect(text).toContain('range');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('EMA 2');
  });

  it('reports the bulge count', () => {
    const text = describeLineMassIndexChart(MASS_DATA, RUN_OPTS);
    expect(text).toContain('1 reversal bulge detected');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineMassIndexChart([])).toBe('No data');
    expect(describeLineMassIndexChart(null)).toBe('No data');
  });
});

describe('<ChartLineMassIndex />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-mass-index-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Mass Index');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mass-index"]',
    );
    expect(root!.getAttribute('data-ema-period')).toBe('2');
    expect(root!.getAttribute('data-sum-period')).toBe('3');
    expect(root!.getAttribute('data-setup-threshold')).toBe('3.4');
    expect(root!.getAttribute('data-trigger-threshold')).toBe('3.3');
    expect(root!.getAttribute('data-bulge-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the high, low and Mass Index lines', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mass-index-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-high-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-low-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-mass-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders the high-low band by default', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mass-index-band"]'),
    ).not.toBeNull();
  });

  it('renders both threshold lines', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-line-mass-index-threshold-line"]',
    );
    expect(lines).toHaveLength(2);
  });

  it('renders one marker per defined Mass Index reading', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-mass-index-marker"]',
    );
    expect(markers).toHaveLength(6);
  });

  it('marks the bulge and signal markers with their phase', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    const bulge = container.querySelector(
      '[data-section="chart-line-mass-index-marker"][data-phase="bulge"]',
    );
    const signal = container.querySelector(
      '[data-section="chart-line-mass-index-marker"][data-phase="signal"]',
    );
    expect(bulge).not.toBeNull();
    expect(signal).not.toBeNull();
  });

  it('renders the config badge with EMA and sum periods', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    const ema = container.querySelector(
      '[data-section="chart-line-mass-index-badge-ema"]',
    );
    const sum = container.querySelector(
      '[data-section="chart-line-mass-index-badge-sum"]',
    );
    expect(ema!.textContent).toContain('2');
    expect(sum!.textContent).toContain('3');
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-mass-index-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-mass-index-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });

  it('hides the high path when high is in the hidden set', () => {
    const { container } = render(
      <ChartLineMassIndex
        data={MASS_DATA}
        {...RUN_OPTS}
        hiddenSeries={['high']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-high-path"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-mass-index-band"]'),
    ).toBeNull();
  });

  it('hides the Mass Index line when showMass is false', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} showMass={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-mass-line"]',
      ),
    ).toBeNull();
  });

  it('hides the threshold lines when showThresholds is false', () => {
    const { container } = render(
      <ChartLineMassIndex
        data={MASS_DATA}
        {...RUN_OPTS}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mass-index-threshold-line"]',
      ),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineMassIndex data={[{ x: 0, high: 5, low: 1 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mass-index"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-mass-index-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineMassIndex
        data={MASS_DATA}
        {...RUN_OPTS}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mass-index-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMassIndex ref={ref} data={MASS_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-mass-index',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineMassIndex.displayName).toBe('ChartLineMassIndex');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineMassIndex data={MASS_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mass-index"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
