import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineT3,
  computeLineT3,
  computeLineT3Ema,
  computeLineT3Layout,
  getLineT3FinitePoints,
  lineT3Coefficients,
  normalizeLineT3Period,
  normalizeLineT3Vfactor,
  runLineT3,
  describeLineT3Chart,
  type ChartLineT3Point,
} from './chart-line-t3';

afterEach(() => cleanup());

// A linear ramp of 15 points (value[i] = 3 + 3i). With period 3 the
// EMA multiplier is exactly 0.5 and with vfactor 0.5 the four T3
// coefficients are exact dyadic numbers (-0.125, 1.125, -3.375,
// 3.375), so the six-EMA cascade and the blend stay bit-exact.
// Each EMA stage lags the ramp by 3, so ema-k = value - 3k, and the
// T3 settles to value - 4.5 from index 6*3-6 = 12 onward:
//   t3 = [.,.,.,.,.,.,.,.,.,.,.,., 34.5, 37.5, 40.5]
const RAMP = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45];
const T3_DATA: ChartLineT3Point[] = RAMP.map((value, i) => ({ x: i, value }));

describe('getLineT3FinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineT3FinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineT3FinitePoints(null)).toEqual([]);
    expect(getLineT3FinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineT3Period', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineT3Period(5.7, 5)).toBe(5);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineT3Period(0, 5)).toBe(5);
    expect(normalizeLineT3Period(NaN, 5)).toBe(5);
    expect(normalizeLineT3Period(-2, 5)).toBe(5);
  });
});

describe('normalizeLineT3Vfactor', () => {
  it('keeps an in-range volume factor unchanged', () => {
    expect(normalizeLineT3Vfactor(0.5, 0.7)).toBe(0.5);
  });

  it('clamps a volume factor outside 0 to 1', () => {
    expect(normalizeLineT3Vfactor(-0.5, 0.7)).toBe(0);
    expect(normalizeLineT3Vfactor(2, 0.7)).toBe(1);
  });

  it('falls back for a non-finite volume factor', () => {
    expect(normalizeLineT3Vfactor(NaN, 0.7)).toBe(0.7);
  });
});

describe('lineT3Coefficients', () => {
  it('computes the four cubic coefficients for a volume factor', () => {
    expect(lineT3Coefficients(0.5)).toEqual({
      c1: -0.125,
      c2: 1.125,
      c3: -3.375,
      c4: 3.375,
    });
  });

  it('keeps the four coefficients summing to one', () => {
    const { c1, c2, c3, c4 } = lineT3Coefficients(0.7);
    expect(c1 + c2 + c3 + c4).toBeCloseTo(1, 10);
  });

  it('collapses to a plain triple EMA at volume factor zero', () => {
    expect(lineT3Coefficients(0)).toEqual({ c1: 0, c2: 0, c3: 0, c4: 1 });
  });
});

