import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineKaufmanEfficiency,
  DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PERIOD,
  DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_THRESHOLD,
  classifyLineKaufmanEfficiencyZone,
  computeLineKaufmanEfficiency,
  computeLineKaufmanEfficiencyLayout,
  describeLineKaufmanEfficiencyChart,
  getLineKaufmanEfficiencyFinitePoints,
  normalizeLineKaufmanEfficiencyPeriod,
  normalizeLineKaufmanEfficiencyThreshold,
  runLineKaufmanEfficiency,
  type ChartLineKaufmanEfficiencyPoint,
} from './chart-line-kaufman-efficiency';

const toPoints = (closes: number[]): ChartLineKaufmanEfficiencyPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

// CONST_FLAT: net = 0 and volSum = 0 -> ER null at every bar.
const CONST_FLAT: ChartLineKaufmanEfficiencyPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);

// Monotone rising: every delta = +1 -> net = period, volSum =
// period -> ER = 1 bit-exact at every defined bar.
const RISING: ChartLineKaufmanEfficiencyPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
]);

// Monotone falling: ER = 1 bit-exact.
const FALLING: ChartLineKaufmanEfficiencyPoint[] = toPoints([
  19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
]);

// Alternating +/-1: at bar 4 with period 4: close[4] = 10,
// close[0] = 10 -> net = 0; volSum = 4 -> ER = 0 bit-exact.
const ZIGZAG_ZERO: ChartLineKaufmanEfficiencyPoint[] = toPoints([
  10, 11, 10, 11, 10, 11, 10, 11, 10, 11,
]);

// Asymmetric: at bar 4 with period 4 -> close[4] - close[0] = 12 -
// 10 = 2; deltas |1|+|1|+|1|+|1| = 4 -> ER = 2 / 4 = 0.5 bit-exact.
const ASYM_HALF: ChartLineKaufmanEfficiencyPoint[] = toPoints([
  10, 11, 12, 11, 12,
]);

const WAVE: ChartLineKaufmanEfficiencyPoint[] = Array.from(
  { length: 30 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = { period: 4, threshold: 0.3 } as const;

describe('getLineKaufmanEfficiencyFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineKaufmanEfficiencyFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineKaufmanEfficiencyFinitePoints(
        'nope' as unknown as ChartLineKaufmanEfficiencyPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x / close', () => {
    const points: ChartLineKaufmanEfficiencyPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 3 },
    ];
    expect(getLineKaufmanEfficiencyFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 3 },
    ]);
  });
});

describe('normalizeLineKaufmanEfficiencyPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineKaufmanEfficiencyPeriod(10, 10)).toBe(10);
  });

  it('floors a fractional', () => {
    expect(normalizeLineKaufmanEfficiencyPeriod(10.9, 10)).toBe(10);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineKaufmanEfficiencyPeriod(1, 10)).toBe(10);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineKaufmanEfficiencyPeriod(Number.NaN, 10)).toBe(10);
  });
});

describe('normalizeLineKaufmanEfficiencyThreshold', () => {
  it('keeps a finite in (0, 1)', () => {
    expect(normalizeLineKaufmanEfficiencyThreshold(0.4, 0.3)).toBe(0.4);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineKaufmanEfficiencyThreshold(0, 0.3)).toBe(0.3);
    expect(normalizeLineKaufmanEfficiencyThreshold(-0.1, 0.3)).toBe(0.3);
  });

  it('falls back for >= 1', () => {
    expect(normalizeLineKaufmanEfficiencyThreshold(1, 0.3)).toBe(0.3);
    expect(normalizeLineKaufmanEfficiencyThreshold(1.5, 0.3)).toBe(0.3);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineKaufmanEfficiencyThreshold(Number.NaN, 0.3)).toBe(0.3);
  });
});

