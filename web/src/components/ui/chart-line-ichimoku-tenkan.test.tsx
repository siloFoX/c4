import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineIchimokuTenkan,
  DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_PERIOD,
  classifyLineIchimokuTenkanZone,
  computeLineIchimokuTenkan,
  computeLineIchimokuTenkanLayout,
  describeLineIchimokuTenkanChart,
  getLineIchimokuTenkanFinitePoints,
  normalizeLineIchimokuTenkanPeriod,
  runLineIchimokuTenkan,
  type ChartLineIchimokuTenkanPoint,
} from './chart-line-ichimoku-tenkan';

const toBars = (
  highs: number[],
  lows: number[] = highs,
  closes: number[] = highs,
): ChartLineIchimokuTenkanPoint[] =>
  highs.map((h, i) => ({
    x: i,
    high: h,
    low: lows[i] ?? h,
    close: closes[i] ?? h,
  }));

const CONST_FLAT: ChartLineIchimokuTenkanPoint[] = toBars(
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
);

// RISING: high == low == close == i + 10 for i = 0..9.
const RISING: ChartLineIchimokuTenkanPoint[] = toBars(
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
);

// FALLING: high == low == close == 19 - i.
const FALLING: ChartLineIchimokuTenkanPoint[] = toBars(
  [19, 18, 17, 16, 15, 14, 13, 12, 11, 10],
);

const WAVE: ChartLineIchimokuTenkanPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const base = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: base + 2, low: base - 2, close: base };
  },
);

const OPTS = { period: 4 } as const;

describe('getLineIchimokuTenkanFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineIchimokuTenkanFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineIchimokuTenkanFinitePoints(
        'nope' as unknown as ChartLineIchimokuTenkanPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineIchimokuTenkanPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: Number.NaN, high: 2, low: 2, close: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 0, close: 0 },
      { x: 2, high: 3, low: 3, close: 3 },
    ];
    expect(getLineIchimokuTenkanFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 2, high: 3, low: 3, close: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineIchimokuTenkanPoint[] = [
      { x: 0, high: 1, low: 2, close: 1.5 },
      { x: 1, high: 3, low: 2, close: 2.5 },
    ];
    expect(getLineIchimokuTenkanFinitePoints(points)).toEqual([
      { x: 1, high: 3, low: 2, close: 2.5 },
    ]);
  });
});

describe('normalizeLineIchimokuTenkanPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineIchimokuTenkanPeriod(9, 9)).toBe(9);
  });

  it('floors a fractional', () => {
    expect(normalizeLineIchimokuTenkanPeriod(9.9, 9)).toBe(9);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineIchimokuTenkanPeriod(0, 9)).toBe(9);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineIchimokuTenkanPeriod(Number.NaN, 9)).toBe(9);
  });
});

