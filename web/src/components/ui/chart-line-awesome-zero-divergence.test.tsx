import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineAwesomeZeroDivergence,
  DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_FAST_LENGTH,
  DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_HEIGHT,
  DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PADDING,
  DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PANEL_GAP,
  DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_SLOW_LENGTH,
  DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_WIDTH,
  classifyLineAwesomeZeroDivergenceBias,
  classifyLineAwesomeZeroDivergenceRegime,
  computeLineAwesomeZeroDivergence,
  computeLineAwesomeZeroDivergenceLayout,
  describeLineAwesomeZeroDivergenceChart,
  detectLineAwesomeZeroDivergenceCrosses,
  getLineAwesomeZeroDivergenceFinitePoints,
  normalizeLineAwesomeZeroDivergenceLength,
  runLineAwesomeZeroDivergence,
  type ChartLineAwesomeZeroDivergencePoint,
  type ChartLineAwesomeZeroDivergenceRegime,
} from './chart-line-awesome-zero-divergence';

const FAST = 5;
const SLOW = 34;
const WARMUP = SLOW + 1; // 35

const buildConst = (
  n: number,
  k: number,
): ChartLineAwesomeZeroDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
  }));

const buildLinearUp = (n: number): ChartLineAwesomeZeroDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
  }));

const buildLinearDown = (n: number): ChartLineAwesomeZeroDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
  }));

// Quadratic up: HL2 = i^2 -- accelerating uptrend.
const buildQuadraticUp = (
  n: number,
): ChartLineAwesomeZeroDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i * i + 1,
    low: i * i - 1,
  }));

// Decelerating decline: HL2 = 100 - sqrt(i+1).
const buildDeceleratingDecline = (
  n: number,
): ChartLineAwesomeZeroDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => {
    const m = 100 - Math.sqrt(i + 1);
    return { x: i, high: m + 1, low: m - 1 };
  });

describe('ChartLineAwesomeZeroDivergence defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_PANEL_GAP).toBe(12);
  });

  it('exports canonical Bill Williams AO tuning', () => {
    expect(DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_FAST_LENGTH).toBe(5);
    expect(DEFAULT_CHART_LINE_AWESOME_ZERO_DIVERGENCE_SLOW_LENGTH).toBe(34);
  });
});

describe('getLineAwesomeZeroDivergenceFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1 },
      { x: NaN, high: 2, low: 1 },
      { x: 1, high: 1, low: 2 },
      { x: 2, high: Infinity, low: 1 },
      { x: 3, high: 4, low: 1 },
    ];
    expect(getLineAwesomeZeroDivergenceFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1 },
      { x: 3, high: 4, low: 1 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineAwesomeZeroDivergenceFinitePoints(null)).toEqual([]);
    expect(getLineAwesomeZeroDivergenceFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineAwesomeZeroDivergenceLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineAwesomeZeroDivergenceLength(5.7, 5)).toBe(5);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineAwesomeZeroDivergenceLength(0, 5)).toBe(5);
    expect(normalizeLineAwesomeZeroDivergenceLength(-1, 34)).toBe(34);
    expect(normalizeLineAwesomeZeroDivergenceLength(NaN, 5)).toBe(5);
  });
});

describe('computeLineAwesomeZeroDivergence CONST', () => {
  it('HL2 = K, AO = 0 from i = slowLength - 1 onwards', () => {
    const data = buildConst(60, 50);
    const out = computeLineAwesomeZeroDivergence(data);
    for (let i = 0; i < 60; i += 1) expect(out.hl2[i] as number).toBe(50);
    for (let i = 0; i < SLOW - 1; i += 1) expect(out.ao[i]).toBeNull();
    for (let i = SLOW - 1; i < 60; i += 1) {
      expect(out.ao[i] as number).toBe(0);
    }
  });
});

describe('computeLineAwesomeZeroDivergence LINEAR UP', () => {
  it('HL2 = i, AO = 14.5 (constant) from i = slowLength - 1 onwards', () => {
    const data = buildLinearUp(60);
    const out = computeLineAwesomeZeroDivergence(data);
    for (let i = SLOW - 1; i < 60; i += 1) {
      expect(out.ao[i] as number).toBeCloseTo(14.5, 9);
    }
  });
});

