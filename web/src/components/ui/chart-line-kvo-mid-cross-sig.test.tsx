import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineKvoMidCrossSig,
  DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_FAST_LENGTH,
  DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_K_SMOOTHING,
  DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_SLOW_LENGTH,
  DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_THRESHOLD,
  DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_WIDTH,
  applyLineKvoMidCrossSigSma,
  classifyLineKvoMidCrossSigRegime,
  computeLineKvoMidCrossSig,
  computeLineKvoMidCrossSigLayout,
  describeLineKvoMidCrossSigChart,
  detectLineKvoMidCrossSigCrosses,
  getLineKvoMidCrossSigFinitePoints,
  normalizeLineKvoMidCrossSigLength,
  normalizeLineKvoMidCrossSigThreshold,
  runLineKvoMidCrossSig,
  type ChartLineKvoMidCrossSigPoint,
} from './chart-line-kvo-mid-cross-sig';

const mkConst = (
  n: number,
  K: number,
  V = 1000,
): ChartLineKvoMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
    volume: V,
  }));

const mkLinear = (
  n: number,
  fn: (i: number) => number,
  V = 1000,
): ChartLineKvoMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => {
    const v = fn(i);
    return { x: i, high: v, low: v, close: v, volume: V };
  });

describe('getLineKvoMidCrossSigFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, high: 10, low: 10, close: 10, volume: 100 },
      { x: 1, high: NaN, low: 10, close: 10, volume: 100 },
      { x: 2, high: 10, low: 10, close: 10, volume: 100 },
    ];
    expect(getLineKvoMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, high: 10, low: 10, close: 10, volume: 100 },
      { x: 2, high: 10, low: 10, close: 10, volume: 100 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineKvoMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineKvoMidCrossSigFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineKvoMidCrossSigLength', () => {
  it('keeps integers >= 1', () => {
    expect(normalizeLineKvoMidCrossSigLength(34, 34)).toBe(34);
  });

  it('falls back on invalid', () => {
    expect(normalizeLineKvoMidCrossSigLength(0, 34)).toBe(34);
    expect(normalizeLineKvoMidCrossSigLength(NaN, 34)).toBe(34);
  });
});

describe('normalizeLineKvoMidCrossSigThreshold', () => {
  it('accepts finite values', () => {
    expect(normalizeLineKvoMidCrossSigThreshold(0, 0)).toBe(0);
    expect(normalizeLineKvoMidCrossSigThreshold(100, 0)).toBe(100);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineKvoMidCrossSigThreshold(NaN, 0)).toBe(0);
    expect(normalizeLineKvoMidCrossSigThreshold(Infinity, 0)).toBe(0);
  });
});

describe('applyLineKvoMidCrossSigSma', () => {
  it('CONST -> SMA = value via short-circuit', () => {
    const out = applyLineKvoMidCrossSigSma(new Array(40).fill(42), 34);
    for (let i = 33; i < 40; i += 1) expect(out[i]).toBe(42);
  });
});

describe('computeLineKvoMidCrossSig - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST K=%d volume=1000 -> vf=0, kvo=0, signal=0',
    (K) => {
      const data = mkConst(100, K, 1000);
      const { vf, kvo, signal } = computeLineKvoMidCrossSig(data);
      expect(vf[0]).toBeNull();
      for (let i = 1; i < 100; i += 1) {
        expect(vf[i]).toBe(0);
        expect(Object.is(vf[i], -0)).toBe(false);
      }
      // fast SMA needs 34 vf values (i=1..34), first valid at i=34
      for (let i = 34; i < 100; i += 1) expect(kvo[i]).toBeDefined();
      for (let i = 55; i < 100; i += 1) {
        expect(kvo[i]).toBe(0);
      }
      // signal needs 13 kvo values, first valid at i=55+12=67
      for (let i = 67; i < 100; i += 1) expect(signal[i]).toBe(0);
    },
  );

  it('CONST volume verification across V=1, 100, 1000, 1234', () => {
    for (const V of [1, 100, 1000, 1234]) {
      const data = mkConst(100, 42, V);
      const { vf, kvo, signal } = computeLineKvoMidCrossSig(data);
      for (let i = 1; i < 100; i += 1) expect(vf[i]).toBe(0);
      for (let i = 67; i < 100; i += 1) expect(signal[i]).toBe(0);
      for (let i = 55; i < 100; i += 1) expect(kvo[i]).toBe(0);
    }
  });
});

