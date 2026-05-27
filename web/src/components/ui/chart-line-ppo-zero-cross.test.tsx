import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLinePpoZeroCross,
  DEFAULT_CHART_LINE_PPO_ZERO_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_PPO_ZERO_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PADDING,
  DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_PPO_ZERO_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_PPO_ZERO_CROSS_THRESHOLD,
  DEFAULT_CHART_LINE_PPO_ZERO_CROSS_WIDTH,
  applyLinePpoZeroCrossEma,
  classifyLinePpoZeroCrossRegime,
  computeLinePpoZeroCross,
  computeLinePpoZeroCrossLayout,
  describeLinePpoZeroCrossChart,
  detectLinePpoZeroCrossCrosses,
  getLinePpoZeroCrossFinitePoints,
  normalizeLinePpoZeroCrossLength,
  normalizeLinePpoZeroCrossThreshold,
  runLinePpoZeroCross,
  type ChartLinePpoZeroCrossPoint,
} from './chart-line-ppo-zero-cross';

const mk = (closes: number[]): ChartLinePpoZeroCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLinePpoZeroCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    expect(getLinePpoZeroCrossFinitePoints(points)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLinePpoZeroCrossFinitePoints(null)).toEqual([]);
    expect(getLinePpoZeroCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLinePpoZeroCrossFinitePoints(
        'oops' as unknown as ChartLinePpoZeroCrossPoint[],
      ),
    ).toEqual([]);
  });
});

describe('normalizeLinePpoZeroCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLinePpoZeroCrossLength(12, 10)).toBe(12);
    expect(normalizeLinePpoZeroCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLinePpoZeroCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLinePpoZeroCrossLength(0, 10)).toBe(10);
    expect(normalizeLinePpoZeroCrossLength(-1, 10)).toBe(10);
    expect(normalizeLinePpoZeroCrossLength(NaN, 10)).toBe(10);
  });
});

describe('normalizeLinePpoZeroCrossThreshold', () => {
  it('accepts any finite value', () => {
    expect(normalizeLinePpoZeroCrossThreshold(0, -10)).toBe(0);
    expect(normalizeLinePpoZeroCrossThreshold(5, -10)).toBe(5);
    expect(normalizeLinePpoZeroCrossThreshold(-2, -10)).toBe(-2);
  });

  it('rejects non-finite', () => {
    expect(normalizeLinePpoZeroCrossThreshold(NaN, -10)).toBe(-10);
    expect(normalizeLinePpoZeroCrossThreshold(Infinity, -10)).toBe(-10);
  });
});

describe('applyLinePpoZeroCrossEma', () => {
  it('CONST values short-circuit to exact value', () => {
    const out = applyLinePpoZeroCrossEma(new Array(20).fill(42), 5);
    expect(out.slice(0, 4)).toEqual([null, null, null, null]);
    for (let i = 4; i < 20; i += 1) {
      expect(out[i]).toBe(42);
    }
  });

  it('CONST zeros stay at +0', () => {
    const out = applyLinePpoZeroCrossEma(new Array(20).fill(0), 5);
    expect(Object.is(out[4], 0)).toBe(true);
  });

  it('returns all null when values shorter than length', () => {
    expect(applyLinePpoZeroCrossEma([1, 2, 3], 5)).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe('computeLinePpoZeroCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> ppo = 0 from index slowLength-1 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { ppo } = computeLinePpoZeroCross(data, {
        fastLength: 12,
        slowLength: 26,
      });
      for (let i = 0; i < 25; i += 1) {
        expect(ppo[i]).toBeNull();
      }
      for (let i = 25; i < 40; i += 1) {
        expect(ppo[i]).toBe(0);
        expect(Object.is(ppo[i], -0)).toBe(false);
      }
    },
  );
});

describe('computeLinePpoZeroCross - LINEAR ramps', () => {
  it('LINEAR UP close=i+100 -> ppo positive', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i + 100));
    const { ppo } = computeLinePpoZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
    });
    const last = ppo[99];
    expect(last).not.toBeNull();
    expect(last).toBeGreaterThan(0);
  });

  it('LINEAR DOWN close=200-i -> ppo negative', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => 200 - i));
    const { ppo } = computeLinePpoZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
    });
    const last = ppo[99];
    expect(last).not.toBeNull();
    expect(last).toBeLessThan(0);
  });
});

describe('classifyLinePpoZeroCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLinePpoZeroCrossRegime(null, 0)).toBe('none');
  });

  it('ppo at threshold boundary -> bullish', () => {
    expect(classifyLinePpoZeroCrossRegime(0, 0)).toBe('bullish');
    expect(classifyLinePpoZeroCrossRegime(5, 0)).toBe('bullish');
  });

  it('ppo < threshold -> bearish', () => {
    expect(classifyLinePpoZeroCrossRegime(-0.01, 0)).toBe('bearish');
    expect(classifyLinePpoZeroCrossRegime(-5, 0)).toBe('bearish');
  });

  it('respects custom threshold', () => {
    expect(classifyLinePpoZeroCrossRegime(1, 1)).toBe('bullish');
    expect(classifyLinePpoZeroCrossRegime(0.5, 1)).toBe('bearish');
  });
});

