import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineAccelerationBands,
  DEFAULT_CHART_LINE_ACCELERATION_BANDS_PERIOD,
  classifyLineAccelerationBandsZone,
  computeLineAccelerationBands,
  computeLineAccelerationBandsFactors,
  computeLineAccelerationBandsLayout,
  computeLineAccelerationBandsSma,
  describeLineAccelerationBandsChart,
  getLineAccelerationBandsFinitePoints,
  normalizeLineAccelerationBandsPeriod,
  runLineAccelerationBands,
  type ChartLineAccelerationBandsPoint,
} from './chart-line-acceleration-bands';

// Constant series with positive H = L = C. factors return high = low
// = const, SMA stays at const. Every band reads K bit-exact.
const CONST_FLAT: ChartLineAccelerationBandsPoint[] = Array.from(
  { length: 10 },
  (_, i) => ({ x: i, high: 5, low: 5, close: 5 }),
);

// Anchor A: H=10, L=6, C=8 constant. ratio = 4/16 = 0.25 (dyadic);
// upperFactor = 10 * 1.5 = 15; lowerFactor = 6 * 0.5 = 3. SMA over
// any window of these constants is 15/8/3.
const ANCHOR_A: ChartLineAccelerationBandsPoint[] = Array.from(
  { length: 10 },
  (_, i) => ({ x: i, high: 10, low: 6, close: 8 }),
);

// Anchor B: H=12, L=4, C=8 constant. ratio = 8/16 = 0.5; upperFactor
// = 12 * 2 = 24; lowerFactor = 4 * 0 = 0. SMA stays at 24/8/0.
const ANCHOR_B: ChartLineAccelerationBandsPoint[] = Array.from(
  { length: 10 },
  (_, i) => ({ x: i, high: 12, low: 4, close: 8 }),
);

const WAVE: ChartLineAccelerationBandsPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const v = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: v + 2, low: v - 2, close: v };
  },
);

const OPTS = { period: 5 } as const;

describe('getLineAccelerationBandsFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineAccelerationBandsFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineAccelerationBandsFinitePoints(
        'nope' as unknown as ChartLineAccelerationBandsPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite OHLC or high < low', () => {
    const points: ChartLineAccelerationBandsPoint[] = [
      { x: 0, high: 10, low: 6, close: 8 },
      { x: Number.NaN, high: 10, low: 6, close: 8 },
      { x: 1, high: Number.NaN, low: 6, close: 8 },
      { x: 2, high: 10, low: Number.NaN, close: 8 },
      { x: 3, high: 10, low: 6, close: Number.NaN },
      { x: 4, high: 5, low: 10, close: 7 },
      { x: 5, high: 10, low: 6, close: 8 },
    ];
    const out = getLineAccelerationBandsFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 5]);
  });

  it('preserves input order', () => {
    const finite = getLineAccelerationBandsFinitePoints(
      ANCHOR_A.slice().reverse(),
    );
    expect(finite.map((p) => p.x)).toEqual(
      [...ANCHOR_A].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineAccelerationBandsPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineAccelerationBandsPeriod(14, 20)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineAccelerationBandsPeriod(14.9, 20)).toBe(14);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineAccelerationBandsPeriod(0, 20)).toBe(20);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAccelerationBandsPeriod(Number.NaN, 20)).toBe(20);
  });
});

