import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStochRsiOverboughtCross,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PADDING,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_RSI_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STOCH_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_WIDTH,
  applyLineStochRsiOverboughtCrossWilder,
  classifyLineStochRsiOverboughtCrossRegime,
  computeLineStochRsiOverboughtCross,
  computeLineStochRsiOverboughtCrossLayout,
  describeLineStochRsiOverboughtCrossChart,
  detectLineStochRsiOverboughtCrossCrosses,
  getLineStochRsiOverboughtCrossFinitePoints,
  normalizeLineStochRsiOverboughtCrossLength,
  normalizeLineStochRsiOverboughtCrossThreshold,
  runLineStochRsiOverboughtCross,
  type ChartLineStochRsiOverboughtCrossPoint,
} from './chart-line-stoch-rsi-overbought-cross';

const mk = (
  closes: number[],
): ChartLineStochRsiOverboughtCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const SMALL = { rsiLength: 5, stochLength: 3 };

describe('getLineStochRsiOverboughtCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineStochRsiOverboughtCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineStochRsiOverboughtCrossFinitePoints(null)).toEqual([]);
    expect(
      getLineStochRsiOverboughtCrossFinitePoints(undefined),
    ).toEqual([]);
    expect(
      getLineStochRsiOverboughtCrossFinitePoints(
        'oops' as unknown as ChartLineStochRsiOverboughtCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineStochRsiOverboughtCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineStochRsiOverboughtCrossLength(14, 14)).toBe(14);
    expect(normalizeLineStochRsiOverboughtCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineStochRsiOverboughtCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineStochRsiOverboughtCrossLength(0, 14)).toBe(14);
    expect(normalizeLineStochRsiOverboughtCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineStochRsiOverboughtCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineStochRsiOverboughtCrossThreshold(80, 80)).toBe(80);
    expect(normalizeLineStochRsiOverboughtCrossThreshold(70, 80)).toBe(70);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineStochRsiOverboughtCrossThreshold(NaN, 80)).toBe(80);
  });
});

describe('applyLineStochRsiOverboughtCrossWilder', () => {
  it('CONST values -> Wilder stays at SMA seed', () => {
    const out = applyLineStochRsiOverboughtCrossWilder(
      [null, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      5,
      1,
    );
    for (let i = 0; i < 5; i += 1) expect(out[i]).toBeNull();
    for (let i = 5; i < 10; i += 1) expect(out[i]).toBe(1);
  });

  it('null in seed window -> all null', () => {
    const out = applyLineStochRsiOverboughtCrossWilder(
      [null, 1, null, 3, 4, 5] as Array<number | null>,
      3,
      1,
    );
    expect(out).toEqual([null, null, null, null, null, null]);
  });
});

describe('computeLineStochRsiOverboughtCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> rsi = 50, stochK = 50 (seed) after warmup',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { rsi, stochK } = computeLineStochRsiOverboughtCross(
        data,
        SMALL,
      );
      // rsi valid at i >= rsiLength = 5; stochK at i >= 7.
      for (let i = 0; i < 5; i += 1) expect(rsi[i]).toBeNull();
      for (let i = 5; i < 40; i += 1) expect(rsi[i]).toBe(50);
      for (let i = 0; i < 7; i += 1) expect(stochK[i]).toBeNull();
      for (let i = 7; i < 40; i += 1) expect(stochK[i]).toBe(50);
    },
  );
});

describe('computeLineStochRsiOverboughtCross - LINEAR ramps', () => {
  it('LINEAR UP -> rsi = 100, stochK locked at 50 (seed)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rsi, stochK } = computeLineStochRsiOverboughtCross(
      data,
      SMALL,
    );
    for (let i = 5; i < 40; i += 1) expect(rsi[i]).toBe(100);
    for (let i = 7; i < 40; i += 1) expect(stochK[i]).toBe(50);
  });

  it('LINEAR DOWN -> rsi = 0, stochK locked at 50 (seed)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { rsi, stochK } = computeLineStochRsiOverboughtCross(
      data,
      SMALL,
    );
    for (let i = 5; i < 40; i += 1) expect(rsi[i]).toBe(0);
    for (let i = 7; i < 40; i += 1) expect(stochK[i]).toBe(50);
  });

  it('stochK[i < rsiLength + stochLength - 1] is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { stochK } = computeLineStochRsiOverboughtCross(data, SMALL);
    for (let i = 0; i < 7; i += 1) expect(stochK[i]).toBeNull();
  });

  it('custom larger lengths extend warmup', () => {
    const data = mk(new Array(60).fill(10));
    const { rsi, stochK } = computeLineStochRsiOverboughtCross(data, {
      rsiLength: 10,
      stochLength: 5,
    });
    // rsi at i >= 10. stochK at i >= 10 + 4 = 14.
    for (let i = 0; i < 10; i += 1) expect(rsi[i]).toBeNull();
    for (let i = 0; i < 14; i += 1) expect(stochK[i]).toBeNull();
    for (let i = 14; i < 60; i += 1) expect(stochK[i]).toBe(50);
  });
});

describe('classifyLineStochRsiOverboughtCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStochRsiOverboughtCrossRegime(null, 80)).toBe(
      'none',
    );
  });

  it('stochK at threshold boundary -> bullish', () => {
    expect(classifyLineStochRsiOverboughtCrossRegime(80, 80)).toBe(
      'bullish',
    );
    expect(classifyLineStochRsiOverboughtCrossRegime(95, 80)).toBe(
      'bullish',
    );
  });

  it('stochK < threshold -> bearish', () => {
    expect(classifyLineStochRsiOverboughtCrossRegime(79.99, 80)).toBe(
      'bearish',
    );
    expect(classifyLineStochRsiOverboughtCrossRegime(50, 80)).toBe(
      'bearish',
    );
    expect(classifyLineStochRsiOverboughtCrossRegime(0, 80)).toBe(
      'bearish',
    );
  });
});

describe('detectLineStochRsiOverboughtCrossCrosses', () => {
  it('fires bullish (entry) when stochK crosses up through 80', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [50, 60, 70, 90, 95];
    const crosses = detectLineStochRsiOverboughtCrossCrosses(series, v, 80);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish (exit) when stochK crosses down through 80', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [95, 90, 82, 70, 60];
    const crosses = detectLineStochRsiOverboughtCrossCrosses(series, v, 80);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const v = [70, 90, 85, 70];
    const crosses = detectLineStochRsiOverboughtCrossCrosses(series, v, 80);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineStochRsiOverboughtCrossCrosses(series, [null, 70, 90], 80),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineStochRsiOverboughtCrossCrosses(series, [70, null, 90], 80),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineStochRsiOverboughtCrossCrosses(series, [70, 80], 80),
    ).toEqual([]);
  });

  it('no cross when stochK stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineStochRsiOverboughtCrossCrosses(
        series,
        [10, 20, 30, 40],
        80,
      ),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineStochRsiOverboughtCrossCrosses(series, [60, 65, 75], 70),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineStochRsiOverboughtCross', () => {
  it('CONST K -> 0 crosses, all bearish (stochK=50 < 80)', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineStochRsiOverboughtCross(data, SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(7);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(33);
    expect(run.rsiLength).toBe(5);
    expect(run.stochLength).toBe(3);
  });

  it('LINEAR UP -> all bearish (stochK locked at 50)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineStochRsiOverboughtCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(33);
  });

  it('LINEAR DOWN -> all bearish (stochK locked at 50)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineStochRsiOverboughtCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(33);
  });

  it('decline then rise generates bullish (entry) cross', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const run = runLineStochRsiOverboughtCross(mk(closes), SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('decline-rise-decline generates both bullish entry and bearish exit', () => {
    const closes: number[] = [];
    // Decline first puts rsi at 0 -> stochK locked at seed (50).
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    // Rise transitions rsi upward so stochK jumps to ~100 (bullish
    // entry above 80).
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    // Decline transitions rsi back down so stochK drops (bearish
    // exit below 80).
    for (let i = 40; i < 60; i += 1) closes.push(59 - i);
    const run = runLineStochRsiOverboughtCross(mk(closes), SMALL);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineStochRsiOverboughtCross(data, {
      ...SMALL,
      threshold: NaN,
    });
    expect(run.threshold).toBe(80);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(50));
    expect(
      runLineStochRsiOverboughtCross(data, { ...SMALL, threshold: 70 })
        .threshold,
    ).toBe(70);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineStochRsiOverboughtCross([], SMALL).ok).toBe(false);
    expect(
      runLineStochRsiOverboughtCross(mk([1, 2, 3]), SMALL).ok,
    ).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStochRsiOverboughtCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStochRsiOverboughtCross(data, {
      rsiLength: 1,
      stochLength: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / rsi / stochK / regime', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineStochRsiOverboughtCross(data, SMALL);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 7; i += 1) {
      expect(run.samples[i]!.stochK).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 7; i < 40; i += 1) {
      expect(run.samples[i]!.rsi).toBe(50);
      expect(run.samples[i]!.stochK).toBe(50);
      expect(run.samples[i]!.regime).toBe('bearish');
    }
  });
});

describe('computeLineStochRsiOverboughtCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineStochRsiOverboughtCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.width).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_WIDTH,
    );
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PANEL_GAP,
    );
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineStochRsiOverboughtCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY at 80% of panel height (above midpoint)', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineStochRsiOverboughtCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    // Threshold = 80 -> closer to oscTop than oscBottom.
    const midpoint = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.thresholdY).toBeLessThan(midpoint);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineStochRsiOverboughtCrossLayout({
      data: [],
    });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stochKPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineStochRsiOverboughtCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(
      /^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/,
    );
  });

  it('stochK path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineStochRsiOverboughtCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.stochKPath.startsWith('M ')).toBe(true);
    const mCount = (layout.stochKPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineStochRsiOverboughtCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const layout = computeLineStochRsiOverboughtCrossLayout({
      data: mk(closes),
      ...SMALL,
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineStochRsiOverboughtCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStochRsiOverboughtCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineStochRsiOverboughtCrossChart(data);
    expect(desc).toContain('Stoch RSI Overbought Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('rsiLength 14');
    expect(desc).toContain('stochLength 14');
    expect(desc).toContain('threshold 80');
  });
});

describe('ChartLineStochRsiOverboughtCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineStochRsiOverboughtCross data={data} {...SMALL} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Stoch RSI Overbought Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-rsi-overbought-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Stoch RSI Overbought Cross chart',
    );
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={data} {...SMALL} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-rsi-overbought-cross-badge"]',
    );
    expect(badge?.textContent).toContain('rsi 5');
    expect(badge?.textContent).toContain('stoch 3');
    expect(badge?.textContent).toContain('threshold 80');
  });

  it('renders legend toggles for price + stochk', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={data} {...SMALL} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('stochk');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector('[data-series-id="stochk"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineStochRsiOverboughtCross
        data={data}
        {...SMALL}
        hiddenSeries={['stochk']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-stochk-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineStochRsiOverboughtCross
        data={data}
        {...SMALL}
        hiddenSeries={[]}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-stochk-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStochRsiOverboughtCross
        data={data}
        {...SMALL}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="stochk"]')!);
    expect(events).toEqual([{ seriesId: 'stochk', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector(
      '[data-series-id="stochk"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross
        data={data}
        {...SMALL}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={data} {...SMALL} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={data} {...SMALL} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stoch-rsi-overbought-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-stoch-rsi-overbought-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={data} {...SMALL} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross
        data={data}
        {...SMALL}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross
        data={data}
        {...SMALL}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers after decline-then-rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={mk(closes)} {...SMALL} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-stoch-rsi-overbought-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineStochRsiOverboughtCross
        data={mk(closes)}
        {...SMALL}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineStochRsiOverboughtCross
        data={mk(closes)}
        {...SMALL}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOverboughtCross data={data} {...SMALL} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-stoch-rsi-overbought-cross"]',
    );
    expect(region?.getAttribute('data-rsi-length')).toBe('5');
    expect(region?.getAttribute('data-stoch-length')).toBe('3');
    expect(region?.getAttribute('data-threshold')).toBe('80');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bearish-count')).toBe('33');
  });

  it('defaults: rsiLength=14, stochLength=14, threshold=80', () => {
    expect(DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_RSI_LENGTH).toBe(
      14,
    );
    expect(DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STOCH_LENGTH).toBe(
      14,
    );
    expect(DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_THRESHOLD).toBe(80);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineStochRsiOverboughtCross
        data={data}
        {...SMALL}
        ref={ref}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stoch-rsi-overbought-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineStochRsiOverboughtCrossLayout({ data, ...SMALL });
    const b = computeLineStochRsiOverboughtCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stochKPath).toBe(b.stochKPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for decline-then-rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const data = mk(closes);
    const a = computeLineStochRsiOverboughtCrossLayout({ data, ...SMALL });
    const b = computeLineStochRsiOverboughtCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stochKPath).toBe(b.stochKPath);
    expect(a.run.stochKValues).toEqual(b.run.stochKValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
