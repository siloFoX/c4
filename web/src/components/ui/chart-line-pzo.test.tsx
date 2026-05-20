import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLinePzo,
  getLinePzoFinitePoints,
  normalizeLinePzoPeriod,
  computeLinePzoSignedChange,
  computeLinePzoTotalChange,
  computeLinePzo,
  runLinePzo,
  computeLinePzoLayout,
  describeLinePzoChart,
  DEFAULT_CHART_LINE_PZO_PERIOD,
  type ChartLinePzoPoint,
} from './chart-line-pzo';

afterEach(() => cleanup());

const PZO_CLOSES = [
  50, 52, 56, 58, 60, 58, 54, 52, 50, 52, 56, 54, 56,
];
const PZO_DATA: ChartLinePzoPoint[] = PZO_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = { period: 4, threshold: 40 };

// period 4: every window has total change 10, so PZO = 10 * signed
// lands on exact multiples of 10.
const SIGNED_EXPECTED = [
  null,
  null,
  null,
  null,
  10,
  6,
  -2,
  -6,
  -10,
  -6,
  2,
  2,
  6,
];
const TOTAL_EXPECTED = [
  null,
  null,
  null,
  null,
  10,
  10,
  10,
  10,
  10,
  10,
  10,
  10,
  10,
];
const PZO_EXPECTED = [
  null,
  null,
  null,
  null,
  100,
  60,
  -20,
  -60,
  -100,
  -60,
  20,
  20,
  60,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'none',
  'bullish',
  'bullish',
  'neutral',
  'bearish',
  'bearish',
  'bearish',
  'neutral',
  'neutral',
  'bullish',
];