describe('detectLinePpoZeroCrossCrosses', () => {
  it('fires bullish when ppo crosses up through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const ppo = [-2, -1, -0.5, 0.5, 1];
    const crosses = detectLinePpoZeroCrossCrosses(series, ppo, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bullish' }]);
  });

  it('fires bearish when ppo crosses down through 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const ppo = [2, 1, 0.5, -0.5, -1];
    const crosses = detectLinePpoZeroCrossCrosses(series, ppo, 0);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'bearish' }]);
  });

  it('emits bullish then bearish when ppo sweeps up then down', () => {
    const series = mk([1, 2, 3, 4]);
    const ppo = [-1, 1, 0.5, -1];
    const crosses = detectLinePpoZeroCrossCrosses(series, ppo, 0);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('bullish');
    expect(crosses[1]!.kind).toBe('bearish');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    expect(
      detectLinePpoZeroCrossCrosses(series, [null, -1, 1], 0),
    ).toEqual([{ index: 2, x: 2, kind: 'bullish' }]);
    expect(
      detectLinePpoZeroCrossCrosses(series, [-1, null, 1], 0),
    ).toEqual([]);
  });

  it('boundary equality not crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(detectLinePpoZeroCrossCrosses(series, [-1, 0], 0)).toEqual([]);
  });

  it('no cross when ppo stays on one side', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLinePpoZeroCrossCrosses(series, [-1, -2, -3, -4], 0),
    ).toEqual([]);
  });
});

describe('runLinePpoZeroCross', () => {
  it('CONST K -> 0 crosses, bullish at boundary after warmup', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLinePpoZeroCross(data, { fastLength: 12, slowLength: 26 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(25);
    expect(run.bullishCount).toBe(15);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR UP -> all bullish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i + 100));
    const run = runLinePpoZeroCross(data, { fastLength: 12, slowLength: 26 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bullishCount).toBeGreaterThan(0);
    expect(run.bearishCount).toBe(0);
  });

  it('LINEAR DOWN -> all bearish after warmup, 0 crosses', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => 200 - i));
    const run = runLinePpoZeroCross(data, { fastLength: 12, slowLength: 26 });
    expect(run.crosses).toHaveLength(0);
    expect(run.bearishCount).toBeGreaterThan(0);
    expect(run.bullishCount).toBe(0);
  });

  it('decline then rise generates a bullish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const run = runLinePpoZeroCross(mk(closes), {
      fastLength: 12,
      slowLength: 26,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bullish');
  });

  it('rise then decline generates a bearish zero-line cross', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 10 + i),
      ...Array.from({ length: 50 }, (_, i) => 59 - i * 2),
    ];
    const run = runLinePpoZeroCross(mk(closes), {
      fastLength: 12,
      slowLength: 26,
    });
    expect(run.ok).toBe(true);
    expect(run.crosses.length).toBeGreaterThan(0);
    expect(run.crosses[0]!.kind).toBe('bearish');
  });

  it('threshold normalization clamps non-finite', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLinePpoZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
      threshold: NaN,
    });
    expect(run.threshold).toBe(0);
  });

  it('respects custom positive / negative threshold', () => {
    const data = mk(new Array(40).fill(10));
    expect(
      runLinePpoZeroCross(data, { fastLength: 12, threshold: 0.5 }).threshold,
    ).toBe(0.5);
    expect(
      runLinePpoZeroCross(data, { fastLength: 12, threshold: -0.3 }).threshold,
    ).toBe(-0.3);
  });

  it('empty / insufficient data -> ok=false', () => {
    expect(runLinePpoZeroCross([], { fastLength: 12 }).ok).toBe(false);
    expect(runLinePpoZeroCross(mk([1, 2, 3]), { fastLength: 12 }).ok).toBe(
      false,
    );
  });

  it('sorts by x', () => {
    const data: ChartLinePpoZeroCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLinePpoZeroCross(data, { fastLength: 1, slowLength: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / ppo / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLinePpoZeroCross(data, {
      fastLength: 12,
      slowLength: 26,
    });
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 25; i += 1) {
      expect(run.samples[i]!.ppo).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 25; i < 40; i += 1) {
      expect(run.samples[i]!.ppo).toBe(0);
      expect(run.samples[i]!.regime).toBe('bullish');
    }
  });
});

