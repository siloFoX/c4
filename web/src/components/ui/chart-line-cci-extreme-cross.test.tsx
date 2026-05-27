import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineCciExtremeCross,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LENGTH,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_EXTREME,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_MILD,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_OSC_RANGE,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PADDING,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_EXTREME,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_MILD,
  DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_WIDTH,
  applyLineCciExtremeCrossSma,
  classifyLineCciExtremeCrossRegime,
  computeLineCciExtremeCross,
  computeLineCciExtremeCrossLayout,
  describeLineCciExtremeCrossChart,
  detectLineCciExtremeCrossCrosses,
  getLineCciExtremeCrossFinitePoints,
  normalizeLineCciExtremeCrossLength,
  normalizeLineCciExtremeCrossNegative,
  normalizeLineCciExtremeCrossPositive,
  runLineCciExtremeCross,
  type ChartLineCciExtremeCrossPoint,
} from './chart-line-cci-extreme-cross';

const mk = (closes: number[]): ChartLineCciExtremeCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineCciExtremeCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    const out = getLineCciExtremeCrossFinitePoints(points);
    expect(out).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineCciExtremeCrossFinitePoints(null)).toEqual([]);
    expect(getLineCciExtremeCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineCciExtremeCrossFinitePoints(
        'oops' as unknown as ChartLineCciExtremeCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineCciExtremeCrossPoint[];
    expect(getLineCciExtremeCrossFinitePoints(bad)).toEqual([{ x: 0, close: 1 }]);
  });
});

describe('normalizeLineCciExtremeCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineCciExtremeCrossLength(20, 10)).toBe(20);
    expect(normalizeLineCciExtremeCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineCciExtremeCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineCciExtremeCrossLength(0, 10)).toBe(10);
    expect(normalizeLineCciExtremeCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineCciExtremeCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineCciExtremeCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineCciExtremeCrossPositive', () => {
  it('keeps finite positive values', () => {
    expect(normalizeLineCciExtremeCrossPositive(150, 100)).toBe(150);
    expect(normalizeLineCciExtremeCrossPositive(0.5, 100)).toBe(0.5);
  });

  it('rejects 0 / negative / non-finite', () => {
    expect(normalizeLineCciExtremeCrossPositive(0, 100)).toBe(100);
    expect(normalizeLineCciExtremeCrossPositive(-5, 100)).toBe(100);
    expect(normalizeLineCciExtremeCrossPositive(NaN, 100)).toBe(100);
    expect(normalizeLineCciExtremeCrossPositive(Infinity, 100)).toBe(100);
  });
});

describe('normalizeLineCciExtremeCrossNegative', () => {
  it('keeps finite negative values', () => {
    expect(normalizeLineCciExtremeCrossNegative(-150, -100)).toBe(-150);
    expect(normalizeLineCciExtremeCrossNegative(-0.5, -100)).toBe(-0.5);
  });

  it('rejects 0 / positive / non-finite', () => {
    expect(normalizeLineCciExtremeCrossNegative(0, -100)).toBe(-100);
    expect(normalizeLineCciExtremeCrossNegative(5, -100)).toBe(-100);
    expect(normalizeLineCciExtremeCrossNegative(NaN, -100)).toBe(-100);
    expect(normalizeLineCciExtremeCrossNegative(-Infinity, -100)).toBe(-100);
  });
});

