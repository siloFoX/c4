import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineCmoCrossSig,
  DEFAULT_CHART_LINE_CMO_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_CMO_CROSS_SIG_K_SMOOTHING,
  DEFAULT_CHART_LINE_CMO_CROSS_SIG_LENGTH,
  DEFAULT_CHART_LINE_CMO_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_CMO_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_CMO_CROSS_SIG_WIDTH,
  applyLineCmoCrossSigCmo,
  applyLineCmoCrossSigSma,
  classifyLineCmoCrossSigRegime,
  computeLineCmoCrossSig,
  computeLineCmoCrossSigLayout,
  describeLineCmoCrossSigChart,
  detectLineCmoCrossSigCrosses,
  getLineCmoCrossSigFinitePoints,
  normalizeLineCmoCrossSigLength,
  runLineCmoCrossSig,
  type ChartLineCmoCrossSigPoint,
} from './chart-line-cmo-cross-sig';

const mk = (closes: number[]): ChartLineCmoCrossSigPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineCmoCrossSigFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineCmoCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineCmoCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineCmoCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineCmoCrossSigFinitePoints(
        'oops' as unknown as ChartLineCmoCrossSigPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineCmoCrossSigLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineCmoCrossSigLength(14, 14)).toBe(14);
    expect(normalizeLineCmoCrossSigLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineCmoCrossSigLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineCmoCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineCmoCrossSigLength(-1, 14)).toBe(14);
    expect(normalizeLineCmoCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('applyLineCmoCrossSigSma', () => {
  it('CONST -> SMA = value via short-circuit', () => {
    const out = applyLineCmoCrossSigSma(new Array(10).fill(42), 3);
    for (let i = 0; i < 2; i += 1) expect(out[i]).toBeNull();
    for (let i = 2; i < 10; i += 1) expect(out[i]).toBe(42);
  });

  it('CONST zero -> SMA = 0 (Object.is +0)', () => {
    const out = applyLineCmoCrossSigSma(new Array(10).fill(0), 3);
    for (let i = 2; i < 10; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });
});

describe('applyLineCmoCrossSigCmo', () => {
  it('CONST close=K -> CMO = 0 (degenerate)', () => {
    const out = applyLineCmoCrossSigCmo(new Array(30).fill(42), 14);
    for (let i = 0; i < 14; i += 1) expect(out[i]).toBeNull();
    for (let i = 14; i < 30; i += 1) {
      expect(out[i]).toBe(0);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });

  it('LINEAR UP -> CMO = 100 (only gains)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i);
    const out = applyLineCmoCrossSigCmo(closes, 14);
    for (let i = 14; i < 30; i += 1) expect(out[i]).toBe(100);
  });

  it('LINEAR DOWN -> CMO = -100 (only losses)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => -i);
    const out = applyLineCmoCrossSigCmo(closes, 14);
    for (let i = 14; i < 30; i += 1) expect(out[i]).toBe(-100);
  });
});

describe('computeLineCmoCrossSig - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> cmo=0, signal=0',
    (K) => {
      const data = mk(new Array(50).fill(K));
      const { cmo, signal } = computeLineCmoCrossSig(data, {
        length: 14,
        kSmoothing: 3,
      });
      for (let i = 0; i < 14; i += 1) expect(cmo[i]).toBeNull();
      for (let i = 14; i < 50; i += 1) expect(cmo[i]).toBe(0);
      for (let i = 0; i < 16; i += 1) expect(signal[i]).toBeNull();
      for (let i = 16; i < 50; i += 1) expect(signal[i]).toBe(0);
    },
  );
});

describe('computeLineCmoCrossSig - LINEAR ramps', () => {
  it('LINEAR UP -> cmo=100, signal=100', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const { cmo, signal } = computeLineCmoCrossSig(data, {
      length: 14,
      kSmoothing: 3,
    });
    for (let i = 14; i < 50; i += 1) expect(cmo[i]).toBe(100);
    for (let i = 16; i < 50; i += 1) expect(signal[i]).toBe(100);
  });

  it('LINEAR DOWN -> cmo=-100, signal=-100', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => -i));
    const { cmo, signal } = computeLineCmoCrossSig(data, {
      length: 14,
      kSmoothing: 3,
    });
    for (let i = 14; i < 50; i += 1) expect(cmo[i]).toBe(-100);
    for (let i = 16; i < 50; i += 1) expect(signal[i]).toBe(-100);
  });
});

