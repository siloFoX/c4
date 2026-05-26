import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  CHART_LINE_AROON_DOWN_MAX,
  CHART_LINE_AROON_DOWN_MIN,
  ChartLineAroonDown,
  DEFAULT_CHART_LINE_AROON_DOWN_PERIOD,
  DEFAULT_CHART_LINE_AROON_DOWN_THRESHOLD_HIGH,
  DEFAULT_CHART_LINE_AROON_DOWN_THRESHOLD_LOW,
  classifyLineAroonDownZone,
  computeLineAroonDown,
  computeLineAroonDownLayout,
  describeLineAroonDownChart,
  getLineAroonDownFinitePoints,
  normalizeLineAroonDownPeriod,
  normalizeLineAroonDownThreshold,
  runLineAroonDown,
  type ChartLineAroonDownPoint,
} from './chart-line-aroon-down';

const toBars = (lows: number[]): ChartLineAroonDownPoint[] =>
  lows.map((l, i) => ({ x: i, low: l }));

// RISING lows -> lowest is the oldest bar -> aroonDown = 0.
const RISING: ChartLineAroonDownPoint[] = toBars([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);
// FALLING lows -> every bar is a new low -> aroonDown = 100.
const FALLING: ChartLineAroonDownPoint[] = toBars([
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
]);
const CONST_FLAT: ChartLineAroonDownPoint[] = toBars([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);
// Valley at bar 5 (value 1). period 4 window:
// bar 4: lows [6,5,4,3,2], lowest=2 at idx=4 -> aroonDown=100.
// bar 5: lows [5,4,3,2,1], lowest=1 at idx=5 -> 100.
// bar 6: lows [4,3,2,1,2], lowest=1 at idx=5, barsSince=1 -> 75.
// bar 7: lows [3,2,1,2,3], lowest=1 at idx=5, barsSince=2 -> 50.
// bar 8: lows [2,1,2,3,4], lowest=1 at idx=5, barsSince=3 -> 25.
// bar 9: lows [1,2,3,4,5], lowest=1 at idx=5, barsSince=4 -> 0.
const MIXED_VALLEY: ChartLineAroonDownPoint[] = toBars([
  6, 5, 4, 3, 2, 1, 2, 3, 4, 5,
]);
const WAVE: ChartLineAroonDownPoint[] = Array.from(
  { length: 30 },
  (_, i) => ({
    x: i,
    low: 50 + 10 * Math.sin(i * 0.4),
  }),
);

const OPTS = { period: 4, thresholdHigh: 70, thresholdLow: 30 } as const;

describe('getLineAroonDownFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineAroonDownFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineAroonDownFinitePoints(
        'nope' as unknown as ChartLineAroonDownPoint[],
      ),
    ).toEqual([]);
  });

  it('drops points with a non-finite x or low', () => {
    const points: ChartLineAroonDownPoint[] = [
      { x: 0, low: 1 },
      { x: Number.NaN, low: 2 },
      { x: 1, low: Number.POSITIVE_INFINITY },
      { x: 1, low: 1.5 },
    ];
    const out = getLineAroonDownFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 1]);
  });

  it('preserves input order', () => {
    const finite = getLineAroonDownFinitePoints(RISING.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...RISING].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineAroonDownPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineAroonDownPeriod(14, 25)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineAroonDownPeriod(14.9, 25)).toBe(14);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineAroonDownPeriod(0, 25)).toBe(25);
    expect(normalizeLineAroonDownPeriod(-5, 25)).toBe(25);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAroonDownPeriod(Number.NaN, 25)).toBe(25);
  });
});

describe('normalizeLineAroonDownThreshold', () => {
  it('keeps a threshold inside [0, 100]', () => {
    expect(normalizeLineAroonDownThreshold(75, 70)).toBe(75);
  });

  it('falls back for negative', () => {
    expect(normalizeLineAroonDownThreshold(-5, 70)).toBe(70);
  });

  it('falls back above 100', () => {
    expect(normalizeLineAroonDownThreshold(110, 70)).toBe(70);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAroonDownThreshold(Number.NaN, 70)).toBe(70);
  });

  it('accepts 0 and 100 as valid thresholds', () => {
    expect(normalizeLineAroonDownThreshold(0, 70)).toBe(0);
    expect(normalizeLineAroonDownThreshold(100, 70)).toBe(100);
  });
});

