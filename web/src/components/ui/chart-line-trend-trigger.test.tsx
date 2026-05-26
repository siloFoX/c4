import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineTrendTrigger,
  type ChartLineTrendTriggerPoint,
  type ChartLineTrendTriggerSample,
  DEFAULT_CHART_LINE_TREND_TRIGGER_PERIOD,
  DEFAULT_CHART_LINE_TREND_TRIGGER_TRIGGER_LEVEL,
  getLineTrendTriggerFinitePoints,
  normalizeLineTrendTriggerPeriod,
  normalizeLineTrendTriggerLevel,
  computeLineTrendTrigger,
  classifyLineTrendTriggerZone,
  runLineTrendTrigger,
  computeLineTrendTriggerLayout,
  describeLineTrendTriggerChart,
} from './chart-line-trend-trigger';

const bar = (
  x: number,
  high: number,
  low: number,
): ChartLineTrendTriggerPoint => ({ x, high, low });

/**
 * Ten bars with a strictly rising close (high = low = close). With
 * period 3 the TTF reads exactly +300 on every defined bar.
 */
const UP_RAMP_DATA: ChartLineTrendTriggerPoint[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
].map((c, i) => bar(i, c, c));

/** A strictly falling mirror: TTF reads exactly -300. */
const DOWN_RAMP_DATA: ChartLineTrendTriggerPoint[] = [
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
].map((c, i) => bar(i, c, c));

/** Ten constant bars: BP and SP are both zero so the TTF is null. */
const CONST_DATA: ChartLineTrendTriggerPoint[] = Array.from(
  { length: 10 },
  (_, i) => bar(i, 50, 50),
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
const WAVE_DATA: ChartLineTrendTriggerPoint[] = WAVE_HIGH.map((h, i) =>
  bar(i, h, WAVE_LOW[i]!),
);

const OPTS = { period: 3, triggerLevel: 100 };

describe('getLineTrendTriggerFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineTrendTriggerFinitePoints(null)).toEqual([]);
    expect(
      getLineTrendTriggerFinitePoints(
        undefined as unknown as ChartLineTrendTriggerPoint[],
      ),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineTrendTriggerFinitePoints([])).toEqual([]);
  });

  it('drops bars with a non-finite x, high or low', () => {
    const dirty = [
      bar(0, 60, 40),
      { x: Number.NaN, high: 60, low: 40 },
      { x: 2, high: Number.POSITIVE_INFINITY, low: 40 },
      bar(3, 62, 42),
    ] as ChartLineTrendTriggerPoint[];
    expect(getLineTrendTriggerFinitePoints(dirty).map((b) => b.x)).toEqual([
      0, 3,
    ]);
  });

  it('preserves the input order', () => {
    const out = getLineTrendTriggerFinitePoints([
      bar(5, 60, 40),
      bar(2, 61, 41),
      bar(9, 62, 42),
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineTrendTriggerPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineTrendTriggerPeriod(15, 3)).toBe(15);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineTrendTriggerPeriod(12.7, 3)).toBe(12);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineTrendTriggerPeriod(0, 3)).toBe(3);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineTrendTriggerPeriod(-5, 3)).toBe(3);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineTrendTriggerPeriod(Number.NaN, 3)).toBe(3);
  });
});

describe('normalizeLineTrendTriggerLevel', () => {
  it('keeps a positive trigger level', () => {
    expect(normalizeLineTrendTriggerLevel(120, 100)).toBe(120);
  });

  it('falls back for a zero level', () => {
    expect(normalizeLineTrendTriggerLevel(0, 100)).toBe(100);
  });

  it('falls back for a negative level', () => {
    expect(normalizeLineTrendTriggerLevel(-50, 100)).toBe(100);
  });

  it('falls back for a non-finite level', () => {
    expect(normalizeLineTrendTriggerLevel(Number.NaN, 100)).toBe(100);
  });
});

