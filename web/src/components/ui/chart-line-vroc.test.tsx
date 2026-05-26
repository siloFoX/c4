import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineVroc,
  type ChartLineVrocPoint,
  type ChartLineVrocSample,
  DEFAULT_CHART_LINE_VROC_PERIOD,
  getLineVrocFinitePoints,
  normalizeLineVrocPeriod,
  computeLineVroc,
  classifyLineVrocZone,
  runLineVroc,
  computeLineVrocLayout,
  describeLineVrocChart,
} from './chart-line-vroc';

const bar = (
  x: number,
  close: number,
  volume: number,
): ChartLineVrocPoint => ({ x, close, volume });

/** Eight bars with constant volume: the VROC reads zero across the window. */
const CONST_DATA: ChartLineVrocPoint[] = [50, 51, 52, 53, 52, 51, 52, 53].map(
  (c, i) => bar(i, c, 100),
);

/**
 * Volumes that exactly double every three bars: 100, 110, 120, 200, 220,
 * 240, 400, 440. With period 3 the VROC pins to +100 on every bar past
 * the warm-up.
 */
const DOUBLE_DATA: ChartLineVrocPoint[] = [
  100, 110, 120, 200, 220, 240, 400, 440,
].map((v, i) => bar(i, 50 + i, v));

/**
 * Volumes that exactly halve every three bars: 200, 300, 400, 100, 150,
 * 200, 50, 75. With period 3 the VROC pins to -50.
 */
const HALF_DATA: ChartLineVrocPoint[] = [
  200, 300, 400, 100, 150, 200, 50, 75,
].map((v, i) => bar(i, 50 - i, v));

/**
 * A varying volume series chosen for exact integer VROCs at period 3:
 * volumes [100, 100, 100, 150, 200, 50, 300, 100] -> VROC
 * [null,null,null, 50, 100, -50, 100, -50].
 */
const MIXED_VOLS = [100, 100, 100, 150, 200, 50, 300, 100];
const MIXED_DATA: ChartLineVrocPoint[] = MIXED_VOLS.map((v, i) => bar(i, 50, v));

/** Twenty-four varying bars for the structural and render checks. */
const WAVE_CLOSES = [
  50, 53, 57, 60, 58, 54, 49, 46, 48, 52, 57, 60, 58, 53, 49, 47, 50, 54, 58,
  61, 59, 55, 51, 48,
];
const WAVE_VOLS = [
  100, 150, 200, 120, 180, 140, 160, 200, 110, 170, 130, 190, 150, 210, 120,
  180, 140, 200, 160, 130, 170, 110, 190, 150,
];
const WAVE_DATA: ChartLineVrocPoint[] = WAVE_CLOSES.map((c, i) =>
  bar(i, c, WAVE_VOLS[i]!),
);

const OPTS = { period: 3 };

describe('getLineVrocFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineVrocFinitePoints(null)).toEqual([]);
    expect(
      getLineVrocFinitePoints(undefined as unknown as ChartLineVrocPoint[]),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineVrocFinitePoints([])).toEqual([]);
  });

  it('drops bars with any non-finite field', () => {
    const dirty = [
      bar(0, 50, 100),
      { x: 1, close: Number.NaN, volume: 100 },
      { x: 2, close: 52, volume: Number.POSITIVE_INFINITY },
      bar(3, 53, 110),
    ] as ChartLineVrocPoint[];
    expect(getLineVrocFinitePoints(dirty).map((b) => b.x)).toEqual([0, 3]);
  });

  it('preserves the input order', () => {
    const out = getLineVrocFinitePoints([
      bar(5, 50, 100),
      bar(2, 51, 110),
      bar(9, 52, 120),
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineVrocPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineVrocPeriod(14, 3)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineVrocPeriod(12.7, 3)).toBe(12);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineVrocPeriod(0, 3)).toBe(3);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineVrocPeriod(-5, 3)).toBe(3);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineVrocPeriod(Number.NaN, 3)).toBe(3);
  });
});

