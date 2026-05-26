import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  CHART_LINE_EHLERS_FISHER_CLAMP,
  ChartLineEhlersFisher,
  DEFAULT_CHART_LINE_EHLERS_FISHER_PERIOD,
  DEFAULT_CHART_LINE_EHLERS_FISHER_THRESHOLD,
  classifyLineEhlersFisherZone,
  clampLineEhlersFisherNorm,
  computeLineEhlersFisher,
  computeLineEhlersFisherLayout,
  computeLineEhlersFisherWindow,
  describeLineEhlersFisherChart,
  getLineEhlersFisherFinitePoints,
  normalizeLineEhlersFisherPeriod,
  normalizeLineEhlersFisherThreshold,
  runLineEhlersFisher,
  type ChartLineEhlersFisherPoint,
} from './chart-line-ehlers-fisher';

const toBars = (
  highs: number[],
  lows: number[] = highs,
): ChartLineEhlersFisherPoint[] =>
  highs.map((h, i) => ({ x: i, high: h, low: lows[i] ?? h }));

const CONST_FLAT: ChartLineEhlersFisherPoint[] = toBars(
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
);

// Rising high/low both follow i + base. Always hl2 = i + base.
const RISING: ChartLineEhlersFisherPoint[] = toBars(
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
);

const FALLING: ChartLineEhlersFisherPoint[] = toBars(
  [19, 18, 17, 16, 15, 14, 13, 12, 11, 10],
  [19, 18, 17, 16, 15, 14, 13, 12, 11, 10],
);

const WAVE: ChartLineEhlersFisherPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const v = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: v + 1, low: v - 1 };
  },
);

const OPTS = { period: 4, threshold: 1.5 } as const;

describe('getLineEhlersFisherFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineEhlersFisherFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineEhlersFisherFinitePoints(
        'nope' as unknown as ChartLineEhlersFisherPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x, high, or low', () => {
    const points: ChartLineEhlersFisherPoint[] = [
      { x: 0, high: 1, low: 1 },
      { x: Number.NaN, high: 2, low: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 0 },
      { x: 2, high: 3, low: 3 },
    ];
    expect(getLineEhlersFisherFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 1 },
      { x: 2, high: 3, low: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineEhlersFisherPoint[] = [
      { x: 0, high: 1, low: 2 },
      { x: 1, high: 3, low: 2 },
    ];
    expect(getLineEhlersFisherFinitePoints(points)).toEqual([
      { x: 1, high: 3, low: 2 },
    ]);
  });
});

describe('normalizeLineEhlersFisherPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineEhlersFisherPeriod(9, 9)).toBe(9);
  });

  it('floors a fractional', () => {
    expect(normalizeLineEhlersFisherPeriod(9.9, 9)).toBe(9);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineEhlersFisherPeriod(1, 9)).toBe(9);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineEhlersFisherPeriod(Number.NaN, 9)).toBe(9);
  });
});

describe('normalizeLineEhlersFisherThreshold', () => {
  it('keeps a positive finite', () => {
    expect(normalizeLineEhlersFisherThreshold(2, 1.5)).toBe(2);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineEhlersFisherThreshold(0, 1.5)).toBe(1.5);
    expect(normalizeLineEhlersFisherThreshold(-1, 1.5)).toBe(1.5);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineEhlersFisherThreshold(Number.NaN, 1.5)).toBe(1.5);
  });
});

describe('clampLineEhlersFisherNorm', () => {
  it('is the identity in the open interval', () => {
    expect(clampLineEhlersFisherNorm(0)).toBe(0);
    expect(clampLineEhlersFisherNorm(0.5)).toBe(0.5);
    expect(clampLineEhlersFisherNorm(-0.5)).toBe(-0.5);
  });

  it('caps positive overflow at +CLAMP bit-exact', () => {
    expect(clampLineEhlersFisherNorm(1.5)).toBe(
      CHART_LINE_EHLERS_FISHER_CLAMP,
    );
  });

  it('caps negative overflow at -CLAMP bit-exact', () => {
    expect(clampLineEhlersFisherNorm(-1.5)).toBe(
      -CHART_LINE_EHLERS_FISHER_CLAMP,
    );
  });
});