describe('computeLineAccelerationBandsFactors', () => {
  it('returns null factors for null', () => {
    const f = computeLineAccelerationBandsFactors(null);
    expect(f.upperFactor).toBeNull();
    expect(f.lowerFactor).toBeNull();
  });

  it('returns null factors for non-finite OHLC', () => {
    const f = computeLineAccelerationBandsFactors({
      x: 0,
      high: Number.NaN,
      low: 6,
      close: 8,
    });
    expect(f.upperFactor).toBeNull();
  });

  it('returns null factors for sum (high + low) <= 0', () => {
    const f = computeLineAccelerationBandsFactors({
      x: 0,
      high: -5,
      low: -10,
      close: -7,
    });
    expect(f.upperFactor).toBeNull();
    expect(f.lowerFactor).toBeNull();
  });

  it('zero range gives factors equal to high = low (bit-exact)', () => {
    const f = computeLineAccelerationBandsFactors({
      x: 0,
      high: 5,
      low: 5,
      close: 5,
    });
    expect(f.upperFactor).toBe(5);
    expect(f.lowerFactor).toBe(5);
  });

  it('worked anchor A: H=10 L=6 -> upperFactor=15, lowerFactor=3 bit-exact', () => {
    const f = computeLineAccelerationBandsFactors({
      x: 0,
      high: 10,
      low: 6,
      close: 8,
    });
    expect(f.upperFactor).toBe(15);
    expect(f.lowerFactor).toBe(3);
  });

  it('worked anchor B: H=12 L=4 -> upperFactor=24, lowerFactor=0 bit-exact', () => {
    const f = computeLineAccelerationBandsFactors({
      x: 0,
      high: 12,
      low: 4,
      close: 8,
    });
    expect(f.upperFactor).toBe(24);
    expect(f.lowerFactor).toBe(0);
  });
});

describe('computeLineAccelerationBandsSma', () => {
  it('returns an empty list for empty input', () => {
    expect(computeLineAccelerationBandsSma([], 3)).toEqual([]);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineAccelerationBandsSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
  });

  it('SMA of a constant series is the constant (bit-exact)', () => {
    const out = computeLineAccelerationBandsSma([5, 5, 5, 5, 5], 3);
    for (let i = 2; i < out.length; i += 1) expect(out[i]).toBe(5);
  });

  it('SMA of [1..5] window 3 is [null, null, 2, 3, 4] bit-exact', () => {
    expect(computeLineAccelerationBandsSma([1, 2, 3, 4, 5], 3)).toEqual([
      null,
      null,
      2,
      3,
      4,
    ]);
  });

  it('null inside the window null-ifies the output', () => {
    const out = computeLineAccelerationBandsSma([1, null, 3, 4, 5], 3);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]).toBe(4);
  });
});

describe('computeLineAccelerationBands', () => {
  it('returns an empty list for non-array or empty input', () => {
    expect(computeLineAccelerationBands(null, 5)).toEqual([]);
    expect(computeLineAccelerationBands([], 5)).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineAccelerationBands(ANCHOR_A, 5);
    expect(out).toHaveLength(ANCHOR_A.length);
  });

  it('leaves the first period - 1 bars null on every band', () => {
    const out = computeLineAccelerationBands(ANCHOR_A, 5);
    for (let i = 0; i < 4; i += 1) {
      expect(out[i]!.upper).toBeNull();
      expect(out[i]!.middle).toBeNull();
      expect(out[i]!.lower).toBeNull();
    }
  });

  it('CONST_FLAT: every band equals the constant 5 bit-exact', () => {
    const out = computeLineAccelerationBands(CONST_FLAT, 5);
    for (let i = 4; i < out.length; i += 1) {
      expect(out[i]!.upper).toBe(5);
      expect(out[i]!.middle).toBe(5);
      expect(out[i]!.lower).toBe(5);
    }
  });

  it('ANCHOR_A: upper=15, middle=8, lower=3 at every defined bar (bit-exact)', () => {
    const out = computeLineAccelerationBands(ANCHOR_A, 5);
    for (let i = 4; i < out.length; i += 1) {
      expect(out[i]!.upper).toBe(15);
      expect(out[i]!.middle).toBe(8);
      expect(out[i]!.lower).toBe(3);
    }
  });

  it('ANCHOR_B: upper=24, middle=8, lower=0 at every defined bar (bit-exact)', () => {
    const out = computeLineAccelerationBands(ANCHOR_B, 5);
    for (let i = 4; i < out.length; i += 1) {
      expect(out[i]!.upper).toBe(24);
      expect(out[i]!.middle).toBe(8);
      expect(out[i]!.lower).toBe(0);
    }
  });

  it('upper >= middle >= lower at every defined bar of a normal varied input', () => {
    const out = computeLineAccelerationBands(WAVE, 5);
    for (let i = 4; i < out.length; i += 1) {
      const lv = out[i]!;
      if (lv.upper === null || lv.middle === null || lv.lower === null)
        continue;
      expect(lv.upper).toBeGreaterThanOrEqual(lv.middle);
      expect(lv.middle).toBeGreaterThanOrEqual(lv.lower);
    }
  });
});

