import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineWilliamsRCrossSig,
  DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_LENGTH,
  DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERBOUGHT_THRESHOLD,
  DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERSOLD_THRESHOLD,
  DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_SIGNAL_LENGTH,
  DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_WIDTH,
  applyLineWilliamsRCrossSigSma,
  classifyLineWilliamsRCrossSigRegime,
  computeLineWilliamsRCrossSig,
  computeLineWilliamsRCrossSigLayout,
  describeLineWilliamsRCrossSigChart,
  detectLineWilliamsRCrossSigCrosses,
  getLineWilliamsRCrossSigFinitePoints,
  normalizeLineWilliamsRCrossSigLength,
  normalizeLineWilliamsRCrossSigThreshold,
  runLineWilliamsRCrossSig,
  type ChartLineWilliamsRCrossSigPoint,
} from './chart-line-williams-r-cross-sig';

const mk = (closes: number[]): ChartLineWilliamsRCrossSigPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineWilliamsRCrossSigFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineWilliamsRCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineWilliamsRCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineWilliamsRCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineWilliamsRCrossSigFinitePoints(
        'oops' as unknown as ChartLineWilliamsRCrossSigPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineWilliamsRCrossSigPoint[];
    expect(getLineWilliamsRCrossSigFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineWilliamsRCrossSigLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineWilliamsRCrossSigLength(14, 10)).toBe(14);
    expect(normalizeLineWilliamsRCrossSigLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineWilliamsRCrossSigLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineWilliamsRCrossSigLength(0, 10)).toBe(10);
    expect(normalizeLineWilliamsRCrossSigLength(-1, 10)).toBe(10);
    expect(normalizeLineWilliamsRCrossSigLength(NaN, 10)).toBe(10);
    expect(normalizeLineWilliamsRCrossSigLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineWilliamsRCrossSigThreshold', () => {
  it('keeps values within [-100, 0]', () => {
    expect(normalizeLineWilliamsRCrossSigThreshold(-20, -30)).toBe(-20);
    expect(normalizeLineWilliamsRCrossSigThreshold(-100, -30)).toBe(-100);
    expect(normalizeLineWilliamsRCrossSigThreshold(0, -30)).toBe(0);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineWilliamsRCrossSigThreshold(1, -30)).toBe(-30);
    expect(normalizeLineWilliamsRCrossSigThreshold(-101, -30)).toBe(-30);
    expect(normalizeLineWilliamsRCrossSigThreshold(NaN, -30)).toBe(-30);
  });
});

describe('applyLineWilliamsRCrossSigSma', () => {
  it('CONST values short-circuit to exact value', () => {
    const values = new Array(10).fill(-50);
    const out = applyLineWilliamsRCrossSigSma(values, 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out.slice(2)).toEqual([-50, -50, -50, -50, -50, -50, -50, -50]);
  });

  it('CONST zeros stay at +0 not -0', () => {
    const out = applyLineWilliamsRCrossSigSma([0, 0, 0, 0, 0], 3);
    expect(Object.is(out[2], 0)).toBe(true);
    expect(Object.is(out[2], -0)).toBe(false);
  });

  it('length === 1 returns values verbatim', () => {
    expect(applyLineWilliamsRCrossSigSma([-30, -40, -50], 1)).toEqual([
      -30, -40, -50,
    ]);
  });

  it('null in window invalidates output', () => {
    const out = applyLineWilliamsRCrossSigSma([-10, null, -30, -40, -50], 3);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(-40);
  });

  it('empty input', () => {
    expect(applyLineWilliamsRCrossSigSma([], 3)).toEqual([]);
  });
});

describe('computeLineWilliamsRCrossSig - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> wr = -50 from index length-1 onward',
    (K) => {
      const data = mk(new Array(30).fill(K));
      const { wr, signal } = computeLineWilliamsRCrossSig(data, {
        length: 14,
        signalLength: 3,
      });
      for (let i = 0; i < 13; i += 1) {
        expect(wr[i]).toBeNull();
      }
      for (let i = 13; i < 30; i += 1) {
        expect(wr[i]).toBe(-50);
      }
      for (let i = 0; i < 15; i += 1) {
        expect(signal[i]).toBeNull();
      }
      for (let i = 15; i < 30; i += 1) {
        expect(signal[i]).toBe(-50);
      }
    },
  );
});

describe('computeLineWilliamsRCrossSig - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> wr = 0 constant (close at high)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const { wr, signal } = computeLineWilliamsRCrossSig(data, {
      length: 14,
      signalLength: 3,
    });
    for (let i = 13; i < 30; i += 1) {
      expect(wr[i]).toBe(0);
      expect(Object.is(wr[i], -0)).toBe(false);
    }
    for (let i = 15; i < 30; i += 1) {
      expect(signal[i]).toBe(0);
    }
  });

  it('LINEAR DOWN close=-i (length=14) -> wr = -100 constant (close at low)', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const { wr, signal } = computeLineWilliamsRCrossSig(data, {
      length: 14,
      signalLength: 3,
    });
    for (let i = 13; i < 30; i += 1) {
      expect(wr[i]).toBe(-100);
    }
    for (let i = 15; i < 30; i += 1) {
      expect(signal[i]).toBe(-100);
    }
  });
});