describe('computeLineEhlersFisherWindow', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineEhlersFisherWindow(null, 4)).toEqual({
      hl2: [],
      hh: [],
      ll: [],
    });
    expect(computeLineEhlersFisherWindow([], 4)).toEqual({
      hl2: [],
      hh: [],
      ll: [],
    });
  });

  it('returns matching lengths on every track', () => {
    const w = computeLineEhlersFisherWindow(RISING, 4);
    expect(w.hl2).toHaveLength(RISING.length);
    expect(w.hh).toHaveLength(RISING.length);
    expect(w.ll).toHaveLength(RISING.length);
  });

  it('warms up the first period - 1 bars on hh / ll', () => {
    const w = computeLineEhlersFisherWindow(RISING, 4);
    for (let i = 0; i < 3; i += 1) {
      expect(w.hh[i]).toBeNull();
      expect(w.ll[i]).toBeNull();
    }
  });

  it('CONST_FLAT: hh = ll = K at every defined bar', () => {
    const w = computeLineEhlersFisherWindow(CONST_FLAT, 4);
    for (let i = 3; i < w.hh.length; i += 1) {
      expect(w.hh[i]).toBe(5);
      expect(w.ll[i]).toBe(5);
    }
  });

  it('RISING: hh = i, ll = i - period + 1 at every defined bar (integer)', () => {
    const w = computeLineEhlersFisherWindow(RISING, 4);
    for (let i = 3; i < w.hh.length; i += 1) {
      // RISING[j] = j + 10 -> hl2 = j + 10.
      expect(w.hh[i]).toBe(i + 10);
      expect(w.ll[i]).toBe(i - 3 + 10);
    }
  });

  it('FALLING: hh = i - period + 1, ll = i (mirrored)', () => {
    const w = computeLineEhlersFisherWindow(FALLING, 4);
    for (let i = 3; i < w.hh.length; i += 1) {
      // FALLING[j] = 19 - j -> hl2 = 19 - j.
      // Over j in [i-3, i], the max is at the smallest j and the min
      // at the largest. So hh = 19 - (i - 3), ll = 19 - i.
      expect(w.hh[i]).toBe(19 - (i - 3));
      expect(w.ll[i]).toBe(19 - i);
    }
  });

  it('emits hl2 = (high + low) / 2 bit-exact for integer fixtures', () => {
    const bars = toBars([10, 12, 14], [4, 8, 10]);
    const w = computeLineEhlersFisherWindow(bars, 2);
    expect(w.hl2).toEqual([7, 10, 12]);
  });
});

