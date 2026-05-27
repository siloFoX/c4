import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineRmiZeroCross,
  DEFAULT_CHART_LINE_RMI_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_RMI_ZERO_CROSS_LENGTH,
  DEFAULT_CHART_LINE_RMI_ZERO_CROSS_LOOKBACK,
  DEFAULT_CHART_LINE_RMI_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_RMI_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_RMI_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_RMI_ZERO_CROSS_WIDTH,
  applyLineRmiZeroCrossWilder,
  classifyLineRmiZeroCrossRegime,
  computeLineRmiZeroCross,
  computeLineRmiZeroCrossLayout,
  describeLineRmiZeroCrossChart,
  detectLineRmiZeroCrossCrosses,
  getLineRmiZeroCrossFinitePoints,
  normalizeLineRmiZeroCrossLength,
  normalizeLineRmiZeroCrossThreshold,
  runLineRmiZeroCross,
  type ChartLineRmiZeroCrossPoint,
} from './chart-line-rmi-zero-cross';

const mk = (closes: number[]): ChartLineRmiZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineRmiZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineRmiZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineRmiZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLineRmiZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineRmiZeroCrossFinitePoints(
        'oops' as unknown as ChartLineRmiZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineRmiZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineRmiZeroCrossLength(14, 14)).toBe(14);
    expect(normalizeLineRmiZeroCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineRmiZeroCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineRmiZeroCrossLength(0, 14)).toBe(14);
    expect(normalizeLineRmiZeroCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineRmiZeroCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineRmiZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineRmiZeroCrossThreshold(50, 50)).toBe(50);
    expect(normalizeLineRmiZeroCrossThreshold(70, 50)).toBe(70);
    expect(normalizeLineRmiZeroCrossThreshold(0, 50)).toBe(0);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineRmiZeroCrossThreshold(NaN, 50)).toBe(50);
    expect(normalizeLineRmiZeroCrossThreshold(Infinity, 50)).toBe(50);
  });
});

describe('applyLineRmiZeroCrossWilder', () => {
  it('CONST values -> Wilder stays at the SMA seed', () => {
    const out = applyLineRmiZeroCrossWilder(new Array(20).fill(5), 14, 0);
    for (let i = 0; i < 13; i += 1) {
      expect(out[i]).toBeNull();
    }
    for (let i = 13; i < 20; i += 1) {
      expect(out[i]).toBe(5);
    }
  });

  it('null seed window -> all null', () => {
    const out = applyLineRmiZeroCrossWilder(
      [null, 1, 2, 3] as Array<number | null>,
      3,
      0,
    );
    expect(out).toEqual([null, null, null, null]);
  });

  it('insufficient length -> all null', () => {
    expect(applyLineRmiZeroCrossWilder([1, 2], 14, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('seed at firstValidIdx + length - 1', () => {
    const out = applyLineRmiZeroCrossWilder(
      [null, null, 1, 1, 1, 1, 1, 1] as Array<number | null>,
      3,
      2,
    );
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(1);
    expect(out[5]).toBe(1);
  });
});

describe('computeLineRmiZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> rmi = 50 from index length+lookback-1 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { rmi } = computeLineRmiZeroCross(data, {
        length: 14,
        lookback: 5,
      });
      for (let i = 0; i < 18; i += 1) {
        expect(rmi[i]).toBeNull();
      }
      for (let i = 18; i < 40; i += 1) {
        expect(rmi[i]).toBe(50);
      }
    },
  );
});

describe('computeLineRmiZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> rmi = 100 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rmi } = computeLineRmiZeroCross(data, {
      length: 14,
      lookback: 5,
    });
    for (let i = 18; i < 40; i += 1) {
      expect(rmi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i -> rmi = 0 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { rmi } = computeLineRmiZeroCross(data, {
      length: 14,
      lookback: 5,
    });
    for (let i = 18; i < 40; i += 1) {
      expect(rmi[i]).toBe(0);
    }
  });

  it('rmi[i < length+lookback-1] is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rmi } = computeLineRmiZeroCross(data, {
      length: 14,
      lookback: 5,
    });
    for (let i = 0; i < 18; i += 1) {
      expect(rmi[i]).toBeNull();
    }
  });

  it('custom length=5, lookback=2 works', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { rmi } = computeLineRmiZeroCross(data, {
      length: 5,
      lookback: 2,
    });
    for (let i = 0; i < 6; i += 1) {
      expect(rmi[i]).toBeNull();
    }
    for (let i = 6; i < 20; i += 1) {
      expect(rmi[i]).toBe(100);
    }
  });
});

describe('classifyLineRmiZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineRmiZeroCrossRegime(null, 50)).toBe('none');
  });

  it('rmi at threshold boundary -> bullish', () => {
    expect(classifyLineRmiZeroCrossRegime(50, 50)).toBe('bullish');
    expect(classifyLineRmiZeroCrossRegime(75, 50)).toBe('bullish');
  });

  it('rmi < threshold -> bearish', () => {
    expect(classifyLineRmiZeroCrossRegime(49.99, 50)).toBe('bearish');
    expect(classifyLineRmiZeroCrossRegime(0, 50)).toBe('bearish');
  });
});