describe('classifyLineWilliamsRCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineWilliamsRCrossSigRegime(null, -20, -80)).toBe('none');
  });

  it('wr >= overbought -> overbought', () => {
    expect(classifyLineWilliamsRCrossSigRegime(-20, -20, -80)).toBe(
      'overbought',
    );
    expect(classifyLineWilliamsRCrossSigRegime(-10, -20, -80)).toBe(
      'overbought',
    );
    expect(classifyLineWilliamsRCrossSigRegime(0, -20, -80)).toBe('overbought');
  });

  it('wr <= oversold -> oversold', () => {
    expect(classifyLineWilliamsRCrossSigRegime(-80, -20, -80)).toBe('oversold');
    expect(classifyLineWilliamsRCrossSigRegime(-90, -20, -80)).toBe('oversold');
    expect(classifyLineWilliamsRCrossSigRegime(-100, -20, -80)).toBe(
      'oversold',
    );
  });

  it('-80 < wr < -20 -> neutral', () => {
    expect(classifyLineWilliamsRCrossSigRegime(-50, -20, -80)).toBe('neutral');
    expect(classifyLineWilliamsRCrossSigRegime(-21, -20, -80)).toBe('neutral');
    expect(classifyLineWilliamsRCrossSigRegime(-79, -20, -80)).toBe('neutral');
  });
});

describe('detectLineWilliamsRCrossSigCrosses', () => {
  it('fires bullish when wr crosses up through signal', () => {
    const series = mk([1, 2, 3]);
    const wr = [-50, -50, -30];
    const signal = [-40, -40, -40];
    const crosses = detectLineWilliamsRCrossSigCrosses(
      series,
      wr,
      signal,
      -20,
      -80,
    );
    expect(crosses).toEqual([
      { index: 2, x: 2, kind: 'bullish', zone: 'neutral' },
    ]);
  });

  it('fires bearish when wr crosses down through signal', () => {
    const series = mk([1, 2, 3]);
    const wr = [-30, -30, -60];
    const signal = [-40, -40, -40];
    const crosses = detectLineWilliamsRCrossSigCrosses(
      series,
      wr,
      signal,
      -20,
      -80,
    );
    expect(crosses).toEqual([
      { index: 2, x: 2, kind: 'bearish', zone: 'neutral' },
    ]);
  });

  it('zone=oversold when cross occurs at wr <= -80', () => {
    const series = mk([1, 2, 3]);
    const wr = [-95, -95, -85];
    const signal = [-90, -90, -90];
    const crosses = detectLineWilliamsRCrossSigCrosses(
      series,
      wr,
      signal,
      -20,
      -80,
    );
    expect(crosses).toEqual([
      { index: 2, x: 2, kind: 'bullish', zone: 'oversold' },
    ]);
  });

  it('zone=overbought when cross occurs at wr >= -20', () => {
    const series = mk([1, 2, 3]);
    const wr = [-5, -5, -15];
    const signal = [-10, -10, -10];
    const crosses = detectLineWilliamsRCrossSigCrosses(
      series,
      wr,
      signal,
      -20,
      -80,
    );
    expect(crosses).toEqual([
      { index: 2, x: 2, kind: 'bearish', zone: 'overbought' },
    ]);
  });

  it('skips when any of prev/cur wr or signal is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineWilliamsRCrossSigCrosses(
        series,
        [null, -50, -30],
        [-40, -40, -40],
        -20,
        -80,
      ),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish', zone: 'neutral' }]);
    expect(
      detectLineWilliamsRCrossSigCrosses(
        series,
        [-50, null, -30],
        [-40, -40, -40],
        -20,
        -80,
      ),
    ).toEqual([]);
    expect(
      detectLineWilliamsRCrossSigCrosses(
        series,
        [-50, -50, -30],
        [null, -40, -40],
        -20,
        -80,
      ),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish', zone: 'neutral' }]);
    expect(
      detectLineWilliamsRCrossSigCrosses(
        series,
        [-50, -50, -30],
        [-40, null, -40],
        -20,
        -80,
      ),
    ).toEqual([]);
  });

  it('no cross when wr and signal stay on same side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineWilliamsRCrossSigCrosses(
        series,
        [-30, -32, -28, -30],
        [-40, -40, -40, -40],
        -20,
        -80,
      ),
    ).toEqual([]);
  });

  it('multiple alternating crosses', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const wr = [-50, -30, -50, -30, -50];
    const signal = [-40, -40, -40, -40, -40];
    const crosses = detectLineWilliamsRCrossSigCrosses(
      series,
      wr,
      signal,
      -20,
      -80,
    );
    expect(crosses.map((c) => c.kind)).toEqual([
      'bullish',
      'bearish',
      'bullish',
      'bearish',
    ]);
  });
});

