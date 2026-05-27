import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartLineHmaMidCrossSig,
  DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PERIOD,
  DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_WIDTH,
  applyLineHmaMidCrossSigSma,
  applyLineHmaMidCrossSigWma,
  classifyLineHmaMidCrossSigBias,
  classifyLineHmaMidCrossSigRegime,
  computeLineHmaMidCrossSig,
  computeLineHmaMidCrossSigLayout,
  describeLineHmaMidCrossSigChart,
  detectLineHmaMidCrossSigCrosses,
  getLineHmaMidCrossSigFinitePoints,
  normalizeLineHmaMidCrossSigLength,
  runLineHmaMidCrossSig,
  type ChartLineHmaMidCrossSigPoint,
} from './chart-line-hma-mid-cross-sig';

const PERIOD = 14;
const SIGNAL = 3;
const HALF = 7;
const SQRT_PERIOD = 4;
const WARMUP = PERIOD + SQRT_PERIOD + SIGNAL - 3; // 18

const buildConst = (n: number, k: number): ChartLineHmaMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: k }));

const buildLinearUp = (n: number): ChartLineHmaMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const buildLinearDown = (n: number): ChartLineHmaMidCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: -i }));

describe('ChartLineHmaMidCrossSig defaults', () => {
  it('exports canonical dimensions', () => {
    expect(DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_WIDTH).toBe(720);
    expect(DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_HEIGHT).toBe(460);
    expect(DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PADDING).toBe(44);
    expect(DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PANEL_GAP).toBe(12);
  });

  it('exports canonical HMA tuning', () => {
    expect(DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PERIOD).toBe(14);
    expect(DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
  });
});

describe('getLineHmaMidCrossSigFinitePoints', () => {
  it('filters NaN/Infinity', () => {
    const points = [
      { x: 0, close: 1 },
      { x: NaN, close: 1 },
      { x: 1, close: Infinity },
      { x: 2, close: 2 },
    ];
    expect(getLineHmaMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 2 },
    ]);
  });
});

describe('normalizeLineHmaMidCrossSigLength', () => {
  it('floors finite >=1 values', () => {
    expect(normalizeLineHmaMidCrossSigLength(14.7, 14)).toBe(14);
    expect(normalizeLineHmaMidCrossSigLength(0, 14)).toBe(14);
  });
});

