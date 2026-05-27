import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineFisherMidCross,
  DEFAULT_CHART_LINE_FISHER_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_FISHER_MID_CROSS_LENGTH,
  DEFAULT_CHART_LINE_FISHER_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_FISHER_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_FISHER_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_FISHER_MID_CROSS_WIDTH,
  applyLineFisherMidCrossNormalize,
  classifyLineFisherMidCrossRegime,
  computeLineFisherMidCross,
  computeLineFisherMidCrossLayout,
  describeLineFisherMidCrossChart,
  detectLineFisherMidCrossCrosses,
  getLineFisherMidCrossFinitePoints,
  normalizeLineFisherMidCrossLength,
  normalizeLineFisherMidCrossThreshold,
  runLineFisherMidCross,
  type ChartLineFisherMidCrossPoint,
} from './chart-line-fisher-mid-cross';

const mk = (closes: number[]): ChartLineFisherMidCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineFisherMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineFisherMidCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineFisherMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineFisherMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineFisherMidCrossFinitePoints(
        'oops' as unknown as ChartLineFisherMidCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineFisherMidCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineFisherMidCrossLength(10, 10)).toBe(10);
    expect(normalizeLineFisherMidCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineFisherMidCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineFisherMidCrossLength(0, 10)).toBe(10);
    expect(normalizeLineFisherMidCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineFisherMidCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineFisherMidCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineFisherMidCrossThreshold(0, 0)).toBe(0);
    expect(normalizeLineFisherMidCrossThreshold(2.5, 0)).toBe(2.5);
    expect(normalizeLineFisherMidCrossThreshold(-2.5, 0)).toBe(-2.5);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineFisherMidCrossThreshold(NaN, 0)).toBe(0);
    expect(normalizeLineFisherMidCrossThreshold(Infinity, 0)).toBe(0);
  });
});

describe('applyLineFisherMidCrossNormalize', () => {
  it('CONST closes -> x = 0 from warmup boundary onward', () => {
    const out = applyLineFisherMidCrossNormalize(new Array(20).fill(5), 10);
    for (let i = 0; i < 9; i += 1) {
      expect(out[i]).toBeNull();
    }
    for (let i = 9; i < 20; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('LINEAR UP converges towards the +clamp 0.999', () => {
    const closes = Array.from({ length: 40 }, (_, i) => i);
    const out = applyLineFisherMidCrossNormalize(closes, 10);
    expect(out[9]).not.toBeNull();
    expect(out[39]).toBeCloseTo(0.999, 3);
  });

  it('LINEAR DOWN converges towards the -clamp -0.999', () => {
    const closes = Array.from({ length: 40 }, (_, i) => -i);
    const out = applyLineFisherMidCrossNormalize(closes, 10);
    expect(out[39]).toBeCloseTo(-0.999, 3);
  });

  it('insufficient length -> all null', () => {
    expect(applyLineFisherMidCrossNormalize([1, 2], 10)).toEqual([
      null,
      null,
    ]);
  });
});

describe('computeLineFisherMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> fisher = 0 from index 9 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { fisher } = computeLineFisherMidCross(data, { length: 10 });
      for (let i = 0; i < 9; i += 1) {
        expect(fisher[i]).toBeNull();
      }
      for (let i = 9; i < 40; i += 1) {
        expect(fisher[i]).toBe(0);
        expect(Object.is(fisher[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineFisherMidCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> fisher reaches a steady positive state', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const { fisher } = computeLineFisherMidCross(data, { length: 10 });
    expect(fisher[59]).not.toBeNull();
    expect(fisher[59]! > 5).toBe(true);
  });

  it('LINEAR DOWN close=-i -> fisher reaches a steady negative state', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const { fisher } = computeLineFisherMidCross(data, { length: 10 });
    expect(fisher[59]).not.toBeNull();
    expect(fisher[59]! < -5).toBe(true);
  });

  it('warmup window (i < length - 1) is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { fisher } = computeLineFisherMidCross(data, { length: 10 });
    for (let i = 0; i < 9; i += 1) {
      expect(fisher[i]).toBeNull();
    }
  });

  it('exposes both x and fisher channels', () => {
    const data = mk(new Array(40).fill(50));
    const channels = computeLineFisherMidCross(data, { length: 10 });
    expect(channels.x).toHaveLength(40);
    expect(channels.fisher).toHaveLength(40);
    expect(channels.length).toBe(10);
  });
});

describe('classifyLineFisherMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineFisherMidCrossRegime(null, 0)).toBe('none');
  });

  it('fisher at threshold boundary -> bullish', () => {
    expect(classifyLineFisherMidCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineFisherMidCrossRegime(5, 0)).toBe('bullish');
    expect(classifyLineFisherMidCrossRegime(10, 0)).toBe('bullish');
  });

  it('fisher < threshold -> bearish', () => {
    expect(classifyLineFisherMidCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineFisherMidCrossRegime(-5, 0)).toBe('bearish');
  });
});

