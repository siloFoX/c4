import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLinePsarFlipCross,
  DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_MAX_STEP,
  DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PADDING,
  DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_STEP,
  DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_WIDTH,
  classifyLinePsarFlipCrossBias,
  classifyLinePsarFlipCrossRegime,
  computeLinePsarFlipCross,
  computeLinePsarFlipCrossLayout,
  describeLinePsarFlipCrossChart,
  detectLinePsarFlipCrossCrosses,
  getLinePsarFlipCrossFinitePoints,
  normalizeLinePsarFlipCrossStep,
  runLinePsarFlipCross,
  type ChartLinePsarFlipCrossPoint,
} from './chart-line-psar-flip-cross';

const buildConst = (n: number, k: number): ChartLinePsarFlipCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, value: k }));

const buildLinearUp = (n: number): ChartLinePsarFlipCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, value: i }));

const buildLinearDown = (n: number): ChartLinePsarFlipCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, value: -i }));

// A series that reverses direction at midpoint to provoke a SAR flip.
// Linear up 0..19 then linear down from 19.
const buildPeak = (n: number): ChartLinePsarFlipCrossPoint[] => {
  const half = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i) => ({
    x: i,
    value: i < half ? i : 2 * (half - 1) - i + (half - 1),
  }));
};

describe('ChartLinePsarFlipCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Wilder SAR tuning', () => {
    expect(DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_STEP).toBeCloseTo(0.02, 6);
    expect(DEFAULT_CHART_LINE_PSAR_FLIP_CROSS_MAX_STEP).toBeCloseTo(0.2, 6);
  });
});

describe('getLinePsarFlipCrossFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, value: 1.5 },
      { x: NaN, value: 1.5 },
      { x: 2, value: Infinity },
      { x: 3, value: 2 },
    ];
    expect(getLinePsarFlipCrossFinitePoints(points)).toEqual([
      { x: 0, value: 1.5 },
      { x: 3, value: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLinePsarFlipCrossFinitePoints(null)).toEqual([]);
    expect(getLinePsarFlipCrossFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLinePsarFlipCrossStep', () => {
  it('keeps positive finite values', () => {
    expect(normalizeLinePsarFlipCrossStep(0.05, 0.02)).toBeCloseTo(0.05, 6);
  });
  it('falls back on non-positive or non-finite', () => {
    expect(normalizeLinePsarFlipCrossStep(0, 0.02)).toBeCloseTo(0.02, 6);
    expect(normalizeLinePsarFlipCrossStep(-1, 0.02)).toBeCloseTo(0.02, 6);
    expect(normalizeLinePsarFlipCrossStep(NaN, 0.02)).toBeCloseTo(0.02, 6);
  });
});

describe('computeLinePsarFlipCross CONST', () => {
  it('SAR = K constant for all bars', () => {
    const data = buildConst(40, 50);
    const out = computeLinePsarFlipCross(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.sar[i] as number).toBe(50);
    }
  });

  it('trend stays up throughout (no reversal)', () => {
    const data = buildConst(40, 50);
    const out = computeLinePsarFlipCross(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.trends[i]).toBe('up');
    }
    expect(out.reversed.filter(Boolean)).toHaveLength(0);
  });
});

describe('computeLinePsarFlipCross LINEAR UP', () => {
  it('trend stays up throughout (no piercing)', () => {
    const data = buildLinearUp(40);
    const out = computeLinePsarFlipCross(data);
    for (let i = 1; i < 40; i += 1) {
      expect(out.trends[i]).toBe('up');
    }
    expect(out.reversed.filter(Boolean)).toHaveLength(0);
  });

  it('SAR exists for every bar', () => {
    const data = buildLinearUp(40);
    const out = computeLinePsarFlipCross(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.sar[i]).not.toBeNull();
    }
  });
});

describe('computeLinePsarFlipCross LINEAR DOWN', () => {
  it('trend stays down throughout (no piercing)', () => {
    const data = buildLinearDown(40);
    const out = computeLinePsarFlipCross(data);
    for (let i = 1; i < 40; i += 1) {
      expect(out.trends[i]).toBe('down');
    }
    expect(out.reversed.filter(Boolean)).toHaveLength(0);
  });

  it('returns empty for empty data', () => {
    expect(computeLinePsarFlipCross([])).toEqual({
      sar: [],
      trends: [],
      reversed: [],
    });
  });

  it('handles single-point input (no second value to seed trend)', () => {
    const out = computeLinePsarFlipCross([{ x: 0, value: 10 }]);
    expect(out.sar).toHaveLength(1);
    expect(out.sar[0]).toBeNull();
    expect(out.trends[0]).toBeNull();
  });
});

