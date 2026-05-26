import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineTilsonMa,
  DEFAULT_CHART_LINE_TILSON_MA_PERIOD,
  DEFAULT_CHART_LINE_TILSON_MA_VOLUME_FACTOR,
  classifyLineTilsonMaZone,
  computeLineTilsonMa,
  computeLineTilsonMaCoefficients,
  computeLineTilsonMaEma,
  computeLineTilsonMaLayout,
  describeLineTilsonMaChart,
  getLineTilsonMaFinitePoints,
  normalizeLineTilsonMaPeriod,
  normalizeLineTilsonMaVolumeFactor,
  runLineTilsonMa,
  type ChartLineTilsonMaPoint,
} from './chart-line-tilson-ma';

const toPoints = (closes: number[]): ChartLineTilsonMaPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

// CONST_FLAT: close = 5 constant. EMAs of constant = constant
// (EMA-of-constant lemma). T3 = (c1 + c2 + c3 + c4) * 5 = 1 * 5
// = 5 bit-exact when the coefficient sum is exactly 1 (a = 0
// or a = 1 -- integer coefficients).
const CONST_FLAT: ChartLineTilsonMaPoint[] = toPoints(
  Array.from({ length: 30 }, () => 5),
);

const RISING: ChartLineTilsonMaPoint[] = toPoints(
  Array.from({ length: 30 }, (_, i) => i + 10),
);

const FALLING: ChartLineTilsonMaPoint[] = toPoints(
  Array.from({ length: 30 }, (_, i) => 40 - i),
);

const WAVE: ChartLineTilsonMaPoint[] = Array.from(
  { length: 40 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = { period: 4, volumeFactor: 0.7 } as const;

describe('getLineTilsonMaFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineTilsonMaFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineTilsonMaFinitePoints(
        'nope' as unknown as ChartLineTilsonMaPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineTilsonMaPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 3 },
    ];
    expect(getLineTilsonMaFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 3 },
    ]);
  });
});

describe('normalizeLineTilsonMaPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineTilsonMaPeriod(8, 8)).toBe(8);
  });

  it('floors a fractional', () => {
    expect(normalizeLineTilsonMaPeriod(8.9, 8)).toBe(8);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineTilsonMaPeriod(1, 8)).toBe(8);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineTilsonMaPeriod(Number.NaN, 8)).toBe(8);
  });
});

describe('normalizeLineTilsonMaVolumeFactor', () => {
  it('keeps a finite in [0, 1]', () => {
    expect(normalizeLineTilsonMaVolumeFactor(0.7, 0.5)).toBe(0.7);
    expect(normalizeLineTilsonMaVolumeFactor(0, 0.5)).toBe(0);
    expect(normalizeLineTilsonMaVolumeFactor(1, 0.5)).toBe(1);
  });

  it('falls back for out-of-range', () => {
    expect(normalizeLineTilsonMaVolumeFactor(1.5, 0.5)).toBe(0.5);
    expect(normalizeLineTilsonMaVolumeFactor(-0.1, 0.5)).toBe(0.5);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineTilsonMaVolumeFactor(Number.NaN, 0.5)).toBe(0.5);
  });
});

describe('computeLineTilsonMaEma', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineTilsonMaEma([], 4)).toEqual([]);
  });

  it('EMA of constant equals constant bit-exact', () => {
    const out = computeLineTilsonMaEma([7, 7, 7, 7, 7], 4);
    for (const v of out) expect(v).toBe(7);
  });

  it('first value seeds the EMA bit-exact', () => {
    const out = computeLineTilsonMaEma([10, 12, 14], 4);
    expect(out[0]).toBe(10);
  });
});

