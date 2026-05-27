import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineBbPercentZeroCross,
  DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_MULT,
  DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_WIDTH,
  applyLineBbPercentZeroCrossBands,
  classifyLineBbPercentZeroCrossRegime,
  computeLineBbPercentZeroCross,
  computeLineBbPercentZeroCrossLayout,
  describeLineBbPercentZeroCrossChart,
  detectLineBbPercentZeroCrossCrosses,
  getLineBbPercentZeroCrossFinitePoints,
  normalizeLineBbPercentZeroCrossLength,
  normalizeLineBbPercentZeroCrossMult,
  normalizeLineBbPercentZeroCrossThreshold,
  runLineBbPercentZeroCross,
  type ChartLineBbPercentZeroCrossPoint,
} from './chart-line-bb-percent-zero-cross';

const mk = (closes: number[]): ChartLineBbPercentZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const SMALL = { length: 5, mult: 2 };

describe('getLineBbPercentZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineBbPercentZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineBbPercentZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineBbPercentZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineBbPercentZeroCrossFinitePoints(
        'oops' as unknown as ChartLineBbPercentZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineBbPercentZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineBbPercentZeroCrossLength(20, 20)).toBe(20);
    expect(normalizeLineBbPercentZeroCrossLength(1, 20)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineBbPercentZeroCrossLength(7.9, 20)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineBbPercentZeroCrossLength(0, 20)).toBe(20);
    expect(normalizeLineBbPercentZeroCrossLength(-1, 20)).toBe(20);
    expect(normalizeLineBbPercentZeroCrossLength(NaN, 20)).toBe(20);
  });
});

describe('normalizeLineBbPercentZeroCrossMult', () => {
  it('keeps positive finite values', () => {
    expect(normalizeLineBbPercentZeroCrossMult(2, 2)).toBe(2);
    expect(normalizeLineBbPercentZeroCrossMult(2.5, 2)).toBe(2.5);
  });

  it('rejects non-positive', () => {
    expect(normalizeLineBbPercentZeroCrossMult(0, 2)).toBe(2);
    expect(normalizeLineBbPercentZeroCrossMult(-1, 2)).toBe(2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineBbPercentZeroCrossMult(NaN, 2)).toBe(2);
  });
});

describe('normalizeLineBbPercentZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineBbPercentZeroCrossThreshold(0.5, 0.5)).toBe(0.5);
    expect(normalizeLineBbPercentZeroCrossThreshold(0.8, 0.5)).toBe(0.8);
    expect(normalizeLineBbPercentZeroCrossThreshold(0, 0.5)).toBe(0);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineBbPercentZeroCrossThreshold(NaN, 0.5)).toBe(0.5);
  });
});

describe('applyLineBbPercentZeroCrossBands', () => {
  it('CONST values -> middle = K, stdev = 0, upper == lower == K', () => {
    const out = applyLineBbPercentZeroCrossBands(new Array(10).fill(7), 5, 2);
    for (let i = 0; i < 4; i += 1) {
      expect(out.middle[i]).toBeNull();
    }
    for (let i = 4; i < 10; i += 1) {
      expect(out.middle[i]).toBe(7);
      expect(out.stdev[i]).toBe(0);
      expect(out.upper[i]).toBe(7);
      expect(out.lower[i]).toBe(7);
    }
  });

  it('LINEAR UP -> middle, stdev follow arithmetic formulas', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i);
    const out = applyLineBbPercentZeroCrossBands(closes, 5, 2);
    // window [0..4]: mean = 2, var = (4+1+0+1+4)/5 = 2, stdev = sqrt(2)
    expect(out.middle[4]).toBeCloseTo(2, 10);
    expect(out.stdev[4]).toBeCloseTo(Math.sqrt(2), 10);
  });
});

describe('computeLineBbPercentZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> percentb = 0.5 from index length-1 onward',
    (K) => {
      const data = mk(new Array(20).fill(K));
      const { percentb } = computeLineBbPercentZeroCross(data, SMALL);
      for (let i = 0; i < 4; i += 1) {
        expect(percentb[i]).toBeNull();
      }
      for (let i = 4; i < 20; i += 1) {
        expect(percentb[i]).toBe(0.5);
      }
    },
  );
});

