import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  CHART_LINE_FISHER_STOCH_CLAMP,
  ChartLineFisherStoch,
  DEFAULT_CHART_LINE_FISHER_STOCH_PERIOD,
  DEFAULT_CHART_LINE_FISHER_STOCH_THRESHOLD,
  classifyLineFisherStochZone,
  clampLineFisherStoch,
  computeLineFisherStoch,
  computeLineFisherStochLayout,
  describeLineFisherStochChart,
  getLineFisherStochFinitePoints,
  normalizeLineFisherStochPeriod,
  normalizeLineFisherStochThreshold,
  runLineFisherStoch,
  type ChartLineFisherStochPoint,
} from './chart-line-fisher-stoch';

// CONST_FLAT (high == low == close == K): HH == LL -> bar null.
const CONST_FLAT: ChartLineFisherStochPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 5, low: 5, close: 5 }),
);

// AT_MIDPOINT: high == 12, low == 8, close == 10. stochK = (10 -
// 8) / (12 - 8) = 0.5. x = 2 * 0.5 - 1 = 0. atanh(0) = 0 bit-
// exact.
const AT_MIDPOINT: ChartLineFisherStochPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 12, low: 8, close: 10 }),
);

// AT_HIGH: close == high == HH -> stochK = 1 -> x = 1 clamped to
// CLAMP. Fisher = atanh(CLAMP) > 0.
const AT_HIGH: ChartLineFisherStochPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 12, low: 8, close: 12 }),
);

// AT_LOW: close == low == LL -> stochK = 0 -> x = -1 clamped to
// -CLAMP. Fisher = atanh(-CLAMP) < 0.
const AT_LOW: ChartLineFisherStochPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 12, low: 8, close: 8 }),
);

const RISING: ChartLineFisherStochPoint[] = Array.from(
  { length: 20 },
  (_, i) => ({ x: i, high: i + 11, low: i + 9, close: i + 10 }),
);

const WAVE: ChartLineFisherStochPoint[] = Array.from(
  { length: 40 },
  (_, i) => {
    const base = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: base + 2, low: base - 2, close: base };
  },
);

const OPTS = { period: 4, threshold: 1.5 } as const;

describe('getLineFisherStochFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineFisherStochFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineFisherStochFinitePoints(
        'nope' as unknown as ChartLineFisherStochPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineFisherStochPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: Number.NaN, high: 2, low: 2, close: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 0, close: 0 },
      { x: 2, high: 3, low: 3, close: 3 },
    ];
    expect(getLineFisherStochFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 2, high: 3, low: 3, close: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineFisherStochPoint[] = [
      { x: 0, high: 1, low: 2, close: 1.5 },
      { x: 1, high: 3, low: 2, close: 2.5 },
    ];
    expect(getLineFisherStochFinitePoints(points)).toEqual([
      { x: 1, high: 3, low: 2, close: 2.5 },
    ]);
  });
});

describe('normalizeLineFisherStochPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineFisherStochPeriod(10, 10)).toBe(10);
  });

  it('floors a fractional', () => {
    expect(normalizeLineFisherStochPeriod(10.9, 10)).toBe(10);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineFisherStochPeriod(1, 10)).toBe(10);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineFisherStochPeriod(Number.NaN, 10)).toBe(10);
  });
});

describe('normalizeLineFisherStochThreshold', () => {
  it('keeps a positive finite', () => {
    expect(normalizeLineFisherStochThreshold(2, 1.5)).toBe(2);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineFisherStochThreshold(0, 1.5)).toBe(1.5);
    expect(normalizeLineFisherStochThreshold(-1, 1.5)).toBe(1.5);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineFisherStochThreshold(Number.NaN, 1.5)).toBe(1.5);
  });
});

describe('clampLineFisherStoch', () => {
  it('is identity inside (-CLAMP, +CLAMP)', () => {
    expect(clampLineFisherStoch(0)).toBe(0);
    expect(clampLineFisherStoch(0.5)).toBe(0.5);
    expect(clampLineFisherStoch(-0.5)).toBe(-0.5);
  });

  it('caps positive overflow at +CLAMP', () => {
    expect(clampLineFisherStoch(2)).toBe(CHART_LINE_FISHER_STOCH_CLAMP);
  });

  it('caps negative overflow at -CLAMP', () => {
    expect(clampLineFisherStoch(-2)).toBe(-CHART_LINE_FISHER_STOCH_CLAMP);
  });
});

