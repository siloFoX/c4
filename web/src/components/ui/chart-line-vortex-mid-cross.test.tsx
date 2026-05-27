import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineVortexMidCross,
  DEFAULT_CHART_LINE_VORTEX_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PERIOD,
  DEFAULT_CHART_LINE_VORTEX_MID_CROSS_WIDTH,
  classifyLineVortexMidCrossBias,
  classifyLineVortexMidCrossRegime,
  computeLineVortexMidCross,
  computeLineVortexMidCrossLayout,
  describeLineVortexMidCrossChart,
  detectLineVortexMidCrossCrosses,
  getLineVortexMidCrossFinitePoints,
  normalizeLineVortexMidCrossLength,
  runLineVortexMidCross,
  type ChartLineVortexMidCrossPoint,
} from './chart-line-vortex-mid-cross';

const PERIOD = 14;
const WARMUP = PERIOD; // direct VI+ vs VI- compare, no signal SMA

const buildConstBand = (
  n: number,
  k: number,
): ChartLineVortexMidCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineVortexMidCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineVortexMidCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineVortexMidCross defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_VORTEX_MID_CROSS_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_VORTEX_MID_CROSS_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PANEL_GAP).toBe(12);
  });

  it('exports canonical Vortex tuning', () => {
    expect(DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PERIOD).toBe(14);
  });
});

describe('getLineVortexMidCrossFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineVortexMidCrossFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineVortexMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineVortexMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineVortexMidCrossFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineVortexMidCrossLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineVortexMidCrossLength(14.7, 14)).toBe(14);
    expect(normalizeLineVortexMidCrossLength(0, 14)).toBe(14);
    expect(normalizeLineVortexMidCrossLength(NaN, 14)).toBe(14);
  });
});

describe('computeLineVortexMidCross CONST band', () => {
  it('VI+ = 1, VI- = 1 from warmup', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineVortexMidCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.vortexPos[i] as number).toBeCloseTo(1, 9);
      expect(out.vortexNeg[i] as number).toBeCloseTo(1, 9);
    }
  });
});

describe('computeLineVortexMidCross LINEAR UP', () => {
  it('VI+ = 1.5, VI- = 0.5 from warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineVortexMidCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.vortexPos[i] as number).toBeCloseTo(1.5, 9);
      expect(out.vortexNeg[i] as number).toBeCloseTo(0.5, 9);
    }
  });
});

describe('computeLineVortexMidCross LINEAR DOWN', () => {
  it('VI+ = 0.5, VI- = 1.5 from warmup', () => {
    const data = buildLinearDown(40);
    const out = computeLineVortexMidCross(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.vortexPos[i] as number).toBeCloseTo(0.5, 9);
      expect(out.vortexNeg[i] as number).toBeCloseTo(1.5, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineVortexMidCross([])).toEqual({
      vmPlus: [],
      vmMinus: [],
      trueRange: [],
      vortexPos: [],
      vortexNeg: [],
    });
  });
});

describe('classifyLineVortexMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineVortexMidCrossRegime(null, 1)).toBe('none');
  });
  it('VI+ >= VI- -> bullish', () => {
    expect(classifyLineVortexMidCrossRegime(1, 1)).toBe('bullish');
    expect(classifyLineVortexMidCrossRegime(1.5, 0.5)).toBe('bullish');
  });
  it('VI+ < VI- -> bearish', () => {
    expect(classifyLineVortexMidCrossRegime(0.5, 1.5)).toBe('bearish');
  });
});

describe('classifyLineVortexMidCrossBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineVortexMidCrossBias(1.5, 1)).toBe('up');
    expect(classifyLineVortexMidCrossBias(0.5, 1)).toBe('down');
    expect(classifyLineVortexMidCrossBias(1, 1)).toBe('flat');
    expect(classifyLineVortexMidCrossBias(null, 1)).toBe('none');
  });
});

describe('detectLineVortexMidCrossCrosses', () => {
  it('detects bullish trigger (VI+ rising through VI- -- trend reversal up)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const vp: Array<number | null> = [0.4, 0.5, 1.0, 1.1];
    const vn: Array<number | null> = [0.6, 0.6, 0.9, 0.9];
    const out = detectLineVortexMidCrossCrosses(series, vp, vn);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger (VI+ falling through VI- -- trend reversal down)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const vp: Array<number | null> = [1.1, 1.0, 0.5, 0.4];
    const vn: Array<number | null> = [0.9, 0.9, 0.6, 0.6];
    const out = detectLineVortexMidCrossCrosses(series, vp, vn);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const vp: Array<number | null> = [null, null, 0.5, 0.7];
    const vn: Array<number | null> = [null, null, 0.4, 0.4];
    expect(detectLineVortexMidCrossCrosses(series, vp, vn)).toHaveLength(0);
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const vp: Array<number | null> = [0.4, 0.5, 0.6, 0.7, 0.8];
    const vn: Array<number | null> = [0.5, 0.4, 0.4, 0.4, 0.4];
    expect(detectLineVortexMidCrossCrosses(series, vp, vn)).toHaveLength(1);
  });
});

