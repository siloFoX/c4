import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineMfiOverboughtCross,
  DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_LENGTH,
  DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_PADDING,
  DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_WIDTH,
  classifyLineMfiOverboughtCrossRegime,
  computeLineMfiOverboughtCross,
  computeLineMfiOverboughtCrossLayout,
  describeLineMfiOverboughtCrossChart,
  detectLineMfiOverboughtCrossCrosses,
  getLineMfiOverboughtCrossFinitePoints,
  normalizeLineMfiOverboughtCrossLength,
  normalizeLineMfiOverboughtCrossThreshold,
  runLineMfiOverboughtCross,
  type ChartLineMfiOverboughtCrossPoint,
} from './chart-line-mfi-overbought-cross';

const mk = (closes: number[]): ChartLineMfiOverboughtCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineMfiOverboughtCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineMfiOverboughtCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineMfiOverboughtCrossFinitePoints(null)).toEqual([]);
    expect(getLineMfiOverboughtCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineMfiOverboughtCrossFinitePoints(
        'oops' as unknown as ChartLineMfiOverboughtCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineMfiOverboughtCrossPoint[];
    expect(getLineMfiOverboughtCrossFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineMfiOverboughtCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineMfiOverboughtCrossLength(14, 10)).toBe(14);
    expect(normalizeLineMfiOverboughtCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineMfiOverboughtCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineMfiOverboughtCrossLength(0, 10)).toBe(10);
    expect(normalizeLineMfiOverboughtCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineMfiOverboughtCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineMfiOverboughtCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineMfiOverboughtCrossThreshold', () => {
  it('keeps values within [0, 100]', () => {
    expect(normalizeLineMfiOverboughtCrossThreshold(80, 70)).toBe(80);
    expect(normalizeLineMfiOverboughtCrossThreshold(0, 70)).toBe(0);
    expect(normalizeLineMfiOverboughtCrossThreshold(100, 70)).toBe(100);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineMfiOverboughtCrossThreshold(-1, 70)).toBe(70);
    expect(normalizeLineMfiOverboughtCrossThreshold(101, 70)).toBe(70);
    expect(normalizeLineMfiOverboughtCrossThreshold(NaN, 70)).toBe(70);
  });
});

describe('computeLineMfiOverboughtCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> mfi = 50 (zero-flow neutral) from index length onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { mfi } = computeLineMfiOverboughtCross(data, { length: 14 });
      for (let i = 0; i < 14; i += 1) {
        expect(mfi[i]).toBeNull();
      }
      for (let i = 14; i < 30; i += 1) {
        expect(mfi[i]).toBe(50);
      }
    },
  );
});

describe('computeLineMfiOverboughtCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> mfi = 100 constant (no negative flow)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { mfi } = computeLineMfiOverboughtCross(data, { length: 14 });
    for (let i = 0; i < 14; i += 1) {
      expect(mfi[i]).toBeNull();
    }
    for (let i = 14; i < 30; i += 1) {
      expect(mfi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i (length=14) -> mfi = 0 constant (no positive flow)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { mfi } = computeLineMfiOverboughtCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(mfi[i]).toBe(0);
    }
  });
});

describe('computeLineMfiOverboughtCross - balanced alternation', () => {
  it('alternating +1/-1 deltas with equal magnitudes -> mfi = 50', () => {
    // close = [10, 11, 10, 11, ...]
    // deltas alternate +1, -1. posFlow = negFlow over any even-length window.
    const data = mk(
      Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
    );
    const { mfi } = computeLineMfiOverboughtCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(mfi[i]).toBe(50);
    }
  });
});

describe('classifyLineMfiOverboughtCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineMfiOverboughtCrossRegime(null, 80)).toBe('none');
  });

  it('mfi < threshold -> neutral', () => {
    expect(classifyLineMfiOverboughtCrossRegime(50, 80)).toBe('neutral');
    expect(classifyLineMfiOverboughtCrossRegime(79.99, 80)).toBe('neutral');
    expect(classifyLineMfiOverboughtCrossRegime(0, 80)).toBe('neutral');
  });

  it('mfi at threshold boundary -> overbought', () => {
    expect(classifyLineMfiOverboughtCrossRegime(80, 80)).toBe('overbought');
    expect(classifyLineMfiOverboughtCrossRegime(90, 80)).toBe('overbought');
    expect(classifyLineMfiOverboughtCrossRegime(100, 80)).toBe('overbought');
  });
});

describe('detectLineMfiOverboughtCrossCrosses', () => {
  it('fires bullish entry when mfi crosses up through 80', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const mfi = [50, 70, 79, 85, 90];
    const crosses = detectLineMfiOverboughtCrossCrosses(series, mfi, 80);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish exit when mfi crosses down through 80', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const mfi = [90, 90, 85, 70, 50];
    const crosses = detectLineMfiOverboughtCrossCrosses(series, mfi, 80);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits entry then exit when mfi pumps then falls', () => {
    const series = mk([1, 2, 3, 4]);
    const mfi = [50, 90, 85, 70];
    const crosses = detectLineMfiOverboughtCrossCrosses(series, mfi, 80);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineMfiOverboughtCrossCrosses(series, [null, 70, 90], 80),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineMfiOverboughtCrossCrosses(series, [50, null, 90], 80),
    ).toEqual([]);
  });

  it('boundary equality treated as not yet crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineMfiOverboughtCrossCrosses(series, [50, 80], 80)).toEqual(
      [],
    );
  });

  it('no cross when mfi stays inside band', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineMfiOverboughtCrossCrosses(series, [50, 70, 75, 79], 80),
    ).toEqual([]);
  });
});

