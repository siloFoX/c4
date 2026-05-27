import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineMfiOversoldCross,
  DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_LENGTH,
  DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PADDING,
  DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_WIDTH,
  classifyLineMfiOversoldCrossRegime,
  computeLineMfiOversoldCross,
  computeLineMfiOversoldCrossLayout,
  describeLineMfiOversoldCrossChart,
  detectLineMfiOversoldCrossCrosses,
  getLineMfiOversoldCrossFinitePoints,
  normalizeLineMfiOversoldCrossLength,
  normalizeLineMfiOversoldCrossThreshold,
  runLineMfiOversoldCross,
  type ChartLineMfiOversoldCrossPoint,
} from './chart-line-mfi-oversold-cross';

const mk = (closes: number[]): ChartLineMfiOversoldCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineMfiOversoldCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineMfiOversoldCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineMfiOversoldCrossFinitePoints(null)).toEqual([]);
    expect(getLineMfiOversoldCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineMfiOversoldCrossFinitePoints(
        'oops' as unknown as ChartLineMfiOversoldCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineMfiOversoldCrossPoint[];
    expect(getLineMfiOversoldCrossFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineMfiOversoldCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineMfiOversoldCrossLength(14, 10)).toBe(14);
    expect(normalizeLineMfiOversoldCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineMfiOversoldCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineMfiOversoldCrossLength(0, 10)).toBe(10);
    expect(normalizeLineMfiOversoldCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineMfiOversoldCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineMfiOversoldCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineMfiOversoldCrossThreshold', () => {
  it('keeps values within [0, 100]', () => {
    expect(normalizeLineMfiOversoldCrossThreshold(20, 30)).toBe(20);
    expect(normalizeLineMfiOversoldCrossThreshold(0, 30)).toBe(0);
    expect(normalizeLineMfiOversoldCrossThreshold(100, 30)).toBe(100);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineMfiOversoldCrossThreshold(-1, 30)).toBe(30);
    expect(normalizeLineMfiOversoldCrossThreshold(101, 30)).toBe(30);
    expect(normalizeLineMfiOversoldCrossThreshold(NaN, 30)).toBe(30);
  });
});

describe('computeLineMfiOversoldCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> mfi = 50 (zero-flow neutral) from index length onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { mfi } = computeLineMfiOversoldCross(data, { length: 14 });
      for (let i = 0; i < 14; i += 1) {
        expect(mfi[i]).toBeNull();
      }
      for (let i = 14; i < 30; i += 1) {
        expect(mfi[i]).toBe(50);
      }
    },
  );
});

describe('computeLineMfiOversoldCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> mfi = 100 constant (no negative flow)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { mfi } = computeLineMfiOversoldCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(mfi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i (length=14) -> mfi = 0 constant (no positive flow)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { mfi } = computeLineMfiOversoldCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(mfi[i]).toBe(0);
    }
  });
});

describe('computeLineMfiOversoldCross - balanced alternation', () => {
  it('alternating +1/-1 deltas -> mfi = 50', () => {
    const data = mk(
      Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
    );
    const { mfi } = computeLineMfiOversoldCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(mfi[i]).toBe(50);
    }
  });
});

describe('classifyLineMfiOversoldCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineMfiOversoldCrossRegime(null, 20)).toBe('none');
  });

  it('mfi > threshold -> neutral', () => {
    expect(classifyLineMfiOversoldCrossRegime(50, 20)).toBe('neutral');
    expect(classifyLineMfiOversoldCrossRegime(20.01, 20)).toBe('neutral');
    expect(classifyLineMfiOversoldCrossRegime(100, 20)).toBe('neutral');
  });

  it('mfi at threshold boundary -> oversold', () => {
    expect(classifyLineMfiOversoldCrossRegime(20, 20)).toBe('oversold');
    expect(classifyLineMfiOversoldCrossRegime(10, 20)).toBe('oversold');
    expect(classifyLineMfiOversoldCrossRegime(0, 20)).toBe('oversold');
  });
});

