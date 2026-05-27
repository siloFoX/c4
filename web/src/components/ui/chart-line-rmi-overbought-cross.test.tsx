import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineRmiOverboughtCross,
  DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_LENGTH,
  DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_LOOKBACK,
  DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_PADDING,
  DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_WIDTH,
  applyLineRmiOverboughtCrossWilder,
  classifyLineRmiOverboughtCrossRegime,
  computeLineRmiOverboughtCross,
  computeLineRmiOverboughtCrossLayout,
  describeLineRmiOverboughtCrossChart,
  detectLineRmiOverboughtCrossCrosses,
  getLineRmiOverboughtCrossFinitePoints,
  normalizeLineRmiOverboughtCrossLength,
  normalizeLineRmiOverboughtCrossThreshold,
  runLineRmiOverboughtCross,
  type ChartLineRmiOverboughtCrossPoint,
} from './chart-line-rmi-overbought-cross';

const mk = (closes: number[]): ChartLineRmiOverboughtCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineRmiOverboughtCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineRmiOverboughtCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineRmiOverboughtCrossFinitePoints(null)).toEqual([]);
    expect(getLineRmiOverboughtCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineRmiOverboughtCrossFinitePoints(
        'oops' as unknown as ChartLineRmiOverboughtCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineRmiOverboughtCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineRmiOverboughtCrossLength(14, 14)).toBe(14);
    expect(normalizeLineRmiOverboughtCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineRmiOverboughtCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineRmiOverboughtCrossLength(0, 14)).toBe(14);
    expect(normalizeLineRmiOverboughtCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineRmiOverboughtCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineRmiOverboughtCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineRmiOverboughtCrossThreshold(70, 70)).toBe(70);
    expect(normalizeLineRmiOverboughtCrossThreshold(80, 70)).toBe(80);
    expect(normalizeLineRmiOverboughtCrossThreshold(0, 70)).toBe(0);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineRmiOverboughtCrossThreshold(NaN, 70)).toBe(70);
    expect(normalizeLineRmiOverboughtCrossThreshold(Infinity, 70)).toBe(70);
  });
});

