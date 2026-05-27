import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineStochMidCrossSig,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_HEIGHT,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_K_SMOOTHING,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_LENGTH,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_PADDING,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_PANEL_GAP,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_THRESHOLD,
  DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_WIDTH,
  applyLineStochMidCrossSigSma,
  classifyLineStochMidCrossSigRegime,
  computeLineStochMidCrossSig,
  computeLineStochMidCrossSigLayout,
  describeLineStochMidCrossSigChart,
  detectLineStochMidCrossSigCrosses,
  getLineStochMidCrossSigFinitePoints,
  normalizeLineStochMidCrossSigLength,
  normalizeLineStochMidCrossSigThreshold,
  runLineStochMidCrossSig,
  type ChartLineStochMidCrossSigPoint,
} from './chart-line-stoch-mid-cross-sig';

const mk = (closes: number[]): ChartLineStochMidCrossSigPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineStochMidCrossSigFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLineStochMidCrossSigFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineStochMidCrossSigFinitePoints(null)).toEqual([]);
    expect(getLineStochMidCrossSigFinitePoints(undefined)).toEqual([]);
    expect(
      getLineStochMidCrossSigFinitePoints(
        'oops' as unknown as ChartLineStochMidCrossSigPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLineStochMidCrossSigLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineStochMidCrossSigLength(14, 14)).toBe(14);
    expect(normalizeLineStochMidCrossSigLength(1, 14)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineStochMidCrossSigLength(7.9, 14)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineStochMidCrossSigLength(0, 14)).toBe(14);
    expect(normalizeLineStochMidCrossSigLength(-1, 14)).toBe(14);
    expect(normalizeLineStochMidCrossSigLength(NaN, 14)).toBe(14);
  });
});

describe('normalizeLineStochMidCrossSigThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLineStochMidCrossSigThreshold(50, 50)).toBe(50);
    expect(normalizeLineStochMidCrossSigThreshold(0, 50)).toBe(0);
    expect(normalizeLineStochMidCrossSigThreshold(100, 50)).toBe(100);
  });

  it('rejects non-finite', () => {
    expect(normalizeLineStochMidCrossSigThreshold(NaN, 50)).toBe(50);
    expect(normalizeLineStochMidCrossSigThreshold(Infinity, 50)).toBe(50);
  });
});

describe('applyLineStochMidCrossSigSma', () => {
  it('CONST values -> SMA = value via CONST short-circuit', () => {
    const out = applyLineStochMidCrossSigSma(new Array(10).fill(42), 3);
    for (let i = 0; i < 2; i += 1) expect(out[i]).toBeNull();
    for (let i = 2; i < 10; i += 1) expect(out[i]).toBe(42);
  });

  it('CONST 50 -> SMA = 50 exactly (midline anchor)', () => {
    const out = applyLineStochMidCrossSigSma(new Array(10).fill(50), 3);
    for (let i = 2; i < 10; i += 1) {
      expect(out[i]).toBe(50);
      expect(Object.is(out[i], -0)).toBe(false);
    }
  });

  it('LINEAR ramp produces steady SMA with constant lag', () => {
    const values = Array.from({ length: 30 }, (_, i) => i);
    const out = applyLineStochMidCrossSigSma(values, 3);
    expect(out[2]).toBe(1);
    expect(out[20]).toBeCloseTo(19, 10);
  });
});

