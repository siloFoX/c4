import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartRidge,
  computeRidgeDensity,
  computeRidgeLayout,
  describeRidgeChart,
  getRidgeBounds,
  getRidgeDefaultColor,
  getRidgeFiniteValues,
  getRidgePeakDensity,
  getRidgeTicks,
  silvermanBandwidth,
  DEFAULT_CHART_RIDGE_WIDTH,
  DEFAULT_CHART_RIDGE_HEIGHT,
  DEFAULT_CHART_RIDGE_PADDING,
  DEFAULT_CHART_RIDGE_LABEL_WIDTH,
  DEFAULT_CHART_RIDGE_OVERLAP,
  DEFAULT_CHART_RIDGE_DENSITY_SAMPLES,
  DEFAULT_CHART_RIDGE_TICK_COUNT,
  DEFAULT_CHART_RIDGE_FILL_OPACITY,
  DEFAULT_CHART_RIDGE_PALETTE,
  type ChartRidgeSeries,
} from './chart-ridge';

afterEach(() => cleanup());

const A = Array.from({ length: 50 }, (_, i) => i + 0.5);
const B = Array.from({ length: 50 }, (_, i) => 25 + i * 0.7);
const C = Array.from({ length: 50 }, (_, i) => 50 + Math.sin(i / 3) * 5);

const SAMPLE: ChartRidgeSeries[] = [
  { id: 'a', label: 'Alpha', values: A },
  { id: 'b', label: 'Beta', values: B },
  { id: 'c', label: 'Gamma', values: C },
];

describe('chart-ridge constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_RIDGE_WIDTH).toBe(560);
    expect(DEFAULT_CHART_RIDGE_HEIGHT).toBe(320);
    expect(DEFAULT_CHART_RIDGE_PADDING).toBe(40);
    expect(DEFAULT_CHART_RIDGE_LABEL_WIDTH).toBe(80);
    expect(DEFAULT_CHART_RIDGE_OVERLAP).toBeCloseTo(0.6);
    expect(DEFAULT_CHART_RIDGE_DENSITY_SAMPLES).toBe(64);
    expect(DEFAULT_CHART_RIDGE_TICK_COUNT).toBe(5);
    expect(DEFAULT_CHART_RIDGE_FILL_OPACITY).toBeCloseTo(0.45);
    expect(DEFAULT_CHART_RIDGE_PALETTE.length).toBe(10);
  });
});

describe('getRidgeDefaultColor', () => {
  it('returns palette[index] for valid indices', () => {
    expect(getRidgeDefaultColor(0)).toBe(DEFAULT_CHART_RIDGE_PALETTE[0]);
    expect(getRidgeDefaultColor(3)).toBe(DEFAULT_CHART_RIDGE_PALETTE[3]);
  });
  it('wraps modulo palette length', () => {
    expect(getRidgeDefaultColor(DEFAULT_CHART_RIDGE_PALETTE.length)).toBe(
      DEFAULT_CHART_RIDGE_PALETTE[0]
    );
  });
  it('falls back to color 0 for invalid / negative input', () => {
    expect(getRidgeDefaultColor(Number.NaN)).toBe(DEFAULT_CHART_RIDGE_PALETTE[0]);
    expect(getRidgeDefaultColor(-1)).toBe(DEFAULT_CHART_RIDGE_PALETTE[0]);
  });
});

describe('getRidgeFiniteValues', () => {
  it('keeps only finite numbers', () => {
    expect(
      getRidgeFiniteValues([1, Number.NaN, 2, Infinity, -3])
    ).toEqual([1, 2, -3]);
  });
});

describe('silvermanBandwidth', () => {
  it('returns 1 for tiny / collapsed input', () => {
    expect(silvermanBandwidth([])).toBe(1);
    expect(silvermanBandwidth([5])).toBe(1);
    expect(silvermanBandwidth([5, 5, 5])).toBe(1);
  });
  it('returns a positive number for varied input', () => {
    expect(silvermanBandwidth(A)).toBeGreaterThan(0);
  });
});

describe('getRidgeBounds', () => {
  it('returns (0..1) for empty input', () => {
    expect(getRidgeBounds([])).toEqual({ xMin: 0, xMax: 1 });
  });
  it('computes min/max across all series', () => {
    const b = getRidgeBounds(SAMPLE);
    expect(b.xMin).toBeLessThanOrEqual(0.5);
    expect(b.xMax).toBeGreaterThanOrEqual(50 + 5);
  });
  it('honors padFactor', () => {
    const a = getRidgeBounds([{ id: 'a', label: 'A', values: [0, 10] }]);
    const b = getRidgeBounds(
      [{ id: 'a', label: 'A', values: [0, 10] }],
      0.1
    );
    expect(b.xMin).toBeLessThan(a.xMin);
    expect(b.xMax).toBeGreaterThan(a.xMax);
  });
  it('collapsed range expands by +/- 0.5', () => {
    const b = getRidgeBounds([{ id: 'a', label: 'A', values: [7, 7, 7] }]);
    expect(b.xMin).toBeCloseTo(6.5);
    expect(b.xMax).toBeCloseTo(7.5);
  });
});

