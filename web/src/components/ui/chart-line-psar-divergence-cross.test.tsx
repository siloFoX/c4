import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLinePsarDivergenceCross,
  DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_MAX_STEP,
  DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_STEP,
  DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WARMUP_LENGTH,
  DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WIDTH,
  DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WINDOW,
  applyLinePsarDivergenceCrossPsar,
  classifyLinePsarDivergenceCrossRegime,
  computeLinePsarDivergenceCross,
  computeLinePsarDivergenceCrossLayout,
  describeLinePsarDivergenceCrossChart,
  detectLinePsarDivergenceCrossCrosses,
  getLinePsarDivergenceCrossFinitePoints,
  normalizeLinePsarDivergenceCrossLength,
  normalizeLinePsarDivergenceCrossMaxStep,
  normalizeLinePsarDivergenceCrossStep,
  normalizeLinePsarDivergenceCrossWarmup,
  runLinePsarDivergenceCross,
  type ChartLinePsarDivergenceCrossPoint,
  type ChartLinePsarDivergenceCrossRegime,
} from './chart-line-psar-divergence-cross';

const STEP = 0.02;
const MAX_STEP = 0.2;
const WARMUP = 15;
const WIN = 5;
const VALID_FROM = WARMUP + WIN; // 20

const buildConst = (
  n: number,
  k: number,
): ChartLinePsarDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k,
    low: k,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLinePsarDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLinePsarDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLinePsarDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical PSAR tuning', () => {
    expect(DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_STEP).toBe(0.02);
    expect(DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_MAX_STEP).toBe(0.2);
    expect(DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WARMUP_LENGTH).toBe(15);
    expect(DEFAULT_CHART_LINE_PSAR_DIVERGENCE_CROSS_WINDOW).toBe(5);
  });
});

