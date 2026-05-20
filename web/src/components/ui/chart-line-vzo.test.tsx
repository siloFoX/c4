import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVzo,
  getLineVzoFinitePoints,
  normalizeLineVzoPeriod,
  computeLineVzoSignedVolume,
  computeLineVzoTotalVolume,
  computeLineVzo,
  runLineVzo,
  computeLineVzoLayout,
  describeLineVzoChart,
  DEFAULT_CHART_LINE_VZO_PERIOD,
  type ChartLineVzoPoint,
} from './chart-line-vzo';

afterEach(() => cleanup());

const VZO_CLOSES = [
  50, 52, 54, 56, 58, 56, 54, 52, 50, 52, 50, 52, 50,
];
const VZO_VOLUMES = [
  25, 10, 40, 30, 20, 10, 40, 30, 20, 10, 40, 30, 20,
];
const VZO_DATA: ChartLineVzoPoint[] = VZO_CLOSES.map((value, x) => ({
  x,
  value,
  volume: VZO_VOLUMES[x] as number,
}));
const OPTS = { period: 4, threshold: 40 };

// period 4: the volume pattern repeats every 4 bars, so every
// window has a total volume of 100 and VZO = signedVolume exactly.
const SIGNED_EXPECTED = [
  null,
  null,
  null,
  null,
  100,
  80,
  0,
  -60,
  -100,
  -80,
  -80,
  -20,
  -20,
];
const TOTAL_EXPECTED = [
  null,
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
  100,
  100,
];
const VZO_EXPECTED = [
  null,
  null,
  null,
  null,
  100,
  80,
  0,
  -60,
  -100,
  -80,
  -80,
  -20,
  -20,
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
  'bearish',
  'neutral',
  'neutral',
];