describe('computeLineVroc', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineVroc(null, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineVroc(WAVE_DATA, 3)).toHaveLength(WAVE_DATA.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineVroc(WAVE_DATA, 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
  });

  it('reads zero across a constant-volume series', () => {
    expect(computeLineVroc(CONST_DATA, 3)).toEqual([
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it('pins to +100 when volume doubles every lookback', () => {
    expect(computeLineVroc(DOUBLE_DATA, 3)).toEqual([
      null,
      null,
      null,
      100,
      100,
      100,
      100,
      100,
    ]);
  });

  it('pins to -50 when volume halves every lookback', () => {
    expect(computeLineVroc(HALF_DATA, 3)).toEqual([
      null,
      null,
      null,
      -50,
      -50,
      -50,
      -50,
      -50,
    ]);
  });

  it('computes the exact integer VROC of the mixed fixture', () => {
    expect(computeLineVroc(MIXED_DATA, 3)).toEqual([
      null,
      null,
      null,
      50,
      100,
      -50,
      100,
      -50,
    ]);
  });

  it('yields null when the prior volume is zero', () => {
    const data = [
      bar(0, 50, 0),
      bar(1, 51, 100),
      bar(2, 52, 100),
      bar(3, 53, 50),
    ];
    expect(computeLineVroc(data, 3)[3]).toBeNull();
  });

  it('yields null when a bar has a non-finite volume', () => {
    const data = [
      bar(0, 50, 100),
      bar(1, 51, 100),
      bar(2, 52, 100),
      { x: 3, close: 53, volume: Number.NaN },
    ];
    expect(computeLineVroc(data, 3)[3]).toBeNull();
  });

  it('responds to the period', () => {
    const fast = computeLineVroc(WAVE_DATA, 2);
    const slow = computeLineVroc(WAVE_DATA, 5);
    expect(fast).not.toEqual(slow);
  });
});

describe('classifyLineVrocZone', () => {
  it('classifies a positive VROC as up', () => {
    expect(classifyLineVrocZone(50)).toBe('up');
  });

  it('classifies a negative VROC as down', () => {
    expect(classifyLineVrocZone(-25)).toBe('down');
  });

  it('classifies a zero VROC as flat', () => {
    expect(classifyLineVrocZone(0)).toBe('flat');
  });

  it('classifies a null VROC as none', () => {
    expect(classifyLineVrocZone(null)).toBe('none');
  });

  it('classifies a non-finite VROC as none', () => {
    expect(classifyLineVrocZone(Number.NaN)).toBe('none');
  });
});

describe('runLineVroc', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(runLineVroc([bar(0, 50, 100)]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineVroc([]).ok).toBe(false);
    expect(runLineVroc(null).ok).toBe(false);
  });

  it('is ok for a series of at least two bars', () => {
    expect(runLineVroc(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period when none is given', () => {
    expect(runLineVroc(WAVE_DATA).period).toBe(
      DEFAULT_CHART_LINE_VROC_PERIOD,
    );
  });

  it('honours a custom period', () => {
    expect(runLineVroc(WAVE_DATA, { period: 8 }).period).toBe(8);
  });

  it('counts a constant-volume series wholly flat', () => {
    const run = runLineVroc(CONST_DATA, OPTS);
    expect(run.flatCount).toBe(5);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('counts a doubling-volume series wholly positive', () => {
    const run = runLineVroc(DOUBLE_DATA, OPTS);
    expect(run.upCount).toBe(5);
    expect(run.downCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('counts a halving-volume series wholly negative', () => {
    const run = runLineVroc(HALF_DATA, OPTS);
    expect(run.downCount).toBe(5);
    expect(run.upCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('classifies the mixed fixture zones', () => {
    const run = runLineVroc(MIXED_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual([
      'none',
      'none',
      'none',
      'up',
      'up',
      'down',
      'up',
      'down',
    ]);
  });

  it('carries the prior volume on each sample', () => {
    const run = runLineVroc(MIXED_DATA, OPTS);
    expect(run.samples[3]!.priorVolume).toBe(100);
    expect(run.samples[6]!.priorVolume).toBe(150);
  });

  it('emits one sample per bar', () => {
    const run = runLineVroc(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineVroc(
      [bar(3, 53, 100), bar(1, 51, 100), bar(2, 52, 100)],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final VROC reading', () => {
    const run = runLineVroc(DOUBLE_DATA, OPTS);
    expect(run.vrocFinal).toBe(100);
  });
});

describe('computeLineVrocLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineVrocLayout({
      data: [bar(0, 50, 100)],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineVrocLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineVrocLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the VROC panel', () => {
    const layout = computeLineVrocLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.vrocPanelTop);
  });

  it('builds a price path and a VROC path', () => {
    const layout = computeLineVrocLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.vrocPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineVrocLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite VROC bar', () => {
    const layout = computeLineVrocLayout({ data: WAVE_DATA, ...OPTS });
    const finiteVroc = layout.run.vroc.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(finiteVroc);
  });

  it('keeps zero inside the VROC domain', () => {
    const layout = computeLineVrocLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.vrocMin).toBeLessThanOrEqual(0);
    expect(layout.vrocMax).toBeGreaterThanOrEqual(0);
  });

  it('places the zero line inside the VROC panel', () => {
    const layout = computeLineVrocLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.vrocPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.vrocPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineVrocLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineVrocChart', () => {
  it('names the Volume Rate of Change', () => {
    expect(describeLineVrocChart(WAVE_DATA, OPTS)).toContain(
      'Volume Rate of Change',
    );
  });

  it('mentions the percent change', () => {
    expect(describeLineVrocChart(WAVE_DATA, OPTS)).toContain('percent change');
  });

  it('mentions the lookback', () => {
    expect(describeLineVrocChart(WAVE_DATA, OPTS)).toContain('lookback');
  });

  it('reports the zone counts', () => {
    const run = runLineVroc(WAVE_DATA, OPTS);
    const text = describeLineVrocChart(WAVE_DATA, OPTS);
    expect(text).toContain(`positive on ${run.upCount}`);
    expect(text).toContain(`negative on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineVrocChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineVroc />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain(
      'Volume Rate of Change',
    );
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-vroc-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Volume Rate of Change');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(<ChartLineVroc data={[]} {...OPTS} />);
    const empty = container.querySelector(
      '[data-section="chart-line-vroc-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and bar count on the root', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-vroc"]');
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    const svg = container.querySelector(
      '[data-section="chart-line-vroc-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price and VROC lines', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-vroc-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vroc-vroc-line"]'),
    ).not.toBeNull();
  });

  it('draws the zero line', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-vroc-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per finite VROC bar', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    const run = runLineVroc(WAVE_DATA, OPTS);
    const finiteVroc = run.vroc.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vroc-marker"]',
    );
    expect(markers).toHaveLength(finiteVroc);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vroc-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-vroc-panel-label"]',
    );
    const texts = Array.from(labels).map((n) => n.textContent);
    expect(texts).toContain('Close');
    expect(texts).toContain('Volume Rate of Change');
  });

  it('renders the config badge', () => {
    const { container } = render(<ChartLineVroc data={WAVE_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-vroc-badge-config"]',
    );
    expect(badge?.textContent).toBe('VROC 3');
  });

  it('hides the VROC line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineVroc data={WAVE_DATA} {...OPTS} hiddenSeries={['vroc']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-vroc-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineVroc
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vroc-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineVrocSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVroc ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-vroc');
  });
});
