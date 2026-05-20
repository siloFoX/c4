import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDecycler,
  getLineDecyclerFinitePoints,
  normalizeLineDecyclerPeriod,
  computeLineDecyclerAlpha,
  computeLineDecyclerHighpass,
  computeLineDecycler,
  runLineDecycler,
  computeLineDecyclerLayout,
  describeLineDecyclerChart,
  DEFAULT_CHART_LINE_DECYCLER_PERIOD,
  type ChartLineDecyclerPoint,
} from './chart-line-decycler';

afterEach(() => cleanup());

const FLAT_CLOSES = [50, 50, 50, 50, 50, 50];
const DECYCLER_CLOSES = [
  100, 110, 120, 130, 140, 150, 150, 140, 130, 120, 110, 100,
];
const DECYCLER_DATA: ChartLineDecyclerPoint[] = DECYCLER_CLOSES.map(
  (value, x) => ({ x, value }),
);
const RAMP_CLOSES = Array.from({ length: 40 }, (_, i) => i * 5);
const OPTS = { period: 8 };

describe('getLineDecyclerFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineDecyclerPoint[];
    expect(getLineDecyclerFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineDecyclerFinitePoints(null)).toEqual([]);
    expect(getLineDecyclerFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineDecyclerPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineDecyclerPeriod(30.8, 30)).toBe(30);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLineDecyclerPeriod(1, 30)).toBe(30);
    expect(normalizeLineDecyclerPeriod(-4, 30)).toBe(30);
    expect(normalizeLineDecyclerPeriod(Number.NaN, 30)).toBe(30);
  });
});

describe('computeLineDecyclerAlpha', () => {
  it('computes the one-pole highpass coefficient', () => {
    expect(computeLineDecyclerAlpha(8)).toBeCloseTo(0.5857864, 6);
  });

  it('stays inside the stable range for a normal period', () => {
    const a = computeLineDecyclerAlpha(30);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
  });

  it('clamps a short period to 1', () => {
    expect(computeLineDecyclerAlpha(2)).toBe(1);
  });

  it('returns 1 for the degenerate period 4', () => {
    expect(computeLineDecyclerAlpha(4)).toBe(1);
  });
});

