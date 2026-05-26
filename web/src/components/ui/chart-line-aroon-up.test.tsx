import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  CHART_LINE_AROON_UP_MAX,
  CHART_LINE_AROON_UP_MIN,
  ChartLineAroonUp,
  DEFAULT_CHART_LINE_AROON_UP_PERIOD,
  DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_HIGH,
  DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_LOW,
  classifyLineAroonUpZone,
  computeLineAroonUp,
  computeLineAroonUpLayout,
  describeLineAroonUpChart,
  getLineAroonUpFinitePoints,
  normalizeLineAroonUpPeriod,
  normalizeLineAroonUpThreshold,
  runLineAroonUp,
  type ChartLineAroonUpPoint,
} from './chart-line-aroon-up';

const toBars = (highs: number[]): ChartLineAroonUpPoint[] =>
  highs.map((h, i) => ({ x: i, high: h }));

const RISING: ChartLineAroonUpPoint[] = toBars([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);
const FALLING: ChartLineAroonUpPoint[] = toBars([
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
]);
const CONST_FLAT: ChartLineAroonUpPoint[] = toBars([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);
// Peak at bar 2 (window 5 ending at bar 4). barsSince = 2 -> aroonUp = 50.
const MIXED_PEAK: ChartLineAroonUpPoint[] = toBars([
  1, 2, 3, 4, 5, 6, 5, 4, 3, 2,
]);
const WAVE: ChartLineAroonUpPoint[] = Array.from({ length: 30 }, (_, i) => ({
  x: i,
  high: 50 + 10 * Math.sin(i * 0.4),
}));

const OPTS = { period: 4, thresholdHigh: 70, thresholdLow: 30 } as const;

describe('getLineAroonUpFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineAroonUpFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineAroonUpFinitePoints('nope' as unknown as ChartLineAroonUpPoint[]),
    ).toEqual([]);
  });

  it('drops points with a non-finite x or high', () => {
    const points: ChartLineAroonUpPoint[] = [
      { x: 0, high: 1 },
      { x: Number.NaN, high: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY },
      { x: 1, high: 1.5 },
    ];
    const out = getLineAroonUpFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 1]);
  });

  it('preserves input order', () => {
    const finite = getLineAroonUpFinitePoints(RISING.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...RISING].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineAroonUpPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineAroonUpPeriod(14, 25)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineAroonUpPeriod(14.9, 25)).toBe(14);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineAroonUpPeriod(0, 25)).toBe(25);
    expect(normalizeLineAroonUpPeriod(-5, 25)).toBe(25);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAroonUpPeriod(Number.NaN, 25)).toBe(25);
  });
});

describe('normalizeLineAroonUpThreshold', () => {
  it('keeps a threshold inside [0, 100]', () => {
    expect(normalizeLineAroonUpThreshold(75, 70)).toBe(75);
  });

  it('falls back for negative', () => {
    expect(normalizeLineAroonUpThreshold(-5, 70)).toBe(70);
  });

  it('falls back above 100', () => {
    expect(normalizeLineAroonUpThreshold(110, 70)).toBe(70);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAroonUpThreshold(Number.NaN, 70)).toBe(70);
  });

  it('accepts 0 and 100 as valid thresholds', () => {
    expect(normalizeLineAroonUpThreshold(0, 70)).toBe(0);
    expect(normalizeLineAroonUpThreshold(100, 70)).toBe(100);
  });
});