describe('computeLineTrendTrigger', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineTrendTrigger(null, 3)).toEqual({
      bp: [],
      sp: [],
      ttf: [],
    });
  });

  it('matches the input length on every array', () => {
    const out = computeLineTrendTrigger(WAVE_DATA, 3);
    expect(out.bp).toHaveLength(WAVE_DATA.length);
    expect(out.sp).toHaveLength(WAVE_DATA.length);
    expect(out.ttf).toHaveLength(WAVE_DATA.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineTrendTrigger(UP_RAMP_DATA, 3);
    for (let i = 0; i < 5; i += 1) {
      expect(out.ttf[i]).toBeNull();
    }
  });

  it('reads exactly +300 across a strictly rising ramp at period 3', () => {
    expect(computeLineTrendTrigger(UP_RAMP_DATA, 3).ttf).toEqual([
      null,
      null,
      null,
      null,
      null,
      300,
      300,
      300,
      300,
      300,
    ]);
  });

  it('reads exactly -300 across a strictly falling ramp at period 3', () => {
    expect(computeLineTrendTrigger(DOWN_RAMP_DATA, 3).ttf).toEqual([
      null,
      null,
      null,
      null,
      null,
      -300,
      -300,
      -300,
      -300,
      -300,
    ]);
  });

  it('yields null across a constant series (the denominator is zero)', () => {
    const out = computeLineTrendTrigger(CONST_DATA, 3);
    for (let i = 5; i < out.ttf.length; i += 1) {
      expect(out.ttf[i]).toBeNull();
    }
  });

  it('carries the BP and SP values on every defined bar', () => {
    const out = computeLineTrendTrigger(UP_RAMP_DATA, 3);
    expect(out.bp[5]).toBe(5);
    expect(out.sp[5]).toBe(-1);
  });

  it('yields null when a bar in the window is non-finite', () => {
    const data = [
      bar(0, 1, 1),
      bar(1, 2, 2),
      { x: 2, high: Number.NaN, low: 3 },
      bar(3, 4, 4),
      bar(4, 5, 5),
      bar(5, 6, 6),
    ] as ChartLineTrendTriggerPoint[];
    const out = computeLineTrendTrigger(data, 3);
    expect(out.ttf[5]).toBeNull();
  });
});

describe('classifyLineTrendTriggerZone', () => {
  it('classifies a value at the upper trigger as up', () => {
    expect(classifyLineTrendTriggerZone(100, 100)).toBe('up');
  });

  it('classifies a value past the upper trigger as up', () => {
    expect(classifyLineTrendTriggerZone(250, 100)).toBe('up');
  });

  it('classifies a value at the lower trigger as down', () => {
    expect(classifyLineTrendTriggerZone(-100, 100)).toBe('down');
  });

  it('classifies a value between the triggers as neutral', () => {
    expect(classifyLineTrendTriggerZone(50, 100)).toBe('neutral');
  });

  it('classifies a null reading as none', () => {
    expect(classifyLineTrendTriggerZone(null, 100)).toBe('none');
  });

  it('classifies a non-finite reading as none', () => {
    expect(classifyLineTrendTriggerZone(Number.NaN, 100)).toBe('none');
  });
});

