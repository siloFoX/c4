import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineMomentumZeroCross,
  DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_WIDTH,
  classifyLineMomentumZeroCrossRegime,
  computeLineMomentumZeroCross,
  computeLineMomentumZeroCrossLayout,
  describeLineMomentumZeroCrossChart,
  detectLineMomentumZeroCrossCrosses,
  getLineMomentumZeroCrossFinitePoints,
  normalizeLineMomentumZeroCrossLength,
  normalizeLineMomentumZeroCrossThreshold,
  runLineMomentumZeroCross,
  type ChartLineMomentumZeroCrossPoint,
} from './chart-line-momentum-zero-cross';

const mk = (closes: number[]): ChartLineMomentumZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineMomentumZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineMomentumZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineMomentumZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineMomentumZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineMomentumZeroCrossFinitePoints(
        'oops' as unknown as ChartLineMomentumZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineMomentumZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineMomentumZeroCrossLength(10, 5)).toBe(10);
    expect(normalizeLineMomentumZeroCrossLength(1, 5)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineMomentumZeroCrossLength(7.9, 5)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineMomentumZeroCrossLength(0, 5)).toBe(5);
    expect(normalizeLineMomentumZeroCrossLength(-1, 5)).toBe(5);
    expect(normalizeLineMomentumZeroCrossLength(NaN, 5)).toBe(5);
  });
});

describe('normalizeLineMomentumZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineMomentumZeroCrossThreshold(0, -10)).toBe(0);
    expect(normalizeLineMomentumZeroCrossThreshold(5, -10)).toBe(5);
    expect(normalizeLineMomentumZeroCrossThreshold(-2, -10)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineMomentumZeroCrossThreshold(NaN, -10)).toBe(-10);
    expect(normalizeLineMomentumZeroCrossThreshold(Infinity, -10)).toBe(-10);
  });
});

describe('computeLineMomentumZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> momentum = 0 from index length onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { momentum } = computeLineMomentumZeroCross(data, { length: 10 });
      for (let i = 0; i < 10; i += 1) {
        expect(momentum[i]).toBeNull();
      }
      for (let i = 10; i < 30; i += 1) {
        expect(momentum[i]).toBe(0);
        expect(Object.is(momentum[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineMomentumZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=10) -> momentum = 10 constant', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { momentum } = computeLineMomentumZeroCross(data, { length: 10 });
    for (let i = 10; i < 30; i += 1) {
      expect(momentum[i]).toBe(10);
    }
  });

  it('LINEAR DOWN close=-i (length=10) -> momentum = -10 constant', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { momentum } = computeLineMomentumZeroCross(data, { length: 10 });
    for (let i = 10; i < 30; i += 1) {
      expect(momentum[i]).toBe(-10);
    }
  });

  it('LINEAR UP with custom length=5 -> momentum = 5 constant', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { momentum } = computeLineMomentumZeroCross(data, { length: 5 });
    for (let i = 5; i < 20; i += 1) {
      expect(momentum[i]).toBe(5);
    }
  });
});

describe('classifyLineMomentumZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineMomentumZeroCrossRegime(null, 0)).toBe('none');
  });

  it('momentum at threshold boundary -> bullish', () => {
    expect(classifyLineMomentumZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineMomentumZeroCrossRegime(5, 0)).toBe('bullish');
  });

  it('momentum < threshold -> bearish', () => {
    expect(classifyLineMomentumZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineMomentumZeroCrossRegime(-5, 0)).toBe('bearish');
  });
});

