import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineVfiZeroCross,
  DEFAULT_CHART_LINE_VFI_ZERO_CROSS_COEF,
  DEFAULT_CHART_LINE_VFI_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_VFI_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_VFI_ZERO_CROSS_MAX_VOLUME_COEF,
  DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_VFI_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_VFI_ZERO_CROSS_WIDTH,
  applyLineVfiZeroCrossSma,
  applyLineVfiZeroCrossStdev,
  classifyLineVfiZeroCrossRegime,
  computeLineVfiZeroCross,
  computeLineVfiZeroCrossLayout,
  describeLineVfiZeroCrossChart,
  detectLineVfiZeroCrossCrosses,
  getLineVfiZeroCrossFinitePoints,
  normalizeLineVfiZeroCrossCoef,
  normalizeLineVfiZeroCrossLength,
  normalizeLineVfiZeroCrossThreshold,
  runLineVfiZeroCross,
  type ChartLineVfiZeroCrossPoint,
} from './chart-line-vfi-zero-cross';

const mkConst = (
  K: number,
  V: number,
  n: number,
): ChartLineVfiZeroCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K, volume: V }));

const mkGeom = (
  K: number,
  r: number,
  V: number,
  n: number,
): ChartLineVfiZeroCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    close: K * Math.pow(r, i),
    volume: V,
  }));

describe('getLineVfiZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10, volume: 100 },
      { x: 1, close: NaN, volume: 100 },
      { x: 2, close: 10, volume: NaN },
      { x: Infinity, close: 10, volume: 100 },
      { x: 3, close: 10, volume: 100 },
    ];
    expect(getLineVfiZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10, volume: 100 },
      { x: 3, close: 10, volume: 100 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineVfiZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineVfiZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineVfiZeroCrossFinitePoints(
        'oops' as unknown as ChartLineVfiZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineVfiZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineVfiZeroCrossLength(14, 14)).toBe(14);
    expect(normalizeLineVfiZeroCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineVfiZeroCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineVfiZeroCrossLength(0, 14)).toBe(14);
    expect(normalizeLineVfiZeroCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineVfiZeroCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineVfiZeroCrossCoef', () => {
  it('keeps finite non-negative numbers', () => {
    expect(normalizeLineVfiZeroCrossCoef(0.5, 0.2)).toBe(0.5);
    expect(normalizeLineVfiZeroCrossCoef(0, 0.2)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineVfiZeroCrossCoef(-0.1, 0.2)).toBe(0.2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineVfiZeroCrossCoef(NaN, 0.2)).toBe(0.2);
  });
});

describe('normalizeLineVfiZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineVfiZeroCrossThreshold(0, -1)).toBe(0);
    expect(normalizeLineVfiZeroCrossThreshold(2, -1)).toBe(2);
    expect(normalizeLineVfiZeroCrossThreshold(-2, -1)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineVfiZeroCrossThreshold(NaN, -1)).toBe(-1);
  });
});

describe('applyLineVfiZeroCrossSma', () => {
  it('CONST short-circuit', () => {
    const out = applyLineVfiZeroCrossSma(new Array(20).fill(5), 14);
    for (let i = 0; i < 13; i += 1) expect(out[i]).toBeNull();
    for (let i = 13; i < 20; i += 1) expect(out[i]).toBe(5);
  });

  it('length === 1 returns verbatim', () => {
    expect(applyLineVfiZeroCrossSma([1, -2, 3], 1)).toEqual([1, -2, 3]);
  });
});

describe('applyLineVfiZeroCrossStdev', () => {
  it('CONST values -> stdev = 0', () => {
    const out = applyLineVfiZeroCrossStdev(new Array(20).fill(5), 14);
    for (let i = 0; i < 13; i += 1) expect(out[i]).toBeNull();
    for (let i = 13; i < 20; i += 1) expect(out[i]).toBe(0);
  });

  it('alternating +1/-1 -> stdev = 1', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const out = applyLineVfiZeroCrossStdev(values, 14);
    for (let i = 13; i < 20; i += 1) {
      expect(out[i]).toBeCloseTo(1, 10);
    }
  });
});