describe('detectLineFisherMidCrossCrosses', () => {
  it('fires bullish when fisher crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const fisher = [-3, -2, -1, 1, 2];
    const crosses = detectLineFisherMidCrossCrosses(series, fisher, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when fisher crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const fisher = [3, 2, 1, -1, -2];
    const crosses = detectLineFisherMidCrossCrosses(series, fisher, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep through the threshold', () => {
    const series = mk([1, 2, 3, 4]);
    const fisher = [-2, 2, 1, -2];
    const crosses = detectLineFisherMidCrossCrosses(series, fisher, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineFisherMidCrossCrosses(series, [null, -2, 2], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineFisherMidCrossCrosses(series, [-2, null, 2], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineFisherMidCrossCrosses(series, [-2, 0], 0)).toEqual([]);
  });

  it('no cross when fisher stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineFisherMidCrossCrosses(series, [-2, -1.5, -1, -0.5], 0),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineFisherMidCrossCrosses(series, [0, 0.5, 1.5], 1),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineFisherMidCross', () => {
  it('CONST K -> 0 crosses, all bullish (fisher=0 at boundary)', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineFisherMidCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(9);
    expect(run.bullishCount).toBe(31);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(10);
    expect(run.threshold).toBe(0);
  });

  it('LINEAR UP -> all bullish, 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineFisherMidCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(51);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineFisherMidCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(51);
  });

  it('decline + rise generates a bullish centerline cross', () => {
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 39 - i),
      ...Array.from({ length: 40 }, (_, i) => i),
    ];
    const run = runLineFisherMidCross(mk(closes));
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineFisherMidCross(data, { threshold: NaN });
    expect(run.threshold).toBe(0);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(runLineFisherMidCross(data, { threshold: 2.5 }).threshold).toBe(
      2.5,
    );
    expect(runLineFisherMidCross(data, { threshold: -2.5 }).threshold).toBe(
      -2.5,
    );
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineFisherMidCross([]).ok).toBe(false);
    expect(runLineFisherMidCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineFisherMidCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineFisherMidCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / fisher / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineFisherMidCross(data);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 9; i += 1) {
      expect(run.samples[i]!.fisher).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 9; i < 40; i += 1) {
      expect(run.samples[i]!.fisher).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineFisherMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineFisherMidCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_FISHER_MID_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_FISHER_MID_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_FISHER_MID_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_FISHER_MID_CROSS_PANEL_GAP,
    );
  });

  it('CONST fisher=0 collapses to (threshold +/- 1) fallback', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineFisherMidCrossLayout({ data });
    // fisher=0 everywhere; oscMin = oscMax = 0 -> fallback expands
    // by threshold +/- 1, with threshold=0 that means [-1, 1].
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('threshold band sits inside osc panel', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineFisherMidCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineFisherMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.fisherPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineFisherMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('fisher path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineFisherMidCrossLayout({ data });
    expect(layout.fisherPath.startsWith('M ')).toBe(true);
    const mCount = (layout.fisherPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineFisherMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 39 - i),
      ...Array.from({ length: 40 }, (_, i) => i),
    ];
    const layout = computeLineFisherMidCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineFisherMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineFisherMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + bias coloring claim', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineFisherMidCrossChart(data);
    expect(desc).toContain('Fisher Mid Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('length 10');
    expect(desc).toContain('threshold 0');
    expect(desc).toContain('bias coloring');
    expect(desc).toContain('centerline regime transition');
  });
});

describe('ChartLineFisherMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineFisherMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('Fisher Mid Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-fisher-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Fisher Mid Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineFisherMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-fisher-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 10');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + fisher', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineFisherMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('fisher');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineFisherMidCross data={data} />);
    const btn = container.querySelector('[data-series-id="fisher"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineFisherMidCross data={data} hiddenSeries={['fisher']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-fisher-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineFisherMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-fisher-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineFisherMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="fisher"]')!);
    expect(events).toEqual([{ seriesId: 'fisher', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineFisherMidCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="fisher"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineFisherMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineFisherMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineFisherMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineFisherMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-fisher-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-fisher-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineFisherMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineFisherMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineFisherMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 39 - i),
      ...Array.from({ length: 40 }, (_, i) => i),
    ];
    const { container } = render(<ChartLineFisherMidCross data={mk(closes)} />);
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-fisher-mid-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 39 - i),
      ...Array.from({ length: 40 }, (_, i) => i),
    ];
    const { container } = render(
      <ChartLineFisherMidCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 39 - i),
      ...Array.from({ length: 40 }, (_, i) => i),
    ];
    const { container } = render(
      <ChartLineFisherMidCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineFisherMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-fisher-mid-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('10');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('31');
  });

  it('defaults: length=10, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_FISHER_MID_CROSS_LENGTH).toBe(10);
    expect(DEFAULT_CHART_LINE_FISHER_MID_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineFisherMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-fisher-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineFisherMidCrossLayout({ data });
    const b = computeLineFisherMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.fisherPath).toBe(b.fisherPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 40 }, (_, i) => 39 - i),
      ...Array.from({ length: 40 }, (_, i) => i),
    ];
    const data = mk(closes);
    const a = computeLineFisherMidCrossLayout({ data });
    const b = computeLineFisherMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.fisherPath).toBe(b.fisherPath);
    expect(a.run.fisherValues).toEqual(b.run.fisherValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
