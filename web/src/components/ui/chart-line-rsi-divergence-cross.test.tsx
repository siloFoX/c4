import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineRsiDivergenceCross,
  DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WINDOW,
  applyLineRsiDivergenceCrossWilderRsi,
  classifyLineRsiDivergenceCrossRegime,
  computeLineRsiDivergenceCross,
  computeLineRsiDivergenceCrossLayout,
  describeLineRsiDivergenceCrossChart,
  detectLineRsiDivergenceCrossCrosses,
  getLineRsiDivergenceCrossFinitePoints,
  normalizeLineRsiDivergenceCrossLength,
  normalizeLineRsiDivergenceCrossWindow,
  runLineRsiDivergenceCross,
  type ChartLineRsiDivergenceCrossPoint,
  type ChartLineRsiDivergenceCrossRegime,
} from './chart-line-rsi-divergence-cross';

const mk = (closes: number[]): ChartLineRsiDivergenceCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineRsiDivergenceCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineRsiDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineRsiDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineRsiDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineRsiDivergenceCrossFinitePoints(
        'oops' as unknown as ChartLineRsiDivergenceCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineRsiDivergenceCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineRsiDivergenceCrossLength(14, 14)).toBe(14);
    expect(normalizeLineRsiDivergenceCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineRsiDivergenceCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineRsiDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineRsiDivergenceCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineRsiDivergenceCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineRsiDivergenceCrossWindow', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineRsiDivergenceCrossWindow(5, 5)).toBe(5);
    expect(normalizeLineRsiDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineRsiDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineRsiDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineRsiDivergenceCrossWilderRsi', () => {
  it('CONST close=K -> deltas=0 -> RSI degenerate -> 50', () => {
    const closes = new Array(30).fill(42);
    const out = applyLineRsiDivergenceCrossWilderRsi(closes, 14);
    for (let i = 0; i < 14; i += 1) expect(out[i]).toBeNull();
    for (let i = 14; i < 30; i += 1) expect(out[i]).toBe(50);
  });

  it('LINEAR UP -> only gains -> RSI = 100', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i);
    const out = applyLineRsiDivergenceCrossWilderRsi(closes, 14);
    for (let i = 14; i < 30; i += 1) expect(out[i]).toBeCloseTo(100, 8);
  });

  it('LINEAR DOWN -> only losses -> RSI = 0', () => {
    const closes = Array.from({ length: 30 }, (_, i) => -i);
    const out = applyLineRsiDivergenceCrossWilderRsi(closes, 14);
    for (let i = 14; i < 30; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });
});

describe('computeLineRsiDivergenceCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> rsi = 50',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { rsi } = computeLineRsiDivergenceCross(data, { length: 14 });
      for (let i = 0; i < 14; i += 1) expect(rsi[i]).toBeNull();
      for (let i = 14; i < 40; i += 1) expect(rsi[i]).toBe(50);
    },
  );
});

describe('computeLineRsiDivergenceCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> rsi = 100 after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rsi } = computeLineRsiDivergenceCross(data, { length: 14 });
    for (let i = 14; i < 40; i += 1) expect(rsi[i]).toBeCloseTo(100, 8);
  });

  it('LINEAR DOWN close=-i -> rsi = 0 after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { rsi } = computeLineRsiDivergenceCross(data, { length: 14 });
    for (let i = 14; i < 40; i += 1) expect(rsi[i]).toBe(0);
  });
});

describe('classifyLineRsiDivergenceCrossRegime', () => {
  it('null input -> none', () => {
    expect(classifyLineRsiDivergenceCrossRegime(null, true)).toBe('none');
    expect(classifyLineRsiDivergenceCrossRegime(true, null)).toBe('none');
    expect(classifyLineRsiDivergenceCrossRegime(null, null)).toBe('none');
  });

  it('priceUp + rsiUp -> aligned-bullish', () => {
    expect(classifyLineRsiDivergenceCrossRegime(true, true)).toBe(
      'aligned-bullish',
    );
  });

  it('!priceUp + !rsiUp -> aligned-bearish', () => {
    expect(classifyLineRsiDivergenceCrossRegime(false, false)).toBe(
      'aligned-bearish',
    );
  });

  it('!priceUp + rsiUp -> divergent-bullish', () => {
    expect(classifyLineRsiDivergenceCrossRegime(false, true)).toBe(
      'divergent-bullish',
    );
  });

  it('priceUp + !rsiUp -> divergent-bearish', () => {
    expect(classifyLineRsiDivergenceCrossRegime(true, false)).toBe(
      'divergent-bearish',
    );
  });
});

