import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStcOverboughtCross,
  DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_CYCLE_LENGTH,
  DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_FACTOR,
  DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_PADDING,
  DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_WIDTH,
  applyLineStcOverboughtCrossEma,
  applyLineStcOverboughtCrossSma,
  applyLineStcOverboughtCrossStochastic,
  classifyLineStcOverboughtCrossBias,
  classifyLineStcOverboughtCrossRegime,
  computeLineStcOverboughtCross,
  computeLineStcOverboughtCrossLayout,
  describeLineStcOverboughtCrossChart,
  detectLineStcOverboughtCrossCrosses,
  getLineStcOverboughtCrossFinitePoints,
  normalizeLineStcOverboughtCrossFactor,
  normalizeLineStcOverboughtCrossLength,
  normalizeLineStcOverboughtCrossThreshold,
  runLineStcOverboughtCross,
  type ChartLineStcOverboughtCrossPoint,
} from './chart-line-stc-overbought-cross';

const mk = (closes: number[]): ChartLineStcOverboughtCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineStcOverboughtCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineStcOverboughtCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineStcOverboughtCrossFinitePoints(null)).toEqual([]);
    expect(getLineStcOverboughtCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineStcOverboughtCrossFinitePoints(
        'oops' as unknown as ChartLineStcOverboughtCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineStcOverboughtCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineStcOverboughtCrossLength(23, 23)).toBe(23);
    expect(normalizeLineStcOverboughtCrossLength(1, 23)).toBe(1);
  });

  it('floors fractional and falls back on invalid', () => {
    expect(normalizeLineStcOverboughtCrossLength(7.9, 23)).toBe(7);
    expect(normalizeLineStcOverboughtCrossLength(0, 23)).toBe(23);
    expect(normalizeLineStcOverboughtCrossLength(NaN, 23)).toBe(23);
  });
});

describe('normalizeLineStcOverboughtCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineStcOverboughtCrossThreshold(75, 75)).toBe(75);
    expect(normalizeLineStcOverboughtCrossThreshold(0, 75)).toBe(0);
    expect(normalizeLineStcOverboughtCrossThreshold(100, 75)).toBe(100);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineStcOverboughtCrossThreshold(NaN, 75)).toBe(75);
    expect(normalizeLineStcOverboughtCrossThreshold(Infinity, 75)).toBe(75);
  });
});

describe('normalizeLineStcOverboughtCrossFactor', () => {
  it('keeps factors in (0, 1]', () => {
    expect(normalizeLineStcOverboughtCrossFactor(0.5, 0.5)).toBe(0.5);
    expect(normalizeLineStcOverboughtCrossFactor(1, 0.5)).toBe(1);
    expect(normalizeLineStcOverboughtCrossFactor(0.1, 0.5)).toBe(0.1);
  });

  it('falls back on out-of-range', () => {
    expect(normalizeLineStcOverboughtCrossFactor(0, 0.5)).toBe(0.5);
    expect(normalizeLineStcOverboughtCrossFactor(-0.1, 0.5)).toBe(0.5);
    expect(normalizeLineStcOverboughtCrossFactor(2, 0.5)).toBe(0.5);
    expect(normalizeLineStcOverboughtCrossFactor(NaN, 0.5)).toBe(0.5);
  });
});

describe('applyLineStcOverboughtCrossSma', () => {
  it('CONST -> SMA = value via short-circuit', () => {
    const out = applyLineStcOverboughtCrossSma(new Array(30).fill(42), 23);
    for (let i = 0; i < 22; i += 1) expect(out[i]).toBeNull();
    for (let i = 22; i < 30; i += 1) expect(out[i]).toBe(42);
  });

  it('CONST zero -> +0 (Object.is)', () => {
    const out = applyLineStcOverboughtCrossSma(new Array(30).fill(0), 23);
    for (let i = 22; i < 30; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });
});

describe('applyLineStcOverboughtCrossStochastic', () => {
  it('CONST -> degenerate stoch = 50', () => {
    const out = applyLineStcOverboughtCrossStochastic(
      new Array(15).fill(42),
      10,
    );
    for (let i = 0; i < 9; i += 1) expect(out[i]).toBeNull();
    for (let i = 9; i < 15; i += 1) expect(out[i]).toBe(50);
  });

  it('Ascending -> last sits at hi -> 100', () => {
    const series = Array.from({ length: 15 }, (_, i) => i);
    const out = applyLineStcOverboughtCrossStochastic(series, 10);
    for (let i = 9; i < 15; i += 1) {
      expect(out[i]).toBeCloseTo(100, 8);
    }
  });
});

describe('applyLineStcOverboughtCrossEma', () => {
  it('CONST -> EMA = value from seed onwards', () => {
    const out = applyLineStcOverboughtCrossEma(new Array(10).fill(50), 0.5);
    for (let i = 0; i < 10; i += 1) expect(out[i]).toBe(50);
  });

  it('null input -> EMA null', () => {
    const out = applyLineStcOverboughtCrossEma([null, null, 100, 100], 0.5);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(100);
    expect(out[3]).toBe(100);
  });
});

describe('computeLineStcOverboughtCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> macd=0, k1=50, d1=50, k2=50, stc=50',
    (K) => {
      const data = mk(new Array(80).fill(K));
      const { macd, k1, d1, k2, stc } = computeLineStcOverboughtCross(data);
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

describe('computeLineStcOverboughtCross - LINEAR ramps', () => {
  it('LINEAR UP -> macd=13.5, k1=50, stc=50 (cycle collapse)', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const { macd, stc } = computeLineStcOverboughtCross(data);
    for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(13.5);
    for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
  });

  it('LINEAR DOWN -> macd=-13.5, stc=50', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const { macd, stc } = computeLineStcOverboughtCross(data);
    for (let i = 49; i < 80; i += 1) expect(macd[i]).toBe(-13.5);
    for (let i = 67; i < 80; i += 1) expect(stc[i]).toBe(50);
  });
});

describe('classifyLineStcOverboughtCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStcOverboughtCrossRegime(null, 75)).toBe('none');
  });

  it('stc >= threshold -> bullish (boundary inclusive)', () => {
    expect(classifyLineStcOverboughtCrossRegime(75, 75)).toBe('bullish');
    expect(classifyLineStcOverboughtCrossRegime(100, 75)).toBe('bullish');
  });

  it('stc < threshold -> bearish', () => {
    expect(classifyLineStcOverboughtCrossRegime(50, 75)).toBe('bearish');
    expect(classifyLineStcOverboughtCrossRegime(0, 75)).toBe('bearish');
  });
});

