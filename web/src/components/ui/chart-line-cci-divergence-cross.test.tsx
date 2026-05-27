import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineCciDivergenceCross,
  DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_WINDOW,
  applyLineCciDivergenceCrossCci,
  classifyLineCciDivergenceCrossRegime,
  computeLineCciDivergenceCross,
  computeLineCciDivergenceCrossLayout,
  describeLineCciDivergenceCrossChart,
  detectLineCciDivergenceCrossCrosses,
  getLineCciDivergenceCrossFinitePoints,
  normalizeLineCciDivergenceCrossLength,
  normalizeLineCciDivergenceCrossWindow,
  runLineCciDivergenceCross,
  type ChartLineCciDivergenceCrossPoint,
  type ChartLineCciDivergenceCrossRegime,
} from './chart-line-cci-divergence-cross';

const mk = (closes: number[]): ChartLineCciDivergenceCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineCciDivergenceCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
    ];
    expect(getLineCciDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
    ]);
  });

  it('returns [] for null / undefined', () => {
    expect(getLineCciDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineCciDivergenceCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineCciDivergenceCrossLength', () => {
  it('keeps integers >= 1 / falls back on invalid', () => {
    expect(normalizeLineCciDivergenceCrossLength(20, 20)).toBe(20);
    expect(normalizeLineCciDivergenceCrossLength(0, 20)).toBe(20);
    expect(normalizeLineCciDivergenceCrossLength(NaN, 20)).toBe(20);
  });
});

describe('normalizeLineCciDivergenceCrossWindow', () => {
  it('keeps integers >= 1 / falls back on invalid', () => {
    expect(normalizeLineCciDivergenceCrossWindow(5, 5)).toBe(5);
    expect(normalizeLineCciDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineCciDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineCciDivergenceCrossCci', () => {
  it('CONST close=K -> CCI = 0 (degenerate)', () => {
    const out = applyLineCciDivergenceCrossCci(new Array(30).fill(42), 20);
    for (let i = 19; i < 30; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });

  it('LINEAR UP -> CCI ~= 126.67 constant after warmup', () => {
    const closes = Array.from({ length: 50 }, (_, i) => i);
    const out = applyLineCciDivergenceCrossCci(closes, 20);
    for (let i = 19; i < 50; i += 1) {
      expect(out[i]).toBeCloseTo(9.5 / (0.015 * 5), 10);
    }
  });

  it('LINEAR DOWN -> CCI ~= -126.67 constant after warmup', () => {
    const closes = Array.from({ length: 50 }, (_, i) => -i);
    const out = applyLineCciDivergenceCrossCci(closes, 20);
    for (let i = 19; i < 50; i += 1) {
      expect(out[i]).toBeCloseTo(-9.5 / (0.015 * 5), 10);
    }
  });

  it('LINEAR UP: cci[i] === cci[i-5] bit-exact at steady state', () => {
    const closes = Array.from({ length: 50 }, (_, i) => i);
    const out = applyLineCciDivergenceCrossCci(closes, 20);
    // strict equality matters for divergence detector
    for (let i = 24; i < 50; i += 1) {
      expect(out[i]).toBe(out[i - 5]);
    }
  });
});

describe('computeLineCciDivergenceCross - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> cci = 0',
    (K) => {
      const data = mk(new Array(50).fill(K));
      const { cci } = computeLineCciDivergenceCross(data);
      for (let i = 19; i < 50; i += 1) expect(cci[i]).toBe(0);
    },
  );
});

describe('computeLineCciDivergenceCross - LINEAR ramps', () => {
  it('LINEAR UP -> cci ~= 126.67', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const { cci } = computeLineCciDivergenceCross(data);
    for (let i = 19; i < 50; i += 1) {
      expect(cci[i]).toBeCloseTo(9.5 / 0.075, 10);
    }
  });

  it('LINEAR DOWN -> cci ~= -126.67', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const { cci } = computeLineCciDivergenceCross(data);
    for (let i = 19; i < 50; i += 1) {
      expect(cci[i]).toBeCloseTo(-9.5 / 0.075, 10);
    }
  });
});

describe('classifyLineCciDivergenceCrossRegime', () => {
  it('null input -> none', () => {
    expect(classifyLineCciDivergenceCrossRegime(null, true)).toBe('none');
    expect(classifyLineCciDivergenceCrossRegime(true, null)).toBe('none');
  });

  it('priceUp + cciUp -> aligned-bullish', () => {
    expect(classifyLineCciDivergenceCrossRegime(true, true)).toBe(
      'aligned-bullish',
    );
  });

  it('!priceUp + !cciUp -> aligned-bearish', () => {
    expect(classifyLineCciDivergenceCrossRegime(false, false)).toBe(
      'aligned-bearish',
    );
  });

  it('!priceUp + cciUp -> divergent-bullish', () => {
    expect(classifyLineCciDivergenceCrossRegime(false, true)).toBe(
      'divergent-bullish',
    );
  });

  it('priceUp + !cciUp -> divergent-bearish', () => {
    expect(classifyLineCciDivergenceCrossRegime(true, false)).toBe(
      'divergent-bearish',
    );
  });
});

describe('detectLineCciDivergenceCrossCrosses', () => {
  it('fires bullish on aligned -> div-bull', () => {
    const series = mk([1, 2]);
    const states: ChartLineCciDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    expect(detectLineCciDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('fires bearish on aligned -> div-bear', () => {
    const series = mk([1, 2]);
    const states: ChartLineCciDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    expect(detectLineCciDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('no cross on persistence', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineCciDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(detectLineCciDivergenceCrossCrosses(series, states)).toHaveLength(
      0,
    );
  });

  it('skips when prev/cur is none', () => {
    const series = mk([1, 2]);
    expect(
      detectLineCciDivergenceCrossCrosses(series, [
        'none',
        'divergent-bullish',
      ]),
    ).toEqual([]);
    expect(
      detectLineCciDivergenceCrossCrosses(series, [
        'divergent-bullish',
        'none',
      ]),
    ).toEqual([]);
  });

  it('emits two on full sweep', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineCciDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
    ];
    const out = detectLineCciDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });
});

describe('runLineCciDivergenceCross', () => {
  it('CONST K -> aligned-bearish, 0 crosses (50 bars)', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineCciDivergenceCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(24);
    expect(run.alignedBearishCount).toBe(26);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.length).toBe(20);
    expect(run.divergenceWindow).toBe(5);
  });

  it('LINEAR UP 50 -> divergent-bearish (CCI plateaus, price rises), 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const run = runLineCciDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.divergentBearishCount).toBe(26);
    expect(run.alignedBearishCount).toBe(0);
  });

  it('LINEAR DOWN 50 -> aligned-bearish, 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const run = runLineCciDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBe(26);
  });

  it('respects custom params', () => {
    const data = mk(new Array(50).fill(50));
    expect(
      runLineCciDivergenceCross(data, { divergenceWindow: 10 })
        .divergenceWindow,
    ).toBe(10);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineCciDivergenceCross([]).ok).toBe(false);
    expect(runLineCciDivergenceCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineCciDivergenceCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineCciDivergenceCross(data, {
      length: 1,
      divergenceWindow: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry full fields', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineCciDivergenceCross(data);
    for (let i = 24; i < 50; i += 1) {
      expect(run.samples[i]!.cci).toBe(0);
      expect(run.samples[i]!.priceUp).toBe(false);
      expect(run.samples[i]!.cciUp).toBe(false);
      expect(run.samples[i]!.regime).toBe('aligned-bearish');
    }
  });
});

describe('computeLineCciDivergenceCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineCciDivergenceCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_PANEL_GAP,
    );
  });

  it('CONST K -> cci=0 -> [-1, 1]', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineCciDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('LINEAR UP -> symmetric range around 0', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineCciDivergenceCrossLayout({ data });
    // cci ~= 126.67, span = 126.67, range = +/- 139.33
    expect(layout.oscMin).toBeCloseTo(-139.33, 1);
    expect(layout.oscMax).toBeCloseTo(139.33, 1);
  });

  it('zero line sits inside osc panel', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineCciDivergenceCrossLayout({ data });
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineCciDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('path uses M then L commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineCciDivergenceCrossLayout({ data });
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('cci path single M when no gaps', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineCciDivergenceCrossLayout({ data });
    expect((layout.cciPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value close', () => {
    const data = mk(new Array(50).fill(7));
    const layout = computeLineCciDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineCciDivergenceCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineCciDivergenceCrossChart([])).toBe('No data');
  });

  it('describes parameters + divergence framing', () => {
    const data = mk(new Array(50).fill(50));
    const desc = describeLineCciDivergenceCrossChart(data);
    expect(desc).toContain('CCI Divergence Cross chart');
    expect(desc).toContain('length 20');
    expect(desc).toContain('divergenceWindow 5');
    expect(desc).toContain('reversal warning');
    expect(desc).toContain('price-versus-CCI');
  });
});

