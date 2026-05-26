import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  CHART_LINE_RELATIVE_VIGOR_EPSILON,
  ChartLineRelativeVigor,
  DEFAULT_CHART_LINE_RELATIVE_VIGOR_PERIOD,
  DEFAULT_CHART_LINE_RELATIVE_VIGOR_THRESHOLD,
  classifyLineRelativeVigorZone,
  computeLineRelativeVigor,
  computeLineRelativeVigorLayout,
  computeLineRelativeVigorSma,
  computeLineRelativeVigorSwma,
  describeLineRelativeVigorChart,
  getLineRelativeVigorFinitePoints,
  normalizeLineRelativeVigorPeriod,
  normalizeLineRelativeVigorThreshold,
  runLineRelativeVigor,
  type ChartLineRelativeVigorPoint,
} from './chart-line-relative-vigor';

const PERIOD = 4;
// Need at least period + 3 = 7 bars for the first defined RVI.
const N = 14;

const makeBars = (
  open: number,
  high: number,
  low: number,
  close: number,
  count = N,
): ChartLineRelativeVigorPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    open,
    high,
    low,
    close,
  }));

// Constant flat bar: every OHLC field equals K. close - open = 0 and
// high - low = 0, so the denominator is zero -> RVI is null.
const CONST_FLAT: ChartLineRelativeVigorPoint[] = makeBars(5, 5, 5, 5);

// Constant up bar: open = 10, close = 20, high = 20, low = 10.
//   close - open = 10, high - low = 10.
//   SWMA(constant c) = (c + 2c + 2c + c) / 6 = 6c / 6 = c exactly.
//   SMA(c, p) = c exactly.
//   RVI = 10 / 10 = 1 bit-exact at every defined bar.
const CONSTANT_UP: ChartLineRelativeVigorPoint[] = makeBars(10, 20, 10, 20);

// Constant down bar: same range, body inverted.
//   close - open = -10, high - low = 10.
//   RVI = -10 / 10 = -1 bit-exact at every defined bar.
const CONSTANT_DOWN: ChartLineRelativeVigorPoint[] = makeBars(20, 20, 10, 10);

// Wave fixture for layout and "non-empty / finite" coverage.
const WAVE: ChartLineRelativeVigorPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const base = 50 + 10 * Math.sin(i * 0.4);
    const open = base - 1;
    const close = base + 1;
    return { x: i, open, high: base + 2, low: base - 2, close };
  },
);

const OPTS = { period: PERIOD, threshold: 0.5 } as const;

describe('getLineRelativeVigorFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineRelativeVigorFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineRelativeVigorFinitePoints(
        'nope' as unknown as ChartLineRelativeVigorPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineRelativeVigorPoint[] = [
      { x: 0, open: 1, high: 1, low: 1, close: 1 },
      { x: Number.NaN, open: 2, high: 2, low: 2, close: 2 },
      { x: 1, open: 1, high: Number.POSITIVE_INFINITY, low: 0, close: 1 },
      { x: 2, open: 3, high: 3, low: 3, close: 3 },
    ];
    expect(getLineRelativeVigorFinitePoints(points)).toEqual([
      { x: 0, open: 1, high: 1, low: 1, close: 1 },
      { x: 2, open: 3, high: 3, low: 3, close: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineRelativeVigorPoint[] = [
      { x: 0, open: 1, high: 1, low: 2, close: 1.5 },
      { x: 1, open: 2, high: 3, low: 2, close: 2.5 },
    ];
    expect(getLineRelativeVigorFinitePoints(points)).toEqual([
      { x: 1, open: 2, high: 3, low: 2, close: 2.5 },
    ]);
  });
});

describe('normalizeLineRelativeVigorPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineRelativeVigorPeriod(10, 10)).toBe(10);
  });

  it('floors a fractional', () => {
    expect(normalizeLineRelativeVigorPeriod(10.9, 10)).toBe(10);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineRelativeVigorPeriod(1, 10)).toBe(10);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineRelativeVigorPeriod(Number.NaN, 10)).toBe(10);
  });
});

describe('normalizeLineRelativeVigorThreshold', () => {
  it('keeps a positive finite', () => {
    expect(normalizeLineRelativeVigorThreshold(0.6, 0.5)).toBe(0.6);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineRelativeVigorThreshold(0, 0.5)).toBe(0.5);
    expect(normalizeLineRelativeVigorThreshold(-1, 0.5)).toBe(0.5);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineRelativeVigorThreshold(Number.NaN, 0.5)).toBe(0.5);
  });
});

