import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineCoppock,
  computeLineCoppockRoc,
  computeLineCoppockWma,
  computeLineCoppock,
  computeLineCoppockLayout,
  normalizeLineCoppockPeriod,
  getLineCoppockFinitePoints,
  runLineCoppock,
  describeLineCoppockChart,
  DEFAULT_CHART_LINE_COPPOCK_ROC1_PERIOD,
  DEFAULT_CHART_LINE_COPPOCK_ROC2_PERIOD,
  DEFAULT_CHART_LINE_COPPOCK_WMA_PERIOD,
  type ChartLineCoppockPoint,
} from './chart-line-coppock';

afterEach(() => cleanup());

const COPPOCK_DATA: ChartLineCoppockPoint[] = [
  { x: 0, value: 100 },
  { x: 1, value: 100 },
  { x: 2, value: 100 },
  { x: 3, value: 100 },
  { x: 4, value: 100 },
  { x: 5, value: 130 },
  { x: 6, value: 160 },
];

// Hand-verified for roc1Period 3, roc2Period 2, wmaPeriod 2:
//   roc1   = [null,null,null,  0,  0, 30, 60]
//   roc2   = [null,null,  0,  0,  0, 30, 60]
//   rocSum = [null,null,null,  0,  0, 60,120]
//   coppock= [null,null,null,null, 0, 40,100]
const RUN_OPTS = { roc1Period: 3, roc2Period: 2, wmaPeriod: 2 };

describe('computeLineCoppockRoc', () => {
  it('computes the percentage rate of change over the lookback', () => {
    const roc = computeLineCoppockRoc([100, 110, 121], 1);
    expect(roc[0]).toBeNull();
    expect(roc[1]).toBe(10);
    expect(roc[2]).toBeCloseTo(10, 9);
  });

  it('leaves indices before the lookback null', () => {
    const roc = computeLineCoppockRoc([10, 20, 30, 40, 50], 3);
    expect(roc[0]).toBeNull();
    expect(roc[1]).toBeNull();
    expect(roc[2]).toBeNull();
    expect(roc[3]).toBe(300);
    expect(roc[4]).toBe(150);
  });

  it('reads zero when the base value is zero', () => {
    const roc = computeLineCoppockRoc([0, 5, 10], 1);
    expect(roc[1]).toBe(0);
    expect(roc[2]).toBe(100);
  });

  it('normalises a negative-zero rate of change to positive zero', () => {
    const roc = computeLineCoppockRoc([-100, -100], 1);
    expect(roc[1]).toBe(0);
    expect(Object.is(roc[1], -0)).toBe(false);
  });

  it('produces ROC of zero when the value is unchanged', () => {
    const roc = computeLineCoppockRoc([50, 50, 50], 1);
    expect(roc[1]).toBe(0);
    expect(roc[2]).toBe(0);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineCoppockRoc(null, 2)).toEqual([]);
    expect(computeLineCoppockRoc(undefined, 2)).toEqual([]);
  });
});

describe('computeLineCoppockWma', () => {
  it('weights the most recent value most heavily', () => {
    const recent = computeLineCoppockWma([0, 0, 6], 3);
    const old = computeLineCoppockWma([6, 0, 0], 3);
    expect(recent[2]).toBe(3);
    expect(old[2]).toBe(1);
    expect(recent[2]!).toBeGreaterThan(old[2]!);
  });

  it('divides the weighted sum by the triangular weight total', () => {
    // weights 1,2 -> sum 3; (1*3 + 2*6) / 3 = 5
    const wma = computeLineCoppockWma([3, 6], 2);
    expect(wma[0]).toBeNull();
    expect(wma[1]).toBe(5);
  });

  it('returns a flat average when every window value is equal', () => {
    const wma = computeLineCoppockWma([6, 6, 6], 3);
    expect(wma[2]).toBe(6);
  });

  it('leaves a window containing a null value undefined', () => {
    const wma = computeLineCoppockWma([null, 4, 8], 2);
    expect(wma[0]).toBeNull();
    expect(wma[1]).toBeNull();
    expect(wma[2]).toBe(20 / 3);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineCoppockWma(null, 2)).toEqual([]);
  });
});

