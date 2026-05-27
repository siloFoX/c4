import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStochRsiMidCross,
  DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_K_SMOOTHING,
  DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PADDING,
  DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_RSI_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STOCH_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_WIDTH,
  applyLineStochRsiMidCrossSma,
  applyLineStochRsiMidCrossWilder,
  classifyLineStochRsiMidCrossRegime,
  computeLineStochRsiMidCross,
  computeLineStochRsiMidCrossLayout,
  describeLineStochRsiMidCrossChart,
  detectLineStochRsiMidCrossCrosses,
  getLineStochRsiMidCrossFinitePoints,
  normalizeLineStochRsiMidCrossLength,
  normalizeLineStochRsiMidCrossThreshold,
  runLineStochRsiMidCross,
  type ChartLineStochRsiMidCrossPoint,
} from './chart-line-stoch-rsi-mid-cross';

const mk = (closes: number[]): ChartLineStochRsiMidCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineStochRsiMidCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineStochRsiMidCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineStochRsiMidCrossFinitePoints(null)).toEqual([]);
    expect(getLineStochRsiMidCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineStochRsiMidCrossFinitePoints(
        'oops' as unknown as ChartLineStochRsiMidCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineStochRsiMidCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineStochRsiMidCrossLength(14, 10)).toBe(14);
    expect(normalizeLineStochRsiMidCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineStochRsiMidCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineStochRsiMidCrossLength(0, 10)).toBe(10);
    expect(normalizeLineStochRsiMidCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineStochRsiMidCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLineStochRsiMidCrossThreshold', () => {
  it('keeps values within [0, 100]', () => {
    expect(normalizeLineStochRsiMidCrossThreshold(50, 70)).toBe(50);
    expect(normalizeLineStochRsiMidCrossThreshold(0, 70)).toBe(0);
    expect(normalizeLineStochRsiMidCrossThreshold(100, 70)).toBe(100);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineStochRsiMidCrossThreshold(-1, 70)).toBe(70);
    expect(normalizeLineStochRsiMidCrossThreshold(101, 70)).toBe(70);
    expect(normalizeLineStochRsiMidCrossThreshold(NaN, 70)).toBe(70);
  });
});

describe('applyLineStochRsiMidCrossWilder', () => {
  it('CONST values short-circuit to exact value', () => {
    const values = new Array(20).fill(5);
    const out = applyLineStochRsiMidCrossWilder(values, 14);
    expect(out.slice(0, 13)).toEqual(new Array(13).fill(null));
    for (let i = 13; i < 20; i += 1) {
      expect(out[i]).toBe(5);
    }
  });

  it('CONST zeros stay at +0', () => {
    const out = applyLineStochRsiMidCrossWilder(new Array(20).fill(0), 14);
    expect(Object.is(out[13], 0)).toBe(true);
    expect(Object.is(out[13], -0)).toBe(false);
  });

  it('returns all null when values shorter than length', () => {
    expect(applyLineStochRsiMidCrossWilder([1, 2, 3], 5)).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe('applyLineStochRsiMidCrossSma', () => {
  it('CONST short-circuit', () => {
    const out = applyLineStochRsiMidCrossSma(new Array(8).fill(50), 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out.slice(2)).toEqual([50, 50, 50, 50, 50, 50]);
  });

  it('CONST zeros stay at +0', () => {
    const out = applyLineStochRsiMidCrossSma([0, 0, 0, 0], 3);
    expect(Object.is(out[2], 0)).toBe(true);
  });

  it('length === 1 returns values verbatim', () => {
    expect(applyLineStochRsiMidCrossSma([10, 20, 30], 1)).toEqual([
      10, 20, 30,
    ]);
  });

  it('null in window invalidates output', () => {
    const out = applyLineStochRsiMidCrossSma([1, null, 3, 4, 5], 3);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(4);
  });
});

describe('computeLineStochRsiMidCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> rsi = 50, stochRsi = 50 (zero-range fallback)',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { rsi, stochRsi } = computeLineStochRsiMidCross(data, {
        rsiLength: 14,
        stochLength: 14,
        kSmoothing: 3,
      });
      // RSI: from index 14 onward = 50
      for (let i = 14; i < 40; i += 1) {
        expect(rsi[i]).toBe(50);
      }
      // StochRSI: warmup = 14 (rsi) + 14 (stoch) + 3 (kSmoothing) - 2 = 29
      for (let i = 0; i < 29; i += 1) {
        expect(stochRsi[i]).toBeNull();
      }
      for (let i = 29; i < 40; i += 1) {
        expect(stochRsi[i]).toBe(50);
      }
    },
  );
});

describe('computeLineStochRsiMidCross - LINEAR ramps', () => {
  it('LINEAR UP -> rsi = 100 constant, stochRsi = 50 (zero-range over constant rsi)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { rsi, stochRsi } = computeLineStochRsiMidCross(data, {
      rsiLength: 14,
      stochLength: 14,
      kSmoothing: 3,
    });
    for (let i = 14; i < 40; i += 1) {
      expect(rsi[i]).toBe(100);
    }
    for (let i = 29; i < 40; i += 1) {
      expect(stochRsi[i]).toBe(50);
    }
  });

  it('LINEAR DOWN -> rsi = 0 constant, stochRsi = 50 (zero-range)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { rsi, stochRsi } = computeLineStochRsiMidCross(data, {
      rsiLength: 14,
      stochLength: 14,
      kSmoothing: 3,
    });
    for (let i = 14; i < 40; i += 1) {
      expect(rsi[i]).toBe(0);
    }
    for (let i = 29; i < 40; i += 1) {
      expect(stochRsi[i]).toBe(50);
    }
  });
});

describe('classifyLineStochRsiMidCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStochRsiMidCrossRegime(null, 50)).toBe('none');
  });

  it('stochRsi at threshold boundary -> bullish', () => {
    expect(classifyLineStochRsiMidCrossRegime(50, 50)).toBe('bullish');
    expect(classifyLineStochRsiMidCrossRegime(80, 50)).toBe('bullish');
    expect(classifyLineStochRsiMidCrossRegime(100, 50)).toBe('bullish');
  });

  it('stochRsi < threshold -> bearish', () => {
    expect(classifyLineStochRsiMidCrossRegime(49.99, 50)).toBe('bearish');
    expect(classifyLineStochRsiMidCrossRegime(20, 50)).toBe('bearish');
    expect(classifyLineStochRsiMidCrossRegime(0, 50)).toBe('bearish');
  });
});

describe('detectLineStochRsiMidCrossCrosses', () => {
  it('fires bullish when stochRsi crosses up through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [40, 45, 49, 55, 60];
    const crosses = detectLineStochRsiMidCrossCrosses(series, v, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when stochRsi crosses down through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const v = [60, 60, 55, 45, 40];
    const crosses = detectLineStochRsiMidCrossCrosses(series, v, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when stochRsi sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const v = [40, 60, 55, 40];
    const crosses = detectLineStochRsiMidCrossCrosses(series, v, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineStochRsiMidCrossCrosses(series, [null, 40, 60], 50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineStochRsiMidCrossCrosses(series, [40, null, 60], 50),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineStochRsiMidCrossCrosses(series, [40, 50], 50)).toEqual(
      [],
    );
  });

  it('no cross when stochRsi stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineStochRsiMidCrossCrosses(series, [40, 42, 45, 48], 50),
    ).toEqual([]);
  });
});

