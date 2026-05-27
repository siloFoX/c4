import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineRocZeroCross,
  DEFAULT_CHART_LINE_ROC_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ROC_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ROC_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_ROC_ZERO_CROSS_WIDTH,
  classifyLineRocZeroCrossRegime,
  computeLineRocZeroCross,
  computeLineRocZeroCrossLayout,
  describeLineRocZeroCrossChart,
  detectLineRocZeroCrossCrosses,
  getLineRocZeroCrossFinitePoints,
  normalizeLineRocZeroCrossLength,
  normalizeLineRocZeroCrossThreshold,
  runLineRocZeroCross,
  type ChartLineRocZeroCrossPoint,
} from './chart-line-roc-zero-cross';

const mk = (closes: number[]): ChartLineRocZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineRocZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineRocZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineRocZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineRocZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineRocZeroCrossFinitePoints(
        'oops' as unknown as ChartLineRocZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineRocZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineRocZeroCrossLength(12, 10)).toBe(12);
    expect(normalizeLineRocZeroCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineRocZeroCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineRocZeroCrossLength(0, 10)).toBe(10);
    expect(normalizeLineRocZeroCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineRocZeroCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineRocZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineRocZeroCrossThreshold(0, -10)).toBe(0);
    expect(normalizeLineRocZeroCrossThreshold(5, -10)).toBe(5);
    expect(normalizeLineRocZeroCrossThreshold(-2, -10)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineRocZeroCrossThreshold(NaN, -10)).toBe(-10);
    expect(normalizeLineRocZeroCrossThreshold(Infinity, -10)).toBe(-10);
  });
});

describe('computeLineRocZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> roc = 0 from index length onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { roc } = computeLineRocZeroCross(data, { length: 12 });
      for (let i = 0; i < 12; i += 1) {
        expect(roc[i]).toBeNull();
      }
      for (let i = 12; i < 30; i += 1) {
        expect(roc[i]).toBe(0);
        expect(Object.is(roc[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineRocZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i+100 -> roc positive, decreasing toward 0', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i + 100));
    const { roc } = computeLineRocZeroCross(data, { length: 12 });
    // roc[12] = (112 - 100) / 100 * 100 = 12, roc[49] = 12 / 137 * 100 ~= 8.76
    expect(roc[12]).toBe(12);
    const last = roc[49];
    expect(last).toBeGreaterThan(0);
    expect(last).toBeLessThan(12);
  });

  it('LINEAR DOWN close=200-i -> roc negative', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => 200 - i));
    const { roc } = computeLineRocZeroCross(data, { length: 12 });
    // roc[12] = (188 - 200) / 200 * 100 = -6
    expect(roc[12]).toBe(-6);
    const last = roc[49];
    expect(last).toBeLessThan(0);
  });

  it('prev-close = 0 guard returns 0 (no NaN)', () => {
    // close[0] = 0, close[12] would divide by |0| = 0/0 fallback
    const data = mk([0, ...Array.from({ length: 14 }, (_, i) => i + 1)]);
    const { roc } = computeLineRocZeroCross(data, { length: 12 });
    expect(roc[12]).toBe(0);
    expect(Number.isFinite(roc[13])).toBe(true);
  });
});

describe('classifyLineRocZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineRocZeroCrossRegime(null, 0)).toBe('none');
  });

  it('roc at threshold boundary -> bullish', () => {
    expect(classifyLineRocZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineRocZeroCrossRegime(5, 0)).toBe('bullish');
  });

  it('roc < threshold -> bearish', () => {
    expect(classifyLineRocZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineRocZeroCrossRegime(-5, 0)).toBe('bearish');
  });
});

