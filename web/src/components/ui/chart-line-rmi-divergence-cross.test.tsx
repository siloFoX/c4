import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineRmiDivergenceCross,
  DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_MOMENTUM_LENGTH,
  DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WINDOW,
  applyLineRmiDivergenceCrossRmi,
  applyLineRmiDivergenceCrossSmaSeededRma,
  classifyLineRmiDivergenceCrossRegime,
  computeLineRmiDivergenceCross,
  computeLineRmiDivergenceCrossLayout,
  describeLineRmiDivergenceCrossChart,
  detectLineRmiDivergenceCrossCrosses,
  getLineRmiDivergenceCrossFinitePoints,
  normalizeLineRmiDivergenceCrossLength,
  normalizeLineRmiDivergenceCrossWindow,
  runLineRmiDivergenceCross,
  type ChartLineRmiDivergenceCrossPoint,
  type ChartLineRmiDivergenceCrossRegime,
} from './chart-line-rmi-divergence-cross';

const L = 14;
const MOM = 4;
const WIN = 5;
const WARMUP = MOM + L - 1; // 17
const VALID_FROM = WARMUP + WIN; // 22

const buildConst = (
  n: number,
  k: number,
): ChartLineRmiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineRmiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineRmiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineRmiDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical RMI tuning', () => {
    expect(DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_MOMENTUM_LENGTH).toBe(4);
    expect(DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLineRmiDivergenceCrossFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    const result = getLineRmiDivergenceCrossFinitePoints(points);
    expect(result).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineRmiDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineRmiDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineRmiDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const points = [
      null as unknown as ChartLineRmiDivergenceCrossPoint,
      { x: 1, close: 1 },
      undefined as unknown as ChartLineRmiDivergenceCrossPoint,
    ];
    expect(getLineRmiDivergenceCrossFinitePoints(points)).toEqual([
      { x: 1, close: 1 },
    ]);
  });
});

describe('normalizeLineRmiDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineRmiDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineRmiDivergenceCrossLength(1, 14)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineRmiDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineRmiDivergenceCrossLength(-3, 14)).toBe(14);
    expect(normalizeLineRmiDivergenceCrossLength(NaN, 14)).toBe(14);
    expect(normalizeLineRmiDivergenceCrossLength('big', 14)).toBe(14);
  });
});

