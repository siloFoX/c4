import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineCciOversoldCross,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_LENGTH,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_OSC_RANGE,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PADDING,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_WIDTH,
  applyLineCciOversoldCrossSma,
  classifyLineCciOversoldCrossRegime,
  computeLineCciOversoldCross,
  computeLineCciOversoldCrossLayout,
  describeLineCciOversoldCrossChart,
  detectLineCciOversoldCrossCrosses,
  getLineCciOversoldCrossFinitePoints,
  normalizeLineCciOversoldCrossLength,
  normalizeLineCciOversoldCrossThreshold,
  runLineCciOversoldCross,
  type ChartLineCciOversoldCrossPoint,
} from './chart-line-cci-oversold-cross';

const mk = (closes: number[]): ChartLineCciOversoldCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineCciOversoldCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineCciOversoldCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineCciOversoldCrossFinitePoints(null)).toEqual([]);
    expect(getLineCciOversoldCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineCciOversoldCrossFinitePoints(
        'oops' as unknown as ChartLineCciOversoldCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineCciOversoldCrossPoint[];
    expect(getLineCciOversoldCrossFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineCciOversoldCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineCciOversoldCrossLength(20, 10)).toBe(20);
    expect(normalizeLineCciOversoldCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineCciOversoldCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineCciOversoldCrossLength(0, 10)).toBe(10);
    expect(normalizeLineCciOversoldCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineCciOversoldCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineCciOversoldCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineCciOversoldCrossThreshold', () => {
  it('keeps finite negative values', () => {
    expect(normalizeLineCciOversoldCrossThreshold(-100, -80)).toBe(-100);
    expect(normalizeLineCciOversoldCrossThreshold(-0.5, -80)).toBe(-0.5);
  });

  it('rejects 0 / positive / non-finite', () => {
    expect(normalizeLineCciOversoldCrossThreshold(0, -80)).toBe(-80);
    expect(normalizeLineCciOversoldCrossThreshold(5, -80)).toBe(-80);
    expect(normalizeLineCciOversoldCrossThreshold(NaN, -80)).toBe(-80);
    expect(normalizeLineCciOversoldCrossThreshold(-Infinity, -80)).toBe(-80);
  });
});

describe('applyLineCciOversoldCrossSma', () => {
  it('CONST values short-circuit to exact value', () => {
    const values = new Array(10).fill(42);
    const out = applyLineCciOversoldCrossSma(values, 5);
    expect(out.slice(0, 4)).toEqual([null, null, null, null]);
    expect(out.slice(4)).toEqual([42, 42, 42, 42, 42, 42]);
  });

  it('CONST zeros stay at +0 not -0', () => {
    const out = applyLineCciOversoldCrossSma([0, 0, 0, 0, 0], 5);
    expect(Object.is(out[4], 0)).toBe(true);
    expect(Object.is(out[4], -0)).toBe(false);
  });

  it('length === 1 returns values verbatim', () => {
    expect(applyLineCciOversoldCrossSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('null in window invalidates output', () => {
    const out = applyLineCciOversoldCrossSma([1, null, 3, 4, 5], 3);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(4);
  });

  it('empty input', () => {
    expect(applyLineCciOversoldCrossSma([], 5)).toEqual([]);
  });
});

describe('computeLineCciOversoldCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> cci is exactly 0 from index length-1 onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { cci } = computeLineCciOversoldCross(data, { length: 20 });
      for (let i = 0; i < 19; i += 1) {
        expect(cci[i]).toBeNull();
      }
      for (let i = 19; i < 30; i += 1) {
        expect(cci[i]).toBe(0);
        expect(Object.is(cci[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineCciOversoldCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=20) -> cci constant at 1900/15 = 126.667', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { cci } = computeLineCciOversoldCross(data, { length: 20 });
    for (let i = 19; i < 30; i += 1) {
      expect(cci[i]).toBeCloseTo(126.6666666, 4);
    }
  });

  it('LINEAR DOWN close=-i (length=20) -> cci constant at -126.667', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { cci } = computeLineCciOversoldCross(data, { length: 20 });
    for (let i = 19; i < 30; i += 1) {
      expect(cci[i]).toBeCloseTo(-126.6666666, 4);
    }
  });
});

describe('classifyLineCciOversoldCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineCciOversoldCrossRegime(null, -100)).toBe('none');
  });

  it('cci > threshold -> neutral', () => {
    expect(classifyLineCciOversoldCrossRegime(0, -100)).toBe('neutral');
    expect(classifyLineCciOversoldCrossRegime(-99.99, -100)).toBe('neutral');
    expect(classifyLineCciOversoldCrossRegime(150, -100)).toBe('neutral');
  });

  it('cci at threshold boundary -> oversold', () => {
    expect(classifyLineCciOversoldCrossRegime(-100, -100)).toBe('oversold');
    expect(classifyLineCciOversoldCrossRegime(-200, -100)).toBe('oversold');
    expect(classifyLineCciOversoldCrossRegime(-500, -100)).toBe('oversold');
  });
});

