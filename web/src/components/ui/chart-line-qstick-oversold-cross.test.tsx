import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineQstickOversoldCross,
  DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_LENGTH,
  DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_PADDING,
  DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_WIDTH,
  applyLineQstickOversoldCrossSma,
  classifyLineQstickOversoldCrossRegime,
  computeLineQstickOversoldCross,
  computeLineQstickOversoldCrossLayout,
  describeLineQstickOversoldCrossChart,
  detectLineQstickOversoldCrossCrosses,
  getLineQstickOversoldCrossFinitePoints,
  normalizeLineQstickOversoldCrossLength,
  normalizeLineQstickOversoldCrossThreshold,
  runLineQstickOversoldCross,
  type ChartLineQstickOversoldCrossPoint,
} from './chart-line-qstick-oversold-cross';

const mkConst = (
  n: number,
  K: number,
): ChartLineQstickOversoldCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, open: K, close: K }));

const mkBody = (
  n: number,
  closeFn: (i: number) => number,
  openFn: (i: number) => number,
): ChartLineQstickOversoldCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    open: openFn(i),
    close: closeFn(i),
  }));

describe('getLineQstickOversoldCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, open: 10, close: 11 },
      { x: 1, open: NaN, close: 12 },
      { x: 2, open: 10, close: 11 },
      { x: 4, open: 10, close: 13 },
    ];
    expect(getLineQstickOversoldCrossFinitePoints(points)).toEqual([
      { x: 0, open: 10, close: 11 },
      { x: 2, open: 10, close: 11 },
      { x: 4, open: 10, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineQstickOversoldCrossFinitePoints(null)).toEqual([]);
    expect(getLineQstickOversoldCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineQstickOversoldCrossFinitePoints(
        'oops' as unknown as ChartLineQstickOversoldCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineQstickOversoldCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineQstickOversoldCrossLength(8, 8)).toBe(8);
  });

  it('falls back on invalid', () => {
    expect(normalizeLineQstickOversoldCrossLength(0, 8)).toBe(8);
    expect(normalizeLineQstickOversoldCrossLength(NaN, 8)).toBe(8);
  });
});

describe('normalizeLineQstickOversoldCrossThreshold', () => {
  it('accepts finite values', () => {
    expect(normalizeLineQstickOversoldCrossThreshold(-0.5, -0.5)).toBe(-0.5);
    expect(normalizeLineQstickOversoldCrossThreshold(0, -0.5)).toBe(0);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineQstickOversoldCrossThreshold(NaN, -0.5)).toBe(-0.5);
    expect(normalizeLineQstickOversoldCrossThreshold(Infinity, -0.5)).toBe(
      -0.5,
    );
  });
});

describe('applyLineQstickOversoldCrossSma', () => {
  it('CONST -> SMA = value', () => {
    const out = applyLineQstickOversoldCrossSma(new Array(15).fill(42), 8);
    for (let i = 7; i < 15; i += 1) expect(out[i]).toBe(42);
  });
});

describe('computeLineQstickOversoldCross - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST open=close=K=%d -> body=0, qstick=0',
    (K) => {
      const data = mkConst(50, K);
      const { body, qstick } = computeLineQstickOversoldCross(data);
      for (const b of body) {
        expect(b).toBe(0);
        expect(Object.is(b, -0)).toBe(false);
      }
      for (let i = 7; i < 50; i += 1) expect(qstick[i]).toBe(0);
    },
  );
});

describe('computeLineQstickOversoldCross - constant body', () => {
  it('body=+1 -> qstick=1', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i - 1,
    );
    const { qstick } = computeLineQstickOversoldCross(data);
    for (let i = 7; i < 50; i += 1) expect(qstick[i]).toBe(1);
  });

  it('body=-1 -> qstick=-1', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i + 1,
    );
    const { qstick } = computeLineQstickOversoldCross(data);
    for (let i = 7; i < 50; i += 1) expect(qstick[i]).toBe(-1);
  });
});

describe('classifyLineQstickOversoldCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineQstickOversoldCrossRegime(null, -0.5)).toBe('none');
  });

  it('qstick >= threshold -> bullish (above oversold)', () => {
    expect(classifyLineQstickOversoldCrossRegime(-0.5, -0.5)).toBe(
      'bullish',
    );
    expect(classifyLineQstickOversoldCrossRegime(0, -0.5)).toBe('bullish');
    expect(classifyLineQstickOversoldCrossRegime(1, -0.5)).toBe('bullish');
  });

  it('qstick < threshold -> bearish (in oversold)', () => {
    expect(classifyLineQstickOversoldCrossRegime(-1, -0.5)).toBe('bearish');
    expect(classifyLineQstickOversoldCrossRegime(-2, -0.5)).toBe('bearish');
  });
});

describe('detectLineQstickOversoldCrossCrosses', () => {
  const series = mkConst(4, 0);

  it('fires bullish on prev <= -0.5 && cur > -0.5', () => {
    const out = detectLineQstickOversoldCrossCrosses(
      series,
      [-1, -0.8, -0.6, -0.2],
      -0.5,
    );
    expect(out).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish on prev >= -0.5 && cur < -0.5', () => {
    const out = detectLineQstickOversoldCrossCrosses(
      series,
      [0, -0.2, -0.4, -1],
      -0.5,
    );
    expect(out).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('boundary cur == -0.5 not crossed', () => {
    const two = mkConst(2, 0);
    expect(
      detectLineQstickOversoldCrossCrosses(two, [-1, -0.5], -0.5),
    ).toEqual([]);
  });

  it('skips when prev/cur is null', () => {
    const two = mkConst(2, 0);
    expect(
      detectLineQstickOversoldCrossCrosses(two, [null, 0], -0.5),
    ).toEqual([]);
    expect(
      detectLineQstickOversoldCrossCrosses(two, [0, null], -0.5),
    ).toEqual([]);
  });

  it('no cross when qstick stays one side', () => {
    expect(
      detectLineQstickOversoldCrossCrosses(
        series,
        [-2, -1.5, -1, -0.8],
        -0.5,
      ),
    ).toEqual([]);
  });
});

describe('runLineQstickOversoldCross', () => {
  it('CONST K -> bullish (0 >= -0.5), 0 crosses', () => {
    const data = mkConst(50, 50);
    const run = runLineQstickOversoldCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(7);
    expect(run.bullishCount).toBe(43);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(8);
    expect(run.threshold).toBe(-0.5);
  });

  it('body=+1 -> bullish (qstick=1 >= -0.5), 0 crosses', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i - 1,
    );
    const run = runLineQstickOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(43);
    expect(run.bearishCount).toBe(0);
  });

  it('body=-1 -> bearish (qstick=-1 < -0.5), 0 crosses', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i + 1,
    );
    const run = runLineQstickOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(43);
  });

  it('respects custom length and threshold', () => {
    const data = mkConst(50, 50);
    expect(runLineQstickOversoldCross(data, { length: 5 }).length).toBe(5);
    expect(
      runLineQstickOversoldCross(data, { threshold: -1 }).threshold,
    ).toBe(-1);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineQstickOversoldCross([]).ok).toBe(false);
    expect(
      runLineQstickOversoldCross([{ x: 0, open: 1, close: 1 }]).ok,
    ).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineQstickOversoldCrossPoint[] = [
      { x: 3, open: 30, close: 31 },
      { x: 1, open: 10, close: 11 },
      { x: 2, open: 20, close: 21 },
    ];
    const run = runLineQstickOversoldCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry full fields', () => {
    const data = mkConst(50, 50);
    const run = runLineQstickOversoldCross(data);
    for (let i = 7; i < 50; i += 1) {
      expect(run.samples[i]!.body).toBe(0);
      expect(run.samples[i]!.qstick).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineQstickOversoldCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mkConst(50, 50);
    const layout = computeLineQstickOversoldCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_PANEL_GAP,
    );
  });

  it('CONST K -> qstick=0, threshold=-0.5 -> auto-fit (-0.5..0) padded', () => {
    const data = mkConst(50, 50);
    const layout = computeLineQstickOversoldCrossLayout({ data });
    // qstick=0, threshold=-0.5. range = [-0.5, 0]. padding 10% -> [-0.55, 0.05].
    expect(layout.oscMin).toBeCloseTo(-0.55, 6);
    expect(layout.oscMax).toBeCloseTo(0.05, 6);
  });

  it('body=-1 -> qstick=-1 -> auto-fit (-1..-0.5) padded', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i + 1,
    );
    const layout = computeLineQstickOversoldCrossLayout({ data });
    // qstick=-1 < -0.5. range = [-1, -0.5]. padding 10% -> [-1.05, -0.45].
    expect(layout.oscMin).toBeCloseTo(-1.05, 6);
    expect(layout.oscMax).toBeCloseTo(-0.45, 6);
  });

  it('threshold line sits inside osc panel', () => {
    const data = mkConst(50, 50);
    const layout = computeLineQstickOversoldCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineQstickOversoldCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.qstickPath).toBe('');
  });

  it('path uses M then L commands', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i - 1,
    );
    const layout = computeLineQstickOversoldCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('qstick single M when no gaps', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i - 1,
    );
    const layout = computeLineQstickOversoldCrossLayout({ data });
    expect((layout.qstickPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value close', () => {
    const data = mkConst(50, 7);
    const layout = computeLineQstickOversoldCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineQstickOversoldCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineQstickOversoldCrossChart([])).toBe('No data');
  });

  it('describes parameters + candle body framing', () => {
    const data = mkConst(50, 50);
    const desc = describeLineQstickOversoldCrossChart(data);
    expect(desc).toContain('QStick Oversold Cross chart');
    expect(desc).toContain('threshold -0.5');
    expect(desc).toContain('candle body momentum oversold');
  });
});

