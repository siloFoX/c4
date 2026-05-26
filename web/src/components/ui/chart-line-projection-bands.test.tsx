import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineProjectionBands,
  DEFAULT_CHART_LINE_PROJECTION_BANDS_PERIOD,
  classifyLineProjectionBandsZone,
  computeLineProjectionBands,
  computeLineProjectionBandsLayout,
  computeLineProjectionBandsSlope,
  describeLineProjectionBandsChart,
  getLineProjectionBandsFinitePoints,
  normalizeLineProjectionBandsPeriod,
  runLineProjectionBands,
  type ChartLineProjectionBandsPoint,
} from './chart-line-projection-bands';

const toBars = (
  highs: number[],
  lows: number[] = highs,
  closes: number[] = highs,
): ChartLineProjectionBandsPoint[] =>
  highs.map((h, i) => ({
    x: i,
    high: h,
    low: lows[i] ?? h,
    close: closes[i] ?? h,
  }));

const CONST_FLAT: ChartLineProjectionBandsPoint[] = toBars(
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
);

// Perfect rising ramp: high = low = close = i + 10 over 10 bars.
const RISING: ChartLineProjectionBandsPoint[] = toBars(
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
);

const FALLING: ChartLineProjectionBandsPoint[] = toBars(
  [19, 18, 17, 16, 15, 14, 13, 12, 11, 10],
  [19, 18, 17, 16, 15, 14, 13, 12, 11, 10],
  [19, 18, 17, 16, 15, 14, 13, 12, 11, 10],
);

const WAVE: ChartLineProjectionBandsPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const v = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: v + 1, low: v - 1, close: v };
  },
);

const OPTS = { period: 4 } as const;

describe('getLineProjectionBandsFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineProjectionBandsFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineProjectionBandsFinitePoints(
        'nope' as unknown as ChartLineProjectionBandsPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite values', () => {
    const points: ChartLineProjectionBandsPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: Number.NaN, high: 2, low: 2, close: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 0, close: 0 },
      { x: 2, high: 3, low: 3, close: 3 },
    ];
    expect(getLineProjectionBandsFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 2, high: 3, low: 3, close: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineProjectionBandsPoint[] = [
      { x: 0, high: 1, low: 2, close: 1.5 },
      { x: 1, high: 3, low: 2, close: 2.5 },
    ];
    expect(getLineProjectionBandsFinitePoints(points)).toEqual([
      { x: 1, high: 3, low: 2, close: 2.5 },
    ]);
  });
});

describe('normalizeLineProjectionBandsPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineProjectionBandsPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineProjectionBandsPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineProjectionBandsPeriod(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineProjectionBandsPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('computeLineProjectionBandsSlope', () => {
  it('returns null on a single value', () => {
    expect(computeLineProjectionBandsSlope([5])).toBeNull();
  });

  it('constant: slope = 0 bit-exact', () => {
    expect(computeLineProjectionBandsSlope([5, 5, 5, 5])).toBe(0);
  });

  it('linear ramp [0, 1, 2, 3] -> slope = 1 bit-exact', () => {
    expect(computeLineProjectionBandsSlope([0, 1, 2, 3])).toBe(1);
  });

  it('linear ramp [10, 12, 14, 16] -> slope = 2 bit-exact', () => {
    expect(computeLineProjectionBandsSlope([10, 12, 14, 16])).toBe(2);
  });

  it('reversed [3, 2, 1, 0] -> slope = -1 bit-exact', () => {
    expect(computeLineProjectionBandsSlope([3, 2, 1, 0])).toBe(-1);
  });

  it('returns null on a non-finite element', () => {
    expect(computeLineProjectionBandsSlope([1, Number.NaN, 3])).toBeNull();
  });
});