describe('computeLineStochMidCrossSig - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> rawK = 50 (degenerate), sigK = 50',
    (K) => {
      const data = mk(new Array(50).fill(K));
      const { rawK, sigK } = computeLineStochMidCrossSig(data, {
        length: 14,
        kSmoothing: 3,
      });
      for (let i = 0; i < 13; i += 1) {
        expect(rawK[i]).toBeNull();
      }
      for (let i = 13; i < 50; i += 1) {
        expect(rawK[i]).toBe(50);
      }
      for (let i = 0; i < 15; i += 1) {
        expect(sigK[i]).toBeNull();
      }
      for (let i = 15; i < 50; i += 1) {
        expect(sigK[i]).toBe(50);
        expect(Object.is(sigK[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLineStochMidCrossSig - LINEAR ramps', () => {
  it('LINEAR UP close=i -> rawK = 100, sigK = 100 after warmup', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const { rawK, sigK } = computeLineStochMidCrossSig(data, {
      length: 14,
      kSmoothing: 3,
    });
    for (let i = 13; i < 60; i += 1) {
      expect(rawK[i]).toBeCloseTo(100, 8);
    }
    for (let i = 15; i < 60; i += 1) {
      expect(sigK[i]).toBeCloseTo(100, 8);
    }
  });

  it('LINEAR DOWN close=-i -> rawK = 0, sigK = 0 after warmup', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const { rawK, sigK } = computeLineStochMidCrossSig(data, {
      length: 14,
      kSmoothing: 3,
    });
    for (let i = 13; i < 60; i += 1) {
      expect(rawK[i]).toBe(0);
      expect(Object.is(rawK[i], -0)).toBe(false);
    }
    for (let i = 15; i < 60; i += 1) {
      expect(sigK[i]).toBe(0);
    }
  });
});

describe('classifyLineStochMidCrossSigRegime', () => {
  it('null -> none', () => {
    expect(classifyLineStochMidCrossSigRegime(null, 50)).toBe('none');
  });

  it('sigK at threshold boundary -> bullish', () => {
    expect(classifyLineStochMidCrossSigRegime(50, 50)).toBe('bullish');
    expect(classifyLineStochMidCrossSigRegime(100, 50)).toBe('bullish');
  });

  it('sigK < threshold -> bearish', () => {
    expect(classifyLineStochMidCrossSigRegime(49.9, 50)).toBe('bearish');
    expect(classifyLineStochMidCrossSigRegime(0, 50)).toBe('bearish');
  });
});

describe('detectLineStochMidCrossSigCrosses', () => {
  it('fires bullish when sigK crosses up through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const sigK = [40, 45, 48, 50, 60];
    const crosses = detectLineStochMidCrossSigCrosses(series, sigK, 50);
    expect(crosses).toEqual([{ index: 4, x: 4, kind: 'bullish' }]);
  });

  it('fires bearish when sigK crosses down through 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const sigK = [60, 55, 52, 50, 40];
    const crosses = detectLineStochMidCrossSigCrosses(series, sigK, 50);
    expect(crosses).toEqual([{ index: 4, x: 4, kind: 'bearish' }]);
  });

  it('emits bullish then bearish on a sweep through the threshold', () => {
    const series = mk([1, 2, 3, 4]);
    const sigK = [50, 60, 55, 40];
    const crosses = detectLineStochMidCrossSigCrosses(series, sigK, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLineStochMidCrossSigCrosses(series, [null, 40, 60], 50),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLineStochMidCrossSigCrosses(series, [40, null, 60], 50),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLineStochMidCrossSigCrosses(series, [40, 50], 50)).toEqual(
      [],
    );
  });

  it('no cross when sigK stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineStochMidCrossSigCrosses(series, [40, 42, 45, 49], 50),
    ).toEqual([]);
  });
});

