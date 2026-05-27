import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineQstickZeroCross,
  DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_WIDTH,
  applyLineQstickZeroCrossSma,
  classifyLineQstickZeroCrossRegime,
  computeLineQstickZeroCross,
  computeLineQstickZeroCrossLayout,
  describeLineQstickZeroCrossChart,
  detectLineQstickZeroCrossCrosses,
  getLineQstickZeroCrossFinitePoints,
  normalizeLineQstickZeroCrossLength,
  normalizeLineQstickZeroCrossThreshold,
  runLineQstickZeroCross,
  type ChartLineQstickZeroCrossPoint,
} from './chart-line-qstick-zero-cross';

const mk = (
  pairs: Array<[number, number]>,
): ChartLineQstickZeroCrossPoint[] =>
  pairs.map(([open, close], i) => ({ x: i, open, close }));

const mkConst = (K: number, n: number): ChartLineQstickZeroCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, open: K, close: K }));

const mkBody = (
  body: number,
  n: number,
): ChartLineQstickZeroCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    open: i,
    close: i + body,
  }));

describe('getLineQstickZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, open: 10, close: 11 },
      { x: 1, open: NaN, close: 12 },
      { x: 2, open: 11, close: NaN },
      { x: Infinity, open: 10, close: 11 },
      { x: 3, open: 10, close: 11 },
    ];
    expect(getLineQstickZeroCrossFinitePoints(points)).toEqual([
      { x: 0, open: 10, close: 11 },
      { x: 3, open: 10, close: 11 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineQstickZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineQstickZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineQstickZeroCrossFinitePoints(
        'oops' as unknown as ChartLineQstickZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineQstickZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineQstickZeroCrossLength(14, 14)).toBe(14);
    expect(normalizeLineQstickZeroCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineQstickZeroCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineQstickZeroCrossLength(0, 14)).toBe(14);
    expect(normalizeLineQstickZeroCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineQstickZeroCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineQstickZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineQstickZeroCrossThreshold(0, -1)).toBe(0);
    expect(normalizeLineQstickZeroCrossThreshold(2, -1)).toBe(2);
    expect(normalizeLineQstickZeroCrossThreshold(-2, -1)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineQstickZeroCrossThreshold(NaN, -1)).toBe(-1);
    expect(normalizeLineQstickZeroCrossThreshold(Infinity, -1)).toBe(-1);
  });
});

describe('applyLineQstickZeroCrossSma', () => {
  it('CONST values short-circuit to exact value', () => {
    const out = applyLineQstickZeroCrossSma(new Array(20).fill(0), 14);
    for (let i = 0; i < 13; i += 1) {
      expect(out[i]).toBeNull();
    }
    for (let i = 13; i < 20; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('length === 1 returns values verbatim', () => {
    expect(applyLineQstickZeroCrossSma([1, -2, 3], 1)).toEqual([1, -2, 3]);
  });
});

describe('computeLineQstickZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST open=close=K=%d -> qstick = 0 from index length-1 onward',
    (K) => {
      const data = mkConst(K, 30);
      const { qstick, body } = computeLineQstickZeroCross(data, {
        length: 14,
      });
      for (let i = 0; i < 13; i += 1) {
        expect(qstick[i]).toBeNull();
      }
      for (let i = 13; i < 30; i += 1) {
        expect(qstick[i]).toBe(0);
      }
      for (const b of body) {
        expect(b).toBe(0);
      }
    },
  );
});

describe('computeLineQstickZeroCross - LINEAR / CONST body anchors', () => {
  it('body = +2 constant -> qstick = +2 constant', () => {
    const data = mkBody(2, 30);
    const { qstick } = computeLineQstickZeroCross(data, { length: 14 });
    for (let i = 13; i < 30; i += 1) {
      expect(qstick[i]).toBe(2);
    }
  });

  it('body = -2 constant -> qstick = -2 constant', () => {
    const data = mkBody(-2, 30);
    const { qstick } = computeLineQstickZeroCross(data, { length: 14 });
    for (let i = 13; i < 30; i += 1) {
      expect(qstick[i]).toBe(-2);
    }
  });

  it('qstick[i < length-1] is null', () => {
    const data = mkBody(1, 30);
    const { qstick } = computeLineQstickZeroCross(data, { length: 14 });
    for (let i = 0; i < 13; i += 1) {
      expect(qstick[i]).toBeNull();
    }
  });

  it('custom length=5 works', () => {
    const data = mkBody(3, 10);
    const { qstick } = computeLineQstickZeroCross(data, { length: 5 });
    for (let i = 0; i < 4; i += 1) {
      expect(qstick[i]).toBeNull();
    }
    for (let i = 4; i < 10; i += 1) {
      expect(qstick[i]).toBe(3);
    }
  });

  it('alternating bodies sum to zero', () => {
    const data: ChartLineQstickZeroCrossPoint[] = [];
    for (let i = 0; i < 14; i += 1) {
      const b = i % 2 === 0 ? 1 : -1;
      data.push({ x: i, open: 0, close: b });
    }
    const { qstick } = computeLineQstickZeroCross(data, { length: 14 });
    expect(qstick[13]).toBe(0);
  });

  it('body array carries close - open exactly', () => {
    const data = mk([
      [10, 11],
      [20, 18],
      [30, 30],
    ]);
    const { body } = computeLineQstickZeroCross(data, { length: 1 });
    expect(body).toEqual([1, -2, 0]);
  });
});

describe('classifyLineQstickZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineQstickZeroCrossRegime(null, 0)).toBe('none');
  });

  it('qstick at threshold boundary -> bullish', () => {
    expect(classifyLineQstickZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineQstickZeroCrossRegime(5, 0)).toBe('bullish');
  });

  it('qstick < threshold -> bearish', () => {
    expect(classifyLineQstickZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineQstickZeroCrossRegime(-5, 0)).toBe('bearish');
  });
});

