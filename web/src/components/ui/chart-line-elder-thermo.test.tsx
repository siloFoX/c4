import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineElderThermo,
  type ChartLineElderThermoPoint,
  type ChartLineElderThermoSample,
  DEFAULT_CHART_LINE_ELDER_THERMO_PERIOD,
  DEFAULT_CHART_LINE_ELDER_THERMO_HOT_FACTOR,
  getLineElderThermoFinitePoints,
  normalizeLineElderThermoPeriod,
  normalizeLineElderThermoHotFactor,
  computeLineElderThermometer,
  computeLineElderThermoEma,
  classifyLineElderThermoZone,
  computeLineElderThermo,
  runLineElderThermo,
  computeLineElderThermoLayout,
  describeLineElderThermoChart,
} from './chart-line-elder-thermo';

const bar = (x: number, high: number, low: number): ChartLineElderThermoPoint => ({
  x,
  high,
  low,
});

/** Eight constant bars: no excursion, so the thermometer reads cold. */
const FLAT_DATA: ChartLineElderThermoPoint[] = Array.from({ length: 8 }, (_, i) =>
  bar(i, 60, 40),
);

/** Both bands ramp by a fixed step, so the thermometer is a constant 4. */
const RAMP_HIGH = [10, 14, 18, 22, 26, 30, 34, 38];
const RAMP_LOW = [5, 8, 11, 14, 17, 20, 23, 26];
const RAMP_DATA: ChartLineElderThermoPoint[] = RAMP_HIGH.map((h, i) =>
  bar(i, h, RAMP_LOW[i]!),
);

/** Eight varying bars with an exact integer thermometer [-,4,5,9,7,8,7,8]. */
const THERMO_HIGH = [20, 24, 19, 28, 22, 30, 25, 33];
const THERMO_LOW = [10, 14, 12, 8, 15, 11, 18, 14];
const THERMO_DATA: ChartLineElderThermoPoint[] = THERMO_HIGH.map((h, i) =>
  bar(i, h, THERMO_LOW[i]!),
);

/** Twenty-four varying bars for the structural and render checks. */
const WAVE_HIGH = [
  60, 63, 67, 65, 62, 58, 55, 59, 64, 68, 66, 61, 57, 54, 58, 63, 67, 70, 66,
  62, 58, 61, 65, 69,
];
const WAVE_LOW = [
  40, 42, 45, 44, 41, 38, 36, 39, 43, 46, 45, 41, 38, 35, 38, 42, 45, 47, 44,
  41, 38, 40, 43, 46,
];
const WAVE_DATA: ChartLineElderThermoPoint[] = WAVE_HIGH.map((h, i) =>
  bar(i, h, WAVE_LOW[i]!),
);

const OPTS = { period: 3, hotFactor: 2 };

describe('getLineElderThermoFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineElderThermoFinitePoints(null)).toEqual([]);
    expect(
      getLineElderThermoFinitePoints(
        undefined as unknown as ChartLineElderThermoPoint[],
      ),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineElderThermoFinitePoints([])).toEqual([]);
  });

  it('drops bars with a non-finite x, high or low', () => {
    const dirty = [
      bar(0, 60, 40),
      { x: Number.NaN, high: 60, low: 40 },
      { x: 2, high: Number.POSITIVE_INFINITY, low: 40 },
      { x: 3, high: 60, low: Number.NaN },
      bar(4, 62, 42),
    ] as ChartLineElderThermoPoint[];
    expect(getLineElderThermoFinitePoints(dirty)).toEqual([
      bar(0, 60, 40),
      bar(4, 62, 42),
    ]);
  });

  it('preserves the input order', () => {
    const out = getLineElderThermoFinitePoints([
      bar(5, 60, 40),
      bar(2, 61, 41),
      bar(9, 62, 42),
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineElderThermoPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineElderThermoPeriod(22, 3)).toBe(22);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineElderThermoPeriod(8.7, 3)).toBe(8);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineElderThermoPeriod(0, 3)).toBe(3);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineElderThermoPeriod(-5, 3)).toBe(3);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineElderThermoPeriod(Number.NaN, 3)).toBe(3);
  });
});

describe('normalizeLineElderThermoHotFactor', () => {
  it('keeps a hot factor above one', () => {
    expect(normalizeLineElderThermoHotFactor(2.5, 2)).toBe(2.5);
  });

  it('falls back for a factor of exactly one', () => {
    expect(normalizeLineElderThermoHotFactor(1, 2)).toBe(2);
  });

  it('falls back for a factor below one', () => {
    expect(normalizeLineElderThermoHotFactor(0.5, 2)).toBe(2);
  });

  it('falls back for a negative factor', () => {
    expect(normalizeLineElderThermoHotFactor(-3, 2)).toBe(2);
  });

  it('falls back for a non-finite factor', () => {
    expect(normalizeLineElderThermoHotFactor(Number.NaN, 2)).toBe(2);
  });
});

