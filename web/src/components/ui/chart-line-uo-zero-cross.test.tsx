import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineUoZeroCross,
  DEFAULT_CHART_LINE_UO_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_UO_ZERO_CROSS_LONG,
  DEFAULT_CHART_LINE_UO_ZERO_CROSS_MID,
  DEFAULT_CHART_LINE_UO_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_UO_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_UO_ZERO_CROSS_SHORT,
  DEFAULT_CHART_LINE_UO_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_UO_ZERO_CROSS_WIDTH,
  applyLineUoZeroCrossPressure,
  classifyLineUoZeroCrossRegime,
  computeLineUoZeroCross,
  computeLineUoZeroCrossLayout,
  describeLineUoZeroCrossChart,
  detectLineUoZeroCrossCrosses,
  getLineUoZeroCrossFinitePoints,
  normalizeLineUoZeroCrossLength,
  normalizeLineUoZeroCrossThreshold,
  runLineUoZeroCross,
  type ChartLineUoZeroCrossPoint,
} from './chart-line-uo-zero-cross';

const mk = (closes: number[]): ChartLineUoZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineUoZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineUoZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineUoZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineUoZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineUoZeroCrossFinitePoints(
        'oops' as unknown as ChartLineUoZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineUoZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineUoZeroCrossLength(7, 14)).toBe(7);
    expect(normalizeLineUoZeroCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineUoZeroCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineUoZeroCrossLength(0, 14)).toBe(14);
    expect(normalizeLineUoZeroCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineUoZeroCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineUoZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineUoZeroCrossThreshold(50, 50)).toBe(50);
    expect(normalizeLineUoZeroCrossThreshold(70, 50)).toBe(70);
    expect(normalizeLineUoZeroCrossThreshold(0, 50)).toBe(0);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineUoZeroCrossThreshold(NaN, 50)).toBe(50);
    expect(normalizeLineUoZeroCrossThreshold(Infinity, 50)).toBe(50);
  });
});

describe('applyLineUoZeroCrossPressure', () => {
  it('CONST closes -> bp=0, tr=0 from i=1 onward', () => {
    const { bp, tr } = applyLineUoZeroCrossPressure(new Array(10).fill(50));
    expect(bp[0]).toBeNull();
    expect(tr[0]).toBeNull();
    for (let i = 1; i < 10; i += 1) {
      expect(bp[i]).toBe(0);
      expect(tr[i]).toBe(0);
    }
  });

  it('LINEAR UP delta=+1 -> bp=1, tr=1', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i);
    const { bp, tr } = applyLineUoZeroCrossPressure(closes);
    for (let i = 1; i < 10; i += 1) {
      expect(bp[i]).toBe(1);
      expect(tr[i]).toBe(1);
    }
  });

  it('LINEAR DOWN delta=-1 -> bp=0, tr=1', () => {
    const closes = Array.from({ length: 10 }, (_, i) => -i);
    const { bp, tr } = applyLineUoZeroCrossPressure(closes);
    for (let i = 1; i < 10; i += 1) {
      expect(bp[i]).toBe(0);
      expect(tr[i]).toBe(1);
    }
  });
});

describe('computeLineUoZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> uo = 50 from index long onward (0/0 -> 0.5 fallback)',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { uo } = computeLineUoZeroCross(data, {
        short: 7,
        mid: 14,
        long: 28,
      });
      for (let i = 0; i < 28; i += 1) {
        expect(uo[i]).toBeNull();
      }
      for (let i = 28; i < 40; i += 1) {
        expect(uo[i]).toBe(50);
      }
    },
  );
});

describe('computeLineUoZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> uo = 100 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { uo } = computeLineUoZeroCross(data, {
      short: 7,
      mid: 14,
      long: 28,
    });
    for (let i = 28; i < 40; i += 1) {
      expect(uo[i]).toBeCloseTo(100, 10);
    }
  });

  it('LINEAR DOWN close=-i -> uo = 0 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { uo } = computeLineUoZeroCross(data, {
      short: 7,
      mid: 14,
      long: 28,
    });
    for (let i = 28; i < 40; i += 1) {
      expect(uo[i]).toBe(0);
    }
  });

  it('uo[i < long] is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { uo } = computeLineUoZeroCross(data, {
      short: 7,
      mid: 14,
      long: 28,
    });
    for (let i = 0; i < 28; i += 1) {
      expect(uo[i]).toBeNull();
    }
  });

  it('custom periods (3 / 5 / 10) work', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { uo } = computeLineUoZeroCross(data, {
      short: 3,
      mid: 5,
      long: 10,
    });
    for (let i = 0; i < 10; i += 1) {
      expect(uo[i]).toBeNull();
    }
    for (let i = 10; i < 20; i += 1) {
      expect(uo[i]).toBeCloseTo(100, 10);
    }
  });
});

