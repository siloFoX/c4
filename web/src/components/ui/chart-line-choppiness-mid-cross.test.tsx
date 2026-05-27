import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineChoppinessMidCross,
  DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_LENGTH,
  DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_WIDTH,
  classifyLineChoppinessMidCrossRegime,
  computeLineChoppinessMidCross,
  computeLineChoppinessMidCrossLayout,
  describeLineChoppinessMidCrossChart,
  detectLineChoppinessMidCrossCrosses,
  getLineChoppinessMidCrossFinitePoints,
  normalizeLineChoppinessMidCrossLength,
  normalizeLineChoppinessMidCrossThreshold,
  runLineChoppinessMidCross,
  type ChartLineChoppinessMidCrossPoint,
} from './chart-line-choppiness-mid-cross';

const mk = (closes: number[]): ChartLineChoppinessMidCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineChoppinessMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineChoppinessMidCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineChoppinessMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineChoppinessMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineChoppinessMidCrossFinitePoints(
        'oops' as unknown as ChartLineChoppinessMidCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineChoppinessMidCrossLength', () => {
  it('keeps finite integers >= 2', () => {
    expect(normalizeLineChoppinessMidCrossLength(14, 14)).toBe(14);
    expect(normalizeLineChoppinessMidCrossLength(2, 14)).toBe(2);
  });

  it('floors fractional values', () => {
    expect(normalizeLineChoppinessMidCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input (length < 2)', () => {
    expect(normalizeLineChoppinessMidCrossLength(1, 14)).toBe(14);
    expect(normalizeLineChoppinessMidCrossLength(0, 14)).toBe(14);
    expect(normalizeLineChoppinessMidCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineChoppinessMidCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineChoppinessMidCrossThreshold', () => {
  it('accepts finite values in [0, 100]', () => {
    expect(normalizeLineChoppinessMidCrossThreshold(50, 50)).toBe(50);
    expect(normalizeLineChoppinessMidCrossThreshold(0, 50)).toBe(0);
    expect(normalizeLineChoppinessMidCrossThreshold(100, 50)).toBe(100);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineChoppinessMidCrossThreshold(-1, 50)).toBe(50);
    expect(normalizeLineChoppinessMidCrossThreshold(101, 50)).toBe(50);
    expect(normalizeLineChoppinessMidCrossThreshold(NaN, 50)).toBe(50);
  });
});

describe('computeLineChoppinessMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> ci = 50 (zero-flow neutral fallback) from index 13 onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { ci } = computeLineChoppinessMidCross(data, { length: 14 });
      for (let i = 0; i < 13; i += 1) {
        expect(ci[i]).toBeNull();
      }
      for (let i = 13; i < 30; i += 1) {
        expect(ci[i]).toBe(50);
      }
    },
  );
});