describe('runLineStochMidCrossSig', () => {
  it('CONST K -> 0 crosses, all bullish (sigK=50 >= 50)', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineStochMidCrossSig(data);
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(15);
    expect(run.bullishCount).toBe(35);
    expect(run.bearishCount).toBe(0);
    expect(run.length).toBe(14);
    expect(run.kSmoothing).toBe(3);
    expect(run.threshold).toBe(50);
  });

  it('LINEAR UP -> all bullish (sigK=100 > 50), 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => i));
    const run = runLineStochMidCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish (sigK=0 < 50), 0 crosses', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const run = runLineStochMidCrossSig(data);
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.bullishCount).toBe(0);
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineStochMidCrossSig(data, { threshold: NaN });
    expect(run.threshold).toBe(50);
  });

  it('respects custom threshold', () => {
    const data = mk(new Array(50).fill(50));
    expect(runLineStochMidCrossSig(data, { threshold: 80 }).threshold).toBe(
      80,
    );
    expect(runLineStochMidCrossSig(data, { threshold: 20 }).threshold).toBe(
      20,
    );
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLineStochMidCrossSig([]).ok).toBe(false);
    expect(runLineStochMidCrossSig(mk([1, 2, 3])).ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineStochMidCrossSigPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineStochMidCrossSig(data, {
      length: 1,
      kSmoothing: 1,
    });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / sigK / regime', () => {
    const data = mk(new Array(50).fill(50));
    const run = runLineStochMidCrossSig(data);
    expect(run.samples).toHaveLength(50);
    for (let i = 0; i < 15; i += 1) {
      expect(run.samples[i]!.sigK).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 15; i < 50; i += 1) {
      expect(run.samples[i]!.sigK).toBe(50);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLineStochMidCrossSigLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineStochMidCrossSigLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_HEIGHT);
    expect(layout.padding).toBe(
      DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_PADDING,
    );
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_PANEL_GAP,
    );
  });

  it('osc panel is fixed at 0..100', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineStochMidCrossSigLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('threshold band sits inside osc panel', () => {
    const data = mk(new Array(50).fill(50));
    const layout = computeLineStochMidCrossSigLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLineStochMidCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.sigKPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineStochMidCrossSigLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('sigK path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 50 }, (_, i) => i));
    const layout = computeLineStochMidCrossSigLayout({ data });
    expect(layout.sigKPath.startsWith('M ')).toBe(true);
    const mCount = (layout.sigKPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-value price', () => {
    const data = mk(new Array(50).fill(7));
    const layout = computeLineStochMidCrossSigLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineStochMidCrossSigChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineStochMidCrossSigChart([])).toBe('No data');
  });

  it('describes bar count + parameters + midline framing', () => {
    const data = mk(new Array(50).fill(50));
    const desc = describeLineStochMidCrossSigChart(data);
    expect(desc).toContain('Stochastic Midline Signal Cross chart');
    expect(desc).toContain('50 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('kSmoothing 3');
    expect(desc).toContain('threshold 50');
    expect(desc).toContain('smoothed K midline');
    expect(desc).toContain('signal line crosses up through midline 50');
  });
});

describe('ChartLineStochMidCrossSig rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(50).fill(10));
    const { container, getByRole } = render(
      <ChartLineStochMidCrossSig data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe(
      'Stochastic Midline Signal Cross chart',
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-mid-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Stochastic Midline Signal Cross chart',
    );
  });

  it('renders config badge', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineStochMidCrossSig data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-mid-cross-sig-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('kSmoothing 3');
    expect(badge?.textContent).toContain('threshold 50');
  });

  it('renders legend toggles for price + sigK', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineStochMidCrossSig data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('sigK');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineStochMidCrossSig data={data} />);
    const btn = container.querySelector('[data-series-id="sigK"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(50).fill(10));
    const { container, rerender } = render(
      <ChartLineStochMidCrossSig data={data} hiddenSeries={['sigK']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-sigk-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineStochMidCrossSig data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-sigk-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(50).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineStochMidCrossSig
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="sigK"]')!);
    expect(events).toEqual([{ seriesId: 'sigK', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineStochMidCrossSig data={data} />);
    const btn = container.querySelector(
      '[data-series-id="sigK"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineStochMidCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochMidCrossSig data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineStochMidCrossSig data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineStochMidCrossSig data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-stoch-mid-cross-sig-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-stoch-mid-cross-sig-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineStochMidCrossSig data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochMidCrossSig data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochMidCrossSig
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-badge"]',
      ),
    ).toBeNull();
  });

  it('showCrosses=false hides cross markers group', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochMidCrossSig data={data} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows group', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(
      <ChartLineStochMidCrossSig data={data} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-mid-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(50).fill(10));
    const { container } = render(<ChartLineStochMidCrossSig data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-stoch-mid-cross-sig"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-k-smoothing')).toBe('3');
    expect(region?.getAttribute('data-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('35');
    expect(region?.getAttribute('data-bearish-count')).toBe('0');
  });

  it('defaults: length=14, kSmoothing=3, threshold=50', () => {
    expect(DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_K_SMOOTHING).toBe(3);
    expect(DEFAULT_CHART_LINE_STOCH_MID_CROSS_SIG_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(50).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineStochMidCrossSig data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stoch-mid-cross-sig',
    );
  });

  it('layout is deterministic across calls for default CONST 50 bars', () => {
    const data = mk(new Array(50).fill(10));
    const a = computeLineStochMidCrossSigLayout({ data });
    const b = computeLineStochMidCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.sigKPath).toBe(b.sigKPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout deterministic across calls for LINEAR DOWN pattern', () => {
    const data = mk(Array.from({ length: 60 }, (_, i) => -i));
    const a = computeLineStochMidCrossSigLayout({ data });
    const b = computeLineStochMidCrossSigLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.sigKPath).toBe(b.sigKPath);
    expect(a.run.rawKValues).toEqual(b.run.rawKValues);
    expect(a.run.sigKValues).toEqual(b.run.sigKValues);
  });
});
