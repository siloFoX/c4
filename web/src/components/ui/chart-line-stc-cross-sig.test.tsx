import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStcCrossSig,
  DEFAULT_CHART_LINE_STC_CROSS_SIG_CYCLE_LENGTH,
  DEFAULT_CHART_LINE_STC_CROSS_SIG_FACTOR,
  DEFAULT_CHART_LINE_STC_CROSS_SIG_FAST_LENGTH,
  DEFAULT_CHART_LINE_STC_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_STC_CROSS_SIG_K_SMOOTHING,
  DEFAULT_CHART_LINE_STC_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_STC_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_STC_CROSS_SIG_SLOW_LENGTH,
  DEFAULT_CHART_LINE_STC_CROSS_SIG_WIDTH,
  applyLineStcCrossSigEma,
  applyLineStcCrossSigSma,
  applyLineStcCrossSigStochastic,
  classifyLineStcCrossSigRegime,
  computeLineStcCrossSig,
  computeLineStcCrossSigLayout,
  describeLineStcCrossSigChart,
  detectLineStcCrossSigCrosses,
  getLineStcCrossSigFinitePoints,
  normalizeLineStcCrossSigFactor,
  normalizeLineStcCrossSigLength,
  runLineStcCrossSig,
  type ChartLineStcCrossSigPoint,
} from './chart-line-stc-cross-sig';

const mk = (closes: number[]): ChartLineStcCrossSigPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineStcCrossSigFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
    ];
    expect(getLineStcCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineStcCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineStcCrossSigFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineStcCrossSigLength', () => {
  it('keeps integers >= 1', () => {
    expect(normalizeLineStcCrossSigLength(23, 23)).toBe(23);
    expect(normalizeLineStcCrossSigLength(1, 23)).toBe(1);
  });

  it('falls back on invalid', () => {
    expect(normalizeLineStcCrossSigLength(0, 23)).toBe(23);
    expect(normalizeLineStcCrossSigLength(NaN, 23)).toBe(23);
  });
});

describe('normalizeLineStcCrossSigFactor', () => {
  it('keeps factors in (0, 1]', () => {
    expect(normalizeLineStcCrossSigFactor(0.5, 0.5)).toBe(0.5);
    expect(normalizeLineStcCrossSigFactor(1, 0.5)).toBe(1);
  });

  it('falls back on out-of-range', () => {
    expect(normalizeLineStcCrossSigFactor(0, 0.5)).toBe(0.5);
    expect(normalizeLineStcCrossSigFactor(2, 0.5)).toBe(0.5);
  });
});

describe('applyLineStcCrossSigSma', () => {
  it('CONST -> SMA = value', () => {
    const out = applyLineStcCrossSigSma(new Array(10).fill(42), 3);
    for (let i = 2; i < 10; i += 1) expect(out[i]).toBe(42);
  });
});

describe('applyLineStcCrossSigStochastic', () => {
  it('CONST -> degenerate stoch = 50', () => {
    const out = applyLineStcCrossSigStochastic(new Array(15).fill(42), 10);
    for (let i = 9; i < 15; i += 1) expect(out[i]).toBe(50);
  });
});

describe('applyLineStcCrossSigEma', () => {
  it('CONST -> EMA = value', () => {
    const out = applyLineStcCrossSigEma(new Array(10).fill(50), 0.5);
    for (let i = 0; i < 10; i += 1) expect(out[i]).toBe(50);
  });
});

describe('computeLineStcCrossSig - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> macd=0, stc=50, signal=50',
    (K) => {
      const data = mk(new Array(80).fill(K));
      const { macd, stc, signal } = computeLineStcCrossSig(data);
      for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(0);
      for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
      for (let i = 69; i < 80; i += 1) expect(signal[i]).toBe(50);
    },
  );
});

describe('computeLineStcCrossSig - LINEAR ramps', () => {
  it('LINEAR UP -> macd=13.5, stc=50, signal=50', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const { macd, stc, signal } = computeLineStcCrossSig(data);
    for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(13.5);
    for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
    for (let i = 69; i < 80; i += 1) expect(signal[i]).toBe(50);
  });

  it('LINEAR DOWN -> macd=-13.5, stc=50, signal=50', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const { macd, stc, signal } = computeLineStcCrossSig(data);
    for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(-13.5);
    for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
    for (let i = 69; i < 80; i += 1) expect(signal[i]).toBe(50);
  });
});

