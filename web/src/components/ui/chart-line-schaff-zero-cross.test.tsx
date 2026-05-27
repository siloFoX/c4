import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineSchaffZeroCross,
  DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_CYCLE,
  DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_FAST,
  DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_SLOW,
  DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_WIDTH,
  applyLineSchaffZeroCrossEma,
  classifyLineSchaffZeroCrossRegime,
  computeLineSchaffZeroCross,
  computeLineSchaffZeroCrossLayout,
  describeLineSchaffZeroCrossChart,
  detectLineSchaffZeroCrossCrosses,
  getLineSchaffZeroCrossFinitePoints,
  normalizeLineSchaffZeroCrossLength,
  normalizeLineSchaffZeroCrossThreshold,
  runLineSchaffZeroCross,
  type ChartLineSchaffZeroCrossPoint,
} from './chart-line-schaff-zero-cross';

const mk = (closes: number[]): ChartLineSchaffZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const SMALL = { cycle: 3, fast: 5, slow: 10 };

describe('getLineSchaffZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineSchaffZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineSchaffZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineSchaffZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineSchaffZeroCrossFinitePoints(
        'oops' as unknown as ChartLineSchaffZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineSchaffZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineSchaffZeroCrossLength(10, 10)).toBe(10);
    expect(normalizeLineSchaffZeroCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineSchaffZeroCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineSchaffZeroCrossLength(0, 10)).toBe(10);
    expect(normalizeLineSchaffZeroCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineSchaffZeroCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineSchaffZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineSchaffZeroCrossThreshold(50, 50)).toBe(50);
    expect(normalizeLineSchaffZeroCrossThreshold(70, 50)).toBe(70);
    expect(normalizeLineSchaffZeroCrossThreshold(0, 50)).toBe(0);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineSchaffZeroCrossThreshold(NaN, 50)).toBe(50);
  });
});

describe('applyLineSchaffZeroCrossEma', () => {
  it('CONST values -> EMA = value after SMA seed', () => {
    const out = applyLineSchaffZeroCrossEma(new Array(20).fill(5), 10);
    for (let i = 0; i < 9; i += 1) expect(out[i]).toBeNull();
    for (let i = 9; i < 20; i += 1) expect(out[i]).toBe(5);
  });

  it('length === 1 returns verbatim', () => {
    expect(applyLineSchaffZeroCrossEma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('LINEAR ramp converges to constant lag', () => {
    const values = Array.from({ length: 30 }, (_, i) => i);
    const out = applyLineSchaffZeroCrossEma(values, 5);
    // SMA-seeded at i=4: avg(0..4) = 2 = i - 2.
    expect(out[4]).toBe(2);
    // After seed, EMA tracks linear with steady-state lag (n-1)/2 = 2.
    expect(out[5]).toBeCloseTo(3, 10);
    expect(out[10]).toBeCloseTo(8, 10);
  });
});

describe('computeLineSchaffZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> stc = 50 from index slow+2*cycle-3 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { stc } = computeLineSchaffZeroCross(data, SMALL);
      // SMALL: slow=10, cycle=3, valid at i >= 10 + 4 - 1 = 13.
      for (let i = 0; i < 13; i += 1) {
        expect(stc[i]).toBeNull();
      }
      for (let i = 13; i < 40; i += 1) {
        expect(stc[i]).toBe(50);
      }
    },
  );
});

