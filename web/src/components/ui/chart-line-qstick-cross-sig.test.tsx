import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineQstickCrossSig,
  DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_K_SMOOTHING,
  DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_LENGTH,
  DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_WIDTH,
  applyLineQstickCrossSigSma,
  classifyLineQstickCrossSigRegime,
  computeLineQstickCrossSig,
  computeLineQstickCrossSigLayout,
  describeLineQstickCrossSigChart,
  detectLineQstickCrossSigCrosses,
  getLineQstickCrossSigFinitePoints,
  normalizeLineQstickCrossSigLength,
  runLineQstickCrossSig,
  type ChartLineQstickCrossSigPoint,
} from './chart-line-qstick-cross-sig';

const mkConst = (
  n: number,
  K: number,
): ChartLineQstickCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, open: K, close: K }));

const mkBody = (
  n: number,
  closeFn: (i: number) => number,
  openFn: (i: number) => number,
): ChartLineQstickCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    open: openFn(i),
    close: closeFn(i),
  }));

describe('getLineQstickCrossSigFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, open: 10, close: 11 },
      { x: 1, open: NaN, close: 12 },
      { x: 2, open: 10, close: 11 },
      { x: Infinity, open: 10, close: 12 },
      { x: 3, open: 10, close: -Infinity },
      { x: 4, open: 10, close: 13 },
    ];
    expect(getLineQstickCrossSigFinitePoints(points)).toEqual([
      { x: 0, open: 10, close: 11 },
      { x: 2, open: 10, close: 11 },
      { x: 4, open: 10, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineQstickCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineQstickCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineQstickCrossSigFinitePoints(
        'oops' as unknown as ChartLineQstickCrossSigPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineQstickCrossSigLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineQstickCrossSigLength(8, 8)).toBe(8);
    expect(normalizeLineQstickCrossSigLength(1, 8)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineQstickCrossSigLength(7.9, 8)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineQstickCrossSigLength(0, 8)).toBe(8);
    expect(normalizeLineQstickCrossSigLength(-1, 8)).toBe(8);
    expect(normalizeLineQstickCrossSigLength(NaN, 8)).toBe(8);
  });
});

describe('applyLineQstickCrossSigSma', () => {
  it('CONST -> SMA = value via short-circuit', () => {
    const out = applyLineQstickCrossSigSma(new Array(15).fill(42), 8);
    for (let i = 0; i < 7; i += 1) expect(out[i]).toBeNull();
    for (let i = 7; i < 15; i += 1) expect(out[i]).toBe(42);
  });

  it('CONST zero -> SMA = 0 (Object.is +0)', () => {
    const out = applyLineQstickCrossSigSma(new Array(15).fill(0), 8);
    for (let i = 7; i < 15; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });
});

describe('computeLineQstickCrossSig - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST open=close=K=%d -> body=0, qstick=0, signal=0',
    (K) => {
      const data = mkConst(50, K);
      const { body, qstick, signal } = computeLineQstickCrossSig(data, {
        length: 8,
        kSmoothing: 3,
      });
      for (const b of body) {
        expect(b).toBe(0);
        expect(Object.is(b, -0)).toBe(false);
      }
      for (let i = 0; i < 7; i += 1) expect(qstick[i]).toBeNull();
      for (let i = 7; i < 50; i += 1) expect(qstick[i]).toBe(0);
      for (let i = 0; i < 9; i += 1) expect(signal[i]).toBeNull();
      for (let i = 9; i < 50; i += 1) expect(signal[i]).toBe(0);
    },
  );
});

describe('computeLineQstickCrossSig - constant body', () => {
  it('body=+1 -> qstick=1, signal=1', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i - 1,
    );
    const { qstick, signal } = computeLineQstickCrossSig(data, {
      length: 8,
      kSmoothing: 3,
    });
    for (let i = 7; i < 50; i += 1) expect(qstick[i]).toBe(1);
    for (let i = 9; i < 50; i += 1) expect(signal[i]).toBe(1);
  });

  it('body=-1 -> qstick=-1, signal=-1', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i + 1,
    );
    const { qstick, signal } = computeLineQstickCrossSig(data, {
      length: 8,
      kSmoothing: 3,
    });
    for (let i = 7; i < 50; i += 1) expect(qstick[i]).toBe(-1);
    for (let i = 9; i < 50; i += 1) expect(signal[i]).toBe(-1);
  });
});

describe('classifyLineQstickCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineQstickCrossSigRegime(null, 0)).toBe('none');
    expect(classifyLineQstickCrossSigRegime(0, null)).toBe('none');
  });

  it('qstick >= signal -> bullish (boundary inclusive)', () => {
    expect(classifyLineQstickCrossSigRegime(0, 0)).toBe('bullish');
    expect(classifyLineQstickCrossSigRegime(2, 1)).toBe('bullish');
    expect(classifyLineQstickCrossSigRegime(-1, -1)).toBe('bullish');
  });

  it('qstick < signal -> bearish', () => {
    expect(classifyLineQstickCrossSigRegime(0, 0.001)).toBe('bearish');
    expect(classifyLineQstickCrossSigRegime(-2, -1)).toBe('bearish');
  });
});

