import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineStiffness,
  type ChartLineStiffnessPoint,
  type ChartLineStiffnessSample,
  DEFAULT_CHART_LINE_STIFFNESS_PERIOD,
  DEFAULT_CHART_LINE_STIFFNESS_FACTOR,
  getLineStiffnessFinitePoints,
  normalizeLineStiffnessPeriod,
  normalizeLineStiffnessFactor,
  normalizeLineStiffnessThreshold,
  computeLineStiffnessSma,
  computeLineStiffnessStdev,
  classifyLineStiffnessZone,
  computeLineStiffness,
  runLineStiffness,
  computeLineStiffnessLayout,
  describeLineStiffnessChart,
} from './chart-line-stiffness';

const at = (x: number, value: number): ChartLineStiffnessPoint => ({ x, value });

/** Ten bars with a strictly rising close: every bar reads above the band. */
const UP_DATA: ChartLineStiffnessPoint[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
  (v, i) => at(i, v),
);

/** Ten bars with a strictly falling close: every bar reads below the band. */
const DOWN_DATA: ChartLineStiffnessPoint[] = [
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
].map((v, i) => at(i, v));

/** Ten constant bars: zero stdev collapses the band to the SMA. */
const CONST_DATA: ChartLineStiffnessPoint[] = Array.from(
  { length: 10 },
  (_, i) => at(i, 50),
);

/** Twenty-four varying bars for the structural and render checks. */
const WAVE_VALUES = [
  50, 53, 57, 60, 58, 54, 49, 46, 48, 52, 57, 60, 58, 53, 49, 47, 50, 54, 58,
  61, 59, 55, 51, 48,
];
const WAVE_DATA: ChartLineStiffnessPoint[] = WAVE_VALUES.map((v, i) =>
  at(i, v),
);

const OPTS = {
  period: 3,
  factor: 0.2,
  smoothPeriod: 3,
  highThreshold: 90,
  lowThreshold: 50,
};

describe('getLineStiffnessFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineStiffnessFinitePoints(null)).toEqual([]);
    expect(
      getLineStiffnessFinitePoints(
        undefined as unknown as ChartLineStiffnessPoint[],
      ),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineStiffnessFinitePoints([])).toEqual([]);
  });

  it('drops points with a non-finite x or value', () => {
    const dirty = [
      at(0, 50),
      { x: Number.NaN, value: 51 },
      { x: 2, value: Number.POSITIVE_INFINITY },
      at(3, 52),
    ] as ChartLineStiffnessPoint[];
    expect(getLineStiffnessFinitePoints(dirty)).toEqual([at(0, 50), at(3, 52)]);
  });

  it('preserves the input order', () => {
    const out = getLineStiffnessFinitePoints([
      at(5, 1),
      at(2, 2),
      at(9, 3),
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineStiffnessPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineStiffnessPeriod(100, 3)).toBe(100);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineStiffnessPeriod(12.7, 3)).toBe(12);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineStiffnessPeriod(0, 3)).toBe(3);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineStiffnessPeriod(-5, 3)).toBe(3);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineStiffnessPeriod(Number.NaN, 3)).toBe(3);
  });
});

describe('normalizeLineStiffnessFactor', () => {
  it('keeps a positive factor', () => {
    expect(normalizeLineStiffnessFactor(0.2, 0.5)).toBe(0.2);
  });

  it('falls back for a zero factor', () => {
    expect(normalizeLineStiffnessFactor(0, 0.2)).toBe(0.2);
  });

  it('falls back for a negative factor', () => {
    expect(normalizeLineStiffnessFactor(-1, 0.2)).toBe(0.2);
  });

  it('falls back for a non-finite factor', () => {
    expect(normalizeLineStiffnessFactor(Number.NaN, 0.2)).toBe(0.2);
  });
});

