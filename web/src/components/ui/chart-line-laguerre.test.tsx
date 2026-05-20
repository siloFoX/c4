import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineLaguerre,
  computeLineLaguerre,
  computeLineLaguerreStages,
  computeLineLaguerreLayout,
  getLineLaguerreFinitePoints,
  normalizeLineLaguerreGamma,
  runLineLaguerre,
  describeLineLaguerreChart,
  type ChartLineLaguerrePoint,
} from './chart-line-laguerre';

afterEach(() => cleanup());

// The Ehlers Laguerre filter seeds its four cascade stages with the
// first price and advances them each bar. With gamma 0.5 every step
// is a half, so the arithmetic stays exact: the cascade for the
// series [10,18,8,16,6] yields the filter
// (L0 + 2*L1 + 2*L2 + L3)/6 = [10, 10.25, 10.4375, 10.6875, 10.96875].
const LAGUERRE_DATA: ChartLineLaguerrePoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 18 },
  { x: 2, value: 8 },
  { x: 3, value: 16 },
  { x: 4, value: 6 },
];

const LAGUERRE_FILTER = [10, 10.25, 10.4375, 10.6875, 10.96875];

const LAGUERRE_STAGES = {
  l0: [10, 14, 11, 13.5, 9.75],
  l1: [10, 8, 12.5, 10.5, 13.875],
  l2: [10, 11, 7.25, 10.875, 9],
  l3: [10, 9.5, 12.125, 7.875, 10.3125],
};

describe('getLineLaguerreFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineLaguerreFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineLaguerreFinitePoints(null)).toEqual([]);
    expect(getLineLaguerreFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineLaguerreGamma', () => {
  it('keeps a gamma inside the damping range', () => {
    expect(normalizeLineLaguerreGamma(0.7, 0.5)).toBe(0.7);
    expect(normalizeLineLaguerreGamma(0, 0.5)).toBe(0);
  });

  it('falls back for a gamma of one or above', () => {
    expect(normalizeLineLaguerreGamma(1, 0.5)).toBe(0.5);
    expect(normalizeLineLaguerreGamma(1.5, 0.5)).toBe(0.5);
  });

  it('falls back for a negative or non-finite gamma', () => {
    expect(normalizeLineLaguerreGamma(-0.2, 0.5)).toBe(0.5);
    expect(normalizeLineLaguerreGamma(NaN, 0.5)).toBe(0.5);
  });
});

describe('computeLineLaguerreStages', () => {
  const values = LAGUERRE_DATA.map((p) => p.value);

  it('runs the four-stage Laguerre cascade', () => {
    expect(computeLineLaguerreStages(values, 0.5)).toEqual(LAGUERRE_STAGES);
  });

  it('seeds every stage with the first price', () => {
    const stages = computeLineLaguerreStages(values, 0.5);
    expect(stages.l0[0]).toBe(10);
    expect(stages.l1[0]).toBe(10);
    expect(stages.l2[0]).toBe(10);
    expect(stages.l3[0]).toBe(10);
  });

  it('holds a flat series flat in every stage', () => {
    expect(computeLineLaguerreStages([7, 7, 7], 0.5)).toEqual({
      l0: [7, 7, 7],
      l1: [7, 7, 7],
      l2: [7, 7, 7],
      l3: [7, 7, 7],
    });
  });

  it('returns empty stages for non-array input', () => {
    expect(computeLineLaguerreStages(null, 0.5)).toEqual({
      l0: [],
      l1: [],
      l2: [],
      l3: [],
    });
  });
});

describe('computeLineLaguerre', () => {
  const values = LAGUERRE_DATA.map((p) => p.value);

  it('blends the cascade into the Laguerre filter', () => {
    expect(computeLineLaguerre(values, 0.5)).toEqual(LAGUERRE_FILTER);
  });

  it('starts the filter at the first price', () => {
    expect(computeLineLaguerre(values, 0.5)[0]).toBe(10);
  });

  it('is the (L0 + 2L1 + 2L2 + L3)/6 blend of the stages', () => {
    const { l0, l1, l2, l3 } = computeLineLaguerreStages(values, 0.5);
    const filter = computeLineLaguerre(values, 0.5);
    for (let i = 0; i < values.length; i += 1) {
      expect(filter[i]).toBe(
        (l0[i]! + 2 * l1[i]! + 2 * l2[i]! + l3[i]!) / 6,
      );
    }
  });

  it('holds a flat series exactly at its constant', () => {
    expect(computeLineLaguerre([7, 7, 7], 0.5)).toEqual([7, 7, 7]);
  });

  it('returns the lone value for a single-point series', () => {
    expect(computeLineLaguerre([5], 0.5)).toEqual([5]);
  });

  it('returns an empty array for non-array or empty input', () => {
    expect(computeLineLaguerre(null, 0.5)).toEqual([]);
    expect(computeLineLaguerre([], 0.5)).toEqual([]);
  });
});