describe('computeLineKaufmanEfficiency', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineKaufmanEfficiency(null, 4)).toEqual([]);
    expect(computeLineKaufmanEfficiency([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    expect(
      computeLineKaufmanEfficiency(RISING.map((p) => p.close), 4),
    ).toHaveLength(RISING.length);
  });

  it('leaves the warm-up bars null (first period bars)', () => {
    const e = computeLineKaufmanEfficiency(RISING.map((p) => p.close), 4);
    for (let i = 0; i < 4; i += 1) expect(e[i]).toBeNull();
  });

  it('CONST_FLAT: ER is null at every bar (zero denominator)', () => {
    const e = computeLineKaufmanEfficiency(CONST_FLAT.map((p) => p.close), 4);
    for (const v of e) expect(v).toBeNull();
  });

  it('RISING: ER = 1 bit-exact at every defined bar', () => {
    const e = computeLineKaufmanEfficiency(RISING.map((p) => p.close), 4);
    for (let i = 4; i < e.length; i += 1) expect(e[i]).toBe(1);
  });

  it('FALLING: ER = 1 bit-exact at every defined bar', () => {
    const e = computeLineKaufmanEfficiency(FALLING.map((p) => p.close), 4);
    for (let i = 4; i < e.length; i += 1) expect(e[i]).toBe(1);
  });

  it('ZIGZAG_ZERO period 4: ER = 0 bit-exact at every defined bar', () => {
    const e = computeLineKaufmanEfficiency(
      ZIGZAG_ZERO.map((p) => p.close),
      4,
    );
    for (let i = 4; i < e.length; i += 1) expect(e[i]).toBe(0);
  });

  it('ASYM_HALF [10,11,12,11,12] period 4: ER[4] = 0.5 bit-exact', () => {
    const e = computeLineKaufmanEfficiency(
      ASYM_HALF.map((p) => p.close),
      4,
    );
    expect(e[4]).toBe(0.5);
  });

  it('translation invariance: shifting close by k leaves ER unchanged', () => {
    const a = computeLineKaufmanEfficiency(RISING.map((p) => p.close), 4);
    const b = computeLineKaufmanEfficiency(
      RISING.map((p) => p.close + 1000),
      4,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBe(a[i]);
    }
  });

  it('scale invariance: multiplying close by a positive constant leaves ER unchanged', () => {
    const a = computeLineKaufmanEfficiency(RISING.map((p) => p.close), 4);
    const b = computeLineKaufmanEfficiency(
      RISING.map((p) => p.close * 100),
      4,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBe(a[i]);
    }
  });

  it('non-finite close in the window nulls the bar', () => {
    const closes = [5, 6, Number.NaN, 8, 9];
    const e = computeLineKaufmanEfficiency(closes, 4);
    expect(e[4]).toBeNull();
  });

  it('ER stays bounded in [0, 1] on the wave', () => {
    const e = computeLineKaufmanEfficiency(WAVE.map((p) => p.close), 4);
    for (let i = 4; i < e.length; i += 1) {
      if (e[i] === null) continue;
      expect(e[i]!).toBeGreaterThanOrEqual(0);
      expect(e[i]!).toBeLessThanOrEqual(1);
    }
  });
});

describe('classifyLineKaufmanEfficiencyZone', () => {
  it('value >= 2 * threshold -> high', () => {
    expect(classifyLineKaufmanEfficiencyZone(0.7, 0.3)).toBe('high');
  });

  it('threshold <= value < 2 * threshold -> medium', () => {
    expect(classifyLineKaufmanEfficiencyZone(0.4, 0.3)).toBe('medium');
  });

  it('value < threshold -> low', () => {
    expect(classifyLineKaufmanEfficiencyZone(0.2, 0.3)).toBe('low');
  });

  it('null -> none', () => {
    expect(classifyLineKaufmanEfficiencyZone(null, 0.3)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineKaufmanEfficiencyZone(Number.NaN, 0.3)).toBe('none');
  });
});

