import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineMacdDivergenceCross,
  DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WINDOW,
  applyLineMacdDivergenceCrossSma,
  classifyLineMacdDivergenceCrossRegime,
  computeLineMacdDivergenceCross,
  computeLineMacdDivergenceCrossLayout,
  describeLineMacdDivergenceCrossChart,
  detectLineMacdDivergenceCrossCrosses,
  getLineMacdDivergenceCrossFinitePoints,
  normalizeLineMacdDivergenceCrossLength,
  normalizeLineMacdDivergenceCrossWindow,
  runLineMacdDivergenceCross,
  type ChartLineMacdDivergenceCrossPoint,
  type ChartLineMacdDivergenceCrossRegime,
} from './chart-line-macd-divergence-cross';

const mk = (closes: number[]): ChartLineMacdDivergenceCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineMacdDivergenceCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineMacdDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineMacdDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineMacdDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineMacdDivergenceCrossFinitePoints(
        'oops' as unknown as ChartLineMacdDivergenceCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineMacdDivergenceCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineMacdDivergenceCrossLength(12, 12)).toBe(12);
    expect(normalizeLineMacdDivergenceCrossLength(1, 12)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineMacdDivergenceCrossLength(7.9, 12)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineMacdDivergenceCrossLength(0, 12)).toBe(12);
    expect(normalizeLineMacdDivergenceCrossLength(-1, 12)).toBe(12);
    expect(normalizeLineMacdDivergenceCrossLength(NaN, 12)).toBe(12);
  });
});

describe('normalizeLineMacdDivergenceCrossWindow', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineMacdDivergenceCrossWindow(5, 5)).toBe(5);
    expect(normalizeLineMacdDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineMacdDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineMacdDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineMacdDivergenceCrossSma', () => {
  it('CONST values -> SMA = value via CONST short-circuit', () => {
    const out = applyLineMacdDivergenceCrossSma(new Array(15).fill(42), 12);
    for (let i = 0; i < 11; i += 1) expect(out[i]).toBeNull();
    for (let i = 11; i < 15; i += 1) expect(out[i]).toBe(42);
  });

  it('CONST zero -> SMA = 0 exactly', () => {
    const out = applyLineMacdDivergenceCrossSma(new Array(15).fill(0), 12);
    for (let i = 11; i < 15; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });

  it('LINEAR ramp produces steady SMA with constant lag', () => {
    const values = Array.from({ length: 30 }, (_, i) => i);
    const out = applyLineMacdDivergenceCrossSma(values, 12);
    expect(out[11]).toBeCloseTo(5.5, 10);
    expect(out[20]).toBeCloseTo(14.5, 10);
  });
});

describe('computeLineMacdDivergenceCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> macd = 0 via SMA min === max short-circuit',
    (K) => {
      const data = mk(new Array(60).fill(K));
      const { macd } = computeLineMacdDivergenceCross(data, {
        fastLength: 12,
        slowLength: 26,
      });
      for (let i = 0; i < 25; i += 1) {
        expect(macd[i]).toBeNull();
      }
      for (let i = 25; i < 60; i += 1) {
        expect(macd[i]).toBe(0);
        expect(Object.is(macd[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineMacdDivergenceCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> macd = 7 constant after warmup', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const { macd } = computeLineMacdDivergenceCross(data, {
      fastLength: 12,
      slowLength: 26,
    });
    for (let i = 25; i < 60; i += 1) {
      expect(macd[i]).toBe(7);
    }
  });

  it('LINEAR DOWN close=-i -> macd = -7 constant after warmup', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const { macd } = computeLineMacdDivergenceCross(data, {
      fastLength: 12,
      slowLength: 26,
    });
    for (let i = 25; i < 60; i += 1) {
      expect(macd[i]).toBe(-7);
    }
  });
});

