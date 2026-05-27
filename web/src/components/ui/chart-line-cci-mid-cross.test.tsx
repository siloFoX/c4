import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineCciMidCross,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_LENGTH,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_OSC_RANGE,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_WIDTH,
  applyLineCciMidCrossSma,
  classifyLineCciMidCrossRegime,
  computeLineCciMidCross,
  computeLineCciMidCrossLayout,
  describeLineCciMidCrossChart,
  detectLineCciMidCrossCrosses,
  getLineCciMidCrossFinitePoints,
  normalizeLineCciMidCrossLength,
  normalizeLineCciMidCrossThreshold,
  runLineCciMidCross,
  type ChartLineCciMidCrossPoint,
} from './chart-line-cci-mid-cross';

const mk = (closes: number[]): ChartLineCciMidCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineCciMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineCciMidCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineCciMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineCciMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineCciMidCrossFinitePoints(
        'oops' as unknown as ChartLineCciMidCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineCciMidCrossPoint[];
    expect(getLineCciMidCrossFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineCciMidCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineCciMidCrossLength(20, 10)).toBe(20);
    expect(normalizeLineCciMidCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineCciMidCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineCciMidCrossLength(0, 10)).toBe(10);
    expect(normalizeLineCciMidCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineCciMidCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineCciMidCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineCciMidCrossThreshold', () => {
  it('accepts any finite value (0, positive, negative)', () => {
    expect(normalizeLineCciMidCrossThreshold(0, -10)).toBe(0);
    expect(normalizeLineCciMidCrossThreshold(50, -10)).toBe(50);
    expect(normalizeLineCciMidCrossThreshold(-25, -10)).toBe(-25);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineCciMidCrossThreshold(NaN, -10)).toBe(-10);
    expect(normalizeLineCciMidCrossThreshold(Infinity, -10)).toBe(-10);
    expect(normalizeLineCciMidCrossThreshold(-Infinity, -10)).toBe(-10);
  });
});

describe('applyLineCciMidCrossSma', () => {
  it('CONST values short-circuit to exact value', () => {
    const values = new Array(10).fill(42);
    const out = applyLineCciMidCrossSma(values, 5);
    expect(out.slice(0, 4)).toEqual([null, null, null, null]);
    expect(out.slice(4)).toEqual([42, 42, 42, 42, 42, 42]);
  });

  it('CONST zeros stay at +0 not -0', () => {
    const out = applyLineCciMidCrossSma([0, 0, 0, 0, 0], 5);
    expect(Object.is(out[4], 0)).toBe(true);
    expect(Object.is(out[4], -0)).toBe(false);
  });

  it('length === 1 returns values verbatim', () => {
    expect(applyLineCciMidCrossSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('null in window invalidates output', () => {
    const out = applyLineCciMidCrossSma([1, null, 3, 4, 5], 3);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(4);
  });

  it('empty input', () => {
    expect(applyLineCciMidCrossSma([], 5)).toEqual([]);
  });
});

describe('computeLineCciMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> cci is exactly 0 from index length-1 onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { cci } = computeLineCciMidCross(data, { length: 20 });
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

describe('computeLineCciMidCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=20) -> cci constant at 126.667', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { cci } = computeLineCciMidCross(data, { length: 20 });
    for (let i = 19; i < 30; i += 1) {
      expect(cci[i]).toBeCloseTo(126.6666666, 4);
    }
  });

  it('LINEAR DOWN close=-i (length=20) -> cci constant at -126.667', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { cci } = computeLineCciMidCross(data, { length: 20 });
    for (let i = 19; i < 30; i += 1) {
      expect(cci[i]).toBeCloseTo(-126.6666666, 4);
    }
  });
});

describe('classifyLineCciMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineCciMidCrossRegime(null, 0)).toBe('none');
  });

  it('cci at threshold boundary -> bullish', () => {
    expect(classifyLineCciMidCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineCciMidCrossRegime(100, 0)).toBe('bullish');
    expect(classifyLineCciMidCrossRegime(500, 0)).toBe('bullish');
  });

  it('cci < threshold -> bearish', () => {
    expect(classifyLineCciMidCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineCciMidCrossRegime(-100, 0)).toBe('bearish');
    expect(classifyLineCciMidCrossRegime(-500, 0)).toBe('bearish');
  });

  it('respects custom threshold (e.g., 50)', () => {
    expect(classifyLineCciMidCrossRegime(50, 50)).toBe('bullish');
    expect(classifyLineCciMidCrossRegime(49, 50)).toBe('bearish');
  });
});

