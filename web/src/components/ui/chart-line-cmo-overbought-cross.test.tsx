import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineCmoOverboughtCross,
  DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_LENGTH,
  DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_PADDING,
  DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_WIDTH,
  classifyLineCmoOverboughtCrossRegime,
  computeLineCmoOverboughtCross,
  computeLineCmoOverboughtCrossLayout,
  describeLineCmoOverboughtCrossChart,
  detectLineCmoOverboughtCrossCrosses,
  getLineCmoOverboughtCrossFinitePoints,
  normalizeLineCmoOverboughtCrossLength,
  normalizeLineCmoOverboughtCrossThreshold,
  runLineCmoOverboughtCross,
  type ChartLineCmoOverboughtCrossPoint,
} from './chart-line-cmo-overbought-cross';

const mk = (closes: number[]): ChartLineCmoOverboughtCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineCmoOverboughtCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineCmoOverboughtCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineCmoOverboughtCrossFinitePoints(null)).toEqual([]);
    expect(getLineCmoOverboughtCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineCmoOverboughtCrossFinitePoints(
        'oops' as unknown as ChartLineCmoOverboughtCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineCmoOverboughtCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineCmoOverboughtCrossLength(14, 14)).toBe(14);
    expect(normalizeLineCmoOverboughtCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineCmoOverboughtCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineCmoOverboughtCrossLength(0, 14)).toBe(14);
    expect(normalizeLineCmoOverboughtCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineCmoOverboughtCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineCmoOverboughtCrossThreshold', () => {
  it('accepts values within [-100, 100]', () => {
    expect(normalizeLineCmoOverboughtCrossThreshold(50, 50)).toBe(50);
    expect(normalizeLineCmoOverboughtCrossThreshold(-100, 50)).toBe(-100);
    expect(normalizeLineCmoOverboughtCrossThreshold(100, 50)).toBe(100);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineCmoOverboughtCrossThreshold(101, 50)).toBe(50);
    expect(normalizeLineCmoOverboughtCrossThreshold(-101, 50)).toBe(50);
    expect(normalizeLineCmoOverboughtCrossThreshold(NaN, 50)).toBe(50);
  });
});

describe('computeLineCmoOverboughtCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> cmo = 0 via zero-flow guard',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { cmo } = computeLineCmoOverboughtCross(data, { length: 14 });
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

describe('computeLineCmoOverboughtCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> cmo = 100 constant (no losses)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { cmo } = computeLineCmoOverboughtCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(cmo[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i (length=14) -> cmo = -100 constant (no gains)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { cmo } = computeLineCmoOverboughtCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(cmo[i]).toBe(-100);
    }
  });

  it('balanced alternation -> cmo = 0 (gain == loss)', () => {
    const data = mk(
      Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
    );
    const { cmo } = computeLineCmoOverboughtCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(cmo[i]).toBe(0);
    }
  });
});

describe('classifyLineCmoOverboughtCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineCmoOverboughtCrossRegime(null, 50)).toBe('none');
  });

  it('cmo at threshold boundary -> bullish (in overbought)', () => {
    expect(classifyLineCmoOverboughtCrossRegime(50, 50)).toBe('bullish');
    expect(classifyLineCmoOverboughtCrossRegime(75, 50)).toBe('bullish');
    expect(classifyLineCmoOverboughtCrossRegime(100, 50)).toBe('bullish');
  });

  it('cmo < threshold -> bearish (below overbought)', () => {
    expect(classifyLineCmoOverboughtCrossRegime(49.99, 50)).toBe('bearish');
    expect(classifyLineCmoOverboughtCrossRegime(0, 50)).toBe('bearish');
    expect(classifyLineCmoOverboughtCrossRegime(-100, 50)).toBe('bearish');
  });
});

