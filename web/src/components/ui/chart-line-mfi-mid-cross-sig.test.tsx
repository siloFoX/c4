import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineMfiMidCrossSig,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_WIDTH,
  applyLineMfiMidCrossSigSma,
  classifyLineMfiMidCrossSigBias,
  classifyLineMfiMidCrossSigRegime,
  computeLineMfiMidCrossSig,
  computeLineMfiMidCrossSigLayout,
  describeLineMfiMidCrossSigChart,
  detectLineMfiMidCrossSigCrosses,
  getLineMfiMidCrossSigFinitePoints,
  normalizeLineMfiMidCrossSigLength,
  runLineMfiMidCrossSig,
  type ChartLineMfiMidCrossSigPoint,
} from './chart-line-mfi-mid-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const WARMUP = PERIOD + SIGNAL - 1; // 16, first valid signal

const buildConstBand = (
  n: number,
  k: number,
  volume = 1,
): ChartLineMfiMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: k + 1,
    low: k - 1,
    close: k,
    volume,
  }));

const buildLinearUp = (
  n: number,
  volume = 1,
): ChartLineMfiMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i - 1,
    close: i,
    volume,
  }));

const buildLinearDown = (
  n: number,
  volume = 1,
): ChartLineMfiMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    high: -i + 1,
    low: -i - 1,
    close: -i,
    volume,
  }));

describe('ChartLineMfiMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical MFI tuning', () => {
    expect(DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineMfiMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity/high<low/negative volume', () => {
    const points = [
      { x: 0, high: 2, low: 1, close: 1.5, volume: 1 },
      { x: NaN, high: 2, low: 1, close: 1.5, volume: 1 },
      { x: 1, high: 1, low: 2, close: 1.5, volume: 1 },
      { x: 2, high: Infinity, low: 1, close: 1.5, volume: 1 },
      { x: 3, high: 4, low: 1, close: 2, volume: 1 },
      { x: 4, high: 4, low: 1, close: 2, volume: -1 },
    ];
    expect(getLineMfiMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, high: 2, low: 1, close: 1.5, volume: 1 },
      { x: 3, high: 4, low: 1, close: 2, volume: 1 },
    ]);
  });

  it('returns empty for null and non-array', () => {
    expect(getLineMfiMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineMfiMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineMfiMidCrossSigFinitePoints(
        // @ts-expect-error -- intentionally bad
        'oops',
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineMfiMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineMfiMidCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineMfiMidCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineMfiMidCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineMfiMidCrossSigSma', () => {
  it('CONST returns constant', () => {
    const values: Array<number | null> = Array.from({ length: 10 }, () => 7);
    const sma = applyLineMfiMidCrossSigSma(values, SIGNAL);
    for (let i = SIGNAL - 1; i < 10; i += 1) expect(sma[i]).toBe(7);
  });
});

describe('computeLineMfiMidCrossSig CONST band', () => {
  it('typical=K constant -> MFI=50 from warmup, signal=50', () => {
    const data = buildConstBand(40, 50);
    const out = computeLineMfiMidCrossSig(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.typical[i]).toBe(50);
    }
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.mfi[i]).toBe(50);
    }
    for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
      expect(out.signal[i]).toBe(50);
    }
  });
});

describe('computeLineMfiMidCrossSig LINEAR UP', () => {
  it('typical=i monotone up -> MFI=100 from warmup, signal=100', () => {
    const data = buildLinearUp(40);
    const out = computeLineMfiMidCrossSig(data);
    for (let i = 0; i < 40; i += 1) {
      expect(out.typical[i]).toBe(i);
    }
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.mfi[i]).toBe(100);
    }
    for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
      expect(out.signal[i]).toBe(100);
    }
  });
});

describe('computeLineMfiMidCrossSig LINEAR DOWN', () => {
  it('typical=-i monotone down -> MFI=0 from warmup, signal=0', () => {
    const data = buildLinearDown(40);
    const out = computeLineMfiMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.mfi[i]).toBe(0);
    }
    for (let i = PERIOD + SIGNAL - 1; i < 40; i += 1) {
      expect(out.signal[i]).toBe(0);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineMfiMidCrossSig([])).toEqual({
      typical: [],
      mfi: [],
      signal: [],
    });
  });
});

describe('computeLineMfiMidCrossSig with mixed direction', () => {
  it('alternating up/down produces sensible MFI in (0, 100) range', () => {
    const data: ChartLineMfiMidCrossSigPoint[] = Array.from(
      { length: 30 },
      (_, i) => {
        const t = i % 2 === 0 ? 100 : 102;
        return {
          x: i,
          high: t + 1,
          low: t - 1,
          close: t,
          volume: 1,
        };
      },
    );
    const out = computeLineMfiMidCrossSig(data);
    for (let i = PERIOD; i < 30; i += 1) {
      const v = out.mfi[i] as number;
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(100);
    }
  });
});

describe('classifyLineMfiMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineMfiMidCrossSigRegime(null, 50)).toBe('none');
  });
  it('MFI >= signal -> bullish', () => {
    expect(classifyLineMfiMidCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineMfiMidCrossSigRegime(75, 50)).toBe('bullish');
  });
  it('MFI < signal -> bearish', () => {
    expect(classifyLineMfiMidCrossSigRegime(25, 50)).toBe('bearish');
  });
});

