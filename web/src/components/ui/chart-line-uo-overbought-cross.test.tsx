import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineUoOverboughtCross,
  DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_LONG,
  DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_MID,
  DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_PADDING,
  DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_SHORT,
  DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_WIDTH,
  applyLineUoOverboughtCrossPressure,
  classifyLineUoOverboughtCrossRegime,
  computeLineUoOverboughtCross,
  computeLineUoOverboughtCrossLayout,
  describeLineUoOverboughtCrossChart,
  detectLineUoOverboughtCrossCrosses,
  getLineUoOverboughtCrossFinitePoints,
  normalizeLineUoOverboughtCrossLength,
  normalizeLineUoOverboughtCrossThreshold,
  runLineUoOverboughtCross,
  type ChartLineUoOverboughtCrossPoint,
} from './chart-line-uo-overbought-cross';

const mk = (closes: number[]): ChartLineUoOverboughtCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineUoOverboughtCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineUoOverboughtCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineUoOverboughtCrossFinitePoints(null)).toEqual([]);
    expect(getLineUoOverboughtCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineUoOverboughtCrossFinitePoints(
        'oops' as unknown as ChartLineUoOverboughtCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineUoOverboughtCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineUoOverboughtCrossLength(7, 14)).toBe(7);
    expect(normalizeLineUoOverboughtCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineUoOverboughtCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineUoOverboughtCrossLength(0, 14)).toBe(14);
    expect(normalizeLineUoOverboughtCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineUoOverboughtCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineUoOverboughtCrossThreshold(70, 70)).toBe(70);
    expect(normalizeLineUoOverboughtCrossThreshold(80, 70)).toBe(80);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineUoOverboughtCrossThreshold(NaN, 70)).toBe(70);
  });
});

describe('applyLineUoOverboughtCrossPressure', () => {
  it('CONST closes -> bp = tr = 0 from i=1', () => {
    const { bp, tr } = applyLineUoOverboughtCrossPressure(
      new Array(10).fill(50),
    );
    expect(bp[0]).toBeNull();
    expect(tr[0]).toBeNull();
    for (let i = 1; i < 10; i += 1) {
      expect(bp[i]).toBe(0);
      expect(tr[i]).toBe(0);
    }
  });

  it('LINEAR UP delta=+1 -> bp=1, tr=1', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i);
    const { bp, tr } = applyLineUoOverboughtCrossPressure(closes);
    for (let i = 1; i < 10; i += 1) {
      expect(bp[i]).toBe(1);
      expect(tr[i]).toBe(1);
    }
  });

  it('LINEAR DOWN delta=-1 -> bp=0, tr=1', () => {
    const closes = Array.from({ length: 10 }, (_, i) => -i);
    const { bp, tr } = applyLineUoOverboughtCrossPressure(closes);
    for (let i = 1; i < 10; i += 1) {
      expect(bp[i]).toBe(0);
      expect(tr[i]).toBe(1);
    }
  });
});

describe('computeLineUoOverboughtCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> uo = 50 from index long onward (0/0 -> 0.5 fallback)',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { uo } = computeLineUoOverboughtCross(data, {
        short: 7,
        mid: 14,
        long: 28,
      });
      for (let i = 0; i < 28; i += 1) expect(uo[i]).toBeNull();
      for (let i = 28; i < 40; i += 1) expect(uo[i]).toBe(50);
    },
  );
});

describe('computeLineUoOverboughtCross - LINEAR ramps', () => {
  it('LINEAR UP -> uo = 100 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { uo } = computeLineUoOverboughtCross(data, {
      short: 7,
      mid: 14,
      long: 28,
    });
    for (let i = 28; i < 40; i += 1) {
      expect(uo[i]).toBeCloseTo(100, 10);
    }
  });

  it('LINEAR DOWN -> uo = 0 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { uo } = computeLineUoOverboughtCross(data, {
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
    const { uo } = computeLineUoOverboughtCross(data, {
      short: 7,
      mid: 14,
      long: 28,
    });
    for (let i = 0; i < 28; i += 1) expect(uo[i]).toBeNull();
  });

  it('custom periods (3 / 5 / 10) work', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { uo } = computeLineUoOverboughtCross(data, {
      short: 3,
      mid: 5,
      long: 10,
    });
    for (let i = 0; i < 10; i += 1) expect(uo[i]).toBeNull();
    for (let i = 10; i < 20; i += 1) {
      expect(uo[i]).toBeCloseTo(100, 10);
    }
  });
});

describe('classifyLineUoOverboughtCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineUoOverboughtCrossRegime(null, 70)).toBe('none');
  });

  it('uo at threshold boundary -> bullish', () => {
    expect(classifyLineUoOverboughtCrossRegime(70, 70)).toBe('bullish');
    expect(classifyLineUoOverboughtCrossRegime(85, 70)).toBe('bullish');
  });

  it('uo < threshold -> bearish', () => {
    expect(classifyLineUoOverboughtCrossRegime(69.99, 70)).toBe('bearish');
    expect(classifyLineUoOverboughtCrossRegime(50, 70)).toBe('bearish');
    expect(classifyLineUoOverboughtCrossRegime(0, 70)).toBe('bearish');
  });
});