describe('detectLineMfiOversoldCrossCrosses', () => {
  it('fires bullish exit when mfi crosses up through 20', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const mfi = [50, 30, 21, 19, 30];
    const crosses = detectLineMfiOversoldCrossCrosses(series, mfi, 20);
    expect(crosses.map((c) => c.kind)).toEqual(['bearish', 'bullish']);
    expect(crosses[0]).toEqual({ index: 3, x: 3, kind: 'bearish' });
    expect(crosses[1]).toEqual({ index: 4, x: 4, kind: 'bullish' });
  });

  it('fires bearish entry when mfi crosses down through 20', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const mfi = [30, 30, 25, 15, 10];
    const crosses = detectLineMfiOversoldCrossCrosses(series, mfi, 20);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits entry then exit when mfi dives then recovers', () => {
    const series = mk([1, 2, 3, 4]);
    const mfi = [50, 10, 15, 30];
    const crosses = detectLineMfiOversoldCrossCrosses(series, mfi, 20);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bearish');
    expect(crosses[1]!.kind).toBe('bullish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineMfiOversoldCrossCrosses(series, [null, 30, 10], 20),
    ).toEqual([{ index: 2, x: 2, kind: 'bearish' }]);
    expect(
      detectLineMfiOversoldCrossCrosses(series, [50, null, 10], 20),
    ).toEqual([]);
  });

  it('boundary equality treated as not yet crossed (strict cur < T)', () => {
    const series = mk([1, 2]);
    expect(detectLineMfiOversoldCrossCrosses(series, [50, 20], 20)).toEqual(
      [],
    );
  });

  it('no cross when mfi stays inside band', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineMfiOversoldCrossCrosses(series, [50, 40, 30, 25], 20),
    ).toEqual([]);
  });
});

