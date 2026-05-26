import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineChandeMomentum,
  DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PERIOD,
  DEFAULT_CHART_LINE_CHANDE_MOMENTUM_THRESHOLD,
  classifyLineChandeMomentumZone,
  computeLineChandeMomentum,
  computeLineChandeMomentumLayout,
  describeLineChandeMomentumChart,
  getLineChandeMomentumFinitePoints,
  normalizeLineChandeMomentumPeriod,
  normalizeLineChandeMomentumThreshold,
  runLineChandeMomentum,
  type ChartLineChandeMomentumPoint,
} from './chart-line-chande-momentum';

const toPoints = (closes: number[]): ChartLineChandeMomentumPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

// 10 bars of constant 5 -> every delta zero -> CMO null on every bar.
const CONST_FLAT: ChartLineChandeMomentumPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);

// Monotone rising: every delta = +1. CMO = +100 at every defined bar.
const RISING: ChartLineChandeMomentumPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
]);

// Monotone falling: every delta = -1. CMO = -100 at every defined bar.
const FALLING: ChartLineChandeMomentumPoint[] = toPoints([
  19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
]);

// Alternating +/-1: upSum == downSum -> CMO = 0 at every defined bar.
const ZIGZAG_ZERO: ChartLineChandeMomentumPoint[] = toPoints([
  10, 11, 10, 11, 10, 11, 10, 11, 10, 11,
]);

// 3 ups + 1 down inside the lookback window of 4 -> upSum = 3, downSum =
// 1 -> CMO = 100 * (3 - 1) / 4 = 50 bit-exact at bar 4.
// closes:    10, 11, 12, 13, 12
// deltas:        +1, +1, +1, -1  (window [1..4])
const ASYM_50: ChartLineChandeMomentumPoint[] = toPoints([
  10, 11, 12, 13, 12,
]);

const WAVE: ChartLineChandeMomentumPoint[] = Array.from(
  { length: 30 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = { period: 4, threshold: 50 } as const;

describe('getLineChandeMomentumFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineChandeMomentumFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineChandeMomentumFinitePoints(
        'nope' as unknown as ChartLineChandeMomentumPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x / close', () => {
    const points: ChartLineChandeMomentumPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 3 },
    ];
    expect(getLineChandeMomentumFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 3 },
    ]);
  });
});

describe('normalizeLineChandeMomentumPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineChandeMomentumPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineChandeMomentumPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineChandeMomentumPeriod(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineChandeMomentumPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('normalizeLineChandeMomentumThreshold', () => {
  it('keeps a valid threshold', () => {
    expect(normalizeLineChandeMomentumThreshold(60, 50)).toBe(60);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineChandeMomentumThreshold(0, 50)).toBe(50);
    expect(normalizeLineChandeMomentumThreshold(-10, 50)).toBe(50);
  });

  it('falls back for > 100', () => {
    expect(normalizeLineChandeMomentumThreshold(120, 50)).toBe(50);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineChandeMomentumThreshold(Number.NaN, 50)).toBe(50);
  });
});

