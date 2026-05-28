import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineCciOverboughtDivergence,
  DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_HEIGHT,
  DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LEVEL,
  DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_PADDING,
  DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_PANEL_GAP,
  DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_PERIOD,
  DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_WIDTH,
  classifyLineCciOverboughtDivergenceBias,
  classifyLineCciOverboughtDivergenceRegime,
  computeLineCciOverboughtDivergence,
  computeLineCciOverboughtDivergenceLayout,
  describeLineCciOverboughtDivergenceChart,
  detectLineCciOverboughtDivergenceCrosses,
  getLineCciOverboughtDivergenceFinitePoints,
  normalizeLineCciOverboughtDivergenceLength,
  normalizeLineCciOverboughtDivergenceLevel,
  runLineCciOverboughtDivergence,
  type ChartLineCciOverboughtDivergencePoint,
  type ChartLineCciOverboughtDivergenceRegime,
} from './chart-line-cci-overbought-divergence';

const PERIOD = 20;
const OVERBOUGHT = 100;
const WARMUP = PERIOD + 1; // 21

const buildConst = (
  n: number,
  k: number,
): ChartLineCciOverboughtDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineCciOverboughtDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (
  n: number,
): ChartLineCciOverboughtDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

const buildQuadraticUp = (
  n: number,
): ChartLineCciOverboughtDivergencePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i * i + 1,
    low: i * i - 1,
    close: i * i,
  }));

// Quadratic acceleration then linear continuation: CCI rises into
// overbought zone during the quadratic phase, then declines during the
// linear phase while price still rises (divergent-bearish at overbought).
const buildDeceleratingAfterPeak = (
  n: number,
): ChartLineCciOverboughtDivergencePoint[] => {
  const breakpoint = Math.floor(n / 2);
  const lastQuad = (breakpoint - 1) * (breakpoint - 1);
  return Array.from({ length: n }, (_, i) => {
    const c = i < breakpoint ? i * i : lastQuad + (i - breakpoint + 1);
    return { x: i, high: c + 1, low: c - 1, close: c };
  });
};

describe('ChartLineCciOverboughtDivergence defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_PANEL_GAP).toBe(12);
  });

  it('exports canonical Lambert tuning', () => {
    expect(DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_PERIOD).toBe(20);
    expect(DEFAULT_CHART_LINE_CCI_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LEVEL).toBe(
      100,
    );
  });
});

describe('getLineCciOverboughtDivergenceFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineCciOverboughtDivergenceFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null/non-array', () => {
    expect(getLineCciOverboughtDivergenceFinitePoints(null)).toEqual([]);
    expect(
      getLineCciOverboughtDivergenceFinitePoints(undefined),
    ).toEqual([]);
  });
});

describe('normalizeLineCciOverboughtDivergenceLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineCciOverboughtDivergenceLength(20.7, 20)).toBe(20);
  });
  it('falls back on invalid', () => {
    expect(normalizeLineCciOverboughtDivergenceLength(0, 20)).toBe(20);
    expect(normalizeLineCciOverboughtDivergenceLength(NaN, 20)).toBe(20);
  });
});

describe('normalizeLineCciOverboughtDivergenceLevel', () => {
  it('keeps finite values (including negatives)', () => {
    expect(normalizeLineCciOverboughtDivergenceLevel(150, 100)).toBe(150);
    expect(normalizeLineCciOverboughtDivergenceLevel(-50, 100)).toBe(-50);
  });
  it('falls back on non-finite', () => {
    expect(normalizeLineCciOverboughtDivergenceLevel(NaN, 100)).toBe(100);
    expect(normalizeLineCciOverboughtDivergenceLevel(Infinity, 100)).toBe(
      100,
    );
  });
});

describe('computeLineCciOverboughtDivergence CONST', () => {
  it('CCI = null throughout (MAD = 0 -> divide-by-zero guard)', () => {
    const data = buildConst(40, 50);
    const out = computeLineCciOverboughtDivergence(data);
    for (let i = 0; i < 40; i += 1) expect(out[i]).toBeNull();
  });
});

