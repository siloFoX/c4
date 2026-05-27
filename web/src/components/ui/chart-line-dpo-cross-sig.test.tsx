import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineDpoCrossSig,
  DEFAULT_CHART_LINE_DPO_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_DPO_CROSS_SIG_K_SMOOTHING,
  DEFAULT_CHART_LINE_DPO_CROSS_SIG_LENGTH,
  DEFAULT_CHART_LINE_DPO_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_DPO_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_DPO_CROSS_SIG_WIDTH,
  applyLineDpoCrossSigSma,
  classifyLineDpoCrossSigRegime,
  computeLineDpoCrossSig,
  computeLineDpoCrossSigLayout,
  describeLineDpoCrossSigChart,
  detectLineDpoCrossSigCrosses,
  getLineDpoCrossSigFinitePoints,
  lineDpoCrossSigShift,
  normalizeLineDpoCrossSigLength,
  runLineDpoCrossSig,
  type ChartLineDpoCrossSigPoint,
} from './chart-line-dpo-cross-sig';

const mk = (closes: number[]): ChartLineDpoCrossSigPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineDpoCrossSigFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineDpoCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineDpoCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineDpoCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineDpoCrossSigFinitePoints(
        'oops' as unknown as ChartLineDpoCrossSigPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineDpoCrossSigLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineDpoCrossSigLength(20, 20)).toBe(20);
    expect(normalizeLineDpoCrossSigLength(1, 20)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineDpoCrossSigLength(7.9, 20)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineDpoCrossSigLength(0, 20)).toBe(20);
    expect(normalizeLineDpoCrossSigLength(-1, 20)).toBe(20);
    expect(normalizeLineDpoCrossSigLength(NaN, 20)).toBe(20);
  });
});

describe('lineDpoCrossSigShift', () => {
  it('shift = floor(length / 2) + 1', () => {
    expect(lineDpoCrossSigShift(20)).toBe(11);
    expect(lineDpoCrossSigShift(14)).toBe(8);
    expect(lineDpoCrossSigShift(10)).toBe(6);
    expect(lineDpoCrossSigShift(1)).toBe(1);
  });
});

describe('applyLineDpoCrossSigSma', () => {
  it('CONST -> SMA = value via short-circuit', () => {
    const out = applyLineDpoCrossSigSma(new Array(15).fill(42), 9);
    for (let i = 0; i < 8; i += 1) expect(out[i]).toBeNull();
    for (let i = 8; i < 15; i += 1) expect(out[i]).toBe(42);
  });

  it('CONST zero -> SMA = 0 (Object.is +0)', () => {
    const out = applyLineDpoCrossSigSma(new Array(15).fill(0), 9);
    for (let i = 8; i < 15; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });
});

describe('computeLineDpoCrossSig - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> dpo = 0, signal = 0',
    (K) => {
      const data = mk(new Array(60).fill(K));
      const { dpo, signal } = computeLineDpoCrossSig(data, {
        length: 20,
        kSmoothing: 9,
      });
      for (let i = 0; i < 19; i += 1) expect(dpo[i]).toBeNull();
      for (let i = 19; i < 60; i += 1) {
        expect(dpo[i]).toBe(0);
        expect(Object.is(dpo[i], -0)).toBe(false);
      }
      for (let i = 0; i < 27; i += 1) expect(signal[i]).toBeNull();
      for (let i = 27; i < 60; i += 1) expect(signal[i]).toBe(0);
    },
  );
});

describe('computeLineDpoCrossSig - LINEAR ramps', () => {
  it('LINEAR UP close=i -> dpo = -1.5, signal = -1.5', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const { dpo, signal } = computeLineDpoCrossSig(data, {
      length: 20,
      kSmoothing: 9,
    });
    for (let i = 19; i < 60; i += 1) expect(dpo[i]).toBeCloseTo(-1.5, 10);
    for (let i = 27; i < 60; i += 1) expect(signal[i]).toBeCloseTo(-1.5, 10);
  });

  it('LINEAR DOWN close=-i -> dpo = 1.5, signal = 1.5', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const { dpo, signal } = computeLineDpoCrossSig(data, {
      length: 20,
      kSmoothing: 9,
    });
    for (let i = 19; i < 60; i += 1) expect(dpo[i]).toBeCloseTo(1.5, 10);
    for (let i = 27; i < 60; i += 1) expect(signal[i]).toBeCloseTo(1.5, 10);
  });
});

