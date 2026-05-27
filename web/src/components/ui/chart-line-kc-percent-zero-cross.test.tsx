import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineKcPercentZeroCross,
  DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_MULT,
  DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_WIDTH,
  applyLineKcPercentZeroCrossEma,
  classifyLineKcPercentZeroCrossRegime,
  computeLineKcPercentZeroCross,
  computeLineKcPercentZeroCrossLayout,
  describeLineKcPercentZeroCrossChart,
  detectLineKcPercentZeroCrossCrosses,
  getLineKcPercentZeroCrossFinitePoints,
  normalizeLineKcPercentZeroCrossLength,
  normalizeLineKcPercentZeroCrossMult,
  normalizeLineKcPercentZeroCrossThreshold,
  runLineKcPercentZeroCross,
  type ChartLineKcPercentZeroCrossPoint,
} from './chart-line-kc-percent-zero-cross';

const mk = (closes: number[]): ChartLineKcPercentZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const SMALL = { length: 5, mult: 2 };

describe('getLineKcPercentZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineKcPercentZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineKcPercentZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineKcPercentZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineKcPercentZeroCrossFinitePoints(
        'oops' as unknown as ChartLineKcPercentZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineKcPercentZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineKcPercentZeroCrossLength(20, 20)).toBe(20);
    expect(normalizeLineKcPercentZeroCrossLength(1, 20)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineKcPercentZeroCrossLength(7.9, 20)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineKcPercentZeroCrossLength(0, 20)).toBe(20);
    expect(normalizeLineKcPercentZeroCrossLength(-1, 20)).toBe(20);
    expect(normalizeLineKcPercentZeroCrossLength(NaN, 20)).toBe(20);
  });
});

describe('normalizeLineKcPercentZeroCrossMult', () => {
  it('keeps positive finite values', () => {
    expect(normalizeLineKcPercentZeroCrossMult(2, 2)).toBe(2);
    expect(normalizeLineKcPercentZeroCrossMult(1.5, 2)).toBe(1.5);
  });

  it('rejects non-positive', () => {
    expect(normalizeLineKcPercentZeroCrossMult(0, 2)).toBe(2);
    expect(normalizeLineKcPercentZeroCrossMult(-1, 2)).toBe(2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineKcPercentZeroCrossMult(NaN, 2)).toBe(2);
  });
});

describe('normalizeLineKcPercentZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineKcPercentZeroCrossThreshold(0.5, 0.5)).toBe(0.5);
    expect(normalizeLineKcPercentZeroCrossThreshold(0.8, 0.5)).toBe(0.8);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineKcPercentZeroCrossThreshold(NaN, 0.5)).toBe(0.5);
  });
});

describe('applyLineKcPercentZeroCrossEma', () => {
  it('CONST short-circuit -> constant from seed', () => {
    const out = applyLineKcPercentZeroCrossEma(
      new Array(10).fill(5),
      5,
      0,
    );
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
    for (let i = 4; i < 10; i += 1) expect(out[i]).toBe(5);
  });

  it('LINEAR ramp tracks with steady-state lag', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i);
    const out = applyLineKcPercentZeroCrossEma(closes, 5, 0);
    // SMA seed at i=4: avg(0..4) = 2 = i - 2.
    expect(out[4]).toBe(2);
    expect(out[5]).toBeCloseTo(3, 10);
    expect(out[6]).toBeCloseTo(4, 10);
  });

  it('null in seed window -> all null', () => {
    const out = applyLineKcPercentZeroCrossEma(
      [null, 1, null, 2, 3, 4, 5] as Array<number | null>,
      3,
      0,
    );
    expect(out).toEqual([null, null, null, null, null, null, null]);
  });

  it('length === 1 returns verbatim from firstValidIdx', () => {
    const out = applyLineKcPercentZeroCrossEma([null, 1, 2, 3], 1, 1);
    expect(out).toEqual([null, 1, 2, 3]);
  });
});

describe('computeLineKcPercentZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> percentk = 0.5 from index length onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { percentk } = computeLineKcPercentZeroCross(data, SMALL);
      // SMALL: length=5. middle valid at i=4, atr valid at i=5, so
      // percentk valid at i=5.
      for (let i = 0; i < 5; i += 1) {
        expect(percentk[i]).toBeNull();
      }
      for (let i = 5; i < 40; i += 1) {
        expect(percentk[i]).toBe(0.5);
      }
    },
  );
});

