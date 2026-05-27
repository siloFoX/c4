import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineDpoDivergenceCross,
  DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WINDOW,
  applyLineDpoDivergenceCrossDpo,
  applyLineDpoDivergenceCrossSma,
  classifyLineDpoDivergenceCrossRegime,
  computeLineDpoDivergenceCross,
  computeLineDpoDivergenceCrossLayout,
  describeLineDpoDivergenceCrossChart,
  detectLineDpoDivergenceCrossCrosses,
  getLineDpoDivergenceCrossFinitePoints,
  lineDpoDivergenceCrossShift,
  normalizeLineDpoDivergenceCrossLength,
  normalizeLineDpoDivergenceCrossWindow,
  runLineDpoDivergenceCross,
  type ChartLineDpoDivergenceCrossPoint,
  type ChartLineDpoDivergenceCrossRegime,
} from './chart-line-dpo-divergence-cross';

const L = 20;
const SHIFT = 11; // floor(20/2)+1
const WIN = 5;
const WARMUP = L - 1; // 19 (first dpo-valid index, since shift=11 < L-1)
const VALID_FROM = WARMUP + WIN; // 24
const LAG = (L - 1) / 2; // 9.5
const UP_DPO = -(SHIFT - LAG); // -(11 - 9.5) = -1.5
const DOWN_DPO = SHIFT - LAG; // +1.5

const buildConst = (
  n: number,
  k: number,
): ChartLineDpoDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineDpoDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineDpoDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineDpoDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical DPO tuning', () => {
    expect(DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });

  it('canonical shift = floor(length / 2) + 1', () => {
    expect(lineDpoDivergenceCrossShift(20)).toBe(11);
    expect(lineDpoDivergenceCrossShift(14)).toBe(8);
    expect(lineDpoDivergenceCrossShift(7)).toBe(4);
  });
});

describe('getLineDpoDivergenceCrossFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    const result = getLineDpoDivergenceCrossFinitePoints(points);
    expect(result).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineDpoDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineDpoDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineDpoDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const points = [
      null as unknown as ChartLineDpoDivergenceCrossPoint,
      { x: 1, close: 1 },
      undefined as unknown as ChartLineDpoDivergenceCrossPoint,
    ];
    expect(getLineDpoDivergenceCrossFinitePoints(points)).toEqual([
      { x: 1, close: 1 },
    ]);
  });
});

describe('normalizeLineDpoDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineDpoDivergenceCrossLength(20.7, 20)).toBe(20);
    expect(normalizeLineDpoDivergenceCrossLength(1, 20)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineDpoDivergenceCrossLength(0, 20)).toBe(20);
    expect(normalizeLineDpoDivergenceCrossLength(-3, 20)).toBe(20);
    expect(normalizeLineDpoDivergenceCrossLength(NaN, 20)).toBe(20);
    expect(normalizeLineDpoDivergenceCrossLength('big', 20)).toBe(20);
  });
});