describe('classifyLineStcCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStcCrossSigRegime(null, 50)).toBe('none');
    expect(classifyLineStcCrossSigRegime(50, null)).toBe('none');
  });

  it('stc >= signal -> bullish (boundary inclusive)', () => {
    expect(classifyLineStcCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineStcCrossSigRegime(60, 50)).toBe('bullish');
  });

  it('stc < signal -> bearish', () => {
    expect(classifyLineStcCrossSigRegime(40, 50)).toBe('bearish');
  });
});

describe('detectLineStcCrossSigCrosses', () => {
  const series = mk([1, 2, 3, 4]);

  it('fires bullish when stc crosses up through signal', () => {
    const stc = [40, 45, 48, 60];
    const sig = [50, 50, 50, 50];
    expect(detectLineStcCrossSigCrosses(series, stc, sig)).toEqual([
      { index: 3, x: 3, kind: 'bullish' },
    ]);
  });

  it('fires bearish when stc crosses down through signal', () => {
    const stc = [60, 55, 52, 40];
    const sig = [50, 50, 50, 50];
    expect(detectLineStcCrossSigCrosses(series, stc, sig)).toEqual([
      { index: 3, x: 3, kind: 'bearish' },
    ]);
  });

  it('boundary equality not crossed', () => {
    const two = mk([1, 2]);
    expect(
      detectLineStcCrossSigCrosses(two, [40, 50], [50, 50]),
    ).toEqual([]);
  });

  it('skips when any value is null', () => {
    const two = mk([1, 2]);
    expect(
      detectLineStcCrossSigCrosses(two, [null, 60], [50, 50]),
    ).toEqual([]);
    expect(
      detectLineStcCrossSigCrosses(two, [60, null], [50, 50]),
    ).toEqual([]);
    expect(
      detectLineStcCrossSigCrosses(two, [60, 60], [null, 50]),
    ).toEqual([]);
  });

  it('no cross on one-sided', () => {
    expect(
      detectLineStcCrossSigCrosses(
        series,
        [40, 42, 45, 48],
        [50, 50, 50, 50],
      ),
    ).toEqual([]);
  });
});