describe('computeLineKcPercentZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=5, mult=2) -> percentk = 1 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { percentk } = computeLineKcPercentZeroCross(data, SMALL);
    for (let i = 5; i < 40; i += 1) {
      expect(percentk[i]).toBeCloseTo(1, 10);
    }
  });

  it('LINEAR DOWN close=-i (length=5, mult=2) -> percentk = 0 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { percentk } = computeLineKcPercentZeroCross(data, SMALL);
    for (let i = 5; i < 40; i += 1) {
      expect(percentk[i]).toBeCloseTo(0, 10);
    }
  });

  it('LINEAR UP middle = i - (length-1)/2 at steady state', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { middle } = computeLineKcPercentZeroCross(data, SMALL);
    // SMA seed at i=4 -> middle = 2 = i - 2.
    expect(middle[4]).toBe(2);
    expect(middle[10]).toBeCloseTo(8, 10);
    expect(middle[19]).toBeCloseTo(17, 10);
  });

  it('LINEAR UP atr = 1 at steady state', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { atr } = computeLineKcPercentZeroCross(data, SMALL);
    for (let i = 5; i < 20; i += 1) {
      expect(atr[i]).toBe(1);
    }
  });

  it('percentk[i < length] is null', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { percentk } = computeLineKcPercentZeroCross(data, SMALL);
    for (let i = 0; i < 5; i += 1) {
      expect(percentk[i]).toBeNull();
    }
  });

  it('custom length=10, mult=1 works for CONST', () => {
    const data = mk(new Array(30).fill(50));
    const { percentk } = computeLineKcPercentZeroCross(data, {
      length: 10,
      mult: 1,
    });
    for (let i = 0; i < 10; i += 1) {
      expect(percentk[i]).toBeNull();
    }
    for (let i = 10; i < 30; i += 1) {
      expect(percentk[i]).toBe(0.5);
    }
  });

  it('all internal channels exposed (middle, atr, upper, lower, percentk)', () => {
    const data = mk(new Array(20).fill(50));
    const channels = computeLineKcPercentZeroCross(data, SMALL);
    expect(channels.middle).toHaveLength(20);
    expect(channels.atr).toHaveLength(20);
    expect(channels.upper).toHaveLength(20);
    expect(channels.lower).toHaveLength(20);
    expect(channels.percentk).toHaveLength(20);
  });
});

describe('classifyLineKcPercentZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineKcPercentZeroCrossRegime(null, 0.5)).toBe('none');
  });

  it('percentk at threshold boundary -> bullish', () => {
    expect(classifyLineKcPercentZeroCrossRegime(0.5, 0.5)).toBe('bullish');
    expect(classifyLineKcPercentZeroCrossRegime(0.9, 0.5)).toBe('bullish');
  });

  it('percentk < threshold -> bearish', () => {
    expect(classifyLineKcPercentZeroCrossRegime(0.49, 0.5)).toBe('bearish');
    expect(classifyLineKcPercentZeroCrossRegime(0, 0.5)).toBe('bearish');
  });
});