describe('runLineWilliamsRCrossSig', () => {
  it('CONST K -> 0 crosses, all neutral (after warmup) + initial nones', () => {
    const data = mk(new Array(30).fill(50));
    const run = runLineWilliamsRCrossSig(data, {
      length: 14,
      signalLength: 3,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(13);
    expect(run.neutralCount).toBe(17);
    expect(run.overboughtCount).toBe(0);
    expect(run.oversoldCount).toBe(0);
  });

  it('LINEAR UP -> all overbought after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const run = runLineWilliamsRCrossSig(data, {
      length: 14,
      signalLength: 3,
    });
    expect(run.crosses).toHaveLength(0);
    expect(run.overboughtCount).toBe(17);
    expect(run.noneCount).toBe(13);
  });

  it('LINEAR DOWN -> all oversold after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => -i));
    const run = runLineWilliamsRCrossSig(data, {
      length: 14,
      signalLength: 3,
    });
    expect(run.crosses).toHaveLength(0);
    expect(run.oversoldCount).toBe(17);
  });

  it('threshold normalization clamps out-of-range', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineWilliamsRCrossSig(data, {
      length: 14,
      overboughtThreshold: 100,
      oversoldThreshold: -200,
    });
    expect(run.overboughtThreshold).toBe(-20);
    expect(run.oversoldThreshold).toBe(-80);
  });

  it('respects custom thresholds within [-100, 0]', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineWilliamsRCrossSig(data, {
      length: 14,
      overboughtThreshold: -10,
      oversoldThreshold: -90,
    });
    expect(run.overboughtThreshold).toBe(-10);
    expect(run.oversoldThreshold).toBe(-90);
  });

  it('empty data -> ok=false', () => {
    const run = runLineWilliamsRCrossSig([], { length: 14 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineWilliamsRCrossSig(mk([1, 2, 3]), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineWilliamsRCrossSigPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineWilliamsRCrossSig(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / wr / signal / regime', () => {
    const data = mk(new Array(30).fill(10));
    const run = runLineWilliamsRCrossSig(data, {
      length: 14,
      signalLength: 3,
    });
    expect(run.samples).toHaveLength(30);
    expect(run.samples[14]!.wr).toBe(-50);
    expect(run.samples[14]!.signal).toBeNull();
    expect(run.samples[14]!.regime).toBe('neutral');
    expect(run.samples[15]!.signal).toBe(-50);
  });

  it('hybrid pattern (oversold spike up) produces a bullish oversold cross', () => {
    // 14 bars at -10, then a small rebound to set wr in oversold zone
    // and force a wr-over-signal cross
    const closes = [
      // length=14 window: high stays at 100, close drops to make wr deeply oversold
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      // continue plunging so wr stays oversold for a few bars
      30,
      25,
      20,
      // sharp recovery: wr suddenly rises (closer to high of window)
      80,
      85,
      90,
    ];
    const run = runLineWilliamsRCrossSig(mk(closes), {
      length: 14,
      signalLength: 3,
    });
    expect(run.ok).toBe(true);
    // At least one cross should happen during the recovery
    expect(run.crosses.length).toBeGreaterThan(0);
  });
});

describe('computeLineWilliamsRCrossSigLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineWilliamsRCrossSigLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PANEL_GAP,
    );
    expect(layout.innerLeft).toBe(layout.padding);
    expect(layout.innerRight).toBe(layout.width - layout.padding);
  });

  it('SVG y-axis: overboughtY < midY < oversoldY (less negative -> smaller y)', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineWilliamsRCrossSigLayout({ data });
    // overbought = -20 is at the TOP of the -100..0 range (larger value -> smaller y)
    expect(layout.overboughtY).toBeLessThan(layout.midY);
    expect(layout.midY).toBeLessThan(layout.oversoldY);
  });

  it('empty data -> ok=false but bands populated', () => {
    const layout = computeLineWilliamsRCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.wrPath).toBe('');
    expect(layout.signalPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range fixed at -100 .. 0', () => {
    const data = mk(new Array(30).fill(50));
    const layout = computeLineWilliamsRCrossSigLayout({ data });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(0);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 30 }, (_, i) => i));
    const layout = computeLineWilliamsRCrossSigLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('handles single-point price (priceMin === priceMax) by inflating range', () => {
    const data = mk(new Array(30).fill(7));
    const layout = computeLineWilliamsRCrossSigLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind + zone', () => {
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      30,
      25,
      20,
      80,
      85,
      90,
    ];
    const layout = computeLineWilliamsRCrossSigLayout({
      data: mk(closes),
      length: 14,
      signalLength: 3,
    });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
      expect(['overbought', 'neutral', 'oversold']).toContain(m.zone);
    }
  });
});

describe('describeLineWilliamsRCrossSigChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineWilliamsRCrossSigChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(30).fill(50));
    const desc = describeLineWilliamsRCrossSigChart(data);
    expect(desc).toContain('Williams %R Cross Signal chart');
    expect(desc).toContain('30 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('signalLength 3');
    expect(desc).toContain('overbought -20');
    expect(desc).toContain('oversold -80');
  });
});

describe('ChartLineWilliamsRCrossSig rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(30).fill(10));
    const { container, getByRole } = render(
      <ChartLineWilliamsRCrossSig data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Williams %R Cross Signal chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-williams-r-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Williams %R Cross Signal chart');
  });

  it('renders config badge with thresholds', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-williams-r-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('signal 3');
    expect(badge?.textContent).toContain('OB -20');
    expect(badge?.textContent).toContain('OS -80');
  });

  it('renders legend toggles for price + wr + signal', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRCrossSig data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('wr');
    expect(buttons[2].getAttribute('data-series-id')).toBe('signal');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRCrossSig data={data} />);
    const wrButton = container.querySelector('[data-series-id="wr"]');
    expect(wrButton?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(wrButton!);
    expect(wrButton?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(wrButton!);
    expect(wrButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries for signal', () => {
    const data = mk(new Array(30).fill(10));
    const { container, rerender } = render(
      <ChartLineWilliamsRCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-signal-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineWilliamsRCrossSig data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(30).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineWilliamsRCrossSig
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="wr"]')!);
    expect(events).toEqual([{ seriesId: 'wr', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRCrossSig data={data} />);
    const sigButton = container.querySelector(
      '[data-series-id="signal"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(sigButton, { key: 'Enter' });
    expect(sigButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(sigButton, { key: ' ' });
    expect(sigButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineWilliamsRCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineWilliamsRCrossSig data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRCrossSig data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRCrossSig data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-williams-r-cross-sig-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-williams-r-cross-sig-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders 3 reference bands by default (overbought, mid, oversold)', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-band-overbought"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-band-mid"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-band-oversold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides bands group', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineWilliamsRCrossSig data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(
      <ChartLineWilliamsRCrossSig
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers with data-zone attr', () => {
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      30,
      25,
      20,
      80,
      85,
      90,
    ];
    const { container } = render(
      <ChartLineWilliamsRCrossSig
        data={mk(closes)}
        length={14}
        signalLength={3}
      />,
    );
    const crossMarkers = container.querySelectorAll(
      '[data-section^="chart-line-williams-r-cross-sig-cross-"]',
    );
    expect(crossMarkers.length).toBeGreaterThan(0);
    for (const m of crossMarkers) {
      const zone = m.getAttribute('data-zone');
      expect(['overbought', 'neutral', 'oversold']).toContain(zone);
    }
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(30).fill(10));
    const { container } = render(<ChartLineWilliamsRCrossSig data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-williams-r-cross-sig"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-signal-length')).toBe('3');
    expect(region?.getAttribute('data-overbought-threshold')).toBe('-20');
    expect(region?.getAttribute('data-oversold-threshold')).toBe('-80');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-neutral-count')).toBe('17');
  });

  it('defaults: length=14, signalLength=3, OB=-20, OS=-80', () => {
    expect(DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_SIGNAL_LENGTH).toBe(3);
    expect(DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERBOUGHT_THRESHOLD).toBe(
      -20,
    );
    expect(DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERSOLD_THRESHOLD).toBe(
      -80,
    );
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(30).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineWilliamsRCrossSig data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-williams-r-cross-sig',
    );
  });

  it('layout is deterministic across calls for CONST 30 bars', () => {
    const data = mk(new Array(30).fill(10));
    const a = computeLineWilliamsRCrossSigLayout({ data });
    const b = computeLineWilliamsRCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.wrPath).toBe(b.wrPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for hybrid bullish-oversold pattern', () => {
    const closes = [
      ...Array.from({ length: 14 }, (_, i) => 100 - i * 5),
      30,
      25,
      20,
      80,
      85,
      90,
    ];
    const data = mk(closes);
    const a = computeLineWilliamsRCrossSigLayout({
      data,
      length: 14,
      signalLength: 3,
    });
    const b = computeLineWilliamsRCrossSigLayout({
      data,
      length: 14,
      signalLength: 3,
    });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.wrPath).toBe(b.wrPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.wrValues).toEqual(b.run.wrValues);
    expect(a.run.signalValues).toEqual(b.run.signalValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
