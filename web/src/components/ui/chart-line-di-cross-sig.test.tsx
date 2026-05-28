import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineDiCrossSig,
  DEFAULT_CHART_LINE_DI_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_DI_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_DI_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_DI_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_DI_CROSS_SIG_WIDTH,
  classifyLineDiCrossSigBias,
  classifyLineDiCrossSigRegime,
  computeLineDiCrossSig,
  computeLineDiCrossSigLayout,
  describeLineDiCrossSigChart,
  detectLineDiCrossSigCrosses,
  getLineDiCrossSigFinitePoints,
  normalizeLineDiCrossSigLength,
  runLineDiCrossSig,
  type ChartLineDiCrossSigPoint,
} from './chart-line-di-cross-sig';

const PERIOD = 14;
const WARMUP = PERIOD + 1; // 15

const buildConstBand = (
  n: number,
  k: number,
): ChartLineDiCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineDiCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineDiCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineDiCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_DI_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_DI_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_DI_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_DI_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical Wilder DI tuning', () => {
    expect(DEFAULT_CHART_LINE_DI_CROSS_SIG_PERIOD).toBe(14);
  });
});

describe('getLineDiCrossSigFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineDiCrossSigFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineDiCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineDiCrossSigFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineDiCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineDiCrossSigLength(14.7, 14)).toBe(14);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineDiCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineDiCrossSigLength(-1, 14)).toBe(14);
    expect(normalizeLineDiCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('computeLineDiCrossSig CONST band', () => {
  it('+DI = -DI = 0 (no directional movement)', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineDiCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.plusDI[i] as number).toBe(0);
      expect(out.minusDI[i] as number).toBe(0);
    }
  });
});

describe('computeLineDiCrossSig LINEAR UP', () => {
  it('+DI = 50, -DI = 0 (bulls dominate continuously)', () => {
    const data = buildLinearUp(40);
    const out = computeLineDiCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.plusDI[i] as number).toBeCloseTo(50, 9);
      expect(out.minusDI[i] as number).toBe(0);
    }
  });
});

describe('computeLineDiCrossSig LINEAR DOWN', () => {
  it('+DI = 0, -DI = 50 (mirror: bears dominate continuously)', () => {
    const data = buildLinearDown(40);
    const out = computeLineDiCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.plusDI[i] as number).toBe(0);
      expect(out.minusDI[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineDiCrossSig([])).toEqual({ plusDI: [], minusDI: [] });
  });
});

describe('classifyLineDiCrossSigRegime', () => {
  it('null inputs -> none', () => {
    expect(classifyLineDiCrossSigRegime(null, 10)).toBe('none');
    expect(classifyLineDiCrossSigRegime(10, null)).toBe('none');
    expect(classifyLineDiCrossSigRegime(null, null)).toBe('none');
  });
  it('+DI > -DI -> bullish', () => {
    expect(classifyLineDiCrossSigRegime(30, 10)).toBe('bullish');
  });
  it('+DI === -DI -> bullish (via >=)', () => {
    expect(classifyLineDiCrossSigRegime(20, 20)).toBe('bullish');
    expect(classifyLineDiCrossSigRegime(0, 0)).toBe('bullish');
  });
  it('+DI < -DI -> bearish', () => {
    expect(classifyLineDiCrossSigRegime(10, 30)).toBe('bearish');
  });
});

describe('classifyLineDiCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineDiCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineDiCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineDiCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineDiCrossSigBias(null, 50)).toBe('none');
    expect(classifyLineDiCrossSigBias(50, null)).toBe('none');
  });
});

describe('detectLineDiCrossSigCrosses', () => {
  it('fires BULLISH when +DI crosses up through -DI (bulls overtake)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const plusDI: Array<number | null> = [10, 20, 35, 40];
    const minusDI: Array<number | null> = [30, 25, 20, 15];
    // i=1: prev (10<=30) cur (20<=25) -> no cross
    // i=2: prev (20<=25) cur (35>20) -> BULLISH
    const out = detectLineDiCrossSigCrosses(series, plusDI, minusDI);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires BEARISH when +DI crosses down through -DI (bears overtake)', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const plusDI: Array<number | null> = [30, 25, 15, 10];
    const minusDI: Array<number | null> = [10, 20, 30, 35];
    // i=1: prev (30>=10) cur (25>20) -> no cross
    // i=2: prev (25>=20) cur (15<30) -> BEARISH
    const out = detectLineDiCrossSigCrosses(series, plusDI, minusDI);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
    expect(out[0]?.index).toBe(2);
  });

  it('does not fire when DI values remain on same side', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const plusDI: Array<number | null> = [30, 35, 40, 45];
    const minusDI: Array<number | null> = [10, 15, 20, 25];
    const out = detectLineDiCrossSigCrosses(series, plusDI, minusDI);
    expect(out).toHaveLength(0);
  });

  it('skips bars with null DI values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const plusDI: Array<number | null> = [null, null, 20, 35];
    const minusDI: Array<number | null> = [null, null, 25, 20];
    // i=2: prev null, skip. i=3: prev (20<=25) cur (35>20) -> BULLISH
    const out = detectLineDiCrossSigCrosses(series, plusDI, minusDI);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('bias up when (+DI - -DI) rises', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const plusDI: Array<number | null> = [20, 35, 40];
    const minusDI: Array<number | null> = [25, 20, 15];
    // i=1: prev diff=-5 cur diff=15 -> rising
    const out = detectLineDiCrossSigCrosses(series, plusDI, minusDI);
    expect(out[0]?.bias).toBe('up');
  });
});

