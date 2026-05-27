import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineQstickDivergenceCross,
  DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_WINDOW,
  applyLineQstickDivergenceCrossQstick,
  classifyLineQstickDivergenceCrossRegime,
  computeLineQstickDivergenceCross,
  computeLineQstickDivergenceCrossLayout,
  describeLineQstickDivergenceCrossChart,
  detectLineQstickDivergenceCrossCrosses,
  getLineQstickDivergenceCrossFinitePoints,
  normalizeLineQstickDivergenceCrossLength,
  normalizeLineQstickDivergenceCrossWindow,
  runLineQstickDivergenceCross,
  type ChartLineQstickDivergenceCrossPoint,
  type ChartLineQstickDivergenceCrossRegime,
} from './chart-line-qstick-divergence-cross';

const L = 14;
const WIN = 5;
const WARMUP = L - 1; // 13 (first qstick-valid index)
const VALID_FROM = WARMUP + WIN; // 18

const buildConst = (
  n: number,
  k: number,
): ChartLineQstickDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    open: k,
    high: k,
    low: k,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineQstickDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    open: i - 0.5,
    high: i + 0.5,
    low: i - 0.5,
    close: i + 0.5,
  }));

const buildLinearDown = (n: number): ChartLineQstickDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    open: -i + 0.5,
    high: -i + 0.5,
    low: -i - 0.5,
    close: -i - 0.5,
  }));

describe('ChartLineQstickDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical QStick tuning', () => {
    expect(DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_QSTICK_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLineQstickDivergenceCrossFinitePoints', () => {
  it('filters finite x, OHLC', () => {
    const points = [
      { x: 0, open: 1, high: 2, low: 0, close: 1.5 },
      { x: NaN, open: 1, high: 2, low: 0, close: 1.5 },
      { x: 2, open: Infinity, high: 2, low: 0, close: 1.5 },
      { x: 3, open: 1, high: NaN, low: 0, close: 1.5 },
      { x: 4, open: 1, high: 2, low: Infinity, close: 1.5 },
      { x: 5, open: 1, high: 2, low: 0, close: NaN },
      { x: 6, open: 1, high: 2, low: 0, close: 1.5 },
    ];
    const result = getLineQstickDivergenceCrossFinitePoints(points);
    expect(result).toEqual([
      { x: 0, open: 1, high: 2, low: 0, close: 1.5 },
      { x: 6, open: 1, high: 2, low: 0, close: 1.5 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLineQstickDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineQstickDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineQstickDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const points = [
      null as unknown as ChartLineQstickDivergenceCrossPoint,
      { x: 1, open: 1, high: 2, low: 0, close: 1.5 },
      undefined as unknown as ChartLineQstickDivergenceCrossPoint,
    ];
    expect(getLineQstickDivergenceCrossFinitePoints(points)).toEqual([
      { x: 1, open: 1, high: 2, low: 0, close: 1.5 },
    ]);
  });
});

describe('normalizeLineQstickDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineQstickDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineQstickDivergenceCrossLength(1, 14)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineQstickDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineQstickDivergenceCrossLength(-3, 14)).toBe(14);
    expect(normalizeLineQstickDivergenceCrossLength(NaN, 14)).toBe(14);
    expect(normalizeLineQstickDivergenceCrossLength('big', 14)).toBe(14);
  });
});

describe('normalizeLineQstickDivergenceCrossWindow', () => {
  it('floors finite >=1 windows', () => {
    expect(normalizeLineQstickDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineQstickDivergenceCrossWindow(1, 5)).toBe(1);
  });

  it('falls back when invalid', () => {
    expect(normalizeLineQstickDivergenceCrossWindow(0, 5)).toBe(5);
    expect(normalizeLineQstickDivergenceCrossWindow(-1, 5)).toBe(5);
    expect(normalizeLineQstickDivergenceCrossWindow(NaN, 5)).toBe(5);
  });
});

describe('applyLineQstickDivergenceCrossQstick', () => {
  it('CONST OHLC=K returns qstick=0 from warmup onwards', () => {
    for (const K of [0, 1, 7, 100, 1234]) {
      const opens = Array.from({ length: 40 }, () => K);
      const closes = Array.from({ length: 40 }, () => K);
      const qstick = applyLineQstickDivergenceCrossQstick(opens, closes, L);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(qstick[i]).toBeNull();
      }
      for (let i = WARMUP; i < opens.length; i += 1) {
        expect(qstick[i]).toBe(0);
        expect(Object.is(qstick[i], 0)).toBe(true);
      }
    }
  });

  it('LINEAR UP (body=+1) saturates qstick at +1', () => {
    const n = 40;
    const opens = Array.from({ length: n }, (_, i) => i - 0.5);
    const closes = Array.from({ length: n }, (_, i) => i + 0.5);
    const qstick = applyLineQstickDivergenceCrossQstick(opens, closes, L);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(qstick[i]).toBeNull();
    }
    for (let i = WARMUP; i < n; i += 1) {
      expect(qstick[i] as number).toBeCloseTo(1, 9);
    }
  });

  it('LINEAR DOWN (body=-1) saturates qstick at -1', () => {
    const n = 40;
    const opens = Array.from({ length: n }, (_, i) => -i + 0.5);
    const closes = Array.from({ length: n }, (_, i) => -i - 0.5);
    const qstick = applyLineQstickDivergenceCrossQstick(opens, closes, L);
    for (let i = WARMUP; i < n; i += 1) {
      expect(qstick[i] as number).toBeCloseTo(-1, 9);
    }
  });

  it('returns all nulls when length < 1', () => {
    const qstick = applyLineQstickDivergenceCrossQstick(
      [1, 2, 3, 4],
      [1, 2, 3, 4],
      0,
    );
    expect(qstick.every((v) => v === null)).toBe(true);
  });

  it('returns empty when inputs empty', () => {
    expect(applyLineQstickDivergenceCrossQstick([], [], L)).toEqual([]);
  });

  it('returns nulls for series shorter than length', () => {
    const qstick = applyLineQstickDivergenceCrossQstick(
      [1, 2, 3],
      [1, 2, 3],
      L,
    );
    expect(qstick.every((v) => v === null)).toBe(true);
  });
});

