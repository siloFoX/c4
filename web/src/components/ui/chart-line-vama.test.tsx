import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineVama,
  DEFAULT_CHART_LINE_VAMA_PERIOD,
  classifyLineVamaTrend,
  computeLineVama,
  computeLineVamaLayout,
  computeLineVamaWindow,
  describeLineVamaChart,
  getLineVamaFinitePoints,
  normalizeLineVamaPeriod,
  runLineVama,
  type ChartLineVamaPoint,
} from './chart-line-vama';

const toPoints = (
  values: number[],
  volumes: number[],
): ChartLineVamaPoint[] =>
  values.map((v, i) => ({ x: i, value: v, volume: volumes[i] ?? 0 }));

// Equal-vol fixture: every bar has the same volume, so every weight is
// zero and the VAMA falls back to the SMA of closes.
const EQUAL_VOL: ChartLineVamaPoint[] = toPoints(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
);

// Single-high-volume fixture: at every position from bar 4 onward the
// last bar of the 5-bar window has volume 6 while the others have 1.
// Sum 10, mean 2; weights [0, 0, 0, 0, 4]; VAMA == last bar's price.
const SINGLE_HIGH: ChartLineVamaPoint[] = toPoints(
  [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  [1, 1, 1, 1, 6, 1, 1, 1, 1, 6],
);

// Two-weighted-bars fixture (constructed for the last 5-bar window):
// prices [10, 20, 30, 40, 50], volumes [3, 3, 4, 7, 8], sum 25, mean 5;
// weights [-2, -2, -1, 2, 3] -> [0, 0, 0, 2, 3]; VAMA = 230/5 = 46.
const TWO_WEIGHTED: ChartLineVamaPoint[] = toPoints(
  [10, 20, 30, 40, 50],
  [3, 3, 4, 7, 8],
);

// A long varied series for translation invariance / component tests.
const VARIED: ChartLineVamaPoint[] = Array.from({ length: 16 }, (_, i) => ({
  x: i,
  value: 50 + 5 * Math.sin(i * 0.5) + i * 0.3,
  volume: 100 + ((i * 37) % 50),
}));

const OPTS = { period: 5 } as const;

describe('getLineVamaFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineVamaFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineVamaFinitePoints('nope' as unknown as ChartLineVamaPoint[]),
    ).toEqual([]);
  });

  it('drops non-finite x, value, or volume; drops negative volume', () => {
    const points: ChartLineVamaPoint[] = [
      { x: 0, value: 1, volume: 1 },
      { x: Number.NaN, value: 2, volume: 1 },
      { x: 1, value: Number.POSITIVE_INFINITY, volume: 1 },
      { x: 2, value: 3, volume: Number.NaN },
      { x: 3, value: 4, volume: -1 },
      { x: 4, value: 5, volume: 0 },
    ];
    const out = getLineVamaFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 4]);
  });

  it('preserves input order', () => {
    const finite = getLineVamaFinitePoints(EQUAL_VOL.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...EQUAL_VOL].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineVamaPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineVamaPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineVamaPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for a sub-2 period', () => {
    expect(normalizeLineVamaPeriod(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineVamaPeriod(Number.NaN, 14)).toBe(14);
  });

  it('falls back for a string', () => {
    expect(normalizeLineVamaPeriod('14' as unknown as number, 14)).toBe(14);
  });
});

