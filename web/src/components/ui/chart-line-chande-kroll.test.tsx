import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineChandeKroll,
  DEFAULT_CHART_LINE_CHANDE_KROLL_ATR_PERIOD,
  DEFAULT_CHART_LINE_CHANDE_KROLL_MULTIPLIER,
  DEFAULT_CHART_LINE_CHANDE_KROLL_STOP_PERIOD,
  classifyLineChandeKrollZone,
  computeLineChandeKroll,
  computeLineChandeKrollLayout,
  computeLineChandeKrollSma,
  computeLineChandeKrollTrueRange,
  describeLineChandeKrollChart,
  getLineChandeKrollFinitePoints,
  normalizeLineChandeKrollMultiplier,
  normalizeLineChandeKrollPeriod,
  runLineChandeKroll,
  type ChartLineChandeKrollPoint,
} from './chart-line-chande-kroll';

const toBars = (
  highs: number[],
  lows: number[] = highs,
  closes: number[] = highs,
): ChartLineChandeKrollPoint[] =>
  highs.map((h, i) => ({
    x: i,
    high: h,
    low: lows[i] ?? h,
    close: closes[i] ?? h,
  }));

// Constant bar: high == low == close == 5 -> TR = 0, ATR = 0, both
// stops collapse to 5.
const CONST_FLAT: ChartLineChandeKrollPoint[] = toBars(
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
);

// Steady-range fixture: high = 11, low = 9, close = 10. TR = 2 on
// every bar. With multiplier = 1: longStop = 11 - 2 = 9, shortStop
// = 9 + 2 = 11.
const STEADY_RANGE: ChartLineChandeKrollPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 11, low: 9, close: 10 }),
);

// Wider steady range: high = 14, low = 6, close = 10. TR = 8 on
// every bar. multiplier = 1: longStop = 14 - 8 = 6, shortStop = 6
// + 8 = 14.
const STEADY_WIDE: ChartLineChandeKrollPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 14, low: 6, close: 10 }),
);

const WAVE: ChartLineChandeKrollPoint[] = Array.from(
  { length: 40 },
  (_, i) => {
    const base = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: base + 2, low: base - 2, close: base };
  },
);

const OPTS = { atrPeriod: 3, stopPeriod: 3, multiplier: 1 } as const;

describe('getLineChandeKrollFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineChandeKrollFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineChandeKrollFinitePoints(
        'nope' as unknown as ChartLineChandeKrollPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineChandeKrollPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: Number.NaN, high: 2, low: 2, close: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 0, close: 0 },
      { x: 2, high: 3, low: 3, close: 3 },
    ];
    expect(getLineChandeKrollFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 2, high: 3, low: 3, close: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineChandeKrollPoint[] = [
      { x: 0, high: 1, low: 2, close: 1.5 },
      { x: 1, high: 3, low: 2, close: 2.5 },
    ];
    expect(getLineChandeKrollFinitePoints(points)).toEqual([
      { x: 1, high: 3, low: 2, close: 2.5 },
    ]);
  });
});

describe('normalizeLineChandeKrollPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineChandeKrollPeriod(10, 10)).toBe(10);
  });

  it('floors a fractional', () => {
    expect(normalizeLineChandeKrollPeriod(10.9, 10)).toBe(10);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineChandeKrollPeriod(0, 10)).toBe(10);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineChandeKrollPeriod(Number.NaN, 10)).toBe(10);
  });
});

describe('normalizeLineChandeKrollMultiplier', () => {
  it('keeps a non-negative finite', () => {
    expect(normalizeLineChandeKrollMultiplier(2, 1)).toBe(2);
    expect(normalizeLineChandeKrollMultiplier(0, 1)).toBe(0);
  });

  it('falls back for negative', () => {
    expect(normalizeLineChandeKrollMultiplier(-1, 1)).toBe(1);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineChandeKrollMultiplier(Number.NaN, 1)).toBe(1);
  });
});

