import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineCorrectedMa,
  type ChartLineCorrectedMaPoint,
  type ChartLineCorrectedMaSample,
  DEFAULT_CHART_LINE_CORRECTED_MA_PERIOD,
  getLineCorrectedMaFinitePoints,
  normalizeLineCorrectedMaPeriod,
  computeLineCorrectedMaSma,
  computeLineCorrectedMaVariance,
  correctLineCorrectedMa,
  computeLineCorrectedMa,
  classifyLineCorrectedMaTrend,
  runLineCorrectedMa,
  computeLineCorrectedMaLayout,
  describeLineCorrectedMaChart,
} from './chart-line-corrected-ma';

/**
 * Twelve bars periodic with period 4: every period-4 window is a rotation
 * of {10,20,30,40}, so the moving average is a constant 25 and the
 * variance a constant 125. The corrected average therefore pins to 25
 * with zero corrections from its first bar.
 */
const PERIODIC_DATA: ChartLineCorrectedMaPoint[] = [
  10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40,
].map((value, i) => ({ x: i, value }));

const PERIODIC_VALUES: number[] = PERIODIC_DATA.map((p) => p.value);

/** Ten constant bars: zero variance, so the band collapses to the average. */
const CONST_DATA: ChartLineCorrectedMaPoint[] = Array.from(
  { length: 10 },
  (_, i) => ({ x: i, value: 50 }),
);

const CONST_VALUES: number[] = CONST_DATA.map((p) => p.value);

/** Twenty-four trending bars for the structural and render checks. */
const WAVE_DATA: ChartLineCorrectedMaPoint[] = [
  20, 22, 25, 28, 32, 35, 37, 40, 42, 43, 42, 40, 37, 34, 30, 27, 24, 22, 21,
  22, 25, 29, 33, 36,
].map((value, i) => ({ x: i, value }));

const WAVE_VALUES: number[] = WAVE_DATA.map((p) => p.value);

const OPTS = { period: 4 };

describe('getLineCorrectedMaFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineCorrectedMaFinitePoints(null)).toEqual([]);
    expect(
      getLineCorrectedMaFinitePoints(
        undefined as unknown as ChartLineCorrectedMaPoint[],
      ),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineCorrectedMaFinitePoints([])).toEqual([]);
  });

  it('drops points with a non-finite x or value', () => {
    const dirty = [
      { x: 0, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 2, value: Number.POSITIVE_INFINITY },
      { x: 3, value: 30 },
    ] as ChartLineCorrectedMaPoint[];
    expect(getLineCorrectedMaFinitePoints(dirty)).toEqual([
      { x: 0, value: 10 },
      { x: 3, value: 30 },
    ]);
  });

  it('preserves the input order', () => {
    const out = getLineCorrectedMaFinitePoints([
      { x: 5, value: 1 },
      { x: 2, value: 2 },
      { x: 9, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineCorrectedMaPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineCorrectedMaPeriod(20, 8)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineCorrectedMaPeriod(12.7, 20)).toBe(12);
  });

  it('falls back for a period below two', () => {
    expect(normalizeLineCorrectedMaPeriod(1, 20)).toBe(20);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineCorrectedMaPeriod(0, 20)).toBe(20);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineCorrectedMaPeriod(-8, 20)).toBe(20);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineCorrectedMaPeriod(Number.NaN, 20)).toBe(20);
  });
});

describe('computeLineCorrectedMaSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineCorrectedMaSma(null, 4)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineCorrectedMaSma(PERIODIC_VALUES, 4)).toHaveLength(
      PERIODIC_VALUES.length,
    );
  });

  it('leaves the warm-up window null', () => {
    const sma = computeLineCorrectedMaSma(PERIODIC_VALUES, 4);
    expect(sma[0]).toBeNull();
    expect(sma[2]).toBeNull();
  });

  it('averages the trailing window', () => {
    expect(computeLineCorrectedMaSma([4, 8, 12, 16], 4)[3]).toBe(10);
  });

  it('holds the moving average constant for a periodic series', () => {
    expect(computeLineCorrectedMaSma(PERIODIC_VALUES, 4)).toEqual([
      null,
      null,
      null,
      25,
      25,
      25,
      25,
      25,
      25,
      25,
      25,
      25,
    ]);
  });
});