describe('runLineMfiOverboughtCross', () => {
  it('CONST K -> 0 crosses, all neutral (after warmup) + initial nones', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineMfiOverboughtCross(data, { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(14);
    expect(run.neutralCount).toBe(16);
    expect(run.overboughtCount).toBe(0);
  });

  it('LINEAR UP -> all overbought after warmup, 0 crosses (mfi jumps null->100)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineMfiOverboughtCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.overboughtCount).toBe(16);
    expect(run.noneCount).toBe(14);
  });

  it('LINEAR DOWN -> all neutral after warmup (mfi = 0 < 80), 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineMfiOverboughtCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.neutralCount).toBe(16);
    expect(run.overboughtCount).toBe(0);
  });

  it('threshold normalization clamps out-of-range', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMfiOverboughtCross(data, {
      length: 14,
      threshold: 200,
    });
    expect(run.threshold).toBe(80);
  });

  it('respects custom threshold within [0, 100]', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMfiOverboughtCross(data, {
      length: 14,
      threshold: 70,
    });
    expect(run.threshold).toBe(70);
  });

  it('empty data -> ok=false', () => {
    const run = runLineMfiOverboughtCross([], { length: 14 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineMfiOverboughtCross(mk([1, 2, 3]), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineMfiOverboughtCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineMfiOverboughtCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / mfi / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMfiOverboughtCross(data, { length: 14 });
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

  it('hybrid alternating + jump pattern generates bullish then bearish crosses', () => {
    // Phase 1: 15 alternating bars (mfi = 50, balanced)
    // Phase 2: one big upward jump (+90) followed by flat plateau
    // -> mfi spikes above 80 (bullish entry), then falls back to 50
    //    once the +90 delta exits the rolling window (bearish exit)
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const run = runLineMfiOverboughtCross(mk(closes), { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThanOrEqual(2);
    expect(run.crosses[0]!.kind).toBe('bullish');
    expect(run.crosses[run.crosses.length - 1]!.kind).toBe('bearish');
  });
});

describe('computeLineMfiOverboughtCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMfiOverboughtCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_PANEL_GAP,
    );
    expect(layout.innerLeft).toBe(layout.padding);
    expect(layout.innerRight).toBe(layout.width - layout.padding);
  });

  it('SVG y-axis: thresholdY (80) < midY (50) -- higher value, smaller y', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMfiOverboughtCrossLayout({ data });
    expect(layout.thresholdY).toBeLessThan(layout.midY);
  });

  it('empty data -> ok=false but bands populated', () => {
    const layout = computeLineMfiOverboughtCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.mfiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range fixed at 0..100', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMfiOverboughtCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineMfiOverboughtCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('mfi path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineMfiOverboughtCrossLayout({ data, length: 14 });
    expect(layout.mfiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.mfiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price (priceMin === priceMax) by inflating range', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineMfiOverboughtCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const layout = computeLineMfiOverboughtCrossLayout({
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

describe('describeLineMfiOverboughtCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineMfiOverboughtCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineMfiOverboughtCrossChart(data);
    expect(desc).toContain('MFI Overbought Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('threshold 80');
  });
});

describe('ChartLineMfiOverboughtCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineMfiOverboughtCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('MFI Overbought Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-mfi-overbought-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('MFI Overbought Cross chart');
  });

  it('renders config badge with thresholds', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOverboughtCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-mfi-overbought-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold 80');
  });

  it('renders legend toggles for price + mfi', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOverboughtCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('mfi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOverboughtCross data={data} />);
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
      <ChartLineMfiOverboughtCross data={data} hiddenSeries={['mfi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-mfi-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineMfiOverboughtCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-mfi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineMfiOverboughtCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="mfi"]')!);
    expect(events).toEqual([{ seriesId: 'mfi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOverboughtCross data={data} />);
    const mfiButton = container.querySelector(
      '[data-series-id="mfi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(mfiButton, { key: 'Enter' });
    expect(mfiButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(mfiButton, { key: ' ' });
    expect(mfiButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineMfiOverboughtCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMfiOverboughtCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOverboughtCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOverboughtCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-mfi-overbought-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-mfi-overbought-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold + mid bands by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOverboughtCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-band-threshold"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-band-mid"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMfiOverboughtCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMfiOverboughtCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after sustained rally', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const { container } = render(
      <ChartLineMfiOverboughtCross data={mk(closes)} length={14} />,
    );
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-mfi-overbought-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
    const bullishOverlay = container.querySelectorAll(
      '[data-section="chart-line-mfi-overbought-cross-overlay-bullish"]',
    );
    expect(bullishOverlay.length).toBe(bullishMarkers.length);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const { container } = render(
      <ChartLineMfiOverboughtCross
        data={mk(closes)}
        length={14}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const { container } = render(
      <ChartLineMfiOverboughtCross
        data={mk(closes)}
        length={14}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiOverboughtCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-mfi-overbought-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-threshold')).toBe('80');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-neutral-count')).toBe('16');
  });

  it('defaults: length=14, threshold=80', () => {
    expect(DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_MFI_OVERBOUGHT_CROSS_THRESHOLD).toBe(80);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMfiOverboughtCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-mfi-overbought-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineMfiOverboughtCrossLayout({ data });
    const b = computeLineMfiOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.mfiPath).toBe(b.mfiPath);
    expect(a.midY).toBe(b.midY);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for sustained-rally pattern', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const data = mk(closes);
    const a = computeLineMfiOverboughtCrossLayout({ data, length: 14 });
    const b = computeLineMfiOverboughtCrossLayout({ data, length: 14 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.mfiPath).toBe(b.mfiPath);
    expect(a.run.mfiValues).toEqual(b.run.mfiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