describe('detectLineMomentumZeroCrossCrosses', () => {
  it('fires bullish when momentum crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const momentum = [-2, -1, -0.5, 0.5, 1];
    const crosses = detectLineMomentumZeroCrossCrosses(series, momentum, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when momentum crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const momentum = [2, 1, 0.5, -0.5, -1];
    const crosses = detectLineMomentumZeroCrossCrosses(series, momentum, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when momentum sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const momentum = [-1, 1, 0.5, -1];
    const crosses = detectLineMomentumZeroCrossCrosses(series, momentum, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineMomentumZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineMomentumZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineMomentumZeroCrossCrosses(series, [-1, 0], 0)).toEqual(
      [],
    );
  });

  it('no cross when momentum stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineMomentumZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLineMomentumZeroCross', () => {
  it('CONST K -> 0 crosses, bullish at boundary after warmup', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineMomentumZeroCross(data, { length: 10 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(10);
    expect(run.bullishCount).toBe(20);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineMomentumZeroCross(data, { length: 10 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(20);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineMomentumZeroCross(data, { length: 10 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(20);
  });

  it('decline + rise generates a bullish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const run = runLineMomentumZeroCross(mk(closes), { length: 10 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise + decline generates a bearish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 10 + i),
      ...Array.from({ length: 30 }, (_, i) => 39 - i * 2),
    ];
    const run = runLineMomentumZeroCross(mk(closes), { length: 10 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMomentumZeroCross(data, {
      length: 10,
      threshold: NaN,
    });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive / negative threshold', () => {
    const data = mk(new Array(30).fill(10));
    expect(
      runLineMomentumZeroCross(data, { length: 10, threshold: 5 }).threshold,
    ).toBe(5);
    expect(
      runLineMomentumZeroCross(data, { length: 10, threshold: -3 }).threshold,
    ).toBe(-3);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineMomentumZeroCross([], { length: 10 }).ok).toBe(false);
    expect(runLineMomentumZeroCross(mk([1, 2, 3]), { length: 10 }).ok).toBe(
      false,
    );
  });

  it('sorts by x', () => {
    const data: ChartLineMomentumZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineMomentumZeroCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / momentum / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMomentumZeroCross(data, { length: 10 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 10; i += 1) {
      expect(run.samples[i]!.momentum).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 10; i < 30; i += 1) {
      expect(run.samples[i]!.momentum).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineMomentumZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMomentumZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_PANEL_GAP,
    );
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i + 100));
    const layout = computeLineMomentumZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineMomentumZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.momentumPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed momentum values plus padding', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i + 100));
    const layout = computeLineMomentumZeroCrossLayout({ data });
    // momentum = 10 constant, padded oscMax should be > 10
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThan(10);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i + 1));
    const layout = computeLineMomentumZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('momentum path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i + 1));
    const layout = computeLineMomentumZeroCrossLayout({ data });
    expect(layout.momentumPath.startsWith('M ')).toBe(true);
    const mCount = (layout.momentumPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineMomentumZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const layout = computeLineMomentumZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineMomentumZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineMomentumZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineMomentumZeroCrossChart(data);
    expect(desc).toContain('Momentum Zero Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 10');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineMomentumZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineMomentumZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Momentum Zero Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-momentum-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Momentum Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMomentumZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-momentum-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 10');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + momentum', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMomentumZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('momentum');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMomentumZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="momentum"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineMomentumZeroCross data={data} hiddenSeries={['momentum']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-momentum-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineMomentumZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-momentum-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineMomentumZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="momentum"]')!);
    expect(events).toEqual([{ seriesId: 'momentum', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMomentumZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="momentum"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineMomentumZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMomentumZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMomentumZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMomentumZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-momentum-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-momentum-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMomentumZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMomentumZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMomentumZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const { container } = render(
      <ChartLineMomentumZeroCross data={mk(closes)} />,
    );
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-momentum-zero-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const { container } = render(
      <ChartLineMomentumZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const { container } = render(
      <ChartLineMomentumZeroCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMomentumZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-momentum-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('10');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('20');
  });

  it('defaults: length=10, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_LENGTH).toBe(10);
    expect(DEFAULT_CHART_LINE_MOMENTUM_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMomentumZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-momentum-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineMomentumZeroCrossLayout({ data });
    const b = computeLineMomentumZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.momentumPath).toBe(b.momentumPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 2),
    ];
    const data = mk(closes);
    const a = computeLineMomentumZeroCrossLayout({ data });
    const b = computeLineMomentumZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.momentumPath).toBe(b.momentumPath);
    expect(a.run.momentumValues).toEqual(b.run.momentumValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
