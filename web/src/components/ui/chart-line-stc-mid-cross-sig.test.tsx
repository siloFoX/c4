import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStcMidCrossSig,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_CYCLE_LENGTH,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FACTOR,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FAST_LENGTH,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_K_SMOOTHING,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_SLOW_LENGTH,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_THRESHOLD,
  DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_WIDTH,
  applyLineStcMidCrossSigEma,
  applyLineStcMidCrossSigSma,
  applyLineStcMidCrossSigStochastic,
  classifyLineStcMidCrossSigBias,
  classifyLineStcMidCrossSigRegime,
  computeLineStcMidCrossSig,
  computeLineStcMidCrossSigLayout,
  describeLineStcMidCrossSigChart,
  detectLineStcMidCrossSigCrosses,
  getLineStcMidCrossSigFinitePoints,
  normalizeLineStcMidCrossSigFactor,
  normalizeLineStcMidCrossSigLength,
  normalizeLineStcMidCrossSigThreshold,
  runLineStcMidCrossSig,
  type ChartLineStcMidCrossSigPoint,
} from './chart-line-stc-mid-cross-sig';

const mk = (closes: number[]): ChartLineStcMidCrossSigPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineStcMidCrossSigFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineStcMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineStcMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineStcMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineStcMidCrossSigFinitePoints(
        'oops' as unknown as ChartLineStcMidCrossSigPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineStcMidCrossSigLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineStcMidCrossSigLength(23, 23)).toBe(23);
  });

  it('floors fractional and falls back on invalid', () => {
    expect(normalizeLineStcMidCrossSigLength(7.9, 23)).toBe(7);
    expect(normalizeLineStcMidCrossSigLength(0, 23)).toBe(23);
    expect(normalizeLineStcMidCrossSigLength(NaN, 23)).toBe(23);
  });
});

describe('normalizeLineStcMidCrossSigThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineStcMidCrossSigThreshold(50, 50)).toBe(50);
    expect(normalizeLineStcMidCrossSigThreshold(0, 50)).toBe(0);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineStcMidCrossSigThreshold(NaN, 50)).toBe(50);
    expect(normalizeLineStcMidCrossSigThreshold(Infinity, 50)).toBe(50);
  });
});

describe('normalizeLineStcMidCrossSigFactor', () => {
  it('keeps factors in (0, 1]', () => {
    expect(normalizeLineStcMidCrossSigFactor(0.5, 0.5)).toBe(0.5);
    expect(normalizeLineStcMidCrossSigFactor(1, 0.5)).toBe(1);
  });

  it('falls back on out-of-range', () => {
    expect(normalizeLineStcMidCrossSigFactor(0, 0.5)).toBe(0.5);
    expect(normalizeLineStcMidCrossSigFactor(2, 0.5)).toBe(0.5);
    expect(normalizeLineStcMidCrossSigFactor(NaN, 0.5)).toBe(0.5);
  });
});

describe('applyLineStcMidCrossSigSma', () => {
  it('CONST -> SMA = value', () => {
    const out = applyLineStcMidCrossSigSma(new Array(10).fill(42), 3);
    for (let i = 0; i < 2; i += 1) expect(out[i]).toBeNull();
    for (let i = 2; i < 10; i += 1) expect(out[i]).toBe(42);
  });
});

describe('applyLineStcMidCrossSigStochastic', () => {
  it('CONST -> degenerate stoch = 50', () => {
    const out = applyLineStcMidCrossSigStochastic(
      new Array(15).fill(42),
      10,
    );
    for (let i = 9; i < 15; i += 1) expect(out[i]).toBe(50);
  });
});

describe('applyLineStcMidCrossSigEma', () => {
  it('CONST -> EMA = value', () => {
    const out = applyLineStcMidCrossSigEma(new Array(10).fill(50), 0.5);
    for (let i = 0; i < 10; i += 1) expect(out[i]).toBe(50);
  });
});

describe('computeLineStcMidCrossSig - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> macd=0, stc=50, signal=50',
    (K) => {
      const data = mk(new Array(80).fill(K));
      const { macd, stc, signal } = computeLineStcMidCrossSig(data);
      for (let i = 0; i < 49; i += 1) expect(macd[i]).toBeNull();
      for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(0);
      for (let i = 0; i < 67; i += 1) expect(stc[i]).toBeNull();
      for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
      for (let i = 0; i < 69; i += 1) expect(signal[i]).toBeNull();
      for (let i = 69; i < 80; i += 1) expect(signal[i]).toBe(50);
    },
  );
});