describe('computeLinePsarFlipCross PEAK (reverses)', () => {
  it('produces at least one flip in a reversing series', () => {
    const data = buildPeak(60);
    const out = computeLinePsarFlipCross(data);
    expect(out.reversed.filter(Boolean).length).toBeGreaterThan(0);
  });
});

describe('classifyLinePsarFlipCrossRegime', () => {
  it('null trend -> none', () => {
    expect(classifyLinePsarFlipCrossRegime(null)).toBe('none');
  });
  it('trend up -> bullish', () => {
    expect(classifyLinePsarFlipCrossRegime('up')).toBe('bullish');
  });
  it('trend down -> bearish', () => {
    expect(classifyLinePsarFlipCrossRegime('down')).toBe('bearish');
  });
});

describe('classifyLinePsarFlipCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLinePsarFlipCrossBias(60, 50)).toBe('up');
    expect(classifyLinePsarFlipCrossBias(40, 50)).toBe('down');
    expect(classifyLinePsarFlipCrossBias(50, 50)).toBe('flat');
    expect(classifyLinePsarFlipCrossBias(null, 50)).toBe('none');
    expect(classifyLinePsarFlipCrossBias(50, null)).toBe('none');
  });
});

describe('detectLinePsarFlipCrossCrosses', () => {
  it('fires BULLISH on down -> up trend flip', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const trends: Array<'up' | 'down' | null> = ['down', 'down', 'up'];
    const sar: Array<number | null> = [5, 5, 0];
    const out = detectLinePsarFlipCrossCrosses(series, trends, sar);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires BEARISH on up -> down trend flip', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const trends: Array<'up' | 'down' | null> = ['up', 'up', 'down'];
    const sar: Array<number | null> = [0, 0, 10];
    const out = detectLinePsarFlipCrossCrosses(series, trends, sar);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not fire when trend stays the same', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const trends: Array<'up' | 'down' | null> = ['up', 'up', 'up', 'up'];
    const sar: Array<number | null> = [0, 1, 2, 3];
    const out = detectLinePsarFlipCrossCrosses(series, trends, sar);
    expect(out).toHaveLength(0);
  });

  it('skips null-trend bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const trends: Array<'up' | 'down' | null> = [null, 'down', 'down', 'up'];
    const sar: Array<number | null> = [null, 5, 5, 0];
    // i=1: prev=null, skip. i=2: down->down, no flip. i=3: down->up, BULLISH.
    const out = detectLinePsarFlipCrossCrosses(series, trends, sar);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('bias reflects SAR jump direction', () => {
    const series = Array.from({ length: 2 }, (_, i) => ({
      x: i,
      value: i,
    }));
    const trends: Array<'up' | 'down' | null> = ['down', 'up'];
    const sar: Array<number | null> = [10, 2];
    // SAR fell from 10 to 2 -> bias 'down'
    const out = detectLinePsarFlipCrossCrosses(series, trends, sar);
    expect(out[0]?.bias).toBe('down');
  });
});

describe('runLinePsarFlipCross CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: trend stays up, SAR = K, 0 flips`, () => {
      const data = buildConst(40, K);
      const run = runLinePsarFlipCross(data);
      expect(run.step).toBeCloseTo(0.02, 6);
      for (let i = 0; i < 40; i += 1) {
        expect(run.sarValues[i] as number).toBe(K);
        expect(run.trendValues[i]).toBe('up');
      }
      expect(run.bullishCount).toBe(40);
      expect(run.bearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.reversalCount).toBe(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLinePsarFlipCross LINEAR UP', () => {
  it('0 flips and regime predominantly bullish', () => {
    const data = buildLinearUp(40);
    const run = runLinePsarFlipCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(40);
    expect(run.bearishCount).toBe(0);
    expect(run.reversalCount).toBe(0);
  });
});