describe('classifyLineDpoCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineDpoCrossSigRegime(null, 0)).toBe('none');
    expect(classifyLineDpoCrossSigRegime(0, null)).toBe('none');
  });

  it('dpo >= signal -> bullish (boundary inclusive)', () => {
    expect(classifyLineDpoCrossSigRegime(0, 0)).toBe('bullish');
    expect(classifyLineDpoCrossSigRegime(2, 1)).toBe('bullish');
    expect(classifyLineDpoCrossSigRegime(-1.5, -1.5)).toBe('bullish');
  });

  it('dpo < signal -> bearish', () => {
    expect(classifyLineDpoCrossSigRegime(0, 0.001)).toBe('bearish');
    expect(classifyLineDpoCrossSigRegime(-2, -1)).toBe('bearish');
  });
});

describe('detectLineDpoCrossSigCrosses', () => {
  it('fires bullish when dpo crosses up through signal', () => {
    const series = mk([1, 2, 3]);
    const dpo = [-1, -0.5, 0.5];
    const signal = [0, 0, 0];
    expect(detectLineDpoCrossSigCrosses(series, dpo, signal)).toEqual([
      { index: 2, x: 2, kind: 'bullish' },
    ]);
  });

  it('fires bearish when dpo crosses down through signal', () => {
    const series = mk([1, 2, 3]);
    const dpo = [1, 0.5, -0.5];
    const signal = [0, 0, 0];
    expect(detectLineDpoCrossSigCrosses(series, dpo, signal)).toEqual([
      { index: 2, x: 2, kind: 'bearish' },
    ]);
  });

  it('emits both kinds on a sweep through signal', () => {
    const series = mk([1, 2, 3, 4]);
    const dpo = [-1, 1, 0.5, -0.5];
    const signal = [0, 0, 0, 0];
    const out = detectLineDpoCrossSigCrosses(series, dpo, signal);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });

  it('skips when any value is null', () => {
    const series = mk([1, 2]);
    expect(detectLineDpoCrossSigCrosses(series, [null, 1], [0, 0])).toEqual(
      [],
    );
    expect(detectLineDpoCrossSigCrosses(series, [1, null], [0, 0])).toEqual(
      [],
    );
    expect(detectLineDpoCrossSigCrosses(series, [1, 2], [null, 0])).toEqual(
      [],
    );
    expect(detectLineDpoCrossSigCrosses(series, [1, 2], [0, null])).toEqual(
      [],
    );
  });

  it('boundary equality not crossed (strict cur > signal)', () => {
    const series = mk([1, 2]);
    expect(detectLineDpoCrossSigCrosses(series, [0, 0], [0, 0])).toEqual([]);
    expect(detectLineDpoCrossSigCrosses(series, [-1, 0], [0, 0])).toEqual([]);
  });

  it('no cross when dpo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineDpoCrossSigCrosses(
        series,
        [-2, -1.5, -1, -0.5],
        [0, 0, 0, 0],
      ),
    ).toEqual([]);
  });
});

describe('runLineDpoCrossSig', () => {
  it('CONST K -> 0 crosses, noneCount=27, bullishCount=33 (60 bars)', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineDpoCrossSig(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(27);
    expect(run.bullishCount).toBe(33);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(20);
    expect(run.kSmoothing).toBe(9);
    expect(run.shift).toBe(11);
  });

  it('LINEAR UP 60 -> bullish steady state (dpo==signal=-1.5), 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineDpoCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(33);
    expect(run.bearishCount).toBe(0);
    expect(run.noneCount).toBe(27);
  });

  it('LINEAR DOWN 60 -> bullish at boundary (dpo==signal=1.5), 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineDpoCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(33);
    expect(run.bearishCount).toBe(0);
  });

  it('respects custom length and kSmoothing', () => {
    const data = mk(new Array(60).fill(50));
    expect(runLineDpoCrossSig(data, { length: 14 }).length).toBe(14);
    expect(runLineDpoCrossSig(data, { length: 14 }).shift).toBe(8);
    expect(runLineDpoCrossSig(data, { kSmoothing: 5 }).kSmoothing).toBe(5);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineDpoCrossSig([]).ok).toBe(false);
    expect(runLineDpoCrossSig(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineDpoCrossSigPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineDpoCrossSig(data, { length: 1, kSmoothing: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / dpo / signal / regime', () => {
    const data = mk(new Array(60).fill(50));
    const run = runLineDpoCrossSig(data);
    expect(run.samples).toHaveLength(60);
    for (let i = 0; i < 19; i += 1) {
      expect(run.samples[i]!.dpo).toBeNull();
    }
    for (let i = 27; i < 60; i += 1) {
      expect(run.samples[i]!.dpo).toBe(0);
      expect(run.samples[i]!.signal).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineDpoCrossSigLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineDpoCrossSigLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_DPO_CROSS_SIG_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_DPO_CROSS_SIG_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_DPO_CROSS_SIG_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_DPO_CROSS_SIG_PANEL_GAP);
  });

  it('CONST K -> dpo=0 -> symmetric default range [-1, 1]', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineDpoCrossSigLayout({ data });
    expect(layout.oscMin).toBe(-1);
    expect(layout.oscMax).toBe(1);
  });

  it('LINEAR UP -> dpo=-1.5 -> symmetric range -1.65 .. 1.65', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineDpoCrossSigLayout({ data });
    expect(layout.oscMin).toBeCloseTo(-1.65, 6);
    expect(layout.oscMax).toBeCloseTo(1.65, 6);
  });

  it('zero line sits inside osc panel', () => {
    const data = mk(new Array(60).fill(50));
    const layout = computeLineDpoCrossSigLayout({ data });
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineDpoCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.dpoPath).toBe('');
    expect(layout.signalPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineDpoCrossSigLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('dpo and signal paths skip null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const layout = computeLineDpoCrossSigLayout({ data });
    expect(layout.dpoPath.startsWith('M ')).toBe(true);
    expect(layout.signalPath.startsWith('M ')).toBe(true);
    expect((layout.dpoPath.match(/M /g) ?? []).length).toBe(1);
    expect((layout.signalPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(60).fill(7));
    const layout = computeLineDpoCrossSigLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineDpoCrossSigChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineDpoCrossSigChart([])).toBe('No data');
  });

  it('describes bar count + parameters + detrended-momentum framing', () => {
    const data = mk(new Array(60).fill(50));
    const desc = describeLineDpoCrossSigChart(data);
    expect(desc).toContain('DPO Signal Cross chart');
    expect(desc).toContain('60 bars');
    expect(desc).toContain('length 20');
    expect(desc).toContain('kSmoothing 9');
    expect(desc).toContain('shift 11');
    expect(desc).toContain('smoothed detrended momentum');
  });
});

