import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStochMidCross,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_K_SMOOTHING,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_LENGTH,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_WIDTH,
  applyLineStochMidCrossSma,
  classifyLineStochMidCrossRegime,
  computeLineStochMidCross,
  computeLineStochMidCrossLayout,
  describeLineStochMidCrossChart,
  detectLineStochMidCrossCrosses,
  getLineStochMidCrossFinitePoints,
  normalizeLineStochMidCrossLength,
  normalizeLineStochMidCrossThreshold,
  runLineStochMidCross,
  type ChartLineStochMidCrossPoint,
} from './chart-line-stoch-mid-cross';

const mk = (closes: number[]): ChartLineStochMidCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineStochMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineStochMidCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineStochMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineStochMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineStochMidCrossFinitePoints(
        'oops' as unknown as ChartLineStochMidCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineStochMidCrossPoint[];
    expect(getLineStochMidCrossFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineStochMidCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineStochMidCrossLength(14, 10)).toBe(14);
    expect(normalizeLineStochMidCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineStochMidCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineStochMidCrossLength(0, 10)).toBe(10);
    expect(normalizeLineStochMidCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineStochMidCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineStochMidCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineStochMidCrossThreshold', () => {
  it('keeps values within [0, 100]', () => {
    expect(normalizeLineStochMidCrossThreshold(50, 70)).toBe(50);
    expect(normalizeLineStochMidCrossThreshold(0, 70)).toBe(0);
    expect(normalizeLineStochMidCrossThreshold(100, 70)).toBe(100);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineStochMidCrossThreshold(-1, 70)).toBe(70);
    expect(normalizeLineStochMidCrossThreshold(101, 70)).toBe(70);
    expect(normalizeLineStochMidCrossThreshold(NaN, 70)).toBe(70);
  });
});

describe('applyLineStochMidCrossSma', () => {
  it('CONST values short-circuit to exact value', () => {
    const values = new Array(10).fill(50);
    const out = applyLineStochMidCrossSma(values, 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out.slice(2)).toEqual([50, 50, 50, 50, 50, 50, 50, 50]);
  });

  it('CONST zeros stay at +0 not -0', () => {
    const out = applyLineStochMidCrossSma([0, 0, 0, 0, 0], 3);
    expect(Object.is(out[2], 0)).toBe(true);
    expect(Object.is(out[2], -0)).toBe(false);
  });

  it('length === 1 returns values verbatim', () => {
    expect(applyLineStochMidCrossSma([30, 40, 50], 1)).toEqual([30, 40, 50]);
  });

  it('null in window invalidates output', () => {
    const out = applyLineStochMidCrossSma([10, null, 30, 40, 50], 3);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(40);
  });

  it('empty input', () => {
    expect(applyLineStochMidCrossSma([], 3)).toEqual([]);
  });
});

describe('computeLineStochMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> k = 50 from index length-1+kSmoothing-1 onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { k } = computeLineStochMidCross(data, {
        length: 14,
        kSmoothing: 3,
      });
      for (let i = 0; i < 15; i += 1) {
        expect(k[i]).toBeNull();
      }
      for (let i = 15; i < 30; i += 1) {
        expect(k[i]).toBe(50);
      }
    },
  );
});

describe('computeLineStochMidCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> rawK=100 -> k=100 constant', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { k } = computeLineStochMidCross(data, {
      length: 14,
      kSmoothing: 3,
    });
    for (let i = 15; i < 30; i += 1) {
      expect(k[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i (length=14) -> rawK=0 -> k=0 constant', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { k } = computeLineStochMidCross(data, {
      length: 14,
      kSmoothing: 3,
    });
    for (let i = 15; i < 30; i += 1) {
      expect(k[i]).toBe(0);
    }
  });
});

