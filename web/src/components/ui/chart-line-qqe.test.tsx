import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineQqe,
  computeLineQqe,
  computeLineQqeEma,
  computeLineQqeLayout,
  computeLineQqeRsi,
  computeLineQqeTrail,
  computeLineQqeWilder,
  describeLineQqeChart,
  getLineQqeFinitePoints,
  normalizeLineQqePeriod,
  runLineQqe,
  type ChartLineQqePoint,
} from './chart-line-qqe';

/**
 * Fixtures:
 * - TRAIL_RSI / TRAIL_DELTA: hand-traced inputs to the adaptive trailing
 *   band state machine. With a constant delta of 4 the band ratchets and
 *   the trend flips down at bar 4 and back up at bar 6, all in exact
 *   integer arithmetic.
 * - RISING / FALLING closes: monotone series pin the RSI at 100 or 0.
 * - CONST closes: a flat series leaves the RSI at 50, the ATR of the RSI
 *   at 0, so the QQE line is exactly 50 and the trend stays up.
 * - MIXED: a choppy series for the run / component structural checks.
 */
const TRAIL_RSI = [50, 54, 58, 56, 48, 44, 50, 56];
const TRAIL_DELTA = [4, 4, 4, 4, 4, 4, 4, 4];
const TRAIL_QQE_EXPECTED = [46, 50, 54, 54, 52, 48, 46, 52];
const TRAIL_TREND_EXPECTED = [1, 1, 1, 1, -1, -1, 1, 1];

const RISING_CLOSES = [10, 20, 30, 40, 50, 60];
const FALLING_CLOSES = [60, 50, 40, 30, 20, 10];
const CONST_CLOSES = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50];

const MIXED_DATA: ChartLineQqePoint[] = [
  { x: 1, value: 50 },
  { x: 2, value: 55 },
  { x: 3, value: 48 },
  { x: 4, value: 58 },
  { x: 5, value: 46 },
  { x: 6, value: 60 },
  { x: 7, value: 44 },
  { x: 8, value: 62 },
  { x: 9, value: 48 },
  { x: 10, value: 56 },
  { x: 11, value: 42 },
  { x: 12, value: 58 },
  { x: 13, value: 50 },
  { x: 14, value: 54 },
  { x: 15, value: 46 },
  { x: 16, value: 60 },
  { x: 17, value: 48 },
  { x: 18, value: 56 },
];
const OPTS = { rsiPeriod: 3, smoothPeriod: 3, wilderPeriod: 5 };

describe('getLineQqeFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineQqeFinitePoints([
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
    expect(getLineQqeFinitePoints(null)).toEqual([]);
    expect(getLineQqeFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineQqeFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineQqeFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineQqePeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineQqePeriod(20, 14)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineQqePeriod(9.8, 14)).toBe(9);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineQqePeriod(0, 14)).toBe(14);
    expect(normalizeLineQqePeriod(-3, 14)).toBe(14);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineQqePeriod(Number.NaN, 14)).toBe(14);
    expect(normalizeLineQqePeriod('x', 14)).toBe(14);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineQqePeriod(1, 14)).toBe(1);
  });
});

describe('computeLineQqeEma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineQqeEma(null, 3)).toEqual([]);
  });

  it('is the exact dyadic EMA for a period-3 alpha of one half', () => {
    expect(computeLineQqeEma([4, 8, 16], 3)).toEqual([4, 6, 11]);
  });

  it('keeps a constant series constant', () => {
    expect(computeLineQqeEma([7, 7, 7, 7], 5)).toEqual([7, 7, 7, 7]);
  });

  it('carries the previous value across a null slot', () => {
    expect(computeLineQqeEma([null, null, 8], 3)).toEqual([null, null, 8]);
  });
});