describe('computeLineT3Ema', () => {
  it('seeds with the simple mean then folds in later values', () => {
    expect(computeLineT3Ema([3, 6, 9, 12], 3)).toEqual([null, null, 6, 9]);
  });

  it('places the period-length mean as the seed', () => {
    expect(computeLineT3Ema([3, 6, 9, 12], 3)[2]).toBe(6);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineT3Ema([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('skips leading null placeholders before seeding', () => {
    expect(computeLineT3Ema([null, null, 6, 9, 12], 3)).toEqual([
      null,
      null,
      null,
      null,
      9,
    ]);
  });

  it('returns all null when fewer defined values than the period', () => {
    expect(computeLineT3Ema([1, 2], 3)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineT3Ema(null, 3)).toEqual([]);
  });
});

describe('computeLineT3', () => {
  const values = T3_DATA.map((p) => p.value);

  it('exposes the first EMA of the cascade', () => {
    const { ema1 } = computeLineT3(values, 3, 0.5);
    expect(ema1[2]).toBe(6);
    expect(ema1[14]).toBe(42);
  });

  it('exposes the sixth EMA of the cascade', () => {
    const { ema6 } = computeLineT3(values, 3, 0.5);
    expect(ema6[11]).toBeNull();
    expect(ema6[12]).toBe(21);
  });

  it('blends the cascade into the T3 series', () => {
    const { t3 } = computeLineT3(values, 3, 0.5);
    expect(t3[12]).toBe(34.5);
    expect(t3[13]).toBe(37.5);
    expect(t3[14]).toBe(40.5);
  });

  it('leaves the bars before 6*period-6 as a null warm-up', () => {
    const { t3 } = computeLineT3(values, 3, 0.5);
    expect(t3[11]).toBeNull();
    expect(t3[12]).not.toBeNull();
  });

  it('collapses to the triple-nested EMA at volume factor zero', () => {
    const { ema3, t3 } = computeLineT3(values, 3, 0);
    expect(t3[12]).toBe(ema3[12]);
    expect(t3[14]).toBe(ema3[14]);
  });

  it('reads a flat T3 equal to the constant of a flat series', () => {
    const flat = new Array(15).fill(7);
    const { t3 } = computeLineT3(flat, 3, 0.5);
    expect(t3[12]).toBe(7);
    expect(t3[14]).toBe(7);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineT3(null, 3, 0.5)).toEqual({
      ema1: [],
      ema2: [],
      ema3: [],
      ema4: [],
      ema5: [],
      ema6: [],
      t3: [],
    });
  });
});

describe('runLineT3', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineT3(T3_DATA, { period: 3, vfactor: 0.5 }).ok).toBe(true);
  });

  it('carries the period and volume factor onto the run', () => {
    const run = runLineT3(T3_DATA, { period: 3, vfactor: 0.5 });
    expect(run.period).toBe(3);
    expect(run.vfactor).toBe(0.5);
  });

  it('exposes the T3 series', () => {
    const run = runLineT3(T3_DATA, { period: 3, vfactor: 0.5 });
    expect(run.t3[12]).toBe(34.5);
    expect(run.t3[14]).toBe(40.5);
  });

  it('reports the final, min and max T3 readings', () => {
    const run = runLineT3(T3_DATA, { period: 3, vfactor: 0.5 });
    expect(run.t3Final).toBe(40.5);
    expect(run.t3Min).toBe(34.5);
    expect(run.t3Max).toBe(40.5);
  });

  it('classifies each sample by price position versus the T3', () => {
    const run = runLineT3(T3_DATA, { period: 3, vfactor: 0.5 });
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[12]!.position).toBe('above');
    expect(run.samples[14]!.position).toBe('above');
  });

  it('counts bars above and below the T3 for an oscillating series', () => {
    const wave: ChartLineT3Point[] = Array.from({ length: 24 }, (_, i) => ({
      x: i,
      value: i % 2 === 0 ? 10 : 20,
    }));
    const run = runLineT3(wave, { period: 3, vfactor: 0.5 });
    expect(run.aboveCount).toBeGreaterThan(0);
    expect(run.belowCount).toBeGreaterThan(0);
  });

  it('leaves warm-up samples with a null T3', () => {
    const run = runLineT3(T3_DATA, { period: 3, vfactor: 0.5 });
    expect(run.samples[0]!.t3).toBeNull();
    expect(run.samples[12]!.t3).toBe(34.5);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...T3_DATA].reverse();
    const run = runLineT3(shuffled, { period: 3, vfactor: 0.5 });
    expect(run.series.map((p) => p.x)).toEqual(
      Array.from({ length: 15 }, (_, i) => i),
    );
    expect(run.t3[14]).toBe(40.5);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineT3([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineT3([]).ok).toBe(false);
    expect(runLineT3(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineT3(T3_DATA, { period: 3, vfactor: 0.5 }).samples).toHaveLength(
      15,
    );
  });

  it('defaults to period 5 and reads no T3 for a short series', () => {
    const run = runLineT3(T3_DATA);
    expect(run.period).toBe(5);
    expect(run.t3.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.t3Final)).toBe(true);
  });
});