describe('ChartLineDpoCrossSig rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(60).fill(10));
    const { container, getByRole } = render(
      <ChartLineDpoCrossSig data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'DPO Signal Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-dpo-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('DPO Signal Cross chart');
  });

  it('renders config badge with shift', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineDpoCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-dpo-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('length 20');
    expect(badge?.textContent).toContain('kSmoothing 9');
    expect(badge?.textContent).toContain('shift 11');
  });

  it('renders legend toggles for price + dpo + signal', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineDpoCrossSig data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('dpo');
    expect(buttons[2].getAttribute('data-series-id')).toBe('signal');
  });

  it('toggles dpo series via legend click', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineDpoCrossSig data={data} />);
    const btn = container.querySelector('[data-series-id="dpo"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries for dpo', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineDpoCrossSig data={data} hiddenSeries={['dpo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-dpo-path"]',
      ),
    ).toBeNull();
  });

  it('respects controlled hiddenSeries for signal', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineDpoCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(60).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineDpoCrossSig
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="signal"]')!);
    expect(events).toEqual([{ seriesId: 'signal', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineDpoCrossSig data={data} />);
    const btn = container.querySelector(
      '[data-series-id="dpo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineDpoCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineDpoCrossSig data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineDpoCrossSig data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineDpoCrossSig data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-dpo-cross-sig-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-dpo-cross-sig-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders zero line by default', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineDpoCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('showZero=false hides zero line', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineDpoCrossSig data={data} showZero={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-zero"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineDpoCrossSig
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses=false / showOverlayCrosses=false hide markers', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(
      <ChartLineDpoCrossSig
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dpo-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(60).fill(10));
    const { container } = render(<ChartLineDpoCrossSig data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-dpo-cross-sig"]',
    );
    expect(region?.getAttribute('data-length')).toBe('20');
    expect(region?.getAttribute('data-k-smoothing')).toBe('9');
    expect(region?.getAttribute('data-shift')).toBe('11');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('33');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults: length=20, kSmoothing=9', () => {
    expect(DEFAULT_CHART_LINE_DPO_CROSS_SIG_LENGTH).toBe(20);
    expect(DEFAULT_CHART_LINE_DPO_CROSS_SIG_K_SMOOTHING).toBe(9);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(60).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineDpoCrossSig data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-dpo-cross-sig',
    );
  });

  it('layout deterministic across calls for default CONST 60 bars', () => {
    const data = mk(new Array(60).fill(10));
    const a = computeLineDpoCrossSigLayout({ data });
    const b = computeLineDpoCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for LINEAR DOWN pattern', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const a = computeLineDpoCrossSigLayout({ data });
    const b = computeLineDpoCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.dpoPath).toBe(b.dpoPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.dpoValues).toEqual(b.run.dpoValues);
    expect(a.run.signalValues).toEqual(b.run.signalValues);
  });
});