describe('computeLineTilsonMaCoefficients', () => {
  it('a = 0: c1 = c2 = c3 = 0, c4 = 1 bit-exact', () => {
    const out = computeLineTilsonMaCoefficients(0);
    // -0 === 0 numerically; use Object.is via toEqual on zero
    // additions to avoid the IEEE 754 -0/+0 distinction.
    expect(out.c1 + 0).toBe(0);
    expect(out.c2).toBe(0);
    expect(out.c3 + 0).toBe(0);
    expect(out.c4).toBe(1);
  });

  it('a = 1: c1 = -1, c2 = 6, c3 = -12, c4 = 8 bit-exact', () => {
    const out = computeLineTilsonMaCoefficients(1);
    expect(out.c1).toBe(-1);
    expect(out.c2).toBe(6);
    expect(out.c3).toBe(-12);
    expect(out.c4).toBe(8);
  });

  it('a = 1: c1 + c2 + c3 + c4 = 1 bit-exact (integer arithmetic)', () => {
    const { c1, c2, c3, c4 } = computeLineTilsonMaCoefficients(1);
    expect(c1 + c2 + c3 + c4).toBe(1);
  });

  it('a = 0.5: explicit anchors', () => {
    // a = 0.5, a^2 = 0.25, a^3 = 0.125
    // c1 = -0.125
    // c2 = 3 * 0.25 + 3 * 0.125 = 0.75 + 0.375 = 1.125
    // c3 = -3 * 0.5 - 6 * 0.25 - 3 * 0.125 = -1.5 - 1.5 - 0.375 = -3.375
    // c4 = 1 + 1.5 + 0.75 + 0.125 = 3.375
    const out = computeLineTilsonMaCoefficients(0.5);
    expect(out.c1).toBe(-0.125);
    expect(out.c2).toBe(1.125);
    expect(out.c3).toBe(-3.375);
    expect(out.c4).toBe(3.375);
  });
});