describe('classifyLineCmoCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineCmoCrossSigRegime(null, 0)).toBe('none');
    expect(classifyLineCmoCrossSigRegime(0, null)).toBe('none');
  });

  it('cmo >= signal -> bullish (boundary inclusive)', () => {
    expect(classifyLineCmoCrossSigRegime(0, 0)).toBe('bullish');
    expect(classifyLineCmoCrossSigRegime(100, 50)).toBe('bullish');
    expect(classifyLineCmoCrossSigRegime(-50, -50)).toBe('bullish');
  });

  it('cmo < signal -> bearish', () => {
    expect(classifyLineCmoCrossSigRegime(0, 1)).toBe('bearish');
    expect(classifyLineCmoCrossSigRegime(-100, 0)).toBe('bearish');
  });
});

describe('detectLineCmoCrossSigCrosses', () => {
  it('fires bullish when cmo crosses up through signal', () => {
    const series = mk([1, 2, 3]);
    const cmo = [10, 15, 30];
    const signal = [20, 20, 20];
    expect(detectLineCmoCrossSigCrosses(series, cmo, signal)).toEqual([
      { index: 2, x: 2, kind: 'bullish' },
    ]);
  });

  it('fires bearish when cmo crosses down through signal', () => {
    const series = mk([1, 2, 3]);
    const cmo = [30, 25, 10];
    const signal = [20, 20, 20];
    expect(detectLineCmoCrossSigCrosses(series, cmo, signal)).toEqual([
      { index: 2, x: 2, kind: 'bearish' },
    ]);
  });

  it('emits both kinds on a sweep through signal', () => {
    const series = mk([1, 2, 3, 4]);
    const cmo = [10, 30, 20, 10];
    const signal = [20, 20, 20, 20];
    const out = detectLineCmoCrossSigCrosses(series, cmo, signal);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('bullish');
    expect(out[1]!.kind).toBe('bearish');
  });

  it('skips when any value is null', () => {
    const series = mk([1, 2]);
    expect(
      detectLineCmoCrossSigCrosses(series, [null, 10], [5, 5]),
    ).toEqual([]);
    expect(
      detectLineCmoCrossSigCrosses(series, [5, null], [5, 5]),
    ).toEqual([]);
    expect(
      detectLineCmoCrossSigCrosses(series, [5, 10], [null, 5]),
    ).toEqual([]);
    expect(
      detectLineCmoCrossSigCrosses(series, [5, 10], [5, null]),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > signal)', () => {
    const series = mk([1, 2]);
    expect(detectLineCmoCrossSigCrosses(series, [5, 5], [5, 5])).toEqual([]);
    expect(detectLineCmoCrossSigCrosses(series, [3, 5], [5, 5])).toEqual([]);
  });

  it('no cross when cmo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    const cmo = [40, 42, 45, 49];
    const signal = [50, 50, 50, 50];
    expect(detectLineCmoCrossSigCrosses(series, cmo, signal)).toEqual([]);
  });
});

