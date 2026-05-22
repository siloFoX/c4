import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineErgodic,
  type ChartLineErgodicPoint,
  type ChartLineErgodicSample,
  DEFAULT_CHART_LINE_ERGODIC_FIRST_PERIOD,
  getLineErgodicFinitePoints,
  normalizeLineErgodicPeriod,
  computeLineErgodicMomentum,
  computeLineErgodicEma,
  computeLineErgodic,
  classifyLineErgodicZone,
  runLineErgodic,
  computeLineErgodicLayout,
  describeLineErgodicChart,
} from './chart-line-ergodic';

/** Eight constant bars: zero momentum, so the oscillator reads zero. */
const CONST_DATA: ChartLineErgodicPoint[] = Array.from(
  { length: 8 },
  (_, i) => ({ x: i, value: 50 }),
);

const CONST_VALUES: number[] = CONST_DATA.map((p) => p.value);

/** An ascending ramp: constant +4 momentum, so the oscillator pins to +100. */
const UP_RAMP_DATA: ChartLineErgodicPoint[] = [
  10, 14, 18, 22, 26, 30, 34, 38,
].map((value, i) => ({ x: i, value }));

const UP_RAMP_VALUES: number[] = UP_RAMP_DATA.map((p) => p.value);

/** A descending ramp: constant -4 momentum, so the oscillator pins to -100. */
const DOWN_RAMP_DATA: ChartLineErgodicPoint[] = [
  38, 34, 30, 26, 22, 18, 14, 10,
].map((value, i) => ({ x: i, value }));

const DOWN_RAMP_VALUES: number[] = DOWN_RAMP_DATA.map((p) => p.value);

/** Twenty-four varying bars for the structural and render checks. */
const WAVE_DATA: ChartLineErgodicPoint[] = [
  50, 53, 57, 60, 58, 54, 49, 46, 48, 52, 57, 60, 58, 53, 49, 47, 50, 54, 58,
  61, 59, 55, 51, 48,
].map((value, i) => ({ x: i, value }));

const WAVE_VALUES: number[] = WAVE_DATA.map((p) => p.value);

const OPTS = {
  firstPeriod: 3,
  secondPeriod: 3,
  thirdPeriod: 3,
  signalPeriod: 3,
};

describe('getLineErgodicFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineErgodicFinitePoints(null)).toEqual([]);
    expect(
      getLineErgodicFinitePoints(
        undefined as unknown as ChartLineErgodicPoint[],
      ),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineErgodicFinitePoints([])).toEqual([]);
  });

  it('drops points with a non-finite x or value', () => {
    const dirty = [
      { x: 0, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 2, value: Number.POSITIVE_INFINITY },
      { x: 3, value: 30 },
    ] as ChartLineErgodicPoint[];
    expect(getLineErgodicFinitePoints(dirty)).toEqual([
      { x: 0, value: 10 },
      { x: 3, value: 30 },
    ]);
  });

  it('preserves the input order', () => {
    const out = getLineErgodicFinitePoints([
      { x: 5, value: 1 },
      { x: 2, value: 2 },
      { x: 9, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineErgodicPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineErgodicPeriod(12, 3)).toBe(12);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineErgodicPeriod(6.8, 3)).toBe(6);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineErgodicPeriod(0, 3)).toBe(3);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineErgodicPeriod(-5, 3)).toBe(3);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineErgodicPeriod(Number.NaN, 3)).toBe(3);
  });
});

describe('computeLineErgodicMomentum', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineErgodicMomentum(null)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineErgodicMomentum(UP_RAMP_VALUES)).toHaveLength(
      UP_RAMP_VALUES.length,
    );
  });

  it('leaves the first bar null', () => {
    expect(computeLineErgodicMomentum(UP_RAMP_VALUES)[0]).toBeNull();
  });

  it('takes the one-bar price change', () => {
    expect(computeLineErgodicMomentum([10, 14, 18, 22])).toEqual([
      null,
      4,
      4,
      4,
    ]);
  });

  it('yields null where a price is non-finite', () => {
    const out = computeLineErgodicMomentum([10, Number.NaN, 18]);
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
  });
});