describe('computeLineCciOverboughtDivergence LINEAR UP', () => {
  it('CCI = ~126.67 (constant) from i = period - 1 onwards', () => {
    const data = buildLinearUp(40);
    const out = computeLineCciOverboughtDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo(126.667, 2);
    }
  });

  it('CCI is above the overbought threshold throughout post-warmup', () => {
    const data = buildLinearUp(40);
    const out = computeLineCciOverboughtDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeGreaterThan(OVERBOUGHT);
    }
  });
});

describe('computeLineCciOverboughtDivergence LINEAR DOWN', () => {
  it('CCI = ~-126.67 (mirror constant)', () => {
    const data = buildLinearDown(40);
    const out = computeLineCciOverboughtDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out[i] as number).toBeCloseTo(-126.667, 2);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineCciOverboughtDivergence([])).toEqual([]);
  });
});

describe('classifyLineCciOverboughtDivergenceRegime', () => {
  it('null inputs -> none', () => {
    expect(
      classifyLineCciOverboughtDivergenceRegime(null, 1, 1, 1),
    ).toBe('none');
    expect(
      classifyLineCciOverboughtDivergenceRegime(1, null, 1, 1),
    ).toBe('none');
    expect(
      classifyLineCciOverboughtDivergenceRegime(1, 1, null, 1),
    ).toBe('none');
    expect(
      classifyLineCciOverboughtDivergenceRegime(1, 1, 1, null),
    ).toBe('none');
  });

  it('price up + CCI up -> aligned-bullish', () => {
    expect(
      classifyLineCciOverboughtDivergenceRegime(10, 5, 150, 100),
    ).toBe('aligned-bullish');
  });

  it('price down + CCI down -> aligned-bearish', () => {
    expect(
      classifyLineCciOverboughtDivergenceRegime(5, 10, 100, 150),
    ).toBe('aligned-bearish');
  });

  it('price down + CCI up -> divergent-bullish', () => {
    expect(
      classifyLineCciOverboughtDivergenceRegime(5, 10, 150, 100),
    ).toBe('divergent-bullish');
  });

  it('price up + CCI down -> divergent-bearish', () => {
    expect(
      classifyLineCciOverboughtDivergenceRegime(10, 5, 100, 150),
    ).toBe('divergent-bearish');
  });

  it('flat price or flat CCI -> none', () => {
    expect(
      classifyLineCciOverboughtDivergenceRegime(5, 5, 100, 50),
    ).toBe('none');
    expect(
      classifyLineCciOverboughtDivergenceRegime(10, 5, 100, 100),
    ).toBe('none');
  });
});

describe('classifyLineCciOverboughtDivergenceBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineCciOverboughtDivergenceBias(120, 100)).toBe('up');
    expect(classifyLineCciOverboughtDivergenceBias(80, 100)).toBe('down');
    expect(classifyLineCciOverboughtDivergenceBias(100, 100)).toBe('flat');
    expect(classifyLineCciOverboughtDivergenceBias(null, 100)).toBe('none');
    expect(classifyLineCciOverboughtDivergenceBias(100, null)).toBe('none');
  });
});

describe('detectLineCciOverboughtDivergenceCrosses', () => {
  it('fires BEARISH on entry into divergent-bearish IN overbought zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOverboughtDivergenceRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const cci: Array<number | null> = [150, 180, 150]; // all > 100
    const out = detectLineCciOverboughtDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERBOUGHT,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does NOT fire when divergent-bearish but CCI BELOW overbought zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOverboughtDivergenceRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const cci: Array<number | null> = [50, 60, 50]; // all < 100
    const out = detectLineCciOverboughtDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERBOUGHT,
    );
    expect(out).toHaveLength(0);
  });

  it('fires BULLISH on entry into divergent-bullish IN overbought zone', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOverboughtDivergenceRegime[] = [
      'none',
      'aligned-bearish',
      'divergent-bullish',
    ];
    const cci: Array<number | null> = [120, 110, 150]; // all > 100
    const out = detectLineCciOverboughtDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERBOUGHT,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('does not fire when state persists (no transition)', () => {
    const series = Array.from({ length: 3 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOverboughtDivergenceRegime[] = [
      'divergent-bearish',
      'divergent-bearish',
      'divergent-bearish',
    ];
    const cci: Array<number | null> = [150, 150, 150];
    const out = detectLineCciOverboughtDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERBOUGHT,
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
    const regimes: ChartLineCciOverboughtDivergenceRegime[] = [
      'none',
      'aligned-bullish',
      'divergent-bearish',
    ];
    const cci: Array<number | null> = [null, null, null];
    const out = detectLineCciOverboughtDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERBOUGHT,
    );
    expect(out).toHaveLength(0);
  });

  it('bias down when CCI falls at the cross', () => {
    const series = Array.from({ length: 2 }, (_, i) => ({
      x: i,
      high: i + 1,
      low: i - 1,
      close: i,
    }));
    const regimes: ChartLineCciOverboughtDivergenceRegime[] = [
      'aligned-bullish',
      'divergent-bearish',
    ];
    const cci: Array<number | null> = [180, 150];
    const out = detectLineCciOverboughtDivergenceCrosses(
      series,
      regimes,
      cci,
      OVERBOUGHT,
    );
    expect(out[0]?.bias).toBe('down');
  });
});

