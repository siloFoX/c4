import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineInstantaneousTrend,
  type ChartLineInstantaneousTrendPoint,
  type ChartLineInstantaneousTrendSample,
  DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_ALPHA,
  CHART_LINE_INSTANTANEOUS_TREND_WARMUP,
  getLineInstantaneousTrendFinitePoints,
  normalizeLineInstantaneousTrendAlpha,
  computeLineInstantaneousTrendCoefficients,
  computeLineInstantaneousTrend,
  classifyLineInstantaneousTrendZone,
  runLineInstantaneousTrend,
  computeLineInstantaneousTrendLayout,
  describeLineInstantaneousTrendChart,
} from './chart-line-instantaneous-trend';

/**
 * Six bars, all inside the seven-bar warm-up, so the trendline is the
 * alpha-independent averaging seed. The rise-then-fall shape exercises
 * every zone: itrend [40,42,44,46,44,40], trigger [-,-,48,50,44,34],
 * zones [none,none,up,up,flat,down].
 */
const MIXED_DATA: ChartLineInstantaneousTrendPoint[] = [
  40, 44, 48, 44, 40, 36,
].map((value, i) => ({ x: i, value }));

const MIXED_VALUES: number[] = MIXED_DATA.map((p) => p.value);

/** Six constant bars: the trendline reproduces the constant exactly. */
const CONST_DATA: ChartLineInstantaneousTrendPoint[] = Array.from(
  { length: 6 },
  (_, i) => ({ x: i, value: 50 }),
);

/** Ten constant bars: long enough to exercise the recursive region. */
const CONST10_VALUES: number[] = Array.from({ length: 10 }, () => 50);

/** Fourteen varying bars: long enough to drive the recursive formula. */
const WAVE_DATA: ChartLineInstantaneousTrendPoint[] = [
  50, 53, 57, 60, 58, 54, 49, 46, 48, 52, 57, 60, 58, 53,
].map((value, i) => ({ x: i, value }));

const WAVE_VALUES: number[] = WAVE_DATA.map((p) => p.value);

const OPTS = { alpha: 0.07 };

describe('getLineInstantaneousTrendFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineInstantaneousTrendFinitePoints(null)).toEqual([]);
    expect(
      getLineInstantaneousTrendFinitePoints(
        undefined as unknown as ChartLineInstantaneousTrendPoint[],
      ),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineInstantaneousTrendFinitePoints([])).toEqual([]);
  });

  it('drops points with a non-finite x or value', () => {
    const dirty = [
      { x: 0, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 2, value: Number.POSITIVE_INFINITY },
      { x: 3, value: 30 },
    ] as ChartLineInstantaneousTrendPoint[];
    expect(getLineInstantaneousTrendFinitePoints(dirty)).toEqual([
      { x: 0, value: 10 },
      { x: 3, value: 30 },
    ]);
  });

  it('preserves the input order', () => {
    const out = getLineInstantaneousTrendFinitePoints([
      { x: 5, value: 1 },
      { x: 2, value: 2 },
      { x: 9, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineInstantaneousTrendAlpha', () => {
  it('keeps an alpha inside the open unit interval', () => {
    expect(normalizeLineInstantaneousTrendAlpha(0.07, 0.5)).toBe(0.07);
  });

  it('falls back for a zero alpha', () => {
    expect(normalizeLineInstantaneousTrendAlpha(0, 0.07)).toBe(0.07);
  });

  it('falls back for an alpha of one or above', () => {
    expect(normalizeLineInstantaneousTrendAlpha(1, 0.07)).toBe(0.07);
    expect(normalizeLineInstantaneousTrendAlpha(2, 0.07)).toBe(0.07);
  });

  it('falls back for a negative alpha', () => {
    expect(normalizeLineInstantaneousTrendAlpha(-0.2, 0.07)).toBe(0.07);
  });

  it('falls back for a non-finite alpha', () => {
    expect(normalizeLineInstantaneousTrendAlpha(Number.NaN, 0.07)).toBe(0.07);
  });
});

describe('computeLineInstantaneousTrendCoefficients', () => {
  it('returns finite c1 through c5', () => {
    const c = computeLineInstantaneousTrendCoefficients(0.07);
    expect(Number.isFinite(c.c1)).toBe(true);
    expect(Number.isFinite(c.c2)).toBe(true);
    expect(Number.isFinite(c.c3)).toBe(true);
    expect(Number.isFinite(c.c4)).toBe(true);
    expect(Number.isFinite(c.c5)).toBe(true);
  });

  it('matches the price-side coefficient identities', () => {
    const c = computeLineInstantaneousTrendCoefficients(0.07);
    expect(c.c1).toBe(0.07 - (0.07 * 0.07) / 4);
    expect(c.c2).toBe((0.07 * 0.07) / 2);
    expect(c.c3).toBe(0.07 - 0.75 * 0.07 * 0.07);
  });

  it('matches the feedback coefficient identities', () => {
    const c = computeLineInstantaneousTrendCoefficients(0.07);
    expect(c.c4).toBe(2 * (1 - 0.07));
    expect(c.c5).toBe((1 - 0.07) * (1 - 0.07));
  });

  it('collapses the price-side weights to alpha squared', () => {
    const c = computeLineInstantaneousTrendCoefficients(0.07);
    expect(c.c1 + c.c2 - c.c3).toBeCloseTo(0.07 * 0.07);
  });

  it('sums all weights to one so a constant is preserved', () => {
    const c = computeLineInstantaneousTrendCoefficients(0.07);
    expect(c.c1 + c.c2 - c.c3 + (c.c4 - c.c5)).toBeCloseTo(1);
  });

  it('responds to alpha', () => {
    const a = computeLineInstantaneousTrendCoefficients(0.07);
    const b = computeLineInstantaneousTrendCoefficients(0.3);
    expect(a.c4).not.toBe(b.c4);
  });
});

describe('computeLineInstantaneousTrend', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineInstantaneousTrend(null, 0.07)).toEqual({
      itrend: [],
      trigger: [],
    });
  });

  it('returns empty arrays for an empty input', () => {
    expect(computeLineInstantaneousTrend([], 0.07)).toEqual({
      itrend: [],
      trigger: [],
    });
  });

  it('matches the input length on both arrays', () => {
    const out = computeLineInstantaneousTrend(WAVE_VALUES, 0.07);
    expect(out.itrend).toHaveLength(WAVE_VALUES.length);
    expect(out.trigger).toHaveLength(WAVE_VALUES.length);
  });

  it('seeds the first bar with the price', () => {
    const out = computeLineInstantaneousTrend(MIXED_VALUES, 0.07);
    expect(out.itrend[0]).toBe(40);
  });

  it('seeds the second bar with the midpoint of the first two prices', () => {
    const out = computeLineInstantaneousTrend(MIXED_VALUES, 0.07);
    expect(out.itrend[1]).toBe(42);
  });

  it('computes the exact warm-up seed for an integer fixture', () => {
    const out = computeLineInstantaneousTrend(MIXED_VALUES, 0.07);
    expect(out.itrend).toEqual([40, 42, 44, 46, 44, 40]);
  });

  it('extrapolates the trigger two bars off the trendline', () => {
    const out = computeLineInstantaneousTrend(MIXED_VALUES, 0.07);
    expect(out.trigger).toEqual([null, null, 48, 50, 44, 34]);
  });

  it('leaves the warm-up region independent of alpha', () => {
    const a = computeLineInstantaneousTrend(MIXED_VALUES, 0.07);
    const b = computeLineInstantaneousTrend(MIXED_VALUES, 0.5);
    expect(a.itrend).toEqual(b.itrend);
  });

  it('reproduces a constant series through the recursive region', () => {
    const out = computeLineInstantaneousTrend(CONST10_VALUES, 0.07);
    expect(out.itrend).toHaveLength(10);
    for (const v of out.itrend) {
      expect(v).toBeCloseTo(50, 6);
    }
  });

  it('keeps every trendline reading finite past the warm-up', () => {
    const out = computeLineInstantaneousTrend(WAVE_VALUES, 0.07);
    expect(WAVE_VALUES.length).toBeGreaterThan(
      CHART_LINE_INSTANTANEOUS_TREND_WARMUP,
    );
    expect(out.itrend.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('responds to alpha in the recursive region', () => {
    const a = computeLineInstantaneousTrend(WAVE_VALUES, 0.07);
    const b = computeLineInstantaneousTrend(WAVE_VALUES, 0.3);
    expect(a.itrend).not.toEqual(b.itrend);
  });
});

describe('classifyLineInstantaneousTrendZone', () => {
  it('classifies a trigger above the trendline as up', () => {
    expect(classifyLineInstantaneousTrendZone(44, 48)).toBe('up');
  });

  it('classifies a trigger below the trendline as down', () => {
    expect(classifyLineInstantaneousTrendZone(48, 44)).toBe('down');
  });

  it('classifies a trigger level with the trendline as flat', () => {
    expect(classifyLineInstantaneousTrendZone(50, 50)).toBe('flat');
  });

  it('classifies a null trendline as none', () => {
    expect(classifyLineInstantaneousTrendZone(null, 50)).toBe('none');
  });

  it('classifies a null trigger as none', () => {
    expect(classifyLineInstantaneousTrendZone(50, null)).toBe('none');
  });

  it('classifies a non-finite reading as none', () => {
    expect(classifyLineInstantaneousTrendZone(Number.NaN, 50)).toBe('none');
  });
});

describe('runLineInstantaneousTrend', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineInstantaneousTrend([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineInstantaneousTrend([]).ok).toBe(false);
    expect(runLineInstantaneousTrend(null).ok).toBe(false);
  });

  it('is ok for a series of at least two points', () => {
    expect(runLineInstantaneousTrend(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default alpha when none is given', () => {
    expect(runLineInstantaneousTrend(WAVE_DATA).alpha).toBe(
      DEFAULT_CHART_LINE_INSTANTANEOUS_TREND_ALPHA,
    );
  });

  it('honours a custom alpha', () => {
    expect(runLineInstantaneousTrend(WAVE_DATA, { alpha: 0.2 }).alpha).toBe(
      0.2,
    );
  });

  it('classifies the mixed fixture zones', () => {
    const run = runLineInstantaneousTrend(MIXED_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual([
      'none',
      'none',
      'up',
      'up',
      'flat',
      'down',
    ]);
  });

  it('counts the mixed fixture zones', () => {
    const run = runLineInstantaneousTrend(MIXED_DATA, OPTS);
    expect(run.upCount).toBe(2);
    expect(run.downCount).toBe(1);
    expect(run.flatCount).toBe(1);
  });

  it('holds a constant series flat after the warm-up seed', () => {
    const run = runLineInstantaneousTrend(CONST_DATA, OPTS);
    expect(run.flatCount).toBe(4);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineInstantaneousTrend(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.zone);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineInstantaneousTrend(WAVE_DATA, OPTS);
    const noneCount = run.samples.filter((s) => s.zone === 'none').length;
    expect(run.upCount + run.downCount + run.flatCount + noneCount).toBe(
      run.series.length,
    );
  });

  it('marks the first two bars none while the trigger warms up', () => {
    const run = runLineInstantaneousTrend(WAVE_DATA, OPTS);
    expect(run.samples[0]?.zone).toBe('none');
    expect(run.samples[1]?.zone).toBe('none');
  });

  it('carries the trendline and trigger on each sample', () => {
    const run = runLineInstantaneousTrend(MIXED_DATA, OPTS);
    expect(run.samples.map((s) => s.itrend)).toEqual([
      40, 42, 44, 46, 44, 40,
    ]);
    expect(run.samples.map((s) => s.trigger)).toEqual([
      null,
      null,
      48,
      50,
      44,
      34,
    ]);
  });

  it('emits one sample per point', () => {
    const run = runLineInstantaneousTrend(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('carries finite filter coefficients', () => {
    const run = runLineInstantaneousTrend(WAVE_DATA, OPTS);
    expect(Number.isFinite(run.c1)).toBe(true);
    expect(Number.isFinite(run.c4)).toBe(true);
    expect(Number.isFinite(run.c5)).toBe(true);
  });

  it('carries the trendline and trigger arrays', () => {
    const run = runLineInstantaneousTrend(WAVE_DATA, OPTS);
    expect(run.itrend).toHaveLength(run.samples.length);
    expect(run.trigger).toHaveLength(run.samples.length);
  });

  it('sorts the series by x', () => {
    const run = runLineInstantaneousTrend(
      [
        { x: 3, value: 30 },
        { x: 1, value: 10 },
        { x: 2, value: 20 },
      ],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final trendline reading', () => {
    const run = runLineInstantaneousTrend(MIXED_DATA, OPTS);
    expect(run.itrendFinal).toBe(40);
  });
});

describe('computeLineInstantaneousTrendLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineInstantaneousTrendLayout({
      data: [{ x: 0, value: 1 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineInstantaneousTrendLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineInstantaneousTrendLayout({
      data: WAVE_DATA,
      ...OPTS,
    });
    expect(layout.ok).toBe(true);
  });

  it('builds a price path, a trendline path and a trigger path', () => {
    const layout = computeLineInstantaneousTrendLayout({
      data: WAVE_DATA,
      ...OPTS,
    });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.itrendPath.length).toBeGreaterThan(0);
    expect(layout.triggerPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineInstantaneousTrendLayout({
      data: WAVE_DATA,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per bar', () => {
    const layout = computeLineInstantaneousTrendLayout({
      data: WAVE_DATA,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(WAVE_DATA.length);
  });

  it('spans the value domain over the price and the trendline', () => {
    const layout = computeLineInstantaneousTrendLayout({
      data: WAVE_DATA,
      ...OPTS,
    });
    const prices = WAVE_DATA.map((p) => p.value);
    expect(layout.valueMin).toBeLessThanOrEqual(Math.min(...prices));
    expect(layout.valueMax).toBeGreaterThanOrEqual(Math.max(...prices));
  });

  it('carries the run', () => {
    const layout = computeLineInstantaneousTrendLayout({
      data: WAVE_DATA,
      ...OPTS,
    });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineInstantaneousTrendChart', () => {
  it('names the Ehlers Instantaneous Trendline', () => {
    expect(describeLineInstantaneousTrendChart(WAVE_DATA, OPTS)).toContain(
      'Ehlers Instantaneous Trendline',
    );
  });

  it('mentions the low-lag character', () => {
    expect(describeLineInstantaneousTrendChart(WAVE_DATA, OPTS)).toContain(
      'low-lag',
    );
  });

  it('mentions the recursive smoother', () => {
    expect(describeLineInstantaneousTrendChart(WAVE_DATA, OPTS)).toContain(
      'recursive smoother',
    );
  });

  it('reports the zone counts', () => {
    const run = runLineInstantaneousTrend(WAVE_DATA, OPTS);
    const text = describeLineInstantaneousTrendChart(WAVE_DATA, OPTS);
    expect(text).toContain(`rising on ${run.upCount}`);
    expect(text).toContain(`falling on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineInstantaneousTrendChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineInstantaneousTrend />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain(
      'Instantaneous Trendline',
    );
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-instantaneous-trend-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ehlers Instantaneous Trendline');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend data={[]} {...OPTS} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-instantaneous-trend-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the alpha and point count on the root', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-instantaneous-trend"]',
    );
    expect(root?.getAttribute('data-alpha')).toBe('0.07');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-instantaneous-trend-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price, trendline and trigger lines', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-instantaneous-trend-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-instantaneous-trend-itrend-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-instantaneous-trend-trigger-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one marker per bar', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-instantaneous-trend-marker"]',
    );
    expect(markers).toHaveLength(WAVE_DATA.length);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-instantaneous-trend-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-instantaneous-trend-badge-config"]',
    );
    expect(badge?.textContent).toBe('ITrend 0.07');
  });

  it('hides the trendline when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend
        data={WAVE_DATA}
        {...OPTS}
        hiddenSeries={['itrend']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-instantaneous-trend-itrend-line"]',
      ),
    ).toBeNull();
  });

  it('hides the trigger line when showTrigger is false', () => {
    const { container } = render(
      <ChartLineInstantaneousTrend
        data={WAVE_DATA}
        {...OPTS}
        showTrigger={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-instantaneous-trend-trigger-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineInstantaneousTrend
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-instantaneous-trend-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineInstantaneousTrendSample;
    };
    expect(detail.point.index).toBe(0);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineInstantaneousTrend ref={ref} data={WAVE_DATA} {...OPTS} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-instantaneous-trend',
    );
  });
});