describe('runLineStochRsiMidCross', () => {
  it('CONST K -> 0 crosses, bullish at boundary after warmup', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineStochRsiMidCross(data, {
      rsiLength: 14,
      stochLength: 14,
      kSmoothing: 3,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(29);
    expect(run.bullishCount).toBe(11);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> 0 crosses, bullish at boundary (stochRsi = 50 due to constant rsi)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineStochRsiMidCross(data, {
      rsiLength: 14,
      stochLength: 14,
      kSmoothing: 3,
    });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(11);
  });

  it('LINEAR DOWN -> 0 crosses, bullish at boundary (same quirk)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineStochRsiMidCross(data, {
      rsiLength: 14,
      stochLength: 14,
      kSmoothing: 3,
    });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(11);
  });

  it('decline then sharp rise generates a bullish cross via varying RSI', () => {
    // Initial decline so RSI is low, then a rise to push StochRSI through 50
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 5),
    ];
    const run = runLineStochRsiMidCross(mk(closes), {
      rsiLength: 14,
      stochLength: 14,
      kSmoothing: 3,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise then sharp decline generates a bearish cross', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 10 + i),
      ...Array.from({ length: 30 }, (_, i) => 39 - i * 5),
    ];
    const run = runLineStochRsiMidCross(mk(closes), {
      rsiLength: 14,
      stochLength: 14,
      kSmoothing: 3,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps out-of-range', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineStochRsiMidCross(data, {
      rsiLength: 14,
      threshold: 200,
    });
    expect(run.threshold).toBe(50);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineStochRsiMidCross(data, {
      rsiLength: 14,
      threshold: 70,
    });
    expect(run.threshold).toBe(70);
  });

  it('empty data -> ok=false', () => {
    const run = runLineStochRsiMidCross([], { rsiLength: 14 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineStochRsiMidCross(mk([1, 2, 3]), { rsiLength: 14 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStochRsiMidCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStochRsiMidCross(data, { rsiLength: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / stochRsi / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineStochRsiMidCross(data, {
      rsiLength: 14,
      stochLength: 14,
      kSmoothing: 3,
    });
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 29; i += 1) {
      expect(run.samples[i]!.stochRsi).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 29; i < 40; i += 1) {
      expect(run.samples[i]!.stochRsi).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineStochRsiMidCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineStochRsiMidCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PANEL_GAP,
    );
  });

  it('SVG y-axis: thresholdY at 50 sits between oscTop and oscBottom', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineStochRsiMidCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineStochRsiMidCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.stochRsiPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range fixed at 0..100', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineStochRsiMidCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineStochRsiMidCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('stochRsi path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineStochRsiMidCrossLayout({ data });
    expect(layout.stochRsiPath.startsWith('M ')).toBe(true);
    const mCount = (layout.stochRsiPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineStochRsiMidCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 5),
    ];
    const layout = computeLineStochRsiMidCrossLayout({
      data: mk(closes),
      rsiLength: 14,
      stochLength: 14,
      kSmoothing: 3,
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLineStochRsiMidCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStochRsiMidCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineStochRsiMidCrossChart(data);
    expect(desc).toContain('Stochastic RSI Midline Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('rsiLength 14');
    expect(desc).toContain('stochLength 14');
    expect(desc).toContain('kSmoothing 3');
    expect(desc).toContain('threshold 50');
  });
});

describe('ChartLineStochRsiMidCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineStochRsiMidCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Stochastic RSI Midline Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-rsi-mid-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Stochastic RSI Midline Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineStochRsiMidCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-rsi-mid-cross-badge"]',
    );
    expect(badge?.textContent).toContain('rsi 14');
    expect(badge?.textContent).toContain('stoch 14');
    expect(badge?.textContent).toContain('k 3');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + stochRsi', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineStochRsiMidCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('stochRsi');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineStochRsiMidCross data={data} />);
    const button = container.querySelector('[data-series-id="stochRsi"]');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button!);
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button!);
    expect(button?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineStochRsiMidCross data={data} hiddenSeries={['stochRsi']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-stoch-rsi-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineStochRsiMidCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-stoch-rsi-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStochRsiMidCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="stochRsi"]')!);
    expect(events).toEqual([{ seriesId: 'stochRsi', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineStochRsiMidCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="stochRsi"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineStochRsiMidCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiMidCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineStochRsiMidCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineStochRsiMidCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stoch-rsi-mid-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-stoch-rsi-mid-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineStochRsiMidCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiMidCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineStochRsiMidCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 5),
    ];
    const { container } = render(
      <ChartLineStochRsiMidCross data={mk(closes)} />,
    );
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-stoch-rsi-mid-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 5),
    ];
    const { container } = render(
      <ChartLineStochRsiMidCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 5),
    ];
    const { container } = render(
      <ChartLineStochRsiMidCross
        data={mk(closes)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-mid-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineStochRsiMidCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-stoch-rsi-mid-cross"]',
    );
    expect(region?.getAttribute('data-rsi-length')).toBe('14');
    expect(region?.getAttribute('data-stoch-length')).toBe('14');
    expect(region?.getAttribute('data-k-smoothing')).toBe('3');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('11');
  });

  it('defaults: rsiLength=14, stochLength=14, kSmoothing=3, threshold=50', () => {
    expect(DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_RSI_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STOCH_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_K_SMOOTHING).toBe(3);
    expect(DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineStochRsiMidCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stoch-rsi-mid-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineStochRsiMidCrossLayout({ data });
    const b = computeLineStochRsiMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stochRsiPath).toBe(b.stochRsiPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + i * 5),
    ];
    const data = mk(closes);
    const a = computeLineStochRsiMidCrossLayout({ data });
    const b = computeLineStochRsiMidCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.stochRsiPath).toBe(b.stochRsiPath);
    expect(a.run.stochRsiValues).toEqual(b.run.stochRsiValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
