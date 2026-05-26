import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineKasePeak,
  DEFAULT_CHART_LINE_KASE_PEAK_FAST_LENGTH,
  DEFAULT_CHART_LINE_KASE_PEAK_SLOW_LENGTH,
  DEFAULT_CHART_LINE_KASE_PEAK_THRESHOLD,
  classifyLineKasePeakZone,
  computeLineKasePeak,
  computeLineKasePeakLayout,
  computeLineKasePeakOut,
  describeLineKasePeakChart,
  getLineKasePeakFinitePoints,
  normalizeLineKasePeakLength,
  normalizeLineKasePeakThreshold,
  runLineKasePeak,
  type ChartLineKasePeakPoint,
} from './chart-line-kase-peak';

const toPoints = (closes: number[]): ChartLineKasePeakPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const CONST_FLAT: ChartLineKasePeakPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);

// Monotone rising: close = i + 10. For any length L:
//   mom(L) = L; volAvg(L) = mean of |1, 1, ..., 1| = 1; peakOut(L) = L.
//   With fast=2, slow=4: KP = 2 - 4 = -2 bit-exact.
const RISING: ChartLineKasePeakPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
]);

const FALLING: ChartLineKasePeakPoint[] = toPoints([
  19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
]);

const WAVE: ChartLineKasePeakPoint[] = Array.from(
  { length: 30 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = { fastLength: 2, slowLength: 4, threshold: 1 } as const;

describe('getLineKasePeakFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineKasePeakFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineKasePeakFinitePoints(
        'nope' as unknown as ChartLineKasePeakPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x / close', () => {
    const points: ChartLineKasePeakPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 3 },
    ];
    expect(getLineKasePeakFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 3 },
    ]);
  });
});

describe('normalizeLineKasePeakLength', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineKasePeakLength(10, 10)).toBe(10);
  });

  it('floors a fractional', () => {
    expect(normalizeLineKasePeakLength(10.9, 10)).toBe(10);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineKasePeakLength(0, 10)).toBe(10);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineKasePeakLength(Number.NaN, 10)).toBe(10);
  });
});

describe('normalizeLineKasePeakThreshold', () => {
  it('keeps a positive finite', () => {
    expect(normalizeLineKasePeakThreshold(1.5, 1)).toBe(1.5);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineKasePeakThreshold(0, 1)).toBe(1);
    expect(normalizeLineKasePeakThreshold(-1, 1)).toBe(1);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineKasePeakThreshold(Number.NaN, 1)).toBe(1);
  });
});

describe('computeLineKasePeakOut', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineKasePeakOut(null, 2)).toEqual([]);
    expect(computeLineKasePeakOut([], 2)).toEqual([]);
  });

  it('CONST_FLAT: every bar is null (zero volAvg)', () => {
    const out = computeLineKasePeakOut(CONST_FLAT.map((p) => p.close), 4);
    for (const v of out) expect(v).toBeNull();
  });

  it('RISING length 2: peakOut = 2 bit-exact at every defined bar', () => {
    const out = computeLineKasePeakOut(RISING.map((p) => p.close), 2);
    for (let i = 2; i < out.length; i += 1) expect(out[i]).toBe(2);
  });

  it('RISING length 4: peakOut = 4 bit-exact at every defined bar', () => {
    const out = computeLineKasePeakOut(RISING.map((p) => p.close), 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(4);
  });

  it('FALLING length 2: peakOut = -2 bit-exact at every defined bar', () => {
    const out = computeLineKasePeakOut(FALLING.map((p) => p.close), 2);
    for (let i = 2; i < out.length; i += 1) expect(out[i]).toBe(-2);
  });

  it('warm-up bars are null', () => {
    const out = computeLineKasePeakOut(RISING.map((p) => p.close), 4);
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
  });

  it('non-finite close in the window nulls the bar', () => {
    const closes = [5, 6, Number.NaN, 8, 9];
    const out = computeLineKasePeakOut(closes, 4);
    expect(out[4]).toBeNull();
  });
});

