import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineSnr,
  type ChartLineSnrPoint,
  type ChartLineSnrSample,
  DEFAULT_CHART_LINE_SNR_PERIOD,
  getLineSnrFinitePoints,
  normalizeLineSnrPeriod,
  computeLineSnrDb,
  computeLineSnrRange,
  computeLineSnrSma,
  classifyLineSnrZone,
  computeLineSnr,
  runLineSnr,
  computeLineSnrLayout,
  describeLineSnrChart,
} from './chart-line-snr';

const bar = (
  x: number,
  high: number,
  low: number,
): ChartLineSnrPoint => ({ x, high, low });

/** Eight bars with a constant range of 20 -- the SNR reads exactly 0. */
const CONST_DATA: ChartLineSnrPoint[] = Array.from({ length: 8 }, (_, i) =>
  bar(i, 60, 40),
);

/**
 * Ranges that climb 2, 3, 4, 5, 6, 7, 8, 9. Every current range tops the
 * average of the prior two and itself, so the SNR runs positive.
 */
const UP_RANGE_DATA: ChartLineSnrPoint[] = [
  bar(0, 10, 8),
  bar(1, 11, 8),
  bar(2, 12, 8),
  bar(3, 13, 8),
  bar(4, 14, 8),
  bar(5, 15, 8),
  bar(6, 16, 8),
  bar(7, 17, 8),
];

/**
 * Ranges that decay 9, 8, 7, 6, 5, 4, 3, 2. Every current range sits
 * below the average of the prior two and itself, so the SNR runs
 * negative.
 */
const DOWN_RANGE_DATA: ChartLineSnrPoint[] = [
  bar(0, 17, 8),
  bar(1, 16, 8),
  bar(2, 15, 8),
  bar(3, 14, 8),
  bar(4, 13, 8),
  bar(5, 12, 8),
  bar(6, 11, 8),
  bar(7, 10, 8),
];

/** Twenty-four varying bars for the structural and render checks. */
const WAVE_HIGH = [
  60, 63, 67, 65, 62, 58, 55, 59, 64, 68, 66, 61, 57, 54, 58, 63, 67, 70, 66,
  62, 58, 61, 65, 69,
];
const WAVE_LOW = [
  40, 42, 45, 44, 41, 38, 36, 39, 43, 46, 45, 41, 38, 35, 38, 42, 45, 47, 44,
  41, 38, 40, 43, 46,
];
const WAVE_DATA: ChartLineSnrPoint[] = WAVE_HIGH.map((h, i) =>
  bar(i, h, WAVE_LOW[i]!),
);

const OPTS = { period: 3 };

describe('getLineSnrFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineSnrFinitePoints(null)).toEqual([]);
    expect(
      getLineSnrFinitePoints(undefined as unknown as ChartLineSnrPoint[]),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineSnrFinitePoints([])).toEqual([]);
  });

  it('drops bars with a non-finite x, high or low', () => {
    const dirty = [
      bar(0, 60, 40),
      { x: Number.NaN, high: 60, low: 40 },
      { x: 2, high: Number.POSITIVE_INFINITY, low: 40 },
      { x: 3, high: 60, low: Number.NaN },
      bar(4, 62, 42),
    ] as ChartLineSnrPoint[];
    expect(getLineSnrFinitePoints(dirty).map((b) => b.x)).toEqual([0, 4]);
  });

  it('preserves the input order', () => {
    const out = getLineSnrFinitePoints([
      bar(5, 60, 40),
      bar(2, 61, 41),
      bar(9, 62, 42),
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineSnrPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineSnrPeriod(14, 3)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineSnrPeriod(12.7, 3)).toBe(12);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineSnrPeriod(0, 3)).toBe(3);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineSnrPeriod(-5, 3)).toBe(3);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineSnrPeriod(Number.NaN, 3)).toBe(3);
  });
});

describe('computeLineSnrDb', () => {
  it('reads zero when value equals reference', () => {
    expect(computeLineSnrDb(1, 1)).toBe(0);
    expect(computeLineSnrDb(50, 50)).toBe(0);
  });

  it('reads ten decibels at a ten-to-one ratio', () => {
    expect(computeLineSnrDb(10, 1)).toBeCloseTo(10);
  });

  it('reads twenty decibels at a hundred-to-one ratio', () => {
    expect(computeLineSnrDb(100, 1)).toBeCloseTo(20);
  });

  it('reads minus ten decibels at a one-to-ten ratio', () => {
    expect(computeLineSnrDb(1, 10)).toBeCloseTo(-10);
  });

  it('yields null for a zero reference', () => {
    expect(computeLineSnrDb(5, 0)).toBeNull();
  });

  it('yields null for a zero value', () => {
    expect(computeLineSnrDb(0, 5)).toBeNull();
  });

  it('yields null for a non-finite input', () => {
    expect(computeLineSnrDb(Number.NaN, 5)).toBeNull();
    expect(computeLineSnrDb(5, Number.NaN)).toBeNull();
  });
});

