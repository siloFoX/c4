import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineCciOversoldDivergence,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_HEIGHT,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERSOLD_LEVEL,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PADDING,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PANEL_GAP,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PERIOD,
  DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_WIDTH,
  classifyLineCciOversoldDivergenceBias,
  classifyLineCciOversoldDivergenceRegime,
  computeLineCciOversoldDivergence,
  computeLineCciOversoldDivergenceLayout,
  describeLineCciOversoldDivergenceChart,
  detectLineCciOversoldDivergenceCrosses,
  getLineCciOversoldDivergenceFinitePoints,
  normalizeLineCciOversoldDivergenceLength,
  normalizeLineCciOversoldDivergenceLevel,
  runLineCciOversoldDivergence,
  type ChartLineCciOversoldDivergencePoint,
  type ChartLineCciOversoldDivergenceRegime,
} from './chart-line-cci-oversold-divergence';

const PERIOD = 20;
const OVERSOLD = -100;
const WARMUP = PERIOD + 1; // 21

const buildConst = (
  n: number,
  k: number,
): ChartLineCciOversoldDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineCciOversoldDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (
  n: number,
): ChartLineCciOversoldDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineCciOversoldDivergence defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PANEL_GAP).toBe(12);
  });

  it('exports canonical Lambert tuning', () => {
    expect(DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_PERIOD).toBe(20);
    expect(DEFAULT_CHART_LINE_CCI_OVERSOLD_DIVERGENCE_OVERSOLD_LEVEL).toBe(
      -100,
    );
  });
});

describe('getLineCciOversoldDivergenceFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineCciOversoldDivergenceFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineCciOversoldDivergenceFinitePoints(null)).toEqual([]);
    expect(getLineCciOversoldDivergenceFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineCciOversoldDivergenceLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineCciOversoldDivergenceLength(20.7, 20)).toBe(20);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineCciOversoldDivergenceLength(0, 20)).toBe(20);
    expect(normalizeLineCciOversoldDivergenceLength(NaN, 20)).toBe(20);
  });
});

describe('normalizeLineCciOversoldDivergenceLevel', () => {
  it('keeps finite values (including negatives)', () => {
    expect(normalizeLineCciOversoldDivergenceLevel(150, -100)).toBe(150);
    expect(normalizeLineCciOversoldDivergenceLevel(-50, -100)).toBe(-50);
  });
  it('falls back on non-finite', () => {
    expect(normalizeLineCciOversoldDivergenceLevel(NaN, -100)).toBe(-100);
    expect(normalizeLineCciOversoldDivergenceLevel(Infinity, -100)).toBe(
      -100,
    );
  });
});

describe('computeLineCciOversoldDivergence CONST', () => {
  it('CCI = null throughout (MAD = 0 -> divide-by-zero guard)', () => {
    const data = buildConst(40, 50);
    const out = computeLineCciOversoldDivergence(data);
    for (let i = 0; i < 40; i += 1) expect(out[i]).toBeNull();
  });
});

describe('computeLineCciOversoldDivergence LINEAR UP', () => {
  it('CCI = ~+126.67 (constant) -- in overbought, NOT oversold', () => {
    const data = buildLinearUp(40);
    const out = computeLineCciOversoldDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo(126.667, 2);
    }
  });
});

describe('computeLineCciOversoldDivergence LINEAR DOWN', () => {
  it('CCI = ~-126.67 (mirror constant) -- IN oversold zone', () => {
    const data = buildLinearDown(40);
    const out = computeLineCciOversoldDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo(-126.667, 2);
      expect(out[i] as number).toBeLessThan(OVERSOLD);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineCciOversoldDivergence([])).toEqual([]);
  });
});