describe('getLinePsarDivergenceCrossFinitePoints', () => {
  it('filters finite x, HLC', () => {
    const points = [
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: NaN, high: 1, low: 0, close: 0.5 },
      { x: 2, high: Infinity, low: 0, close: 0.5 },
      { x: 3, high: 1, low: NaN, close: 0.5 },
      { x: 4, high: 1, low: 0, close: 0.5 },
    ];
    expect(getLinePsarDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 4, high: 1, low: 0, close: 0.5 },
    ]);
  });

  it('returns empty array for null and non-array', () => {
    expect(getLinePsarDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLinePsarDivergenceCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLinePsarDivergenceCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalize helpers', () => {
  it('step: accepts strictly 0 < v < 1', () => {
    expect(normalizeLinePsarDivergenceCrossStep(0.02, 0.02)).toBe(0.02);
    expect(normalizeLinePsarDivergenceCrossStep(0.5, 0.02)).toBe(0.5);
    expect(normalizeLinePsarDivergenceCrossStep(0, 0.02)).toBe(0.02);
    expect(normalizeLinePsarDivergenceCrossStep(1, 0.02)).toBe(0.02);
    expect(normalizeLinePsarDivergenceCrossStep(-0.5, 0.02)).toBe(0.02);
    expect(normalizeLinePsarDivergenceCrossStep(NaN, 0.02)).toBe(0.02);
  });

  it('maxStep: accepts strictly 0 < v <= 1', () => {
    expect(normalizeLinePsarDivergenceCrossMaxStep(0.2, 0.2)).toBe(0.2);
    expect(normalizeLinePsarDivergenceCrossMaxStep(1, 0.2)).toBe(1);
    expect(normalizeLinePsarDivergenceCrossMaxStep(0, 0.2)).toBe(0.2);
    expect(normalizeLinePsarDivergenceCrossMaxStep(NaN, 0.2)).toBe(0.2);
  });

  it('warmupLength: floors finite >=1', () => {
    expect(normalizeLinePsarDivergenceCrossWarmup(15.7, 15)).toBe(15);
    expect(normalizeLinePsarDivergenceCrossWarmup(1, 15)).toBe(1);
    expect(normalizeLinePsarDivergenceCrossWarmup(0, 15)).toBe(15);
    expect(normalizeLinePsarDivergenceCrossWarmup(NaN, 15)).toBe(15);
  });

  it('length: floors finite >=1', () => {
    expect(normalizeLinePsarDivergenceCrossLength(5.9, 5)).toBe(5);
    expect(normalizeLinePsarDivergenceCrossLength(0, 5)).toBe(5);
  });
});

describe('applyLinePsarDivergenceCrossPsar', () => {
  it('CONST H=L=K returns psar=K from warmup onwards', () => {
    for (const K of [0, 1, 50, 200, 1234]) {
      const highs = Array.from({ length: 60 }, () => K);
      const lows = Array.from({ length: 60 }, () => K);
      const psar = applyLinePsarDivergenceCrossPsar(
        highs,
        lows,
        STEP,
        MAX_STEP,
        WARMUP,
      );
      for (let i = 0; i < WARMUP; i += 1) expect(psar[i]).toBeNull();
      for (let i = WARMUP; i < 60; i += 1) expect(psar[i]).toBe(K);
    }
  });

  it('LINEAR UP: SAR rises monotonically after warmup', () => {
    const n = 60;
    const highs = Array.from({ length: n }, (_, i) => i + 1);
    const lows = Array.from({ length: n }, (_, i) => i - 1);
    const psar = applyLinePsarDivergenceCrossPsar(
      highs,
      lows,
      STEP,
      MAX_STEP,
      WARMUP,
    );
    for (let i = 0; i < WARMUP; i += 1) expect(psar[i]).toBeNull();
    for (let i = WARMUP + 1; i < n; i += 1) {
      expect(psar[i] as number).toBeGreaterThan(psar[i - 1] as number);
    }
  });

  it('LINEAR DOWN: SAR falls monotonically after warmup', () => {
    const n = 60;
    const highs = Array.from({ length: n }, (_, i) => -i + 1);
    const lows = Array.from({ length: n }, (_, i) => -i - 1);
    const psar = applyLinePsarDivergenceCrossPsar(
      highs,
      lows,
      STEP,
      MAX_STEP,
      WARMUP,
    );
    for (let i = WARMUP + 1; i < n; i += 1) {
      expect(psar[i] as number).toBeLessThan(psar[i - 1] as number);
    }
  });

  it('returns all nulls when step <= 0', () => {
    const closes = [1, 2, 3, 4];
    const psar = applyLinePsarDivergenceCrossPsar(
      closes,
      closes,
      0,
      MAX_STEP,
      WARMUP,
    );
    expect(psar.every((v) => v === null)).toBe(true);
  });

  it('returns empty when inputs empty', () => {
    expect(
      applyLinePsarDivergenceCrossPsar([], [], STEP, MAX_STEP, WARMUP),
    ).toEqual([]);
  });
});

describe('computeLinePsarDivergenceCross', () => {
  it('CONST returns psar=K from warmup', () => {
    const data = buildConst(60, 50);
    const out = computeLinePsarDivergenceCross(data);
    expect(out.psar[WARMUP]).toBe(50);
    expect(out.psar[WARMUP - 1]).toBeNull();
  });

  it('returns empty psar for empty data', () => {
    expect(computeLinePsarDivergenceCross([])).toEqual({ psar: [] });
  });

  it('falls back to defaults on invalid options', () => {
    const out = computeLinePsarDivergenceCross(buildConst(60, 50), {
      step: 0,
      maxStep: 0,
      warmupLength: 0,
    });
    expect(out.psar[WARMUP]).toBe(50);
  });
});

describe('classifyLinePsarDivergenceCrossRegime', () => {
  const cases: Array<{
    priceUp: boolean | null;
    psarUp: boolean | null;
    expected: ChartLinePsarDivergenceCrossRegime;
  }> = [
    { priceUp: true, psarUp: true, expected: 'aligned-bullish' },
    { priceUp: false, psarUp: false, expected: 'aligned-bearish' },
    { priceUp: false, psarUp: true, expected: 'divergent-bullish' },
    { priceUp: true, psarUp: false, expected: 'divergent-bearish' },
    { priceUp: null, psarUp: false, expected: 'none' },
    { priceUp: true, psarUp: null, expected: 'none' },
  ];
  it.each(cases)(
    'classifies priceUp=$priceUp psarUp=$psarUp as $expected',
    ({ priceUp, psarUp, expected }) => {
      expect(classifyLinePsarDivergenceCrossRegime(priceUp, psarUp)).toBe(
        expected,
      );
    },
  );
});

describe('detectLinePsarDivergenceCrossCrosses', () => {
  it('suppresses crosses entered from none', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const states: ChartLinePsarDivergenceCrossRegime[] = [
      'none',
      'none',
      'divergent-bullish',
      'divergent-bullish',
    ];
    expect(
      detectLinePsarDivergenceCrossCrosses(series, states),
    ).toHaveLength(0);
  });

  it('detects bullish cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const states: ChartLinePsarDivergenceCrossRegime[] = [
      'aligned-bearish',
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLinePsarDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish cross', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const states: ChartLinePsarDivergenceCrossRegime[] = [
      'aligned-bullish',
      'aligned-bullish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const out = detectLinePsarDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not double-fire on steady state', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const states: ChartLinePsarDivergenceCrossRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const out = detectLinePsarDivergenceCrossCrosses(series, states);
    expect(out).toHaveLength(1);
  });
});

