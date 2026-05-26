import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineVfi,
  type ChartLineVfiPoint,
  type ChartLineVfiSample,
  DEFAULT_CHART_LINE_VFI_PERIOD,
  getLineVfiFinitePoints,
  normalizeLineVfiPeriod,
  computeLineVfiTypical,
  computeLineVfiSignedVolume,
  classifyLineVfiZone,
  computeLineVfi,
  runLineVfi,
  computeLineVfiLayout,
  describeLineVfiChart,
} from './chart-line-vfi';

const bar = (
  x: number,
  close: number,
  volume: number,
): ChartLineVfiPoint => ({
  x,
  high: close + 1,
  low: close - 1,
  close,
  volume,
});

/** Eight bars with a strictly rising typical, so every bar is an up bar. */
const UP_VOLS = [100, 150, 200, 120, 180, 140, 160, 200];
const UP_DATA: ChartLineVfiPoint[] = [10, 12, 14, 16, 18, 20, 22, 24].map(
  (c, i) => bar(i, c, UP_VOLS[i]!),
);

/** Eight bars with a strictly falling typical, so every bar is a down bar. */
const DOWN_VOLS = [100, 150, 200, 120, 180, 140, 160, 200];
const DOWN_DATA: ChartLineVfiPoint[] = [24, 22, 20, 18, 16, 14, 12, 10].map(
  (c, i) => bar(i, c, DOWN_VOLS[i]!),
);

/** Eight constant bars: no typical change, so the indicator stays at zero. */
const FLAT_VOLS = [100, 150, 200, 120, 180, 140, 160, 200];
const FLAT_DATA: ChartLineVfiPoint[] = Array.from({ length: 8 }, (_, i) =>
  bar(i, 50, FLAT_VOLS[i]!),
);

/** Alternating closes and volumes giving an exact integer VFI series. */
const MIXED_CLOSES = [10, 12, 11, 13, 11, 14, 12, 15];
const MIXED_VOLS = [100, 200, 100, 200, 100, 200, 100, 200];
const MIXED_DATA: ChartLineVfiPoint[] = MIXED_CLOSES.map((c, i) =>
  bar(i, c, MIXED_VOLS[i]!),
);

/** Twenty-four varying bars for the structural and render checks. */
const WAVE_CLOSES = [
  50, 53, 57, 60, 58, 54, 49, 46, 48, 52, 57, 60, 58, 53, 49, 47, 50, 54, 58,
  61, 59, 55, 51, 48,
];
const WAVE_VOLS = [
  100, 150, 200, 120, 180, 140, 160, 200, 110, 170, 130, 190, 150, 210, 120,
  180, 140, 200, 160, 130, 170, 110, 190, 150,
];
const WAVE_DATA: ChartLineVfiPoint[] = WAVE_CLOSES.map((c, i) =>
  bar(i, c, WAVE_VOLS[i]!),
);

const OPTS = { period: 3 };

describe('getLineVfiFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineVfiFinitePoints(null)).toEqual([]);
    expect(
      getLineVfiFinitePoints(undefined as unknown as ChartLineVfiPoint[]),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineVfiFinitePoints([])).toEqual([]);
  });

  it('drops bars with any non-finite field', () => {
    const dirty = [
      bar(0, 50, 100),
      { x: 1, high: 51, low: 49, close: Number.NaN, volume: 100 },
      { x: 2, high: 52, low: 50, close: 51, volume: Number.POSITIVE_INFINITY },
      bar(3, 53, 120),
    ] as ChartLineVfiPoint[];
    expect(getLineVfiFinitePoints(dirty).map((b) => b.x)).toEqual([0, 3]);
  });

  it('preserves the input order', () => {
    const out = getLineVfiFinitePoints([
      bar(5, 50, 100),
      bar(2, 51, 110),
      bar(9, 52, 120),
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineVfiPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineVfiPeriod(26, 3)).toBe(26);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineVfiPeriod(12.7, 3)).toBe(12);
  });

  it('falls back for a period below two', () => {
    expect(normalizeLineVfiPeriod(1, 3)).toBe(3);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineVfiPeriod(-5, 3)).toBe(3);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineVfiPeriod(Number.NaN, 3)).toBe(3);
  });
});

