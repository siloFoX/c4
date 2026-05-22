import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineMesaSine,
  type ChartLineMesaSinePoint,
  type ChartLineMesaSineSample,
  DEFAULT_CHART_LINE_MESA_SINE_PERIOD,
  MESA_SINE_LEAD,
  getLineMesaSineFinitePoints,
  normalizeLineMesaSinePeriod,
  computeLineMesaSineSma,
  computeLineMesaSinePair,
  computeLineMesaSine,
  classifyLineMesaSineZone,
  runLineMesaSine,
  computeLineMesaSineLayout,
  describeLineMesaSineChart,
} from './chart-line-mesa-sine';

/**
 * Eight bars chosen so the period-4 moving average is an exact integer:
 * SMA [-,-,-,20,28,32,32,28], cycle [-,-,-,12,12,0,-8,-12]. With a
 * quarter delay of one bar the phase lands on pi/4, pi/2 and pi.
 */
const CYCLE_DATA: ChartLineMesaSinePoint[] = [
  8, 16, 24, 32, 40, 32, 24, 16,
].map((value, i) => ({ x: i, value }));

const CYCLE_VALUES: number[] = CYCLE_DATA.map((p) => p.value);

/** Ten constant bars: no cycle, so the sine wave drops out entirely. */
const CONST_DATA: ChartLineMesaSinePoint[] = Array.from(
  { length: 10 },
  (_, i) => ({ x: i, value: 50 }),
);

const CONST_VALUES: number[] = CONST_DATA.map((p) => p.value);

/** Twenty-four varying bars for the structural and render checks. */
const WAVE_DATA: ChartLineMesaSinePoint[] = [
  50, 54, 57, 58, 57, 54, 50, 46, 43, 42, 43, 46, 50, 54, 57, 58, 57, 54,
  50, 46, 43, 42, 43, 46,
].map((value, i) => ({ x: i, value }));

const WAVE_VALUES: number[] = WAVE_DATA.map((p) => p.value);

const OPTS = { period: 4 };

describe('getLineMesaSineFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineMesaSineFinitePoints(null)).toEqual([]);
    expect(
      getLineMesaSineFinitePoints(
        undefined as unknown as ChartLineMesaSinePoint[],
      ),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineMesaSineFinitePoints([])).toEqual([]);
  });

  it('drops points with a non-finite x or value', () => {
    const dirty = [
      { x: 0, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 2, value: Number.POSITIVE_INFINITY },
      { x: 3, value: 30 },
    ] as ChartLineMesaSinePoint[];
    expect(getLineMesaSineFinitePoints(dirty)).toEqual([
      { x: 0, value: 10 },
      { x: 3, value: 30 },
    ]);
  });

  it('preserves the input order', () => {
    const out = getLineMesaSineFinitePoints([
      { x: 5, value: 1 },
      { x: 2, value: 2 },
      { x: 9, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineMesaSinePeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineMesaSinePeriod(20, 8)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineMesaSinePeriod(12.7, 20)).toBe(12);
  });

  it('falls back for a period below four', () => {
    expect(normalizeLineMesaSinePeriod(3, 20)).toBe(20);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineMesaSinePeriod(0, 20)).toBe(20);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineMesaSinePeriod(-8, 20)).toBe(20);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineMesaSinePeriod(Number.NaN, 20)).toBe(20);
  });
});

describe('computeLineMesaSineSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineMesaSineSma(null, 4)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineMesaSineSma(CYCLE_VALUES, 4)).toHaveLength(
      CYCLE_VALUES.length,
    );
  });

  it('leaves the warm-up window null', () => {
    const sma = computeLineMesaSineSma(CYCLE_VALUES, 4);
    expect(sma[0]).toBeNull();
    expect(sma[1]).toBeNull();
    expect(sma[2]).toBeNull();
  });

  it('averages the trailing window', () => {
    const sma = computeLineMesaSineSma([4, 8, 12, 16], 4);
    expect(sma[3]).toBe(10);
  });

  it('computes the exact integer moving average of the fixture', () => {
    expect(computeLineMesaSineSma(CYCLE_VALUES, 4)).toEqual([
      null,
      null,
      null,
      20,
      28,
      32,
      32,
      28,
    ]);
  });
});