describe('computeLineAwesomeZeroDivergence LINEAR DOWN', () => {
  it('HL2 = -i, AO = -14.5 (mirror constant)', () => {
    const data = buildLinearDown(60);
    const out = computeLineAwesomeZeroDivergence(data);
    for (let i = SLOW - 1; i < 60; i += 1) {
      expect(out.ao[i] as number).toBeCloseTo(-14.5, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineAwesomeZeroDivergence([])).toEqual({
      hl2: [],
      ao: [],
    });
  });
});

describe('classifyLineAwesomeZeroDivergenceRegime', () => {
  it('null inputs -> none', () => {
    expect(
      classifyLineAwesomeZeroDivergenceRegime(null, 1, 1, 1),
    ).toBe('none');
    expect(
      classifyLineAwesomeZeroDivergenceRegime(1, null, 1, 1),
    ).toBe('none');
    expect(
      classifyLineAwesomeZeroDivergenceRegime(1, 1, null, 1),
    ).toBe('none');
    expect(
      classifyLineAwesomeZeroDivergenceRegime(1, 1, 1, null),
    ).toBe('none');
  });

  it('price up + AO up -> aligned-bullish', () => {
    expect(classifyLineAwesomeZeroDivergenceRegime(10, 5, 4, 2)).toBe(
      'aligned-bullish',
    );
  });

  it('price down + AO down -> aligned-bearish', () => {
    expect(classifyLineAwesomeZeroDivergenceRegime(5, 10, 2, 4)).toBe(
      'aligned-bearish',
    );
  });

  it('price down + AO up -> divergent-bullish', () => {
    expect(classifyLineAwesomeZeroDivergenceRegime(5, 10, 4, 2)).toBe(
      'divergent-bullish',
    );
  });

  it('price up + AO down -> divergent-bearish', () => {
    expect(classifyLineAwesomeZeroDivergenceRegime(10, 5, 2, 4)).toBe(
      'divergent-bearish',
    );
  });

  it('flat price or flat AO -> none', () => {
    expect(classifyLineAwesomeZeroDivergenceRegime(5, 5, 4, 2)).toBe(
      'none',
    );
    expect(classifyLineAwesomeZeroDivergenceRegime(10, 5, 4, 4)).toBe(
      'none',
    );
  });
});

describe('classifyLineAwesomeZeroDivergenceBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineAwesomeZeroDivergenceBias(60, 50)).toBe('up');
    expect(classifyLineAwesomeZeroDivergenceBias(40, 50)).toBe('down');
    expect(classifyLineAwesomeZeroDivergenceBias(50, 50)).toBe('flat');
    expect(classifyLineAwesomeZeroDivergenceBias(null, 50)).toBe('none');
    expect(classifyLineAwesomeZeroDivergenceBias(50, null)).toBe('none');
  });
});

describe('detectLineAwesomeZeroDivergenceCrosses', () => {
  it('fires BULLISH on entry into divergent-bullish', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
    }));
    const regimes: ChartLineAwesomeZeroDivergenceRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const ao: Array<number | null> = [-5, -3, -1];
    const out = detectLineAwesomeZeroDivergenceCrosses(series, regimes, ao);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires BEARISH on entry into divergent-bearish', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
    }));
    const regimes: ChartLineAwesomeZeroDivergenceRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const ao: Array<number | null> = [5, 7, 6];
    const out = detectLineAwesomeZeroDivergenceCrosses(series, regimes, ao);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire when state persists', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
    }));
    const regimes: ChartLineAwesomeZeroDivergenceRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const ao: Array<number | null> = [1, 2, 3];
    const out = detectLineAwesomeZeroDivergenceCrosses(series, regimes, ao);
    expect(out).toHaveLength(0);
  });

  it('bias up when AO rises at the cross', () => {
    const series = Array.from({ length: 2 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
    }));
    const regimes: ChartLineAwesomeZeroDivergenceRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    const ao: Array<number | null> = [1, 5];
    const out = detectLineAwesomeZeroDivergenceCrosses(series, regimes, ao);
    expect(out[0]?.bias).toBe('up');
  });
});

describe('runLineAwesomeZeroDivergence CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: AO = 0, regime none, 0 crosses`, () => {
      const data = buildConst(60, K);
      const run = runLineAwesomeZeroDivergence(data);
      expect(run.fastLength).toBe(FAST);
      expect(run.slowLength).toBe(SLOW);
      for (let i = SLOW - 1; i < 60; i += 1) {
        expect(run.aoValues[i] as number).toBe(0);
      }
      expect(run.alignedBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineAwesomeZeroDivergence LINEAR UP', () => {
  it('AO = 14.5 (constant); flat AO -> regime none, 0 crosses', () => {
    const data = buildLinearUp(60);
    const run = runLineAwesomeZeroDivergence(data);
    for (let i = SLOW - 1; i < 60; i += 1) {
      expect(run.aoValues[i] as number).toBeCloseTo(14.5, 9);
    }
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBullishCount).toBe(0);
    expect(run.divergentBearishCount).toBe(0);
  });
});

describe('runLineAwesomeZeroDivergence LINEAR DOWN', () => {
  it('AO = -14.5 (mirror); flat AO -> regime none, 0 crosses', () => {
    const data = buildLinearDown(60);
    const run = runLineAwesomeZeroDivergence(data);
    for (let i = SLOW - 1; i < 60; i += 1) {
      expect(run.aoValues[i] as number).toBeCloseTo(-14.5, 9);
    }
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBearishCount).toBe(0);
    expect(run.divergentBullishCount).toBe(0);
  });
});

