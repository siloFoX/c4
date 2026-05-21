import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineWavetrend,
  classifyLineWavetrendZone,
  computeLineWavetrend,
  computeLineWavetrendEma,
  computeLineWavetrendLayout,
  computeLineWavetrendSma,
  describeLineWavetrendChart,
  getLineWavetrendFinitePoints,
  normalizeLineWavetrendPeriod,
  runLineWavetrend,
  type ChartLineWavetrendPoint,
} from './chart-line-wavetrend';

/**
 * Fixtures:
 * - CONST: a flat series. The EMA baseline equals the price, the absolute
 *   deviation is zero, the average deviation is zero, the channel index is
 *   guarded to 0, so WT1 and WT2 are exactly 0.
 * - MIXED: a swinging close series for the run / component structural
 *   checks.
 */
const CONST_DATA: ChartLineWavetrendPoint[] = [
  { x: 1, value: 50 },
  { x: 2, value: 50 },
  { x: 3, value: 50 },
  { x: 4, value: 50 },
  { x: 5, value: 50 },
  { x: 6, value: 50 },
  { x: 7, value: 50 },
  { x: 8, value: 50 },
];
const CONST_VALUES = CONST_DATA.map((p) => p.value);

const MIXED_DATA: ChartLineWavetrendPoint[] = [
  { x: 1, value: 50 },
  { x: 2, value: 55 },
  { x: 3, value: 62 },
  { x: 4, value: 68 },
  { x: 5, value: 70 },
  { x: 6, value: 66 },
  { x: 7, value: 58 },
  { x: 8, value: 48 },
  { x: 9, value: 42 },
  { x: 10, value: 40 },
  { x: 11, value: 44 },
  { x: 12, value: 52 },
  { x: 13, value: 60 },
  { x: 14, value: 66 },
  { x: 15, value: 64 },
  { x: 16, value: 56 },
];
const OPTS = { channelLength: 3, averageLength: 3 };

describe('getLineWavetrendFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineWavetrendFinitePoints([
      { x: 1, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 3, value: Number.POSITIVE_INFINITY },
      { x: 4, value: 40 },
    ]);
    expect(out).toEqual([
      { x: 1, value: 10 },
      { x: 4, value: 40 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineWavetrendFinitePoints(null)).toEqual([]);
    expect(getLineWavetrendFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineWavetrendFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineWavetrendFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineWavetrendPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineWavetrendPeriod(20, 10)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineWavetrendPeriod(9.8, 10)).toBe(9);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineWavetrendPeriod(0, 10)).toBe(10);
    expect(normalizeLineWavetrendPeriod(-3, 10)).toBe(10);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineWavetrendPeriod(Number.NaN, 10)).toBe(10);
    expect(normalizeLineWavetrendPeriod('x', 10)).toBe(10);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineWavetrendPeriod(1, 10)).toBe(1);
  });
});

describe('computeLineWavetrendEma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWavetrendEma(null, 3)).toEqual([]);
  });

  it('is the exact dyadic EMA for a period-3 alpha of one half', () => {
    expect(computeLineWavetrendEma([4, 8, 16], 3)).toEqual([4, 6, 11]);
  });

  it('keeps a constant series constant', () => {
    expect(computeLineWavetrendEma([7, 7, 7, 7], 5)).toEqual([7, 7, 7, 7]);
  });

  it('carries the previous value across a null slot', () => {
    expect(computeLineWavetrendEma([null, null, 8], 3)).toEqual([
      null,
      null,
      8,
    ]);
  });

  it('matches the input length', () => {
    expect(computeLineWavetrendEma([1, 2, 3, 4, 5], 3)).toHaveLength(5);
  });
});

describe('computeLineWavetrendSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWavetrendSma(null, 2)).toEqual([]);
  });

  it('keeps the warm-up window null', () => {
    expect(computeLineWavetrendSma([10, 20, 30, 40], 2)[0]).toBeNull();
  });

  it('is the simple moving average of the window', () => {
    expect(computeLineWavetrendSma([10, 20, 30, 40], 2)).toEqual([
      null, 15, 25, 35,
    ]);
  });

  it('matches the input length', () => {
    expect(computeLineWavetrendSma([1, 2, 3, 4, 5], 4)).toHaveLength(5);
  });

  it('yields null for a window touching a null slot', () => {
    expect(computeLineWavetrendSma([10, null, 30, 40], 2)).toEqual([
      null,
      null,
      null,
      35,
    ]);
  });
});