describe('classifyLineCciOversoldDivergenceRegime', () => {
  it('null inputs -> none', () => {
    expect(classifyLineCciOversoldDivergenceRegime(null, 1, 1, 1)).toBe(
      'none',
    );
    expect(classifyLineCciOversoldDivergenceRegime(1, null, 1, 1)).toBe(
      'none',
    );
    expect(classifyLineCciOversoldDivergenceRegime(1, 1, null, 1)).toBe(
      'none',
    );
    expect(classifyLineCciOversoldDivergenceRegime(1, 1, 1, null)).toBe(
      'none',
    );
  });

  it('price up + CCI up -> aligned-bullish', () => {
    expect(
      classifyLineCciOversoldDivergenceRegime(10, 5, -50, -150),
    ).toBe('aligned-bullish');
  });

  it('price down + CCI down -> aligned-bearish', () => {
    expect(
      classifyLineCciOversoldDivergenceRegime(5, 10, -150, -50),
    ).toBe('aligned-bearish');
  });

  it('price down + CCI up -> divergent-bullish (PRIMARY at oversold)', () => {
    expect(
      classifyLineCciOversoldDivergenceRegime(5, 10, -50, -150),
    ).toBe('divergent-bullish');
  });

  it('price up + CCI down -> divergent-bearish', () => {
    expect(
      classifyLineCciOversoldDivergenceRegime(10, 5, -150, -50),
    ).toBe('divergent-bearish');
  });

  it('flat price or flat CCI -> none', () => {
    expect(
      classifyLineCciOversoldDivergenceRegime(5, 5, -100, -50),
    ).toBe('none');
    expect(
      classifyLineCciOversoldDivergenceRegime(10, 5, -100, -100),
    ).toBe('none');
  });
});

describe('classifyLineCciOversoldDivergenceBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineCciOversoldDivergenceBias(-50, -100)).toBe('up');
    expect(classifyLineCciOversoldDivergenceBias(-100, -50)).toBe('down');
    expect(classifyLineCciOversoldDivergenceBias(-100, -100)).toBe('flat');
    expect(classifyLineCciOversoldDivergenceBias(null, -100)).toBe('none');
    expect(classifyLineCciOversoldDivergenceBias(-100, null)).toBe('none');
  });
});

describe('detectLineCciOversoldDivergenceCrosses', () => {
  it('fires BULLISH on entry into divergent-bullish IN oversold zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOversoldDivergenceRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const cci: Array<number | null> = [-150, -180, -150]; // all <= -100
    const out = detectLineCciOversoldDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERSOLD,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('does NOT fire when divergent-bullish but CCI ABOVE oversold zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOversoldDivergenceRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const cci: Array<number | null> = [-50, -60, -50]; // all > -100
    const out = detectLineCciOversoldDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERSOLD,
    );
    expect(out).toHaveLength(0);
  });

  it('fires BEARISH on entry into divergent-bearish IN oversold zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOversoldDivergenceRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const cci: Array<number | null> = [-120, -110, -150]; // all <= -100
    const out = detectLineCciOversoldDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERSOLD,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire when state persists (no transition)', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOversoldDivergenceRegime[] = [
      'divergent-bullish',
      'divergent-bullish',
      'divergent-bullish',
    ];
    const cci: Array<number | null> = [-150, -150, -150];
    const out = detectLineCciOversoldDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERSOLD,
    );
    expect(out).toHaveLength(0);
  });

  it('skips null CCI bars', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOversoldDivergenceRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const cci: Array<number | null> = [null, null, null];
    const out = detectLineCciOversoldDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERSOLD,
    );
    expect(out).toHaveLength(0);
  });

  it('bias up when CCI rises at the cross', () => {
    const series = Array.from({ length: 2 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOversoldDivergenceRegime[] = [
      'aligned-bearish',
      'divergent-bullish',
    ];
    const cci: Array<number | null> = [-180, -150];
    const out = detectLineCciOversoldDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERSOLD,
    );
    expect(out[0]?.bias).toBe('up');
  });
});

