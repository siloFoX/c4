import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineDpoMidCross,
  DEFAULT_CHART_LINE_DPO_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_DPO_MID_CROSS_LENGTH,
  DEFAULT_CHART_LINE_DPO_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_DPO_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_DPO_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_DPO_MID_CROSS_WIDTH,
  applyLineDpoMidCrossSma,
  classifyLineDpoMidCrossRegime,
  computeLineDpoMidCross,
  computeLineDpoMidCrossLayout,
  describeLineDpoMidCrossChart,
  detectLineDpoMidCrossCrosses,
  getLineDpoMidCrossFinitePoints,
  normalizeLineDpoMidCrossLength,
  normalizeLineDpoMidCrossThreshold,
  runLineDpoMidCross,
  type ChartLineDpoMidCrossPoint,
} from './chart-line-dpo-mid-cross';

const mk = (closes: number[]): ChartLineDpoMidCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineDpoMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineDpoMidCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineDpoMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineDpoMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineDpoMidCrossFinitePoints(
        'oops' as unknown as ChartLineDpoMidCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineDpoMidCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineDpoMidCrossLength(20, 20)).toBe(20);
    expect(normalizeLineDpoMidCrossLength(1, 20)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineDpoMidCrossLength(7.9, 20)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineDpoMidCrossLength(0, 20)).toBe(20);
    expect(normalizeLineDpoMidCrossLength(-1, 20)).toBe(20);
    expect(normalizeLineDpoMidCrossLength(NaN, 20)).toBe(20);
  });
});

describe('normalizeLineDpoMidCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineDpoMidCrossThreshold(0, 0)).toBe(0);
    expect(normalizeLineDpoMidCrossThreshold(2.5, 0)).toBe(2.5);
    expect(normalizeLineDpoMidCrossThreshold(-2.5, 0)).toBe(-2.5);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineDpoMidCrossThreshold(NaN, 0)).toBe(0);
    expect(normalizeLineDpoMidCrossThreshold(Infinity, 0)).toBe(0);
  });
});

describe('applyLineDpoMidCrossSma', () => {
  it('CONST values -> SMA = value with CONST short-circuit', () => {
    const out = applyLineDpoMidCrossSma(new Array(10).fill(5), 5);
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
    for (let i = 4; i < 10; i += 1) expect(out[i]).toBe(5);
  });

  it('length=1 returns values verbatim', () => {
    expect(applyLineDpoMidCrossSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('null inside window -> null at that index', () => {
    const out = applyLineDpoMidCrossSma(
      [1, 2, null, 4, 5] as Array<number | null>,
      3,
    );
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
  });
});

describe('computeLineDpoMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> dpo = 0 from index shift onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { dpo, shift } = computeLineDpoMidCross(data, { length: 20 });
      expect(shift).toBe(11);
      for (let i = 0; i < 19; i += 1) {
        expect(dpo[i]).toBeNull();
      }
      for (let i = 19; i < 40; i += 1) {
        expect(dpo[i]).toBe(0);
        expect(Object.is(dpo[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineDpoMidCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=20) -> dpo = -1.5 (look-back inversion)', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const { dpo } = computeLineDpoMidCross(data, { length: 20 });
    for (let i = 19; i < 60; i += 1) {
      expect(dpo[i]).toBeCloseTo(-1.5, 10);
    }
  });

  it('LINEAR DOWN close=-i (length=20) -> dpo = +1.5', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const { dpo } = computeLineDpoMidCross(data, { length: 20 });
    for (let i = 19; i < 60; i += 1) {
      expect(dpo[i]).toBeCloseTo(1.5, 10);
    }
  });

  it('dpo[i < length-1] is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { dpo } = computeLineDpoMidCross(data, { length: 20 });
    for (let i = 0; i < 19; i += 1) {
      expect(dpo[i]).toBeNull();
    }
  });

  it('exposes shift = floor(length/2) + 1', () => {
    const data = mk(new Array(40).fill(50));
    const channels = computeLineDpoMidCross(data, { length: 14 });
    expect(channels.shift).toBe(8);
  });
});

describe('classifyLineDpoMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineDpoMidCrossRegime(null, 0)).toBe('none');
  });

  it('dpo at threshold boundary -> bullish', () => {
    expect(classifyLineDpoMidCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineDpoMidCrossRegime(5, 0)).toBe('bullish');
  });

  it('dpo < threshold -> bearish', () => {
    expect(classifyLineDpoMidCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineDpoMidCrossRegime(-5, 0)).toBe('bearish');
  });
});

