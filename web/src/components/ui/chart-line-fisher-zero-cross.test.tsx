import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineFisherZeroCross,
  DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_WIDTH,
  applyLineFisherZeroCrossNormalize,
  classifyLineFisherZeroCrossRegime,
  computeLineFisherZeroCross,
  computeLineFisherZeroCrossLayout,
  describeLineFisherZeroCrossChart,
  detectLineFisherZeroCrossCrosses,
  getLineFisherZeroCrossFinitePoints,
  normalizeLineFisherZeroCrossLength,
  normalizeLineFisherZeroCrossThreshold,
  runLineFisherZeroCross,
  type ChartLineFisherZeroCrossPoint,
} from './chart-line-fisher-zero-cross';

const mk = (closes: number[]): ChartLineFisherZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineFisherZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineFisherZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineFisherZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineFisherZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineFisherZeroCrossFinitePoints(
        'oops' as unknown as ChartLineFisherZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineFisherZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineFisherZeroCrossLength(10, 10)).toBe(10);
    expect(normalizeLineFisherZeroCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineFisherZeroCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineFisherZeroCrossLength(0, 10)).toBe(10);
    expect(normalizeLineFisherZeroCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineFisherZeroCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineFisherZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineFisherZeroCrossThreshold(0, -5)).toBe(0);
    expect(normalizeLineFisherZeroCrossThreshold(2, -5)).toBe(2);
    expect(normalizeLineFisherZeroCrossThreshold(-2, -5)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineFisherZeroCrossThreshold(NaN, -5)).toBe(-5);
    expect(normalizeLineFisherZeroCrossThreshold(Infinity, -5)).toBe(-5);
  });
});

describe('applyLineFisherZeroCrossNormalize', () => {
  it('CONST values -> x = 0 from index length-1 onward', () => {
    const xs = applyLineFisherZeroCrossNormalize(new Array(20).fill(42), 10);
    for (let i = 0; i < 9; i += 1) {
      expect(xs[i]).toBeNull();
    }
    for (let i = 9; i < 20; i += 1) {
      expect(xs[i]).toBe(0);
    }
  });

  it('LINEAR UP -> x approaches +0.999 clamp', () => {
    const xs = applyLineFisherZeroCrossNormalize(
      Array.from({ length: 40 }, (_, i) => i),
      10,
    );
    for (let i = 9; i < 40; i += 1) {
      expect(xs[i]).toBeGreaterThan(0);
    }
    expect(xs[39]).toBeLessThanOrEqual(0.999);
    expect(xs[39]).toBeGreaterThan(0.9);
  });

  it('LINEAR DOWN -> x approaches -0.999 clamp', () => {
    const xs = applyLineFisherZeroCrossNormalize(
      Array.from({ length: 40 }, (_, i) => -i),
      10,
    );
    for (let i = 9; i < 40; i += 1) {
      expect(xs[i]).toBeLessThan(0);
    }
    expect(xs[39]).toBeGreaterThanOrEqual(-0.999);
    expect(xs[39]).toBeLessThan(-0.9);
  });

  it('length === 1 short-circuits with raw = 0 every bar', () => {
    const xs = applyLineFisherZeroCrossNormalize([1, 2, 3], 1);
    for (let i = 0; i < 3; i += 1) {
      expect(xs[i]).toBe(0);
    }
  });
});

describe('computeLineFisherZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> fisher = 0 from index length-1 onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { fisher } = computeLineFisherZeroCross(data, { length: 10 });
      for (let i = 0; i < 9; i += 1) {
        expect(fisher[i]).toBeNull();
      }
      for (let i = 9; i < 30; i += 1) {
        expect(fisher[i]).toBe(0);
      }
    },
  );
});

describe('computeLineFisherZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> fisher > 0 after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { fisher } = computeLineFisherZeroCross(data, { length: 10 });
    for (let i = 9; i < 40; i += 1) {
      expect(fisher[i]).not.toBeNull();
      expect(fisher[i]!).toBeGreaterThan(0);
    }
  });

  it('LINEAR DOWN close=-i -> fisher < 0 after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { fisher } = computeLineFisherZeroCross(data, { length: 10 });
    for (let i = 9; i < 40; i += 1) {
      expect(fisher[i]).not.toBeNull();
      expect(fisher[i]!).toBeLessThan(0);
    }
  });

  it('LINEAR UP converges toward positive steady state ~7.6', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i));
    const { fisher } = computeLineFisherZeroCross(data, { length: 10 });
    expect(fisher[99]).toBeGreaterThan(5);
    expect(fisher[99]).toBeLessThan(10);
  });

  it('LINEAR DOWN converges toward negative steady state ~-7.6', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => -i));
    const { fisher } = computeLineFisherZeroCross(data, { length: 10 });
    expect(fisher[99]).toBeLessThan(-5);
    expect(fisher[99]).toBeGreaterThan(-10);
  });

  it('fisher[i < length-1] is null', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { fisher } = computeLineFisherZeroCross(data, { length: 10 });
    for (let i = 0; i < 9; i += 1) {
      expect(fisher[i]).toBeNull();
    }
  });

  it('custom length=5 works', () => {
    const data = mk(new Array(20).fill(50));
    const { fisher } = computeLineFisherZeroCross(data, { length: 5 });
    for (let i = 0; i < 4; i += 1) {
      expect(fisher[i]).toBeNull();
    }
    for (let i = 4; i < 20; i += 1) {
      expect(fisher[i]).toBe(0);
    }
  });
});