describe('detectLineRmiZeroCrossCrosses', () => {
  it('fires bullish when rmi crosses up through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const rmi = [40, 45, 49, 60, 65];
    const crosses = detectLineRmiZeroCrossCrosses(series, rmi, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when rmi crosses down through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const rmi = [60, 55, 51, 45, 40];
    const crosses = detectLineRmiZeroCrossCrosses(series, rmi, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const rmi = [40, 60, 55, 40];
    const crosses = detectLineRmiZeroCrossCrosses(series, rmi, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineRmiZeroCrossCrosses(series, [null, 40, 60], 50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineRmiZeroCrossCrosses(series, [40, null, 60], 50),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineRmiZeroCrossCrosses(series, [40, 50], 50)).toEqual([]);
  });

  it('no cross when rmi stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineRmiZeroCrossCrosses(series, [10, 20, 30, 40], 50),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineRmiZeroCrossCrosses(series, [60, 65, 75], 70),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineRmiZeroCross', () => {
  it('CONST K -> 0 crosses, all bullish at boundary after warmup', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineRmiZeroCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(18);
    expect(run.bullishCount).toBe(22);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(14);
    expect(run.lookback).toBe(5);
  });

  it('LINEAR UP -> all bullish after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineRmiZeroCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(22);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineRmiZeroCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(22);
  });

  it('decline then rise generates bullish cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const run = runLineRmiZeroCross(mk(closes));
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bullish');
  });

  it('rise then decline generates bearish cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const run = runLineRmiZeroCross(mk(closes));
    expect(run.crosses.length).toBeGreaterThan(0);
    const kinds = run.crosses.map((c) => c.kind);
    expect(kinds).toContain('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineRmiZeroCross(data, { threshold: NaN });
    expect(run.threshold).toBe(50);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(runLineRmiZeroCross(data, { threshold: 70 }).threshold).toBe(70);
    expect(runLineRmiZeroCross(data, { threshold: 30 }).threshold).toBe(30);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineRmiZeroCross([]).ok).toBe(false);
    expect(runLineRmiZeroCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineRmiZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineRmiZeroCross(data, { length: 1, lookback: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / rmi / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineRmiZeroCross(data);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 18; i += 1) {
      expect(run.samples[i]!.rmi).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 18; i < 40; i += 1) {
      expect(run.samples[i]!.rmi).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineRmiZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineRmiZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_RMI_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_RMI_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_RMI_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_RMI_ZERO_CROSS_PANEL_GAP);
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineRmiZeroCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY sits at panel midpoint when threshold=50', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineRmiZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    const expected = (layout.oscTop + layout.oscBottom) / 2;
    expect(layout.thresholdY).toBeCloseTo(expected, 5);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineRmiZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.rmiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineRmiZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('rmi path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineRmiZeroCrossLayout({ data });
    expect(layout.rmiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.rmiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineRmiZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const layout = computeLineRmiZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineRmiZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineRmiZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineRmiZeroCrossChart(data);
    expect(desc).toContain('RMI Zero Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('lookback 5');
    expect(desc).toContain('threshold 50');
  });
});

describe('ChartLineRmiZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineRmiZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('RMI Zero Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-rmi-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('RMI Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-rmi-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('lookback 5');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + rmi', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('rmi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="rmi"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineRmiZeroCross data={data} hiddenSeries={['rmi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-rmi-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineRmiZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-rmi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineRmiZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="rmi"]')!);
    expect(events).toEqual([{ seriesId: 'rmi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="rmi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineRmiZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineRmiZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-rmi-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-rmi-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineRmiZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineRmiZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(<ChartLineRmiZeroCross data={mk(closes)} />);
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-rmi-zero-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineRmiZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineRmiZeroCross data={mk(closes)} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-rmi-zero-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-lookback')).toBe('5');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('22');
  });

  it('defaults: length=14, lookback=5, threshold=50', () => {
    expect(DEFAULT_CHART_LINE_RMI_ZERO_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_RMI_ZERO_CROSS_LOOKBACK).toBe(5);
    expect(DEFAULT_CHART_LINE_RMI_ZERO_CROSS_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineRmiZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-rmi-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineRmiZeroCrossLayout({ data });
    const b = computeLineRmiZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.rmiPath).toBe(b.rmiPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const data = mk(closes);
    const a = computeLineRmiZeroCrossLayout({ data });
    const b = computeLineRmiZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.rmiPath).toBe(b.rmiPath);
    expect(a.run.rmiValues).toEqual(b.run.rmiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
