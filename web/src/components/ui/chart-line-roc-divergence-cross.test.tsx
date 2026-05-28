import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineRocDivergenceCross,
  DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PADDING,
  DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PERIOD,
  DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_WIDTH,
  classifyLineRocDivergenceCrossBias,
  classifyLineRocDivergenceCrossRegime,
  computeLineRocDivergenceCross,
  computeLineRocDivergenceCrossLayout,
  describeLineRocDivergenceCrossChart,
  detectLineRocDivergenceCrossCrosses,
  getLineRocDivergenceCrossFinitePoints,
  normalizeLineRocDivergenceCrossLength,
  runLineRocDivergenceCross,
  type ChartLineRocDivergenceCrossPoint,
  type ChartLineRocDivergenceCrossRegime,
} from './chart-line-roc-divergence-cross';

const PERIOD = 12;
const WARMUP = PERIOD + 1; // 13

const buildConst = (
  n: number,
  k: number,
): ChartLineRocDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

// Positive monotonically increasing (close = i + 1)
const buildLinearUp = (n: number): ChartLineRocDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i + 1 }));

// Positive monotonically decreasing (close = n - i)
const buildLinearDown = (n: number): ChartLineRocDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

// Decelerating decline: close = 100 - sqrt(i+1). Positive,
// monotonically decreasing, but rate of decline slows.
const buildDeceleratingDecline = (
  n: number,
): ChartLineRocDivergenceCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    close: 100 - Math.sqrt(i + 1),
  }));

describe('ChartLineRocDivergenceCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical ROC tuning', () => {
    expect(DEFAULT_CHART_LINE_ROC_DIVERGENCE_CROSS_PERIOD).toBe(12);
  });
});

describe('getLineRocDivergenceCrossFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1.5 },
      { x: NaN, close: 1.5 },
      { x: 2, close: Infinity },
      { x: 3, close: 2 },
    ];
    expect(getLineRocDivergenceCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1.5 },
      { x: 3, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineRocDivergenceCrossFinitePoints(null)).toEqual([]);
    expect(getLineRocDivergenceCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineRocDivergenceCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineRocDivergenceCrossLength(12.7, 12)).toBe(12);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineRocDivergenceCrossLength(0, 12)).toBe(12);
    expect(normalizeLineRocDivergenceCrossLength(-1, 12)).toBe(12);
    expect(normalizeLineRocDivergenceCrossLength(NaN, 12)).toBe(12);
  });
});

describe('computeLineRocDivergenceCross CONST', () => {
  it('ROC = 0 from i = period onwards (K != 0)', () => {
    const data = buildConst(40, 50);
    const out = computeLineRocDivergenceCross(data);
    for (let i = 0; i < PERIOD; i += 1) expect(out[i]).toBeNull();
    for (let i = PERIOD; i < 40; i += 1) expect(out[i] as number).toBe(0);
  });

  it('returns null throughout when CONST K = 0 (divide-by-zero guard)', () => {
    const data = buildConst(40, 0);
    const out = computeLineRocDivergenceCross(data);
    for (let i = 0; i < 40; i += 1) expect(out[i]).toBeNull();
  });
});

describe('computeLineRocDivergenceCross LINEAR UP', () => {
  it('ROC declines as i grows (percentage normalisation decays linear growth)', () => {
    const data = buildLinearUp(40);
    const out = computeLineRocDivergenceCross(data);
    let prev = Infinity;
    for (let i = PERIOD; i < 40; i += 1) {
      const cur = out[i] as number;
      expect(cur).toBeLessThan(prev);
      prev = cur;
    }
  });

  it('ROC remains positive throughout (uptrend)', () => {
    const data = buildLinearUp(40);
    const out = computeLineRocDivergenceCross(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out[i] as number).toBeGreaterThan(0);
    }
  });
});

describe('computeLineRocDivergenceCross LINEAR DOWN', () => {
  it('ROC remains negative throughout (downtrend)', () => {
    const data = buildLinearDown(60);
    const out = computeLineRocDivergenceCross(data);
    for (let i = PERIOD; i < 60; i += 1) {
      expect(out[i] as number).toBeLessThan(0);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineRocDivergenceCross([])).toEqual([]);
  });
});