describe('computeRidgeDensity', () => {
  it('returns [] for fewer than 2 finite values', () => {
    expect(
      computeRidgeDensity({ values: [5], xMin: 0, xMax: 10 })
    ).toEqual([]);
  });
  it('returns [] when xMin == xMax', () => {
    expect(
      computeRidgeDensity({ values: [1, 2, 3], xMin: 5, xMax: 5 })
    ).toEqual([]);
  });
  it('returns `samples` points across [xMin, xMax]', () => {
    const r = computeRidgeDensity({
      values: A,
      xMin: 0,
      xMax: 60,
      samples: 16,
    });
    expect(r.length).toBe(16);
    expect(r[0]!.x).toBeCloseTo(0);
    expect(r[r.length - 1]!.x).toBeCloseTo(60);
  });
  it('non-negative density', () => {
    const r = computeRidgeDensity({ values: A, xMin: 0, xMax: 60, samples: 10 });
    for (const p of r) expect(p.density).toBeGreaterThanOrEqual(0);
  });
});

describe('getRidgePeakDensity', () => {
  it('returns 0 for empty density', () => {
    expect(getRidgePeakDensity([])).toBe(0);
  });
  it('returns the largest density value', () => {
    const d = [
      { x: 0, density: 0.1 },
      { x: 1, density: 0.5 },
      { x: 2, density: 0.2 },
    ];
    expect(getRidgePeakDensity(d)).toBe(0.5);
  });
});