describe('classifyLineMfiMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineMfiMidCrossSigBias(75, 50)).toBe('up');
    expect(classifyLineMfiMidCrossSigBias(25, 50)).toBe('down');
    expect(classifyLineMfiMidCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineMfiMidCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineMfiMidCrossSigCrosses', () => {
  it('detects bullish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
      volume: 1,
    }));
    const mfi: Array<number | null> = [40, 50, 70, 75];
    const signal: Array<number | null> = [50, 50, 60, 60];
    const out = detectLineMfiMidCrossSigCrosses(series, mfi, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
  });

  it('detects bearish trigger', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
      volume: 1,
    }));
    const mfi: Array<number | null> = [75, 70, 50, 40];
    const signal: Array<number | null> = [60, 60, 60, 60];
    const out = detectLineMfiMidCrossSigCrosses(series, mfi, signal);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('does not fire on null values', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
      volume: 1,
    }));
    const mfi: Array<number | null> = [null, null, 50, 70];
    const signal: Array<number | null> = [null, null, 40, 40];
    expect(detectLineMfiMidCrossSigCrosses(series, mfi, signal)).toHaveLength(
      0,
    );
  });

  it('does not double-fire', () => {
    const series = Array.from({ length: 5 }, (_, i) => ({
      x: i,
      high: 1,
      low: 0,
      close: 0.5,
      volume: 1,
    }));
    const mfi: Array<number | null> = [40, 50, 60, 70, 80];
    const signal: Array<number | null> = [50, 40, 40, 40, 40];
    expect(detectLineMfiMidCrossSigCrosses(series, mfi, signal)).toHaveLength(
      1,
    );
  });
});

describe('runLineMfiMidCrossSig CONST band', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST band ${K}, V=1: MFI=50, signal=50, all bullish, 0 triggers`, () => {
      const data = buildConstBand(60, K);
      const run = runLineMfiMidCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = 0; i < WARMUP; i += 1) {
        expect(run.signalValues[i]).toBeNull();
      }
      for (let i = WARMUP; i < 60; i += 1) {
        expect(run.mfiValues[i]).toBe(50);
        expect(run.signalValues[i]).toBe(50);
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

describe('runLineMfiMidCrossSig LINEAR UP', () => {
  it('LINEAR UP: MFI=100, signal=100, all bullish, 0 triggers', () => {
    const data = buildLinearUp(60);
    const run = runLineMfiMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      expect(run.mfiValues[i]).toBe(100);
      expect(run.signalValues[i]).toBe(100);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.bearishCount).toBe(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineMfiMidCrossSig LINEAR DOWN', () => {
  it('LINEAR DOWN: MFI=0, signal=0, all bullish (==), 0 triggers', () => {
    const data = buildLinearDown(60);
    const run = runLineMfiMidCrossSig(data);
    for (let i = WARMUP; i < 60; i += 1) {
      expect(run.samples[i]?.regime).toBe('bullish');
      expect(run.mfiValues[i]).toBe(0);
      expect(run.signalValues[i]).toBe(0);
    }
    expect(run.bullishCount).toBe(60 - WARMUP);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineMfiMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineMfiMidCrossSigPoint[] = [
      { x: 2, high: 1, low: 0, close: 0.5, volume: 1 },
      { x: 0, high: 1, low: 0, close: 0.5, volume: 1 },
      { x: 1, high: 1, low: 0, close: 0.5, volume: 1 },
    ];
    const run = runLineMfiMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConstBand(15, 50);
    const run = runLineMfiMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineMfiMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom tuning', () => {
    const data = buildLinearUp(60);
    const run = runLineMfiMidCrossSig(data, {
      period: 7,
      signalLength: 2,
    });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(2);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(60);
    const run = runLineMfiMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(60);
  });

  it('MFI bounded [0, 100]', () => {
    const data: ChartLineMfiMidCrossSigPoint[] = Array.from(
      { length: 30 },
      (_, i) => ({
        x: i,
        high: i + 1,
        low: i - 1,
        close: i,
        volume: i + 1,
      }),
    );
    const run = runLineMfiMidCrossSig(data);
    for (let i = PERIOD; i < 30; i += 1) {
      const v = run.mfiValues[i] as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('computeLineMfiMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const layout = computeLineMfiMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(60);
    expect(layout.mfiPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('oscMin=0, oscMax=100 (bounded MFI range)', () => {
    const layout = computeLineMfiMidCrossSigLayout({
      data: buildLinearUp(60),
    });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('exposes centerlineY for the 50 reference', () => {
    const layout = computeLineMfiMidCrossSigLayout({
      data: buildLinearUp(60),
    });
    expect(Number.isFinite(layout.centerlineY)).toBe(true);
  });

  it('falls back when no data', () => {
    const layout = computeLineMfiMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.mfiPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineMfiMidCrossSigLayout({
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
    const layout = computeLineMfiMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineMfiMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineMfiMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, signal, volume-weighted momentum', () => {
    const desc = describeLineMfiMidCrossSigChart(buildLinearUp(60));
    expect(desc).toContain('60 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('volume-weighted momentum');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineMfiMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineMfiMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-mfi-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineMfiMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders MFI, signal, and centerline', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineMfiMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-sig-mfi-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-sig-centerline"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineMfiMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineMfiMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-mfi-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineMfiMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-mfi-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'MFI centerline-over-Signal chart',
    );
  });

  it('exposes data-*-count counters for LINEAR UP', () => {
    const data = buildLinearUp(60);
    const { container } = render(<ChartLineMfiMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-mfi-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-bullish-count')).toBe(
      String(60 - WARMUP),
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(60);
    const { container } = render(
      <ChartLineMfiMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
