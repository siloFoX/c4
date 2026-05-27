import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineQstickMidCross,
  DEFAULT_CHART_LINE_QSTICK_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_QSTICK_MID_CROSS_LENGTH,
  DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_QSTICK_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_QSTICK_MID_CROSS_WIDTH,
  applyLineQstickMidCrossSma,
  classifyLineQstickMidCrossRegime,
  computeLineQstickMidCross,
  computeLineQstickMidCrossLayout,
  describeLineQstickMidCrossChart,
  detectLineQstickMidCrossCrosses,
  getLineQstickMidCrossFinitePoints,
  normalizeLineQstickMidCrossLength,
  normalizeLineQstickMidCrossThreshold,
  runLineQstickMidCross,
  type ChartLineQstickMidCrossPoint,
} from './chart-line-qstick-mid-cross';

const mk = (
  pairs: Array<[number, number]>,
): ChartLineQstickMidCrossPoint[] =>
  pairs.map(([o, c], i) => ({ x: i, open: o, close: c }));

const mkFlat = (n: number, value: number): ChartLineQstickMidCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, open: value, close: value }));

const mkBody = (
  n: number,
  body: number,
): ChartLineQstickMidCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    open: i,
    close: i + body,
  }));

describe('getLineQstickMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, open: 10, close: 12 },
      { x: 1, open: NaN, close: 12 },
      { x: 2, open: 10, close: 11 },
      { x: Infinity, open: 10, close: 12 },
      { x: 3, open: 10, close: -Infinity },
      { x: 4, open: 10, close: 13 },
    ];
    expect(getLineQstickMidCrossFinitePoints(points)).toEqual([
      { x: 0, open: 10, close: 12 },
      { x: 2, open: 10, close: 11 },
      { x: 4, open: 10, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineQstickMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineQstickMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineQstickMidCrossFinitePoints(
        'oops' as unknown as ChartLineQstickMidCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineQstickMidCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineQstickMidCrossLength(14, 14)).toBe(14);
    expect(normalizeLineQstickMidCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineQstickMidCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineQstickMidCrossLength(0, 14)).toBe(14);
    expect(normalizeLineQstickMidCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineQstickMidCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineQstickMidCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineQstickMidCrossThreshold(0, 0)).toBe(0);
    expect(normalizeLineQstickMidCrossThreshold(1, 0)).toBe(1);
    expect(normalizeLineQstickMidCrossThreshold(-1, 0)).toBe(-1);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineQstickMidCrossThreshold(NaN, 0)).toBe(0);
    expect(normalizeLineQstickMidCrossThreshold(Infinity, 0)).toBe(0);
  });
});

