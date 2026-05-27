import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineCmoDivergenceCross,
  DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_WINDOW,
  applyLineCmoDivergenceCrossCmo,
  classifyLineCmoDivergenceCrossRegime,
  computeLineCmoDivergenceCross,
  computeLineCmoDivergenceCrossLayout,
  describeLineCmoDivergenceCrossChart,
  detectLineCmoDivergenceCrossCrosses,
  getLineCmoDivergenceCrossFinitePoints,
  normalizeLineCmoDivergenceCrossLength,
  normalizeLineCmoDivergenceCrossWindow,
  runLineCmoDivergenceCross,
  type ChartLineCmoDivergenceCrossPoint,
  type ChartLineCmoDivergenceCrossRegime,
} from './chart-line-cmo-divergence-cross';

const mk = (closes: number[]): ChartLineCmoDivergenceCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineCmoDivergenceCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineCmoDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineCmoDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineCmoDivergenceCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineCmoDivergenceCrossLength', () => {
  it('keeps integers >= 1', () => {
    expect(normalizeLineCmoDivergenceCrossLength(14, 14)).toBe(14);
  });

  it('falls back on invalid', () => {
    expect(normalizeLineCmoDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineCmoDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineCmoDivergenceCrossWindow', () => {
  it('keeps integers >= 1', () => {
    expect(normalizeLineCmoDivergenceCrossWindow(5, 5)).toBe(5);
  });

  it('falls back on invalid', () => {
    expect(normalizeLineCmoDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineCmoDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineCmoDivergenceCrossCmo', () => {
  it('CONST close=K -> CMO = 0 (degenerate)', () => {
    const out = applyLineCmoDivergenceCrossCmo(new Array(30).fill(42), 14);
    for (let i = 14; i < 30; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });

  it('LINEAR UP -> CMO = 100 (only gains)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i);
    const out = applyLineCmoDivergenceCrossCmo(closes, 14);
    for (let i = 14; i < 30; i += 1) expect(out[i]).toBe(100);
  });

  it('LINEAR DOWN -> CMO = -100 (only losses)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => -i);
    const out = applyLineCmoDivergenceCrossCmo(closes, 14);
    for (let i = 14; i < 30; i += 1) expect(out[i]).toBe(-100);
  });
});

describe('computeLineCmoDivergenceCross - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> cmo = 0',
    (K) => {
      const data = mk(new Array(50).fill(K));
      const { cmo } = computeLineCmoDivergenceCross(data);
      for (let i = 14; i < 50; i += 1) expect(cmo[i]).toBe(0);
    },
  );
});

describe('computeLineCmoDivergenceCross - LINEAR ramps', () => {
  it('LINEAR UP -> cmo = 100', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const { cmo } = computeLineCmoDivergenceCross(data);
    for (let i = 14; i < 50; i += 1) expect(cmo[i]).toBe(100);
  });

  it('LINEAR DOWN -> cmo = -100', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const { cmo } = computeLineCmoDivergenceCross(data);
    for (let i = 14; i < 50; i += 1) expect(cmo[i]).toBe(-100);
  });
});

describe('classifyLineCmoDivergenceCrossRegime', () => {
  it('null input -> none', () => {
    expect(classifyLineCmoDivergenceCrossRegime(null, true)).toBe('none');
    expect(classifyLineCmoDivergenceCrossRegime(true, null)).toBe('none');
  });

  it('priceUp + cmoUp -> aligned-bullish', () => {
    expect(classifyLineCmoDivergenceCrossRegime(true, true)).toBe(
      'aligned-bullish',
    );
  });

  it('!priceUp + !cmoUp -> aligned-bearish', () => {
    expect(classifyLineCmoDivergenceCrossRegime(false, false)).toBe(
      'aligned-bearish',
    );
  });

  it('!priceUp + cmoUp -> divergent-bullish', () => {
    expect(classifyLineCmoDivergenceCrossRegime(false, true)).toBe(
      'divergent-bullish',
    );
  });

  it('priceUp + !cmoUp -> divergent-bearish', () => {
    expect(classifyLineCmoDivergenceCrossRegime(true, false)).toBe(
      'divergent-bearish',
    );
  });
});

