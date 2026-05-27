import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineTrixZeroCross,
  DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_WIDTH,
  applyLineTrixZeroCrossEma,
  classifyLineTrixZeroCrossRegime,
  computeLineTrixZeroCross,
  computeLineTrixZeroCrossLayout,
  describeLineTrixZeroCrossChart,
  detectLineTrixZeroCrossCrosses,
  getLineTrixZeroCrossFinitePoints,
  normalizeLineTrixZeroCrossLength,
  normalizeLineTrixZeroCrossThreshold,
  runLineTrixZeroCross,
  type ChartLineTrixZeroCrossPoint,
} from './chart-line-trix-zero-cross';

const mk = (closes: number[]): ChartLineTrixZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineTrixZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineTrixZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineTrixZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineTrixZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineTrixZeroCrossFinitePoints(
        'oops' as unknown as ChartLineTrixZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineTrixZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineTrixZeroCrossLength(15, 10)).toBe(15);
    expect(normalizeLineTrixZeroCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineTrixZeroCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineTrixZeroCrossLength(0, 10)).toBe(10);
    expect(normalizeLineTrixZeroCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineTrixZeroCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineTrixZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineTrixZeroCrossThreshold(0, -10)).toBe(0);
    expect(normalizeLineTrixZeroCrossThreshold(5, -10)).toBe(5);
    expect(normalizeLineTrixZeroCrossThreshold(-2, -10)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineTrixZeroCrossThreshold(NaN, -10)).toBe(-10);
    expect(normalizeLineTrixZeroCrossThreshold(Infinity, -10)).toBe(-10);
  });
});

describe('applyLineTrixZeroCrossEma', () => {
  it('CONST values short-circuit to exact value', () => {
    const out = applyLineTrixZeroCrossEma(new Array(20).fill(42), 5);
    expect(out.slice(0, 4)).toEqual([null, null, null, null]);
    for (let i = 4; i < 20; i += 1) {
      expect(out[i]).toBe(42);
    }
  });

  it('CONST zeros stay at +0', () => {
    const out = applyLineTrixZeroCrossEma(new Array(20).fill(0), 5);
    expect(Object.is(out[4], 0)).toBe(true);
  });

  it('returns all null when values shorter than length', () => {
    expect(applyLineTrixZeroCrossEma([1, 2, 3], 5)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('LINEAR ramp converges to steady-state lag', () => {
    const values = Array.from({ length: 50 }, (_, i) => i);
    const out = applyLineTrixZeroCrossEma(values, 15);
    // Lag = (15-1)/2 = 7 -> by 49 EMA ~= 49 - 7 = 42
    expect(out[49]).toBeGreaterThan(35);
    expect(out[49]).toBeLessThan(48);
  });
});

describe('computeLineTrixZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> trix = 0 from index 3*length-3 onward',
    (K) => {
      const data = mk(new Array(60).fill(K));
      const { trix } = computeLineTrixZeroCross(data, { length: 15 });
      // ema1 valid at 14, ema2 at 28, ema3 at 42, trix at 43
      for (let i = 43; i < 60; i += 1) {
        expect(trix[i]).toBe(0);
        expect(Object.is(trix[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineTrixZeroCross - LINEAR ramps', () => {
  it('LINEAR UP -> trix is positive (close is rising)', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i + 100));
    const { trix } = computeLineTrixZeroCross(data, { length: 15 });
    const last = trix[99];
    expect(last).not.toBeNull();
    expect(last).toBeGreaterThan(0);
  });

  it('LINEAR DOWN -> trix is negative (close is falling)', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => 200 - i));
    const { trix } = computeLineTrixZeroCross(data, { length: 15 });
    const last = trix[99];
    expect(last).not.toBeNull();
    expect(last).toBeLessThan(0);
  });
});

describe('classifyLineTrixZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineTrixZeroCrossRegime(null, 0)).toBe('none');
  });

  it('trix at threshold boundary -> bullish', () => {
    expect(classifyLineTrixZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineTrixZeroCrossRegime(0.5, 0)).toBe('bullish');
  });

  it('trix < threshold -> bearish', () => {
    expect(classifyLineTrixZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineTrixZeroCrossRegime(-1, 0)).toBe('bearish');
  });

  it('respects custom threshold', () => {
    expect(classifyLineTrixZeroCrossRegime(0.5, 0.5)).toBe('bullish');
    expect(classifyLineTrixZeroCrossRegime(0.4, 0.5)).toBe('bearish');
  });
});

