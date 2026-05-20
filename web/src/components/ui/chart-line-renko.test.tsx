import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineRenko,
  computeLineRenkoBricks,
  computeLineRenkoLayout,
  getLineRenkoFinitePoints,
  normalizeLineRenkoBrickSize,
  runLineRenko,
  describeLineRenkoChart,
  type ChartLineRenkoPoint,
} from './chart-line-renko';

afterEach(() => cleanup());

// With brick size 2 the price series advances only on full 2-unit
// moves. From the first value 10:
//   ->14 emits two up bricks  (10-12, 12-14)
//   ->9  emits two down bricks (14-12, 12-10)
//   ->16 emits three up bricks (10-12, 12-14, 14-16)
// The 11, 13 and 10 wiggles never move a full brick, so they emit
// nothing. Seven bricks total: 5 up, 2 down.
const RENKO_DATA: ChartLineRenkoPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 11 },
  { x: 2, value: 14 },
  { x: 3, value: 13 },
  { x: 4, value: 9 },
  { x: 5, value: 10 },
  { x: 6, value: 16 },
];

const RENKO_BRICKS = [
  { index: 0, sourceIndex: 2, direction: 'up', open: 10, close: 12 },
  { index: 1, sourceIndex: 2, direction: 'up', open: 12, close: 14 },
  { index: 2, sourceIndex: 4, direction: 'down', open: 14, close: 12 },
  { index: 3, sourceIndex: 4, direction: 'down', open: 12, close: 10 },
  { index: 4, sourceIndex: 6, direction: 'up', open: 10, close: 12 },
  { index: 5, sourceIndex: 6, direction: 'up', open: 12, close: 14 },
  { index: 6, sourceIndex: 6, direction: 'up', open: 14, close: 16 },
];

describe('getLineRenkoFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineRenkoFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineRenkoFinitePoints(null)).toEqual([]);
    expect(getLineRenkoFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineRenkoBrickSize', () => {
  it('keeps a positive finite brick size', () => {
    expect(normalizeLineRenkoBrickSize(2.5, 1)).toBe(2.5);
  });

  it('falls back for a zero, negative or non-finite size', () => {
    expect(normalizeLineRenkoBrickSize(0, 1)).toBe(1);
    expect(normalizeLineRenkoBrickSize(-3, 1)).toBe(1);
    expect(normalizeLineRenkoBrickSize(NaN, 1)).toBe(1);
  });
});

describe('computeLineRenkoBricks', () => {
  const values = RENKO_DATA.map((p) => p.value);

  it('transforms the price series into fixed-size bricks', () => {
    expect(computeLineRenkoBricks(values, 2)).toEqual(RENKO_BRICKS);
  });

  it('emits an up brick for a brick-size rise', () => {
    expect(computeLineRenkoBricks([10, 12], 2)).toEqual([
      { index: 0, sourceIndex: 1, direction: 'up', open: 10, close: 12 },
    ]);
  });

  it('emits a down brick for a brick-size fall', () => {
    expect(computeLineRenkoBricks([10, 8], 2)).toEqual([
      { index: 0, sourceIndex: 1, direction: 'down', open: 10, close: 8 },
    ]);
  });

  it('emits several bricks for a single large move', () => {
    const bricks = computeLineRenkoBricks([10, 16], 2);
    expect(bricks).toHaveLength(3);
    expect(bricks.map((b) => b.close)).toEqual([12, 14, 16]);
  });

  it('emits nothing while the price stays inside one brick', () => {
    expect(computeLineRenkoBricks([10, 11, 10.5, 11.5], 2)).toEqual([]);
  });

  it('returns an empty array for a non-positive brick size', () => {
    expect(computeLineRenkoBricks(values, 0)).toEqual([]);
    expect(computeLineRenkoBricks(values, -2)).toEqual([]);
  });

  it('returns an empty array for non-array or empty input', () => {
    expect(computeLineRenkoBricks(null, 2)).toEqual([]);
    expect(computeLineRenkoBricks([], 2)).toEqual([]);
  });
});

describe('runLineRenko', () => {
  it('reports ok when at least one brick forms', () => {
    expect(runLineRenko(RENKO_DATA, { brickSize: 2 }).ok).toBe(true);
  });

  it('carries the brick size onto the run', () => {
    expect(runLineRenko(RENKO_DATA, { brickSize: 2 }).brickSize).toBe(2);
  });

  it('exposes the brick series', () => {
    expect(runLineRenko(RENKO_DATA, { brickSize: 2 }).bricks).toEqual(
      RENKO_BRICKS,
    );
  });

  it('counts the up and down bricks', () => {
    const run = runLineRenko(RENKO_DATA, { brickSize: 2 });
    expect(run.upCount).toBe(5);
    expect(run.downCount).toBe(2);
  });

  it('reports the price range and the last brick close', () => {
    const run = runLineRenko(RENKO_DATA, { brickSize: 2 });
    expect(run.priceMin).toBe(10);
    expect(run.priceMax).toBe(16);
    expect(run.lastClose).toBe(16);
  });

  it('reports not-ok when no brick forms', () => {
    const run = runLineRenko(
      [
        { x: 0, value: 10 },
        { x: 1, value: 10.5 },
      ],
      { brickSize: 5 },
    );
    expect(run.ok).toBe(false);
    expect(run.bricks).toEqual([]);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...RENKO_DATA].reverse();
    const run = runLineRenko(shuffled, { brickSize: 2 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.bricks).toEqual(RENKO_BRICKS);
  });

  it('defaults the brick size to one', () => {
    expect(runLineRenko(RENKO_DATA).brickSize).toBe(1);
  });
});

