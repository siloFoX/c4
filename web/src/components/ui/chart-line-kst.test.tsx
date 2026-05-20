import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineKst,
  computeLineKstRoc,
  computeLineKstSma,
  computeLineKst,
  computeLineKstLayout,
  normalizeLineKstPeriod,
  getLineKstFinitePoints,
  runLineKst,
  describeLineKstChart,
  DEFAULT_CHART_LINE_KST_ROC1_PERIOD,
  DEFAULT_CHART_LINE_KST_ROC4_PERIOD,
  DEFAULT_CHART_LINE_KST_SIGNAL_PERIOD,
  type ChartLineKstPoint,
  type LineKstConfig,
} from './chart-line-kst';

afterEach(() => cleanup());

const KST_DATA: ChartLineKstPoint[] = [
  { x: 0, value: 100 },
  { x: 1, value: 100 },
  { x: 2, value: 100 },
  { x: 3, value: 100 },
  { x: 4, value: 200 },
  { x: 5, value: 200 },
  { x: 6, value: 200 },
  { x: 7, value: 200 },
];

// Hand-verified for roc 1/2/3/4, sma 1/1/1/1 (identity), signal 2:
//   roc1 = rcma1 = [null,0,0,0,100,0,0,0]
//   roc2 = rcma2 = [null,null,0,0,100,100,0,0]
//   roc3 = rcma3 = [null,null,null,0,100,100,100,0]
//   roc4 = rcma4 = [null,null,null,null,100,100,100,100]
//   kst = sum(rcma_k * weight_k), weights 1/2/3/4
//       = [null,null,null,null,1000,900,700,400]
//   signal = SMA(kst, 2) = [null,null,null,null,null,950,800,550]
const RUN_OPTS = {
  roc1Period: 1,
  roc2Period: 2,
  roc3Period: 3,
  roc4Period: 4,
  sma1Period: 1,
  sma2Period: 1,
  sma3Period: 1,
  sma4Period: 1,
  signalPeriod: 2,
};

const FIXTURE_CONFIG: LineKstConfig = {
  roc1Period: 1,
  roc2Period: 2,
  roc3Period: 3,
  roc4Period: 4,
  sma1Period: 1,
  sma2Period: 1,
  sma3Period: 1,
  sma4Period: 1,
  signalPeriod: 2,
};

describe('getLineKstFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineKstFinitePoints([
      { x: 0, value: 1 },
      { x: NaN, value: 2 },
      { x: 1, value: Infinity },
      { x: 2, value: 3 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineKstFinitePoints(null)).toEqual([]);
    expect(getLineKstFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineKstPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineKstPeriod(20, 10)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineKstPeriod(15.7, 10)).toBe(15);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineKstPeriod(0, 10)).toBe(10);
    expect(normalizeLineKstPeriod(-2, 10)).toBe(10);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineKstPeriod(NaN, 10)).toBe(10);
    expect(normalizeLineKstPeriod(Infinity, 10)).toBe(10);
  });
});

describe('computeLineKstRoc', () => {
  it('computes the percentage rate of change', () => {
    expect(computeLineKstRoc([100, 110, 121], 1)).toEqual([null, 10, 10]);
  });

  it('leaves indices before the lookback null', () => {
    const roc = computeLineKstRoc([10, 20, 30, 40, 50], 3);
    expect(roc[0]).toBeNull();
    expect(roc[2]).toBeNull();
    expect(roc[3]).toBe(300);
    expect(roc[4]).toBe(150);
  });

  it('reads zero when the base value is zero', () => {
    expect(computeLineKstRoc([0, 5], 1)[1]).toBe(0);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineKstRoc(null, 2)).toEqual([]);
  });
});

describe('computeLineKstSma', () => {
  it('averages each window of the period', () => {
    expect(computeLineKstSma([2, 4, 6, 8], 2)).toEqual([null, 3, 5, 7]);
  });

  it('leaves a window containing a null undefined', () => {
    expect(computeLineKstSma([null, 2, 4, 6], 2)).toEqual([
      null,
      null,
      3,
      5,
    ]);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineKstSma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineKstSma(null, 2)).toEqual([]);
  });
});