describe('computeLineEhlersFisher', () => {
  it('returns empty arrays for non-array / empty input', () => {
    expect(computeLineEhlersFisher(null, 4)).toEqual({
      norm: [],
      fisher: [],
    });
    expect(computeLineEhlersFisher([], 4)).toEqual({ norm: [], fisher: [] });
  });

  it('matches input length on both tracks', () => {
    const f = computeLineEhlersFisher(RISING, 4);
    expect(f.norm).toHaveLength(RISING.length);
    expect(f.fisher).toHaveLength(RISING.length);
  });

  it('leaves the warm-up bars null', () => {
    const f = computeLineEhlersFisher(RISING, 4);
    for (let i = 0; i < 3; i += 1) {
      expect(f.norm[i]).toBeNull();
      expect(f.fisher[i]).toBeNull();
    }
  });

  it('CONST_FLAT: norm = 0 at every defined bar bit-exact (range=0 -> ratio=0)', () => {
    const f = computeLineEhlersFisher(CONST_FLAT, 4);
    for (let i = 3; i < f.norm.length; i += 1) {
      expect(f.norm[i]).toBe(0);
    }
  });

  it('CONST_FLAT: fisher = 0 at every defined bar bit-exact (atanh(0) = 0)', () => {
    const f = computeLineEhlersFisher(CONST_FLAT, 4);
    for (let i = 3; i < f.fisher.length; i += 1) {
      expect(f.fisher[i]).toBe(0);
    }
  });

  it('RISING: positive Fisher reading at the last defined bar', () => {
    const f = computeLineEhlersFisher(RISING, 4);
    const last = f.fisher[f.fisher.length - 1]!;
    expect(last).toBeGreaterThan(0);
  });

  it('FALLING: negative Fisher reading at the last defined bar', () => {
    const f = computeLineEhlersFisher(FALLING, 4);
    const last = f.fisher[f.fisher.length - 1]!;
    expect(last).toBeLessThan(0);
  });

  it('RISING vs FALLING antisymmetry: same magnitude near the tail', () => {
    const r = computeLineEhlersFisher(RISING, 4);
    const f = computeLineEhlersFisher(FALLING, 4);
    expect(r.fisher[9]).toBeCloseTo(-f.fisher[9]!, 10);
  });

  it('RISING is monotone increasing once the recurrence is warm', () => {
    const f = computeLineEhlersFisher(RISING, 4);
    for (let i = 4; i < f.fisher.length; i += 1) {
      expect(f.fisher[i]!).toBeGreaterThanOrEqual(f.fisher[i - 1]!);
    }
  });

  it('FALLING is monotone decreasing once the recurrence is warm', () => {
    const f = computeLineEhlersFisher(FALLING, 4);
    for (let i = 4; i < f.fisher.length; i += 1) {
      expect(f.fisher[i]!).toBeLessThanOrEqual(f.fisher[i - 1]!);
    }
  });

  it('produces finite output for a finite wave', () => {
    const f = computeLineEhlersFisher(WAVE, 4);
    for (let i = 3; i < f.fisher.length; i += 1) {
      expect(Number.isFinite(f.fisher[i]!)).toBe(true);
      expect(Number.isFinite(f.norm[i]!)).toBe(true);
    }
  });

  it('keeps norm strictly inside (-1, +1) via clamp', () => {
    const f = computeLineEhlersFisher(RISING, 4);
    for (let i = 3; i < f.norm.length; i += 1) {
      const v = f.norm[i]!;
      expect(v).toBeGreaterThan(-1);
      expect(v).toBeLessThan(1);
    }
  });

  it('translation invariance: shifting H/L by k leaves the Fisher unchanged for integer k', () => {
    const a = computeLineEhlersFisher(RISING, 4);
    const shifted = RISING.map((p) => ({
      x: p.x,
      high: p.high + 1000,
      low: p.low + 1000,
    }));
    const b = computeLineEhlersFisher(shifted, 4);
    for (let i = 0; i < a.fisher.length; i += 1) {
      if (a.fisher[i] === null) {
        expect(b.fisher[i]).toBeNull();
      } else {
        // Range and relative position are unchanged under translation,
        // so the Fisher reading is identical.
        expect(b.fisher[i]).toBeCloseTo(a.fisher[i]!, 10);
      }
    }
  });
});

describe('classifyLineEhlersFisherZone', () => {
  it('threshold reached -> overbought', () => {
    expect(classifyLineEhlersFisherZone(1.6, 1.5)).toBe('overbought');
  });

  it('-threshold reached -> oversold', () => {
    expect(classifyLineEhlersFisherZone(-1.6, 1.5)).toBe('oversold');
  });

  it('inside the band, positive -> positive', () => {
    expect(classifyLineEhlersFisherZone(0.5, 1.5)).toBe('positive');
  });

  it('inside the band, negative -> negative', () => {
    expect(classifyLineEhlersFisherZone(-0.5, 1.5)).toBe('negative');
  });

  it('null -> none', () => {
    expect(classifyLineEhlersFisherZone(null, 1.5)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineEhlersFisherZone(Number.NaN, 1.5)).toBe('none');
  });
});