describe('computeLineVamaWindow', () => {
  it('returns null for an empty window', () => {
    expect(computeLineVamaWindow([], [])).toBeNull();
  });

  it('returns null when the price and volume lengths disagree', () => {
    expect(computeLineVamaWindow([1, 2, 3], [1, 2])).toBeNull();
  });

  it('falls back to the simple mean when every weight is zero (equal volumes)', () => {
    const result = computeLineVamaWindow(
      [1, 2, 3, 4, 5],
      [10, 10, 10, 10, 10],
    );
    expect(result).not.toBeNull();
    expect(result!.usedFallback).toBe(true);
    expect(result!.weightSum).toBe(0);
    expect(result!.vama).toBe(3);
  });

  it('returns the single high-volume price when only one bar is above average', () => {
    const result = computeLineVamaWindow(
      [10, 20, 30, 40, 50],
      [1, 1, 1, 1, 6],
    );
    expect(result).not.toBeNull();
    expect(result!.usedFallback).toBe(false);
    expect(result!.vama).toBe(50);
  });

  it('returns the worked two-weighted anchor (46) for prices [10..50] volumes [3,3,4,7,8]', () => {
    const result = computeLineVamaWindow(
      [10, 20, 30, 40, 50],
      [3, 3, 4, 7, 8],
    );
    expect(result).not.toBeNull();
    expect(result!.usedFallback).toBe(false);
    expect(result!.weightSum).toBe(5);
    expect(result!.vama).toBe(46);
  });

  it('falls back to the simple mean when all volumes are zero', () => {
    const result = computeLineVamaWindow(
      [1, 2, 3, 4, 5],
      [0, 0, 0, 0, 0],
    );
    expect(result).not.toBeNull();
    expect(result!.usedFallback).toBe(true);
    expect(result!.vama).toBe(3);
  });

  it('translation invariance: shifting all prices by k shifts the VAMA by k (bit-exact for clean integer fixtures)', () => {
    const a = computeLineVamaWindow([10, 20, 30, 40, 50], [3, 3, 4, 7, 8])!;
    const b = computeLineVamaWindow(
      [110, 120, 130, 140, 150],
      [3, 3, 4, 7, 8],
    )!;
    expect(b.vama).toBe(a.vama + 100);
  });

  it('the VAMA always lies inside the close range when not in fallback', () => {
    const result = computeLineVamaWindow(
      [10, 20, 30, 40, 50],
      [3, 3, 4, 7, 8],
    )!;
    expect(result.vama).toBeGreaterThanOrEqual(10);
    expect(result.vama).toBeLessThanOrEqual(50);
  });
});

describe('computeLineVama', () => {
  it('returns an empty list for non-array', () => {
    expect(
      computeLineVama(null as unknown as number[], [1, 2, 3], 5),
    ).toEqual([]);
  });

  it('returns an empty list when prices and volumes have different lengths', () => {
    expect(computeLineVama([1, 2, 3], [1, 2], 5)).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineVama(
      EQUAL_VOL.map((p) => p.value),
      EQUAL_VOL.map((p) => p.volume),
      5,
    );
    expect(out).toHaveLength(EQUAL_VOL.length);
  });

  it('leaves the warm-up window null (the first `period - 1` bars)', () => {
    const out = computeLineVama(
      EQUAL_VOL.map((p) => p.value),
      EQUAL_VOL.map((p) => p.volume),
      5,
    );
    for (let i = 0; i < 4; i += 1) {
      expect(out[i]!.vama).toBeNull();
      expect(out[i]!.weightShare).toBeNull();
    }
  });

  it('equal-volume series falls back to the rolling SMA at every defined bar', () => {
    const out = computeLineVama(
      EQUAL_VOL.map((p) => p.value),
      EQUAL_VOL.map((p) => p.volume),
      5,
    );
    // SMAs of [1..10] with window 5 at bars 4..9 are 3, 4, 5, 6, 7, 8.
    const expected = [3, 4, 5, 6, 7, 8];
    for (let i = 4; i < 10; i += 1) {
      expect(out[i]!.vama).toBe(expected[i - 4]);
    }
  });

  it('single-high-volume bar gives the high-volume close at that bar', () => {
    const out = computeLineVama(
      SINGLE_HIGH.map((p) => p.value),
      SINGLE_HIGH.map((p) => p.volume),
      5,
    );
    // At bar 4 the high-volume bar is the last in the window (price 50).
    expect(out[4]!.vama).toBe(50);
    // At bar 9 it is again the last in the window (price 100).
    expect(out[9]!.vama).toBe(100);
  });

  it('the weight share is zero on equal-volume bars (fallback case)', () => {
    const out = computeLineVama(
      EQUAL_VOL.map((p) => p.value),
      EQUAL_VOL.map((p) => p.volume),
      5,
    );
    for (let i = 4; i < 10; i += 1) expect(out[i]!.weightShare).toBe(0);
  });

  it('falls back via the period normalisation on a non-finite period', () => {
    const out = computeLineVama(
      EQUAL_VOL.map((p) => p.value),
      EQUAL_VOL.map((p) => p.volume),
      Number.NaN,
    );
    expect(out).toHaveLength(EQUAL_VOL.length);
  });

  it('produces finite output for the varied series', () => {
    const out = computeLineVama(
      VARIED.map((p) => p.value),
      VARIED.map((p) => p.volume),
      5,
    );
    for (let i = 4; i < VARIED.length; i += 1) {
      const v = out[i]!.vama;
      expect(v).not.toBeNull();
      expect(Number.isFinite(v!)).toBe(true);
    }
  });

  it('translation invariance over the entire rolling series (bit-exact)', () => {
    const a = computeLineVama(
      SINGLE_HIGH.map((p) => p.value),
      SINGLE_HIGH.map((p) => p.volume),
      5,
    );
    const b = computeLineVama(
      SINGLE_HIGH.map((p) => p.value + 1000),
      SINGLE_HIGH.map((p) => p.volume),
      5,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i]!.vama === null) {
        expect(b[i]!.vama).toBeNull();
      } else {
        expect(b[i]!.vama).toBe(a[i]!.vama! + 1000);
      }
    }
  });
});