describe('computeLineT3Layout', () => {
  const base = {
    data: T3_DATA,
    period: 3,
    vfactor: 0.5,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineT3Layout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(15);
  });

  it('builds non-empty price and T3 paths', () => {
    const layout = computeLineT3Layout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.t3Path.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the T3 is defined', () => {
    const layout = computeLineT3Layout(base);
    expect(layout.t3Markers).toHaveLength(3);
    expect(layout.priceDots).toHaveLength(15);
  });

  it('spans a y domain covering both the price and the T3', () => {
    const layout = computeLineT3Layout(base);
    expect(layout.yMin).toBeLessThanOrEqual(3);
    expect(layout.yMax).toBeGreaterThanOrEqual(45);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineT3Layout(base);
    expect(layout.t3Final).toBe(40.5);
    expect(layout.period).toBe(3);
    expect(layout.vfactor).toBe(0.5);
  });

  it('keeps the T3 markers inside the panel', () => {
    const layout = computeLineT3Layout(base);
    for (const m of layout.t3Markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineT3Layout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.t3Path).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineT3Layout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineT3Chart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineT3Chart(T3_DATA, { period: 3, vfactor: 0.5 });
    expect(text).toContain('Tillson T3 Moving Average');
    expect(text).toContain('T3');
    expect(text).toContain('cascade');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('volume factor');
  });

  it('reports the above and below counts', () => {
    const text = describeLineT3Chart(T3_DATA, { period: 3, vfactor: 0.5 });
    expect(text).toContain('above the T3 on 3');
    expect(text).toContain('below on 0');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineT3Chart([])).toBe('No data');
    expect(describeLineT3Chart(null)).toBe('No data');
  });
});

describe('<ChartLineT3 />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-t3-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Tillson T3 Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} />,
    );
    const root = container.querySelector('[data-section="chart-line-t3"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-vfactor')).toBe('0.5');
    expect(root!.getAttribute('data-t3-final')).toBe('40.5');
    expect(root!.getAttribute('data-above-count')).toBe('3');
    expect(root!.getAttribute('data-below-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('15');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and T3 lines', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-t3-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-t3-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-t3-t3-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined T3 value', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-t3-marker"]',
    );
    expect(markers).toHaveLength(3);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-t3-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period and volume factor', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} />,
    );
    const period = container.querySelector(
      '[data-section="chart-line-t3-badge-period"]',
    );
    const vfactor = container.querySelector(
      '[data-section="chart-line-t3-badge-vfactor"]',
    );
    expect(period!.textContent).toContain('3');
    expect(vfactor!.textContent).toContain('0.5');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineT3
        data={T3_DATA}
        period={3}
        vfactor={0.5}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-t3-price-path"]'),
    ).toBeNull();
  });

  it('hides the T3 line and markers when showT3 is false', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} showT3={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-t3-t3-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-t3-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the T3 line via the hidden set', () => {
    const { container } = render(
      <ChartLineT3
        data={T3_DATA}
        period={3}
        vfactor={0.5}
        hiddenSeries={['t3']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-t3-t3-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineT3
        data={T3_DATA}
        period={3}
        vfactor={0.5}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-t3-legend-item"][data-series-id="t3"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 't3', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-t3-dot"]'),
    ).toHaveLength(15);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineT3 data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-t3"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-t3-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineT3
        data={T3_DATA}
        period={3}
        vfactor={0.5}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-t3-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineT3 ref={ref} data={T3_DATA} period={3} vfactor={0.5} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-t3');
  });

  it('has a stable displayName', () => {
    expect(ChartLineT3.displayName).toBe('ChartLineT3');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineT3 data={T3_DATA} period={3} vfactor={0.5} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-t3"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