describe('normalizeLineDpoDivergenceCrossWindow', () => {
  it('floors finite >=1 windows', () => {
    expect(normalizeLineDpoDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineDpoDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineDpoDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineDpoDivergenceCrossWindow(-1, 5)).toBe(5);
    expect(normalizeLineDpoDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineDpoDivergenceCrossSma', () => {
  it('CONST closes return constant SMA', () => {
    const closes = Array.from({ length: 30 }, () => 50);
    const sma = applyLineDpoDivergenceCrossSma(closes, L);
    for (let i = 0; i < L - 1; i += 1) expect(sma[i]).toBeNull();
    for (let i = L - 1; i < closes.length; i += 1) expect(sma[i]).toBe(50);
  });

  it('LINEAR closes return i - (length-1)/2', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i);
    const sma = applyLineDpoDivergenceCrossSma(closes, L);
    for (let i = L - 1; i < closes.length; i += 1) {
      expect(sma[i] as number).toBeCloseTo(i - LAG, 9);
    }
  });

  it('returns all nulls when length < 1', () => {
    const sma = applyLineDpoDivergenceCrossSma([1, 2, 3], 0);
    expect(sma.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when series shorter than length', () => {
    const sma = applyLineDpoDivergenceCrossSma([1, 2, 3], L);
    expect(sma.every((v) => v === null)).toBe(true);
  });
});

describe('applyLineDpoDivergenceCrossDpo', () => {
  it('CONST close=K returns dpo=0 from warmup onwards', () => {
    for (const K of [0, 1, 7, 100, 1234]) {
      const closes = Array.from({ length: 60 }, () => K);
      const dpo = applyLineDpoDivergenceCrossDpo(closes, L);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(dpo[i]).toBeNull();
      }
      for (let i = WARMUP; i < closes.length; i += 1) {
        expect(dpo[i]).toBe(0);
        expect(Object.is(dpo[i], 0)).toBe(true);
      }
    }
  });

  it('LINEAR UP returns dpo = -(shift - lag) = -1.5 constant', () => {
    const closes = Array.from({ length: 60 }, (_, i) => i);
    const dpo = applyLineDpoDivergenceCrossDpo(closes, L);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(dpo[i]).toBeNull();
    }
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(dpo[i] as number).toBeCloseTo(UP_DPO, 9);
    }
  });

  it('LINEAR DOWN returns dpo = +1.5 constant', () => {
    const closes = Array.from({ length: 60 }, (_, i) => -i);
    const dpo = applyLineDpoDivergenceCrossDpo(closes, L);
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(dpo[i] as number).toBeCloseTo(DOWN_DPO, 9);
    }
  });

  it('returns all nulls when length < 1', () => {
    const dpo = applyLineDpoDivergenceCrossDpo([1, 2, 3, 4], 0);
    expect(dpo.every((v) => v === null)).toBe(true);
  });

  it('returns empty when closes empty', () => {
    expect(applyLineDpoDivergenceCrossDpo([], L)).toEqual([]);
  });

  it('returns nulls for series shorter than length', () => {
    const dpo = applyLineDpoDivergenceCrossDpo([1, 2, 3], L);
    expect(dpo.every((v) => v === null)).toBe(true);
  });
});

describe('computeLineDpoDivergenceCross', () => {
  it('uses default length when not provided', () => {
    const data = buildConst(60, 50);
    const out = computeLineDpoDivergenceCross(data);
    expect(out.dpo[WARMUP]).toBe(0);
    expect(out.dpo[WARMUP - 1]).toBeNull();
  });

  it('returns empty dpo for empty data', () => {
    expect(computeLineDpoDivergenceCross([])).toEqual({ dpo: [] });
    expect(computeLineDpoDivergenceCross(null)).toEqual({ dpo: [] });
  });

  it('falls back to default on invalid length', () => {
    const out = computeLineDpoDivergenceCross(buildLinearUp(60), {
      length: 0,
    });
    expect(out.dpo[WARMUP] as number).toBeCloseTo(UP_DPO, 9);
  });
});

describe('classifyLineDpoDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    dpoUp: boolean | null;
    expected: ChartLineDpoDivergenceCrossRegime;
  }> = [
    { priceUp: true, dpoUp: true, expected: 'aligned-bullish' },
    { priceUp: false, dpoUp: false, expected: 'aligned-bearish' },
    { priceUp: false, dpoUp: true, expected: 'divergent-bullish' },
    { priceUp: true, dpoUp: false, expected: 'divergent-bearish' },
    { priceUp: null, dpoUp: false, expected: 'none' },
    { priceUp: true, dpoUp: null, expected: 'none' },
    { priceUp: null, dpoUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp dpoUp=$dpoUp as $expected',
    ({ priceUp, dpoUp, expected }) => {
      expect(classifyLineDpoDivergenceCrossRegime(priceUp, dpoUp)).toBe(
        expected,
      );
    },
  );
});