describe('computeLineBbPercentZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> percentb constant > 0.5 (bullish)', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { percentb } = computeLineBbPercentZeroCross(data, SMALL);
    // close - middle = 2 (= (length-1)/2 for length=5).
    // stdev = sqrt(2). offset = 2 / (4 * sqrt(2)) = sqrt(2)/4.
    // percentb = 0.5 + sqrt(2)/4 ~ 0.8536.
    const expected = 0.5 + Math.sqrt(2) / 4;
    for (let i = 4; i < 20; i += 1) {
      expect(percentb[i]).toBeCloseTo(expected, 10);
    }
    expect(expected).toBeGreaterThan(0.5);
  });

  it('LINEAR DOWN close=-i -> percentb constant < 0.5 (bearish)', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => -i));
    const { percentb } = computeLineBbPercentZeroCross(data, SMALL);
    const expected = 0.5 - Math.sqrt(2) / 4;
    for (let i = 4; i < 20; i += 1) {
      expect(percentb[i]).toBeCloseTo(expected, 10);
    }
    expect(expected).toBeLessThan(0.5);
  });

  it('percentb[i < length-1] is null', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { percentb } = computeLineBbPercentZeroCross(data, SMALL);
    for (let i = 0; i < 4; i += 1) {
      expect(percentb[i]).toBeNull();
    }
  });

  it('custom length=10, mult=1 works', () => {
    const data = mk(new Array(30).fill(50));
    const { percentb } = computeLineBbPercentZeroCross(data, {
      length: 10,
      mult: 1,
    });
    for (let i = 0; i < 9; i += 1) {
      expect(percentb[i]).toBeNull();
    }
    for (let i = 9; i < 30; i += 1) {
      expect(percentb[i]).toBe(0.5);
    }
  });

  it('middle / upper / lower / percentb channels all exposed', () => {
    const data = mk(new Array(20).fill(50));
    const channels = computeLineBbPercentZeroCross(data, SMALL);
    expect(channels.middle).toHaveLength(20);
    expect(channels.upper).toHaveLength(20);
    expect(channels.lower).toHaveLength(20);
    expect(channels.percentb).toHaveLength(20);
  });
});

describe('classifyLineBbPercentZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineBbPercentZeroCrossRegime(null, 0.5)).toBe('none');
  });

  it('percentb at threshold boundary -> bullish', () => {
    expect(classifyLineBbPercentZeroCrossRegime(0.5, 0.5)).toBe('bullish');
    expect(classifyLineBbPercentZeroCrossRegime(0.8, 0.5)).toBe('bullish');
  });

  it('percentb < threshold -> bearish', () => {
    expect(classifyLineBbPercentZeroCrossRegime(0.49, 0.5)).toBe('bearish');
    expect(classifyLineBbPercentZeroCrossRegime(0, 0.5)).toBe('bearish');
  });
});