describe('detectLineUoOverboughtCrossCrosses', () => {
  it('fires bullish when uo crosses up through 70', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const uo = [50, 60, 65, 80, 85];
    const crosses = detectLineUoOverboughtCrossCrosses(series, uo, 70);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when uo crosses down through 70', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const uo = [85, 80, 72, 60, 50];
    const crosses = detectLineUoOverboughtCrossCrosses(series, uo, 70);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const uo = [60, 80, 75, 60];
    const crosses = detectLineUoOverboughtCrossCrosses(series, uo, 70);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineUoOverboughtCrossCrosses(series, [null, 60, 80], 70),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineUoOverboughtCrossCrosses(series, [60, null, 80], 70),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineUoOverboughtCrossCrosses(series, [60, 70], 70),
    ).toEqual([]);
  });

  it('no cross when uo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineUoOverboughtCrossCrosses(series, [10, 20, 30, 40], 70),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineUoOverboughtCrossCrosses(series, [70, 75, 85], 80),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineUoOverboughtCross', () => {
  it('CONST K -> 0 crosses, all bearish (uo=50 < 70)', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineUoOverboughtCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(28);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(12);
    expect(run.short).toBe(7);
    expect(run.mid).toBe(14);
    expect(run.long).toBe(28);
  });

  it('LINEAR UP -> all bullish after warmup (uo=100 >= 70)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineUoOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(12);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup (uo=0)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineUoOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(12);
  });

  it('decline then rise generates bullish (entry) cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const run = runLineUoOverboughtCross(mk(closes));
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish (exit) cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const run = runLineUoOverboughtCross(mk(closes));
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineUoOverboughtCross(data, { threshold: NaN });
    expect(run.threshold).toBe(70);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(runLineUoOverboughtCross(data, { threshold: 80 }).threshold).toBe(
      80,
    );
    expect(runLineUoOverboughtCross(data, { threshold: 60 }).threshold).toBe(
      60,
    );
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineUoOverboughtCross([]).ok).toBe(false);
    expect(runLineUoOverboughtCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineUoOverboughtCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineUoOverboughtCross(data);
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / uo / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineUoOverboughtCross(data);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 28; i += 1) {
      expect(run.samples[i]!.uo).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 28; i < 40; i += 1) {
      expect(run.samples[i]!.uo).toBe(50);
      expect(run.samples[i]!.regime).toBe('bearish');
    }
  });
});

describe('computeLineUoOverboughtCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineUoOverboughtCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_PANEL_GAP,
    );
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineUoOverboughtCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY above panel midpoint when threshold=70', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineUoOverboughtCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    // Threshold = 70 -> y is closer to oscTop than midpoint.
    const midpoint = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.thresholdY).toBeLessThan(midpoint);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineUoOverboughtCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.uoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineUoOverboughtCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('uo path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineUoOverboughtCrossLayout({ data });
    expect(layout.uoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.uoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineUoOverboughtCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const layout = computeLineUoOverboughtCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineUoOverboughtCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineUoOverboughtCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineUoOverboughtCrossChart(data);
    expect(desc).toContain('UO Overbought Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('short 7');
    expect(desc).toContain('mid 14');
    expect(desc).toContain('long 28');
    expect(desc).toContain('threshold 70');
  });
});

describe('ChartLineUoOverboughtCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineUoOverboughtCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'UO Overbought Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-uo-overbought-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('UO Overbought Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOverboughtCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-uo-overbought-cross-badge"]',
    );
    expect(badge?.textContent).toContain('short 7');
    expect(badge?.textContent).toContain('mid 14');
    expect(badge?.textContent).toContain('long 28');
    expect(badge?.textContent).toContain('threshold 70');
  });

  it('renders legend toggles for price + uo', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOverboughtCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('uo');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOverboughtCross data={data} />);
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
      <ChartLineUoOverboughtCross data={data} hiddenSeries={['uo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-uo-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineUoOverboughtCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-uo-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineUoOverboughtCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="uo"]')!);
    expect(events).toEqual([{ seriesId: 'uo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOverboughtCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="uo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineUoOverboughtCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineUoOverboughtCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOverboughtCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOverboughtCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-uo-overbought-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-uo-overbought-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOverboughtCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineUoOverboughtCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineUoOverboughtCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineUoOverboughtCross data={mk(closes)} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-uo-overbought-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineUoOverboughtCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineUoOverboughtCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOverboughtCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-uo-overbought-cross"]',
    );
    expect(region?.getAttribute('data-short')).toBe('7');
    expect(region?.getAttribute('data-mid')).toBe('14');
    expect(region?.getAttribute('data-long')).toBe('28');
    expect(region?.getAttribute('data-threshold')).toBe('70');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bearish-count')).toBe('12');
  });

  it('defaults: short=7, mid=14, long=28, threshold=70', () => {
    expect(DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_SHORT).toBe(7);
    expect(DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_MID).toBe(14);
    expect(DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_LONG).toBe(28);
    expect(DEFAULT_CHART_LINE_UO_OVERBOUGHT_CROSS_THRESHOLD).toBe(70);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineUoOverboughtCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-uo-overbought-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineUoOverboughtCrossLayout({ data });
    const b = computeLineUoOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.uoPath).toBe(b.uoPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const data = mk(closes);
    const a = computeLineUoOverboughtCrossLayout({ data });
    const b = computeLineUoOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.uoPath).toBe(b.uoPath);
    expect(a.run.uoValues).toEqual(b.run.uoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
