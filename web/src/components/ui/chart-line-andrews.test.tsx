import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineAndrews,
  computeLineAndrewsFork,
  computeLineAndrewsLayout,
  getLineAndrewsFinitePoints,
  runLineAndrews,
  describeLineAndrewsChart,
  type ChartLineAndrewsPoint,
} from './chart-line-andrews';

afterEach(() => cleanup());

// Andrews Pitchfork from three pivots. The midpoint of p2 and p3 is
// ((3+7)/2, (42+18)/2) = (5, 30); the median runs p1 (0,10) through
// that midpoint, so its slope is (30-10)/(5-0) = 4. The tine
// intercepts are p2: 42-4*3 = 30 (upper) and p3: 18-4*7 = -10
// (lower); the median intercept 10 is exactly their average.
const ANDREWS_PIVOTS = {
  p1: { x: 0, value: 10 },
  p2: { x: 3, value: 42 },
  p3: { x: 7, value: 18 },
};

// The median line is value = 10 + 4x = [10,14,18,22,26,30,34,38,42].
// The price values straddle it: above, below, above, below, on,
// above, below, above, below -> 4 above, 4 below, 1 on.
const ANDREWS_DATA: ChartLineAndrewsPoint[] = [
  { x: 0, value: 12 },
  { x: 1, value: 13 },
  { x: 2, value: 20 },
  { x: 3, value: 21 },
  { x: 4, value: 26 },
  { x: 5, value: 33 },
  { x: 6, value: 32 },
  { x: 7, value: 40 },
  { x: 8, value: 41 },
];

describe('getLineAndrewsFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineAndrewsFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineAndrewsFinitePoints(null)).toEqual([]);
    expect(getLineAndrewsFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeLineAndrewsFork', () => {
  it('takes the median slope through the midpoint of p2 and p3', () => {
    const fork = computeLineAndrewsFork(ANDREWS_PIVOTS)!;
    expect(fork.slope).toBe(4);
    expect(fork.midpoint).toEqual({ x: 5, value: 30 });
  });

  it('orders the lines upper, median, lower', () => {
    const fork = computeLineAndrewsFork(ANDREWS_PIVOTS)!;
    expect(fork.lines.map((l) => l.id)).toEqual(['upper', 'median', 'lower']);
  });

  it('anchors the median on the first pivot', () => {
    const fork = computeLineAndrewsFork(ANDREWS_PIVOTS)!;
    const median = fork.lines.find((l) => l.id === 'median')!;
    expect(median.anchorX).toBe(0);
    expect(median.anchorValue).toBe(10);
  });

  it('derives the three line intercepts', () => {
    const fork = computeLineAndrewsFork(ANDREWS_PIVOTS)!;
    expect(fork.lines.map((l) => l.intercept)).toEqual([30, 10, -10]);
  });

  it('keeps the median intercept midway between the two tines', () => {
    const fork = computeLineAndrewsFork(ANDREWS_PIVOTS)!;
    const byId = (id: string) => fork.lines.find((l) => l.id === id)!;
    expect(byId('median').intercept).toBe(
      (byId('upper').intercept + byId('lower').intercept) / 2,
    );
  });

  it('returns null when a pivot coordinate is not finite', () => {
    expect(
      computeLineAndrewsFork({
        p1: { x: NaN, value: 10 },
        p2: { x: 3, value: 42 },
        p3: { x: 7, value: 18 },
      }),
    ).toBeNull();
  });

  it('returns null for null or undefined pivots', () => {
    expect(computeLineAndrewsFork(null)).toBeNull();
    expect(computeLineAndrewsFork(undefined)).toBeNull();
  });

  it('returns null when the median would be vertical', () => {
    expect(
      computeLineAndrewsFork({
        p1: { x: 5, value: 10 },
        p2: { x: 4, value: 30 },
        p3: { x: 6, value: 20 },
      }),
    ).toBeNull();
  });
});

describe('runLineAndrews', () => {
  it('reports ok for a sufficient series with valid pivots', () => {
    expect(runLineAndrews(ANDREWS_DATA, { pivots: ANDREWS_PIVOTS }).ok).toBe(
      true,
    );
  });

  it('exposes the computed fork', () => {
    const run = runLineAndrews(ANDREWS_DATA, { pivots: ANDREWS_PIVOTS });
    expect(run.fork!.slope).toBe(4);
  });

  it('echoes the pivots onto the run', () => {
    const run = runLineAndrews(ANDREWS_DATA, { pivots: ANDREWS_PIVOTS });
    expect(run.pivots).toEqual(ANDREWS_PIVOTS);
  });

  it('produces one sample per series point', () => {
    expect(
      runLineAndrews(ANDREWS_DATA, { pivots: ANDREWS_PIVOTS }).samples,
    ).toHaveLength(9);
  });

  it('classifies each sample by price position versus the median', () => {
    const run = runLineAndrews(ANDREWS_DATA, { pivots: ANDREWS_PIVOTS });
    expect(run.samples[0]!.position).toBe('above');
    expect(run.samples[1]!.position).toBe('below');
    expect(run.samples[4]!.position).toBe('on');
    expect(run.samples[5]!.position).toBe('above');
  });

  it('counts bars above and below the median', () => {
    const run = runLineAndrews(ANDREWS_DATA, { pivots: ANDREWS_PIVOTS });
    expect(run.aboveCount).toBe(4);
    expect(run.belowCount).toBe(4);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineAndrews([{ x: 0, value: 5 }], {
      pivots: ANDREWS_PIVOTS,
    });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok when the pivots are invalid', () => {
    const run = runLineAndrews(ANDREWS_DATA, {
      pivots: {
        p1: { x: NaN, value: 10 },
        p2: { x: 3, value: 42 },
        p3: { x: 7, value: 18 },
      },
    });
    expect(run.ok).toBe(false);
    expect(run.fork).toBeNull();
  });

  it('reports not-ok when no pivots are supplied', () => {
    expect(runLineAndrews(ANDREWS_DATA).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...ANDREWS_DATA].reverse();
    const run = runLineAndrews(shuffled, { pivots: ANDREWS_PIVOTS });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(run.samples[0]!.position).toBe('above');
  });
});

