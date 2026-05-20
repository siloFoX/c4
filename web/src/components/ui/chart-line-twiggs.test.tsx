import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTwiggs,
  getLineTwiggsFinitePoints,
  normalizeLineTwiggsPeriod,
  computeLineTwiggsClv,
  computeLineTwiggsSma,
  computeLineTwiggs,
  runLineTwiggs,
  computeLineTwiggsLayout,
  describeLineTwiggsChart,
  DEFAULT_CHART_LINE_TWIGGS_PERIOD,
  type ChartLineTwiggsPoint,
} from './chart-line-twiggs';

afterEach(() => cleanup());

const TWIGGS_HIGHS = [
  100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
];
const TWIGGS_LOWS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const TWIGGS_CLOSES = [100, 100, 100, 100, 0, 0, 0, 100, 100, 0, 100, 0];
const TWIGGS_VOLUMES = [96, 64, 64, 32, 96, 64, 64, 32, 96, 64, 64, 32];
const TWIGGS_DATA: ChartLineTwiggsPoint[] = TWIGGS_CLOSES.map(
  (value, x) => ({
    x,
    value,
    high: TWIGGS_HIGHS[x] as number,
    low: TWIGGS_LOWS[x] as number,
    volume: TWIGGS_VOLUMES[x] as number,
  }),
);
const OPTS = { period: 4, threshold: 0.1 };

// clv = (2*close - trh - trl) / (trh - trl); with closes at the
// high or low and every window volume summing to 256, the whole
// pipeline lands on exact dyadic numbers.
const CLV_EXPECTED = [1, 1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1];
const TMF_EXPECTED = [
  null,
  null,
  null,
  1,
  0.25,
  -0.25,
  -0.75,
  -0.75,
  0,
  0,
  0.5,
  0.25,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'bullish',
  'bullish',
  'bearish',
  'bearish',
  'bearish',
  'neutral',
  'neutral',
  'bullish',
  'bullish',
];

describe('getLineTwiggsFinitePoints', () => {
  it('keeps points with all finite fields', () => {
    expect(getLineTwiggsFinitePoints(TWIGGS_DATA)).toHaveLength(
      TWIGGS_DATA.length,
    );
  });

  it('drops a point with a negative volume', () => {
    const points = [
      { x: 0, value: 10, high: 12, low: 8, volume: 5 },
      { x: 1, value: 11, high: 13, low: 9, volume: -3 },
      { x: 2, value: 12, high: 14, low: 10, volume: 6 },
    ] as ChartLineTwiggsPoint[];
    expect(getLineTwiggsFinitePoints(points).map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineTwiggsFinitePoints(null)).toEqual([]);
    expect(getLineTwiggsFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineTwiggsPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineTwiggsPeriod(21.7, 21)).toBe(21);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineTwiggsPeriod(0, 21)).toBe(21);
    expect(normalizeLineTwiggsPeriod(-2, 21)).toBe(21);
    expect(normalizeLineTwiggsPeriod(Number.NaN, 21)).toBe(21);
  });
});