describe('runLineKaufmanEfficiency', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineKaufmanEfficiency([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineKaufmanEfficiency([], OPTS).ok).toBe(false);
    expect(runLineKaufmanEfficiency(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineKaufmanEfficiency(RISING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineKaufmanEfficiency(RISING).period).toBe(
      DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_PERIOD,
    );
    expect(runLineKaufmanEfficiency(RISING).threshold).toBe(
      DEFAULT_CHART_LINE_KAUFMAN_EFFICIENCY_THRESHOLD,
    );
  });

  it('produces one sample per finite point', () => {
    expect(runLineKaufmanEfficiency(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('RISING: defined samples are high (ER = 1 >= 2 * threshold)', () => {
    const run = runLineKaufmanEfficiency(RISING, OPTS);
    expect(run.highCount).toBe(RISING.length - 4);
    expect(run.lowCount).toBe(0);
  });

  it('ZIGZAG_ZERO: defined samples are low (ER = 0 < threshold)', () => {
    const run = runLineKaufmanEfficiency(ZIGZAG_ZERO, OPTS);
    expect(run.lowCount).toBe(ZIGZAG_ZERO.length - 4);
    expect(run.highCount).toBe(0);
  });

  it('exposes the final reading', () => {
    expect(runLineKaufmanEfficiency(RISING, OPTS).erFinal).toBe(1);
    expect(runLineKaufmanEfficiency(FALLING, OPTS).erFinal).toBe(1);
    expect(runLineKaufmanEfficiency(ZIGZAG_ZERO, OPTS).erFinal).toBe(0);
    expect(runLineKaufmanEfficiency(ASYM_HALF, OPTS).erFinal).toBe(0.5);
  });

  it('exposes the maximum reading', () => {
    expect(runLineKaufmanEfficiency(RISING, OPTS).erMax).toBe(1);
    expect(runLineKaufmanEfficiency(ZIGZAG_ZERO, OPTS).erMax).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineKaufmanEfficiency(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineKaufmanEfficiency(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.highCount + run.mediumCount + run.lowCount + none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineKaufmanEfficiencyLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineKaufmanEfficiencyLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineKaufmanEfficiencyLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineKaufmanEfficiencyLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineKaufmanEfficiencyLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined ER bar', () => {
    const layout = computeLineKaufmanEfficiencyLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(RISING.length - 4);
  });

  it('builds a non-empty ER path', () => {
    const layout = computeLineKaufmanEfficiencyLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.erPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the ER panel', () => {
    const layout = computeLineKaufmanEfficiencyLayout({
      data: WAVE,
      ...OPTS,
    });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.erPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.erPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineKaufmanEfficiencyLayout({
      data: WAVE,
      ...OPTS,
    });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.erPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineKaufmanEfficiencyLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.run.period).toBe(4);
    expect(layout.run.threshold).toBe(0.3);
  });
});

describe('describeLineKaufmanEfficiencyChart', () => {
  it('names the indicator', () => {
    expect(describeLineKaufmanEfficiencyChart(RISING, OPTS)).toContain(
      'Efficiency Ratio',
    );
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineKaufmanEfficiencyChart(RISING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold 0.3');
  });

  it('mentions the monotone identity', () => {
    expect(describeLineKaufmanEfficiencyChart(RISING, OPTS)).toContain(
      'monotone trend reads +1',
    );
  });

  it('mentions the choppy identity', () => {
    expect(describeLineKaufmanEfficiencyChart(RISING, OPTS)).toContain(
      'perfectly choppy series',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineKaufmanEfficiencyChart([])).toBe('No data');
    expect(describeLineKaufmanEfficiencyChart(null)).toBe('No data');
  });
});

describe('<ChartLineKaufmanEfficiency />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineKaufmanEfficiency
        data={RISING}
        period={4}
        threshold={0.3}
      />,
    );
    expect(
      screen.getByRole('region', { name: /Kaufman Efficiency Ratio chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineKaufmanEfficiency
        data={RISING}
        period={4}
        threshold={0.3}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-kaufman-efficiency-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Efficiency Ratio');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineKaufmanEfficiency data={[]} period={4} threshold={0.3} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kaufman-efficiency-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(
      <ChartLineKaufmanEfficiency
        data={RISING}
        period={4}
        threshold={0.3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kaufman-efficiency"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('0.3');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders the price line and the ER line', () => {
    const { container } = render(
      <ChartLineKaufmanEfficiency
        data={RISING}
        period={4}
        threshold={0.3}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kaufman-efficiency-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-kaufman-efficiency-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('marks every RISING marker as high', () => {
    const { container } = render(
      <ChartLineKaufmanEfficiency
        data={RISING}
        period={4}
        threshold={0.3}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-kaufman-efficiency-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('high');
    }
  });

  it('marks every ZIGZAG_ZERO marker as low', () => {
    const { container } = render(
      <ChartLineKaufmanEfficiency
        data={ZIGZAG_ZERO}
        period={4}
        threshold={0.3}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-kaufman-efficiency-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('low');
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineKaufmanEfficiency
        data={RISING}
        period={4}
        threshold={0.3}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-kaufman-efficiency-badge-config"]',
    );
    expect(badge?.textContent).toContain('ER 4');
    expect(badge?.textContent).toContain('0.3');
  });

  it('hides the ER line via the legend toggle', () => {
    const { container } = render(
      <ChartLineKaufmanEfficiency
        data={RISING}
        period={4}
        threshold={0.3}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-kaufman-efficiency-legend-item"][data-series-id="er"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-kaufman-efficiency-line"]',
      ),
    ).toBeNull();
  });

  it('hides the ER line via showEr=false', () => {
    const { container } = render(
      <ChartLineKaufmanEfficiency
        data={RISING}
        period={4}
        threshold={0.3}
        showEr={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kaufman-efficiency-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineKaufmanEfficiency
        data={RISING}
        period={4}
        threshold={0.3}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kaufman-efficiency-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineKaufmanEfficiency
        ref={ref}
        data={RISING}
        period={4}
        threshold={0.3}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