describe('detectLineQstickCrossSigCrosses', () => {
  const series = mkConst(4, 0);

  it('fires bullish when qstick crosses up through signal', () => {
    const qstick = [-1, -0.5, 0.5, 1];
    const signal = [0, 0, 0, 0];
    expect(
      detectLineQstickCrossSigCrosses(series, qstick, signal),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });

  it('fires bearish when qstick crosses down through signal', () => {
    const qstick = [1, 0.5, -0.5, -1];
    const signal = [0, 0, 0, 0];
    expect(
      detectLineQstickCrossSigCrosses(series, qstick, signal),
    ).toEqual([{ index: 2, x: 2, kind: 'bearish' }]);
  });

  it('emits both kinds on a sweep through signal', () => {
    const qstick = [-1, 1, 0.5, -0.5];
    const signal = [0, 0, 0, 0];
    const out = detectLineQstickCrossSigCrosses(series, qstick, signal);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });

  it('skips when any value is null', () => {
    const two = mkConst(2, 0);
    expect(
      detectLineQstickCrossSigCrosses(two, [null, 1], [0, 0]),
    ).toEqual([]);
    expect(
      detectLineQstickCrossSigCrosses(two, [1, null], [0, 0]),
    ).toEqual([]);
    expect(
      detectLineQstickCrossSigCrosses(two, [1, 2], [null, 0]),
    ).toEqual([]);
    expect(
      detectLineQstickCrossSigCrosses(two, [1, 2], [0, null]),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > signal)', () => {
    const two = mkConst(2, 0);
    expect(
      detectLineQstickCrossSigCrosses(two, [0, 0], [0, 0]),
    ).toEqual([]);
    expect(
      detectLineQstickCrossSigCrosses(two, [-1, 0], [0, 0]),
    ).toEqual([]);
  });

  it('no cross when qstick stays on one side', () => {
    expect(
      detectLineQstickCrossSigCrosses(
        series,
        [-2, -1.5, -1, -0.5],
        [0, 0, 0, 0],
      ),
    ).toEqual([]);
  });
});

describe('runLineQstickCrossSig', () => {
  it('CONST K -> 0 crosses, noneCount=9, bullishCount=41 (50 bars)', () => {
    const data = mkConst(50, 50);
    const run = runLineQstickCrossSig(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(9);
    expect(run.bullishCount).toBe(41);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(8);
    expect(run.kSmoothing).toBe(3);
  });

  it('body=+1 -> bullish steady state (qstick==signal=1), 0 crosses', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i - 1,
    );
    const run = runLineQstickCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(41);
    expect(run.bearishCount).toBe(0);
    expect(run.noneCount).toBe(9);
  });

  it('body=-1 -> bullish at boundary (qstick==signal=-1), 0 crosses', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i + 1,
    );
    const run = runLineQstickCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(41);
    expect(run.bearishCount).toBe(0);
  });

  it('respects custom length and kSmoothing', () => {
    const data = mkConst(50, 50);
    expect(
      runLineQstickCrossSig(data, { length: 5 }).length,
    ).toBe(5);
    expect(
      runLineQstickCrossSig(data, { kSmoothing: 5 }).kSmoothing,
    ).toBe(5);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineQstickCrossSig([]).ok).toBe(false);
    expect(
      runLineQstickCrossSig([
        { x: 0, open: 1, close: 1 },
        { x: 1, open: 1, close: 1 },
      ]).ok,
    ).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineQstickCrossSigPoint[] = [
      { x: 3, open: 30, close: 31 },
      { x: 1, open: 10, close: 11 },
      { x: 2, open: 20, close: 21 },
    ];
    const run = runLineQstickCrossSig(data, { length: 1, kSmoothing: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / open / close / body / qstick / signal / regime', () => {
    const data = mkConst(50, 50);
    const run = runLineQstickCrossSig(data);
    expect(run.samples).toHaveLength(50);
    for (let i = 0; i < 7; i += 1) {
      expect(run.samples[i]!.qstick).toBeNull();
    }
    for (let i = 9; i < 50; i += 1) {
      expect(run.samples[i]!.body).toBe(0);
      expect(run.samples[i]!.qstick).toBe(0);
      expect(run.samples[i]!.signal).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineQstickCrossSigLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mkConst(50, 50);
    const layout = computeLineQstickCrossSigLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_PANEL_GAP,
    );
  });

  it('CONST K -> qstick=0 -> symmetric default range [-1, 1]', () => {
    const data = mkConst(50, 50);
    const layout = computeLineQstickCrossSigLayout({ data });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('body=+1 -> qstick=1 -> symmetric range -1.1 .. 1.1', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i - 1,
    );
    const layout = computeLineQstickCrossSigLayout({ data });
    expect(layout.oscMin).toBeCloseTo(-1.1, 6);
    expect(layout.oscMax).toBeCloseTo(1.1, 6);
  });

  it('zero line sits inside osc panel', () => {
    const data = mkConst(50, 50);
    const layout = computeLineQstickCrossSigLayout({ data });
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineQstickCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.qstickPath).toBe('');
    expect(layout.signalPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i - 1,
    );
    const layout = computeLineQstickCrossSigLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('qstick and signal paths skip null gaps with new M commands', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i - 1,
    );
    const layout = computeLineQstickCrossSigLayout({ data });
    expect(layout.qstickPath.startsWith('M ')).toBe(true);
    expect(layout.signalPath.startsWith('M ')).toBe(true);
    expect((layout.qstickPath.match(/M /g) ?? []).length).toBe(1);
    expect((layout.signalPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value close', () => {
    const data = mkConst(50, 7);
    const layout = computeLineQstickCrossSigLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineQstickCrossSigChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineQstickCrossSigChart([])).toBe('No data');
  });

  it('describes bar count + parameters + candle-body framing', () => {
    const data = mkConst(50, 50);
    const desc = describeLineQstickCrossSigChart(data);
    expect(desc).toContain('QStick Signal Cross chart');
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 8');
    expect(desc).toContain('kSmoothing 3');
    expect(desc).toContain('smoothed candle-body');
    expect(desc).toContain('close - open');
  });
});