describe('computeLineTwiggsClv', () => {
  it('computes the close location value', () => {
    expect(
      computeLineTwiggsClv(TWIGGS_HIGHS, TWIGGS_LOWS, TWIGGS_CLOSES),
    ).toEqual(CLV_EXPECTED);
  });

  it('extends the range to the prior close', () => {
    // bar 1: prior close 200 is above high 100, so the true range
    // extends up to 200, pulling clv to -0.5 (it would be 0 without).
    expect(computeLineTwiggsClv([200, 100], [0, 0], [200, 50])).toEqual([
      1, -0.5,
    ]);
  });

  it('reads zero for a zero-width range', () => {
    expect(computeLineTwiggsClv([50, 50], [50, 50], [50, 50])).toEqual([
      0, 0,
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineTwiggsClv(null, TWIGGS_LOWS, TWIGGS_CLOSES)).toEqual(
      [],
    );
  });
});

describe('computeLineTwiggsSma', () => {
  it('computes the moving average', () => {
    expect(computeLineTwiggsSma([4, 8, 12, 16, 20], 2)).toEqual([
      null,
      6,
      10,
      14,
      18,
    ]);
  });

  it('is null where the window contains a null', () => {
    expect(computeLineTwiggsSma([null, 4, 8], 2)).toEqual([null, null, 6]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineTwiggsSma(null, 2)).toEqual([]);
  });
});

describe('computeLineTwiggs', () => {
  it('computes the Twiggs Money Flow', () => {
    expect(
      computeLineTwiggs(
        TWIGGS_HIGHS,
        TWIGGS_LOWS,
        TWIGGS_CLOSES,
        TWIGGS_VOLUMES,
        4,
      ),
    ).toEqual(TMF_EXPECTED);
  });

  it('is null through the warm-up', () => {
    const tmf = computeLineTwiggs(
      TWIGGS_HIGHS,
      TWIGGS_LOWS,
      TWIGGS_CLOSES,
      TWIGGS_VOLUMES,
      4,
    );
    expect(tmf.slice(0, 3)).toEqual([null, null, null]);
  });

  it('is null for a zero-volume window', () => {
    const tmf = computeLineTwiggs(
      [100, 100, 100, 100, 100],
      [0, 0, 0, 0, 0],
      [100, 50, 0, 50, 100],
      [0, 0, 0, 0, 0],
      4,
    );
    expect(tmf[4]).toBeNull();
  });

  it('returns an empty array for a non-array input', () => {
    expect(
      computeLineTwiggs(null, TWIGGS_LOWS, TWIGGS_CLOSES, TWIGGS_VOLUMES, 4),
    ).toEqual([]);
  });
});

describe('runLineTwiggs', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineTwiggs(TWIGGS_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period and threshold', () => {
    const run = runLineTwiggs(TWIGGS_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(0.1);
  });

  it('exposes the clv series', () => {
    expect(runLineTwiggs(TWIGGS_DATA, OPTS).clv).toEqual(CLV_EXPECTED);
  });

  it('exposes the tmf series', () => {
    expect(runLineTwiggs(TWIGGS_DATA, OPTS).tmf).toEqual(TMF_EXPECTED);
  });

  it('emits one sample per point', () => {
    expect(runLineTwiggs(TWIGGS_DATA, OPTS).samples).toHaveLength(
      TWIGGS_DATA.length,
    );
  });

  it('classifies each sample into a zone', () => {
    const run = runLineTwiggs(TWIGGS_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('counts the bullish, bearish and neutral bars', () => {
    const run = runLineTwiggs(TWIGGS_DATA, OPTS);
    expect(run.bullishCount).toBe(4);
    expect(run.bearishCount).toBe(3);
    expect(run.neutralCount).toBe(2);
  });

  it('keeps the zone counts consistent with the samples', () => {
    const run = runLineTwiggs(TWIGGS_DATA, OPTS);
    expect(run.bullishCount).toBe(
      run.samples.filter((s) => s.zone === 'bullish').length,
    );
    expect(run.bearishCount).toBe(
      run.samples.filter((s) => s.zone === 'bearish').length,
    );
  });

  it('reports the final tmf reading', () => {
    expect(runLineTwiggs(TWIGGS_DATA, OPTS).twiggsFinal).toBe(0.25);
  });

  it('carries the clv, tmf and zone fields on each sample', () => {
    const run = runLineTwiggs(TWIGGS_DATA, OPTS);
    const s = run.samples[3]!;
    expect(s.clv).toBe(1);
    expect(s.tmf).toBe(1);
    expect(s.zone).toBe('bullish');
  });

  it('is not ok for a single-point series', () => {
    expect(
      runLineTwiggs(
        [{ x: 0, value: 1, high: 2, low: 0, volume: 5 }],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineTwiggs([], OPTS).ok).toBe(false);
    expect(runLineTwiggs(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      TWIGGS_DATA[6]!,
      TWIGGS_DATA[0]!,
      TWIGGS_DATA[11]!,
      TWIGGS_DATA[3]!,
    ];
    const run = runLineTwiggs(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 6, 11]);
  });

  it('defaults to the period 21 configuration', () => {
    expect(runLineTwiggs(TWIGGS_DATA).period).toBe(
      DEFAULT_CHART_LINE_TWIGGS_PERIOD,
    );
  });
});

describe('computeLineTwiggsLayout', () => {
  const layoutOptions = {
    data: TWIGGS_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineTwiggsLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the twiggs panel', () => {
    const layout = computeLineTwiggsLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.twiggsPanel.y);
    expect(layout.twiggsPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineTwiggsLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty tmf path', () => {
    expect(
      computeLineTwiggsLayout(layoutOptions).tmfPath.length,
    ).toBeGreaterThan(0);
  });

  it('emits one price dot per point', () => {
    expect(computeLineTwiggsLayout(layoutOptions).priceDots).toHaveLength(
      TWIGGS_DATA.length,
    );
  });

  it('emits one tmf marker per defined sample', () => {
    expect(computeLineTwiggsLayout(layoutOptions).tmfMarkers).toHaveLength(9);
  });

  it('orders the upper, zero and lower level lines top to bottom', () => {
    const layout = computeLineTwiggsLayout(layoutOptions);
    expect(layout.upperY).toBeLessThan(layout.zeroY);
    expect(layout.zeroY).toBeLessThan(layout.lowerY);
  });

  it('places the level lines inside the twiggs panel', () => {
    const layout = computeLineTwiggsLayout(layoutOptions);
    for (const y of [layout.upperY, layout.zeroY, layout.lowerY]) {
      expect(y).toBeGreaterThanOrEqual(layout.twiggsPanel.y);
      expect(y).toBeLessThanOrEqual(
        layout.twiggsPanel.y + layout.twiggsPanel.height,
      );
    }
  });

  it('carries the run statistics', () => {
    const layout = computeLineTwiggsLayout(layoutOptions);
    expect(layout.twiggsFinal).toBe(0.25);
    expect(layout.bullishCount).toBe(4);
    expect(layout.bearishCount).toBe(3);
    expect(layout.totalPoints).toBe(12);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineTwiggsLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineTwiggsLayout({
        ...layoutOptions,
        data: [{ x: 0, value: 1, high: 2, low: 0, volume: 5 }],
      }).ok,
    ).toBe(false);
  });
});

describe('describeLineTwiggsChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineTwiggsChart(TWIGGS_DATA, OPTS);
    expect(text).toContain('Twiggs Money Flow');
    expect(text).toContain('volume');
    expect(text).toContain('range');
    expect(text).toContain('smooth');
  });

  it('reports the zone counts', () => {
    const text = describeLineTwiggsChart(TWIGGS_DATA, OPTS);
    expect(text).toContain('bullish on 4');
    expect(text).toContain('bearish on 3');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineTwiggsChart([])).toBe('No data');
  });
});