describe('ChartLineQstickOversoldCross rendering', () => {
  it('renders region + role=img', () => {
    const data = mkConst(50, 10);
    const { container, getByRole } = render(
      <ChartLineQstickOversoldCross data={data} />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe(
      'QStick Oversold Cross chart',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders config badge', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickOversoldCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-qstick-oversold-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 8');
    expect(badge?.textContent).toContain('threshold -0.5');
  });

  it('renders legend toggles for price + qstick', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickOversoldCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
  });

  it('toggles qstick via legend click', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickOversoldCross data={data} />,
    );
    const btn = container.querySelector('[data-series-id="qstick"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickOversoldCross data={data} hiddenSeries={['qstick']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-qstick-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mkConst(50, 10);
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineQstickOversoldCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="qstick"]')!);
    expect(events).toEqual([{ seriesId: 'qstick', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickOversoldCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="qstick"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(
      <ChartLineQstickOversoldCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mkConst(50, 10);
    const { container, rerender } = render(
      <ChartLineQstickOversoldCross data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineQstickOversoldCross data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip with body row', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickOversoldCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-qstick-oversold-cross-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-tooltip-body"]',
      ),
    ).not.toBeNull();
  });

  it('threshold hide flag', () => {
    const data = mkConst(50, 10);
    const { container, rerender } = render(
      <ChartLineQstickOversoldCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-threshold-line"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineQstickOversoldCross data={data} showThreshold={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-threshold"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickOversoldCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickOversoldCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-oversold-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickOversoldCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-qstick-oversold-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('8');
    expect(region?.getAttribute('data-threshold')).toBe('-0.5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('43');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_LENGTH).toBe(8);
    expect(DEFAULT_CHART_LINE_QSTICK_OVERSOLD_CROSS_THRESHOLD).toBe(-0.5);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mkConst(50, 10);
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineQstickOversoldCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-qstick-oversold-cross',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mkConst(50, 10);
    const a = computeLineQstickOversoldCrossLayout({ data });
    const b = computeLineQstickOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.qstickPath).toBe(b.qstickPath);
  });

  it('layout deterministic (body=-1)', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i + 1,
    );
    const a = computeLineQstickOversoldCrossLayout({ data });
    const b = computeLineQstickOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.qstickPath).toBe(b.qstickPath);
    expect(a.run.qstickValues).toEqual(b.run.qstickValues);
  });
});