describe('applyLineCciExtremeCrossSma', () => {
  it('short-circuits CONST window to exact value', () => {
    const values = new Array(10).fill(42);
    const out = applyLineCciExtremeCrossSma(values, 5);
    expect(out.slice(0, 4)).toEqual([null, null, null, null]);
    expect(out.slice(4)).toEqual([42, 42, 42, 42, 42, 42]);
  });

  it('normalizes -0 to +0', () => {
    const out = applyLineCciExtremeCrossSma([0, 0, 0, 0, 0], 5);
    expect(Object.is(out[4], 0)).toBe(true);
    expect(Object.is(out[4], -0)).toBe(false);
  });

  it('length === 1 returns values verbatim', () => {
    const out = applyLineCciExtremeCrossSma([1, 2, 3], 1);
    expect(out).toEqual([1, 2, 3]);
  });

  it('returns null when any value in window is null', () => {
    const out = applyLineCciExtremeCrossSma([1, null, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(4);
  });

  it('empty input', () => {
    expect(applyLineCciExtremeCrossSma([], 5)).toEqual([]);
  });

  it('length < 1 yields all null', () => {
    const out = applyLineCciExtremeCrossSma([1, 2, 3], 0);
    expect(out).toEqual([null, null, null]);
  });
});

describe('computeLineCciExtremeCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> cci is exactly 0 from index length-1 onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { cci } = computeLineCciExtremeCross(data, { length: 20 });
      for (let i = 0; i < 19; i += 1) {
        expect(cci[i]).toBeNull();
      }
      for (let i = 19; i < 30; i += 1) {
        expect(cci[i]).toBe(0);
        expect(Object.is(cci[i], -0)).toBe(false);
      }
    },
  );

  it('CONST K cci is +0 not -0', () => {
    const data = mk(new Array(25).fill(7));
    const { cci } = computeLineCciExtremeCross(data, { length: 20 });
    expect(Object.is(cci[24], 0)).toBe(true);
    expect(Object.is(cci[24], -0)).toBe(false);
  });
});

describe('computeLineCciExtremeCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=20) -> cci constant at 1900/15 = 126.667', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { cci } = computeLineCciExtremeCross(data, { length: 20 });
    for (let i = 0; i < 19; i += 1) {
      expect(cci[i]).toBeNull();
    }
    for (let i = 19; i < 30; i += 1) {
      expect(cci[i]).toBeCloseTo(126.6666666, 4);
    }
  });

  it('LINEAR DOWN close=-i (length=20) -> cci constant at -126.667', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { cci } = computeLineCciExtremeCross(data, { length: 20 });
    for (let i = 19; i < 30; i += 1) {
      expect(cci[i]).toBeCloseTo(-126.6666666, 4);
    }
  });
});

describe('classifyLineCciExtremeCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineCciExtremeCrossRegime(null, 100, -100, 200, -200)).toBe(
      'none',
    );
  });

  it('cci 0 -> neutral', () => {
    expect(classifyLineCciExtremeCrossRegime(0, 100, -100, 200, -200)).toBe(
      'neutral',
    );
  });

  it('cci between -100 and 100 -> neutral', () => {
    expect(
      classifyLineCciExtremeCrossRegime(50, 100, -100, 200, -200),
    ).toBe('neutral');
    expect(
      classifyLineCciExtremeCrossRegime(-99, 100, -100, 200, -200),
    ).toBe('neutral');
  });

  it('cci at upperMild boundary -> bullish', () => {
    expect(
      classifyLineCciExtremeCrossRegime(100, 100, -100, 200, -200),
    ).toBe('bullish');
  });

  it('cci at lowerMild boundary -> bearish', () => {
    expect(
      classifyLineCciExtremeCrossRegime(-100, 100, -100, 200, -200),
    ).toBe('bearish');
  });

  it('cci at upperExtreme boundary -> bullishExtreme', () => {
    expect(
      classifyLineCciExtremeCrossRegime(200, 100, -100, 200, -200),
    ).toBe('bullishExtreme');
    expect(
      classifyLineCciExtremeCrossRegime(500, 100, -100, 200, -200),
    ).toBe('bullishExtreme');
  });

  it('cci at lowerExtreme boundary -> bearishExtreme', () => {
    expect(
      classifyLineCciExtremeCrossRegime(-200, 100, -100, 200, -200),
    ).toBe('bearishExtreme');
    expect(
      classifyLineCciExtremeCrossRegime(-500, 100, -100, 200, -200),
    ).toBe('bearishExtreme');
  });

  it('cci between mild and extreme -> bullish / bearish', () => {
    expect(
      classifyLineCciExtremeCrossRegime(150, 100, -100, 200, -200),
    ).toBe('bullish');
    expect(
      classifyLineCciExtremeCrossRegime(-150, 100, -100, 200, -200),
    ).toBe('bearish');
  });
});