describe('computeLineQstickDivergenceCross', () => {
  it('uses default length when not provided', () => {
    const data = buildConst(40, 50);
    const out = computeLineQstickDivergenceCross(data);
    expect(out.qstick[WARMUP]).toBe(0);
    expect(out.qstick[WARMUP - 1]).toBeNull();
  });

  it('returns empty qstick for empty data', () => {
    expect(computeLineQstickDivergenceCross([])).toEqual({ qstick: [] });
    expect(computeLineQstickDivergenceCross(null)).toEqual({ qstick: [] });
  });

  it('falls back to default on invalid length', () => {
    const out = computeLineQstickDivergenceCross(buildLinearUp(40), {
      length: 0,
    });
    expect(out.qstick[WARMUP] as number).toBeCloseTo(1, 9);
  });
});

describe('classifyLineQstickDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    qstickUp: boolean | null;
    expected: ChartLineQstickDivergenceCrossRegime;
  }> = [
    { priceUp: true, qstickUp: true, expected: 'aligned-bullish' },
    { priceUp: false, qstickUp: false, expected: 'aligned-bearish' },
    { priceUp: false, qstickUp: true, expected: 'divergent-bullish' },
    { priceUp: true, qstickUp: false, expected: 'divergent-bearish' },
    { priceUp: null, qstickUp: false, expected: 'none' },
    { priceUp: true, qstickUp: null, expected: 'none' },
    { priceUp: null, qstickUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp qstickUp=$qstickUp as $expected',
    ({ priceUp, qstickUp, expected }) => {
      expect(
        classifyLineQstickDivergenceCrossRegime(priceUp, qstickUp),
      ).toBe(expected);
    },
  );
});

describe('detectLineQstickDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      x: i,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
    }));
    const states: ChartLineQstickDivergenceCrossRegime[] = [
      'none',
      'none',
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineQstickDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(0);
  });

  it('detects a bullish cross from aligned-bearish to divergent-bullish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
    }));
    const states: ChartLineQstickDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineQstickDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('detects a bearish cross from aligned-bullish to divergent-bearish', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
    }));
    const states: ChartLineQstickDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineQstickDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not double-fire when state holds steady', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
    }));
    const states: ChartLineQstickDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineQstickDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });

  it('handles alternating crosses', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
    }));
    const states: ChartLineQstickDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
      'divergent-bearish',
      'divergent-bullish',
      'aligned-bullish',
    ];
    const out = detectLineQstickDivergenceCrossCrosses(series, states);
    expect(out.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
    ]);
  });
});

describe('runLineQstickDivergenceCross CONST OHLC=K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST OHLC=${K}: qstick=0, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(80, K);
      const run = runLineQstickDivergenceCross(data);
      expect(run.length).toBe(L);
      expect(run.divergenceWindow).toBe(WIN);
      expect(run.series).toHaveLength(80);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.qstickValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.qstickValues[i]).toBe(0);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 80; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.qstickUp).toBe(false);
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

