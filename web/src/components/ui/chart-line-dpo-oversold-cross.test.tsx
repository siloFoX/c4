import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineDpoOversoldCross,
  DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_LENGTH,
  DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_PADDING,
  DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_WIDTH,
  applyLineDpoOversoldCrossSma,
  classifyLineDpoOversoldCrossRegime,
  computeLineDpoOversoldCross,
  computeLineDpoOversoldCrossLayout,
  describeLineDpoOversoldCrossChart,
  detectLineDpoOversoldCrossCrosses,
  getLineDpoOversoldCrossFinitePoints,
  lineDpoOversoldCrossShift,
  normalizeLineDpoOversoldCrossLength,
  normalizeLineDpoOversoldCrossThreshold,
  runLineDpoOversoldCross,
  type ChartLineDpoOversoldCrossPoint,
} from './chart-line-dpo-oversold-cross';

const mk = (closes: number[]): ChartLineDpoOversoldCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineDpoOversoldCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineDpoOversoldCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineDpoOversoldCrossFinitePoints(null)).toEqual([]);
    expect(getLineDpoOversoldCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineDpoOversoldCrossFinitePoints(
        'oops' as unknown as ChartLineDpoOversoldCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineDpoOversoldCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineDpoOversoldCrossLength(20, 20)).toBe(20);
  });

  it('floors fractional and falls back on invalid', () => {
    expect(normalizeLineDpoOversoldCrossLength(7.9, 20)).toBe(7);
    expect(normalizeLineDpoOversoldCrossLength(0, 20)).toBe(20);
    expect(normalizeLineDpoOversoldCrossLength(NaN, 20)).toBe(20);
  });
});

describe('normalizeLineDpoOversoldCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineDpoOversoldCrossThreshold(-1, -1)).toBe(-1);
    expect(normalizeLineDpoOversoldCrossThreshold(0, -1)).toBe(0);
    expect(normalizeLineDpoOversoldCrossThreshold(5, -1)).toBe(5);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineDpoOversoldCrossThreshold(NaN, -1)).toBe(-1);
    expect(normalizeLineDpoOversoldCrossThreshold(Infinity, -1)).toBe(-1);
  });
});

describe('lineDpoOversoldCrossShift', () => {
  it('shift = floor(length / 2) + 1', () => {
    expect(lineDpoOversoldCrossShift(20)).toBe(11);
    expect(lineDpoOversoldCrossShift(14)).toBe(8);
  });
});

describe('applyLineDpoOversoldCrossSma', () => {
  it('CONST -> SMA = value', () => {
    const out = applyLineDpoOversoldCrossSma(new Array(30).fill(42), 20);
    for (let i = 19; i < 30; i += 1) expect(out[i]).toBe(42);
  });
});

describe('computeLineDpoOversoldCross - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> dpo = 0',
    (K) => {
      const data = mk(new Array(50).fill(K));
      const { dpo } = computeLineDpoOversoldCross(data);
      for (let i = 0; i < 19; i += 1) expect(dpo[i]).toBeNull();
      for (let i = 19; i < 50; i += 1) {
        expect(dpo[i]).toBe(0);
        expect(Object.is(dpo[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineDpoOversoldCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> dpo = -1.5', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const { dpo } = computeLineDpoOversoldCross(data);
    for (let i = 19; i < 50; i += 1) expect(dpo[i]).toBeCloseTo(-1.5, 10);
  });

  it('LINEAR DOWN close=-i -> dpo = 1.5', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const { dpo } = computeLineDpoOversoldCross(data);
    for (let i = 19; i < 50; i += 1) expect(dpo[i]).toBeCloseTo(1.5, 10);
  });
});

describe('classifyLineDpoOversoldCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineDpoOversoldCrossRegime(null, -1)).toBe('none');
  });

  it('dpo >= threshold -> bullish (above oversold)', () => {
    expect(classifyLineDpoOversoldCrossRegime(-1, -1)).toBe('bullish');
    expect(classifyLineDpoOversoldCrossRegime(0, -1)).toBe('bullish');
    expect(classifyLineDpoOversoldCrossRegime(1.5, -1)).toBe('bullish');
  });

  it('dpo < threshold -> bearish (in oversold zone)', () => {
    expect(classifyLineDpoOversoldCrossRegime(-1.5, -1)).toBe('bearish');
    expect(classifyLineDpoOversoldCrossRegime(-10, -1)).toBe('bearish');
  });
});

describe('detectLineDpoOversoldCrossCrosses', () => {
  it('fires bullish on prev <= -1 && cur > -1', () => {
    const series = mk([1, 2, 3, 4]);
    const dpo = [-2, -1.5, -1.2, -0.5];
    expect(detectLineDpoOversoldCrossCrosses(series, dpo, -1)).toEqual([
      { index: 3, x: 3, kind: 'bullish' },
    ]);
  });

  it('fires bearish on prev >= -1 && cur < -1', () => {
    const series = mk([1, 2, 3, 4]);
    const dpo = [0, -0.5, -0.8, -1.5];
    expect(detectLineDpoOversoldCrossCrosses(series, dpo, -1)).toEqual([
      { index: 3, x: 3, kind: 'bearish' },
    ]);
  });

  it('boundary cur == -1 not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineDpoOversoldCrossCrosses(series, [-2, -1], -1),
    ).toEqual([]);
  });

  it('skips when prev/cur is null', () => {
    const series = mk([1, 2]);
    expect(
      detectLineDpoOversoldCrossCrosses(series, [null, 0], -1),
    ).toEqual([]);
    expect(
      detectLineDpoOversoldCrossCrosses(series, [0, null], -1),
    ).toEqual([]);
  });

  it('no cross when dpo stays one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineDpoOversoldCrossCrosses(series, [-2, -1.5, -1.2, -1.1], -1),
    ).toEqual([]);
  });
});