describe('computeLineWavetrend', () => {
  it('returns empty arrays for a non-array input', () => {
    const out = computeLineWavetrend(null);
    expect(out.esa).toEqual([]);
    expect(out.wt1).toEqual([]);
    expect(out.wt2).toEqual([]);
  });

  it('matches every array to the input length', () => {
    const out = computeLineWavetrend(CONST_VALUES, OPTS);
    expect(out.esa).toHaveLength(CONST_VALUES.length);
    expect(out.d).toHaveLength(CONST_VALUES.length);
    expect(out.ci).toHaveLength(CONST_VALUES.length);
    expect(out.wt1).toHaveLength(CONST_VALUES.length);
    expect(out.wt2).toHaveLength(CONST_VALUES.length);
  });

  it('keeps the EMA baseline equal to a constant price', () => {
    expect(computeLineWavetrend(CONST_VALUES, OPTS).esa).toEqual([
      50, 50, 50, 50, 50, 50, 50, 50,
    ]);
  });

  it('produces a zero channel index for a constant series', () => {
    expect(
      computeLineWavetrend(CONST_VALUES, OPTS).ci.every((v) => v === 0),
    ).toBe(true);
  });

  it('holds WT1 at zero for a constant series', () => {
    expect(
      computeLineWavetrend(CONST_VALUES, OPTS).wt1.every((v) => v === 0),
    ).toBe(true);
  });

  it('holds WT2 at zero for a constant series', () => {
    const wt2 = computeLineWavetrend(CONST_VALUES, OPTS).wt2;
    const defined = wt2.filter((v) => v !== null);
    expect(defined.length).toBeGreaterThan(0);
    expect(defined.every((v) => v === 0)).toBe(true);
  });

  it('is the four-period SMA of WT1 for WT2', () => {
    const out = computeLineWavetrend(MIXED_DATA.map((p) => p.value), OPTS);
    expect(out.wt2).toEqual(computeLineWavetrendSma(out.wt1, 4));
  });

  it('keeps the WT2 warm-up window null', () => {
    const wt2 = computeLineWavetrend(MIXED_DATA.map((p) => p.value), OPTS).wt2;
    expect(wt2[0]).toBeNull();
    expect(wt2[2]).toBeNull();
    expect(wt2[3]).not.toBeNull();
  });

  it('defines WT1 from the first bar', () => {
    expect(
      computeLineWavetrend(MIXED_DATA.map((p) => p.value), OPTS).wt1[0],
    ).not.toBeNull();
  });

  it('keeps every WT1 reading finite for finite input', () => {
    for (const v of computeLineWavetrend(MIXED_DATA.map((p) => p.value), OPTS)
      .wt1) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('classifyLineWavetrendZone', () => {
  it('is overbought above the upper threshold', () => {
    expect(classifyLineWavetrendZone(80, 60, -60)).toBe('overbought');
  });

  it('is oversold below the lower threshold', () => {
    expect(classifyLineWavetrendZone(-80, 60, -60)).toBe('oversold');
  });

  it('is neutral between the thresholds', () => {
    expect(classifyLineWavetrendZone(10, 60, -60)).toBe('neutral');
  });

  it('is none for a null reading', () => {
    expect(classifyLineWavetrendZone(null, 60, -60)).toBe('none');
  });

  it('is none for a non-finite reading', () => {
    expect(classifyLineWavetrendZone(Number.NaN, 60, -60)).toBe('none');
  });
});

describe('runLineWavetrend', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineWavetrend([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineWavetrend(MIXED_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default options', () => {
    const run = runLineWavetrend(MIXED_DATA);
    expect(run.channelLength).toBe(10);
    expect(run.averageLength).toBe(21);
    expect(run.upperThreshold).toBe(60);
    expect(run.lowerThreshold).toBe(-60);
  });

  it('honours custom options', () => {
    const run = runLineWavetrend(MIXED_DATA, {
      ...OPTS,
      upperThreshold: 53,
      lowerThreshold: -53,
    });
    expect(run.channelLength).toBe(3);
    expect(run.upperThreshold).toBe(53);
    expect(run.lowerThreshold).toBe(-53);
  });

  it('holds WT1 at zero for a constant series', () => {
    const run = runLineWavetrend(CONST_DATA, OPTS);
    expect(run.wt1Final).toBe(0);
  });

  it('classifies a constant series as wholly neutral', () => {
    const run = runLineWavetrend(CONST_DATA, OPTS);
    expect(run.overboughtCount).toBe(0);
    expect(run.oversoldCount).toBe(0);
    expect(run.neutralCount).toBe(CONST_DATA.length);
  });

  it('emits one sample per point', () => {
    expect(runLineWavetrend(MIXED_DATA, OPTS).samples).toHaveLength(
      MIXED_DATA.length,
    );
  });

  it('classifies every bar into a valid zone', () => {
    const run = runLineWavetrend(MIXED_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['overbought', 'oversold', 'neutral', 'none']).toContain(
        sample.zone,
      );
    }
  });

  it('has self-consistent zone counts', () => {
    const run = runLineWavetrend(MIXED_DATA, OPTS);
    const defined = run.wt1.filter((v) => v !== null).length;
    expect(
      run.overboughtCount + run.oversoldCount + run.neutralCount,
    ).toBe(defined);
  });

  it('carries the pipeline arrays', () => {
    const run = runLineWavetrend(MIXED_DATA, OPTS);
    expect(run.esa).toHaveLength(MIXED_DATA.length);
    expect(run.wt1).toHaveLength(MIXED_DATA.length);
    expect(run.wt2).toHaveLength(MIXED_DATA.length);
  });

  it('sorts the input by x', () => {
    const shuffled = [...MIXED_DATA].reverse();
    const run = runLineWavetrend(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(MIXED_DATA.map((p) => p.x));
  });

  it('is not ok for an empty series', () => {
    expect(runLineWavetrend([], OPTS).ok).toBe(false);
    expect(runLineWavetrend(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineWavetrendLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineWavetrendLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineWavetrendLayout({
      data: MIXED_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineWavetrendLayout({ data: MIXED_DATA, ...OPTS }).ok).toBe(
      true,
    );
  });

  it('stacks the price panel above the WaveTrend panel', () => {
    const layout = computeLineWavetrendLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.wtPanelTop);
  });

  it('builds the price, WT1 and WT2 paths', () => {
    const layout = computeLineWavetrendLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.wt1Path.startsWith('M')).toBe(true);
    expect(layout.wt2Path.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineWavetrendLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(MIXED_DATA.length);
  });

  it('emits one marker per defined WT1 bar', () => {
    const layout = computeLineWavetrendLayout({ data: MIXED_DATA, ...OPTS });
    const defined = layout.run.wt1.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('places the upper threshold line above the lower', () => {
    const layout = computeLineWavetrendLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.upperY).toBeLessThan(layout.lowerY);
  });

  it('carries the run on the layout', () => {
    const layout = computeLineWavetrendLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.run.channelLength).toBe(3);
  });
});

describe('describeLineWavetrendChart', () => {
  it('names the indicator', () => {
    expect(describeLineWavetrendChart(MIXED_DATA, OPTS)).toContain(
      'WaveTrend Oscillator',
    );
  });

  it('mentions the smoothed deviation off the average', () => {
    const text = describeLineWavetrendChart(MIXED_DATA, OPTS);
    expect(text).toContain('smoothed deviation');
    expect(text).toContain('moving average');
  });

  it('reports the zone counts', () => {
    const run = runLineWavetrend(MIXED_DATA, OPTS);
    const text = describeLineWavetrendChart(MIXED_DATA, OPTS);
    expect(text).toContain(`overbought on ${run.overboughtCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineWavetrendChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineWavetrend component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineWavetrend data={MIXED_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-wavetrend-aria-desc"]',
    );
    expect(desc?.textContent).toContain('WaveTrend Oscillator');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineWavetrend data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-wavetrend-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run config', () => {
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-wavetrend"]',
    );
    expect(root?.getAttribute('data-channel-length')).toBe('3');
    expect(root?.getAttribute('data-average-length')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe('16');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineWavetrend data={MIXED_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price, WT1 and WT2 lines', () => {
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wavetrend-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-wavetrend-wt1-line"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-wavetrend-wt2-line"]'),
    ).toBeInTheDocument();
  });

  it('draws the zero line and the two threshold lines', () => {
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wavetrend-zero-line"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-wavetrend-threshold-line"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one marker per defined WT1 bar', () => {
    const run = runLineWavetrend(MIXED_DATA, OPTS);
    const defined = run.wt1.filter((v) => v !== null).length;
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-wavetrend-marker"]',
    );
    expect(markers).toHaveLength(defined);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} />,
    );
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-wavetrend-marker"]'),
    );
    for (const marker of markers) {
      expect(['overbought', 'oversold', 'neutral']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-wavetrend-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('shows the config badge', () => {
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-wavetrend-badge-config"]',
    );
    expect(badge?.textContent).toBe('WT 3/3');
  });

  it('hides the WT1 line when its legend item is toggled', () => {
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-wavetrend-legend-item"][data-series-id="wt1"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-wavetrend-wt1-line"]'),
    ).not.toBeInTheDocument();
  });

  it('hides the WT2 line when showWt2 is false', () => {
    const { container } = render(
      <ChartLineWavetrend data={MIXED_DATA} {...OPTS} showWt2={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wavetrend-wt2-line"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineWavetrend
        data={MIXED_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-wavetrend-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineWavetrend ref={ref} data={MIXED_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-wavetrend',
    );
  });
});