describe('runLineMfiOversoldCross', () => {
  it('CONST K -> 0 crosses, all neutral (after warmup) + initial nones', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineMfiOversoldCross(data, { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(14);
    expect(run.neutralCount).toBe(16);
    expect(run.oversoldCount).toBe(0);
  });

  it('LINEAR UP -> all neutral after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineMfiOversoldCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.neutralCount).toBe(16);
    expect(run.oversoldCount).toBe(0);
  });

  it('LINEAR DOWN -> all oversold after warmup (mfi = 0 <= 20), 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineMfiOversoldCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.oversoldCount).toBe(16);
    expect(run.neutralCount).toBe(0);
  });

  it('threshold normalization clamps out-of-range', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMfiOversoldCross(data, {
      length: 14,
      threshold: 200,
    });
    expect(run.threshold).toBe(20);
  });

  it('respects custom threshold within [0, 100]', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMfiOversoldCross(data, {
      length: 14,
      threshold: 30,
    });
    expect(run.threshold).toBe(30);
  });

  it('empty data -> ok=false', () => {
    const run = runLineMfiOversoldCross([], { length: 14 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineMfiOversoldCross(mk([1, 2, 3]), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineMfiOversoldCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineMfiOversoldCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / mfi / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMfiOversoldCross(data, { length: 14 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 14; i += 1) {
      expect(run.samples[i]!.mfi).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 14; i < 30; i += 1) {
      expect(run.samples[i]!.mfi).toBe(50);
      expect(run.samples[i]!.regime).toBe('neutral');
    }
  });

  it('hybrid alternating + downward-jump pattern generates bearish then bullish crosses', () => {
    // Phase 1: 15 alternating bars (mfi = 50, balanced)
    // Phase 2: one big downward jump (-90) followed by flat plateau
    // -> mfi crashes below 20 (bearish entry), then climbs back to 50
    //    once the -90 delta exits the rolling window (bullish exit)
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 100 : 101)),
      ...new Array(15).fill(10),
    ];
    const run = runLineMfiOversoldCross(mk(closes), { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThanOrEqual(2);
    expect(run.crosses[0]!.kind).toBe('bearish');
    expect(run.crosses[run.crosses.length - 1]!.kind).toBe('bullish');
  });
});

describe('computeLineMfiOversoldCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMfiOversoldCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_PANEL_GAP,
    );
    expect(layout.innerLeft).toBe(layout.padding);
    expect(layout.innerRight).toBe(layout.width - layout.padding);
  });

  it('SVG y-axis: midY (50) < thresholdY (20) -- lower value, larger y', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMfiOversoldCrossLayout({ data });
    expect(layout.midY).toBeLessThan(layout.thresholdY);
  });

  it('empty data -> ok=false but bands populated', () => {
    const layout = computeLineMfiOversoldCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.mfiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range fixed at 0..100', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMfiOversoldCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineMfiOversoldCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('mfi path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineMfiOversoldCrossLayout({ data, length: 14 });
    expect(layout.mfiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.mfiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price (priceMin === priceMax) by inflating range', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineMfiOversoldCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 100 : 101)),
      ...new Array(15).fill(10),
    ];
    const layout = computeLineMfiOversoldCrossLayout({
      data: mk(closes),
      length: 14,
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

describe('describeLineMfiOversoldCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineMfiOversoldCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineMfiOversoldCrossChart(data);
    expect(desc).toContain('MFI Oversold Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('threshold 20');
  });
});

describe('ChartLineMfiOversoldCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineMfiOversoldCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('MFI Oversold Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-mfi-oversold-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('MFI Oversold Cross chart');
  });

  it('renders config badge with thresholds', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOversoldCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-mfi-oversold-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold 20');
  });

  it('renders legend toggles for price + mfi', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOversoldCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('mfi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOversoldCross data={data} />);
    const mfiButton = container.querySelector('[data-series-id="mfi"]');
    expect(mfiButton?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(mfiButton!);
    expect(mfiButton?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(mfiButton!);
    expect(mfiButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineMfiOversoldCross data={data} hiddenSeries={['mfi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-mfi-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineMfiOversoldCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-mfi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineMfiOversoldCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="mfi"]')!);
    expect(events).toEqual([{ seriesId: 'mfi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOversoldCross data={data} />);
    const mfiButton = container.querySelector(
      '[data-series-id="mfi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(mfiButton, { key: 'Enter' });
    expect(mfiButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(mfiButton, { key: ' ' });
    expect(mfiButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineMfiOversoldCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMfiOversoldCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOversoldCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOversoldCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-mfi-oversold-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-mfi-oversold-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold + mid bands by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOversoldCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-band-threshold"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-band-mid"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMfiOversoldCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMfiOversoldCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after alternating + downward-jump', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 100 : 101)),
      ...new Array(15).fill(10),
    ];
    const { container } = render(
      <ChartLineMfiOversoldCross data={mk(closes)} length={14} />,
    );
    const bearishMarkers = container.querySelectorAll(
      '[data-section="chart-line-mfi-oversold-cross-cross-bearish"]',
    );
    expect(bearishMarkers.length).toBeGreaterThan(0);
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-mfi-oversold-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 100 : 101)),
      ...new Array(15).fill(10),
    ];
    const { container } = render(
      <ChartLineMfiOversoldCross
        data={mk(closes)}
        length={14}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 100 : 101)),
      ...new Array(15).fill(10),
    ];
    const { container } = render(
      <ChartLineMfiOversoldCross
        data={mk(closes)}
        length={14}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-oversold-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOversoldCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-mfi-oversold-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-threshold')).toBe('20');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-neutral-count')).toBe('16');
  });

  it('defaults: length=14, threshold=20', () => {
    expect(DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_MFI_OVERSOLD_CROSS_THRESHOLD).toBe(20);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMfiOversoldCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-mfi-oversold-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineMfiOversoldCrossLayout({ data });
    const b = computeLineMfiOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.mfiPath).toBe(b.mfiPath);
    expect(a.midY).toBe(b.midY);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for downward-jump pattern', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 100 : 101)),
      ...new Array(15).fill(10),
    ];
    const data = mk(closes);
    const a = computeLineMfiOversoldCrossLayout({ data, length: 14 });
    const b = computeLineMfiOversoldCrossLayout({ data, length: 14 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.mfiPath).toBe(b.mfiPath);
    expect(a.run.mfiValues).toEqual(b.run.mfiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
