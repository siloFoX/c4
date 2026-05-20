import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLinePvi,
  getLinePviFinitePoints,
  normalizeLinePviBase,
  computeLinePviIndex,
  runLinePvi,
  computeLinePviLayout,
  describeLinePviChart,
  DEFAULT_CHART_LINE_PVI_BASE,
  type ChartLinePviPoint,
} from './chart-line-pvi';

afterEach(() => cleanup());

// Closes are all powers of two, so each ratio close[i]/close[i-1]
// is dyadic and the PVI (seeded at 1000) stays exact.
const PVI_CLOSES = [256, 512, 512, 1024, 1024, 512, 512, 256, 256, 512];
const PVI_VOLUMES = [20, 50, 30, 70, 40, 80, 30, 60, 25, 90];
const PVI_DATA: ChartLinePviPoint[] = PVI_CLOSES.map((value, x) => ({
  x,
  value,
  volume: PVI_VOLUMES[x] as number,
}));
const OPTS = { base: 1000 };

const PVI_EXPECTED = [
  1000, 2000, 2000, 4000, 4000, 2000, 2000, 1000, 1000, 2000,
];
const STATE_EXPECTED = [
  'flat',
  'up',
  'flat',
  'up',
  'flat',
  'down',
  'flat',
  'down',
  'flat',
  'up',
];

describe('getLinePviFinitePoints', () => {
  it('keeps points with a finite x, value and volume', () => {
    const points = [
      { x: 0, value: 10, volume: 5 },
      { x: 1, value: Number.NaN, volume: 5 },
      { x: 2, value: 20, volume: Number.NaN },
      { x: 3, value: 30, volume: 8 },
    ] as ChartLinePviPoint[];
    expect(getLinePviFinitePoints(points)).toEqual([
      { x: 0, value: 10, volume: 5 },
      { x: 3, value: 30, volume: 8 },
    ]);
  });

  it('drops a point with a negative volume', () => {
    const points = [
      { x: 0, value: 10, volume: 5 },
      { x: 1, value: 12, volume: -3 },
      { x: 2, value: 14, volume: 8 },
    ] as ChartLinePviPoint[];
    expect(getLinePviFinitePoints(points).map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLinePviFinitePoints(null)).toEqual([]);
    expect(getLinePviFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLinePviBase', () => {
  it('uses a positive base', () => {
    expect(normalizeLinePviBase(500)).toBe(500);
  });

  it('falls back for a non-positive or non-finite base', () => {
    expect(normalizeLinePviBase(0)).toBe(1000);
    expect(normalizeLinePviBase(-5)).toBe(1000);
    expect(normalizeLinePviBase(Number.NaN)).toBe(1000);
  });
});

describe('computeLinePviIndex', () => {
  it('starts at the base value', () => {
    expect(computeLinePviIndex(PVI_CLOSES, PVI_VOLUMES, 1000)[0]).toBe(1000);
  });

  it('computes the cumulative index', () => {
    expect(computeLinePviIndex(PVI_CLOSES, PVI_VOLUMES, 1000)).toEqual(
      PVI_EXPECTED,
    );
  });

  it('holds flat on a lower-volume bar', () => {
    const pvi = computeLinePviIndex(PVI_CLOSES, PVI_VOLUMES, 1000);
    // bar 2 volume 30 < bar 1 volume 50 -> hold
    expect(pvi[2]).toBe(pvi[1]);
  });

  it('applies the price change on a higher-volume bar', () => {
    const pvi = computeLinePviIndex(PVI_CLOSES, PVI_VOLUMES, 1000);
    // bar 1 volume 50 > bar 0 volume 20 -> 1000 * 512 / 256
    expect(pvi[1]).toBe(2000);
  });

  it('holds when the volume is unchanged', () => {
    expect(computeLinePviIndex([100, 200], [5, 5], 1000)).toEqual([
      1000, 1000,
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLinePviIndex(null, PVI_VOLUMES, 1000)).toEqual([]);
    expect(computeLinePviIndex(PVI_CLOSES, null, 1000)).toEqual([]);
  });
});

describe('runLinePvi', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLinePvi(PVI_DATA, OPTS).ok).toBe(true);
  });

  it('carries the base value', () => {
    expect(runLinePvi(PVI_DATA, OPTS).base).toBe(1000);
  });

  it('exposes the pvi series', () => {
    expect(runLinePvi(PVI_DATA, OPTS).pvi).toEqual(PVI_EXPECTED);
  });

  it('emits one sample per point', () => {
    expect(runLinePvi(PVI_DATA, OPTS).samples).toHaveLength(PVI_DATA.length);
  });

  it('classifies each sample as up, down or flat', () => {
    const run = runLinePvi(PVI_DATA, OPTS);
    expect(run.samples.map((s) => s.state)).toEqual(STATE_EXPECTED);
  });

  it('counts the up, down and flat bars', () => {
    const run = runLinePvi(PVI_DATA, OPTS);
    expect(run.upCount).toBe(3);
    expect(run.downCount).toBe(2);
    expect(run.flatCount).toBe(5);
  });

  it('keeps the state counts consistent with the samples', () => {
    const run = runLinePvi(PVI_DATA, OPTS);
    expect(run.upCount).toBe(
      run.samples.filter((s) => s.state === 'up').length,
    );
    expect(run.downCount).toBe(
      run.samples.filter((s) => s.state === 'down').length,
    );
  });

  it('reports the final pvi reading', () => {
    expect(runLinePvi(PVI_DATA, OPTS).pviFinal).toBe(2000);
  });

  it('carries the volume, pvi and state fields on each sample', () => {
    const run = runLinePvi(PVI_DATA, OPTS);
    const s = run.samples[1]!;
    expect(s.volume).toBe(50);
    expect(s.pvi).toBe(2000);
    expect(s.state).toBe('up');
  });

  it('is not ok for a single-point series', () => {
    expect(runLinePvi([{ x: 0, value: 1, volume: 5 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLinePvi([], OPTS).ok).toBe(false);
    expect(runLinePvi(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      PVI_DATA[6]!,
      PVI_DATA[0]!,
      PVI_DATA[9]!,
      PVI_DATA[3]!,
    ];
    const run = runLinePvi(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 6, 9]);
  });

  it('defaults to the base 1000 configuration', () => {
    expect(runLinePvi(PVI_DATA).base).toBe(DEFAULT_CHART_LINE_PVI_BASE);
  });
});

describe('computeLinePviLayout', () => {
  const layoutOptions = {
    data: PVI_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLinePviLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the pvi panel', () => {
    const layout = computeLinePviLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.pviPanel.y);
    expect(layout.pviPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLinePviLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty pvi path', () => {
    expect(computeLinePviLayout(layoutOptions).pviPath.length).toBeGreaterThan(
      0,
    );
  });

  it('emits one price dot per point', () => {
    expect(computeLinePviLayout(layoutOptions).priceDots).toHaveLength(
      PVI_DATA.length,
    );
  });

  it('emits one pvi marker per point', () => {
    expect(computeLinePviLayout(layoutOptions).pviMarkers).toHaveLength(
      PVI_DATA.length,
    );
  });

  it('places the base line inside the pvi panel', () => {
    const layout = computeLinePviLayout(layoutOptions);
    expect(layout.baseY).toBeGreaterThanOrEqual(layout.pviPanel.y);
    expect(layout.baseY).toBeLessThanOrEqual(
      layout.pviPanel.y + layout.pviPanel.height,
    );
  });

  it('carries the run statistics', () => {
    const layout = computeLinePviLayout(layoutOptions);
    expect(layout.pviFinal).toBe(2000);
    expect(layout.upCount).toBe(3);
    expect(layout.downCount).toBe(2);
    expect(layout.totalPoints).toBe(10);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLinePviLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLinePviLayout({
        ...layoutOptions,
        data: [{ x: 0, value: 1, volume: 5 }],
      }).ok,
    ).toBe(false);
  });
});

describe('describeLinePviChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLinePviChart(PVI_DATA, OPTS);
    expect(text).toContain('Positive Volume Index');
    expect(text).toContain('cumulative');
    expect(text).toContain('higher-volume');
  });

  it('reports the state counts', () => {
    const text = describeLinePviChart(PVI_DATA, OPTS);
    expect(text).toContain('rose on 3');
    expect(text).toContain('fell on 2');
  });

  it('returns No data for an empty input', () => {
    expect(describeLinePviChart([])).toBe('No data');
  });
});