describe('classifyLineRocDivergenceCrossRegime', () => {
  it('null inputs -> none', () => {
    expect(classifyLineRocDivergenceCrossRegime(null, 1, 1, 1)).toBe(
      'none',
    );
    expect(classifyLineRocDivergenceCrossRegime(1, null, 1, 1)).toBe(
      'none',
    );
    expect(classifyLineRocDivergenceCrossRegime(1, 1, null, 1)).toBe(
      'none',
    );
    expect(classifyLineRocDivergenceCrossRegime(1, 1, 1, null)).toBe(
      'none',
    );
  });

  it('price up + ROC up -> aligned-bullish', () => {
    expect(classifyLineRocDivergenceCrossRegime(10, 5, 4, 2)).toBe(
      'aligned-bullish',
    );
  });

  it('price down + ROC down -> aligned-bearish', () => {
    expect(classifyLineRocDivergenceCrossRegime(5, 10, 2, 4)).toBe(
      'aligned-bearish',
    );
  });

  it('price down + ROC up -> divergent-bullish', () => {
    expect(classifyLineRocDivergenceCrossRegime(5, 10, 4, 2)).toBe(
      'divergent-bullish',
    );
  });

  it('price up + ROC down -> divergent-bearish', () => {
    expect(classifyLineRocDivergenceCrossRegime(10, 5, 2, 4)).toBe(
      'divergent-bearish',
    );
  });

  it('flat price or flat ROC -> none', () => {
    expect(classifyLineRocDivergenceCrossRegime(5, 5, 4, 2)).toBe('none');
    expect(classifyLineRocDivergenceCrossRegime(10, 5, 4, 4)).toBe('none');
  });
});

describe('classifyLineRocDivergenceCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineRocDivergenceCrossBias(60, 50)).toBe('up');
    expect(classifyLineRocDivergenceCrossBias(40, 50)).toBe('down');
    expect(classifyLineRocDivergenceCrossBias(50, 50)).toBe('flat');
    expect(classifyLineRocDivergenceCrossBias(null, 50)).toBe('none');
    expect(classifyLineRocDivergenceCrossBias(50, null)).toBe('none');
  });
});

describe('detectLineRocDivergenceCrossCrosses', () => {
  it('fires BULLISH on entry into divergent-bullish', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const regimes: ChartLineRocDivergenceCrossRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const roc: Array<number | null> = [-5, -3, -1];
    const out = detectLineRocDivergenceCrossCrosses(series, regimes, roc);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires BEARISH on entry into divergent-bearish', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const regimes: ChartLineRocDivergenceCrossRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const roc: Array<number | null> = [5, 7, 6];
    const out = detectLineRocDivergenceCrossCrosses(series, regimes, roc);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire when divergent state persists', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const regimes: ChartLineRocDivergenceCrossRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const roc: Array<number | null> = [1, 2, 3];
    const out = detectLineRocDivergenceCrossCrosses(series, regimes, roc);
    expect(out).toHaveLength(0);
  });

  it('bias up when ROC rises at the cross', () => {
    const series = Array.from({ length: 2 }, (_, i) => ({
      x: i,
      close: i,
    }));
    const regimes: ChartLineRocDivergenceCrossRegime[] = [
      'aligned-bullish',
      'divergent-bullish',
    ];
    const roc: Array<number | null> = [1, 5];
    const out = detectLineRocDivergenceCrossCrosses(series, regimes, roc);
    expect(out[0]?.bias).toBe('up');
  });
});