describe('computeLineVfiTypical', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineVfiTypical(null)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineVfiTypical(UP_DATA)).toHaveLength(UP_DATA.length);
  });

  it('averages the high, low and close per bar', () => {
    const out = computeLineVfiTypical([
      { x: 0, high: 12, low: 6, close: 9, volume: 100 },
    ]);
    expect(out[0]).toBe(9);
  });

  it('yields the close when the half-range cancels out', () => {
    expect(computeLineVfiTypical(UP_DATA)).toEqual([
      10, 12, 14, 16, 18, 20, 22, 24,
    ]);
  });

  it('yields null for a bar with a non-finite field', () => {
    const out = computeLineVfiTypical([
      { x: 0, high: Number.NaN, low: 10, close: 12, volume: 100 },
    ]);
    expect(out[0]).toBeNull();
  });
});

describe('computeLineVfiSignedVolume', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineVfiSignedVolume(null)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineVfiSignedVolume(UP_DATA)).toHaveLength(UP_DATA.length);
  });

  it('leaves the first bar null', () => {
    expect(computeLineVfiSignedVolume(UP_DATA)[0]).toBeNull();
  });

  it('signs the volume positive on a rising typical', () => {
    expect(computeLineVfiSignedVolume(UP_DATA)).toEqual([
      null,
      150,
      200,
      120,
      180,
      140,
      160,
      200,
    ]);
  });

  it('signs the volume negative on a falling typical', () => {
    expect(computeLineVfiSignedVolume(DOWN_DATA)).toEqual([
      null,
      -150,
      -200,
      -120,
      -180,
      -140,
      -160,
      -200,
    ]);
  });

  it('zeros the volume on a flat typical', () => {
    const out = computeLineVfiSignedVolume(FLAT_DATA);
    expect(out[0]).toBeNull();
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });
});

describe('classifyLineVfiZone', () => {
  it('classifies a positive VFI as up', () => {
    expect(classifyLineVfiZone(40)).toBe('up');
  });

  it('classifies a negative VFI as down', () => {
    expect(classifyLineVfiZone(-40)).toBe('down');
  });

  it('classifies a zero VFI as flat', () => {
    expect(classifyLineVfiZone(0)).toBe('flat');
  });

  it('classifies a null VFI as none', () => {
    expect(classifyLineVfiZone(null)).toBe('none');
  });

  it('classifies a non-finite VFI as none', () => {
    expect(classifyLineVfiZone(Number.NaN)).toBe('none');
  });
});