describe('<ChartLineTwiggs />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-twiggs-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Twiggs Money Flow');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-twiggs"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-bullish-count')).toBe('4');
    expect(root?.getAttribute('data-bearish-count')).toBe('3');
    expect(root?.getAttribute('data-neutral-count')).toBe('2');
    expect(root?.getAttribute('data-total-points')).toBe('12');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-twiggs-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-twiggs-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    const labels = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-twiggs-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('TMF');
  });

  it('renders the tmf line', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-twiggs-tmf-line"]'),
    ).not.toBeNull();
  });

  it('renders one tmf marker per defined sample', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-twiggs-marker"]'),
    ).toHaveLength(9);
  });

  it('renders the upper, zero and lower level lines', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-twiggs-level-line"]',
      ),
    ).toHaveLength(3);
  });

  it('exposes the zone on each tmf marker', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-twiggs-marker"][data-point-index="3"]',
    );
    expect(marker?.getAttribute('data-zone')).toBe('bullish');
  });

  it('renders the three-item legend', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-twiggs-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-twiggs-badge-config"]',
    );
    expect(badge?.textContent).toBe('4');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-twiggs-price-path"]'),
    ).toBeNull();
  });

  it('hides the tmf line and markers when showTwiggs is false', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} showTwiggs={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-twiggs-tmf-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-twiggs-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the level lines when showLevels is false', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} showLevels={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-twiggs-level-line"]'),
    ).toBeNull();
  });

  it('hides the twiggs via the hidden set', () => {
    const { container } = render(
      <ChartLineTwiggs
        data={TWIGGS_DATA}
        {...OPTS}
        hiddenSeries={['twiggs']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-twiggs-tmf-line"]'),
    ).toBeNull();
  });

  it('hides the level lines via the hidden set', () => {
    const { container } = render(
      <ChartLineTwiggs
        data={TWIGGS_DATA}
        {...OPTS}
        hiddenSeries={['levels']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-twiggs-level-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineTwiggs
        data={TWIGGS_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-twiggs-legend-item"][data-series-id="twiggs"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'twiggs', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-twiggs-dot"]'),
    ).toHaveLength(TWIGGS_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineTwiggs
        data={[{ x: 0, value: 1, high: 2, low: 0, volume: 5 }]}
        {...OPTS}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-twiggs"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-twiggs-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTwiggs ref={ref} data={TWIGGS_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-twiggs',
    );
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineTwiggs.displayName).toBe('ChartLineTwiggs');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineTwiggs data={TWIGGS_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-twiggs"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