describe('detectLineCciOversoldCrossCrosses', () => {
  it('fires bullish exit when cci crosses up through -100', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cci = [-150, -120, -110, -90, -50];
    const crosses = detectLineCciOversoldCrossCrosses(series, cci, -100);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish entry when cci crosses down through -100', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cci = [-50, -50, -90, -150, -200];
    const crosses = detectLineCciOversoldCrossCrosses(series, cci, -100);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits entry then exit when cci dives then recovers', () => {
    const series = mk([1, 2, 3, 4]);
    const cci = [-50, -200, -150, -50];
    const crosses = detectLineCciOversoldCrossCrosses(series, cci, -100);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bearish');
    expect(crosses[1]!.kind).toBe('bullish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineCciOversoldCrossCrosses(series, [null, -50, -150], -100),
    ).toEqual([{ index: 2, x: 2, kind: 'bearish' }]);
    expect(
      detectLineCciOversoldCrossCrosses(series, [-50, null, -150], -100),
    ).toEqual([]);
  });

  it('boundary equality treated as not yet crossed (strict cur < T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineCciOversoldCrossCrosses(series, [-50, -100], -100),
    ).toEqual([]);
  });

  it('no cross when cci stays above threshold', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineCciOversoldCrossCrosses(series, [50, 0, -50, -99], -100),
    ).toEqual([]);
  });
});

describe('runLineCciOversoldCross', () => {
  it('CONST K -> 0 crosses, all neutral (after warmup) + initial nones', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineCciOversoldCross(data, { length: 20 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.neutralCount).toBe(11);
    expect(run.oversoldCount).toBe(0);
  });

  it('LINEAR UP -> all neutral after warmup (cci ~127 > -100), 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineCciOversoldCross(data, { length: 20 });
    expect(run.crosses).toHaveLength(0);
    expect(run.neutralCount).toBe(11);
    expect(run.oversoldCount).toBe(0);
  });

  it('LINEAR DOWN -> all oversold after warmup (cci ~-127 <= -100), 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineCciOversoldCross(data, { length: 20 });
    expect(run.crosses).toHaveLength(0);
    expect(run.oversoldCount).toBe(11);
    expect(run.neutralCount).toBe(0);
  });

  it('single negative spike (length=14) -> cci = -466.67 -> 1 bearish entry', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      -100,
    ]);
    const run = runLineCciOversoldCross(data, { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBe(1);
    expect(run.crosses[0]!.kind).toBe('bearish');
    expect(run.entryCount).toBe(1);
    expect(run.exitCount).toBe(0);
  });

  it('threshold normalization clamps non-negative', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCciOversoldCross(data, {
      length: 20,
      threshold: 50,
    });
    expect(run.threshold).toBe(-100);
  });

  it('respects custom negative threshold', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCciOversoldCross(data, {
      length: 20,
      threshold: -75,
    });
    expect(run.threshold).toBe(-75);
  });

  it('empty data -> ok=false', () => {
    const run = runLineCciOversoldCross([], { length: 20 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineCciOversoldCross(mk([1, 2, 3]), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineCciOversoldCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineCciOversoldCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / cci / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCciOversoldCross(data, { length: 20 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 19; i += 1) {
      expect(run.samples[i]!.cci).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 19; i < 30; i += 1) {
      expect(run.samples[i]!.cci).toBe(0);
      expect(run.samples[i]!.regime).toBe('neutral');
    }
  });
});

describe('computeLineCciOversoldCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCciOversoldCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PANEL_GAP,
    );
    expect(layout.innerLeft).toBe(layout.padding);
    expect(layout.innerRight).toBe(layout.width - layout.padding);
  });

  it('SVG y-axis: midY (0) < thresholdY (-100) -- lower value, larger y', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCciOversoldCrossLayout({ data });
    expect(layout.midY).toBeLessThan(layout.thresholdY);
  });

  it('empty data -> ok=false but bands populated', () => {
    const layout = computeLineCciOversoldCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cciPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('default osc range is +/- 300', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineCciOversoldCrossLayout({ data });
    expect(layout.oscMin).toBe(-DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_OSC_RANGE);
    expect(layout.oscMax).toBe(DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_OSC_RANGE);
  });

  it('osc range expands to cover extreme cci values', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      -1000,
    ]);
    const layout = computeLineCciOversoldCrossLayout({ data, length: 14 });
    expect(layout.oscMin).toBeLessThan(-300);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineCciOversoldCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('cci path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineCciOversoldCrossLayout({ data, length: 20 });
    expect(layout.cciPath.startsWith('M ')).toBe(true);
    const mCount = (layout.cciPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price (priceMin === priceMax) by inflating range', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineCciOversoldCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      -100,
    ]);
    const layout = computeLineCciOversoldCrossLayout({ data, length: 14 });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineCciOversoldCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineCciOversoldCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineCciOversoldCrossChart(data);
    expect(desc).toContain('CCI Oversold Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('threshold -100');
  });
});

