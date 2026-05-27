import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStcOversoldCross,
  DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_CYCLE_LENGTH,
  DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_FACTOR,
  DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_PADDING,
  DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_WIDTH,
  applyLineStcOversoldCrossEma,
  applyLineStcOversoldCrossSma,
  applyLineStcOversoldCrossStochastic,
  classifyLineStcOversoldCrossBias,
  classifyLineStcOversoldCrossRegime,
  computeLineStcOversoldCross,
  computeLineStcOversoldCrossLayout,
  describeLineStcOversoldCrossChart,
  detectLineStcOversoldCrossCrosses,
  getLineStcOversoldCrossFinitePoints,
  normalizeLineStcOversoldCrossFactor,
  normalizeLineStcOversoldCrossLength,
  normalizeLineStcOversoldCrossThreshold,
  runLineStcOversoldCross,
  type ChartLineStcOversoldCrossPoint,
} from './chart-line-stc-oversold-cross';

const mk = (closes: number[]): ChartLineStcOversoldCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineStcOversoldCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineStcOversoldCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineStcOversoldCrossFinitePoints(null)).toEqual([]);
    expect(getLineStcOversoldCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineStcOversoldCrossFinitePoints(
        'oops' as unknown as ChartLineStcOversoldCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineStcOversoldCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineStcOversoldCrossLength(23, 23)).toBe(23);
    expect(normalizeLineStcOversoldCrossLength(1, 23)).toBe(1);
  });

  it('floors fractional and falls back on invalid', () => {
    expect(normalizeLineStcOversoldCrossLength(7.9, 23)).toBe(7);
    expect(normalizeLineStcOversoldCrossLength(0, 23)).toBe(23);
    expect(normalizeLineStcOversoldCrossLength(NaN, 23)).toBe(23);
  });
});

describe('normalizeLineStcOversoldCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineStcOversoldCrossThreshold(25, 25)).toBe(25);
    expect(normalizeLineStcOversoldCrossThreshold(0, 25)).toBe(0);
    expect(normalizeLineStcOversoldCrossThreshold(100, 25)).toBe(100);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineStcOversoldCrossThreshold(NaN, 25)).toBe(25);
    expect(normalizeLineStcOversoldCrossThreshold(Infinity, 25)).toBe(25);
  });
});

describe('normalizeLineStcOversoldCrossFactor', () => {
  it('keeps factors in (0, 1]', () => {
    expect(normalizeLineStcOversoldCrossFactor(0.5, 0.5)).toBe(0.5);
    expect(normalizeLineStcOversoldCrossFactor(1, 0.5)).toBe(1);
    expect(normalizeLineStcOversoldCrossFactor(0.1, 0.5)).toBe(0.1);
  });

  it('falls back on out-of-range', () => {
    expect(normalizeLineStcOversoldCrossFactor(0, 0.5)).toBe(0.5);
    expect(normalizeLineStcOversoldCrossFactor(-0.1, 0.5)).toBe(0.5);
    expect(normalizeLineStcOversoldCrossFactor(2, 0.5)).toBe(0.5);
    expect(normalizeLineStcOversoldCrossFactor(NaN, 0.5)).toBe(0.5);
  });
});

describe('applyLineStcOversoldCrossSma', () => {
  it('CONST -> SMA = value via short-circuit', () => {
    const out = applyLineStcOversoldCrossSma(new Array(30).fill(42), 23);
    for (let i = 0; i < 22; i += 1) expect(out[i]).toBeNull();
    for (let i = 22; i < 30; i += 1) expect(out[i]).toBe(42);
  });
});

describe('applyLineStcOversoldCrossStochastic', () => {
  it('CONST -> degenerate stoch = 50', () => {
    const out = applyLineStcOversoldCrossStochastic(
      new Array(15).fill(42),
      10,
    );
    for (let i = 0; i < 9; i += 1) expect(out[i]).toBeNull();
    for (let i = 9; i < 15; i += 1) expect(out[i]).toBe(50);
  });
});

describe('applyLineStcOversoldCrossEma', () => {
  it('CONST -> EMA = value from seed onwards', () => {
    const out = applyLineStcOversoldCrossEma(new Array(10).fill(50), 0.5);
    for (let i = 0; i < 10; i += 1) expect(out[i]).toBe(50);
  });

  it('null inputs propagate', () => {
    const out = applyLineStcOversoldCrossEma([null, null, 100, 100], 0.5);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(100);
    expect(out[3]).toBe(100);
  });
});