describe('computeLineChandeKrollTrueRange', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineChandeKrollTrueRange(null)).toEqual([]);
    expect(computeLineChandeKrollTrueRange([])).toEqual([]);
  });

  it('CONST_FLAT: TR = 0 at every bar bit-exact', () => {
    const tr = computeLineChandeKrollTrueRange(CONST_FLAT);
    for (const v of tr) expect(v).toBe(0);
  });

  it('STEADY_RANGE: TR = 2 at every bar bit-exact', () => {
    const tr = computeLineChandeKrollTrueRange(STEADY_RANGE);
    for (const v of tr) expect(v).toBe(2);
  });

  it('STEADY_WIDE: TR = 8 at every bar bit-exact', () => {
    const tr = computeLineChandeKrollTrueRange(STEADY_WIDE);
    for (const v of tr) expect(v).toBe(8);
  });

  it('first bar uses high - low (no prior close)', () => {
    const bars = toBars([10], [4], [7]);
    const tr = computeLineChandeKrollTrueRange(bars);
    expect(tr[0]).toBe(6);
  });

  it('uses max(hl, |h - prevClose|, |l - prevClose|) on subsequent bars', () => {
    // prevClose = 5; high = 10, low = 8 -> hl = 2, hc = 5, lc = 3 -> TR = 5
    const bars: ChartLineChandeKrollPoint[] = [
      { x: 0, high: 5, low: 5, close: 5 },
      { x: 1, high: 10, low: 8, close: 9 },
    ];
    const tr = computeLineChandeKrollTrueRange(bars);
    expect(tr[1]).toBe(5);
  });
});

describe('computeLineChandeKrollSma', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineChandeKrollSma([], 4)).toEqual([]);
  });

  it('constant c -> SMA = c bit-exact', () => {
    const out = computeLineChandeKrollSma([7, 7, 7, 7, 7, 7], 4);
    expect(out[3]).toBe(7);
    expect(out[5]).toBe(7);
  });

  it('integer ramp [2, 4, 6, 8] period 4 -> SMA = 5 bit-exact', () => {
    const out = computeLineChandeKrollSma([2, 4, 6, 8], 4);
    expect(out[3]).toBe(5);
  });

  it('null inside the window nulls the bar', () => {
    const out = computeLineChandeKrollSma([1, 2, null, 4], 4);
    expect(out[3]).toBeNull();
  });
});

describe('computeLineChandeKroll', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineChandeKroll(null, 3, 3, 1)).toEqual({
      atr: [],
      levels: [],
    });
    expect(computeLineChandeKroll([], 3, 3, 1)).toEqual({
      atr: [],
      levels: [],
    });
  });

  it('matches input length on both tracks', () => {
    const out = computeLineChandeKroll(STEADY_RANGE, 3, 3, 1);
    expect(out.atr).toHaveLength(STEADY_RANGE.length);
    expect(out.levels).toHaveLength(STEADY_RANGE.length);
  });

  it('CONST_FLAT: ATR = 0, longStop = shortStop = K bit-exact after warm-up', () => {
    const out = computeLineChandeKroll(CONST_FLAT, 3, 3, 1);
    // ATR defined at i >= 2; stops defined at i >= 2 + 3 - 1 = 4.
    for (let i = 2; i < out.atr.length; i += 1) expect(out.atr[i]).toBe(0);
    for (let i = 4; i < out.levels.length; i += 1) {
      expect(out.levels[i]!.longStop).toBe(5);
      expect(out.levels[i]!.shortStop).toBe(5);
    }
  });

  it('STEADY_RANGE mult=1: ATR = 2, longStop = 9, shortStop = 11 bit-exact', () => {
    const out = computeLineChandeKroll(STEADY_RANGE, 3, 3, 1);
    for (let i = 2; i < out.atr.length; i += 1) expect(out.atr[i]).toBe(2);
    for (let i = 4; i < out.levels.length; i += 1) {
      expect(out.levels[i]!.longStop).toBe(9);
      expect(out.levels[i]!.shortStop).toBe(11);
    }
  });

  it('STEADY_WIDE mult=1: ATR = 8, longStop = 6, shortStop = 14 bit-exact', () => {
    const out = computeLineChandeKroll(STEADY_WIDE, 3, 3, 1);
    for (let i = 2; i < out.atr.length; i += 1) expect(out.atr[i]).toBe(8);
    for (let i = 4; i < out.levels.length; i += 1) {
      expect(out.levels[i]!.longStop).toBe(6);
      expect(out.levels[i]!.shortStop).toBe(14);
    }
  });

  it('multiplier = 0: stops collapse to high / low exactly', () => {
    const out = computeLineChandeKroll(STEADY_RANGE, 3, 3, 0);
    for (let i = 4; i < out.levels.length; i += 1) {
      expect(out.levels[i]!.longStop).toBe(11); // high
      expect(out.levels[i]!.shortStop).toBe(9); // low
    }
  });

  it('STEADY_RANGE mult=2: longStop = 11 - 4 = 7, shortStop = 9 + 4 = 13 bit-exact', () => {
    const out = computeLineChandeKroll(STEADY_RANGE, 3, 3, 2);
    for (let i = 4; i < out.levels.length; i += 1) {
      expect(out.levels[i]!.longStop).toBe(7);
      expect(out.levels[i]!.shortStop).toBe(13);
    }
  });

  it('warm-up bars are null on the stops', () => {
    const out = computeLineChandeKroll(STEADY_RANGE, 3, 3, 1);
    for (let i = 0; i < 4; i += 1) {
      expect(out.levels[i]!.longStop).toBeNull();
      expect(out.levels[i]!.shortStop).toBeNull();
    }
  });

  it('translation invariance: shifting OHLC by k shifts the stops by exactly k', () => {
    const a = computeLineChandeKroll(STEADY_RANGE, 3, 3, 1);
    const shifted = STEADY_RANGE.map((p) => ({
      ...p,
      high: p.high + 1000,
      low: p.low + 1000,
      close: p.close + 1000,
    }));
    const b = computeLineChandeKroll(shifted, 3, 3, 1);
    for (let i = 0; i < a.levels.length; i += 1) {
      if (a.levels[i]!.longStop === null) {
        expect(b.levels[i]!.longStop).toBeNull();
      } else {
        expect(b.levels[i]!.longStop).toBe(a.levels[i]!.longStop! + 1000);
        expect(b.levels[i]!.shortStop).toBe(a.levels[i]!.shortStop! + 1000);
      }
    }
  });

  it('reads finite on the wave', () => {
    const out = computeLineChandeKroll(WAVE, 3, 3, 1);
    for (let i = 4; i < out.levels.length; i += 1) {
      expect(Number.isFinite(out.levels[i]!.longStop!)).toBe(true);
      expect(Number.isFinite(out.levels[i]!.shortStop!)).toBe(true);
    }
  });

  it('long stop is less than or equal to short stop in STEADY_RANGE', () => {
    const out = computeLineChandeKroll(STEADY_RANGE, 3, 3, 1);
    for (let i = 4; i < out.levels.length; i += 1) {
      expect(out.levels[i]!.longStop!).toBeLessThanOrEqual(
        out.levels[i]!.shortStop!,
      );
    }
  });
});