describe('computeLineStcMidCrossSig - LINEAR ramps', () => {
  it('LINEAR UP -> macd=13.5, stc=50, signal=50', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const { macd, stc, signal } = computeLineStcMidCrossSig(data);
    for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(13.5);
    for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
    for (let i = 69; i < 80; i += 1) expect(signal[i]).toBe(50);
  });

  it('LINEAR DOWN -> macd=-13.5, stc=50, signal=50', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const { macd, stc, signal } = computeLineStcMidCrossSig(data);
    for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(-13.5);
    for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
    for (let i = 69; i < 80; i += 1) expect(signal[i]).toBe(50);
  });
});

describe('classifyLineStcMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStcMidCrossSigRegime(null, 50)).toBe('none');
  });

  it('signal >= threshold -> bullish (boundary inclusive)', () => {
    expect(classifyLineStcMidCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineStcMidCrossSigRegime(100, 50)).toBe('bullish');
  });

  it('signal < threshold -> bearish', () => {
    expect(classifyLineStcMidCrossSigRegime(49.9, 50)).toBe('bearish');
    expect(classifyLineStcMidCrossSigRegime(0, 50)).toBe('bearish');
  });
});

describe('classifyLineStcMidCrossSigBias', () => {
  it('null inputs -> none', () => {
    expect(classifyLineStcMidCrossSigBias(null, 50)).toBe('none');
    expect(classifyLineStcMidCrossSigBias(50, null)).toBe('none');
  });

  it('up / down / flat semantics', () => {
    expect(classifyLineStcMidCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineStcMidCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineStcMidCrossSigBias(50, 50)).toBe('flat');
  });
});

describe('detectLineStcMidCrossSigCrosses', () => {
  it('fires bullish on signal cross-up through 50 with up bias', () => {
    const series = mk([1, 2, 3, 4]);
    const signal = [40, 45, 48, 60];
    const out = detectLineStcMidCrossSigCrosses(series, signal, 50);
    expect(out).toEqual([{ index: 3, x: 3, kind: 'bullish', bias: 'up' }]);
  });

  it('fires bearish on signal cross-down through 50 with down bias', () => {
    const series = mk([1, 2, 3, 4]);
    const signal = [60, 55, 52, 40];
    const out = detectLineStcMidCrossSigCrosses(series, signal, 50);
    expect(out).toEqual([{ index: 3, x: 3, kind: 'bearish', bias: 'down' }]);
  });

  it('boundary cur==50 not crossed', () => {
    const series = mk([1, 2]);
    expect(
      detectLineStcMidCrossSigCrosses(series, [40, 50], 50),
    ).toEqual([]);
  });

  it('skips when prev/cur is null', () => {
    const series = mk([1, 2]);
    expect(
      detectLineStcMidCrossSigCrosses(series, [null, 60], 50),
    ).toEqual([]);
    expect(
      detectLineStcMidCrossSigCrosses(series, [60, null], 50),
    ).toEqual([]);
  });

  it('no cross on one-sided', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineStcMidCrossSigCrosses(series, [40, 42, 45, 49], 50),
    ).toEqual([]);
  });
});

