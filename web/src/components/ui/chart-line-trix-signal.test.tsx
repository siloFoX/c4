import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineTrixSignal,
  DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD,
  DEFAULT_CHART_LINE_TRIX_SIGNAL_SIGNAL_PERIOD,
  DEFAULT_CHART_LINE_TRIX_SIGNAL_THRESHOLD,
  classifyLineTrixSignalZone,
  computeLineTrixSignal,
  computeLineTrixSignalEma,
  computeLineTrixSignalLayout,
  describeLineTrixSignalChart,
  getLineTrixSignalFinitePoints,
  normalizeLineTrixSignalLength,
  normalizeLineTrixSignalThreshold,
  runLineTrixSignal,
  type ChartLineTrixSignalPoint,
} from './chart-line-trix-signal';

const toPoints = (closes: number[]): ChartLineTrixSignalPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

// CONST_FLAT (close == K > 0): log(K) is a constant, so the EMA-
// of-constant lemma forces ema1 = ema2 = ema3 = log(K) at every
// bar. TRIX = 10000 * (ema3[i] - ema3[i-1]) = 0 bit-exact at every
// defined bar. Signal = EMA(0) = 0 bit-exact.
const CONST_FLAT: ChartLineTrixSignalPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);

const CONST_FLAT_HIGH: ChartLineTrixSignalPoint[] = toPoints([
  1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
]);

const RISING: ChartLineTrixSignalPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40,
]);

const FALLING: ChartLineTrixSignalPoint[] = toPoints([
  40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
]);

const WAVE: ChartLineTrixSignalPoint[] = Array.from(
  { length: 40 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = { period: 4, signalPeriod: 3, threshold: 50 } as const;

describe('getLineTrixSignalFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineTrixSignalFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineTrixSignalFinitePoints(
        'nope' as unknown as ChartLineTrixSignalPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite / non-positive close', () => {
    const points: ChartLineTrixSignalPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 0 },
      { x: 3, close: -1 },
      { x: 4, close: 3 },
    ];
    expect(getLineTrixSignalFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 4, close: 3 },
    ]);
  });
});

describe('normalizeLineTrixSignalLength', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineTrixSignalLength(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineTrixSignalLength(14.9, 14)).toBe(14);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineTrixSignalLength(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineTrixSignalLength(Number.NaN, 14)).toBe(14);
  });
});

describe('normalizeLineTrixSignalThreshold', () => {
  it('keeps a positive finite', () => {
    expect(normalizeLineTrixSignalThreshold(80, 50)).toBe(80);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineTrixSignalThreshold(0, 50)).toBe(50);
    expect(normalizeLineTrixSignalThreshold(-1, 50)).toBe(50);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineTrixSignalThreshold(Number.NaN, 50)).toBe(50);
  });
});

describe('computeLineTrixSignalEma', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineTrixSignalEma([], 4)).toEqual([]);
  });

  it('EMA of a constant equals the constant bit-exact', () => {
    const out = computeLineTrixSignalEma([7, 7, 7, 7, 7, 7], 4);
    for (const v of out) expect(v).toBe(7);
  });

  it('EMA of zero is zero bit-exact', () => {
    const out = computeLineTrixSignalEma([0, 0, 0, 0, 0], 4);
    for (const v of out) expect(v).toBe(0);
  });

  it('first finite value seeds the EMA bit-exact', () => {
    const out = computeLineTrixSignalEma([10, 12, 14], 4);
    expect(out[0]).toBe(10);
  });

  it('null inside propagates without advancing the EMA', () => {
    const out = computeLineTrixSignalEma([5, 5, null, 5], 4);
    expect(out[2]).toBeNull();
  });
});

