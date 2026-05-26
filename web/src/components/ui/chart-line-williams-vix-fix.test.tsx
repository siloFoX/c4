import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineWilliamsVixFix,
  DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PERIOD,
  DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_THRESHOLD,
  classifyLineWilliamsVixFixZone,
  computeLineWilliamsVixFix,
  computeLineWilliamsVixFixLayout,
  describeLineWilliamsVixFixChart,
  getLineWilliamsVixFixFinitePoints,
  normalizeLineWilliamsVixFixPeriod,
  normalizeLineWilliamsVixFixThreshold,
  runLineWilliamsVixFix,
  type ChartLineWilliamsVixFixPoint,
} from './chart-line-williams-vix-fix';

const toBars = (
  closes: number[],
  lows: number[] = closes,
): ChartLineWilliamsVixFixPoint[] =>
  closes.map((c, i) => ({ x: i, low: lows[i] ?? c, close: c }));

// CONST_FLAT: low == close == K -> hh = K, WVF = 0 bit-exact.
const CONST_FLAT: ChartLineWilliamsVixFixPoint[] = toBars(
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
);

// RISING: low == close == i + 10 -> hh = i + 10 = low -> WVF = 0.
const RISING: ChartLineWilliamsVixFixPoint[] = toBars(
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
);

// SPIKE_50: closes all 20 with one bar low spiked to 10 ->
// hh = 20, low = 10 -> WVF = 100 * 10 / 20 = 50 bit-exact.
const SPIKE_50: ChartLineWilliamsVixFixPoint[] = [
  { x: 0, low: 20, close: 20 },
  { x: 1, low: 20, close: 20 },
  { x: 2, low: 20, close: 20 },
  { x: 3, low: 20, close: 20 },
  { x: 4, low: 10, close: 20 },
];

// SPIKE_25: closes all 20 with low = 15 -> hh = 20, low = 15 ->
// WVF = 100 * 5 / 20 = 25 bit-exact.
const SPIKE_25: ChartLineWilliamsVixFixPoint[] = [
  { x: 0, low: 20, close: 20 },
  { x: 1, low: 20, close: 20 },
  { x: 2, low: 20, close: 20 },
  { x: 3, low: 20, close: 20 },
  { x: 4, low: 15, close: 20 },
];

const WAVE: ChartLineWilliamsVixFixPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const base = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, low: base - 2, close: base };
  },
);

const OPTS = { period: 4, threshold: 16 } as const;

describe('getLineWilliamsVixFixFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineWilliamsVixFixFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineWilliamsVixFixFinitePoints(
        'nope' as unknown as ChartLineWilliamsVixFixPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineWilliamsVixFixPoint[] = [
      { x: 0, low: 1, close: 1 },
      { x: Number.NaN, low: 2, close: 2 },
      { x: 1, low: Number.POSITIVE_INFINITY, close: 0 },
      { x: 2, low: 3, close: 3 },
    ];
    expect(getLineWilliamsVixFixFinitePoints(points)).toEqual([
      { x: 0, low: 1, close: 1 },
      { x: 2, low: 3, close: 3 },
    ]);
  });
});

describe('normalizeLineWilliamsVixFixPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineWilliamsVixFixPeriod(22, 22)).toBe(22);
  });

  it('floors a fractional', () => {
    expect(normalizeLineWilliamsVixFixPeriod(22.9, 22)).toBe(22);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineWilliamsVixFixPeriod(0, 22)).toBe(22);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineWilliamsVixFixPeriod(Number.NaN, 22)).toBe(22);
  });
});

describe('normalizeLineWilliamsVixFixThreshold', () => {
  it('keeps a positive finite', () => {
    expect(normalizeLineWilliamsVixFixThreshold(20, 16)).toBe(20);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineWilliamsVixFixThreshold(0, 16)).toBe(16);
    expect(normalizeLineWilliamsVixFixThreshold(-1, 16)).toBe(16);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineWilliamsVixFixThreshold(Number.NaN, 16)).toBe(16);
  });
});