describe('computeLineVfiZeroCross - CONST K bit-exact anchor', () => {
  it.each([1, 42, 100, 1234])(
    'CONST close K=%d, volume=100 -> vfi = 0 once warmed',
    (K) => {
      const data = mkConst(K, 100, 40);
      const { vfi } = computeLineVfiZeroCross(data, { length: 10 });
      // Need length stdev + length SMA -> i = 19 should be valid.
      for (let i = 0; i < 19; i += 1) {
        expect(vfi[i]).toBeNull();
      }
      for (let i = 19; i < 40; i += 1) {
        expect(vfi[i]).toBe(0);
      }
    },
  );
});

describe('computeLineVfiZeroCross - GEOMETRIC ramps', () => {
  it('GEOMETRIC UP close=1.01^i -> vfi = +1 after warmup', () => {
    const data = mkGeom(1, 1.01, 100, 40);
    const { vfi } = computeLineVfiZeroCross(data, { length: 10 });
    for (let i = 19; i < 40; i += 1) {
      expect(vfi[i]).toBeCloseTo(1, 10);
    }
  });

  it('GEOMETRIC DOWN close=0.99^i -> vfi = -1 after warmup', () => {
    const data = mkGeom(1, 0.99, 100, 40);
    const { vfi } = computeLineVfiZeroCross(data, { length: 10 });
    for (let i = 19; i < 40; i += 1) {
      expect(vfi[i]).toBeCloseTo(-1, 10);
    }
  });

  it('vfi[i < 2*length-1] is null', () => {
    const data = mkGeom(1, 1.01, 100, 40);
    const { vfi } = computeLineVfiZeroCross(data, { length: 10 });
    for (let i = 0; i < 19; i += 1) {
      expect(vfi[i]).toBeNull();
    }
  });

  it('custom length=5 works', () => {
    const data = mkGeom(1, 1.01, 100, 30);
    const { vfi } = computeLineVfiZeroCross(data, { length: 5 });
    for (let i = 0; i < 9; i += 1) {
      expect(vfi[i]).toBeNull();
    }
    for (let i = 9; i < 30; i += 1) {
      expect(vfi[i]).toBeCloseTo(1, 10);
    }
  });

  it('zero close at index drops the log step', () => {
    const data: ChartLineVfiZeroCrossPoint[] = [
      ...mkConst(10, 100, 5),
      { x: 5, close: 0, volume: 100 },
      ...Array.from({ length: 14 }, (_, i) => ({
        x: 6 + i,
        close: 10,
        volume: 100,
      })),
    ];
    const result = computeLineVfiZeroCross(data, { length: 5 });
    expect(result.vfi).toBeInstanceOf(Array);
  });
});

describe('classifyLineVfiZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineVfiZeroCrossRegime(null, 0)).toBe('none');
  });

  it('vfi at threshold boundary -> bullish', () => {
    expect(classifyLineVfiZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineVfiZeroCrossRegime(0.5, 0)).toBe('bullish');
  });

  it('vfi < threshold -> bearish', () => {
    expect(classifyLineVfiZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineVfiZeroCrossRegime(-1, 0)).toBe('bearish');
  });
});