describe('computeLineStcOversoldCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> macd=0, k1=50, d1=50, k2=50, stc=50',
    (K) => {
      const data = mk(new Array(80).fill(K));
      const { macd, k1, d1, k2, stc } = computeLineStcOversoldCross(data);
      for (let i = 0; i < 49; i += 1) expect(macd[i]).toBeNull();
      for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(0);
      for (let i = 0; i < 58; i += 1) expect(k1[i]).toBeNull();
      for (let i = 58; i < 80; i += 1) expect(k1[i]).toBe(50);
      for (let i = 0; i < 58; i += 1) expect(d1[i]).toBeNull();
      for (let i = 58; i < 80; i += 1) expect(d1[i]).toBe(50);
      for (let i = 0; i < 67; i += 1) expect(k2[i]).toBeNull();
      for (let i = 67; i < 80; i += 1) expect(k2[i]).toBe(50);
      for (let i = 0; i < 67; i += 1) expect(stc[i]).toBeNull();
      for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
    },
  );
});

describe('computeLineStcOversoldCross - LINEAR ramps', () => {
  it('LINEAR UP -> macd=13.5, stc=50 (cycle collapse)', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const { macd, stc } = computeLineStcOversoldCross(data);
    for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(13.5);
    for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
  });

  it('LINEAR DOWN -> macd=-13.5, stc=50', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const { macd, stc } = computeLineStcOversoldCross(data);
    for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(-13.5);
    for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
  });
});

describe('classifyLineStcOversoldCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStcOversoldCrossRegime(null, 25)).toBe('none');
  });

  it('stc >= threshold -> bullish (boundary inclusive)', () => {
    expect(classifyLineStcOversoldCrossRegime(25, 25)).toBe('bullish');
    expect(classifyLineStcOversoldCrossRegime(50, 25)).toBe('bullish');
    expect(classifyLineStcOversoldCrossRegime(100, 25)).toBe('bullish');
  });

  it('stc < threshold -> bearish', () => {
    expect(classifyLineStcOversoldCrossRegime(10, 25)).toBe('bearish');
    expect(classifyLineStcOversoldCrossRegime(0, 25)).toBe('bearish');
  });
});

describe('classifyLineStcOversoldCrossBias', () => {
  it('null inputs -> none', () => {
    expect(classifyLineStcOversoldCrossBias(null, 50)).toBe('none');
    expect(classifyLineStcOversoldCrossBias(50, null)).toBe('none');
  });

  it('cur > prev -> up', () => {
    expect(classifyLineStcOversoldCrossBias(40, 30)).toBe('up');
  });

  it('cur < prev -> down', () => {
    expect(classifyLineStcOversoldCrossBias(30, 40)).toBe('down');
  });

  it('cur === prev -> flat', () => {
    expect(classifyLineStcOversoldCrossBias(50, 50)).toBe('flat');
  });
});

describe('detectLineStcOversoldCrossCrosses', () => {
  it('fires bullish on prev <= 25 && cur > 25 with up bias', () => {
    const series = mk([1, 2, 3, 4]);
    const stc = [10, 15, 20, 30];
    const out = detectLineStcOversoldCrossCrosses(series, stc, 25);
    expect(out).toEqual([{ index: 3, x: 3, kind: 'bullish', bias: 'up' }]);
  });

  it('fires bearish on prev >= 25 && cur < 25 with down bias', () => {
    const series = mk([1, 2, 3, 4]);
    const stc = [30, 28, 26, 20];
    const out = detectLineStcOversoldCrossCrosses(series, stc, 25);
    expect(out).toEqual([{ index: 3, x: 3, kind: 'bearish', bias: 'down' }]);
  });

  it('boundary cur == 25 does not fire bullish', () => {
    const series = mk([1, 2]);
    expect(
      detectLineStcOversoldCrossCrosses(series, [20, 25], 25),
    ).toEqual([]);
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2]);
    expect(
      detectLineStcOversoldCrossCrosses(series, [null, 30], 25),
    ).toEqual([]);
    expect(
      detectLineStcOversoldCrossCrosses(series, [30, null], 25),
    ).toEqual([]);
  });

  it('no cross when stc stays one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineStcOversoldCrossCrosses(series, [10, 15, 20, 24], 25),
    ).toEqual([]);
  });
});

describe('runLineStcOversoldCross', () => {
  it('CONST K -> 0 crosses, bullishCount=13 (50 > 25, 80 bars - 67 warmup)', () => {
    const data = mk(new Array(80).fill(50));
    const run = runLineStcOversoldCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(67);
    expect(run.bullishCount).toBe(13);
    expect(run.bearishCount).toBe(0);
    expect(run.fastLength).toBe(23);
    expect(run.slowLength).toBe(50);
    expect(run.cycleLength).toBe(10);
    expect(run.factor).toBe(0.5);
    expect(run.threshold).toBe(25);
  });

  it('LINEAR UP 80 -> bullish at steady state (stc=50 > 25), 0 crosses', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const run = runLineStcOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(13);
    expect(run.bearishCount).toBe(0);
    expect(run.noneCount).toBe(67);
  });

  it('LINEAR DOWN 80 -> bullish (stc=50 > 25), 0 crosses', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const run = runLineStcOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(13);
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(80).fill(50));
    expect(
      runLineStcOversoldCross(data, { threshold: NaN }).threshold,
    ).toBe(25);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(80).fill(50));
    expect(
      runLineStcOversoldCross(data, { threshold: 10 }).threshold,
    ).toBe(10);
    expect(
      runLineStcOversoldCross(data, { threshold: 50 }).threshold,
    ).toBe(50);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineStcOversoldCross([]).ok).toBe(false);
    expect(runLineStcOversoldCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStcOversoldCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStcOversoldCross(data, {
      fastLength: 1,
      slowLength: 1,
      cycleLength: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry stc / bias / regime', () => {
    const data = mk(new Array(80).fill(50));
    const run = runLineStcOversoldCross(data);
    for (let i = 67; i < 80; i += 1) {
      expect(run.samples[i]!.stc).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
    expect(run.samples[67]!.bias).toBe('none');
    for (let i = 68; i < 80; i += 1) {
      expect(run.samples[i]!.bias).toBe('flat');
    }
  });
});

