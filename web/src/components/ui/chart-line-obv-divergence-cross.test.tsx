import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineObvDivergenceCross,
  DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WINDOW,
  applyLineObvDivergenceCrossObv,
  classifyLineObvDivergenceCrossRegime,
  computeLineObvDivergenceCross,
  computeLineObvDivergenceCrossLayout,
  describeLineObvDivergenceCrossChart,
  detectLineObvDivergenceCrossCrosses,
  getLineObvDivergenceCrossFinitePoints,
  normalizeLineObvDivergenceCrossWindow,
  runLineObvDivergenceCross,
  type ChartLineObvDivergenceCrossPoint,
  type ChartLineObvDivergenceCrossRegime,
} from './chart-line-obv-divergence-cross';

const mkConst = (
  n: number,
  K: number,
  V = 1000,
): ChartLineObvDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K, volume: V }));

const mkLinear = (
  n: number,
  fn: (i: number) => number,
  V = 1000,
): ChartLineObvDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    close: fn(i),
    volume: V,
  }));

describe('getLineObvDivergenceCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10, volume: 1000 },
      { x: 1, close: NaN, volume: 1000 },
      { x: 2, close: 11, volume: 1000 },
    ];
    expect(getLineObvDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10, volume: 1000 },
      { x: 2, close: 11, volume: 1000 },
    ]);
  });

  it('returns [] for null / undefined', () => {
    expect(getLineObvDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineObvDivergenceCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineObvDivergenceCrossWindow', () => {
  it('keeps integers >= 1 / falls back on invalid', () => {
    expect(normalizeLineObvDivergenceCrossWindow(5, 5)).toBe(5);
    expect(normalizeLineObvDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineObvDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineObvDivergenceCrossObv', () => {
  it('CONST close=K -> obv = 0 constant', () => {
    const data = mkConst(20, 50, 1000);
    const out = applyLineObvDivergenceCrossObv(data);
    for (let i = 0; i < 20; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });

  it('LINEAR UP -> obv = [0, V, 2V, ...]', () => {
    const data = mkLinear(20, (i) => i, 1000);
    const out = applyLineObvDivergenceCrossObv(data);
    expect(out[0]).toBe(0);
    for (let i = 1; i < 20; i += 1) {
      expect(out[i]).toBe(i * 1000);
    }
  });

  it('LINEAR DOWN -> obv = [0, -V, -2V, ...]', () => {
    const data = mkLinear(20, (i) => -i, 1000);
    const out = applyLineObvDivergenceCrossObv(data);
    expect(out[0]).toBe(0);
    for (let i = 1; i < 20; i += 1) {
      expect(out[i]).toBe(-i * 1000);
    }
  });

  it('Empty array -> empty out', () => {
    expect(applyLineObvDivergenceCrossObv([])).toEqual([]);
  });
});

describe('computeLineObvDivergenceCross - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d, V=1000 -> obv = 0',
    (K) => {
      const data = mkConst(50, K, 1000);
      const { obv } = computeLineObvDivergenceCross(data);
      for (let i = 0; i < 50; i += 1) expect(obv[i]).toBe(0);
    },
  );

  it('Verifies across V=1, 100, 1000, 1234', () => {
    for (const V of [1, 100, 1000, 1234]) {
      const data = mkConst(50, 42, V);
      const { obv } = computeLineObvDivergenceCross(data);
      for (let i = 0; i < 50; i += 1) expect(obv[i]).toBe(0);
    }
  });
});

describe('computeLineObvDivergenceCross - LINEAR ramps', () => {
  it('LINEAR UP V=1000 -> obv linear', () => {
    const data = mkLinear(50, (i) => i, 1000);
    const { obv } = computeLineObvDivergenceCross(data);
    for (let i = 0; i < 50; i += 1) expect(obv[i]).toBe(i * 1000);
  });

  it('LINEAR DOWN V=1000 -> obv linear negative', () => {
    const data = mkLinear(50, (i) => -i, 1000);
    const { obv } = computeLineObvDivergenceCross(data);
    expect(obv[0]).toBe(0);
    for (let i = 1; i < 50; i += 1) expect(obv[i]).toBe(-i * 1000);
  });
});

describe('classifyLineObvDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineObvDivergenceCrossRegime(null, true)).toBe('none');
    expect(classifyLineObvDivergenceCrossRegime(true, null)).toBe('none');
  });

  it('priceUp + obvUp -> aligned-bullish', () => {
    expect(classifyLineObvDivergenceCrossRegime(true, true)).toBe(
      'aligned-bullish',
    );
  });

  it('!priceUp + !obvUp -> aligned-bearish', () => {
    expect(classifyLineObvDivergenceCrossRegime(false, false)).toBe(
      'aligned-bearish',
    );
  });

  it('!priceUp + obvUp -> divergent-bullish', () => {
    expect(classifyLineObvDivergenceCrossRegime(false, true)).toBe(
      'divergent-bullish',
    );
  });

  it('priceUp + !obvUp -> divergent-bearish', () => {
    expect(classifyLineObvDivergenceCrossRegime(true, false)).toBe(
      'divergent-bearish',
    );
  });
});