describe('computeLineAndrewsLayout', () => {
  const base = {
    data: ANDREWS_DATA,
    pivots: ANDREWS_PIVOTS,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineAndrewsLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(9);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineAndrewsLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('emits three fork lines and three pivot markers', () => {
    const layout = computeLineAndrewsLayout(base);
    expect(layout.forkLines).toHaveLength(3);
    expect(layout.pivotMarkers).toHaveLength(3);
    expect(layout.priceDots).toHaveLength(9);
  });

  it('spans a y domain covering the price range and the pivots', () => {
    const layout = computeLineAndrewsLayout(base);
    expect(layout.yMin).toBe(10);
    expect(layout.yMax).toBe(42);
  });

  it('projects each fork line across the full x range', () => {
    const layout = computeLineAndrewsLayout(base);
    expect(layout.forkLines.map((l) => l.startValue)).toEqual([30, 10, -10]);
    expect(layout.forkLines.map((l) => l.endValue)).toEqual([62, 42, 22]);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineAndrewsLayout(base);
    expect(layout.slope).toBe(4);
    expect(layout.aboveCount).toBe(4);
    expect(layout.belowCount).toBe(4);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineAndrewsLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineAndrewsLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('returns a not-ok layout when the pivots are invalid', () => {
    const layout = computeLineAndrewsLayout({
      ...base,
      pivots: {
        p1: { x: NaN, value: 10 },
        p2: { x: 3, value: 42 },
        p3: { x: 7, value: 18 },
      },
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAndrewsChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineAndrewsChart(ANDREWS_DATA, {
      pivots: ANDREWS_PIVOTS,
    });
    expect(text).toContain('Andrews Pitchfork');
    expect(text).toContain('median line');
    expect(text).toContain('pivot');
    expect(text).toContain('parallel');
    expect(text).toContain('tine');
  });

  it('reports the slope and the position counts', () => {
    const text = describeLineAndrewsChart(ANDREWS_DATA, {
      pivots: ANDREWS_PIVOTS,
    });
    expect(text).toContain('slope 4');
    expect(text).toContain('above the median line on 4');
    expect(text).toContain('below on 4');
  });

  it('returns a no-data message when pivots are missing', () => {
    expect(describeLineAndrewsChart(ANDREWS_DATA)).toBe('No data');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(
      describeLineAndrewsChart([], { pivots: ANDREWS_PIVOTS }),
    ).toBe('No data');
    expect(describeLineAndrewsChart(null)).toBe('No data');
  });
});

describe('<ChartLineAndrews />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-andrews-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Andrews Pitchfork');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-andrews"]');
    expect(root!.getAttribute('data-slope')).toBe('4');
    expect(root!.getAttribute('data-above-count')).toBe('4');
    expect(root!.getAttribute('data-below-count')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('9');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with a clip path', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-andrews-svg"]'),
    ).not.toBeNull();
    expect(container.querySelector('clipPath')).not.toBeNull();
  });

  it('renders three fork lines', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-andrews-fork-line"]',
      ),
    ).toHaveLength(3);
  });

  it('flags exactly one fork line as the median', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    const median = container.querySelectorAll(
      '[data-section="chart-line-andrews-fork-line"][data-median="true"]',
    );
    expect(median).toHaveLength(1);
    expect(median[0]!.getAttribute('data-line-id')).toBe('median');
  });

  it('renders three pivot markers', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-andrews-pivot"]'),
    ).toHaveLength(3);
  });

  it('renders the price line', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-andrews-price-path"]'),
    ).not.toBeNull();
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-andrews-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('renders the config badge with the slope', () => {
    const { container } = render(
      <ChartLineAndrews data={ANDREWS_DATA} pivots={ANDREWS_PIVOTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-andrews-badge-slope"]',
    );
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineAndrews
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-andrews-price-path"]'),
    ).toBeNull();
  });

  it('hides the fork lines via the hidden set', () => {
    const { container } = render(
      <ChartLineAndrews
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
        hiddenSeries={['fork']}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-andrews-fork-line"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the pivot markers via the hidden set', () => {
    const { container } = render(
      <ChartLineAndrews
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
        hiddenSeries={['pivots']}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-andrews-pivot"]'),
    ).toHaveLength(0);
  });

  it('hides every fork line when showFork is false', () => {
    const { container } = render(
      <ChartLineAndrews
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
        showFork={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-andrews-fork-line"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the pivot markers when showPivots is false', () => {
    const { container } = render(
      <ChartLineAndrews
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
        showPivots={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-andrews-pivot"]'),
    ).toHaveLength(0);
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineAndrews
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-andrews-legend-item"][data-series-id="fork"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'fork', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineAndrews
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
        showDots
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-andrews-dot"]'),
    ).toHaveLength(9);
  });

  it('renders the empty state when no pivots are supplied', () => {
    const { container } = render(<ChartLineAndrews data={ANDREWS_DATA} />);
    const root = container.querySelector('[data-section="chart-line-andrews"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-andrews-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineAndrews
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-andrews-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineAndrews
        ref={ref}
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-andrews',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineAndrews.displayName).toBe('ChartLineAndrews');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineAndrews
        data={ANDREWS_DATA}
        pivots={ANDREWS_PIVOTS}
        animate={false}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-andrews"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
