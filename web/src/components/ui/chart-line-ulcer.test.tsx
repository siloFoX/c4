import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineUlcer,
  getLineUlcerFinitePoints,
  normalizeLineUlcerPeriod,
  computeLineUlcerDrawdown,
  computeLineUlcer,
  runLineUlcer,
  computeLineUlcerLayout,
  describeLineUlcerChart,
  DEFAULT_CHART_LINE_ULCER_PERIOD,
  type ChartLineUlcerPoint,
} from './chart-line-ulcer';

afterEach(() => cleanup());

const ULCER_CLOSES = [
  100, 100, 100, 100, 94, 92, 100, 100, 100, 100, 94, 92, 100,
];
const ULCER_DATA: ChartLineUlcerPoint[] = ULCER_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = { period: 4, threshold: 4 };

// The running peak holds at 100, so each drawdown is 100 - close;
// every 4-bar window has a perfect-square mean-squared-drawdown,
// so the Ulcer Index lands on exact integers.
const DRAWDOWN_EXPECTED = [0, 0, 0, 0, 6, 8, 0, 0, 0, 0, 6, 8, 0];
const ULCER_EXPECTED = [
  null,
  null,
  null,
  0,
  3,
  5,
  5,
  5,
  4,
  0,
  3,
  5,
  5,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'calm',
  'calm',
  'stress',
  'stress',
  'stress',
  'calm',
  'calm',
  'calm',
  'stress',
  'stress',
];