describe('computeLineElderThermometer', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineElderThermometer(null)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineElderThermometer(THERMO_DATA)).toHaveLength(
      THERMO_DATA.length,
    );
  });

  it('leaves the first bar null', () => {
    expect(computeLineElderThermometer(THERMO_DATA)[0]).toBeNull();
  });

  it('takes the larger of the high and low excursions', () => {
    const out = computeLineElderThermometer([
      bar(0, 50, 40),
      bar(1, 51, 30),
    ]);
    expect(out[1]).toBe(10);
  });

  it('computes the exact integer thermometer of the fixture', () => {
    expect(computeLineElderThermometer(THERMO_DATA)).toEqual([
      null,
      4,
      5,
      9,
      7,
      8,
      7,
      8,
    ]);
  });

  it('reads zero for a flat market', () => {
    expect(computeLineElderThermometer(FLAT_DATA)).toEqual([
      null,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });
});

describe('computeLineElderThermoEma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineElderThermoEma(null, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineElderThermoEma([4, 8, 16], 3)).toHaveLength(3);
  });

  it('computes the exact dyadic average for a period-3 alpha', () => {
    expect(computeLineElderThermoEma([4, 8, 16], 3)).toEqual([4, 6, 11]);
  });

  it('passes a leading null through and seeds from the first finite value', () => {
    expect(computeLineElderThermoEma([null, 4, 8, 16], 3)).toEqual([
      null,
      4,
      6,
      11,
    ]);
  });

  it('holds a constant series at its constant level', () => {
    expect(computeLineElderThermoEma([7, 7, 7, 7], 3)).toEqual([7, 7, 7, 7]);
  });
});

describe('classifyLineElderThermoZone', () => {
  it('classifies a thermometer below its average as calm', () => {
    expect(classifyLineElderThermoZone(2, 5, 2)).toBe('calm');
  });

  it('classifies a zero thermometer as calm', () => {
    expect(classifyLineElderThermoZone(0, 5, 2)).toBe('calm');
  });

  it('classifies a thermometer above its average as warm', () => {
    expect(classifyLineElderThermoZone(6, 5, 2)).toBe('warm');
  });

  it('classifies a thermometer past the hot multiple as hot', () => {
    expect(classifyLineElderThermoZone(12, 5, 2)).toBe('hot');
  });

  it('classifies a null thermometer as none', () => {
    expect(classifyLineElderThermoZone(null, 5, 2)).toBe('none');
  });

  it('classifies a non-finite average as none', () => {
    expect(classifyLineElderThermoZone(5, Number.NaN, 2)).toBe('none');
  });
});

describe('computeLineElderThermo', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineElderThermo(null, OPTS)).toEqual({
      thermometer: [],
      thermoMa: [],
    });
  });

  it('matches the input length on both arrays', () => {
    const out = computeLineElderThermo(WAVE_DATA, OPTS);
    expect(out.thermometer).toHaveLength(WAVE_DATA.length);
    expect(out.thermoMa).toHaveLength(WAVE_DATA.length);
  });

  it('computes the exact integer thermometer of the fixture', () => {
    expect(computeLineElderThermo(THERMO_DATA, OPTS).thermometer).toEqual([
      null,
      4,
      5,
      9,
      7,
      8,
      7,
      8,
    ]);
  });

  it('computes the exact dyadic moving average of the fixture', () => {
    expect(computeLineElderThermo(THERMO_DATA, OPTS).thermoMa).toEqual([
      null,
      4,
      4.5,
      6.75,
      6.875,
      7.4375,
      7.21875,
      7.609375,
    ]);
  });

  it('reads zero across a flat market', () => {
    const out = computeLineElderThermo(FLAT_DATA, OPTS);
    expect(out.thermometer.every((v) => v === null || v === 0)).toBe(true);
    expect(out.thermoMa.every((v) => v === null || v === 0)).toBe(true);
  });

  it('holds the thermometer constant for a steady ramp', () => {
    expect(computeLineElderThermo(RAMP_DATA, OPTS).thermometer).toEqual([
      null,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
    ]);
  });

  it('holds the moving average constant for a steady ramp', () => {
    expect(computeLineElderThermo(RAMP_DATA, OPTS).thermoMa).toEqual([
      null,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
    ]);
  });
});