describe('computeLineDecyclerHighpass', () => {
  it('seeds the first value at zero', () => {
    expect(computeLineDecyclerHighpass(DECYCLER_CLOSES, 8)[0]).toBe(0);
  });

  it('is all zero for a flat series', () => {
    expect(computeLineDecyclerHighpass(FLAT_CLOSES, 8)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  it('follows the one-pole recursion', () => {
    const hp = computeLineDecyclerHighpass(DECYCLER_CLOSES, 8);
    const alpha = computeLineDecyclerAlpha(8);
    const g = 1 - alpha / 2;
    const d = 1 - alpha;
    for (let i = 1; i < DECYCLER_CLOSES.length; i += 1) {
      const expected =
        g * (DECYCLER_CLOSES[i]! - DECYCLER_CLOSES[i - 1]!) +
        d * hp[i - 1]!;
      expect(hp[i]!).toBeCloseTo(expected, 6);
    }
  });

  it('converges to the steady state for a ramp', () => {
    const hp = computeLineDecyclerHighpass(RAMP_CLOSES, 8);
    expect(hp[hp.length - 1]!).toBeCloseTo(6.0355339, 4);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineDecyclerHighpass(null, 8)).toEqual([]);
  });
});

describe('computeLineDecycler', () => {
  it('passes the first bar through unchanged', () => {
    expect(computeLineDecycler(DECYCLER_CLOSES, 8)[0]).toBe(100);
  });

  it('equals the price for a flat series', () => {
    expect(computeLineDecycler(FLAT_CLOSES, 8)).toEqual(FLAT_CLOSES);
  });

  it('is the price minus the highpass', () => {
    const hp = computeLineDecyclerHighpass(DECYCLER_CLOSES, 8);
    const expected = DECYCLER_CLOSES.map((v, i) => v - hp[i]!);
    expect(computeLineDecycler(DECYCLER_CLOSES, 8)).toEqual(expected);
  });

  it('matches the hand-computed second bar', () => {
    expect(computeLineDecycler(DECYCLER_CLOSES, 8)[1]!).toBeCloseTo(
      102.928932,
      4,
    );
  });

  it('is finite for every bar', () => {
    const dec = computeLineDecycler(DECYCLER_CLOSES, 8);
    expect(dec.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineDecycler(null, 8)).toEqual([]);
  });
});

describe('runLineDecycler', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineDecycler(DECYCLER_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period', () => {
    expect(runLineDecycler(DECYCLER_DATA, OPTS).period).toBe(8);
  });

  it('carries the highpass coefficient', () => {
    expect(runLineDecycler(DECYCLER_DATA, OPTS).alpha).toBeCloseTo(
      0.5857864,
      6,
    );
  });

  it('exposes the highpass and decycler series', () => {
    const run = runLineDecycler(DECYCLER_DATA, OPTS);
    expect(run.highpass).toHaveLength(DECYCLER_DATA.length);
    expect(run.decycler).toHaveLength(DECYCLER_DATA.length);
  });

  it('emits one sample per point', () => {
    expect(runLineDecycler(DECYCLER_DATA, OPTS).samples).toHaveLength(
      DECYCLER_DATA.length,
    );
  });

  it('classifies the first bar flat and the rising leg rising', () => {
    const run = runLineDecycler(DECYCLER_DATA, OPTS);
    expect(run.samples[0]!.trend).toBe('flat');
    expect(run.samples[1]!.trend).toBe('rising');
    expect(run.samples[5]!.trend).toBe('rising');
  });

  it('counts the rising, falling and flat bars', () => {
    const run = runLineDecycler(DECYCLER_DATA, OPTS);
    expect(
      run.risingCount + run.fallingCount + run.flatCount,
    ).toBe(DECYCLER_DATA.length);
    expect(run.risingCount).toBeGreaterThan(0);
    expect(run.fallingCount).toBeGreaterThan(0);
  });

  it('keeps the trend counts consistent with the samples', () => {
    const run = runLineDecycler(DECYCLER_DATA, OPTS);
    expect(run.risingCount).toBe(
      run.samples.filter((s) => s.trend === 'rising').length,
    );
    expect(run.fallingCount).toBe(
      run.samples.filter((s) => s.trend === 'falling').length,
    );
  });

  it('reports the final decycler reading', () => {
    const run = runLineDecycler(DECYCLER_DATA, OPTS);
    expect(run.decyclerFinal).toBe(run.decycler[run.decycler.length - 1]);
  });

  it('carries the highpass, decycler and trend fields on each sample', () => {
    const run = runLineDecycler(DECYCLER_DATA, OPTS);
    const s = run.samples[3]!;
    expect(Number.isFinite(s.highpass)).toBe(true);
    expect(Number.isFinite(s.decycler)).toBe(true);
    expect(['rising', 'falling', 'flat']).toContain(s.trend);
  });

  it('is not ok for a single-point series', () => {
    expect(runLineDecycler([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineDecycler([], OPTS).ok).toBe(false);
    expect(runLineDecycler(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      DECYCLER_DATA[7]!,
      DECYCLER_DATA[0]!,
      DECYCLER_DATA[11]!,
      DECYCLER_DATA[3]!,
    ];
    const run = runLineDecycler(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 7, 11]);
  });

  it('defaults to the period 30 configuration', () => {
    expect(runLineDecycler(DECYCLER_DATA).period).toBe(
      DEFAULT_CHART_LINE_DECYCLER_PERIOD,
    );
  });
});

describe('computeLineDecyclerLayout', () => {
  const layoutOptions = {
    data: DECYCLER_DATA,
    ...OPTS,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineDecyclerLayout(layoutOptions).ok).toBe(true);
  });

  it('uses a single full-width panel', () => {
    const layout = computeLineDecyclerLayout(layoutOptions);
    expect(layout.panel.x).toBe(40);
    expect(layout.panel.width).toBe(560 - 80);
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineDecyclerLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty decycler path', () => {
    expect(
      computeLineDecyclerLayout(layoutOptions).decyclerPath.length,
    ).toBeGreaterThan(0);
  });

  it('emits one price dot per point', () => {
    expect(computeLineDecyclerLayout(layoutOptions).priceDots).toHaveLength(
      DECYCLER_DATA.length,
    );
  });

  it('emits one decycler marker per point', () => {
    expect(
      computeLineDecyclerLayout(layoutOptions).decyclerMarkers,
    ).toHaveLength(DECYCLER_DATA.length);
  });

  it('carries the run statistics', () => {
    const layout = computeLineDecyclerLayout(layoutOptions);
    expect(layout.period).toBe(8);
    expect(layout.totalPoints).toBe(12);
    expect(Number.isFinite(layout.decyclerFinal)).toBe(true);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(
      computeLineDecyclerLayout({ ...layoutOptions, width: 60 }).ok,
    ).toBe(false);
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineDecyclerLayout({
        ...layoutOptions,
        data: [{ x: 0, value: 1 }],
      }).ok,
    ).toBe(false);
  });
});