describe('detectLineQstickZeroCrossCrosses', () => {
  it('fires bullish when qstick crosses up through 0', () => {
    const series = mk([
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
    const qstick = [-2, -1, -0.5, 0.5, 1];
    const crosses = detectLineQstickZeroCrossCrosses(series, qstick, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when qstick crosses down through 0', () => {
    const series = mk([
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
    const qstick = [2, 1, 0.5, -0.5, -1];
    const crosses = detectLineQstickZeroCrossCrosses(series, qstick, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
    const qstick = [-1, 1, 0.5, -1];
    const crosses = detectLineQstickZeroCrossCrosses(series, qstick, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
    expect(
      detectLineQstickZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineQstickZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([
      [1, 1],
      [1, 1],
    ]);
    expect(detectLineQstickZeroCrossCrosses(series, [-1, 0], 0)).toEqual([]);
  });

  it('no cross when qstick stays on one side', () => {
    const series = mk([
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
    expect(
      detectLineQstickZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLineQstickZeroCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mkConst(50, 30);
    const run = runLineQstickZeroCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(13);
    expect(run.bullishCount).toBe(17);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(14);
  });

  it('body = +2 -> all bullish after warmup', () => {
    const data = mkBody(2, 30);
    const run = runLineQstickZeroCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(17);
    expect(run.bearishCount).toBe(0);
  });

  it('body = -2 -> all bearish after warmup', () => {
    const data = mkBody(-2, 30);
    const run = runLineQstickZeroCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(17);
  });

  it('bearish then bullish bodies generate bullish cross', () => {
    const data: ChartLineQstickZeroCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      data.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      data.push({ x: i, open: i, close: i + 2 });
    }
    const run = runLineQstickZeroCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('bullish then bearish bodies generate bearish cross', () => {
    const data: ChartLineQstickZeroCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      data.push({ x: i, open: i, close: i + 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      data.push({ x: i, open: i, close: i - 2 });
    }
    const run = runLineQstickZeroCross(data);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mkConst(10, 30);
    const run = runLineQstickZeroCross(data, { threshold: NaN });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive / negative threshold', () => {
    const data = mkConst(10, 30);
    expect(runLineQstickZeroCross(data, { threshold: 5 }).threshold).toBe(5);
    expect(runLineQstickZeroCross(data, { threshold: -3 }).threshold).toBe(-3);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineQstickZeroCross([]).ok).toBe(false);
    expect(runLineQstickZeroCross(mkConst(0, 3)).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineQstickZeroCrossPoint[] = [
      { x: 3, open: 0, close: 0 },
      { x: 1, open: 0, close: 0 },
      { x: 2, open: 0, close: 0 },
    ];
    const run = runLineQstickZeroCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / open / close / body / qstick / regime', () => {
    const data = mkConst(10, 30);
    const run = runLineQstickZeroCross(data);
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 13; i += 1) {
      expect(run.samples[i]!.qstick).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
      expect(run.samples[i]!.body).toBe(0);
    }
    for (let i = 13; i < 30; i += 1) {
      expect(run.samples[i]!.qstick).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineQstickZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mkConst(50, 30);
    const layout = computeLineQstickZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_PANEL_GAP,
    );
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mkBody(2, 30);
    const layout = computeLineQstickZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineQstickZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.qstickPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed qstick values plus padding', () => {
    const data = mkBody(2, 30);
    const layout = computeLineQstickZeroCrossLayout({ data });
    // qstick = 2 constant, threshold = 0; oscMin <= 0, oscMax >= 2
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(2);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mkBody(2, 30);
    const layout = computeLineQstickZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('qstick path skips null gaps with new M commands', () => {
    const data = mkBody(2, 30);
    const layout = computeLineQstickZeroCrossLayout({ data });
    expect(layout.qstickPath.startsWith('M ')).toBe(true);
    const mCount = (layout.qstickPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mkConst(7, 30);
    const layout = computeLineQstickZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const data: ChartLineQstickZeroCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      data.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      data.push({ x: i, open: i, close: i + 2 });
    }
    const layout = computeLineQstickZeroCrossLayout({ data });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineQstickZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineQstickZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mkConst(50, 30);
    const desc = describeLineQstickZeroCrossChart(data);
    expect(desc).toContain('QStick Zero Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineQstickZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mkConst(10, 30);
    const { container, getByRole } = render(
      <ChartLineQstickZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'QStick Zero Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-qstick-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('QStick Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mkConst(10, 30);
    const { container } = render(<ChartLineQstickZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-qstick-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + qstick', () => {
    const data = mkConst(10, 30);
    const { container } = render(<ChartLineQstickZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('qstick');
  });

  it('toggles series visibility via legend click', () => {
    const data = mkConst(10, 30);
    const { container } = render(<ChartLineQstickZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="qstick"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mkConst(10, 30);
    const { container, rerender } = render(
      <ChartLineQstickZeroCross data={data} hiddenSeries={['qstick']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-qstick-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineQstickZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-qstick-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mkConst(10, 30);
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineQstickZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="qstick"]')!);
    expect(events).toEqual([{ seriesId: 'qstick', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mkConst(10, 30);
    const { container } = render(<ChartLineQstickZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="qstick"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineQstickZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mkConst(10, 30);
    const { container } = render(
      <ChartLineQstickZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mkConst(10, 30);
    const { container } = render(<ChartLineQstickZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mkConst(10, 30);
    const { container } = render(<ChartLineQstickZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-qstick-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-qstick-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mkConst(10, 30);
    const { container } = render(<ChartLineQstickZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mkConst(10, 30);
    const { container } = render(
      <ChartLineQstickZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mkConst(10, 30);
    const { container } = render(
      <ChartLineQstickZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after sign-flipping bodies pattern', () => {
    const data: ChartLineQstickZeroCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      data.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      data.push({ x: i, open: i, close: i + 2 });
    }
    const { container } = render(<ChartLineQstickZeroCross data={data} />);
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-qstick-zero-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const data: ChartLineQstickZeroCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      data.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      data.push({ x: i, open: i, close: i + 2 });
    }
    const { container } = render(
      <ChartLineQstickZeroCross data={data} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const data: ChartLineQstickZeroCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      data.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      data.push({ x: i, open: i, close: i + 2 });
    }
    const { container } = render(
      <ChartLineQstickZeroCross data={data} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mkConst(10, 30);
    const { container } = render(<ChartLineQstickZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-qstick-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('17');
  });

  it('defaults: length=14, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_QSTICK_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mkConst(10, 30);
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineQstickZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-qstick-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mkConst(10, 30);
    const a = computeLineQstickZeroCrossLayout({ data });
    const b = computeLineQstickZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.qstickPath).toBe(b.qstickPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for sign-flipping pattern', () => {
    const data: ChartLineQstickZeroCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      data.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      data.push({ x: i, open: i, close: i + 2 });
    }
    const a = computeLineQstickZeroCrossLayout({ data });
    const b = computeLineQstickZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.qstickPath).toBe(b.qstickPath);
    expect(a.run.qstickValues).toEqual(b.run.qstickValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