describe('computeLineKst', () => {
  const values = KST_DATA.map((p) => p.value);

  it('smooths each rate-of-change leg into an RCMA', () => {
    const { rcma1 } = computeLineKst(values, FIXTURE_CONFIG);
    expect(rcma1).toEqual([null, 0, 0, 0, 100, 0, 0, 0]);
  });

  it('sums the four weighted RCMA legs into the KST', () => {
    const { kst } = computeLineKst(values, FIXTURE_CONFIG);
    expect(kst).toEqual([null, null, null, null, 1000, 900, 700, 400]);
  });

  it('weights the slower legs more heavily', () => {
    // at index 7 only the slowest leg (rcma4, weight 4) is non-zero
    const { kst } = computeLineKst(values, FIXTURE_CONFIG);
    expect(kst[7]).toBe(400);
  });

  it('smooths the KST into the signal line', () => {
    const { signal } = computeLineKst(values, FIXTURE_CONFIG);
    expect(signal).toEqual([null, null, null, null, null, 950, 800, 550]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineKst(null, FIXTURE_CONFIG)).toEqual({
      rcma1: [],
      rcma2: [],
      rcma3: [],
      rcma4: [],
      kst: [],
      signal: [],
    });
  });
});

describe('runLineKst', () => {
  it('reports ok with the resolved config', () => {
    const run = runLineKst(KST_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.config.roc1Period).toBe(1);
    expect(run.config.roc4Period).toBe(4);
    expect(run.config.signalPeriod).toBe(2);
  });

  it('exposes the KST and signal series', () => {
    const run = runLineKst(KST_DATA, RUN_OPTS);
    expect(run.kst).toEqual([null, null, null, null, 1000, 900, 700, 400]);
    expect(run.signal).toEqual([
      null,
      null,
      null,
      null,
      null,
      950,
      800,
      550,
    ]);
  });

  it('exposes the four RCMA legs', () => {
    const run = runLineKst(KST_DATA, RUN_OPTS);
    expect(run.rcma1).toEqual([null, 0, 0, 0, 100, 0, 0, 0]);
    expect(run.rcma4).toEqual([
      null,
      null,
      null,
      null,
      100,
      100,
      100,
      100,
    ]);
  });

  it('reports the final, min and max KST readings', () => {
    const run = runLineKst(KST_DATA, RUN_OPTS);
    expect(run.kstFinal).toBe(400);
    expect(run.signalFinal).toBe(550);
    expect(run.kstMin).toBe(400);
    expect(run.kstMax).toBe(1000);
  });

  it('counts readings above and below the zero line', () => {
    const run = runLineKst(KST_DATA, RUN_OPTS);
    expect(run.positiveCount).toBe(4);
    expect(run.negativeCount).toBe(0);
  });

  it('classifies each sample by KST sign', () => {
    const run = runLineKst(KST_DATA, RUN_OPTS);
    expect(run.samples[0]!.sign).toBe('zero');
    expect(run.samples[3]!.sign).toBe('zero');
    expect(run.samples[4]!.sign).toBe('positive');
    expect(run.samples[7]!.sign).toBe('positive');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...KST_DATA].reverse();
    const run = runLineKst(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(run.kst[4]).toBe(1000);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineKst([{ x: 0, value: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineKst([]).ok).toBe(false);
    expect(runLineKst(null).ok).toBe(false);
  });

  it('defaults the config when no options are given', () => {
    const run = runLineKst(KST_DATA);
    expect(run.config.roc1Period).toBe(DEFAULT_CHART_LINE_KST_ROC1_PERIOD);
    expect(run.config.roc4Period).toBe(DEFAULT_CHART_LINE_KST_ROC4_PERIOD);
    expect(run.config.signalPeriod).toBe(
      DEFAULT_CHART_LINE_KST_SIGNAL_PERIOD,
    );
  });

  it('produces one sample per series point', () => {
    const run = runLineKst(KST_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(KST_DATA.length);
  });
});

describe('computeLineKstLayout', () => {
  const base = {
    data: KST_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineKstLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(8);
  });

  it('stacks the price panel above the KST panel', () => {
    const layout = computeLineKstLayout(base);
    expect(layout.kstPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.kstPanel.width);
  });

  it('builds non-empty price, KST and signal paths', () => {
    const layout = computeLineKstLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.kstPath.startsWith('M')).toBe(true);
    expect(layout.signalPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined KST reading', () => {
    const layout = computeLineKstLayout(base);
    expect(layout.markers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(8);
  });

  it('places the zero line inside the KST panel', () => {
    const layout = computeLineKstLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.kstPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.kstPanel.y + layout.kstPanel.height,
    );
  });

  it('uses a symmetric y-bound covering the widest KST reading', () => {
    const layout = computeLineKstLayout(base);
    expect(layout.kstYBound).toBe(1000);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineKstLayout(base);
    expect(layout.kstFinal).toBe(400);
    expect(layout.positiveCount).toBe(4);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineKstLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.kstPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineKstLayout({
      ...base,
      data: [{ x: 0, value: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineKstChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineKstChart(KST_DATA, RUN_OPTS);
    expect(text).toContain('Know Sure Thing');
    expect(text).toContain('KST');
    expect(text).toContain('rate-of-change');
    expect(text).toContain('momentum');
    expect(text).toContain('signal');
    expect(text).toContain('simple moving average');
    expect(text).toContain('zero');
  });

  it('reports the reading counts', () => {
    const text = describeLineKstChart(KST_DATA, RUN_OPTS);
    expect(text).toContain('4 readings above');
    expect(text).toContain('0 below');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineKstChart([])).toBe('No data');
    expect(describeLineKstChart(null)).toBe('No data');
  });
});

describe('<ChartLineKst />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineKst data={KST_DATA} {...RUN_OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineKst data={KST_DATA} {...RUN_OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-kst-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Know Sure Thing');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineKst data={KST_DATA} {...RUN_OPTS} />);
    const root = container.querySelector('[data-section="chart-line-kst"]');
    expect(root!.getAttribute('data-roc1-period')).toBe('1');
    expect(root!.getAttribute('data-roc4-period')).toBe('4');
    expect(root!.getAttribute('data-signal-period')).toBe('2');
    expect(root!.getAttribute('data-positive-count')).toBe('4');
    expect(root!.getAttribute('data-negative-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('8');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price, KST and signal lines', () => {
    const { container } = render(<ChartLineKst data={KST_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-kst-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-kst-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-kst-kst-line"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-kst-signal-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined KST reading', () => {
    const { container } = render(<ChartLineKst data={KST_DATA} {...RUN_OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-kst-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('renders the config badge with the ROC and signal periods', () => {
    const { container } = render(<ChartLineKst data={KST_DATA} {...RUN_OPTS} />);
    const roc = container.querySelector(
      '[data-section="chart-line-kst-badge-roc"]',
    );
    const signal = container.querySelector(
      '[data-section="chart-line-kst-badge-signal"]',
    );
    expect(roc!.textContent).toContain('1/2/3/4');
    expect(signal!.textContent).toContain('2');
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineKst data={KST_DATA} {...RUN_OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-kst-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a three-item legend', () => {
    const { container } = render(<ChartLineKst data={KST_DATA} {...RUN_OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-kst-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineKst data={KST_DATA} {...RUN_OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kst-price-path"]'),
    ).toBeNull();
  });

  it('hides the KST line when showKst is false', () => {
    const { container } = render(
      <ChartLineKst data={KST_DATA} {...RUN_OPTS} showKst={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kst-kst-line"]'),
    ).toBeNull();
  });

  it('hides the signal line when showSignal is false', () => {
    const { container } = render(
      <ChartLineKst data={KST_DATA} {...RUN_OPTS} showSignal={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kst-signal-line"]'),
    ).toBeNull();
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineKst data={[{ x: 0, value: 1 }]} />);
    const root = container.querySelector('[data-section="chart-line-kst"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-kst-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineKst data={KST_DATA} {...RUN_OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kst-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKst ref={ref} data={KST_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-kst');
  });

  it('has a stable displayName', () => {
    expect(ChartLineKst.displayName).toBe('ChartLineKst');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineKst data={KST_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-kst"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