describe('detectLineObvDivergenceCrossCrosses', () => {
  it('fires bullish on aligned -> div-bull', () => {
    const series = mkConst(2, 10);
    const states: ChartLineObvDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    expect(detectLineObvDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('fires bearish on aligned -> div-bear', () => {
    const series = mkConst(2, 10);
    const states: ChartLineObvDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    expect(detectLineObvDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('no cross on persistence', () => {
    const series = mkConst(3, 10);
    const states: ChartLineObvDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(detectLineObvDivergenceCrossCrosses(series, states)).toHaveLength(
      0,
    );
  });

  it('skips when prev/cur is none', () => {
    const series = mkConst(2, 10);
    expect(
      detectLineObvDivergenceCrossCrosses(series, [
        'none',
        'divergent-bullish',
      ]),
    ).toEqual([]);
    expect(
      detectLineObvDivergenceCrossCrosses(series, [
        'divergent-bullish',
        'none',
      ]),
    ).toEqual([]);
  });

  it('emits two on full sweep', () => {
    const series = mkConst(3, 10);
    const states: ChartLineObvDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
    ];
    const out = detectLineObvDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });
});

describe('runLineObvDivergenceCross', () => {
  it('CONST K -> aligned-bearish, 0 crosses (50 bars)', () => {
    const data = mkConst(50, 50);
    const run = runLineObvDivergenceCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(5);
    expect(run.alignedBearishCount).toBe(45);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.divergenceWindow).toBe(5);
  });

  it('LINEAR UP 50 -> aligned-bullish (OBV correctly tracks trend), 0 crosses', () => {
    const data = mkLinear(50, (i) => i);
    const run = runLineObvDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBullishCount).toBe(45);
    expect(run.alignedBearishCount).toBe(0);
  });

  it('LINEAR DOWN 50 -> aligned-bearish, 0 crosses', () => {
    const data = mkLinear(50, (i) => -i);
    const run = runLineObvDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBe(45);
  });

  it('respects custom window', () => {
    const data = mkConst(50, 50);
    expect(
      runLineObvDivergenceCross(data, { divergenceWindow: 10 })
        .divergenceWindow,
    ).toBe(10);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineObvDivergenceCross([]).ok).toBe(false);
    expect(runLineObvDivergenceCross(mkConst(3, 50)).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineObvDivergenceCrossPoint[] = [
      { x: 3, close: 30, volume: 1000 },
      { x: 1, close: 10, volume: 1000 },
      { x: 2, close: 20, volume: 1000 },
    ];
    const run = runLineObvDivergenceCross(data, { divergenceWindow: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry full fields (CONST)', () => {
    const data = mkConst(50, 50);
    const run = runLineObvDivergenceCross(data);
    for (let i = 5; i < 50; i += 1) {
      expect(run.samples[i]!.obv).toBe(0);
      expect(run.samples[i]!.priceUp).toBe(false);
      expect(run.samples[i]!.obvUp).toBe(false);
      expect(run.samples[i]!.regime).toBe('aligned-bearish');
    }
  });

  it('samples carry full fields (LINEAR UP)', () => {
    const data = mkLinear(50, (i) => i);
    const run = runLineObvDivergenceCross(data);
    for (let i = 5; i < 50; i += 1) {
      expect(run.samples[i]!.priceUp).toBe(true);
      expect(run.samples[i]!.obvUp).toBe(true);
      expect(run.samples[i]!.regime).toBe('aligned-bullish');
    }
  });
});

describe('computeLineObvDivergenceCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mkConst(50, 50);
    const layout = computeLineObvDivergenceCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PANEL_GAP,
    );
  });

  it('CONST K -> obv=0 -> [-1, 1]', () => {
    const data = mkConst(50, 50);
    const layout = computeLineObvDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('LINEAR UP -> symmetric range around 0', () => {
    const data = mkLinear(50, (i) => i);
    const layout = computeLineObvDivergenceCrossLayout({ data });
    // max obv at i=49 = 49000. span=49000. range=+/-53900.
    expect(layout.oscMin).toBeCloseTo(-53900, 0);
    expect(layout.oscMax).toBeCloseTo(53900, 0);
  });

  it('zero line sits inside osc panel', () => {
    const data = mkConst(50, 50);
    const layout = computeLineObvDivergenceCrossLayout({ data });
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineObvDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('path uses M then L commands', () => {
    const data = mkLinear(50, (i) => i);
    const layout = computeLineObvDivergenceCrossLayout({ data });
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('obv path single M (no nullable gaps)', () => {
    const data = mkLinear(50, (i) => i);
    const layout = computeLineObvDivergenceCrossLayout({ data });
    expect((layout.obvPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value close', () => {
    const data = mkConst(50, 7);
    const layout = computeLineObvDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineObvDivergenceCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineObvDivergenceCrossChart([])).toBe('No data');
  });

  it('describes parameters + divergence framing', () => {
    const data = mkConst(50, 50);
    const desc = describeLineObvDivergenceCrossChart(data);
    expect(desc).toContain('OBV Divergence Cross chart');
    expect(desc).toContain('divergenceWindow 5');
    expect(desc).toContain('accumulation distribution warning');
    expect(desc).toContain('price-versus-OBV');
  });
});

describe('ChartLineObvDivergenceCross rendering', () => {
  it('renders region + role=img', () => {
    const data = mkConst(50, 10);
    const { container, getByRole } = render(
      <ChartLineObvDivergenceCross data={data} />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe(
      'OBV Divergence Cross chart',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders config badge', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineObvDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-obv-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('window 5');
  });

  it('renders legend toggles for price + obv', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineObvDivergenceCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
  });

  it('toggles obv via legend click', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineObvDivergenceCross data={data} />,
    );
    const btn = container.querySelector('[data-series-id="obv"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineObvDivergenceCross data={data} hiddenSeries={['obv']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-obv-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mkConst(50, 10);
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineObvDivergenceCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="obv"]')!);
    expect(events).toEqual([{ seriesId: 'obv', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineObvDivergenceCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="obv"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(<ChartLineObvDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mkConst(50, 10);
    const { container, rerender } = render(
      <ChartLineObvDivergenceCross data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineObvDivergenceCross data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineObvDivergenceCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-obv-divergence-cross-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('zero line hide flag', () => {
    const data = mkConst(50, 10);
    const { container, rerender } = render(
      <ChartLineObvDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-zero-line"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineObvDivergenceCross data={data} showZero={false} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-zero"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineObvDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineObvDivergenceCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-divergence-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineObvDivergenceCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-obv-divergence-cross"]',
    );
    expect(region?.getAttribute('data-divergence-window')).toBe('5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-aligned-bearish-count')).toBe('45');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mkConst(50, 10);
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineObvDivergenceCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-obv-divergence-cross',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mkConst(50, 10);
    const a = computeLineObvDivergenceCrossLayout({ data });
    const b = computeLineObvDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.obvPath).toBe(b.obvPath);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mkLinear(50, (i) => -i);
    const a = computeLineObvDivergenceCrossLayout({ data });
    const b = computeLineObvDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.obvPath).toBe(b.obvPath);
    expect(a.run.obvValues).toEqual(b.run.obvValues);
  });
});