describe('<ChartLinePvi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-pvi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Positive Volume Index');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-pvi"]');
    expect(root?.getAttribute('data-base')).toBe('1000');
    expect(root?.getAttribute('data-up-count')).toBe('3');
    expect(root?.getAttribute('data-down-count')).toBe('2');
    expect(root?.getAttribute('data-flat-count')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('10');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-pvi-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-pvi-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    const labels = Array.from(
      container.querySelectorAll('[data-section="chart-line-pvi-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('PVI');
  });

  it('renders the pvi line', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-pvi-pvi-line"]'),
    ).not.toBeNull();
  });

  it('renders one pvi marker per point', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-pvi-marker"]'),
    ).toHaveLength(PVI_DATA.length);
  });

  it('renders the base line', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-pvi-base-line"]'),
    ).not.toBeNull();
  });

  it('exposes the state on each pvi marker', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-pvi-marker"][data-point-index="1"]',
    );
    expect(marker?.getAttribute('data-state')).toBe('up');
  });

  it('renders the two-item legend', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-pvi-legend-item"]'),
    ).toHaveLength(2);
  });

  it('renders the config badge with the base', () => {
    const { container } = render(<ChartLinePvi data={PVI_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-pvi-badge-config"]',
    );
    expect(badge?.textContent).toBe('1000');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLinePvi data={PVI_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pvi-price-path"]'),
    ).toBeNull();
  });

  it('hides the pvi line and markers when showPvi is false', () => {
    const { container } = render(
      <ChartLinePvi data={PVI_DATA} {...OPTS} showPvi={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pvi-pvi-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-pvi-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the pvi via the hidden set', () => {
    const { container } = render(
      <ChartLinePvi data={PVI_DATA} {...OPTS} hiddenSeries={['pvi']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pvi-pvi-line"]'),
    ).toBeNull();
  });

  it('hides the base line when showBaseLine is false', () => {
    const { container } = render(
      <ChartLinePvi data={PVI_DATA} {...OPTS} showBaseLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pvi-base-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLinePvi
        data={PVI_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-pvi-legend-item"][data-series-id="pvi"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'pvi', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLinePvi data={PVI_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-pvi-dot"]'),
    ).toHaveLength(PVI_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLinePvi data={[{ x: 0, value: 1, volume: 5 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-pvi"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLinePvi data={PVI_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pvi-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePvi ref={ref} data={PVI_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-pvi');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLinePvi.displayName).toBe('ChartLinePvi');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLinePvi data={PVI_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-pvi"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