describe('computeLineProjectionBands', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineProjectionBands(null, 4)).toEqual([]);
    expect(computeLineProjectionBands([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineProjectionBands(RISING, 4)).toHaveLength(RISING.length);
  });

  it('leaves the warm-up bars null on both bands', () => {
    const lv = computeLineProjectionBands(RISING, 4);
    for (let i = 0; i < 3; i += 1) {
      expect(lv[i]!.upper).toBeNull();
      expect(lv[i]!.lower).toBeNull();
    }
  });

  it('CONST_FLAT: upper = lower = K bit-exact at every defined bar', () => {
    const lv = computeLineProjectionBands(CONST_FLAT, 4);
    for (let i = 3; i < lv.length; i += 1) {
      expect(lv[i]!.upper).toBe(5);
      expect(lv[i]!.lower).toBe(5);
    }
  });

  it('RISING linear ramp: upper = lower = close[i] bit-exact (band width = 0)', () => {
    const lv = computeLineProjectionBands(RISING, 4);
    // RISING[i] = i + 10. After warm-up (i >= 3) every projected
    // high/low equals i + 10 bit-exact (slope = 1 cancels the
    // within-window distance).
    for (let i = 3; i < lv.length; i += 1) {
      expect(lv[i]!.upper).toBe(i + 10);
      expect(lv[i]!.lower).toBe(i + 10);
    }
  });

  it('FALLING linear ramp: upper = lower = close[i] bit-exact (band width = 0)', () => {
    const lv = computeLineProjectionBands(FALLING, 4);
    // FALLING[i] = 19 - i. Slope = -1 cancels the within-window
    // distance and every projected high/low equals 19 - i.
    for (let i = 3; i < lv.length; i += 1) {
      expect(lv[i]!.upper).toBe(19 - i);
      expect(lv[i]!.lower).toBe(19 - i);
    }
  });

  it('the band width is exactly zero on every defined RISING bar', () => {
    const lv = computeLineProjectionBands(RISING, 4);
    for (let i = 3; i < lv.length; i += 1) {
      expect(lv[i]!.upper! - lv[i]!.lower!).toBe(0);
    }
  });

  it('translation invariance: shifting high/low/close by K shifts the bands by exactly K (integer K)', () => {
    const a = computeLineProjectionBands(RISING, 4);
    const shifted = RISING.map((p) => ({
      x: p.x,
      high: p.high + 1000,
      low: p.low + 1000,
      close: p.close + 1000,
    }));
    const b = computeLineProjectionBands(shifted, 4);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i]!.upper === null) {
        expect(b[i]!.upper).toBeNull();
      } else {
        expect(b[i]!.upper).toBe(a[i]!.upper! + 1000);
        expect(b[i]!.lower).toBe(a[i]!.lower! + 1000);
      }
    }
  });

  it('the upper band is greater than or equal to the lower band on every defined bar', () => {
    const lv = computeLineProjectionBands(WAVE, 4);
    for (let i = 3; i < lv.length; i += 1) {
      expect(lv[i]!.upper!).toBeGreaterThanOrEqual(lv[i]!.lower!);
    }
  });

  it('on the wave: bands stay finite at every defined bar', () => {
    const lv = computeLineProjectionBands(WAVE, 4);
    for (let i = 3; i < lv.length; i += 1) {
      expect(Number.isFinite(lv[i]!.upper!)).toBe(true);
      expect(Number.isFinite(lv[i]!.lower!)).toBe(true);
    }
  });

  it('the upper band is greater than or equal to the current high on the wave', () => {
    const lv = computeLineProjectionBands(WAVE, 4);
    for (let i = 3; i < lv.length; i += 1) {
      // Choosing the bar k = period - 1 (current bar) gives:
      //   hPrime[i] = high[i] + slope_h * (i - i) = high[i]
      // So the max over k must be at least high[i].
      expect(lv[i]!.upper!).toBeGreaterThanOrEqual(WAVE[i]!.high);
    }
  });

  it('the lower band is less than or equal to the current low on the wave', () => {
    const lv = computeLineProjectionBands(WAVE, 4);
    for (let i = 3; i < lv.length; i += 1) {
      expect(lv[i]!.lower!).toBeLessThanOrEqual(WAVE[i]!.low);
    }
  });
});

describe('classifyLineProjectionBandsZone', () => {
  it('close above upper -> above-upper', () => {
    expect(
      classifyLineProjectionBandsZone(10, { upper: 8, lower: 4 }),
    ).toBe('above-upper');
  });

  it('close below lower -> below-lower', () => {
    expect(
      classifyLineProjectionBandsZone(2, { upper: 8, lower: 4 }),
    ).toBe('below-lower');
  });

  it('close inside -> inside', () => {
    expect(
      classifyLineProjectionBandsZone(6, { upper: 8, lower: 4 }),
    ).toBe('inside');
  });

  it('close on a band boundary -> inside', () => {
    expect(
      classifyLineProjectionBandsZone(8, { upper: 8, lower: 4 }),
    ).toBe('inside');
  });

  it('null close -> none', () => {
    expect(
      classifyLineProjectionBandsZone(null, { upper: 8, lower: 4 }),
    ).toBe('none');
  });

  it('null band -> none', () => {
    expect(
      classifyLineProjectionBandsZone(6, { upper: null, lower: 4 }),
    ).toBe('none');
  });
});