describe('runLineLaguerre', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineLaguerre(LAGUERRE_DATA, { gamma: 0.5 }).ok).toBe(true);
  });

  it('carries the gamma onto the run', () => {
    expect(runLineLaguerre(LAGUERRE_DATA, { gamma: 0.5 }).gamma).toBe(0.5);
  });

  it('exposes the Laguerre filter series with no warm-up', () => {
    const run = runLineLaguerre(LAGUERRE_DATA, { gamma: 0.5 });
    expect(run.filter).toEqual(LAGUERRE_FILTER);
  });

  it('classifies each sample by price position versus the filter', () => {
    const run = runLineLaguerre(LAGUERRE_DATA, { gamma: 0.5 });
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[1]!.position).toBe('above');
    expect(run.samples[2]!.position).toBe('below');
  });

  it('counts bars above and below the filter', () => {
    const run = runLineLaguerre(LAGUERRE_DATA, { gamma: 0.5 });
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(2);
  });

  it('reports the final, min and max filter readings', () => {
    const run = runLineLaguerre(LAGUERRE_DATA, { gamma: 0.5 });
    expect(run.filterFinal).toBe(run.filter[4]);
    expect(run.filterMin).toBe(run.filter[0]);
    expect(run.filterMax).toBe(run.filter[4]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineLaguerre([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineLaguerre([]).ok).toBe(false);
    expect(runLineLaguerre(null).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...LAGUERRE_DATA].reverse();
    const run = runLineLaguerre(shuffled, { gamma: 0.5 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.filter).toEqual(LAGUERRE_FILTER);
  });

  it('produces one sample per series point', () => {
    expect(runLineLaguerre(LAGUERRE_DATA, { gamma: 0.5 }).samples).toHaveLength(
      5,
    );
  });

  it('defaults to gamma 0.5', () => {
    expect(runLineLaguerre(LAGUERRE_DATA).gamma).toBe(0.5);
  });
});

describe('computeLineLaguerreLayout', () => {
  const base = {
    data: LAGUERRE_DATA,
    gamma: 0.5,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineLaguerreLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('builds non-empty price and filter paths', () => {
    const layout = computeLineLaguerreLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.filterPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot and one marker per bar', () => {
    const layout = computeLineLaguerreLayout(base);
    expect(layout.priceDots).toHaveLength(5);
    expect(layout.filterMarkers).toHaveLength(5);
  });

  it('spans a y domain covering both the price and the filter', () => {
    const layout = computeLineLaguerreLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(6);
    expect(layout.yMax).toBeGreaterThanOrEqual(18);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineLaguerreLayout(base);
    expect(layout.aboveCount).toBe(2);
    expect(layout.belowCount).toBe(2);
    expect(layout.gamma).toBe(0.5);
  });

  it('keeps the filter markers inside the panel', () => {
    const layout = computeLineLaguerreLayout(base);
    for (const m of layout.filterMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineLaguerreLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.filterPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineLaguerreLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineLaguerreChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineLaguerreChart(LAGUERRE_DATA, { gamma: 0.5 });
    expect(text).toContain('Ehlers');
    expect(text).toContain('Laguerre');
    expect(text).toContain('four-stage cascade');
    expect(text).toContain('gamma');
    expect(text).toContain('filter');
  });

  it('reports the above and below counts', () => {
    const text = describeLineLaguerreChart(LAGUERRE_DATA, { gamma: 0.5 });
    expect(text).toContain('above the Laguerre filter on 2');
    expect(text).toContain('below on 2');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineLaguerreChart([])).toBe('No data');
    expect(describeLineLaguerreChart(null)).toBe('No data');
  });
});

describe('<ChartLineLaguerre />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-laguerre-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Laguerre');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-laguerre"]',
    );
    expect(root!.getAttribute('data-gamma')).toBe('0.5');
    expect(root!.getAttribute('data-above-count')).toBe('2');
    expect(root!.getAttribute('data-below-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and Laguerre lines', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-laguerre-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-filter-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one filter marker per bar', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-laguerre-marker"]',
      ),
    ).toHaveLength(5);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-laguerre-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the gamma', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-laguerre-badge-gamma"]',
    );
    expect(badge!.textContent).toContain('0.5');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineLaguerre
        data={LAGUERRE_DATA}
        gamma={0.5}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the Laguerre line and markers when showFilter is false', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} showFilter={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-filter-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-laguerre-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the Laguerre line via the hidden set', () => {
    const { container } = render(
      <ChartLineLaguerre
        data={LAGUERRE_DATA}
        gamma={0.5}
        hiddenSeries={['filter']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-filter-line"]',
      ),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineLaguerre
        data={LAGUERRE_DATA}
        gamma={0.5}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-laguerre-legend-item"][data-series-id="filter"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'filter', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-laguerre-dot"]'),
    ).toHaveLength(5);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineLaguerre data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-laguerre"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-laguerre-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineLaguerre
        data={LAGUERRE_DATA}
        gamma={0.5}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-laguerre-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineLaguerre ref={ref} data={LAGUERRE_DATA} gamma={0.5} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-laguerre',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineLaguerre.displayName).toBe('ChartLineLaguerre');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineLaguerre data={LAGUERRE_DATA} gamma={0.5} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-laguerre"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