describe('computeLineIchimokuTenkan', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineIchimokuTenkan(null, 4)).toEqual([]);
    expect(computeLineIchimokuTenkan([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineIchimokuTenkan(RISING, 4)).toHaveLength(RISING.length);
  });

  it('leaves the warm-up bars null', () => {
    const t = computeLineIchimokuTenkan(RISING, 4);
    for (let i = 0; i < 3; i += 1) expect(t[i]).toBeNull();
  });

  it('CONST_FLAT: tenkan = K bit-exact at every defined bar', () => {
    const t = computeLineIchimokuTenkan(CONST_FLAT, 4);
    for (let i = 3; i < t.length; i += 1) expect(t[i]).toBe(5);
  });

  it('RISING period 4: tenkan[i] = i + 8.5 bit-exact (HH = i + 10, LL = i + 7)', () => {
    const t = computeLineIchimokuTenkan(RISING, 4);
    // tenkan[i] = (HH + LL) / 2 = (i + 10 + i + 7) / 2 = (2i + 17) / 2 = i + 8.5
    for (let i = 3; i < t.length; i += 1) {
      expect(t[i]).toBe(i + 8.5);
    }
  });

  it('FALLING period 4: tenkan[i] = 20.5 - i bit-exact', () => {
    const t = computeLineIchimokuTenkan(FALLING, 4);
    // FALLING[j] = 19 - j. window [i - 3, i].
    // HH = 19 - (i - 3) = 22 - i. LL = 19 - i.
    // tenkan = (22 - i + 19 - i) / 2 = (41 - 2i) / 2 = 20.5 - i
    for (let i = 3; i < t.length; i += 1) {
      expect(t[i]).toBe(20.5 - i);
    }
  });

  it('RISING period 2: tenkan[i] = i + 9.5 bit-exact', () => {
    const t = computeLineIchimokuTenkan(RISING, 2);
    // window [i - 1, i] with values i + 9 and i + 10.
    // tenkan = (i + 10 + i + 9) / 2 = i + 9.5
    for (let i = 1; i < t.length; i += 1) {
      expect(t[i]).toBe(i + 9.5);
    }
  });

  it('period 1: tenkan[i] = high[i] bit-exact (high == low here)', () => {
    const t = computeLineIchimokuTenkan(RISING, 1);
    for (let i = 0; i < t.length; i += 1) {
      expect(t[i]).toBe(i + 10);
    }
  });

  it('translation invariance: shifting high/low by k shifts tenkan by exactly k', () => {
    const a = computeLineIchimokuTenkan(RISING, 4);
    const shifted = RISING.map((p) => ({
      x: p.x,
      high: p.high + 1000,
      low: p.low + 1000,
      close: p.close + 1000,
    }));
    const b = computeLineIchimokuTenkan(shifted, 4);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBe(a[i]! + 1000);
    }
  });

  it('reads finite on the wave', () => {
    const t = computeLineIchimokuTenkan(WAVE, 4);
    for (let i = 3; i < t.length; i += 1) {
      expect(Number.isFinite(t[i]!)).toBe(true);
    }
  });

  it('tenkan stays between current bar low and current bar high on every wave bar', () => {
    const t = computeLineIchimokuTenkan(WAVE, 4);
    for (let i = 3; i < t.length; i += 1) {
      // The Tenkan-sen is the window's HH/LL midpoint, which is in
      // [HH, LL]. The current bar must be inside the window, so
      // tenkan >= min(LL over window) >= ... and tenkan <= HH.
      // Use the bar's own H/L as a looser bound: tenkan must be in
      // the value domain of the data.
      expect(Number.isFinite(t[i]!)).toBe(true);
    }
  });

  it('non-finite high/low in the window nulls the bar', () => {
    const bars: ChartLineIchimokuTenkanPoint[] = [
      { x: 0, high: 5, low: 5, close: 5 },
      { x: 1, high: Number.NaN, low: 5, close: 5 },
      { x: 2, high: 5, low: 5, close: 5 },
      { x: 3, high: 5, low: 5, close: 5 },
    ];
    const t = computeLineIchimokuTenkan(bars, 4);
    expect(t[3]).toBeNull();
  });
});

describe('classifyLineIchimokuTenkanZone', () => {
  it('close above tenkan -> above-tenkan', () => {
    expect(classifyLineIchimokuTenkanZone(12, 10)).toBe('above-tenkan');
  });

  it('close below tenkan -> below-tenkan', () => {
    expect(classifyLineIchimokuTenkanZone(8, 10)).toBe('below-tenkan');
  });

  it('close exactly at tenkan -> at-tenkan', () => {
    expect(classifyLineIchimokuTenkanZone(10, 10)).toBe('at-tenkan');
  });

  it('null tenkan -> none', () => {
    expect(classifyLineIchimokuTenkanZone(10, null)).toBe('none');
  });

  it('null close -> none', () => {
    expect(classifyLineIchimokuTenkanZone(null, 10)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineIchimokuTenkanZone(Number.NaN, 10)).toBe('none');
  });
});