describe('computeLineFisherStoch', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineFisherStoch(null, 4)).toEqual({
      stochK: [],
      fisher: [],
    });
    expect(computeLineFisherStoch([], 4)).toEqual({
      stochK: [],
      fisher: [],
    });
  });

  it('matches input length on both tracks', () => {
    const out = computeLineFisherStoch(AT_MIDPOINT, 4);
    expect(out.stochK).toHaveLength(AT_MIDPOINT.length);
    expect(out.fisher).toHaveLength(AT_MIDPOINT.length);
  });

  it('CONST_FLAT: fisher null at every bar (HH == LL)', () => {
    const out = computeLineFisherStoch(CONST_FLAT, 4);
    for (const v of out.fisher) expect(v).toBeNull();
  });

  it('AT_MIDPOINT: stochK = 0.5 bit-exact at every defined bar', () => {
    const out = computeLineFisherStoch(AT_MIDPOINT, 4);
    for (let i = 3; i < out.stochK.length; i += 1) expect(out.stochK[i]).toBe(0.5);
  });

  it('AT_MIDPOINT: fisher = 0 bit-exact at every defined bar (atanh(0) = 0)', () => {
    const out = computeLineFisherStoch(AT_MIDPOINT, 4);
    for (let i = 3; i < out.fisher.length; i += 1) expect(out.fisher[i]).toBe(0);
  });

  it('AT_HIGH: stochK = 1 and fisher > 0 once warmed up', () => {
    const out = computeLineFisherStoch(AT_HIGH, 4);
    for (let i = 3; i < out.stochK.length; i += 1) {
      expect(out.stochK[i]).toBe(1);
      expect(out.fisher[i]!).toBeGreaterThan(0);
    }
  });

  it('AT_LOW: stochK = 0 and fisher < 0 once warmed up', () => {
    const out = computeLineFisherStoch(AT_LOW, 4);
    for (let i = 3; i < out.stochK.length; i += 1) {
      expect(out.stochK[i]).toBe(0);
      expect(out.fisher[i]!).toBeLessThan(0);
    }
  });

  it('AT_HIGH vs AT_LOW: antisymmetric fisher (same magnitude, opposite sign)', () => {
    const a = computeLineFisherStoch(AT_HIGH, 4);
    const b = computeLineFisherStoch(AT_LOW, 4);
    for (let i = 3; i < a.fisher.length; i += 1) {
      expect(a.fisher[i]).toBeCloseTo(-b.fisher[i]!, 10);
    }
  });

  it('warm-up bars are null', () => {
    const out = computeLineFisherStoch(AT_MIDPOINT, 4);
    for (let i = 0; i < 3; i += 1) {
      expect(out.stochK[i]).toBeNull();
      expect(out.fisher[i]).toBeNull();
    }
  });

  it('reads finite on the wave', () => {
    const out = computeLineFisherStoch(WAVE, 4);
    for (let i = 3; i < out.fisher.length; i += 1) {
      const v = out.fisher[i];
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('translation invariance: shifting OHLC by k leaves stochK and fisher unchanged', () => {
    const a = computeLineFisherStoch(RISING, 4);
    const shifted = RISING.map((p) => ({
      ...p,
      high: p.high + 1000,
      low: p.low + 1000,
      close: p.close + 1000,
    }));
    const b = computeLineFisherStoch(shifted, 4);
    for (let i = 0; i < a.fisher.length; i += 1) {
      if (a.fisher[i] === null) expect(b.fisher[i]).toBeNull();
      else expect(b.fisher[i]).toBe(a.fisher[i]);
    }
  });
});

describe('classifyLineFisherStochZone', () => {
  it('value >= threshold -> peak-bull', () => {
    expect(classifyLineFisherStochZone(2, 1.5)).toBe('peak-bull');
  });

  it('0 < value < threshold -> bull', () => {
    expect(classifyLineFisherStochZone(0.5, 1.5)).toBe('bull');
  });

  it('value <= -threshold -> peak-bear', () => {
    expect(classifyLineFisherStochZone(-2, 1.5)).toBe('peak-bear');
  });

  it('-threshold < value < 0 -> bear', () => {
    expect(classifyLineFisherStochZone(-0.5, 1.5)).toBe('bear');
  });

  it('exactly zero -> flat', () => {
    expect(classifyLineFisherStochZone(0, 1.5)).toBe('flat');
  });

  it('null -> none', () => {
    expect(classifyLineFisherStochZone(null, 1.5)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineFisherStochZone(Number.NaN, 1.5)).toBe('none');
  });
});

describe('runLineFisherStoch', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineFisherStoch([{ x: 0, high: 1, low: 1, close: 1 }], OPTS).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineFisherStoch([], OPTS).ok).toBe(false);
    expect(runLineFisherStoch(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineFisherStoch(AT_MIDPOINT, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineFisherStoch(AT_MIDPOINT).period).toBe(
      DEFAULT_CHART_LINE_FISHER_STOCH_PERIOD,
    );
    expect(runLineFisherStoch(AT_MIDPOINT).threshold).toBe(
      DEFAULT_CHART_LINE_FISHER_STOCH_THRESHOLD,
    );
  });

  it('honours custom options', () => {
    const run = runLineFisherStoch(AT_MIDPOINT, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(1.5);
  });

  it('produces one sample per finite point', () => {
    expect(runLineFisherStoch(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('AT_MIDPOINT: defined samples are flat (fisher = 0)', () => {
    const run = runLineFisherStoch(AT_MIDPOINT, OPTS);
    expect(run.flatCount).toBe(AT_MIDPOINT.length - 3);
  });

  it('exposes the final reading', () => {
    expect(runLineFisherStoch(AT_MIDPOINT, OPTS).fisherFinal).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...AT_MIDPOINT].sort(() => -1);
    const run = runLineFisherStoch(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineFisherStoch(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.peakBullCount +
        run.bullCount +
        run.bearCount +
        run.peakBearCount +
        run.flatCount +
        none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineFisherStochLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineFisherStochLayout({
        data: [{ x: 0, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineFisherStochLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineFisherStochLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineFisherStochLayout({
      data: AT_MIDPOINT,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(AT_MIDPOINT.length);
  });

  it('emits one marker per defined fisher bar', () => {
    const layout = computeLineFisherStochLayout({
      data: AT_MIDPOINT,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(AT_MIDPOINT.length - 3);
  });

  it('builds a non-empty fisher path on AT_HIGH', () => {
    const layout = computeLineFisherStochLayout({ data: AT_HIGH, ...OPTS });
    expect(layout.fisherPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the fisher panel', () => {
    const layout = computeLineFisherStochLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.fisherPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.fisherPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineFisherStochLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.fisherPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineFisherStochLayout({
      data: AT_MIDPOINT,
      ...OPTS,
    });
    expect(layout.run.period).toBe(4);
    expect(layout.run.threshold).toBe(1.5);
  });
});

describe('describeLineFisherStochChart', () => {
  it('names the indicator', () => {
    expect(describeLineFisherStochChart(AT_MIDPOINT, OPTS)).toContain(
      'Fisher Stochastic',
    );
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineFisherStochChart(AT_MIDPOINT, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold +/- 1.5');
  });

  it('mentions the inverse hyperbolic tangent', () => {
    expect(describeLineFisherStochChart(AT_MIDPOINT, OPTS)).toContain(
      'inverse hyperbolic tangent',
    );
  });

  it('mentions the midpoint identity', () => {
    expect(describeLineFisherStochChart(AT_MIDPOINT, OPTS)).toContain(
      'bar-window midpoint',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineFisherStochChart([])).toBe('No data');
    expect(describeLineFisherStochChart(null)).toBe('No data');
  });
});

describe('<ChartLineFisherStoch />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineFisherStoch
        data={AT_MIDPOINT}
        period={4}
        threshold={1.5}
      />,
    );
    expect(
      screen.getByRole('region', { name: /Fisher Stochastic chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineFisherStoch
        data={AT_MIDPOINT}
        period={4}
        threshold={1.5}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-fisher-stoch-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Fisher Stochastic');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineFisherStoch data={[]} period={4} threshold={1.5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-fisher-stoch-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineFisherStoch
        data={AT_MIDPOINT}
        period={4}
        threshold={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fisher-stoch"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('1.5');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(AT_MIDPOINT.length),
    );
  });

  it('renders the price line and the fisher line', () => {
    const { container } = render(
      <ChartLineFisherStoch
        data={AT_HIGH}
        period={4}
        threshold={1.5}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-stoch-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-fisher-stoch-line"]'),
    ).toBeInTheDocument();
  });

  it('marks every AT_MIDPOINT marker as flat (fisher = 0)', () => {
    const { container } = render(
      <ChartLineFisherStoch
        data={AT_MIDPOINT}
        period={4}
        threshold={1.5}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-fisher-stoch-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('flat');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineFisherStoch
        data={AT_MIDPOINT}
        period={4}
        threshold={1.5}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-fisher-stoch-badge-config"]',
    );
    expect(badge?.textContent).toContain('FisherK 4');
    expect(badge?.textContent).toContain('1.5');
  });

  it('hides the fisher line via the legend toggle', () => {
    const { container } = render(
      <ChartLineFisherStoch
        data={AT_HIGH}
        period={4}
        threshold={1.5}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-fisher-stoch-legend-item"][data-series-id="fisher"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-fisher-stoch-line"]'),
    ).toBeNull();
  });

  it('hides the fisher line via showFisher=false', () => {
    const { container } = render(
      <ChartLineFisherStoch
        data={AT_HIGH}
        period={4}
        threshold={1.5}
        showFisher={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-fisher-stoch-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineFisherStoch
        data={AT_MIDPOINT}
        period={4}
        threshold={1.5}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-fisher-stoch-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineFisherStoch
        ref={ref}
        data={AT_MIDPOINT}
        period={4}
        threshold={1.5}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