describe('runLinePsarFlipCross LINEAR DOWN', () => {
  it('0 flips and regime predominantly bearish', () => {
    const data = buildLinearDown(40);
    const run = runLinePsarFlipCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(40);
    expect(run.reversalCount).toBe(0);
  });
});

describe('runLinePsarFlipCross PEAK', () => {
  it('produces at least one bearish flip when uptrend reverses to downtrend', () => {
    const data = buildPeak(60);
    const run = runLinePsarFlipCross(data);
    expect(run.crosses.length).toBeGreaterThan(0);
    const hasBearish = run.crosses.some((c) => c.kind === 'bearish');
    expect(hasBearish).toBe(true);
  });
});

describe('runLinePsarFlipCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLinePsarFlipCrossPoint[] = [
      { x: 2, value: 1 },
      { x: 0, value: 1 },
      { x: 1, value: 1 },
    ];
    const run = runLinePsarFlipCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data: ChartLinePsarFlipCrossPoint[] = [{ x: 0, value: 50 }];
    const run = runLinePsarFlipCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLinePsarFlipCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom step', () => {
    const data = buildLinearUp(40);
    const run = runLinePsarFlipCross(data, { step: 0.05 });
    expect(run.step).toBeCloseTo(0.05, 6);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLinePsarFlipCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });

  it('cross counts match crosses length', () => {
    const data = buildPeak(60);
    const run = runLinePsarFlipCross(data);
    expect(run.bullishCrossCount + run.bearishCrossCount).toBe(
      run.crosses.length,
    );
  });
});

describe('computeLinePsarFlipCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLinePsarFlipCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.sarPath).toContain('M ');
  });

  it('LINEAR UP produces 0 cross markers', () => {
    const layout = computeLinePsarFlipCrossLayout({
      data: buildLinearUp(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('PEAK produces at least one cross marker', () => {
    const layout = computeLinePsarFlipCrossLayout({
      data: buildPeak(60),
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
  });

  it('falls back when no data', () => {
    const layout = computeLinePsarFlipCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.sarPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLinePsarFlipCrossLayout({
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
    const layout = computeLinePsarFlipCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });

  it('pads degenerate oscMin === oscMax', () => {
    const data = buildConst(40, 100);
    const layout = computeLinePsarFlipCrossLayout({ data });
    expect(layout.oscMin).toBe(99);
    expect(layout.oscMax).toBe(101);
  });
});

describe('describeLinePsarFlipCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLinePsarFlipCrossChart([])).toBe('No data');
  });

  it('mentions bar count, step, trailing stop reversal flip', () => {
    const desc = describeLinePsarFlipCrossChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('step 0.02');
    expect(desc).toContain('trailing stop reversal flip');
  });
});

describe('<ChartLinePsarFlipCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLinePsarFlipCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-psar-flip-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-total-points')).toBe('40');
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLinePsarFlipCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-flip-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders SAR path', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLinePsarFlipCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-flip-cross-sar-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLinePsarFlipCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-flip-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLinePsarFlipCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-psar-flip-cross-badge"]',
    );
    expect(badge?.textContent).toContain('step 0.02');
    expect(badge?.textContent).toContain('flips 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLinePsarFlipCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-psar-flip-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Parabolic SAR direction flip-cross chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLinePsarFlipCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-psar-flip-cross"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
    expect(root?.getAttribute('data-reversal-count')).toBe('0');
  });

  it('exposes non-zero cross count for PEAK input', () => {
    const data = buildPeak(60);
    const { container } = render(<ChartLinePsarFlipCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-psar-flip-cross"]',
    );
    const crossCount = Number(root?.getAttribute('data-cross-count'));
    expect(crossCount).toBeGreaterThan(0);
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLinePsarFlipCross data={data} hiddenSeries={['sar']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-flip-cross-sar-path"]',
      ),
    ).toBeNull();
  });

  it('renders two legend buttons (value, SAR)', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLinePsarFlipCross data={data} />);
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-psar-flip-cross-legend"] button',
    );
    expect(buttons).toHaveLength(2);
  });

  it('exposes bearish-count for LINEAR DOWN', () => {
    const data = buildLinearDown(40);
    const { container } = render(<ChartLinePsarFlipCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-psar-flip-cross"]',
    );
    const bearishCount = Number(root?.getAttribute('data-bearish-count'));
    expect(bearishCount).toBeGreaterThan(0);
  });
});