describe('computeLineMesaSinePair', () => {
  it('takes the sine of the phase', () => {
    expect(computeLineMesaSinePair(1.2).sine).toBe(Math.sin(1.2));
  });

  it('takes the lead sine 45 degrees ahead of the phase', () => {
    expect(computeLineMesaSinePair(1.2).leadSine).toBe(
      Math.sin(1.2 + MESA_SINE_LEAD),
    );
  });

  it('gives a zero sine at phase zero', () => {
    expect(computeLineMesaSinePair(0).sine).toBe(0);
  });

  it('runs the lead sine exactly 45 degrees ahead of the sine', () => {
    const a = computeLineMesaSinePair(0.5);
    const b = computeLineMesaSinePair(0.5 + MESA_SINE_LEAD);
    expect(a.leadSine).toBe(b.sine);
  });

  it('keeps both lines within the unit band', () => {
    for (const phase of [0, 0.7, 1.9, 3.3, 5.1, -2.2]) {
      const pair = computeLineMesaSinePair(phase);
      expect(Math.abs(pair.sine as number)).toBeLessThanOrEqual(1);
      expect(Math.abs(pair.leadSine as number)).toBeLessThanOrEqual(1);
    }
  });

  it('yields a null pair for a non-finite phase', () => {
    expect(computeLineMesaSinePair(Number.NaN)).toEqual({
      sine: null,
      leadSine: null,
    });
  });
});