describe('computeLineKvoMidCrossSig - LINEAR ramps', () => {
  it('LINEAR UP -> vf=+1000, kvo=0, signal=0', () => {
    const data = mkLinear(100, (i) => i, 1000);
    const { vf, kvo, signal } = computeLineKvoMidCrossSig(data);
    for (let i = 1; i < 100; i += 1) expect(vf[i]).toBe(1000);
    for (let i = 55; i < 100; i += 1) expect(kvo[i]).toBe(0);
    for (let i = 67; i < 100; i += 1) expect(signal[i]).toBe(0);
  });

  it('LINEAR DOWN -> vf=-1000, kvo=0, signal=0', () => {
    const data = mkLinear(100, (i) => -i, 1000);
    const { vf, kvo, signal } = computeLineKvoMidCrossSig(data);
    for (let i = 1; i < 100; i += 1) expect(vf[i]).toBe(-1000);
    for (let i = 55; i < 100; i += 1) expect(kvo[i]).toBe(0);
    for (let i = 67; i < 100; i += 1) expect(signal[i]).toBe(0);
  });
});

describe('classifyLineKvoMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineKvoMidCrossSigRegime(null, 0)).toBe('none');
  });

  it('signal >= threshold -> bullish (boundary inclusive)', () => {
    expect(classifyLineKvoMidCrossSigRegime(0, 0)).toBe('bullish');
    expect(classifyLineKvoMidCrossSigRegime(100, 0)).toBe('bullish');
  });

  it('signal < threshold -> bearish', () => {
    expect(classifyLineKvoMidCrossSigRegime(-1, 0)).toBe('bearish');
  });
});

describe('detectLineKvoMidCrossSigCrosses', () => {
  const series = mkConst(4, 10);

  it('fires bullish when signal crosses up through 0', () => {
    const sig = [-1, -0.5, -0.2, 1];
    expect(detectLineKvoMidCrossSigCrosses(series, sig, 0)).toEqual([
      { index: 3, x: 3, kind: 'bullish' },
    ]);
  });

  it('fires bearish when signal crosses down through 0', () => {
    const sig = [1, 0.5, 0.2, -1];
    expect(detectLineKvoMidCrossSigCrosses(series, sig, 0)).toEqual([
      { index: 3, x: 3, kind: 'bearish' },
    ]);
  });

  it('boundary cur == 0 not crossed', () => {
    const two = mkConst(2, 10);
    expect(detectLineKvoMidCrossSigCrosses(two, [-1, 0], 0)).toEqual([]);
  });

  it('skips when prev/cur is null', () => {
    const two = mkConst(2, 10);
    expect(detectLineKvoMidCrossSigCrosses(two, [null, 1], 0)).toEqual([]);
    expect(detectLineKvoMidCrossSigCrosses(two, [1, null], 0)).toEqual([]);
  });

  it('no cross on one-sided', () => {
    expect(
      detectLineKvoMidCrossSigCrosses(
        series,
        [-1, -0.8, -0.6, -0.4],
        0,
      ),
    ).toEqual([]);
  });
});

