import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineUoOversoldCross,
  DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_LONG,
  DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_MID,
  DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PADDING,
  DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_SHORT,
  DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_WIDTH,
  applyLineUoOversoldCrossPressure,
  classifyLineUoOversoldCrossRegime,
  computeLineUoOversoldCross,
  computeLineUoOversoldCrossLayout,
  describeLineUoOversoldCrossChart,
  detectLineUoOversoldCrossCrosses,
  getLineUoOversoldCrossFinitePoints,
  normalizeLineUoOversoldCrossLength,
  normalizeLineUoOversoldCrossThreshold,
  runLineUoOversoldCross,
  type ChartLineUoOversoldCrossPoint,
} from './chart-line-uo-oversold-cross';

const mk = (closes: number[]): ChartLineUoOversoldCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineUoOversoldCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineUoOversoldCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineUoOversoldCrossFinitePoints(null)).toEqual([]);
    expect(getLineUoOversoldCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineUoOversoldCrossFinitePoints(
        'oops' as unknown as ChartLineUoOversoldCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineUoOversoldCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineUoOversoldCrossLength(7, 14)).toBe(7);
    expect(normalizeLineUoOversoldCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineUoOversoldCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineUoOversoldCrossLength(0, 14)).toBe(14);
    expect(normalizeLineUoOversoldCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineUoOversoldCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineUoOversoldCrossThreshold(30, 30)).toBe(30);
    expect(normalizeLineUoOversoldCrossThreshold(40, 30)).toBe(40);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineUoOversoldCrossThreshold(NaN, 30)).toBe(30);
  });
});

describe('applyLineUoOversoldCrossPressure', () => {
  it('CONST closes -> bp = tr = 0 from i=1', () => {
    const { bp, tr } = applyLineUoOversoldCrossPressure(
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
    const { bp, tr } = applyLineUoOversoldCrossPressure(closes);
    for (let i = 1; i < 10; i += 1) {
      expect(bp[i]).toBe(1);
      expect(tr[i]).toBe(1);
    }
  });

  it('LINEAR DOWN delta=-1 -> bp=0, tr=1', () => {
    const closes = Array.from({ length: 10 }, (_, i) => -i);
    const { bp, tr } = applyLineUoOversoldCrossPressure(closes);
    for (let i = 1; i < 10; i += 1) {
      expect(bp[i]).toBe(0);
      expect(tr[i]).toBe(1);
    }
  });
});

describe('computeLineUoOversoldCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> uo = 50 from index long onward (0/0 -> 0.5 fallback)',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { uo } = computeLineUoOversoldCross(data, {
        short: 7,
        mid: 14,
        long: 28,
      });
      for (let i = 0; i < 28; i += 1) expect(uo[i]).toBeNull();
      for (let i = 28; i < 40; i += 1) expect(uo[i]).toBe(50);
    },
  );
});