describe('classifyLineChandeKrollZone', () => {
  it('close above short stop -> above-short', () => {
    expect(
      classifyLineChandeKrollZone(12, { longStop: 4, shortStop: 8 }),
    ).toBe('above-short');
  });

  it('close below long stop -> below-long', () => {
    expect(
      classifyLineChandeKrollZone(2, { longStop: 4, shortStop: 8 }),
    ).toBe('below-long');
  });

  it('close between stops -> between', () => {
    expect(
      classifyLineChandeKrollZone(6, { longStop: 4, shortStop: 8 }),
    ).toBe('between');
  });

  it('close exactly on a stop boundary -> between', () => {
    expect(
      classifyLineChandeKrollZone(4, { longStop: 4, shortStop: 8 }),
    ).toBe('between');
    expect(
      classifyLineChandeKrollZone(8, { longStop: 4, shortStop: 8 }),
    ).toBe('between');
  });

  it('null close -> none', () => {
    expect(
      classifyLineChandeKrollZone(null, { longStop: 4, shortStop: 8 }),
    ).toBe('none');
  });

  it('null stop -> none', () => {
    expect(
      classifyLineChandeKrollZone(6, { longStop: null, shortStop: 8 }),
    ).toBe('none');
  });
});

describe('runLineChandeKroll', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineChandeKroll(
        [{ x: 0, high: 1, low: 1, close: 1 }],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineChandeKroll([], OPTS).ok).toBe(false);
    expect(runLineChandeKroll(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineChandeKroll(STEADY_RANGE, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    const run = runLineChandeKroll(STEADY_RANGE);
    expect(run.atrPeriod).toBe(DEFAULT_CHART_LINE_CHANDE_KROLL_ATR_PERIOD);
    expect(run.stopPeriod).toBe(DEFAULT_CHART_LINE_CHANDE_KROLL_STOP_PERIOD);
    expect(run.multiplier).toBe(DEFAULT_CHART_LINE_CHANDE_KROLL_MULTIPLIER);
  });

  it('honours custom options', () => {
    const run = runLineChandeKroll(STEADY_RANGE, OPTS);
    expect(run.atrPeriod).toBe(3);
    expect(run.stopPeriod).toBe(3);
    expect(run.multiplier).toBe(1);
  });

  it('produces one sample per finite point', () => {
    expect(runLineChandeKroll(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('STEADY_RANGE: defined samples are between (close is the bar midpoint)', () => {
    const run = runLineChandeKroll(STEADY_RANGE, OPTS);
    expect(run.betweenCount).toBe(STEADY_RANGE.length - 4);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('CONST_FLAT: defined samples are between (longStop == shortStop == close)', () => {
    const run = runLineChandeKroll(CONST_FLAT, OPTS);
    expect(run.betweenCount).toBe(CONST_FLAT.length - 4);
  });

  it('exposes the final stops', () => {
    expect(runLineChandeKroll(CONST_FLAT, OPTS).longFinal).toBe(5);
    expect(runLineChandeKroll(CONST_FLAT, OPTS).shortFinal).toBe(5);
    expect(runLineChandeKroll(STEADY_RANGE, OPTS).longFinal).toBe(9);
    expect(runLineChandeKroll(STEADY_RANGE, OPTS).shortFinal).toBe(11);
  });

  it('sorts the series by x', () => {
    const shuffled = [...STEADY_RANGE].sort(() => -1);
    const run = runLineChandeKroll(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineChandeKroll(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.aboveCount + run.betweenCount + run.belowCount + none).toBe(
      run.samples.length,
    );
  });
});

describe('computeLineChandeKrollLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineChandeKrollLayout({
        data: [{ x: 0, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineChandeKrollLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineChandeKrollLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineChandeKrollLayout({
      data: STEADY_RANGE,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(STEADY_RANGE.length);
  });

  it('emits two stub segments per defined bar (long + short)', () => {
    const layout = computeLineChandeKrollLayout({
      data: STEADY_RANGE,
      ...OPTS,
    });
    expect(layout.segments).toHaveLength((STEADY_RANGE.length - 4) * 2);
  });

  it('builds non-empty long and short paths', () => {
    const layout = computeLineChandeKrollLayout({
      data: STEADY_RANGE,
      ...OPTS,
    });
    expect(layout.longPath.length).toBeGreaterThan(0);
    expect(layout.shortPath.length).toBeGreaterThan(0);
  });

  it('every segment lies inside the panel', () => {
    const layout = computeLineChandeKrollLayout({ data: WAVE, ...OPTS });
    for (const s of layout.segments) {
      expect(s.fromCx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(s.toCx).toBeLessThanOrEqual(layout.innerRight);
      expect(s.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(s.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineChandeKrollLayout({
      data: STEADY_RANGE,
      ...OPTS,
    });
    expect(layout.run.atrPeriod).toBe(3);
    expect(layout.run.stopPeriod).toBe(3);
    expect(layout.run.multiplier).toBe(1);
  });
});

describe('describeLineChandeKrollChart', () => {
  it('names the indicator', () => {
    expect(describeLineChandeKrollChart(STEADY_RANGE, OPTS)).toContain(
      'Chande-Kroll',
    );
  });

  it('mentions the periods and multiplier', () => {
    const desc = describeLineChandeKrollChart(STEADY_RANGE, OPTS);
    expect(desc).toContain('ATR period 3');
    expect(desc).toContain('stop period 3');
    expect(desc).toContain('multiplier 1');
  });

  it('mentions the constant identity', () => {
    expect(describeLineChandeKrollChart(STEADY_RANGE, OPTS)).toContain(
      'constant series collapses both stops',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineChandeKrollChart([])).toBe('No data');
    expect(describeLineChandeKrollChart(null)).toBe('No data');
  });
});

describe('<ChartLineChandeKroll />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineChandeKroll
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
      />,
    );
    expect(
      screen.getByRole('region', { name: /Chande-Kroll Stop chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineChandeKroll
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-chande-kroll-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Chande-Kroll');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineChandeKroll data={[]} atrPeriod={3} stopPeriod={3} multiplier={1} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-chande-kroll-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineChandeKroll
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chande-kroll"]',
    );
    expect(root?.getAttribute('data-atr-period')).toBe('3');
    expect(root?.getAttribute('data-stop-period')).toBe('3');
    expect(root?.getAttribute('data-multiplier')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(STEADY_RANGE.length),
    );
  });

  it('renders the price, long, and short lines', () => {
    const { container } = render(
      <ChartLineChandeKroll
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-kroll-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-kroll-long-line"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-kroll-short-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('marks every STEADY_RANGE marker as between', () => {
    const { container } = render(
      <ChartLineChandeKroll
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-chande-kroll-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('between');
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineChandeKroll
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-chande-kroll-badge-config"]',
    );
    expect(badge?.textContent).toContain('CK 3/3 x1');
  });

  it('hides the long stop via the legend toggle', () => {
    const { container } = render(
      <ChartLineChandeKroll
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-chande-kroll-legend-item"][data-series-id="long"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-kroll-long-line"]',
      ),
    ).toBeNull();
  });

  it('hides the short stop via showShort=false', () => {
    const { container } = render(
      <ChartLineChandeKroll
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
        showShort={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chande-kroll-short-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineChandeKroll
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chande-kroll-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineChandeKroll
        ref={ref}
        data={STEADY_RANGE}
        atrPeriod={3}
        stopPeriod={3}
        multiplier={1}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