describe('detectLineRocZeroCrossCrosses', () => {
  it('fires bullish when roc crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const roc = [-2, -1, -0.5, 0.5, 1];
    const crosses = detectLineRocZeroCrossCrosses(series, roc, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when roc crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const roc = [2, 1, 0.5, -0.5, -1];
    const crosses = detectLineRocZeroCrossCrosses(series, roc, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when roc sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const roc = [-1, 1, 0.5, -1];
    const crosses = detectLineRocZeroCrossCrosses(series, roc, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineRocZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineRocZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineRocZeroCrossCrosses(series, [-1, 0], 0)).toEqual([]);
  });

  it('no cross when roc stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineRocZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLineRocZeroCross', () => {
  it('CONST K -> 0 crosses, bullish at boundary after warmup', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineRocZeroCross(data, { length: 12 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(12);
    expect(run.bullishCount).toBe(18);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i + 100));
    const run = runLineRocZeroCross(data, { length: 12 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => 200 - i));
    const run = runLineRocZeroCross(data, { length: 12 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.bullishCount).toBe(0);
  });

  it('decline + rise generates a bullish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const run = runLineRocZeroCross(mk(closes), { length: 12 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise + decline generates a bearish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 10 + i),
      ...Array.from({ length: 30 }, (_, i) => 39 - i * 2),
    ];
    const run = runLineRocZeroCross(mk(closes), { length: 12 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineRocZeroCross(data, { length: 12, threshold: NaN });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive / negative threshold', () => {
    const data = mk(new Array(30).fill(10));
    expect(
      runLineRocZeroCross(data, { length: 12, threshold: 5 }).threshold,
    ).toBe(5);
    expect(
      runLineRocZeroCross(data, { length: 12, threshold: -3 }).threshold,
    ).toBe(-3);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineRocZeroCross([], { length: 12 }).ok).toBe(false);
    expect(runLineRocZeroCross(mk([1, 2, 3]), { length: 12 }).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineRocZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineRocZeroCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / roc / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineRocZeroCross(data, { length: 12 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 12; i += 1) {
      expect(run.samples[i]!.roc).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 12; i < 30; i += 1) {
      expect(run.samples[i]!.roc).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineRocZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineRocZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_ROC_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_ROC_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_ROC_ZERO_CROSS_PANEL_GAP);
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i + 100));
    const layout = computeLineRocZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineRocZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.rocPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed roc values plus padding', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i + 100));
    const layout = computeLineRocZeroCrossLayout({ data });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThan(0);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i + 1));
    const layout = computeLineRocZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('roc path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i + 1));
    const layout = computeLineRocZeroCrossLayout({ data });
    expect(layout.rocPath.startsWith('M ')).toBe(true);
    const mCount = (layout.rocPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineRocZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const layout = computeLineRocZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineRocZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineRocZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineRocZeroCrossChart(data);
    expect(desc).toContain('ROC Zero Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 12');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineRocZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineRocZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('ROC Zero Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-roc-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('ROC Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineRocZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-roc-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 12');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + roc', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineRocZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('roc');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineRocZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="roc"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineRocZeroCross data={data} hiddenSeries={['roc']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-roc-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineRocZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-roc-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineRocZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="roc"]')!);
    expect(events).toEqual([{ seriesId: 'roc', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineRocZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="roc"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineRocZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineRocZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineRocZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineRocZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-roc-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-roc-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineRocZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineRocZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineRocZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const { container } = render(<ChartLineRocZeroCross data={mk(closes)} />);
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-roc-zero-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const { container } = render(
      <ChartLineRocZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const { container } = render(
      <ChartLineRocZeroCross data={mk(closes)} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineRocZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-roc-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('12');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('18');
  });

  it('defaults: length=12, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_ROC_ZERO_CROSS_LENGTH).toBe(12);
    expect(DEFAULT_CHART_LINE_ROC_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineRocZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-roc-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineRocZeroCrossLayout({ data });
    const b = computeLineRocZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.rocPath).toBe(b.rocPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const data = mk(closes);
    const a = computeLineRocZeroCrossLayout({ data });
    const b = computeLineRocZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.rocPath).toBe(b.rocPath);
    expect(a.run.rocValues).toEqual(b.run.rocValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