describe('computeLineSnrRange', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSnrRange(null)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineSnrRange(WAVE_DATA)).toHaveLength(WAVE_DATA.length);
  });

  it('takes the high minus the low per bar', () => {
    expect(computeLineSnrRange([bar(0, 12, 5)])).toEqual([7]);
  });

  it('reads the constant range across a flat fixture', () => {
    expect(computeLineSnrRange(CONST_DATA)).toEqual([
      20, 20, 20, 20, 20, 20, 20, 20,
    ]);
  });

  it('yields null for a bar with a non-finite high or low', () => {
    expect(
      computeLineSnrRange([
        { x: 0, high: Number.NaN, low: 10 },
      ] as ChartLineSnrPoint[])[0],
    ).toBeNull();
  });
});

describe('computeLineSnrSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSnrSma(null, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineSnrSma([1, 2, 3, 4, 5], 3)).toHaveLength(5);
  });

  it('leaves the warm-up window null', () => {
    const sma = computeLineSnrSma([4, 8, 12, 16], 3);
    expect(sma[0]).toBeNull();
    expect(sma[1]).toBeNull();
  });

  it('averages the trailing window', () => {
    expect(computeLineSnrSma([4, 8, 12, 16], 3)[3]).toBe(12);
  });
});

describe('classifyLineSnrZone', () => {
  it('classifies a positive SNR as up', () => {
    expect(classifyLineSnrZone(2)).toBe('up');
  });

  it('classifies a negative SNR as down', () => {
    expect(classifyLineSnrZone(-2)).toBe('down');
  });

  it('classifies a zero SNR as flat', () => {
    expect(classifyLineSnrZone(0)).toBe('flat');
  });

  it('classifies a null SNR as none', () => {
    expect(classifyLineSnrZone(null)).toBe('none');
  });

  it('classifies a non-finite SNR as none', () => {
    expect(classifyLineSnrZone(Number.NaN)).toBe('none');
  });
});