describe('computeLineStcOversoldCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcOversoldCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_PANEL_GAP,
    );
  });

  it('osc panel fixed at 0..100', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcOversoldCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('threshold line sits inside osc panel', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcOversoldCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineStcOversoldCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stcPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const layout = computeLineStcOversoldCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('stc path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const layout = computeLineStcOversoldCrossLayout({ data });
    expect(layout.stcPath.startsWith('M ')).toBe(true);
    expect((layout.stcPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(80).fill(7));
    const layout = computeLineStcOversoldCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineStcOversoldCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStcOversoldCrossChart([])).toBe('No data');
  });

  it('describes parameters + oversold/bias framing', () => {
    const data = mk(new Array(80).fill(50));
    const desc = describeLineStcOversoldCrossChart(data);
    expect(desc).toContain('STC Oversold Cross chart');
    expect(desc).toContain('80 bars');
    expect(desc).toContain('threshold 25');
    expect(desc).toContain('cycle oversold trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('ChartLineStcOversoldCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(80).fill(10));
    const { container, getByRole } = render(
      <ChartLineStcOversoldCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'STC Oversold Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
  });

  it('renders config badge with full param set', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOversoldCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-stc-oversold-cross-badge"]',
    );
    expect(badge?.textContent).toContain('fast 23');
    expect(badge?.textContent).toContain('slow 50');
    expect(badge?.textContent).toContain('cycle 10');
    expect(badge?.textContent).toContain('factor 0.5');
    expect(badge?.textContent).toContain('threshold 25');
  });

  it('renders legend toggles for price + stc', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOversoldCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('stc');
  });

  it('toggles stc series via legend click', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOversoldCross data={data} />);
    const btn = container.querySelector('[data-series-id="stc"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcOversoldCross data={data} hiddenSeries={['stc']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-stc-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(80).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStcOversoldCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="stc"]')!);
    expect(events).toEqual([{ seriesId: 'stc', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOversoldCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="stc"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineStcOversoldCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=true (default) adds motion-safe fade-in', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOversoldCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('animate=false omits class', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcOversoldCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip target with bias', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOversoldCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stc-oversold-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[hovers.length - 1]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-stc-oversold-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    const biasText = container.querySelector(
      '[data-section="chart-line-stc-oversold-cross-tooltip-bias"]',
    );
    expect(biasText).not.toBeNull();
  });

  it('renders threshold line by default and hides on showThreshold=false', () => {
    const data = mk(new Array(80).fill(10));
    const { container, rerender } = render(
      <ChartLineStcOversoldCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-threshold-line"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineStcOversoldCross data={data} showThreshold={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-threshold"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcOversoldCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcOversoldCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-oversold-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOversoldCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-stc-oversold-cross"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('23');
    expect(region?.getAttribute('data-slow-length')).toBe('50');
    expect(region?.getAttribute('data-cycle-length')).toBe('10');
    expect(region?.getAttribute('data-factor')).toBe('0.5');
    expect(region?.getAttribute('data-threshold')).toBe('25');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('13');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_FAST_LENGTH).toBe(23);
    expect(DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_SLOW_LENGTH).toBe(50);
    expect(DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_CYCLE_LENGTH).toBe(10);
    expect(DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_FACTOR).toBe(0.5);
    expect(DEFAULT_CHART_LINE_STC_OVERSOLD_CROSS_THRESHOLD).toBe(25);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(80).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineStcOversoldCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stc-oversold-cross',
    );
  });

  it('layout deterministic across calls (CONST)', () => {
    const data = mk(new Array(80).fill(10));
    const a = computeLineStcOversoldCrossLayout({ data });
    const b = computeLineStcOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.thresholdY).toBe(b.thresholdY);
  });

  it('layout deterministic across calls (LINEAR DOWN)', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const a = computeLineStcOversoldCrossLayout({ data });
    const b = computeLineStcOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.run.stcValues).toEqual(b.run.stcValues);
  });
});