describe('classifyLineFisherZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineFisherZeroCrossRegime(null, 0)).toBe('none');
  });

  it('fisher at threshold boundary -> bullish', () => {
    expect(classifyLineFisherZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineFisherZeroCrossRegime(5, 0)).toBe('bullish');
  });

  it('fisher < threshold -> bearish', () => {
    expect(classifyLineFisherZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineFisherZeroCrossRegime(-5, 0)).toBe('bearish');
  });
});

describe('detectLineFisherZeroCrossCrosses', () => {
  it('fires bullish when fisher crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const fisher = [-2, -1, -0.5, 0.5, 1];
    const crosses = detectLineFisherZeroCrossCrosses(series, fisher, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when fisher crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const fisher = [2, 1, 0.5, -0.5, -1];
    const crosses = detectLineFisherZeroCrossCrosses(series, fisher, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const fisher = [-1, 1, 0.5, -1];
    const crosses = detectLineFisherZeroCrossCrosses(series, fisher, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineFisherZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineFisherZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineFisherZeroCrossCrosses(series, [-1, 0], 0)).toEqual([]);
  });

  it('no cross when fisher stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineFisherZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLineFisherZeroCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineFisherZeroCross(data, { length: 10 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(9);
    expect(run.bullishCount).toBe(21);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(10);
  });

  it('LINEAR UP -> all bullish after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineFisherZeroCross(data, { length: 10 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(31);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineFisherZeroCross(data, { length: 10 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(31);
  });

  it('decline then rise generates bullish cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const run = runLineFisherZeroCross(mk(closes), { length: 10 });
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
    const run = runLineFisherZeroCross(mk(closes), { length: 10 });
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineFisherZeroCross(data, {
      length: 10,
      threshold: NaN,
    });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive / negative threshold', () => {
    const data = mk(new Array(30).fill(10));
    expect(
      runLineFisherZeroCross(data, { length: 10, threshold: 2 }).threshold,
    ).toBe(2);
    expect(
      runLineFisherZeroCross(data, { length: 10, threshold: -3 }).threshold,
    ).toBe(-3);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineFisherZeroCross([], { length: 10 }).ok).toBe(false);
    expect(runLineFisherZeroCross(mk([1, 2, 3]), { length: 10 }).ok).toBe(
      false,
    );
  });

  it('sorts by x', () => {
    const data: ChartLineFisherZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineFisherZeroCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / fisher / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineFisherZeroCross(data, { length: 10 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 9; i += 1) {
      expect(run.samples[i]!.fisher).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 9; i < 30; i += 1) {
      expect(run.samples[i]!.fisher).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineFisherZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineFisherZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_PANEL_GAP,
    );
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineFisherZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineFisherZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.fisherPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed fisher values', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineFisherZeroCrossLayout({ data });
    // LINEAR UP -> fisher positive, threshold = 0 -> oscMin <= 0
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThan(0);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineFisherZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('fisher path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineFisherZeroCrossLayout({ data });
    expect(layout.fisherPath.startsWith('M ')).toBe(true);
    const mCount = (layout.fisherPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineFisherZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const layout = computeLineFisherZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineFisherZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineFisherZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineFisherZeroCrossChart(data);
    expect(desc).toContain('Fisher Zero Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 10');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineFisherZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineFisherZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Fisher Zero Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-fisher-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Fisher Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineFisherZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-fisher-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 10');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + fisher', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineFisherZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('fisher');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineFisherZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="fisher"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineFisherZeroCross data={data} hiddenSeries={['fisher']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-fisher-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineFisherZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-fisher-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineFisherZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="fisher"]')!);
    expect(events).toEqual([{ seriesId: 'fisher', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineFisherZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="fisher"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineFisherZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineFisherZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineFisherZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineFisherZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-fisher-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-fisher-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineFisherZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineFisherZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineFisherZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(<ChartLineFisherZeroCross data={mk(closes)} />);
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-fisher-zero-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineFisherZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineFisherZeroCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineFisherZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-fisher-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('10');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('21');
  });

  it('defaults: length=10, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_LENGTH).toBe(10);
    expect(DEFAULT_CHART_LINE_FISHER_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineFisherZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-fisher-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineFisherZeroCrossLayout({ data });
    const b = computeLineFisherZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.fisherPath).toBe(b.fisherPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const data = mk(closes);
    const a = computeLineFisherZeroCrossLayout({ data });
    const b = computeLineFisherZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.fisherPath).toBe(b.fisherPath);
    expect(a.run.fisherValues).toEqual(b.run.fisherValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