describe('computeLineRelativeVigorSwma', () => {
  it('returns an empty list for non-array', () => {
    expect(computeLineRelativeVigorSwma(null)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineRelativeVigorSwma([1, 2, 3, 4, 5])).toHaveLength(5);
  });

  it('warm-up bars are null', () => {
    const out = computeLineRelativeVigorSwma([1, 2, 3, 4, 5]);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
  });

  it('constant c -> SWMA = c bit-exact (integer 1/2/2/1 sum to 6)', () => {
    const out = computeLineRelativeVigorSwma([10, 10, 10, 10, 10]);
    expect(out[3]).toBe(10);
    expect(out[4]).toBe(10);
  });

  it('worked anchor [1, 2, 3, 4] -> (1 + 2*2 + 2*3 + 4) / 6 = 15 / 6 = 2.5 bit-exact', () => {
    // weights as listed: (current=1 + 2*prev=2 + 2*prev2=3 + prev3=4) / 6
    // Note: indices in the impl are (a + 2b + 2c + d) where a=x[i],
    // b=x[i-1], c=x[i-2], d=x[i-3]. So for [1,2,3,4] at i=3:
    //   (4 + 2 * 3 + 2 * 2 + 1) / 6 = (4 + 6 + 4 + 1) / 6 = 15 / 6 = 2.5
    const out = computeLineRelativeVigorSwma([1, 2, 3, 4]);
    expect(out[3]).toBe(2.5);
  });

  it('non-finite input nulls the bar', () => {
    const out = computeLineRelativeVigorSwma([1, Number.NaN, 3, 4]);
    expect(out[3]).toBeNull();
  });
});

describe('computeLineRelativeVigorSma', () => {
  it('returns an empty list for empty input', () => {
    expect(computeLineRelativeVigorSma([], 4)).toEqual([]);
  });

  it('constant c -> SMA = c bit-exact', () => {
    const out = computeLineRelativeVigorSma([7, 7, 7, 7, 7, 7], 4);
    expect(out[3]).toBe(7);
    expect(out[5]).toBe(7);
  });

  it('warm-up bars are null', () => {
    const out = computeLineRelativeVigorSma([1, 2, 3, 4, 5], 4);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
  });

  it('integer ramp [2, 4, 6, 8] period 4 -> SMA = 5 bit-exact', () => {
    // mean of [2,4,6,8] = 20/4 = 5
    const out = computeLineRelativeVigorSma([2, 4, 6, 8], 4);
    expect(out[3]).toBe(5);
  });
});