describe('describeLineDecyclerChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineDecyclerChart(DECYCLER_DATA, OPTS);
    expect(text).toContain('Ehlers Decycler');
    expect(text).toContain('highpass');
    expect(text).toContain('cycle');
    expect(text).toContain('trend');
  });

  it('reports the period', () => {
    expect(describeLineDecyclerChart(DECYCLER_DATA, OPTS)).toContain(
      'period 8',
    );
  });

  it('returns No data for an empty input', () => {
    expect(describeLineDecyclerChart([])).toBe('No data');
  });
});

describe('<ChartLineDecycler />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-decycler-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ehlers Decycler');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-decycler"]',
    );
    expect(root?.getAttribute('data-period')).toBe('8');
    expect(root?.getAttribute('data-total-points')).toBe('12');
    expect(root?.getAttribute('data-rising-count')).toBeTruthy();
  });

  it('renders the svg and the price line', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-decycler-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-decycler-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the decycler line', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-decycler-decycler-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one decycler marker per point', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-decycler-marker"]'),
    ).toHaveLength(DECYCLER_DATA.length);
  });

  it('exposes the trend on each decycler marker', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-decycler-marker"][data-point-index="1"]',
    );
    expect(marker?.getAttribute('data-trend')).toBe('rising');
  });

  it('renders the grid lines', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-decycler-grid-line"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders the axes', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-decycler-axis"]'),
    ).toHaveLength(2);
  });

  it('renders the two-item legend', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-decycler-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-decycler-badge-config"]',
    );
    expect(badge?.textContent).toBe('8');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineDecycler
        data={DECYCLER_DATA}
        {...OPTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-decycler-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the decycler line and markers when showDecycler is false', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} showDecycler={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-decycler-decycler-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-decycler-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the decycler via the hidden set', () => {
    const { container } = render(
      <ChartLineDecycler
        data={DECYCLER_DATA}
        {...OPTS}
        hiddenSeries={['decycler']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-decycler-decycler-line"]',
      ),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineDecycler
        data={DECYCLER_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-decycler-legend-item"][data-series-id="decycler"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'decycler', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-decycler-dot"]'),
    ).toHaveLength(DECYCLER_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineDecycler data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-decycler"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineDecycler
        data={DECYCLER_DATA}
        {...OPTS}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-decycler-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDecycler ref={ref} data={DECYCLER_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-decycler',
    );
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineDecycler.displayName).toBe('ChartLineDecycler');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineDecycler data={DECYCLER_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-decycler"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
