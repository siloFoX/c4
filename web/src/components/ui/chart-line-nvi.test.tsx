import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineNvi,
  getLineNviFinitePoints,
  normalizeLineNviBase,
  computeLineNviIndex,
  runLineNvi,
  computeLineNviLayout,
  describeLineNviChart,
  DEFAULT_CHART_LINE_NVI_BASE,
  type ChartLineNviPoint,
} from './chart-line-nvi';

afterEach(() => cleanup());

// Closes are all powers of two, so each ratio close[i]/close[i-1]
// is dyadic and the NVI (seeded at 1000) stays exact.
const NVI_CLOSES = [128, 256, 256, 128, 128, 256, 64, 128, 64, 256];
const NVI_VOLUMES = [50, 30, 60, 20, 70, 40, 30, 80, 25, 50];
const NVI_DATA: ChartLineNviPoint[] = NVI_CLOSES.map((value, x) => ({
  x,
  value,
  volume: NVI_VOLUMES[x] as number,
}));
const OPTS = { base: 1000 };

const NVI_EXPECTED = [
  1000, 2000, 2000, 1000, 1000, 2000, 500, 500, 250, 250,
];
const STATE_EXPECTED = [
  'flat',
  'up',
  'flat',
  'down',
  'flat',
  'up',
  'down',
  'flat',
  'down',
  'flat',
];

describe('getLineNviFinitePoints', () => {
  it('keeps points with a finite x, value and volume', () => {
    const points = [
      { x: 0, value: 10, volume: 5 },
      { x: 1, value: Number.NaN, volume: 5 },
      { x: 2, value: 20, volume: Number.NaN },
      { x: 3, value: 30, volume: 8 },
    ] as ChartLineNviPoint[];
    expect(getLineNviFinitePoints(points)).toEqual([
      { x: 0, value: 10, volume: 5 },
      { x: 3, value: 30, volume: 8 },
    ]);
  });

  it('drops a point with a negative volume', () => {
    const points = [
      { x: 0, value: 10, volume: 5 },
      { x: 1, value: 12, volume: -3 },
      { x: 2, value: 14, volume: 8 },
    ] as ChartLineNviPoint[];
    expect(getLineNviFinitePoints(points).map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineNviFinitePoints(null)).toEqual([]);
    expect(getLineNviFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineNviBase', () => {
  it('uses a positive base', () => {
    expect(normalizeLineNviBase(500)).toBe(500);
  });

  it('falls back for a non-positive or non-finite base', () => {
    expect(normalizeLineNviBase(0)).toBe(1000);
    expect(normalizeLineNviBase(-5)).toBe(1000);
    expect(normalizeLineNviBase(Number.NaN)).toBe(1000);
  });
});

describe('computeLineNviIndex', () => {
  it('starts at the base value', () => {
    expect(computeLineNviIndex(NVI_CLOSES, NVI_VOLUMES, 1000)[0]).toBe(1000);
  });

  it('computes the cumulative index', () => {
    expect(computeLineNviIndex(NVI_CLOSES, NVI_VOLUMES, 1000)).toEqual(
      NVI_EXPECTED,
    );
  });

  it('holds flat on a higher-volume bar', () => {
    const nvi = computeLineNviIndex(NVI_CLOSES, NVI_VOLUMES, 1000);
    // bar 2 volume 60 >= bar 1 volume 30 -> hold
    expect(nvi[2]).toBe(nvi[1]);
  });

  it('applies the price change on a lower-volume bar', () => {
    const nvi = computeLineNviIndex(NVI_CLOSES, NVI_VOLUMES, 1000);
    // bar 1 volume 30 < bar 0 volume 50 -> 1000 * 256 / 128
    expect(nvi[1]).toBe(2000);
  });

  it('holds when the volume is unchanged', () => {
    expect(computeLineNviIndex([100, 200], [5, 5], 1000)).toEqual([
      1000, 1000,
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineNviIndex(null, NVI_VOLUMES, 1000)).toEqual([]);
    expect(computeLineNviIndex(NVI_CLOSES, null, 1000)).toEqual([]);
  });
});

describe('runLineNvi', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineNvi(NVI_DATA, OPTS).ok).toBe(true);
  });

  it('carries the base value', () => {
    expect(runLineNvi(NVI_DATA, OPTS).base).toBe(1000);
  });

  it('exposes the nvi series', () => {
    expect(runLineNvi(NVI_DATA, OPTS).nvi).toEqual(NVI_EXPECTED);
  });

  it('emits one sample per point', () => {
    expect(runLineNvi(NVI_DATA, OPTS).samples).toHaveLength(NVI_DATA.length);
  });

  it('classifies each sample as up, down or flat', () => {
    const run = runLineNvi(NVI_DATA, OPTS);
    expect(run.samples.map((s) => s.state)).toEqual(STATE_EXPECTED);
  });

  it('counts the up, down and flat bars', () => {
    const run = runLineNvi(NVI_DATA, OPTS);
    expect(run.upCount).toBe(2);
    expect(run.downCount).toBe(3);
    expect(run.flatCount).toBe(5);
  });

  it('keeps the state counts consistent with the samples', () => {
    const run = runLineNvi(NVI_DATA, OPTS);
    expect(run.upCount).toBe(
      run.samples.filter((s) => s.state === 'up').length,
    );
    expect(run.downCount).toBe(
      run.samples.filter((s) => s.state === 'down').length,
    );
  });

  it('reports the final nvi reading', () => {
    expect(runLineNvi(NVI_DATA, OPTS).nviFinal).toBe(250);
  });

  it('carries the volume, nvi and state fields on each sample', () => {
    const run = runLineNvi(NVI_DATA, OPTS);
    const s = run.samples[1]!;
    expect(s.volume).toBe(30);
    expect(s.nvi).toBe(2000);
    expect(s.state).toBe('up');
  });

  it('is not ok for a single-point series', () => {
    expect(runLineNvi([{ x: 0, value: 1, volume: 5 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineNvi([], OPTS).ok).toBe(false);
    expect(runLineNvi(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      NVI_DATA[6]!,
      NVI_DATA[0]!,
      NVI_DATA[9]!,
      NVI_DATA[3]!,
    ];
    const run = runLineNvi(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 6, 9]);
  });

  it('defaults to the base 1000 configuration', () => {
    expect(runLineNvi(NVI_DATA).base).toBe(DEFAULT_CHART_LINE_NVI_BASE);
  });
});

describe('computeLineNviLayout', () => {
  const layoutOptions = {
    data: NVI_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineNviLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the nvi panel', () => {
    const layout = computeLineNviLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.nviPanel.y);
    expect(layout.nviPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineNviLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty nvi path', () => {
    expect(computeLineNviLayout(layoutOptions).nviPath.length).toBeGreaterThan(
      0,
    );
  });

  it('emits one price dot per point', () => {
    expect(computeLineNviLayout(layoutOptions).priceDots).toHaveLength(
      NVI_DATA.length,
    );
  });

  it('emits one nvi marker per point', () => {
    expect(computeLineNviLayout(layoutOptions).nviMarkers).toHaveLength(
      NVI_DATA.length,
    );
  });

  it('places the base line inside the nvi panel', () => {
    const layout = computeLineNviLayout(layoutOptions);
    expect(layout.baseY).toBeGreaterThanOrEqual(layout.nviPanel.y);
    expect(layout.baseY).toBeLessThanOrEqual(
      layout.nviPanel.y + layout.nviPanel.height,
    );
  });

  it('carries the run statistics', () => {
    const layout = computeLineNviLayout(layoutOptions);
    expect(layout.nviFinal).toBe(250);
    expect(layout.upCount).toBe(2);
    expect(layout.downCount).toBe(3);
    expect(layout.totalPoints).toBe(10);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineNviLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineNviLayout({
        ...layoutOptions,
        data: [{ x: 0, value: 1, volume: 5 }],
      }).ok,
    ).toBe(false);
  });
});

describe('describeLineNviChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineNviChart(NVI_DATA, OPTS);
    expect(text).toContain('Negative Volume Index');
    expect(text).toContain('cumulative');
    expect(text).toContain('lower-volume');
  });

  it('reports the state counts', () => {
    const text = describeLineNviChart(NVI_DATA, OPTS);
    expect(text).toContain('rose on 2');
    expect(text).toContain('fell on 3');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineNviChart([])).toBe('No data');
  });
});

