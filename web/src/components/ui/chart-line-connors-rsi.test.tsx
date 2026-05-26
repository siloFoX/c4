import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineConnorsRsi,
  DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RANK,
  DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RSI,
  DEFAULT_CHART_LINE_CONNORS_RSI_LEN_STREAK,
  classifyLineConnorsRsiZone,
  computeLineConnorsRsi,
  computeLineConnorsRsiLayout,
  computeLineConnorsRsiPercentRank,
  computeLineConnorsRsiRsi,
  computeLineConnorsRsiStreak,
  describeLineConnorsRsiChart,
  getLineConnorsRsiFinitePoints,
  normalizeLineConnorsRsiLength,
  normalizeLineConnorsRsiThreshold,
  runLineConnorsRsi,
  type ChartLineConnorsRsiPoint,
} from './chart-line-connors-rsi';

const toPoints = (closes: number[]): ChartLineConnorsRsiPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

// CONST_FLAT: every component null -> CRSI null.
const CONST_FLAT: ChartLineConnorsRsiPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);

// ACCELERATING_UP: close = [10, 11, 12, 13, 20]. With lenRsi=3,
// lenStreak=2, lenRank=4 at bar 4:
//   RSI close: all 4 deltas positive -> RSI = 100.
//   Streak: 0,1,2,3,4 -> deltas all +1 -> RSI = 100.
//   Returns: 0.1, 1/11, 1/12, 7/13. Current 7/13 is strictly the
//     largest -> PercentRank = 100.
//   CRSI = (100 + 100 + 100) / 3 = 100 bit-exact.
const ACCELERATING_UP: ChartLineConnorsRsiPoint[] = toPoints([
  10, 11, 12, 13, 20,
]);

// DECELERATING_DOWN: close = [31, 30, 25, 20, 10]. With same
// lengths at bar 4:
//   RSI close: all losses -> RSI = 0.
//   Streak: 0,-1,-2,-3,-4 -> deltas all -1 -> RSI = 0.
//   Returns: -1/31, -5/30, -5/25, -10/20. Current -0.5 is the
//     smallest -> 0 of 3 valid past < current -> PercentRank = 0.
//   CRSI = (0 + 0 + 0) / 3 = 0 bit-exact.
const DECELERATING_DOWN: ChartLineConnorsRsiPoint[] = toPoints([
  31, 30, 25, 20, 10,
]);

const RISING: ChartLineConnorsRsiPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
]);

const FALLING: ChartLineConnorsRsiPoint[] = toPoints([
  19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
]);

const WAVE: ChartLineConnorsRsiPoint[] = Array.from(
  { length: 30 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = {
  lenRsi: 3,
  lenStreak: 2,
  lenRank: 4,
  overbought: 90,
  oversold: 10,
} as const;

describe('getLineConnorsRsiFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineConnorsRsiFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineConnorsRsiFinitePoints(
        'nope' as unknown as ChartLineConnorsRsiPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineConnorsRsiPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 3 },
    ];
    expect(getLineConnorsRsiFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 3 },
    ]);
  });
});

describe('normalizeLineConnorsRsiLength', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineConnorsRsiLength(3, 3)).toBe(3);
  });

  it('floors a fractional', () => {
    expect(normalizeLineConnorsRsiLength(3.9, 3)).toBe(3);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineConnorsRsiLength(1, 3)).toBe(3);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineConnorsRsiLength(Number.NaN, 3)).toBe(3);
  });
});

describe('normalizeLineConnorsRsiThreshold', () => {
  it('keeps a finite in (0, 100)', () => {
    expect(normalizeLineConnorsRsiThreshold(50, 90)).toBe(50);
  });

  it('falls back for boundary / out-of-range', () => {
    expect(normalizeLineConnorsRsiThreshold(0, 90)).toBe(90);
    expect(normalizeLineConnorsRsiThreshold(100, 90)).toBe(90);
    expect(normalizeLineConnorsRsiThreshold(-1, 90)).toBe(90);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineConnorsRsiThreshold(Number.NaN, 90)).toBe(90);
  });
});