describe('runLineTrendTrigger', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(runLineTrendTrigger([bar(0, 60, 40)]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineTrendTrigger([]).ok).toBe(false);
    expect(runLineTrendTrigger(null).ok).toBe(false);
  });

  it('is ok for a series of at least two bars', () => {
    expect(runLineTrendTrigger(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period and trigger when none are given', () => {
    const run = runLineTrendTrigger(WAVE_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_TREND_TRIGGER_PERIOD);
    expect(run.triggerLevel).toBe(
      DEFAULT_CHART_LINE_TREND_TRIGGER_TRIGGER_LEVEL,
    );
  });

  it('honours a custom period and trigger', () => {
    const run = runLineTrendTrigger(WAVE_DATA, {
      period: 8,
      triggerLevel: 120,
    });
    expect(run.period).toBe(8);
    expect(run.triggerLevel).toBe(120);
  });

  it('counts a rising ramp wholly up', () => {
    const run = runLineTrendTrigger(UP_RAMP_DATA, OPTS);
    expect(run.upCount).toBe(5);
    expect(run.downCount).toBe(0);
    expect(run.neutralCount).toBe(0);
  });

  it('counts a falling ramp wholly down', () => {
    const run = runLineTrendTrigger(DOWN_RAMP_DATA, OPTS);
    expect(run.downCount).toBe(5);
    expect(run.upCount).toBe(0);
    expect(run.neutralCount).toBe(0);
  });

  it('counts a constant series wholly none (no TTF)', () => {
    const run = runLineTrendTrigger(CONST_DATA, OPTS);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
    expect(run.neutralCount).toBe(0);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineTrendTrigger(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'neutral', 'none']).toContain(sample.zone);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineTrendTrigger(WAVE_DATA, OPTS);
    const noneCount = run.samples.filter((s) => s.zone === 'none').length;
    expect(
      run.upCount + run.downCount + run.neutralCount + noneCount,
    ).toBe(run.series.length);
  });

  it('carries the bar midpoint and BP/SP on each sample', () => {
    const run = runLineTrendTrigger(UP_RAMP_DATA, OPTS);
    expect(run.samples[5]!.midpoint).toBe(6);
    expect(run.samples[5]!.bp).toBe(5);
    expect(run.samples[5]!.sp).toBe(-1);
  });

  it('emits one sample per bar', () => {
    const run = runLineTrendTrigger(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineTrendTrigger(
      [bar(3, 63, 43), bar(1, 61, 41), bar(2, 62, 42)],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final TTF reading', () => {
    const run = runLineTrendTrigger(UP_RAMP_DATA, OPTS);
    expect(run.ttfFinal).toBe(300);
  });
});

describe('computeLineTrendTriggerLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineTrendTriggerLayout({
      data: [bar(0, 60, 40)],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineTrendTriggerLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineTrendTriggerLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the TTF panel', () => {
    const layout = computeLineTrendTriggerLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.ttfPanelTop);
  });

  it('builds a price path and a TTF path', () => {
    const layout = computeLineTrendTriggerLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.ttfPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineTrendTriggerLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite TTF bar', () => {
    const layout = computeLineTrendTriggerLayout({ data: WAVE_DATA, ...OPTS });
    const finite = layout.run.ttf.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(finite);
  });

  it('keeps the trigger lines and zero inside the TTF panel', () => {
    const layout = computeLineTrendTriggerLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.ttfPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.ttfPanelBottom);
    expect(layout.upperY).toBeGreaterThanOrEqual(layout.ttfPanelTop);
    expect(layout.upperY).toBeLessThanOrEqual(layout.ttfPanelBottom);
    expect(layout.lowerY).toBeGreaterThanOrEqual(layout.ttfPanelTop);
    expect(layout.lowerY).toBeLessThanOrEqual(layout.ttfPanelBottom);
  });

  it('keeps the upper trigger above the lower trigger', () => {
    const layout = computeLineTrendTriggerLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.upperY).toBeLessThan(layout.lowerY);
  });

  it('carries the run', () => {
    const layout = computeLineTrendTriggerLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineTrendTriggerChart', () => {
  it('names the Trend Trigger Factor', () => {
    expect(describeLineTrendTriggerChart(WAVE_DATA, OPTS)).toContain(
      'Trend Trigger Factor',
    );
  });

  it('mentions buying power and selling power', () => {
    const text = describeLineTrendTriggerChart(WAVE_DATA, OPTS);
    expect(text).toContain('buying power');
    expect(text).toContain('selling power');
  });

  it('mentions the lookback', () => {
    expect(describeLineTrendTriggerChart(WAVE_DATA, OPTS)).toContain(
      'lookback',
    );
  });

  it('reports the zone counts', () => {
    const run = runLineTrendTrigger(WAVE_DATA, OPTS);
    const text = describeLineTrendTriggerChart(WAVE_DATA, OPTS);
    expect(text).toContain(`above +${run.triggerLevel} on ${run.upCount}`);
    expect(text).toContain(`below -${run.triggerLevel} on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineTrendTriggerChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineTrendTrigger />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain(
      'Trend Trigger Factor',
    );
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trend-trigger-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Trend Trigger Factor');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={[]} {...OPTS} />,
    );
    const empty = container.querySelector(
      '[data-section="chart-line-trend-trigger-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and bar count on the root', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-trigger"]',
    );
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-trigger-level')).toBe('100');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-trend-trigger-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price and TTF lines', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-trigger-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-trigger-ttf-line"]',
      ),
    ).not.toBeNull();
  });

  it('draws the two trigger reference lines', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={WAVE_DATA} {...OPTS} />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-line-trend-trigger-trigger-line"]',
    );
    expect(lines).toHaveLength(2);
  });

  it('renders one marker per finite TTF bar', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={WAVE_DATA} {...OPTS} />,
    );
    const run = runLineTrendTrigger(WAVE_DATA, OPTS);
    const finite = run.ttf.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-trend-trigger-marker"]',
    );
    expect(markers).toHaveLength(finite);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-trend-trigger-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'neutral', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineTrendTrigger data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-trend-trigger-badge-config"]',
    );
    expect(badge?.textContent).toBe('TTF 3/100');
  });

  it('hides the TTF line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineTrendTrigger
        data={WAVE_DATA}
        {...OPTS}
        hiddenSeries={['ttf']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-trigger-ttf-line"]',
      ),
    ).toBeNull();
  });

  it('hides the trigger lines when showTriggers is false', () => {
    const { container } = render(
      <ChartLineTrendTrigger
        data={WAVE_DATA}
        {...OPTS}
        showTriggers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-trigger-trigger-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendTrigger
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-trigger-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineTrendTriggerSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTrendTrigger ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-trend-trigger',
    );
  });
});
