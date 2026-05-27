import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineAwesomeZeroCross,
  DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_WIDTH,
  applyLineAwesomeZeroCrossSma,
  classifyLineAwesomeZeroCrossRegime,
  computeLineAwesomeZeroCross,
  computeLineAwesomeZeroCrossLayout,
  describeLineAwesomeZeroCrossChart,
  detectLineAwesomeZeroCrossCrosses,
  getLineAwesomeZeroCrossFinitePoints,
  normalizeLineAwesomeZeroCrossLength,
  normalizeLineAwesomeZeroCrossThreshold,
  runLineAwesomeZeroCross,
  type ChartLineAwesomeZeroCrossPoint,
} from './chart-line-awesome-zero-cross';

const mk = (closes: number[]): ChartLineAwesomeZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineAwesomeZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineAwesomeZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineAwesomeZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineAwesomeZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineAwesomeZeroCrossFinitePoints(
        'oops' as unknown as ChartLineAwesomeZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineAwesomeZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineAwesomeZeroCrossLength(5, 10)).toBe(5);
    expect(normalizeLineAwesomeZeroCrossLength(34, 10)).toBe(34);
    expect(normalizeLineAwesomeZeroCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineAwesomeZeroCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineAwesomeZeroCrossLength(0, 10)).toBe(10);
    expect(normalizeLineAwesomeZeroCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineAwesomeZeroCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineAwesomeZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineAwesomeZeroCrossThreshold(0, -10)).toBe(0);
    expect(normalizeLineAwesomeZeroCrossThreshold(5, -10)).toBe(5);
    expect(normalizeLineAwesomeZeroCrossThreshold(-2, -10)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineAwesomeZeroCrossThreshold(NaN, -10)).toBe(-10);
    expect(normalizeLineAwesomeZeroCrossThreshold(Infinity, -10)).toBe(-10);
  });
});

describe('applyLineAwesomeZeroCrossSma', () => {
  it('CONST values short-circuit to exact value', () => {
    const out = applyLineAwesomeZeroCrossSma(new Array(10).fill(42), 5);
    expect(out.slice(0, 4)).toEqual([null, null, null, null]);
    for (let i = 4; i < 10; i += 1) {
      expect(out[i]).toBe(42);
    }
  });

  it('CONST zeros stay at +0', () => {
    const out = applyLineAwesomeZeroCrossSma(new Array(10).fill(0), 5);
    expect(Object.is(out[4], 0)).toBe(true);
  });

  it('length === 1 returns values verbatim', () => {
    expect(applyLineAwesomeZeroCrossSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('null in window invalidates output', () => {
    const out = applyLineAwesomeZeroCrossSma([1, null, 3, 4, 5], 3);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(4);
  });
});

describe('computeLineAwesomeZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> ao = 0 from index slowLength-1 onward',
    (K) => {
      const data = mk(new Array(50).fill(K));
      const { ao } = computeLineAwesomeZeroCross(data, {
        fastLength: 5,
        slowLength: 34,
      });
      for (let i = 0; i < 33; i += 1) {
        expect(ao[i]).toBeNull();
      }
      for (let i = 33; i < 50; i += 1) {
        expect(ao[i]).toBe(0);
        expect(Object.is(ao[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineAwesomeZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> ao = 14.5 constant (slowLag - fastLag = 16.5 - 2)', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const { ao } = computeLineAwesomeZeroCross(data, {
      fastLength: 5,
      slowLength: 34,
    });
    for (let i = 33; i < 60; i += 1) {
      expect(ao[i]).toBeCloseTo(14.5, 10);
    }
  });

  it('LINEAR DOWN close=-i -> ao = -14.5 constant', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const { ao } = computeLineAwesomeZeroCross(data, {
      fastLength: 5,
      slowLength: 34,
    });
    for (let i = 33; i < 60; i += 1) {
      expect(ao[i]).toBeCloseTo(-14.5, 10);
    }
  });
});

describe('classifyLineAwesomeZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAwesomeZeroCrossRegime(null, 0)).toBe('none');
  });

  it('ao at threshold boundary -> bullish', () => {
    expect(classifyLineAwesomeZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineAwesomeZeroCrossRegime(5, 0)).toBe('bullish');
  });

  it('ao < threshold -> bearish', () => {
    expect(classifyLineAwesomeZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineAwesomeZeroCrossRegime(-5, 0)).toBe('bearish');
  });
});

