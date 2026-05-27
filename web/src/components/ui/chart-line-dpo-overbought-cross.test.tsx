import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineDpoOverboughtCross,
  DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_LENGTH,
  DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_PADDING,
  DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_WIDTH,
  applyLineDpoOverboughtCrossSma,
  classifyLineDpoOverboughtCrossRegime,
  computeLineDpoOverboughtCross,
  computeLineDpoOverboughtCrossLayout,
  describeLineDpoOverboughtCrossChart,
  detectLineDpoOverboughtCrossCrosses,
  getLineDpoOverboughtCrossFinitePoints,
  lineDpoOverboughtCrossShift,
  normalizeLineDpoOverboughtCrossLength,
  normalizeLineDpoOverboughtCrossThreshold,
  runLineDpoOverboughtCross,
  type ChartLineDpoOverboughtCrossPoint,
} from './chart-line-dpo-overbought-cross';

const mk = (closes: number[]): ChartLineDpoOverboughtCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineDpoOverboughtCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineDpoOverboughtCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineDpoOverboughtCrossFinitePoints(null)).toEqual([]);
    expect(getLineDpoOverboughtCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineDpoOverboughtCrossFinitePoints(
        'oops' as unknown as ChartLineDpoOverboughtCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineDpoOverboughtCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineDpoOverboughtCrossLength(20, 20)).toBe(20);
  });

  it('floors fractional and falls back on invalid', () => {
    expect(normalizeLineDpoOverboughtCrossLength(7.9, 20)).toBe(7);
    expect(normalizeLineDpoOverboughtCrossLength(0, 20)).toBe(20);
    expect(normalizeLineDpoOverboughtCrossLength(NaN, 20)).toBe(20);
  });
});

describe('normalizeLineDpoOverboughtCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineDpoOverboughtCrossThreshold(1, 1)).toBe(1);
    expect(normalizeLineDpoOverboughtCrossThreshold(0, 1)).toBe(0);
    expect(normalizeLineDpoOverboughtCrossThreshold(-5, 1)).toBe(-5);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineDpoOverboughtCrossThreshold(NaN, 1)).toBe(1);
    expect(normalizeLineDpoOverboughtCrossThreshold(Infinity, 1)).toBe(1);
  });
});

describe('lineDpoOverboughtCrossShift', () => {
  it('shift = floor(length / 2) + 1', () => {
    expect(lineDpoOverboughtCrossShift(20)).toBe(11);
    expect(lineDpoOverboughtCrossShift(14)).toBe(8);
  });
});

describe('applyLineDpoOverboughtCrossSma', () => {
  it('CONST -> SMA = value via short-circuit', () => {
    const out = applyLineDpoOverboughtCrossSma(new Array(30).fill(42), 20);
    for (let i = 0; i < 19; i += 1) expect(out[i]).toBeNull();
    for (let i = 19; i < 30; i += 1) expect(out[i]).toBe(42);
  });

  it('CONST zero -> +0', () => {
    const out = applyLineDpoOverboughtCrossSma(new Array(30).fill(0), 20);
    for (let i = 19; i < 30; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });
});

describe('computeLineDpoOverboughtCross - CONST K bit-exact', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> dpo = 0',
    (K) => {
      const data = mk(new Array(50).fill(K));
      const { dpo } = computeLineDpoOverboughtCross(data);
      for (let i = 0; i < 19; i += 1) expect(dpo[i]).toBeNull();
      for (let i = 19; i < 50; i += 1) {
        expect(dpo[i]).toBe(0);
        expect(Object.is(dpo[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineDpoOverboughtCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> dpo = -1.5', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const { dpo } = computeLineDpoOverboughtCross(data);
    for (let i = 19; i < 50; i += 1) expect(dpo[i]).toBeCloseTo(-1.5, 10);
  });

  it('LINEAR DOWN close=-i -> dpo = 1.5', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const { dpo } = computeLineDpoOverboughtCross(data);
    for (let i = 19; i < 50; i += 1) expect(dpo[i]).toBeCloseTo(1.5, 10);
  });
});

describe('classifyLineDpoOverboughtCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineDpoOverboughtCrossRegime(null, 1)).toBe('none');
  });

  it('dpo >= threshold -> bullish (in overbought)', () => {
    expect(classifyLineDpoOverboughtCrossRegime(1, 1)).toBe('bullish');
    expect(classifyLineDpoOverboughtCrossRegime(1.5, 1)).toBe('bullish');
    expect(classifyLineDpoOverboughtCrossRegime(10, 1)).toBe('bullish');
  });

  it('dpo < threshold -> bearish', () => {
    expect(classifyLineDpoOverboughtCrossRegime(0.9, 1)).toBe('bearish');
    expect(classifyLineDpoOverboughtCrossRegime(-1.5, 1)).toBe('bearish');
  });
});