describe('computeLineQqeWilder', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineQqeWilder(null, 2)).toEqual([]);
  });

  it('is the exact dyadic smoothing for a period-2 alpha of one half', () => {
    expect(computeLineQqeWilder([4, 8, 16], 2)).toEqual([4, 6, 11]);
  });

  it('keeps a constant series constant', () => {
    expect(computeLineQqeWilder([0, 0, 0, 0], 5)).toEqual([0, 0, 0, 0]);
  });

  it('matches the input length', () => {
    expect(computeLineQqeWilder([1, 2, 3, 4, 5], 5)).toHaveLength(5);
  });
});

describe('computeLineQqeRsi', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineQqeRsi(null, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineQqeRsi(RISING_CLOSES, 3)).toHaveLength(
      RISING_CLOSES.length,
    );
  });

  it('pins at 100 for a strictly rising series', () => {
    expect(computeLineQqeRsi(RISING_CLOSES, 3)).toEqual([
      null,
      null,
      null,
      100,
      100,
      100,
    ]);
  });

  it('pins at 0 for a strictly falling series', () => {
    expect(computeLineQqeRsi(FALLING_CLOSES, 3)).toEqual([
      null,
      null,
      null,
      0,
      0,
      0,
    ]);
  });

  it('reads 50 for a flat series', () => {
    const rsi = computeLineQqeRsi(CONST_CLOSES, 3);
    expect(rsi[3]).toBe(50);
  });

  it('is all null when the series is too short', () => {
    expect(computeLineQqeRsi([10, 20, 30], 3)).toEqual([null, null, null]);
  });
});

describe('computeLineQqeTrail', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineQqeTrail(null, TRAIL_DELTA)).toEqual({
      qqeLine: [],
      trend: [],
    });
  });

  it('matches the qqeLine length to the input', () => {
    expect(computeLineQqeTrail(TRAIL_RSI, TRAIL_DELTA).qqeLine).toHaveLength(
      TRAIL_RSI.length,
    );
  });

  it('matches the trend length to the input', () => {
    expect(computeLineQqeTrail(TRAIL_RSI, TRAIL_DELTA).trend).toHaveLength(
      TRAIL_RSI.length,
    );
  });

  it('computes the exact trailing QQE line', () => {
    expect(computeLineQqeTrail(TRAIL_RSI, TRAIL_DELTA).qqeLine).toEqual(
      TRAIL_QQE_EXPECTED,
    );
  });

  it('computes the exact trend sequence', () => {
    expect(computeLineQqeTrail(TRAIL_RSI, TRAIL_DELTA).trend).toEqual(
      TRAIL_TREND_EXPECTED,
    );
  });

  it('starts in an uptrend', () => {
    expect(computeLineQqeTrail(TRAIL_RSI, TRAIL_DELTA).trend[0]).toBe(1);
  });

  it('flips the trend down when the smoothed RSI drops below the long band', () => {
    const trail = computeLineQqeTrail(TRAIL_RSI, TRAIL_DELTA);
    expect(trail.trend[3]).toBe(1);
    expect(trail.trend[4]).toBe(-1);
  });

  it('flips the trend up when the smoothed RSI tops the short band', () => {
    const trail = computeLineQqeTrail(TRAIL_RSI, TRAIL_DELTA);
    expect(trail.trend[5]).toBe(-1);
    expect(trail.trend[6]).toBe(1);
  });

  it('follows the long band below the RSI in an uptrend', () => {
    const trail = computeLineQqeTrail(TRAIL_RSI, TRAIL_DELTA);
    expect(trail.qqeLine[2]!).toBeLessThan(TRAIL_RSI[2]!);
  });

  it('skips the leading null slots', () => {
    const trail = computeLineQqeTrail(
      [null, null, 50, 54],
      [null, null, 4, 4],
    );
    expect(trail.qqeLine).toEqual([null, null, 46, 50]);
    expect(trail.trend).toEqual([0, 0, 1, 1]);
  });
});