describe('detectLineAwesomeZeroCrossCrosses', () => {
  it('fires bullish when ao crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const ao = [-2, -1, -0.5, 0.5, 1];
    const crosses = detectLineAwesomeZeroCrossCrosses(series, ao, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when ao crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const ao = [2, 1, 0.5, -0.5, -1];
    const crosses = detectLineAwesomeZeroCrossCrosses(series, ao, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when ao sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const ao = [-1, 1, 0.5, -1];
    const crosses = detectLineAwesomeZeroCrossCrosses(series, ao, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineAwesomeZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineAwesomeZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineAwesomeZeroCrossCrosses(series, [-1, 0], 0)).toEqual([]);
  });

  it('no cross when ao stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineAwesomeZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLineAwesomeZeroCross', () => {
  it('CONST K -> 0 crosses, bullish at boundary after warmup', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineAwesomeZeroCross(data, {
      fastLength: 5,
      slowLength: 34,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(33);
    expect(run.bullishCount).toBe(17);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineAwesomeZeroCross(data, {
      fastLength: 5,
      slowLength: 34,
    });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineAwesomeZeroCross(data, {
      fastLength: 5,
      slowLength: 34,
    });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.bullishCount).toBe(0);
  });

  it('decline + rise generates a bullish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const run = runLineAwesomeZeroCross(mk(closes), {
      fastLength: 5,
      slowLength: 34,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise + decline generates a bearish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 10 + i),
      ...Array.from({ length: 60 }, (_, i) => 69 - i * 2),
    ];
    const run = runLineAwesomeZeroCross(mk(closes), {
      fastLength: 5,
      slowLength: 34,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(50).fill(10));
    const run = runLineAwesomeZeroCross(data, {
      fastLength: 5,
      slowLength: 34,
      threshold: NaN,
    });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive / negative threshold', () => {
    const data = mk(new Array(50).fill(10));
    expect(
      runLineAwesomeZeroCross(data, { fastLength: 5, threshold: 5 }).threshold,
    ).toBe(5);
    expect(
      runLineAwesomeZeroCross(data, { fastLength: 5, threshold: -3 }).threshold,
    ).toBe(-3);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineAwesomeZeroCross([], { fastLength: 5 }).ok).toBe(false);
    expect(
      runLineAwesomeZeroCross(mk([1, 2, 3]), { fastLength: 5 }).ok,
    ).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineAwesomeZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineAwesomeZeroCross(data, {
      fastLength: 1,
      slowLength: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / ao / regime', () => {
    const data = mk(new Array(50).fill(10));
    const run = runLineAwesomeZeroCross(data, {
      fastLength: 5,
      slowLength: 34,
    });
    expect(run.samples).toHaveLength(50);
    for (let i = 0; i < 33; i += 1) {
      expect(run.samples[i]!.ao).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 33; i < 50; i += 1) {
      expect(run.samples[i]!.ao).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineAwesomeZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineAwesomeZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_PANEL_GAP,
    );
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineAwesomeZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineAwesomeZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.aoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed ao values plus padding', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineAwesomeZeroCrossLayout({ data });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThan(14);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineAwesomeZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('ao path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineAwesomeZeroCrossLayout({ data });
    expect(layout.aoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.aoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(50).fill(7));
    const layout = computeLineAwesomeZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const layout = computeLineAwesomeZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineAwesomeZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineAwesomeZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(50).fill(50));
    const desc = describeLineAwesomeZeroCrossChart(data);
    expect(desc).toContain('Awesome Oscillator Zero Cross chart');
    expect(desc).toContain('50 bars');
    expect(desc).toContain('fastLength 5');
    expect(desc).toContain('slowLength 34');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineAwesomeZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(50).fill(10));
    const { container, getByRole } = render(
      <ChartLineAwesomeZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Awesome Oscillator Zero Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-awesome-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Awesome Oscillator Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineAwesomeZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-awesome-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('fast 5');
    expect(badge?.textContent).toContain('slow 34');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + ao', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineAwesomeZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('ao');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineAwesomeZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="ao"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineAwesomeZeroCross data={data} hiddenSeries={['ao']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-ao-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineAwesomeZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-ao-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(50).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineAwesomeZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="ao"]')!);
    expect(events).toEqual([{ seriesId: 'ao', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineAwesomeZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="ao"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineAwesomeZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineAwesomeZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineAwesomeZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-awesome-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-awesome-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineAwesomeZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const { container } = render(
      <ChartLineAwesomeZeroCross data={mk(closes)} />,
    );
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-awesome-zero-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const { container } = render(
      <ChartLineAwesomeZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const { container } = render(
      <ChartLineAwesomeZeroCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineAwesomeZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-awesome-zero-cross"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('5');
    expect(region?.getAttribute('data-slow-length')).toBe('34');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('17');
  });

  it('defaults: fastLength=5, slowLength=34, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_FAST_LENGTH).toBe(5);
    expect(DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_SLOW_LENGTH).toBe(34);
    expect(DEFAULT_CHART_LINE_AWESOME_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(50).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineAwesomeZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-awesome-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 50 bars', () => {
    const data = mk(new Array(50).fill(10));
    const a = computeLineAwesomeZeroCrossLayout({ data });
    const b = computeLineAwesomeZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.aoPath).toBe(b.aoPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 60 }, (_, i) => 100 - i),
      ...Array.from({ length: 60 }, (_, i) => 41 + i * 2),
    ];
    const data = mk(closes);
    const a = computeLineAwesomeZeroCrossLayout({ data });
    const b = computeLineAwesomeZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.aoPath).toBe(b.aoPath);
    expect(a.run.aoValues).toEqual(b.run.aoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