describe('ChartLineQstickCrossSig rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mkConst(50, 10);
    const { container, getByRole } = render(
      <ChartLineQstickCrossSig data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'QStick Signal Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-qstick-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('QStick Signal Cross chart');
  });

  it('renders config badge', () => {
    const data = mkConst(50, 10);
    const { container } = render(<ChartLineQstickCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-qstick-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('length 8');
    expect(badge?.textContent).toContain('kSmoothing 3');
  });

  it('renders legend toggles for price + qstick + signal', () => {
    const data = mkConst(50, 10);
    const { container } = render(<ChartLineQstickCrossSig data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('qstick');
    expect(buttons[2].getAttribute('data-series-id')).toBe('signal');
  });

  it('toggles qstick via legend click', () => {
    const data = mkConst(50, 10);
    const { container } = render(<ChartLineQstickCrossSig data={data} />);
    const btn = container.querySelector('[data-series-id="qstick"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries for qstick', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickCrossSig data={data} hiddenSeries={['qstick']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-qstick-path"]',
      ),
    ).toBeNull();
  });

  it('respects controlled hiddenSeries for signal', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mkConst(50, 10);
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineQstickCrossSig
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="signal"]')!);
    expect(events).toEqual([{ seriesId: 'signal', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mkConst(50, 10);
    const { container } = render(<ChartLineQstickCrossSig data={data} />);
    const btn = container.querySelector(
      '[data-series-id="qstick"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineQstickCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickCrossSig data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mkConst(50, 10);
    const { container } = render(<ChartLineQstickCrossSig data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mkConst(50, 10);
    const { container } = render(<ChartLineQstickCrossSig data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-qstick-cross-sig-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-qstick-cross-sig-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders zero line by default', () => {
    const data = mkConst(50, 10);
    const { container } = render(<ChartLineQstickCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('showZero=false hides zero line', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickCrossSig data={data} showZero={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-zero"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickCrossSig
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses=false / showOverlayCrosses=false hide markers', () => {
    const data = mkConst(50, 10);
    const { container } = render(
      <ChartLineQstickCrossSig
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mkConst(50, 10);
    const { container } = render(<ChartLineQstickCrossSig data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-qstick-cross-sig"]',
    );
    expect(region?.getAttribute('data-length')).toBe('8');
    expect(region?.getAttribute('data-k-smoothing')).toBe('3');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('41');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults: length=8, kSmoothing=3', () => {
    expect(DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_LENGTH).toBe(8);
    expect(DEFAULT_CHART_LINE_QSTICK_CROSS_SIG_K_SMOOTHING).toBe(3);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mkConst(50, 10);
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineQstickCrossSig data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-qstick-cross-sig',
    );
  });

  it('layout deterministic across calls for default CONST 50 bars', () => {
    const data = mkConst(50, 10);
    const a = computeLineQstickCrossSigLayout({ data });
    const b = computeLineQstickCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.qstickPath).toBe(b.qstickPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for body=-1 pattern', () => {
    const data = mkBody(
      50,
      (i) => i,
      (i) => i + 1,
    );
    const a = computeLineQstickCrossSigLayout({ data });
    const b = computeLineQstickCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.qstickPath).toBe(b.qstickPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.qstickValues).toEqual(b.run.qstickValues);
    expect(a.run.signalValues).toEqual(b.run.signalValues);
  });
});
