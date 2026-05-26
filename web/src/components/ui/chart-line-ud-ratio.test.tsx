import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineUdRatio,
  type ChartLineUdRatioPoint,
  type ChartLineUdRatioSample,
  DEFAULT_CHART_LINE_UD_RATIO_PERIOD,
  CHART_LINE_UD_RATIO_MIDLINE,
  getLineUdRatioFinitePoints,
  normalizeLineUdRatioPeriod,
  computeLineUdRatio,
  classifyLineUdRatioZone,
  runLineUdRatio,
  computeLineUdRatioLayout,
  describeLineUdRatioChart,
} from './chart-line-ud-ratio';

const at = (x: number, value: number): ChartLineUdRatioPoint => ({ x, value });

/** Ten bars with a strictly rising close: every change is an up gain. */
const UP_RAMP_DATA: ChartLineUdRatioPoint[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
].map((v, i) => at(i, v));

/** Ten bars with a strictly falling close: every change is a down loss. */
const DOWN_RAMP_DATA: ChartLineUdRatioPoint[] = [
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
].map((v, i) => at(i, v));

/** Ten constant bars: zero change on every bar, the ratio is null. */
const CONST_DATA: ChartLineUdRatioPoint[] = Array.from(
  { length: 10 },
  (_, i) => at(i, 50),
);

/**
 * Eight alternating bars with sums that divide cleanly into 100 -- the
 * exact integer UD ratios at period 3 are [-,-,-, 80, 50, 80, 50, 80].
 */
const MIXED_CLOSES = [10, 14, 12, 16, 14, 18, 16, 20];
const MIXED_DATA: ChartLineUdRatioPoint[] = MIXED_CLOSES.map((v, i) =>
  at(i, v),
);

/** Twenty-four varying bars for the structural and render checks. */
const WAVE_CLOSES = [
  50, 53, 57, 60, 58, 54, 49, 46, 48, 52, 57, 60, 58, 53, 49, 47, 50, 54, 58,
  61, 59, 55, 51, 48,
];
const WAVE_DATA: ChartLineUdRatioPoint[] = WAVE_CLOSES.map((v, i) =>
  at(i, v),
);

const OPTS = { period: 3 };

describe('getLineUdRatioFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineUdRatioFinitePoints(null)).toEqual([]);
    expect(
      getLineUdRatioFinitePoints(undefined as unknown as ChartLineUdRatioPoint[]),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineUdRatioFinitePoints([])).toEqual([]);
  });

  it('drops points with a non-finite x or value', () => {
    const dirty = [
      at(0, 50),
      { x: Number.NaN, value: 51 },
      { x: 2, value: Number.POSITIVE_INFINITY },
      at(3, 53),
    ] as ChartLineUdRatioPoint[];
    expect(getLineUdRatioFinitePoints(dirty)).toEqual([at(0, 50), at(3, 53)]);
  });

  it('preserves the input order', () => {
    const out = getLineUdRatioFinitePoints([at(5, 1), at(2, 2), at(9, 3)]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineUdRatioPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineUdRatioPeriod(14, 3)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineUdRatioPeriod(12.7, 3)).toBe(12);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineUdRatioPeriod(0, 3)).toBe(3);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineUdRatioPeriod(-5, 3)).toBe(3);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineUdRatioPeriod(Number.NaN, 3)).toBe(3);
  });
});

