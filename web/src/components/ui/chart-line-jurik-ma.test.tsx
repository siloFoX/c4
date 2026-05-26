import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineJurikMa,
  DEFAULT_CHART_LINE_JURIK_MA_LENGTH,
  DEFAULT_CHART_LINE_JURIK_MA_PHASE,
  DEFAULT_CHART_LINE_JURIK_MA_POWER,
  classifyLineJurikMaZone,
  computeLineJurikMa,
  computeLineJurikMaLayout,
  describeLineJurikMaChart,
  getLineJurikMaFinitePoints,
  normalizeLineJurikMaLength,
  normalizeLineJurikMaPhase,
  normalizeLineJurikMaPower,
  runLineJurikMa,
  type ChartLineJurikMaPoint,
} from './chart-line-jurik-ma';

const toPoints = (closes: number[]): ChartLineJurikMaPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

// CONST_FLAT close = 5: JMA = 5 at every bar bit-exact (stationary
// fixed point of the recurrence with the seeds we use).
const CONST_FLAT: ChartLineJurikMaPoint[] = toPoints(
  Array.from({ length: 30 }, () => 5),
);

const CONST_FLAT_HIGH: ChartLineJurikMaPoint[] = toPoints(
  Array.from({ length: 30 }, () => 1000),
);

const RISING: ChartLineJurikMaPoint[] = toPoints(
  Array.from({ length: 30 }, (_, i) => i + 10),
);

const FALLING: ChartLineJurikMaPoint[] = toPoints(
  Array.from({ length: 30 }, (_, i) => 40 - i),
);

const WAVE: ChartLineJurikMaPoint[] = Array.from(
  { length: 40 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = { length: 14, phase: 0, power: 2 } as const;

describe('getLineJurikMaFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineJurikMaFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineJurikMaFinitePoints(
        'nope' as unknown as ChartLineJurikMaPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineJurikMaPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 3 },
    ];
    expect(getLineJurikMaFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 3 },
    ]);
  });
});

describe('normalizeLineJurikMaLength', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineJurikMaLength(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineJurikMaLength(14.9, 14)).toBe(14);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineJurikMaLength(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineJurikMaLength(Number.NaN, 14)).toBe(14);
  });
});

describe('normalizeLineJurikMaPhase', () => {
  it('keeps a finite in [-100, 100]', () => {
    expect(normalizeLineJurikMaPhase(50, 0)).toBe(50);
    expect(normalizeLineJurikMaPhase(-50, 0)).toBe(-50);
    expect(normalizeLineJurikMaPhase(0, 50)).toBe(0);
  });

  it('falls back for out-of-range', () => {
    expect(normalizeLineJurikMaPhase(101, 0)).toBe(0);
    expect(normalizeLineJurikMaPhase(-101, 0)).toBe(0);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineJurikMaPhase(Number.NaN, 0)).toBe(0);
  });
});

describe('normalizeLineJurikMaPower', () => {
  it('keeps a finite in [1, 4]', () => {
    expect(normalizeLineJurikMaPower(2, 2)).toBe(2);
    expect(normalizeLineJurikMaPower(1, 2)).toBe(1);
    expect(normalizeLineJurikMaPower(4, 2)).toBe(4);
  });

  it('falls back for out-of-range', () => {
    expect(normalizeLineJurikMaPower(0.5, 2)).toBe(2);
    expect(normalizeLineJurikMaPower(5, 2)).toBe(2);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineJurikMaPower(Number.NaN, 2)).toBe(2);
  });
});

