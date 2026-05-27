import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  ChartLineAdxStrengthCross,
  DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_HEIGHT,
  DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_LENGTH,
  DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_THRESHOLD,
  DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PADDING,
  DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PANEL_GAP,
  DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_THRESHOLD,
  DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_WIDTH,
  applyLineAdxStrengthCrossWilder,
  classifyLineAdxStrengthCrossRegime,
  computeLineAdxStrengthCross,
  computeLineAdxStrengthCrossLayout,
  describeLineAdxStrengthCrossChart,
  detectLineAdxStrengthCrossCrosses,
  getLineAdxStrengthCrossFinitePoints,
  normalizeLineAdxStrengthCrossLength,
  normalizeLineAdxStrengthCrossThreshold,
  runLineAdxStrengthCross,
  type ChartLineAdxStrengthCrossPoint,
} from './chart-line-adx-strength-cross';

const mk = (closes: number[]): ChartLineAdxStrengthCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

describe('getLineAdxStrengthCrossFinitePoints', () => {
  it('keeps only finite points', () => {
    const points = [
      { x: 0, close: 10 },
      { x: 1, close: NaN },
      { x: 2, close: 11 },
      { x: Infinity, close: 12 },
      { x: 3, close: -Infinity },
      { x: 4, close: 13 },
    ];
    const out = getLineAdxStrengthCrossFinitePoints(points);
    expect(out).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 11 },
      { x: 4, close: 13 },
    ]);
  });

  it('returns [] for null / undefined / non-array', () => {
    expect(getLineAdxStrengthCrossFinitePoints(null)).toEqual([]);
    expect(getLineAdxStrengthCrossFinitePoints(undefined)).toEqual([]);
    expect(
      getLineAdxStrengthCrossFinitePoints(
        'oops' as unknown as ChartLineAdxStrengthCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('skips falsy entries', () => {
    const bad = [
      null,
      undefined,
      { x: 0, close: 1 },
      false,
    ] as unknown as ChartLineAdxStrengthCrossPoint[];
    expect(getLineAdxStrengthCrossFinitePoints(bad)).toEqual([
      { x: 0, close: 1 },
    ]);
  });
});

describe('normalizeLineAdxStrengthCrossLength', () => {
  it('keeps finite integers >= 1', () => {
    expect(normalizeLineAdxStrengthCrossLength(14, 10)).toBe(14);
    expect(normalizeLineAdxStrengthCrossLength(1, 10)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(normalizeLineAdxStrengthCrossLength(7.9, 10)).toBe(7);
  });

  it('falls back on invalid input', () => {
    expect(normalizeLineAdxStrengthCrossLength(0, 10)).toBe(10);
    expect(normalizeLineAdxStrengthCrossLength(-1, 10)).toBe(10);
    expect(normalizeLineAdxStrengthCrossLength(NaN, 10)).toBe(10);
    expect(normalizeLineAdxStrengthCrossLength('5', 10)).toBe(10);
  });
});

describe('normalizeLineAdxStrengthCrossThreshold', () => {
  it('keeps values within [0, 100]', () => {
    expect(normalizeLineAdxStrengthCrossThreshold(25, 30)).toBe(25);
    expect(normalizeLineAdxStrengthCrossThreshold(0, 30)).toBe(0);
    expect(normalizeLineAdxStrengthCrossThreshold(100, 30)).toBe(100);
  });

  it('rejects out-of-range / non-finite', () => {
    expect(normalizeLineAdxStrengthCrossThreshold(-1, 30)).toBe(30);
    expect(normalizeLineAdxStrengthCrossThreshold(101, 30)).toBe(30);
    expect(normalizeLineAdxStrengthCrossThreshold(NaN, 30)).toBe(30);
  });
});

describe('applyLineAdxStrengthCrossWilder', () => {
  it('CONST values short-circuit to exact value', () => {
    const values = new Array(20).fill(5);
    const out = applyLineAdxStrengthCrossWilder(values, 14);
    expect(out.slice(0, 13)).toEqual(new Array(13).fill(null));
    for (let i = 13; i < 20; i += 1) {
      expect(out[i]).toBe(5);
    }
  });

  it('CONST zeros stay at +0 not -0', () => {
    const out = applyLineAdxStrengthCrossWilder(new Array(20).fill(0), 14);
    expect(Object.is(out[13], 0)).toBe(true);
    expect(Object.is(out[13], -0)).toBe(false);
  });

  it('returns all null when values shorter than length', () => {
    const out = applyLineAdxStrengthCrossWilder([1, 2, 3], 5);
    expect(out).toEqual([null, null, null]);
  });

  it('returns empty for empty input', () => {
    expect(applyLineAdxStrengthCrossWilder([], 5)).toEqual([]);
  });

  it('length < 1 yields all null', () => {
    expect(applyLineAdxStrengthCrossWilder([1, 2, 3], 0)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('Wilder recurrence v = 1 from CONST seed = 1', () => {
    // seed = 1, next: (1*13 + 2)/14 = 15/14 = 1.0714
    const out = applyLineAdxStrengthCrossWilder(
      [...new Array(14).fill(1), 2],
      14,
    );
    expect(out[13]).toBe(1);
    expect(out[14]).toBeCloseTo(15 / 14, 6);
  });
});

describe('computeLineAdxStrengthCross - CONST K bit-exact anchor', () => {
  it.each([0, 1, 42, 100, 1234])(
    'CONST close K=%d -> adx is exactly 0 from index 2*length-1 onward',
    (K) => {
      const data = mk(new Array(40).fill(K));
      const { adx } = computeLineAdxStrengthCross(data, { length: 14 });
      for (let i = 0; i < 27; i += 1) {
        expect(adx[i]).toBeNull();
      }
      for (let i = 27; i < 40; i += 1) {
        expect(adx[i]).toBe(0);
        expect(Object.is(adx[i], -0)).toBe(false);
      }
    },
  );

  it('CONST K adx is +0 not -0', () => {
    const data = mk(new Array(40).fill(7));
    const { adx } = computeLineAdxStrengthCross(data, { length: 14 });
    expect(Object.is(adx[27], 0)).toBe(true);
    expect(Object.is(adx[27], -0)).toBe(false);
  });
});

describe('computeLineAdxStrengthCross - LINEAR ramps', () => {
  it('LINEAR UP close=i (length=14) -> adx converges to 100', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const { adx } = computeLineAdxStrengthCross(data, { length: 14 });
    for (let i = 0; i < 27; i += 1) {
      expect(adx[i]).toBeNull();
    }
    for (let i = 27; i < 40; i += 1) {
      expect(adx[i]).toBe(100);
    }
  });

  it('LINEAR DOWN close=-i (length=14) -> adx converges to 100', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const { adx } = computeLineAdxStrengthCross(data, { length: 14 });
    for (let i = 27; i < 40; i += 1) {
      expect(adx[i]).toBe(100);
    }
  });
});

describe('computeLineAdxStrengthCross - choppy oscillation', () => {
  it('alternating up/down close yields low adx (no directional strength)', () => {
    const data = mk(
      Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 10 : 11)),
    );
    const { adx } = computeLineAdxStrengthCross(data, { length: 14 });
    // After many bars of alternation, +DI and -DI balance so ADX trends low
    // The Wilder smoothing decays toward 0 but with finite-length history
    // it lingers above 0 for a while; assert it sits well below the mild
    // threshold (25) and stays in the `weak` regime
    for (let i = 60; i < 100; i += 1) {
      const v = adx[i];
      expect(v).not.toBeNull();
      expect(v).toBeLessThan(25);
    }
  });
});

describe('classifyLineAdxStrengthCrossRegime', () => {
  it('null -> none', () => {
    expect(classifyLineAdxStrengthCrossRegime(null, 25, 50)).toBe('none');
  });

  it('adx < mildThreshold -> weak', () => {
    expect(classifyLineAdxStrengthCrossRegime(0, 25, 50)).toBe('weak');
    expect(classifyLineAdxStrengthCrossRegime(24.99, 25, 50)).toBe('weak');
  });

  it('adx at mildThreshold boundary -> strong', () => {
    expect(classifyLineAdxStrengthCrossRegime(25, 25, 50)).toBe('strong');
    expect(classifyLineAdxStrengthCrossRegime(40, 25, 50)).toBe('strong');
    expect(classifyLineAdxStrengthCrossRegime(49.99, 25, 50)).toBe('strong');
  });

  it('adx at strongThreshold boundary -> veryStrong', () => {
    expect(classifyLineAdxStrengthCrossRegime(50, 25, 50)).toBe('veryStrong');
    expect(classifyLineAdxStrengthCrossRegime(75, 25, 50)).toBe('veryStrong');
    expect(classifyLineAdxStrengthCrossRegime(100, 25, 50)).toBe('veryStrong');
  });
});

describe('detectLineAdxStrengthCrossCrosses', () => {
  it('fires mildEnter only when adx moves up through 25 but stays under 50', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const adx = [10, 20, 24, 30, 45];
    const crosses = detectLineAdxStrengthCrossCrosses(series, adx, 25, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'mildEnter' }]);
  });

  it('fires both mildEnter + strongEnter when adx jumps above 50 in one step', () => {
    const series = mk([1, 2, 3, 4]);
    const adx = [10, 10, 10, 80];
    const crosses = detectLineAdxStrengthCrossCrosses(series, adx, 25, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]).toEqual({ index: 3, x: 3, kind: 'mildEnter' });
    expect(crosses[1]).toEqual({ index: 3, x: 3, kind: 'strongEnter' });
  });

  it('fires mildExit only when adx moves down through 25 but stays above 0', () => {
    const series = mk([1, 2, 3, 4, 5]);
    const adx = [45, 35, 27, 20, 10];
    const crosses = detectLineAdxStrengthCrossCrosses(series, adx, 25, 50);
    expect(crosses).toEqual([{ index: 3, x: 3, kind: 'mildExit' }]);
  });

  it('fires both strongExit + mildExit when adx dives below 25 in one step', () => {
    const series = mk([1, 2, 3, 4]);
    const adx = [80, 80, 80, 10];
    const crosses = detectLineAdxStrengthCrossCrosses(series, adx, 25, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]).toEqual({ index: 3, x: 3, kind: 'strongExit' });
    expect(crosses[1]).toEqual({ index: 3, x: 3, kind: 'mildExit' });
  });

  it('emits enter then exit when adx rises then falls past 25', () => {
    const series = mk([1, 2, 3, 4]);
    const adx = [10, 30, 20, 5];
    const crosses = detectLineAdxStrengthCrossCrosses(series, adx, 25, 50);
    expect(crosses).toHaveLength(2);
    expect(crosses[0]!.kind).toBe('mildEnter');
    expect(crosses[1]!.kind).toBe('mildExit');
  });

  it('skips when prev or cur is null', () => {
    const series = mk([1, 2, 3]);
    const c1 = detectLineAdxStrengthCrossCrosses(
      series,
      [null, 20, 40],
      25,
      50,
    );
    expect(c1).toEqual([{ index: 2, x: 2, kind: 'mildEnter' }]);
    const c2 = detectLineAdxStrengthCrossCrosses(
      series,
      [10, null, 40],
      25,
      50,
    );
    expect(c2).toEqual([]);
  });

  it('boundary equality treated as not yet crossed (strict cur > T)', () => {
    const series = mk([1, 2]);
    expect(
      detectLineAdxStrengthCrossCrosses(series, [10, 25], 25, 50),
    ).toEqual([]);
  });

  it('no cross when adx stays inside one band region', () => {
    const series = mk([1, 2, 3, 4]);
    expect(
      detectLineAdxStrengthCrossCrosses(series, [10, 15, 20, 24], 25, 50),
    ).toEqual([]);
  });
});

