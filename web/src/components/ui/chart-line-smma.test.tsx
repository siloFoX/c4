import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineSmma,
  computeLineSmma,
  computeLineSmmaLayout,
  getLineSmmaFinitePoints,
  normalizeLineSmmaPeriod,
  runLineSmma,
  describeLineSmmaChart,
  type ChartLineSmmaPoint,
} from './chart-line-smma';

afterEach(() => cleanup());

// With period 3 the SMMA seeds at the simple mean of the first
// three prices and then folds each bar in as
// (SMMA_prev*2 + price) / 3. The prices are chosen so every step
// lands on an integer:
//   SMMA[2] = (3+6+9)/3 = 6
//   SMMA[3] = (6*2 + 12)/3 = 8
//   SMMA[4] = (8*2 + 11)/3 = 9
//   SMMA[5] = (9*2 + 9)/3  = 9
//   SMMA[6] = (9*2 + 6)/3  = 8
//   SMMA = [null, null, 6, 8, 9, 9, 8]
const SMMA_DATA: ChartLineSmmaPoint[] = [
  { x: 0, value: 3 },
  { x: 1, value: 6 },
  { x: 2, value: 9 },
  { x: 3, value: 12 },
  { x: 4, value: 11 },
  { x: 5, value: 9 },
  { x: 6, value: 6 },
];

describe('getLineSmmaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineSmmaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineSmmaFinitePoints(null)).toEqual([]);
    expect(getLineSmmaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineSmmaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineSmmaPeriod(14.8, 14)).toBe(14);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineSmmaPeriod(0, 14)).toBe(14);
    expect(normalizeLineSmmaPeriod(NaN, 14)).toBe(14);
    expect(normalizeLineSmmaPeriod(-3, 14)).toBe(14);
  });
});

describe('computeLineSmma', () => {
  const values = SMMA_DATA.map((p) => p.value);

  it('seeds with the simple mean then applies the Wilder running mean', () => {
    expect(computeLineSmma(values, 3)).toEqual([null, null, 6, 8, 9, 9, 8]);
  });

  it('folds each bar in as (SMMA_prev*(period-1) + price)/period', () => {
    const smma = computeLineSmma(values, 3);
    // SMMA[3] = (SMMA[2]*2 + value[3]) / 3 = (6*2 + 12) / 3 = 8.
    expect(smma[3]).toBe((smma[2]! * 2 + values[3]!) / 3);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const smma = computeLineSmma(values, 3);
    expect(smma[0]).toBeNull();
    expect(smma[1]).toBeNull();
    expect(smma[2]).not.toBeNull();
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineSmma([3, 7, 9], 1)).toEqual([3, 7, 9]);
  });

  it('holds a flat series exactly at its constant', () => {
    expect(computeLineSmma([5, 5, 5, 5], 3)).toEqual([null, null, 5, 5]);
  });

  it('returns all null when the series is shorter than the period', () => {
    expect(computeLineSmma([4, 8], 3)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineSmma(null, 3)).toEqual([]);
  });
});

describe('runLineSmma', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineSmma(SMMA_DATA, { period: 3 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineSmma(SMMA_DATA, { period: 3 }).period).toBe(3);
  });

  it('exposes the SMMA series', () => {
    const run = runLineSmma(SMMA_DATA, { period: 3 });
    expect(run.smma).toEqual([null, null, 6, 8, 9, 9, 8]);
  });

  it('reports the final, min and max SMMA readings', () => {
    const run = runLineSmma(SMMA_DATA, { period: 3 });
    expect(run.smmaFinal).toBe(8);
    expect(run.smmaMin).toBe(6);
    expect(run.smmaMax).toBe(9);
  });

  it('classifies each sample by price position versus the SMMA', () => {
    const run = runLineSmma(SMMA_DATA, { period: 3 });
    expect(run.samples[1]!.position).toBe('on');
    expect(run.samples[2]!.position).toBe('above');
    expect(run.samples[5]!.position).toBe('on');
    expect(run.samples[6]!.position).toBe('below');
  });

  it('counts bars above and below the SMMA', () => {
    const run = runLineSmma(SMMA_DATA, { period: 3 });
    expect(run.aboveCount).toBe(3);
    expect(run.belowCount).toBe(1);
  });

  it('leaves warm-up samples with a null SMMA', () => {
    const run = runLineSmma(SMMA_DATA, { period: 3 });
    expect(run.samples[0]!.smma).toBeNull();
    expect(run.samples[2]!.smma).toBe(6);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...SMMA_DATA].reverse();
    const run = runLineSmma(shuffled, { period: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.smma).toEqual([null, null, 6, 8, 9, 9, 8]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineSmma([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineSmma([]).ok).toBe(false);
    expect(runLineSmma(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineSmma(SMMA_DATA, { period: 3 }).samples).toHaveLength(7);
  });

  it('defaults to period 14 and reads no SMMA for a short series', () => {
    const run = runLineSmma(SMMA_DATA);
    expect(run.period).toBe(14);
    expect(run.smma.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.smmaFinal)).toBe(true);
  });
});