describe('runLineStcMidCrossSig', () => {
  it('CONST K -> 0 crosses, bullishCount=11 (80 bars - 69 warmup)', () => {
    const data = mk(new Array(80).fill(50));
    const run = runLineStcMidCrossSig(data);
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
    expect(run.threshold).toBe(50);
  });

  it('LINEAR UP 80 -> bullish, 0 crosses', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const run = runLineStcMidCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(11);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN 80 -> bullish, 0 crosses', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const run = runLineStcMidCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(11);
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(80).fill(50));
    expect(
      runLineStcMidCrossSig(data, { threshold: NaN }).threshold,
    ).toBe(50);
  });

  it('respects custom params', () => {
    const data = mk(new Array(80).fill(50));
    const run = runLineStcMidCrossSig(data, {
      kSmoothing: 5,
      threshold: 60,
    });
    expect(run.kSmoothing).toBe(5);
    expect(run.threshold).toBe(60);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineStcMidCrossSig([]).ok).toBe(false);
    expect(runLineStcMidCrossSig(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStcMidCrossSigPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStcMidCrossSig(data, {
      fastLength: 1,
      slowLength: 1,
      cycleLength: 1,
      kSmoothing: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry stc / signal / bias / regime', () => {
    const data = mk(new Array(80).fill(50));
    const run = runLineStcMidCrossSig(data);
    for (let i = 69; i < 80; i += 1) {
      expect(run.samples[i]!.stc).toBe(50);
      expect(run.samples[i]!.signal).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
    expect(run.samples[69]!.bias).toBe('none');
    for (let i = 70; i < 80; i += 1) {
      expect(run.samples[i]!.bias).toBe('flat');
    }
  });
});

describe('computeLineStcMidCrossSigLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcMidCrossSigLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PANEL_GAP,
    );
  });

  it('osc panel fixed 0..100', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcMidCrossSigLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('threshold line sits inside osc panel', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcMidCrossSigLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineStcMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stcPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('path uses M then L commands', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const layout = computeLineStcMidCrossSigLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('stc and signal paths skip null gaps', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const layout = computeLineStcMidCrossSigLayout({ data });
    expect(layout.stcPath.startsWith('M ')).toBe(true);
    expect(layout.signalPath.startsWith('M ')).toBe(true);
    expect((layout.stcPath.match(/M /g) ?? []).length).toBe(1);
    expect((layout.signalPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(80).fill(7));
    const layout = computeLineStcMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineStcMidCrossSigChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStcMidCrossSigChart([])).toBe('No data');
  });

  it('describes parameters + centerline/bias framing', () => {
    const data = mk(new Array(80).fill(50));
    const desc = describeLineStcMidCrossSigChart(data);
    expect(desc).toContain('STC Midline Signal Cross chart');
    expect(desc).toContain('80 bars');
    expect(desc).toContain('threshold 50');
    expect(desc).toContain('kSmoothing 3');
    expect(desc).toContain('cycle centerline trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('ChartLineStcMidCrossSig rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(80).fill(10));
    const { container, getByRole } = render(
      <ChartLineStcMidCrossSig data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'STC Midline Signal Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
  });

  it('renders config badge with full param set', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-stc-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('fast 23');
    expect(badge?.textContent).toContain('slow 50');
    expect(badge?.textContent).toContain('kSmoothing 3');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + stc + signal', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcMidCrossSig data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('stc');
    expect(buttons[2].getAttribute('data-series-id')).toBe('signal');
  });

  it('toggles signal via legend click', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcMidCrossSig data={data} />);
    const btn = container.querySelector('[data-series-id="signal"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries for stc', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcMidCrossSig data={data} hiddenSeries={['stc']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-stc-path"]',
      ),
    ).toBeNull();
  });

  it('respects controlled hiddenSeries for signal', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(80).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStcMidCrossSig
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="signal"]')!);
    expect(events).toEqual([{ seriesId: 'signal', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcMidCrossSig data={data} />);
    const btn = container.querySelector(
      '[data-series-id="stc"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineStcMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate default adds fade-in', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcMidCrossSig data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('animate=false omits class', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcMidCrossSig data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip with bias row', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcMidCrossSig data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stc-mid-cross-sig-hover"]',
    );
    fireEvent.mouseEnter(hovers[hovers.length - 1]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-tooltip-bias"]',
      ),
    ).not.toBeNull();
  });

  it('renders threshold line by default and hides on showThreshold=false', () => {
    const data = mk(new Array(80).fill(10));
    const { container, rerender } = render(
      <ChartLineStcMidCrossSig data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-threshold-line"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineStcMidCrossSig data={data} showThreshold={false} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-threshold"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcMidCrossSig
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcMidCrossSig
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-mid-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcMidCrossSig data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-stc-mid-cross-sig"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('23');
    expect(region?.getAttribute('data-slow-length')).toBe('50');
    expect(region?.getAttribute('data-cycle-length')).toBe('10');
    expect(region?.getAttribute('data-factor')).toBe('0.5');
    expect(region?.getAttribute('data-k-smoothing')).toBe('3');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('11');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FAST_LENGTH).toBe(23);
    expect(DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_SLOW_LENGTH).toBe(50);
    expect(DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_CYCLE_LENGTH).toBe(10);
    expect(DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FACTOR).toBe(0.5);
    expect(DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_K_SMOOTHING).toBe(3);
    expect(DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_THRESHOLD).toBe(50);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(80).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineStcMidCrossSig data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stc-mid-cross-sig',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mk(new Array(80).fill(10));
    const a = computeLineStcMidCrossSigLayout({ data });
    const b = computeLineStcMidCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.signalPath).toBe(b.signalPath);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const a = computeLineStcMidCrossSigLayout({ data });
    const b = computeLineStcMidCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.stcValues).toEqual(b.run.stcValues);
    expect(a.run.signalValues).toEqual(b.run.signalValues);
  });
});