describe('detectLineBbPercentZeroCrossCrosses', () => {
  it('fires bullish when percentb crosses up through 0.5', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [0.2, 0.3, 0.4, 0.6, 0.7];
    const crosses = detectLineBbPercentZeroCrossCrosses(series, v, 0.5);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when percentb crosses down through 0.5', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [0.7, 0.6, 0.55, 0.4, 0.3];
    const crosses = detectLineBbPercentZeroCrossCrosses(series, v, 0.5);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const v = [0.3, 0.7, 0.6, 0.3];
    const crosses = detectLineBbPercentZeroCrossCrosses(series, v, 0.5);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineBbPercentZeroCrossCrosses(series, [null, 0.3, 0.7], 0.5),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineBbPercentZeroCrossCrosses(series, [0.3, null, 0.7], 0.5),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineBbPercentZeroCrossCrosses(series, [0.3, 0.5], 0.5),
    ).toEqual([]);
  });

  it('no cross when percentb stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineBbPercentZeroCrossCrosses(
        series,
        [0.1, 0.2, 0.3, 0.4],
        0.5,
      ),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineBbPercentZeroCrossCrosses(series, [0.6, 0.7, 0.85], 0.8),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineBbPercentZeroCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mk(new Array(20).fill(50));
    const run = runLineBbPercentZeroCross(data, SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(4);
    expect(run.bullishCount).toBe(16);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(5);
    expect(run.mult).toBe(2);
  });

  it('LINEAR UP -> all bullish after warmup', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const run = runLineBbPercentZeroCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(16);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => -i));
    const run = runLineBbPercentZeroCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(16);
  });

  it('decline then rise generates bullish cross', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const run = runLineBbPercentZeroCross(mk(closes), SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish cross', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const run = runLineBbPercentZeroCross(mk(closes), SMALL);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(20).fill(50));
    const run = runLineBbPercentZeroCross(data, {
      ...SMALL,
      threshold: NaN,
    });
    expect(run.threshold).toBe(0.5);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(20).fill(50));
    expect(
      runLineBbPercentZeroCross(data, { ...SMALL, threshold: 0.7 }).threshold,
    ).toBe(0.7);
    expect(
      runLineBbPercentZeroCross(data, { ...SMALL, threshold: 0.3 }).threshold,
    ).toBe(0.3);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineBbPercentZeroCross([], SMALL).ok).toBe(false);
    expect(runLineBbPercentZeroCross(mk([1, 2, 3]), SMALL).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineBbPercentZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineBbPercentZeroCross(data, { length: 1, mult: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / percentb / regime', () => {
    const data = mk(new Array(20).fill(50));
    const run = runLineBbPercentZeroCross(data, SMALL);
    expect(run.samples).toHaveLength(20);
    for (let i = 0; i < 4; i += 1) {
      expect(run.samples[i]!.percentb).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 4; i < 20; i += 1) {
      expect(run.samples[i]!.percentb).toBe(0.5);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineBbPercentZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(20).fill(50));
    const layout = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PANEL_GAP,
    );
  });

  it('thresholdY between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const layout = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineBbPercentZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.percentbPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range includes [0, 1] envelope plus padding', () => {
    const data = mk(new Array(20).fill(50));
    const layout = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(1);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const layout = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('percentb path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const layout = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.percentbPath.startsWith('M ')).toBe(true);
    const mCount = (layout.percentbPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(20).fill(7));
    const layout = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const layout = computeLineBbPercentZeroCrossLayout({
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

describe('describeLineBbPercentZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineBbPercentZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(20).fill(50));
    const desc = describeLineBbPercentZeroCrossChart(data);
    expect(desc).toContain('BB Percent B Zero Cross chart');
    expect(desc).toContain('20 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('mult 2');
    expect(desc).toContain('threshold 0.5');
  });
});

describe('ChartLineBbPercentZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(20).fill(10));
    const { container, getByRole } = render(
      <ChartLineBbPercentZeroCross data={data} {...SMALL} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'BB Percent B Zero Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-bb-percent-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('BB Percent B Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross data={data} {...SMALL} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-bb-percent-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 5');
    expect(badge?.textContent).toContain('mult 2');
    expect(badge?.textContent).toContain('threshold 0.5');
  });

  it('renders legend toggles for price + percentb', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross data={data} {...SMALL} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('percentb');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector('[data-series-id="percentb"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(20).fill(10));
    const { container, rerender } = render(
      <ChartLineBbPercentZeroCross
        data={data}
        {...SMALL}
        hiddenSeries={['percentb']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-percentb-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineBbPercentZeroCross
        data={data}
        {...SMALL}
        hiddenSeries={[]}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-percentb-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(20).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineBbPercentZeroCross
        data={data}
        {...SMALL}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="percentb"]')!);
    expect(events).toEqual([{ seriesId: 'percentb', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector(
      '[data-series-id="percentb"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineBbPercentZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross
        data={data}
        {...SMALL}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross data={data} {...SMALL} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross data={data} {...SMALL} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-bb-percent-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-bb-percent-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross data={data} {...SMALL} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross
        data={data}
        {...SMALL}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross
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
        '[data-section="chart-line-bb-percent-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineBbPercentZeroCross data={mk(closes)} {...SMALL} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-bb-percent-zero-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineBbPercentZeroCross
        data={mk(closes)}
        {...SMALL}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineBbPercentZeroCross
        data={mk(closes)}
        {...SMALL}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(20).fill(10));
    const { container } = render(
      <ChartLineBbPercentZeroCross data={data} {...SMALL} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-bb-percent-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('5');
    expect(region?.getAttribute('data-mult')).toBe('2');
    expect(region?.getAttribute('data-threshold')).toBe('0.5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('16');
  });

  it('defaults: length=20, mult=2, threshold=0.5', () => {
    expect(DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_MULT).toBe(2);
    expect(DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_THRESHOLD).toBe(0.5);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(20).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineBbPercentZeroCross data={data} {...SMALL} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-bb-percent-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 20 bars', () => {
    const data = mk(new Array(20).fill(10));
    const a = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    const b = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.percentbPath).toBe(b.percentbPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for decline-then-rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const data = mk(closes);
    const a = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    const b = computeLineBbPercentZeroCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.percentbPath).toBe(b.percentbPath);
    expect(a.run.percentbValues).toEqual(b.run.percentbValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
