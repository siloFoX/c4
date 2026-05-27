import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineCciMidCrossSig,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_WIDTH,
  applyLineCciMidCrossSigSma,
  classifyLineCciMidCrossSigBias,
  classifyLineCciMidCrossSigRegime,
  computeLineCciMidCrossSig,
  computeLineCciMidCrossSigLayout,
  describeLineCciMidCrossSigChart,
  detectLineCciMidCrossSigCrosses,
  getLineCciMidCrossSigFinitePoints,
  normalizeLineCciMidCrossSigLength,
  runLineCciMidCrossSig,
  type ChartLineCciMidCrossSigPoint,
} from './chart-line-cci-mid-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const WARMUP = PERIOD + SIGNAL - 2; // 15

// CCI on LINEAR UP: typical=i, smaTp=i-6.5, dev=6.5,
// meanDev=3.5, CCI = 6.5/(0.015*3.5) = 2600/21
const CCI_LINEAR = 2600 / 21;

const buildConstBand = (
  n: number,
  k: number,
): ChartLineCciMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
  }));

const buildLinearUp = (n: number): ChartLineCciMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
  }));

const buildLinearDown = (n: number): ChartLineCciMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
  }));

describe('ChartLineCciMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical CCI tuning', () => {
    expect(DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineCciMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity and high<low', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, high: 1, low: 2, close: 1.5 },
      { x: 2, high: Infinity, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ];
    expect(getLineCciMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5 },
      { x: 3, high: 4, low: 1, close: 2 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineCciMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineCciMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineCciMidCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineCciMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineCciMidCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineCciMidCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineCciMidCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineCciMidCrossSigSma', () => {
  it('SMA over linear input', () => {
    const values = [0, 1, 2, 3, 4, 5];
    const out = applyLineCciMidCrossSigSma(values, 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(1);
    expect(out[3]).toBe(2);
    expect(out[4]).toBe(3);
    expect(out[5]).toBe(4);
  });

  it('passthrough at length 1', () => {
    const out = applyLineCciMidCrossSigSma([1, 2, 3], 1);
    expect(out).toEqual([1, 2, 3]);
  });

  it('returns null windows with nulls in them', () => {
    const values: Array<number | null> = [1, null, 3, 4, 5];
    const out = applyLineCciMidCrossSigSma(values, 3);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(4);
  });
});

describe('computeLineCciMidCrossSig CONST band', () => {
  it('typical=K, CCI=0 (zero-guard), signal=0', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineCciMidCrossSig(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.typical[i] as number).toBeCloseTo(50, 9);
    }
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.cci[i] as number).toBe(0);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(0);
    }
  });
});

describe('computeLineCciMidCrossSig LINEAR UP', () => {
  it('CCI = 2600/21 (constant), signal = same', () => {
    const data = buildLinearUp(40);
    const out = computeLineCciMidCrossSig(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.cci[i] as number).toBeCloseTo(CCI_LINEAR, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(CCI_LINEAR, 9);
    }
  });
});

describe('computeLineCciMidCrossSig LINEAR DOWN', () => {
  it('CCI = -2600/21 (mirror)', () => {
    const data = buildLinearDown(40);
    const out = computeLineCciMidCrossSig(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.cci[i] as number).toBeCloseTo(-CCI_LINEAR, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(-CCI_LINEAR, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineCciMidCrossSig([])).toEqual({
      typical: [],
      cci: [],
      signal: [],
    });
  });
});

describe('classifyLineCciMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineCciMidCrossSigRegime(null, 5)).toBe('none');
    expect(classifyLineCciMidCrossSigRegime(5, null)).toBe('none');
  });
  it('CCI > signal -> bullish', () => {
    expect(classifyLineCciMidCrossSigRegime(10, 5)).toBe('bullish');
  });
  it('CCI === signal -> bullish (>=)', () => {
    expect(classifyLineCciMidCrossSigRegime(5, 5)).toBe('bullish');
  });
  it('CCI < signal -> bearish', () => {
    expect(classifyLineCciMidCrossSigRegime(5, 10)).toBe('bearish');
  });
});

describe('classifyLineCciMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineCciMidCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineCciMidCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineCciMidCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineCciMidCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineCciMidCrossSigCrosses', () => {
  it('fires bullish on CCI crossing up signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const cci: Array<number | null> = [-5, -3, 2, 5];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineCciMidCrossSigCrosses(series, cci, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on CCI crossing down signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const cci: Array<number | null> = [5, 3, -2, -5];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineCciMidCrossSigCrosses(series, cci, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('skips null-window bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
    }));
    const cci: Array<number | null> = [null, null, 2, 5];
    const sig: Array<number | null> = [null, null, 0, 0];
    const out = detectLineCciMidCrossSigCrosses(series, cci, sig);
    // i=2: pc=null, skipped. i=3: pc=2, ps=0, cc=5, cs=0 -> 2<=0? false. No cross.
    expect(out).toHaveLength(0);
  });
});

describe('runLineCciMidCrossSig CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}: CCI=signal=0, regime bullish, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineCciMidCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.cciValues[i] as number).toBe(0);
        expect(run.signalValues[i] as number).toBe(0);
      }
      // i in [PERIOD-1..WARMUP-1] are bullish too (CCI=0, signal=null -> regime none for those bars only)
      // i >= WARMUP are bullish (CCI === signal === 0)
      expect(run.bullishCount).toBeGreaterThan(0);
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineCciMidCrossSig LINEAR UP', () => {
  it('CCI ~= 123.81, signal === CCI, regime bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineCciMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.cciValues[i] as number).toBeCloseTo(CCI_LINEAR, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(CCI_LINEAR, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCciMidCrossSig LINEAR DOWN', () => {
  it('CCI ~= -123.81, signal === CCI, regime bullish (===), 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineCciMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.cciValues[i] as number).toBeCloseTo(-CCI_LINEAR, 9);
      expect(run.signalValues[i] as number).toBeCloseTo(-CCI_LINEAR, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineCciMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineCciMidCrossSigPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5 },
      { x: 0, high: 1, low: 0, close: 0.5 },
      { x: 1, high: 1, low: 0, close: 0.5 },
    ];
    const run = runLineCciMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(15, 50);
    const run = runLineCciMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineCciMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and signalLength', () => {
    const data = buildLinearUp(60);
    const run = runLineCciMidCrossSig(data, { period: 7, signalLength: 5 });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineCciMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });
});

describe('computeLineCciMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineCciMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.cciPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('centerline (0) is within view', () => {
    const layout = computeLineCciMidCrossSigLayout({
      data: buildLinearUp(60),
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
    expect(layout.centerlineY).toBeGreaterThanOrEqual(layout.oscTop);
    expect(layout.centerlineY).toBeLessThanOrEqual(layout.oscBottom);
  });

  it('falls back when no data', () => {
    const layout = computeLineCciMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cciPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineCciMidCrossSigLayout({
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
    const layout = computeLineCciMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineCciMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineCciMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signalLength, centerline trend trigger', () => {
    const desc = describeLineCciMidCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('centerline trend trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineCciMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineCciMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-cci-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineCciMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders CCI + signal paths', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineCciMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-sig-cci-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders centerline by default', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineCciMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-sig-centerline"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineCciMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineCciMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cci-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineCciMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-cci-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'CCI centerline-over-Signal chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineCciMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-cci-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineCciMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