describe('classifyLineMacdDivergenceCrossRegime', () => {
  it('null input -> none', () => {
    expect(classifyLineMacdDivergenceCrossRegime(null, true)).toBe('none');
    expect(classifyLineMacdDivergenceCrossRegime(true, null)).toBe('none');
    expect(classifyLineMacdDivergenceCrossRegime(null, null)).toBe('none');
  });

  it('priceUp + macdUp -> aligned-bullish', () => {
    expect(classifyLineMacdDivergenceCrossRegime(true, true)).toBe(
      'aligned-bullish',
    );
  });

  it('!priceUp + !macdUp -> aligned-bearish', () => {
    expect(classifyLineMacdDivergenceCrossRegime(false, false)).toBe(
      'aligned-bearish',
    );
  });

  it('!priceUp + macdUp -> divergent-bullish', () => {
    expect(classifyLineMacdDivergenceCrossRegime(false, true)).toBe(
      'divergent-bullish',
    );
  });

  it('priceUp + !macdUp -> divergent-bearish', () => {
    expect(classifyLineMacdDivergenceCrossRegime(true, false)).toBe(
      'divergent-bearish',
    );
  });
});

describe('detectLineMacdDivergenceCrossCrosses', () => {
  it('fires bullish on transition into divergent-bullish from aligned', () => {
    const series = mk([1, 2]);
    const states: ChartLineMacdDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    const out = detectLineMacdDivergenceCrossCrosses(series, states);
    expect(out).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('fires bearish on transition into divergent-bearish from aligned', () => {
    const series = mk([1, 2]);
    const states: ChartLineMacdDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    const out = detectLineMacdDivergenceCrossCrosses(series, states);
    expect(out).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('fires bearish on transition from divergent-bullish to divergent-bearish', () => {
    const series = mk([1, 2]);
    const states: ChartLineMacdDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bearish',
    ];
    const out = detectLineMacdDivergenceCrossCrosses(series, states);
    expect(out).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('no cross when divergent state persists (prev == cur)', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineMacdDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(
      detectLineMacdDivergenceCrossCrosses(series, states),
    ).toHaveLength(0);
  });

  it('skips when prev is none', () => {
    const series = mk([1, 2]);
    const states: ChartLineMacdDivergenceCrossRegime[] = [
      'none',
      'divergent-bullish',
    ];
    expect(detectLineMacdDivergenceCrossCrosses(series, states)).toEqual([]);
  });

  it('skips when cur is none', () => {
    const series = mk([1, 2]);
    const states: ChartLineMacdDivergenceCrossRegime[] = [
      'divergent-bullish',
      'none',
    ];
    expect(detectLineMacdDivergenceCrossCrosses(series, states)).toEqual([]);
  });

  it('emits two crosses across full sweep aligned -> div-bull -> div-bear', () => {
    const series = mk([1, 2, 3]);
    const states: ChartLineMacdDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
    ];
    const out = detectLineMacdDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });
});

describe('runLineMacdDivergenceCross', () => {
  it('CONST K -> 0 crosses, all aligned-bearish (after warmup)', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineMacdDivergenceCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(30);
    expect(run.alignedBearishCount).toBe(30);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.fastLength).toBe(12);
    expect(run.slowLength).toBe(26);
    expect(run.divergenceWindow).toBe(5);
  });

  it('LINEAR UP 60 -> divergent-bearish at steady state, 0 crosses (prev=none)', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineMacdDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.divergentBearishCount).toBeGreaterThan(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.alignedBullishCount).toBe(0);
  });

  it('LINEAR DOWN 60 -> aligned-bearish at steady state, 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineMacdDivergenceCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBeGreaterThan(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.alignedBullishCount).toBe(0);
  });

  it('window normalization rejects invalid window', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineMacdDivergenceCross(data, { divergenceWindow: NaN });
    expect(run.divergenceWindow).toBe(5);
  });

  it('respects custom window', () => {
    const data = mk(new Array(60).fill(50));
    expect(
      runLineMacdDivergenceCross(data, { divergenceWindow: 10 })
        .divergenceWindow,
    ).toBe(10);
    expect(
      runLineMacdDivergenceCross(data, { divergenceWindow: 1 })
        .divergenceWindow,
    ).toBe(1);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineMacdDivergenceCross([]).ok).toBe(false);
    expect(runLineMacdDivergenceCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineMacdDivergenceCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineMacdDivergenceCross(data, {
      fastLength: 1,
      slowLength: 1,
      divergenceWindow: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / macd / regime + priceUp/macdUp', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineMacdDivergenceCross(data);
    expect(run.samples).toHaveLength(60);
    for (let i = 0; i < 5; i += 1) {
      expect(run.samples[i]!.priceUp).toBeNull();
      expect(run.samples[i]!.macdUp).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    expect(run.samples[5]!.priceUp).toBe(false);
    expect(run.samples[5]!.macdUp).toBeNull();
    expect(run.samples[5]!.regime).toBe('none');
    for (let i = 30; i < 60; i += 1) {
      expect(run.samples[i]!.macd).toBe(0);
      expect(run.samples[i]!.priceUp).toBe(false);
      expect(run.samples[i]!.macdUp).toBe(false);
      expect(run.samples[i]!.regime).toBe('aligned-bearish');
    }
  });
});

describe('computeLineMacdDivergenceCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineMacdDivergenceCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PANEL_GAP,
    );
  });

  it('CONST K -> macd=0 -> symmetric default range [-1, 1]', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineMacdDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('LINEAR UP -> macd=7 -> symmetric range -7.7 .. 7.7', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineMacdDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBeCloseTo(-7.7, 6);
    expect(layout.oscMax).toBeCloseTo(7.7, 6);
  });

  it('zero line sits inside osc panel', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineMacdDivergenceCrossLayout({ data });
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineMacdDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.macdPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineMacdDivergenceCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('macd path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineMacdDivergenceCrossLayout({ data });
    expect(layout.macdPath.startsWith('M ')).toBe(true);
    const mCount = (layout.macdPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(60).fill(7));
    const layout = computeLineMacdDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineMacdDivergenceCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineMacdDivergenceCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + divergence framing', () => {
    const data = mk(new Array(60).fill(50));
    const desc = describeLineMacdDivergenceCrossChart(data);
    expect(desc).toContain('MACD Divergence Cross chart');
    expect(desc).toContain('60 bars');
    expect(desc).toContain('fastLength 12');
    expect(desc).toContain('slowLength 26');
    expect(desc).toContain('divergenceWindow 5');
    expect(desc).toContain('reversal warning');
    expect(desc).toContain('price-versus-');
  });
});

describe('ChartLineMacdDivergenceCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(60).fill(10));
    const { container, getByRole } = render(
      <ChartLineMacdDivergenceCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'MACD Divergence Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-macd-divergence-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('MACD Divergence Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-macd-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('fast 12');
    expect(badge?.textContent).toContain('slow 26');
    expect(badge?.textContent).toContain('window 5');
  });

  it('renders legend toggles for price + macd', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('macd');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} />,
    );
    const btn = container.querySelector('[data-series-id="macd"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(60).fill(10));
    const { container, rerender } = render(
      <ChartLineMacdDivergenceCross data={data} hiddenSeries={['macd']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-macd-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineMacdDivergenceCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-macd-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(60).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineMacdDivergenceCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="macd"]')!);
    expect(events).toEqual([{ seriesId: 'macd', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="macd"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineMacdDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-macd-divergence-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-macd-divergence-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders zero line by default', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('showZero=false hides zero line', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} showZero={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-zero"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses=false hides cross markers group', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows group', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross
        data={data}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-divergence-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineMacdDivergenceCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-macd-divergence-cross"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('12');
    expect(region?.getAttribute('data-slow-length')).toBe('26');
    expect(region?.getAttribute('data-divergence-window')).toBe('5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-aligned-bearish-count')).toBe('30');
    expect(region?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(region?.getAttribute('data-divergent-bullish-count')).toBe('0');
    expect(region?.getAttribute('data-divergent-bearish-count')).toBe('0');
  });

  it('defaults: fastLength=12, slowLength=26, window=5', () => {
    expect(DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_FAST_LENGTH).toBe(12);
    expect(DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_SLOW_LENGTH).toBe(26);
    expect(DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(60).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMacdDivergenceCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-macd-divergence-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 60 bars', () => {
    const data = mk(new Array(60).fill(10));
    const a = computeLineMacdDivergenceCrossLayout({ data });
    const b = computeLineMacdDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.macdPath).toBe(b.macdPath);
    expect(a.zeroY).toBe(b.zeroY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for LINEAR DOWN pattern', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const a = computeLineMacdDivergenceCrossLayout({ data });
    const b = computeLineMacdDivergenceCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.macdPath).toBe(b.macdPath);
    expect(a.run.macdValues).toEqual(b.run.macdValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