describe('runLineRocDivergenceCross CONST (K != 0)', () => {
  for (const K of [1, 50, 200, 1234]) {
    it(`CONST ${K}: ROC = 0, regime none, 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineRocDivergenceCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = PERIOD; i < 40; i += 1) {
        expect(run.rocValues[i] as number).toBe(0);
      }
      expect(run.alignedBullishCount).toBe(0);
      expect(run.divergentBearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineRocDivergenceCross CONST K=0 (divide-by-zero)', () => {
  it('returns null ROC and 0 crosses without throwing', () => {
    const data = buildConst(40, 0);
    const run = runLineRocDivergenceCross(data);
    for (let i = 0; i < 40; i += 1) {
      expect(run.rocValues[i]).toBeNull();
    }
    expect(run.crosses).toHaveLength(0);
    expect(run.alignedBullishCount).toBe(0);
  });
});

describe('runLineRocDivergenceCross LINEAR UP', () => {
  it('divergent-bearish regime + at least one bearish cross (ROC decays)', () => {
    const data = buildLinearUp(40);
    const run = runLineRocDivergenceCross(data);
    expect(run.divergentBearishCount).toBeGreaterThan(0);
    expect(run.bearishCrossCount).toBeGreaterThan(0);
  });
});

describe('runLineRocDivergenceCross LINEAR DOWN', () => {
  it('aligned-bearish regime + 0 crosses (ROC and price agree)', () => {
    const data = buildLinearDown(60);
    const run = runLineRocDivergenceCross(data);
    expect(run.alignedBearishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineRocDivergenceCross DECELERATING DECLINE', () => {
  it('divergent-bullish regime + at least one bullish cross', () => {
    const data = buildDeceleratingDecline(60);
    const run = runLineRocDivergenceCross(data);
    expect(run.divergentBullishCount).toBeGreaterThan(0);
    expect(run.bullishCrossCount).toBeGreaterThan(0);
  });
});

describe('runLineRocDivergenceCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineRocDivergenceCrossPoint[] = [
      { x: 2, close: 1 },
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const run = runLineRocDivergenceCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(WARMUP, 50);
    const run = runLineRocDivergenceCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineRocDivergenceCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearUp(40);
    const run = runLineRocDivergenceCross(data, { period: 5 });
    expect(run.period).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineRocDivergenceCross(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(40);
  });

  it('cross counts match crosses length', () => {
    const data = buildLinearUp(40);
    const run = runLineRocDivergenceCross(data);
    expect(run.bullishCrossCount + run.bearishCrossCount).toBe(
      run.crosses.length,
    );
  });
});

describe('computeLineRocDivergenceCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineRocDivergenceCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.rocPath).toContain('M ');
  });

  it('LINEAR UP produces > 0 cross markers (divergent-bearish)', () => {
    const layout = computeLineRocDivergenceCrossLayout({
      data: buildLinearUp(40),
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
  });

  it('LINEAR DOWN produces 0 cross markers (aligned-bearish)', () => {
    const layout = computeLineRocDivergenceCrossLayout({
      data: buildLinearDown(60),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineRocDivergenceCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.rocPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineRocDivergenceCrossLayout({
      data: buildLinearUp(40),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('pads degenerate priceMin === priceMax', () => {
    const data = buildConst(40, 100);
    const layout = computeLineRocDivergenceCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('ensures zero is visible in ROC panel', () => {
    const data = buildLinearUp(40);
    const layout = computeLineRocDivergenceCrossLayout({ data });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });
});

describe('describeLineRocDivergenceCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineRocDivergenceCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, momentum percentage reversal warning', () => {
    const desc = describeLineRocDivergenceCrossChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 12');
    expect(desc).toContain('momentum percentage reversal warning');
    expect(desc).toContain('disagreement');
  });
});

describe('<ChartLineRocDivergenceCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineRocDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-roc-divergence-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineRocDivergenceCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-divergence-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders ROC path and zero line', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineRocDivergenceCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-divergence-cross-roc-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-divergence-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineRocDivergenceCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-divergence-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineRocDivergenceCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-roc-divergence-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 12');
    expect(badge?.textContent).toContain('divergences');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineRocDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-roc-divergence-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Rate Of Change oscillator divergence-cross chart',
    );
  });

  it('exposes non-zero cross-count for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineRocDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-roc-divergence-cross"]',
    );
    const crossCount = Number(root?.getAttribute('data-cross-count'));
    expect(crossCount).toBeGreaterThan(0);
  });

  it('exposes zero cross-count for LINEAR DOWN', () => {
    const data = buildLinearDown(60);
    const { container } = render(<ChartLineRocDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-roc-divergence-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineRocDivergenceCross data={data} hiddenSeries={['roc']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-divergence-cross-roc-path"]',
      ),
    ).toBeNull();
  });

  it('renders two legend buttons (close, ROC)', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineRocDivergenceCross data={data} />);
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-roc-divergence-cross-legend"] button',
    );
    expect(buttons).toHaveLength(2);
  });

  it('exposes divergent-bearish count for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineRocDivergenceCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-roc-divergence-cross"]',
    );
    const c = Number(root?.getAttribute('data-divergent-bearish-count'));
    expect(c).toBeGreaterThan(0);
  });
});
