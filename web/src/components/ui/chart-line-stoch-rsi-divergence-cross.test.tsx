import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineStochRsiDivergenceCross,
  DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_STOCH_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_WINDOW,
  applyLineStochRsiDivergenceCrossRsi,
  applyLineStochRsiDivergenceCrossSmaSeededRma,
  applyLineStochRsiDivergenceCrossStochastic,
  classifyLineStochRsiDivergenceCrossRegime,
  computeLineStochRsiDivergenceCross,
  computeLineStochRsiDivergenceCrossLayout,
  describeLineStochRsiDivergenceCrossChart,
  detectLineStochRsiDivergenceCrossCrosses,
  getLineStochRsiDivergenceCrossFinitePoints,
  normalizeLineStochRsiDivergenceCrossLength,
  normalizeLineStochRsiDivergenceCrossWindow,
  runLineStochRsiDivergenceCross,
  type ChartLineStochRsiDivergenceCrossPoint,
  type ChartLineStochRsiDivergenceCrossRegime,
} from './chart-line-stoch-rsi-divergence-cross';

const L = 14;
const STOCH_L = 14;
const WIN = 5;
const WARMUP = L + STOCH_L - 1; // 27
const VALID_FROM = WARMUP + WIN; // 32

const buildConst = (
  n: number,
  k: number,
): ChartLineStochRsiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (
  n: number,
): ChartLineStochRsiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (
  n: number,
): ChartLineStochRsiDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineStochRsiDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical stoch RSI tuning', () => {
    expect(DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_STOCH_LENGTH).toBe(
      14,
    );
    expect(DEFAULT_CHART_LINE_STOCH_RSI_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLineStochRsiDivergenceCrossFinitePoints', () => {
  it('filters finite x and close', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 2 },
      { x: 2, close: Infinity },
      { x: 3, close: 4 },
    ];
    expect(getLineStochRsiDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 3, close: 4 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineStochRsiDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineStochRsiDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineStochRsiDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalize helpers', () => {
  it('length: floors finite >=1', () => {
    expect(normalizeLineStochRsiDivergenceCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineStochRsiDivergenceCrossLength(0, 14)).toBe(14);
    expect(normalizeLineStochRsiDivergenceCrossLength(NaN, 14)).toBe(14);
  });

  it('window: floors finite >=1', () => {
    expect(normalizeLineStochRsiDivergenceCrossWindow(5.9, 5)).toBe(5);
    expect(normalizeLineStochRsiDivergenceCrossWindow(0, 5)).toBe(5);
  });
});

describe('applyLineStochRsiDivergenceCrossSmaSeededRma', () => {
  it('seeds with SMA, uses Wilder alpha = 1/length', () => {
    const out = applyLineStochRsiDivergenceCrossSmaSeededRma(
      [null, 2, 2, 2, 14, 14],
      3,
    );
    expect(out[3]).toBe(2);
    expect(out[4]).toBeCloseTo(2 * (1 - 1 / 3) + 14 * (1 / 3), 9);
  });
});

describe('applyLineStochRsiDivergenceCrossRsi', () => {
  it('CONST close=K returns RSI=50 from warmup', () => {
    for (const K of [0, 1, 50, 200, 1234]) {
      const closes = Array.from({ length: 30 }, () => K);
      const rsi = applyLineStochRsiDivergenceCrossRsi(closes, L);
      for (let i = 0; i < L; i += 1) expect(rsi[i]).toBeNull();
      for (let i = L; i < closes.length; i += 1) expect(rsi[i]).toBe(50);
    }
  });

  it('LINEAR UP saturates RSI at 100', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i);
    const rsi = applyLineStochRsiDivergenceCrossRsi(closes, L);
    for (let i = L; i < 30; i += 1) {
      expect(rsi[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('LINEAR DOWN saturates RSI at 0', () => {
    const closes = Array.from({ length: 30 }, (_, i) => -i);
    const rsi = applyLineStochRsiDivergenceCrossRsi(closes, L);
    for (let i = L; i < 30; i += 1) expect(rsi[i]).toBe(0);
  });
});

describe('applyLineStochRsiDivergenceCrossStochastic', () => {
  it('CONST returns degenerate 50', () => {
    const values: Array<number | null> = Array.from(
      { length: 20 },
      () => 70,
    );
    const out = applyLineStochRsiDivergenceCrossStochastic(values, STOCH_L);
    for (let i = STOCH_L - 1; i < 20; i += 1) expect(out[i]).toBe(50);
  });

  it('LINEAR returns 100 at top', () => {
    const values: Array<number | null> = Array.from(
      { length: 20 },
      (_, i) => i,
    );
    const out = applyLineStochRsiDivergenceCrossStochastic(values, STOCH_L);
    for (let i = STOCH_L - 1; i < 20; i += 1) {
      expect(out[i] as number).toBeCloseTo(100, 9);
    }
  });

  it('returns nulls when length < 1', () => {
    expect(
      applyLineStochRsiDivergenceCrossStochastic([1, 2, 3], 0).every(
        (v) => v === null,
      ),
    ).toBe(true);
  });
});

describe('computeLineStochRsiDivergenceCross', () => {
  it('CONST close=K returns stochRsi=50 from warmup', () => {
    const data = buildConst(80, 50);
    const out = computeLineStochRsiDivergenceCross(data);
    expect(out.stochRsi[WARMUP]).toBe(50);
    expect(out.stochRsi[WARMUP - 1]).toBeNull();
  });

  it('LINEAR UP returns stochRsi=50 from warmup (RSI saturated -> stoch degenerate)', () => {
    const data = buildLinearUp(80);
    const out = computeLineStochRsiDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(out.stochRsi[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineStochRsiDivergenceCross([])).toEqual({
      rsi: [],
      stochRsi: [],
    });
  });
});

describe('classifyLineStochRsiDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    stochRsiUp: boolean | null;
    expected: ChartLineStochRsiDivergenceCrossRegime;
  }> = [
    { priceUp: true, stochRsiUp: true, expected: 'aligned-bullish' },
    { priceUp: false, stochRsiUp: false, expected: 'aligned-bearish' },
    { priceUp: false, stochRsiUp: true, expected: 'divergent-bullish' },
    { priceUp: true, stochRsiUp: false, expected: 'divergent-bearish' },
    { priceUp: null, stochRsiUp: false, expected: 'none' },
    { priceUp: true, stochRsiUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp stochRsiUp=$stochRsiUp as $expected',
    ({ priceUp, stochRsiUp, expected }) => {
      expect(
        classifyLineStochRsiDivergenceCrossRegime(priceUp, stochRsiUp),
      ).toBe(expected);
    },
  );
});

describe('detectLineStochRsiDivergenceCrossCrosses', () => {
  it('suppresses crosses from none', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineStochRsiDivergenceCrossRegime[] = [
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(
      detectLineStochRsiDivergenceCrossCrosses(series, states),
    ).toHaveLength(0);
  });

  it('detects bullish cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineStochRsiDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLineStochRsiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineStochRsiDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLineStochRsiDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire on steady state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      close: 1,
    }));
    const states: ChartLineStochRsiDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(
      detectLineStochRsiDivergenceCrossCrosses(series, states),
    ).toHaveLength(1);
  });
});

