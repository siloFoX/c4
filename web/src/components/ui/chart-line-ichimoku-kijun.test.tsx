import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineIchimokuKijun,
  DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PERIOD,
  classifyLineIchimokuKijunZone,
  computeLineIchimokuKijun,
  computeLineIchimokuKijunLayout,
  describeLineIchimokuKijunChart,
  getLineIchimokuKijunFinitePoints,
  normalizeLineIchimokuKijunPeriod,
  runLineIchimokuKijun,
  type ChartLineIchimokuKijunPoint,
} from './chart-line-ichimoku-kijun';

const toBars = (
  highs: number[],
  lows: number[] = highs,
  closes: number[] = highs,
): ChartLineIchimokuKijunPoint[] =>
  highs.map((h, i) => ({
    x: i,
    high: h,
    low: lows[i] ?? h,
    close: closes[i] ?? h,
  }));

const CONST_FLAT: ChartLineIchimokuKijunPoint[] = toBars(
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
);

// RISING: high == low == close == i + 10 for i = 0..9.
const RISING: ChartLineIchimokuKijunPoint[] = toBars(
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
);

// FALLING: high == low == close == 19 - i.
const FALLING: ChartLineIchimokuKijunPoint[] = toBars(
  [19, 18, 17, 16, 15, 14, 13, 12, 11, 10],
);

const WAVE: ChartLineIchimokuKijunPoint[] = Array.from(
  { length: 40 },
  (_, i) => {
    const base = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: base + 2, low: base - 2, close: base };
  },
);

const OPTS = { period: 4 } as const;

describe('getLineIchimokuKijunFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineIchimokuKijunFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineIchimokuKijunFinitePoints(
        'nope' as unknown as ChartLineIchimokuKijunPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineIchimokuKijunPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: Number.NaN, high: 2, low: 2, close: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 0, close: 0 },
      { x: 2, high: 3, low: 3, close: 3 },
    ];
    expect(getLineIchimokuKijunFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 2, high: 3, low: 3, close: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineIchimokuKijunPoint[] = [
      { x: 0, high: 1, low: 2, close: 1.5 },
      { x: 1, high: 3, low: 2, close: 2.5 },
    ];
    expect(getLineIchimokuKijunFinitePoints(points)).toEqual([
      { x: 1, high: 3, low: 2, close: 2.5 },
    ]);
  });
});

describe('normalizeLineIchimokuKijunPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineIchimokuKijunPeriod(26, 26)).toBe(26);
  });

  it('floors a fractional', () => {
    expect(normalizeLineIchimokuKijunPeriod(26.9, 26)).toBe(26);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineIchimokuKijunPeriod(0, 26)).toBe(26);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineIchimokuKijunPeriod(Number.NaN, 26)).toBe(26);
  });
});