describe('classifyLineUoZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineUoZeroCrossRegime(null, 50)).toBe('none');
  });

  it('uo at threshold boundary -> bullish', () => {
    expect(classifyLineUoZeroCrossRegime(50, 50)).toBe('bullish');
    expect(classifyLineUoZeroCrossRegime(75, 50)).toBe('bullish');
  });

  it('uo < threshold -> bearish', () => {
    expect(classifyLineUoZeroCrossRegime(49.99, 50)).toBe('bearish');
    expect(classifyLineUoZeroCrossRegime(0, 50)).toBe('bearish');
  });
});

describe('detectLineUoZeroCrossCrosses', () => {
  it('fires bullish when uo crosses up through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const uo = [40, 45, 49, 60, 65];
    const crosses = detectLineUoZeroCrossCrosses(series, uo, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when uo crosses down through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const uo = [60, 55, 51, 45, 40];
    const crosses = detectLineUoZeroCrossCrosses(series, uo, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const uo = [40, 60, 55, 40];
    const crosses = detectLineUoZeroCrossCrosses(series, uo, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineUoZeroCrossCrosses(series, [null, 40, 60], 50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineUoZeroCrossCrosses(series, [40, null, 60], 50),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineUoZeroCrossCrosses(series, [40, 50], 50)).toEqual([]);
  });

  it('no cross when uo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineUoZeroCrossCrosses(series, [10, 20, 30, 40], 50),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineUoZeroCrossCrosses(series, [60, 65, 75], 70),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineUoZeroCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineUoZeroCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(28);
    expect(run.bullishCount).toBe(12);
    expect(run.bearishCount).toBe(0);
    expect(run.short).toBe(7);
    expect(run.mid).toBe(14);
    expect(run.long).toBe(28);
  });

  it('LINEAR UP -> all bullish after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineUoZeroCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(12);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineUoZeroCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(12);
  });

  it('decline then rise generates bullish cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const run = runLineUoZeroCross(mk(closes));
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const run = runLineUoZeroCross(mk(closes));
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineUoZeroCross(data, { threshold: NaN });
    expect(run.threshold).toBe(50);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(runLineUoZeroCross(data, { threshold: 70 }).threshold).toBe(70);
    expect(runLineUoZeroCross(data, { threshold: 30 }).threshold).toBe(30);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineUoZeroCross([]).ok).toBe(false);
    expect(runLineUoZeroCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineUoZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineUoZeroCross(data);
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / uo / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineUoZeroCross(data);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 28; i += 1) {
      expect(run.samples[i]!.uo).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 28; i < 40; i += 1) {
      expect(run.samples[i]!.uo).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineUoZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineUoZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_UO_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_UO_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_UO_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_UO_ZERO_CROSS_PANEL_GAP);
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineUoZeroCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY sits at panel midpoint when threshold=50', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineUoZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    const expected = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.thresholdY).toBeCloseTo(expected, 5);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineUoZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.uoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineUoZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('uo path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineUoZeroCrossLayout({ data });
    expect(layout.uoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.uoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineUoZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const layout = computeLineUoZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineUoZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineUoZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineUoZeroCrossChart(data);
    expect(desc).toContain('UO Zero Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('short 7');
    expect(desc).toContain('mid 14');
    expect(desc).toContain('long 28');
    expect(desc).toContain('threshold 50');
  });
});

describe('ChartLineUoZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineUoZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('UO Zero Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-uo-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('UO Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-uo-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('short 7');
    expect(badge?.textContent).toContain('mid 14');
    expect(badge?.textContent).toContain('long 28');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + uo', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('uo');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="uo"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineUoZeroCross data={data} hiddenSeries={['uo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-uo-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineUoZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-uo-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineUoZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="uo"]')!);
    expect(events).toEqual([{ seriesId: 'uo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="uo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineUoZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineUoZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-uo-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-uo-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineUoZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineUoZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(<ChartLineUoZeroCross data={mk(closes)} />);
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-uo-zero-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineUoZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineUoZeroCross data={mk(closes)} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-uo-zero-cross"]',
    );
    expect(region?.getAttribute('data-short')).toBe('7');
    expect(region?.getAttribute('data-mid')).toBe('14');
    expect(region?.getAttribute('data-long')).toBe('28');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('12');
  });

  it('defaults: short=7, mid=14, long=28, threshold=50', () => {
    expect(DEFAULT_CHART_LINE_UO_ZERO_CROSS_SHORT).toBe(7);
    expect(DEFAULT_CHART_LINE_UO_ZERO_CROSS_MID).toBe(14);
    expect(DEFAULT_CHART_LINE_UO_ZERO_CROSS_LONG).toBe(28);
    expect(DEFAULT_CHART_LINE_UO_ZERO_CROSS_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineUoZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-uo-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineUoZeroCrossLayout({ data });
    const b = computeLineUoZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.uoPath).toBe(b.uoPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const data = mk(closes);
    const a = computeLineUoZeroCrossLayout({ data });
    const b = computeLineUoZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.uoPath).toBe(b.uoPath);
    expect(a.run.uoValues).toEqual(b.run.uoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