describe('runLineCciOverboughtDivergence CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: CCI = null (MAD=0), regime none, 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineCciOverboughtDivergence(data);
      expect(run.period).toBe(PERIOD);
      expect(run.overboughtLevel).toBe(OVERBOUGHT);
      for (let i = 0; i < 40; i += 1) {
        expect(run.cciValues[i]).toBeNull();
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineCciOverboughtDivergence LINEAR UP', () => {
  it('CCI = 126.67 constant > overbought, flat momentum -> regime none, 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineCciOverboughtDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.cciValues[i] as number).toBeCloseTo(126.667, 2);
    }
    // CCI is in overbought zone but the slope is flat
    expect(run.overboughtCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCciOverboughtDivergence LINEAR DOWN', () => {
  it('CCI = -126.67 mirror, NOT in overbought, 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineCciOverboughtDivergence(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(run.cciValues[i] as number).toBeCloseTo(-126.667, 2);
    }
    expect(run.overboughtCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCciOverboughtDivergence QUADRATIC UP', () => {
  it('reaches overbought zone (CCI plateau)', () => {
    // QUADRATIC UP drives CCI into overbought zone but CCI
    // plateaus near its asymptote and oscillates slightly --
    // regime composition is mixed (some aligned-bullish,
    // some divergent-bearish bars), and crosses may fire when
    // the oscillation flips. The clean assertion here is
    // simply that the overbought zone is reached.
    const data = buildQuadraticUp(60);
    const run = runLineCciOverboughtDivergence(data);
    expect(run.overboughtCount).toBeGreaterThan(0);
  });
});

describe('runLineCciOverboughtDivergence overbought-zone gating', () => {
  it('LINEAR UP CCI in overbought but flat slope -> 0 crosses', () => {
    // Verifies the overbought-zone presence does not imply
    // crosses; momentum direction must also be divergent.
    const data = buildLinearUp(40);
    const run = runLineCciOverboughtDivergence(data);
    expect(run.overboughtCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });

  it('LINEAR DOWN CCI in oversold not overbought -> 0 crosses', () => {
    // Verifies the overbought-zone gate filters out crosses
    // that would otherwise fire if the indicator were below.
    const data = buildLinearDown(40);
    const run = runLineCciOverboughtDivergence(data);
    expect(run.overboughtCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCciOverboughtDivergence misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineCciOverboughtDivergencePoint[] = [
      { x: 2, high: 2, low: 0, close: 1 },
      { x: 0, high: 2, low: 0, close: 1 },
      { x: 1, high: 2, low: 0, close: 1 },
    ];
    const run = runLineCciOverboughtDivergence(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(WARMUP, 50);
    const run = runLineCciOverboughtDivergence(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineCciOverboughtDivergence([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and overboughtLevel', () => {
    const data = buildQuadraticUp(60);
    const run = runLineCciOverboughtDivergence(data, {
      period: 10,
      overboughtLevel: 150,
    });
    expect(run.period).toBe(10);
    expect(run.overboughtLevel).toBe(150);
  });

  it('regime counts sum to series length', () => {
    const data = buildQuadraticUp(60);
    const run = runLineCciOverboughtDivergence(data);
    expect(
      run.alignedBullishCount +
        run.alignedBearishCount +
        run.divergentBullishCount +
        run.divergentBearishCount +
        run.noneCount,
    ).toBe(60);
  });
});

describe('computeLineCciOverboughtDivergenceLayout', () => {
  it('renders SVG paths for QUADRATIC UP', () => {
    const data = buildQuadraticUp(60);
    const layout = computeLineCciOverboughtDivergenceLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.cciPath).toContain('M ');
  });

  it('LINEAR UP produces 0 cross markers (CCI flat in overbought)', () => {
    const layout = computeLineCciOverboughtDivergenceLayout({
      data: buildLinearUp(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('LINEAR DOWN produces 0 cross markers (CCI outside overbought)', () => {
    const layout = computeLineCciOverboughtDivergenceLayout({
      data: buildLinearDown(40),
    });
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineCciOverboughtDivergenceLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cciPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineCciOverboughtDivergenceLayout({
      data: buildQuadraticUp(60),
      width: 600,
      height: 320,
      padding: 32,
      panelGap: 8,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(320);
  });

  it('renders overbought / oversold / zero reference lines', () => {
    const layout = computeLineCciOverboughtDivergenceLayout({
      data: buildQuadraticUp(60),
    });
    expect(layout.overboughtLineY).toBeLessThan(layout.zeroLineY);
    expect(layout.oversoldLineY).toBeGreaterThan(layout.zeroLineY);
  });
});

describe('describeLineCciOverboughtDivergenceChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineCciOverboughtDivergenceChart([])).toBe('No data');
  });

  it('mentions bar count, period, overbought, top reversal warning', () => {
    const desc = describeLineCciOverboughtDivergenceChart(
      buildQuadraticUp(60),
    );
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 20');
    expect(desc).toContain('overbought 100');
    expect(desc).toContain('top reversal warning');
  });
});

describe('<ChartLineCciOverboughtDivergence /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildQuadraticUp(60);
    const { container } = render(
      <ChartLineCciOverboughtDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-overbought-divergence"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-overbought-level')).toBe(
      String(OVERBOUGHT),
    );
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(
      <ChartLineCciOverboughtDivergence data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-overbought-divergence-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders CCI path and reference lines', () => {
    const data = buildQuadraticUp(60);
    const { container } = render(
      <ChartLineCciOverboughtDivergence data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-overbought-divergence-cci-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-overbought-divergence-overbought-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-overbought-divergence-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildQuadraticUp(60);
    const { container } = render(
      <ChartLineCciOverboughtDivergence data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-overbought-divergence-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildQuadraticUp(60);
    const { container } = render(
      <ChartLineCciOverboughtDivergence data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-cci-overbought-divergence-badge"]',
    );
    expect(badge?.textContent).toContain('period 20');
    expect(badge?.textContent).toContain('overbought 100');
  });

  it('exposes aria region label fallback', () => {
    const data = buildQuadraticUp(60);
    const { container } = render(
      <ChartLineCciOverboughtDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-overbought-divergence"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'CCI overbought-zone divergence chart',
    );
  });

  it('exposes data-cross-count counter (zero for flat LINEAR UP)', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineCciOverboughtDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-overbought-divergence"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildQuadraticUp(60);
    const { container } = render(
      <ChartLineCciOverboughtDivergence
        data={data}
        hiddenSeries={['cci']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-overbought-divergence-cci-path"]',
      ),
    ).toBeNull();
  });

  it('renders two legend buttons (close, CCI)', () => {
    const data = buildQuadraticUp(60);
    const { container } = render(
      <ChartLineCciOverboughtDivergence data={data} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-cci-overbought-divergence-legend"] button',
    );
    expect(buttons).toHaveLength(2);
  });

  it('exposes data-overbought-count counter', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineCciOverboughtDivergence data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-overbought-divergence"]',
    );
    const c = Number(root?.getAttribute('data-overbought-count'));
    expect(c).toBeGreaterThan(0);
  });
});