describe('classifyLineStochMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStochMidCrossRegime(null, 50)).toBe('none');
  });

  it('k at threshold boundary -> bullish', () => {
    expect(classifyLineStochMidCrossRegime(50, 50)).toBe('bullish');
    expect(classifyLineStochMidCrossRegime(80, 50)).toBe('bullish');
    expect(classifyLineStochMidCrossRegime(100, 50)).toBe('bullish');
  });

  it('k < threshold -> bearish', () => {
    expect(classifyLineStochMidCrossRegime(49.99, 50)).toBe('bearish');
    expect(classifyLineStochMidCrossRegime(20, 50)).toBe('bearish');
    expect(classifyLineStochMidCrossRegime(0, 50)).toBe('bearish');
  });
});

describe('detectLineStochMidCrossCrosses', () => {
  it('fires bullish when k crosses up through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const kVals = [40, 45, 49, 55, 60];
    const crosses = detectLineStochMidCrossCrosses(series, kVals, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when k crosses down through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const kVals = [60, 60, 55, 45, 40];
    const crosses = detectLineStochMidCrossCrosses(series, kVals, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when k sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const kVals = [40, 60, 55, 40];
    const crosses = detectLineStochMidCrossCrosses(series, kVals, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineStochMidCrossCrosses(series, [null, 40, 60], 50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineStochMidCrossCrosses(series, [40, null, 60], 50),
    ).toEqual([]);
  });

  it('boundary equality treated as not yet crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineStochMidCrossCrosses(series, [40, 50], 50)).toEqual([]);
  });

  it('no cross when k stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineStochMidCrossCrosses(series, [40, 42, 45, 48], 50),
    ).toEqual([]);
  });
});

