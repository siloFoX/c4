import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineMfiMidCross,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_LENGTH,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_WIDTH,
  classifyLineMfiMidCrossRegime,
  computeLineMfiMidCross,
  computeLineMfiMidCrossLayout,
  describeLineMfiMidCrossChart,
  detectLineMfiMidCrossCrosses,
  getLineMfiMidCrossFinitePoints,
  normalizeLineMfiMidCrossLength,
  normalizeLineMfiMidCrossThreshold,
  runLineMfiMidCross,
  type ChartLineMfiMidCrossPoint,
} from './chart-line-mfi-mid-cross';

const mk = (closes: number[]): ChartLineMfiMidCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineMfiMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineMfiMidCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineMfiMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineMfiMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineMfiMidCrossFinitePoints(
        'oops' as unknown as ChartLineMfiMidCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineMfiMidCrossPoint[];
    expect(getLineMfiMidCrossFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineMfiMidCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineMfiMidCrossLength(14, 10)).toBe(14);
    expect(normalizeLineMfiMidCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineMfiMidCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineMfiMidCrossLength(0, 10)).toBe(10);
    expect(normalizeLineMfiMidCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineMfiMidCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineMfiMidCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineMfiMidCrossThreshold', () => {
  it('keeps values within [0, 100]', () => {
    expect(normalizeLineMfiMidCrossThreshold(50, 70)).toBe(50);
    expect(normalizeLineMfiMidCrossThreshold(0, 70)).toBe(0);
    expect(normalizeLineMfiMidCrossThreshold(100, 70)).toBe(100);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineMfiMidCrossThreshold(-1, 70)).toBe(70);
    expect(normalizeLineMfiMidCrossThreshold(101, 70)).toBe(70);
    expect(normalizeLineMfiMidCrossThreshold(NaN, 70)).toBe(70);
  });
});

describe('computeLineMfiMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> mfi = 50 (zero-flow neutral) from index length onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { mfi } = computeLineMfiMidCross(data, { length: 14 });
      for (let i = 0; i < 14; i += 1) {
        expect(mfi[i]).toBeNull();
      }
      for (let i = 14; i < 30; i += 1) {
        expect(mfi[i]).toBe(50);
      }
    },
  );
});

describe('computeLineMfiMidCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> mfi = 100 constant (no negative flow)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { mfi } = computeLineMfiMidCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(mfi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i (length=14) -> mfi = 0 constant (no positive flow)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { mfi } = computeLineMfiMidCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(mfi[i]).toBe(0);
    }
  });
});

describe('computeLineMfiMidCross - balanced alternation', () => {
  it('alternating +1/-1 deltas -> mfi = 50 (posFlow = negFlow)', () => {
    const data = mk(
      Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
    );
    const { mfi } = computeLineMfiMidCross(data, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(mfi[i]).toBe(50);
    }
  });
});

describe('classifyLineMfiMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineMfiMidCrossRegime(null, 50)).toBe('none');
  });

  it('mfi at threshold boundary -> bullish', () => {
    expect(classifyLineMfiMidCrossRegime(50, 50)).toBe('bullish');
    expect(classifyLineMfiMidCrossRegime(80, 50)).toBe('bullish');
    expect(classifyLineMfiMidCrossRegime(100, 50)).toBe('bullish');
  });

  it('mfi < threshold -> bearish', () => {
    expect(classifyLineMfiMidCrossRegime(49.99, 50)).toBe('bearish');
    expect(classifyLineMfiMidCrossRegime(20, 50)).toBe('bearish');
    expect(classifyLineMfiMidCrossRegime(0, 50)).toBe('bearish');
  });
});

describe('detectLineMfiMidCrossCrosses', () => {
  it('fires bullish when mfi crosses up through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const mfi = [40, 45, 49, 55, 60];
    const crosses = detectLineMfiMidCrossCrosses(series, mfi, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when mfi crosses down through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const mfi = [60, 60, 55, 45, 40];
    const crosses = detectLineMfiMidCrossCrosses(series, mfi, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when mfi sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const mfi = [40, 60, 55, 40];
    const crosses = detectLineMfiMidCrossCrosses(series, mfi, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineMfiMidCrossCrosses(series, [null, 40, 60], 50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineMfiMidCrossCrosses(series, [40, null, 60], 50),
    ).toEqual([]);
  });

  it('boundary equality treated as not yet crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineMfiMidCrossCrosses(series, [40, 50], 50)).toEqual([]);
  });

  it('no cross when mfi stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineMfiMidCrossCrosses(series, [40, 42, 45, 48], 50),
    ).toEqual([]);
  });
});

