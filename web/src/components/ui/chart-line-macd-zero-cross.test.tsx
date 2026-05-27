import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineMacdZeroCross,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_MACD_ZERO_CROSS_WIDTH,
  applyLineMacdZeroCrossEma,
  classifyLineMacdZeroCrossRegime,
  computeLineMacdZeroCross,
  computeLineMacdZeroCrossLayout,
  describeLineMacdZeroCrossChart,
  detectLineMacdZeroCrossCrosses,
  getLineMacdZeroCrossFinitePoints,
  normalizeLineMacdZeroCrossLength,
  normalizeLineMacdZeroCrossThreshold,
  runLineMacdZeroCross,
  type ChartLineMacdZeroCrossPoint,
} from './chart-line-macd-zero-cross';

const mk = (closes: number[]): ChartLineMacdZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineMacdZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineMacdZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineMacdZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineMacdZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineMacdZeroCrossFinitePoints(
        'oops' as unknown as ChartLineMacdZeroCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineMacdZeroCrossPoint[];
    expect(getLineMacdZeroCrossFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineMacdZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineMacdZeroCrossLength(12, 10)).toBe(12);
    expect(normalizeLineMacdZeroCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineMacdZeroCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineMacdZeroCrossLength(0, 10)).toBe(10);
    expect(normalizeLineMacdZeroCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineMacdZeroCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineMacdZeroCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineMacdZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineMacdZeroCrossThreshold(0, -10)).toBe(0);
    expect(normalizeLineMacdZeroCrossThreshold(5, -10)).toBe(5);
    expect(normalizeLineMacdZeroCrossThreshold(-2, -10)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineMacdZeroCrossThreshold(NaN, -10)).toBe(-10);
    expect(normalizeLineMacdZeroCrossThreshold(Infinity, -10)).toBe(-10);
  });
});

describe('applyLineMacdZeroCrossEma', () => {
  it('CONST values short-circuit to exact value', () => {
    const out = applyLineMacdZeroCrossEma(new Array(20).fill(42), 5);
    expect(out.slice(0, 4)).toEqual([null, null, null, null]);
    for (let i = 4; i < 20; i += 1) {
      expect(out[i]).toBe(42);
    }
  });

  it('CONST zeros stay at +0', () => {
    const out = applyLineMacdZeroCrossEma(new Array(20).fill(0), 5);
    expect(Object.is(out[4], 0)).toBe(true);
    expect(Object.is(out[4], -0)).toBe(false);
  });

  it('returns all null when values shorter than length', () => {
    expect(applyLineMacdZeroCrossEma([1, 2, 3], 5)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('null in seed window invalidates entire output', () => {
    const out = applyLineMacdZeroCrossEma([1, null, 3, 4, 5], 5);
    expect(out).toEqual([null, null, null, null, null]);
  });

  it('LINEAR ramp converges to steady-state lag', () => {
    const values = Array.from({ length: 50 }, (_, i) => i);
    const out = applyLineMacdZeroCrossEma(values, 12);
    // Lag = (12-1)/2 = 5.5, so by index 49 EMA ~= 49 - 5.5 = 43.5
    expect(out[49]).toBeGreaterThan(40);
    expect(out[49]).toBeLessThan(48);
  });
});

describe('computeLineMacdZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> macd is exactly 0 from index slowLength-1 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { macd } = computeLineMacdZeroCross(data, {
        fastLength: 12,
        slowLength: 26,
      });
      for (let i = 0; i < 25; i += 1) {
        expect(macd[i]).toBeNull();
      }
      for (let i = 25; i < 40; i += 1) {
        expect(macd[i]).toBe(0);
        expect(Object.is(macd[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineMacdZeroCross - LINEAR ramps', () => {
  it('LINEAR UP -> macd converges to positive ~7 (slowLag - fastLag)', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i));
    const { macd } = computeLineMacdZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
    });
    // At i=99, macd approaches 7 from below
    const last = macd[99];
    expect(last).not.toBeNull();
    expect(last).toBeGreaterThan(5);
    expect(last).toBeLessThan(8);
  });

  it('LINEAR DOWN -> macd converges to negative ~-7', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => -i));
    const { macd } = computeLineMacdZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
    });
    const last = macd[99];
    expect(last).not.toBeNull();
    expect(last).toBeLessThan(-5);
    expect(last).toBeGreaterThan(-8);
  });
});

describe('classifyLineMacdZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineMacdZeroCrossRegime(null, 0)).toBe('none');
  });

  it('macd at threshold boundary -> bullish', () => {
    expect(classifyLineMacdZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineMacdZeroCrossRegime(10, 0)).toBe('bullish');
    expect(classifyLineMacdZeroCrossRegime(1000, 0)).toBe('bullish');
  });

  it('macd < threshold -> bearish', () => {
    expect(classifyLineMacdZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineMacdZeroCrossRegime(-10, 0)).toBe('bearish');
  });

  it('respects custom threshold', () => {
    expect(classifyLineMacdZeroCrossRegime(5, 5)).toBe('bullish');
    expect(classifyLineMacdZeroCrossRegime(4, 5)).toBe('bearish');
  });
});