describe('computeLineUdRatio', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineUdRatio(null, 3)).toEqual({
      upGain: [],
      downLoss: [],
      udRatio: [],
    });
  });

  it('matches the input length on every array', () => {
    const out = computeLineUdRatio(WAVE_CLOSES, 3);
    expect(out.upGain).toHaveLength(WAVE_CLOSES.length);
    expect(out.downLoss).toHaveLength(WAVE_CLOSES.length);
    expect(out.udRatio).toHaveLength(WAVE_CLOSES.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineUdRatio(UP_RAMP_DATA.map((p) => p.value), 3);
    for (let i = 0; i < 3; i += 1) {
      expect(out.udRatio[i]).toBeNull();
    }
  });

  it('splits the bar-to-bar change into upGain and downLoss', () => {
    const out = computeLineUdRatio([10, 14, 12], 3);
    expect(out.upGain).toEqual([null, 4, 0]);
    expect(out.downLoss).toEqual([null, 0, 2]);
  });

  it('pins to 100 on a strictly rising series', () => {
    expect(
      computeLineUdRatio(
        UP_RAMP_DATA.map((p) => p.value),
        3,
      ).udRatio,
    ).toEqual([null, null, null, 100, 100, 100, 100, 100, 100, 100]);
  });

  it('pins to zero on a strictly falling series', () => {
    expect(
      computeLineUdRatio(
        DOWN_RAMP_DATA.map((p) => p.value),
        3,
      ).udRatio,
    ).toEqual([null, null, null, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('yields null across a constant series', () => {
    expect(
      computeLineUdRatio(
        CONST_DATA.map((p) => p.value),
        3,
      ).udRatio,
    ).toEqual([null, null, null, null, null, null, null, null, null, null]);
  });

  it('computes the exact integer UD ratios of the mixed fixture', () => {
    expect(computeLineUdRatio(MIXED_CLOSES, 3).udRatio).toEqual([
      null,
      null,
      null,
      80,
      50,
      80,
      50,
      80,
    ]);
  });

  it('keeps every defined ratio inside 0..100', () => {
    const out = computeLineUdRatio(WAVE_CLOSES, 3);
    for (const v of out.udRatio) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('classifyLineUdRatioZone', () => {
  it('exposes the midline constant at 50', () => {
    expect(CHART_LINE_UD_RATIO_MIDLINE).toBe(50);
  });

  it('classifies a value above the midline as up', () => {
    expect(classifyLineUdRatioZone(80)).toBe('up');
  });

  it('classifies a value below the midline as down', () => {
    expect(classifyLineUdRatioZone(20)).toBe('down');
  });

  it('classifies a value at the midline as flat', () => {
    expect(classifyLineUdRatioZone(50)).toBe('flat');
  });

  it('classifies a null value as none', () => {
    expect(classifyLineUdRatioZone(null)).toBe('none');
  });

  it('classifies a non-finite value as none', () => {
    expect(classifyLineUdRatioZone(Number.NaN)).toBe('none');
  });
});

describe('runLineUdRatio', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineUdRatio([at(0, 1)]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineUdRatio([]).ok).toBe(false);
    expect(runLineUdRatio(null).ok).toBe(false);
  });

  it('is ok for a series of at least two points', () => {
    expect(runLineUdRatio(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period when none is given', () => {
    expect(runLineUdRatio(WAVE_DATA).period).toBe(
      DEFAULT_CHART_LINE_UD_RATIO_PERIOD,
    );
  });

  it('honours a custom period', () => {
    expect(runLineUdRatio(WAVE_DATA, { period: 8 }).period).toBe(8);
  });

  it('counts a rising series wholly up', () => {
    const run = runLineUdRatio(UP_RAMP_DATA, OPTS);
    expect(run.upCount).toBe(7);
    expect(run.downCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('counts a falling series wholly down', () => {
    const run = runLineUdRatio(DOWN_RAMP_DATA, OPTS);
    expect(run.downCount).toBe(7);
    expect(run.upCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('counts a constant series wholly none', () => {
    const run = runLineUdRatio(CONST_DATA, OPTS);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('classifies the mixed fixture zones', () => {
    const run = runLineUdRatio(MIXED_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual([
      'none',
      'none',
      'none',
      'up',
      'flat',
      'up',
      'flat',
      'up',
    ]);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineUdRatio(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.zone);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineUdRatio(WAVE_DATA, OPTS);
    const noneCount = run.samples.filter((s) => s.zone === 'none').length;
    expect(run.upCount + run.downCount + run.flatCount + noneCount).toBe(
      run.series.length,
    );
  });

  it('emits one sample per point', () => {
    const run = runLineUdRatio(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineUdRatio([at(3, 3), at(1, 1), at(2, 2)], OPTS);
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final UD ratio reading', () => {
    const run = runLineUdRatio(UP_RAMP_DATA, OPTS);
    expect(run.udRatioFinal).toBe(100);
  });
});

describe('computeLineUdRatioLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineUdRatioLayout({
      data: [at(0, 1)],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineUdRatioLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineUdRatioLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the UD panel', () => {
    const layout = computeLineUdRatioLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.udPanelTop);
  });

  it('builds a price path and a UD path', () => {
    const layout = computeLineUdRatioLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.udRatioPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineUdRatioLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite UD bar', () => {
    const layout = computeLineUdRatioLayout({ data: WAVE_DATA, ...OPTS });
    const finite = layout.run.udRatio.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(finite);
  });

  it('fixes the UD panel band past 0..100', () => {
    const layout = computeLineUdRatioLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.udMin).toBe(-5);
    expect(layout.udMax).toBe(105);
  });

  it('places the midline inside the UD panel', () => {
    const layout = computeLineUdRatioLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.midlineY).toBeGreaterThanOrEqual(layout.udPanelTop);
    expect(layout.midlineY).toBeLessThanOrEqual(layout.udPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineUdRatioLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineUdRatioChart', () => {
  it('names the Up/Down Ratio', () => {
    expect(describeLineUdRatioChart(WAVE_DATA, OPTS)).toContain(
      'Up/Down Ratio',
    );
  });

  it('mentions up-bar and down-bar change', () => {
    const text = describeLineUdRatioChart(WAVE_DATA, OPTS);
    expect(text).toContain('up-bar change');
    expect(text).toContain('down-bar change');
  });

  it('mentions the lookback', () => {
    expect(describeLineUdRatioChart(WAVE_DATA, OPTS)).toContain('lookback');
  });

  it('reports the zone counts', () => {
    const run = runLineUdRatio(WAVE_DATA, OPTS);
    const text = describeLineUdRatioChart(WAVE_DATA, OPTS);
    expect(text).toContain(`above the midline on ${run.upCount}`);
    expect(text).toContain(`below on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineUdRatioChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineUdRatio />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain('Up/Down Ratio');
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ud-ratio-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Up/Down Ratio');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(<ChartLineUdRatio data={[]} {...OPTS} />);
    const empty = container.querySelector(
      '[data-section="chart-line-ud-ratio-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and bar count on the root', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ud-ratio"]',
    );
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-ud-ratio-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price and UD lines', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ud-ratio-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-ud-ratio-ud-line"]'),
    ).not.toBeNull();
  });

  it('draws the midline', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ud-ratio-midline"]'),
    ).not.toBeNull();
  });

  it('renders one marker per finite UD bar', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} />,
    );
    const run = runLineUdRatio(WAVE_DATA, OPTS);
    const finite = run.udRatio.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ud-ratio-marker"]',
    );
    expect(markers).toHaveLength(finite);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ud-ratio-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ud-ratio-badge-config"]',
    );
    expect(badge?.textContent).toBe('UD 3');
  });

  it('hides the UD line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineUdRatio
        data={WAVE_DATA}
        {...OPTS}
        hiddenSeries={['udRatio']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ud-ratio-ud-line"]'),
    ).toBeNull();
  });

  it('hides the midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineUdRatio data={WAVE_DATA} {...OPTS} showMidline={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ud-ratio-midline"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineUdRatio
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ud-ratio-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineUdRatioSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineUdRatio ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-ud-ratio',
    );
  });
});