describe('detectLineDpoOverboughtCrossCrosses', () => {
  it('fires bullish on prev <= 1 && cur > 1', () => {
    const series = mk([1, 2, 3, 4]);
    const dpo = [0, 0.5, 0.8, 1.5];
    expect(detectLineDpoOverboughtCrossCrosses(series, dpo, 1)).toEqual([
      { index: 3, x: 3, kind: 'bullish' },
    ]);
  });

  it('fires bearish on prev >= 1 && cur < 1', () => {
    const series = mk([1, 2, 3, 4]);
    const dpo = [1.5, 1.3, 1.1, 0.5];
    expect(detectLineDpoOverboughtCrossCrosses(series, dpo, 1)).toEqual([
      { index: 3, x: 3, kind: 'bearish' },
    ]);
  });

  it('boundary cur == 1 not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineDpoOverboughtCrossCrosses(series, [0, 1], 1),
    ).toEqual([]);
  });

  it('skips when prev/cur is null', () => {
    const series = mk([1, 2]);
    expect(
      detectLineDpoOverboughtCrossCrosses(series, [null, 2], 1),
    ).toEqual([]);
    expect(
      detectLineDpoOverboughtCrossCrosses(series, [2, null], 1),
    ).toEqual([]);
  });

  it('no cross when dpo stays one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineDpoOverboughtCrossCrosses(series, [-1, 0, 0.5, 0.9], 1),
    ).toEqual([]);
  });
});

describe('runLineDpoOverboughtCross', () => {
  it('CONST K -> bearish (0 < 1), 0 crosses (50 bars)', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineDpoOverboughtCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(19);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(31);
    expect(run.length).toBe(20);
    expect(run.threshold).toBe(1);
    expect(run.shift).toBe(11);
  });

  it('LINEAR UP 50 -> bearish (dpo=-1.5 < 1), 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const run = runLineDpoOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBe(31);
    expect(run.bullishCount).toBe(0);
  });

  it('LINEAR DOWN 50 -> bullish (dpo=1.5 >= 1), 0 crosses', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const run = runLineDpoOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(31);
    expect(run.bearishCount).toBe(0);
  });

  it('respects custom length and threshold', () => {
    const data = mk(new Array(50).fill(50));
    expect(runLineDpoOverboughtCross(data, { length: 14 }).length).toBe(14);
    expect(runLineDpoOverboughtCross(data, { length: 14 }).shift).toBe(8);
    expect(
      runLineDpoOverboughtCross(data, { threshold: 2.5 }).threshold,
    ).toBe(2.5);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineDpoOverboughtCross([]).ok).toBe(false);
    expect(runLineDpoOverboughtCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineDpoOverboughtCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineDpoOverboughtCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry dpo / regime', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineDpoOverboughtCross(data);
    for (let i = 0; i < 19; i += 1) {
      expect(run.samples[i]!.dpo).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 19; i < 50; i += 1) {
      expect(run.samples[i]!.dpo).toBe(0);
      expect(run.samples[i]!.regime).toBe('bearish');
    }
  });
});

describe('computeLineDpoOverboughtCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineDpoOverboughtCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_WIDTH);
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_PANEL_GAP,
    );
  });

  it('CONST K -> dpo=0 -> auto-fit expanded UP to threshold (0..1) padded', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineDpoOverboughtCrossLayout({ data });
    // dpo=0 constant, threshold=1. range = [0, 1]. padding 10% -> [-0.1, 1.1].
    expect(layout.oscMin).toBeCloseTo(-0.1, 6);
    expect(layout.oscMax).toBeCloseTo(1.1, 6);
  });

  it('LINEAR DOWN -> dpo=1.5 -> auto-fit (1..1.5) padded', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const layout = computeLineDpoOverboughtCrossLayout({ data });
    // dpo=1.5 constant >= threshold=1. range = [1, 1.5]. padding 10% -> [0.95, 1.55].
    expect(layout.oscMin).toBeCloseTo(0.95, 6);
    expect(layout.oscMax).toBeCloseTo(1.55, 6);
  });

  it('threshold line sits inside osc panel', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineDpoOverboughtCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineDpoOverboughtCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.dpoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineDpoOverboughtCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('dpo path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineDpoOverboughtCrossLayout({ data });
    expect(layout.dpoPath.startsWith('M ')).toBe(true);
    expect((layout.dpoPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(50).fill(7));
    const layout = computeLineDpoOverboughtCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineDpoOverboughtCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineDpoOverboughtCrossChart([])).toBe('No data');
  });

  it('describes parameters + overbought framing', () => {
    const data = mk(new Array(50).fill(50));
    const desc = describeLineDpoOverboughtCrossChart(data);
    expect(desc).toContain('DPO Overbought Cross chart');
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('threshold 1');
    expect(desc).toContain('shift 11');
    expect(desc).toContain('detrended momentum overbought');
  });
});

describe('ChartLineDpoOverboughtCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(50).fill(10));
    const { container, getByRole } = render(
      <ChartLineDpoOverboughtCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'DPO Overbought Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
  });

  it('renders config badge with shift', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOverboughtCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-dpo-overbought-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('threshold 1');
    expect(badge?.textContent).toContain('shift 11');
  });

  it('renders legend toggles for price + dpo', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOverboughtCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('dpo');
  });

  it('toggles dpo via legend click', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOverboughtCross data={data} />);
    const btn = container.querySelector('[data-series-id="dpo"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineDpoOverboughtCross data={data} hiddenSeries={['dpo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-dpo-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(50).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineDpoOverboughtCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="dpo"]')!);
    expect(events).toEqual([{ seriesId: 'dpo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOverboughtCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="dpo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data"', () => {
    const { container } = render(<ChartLineDpoOverboughtCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate default + false toggle', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineDpoOverboughtCross data={data} />,
    );
    expect(container.querySelector('svg')?.getAttribute('class')).toBe(
      'motion-safe:animate-fade-in',
    );
    rerender(<ChartLineDpoOverboughtCross data={data} animate={false} />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBeNull();
  });

  it('hover sets tooltip', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOverboughtCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-dpo-overbought-cross-hover"]',
    );
    fireEvent.mouseEnter(hovers[0]!);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-tooltip"]',
      ),
    ).not.toBeNull();
  });

  it('renders threshold line by default and hides on showThreshold=false', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineDpoOverboughtCross data={data} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-threshold-line"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineDpoOverboughtCross data={data} showThreshold={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-threshold"]',
      ),
    ).toBeNull();
  });

  it('showAxis/showGrid/showLegend hide flags', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineDpoOverboughtCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses / showOverlayCrosses hide markers', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineDpoOverboughtCross
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineDpoOverboughtCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-dpo-overbought-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('20');
    expect(region?.getAttribute('data-threshold')).toBe('1');
    expect(region?.getAttribute('data-shift')).toBe('11');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bearish-count')).toBe('31');
    expect(region?.getAttribute('data-bullish-count')).toBe('0');
  });

  it('defaults match constants', () => {
    expect(DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_DPO_OVERBOUGHT_CROSS_THRESHOLD).toBe(1);
  });

  it('forwardRef returns wrapping div', () => {
    const data = mk(new Array(50).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineDpoOverboughtCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-dpo-overbought-cross',
    );
  });

  it('layout deterministic (CONST)', () => {
    const data = mk(new Array(50).fill(10));
    const a = computeLineDpoOverboughtCrossLayout({ data });
    const b = computeLineDpoOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
    expect(a.thresholdY).toBe(b.thresholdY);
  });

  it('layout deterministic (LINEAR DOWN)', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const a = computeLineDpoOverboughtCrossLayout({ data });
    const b = computeLineDpoOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
    expect(a.run.dpoValues).toEqual(b.run.dpoValues);
  });
});