describe('computeLineTilsonMa', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineTilsonMa(null, 4, 0.7)).toEqual([]);
    expect(computeLineTilsonMa([], 4, 0.7)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineTilsonMa(RISING.map((p) => p.close), 4, 0.7)).toHaveLength(
      RISING.length,
    );
  });

  it('CONST_FLAT with a = 0: T3 = EMA3 = K bit-exact at every bar', () => {
    const out = computeLineTilsonMa(CONST_FLAT.map((p) => p.close), 4, 0);
    for (const v of out) expect(v).toBe(5);
  });

  it('CONST_FLAT with a = 1: T3 = K bit-exact (integer coefficients sum to 1)', () => {
    const out = computeLineTilsonMa(CONST_FLAT.map((p) => p.close), 4, 1);
    for (const v of out) expect(v).toBe(5);
  });

  it('CONST_FLAT with a = 0.7 (default): T3 close to K (toBeCloseTo)', () => {
    const out = computeLineTilsonMa(CONST_FLAT.map((p) => p.close), 4, 0.7);
    for (const v of out) {
      if (v === null) continue;
      expect(v).toBeCloseTo(5, 10);
    }
  });

  it('translation invariance: shifting close by k shifts T3 by exactly k', () => {
    const a = computeLineTilsonMa(RISING.map((p) => p.close), 4, 0.7);
    const b = computeLineTilsonMa(
      RISING.map((p) => p.close + 1000),
      4,
      0.7,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBeCloseTo(a[i]! + 1000, 10);
    }
  });

  it('RISING / FALLING: T3 trends with the close', () => {
    const r = computeLineTilsonMa(RISING.map((p) => p.close), 4, 0.7);
    const f = computeLineTilsonMa(FALLING.map((p) => p.close), 4, 0.7);
    expect(r[r.length - 1]!).toBeGreaterThan(r[10]!);
    expect(f[f.length - 1]!).toBeLessThan(f[10]!);
  });

  it('reads finite on the wave', () => {
    const out = computeLineTilsonMa(WAVE.map((p) => p.close), 4, 0.7);
    for (const v of out) {
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('classifyLineTilsonMaZone', () => {
  it('close above T3 -> above', () => {
    expect(classifyLineTilsonMaZone(12, 10)).toBe('above');
  });

  it('close below T3 -> below', () => {
    expect(classifyLineTilsonMaZone(8, 10)).toBe('below');
  });

  it('close exactly at T3 -> at', () => {
    expect(classifyLineTilsonMaZone(10, 10)).toBe('at');
  });

  it('null T3 -> none', () => {
    expect(classifyLineTilsonMaZone(10, null)).toBe('none');
  });

  it('null close -> none', () => {
    expect(classifyLineTilsonMaZone(null, 10)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineTilsonMaZone(Number.NaN, 10)).toBe('none');
  });
});

describe('runLineTilsonMa', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineTilsonMa([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineTilsonMa([], OPTS).ok).toBe(false);
    expect(runLineTilsonMa(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineTilsonMa(RISING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineTilsonMa(RISING).period).toBe(
      DEFAULT_CHART_LINE_TILSON_MA_PERIOD,
    );
    expect(runLineTilsonMa(RISING).volumeFactor).toBe(
      DEFAULT_CHART_LINE_TILSON_MA_VOLUME_FACTOR,
    );
  });

  it('honours custom options', () => {
    const run = runLineTilsonMa(RISING, OPTS);
    expect(run.period).toBe(4);
    expect(run.volumeFactor).toBe(0.7);
  });

  it('produces one sample per finite point', () => {
    expect(runLineTilsonMa(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT with a = 1: every sample is at-T3 (close == T3 == K)', () => {
    const run = runLineTilsonMa(CONST_FLAT, { period: 4, volumeFactor: 1 });
    expect(run.atCount).toBe(CONST_FLAT.length);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('exposes the final reading', () => {
    expect(runLineTilsonMa(CONST_FLAT, { period: 4, volumeFactor: 1 }).t3Final).toBe(5);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineTilsonMa(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineTilsonMa(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.aboveCount + run.atCount + run.belowCount + none).toBe(
      run.samples.length,
    );
  });
});

describe('computeLineTilsonMaLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineTilsonMaLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineTilsonMaLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineTilsonMaLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineTilsonMaLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined T3 bar', () => {
    const layout = computeLineTilsonMaLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length);
  });

  it('builds a non-empty T3 path on RISING', () => {
    const layout = computeLineTilsonMaLayout({ data: RISING, ...OPTS });
    expect(layout.t3Path.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineTilsonMaLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('value domain covers price + T3', () => {
    const layout = computeLineTilsonMaLayout({ data: RISING, ...OPTS });
    expect(layout.valueMin).toBeLessThanOrEqual(10);
    expect(layout.valueMax).toBeGreaterThanOrEqual(39);
  });

  it('carries the run', () => {
    const layout = computeLineTilsonMaLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.volumeFactor).toBe(0.7);
  });
});

describe('describeLineTilsonMaChart', () => {
  it('names the indicator', () => {
    expect(describeLineTilsonMaChart(RISING, OPTS)).toContain('Tillson T3');
  });

  it('mentions the period and volume factor', () => {
    const desc = describeLineTilsonMaChart(RISING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('volume factor 0.7');
  });

  it('mentions the constant-close identity', () => {
    expect(describeLineTilsonMaChart(RISING, OPTS)).toContain(
      'constant close passes through',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineTilsonMaChart([])).toBe('No data');
    expect(describeLineTilsonMaChart(null)).toBe('No data');
  });
});

describe('<ChartLineTilsonMa />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineTilsonMa data={RISING} period={4} volumeFactor={0.7} />);
    expect(
      screen.getByRole('region', { name: /Tillson T3 chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineTilsonMa data={RISING} period={4} volumeFactor={0.7} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-tilson-ma-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Tillson T3');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineTilsonMa data={[]} period={4} volumeFactor={0.7} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tilson-ma-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineTilsonMa data={RISING} period={4} volumeFactor={0.7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tilson-ma"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-volume-factor')).toBe('0.7');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders the price line and the T3 line', () => {
    const { container } = render(
      <ChartLineTilsonMa data={RISING} period={4} volumeFactor={0.7} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tilson-ma-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-tilson-ma-line"]'),
    ).toBeInTheDocument();
  });

  it('marks every CONST_FLAT marker as at (close == T3) with a = 1', () => {
    const { container } = render(
      <ChartLineTilsonMa data={CONST_FLAT} period={4} volumeFactor={1} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tilson-ma-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('at');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineTilsonMa data={RISING} period={4} volumeFactor={0.7} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-tilson-ma-badge-config"]',
    );
    expect(badge?.textContent).toContain('T3 4');
    expect(badge?.textContent).toContain('a0.7');
  });

  it('hides the T3 line via the legend toggle', () => {
    const { container } = render(
      <ChartLineTilsonMa data={RISING} period={4} volumeFactor={0.7} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-tilson-ma-legend-item"][data-series-id="t3"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-tilson-ma-line"]'),
    ).toBeNull();
  });

  it('hides the T3 line via showT3=false', () => {
    const { container } = render(
      <ChartLineTilsonMa
        data={RISING}
        period={4}
        volumeFactor={0.7}
        showT3={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tilson-ma-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineTilsonMa
        data={RISING}
        period={4}
        volumeFactor={0.7}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-tilson-ma-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineTilsonMa
        ref={ref}
        data={RISING}
        period={4}
        volumeFactor={0.7}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