describe('detectLineRsiDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish from aligned', () => {
    const series = mk([1, 2]);
    const states: ChartLineRsiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    expect(detectLineRsiDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('fires bearish on transition into divergent-bearish from aligned', () => {
    const series = mk([1, 2]);
    const states: ChartLineRsiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    expect(detectLineRsiDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('fires bearish on transition from divergent-bullish to divergent-bearish', () => {
    const series = mk([1, 2]);
    const states: ChartLineRsiDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bearish',
    ];
    expect(detectLineRsiDivergenceCrossCrosses(series, states)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('no cross when divergent state persists (prev == cur)', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineRsiDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(
      detectLineRsiDivergenceCrossCrosses(series, states),
    ).toHaveLength(0);
  });

  it('skips when prev is none', () => {
    const series = mk([1, 2]);
    const states: ChartLineRsiDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
    ];
    expect(detectLineRsiDivergenceCrossCrosses(series, states)).toEqual([]);
  });

  it('skips when cur is none', () => {
    const series = mk([1, 2]);
    const states: ChartLineRsiDivergenceCrossRegime[] = [
      'divergent-bullish',
      'none',
    ];
    expect(detectLineRsiDivergenceCrossCrosses(series, states)).toEqual([]);
  });

  it('emits two crosses across full sweep aligned -> div-bull -> div-bear', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineRsiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
    ];
    const out = detectLineRsiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });
});

describe('runLineRsiDivergenceCross', () => {
  it('CONST K -> 0 crosses, all aligned-bearish (after warmup)', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineRsiDivergenceCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.alignedBearishCount).toBe(41);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.length).toBe(14);
    expect(run.divergenceWindow).toBe(5);
  });

  it('LINEAR UP 60 -> divergent-bearish at steady state, 0 crosses (prev=none)', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineRsiDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.divergentBearishCount).toBe(41);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.alignedBullishCount).toBe(0);
  });

  it('LINEAR DOWN 60 -> aligned-bearish at steady state, 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineRsiDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBe(41);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.alignedBullishCount).toBe(0);
  });

  it('window normalization rejects invalid window', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineRsiDivergenceCross(data, { divergenceWindow: NaN });
    expect(run.divergenceWindow).toBe(5);
  });

  it('respects custom window', () => {
    const data = mk(new Array(60).fill(50));
    expect(
      runLineRsiDivergenceCross(data, { divergenceWindow: 10 })
        .divergenceWindow,
    ).toBe(10);
    expect(
      runLineRsiDivergenceCross(data, { divergenceWindow: 1 })
        .divergenceWindow,
    ).toBe(1);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineRsiDivergenceCross([]).ok).toBe(false);
    expect(runLineRsiDivergenceCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineRsiDivergenceCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineRsiDivergenceCross(data, {
      length: 1,
      divergenceWindow: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / rsi / regime + priceUp/rsiUp', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineRsiDivergenceCross(data);
    expect(run.samples).toHaveLength(60);
    for (let i = 0; i < 5; i += 1) {
      expect(run.samples[i]!.priceUp).toBeNull();
      expect(run.samples[i]!.rsiUp).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    expect(run.samples[5]!.priceUp).toBe(false);
    expect(run.samples[5]!.rsiUp).toBeNull();
    expect(run.samples[5]!.regime).toBe('none');
    for (let i = 19; i < 60; i += 1) {
      expect(run.samples[i]!.rsi).toBe(50);
      expect(run.samples[i]!.priceUp).toBe(false);
      expect(run.samples[i]!.rsiUp).toBe(false);
      expect(run.samples[i]!.regime).toBe('aligned-bearish');
    }
  });
});

describe('computeLineRsiDivergenceCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineRsiDivergenceCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PANEL_GAP,
    );
  });

  it('osc panel is fixed at 0..100', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineRsiDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('mid line sits inside osc panel', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineRsiDivergenceCrossLayout({ data });
    expect(layout.midY).toBeGreaterThan(layout.oscTop);
    expect(layout.midY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineRsiDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.rsiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineRsiDivergenceCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('rsi path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineRsiDivergenceCrossLayout({ data });
    expect(layout.rsiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.rsiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(60).fill(7));
    const layout = computeLineRsiDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineRsiDivergenceCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineRsiDivergenceCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + divergence framing', () => {
    const data = mk(new Array(60).fill(50));
    const desc = describeLineRsiDivergenceCrossChart(data);
    expect(desc).toContain('RSI Divergence Cross chart');
    expect(desc).toContain('60 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('divergenceWindow 5');
    expect(desc).toContain('reversal warning');
    expect(desc).toContain('price-versus-RSI');
  });
});

describe('ChartLineRsiDivergenceCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(60).fill(10));
    const { container, getByRole } = render(
      <ChartLineRsiDivergenceCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'RSI Divergence Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-rsi-divergence-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('RSI Divergence Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-rsi-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('window 5');
  });

  it('renders legend toggles for price + rsi', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('rsi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} />,
    );
    const btn = container.querySelector('[data-series-id="rsi"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(60).fill(10));
    const { container, rerender } = render(
      <ChartLineRsiDivergenceCross data={data} hiddenSeries={['rsi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-rsi-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineRsiDivergenceCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-rsi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(60).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineRsiDivergenceCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="rsi"]')!);
    expect(events).toEqual([{ seriesId: 'rsi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="rsi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineRsiDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-rsi-divergence-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-rsi-divergence-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders mid line by default', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-mid-line"]',
      ),
    ).not.toBeNull();
  });

  it('showMid=false hides mid line', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} showMid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-mid"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses=false hides cross markers group', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows group', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-divergence-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineRsiDivergenceCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-rsi-divergence-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-divergence-window')).toBe('5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-aligned-bearish-count')).toBe('41');
    expect(region?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(region?.getAttribute('data-divergent-bullish-count')).toBe('0');
    expect(region?.getAttribute('data-divergent-bearish-count')).toBe('0');
  });

  it('defaults: length=14, window=5', () => {
    expect(DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(60).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineRsiDivergenceCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-rsi-divergence-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 60 bars', () => {
    const data = mk(new Array(60).fill(10));
    const a = computeLineRsiDivergenceCrossLayout({ data });
    const b = computeLineRsiDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.rsiPath).toBe(b.rsiPath);
    expect(a.midY).toBe(b.midY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for LINEAR DOWN pattern', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const a = computeLineRsiDivergenceCrossLayout({ data });
    const b = computeLineRsiDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.rsiPath).toBe(b.rsiPath);
    expect(a.run.rsiValues).toEqual(b.run.rsiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