describe('computeLineConnorsRsiRsi', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineConnorsRsiRsi([], 3)).toEqual([]);
  });

  it('all gains: RSI = 100 bit-exact', () => {
    const out = computeLineConnorsRsiRsi([10, 11, 12, 13, 14], 3);
    for (let i = 3; i < out.length; i += 1) expect(out[i]).toBe(100);
  });

  it('all losses: RSI = 0 bit-exact', () => {
    const out = computeLineConnorsRsiRsi([14, 13, 12, 11, 10], 3);
    for (let i = 3; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('zero net move: RSI null (zero denominator)', () => {
    const out = computeLineConnorsRsiRsi([5, 5, 5, 5, 5], 3);
    for (const v of out) expect(v).toBeNull();
  });

  it('warm-up bars are null', () => {
    const out = computeLineConnorsRsiRsi([10, 11, 12, 13], 3);
    for (let i = 0; i < 3; i += 1) expect(out[i]).toBeNull();
  });
});

describe('computeLineConnorsRsiStreak', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineConnorsRsiStreak([])).toEqual([]);
  });

  it('CONST_FLAT: streak = 0 at every bar', () => {
    const out = computeLineConnorsRsiStreak(CONST_FLAT.map((p) => p.close));
    for (const v of out) expect(v).toBe(0);
  });

  it('RISING: streak counts 0, 1, 2, 3, ...', () => {
    const out = computeLineConnorsRsiStreak(RISING.map((p) => p.close));
    for (let i = 0; i < out.length; i += 1) expect(out[i]).toBe(i);
  });

  it('FALLING: streak counts 0, -1, -2, -3, ...', () => {
    const out = computeLineConnorsRsiStreak(FALLING.map((p) => p.close));
    expect(out[0]).toBe(0);
    for (let i = 1; i < out.length; i += 1) expect(out[i]).toBe(-i);
  });

  it('reset on direction change: [10, 11, 12, 10] -> [0, 1, 2, -1]', () => {
    const out = computeLineConnorsRsiStreak([10, 11, 12, 10]);
    expect(out).toEqual([0, 1, 2, -1]);
  });

  it('flat bar resets streak to zero', () => {
    const out = computeLineConnorsRsiStreak([10, 11, 11, 12]);
    expect(out).toEqual([0, 1, 0, 1]);
  });

  it('first bar always reads zero', () => {
    expect(computeLineConnorsRsiStreak([5, 4, 3, 2])[0]).toBe(0);
  });
});

describe('computeLineConnorsRsiPercentRank', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineConnorsRsiPercentRank([], 4)).toEqual([]);
  });

  it('first bar is null (no return)', () => {
    const out = computeLineConnorsRsiPercentRank([10, 11, 12, 13], 4);
    expect(out[0]).toBeNull();
  });

  it('second bar is null (no past returns to rank against)', () => {
    const out = computeLineConnorsRsiPercentRank([10, 11, 12, 13], 4);
    expect(out[1]).toBeNull();
  });

  it('ACCELERATING_UP: PercentRank = 100 at bar 4 (current return strictly largest)', () => {
    const out = computeLineConnorsRsiPercentRank(
      ACCELERATING_UP.map((p) => p.close),
      4,
    );
    expect(out[4]).toBe(100);
  });

  it('DECELERATING_DOWN: PercentRank = 0 at bar 4 (current return strictly smallest)', () => {
    const out = computeLineConnorsRsiPercentRank(
      DECELERATING_DOWN.map((p) => p.close),
      4,
    );
    expect(out[4]).toBe(0);
  });

  it('non-positive prev close nulls the return for that bar', () => {
    const out = computeLineConnorsRsiPercentRank([0, 1, 2, 3], 4);
    expect(out[1]).toBeNull();
  });
});