describe('computeLineIchimokuKijun', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineIchimokuKijun(null, 4)).toEqual([]);
    expect(computeLineIchimokuKijun([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineIchimokuKijun(RISING, 4)).toHaveLength(RISING.length);
  });

  it('leaves the warm-up bars null', () => {
    const k = computeLineIchimokuKijun(RISING, 4);
    for (let i = 0; i < 3; i += 1) expect(k[i]).toBeNull();
  });

  it('CONST_FLAT: kijun = K bit-exact at every defined bar', () => {
    const k = computeLineIchimokuKijun(CONST_FLAT, 4);
    for (let i = 3; i < k.length; i += 1) expect(k[i]).toBe(5);
  });

  it('RISING period 4: kijun[i] = i + 8.5 bit-exact', () => {
    // HH = i + 10, LL = i + 7, kijun = (2i + 17) / 2 = i + 8.5
    const k = computeLineIchimokuKijun(RISING, 4);
    for (let i = 3; i < k.length; i += 1) {
      expect(k[i]).toBe(i + 8.5);
    }
  });

  it('FALLING period 4: kijun[i] = 20.5 - i bit-exact', () => {
    // HH = 22 - i, LL = 19 - i, kijun = (41 - 2i) / 2 = 20.5 - i
    const k = computeLineIchimokuKijun(FALLING, 4);
    for (let i = 3; i < k.length; i += 1) {
      expect(k[i]).toBe(20.5 - i);
    }
  });

  it('RISING period 2: kijun[i] = i + 9.5 bit-exact', () => {
    const k = computeLineIchimokuKijun(RISING, 2);
    for (let i = 1; i < k.length; i += 1) {
      expect(k[i]).toBe(i + 9.5);
    }
  });

  it('period 1: kijun[i] = high[i] bit-exact (high == low here)', () => {
    const k = computeLineIchimokuKijun(RISING, 1);
    for (let i = 0; i < k.length; i += 1) {
      expect(k[i]).toBe(i + 10);
    }
  });

  it('default period 26: needs a 26-bar warm-up', () => {
    const long = Array.from({ length: 30 }, (_, i) => ({
      x: i,
      high: 10,
      low: 10,
      close: 10,
    }));
    const k = computeLineIchimokuKijun(long, 26);
    for (let i = 0; i < 25; i += 1) expect(k[i]).toBeNull();
    for (let i = 25; i < 30; i += 1) expect(k[i]).toBe(10);
  });

  it('translation invariance: shifting high/low by k shifts kijun by exactly k', () => {
    const a = computeLineIchimokuKijun(RISING, 4);
    const shifted = RISING.map((p) => ({
      x: p.x,
      high: p.high + 1000,
      low: p.low + 1000,
      close: p.close + 1000,
    }));
    const b = computeLineIchimokuKijun(shifted, 4);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBe(a[i]! + 1000);
    }
  });

  it('reads finite on the wave', () => {
    const k = computeLineIchimokuKijun(WAVE, 4);
    for (let i = 3; i < k.length; i += 1) {
      expect(Number.isFinite(k[i]!)).toBe(true);
    }
  });

  it('non-finite high/low in the window nulls the bar', () => {
    const bars: ChartLineIchimokuKijunPoint[] = [
      { x: 0, high: 5, low: 5, close: 5 },
      { x: 1, high: Number.NaN, low: 5, close: 5 },
      { x: 2, high: 5, low: 5, close: 5 },
      { x: 3, high: 5, low: 5, close: 5 },
    ];
    const k = computeLineIchimokuKijun(bars, 4);
    expect(k[3]).toBeNull();
  });
});

describe('classifyLineIchimokuKijunZone', () => {
  it('close above kijun -> above-kijun', () => {
    expect(classifyLineIchimokuKijunZone(12, 10)).toBe('above-kijun');
  });

  it('close below kijun -> below-kijun', () => {
    expect(classifyLineIchimokuKijunZone(8, 10)).toBe('below-kijun');
  });

  it('close exactly at kijun -> at-kijun', () => {
    expect(classifyLineIchimokuKijunZone(10, 10)).toBe('at-kijun');
  });

  it('null kijun -> none', () => {
    expect(classifyLineIchimokuKijunZone(10, null)).toBe('none');
  });

  it('null close -> none', () => {
    expect(classifyLineIchimokuKijunZone(null, 10)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineIchimokuKijunZone(Number.NaN, 10)).toBe('none');
  });
});