describe('computeLineAroonDown', () => {
  it('returns an empty list for non-array', () => {
    expect(
      computeLineAroonDown(
        null as unknown as ChartLineAroonDownPoint[],
        4,
      ),
    ).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineAroonDown(RISING, 4);
    expect(out).toHaveLength(RISING.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineAroonDown(RISING, 4);
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
  });

  it('a strictly rising series drops to 0 at every defined bar (lowest is the oldest, bit-exact)', () => {
    const out = computeLineAroonDown(RISING, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('a strictly falling series pins to 100 at every defined bar (bit-exact)', () => {
    const out = computeLineAroonDown(FALLING, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(100);
  });

  it('a constant series resolves ties to the most-recent (Aroon Down = 100 bit-exact)', () => {
    const out = computeLineAroonDown(CONST_FLAT, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(100);
  });

  it('the worked valley fixture decays in 25-point steps from 100 to 0', () => {
    // lows [6, 5, 4, 3, 2, 1, 2, 3, 4, 5] at period 4:
    // bar 4 lowest=2 idx=4 -> 100.
    // bar 5 lowest=1 idx=5 -> 100.
    // bar 6 lowest=1 idx=5 barsSince=1 -> 75.
    // bar 7 -> 50, bar 8 -> 25, bar 9 -> 0.
    const out = computeLineAroonDown(MIXED_VALLEY, 4);
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
    const out = computeLineAroonDown(WAVE, 4);
    for (const v of out) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(CHART_LINE_AROON_DOWN_MIN);
      expect(v).toBeLessThanOrEqual(CHART_LINE_AROON_DOWN_MAX);
    }
  });
});

describe('classifyLineAroonDownZone', () => {
  it('null -> none', () => {
    expect(classifyLineAroonDownZone(null, 70, 30)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineAroonDownZone(Number.NaN, 70, 30)).toBe('none');
  });

  it('at-or-above the high threshold -> strong', () => {
    expect(classifyLineAroonDownZone(85, 70, 30)).toBe('strong');
    expect(classifyLineAroonDownZone(70, 70, 30)).toBe('strong');
  });

  it('at-or-below the low threshold -> weak', () => {
    expect(classifyLineAroonDownZone(20, 70, 30)).toBe('weak');
    expect(classifyLineAroonDownZone(30, 70, 30)).toBe('weak');
  });

  it('inside the mid band -> mid', () => {
    expect(classifyLineAroonDownZone(50, 70, 30)).toBe('mid');
  });
});

describe('runLineAroonDown', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineAroonDown([{ x: 0, low: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineAroonDown([]).ok).toBe(false);
    expect(runLineAroonDown(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineAroonDown(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period and thresholds', () => {
    const run = runLineAroonDown(RISING);
    expect(run.period).toBe(DEFAULT_CHART_LINE_AROON_DOWN_PERIOD);
    expect(run.thresholdHigh).toBe(
      DEFAULT_CHART_LINE_AROON_DOWN_THRESHOLD_HIGH,
    );
    expect(run.thresholdLow).toBe(
      DEFAULT_CHART_LINE_AROON_DOWN_THRESHOLD_LOW,
    );
  });

  it('honours custom options', () => {
    const run = runLineAroonDown(RISING, OPTS);
    expect(run.period).toBe(4);
    expect(run.thresholdHigh).toBe(70);
    expect(run.thresholdLow).toBe(30);
  });

  it('classifies a rising series as fully weak after the warm-up', () => {
    const run = runLineAroonDown(RISING, OPTS);
    expect(run.weakCount).toBe(RISING.length - 4);
    expect(run.strongCount).toBe(0);
  });

  it('classifies a falling series as fully strong after the warm-up', () => {
    const run = runLineAroonDown(FALLING, OPTS);
    expect(run.strongCount).toBe(FALLING.length - 4);
    expect(run.weakCount).toBe(0);
  });

  it('classifies a constant series as fully strong (most-recent tie -> 100)', () => {
    const run = runLineAroonDown(CONST_FLAT, OPTS);
    expect(run.strongCount).toBe(CONST_FLAT.length - 4);
    expect(run.weakCount).toBe(0);
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineAroonDown(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.strongCount + run.midCount + run.weakCount + none,
    ).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLineAroonDown(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineAroonDown(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final Aroon Down reading', () => {
    const run = runLineAroonDown(RISING, OPTS);
    expect(run.aroonDownFinal).toBe(0);
    expect(runLineAroonDown(FALLING, OPTS).aroonDownFinal).toBe(100);
  });
});

describe('computeLineAroonDownLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineAroonDownLayout({
        data: [{ x: 0, low: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineAroonDownLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineAroonDownLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('stacks the price panel above the aroon panel', () => {
    const layout = computeLineAroonDownLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.aroonPanelTop);
  });

  it('builds non-empty price and aroon paths', () => {
    const layout = computeLineAroonDownLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.aroonPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineAroonDownLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined-aroon bar', () => {
    const layout = computeLineAroonDownLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 4);
  });

  it('the high threshold sits above the low threshold on the y axis', () => {
    const layout = computeLineAroonDownLayout({ data: WAVE, ...OPTS });
    expect(layout.thresholdHighY).toBeLessThan(layout.thresholdLowY);
  });

  it('every marker lies inside the aroon panel', () => {
    const layout = computeLineAroonDownLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cy).toBeGreaterThanOrEqual(layout.aroonPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.aroonPanelBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineAroonDownLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.samples).toHaveLength(RISING.length);
  });
});

describe('describeLineAroonDownChart', () => {
  it('names the indicator', () => {
    expect(describeLineAroonDownChart(RISING, OPTS)).toContain('Aroon Down');
  });

  it('mentions the lookback period', () => {
    expect(describeLineAroonDownChart(RISING, { period: 9 })).toContain(
      'period 9',
    );
  });

  it('mentions the threshold band', () => {
    expect(describeLineAroonDownChart(RISING, OPTS)).toContain('thresholds');
  });

  it('mentions the new-low rule', () => {
    expect(describeLineAroonDownChart(RISING, OPTS)).toContain('new low');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineAroonDownChart([])).toBe('No data');
    expect(describeLineAroonDownChart(null)).toBe('No data');
  });
});

describe('<ChartLineAroonDown />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineAroonDown data={FALLING} period={4} />);
    expect(
      screen.getByRole('region', { name: /Aroon Down chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineAroonDown data={FALLING} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-aroon-down-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Aroon Down');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineAroonDown data={[]} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-aroon-down-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors period and thresholds on the root', () => {
    const { container } = render(
      <ChartLineAroonDown
        data={FALLING}
        period={4}
        thresholdHigh={70}
        thresholdLow={30}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-aroon-down"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold-high')).toBe('70');
    expect(root?.getAttribute('data-threshold-low')).toBe('30');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineAroonDown data={FALLING} period={4} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the low and Aroon Down lines', () => {
    const { container } = render(
      <ChartLineAroonDown data={FALLING} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-down-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-down-aroon-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders the two threshold lines by default', () => {
    const { container } = render(
      <ChartLineAroonDown data={FALLING} period={4} />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-line-aroon-down-threshold-line"]',
    );
    expect(lines).toHaveLength(2);
  });

  it('renders one marker per defined bar', () => {
    const { container } = render(
      <ChartLineAroonDown data={FALLING} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-aroon-down-marker"]',
    );
    expect(markers).toHaveLength(FALLING.length - 4);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(
      <ChartLineAroonDown data={FALLING} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-aroon-down-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect(['strong', 'mid', 'weak']).toContain(zone);
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineAroonDown data={FALLING} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-aroon-down-badge-config"]',
    );
    expect(badge?.textContent).toContain('AROON DOWN 4');
  });

  it('hides the Aroon Down line via the legend toggle', () => {
    const { container } = render(
      <ChartLineAroonDown data={FALLING} period={4} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-aroon-down-legend-item"][data-series-id="aroonDown"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-down-aroon-line"]',
      ),
    ).toBeNull();
  });

  it('hides the threshold lines via showThresholdLines=false', () => {
    const { container } = render(
      <ChartLineAroonDown
        data={FALLING}
        period={4}
        showThresholdLines={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-aroon-down-threshold-line"]',
      ),
    ).toHaveLength(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineAroonDown
        data={FALLING}
        period={4}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-aroon-down-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAroonDown ref={ref} data={FALLING} period={4} />);
    expect(ref.current).not.toBeNull();
  });
});
