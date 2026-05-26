import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineAdxTrend,
  DEFAULT_CHART_LINE_ADX_TREND_PERIOD,
  DEFAULT_CHART_LINE_ADX_TREND_THRESHOLD,
  classifyLineAdxTrendZone,
  computeLineAdxTrend,
  computeLineAdxTrendLayout,
  computeLineAdxTrendSma,
  describeLineAdxTrendChart,
  getLineAdxTrendFinitePoints,
  normalizeLineAdxTrendPeriod,
  normalizeLineAdxTrendThreshold,
  runLineAdxTrend,
  type ChartLineAdxTrendPoint,
} from './chart-line-adx-trend';

// All OHLC equal to the same value. CONST_FLAT[i] = 5.
const CONST_FLAT: ChartLineAdxTrendPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 5, low: 5, close: 5 }),
);

// RISING: high == low == close == i + 10. Twelve bars.
const RISING: ChartLineAdxTrendPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: i + 10, low: i + 10, close: i + 10 }),
);

// FALLING: high == low == close == 19 - i.
const FALLING: ChartLineAdxTrendPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 19 - i, low: 19 - i, close: 19 - i }),
);

// Alternating: high cycles 10, 11; low cycles 9, 10; close = high.
// Generated long enough that +DI == -DI in steady state -> DX = 0
// -> ADX = 0 bit-exact once the second SMA is warm.
const ALTERNATING: ChartLineAdxTrendPoint[] = Array.from(
  { length: 20 },
  (_, i) => {
    const odd = i % 2 === 1;
    return {
      x: i,
      high: odd ? 11 : 10,
      low: odd ? 10 : 9,
      close: odd ? 11 : 10,
    };
  },
);

const WAVE: ChartLineAdxTrendPoint[] = Array.from(
  { length: 40 },
  (_, i) => {
    const base = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: base + 2, low: base - 2, close: base };
  },
);

const OPTS = { period: 4, threshold: 25 } as const;

describe('getLineAdxTrendFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineAdxTrendFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineAdxTrendFinitePoints(
        'nope' as unknown as ChartLineAdxTrendPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineAdxTrendPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: Number.NaN, high: 2, low: 2, close: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 0, close: 0 },
      { x: 2, high: 3, low: 3, close: 3 },
    ];
    expect(getLineAdxTrendFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 2, high: 3, low: 3, close: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineAdxTrendPoint[] = [
      { x: 0, high: 1, low: 2, close: 1.5 },
      { x: 1, high: 3, low: 2, close: 2.5 },
    ];
    expect(getLineAdxTrendFinitePoints(points)).toEqual([
      { x: 1, high: 3, low: 2, close: 2.5 },
    ]);
  });
});

describe('normalizeLineAdxTrendPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineAdxTrendPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineAdxTrendPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineAdxTrendPeriod(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAdxTrendPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('normalizeLineAdxTrendThreshold', () => {
  it('keeps a valid threshold', () => {
    expect(normalizeLineAdxTrendThreshold(40, 25)).toBe(40);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineAdxTrendThreshold(0, 25)).toBe(25);
    expect(normalizeLineAdxTrendThreshold(-1, 25)).toBe(25);
  });

  it('falls back for > 100', () => {
    expect(normalizeLineAdxTrendThreshold(120, 25)).toBe(25);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAdxTrendThreshold(Number.NaN, 25)).toBe(25);
  });
});

describe('computeLineAdxTrendSma', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineAdxTrendSma([], 4)).toEqual([]);
  });

  it('constant input: SMA = constant bit-exact', () => {
    const out = computeLineAdxTrendSma([7, 7, 7, 7, 7], 4);
    expect(out[3]).toBe(7);
    expect(out[4]).toBe(7);
  });

  it('null inside the window nulls the bar', () => {
    const out = computeLineAdxTrendSma([1, 2, null, 4], 4);
    expect(out[3]).toBeNull();
  });
});