describe('detectLineCmoOverboughtCrossCrosses', () => {
  it('fires bullish when cmo crosses up through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cmo = [30, 35, 45, 60, 70];
    const crosses = detectLineCmoOverboughtCrossCrosses(series, cmo, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when cmo crosses down through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cmo = [70, 65, 55, 40, 30];
    const crosses = detectLineCmoOverboughtCrossCrosses(series, cmo, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const cmo = [30, 70, 60, 30];
    const crosses = detectLineCmoOverboughtCrossCrosses(series, cmo, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineCmoOverboughtCrossCrosses(series, [null, 30, 70], 50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineCmoOverboughtCrossCrosses(series, [30, null, 70], 50),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineCmoOverboughtCrossCrosses(series, [30, 50], 50),
    ).toEqual([]);
  });

  it('no cross when cmo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineCmoOverboughtCrossCrosses(series, [10, 20, 30, 40], 50),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineCmoOverboughtCrossCrosses(series, [50, 55, 65], 60),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineCmoOverboughtCross', () => {
  it('CONST K -> 0 crosses, all bearish (cmo=0 < 50)', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineCmoOverboughtCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(14);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(16);
    expect(run.length).toBe(14);
    expect(run.threshold).toBe(50);
  });

  it('LINEAR UP -> all bullish (cmo=100 >= 50), 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineCmoOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(16);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish (cmo=-100), 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineCmoOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(16);
  });

  it('decline then rise generates a bullish overbought cross', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const run = runLineCmoOverboughtCross(mk(closes));
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('threshold normalization clamps out-of-range', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCmoOverboughtCross(data, { threshold: 200 });
    expect(run.threshold).toBe(50);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(30).fill(10));
    expect(
      runLineCmoOverboughtCross(data, { threshold: 60 }).threshold,
    ).toBe(60);
    expect(
      runLineCmoOverboughtCross(data, { threshold: 40 }).threshold,
    ).toBe(40);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineCmoOverboughtCross([]).ok).toBe(false);
    expect(runLineCmoOverboughtCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineCmoOverboughtCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineCmoOverboughtCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / cmo / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCmoOverboughtCross(data);
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 14; i += 1) {
      expect(run.samples[i]!.cmo).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 14; i < 30; i += 1) {
      expect(run.samples[i]!.cmo).toBe(0);
      expect(run.samples[i]!.regime).toBe('bearish');
    }
  });
});

describe('computeLineCmoOverboughtCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCmoOverboughtCrossLayout({ data });
    expect(layout.width).toBe(
      DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_WIDTH,
    );
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_PANEL_GAP,
    );
  });

  it('osc range fixed at -100..100', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCmoOverboughtCrossLayout({ data });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY at 50 sits above panel midpoint (high on screen)', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCmoOverboughtCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    const midpoint = (layout.oscTop + layout.oscBottom) / 2;
    // 50 is above midpoint=0 of [-100, 100] -> smaller y in SVG.
    expect(layout.thresholdY).toBeLessThan(midpoint);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineCmoOverboughtCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cmoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineCmoOverboughtCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('cmo path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineCmoOverboughtCrossLayout({ data });
    expect(layout.cmoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.cmoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineCmoOverboughtCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const layout = computeLineCmoOverboughtCrossLayout({
      data: mk(closes),
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineCmoOverboughtCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineCmoOverboughtCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + entry/exit framing', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineCmoOverboughtCrossChart(data);
    expect(desc).toContain('CMO Overbought Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('threshold 50');
    expect(desc).toContain('overbought trigger entry / exit');
  });
});

describe('ChartLineCmoOverboughtCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineCmoOverboughtCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'CMO Overbought Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-cmo-overbought-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('CMO Overbought Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoOverboughtCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cmo-overbought-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + cmo', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoOverboughtCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('cmo');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoOverboughtCross data={data} />);
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
      <ChartLineCmoOverboughtCross data={data} hiddenSeries={['cmo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-cmo-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineCmoOverboughtCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-cmo-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineCmoOverboughtCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="cmo"]')!);
    expect(events).toEqual([{ seriesId: 'cmo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoOverboughtCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="cmo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineCmoOverboughtCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCmoOverboughtCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoOverboughtCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoOverboughtCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-cmo-overbought-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-cmo-overbought-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoOverboughtCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCmoOverboughtCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCmoOverboughtCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const { container } = render(
      <ChartLineCmoOverboughtCross data={mk(closes)} />,
    );
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-cmo-overbought-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const { container } = render(
      <ChartLineCmoOverboughtCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 2),
    ];
    const { container } = render(
      <ChartLineCmoOverboughtCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCmoOverboughtCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-cmo-overbought-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bearish-count')).toBe('16');
    expect(region?.getAttribute('data-bullish-count')).toBe('0');
  });

  it('defaults: length=14, threshold=50', () => {
    expect(DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_CMO_OVERBOUGHT_CROSS_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCmoOverboughtCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cmo-overbought-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineCmoOverboughtCrossLayout({ data });
    const b = computeLineCmoOverboughtCrossLayout({ data });
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
    const a = computeLineCmoOverboughtCrossLayout({ data });
    const b = computeLineCmoOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cmoPath).toBe(b.cmoPath);
    expect(a.run.cmoValues).toEqual(b.run.cmoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