describe('computeLineQqe', () => {
  it('returns empty arrays for a non-array input', () => {
    const out = computeLineQqe(null);
    expect(out.rsi).toEqual([]);
    expect(out.qqeLine).toEqual([]);
    expect(out.trend).toEqual([]);
  });

  it('matches every array to the input length', () => {
    const out = computeLineQqe(CONST_CLOSES, OPTS);
    expect(out.rsi).toHaveLength(CONST_CLOSES.length);
    expect(out.rsiMa).toHaveLength(CONST_CLOSES.length);
    expect(out.qqeLine).toHaveLength(CONST_CLOSES.length);
    expect(out.trend).toHaveLength(CONST_CLOSES.length);
  });

  it('holds the QQE line at 50 for a flat series', () => {
    const out = computeLineQqe(CONST_CLOSES, OPTS);
    const defined = out.qqeLine.filter((v) => v !== null);
    expect(defined.length).toBeGreaterThan(0);
    expect(defined.every((v) => v === 50)).toBe(true);
  });

  it('keeps the trend up for a flat series', () => {
    const out = computeLineQqe(CONST_CLOSES, OPTS);
    const defined = out.trend.filter((t) => t !== 0);
    expect(defined.length).toBeGreaterThan(0);
    expect(defined.every((t) => t === 1)).toBe(true);
  });

  it('smooths the RSI with an EMA', () => {
    const out = computeLineQqe(CONST_CLOSES, OPTS);
    expect(out.rsiMa).toEqual(computeLineQqeEma(out.rsi, 3));
  });

  it('keeps every trend value in the valid set', () => {
    const out = computeLineQqe(MIXED_DATA.map((p) => p.value), OPTS);
    for (const t of out.trend) {
      expect([1, -1, 0]).toContain(t);
    }
  });

  it('keeps the warm-up RSI null', () => {
    expect(computeLineQqe(CONST_CLOSES, OPTS).rsi[0]).toBeNull();
  });

  it('derives the band width from the ATR of the RSI', () => {
    const out = computeLineQqe(MIXED_DATA.map((p) => p.value), OPTS);
    expect(out.atrRsi).toHaveLength(MIXED_DATA.length);
    expect(out.delta).toHaveLength(MIXED_DATA.length);
  });
});