describe('runLineElderThermo', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(runLineElderThermo([bar(0, 60, 40)]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineElderThermo([]).ok).toBe(false);
    expect(runLineElderThermo(null).ok).toBe(false);
  });

  it('is ok for a series of at least two bars', () => {
    expect(runLineElderThermo(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period and hot factor when none are given', () => {
    const run = runLineElderThermo(WAVE_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_ELDER_THERMO_PERIOD);
    expect(run.hotFactor).toBe(DEFAULT_CHART_LINE_ELDER_THERMO_HOT_FACTOR);
  });

  it('honours a custom period and hot factor', () => {
    const run = runLineElderThermo(WAVE_DATA, { period: 9, hotFactor: 3 });
    expect(run.period).toBe(9);
    expect(run.hotFactor).toBe(3);
  });

  it('reads a flat market wholly calm', () => {
    const run = runLineElderThermo(FLAT_DATA, OPTS);
    expect(run.calmCount).toBe(7);
    expect(run.warmCount).toBe(0);
    expect(run.hotCount).toBe(0);
  });

  it('reads a steady ramp wholly warm', () => {
    const run = runLineElderThermo(RAMP_DATA, OPTS);
    expect(run.warmCount).toBe(7);
    expect(run.calmCount).toBe(0);
    expect(run.hotCount).toBe(0);
  });

  it('classifies the fixture zones', () => {
    const run = runLineElderThermo(THERMO_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual([
      'none',
      'warm',
      'warm',
      'warm',
      'warm',
      'warm',
      'calm',
      'warm',
    ]);
  });

  it('carries the bar midpoint on each sample', () => {
    const run = runLineElderThermo(THERMO_DATA, OPTS);
    expect(run.samples[0]!.midpoint).toBe(15);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineElderThermo(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['calm', 'warm', 'hot', 'none']).toContain(sample.zone);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineElderThermo(WAVE_DATA, OPTS);
    const noneCount = run.samples.filter((s) => s.zone === 'none').length;
    expect(
      run.calmCount + run.warmCount + run.hotCount + noneCount,
    ).toBe(run.series.length);
  });

  it('emits one sample per bar', () => {
    const run = runLineElderThermo(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineElderThermo(
      [bar(3, 63, 43), bar(1, 61, 41), bar(2, 62, 42)],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final thermometer reading', () => {
    const run = runLineElderThermo(THERMO_DATA, OPTS);
    expect(run.thermoFinal).toBe(8);
  });
});

describe('computeLineElderThermoLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineElderThermoLayout({
      data: [bar(0, 60, 40)],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineElderThermoLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineElderThermoLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the thermometer panel', () => {
    const layout = computeLineElderThermoLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(
      layout.thermoPanelTop,
    );
  });

  it('builds a price path, a thermometer path and a moving-average path', () => {
    const layout = computeLineElderThermoLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.thermoPath.length).toBeGreaterThan(0);
    expect(layout.thermoMaPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineElderThermoLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite thermometer bar', () => {
    const layout = computeLineElderThermoLayout({ data: WAVE_DATA, ...OPTS });
    const finiteThermo = layout.run.thermometer.filter(
      (v) => v !== null,
    ).length;
    expect(layout.markers).toHaveLength(finiteThermo);
  });

  it('anchors the thermometer panel floor at zero', () => {
    const layout = computeLineElderThermoLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.thermoMin).toBe(0);
    expect(layout.thermoMax).toBeGreaterThan(0);
  });

  it('carries the run', () => {
    const layout = computeLineElderThermoLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineElderThermoChart', () => {
  it('names the Elder Market Thermometer', () => {
    expect(describeLineElderThermoChart(WAVE_DATA, OPTS)).toContain(
      'Elder Market Thermometer',
    );
  });

  it('mentions the larger of the excursions', () => {
    expect(describeLineElderThermoChart(WAVE_DATA, OPTS)).toContain(
      'larger of',
    );
  });

  it('mentions the moving average', () => {
    expect(describeLineElderThermoChart(WAVE_DATA, OPTS)).toContain(
      'moving average',
    );
  });

  it('reports the zone counts', () => {
    const run = runLineElderThermo(WAVE_DATA, OPTS);
    const text = describeLineElderThermoChart(WAVE_DATA, OPTS);
    expect(text).toContain(`calm on ${run.calmCount}`);
    expect(text).toContain(`hot on ${run.hotCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineElderThermoChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineElderThermo />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain(
      'Elder Market Thermometer',
    );
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-elder-thermo-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Elder Market Thermometer');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(
      <ChartLineElderThermo data={[]} {...OPTS} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-elder-thermo-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and bar count on the root', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-thermo"]',
    );
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-elder-thermo-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price, thermometer and moving-average lines', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermo-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermo-thermo-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermo-thermo-ma-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one marker per finite thermometer bar', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} />,
    );
    const run = runLineElderThermo(WAVE_DATA, OPTS);
    const finiteThermo = run.thermometer.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-elder-thermo-marker"]',
    );
    expect(markers).toHaveLength(finiteThermo);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-elder-thermo-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['calm', 'warm', 'hot', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-elder-thermo-panel-label"]',
    );
    const texts = Array.from(labels).map((n) => n.textContent);
    expect(texts).toContain('Midpoint');
    expect(texts).toContain('Elder Thermometer');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-elder-thermo-badge-config"]',
    );
    expect(badge?.textContent).toBe('THERMO 3');
  });

  it('hides the thermometer line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineElderThermo
        data={WAVE_DATA}
        {...OPTS}
        hiddenSeries={['thermo']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermo-thermo-line"]',
      ),
    ).toBeNull();
  });

  it('hides the moving-average line when showThermoMa is false', () => {
    const { container } = render(
      <ChartLineElderThermo data={WAVE_DATA} {...OPTS} showThermoMa={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermo-thermo-ma-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineElderThermo
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-thermo-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineElderThermoSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineElderThermo ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-elder-thermo',
    );
  });
});