describe('computeLineChandeMomentum', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineChandeMomentum(null, 4)).toEqual([]);
    expect(computeLineChandeMomentum([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    expect(
      computeLineChandeMomentum(RISING.map((p) => p.close), 4),
    ).toHaveLength(RISING.length);
  });

  it('leaves the warm-up bars null (first period bars)', () => {
    const c = computeLineChandeMomentum(RISING.map((p) => p.close), 4);
    for (let i = 0; i < 4; i += 1) expect(c[i]).toBeNull();
  });

  it('CONST_FLAT: CMO is null at every bar (zero denominator)', () => {
    const c = computeLineChandeMomentum(CONST_FLAT.map((p) => p.close), 4);
    for (const v of c) expect(v).toBeNull();
  });

  it('RISING: CMO = +100 bit-exact at every defined bar', () => {
    const c = computeLineChandeMomentum(RISING.map((p) => p.close), 4);
    for (let i = 4; i < c.length; i += 1) expect(c[i]).toBe(100);
  });

  it('FALLING: CMO = -100 bit-exact at every defined bar', () => {
    const c = computeLineChandeMomentum(FALLING.map((p) => p.close), 4);
    for (let i = 4; i < c.length; i += 1) expect(c[i]).toBe(-100);
  });

  it('ZIGZAG_ZERO period 4: CMO = 0 bit-exact at every defined bar', () => {
    const c = computeLineChandeMomentum(
      ZIGZAG_ZERO.map((p) => p.close),
      4,
    );
    for (let i = 4; i < c.length; i += 1) expect(c[i]).toBe(0);
  });

  it('ASYM_50 [10,11,12,13,12] period 4: CMO[4] = 50 bit-exact', () => {
    const c = computeLineChandeMomentum(ASYM_50.map((p) => p.close), 4);
    expect(c[4]).toBe(50);
  });

  it('translation invariance: shifting close by k leaves CMO unchanged (deltas unchanged)', () => {
    const a = computeLineChandeMomentum(RISING.map((p) => p.close), 4);
    const b = computeLineChandeMomentum(
      RISING.map((p) => p.close + 1000),
      4,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBe(a[i]);
    }
  });

  it('scale invariance: multiplying close by a positive constant leaves CMO unchanged', () => {
    const a = computeLineChandeMomentum(RISING.map((p) => p.close), 4);
    const b = computeLineChandeMomentum(
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
    const c = computeLineChandeMomentum(closes, 4);
    expect(c[4]).toBeNull();
  });

  it('CMO stays bounded in [-100, +100] on the wave', () => {
    const c = computeLineChandeMomentum(WAVE.map((p) => p.close), 4);
    for (let i = 4; i < c.length; i += 1) {
      if (c[i] === null) continue;
      expect(c[i]!).toBeGreaterThanOrEqual(-100);
      expect(c[i]!).toBeLessThanOrEqual(100);
    }
  });

  it('antisymmetry on RISING vs FALLING: same magnitude, opposite sign', () => {
    const r = computeLineChandeMomentum(RISING.map((p) => p.close), 4);
    const f = computeLineChandeMomentum(FALLING.map((p) => p.close), 4);
    for (let i = 4; i < r.length; i += 1) expect(r[i]).toBe(-f[i]!);
  });
});

describe('classifyLineChandeMomentumZone', () => {
  it('value >= threshold -> overbought', () => {
    expect(classifyLineChandeMomentumZone(60, 50)).toBe('overbought');
  });

  it('value <= -threshold -> oversold', () => {
    expect(classifyLineChandeMomentumZone(-60, 50)).toBe('oversold');
  });

  it('0 < value < threshold -> positive', () => {
    expect(classifyLineChandeMomentumZone(30, 50)).toBe('positive');
  });

  it('-threshold < value < 0 -> negative', () => {
    expect(classifyLineChandeMomentumZone(-30, 50)).toBe('negative');
  });

  it('exactly zero -> flat', () => {
    expect(classifyLineChandeMomentumZone(0, 50)).toBe('flat');
  });

  it('null -> none', () => {
    expect(classifyLineChandeMomentumZone(null, 50)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineChandeMomentumZone(Number.NaN, 50)).toBe('none');
  });
});