describe('runLineKvoMidCrossSig', () => {
  it('CONST K -> 0 crosses, bullishCount=33 (100 bars - 67 warmup)', () => {
    const data = mkConst(100, 50);
    const run = runLineKvoMidCrossSig(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(67);
    expect(run.bullishCount).toBe(33);
    expect(run.bearishCount).toBe(0);
    expect(run.fastLength).toBe(34);
    expect(run.slowLength).toBe(55);
    expect(run.kSmoothing).toBe(13);
    expect(run.threshold).toBe(0);
  });

  it('LINEAR UP 100 -> bullish (signal=0 >= 0), 0 crosses', () => {
    const data = mkLinear(100, (i) => i);
    const run = runLineKvoMidCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(33);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN 100 -> bullish (signal=0 >= 0), 0 crosses', () => {
    const data = mkLinear(100, (i) => -i);
    const run = runLineKvoMidCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(33);
  });

  it('respects custom params', () => {
    const data = mkConst(100, 50);
    expect(runLineKvoMidCrossSig(data, { kSmoothing: 5 }).kSmoothing).toBe(
      5,
    );
    expect(
      runLineKvoMidCrossSig(data, { threshold: 10 }).threshold,
    ).toBe(10);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineKvoMidCrossSig([]).ok).toBe(false);
    expect(runLineKvoMidCrossSig(mkConst(10, 50)).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineKvoMidCrossSigPoint[] = [
      { x: 3, high: 30, low: 30, close: 30, volume: 1000 },
      { x: 1, high: 10, low: 10, close: 10, volume: 1000 },
      { x: 2, high: 20, low: 20, close: 20, volume: 1000 },
    ];
    const run = runLineKvoMidCrossSig(data, {
      fastLength: 1,
      slowLength: 1,
      kSmoothing: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry vf / kvo / signal / regime', () => {
    const data = mkConst(100, 50);
    const run = runLineKvoMidCrossSig(data);
    for (let i = 67; i < 100; i += 1) {
      expect(run.samples[i]!.signal).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineKvoMidCrossSigLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mkConst(100, 50);
    const layout = computeLineKvoMidCrossSigLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_PANEL_GAP,
    );
  });

  it('CONST K -> kvo=0 -> [-1, 1]', () => {
    const data = mkConst(100, 50);
    const layout = computeLineKvoMidCrossSigLayout({ data });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('zero line sits inside osc panel', () => {
    const data = mkConst(100, 50);
    const layout = computeLineKvoMidCrossSigLayout({ data });
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineKvoMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.kvoPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('path uses M then L commands', () => {
    const data = mkLinear(100, (i) => i);
    const layout = computeLineKvoMidCrossSigLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('kvo/signal single M when no gaps', () => {
    const data = mkLinear(100, (i) => i);
    const layout = computeLineKvoMidCrossSigLayout({ data });
    expect((layout.kvoPath.match(/M /g) ?? []).length).toBe(1);
    expect((layout.signalPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value close', () => {
    const data = mkConst(100, 7);
    const layout = computeLineKvoMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineKvoMidCrossSigChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineKvoMidCrossSigChart([])).toBe('No data');
  });

  it('describes parameters + volume momentum framing', () => {
    const data = mkConst(100, 50);
    const desc = describeLineKvoMidCrossSigChart(data);
    expect(desc).toContain('KVO Midline Signal Cross chart');
    expect(desc).toContain('100 bars');
    expect(desc).toContain('fastLength 34');
    expect(desc).toContain('slowLength 55');
    expect(desc).toContain('kSmoothing 13');
    expect(desc).toContain('volume momentum centerline');
  });
});

describe('ChartLineKvoMidCrossSig rendering', () => {
  it('renders region + role=img', () => {
    const data = mkConst(100, 10);
    const { container, getByRole } = render(
      <ChartLineKvoMidCrossSig data={data} />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe(
      'KVO Midline Signal Cross chart',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders config badge', () => {
    const data = mkConst(100, 10);
    const { container } = render(<ChartLineKvoMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-kvo-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('fast 34');
    expect(badge?.textContent).toContain('slow 55');
    expect(badge?.textContent).toContain('kSmoothing 13');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + kvo + signal', () => {
    const data = mkConst(100, 10);
    const { container } = render(<ChartLineKvoMidCrossSig data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(3);
  });

  it('toggles signal via legend click', () => {
    const data = mkConst(100, 10);
    const { container } = render(<ChartLineKvoMidCrossSig data={data} />);
    const btn = container.querySelector('[data-series-id="signal"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries for kvo', () => {
    const data = mkConst(100, 10);
    const { container } = render(
      <ChartLineKvoMidCrossSig data={data} hiddenSeries={['kvo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-kvo-path"]',
      ),
    ).toBeNull();
  });

  it('respects controlled hiddenSeries for signal', () => {
    const data = mkConst(100, 10);
    const { container } = render(
      <ChartLineKvoMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mkConst(100, 10);
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineKvoMidCrossSig
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="kvo"]')!);
    expect(events).toEqual([{ seriesId: 'kvo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mkConst(100, 10);
    const { container } = render(<ChartLineKvoMidCrossSig data={data} />);
    const btn = container.querySelector(
      '[data-series-id="kvo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(<ChartLineKvoMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mkConst(100, 10);
    const { container, rerender } = render(
      <ChartLineKvoMidCrossSig data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineKvoMidCrossSig data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mkConst(100, 10);
    const { container } = render(<ChartLineKvoMidCrossSig data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-kvo-mid-cross-sig-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('zero line hide flag', () => {
    const data = mkConst(100, 10);
    const { container, rerender } = render(
      <ChartLineKvoMidCrossSig data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineKvoMidCrossSig data={data} showZero={false} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-zero"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mkConst(100, 10);
    const { container } = render(
      <ChartLineKvoMidCrossSig
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mkConst(100, 10);
    const { container } = render(
      <ChartLineKvoMidCrossSig
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-mid-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mkConst(100, 10);
    const { container } = render(<ChartLineKvoMidCrossSig data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-kvo-mid-cross-sig"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('34');
    expect(region?.getAttribute('data-slow-length')).toBe('55');
    expect(region?.getAttribute('data-k-smoothing')).toBe('13');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('33');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_FAST_LENGTH).toBe(34);
    expect(DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_SLOW_LENGTH).toBe(55);
    expect(DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_K_SMOOTHING).toBe(13);
    expect(DEFAULT_CHART_LINE_KVO_MID_CROSS_SIG_THRESHOLD).toBe(0);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mkConst(100, 10);
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineKvoMidCrossSig data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-kvo-mid-cross-sig',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mkConst(100, 10);
    const a = computeLineKvoMidCrossSigLayout({ data });
    const b = computeLineKvoMidCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.kvoPath).toBe(b.kvoPath);
    expect(a.signalPath).toBe(b.signalPath);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mkLinear(100, (i) => -i);
    const a = computeLineKvoMidCrossSigLayout({ data });
    const b = computeLineKvoMidCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.kvoPath).toBe(b.kvoPath);
    expect(a.run.kvoValues).toEqual(b.run.kvoValues);
  });
});