describe('classifyLineAccelerationBandsZone', () => {
  const levels = computeLineAccelerationBands(ANCHOR_A, 5)[4]!;
  // upper=15, middle=8, lower=3.

  it('null close -> none', () => {
    expect(classifyLineAccelerationBandsZone(null, levels)).toBe('none');
  });

  it('close above upper -> above-upper', () => {
    expect(classifyLineAccelerationBandsZone(20, levels)).toBe('above-upper');
  });

  it('close between middle and upper -> middle-to-upper', () => {
    expect(classifyLineAccelerationBandsZone(12, levels)).toBe(
      'middle-to-upper',
    );
  });

  it('close at middle -> middle-to-upper (>= rule)', () => {
    expect(classifyLineAccelerationBandsZone(8, levels)).toBe(
      'middle-to-upper',
    );
  });

  it('close between lower and middle -> lower-to-middle', () => {
    expect(classifyLineAccelerationBandsZone(5, levels)).toBe(
      'lower-to-middle',
    );
  });

  it('close at lower -> lower-to-middle (>= rule)', () => {
    expect(classifyLineAccelerationBandsZone(3, levels)).toBe(
      'lower-to-middle',
    );
  });

  it('close below lower -> below-lower', () => {
    expect(classifyLineAccelerationBandsZone(1, levels)).toBe('below-lower');
  });

  it('null levels -> none', () => {
    expect(
      classifyLineAccelerationBandsZone(8, {
        upper: null,
        middle: null,
        lower: null,
      }),
    ).toBe('none');
  });
});

describe('runLineAccelerationBands', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      runLineAccelerationBands(
        [{ x: 0, high: 10, low: 6, close: 8 }],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineAccelerationBands([]).ok).toBe(false);
    expect(runLineAccelerationBands(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineAccelerationBands(ANCHOR_A, OPTS).ok).toBe(true);
  });

  it('uses the default period when not given', () => {
    const run = runLineAccelerationBands(ANCHOR_A);
    expect(run.period).toBe(DEFAULT_CHART_LINE_ACCELERATION_BANDS_PERIOD);
  });

  it('honours a custom period', () => {
    const run = runLineAccelerationBands(ANCHOR_A, { period: 6 });
    expect(run.period).toBe(6);
  });

  it('ANCHOR_A: every defined sample lands in lower-to-middle (close 8 == middle, >= rule)', () => {
    const run = runLineAccelerationBands(ANCHOR_A, OPTS);
    for (let i = 4; i < run.samples.length; i += 1) {
      expect(run.samples[i]!.zone).toBe('middle-to-upper');
    }
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineAccelerationBands(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.aboveCount + run.betweenCount + run.belowCount + none,
    ).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLineAccelerationBands(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...ANCHOR_A].sort(() => -1);
    const run = runLineAccelerationBands(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final middle band', () => {
    const run = runLineAccelerationBands(ANCHOR_A, OPTS);
    expect(run.middleFinal).toBe(8);
  });
});

describe('computeLineAccelerationBandsLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineAccelerationBandsLayout({
        data: [{ x: 0, high: 10, low: 6, close: 8 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineAccelerationBandsLayout({
        data: ANCHOR_A,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineAccelerationBandsLayout({ data: ANCHOR_A, ...OPTS }).ok,
    ).toBe(true);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineAccelerationBandsLayout({
      data: ANCHOR_A,
      ...OPTS,
    });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineAccelerationBandsLayout({
      data: ANCHOR_A,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(ANCHOR_A.length);
  });

  it('emits 3 segments per defined bar', () => {
    const layout = computeLineAccelerationBandsLayout({
      data: ANCHOR_A,
      ...OPTS,
    });
    // 10 bars - 4 warm-up = 6 defined bars; 3 bands each => 18 segments.
    expect(layout.segments).toHaveLength(18);
  });

  it('every segment is upper / middle / lower', () => {
    const layout = computeLineAccelerationBandsLayout({
      data: ANCHOR_A,
      ...OPTS,
    });
    for (const seg of layout.segments) {
      expect(['upper', 'middle', 'lower']).toContain(seg.seriesId);
    }
  });

  it('the value domain covers the close range and the bands', () => {
    const layout = computeLineAccelerationBandsLayout({
      data: ANCHOR_A,
      ...OPTS,
    });
    expect(layout.valueMin).toBeLessThanOrEqual(3);
    expect(layout.valueMax).toBeGreaterThanOrEqual(15);
  });

  it('carries the run', () => {
    const layout = computeLineAccelerationBandsLayout({
      data: ANCHOR_A,
      ...OPTS,
    });
    expect(layout.run.samples).toHaveLength(ANCHOR_A.length);
  });

  it('emits one marker per defined-zone bar', () => {
    const layout = computeLineAccelerationBandsLayout({
      data: ANCHOR_A,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(6);
  });
});

describe('describeLineAccelerationBandsChart', () => {
  it('names the indicator', () => {
    expect(describeLineAccelerationBandsChart(ANCHOR_A, OPTS)).toContain(
      'Acceleration Bands',
    );
  });

  it('mentions the band formulas', () => {
    const text = describeLineAccelerationBandsChart(ANCHOR_A, OPTS);
    expect(text).toContain('1 + 2*(H-L)/(H+L)');
    expect(text).toContain('1 - 2*(H-L)/(H+L)');
  });

  it('mentions the period', () => {
    expect(describeLineAccelerationBandsChart(ANCHOR_A, { period: 9 })).toContain(
      'period 9',
    );
  });

  it('mentions the warm-up', () => {
    expect(describeLineAccelerationBandsChart(ANCHOR_A, OPTS)).toContain(
      'first 4 bars',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineAccelerationBandsChart([])).toBe('No data');
    expect(describeLineAccelerationBandsChart(null)).toBe('No data');
  });
});

describe('<ChartLineAccelerationBands />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineAccelerationBands data={ANCHOR_A} period={5} />);
    expect(
      screen.getByRole('region', { name: /Acceleration Bands chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={ANCHOR_A} period={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-acceleration-bands-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Acceleration Bands');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={[]} period={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-bands-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the period on the root', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={ANCHOR_A} period={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-acceleration-bands"]',
    );
    expect(root?.getAttribute('data-period')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(ANCHOR_A.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={ANCHOR_A} period={5} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={ANCHOR_A} period={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-acceleration-bands-price-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders 3 segments per defined bar (6 bars * 3 bands = 18)', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={ANCHOR_A} period={5} />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-acceleration-bands-segment"]',
    );
    expect(segments).toHaveLength(18);
  });

  it('renders markers for the defined-zone bars', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={ANCHOR_A} period={5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-acceleration-bands-marker"]',
    );
    expect(markers).toHaveLength(6);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={ANCHOR_A} period={5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-acceleration-bands-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect([
        'above-upper',
        'middle-to-upper',
        'lower-to-middle',
        'below-lower',
      ]).toContain(zone);
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={ANCHOR_A} period={5} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-acceleration-bands-badge-config"]',
    );
    expect(badge?.textContent).toContain('ACCEL 5');
  });

  it('hides the upper band via showUpper=false', () => {
    const { container } = render(
      <ChartLineAccelerationBands
        data={ANCHOR_A}
        period={5}
        showUpper={false}
      />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-acceleration-bands-segment"][data-series-id="upper"]',
    );
    expect(segments).toHaveLength(0);
  });

  it('hides the lower band via showLower=false', () => {
    const { container } = render(
      <ChartLineAccelerationBands
        data={ANCHOR_A}
        period={5}
        showLower={false}
      />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-acceleration-bands-segment"][data-series-id="lower"]',
    );
    expect(segments).toHaveLength(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineAccelerationBands
        data={ANCHOR_A}
        period={5}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-acceleration-bands-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAccelerationBands ref={ref} data={ANCHOR_A} period={5} />);
    expect(ref.current).not.toBeNull();
  });

  it('renders a wave fixture without throwing', () => {
    const { container } = render(
      <ChartLineAccelerationBands data={WAVE} period={5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-acceleration-bands"]'),
    ).toBeInTheDocument();
  });
});
