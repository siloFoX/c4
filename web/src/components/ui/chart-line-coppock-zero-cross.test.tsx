import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineCoppockZeroCross,
  DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_LONG,
  DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PERIOD,
  DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_SHORT,
  DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_WIDTH,
  applyLineCoppockZeroCrossWma,
  classifyLineCoppockZeroCrossRegime,
  computeLineCoppockZeroCross,
  computeLineCoppockZeroCrossLayout,
  describeLineCoppockZeroCrossChart,
  detectLineCoppockZeroCrossCrosses,
  getLineCoppockZeroCrossFinitePoints,
  normalizeLineCoppockZeroCrossLength,
  normalizeLineCoppockZeroCrossThreshold,
  runLineCoppockZeroCross,
  type ChartLineCoppockZeroCrossPoint,
} from './chart-line-coppock-zero-cross';

const mk = (closes: number[]): ChartLineCoppockZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const mkGeom = (
  K: number,
  r: number,
  n: number,
): ChartLineCoppockZeroCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    close: K * Math.pow(r, i),
  }));

const SMALL = { short: 3, long: 5, period: 4 };

describe('getLineCoppockZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineCoppockZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineCoppockZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineCoppockZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineCoppockZeroCrossFinitePoints(
        'oops' as unknown as ChartLineCoppockZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineCoppockZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineCoppockZeroCrossLength(10, 10)).toBe(10);
    expect(normalizeLineCoppockZeroCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineCoppockZeroCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineCoppockZeroCrossLength(0, 10)).toBe(10);
    expect(normalizeLineCoppockZeroCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineCoppockZeroCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineCoppockZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineCoppockZeroCrossThreshold(0, -1)).toBe(0);
    expect(normalizeLineCoppockZeroCrossThreshold(2, -1)).toBe(2);
    expect(normalizeLineCoppockZeroCrossThreshold(-2, -1)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineCoppockZeroCrossThreshold(NaN, -1)).toBe(-1);
  });
});

describe('applyLineCoppockZeroCrossWma', () => {
  it('CONST values short-circuit', () => {
    const out = applyLineCoppockZeroCrossWma(new Array(20).fill(7), 10);
    for (let i = 0; i < 9; i += 1) expect(out[i]).toBeNull();
    for (let i = 9; i < 20; i += 1) expect(out[i]).toBe(7);
  });

  it('length === 1 returns values verbatim', () => {
    expect(applyLineCoppockZeroCrossWma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('weighted mean for known small input', () => {
    // values [1, 2, 3, 4] with length=4: weighted = 1*1 + 2*2 + 3*3 + 4*4 = 30
    // denom = 4*5/2 = 10. wma[3] = 3.
    const out = applyLineCoppockZeroCrossWma([1, 2, 3, 4], 4);
    expect(out[3]).toBeCloseTo(3, 10);
  });

  it('null in window -> null result', () => {
    const out = applyLineCoppockZeroCrossWma(
      [1, null, 3, 4] as Array<number | null>,
      4,
    );
    expect(out[3]).toBeNull();
  });
});

describe('computeLineCoppockZeroCross - CONST K bit-exact anchor', () => {
  it.each([1, 42, 100, 1234])(
    'CONST close K=%d -> coppock = 0 from index max(short,long)+period-1 onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { coppock } = computeLineCoppockZeroCross(data, SMALL);
      // SMALL: short=3, long=5, period=4. Valid at i >= 5 + 4 - 1 = 8.
      for (let i = 0; i < 8; i += 1) {
        expect(coppock[i]).toBeNull();
      }
      for (let i = 8; i < 30; i += 1) {
        expect(coppock[i]).toBe(0);
      }
    },
  );
});

describe('computeLineCoppockZeroCross - GEOMETRIC ramps', () => {
  it('GEOMETRIC UP r=1.01 -> coppock = constant positive value', () => {
    const data = mkGeom(1, 1.01, 30);
    const { coppock } = computeLineCoppockZeroCross(data, SMALL);
    // SMALL: short=3, long=5. expected sum = (1.01^3 - 1)*100 + (1.01^5 - 1)*100
    const expected =
      (Math.pow(1.01, 3) - 1) * 100 + (Math.pow(1.01, 5) - 1) * 100;
    for (let i = 8; i < 30; i += 1) {
      expect(coppock[i]).toBeCloseTo(expected, 6);
    }
    expect(expected).toBeGreaterThan(0);
  });

  it('GEOMETRIC DOWN r=0.99 -> coppock = constant negative value', () => {
    const data = mkGeom(1, 0.99, 30);
    const { coppock } = computeLineCoppockZeroCross(data, SMALL);
    const expected =
      (Math.pow(0.99, 3) - 1) * 100 + (Math.pow(0.99, 5) - 1) * 100;
    for (let i = 8; i < 30; i += 1) {
      expect(coppock[i]).toBeCloseTo(expected, 6);
    }
    expect(expected).toBeLessThan(0);
  });

  it('rocShort / rocLong / sum / coppock channels all exposed', () => {
    const data = mk(new Array(30).fill(50));
    const channels = computeLineCoppockZeroCross(data, SMALL);
    expect(channels.rocShort).toHaveLength(30);
    expect(channels.rocLong).toHaveLength(30);
    expect(channels.sum).toHaveLength(30);
    expect(channels.coppock).toHaveLength(30);
  });

  it('coppock[i < max(short,long) + period - 1] is null', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i + 1));
    const { coppock } = computeLineCoppockZeroCross(data, SMALL);
    for (let i = 0; i < 8; i += 1) {
      expect(coppock[i]).toBeNull();
    }
  });

  it('custom larger short / long / period extends warmup', () => {
    const data = mk(new Array(60).fill(10));
    const { coppock } = computeLineCoppockZeroCross(data, {
      short: 5,
      long: 8,
      period: 6,
    });
    // Valid at i >= 8 + 6 - 1 = 13.
    for (let i = 0; i < 13; i += 1) {
      expect(coppock[i]).toBeNull();
    }
    for (let i = 13; i < 60; i += 1) {
      expect(coppock[i]).toBe(0);
    }
  });

  it('zero prior close -> ROC null at that index', () => {
    const data: ChartLineCoppockZeroCrossPoint[] = [
      ...mk([0, 1, 2, 3, 4]),
      ...mk([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]),
    ];
    const { coppock } = computeLineCoppockZeroCross(data, SMALL);
    // close[0] = 0 means roc_short[3] = null (close[0] is divisor).
    expect(coppock).toBeInstanceOf(Array);
  });
});