describe('detectLineCciExtremeCrossCrosses', () => {
  it('fires bullishMild only when cci moves up through +100 but stays under +200', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cci = [50, 90, 99, 150, 180];
    const crosses = detectLineCciExtremeCrossCrosses(
      series,
      cci,
      100,
      -100,
      200,
      -200,
    );
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullishMild' }]);
  });

  it('fires both bullishMild + bullishExtreme when cci jumps above +200 in one step', () => {
    const series = mk([1, 2, 3, 4]);
    const cci = [50, 50, 50, 500];
    const crosses = detectLineCciExtremeCrossCrosses(
      series,
      cci,
      100,
      -100,
      200,
      -200,
    );
    expect(crosses).toHaveLength(2);
    expect(crosses[0]).toEqual({ index: 3, x: 3, kind: 'bullishMild' });
    expect(crosses[1]).toEqual({
      index: 3,
      x: 3,
      kind: 'bullishExtreme',
    });
  });

  it('fires bearishMild only when cci moves down through -100 but stays above -200', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const cci = [-50, -90, -99, -150, -180];
    const crosses = detectLineCciExtremeCrossCrosses(
      series,
      cci,
      100,
      -100,
      200,
      -200,
    );
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearishMild' }]);
  });

  it('fires both bearishMild + bearishExtreme when cci dives below -200 in one step', () => {
    const series = mk([1, 2, 3, 4]);
    const cci = [50, 50, 50, -500];
    const crosses = detectLineCciExtremeCrossCrosses(
      series,
      cci,
      100,
      -100,
      200,
      -200,
    );
    expect(crosses).toHaveLength(2);
    expect(crosses[0]).toEqual({ index: 3, x: 3, kind: 'bearishMild' });
    expect(crosses[1]).toEqual({
      index: 3,
      x: 3,
      kind: 'bearishExtreme',
    });
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    const crosses1 = detectLineCciExtremeCrossCrosses(
      series,
      [null, 50, 150],
      100,
      -100,
      200,
      -200,
    );
    expect(crosses1).toEqual([{ index: 2, x: 2, kind: 'bullishMild' }]);
    const crosses2 = detectLineCciExtremeCrossCrosses(
      series,
      [50, null, 150],
      100,
      -100,
      200,
      -200,
    );
    expect(crosses2).toEqual([]);
  });

  it('no cross when cci stays inside bands', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineCciExtremeCrossCrosses(
        series,
        [0, 50, 80, 99],
        100,
        -100,
        200,
        -200,
      ),
    ).toEqual([]);
  });

  it('crosses up then down through +100 yields one mild bullish + one mild bearish', () => {
    const series = mk([1, 2, 3, 4]);
    const cci = [50, 150, 80, -150];
    const crosses = detectLineCciExtremeCrossCrosses(
      series,
      cci,
      100,
      -100,
      200,
      -200,
    );
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullishMild');
    expect(crosses[1]!.kind).toBe('bearishMild');
  });

  it('boundary equality treated as not yet crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineCciExtremeCrossCrosses(
        series,
        [50, 100],
        100,
        -100,
        200,
        -200,
      ),
    ).toEqual([]);
  });
});