describe('runLinePsarDivergenceCross CONST K', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST H=L=C=${K}: psar=K, aligned-bearish, 0 crosses`, () => {
      const data = buildConst(80, K);
      const run = runLinePsarDivergenceCross(data);
      expect(run.step).toBe(STEP);
      expect(run.maxStep).toBe(MAX_STEP);
      expect(run.warmupLength).toBe(WARMUP);
      expect(run.divergenceWindow).toBe(WIN);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.psarValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 80; i += 1) {
        expect(run.psarValues[i]).toBe(K);
      }
      for (let i = 0; i < VALID_FROM; i += 1) {
        expect(run.samples[i]?.regime).toBe('none');
      }
      for (let i = VALID_FROM; i < 80; i += 1) {
        expect(run.samples[i]?.regime).toBe('aligned-bearish');
        expect(run.samples[i]?.priceUp).toBe(false);
        expect(run.samples[i]?.psarUp).toBe(false);
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

describe('runLinePsarDivergenceCross LINEAR UP', () => {
  it('LINEAR UP: SAR rises, aligned-bullish, 0 crosses', () => {
    const data = buildLinearUp(80);
    const run = runLinePsarDivergenceCross(data);
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bullish');
      expect(run.samples[i]?.priceUp).toBe(true);
      expect(run.samples[i]?.psarUp).toBe(true);
    }
    expect(run.alignedBullishCount).toBe(80 - VALID_FROM);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLinePsarDivergenceCross LINEAR DOWN', () => {
  it('LINEAR DOWN: SAR falls, aligned-bearish, 0 crosses', () => {
    const data = buildLinearDown(80);
    const run = runLinePsarDivergenceCross(data);
    for (let i = VALID_FROM; i < 80; i += 1) {
      expect(run.samples[i]?.regime).toBe('aligned-bearish');
      expect(run.samples[i]?.priceUp).toBe(false);
      expect(run.samples[i]?.psarUp).toBe(false);
    }
    expect(run.alignedBearishCount).toBe(80 - VALID_FROM);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLinePsarDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLinePsarDivergenceCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLinePsarDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(15, 50);
    const run = runLinePsarDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLinePsarDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.psarValues).toEqual([]);
    expect(run.samples).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(40);
    const run = runLinePsarDivergenceCross(data, {
      step: 0.04,
      maxStep: 0.4,
      warmupLength: 5,
      divergenceWindow: 1,
    });
    expect(run.step).toBe(0.04);
    expect(run.maxStep).toBe(0.4);
    expect(run.warmupLength).toBe(5);
    expect(run.divergenceWindow).toBe(1);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(80);
    const run = runLinePsarDivergenceCross(data);
    const total =
      run.alignedBullishCount +
      run.alignedBearishCount +
      run.divergentBullishCount +
      run.divergentBearishCount +
      run.noneCount;
    expect(total).toBe(80);
  });
});

describe('computeLinePsarDivergenceCrossLayout', () => {
  it('returns SVG paths for CONST K=50', () => {
    const data = buildConst(80, 50);
    const layout = computeLinePsarDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(80);
    expect(layout.psarPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLinePsarDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.psarPath).toBe('');
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(80, 100);
    const layout = computeLinePsarDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('uses oscillator range from psar span', () => {
    const layout = computeLinePsarDivergenceCrossLayout({
      data: buildLinearUp(80),
    });
    expect(layout.oscMin).toBeLessThan(layout.oscMax);
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLinePsarDivergenceCrossLayout({
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

describe('describeLinePsarDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLinePsarDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, step, maxStep, warmup, window', () => {
    const desc = describeLinePsarDivergenceCrossChart(buildLinearUp(80));
    expect(desc).toContain('80 bars');
    expect(desc).toContain('step 0.02');
    expect(desc).toContain('maxStep 0.2');
    expect(desc).toContain('warmupLength 15');
    expect(desc).toContain('divergenceWindow 5');
  });
});

describe('<ChartLinePsarDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLinePsarDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-psar-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-step')).toBe(String(STEP));
    expect(root?.getAttribute('data-max-step')).toBe(String(MAX_STEP));
    expect(root?.getAttribute('data-warmup-length')).toBe(String(WARMUP));
    expect(root?.getAttribute('data-divergence-window')).toBe(String(WIN));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLinePsarDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders price and PSAR paths', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLinePsarDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-divergence-cross-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-divergence-cross-psar-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the zero reference line', () => {
    const data = buildConst(80, 50);
    const { container } = render(
      <ChartLinePsarDivergenceCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-divergence-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLinePsarDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with crosses count', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLinePsarDivergenceCross data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-psar-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('step 0.02');
    expect(badge?.textContent).toContain('warmup 15');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLinePsarDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-psar-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'PSAR Divergence Cross chart',
    );
  });

  it('exposes data-*-count counters', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLinePsarDivergenceCross data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-psar-divergence-cross"]',
    );
    expect(root?.getAttribute('data-aligned-bullish-count')).toBe(
      String(80 - VALID_FROM),
    );
    expect(root?.getAttribute('data-aligned-bearish-count')).toBe('0');
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(80);
    const { container } = render(
      <ChartLinePsarDivergenceCross data={data} hiddenSeries={['psar']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-divergence-cross-psar-path"]',
      ),
    ).toBeNull();
  });
});