describe('runLineStcCrossSig', () => {
  it('CONST K -> 0 crosses, bullishCount=11 (80 bars - 69 warmup)', () => {
    const data = mk(new Array(80).fill(50));
    const run = runLineStcCrossSig(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(69);
    expect(run.bullishCount).toBe(11);
    expect(run.bearishCount).toBe(0);
    expect(run.fastLength).toBe(23);
    expect(run.slowLength).toBe(50);
    expect(run.cycleLength).toBe(10);
    expect(run.factor).toBe(0.5);
    expect(run.kSmoothing).toBe(3);
  });

  it('LINEAR UP 80 -> bullish, 0 crosses', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const run = runLineStcCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(11);
  });

  it('LINEAR DOWN 80 -> bullish, 0 crosses', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const run = runLineStcCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(11);
  });

  it('respects custom params', () => {
    const data = mk(new Array(80).fill(50));
    expect(
      runLineStcCrossSig(data, { kSmoothing: 5 }).kSmoothing,
    ).toBe(5);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineStcCrossSig([]).ok).toBe(false);
    expect(runLineStcCrossSig(mk([1, 2])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStcCrossSigPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStcCrossSig(data, {
      fastLength: 1,
      slowLength: 1,
      cycleLength: 1,
      kSmoothing: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry stc / signal / regime', () => {
    const data = mk(new Array(80).fill(50));
    const run = runLineStcCrossSig(data);
    for (let i = 69; i < 80; i += 1) {
      expect(run.samples[i]!.stc).toBe(50);
      expect(run.samples[i]!.signal).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineStcCrossSigLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcCrossSigLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_STC_CROSS_SIG_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_STC_CROSS_SIG_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_STC_CROSS_SIG_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_STC_CROSS_SIG_PANEL_GAP);
  });

  it('osc panel fixed 0..100', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcCrossSigLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('mid line sits inside osc panel', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcCrossSigLayout({ data });
    expect(layout.midY).toBeGreaterThan(layout.oscTop);
    expect(layout.midY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineStcCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stcPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('path uses M then L commands', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const layout = computeLineStcCrossSigLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('stc/signal single M when no gaps', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const layout = computeLineStcCrossSigLayout({ data });
    expect((layout.stcPath.match(/M /g) ?? []).length).toBe(1);
    expect((layout.signalPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(80).fill(7));
    const layout = computeLineStcCrossSigLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineStcCrossSigChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStcCrossSigChart([])).toBe('No data');
  });

  it('describes parameters + signal-line framing', () => {
    const data = mk(new Array(80).fill(50));
    const desc = describeLineStcCrossSigChart(data);
    expect(desc).toContain('STC Signal Cross chart');
    expect(desc).toContain('80 bars');
    expect(desc).toContain('kSmoothing 3');
    expect(desc).toContain('smoothed cycle entry trigger');
    expect(desc).toContain('entry exit');
  });
});

describe('ChartLineStcCrossSig rendering', () => {
  it('renders region + role=img', () => {
    const data = mk(new Array(80).fill(10));
    const { container, getByRole } = render(
      <ChartLineStcCrossSig data={data} />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe(
      'STC Signal Cross chart',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders config badge', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-stc-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('fast 23');
    expect(badge?.textContent).toContain('slow 50');
    expect(badge?.textContent).toContain('kSmoothing 3');
  });

  it('renders legend toggles for price + stc + signal', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcCrossSig data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(3);
  });

  it('toggles signal via legend click', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcCrossSig data={data} />);
    const btn = container.querySelector('[data-series-id="signal"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries for stc', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcCrossSig data={data} hiddenSeries={['stc']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-stc-path"]',
      ),
    ).toBeNull();
  });

  it('respects controlled hiddenSeries for signal', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(80).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStcCrossSig
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="stc"]')!);
    expect(events).toEqual([{ seriesId: 'stc', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcCrossSig data={data} />);
    const btn = container.querySelector(
      '[data-series-id="stc"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(<ChartLineStcCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mk(new Array(80).fill(10));
    const { container, rerender } = render(
      <ChartLineStcCrossSig data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineStcCrossSig data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcCrossSig data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stc-cross-sig-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('mid line hide flag', () => {
    const data = mk(new Array(80).fill(10));
    const { container, rerender } = render(
      <ChartLineStcCrossSig data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-mid-line"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineStcCrossSig data={data} showMid={false} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-mid"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcCrossSig
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcCrossSig
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcCrossSig data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-stc-cross-sig"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('23');
    expect(region?.getAttribute('data-slow-length')).toBe('50');
    expect(region?.getAttribute('data-cycle-length')).toBe('10');
    expect(region?.getAttribute('data-factor')).toBe('0.5');
    expect(region?.getAttribute('data-k-smoothing')).toBe('3');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('11');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_STC_CROSS_SIG_FAST_LENGTH).toBe(23);
    expect(DEFAULT_CHART_LINE_STC_CROSS_SIG_SLOW_LENGTH).toBe(50);
    expect(DEFAULT_CHART_LINE_STC_CROSS_SIG_CYCLE_LENGTH).toBe(10);
    expect(DEFAULT_CHART_LINE_STC_CROSS_SIG_FACTOR).toBe(0.5);
    expect(DEFAULT_CHART_LINE_STC_CROSS_SIG_K_SMOOTHING).toBe(3);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(80).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineStcCrossSig data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stc-cross-sig',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mk(new Array(80).fill(10));
    const a = computeLineStcCrossSigLayout({ data });
    const b = computeLineStcCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.signalPath).toBe(b.signalPath);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const a = computeLineStcCrossSigLayout({ data });
    const b = computeLineStcCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.run.stcValues).toEqual(b.run.stcValues);
  });
});
