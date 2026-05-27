import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineWilliamsRMidCross,
  DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_LENGTH,
  DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_WIDTH,
  classifyLineWilliamsRMidCrossRegime,
  computeLineWilliamsRMidCross,
  computeLineWilliamsRMidCrossLayout,
  describeLineWilliamsRMidCrossChart,
  detectLineWilliamsRMidCrossCrosses,
  getLineWilliamsRMidCrossFinitePoints,
  normalizeLineWilliamsRMidCrossLength,
  normalizeLineWilliamsRMidCrossThreshold,
  runLineWilliamsRMidCross,
  type ChartLineWilliamsRMidCrossPoint,
} from './chart-line-williams-r-mid-cross';

const mk = (closes: number[]): ChartLineWilliamsRMidCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineWilliamsRMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineWilliamsRMidCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineWilliamsRMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineWilliamsRMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineWilliamsRMidCrossFinitePoints(
        'oops' as unknown as ChartLineWilliamsRMidCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineWilliamsRMidCrossPoint[];
    expect(getLineWilliamsRMidCrossFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineWilliamsRMidCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineWilliamsRMidCrossLength(14, 10)).toBe(14);
    expect(normalizeLineWilliamsRMidCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineWilliamsRMidCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineWilliamsRMidCrossLength(0, 10)).toBe(10);
    expect(normalizeLineWilliamsRMidCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineWilliamsRMidCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineWilliamsRMidCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineWilliamsRMidCrossThreshold', () => {
  it('keeps values within [-100, 0]', () => {
    expect(normalizeLineWilliamsRMidCrossThreshold(-50, -30)).toBe(-50);
    expect(normalizeLineWilliamsRMidCrossThreshold(-100, -30)).toBe(-100);
    expect(normalizeLineWilliamsRMidCrossThreshold(0, -30)).toBe(0);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineWilliamsRMidCrossThreshold(1, -30)).toBe(-30);
    expect(normalizeLineWilliamsRMidCrossThreshold(-101, -30)).toBe(-30);
    expect(normalizeLineWilliamsRMidCrossThreshold(NaN, -30)).toBe(-30);
  });
});

describe('computeLineWilliamsRMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> wr = -50 (zero-range neutral) from index length-1 onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { wr } = computeLineWilliamsRMidCross(data, { length: 14 });
      for (let i = 0; i < 13; i += 1) {
        expect(wr[i]).toBeNull();
      }
      for (let i = 13; i < 30; i += 1) {
        expect(wr[i]).toBe(-50);
      }
    },
  );
});

describe('computeLineWilliamsRMidCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> wr = 0 constant (close at high)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { wr } = computeLineWilliamsRMidCross(data, { length: 14 });
    for (let i = 13; i < 30; i += 1) {
      expect(wr[i]).toBe(0);
    }
  });

  it('LINEAR DOWN close=-i (length=14) -> wr = -100 constant (close at low)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { wr } = computeLineWilliamsRMidCross(data, { length: 14 });
    for (let i = 13; i < 30; i += 1) {
      expect(wr[i]).toBe(-100);
    }
  });
});

describe('classifyLineWilliamsRMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineWilliamsRMidCrossRegime(null, -50)).toBe('none');
  });

  it('wr at threshold boundary -> bullish', () => {
    expect(classifyLineWilliamsRMidCrossRegime(-50, -50)).toBe('bullish');
    expect(classifyLineWilliamsRMidCrossRegime(-20, -50)).toBe('bullish');
    expect(classifyLineWilliamsRMidCrossRegime(0, -50)).toBe('bullish');
  });

  it('wr < threshold -> bearish', () => {
    expect(classifyLineWilliamsRMidCrossRegime(-50.01, -50)).toBe('bearish');
    expect(classifyLineWilliamsRMidCrossRegime(-80, -50)).toBe('bearish');
    expect(classifyLineWilliamsRMidCrossRegime(-100, -50)).toBe('bearish');
  });
});

describe('detectLineWilliamsRMidCrossCrosses', () => {
  it('fires bullish when wr crosses up through -50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const wr = [-80, -70, -55, -40, -20];
    const crosses = detectLineWilliamsRMidCrossCrosses(series, wr, -50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when wr crosses down through -50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const wr = [-20, -30, -45, -60, -80];
    const crosses = detectLineWilliamsRMidCrossCrosses(series, wr, -50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when wr sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const wr = [-60, -40, -45, -60];
    const crosses = detectLineWilliamsRMidCrossCrosses(series, wr, -50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineWilliamsRMidCrossCrosses(series, [null, -60, -40], -50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineWilliamsRMidCrossCrosses(series, [-60, null, -40], -50),
    ).toEqual([]);
  });

  it('boundary equality treated as not yet crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineWilliamsRMidCrossCrosses(series, [-60, -50], -50)).toEqual(
      [],
    );
  });

  it('no cross when wr stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineWilliamsRMidCrossCrosses(series, [-60, -55, -53, -51], -50),
    ).toEqual([]);
  });
});