describe('runLineStochMidCross', () => {
  it('CONST K -> 0 crosses, all bullish (k=50, regime bullish at boundary)', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineStochMidCross(data, { length: 14, kSmoothing: 3 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(15);
    expect(run.bullishCount).toBe(15);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineStochMidCross(data, { length: 14, kSmoothing: 3 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(15);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineStochMidCross(data, { length: 14, kSmoothing: 3 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(15);
  });

  it('long flat then sustained rise generates a bullish midline cross', () => {
    // 30 bars flat at 0 -> k stays at 50 once warm
    // Then rise from 1, 2, 3, ... -> close moves into window high -> rawK=100
    // -> SMA-3 smooths and crosses 50 upward
    const closes = [
      ...new Array(30).fill(0),
      ...Array.from({ length: 20 }, (_, i) => i + 1),
    ];
    const run = runLineStochMidCross(mk(closes), {
      length: 14,
      kSmoothing: 3,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('long flat then sustained decline generates a bearish midline cross', () => {
    const closes = [
      ...new Array(30).fill(100),
      ...Array.from({ length: 20 }, (_, i) => 100 - (i + 1)),
    ];
    const run = runLineStochMidCross(mk(closes), {
      length: 14,
      kSmoothing: 3,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps out-of-range', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineStochMidCross(data, { length: 14, threshold: 200 });
    expect(run.threshold).toBe(50);
  });

  it('respects custom threshold within [0, 100]', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineStochMidCross(data, { length: 14, threshold: 60 });
    expect(run.threshold).toBe(60);
  });

  it('empty data -> ok=false', () => {
    const run = runLineStochMidCross([], { length: 14 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineStochMidCross(mk([1, 2, 3]), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStochMidCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStochMidCross(data, { length: 1, kSmoothing: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / k / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineStochMidCross(data, { length: 14, kSmoothing: 3 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 15; i += 1) {
      expect(run.samples[i]!.k).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 15; i < 30; i += 1) {
      expect(run.samples[i]!.k).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineStochMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineStochMidCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_STOCH_MID_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_STOCH_MID_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_STOCH_MID_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_STOCH_MID_CROSS_PANEL_GAP);
    expect(layout.innerLeft).toBe(layout.padding);
    expect(layout.innerRight).toBe(layout.width - layout.padding);
  });

  it('SVG y-axis: thresholdY at 50 coincides with midY (both at 50)', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineStochMidCrossLayout({ data });
    expect(layout.thresholdY).toBe(layout.midY);
  });

  it('empty data -> ok=false but bands populated', () => {
    const layout = computeLineStochMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.kPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range fixed at 0..100', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineStochMidCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineStochMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('k path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineStochMidCrossLayout({ data, length: 14 });
    expect(layout.kPath.startsWith('M ')).toBe(true);
    const mCount = (layout.kPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price (priceMin === priceMax) by inflating range', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineStochMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...new Array(30).fill(0),
      ...Array.from({ length: 20 }, (_, i) => i + 1),
    ];
    const layout = computeLineStochMidCrossLayout({
      data: mk(closes),
      length: 14,
      kSmoothing: 3,
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

describe('describeLineStochMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStochMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineStochMidCrossChart(data);
    expect(desc).toContain('Stochastic Midline Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('kSmoothing 3');
    expect(desc).toContain('threshold 50');
  });
});

describe('ChartLineStochMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineStochMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Stochastic Midline Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Stochastic Midline Cross chart');
  });

  it('renders config badge with thresholds', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineStochMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('k 3');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + k', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineStochMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('k');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineStochMidCross data={data} />);
    const kButton = container.querySelector('[data-series-id="k"]');
    expect(kButton?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(kButton!);
    expect(kButton?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(kButton!);
    expect(kButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineStochMidCross data={data} hiddenSeries={['k']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-k-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineStochMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-k-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStochMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="k"]')!);
    expect(events).toEqual([{ seriesId: 'k', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineStochMidCross data={data} />);
    const kButton = container.querySelector(
      '[data-series-id="k"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(kButton, { key: 'Enter' });
    expect(kButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(kButton, { key: ' ' });
    expect(kButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineStochMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineStochMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineStochMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineStochMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stoch-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-stoch-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineStochMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineStochMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineStochMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after flat + rise', () => {
    const closes = [
      ...new Array(30).fill(0),
      ...Array.from({ length: 20 }, (_, i) => i + 1),
    ];
    const { container } = render(
      <ChartLineStochMidCross
        data={mk(closes)}
        length={14}
        kSmoothing={3}
      />,
    );
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-stoch-mid-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...new Array(30).fill(0),
      ...Array.from({ length: 20 }, (_, i) => i + 1),
    ];
    const { container } = render(
      <ChartLineStochMidCross
        data={mk(closes)}
        length={14}
        kSmoothing={3}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...new Array(30).fill(0),
      ...Array.from({ length: 20 }, (_, i) => i + 1),
    ];
    const { container } = render(
      <ChartLineStochMidCross
        data={mk(closes)}
        length={14}
        kSmoothing={3}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineStochMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-stoch-mid-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-k-smoothing')).toBe('3');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('15');
  });

  it('defaults: length=14, kSmoothing=3, threshold=50', () => {
    expect(DEFAULT_CHART_LINE_STOCH_MID_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_STOCH_MID_CROSS_K_SMOOTHING).toBe(3);
    expect(DEFAULT_CHART_LINE_STOCH_MID_CROSS_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineStochMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stoch-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineStochMidCrossLayout({ data });
    const b = computeLineStochMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.kPath).toBe(b.kPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.midY).toBe(b.midY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for flat-then-rise pattern', () => {
    const closes = [
      ...new Array(30).fill(0),
      ...Array.from({ length: 20 }, (_, i) => i + 1),
    ];
    const data = mk(closes);
    const a = computeLineStochMidCrossLayout({
      data,
      length: 14,
      kSmoothing: 3,
    });
    const b = computeLineStochMidCrossLayout({
      data,
      length: 14,
      kSmoothing: 3,
    });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.kPath).toBe(b.kPath);
    expect(a.run.kValues).toEqual(b.run.kValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