describe('<ChartLineNvi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-nvi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Negative Volume Index');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-nvi"]');
    expect(root?.getAttribute('data-base')).toBe('1000');
    expect(root?.getAttribute('data-up-count')).toBe('2');
    expect(root?.getAttribute('data-down-count')).toBe('3');
    expect(root?.getAttribute('data-flat-count')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('10');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-nvi-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-nvi-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    const labels = Array.from(
      container.querySelectorAll('[data-section="chart-line-nvi-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('NVI');
  });

  it('renders the nvi line', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-nvi-nvi-line"]'),
    ).not.toBeNull();
  });

  it('renders one nvi marker per point', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-nvi-marker"]'),
    ).toHaveLength(NVI_DATA.length);
  });

  it('renders the base line', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-nvi-base-line"]'),
    ).not.toBeNull();
  });

  it('exposes the state on each nvi marker', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-nvi-marker"][data-point-index="1"]',
    );
    expect(marker?.getAttribute('data-state')).toBe('up');
  });

  it('renders the two-item legend', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-nvi-legend-item"]'),
    ).toHaveLength(2);
  });

  it('renders the config badge with the base', () => {
    const { container } = render(<ChartLineNvi data={NVI_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-nvi-badge-config"]',
    );
    expect(badge?.textContent).toBe('1000');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineNvi data={NVI_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-nvi-price-path"]'),
    ).toBeNull();
  });

  it('hides the nvi line and markers when showNvi is false', () => {
    const { container } = render(
      <ChartLineNvi data={NVI_DATA} {...OPTS} showNvi={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-nvi-nvi-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-nvi-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the nvi via the hidden set', () => {
    const { container } = render(
      <ChartLineNvi data={NVI_DATA} {...OPTS} hiddenSeries={['nvi']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-nvi-nvi-line"]'),
    ).toBeNull();
  });

  it('hides the base line when showBaseLine is false', () => {
    const { container } = render(
      <ChartLineNvi data={NVI_DATA} {...OPTS} showBaseLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-nvi-base-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineNvi
        data={NVI_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-nvi-legend-item"][data-series-id="nvi"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'nvi', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineNvi data={NVI_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-nvi-dot"]'),
    ).toHaveLength(NVI_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineNvi data={[{ x: 0, value: 1, volume: 5 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-nvi"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineNvi data={NVI_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-nvi-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineNvi ref={ref} data={NVI_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-nvi');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineNvi.displayName).toBe('ChartLineNvi');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineNvi data={NVI_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-nvi"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
