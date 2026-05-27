import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineTsiDivergenceCross,
  DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_LENGTH_R,
  DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_LENGTH_S,
  DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_WINDOW,
  applyLineTsiDivergenceCrossSmaSeededEma,
  applyLineTsiDivergenceCrossTsi,
  classifyLineTsiDivergenceCrossRegime,
  computeLineTsiDivergenceCross,
  computeLineTsiDivergenceCrossLayout,
  describeLineTsiDivergenceCrossChart,
  detectLineTsiDivergenceCrossCrosses,
  getLineTsiDivergenceCrossFinitePoints,
  normalizeLineTsiDivergenceCrossLength,
  normalizeLineTsiDivergenceCrossWindow,
  runLineTsiDivergenceCross,
  type ChartLineTsiDivergenceCrossPoint,
  type ChartLineTsiDivergenceCrossRegime,
} from './chart-line-tsi-divergence-cross';

const LR = 25;
const LS = 13;
const WIN = 5;
const WARMUP = LR + LS - 1; // 37, index from which TSI is valid
const VALID_FROM = WARMUP + WIN; // 42

const buildConst = (n: number, k: number): ChartLineTsiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineTsiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineTsiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineTsiDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical TSI tuning', () => {
    expect(DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_LENGTH_R).toBe(25);
    expect(DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_LENGTH_S).toBe(13);
    expect(DEFAULT_CHART_LINE_TSI_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLineTsiDivergenceCrossFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    const result = getLineTsiDivergenceCrossFinitePoints(points);
    expect(result).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineTsiDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineTsiDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineTsiDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const points = [
      null as unknown as ChartLineTsiDivergenceCrossPoint,
      { x: 1, close: 1 },
      undefined as unknown as ChartLineTsiDivergenceCrossPoint,
    ];
    expect(getLineTsiDivergenceCrossFinitePoints(points)).toEqual([
      { x: 1, close: 1 },
    ]);
  });
});

describe('normalizeLineTsiDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineTsiDivergenceCrossLength(13.7, 25)).toBe(13);
    expect(normalizeLineTsiDivergenceCrossLength(1, 25)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineTsiDivergenceCrossLength(0, 25)).toBe(25);
    expect(normalizeLineTsiDivergenceCrossLength(-3, 25)).toBe(25);
    expect(normalizeLineTsiDivergenceCrossLength(NaN, 25)).toBe(25);
    expect(normalizeLineTsiDivergenceCrossLength('big', 25)).toBe(25);
  });
});