describe('normalizeLineStiffnessThreshold', () => {
  it('keeps a threshold inside 0..100', () => {
    expect(normalizeLineStiffnessThreshold(70, 50)).toBe(70);
  });

  it('keeps the zero boundary', () => {
    expect(normalizeLineStiffnessThreshold(0, 50)).toBe(0);
  });

  it('falls back for a negative threshold', () => {
    expect(normalizeLineStiffnessThreshold(-10, 50)).toBe(50);
  });

  it('falls back for a threshold above 100', () => {
    expect(normalizeLineStiffnessThreshold(120, 50)).toBe(50);
  });

  it('falls back for a non-finite threshold', () => {
    expect(normalizeLineStiffnessThreshold(Number.NaN, 50)).toBe(50);
  });
});

describe('computeLineStiffnessSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineStiffnessSma(null, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineStiffnessSma(WAVE_VALUES, 3)).toHaveLength(
      WAVE_VALUES.length,
    );
  });

  it('leaves the warm-up window null', () => {
    const sma = computeLineStiffnessSma(WAVE_VALUES, 3);
    expect(sma[0]).toBeNull();
    expect(sma[1]).toBeNull();
  });

  it('averages the trailing window', () => {
    expect(computeLineStiffnessSma([4, 8, 12, 16], 3)[3]).toBe(12);
  });
});

describe('computeLineStiffnessStdev', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineStiffnessStdev(null, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineStiffnessStdev(WAVE_VALUES, 3)).toHaveLength(
      WAVE_VALUES.length,
    );
  });

  it('leaves the warm-up window null', () => {
    expect(computeLineStiffnessStdev(WAVE_VALUES, 3)[1]).toBeNull();
  });

  it('reads zero for a constant window', () => {
    expect(computeLineStiffnessStdev([7, 7, 7, 7], 3)[3]).toBe(0);
  });

  it('takes the population standard deviation', () => {
    expect(computeLineStiffnessStdev([1, 2, 3], 3)[2]).toBeCloseTo(
      Math.sqrt(2 / 3),
    );
  });
});

describe('classifyLineStiffnessZone', () => {
  it('classifies a value past the high threshold as stiff', () => {
    expect(classifyLineStiffnessZone(95, 90, 50)).toBe('stiff');
  });

  it('classifies a value at the high threshold as stiff', () => {
    expect(classifyLineStiffnessZone(90, 90, 50)).toBe('stiff');
  });

  it('classifies a value between the thresholds as mid', () => {
    expect(classifyLineStiffnessZone(70, 90, 50)).toBe('mid');
  });

  it('classifies a value below the low threshold as loose', () => {
    expect(classifyLineStiffnessZone(30, 90, 50)).toBe('loose');
  });

  it('classifies a null reading as none', () => {
    expect(classifyLineStiffnessZone(null, 90, 50)).toBe('none');
  });

  it('classifies a non-finite reading as none', () => {
    expect(classifyLineStiffnessZone(Number.NaN, 90, 50)).toBe('none');
  });
});