describe('getRidgeTicks', () => {
  it('returns count evenly-spaced inclusive ticks', () => {
    const t = getRidgeTicks(0, 10, 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBeCloseTo(0);
    expect(t[4]).toBeCloseTo(10);
  });
  it('collapsed range -> [min]', () => {
    expect(getRidgeTicks(5, 5, 5)).toEqual([5]);
  });
  it('clamps count to >= 2', () => {
    expect(getRidgeTicks(0, 1, 1).length).toBe(2);
  });
});

describe('computeRidgeLayout', () => {
  it('returns one row per series', () => {
    const b = getRidgeBounds(SAMPLE);
    const out = computeRidgeLayout({
      series: SAMPLE,
      xMin: b.xMin,
      xMax: b.xMax,
      innerW: 400,
      innerH: 240,
      padX: 40,
      padY: 40,
      overlap: 0.6,
      samples: 32,
    });
    expect(out).toHaveLength(3);
  });

  it('rows are stacked top-to-bottom (baselineY increases with index)', () => {
    const b = getRidgeBounds(SAMPLE);
    const out = computeRidgeLayout({
      series: SAMPLE,
      xMin: b.xMin,
      xMax: b.xMax,
      innerW: 400,
      innerH: 240,
      padX: 40,
      padY: 40,
      overlap: 0.6,
      samples: 32,
    });
    expect(out[0]!.baselineY).toBeLessThan(out[1]!.baselineY);
    expect(out[1]!.baselineY).toBeLessThan(out[2]!.baselineY);
  });

  it('overlap increases per-row height beyond the raw stride', () => {
    const b = getRidgeBounds(SAMPLE);
    const noOverlap = computeRidgeLayout({
      series: SAMPLE,
      xMin: b.xMin,
      xMax: b.xMax,
      innerW: 400,
      innerH: 240,
      padX: 40,
      padY: 40,
      overlap: 0,
      samples: 16,
    });
    const heavyOverlap = computeRidgeLayout({
      series: SAMPLE,
      xMin: b.xMin,
      xMax: b.xMax,
      innerW: 400,
      innerH: 240,
      padX: 40,
      padY: 40,
      overlap: 0.8,
      samples: 16,
    });
    expect(heavyOverlap[0]!.rowHeight).toBeGreaterThan(noOverlap[0]!.rowHeight);
  });

  it('returns [] when inner dims are non-positive', () => {
    const b = getRidgeBounds(SAMPLE);
    const out = computeRidgeLayout({
      series: SAMPLE,
      xMin: b.xMin,
      xMax: b.xMax,
      innerW: 0,
      innerH: 100,
      padX: 0,
      padY: 0,
      overlap: 0.6,
      samples: 32,
    });
    expect(out).toEqual([]);
  });

  it('returns [] when xMin == xMax', () => {
    const out = computeRidgeLayout({
      series: SAMPLE,
      xMin: 5,
      xMax: 5,
      innerW: 400,
      innerH: 240,
      padX: 40,
      padY: 40,
      overlap: 0.6,
      samples: 32,
    });
    expect(out).toEqual([]);
  });

  it('row carries fill + line path strings', () => {
    const b = getRidgeBounds(SAMPLE);
    const out = computeRidgeLayout({
      series: SAMPLE,
      xMin: b.xMin,
      xMax: b.xMax,
      innerW: 400,
      innerH: 240,
      padX: 40,
      padY: 40,
      overlap: 0.6,
      samples: 16,
    });
    for (const row of out) {
      expect(row.linePath.startsWith('M')).toBe(true);
      expect(row.fillPath.endsWith('Z')).toBe(true);
    }
  });

  it('per-series color override beats palette', () => {
    const series: ChartRidgeSeries[] = [
      { id: 'a', label: 'A', values: A, color: '#abcdef' },
    ];
    const b = getRidgeBounds(series);
    const out = computeRidgeLayout({
      series,
      xMin: b.xMin,
      xMax: b.xMax,
      innerW: 400,
      innerH: 240,
      padX: 40,
      padY: 40,
      overlap: 0.6,
      samples: 16,
    });
    expect(out[0]!.color).toBe('#abcdef');
  });

  it('globalPeak uses single peak across all rows', () => {
    const b = getRidgeBounds(SAMPLE);
    const out = computeRidgeLayout({
      series: SAMPLE,
      xMin: b.xMin,
      xMax: b.xMax,
      innerW: 400,
      innerH: 240,
      padX: 40,
      padY: 40,
      overlap: 0.6,
      samples: 32,
      globalPeak: true,
    });
    const first = out[0]!.peakDensity;
    for (const row of out) expect(row.peakDensity).toBe(first);
  });

  it('counts == per-series finite value count', () => {
    const b = getRidgeBounds(SAMPLE);
    const out = computeRidgeLayout({
      series: SAMPLE,
      xMin: b.xMin,
      xMax: b.xMax,
      innerW: 400,
      innerH: 240,
      padX: 40,
      padY: 40,
      overlap: 0.6,
      samples: 16,
    });
    expect(out[0]!.count).toBe(A.length);
    expect(out[1]!.count).toBe(B.length);
    expect(out[2]!.count).toBe(C.length);
  });
});

describe('describeRidgeChart', () => {
  it('returns "No data" for empty list', () => {
    expect(describeRidgeChart([])).toBe('No data');
  });
  it('returns "No data" when no series has finite values', () => {
    expect(
      describeRidgeChart([
        { id: 'a', label: 'A', values: [Number.NaN] },
      ])
    ).toBe('No data');
  });
  it('includes series count + total + range', () => {
    const d = describeRidgeChart(SAMPLE);
    expect(d).toContain('3 series');
    expect(d).toContain('values total');
    expect(d).toContain('x range');
  });
});

describe('<ChartRidge> component', () => {
  it('renders region + aria-label', () => {
    const { getByRole } = render(
      <ChartRidge series={SAMPLE} ariaLabel="Test ridge" />
    );
    expect(getByRole('region', { name: 'Test ridge' })).toBeTruthy();
  });

  it('renders one row per series', () => {
    const { container } = render(<ChartRidge series={SAMPLE} />);
    const rows = container.querySelectorAll(
      '[data-section="chart-ridge-row"]'
    );
    expect(rows.length).toBe(3);
  });

  it('row carries data-series-id / -index / -color / -count', () => {
    const { container } = render(<ChartRidge series={SAMPLE} />);
    const first = container.querySelector(
      '[data-series-id="a"]'
    ) as HTMLElement;
    expect(first.getAttribute('data-series-index')).toBe('0');
    expect(first.getAttribute('data-series-color')).toBeTruthy();
    expect(first.getAttribute('data-series-count')).toBe(String(A.length));
  });

  it('line path is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartRidge series={SAMPLE} />);
    const line = container.querySelector(
      '[data-section="chart-ridge-line"]'
    ) as SVGPathElement;
    expect(line.getAttribute('role')).toBe('graphics-symbol');
    expect(line.getAttribute('tabindex')).toBe('0');
    expect(line.getAttribute('aria-label')).toContain('density curve');
  });

  it('root mirrors series + overlap + globalPeak + animate', () => {
    const { container } = render(
      <ChartRidge
        series={SAMPLE}
        overlap={0.3}
        globalPeak
        animate={false}
      />
    );
    const root = container.querySelector('[data-section="chart-ridge"]');
    expect(root?.getAttribute('data-series-count')).toBe('3');
    expect(root?.getAttribute('data-visible-count')).toBe('3');
    expect(root?.getAttribute('data-overlap')).toBe('0.3');
    expect(root?.getAttribute('data-global-peak')).toBe('true');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });

  it('labels render by default; one per row', () => {
    const { container } = render(<ChartRidge series={SAMPLE} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-ridge-label"]'
    );
    expect(labels.length).toBe(3);
    expect(labels[0]!.textContent).toBe('Alpha');
  });

  it('showLabels=false suppresses labels', () => {
    const { container } = render(<ChartRidge series={SAMPLE} showLabels={false} />);
    expect(
      container.querySelector('[data-section="chart-ridge-labels"]')
    ).toBeNull();
  });

  it('axis ticks + grid render by default and can be suppressed', () => {
    const a = render(<ChartRidge series={SAMPLE} />);
    expect(
      a.container.querySelectorAll(
        '[data-section="chart-ridge-tick"]'
      ).length
    ).toBeGreaterThan(0);
    expect(
      a.container.querySelector('[data-section="chart-ridge-grid"]')
    ).not.toBeNull();
    cleanup();
    const b = render(
      <ChartRidge
        series={SAMPLE}
        showAxisTicks={false}
        showGrid={false}
      />
    );
    expect(
      b.container.querySelector('[data-section="chart-ridge-ticks"]')
    ).toBeNull();
    expect(
      b.container.querySelector('[data-section="chart-ridge-grid"]')
    ).toBeNull();
  });

  it('tooltip opens on row hover with label + count + peak', () => {
    const { container } = render(<ChartRidge series={SAMPLE} />);
    const row = container.querySelector(
      '[data-series-id="a"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(row);
    expect(
      container.querySelector('[data-section="chart-ridge-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-ridge-tooltip-label"]'
      )?.textContent
    ).toBe('Alpha');
    expect(
      container.querySelector(
        '[data-section="chart-ridge-tooltip-count"]'
      )?.textContent
    ).toContain('count:');
    expect(
      container.querySelector(
        '[data-section="chart-ridge-tooltip-peak"]'
      )?.textContent
    ).toContain('peak');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartRidge series={SAMPLE} />);
    const row = container.querySelector('[data-series-id="a"]') as HTMLElement;
    fireEvent.mouseEnter(row);
    expect(
      container.querySelector('[data-section="chart-ridge-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(row);
    expect(
      container.querySelector('[data-section="chart-ridge-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartRidge series={SAMPLE} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-series-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-ridge-tooltip"]')
    ).toBeNull();
  });

  it('formatValue reaches tooltip peak density', () => {
    const { container } = render(
      <ChartRidge series={SAMPLE} formatValue={(v) => `${v}u`} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-series-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-ridge-tooltip-peak"]'
      )?.textContent
    ).toContain('u');
  });

  it('onRowClick fires with series + layout', () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <ChartRidge series={SAMPLE} onRowClick={onRowClick} />
    );
    const row = container.querySelector('[data-series-id="b"]') as HTMLElement;
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]![0].series.id).toBe('b');
    expect(onRowClick.mock.calls[0]![0].layout.id).toBe('b');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartRidge series={SAMPLE} />);
    const row = container.querySelector('[data-series-id="a"]') as HTMLElement;
    expect(row.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(row);
    expect(row.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(row);
    expect(row.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartRidge series={SAMPLE} />);
    expect(
      container.querySelector('[data-section="chart-ridge-aria-desc"]')
        ?.textContent
    ).toContain('3 series');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartRidge series={SAMPLE} ariaDescription="Override" />
    );
    expect(
      container.querySelector('[data-section="chart-ridge-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartRidge series={SAMPLE} width={400} height={200} />
    );
    const svg = container.querySelector(
      '[data-section="chart-ridge-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty series list renders without crashing', () => {
    const { container } = render(<ChartRidge series={[]} />);
    expect(
      container.querySelectorAll('[data-section="chart-ridge-row"]').length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-ridge-aria-desc"]')!
        .textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartRidge series={SAMPLE} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-ridge');
  });

  it('has stable displayName', () => {
    expect(ChartRidge.displayName).toBe('ChartRidge');
  });

  it('xMin / xMax props clamp the visible range', () => {
    const { container } = render(
      <ChartRidge series={SAMPLE} xMin={0} xMax={100} />
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-ridge-tick-label"]'
    );
    expect(ticks[0]!.textContent).toBe('0');
    expect(ticks[ticks.length - 1]!.textContent).toBe('100');
  });
});