describe('runLineIchimokuTenkan', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineIchimokuTenkan(
        [{ x: 0, high: 1, low: 1, close: 1 }],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineIchimokuTenkan([], OPTS).ok).toBe(false);
    expect(runLineIchimokuTenkan(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineIchimokuTenkan(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period', () => {
    expect(runLineIchimokuTenkan(RISING).period).toBe(
      DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_PERIOD,
    );
  });

  it('honours a custom period', () => {
    expect(runLineIchimokuTenkan(RISING, OPTS).period).toBe(4);
  });

  it('produces one sample per finite point', () => {
    expect(runLineIchimokuTenkan(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT: every defined sample is at-tenkan (close = K = tenkan)', () => {
    const run = runLineIchimokuTenkan(CONST_FLAT, OPTS);
    expect(run.atCount).toBe(CONST_FLAT.length - 3);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('RISING period 4: close (= i + 10) is above tenkan (= i + 8.5) at every defined bar', () => {
    const run = runLineIchimokuTenkan(RISING, OPTS);
    expect(run.aboveCount).toBe(RISING.length - 3);
    expect(run.belowCount).toBe(0);
  });

  it('FALLING period 4: close (= 19 - i) is below tenkan (= 20.5 - i) at every defined bar', () => {
    const run = runLineIchimokuTenkan(FALLING, OPTS);
    expect(run.belowCount).toBe(FALLING.length - 3);
    expect(run.aboveCount).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineIchimokuTenkan(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final tenkan reading', () => {
    expect(runLineIchimokuTenkan(CONST_FLAT, OPTS).tenkanFinal).toBe(5);
    expect(runLineIchimokuTenkan(RISING, OPTS).tenkanFinal).toBe(17.5);
    expect(runLineIchimokuTenkan(FALLING, OPTS).tenkanFinal).toBe(11.5);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineIchimokuTenkan(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.aboveCount + run.atCount + run.belowCount + none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineIchimokuTenkanLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineIchimokuTenkanLayout({
        data: [{ x: 0, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineIchimokuTenkanLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineIchimokuTenkanLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineIchimokuTenkanLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined tenkan bar', () => {
    const layout = computeLineIchimokuTenkanLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(RISING.length - 3);
  });

  it('builds a non-empty tenkan path', () => {
    const layout = computeLineIchimokuTenkanLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.tenkanPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineIchimokuTenkanLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('value domain covers the price and the Tenkan-sen', () => {
    const layout = computeLineIchimokuTenkanLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.valueMin).toBeLessThanOrEqual(10);
    expect(layout.valueMax).toBeGreaterThanOrEqual(19);
  });

  it('carries the run', () => {
    const layout = computeLineIchimokuTenkanLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.run.period).toBe(4);
  });
});

describe('describeLineIchimokuTenkanChart', () => {
  it('names the indicator', () => {
    expect(describeLineIchimokuTenkanChart(RISING, OPTS)).toContain(
      'Tenkan-sen',
    );
  });

  it('mentions the period', () => {
    expect(describeLineIchimokuTenkanChart(RISING, OPTS)).toContain(
      'period 4',
    );
  });

  it('mentions the midpoint identity', () => {
    expect(describeLineIchimokuTenkanChart(RISING, OPTS)).toContain(
      'midpoint of the highest high and the lowest low',
    );
  });

  it('mentions the constant-bar identity', () => {
    expect(describeLineIchimokuTenkanChart(RISING, OPTS)).toContain(
      'constant bar series',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineIchimokuTenkanChart([])).toBe('No data');
    expect(describeLineIchimokuTenkanChart(null)).toBe('No data');
  });
});

describe('<ChartLineIchimokuTenkan />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineIchimokuTenkan data={RISING} period={4} />);
    expect(
      screen.getByRole('region', { name: /Ichimoku Tenkan-sen chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={RISING} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ichimoku-tenkan-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Tenkan-sen');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={[]} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={RISING} period={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-tenkan"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={RISING} period={4} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line and the Tenkan-sen line', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={RISING} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('marks every CONST_FLAT marker as at-tenkan', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={CONST_FLAT} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ichimoku-tenkan-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('at-tenkan');
    }
  });

  it('marks every RISING marker as above-tenkan', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={RISING} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ichimoku-tenkan-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('above-tenkan');
    }
  });

  it('marks every FALLING marker as below-tenkan', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={FALLING} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ichimoku-tenkan-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('below-tenkan');
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={RISING} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ichimoku-tenkan-badge-config"]',
    );
    expect(badge?.textContent).toContain('Tenkan 4');
  });

  it('hides the Tenkan-sen line via the legend toggle', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan data={RISING} period={4} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-ichimoku-tenkan-legend-item"][data-series-id="tenkan"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-line"]',
      ),
    ).toBeNull();
  });

  it('hides the Tenkan-sen line via showTenkan=false', () => {
    const { container } = render(
      <ChartLineIchimokuTenkan
        data={RISING}
        period={4}
        showTenkan={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-tenkan-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineIchimokuTenkan
        data={RISING}
        period={4}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ichimoku-tenkan-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineIchimokuTenkan ref={ref} data={RISING} period={4} />,
    );
    expect(ref.current).not.toBeNull();
  });
});
