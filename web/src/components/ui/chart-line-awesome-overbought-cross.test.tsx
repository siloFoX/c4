import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineAwesomeOverboughtCross,
  DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_PADDING,
  DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_WIDTH,
  applyLineAwesomeOverboughtCrossSma,
  classifyLineAwesomeOverboughtCrossRegime,
  computeLineAwesomeOverboughtCross,
  computeLineAwesomeOverboughtCrossLayout,
  describeLineAwesomeOverboughtCrossChart,
  detectLineAwesomeOverboughtCrossCrosses,
  getLineAwesomeOverboughtCrossFinitePoints,
  normalizeLineAwesomeOverboughtCrossLength,
  normalizeLineAwesomeOverboughtCrossThreshold,
  runLineAwesomeOverboughtCross,
  type ChartLineAwesomeOverboughtCrossPoint,
} from './chart-line-awesome-overbought-cross';

const mk = (closes: number[]): ChartLineAwesomeOverboughtCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineAwesomeOverboughtCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineAwesomeOverboughtCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineAwesomeOverboughtCrossFinitePoints(null)).toEqual([]);
    expect(getLineAwesomeOverboughtCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineAwesomeOverboughtCrossFinitePoints(
        'oops' as unknown as ChartLineAwesomeOverboughtCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineAwesomeOverboughtCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineAwesomeOverboughtCrossLength(5, 5)).toBe(5);
    expect(normalizeLineAwesomeOverboughtCrossLength(1, 5)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineAwesomeOverboughtCrossLength(7.9, 5)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineAwesomeOverboughtCrossLength(0, 5)).toBe(5);
    expect(normalizeLineAwesomeOverboughtCrossLength(-1, 5)).toBe(5);
    expect(normalizeLineAwesomeOverboughtCrossLength(NaN, 5)).toBe(5);
  });
});

describe('normalizeLineAwesomeOverboughtCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineAwesomeOverboughtCrossThreshold(0.5, 0.5)).toBe(0.5);
    expect(normalizeLineAwesomeOverboughtCrossThreshold(0, 0.5)).toBe(0);
    expect(normalizeLineAwesomeOverboughtCrossThreshold(-1, 0.5)).toBe(-1);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineAwesomeOverboughtCrossThreshold(NaN, 0.5)).toBe(0.5);
    expect(normalizeLineAwesomeOverboughtCrossThreshold(Infinity, 0.5)).toBe(
      0.5,
    );
  });
});

describe('applyLineAwesomeOverboughtCrossSma', () => {
  it('CONST values -> SMA = value via CONST short-circuit', () => {
    const out = applyLineAwesomeOverboughtCrossSma(
      new Array(10).fill(42),
      5,
    );
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
    for (let i = 4; i < 10; i += 1) expect(out[i]).toBe(42);
  });

  it('CONST zero -> SMA = 0 exactly', () => {
    const out = applyLineAwesomeOverboughtCrossSma(new Array(10).fill(0), 5);
    for (let i = 4; i < 10; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });

  it('LINEAR ramp produces steady SMA with constant lag', () => {
    const values = Array.from({ length: 30 }, (_, i) => i);
    const out = applyLineAwesomeOverboughtCrossSma(values, 5);
    expect(out[4]).toBe(2);
    expect(out[20]).toBeCloseTo(18, 10);
  });
});

describe('computeLineAwesomeOverboughtCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> ao = 0 via SMA min === max short-circuit',
    (K) => {
      const data = mk(new Array(50).fill(K));
      const { ao } = computeLineAwesomeOverboughtCross(data, {
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

describe('computeLineAwesomeOverboughtCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> ao = 14.5 constant after warmup', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const { ao } = computeLineAwesomeOverboughtCross(data, {
      fastLength: 5,
      slowLength: 34,
    });
    for (let i = 33; i < 60; i += 1) {
      expect(ao[i]).toBeCloseTo(14.5, 8);
    }
  });

  it('LINEAR DOWN close=-i -> ao = -14.5 constant after warmup', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const { ao } = computeLineAwesomeOverboughtCross(data, {
      fastLength: 5,
      slowLength: 34,
    });
    for (let i = 33; i < 60; i += 1) {
      expect(ao[i]).toBeCloseTo(-14.5, 8);
    }
  });
});

describe('classifyLineAwesomeOverboughtCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAwesomeOverboughtCrossRegime(null, 0.5)).toBe('none');
  });

  it('ao at threshold boundary -> bullish', () => {
    expect(classifyLineAwesomeOverboughtCrossRegime(0.5, 0.5)).toBe('bullish');
    expect(classifyLineAwesomeOverboughtCrossRegime(14.5, 0.5)).toBe(
      'bullish',
    );
  });

  it('ao < threshold -> bearish (includes 0)', () => {
    expect(classifyLineAwesomeOverboughtCrossRegime(0.4, 0.5)).toBe('bearish');
    expect(classifyLineAwesomeOverboughtCrossRegime(0, 0.5)).toBe('bearish');
    expect(classifyLineAwesomeOverboughtCrossRegime(-1, 0.5)).toBe('bearish');
  });
});