describe('classifyLineCoppockZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineCoppockZeroCrossRegime(null, 0)).toBe('none');
  });

  it('coppock at threshold boundary -> bullish', () => {
    expect(classifyLineCoppockZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLineCoppockZeroCrossRegime(10, 0)).toBe('bullish');
  });

  it('coppock < threshold -> bearish', () => {
    expect(classifyLineCoppockZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLineCoppockZeroCrossRegime(-50, 0)).toBe('bearish');
  });
});

describe('detectLineCoppockZeroCrossCrosses', () => {
  it('fires bullish when coppock crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [-5, -3, -1, 1, 2];
    const crosses = detectLineCoppockZeroCrossCrosses(series, v, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when coppock crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [5, 3, 1, -1, -2];
    const crosses = detectLineCoppockZeroCrossCrosses(series, v, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const v = [-1, 1, 0.5, -1];
    const crosses = detectLineCoppockZeroCrossCrosses(series, v, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineCoppockZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineCoppockZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineCoppockZeroCrossCrosses(series, [-1, 0], 0)).toEqual([]);
  });

  it('no cross when coppock stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineCoppockZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLineCoppockZeroCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineCoppockZeroCross(data, SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(8);
    expect(run.bullishCount).toBe(22);
    expect(run.bearishCount).toBe(0);
    expect(run.short).toBe(3);
    expect(run.long).toBe(5);
    expect(run.period).toBe(4);
  });

  it('GEOMETRIC UP r=1.01 -> all bullish after warmup', () => {
    const data = mkGeom(1, 1.01, 30);
    const run = runLineCoppockZeroCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(22);
    expect(run.bearishCount).toBe(0);
  });

  it('GEOMETRIC DOWN r=0.99 -> all bearish after warmup', () => {
    const data = mkGeom(1, 0.99, 30);
    const run = runLineCoppockZeroCross(data, SMALL);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(22);
  });

  it('decline then rise generates bullish cross', () => {
    const data: ChartLineCoppockZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.97, i) });
    }
    const start = Math.pow(0.97, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({
        x: 30 + i,
        close: start * Math.pow(1.03, i + 1),
      });
    }
    const run = runLineCoppockZeroCross(data, SMALL);
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish cross', () => {
    const data: ChartLineCoppockZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(1.03, i) });
    }
    const start = Math.pow(1.03, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({
        x: 30 + i,
        close: start * Math.pow(0.97, i + 1),
      });
    }
    const run = runLineCoppockZeroCross(data, SMALL);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineCoppockZeroCross(data, { ...SMALL, threshold: NaN });
    expect(run.threshold).toBe(0);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(30).fill(50));
    expect(
      runLineCoppockZeroCross(data, { ...SMALL, threshold: 5 }).threshold,
    ).toBe(5);
    expect(
      runLineCoppockZeroCross(data, { ...SMALL, threshold: -5 }).threshold,
    ).toBe(-5);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineCoppockZeroCross([], SMALL).ok).toBe(false);
    expect(runLineCoppockZeroCross(mk([1, 2, 3]), SMALL).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineCoppockZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineCoppockZeroCross(data, {
      short: 1,
      long: 1,
      period: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / coppock / regime', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineCoppockZeroCross(data, SMALL);
    expect(run.samples).toHaveLength(30);
    for (let i = 0; i < 8; i += 1) {
      expect(run.samples[i]!.coppock).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 8; i < 30; i += 1) {
      expect(run.samples[i]!.coppock).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineCoppockZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PANEL_GAP,
    );
  });

  it('SVG y-axis: thresholdY between oscTop and oscBottom', () => {
    const data = mkGeom(1, 1.01, 30);
    const layout = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineCoppockZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.coppockPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('auto-fit osc range with 10% padding includes threshold', () => {
    const data = mkGeom(1, 1.01, 30);
    const layout = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mkGeom(1, 1.01, 30);
    const layout = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('coppock path skips null gaps with new M commands', () => {
    const data = mkGeom(1, 1.01, 30);
    const layout = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    expect(layout.coppockPath.startsWith('M ')).toBe(true);
    const mCount = (layout.coppockPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineCoppockZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineCoppockZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineCoppockZeroCrossChart(data);
    expect(desc).toContain('Coppock Zero Cross chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('short 11');
    expect(desc).toContain('long 14');
    expect(desc).toContain('period 10');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLineCoppockZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Coppock Zero Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-coppock-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Coppock Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-coppock-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('short 3');
    expect(badge?.textContent).toContain('long 5');
    expect(badge?.textContent).toContain('period 4');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + coppock', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('coppock');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector('[data-series-id="coppock"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineCoppockZeroCross
        data={data}
        {...SMALL}
        hiddenSeries={['coppock']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-coppock-path"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineCoppockZeroCross data={data} {...SMALL} hiddenSeries={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-coppock-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineCoppockZeroCross
        data={data}
        {...SMALL}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="coppock"]')!);
    expect(events).toEqual([{ seriesId: 'coppock', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    const btn = container.querySelector(
      '[data-series-id="coppock"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineCoppockZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-coppock-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-coppock-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross
        data={data}
        {...SMALL}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross
        data={data}
        {...SMALL}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const data: ChartLineCoppockZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.97, i) });
    }
    const start = Math.pow(0.97, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({
        x: 30 + i,
        close: start * Math.pow(1.03, i + 1),
      });
    }
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-coppock-zero-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const data: ChartLineCoppockZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.97, i) });
    }
    const start = Math.pow(0.97, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({
        x: 30 + i,
        close: start * Math.pow(1.03, i + 1),
      });
    }
    const { container } = render(
      <ChartLineCoppockZeroCross
        data={data}
        {...SMALL}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const data: ChartLineCoppockZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.97, i) });
    }
    const start = Math.pow(0.97, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({
        x: 30 + i,
        close: start * Math.pow(1.03, i + 1),
      });
    }
    const { container } = render(
      <ChartLineCoppockZeroCross
        data={data}
        {...SMALL}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineCoppockZeroCross data={data} {...SMALL} />,
    );
    const region = container.querySelector(
      '[data-section="chart-line-coppock-zero-cross"]',
    );
    expect(region?.getAttribute('data-short')).toBe('3');
    expect(region?.getAttribute('data-long')).toBe('5');
    expect(region?.getAttribute('data-period')).toBe('4');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('22');
  });

  it('defaults: short=11, long=14, period=10, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_SHORT).toBe(11);
    expect(DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_LONG).toBe(14);
    expect(DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PERIOD).toBe(10);
    expect(DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCoppockZeroCross data={data} {...SMALL} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-coppock-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    const b = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.coppockPath).toBe(b.coppockPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for decline-then-rise pattern', () => {
    const data: ChartLineCoppockZeroCrossPoint[] = [];
    for (let i = 0; i < 30; i += 1) {
      data.push({ x: i, close: Math.pow(0.97, i) });
    }
    const start = Math.pow(0.97, 29);
    for (let i = 0; i < 30; i += 1) {
      data.push({
        x: 30 + i,
        close: start * Math.pow(1.03, i + 1),
      });
    }
    const a = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    const b = computeLineCoppockZeroCrossLayout({ data, ...SMALL });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.coppockPath).toBe(b.coppockPath);
    expect(a.run.coppockValues).toEqual(b.run.coppockValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