describe('runLineAdxStrengthCross', () => {
  it('CONST K -> 0 crosses, all weak (after warmup) + initial nones', () => {
    const data = mk(new Array(40).fill(50));
    const run = runLineAdxStrengthCross(data, { length: 14 });
    expect(run.ok).toBe(true);
    expect(run.crosses).toHaveLength(0);
    expect(run.noneCount).toBe(27);
    expect(run.weakCount).toBe(13);
    expect(run.strongCount).toBe(0);
    expect(run.veryStrongCount).toBe(0);
  });

  it('LINEAR UP -> all veryStrong after warmup, 0 crosses (adx jumps null->100)', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const run = runLineAdxStrengthCross(data, { length: 14 });
    expect(run.crosses).toHaveLength(0);
    expect(run.veryStrongCount).toBe(13);
    expect(run.noneCount).toBe(27);
  });

  it('LINEAR DOWN -> all veryStrong after warmup', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => -i));
    const run = runLineAdxStrengthCross(data, { length: 14 });
    expect(run.veryStrongCount).toBe(13);
  });

  it('threshold normalization', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineAdxStrengthCross(data, {
      length: 14,
      mildThreshold: 999,
      strongThreshold: -5,
    });
    expect(run.mildThreshold).toBe(25);
    expect(run.strongThreshold).toBe(50);
  });

  it('respects custom thresholds', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineAdxStrengthCross(data, {
      length: 14,
      mildThreshold: 20,
      strongThreshold: 60,
    });
    expect(run.mildThreshold).toBe(20);
    expect(run.strongThreshold).toBe(60);
  });

  it('empty data -> ok=false', () => {
    const run = runLineAdxStrengthCross([], { length: 14 });
    expect(run.ok).toBe(false);
    expect(run.crosses).toEqual([]);
  });

  it('insufficient data -> ok=false', () => {
    const run = runLineAdxStrengthCross(mk([1, 2, 3]), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('sorts by x', () => {
    const data: ChartLineAdxStrengthCrossPoint[] = [
      { x: 3, close: 30 },
      { x: 1, close: 10 },
      { x: 2, close: 20 },
    ];
    const run = runLineAdxStrengthCross(data, { length: 1 });
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('samples carry index / x / close / adx / regime', () => {
    const data = mk(new Array(40).fill(10));
    const run = runLineAdxStrengthCross(data, { length: 14 });
    expect(run.samples).toHaveLength(40);
    for (let i = 0; i < 27; i += 1) {
      expect(run.samples[i]!.adx).toBeNull();
      expect(run.samples[i]!.regime).toBe('none');
    }
    for (let i = 27; i < 40; i += 1) {
      expect(run.samples[i]!.adx).toBe(0);
      expect(run.samples[i]!.regime).toBe('weak');
    }
  });

  it('hybrid trend-then-flat triggers natural ADX rise and fall', () => {
    // Trend up sharply for the first window, then go flat
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => i),
      ...new Array(30).fill(29),
    ];
    const run = runLineAdxStrengthCross(mk(closes), { length: 14 });
    expect(run.ok).toBe(true);
    // adx peaks above strongThreshold during trend
    const stableAdx = run.adxValues.filter((v): v is number => v != null);
    expect(stableAdx.length).toBeGreaterThan(0);
    expect(Math.max(...stableAdx)).toBeGreaterThan(50);
  });
});

describe('computeLineAdxStrengthCrossLayout', () => {
  it('default layout dimensions match defaults', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineAdxStrengthCrossLayout({ data });
    expect(layout.width).toBe(DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_WIDTH);
    expect(layout.height).toBe(DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_HEIGHT);
    expect(layout.padding).toBe(DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PADDING);
    expect(layout.panelGap).toBe(
      DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_PANEL_GAP,
    );
    expect(layout.innerLeft).toBe(layout.padding);
    expect(layout.innerRight).toBe(layout.width - layout.padding);
  });

  it('SVG y-axis: strongY at value 50 coincides with midY; mildY is below', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineAdxStrengthCrossLayout({ data });
    // higher osc value -> smaller y (top of panel)
    // strongThreshold = 50 = mid line, so strongY === midY
    expect(layout.strongY).toBe(layout.midY);
    // mildThreshold = 25 < 50 -> mildY is below strongY / midY
    expect(layout.midY).toBeLessThan(layout.mildY);
    expect(layout.strongY).toBeLessThan(layout.mildY);
  });

  it('empty data -> ok=false but band y values are still populated', () => {
    const layout = computeLineAdxStrengthCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
    expect(layout.adxPath).toBe('');
    expect(layout.crossMarkers).toEqual([]);
    expect(layout.mildY).toBeGreaterThan(layout.strongY);
  });

  it('osc fixed at 0..100', () => {
    const data = mk(new Array(40).fill(50));
    const layout = computeLineAdxStrengthCrossLayout({ data });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('path uses M then L commands with 2-decimal precision', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineAdxStrengthCrossLayout({ data });
    expect(layout.pricePath.startsWith('M ')).toBe(true);
    expect(layout.pricePath).toMatch(/^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
  });

  it('adx path skips null gaps with new M commands', () => {
    const data = mk(Array.from({ length: 40 }, (_, i) => i));
    const layout = computeLineAdxStrengthCrossLayout({ data, length: 14 });
    // first 27 are null
    expect(layout.adxPath.startsWith('M ')).toBe(true);
    const mCount = (layout.adxPath.match(/M /g) ?? []).length;
    expect(mCount).toBe(1);
  });

  it('handles single-point price (priceMin === priceMax) by inflating range', () => {
    const data = mk(new Array(40).fill(7));
    const layout = computeLineAdxStrengthCrossLayout({ data });
    expect(layout.priceMin).toBe(6);
    expect(layout.priceMax).toBe(8);
  });
});

describe('describeLineAdxStrengthCrossChart', () => {
  it('"No data" when empty', () => {
    expect(describeLineAdxStrengthCrossChart([])).toBe('No data');
  });

  it('describes bar count + parameters', () => {
    const data = mk(new Array(40).fill(50));
    const desc = describeLineAdxStrengthCrossChart(data);
    expect(desc).toContain('ADX Strength Cross chart');
    expect(desc).toContain('40 bars');
    expect(desc).toContain('length 14');
    expect(desc).toContain('mildThreshold 25');
    expect(desc).toContain('strongThreshold 50');
  });
});

describe('ChartLineAdxStrengthCross rendering', () => {
  it('renders region + role=img SVG + sr-only desc', () => {
    const data = mk(new Array(40).fill(10));
    const { container, getByRole } = render(
      <ChartLineAdxStrengthCross data={data} />,
    );
    const region = getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('ADX Strength Cross chart');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = container.querySelector(
      '[data-section="chart-line-adx-strength-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('ADX Strength Cross chart');
  });

  it('renders config badge with thresholds', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineAdxStrengthCross data={data} />);
    const badge = container.querySelector(
      '[data-section="chart-line-adx-strength-cross-badge"]',
    );
    expect(badge?.textContent).toContain('length 14');
    expect(badge?.textContent).toContain('thresholds 25/50');
  });

  it('renders legend toggles for price + adx', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineAdxStrengthCross data={data} />);
    const buttons = container.querySelectorAll('[data-series-id]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-series-id')).toBe('price');
    expect(buttons[1].getAttribute('data-series-id')).toBe('adx');
  });

  it('toggles series visibility via legend click', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineAdxStrengthCross data={data} />);
    const adxButton = container.querySelector('[data-series-id="adx"]');
    expect(adxButton?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(adxButton!);
    expect(adxButton?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(adxButton!);
    expect(adxButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('respects controlled hiddenSeries', () => {
    const data = mk(new Array(40).fill(10));
    const { container, rerender } = render(
      <ChartLineAdxStrengthCross data={data} hiddenSeries={['adx']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-adx-path"]',
      ),
    ).toBeNull();
    rerender(<ChartLineAdxStrengthCross data={data} hiddenSeries={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-adx-path"]',
      ),
    ).not.toBeNull();
  });

  it('fires onSeriesToggle on click', () => {
    const data = mk(new Array(40).fill(10));
    const events: Array<{ seriesId: string; hidden: boolean }> = [];
    const { container } = render(
      <ChartLineAdxStrengthCross
        data={data}
        onSeriesToggle={(e) => events.push(e)}
      />,
    );
    fireEvent.click(container.querySelector('[data-series-id="adx"]')!);
    expect(events).toEqual([{ seriesId: 'adx', hidden: true }]);
  });

  it('keyboard Enter / Space toggles legend', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineAdxStrengthCross data={data} />);
    const adxButton = container.querySelector(
      '[data-series-id="adx"]',
    ) as HTMLButtonElement;
    fireEvent.keyDown(adxButton, { key: 'Enter' });
    expect(adxButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(adxButton, { key: ' ' });
    expect(adxButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('empty data -> "No data" empty section', () => {
    const { container } = render(<ChartLineAdxStrengthCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('animate=false omits motion-safe class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineAdxStrengthCross data={data} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBeNull();
  });

  it('animate=true (default) applies motion-safe fade-in class', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineAdxStrengthCross data={data} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('motion-safe:animate-fade-in');
  });

  it('hover sets tooltip target', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineAdxStrengthCross data={data} />);
    const hovers = container.querySelectorAll(
      '[data-section="chart-line-adx-strength-cross-hover"]',
    );
    expect(hovers.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(hovers[0]!);
    const tooltip = container.querySelector(
      '[data-section="chart-line-adx-strength-cross-tooltip"]',
    );
    expect(tooltip).not.toBeNull();
    fireEvent.mouseLeave(hovers[0]!);
  });

  it('renders both mild + strong reference bands by default', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineAdxStrengthCross data={data} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-band-mild"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-band-strong"]',
      ),
    ).not.toBeNull();
  });

  it('showBands=false hides band group', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineAdxStrengthCross data={data} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('showAxis=false / showGrid=false / showLegend=false', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(
      <ChartLineAdxStrengthCross
        data={data}
        showAxis={false}
        showGrid={false}
        showLegend={false}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-axes"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-grid"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-legend"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-strength-cross-badge"]',
      ),
    ).toBeNull();
  });

  it('data-* attrs reflect run counters', () => {
    const data = mk(new Array(40).fill(10));
    const { container } = render(<ChartLineAdxStrengthCross data={data} />);
    const region = container.querySelector(
      '[data-section="chart-line-adx-strength-cross"]',
    );
    expect(region?.getAttribute('data-length')).toBe('14');
    expect(region?.getAttribute('data-mild-threshold')).toBe('25');
    expect(region?.getAttribute('data-strong-threshold')).toBe('50');
    expect(region?.getAttribute('data-cross-count')).toBe('0');
    expect(region?.getAttribute('data-weak-count')).toBe('13');
  });

  it('defaults: length=14, mildThreshold=25, strongThreshold=50', () => {
    expect(DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_LENGTH).toBe(14);
    expect(DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_MILD_THRESHOLD).toBe(25);
    expect(DEFAULT_CHART_LINE_ADX_STRENGTH_CROSS_STRONG_THRESHOLD).toBe(50);
  });

  it('forwardRef returns the wrapping div', () => {
    const data = mk(new Array(40).fill(10));
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineAdxStrengthCross data={data} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-adx-strength-cross',
    );
  });

  it('layout is deterministic across calls for default CONST 40 bars', () => {
    const data = mk(new Array(40).fill(10));
    const a = computeLineAdxStrengthCrossLayout({ data });
    const b = computeLineAdxStrengthCrossLayout({ data });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.adxPath).toBe(b.adxPath);
    expect(a.mildY).toBe(b.mildY);
    expect(a.strongY).toBe(b.strongY);
    expect(a.midY).toBe(b.midY);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });

  it('layout is deterministic across calls for hybrid trend-then-flat', () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => i),
      ...new Array(30).fill(29),
    ];
    const data = mk(closes);
    const a = computeLineAdxStrengthCrossLayout({ data, length: 14 });
    const b = computeLineAdxStrengthCrossLayout({ data, length: 14 });
    expect(a.pricePath).toBe(b.pricePath);
    expect(a.adxPath).toBe(b.adxPath);
    expect(a.run.adxValues).toEqual(b.run.adxValues);
    expect(a.run.crosses).toEqual(b.run.crosses);
  });
});
