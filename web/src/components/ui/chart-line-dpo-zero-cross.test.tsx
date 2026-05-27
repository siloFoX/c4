import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineDpoZeroCross,
  DEFAULT_CHART_LINE_DPO_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_DPO_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_DPO_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_DPO_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_DPO_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_DPO_ZERO_CROSS_WIDTH,
  applyLineDpoZeroCrossSma,
  classifyLineDpoZeroCrossRegime,
  computeLineDpoZeroCross,
  computeLineDpoZeroCrossLayout,
  describeLineDpoZeroCrossChart,
  detectLineDpoZeroCrossCrosses,
  getLineDpoZeroCrossFinitePoints,
  normalizeLineDpoZeroCrossLength,
  normalizeLineDpoZeroCrossThreshold,
  runLineDpoZeroCross,
  type ChartLineDpoZeroCrossPoint,
} from './chart-line-dpo-zero-cross';

const mk = (closes: number[]): ChartLineDpoZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineDpoZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineDpoZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineDpoZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineDpoZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineDpoZeroCrossFinitePoints(
        'oops' as unknown as ChartLineDpoZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineDpoZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineDpoZeroCrossLength(20, 10)).toBe(20);
    expect(normalizeLineDpoZeroCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineDpoZeroCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineDpoZeroCrossLength(0, 10)).toBe(10);
    expect(normalizeLineDpoZeroCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineDpoZeroCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineDpoZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineDpoZeroCrossThreshold(0, -10)).toBe(0);
    expect(normalizeLineDpoZeroCrossThreshold(5, -10)).toBe(5);
    expect(normalizeLineDpoZeroCrossThreshold(-2, -10)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineDpoZeroCrossThreshold(NaN, -10)).toBe(-10);
    expect(normalizeLineDpoZeroCrossThreshold(Infinity, -10)).toBe(-10);
  });
});