describe('runLineDiCrossSig CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: +DI = -DI = 0, regime bullish, 0 crosses`, () => {
      const data = buildConstBand(40, K);
      const run = runLineDiCrossSig(data);
      expect(run.period).toBe(PERIOD);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.plusDIValues[i] as number).toBe(0);
        expect(run.minusDIValues[i] as number).toBe(0);
      }
      // +DI === -DI = 0 -> regime 'bullish' (via >=)
      expect(run.bullishCount).toBeGreaterThan(0);
      expect(run.bearishCount).toBe(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineDiCrossSig LINEAR UP', () => {
  it('+DI=50 above -DI=0 throughout, 0 crosses, regime bullish', () => {
    const data = buildLinearUp(40);
    const run = runLineDiCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.plusDIValues[i] as number).toBeCloseTo(50, 9);
      expect(run.minusDIValues[i] as number).toBe(0);
    }
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineDiCrossSig LINEAR DOWN', () => {
  it('+DI=0 below -DI=50 throughout, 0 crosses, regime bearish', () => {
    const data = buildLinearDown(40);
    const run = runLineDiCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.plusDIValues[i] as number).toBe(0);
      expect(run.minusDIValues[i] as number).toBeCloseTo(50, 9);
    }
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineDiCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineDiCrossSigPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineDiCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(15, 50);
    const run = runLineDiCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineDiCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period', () => {
    const data = buildLinearDown(60);
    const run = runLineDiCrossSig(data, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearDown(40);
    const run = runLineDiCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });

  it('exposes diffValues = +DI - -DI for audit', () => {
    const data = buildLinearUp(40);
    const run = runLineDiCrossSig(data);
    // +DI=50, -DI=0 -> diff=50
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.diffValues[i] as number).toBeCloseTo(50, 9);
    }
  });

  it('LINEAR DOWN exposes diff = -50', () => {
    const data = buildLinearDown(40);
    const run = runLineDiCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.diffValues[i] as number).toBeCloseTo(-50, 9);
    }
  });

  it('CONST band exposes diff = 0', () => {
    const data = buildConstBand(40, 100);
    const run = runLineDiCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.diffValues[i] as number).toBe(0);
    }
  });
});

describe('computeLineDiCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineDiCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.plusDIPath).toContain('M ');
    expect(layout.minusDIPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('panel hard-locked to [0, 100]', () => {
    const layout = computeLineDiCrossSigLayout({
      data: buildLinearUp(40),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('zero line renders at oscBottom', () => {
    const layout = computeLineDiCrossSigLayout({
      data: buildLinearUp(40),
    });
    expect(layout.zeroLineY).toBe(layout.oscBottom);
  });

  it('mid line renders at oscBottom - half panel', () => {
    const layout = computeLineDiCrossSigLayout({
      data: buildLinearUp(40),
    });
    const half = (layout.oscBottom - layout.oscTop) / 2;
    expect(layout.midLineY).toBeCloseTo(layout.oscBottom - half, 6);
  });

  it('falls back when no data', () => {
    const layout = computeLineDiCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.plusDIPath).toBe('');
    expect(layout.minusDIPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineDiCrossSigLayout({
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
    const data = buildConstBand(40, 100);
    const layout = computeLineDiCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineDiCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineDiCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, trend direction change', () => {
    const desc = describeLineDiCrossSigChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('trend direction change');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineDiCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineDiCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-di-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineDiCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-di-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders +DI and -DI paths and zero line', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineDiCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-di-cross-sig-plus-di-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-di-cross-sig-minus-di-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-di-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineDiCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-di-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge with period and crosses', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineDiCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-di-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineDiCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-di-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Directional Indicator +DI vs -DI cross-sig chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineDiCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-di-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineDiCrossSig data={data} hiddenSeries={['plusDI']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-di-cross-sig-plus-di-path"]',
      ),
    ).toBeNull();
  });

  it('renders three legend buttons (close, +DI, -DI)', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineDiCrossSig data={data} />);
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-di-cross-sig-legend"] button',
    );
    expect(buttons).toHaveLength(3);
  });

  it('exposes bullish-count for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineDiCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-di-cross-sig"]',
    );
    const bullishCount = Number(root?.getAttribute('data-bullish-count'));
    expect(bullishCount).toBeGreaterThan(0);
  });

  it('exposes bearish-count for LINEAR DOWN', () => {
    const data = buildLinearDown(40);
    const { container } = render(<ChartLineDiCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-di-cross-sig"]',
    );
    const bearishCount = Number(root?.getAttribute('data-bearish-count'));
    expect(bearishCount).toBeGreaterThan(0);
  });
});