describe('getLineVzoFinitePoints', () => {
  it('keeps points with a finite x, value and volume', () => {
    const points = [
      { x: 0, value: 10, volume: 5 },
      { x: 1, value: Number.NaN, volume: 5 },
      { x: 2, value: 20, volume: Number.NaN },
      { x: 3, value: 30, volume: 8 },
    ] as ChartLineVzoPoint[];
    expect(getLineVzoFinitePoints(points)).toEqual([
      { x: 0, value: 10, volume: 5 },
      { x: 3, value: 30, volume: 8 },
    ]);
  });

  it('drops a point with a negative volume', () => {
    const points = [
      { x: 0, value: 10, volume: 5 },
      { x: 1, value: 12, volume: -3 },
      { x: 2, value: 14, volume: 8 },
    ] as ChartLineVzoPoint[];
    expect(getLineVzoFinitePoints(points).map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineVzoFinitePoints(null)).toEqual([]);
    expect(getLineVzoFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineVzoPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineVzoPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineVzoPeriod(0, 14)).toBe(14);
    expect(normalizeLineVzoPeriod(-3, 14)).toBe(14);
    expect(normalizeLineVzoPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('computeLineVzoSignedVolume', () => {
  it('computes the signed volume over the window', () => {
    expect(computeLineVzoSignedVolume(VZO_CLOSES, VZO_VOLUMES, 4)).toEqual(
      SIGNED_EXPECTED,
    );
  });

  it('is null through the warm-up', () => {
    const signed = computeLineVzoSignedVolume(VZO_CLOSES, VZO_VOLUMES, 4);
    expect(signed.slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('signs each bar volume by the price direction', () => {
    // bar 1 up (12 >= 10) -> +7, bar 2 down (8 < 12) -> -3
    expect(computeLineVzoSignedVolume([10, 12, 8], [5, 7, 3], 2)[2]).toBe(4);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineVzoSignedVolume(null, VZO_VOLUMES, 4)).toEqual([]);
    expect(computeLineVzoSignedVolume(VZO_CLOSES, null, 4)).toEqual([]);
  });
});

describe('computeLineVzoTotalVolume', () => {
  it('computes the total volume over the window', () => {
    expect(computeLineVzoTotalVolume(VZO_VOLUMES, 4)).toEqual(TOTAL_EXPECTED);
  });

  it('is null through the warm-up', () => {
    expect(computeLineVzoTotalVolume(VZO_VOLUMES, 4).slice(0, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineVzoTotalVolume(null, 4)).toEqual([]);
  });
});

describe('computeLineVzo', () => {
  it('computes the ratio of signed to total volume', () => {
    expect(computeLineVzo(VZO_CLOSES, VZO_VOLUMES, 4)).toEqual(VZO_EXPECTED);
  });

  it('is null through the warm-up', () => {
    expect(computeLineVzo(VZO_CLOSES, VZO_VOLUMES, 4).slice(0, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('reads +100 when all volume is on up bars', () => {
    expect(
      computeLineVzo([10, 12, 14, 16, 18], [5, 5, 5, 5, 5], 4),
    ).toEqual([null, null, null, null, 100]);
  });

  it('reads -100 when all volume is on down bars', () => {
    expect(
      computeLineVzo([18, 16, 14, 12, 10], [5, 5, 5, 5, 5], 4),
    ).toEqual([null, null, null, null, -100]);
  });

  it('reads 0 for a window with no volume', () => {
    expect(
      computeLineVzo([10, 12, 14, 16, 18], [0, 0, 0, 0, 0], 4),
    ).toEqual([null, null, null, null, 0]);
  });

  it('stays within -100 to 100', () => {
    for (const v of computeLineVzo(VZO_CLOSES, VZO_VOLUMES, 4)) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineVzo(null, VZO_VOLUMES, 4)).toEqual([]);
  });
});

describe('runLineVzo', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineVzo(VZO_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period and threshold', () => {
    const run = runLineVzo(VZO_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(40);
  });

  it('exposes the signed and total volume series', () => {
    const run = runLineVzo(VZO_DATA, OPTS);
    expect(run.signedVolume).toEqual(SIGNED_EXPECTED);
    expect(run.totalVolume).toEqual(TOTAL_EXPECTED);
  });

  it('exposes the vzo series', () => {
    expect(runLineVzo(VZO_DATA, OPTS).vzo).toEqual(VZO_EXPECTED);
  });

  it('emits one sample per point', () => {
    expect(runLineVzo(VZO_DATA, OPTS).samples).toHaveLength(VZO_DATA.length);
  });

  it('classifies each sample into a zone', () => {
    const run = runLineVzo(VZO_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('counts the bullish, bearish and neutral bars', () => {
    const run = runLineVzo(VZO_DATA, OPTS);
    expect(run.bullishCount).toBe(2);
    expect(run.bearishCount).toBe(4);
    expect(run.neutralCount).toBe(3);
  });

  it('keeps the zone counts consistent with the samples', () => {
    const run = runLineVzo(VZO_DATA, OPTS);
    expect(run.bullishCount).toBe(
      run.samples.filter((s) => s.zone === 'bullish').length,
    );
    expect(run.bearishCount).toBe(
      run.samples.filter((s) => s.zone === 'bearish').length,
    );
  });

  it('reports the final vzo reading', () => {
    expect(runLineVzo(VZO_DATA, OPTS).vzoFinal).toBe(-20);
  });

  it('carries the signed, total, vzo and zone fields on each sample', () => {
    const run = runLineVzo(VZO_DATA, OPTS);
    const s = run.samples[4]!;
    expect(s.signedVolume).toBe(100);
    expect(s.totalVolume).toBe(100);
    expect(s.vzo).toBe(100);
    expect(s.zone).toBe('bullish');
  });

  it('is not ok for a single-point series', () => {
    expect(runLineVzo([{ x: 0, value: 1, volume: 5 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineVzo([], OPTS).ok).toBe(false);
    expect(runLineVzo(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      VZO_DATA[8]!,
      VZO_DATA[0]!,
      VZO_DATA[12]!,
      VZO_DATA[4]!,
    ];
    const run = runLineVzo(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 4, 8, 12]);
  });

  it('defaults to the period 14 configuration', () => {
    expect(runLineVzo(VZO_DATA).period).toBe(DEFAULT_CHART_LINE_VZO_PERIOD);
  });
});

describe('computeLineVzoLayout', () => {
  const layoutOptions = {
    data: VZO_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineVzoLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the vzo panel', () => {
    const layout = computeLineVzoLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.vzoPanel.y);
    expect(layout.vzoPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineVzoLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty vzo path', () => {
    expect(computeLineVzoLayout(layoutOptions).vzoPath.length).toBeGreaterThan(
      0,
    );
  });

  it('emits one price dot per point', () => {
    expect(computeLineVzoLayout(layoutOptions).priceDots).toHaveLength(
      VZO_DATA.length,
    );
  });

  it('emits one vzo marker per defined sample', () => {
    expect(computeLineVzoLayout(layoutOptions).vzoMarkers).toHaveLength(9);
  });

  it('orders the upper, zero and lower level lines top to bottom', () => {
    const layout = computeLineVzoLayout(layoutOptions);
    expect(layout.upperY).toBeLessThan(layout.zeroY);
    expect(layout.zeroY).toBeLessThan(layout.lowerY);
  });

  it('places the level lines inside the vzo panel', () => {
    const layout = computeLineVzoLayout(layoutOptions);
    for (const y of [layout.upperY, layout.zeroY, layout.lowerY]) {
      expect(y).toBeGreaterThanOrEqual(layout.vzoPanel.y);
      expect(y).toBeLessThanOrEqual(
        layout.vzoPanel.y + layout.vzoPanel.height,
      );
    }
  });

  it('carries the run statistics', () => {
    const layout = computeLineVzoLayout(layoutOptions);
    expect(layout.vzoFinal).toBe(-20);
    expect(layout.bullishCount).toBe(2);
    expect(layout.bearishCount).toBe(4);
    expect(layout.totalPoints).toBe(13);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineVzoLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineVzoLayout({
        ...layoutOptions,
        data: [{ x: 0, value: 1, volume: 5 }],
      }).ok,
    ).toBe(false);
  });
});

describe('describeLineVzoChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineVzoChart(VZO_DATA, OPTS);
    expect(text).toContain('Volume Zone Oscillator');
    expect(text).toContain('ratio');
    expect(text).toContain('signed volume');
    expect(text).toContain('total volume');
  });

  it('reports the zone counts', () => {
    const text = describeLineVzoChart(VZO_DATA, OPTS);
    expect(text).toContain('bullish on 2');
    expect(text).toContain('bearish on 4');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineVzoChart([])).toBe('No data');
  });
});

describe('<ChartLineVzo />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-vzo-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Volume Zone Oscillator');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-vzo"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-bullish-count')).toBe('2');
    expect(root?.getAttribute('data-bearish-count')).toBe('4');
    expect(root?.getAttribute('data-neutral-count')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe('13');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-vzo-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vzo-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    const labels = Array.from(
      container.querySelectorAll('[data-section="chart-line-vzo-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('VZO');
  });

  it('renders the vzo line', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-vzo-vzo-line"]'),
    ).not.toBeNull();
  });

  it('renders one vzo marker per defined sample', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-vzo-marker"]'),
    ).toHaveLength(9);
  });

  it('renders the upper, zero and lower level lines', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-vzo-level-line"]'),
    ).toHaveLength(3);
  });

  it('exposes the zone on each vzo marker', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-vzo-marker"][data-point-index="4"]',
    );
    expect(marker?.getAttribute('data-zone')).toBe('bullish');
  });

  it('renders the three-item legend', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-vzo-legend-item"]'),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineVzo data={VZO_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-vzo-badge-config"]',
    );
    expect(badge?.textContent).toBe('4');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineVzo data={VZO_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vzo-price-path"]'),
    ).toBeNull();
  });

  it('hides the vzo line and markers when showVzo is false', () => {
    const { container } = render(
      <ChartLineVzo data={VZO_DATA} {...OPTS} showVzo={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vzo-vzo-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-vzo-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the level lines when showLevels is false', () => {
    const { container } = render(
      <ChartLineVzo data={VZO_DATA} {...OPTS} showLevels={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vzo-level-line"]'),
    ).toBeNull();
  });

  it('hides the vzo via the hidden set', () => {
    const { container } = render(
      <ChartLineVzo data={VZO_DATA} {...OPTS} hiddenSeries={['vzo']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vzo-vzo-line"]'),
    ).toBeNull();
  });

  it('hides the level lines via the hidden set', () => {
    const { container } = render(
      <ChartLineVzo data={VZO_DATA} {...OPTS} hiddenSeries={['levels']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vzo-level-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineVzo
        data={VZO_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-vzo-legend-item"][data-series-id="vzo"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'vzo', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineVzo data={VZO_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-vzo-dot"]'),
    ).toHaveLength(VZO_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineVzo data={[{ x: 0, value: 1, volume: 5 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-vzo"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineVzo data={VZO_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vzo-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVzo ref={ref} data={VZO_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-vzo');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineVzo.displayName).toBe('ChartLineVzo');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineVzo data={VZO_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-vzo"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