describe('getLinePzoFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLinePzoPoint[];
    expect(getLinePzoFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLinePzoFinitePoints(null)).toEqual([]);
    expect(getLinePzoFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLinePzoPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLinePzoPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLinePzoPeriod(0, 14)).toBe(14);
    expect(normalizeLinePzoPeriod(-3, 14)).toBe(14);
    expect(normalizeLinePzoPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('computeLinePzoSignedChange', () => {
  it('computes the signed change over the window', () => {
    expect(computeLinePzoSignedChange(PZO_CLOSES, 4)).toEqual(
      SIGNED_EXPECTED,
    );
  });

  it('is null through the warm-up', () => {
    const signed = computeLinePzoSignedChange(PZO_CLOSES, 4);
    expect(signed.slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('telescopes to the net move over the lookback', () => {
    const signed = computeLinePzoSignedChange(PZO_CLOSES, 4);
    for (let i = 4; i < PZO_CLOSES.length; i += 1) {
      expect(signed[i]).toBe(PZO_CLOSES[i]! - PZO_CLOSES[i - 4]!);
    }
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLinePzoSignedChange(null, 4)).toEqual([]);
  });
});

describe('computeLinePzoTotalChange', () => {
  it('computes the total absolute change over the window', () => {
    expect(computeLinePzoTotalChange(PZO_CLOSES, 4)).toEqual(TOTAL_EXPECTED);
  });

  it('is null through the warm-up', () => {
    const total = computeLinePzoTotalChange(PZO_CLOSES, 4);
    expect(total.slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('is at least the magnitude of the signed change', () => {
    const signed = computeLinePzoSignedChange(PZO_CLOSES, 4);
    const total = computeLinePzoTotalChange(PZO_CLOSES, 4);
    for (let i = 4; i < PZO_CLOSES.length; i += 1) {
      expect(total[i]!).toBeGreaterThanOrEqual(Math.abs(signed[i]!));
    }
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLinePzoTotalChange(null, 4)).toEqual([]);
  });
});

describe('computeLinePzo', () => {
  it('computes the ratio of signed to total change', () => {
    expect(computeLinePzo(PZO_CLOSES, 4)).toEqual(PZO_EXPECTED);
  });

  it('is null through the warm-up', () => {
    expect(computeLinePzo(PZO_CLOSES, 4).slice(0, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('reads +100 for a clean up-trend', () => {
    expect(computeLinePzo([10, 12, 14, 16, 18], 4)).toEqual([
      null,
      null,
      null,
      null,
      100,
    ]);
  });

  it('reads -100 for a clean down-trend', () => {
    expect(computeLinePzo([18, 16, 14, 12, 10], 4)).toEqual([
      null,
      null,
      null,
      null,
      -100,
    ]);
  });

  it('reads 0 for a flat window', () => {
    expect(computeLinePzo([10, 10, 10, 10, 10], 4)).toEqual([
      null,
      null,
      null,
      null,
      0,
    ]);
  });

  it('stays within -100 to 100', () => {
    for (const v of computeLinePzo(PZO_CLOSES, 4)) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLinePzo(null, 4)).toEqual([]);
  });
});

describe('runLinePzo', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLinePzo(PZO_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period and threshold', () => {
    const run = runLinePzo(PZO_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(40);
  });

  it('exposes the signed and total change series', () => {
    const run = runLinePzo(PZO_DATA, OPTS);
    expect(run.signedChange).toEqual(SIGNED_EXPECTED);
    expect(run.totalChange).toEqual(TOTAL_EXPECTED);
  });

  it('exposes the pzo series', () => {
    expect(runLinePzo(PZO_DATA, OPTS).pzo).toEqual(PZO_EXPECTED);
  });

  it('emits one sample per point', () => {
    expect(runLinePzo(PZO_DATA, OPTS).samples).toHaveLength(PZO_DATA.length);
  });

  it('classifies each sample into a zone', () => {
    const run = runLinePzo(PZO_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('counts the bullish, bearish and neutral bars', () => {
    const run = runLinePzo(PZO_DATA, OPTS);
    expect(run.bullishCount).toBe(3);
    expect(run.bearishCount).toBe(3);
    expect(run.neutralCount).toBe(3);
  });

  it('keeps the zone counts consistent with the samples', () => {
    const run = runLinePzo(PZO_DATA, OPTS);
    expect(run.bullishCount).toBe(
      run.samples.filter((s) => s.zone === 'bullish').length,
    );
    expect(run.bearishCount).toBe(
      run.samples.filter((s) => s.zone === 'bearish').length,
    );
  });

  it('reports the final pzo reading', () => {
    expect(runLinePzo(PZO_DATA, OPTS).pzoFinal).toBe(60);
  });

  it('carries the signed, total, pzo and zone fields on each sample', () => {
    const run = runLinePzo(PZO_DATA, OPTS);
    const s = run.samples[4]!;
    expect(s.signedChange).toBe(10);
    expect(s.totalChange).toBe(10);
    expect(s.pzo).toBe(100);
    expect(s.zone).toBe('bullish');
  });

  it('is not ok for a single-point series', () => {
    expect(runLinePzo([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLinePzo([], OPTS).ok).toBe(false);
    expect(runLinePzo(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      PZO_DATA[8]!,
      PZO_DATA[0]!,
      PZO_DATA[12]!,
      PZO_DATA[4]!,
    ];
    const run = runLinePzo(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 4, 8, 12]);
  });

  it('defaults to the period 14 configuration', () => {
    expect(runLinePzo(PZO_DATA).period).toBe(DEFAULT_CHART_LINE_PZO_PERIOD);
  });
});

describe('computeLinePzoLayout', () => {
  const layoutOptions = {
    data: PZO_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLinePzoLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the pzo panel', () => {
    const layout = computeLinePzoLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.pzoPanel.y);
    expect(layout.pzoPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLinePzoLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty pzo path', () => {
    expect(computeLinePzoLayout(layoutOptions).pzoPath.length).toBeGreaterThan(
      0,
    );
  });

  it('emits one price dot per point', () => {
    expect(computeLinePzoLayout(layoutOptions).priceDots).toHaveLength(
      PZO_DATA.length,
    );
  });

  it('emits one pzo marker per defined sample', () => {
    expect(computeLinePzoLayout(layoutOptions).pzoMarkers).toHaveLength(9);
  });

  it('orders the upper, zero and lower level lines top to bottom', () => {
    const layout = computeLinePzoLayout(layoutOptions);
    expect(layout.upperY).toBeLessThan(layout.zeroY);
    expect(layout.zeroY).toBeLessThan(layout.lowerY);
  });

  it('places the level lines inside the pzo panel', () => {
    const layout = computeLinePzoLayout(layoutOptions);
    for (const y of [layout.upperY, layout.zeroY, layout.lowerY]) {
      expect(y).toBeGreaterThanOrEqual(layout.pzoPanel.y);
      expect(y).toBeLessThanOrEqual(
        layout.pzoPanel.y + layout.pzoPanel.height,
      );
    }
  });

  it('carries the run statistics', () => {
    const layout = computeLinePzoLayout(layoutOptions);
    expect(layout.pzoFinal).toBe(60);
    expect(layout.bullishCount).toBe(3);
    expect(layout.bearishCount).toBe(3);
    expect(layout.totalPoints).toBe(13);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLinePzoLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLinePzoLayout({ ...layoutOptions, data: [{ x: 0, value: 1 }] })
        .ok,
    ).toBe(false);
  });
});

describe('describeLinePzoChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLinePzoChart(PZO_DATA, OPTS);
    expect(text).toContain('Price Zone Oscillator');
    expect(text).toContain('ratio');
    expect(text).toContain('signed price change');
    expect(text).toContain('total price change');
  });

  it('reports the zone counts', () => {
    const text = describeLinePzoChart(PZO_DATA, OPTS);
    expect(text).toContain('bullish on 3');
    expect(text).toContain('bearish on 3');
  });

  it('returns No data for an empty input', () => {
    expect(describeLinePzoChart([])).toBe('No data');
  });
});

describe('<ChartLinePzo />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-pzo-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Price Zone Oscillator');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-pzo"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-bullish-count')).toBe('3');
    expect(root?.getAttribute('data-bearish-count')).toBe('3');
    expect(root?.getAttribute('data-neutral-count')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe('13');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-pzo-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-pzo-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    const labels = Array.from(
      container.querySelectorAll('[data-section="chart-line-pzo-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('PZO');
  });

  it('renders the pzo line', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-pzo-pzo-line"]'),
    ).not.toBeNull();
  });

  it('renders one pzo marker per defined sample', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-pzo-marker"]'),
    ).toHaveLength(9);
  });

  it('renders the upper, zero and lower level lines', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-pzo-level-line"]'),
    ).toHaveLength(3);
  });

  it('exposes the zone on each pzo marker', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-pzo-marker"][data-point-index="4"]',
    );
    expect(marker?.getAttribute('data-zone')).toBe('bullish');
  });

  it('renders the three-item legend', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-pzo-legend-item"]'),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLinePzo data={PZO_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-pzo-badge-config"]',
    );
    expect(badge?.textContent).toBe('4');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLinePzo data={PZO_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pzo-price-path"]'),
    ).toBeNull();
  });

  it('hides the pzo line and markers when showPzo is false', () => {
    const { container } = render(
      <ChartLinePzo data={PZO_DATA} {...OPTS} showPzo={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pzo-pzo-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-pzo-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the level lines when showLevels is false', () => {
    const { container } = render(
      <ChartLinePzo data={PZO_DATA} {...OPTS} showLevels={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pzo-level-line"]'),
    ).toBeNull();
  });

  it('hides the pzo via the hidden set', () => {
    const { container } = render(
      <ChartLinePzo data={PZO_DATA} {...OPTS} hiddenSeries={['pzo']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pzo-pzo-line"]'),
    ).toBeNull();
  });

  it('hides the level lines via the hidden set', () => {
    const { container } = render(
      <ChartLinePzo data={PZO_DATA} {...OPTS} hiddenSeries={['levels']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pzo-level-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLinePzo
        data={PZO_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-pzo-legend-item"][data-series-id="pzo"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'pzo', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLinePzo data={PZO_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-pzo-dot"]'),
    ).toHaveLength(PZO_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLinePzo data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-pzo"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLinePzo data={PZO_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pzo-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePzo ref={ref} data={PZO_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-pzo');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLinePzo.displayName).toBe('ChartLinePzo');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLinePzo data={PZO_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-pzo"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