describe('runLineEhlersFisher', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineEhlersFisher([{ x: 0, high: 1, low: 1 }], OPTS).ok).toBe(
      false,
    );
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineEhlersFisher([], OPTS).ok).toBe(false);
    expect(runLineEhlersFisher(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineEhlersFisher(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period', () => {
    expect(runLineEhlersFisher(RISING).period).toBe(
      DEFAULT_CHART_LINE_EHLERS_FISHER_PERIOD,
    );
  });

  it('uses the default threshold', () => {
    expect(runLineEhlersFisher(RISING).threshold).toBe(
      DEFAULT_CHART_LINE_EHLERS_FISHER_THRESHOLD,
    );
  });

  it('honours custom options', () => {
    const run = runLineEhlersFisher(RISING, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(1.5);
  });

  it('produces one sample per finite point', () => {
    expect(runLineEhlersFisher(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT classifies the defined bars as positive (Fisher = 0)', () => {
    const run = runLineEhlersFisher(CONST_FLAT, OPTS);
    // Fisher = 0 falls into the 'positive' bucket via the strict
    // greater-than ladder. That is fine: the bit-exact identity here
    // is on the underlying value, not the bucket label.
    expect(run.positiveCount).toBe(CONST_FLAT.length - 3);
    expect(run.overboughtCount).toBe(0);
    expect(run.oversoldCount).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineEhlersFisher(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final Fisher reading', () => {
    expect(runLineEhlersFisher(CONST_FLAT, OPTS).fisherFinal).toBe(0);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineEhlersFisher(WAVE, OPTS);
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

describe('computeLineEhlersFisherLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineEhlersFisherLayout({
        data: [{ x: 0, high: 1, low: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineEhlersFisherLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineEhlersFisherLayout({ data: WAVE, ...OPTS }).ok).toBe(
      true,
    );
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineEhlersFisherLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined Fisher bar', () => {
    const layout = computeLineEhlersFisherLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 3);
  });

  it('builds a non-empty Fisher path', () => {
    const layout = computeLineEhlersFisherLayout({ data: RISING, ...OPTS });
    expect(layout.fisherPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the Fisher panel', () => {
    const layout = computeLineEhlersFisherLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.fisherPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.fisherPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineEhlersFisherLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.fisherPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineEhlersFisherLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.threshold).toBe(1.5);
  });
});

describe('describeLineEhlersFisherChart', () => {
  it('names the indicator', () => {
    expect(describeLineEhlersFisherChart(RISING, OPTS)).toContain(
      'Ehlers Fisher Transform',
    );
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineEhlersFisherChart(RISING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold +/- 1.5');
  });

  it('mentions the inverse hyperbolic tangent / Gaussian shape', () => {
    expect(describeLineEhlersFisherChart(RISING, OPTS)).toContain(
      'inverse hyperbolic tangent',
    );
  });

  it('mentions the constant-series identity', () => {
    expect(describeLineEhlersFisherChart(RISING, OPTS)).toContain(
      'A constant high/low series leaves',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineEhlersFisherChart([])).toBe('No data');
    expect(describeLineEhlersFisherChart(null)).toBe('No data');
  });
});

describe('<ChartLineEhlersFisher />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineEhlersFisher data={RISING} period={4} threshold={1.5} />);
    expect(
      screen.getByRole('region', {
        name: /Ehlers Fisher Transform chart/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineEhlersFisher data={RISING} period={4} threshold={1.5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ehlers-fisher-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ehlers Fisher Transform');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineEhlersFisher data={[]} period={4} threshold={1.5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ehlers-fisher-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(
      <ChartLineEhlersFisher data={RISING} period={4} threshold={1.5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-fisher"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('1.5');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineEhlersFisher data={RISING} period={4} threshold={1.5} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line and the Fisher line', () => {
    const { container } = render(
      <ChartLineEhlersFisher data={RISING} period={4} threshold={1.5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders markers for the defined Fisher bars', () => {
    const { container } = render(
      <ChartLineEhlersFisher data={RISING} period={4} threshold={1.5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ehlers-fisher-marker"]',
    );
    expect(markers).toHaveLength(RISING.length - 3);
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineEhlersFisher data={RISING} period={4} threshold={1.5} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ehlers-fisher-badge-config"]',
    );
    expect(badge?.textContent).toContain('Fisher 4');
    expect(badge?.textContent).toContain('1.5');
  });

  it('hides the Fisher line via the legend toggle', () => {
    const { container } = render(
      <ChartLineEhlersFisher data={RISING} period={4} threshold={1.5} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-ehlers-fisher-legend-item"][data-series-id="fisher"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-line"]',
      ),
    ).toBeNull();
  });

  it('hides the Fisher line via showFisher=false', () => {
    const { container } = render(
      <ChartLineEhlersFisher
        data={RISING}
        period={4}
        threshold={1.5}
        showFisher={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineEhlersFisher
        data={RISING}
        period={4}
        threshold={1.5}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-fisher-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineEhlersFisher
        ref={ref}
        data={RISING}
        period={4}
        threshold={1.5}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