describe('computeLineSnr', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineSnr(null, OPTS)).toEqual({
      range: [],
      avgRange: [],
      snr: [],
    });
  });

  it('matches the input length on every array', () => {
    const out = computeLineSnr(WAVE_DATA, OPTS);
    expect(out.range).toHaveLength(WAVE_DATA.length);
    expect(out.avgRange).toHaveLength(WAVE_DATA.length);
    expect(out.snr).toHaveLength(WAVE_DATA.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineSnr(WAVE_DATA, OPTS);
    expect(out.snr[0]).toBeNull();
    expect(out.snr[1]).toBeNull();
  });

  it('reads exactly zero decibels across a constant-range series', () => {
    expect(computeLineSnr(CONST_DATA, OPTS).snr).toEqual([
      null,
      null,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it('reads positive on a rising-range series', () => {
    const out = computeLineSnr(UP_RANGE_DATA, OPTS);
    for (let i = 2; i < out.snr.length; i += 1) {
      const v = out.snr[i];
      expect(v).not.toBeNull();
      expect(v as number).toBeGreaterThan(0);
    }
  });

  it('reads negative on a falling-range series', () => {
    const out = computeLineSnr(DOWN_RANGE_DATA, OPTS);
    for (let i = 2; i < out.snr.length; i += 1) {
      const v = out.snr[i];
      expect(v).not.toBeNull();
      expect(v as number).toBeLessThan(0);
    }
  });

  it('keeps every defined SNR finite', () => {
    const out = computeLineSnr(WAVE_DATA, OPTS);
    for (const v of out.snr) {
      if (v !== null) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('yields null when the average range is zero', () => {
    const data: ChartLineSnrPoint[] = Array.from({ length: 4 }, (_, i) =>
      bar(i, 50, 50),
    );
    const out = computeLineSnr(data, OPTS);
    expect(out.snr[3]).toBeNull();
  });
});

describe('runLineSnr', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(runLineSnr([bar(0, 60, 40)]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineSnr([]).ok).toBe(false);
    expect(runLineSnr(null).ok).toBe(false);
  });

  it('is ok for a series of at least two bars', () => {
    expect(runLineSnr(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period when none is given', () => {
    expect(runLineSnr(WAVE_DATA).period).toBe(DEFAULT_CHART_LINE_SNR_PERIOD);
  });

  it('honours a custom period', () => {
    expect(runLineSnr(WAVE_DATA, { period: 8 }).period).toBe(8);
  });

  it('counts a constant-range series wholly flat', () => {
    const run = runLineSnr(CONST_DATA, OPTS);
    expect(run.flatCount).toBe(6);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('counts a rising-range series wholly positive', () => {
    const run = runLineSnr(UP_RANGE_DATA, OPTS);
    expect(run.upCount).toBe(6);
    expect(run.downCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('counts a falling-range series wholly negative', () => {
    const run = runLineSnr(DOWN_RANGE_DATA, OPTS);
    expect(run.downCount).toBe(6);
    expect(run.upCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineSnr(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.zone);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineSnr(WAVE_DATA, OPTS);
    const noneCount = run.samples.filter((s) => s.zone === 'none').length;
    expect(run.upCount + run.downCount + run.flatCount + noneCount).toBe(
      run.series.length,
    );
  });

  it('carries the bar midpoint and range on each sample', () => {
    const run = runLineSnr(UP_RANGE_DATA, OPTS);
    expect(run.samples[3]!.midpoint).toBe((13 + 8) / 2);
    expect(run.samples[3]!.range).toBe(5);
  });

  it('emits one sample per bar', () => {
    const run = runLineSnr(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineSnr(
      [bar(3, 63, 43), bar(1, 61, 41), bar(2, 62, 42)],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final SNR reading', () => {
    const run = runLineSnr(CONST_DATA, OPTS);
    expect(run.snrFinal).toBe(0);
  });
});

describe('computeLineSnrLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineSnrLayout({
      data: [bar(0, 60, 40)],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineSnrLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineSnrLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the SNR panel', () => {
    const layout = computeLineSnrLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.snrPanelTop);
  });

  it('builds a price path and an SNR path', () => {
    const layout = computeLineSnrLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.snrPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineSnrLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per finite SNR bar', () => {
    const layout = computeLineSnrLayout({ data: WAVE_DATA, ...OPTS });
    const finite = layout.run.snr.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(finite);
  });

  it('keeps zero inside the SNR domain', () => {
    const layout = computeLineSnrLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.snrMin).toBeLessThanOrEqual(0);
    expect(layout.snrMax).toBeGreaterThanOrEqual(0);
  });

  it('places the zero line inside the SNR panel', () => {
    const layout = computeLineSnrLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.snrPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.snrPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineSnrLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineSnrChart', () => {
  it('names the Signal to Noise Ratio', () => {
    expect(describeLineSnrChart(WAVE_DATA, OPTS)).toContain(
      'Signal to Noise Ratio',
    );
  });

  it('mentions the decibel ratio', () => {
    expect(describeLineSnrChart(WAVE_DATA, OPTS)).toContain('decibel ratio');
  });

  it('mentions the rolling average', () => {
    expect(describeLineSnrChart(WAVE_DATA, OPTS)).toContain('rolling average');
  });

  it('reports the zone counts', () => {
    const run = runLineSnr(WAVE_DATA, OPTS);
    const text = describeLineSnrChart(WAVE_DATA, OPTS);
    expect(text).toContain(`positive on ${run.upCount}`);
    expect(text).toContain(`negative on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineSnrChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineSnr />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain(
      'Signal to Noise Ratio',
    );
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-snr-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Signal to Noise Ratio');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(<ChartLineSnr data={[]} {...OPTS} />);
    const empty = container.querySelector(
      '[data-section="chart-line-snr-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period and bar count on the root', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-snr"]');
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    const svg = container.querySelector(
      '[data-section="chart-line-snr-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price and SNR lines', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-snr-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-snr-snr-line"]'),
    ).not.toBeNull();
  });

  it('draws the zero line', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-snr-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per finite SNR bar', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    const run = runLineSnr(WAVE_DATA, OPTS);
    const finite = run.snr.filter((v) => v !== null).length;
    const markers = container.querySelectorAll(
      '[data-section="chart-line-snr-marker"]',
    );
    expect(markers).toHaveLength(finite);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-snr-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-snr-panel-label"]',
    );
    const texts = Array.from(labels).map((n) => n.textContent);
    expect(texts).toContain('Midpoint');
    expect(texts).toContain('Signal to Noise Ratio');
  });

  it('renders the config badge', () => {
    const { container } = render(<ChartLineSnr data={WAVE_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-snr-badge-config"]',
    );
    expect(badge?.textContent).toBe('SNR 3');
  });

  it('hides the SNR line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineSnr data={WAVE_DATA} {...OPTS} hiddenSeries={['snr']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-snr-snr-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSnr
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-snr-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineSnrSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSnr ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-snr');
  });
});