describe('applyLineQstickMidCrossSma', () => {
  it('CONST values -> SMA = value with CONST short-circuit', () => {
    const out = applyLineQstickMidCrossSma(new Array(10).fill(5), 5);
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
    for (let i = 4; i < 10; i += 1) expect(out[i]).toBe(5);
  });

  it('length=1 returns values verbatim', () => {
    expect(applyLineQstickMidCrossSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('null inside window -> null at that index', () => {
    const out = applyLineQstickMidCrossSma(
      [1, 2, null, 4, 5] as Array<number | null>,
      3,
    );
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
  });
});

describe('computeLineQstickMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST open=close=K=%d -> body=0, qstick=0 from index 13 onward',
    (K) => {
      const data = mkFlat(30, K);
      const { body, qstick } = computeLineQstickMidCross(data, {
        length: 14,
      });
      for (const b of body) {
        expect(b).toBe(0);
        expect(Object.is(b, -0)).toBe(false);
      }
      for (let i = 0; i < 13; i += 1) {
        expect(qstick[i]).toBeNull();
      }
      for (let i = 13; i < 30; i += 1) {
        expect(qstick[i]).toBe(0);
        expect(Object.is(qstick[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineQstickMidCross - CONST body', () => {
  it('CONST body = +2 -> qstick = +2 from i=13', () => {
    const data = mkBody(30, 2);
    const { body, qstick } = computeLineQstickMidCross(data, { length: 14 });
    for (const b of body) expect(b).toBe(2);
    for (let i = 13; i < 30; i += 1) {
      expect(qstick[i]).toBe(2);
    }
  });

  it('CONST body = -2 -> qstick = -2 from i=13', () => {
    const data = mkBody(30, -2);
    const { qstick } = computeLineQstickMidCross(data, { length: 14 });
    for (let i = 13; i < 30; i += 1) {
      expect(qstick[i]).toBe(-2);
    }
  });

  it('qstick[i < length - 1] is null', () => {
    const data = mkBody(30, 2);
    const { qstick } = computeLineQstickMidCross(data, { length: 14 });
    for (let i = 0; i < 13; i += 1) {
      expect(qstick[i]).toBeNull();
    }
  });
});

describe('classifyLineQstickMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineQstickMidCrossRegime(null, 0)).toBe('none');
  });

  it('qstick at threshold boundary -> bullish', () => {
    expect(classifyLineQstickMidCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineQstickMidCrossRegime(2, 0)).toBe('bullish');
  });

  it('qstick < threshold -> bearish', () => {
    expect(classifyLineQstickMidCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineQstickMidCrossRegime(-5, 0)).toBe('bearish');
  });
});

describe('detectLineQstickMidCrossCrosses', () => {
  it('fires bullish when qstick crosses up through 0', () => {
    const series = mk([
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10],
    ]);
    const qstick = [-2, -1, -0.5, 1, 2];
    const crosses = detectLineQstickMidCrossCrosses(series, qstick, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when qstick crosses down through 0', () => {
    const series = mk([
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10],
    ]);
    const qstick = [2, 1, 0.5, -1, -2];
    const crosses = detectLineQstickMidCrossCrosses(series, qstick, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep through the threshold', () => {
    const series = mk([
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10],
    ]);
    const qstick = [-2, 2, 1, -2];
    const crosses = detectLineQstickMidCrossCrosses(series, qstick, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([
      [10, 10],
      [10, 10],
      [10, 10],
    ]);
    expect(
      detectLineQstickMidCrossCrosses(series, [null, -2, 2], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineQstickMidCrossCrosses(series, [-2, null, 2], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([
      [10, 10],
      [10, 10],
    ]);
    expect(detectLineQstickMidCrossCrosses(series, [-2, 0], 0)).toEqual([]);
  });

  it('no cross when qstick stays on one side', () => {
    const series = mk([
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10],
    ]);
    expect(
      detectLineQstickMidCrossCrosses(series, [-2, -1.5, -1, -0.5], 0),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([
      [10, 10],
      [10, 10],
      [10, 10],
    ]);
    expect(
      detectLineQstickMidCrossCrosses(series, [0, 0.5, 1.5], 1),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineQstickMidCross', () => {
  it('CONST K -> 0 crosses, all bullish (qstick=0 at boundary)', () => {
    const data = mkFlat(30, 50);
    const run = runLineQstickMidCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(13);
    expect(run.bullishCount).toBe(17);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(14);
    expect(run.threshold).toBe(0);
  });

  it('CONST body=+2 -> all bullish (qstick=+2)', () => {
    const data = mkBody(30, 2);
    const run = runLineQstickMidCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(17);
    expect(run.bearishCount).toBe(0);
  });

  it('CONST body=-2 -> all bearish (qstick=-2)', () => {
    const data = mkBody(30, -2);
    const run = runLineQstickMidCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(17);
  });

  it('sign-flipping bodies emit a bullish cross when -B then +B', () => {
    const points: ChartLineQstickMidCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      points.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      points.push({ x: i, open: i, close: i + 2 });
    }
    const run = runLineQstickMidCross(points);
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mkFlat(30, 10);
    const run = runLineQstickMidCross(data, { threshold: NaN });
    expect(run.threshold).toBe(0);
  });

  it('respects custom threshold', () => {
    const data = mkFlat(30, 10);
    expect(runLineQstickMidCross(data, { threshold: 1 }).threshold).toBe(1);
    expect(runLineQstickMidCross(data, { threshold: -1 }).threshold).toBe(-1);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineQstickMidCross([]).ok).toBe(false);
    expect(
      runLineQstickMidCross(
        mk([
          [10, 10],
          [10, 10],
          [10, 10],
        ]),
      ).ok,
    ).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineQstickMidCrossPoint[] = [
      { x: 3, open: 30, close: 30 },
      { x: 1, open: 10, close: 10 },
      { x: 2, open: 20, close: 20 },
    ];
    const run = runLineQstickMidCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / open / close / body / qstick / regime', () => {
    const data = mkFlat(30, 10);
    const run = runLineQstickMidCross(data);
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 13; i += 1) {
      expect(run.samples[i]!.body).toBe(0);
      expect(run.samples[i]!.qstick).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 13; i < 30; i += 1) {
      expect(run.samples[i]!.qstick).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineQstickMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mkFlat(30, 50);
    const layout = computeLineQstickMidCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_QSTICK_MID_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_QSTICK_MID_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_QSTICK_MID_CROSS_PANEL_GAP,
    );
  });

  it('CONST qstick=0 collapses to (-1, 1) range', () => {
    const data = mkFlat(30, 10);
    const layout = computeLineQstickMidCrossLayout({ data });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('threshold band sits inside osc panel', () => {
    const data = mkFlat(30, 10);
    const layout = computeLineQstickMidCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineQstickMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.qstickPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mkBody(30, 2);
    const layout = computeLineQstickMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('qstick path skips null gaps with new M commands', () => {
    const data = mkBody(30, 2);
    const layout = computeLineQstickMidCrossLayout({ data });
    expect(layout.qstickPath.startsWith('M ')).toBe(true);
    const mCount = (layout.qstickPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mkFlat(30, 7);
    const layout = computeLineQstickMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const points: ChartLineQstickMidCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      points.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      points.push({ x: i, open: i, close: i + 2 });
    }
    const layout = computeLineQstickMidCrossLayout({ data: points });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineQstickMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineQstickMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + bias coloring claim', () => {
    const data = mkFlat(30, 50);
    const desc = describeLineQstickMidCrossChart(data);
    expect(desc).toContain('QStick Mid Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('threshold 0');
    expect(desc).toContain('bias coloring');
    expect(desc).toContain('centerline regime transition');
  });
});

describe('ChartLineQstickMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mkFlat(30, 10);
    const { container, getByRole } = render(
      <ChartLineQstickMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('QStick Mid Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-qstick-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('QStick Mid Cross chart');
  });

  it('renders config badge', () => {
    const data = mkFlat(30, 10);
    const { container } = render(<ChartLineQstickMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-qstick-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + qstick', () => {
    const data = mkFlat(30, 10);
    const { container } = render(<ChartLineQstickMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('qstick');
  });

  it('toggles series visibility via legend click', () => {
    const data = mkFlat(30, 10);
    const { container } = render(<ChartLineQstickMidCross data={data} />);
    const btn = container.querySelector('[data-series-id="qstick"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mkFlat(30, 10);
    const { container, rerender } = render(
      <ChartLineQstickMidCross data={data} hiddenSeries={['qstick']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-qstick-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineQstickMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-qstick-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mkFlat(30, 10);
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineQstickMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="qstick"]')!);
    expect(events).toEqual([{ seriesId: 'qstick', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mkFlat(30, 10);
    const { container } = render(<ChartLineQstickMidCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="qstick"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineQstickMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mkFlat(30, 10);
    const { container } = render(
      <ChartLineQstickMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mkFlat(30, 10);
    const { container } = render(<ChartLineQstickMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mkFlat(30, 10);
    const { container } = render(<ChartLineQstickMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-qstick-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-qstick-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mkFlat(30, 10);
    const { container } = render(<ChartLineQstickMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mkFlat(30, 10);
    const { container } = render(
      <ChartLineQstickMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mkFlat(30, 10);
    const { container } = render(
      <ChartLineQstickMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after sign-flipping bodies', () => {
    const points: ChartLineQstickMidCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      points.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      points.push({ x: i, open: i, close: i + 2 });
    }
    const { container } = render(<ChartLineQstickMidCross data={points} />);
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-qstick-mid-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const points: ChartLineQstickMidCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      points.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      points.push({ x: i, open: i, close: i + 2 });
    }
    const { container } = render(
      <ChartLineQstickMidCross data={points} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const points: ChartLineQstickMidCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      points.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      points.push({ x: i, open: i, close: i + 2 });
    }
    const { container } = render(
      <ChartLineQstickMidCross data={points} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mkFlat(30, 10);
    const { container } = render(<ChartLineQstickMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-qstick-mid-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('17');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults: length=14, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_QSTICK_MID_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_QSTICK_MID_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mkFlat(30, 10);
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineQstickMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-qstick-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mkFlat(30, 10);
    const a = computeLineQstickMidCrossLayout({ data });
    const b = computeLineQstickMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.qstickPath).toBe(b.qstickPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across sign-flipping pattern', () => {
    const points: ChartLineQstickMidCrossPoint[] = [];
    for (let i = 0; i < 20; i += 1) {
      points.push({ x: i, open: i, close: i - 2 });
    }
    for (let i = 20; i < 40; i += 1) {
      points.push({ x: i, open: i, close: i + 2 });
    }
    const a = computeLineQstickMidCrossLayout({ data: points });
    const b = computeLineQstickMidCrossLayout({ data: points });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.qstickPath).toBe(b.qstickPath);
    expect(a.run.qstickValues).toEqual(b.run.qstickValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