describe('runLineCciExtremeCross', () => {
  it('CONST K -> 0 crosses, all neutral (after warmup) + initial nones', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineCciExtremeCross(data, { length: 20 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.neutralCount).toBe(11);
    expect(run.bullishCount).toBe(0);
    expect(run.bullishExtremeCount).toBe(0);
    expect(run.bearishCount).toBe(0);
    expect(run.bearishExtremeCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses (cci constant once stable)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineCciExtremeCross(data, { length: 20 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(11);
    expect(run.bullishExtremeCount).toBe(0);
    expect(run.neutralCount).toBe(0);
    expect(run.noneCount).toBe(19);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineCciExtremeCross(data, { length: 20 });
    expect(run.bearishCount).toBe(11);
    expect(run.bearishExtremeCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });

  it('single positive spike with length=14 -> +466.67 -> 2 entries (mild + extreme)', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      100,
    ]);
    const run = runLineCciExtremeCross(data, { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(2);
    expect(run.crosses[0]!.kind).toBe('bullishMild');
    expect(run.crosses[1]!.kind).toBe('bullishExtreme');
    expect(run.bullishMildEntryCount).toBe(1);
    expect(run.bullishExtremeEntryCount).toBe(1);
    expect(run.bearishMildEntryCount).toBe(0);
    expect(run.bearishExtremeEntryCount).toBe(0);
  });

  it('single negative spike with length=14 -> -466.67 -> 2 entries (mild + extreme)', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      -100,
    ]);
    const run = runLineCciExtremeCross(data, { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(2);
    expect(run.crosses[0]!.kind).toBe('bearishMild');
    expect(run.crosses[1]!.kind).toBe('bearishExtreme');
  });

  it('threshold overrides clamp into valid sign ranges', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineCciExtremeCross(data, {
      length: 20,
      upperMild: -5,
      lowerMild: 5,
      upperExtreme: -50,
      lowerExtreme: 50,
    });
    expect(run.upperMild).toBe(100);
    expect(run.lowerMild).toBe(-100);
    expect(run.upperExtreme).toBe(200);
    expect(run.lowerExtreme).toBe(-200);
  });

  it('respects custom threshold overrides when sign-valid', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineCciExtremeCross(data, {
      length: 20,
      upperMild: 50,
      lowerMild: -50,
      upperExtreme: 150,
      lowerExtreme: -150,
    });
    expect(run.upperMild).toBe(50);
    expect(run.upperExtreme).toBe(150);
    expect(run.lowerMild).toBe(-50);
    expect(run.lowerExtreme).toBe(-150);
  });

  it('empty data -> ok = false', () => {
    const run = runLineCciExtremeCross([], { length: 20 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data length -> ok = false', () => {
    const run = runLineCciExtremeCross(mk([1, 2, 3]), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineCciExtremeCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineCciExtremeCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('all samples carry index / x / close / cci / regime', () => {
    const data = mk(new Array(25).fill(10));
    const run = runLineCciExtremeCross(data, { length: 20 });
    expect(run.samples).toHaveLength(25);
    for (let i = 0; i < 19; i += 1) {
      expect(run.samples[i]!.cci).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 19; i < 25; i += 1) {
      expect(run.samples[i]!.cci).toBe(0);
      expect(run.samples[i]!.regime).toBe('neutral');
    }
  });
});

describe('computeLineCciExtremeCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(25).fill(50));
    const layout = computeLineCciExtremeCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_PANEL_GAP,
    );
    expect(layout.innerLeft).toBe(layout.padding);
    expect(layout.innerRight).toBe(layout.width - layout.padding);
  });

  it('SVG y-axis: midY < upperMildY < upperExtremeY rows-wise', () => {
    // higher value -> smaller y (top of panel)
    const data = mk(new Array(25).fill(50));
    const layout = computeLineCciExtremeCrossLayout({ data });
    // upperExtreme (200) is the largest value among positive, so its y is smallest
    // mid (0) is in the middle of the oscillator
    // lowerExtreme (-200) is the smallest value, so its y is largest
    expect(layout.upperExtremeY).toBeLessThan(layout.upperMildY);
    expect(layout.upperMildY).toBeLessThan(layout.midY);
    expect(layout.midY).toBeLessThan(layout.lowerMildY);
    expect(layout.lowerMildY).toBeLessThan(layout.lowerExtremeY);
  });

  it('empty data -> ok=false but bands still populated', () => {
    const layout = computeLineCciExtremeCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cciPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
    // bands still computed against default osc range
    expect(layout.midY).toBeGreaterThan(layout.oscTop);
    expect(layout.midY).toBeLessThan(layout.oscBottom);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 25 }, (_, i) => i));
    const layout = computeLineCciExtremeCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('cci path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 25 }, (_, i) => i));
    const layout = computeLineCciExtremeCrossLayout({ data, length: 20 });
    // first 19 are null, so cci path starts only at i=19
    expect(layout.cciPath.startsWith('M ')).toBe(true);
    // 25 - 19 = 6 cci points -> 1 M + 5 L = 6 commands
    const mCount = (layout.cciPath.match(/M /g) ?? []).length;
    const lCount = (layout.cciPath.match(/L /g) ?? []).length;
    expect(mCount).toBe(1);
    expect(lCount).toBe(5);
  });

  it('handles single-point price (priceMin === priceMax) by inflating range', () => {
    const data = mk(new Array(25).fill(7));
    const layout = computeLineCciExtremeCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('default osc range is +/- 300', () => {
    const data = mk(new Array(25).fill(7));
    const layout = computeLineCciExtremeCrossLayout({ data });
    expect(layout.oscMin).toBe(-DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_OSC_RANGE);
    expect(layout.oscMax).toBe(DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_OSC_RANGE);
  });

  it('osc range expands to cover extreme cci values', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      1000,
    ]);
    const layout = computeLineCciExtremeCrossLayout({ data, length: 14 });
    // cci spike will be 14/0.03 = 466.67 which exceeds default 300, so range expands
    expect(layout.oscMax).toBeGreaterThan(300);
  });

  it('cross markers include cyOsc + cyPrice', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      100,
    ]);
    const layout = computeLineCciExtremeCrossLayout({ data, length: 14 });
    expect(layout.crossMarkers).toHaveLength(2);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
    }
  });
});