describe('runLineQstickDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: qstick=+1 saturated, divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(80);
    const run = runLineQstickDivergenceCross(data);
    for (let i = 0; i < WARMUP; i += 1) {
      expect(run.qstickValues[i]).toBeNull();
    }
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.qstickValues[i] as number).toBeCloseTo(1, 9);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.qstickUp).toBe(false);
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

describe('runLineQstickDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: qstick=-1 saturated, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(80);
    const run = runLineQstickDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.qstickValues[i] as number).toBeCloseTo(-1, 9);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.qstickUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineQstickDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineQstickDivergenceCrossPoint[] = [
      { x: 2, open: 1, high: 1, low: 1, close: 1 },
      { x: 0, open: 1, high: 1, low: 1, close: 1 },
      { x: 1, open: 1, high: 1, low: 1, close: 1 },
    ];
    const run = runLineQstickDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when series too short for warmup+window', () => {
    const data = buildConst(15, 50);
    const run = runLineQstickDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineQstickDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.qstickValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom length / divergenceWindow', () => {
    const data = buildLinearUp(30);
    const run = runLineQstickDivergenceCross(data, {
      length: 3,
      divergenceWindow: 1,
    });
    expect(run.length).toBe(3);
    expect(run.divergenceWindow).toBe(1);
    const warm = 3 - 1;
    for (let i = warm; i < 30; i += 1) {
      expect(run.qstickValues[i] as number).toBeCloseTo(1, 9);
    }
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineQstickDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(80);
  });
});

describe('computeLineQstickDivergenceCrossLayout', () => {
  it('returns a non-empty SVG path for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineQstickDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toContain(' L ');
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.qstickPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineQstickDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.qstickPath).toBe('');
    expect(layout.priceDots).toEqual([]);
    expect(layout.crossMarkers).toEqual([]);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(80, 100);
    const layout = computeLineQstickDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('derives symmetric oscillator range from qstick span', () => {
    const layout = computeLineQstickDivergenceCrossLayout({
      data: buildLinearUp(80),
    });
    expect(layout.oscMin).toBeLessThan(0);
    expect(layout.oscMax).toBeGreaterThan(0);
    expect(layout.oscMax).toBeCloseTo(-layout.oscMin, 9);
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineQstickDivergenceCrossLayout({
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

describe('describeLineQstickDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineQstickDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, length, window', () => {
    const desc = describeLineQstickDivergenceCrossChart(
      buildLinearUp(50),
      {
        length: 14,
        divergenceWindow: 5,
      },
    );
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineQstickDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineQstickDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-length')).toBe(String(L));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders an empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineQstickDivergenceCross data={[]} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('renders the price and QStick paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineQstickDivergenceCross data={data} />,
    );
    const price = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-price-path"]',
    );
    const qstick = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-qstick-path"]',
    );
    expect(price).not.toBeNull();
    expect(qstick).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(80, 50);
    const { container } = render(
      <ChartLineQstickDivergenceCross data={data} />,
    );
    const zero = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-zero-line"]',
    );
    expect(zero).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineQstickDivergenceCross data={data} showLegend={false} />,
    );
    const legend = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-legend"]',
    );
    expect(legend).toBeNull();
  });

  it('respects showAxis=false and showGrid=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineQstickDivergenceCross
        data={data}
        showAxis={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-divergence-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-qstick-divergence-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineQstickDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('window 5');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('emits empty when data filters down to nothing', () => {
    const data = [
      { x: NaN, open: 1, high: 1, low: 1, close: 1 },
      { x: 1, open: 1, high: 1, low: NaN, close: 1 },
    ];
    const { container } = render(
      <ChartLineQstickDivergenceCross data={data} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-empty"]',
    );
    expect(empty).not.toBeNull();
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineQstickDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'QStick Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineQstickDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross"]',
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
      <ChartLineQstickDivergenceCross data={data} />,
    );
    const title = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-title"]',
    );
    const desc = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-aria-desc"]',
    );
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('QStick Divergence Cross chart');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineQstickDivergenceCross
        data={data}
        hiddenSeries={['qstick']}
      />,
    );
    const qstick = container.querySelector(
      '[data-section="chart-line-qstick-divergence-cross-qstick-path"]',
    );
    expect(qstick).toBeNull();
  });
});