describe('normalizeLineRmiDivergenceCrossWindow', () => {
  it('floors finite >=1 windows', () => {
    expect(normalizeLineRmiDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineRmiDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineRmiDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineRmiDivergenceCrossWindow(-1, 5)).toBe(5);
    expect(normalizeLineRmiDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineRmiDivergenceCrossSmaSeededRma', () => {
  it('seeds with SMA and recurs (Wilder alpha = 1/length)', () => {
    const out = applyLineRmiDivergenceCrossSmaSeededRma(
      [null, 2, 2, 2, 14, 14],
      3,
    );
    expect(out[3]).toBe(2);
    expect(out[4]).toBeCloseTo(2 * (1 - 1 / 3) + 14 * (1 / 3), 9);
  });

  it('returns empty when input empty', () => {
    expect(applyLineRmiDivergenceCrossSmaSeededRma([], 5)).toEqual([]);
  });

  it('returns all nulls when length < 1', () => {
    const out = applyLineRmiDivergenceCrossSmaSeededRma([1, 2, 3], 0);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when no valid values', () => {
    const out = applyLineRmiDivergenceCrossSmaSeededRma(
      [null, null, null],
      2,
    );
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('stops at gap after seed', () => {
    const out = applyLineRmiDivergenceCrossSmaSeededRma(
      [1, 1, 1, null, 1, 1],
      3,
    );
    expect(out[2]).toBe(1);
    expect(out[3]).toBeNull();
  });
});

describe('applyLineRmiDivergenceCrossRmi', () => {
  it('CONST close=K returns degenerate 50', () => {
    for (const K of [0, 1, 7, 100, 1234]) {
      const closes = Array.from({ length: 60 }, () => K);
      const rmi = applyLineRmiDivergenceCrossRmi(closes, L, MOM);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(rmi[i]).toBeNull();
      }
      for (let i = WARMUP; i < closes.length; i += 1) {
        expect(rmi[i]).toBe(50);
      }
    }
  });

  it('LINEAR UP saturates RMI at 100', () => {
    const closes = Array.from({ length: 60 }, (_, i) => i);
    const rmi = applyLineRmiDivergenceCrossRmi(closes, L, MOM);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(rmi[i]).toBeNull();
    }
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(rmi[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('LINEAR DOWN saturates RMI at 0', () => {
    const closes = Array.from({ length: 60 }, (_, i) => -i);
    const rmi = applyLineRmiDivergenceCrossRmi(closes, L, MOM);
    for (let i = WARMUP; i < closes.length; i += 1) {
      expect(rmi[i]).toBe(0);
    }
  });

  it('returns all nulls when length < 1', () => {
    const rmi = applyLineRmiDivergenceCrossRmi([1, 2, 3, 4], 0, MOM);
    expect(rmi.every((v) => v === null)).toBe(true);
  });

  it('returns all nulls when momentumLength < 1', () => {
    const rmi = applyLineRmiDivergenceCrossRmi([1, 2, 3, 4], L, 0);
    expect(rmi.every((v) => v === null)).toBe(true);
  });

  it('returns empty when closes empty', () => {
    expect(applyLineRmiDivergenceCrossRmi([], L, MOM)).toEqual([]);
  });

  it('stays in 0..100 bounds for mixed input', () => {
    const closes = [10, 11, 9, 10, 12, 11, 13, 14, 12, 15];
    const closesExt = [...closes];
    for (let i = closes.length; i < 60; i += 1) {
      closesExt.push(closesExt[i - 1]! + ((i % 3) - 1));
    }
    const rmi = applyLineRmiDivergenceCrossRmi(closesExt, L, MOM);
    for (let i = WARMUP; i < closesExt.length; i += 1) {
      const v = rmi[i];
      expect(v).not.toBeNull();
      expect(v as number).toBeGreaterThanOrEqual(0);
      expect(v as number).toBeLessThanOrEqual(100);
    }
  });
});

describe('computeLineRmiDivergenceCross', () => {
  it('uses defaults when not provided', () => {
    const data = buildConst(60, 50);
    const out = computeLineRmiDivergenceCross(data);
    expect(out.rmi[WARMUP]).toBe(50);
    expect(out.rmi[WARMUP - 1]).toBeNull();
  });

  it('returns empty rmi for empty data', () => {
    expect(computeLineRmiDivergenceCross([])).toEqual({ rmi: [] });
    expect(computeLineRmiDivergenceCross(null)).toEqual({ rmi: [] });
  });

  it('falls back to defaults on invalid inputs', () => {
    const out = computeLineRmiDivergenceCross(buildLinearUp(60), {
      length: 0,
      momentumLength: 0,
    });
    expect(out.rmi[WARMUP] as number).toBeCloseTo(100, 9);
  });
});

describe('classifyLineRmiDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    rmiUp: boolean | null;
    expected: ChartLineRmiDivergenceCrossRegime;
  }> = [
    { priceUp: true, rmiUp: true, expected: 'aligned-bullish' },
    { priceUp: false, rmiUp: false, expected: 'aligned-bearish' },
    { priceUp: false, rmiUp: true, expected: 'divergent-bullish' },
    { priceUp: true, rmiUp: false, expected: 'divergent-bearish' },
    { priceUp: null, rmiUp: false, expected: 'none' },
    { priceUp: true, rmiUp: null, expected: 'none' },
    { priceUp: null, rmiUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp rmiUp=$rmiUp as $expected',
    ({ priceUp, rmiUp, expected }) => {
      expect(classifyLineRmiDivergenceCrossRegime(priceUp, rmiUp)).toBe(
        expected,
      );
    },
  );
});

describe('detectLineRmiDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineRmiDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineRmiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(0);
  });

  it('detects bullish cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineRmiDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineRmiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects bearish cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineRmiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineRmiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineRmiDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineRmiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });

  it('handles alternating crosses', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineRmiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const out = detectLineRmiDivergenceCrossCrosses(series, states);
    expect(out.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
    ]);
  });
});

describe('runLineRmiDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: rmi=50, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(60, K);
      const run = runLineRmiDivergenceCross(data);
      expect(run.length).toBe(L);
      expect(run.momentumLength).toBe(MOM);
      expect(run.divergenceWindow).toBe(WIN);
      expect(run.series).toHaveLength(60);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.rmiValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.rmiValues[i]).toBe(50);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 60; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.rmiUp).toBe(false);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.bullishCrossCount).toBe(0);
      expect(run.bearishCrossCount).toBe(0);
      expect(run.noneCount).toBe(VALID_FROM);
      expect(run.alignedBearishCount).toBe(60 - VALID_FROM);
      expect(run.alignedBullishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineRmiDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: rmi=100 saturated, divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(60);
    const run = runLineRmiDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.rmiValues[i] as number).toBeCloseTo(100, 9);
    }
    for (let i = VALID_FROM; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.rmiUp).toBe(false);
    }
    expect(run.divergentBearishCount).toBe(60 - VALID_FROM);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.noneCount).toBe(VALID_FROM);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineRmiDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: rmi=0 saturated, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(60);
    const run = runLineRmiDivergenceCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.rmiValues[i]).toBe(0);
    }
    for (let i = VALID_FROM; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.rmiUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(60 - VALID_FROM);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineRmiDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineRmiDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineRmiDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when series too short', () => {
    const data = buildConst(15, 50);
    const run = runLineRmiDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineRmiDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.rmiValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom length / momentumLength / divergenceWindow', () => {
    const data = buildLinearUp(40);
    const run = runLineRmiDivergenceCross(data, {
      length: 3,
      momentumLength: 2,
      divergenceWindow: 1,
    });
    expect(run.length).toBe(3);
    expect(run.momentumLength).toBe(2);
    expect(run.divergenceWindow).toBe(1);
    const warm = 2 + 3 - 1;
    for (let i = warm; i < 40; i += 1) {
      expect(run.rmiValues[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineRmiDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(60);
  });
});