describe('computeLineRelativeVigor', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineRelativeVigor(null, 4)).toEqual({
      rvi: [],
      signal: [],
    });
    expect(computeLineRelativeVigor([], 4)).toEqual({ rvi: [], signal: [] });
  });

  it('matches input length on both tracks', () => {
    const out = computeLineRelativeVigor(CONSTANT_UP, PERIOD);
    expect(out.rvi).toHaveLength(N);
    expect(out.signal).toHaveLength(N);
  });

  it('leaves the warm-up bars null', () => {
    const out = computeLineRelativeVigor(CONSTANT_UP, PERIOD);
    // SWMA needs i >= 3 -> num_smooth defined at i >= 3.
    // SMA on top needs period - 1 = 3 further bars -> RVI defined at i >= 6.
    for (let i = 0; i < 6; i += 1) {
      expect(out.rvi[i]).toBeNull();
    }
  });

  it('CONST_FLAT: RVI is null at every bar (zero denominator)', () => {
    const out = computeLineRelativeVigor(CONST_FLAT, PERIOD);
    for (const v of out.rvi) expect(v).toBeNull();
  });

  it('CONSTANT_UP: RVI = 1 bit-exact at every defined bar', () => {
    const out = computeLineRelativeVigor(CONSTANT_UP, PERIOD);
    for (let i = 6; i < N; i += 1) {
      expect(out.rvi[i]).toBe(1);
    }
  });

  it('CONSTANT_DOWN: RVI = -1 bit-exact at every defined bar', () => {
    const out = computeLineRelativeVigor(CONSTANT_DOWN, PERIOD);
    for (let i = 6; i < N; i += 1) {
      expect(out.rvi[i]).toBe(-1);
    }
  });

  it('CONSTANT_UP: signal line = 1 bit-exact once the SWMA of RVI is warm', () => {
    const out = computeLineRelativeVigor(CONSTANT_UP, PERIOD);
    // signal needs i >= 6 + 3 = 9 to be warm.
    for (let i = 9; i < N; i += 1) {
      expect(out.signal[i]).toBe(1);
    }
  });

  it('CONSTANT_DOWN: signal line = -1 bit-exact once the SWMA is warm', () => {
    const out = computeLineRelativeVigor(CONSTANT_DOWN, PERIOD);
    for (let i = 9; i < N; i += 1) {
      expect(out.signal[i]).toBe(-1);
    }
  });

  it('translation invariance: shifting OHLC by k leaves RVI unchanged on CONSTANT_UP', () => {
    const a = computeLineRelativeVigor(CONSTANT_UP, PERIOD);
    const shifted = CONSTANT_UP.map((p) => ({
      ...p,
      open: p.open + 1000,
      high: p.high + 1000,
      low: p.low + 1000,
      close: p.close + 1000,
    }));
    const b = computeLineRelativeVigor(shifted, PERIOD);
    for (let i = 0; i < a.rvi.length; i += 1) {
      if (a.rvi[i] === null) expect(b.rvi[i]).toBeNull();
      else expect(b.rvi[i]).toBe(a.rvi[i]);
    }
  });

  it('reads finite on the wave', () => {
    const out = computeLineRelativeVigor(WAVE, PERIOD);
    for (let i = 6; i < out.rvi.length; i += 1) {
      expect(Number.isFinite(out.rvi[i]!)).toBe(true);
    }
  });

  it('exposes a tiny epsilon constant', () => {
    expect(CHART_LINE_RELATIVE_VIGOR_EPSILON).toBeGreaterThan(0);
    expect(CHART_LINE_RELATIVE_VIGOR_EPSILON).toBeLessThan(1e-6);
  });
});

describe('classifyLineRelativeVigorZone', () => {
  it('value >= threshold -> strong-up', () => {
    expect(classifyLineRelativeVigorZone(0.6, 0.5)).toBe('strong-up');
  });

  it('0 < value < threshold -> up', () => {
    expect(classifyLineRelativeVigorZone(0.3, 0.5)).toBe('up');
  });

  it('value <= -threshold -> strong-down', () => {
    expect(classifyLineRelativeVigorZone(-0.6, 0.5)).toBe('strong-down');
  });

  it('-threshold < value < 0 -> down', () => {
    expect(classifyLineRelativeVigorZone(-0.3, 0.5)).toBe('down');
  });

  it('exactly zero -> flat', () => {
    expect(classifyLineRelativeVigorZone(0, 0.5)).toBe('flat');
  });

  it('null -> none', () => {
    expect(classifyLineRelativeVigorZone(null, 0.5)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineRelativeVigorZone(Number.NaN, 0.5)).toBe('none');
  });
});