describe('runLineVortexMidCross CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band centred at ${K}: VI+ = 1, VI- = 1, all bullish (==), 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineVortexMidCross(data);
      expect(run.period).toBe(PERIOD);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.vortexPosValues[i]).toBeNull();
        expect(run.vortexNegValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.vortexPosValues[i] as number).toBeCloseTo(1, 9);
        expect(run.vortexNegValues[i] as number).toBeCloseTo(1, 9);
        expect(run.samples[i]?.regime).toBe('bullish');
      }
      expect(run.bullishCount).toBe(60 - WARMUP);
      expect(run.bearishCount).toBe(0);
      expect(run.noneCount).toBe(WARMUP);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineVortexMidCross LINEAR UP', () => {
  it('LINEAR UP: VI+ = 1.5 > VI- = 0.5, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineVortexMidCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      expect(run.vortexPosValues[i] as number).toBeCloseTo(1.5, 9);
      expect(run.vortexNegValues[i] as number).toBeCloseTo(0.5, 9);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVortexMidCross LINEAR DOWN', () => {
  it('LINEAR DOWN: VI+ = 0.5 < VI- = 1.5, all bearish, 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineVortexMidCross(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bearish');
      expect(run.vortexPosValues[i] as number).toBeCloseTo(0.5, 9);
      expect(run.vortexNegValues[i] as number).toBeCloseTo(1.5, 9);
    }
    expect(run.bearishCount).toBe(60 - WARMUP);
    expect(run.bullishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineVortexMidCross misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineVortexMidCrossPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineVortexMidCross(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(10, 50);
    const run = runLineVortexMidCross(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineVortexMidCross([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineVortexMidCross(data, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineVortexMidCross(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });

  it('VM+, VM-, TR are valid from i>=1', () => {
    const data = buildConstBand(20, 50);
    const run = runLineVortexMidCross(data);
    expect(run.vmPlus[0]).toBeNull();
    expect(run.vmMinus[0]).toBeNull();
    expect(run.trueRange[0]).toBeNull();
    expect(run.vmPlus[1]).toBeCloseTo(2, 9);
    expect(run.vmMinus[1]).toBeCloseTo(2, 9);
    expect(run.trueRange[1]).toBeCloseTo(2, 9);
  });

  it('VI+ - VI- = +1 on LINEAR UP, -1 on LINEAR DOWN', () => {
    const runUp = runLineVortexMidCross(buildLinearUp(60));
    const runDown = runLineVortexMidCross(buildLinearDown(60));
    for (let i = WARMUP; i < 60; i += 1) {
      const dUp =
        (runUp.vortexPosValues[i] as number) -
        (runUp.vortexNegValues[i] as number);
      const dDown =
        (runDown.vortexPosValues[i] as number) -
        (runDown.vortexNegValues[i] as number);
      expect(dUp).toBeCloseTo(1, 9);
      expect(dDown).toBeCloseTo(-1, 9);
    }
  });
});

describe('computeLineVortexMidCrossLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineVortexMidCrossLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.vortexPosPath).toContain('M ');
    expect(layout.vortexNegPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineVortexMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.vortexPosPath).toBe('');
    expect(layout.vortexNegPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineVortexMidCrossLayout({
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
    const data = buildConstBand(60, 100);
    const layout = computeLineVortexMidCrossLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineVortexMidCrossChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineVortexMidCrossChart([])).toBe('No data');
  });

  it('mentions bar count, period, trend reversal', () => {
    const desc = describeLineVortexMidCrossChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('trend reversal');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineVortexMidCross /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexMidCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-mid-cross"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineVortexMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders both vortex paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-mid-cross-vortex-pos-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-mid-cross-vortex-neg-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVortexMidCross data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-mid-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-vortex-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexMidCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-mid-cross"]',
    );
    expect(root?.getAttribute('aria-label')).toBe('Vortex mid-cross chart');
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineVortexMidCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-mid-cross"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('exposes data-bearish-count for LINEAR DOWN', () => {
    const data = buildLinearDown(60);
    const { container } = render(<ChartLineVortexMidCross data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-vortex-mid-cross"]',
    );
    expect(root?.getAttribute('data-bearish-count')).toBe(
      String(60 - WARMUP),
    );
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineVortexMidCross data={data} hiddenSeries={['vortexNeg']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-mid-cross-vortex-neg-path"]',
      ),
    ).toBeNull();
  });
});
