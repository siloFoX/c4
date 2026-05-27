import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStochRsiOversoldCross,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_PADDING,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_RSI_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_STOCH_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_WIDTH,
  applyLineStochRsiOversoldCrossWilder,
  classifyLineStochRsiOversoldCrossRegime,
  computeLineStochRsiOversoldCross,
  computeLineStochRsiOversoldCrossLayout,
  describeLineStochRsiOversoldCrossChart,
  detectLineStochRsiOversoldCrossCrosses,
  getLineStochRsiOversoldCrossFinitePoints,
  normalizeLineStochRsiOversoldCrossLength,
  normalizeLineStochRsiOversoldCrossThreshold,
  runLineStochRsiOversoldCross,
  type ChartLineStochRsiOversoldCrossPoint,
} from './chart-line-stoch-rsi-oversold-cross';

const mk = (
  closes: number[],
): ChartLineStochRsiOversoldCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const SMALL = { rsiLength: 5, stochLength: 3 };

describe('getLineStochRsiOversoldCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineStochRsiOversoldCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineStochRsiOversoldCrossFinitePoints(null)).toEqual([]);
    expect(getLineStochRsiOversoldCrossFinitePoints(undefined)).toEqual(
      [],
    );
    expect(
      getLineStochRsiOversoldCrossFinitePoints(
        'oops' as unknown as ChartLineStochRsiOversoldCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineStochRsiOversoldCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineStochRsiOversoldCrossLength(14, 14)).toBe(14);
    expect(normalizeLineStochRsiOversoldCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineStochRsiOversoldCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineStochRsiOversoldCrossLength(0, 14)).toBe(14);
    expect(normalizeLineStochRsiOversoldCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineStochRsiOversoldCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineStochRsiOversoldCrossThreshold(20, 20)).toBe(20);
    expect(normalizeLineStochRsiOversoldCrossThreshold(30, 20)).toBe(30);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineStochRsiOversoldCrossThreshold(NaN, 20)).toBe(20);
  });
});

describe('applyLineStochRsiOversoldCrossWilder', () => {
  it('CONST values -> Wilder stays at SMA seed', () => {
    const out = applyLineStochRsiOversoldCrossWilder(
      [null, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      5,
      1,
    );
    for (let i = 0; i < 5; i += 1) expect(out[i]).toBeNull();
    for (let i = 5; i < 10; i += 1) expect(out[i]).toBe(1);
  });

  it('null in seed window -> all null', () => {
    const out = applyLineStochRsiOversoldCrossWilder(
      [null, 1, null, 3, 4, 5] as Array<number | null>,
      3,
      1,
    );
    expect(out).toEqual([null, null, null, null, null, null]);
  });
});

describe('computeLineStochRsiOversoldCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> rsi = 50, stochK = 50 (seed) after warmup',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { rsi, stochK } = computeLineStochRsiOversoldCross(
        data,
        SMALL,
      );
      // rsi valid at i >= 5; stochK at i >= 7.
      for (let i = 0; i < 5; i += 1) expect(rsi[i]).toBeNull();
      for (let i = 5; i < 40; i += 1) expect(rsi[i]).toBe(50);
      for (let i = 0; i < 7; i += 1) expect(stochK[i]).toBeNull();
      for (let i = 7; i < 40; i += 1) expect(stochK[i]).toBe(50);
    },
  );
});

describe('computeLineStochRsiOversoldCross - LINEAR ramps', () => {
  it('LINEAR UP -> rsi = 100, stochK locked at 50 (seed)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rsi, stochK } = computeLineStochRsiOversoldCross(data, SMALL);
    for (let i = 5; i < 40; i += 1) expect(rsi[i]).toBe(100);
    for (let i = 7; i < 40; i += 1) expect(stochK[i]).toBe(50);
  });

  it('LINEAR DOWN -> rsi = 0, stochK locked at 50 (seed)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { rsi, stochK } = computeLineStochRsiOversoldCross(data, SMALL);
    for (let i = 5; i < 40; i += 1) expect(rsi[i]).toBe(0);
    for (let i = 7; i < 40; i += 1) expect(stochK[i]).toBe(50);
  });

  it('stochK[i < rsiLength + stochLength - 1] is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { stochK } = computeLineStochRsiOversoldCross(data, SMALL);
    for (let i = 0; i < 7; i += 1) expect(stochK[i]).toBeNull();
  });

  it('custom larger lengths extend warmup', () => {
    const data = mk(new Array(60).fill(10));
    const { rsi, stochK } = computeLineStochRsiOversoldCross(data, {
      rsiLength: 10,
      stochLength: 5,
    });
    for (let i = 0; i < 10; i += 1) expect(rsi[i]).toBeNull();
    for (let i = 0; i < 14; i += 1) expect(stochK[i]).toBeNull();
    for (let i = 14; i < 60; i += 1) expect(stochK[i]).toBe(50);
  });
});

describe('classifyLineStochRsiOversoldCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStochRsiOversoldCrossRegime(null, 20)).toBe('none');
  });

  it('stochK at threshold boundary -> bullish', () => {
    expect(classifyLineStochRsiOversoldCrossRegime(20, 20)).toBe('bullish');
    expect(classifyLineStochRsiOversoldCrossRegime(50, 20)).toBe('bullish');
  });

  it('stochK < threshold -> bearish', () => {
    expect(classifyLineStochRsiOversoldCrossRegime(19.99, 20)).toBe(
      'bearish',
    );
    expect(classifyLineStochRsiOversoldCrossRegime(0, 20)).toBe('bearish');
  });
});

describe('detectLineStochRsiOversoldCrossCrosses', () => {
  it('fires bullish (exit) when stochK crosses up through 20', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [5, 10, 15, 30, 40];
    const crosses = detectLineStochRsiOversoldCrossCrosses(series, v, 20);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish (entry) when stochK crosses down through 20', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [40, 30, 22, 10, 5];
    const crosses = detectLineStochRsiOversoldCrossCrosses(series, v, 20);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const v = [10, 30, 25, 10];
    const crosses = detectLineStochRsiOversoldCrossCrosses(series, v, 20);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineStochRsiOversoldCrossCrosses(series, [null, 10, 30], 20),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineStochRsiOversoldCrossCrosses(series, [10, null, 30], 20),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineStochRsiOversoldCrossCrosses(series, [10, 20], 20),
    ).toEqual([]);
  });

  it('no cross when stochK stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineStochRsiOversoldCrossCrosses(
        series,
        [60, 70, 80, 90],
        20,
      ),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineStochRsiOversoldCrossCrosses(series, [20, 25, 35], 30),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineStochRsiOversoldCross', () => {
  it('CONST K -> 0 crosses, all bullish (stochK=50 >= 20)', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineStochRsiOversoldCross(data, SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(7);
    expect(run.bullishCount).toBe(33);
    expect(run.bearishCount).toBe(0);
    expect(run.rsiLength).toBe(5);
    expect(run.stochLength).toBe(3);
  });

  it('LINEAR UP -> all bullish (stochK locked at 50)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineStochRsiOversoldCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(33);
  });

  it('LINEAR DOWN -> all bullish (stochK locked at 50)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineStochRsiOversoldCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(33);
  });

  it('rise then decline generates bearish (entry into oversold)', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const run = runLineStochRsiOversoldCross(mk(closes), SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('rise-decline-rise generates both bearish entry and bullish exit', () => {
    const closes: number[] = [];
    // Rise locks stochK at seed 50.
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    // Decline drops stochK to 0 -> bearish entry through 20.
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    // Rise jumps stochK back to 100 -> bullish exit through 20.
    for (let i = 40; i < 60; i += 1) closes.push(i - 39);
    const run = runLineStochRsiOversoldCross(mk(closes), SMALL);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineStochRsiOversoldCross(data, {
      ...SMALL,
      threshold: NaN,
    });
    expect(run.threshold).toBe(20);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(50));
    expect(
      runLineStochRsiOversoldCross(data, { ...SMALL, threshold: 30 })
        .threshold,
    ).toBe(30);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineStochRsiOversoldCross([], SMALL).ok).toBe(false);
    expect(
      runLineStochRsiOversoldCross(mk([1, 2, 3]), SMALL).ok,
    ).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStochRsiOversoldCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStochRsiOversoldCross(data, {
      rsiLength: 1,
      stochLength: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / rsi / stochK / regime', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineStochRsiOversoldCross(data, SMALL);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 7; i += 1) {
      expect(run.samples[i]!.stochK).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 7; i < 40; i += 1) {
      expect(run.samples[i]!.rsi).toBe(50);
      expect(run.samples[i]!.stochK).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineStochRsiOversoldCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineStochRsiOversoldCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.width).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_WIDTH,
    );
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_PANEL_GAP,
    );
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineStochRsiOversoldCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY at 20% of panel height (below midpoint)', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineStochRsiOversoldCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    // Threshold = 20 -> closer to oscBottom (low values plot near bottom).
    const midpoint = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.thresholdY).toBeGreaterThan(midpoint);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineStochRsiOversoldCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stochKPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineStochRsiOversoldCrossLayout({
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
    const layout = computeLineStochRsiOversoldCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.stochKPath.startsWith('M ')).toBe(true);
    const mCount = (layout.stochKPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineStochRsiOversoldCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const layout = computeLineStochRsiOversoldCrossLayout({
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

describe('describeLineStochRsiOversoldCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStochRsiOversoldCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineStochRsiOversoldCrossChart(data);
    expect(desc).toContain('Stoch RSI Oversold Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('rsiLength 14');
    expect(desc).toContain('stochLength 14');
    expect(desc).toContain('threshold 20');
  });
});

describe('ChartLineStochRsiOversoldCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineStochRsiOversoldCross data={data} {...SMALL} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Stoch RSI Oversold Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-rsi-oversold-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Stoch RSI Oversold Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOversoldCross data={data} {...SMALL} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-rsi-oversold-cross-badge"]',
    );
    expect(badge?.textContent).toContain('rsi 5');
    expect(badge?.textContent).toContain('stoch 3');
    expect(badge?.textContent).toContain('threshold 20');
  });

  it('renders legend toggles for price + stochk', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOversoldCross data={data} {...SMALL} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('stochk');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOversoldCross data={data} {...SMALL} />,
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
      <ChartLineStochRsiOversoldCross
        data={data}
        {...SMALL}
        hiddenSeries={['stochk']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-stochk-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineStochRsiOversoldCross
        data={data}
        {...SMALL}
        hiddenSeries={[]}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-stochk-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStochRsiOversoldCross
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
      <ChartLineStochRsiOversoldCross data={data} {...SMALL} />,
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
      <ChartLineStochRsiOversoldCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOversoldCross
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
      <ChartLineStochRsiOversoldCross data={data} {...SMALL} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOversoldCross data={data} {...SMALL} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stoch-rsi-oversold-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-stoch-rsi-oversold-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOversoldCross data={data} {...SMALL} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOversoldCross
        data={data}
        {...SMALL}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOversoldCross
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
        '[data-section="chart-line-stoch-rsi-oversold-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers after rise-then-decline pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const { container } = render(
      <ChartLineStochRsiOversoldCross data={mk(closes)} {...SMALL} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-stoch-rsi-oversold-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const { container } = render(
      <ChartLineStochRsiOversoldCross
        data={mk(closes)}
        {...SMALL}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const { container } = render(
      <ChartLineStochRsiOversoldCross
        data={mk(closes)}
        {...SMALL}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-oversold-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiOversoldCross data={data} {...SMALL} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-stoch-rsi-oversold-cross"]',
    );
    expect(region?.getAttribute('data-rsi-length')).toBe('5');
    expect(region?.getAttribute('data-stoch-length')).toBe('3');
    expect(region?.getAttribute('data-threshold')).toBe('20');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('33');
  });

  it('defaults: rsiLength=14, stochLength=14, threshold=20', () => {
    expect(DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_RSI_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_STOCH_LENGTH).toBe(
      14,
    );
    expect(DEFAULT_CHART_LINE_STOCH_RSI_OVERSOLD_CROSS_THRESHOLD).toBe(20);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineStochRsiOversoldCross
        data={data}
        {...SMALL}
        ref={ref}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stoch-rsi-oversold-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineStochRsiOversoldCrossLayout({ data, ...SMALL });
    const b = computeLineStochRsiOversoldCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stochKPath).toBe(b.stochKPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for rise-then-decline pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const data = mk(closes);
    const a = computeLineStochRsiOversoldCrossLayout({ data, ...SMALL });
    const b = computeLineStochRsiOversoldCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stochKPath).toBe(b.stochKPath);
    expect(a.run.stochKValues).toEqual(b.run.stochKValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