describe('runLineRelativeVigor', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineRelativeVigor(
        [{ x: 0, open: 1, high: 1, low: 1, close: 1 }],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineRelativeVigor([], OPTS).ok).toBe(false);
    expect(runLineRelativeVigor(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineRelativeVigor(CONSTANT_UP, OPTS).ok).toBe(true);
  });

  it('uses the default period', () => {
    expect(runLineRelativeVigor(CONSTANT_UP).period).toBe(
      DEFAULT_CHART_LINE_RELATIVE_VIGOR_PERIOD,
    );
  });

  it('uses the default threshold', () => {
    expect(runLineRelativeVigor(CONSTANT_UP).threshold).toBe(
      DEFAULT_CHART_LINE_RELATIVE_VIGOR_THRESHOLD,
    );
  });

  it('produces one sample per finite point', () => {
    expect(runLineRelativeVigor(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONSTANT_UP: defined samples are strong-up (RVI = 1 >= threshold)', () => {
    const run = runLineRelativeVigor(CONSTANT_UP, OPTS);
    expect(run.upCount).toBe(N - 6);
    expect(run.downCount).toBe(0);
  });

  it('CONSTANT_DOWN: defined samples are strong-down (RVI = -1 <= -threshold)', () => {
    const run = runLineRelativeVigor(CONSTANT_DOWN, OPTS);
    expect(run.downCount).toBe(N - 6);
    expect(run.upCount).toBe(0);
  });

  it('exposes the final RVI / signal readings', () => {
    expect(runLineRelativeVigor(CONSTANT_UP, OPTS).rviFinal).toBe(1);
    expect(runLineRelativeVigor(CONSTANT_UP, OPTS).signalFinal).toBe(1);
    expect(runLineRelativeVigor(CONSTANT_DOWN, OPTS).rviFinal).toBe(-1);
    expect(runLineRelativeVigor(CONSTANT_DOWN, OPTS).signalFinal).toBe(-1);
  });

  it('sorts the series by x', () => {
    const shuffled = [...CONSTANT_UP].sort(() => -1);
    const run = runLineRelativeVigor(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineRelativeVigor(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.upCount + run.downCount + run.flatCount + none).toBe(
      run.samples.length,
    );
  });
});

describe('computeLineRelativeVigorLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineRelativeVigorLayout({
        data: [{ x: 0, open: 1, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineRelativeVigorLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineRelativeVigorLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineRelativeVigorLayout({
      data: CONSTANT_UP,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(N);
  });

  it('emits one marker per defined RVI bar', () => {
    const layout = computeLineRelativeVigorLayout({
      data: CONSTANT_UP,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(N - 6);
  });

  it('builds non-empty RVI and signal paths', () => {
    const layout = computeLineRelativeVigorLayout({
      data: CONSTANT_UP,
      ...OPTS,
    });
    expect(layout.rviPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the RVI panel', () => {
    const layout = computeLineRelativeVigorLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.rviPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.rviPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineRelativeVigorLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.rviPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineRelativeVigorLayout({
      data: CONSTANT_UP,
      ...OPTS,
    });
    expect(layout.run.period).toBe(PERIOD);
    expect(layout.run.threshold).toBe(0.5);
  });
});

describe('describeLineRelativeVigorChart', () => {
  it('names the indicator', () => {
    expect(describeLineRelativeVigorChart(CONSTANT_UP, OPTS)).toContain(
      'Relative Vigor Index',
    );
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineRelativeVigorChart(CONSTANT_UP, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold +/- 0.5');
  });

  it('mentions the 1 / 2 / 2 / 1 smoothing', () => {
    expect(describeLineRelativeVigorChart(CONSTANT_UP, OPTS)).toContain(
      '1 / 2 / 2 / 1',
    );
  });

  it('mentions the constant-bar identity', () => {
    expect(describeLineRelativeVigorChart(CONSTANT_UP, OPTS)).toContain(
      'constant up bar',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineRelativeVigorChart([])).toBe('No data');
    expect(describeLineRelativeVigorChart(null)).toBe('No data');
  });
});

describe('<ChartLineRelativeVigor />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    expect(
      screen.getByRole('region', { name: /Relative Vigor Index chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-relative-vigor-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Relative Vigor Index');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineRelativeVigor data={[]} period={PERIOD} threshold={0.5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-relative-vigor"]',
    );
    expect(root?.getAttribute('data-period')).toBe(String(PERIOD));
    expect(root?.getAttribute('data-threshold')).toBe('0.5');
    expect(root?.getAttribute('data-total-points')).toBe(String(N));
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line and the RVI line', () => {
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-rvi-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('marks every CONSTANT_UP marker as strong-up', () => {
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-relative-vigor-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('strong-up');
    }
  });

  it('marks every CONSTANT_DOWN marker as strong-down', () => {
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_DOWN}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-relative-vigor-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('strong-down');
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-relative-vigor-badge-config"]',
    );
    expect(badge?.textContent).toContain('RVI 4');
    expect(badge?.textContent).toContain('0.5');
  });

  it('hides the RVI line via the legend toggle', () => {
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-relative-vigor-legend-item"][data-series-id="rvi"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-rvi-line"]',
      ),
    ).toBeNull();
  });

  it('hides the signal line via showSignal=false', () => {
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
        showSignal={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineRelativeVigor
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-relative-vigor-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineRelativeVigor
        ref={ref}
        data={CONSTANT_UP}
        period={PERIOD}
        threshold={0.5}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
