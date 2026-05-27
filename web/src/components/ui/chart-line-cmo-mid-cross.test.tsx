import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineCmoMidCross,
  DEFAULT_CHART_LINE_CMO_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_CMO_MID_CROSS_LENGTH,
  DEFAULT_CHART_LINE_CMO_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_CMO_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_CMO_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_CMO_MID_CROSS_WIDTH,
  classifyLineCmoMidCrossRegime,
  computeLineCmoMidCross,
  computeLineCmoMidCrossLayout,
  describeLineCmoMidCrossChart,
  detectLineCmoMidCrossCrosses,
  getLineCmoMidCrossFinitePoints,
  normalizeLineCmoMidCrossLength,
  normalizeLineCmoMidCrossThreshold,
  runLineCmoMidCross,
  type ChartLineCmoMidCrossPoint,
} from './chart-line-cmo-mid-cross';

const mk = (closes: number[]): ChartLineCmoMidCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineCmoMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineCmoMidCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineCmoMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineCmoMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineCmoMidCrossFinitePoints(
        'oops' as unknown as ChartLineCmoMidCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineCmoMidCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineCmoMidCrossLength(14, 10)).toBe(14);
    expect(normalizeLineCmoMidCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineCmoMidCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineCmoMidCrossLength(0, 10)).toBe(10);
    expect(normalizeLineCmoMidCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineCmoMidCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineCmoMidCrossThreshold', () => {
  it('keeps values within [-100, 100]', () => {
    expect(normalizeLineCmoMidCrossThreshold(0, -10)).toBe(0);
    expect(normalizeLineCmoMidCrossThreshold(-100, -10)).toBe(-100);
    expect(normalizeLineCmoMidCrossThreshold(100, -10)).toBe(100);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineCmoMidCrossThreshold(101, -10)).toBe(-10);
    expect(normalizeLineCmoMidCrossThreshold(-101, -10)).toBe(-10);
    expect(normalizeLineCmoMidCrossThreshold(NaN, -10)).toBe(-10);
  });
});

describe('computeLineCmoMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> cmo = 0 via zero-flow guard',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { cmo } = computeLineCmoMidCross(data, { length: 14 });
      for (let i = 0; i < 14; i += 1) {
        expect(cmo[i]).toBeNull();
      }
      for (let i = 14; i < 30; i += 1) {
        expect(cmo[i]).toBe(0);
        expect(Object.is(cmo[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineCmoMidCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> cmo = 100 constant (no losses)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { cmo } = computeLineCmoMidCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(cmo[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i (length=14) -> cmo = -100 constant (no gains)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { cmo } = computeLineCmoMidCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(cmo[i]).toBe(-100);
    }
  });

  it('balanced alternation -> cmo = 0 (gain == loss)', () => {
    const data = mk(
      Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
    );
    const { cmo } = computeLineCmoMidCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(cmo[i]).toBe(0);
    }
  });
});

describe('classifyLineCmoMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineCmoMidCrossRegime(null, 0)).toBe('none');
  });

  it('cmo at threshold boundary -> bullish', () => {
    expect(classifyLineCmoMidCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineCmoMidCrossRegime(50, 0)).toBe('bullish');
    expect(classifyLineCmoMidCrossRegime(100, 0)).toBe('bullish');
  });

  it('cmo < threshold -> bearish', () => {
    expect(classifyLineCmoMidCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineCmoMidCrossRegime(-50, 0)).toBe('bearish');
    expect(classifyLineCmoMidCrossRegime(-100, 0)).toBe('bearish');
  });
});