describe('detectLineKcPercentZeroCrossCrosses', () => {
  it('fires bullish when percentk crosses up through 0.5', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [0.2, 0.3, 0.4, 0.6, 0.7];
    const crosses = detectLineKcPercentZeroCrossCrosses(series, v, 0.5);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when percentk crosses down through 0.5', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [0.7, 0.6, 0.55, 0.4, 0.3];
    const crosses = detectLineKcPercentZeroCrossCrosses(series, v, 0.5);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const v = [0.3, 0.7, 0.6, 0.3];
    const crosses = detectLineKcPercentZeroCrossCrosses(series, v, 0.5);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineKcPercentZeroCrossCrosses(series, [null, 0.3, 0.7], 0.5),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineKcPercentZeroCrossCrosses(series, [0.3, null, 0.7], 0.5),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineKcPercentZeroCrossCrosses(series, [0.3, 0.5], 0.5),
    ).toEqual([]);
  });

  it('no cross when percentk stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineKcPercentZeroCrossCrosses(
        series,
        [0.1, 0.2, 0.3, 0.4],
        0.5,
      ),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineKcPercentZeroCrossCrosses(series, [0.6, 0.7, 0.85], 0.8),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineKcPercentZeroCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineKcPercentZeroCross(data, SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(5);
    expect(run.bullishCount).toBe(35);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(5);
    expect(run.mult).toBe(2);
  });

  it('LINEAR UP -> all bullish after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineKcPercentZeroCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(35);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineKcPercentZeroCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(35);
  });

  it('decline then rise generates bullish cross', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const run = runLineKcPercentZeroCross(mk(closes), SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish cross', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const run = runLineKcPercentZeroCross(mk(closes), SMALL);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineKcPercentZeroCross(data, {
      ...SMALL,
      threshold: NaN,
    });
    expect(run.threshold).toBe(0.5);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(50));
    expect(
      runLineKcPercentZeroCross(data, { ...SMALL, threshold: 0.7 }).threshold,
    ).toBe(0.7);
    expect(
      runLineKcPercentZeroCross(data, { ...SMALL, threshold: 0.3 }).threshold,
    ).toBe(0.3);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineKcPercentZeroCross([], SMALL).ok).toBe(false);
    expect(runLineKcPercentZeroCross(mk([1, 2, 3]), SMALL).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineKcPercentZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineKcPercentZeroCross(data, { length: 1, mult: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / percentk / regime', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineKcPercentZeroCross(data, SMALL);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 5; i += 1) {
      expect(run.samples[i]!.percentk).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 5; i < 40; i += 1) {
      expect(run.samples[i]!.percentk).toBe(0.5);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineKcPercentZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_PANEL_GAP,
    );
  });

  it('thresholdY between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const layout = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineKcPercentZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.percentkPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range includes [0, 1] envelope plus padding', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(1);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const layout = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('percentk path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const layout = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.percentkPath.startsWith('M ')).toBe(true);
    const mCount = (layout.percentkPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const layout = computeLineKcPercentZeroCrossLayout({
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

describe('describeLineKcPercentZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineKcPercentZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineKcPercentZeroCrossChart(data);
    expect(desc).toContain('KC Percent K Zero Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('mult 2');
    expect(desc).toContain('threshold 0.5');
  });
});

describe('ChartLineKcPercentZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineKcPercentZeroCross data={data} {...SMALL} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'KC Percent K Zero Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-kc-percent-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('KC Percent K Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross data={data} {...SMALL} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-kc-percent-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 5');
    expect(badge?.textContent).toContain('mult 2');
    expect(badge?.textContent).toContain('threshold 0.5');
  });

  it('renders legend toggles for price + percentk', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross data={data} {...SMALL} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('percentk');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector('[data-series-id="percentk"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineKcPercentZeroCross
        data={data}
        {...SMALL}
        hiddenSeries={['percentk']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-percentk-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineKcPercentZeroCross
        data={data}
        {...SMALL}
        hiddenSeries={[]}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-percentk-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineKcPercentZeroCross
        data={data}
        {...SMALL}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="percentk"]')!);
    expect(events).toEqual([{ seriesId: 'percentk', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector(
      '[data-series-id="percentk"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineKcPercentZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross
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
      <ChartLineKcPercentZeroCross data={data} {...SMALL} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross data={data} {...SMALL} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-kc-percent-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-kc-percent-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross data={data} {...SMALL} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross
        data={data}
        {...SMALL}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross
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
        '[data-section="chart-line-kc-percent-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineKcPercentZeroCross data={mk(closes)} {...SMALL} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-kc-percent-zero-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineKcPercentZeroCross
        data={mk(closes)}
        {...SMALL}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineKcPercentZeroCross
        data={mk(closes)}
        {...SMALL}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineKcPercentZeroCross data={data} {...SMALL} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-kc-percent-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('5');
    expect(region?.getAttribute('data-mult')).toBe('2');
    expect(region?.getAttribute('data-threshold')).toBe('0.5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('35');
  });

  it('defaults: length=20, mult=2, threshold=0.5', () => {
    expect(DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_MULT).toBe(2);
    expect(DEFAULT_CHART_LINE_KC_PERCENT_ZERO_CROSS_THRESHOLD).toBe(0.5);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineKcPercentZeroCross data={data} {...SMALL} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-kc-percent-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    const b = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.percentkPath).toBe(b.percentkPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for decline-then-rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const data = mk(closes);
    const a = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    const b = computeLineKcPercentZeroCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.percentkPath).toBe(b.percentkPath);
    expect(a.run.percentkValues).toEqual(b.run.percentkValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
