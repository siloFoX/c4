import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineVolatilityStop,
  DEFAULT_CHART_LINE_VOLATILITY_STOP_MULTIPLIER,
  DEFAULT_CHART_LINE_VOLATILITY_STOP_PERIOD,
  computeLineVolatilityStop,
  computeLineVolatilityStopATR,
  computeLineVolatilityStopLayout,
  computeLineVolatilityStopTrueRange,
  describeLineVolatilityStopChart,
  getLineVolatilityStopFinitePoints,
  normalizeLineVolatilityStopMultiplier,
  normalizeLineVolatilityStopPeriod,
  runLineVolatilityStop,
  type ChartLineVolatilityStopPoint,
} from './chart-line-volatility-stop';

const toBars = (values: number[]): ChartLineVolatilityStopPoint[] =>
  values.map((v, i) => ({ x: i, high: v, low: v, close: v }));

const CONST_FLAT: ChartLineVolatilityStopPoint[] = toBars([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);
const RISING: ChartLineVolatilityStopPoint[] = toBars([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);
const FALLING: ChartLineVolatilityStopPoint[] = toBars([
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
]);
const WAVE: ChartLineVolatilityStopPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const value = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: value + 1, low: value - 1, close: value };
  },
);

const OPTS = { period: 3, multiplier: 2 } as const;

describe('getLineVolatilityStopFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineVolatilityStopFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineVolatilityStopFinitePoints(
        'nope' as unknown as ChartLineVolatilityStopPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x, high, low, or close', () => {
    const points: ChartLineVolatilityStopPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: Number.NaN, high: 1, low: 1, close: 1 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 1, close: 1 },
      { x: 2, high: 1, low: Number.NaN, close: 1 },
      { x: 3, high: 1, low: 1, close: Number.NaN },
      { x: 4, high: 5, low: 4, close: 4.5 },
    ];
    const out = getLineVolatilityStopFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 4]);
  });

  it('preserves input order', () => {
    const finite = getLineVolatilityStopFinitePoints(RISING.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...RISING].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineVolatilityStopPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineVolatilityStopPeriod(10, 10)).toBe(10);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineVolatilityStopPeriod(10.9, 10)).toBe(10);
  });

  it('falls back for a sub-2 period', () => {
    expect(normalizeLineVolatilityStopPeriod(1, 10)).toBe(10);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineVolatilityStopPeriod(Number.NaN, 10)).toBe(10);
  });
});

describe('normalizeLineVolatilityStopMultiplier', () => {
  it('keeps a positive multiplier', () => {
    expect(normalizeLineVolatilityStopMultiplier(2.5, 3)).toBe(2.5);
  });

  it('falls back for zero', () => {
    expect(normalizeLineVolatilityStopMultiplier(0, 3)).toBe(3);
  });

  it('falls back for negative', () => {
    expect(normalizeLineVolatilityStopMultiplier(-1, 3)).toBe(3);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineVolatilityStopMultiplier(Number.NaN, 3)).toBe(3);
  });
});

describe('computeLineVolatilityStopTrueRange', () => {
  it('returns high - low for the first bar (no previous)', () => {
    expect(
      computeLineVolatilityStopTrueRange(
        { x: 0, high: 12, low: 10, close: 11 },
        null,
      ),
    ).toBe(2);
  });

  it('returns max of three candidates against the previous close', () => {
    const prev: ChartLineVolatilityStopPoint = {
      x: 0,
      high: 10,
      low: 8,
      close: 9,
    };
    const curr: ChartLineVolatilityStopPoint = {
      x: 1,
      high: 14,
      low: 11,
      close: 13,
    };
    // high - low = 3; |high - prev_close| = 5; |low - prev_close| = 2.
    // max = 5.
    expect(computeLineVolatilityStopTrueRange(curr, prev)).toBe(5);
  });

  it('handles a gap-down bar correctly', () => {
    const prev: ChartLineVolatilityStopPoint = {
      x: 0,
      high: 10,
      low: 9,
      close: 10,
    };
    const curr: ChartLineVolatilityStopPoint = {
      x: 1,
      high: 7,
      low: 5,
      close: 6,
    };
    // high - low = 2; |high - prev_close| = 3; |low - prev_close| = 5.
    // max = 5.
    expect(computeLineVolatilityStopTrueRange(curr, prev)).toBe(5);
  });

  it('returns zero on a flat bar with no previous', () => {
    expect(
      computeLineVolatilityStopTrueRange(
        { x: 0, high: 5, low: 5, close: 5 },
        null,
      ),
    ).toBe(0);
  });
});