describe('computeLineKasePeak', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineKasePeak(null, 2, 4)).toEqual({
      fast: [],
      slow: [],
      kp: [],
    });
    expect(computeLineKasePeak([], 2, 4)).toEqual({
      fast: [],
      slow: [],
      kp: [],
    });
  });

  it('matches input length on every track', () => {
    const out = computeLineKasePeak(RISING.map((p) => p.close), 2, 4);
    expect(out.fast).toHaveLength(RISING.length);
    expect(out.slow).toHaveLength(RISING.length);
    expect(out.kp).toHaveLength(RISING.length);
  });

  it('CONST_FLAT: KP is null at every bar', () => {
    const out = computeLineKasePeak(CONST_FLAT.map((p) => p.close), 2, 4);
    for (const v of out.kp) expect(v).toBeNull();
  });

  it('RISING fast=2 slow=4: KP = 2 - 4 = -2 bit-exact at every defined bar', () => {
    const out = computeLineKasePeak(RISING.map((p) => p.close), 2, 4);
    for (let i = 4; i < out.kp.length; i += 1) expect(out.kp[i]).toBe(-2);
  });

  it('FALLING fast=2 slow=4: KP = -2 - (-4) = +2 bit-exact at every defined bar', () => {
    const out = computeLineKasePeak(FALLING.map((p) => p.close), 2, 4);
    for (let i = 4; i < out.kp.length; i += 1) expect(out.kp[i]).toBe(2);
  });

  it('antisymmetry: KP(RISING) = -KP(FALLING) bit-exact', () => {
    const r = computeLineKasePeak(RISING.map((p) => p.close), 2, 4);
    const f = computeLineKasePeak(FALLING.map((p) => p.close), 2, 4);
    for (let i = 4; i < r.kp.length; i += 1) expect(r.kp[i]).toBe(-f.kp[i]!);
  });

  it('translation invariance: shifting close by k leaves KP unchanged', () => {
    const a = computeLineKasePeak(RISING.map((p) => p.close), 2, 4);
    const b = computeLineKasePeak(
      RISING.map((p) => p.close + 1000),
      2,
      4,
    );
    for (let i = 0; i < a.kp.length; i += 1) {
      if (a.kp[i] === null) expect(b.kp[i]).toBeNull();
      else expect(b.kp[i]).toBe(a.kp[i]);
    }
  });

  it('scale invariance: multiplying close by a positive constant leaves KP unchanged', () => {
    const a = computeLineKasePeak(RISING.map((p) => p.close), 2, 4);
    const b = computeLineKasePeak(
      RISING.map((p) => p.close * 100),
      2,
      4,
    );
    for (let i = 0; i < a.kp.length; i += 1) {
      if (a.kp[i] === null) expect(b.kp[i]).toBeNull();
      else expect(b.kp[i]).toBe(a.kp[i]);
    }
  });

  it('warm-up bars are null on KP', () => {
    const out = computeLineKasePeak(RISING.map((p) => p.close), 2, 4);
    for (let i = 0; i < 4; i += 1) expect(out.kp[i]).toBeNull();
  });

  it('reads finite on the wave', () => {
    const out = computeLineKasePeak(WAVE.map((p) => p.close), 2, 4);
    for (let i = 4; i < out.kp.length; i += 1) {
      if (out.kp[i] === null) continue;
      expect(Number.isFinite(out.kp[i]!)).toBe(true);
    }
  });

  it('fast == slow: KP = 0 bit-exact at every defined bar', () => {
    const out = computeLineKasePeak(RISING.map((p) => p.close), 2, 2);
    for (let i = 2; i < out.kp.length; i += 1) expect(out.kp[i]).toBe(0);
  });
});

describe('classifyLineKasePeakZone', () => {
  it('value >= threshold -> peak-bull', () => {
    expect(classifyLineKasePeakZone(2, 1)).toBe('peak-bull');
  });

  it('0 < value < threshold -> bull', () => {
    expect(classifyLineKasePeakZone(0.5, 1)).toBe('bull');
  });

  it('value <= -threshold -> peak-bear', () => {
    expect(classifyLineKasePeakZone(-2, 1)).toBe('peak-bear');
  });

  it('-threshold < value < 0 -> bear', () => {
    expect(classifyLineKasePeakZone(-0.5, 1)).toBe('bear');
  });

  it('exactly zero -> flat', () => {
    expect(classifyLineKasePeakZone(0, 1)).toBe('flat');
  });

  it('null -> none', () => {
    expect(classifyLineKasePeakZone(null, 1)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineKasePeakZone(Number.NaN, 1)).toBe('none');
  });
});