describe('applyLineRmiOverboughtCrossWilder', () => {
  it('CONST values -> Wilder stays at the SMA seed', () => {
    const out = applyLineRmiOverboughtCrossWilder(
      new Array(20).fill(5),
      14,
      0,
    );
    for (let i = 0; i < 13; i += 1) {
      expect(out[i]).toBeNull();
    }
    for (let i = 13; i < 20; i += 1) {
      expect(out[i]).toBe(5);
    }
  });

  it('null seed window -> all null', () => {
    const out = applyLineRmiOverboughtCrossWilder(
      [null, 1, 2, 3] as Array<number | null>,
      3,
      0,
    );
    expect(out).toEqual([null, null, null, null]);
  });

  it('insufficient length -> all null', () => {
    expect(applyLineRmiOverboughtCrossWilder([1, 2], 14, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('seed at firstValidIdx + length - 1', () => {
    const out = applyLineRmiOverboughtCrossWilder(
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

describe('computeLineRmiOverboughtCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> rmi = 50 from index length+lookback-1 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { rmi } = computeLineRmiOverboughtCross(data, {
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

describe('computeLineRmiOverboughtCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> rmi = 100 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rmi } = computeLineRmiOverboughtCross(data, {
      length: 14,
      lookback: 5,
    });
    for (let i = 18; i < 40; i += 1) {
      expect(rmi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i -> rmi = 0 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { rmi } = computeLineRmiOverboughtCross(data, {
      length: 14,
      lookback: 5,
    });
    for (let i = 18; i < 40; i += 1) {
      expect(rmi[i]).toBe(0);
    }
  });

  it('rmi[i < length+lookback-1] is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rmi } = computeLineRmiOverboughtCross(data, {
      length: 14,
      lookback: 5,
    });
    for (let i = 0; i < 18; i += 1) {
      expect(rmi[i]).toBeNull();
    }
  });

  it('custom length=5, lookback=2 works', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { rmi } = computeLineRmiOverboughtCross(data, {
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

describe('classifyLineRmiOverboughtCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineRmiOverboughtCrossRegime(null, 70)).toBe('none');
  });

  it('rmi at threshold boundary -> bullish', () => {
    expect(classifyLineRmiOverboughtCrossRegime(70, 70)).toBe('bullish');
    expect(classifyLineRmiOverboughtCrossRegime(100, 70)).toBe('bullish');
  });

  it('rmi < threshold -> bearish (includes 50 neutral)', () => {
    expect(classifyLineRmiOverboughtCrossRegime(69.99, 70)).toBe('bearish');
    expect(classifyLineRmiOverboughtCrossRegime(50, 70)).toBe('bearish');
    expect(classifyLineRmiOverboughtCrossRegime(0, 70)).toBe('bearish');
  });
});

describe('detectLineRmiOverboughtCrossCrosses', () => {
  it('fires bullish when rmi crosses up through 70', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const rmi = [40, 50, 60, 80, 85];
    const crosses = detectLineRmiOverboughtCrossCrosses(series, rmi, 70);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when rmi crosses down through 70', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const rmi = [85, 80, 75, 60, 50];
    const crosses = detectLineRmiOverboughtCrossCrosses(series, rmi, 70);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const rmi = [40, 85, 80, 50];
    const crosses = detectLineRmiOverboughtCrossCrosses(series, rmi, 70);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineRmiOverboughtCrossCrosses(series, [null, 60, 80], 70),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineRmiOverboughtCrossCrosses(series, [60, null, 80], 70),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineRmiOverboughtCrossCrosses(series, [60, 70], 70)).toEqual(
      [],
    );
  });

  it('no cross when rmi stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineRmiOverboughtCrossCrosses(series, [10, 20, 30, 40], 70),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineRmiOverboughtCrossCrosses(series, [80, 85, 95], 90),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineRmiOverboughtCross', () => {
  it('CONST K -> 0 crosses, all bearish (rmi=50 < 70)', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineRmiOverboughtCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(18);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(22);
    expect(run.length).toBe(14);
    expect(run.lookback).toBe(5);
    expect(run.threshold).toBe(70);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses (rmi jumps from null to 100)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineRmiOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(22);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup (rmi = 0 < 70)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineRmiOverboughtCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(22);
  });

  it('decline then rise generates a bullish overbought cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const run = runLineRmiOverboughtCross(mk(closes));
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineRmiOverboughtCross(data, { threshold: NaN });
    expect(run.threshold).toBe(70);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(
      runLineRmiOverboughtCross(data, { threshold: 80 }).threshold,
    ).toBe(80);
    expect(
      runLineRmiOverboughtCross(data, { threshold: 60 }).threshold,
    ).toBe(60);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineRmiOverboughtCross([]).ok).toBe(false);
    expect(runLineRmiOverboughtCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineRmiOverboughtCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineRmiOverboughtCross(data, { length: 1, lookback: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / rmi / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineRmiOverboughtCross(data);
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 18; i += 1) {
      expect(run.samples[i]!.rmi).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 18; i < 40; i += 1) {
      expect(run.samples[i]!.rmi).toBe(50);
      expect(run.samples[i]!.regime).toBe('bearish');
    }
  });
});

describe('computeLineRmiOverboughtCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineRmiOverboughtCrossLayout({ data });
    expect(layout.width).toBe(
      DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_WIDTH,
    );
    expect(layout.height).toBe(
      DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_HEIGHT,
    );
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_PANEL_GAP,
    );
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineRmiOverboughtCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY at 70 sits above panel midpoint (high on screen)', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineRmiOverboughtCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    const midpoint = (layout.oscTop + layout.oscBottom) / 2;
    // 70 is above midpoint=50 in [0,100], which in SVG y means smaller y value
    expect(layout.thresholdY).toBeLessThan(midpoint);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineRmiOverboughtCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.rmiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineRmiOverboughtCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('rmi path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineRmiOverboughtCrossLayout({ data });
    expect(layout.rmiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.rmiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineRmiOverboughtCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const layout = computeLineRmiOverboughtCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineRmiOverboughtCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineRmiOverboughtCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + overbought trigger events', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineRmiOverboughtCrossChart(data);
    expect(desc).toContain('RMI Overbought Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('lookback 5');
    expect(desc).toContain('threshold 70');
    expect(desc).toContain('overbought trigger events');
  });
});

describe('ChartLineRmiOverboughtCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineRmiOverboughtCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'RMI Overbought Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-rmi-overbought-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('RMI Overbought Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOverboughtCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-rmi-overbought-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('lookback 5');
    expect(badge?.textContent).toContain('threshold 70');
  });

  it('renders legend toggles for price + rmi', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOverboughtCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('rmi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOverboughtCross data={data} />);
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
      <ChartLineRmiOverboughtCross data={data} hiddenSeries={['rmi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-rmi-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineRmiOverboughtCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-rmi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineRmiOverboughtCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="rmi"]')!);
    expect(events).toEqual([{ seriesId: 'rmi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOverboughtCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="rmi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineRmiOverboughtCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineRmiOverboughtCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOverboughtCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOverboughtCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-rmi-overbought-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-rmi-overbought-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOverboughtCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineRmiOverboughtCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineRmiOverboughtCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline then rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineRmiOverboughtCross data={mk(closes)} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-rmi-overbought-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineRmiOverboughtCross
        data={mk(closes)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
    ];
    const { container } = render(
      <ChartLineRmiOverboughtCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOverboughtCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-rmi-overbought-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-lookback')).toBe('5');
    expect(region?.getAttribute('data-threshold')).toBe('70');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bearish-count')).toBe('22');
    expect(region?.getAttribute('data-bullish-count')).toBe('0');
  });

  it('defaults: length=14, lookback=5, threshold=70', () => {
    expect(DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_LOOKBACK).toBe(5);
    expect(DEFAULT_CHART_LINE_RMI_OVERBOUGHT_CROSS_THRESHOLD).toBe(70);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineRmiOverboughtCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-rmi-overbought-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineRmiOverboughtCrossLayout({ data });
    const b = computeLineRmiOverboughtCrossLayout({ data });
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
    const a = computeLineRmiOverboughtCrossLayout({ data });
    const b = computeLineRmiOverboughtCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.rmiPath).toBe(b.rmiPath);
    expect(a.run.rmiValues).toEqual(b.run.rmiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
