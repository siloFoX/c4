import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineFdi,
  classifyLineFdiZone,
  computeLineFdi,
  computeLineFdiLayout,
  computeLineFdiValue,
  describeLineFdiChart,
  getLineFdiFinitePoints,
  normalizeLineFdiPeriod,
  runLineFdi,
  type ChartLineFdiPoint,
} from './chart-line-fdi';

/**
 * Fixtures:
 * - A flat window has a zero price range, so every normalized step is
 *   zero and the curve length is exactly 1; ln(1) = 0, so the FDI is
 *   exactly 1 -- a flat path is dimension 1.
 * - A straight ramp at period 5 has a curve length of sqrt(2) and
 *   ln(N-1) = ln(4) = 2*ln(2), so the FDI is 1 + ln(sqrt(2))/ln(4) = 1.25.
 * - FDI_DATA: a flat run followed by a choppy run, period 5.
 */
const FDI_DATA: ChartLineFdiPoint[] = [
  { x: 1, value: 50 },
  { x: 2, value: 50 },
  { x: 3, value: 50 },
  { x: 4, value: 50 },
  { x: 5, value: 50 },
  { x: 6, value: 60 },
  { x: 7, value: 42 },
  { x: 8, value: 68 },
  { x: 9, value: 38 },
  { x: 10, value: 58 },
  { x: 11, value: 46 },
  { x: 12, value: 62 },
];
const OPTS = { period: 5 };

describe('getLineFdiFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineFdiFinitePoints([
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
    expect(getLineFdiFinitePoints(null)).toEqual([]);
    expect(getLineFdiFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineFdiFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineFdiFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineFdiPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineFdiPeriod(20, 30)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineFdiPeriod(8.9, 30)).toBe(8);
  });

  it('falls back when the period is below two', () => {
    expect(normalizeLineFdiPeriod(1, 30)).toBe(30);
    expect(normalizeLineFdiPeriod(0, 30)).toBe(30);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineFdiPeriod(Number.NaN, 30)).toBe(30);
    expect(normalizeLineFdiPeriod('x', 30)).toBe(30);
  });

  it('allows the minimum period of two', () => {
    expect(normalizeLineFdiPeriod(2, 30)).toBe(2);
  });
});

describe('computeLineFdiValue', () => {
  it('returns null for a non-array input', () => {
    expect(computeLineFdiValue(null)).toBeNull();
  });

  it('returns null for a window shorter than two points', () => {
    expect(computeLineFdiValue([5])).toBeNull();
  });

  it('returns 1 for a two-point window', () => {
    expect(computeLineFdiValue([10, 20])).toBe(1);
  });

  it('returns exactly 1 for a flat window', () => {
    expect(computeLineFdiValue([8, 8, 8, 8, 8])).toBe(1);
  });

  it('is 1.25 for a straight ramp at a five-point window', () => {
    expect(computeLineFdiValue([10, 20, 30, 40, 50])).toBeCloseTo(1.25, 6);
  });

  it('clamps a maximally jagged window to 2', () => {
    expect(computeLineFdiValue([10, 50, 10, 50, 10])).toBe(2);
  });

  it('returns null for a window with a non-finite value', () => {
    expect(computeLineFdiValue([10, Number.NaN, 30, 40, 50])).toBeNull();
  });

  it('keeps the result within 1 and 2', () => {
    const fdi = computeLineFdiValue([20, 35, 22, 48, 30]);
    expect(fdi!).toBeGreaterThanOrEqual(1);
    expect(fdi!).toBeLessThanOrEqual(2);
  });

  it('scores a jagged window higher than a smooth ramp', () => {
    const ramp = computeLineFdiValue([10, 20, 30, 40, 50])!;
    const jagged = computeLineFdiValue([10, 45, 18, 40, 25])!;
    expect(jagged).toBeGreaterThan(ramp);
  });

  it('scores a smooth monotone window low', () => {
    expect(computeLineFdiValue([10, 18, 30, 42, 50])!).toBeLessThan(1.6);
  });
});

describe('computeLineFdi', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineFdi(null, 5)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineFdi(FDI_DATA.map((p) => p.value), 5)).toHaveLength(
      FDI_DATA.length,
    );
  });

  it('keeps the warm-up window null', () => {
    const fdi = computeLineFdi(FDI_DATA.map((p) => p.value), 5);
    expect(fdi[0]).toBeNull();
    expect(fdi[3]).toBeNull();
    expect(fdi[4]).not.toBeNull();
  });

  it('is 1 for a fully flat window', () => {
    expect(computeLineFdi([7, 7, 7, 7, 7], 5)[4]).toBe(1);
  });

  it('is all null when the period exceeds the series length', () => {
    expect(computeLineFdi([1, 2, 3], 5)).toEqual([null, null, null]);
  });

  it('keeps every defined value within 1 and 2', () => {
    for (const v of computeLineFdi(FDI_DATA.map((p) => p.value), 5)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(2);
      }
    }
  });

  it('defines one value per full window', () => {
    const fdi = computeLineFdi(FDI_DATA.map((p) => p.value), 5);
    expect(fdi.filter((v) => v !== null)).toHaveLength(FDI_DATA.length - 4);
  });

  it('returns null at a slot whose window touches a non-finite value', () => {
    const fdi = computeLineFdi([10, 20, 30, 40, Number.NaN, 60], 5);
    expect(fdi[4]).toBeNull();
  });
});

