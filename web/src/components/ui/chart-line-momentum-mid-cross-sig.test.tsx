import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineMomentumMidCrossSig,
  DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_WIDTH,
  applyLineMomentumMidCrossSigSma,
  classifyLineMomentumMidCrossSigBias,
  classifyLineMomentumMidCrossSigRegime,
  computeLineMomentumMidCrossSig,
  computeLineMomentumMidCrossSigLayout,
  describeLineMomentumMidCrossSigChart,
  detectLineMomentumMidCrossSigCrosses,
  getLineMomentumMidCrossSigFinitePoints,
  normalizeLineMomentumMidCrossSigLength,
  runLineMomentumMidCrossSig,
  type ChartLineMomentumMidCrossSigPoint,
} from './chart-line-momentum-mid-cross-sig';

const PERIOD = 10;
const SIGNAL = 3;
const WARMUP = PERIOD + SIGNAL - 1; // 12

const buildConst = (n: number, k: number): ChartLineMomentumMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineMomentumMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineMomentumMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineMomentumMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical Momentum tuning', () => {
    expect(DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PERIOD).toBe(10);
    expect(DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineMomentumMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 1 },
      { x: 1, close: Infinity },
      { x: 2, close: 2 },
    ];
    expect(getLineMomentumMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 2 },
    ]);
  });
});

describe('normalizeLineMomentumMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineMomentumMidCrossSigLength(10.7, 10)).toBe(10);
    expect(normalizeLineMomentumMidCrossSigLength(0, 10)).toBe(10);
  });
});

describe('applyLineMomentumMidCrossSigSma', () => {
  it('SMA over linear input', () => {
    const out = applyLineMomentumMidCrossSigSma([0, 1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(1);
    expect(out[5]).toBe(4);
  });
});

describe('computeLineMomentumMidCrossSig CONST', () => {
  it('momentum = 0 (centerline), signal = 0', () => {
    const data = buildConst(40, 50);
    const out = computeLineMomentumMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.momentum[i] as number).toBe(0);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(0);
    }
  });
});

describe('computeLineMomentumMidCrossSig LINEAR UP', () => {
  it('momentum = +10 (period), signal = +10', () => {
    const data = buildLinearUp(40);
    const out = computeLineMomentumMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.momentum[i] as number).toBe(10);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(10);
    }
  });
});

describe('computeLineMomentumMidCrossSig LINEAR DOWN', () => {
  it('momentum = -10 (mirror), signal = -10', () => {
    const data = buildLinearDown(40);
    const out = computeLineMomentumMidCrossSig(data);
    for (let i = PERIOD; i < 40; i += 1) {
      expect(out.momentum[i] as number).toBe(-10);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(-10);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineMomentumMidCrossSig([])).toEqual({
      momentum: [],
      signal: [],
    });
  });
});

describe('classifyLineMomentumMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineMomentumMidCrossSigRegime(null, 5)).toBe('none');
  });
  it('momentum > signal -> bullish', () => {
    expect(classifyLineMomentumMidCrossSigRegime(10, 5)).toBe('bullish');
  });
  it('momentum === signal -> bullish (>=)', () => {
    expect(classifyLineMomentumMidCrossSigRegime(5, 5)).toBe('bullish');
  });
  it('momentum < signal -> bearish', () => {
    expect(classifyLineMomentumMidCrossSigRegime(5, 10)).toBe('bearish');
  });
});

describe('classifyLineMomentumMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineMomentumMidCrossSigBias(60, 50)).toBe('up');
    expect(classifyLineMomentumMidCrossSigBias(40, 50)).toBe('down');
    expect(classifyLineMomentumMidCrossSigBias(50, 50)).toBe('flat');
    expect(classifyLineMomentumMidCrossSigBias(null, 50)).toBe('none');
  });
});

describe('detectLineMomentumMidCrossSigCrosses', () => {
  it('fires bullish on momentum crossing up signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const mom: Array<number | null> = [-2, -1, 1, 2];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineMomentumMidCrossSigCrosses(series, mom, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on momentum crossing down signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const mom: Array<number | null> = [2, 1, -1, -2];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineMomentumMidCrossSigCrosses(series, mom, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('skips null-window bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const mom: Array<number | null> = [null, null, 1, 2];
    const sig: Array<number | null> = [null, null, 0, 0];
    const out = detectLineMomentumMidCrossSigCrosses(series, mom, sig);
    expect(out).toHaveLength(0);
  });
});

describe('runLineMomentumMidCrossSig CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: momentum = signal = 0, regime bullish (===), 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineMomentumMidCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.momentumValues[i] as number).toBe(0);
        expect(run.signalValues[i] as number).toBe(0);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineMomentumMidCrossSig LINEAR UP', () => {
  it('momentum = signal = +10, regime bullish (===), 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineMomentumMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.momentumValues[i] as number).toBe(10);
      expect(run.signalValues[i] as number).toBe(10);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineMomentumMidCrossSig LINEAR DOWN', () => {
  it('momentum = signal = -10 (mirror), regime bullish (===), 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineMomentumMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      expect(run.momentumValues[i] as number).toBe(-10);
      expect(run.signalValues[i] as number).toBe(-10);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineMomentumMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineMomentumMidCrossSigPoint[] = [
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ];
    const run = runLineMomentumMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(12, 50);
    const run = runLineMomentumMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineMomentumMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and signalLength', () => {
    const data = buildLinearUp(40);
    const run = runLineMomentumMidCrossSig(data, {
      period: 7,
      signalLength: 5,
    });
    expect(run.period).toBe(7);
    expect(run.signalLength).toBe(5);
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineMomentumMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });
});

describe('computeLineMomentumMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineMomentumMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.momentumPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('centerline (0) is within view', () => {
    const layout = computeLineMomentumMidCrossSigLayout({
      data: buildLinearUp(40),
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
    expect(layout.centerlineY).toBeGreaterThanOrEqual(layout.oscTop);
    expect(layout.centerlineY).toBeLessThanOrEqual(layout.oscBottom);
  });

  it('falls back when no data', () => {
    const layout = computeLineMomentumMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.momentumPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineMomentumMidCrossSigLayout({
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
    const layout = computeLineMomentumMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineMomentumMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineMomentumMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, momentum centerline trigger', () => {
    const desc = describeLineMomentumMidCrossSigChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 10');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('momentum centerline trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineMomentumMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineMomentumMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineMomentumMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders momentum + signal paths', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineMomentumMidCrossSig data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-mid-cross-sig-momentum-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders centerline by default', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineMomentumMidCrossSig data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-mid-cross-sig-centerline"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineMomentumMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineMomentumMidCrossSig data={data} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-momentum-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 10');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineMomentumMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'Momentum midline-over-Signal chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineMomentumMidCrossSig data={data} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineMomentumMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