describe('computeLineRenkoLayout', () => {
  const base = {
    data: RENKO_DATA,
    brickSize: 2,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineRenkoLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.brickCount).toBe(7);
  });

  it('emits one rect per brick', () => {
    expect(computeLineRenkoLayout(base).rects).toHaveLength(7);
  });

  it('builds a non-empty trend path', () => {
    expect(computeLineRenkoLayout(base).trendPath.startsWith('M')).toBe(true);
  });

  it('spans a y domain covering the brick price range', () => {
    const layout = computeLineRenkoLayout(base);
    expect(layout.yMin).toBe(10);
    expect(layout.yMax).toBe(16);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineRenkoLayout(base);
    expect(layout.upCount).toBe(5);
    expect(layout.downCount).toBe(2);
    expect(layout.lastClose).toBe(16);
    expect(layout.brickSize).toBe(2);
  });

  it('tags each rect with its brick direction', () => {
    const layout = computeLineRenkoLayout(base);
    expect(layout.rects[0]!.direction).toBe('up');
    expect(layout.rects[2]!.direction).toBe('down');
  });

  it('gives every brick a positive width and an equal height', () => {
    const layout = computeLineRenkoLayout(base);
    for (const r of layout.rects) {
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeCloseTo(80, 5);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineRenkoLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.trendPath).toBe('');
  });

  it('returns a not-ok layout when no brick forms', () => {
    const layout = computeLineRenkoLayout({
      ...base,
      data: [
        { x: 0, value: 10 },
        { x: 1, value: 10.5 },
      ],
      brickSize: 5,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineRenkoChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineRenkoChart(RENKO_DATA, { brickSize: 2 });
    expect(text).toContain('Renko');
    expect(text).toContain('brick');
    expect(text).toContain('fixed');
    expect(text).toContain('noise');
  });

  it('reports the brick counts', () => {
    const text = describeLineRenkoChart(RENKO_DATA, { brickSize: 2 });
    expect(text).toContain('7 bricks');
    expect(text).toContain('5 up');
    expect(text).toContain('2 down');
  });

  it('returns a no-data message when no brick forms', () => {
    expect(describeLineRenkoChart([])).toBe('No data');
    expect(describeLineRenkoChart(null)).toBe('No data');
  });
});

describe('<ChartLineRenko />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-renko-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Renko');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} />,
    );
    const root = container.querySelector('[data-section="chart-line-renko"]');
    expect(root!.getAttribute('data-brick-size')).toBe('2');
    expect(root!.getAttribute('data-brick-count')).toBe('7');
    expect(root!.getAttribute('data-up-count')).toBe('5');
    expect(root!.getAttribute('data-down-count')).toBe('2');
    expect(root!.getAttribute('data-last-close')).toBe('16');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with one rect per brick', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-renko-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-renko-brick"]'),
    ).toHaveLength(7);
  });

  it('tags the bricks with their direction', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-renko-brick"][data-direction="up"]',
      ),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-renko-brick"][data-direction="down"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the trend line', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-renko-trend-line"]'),
    ).not.toBeNull();
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-renko-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('renders the config badge with the brick size', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-renko-badge-brick"]',
    );
    expect(badge!.textContent).toContain('2');
  });

  it('hides the up bricks via the hidden set', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} hiddenSeries={['up']} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-renko-brick"]'),
    ).toHaveLength(2);
  });

  it('hides the down bricks via the hidden set', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} hiddenSeries={['down']} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-renko-brick"]'),
    ).toHaveLength(5);
  });

  it('hides the trend line via the hidden set', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} hiddenSeries={['trend']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-renko-trend-line"]'),
    ).toBeNull();
  });

  it('hides the trend line when showTrend is false', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} showTrend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-renko-trend-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineRenko
        data={RENKO_DATA}
        brickSize={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-renko-legend-item"][data-series-id="up"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'up', hidden: true }]);
  });

  it('renders the empty state when no brick forms', () => {
    const { container } = render(
      <ChartLineRenko
        data={[
          { x: 0, value: 10 },
          { x: 1, value: 10.5 },
        ]}
        brickSize={5}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-renko"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-renko-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-renko-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRenko ref={ref} data={RENKO_DATA} brickSize={2} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-renko');
  });

  it('has a stable displayName', () => {
    expect(ChartLineRenko.displayName).toBe('ChartLineRenko');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineRenko data={RENKO_DATA} brickSize={2} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-renko"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
