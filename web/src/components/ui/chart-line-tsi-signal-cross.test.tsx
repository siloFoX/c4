import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineTsiSignalCross,
  DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_LONG,
  DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PADDING,
  DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SHORT,
  DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SIGNAL,
  DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_WIDTH,
  applyLineTsiSignalCrossEma,
  classifyLineTsiSignalCrossRegime,
  computeLineTsiSignalCross,
  computeLineTsiSignalCrossLayout,
  describeLineTsiSignalCrossChart,
  detectLineTsiSignalCrossCrosses,
  getLineTsiSignalCrossFinitePoints,
  normalizeLineTsiSignalCrossLength,
  runLineTsiSignalCross,
  type ChartLineTsiSignalCrossPoint,
} from './chart-line-tsi-signal-cross';

const mk = (closes: number[]): ChartLineTsiSignalCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const SMALL = { long: 5, short: 3, signal: 3 };

describe('getLineTsiSignalCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineTsiSignalCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineTsiSignalCrossFinitePoints(null)).toEqual([]);
    expect(getLineTsiSignalCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineTsiSignalCrossFinitePoints(
        'oops' as unknown as ChartLineTsiSignalCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineTsiSignalCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineTsiSignalCrossLength(25, 25)).toBe(25);
    expect(normalizeLineTsiSignalCrossLength(1, 25)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineTsiSignalCrossLength(7.9, 25)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineTsiSignalCrossLength(0, 25)).toBe(25);
    expect(normalizeLineTsiSignalCrossLength(-1, 25)).toBe(25);
    expect(normalizeLineTsiSignalCrossLength(NaN, 25)).toBe(25);
  });
});

describe('applyLineTsiSignalCrossEma', () => {
  it('CONST after seed -> constant', () => {
    const values: Array<number | null> = [null, 5, 5, 5, 5, 5, 5, 5];
    const out = applyLineTsiSignalCrossEma(values, 5, 1);
    expect(out[5]).toBe(5);
    for (let i = 5; i < 8; i += 1) expect(out[i]).toBe(5);
  });

  it('null seed window -> all null', () => {
    const out = applyLineTsiSignalCrossEma(
      [null, 1, null, 3, 4, 5],
      3,
      1,
    );
    expect(out).toEqual([null, null, null, null, null, null]);
  });

  it('length === 1 returns verbatim from firstValidIdx', () => {
    const out = applyLineTsiSignalCrossEma([null, 1, 2, 3], 1, 1);
    expect(out).toEqual([null, 1, 2, 3]);
  });
});

describe('computeLineTsiSignalCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> tsi = signal = 0 from index long+short+signal-2 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { tsi, signal } = computeLineTsiSignalCross(data, SMALL);
      // SMALL: long=5, short=3, signal=3. tsi valid at i >= 7,
      // signal valid at i >= 9.
      for (let i = 0; i < 9; i += 1) {
        expect(signal[i]).toBeNull();
      }
      for (let i = 7; i < 40; i += 1) {
        expect(tsi[i]).toBe(0);
      }
      for (let i = 9; i < 40; i += 1) {
        expect(signal[i]).toBe(0);
      }
    },
  );
});

describe('computeLineTsiSignalCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> tsi = signal = 100 after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { tsi, signal } = computeLineTsiSignalCross(data, SMALL);
    for (let i = 7; i < 40; i += 1) {
      expect(tsi[i]).toBeCloseTo(100, 10);
    }
    for (let i = 9; i < 40; i += 1) {
      expect(signal[i]).toBeCloseTo(100, 10);
    }
  });

  it('LINEAR DOWN close=-i -> tsi = signal = -100 after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { tsi, signal } = computeLineTsiSignalCross(data, SMALL);
    for (let i = 7; i < 40; i += 1) {
      expect(tsi[i]).toBeCloseTo(-100, 10);
    }
    for (let i = 9; i < 40; i += 1) {
      expect(signal[i]).toBeCloseTo(-100, 10);
    }
  });

  it('signal[i < tsi_first + signal_length - 1] is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { signal } = computeLineTsiSignalCross(data, SMALL);
    for (let i = 0; i < 9; i += 1) {
      expect(signal[i]).toBeNull();
    }
  });

  it('custom larger long / short / signal extends warmup', () => {
    const data = mk(new Array(60).fill(10));
    const { tsi, signal } = computeLineTsiSignalCross(data, {
      long: 8,
      short: 4,
      signal: 5,
    });
    // tsi valid at i >= 8+4-1 = 11. signal valid at i >= 11+5-1 = 15.
    for (let i = 0; i < 11; i += 1) expect(tsi[i]).toBeNull();
    for (let i = 0; i < 15; i += 1) expect(signal[i]).toBeNull();
    for (let i = 15; i < 60; i += 1) {
      expect(tsi[i]).toBe(0);
      expect(signal[i]).toBe(0);
    }
  });
});