describe('computeLineMesaSine', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineMesaSine(null, 4)).toEqual({
      sma: [],
      cycle: [],
      phase: [],
      sine: [],
      leadSine: [],
    });
  });

  it('matches the input length on every array', () => {
    const out = computeLineMesaSine(WAVE_VALUES, 4);
    expect(out.sma).toHaveLength(WAVE_VALUES.length);
    expect(out.cycle).toHaveLength(WAVE_VALUES.length);
    expect(out.phase).toHaveLength(WAVE_VALUES.length);
    expect(out.sine).toHaveLength(WAVE_VALUES.length);
    expect(out.leadSine).toHaveLength(WAVE_VALUES.length);
  });

  it('detrends the price to the exact integer cycle', () => {
    expect(computeLineMesaSine(CYCLE_VALUES, 4).cycle).toEqual([
      null,
      null,
      null,
      12,
      12,
      0,
      -8,
      -12,
    ]);
  });

  it('lands the phase on the clean quadrature angles', () => {
    const out = computeLineMesaSine(CYCLE_VALUES, 4);
    expect(out.phase[4]).toBeCloseTo(Math.PI / 4);
    expect(out.phase[5]).toBeCloseTo(Math.PI / 2);
    expect(out.phase[6]).toBeCloseTo(Math.PI);
  });

  it('plots the sine of the cycle phase', () => {
    const out = computeLineMesaSine(CYCLE_VALUES, 4);
    expect(out.sine[4]).toBeCloseTo(Math.SQRT1_2);
    expect(out.sine[5]).toBeCloseTo(1);
  });

  it('plots the lead sine 45 degrees ahead', () => {
    const out = computeLineMesaSine(CYCLE_VALUES, 4);
    expect(out.leadSine[4]).toBeCloseTo(1);
    expect(out.leadSine[5]).toBeCloseTo(Math.SQRT1_2);
  });

  it('drops the sine wave entirely for a constant series', () => {
    const out = computeLineMesaSine(CONST_VALUES, 4);
    expect(out.sine.every((v) => v === null)).toBe(true);
    expect(out.leadSine.every((v) => v === null)).toBe(true);
  });

  it('keeps the sine within the unit band where defined', () => {
    const out = computeLineMesaSine(WAVE_VALUES, 4);
    for (const v of out.sine) {
      if (v !== null) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the lead sine within the unit band where defined', () => {
    const out = computeLineMesaSine(WAVE_VALUES, 4);
    for (const v of out.leadSine) {
      if (v !== null) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it('produces at least one finite sine reading for a cyclic series', () => {
    const out = computeLineMesaSine(WAVE_VALUES, 4);
    expect(out.sine.some((v) => v !== null)).toBe(true);
  });
});

describe('classifyLineMesaSineZone', () => {
  it('classifies a lead sine above the sine as up', () => {
    expect(classifyLineMesaSineZone(0.2, 0.6)).toBe('up');
  });

  it('classifies a lead sine below the sine as down', () => {
    expect(classifyLineMesaSineZone(0.6, 0.2)).toBe('down');
  });

  it('classifies equal lines as flat', () => {
    expect(classifyLineMesaSineZone(0.5, 0.5)).toBe('flat');
  });

  it('classifies a null sine as none', () => {
    expect(classifyLineMesaSineZone(null, 0.5)).toBe('none');
  });

  it('classifies a non-finite lead sine as none', () => {
    expect(classifyLineMesaSineZone(0.5, Number.NaN)).toBe('none');
  });
});

describe('runLineMesaSine', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineMesaSine([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineMesaSine([]).ok).toBe(false);
    expect(runLineMesaSine(null).ok).toBe(false);
  });

  it('is ok for a series of at least two points', () => {
    expect(runLineMesaSine(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period when none is given', () => {
    expect(runLineMesaSine(WAVE_DATA).period).toBe(
      DEFAULT_CHART_LINE_MESA_SINE_PERIOD,
    );
  });

  it('honours a custom period', () => {
    expect(runLineMesaSine(WAVE_DATA, { period: 8 }).period).toBe(8);
  });

  it('classifies the fixture zones', () => {
    const run = runLineMesaSine(CYCLE_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual([
      'none',
      'none',
      'none',
      'none',
      'up',
      'down',
      'down',
      'down',
    ]);
  });

  it('counts the fixture zones', () => {
    const run = runLineMesaSine(CYCLE_DATA, OPTS);
    expect(run.upCount).toBe(1);
    expect(run.downCount).toBe(3);
  });

  it('leaves every zone none for a constant series', () => {
    const run = runLineMesaSine(CONST_DATA, OPTS);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineMesaSine(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.zone);
    }
  });

  it('emits one sample per point', () => {
    const run = runLineMesaSine(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('carries the sma, cycle, phase, sine and lead sine arrays', () => {
    const run = runLineMesaSine(WAVE_DATA, OPTS);
    expect(run.sma).toHaveLength(WAVE_DATA.length);
    expect(run.cycle).toHaveLength(WAVE_DATA.length);
    expect(run.phase).toHaveLength(WAVE_DATA.length);
    expect(run.sine).toHaveLength(WAVE_DATA.length);
    expect(run.leadSine).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineMesaSine(
      [
        { x: 3, value: 30 },
        { x: 1, value: 10 },
        { x: 2, value: 20 },
      ],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final sine and lead sine readings', () => {
    const run = runLineMesaSine(WAVE_DATA, OPTS);
    const lastSine = [...run.sine].reverse().find((v) => v !== null) ?? null;
    expect(run.sineFinal).toBe(lastSine);
  });
});

describe('computeLineMesaSineLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineMesaSineLayout({
      data: [{ x: 0, value: 1 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineMesaSineLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineMesaSineLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the sine panel', () => {
    const layout = computeLineMesaSineLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.sinePanelTop);
  });

  it('builds a price path, a sine path and a lead sine path', () => {
    const layout = computeLineMesaSineLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.sinePath.length).toBeGreaterThan(0);
    expect(layout.leadSinePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineMesaSineLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite sine bar', () => {
    const layout = computeLineMesaSineLayout({ data: WAVE_DATA, ...OPTS });
    const finiteSine = layout.run.sine.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(finiteSine);
  });

  it('fixes the sine panel band to the unit range with headroom', () => {
    const layout = computeLineMesaSineLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.sineMin).toBe(-1.1);
    expect(layout.sineMax).toBe(1.1);
  });

  it('places the zero line inside the sine panel', () => {
    const layout = computeLineMesaSineLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.sinePanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.sinePanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineMesaSineLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineMesaSineChart', () => {
  it('names the Ehlers MESA Sine Wave', () => {
    expect(describeLineMesaSineChart(WAVE_DATA, OPTS)).toContain(
      'Ehlers MESA Sine Wave',
    );
  });

  it('mentions the cycle phase', () => {
    expect(describeLineMesaSineChart(WAVE_DATA, OPTS)).toContain(
      'cycle phase',
    );
  });

  it('mentions the lead sine', () => {
    expect(describeLineMesaSineChart(WAVE_DATA, OPTS)).toContain('lead sine');
  });

  it('reports the zone counts', () => {
    const run = runLineMesaSine(WAVE_DATA, OPTS);
    const text = describeLineMesaSineChart(WAVE_DATA, OPTS);
    expect(text).toContain(`leads the sine on ${run.upCount}`);
    expect(text).toContain(`lags on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineMesaSineChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineMesaSine />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain('MESA Sine Wave');
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-mesa-sine-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ehlers MESA Sine Wave');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(<ChartLineMesaSine data={[]} {...OPTS} />);
    const empty = container.querySelector(
      '[data-section="chart-line-mesa-sine-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and point count on the root', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mesa-sine"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-mesa-sine-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price, sine and lead sine lines', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mesa-sine-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mesa-sine-sine-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mesa-sine-lead-sine-line"]',
      ),
    ).not.toBeNull();
  });

  it('draws the zero line', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mesa-sine-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one marker per finite sine bar', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    const run = runLineMesaSine(WAVE_DATA, OPTS);
    const finiteSine = run.sine.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-mesa-sine-marker"]',
    );
    expect(markers).toHaveLength(finiteSine);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-mesa-sine-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-mesa-sine-panel-label"]',
    );
    const texts = Array.from(labels).map((n) => n.textContent);
    expect(texts).toContain('Price');
    expect(texts).toContain('Ehlers MESA Sine Wave');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-mesa-sine-badge-config"]',
    );
    expect(badge?.textContent).toBe('MESA 4');
  });

  it('hides the sine line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} hiddenSeries={['sine']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mesa-sine-sine-line"]',
      ),
    ).toBeNull();
  });

  it('hides the lead sine line when showLeadSine is false', () => {
    const { container } = render(
      <ChartLineMesaSine data={WAVE_DATA} {...OPTS} showLeadSine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mesa-sine-lead-sine-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineMesaSine
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-mesa-sine-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineMesaSineSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMesaSine ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-mesa-sine',
    );
  });
});