describe('runLineProjectionBands', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineProjectionBands([{ x: 0, high: 1, low: 1, close: 1 }], OPTS).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineProjectionBands([], OPTS).ok).toBe(false);
    expect(runLineProjectionBands(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineProjectionBands(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period', () => {
    expect(runLineProjectionBands(RISING).period).toBe(
      DEFAULT_CHART_LINE_PROJECTION_BANDS_PERIOD,
    );
  });

  it('honours a custom period', () => {
    expect(runLineProjectionBands(RISING, OPTS).period).toBe(4);
  });

  it('produces one sample per finite point', () => {
    expect(runLineProjectionBands(WAVE, OPTS).samples).toHaveLength(
      WAVE.length,
    );
  });

  it('RISING ramp: every defined sample sits exactly on the bands (inside)', () => {
    const run = runLineProjectionBands(RISING, OPTS);
    expect(run.insideCount).toBe(RISING.length - 3);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('CONST_FLAT: every defined sample is inside', () => {
    const run = runLineProjectionBands(CONST_FLAT, OPTS);
    expect(run.insideCount).toBe(CONST_FLAT.length - 3);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineProjectionBands(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final upper/lower readings', () => {
    expect(runLineProjectionBands(CONST_FLAT, OPTS).upperFinal).toBe(5);
    expect(runLineProjectionBands(CONST_FLAT, OPTS).lowerFinal).toBe(5);
    expect(runLineProjectionBands(RISING, OPTS).upperFinal).toBe(19);
    expect(runLineProjectionBands(RISING, OPTS).lowerFinal).toBe(19);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineProjectionBands(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.aboveCount + run.insideCount + run.belowCount + none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineProjectionBandsLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineProjectionBandsLayout({
        data: [{ x: 0, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineProjectionBandsLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineProjectionBandsLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineProjectionBandsLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits two segments per defined bar (upper + lower)', () => {
    const layout = computeLineProjectionBandsLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.segments).toHaveLength((RISING.length - 3) * 2);
  });

  it('every segment lies inside the panel', () => {
    const layout = computeLineProjectionBandsLayout({ data: WAVE, ...OPTS });
    for (const s of layout.segments) {
      expect(s.fromCx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(s.toCx).toBeLessThanOrEqual(layout.innerRight);
      expect(s.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(s.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('the value domain covers the price and the bands', () => {
    const layout = computeLineProjectionBandsLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.valueMin).toBeLessThanOrEqual(10);
    expect(layout.valueMax).toBeGreaterThanOrEqual(19);
  });

  it('carries the run', () => {
    const layout = computeLineProjectionBandsLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.run.period).toBe(4);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineProjectionBandsLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });
});

describe('describeLineProjectionBandsChart', () => {
  it('names the indicator', () => {
    expect(describeLineProjectionBandsChart(RISING, OPTS)).toContain(
      'Projection Bands',
    );
  });

  it('mentions the period', () => {
    expect(describeLineProjectionBandsChart(RISING, OPTS)).toContain(
      'period 4',
    );
  });

  it('mentions the linear regression', () => {
    expect(describeLineProjectionBandsChart(RISING, OPTS)).toContain(
      'linear-regression',
    );
  });

  it('mentions the linear-ramp identity', () => {
    expect(describeLineProjectionBandsChart(RISING, OPTS)).toContain(
      'linear high/low ramp collapses',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineProjectionBandsChart([])).toBe('No data');
    expect(describeLineProjectionBandsChart(null)).toBe('No data');
  });
});

describe('<ChartLineProjectionBands />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineProjectionBands data={RISING} period={4} />);
    expect(
      screen.getByRole('region', { name: /Projection Bands chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineProjectionBands data={RISING} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-projection-bands-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Projection Bands');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineProjectionBands data={[]} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-projection-bands-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(
      <ChartLineProjectionBands data={RISING} period={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-projection-bands"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineProjectionBands data={RISING} period={4} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(
      <ChartLineProjectionBands data={RISING} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-projection-bands-price-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders two stub segments per defined bar', () => {
    const { container } = render(
      <ChartLineProjectionBands data={RISING} period={4} />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-projection-bands-segment"]',
    );
    expect(segments).toHaveLength((RISING.length - 3) * 2);
  });

  it('marks every RISING segment as inside (close on the band)', () => {
    const { container } = render(
      <ChartLineProjectionBands data={RISING} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-projection-bands-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('inside');
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineProjectionBands data={RISING} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-projection-bands-badge-config"]',
    );
    expect(badge?.textContent).toContain('PROJ 4');
  });

  it('hides the upper band via the legend toggle', () => {
    const { container } = render(
      <ChartLineProjectionBands data={RISING} period={4} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-projection-bands-legend-item"][data-series-id="upper"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    const upperSegments = container.querySelectorAll(
      '[data-section="chart-line-projection-bands-segment"][data-series-id="upper"]',
    );
    expect(upperSegments).toHaveLength(0);
  });

  it('hides the lower band via showLower=false', () => {
    const { container } = render(
      <ChartLineProjectionBands
        data={RISING}
        period={4}
        showLower={false}
      />,
    );
    const lowerSegments = container.querySelectorAll(
      '[data-section="chart-line-projection-bands-segment"][data-series-id="lower"]',
    );
    expect(lowerSegments).toHaveLength(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineProjectionBands
        data={RISING}
        period={4}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-projection-bands-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineProjectionBands ref={ref} data={RISING} period={4} />);
    expect(ref.current).not.toBeNull();
  });
});