describe('computeLineConnorsRsi', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineConnorsRsi(null, 3, 2, 4)).toEqual({
      rsiClose: [],
      rsiStreak: [],
      rank: [],
      crsi: [],
    });
  });

  it('matches input length on every track', () => {
    const out = computeLineConnorsRsi(ACCELERATING_UP.map((p) => p.close), 3, 2, 4);
    expect(out.crsi).toHaveLength(ACCELERATING_UP.length);
  });

  it('CONST_FLAT: CRSI is null at every bar', () => {
    const out = computeLineConnorsRsi(CONST_FLAT.map((p) => p.close), 3, 2, 4);
    for (const v of out.crsi) expect(v).toBeNull();
  });

  it('ACCELERATING_UP at bar 4: CRSI = 100 bit-exact', () => {
    const out = computeLineConnorsRsi(
      ACCELERATING_UP.map((p) => p.close),
      3,
      2,
      4,
    );
    expect(out.crsi[4]).toBe(100);
  });

  it('DECELERATING_DOWN at bar 4: CRSI = 0 bit-exact', () => {
    const out = computeLineConnorsRsi(
      DECELERATING_DOWN.map((p) => p.close),
      3,
      2,
      4,
    );
    expect(out.crsi[4]).toBe(0);
  });

  it('ACCELERATING_UP at bar 4: every component is 100 bit-exact', () => {
    const out = computeLineConnorsRsi(
      ACCELERATING_UP.map((p) => p.close),
      3,
      2,
      4,
    );
    expect(out.rsiClose[4]).toBe(100);
    expect(out.rsiStreak[4]).toBe(100);
    expect(out.rank[4]).toBe(100);
  });

  it('DECELERATING_DOWN at bar 4: every component is 0 bit-exact', () => {
    const out = computeLineConnorsRsi(
      DECELERATING_DOWN.map((p) => p.close),
      3,
      2,
      4,
    );
    expect(out.rsiClose[4]).toBe(0);
    expect(out.rsiStreak[4]).toBe(0);
    expect(out.rank[4]).toBe(0);
  });

  it('translation invariance fails (% returns depend on baseline) - but RSI and streak survive', () => {
    // PercentRank ratios change when adding a constant, so the full
    // CRSI is not translation-invariant. The RSI legs are.
    const closes = RISING.map((p) => p.close);
    const a = computeLineConnorsRsi(closes, 3, 2, 4);
    const b = computeLineConnorsRsi(closes.map((c) => c + 1000), 3, 2, 4);
    for (let i = 0; i < a.rsiClose.length; i += 1) {
      if (a.rsiClose[i] === null) expect(b.rsiClose[i]).toBeNull();
      else expect(b.rsiClose[i]).toBe(a.rsiClose[i]);
    }
    for (let i = 0; i < a.rsiStreak.length; i += 1) {
      if (a.rsiStreak[i] === null) expect(b.rsiStreak[i]).toBeNull();
      else expect(b.rsiStreak[i]).toBe(a.rsiStreak[i]);
    }
  });

  it('reads finite on the wave', () => {
    const out = computeLineConnorsRsi(WAVE.map((p) => p.close), 3, 2, 4);
    for (let i = 0; i < out.crsi.length; i += 1) {
      const v = out.crsi[i];
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('classifyLineConnorsRsiZone', () => {
  it('value >= overbought -> overbought', () => {
    expect(classifyLineConnorsRsiZone(95, 90, 10)).toBe('overbought');
  });

  it('value <= oversold -> oversold', () => {
    expect(classifyLineConnorsRsiZone(5, 90, 10)).toBe('oversold');
  });

  it('50 < value < overbought -> positive', () => {
    expect(classifyLineConnorsRsiZone(70, 90, 10)).toBe('positive');
  });

  it('oversold < value < 50 -> negative', () => {
    expect(classifyLineConnorsRsiZone(30, 90, 10)).toBe('negative');
  });

  it('null -> none', () => {
    expect(classifyLineConnorsRsiZone(null, 90, 10)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineConnorsRsiZone(Number.NaN, 90, 10)).toBe('none');
  });
});

describe('runLineConnorsRsi', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineConnorsRsi([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineConnorsRsi([], OPTS).ok).toBe(false);
    expect(runLineConnorsRsi(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineConnorsRsi(ACCELERATING_UP, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    const run = runLineConnorsRsi(RISING);
    expect(run.lenRsi).toBe(DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RSI);
    expect(run.lenStreak).toBe(DEFAULT_CHART_LINE_CONNORS_RSI_LEN_STREAK);
    expect(run.lenRank).toBe(DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RANK);
  });

  it('honours custom options', () => {
    const run = runLineConnorsRsi(ACCELERATING_UP, OPTS);
    expect(run.lenRsi).toBe(3);
    expect(run.lenStreak).toBe(2);
    expect(run.lenRank).toBe(4);
    expect(run.overbought).toBe(90);
    expect(run.oversold).toBe(10);
  });

  it('produces one sample per finite point', () => {
    expect(runLineConnorsRsi(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('ACCELERATING_UP at bar 4: zone is overbought (CRSI = 100 >= 90)', () => {
    const run = runLineConnorsRsi(ACCELERATING_UP, OPTS);
    expect(run.samples[4]!.zone).toBe('overbought');
    expect(run.samples[4]!.crsi).toBe(100);
  });

  it('DECELERATING_DOWN at bar 4: zone is oversold (CRSI = 0 <= 10)', () => {
    const run = runLineConnorsRsi(DECELERATING_DOWN, OPTS);
    expect(run.samples[4]!.zone).toBe('oversold');
    expect(run.samples[4]!.crsi).toBe(0);
  });

  it('exposes the final reading', () => {
    expect(runLineConnorsRsi(ACCELERATING_UP, OPTS).crsiFinal).toBe(100);
    expect(runLineConnorsRsi(DECELERATING_DOWN, OPTS).crsiFinal).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineConnorsRsi(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineConnorsRsi(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.overboughtCount +
        run.oversoldCount +
        run.positiveCount +
        run.negativeCount +
        none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineConnorsRsiLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineConnorsRsiLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineConnorsRsiLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineConnorsRsiLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineConnorsRsiLayout({
      data: ACCELERATING_UP,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(ACCELERATING_UP.length);
  });

  it('emits one marker per defined CRSI bar', () => {
    // For ACCELERATING_UP only bar 4 has a defined CRSI (lenRsi=3 needs 3 deltas, so bar 4 is first defined RSI; lenStreak=2 needs streak at i>=2; lenRank=4 needs valid past returns at i>=2).
    const layout = computeLineConnorsRsiLayout({
      data: ACCELERATING_UP,
      ...OPTS,
    });
    // Filter defined CRSI bars from the run.
    let definedCount = 0;
    for (const v of layout.run.crsi) {
      if (v !== null) definedCount += 1;
    }
    expect(layout.markers).toHaveLength(definedCount);
  });

  it('builds a non-empty CRSI path on the wave', () => {
    const layout = computeLineConnorsRsiLayout({ data: WAVE, ...OPTS });
    expect(layout.crsiPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the CRSI panel', () => {
    const layout = computeLineConnorsRsiLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.crsiPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.crsiPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineConnorsRsiLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.crsiPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineConnorsRsiLayout({
      data: ACCELERATING_UP,
      ...OPTS,
    });
    expect(layout.run.lenRsi).toBe(3);
    expect(layout.run.lenStreak).toBe(2);
  });
});

describe('describeLineConnorsRsiChart', () => {
  it('names the indicator', () => {
    expect(describeLineConnorsRsiChart(ACCELERATING_UP, OPTS)).toContain(
      'Connors RSI',
    );
  });

  it('mentions every length and threshold', () => {
    const desc = describeLineConnorsRsiChart(ACCELERATING_UP, OPTS);
    expect(desc).toContain('lenRsi 3');
    expect(desc).toContain('lenStreak 2');
    expect(desc).toContain('lenRank 4');
    expect(desc).toContain('overbought 90');
    expect(desc).toContain('oversold 10');
  });

  it('mentions the accelerating identity', () => {
    expect(describeLineConnorsRsiChart(ACCELERATING_UP, OPTS)).toContain(
      'accelerating up-move',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineConnorsRsiChart([])).toBe('No data');
    expect(describeLineConnorsRsiChart(null)).toBe('No data');
  });
});

describe('<ChartLineConnorsRsi />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineConnorsRsi
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
        overbought={90}
        oversold={10}
      />,
    );
    expect(
      screen.getByRole('region', { name: /Connors RSI chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineConnorsRsi
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
        overbought={90}
        oversold={10}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-connors-rsi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Connors RSI');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineConnorsRsi data={[]} lenRsi={3} lenStreak={2} lenRank={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-connors-rsi-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineConnorsRsi
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
        overbought={90}
        oversold={10}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-connors-rsi"]',
    );
    expect(root?.getAttribute('data-len-rsi')).toBe('3');
    expect(root?.getAttribute('data-len-streak')).toBe('2');
    expect(root?.getAttribute('data-len-rank')).toBe('4');
    expect(root?.getAttribute('data-overbought')).toBe('90');
    expect(root?.getAttribute('data-oversold')).toBe('10');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(ACCELERATING_UP.length),
    );
  });

  it('renders the price line and the CRSI line', () => {
    const { container } = render(
      <ChartLineConnorsRsi
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-connors-rsi-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-connors-rsi-line"]'),
    ).toBeInTheDocument();
  });

  it('marks ACCELERATING_UP final marker as overbought', () => {
    const { container } = render(
      <ChartLineConnorsRsi
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
        overbought={90}
        oversold={10}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-connors-rsi-marker"]',
    );
    expect(markers.length).toBeGreaterThanOrEqual(1);
    expect(markers[markers.length - 1]!.getAttribute('data-zone')).toBe(
      'overbought',
    );
  });

  it('marks DECELERATING_DOWN final marker as oversold', () => {
    const { container } = render(
      <ChartLineConnorsRsi
        data={DECELERATING_DOWN}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
        overbought={90}
        oversold={10}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-connors-rsi-marker"]',
    );
    expect(markers.length).toBeGreaterThanOrEqual(1);
    expect(markers[markers.length - 1]!.getAttribute('data-zone')).toBe(
      'oversold',
    );
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineConnorsRsi
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-connors-rsi-badge-config"]',
    );
    expect(badge?.textContent).toContain('CRSI 3/2/4');
  });

  it('hides the CRSI line via the legend toggle', () => {
    const { container } = render(
      <ChartLineConnorsRsi
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-connors-rsi-legend-item"][data-series-id="crsi"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-connors-rsi-line"]'),
    ).toBeNull();
  });

  it('hides the CRSI line via showCrsi=false', () => {
    const { container } = render(
      <ChartLineConnorsRsi
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
        showCrsi={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-connors-rsi-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineConnorsRsi
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-connors-rsi-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineConnorsRsi
        ref={ref}
        data={ACCELERATING_UP}
        lenRsi={3}
        lenStreak={2}
        lenRank={4}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
