import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineRmiOversoldCross,
  DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_LENGTH,
  DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_LOOKBACK,
  DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_PADDING,
  DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_WIDTH,
  applyLineRmiOversoldCrossWilder,
  classifyLineRmiOversoldCrossRegime,
  computeLineRmiOversoldCross,
  computeLineRmiOversoldCrossLayout,
  describeLineRmiOversoldCrossChart,
  detectLineRmiOversoldCrossCrosses,
  getLineRmiOversoldCrossFinitePoints,
  normalizeLineRmiOversoldCrossLength,
  normalizeLineRmiOversoldCrossThreshold,
  runLineRmiOversoldCross,
  type ChartLineRmiOversoldCrossPoint,
} from './chart-line-rmi-oversold-cross';

const mk = (closes: number[]): ChartLineRmiOversoldCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineRmiOversoldCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineRmiOversoldCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineRmiOversoldCrossFinitePoints(null)).toEqual([]);
    expect(getLineRmiOversoldCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineRmiOversoldCrossFinitePoints(
        'oops' as unknown as ChartLineRmiOversoldCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineRmiOversoldCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineRmiOversoldCrossLength(14, 14)).toBe(14);
    expect(normalizeLineRmiOversoldCrossLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineRmiOversoldCrossLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineRmiOversoldCrossLength(0, 14)).toBe(14);
    expect(normalizeLineRmiOversoldCrossLength(-1, 14)).toBe(14);
    expect(normalizeLineRmiOversoldCrossLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineRmiOversoldCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineRmiOversoldCrossThreshold(30, 30)).toBe(30);
    expect(normalizeLineRmiOversoldCrossThreshold(20, 30)).toBe(20);
    expect(normalizeLineRmiOversoldCrossThreshold(0, 30)).toBe(0);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineRmiOversoldCrossThreshold(NaN, 30)).toBe(30);
    expect(normalizeLineRmiOversoldCrossThreshold(Infinity, 30)).toBe(30);
  });
});