describe('runLineMfiMidCross', () => {
  it('CONST K -> 0 crosses, all bullish (mfi=50, regime bullish at boundary)', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineMfiMidCross(data, { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(14);
    expect(run.bullishCount).toBe(16);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineMfiMidCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(16);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineMfiMidCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(16);
  });

  it('balanced alternation -> all bullish after warmup (mfi=50, regime bullish at boundary), 0 crosses', () => {
    const data = mk(
      Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
    );
    const run = runLineMfiMidCross(mk(data.map((p) => p.close)), {
      length: 14,
    });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(16);
  });

  it('alternation + upward jump generates bullish midline cross', () => {
    // 15 alternating bars at 10/11 -> mfi = 50 (boundary)
    // then big upward jump -> mfi spikes above 50 -> bullish cross
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const run = runLineMfiMidCross(mk(closes), { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('alternation + downward jump generates bearish midline cross', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 100 : 101)),
      ...new Array(15).fill(10),
    ];
    const run = runLineMfiMidCross(mk(closes), { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps out-of-range', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMfiMidCross(data, { length: 14, threshold: 200 });
    expect(run.threshold).toBe(50);
  });

  it('respects custom threshold within [0, 100]', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMfiMidCross(data, { length: 14, threshold: 60 });
    expect(run.threshold).toBe(60);
  });

  it('empty data -> ok=false', () => {
    const run = runLineMfiMidCross([], { length: 14 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineMfiMidCross(mk([1, 2, 3]), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineMfiMidCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineMfiMidCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / mfi / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineMfiMidCross(data, { length: 14 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 14; i += 1) {
      expect(run.samples[i]!.mfi).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 14; i < 30; i += 1) {
      expect(run.samples[i]!.mfi).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineMfiMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMfiMidCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_MFI_MID_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_MFI_MID_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_MFI_MID_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_MFI_MID_CROSS_PANEL_GAP);
    expect(layout.innerLeft).toBe(layout.padding);
    expect(layout.innerRight).toBe(layout.width - layout.padding);
  });

  it('SVG y-axis: thresholdY at 50 sits between oscTop and oscBottom', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMfiMidCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false but bands populated', () => {
    const layout = computeLineMfiMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.mfiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range fixed at 0..100', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineMfiMidCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineMfiMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('mfi path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineMfiMidCrossLayout({ data, length: 14 });
    expect(layout.mfiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.mfiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price (priceMin === priceMax) by inflating range', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineMfiMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const layout = computeLineMfiMidCrossLayout({
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

describe('describeLineMfiMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineMfiMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineMfiMidCrossChart(data);
    expect(desc).toContain('MFI Midline Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('threshold 50');
  });
});

describe('ChartLineMfiMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineMfiMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('MFI Midline Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-mfi-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('MFI Midline Cross chart');
  });

  it('renders config badge with thresholds', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-mfi-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + mfi', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('mfi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiMidCross data={data} />);
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
      <ChartLineMfiMidCross data={data} hiddenSeries={['mfi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-mfi-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineMfiMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-mfi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineMfiMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="mfi"]')!);
    expect(events).toEqual([{ seriesId: 'mfi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiMidCross data={data} />);
    const mfiButton = container.querySelector(
      '[data-series-id="mfi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(mfiButton, { key: 'Enter' });
    expect(mfiButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(mfiButton, { key: ' ' });
    expect(mfiButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineMfiMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMfiMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-mfi-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-mfi-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMfiMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineMfiMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after alternation + jump', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const { container } = render(
      <ChartLineMfiMidCross data={mk(closes)} length={14} />,
    );
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-mfi-mid-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const { container } = render(
      <ChartLineMfiMidCross
        data={mk(closes)}
        length={14}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const { container } = render(
      <ChartLineMfiMidCross
        data={mk(closes)}
        length={14}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineMfiMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-mfi-mid-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('16');
  });

  it('defaults: length=14, threshold=50', () => {
    expect(DEFAULT_CHART_LINE_MFI_MID_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_MFI_MID_CROSS_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMfiMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-mfi-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineMfiMidCrossLayout({ data });
    const b = computeLineMfiMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.mfiPath).toBe(b.mfiPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for alternation + jump pattern', () => {
    const closes = [
      ...Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
      ...new Array(15).fill(100),
    ];
    const data = mk(closes);
    const a = computeLineMfiMidCrossLayout({ data, length: 14 });
    const b = computeLineMfiMidCrossLayout({ data, length: 14 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.mfiPath).toBe(b.mfiPath);
    expect(a.run.mfiValues).toEqual(b.run.mfiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