describe('detectLineCmoMidCrossCrosses', () => {
  it('fires bullish when cmo crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cmo = [-50, -30, -10, 20, 50];
    const crosses = detectLineCmoMidCrossCrosses(series, cmo, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when cmo crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cmo = [50, 30, 10, -20, -50];
    const crosses = detectLineCmoMidCrossCrosses(series, cmo, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when cmo sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const cmo = [-50, 50, 20, -50];
    const crosses = detectLineCmoMidCrossCrosses(series, cmo, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineCmoMidCrossCrosses(series, [null, -50, 50], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineCmoMidCrossCrosses(series, [-50, null, 50], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineCmoMidCrossCrosses(series, [-50, 0], 0)).toEqual([]);
  });

  it('no cross when cmo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineCmoMidCrossCrosses(series, [-50, -40, -30, -20], 0),
    ).toEqual([]);
  });
});

describe('runLineCmoMidCross', () => {
  it('CONST K -> 0 crosses, bullish at boundary after warmup', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineCmoMidCross(data, { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(14);
    expect(run.bullishCount).toBe(16);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineCmoMidCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(16);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineCmoMidCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(16);
    expect(run.bullishCount).toBe(0);
  });

  it('decline + rise generates a bullish midline cross', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const run = runLineCmoMidCross(mk(closes), { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise + decline generates a bearish midline cross', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 10 + i),
      ...Array.from({ length: 20 }, (_, i) => 29 - i * 2),
    ];
    const run = runLineCmoMidCross(mk(closes), { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps out-of-range', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCmoMidCross(data, { length: 14, threshold: 200 });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive / negative threshold', () => {
    const data = mk(new Array(30).fill(10));
    expect(
      runLineCmoMidCross(data, { length: 14, threshold: 50 }).threshold,
    ).toBe(50);
    expect(
      runLineCmoMidCross(data, { length: 14, threshold: -50 }).threshold,
    ).toBe(-50);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineCmoMidCross([], { length: 14 }).ok).toBe(false);
    expect(runLineCmoMidCross(mk([1, 2, 3]), { length: 14 }).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineCmoMidCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineCmoMidCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / cmo / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCmoMidCross(data, { length: 14 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 14; i += 1) {
      expect(run.samples[i]!.cmo).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 14; i < 30; i += 1) {
      expect(run.samples[i]!.cmo).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineCmoMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCmoMidCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_CMO_MID_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_CMO_MID_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_CMO_MID_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_CMO_MID_CROSS_PANEL_GAP);
  });

  it('osc range fixed at -100..100', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCmoMidCrossLayout({ data });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(100);
  });

  it('SVG y-axis: thresholdY at 0 sits between oscTop and oscBottom', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCmoMidCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineCmoMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cmoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineCmoMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('cmo path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineCmoMidCrossLayout({ data });
    expect(layout.cmoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.cmoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineCmoMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const layout = computeLineCmoMidCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineCmoMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineCmoMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineCmoMidCrossChart(data);
    expect(desc).toContain('CMO Mid Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('threshold 0');
    expect(desc).toContain('trend confirmation');
  });
});

describe('ChartLineCmoMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineCmoMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('CMO Mid Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-cmo-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('CMO Mid Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cmo-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + cmo', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('cmo');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoMidCross data={data} />);
    const btn = container.querySelector('[data-series-id="cmo"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineCmoMidCross data={data} hiddenSeries={['cmo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-cmo-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineCmoMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-cmo-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineCmoMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="cmo"]')!);
    expect(events).toEqual([{ seriesId: 'cmo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoMidCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="cmo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineCmoMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCmoMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-cmo-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-cmo-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCmoMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCmoMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const { container } = render(<ChartLineCmoMidCross data={mk(closes)} />);
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-cmo-mid-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const { container } = render(
      <ChartLineCmoMidCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const { container } = render(
      <ChartLineCmoMidCross data={mk(closes)} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-cmo-mid-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('16');
  });

  it('defaults: length=14, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_CMO_MID_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_CMO_MID_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCmoMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cmo-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineCmoMidCrossLayout({ data });
    const b = computeLineCmoMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cmoPath).toBe(b.cmoPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const data = mk(closes);
    const a = computeLineCmoMidCrossLayout({ data });
    const b = computeLineCmoMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cmoPath).toBe(b.cmoPath);
    expect(a.run.cmoValues).toEqual(b.run.cmoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