describe('detectLineCmoDivergenceCrossCrosses', () => {
  it('fires bullish on aligned -> div-bull', () => {
    const series = mk([1, 2]);
    const states: ChartLineCmoDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    expect(detectLineCmoDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('fires bearish on aligned -> div-bear', () => {
    const series = mk([1, 2]);
    const states: ChartLineCmoDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    expect(detectLineCmoDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('fires bearish on div-bull -> div-bear', () => {
    const series = mk([1, 2]);
    const states: ChartLineCmoDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bearish',
    ];
    expect(detectLineCmoDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('no cross on persistence', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineCmoDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(detectLineCmoDivergenceCrossCrosses(series, states)).toHaveLength(
      0,
    );
  });

  it('skips when prev is none', () => {
    const series = mk([1, 2]);
    const states: ChartLineCmoDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
    ];
    expect(detectLineCmoDivergenceCrossCrosses(series, states)).toEqual([]);
  });

  it('skips when cur is none', () => {
    const series = mk([1, 2]);
    const states: ChartLineCmoDivergenceCrossRegime[] = [
      'divergent-bullish',
      'none',
    ];
    expect(detectLineCmoDivergenceCrossCrosses(series, states)).toEqual([]);
  });

  it('emits two on full sweep', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineCmoDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
    ];
    const out = detectLineCmoDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });
});

describe('runLineCmoDivergenceCross', () => {
  it('CONST K -> aligned-bearish, 0 crosses (50 bars)', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineCmoDivergenceCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.alignedBearishCount).toBe(31);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.length).toBe(14);
    expect(run.divergenceWindow).toBe(5);
  });

  it('LINEAR UP 50 -> divergent-bearish (cmo saturated at 100), 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const run = runLineCmoDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.divergentBearishCount).toBe(31);
    expect(run.alignedBearishCount).toBe(0);
  });

  it('LINEAR DOWN 50 -> aligned-bearish, 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const run = runLineCmoDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBe(31);
    expect(run.divergentBearishCount).toBe(0);
  });

  it('respects custom params', () => {
    const data = mk(new Array(50).fill(50));
    expect(
      runLineCmoDivergenceCross(data, { divergenceWindow: 10 })
        .divergenceWindow,
    ).toBe(10);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineCmoDivergenceCross([]).ok).toBe(false);
    expect(runLineCmoDivergenceCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineCmoDivergenceCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineCmoDivergenceCross(data, {
      length: 1,
      divergenceWindow: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry full fields', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineCmoDivergenceCross(data);
    for (let i = 19; i < 50; i += 1) {
      expect(run.samples[i]!.cmo).toBe(0);
      expect(run.samples[i]!.priceUp).toBe(false);
      expect(run.samples[i]!.cmoUp).toBe(false);
      expect(run.samples[i]!.regime).toBe('aligned-bearish');
    }
  });
});

describe('computeLineCmoDivergenceCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineCmoDivergenceCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_PANEL_GAP,
    );
  });

  it('osc panel fixed -100..100', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineCmoDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(100);
  });

  it('zero line sits inside osc panel', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineCmoDivergenceCrossLayout({ data });
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineCmoDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('path uses M then L commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineCmoDivergenceCrossLayout({ data });
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('cmo path single M when no gaps', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineCmoDivergenceCrossLayout({ data });
    expect((layout.cmoPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value close', () => {
    const data = mk(new Array(50).fill(7));
    const layout = computeLineCmoDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineCmoDivergenceCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineCmoDivergenceCrossChart([])).toBe('No data');
  });

  it('describes parameters + divergence framing', () => {
    const data = mk(new Array(50).fill(50));
    const desc = describeLineCmoDivergenceCrossChart(data);
    expect(desc).toContain('CMO Divergence Cross chart');
    expect(desc).toContain('length 14');
    expect(desc).toContain('divergenceWindow 5');
    expect(desc).toContain('reversal warning');
    expect(desc).toContain('price-versus-CMO');
  });
});

describe('ChartLineCmoDivergenceCross rendering', () => {
  it('renders region + role=img', () => {
    const data = mk(new Array(50).fill(10));
    const { container, getByRole } = render(
      <ChartLineCmoDivergenceCross data={data} />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe(
      'CMO Divergence Cross chart',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders config badge', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-cmo-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('window 5');
  });

  it('renders legend toggles for price + cmo', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoDivergenceCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
  });

  it('toggles cmo via legend click', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoDivergenceCross data={data} />,
    );
    const btn = container.querySelector('[data-series-id="cmo"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoDivergenceCross data={data} hiddenSeries={['cmo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-cmo-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(50).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineCmoDivergenceCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="cmo"]')!);
    expect(events).toEqual([{ seriesId: 'cmo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoDivergenceCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="cmo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(<ChartLineCmoDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineCmoDivergenceCross data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineCmoDivergenceCross data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoDivergenceCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-cmo-divergence-cross-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('zero line hide flag', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineCmoDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-zero-line"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineCmoDivergenceCross data={data} showZero={false} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-zero"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoDivergenceCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-divergence-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoDivergenceCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-cmo-divergence-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-divergence-window')).toBe('5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-aligned-bearish-count')).toBe('31');
    expect(region?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(region?.getAttribute('data-divergent-bullish-count')).toBe('0');
    expect(region?.getAttribute('data-divergent-bearish-count')).toBe('0');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_CMO_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(50).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCmoDivergenceCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cmo-divergence-cross',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mk(new Array(50).fill(10));
    const a = computeLineCmoDivergenceCrossLayout({ data });
    const b = computeLineCmoDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cmoPath).toBe(b.cmoPath);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const a = computeLineCmoDivergenceCrossLayout({ data });
    const b = computeLineCmoDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cmoPath).toBe(b.cmoPath);
    expect(a.run.cmoValues).toEqual(b.run.cmoValues);
  });
});