describe('computeLineCoppock', () => {
  it('matches the hand-verified Coppock pipeline', () => {
    const values = COPPOCK_DATA.map((p) => p.value);
    const coppock = computeLineCoppock(values, 3, 2, 2);
    expect(coppock).toEqual([null, null, null, null, 0, 40, 100]);
  });

  it('returns an array as long as the input series', () => {
    const values = COPPOCK_DATA.map((p) => p.value);
    const coppock = computeLineCoppock(values, 3, 2, 2);
    expect(coppock.length).toBe(values.length);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineCoppock(null, 14, 11, 10)).toEqual([]);
  });
});

describe('normalizeLineCoppockPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineCoppockPeriod(10, 5)).toBe(10);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineCoppockPeriod(7.8, 5)).toBe(7);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineCoppockPeriod(0, 11)).toBe(11);
    expect(normalizeLineCoppockPeriod(-3, 11)).toBe(11);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineCoppockPeriod(NaN, 14)).toBe(14);
    expect(normalizeLineCoppockPeriod(Infinity, 14)).toBe(14);
  });
});

describe('getLineCoppockFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineCoppockFinitePoints([
      { x: 0, value: 1 },
      { x: NaN, value: 2 },
      { x: 1, value: Infinity },
      { x: 2, value: 3 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineCoppockFinitePoints(null)).toEqual([]);
    expect(getLineCoppockFinitePoints(undefined)).toEqual([]);
  });
});