describe('runLineKasePeak', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineKasePeak([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineKasePeak([], OPTS).ok).toBe(false);
    expect(runLineKasePeak(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineKasePeak(RISING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    const run = runLineKasePeak(RISING);
    expect(run.fastLength).toBe(DEFAULT_CHART_LINE_KASE_PEAK_FAST_LENGTH);
    expect(run.slowLength).toBe(DEFAULT_CHART_LINE_KASE_PEAK_SLOW_LENGTH);
    expect(run.threshold).toBe(DEFAULT_CHART_LINE_KASE_PEAK_THRESHOLD);
  });

  it('honours custom options', () => {
    const run = runLineKasePeak(RISING, OPTS);
    expect(run.fastLength).toBe(2);
    expect(run.slowLength).toBe(4);
    expect(run.threshold).toBe(1);
  });

  it('produces one sample per finite point', () => {
    expect(runLineKasePeak(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('RISING fast=2 slow=4 thr=1: defined samples are peak-bear (KP = -2)', () => {
    const run = runLineKasePeak(RISING, OPTS);
    expect(run.peakBearCount).toBe(RISING.length - 4);
    expect(run.peakBullCount).toBe(0);
  });

  it('FALLING fast=2 slow=4 thr=1: defined samples are peak-bull (KP = +2)', () => {
    const run = runLineKasePeak(FALLING, OPTS);
    expect(run.peakBullCount).toBe(FALLING.length - 4);
    expect(run.peakBearCount).toBe(0);
  });

  it('exposes the final reading', () => {
    expect(runLineKasePeak(RISING, OPTS).kpFinal).toBe(-2);
    expect(runLineKasePeak(FALLING, OPTS).kpFinal).toBe(2);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineKasePeak(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineKasePeak(WAVE, OPTS);
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

describe('computeLineKasePeakLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineKasePeakLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineKasePeakLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineKasePeakLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineKasePeakLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined KP bar', () => {
    const layout = computeLineKasePeakLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 4);
  });

  it('builds non-empty KP path', () => {
    const layout = computeLineKasePeakLayout({ data: RISING, ...OPTS });
    expect(layout.kpPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the KP panel', () => {
    const layout = computeLineKasePeakLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.kpPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.kpPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineKasePeakLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.kpPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineKasePeakLayout({ data: RISING, ...OPTS });
    expect(layout.run.fastLength).toBe(2);
    expect(layout.run.slowLength).toBe(4);
    expect(layout.run.threshold).toBe(1);
  });
});

describe('describeLineKasePeakChart', () => {
  it('names the indicator', () => {
    expect(describeLineKasePeakChart(RISING, OPTS)).toContain('Kase Peak');
  });

  it('mentions the fast / slow / threshold', () => {
    const desc = describeLineKasePeakChart(RISING, OPTS);
    expect(desc).toContain('fast 2');
    expect(desc).toContain('slow 4');
    expect(desc).toContain('threshold +/- 1');
  });

  it('mentions the volatility-scaled momentum', () => {
    expect(describeLineKasePeakChart(RISING, OPTS)).toContain(
      'volatility-scaled momentum',
    );
  });

  it('mentions the integer-ramp identity', () => {
    expect(describeLineKasePeakChart(RISING, OPTS)).toContain(
      'peakOut(L) = L',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineKasePeakChart([])).toBe('No data');
    expect(describeLineKasePeakChart(null)).toBe('No data');
  });
});

describe('<ChartLineKasePeak />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineKasePeak
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
      />,
    );
    expect(
      screen.getByRole('region', {
        name: /Kase Peak Oscillator chart/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineKasePeak
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-kase-peak-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Kase Peak');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineKasePeak data={[]} fastLength={2} slowLength={4} threshold={1} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kase-peak-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineKasePeak
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kase-peak"]',
    );
    expect(root?.getAttribute('data-fast-length')).toBe('2');
    expect(root?.getAttribute('data-slow-length')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders the price line and the KP line', () => {
    const { container } = render(
      <ChartLineKasePeak
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kase-peak-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-kase-peak-line"]'),
    ).toBeInTheDocument();
  });

  it('marks every RISING marker as peak-bear', () => {
    const { container } = render(
      <ChartLineKasePeak
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-kase-peak-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('peak-bear');
    }
  });

  it('marks every FALLING marker as peak-bull', () => {
    const { container } = render(
      <ChartLineKasePeak
        data={FALLING}
        fastLength={2}
        slowLength={4}
        threshold={1}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-kase-peak-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('peak-bull');
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineKasePeak
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-kase-peak-badge-config"]',
    );
    expect(badge?.textContent).toContain('KP 2/4');
    expect(badge?.textContent).toContain('1');
  });

  it('hides the KP line via the legend toggle', () => {
    const { container } = render(
      <ChartLineKasePeak
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-kase-peak-legend-item"][data-series-id="kp"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-kase-peak-line"]'),
    ).toBeNull();
  });

  it('shows the fast peakOut line via showFast=true', () => {
    const { container } = render(
      <ChartLineKasePeak
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
        showFast
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kase-peak-fast-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineKasePeak
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kase-peak-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineKasePeak
        ref={ref}
        data={RISING}
        fastLength={2}
        slowLength={4}
        threshold={1}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