describe('applyLineHmaMidCrossSigWma', () => {
  it('WMA on linear input has lag (n-1)/3', () => {
    const values: Array<number | null> = Array.from(
      { length: 20 },
      (_, i) => i,
    );
    const out = applyLineHmaMidCrossSigWma(values, 3);
    // WMA(3) on linear: lag = 2/3
    for (let i = 2; i < 20; i += 1) {
      expect(out[i] as number).toBeCloseTo(i - 2 / 3, 9);
    }
  });

  it('WMA on constant returns the constant', () => {
    const values: Array<number | null> = [5, 5, 5, 5, 5];
    const out = applyLineHmaMidCrossSigWma(values, 3);
    expect(out[2]).toBe(5);
    expect(out[4]).toBe(5);
  });

  it('passthrough at length 1', () => {
    expect(applyLineHmaMidCrossSigWma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
});

describe('applyLineHmaMidCrossSigSma', () => {
  it('SMA over linear input', () => {
    const out = applyLineHmaMidCrossSigSma([0, 1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(1);
    expect(out[5]).toBe(4);
  });
});

describe('computeLineHmaMidCrossSig CONST', () => {
  it('all channels = K, signal = K', () => {
    const data = buildConst(40, 50);
    const out = computeLineHmaMidCrossSig(data);
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.wmaHalf[i] as number).toBe(50);
      expect(out.wmaFull[i] as number).toBe(50);
      expect(out.raw[i] as number).toBe(50);
    }
    for (let i = PERIOD + SQRT_PERIOD - 2; i < 40; i += 1) {
      expect(out.hma[i] as number).toBe(50);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBe(50);
    }
  });
});

describe('computeLineHmaMidCrossSig LINEAR UP', () => {
  it('wmaHalf = i - 2, wmaFull = i - 13/3, raw = i + 1/3, hma = i - 2/3', () => {
    const data = buildLinearUp(40);
    const out = computeLineHmaMidCrossSig(data);
    for (let i = HALF - 1; i < 40; i += 1) {
      expect(out.wmaHalf[i] as number).toBeCloseTo(i - 2, 9);
    }
    for (let i = PERIOD - 1; i < 40; i += 1) {
      expect(out.wmaFull[i] as number).toBeCloseTo(i - 13 / 3, 9);
      expect(out.raw[i] as number).toBeCloseTo(i + 1 / 3, 9);
    }
    for (let i = PERIOD + SQRT_PERIOD - 2; i < 40; i += 1) {
      expect(out.hma[i] as number).toBeCloseTo(i - 2 / 3, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(i - 5 / 3, 9);
    }
  });
});

describe('computeLineHmaMidCrossSig LINEAR DOWN', () => {
  it('mirror: hma = -i + 2/3, signal = -i + 5/3', () => {
    const data = buildLinearDown(40);
    const out = computeLineHmaMidCrossSig(data);
    for (let i = PERIOD + SQRT_PERIOD - 2; i < 40; i += 1) {
      expect(out.hma[i] as number).toBeCloseTo(-i + 2 / 3, 9);
    }
    for (let i = WARMUP; i < 40; i += 1) {
      expect(out.signal[i] as number).toBeCloseTo(-i + 5 / 3, 9);
    }
  });

  it('returns empty for empty data', () => {
    expect(computeLineHmaMidCrossSig([])).toEqual({
      wmaHalf: [],
      wmaFull: [],
      raw: [],
      hma: [],
      signal: [],
    });
  });
});

describe('classifyLineHmaMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineHmaMidCrossSigRegime(null, 5)).toBe('none');
  });
  it('HMA > signal -> bullish', () => {
    expect(classifyLineHmaMidCrossSigRegime(10, 5)).toBe('bullish');
  });
  it('HMA === signal -> bullish (>=)', () => {
    expect(classifyLineHmaMidCrossSigRegime(5, 5)).toBe('bullish');
  });
  it('HMA < signal -> bearish', () => {
    expect(classifyLineHmaMidCrossSigRegime(5, 10)).toBe('bearish');
  });
});

describe('classifyLineHmaMidCrossSigBias', () => {
  it('returns up/down/flat/none', () => {
    expect(classifyLineHmaMidCrossSigBias(2, 1)).toBe('up');
    expect(classifyLineHmaMidCrossSigBias(0, 1)).toBe('down');
    expect(classifyLineHmaMidCrossSigBias(1, 1)).toBe('flat');
    expect(classifyLineHmaMidCrossSigBias(null, 1)).toBe('none');
  });
});

describe('detectLineHmaMidCrossSigCrosses', () => {
  it('fires bullish on HMA crossing up signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const hma: Array<number | null> = [-2, -1, 1, 2];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineHmaMidCrossSigCrosses(series, hma, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bullish');
    expect(out[0]?.index).toBe(2);
  });

  it('fires bearish on HMA crossing down signal', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const hma: Array<number | null> = [2, 1, -1, -2];
    const sig: Array<number | null> = [0, 0, 0, 0];
    const out = detectLineHmaMidCrossSigCrosses(series, hma, sig);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('bearish');
  });

  it('skips null-window bars', () => {
    const series = Array.from({ length: 4 }, (_, i) => ({ x: i, close: 1 }));
    const hma: Array<number | null> = [null, null, 1, 2];
    const sig: Array<number | null> = [null, null, 0, 0];
    const out = detectLineHmaMidCrossSigCrosses(series, hma, sig);
    expect(out).toHaveLength(0);
  });
});

describe('runLineHmaMidCrossSig CONST', () => {
  for (const K of [0, 1, 50, 200, 1234]) {
    it(`CONST ${K}: HMA = signal = K, regime bullish (===), 0 crosses`, () => {
      const data = buildConst(40, K);
      const run = runLineHmaMidCrossSig(data);
      expect(run.period).toBe(PERIOD);
      expect(run.signalLength).toBe(SIGNAL);
      expect(run.half).toBe(HALF);
      expect(run.sqrtPeriod).toBe(SQRT_PERIOD);
      for (let i = WARMUP; i < 40; i += 1) {
        expect(run.hmaValues[i] as number).toBe(K);
        expect(run.signalValues[i] as number).toBe(K);
      }
      expect(run.crosses).toHaveLength(0);
      expect(run.ok).toBe(true);
    });
  }
});

