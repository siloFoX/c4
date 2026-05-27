import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStochDivergenceCross,
  DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_WINDOW,
  applyLineStochDivergenceCrossStochastic,
  classifyLineStochDivergenceCrossRegime,
  computeLineStochDivergenceCross,
  computeLineStochDivergenceCrossLayout,
  describeLineStochDivergenceCrossChart,
  detectLineStochDivergenceCrossCrosses,
  getLineStochDivergenceCrossFinitePoints,
  normalizeLineStochDivergenceCrossLength,
  normalizeLineStochDivergenceCrossWindow,
  runLineStochDivergenceCross,
  type ChartLineStochDivergenceCrossPoint,
  type ChartLineStochDivergenceCrossRegime,
} from './chart-line-stoch-divergence-cross';

const mk = (closes: number[]): ChartLineStochDivergenceCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineStochDivergenceCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
    ];
    expect(getLineStochDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
    ]);
  });

  it('returns [] for null / undefined', () => {
    expect(getLineStochDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineStochDivergenceCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineStochDivergenceCrossLength', () => {
  it('keeps integers >= 1 / falls back on invalid', () => {
    expect(normalizeLineStochDivergenceCrossLength(14, 14)).toBe(14);
    expect(normalizeLineStochDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineStochDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineStochDivergenceCrossWindow', () => {
  it('keeps integers >= 1 / falls back on invalid', () => {
    expect(normalizeLineStochDivergenceCrossWindow(5, 5)).toBe(5);
    expect(normalizeLineStochDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineStochDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineStochDivergenceCrossStochastic', () => {
  it('CONST close=K -> stoch = 50 (degenerate)', () => {
    const out = applyLineStochDivergenceCrossStochastic(
      new Array(30).fill(42),
      14,
    );
    for (let i = 13; i < 30; i += 1) expect(out[i]).toBe(50);
  });

  it('LINEAR UP -> stoch = 100', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i);
    const out = applyLineStochDivergenceCrossStochastic(closes, 14);
    for (let i = 13; i < 30; i += 1) expect(out[i]).toBe(100);
  });

  it('LINEAR DOWN -> stoch = 0', () => {
    const closes = Array.from({ length: 30 }, (_, i) => -i);
    const out = applyLineStochDivergenceCrossStochastic(closes, 14);
    for (let i = 13; i < 30; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });
});

describe('computeLineStochDivergenceCross - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> stoch = 50',
    (K) => {
      const data = mk(new Array(50).fill(K));
      const { stoch } = computeLineStochDivergenceCross(data);
      for (let i = 13; i < 50; i += 1) expect(stoch[i]).toBe(50);
    },
  );
});

describe('computeLineStochDivergenceCross - LINEAR ramps', () => {
  it('LINEAR UP -> stoch = 100', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const { stoch } = computeLineStochDivergenceCross(data);
    for (let i = 13; i < 50; i += 1) expect(stoch[i]).toBe(100);
  });

  it('LINEAR DOWN -> stoch = 0', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const { stoch } = computeLineStochDivergenceCross(data);
    for (let i = 13; i < 50; i += 1) expect(stoch[i]).toBe(0);
  });
});

describe('classifyLineStochDivergenceCrossRegime', () => {
  it('null input -> none', () => {
    expect(classifyLineStochDivergenceCrossRegime(null, true)).toBe('none');
    expect(classifyLineStochDivergenceCrossRegime(true, null)).toBe('none');
  });

  it('priceUp + stochUp -> aligned-bullish', () => {
    expect(classifyLineStochDivergenceCrossRegime(true, true)).toBe(
      'aligned-bullish',
    );
  });

  it('!priceUp + !stochUp -> aligned-bearish', () => {
    expect(classifyLineStochDivergenceCrossRegime(false, false)).toBe(
      'aligned-bearish',
    );
  });

  it('!priceUp + stochUp -> divergent-bullish', () => {
    expect(classifyLineStochDivergenceCrossRegime(false, true)).toBe(
      'divergent-bullish',
    );
  });

  it('priceUp + !stochUp -> divergent-bearish', () => {
    expect(classifyLineStochDivergenceCrossRegime(true, false)).toBe(
      'divergent-bearish',
    );
  });
});

describe('detectLineStochDivergenceCrossCrosses', () => {
  it('fires bullish on aligned -> div-bull', () => {
    const series = mk([1, 2]);
    const states: ChartLineStochDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    expect(
      detectLineStochDivergenceCrossCrosses(series, states),
    ).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('fires bearish on aligned -> div-bear', () => {
    const series = mk([1, 2]);
    const states: ChartLineStochDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    expect(
      detectLineStochDivergenceCrossCrosses(series, states),
    ).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('no cross on persistence', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineStochDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(
      detectLineStochDivergenceCrossCrosses(series, states),
    ).toHaveLength(0);
  });

  it('skips when prev/cur is none', () => {
    const series = mk([1, 2]);
    expect(
      detectLineStochDivergenceCrossCrosses(series, [
        'none',
        'divergent-bullish',
      ]),
    ).toEqual([]);
    expect(
      detectLineStochDivergenceCrossCrosses(series, [
        'divergent-bullish',
        'none',
      ]),
    ).toEqual([]);
  });

  it('emits two on full sweep', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineStochDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
    ];
    const out = detectLineStochDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });
});

describe('runLineStochDivergenceCross', () => {
  it('CONST K -> aligned-bearish, 0 crosses (50 bars)', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineStochDivergenceCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(18);
    expect(run.alignedBearishCount).toBe(32);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.length).toBe(14);
    expect(run.divergenceWindow).toBe(5);
  });

  it('LINEAR UP 50 -> divergent-bearish (stoch saturated at 100), 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const run = runLineStochDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.divergentBearishCount).toBe(32);
    expect(run.alignedBearishCount).toBe(0);
  });

  it('LINEAR DOWN 50 -> aligned-bearish, 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const run = runLineStochDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBe(32);
  });

  it('respects custom params', () => {
    const data = mk(new Array(50).fill(50));
    expect(
      runLineStochDivergenceCross(data, { divergenceWindow: 10 })
        .divergenceWindow,
    ).toBe(10);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineStochDivergenceCross([]).ok).toBe(false);
    expect(runLineStochDivergenceCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStochDivergenceCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStochDivergenceCross(data, {
      length: 1,
      divergenceWindow: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry full fields', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineStochDivergenceCross(data);
    for (let i = 18; i < 50; i += 1) {
      expect(run.samples[i]!.stoch).toBe(50);
      expect(run.samples[i]!.priceUp).toBe(false);
      expect(run.samples[i]!.stochUp).toBe(false);
      expect(run.samples[i]!.regime).toBe('aligned-bearish');
    }
  });
});

describe('computeLineStochDivergenceCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineStochDivergenceCrossLayout({ data });
    expect(layout.width).toBe(
      DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_WIDTH,
    );
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_PANEL_GAP,
    );
  });

  it('osc panel fixed 0..100', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineStochDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('mid line sits inside osc panel', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineStochDivergenceCrossLayout({ data });
    expect(layout.midY).toBeGreaterThan(layout.oscTop);
    expect(layout.midY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineStochDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('path uses M then L commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineStochDivergenceCrossLayout({ data });
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('stoch path single M when no gaps', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineStochDivergenceCrossLayout({ data });
    expect((layout.stochPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value close', () => {
    const data = mk(new Array(50).fill(7));
    const layout = computeLineStochDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineStochDivergenceCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStochDivergenceCrossChart([])).toBe('No data');
  });

  it('describes parameters + divergence framing', () => {
    const data = mk(new Array(50).fill(50));
    const desc = describeLineStochDivergenceCrossChart(data);
    expect(desc).toContain('Stochastic Divergence Cross chart');
    expect(desc).toContain('length 14');
    expect(desc).toContain('divergenceWindow 5');
    expect(desc).toContain('reversal warning');
    expect(desc).toContain('price-versus-stochastic');
  });
});

describe('ChartLineStochDivergenceCross rendering', () => {
  it('renders region + role=img', () => {
    const data = mk(new Array(50).fill(10));
    const { container, getByRole } = render(
      <ChartLineStochDivergenceCross data={data} />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe(
      'Stochastic Divergence Cross chart',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders config badge', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('window 5');
  });

  it('renders legend toggles for price + stoch', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochDivergenceCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
  });

  it('toggles stoch via legend click', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochDivergenceCross data={data} />,
    );
    const btn = container.querySelector('[data-series-id="stoch"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochDivergenceCross data={data} hiddenSeries={['stoch']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-stoch-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(50).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStochDivergenceCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="stoch"]')!);
    expect(events).toEqual([{ seriesId: 'stoch', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochDivergenceCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="stoch"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(<ChartLineStochDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineStochDivergenceCross data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineStochDivergenceCross data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochDivergenceCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stoch-divergence-cross-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('mid line hide flag', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineStochDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-mid-line"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineStochDivergenceCross data={data} showMid={false} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-mid"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochDivergenceCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-divergence-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochDivergenceCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-stoch-divergence-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-divergence-window')).toBe('5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-aligned-bearish-count')).toBe('32');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_STOCH_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(50).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineStochDivergenceCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stoch-divergence-cross',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mk(new Array(50).fill(10));
    const a = computeLineStochDivergenceCrossLayout({ data });
    const b = computeLineStochDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stochPath).toBe(b.stochPath);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const a = computeLineStochDivergenceCrossLayout({ data });
    const b = computeLineStochDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stochPath).toBe(b.stochPath);
    expect(a.run.stochValues).toEqual(b.run.stochValues);
  });
});