describe('applyLineDpoZeroCrossSma', () => {
  it('CONST values short-circuit to exact value', () => {
    const out = applyLineDpoZeroCrossSma(new Array(30).fill(42), 20);
    expect(out.slice(0, 19)).toEqual(new Array(19).fill(null));
    for (let i = 19; i < 30; i += 1) {
      expect(out[i]).toBe(42);
    }
  });

  it('CONST zeros stay at +0', () => {
    const out = applyLineDpoZeroCrossSma(new Array(30).fill(0), 20);
    expect(Object.is(out[19], 0)).toBe(true);
  });

  it('length === 1 returns values verbatim', () => {
    expect(applyLineDpoZeroCrossSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
});

describe('computeLineDpoZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> dpo = 0 from index length-1 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { dpo } = computeLineDpoZeroCross(data, { length: 20 });
      // shift = 11, sma valid at i=19, so dpo valid at i >= 19
      for (let i = 0; i < 19; i += 1) {
        expect(dpo[i]).toBeNull();
      }
      for (let i = 19; i < 40; i += 1) {
        expect(dpo[i]).toBe(0);
        expect(Object.is(dpo[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineDpoZeroCross - LINEAR ramps (look-back inversion)', () => {
  it('LINEAR UP close=i (length=20) -> dpo = -1.5 constant (negative)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { dpo } = computeLineDpoZeroCross(data, { length: 20 });
    // shift = 11. At i=19, close[i-11] = close[8] = 8, sma[19] = avg(0..19) = 9.5
    // dpo = 8 - 9.5 = -1.5
    for (let i = 19; i < 40; i += 1) {
      expect(dpo[i]).toBeCloseTo(-1.5, 10);
    }
  });

  it('LINEAR DOWN close=-i (length=20) -> dpo = +1.5 constant (positive)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { dpo } = computeLineDpoZeroCross(data, { length: 20 });
    for (let i = 19; i < 40; i += 1) {
      expect(dpo[i]).toBeCloseTo(1.5, 10);
    }
  });

  it('shift is floor(length/2) + 1', () => {
    const { shift: s10 } = computeLineDpoZeroCross(
      mk(new Array(30).fill(10)),
      { length: 10 },
    );
    expect(s10).toBe(6);
    const { shift: s14 } = computeLineDpoZeroCross(
      mk(new Array(30).fill(10)),
      { length: 14 },
    );
    expect(s14).toBe(8);
    const { shift: s20 } = computeLineDpoZeroCross(
      mk(new Array(40).fill(10)),
      { length: 20 },
    );
    expect(s20).toBe(11);
  });
});

describe('classifyLineDpoZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineDpoZeroCrossRegime(null, 0)).toBe('none');
  });

  it('dpo at threshold boundary -> bullish', () => {
    expect(classifyLineDpoZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineDpoZeroCrossRegime(5, 0)).toBe('bullish');
  });

  it('dpo < threshold -> bearish', () => {
    expect(classifyLineDpoZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineDpoZeroCrossRegime(-5, 0)).toBe('bearish');
  });
});

describe('detectLineDpoZeroCrossCrosses', () => {
  it('fires bullish when dpo crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const dpo = [-2, -1, -0.5, 0.5, 1];
    const crosses = detectLineDpoZeroCrossCrosses(series, dpo, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when dpo crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const dpo = [2, 1, 0.5, -0.5, -1];
    const crosses = detectLineDpoZeroCrossCrosses(series, dpo, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when dpo sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const dpo = [-1, 1, 0.5, -1];
    const crosses = detectLineDpoZeroCrossCrosses(series, dpo, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineDpoZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineDpoZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineDpoZeroCrossCrosses(series, [-1, 0], 0)).toEqual([]);
  });

  it('no cross when dpo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineDpoZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLineDpoZeroCross', () => {
  it('CONST K -> 0 crosses, bullish at boundary after warmup', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineDpoZeroCross(data, { length: 20 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.bullishCount).toBe(21);
    expect(run.bearishCount).toBe(0);
    expect(run.shift).toBe(11);
  });

  it('LINEAR UP -> all bearish after warmup (look-back inversion)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineDpoZeroCross(data, { length: 20 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.bullishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bullish after warmup (look-back inversion)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineDpoZeroCross(data, { length: 20 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.bearishCount).toBe(0);
  });

  it('rise + decline (close peak in middle) generates crosses', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 10 + i),
      ...Array.from({ length: 30 }, (_, i) => 39 - i),
    ];
    const run = runLineDpoZeroCross(mk(closes), { length: 20 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineDpoZeroCross(data, {
      length: 20,
      threshold: NaN,
    });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive / negative threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(
      runLineDpoZeroCross(data, { length: 20, threshold: 5 }).threshold,
    ).toBe(5);
    expect(
      runLineDpoZeroCross(data, { length: 20, threshold: -3 }).threshold,
    ).toBe(-3);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineDpoZeroCross([], { length: 20 }).ok).toBe(false);
    expect(runLineDpoZeroCross(mk([1, 2, 3]), { length: 20 }).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineDpoZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineDpoZeroCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / dpo / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineDpoZeroCross(data, { length: 20 });
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 19; i += 1) {
      expect(run.samples[i]!.dpo).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 19; i < 40; i += 1) {
      expect(run.samples[i]!.dpo).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineDpoZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineDpoZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_DPO_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_DPO_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_DPO_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_DPO_ZERO_CROSS_PANEL_GAP);
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineDpoZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineDpoZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.dpoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed dpo values plus padding', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineDpoZeroCrossLayout({ data });
    // dpo = -1.5 constant, threshold = 0; oscMin <= -1.5, oscMax >= 0
    expect(layout.oscMin).toBeLessThan(-1.5);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineDpoZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('dpo path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineDpoZeroCrossLayout({ data });
    expect(layout.dpoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.dpoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineDpoZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 10 + i),
      ...Array.from({ length: 30 }, (_, i) => 39 - i),
    ];
    const layout = computeLineDpoZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineDpoZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineDpoZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineDpoZeroCrossChart(data);
    expect(desc).toContain('DPO Zero Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineDpoZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineDpoZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('DPO Zero Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-dpo-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('DPO Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-dpo-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('shift 11');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + dpo', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('dpo');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="dpo"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineDpoZeroCross data={data} hiddenSeries={['dpo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-dpo-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineDpoZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-dpo-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineDpoZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="dpo"]')!);
    expect(events).toEqual([{ seriesId: 'dpo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="dpo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineDpoZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineDpoZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-dpo-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-dpo-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineDpoZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineDpoZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after rise + decline pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 10 + i),
      ...Array.from({ length: 30 }, (_, i) => 39 - i),
    ];
    const { container } = render(<ChartLineDpoZeroCross data={mk(closes)} />);
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-dpo-zero-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 10 + i),
      ...Array.from({ length: 30 }, (_, i) => 39 - i),
    ];
    const { container } = render(
      <ChartLineDpoZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 10 + i),
      ...Array.from({ length: 30 }, (_, i) => 39 - i),
    ];
    const { container } = render(
      <ChartLineDpoZeroCross data={mk(closes)} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-dpo-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('20');
    expect(region?.getAttribute('data-shift')).toBe('11');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('21');
  });

  it('defaults: length=20, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_DPO_ZERO_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_DPO_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineDpoZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-dpo-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineDpoZeroCrossLayout({ data });
    const b = computeLineDpoZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for rise-then-decline pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 10 + i),
      ...Array.from({ length: 30 }, (_, i) => 39 - i),
    ];
    const data = mk(closes);
    const a = computeLineDpoZeroCrossLayout({ data });
    const b = computeLineDpoZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
    expect(a.run.dpoValues).toEqual(b.run.dpoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