describe('computeLineVfi', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineVfi(null, OPTS)).toEqual({
      typical: [],
      signedVolume: [],
      vfi: [],
    });
  });

  it('matches the input length on every array', () => {
    const out = computeLineVfi(WAVE_DATA, OPTS);
    expect(out.typical).toHaveLength(WAVE_DATA.length);
    expect(out.signedVolume).toHaveLength(WAVE_DATA.length);
    expect(out.vfi).toHaveLength(WAVE_DATA.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineVfi(UP_DATA, OPTS);
    expect(out.vfi[0]).toBeNull();
    expect(out.vfi[1]).toBeNull();
    expect(out.vfi[2]).toBeNull();
  });

  it('pins to +100 across an all-up series', () => {
    expect(computeLineVfi(UP_DATA, OPTS).vfi).toEqual([
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

  it('pins to -100 across an all-down series', () => {
    expect(computeLineVfi(DOWN_DATA, OPTS).vfi).toEqual([
      null,
      null,
      null,
      -100,
      -100,
      -100,
      -100,
      -100,
    ]);
  });

  it('reads zero across a flat-typical series', () => {
    expect(computeLineVfi(FLAT_DATA, OPTS).vfi).toEqual([
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

  it('computes the exact integer VFI of the mixed fixture', () => {
    expect(computeLineVfi(MIXED_DATA, OPTS).vfi).toEqual([
      null,
      null,
      null,
      60,
      0,
      60,
      0,
      60,
    ]);
  });

  it('keeps the VFI bounded to plus or minus 100', () => {
    const out = computeLineVfi(WAVE_DATA, OPTS);
    for (const v of out.vfi) {
      if (v !== null) expect(Math.abs(v)).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('keeps every defined VFI finite', () => {
    const out = computeLineVfi(WAVE_DATA, OPTS);
    for (const v of out.vfi) {
      if (v !== null) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('runLineVfi', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(runLineVfi([bar(0, 50, 100)]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineVfi([]).ok).toBe(false);
    expect(runLineVfi(null).ok).toBe(false);
  });

  it('is ok for a series of at least two bars', () => {
    expect(runLineVfi(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period when none is given', () => {
    expect(runLineVfi(WAVE_DATA).period).toBe(DEFAULT_CHART_LINE_VFI_PERIOD);
  });

  it('honours a custom period', () => {
    expect(runLineVfi(WAVE_DATA, { period: 8 }).period).toBe(8);
  });

  it('counts an all-up series wholly positive', () => {
    const run = runLineVfi(UP_DATA, OPTS);
    expect(run.upCount).toBe(5);
    expect(run.downCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('counts an all-down series wholly negative', () => {
    const run = runLineVfi(DOWN_DATA, OPTS);
    expect(run.downCount).toBe(5);
    expect(run.upCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('counts a flat-typical series wholly flat', () => {
    const run = runLineVfi(FLAT_DATA, OPTS);
    expect(run.flatCount).toBe(5);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('classifies the mixed fixture zones', () => {
    const run = runLineVfi(MIXED_DATA, OPTS);
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
    const run = runLineVfi(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.zone);
    }
  });

  it('emits one sample per bar', () => {
    const run = runLineVfi(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineVfi(
      [bar(3, 53, 100), bar(1, 51, 100), bar(2, 52, 100)],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final VFI reading', () => {
    const run = runLineVfi(UP_DATA, OPTS);
    expect(run.vfiFinal).toBe(100);
  });
});

describe('computeLineVfiLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineVfiLayout({
      data: [bar(0, 50, 100)],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineVfiLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineVfiLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the VFI panel', () => {
    const layout = computeLineVfiLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.vfiPanelTop);
  });

  it('builds a price path and a VFI path', () => {
    const layout = computeLineVfiLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.vfiPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineVfiLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite VFI bar', () => {
    const layout = computeLineVfiLayout({ data: WAVE_DATA, ...OPTS });
    const finiteVfi = layout.run.vfi.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(finiteVfi);
  });

  it('fixes the VFI panel band past plus or minus 100', () => {
    const layout = computeLineVfiLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.vfiMin).toBe(-110);
    expect(layout.vfiMax).toBe(110);
  });

  it('places the zero line inside the VFI panel', () => {
    const layout = computeLineVfiLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.vfiPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.vfiPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineVfiLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineVfiChart', () => {
  it('names the Markos Katsanos Volume Flow Indicator', () => {
    expect(describeLineVfiChart(WAVE_DATA, OPTS)).toContain(
      'Markos Katsanos Volume Flow Indicator',
    );
  });

  it('mentions the cumulative signed volume', () => {
    expect(describeLineVfiChart(WAVE_DATA, OPTS)).toContain(
      'cumulative signed volume',
    );
  });

  it('mentions the mean volume', () => {
    expect(describeLineVfiChart(WAVE_DATA, OPTS)).toContain('mean volume');
  });

  it('reports the zone counts', () => {
    const run = runLineVfi(WAVE_DATA, OPTS);
    const text = describeLineVfiChart(WAVE_DATA, OPTS);
    expect(text).toContain(`positive on ${run.upCount}`);
    expect(text).toContain(`negative on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineVfiChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineVfi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain(
      'Volume Flow Indicator',
    );
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-vfi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Volume Flow Indicator');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(<ChartLineVfi data={[]} {...OPTS} />);
    const empty = container.querySelector(
      '[data-section="chart-line-vfi-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and bar count on the root', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-vfi"]');
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    const svg = container.querySelector(
      '[data-section="chart-line-vfi-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price and VFI lines', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-vfi-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vfi-vfi-line"]'),
    ).not.toBeNull();
  });

  it('draws the zero line', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-vfi-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per finite VFI bar', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    const run = runLineVfi(WAVE_DATA, OPTS);
    const finiteVfi = run.vfi.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vfi-marker"]',
    );
    expect(markers).toHaveLength(finiteVfi);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vfi-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-vfi-panel-label"]',
    );
    const texts = Array.from(labels).map((n) => n.textContent);
    expect(texts).toContain('Close');
    expect(texts).toContain('Volume Flow Indicator');
  });

  it('renders the config badge', () => {
    const { container } = render(<ChartLineVfi data={WAVE_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-vfi-badge-config"]',
    );
    expect(badge?.textContent).toBe('VFI 3');
  });

  it('hides the VFI line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineVfi data={WAVE_DATA} {...OPTS} hiddenSeries={['vfi']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vfi-vfi-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineVfi
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vfi-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineVfiSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVfi ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-vfi');
  });
});