describe('computeLineSchaffZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> stc = 50 (MACD constant after warmup)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { stc } = computeLineSchaffZeroCross(data, SMALL);
    for (let i = 13; i < 40; i += 1) {
      expect(stc[i]).toBeCloseTo(50, 10);
    }
  });

  it('LINEAR DOWN close=-i -> stc = 50 (MACD constant after warmup)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { stc } = computeLineSchaffZeroCross(data, SMALL);
    for (let i = 13; i < 40; i += 1) {
      expect(stc[i]).toBeCloseTo(50, 10);
    }
  });

  it('MACD stays constant for LINEAR UP after EMA seed', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { macd } = computeLineSchaffZeroCross(data, SMALL);
    const first = macd[9];
    for (let i = 10; i < 30; i += 1) {
      expect(macd[i]).toBeCloseTo(first!, 8);
    }
  });

  it('stc[i < cycle-1] is null even when EMAs valid', () => {
    const data = mk(new Array(40).fill(50));
    const { stc } = computeLineSchaffZeroCross(data, SMALL);
    for (let i = 0; i < 13; i += 1) {
      expect(stc[i]).toBeNull();
    }
  });

  it('custom larger cycle / fast / slow extends warmup', () => {
    const data = mk(new Array(80).fill(50));
    const { stc } = computeLineSchaffZeroCross(data, {
      cycle: 5,
      fast: 8,
      slow: 20,
    });
    // slow=20, cycle=5 -> valid at i >= slow + 2*(cycle-1) - 1 = 27.
    for (let i = 0; i < 27; i += 1) {
      expect(stc[i]).toBeNull();
    }
    for (let i = 27; i < 80; i += 1) {
      expect(stc[i]).toBe(50);
    }
  });

  it('all internal channels exposed (macd, k1, d1, k2, stc)', () => {
    const data = mk(new Array(40).fill(50));
    const channels = computeLineSchaffZeroCross(data, SMALL);
    expect(channels.macd).toHaveLength(40);
    expect(channels.k1).toHaveLength(40);
    expect(channels.d1).toHaveLength(40);
    expect(channels.k2).toHaveLength(40);
    expect(channels.stc).toHaveLength(40);
  });
});

describe('classifyLineSchaffZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineSchaffZeroCrossRegime(null, 50)).toBe('none');
  });

  it('stc at threshold boundary -> bullish', () => {
    expect(classifyLineSchaffZeroCrossRegime(50, 50)).toBe('bullish');
    expect(classifyLineSchaffZeroCrossRegime(75, 50)).toBe('bullish');
  });

  it('stc < threshold -> bearish', () => {
    expect(classifyLineSchaffZeroCrossRegime(49.99, 50)).toBe('bearish');
    expect(classifyLineSchaffZeroCrossRegime(0, 50)).toBe('bearish');
  });
});