describe('runLineQqe', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineQqe([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineQqe(MIXED_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default options', () => {
    const run = runLineQqe(MIXED_DATA);
    expect(run.rsiPeriod).toBe(14);
    expect(run.smoothPeriod).toBe(5);
    expect(run.wilderPeriod).toBe(27);
    expect(run.factor).toBeCloseTo(4.236, 5);
  });

  it('honours custom options', () => {
    const run = runLineQqe(MIXED_DATA, { ...OPTS, factor: 3 });
    expect(run.rsiPeriod).toBe(3);
    expect(run.smoothPeriod).toBe(3);
    expect(run.factor).toBe(3);
  });

  it('emits one sample per point', () => {
    expect(runLineQqe(MIXED_DATA, OPTS).samples).toHaveLength(
      MIXED_DATA.length,
    );
  });

  it('classifies every bar into a valid zone', () => {
    const run = runLineQqe(MIXED_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'none']).toContain(sample.zone);
    }
  });

  it('has self-consistent trend counts', () => {
    const run = runLineQqe(MIXED_DATA, OPTS);
    const trended = run.samples.filter((s) => s.trend !== 0).length;
    expect(run.upCount + run.downCount).toBe(trended);
  });

  it('keeps a flat series wholly in an uptrend', () => {
    const flat = CONST_CLOSES.map((value, i) => ({ x: i, value }));
    const run = runLineQqe(flat, OPTS);
    expect(run.downCount).toBe(0);
    expect(run.upCount).toBeGreaterThan(0);
  });

  it('reports the final trend', () => {
    expect([1, -1, 0]).toContain(runLineQqe(MIXED_DATA, OPTS).trendFinal);
  });

  it('carries the rsi and qqe arrays', () => {
    const run = runLineQqe(MIXED_DATA, OPTS);
    expect(run.rsiMa).toHaveLength(MIXED_DATA.length);
    expect(run.qqeLine).toHaveLength(MIXED_DATA.length);
  });

  it('sorts the input by x', () => {
    const shuffled = [...MIXED_DATA].reverse();
    const run = runLineQqe(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(MIXED_DATA.map((p) => p.x));
  });

  it('is not ok for an empty series', () => {
    expect(runLineQqe([], OPTS).ok).toBe(false);
    expect(runLineQqe(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineQqeLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineQqeLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineQqeLayout({
      data: MIXED_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineQqeLayout({ data: MIXED_DATA, ...OPTS }).ok).toBe(true);
  });

  it('stacks the price panel above the QQE panel', () => {
    const layout = computeLineQqeLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.qqePanelTop);
  });

  it('builds the price, RSI and QQE paths', () => {
    const layout = computeLineQqeLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.rsiPath.startsWith('M')).toBe(true);
    expect(layout.qqePath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineQqeLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(MIXED_DATA.length);
  });

  it('emits one marker per defined smoothed-RSI bar', () => {
    const layout = computeLineQqeLayout({ data: MIXED_DATA, ...OPTS });
    const defined = layout.run.rsiMa.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('places the midline inside the QQE panel', () => {
    const layout = computeLineQqeLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.midlineY).toBeGreaterThanOrEqual(layout.qqePanelTop);
    expect(layout.midlineY).toBeLessThanOrEqual(layout.qqePanelBottom);
  });

  it('carries the run on the layout', () => {
    const layout = computeLineQqeLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.run.rsiPeriod).toBe(3);
  });
});

describe('describeLineQqeChart', () => {
  it('names the indicator', () => {
    expect(describeLineQqeChart(MIXED_DATA, OPTS)).toContain(
      'Quantitative Qualitative Estimation',
    );
  });

  it('mentions the smoothed RSI and the trailing band', () => {
    const text = describeLineQqeChart(MIXED_DATA, OPTS);
    expect(text).toContain('smooths the RSI');
    expect(text).toContain('trailing band');
  });

  it('reports the trend counts', () => {
    const run = runLineQqe(MIXED_DATA, OPTS);
    const text = describeLineQqeChart(MIXED_DATA, OPTS);
    expect(text).toContain(`up on ${run.upCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineQqeChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineQqe component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-qqe-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Quantitative Qualitative Estimation');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineQqe data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-qqe-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run config', () => {
    const { container } = render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-qqe"]');
    expect(root?.getAttribute('data-rsi-period')).toBe('3');
    expect(root?.getAttribute('data-smooth-period')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe('18');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price, RSI and QQE lines', () => {
    const { container } = render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-qqe-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-qqe-rsi-line"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-qqe-qqe-line"]'),
    ).toBeInTheDocument();
  });

  it('draws the midline', () => {
    const { container } = render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-qqe-midline"]'),
    ).toBeInTheDocument();
  });

  it('renders one marker per defined smoothed-RSI bar', () => {
    const run = runLineQqe(MIXED_DATA, OPTS);
    const defined = run.rsiMa.filter((v) => v !== null).length;
    const { container } = render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-qqe-marker"]',
    );
    expect(markers).toHaveLength(defined);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-qqe-marker"]'),
    );
    for (const marker of markers) {
      expect(['up', 'down', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-qqe-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-qqe-badge-config"]',
    );
    expect(badge?.textContent).toBe('QQE 3/3');
  });

  it('hides the QQE line when its legend item is toggled', () => {
    const { container } = render(<ChartLineQqe data={MIXED_DATA} {...OPTS} />);
    const button = container.querySelector(
      '[data-section="chart-line-qqe-legend-item"][data-series-id="qqe"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-qqe-qqe-line"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineQqe data={MIXED_DATA} {...OPTS} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-qqe-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineQqe ref={ref} data={MIXED_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-qqe');
  });
});