describe('normalizeLineTsiDivergenceCrossWindow', () => {
  it('floors finite >=1 windows', () => {
    expect(normalizeLineTsiDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineTsiDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineTsiDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineTsiDivergenceCrossWindow(-1, 5)).toBe(5);
    expect(normalizeLineTsiDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineTsiDivergenceCrossSmaSeededEma', () => {
  it('seeds with SMA and recurs', () => {
    const values: Array<number | null> = [null, 1, 1, 1, 1, 1, 1];
    const out = applyLineTsiDivergenceCrossSmaSeededEma(values, 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
    expect(out[3]).toBe(1);
    expect(out[4]).toBe(1);
    expect(out[5]).toBe(1);
    expect(out[6]).toBe(1);
  });

  it('returns all nulls when input empty', () => {
    expect(applyLineTsiDivergenceCrossSmaSeededEma([], 5)).toEqual([]);
  });

  it('returns all nulls when length < 1', () => {
    const out = applyLineTsiDivergenceCrossSmaSeededEma([1, 2, 3], 0);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when no valid values', () => {
    const out = applyLineTsiDivergenceCrossSmaSeededEma(
      [null, null, null],
      2,
    );
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when seedEnd >= length', () => {
    const out = applyLineTsiDivergenceCrossSmaSeededEma([1, 2], 5);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('stops at gap after seed', () => {
    const out = applyLineTsiDivergenceCrossSmaSeededEma(
      [1, 1, 1, null, 1, 1],
      3,
    );
    expect(out[2]).toBe(1);
    expect(out[3]).toBeNull();
    expect(out[4]).toBeNull();
    expect(out[5]).toBeNull();
  });

  it('returns all nulls when gap during seed', () => {
    const out = applyLineTsiDivergenceCrossSmaSeededEma(
      [1, null, 1, 1, 1],
      3,
    );
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('converts -0 to +0', () => {
    const out = applyLineTsiDivergenceCrossSmaSeededEma([-0, -0, -0], 3);
    expect(Object.is(out[2], 0)).toBe(true);
  });
});

describe('applyLineTsiDivergenceCrossTsi', () => {
  it('CONST close=K returns degenerate 0 from warmup onwards', () => {
    for (const K of [0, 1, 7, 100, 1234]) {
      const closes = Array.from({ length: 60 }, () => K);
      const tsi = applyLineTsiDivergenceCrossTsi(closes, LR, LS);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(tsi[i]).toBeNull();
      }
      for (let i = WARMUP; i < closes.length; i += 1) {
        expect(tsi[i]).toBe(0);
        expect(Object.is(tsi[i], 0)).toBe(true);
      }
    }
  });

  it('LINEAR UP saturates TSI at +100', () => {
    const closes = Array.from({ length: 60 }, (_, i) => i);
    const tsi = applyLineTsiDivergenceCrossTsi(closes, LR, LS);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(tsi[i]).toBeNull();
    }
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(tsi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN saturates TSI at -100', () => {
    const closes = Array.from({ length: 60 }, (_, i) => -i);
    const tsi = applyLineTsiDivergenceCrossTsi(closes, LR, LS);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(tsi[i]).toBeNull();
    }
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(tsi[i]).toBe(-100);
    }
  });

  it('returns all nulls when length < 1', () => {
    const tsi = applyLineTsiDivergenceCrossTsi([1, 2, 3, 4], 0, 1);
    expect(tsi.every((v) => v === null)).toBe(true);
    const tsi2 = applyLineTsiDivergenceCrossTsi([1, 2, 3, 4], 1, 0);
    expect(tsi2.every((v) => v === null)).toBe(true);
  });

  it('returns empty when closes empty', () => {
    expect(applyLineTsiDivergenceCrossTsi([], LR, LS)).toEqual([]);
  });

  it('returns single null for length 1 series', () => {
    expect(applyLineTsiDivergenceCrossTsi([5], LR, LS)).toEqual([null]);
  });

  it('stays in -100..100 bounds for mixed input', () => {
    const closes = [10, 11, 9, 10, 12, 11, 13, 14, 12, 15];
    const closesExt = [...closes];
    for (let i = closes.length; i < 60; i += 1) {
      closesExt.push(closesExt[i - 1]! + ((i % 3) - 1));
    }
    const tsi = applyLineTsiDivergenceCrossTsi(closesExt, LR, LS);
    for (let i = WARMUP; i < closesExt.length; i += 1) {
      const v = tsi[i];
      expect(v).not.toBeNull();
      expect(v as number).toBeGreaterThanOrEqual(-100);
      expect(v as number).toBeLessThanOrEqual(100);
    }
  });
});

describe('computeLineTsiDivergenceCross', () => {
  it('uses default lengths when not provided', () => {
    const data = buildConst(60, 50);
    const out = computeLineTsiDivergenceCross(data);
    expect(out.tsi[WARMUP]).toBe(0);
    expect(out.tsi[WARMUP - 1]).toBeNull();
  });

  it('returns empty tsi for empty data', () => {
    expect(computeLineTsiDivergenceCross([])).toEqual({ tsi: [] });
    expect(computeLineTsiDivergenceCross(null)).toEqual({ tsi: [] });
  });

  it('falls back to defaults on invalid options', () => {
    const out = computeLineTsiDivergenceCross(buildLinearUp(60), {
      lengthR: 0,
      lengthS: -1,
    });
    expect(out.tsi[WARMUP]).toBe(100);
  });
});

describe('classifyLineTsiDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    tsiUp: boolean | null;
    expected: ChartLineTsiDivergenceCrossRegime;
  }> = [
    { priceUp: true, tsiUp: true, expected: 'aligned-bullish' },
    { priceUp: false, tsiUp: false, expected: 'aligned-bearish' },
    { priceUp: false, tsiUp: true, expected: 'divergent-bullish' },
    { priceUp: true, tsiUp: false, expected: 'divergent-bearish' },
    { priceUp: null, tsiUp: false, expected: 'none' },
    { priceUp: true, tsiUp: null, expected: 'none' },
    { priceUp: null, tsiUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp tsiUp=$tsiUp as $expected',
    ({ priceUp, tsiUp, expected }) => {
      expect(classifyLineTsiDivergenceCrossRegime(priceUp, tsiUp)).toBe(
        expected,
      );
    },
  );
});

describe('detectLineTsiDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTsiDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineTsiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(0);
  });

  it('detects a bullish cross from aligned-bearish to divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTsiDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineTsiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects a bearish cross from aligned-bullish to divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTsiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineTsiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTsiDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineTsiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });

  it('handles alternating crosses', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineTsiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const out = detectLineTsiDivergenceCrossCrosses(series, states);
    expect(out.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
    ]);
  });
});