describe('runLineCmoCrossSig', () => {
  it('CONST K -> 0 crosses, noneCount=16, bullishCount=34 (50 bars)', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineCmoCrossSig(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(16);
    expect(run.bullishCount).toBe(34);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(14);
    expect(run.kSmoothing).toBe(3);
  });

  it('LINEAR UP -> bullish steady state, 0 crosses (cmo==signal=100)', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineCmoCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(44);
    expect(run.bearishCount).toBe(0);
    expect(run.noneCount).toBe(16);
  });

  it('LINEAR DOWN -> bullish at boundary (cmo==signal=-100), 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineCmoCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBe(44);
    expect(run.bearishCount).toBe(0);
  });

  it('respects custom length and kSmoothing', () => {
    const data = mk(new Array(50).fill(50));
    expect(
      runLineCmoCrossSig(data, { length: 7 }).length,
    ).toBe(7);
    expect(
      runLineCmoCrossSig(data, { kSmoothing: 5 }).kSmoothing,
    ).toBe(5);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineCmoCrossSig([]).ok).toBe(false);
    expect(runLineCmoCrossSig(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineCmoCrossSigPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineCmoCrossSig(data, { length: 1, kSmoothing: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / cmo / signal / regime', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineCmoCrossSig(data);
    expect(run.samples).toHaveLength(50);
    for (let i = 0; i < 14; i += 1) {
      expect(run.samples[i]!.cmo).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 16; i < 50; i += 1) {
      expect(run.samples[i]!.cmo).toBe(0);
      expect(run.samples[i]!.signal).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineCmoCrossSigLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineCmoCrossSigLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_CMO_CROSS_SIG_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_CMO_CROSS_SIG_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_CMO_CROSS_SIG_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_CMO_CROSS_SIG_PANEL_GAP);
  });

  it('osc panel is fixed at -100..100', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineCmoCrossSigLayout({ data });
    expect(layout.oscMin).toBe(-100);
    expect(layout.oscMax).toBe(100);
  });

  it('zero line sits inside osc panel', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineCmoCrossSigLayout({ data });
    expect(layout.zeroY).toBeGreaterThan(layout.oscTop);
    expect(layout.zeroY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineCmoCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.cmoPath).toBe('');
    expect(layout.signalPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineCmoCrossSigLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('cmo and signal paths skip null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineCmoCrossSigLayout({ data });
    expect(layout.cmoPath.startsWith('M ')).toBe(true);
    expect(layout.signalPath.startsWith('M ')).toBe(true);
    expect((layout.cmoPath.match(/M /g) ?? []).length).toBe(1);
    expect((layout.signalPath.match(/M /g) ?? []).length).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(50).fill(7));
    const layout = computeLineCmoCrossSigLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineCmoCrossSigChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineCmoCrossSigChart([])).toBe('No data');
  });

  it('describes bar count + parameters + signal-line framing', () => {
    const data = mk(new Array(50).fill(50));
    const desc = describeLineCmoCrossSigChart(data);
    expect(desc).toContain('CMO Signal Cross chart');
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('kSmoothing 3');
    expect(desc).toContain('smoothed-CMO trigger');
    expect(desc).toContain('signal line');
  });
});

describe('ChartLineCmoCrossSig rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(50).fill(10));
    const { container, getByRole } = render(
      <ChartLineCmoCrossSig data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'CMO Signal Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-cmo-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('CMO Signal Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineCmoCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cmo-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('kSmoothing 3');
  });

  it('renders legend toggles for price + cmo + signal', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineCmoCrossSig data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('cmo');
    expect(buttons[2].getAttribute('data-series-id')).toBe('signal');
  });

  it('toggles signal series via legend click', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineCmoCrossSig data={data} />);
    const btn = container.querySelector('[data-series-id="signal"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries for cmo', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineCmoCrossSig data={data} hiddenSeries={['cmo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-cmo-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineCmoCrossSig data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-cmo-path"]',
      ),
    ).not.toBeNull();
  });

  it('respects controlled hiddenSeries for signal', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoCrossSig data={data} hiddenSeries={['signal']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-signal-path"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(50).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineCmoCrossSig
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="cmo"]')!);
    expect(events).toEqual([{ seriesId: 'cmo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineCmoCrossSig data={data} />);
    const btn = container.querySelector(
      '[data-series-id="cmo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineCmoCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoCrossSig data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineCmoCrossSig data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineCmoCrossSig data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-cmo-cross-sig-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-cmo-cross-sig-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders zero line by default', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineCmoCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('showZero=false hides zero line', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoCrossSig data={data} showZero={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-zero"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoCrossSig
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses=false / showOverlayCrosses=false hide markers', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineCmoCrossSig
        data={data}
        showCrosses={false}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-crosses"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-cmo-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineCmoCrossSig data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-cmo-cross-sig"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-k-smoothing')).toBe('3');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('34');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults: length=14, kSmoothing=3', () => {
    expect(DEFAULT_CHART_LINE_CMO_CROSS_SIG_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_CMO_CROSS_SIG_K_SMOOTHING).toBe(3);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(50).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCmoCrossSig data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cmo-cross-sig',
    );
  });

  it('layout is deterministic across calls for default CONST 50 bars', () => {
    const data = mk(new Array(50).fill(10));
    const a = computeLineCmoCrossSigLayout({ data });
    const b = computeLineCmoCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cmoPath).toBe(b.cmoPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for LINEAR DOWN pattern', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const a = computeLineCmoCrossSigLayout({ data });
    const b = computeLineCmoCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.cmoPath).toBe(b.cmoPath);
    expect(a.signalPath).toBe(b.signalPath);
    expect(a.run.cmoValues).toEqual(b.run.cmoValues);
    expect(a.run.signalValues).toEqual(b.run.signalValues);
  });
});
