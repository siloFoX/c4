import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineMcGinley,
  computeLineMcGinley,
  computeLineMcGinleyLayout,
  getLineMcGinleyFinitePoints,
  normalizeLineMcGinleyPeriod,
  runLineMcGinley,
  describeLineMcGinleyChart,
  type ChartLineMcGinleyPoint,
} from './chart-line-mcginley';

afterEach(() => cleanup());

// The McGinley Dynamic seeds with the first price and folds each
// bar in by MD = MD_prev + (price - MD_prev) / (N * (price/MD_prev)^4).
// With N = 10 and the first move 10 -> 16 the divisor is
// 10 * (16/10)^4 = 10 * 6.5536 = 65.536, so
// MD[1] = 10 + 6/65.536 = 10.091552734375 exactly.
const MCGINLEY_DATA: ChartLineMcGinleyPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 16 },
  { x: 2, value: 12 },
  { x: 3, value: 9 },
  { x: 4, value: 13 },
];

describe('getLineMcGinleyFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineMcGinleyFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineMcGinleyFinitePoints(null)).toEqual([]);
    expect(getLineMcGinleyFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineMcGinleyPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineMcGinleyPeriod(14.7, 14)).toBe(14);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineMcGinleyPeriod(0, 14)).toBe(14);
    expect(normalizeLineMcGinleyPeriod(NaN, 14)).toBe(14);
    expect(normalizeLineMcGinleyPeriod(-3, 14)).toBe(14);
  });
});

describe('computeLineMcGinley', () => {
  const values = MCGINLEY_DATA.map((p) => p.value);

  it('seeds the line with the first price', () => {
    expect(computeLineMcGinley(values, 10)[0]).toBe(10);
  });

  it('folds the first bar in by the adaptive divisor', () => {
    expect(computeLineMcGinley(values, 10)[1]).toBeCloseTo(
      10.091552734375,
      6,
    );
  });

  it('holds a flat series exactly at its constant', () => {
    expect(computeLineMcGinley([7, 7, 7, 7], 10)).toEqual([7, 7, 7, 7]);
  });

  it('keeps each value a fractional step between the previous and the price', () => {
    const md = computeLineMcGinley(values, 10);
    for (let i = 1; i < values.length; i += 1) {
      const lo = Math.min(md[i - 1]!, values[i]!);
      const hi = Math.max(md[i - 1]!, values[i]!);
      expect(md[i]!).toBeGreaterThanOrEqual(lo);
      expect(md[i]!).toBeLessThanOrEqual(hi);
    }
  });

  it('returns the lone value for a single-point series', () => {
    expect(computeLineMcGinley([5], 10)).toEqual([5]);
  });

  it('returns an empty array for non-array or empty input', () => {
    expect(computeLineMcGinley(null, 10)).toEqual([]);
    expect(computeLineMcGinley([], 10)).toEqual([]);
  });
});

