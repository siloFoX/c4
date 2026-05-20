import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVixFix,
  getLineVixFixFinitePoints,
  normalizeLineVixFixPeriod,
  computeLineVixFixHighest,
  computeLineVixFix,
  runLineVixFix,
  computeLineVixFixLayout,
  describeLineVixFixChart,
  DEFAULT_CHART_LINE_VIX_FIX_PERIOD,
  type ChartLineVixFixPoint,
} from './chart-line-vix-fix';

afterEach(() => cleanup());

const VIX_FIX_CLOSES = [
  100, 90, 80, 70, 100, 85, 75, 100, 60, 100,
];
const VIX_FIX_DATA: ChartLineVixFixPoint[] = VIX_FIX_CLOSES.map(
  (value, x) => ({ x, value }),
);
const OPTS = { period: 4, threshold: 20 };

// Every 4-bar window has a close of 100, so the highest close is
// always 100 and WVF = 100 - close lands on exact integers.
const HIGHEST_EXPECTED = [
  null,
  null,
  null,
  100,
  100,
  100,
  100,
  100,
  100,
  100,
];
const VIX_FIX_EXPECTED = [
  null,
  null,
  null,
  30,
  0,
  15,
  25,
  0,
  40,
  0,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'spike',
  'calm',
  'calm',
  'spike',
  'calm',
  'spike',
  'calm',
];

describe('getLineVixFixFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineVixFixPoint[];
    expect(getLineVixFixFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineVixFixFinitePoints(null)).toEqual([]);
    expect(getLineVixFixFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineVixFixPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineVixFixPeriod(22.8, 22)).toBe(22);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineVixFixPeriod(0, 22)).toBe(22);
    expect(normalizeLineVixFixPeriod(-4, 22)).toBe(22);
    expect(normalizeLineVixFixPeriod(Number.NaN, 22)).toBe(22);
  });
});