describe('computeLineJurikMa', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineJurikMa(null, 14, 0, 2)).toEqual([]);
    expect(computeLineJurikMa([], 14, 0, 2)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineJurikMa(RISING.map((p) => p.close), 14, 0, 2)).toHaveLength(
      RISING.length,
    );
  });

  it('CONST_FLAT close = 5: JMA = 5 bit-exact at every bar', () => {
    const out = computeLineJurikMa(CONST_FLAT.map((p) => p.close), 14, 0, 2);
    for (const v of out) expect(v).toBe(5);
  });

  it('CONST_FLAT_HIGH close = 1000: JMA = 1000 bit-exact at every bar', () => {
    const out = computeLineJurikMa(
      CONST_FLAT_HIGH.map((p) => p.close),
      14,
      0,
      2,
    );
    for (const v of out) expect(v).toBe(1000);
  });

  it('CONST_FLAT identity holds for any (length, phase, power) triple', () => {
    const triples: Array<[number, number, number]> = [
      [2, -100, 1],
      [50, 0, 2],
      [200, 100, 4],
      [7, 50, 3],
    ];
    for (const [length, phase, power] of triples) {
      const out = computeLineJurikMa(
        CONST_FLAT.map((p) => p.close),
        length,
        phase,
        power,
      );
      for (const v of out) expect(v).toBe(5);
    }
  });

  it('first bar always equals the close (seed)', () => {
    const out = computeLineJurikMa(RISING.map((p) => p.close), 14, 0, 2);
    expect(out[0]).toBe(10);
  });

  it('RISING / FALLING: JMA trends with the close', () => {
    const r = computeLineJurikMa(RISING.map((p) => p.close), 14, 0, 2);
    const f = computeLineJurikMa(FALLING.map((p) => p.close), 14, 0, 2);
    expect(r[r.length - 1]!).toBeGreaterThan(r[10]!);
    expect(f[f.length - 1]!).toBeLessThan(f[10]!);
  });

  it('translation invariance: shifting close by k shifts JMA by exactly k', () => {
    const a = computeLineJurikMa(RISING.map((p) => p.close), 14, 0, 2);
    const b = computeLineJurikMa(
      RISING.map((p) => p.close + 1000),
      14,
      0,
      2,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBeCloseTo(a[i]! + 1000, 10);
    }
  });

  it('reads finite on the wave', () => {
    const out = computeLineJurikMa(WAVE.map((p) => p.close), 14, 0, 2);
    for (const v of out) {
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('non-finite close nulls the bar and resets the recurrence', () => {
    const closes = [5, 5, Number.NaN, 5, 5];
    const out = computeLineJurikMa(closes, 14, 0, 2);
    expect(out[2]).toBeNull();
    expect(out[3]).toBe(5);
    expect(out[4]).toBe(5);
  });
});

describe('classifyLineJurikMaZone', () => {
  it('close above JMA -> above', () => {
    expect(classifyLineJurikMaZone(12, 10)).toBe('above');
  });

  it('close below JMA -> below', () => {
    expect(classifyLineJurikMaZone(8, 10)).toBe('below');
  });

  it('close exactly at JMA -> at', () => {
    expect(classifyLineJurikMaZone(10, 10)).toBe('at');
  });

  it('null JMA -> none', () => {
    expect(classifyLineJurikMaZone(10, null)).toBe('none');
  });

  it('null close -> none', () => {
    expect(classifyLineJurikMaZone(null, 10)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineJurikMaZone(Number.NaN, 10)).toBe('none');
  });
});

describe('runLineJurikMa', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineJurikMa([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineJurikMa([], OPTS).ok).toBe(false);
    expect(runLineJurikMa(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineJurikMa(RISING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineJurikMa(RISING).length).toBe(
      DEFAULT_CHART_LINE_JURIK_MA_LENGTH,
    );
    expect(runLineJurikMa(RISING).phase).toBe(
      DEFAULT_CHART_LINE_JURIK_MA_PHASE,
    );
    expect(runLineJurikMa(RISING).power).toBe(
      DEFAULT_CHART_LINE_JURIK_MA_POWER,
    );
  });

  it('honours custom options', () => {
    const run = runLineJurikMa(RISING, OPTS);
    expect(run.length).toBe(14);
    expect(run.phase).toBe(0);
    expect(run.power).toBe(2);
  });

  it('produces one sample per finite point', () => {
    expect(runLineJurikMa(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT: every sample is at-JMA (close == JMA)', () => {
    const run = runLineJurikMa(CONST_FLAT, OPTS);
    expect(run.atCount).toBe(CONST_FLAT.length);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('exposes the final reading', () => {
    expect(runLineJurikMa(CONST_FLAT, OPTS).jmaFinal).toBe(5);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineJurikMa(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineJurikMa(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.aboveCount + run.atCount + run.belowCount + none).toBe(
      run.samples.length,
    );
  });
});

describe('computeLineJurikMaLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineJurikMaLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineJurikMaLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineJurikMaLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineJurikMaLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined JMA bar', () => {
    const layout = computeLineJurikMaLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length);
  });

  it('builds a non-empty JMA path on RISING', () => {
    const layout = computeLineJurikMaLayout({ data: RISING, ...OPTS });
    expect(layout.jmaPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineJurikMaLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('value domain covers price + JMA', () => {
    const layout = computeLineJurikMaLayout({ data: RISING, ...OPTS });
    expect(layout.valueMin).toBeLessThanOrEqual(10);
    expect(layout.valueMax).toBeGreaterThanOrEqual(39);
  });

  it('carries the run', () => {
    const layout = computeLineJurikMaLayout({ data: RISING, ...OPTS });
    expect(layout.run.length).toBe(14);
    expect(layout.run.phase).toBe(0);
    expect(layout.run.power).toBe(2);
  });
});

describe('describeLineJurikMaChart', () => {
  it('names the indicator', () => {
    expect(describeLineJurikMaChart(RISING, OPTS)).toContain('Jurik');
  });

  it('mentions all three params', () => {
    const desc = describeLineJurikMaChart(RISING, OPTS);
    expect(desc).toContain('length 14');
    expect(desc).toContain('phase 0');
    expect(desc).toContain('power 2');
  });

  it('mentions the constant-close identity', () => {
    expect(describeLineJurikMaChart(RISING, OPTS)).toContain(
      'constant close passes through',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineJurikMaChart([])).toBe('No data');
    expect(describeLineJurikMaChart(null)).toBe('No data');
  });
});

describe('<ChartLineJurikMa />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineJurikMa data={RISING} length={14} phase={0} power={2} />,
    );
    expect(
      screen.getByRole('region', { name: /Jurik MA chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineJurikMa data={RISING} length={14} phase={0} power={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-jurik-ma-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Jurik');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineJurikMa data={[]} length={14} phase={0} power={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-jurik-ma-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineJurikMa data={RISING} length={14} phase={0} power={2} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-jurik-ma"]',
    );
    expect(root?.getAttribute('data-length')).toBe('14');
    expect(root?.getAttribute('data-phase')).toBe('0');
    expect(root?.getAttribute('data-power')).toBe('2');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders the price line and the JMA line', () => {
    const { container } = render(
      <ChartLineJurikMa data={RISING} length={14} phase={0} power={2} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-jurik-ma-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-jurik-ma-line"]'),
    ).toBeInTheDocument();
  });

  it('marks every CONST_FLAT marker as at-JMA', () => {
    const { container } = render(
      <ChartLineJurikMa data={CONST_FLAT} length={14} phase={0} power={2} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-jurik-ma-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('at');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineJurikMa data={RISING} length={14} phase={0} power={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-jurik-ma-badge-config"]',
    );
    expect(badge?.textContent).toContain('JMA 14/0/2');
  });

  it('hides the JMA line via the legend toggle', () => {
    const { container } = render(
      <ChartLineJurikMa data={RISING} length={14} phase={0} power={2} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-jurik-ma-legend-item"][data-series-id="jma"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-jurik-ma-line"]'),
    ).toBeNull();
  });

  it('hides the JMA line via showJma=false', () => {
    const { container } = render(
      <ChartLineJurikMa
        data={RISING}
        length={14}
        phase={0}
        power={2}
        showJma={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-jurik-ma-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineJurikMa
        data={RISING}
        length={14}
        phase={0}
        power={2}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-jurik-ma-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineJurikMa
        ref={ref}
        data={RISING}
        length={14}
        phase={0}
        power={2}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