describe('computeLinePpoZeroCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLinePpoZeroCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_PPO_ZERO_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_PPO_ZERO_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PADDING);
    expect(layout.panelGap).toBe(DEFAULT_CHART_LINE_PPO_ZERO_CROSS_PANEL_GAP);
  });

  it('SVG y-axis: thresholdY sits between oscTop and oscBottom', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i + 100));
    const layout = computeLinePpoZeroCrossLayout({ data });
    expect(layout.thresholdY).toBeGreaterThan(layout.oscTop);
    expect(layout.thresholdY).toBeLessThan(layout.oscBottom);
  });

  it('empty data -> ok=false', () => {
    const layout = computeLinePpoZeroCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.ppoPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
  });

  it('osc range auto-fits to observed ppo values plus padding', () => {
    const data = mk(Array.from({ length: 100 }, (_, i) => i + 100));
    const layout = computeLinePpoZeroCrossLayout({ data });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThan(0);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLinePpoZeroCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('ppo path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLinePpoZeroCrossLayout({ data });
    expect(layout.ppoPath.startsWith('M ')).toBe(true);
    const mCount = (layout.ppoPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLinePpoZeroCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });

  it('cross markers carry kind / cyOsc / cyPrice / cx', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const layout = computeLinePpoZeroCrossLayout({ data: mk(closes) });
    expect(layout.crossMarkers.length).toBeGreaterThan(0);
    for (const m of layout.crossMarkers) {
      expect(Number.isFinite(m.cyOsc)).toBe(true);
      expect(Number.isFinite(m.cyPrice)).toBe(true);
      expect(Number.isFinite(m.cx)).toBe(true);
      expect(['bullish', 'bearish']).toContain(m.kind);
    }
  });
});

describe('describeLinePpoZeroCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLinePpoZeroCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLinePpoZeroCrossChart(data);
    expect(desc).toContain('PPO Zero Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('fastLength 12');
    expect(desc).toContain('slowLength 26');
    expect(desc).toContain('threshold 0');
  });
});

describe('ChartLinePpoZeroCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLinePpoZeroCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('PPO Zero Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-ppo-zero-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('PPO Zero Cross chart');
  });

  it('renders config badge', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLinePpoZeroCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-ppo-zero-cross-badge"]',
    );
    expect(badge?.textContent).toContain('fast 12');
    expect(badge?.textContent).toContain('slow 26');
    expect(badge?.textContent).toContain('threshold 0');
  });

  it('renders legend toggles for price + ppo', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLinePpoZeroCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('ppo');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLinePpoZeroCross data={data} />);
    const btn = container.querySelector('[data-series-id="ppo"]');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLinePpoZeroCross data={data} hiddenSeries={['ppo']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-ppo-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLinePpoZeroCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-ppo-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLinePpoZeroCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="ppo"]')!);
    expect(events).toEqual([{ seriesId: 'ppo', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLinePpoZeroCross data={data} />);
    const btn = container.querySelector(
      '[data-series-id="ppo"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLinePpoZeroCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLinePpoZeroCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLinePpoZeroCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLinePpoZeroCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-ppo-zero-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-ppo-zero-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders threshold band by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLinePpoZeroCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-band-threshold"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLinePpoZeroCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLinePpoZeroCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('renders cross markers and overlays after decline + rise', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const { container } = render(<ChartLinePpoZeroCross data={mk(closes)} />);
    const bullishMarkers = container.querySelectorAll(
      '[data-section="chart-line-ppo-zero-cross-cross-bullish"]',
    );
    expect(bullishMarkers.length).toBeGreaterThan(0);
  });

  it('showCrosses=false hides cross markers', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const { container } = render(
      <ChartLinePpoZeroCross data={mk(closes)} showCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('showOverlayCrosses=false hides overlay arrows', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const { container } = render(
      <ChartLinePpoZeroCross data={mk(closes)} showOverlayCrosses={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-zero-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLinePpoZeroCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-ppo-zero-cross"]',
    );
    expect(region?.getAttribute('data-fast-length')).toBe('12');
    expect(region?.getAttribute('data-slow-length')).toBe('26');
    expect(region?.getAttribute('data-threshold')).toBe('0');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-bullish-count')).toBe('15');
  });

  it('defaults: fastLength=12, slowLength=26, threshold=0', () => {
    expect(DEFAULT_CHART_LINE_PPO_ZERO_CROSS_FAST_LENGTH).toBe(12);
    expect(DEFAULT_CHART_LINE_PPO_ZERO_CROSS_SLOW_LENGTH).toBe(26);
    expect(DEFAULT_CHART_LINE_PPO_ZERO_CROSS_THRESHOLD).toBe(0);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLinePpoZeroCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-ppo-zero-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLinePpoZeroCrossLayout({ data });
    const b = computeLinePpoZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.ppoPath).toBe(b.ppoPath);
    expect(a.thresholdY).toBe(b.thresholdY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for decline-then-rise pattern', () => {
    const closes = [
      ...Array.from({ length: 50 }, (_, i) => 100 - i),
      ...Array.from({ length: 50 }, (_, i) => 51 + i * 2),
    ];
    const data = mk(closes);
    const a = computeLinePpoZeroCrossLayout({ data });
    const b = computeLinePpoZeroCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.ppoPath).toBe(b.ppoPath);
    expect(a.run.ppoValues).toEqual(b.run.ppoValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