describe('classifyLineFdiZone', () => {
  it('is choppy above the upper threshold', () => {
    expect(classifyLineFdiZone(1.8, 1.6, 1.4)).toBe('choppy');
  });

  it('is trending below the lower threshold', () => {
    expect(classifyLineFdiZone(1.2, 1.6, 1.4)).toBe('trending');
  });

  it('is neutral between the thresholds', () => {
    expect(classifyLineFdiZone(1.5, 1.6, 1.4)).toBe('neutral');
  });

  it('is none for a null reading', () => {
    expect(classifyLineFdiZone(null, 1.6, 1.4)).toBe('none');
  });

  it('is none for a non-finite reading', () => {
    expect(classifyLineFdiZone(Number.NaN, 1.6, 1.4)).toBe('none');
  });
});

describe('runLineFdi', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineFdi([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineFdi(FDI_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default options', () => {
    const run = runLineFdi(FDI_DATA);
    expect(run.period).toBe(30);
    expect(run.upperThreshold).toBe(1.6);
    expect(run.lowerThreshold).toBe(1.4);
  });

  it('honours custom options', () => {
    const run = runLineFdi(FDI_DATA, {
      period: 5,
      upperThreshold: 1.7,
      lowerThreshold: 1.3,
    });
    expect(run.period).toBe(5);
    expect(run.upperThreshold).toBe(1.7);
    expect(run.lowerThreshold).toBe(1.3);
  });

  it('scores the first full flat window at exactly 1', () => {
    expect(runLineFdi(FDI_DATA, OPTS).fdi[4]).toBe(1);
  });

  it('classifies the flat window as trending', () => {
    expect(runLineFdi(FDI_DATA, OPTS).samples[4]!.zone).toBe('trending');
  });

  it('emits one sample per point', () => {
    expect(runLineFdi(FDI_DATA, OPTS).samples).toHaveLength(FDI_DATA.length);
  });

  it('keeps every FDI reading within 1 and 2', () => {
    const run = runLineFdi(FDI_DATA, OPTS);
    for (const v of run.fdi) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(2);
      }
    }
  });

  it('classifies every bar into a valid zone', () => {
    const run = runLineFdi(FDI_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['trending', 'choppy', 'neutral', 'none']).toContain(
        sample.zone,
      );
    }
  });

  it('has self-consistent zone counts', () => {
    const run = runLineFdi(FDI_DATA, OPTS);
    const defined = run.fdi.filter((v) => v !== null).length;
    expect(
      run.trendingCount + run.choppyCount + run.neutralCount,
    ).toBe(defined);
  });

  it('sorts the input by x', () => {
    const shuffled = [...FDI_DATA].reverse();
    const run = runLineFdi(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(FDI_DATA.map((p) => p.x));
  });

  it('is not ok for an empty series', () => {
    expect(runLineFdi([], OPTS).ok).toBe(false);
    expect(runLineFdi(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineFdiLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineFdiLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineFdiLayout({
      data: FDI_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineFdiLayout({ data: FDI_DATA, ...OPTS }).ok).toBe(true);
  });

  it('stacks the price panel above the FDI panel', () => {
    const layout = computeLineFdiLayout({ data: FDI_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.fdiPanelTop);
  });

  it('builds the price and FDI paths', () => {
    const layout = computeLineFdiLayout({ data: FDI_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.fdiPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineFdiLayout({ data: FDI_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(FDI_DATA.length);
  });

  it('emits one marker per defined FDI bar', () => {
    const layout = computeLineFdiLayout({ data: FDI_DATA, ...OPTS });
    const defined = layout.run.fdi.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('places the upper threshold line above the lower', () => {
    const layout = computeLineFdiLayout({ data: FDI_DATA, ...OPTS });
    expect(layout.upperY).toBeLessThan(layout.lowerY);
  });

  it('carries the run on the layout', () => {
    const layout = computeLineFdiLayout({ data: FDI_DATA, ...OPTS });
    expect(layout.run.period).toBe(5);
  });
});

describe('describeLineFdiChart', () => {
  it('names the indicator', () => {
    expect(describeLineFdiChart(FDI_DATA, OPTS)).toContain(
      'Fractal Dimension Index',
    );
  });

  it('mentions the path roughness', () => {
    expect(describeLineFdiChart(FDI_DATA, OPTS)).toContain('roughness');
  });

  it('reports the zone counts', () => {
    const run = runLineFdi(FDI_DATA, OPTS);
    const text = describeLineFdiChart(FDI_DATA, OPTS);
    expect(text).toContain(`trending on ${run.trendingCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineFdiChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineFdi component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-fdi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Fractal Dimension Index');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineFdi data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-fdi-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run config', () => {
    const { container } = render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-fdi"]');
    expect(root?.getAttribute('data-period')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('12');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price and FDI lines', () => {
    const { container } = render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-fdi-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-fdi-fdi-line"]'),
    ).toBeInTheDocument();
  });

  it('draws the two threshold lines', () => {
    const { container } = render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-fdi-threshold-line"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one marker per defined FDI bar', () => {
    const run = runLineFdi(FDI_DATA, OPTS);
    const defined = run.fdi.filter((v) => v !== null).length;
    const { container } = render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-fdi-marker"]',
    );
    expect(markers).toHaveLength(defined);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-fdi-marker"]'),
    );
    for (const marker of markers) {
      expect(['trending', 'choppy', 'neutral']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-fdi-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-fdi-badge-config"]',
    );
    expect(badge?.textContent).toBe('FDI 5');
  });

  it('hides the FDI line when its legend item is toggled', () => {
    const { container } = render(<ChartLineFdi data={FDI_DATA} {...OPTS} />);
    const button = container.querySelector(
      '[data-section="chart-line-fdi-legend-item"][data-series-id="fdi"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-fdi-fdi-line"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineFdi data={FDI_DATA} {...OPTS} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-fdi-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFdi ref={ref} data={FDI_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-fdi');
  });
});