describe('detectLineCciMidCrossCrosses', () => {
  it('fires bullish when cci crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cci = [-50, -30, -10, 20, 50];
    const crosses = detectLineCciMidCrossCrosses(series, cci, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when cci crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cci = [50, 50, 30, -10, -50];
    const crosses = detectLineCciMidCrossCrosses(series, cci, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when cci sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const cci = [-50, 50, 30, -50];
    const crosses = detectLineCciMidCrossCrosses(series, cci, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineCciMidCrossCrosses(series, [null, -50, 50], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineCciMidCrossCrosses(series, [-50, null, 50], 0),
    ).toEqual([]);
  });

  it('boundary equality treated as not yet crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineCciMidCrossCrosses(series, [-50, 0], 0)).toEqual([]);
  });

  it('no cross when cci stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineCciMidCrossCrosses(series, [-50, -30, -20, -10], 0),
    ).toEqual([]);
  });

  it('custom threshold of -50 fires when cci crosses up through -50', () => {
    const series = mk([1, 2, 3]);
    const cci = [-80, -70, -30];
    const crosses = detectLineCciMidCrossCrosses(series, cci, -50);
    expect(crosses).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineCciMidCross', () => {
  it('CONST K -> 0 crosses, all bullish (cci=0, regime bullish at boundary)', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineCciMidCross(data, { length: 20 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.bullishCount).toBe(11);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineCciMidCross(data, { length: 20 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(11);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineCciMidCross(data, { length: 20 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(11);
  });

  it('decline then rise generates a bullish zero-line cross', () => {
    // close descends for 20 bars (cci negative once warm), then rises sharply
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 5),
    ];
    const run = runLineCciMidCross(mk(closes), { length: 20 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise then decline generates a bearish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 10 + i),
      ...Array.from({ length: 20 }, (_, i) => 29 - i * 5),
    ];
    const run = runLineCciMidCross(mk(closes), { length: 20 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCciMidCross(data, { length: 20, threshold: NaN });
    expect(run.threshold).toBe(0);
  });

  it('respects custom finite threshold (positive)', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCciMidCross(data, { length: 20, threshold: 25 });
    expect(run.threshold).toBe(25);
  });

  it('respects custom finite threshold (negative)', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCciMidCross(data, { length: 20, threshold: -25 });
    expect(run.threshold).toBe(-25);
  });

  it('empty data -> ok=false', () => {
    const run = runLineCciMidCross([], { length: 20 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineCciMidCross(mk([1, 2, 3]), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineCciMidCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineCciMidCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / cci / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineCciMidCross(data, { length: 20 });
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 19; i += 1) {
      expect(run.samples[i]!.cci).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 19; i < 30; i += 1) {
      expect(run.samples[i]!.cci).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineCciMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCciMidCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_CCI_MID_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_CCI_MID_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_CCI_MID_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_CCI_MID_CROSS_PANEL_GAP);
    expect(layout.innerLeft).toBe(layout.padding);
    expect(layout.innerRight).toBe(layout.width - layout.padding);
  });

  it('SVG y-axis: thresholdY (0) sits between oscTop and oscBottom', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCciMidCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false but bands populated', () => {
    const layout = computeLineCciMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cciPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('default osc range is +/- 300', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineCciMidCrossLayout({ data });
    expect(layout.oscMin).toBe(-DEFAULT_CHART_LINE_CCI_MID_CROSS_OSC_RANGE);
    expect(layout.oscMax).toBe(DEFAULT_CHART_LINE_CCI_MID_CROSS_OSC_RANGE);
  });

  it('osc range expands to cover extreme cci values', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      1000,
    ]);
    const layout = computeLineCciMidCrossLayout({ data, length: 14 });
    expect(layout.oscMax).toBeGreaterThan(300);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineCciMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('cci path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineCciMidCrossLayout({ data, length: 20 });
    expect(layout.cciPath.startsWith('M ')).toBe(true);
    const mCount = (layout.cciPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price (priceMin === priceMax) by inflating range', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineCciMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 5),
    ];
    const layout = computeLineCciMidCrossLayout({
      data: mk(closes),
      length: 20,
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

describe('describeLineCciMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineCciMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineCciMidCrossChart(data);
    expect(desc).toContain('CCI Midline Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineCciMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineCciMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('CCI Midline Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-cci-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('CCI Midline Cross chart');
  });

  it('renders config badge with thresholds', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cci-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + cci', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('cci');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciMidCross data={data} />);
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
      <ChartLineCciMidCross data={data} hiddenSeries={['cci']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-cci-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineCciMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-cci-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineCciMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="cci"]')!);
    expect(events).toEqual([{ seriesId: 'cci', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciMidCross data={data} />);
    const cciButton = container.querySelector(
      '[data-series-id="cci"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(cciButton, { key: 'Enter' });
    expect(cciButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(cciButton, { key: ' ' });
    expect(cciButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineCciMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCciMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-cci-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-cci-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCciMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCciMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 5),
    ];
    const { container } = render(
      <ChartLineCciMidCross data={mk(closes)} length={20} />,
    );
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-cci-mid-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 5),
    ];
    const { container } = render(
      <ChartLineCciMidCross
        data={mk(closes)}
        length={20}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 5),
    ];
    const { container } = render(
      <ChartLineCciMidCross
        data={mk(closes)}
        length={20}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineCciMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-cci-mid-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('20');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('11');
  });

  it('defaults: length=20, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_CCI_MID_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_CCI_MID_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCciMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cci-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineCciMidCrossLayout({ data });
    const b = computeLineCciMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cciPath).toBe(b.cciPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 100 - i),
      ...Array.from({ length: 20 }, (_, i) => 81 + i * 5),
    ];
    const data = mk(closes);
    const a = computeLineCciMidCrossLayout({ data, length: 20 });
    const b = computeLineCciMidCrossLayout({ data, length: 20 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cciPath).toBe(b.cciPath);
    expect(a.run.cciValues).toEqual(b.run.cciValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