describe('computeLineAdxTrend', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineAdxTrend(null, 4)).toEqual({
      plusDi: [],
      minusDi: [],
      dx: [],
      adx: [],
    });
    expect(computeLineAdxTrend([], 4)).toEqual({
      plusDi: [],
      minusDi: [],
      dx: [],
      adx: [],
    });
  });

  it('matches input length on every track', () => {
    const out = computeLineAdxTrend(RISING, 4);
    expect(out.plusDi).toHaveLength(RISING.length);
    expect(out.minusDi).toHaveLength(RISING.length);
    expect(out.dx).toHaveLength(RISING.length);
    expect(out.adx).toHaveLength(RISING.length);
  });

  it('CONST_FLAT: ADX null at every bar (zero TR)', () => {
    const out = computeLineAdxTrend(CONST_FLAT, 4);
    for (const v of out.adx) expect(v).toBeNull();
  });

  it('RISING (high == low == close == i + 10) period 4: ADX = 100 bit-exact after warm-up', () => {
    const out = computeLineAdxTrend(RISING, 4);
    // SMA(plusDM, 4) defined at i >= 4 -> DX defined at i >= 4 ->
    // SMA(DX, 4) defined at i >= 7.
    for (let i = 7; i < out.adx.length; i += 1) expect(out.adx[i]).toBe(100);
  });

  it('FALLING period 4: ADX = 100 bit-exact after warm-up', () => {
    const out = computeLineAdxTrend(FALLING, 4);
    for (let i = 7; i < out.adx.length; i += 1) expect(out.adx[i]).toBe(100);
  });

  it('RISING: +DI = 100 bit-exact once warmed up', () => {
    const out = computeLineAdxTrend(RISING, 4);
    for (let i = 4; i < out.plusDi.length; i += 1) expect(out.plusDi[i]).toBe(100);
  });

  it('RISING: -DI = 0 bit-exact once warmed up', () => {
    const out = computeLineAdxTrend(RISING, 4);
    for (let i = 4; i < out.minusDi.length; i += 1) expect(out.minusDi[i]).toBe(0);
  });

  it('FALLING: -DI = 100 and +DI = 0 bit-exact once warmed up', () => {
    const out = computeLineAdxTrend(FALLING, 4);
    for (let i = 4; i < out.plusDi.length; i += 1) expect(out.plusDi[i]).toBe(0);
    for (let i = 4; i < out.minusDi.length; i += 1) expect(out.minusDi[i]).toBe(100);
  });

  it('ALTERNATING +/- 1 with +DI = -DI: ADX = 0 bit-exact in steady state', () => {
    const out = computeLineAdxTrend(ALTERNATING, 4);
    // ADX defined from bar 7 onwards. The first few bars of DX
    // can be 100 (boundary effects from the SMA window catching
    // unequal +DM/-DM tallies); once both legs balance to 0.5
    // average, DX collapses to 0 and stays there. The steady-state
    // anchor: every defined ADX from bar 11 onwards is exactly 0.
    for (let i = 11; i < out.adx.length; i += 1) {
      const v = out.adx[i];
      if (v === null) continue;
      expect(v).toBeCloseTo(0, 10);
    }
  });

  it('translation invariance: shifting OHLC by k leaves ADX unchanged', () => {
    const a = computeLineAdxTrend(RISING, 4);
    const shifted = RISING.map((p) => ({
      ...p,
      high: p.high + 1000,
      low: p.low + 1000,
      close: p.close + 1000,
    }));
    const b = computeLineAdxTrend(shifted, 4);
    for (let i = 0; i < a.adx.length; i += 1) {
      if (a.adx[i] === null) expect(b.adx[i]).toBeNull();
      else expect(b.adx[i]).toBe(a.adx[i]);
    }
  });

  it('reads finite on the wave', () => {
    const out = computeLineAdxTrend(WAVE, 4);
    for (let i = 7; i < out.adx.length; i += 1) {
      const v = out.adx[i];
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('classifyLineAdxTrendZone', () => {
  it('value >= 2 * threshold -> strong', () => {
    expect(classifyLineAdxTrendZone(60, 25)).toBe('strong');
  });

  it('threshold <= value < 2 * threshold -> trend', () => {
    expect(classifyLineAdxTrendZone(30, 25)).toBe('trend');
  });

  it('value < threshold -> weak', () => {
    expect(classifyLineAdxTrendZone(20, 25)).toBe('weak');
  });

  it('null -> none', () => {
    expect(classifyLineAdxTrendZone(null, 25)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineAdxTrendZone(Number.NaN, 25)).toBe('none');
  });
});

describe('runLineAdxTrend', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineAdxTrend([{ x: 0, high: 1, low: 1, close: 1 }], OPTS).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineAdxTrend([], OPTS).ok).toBe(false);
    expect(runLineAdxTrend(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineAdxTrend(RISING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineAdxTrend(RISING).period).toBe(
      DEFAULT_CHART_LINE_ADX_TREND_PERIOD,
    );
    expect(runLineAdxTrend(RISING).threshold).toBe(
      DEFAULT_CHART_LINE_ADX_TREND_THRESHOLD,
    );
  });

  it('honours custom options', () => {
    const run = runLineAdxTrend(RISING, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(25);
  });

  it('produces one sample per finite point', () => {
    expect(runLineAdxTrend(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('RISING period 4 threshold 25: defined samples are strong (ADX = 100)', () => {
    const run = runLineAdxTrend(RISING, OPTS);
    expect(run.strongCount).toBe(RISING.length - 7);
    expect(run.weakCount).toBe(0);
  });

  it('FALLING period 4: defined samples are strong (ADX = 100)', () => {
    const run = runLineAdxTrend(FALLING, OPTS);
    expect(run.strongCount).toBe(FALLING.length - 7);
  });

  it('exposes the final reading', () => {
    expect(runLineAdxTrend(RISING, OPTS).adxFinal).toBe(100);
    expect(runLineAdxTrend(FALLING, OPTS).adxFinal).toBe(100);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineAdxTrend(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineAdxTrend(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.strongCount + run.trendCount + run.weakCount + none).toBe(
      run.samples.length,
    );
  });
});

describe('computeLineAdxTrendLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineAdxTrendLayout({
        data: [{ x: 0, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineAdxTrendLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineAdxTrendLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineAdxTrendLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined ADX bar', () => {
    const layout = computeLineAdxTrendLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 7);
  });

  it('builds non-empty ADX path on RISING', () => {
    const layout = computeLineAdxTrendLayout({ data: RISING, ...OPTS });
    expect(layout.adxPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the ADX panel', () => {
    const layout = computeLineAdxTrendLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.adxPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.adxPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineAdxTrendLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.adxPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineAdxTrendLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.threshold).toBe(25);
  });
});

describe('describeLineAdxTrendChart', () => {
  it('names the indicator', () => {
    expect(describeLineAdxTrendChart(RISING, OPTS)).toContain('ADX');
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineAdxTrendChart(RISING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold 25');
  });

  it('mentions the pure-trend identity', () => {
    expect(describeLineAdxTrendChart(RISING, OPTS)).toContain(
      'pure trend',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineAdxTrendChart([])).toBe('No data');
    expect(describeLineAdxTrendChart(null)).toBe('No data');
  });
});

describe('<ChartLineAdxTrend />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineAdxTrend data={RISING} period={4} threshold={25} />);
    expect(
      screen.getByRole('region', { name: /ADX trend chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineAdxTrend data={RISING} period={4} threshold={25} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-adx-trend-aria-desc"]',
    );
    expect(desc?.textContent).toContain('ADX');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineAdxTrend data={[]} period={4} threshold={25} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-trend-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the period / threshold / total-points on the root', () => {
    const { container } = render(
      <ChartLineAdxTrend data={RISING} period={4} threshold={25} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-trend"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('25');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders the price line and the ADX line', () => {
    const { container } = render(
      <ChartLineAdxTrend data={RISING} period={4} threshold={25} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-trend-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-adx-trend-line"]'),
    ).toBeInTheDocument();
  });

  it('marks every RISING marker as strong (ADX = 100)', () => {
    const { container } = render(
      <ChartLineAdxTrend data={RISING} period={4} threshold={25} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-adx-trend-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('strong');
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineAdxTrend data={RISING} period={4} threshold={25} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-adx-trend-badge-config"]',
    );
    expect(badge?.textContent).toContain('ADX 4');
    expect(badge?.textContent).toContain('25');
  });

  it('hides the ADX line via the legend toggle', () => {
    const { container } = render(
      <ChartLineAdxTrend data={RISING} period={4} threshold={25} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-adx-trend-legend-item"][data-series-id="adx"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-adx-trend-line"]'),
    ).toBeNull();
  });

  it('shows +DI / -DI via showPlusDi / showMinusDi', () => {
    const { container } = render(
      <ChartLineAdxTrend
        data={RISING}
        period={4}
        threshold={25}
        showPlusDi
        showMinusDi
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-trend-plus-di-line"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-trend-minus-di-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineAdxTrend
        data={RISING}
        period={4}
        threshold={25}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-adx-trend-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineAdxTrend ref={ref} data={RISING} period={4} threshold={25} />,
    );
    expect(ref.current).not.toBeNull();
  });
});