describe('computeLineAroonUp', () => {
  it('returns an empty list for non-array', () => {
    expect(
      computeLineAroonUp(
        null as unknown as ChartLineAroonUpPoint[],
        4,
      ),
    ).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineAroonUp(RISING, 4);
    expect(out).toHaveLength(RISING.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineAroonUp(RISING, 4);
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
  });

  it('a strictly rising series pins to 100 at every defined bar (bit-exact)', () => {
    const out = computeLineAroonUp(RISING, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(100);
  });

  it('a strictly falling series drops to 0 at every defined bar (bit-exact)', () => {
    const out = computeLineAroonUp(FALLING, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('a constant series resolves ties to the most-recent (Aroon Up = 100 bit-exact)', () => {
    const out = computeLineAroonUp(CONST_FLAT, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(100);
  });

  it('the worked peak fixture decays in 25-point steps from 100 to 0', () => {
    // highs [1..6, 5..2] at period 4:
    // bar 4 window [0..4]: highs [1,2,3,4,5], highest=5 at idx=4 -> aroonUp=100.
    // bar 5 window [1..5]: highs [2,3,4,5,6], highest=6 at idx=5 -> 100.
    // bar 6 window [2..6]: highs [3,4,5,6,5], highest=6 at idx=5, barsSince=1 -> 75.
    // bar 7 window [3..7]: highs [4,5,6,5,4], highest=6 at idx=5, barsSince=2 -> 50.
    // bar 8 window [4..8]: highs [5,6,5,4,3], highest=6 at idx=5, barsSince=3 -> 25.
    // bar 9 window [5..9]: highs [6,5,4,3,2], highest=6 at idx=5, barsSince=4 -> 0.
    const out = computeLineAroonUp(MIXED_PEAK, 4);
    expect(out).toEqual([
      null,
      null,
      null,
      null,
      100,
      100,
      75,
      50,
      25,
      0,
    ]);
  });

  it('every defined value lies inside [0, 100]', () => {
    const out = computeLineAroonUp(WAVE, 4);
    for (const v of out) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(CHART_LINE_AROON_UP_MIN);
      expect(v).toBeLessThanOrEqual(CHART_LINE_AROON_UP_MAX);
    }
  });
});

describe('classifyLineAroonUpZone', () => {
  it('null -> none', () => {
    expect(classifyLineAroonUpZone(null, 70, 30)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineAroonUpZone(Number.NaN, 70, 30)).toBe('none');
  });

  it('at-or-above the high threshold -> strong', () => {
    expect(classifyLineAroonUpZone(85, 70, 30)).toBe('strong');
    expect(classifyLineAroonUpZone(70, 70, 30)).toBe('strong');
  });

  it('at-or-below the low threshold -> weak', () => {
    expect(classifyLineAroonUpZone(20, 70, 30)).toBe('weak');
    expect(classifyLineAroonUpZone(30, 70, 30)).toBe('weak');
  });

  it('inside the mid band -> mid', () => {
    expect(classifyLineAroonUpZone(50, 70, 30)).toBe('mid');
  });
});

describe('runLineAroonUp', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineAroonUp([{ x: 0, high: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineAroonUp([]).ok).toBe(false);
    expect(runLineAroonUp(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineAroonUp(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period and thresholds', () => {
    const run = runLineAroonUp(RISING);
    expect(run.period).toBe(DEFAULT_CHART_LINE_AROON_UP_PERIOD);
    expect(run.thresholdHigh).toBe(
      DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_HIGH,
    );
    expect(run.thresholdLow).toBe(DEFAULT_CHART_LINE_AROON_UP_THRESHOLD_LOW);
  });

  it('honours custom options', () => {
    const run = runLineAroonUp(RISING, OPTS);
    expect(run.period).toBe(4);
    expect(run.thresholdHigh).toBe(70);
    expect(run.thresholdLow).toBe(30);
  });

  it('classifies a rising series as fully strong after the warm-up', () => {
    const run = runLineAroonUp(RISING, OPTS);
    expect(run.strongCount).toBe(RISING.length - 4);
    expect(run.weakCount).toBe(0);
  });

  it('classifies a falling series as fully weak after the warm-up', () => {
    const run = runLineAroonUp(FALLING, OPTS);
    expect(run.weakCount).toBe(FALLING.length - 4);
    expect(run.strongCount).toBe(0);
  });

  it('classifies a constant series as fully strong (most-recent tie -> 100)', () => {
    const run = runLineAroonUp(CONST_FLAT, OPTS);
    expect(run.strongCount).toBe(CONST_FLAT.length - 4);
    expect(run.weakCount).toBe(0);
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineAroonUp(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.strongCount + run.midCount + run.weakCount + none,
    ).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLineAroonUp(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineAroonUp(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final Aroon Up reading', () => {
    const run = runLineAroonUp(RISING, OPTS);
    expect(run.aroonUpFinal).toBe(100);
    expect(runLineAroonUp(FALLING, OPTS).aroonUpFinal).toBe(0);
  });
});

describe('computeLineAroonUpLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineAroonUpLayout({
        data: [{ x: 0, high: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineAroonUpLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineAroonUpLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('stacks the price panel above the aroon panel', () => {
    const layout = computeLineAroonUpLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.aroonPanelTop);
  });

  it('builds non-empty price and aroon paths', () => {
    const layout = computeLineAroonUpLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.aroonPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineAroonUpLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined-aroon bar', () => {
    const layout = computeLineAroonUpLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 4);
  });

  it('the high threshold sits above the low threshold on the y axis', () => {
    const layout = computeLineAroonUpLayout({ data: WAVE, ...OPTS });
    expect(layout.thresholdHighY).toBeLessThan(layout.thresholdLowY);
  });

  it('every marker lies inside the aroon panel', () => {
    const layout = computeLineAroonUpLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cy).toBeGreaterThanOrEqual(layout.aroonPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.aroonPanelBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineAroonUpLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.samples).toHaveLength(RISING.length);
  });
});

describe('describeLineAroonUpChart', () => {
  it('names the indicator', () => {
    expect(describeLineAroonUpChart(RISING, OPTS)).toContain('Aroon Up');
  });

  it('mentions the lookback period', () => {
    expect(describeLineAroonUpChart(RISING, { period: 9 })).toContain(
      'period 9',
    );
  });

  it('mentions the threshold band', () => {
    expect(describeLineAroonUpChart(RISING, OPTS)).toContain('thresholds');
  });

  it('mentions the new-high rule', () => {
    expect(describeLineAroonUpChart(RISING, OPTS)).toContain('new high');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineAroonUpChart([])).toBe('No data');
    expect(describeLineAroonUpChart(null)).toBe('No data');
  });
});

describe('<ChartLineAroonUp />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineAroonUp data={RISING} period={4} />);
    expect(
      screen.getByRole('region', { name: /Aroon Up chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineAroonUp data={RISING} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-aroon-up-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Aroon Up');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineAroonUp data={[]} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-aroon-up-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors period and thresholds on the root', () => {
    const { container } = render(
      <ChartLineAroonUp
        data={RISING}
        period={4}
        thresholdHigh={70}
        thresholdLow={30}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-aroon-up"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold-high')).toBe('70');
    expect(root?.getAttribute('data-threshold-low')).toBe('30');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineAroonUp data={RISING} period={4} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the high and Aroon Up lines', () => {
    const { container } = render(
      <ChartLineAroonUp data={RISING} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-up-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-up-aroon-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders the two threshold lines by default', () => {
    const { container } = render(
      <ChartLineAroonUp data={RISING} period={4} />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-line-aroon-up-threshold-line"]',
    );
    expect(lines).toHaveLength(2);
  });

  it('renders one marker per defined bar', () => {
    const { container } = render(
      <ChartLineAroonUp data={RISING} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-aroon-up-marker"]',
    );
    expect(markers).toHaveLength(RISING.length - 4);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(
      <ChartLineAroonUp data={RISING} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-aroon-up-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect(['strong', 'mid', 'weak']).toContain(zone);
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineAroonUp data={RISING} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-aroon-up-badge-config"]',
    );
    expect(badge?.textContent).toContain('AROON UP 4');
  });

  it('hides the Aroon Up line via the legend toggle', () => {
    const { container } = render(
      <ChartLineAroonUp data={RISING} period={4} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-aroon-up-legend-item"][data-series-id="aroonUp"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-up-aroon-line"]',
      ),
    ).toBeNull();
  });

  it('hides the threshold lines via showThresholdLines=false', () => {
    const { container } = render(
      <ChartLineAroonUp
        data={RISING}
        period={4}
        showThresholdLines={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-aroon-up-threshold-line"]',
      ),
    ).toHaveLength(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineAroonUp
        data={RISING}
        period={4}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-aroon-up-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAroonUp ref={ref} data={RISING} period={4} />);
    expect(ref.current).not.toBeNull();
  });
});