describe('getLineUlcerFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineUlcerPoint[];
    expect(getLineUlcerFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineUlcerFinitePoints(null)).toEqual([]);
    expect(getLineUlcerFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineUlcerPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineUlcerPeriod(14.7, 14)).toBe(14);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineUlcerPeriod(0, 14)).toBe(14);
    expect(normalizeLineUlcerPeriod(-3, 14)).toBe(14);
    expect(normalizeLineUlcerPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('computeLineUlcerDrawdown', () => {
  it('computes the percentage drawdown off the running peak', () => {
    expect(computeLineUlcerDrawdown(ULCER_CLOSES)).toEqual(DRAWDOWN_EXPECTED);
  });

  it('is zero at a new running high', () => {
    expect(computeLineUlcerDrawdown([10, 20, 30, 40])).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('tracks the running peak across a recovery', () => {
    // peak holds at 100; drawdowns are 0, 50, 0, 75
    expect(computeLineUlcerDrawdown([100, 50, 100, 25])).toEqual([
      0, 50, 0, 75,
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineUlcerDrawdown(null)).toEqual([]);
  });
});

describe('computeLineUlcer', () => {
  it('computes the root mean square of drawdowns', () => {
    expect(computeLineUlcer(ULCER_CLOSES, 4)).toEqual(ULCER_EXPECTED);
  });

  it('is null through the warm-up', () => {
    expect(computeLineUlcer(ULCER_CLOSES, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('is zero for a series at all-time highs', () => {
    expect(computeLineUlcer([10, 20, 30, 40, 50], 4)).toEqual([
      null,
      null,
      null,
      0,
      0,
    ]);
  });

  it('is non-negative', () => {
    for (const v of computeLineUlcer(ULCER_CLOSES, 4)) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineUlcer(null, 4)).toEqual([]);
  });
});

describe('runLineUlcer', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineUlcer(ULCER_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period and threshold', () => {
    const run = runLineUlcer(ULCER_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(4);
  });

  it('exposes the drawdown series', () => {
    expect(runLineUlcer(ULCER_DATA, OPTS).drawdown).toEqual(
      DRAWDOWN_EXPECTED,
    );
  });

  it('exposes the ulcer series', () => {
    expect(runLineUlcer(ULCER_DATA, OPTS).ulcer).toEqual(ULCER_EXPECTED);
  });

  it('emits one sample per point', () => {
    expect(runLineUlcer(ULCER_DATA, OPTS).samples).toHaveLength(
      ULCER_DATA.length,
    );
  });

  it('classifies each sample as stress, calm or none', () => {
    const run = runLineUlcer(ULCER_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('counts the stress and calm bars', () => {
    const run = runLineUlcer(ULCER_DATA, OPTS);
    expect(run.stressCount).toBe(5);
    expect(run.calmCount).toBe(5);
  });

  it('keeps the zone counts consistent with the samples', () => {
    const run = runLineUlcer(ULCER_DATA, OPTS);
    expect(run.stressCount).toBe(
      run.samples.filter((s) => s.zone === 'stress').length,
    );
    expect(run.calmCount).toBe(
      run.samples.filter((s) => s.zone === 'calm').length,
    );
  });

  it('reports the final ulcer reading', () => {
    expect(runLineUlcer(ULCER_DATA, OPTS).ulcerFinal).toBe(5);
  });

  it('carries the drawdown, ulcer and zone fields on each sample', () => {
    const run = runLineUlcer(ULCER_DATA, OPTS);
    const s = run.samples[5]!;
    expect(s.drawdown).toBe(8);
    expect(s.ulcer).toBe(5);
    expect(s.zone).toBe('stress');
  });

  it('is not ok for a single-point series', () => {
    expect(runLineUlcer([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineUlcer([], OPTS).ok).toBe(false);
    expect(runLineUlcer(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      ULCER_DATA[6]!,
      ULCER_DATA[0]!,
      ULCER_DATA[12]!,
      ULCER_DATA[3]!,
    ];
    const run = runLineUlcer(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 6, 12]);
  });

  it('defaults to the period 14 configuration', () => {
    expect(runLineUlcer(ULCER_DATA).period).toBe(
      DEFAULT_CHART_LINE_ULCER_PERIOD,
    );
  });
});

describe('computeLineUlcerLayout', () => {
  const layoutOptions = {
    data: ULCER_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineUlcerLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the ulcer panel', () => {
    const layout = computeLineUlcerLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.ulcerPanel.y);
    expect(layout.ulcerPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineUlcerLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty ulcer path', () => {
    expect(
      computeLineUlcerLayout(layoutOptions).ulcerPath.length,
    ).toBeGreaterThan(0);
  });

  it('emits one price dot per point', () => {
    expect(computeLineUlcerLayout(layoutOptions).priceDots).toHaveLength(
      ULCER_DATA.length,
    );
  });

  it('emits one ulcer marker per defined sample', () => {
    expect(computeLineUlcerLayout(layoutOptions).ulcerMarkers).toHaveLength(
      10,
    );
  });

  it('places the threshold line inside the ulcer panel', () => {
    const layout = computeLineUlcerLayout(layoutOptions);
    expect(layout.thresholdY).toBeGreaterThanOrEqual(layout.ulcerPanel.y);
    expect(layout.thresholdY).toBeLessThanOrEqual(
      layout.ulcerPanel.y + layout.ulcerPanel.height,
    );
  });

  it('carries the run statistics', () => {
    const layout = computeLineUlcerLayout(layoutOptions);
    expect(layout.ulcerFinal).toBe(5);
    expect(layout.stressCount).toBe(5);
    expect(layout.calmCount).toBe(5);
    expect(layout.totalPoints).toBe(13);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineUlcerLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineUlcerLayout({ ...layoutOptions, data: [{ x: 0, value: 1 }] })
        .ok,
    ).toBe(false);
  });
});

describe('describeLineUlcerChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineUlcerChart(ULCER_DATA, OPTS);
    expect(text).toContain('Ulcer Index');
    expect(text).toContain('root mean square');
    expect(text).toContain('drawdown');
    expect(text).toContain('running peak');
  });

  it('reports the zone counts', () => {
    const text = describeLineUlcerChart(ULCER_DATA, OPTS);
    expect(text).toContain('stressed above the threshold on 5');
    expect(text).toContain('calm on 5');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineUlcerChart([])).toBe('No data');
  });
});

describe('<ChartLineUlcer />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-ulcer-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ulcer Index');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-ulcer"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('4');
    expect(root?.getAttribute('data-stress-count')).toBe('5');
    expect(root?.getAttribute('data-calm-count')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('13');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-ulcer-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-ulcer-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    const labels = Array.from(
      container.querySelectorAll('[data-section="chart-line-ulcer-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('Ulcer');
  });

  it('renders the ulcer line', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-ulcer-ulcer-line"]'),
    ).not.toBeNull();
  });

  it('renders one ulcer marker per defined sample', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-ulcer-marker"]'),
    ).toHaveLength(10);
  });

  it('renders the threshold line', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-ulcer-threshold-line"]'),
    ).not.toBeNull();
  });

  it('exposes the zone on each ulcer marker', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-ulcer-marker"][data-point-index="5"]',
    );
    expect(marker?.getAttribute('data-zone')).toBe('stress');
  });

  it('renders the three-item legend', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-ulcer-legend-item"]'),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineUlcer data={ULCER_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-ulcer-badge-config"]',
    );
    expect(badge?.textContent).toBe('4');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineUlcer data={ULCER_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ulcer-price-path"]'),
    ).toBeNull();
  });

  it('hides the ulcer line and markers when showUlcer is false', () => {
    const { container } = render(
      <ChartLineUlcer data={ULCER_DATA} {...OPTS} showUlcer={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ulcer-ulcer-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-ulcer-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the threshold line when showThreshold is false', () => {
    const { container } = render(
      <ChartLineUlcer data={ULCER_DATA} {...OPTS} showThreshold={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ulcer-threshold-line"]'),
    ).toBeNull();
  });

  it('hides the ulcer via the hidden set', () => {
    const { container } = render(
      <ChartLineUlcer data={ULCER_DATA} {...OPTS} hiddenSeries={['ulcer']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ulcer-ulcer-line"]'),
    ).toBeNull();
  });

  it('hides the threshold line via the hidden set', () => {
    const { container } = render(
      <ChartLineUlcer data={ULCER_DATA} {...OPTS} hiddenSeries={['threshold']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ulcer-threshold-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineUlcer
        data={ULCER_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-ulcer-legend-item"][data-series-id="ulcer"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'ulcer', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineUlcer data={ULCER_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-ulcer-dot"]'),
    ).toHaveLength(ULCER_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineUlcer data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-ulcer"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineUlcer data={ULCER_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ulcer-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineUlcer ref={ref} data={ULCER_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-ulcer');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineUlcer.displayName).toBe('ChartLineUlcer');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineUlcer data={ULCER_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-ulcer"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