describe('runLineCciOversoldDivergence CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: CCI = null (MAD=0), regime none, 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineCciOversoldDivergence(data);
      expect(run.period).toBe(PERIOD);
      expect(run.oversoldLevel).toBe(OVERSOLD);
      for (let i = 0; i < 40; i += 1) {
        expect(run.cciValues[i]).toBeNull();
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineCciOversoldDivergence LINEAR UP', () => {
  it('CCI in overbought (NOT oversold), 0 crosses (gate filters)', () => {
    const data = buildLinearUp(40);
    const run = runLineCciOversoldDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.cciValues[i] as number).toBeCloseTo(126.667, 2);
    }
    expect(run.oversoldCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCciOversoldDivergence LINEAR DOWN', () => {
  it('CCI = -126.67 in oversold zone, flat slope -> regime none, 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineCciOversoldDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.cciValues[i] as number).toBeCloseTo(-126.667, 2);
    }
    expect(run.oversoldCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCciOversoldDivergence oversold-zone gating', () => {
  it('LINEAR UP CCI outside oversold zone -> 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineCciOversoldDivergence(data);
    expect(run.oversoldCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });

  it('LINEAR DOWN CCI in oversold but flat slope -> 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineCciOversoldDivergence(data);
    expect(run.oversoldCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCciOversoldDivergence misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineCciOversoldDivergencePoint[] = [
      { x: 2, high: 2, low: 0, close: 1 },
      { x: 0, high: 2, low: 0, close: 1 },
      { x: 1, high: 2, low: 0, close: 1 },
    ];
    const run = runLineCciOversoldDivergence(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(WARMUP, 50);
    const run = runLineCciOversoldDivergence(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineCciOversoldDivergence([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and oversoldLevel', () => {
    const data = buildLinearDown(40);
    const run = runLineCciOversoldDivergence(data, {
      period: 10,
      oversoldLevel: -150,
    });
    expect(run.period).toBe(10);
    expect(run.oversoldLevel).toBe(-150);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearDown(40);
    const run = runLineCciOversoldDivergence(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(40);
  });
});

describe('computeLineCciOversoldDivergenceLayout', () => {
  it('renders SVG paths for LINEAR DOWN', () => {
    const data = buildLinearDown(40);
    const layout = computeLineCciOversoldDivergenceLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.cciPath).toContain('M ');
  });

  it('LINEAR UP produces 0 cross markers (CCI outside oversold)', () => {
    const layout = computeLineCciOversoldDivergenceLayout({
      data: buildLinearUp(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('LINEAR DOWN produces 0 cross markers (CCI in oversold but flat)', () => {
    const layout = computeLineCciOversoldDivergenceLayout({
      data: buildLinearDown(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineCciOversoldDivergenceLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cciPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineCciOversoldDivergenceLayout({
      data: buildLinearDown(40),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('renders overbought / oversold / zero reference lines', () => {
    const layout = computeLineCciOversoldDivergenceLayout({
      data: buildLinearDown(40),
    });
    // overbought line at +100 is at top half (smaller y)
    // oversold line at -100 is at bottom half (larger y)
    // zero line between them
    expect(layout.overboughtLineY).toBeLessThan(layout.zeroLineY);
    expect(layout.oversoldLineY).toBeGreaterThan(layout.zeroLineY);
  });
});

describe('describeLineCciOversoldDivergenceChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineCciOversoldDivergenceChart([])).toBe('No data');
  });

  it('mentions bar count, period, oversold, bottom reversal warning', () => {
    const desc = describeLineCciOversoldDivergenceChart(buildLinearDown(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 20');
    expect(desc).toContain('oversold -100');
    expect(desc).toContain('bottom reversal warning');
  });
});

describe('<ChartLineCciOversoldDivergence /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-oversold-divergence"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-oversold-level')).toBe(String(OVERSOLD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineCciOversoldDivergence data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-divergence-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders CCI path and reference lines', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-divergence-cci-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-divergence-oversold-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-divergence-overbought-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-divergence-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-divergence-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-cci-oversold-divergence-badge"]',
    );
    expect(badge?.textContent).toContain('period 20');
    expect(badge?.textContent).toContain('oversold -100');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-oversold-divergence"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'CCI oversold-zone divergence chart',
    );
  });

  it('exposes data-cross-count counter (zero for flat LINEAR DOWN)', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-oversold-divergence"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence
        data={data}
        hiddenSeries={['cci']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-oversold-divergence-cci-path"]',
      ),
    ).toBeNull();
  });

  it('renders two legend buttons (close, CCI)', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence data={data} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-cci-oversold-divergence-legend"] button',
    );
    expect(buttons).toHaveLength(2);
  });

  it('exposes data-oversold-count counter (> 0 for LINEAR DOWN)', () => {
    const data = buildLinearDown(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-oversold-divergence"]',
    );
    const c = Number(root?.getAttribute('data-oversold-count'));
    expect(c).toBeGreaterThan(0);
  });

  it('exposes data-oversold-count = 0 for LINEAR UP (CCI outside zone)', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineCciOversoldDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-oversold-divergence"]',
    );
    expect(root?.getAttribute('data-oversold-count')).toBe('0');
  });
});