describe('detectLineDpoDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineDpoDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineDpoDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(0);
  });

  it('detects a bullish cross from aligned-bearish to divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineDpoDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineDpoDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects a bearish cross from aligned-bullish to divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineDpoDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineDpoDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineDpoDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineDpoDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });

  it('handles alternating crosses', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineDpoDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const out = detectLineDpoDivergenceCrossCrosses(series, states);
    expect(out.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
    ]);
  });
});

describe('runLineDpoDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: dpo=0, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(80, K);
      const run = runLineDpoDivergenceCross(data);
      expect(run.length).toBe(L);
      expect(run.shift).toBe(SHIFT);
      expect(run.divergenceWindow).toBe(WIN);
      expect(run.series).toHaveLength(80);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.dpoValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.dpoValues[i]).toBe(0);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 80; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.dpoUp).toBe(false);
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

describe('runLineDpoDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: dpo=-1.5 constant, divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(80);
    const run = runLineDpoDivergenceCross(data);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(run.dpoValues[i]).toBeNull();
    }
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.dpoValues[i] as number).toBeCloseTo(UP_DPO, 9);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.dpoUp).toBe(false);
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

describe('runLineDpoDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: dpo=+1.5 constant, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(80);
    const run = runLineDpoDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.dpoValues[i] as number).toBeCloseTo(DOWN_DPO, 9);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.dpoUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineDpoDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineDpoDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineDpoDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when series too short for warmup+window', () => {
    const data = buildConst(20, 50);
    const run = runLineDpoDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineDpoDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.dpoValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom length / divergenceWindow', () => {
    const data = buildLinearUp(40);
    const run = runLineDpoDivergenceCross(data, {
      length: 7,
      divergenceWindow: 1,
    });
    expect(run.length).toBe(7);
    expect(run.shift).toBe(4);
    expect(run.divergenceWindow).toBe(1);
    const warm = 7 - 1;
    for (let i = warm; i < 40; i += 1) {
      expect(run.dpoValues[i]).not.toBeNull();
    }
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineDpoDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(80);
  });
});

describe('computeLineDpoDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineDpoDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toContain(' L ');
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.dpoPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineDpoDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.dpoPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(80, 100);
    const layout = computeLineDpoDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('derives symmetric oscillator range from dpo span', () => {
    const layout = computeLineDpoDivergenceCrossLayout({
      data: buildLinearUp(80),
    });
    expect(layout.oscMin).toBeLessThan(0);
    expect(layout.oscMax).toBeGreaterThan(0);
    expect(layout.oscMax).toBeCloseTo(-layout.oscMin, 9);
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineDpoDivergenceCrossLayout({
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

describe('describeLineDpoDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineDpoDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, length, window', () => {
    const desc = describeLineDpoDivergenceCrossChart(buildLinearUp(50), {
      length: 20,
      divergenceWindow: 5,
    });
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineDpoDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-length')).toBe(String(L));
    expect(root?.getAttribute('data-shift')).toBe(String(SHIFT));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(<ChartLineDpoDivergenceCross data={[]} />);
    const empty = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and DPO paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} />,
    );
    const price = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-price-path"]',
    );
    const dpo = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-dpo-path"]',
    );
    expect(price).not.toBeNull();
    expect(dpo).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(80, 50);
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} />,
    );
    const zero = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineDpoDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('shift 11');
    expect(badge?.textContent).toContain('window 5');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('emits empty when data filters down to nothing', () => {
    const data = [
      { x: NaN, close: 1 },
      { x: 1, close: NaN },
    ];
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'DPO Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross"]',
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
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} />,
    );
    const title = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('DPO Divergence Cross chart');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineDpoDivergenceCross data={data} hiddenSeries={['dpo']} />,
    );
    const dpo = container.querySelector(
      '[data-section="chart-line-dpo-divergence-cross-dpo-path"]',
    );
    expect(dpo).toBeNull();
  });
});