describe('classifyLineTsiSignalCrossRegime', () => {
  it('null tsi or null signal -> none', () => {
    expect(classifyLineTsiSignalCrossRegime(null, 0)).toBe('none');
    expect(classifyLineTsiSignalCrossRegime(0, null)).toBe('none');
    expect(classifyLineTsiSignalCrossRegime(null, null)).toBe('none');
  });

  it('tsi >= signal -> bullish', () => {
    expect(classifyLineTsiSignalCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineTsiSignalCrossRegime(50, 30)).toBe('bullish');
    expect(classifyLineTsiSignalCrossRegime(-30, -50)).toBe('bullish');
  });

  it('tsi < signal -> bearish', () => {
    expect(classifyLineTsiSignalCrossRegime(30, 50)).toBe('bearish');
    expect(classifyLineTsiSignalCrossRegime(-50, -30)).toBe('bearish');
  });
});

describe('detectLineTsiSignalCrossCrosses', () => {
  it('fires bullish when tsi crosses above signal', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const tsi = [-30, -20, -10, 20, 30];
    const signal = [-10, -5, 0, 5, 10];
    const crosses = detectLineTsiSignalCrossCrosses(series, tsi, signal);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when tsi crosses below signal', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const tsi = [30, 20, 10, -20, -30];
    const signal = [10, 5, 0, -5, -10];
    const crosses = detectLineTsiSignalCrossCrosses(series, tsi, signal);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const tsi = [-30, 30, 20, -30];
    const signal = [0, 0, 25, 0];
    const crosses = detectLineTsiSignalCrossCrosses(series, tsi, signal);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineTsiSignalCrossCrosses(series, [null, -1, 1], [0, 0, 0]),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineTsiSignalCrossCrosses(series, [-1, null, 1], [0, 0, 0]),
    ).toEqual([]);
    expect(
      detectLineTsiSignalCrossCrosses(series, [-1, 0, 1], [null, 0, 0]),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });

  it('boundary equality not crossed (strict cur > 0 diff)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineTsiSignalCrossCrosses(series, [-5, 0], [0, 0]),
    ).toEqual([]);
  });

  it('no cross when tsi stays on one side of signal', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineTsiSignalCrossCrosses(
        series,
        [-50, -40, -30, -20],
        [0, 0, 0, 0],
      ),
    ).toEqual([]);
  });
});