describe('computeLineStiffness', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineStiffness(null, OPTS)).toEqual({
      sma: [],
      stdev: [],
      lowerBand: [],
      aboveFlag: [],
      rawStiffness: [],
      stiffness: [],
    });
  });

  it('matches the input length on every array', () => {
    const out = computeLineStiffness(
      WAVE_DATA.map((p) => p.value),
      OPTS,
    );
    expect(out.sma).toHaveLength(WAVE_VALUES.length);
    expect(out.stdev).toHaveLength(WAVE_VALUES.length);
    expect(out.lowerBand).toHaveLength(WAVE_VALUES.length);
    expect(out.aboveFlag).toHaveLength(WAVE_VALUES.length);
    expect(out.rawStiffness).toHaveLength(WAVE_VALUES.length);
    expect(out.stiffness).toHaveLength(WAVE_VALUES.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineStiffness(
      UP_DATA.map((p) => p.value),
      OPTS,
    );
    for (let i = 0; i < 4; i += 1) {
      expect(out.stiffness[i]).toBeNull();
    }
  });

  it('pins to 100 on a strictly rising close', () => {
    expect(
      computeLineStiffness(
        UP_DATA.map((p) => p.value),
        OPTS,
      ).stiffness,
    ).toEqual([null, null, null, null, 100, 100, 100, 100, 100, 100]);
  });

  it('pins to zero on a strictly falling close', () => {
    expect(
      computeLineStiffness(
        DOWN_DATA.map((p) => p.value),
        OPTS,
      ).stiffness,
    ).toEqual([null, null, null, null, 0, 0, 0, 0, 0, 0]);
  });

  it('pins to zero on a constant close', () => {
    expect(
      computeLineStiffness(
        CONST_DATA.map((p) => p.value),
        OPTS,
      ).stiffness,
    ).toEqual([null, null, null, null, 0, 0, 0, 0, 0, 0]);
  });

  it('flags every bar above the band on a rising close', () => {
    const out = computeLineStiffness(
      UP_DATA.map((p) => p.value),
      OPTS,
    );
    for (let i = 2; i < out.aboveFlag.length; i += 1) {
      expect(out.aboveFlag[i]).toBe(1);
    }
  });

  it('flags every bar below the band on a falling close', () => {
    const out = computeLineStiffness(
      DOWN_DATA.map((p) => p.value),
      OPTS,
    );
    for (let i = 2; i < out.aboveFlag.length; i += 1) {
      expect(out.aboveFlag[i]).toBe(0);
    }
  });

  it('keeps every defined reading inside 0..100', () => {
    const out = computeLineStiffness(
      WAVE_DATA.map((p) => p.value),
      OPTS,
    );
    for (const v of out.stiffness) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('runLineStiffness', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineStiffness([at(0, 1)]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineStiffness([]).ok).toBe(false);
    expect(runLineStiffness(null).ok).toBe(false);
  });

  it('is ok for a series of at least two points', () => {
    expect(runLineStiffness(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period and factor when none are given', () => {
    const run = runLineStiffness(WAVE_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_STIFFNESS_PERIOD);
    expect(run.factor).toBe(DEFAULT_CHART_LINE_STIFFNESS_FACTOR);
  });

  it('honours a custom period and factor', () => {
    const run = runLineStiffness(WAVE_DATA, {
      period: 5,
      factor: 0.4,
      smoothPeriod: 1,
    });
    expect(run.period).toBe(5);
    expect(run.factor).toBe(0.4);
    expect(run.smoothPeriod).toBe(1);
  });

  it('counts a rising-close series wholly stiff', () => {
    const run = runLineStiffness(UP_DATA, OPTS);
    expect(run.stiffCount).toBe(6);
    expect(run.midCount).toBe(0);
    expect(run.looseCount).toBe(0);
  });

  it('counts a falling-close series wholly loose', () => {
    const run = runLineStiffness(DOWN_DATA, OPTS);
    expect(run.looseCount).toBe(6);
    expect(run.stiffCount).toBe(0);
    expect(run.midCount).toBe(0);
  });

  it('counts a constant-close series wholly loose', () => {
    const run = runLineStiffness(CONST_DATA, OPTS);
    expect(run.looseCount).toBe(6);
    expect(run.stiffCount).toBe(0);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineStiffness(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['stiff', 'mid', 'loose', 'none']).toContain(sample.zone);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineStiffness(WAVE_DATA, OPTS);
    const noneCount = run.samples.filter((s) => s.zone === 'none').length;
    expect(
      run.stiffCount + run.midCount + run.looseCount + noneCount,
    ).toBe(run.series.length);
  });

  it('carries the sma and lower band on each sample', () => {
    const run = runLineStiffness(UP_DATA, OPTS);
    expect(run.samples[4]!.sma).toBe(4);
    expect(run.samples[4]!.lowerBand).toBeCloseTo(4 - 0.2 * Math.sqrt(2 / 3));
  });

  it('emits one sample per point', () => {
    const run = runLineStiffness(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineStiffness(
      [at(3, 3), at(1, 1), at(2, 2)],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final stiffness reading', () => {
    const run = runLineStiffness(UP_DATA, OPTS);
    expect(run.stiffnessFinal).toBe(100);
  });
});

describe('computeLineStiffnessLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineStiffnessLayout({
      data: [at(0, 1)],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineStiffnessLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineStiffnessLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the stiffness panel', () => {
    const layout = computeLineStiffnessLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.stiffPanelTop);
  });

  it('builds a price path and a stiffness path', () => {
    const layout = computeLineStiffnessLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.stiffnessPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineStiffnessLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite stiffness bar', () => {
    const layout = computeLineStiffnessLayout({ data: WAVE_DATA, ...OPTS });
    const finite = layout.run.stiffness.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(finite);
  });

  it('fixes the stiffness panel band past 0..100', () => {
    const layout = computeLineStiffnessLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.stiffMin).toBe(-5);
    expect(layout.stiffMax).toBe(105);
  });

  it('places the threshold lines inside the stiffness panel', () => {
    const layout = computeLineStiffnessLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.midY).toBeGreaterThanOrEqual(layout.stiffPanelTop);
    expect(layout.midY).toBeLessThanOrEqual(layout.stiffPanelBottom);
    expect(layout.highY).toBeGreaterThanOrEqual(layout.stiffPanelTop);
    expect(layout.highY).toBeLessThanOrEqual(layout.stiffPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineStiffnessLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineStiffnessChart', () => {
  it('names the Katsanos Stiffness indicator', () => {
    expect(describeLineStiffnessChart(WAVE_DATA, OPTS)).toContain(
      'Katsanos Stiffness',
    );
  });

  it('mentions the lower volatility band', () => {
    expect(describeLineStiffnessChart(WAVE_DATA, OPTS)).toContain(
      'lower volatility band',
    );
  });

  it('mentions counting bars above the band', () => {
    const text = describeLineStiffnessChart(WAVE_DATA, OPTS);
    expect(text).toContain('counts the bars');
    expect(text).toContain('above');
  });

  it('reports the zone counts', () => {
    const run = runLineStiffness(WAVE_DATA, OPTS);
    const text = describeLineStiffnessChart(WAVE_DATA, OPTS);
    expect(text).toContain(`stiff on ${run.stiffCount}`);
    expect(text).toContain(`loose on ${run.looseCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineStiffnessChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineStiffness />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineStiffness data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain(
      'Katsanos Stiffness',
    );
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineStiffness data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stiffness-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Katsanos Stiffness');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(
      <ChartLineStiffness data={[]} {...OPTS} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-stiffness-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and bar count on the root', () => {
    const { container } = render(
      <ChartLineStiffness data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stiffness"]',
    );
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineStiffness data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-stiffness-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price and stiffness lines', () => {
    const { container } = render(
      <ChartLineStiffness data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-stiffness-line"]',
      ),
    ).not.toBeNull();
  });

  it('draws the two threshold lines', () => {
    const { container } = render(
      <ChartLineStiffness data={WAVE_DATA} {...OPTS} />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-line-stiffness-threshold"]',
    );
    expect(lines).toHaveLength(2);
  });

  it('renders one marker per finite stiffness bar', () => {
    const { container } = render(
      <ChartLineStiffness data={WAVE_DATA} {...OPTS} />,
    );
    const run = runLineStiffness(WAVE_DATA, OPTS);
    const finite = run.stiffness.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stiffness-marker"]',
    );
    expect(markers).toHaveLength(finite);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineStiffness data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stiffness-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['stiff', 'mid', 'loose', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineStiffness data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-stiffness-badge-config"]',
    );
    expect(badge?.textContent).toBe('STIFF 3/0.2');
  });

  it('hides the stiffness line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineStiffness
        data={WAVE_DATA}
        {...OPTS}
        hiddenSeries={['stiffness']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-stiffness-line"]',
      ),
    ).toBeNull();
  });

  it('hides the threshold lines when showThresholds is false', () => {
    const { container } = render(
      <ChartLineStiffness
        data={WAVE_DATA}
        {...OPTS}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-threshold"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineStiffness
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stiffness-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineStiffnessSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStiffness ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stiffness',
    );
  });
});