describe('runLineDpoOversoldCross', () => {
  it('CONST K -> bullish (0 >= -1), 0 crosses (50 bars)', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineDpoOversoldCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.bullishCount).toBe(31);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(20);
    expect(run.threshold).toBe(-1);
    expect(run.shift).toBe(11);
  });

  it('LINEAR UP 50 -> bearish (dpo=-1.5 < -1), 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const run = runLineDpoOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(31);
    expect(run.bullishCount).toBe(0);
  });

  it('LINEAR DOWN 50 -> bullish (dpo=1.5 > -1), 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const run = runLineDpoOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(31);
    expect(run.bearishCount).toBe(0);
  });

  it('respects custom length and threshold', () => {
    const data = mk(new Array(50).fill(50));
    expect(runLineDpoOversoldCross(data, { length: 14 }).length).toBe(14);
    expect(runLineDpoOversoldCross(data, { length: 14 }).shift).toBe(8);
    expect(
      runLineDpoOversoldCross(data, { threshold: -2.5 }).threshold,
    ).toBe(-2.5);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineDpoOversoldCross([]).ok).toBe(false);
    expect(runLineDpoOversoldCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineDpoOversoldCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineDpoOversoldCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry dpo / regime', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineDpoOversoldCross(data);
    for (let i = 19; i < 50; i += 1) {
      expect(run.samples[i]!.dpo).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineDpoOversoldCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineDpoOversoldCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_PANEL_GAP,
    );
  });

  it('CONST K -> dpo=0, threshold=-1 -> auto-fit (-1..0) padded', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineDpoOversoldCrossLayout({ data });
    // dpo=0 constant, threshold=-1. range = [-1, 0]. padding 10% -> [-1.1, 0.1].
    expect(layout.oscMin).toBeCloseTo(-1.1, 6);
    expect(layout.oscMax).toBeCloseTo(0.1, 6);
  });

  it('LINEAR UP -> dpo=-1.5 -> auto-fit (-1.5..-1) padded', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineDpoOversoldCrossLayout({ data });
    // dpo=-1.5 constant < threshold=-1. range = [-1.5, -1]. padding 10% -> [-1.55, -0.95].
    expect(layout.oscMin).toBeCloseTo(-1.55, 6);
    expect(layout.oscMax).toBeCloseTo(-0.95, 6);
  });

  it('threshold line sits inside osc panel', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineDpoOversoldCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineDpoOversoldCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.dpoPath).toBe('');
  });

  it('path uses M then L commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineDpoOversoldCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('dpo path single M when no gaps', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineDpoOversoldCrossLayout({ data });
    expect(layout.dpoPath.startsWith('M ')).toBe(true);
    expect((layout.dpoPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(50).fill(7));
    const layout = computeLineDpoOversoldCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineDpoOversoldCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineDpoOversoldCrossChart([])).toBe('No data');
  });

  it('describes parameters + oversold framing', () => {
    const data = mk(new Array(50).fill(50));
    const desc = describeLineDpoOversoldCrossChart(data);
    expect(desc).toContain('DPO Oversold Cross chart');
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('threshold -1');
    expect(desc).toContain('shift 11');
    expect(desc).toContain('detrended momentum oversold');
  });
});

describe('ChartLineDpoOversoldCross rendering', () => {
  it('renders region + role=img SVG', () => {
    const data = mk(new Array(50).fill(10));
    const { container, getByRole } = render(
      <ChartLineDpoOversoldCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'DPO Oversold Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('renders config badge with shift', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOversoldCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-dpo-oversold-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('threshold -1');
    expect(badge?.textContent).toContain('shift 11');
  });

  it('renders legend toggles for price + dpo', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOversoldCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
  });

  it('toggles dpo via legend click', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOversoldCross data={data} />);
    const btn = container.querySelector('[data-series-id="dpo"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineDpoOversoldCross data={data} hiddenSeries={['dpo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-dpo-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(50).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineDpoOversoldCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="dpo"]')!);
    expect(events).toEqual([{ seriesId: 'dpo', hidden: true }]);
  });

  it('keyboard toggles legend', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOversoldCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="dpo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(<ChartLineDpoOversoldCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate flag', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineDpoOversoldCross data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineDpoOversoldCross data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOversoldCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-dpo-oversold-cross-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('threshold line hide flag', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineDpoOversoldCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-threshold-line"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineDpoOversoldCross data={data} showThreshold={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-threshold"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineDpoOversoldCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineDpoOversoldCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-oversold-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOversoldCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-dpo-oversold-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('20');
    expect(region?.getAttribute('data-threshold')).toBe('-1');
    expect(region?.getAttribute('data-shift')).toBe('11');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('31');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_DPO_OVERSOLD_CROSS_THRESHOLD).toBe(-1);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(50).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineDpoOversoldCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-dpo-oversold-cross',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mk(new Array(50).fill(10));
    const a = computeLineDpoOversoldCrossLayout({ data });
    const b = computeLineDpoOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
  });

  it('layout deterministic (LINEAR UP)', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const a = computeLineDpoOversoldCrossLayout({ data });
    const b = computeLineDpoOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
    expect(a.run.dpoValues).toEqual(b.run.dpoValues);
  });
});