describe('computeLineWilliamsVixFix', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineWilliamsVixFix(null, 4)).toEqual([]);
    expect(computeLineWilliamsVixFix([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineWilliamsVixFix(RISING, 4)).toHaveLength(RISING.length);
  });

  it('leaves the warm-up bars null', () => {
    const out = computeLineWilliamsVixFix(RISING, 4);
    for (let i = 0; i < 3; i += 1) expect(out[i]).toBeNull();
  });

  it('CONST_FLAT: WVF = 0 bit-exact at every defined bar', () => {
    const out = computeLineWilliamsVixFix(CONST_FLAT, 4);
    for (let i = 3; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('RISING low == close: WVF = 0 bit-exact at every defined bar', () => {
    const out = computeLineWilliamsVixFix(RISING, 4);
    for (let i = 3; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('SPIKE_50: WVF[4] = 50 bit-exact', () => {
    const out = computeLineWilliamsVixFix(SPIKE_50, 4);
    expect(out[4]).toBe(50);
  });

  it('SPIKE_25: WVF[4] = 25 bit-exact', () => {
    const out = computeLineWilliamsVixFix(SPIKE_25, 4);
    expect(out[4]).toBe(25);
  });

  it('returns null on non-positive highest close', () => {
    const bars: ChartLineWilliamsVixFixPoint[] = [
      { x: 0, low: -5, close: -10 },
      { x: 1, low: -5, close: -10 },
      { x: 2, low: -5, close: -10 },
      { x: 3, low: -5, close: -10 },
    ];
    const out = computeLineWilliamsVixFix(bars, 4);
    expect(out[3]).toBeNull();
  });

  it('non-finite close in the window nulls the bar', () => {
    const bars: ChartLineWilliamsVixFixPoint[] = [
      { x: 0, low: 5, close: 5 },
      { x: 1, low: 5, close: Number.NaN },
      { x: 2, low: 5, close: 5 },
      { x: 3, low: 5, close: 5 },
    ];
    const out = computeLineWilliamsVixFix(bars, 4);
    expect(out[3]).toBeNull();
  });

  it('scale invariance: multiplying close and low by a positive constant leaves WVF unchanged', () => {
    const a = computeLineWilliamsVixFix(SPIKE_50, 4);
    const b = computeLineWilliamsVixFix(
      SPIKE_50.map((p) => ({ ...p, low: p.low * 100, close: p.close * 100 })),
      4,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBe(a[i]);
    }
  });

  it('WVF stays in [0, 100] on the wave', () => {
    const out = computeLineWilliamsVixFix(WAVE, 4);
    for (let i = 3; i < out.length; i += 1) {
      if (out[i] === null) continue;
      expect(out[i]!).toBeGreaterThanOrEqual(0);
      expect(out[i]!).toBeLessThanOrEqual(100);
    }
  });
});

describe('classifyLineWilliamsVixFixZone', () => {
  it('value >= 2 * threshold -> spike', () => {
    expect(classifyLineWilliamsVixFixZone(40, 16)).toBe('spike');
  });

  it('threshold <= value < 2 * threshold -> elevated', () => {
    expect(classifyLineWilliamsVixFixZone(20, 16)).toBe('elevated');
  });

  it('0 < value < threshold -> normal', () => {
    expect(classifyLineWilliamsVixFixZone(5, 16)).toBe('normal');
  });

  it('exactly 0 -> zero', () => {
    expect(classifyLineWilliamsVixFixZone(0, 16)).toBe('zero');
  });

  it('null -> none', () => {
    expect(classifyLineWilliamsVixFixZone(null, 16)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineWilliamsVixFixZone(Number.NaN, 16)).toBe('none');
  });
});

describe('runLineWilliamsVixFix', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineWilliamsVixFix([{ x: 0, low: 1, close: 1 }], OPTS).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineWilliamsVixFix([], OPTS).ok).toBe(false);
    expect(runLineWilliamsVixFix(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineWilliamsVixFix(RISING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineWilliamsVixFix(RISING).period).toBe(
      DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_PERIOD,
    );
    expect(runLineWilliamsVixFix(RISING).threshold).toBe(
      DEFAULT_CHART_LINE_WILLIAMS_VIX_FIX_THRESHOLD,
    );
  });

  it('produces one sample per finite point', () => {
    expect(runLineWilliamsVixFix(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT: every defined sample is zero', () => {
    const run = runLineWilliamsVixFix(CONST_FLAT, OPTS);
    expect(run.zeroCount).toBe(CONST_FLAT.length - 3);
    expect(run.spikeCount).toBe(0);
  });

  it('SPIKE_50 thr=16: last sample is spike (50 >= 32)', () => {
    const run = runLineWilliamsVixFix(SPIKE_50, OPTS);
    expect(run.samples[4]!.zone).toBe('spike');
    expect(run.samples[4]!.wvf).toBe(50);
  });

  it('SPIKE_25 thr=16: last sample is elevated (25 in [16, 32))', () => {
    const run = runLineWilliamsVixFix(SPIKE_25, OPTS);
    expect(run.samples[4]!.zone).toBe('elevated');
    expect(run.samples[4]!.wvf).toBe(25);
  });

  it('exposes the final / max readings', () => {
    expect(runLineWilliamsVixFix(CONST_FLAT, OPTS).wvfFinal).toBe(0);
    expect(runLineWilliamsVixFix(CONST_FLAT, OPTS).wvfMax).toBe(0);
    expect(runLineWilliamsVixFix(SPIKE_50, OPTS).wvfFinal).toBe(50);
    expect(runLineWilliamsVixFix(SPIKE_50, OPTS).wvfMax).toBe(50);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineWilliamsVixFix(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineWilliamsVixFix(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.spikeCount +
        run.elevatedCount +
        run.normalCount +
        run.zeroCount +
        none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineWilliamsVixFixLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineWilliamsVixFixLayout({
        data: [{ x: 0, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineWilliamsVixFixLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineWilliamsVixFixLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineWilliamsVixFixLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined WVF bar', () => {
    const layout = computeLineWilliamsVixFixLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(RISING.length - 3);
  });

  it('builds a non-empty WVF path', () => {
    const layout = computeLineWilliamsVixFixLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.wvfPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the WVF panel', () => {
    const layout = computeLineWilliamsVixFixLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.wvfPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.wvfPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineWilliamsVixFixLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.wvfPanelTop);
  });

  it('wvfMin is exactly zero', () => {
    const layout = computeLineWilliamsVixFixLayout({ data: WAVE, ...OPTS });
    expect(layout.wvfMin).toBe(0);
  });

  it('carries the run', () => {
    const layout = computeLineWilliamsVixFixLayout({
      data: RISING,
      ...OPTS,
    });
    expect(layout.run.period).toBe(4);
    expect(layout.run.threshold).toBe(16);
  });
});

describe('describeLineWilliamsVixFixChart', () => {
  it('names the indicator', () => {
    expect(describeLineWilliamsVixFixChart(RISING, OPTS)).toContain(
      'Williams VIX Fix',
    );
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineWilliamsVixFixChart(RISING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold 16');
  });

  it('mentions the half-spike identity', () => {
    expect(describeLineWilliamsVixFixChart(RISING, OPTS)).toContain(
      'half the highest close',
    );
  });

  it('mentions the constant-series identity', () => {
    expect(describeLineWilliamsVixFixChart(RISING, OPTS)).toContain(
      'constant series reads zero',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineWilliamsVixFixChart([])).toBe('No data');
    expect(describeLineWilliamsVixFixChart(null)).toBe('No data');
  });
});

describe('<ChartLineWilliamsVixFix />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineWilliamsVixFix data={RISING} period={4} threshold={16} />,
    );
    expect(
      screen.getByRole('region', { name: /Williams VIX Fix chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineWilliamsVixFix data={RISING} period={4} threshold={16} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-williams-vix-fix-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Williams VIX Fix');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineWilliamsVixFix data={[]} period={4} threshold={16} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-vix-fix-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the period / threshold / total-points on the root', () => {
    const { container } = render(
      <ChartLineWilliamsVixFix data={RISING} period={4} threshold={16} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-vix-fix"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('16');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders the price line and the WVF line', () => {
    const { container } = render(
      <ChartLineWilliamsVixFix data={RISING} period={4} threshold={16} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-vix-fix-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-vix-fix-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('marks every CONST_FLAT marker as zero', () => {
    const { container } = render(
      <ChartLineWilliamsVixFix data={CONST_FLAT} period={4} threshold={16} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-williams-vix-fix-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('zero');
  });

  it('marks SPIKE_50 last marker as spike', () => {
    const { container } = render(
      <ChartLineWilliamsVixFix data={SPIKE_50} period={4} threshold={16} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-williams-vix-fix-marker"]',
    );
    expect(markers.length).toBeGreaterThanOrEqual(1);
    expect(markers[markers.length - 1]!.getAttribute('data-zone')).toBe(
      'spike',
    );
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineWilliamsVixFix data={RISING} period={4} threshold={16} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-williams-vix-fix-badge-config"]',
    );
    expect(badge?.textContent).toContain('WVF 4');
    expect(badge?.textContent).toContain('16');
  });

  it('hides the WVF line via the legend toggle', () => {
    const { container } = render(
      <ChartLineWilliamsVixFix data={RISING} period={4} threshold={16} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-williams-vix-fix-legend-item"][data-series-id="wvf"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-vix-fix-line"]',
      ),
    ).toBeNull();
  });

  it('hides the WVF line via showWvf=false', () => {
    const { container } = render(
      <ChartLineWilliamsVixFix
        data={RISING}
        period={4}
        threshold={16}
        showWvf={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-vix-fix-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineWilliamsVixFix
        data={RISING}
        period={4}
        threshold={16}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-williams-vix-fix-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineWilliamsVixFix
        ref={ref}
        data={RISING}
        period={4}
        threshold={16}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