describe('detectLineAwesomeOverboughtCrossCrosses', () => {
  it('fires bullish when ao crosses up through 0.5', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const ao = [0, 0.2, 0.4, 1, 2];
    const crosses = detectLineAwesomeOverboughtCrossCrosses(series, ao, 0.5);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when ao crosses down through 0.5', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const ao = [2, 1, 0.7, 0.2, 0];
    const crosses = detectLineAwesomeOverboughtCrossCrosses(series, ao, 0.5);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep through the threshold', () => {
    const series = mk([1, 2, 3, 4]);
    const ao = [0, 2, 1, 0];
    const crosses = detectLineAwesomeOverboughtCrossCrosses(series, ao, 0.5);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineAwesomeOverboughtCrossCrosses(series, [null, 0, 2], 0.5),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineAwesomeOverboughtCrossCrosses(series, [0, null, 2], 0.5),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineAwesomeOverboughtCrossCrosses(series, [0, 0.5], 0.5),
    ).toEqual([]);
  });

  it('no cross when ao stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineAwesomeOverboughtCrossCrosses(
        series,
        [0, 0.1, 0.2, 0.3],
        0.5,
      ),
    ).toEqual([]);
  });
});

describe('runLineAwesomeOverboughtCross', () => {
  it('CONST K -> 0 crosses, all bearish (ao=0 < 0.5)', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineAwesomeOverboughtCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(33);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(17);
    expect(run.fastLength).toBe(5);
    expect(run.slowLength).toBe(34);
    expect(run.threshold).toBe(0.5);
  });

  it('LINEAR UP -> all bullish (ao=14.5 >> 0.5), 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineAwesomeOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish (ao=-14.5), 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineAwesomeOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.bullishCount).toBe(0);
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineAwesomeOverboughtCross(data, { threshold: NaN });
    expect(run.threshold).toBe(0.5);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(50).fill(50));
    expect(
      runLineAwesomeOverboughtCross(data, { threshold: 1 }).threshold,
    ).toBe(1);
    expect(
      runLineAwesomeOverboughtCross(data, { threshold: 0.2 }).threshold,
    ).toBe(0.2);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineAwesomeOverboughtCross([]).ok).toBe(false);
    expect(runLineAwesomeOverboughtCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineAwesomeOverboughtCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineAwesomeOverboughtCross(data, {
      fastLength: 1,
      slowLength: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / ao / regime', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineAwesomeOverboughtCross(data);
    expect(run.samples).toHaveLength(50);
    for (let i = 0; i < 33; i += 1) {
      expect(run.samples[i]!.ao).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 33; i < 50; i += 1) {
      expect(run.samples[i]!.ao).toBe(0);
      expect(run.samples[i]!.regime).toBe('bearish');
    }
  });
});

describe('computeLineAwesomeOverboughtCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineAwesomeOverboughtCrossLayout({ data });
    expect(layout.width).toBe(
      DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_WIDTH,
    );
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_PANEL_GAP,
    );
  });

  it('CONST ao=0 -> oscMin expands to 0, oscMax = threshold + pad', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineAwesomeOverboughtCrossLayout({ data });
    // ao=0 everywhere, threshold=0.5: range expands up to threshold,
    // range = 0.5 -> 10% padding both sides.
    expect(layout.oscMin).toBeCloseTo(-0.05, 6);
    expect(layout.oscMax).toBeCloseTo(0.55, 6);
  });

  it('threshold band sits inside osc panel', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineAwesomeOverboughtCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineAwesomeOverboughtCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.aoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineAwesomeOverboughtCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('ao path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineAwesomeOverboughtCrossLayout({ data });
    expect(layout.aoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.aoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(50).fill(7));
    const layout = computeLineAwesomeOverboughtCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineAwesomeOverboughtCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineAwesomeOverboughtCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + upper band framing', () => {
    const data = mk(new Array(50).fill(50));
    const desc = describeLineAwesomeOverboughtCrossChart(data);
    expect(desc).toContain('Awesome Oscillator Overbought Cross chart');
    expect(desc).toContain('50 bars');
    expect(desc).toContain('fastLength 5');
    expect(desc).toContain('slowLength 34');
    expect(desc).toContain('threshold 0.5');
    expect(desc).toContain('momentum surge entry');
    expect(desc).toContain('configurable upper band');
  });
});

describe('ChartLineAwesomeOverboughtCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(50).fill(10));
    const { container, getByRole } = render(
      <ChartLineAwesomeOverboughtCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Awesome Oscillator Overbought Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-awesome-overbought-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Awesome Oscillator Overbought Cross chart',
    );
  });

  it('renders config badge', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-awesome-overbought-cross-badge"]',
    );
    expect(badge?.textContent).toContain('fast 5');
    expect(badge?.textContent).toContain('slow 34');
    expect(badge?.textContent).toContain('threshold 0.5');
  });

  it('renders legend toggles for price + ao', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('ao');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} />,
    );
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
      <ChartLineAwesomeOverboughtCross data={data} hiddenSeries={['ao']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-ao-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineAwesomeOverboughtCross data={data} hiddenSeries={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-ao-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(50).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineAwesomeOverboughtCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="ao"]')!);
    expect(events).toEqual([{ seriesId: 'ao', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} />,
    );
    const btn = container.querySelector(
      '[data-series-id="ao"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-awesome-overbought-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-awesome-overbought-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses=false hides cross markers group', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows group', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross
        data={data}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineAwesomeOverboughtCross data={data} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-awesome-overbought-cross"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('5');
    expect(region?.getAttribute('data-slow-length')).toBe('34');
    expect(region?.getAttribute('data-threshold')).toBe('0.5');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bearish-count')).toBe('17');
    expect(region?.getAttribute('data-bullish-count')).toBe('0');
  });

  it('defaults: fastLength=5, slowLength=34, threshold=0.5', () => {
    expect(DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_FAST_LENGTH).toBe(5);
    expect(DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_SLOW_LENGTH).toBe(34);
    expect(DEFAULT_CHART_LINE_AWESOME_OVERBOUGHT_CROSS_THRESHOLD).toBe(0.5);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(50).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineAwesomeOverboughtCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-awesome-overbought-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 50 bars', () => {
    const data = mk(new Array(50).fill(10));
    const a = computeLineAwesomeOverboughtCrossLayout({ data });
    const b = computeLineAwesomeOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.aoPath).toBe(b.aoPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for LINEAR UP pattern', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const a = computeLineAwesomeOverboughtCrossLayout({ data });
    const b = computeLineAwesomeOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.aoPath).toBe(b.aoPath);
    expect(a.run.aoValues).toEqual(b.run.aoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