describe('ChartLineCciOversoldCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineCciOversoldCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('CCI Oversold Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-cci-oversold-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('CCI Oversold Cross chart');
  });

  it('renders config badge with thresholds', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciOversoldCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cci-oversold-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('threshold -100');
  });

  it('renders legend toggles for price + cci', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciOversoldCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('cci');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciOversoldCross data={data} />);
    const cciButton = container.querySelector('[data-series-id="cci"]');
    expect(cciButton?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cciButton!);
    expect(cciButton?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(cciButton!);
    expect(cciButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineCciOversoldCross data={data} hiddenSeries={['cci']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-cci-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineCciOversoldCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-cci-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineCciOversoldCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="cci"]')!);
    expect(events).toEqual([{ seriesId: 'cci', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciOversoldCross data={data} />);
    const cciButton = container.querySelector(
      '[data-series-id="cci"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(cciButton, { key: 'Enter' });
    expect(cciButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(cciButton, { key: ' ' });
    expect(cciButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineCciOversoldCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCciOversoldCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciOversoldCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciOversoldCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-cci-oversold-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-cci-oversold-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold + mid bands by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciOversoldCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-band-threshold"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-band-mid"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCciOversoldCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCciOversoldCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after negative spike', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      -100,
    ]);
    const { container } = render(
      <ChartLineCciOversoldCross data={data} length={14} />,
    );
    const bearishMarkers = container.querySelectorAll(
      '[data-section="chart-line-cci-oversold-cross-cross-bearish"]',
    );
    expect(bearishMarkers.length).toBe(1);
    const bearishOverlay = container.querySelectorAll(
      '[data-section="chart-line-cci-oversold-cross-overlay-bearish"]',
    );
    expect(bearishOverlay.length).toBe(1);
  });

  it('showCrosses=false hides cross markers', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      -100,
    ]);
    const { container } = render(
      <ChartLineCciOversoldCross
        data={data}
        length={14}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      -100,
    ]);
    const { container } = render(
      <ChartLineCciOversoldCross
        data={data}
        length={14}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciOversoldCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-cci-oversold-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('20');
    expect(region?.getAttribute('data-threshold')).toBe('-100');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-neutral-count')).toBe('11');
  });

  it('defaults: length=20, threshold=-100', () => {
    expect(DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_THRESHOLD).toBe(-100);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCciOversoldCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cci-oversold-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineCciOversoldCrossLayout({ data });
    const b = computeLineCciOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cciPath).toBe(b.cciPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.midY).toBe(b.midY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for negative-spike pattern', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      -100,
    ]);
    const a = computeLineCciOversoldCrossLayout({ data, length: 14 });
    const b = computeLineCciOversoldCrossLayout({ data, length: 14 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cciPath).toBe(b.cciPath);
    expect(a.run.cciValues).toEqual(b.run.cciValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