describe('runLineStochRsiDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST close=${K}: stochRsi=50, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(80, K);
      const run = runLineStochRsiDivergenceCross(data);
      expect(run.length).toBe(L);
      expect(run.stochLength).toBe(STOCH_L);
      expect(run.divergenceWindow).toBe(WIN);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.stochRsiValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.stochRsiValues[i]).toBe(50);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 80; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.stochRsiUp).toBe(false);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.noneCount).toBe(VALID_FROM);
      expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
      expect(run.alignedBullishCount).toBe(0);
      expect(run.divergentBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineStochRsiDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: stochRsi=50 saturated, divergent-bearish, 0 crosses', () => {
    const data = buildLinearUp(80);
    const run = runLineStochRsiDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.stochRsiValues[i] as number).toBeCloseTo(50, 9);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('divergent-bearish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.stochRsiUp).toBe(false);
    }
    expect(run.divergentBearishCount).toBe(80 - VALID_FROM);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineStochRsiDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: stochRsi=50 saturated, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(80);
    const run = runLineStochRsiDivergenceCross(data);
    for (let i = WARMUP; i < 80; i += 1) {
      expect(run.stochRsiValues[i] as number).toBeCloseTo(50, 9);
    }
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.stochRsiUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineStochRsiDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineStochRsiDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineStochRsiDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(20, 50);
    const run = runLineStochRsiDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineStochRsiDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.stochRsiValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40);
    const run = runLineStochRsiDivergenceCross(data, {
      length: 3,
      stochLength: 3,
      divergenceWindow: 1,
    });
    expect(run.length).toBe(3);
    expect(run.stochLength).toBe(3);
    expect(run.divergenceWindow).toBe(1);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLineStochRsiDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(80);
  });
});

describe('computeLineStochRsiDivergenceCrossLayout', () => {
  it('returns SVG paths for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLineStochRsiDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.stochRsiPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineStochRsiDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stochRsiPath).toBe('');
  });

  it('uses fixed 0..100 oscillator range', () => {
    const layout = computeLineStochRsiDivergenceCrossLayout({
      data: buildConst(80, 50),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
    expect(layout.zeroY).toBe(layout.oscBottom);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(80, 100);
    const layout = computeLineStochRsiDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineStochRsiDivergenceCrossLayout({
      data: buildLinearUp(40),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });
});

describe('describeLineStochRsiDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineStochRsiDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, length, stochLength, window', () => {
    const desc = describeLineStochRsiDivergenceCrossChart(
      buildLinearUp(80),
    );
    expect(desc).toContain('80 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('stochLength 14');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLineStochRsiDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineStochRsiDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-rsi-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-length')).toBe(String(L));
    expect(root?.getAttribute('data-stoch-length')).toBe(String(STOCH_L));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineStochRsiDivergenceCross data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders price and stochRSI paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineStochRsiDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-divergence-cross-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-divergence-cross-stoch-rsi-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders zero reference line', () => {
    const data = buildConst(80, 50);
    const { container } = render(
      <ChartLineStochRsiDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-divergence-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineStochRsiDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineStochRsiDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-rsi-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('stochLen 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineStochRsiDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-rsi-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Stoch RSI Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineStochRsiDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-rsi-divergence-cross"]',
    );
    expect(root?.getAttribute('data-divergent-bearish-count')).toBe(
      String(80 - VALID_FROM),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLineStochRsiDivergenceCross
        data={data}
        hiddenSeries={['stochRsi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-divergence-cross-stoch-rsi-path"]',
      ),
    ).toBeNull();
  });
});