describe('runLineHmaMidCrossSig LINEAR UP', () => {
  it('HMA above signal by 1 (1-bar SMA lag), regime bullish, 0 crosses', () => {
    const data = buildLinearUp(40);
    const run = runLineHmaMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const h = run.hmaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(h - s).toBeCloseTo(1, 9);
    }
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineHmaMidCrossSig LINEAR DOWN', () => {
  it('HMA below signal by 1 (mirror), regime bearish, 0 crosses', () => {
    const data = buildLinearDown(40);
    const run = runLineHmaMidCrossSig(data);
    for (let i = WARMUP; i < 40; i += 1) {
      const h = run.hmaValues[i] as number;
      const s = run.signalValues[i] as number;
      expect(h - s).toBeCloseTo(-1, 9);
    }
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.crosses).toHaveLength(0);
  });
});

describe('runLineHmaMidCrossSig misc', () => {
  it('sorts unsorted x', () => {
    const data: ChartLineHmaMidCrossSigPoint[] = [
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ];
    const run = runLineHmaMidCrossSig(data);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('ok=false when too short', () => {
    const data = buildConst(18, 50);
    const run = runLineHmaMidCrossSig(data);
    expect(run.ok).toBe(false);
  });

  it('handles empty input', () => {
    const run = runLineHmaMidCrossSig([]);
    expect(run.series).toEqual([]);
    expect(run.crosses).toEqual([]);
    expect(run.ok).toBe(false);
  });

  it('honours custom period and signalLength', () => {
    const data = buildLinearUp(60);
    const run = runLineHmaMidCrossSig(data, {
      period: 9,
      signalLength: 5,
    });
    expect(run.period).toBe(9);
    expect(run.signalLength).toBe(5);
    expect(run.half).toBe(4); // floor(9/2) = 4
    expect(run.sqrtPeriod).toBe(3); // round(sqrt(9)) = 3
  });

  it('regime counts sum to series length', () => {
    const data = buildLinearUp(40);
    const run = runLineHmaMidCrossSig(data);
    expect(run.bullishCount + run.bearishCount + run.noneCount).toBe(40);
  });
});

describe('computeLineHmaMidCrossSigLayout', () => {
  it('renders SVG paths for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const layout = computeLineHmaMidCrossSigLayout({ data });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.priceDots).toHaveLength(40);
    expect(layout.hmaPath).toContain('M ');
    expect(layout.signalPath).toContain('M ');
    expect(layout.crossMarkers).toHaveLength(0);
  });

  it('falls back when no data', () => {
    const layout = computeLineHmaMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.hmaPath).toBe('');
    expect(layout.signalPath).toBe('');
  });

  it('uses custom layout dimensions', () => {
    const layout = computeLineHmaMidCrossSigLayout({
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
    const layout = computeLineHmaMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(99);
    expect(layout.priceMax).toBe(101);
  });
});

describe('describeLineHmaMidCrossSigChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineHmaMidCrossSigChart([])).toBe('No data');
  });

  it('mentions bar count, period, fast smoothed centerline trigger', () => {
    const desc = describeLineHmaMidCrossSigChart(buildLinearUp(40));
    expect(desc).toContain('40 bars');
    expect(desc).toContain('period 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('fast smoothed centerline trigger');
    expect(desc).toContain('bias coloring');
  });
});

describe('<ChartLineHmaMidCrossSig /> render', () => {
  it('renders the SVG region with default props', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineHmaMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-hma-mid-cross-sig"]',
    );
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-signal-length')).toBe(String(SIGNAL));
    expect(root?.getAttribute('data-half')).toBe(String(HALF));
    expect(root?.getAttribute('data-sqrt-period')).toBe(String(SQRT_PERIOD));
  });

  it('renders empty fallback when data is empty', () => {
    const { container } = render(<ChartLineHmaMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders HMA + signal paths', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineHmaMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-mid-cross-sig-hma-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-mid-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects showLegend=false', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineHmaMidCrossSig data={data} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders configurable badge', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineHmaMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-hma-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('period 14');
    expect(badge?.textContent).toContain('half 7');
    expect(badge?.textContent).toContain('sqrt 4');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('crosses 0');
  });

  it('exposes aria region label fallback', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineHmaMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-hma-mid-cross-sig"]',
    );
    expect(root?.getAttribute('aria-label')).toBe(
      'HMA midline-over-Signal chart',
    );
  });

  it('exposes data-cross-count counter for LINEAR UP', () => {
    const data = buildLinearUp(40);
    const { container } = render(<ChartLineHmaMidCrossSig data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-hma-mid-cross-sig"]',
    );
    expect(root?.getAttribute('data-cross-count')).toBe('0');
  });

  it('respects hidden series via controlled prop', () => {
    const data = buildLinearUp(40);
    const { container } = render(
      <ChartLineHmaMidCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-mid-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });
});