describe('classifyLineVamaTrend', () => {
  it('rising step -> up', () => {
    expect(classifyLineVamaTrend(1.5, 1)).toBe('up');
  });

  it('falling step -> down', () => {
    expect(classifyLineVamaTrend(0.5, 1)).toBe('down');
  });

  it('equal pair -> flat', () => {
    expect(classifyLineVamaTrend(1, 1)).toBe('flat');
  });

  it('null previous -> none', () => {
    expect(classifyLineVamaTrend(1, null)).toBe('none');
  });

  it('null current -> none', () => {
    expect(classifyLineVamaTrend(null, 1)).toBe('none');
  });
});

describe('runLineVama', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      runLineVama([{ x: 0, value: 1, volume: 1 }], OPTS).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineVama([]).ok).toBe(false);
    expect(runLineVama(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineVama(EQUAL_VOL, OPTS).ok).toBe(true);
  });

  it('uses the default period', () => {
    const run = runLineVama(EQUAL_VOL);
    expect(run.period).toBe(DEFAULT_CHART_LINE_VAMA_PERIOD);
  });

  it('honours custom options', () => {
    const run = runLineVama(EQUAL_VOL, { period: 7 });
    expect(run.period).toBe(7);
  });

  it('classifies the equal-vol fixture as fully rising after the warm-up (SMA of rising input)', () => {
    const run = runLineVama(EQUAL_VOL, OPTS);
    // SMA of [1..10] window 5: 3,4,5,6,7,8 -- all rising.
    expect(run.upCount).toBe(5);
    expect(run.downCount).toBe(0);
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineVama(VARIED, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.trend === 'none') none += 1;
    }
    expect(run.upCount + run.downCount + run.flatCount + none).toBe(
      run.samples.length,
    );
  });

  it('produces one sample per finite point', () => {
    const run = runLineVama(VARIED, OPTS);
    expect(run.samples).toHaveLength(VARIED.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...EQUAL_VOL].sort(() => -1);
    const run = runLineVama(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final VAMA value', () => {
    const run = runLineVama(EQUAL_VOL, OPTS);
    expect(run.vamaFinal).toBe(8);
  });

  it('exposes the weight share on each sample', () => {
    const run = runLineVama(SINGLE_HIGH, OPTS);
    expect(run.samples[4]!.weightShare).not.toBeNull();
  });

  it('exposes the rolling VAMA array', () => {
    const run = runLineVama(EQUAL_VOL, OPTS);
    expect(run.vama).toHaveLength(EQUAL_VOL.length);
  });
});