describe('runLineIchimokuKijun', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineIchimokuKijun(
        [{ x: 0, high: 1, low: 1, close: 1 }],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineIchimokuKijun([], OPTS).ok).toBe(false);
    expect(runLineIchimokuKijun(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineIchimokuKijun(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period 26', () => {
    expect(runLineIchimokuKijun(RISING).period).toBe(
      DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_PERIOD,
    );
  });

  it('honours a custom period', () => {
    expect(runLineIchimokuKijun(RISING, OPTS).period).toBe(4);
  });

  it('produces one sample per finite point', () => {
    expect(runLineIchimokuKijun(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT: every defined sample is at-kijun', () => {
    const run = runLineIchimokuKijun(CONST_FLAT, OPTS);
    expect(run.atCount).toBe(CONST_FLAT.length - 3);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('RISING period 4: close is above kijun at every defined bar', () => {
    const run = runLineIchimokuKijun(RISING, OPTS);
    expect(run.aboveCount).toBe(RISING.length - 3);
    expect(run.belowCount).toBe(0);
  });

  it('FALLING period 4: close is below kijun at every defined bar', () => {
    const run = runLineIchimokuKijun(FALLING, OPTS);
    expect(run.belowCount).toBe(FALLING.length - 3);
    expect(run.aboveCount).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineIchimokuKijun(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final kijun reading', () => {
    expect(runLineIchimokuKijun(CONST_FLAT, OPTS).kijunFinal).toBe(5);
    expect(runLineIchimokuKijun(RISING, OPTS).kijunFinal).toBe(17.5);
    expect(runLineIchimokuKijun(FALLING, OPTS).kijunFinal).toBe(11.5);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineIchimokuKijun(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.aboveCount + run.atCount + run.belowCount + none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineIchimokuKijunLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineIchimokuKijunLayout({
        data: [{ x: 0, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineIchimokuKijunLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineIchimokuKijunLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineIchimokuKijunLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined kijun bar', () => {
    const layout = computeLineIchimokuKijunLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(RISING.length - 3);
  });

  it('builds a non-empty kijun path', () => {
    const layout = computeLineIchimokuKijunLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.kijunPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineIchimokuKijunLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('value domain covers the price and the Kijun-sen', () => {
    const layout = computeLineIchimokuKijunLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.valueMin).toBeLessThanOrEqual(10);
    expect(layout.valueMax).toBeGreaterThanOrEqual(19);
  });

  it('carries the run', () => {
    const layout = computeLineIchimokuKijunLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.run.period).toBe(4);
  });
});

describe('describeLineIchimokuKijunChart', () => {
  it('names the indicator', () => {
    expect(describeLineIchimokuKijunChart(RISING, OPTS)).toContain(
      'Kijun-sen',
    );
  });

  it('mentions the period', () => {
    expect(describeLineIchimokuKijunChart(RISING, OPTS)).toContain(
      'period 4',
    );
  });

  it('mentions the midpoint identity', () => {
    expect(describeLineIchimokuKijunChart(RISING, OPTS)).toContain(
      'midpoint of the highest high and the lowest low',
    );
  });

  it('mentions the constant-bar identity', () => {
    expect(describeLineIchimokuKijunChart(RISING, OPTS)).toContain(
      'constant bar series',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineIchimokuKijunChart([])).toBe('No data');
    expect(describeLineIchimokuKijunChart(null)).toBe('No data');
  });
});

describe('<ChartLineIchimokuKijun />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineIchimokuKijun data={RISING} period={4} />);
    expect(
      screen.getByRole('region', { name: /Ichimoku Kijun-sen chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={RISING} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Kijun-sen');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={[]} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-kijun-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={RISING} period={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={RISING} period={4} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line and the Kijun-sen line', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={RISING} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-kijun-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-kijun-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('marks every CONST_FLAT marker as at-kijun', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={CONST_FLAT} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ichimoku-kijun-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('at-kijun');
    }
  });

  it('marks every RISING marker as above-kijun', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={RISING} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ichimoku-kijun-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('above-kijun');
    }
  });

  it('marks every FALLING marker as below-kijun', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={FALLING} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ichimoku-kijun-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('below-kijun');
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={RISING} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun-badge-config"]',
    );
    expect(badge?.textContent).toContain('Kijun 4');
  });

  it('hides the Kijun-sen line via the legend toggle', () => {
    const { container } = render(
      <ChartLineIchimokuKijun data={RISING} period={4} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun-legend-item"][data-series-id="kijun"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-kijun-line"]',
      ),
    ).toBeNull();
  });

  it('hides the Kijun-sen line via showKijun=false', () => {
    const { container } = render(
      <ChartLineIchimokuKijun
        data={RISING}
        period={4}
        showKijun={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ichimoku-kijun-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineIchimokuKijun
        data={RISING}
        period={4}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ichimoku-kijun-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineIchimokuKijun ref={ref} data={RISING} period={4} />);
    expect(ref.current).not.toBeNull();
  });
});