describe('computeLineSmmaLayout', () => {
  const base = {
    data: SMMA_DATA,
    period: 3,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineSmmaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('builds non-empty price and SMMA paths', () => {
    const layout = computeLineSmmaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.smmaPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the SMMA is defined', () => {
    const layout = computeLineSmmaLayout(base);
    expect(layout.smmaMarkers).toHaveLength(5);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('spans a y domain covering both the price and the SMMA', () => {
    const layout = computeLineSmmaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(3);
    expect(layout.yMax).toBeGreaterThanOrEqual(12);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineSmmaLayout(base);
    expect(layout.smmaFinal).toBe(8);
    expect(layout.aboveCount).toBe(3);
    expect(layout.period).toBe(3);
  });

  it('keeps the SMMA markers inside the panel', () => {
    const layout = computeLineSmmaLayout(base);
    for (const m of layout.smmaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineSmmaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.smmaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineSmmaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineSmmaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineSmmaChart(SMMA_DATA, { period: 3 });
    expect(text).toContain('Smoothed Moving Average');
    expect(text).toContain('SMMA');
    expect(text).toContain('Wilder');
    expect(text).toContain('running-mean');
    expect(text).toContain('exponential moving average');
  });

  it('reports the above and below counts', () => {
    const text = describeLineSmmaChart(SMMA_DATA, { period: 3 });
    expect(text).toContain('above the SMMA on 3');
    expect(text).toContain('below on 1');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineSmmaChart([])).toBe('No data');
    expect(describeLineSmmaChart(null)).toBe('No data');
  });
});

describe('<ChartLineSmma />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineSmma data={SMMA_DATA} period={3} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineSmma data={SMMA_DATA} period={3} />);
    const desc = container.querySelector(
      '[data-section="chart-line-smma-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Smoothed Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineSmma data={SMMA_DATA} period={3} />);
    const root = container.querySelector('[data-section="chart-line-smma"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-smma-final')).toBe('8');
    expect(root!.getAttribute('data-above-count')).toBe('3');
    expect(root!.getAttribute('data-below-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and SMMA lines', () => {
    const { container } = render(<ChartLineSmma data={SMMA_DATA} period={3} />);
    expect(
      container.querySelector('[data-section="chart-line-smma-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-smma-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-smma-smma-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined SMMA value', () => {
    const { container } = render(<ChartLineSmma data={SMMA_DATA} period={3} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-smma-marker"]',
    );
    expect(markers).toHaveLength(5);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineSmma data={SMMA_DATA} period={3} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-smma-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineSmma data={SMMA_DATA} period={3} />);
    const badge = container.querySelector(
      '[data-section="chart-line-smma-badge-period"]',
    );
    expect(badge!.textContent).toContain('3');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineSmma data={SMMA_DATA} period={3} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-smma-price-path"]'),
    ).toBeNull();
  });

  it('hides the SMMA line and markers when showSmma is false', () => {
    const { container } = render(
      <ChartLineSmma data={SMMA_DATA} period={3} showSmma={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-smma-smma-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-smma-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the SMMA line via the hidden set', () => {
    const { container } = render(
      <ChartLineSmma data={SMMA_DATA} period={3} hiddenSeries={['smma']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-smma-smma-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineSmma
        data={SMMA_DATA}
        period={3}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-smma-legend-item"][data-series-id="smma"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'smma', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineSmma data={SMMA_DATA} period={3} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-smma-dot"]'),
    ).toHaveLength(7);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineSmma data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-smma"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-smma-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineSmma data={SMMA_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-smma-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSmma ref={ref} data={SMMA_DATA} period={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-smma');
  });

  it('has a stable displayName', () => {
    expect(ChartLineSmma.displayName).toBe('ChartLineSmma');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineSmma data={SMMA_DATA} period={3} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-smma"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