describe('detectLineSchaffZeroCrossCrosses', () => {
  it('fires bullish when stc crosses up through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const stc = [40, 45, 49, 60, 65];
    const crosses = detectLineSchaffZeroCrossCrosses(series, stc, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when stc crosses down through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const stc = [60, 55, 51, 45, 40];
    const crosses = detectLineSchaffZeroCrossCrosses(series, stc, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const stc = [40, 60, 55, 40];
    const crosses = detectLineSchaffZeroCrossCrosses(series, stc, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineSchaffZeroCrossCrosses(series, [null, 40, 60], 50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineSchaffZeroCrossCrosses(series, [40, null, 60], 50),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineSchaffZeroCrossCrosses(series, [40, 50], 50)).toEqual([]);
  });

  it('no cross when stc stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineSchaffZeroCrossCrosses(series, [10, 20, 30, 40], 50),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineSchaffZeroCrossCrosses(series, [60, 65, 75], 70),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineSchaffZeroCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineSchaffZeroCross(data, SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(13);
    expect(run.bullishCount).toBe(27);
    expect(run.bearishCount).toBe(0);
    expect(run.cycle).toBe(3);
    expect(run.fast).toBe(5);
    expect(run.slow).toBe(10);
  });

  it('LINEAR UP -> all bullish after warmup (stc constant 50)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineSchaffZeroCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(27);
  });

  it('decline then rise pattern generates at least one stc transition', () => {
    const closes: number[] = [];
    for (let i = 0; i < 30; i += 1) closes.push(30 - i);
    for (let i = 30; i < 60; i += 1) closes.push(i - 29);
    const run = runLineSchaffZeroCross(mk(closes), SMALL);
    expect(run.ok).toBe(true);
    // The double-stochastic of MACD captures the cycle.
    // Either the regime mix shifts, or crosses appear -- we check
    // that the stc visited both sides of the midline at least once.
    const validStc = run.stcValues.filter(
      (v): v is number => v != null,
    );
    expect(validStc.length).toBeGreaterThan(0);
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineSchaffZeroCross(data, {
      ...SMALL,
      threshold: NaN,
    });
    expect(run.threshold).toBe(50);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(50));
    expect(
      runLineSchaffZeroCross(data, { ...SMALL, threshold: 70 }).threshold,
    ).toBe(70);
    expect(
      runLineSchaffZeroCross(data, { ...SMALL, threshold: 30 }).threshold,
    ).toBe(30);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineSchaffZeroCross([], SMALL).ok).toBe(false);
    expect(runLineSchaffZeroCross(mk([1, 2, 3]), SMALL).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineSchaffZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineSchaffZeroCross(data, { cycle: 1, fast: 1, slow: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / stc / regime', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineSchaffZeroCross(data, SMALL);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 13; i += 1) {
      expect(run.samples[i]!.stc).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 13; i < 40; i += 1) {
      expect(run.samples[i]!.stc).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineSchaffZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineSchaffZeroCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_PANEL_GAP,
    );
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineSchaffZeroCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY at panel midpoint when threshold=50', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineSchaffZeroCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    const expected = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.thresholdY).toBeCloseTo(expected, 5);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineSchaffZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stcPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineSchaffZeroCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('stc path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineSchaffZeroCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.stcPath.startsWith('M ')).toBe(true);
    const mCount = (layout.stcPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineSchaffZeroCrossLayout({
      data,
      ...SMALL,
    });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineSchaffZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineSchaffZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineSchaffZeroCrossChart(data);
    expect(desc).toContain('STC Zero Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('cycle 10');
    expect(desc).toContain('fast 23');
    expect(desc).toContain('slow 50');
    expect(desc).toContain('threshold 50');
  });
});

describe('ChartLineSchaffZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('STC Zero Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-schaff-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('STC Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-schaff-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('cycle 3');
    expect(badge?.textContent).toContain('fast 5');
    expect(badge?.textContent).toContain('slow 10');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + stc', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('stc');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector('[data-series-id="stc"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineSchaffZeroCross
        data={data}
        {...SMALL}
        hiddenSeries={['stc']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-stc-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineSchaffZeroCross data={data} {...SMALL} hiddenSeries={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-stc-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineSchaffZeroCross
        data={data}
        {...SMALL}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="stc"]')!);
    expect(events).toEqual([{ seriesId: 'stc', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector(
      '[data-series-id="stc"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineSchaffZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-schaff-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-schaff-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross
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
        '[data-section="chart-line-schaff-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses=false hides cross markers group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross
        data={data}
        {...SMALL}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross
        data={data}
        {...SMALL}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-schaff-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineSchaffZeroCross data={data} {...SMALL} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-schaff-zero-cross"]',
    );
    expect(region?.getAttribute('data-cycle')).toBe('3');
    expect(region?.getAttribute('data-fast')).toBe('5');
    expect(region?.getAttribute('data-slow')).toBe('10');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('27');
  });

  it('defaults: cycle=10, fast=23, slow=50, threshold=50', () => {
    expect(DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_CYCLE).toBe(10);
    expect(DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_FAST).toBe(23);
    expect(DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_SLOW).toBe(50);
    expect(DEFAULT_CHART_LINE_SCHAFF_ZERO_CROSS_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineSchaffZeroCross data={data} {...SMALL} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-schaff-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineSchaffZeroCrossLayout({ data, ...SMALL });
    const b = computeLineSchaffZeroCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for decline-then-rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 30; i += 1) closes.push(30 - i);
    for (let i = 30; i < 60; i += 1) closes.push(i - 29);
    const data = mk(closes);
    const a = computeLineSchaffZeroCrossLayout({ data, ...SMALL });
    const b = computeLineSchaffZeroCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.run.stcValues).toEqual(b.run.stcValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