describe('computeLineUoOversoldCross - LINEAR ramps', () => {
  it('LINEAR UP -> uo = 100 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { uo } = computeLineUoOversoldCross(data, {
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
    const { uo } = computeLineUoOversoldCross(data, {
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
    const { uo } = computeLineUoOversoldCross(data, {
      short: 7,
      mid: 14,
      long: 28,
    });
    for (let i = 0; i < 28; i += 1) expect(uo[i]).toBeNull();
  });

  it('custom periods (3 / 5 / 10) work', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { uo } = computeLineUoOversoldCross(data, {
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

describe('classifyLineUoOversoldCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineUoOversoldCrossRegime(null, 30)).toBe('none');
  });

  it('uo at threshold boundary -> bullish', () => {
    expect(classifyLineUoOversoldCrossRegime(30, 30)).toBe('bullish');
    expect(classifyLineUoOversoldCrossRegime(50, 30)).toBe('bullish');
  });

  it('uo < threshold -> bearish', () => {
    expect(classifyLineUoOversoldCrossRegime(29.99, 30)).toBe('bearish');
    expect(classifyLineUoOversoldCrossRegime(0, 30)).toBe('bearish');
  });
});

describe('detectLineUoOversoldCrossCrosses', () => {
  it('fires bullish (exit) when uo crosses up through 30', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const uo = [10, 15, 25, 40, 50];
    const crosses = detectLineUoOversoldCrossCrosses(series, uo, 30);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish (entry) when uo crosses down through 30', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const uo = [50, 40, 32, 20, 10];
    const crosses = detectLineUoOversoldCrossCrosses(series, uo, 30);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const uo = [20, 40, 35, 20];
    const crosses = detectLineUoOversoldCrossCrosses(series, uo, 30);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineUoOversoldCrossCrosses(series, [null, 10, 40], 30),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineUoOversoldCrossCrosses(series, [10, null, 40], 30),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineUoOversoldCrossCrosses(series, [10, 30], 30),
    ).toEqual([]);
  });

  it('no cross when uo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineUoOversoldCrossCrosses(series, [60, 70, 80, 90], 30),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineUoOversoldCrossCrosses(series, [25, 30, 45], 40),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineUoOversoldCross', () => {
  it('CONST K -> 0 crosses, all bullish (uo=50 >= 30)', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineUoOversoldCross(data);
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
    const run = runLineUoOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(12);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup (uo=0 < 30)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineUoOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(12);
  });

  it('decline then rise generates bullish (exit) cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const run = runLineUoOversoldCross(mk(closes));
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish (entry) cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const run = runLineUoOversoldCross(mk(closes));
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineUoOversoldCross(data, { threshold: NaN });
    expect(run.threshold).toBe(30);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(runLineUoOversoldCross(data, { threshold: 40 }).threshold).toBe(40);
    expect(runLineUoOversoldCross(data, { threshold: 20 }).threshold).toBe(20);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineUoOversoldCross([]).ok).toBe(false);
    expect(runLineUoOversoldCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineUoOversoldCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineUoOversoldCross(data);
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / uo / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineUoOversoldCross(data);
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

describe('computeLineUoOversoldCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineUoOversoldCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_PANEL_GAP,
    );
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineUoOversoldCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY below panel midpoint when threshold=30', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineUoOversoldCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    // Threshold = 30 -> y is closer to oscBottom (low values plot low).
    const midpoint = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.thresholdY).toBeGreaterThan(midpoint);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineUoOversoldCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.uoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineUoOversoldCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('uo path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineUoOversoldCrossLayout({ data });
    expect(layout.uoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.uoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineUoOversoldCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const layout = computeLineUoOversoldCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineUoOversoldCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineUoOversoldCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineUoOversoldCrossChart(data);
    expect(desc).toContain('UO Oversold Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('short 7');
    expect(desc).toContain('mid 14');
    expect(desc).toContain('long 28');
    expect(desc).toContain('threshold 30');
  });
});

describe('ChartLineUoOversoldCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineUoOversoldCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'UO Oversold Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-uo-oversold-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('UO Oversold Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOversoldCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-uo-oversold-cross-badge"]',
    );
    expect(badge?.textContent).toContain('short 7');
    expect(badge?.textContent).toContain('mid 14');
    expect(badge?.textContent).toContain('long 28');
    expect(badge?.textContent).toContain('threshold 30');
  });

  it('renders legend toggles for price + uo', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOversoldCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('uo');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOversoldCross data={data} />);
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
      <ChartLineUoOversoldCross data={data} hiddenSeries={['uo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-uo-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineUoOversoldCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-uo-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineUoOversoldCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="uo"]')!);
    expect(events).toEqual([{ seriesId: 'uo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOversoldCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="uo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineUoOversoldCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineUoOversoldCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOversoldCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOversoldCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-uo-oversold-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-uo-oversold-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOversoldCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineUoOversoldCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineUoOversoldCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineUoOversoldCross data={mk(closes)} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-uo-oversold-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineUoOversoldCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineUoOversoldCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-uo-oversold-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineUoOversoldCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-uo-oversold-cross"]',
    );
    expect(region?.getAttribute('data-short')).toBe('7');
    expect(region?.getAttribute('data-mid')).toBe('14');
    expect(region?.getAttribute('data-long')).toBe('28');
    expect(region?.getAttribute('data-threshold')).toBe('30');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('12');
  });

  it('defaults: short=7, mid=14, long=28, threshold=30', () => {
    expect(DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_SHORT).toBe(7);
    expect(DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_MID).toBe(14);
    expect(DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_LONG).toBe(28);
    expect(DEFAULT_CHART_LINE_UO_OVERSOLD_CROSS_THRESHOLD).toBe(30);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineUoOversoldCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-uo-oversold-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineUoOversoldCrossLayout({ data });
    const b = computeLineUoOversoldCrossLayout({ data });
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
    const a = computeLineUoOversoldCrossLayout({ data });
    const b = computeLineUoOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.uoPath).toBe(b.uoPath);
    expect(a.run.uoValues).toEqual(b.run.uoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