describe('computeLineVamaLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLineVamaLayout({
        data: [{ x: 0, value: 1, volume: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLineVamaLayout({
        data: VARIED,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineVamaLayout({ data: VARIED, ...OPTS }).ok).toBe(true);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineVamaLayout({ data: EQUAL_VOL, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineVamaLayout({ data: EQUAL_VOL, ...OPTS });
    expect(layout.priceDots).toHaveLength(EQUAL_VOL.length);
  });

  it('emits one VAMA segment between consecutive defined bars', () => {
    const layout = computeLineVamaLayout({ data: EQUAL_VOL, ...OPTS });
    // EQUAL_VOL: defined at bars 4..9 (6 bars) -> 5 segments.
    expect(layout.segments).toHaveLength(5);
  });

  it('emits one marker per defined-VAMA bar', () => {
    const layout = computeLineVamaLayout({ data: EQUAL_VOL, ...OPTS });
    expect(layout.markers).toHaveLength(6);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineVamaLayout({ data: VARIED, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('the value domain covers both the price and the VAMA', () => {
    const layout = computeLineVamaLayout({ data: EQUAL_VOL, ...OPTS });
    expect(layout.valueMin).toBeLessThanOrEqual(1);
    expect(layout.valueMax).toBeGreaterThanOrEqual(10);
  });

  it('carries the run', () => {
    const layout = computeLineVamaLayout({ data: EQUAL_VOL, ...OPTS });
    expect(layout.run.period).toBe(5);
    expect(layout.run.samples).toHaveLength(EQUAL_VOL.length);
  });
});

describe('describeLineVamaChart', () => {
  it('names the indicator', () => {
    expect(describeLineVamaChart(EQUAL_VOL, OPTS)).toContain(
      'Volume Adjusted Moving Average',
    );
  });

  it('mentions the lookback period', () => {
    expect(describeLineVamaChart(EQUAL_VOL, OPTS)).toContain('period 5');
  });

  it('mentions the fallback to a simple moving average', () => {
    expect(describeLineVamaChart(EQUAL_VOL, OPTS)).toContain(
      'simple moving average',
    );
  });

  it('mentions the trend counts', () => {
    expect(describeLineVamaChart(EQUAL_VOL, OPTS)).toContain('rises on');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineVamaChart([])).toBe('No data');
    expect(describeLineVamaChart(null)).toBe('No data');
  });
});

describe('<ChartLineVama />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineVama data={EQUAL_VOL} period={5} />);
    expect(
      screen.getByRole('region', {
        name: /Volume Adjusted Moving Average chart/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vama-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Volume Adjusted Moving Average');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineVama data={[]} period={5} />);
    expect(
      container.querySelector('[data-section="chart-line-vama-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} />,
    );
    const root = container.querySelector('[data-section="chart-line-vama"]');
    expect(root?.getAttribute('data-period')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(EQUAL_VOL.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vama-price-path"]'),
    ).toBeInTheDocument();
  });

  it('renders one VAMA segment between consecutive defined bars', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-vama-segment"]',
    );
    expect(segments).toHaveLength(5);
  });

  it('renders one marker per defined bar', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vama-marker"]',
    );
    expect(markers).toHaveLength(6);
  });

  it('marks every marker with a valid trend', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vama-marker"]',
    );
    for (const m of markers) {
      const trend = m.getAttribute('data-trend');
      expect(['up', 'down', 'flat', 'none']).toContain(trend);
    }
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-vama-badge-config"]',
    );
    expect(badge?.textContent).toContain('VAMA 5');
  });

  it('hides the VAMA via the legend toggle', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-vama-legend-item"][data-series-id="vama"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-vama-segments"]'),
    ).toBeNull();
  });

  it('hides the VAMA via showVama=false', () => {
    const { container } = render(
      <ChartLineVama data={EQUAL_VOL} period={5} showVama={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vama-segments"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineVama
        data={EQUAL_VOL}
        period={5}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vama-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVama ref={ref} data={EQUAL_VOL} period={5} />);
    expect(ref.current).not.toBeNull();
  });

  it('renders for the two-weighted fixture (VAMA = 46 at the last bar)', () => {
    const { container } = render(
      <ChartLineVama data={TWO_WEIGHTED} period={5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vama-marker"]',
    );
    // TWO_WEIGHTED has 5 bars, period 5 -> 1 defined marker (the last bar).
    expect(markers.length).toBe(1);
  });
});