describe('detectLineDpoMidCrossCrosses', () => {
  it('fires bullish when dpo crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const dpo = [-3, -2, -1, 1, 2];
    const crosses = detectLineDpoMidCrossCrosses(series, dpo, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when dpo crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const dpo = [3, 2, 1, -1, -2];
    const crosses = detectLineDpoMidCrossCrosses(series, dpo, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep through the threshold', () => {
    const series = mk([1, 2, 3, 4]);
    const dpo = [-2, 2, 1, -2];
    const crosses = detectLineDpoMidCrossCrosses(series, dpo, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineDpoMidCrossCrosses(series, [null, -2, 2], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineDpoMidCrossCrosses(series, [-2, null, 2], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineDpoMidCrossCrosses(series, [-2, 0], 0)).toEqual([]);
  });

  it('no cross when dpo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineDpoMidCrossCrosses(series, [-2, -1.5, -1, -0.5], 0),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineDpoMidCrossCrosses(series, [0, 0.5, 1.5], 1),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineDpoMidCross', () => {
  it('CONST K -> 0 crosses, all bullish (dpo=0 at boundary)', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineDpoMidCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.bullishCount).toBe(21);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(20);
    expect(run.shift).toBe(11);
    expect(run.threshold).toBe(0);
  });

  it('LINEAR UP -> all bearish (dpo=-1.5 due to look-back inversion)', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineDpoMidCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(41);
  });

  it('LINEAR DOWN -> all bullish (dpo=+1.5 inversion in reverse)', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineDpoMidCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(41);
    expect(run.bearishCount).toBe(0);
  });

  it('rise + decline generates a bullish midline cross (look-back inversion)', () => {
    // Under DPO's look-back inversion, a rise gives bearish dpo and a
    // decline gives bullish dpo, so a rise->decline trajectory crosses
    // up through 0 (bearish->bullish).
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const run = runLineDpoMidCross(mk(closes));
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineDpoMidCross(data, { threshold: NaN });
    expect(run.threshold).toBe(0);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(runLineDpoMidCross(data, { threshold: 1.5 }).threshold).toBe(1.5);
    expect(runLineDpoMidCross(data, { threshold: -1.5 }).threshold).toBe(
      -1.5,
    );
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineDpoMidCross([]).ok).toBe(false);
    expect(runLineDpoMidCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineDpoMidCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineDpoMidCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / dpo / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineDpoMidCross(data);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 19; i += 1) {
      expect(run.samples[i]!.dpo).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 19; i < 40; i += 1) {
      expect(run.samples[i]!.dpo).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineDpoMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineDpoMidCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_DPO_MID_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_DPO_MID_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_DPO_MID_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_DPO_MID_CROSS_PANEL_GAP);
  });

  it('CONST dpo=0 collapses to (-1, 1) range', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineDpoMidCrossLayout({ data });
    // dpo=0 everywhere; oscMin = oscMax = 0 -> threshold+/-1 fallback
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('threshold band sits inside osc panel', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineDpoMidCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineDpoMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.dpoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineDpoMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('dpo path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineDpoMidCrossLayout({ data });
    expect(layout.dpoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.dpoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineDpoMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const layout = computeLineDpoMidCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineDpoMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineDpoMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + bias coloring claim', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineDpoMidCrossChart(data);
    expect(desc).toContain('DPO Mid Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('threshold 0');
    expect(desc).toContain('bias coloring');
    expect(desc).toContain('centerline regime transition');
  });
});

describe('ChartLineDpoMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineDpoMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('DPO Mid Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-dpo-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('DPO Mid Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-dpo-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + dpo', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('dpo');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoMidCross data={data} />);
    const btn = container.querySelector('[data-series-id="dpo"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineDpoMidCross data={data} hiddenSeries={['dpo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-dpo-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineDpoMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-dpo-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineDpoMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="dpo"]')!);
    expect(events).toEqual([{ seriesId: 'dpo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoMidCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="dpo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineDpoMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineDpoMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-dpo-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-dpo-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineDpoMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineDpoMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(<ChartLineDpoMidCross data={mk(closes)} />);
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-dpo-mid-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineDpoMidCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineDpoMidCross data={mk(closes)} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineDpoMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-dpo-mid-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('20');
    expect(region?.getAttribute('data-shift')).toBe('11');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('21');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults: length=20, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_DPO_MID_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_DPO_MID_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineDpoMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-dpo-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineDpoMidCrossLayout({ data });
    const b = computeLineDpoMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const data = mk(closes);
    const a = computeLineDpoMidCrossLayout({ data });
    const b = computeLineDpoMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
    expect(a.run.dpoValues).toEqual(b.run.dpoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