describe('runLineMcGinley', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineMcGinley(MCGINLEY_DATA, { period: 10 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineMcGinley(MCGINLEY_DATA, { period: 10 }).period).toBe(10);
  });

  it('exposes the McGinley series with no warm-up', () => {
    const run = runLineMcGinley(MCGINLEY_DATA, { period: 10 });
    expect(run.md).toHaveLength(5);
    expect(run.md[0]).toBe(10);
  });

  it('classifies each sample by price position versus the McGinley line', () => {
    const run = runLineMcGinley(MCGINLEY_DATA, { period: 10 });
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[1]!.position).toBe('above');
    expect(run.samples[3]!.position).toBe('below');
  });

  it('counts bars above and below the McGinley line', () => {
    const run = runLineMcGinley(MCGINLEY_DATA, { period: 10 });
    expect(run.aboveCount).toBe(3);
    expect(run.belowCount).toBe(1);
  });

  it('reports the final, min and max McGinley readings', () => {
    const run = runLineMcGinley(MCGINLEY_DATA, { period: 10 });
    expect(run.mdFinal).toBe(run.md[4]);
    expect(run.mdMin).toBe(run.md[3]);
    expect(run.mdMax).toBe(run.md[2]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineMcGinley([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineMcGinley([]).ok).toBe(false);
    expect(runLineMcGinley(null).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...MCGINLEY_DATA].reverse();
    const run = runLineMcGinley(shuffled, { period: 10 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.md[0]).toBe(10);
  });

  it('produces one sample per series point', () => {
    expect(runLineMcGinley(MCGINLEY_DATA, { period: 10 }).samples).toHaveLength(
      5,
    );
  });

  it('defaults to period 14', () => {
    expect(runLineMcGinley(MCGINLEY_DATA).period).toBe(14);
  });
});

describe('computeLineMcGinleyLayout', () => {
  const base = {
    data: MCGINLEY_DATA,
    period: 10,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineMcGinleyLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('builds non-empty price and McGinley paths', () => {
    const layout = computeLineMcGinleyLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.mdPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot and one marker per bar', () => {
    const layout = computeLineMcGinleyLayout(base);
    expect(layout.priceDots).toHaveLength(5);
    expect(layout.mdMarkers).toHaveLength(5);
  });

  it('spans a y domain covering both the price and the McGinley line', () => {
    const layout = computeLineMcGinleyLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(9);
    expect(layout.yMax).toBeGreaterThanOrEqual(16);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineMcGinleyLayout(base);
    expect(layout.aboveCount).toBe(3);
    expect(layout.belowCount).toBe(1);
    expect(layout.period).toBe(10);
  });

  it('keeps the McGinley markers inside the panel', () => {
    const layout = computeLineMcGinleyLayout(base);
    for (const m of layout.mdMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineMcGinleyLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.mdPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineMcGinleyLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineMcGinleyChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineMcGinleyChart(MCGINLEY_DATA, { period: 10 });
    expect(text).toContain('McGinley Dynamic');
    expect(text).toContain('adaptive');
    expect(text).toContain('self-adjusts');
    expect(text).toContain('speed');
  });

  it('reports the above and below counts', () => {
    const text = describeLineMcGinleyChart(MCGINLEY_DATA, { period: 10 });
    expect(text).toContain('above the McGinley line on 3');
    expect(text).toContain('below on 1');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineMcGinleyChart([])).toBe('No data');
    expect(describeLineMcGinleyChart(null)).toBe('No data');
  });
});

describe('<ChartLineMcGinley />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-mcginley-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('McGinley Dynamic');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mcginley"]',
    );
    expect(root!.getAttribute('data-period')).toBe('10');
    expect(root!.getAttribute('data-above-count')).toBe('3');
    expect(root!.getAttribute('data-below-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and McGinley lines', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mcginley-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mcginley-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-mcginley-md-line"]'),
    ).not.toBeNull();
  });

  it('renders one McGinley marker per bar', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-mcginley-marker"]',
      ),
    ).toHaveLength(5);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-mcginley-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-mcginley-badge-period"]',
    );
    expect(badge!.textContent).toContain('10');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineMcGinley
        data={MCGINLEY_DATA}
        period={10}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mcginley-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the McGinley line and markers when showMd is false', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} showMd={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mcginley-md-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-mcginley-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the McGinley line via the hidden set', () => {
    const { container } = render(
      <ChartLineMcGinley
        data={MCGINLEY_DATA}
        period={10}
        hiddenSeries={['md']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mcginley-md-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineMcGinley
        data={MCGINLEY_DATA}
        period={10}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-mcginley-legend-item"][data-series-id="md"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'md', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-mcginley-dot"]'),
    ).toHaveLength(5);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineMcGinley data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mcginley"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-mcginley-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineMcGinley
        data={MCGINLEY_DATA}
        period={10}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mcginley-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMcGinley ref={ref} data={MCGINLEY_DATA} period={10} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-mcginley',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineMcGinley.displayName).toBe('ChartLineMcGinley');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineMcGinley data={MCGINLEY_DATA} period={10} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mcginley"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