describe('detectLineTrixZeroCrossCrosses', () => {
  it('fires bullish when trix crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const trix = [-0.5, -0.3, -0.1, 0.2, 0.5];
    const crosses = detectLineTrixZeroCrossCrosses(series, trix, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when trix crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const trix = [0.5, 0.3, 0.1, -0.2, -0.5];
    const crosses = detectLineTrixZeroCrossCrosses(series, trix, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when trix sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const trix = [-0.5, 0.5, 0.2, -0.5];
    const crosses = detectLineTrixZeroCrossCrosses(series, trix, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineTrixZeroCrossCrosses(series, [null, -0.5, 0.5], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineTrixZeroCrossCrosses(series, [-0.5, null, 0.5], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineTrixZeroCrossCrosses(series, [-0.5, 0], 0)).toEqual([]);
  });

  it('no cross when trix stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineTrixZeroCrossCrosses(series, [-0.5, -0.4, -0.3, -0.2], 0),
    ).toEqual([]);
  });
});

describe('runLineTrixZeroCross', () => {
  it('CONST K -> 0 crosses, bullish at boundary after warmup', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineTrixZeroCross(data, { length: 15 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    // ema3 valid from index 42, trix from 43
    expect(run.noneCount).toBe(43);
    expect(run.bullishCount).toBe(17);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i + 100));
    const run = runLineTrixZeroCross(data, { length: 15 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => 200 - i));
    const run = runLineTrixZeroCross(data, { length: 15 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.bullishCount).toBe(0);
  });

  it('decline + rise generates a bullish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const run = runLineTrixZeroCross(mk(closes), { length: 15 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise + decline generates a bearish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => i + 100),
      ...Array.from({ length: 60 }, (_, i) => 159 - i * 2),
    ];
    const run = runLineTrixZeroCross(mk(closes), { length: 15 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(60).fill(10));
    const run = runLineTrixZeroCross(data, {
      length: 15,
      threshold: NaN,
    });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive threshold', () => {
    const data = mk(new Array(60).fill(10));
    const run = runLineTrixZeroCross(data, {
      length: 15,
      threshold: 0.5,
    });
    expect(run.threshold).toBe(0.5);
  });

  it('respects custom negative threshold', () => {
    const data = mk(new Array(60).fill(10));
    const run = runLineTrixZeroCross(data, {
      length: 15,
      threshold: -0.3,
    });
    expect(run.threshold).toBe(-0.3);
  });

  it('empty data -> ok=false', () => {
    const run = runLineTrixZeroCross([], { length: 15 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineTrixZeroCross(mk([1, 2, 3]), { length: 15 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineTrixZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineTrixZeroCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / trix / regime', () => {
    const data = mk(new Array(60).fill(10));
    const run = runLineTrixZeroCross(data, { length: 15 });
    expect(run.samples).toHaveLength(60);
    for (let i = 0; i < 43; i += 1) {
      expect(run.samples[i]!.trix).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 43; i < 60; i += 1) {
      expect(run.samples[i]!.trix).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineTrixZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineTrixZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_PANEL_GAP);
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i + 100));
    const layout = computeLineTrixZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineTrixZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.trixPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed trix values + padding', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i + 100));
    const layout = computeLineTrixZeroCrossLayout({ data });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThan(0);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineTrixZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('trix path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineTrixZeroCrossLayout({ data });
    expect(layout.trixPath.startsWith('M ')).toBe(true);
    const mCount = (layout.trixPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(60).fill(7));
    const layout = computeLineTrixZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const layout = computeLineTrixZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineTrixZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineTrixZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(60).fill(50));
    const desc = describeLineTrixZeroCrossChart(data);
    expect(desc).toContain('TRIX Zero Cross chart');
    expect(desc).toContain('60 bars');
    expect(desc).toContain('length 15');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineTrixZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(60).fill(10));
    const { container, getByRole } = render(
      <ChartLineTrixZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('TRIX Zero Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-trix-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('TRIX Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineTrixZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-trix-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 15');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + trix', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineTrixZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('trix');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineTrixZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="trix"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(60).fill(10));
    const { container, rerender } = render(
      <ChartLineTrixZeroCross data={data} hiddenSeries={['trix']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-trix-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineTrixZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-trix-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(60).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineTrixZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="trix"]')!);
    expect(events).toEqual([{ seriesId: 'trix', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineTrixZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="trix"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineTrixZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineTrixZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineTrixZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineTrixZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-trix-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-trix-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineTrixZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineTrixZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineTrixZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const { container } = render(<ChartLineTrixZeroCross data={mk(closes)} />);
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-trix-zero-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const { container } = render(
      <ChartLineTrixZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const { container } = render(
      <ChartLineTrixZeroCross data={mk(closes)} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineTrixZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-trix-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('15');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('17');
  });

  it('defaults: length=15, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_LENGTH).toBe(15);
    expect(DEFAULT_CHART_LINE_TRIX_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(60).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineTrixZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-trix-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 60 bars', () => {
    const data = mk(new Array(60).fill(10));
    const a = computeLineTrixZeroCrossLayout({ data });
    const b = computeLineTrixZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.trixPath).toBe(b.trixPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const data = mk(closes);
    const a = computeLineTrixZeroCrossLayout({ data });
    const b = computeLineTrixZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.trixPath).toBe(b.trixPath);
    expect(a.run.trixValues).toEqual(b.run.trixValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
