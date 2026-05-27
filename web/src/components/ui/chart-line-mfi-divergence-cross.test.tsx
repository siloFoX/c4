import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineMfiDivergenceCross,
  DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WINDOW,
  applyLineMfiDivergenceCrossMfi,
  classifyLineMfiDivergenceCrossRegime,
  computeLineMfiDivergenceCross,
  computeLineMfiDivergenceCrossLayout,
  describeLineMfiDivergenceCrossChart,
  detectLineMfiDivergenceCrossCrosses,
  getLineMfiDivergenceCrossFinitePoints,
  normalizeLineMfiDivergenceCrossLength,
  normalizeLineMfiDivergenceCrossWindow,
  runLineMfiDivergenceCross,
  type ChartLineMfiDivergenceCrossPoint,
  type ChartLineMfiDivergenceCrossRegime,
} from './chart-line-mfi-divergence-cross';

const mkConst = (
  n: number,
  K: number,
  V = 1000,
): ChartLineMfiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
    volume: V,
  }));

const mkLinear = (
  n: number,
  fn: (i: number) => number,
  V = 1000,
): ChartLineMfiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => {
    const v = fn(i);
    return { x: i, high: v, low: v, close: v, volume: V };
  });

describe('getLineMfiDivergenceCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, high: 10, low: 10, close: 10, volume: 1000 },
      { x: 1, high: NaN, low: 10, close: 10, volume: 1000 },
      { x: 2, high: 10, low: 10, close: 10, volume: 1000 },
    ];
    expect(getLineMfiDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 10, low: 10, close: 10, volume: 1000 },
      { x: 2, high: 10, low: 10, close: 10, volume: 1000 },
    ]);
  });

  it('returns [] for null / undefined', () => {
    expect(getLineMfiDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineMfiDivergenceCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineMfiDivergenceCrossLength', () => {
  it('keeps integers >= 1 / falls back on invalid', () => {
    expect(normalizeLineMfiDivergenceCrossLength(14, 14)).toBe(14);
    expect(normalizeLineMfiDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineMfiDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineMfiDivergenceCrossWindow', () => {
  it('keeps integers >= 1 / falls back on invalid', () => {
    expect(normalizeLineMfiDivergenceCrossWindow(5, 5)).toBe(5);
    expect(normalizeLineMfiDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineMfiDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineMfiDivergenceCrossMfi', () => {
  it('CONST H=L=C=K, V=any -> mfi = 50 (degenerate)', () => {
    const data = mkConst(30, 42, 1000);
    const out = applyLineMfiDivergenceCrossMfi(data, 14);
    for (let i = 14; i < 30; i += 1) expect(out[i]).toBe(50);
  });

  it('LINEAR UP -> mfi = 100 (only positive flow)', () => {
    const data = mkLinear(30, (i) => i, 1000);
    const out = applyLineMfiDivergenceCrossMfi(data, 14);
    for (let i = 14; i < 30; i += 1) expect(out[i]).toBe(100);
  });

  it('LINEAR DOWN -> mfi = 0 (only negative flow)', () => {
    const data = mkLinear(30, (i) => -i, 1000);
    const out = applyLineMfiDivergenceCrossMfi(data, 14);
    for (let i = 14; i < 30; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });
});

describe('computeLineMfiDivergenceCross - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST H=L=C=K=%d -> mfi = 50',
    (K) => {
      const data = mkConst(50, K, 1000);
      const { mfi } = computeLineMfiDivergenceCross(data);
      for (let i = 14; i < 50; i += 1) expect(mfi[i]).toBe(50);
    },
  );

  it('verified across V=1, 100, 1000, 1234', () => {
    for (const V of [1, 100, 1000, 1234]) {
      const data = mkConst(50, 42, V);
      const { mfi } = computeLineMfiDivergenceCross(data);
      for (let i = 14; i < 50; i += 1) expect(mfi[i]).toBe(50);
    }
  });
});

describe('computeLineMfiDivergenceCross - LINEAR ramps', () => {
  it('LINEAR UP -> mfi = 100 (saturated)', () => {
    const data = mkLinear(50, (i) => i, 1000);
    const { mfi } = computeLineMfiDivergenceCross(data);
    for (let i = 14; i < 50; i += 1) expect(mfi[i]).toBe(100);
  });

  it('LINEAR DOWN -> mfi = 0 (saturated)', () => {
    const data = mkLinear(50, (i) => -i, 1000);
    const { mfi } = computeLineMfiDivergenceCross(data);
    for (let i = 14; i < 50; i += 1) expect(mfi[i]).toBe(0);
  });
});

describe('classifyLineMfiDivergenceCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineMfiDivergenceCrossRegime(null, true)).toBe('none');
    expect(classifyLineMfiDivergenceCrossRegime(true, null)).toBe('none');
  });

  it('priceUp + mfiUp -> aligned-bullish', () => {
    expect(classifyLineMfiDivergenceCrossRegime(true, true)).toBe(
      'aligned-bullish',
    );
  });

  it('!priceUp + !mfiUp -> aligned-bearish', () => {
    expect(classifyLineMfiDivergenceCrossRegime(false, false)).toBe(
      'aligned-bearish',
    );
  });

  it('!priceUp + mfiUp -> divergent-bullish', () => {
    expect(classifyLineMfiDivergenceCrossRegime(false, true)).toBe(
      'divergent-bullish',
    );
  });

  it('priceUp + !mfiUp -> divergent-bearish', () => {
    expect(classifyLineMfiDivergenceCrossRegime(true, false)).toBe(
      'divergent-bearish',
    );
  });
});

describe('detectLineMfiDivergenceCrossCrosses', () => {
  it('fires bullish on aligned -> div-bull', () => {
    const series = mkConst(2, 10);
    const states: ChartLineMfiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    expect(detectLineMfiDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('fires bearish on aligned -> div-bear', () => {
    const series = mkConst(2, 10);
    const states: ChartLineMfiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    expect(detectLineMfiDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('no cross on persistence', () => {
    const series = mkConst(3, 10);
    const states: ChartLineMfiDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(detectLineMfiDivergenceCrossCrosses(series, states)).toHaveLength(
      0,
    );
  });

  it('skips when prev/cur is none', () => {
    const series = mkConst(2, 10);
    expect(
      detectLineMfiDivergenceCrossCrosses(series, [
        'none',
        'divergent-bullish',
      ]),
    ).toEqual([]);
    expect(
      detectLineMfiDivergenceCrossCrosses(series, [
        'divergent-bullish',
        'none',
      ]),
    ).toEqual([]);
  });

  it('emits two on full sweep', () => {
    const series = mkConst(3, 10);
    const states: ChartLineMfiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
    ];
    const out = detectLineMfiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });
});

describe('runLineMfiDivergenceCross', () => {
  it('CONST K -> aligned-bearish, 0 crosses (50 bars)', () => {
    const data = mkConst(50, 50);
    const run = runLineMfiDivergenceCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.alignedBearishCount).toBe(31);
    expect(run.length).toBe(14);
    expect(run.divergenceWindow).toBe(5);
  });

  it('LINEAR UP 50 -> divergent-bearish (MFI saturated at 100), 0 crosses', () => {
    const data = mkLinear(50, (i) => i);
    const run = runLineMfiDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.divergentBearishCount).toBe(31);
    expect(run.alignedBearishCount).toBe(0);
  });

  it('LINEAR DOWN 50 -> aligned-bearish (MFI saturated at 0), 0 crosses', () => {
    const data = mkLinear(50, (i) => -i);
    const run = runLineMfiDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBe(31);
  });

  it('respects custom params', () => {
    const data = mkConst(50, 50);
    expect(
      runLineMfiDivergenceCross(data, { divergenceWindow: 10 })
        .divergenceWindow,
    ).toBe(10);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineMfiDivergenceCross([]).ok).toBe(false);
    expect(runLineMfiDivergenceCross(mkConst(5, 50)).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineMfiDivergenceCrossPoint[] = [
      { x: 3, high: 30, low: 30, close: 30, volume: 1000 },
      { x: 1, high: 10, low: 10, close: 10, volume: 1000 },
      { x: 2, high: 20, low: 20, close: 20, volume: 1000 },
    ];
    const run = runLineMfiDivergenceCross(data, {
      length: 1,
      divergenceWindow: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry full fields', () => {
    const data = mkConst(50, 50);
    const run = runLineMfiDivergenceCross(data);
    for (let i = 19; i < 50; i += 1) {
      expect(run.samples[i]!.mfi).toBe(50);
      expect(run.samples[i]!.priceUp).toBe(false);
      expect(run.samples[i]!.mfiUp).toBe(false);
      expect(run.samples[i]!.regime).toBe('aligned-bearish');
    }
  });
});

describe('computeLineMfiDivergenceCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mkConst(50, 50);
    const layout = computeLineMfiDivergenceCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PANEL_GAP,
    );
  });

  it('osc panel fixed 0..100', () => {
    const data = mkConst(50, 50);
    const layout = computeLineMfiDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('mid line sits inside osc panel', () => {
    const data = mkConst(50, 50);
    const layout = computeLineMfiDivergenceCrossLayout({ data });
    expect(layout.midY).toBeGreaterThan(layout.oscTop);
    expect(layout.midY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineMfiDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('path uses M then L commands', () => {
    const data = mkLinear(50, (i) => i);
    const layout = computeLineMfiDivergenceCrossLayout({ data });
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('mfi path single M when no gaps', () => {
    const data = mkLinear(50, (i) => i);
    const layout = computeLineMfiDivergenceCrossLayout({ data });
    expect((layout.mfiPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value close', () => {
    const data = mkConst(50, 7);
    const layout = computeLineMfiDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineMfiDivergenceCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineMfiDivergenceCrossChart([])).toBe('No data');
  });

  it('describes parameters + volume-weighted framing', () => {
    const data = mkConst(50, 50);
    const desc = describeLineMfiDivergenceCrossChart(data);
    expect(desc).toContain('MFI Divergence Cross chart');
    expect(desc).toContain('length 14');
    expect(desc).toContain('divergenceWindow 5');
    expect(desc).toContain('volume-weighted');
    expect(desc).toContain('volume weighted reversal warning');
  });
});

describe('ChartLineMfiDivergenceCross rendering', () => {
  it('renders region + role=img', () => {
    const data = mkConst(50, 10);
    const { container, getByRole } = render(
      <ChartLineMfiDivergenceCross data={data} />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe(
      'MFI Divergence Cross chart',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders config badge', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineMfiDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-mfi-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('window 5');
  });

  it('renders legend toggles for price + mfi', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineMfiDivergenceCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
  });

  it('toggles mfi via legend click', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineMfiDivergenceCross data={data} />,
    );
    const btn = container.querySelector('[data-series-id="mfi"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineMfiDivergenceCross data={data} hiddenSeries={['mfi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-mfi-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mkConst(50, 10);
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineMfiDivergenceCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="mfi"]')!);
    expect(events).toEqual([{ seriesId: 'mfi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineMfiDivergenceCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="mfi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(<ChartLineMfiDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mkConst(50, 10);
    const { container, rerender } = render(
      <ChartLineMfiDivergenceCross data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineMfiDivergenceCross data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineMfiDivergenceCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-mfi-divergence-cross-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('mid line hide flag', () => {
    const data = mkConst(50, 10);
    const { container, rerender } = render(
      <ChartLineMfiDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-mid-line"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineMfiDivergenceCross data={data} showMid={false} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-mid"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineMfiDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineMfiDivergenceCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-divergence-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineMfiDivergenceCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-mfi-divergence-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-divergence-window')).toBe('5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-aligned-bearish-count')).toBe('31');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mkConst(50, 10);
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMfiDivergenceCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-mfi-divergence-cross',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mkConst(50, 10);
    const a = computeLineMfiDivergenceCrossLayout({ data });
    const b = computeLineMfiDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.mfiPath).toBe(b.mfiPath);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mkLinear(50, (i) => -i);
    const a = computeLineMfiDivergenceCrossLayout({ data });
    const b = computeLineMfiDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.mfiPath).toBe(b.mfiPath);
    expect(a.run.mfiValues).toEqual(b.run.mfiValues);
  });
});