describe('runLineTsiDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: tsi=0, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(80, K);
      const run = runLineTsiDivergenceCross(data);
      expect(run.lengthR).toBe(LR);
      expect(run.lengthS).toBe(LS);
      expect(run.divergenceWindow).toBe(WIN);
      expect(run.series).toHaveLength(80);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.tsiValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.tsiValues[i]).toBe(0);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 80; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.tsiUp).toBe(false);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.bullishCrossCount).toBe(0);
      expect(run.bearishCrossCount).toBe(0);
      expect(run.noneCount).toBe(VALID_FROM);
      expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
      expect(run.alignedBullishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineTsiDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: tsi=100 saturated, divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(80);
    const run = runLineTsiDivergenceCross(data);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(run.tsiValues[i]).toBeNull();
    }
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.tsiValues[i]).toBe(100);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.tsiUp).toBe(false);
    }
    expect(run.divergentBearishCount).toBe(80 - VALID_FROM);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.noneCount).toBe(VALID_FROM);
    expect(run.crosses).toHaveLength(0);
    expect(run.ok).toBe(true);
  });
});

describe('runLineTsiDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: tsi=-100 saturated, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(80);
    const run = runLineTsiDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.tsiValues[i]).toBe(-100);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.tsiUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineTsiDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineTsiDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineTsiDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when series too short for warmup+window', () => {
    const data = buildConst(20, 50);
    const run = runLineTsiDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineTsiDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.tsiValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom lengthR / lengthS / divergenceWindow', () => {
    const data = buildLinearUp(50);
    const run = runLineTsiDivergenceCross(data, {
      lengthR: 3,
      lengthS: 2,
      divergenceWindow: 1,
    });
    expect(run.lengthR).toBe(3);
    expect(run.lengthS).toBe(2);
    expect(run.divergenceWindow).toBe(1);
    const warm = 3 + 2 - 1;
    for (let i = warm; i < 50; i += 1) {
      expect(run.tsiValues[i]).toBe(100);
    }
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineTsiDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(80);
  });
});

describe('computeLineTsiDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineTsiDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toContain(' L ');
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.tsiPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineTsiDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.tsiPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(80, 100);
    const layout = computeLineTsiDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('uses fixed -100..100 oscillator range', () => {
    const layout = computeLineTsiDivergenceCrossLayout({
      data: buildConst(80, 50),
    });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(100);
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineTsiDivergenceCrossLayout({
      data: buildLinearUp(60),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
    expect(layout.padding).toBe(32);
    expect(layout.panelGap).toBe(8);
  });
});

describe('describeLineTsiDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineTsiDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, both lengths, window', () => {
    const desc = describeLineTsiDivergenceCrossChart(buildLinearUp(50), {
      lengthR: 25,
      lengthS: 13,
      divergenceWindow: 5,
    });
    expect(desc).toContain('50 bars');
    expect(desc).toContain('lengthR 25');
    expect(desc).toContain('lengthS 13');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineTsiDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTsiDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-length-r')).toBe(String(LR));
    expect(root?.getAttribute('data-length-s')).toBe(String(LS));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(<ChartLineTsiDivergenceCross data={[]} />);
    const empty = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and TSI paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTsiDivergenceCross data={data} />);
    const price = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-price-path"]',
    );
    const tsi = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-tsi-path"]',
    );
    expect(price).not.toBeNull();
    expect(tsi).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(80, 50);
    const { container } = render(<ChartLineTsiDivergenceCross data={data} />);
    const zero = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTsiDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTsiDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-tsi-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTsiDivergenceCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('lengthR 25');
    expect(badge?.textContent).toContain('lengthS 13');
    expect(badge?.textContent).toContain('window 5');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('emits empty when data filters down to nothing', () => {
    const data = [
      { x: NaN, close: 1 },
      { x: 1, close: NaN },
    ];
    const { container } = render(<ChartLineTsiDivergenceCross data={data} />);
    const empty = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTsiDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'TSI Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTsiDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-aligned-bearish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bearish-count')).toBe(
      String(80 - VALID_FROM),
    );
    expect(root?.getAttribute('data-bullish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-bearish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('renders the title and aria description elements', () => {
    const data = buildLinearUp(80);
    const { container } = render(<ChartLineTsiDivergenceCross data={data} />);
    const title = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('TSI Divergence Cross chart');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineTsiDivergenceCross data={data} hiddenSeries={['tsi']} />,
    );
    const tsi = container.querySelector(
      '[data-section="chart-line-tsi-divergence-cross-tsi-path"]',
    );
    expect(tsi).toBeNull();
  });
});
