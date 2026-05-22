import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineHighpass,
  type ChartLineHighpassPoint,
  type ChartLineHighpassSample,
  DEFAULT_CHART_LINE_HIGHPASS_PERIOD,
  getLineHighpassFinitePoints,
  normalizeLineHighpassPeriod,
  computeLineHighpassCoefficients,
  computeLineHighpass,
  classifyLineHighpassZone,
  runLineHighpass,
  computeLineHighpassLayout,
  describeLineHighpassChart,
} from './chart-line-highpass';

/** Eight bars at a constant level: every second difference is zero. */
const CONST_DATA: ChartLineHighpassPoint[] = Array.from(
  { length: 8 },
  (_, i) => ({ x: i, value: 50 }),
);

const CONST_VALUES: number[] = CONST_DATA.map((p) => p.value);

/** An ascending linear ramp: a + 4*i. Its second difference is zero. */
const RAMP_DATA: ChartLineHighpassPoint[] = [
  10, 14, 18, 22, 26, 30, 34, 38,
].map((value, i) => ({ x: i, value }));

const RAMP_VALUES: number[] = RAMP_DATA.map((p) => p.value);

/** A descending linear ramp: 100 - 7*i. Its second difference is also zero. */
const DESC_RAMP_VALUES: number[] = [100, 93, 86, 79, 72, 65, 58, 51];

/** Two full cycles of a twelve-bar sinusoid -- it has curvature to pass. */
const WAVE_DATA: ChartLineHighpassPoint[] = [
  50, 54, 56, 57, 56, 54, 50, 46, 44, 43, 44, 46, 50, 54, 56, 57, 56, 54, 50,
  46, 44, 43, 44, 46,
].map((value, i) => ({ x: i, value }));

const WAVE_VALUES: number[] = WAVE_DATA.map((p) => p.value);

const OPTS = { period: 10 };

describe('getLineHighpassFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineHighpassFinitePoints(null)).toEqual([]);
    expect(
      getLineHighpassFinitePoints(undefined as unknown as ChartLineHighpassPoint[]),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineHighpassFinitePoints([])).toEqual([]);
  });

  it('drops points with a non-finite x or value', () => {
    const dirty = [
      { x: 0, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 2, value: Number.POSITIVE_INFINITY },
      { x: 3, value: 30 },
    ] as ChartLineHighpassPoint[];
    expect(getLineHighpassFinitePoints(dirty)).toEqual([
      { x: 0, value: 10 },
      { x: 3, value: 30 },
    ]);
  });

  it('preserves the input order', () => {
    const out = getLineHighpassFinitePoints([
      { x: 5, value: 1 },
      { x: 2, value: 2 },
      { x: 9, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineHighpassPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineHighpassPeriod(20, 12)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineHighpassPeriod(12.7, 20)).toBe(12);
  });

  it('falls back for a period below two', () => {
    expect(normalizeLineHighpassPeriod(1, 20)).toBe(20);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineHighpassPeriod(0, 20)).toBe(20);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineHighpassPeriod(-8, 20)).toBe(20);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineHighpassPeriod(Number.NaN, 20)).toBe(20);
    expect(normalizeLineHighpassPeriod('30' as unknown as number, 20)).toBe(20);
  });
});

describe('computeLineHighpassCoefficients', () => {
  it('returns finite a1, b1, c1, c2 and c3', () => {
    const c = computeLineHighpassCoefficients(20);
    expect(Number.isFinite(c.a1)).toBe(true);
    expect(Number.isFinite(c.b1)).toBe(true);
    expect(Number.isFinite(c.c1)).toBe(true);
    expect(Number.isFinite(c.c2)).toBe(true);
    expect(Number.isFinite(c.c3)).toBe(true);
  });

  it('sets a1 to exp of minus 1.414 pi over the period', () => {
    const c = computeLineHighpassCoefficients(20);
    expect(c.a1).toBe(Math.exp((-1.414 * Math.PI) / 20));
  });

  it('keeps a1 inside the open unit interval', () => {
    const c = computeLineHighpassCoefficients(20);
    expect(c.a1).toBeGreaterThan(0);
    expect(c.a1).toBeLessThan(1);
  });

  it('sets c3 to the negated square of a1', () => {
    const c = computeLineHighpassCoefficients(20);
    expect(c.c3).toBe(-(c.a1 * c.a1));
    expect(c.c3).toBeLessThan(0);
  });

  it('derives c1 from one plus c2 minus c3 over four', () => {
    const c = computeLineHighpassCoefficients(20);
    expect(c.c1).toBe((1 + c.c2 - c.c3) / 4);
  });

  it('responds to the period', () => {
    const a = computeLineHighpassCoefficients(10);
    const b = computeLineHighpassCoefficients(40);
    expect(a.a1).not.toBe(b.a1);
  });
});