describe('runLineTsiSignalCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineTsiSignalCross(data, SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(9);
    expect(run.bullishCount).toBe(31);
    expect(run.bearishCount).toBe(0);
    expect(run.long).toBe(5);
    expect(run.short).toBe(3);
    expect(run.signal).toBe(3);
  });

  it('LINEAR UP -> all bullish after warmup (tsi = signal at +100)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineTsiSignalCross(data, SMALL);
    expect(run.bullishCount).toBe(31);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bullish at boundary (tsi = signal at -100)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineTsiSignalCross(data, SMALL);
    // Both converge to -100; tsi >= signal at equality, so bullish.
    expect(run.bullishCount).toBe(31);
    expect(run.bearishCount).toBe(0);
  });

  it('decline then rise generates bullish cross', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const run = runLineTsiSignalCross(mk(closes), SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish cross', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(i + 1);
    for (let i = 20; i < 40; i += 1) closes.push(40 - i);
    const run = runLineTsiSignalCross(mk(closes), SMALL);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineTsiSignalCross([], SMALL).ok).toBe(false);
    expect(runLineTsiSignalCross(mk([1, 2, 3]), SMALL).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineTsiSignalCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineTsiSignalCross(data, { long: 1, short: 1, signal: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / tsi / signal / regime', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineTsiSignalCross(data, SMALL);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 9; i += 1) {
      expect(run.samples[i]!.signal).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 9; i < 40; i += 1) {
      expect(run.samples[i]!.tsi).toBe(0);
      expect(run.samples[i]!.signal).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineTsiSignalCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PANEL_GAP,
    );
  });

  it('fixed -100..100 oscillator range', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(100);
  });

  it('zeroY sits at panel midpoint', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    const expected = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.zeroY).toBeCloseTo(expected, 5);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineTsiSignalCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.tsiPath).toBe('');
    expect(layout.signalPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('tsi / signal paths skip null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    expect(layout.tsiPath.startsWith('M ')).toBe(true);
    expect((layout.tsiPath.match(/M /g) ?? []).length).toBe(1);
    expect(layout.signalPath.startsWith('M ')).toBe(true);
    expect((layout.signalPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const layout = computeLineTsiSignalCrossLayout({
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

describe('describeLineTsiSignalCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineTsiSignalCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineTsiSignalCrossChart(data);
    expect(desc).toContain('TSI Signal Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('long 25');
    expect(desc).toContain('short 13');
    expect(desc).toContain('signal 7');
  });
});

describe('ChartLineTsiSignalCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('TSI Signal Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-tsi-signal-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('TSI Signal Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-tsi-signal-cross-badge"]',
    );
    expect(badge?.textContent).toContain('long 5');
    expect(badge?.textContent).toContain('short 3');
    expect(badge?.textContent).toContain('signal 3');
  });

  it('renders legend toggles for price + tsi + signal', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('tsi');
    expect(buttons[2].getAttribute('data-series-id')).toBe('signal');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector('[data-series-id="signal"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineTsiSignalCross
        data={data}
        {...SMALL}
        hiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-signal-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineTsiSignalCross data={data} {...SMALL} hiddenSeries={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineTsiSignalCross
        data={data}
        {...SMALL}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="signal"]')!);
    expect(events).toEqual([{ seriesId: 'signal', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector(
      '[data-series-id="signal"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineTsiSignalCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-tsi-signal-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-tsi-signal-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders zero band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-band-zero"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross
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
        '[data-section="chart-line-tsi-signal-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineTsiSignalCross data={mk(closes)} {...SMALL} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-tsi-signal-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineTsiSignalCross
        data={mk(closes)}
        {...SMALL}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const { container } = render(
      <ChartLineTsiSignalCross
        data={mk(closes)}
        {...SMALL}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-signal-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineTsiSignalCross data={data} {...SMALL} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-tsi-signal-cross"]',
    );
    expect(region?.getAttribute('data-long')).toBe('5');
    expect(region?.getAttribute('data-short')).toBe('3');
    expect(region?.getAttribute('data-signal')).toBe('3');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('31');
  });

  it('defaults: long=25, short=13, signal=7', () => {
    expect(DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_LONG).toBe(25);
    expect(DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SHORT).toBe(13);
    expect(DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SIGNAL).toBe(7);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineTsiSignalCross data={data} {...SMALL} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-tsi-signal-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    const b = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.tsiPath).toBe(b.tsiPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.zeroY).toBe(b.zeroY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for decline-then-rise pattern', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) closes.push(20 - i);
    for (let i = 20; i < 40; i += 1) closes.push(i - 19);
    const data = mk(closes);
    const a = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    const b = computeLineTsiSignalCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.tsiPath).toBe(b.tsiPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.tsiValues).toEqual(b.run.tsiValues);
    expect(a.run.signalValues).toEqual(b.run.signalValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