describe('computeLineTrixSignal', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineTrixSignal(null, 4, 3)).toEqual({
      trix: [],
      signal: [],
    });
    expect(computeLineTrixSignal([], 4, 3)).toEqual({ trix: [], signal: [] });
  });

  it('matches input length on both tracks', () => {
    const out = computeLineTrixSignal(RISING.map((p) => p.close), 4, 3);
    expect(out.trix).toHaveLength(RISING.length);
    expect(out.signal).toHaveLength(RISING.length);
  });

  it('CONST_FLAT: TRIX = 0 bit-exact at every defined bar', () => {
    const out = computeLineTrixSignal(CONST_FLAT.map((p) => p.close), 4, 3);
    // bar 0 is null (no prior ema3).
    expect(out.trix[0]).toBeNull();
    for (let i = 1; i < out.trix.length; i += 1) expect(out.trix[i]).toBe(0);
  });

  it('CONST_FLAT_HIGH: TRIX = 0 bit-exact at every defined bar', () => {
    const out = computeLineTrixSignal(
      CONST_FLAT_HIGH.map((p) => p.close),
      4,
      3,
    );
    expect(out.trix[0]).toBeNull();
    for (let i = 1; i < out.trix.length; i += 1) expect(out.trix[i]).toBe(0);
  });

  it('CONST_FLAT: signal = 0 bit-exact at every defined bar', () => {
    const out = computeLineTrixSignal(CONST_FLAT.map((p) => p.close), 4, 3);
    expect(out.signal[0]).toBeNull();
    for (let i = 1; i < out.signal.length; i += 1) expect(out.signal[i]).toBe(0);
  });

  it('RISING: TRIX is positive once warmed up', () => {
    const out = computeLineTrixSignal(RISING.map((p) => p.close), 4, 3);
    const last = out.trix[out.trix.length - 1]!;
    expect(last).toBeGreaterThan(0);
  });

  it('FALLING: TRIX is negative once warmed up', () => {
    const out = computeLineTrixSignal(FALLING.map((p) => p.close), 4, 3);
    const last = out.trix[out.trix.length - 1]!;
    expect(last).toBeLessThan(0);
  });

  it('reads finite on the wave', () => {
    const out = computeLineTrixSignal(WAVE.map((p) => p.close), 4, 3);
    for (let i = 1; i < out.trix.length; i += 1) {
      const v = out.trix[i];
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('scale invariance: multiplying close by a positive constant leaves TRIX unchanged (log shift)', () => {
    // log(k * c) = log(k) + log(c) -- the additive constant is
    // erased by the bar-over-bar difference, so TRIX is unchanged.
    const a = computeLineTrixSignal(RISING.map((p) => p.close), 4, 3);
    const b = computeLineTrixSignal(
      RISING.map((p) => p.close * 100),
      4,
      3,
    );
    for (let i = 0; i < a.trix.length; i += 1) {
      if (a.trix[i] === null) expect(b.trix[i]).toBeNull();
      else expect(b.trix[i]).toBeCloseTo(a.trix[i]!, 10);
    }
  });

  it('non-positive close drops bars before the cascade', () => {
    // computeLineTrixSignal accepts raw closes; non-positive values
    // null the log. The result has a null at that bar.
    const out = computeLineTrixSignal([5, 5, 0, 5], 4, 3);
    expect(out.trix[2]).toBeNull();
  });
});

describe('classifyLineTrixSignalZone', () => {
  it('value >= threshold -> strong-bull', () => {
    expect(classifyLineTrixSignalZone(60, 50)).toBe('strong-bull');
  });

  it('0 < value < threshold -> bull', () => {
    expect(classifyLineTrixSignalZone(20, 50)).toBe('bull');
  });

  it('value <= -threshold -> strong-bear', () => {
    expect(classifyLineTrixSignalZone(-60, 50)).toBe('strong-bear');
  });

  it('-threshold < value < 0 -> bear', () => {
    expect(classifyLineTrixSignalZone(-20, 50)).toBe('bear');
  });

  it('exactly zero -> flat', () => {
    expect(classifyLineTrixSignalZone(0, 50)).toBe('flat');
  });

  it('null -> none', () => {
    expect(classifyLineTrixSignalZone(null, 50)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineTrixSignalZone(Number.NaN, 50)).toBe('none');
  });
});

describe('runLineTrixSignal', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineTrixSignal([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineTrixSignal([], OPTS).ok).toBe(false);
    expect(runLineTrixSignal(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineTrixSignal(RISING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    const run = runLineTrixSignal(RISING);
    expect(run.period).toBe(DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD);
    expect(run.signalPeriod).toBe(DEFAULT_CHART_LINE_TRIX_SIGNAL_SIGNAL_PERIOD);
    expect(run.threshold).toBe(DEFAULT_CHART_LINE_TRIX_SIGNAL_THRESHOLD);
  });

  it('honours custom options', () => {
    const run = runLineTrixSignal(RISING, OPTS);
    expect(run.period).toBe(4);
    expect(run.signalPeriod).toBe(3);
    expect(run.threshold).toBe(50);
  });

  it('produces one sample per finite point', () => {
    expect(runLineTrixSignal(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT: defined samples are flat (TRIX = 0)', () => {
    const run = runLineTrixSignal(CONST_FLAT, OPTS);
    expect(run.flatCount).toBe(CONST_FLAT.length - 1);
    expect(run.strongBullCount).toBe(0);
    expect(run.strongBearCount).toBe(0);
  });

  it('CONST_FLAT exposes finals as zero bit-exact', () => {
    const run = runLineTrixSignal(CONST_FLAT, OPTS);
    expect(run.trixFinal).toBe(0);
    expect(run.signalFinal).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineTrixSignal(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineTrixSignal(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.strongBullCount +
        run.bullCount +
        run.bearCount +
        run.strongBearCount +
        run.flatCount +
        none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineTrixSignalLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineTrixSignalLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineTrixSignalLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineTrixSignalLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineTrixSignalLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined TRIX bar', () => {
    const layout = computeLineTrixSignalLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 1);
  });

  it('builds non-empty TRIX and signal paths on the wave', () => {
    const layout = computeLineTrixSignalLayout({ data: WAVE, ...OPTS });
    expect(layout.trixPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the TRIX panel', () => {
    const layout = computeLineTrixSignalLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.trixPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.trixPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineTrixSignalLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.trixPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineTrixSignalLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.signalPeriod).toBe(3);
    expect(layout.run.threshold).toBe(50);
  });
});

describe('describeLineTrixSignalChart', () => {
  it('names the indicator', () => {
    expect(describeLineTrixSignalChart(RISING, OPTS)).toContain('TRIX');
  });

  it('mentions the lengths and threshold', () => {
    const desc = describeLineTrixSignalChart(RISING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('signal 3');
    expect(desc).toContain('threshold +/- 50');
  });

  it('mentions the constant-close identity', () => {
    expect(describeLineTrixSignalChart(RISING, OPTS)).toContain(
      'constant close path reads exactly zero',
    );
  });

  it('mentions the triple EMA of log close', () => {
    expect(describeLineTrixSignalChart(RISING, OPTS)).toContain(
      'triple EMA of log(close)',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineTrixSignalChart([])).toBe('No data');
    expect(describeLineTrixSignalChart(null)).toBe('No data');
  });
});

describe('<ChartLineTrixSignal />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineTrixSignal
        data={RISING}
        period={4}
        signalPeriod={3}
        threshold={50}
      />,
    );
    expect(
      screen.getByRole('region', { name: /TRIX \+ signal chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineTrixSignal
        data={RISING}
        period={4}
        signalPeriod={3}
        threshold={50}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trix-signal-aria-desc"]',
    );
    expect(desc?.textContent).toContain('TRIX');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineTrixSignal data={[]} period={4} signalPeriod={3} threshold={50} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trix-signal-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineTrixSignal
        data={RISING}
        period={4}
        signalPeriod={3}
        threshold={50}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-signal"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-signal-period')).toBe('3');
    expect(root?.getAttribute('data-threshold')).toBe('50');
    expect(root?.getAttribute('data-total-points')).toBe(String(RISING.length));
  });

  it('renders the price line and the TRIX line', () => {
    const { container } = render(
      <ChartLineTrixSignal
        data={RISING}
        period={4}
        signalPeriod={3}
        threshold={50}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-signal-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-trix-signal-line"]'),
    ).toBeInTheDocument();
  });

  it('marks every CONST_FLAT marker as flat', () => {
    const { container } = render(
      <ChartLineTrixSignal
        data={CONST_FLAT}
        period={4}
        signalPeriod={3}
        threshold={50}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-trix-signal-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('flat');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineTrixSignal
        data={RISING}
        period={4}
        signalPeriod={3}
        threshold={50}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-trix-signal-badge-config"]',
    );
    expect(badge?.textContent).toContain('TRIX 4/3');
    expect(badge?.textContent).toContain('50');
  });

  it('hides the TRIX line via the legend toggle', () => {
    const { container } = render(
      <ChartLineTrixSignal
        data={RISING}
        period={4}
        signalPeriod={3}
        threshold={50}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-trix-signal-legend-item"][data-series-id="trix"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-trix-signal-line"]'),
    ).toBeNull();
  });

  it('hides the signal line via showSignal=false', () => {
    const { container } = render(
      <ChartLineTrixSignal
        data={RISING}
        period={4}
        signalPeriod={3}
        threshold={50}
        showSignal={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-signal-signal-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineTrixSignal
        data={RISING}
        period={4}
        signalPeriod={3}
        threshold={50}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trix-signal-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineTrixSignal
        ref={ref}
        data={RISING}
        period={4}
        signalPeriod={3}
        threshold={50}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