describe('computeLineChoppinessMidCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> ci=0 at seed, ~2.81 thereafter', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { ci } = computeLineChoppinessMidCross(data, { length: 14 });
    // At i = 13 (first valid sample), the window includes tr[0]=0,
    // so sumTR = 13 and range = 13 -> ratio = 1 -> ci = 0.
    expect(ci[13]).toBe(0);
    expect(Object.is(ci[13], -0)).toBe(false);
    // From i = 14 onward, tr[0] drops out of the window, sumTR = 14
    // (14 ones), range still 13 -> ratio = 14/13, ci = 100 *
    // log10(14/13) / log10(14) ~ 2.808 -- still well below 50,
    // bullish (trending) regime.
    const expected = (100 * Math.log10(14 / 13)) / Math.log10(14);
    for (let i = 14; i < 30; i += 1) {
      expect(ci[i]).toBeCloseTo(expected, 10);
    }
    expect(expected).toBeLessThan(50);
  });

  it('LINEAR DOWN close=-i (length=14) -> same shape by symmetry', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { ci } = computeLineChoppinessMidCross(data, { length: 14 });
    expect(ci[13]).toBe(0);
    const expected = (100 * Math.log10(14 / 13)) / Math.log10(14);
    for (let i = 14; i < 30; i += 1) {
      expect(ci[i]).toBeCloseTo(expected, 10);
    }
  });

  it('ci[i < length - 1] is null', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { ci } = computeLineChoppinessMidCross(data, { length: 14 });
    for (let i = 0; i < 13; i += 1) {
      expect(ci[i]).toBeNull();
    }
  });

  it('custom length=5 narrows the warmup and changes the CI level', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { ci } = computeLineChoppinessMidCross(data, { length: 5 });
    for (let i = 0; i < 4; i += 1) expect(ci[i]).toBeNull();
    // Seed at i = 4 (window [0..4]): sumTR = 4, range = 4 -> ci = 0.
    expect(ci[4]).toBe(0);
    // Steady state from i = 5: sumTR = 5, range = 4 -> ci = 100 *
    // log10(5/4) / log10(5).
    const expected = (100 * Math.log10(5 / 4)) / Math.log10(5);
    for (let i = 5; i < 20; i += 1) {
      expect(ci[i]).toBeCloseTo(expected, 10);
    }
  });

  it('saw-tooth pattern -> ci = 100 (canonical "fully ranging")', () => {
    // Alternating bodies give tr[i] = 1 for every i >= 1.
    // For i >= length = 14: sumTR = 14, range = 1, ratio = 14,
    // log10(14)/log10(14) = 1 -> ci = 100.
    const closes = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? 10 : 11,
    );
    const { ci } = computeLineChoppinessMidCross(mk(closes), { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(ci[i]).toBeCloseTo(100, 6);
    }
    // ci = 100 sits well above 50 -- the saw-tooth is the
    // canonical "fully ranging" anchor.
  });
});

describe('classifyLineChoppinessMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineChoppinessMidCrossRegime(null, 50)).toBe('none');
  });

  it('ci < threshold -> bullish (trending side)', () => {
    expect(classifyLineChoppinessMidCrossRegime(0, 50)).toBe('bullish');
    expect(classifyLineChoppinessMidCrossRegime(49.99, 50)).toBe('bullish');
    expect(classifyLineChoppinessMidCrossRegime(2.8, 50)).toBe('bullish');
  });

  it('ci >= threshold -> bearish (ranging side, boundary lives here)', () => {
    expect(classifyLineChoppinessMidCrossRegime(50, 50)).toBe('bearish');
    expect(classifyLineChoppinessMidCrossRegime(75, 50)).toBe('bearish');
    expect(classifyLineChoppinessMidCrossRegime(100, 50)).toBe('bearish');
  });
});