describe('computeLineHighpass', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineHighpass(null, 10)).toEqual([]);
    expect(computeLineHighpass(undefined as unknown as number[], 10)).toEqual(
      [],
    );
  });

  it('returns an empty array for an empty input', () => {
    expect(computeLineHighpass([], 10)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineHighpass(WAVE_VALUES, 10)).toHaveLength(
      WAVE_VALUES.length,
    );
  });

  it('seeds the first two bars at zero', () => {
    const hp = computeLineHighpass(WAVE_VALUES, 10);
    expect(hp[0]).toBe(0);
    expect(hp[1]).toBe(0);
  });

  it('holds a constant series at zero across every bar', () => {
    const hp = computeLineHighpass(CONST_VALUES, 10);
    expect(hp.every((v) => v === 0)).toBe(true);
  });

  it('drives an ascending linear ramp to exactly zero', () => {
    const hp = computeLineHighpass(RAMP_VALUES, 10);
    expect(hp).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('drives a descending linear ramp to exactly zero', () => {
    const hp = computeLineHighpass(DESC_RAMP_VALUES, 10);
    expect(hp.every((v) => v === 0)).toBe(true);
  });

  it('keeps every highpass reading finite for finite input', () => {
    const hp = computeLineHighpass(WAVE_VALUES, 10);
    expect(hp.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('produces a non-zero output for a curved series', () => {
    const hp = computeLineHighpass(WAVE_VALUES, 10);
    expect(hp.some((v) => v !== 0)).toBe(true);
  });

  it('oscillates across zero with both signs for a cyclic series', () => {
    const hp = computeLineHighpass(WAVE_VALUES, 10);
    expect(hp.some((v) => v > 0)).toBe(true);
    expect(hp.some((v) => v < 0)).toBe(true);
  });

  it('responds to the period', () => {
    const fast = computeLineHighpass(WAVE_VALUES, 8);
    const slow = computeLineHighpass(WAVE_VALUES, 40);
    expect(fast).not.toEqual(slow);
  });
});

describe('classifyLineHighpassZone', () => {
  it('classifies a positive highpass as up', () => {
    expect(classifyLineHighpassZone(2.5)).toBe('up');
  });

  it('classifies a negative highpass as down', () => {
    expect(classifyLineHighpassZone(-2.5)).toBe('down');
  });

  it('classifies a zero highpass as flat', () => {
    expect(classifyLineHighpassZone(0)).toBe('flat');
  });

  it('classifies a null highpass as none', () => {
    expect(classifyLineHighpassZone(null)).toBe('none');
  });

  it('classifies a non-finite highpass as none', () => {
    expect(classifyLineHighpassZone(Number.NaN)).toBe('none');
  });
});

describe('runLineHighpass', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineHighpass([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineHighpass([]).ok).toBe(false);
    expect(runLineHighpass(null).ok).toBe(false);
  });

  it('is ok for a series of at least two points', () => {
    expect(runLineHighpass(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period when none is given', () => {
    expect(runLineHighpass(WAVE_DATA).period).toBe(
      DEFAULT_CHART_LINE_HIGHPASS_PERIOD,
    );
  });

  it('honours a custom period', () => {
    expect(runLineHighpass(WAVE_DATA, { period: 14 }).period).toBe(14);
  });

  it('holds the highpass at zero and wholly flat for a constant series', () => {
    const run = runLineHighpass(CONST_DATA, OPTS);
    expect(run.hp.every((v) => v === 0)).toBe(true);
    expect(run.flatCount).toBe(run.series.length);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('removes a linear trend, leaving the highpass at zero and flat', () => {
    const run = runLineHighpass(RAMP_DATA, OPTS);
    expect(run.hp.every((v) => v === 0)).toBe(true);
    expect(run.flatCount).toBe(run.series.length);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineHighpass(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.zone);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineHighpass(WAVE_DATA, OPTS);
    expect(run.upCount + run.downCount + run.flatCount).toBe(
      run.series.length,
    );
  });

  it('lags the trigger one bar behind the highpass', () => {
    const run = runLineHighpass(WAVE_DATA, OPTS);
    expect(run.trigger[0]).toBeNull();
    for (let i = 1; i < run.hp.length; i += 1) {
      expect(run.trigger[i]).toBe(run.hp[i - 1]);
    }
  });

  it('emits one sample per point', () => {
    const run = runLineHighpass(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('carries finite filter coefficients', () => {
    const run = runLineHighpass(WAVE_DATA, OPTS);
    expect(Number.isFinite(run.a1)).toBe(true);
    expect(Number.isFinite(run.c1)).toBe(true);
    expect(Number.isFinite(run.c2)).toBe(true);
    expect(Number.isFinite(run.c3)).toBe(true);
  });

  it('carries the highpass array alongside the samples', () => {
    const run = runLineHighpass(WAVE_DATA, OPTS);
    expect(run.hp).toHaveLength(run.samples.length);
  });

  it('sorts the series by x', () => {
    const run = runLineHighpass(
      [
        { x: 3, value: 30 },
        { x: 1, value: 10 },
        { x: 2, value: 20 },
      ],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final highpass reading', () => {
    const run = runLineHighpass(WAVE_DATA, OPTS);
    expect(run.hpFinal).toBe(run.hp[run.hp.length - 1]);
  });
});

describe('computeLineHighpassLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineHighpassLayout({
      data: [{ x: 0, value: 1 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineHighpassLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineHighpassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the highpass panel', () => {
    const layout = computeLineHighpassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.hpPanelTop);
  });

  it('builds a price path, a highpass path and a trigger path', () => {
    const layout = computeLineHighpassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.highpassPath.length).toBeGreaterThan(0);
    expect(layout.triggerPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineHighpassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per bar', () => {
    const layout = computeLineHighpassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.markers).toHaveLength(WAVE_DATA.length);
  });

  it('places the zero line inside the highpass panel', () => {
    const layout = computeLineHighpassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.hpPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.hpPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineHighpassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineHighpassChart', () => {
  it('names the Ehlers Highpass Filter', () => {
    expect(describeLineHighpassChart(WAVE_DATA, OPTS)).toContain(
      'Ehlers Highpass Filter',
    );
  });

  it('mentions removing the trend', () => {
    expect(describeLineHighpassChart(WAVE_DATA, OPTS)).toContain('trend');
  });

  it('mentions the two-pole filter', () => {
    expect(describeLineHighpassChart(WAVE_DATA, OPTS)).toContain('two-pole');
  });

  it('reports the zone counts', () => {
    const run = runLineHighpass(WAVE_DATA, OPTS);
    const text = describeLineHighpassChart(WAVE_DATA, OPTS);
    expect(text).toContain(`above zero on ${run.upCount}`);
    expect(text).toContain(`below zero on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineHighpassChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineHighpass />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain('Highpass');
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-highpass-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ehlers Highpass Filter');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(<ChartLineHighpass data={[]} {...OPTS} />);
    const empty = container.querySelector(
      '[data-section="chart-line-highpass-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and point count on the root', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-highpass"]',
    );
    expect(root?.getAttribute('data-period')).toBe('10');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-highpass-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price, highpass and trigger lines', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-highpass-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-highpass-highpass-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-highpass-trigger-line"]',
      ),
    ).not.toBeNull();
  });

  it('draws the zero line', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-highpass-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per bar', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-highpass-marker"]',
    );
    expect(markers).toHaveLength(WAVE_DATA.length);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-highpass-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-highpass-panel-label"]',
    );
    const texts = Array.from(labels).map((n) => n.textContent);
    expect(texts).toContain('Price');
    expect(texts).toContain('Ehlers Highpass Filter');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-highpass-badge-config"]',
    );
    expect(badge?.textContent).toBe('HP 10');
  });

  it('hides the highpass line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineHighpass
        data={WAVE_DATA}
        {...OPTS}
        hiddenSeries={['highpass']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-highpass-highpass-line"]',
      ),
    ).toBeNull();
  });

  it('hides the trigger line when showTrigger is false', () => {
    const { container } = render(
      <ChartLineHighpass data={WAVE_DATA} {...OPTS} showTrigger={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-highpass-trigger-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHighpass
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-highpass-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineHighpassSample;
    };
    expect(detail.point.index).toBe(0);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHighpass ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-highpass',
    );
  });
});