describe('computeLineErgodicEma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineErgodicEma(null, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineErgodicEma([4, 8, 16], 3)).toHaveLength(3);
  });

  it('computes the exact dyadic average for a period-3 alpha', () => {
    expect(computeLineErgodicEma([4, 8, 16], 3)).toEqual([4, 6, 11]);
  });

  it('passes a leading null through and seeds from the first finite value', () => {
    expect(computeLineErgodicEma([null, 4, 8, 16], 3)).toEqual([
      null,
      4,
      6,
      11,
    ]);
  });

  it('holds a constant series at its constant level', () => {
    expect(computeLineErgodicEma([5, 5, 5, 5], 3)).toEqual([5, 5, 5, 5]);
  });

  it('keeps several leading nulls null', () => {
    expect(computeLineErgodicEma([null, null, 8, 12], 3)).toEqual([
      null,
      null,
      8,
      10,
    ]);
  });
});

describe('computeLineErgodic', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineErgodic(null, OPTS)).toEqual({
      momentum: [],
      ergodic: [],
      signal: [],
    });
  });

  it('matches the input length on every array', () => {
    const out = computeLineErgodic(WAVE_VALUES, OPTS);
    expect(out.momentum).toHaveLength(WAVE_VALUES.length);
    expect(out.ergodic).toHaveLength(WAVE_VALUES.length);
    expect(out.signal).toHaveLength(WAVE_VALUES.length);
  });

  it('leaves the first bar null', () => {
    const out = computeLineErgodic(WAVE_VALUES, OPTS);
    expect(out.momentum[0]).toBeNull();
    expect(out.ergodic[0]).toBeNull();
    expect(out.signal[0]).toBeNull();
  });

  it('reads zero across a constant series', () => {
    expect(computeLineErgodic(CONST_VALUES, OPTS).ergodic).toEqual([
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

  it('pins to +100 on a pure uptrend', () => {
    expect(computeLineErgodic(UP_RAMP_VALUES, OPTS).ergodic).toEqual([
      null,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
    ]);
  });

  it('pins to -100 on a pure downtrend', () => {
    expect(computeLineErgodic(DOWN_RAMP_VALUES, OPTS).ergodic).toEqual([
      null,
      -100,
      -100,
      -100,
      -100,
      -100,
      -100,
      -100,
    ]);
  });

  it('tracks the oscillator with a signal line on an uptrend', () => {
    expect(computeLineErgodic(UP_RAMP_VALUES, OPTS).signal).toEqual([
      null,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
    ]);
  });

  it('keeps the oscillator bounded to plus or minus 100', () => {
    const out = computeLineErgodic(WAVE_VALUES, OPTS);
    for (const v of out.ergodic) {
      if (v !== null) expect(Math.abs(v)).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('keeps every defined oscillator reading finite', () => {
    const out = computeLineErgodic(WAVE_VALUES, OPTS);
    for (const v of out.ergodic) {
      if (v !== null) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('produces a non-zero oscillator for a varying series', () => {
    const out = computeLineErgodic(WAVE_VALUES, OPTS);
    expect(out.ergodic.some((v) => v !== null && v !== 0)).toBe(true);
  });
});

describe('classifyLineErgodicZone', () => {
  it('classifies an oscillator above its signal as up', () => {
    expect(classifyLineErgodicZone(40, 20)).toBe('up');
  });

  it('classifies an oscillator below its signal as down', () => {
    expect(classifyLineErgodicZone(20, 40)).toBe('down');
  });

  it('classifies an oscillator on its signal as flat', () => {
    expect(classifyLineErgodicZone(30, 30)).toBe('flat');
  });

  it('classifies a null oscillator as none', () => {
    expect(classifyLineErgodicZone(null, 20)).toBe('none');
  });

  it('classifies a non-finite signal as none', () => {
    expect(classifyLineErgodicZone(20, Number.NaN)).toBe('none');
  });
});

describe('runLineErgodic', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineErgodic([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineErgodic([]).ok).toBe(false);
    expect(runLineErgodic(null).ok).toBe(false);
  });

  it('is ok for a series of at least two points', () => {
    expect(runLineErgodic(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default periods when none are given', () => {
    expect(runLineErgodic(WAVE_DATA).firstPeriod).toBe(
      DEFAULT_CHART_LINE_ERGODIC_FIRST_PERIOD,
    );
  });

  it('honours custom periods', () => {
    const run = runLineErgodic(WAVE_DATA, {
      firstPeriod: 9,
      secondPeriod: 5,
      thirdPeriod: 4,
      signalPeriod: 2,
    });
    expect(run.firstPeriod).toBe(9);
    expect(run.signalPeriod).toBe(2);
  });

  it('counts an uptrend wholly flat against its signal', () => {
    const run = runLineErgodic(UP_RAMP_DATA, OPTS);
    expect(run.flatCount).toBe(7);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineErgodic(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.zone);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineErgodic(WAVE_DATA, OPTS);
    const noneCount = run.samples.filter((s) => s.zone === 'none').length;
    expect(run.upCount + run.downCount + run.flatCount + noneCount).toBe(
      run.series.length,
    );
  });

  it('emits one sample per point', () => {
    const run = runLineErgodic(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('carries the momentum, ergodic and signal arrays', () => {
    const run = runLineErgodic(WAVE_DATA, OPTS);
    expect(run.momentum).toHaveLength(WAVE_DATA.length);
    expect(run.ergodic).toHaveLength(WAVE_DATA.length);
    expect(run.signal).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineErgodic(
      [
        { x: 3, value: 30 },
        { x: 1, value: 10 },
        { x: 2, value: 20 },
      ],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final oscillator reading', () => {
    const run = runLineErgodic(UP_RAMP_DATA, OPTS);
    expect(run.ergodicFinal).toBe(100);
  });
});

describe('computeLineErgodicLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineErgodicLayout({
      data: [{ x: 0, value: 1 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineErgodicLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineErgodicLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the oscillator panel', () => {
    const layout = computeLineErgodicLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.oscPanelTop);
  });

  it('builds a price path, an ergodic path and a signal path', () => {
    const layout = computeLineErgodicLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.ergodicPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineErgodicLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite oscillator bar', () => {
    const layout = computeLineErgodicLayout({ data: WAVE_DATA, ...OPTS });
    const finiteErgodic = layout.run.ergodic.filter(
      (v) => v !== null,
    ).length;
    expect(layout.markers).toHaveLength(finiteErgodic);
  });

  it('fixes the oscillator panel band past plus or minus 100', () => {
    const layout = computeLineErgodicLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.oscMin).toBe(-110);
    expect(layout.oscMax).toBe(110);
  });

  it('places the zero line inside the oscillator panel', () => {
    const layout = computeLineErgodicLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.oscPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.oscPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineErgodicLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineErgodicChart', () => {
  it('names the Ergodic Oscillator', () => {
    expect(describeLineErgodicChart(WAVE_DATA, OPTS)).toContain(
      'Ergodic Oscillator',
    );
  });

  it('mentions the triple smoothing', () => {
    expect(describeLineErgodicChart(WAVE_DATA, OPTS)).toContain(
      'triple-smooths',
    );
  });

  it('mentions the signal line', () => {
    expect(describeLineErgodicChart(WAVE_DATA, OPTS)).toContain(
      'signal line',
    );
  });

  it('reports the zone counts', () => {
    const run = runLineErgodic(WAVE_DATA, OPTS);
    const text = describeLineErgodicChart(WAVE_DATA, OPTS);
    expect(text).toContain(`leads its signal on ${run.upCount}`);
    expect(text).toContain(`lags on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineErgodicChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineErgodic />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain('Ergodic Oscillator');
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ergodic-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ergodic Oscillator');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(<ChartLineErgodic data={[]} {...OPTS} />);
    const empty = container.querySelector(
      '[data-section="chart-line-ergodic-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the periods and point count on the root', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ergodic"]',
    );
    expect(root?.getAttribute('data-first-period')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-ergodic-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price, ergodic and signal lines', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ergodic-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ergodic-ergodic-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ergodic-signal-line"]',
      ),
    ).not.toBeNull();
  });

  it('draws the zero line', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ergodic-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per finite oscillator bar', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    const run = runLineErgodic(WAVE_DATA, OPTS);
    const finiteErgodic = run.ergodic.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ergodic-marker"]',
    );
    expect(markers).toHaveLength(finiteErgodic);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ergodic-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-ergodic-panel-label"]',
    );
    const texts = Array.from(labels).map((n) => n.textContent);
    expect(texts).toContain('Price');
    expect(texts).toContain('Ergodic Oscillator');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ergodic-badge-config"]',
    );
    expect(badge?.textContent).toBe('ERG 3/3/3');
  });

  it('hides the ergodic line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineErgodic
        data={WAVE_DATA}
        {...OPTS}
        hiddenSeries={['ergodic']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ergodic-ergodic-line"]',
      ),
    ).toBeNull();
  });

  it('hides the signal line when showSignal is false', () => {
    const { container } = render(
      <ChartLineErgodic data={WAVE_DATA} {...OPTS} showSignal={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ergodic-signal-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineErgodic
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ergodic-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineErgodicSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineErgodic ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-ergodic',
    );
  });
});