describe('detectLineVfiZeroCrossCrosses', () => {
  it('fires bullish when vfi crosses up through 0', () => {
    const series = mkConst(10, 100, 5);
    const vfi = [-0.5, -0.2, -0.1, 0.5, 1];
    const crosses = detectLineVfiZeroCrossCrosses(series, vfi, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when vfi crosses down through 0', () => {
    const series = mkConst(10, 100, 5);
    const vfi = [0.5, 0.2, 0.1, -0.5, -1];
    const crosses = detectLineVfiZeroCrossCrosses(series, vfi, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mkConst(10, 100, 4);
    const vfi = [-1, 1, 0.5, -1];
    const crosses = detectLineVfiZeroCrossCrosses(series, vfi, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mkConst(10, 100, 3);
    expect(
      detectLineVfiZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineVfiZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed', () => {
    const series = mkConst(10, 100, 2);
    expect(detectLineVfiZeroCrossCrosses(series, [-1, 0], 0)).toEqual([]);
  });

  it('no cross when vfi stays on one side', () => {
    const series = mkConst(10, 100, 4);
    expect(
      detectLineVfiZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLineVfiZeroCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mkConst(50, 100, 40);
    const run = runLineVfiZeroCross(data, { length: 10 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.bullishCount).toBe(21);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(10);
  });

  it('GEOMETRIC UP -> all bullish after warmup', () => {
    const data = mkGeom(1, 1.01, 100, 40);
    const run = runLineVfiZeroCross(data, { length: 10 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(21);
    expect(run.bearishCount).toBe(0);
  });

  it('GEOMETRIC DOWN -> all bearish after warmup', () => {
    const data = mkGeom(1, 0.99, 100, 40);
    const run = runLineVfiZeroCross(data, { length: 10 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(21);
  });

  it('decline then rise generates bullish cross', () => {
    const data: ChartLineVfiZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.99, i), volume: 100 });
    }
    const startUp = Math.pow(0.99, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: 30 + i, close: startUp * Math.pow(1.01, i + 1), volume: 100 });
    }
    const run = runLineVfiZeroCross(data, { length: 10 });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish cross', () => {
    const data: ChartLineVfiZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(1.01, i), volume: 100 });
    }
    const startDn = Math.pow(1.01, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: 30 + i, close: startDn * Math.pow(0.99, i + 1), volume: 100 });
    }
    const run = runLineVfiZeroCross(data, { length: 10 });
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mkConst(10, 100, 40);
    const run = runLineVfiZeroCross(data, { length: 10, threshold: NaN });
    expect(run.threshold).toBe(0);
  });

  it('respects custom threshold', () => {
    const data = mkConst(10, 100, 40);
    expect(
      runLineVfiZeroCross(data, { length: 10, threshold: 0.5 }).threshold,
    ).toBe(0.5);
    expect(
      runLineVfiZeroCross(data, { length: 10, threshold: -0.5 }).threshold,
    ).toBe(-0.5);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineVfiZeroCross([]).ok).toBe(false);
    expect(runLineVfiZeroCross(mkConst(10, 100, 3)).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineVfiZeroCrossPoint[] = [
      { x: 3, close: 30, volume: 100 },
      { x: 1, close: 10, volume: 100 },
      { x: 2, close: 20, volume: 100 },
    ];
    const run = runLineVfiZeroCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / volume / vfi / regime', () => {
    const data = mkConst(10, 100, 40);
    const run = runLineVfiZeroCross(data, { length: 10 });
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 19; i += 1) {
      expect(run.samples[i]!.vfi).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
      expect(run.samples[i]!.volume).toBe(100);
    }
    for (let i = 19; i < 40; i += 1) {
      expect(run.samples[i]!.vfi).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineVfiZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mkConst(50, 100, 40);
    const layout = computeLineVfiZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_VFI_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_VFI_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PANEL_GAP);
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mkGeom(1, 1.01, 100, 40);
    const layout = computeLineVfiZeroCrossLayout({ data, length: 10 });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineVfiZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.vfiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed vfi plus padding', () => {
    const data = mkGeom(1, 1.01, 100, 40);
    const layout = computeLineVfiZeroCrossLayout({ data, length: 10 });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(1);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mkGeom(1, 1.01, 100, 40);
    const layout = computeLineVfiZeroCrossLayout({ data, length: 10 });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('vfi path skips null gaps with new M commands', () => {
    const data = mkGeom(1, 1.01, 100, 40);
    const layout = computeLineVfiZeroCrossLayout({ data, length: 10 });
    expect(layout.vfiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.vfiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mkConst(7, 100, 40);
    const layout = computeLineVfiZeroCrossLayout({ data, length: 10 });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const data: ChartLineVfiZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.99, i), volume: 100 });
    }
    const startUp = Math.pow(0.99, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: 30 + i, close: startUp * Math.pow(1.01, i + 1), volume: 100 });
    }
    const layout = computeLineVfiZeroCrossLayout({ data, length: 10 });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineVfiZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineVfiZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mkConst(50, 100, 40);
    const desc = describeLineVfiZeroCrossChart(data);
    expect(desc).toContain('VFI Zero Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('coef 0.2');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineVfiZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mkConst(10, 100, 40);
    const { container, getByRole } = render(
      <ChartLineVfiZeroCross data={data} length={10} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('VFI Zero Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-vfi-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('VFI Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(
      <ChartLineVfiZeroCross data={data} length={10} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-vfi-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 10');
    expect(badge?.textContent).toContain('coef 0.2');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + vfi', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(<ChartLineVfiZeroCross data={data} length={10} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('vfi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(<ChartLineVfiZeroCross data={data} length={10} />);
    const btn = container.querySelector('[data-series-id="vfi"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mkConst(10, 100, 40);
    const { container, rerender } = render(
      <ChartLineVfiZeroCross data={data} length={10} hiddenSeries={['vfi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-vfi-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineVfiZeroCross data={data} length={10} hiddenSeries={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-vfi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mkConst(10, 100, 40);
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineVfiZeroCross
        data={data}
        length={10}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="vfi"]')!);
    expect(events).toEqual([{ seriesId: 'vfi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(<ChartLineVfiZeroCross data={data} length={10} />);
    const btn = container.querySelector(
      '[data-series-id="vfi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineVfiZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(
      <ChartLineVfiZeroCross data={data} length={10} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(<ChartLineVfiZeroCross data={data} length={10} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(<ChartLineVfiZeroCross data={data} length={10} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-vfi-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-vfi-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(<ChartLineVfiZeroCross data={data} length={10} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(
      <ChartLineVfiZeroCross data={data} length={10} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(
      <ChartLineVfiZeroCross
        data={data}
        length={10}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const data: ChartLineVfiZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.99, i), volume: 100 });
    }
    const startUp = Math.pow(0.99, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: 30 + i, close: startUp * Math.pow(1.01, i + 1), volume: 100 });
    }
    const { container } = render(<ChartLineVfiZeroCross data={data} length={10} />);
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-vfi-zero-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const data: ChartLineVfiZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.99, i), volume: 100 });
    }
    const startUp = Math.pow(0.99, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: 30 + i, close: startUp * Math.pow(1.01, i + 1), volume: 100 });
    }
    const { container } = render(
      <ChartLineVfiZeroCross data={data} length={10} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const data: ChartLineVfiZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.99, i), volume: 100 });
    }
    const startUp = Math.pow(0.99, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: 30 + i, close: startUp * Math.pow(1.01, i + 1), volume: 100 });
    }
    const { container } = render(
      <ChartLineVfiZeroCross
        data={data}
        length={10}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vfi-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mkConst(10, 100, 40);
    const { container } = render(<ChartLineVfiZeroCross data={data} length={10} />);
    const region = container.querySelector(
      '[data-section="chart-line-vfi-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('10');
    expect(region?.getAttribute('data-coef')).toBe('0.2');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('21');
  });

  it('defaults: length=14, coef=0.2, maxVolumeCoef=2.5, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_VFI_ZERO_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_VFI_ZERO_CROSS_COEF).toBe(0.2);
    expect(DEFAULT_CHART_LINE_VFI_ZERO_CROSS_MAX_VOLUME_COEF).toBe(2.5);
    expect(DEFAULT_CHART_LINE_VFI_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mkConst(10, 100, 40);
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineVfiZeroCross data={data} length={10} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-vfi-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mkConst(10, 100, 40);
    const a = computeLineVfiZeroCrossLayout({ data, length: 10 });
    const b = computeLineVfiZeroCrossLayout({ data, length: 10 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.vfiPath).toBe(b.vfiPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const data: ChartLineVfiZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.99, i), volume: 100 });
    }
    const startUp = Math.pow(0.99, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: 30 + i, close: startUp * Math.pow(1.01, i + 1), volume: 100 });
    }
    const a = computeLineVfiZeroCrossLayout({ data, length: 10 });
    const b = computeLineVfiZeroCrossLayout({ data, length: 10 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.vfiPath).toBe(b.vfiPath);
    expect(a.run.vfiValues).toEqual(b.run.vfiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