describe('ChartLineCciDivergenceCross rendering', () => {
  it('renders region + role=img', () => {
    const data = mk(new Array(50).fill(10));
    const { container, getByRole } = render(
      <ChartLineCciDivergenceCross data={data} />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe(
      'CCI Divergence Cross chart',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders config badge', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCciDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-cci-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('window 5');
  });

  it('renders legend toggles for price + cci', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCciDivergenceCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
  });

  it('toggles cci via legend click', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCciDivergenceCross data={data} />,
    );
    const btn = container.querySelector('[data-series-id="cci"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCciDivergenceCross data={data} hiddenSeries={['cci']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-cci-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(50).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineCciDivergenceCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="cci"]')!);
    expect(events).toEqual([{ seriesId: 'cci', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCciDivergenceCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="cci"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(<ChartLineCciDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineCciDivergenceCross data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineCciDivergenceCross data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCciDivergenceCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-cci-divergence-cross-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('zero line hide flag', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineCciDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-zero-line"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineCciDivergenceCross data={data} showZero={false} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-zero"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCciDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCciDivergenceCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-divergence-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCciDivergenceCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-cci-divergence-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('20');
    expect(region?.getAttribute('data-divergence-window')).toBe('5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-aligned-bearish-count')).toBe('26');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_CCI_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(50).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCciDivergenceCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cci-divergence-cross',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mk(new Array(50).fill(10));
    const a = computeLineCciDivergenceCrossLayout({ data });
    const b = computeLineCciDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cciPath).toBe(b.cciPath);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const a = computeLineCciDivergenceCrossLayout({ data });
    const b = computeLineCciDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cciPath).toBe(b.cciPath);
    expect(a.run.cciValues).toEqual(b.run.cciValues);
  });
});