describe('runLineCoppock', () => {
  it('reports ok for a sufficient series', () => {
    const run = runLineCoppock(COPPOCK_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.roc1Period).toBe(3);
    expect(run.roc2Period).toBe(2);
    expect(run.wmaPeriod).toBe(2);
  });

  it('exposes the hand-verified Coppock series', () => {
    const run = runLineCoppock(COPPOCK_DATA, RUN_OPTS);
    expect(run.coppock).toEqual([null, null, null, null, 0, 40, 100]);
  });

  it('reports the final, min and max Coppock readings', () => {
    const run = runLineCoppock(COPPOCK_DATA, RUN_OPTS);
    expect(run.coppockFinal).toBe(100);
    expect(run.coppockMin).toBe(0);
    expect(run.coppockMax).toBe(100);
  });

  it('counts readings above and below the zero line', () => {
    const run = runLineCoppock(COPPOCK_DATA, RUN_OPTS);
    expect(run.positiveCount).toBe(2);
    expect(run.negativeCount).toBe(0);
  });

  it('classifies each sample sign', () => {
    const run = runLineCoppock(COPPOCK_DATA, RUN_OPTS);
    expect(run.samples[0]!.sign).toBe('zero');
    expect(run.samples[4]!.sign).toBe('zero');
    expect(run.samples[5]!.sign).toBe('positive');
    expect(run.samples[6]!.sign).toBe('positive');
  });

  it('flags a negative Coppock reading', () => {
    const falling: ChartLineCoppockPoint[] = [
      { x: 0, value: 100 },
      { x: 1, value: 100 },
      { x: 2, value: 100 },
      { x: 3, value: 100 },
      { x: 4, value: 100 },
      { x: 5, value: 70 },
      { x: 6, value: 40 },
    ];
    const run = runLineCoppock(falling, RUN_OPTS);
    expect(run.coppockFinal).toBeLessThan(0);
    expect(run.negativeCount).toBeGreaterThan(0);
    expect(run.samples[6]!.sign).toBe('negative');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...COPPOCK_DATA].reverse();
    const run = runLineCoppock(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.coppock).toEqual([null, null, null, null, 0, 40, 100]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineCoppock([{ x: 0, value: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineCoppock([]).ok).toBe(false);
    expect(runLineCoppock(null).ok).toBe(false);
  });

  it('defaults the periods when no options are given', () => {
    const run = runLineCoppock(COPPOCK_DATA);
    expect(run.roc1Period).toBe(DEFAULT_CHART_LINE_COPPOCK_ROC1_PERIOD);
    expect(run.roc2Period).toBe(DEFAULT_CHART_LINE_COPPOCK_ROC2_PERIOD);
    expect(run.wmaPeriod).toBe(DEFAULT_CHART_LINE_COPPOCK_WMA_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineCoppock(COPPOCK_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(COPPOCK_DATA.length);
    expect(run.samples[6]!.coppock).toBe(100);
  });
});

describe('computeLineCoppockLayout', () => {
  const base = {
    data: COPPOCK_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineCoppockLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('stacks the value panel above the Coppock panel', () => {
    const layout = computeLineCoppockLayout(base);
    expect(layout.coppockPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.coppockPanel.width);
  });

  it('builds non-empty value and Coppock paths', () => {
    const layout = computeLineCoppockLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.coppockPath.startsWith('M')).toBe(true);
  });

  it('places the zero line inside the Coppock panel', () => {
    const layout = computeLineCoppockLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.coppockPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.coppockPanel.y + layout.coppockPanel.height,
    );
  });

  it('emits one marker per defined Coppock reading', () => {
    const layout = computeLineCoppockLayout(base);
    expect(layout.markers).toHaveLength(3);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('uses a symmetric Coppock y-bound around zero', () => {
    const layout = computeLineCoppockLayout(base);
    expect(layout.coppockYBound).toBe(100);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineCoppockLayout(base);
    expect(layout.coppockFinal).toBe(100);
    expect(layout.positiveCount).toBe(2);
    expect(layout.negativeCount).toBe(0);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineCoppockLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineCoppockLayout({
      ...base,
      data: [{ x: 0, value: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCoppockChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineCoppockChart(COPPOCK_DATA, RUN_OPTS);
    expect(text).toContain('Coppock Curve');
    expect(text).toContain('momentum');
    expect(text).toContain('rate-of-change');
    expect(text).toContain('weighted moving average');
    expect(text).toContain('zero');
    expect(text).toContain('ROC 3/2');
  });

  it('reports the positive and negative counts', () => {
    const text = describeLineCoppockChart(COPPOCK_DATA, RUN_OPTS);
    expect(text).toContain('2 readings above');
    expect(text).toContain('0 below');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineCoppockChart([])).toBe('No data');
    expect(describeLineCoppockChart(null)).toBe('No data');
  });
});

describe('<ChartLineCoppock />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineCoppock data={COPPOCK_DATA} {...RUN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineCoppock data={COPPOCK_DATA} {...RUN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-coppock-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Coppock Curve');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineCoppock data={COPPOCK_DATA} {...RUN_OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock"]',
    );
    expect(root!.getAttribute('data-roc1-period')).toBe('3');
    expect(root!.getAttribute('data-roc2-period')).toBe('2');
    expect(root!.getAttribute('data-wma-period')).toBe('2');
    expect(root!.getAttribute('data-coppock-final')).toBe('100');
    expect(root!.getAttribute('data-positive-count')).toBe('2');
    expect(root!.getAttribute('data-negative-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the value and Coppock paths', () => {
    const { container } = render(
      <ChartLineCoppock data={COPPOCK_DATA} {...RUN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-coppock-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-value-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-coppock-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one marker per defined Coppock reading', () => {
    const { container } = render(
      <ChartLineCoppock data={COPPOCK_DATA} {...RUN_OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-coppock-marker"]',
    );
    expect(markers).toHaveLength(3);
  });

  it('renders the config badge with ROC and WMA periods', () => {
    const { container } = render(
      <ChartLineCoppock data={COPPOCK_DATA} {...RUN_OPTS} />,
    );
    const roc = container.querySelector(
      '[data-section="chart-line-coppock-badge-roc"]',
    );
    const wma = container.querySelector(
      '[data-section="chart-line-coppock-badge-wma"]',
    );
    expect(roc!.textContent).toContain('3/2');
    expect(wma!.textContent).toContain('2');
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineCoppock data={COPPOCK_DATA} {...RUN_OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-coppock-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a legend with value and Coppock entries', () => {
    const { container } = render(
      <ChartLineCoppock data={COPPOCK_DATA} {...RUN_OPTS} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-coppock-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('hides the value path when value is in the hidden set', () => {
    const { container } = render(
      <ChartLineCoppock
        data={COPPOCK_DATA}
        {...RUN_OPTS}
        hiddenSeries={['value']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-value-path"]',
      ),
    ).toBeNull();
  });

  it('hides the Coppock line when showCoppock is false', () => {
    const { container } = render(
      <ChartLineCoppock
        data={COPPOCK_DATA}
        {...RUN_OPTS}
        showCoppock={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-coppock-line"]',
      ),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineCoppock data={[{ x: 0, value: 1 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-coppock-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineCoppock
        data={COPPOCK_DATA}
        {...RUN_OPTS}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-coppock-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCoppock ref={ref} data={COPPOCK_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-coppock',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineCoppock.displayName).toBe('ChartLineCoppock');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineCoppock data={COPPOCK_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
