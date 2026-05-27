import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineTsiOverboughtCross,
  DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_LONG,
  DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_PADDING,
  DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_SHORT,
  DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_WIDTH,
  applyLineTsiOverboughtCrossEma,
  classifyLineTsiOverboughtCrossRegime,
  computeLineTsiOverboughtCross,
  computeLineTsiOverboughtCrossLayout,
  describeLineTsiOverboughtCrossChart,
  detectLineTsiOverboughtCrossCrosses,
  getLineTsiOverboughtCrossFinitePoints,
  normalizeLineTsiOverboughtCrossLength,
  normalizeLineTsiOverboughtCrossThreshold,
  runLineTsiOverboughtCross,
  type ChartLineTsiOverboughtCrossPoint,
} from './chart-line-tsi-overbought-cross';

const mk = (closes: number[]): ChartLineTsiOverboughtCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const SMALL = { long: 5, short: 3 };

describe('getLineTsiOverboughtCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineTsiOverboughtCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineTsiOverboughtCrossFinitePoints(null)).toEqual([]);
    expect(getLineTsiOverboughtCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineTsiOverboughtCrossFinitePoints(
        'oops' as unknown as ChartLineTsiOverboughtCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineTsiOverboughtCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineTsiOverboughtCrossLength(25, 25)).toBe(25);
    expect(normalizeLineTsiOverboughtCrossLength(1, 25)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineTsiOverboughtCrossLength(7.9, 25)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineTsiOverboughtCrossLength(0, 25)).toBe(25);
    expect(normalizeLineTsiOverboughtCrossLength(NaN, 25)).toBe(25);
  });
});

describe('normalizeLineTsiOverboughtCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineTsiOverboughtCrossThreshold(25, 25)).toBe(25);
    expect(normalizeLineTsiOverboughtCrossThreshold(50, 25)).toBe(50);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineTsiOverboughtCrossThreshold(NaN, 25)).toBe(25);
  });
});

describe('applyLineTsiOverboughtCrossEma', () => {
  it('CONST after seed -> constant', () => {
    const values: Array<number | null> = [null, 5, 5, 5, 5, 5, 5, 5];
    const out = applyLineTsiOverboughtCrossEma(values, 5, 1);
    expect(out[5]).toBe(5);
    for (let i = 5; i < 8; i += 1) expect(out[i]).toBe(5);
  });

  it('null seed window -> all null', () => {
    const out = applyLineTsiOverboughtCrossEma(
      [null, 1, null, 3, 4, 5],
      3,
      1,
    );
    expect(out).toEqual([null, null, null, null, null, null]);
  });

  it('length === 1 returns verbatim from firstValidIdx', () => {
    const out = applyLineTsiOverboughtCrossEma([null, 1, 2, 3], 1, 1);
    expect(out).toEqual([null, 1, 2, 3]);
  });
});

describe('computeLineTsiOverboughtCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> tsi = 0 via 0/0 fallback',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { tsi } = computeLineTsiOverboughtCross(data, SMALL);
      // SMALL: long=5, short=3 -> sm2 valid at i=5+3-1=7.
      for (let i = 0; i < 7; i += 1) expect(tsi[i]).toBeNull();
      for (let i = 7; i < 40; i += 1) expect(tsi[i]).toBe(0);
    },
  );
});

describe('computeLineTsiOverboughtCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> tsi = 100', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { tsi } = computeLineTsiOverboughtCross(data, SMALL);
    for (let i = 7; i < 40; i += 1) {
      expect(tsi[i]).toBeCloseTo(100, 10);
    }
  });

  it('LINEAR DOWN close=-i -> tsi = -100', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { tsi } = computeLineTsiOverboughtCross(data, SMALL);
    for (let i = 7; i < 40; i += 1) {
      expect(tsi[i]).toBeCloseTo(-100, 10);
    }
  });

  it('tsi[i < 1 + (long-1) + (short-1)] is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { tsi } = computeLineTsiOverboughtCross(data, SMALL);
    for (let i = 0; i < 7; i += 1) expect(tsi[i]).toBeNull();
  });

  it('custom larger long / short extends warmup', () => {
    const data = mk(new Array(60).fill(10));
    const { tsi } = computeLineTsiOverboughtCross(data, {
      long: 10,
      short: 5,
    });
    for (let i = 0; i < 14; i += 1) expect(tsi[i]).toBeNull();
    for (let i = 14; i < 60; i += 1) expect(tsi[i]).toBe(0);
  });
});

describe('classifyLineTsiOverboughtCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineTsiOverboughtCrossRegime(null, 25)).toBe('none');
  });

  it('tsi at threshold boundary -> bullish', () => {
    expect(classifyLineTsiOverboughtCrossRegime(25, 25)).toBe('bullish');
    expect(classifyLineTsiOverboughtCrossRegime(75, 25)).toBe('bullish');
  });

  it('tsi < threshold -> bearish', () => {
    expect(classifyLineTsiOverboughtCrossRegime(24.99, 25)).toBe('bearish');
    expect(classifyLineTsiOverboughtCrossRegime(0, 25)).toBe('bearish');
    expect(classifyLineTsiOverboughtCrossRegime(-100, 25)).toBe('bearish');
  });
});