describe('detectLineMacdZeroCrossCrosses', () => {
  it('fires bullish when macd crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const macd = [-2, -1, -0.5, 0.3, 1];
    const crosses = detectLineMacdZeroCrossCrosses(series, macd, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when macd crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const macd = [2, 1, 0.5, -0.3, -1];
    const crosses = detectLineMacdZeroCrossCrosses(series, macd, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when macd sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const macd = [-1, 1, 0.5, -1];
    const crosses = detectLineMacdZeroCrossCrosses(series, macd, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineMacdZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineMacdZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality treated as not yet crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineMacdZeroCrossCrosses(series, [-1, 0], 0)).toEqual([]);
  });

  it('no cross when macd stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineMacdZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLineMacdZeroCross', () => {
  it('CONST K -> 0 crosses, bullish at boundary after warmup', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineMacdZeroCross(data, { fastLength: 12, slowLength: 26 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(25);
    expect(run.bullishCount).toBe(15);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i));
    const run = runLineMacdZeroCross(data, { fastLength: 12, slowLength: 26 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => -i));
    const run = runLineMacdZeroCross(data, { fastLength: 12, slowLength: 26 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.bullishCount).toBe(0);
  });

  it('decline then rise generates a bullish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const run = runLineMacdZeroCross(mk(closes), {
      fastLength: 12,
      slowLength: 26,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise then decline generates a bearish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 10 + i),
      ...Array.from({ length: 50 }, (_, i) => 59 - i * 2),
    ];
    const run = runLineMacdZeroCross(mk(closes), {
      fastLength: 12,
      slowLength: 26,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineMacdZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
      threshold: NaN,
    });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive threshold', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineMacdZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
      threshold: 5,
    });
    expect(run.threshold).toBe(5);
  });

  it('respects custom negative threshold', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineMacdZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
      threshold: -3,
    });
    expect(run.threshold).toBe(-3);
  });

  it('empty data -> ok=false', () => {
    const run = runLineMacdZeroCross([], { fastLength: 12 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineMacdZeroCross(mk([1, 2, 3]), { fastLength: 12 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineMacdZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineMacdZeroCross(data, { fastLength: 1, slowLength: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / macd / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineMacdZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
    });
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 25; i += 1) {
      expect(run.samples[i]!.macd).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 25; i < 40; i += 1) {
      expect(run.samples[i]!.macd).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineMacdZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineMacdZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_PANEL_GAP);
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i));
    const layout = computeLineMacdZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineMacdZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.macdPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed macd values plus padding', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i));
    const layout = computeLineMacdZeroCrossLayout({ data });
    // MACD converges to positive ~7, threshold=0 -> oscMin <= 0, oscMax >= 7
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThan(0);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineMacdZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('macd path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineMacdZeroCrossLayout({ data });
    expect(layout.macdPath.startsWith('M ')).toBe(true);
    const mCount = (layout.macdPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineMacdZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const layout = computeLineMacdZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineMacdZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineMacdZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineMacdZeroCrossChart(data);
    expect(desc).toContain('MACD Zero Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('fastLength 12');
    expect(desc).toContain('slowLength 26');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineMacdZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineMacdZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('MACD Zero Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-macd-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('MACD Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineMacdZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-macd-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('fast 12');
    expect(badge?.textContent).toContain('slow 26');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + macd', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineMacdZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('macd');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineMacdZeroCross data={data} />);
    const macdButton = container.querySelector('[data-series-id="macd"]');
    expect(macdButton?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(macdButton!);
    expect(macdButton?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(macdButton!);
    expect(macdButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineMacdZeroCross data={data} hiddenSeries={['macd']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-macd-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineMacdZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-macd-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineMacdZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="macd"]')!);
    expect(events).toEqual([{ seriesId: 'macd', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineMacdZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="macd"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineMacdZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineMacdZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineMacdZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineMacdZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-macd-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-macd-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineMacdZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineMacdZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineMacdZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const { container } = render(<ChartLineMacdZeroCross data={mk(closes)} />);
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-macd-zero-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const { container } = render(
      <ChartLineMacdZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const { container } = render(
      <ChartLineMacdZeroCross data={mk(closes)} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineMacdZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-macd-zero-cross"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('12');
    expect(region?.getAttribute('data-slow-length')).toBe('26');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('15');
  });

  it('defaults: fastLength=12, slowLength=26, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_FAST_LENGTH).toBe(12);
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SLOW_LENGTH).toBe(26);
    expect(DEFAULT_CHART_LINE_MACD_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMacdZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-macd-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineMacdZeroCrossLayout({ data });
    const b = computeLineMacdZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.macdPath).toBe(b.macdPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const data = mk(closes);
    const a = computeLineMacdZeroCrossLayout({ data });
    const b = computeLineMacdZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.macdPath).toBe(b.macdPath);
    expect(a.run.macdValues).toEqual(b.run.macdValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
