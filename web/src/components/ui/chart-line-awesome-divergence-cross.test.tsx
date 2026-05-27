import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineAwesomeDivergenceCross,
  DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_WINDOW,
  applyLineAwesomeDivergenceCrossSma,
  classifyLineAwesomeDivergenceCrossRegime,
  computeLineAwesomeDivergenceCross,
  computeLineAwesomeDivergenceCrossLayout,
  describeLineAwesomeDivergenceCrossChart,
  detectLineAwesomeDivergenceCrossCrosses,
  getLineAwesomeDivergenceCrossFinitePoints,
  normalizeLineAwesomeDivergenceCrossLength,
  normalizeLineAwesomeDivergenceCrossWindow,
  runLineAwesomeDivergenceCross,
  type ChartLineAwesomeDivergenceCrossPoint,
  type ChartLineAwesomeDivergenceCrossRegime,
} from './chart-line-awesome-divergence-cross';

const mk = (closes: number[]): ChartLineAwesomeDivergenceCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineAwesomeDivergenceCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
    ];
    expect(getLineAwesomeDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
    ]);
  });

  it('returns [] for null / undefined', () => {
    expect(getLineAwesomeDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineAwesomeDivergenceCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineAwesomeDivergenceCrossLength', () => {
  it('keeps integers >= 1 / falls back on invalid', () => {
    expect(normalizeLineAwesomeDivergenceCrossLength(5, 5)).toBe(5);
    expect(normalizeLineAwesomeDivergenceCrossLength(0, 5)).toBe(5);
    expect(normalizeLineAwesomeDivergenceCrossLength(NaN, 5)).toBe(5);
  });
});

describe('normalizeLineAwesomeDivergenceCrossWindow', () => {
  it('keeps integers >= 1 / falls back on invalid', () => {
    expect(normalizeLineAwesomeDivergenceCrossWindow(5, 5)).toBe(5);
    expect(normalizeLineAwesomeDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineAwesomeDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineAwesomeDivergenceCrossSma', () => {
  it('CONST -> SMA = value', () => {
    const out = applyLineAwesomeDivergenceCrossSma(
      new Array(40).fill(42),
      34,
    );
    for (let i = 33; i < 40; i += 1) expect(out[i]).toBe(42);
  });
});

describe('computeLineAwesomeDivergenceCross - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> ao = 0',
    (K) => {
      const data = mk(new Array(60).fill(K));
      const { ao } = computeLineAwesomeDivergenceCross(data);
      for (let i = 33; i < 60; i += 1) {
        expect(ao[i]).toBe(0);
        expect(Object.is(ao[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineAwesomeDivergenceCross - LINEAR ramps', () => {
  it('LINEAR UP -> ao = 14.5', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const { ao } = computeLineAwesomeDivergenceCross(data);
    for (let i = 33; i < 60; i += 1) expect(ao[i]).toBe(14.5);
  });

  it('LINEAR DOWN -> ao = -14.5', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const { ao } = computeLineAwesomeDivergenceCross(data);
    for (let i = 33; i < 60; i += 1) expect(ao[i]).toBe(-14.5);
  });
});

describe('classifyLineAwesomeDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAwesomeDivergenceCrossRegime(null, true)).toBe(
      'none',
    );
    expect(classifyLineAwesomeDivergenceCrossRegime(true, null)).toBe(
      'none',
    );
  });

  it('priceUp + aoUp -> aligned-bullish', () => {
    expect(classifyLineAwesomeDivergenceCrossRegime(true, true)).toBe(
      'aligned-bullish',
    );
  });

  it('!priceUp + !aoUp -> aligned-bearish', () => {
    expect(classifyLineAwesomeDivergenceCrossRegime(false, false)).toBe(
      'aligned-bearish',
    );
  });

  it('!priceUp + aoUp -> divergent-bullish', () => {
    expect(classifyLineAwesomeDivergenceCrossRegime(false, true)).toBe(
      'divergent-bullish',
    );
  });

  it('priceUp + !aoUp -> divergent-bearish', () => {
    expect(classifyLineAwesomeDivergenceCrossRegime(true, false)).toBe(
      'divergent-bearish',
    );
  });
});

describe('detectLineAwesomeDivergenceCrossCrosses', () => {
  it('fires bullish on aligned -> div-bull', () => {
    const series = mk([1, 2]);
    const states: ChartLineAwesomeDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    expect(detectLineAwesomeDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('fires bearish on aligned -> div-bear', () => {
    const series = mk([1, 2]);
    const states: ChartLineAwesomeDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    expect(detectLineAwesomeDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('no cross on persistence', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineAwesomeDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(
      detectLineAwesomeDivergenceCrossCrosses(series, states),
    ).toHaveLength(0);
  });

  it('skips when prev/cur is none', () => {
    const series = mk([1, 2]);
    expect(
      detectLineAwesomeDivergenceCrossCrosses(series, [
        'none',
        'divergent-bullish',
      ]),
    ).toEqual([]);
    expect(
      detectLineAwesomeDivergenceCrossCrosses(series, [
        'divergent-bullish',
        'none',
      ]),
    ).toEqual([]);
  });

  it('emits two on full sweep', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineAwesomeDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
    ];
    const out = detectLineAwesomeDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });
});

describe('runLineAwesomeDivergenceCross', () => {
  it('CONST K -> aligned-bearish, 0 crosses (60 bars)', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineAwesomeDivergenceCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(38);
    expect(run.alignedBearishCount).toBe(22);
    expect(run.fastLength).toBe(5);
    expect(run.slowLength).toBe(34);
    expect(run.divergenceWindow).toBe(5);
  });

  it('LINEAR UP 60 -> divergent-bearish (AO plateaus at 14.5), 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineAwesomeDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.divergentBearishCount).toBe(22);
    expect(run.alignedBearishCount).toBe(0);
  });

  it('LINEAR DOWN 60 -> aligned-bearish (AO=-14.5), 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineAwesomeDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBe(22);
  });

  it('respects custom params', () => {
    const data = mk(new Array(60).fill(50));
    expect(
      runLineAwesomeDivergenceCross(data, { divergenceWindow: 10 })
        .divergenceWindow,
    ).toBe(10);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineAwesomeDivergenceCross([]).ok).toBe(false);
    expect(runLineAwesomeDivergenceCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineAwesomeDivergenceCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineAwesomeDivergenceCross(data, {
      fastLength: 1,
      slowLength: 1,
      divergenceWindow: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry full fields', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineAwesomeDivergenceCross(data);
    for (let i = 38; i < 60; i += 1) {
      expect(run.samples[i]!.ao).toBe(0);
      expect(run.samples[i]!.priceUp).toBe(false);
      expect(run.samples[i]!.aoUp).toBe(false);
      expect(run.samples[i]!.regime).toBe('aligned-bearish');
    }
  });
});

describe('computeLineAwesomeDivergenceCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineAwesomeDivergenceCrossLayout({ data });
    expect(layout.width).toBe(
      DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_WIDTH,
    );
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_PANEL_GAP,
    );
  });

  it('CONST K -> ao=0 -> [-1, 1]', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineAwesomeDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('LINEAR UP -> symmetric around 0', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineAwesomeDivergenceCrossLayout({ data });
    // ao=14.5, span=14.5, range=+/-15.95
    expect(layout.oscMin).toBeCloseTo(-15.95, 1);
    expect(layout.oscMax).toBeCloseTo(15.95, 1);
  });

  it('zero line sits inside osc panel', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineAwesomeDivergenceCrossLayout({ data });
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineAwesomeDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('path uses M then L commands', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineAwesomeDivergenceCrossLayout({ data });
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('ao path single M when no gaps', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineAwesomeDivergenceCrossLayout({ data });
    expect((layout.aoPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value close', () => {
    const data = mk(new Array(60).fill(7));
    const layout = computeLineAwesomeDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineAwesomeDivergenceCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineAwesomeDivergenceCrossChart([])).toBe('No data');
  });

  it('describes parameters + divergence framing', () => {
    const data = mk(new Array(60).fill(50));
    const desc = describeLineAwesomeDivergenceCrossChart(data);
    expect(desc).toContain('AO Divergence Cross chart');
    expect(desc).toContain('fastLength 5');
    expect(desc).toContain('slowLength 34');
    expect(desc).toContain('divergenceWindow 5');
    expect(desc).toContain('momentum reversal warning');
    expect(desc).toContain('price-versus-AO');
  });
});

describe('ChartLineAwesomeDivergenceCross rendering', () => {
  it('renders region + role=img', () => {
    const data = mk(new Array(60).fill(10));
    const { container, getByRole } = render(
      <ChartLineAwesomeDivergenceCross data={data} />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe(
      'AO Divergence Cross chart',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders config badge', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineAwesomeDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-awesome-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('fast 5');
    expect(badge?.textContent).toContain('slow 34');
    expect(badge?.textContent).toContain('window 5');
  });

  it('renders legend toggles for price + ao', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineAwesomeDivergenceCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
  });

  it('toggles ao via legend click', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineAwesomeDivergenceCross data={data} />,
    );
    const btn = container.querySelector('[data-series-id="ao"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineAwesomeDivergenceCross data={data} hiddenSeries={['ao']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-ao-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(60).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineAwesomeDivergenceCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="ao"]')!);
    expect(events).toEqual([{ seriesId: 'ao', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineAwesomeDivergenceCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="ao"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(
      <ChartLineAwesomeDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mk(new Array(60).fill(10));
    const { container, rerender } = render(
      <ChartLineAwesomeDivergenceCross data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(
      <ChartLineAwesomeDivergenceCross data={data} animate={false} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineAwesomeDivergenceCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-awesome-divergence-cross-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('zero line hide flag', () => {
    const data = mk(new Array(60).fill(10));
    const { container, rerender } = render(
      <ChartLineAwesomeDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-zero-line"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineAwesomeDivergenceCross data={data} showZero={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-zero"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineAwesomeDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineAwesomeDivergenceCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-divergence-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineAwesomeDivergenceCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-awesome-divergence-cross"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('5');
    expect(region?.getAttribute('data-slow-length')).toBe('34');
    expect(region?.getAttribute('data-divergence-window')).toBe('5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-aligned-bearish-count')).toBe('22');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_FAST_LENGTH).toBe(5);
    expect(DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_SLOW_LENGTH).toBe(34);
    expect(DEFAULT_CHART_LINE_AWESOME_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(60).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineAwesomeDivergenceCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-awesome-divergence-cross',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mk(new Array(60).fill(10));
    const a = computeLineAwesomeDivergenceCrossLayout({ data });
    const b = computeLineAwesomeDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.aoPath).toBe(b.aoPath);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const a = computeLineAwesomeDivergenceCrossLayout({ data });
    const b = computeLineAwesomeDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.aoPath).toBe(b.aoPath);
    expect(a.run.aoValues).toEqual(b.run.aoValues);
  });
});