describe('computeLineVixFixHighest', () => {
  it('computes the rolling highest close', () => {
    expect(computeLineVixFixHighest(VIX_FIX_CLOSES, 4)).toEqual(
      HIGHEST_EXPECTED,
    );
  });

  it('is null through the warm-up', () => {
    expect(computeLineVixFixHighest(VIX_FIX_CLOSES, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineVixFixHighest(null, 4)).toEqual([]);
  });
});

describe('computeLineVixFix', () => {
  it('computes the percent drop from the highest close', () => {
    expect(computeLineVixFix(VIX_FIX_CLOSES, 4)).toEqual(VIX_FIX_EXPECTED);
  });

  it('is null through the warm-up', () => {
    expect(computeLineVixFix(VIX_FIX_CLOSES, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('reads zero when the price makes a new high', () => {
    expect(computeLineVixFix([10, 20, 30, 40, 50], 4)).toEqual([
      null,
      null,
      null,
      0,
      0,
    ]);
  });

  it('is non-negative', () => {
    for (const v of computeLineVixFix(VIX_FIX_CLOSES, 4)) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineVixFix(null, 4)).toEqual([]);
  });
});

describe('runLineVixFix', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineVixFix(VIX_FIX_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period and threshold', () => {
    const run = runLineVixFix(VIX_FIX_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(20);
  });

  it('exposes the highest series', () => {
    expect(runLineVixFix(VIX_FIX_DATA, OPTS).highest).toEqual(
      HIGHEST_EXPECTED,
    );
  });

  it('exposes the vix fix series', () => {
    expect(runLineVixFix(VIX_FIX_DATA, OPTS).vixFix).toEqual(
      VIX_FIX_EXPECTED,
    );
  });

  it('emits one sample per point', () => {
    expect(runLineVixFix(VIX_FIX_DATA, OPTS).samples).toHaveLength(
      VIX_FIX_DATA.length,
    );
  });

  it('classifies each sample as spike, calm or none', () => {
    const run = runLineVixFix(VIX_FIX_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('counts the spike and calm bars', () => {
    const run = runLineVixFix(VIX_FIX_DATA, OPTS);
    expect(run.spikeCount).toBe(3);
    expect(run.calmCount).toBe(4);
  });

  it('keeps the zone counts consistent with the samples', () => {
    const run = runLineVixFix(VIX_FIX_DATA, OPTS);
    expect(run.spikeCount).toBe(
      run.samples.filter((s) => s.zone === 'spike').length,
    );
    expect(run.calmCount).toBe(
      run.samples.filter((s) => s.zone === 'calm').length,
    );
  });

  it('reports the final vix fix reading', () => {
    expect(runLineVixFix(VIX_FIX_DATA, OPTS).vixFixFinal).toBe(0);
  });

  it('carries the highest, vix fix and zone fields on each sample', () => {
    const run = runLineVixFix(VIX_FIX_DATA, OPTS);
    const s = run.samples[3]!;
    expect(s.highest).toBe(100);
    expect(s.vixFix).toBe(30);
    expect(s.zone).toBe('spike');
  });

  it('is not ok for a single-point series', () => {
    expect(runLineVixFix([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineVixFix([], OPTS).ok).toBe(false);
    expect(runLineVixFix(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      VIX_FIX_DATA[6]!,
      VIX_FIX_DATA[0]!,
      VIX_FIX_DATA[9]!,
      VIX_FIX_DATA[3]!,
    ];
    const run = runLineVixFix(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 6, 9]);
  });

  it('defaults to the period 22 configuration', () => {
    expect(runLineVixFix(VIX_FIX_DATA).period).toBe(
      DEFAULT_CHART_LINE_VIX_FIX_PERIOD,
    );
  });
});

describe('computeLineVixFixLayout', () => {
  const layoutOptions = {
    data: VIX_FIX_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineVixFixLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the vix panel', () => {
    const layout = computeLineVixFixLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.vixPanel.y);
    expect(layout.vixPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineVixFixLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty vix path', () => {
    expect(
      computeLineVixFixLayout(layoutOptions).vixPath.length,
    ).toBeGreaterThan(0);
  });

  it('emits one price dot per point', () => {
    expect(computeLineVixFixLayout(layoutOptions).priceDots).toHaveLength(
      VIX_FIX_DATA.length,
    );
  });

  it('emits one vix marker per defined sample', () => {
    expect(computeLineVixFixLayout(layoutOptions).vixMarkers).toHaveLength(7);
  });

  it('places the threshold line inside the vix panel', () => {
    const layout = computeLineVixFixLayout(layoutOptions);
    expect(layout.thresholdY).toBeGreaterThanOrEqual(layout.vixPanel.y);
    expect(layout.thresholdY).toBeLessThanOrEqual(
      layout.vixPanel.y + layout.vixPanel.height,
    );
  });

  it('carries the run statistics', () => {
    const layout = computeLineVixFixLayout(layoutOptions);
    expect(layout.vixFixFinal).toBe(0);
    expect(layout.spikeCount).toBe(3);
    expect(layout.calmCount).toBe(4);
    expect(layout.totalPoints).toBe(10);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineVixFixLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineVixFixLayout({
        ...layoutOptions,
        data: [{ x: 0, value: 1 }],
      }).ok,
    ).toBe(false);
  });
});

describe('describeLineVixFixChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineVixFixChart(VIX_FIX_DATA, OPTS);
    expect(text).toContain('Williams VIX Fix');
    expect(text).toContain('implied volatility');
    expect(text).toContain('highest close');
  });

  it('reports the zone counts', () => {
    const text = describeLineVixFixChart(VIX_FIX_DATA, OPTS);
    expect(text).toContain('spikes above the threshold on 3');
    expect(text).toContain('calm on 4');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineVixFixChart([])).toBe('No data');
  });
});

describe('<ChartLineVixFix />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vix-fix-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Williams VIX Fix');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-vix-fix"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('20');
    expect(root?.getAttribute('data-spike-count')).toBe('3');
    expect(root?.getAttribute('data-calm-count')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe('10');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vix-fix-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vix-fix-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    const labels = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-vix-fix-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('VIX Fix');
  });

  it('renders the vix fix line', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vix-fix-line"]'),
    ).not.toBeNull();
  });

  it('renders one vix marker per defined sample', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-vix-fix-marker"]'),
    ).toHaveLength(7);
  });

  it('renders the threshold line', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vix-fix-threshold-line"]',
      ),
    ).not.toBeNull();
  });

  it('exposes the zone on each vix marker', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vix-fix-marker"][data-point-index="3"]',
    );
    expect(marker?.getAttribute('data-zone')).toBe('spike');
  });

  it('renders the three-item legend', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-vix-fix-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-vix-fix-badge-config"]',
    );
    expect(badge?.textContent).toBe('4');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vix-fix-price-path"]'),
    ).toBeNull();
  });

  it('hides the vix line and markers when showVixFix is false', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} showVixFix={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vix-fix-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-vix-fix-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the threshold line when showThreshold is false', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} showThreshold={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vix-fix-threshold-line"]',
      ),
    ).toBeNull();
  });

  it('hides the vix fix via the hidden set', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} hiddenSeries={['vixfix']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vix-fix-line"]'),
    ).toBeNull();
  });

  it('hides the threshold line via the hidden set', () => {
    const { container } = render(
      <ChartLineVixFix
        data={VIX_FIX_DATA}
        {...OPTS}
        hiddenSeries={['threshold']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vix-fix-threshold-line"]',
      ),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineVixFix
        data={VIX_FIX_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-vix-fix-legend-item"][data-series-id="vixfix"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'vixfix', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-vix-fix-dot"]'),
    ).toHaveLength(VIX_FIX_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineVixFix data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-vix-fix"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vix-fix-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVixFix ref={ref} data={VIX_FIX_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-vix-fix',
    );
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineVixFix.displayName).toBe('ChartLineVixFix');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineVixFix data={VIX_FIX_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-vix-fix"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