describe('describeLineCciExtremeCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineCciExtremeCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(25).fill(50));
    const desc = describeLineCciExtremeCrossChart(data);
    expect(desc).toContain('CCI Extreme Cross chart');
    expect(desc).toContain('25 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('upperMild 100');
    expect(desc).toContain('upperExtreme 200');
  });
});

describe('ChartLineCciExtremeCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(25).fill(10));
    const { container, getByRole } = render(
      <ChartLineCciExtremeCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('CCI Extreme Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-cci-extreme-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('CCI Extreme Cross chart');
  });

  it('renders config badge with bands', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(<ChartLineCciExtremeCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cci-extreme-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('bands -200/-100/100/200');
  });

  it('renders legend toggles for price + cci', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(<ChartLineCciExtremeCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('cci');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(<ChartLineCciExtremeCross data={data} />);
    const cciButton = container.querySelector('[data-series-id="cci"]');
    expect(cciButton?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cciButton!);
    expect(cciButton?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(cciButton!);
    expect(cciButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(25).fill(10));
    const { container, rerender } = render(
      <ChartLineCciExtremeCross data={data} hiddenSeries={['cci']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-cci-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineCciExtremeCross data={data} hiddenSeries={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-cci-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(25).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineCciExtremeCross data={data} onSeriesToggle={(e) => events.push(e)} />,
    );
    fireEvent.click(container.querySelector('[data-series-id="cci"]')!);
    expect(events).toEqual([{ seriesId: 'cci', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(<ChartLineCciExtremeCross data={data} />);
    const cciButton = container.querySelector(
      '[data-series-id="cci"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(cciButton, { key: 'Enter' });
    expect(cciButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(cciButton, { key: ' ' });
    expect(cciButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineCciExtremeCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(
      <ChartLineCciExtremeCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(<ChartLineCciExtremeCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(<ChartLineCciExtremeCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-cci-extreme-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-cci-extreme-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders all 5 reference bands by default', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(<ChartLineCciExtremeCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-band-upper-extreme"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-band-upper-mild"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-band-mid"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-band-lower-mild"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-band-lower-extreme"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(
      <ChartLineCciExtremeCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(25).fill(10));
    const { container } = render(
      <ChartLineCciExtremeCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers in oscillator panel after spike (length=14)', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      100,
    ]);
    const { container } = render(
      <ChartLineCciExtremeCross data={data} length={14} />,
    );
    const mildMarkers = container.querySelectorAll(
      '[data-section="chart-line-cci-extreme-cross-cross-bullishMild"]',
    );
    const extremeMarkers = container.querySelectorAll(
      '[data-section="chart-line-cci-extreme-cross-cross-bullishExtreme"]',
    );
    expect(mildMarkers.length).toBe(1);
    expect(extremeMarkers.length).toBe(1);
  });

  it('renders overlay arrows in price panel', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      100,
    ]);
    const { container } = render(
      <ChartLineCciExtremeCross data={data} length={14} />,
    );
    const mildOverlay = container.querySelectorAll(
      '[data-section="chart-line-cci-extreme-cross-overlay-bullishMild"]',
    );
    const extremeOverlay = container.querySelectorAll(
      '[data-section="chart-line-cci-extreme-cross-overlay-bullishExtreme"]',
    );
    expect(mildOverlay.length).toBe(1);
    expect(extremeOverlay.length).toBe(1);
  });

  it('showCrosses=false hides cross markers', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      100,
    ]);
    const { container } = render(
      <ChartLineCciExtremeCross data={data} length={14} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      100,
    ]);
    const { container } = render(
      <ChartLineCciExtremeCross
        data={data}
        length={14}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-extreme-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      100,
    ]);
    const { container } = render(
      <ChartLineCciExtremeCross data={data} length={14} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-cci-extreme-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-upper-mild')).toBe('100');
    expect(region?.getAttribute('data-lower-mild')).toBe('-100');
    expect(region?.getAttribute('data-upper-extreme')).toBe('200');
    expect(region?.getAttribute('data-lower-extreme')).toBe('-200');
    expect(region?.getAttribute('data-cross-count')).toBe('2');
    expect(region?.getAttribute('data-bullish-mild-entry-count')).toBe('1');
    expect(region?.getAttribute('data-bullish-extreme-entry-count')).toBe('1');
  });

  it('defaults: upperMild=100, lowerMild=-100, upperExtreme=200, lowerExtreme=-200', () => {
    expect(DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_MILD).toBe(100);
    expect(DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_MILD).toBe(-100);
    expect(DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_UPPER_EXTREME).toBe(200);
    expect(DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LOWER_EXTREME).toBe(-200);
    expect(DEFAULT_CHART_LINE_CCI_EXTREME_CROSS_LENGTH).toBe(20);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(25).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCciExtremeCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cci-extreme-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 25 bars', () => {
    const data = mk(new Array(25).fill(10));
    const a = computeLineCciExtremeCrossLayout({ data });
    const b = computeLineCciExtremeCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cciPath).toBe(b.cciPath);
    expect(a.midY).toBe(b.midY);
    expect(a.upperMildY).toBe(b.upperMildY);
    expect(a.upperExtremeY).toBe(b.upperExtremeY);
    expect(a.lowerMildY).toBe(b.lowerMildY);
    expect(a.lowerExtremeY).toBe(b.lowerExtremeY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls after price spike', () => {
    const data = mk([
      ...new Array(14).fill(10),
      ...new Array(5).fill(10),
      100,
    ]);
    const a = computeLineCciExtremeCrossLayout({ data, length: 14 });
    const b = computeLineCciExtremeCrossLayout({ data, length: 14 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cciPath).toBe(b.cciPath);
    expect(a.run.cciValues).toEqual(b.run.cciValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
    expect(a.crossMarkers.map((m) => m.kind)).toEqual([
      'bullishMild',
      'bullishExtreme',
    ]);
  });
});