describe('computeLineCorrectedMaVariance', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineCorrectedMaVariance(null, 4)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineCorrectedMaVariance(PERIODIC_VALUES, 4)).toHaveLength(
      PERIODIC_VALUES.length,
    );
  });

  it('leaves the warm-up window null', () => {
    const variance = computeLineCorrectedMaVariance(PERIODIC_VALUES, 4);
    expect(variance[2]).toBeNull();
  });

  it('takes the mean squared deviation of the window', () => {
    expect(computeLineCorrectedMaVariance([2, 4, 6, 8], 4)[3]).toBe(5);
  });

  it('holds the variance constant for a periodic series', () => {
    const variance = computeLineCorrectedMaVariance(PERIODIC_VALUES, 4);
    for (let i = 3; i < variance.length; i += 1) {
      expect(variance[i]).toBe(125);
    }
  });

  it('is zero for a constant window', () => {
    expect(computeLineCorrectedMaVariance([7, 7, 7, 7], 4)[3]).toBe(0);
  });
});

describe('correctLineCorrectedMa', () => {
  it('leaves a value already inside the band unchanged', () => {
    const out = correctLineCorrectedMa(0.5, 0, 1);
    expect(out.cma).toBe(0.5);
    expect(out.iterations).toBe(0);
  });

  it('collapses to the average when the variance is zero', () => {
    const out = correctLineCorrectedMa(50, 7, 0);
    expect(out.cma).toBe(7);
    expect(out.iterations).toBe(0);
  });

  it('iterates a far value back inside the variance band', () => {
    const out = correctLineCorrectedMa(100, 0, 1);
    expect(out.iterations).toBeGreaterThan(0);
    expect(out.cma * out.cma).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('pulls the value toward the average, never past it', () => {
    const out = correctLineCorrectedMa(100, 0, 1);
    expect(out.cma).toBeGreaterThanOrEqual(0);
    expect(out.cma).toBeLessThanOrEqual(100);
  });

  it('lands the corrected value inside the variance band', () => {
    for (const prev of [80, -40, 12, 200]) {
      const out = correctLineCorrectedMa(prev, 5, 9);
      const diff = out.cma - 5;
      expect(diff * diff).toBeLessThanOrEqual(9 + 1e-9);
    }
  });

  it('keeps the prior value when the average is non-finite', () => {
    const out = correctLineCorrectedMa(5, Number.NaN, 1);
    expect(out.cma).toBe(5);
    expect(out.iterations).toBe(0);
  });

  it('falls back to the average when the prior value is non-finite', () => {
    const out = correctLineCorrectedMa(Number.NaN, 7, 1);
    expect(out.cma).toBe(7);
    expect(out.iterations).toBe(0);
  });
});

describe('computeLineCorrectedMa', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineCorrectedMa(null, 4)).toEqual({
      sma: [],
      variance: [],
      cma: [],
      iterations: [],
    });
  });

  it('matches the input length on every array', () => {
    const out = computeLineCorrectedMa(WAVE_VALUES, 4);
    expect(out.sma).toHaveLength(WAVE_VALUES.length);
    expect(out.variance).toHaveLength(WAVE_VALUES.length);
    expect(out.cma).toHaveLength(WAVE_VALUES.length);
    expect(out.iterations).toHaveLength(WAVE_VALUES.length);
  });

  it('pins the corrected average to the centre of a periodic series', () => {
    expect(computeLineCorrectedMa(PERIODIC_VALUES, 4).cma).toEqual([
      null,
      null,
      null,
      25,
      25,
      25,
      25,
      25,
      25,
      25,
      25,
      25,
    ]);
  });

  it('needs no corrections for a periodic series', () => {
    expect(computeLineCorrectedMa(PERIODIC_VALUES, 4).iterations).toEqual([
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it('reproduces a constant series exactly', () => {
    const out = computeLineCorrectedMa(CONST_VALUES, 4);
    for (let i = 3; i < out.cma.length; i += 1) {
      expect(out.cma[i]).toBe(50);
    }
  });

  it('keeps every corrected value inside its variance band', () => {
    const out = computeLineCorrectedMa(WAVE_VALUES, 4);
    for (let i = 0; i < out.cma.length; i += 1) {
      const cma = out.cma[i];
      const sma = out.sma[i];
      const variance = out.variance[i];
      if (cma == null || sma == null || variance == null) continue;
      const diff = cma - sma;
      expect(diff * diff).toBeLessThanOrEqual(variance + 1e-9);
    }
  });

  it('keeps every corrected value finite where defined', () => {
    const out = computeLineCorrectedMa(WAVE_VALUES, 4);
    for (const v of out.cma) {
      if (v !== null) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('classifyLineCorrectedMaTrend', () => {
  it('classifies a rising corrected value as up', () => {
    expect(classifyLineCorrectedMaTrend(12, 10)).toBe('up');
  });

  it('classifies a falling corrected value as down', () => {
    expect(classifyLineCorrectedMaTrend(8, 10)).toBe('down');
  });

  it('classifies an unchanged corrected value as flat', () => {
    expect(classifyLineCorrectedMaTrend(10, 10)).toBe('flat');
  });

  it('classifies a null current value as none', () => {
    expect(classifyLineCorrectedMaTrend(null, 10)).toBe('none');
  });

  it('classifies a null prior value as none', () => {
    expect(classifyLineCorrectedMaTrend(10, null)).toBe('none');
  });
});

describe('runLineCorrectedMa', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineCorrectedMa([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineCorrectedMa([]).ok).toBe(false);
    expect(runLineCorrectedMa(null).ok).toBe(false);
  });

  it('is ok for a series of at least two points', () => {
    expect(runLineCorrectedMa(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period when none is given', () => {
    expect(runLineCorrectedMa(WAVE_DATA).period).toBe(
      DEFAULT_CHART_LINE_CORRECTED_MA_PERIOD,
    );
  });

  it('honours a custom period', () => {
    expect(runLineCorrectedMa(WAVE_DATA, { period: 6 }).period).toBe(6);
  });

  it('counts a periodic series wholly flat', () => {
    const run = runLineCorrectedMa(PERIODIC_DATA, OPTS);
    expect(run.flatCount).toBe(8);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('carries the variance band edges on each sample', () => {
    const run = runLineCorrectedMa(PERIODIC_DATA, OPTS);
    const sample = run.samples[3]!;
    expect(sample.upper).toBeCloseTo(25 + Math.sqrt(125));
    expect(sample.lower).toBeCloseTo(25 - Math.sqrt(125));
  });

  it('keeps every corrected sample inside its variance band', () => {
    const run = runLineCorrectedMa(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      if (
        sample.cma === null ||
        sample.sma === null ||
        sample.variance === null
      ) {
        continue;
      }
      const diff = sample.cma - sample.sma;
      expect(diff * diff).toBeLessThanOrEqual(sample.variance + 1e-9);
    }
  });

  it('assigns each sample a valid trend', () => {
    const run = runLineCorrectedMa(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.trend);
    }
  });

  it('emits one sample per point', () => {
    const run = runLineCorrectedMa(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('carries the sma, variance, cma and iteration arrays', () => {
    const run = runLineCorrectedMa(WAVE_DATA, OPTS);
    expect(run.sma).toHaveLength(WAVE_DATA.length);
    expect(run.variance).toHaveLength(WAVE_DATA.length);
    expect(run.cma).toHaveLength(WAVE_DATA.length);
    expect(run.iterations).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineCorrectedMa(
      [
        { x: 3, value: 30 },
        { x: 1, value: 10 },
        { x: 2, value: 20 },
      ],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final corrected value', () => {
    const run = runLineCorrectedMa(PERIODIC_DATA, OPTS);
    expect(run.cmaFinal).toBe(25);
  });
});

describe('computeLineCorrectedMaLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineCorrectedMaLayout({
      data: [{ x: 0, value: 1 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineCorrectedMaLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineCorrectedMaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('builds a price path, a cma path and a band path', () => {
    const layout = computeLineCorrectedMaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.cmaPath.length).toBeGreaterThan(0);
    expect(layout.bandPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineCorrectedMaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite corrected bar', () => {
    const layout = computeLineCorrectedMaLayout({ data: WAVE_DATA, ...OPTS });
    const finiteCma = layout.run.cma.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(finiteCma);
  });

  it('closes the band path', () => {
    const layout = computeLineCorrectedMaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.bandPath.trim().endsWith('Z')).toBe(true);
  });

  it('spans the value domain over the band edges', () => {
    const layout = computeLineCorrectedMaLayout({ data: WAVE_DATA, ...OPTS });
    const run = layout.run;
    for (const sample of run.samples) {
      if (sample.upper !== null) {
        expect(layout.valueMax).toBeGreaterThanOrEqual(sample.upper);
      }
      if (sample.lower !== null) {
        expect(layout.valueMin).toBeLessThanOrEqual(sample.lower);
      }
    }
  });

  it('carries the run', () => {
    const layout = computeLineCorrectedMaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineCorrectedMaChart', () => {
  it('names the Corrected Moving Average', () => {
    expect(describeLineCorrectedMaChart(WAVE_DATA, OPTS)).toContain(
      'Corrected Moving Average',
    );
  });

  it('mentions the variance band', () => {
    expect(describeLineCorrectedMaChart(WAVE_DATA, OPTS)).toContain(
      'variance band',
    );
  });

  it('mentions the iteration', () => {
    expect(describeLineCorrectedMaChart(WAVE_DATA, OPTS)).toContain(
      'iterates',
    );
  });

  it('reports the trend counts', () => {
    const run = runLineCorrectedMa(WAVE_DATA, OPTS);
    const text = describeLineCorrectedMaChart(WAVE_DATA, OPTS);
    expect(text).toContain(`rises on ${run.upCount}`);
    expect(text).toContain(`falls on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineCorrectedMaChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineCorrectedMa />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain(
      'Corrected Moving Average',
    );
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-corrected-ma-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Corrected Moving Average');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={[]} {...OPTS} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-corrected-ma-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and point count on the root', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-corrected-ma"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-corrected-ma-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price and cma lines', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-corrected-ma-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-corrected-ma-cma-line"]',
      ),
    ).not.toBeNull();
  });

  it('draws the variance band', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-corrected-ma-band"]'),
    ).not.toBeNull();
  });

  it('renders one marker per finite corrected bar', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} />,
    );
    const run = runLineCorrectedMa(WAVE_DATA, OPTS);
    const finiteCma = run.cma.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-corrected-ma-marker"]',
    );
    expect(markers).toHaveLength(finiteCma);
  });

  it('tags each marker with a valid trend', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-corrected-ma-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-trend'),
      );
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-corrected-ma-badge-config"]',
    );
    expect(badge?.textContent).toBe('CMA 4');
  });

  it('hides the cma line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} hiddenSeries={['cma']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-corrected-ma-cma-line"]',
      ),
    ).toBeNull();
  });

  it('hides the variance band when showBand is false', () => {
    const { container } = render(
      <ChartLineCorrectedMa data={WAVE_DATA} {...OPTS} showBand={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-corrected-ma-band"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCorrectedMa
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-corrected-ma-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineCorrectedMaSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCorrectedMa ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-corrected-ma',
    );
  });
});