describe('detectLineTsiOverboughtCrossCrosses', () => {
  it('fires bullish (entry) when tsi crosses up through 25', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const tsi = [-10, 0, 20, 35, 50];
    const crosses = detectLineTsiOverboughtCrossCrosses(series, tsi, 25);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish (exit) when tsi crosses down through 25', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const tsi = [50, 35, 27, 10, 0];
    const crosses = detectLineTsiOverboughtCrossCrosses(series, tsi, 25);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const tsi = [0, 50, 30, 0];
    const crosses = detectLineTsiOverboughtCrossCrosses(series, tsi, 25);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineTsiOverboughtCrossCrosses(series, [null, 0, 50], 25),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineTsiOverboughtCrossCrosses(series, [0, null, 50], 25),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineTsiOverboughtCrossCrosses(series, [0, 25], 25),
    ).toEqual([]);
  });

  it('no cross when tsi stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineTsiOverboughtCrossCrosses(series, [50, 60, 70, 80], 25),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineTsiOverboughtCrossCrosses(series, [10, 15, 25], 20),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineTsiOverboughtCross', () => {
  it('CONST K -> 0 crosses, all bearish (tsi=0 < 25)', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineTsiOverboughtCross(data, SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(7);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(33);
    expect(run.long).toBe(5);
    expect(run.short).toBe(3);
  });

  it('LINEAR UP -> all bullish after warmup (tsi=100 >= 25)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineTsiOverboughtCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(33);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup (tsi=-100 < 25)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineTsiOverboughtCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(33);
  });

  it('decline then rise generates bullish (entry) cross', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const run = runLineTsiOverboughtCross(mk(closes), SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish (exit) cross', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const run = runLineTsiOverboughtCross(mk(closes), SMALL);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineTsiOverboughtCross(data, {
      ...SMALL,
      threshold: NaN,
    });
    expect(run.threshold).toBe(25);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(50));
    expect(
      runLineTsiOverboughtCross(data, { ...SMALL, threshold: 50 }).threshold,
    ).toBe(50);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineTsiOverboughtCross([], SMALL).ok).toBe(false);
    expect(runLineTsiOverboughtCross(mk([1, 2, 3]), SMALL).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineTsiOverboughtCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineTsiOverboughtCross(data, { long: 1, short: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / tsi / regime', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineTsiOverboughtCross(data, SMALL);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 7; i += 1) {
      expect(run.samples[i]!.tsi).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 7; i < 40; i += 1) {
      expect(run.samples[i]!.tsi).toBe(0);
      expect(run.samples[i]!.regime).toBe('bearish');
    }
  });
});

describe('computeLineTsiOverboughtCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_PANEL_GAP,
    );
  });

  it('fixed -100..100 oscillator range', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY above midpoint when threshold=25', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    // 25 > 0 (midpoint of -100..100), so y above midpoint.
    const midpoint = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.thresholdY).toBeLessThan(midpoint);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineTsiOverboughtCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.tsiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('tsi path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    expect(layout.tsiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.tsiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const layout = computeLineTsiOverboughtCrossLayout({
      data: mk(closes),
      ...SMALL,
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

describe('describeLineTsiOverboughtCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineTsiOverboughtCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineTsiOverboughtCrossChart(data);
    expect(desc).toContain('TSI Overbought Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('long 25');
    expect(desc).toContain('short 13');
    expect(desc).toContain('threshold 25');
  });
});

describe('ChartLineTsiOverboughtCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'TSI Overbought Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-tsi-overbought-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('TSI Overbought Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-tsi-overbought-cross-badge"]',
    );
    expect(badge?.textContent).toContain('long 5');
    expect(badge?.textContent).toContain('short 3');
    expect(badge?.textContent).toContain('threshold 25');
  });

  it('renders legend toggles for price + tsi', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('tsi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector('[data-series-id="tsi"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineTsiOverboughtCross
        data={data}
        {...SMALL}
        hiddenSeries={['tsi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-tsi-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineTsiOverboughtCross
        data={data}
        {...SMALL}
        hiddenSeries={[]}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-tsi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineTsiOverboughtCross
        data={data}
        {...SMALL}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="tsi"]')!);
    expect(events).toEqual([{ seriesId: 'tsi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector(
      '[data-series-id="tsi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineTsiOverboughtCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross
        data={data}
        {...SMALL}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-tsi-overbought-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-tsi-overbought-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross
        data={data}
        {...SMALL}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross
        data={data}
        {...SMALL}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineTsiOverboughtCross data={mk(closes)} {...SMALL} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-tsi-overbought-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineTsiOverboughtCross
        data={mk(closes)}
        {...SMALL}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineTsiOverboughtCross
        data={mk(closes)}
        {...SMALL}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-tsi-overbought-cross"]',
    );
    expect(region?.getAttribute('data-long')).toBe('5');
    expect(region?.getAttribute('data-short')).toBe('3');
    expect(region?.getAttribute('data-threshold')).toBe('25');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bearish-count')).toBe('33');
  });

  it('defaults: long=25, short=13, threshold=25', () => {
    expect(DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_LONG).toBe(25);
    expect(DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_SHORT).toBe(13);
    expect(DEFAULT_CHART_LINE_TSI_OVERBOUGHT_CROSS_THRESHOLD).toBe(25);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineTsiOverboughtCross data={data} {...SMALL} ref={ref} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-tsi-overbought-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    const b = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.tsiPath).toBe(b.tsiPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for decline-then-rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const data = mk(closes);
    const a = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    const b = computeLineTsiOverboughtCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.tsiPath).toBe(b.tsiPath);
    expect(a.run.tsiValues).toEqual(b.run.tsiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