describe('classifyLineStcOverboughtCrossBias', () => {
  it('null inputs -> none', () => {
    expect(classifyLineStcOverboughtCrossBias(null, 50)).toBe('none');
    expect(classifyLineStcOverboughtCrossBias(50, null)).toBe('none');
  });

  it('cur > prev -> up', () => {
    expect(classifyLineStcOverboughtCrossBias(80, 70)).toBe('up');
  });

  it('cur < prev -> down', () => {
    expect(classifyLineStcOverboughtCrossBias(70, 80)).toBe('down');
  });

  it('cur === prev -> flat', () => {
    expect(classifyLineStcOverboughtCrossBias(50, 50)).toBe('flat');
  });
});

describe('detectLineStcOverboughtCrossCrosses', () => {
  it('fires bullish on prev <= 75 && cur > 75 with up bias when rising', () => {
    const series = mk([1, 2, 3, 4]);
    const stc = [60, 65, 70, 80];
    const out = detectLineStcOverboughtCrossCrosses(series, stc, 75);
    expect(out).toEqual([{ index: 3, x: 3, kind: 'bullish', bias: 'up' }]);
  });

  it('fires bearish on prev >= 75 && cur < 75 with down bias', () => {
    const series = mk([1, 2, 3, 4]);
    const stc = [80, 78, 76, 70];
    const out = detectLineStcOverboughtCrossCrosses(series, stc, 75);
    expect(out).toEqual([{ index: 3, x: 3, kind: 'bearish', bias: 'down' }]);
  });

  it('boundary cur == 75 does not fire bullish (strict cur >)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineStcOverboughtCrossCrosses(series, [70, 75], 75),
    ).toEqual([]);
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2]);
    expect(
      detectLineStcOverboughtCrossCrosses(series, [null, 80], 75),
    ).toEqual([]);
    expect(
      detectLineStcOverboughtCrossCrosses(series, [80, null], 75),
    ).toEqual([]);
  });

  it('no cross when stc stays one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineStcOverboughtCrossCrosses(series, [60, 65, 70, 74], 75),
    ).toEqual([]);
  });
});

describe('runLineStcOverboughtCross', () => {
  it('CONST K -> 0 crosses, bearishCount=13 (80 bars - 67 warmup)', () => {
    const data = mk(new Array(80).fill(50));
    const run = runLineStcOverboughtCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(67);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(13);
    expect(run.fastLength).toBe(23);
    expect(run.slowLength).toBe(50);
    expect(run.cycleLength).toBe(10);
    expect(run.factor).toBe(0.5);
    expect(run.threshold).toBe(75);
  });

  it('LINEAR UP 80 -> bearish at steady state (stc=50), 0 crosses', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const run = runLineStcOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(13);
    expect(run.bullishCount).toBe(0);
    expect(run.noneCount).toBe(67);
  });

  it('LINEAR DOWN 80 -> bearish (stc=50), 0 crosses', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const run = runLineStcOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(13);
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(80).fill(50));
    expect(
      runLineStcOverboughtCross(data, { threshold: NaN }).threshold,
    ).toBe(75);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(80).fill(50));
    expect(
      runLineStcOverboughtCross(data, { threshold: 90 }).threshold,
    ).toBe(90);
    expect(
      runLineStcOverboughtCross(data, { threshold: 50 }).threshold,
    ).toBe(50);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineStcOverboughtCross([]).ok).toBe(false);
    expect(runLineStcOverboughtCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStcOverboughtCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStcOverboughtCross(data, {
      fastLength: 1,
      slowLength: 1,
      cycleLength: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry stc / bias / regime', () => {
    const data = mk(new Array(80).fill(50));
    const run = runLineStcOverboughtCross(data);
    for (let i = 67; i < 80; i += 1) {
      expect(run.samples[i]!.stc).toBe(50);
      expect(run.samples[i]!.regime).toBe('bearish');
    }
    expect(run.samples[67]!.bias).toBe('none');
    for (let i = 68; i < 80; i += 1) {
      expect(run.samples[i]!.bias).toBe('flat');
    }
  });
});