describe('runLineAwesomeZeroDivergence QUADRATIC UP', () => {
  it('aligned-bullish regime throughout post-warmup, 0 crosses', () => {
    const data = buildQuadraticUp(60);
    const run = runLineAwesomeZeroDivergence(data);
    expect(run.alignedBullishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineAwesomeZeroDivergence DECELERATING DECLINE', () => {
  it('divergent-bullish + at least one bullish cross', () => {
    const data = buildDeceleratingDecline(60);
    const run = runLineAwesomeZeroDivergence(data);
    expect(run.divergentBullishCount).toBeGreaterThan(0);
    expect(run.bullishCrossCount).toBeGreaterThan(0);
  });
});

describe('runLineAwesomeZeroDivergence misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineAwesomeZeroDivergencePoint[] = [
      { x: 2, high: 2, low: 0 },
      { x: 0, high: 2, low: 0 },
      { x: 1, high: 2, low: 0 },
    ];
    const run = runLineAwesomeZeroDivergence(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(WARMUP, 50);
    const run = runLineAwesomeZeroDivergence(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineAwesomeZeroDivergence([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom fast/slow lengths', () => {
    const data = buildLinearUp(60);
    const run = runLineAwesomeZeroDivergence(data, {
      fastLength: 3,
      slowLength: 10,
    });
    expect(run.fastLength).toBe(3);
    expect(run.slowLength).toBe(10);
  });

  it('regime counts sum to series length', () => {
    const data = buildQuadraticUp(60);
    const run = runLineAwesomeZeroDivergence(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });

  it('cross counts match crosses length', () => {
    const data = buildDeceleratingDecline(60);
    const run = runLineAwesomeZeroDivergence(data);
    expect(run.bullishCrossCount + run.bearishCrossCount).toBe(
      run.crosses.length,
    );
  });
});

describe('computeLineAwesomeZeroDivergenceLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineAwesomeZeroDivergenceLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.aoPath).toContain('M ');
  });

  it('LINEAR UP produces 0 cross markers', () => {
    const layout = computeLineAwesomeZeroDivergenceLayout({
      data: buildLinearUp(60),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('DECELERATING DECLINE produces > 0 cross markers', () => {
    const layout = computeLineAwesomeZeroDivergenceLayout({
      data: buildDeceleratingDecline(60),
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineAwesomeZeroDivergenceLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.aoPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineAwesomeZeroDivergenceLayout({
      data: buildLinearUp(60),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(60, 100);
    const layout = computeLineAwesomeZeroDivergenceLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('ensures zero is visible in AO panel', () => {
    const data = buildLinearUp(60);
    const layout = computeLineAwesomeZeroDivergenceLayout({ data });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });
});

describe('describeLineAwesomeZeroDivergenceChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineAwesomeZeroDivergenceChart([])).toBe('No data');
  });

  it('mentions bar count, fast/slow, momentum reversal warning', () => {
    const desc = describeLineAwesomeZeroDivergenceChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('fast 5');
    expect(desc).toContain('slow 34');
    expect(desc).toContain('momentum reversal warning');
  });
});

describe('<ChartLineAwesomeZeroDivergence /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAwesomeZeroDivergence data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-awesome-zero-divergence"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-fast-length')).toBe(String(FAST));
    expect(root?.getAttribute('data-slow-length')).toBe(String(SLOW));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineAwesomeZeroDivergence data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-divergence-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders AO path and zero line', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAwesomeZeroDivergence data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-divergence-ao-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-divergence-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineAwesomeZeroDivergence data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-divergence-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAwesomeZeroDivergence data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-awesome-zero-divergence-badge"]',
    );
    expect(badge?.textContent).toContain('fast 5');
    expect(badge?.textContent).toContain('slow 34');
    expect(badge?.textContent).toContain('divergences 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAwesomeZeroDivergence data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-awesome-zero-divergence"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Awesome Oscillator zero line divergence-cross chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAwesomeZeroDivergence data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-awesome-zero-divergence"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes non-zero cross-count for DECELERATING DECLINE', () => {
    const data = buildDeceleratingDecline(60);
    const { container } = render(<ChartLineAwesomeZeroDivergence data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-awesome-zero-divergence"]',
    );
    const crossCount = Number(root?.getAttribute('data-cross-count'));
    expect(crossCount).toBeGreaterThan(0);
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineAwesomeZeroDivergence data={data} hiddenSeries={['ao']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-awesome-zero-divergence-ao-path"]',
      ),
    ).toBeNull();
  });

  it('renders two legend buttons (HL2, AO)', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineAwesomeZeroDivergence data={data} />);
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-awesome-zero-divergence-legend"] button',
    );
    expect(buttons).toHaveLength(2);
  });

  it('exposes aligned-bullish count for QUADRATIC UP', () => {
    const data = buildQuadraticUp(60);
    const { container } = render(<ChartLineAwesomeZeroDivergence data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-awesome-zero-divergence"]',
    );
    const c = Number(root?.getAttribute('data-aligned-bullish-count'));
    expect(c).toBeGreaterThan(0);
  });
});