describe('runLineChandeMomentum', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineChandeMomentum([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineChandeMomentum([], OPTS).ok).toBe(false);
    expect(runLineChandeMomentum(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineChandeMomentum(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period', () => {
    expect(runLineChandeMomentum(RISING).period).toBe(
      DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PERIOD,
    );
  });

  it('uses the default threshold', () => {
    expect(runLineChandeMomentum(RISING).threshold).toBe(
      DEFAULT_CHART_LINE_CHANDE_MOMENTUM_THRESHOLD,
    );
  });

  it('produces one sample per finite point', () => {
    expect(runLineChandeMomentum(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('RISING: defined samples are overbought (CMO = 100 >= threshold)', () => {
    const run = runLineChandeMomentum(RISING, OPTS);
    expect(run.overboughtCount).toBe(RISING.length - 4);
    expect(run.oversoldCount).toBe(0);
  });

  it('FALLING: defined samples are oversold (CMO = -100 <= -threshold)', () => {
    const run = runLineChandeMomentum(FALLING, OPTS);
    expect(run.oversoldCount).toBe(FALLING.length - 4);
    expect(run.overboughtCount).toBe(0);
  });

  it('ZIGZAG_ZERO: defined samples are flat (CMO = 0)', () => {
    const run = runLineChandeMomentum(ZIGZAG_ZERO, OPTS);
    expect(run.flatCount).toBe(ZIGZAG_ZERO.length - 4);
  });

  it('exposes the final reading', () => {
    expect(runLineChandeMomentum(RISING, OPTS).cmoFinal).toBe(100);
    expect(runLineChandeMomentum(FALLING, OPTS).cmoFinal).toBe(-100);
    expect(runLineChandeMomentum(ZIGZAG_ZERO, OPTS).cmoFinal).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineChandeMomentum(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineChandeMomentum(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.overboughtCount +
        run.oversoldCount +
        run.positiveCount +
        run.negativeCount +
        run.flatCount +
        none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineChandeMomentumLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineChandeMomentumLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineChandeMomentumLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineChandeMomentumLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineChandeMomentumLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined CMO bar', () => {
    const layout = computeLineChandeMomentumLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(RISING.length - 4);
  });

  it('builds a non-empty CMO path', () => {
    const layout = computeLineChandeMomentumLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.cmoPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the CMO panel', () => {
    const layout = computeLineChandeMomentumLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.cmoPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.cmoPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineChandeMomentumLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.cmoPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineChandeMomentumLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.run.period).toBe(4);
    expect(layout.run.threshold).toBe(50);
  });
});

describe('describeLineChandeMomentumChart', () => {
  it('names the indicator', () => {
    expect(describeLineChandeMomentumChart(RISING, OPTS)).toContain(
      'Chande Momentum',
    );
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineChandeMomentumChart(RISING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold +/- 50');
  });

  it('mentions the monotone identities', () => {
    expect(describeLineChandeMomentumChart(RISING, OPTS)).toContain(
      'monotone-rising series reads +100',
    );
  });

  it('mentions the alternating identity', () => {
    expect(describeLineChandeMomentumChart(RISING, OPTS)).toContain(
      'alternating up/down series reads zero',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineChandeMomentumChart([])).toBe('No data');
    expect(describeLineChandeMomentumChart(null)).toBe('No data');
  });
});

describe('<ChartLineChandeMomentum />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineChandeMomentum data={RISING} period={4} threshold={50} />);
    expect(
      screen.getByRole('region', {
        name: /Chande Momentum Oscillator chart/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineChandeMomentum data={RISING} period={4} threshold={50} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-chande-momentum-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Chande Momentum');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineChandeMomentum data={[]} period={4} threshold={50} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-momentum-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(
      <ChartLineChandeMomentum data={RISING} period={4} threshold={50} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chande-momentum"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('50');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders the price line and the CMO line', () => {
    const { container } = render(
      <ChartLineChandeMomentum data={RISING} period={4} threshold={50} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-momentum-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-momentum-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('marks every RISING marker as overbought', () => {
    const { container } = render(
      <ChartLineChandeMomentum data={RISING} period={4} threshold={50} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-chande-momentum-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('overbought');
    }
  });

  it('marks every FALLING marker as oversold', () => {
    const { container } = render(
      <ChartLineChandeMomentum data={FALLING} period={4} threshold={50} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-chande-momentum-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('oversold');
    }
  });

  it('marks every ZIGZAG_ZERO marker as flat', () => {
    const { container } = render(
      <ChartLineChandeMomentum data={ZIGZAG_ZERO} period={4} threshold={50} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-chande-momentum-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('flat');
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineChandeMomentum data={RISING} period={4} threshold={50} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-chande-momentum-badge-config"]',
    );
    expect(badge?.textContent).toContain('CMO 4');
    expect(badge?.textContent).toContain('50');
  });

  it('hides the CMO line via the legend toggle', () => {
    const { container } = render(
      <ChartLineChandeMomentum data={RISING} period={4} threshold={50} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-chande-momentum-legend-item"][data-series-id="cmo"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-momentum-line"]',
      ),
    ).toBeNull();
  });

  it('hides the CMO line via showCmo=false', () => {
    const { container } = render(
      <ChartLineChandeMomentum
        data={RISING}
        period={4}
        threshold={50}
        showCmo={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-momentum-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineChandeMomentum
        data={RISING}
        period={4}
        threshold={50}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chande-momentum-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineChandeMomentum
        ref={ref}
        data={RISING}
        period={4}
        threshold={50}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