describe('computeLineVolatilityStopATR', () => {
  it('returns an empty list for non-array or empty input', () => {
    expect(computeLineVolatilityStopATR(null, 10)).toEqual([]);
    expect(computeLineVolatilityStopATR([], 10)).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineVolatilityStopATR(RISING, 3);
    expect(out).toHaveLength(RISING.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineVolatilityStopATR(RISING, 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
  });

  it('zero true range across a constant series produces zero ATR (bit-exact)', () => {
    const out = computeLineVolatilityStopATR(CONST_FLAT, 3);
    for (let i = 2; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('matches the worked initial ATR seed for the rising fixture (period 3)', () => {
    // RISING [1..10] with high=low=close=v: TR[0]=0, TR[1]=1, TR[2]=1.
    // ATR[2] = (0 + 1 + 1) / 3 = 2/3.
    const out = computeLineVolatilityStopATR(RISING, 3);
    expect(out[2]!).toBeCloseTo(2 / 3, 12);
  });

  it('Wilder smoothing converges toward the unit TR on a unit-step rising series', () => {
    const out = computeLineVolatilityStopATR(
      Array.from({ length: 60 }, (_, i) => ({
        x: i,
        high: i,
        low: i,
        close: i,
      })),
      10,
    );
    const last = out[out.length - 1]!;
    expect(last).toBeCloseTo(1, 2);
  });
});

describe('computeLineVolatilityStop', () => {
  it('returns an empty list for non-array', () => {
    expect(computeLineVolatilityStop(null, 3, 2)).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineVolatilityStop(RISING, 3, 2);
    expect(out).toHaveLength(RISING.length);
  });

  it('leaves the warm-up bars in the "none" position', () => {
    const out = computeLineVolatilityStop(RISING, 3, 2);
    expect(out[0]!.position).toBe('none');
    expect(out[0]!.stop).toBeNull();
    expect(out[1]!.position).toBe('none');
  });

  it('initialises to long at the first defined bar', () => {
    const out = computeLineVolatilityStop(RISING, 3, 2);
    expect(out[2]!.position).toBe('long');
    expect(out[2]!.flip).toBe(false);
  });

  it('a rising series stays long throughout (no flips)', () => {
    const out = computeLineVolatilityStop(RISING, 3, 2);
    let flips = 0;
    for (const bar of out) if (bar.flip) flips += 1;
    expect(flips).toBe(0);
    for (let i = 2; i < out.length; i += 1) {
      expect(out[i]!.position).toBe('long');
    }
  });

  it('a falling series flips long->short exactly once at bar 4 (the worked anchor)', () => {
    // FALLING [10..1] with high=low=close=v, period=3, multiplier=2.
    // Worked: bar 2 init long; bar 3 close 7 > stop 20/3 stay long;
    // bar 4 close 6 < stop 20/3 -> FLIP to short.
    const out = computeLineVolatilityStop(FALLING, 3, 2);
    let flips = 0;
    let flipBar = -1;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i]!.flip) {
        flips += 1;
        flipBar = i;
      }
    }
    expect(flips).toBe(1);
    expect(flipBar).toBe(4);
    expect(out[4]!.position).toBe('short');
    for (let i = 5; i < out.length; i += 1) {
      expect(out[i]!.position).toBe('short');
    }
  });

  it('a constant series with zero TR never flips (stop == close, no strict cross)', () => {
    const out = computeLineVolatilityStop(CONST_FLAT, 3, 2);
    let flips = 0;
    for (const bar of out) if (bar.flip) flips += 1;
    expect(flips).toBe(0);
    for (let i = 2; i < out.length; i += 1) {
      expect(out[i]!.position).toBe('long');
      expect(out[i]!.stop).toBe(5);
    }
  });

  it('the worked initial long stop on the falling fixture (8 - 2 * 2/3 = 20/3)', () => {
    const out = computeLineVolatilityStop(FALLING, 3, 2);
    expect(out[2]!.position).toBe('long');
    expect(out[2]!.stop!).toBeCloseTo(20 / 3, 12);
  });

  it('the stop trails monotonically up while long (never decreases until a flip)', () => {
    const out = computeLineVolatilityStop(RISING, 3, 2);
    let prevStop: number | null = null;
    for (let i = 2; i < out.length; i += 1) {
      const stop = out[i]!.stop!;
      if (prevStop !== null) {
        expect(stop).toBeGreaterThanOrEqual(prevStop);
      }
      prevStop = stop;
    }
  });

  it('the stop trails monotonically down while short (never increases between flips)', () => {
    const out = computeLineVolatilityStop(FALLING, 3, 2);
    let prevStop: number | null = null;
    for (let i = 4; i < out.length; i += 1) {
      // bar 4 is the flip, so the trail-down starts there.
      const stop = out[i]!.stop!;
      if (prevStop !== null) {
        expect(stop).toBeLessThanOrEqual(prevStop);
      }
      prevStop = stop;
    }
  });
});

describe('runLineVolatilityStop', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      runLineVolatilityStop(
        [{ x: 0, high: 1, low: 1, close: 1 }],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineVolatilityStop([]).ok).toBe(false);
    expect(runLineVolatilityStop(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineVolatilityStop(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period and multiplier', () => {
    const run = runLineVolatilityStop(RISING);
    expect(run.period).toBe(DEFAULT_CHART_LINE_VOLATILITY_STOP_PERIOD);
    expect(run.multiplier).toBe(DEFAULT_CHART_LINE_VOLATILITY_STOP_MULTIPLIER);
  });

  it('honours custom options', () => {
    const run = runLineVolatilityStop(RISING, { period: 5, multiplier: 1.5 });
    expect(run.period).toBe(5);
    expect(run.multiplier).toBe(1.5);
  });

  it('counts a rising series as 8 long bars and 0 flips (period 3, 10 bars)', () => {
    const run = runLineVolatilityStop(RISING, OPTS);
    expect(run.longCount).toBe(8);
    expect(run.shortCount).toBe(0);
    expect(run.flipCount).toBe(0);
  });

  it('counts a falling series as 2 long bars, 6 short bars and 1 flip (the worked anchor)', () => {
    const run = runLineVolatilityStop(FALLING, OPTS);
    expect(run.longCount).toBe(2);
    expect(run.shortCount).toBe(6);
    expect(run.flipCount).toBe(1);
  });

  it('counts a constant series as 8 long bars and 0 flips', () => {
    const run = runLineVolatilityStop(CONST_FLAT, OPTS);
    expect(run.longCount).toBe(8);
    expect(run.shortCount).toBe(0);
    expect(run.flipCount).toBe(0);
  });

  it('self-consistent position counts equal sample length', () => {
    const run = runLineVolatilityStop(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.position === 'none') none += 1;
    }
    expect(run.longCount + run.shortCount + none).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLineVolatilityStop(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineVolatilityStop(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final stop and final position', () => {
    const run = runLineVolatilityStop(RISING, OPTS);
    expect(run.positionFinal).toBe('long');
    expect(Number.isFinite(run.stopFinal!)).toBe(true);
  });

  it('exposes the final position as short after a flip on the falling fixture', () => {
    const run = runLineVolatilityStop(FALLING, OPTS);
    expect(run.positionFinal).toBe('short');
  });
});

describe('computeLineVolatilityStopLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLineVolatilityStopLayout({
        data: [{ x: 0, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLineVolatilityStopLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineVolatilityStopLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineVolatilityStopLayout({ data: RISING, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineVolatilityStopLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined-position bar', () => {
    const layout = computeLineVolatilityStopLayout({ data: RISING, ...OPTS });
    // RISING period 3 -> defined at bars 2..9 -> 8 markers.
    expect(layout.markers).toHaveLength(8);
  });

  it('the value domain covers the close range', () => {
    const layout = computeLineVolatilityStopLayout({ data: RISING, ...OPTS });
    expect(layout.valueMin).toBeLessThanOrEqual(1);
    expect(layout.valueMax).toBeGreaterThanOrEqual(10);
  });

  it('the stop segments respect the position runs (no segment across a flip)', () => {
    const layout = computeLineVolatilityStopLayout({ data: FALLING, ...OPTS });
    // 2 long bars (2..3), one flip at bar 4, 6 short bars (4..9).
    // Segments: 1 within the long run (3->2) + 5 within the short run (5..9 vs 4..8).
    // The flip break removes the long->short connecting segment.
    expect(layout.segments.length).toBe(6);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineVolatilityStopLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineVolatilityStopLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(3);
    expect(layout.run.multiplier).toBe(2);
  });
});

describe('describeLineVolatilityStopChart', () => {
  it('names the indicator', () => {
    expect(describeLineVolatilityStopChart(RISING, OPTS)).toContain(
      'Volatility Stop',
    );
  });

  it('mentions the period and multiplier', () => {
    const text = describeLineVolatilityStopChart(RISING, OPTS);
    expect(text).toContain('period 3');
    expect(text).toContain('multiplier 2');
  });

  it('mentions the trailing stop behaviour', () => {
    expect(describeLineVolatilityStopChart(RISING, OPTS)).toContain(
      'trails',
    );
  });

  it('mentions the flip count', () => {
    expect(describeLineVolatilityStopChart(FALLING, OPTS)).toContain(
      'flips 1 times',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineVolatilityStopChart([])).toBe('No data');
    expect(describeLineVolatilityStopChart(null)).toBe('No data');
  });
});

describe('<ChartLineVolatilityStop />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineVolatilityStop
        data={RISING}
        period={3}
        multiplier={2}
      />,
    );
    expect(
      screen.getByRole('region', { name: /Volatility Stop chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={RISING}
        period={3}
        multiplier={2}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-volatility-stop-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Volatility Stop');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineVolatilityStop data={[]} period={3} multiplier={2} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-stop-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors period, multiplier and final position on the root', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={FALLING}
        period={3}
        multiplier={2}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volatility-stop"]',
    );
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-multiplier')).toBe('2');
    expect(root?.getAttribute('data-position-final')).toBe('short');
    expect(root?.getAttribute('data-flip-count')).toBe('1');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={RISING}
        period={3}
        multiplier={2}
      />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={RISING}
        period={3}
        multiplier={2}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-stop-price-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders markers for the defined-position bars', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={RISING}
        period={3}
        multiplier={2}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-volatility-stop-marker"]',
    );
    expect(markers.length).toBe(8);
  });

  it('marks every marker with a valid position', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={FALLING}
        period={3}
        multiplier={2}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-volatility-stop-marker"]',
    );
    for (const m of markers) {
      const position = m.getAttribute('data-position');
      expect(['long', 'short']).toContain(position);
    }
  });

  it('flags the flip marker via data-flip', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={FALLING}
        period={3}
        multiplier={2}
      />,
    );
    const flipMarkers = container.querySelectorAll(
      '[data-section="chart-line-volatility-stop-marker"][data-flip="true"]',
    );
    expect(flipMarkers.length).toBe(1);
  });

  it('renders the config badge with the period and multiplier', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={RISING}
        period={3}
        multiplier={2}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-volatility-stop-badge-config"]',
    );
    expect(badge?.textContent).toContain('VSTOP 3/2');
  });

  it('hides the stop via the legend toggle', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={RISING}
        period={3}
        multiplier={2}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-volatility-stop-legend-item"][data-series-id="stop"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-stop-segments"]',
      ),
    ).toBeNull();
  });

  it('hides the stop via showStop=false', () => {
    const { container } = render(
      <ChartLineVolatilityStop
        data={RISING}
        period={3}
        multiplier={2}
        showStop={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-stop-segments"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineVolatilityStop
        data={RISING}
        period={3}
        multiplier={2}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-volatility-stop-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineVolatilityStop
        ref={ref}
        data={RISING}
        period={3}
        multiplier={2}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