describe('runLineWilliamsRMidCross', () => {
  it('CONST K -> 0 crosses, all bullish (wr=-50, regime bullish at boundary)', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineWilliamsRMidCross(data, { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(13);
    expect(run.bullishCount).toBe(17);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineWilliamsRMidCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(17);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineWilliamsRMidCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(17);
  });

  it('decline + recovery generates bullish midline cross', () => {
    // Decline 14 bars (wr at -100 sustained), then climb back generating cross up through -50
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      ...Array.from({ length: 20 }, (_, i) => 35 + i * 8),
    ];
    const run = runLineWilliamsRMidCross(mk(closes), { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise + sharp decline generates bearish midline cross', () => {
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 10 + i * 5),
      ...Array.from({ length: 20 }, (_, i) => 75 - i * 8),
    ];
    const run = runLineWilliamsRMidCross(mk(closes), { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps out-of-range', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineWilliamsRMidCross(data, {
      length: 14,
      threshold: 50,
    });
    expect(run.threshold).toBe(-50);
  });

  it('respects custom threshold within [-100, 0]', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineWilliamsRMidCross(data, {
      length: 14,
      threshold: -25,
    });
    expect(run.threshold).toBe(-25);
  });

  it('empty data -> ok=false', () => {
    const run = runLineWilliamsRMidCross([], { length: 14 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineWilliamsRMidCross(mk([1, 2, 3]), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineWilliamsRMidCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineWilliamsRMidCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / wr / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineWilliamsRMidCross(data, { length: 14 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 13; i += 1) {
      expect(run.samples[i]!.wr).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 13; i < 30; i += 1) {
      expect(run.samples[i]!.wr).toBe(-50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineWilliamsRMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineWilliamsRMidCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_PANEL_GAP,
    );
  });

  it('SVG y-axis: thresholdY at -50 sits between oscTop and oscBottom', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineWilliamsRMidCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineWilliamsRMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.wrPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range fixed at -100..0', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineWilliamsRMidCrossLayout({ data });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(0);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineWilliamsRMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('wr path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineWilliamsRMidCrossLayout({ data, length: 14 });
    expect(layout.wrPath.startsWith('M ')).toBe(true);
    const mCount = (layout.wrPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineWilliamsRMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      ...Array.from({ length: 20 }, (_, i) => 35 + i * 8),
    ];
    const layout = computeLineWilliamsRMidCrossLayout({
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

describe('describeLineWilliamsRMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineWilliamsRMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineWilliamsRMidCrossChart(data);
    expect(desc).toContain('Williams %R Midline Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('threshold -50');
  });
});

describe('ChartLineWilliamsRMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineWilliamsRMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Williams %R Midline Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-williams-r-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Williams %R Midline Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-williams-r-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('threshold -50');
  });

  it('renders legend toggles for price + wr', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('wr');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRMidCross data={data} />);
    const wrButton = container.querySelector('[data-series-id="wr"]');
    expect(wrButton?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(wrButton!);
    expect(wrButton?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(wrButton!);
    expect(wrButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineWilliamsRMidCross data={data} hiddenSeries={['wr']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-wr-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineWilliamsRMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-wr-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineWilliamsRMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="wr"]')!);
    expect(events).toEqual([{ seriesId: 'wr', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRMidCross data={data} />);
    const wrButton = container.querySelector(
      '[data-series-id="wr"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(wrButton, { key: 'Enter' });
    expect(wrButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(wrButton, { key: ' ' });
    expect(wrButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineWilliamsRMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineWilliamsRMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-williams-r-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-williams-r-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineWilliamsRMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineWilliamsRMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + recovery', () => {
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      ...Array.from({ length: 20 }, (_, i) => 35 + i * 8),
    ];
    const { container } = render(
      <ChartLineWilliamsRMidCross data={mk(closes)} length={14} />,
    );
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-williams-r-mid-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      ...Array.from({ length: 20 }, (_, i) => 35 + i * 8),
    ];
    const { container } = render(
      <ChartLineWilliamsRMidCross
        data={mk(closes)}
        length={14}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      ...Array.from({ length: 20 }, (_, i) => 35 + i * 8),
    ];
    const { container } = render(
      <ChartLineWilliamsRMidCross
        data={mk(closes)}
        length={14}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-williams-r-mid-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-threshold')).toBe('-50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('17');
  });

  it('defaults: length=14, threshold=-50', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_WILLIAMS_R_MID_CROSS_THRESHOLD).toBe(-50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineWilliamsRMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-williams-r-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineWilliamsRMidCrossLayout({ data });
    const b = computeLineWilliamsRMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.wrPath).toBe(b.wrPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-recovery pattern', () => {
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      ...Array.from({ length: 20 }, (_, i) => 35 + i * 8),
    ];
    const data = mk(closes);
    const a = computeLineWilliamsRMidCrossLayout({ data, length: 14 });
    const b = computeLineWilliamsRMidCrossLayout({ data, length: 14 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.wrPath).toBe(b.wrPath);
    expect(a.run.wrValues).toEqual(b.run.wrValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