describe('applyLineRmiOversoldCrossWilder', () => {
  it('CONST values -> Wilder stays at the SMA seed', () => {
    const out = applyLineRmiOversoldCrossWilder(new Array(20).fill(5), 14, 0);
    for (let i = 0; i < 13; i += 1) {
      expect(out[i]).toBeNull();
    }
    for (let i = 13; i < 20; i += 1) {
      expect(out[i]).toBe(5);
    }
  });

  it('null seed window -> all null', () => {
    const out = applyLineRmiOversoldCrossWilder(
      [null, 1, 2, 3] as Array<number | null>,
      3,
      0,
    );
    expect(out).toEqual([null, null, null, null]);
  });

  it('insufficient length -> all null', () => {
    expect(applyLineRmiOversoldCrossWilder([1, 2], 14, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('seed at firstValidIdx + length - 1', () => {
    const out = applyLineRmiOversoldCrossWilder(
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

describe('computeLineRmiOversoldCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> rmi = 50 from index length+lookback-1 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { rmi } = computeLineRmiOversoldCross(data, {
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

describe('computeLineRmiOversoldCross - LINEAR ramps', () => {
  it('LINEAR UP close=i -> rmi = 100 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rmi } = computeLineRmiOversoldCross(data, {
      length: 14,
      lookback: 5,
    });
    for (let i = 18; i < 40; i += 1) {
      expect(rmi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i -> rmi = 0 constant', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { rmi } = computeLineRmiOversoldCross(data, {
      length: 14,
      lookback: 5,
    });
    for (let i = 18; i < 40; i += 1) {
      expect(rmi[i]).toBe(0);
    }
  });

  it('rmi[i < length+lookback-1] is null', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rmi } = computeLineRmiOversoldCross(data, {
      length: 14,
      lookback: 5,
    });
    for (let i = 0; i < 18; i += 1) {
      expect(rmi[i]).toBeNull();
    }
  });

  it('custom length=5, lookback=2 works', () => {
    const data = mk(Array.from({ length: 20 }, (_, i) => i));
    const { rmi } = computeLineRmiOversoldCross(data, {
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

describe('classifyLineRmiOversoldCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineRmiOversoldCrossRegime(null, 30)).toBe('none');
  });

  it('rmi at threshold boundary -> bullish', () => {
    expect(classifyLineRmiOversoldCrossRegime(30, 30)).toBe('bullish');
    expect(classifyLineRmiOversoldCrossRegime(50, 30)).toBe('bullish');
    expect(classifyLineRmiOversoldCrossRegime(100, 30)).toBe('bullish');
  });

  it('rmi < threshold -> bearish', () => {
    expect(classifyLineRmiOversoldCrossRegime(29.99, 30)).toBe('bearish');
    expect(classifyLineRmiOversoldCrossRegime(0, 30)).toBe('bearish');
  });
});

describe('detectLineRmiOversoldCrossCrosses', () => {
  it('fires bullish when rmi crosses up through 30', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const rmi = [10, 15, 20, 40, 45];
    const crosses = detectLineRmiOversoldCrossCrosses(series, rmi, 30);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when rmi crosses down through 30', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const rmi = [50, 40, 35, 20, 15];
    const crosses = detectLineRmiOversoldCrossCrosses(series, rmi, 30);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bearish then bullish on a sweep', () => {
    const series = mk([1, 2, 3, 4]);
    const rmi = [50, 20, 25, 50];
    const crosses = detectLineRmiOversoldCrossCrosses(series, rmi, 30);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bearish');
    expect(crosses[1]!.kind).toBe('bullish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineRmiOversoldCrossCrosses(series, [null, 10, 40], 30),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineRmiOversoldCrossCrosses(series, [10, null, 40], 30),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineRmiOversoldCrossCrosses(series, [10, 30], 30)).toEqual(
      [],
    );
  });

  it('no cross when rmi stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineRmiOversoldCrossCrosses(series, [60, 70, 80, 90], 30),
    ).toEqual([]);
  });

  it('respects custom threshold', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineRmiOversoldCrossCrosses(series, [10, 15, 25], 20),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
  });
});

describe('runLineRmiOversoldCross', () => {
  it('CONST K -> 0 crosses, all bullish (rmi=50 >= 30)', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineRmiOversoldCross(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(18);
    expect(run.bullishCount).toBe(22);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(14);
    expect(run.lookback).toBe(5);
    expect(run.threshold).toBe(30);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses (rmi=100)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineRmiOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(22);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses (rmi=0 < 30)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineRmiOversoldCross(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(22);
  });

  it('rise then decline generates a bearish oversold cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const run = runLineRmiOversoldCross(mk(closes));
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineRmiOversoldCross(data, { threshold: NaN });
    expect(run.threshold).toBe(30);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(
      runLineRmiOversoldCross(data, { threshold: 20 }).threshold,
    ).toBe(20);
    expect(
      runLineRmiOversoldCross(data, { threshold: 40 }).threshold,
    ).toBe(40);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineRmiOversoldCross([]).ok).toBe(false);
    expect(runLineRmiOversoldCross(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineRmiOversoldCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineRmiOversoldCross(data, { length: 1, lookback: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / rmi / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineRmiOversoldCross(data);
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

describe('computeLineRmiOversoldCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineRmiOversoldCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_PANEL_GAP,
    );
  });

  it('fixed 0..100 oscillator range', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineRmiOversoldCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('thresholdY at 30 sits below panel midpoint (low on screen)', () => {
    const data = mk(new Array(40).fill(10));
    const layout = computeLineRmiOversoldCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
    const midpoint = (layout.oscTop + layout.oscBottom) / 2;
    // 30 < midpoint=50 in [0,100], which in SVG y means larger y value
    expect(layout.thresholdY).toBeGreaterThan(midpoint);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineRmiOversoldCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.rmiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineRmiOversoldCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('rmi path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineRmiOversoldCrossLayout({ data });
    expect(layout.rmiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.rmiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineRmiOversoldCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const layout = computeLineRmiOversoldCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineRmiOversoldCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineRmiOversoldCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters + oversold trigger events', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineRmiOversoldCrossChart(data);
    expect(desc).toContain('RMI Oversold Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('lookback 5');
    expect(desc).toContain('threshold 30');
    expect(desc).toContain('oversold trigger events');
  });
});

describe('ChartLineRmiOversoldCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineRmiOversoldCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'RMI Oversold Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-rmi-oversold-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('RMI Oversold Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOversoldCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-rmi-oversold-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('lookback 5');
    expect(badge?.textContent).toContain('threshold 30');
  });

  it('renders legend toggles for price + rmi', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOversoldCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('rmi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOversoldCross data={data} />);
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
      <ChartLineRmiOversoldCross data={data} hiddenSeries={['rmi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-rmi-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineRmiOversoldCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-rmi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineRmiOversoldCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="rmi"]')!);
    expect(events).toEqual([{ seriesId: 'rmi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOversoldCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="rmi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineRmiOversoldCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineRmiOversoldCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOversoldCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOversoldCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-rmi-oversold-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-rmi-oversold-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOversoldCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineRmiOversoldCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineRmiOversoldCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after rise then decline pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const { container } = render(
      <ChartLineRmiOversoldCross data={mk(closes)} />,
    );
    const crosses = container.querySelectorAll(
      '[data-section^="chart-line-rmi-oversold-cross-cross-"]',
    );
    expect(crosses.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const { container } = render(
      <ChartLineRmiOversoldCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const { container } = render(
      <ChartLineRmiOversoldCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-oversold-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineRmiOversoldCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-rmi-oversold-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-lookback')).toBe('5');
    expect(region?.getAttribute('data-threshold')).toBe('30');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('22');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults: length=14, lookback=5, threshold=30', () => {
    expect(DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_LOOKBACK).toBe(5);
    expect(DEFAULT_CHART_LINE_RMI_OVERSOLD_CROSS_THRESHOLD).toBe(30);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineRmiOversoldCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-rmi-oversold-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineRmiOversoldCrossLayout({ data });
    const b = computeLineRmiOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.rmiPath).toBe(b.rmiPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for rise-then-decline pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 1 + i),
      ...Array.from({ length: 30 }, (_, i) => 30 - i),
    ];
    const data = mk(closes);
    const a = computeLineRmiOversoldCrossLayout({ data });
    const b = computeLineRmiOversoldCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.rmiPath).toBe(b.rmiPath);
    expect(a.run.rmiValues).toEqual(b.run.rmiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