describe('computeLineStcOverboughtCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcOverboughtCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_PANEL_GAP,
    );
  });

  it('osc panel fixed at 0..100', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcOverboughtCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('threshold line sits inside osc panel', () => {
    const data = mk(new Array(80).fill(50));
    const layout = computeLineStcOverboughtCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineStcOverboughtCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stcPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const layout = computeLineStcOverboughtCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('stc path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => i));
    const layout = computeLineStcOverboughtCrossLayout({ data });
    expect(layout.stcPath.startsWith('M ')).toBe(true);
    expect((layout.stcPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(80).fill(7));
    const layout = computeLineStcOverboughtCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineStcOverboughtCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStcOverboughtCrossChart([])).toBe('No data');
  });

  it('describes parameters + overbought/bias framing', () => {
    const data = mk(new Array(80).fill(50));
    const desc = describeLineStcOverboughtCrossChart(data);
    expect(desc).toContain('STC Overbought Cross chart');
    expect(desc).toContain('80 bars');
    expect(desc).toContain('fastLength 23');
    expect(desc).toContain('slowLength 50');
    expect(desc).toContain('cycleLength 10');
    expect(desc).toContain('threshold 75');
    expect(desc).toContain('cycle overbought trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('ChartLineStcOverboughtCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(80).fill(10));
    const { container, getByRole } = render(
      <ChartLineStcOverboughtCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'STC Overbought Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
  });

  it('renders config badge with full param set', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOverboughtCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-stc-overbought-cross-badge"]',
    );
    expect(badge?.textContent).toContain('fast 23');
    expect(badge?.textContent).toContain('slow 50');
    expect(badge?.textContent).toContain('cycle 10');
    expect(badge?.textContent).toContain('factor 0.5');
    expect(badge?.textContent).toContain('threshold 75');
  });

  it('renders legend toggles for price + stc', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOverboughtCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('stc');
  });

  it('toggles stc series via legend click', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOverboughtCross data={data} />);
    const btn = container.querySelector('[data-series-id="stc"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcOverboughtCross data={data} hiddenSeries={['stc']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-stc-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(80).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStcOverboughtCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="stc"]')!);
    expect(events).toEqual([{ seriesId: 'stc', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOverboughtCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="stc"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineStcOverboughtCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=true (default) adds motion-safe fade-in', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOverboughtCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('animate=false omits class', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcOverboughtCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip target with bias', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOverboughtCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stc-overbought-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[hovers.length - 1]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-stc-overbought-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    const biasText = container.querySelector(
      '[data-section="chart-line-stc-overbought-cross-tooltip-bias"]',
    );
    expect(biasText).not.toBeNull();
  });

  it('renders threshold line by default and hides on showThreshold=false', () => {
    const data = mk(new Array(80).fill(10));
    const { container, rerender } = render(
      <ChartLineStcOverboughtCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-threshold-line"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineStcOverboughtCross data={data} showThreshold={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-threshold"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcOverboughtCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(
      <ChartLineStcOverboughtCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stc-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(80).fill(10));
    const { container } = render(<ChartLineStcOverboughtCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-stc-overbought-cross"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('23');
    expect(region?.getAttribute('data-slow-length')).toBe('50');
    expect(region?.getAttribute('data-cycle-length')).toBe('10');
    expect(region?.getAttribute('data-factor')).toBe('0.5');
    expect(region?.getAttribute('data-threshold')).toBe('75');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bearish-count')).toBe('13');
    expect(region?.getAttribute('data-bullish-count')).toBe('0');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_FAST_LENGTH).toBe(23);
    expect(DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_SLOW_LENGTH).toBe(50);
    expect(DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_CYCLE_LENGTH).toBe(10);
    expect(DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_FACTOR).toBe(0.5);
    expect(DEFAULT_CHART_LINE_STC_OVERBOUGHT_CROSS_THRESHOLD).toBe(75);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(80).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineStcOverboughtCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stc-overbought-cross',
    );
  });

  it('layout deterministic across calls (CONST)', () => {
    const data = mk(new Array(80).fill(10));
    const a = computeLineStcOverboughtCrossLayout({ data });
    const b = computeLineStcOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.thresholdY).toBe(b.thresholdY);
  });

  it('layout deterministic across calls (LINEAR DOWN)', () => {
    const data = mk(Array.from({ length: 80 }, (_, i) => -i));
    const a = computeLineStcOverboughtCrossLayout({ data });
    const b = computeLineStcOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stcPath).toBe(b.stcPath);
    expect(a.run.stcValues).toEqual(b.run.stcValues);
  });
});