describe('computeLineRmiDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(60, 50);
    const layout = computeLineRmiDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toContain(' L ');
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.rmiPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineRmiDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.rmiPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(60, 100);
    const layout = computeLineRmiDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('uses fixed 0..100 oscillator range', () => {
    const layout = computeLineRmiDivergenceCrossLayout({
      data: buildConst(60, 50),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
    expect(layout.zeroY).toBe(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineRmiDivergenceCrossLayout({
      data: buildLinearUp(40),
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

describe('describeLineRmiDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineRmiDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, length, momentum, window', () => {
    const desc = describeLineRmiDivergenceCrossChart(buildLinearUp(50));
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('momentumLength 4');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineRmiDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-length')).toBe(String(L));
    expect(root?.getAttribute('data-momentum-length')).toBe(String(MOM));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(<ChartLineRmiDivergenceCross data={[]} />);
    const empty = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and RMI paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} />,
    );
    const price = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-price-path"]',
    );
    const rmi = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-rmi-path"]',
    );
    expect(price).not.toBeNull();
    expect(rmi).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(60, 50);
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} />,
    );
    const zero = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRmiDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('mom 4');
    expect(badge?.textContent).toContain('window 5');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('emits empty when data filters down to nothing', () => {
    const data = [
      { x: NaN, close: 1 },
      { x: 1, close: NaN },
    ];
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'RMI Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-aligned-bearish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bullish-count')).toBe('0');
    expect(root?.getAttribute('data-divergent-bearish-count')).toBe(
      String(60 - VALID_FROM),
    );
    expect(root?.getAttribute('data-bullish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-bearish-cross-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('renders the title and aria description elements', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} />,
    );
    const title = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('RMI Divergence Cross chart');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineRmiDivergenceCross data={data} hiddenSeries={['rmi']} />,
    );
    const rmi = container.querySelector(
      '[data-section="chart-line-rmi-divergence-cross-rmi-path"]',
    );
    expect(rmi).toBeNull();
  });
});