describe('detectLineChoppinessMidCrossCrosses', () => {
  it('fires bullish (trending start) when CI crosses DOWN through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const ci = [70, 65, 55, 40, 30];
    const crosses = detectLineChoppinessMidCrossCrosses(series, ci, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish (ranging start) when CI crosses UP through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const ci = [30, 35, 45, 60, 70];
    const crosses = detectLineChoppinessMidCrossCrosses(series, ci, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bearish then bullish on a sweep up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const ci = [30, 70, 60, 40];
    const crosses = detectLineChoppinessMidCrossCrosses(series, ci, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bearish');
    expect(crosses[1]!.kind).toBe('bullish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineChoppinessMidCrossCrosses(series, [null, 60, 40], 50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineChoppinessMidCrossCrosses(series, [60, null, 40], 50),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur < T for bullish, > T for bearish)', () => {
    const series = mk([1, 2]);
    expect(detectLineChoppinessMidCrossCrosses(series, [60, 50], 50)).toEqual(
      [],
    );
    expect(detectLineChoppinessMidCrossCrosses(series, [40, 50], 50)).toEqual(
      [],
    );
  });

  it('no cross when CI stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineChoppinessMidCrossCrosses(series, [10, 20, 30, 40], 50),
    ).toEqual([]);
    expect(
      detectLineChoppinessMidCrossCrosses(series, [60, 70, 80, 90], 50),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineChoppinessMidCrossCrosses(series, [70, 60, 50], 55),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineChoppinessMidCross', () => {
  it('CONST K -> 0 crosses, all bearish (ci=50 sits on boundary, classifies bearish)', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineChoppinessMidCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(13);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(17);
    expect(run.length).toBe(14);
    expect(run.threshold).toBe(50);
  });

  it('LINEAR UP -> all bullish (ci ~2.8 < 50, trending), 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineChoppinessMidCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(17);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bullish (same trending CI)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineChoppinessMidCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(17);
    expect(run.bearishCount).toBe(0);
  });

  it('threshold normalization rejects out-of-range', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineChoppinessMidCross(data, { threshold: 200 });
    expect(run.threshold).toBe(50);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(30).fill(50));
    expect(
      runLineChoppinessMidCross(data, { threshold: 60 }).threshold,
    ).toBe(60);
    expect(
      runLineChoppinessMidCross(data, { threshold: 40 }).threshold,
    ).toBe(40);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineChoppinessMidCross([]).ok).toBe(false);
    expect(runLineChoppinessMidCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineChoppinessMidCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineChoppinessMidCross(data, { length: 2 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / ci / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineChoppinessMidCross(data);
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 13; i += 1) {
      expect(run.samples[i]!.ci).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 13; i < 30; i += 1) {
      expect(run.samples[i]!.ci).toBe(50);
      expect(run.samples[i]!.regime).toBe('bearish');
    }
  });
});

describe('computeLineChoppinessMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineChoppinessMidCrossLayout({ data });
    expect(layout.width).toBe(
      DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_WIDTH,
    );
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_PANEL_GAP,
    );
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineChoppinessMidCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY at panel midpoint when threshold=50', () => {
    const data = mk(new Array(30).fill(10));
    const layout = computeLineChoppinessMidCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    const expected = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.thresholdY).toBeCloseTo(expected, 5);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineChoppinessMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.ciPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineChoppinessMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('ci path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineChoppinessMidCrossLayout({ data });
    expect(layout.ciPath.startsWith('M ')).toBe(true);
    const mCount = (layout.ciPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineChoppinessMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineChoppinessMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineChoppinessMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + trending/ranging framing', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineChoppinessMidCrossChart(data);
    expect(desc).toContain('Choppiness Mid Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('threshold 50');
    expect(desc).toContain('trending versus ranging');
    expect(desc).toContain('regime baseline transition');
  });
});

describe('ChartLineChoppinessMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineChoppinessMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Choppiness Mid Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-choppiness-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Choppiness Mid Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineChoppinessMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-choppiness-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + ci', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineChoppinessMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('ci');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineChoppinessMidCross data={data} />);
    const btn = container.querySelector('[data-series-id="ci"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineChoppinessMidCross data={data} hiddenSeries={['ci']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-ci-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineChoppinessMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-ci-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineChoppinessMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="ci"]')!);
    expect(events).toEqual([{ seriesId: 'ci', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineChoppinessMidCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="ci"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineChoppinessMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineChoppinessMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineChoppinessMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineChoppinessMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-choppiness-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-choppiness-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineChoppinessMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineChoppinessMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineChoppinessMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses=false hides cross markers group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineChoppinessMidCross data={data} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineChoppinessMidCross data={data} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineChoppinessMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-choppiness-mid-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bearish-count')).toBe('17');
    expect(region?.getAttribute('data-bullish-count')).toBe('0');
  });

  it('defaults: length=14, threshold=50', () => {
    expect(DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_CHOPPINESS_MID_CROSS_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineChoppinessMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-choppiness-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineChoppinessMidCrossLayout({ data });
    const b = computeLineChoppinessMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.ciPath).toBe(b.ciPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for LINEAR UP', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const a = computeLineChoppinessMidCrossLayout({ data });
    const b = computeLineChoppinessMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.ciPath).toBe(b.ciPath);
    expect(a.run.ciValues).toEqual(b.run.ciValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
