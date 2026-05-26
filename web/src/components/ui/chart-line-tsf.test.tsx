import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineTsf,
  DEFAULT_CHART_LINE_TSF_PERIOD,
  classifyLineTsfTrend,
  computeLineTsf,
  computeLineTsfLayout,
  computeLineTsfRegression,
  describeLineTsfChart,
  getLineTsfFinitePoints,
  normalizeLineTsfPeriod,
  runLineTsf,
  type ChartLineTsfPoint,
} from './chart-line-tsf';

const toPoints = (values: number[]): ChartLineTsfPoint[] =>
  values.map((v, i) => ({ x: i, value: v }));

const CONST_FLAT: ChartLineTsfPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);
// Linear ramp: close = i + 10. TSF at bar i with period 4 = i + 11.
const RISING: ChartLineTsfPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
]);
const FALLING: ChartLineTsfPoint[] = toPoints([
  19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
]);
const WAVE: ChartLineTsfPoint[] = Array.from({ length: 30 }, (_, i) => ({
  x: i,
  value: 50 + 10 * Math.sin(i * 0.4),
}));

const OPTS = { period: 4 } as const;

describe('getLineTsfFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineTsfFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineTsfFinitePoints('nope' as unknown as ChartLineTsfPoint[]),
    ).toEqual([]);
  });

  it('drops non-finite x or value', () => {
    const points: ChartLineTsfPoint[] = [
      { x: 0, value: 1 },
      { x: Number.NaN, value: 2 },
      { x: 1, value: Number.POSITIVE_INFINITY },
      { x: 2, value: 3 },
    ];
    expect(getLineTsfFinitePoints(points)).toEqual([
      { x: 0, value: 1 },
      { x: 2, value: 3 },
    ]);
  });

  it('preserves input order', () => {
    const finite = getLineTsfFinitePoints(RISING.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...RISING].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineTsfPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineTsfPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineTsfPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineTsfPeriod(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineTsfPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('computeLineTsfRegression', () => {
  it('returns null on a single value', () => {
    expect(computeLineTsfRegression([5])).toBeNull();
  });

  it('constant series: slope 0, intercept = constant (bit-exact)', () => {
    const reg = computeLineTsfRegression([5, 5, 5, 5]);
    expect(reg).not.toBeNull();
    expect(reg!.slope).toBe(0);
    expect(reg!.intercept).toBe(5);
  });

  it('linear ramp y = j + 10: slope = 1, intercept = 10 (bit-exact)', () => {
    const reg = computeLineTsfRegression([10, 11, 12, 13]);
    expect(reg).not.toBeNull();
    expect(reg!.slope).toBe(1);
    expect(reg!.intercept).toBe(10);
  });

  it('negative linear ramp y = -j + 13: slope = -1, intercept = 13', () => {
    const reg = computeLineTsfRegression([13, 12, 11, 10]);
    expect(reg).not.toBeNull();
    expect(reg!.slope).toBe(-1);
    expect(reg!.intercept).toBe(13);
  });

  it('the regression line passes through the bar average at j = (N-1)/2', () => {
    const ys = [10, 11, 12, 13];
    const reg = computeLineTsfRegression(ys)!;
    const sumY = ys.reduce((a, b) => a + b, 0);
    const meanY = sumY / ys.length;
    const meanJ = (ys.length - 1) / 2;
    expect(reg.intercept + reg.slope * meanJ).toBeCloseTo(meanY, 12);
  });
});

describe('computeLineTsf', () => {
  it('returns empty arrays for non-array or empty input', () => {
    expect(computeLineTsf(null, 4)).toEqual({ tsf: [], slope: [] });
    expect(computeLineTsf([], 4)).toEqual({ tsf: [], slope: [] });
  });

  it('matches input length on both arrays', () => {
    const { tsf, slope } = computeLineTsf(
      RISING.map((p) => p.value),
      4,
    );
    expect(tsf).toHaveLength(RISING.length);
    expect(slope).toHaveLength(RISING.length);
  });

  it('leaves the warm-up bars null', () => {
    const { tsf, slope } = computeLineTsf(
      RISING.map((p) => p.value),
      4,
    );
    for (let i = 0; i < 3; i += 1) {
      expect(tsf[i]).toBeNull();
      expect(slope[i]).toBeNull();
    }
  });

  it('CONST_FLAT: TSF = constant at every defined bar (bit-exact)', () => {
    const { tsf, slope } = computeLineTsf(
      CONST_FLAT.map((p) => p.value),
      4,
    );
    for (let i = 3; i < tsf.length; i += 1) {
      expect(tsf[i]).toBe(5);
      expect(slope[i]).toBe(0);
    }
  });

  it('RISING linear ramp: TSF[i] = close[i + 1] (the next bar) bit-exact', () => {
    const { tsf } = computeLineTsf(
      RISING.map((p) => p.value),
      4,
    );
    // RISING[i] = i + 10. TSF[i] = i + 11 = next bar's close.
    // TSF[3] = 14, TSF[4] = 15, ..., TSF[9] = 20.
    expect(tsf).toEqual([
      null,
      null,
      null,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
    ]);
  });

  it('FALLING linear ramp: TSF[i] = close[i + 1] bit-exact', () => {
    const { tsf } = computeLineTsf(
      FALLING.map((p) => p.value),
      4,
    );
    // FALLING[i] = 19 - i. TSF[i] = 19 - (i + 1) = 18 - i.
    // TSF[3] = 15, TSF[4] = 14, ..., TSF[9] = 9.
    expect(tsf).toEqual([
      null,
      null,
      null,
      15,
      14,
      13,
      12,
      11,
      10,
      9,
    ]);
  });

  it('RISING ramp: slope = 1 at every defined bar (bit-exact)', () => {
    const { slope } = computeLineTsf(
      RISING.map((p) => p.value),
      4,
    );
    for (let i = 3; i < slope.length; i += 1) expect(slope[i]).toBe(1);
  });

  it('FALLING ramp: slope = -1 at every defined bar (bit-exact)', () => {
    const { slope } = computeLineTsf(
      FALLING.map((p) => p.value),
      4,
    );
    for (let i = 3; i < slope.length; i += 1) expect(slope[i]).toBe(-1);
  });

  it('translation invariance: shifting close by k shifts TSF by k bit-exact for integer fixtures', () => {
    const a = computeLineTsf(
      RISING.map((p) => p.value),
      4,
    );
    const b = computeLineTsf(
      RISING.map((p) => p.value + 1000),
      4,
    );
    for (let i = 0; i < a.tsf.length; i += 1) {
      if (a.tsf[i] === null) {
        expect(b.tsf[i]).toBeNull();
      } else {
        expect(b.tsf[i]).toBe(a.tsf[i]! + 1000);
      }
    }
  });

  it('produces finite output for a finite wave', () => {
    const { tsf } = computeLineTsf(
      WAVE.map((p) => p.value),
      4,
    );
    for (let i = 3; i < tsf.length; i += 1) {
      expect(Number.isFinite(tsf[i]!)).toBe(true);
    }
  });
});

describe('classifyLineTsfTrend', () => {
  it('positive slope -> up', () => {
    expect(classifyLineTsfTrend(0.5)).toBe('up');
  });

  it('negative slope -> down', () => {
    expect(classifyLineTsfTrend(-0.5)).toBe('down');
  });

  it('zero slope -> flat', () => {
    expect(classifyLineTsfTrend(0)).toBe('flat');
  });

  it('null -> none', () => {
    expect(classifyLineTsfTrend(null)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineTsfTrend(Number.NaN)).toBe('none');
  });
});

describe('runLineTsf', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineTsf([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineTsf([]).ok).toBe(false);
    expect(runLineTsf(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineTsf(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period', () => {
    const run = runLineTsf(RISING);
    expect(run.period).toBe(DEFAULT_CHART_LINE_TSF_PERIOD);
  });

  it('honours a custom period', () => {
    const run = runLineTsf(RISING, OPTS);
    expect(run.period).toBe(4);
  });

  it('classifies the rising ramp as fully up after the warm-up', () => {
    const run = runLineTsf(RISING, OPTS);
    expect(run.upCount).toBe(RISING.length - 3);
    expect(run.downCount).toBe(0);
  });

  it('classifies the falling ramp as fully down after the warm-up', () => {
    const run = runLineTsf(FALLING, OPTS);
    expect(run.downCount).toBe(FALLING.length - 3);
    expect(run.upCount).toBe(0);
  });

  it('classifies the constant series as fully flat after the warm-up', () => {
    const run = runLineTsf(CONST_FLAT, OPTS);
    expect(run.flatCount).toBe(CONST_FLAT.length - 3);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('self-consistent trend counts equal sample length', () => {
    const run = runLineTsf(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.trend === 'none') none += 1;
    }
    expect(run.upCount + run.downCount + run.flatCount + none).toBe(
      run.samples.length,
    );
  });

  it('produces one sample per finite point', () => {
    const run = runLineTsf(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineTsf(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final TSF reading', () => {
    expect(runLineTsf(CONST_FLAT, OPTS).tsfFinal).toBe(5);
    expect(runLineTsf(RISING, OPTS).tsfFinal).toBe(20);
    expect(runLineTsf(FALLING, OPTS).tsfFinal).toBe(9);
  });
});

describe('computeLineTsfLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineTsfLayout({ data: [{ x: 0, value: 1 }], ...OPTS }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineTsfLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineTsfLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineTsfLayout({ data: RISING, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineTsfLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one TSF segment between each consecutive defined bar', () => {
    const layout = computeLineTsfLayout({ data: RISING, ...OPTS });
    // RISING period 4 -> defined at bars 3..9 -> 7 bars -> 6 segments.
    expect(layout.segments).toHaveLength(6);
  });

  it('emits one marker per defined-TSF bar', () => {
    const layout = computeLineTsfLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 3);
  });

  it('the value domain covers the price and the projected TSF', () => {
    const layout = computeLineTsfLayout({ data: RISING, ...OPTS });
    expect(layout.valueMin).toBeLessThanOrEqual(10);
    expect(layout.valueMax).toBeGreaterThanOrEqual(20);
  });

  it('carries the run', () => {
    const layout = computeLineTsfLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineTsfLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });
});

describe('describeLineTsfChart', () => {
  it('names the indicator', () => {
    expect(describeLineTsfChart(RISING, OPTS)).toContain('Time Series Forecast');
  });

  it('mentions the period', () => {
    expect(describeLineTsfChart(RISING, { period: 9 })).toContain('period 9');
  });

  it('mentions the regression and the one-bar projection', () => {
    expect(describeLineTsfChart(RISING, OPTS)).toContain('regression');
    expect(describeLineTsfChart(RISING, OPTS)).toContain('one bar forward');
  });

  it('mentions the linear-ramp identity', () => {
    expect(describeLineTsfChart(RISING, OPTS)).toContain('linear ramp');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineTsfChart([])).toBe('No data');
    expect(describeLineTsfChart(null)).toBe('No data');
  });
});

describe('<ChartLineTsf />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineTsf data={RISING} period={4} />);
    expect(
      screen.getByRole('region', { name: /Time Series Forecast chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(<ChartLineTsf data={RISING} period={4} />);
    const desc = container.querySelector(
      '[data-section="chart-line-tsf-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Time Series Forecast');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineTsf data={[]} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-tsf-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(<ChartLineTsf data={RISING} period={4} />);
    const root = container.querySelector('[data-section="chart-line-tsf"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(<ChartLineTsf data={RISING} period={4} />);
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(<ChartLineTsf data={RISING} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-tsf-price-path"]'),
    ).toBeInTheDocument();
  });

  it('renders one TSF segment between each consecutive defined bar', () => {
    const { container } = render(<ChartLineTsf data={RISING} period={4} />);
    const segments = container.querySelectorAll(
      '[data-section="chart-line-tsf-segment"]',
    );
    expect(segments).toHaveLength(6);
  });

  it('renders markers for the defined-TSF bars', () => {
    const { container } = render(<ChartLineTsf data={RISING} period={4} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tsf-marker"]',
    );
    expect(markers).toHaveLength(RISING.length - 3);
  });

  it('marks every RISING marker as up', () => {
    const { container } = render(<ChartLineTsf data={RISING} period={4} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tsf-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-trend')).toBe('up');
  });

  it('marks every FALLING marker as down', () => {
    const { container } = render(<ChartLineTsf data={FALLING} period={4} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tsf-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-trend')).toBe('down');
  });

  it('marks every CONST_FLAT marker as flat', () => {
    const { container } = render(<ChartLineTsf data={CONST_FLAT} period={4} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tsf-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-trend')).toBe('flat');
  });

  it('renders the config badge', () => {
    const { container } = render(<ChartLineTsf data={RISING} period={4} />);
    const badge = container.querySelector(
      '[data-section="chart-line-tsf-badge-config"]',
    );
    expect(badge?.textContent).toContain('TSF 4');
  });

  it('hides the TSF line via the legend toggle', () => {
    const { container } = render(<ChartLineTsf data={RISING} period={4} />);
    const btn = container.querySelector(
      '[data-section="chart-line-tsf-legend-item"][data-series-id="tsf"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-tsf-segments"]'),
    ).toBeNull();
  });

  it('hides the TSF line via showTsf=false', () => {
    const { container } = render(
      <ChartLineTsf data={RISING} period={4} showTsf={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tsf-segments"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineTsf
        data={RISING}
        period={4}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-tsf-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTsf ref={ref} data={RISING} period={4} />);
    expect(ref.current).not.toBeNull();
  });
});
