import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineSpearman,
  DEFAULT_CHART_LINE_SPEARMAN_HEIGHT,
  DEFAULT_CHART_LINE_SPEARMAN_PADDING,
  DEFAULT_CHART_LINE_SPEARMAN_TICK_COUNT,
  DEFAULT_CHART_LINE_SPEARMAN_WIDTH,
  classifyLineSpearmanDirection,
  classifyLineSpearmanStrength,
  computeLineSpearman,
  computeLineSpearmanLayout,
  computeRanks,
  computeSpearmanCorrelation,
  describeLineSpearmanChart,
  getLineSpearmanFinitePoints,
  pairLineSpearmanByX,
  type ChartLineSpearmanPair,
  type ChartLineSpearmanSeries,
} from './chart-line-spearman';

afterEach(() => {
  cleanup();
});

function series(
  id: string,
  label: string,
  ys: readonly number[],
): ChartLineSpearmanSeries {
  return { id, label, data: ys.map((y, i) => ({ x: i, y })) };
}

function makePairs(
  ya: readonly number[],
  yb: readonly number[],
): ChartLineSpearmanPair[] {
  return ya.map((a, i) => ({
    x: i,
    ya: a,
    yb: yb[i]!,
    indexA: i,
    indexB: i,
  }));
}

describe('chart-line-spearman defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_SPEARMAN_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SPEARMAN_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SPEARMAN_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SPEARMAN_TICK_COUNT).toBeGreaterThan(0);
  });
});

describe('getLineSpearmanFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineSpearmanFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineSpearmanFinitePoints(null)).toEqual([]);
    expect(getLineSpearmanFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeRanks', () => {
  it('empty input -> []', () => {
    expect(computeRanks([])).toEqual([]);
    expect(computeRanks(null)).toEqual([]);
  });
  it('single value -> [1]', () => {
    expect(computeRanks([7])).toEqual([1]);
  });
  it('already sorted -> 1..n', () => {
    expect(computeRanks([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });
  it('reverse sorted -> n..1', () => {
    expect(computeRanks([5, 4, 3, 2, 1])).toEqual([5, 4, 3, 2, 1]);
  });
  it('unsorted -> ranks in original order', () => {
    // [5,2,8,1]: 1 is smallest (rank 1), 2 (rank 2), 5 (rank 3), 8 (rank 4)
    expect(computeRanks([5, 2, 8, 1])).toEqual([3, 2, 4, 1]);
  });
  it('ties receive the average (midrank) of their span', () => {
    // [10,20,20,30]: the two 20s span ranks 2 and 3 -> 2.5 each
    expect(computeRanks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });
  it('all-equal values -> all get the average rank', () => {
    // [5,5,5]: ranks 1,2,3 averaged -> 2
    expect(computeRanks([5, 5, 5])).toEqual([2, 2, 2]);
  });
});

describe('pairLineSpearmanByX', () => {
  it('pairs by exact x match', () => {
    const a = series('a', 'A', [10, 20, 30]); // x 0,1,2
    const b: ChartLineSpearmanSeries = {
      id: 'b',
      label: 'B',
      data: [
        { x: 1, y: 100 },
        { x: 2, y: 200 },
        { x: 3, y: 300 },
      ],
    };
    const pairs = pairLineSpearmanByX(a, b);
    expect(pairs.map((p) => p.x)).toEqual([1, 2]);
    expect(pairs[0]!.ya).toBe(20);
    expect(pairs[0]!.yb).toBe(100);
  });
  it('no overlap -> []', () => {
    const a = series('a', 'A', [1, 2, 3]);
    const b: ChartLineSpearmanSeries = {
      id: 'b',
      label: 'B',
      data: [
        { x: 10, y: 1 },
        { x: 11, y: 2 },
      ],
    };
    expect(pairLineSpearmanByX(a, b)).toEqual([]);
  });
  it('null inputs -> []', () => {
    expect(pairLineSpearmanByX(null, null)).toEqual([]);
    expect(pairLineSpearmanByX(series('a', 'A', [1]), null)).toEqual([]);
  });
});

describe('computeSpearmanCorrelation', () => {
  it('fewer than 2 pairs -> ok=false', () => {
    expect(computeSpearmanCorrelation([]).ok).toBe(false);
    expect(computeSpearmanCorrelation(makePairs([1], [1])).ok).toBe(false);
  });
  it('perfect monotonic increasing -> rho = 1', () => {
    const r = computeSpearmanCorrelation(
      makePairs([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]),
    );
    expect(r.ok).toBe(true);
    expect(r.rho).toBeCloseTo(1, 10);
  });
  it('perfect monotonic decreasing -> rho = -1', () => {
    const r = computeSpearmanCorrelation(
      makePairs([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]),
    );
    expect(r.rho).toBeCloseTo(-1, 10);
  });
  it('non-linear monotonic data still scores rho = 1', () => {
    // [1,2,3,4] vs [1,10,100,1000] is a perfectly monotonic but
    // strongly non-linear relationship. Pearson would be < 1; Spearman
    // works on ranks ([1,2,3,4] both) so rho is exactly 1.
    const r = computeSpearmanCorrelation(
      makePairs([1, 2, 3, 4], [1, 10, 100, 1000]),
    );
    expect(r.rho).toBeCloseTo(1, 10);
  });
  it('one swapped pair gives the d^2 formula result 0.9', () => {
    // ya ranks [1,2,3,4,5], yb ranks [1,2,3,5,4]: sum d^2 = 2,
    // rho = 1 - 6*2/(5*24) = 0.9
    const r = computeSpearmanCorrelation(
      makePairs([1, 2, 3, 4, 5], [1, 2, 3, 5, 4]),
    );
    expect(r.rho).toBeCloseTo(0.9, 10);
  });
  it('anti-monotonic matches the d^2 formula (-1)', () => {
    // ya ranks 1..5, yb ranks 5..1: sum d^2 = 40,
    // rho = 1 - 6*40/(5*24) = -1
    const r = computeSpearmanCorrelation(
      makePairs([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]),
    );
    expect(r.rho).toBeCloseTo(-1, 10);
  });
  it('constant series -> ok=false (zero rank variance)', () => {
    const r = computeSpearmanCorrelation(
      makePairs([1, 2, 3], [5, 5, 5]),
    );
    expect(r.ok).toBe(false);
    expect(Number.isNaN(r.rho)).toBe(true);
  });
  it('detects ties and still computes rho with midranks', () => {
    // both series have a tied pair; midranks [1,2.5,2.5,4] both -> rho 1
    const r = computeSpearmanCorrelation(
      makePairs([1, 2, 2, 3], [10, 20, 20, 30]),
    );
    expect(r.hasTies).toBe(true);
    expect(r.rho).toBeCloseTo(1, 10);
  });
  it('no ties -> hasTies false', () => {
    const r = computeSpearmanCorrelation(
      makePairs([1, 2, 3], [4, 5, 6]),
    );
    expect(r.hasTies).toBe(false);
  });
  it('rho is clamped to [-1, 1]', () => {
    const r = computeSpearmanCorrelation(
      makePairs([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]),
    );
    expect(r.rho).toBeLessThanOrEqual(1);
    expect(r.rho).toBeGreaterThanOrEqual(-1);
  });
});

describe('classifyLineSpearmanStrength', () => {
  it('strong / moderate / weak / none', () => {
    expect(classifyLineSpearmanStrength(0.9)).toBe('strong');
    expect(classifyLineSpearmanStrength(0.5)).toBe('moderate');
    expect(classifyLineSpearmanStrength(0.3)).toBe('weak');
    expect(classifyLineSpearmanStrength(0.1)).toBe('none');
  });
  it('uses absolute value', () => {
    expect(classifyLineSpearmanStrength(-0.9)).toBe('strong');
  });
  it('non-finite -> none', () => {
    expect(classifyLineSpearmanStrength(NaN)).toBe('none');
  });
});

describe('classifyLineSpearmanDirection', () => {
  it('positive / negative / neutral', () => {
    expect(classifyLineSpearmanDirection(0.5)).toBe('positive');
    expect(classifyLineSpearmanDirection(-0.5)).toBe('negative');
    expect(classifyLineSpearmanDirection(0)).toBe('neutral');
  });
  it('non-finite -> neutral', () => {
    expect(classifyLineSpearmanDirection(NaN)).toBe('neutral');
  });
});

describe('computeLineSpearman', () => {
  it('two monotonically-related series -> strong positive', () => {
    const a = series('a', 'A', [1, 2, 3, 4, 5]);
    const b = series('b', 'B', [1, 10, 100, 1000, 10000]);
    const r = computeLineSpearman(a, b);
    expect(r.ok).toBe(true);
    expect(r.rho).toBeCloseTo(1, 10);
    expect(r.strength).toBe('strong');
    expect(r.direction).toBe('positive');
    expect(r.pairCount).toBe(5);
  });
  it('anti-monotonic series -> strong negative', () => {
    const a = series('a', 'A', [1, 2, 3, 4, 5]);
    const b = series('b', 'B', [5, 4, 3, 2, 1]);
    const r = computeLineSpearman(a, b);
    expect(r.rho).toBeCloseTo(-1, 10);
    expect(r.direction).toBe('negative');
  });
  it('missing series -> ok=false', () => {
    expect(computeLineSpearman(null, null).ok).toBe(false);
  });
});

describe('computeLineSpearmanLayout', () => {
  const primary = series('a', 'A', [1, 2, 3, 4, 5]);
  const secondary = series('b', 'B', [1, 10, 100, 1000, 10000]);

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineSpearmanLayout({
      primary,
      secondary,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('both series null -> ok=false', () => {
    const layout = computeLineSpearmanLayout({
      primary: null,
      secondary: null,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds primary on left axis and secondary on right axis', () => {
    const layout = computeLineSpearmanLayout({
      primary,
      secondary,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.primary!.axis).toBe('left');
    expect(layout.primary!.role).toBe('primary');
    expect(layout.secondary!.axis).toBe('right');
    expect(layout.secondary!.role).toBe('secondary');
  });

  it('builds line paths for both series', () => {
    const layout = computeLineSpearmanLayout({
      primary,
      secondary,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.primary!.path).toContain('M ');
    expect(layout.secondary!.path).toContain('M ');
  });

  it('exposes the Spearman result', () => {
    const layout = computeLineSpearmanLayout({
      primary,
      secondary,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.spearman.ok).toBe(true);
    expect(layout.spearman.rho).toBeCloseTo(1, 10);
    expect(layout.spearman.pairCount).toBe(5);
  });

  it('renders with only the primary series (no correlation)', () => {
    const layout = computeLineSpearmanLayout({
      primary,
      secondary: null,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.primary).not.toBeNull();
    expect(layout.secondary).toBeNull();
    expect(layout.spearman.ok).toBe(false);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineSpearmanLayout({
      primary,
      secondary,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -10,
      xMax: 50,
      primaryYMin: -5,
      primaryYMax: 20,
      secondaryYMin: -100,
      secondaryYMax: 99999,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(50);
    expect(layout.primaryYMin).toBe(-5);
    expect(layout.primaryYMax).toBe(20);
    expect(layout.secondaryYMin).toBe(-100);
    expect(layout.secondaryYMax).toBe(99999);
  });

  it('totalPoints sums finite points across both series', () => {
    const layout = computeLineSpearmanLayout({
      primary,
      secondary,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(10);
  });

  it('produces x, left and right tick arrays', () => {
    const layout = computeLineSpearmanLayout({
      primary,
      secondary,
      width: 400,
      height: 200,
      padding: 30,
      tickCount: 5,
    });
    expect(layout.xTicks.length).toBe(5);
    expect(layout.leftYTicks.length).toBe(5);
    expect(layout.rightYTicks.length).toBe(5);
  });
});

describe('describeLineSpearmanChart', () => {
  it('no data -> No data', () => {
    expect(describeLineSpearmanChart(null, null)).toBe('No data');
  });
  it('summary mentions Spearman rho, strength and direction', () => {
    const s = describeLineSpearmanChart(
      series('a', 'A', [1, 2, 3, 4, 5]),
      series('b', 'B', [1, 10, 100, 1000, 10000]),
    );
    expect(s).toContain('Spearman rho');
    expect(s).toContain('strong positive');
    expect(s).toContain('5 paired');
  });
  it('reports when no correlation is computable', () => {
    const s = describeLineSpearmanChart(
      series('a', 'A', [1, 2, 3]),
      null,
    );
    expect(s).toContain('No rank correlation computable');
  });
});

describe('<ChartLineSpearman> render', () => {
  const primary = series('a', 'Series A', [1, 2, 3, 4, 5]);
  const secondary = series('b', 'Series B', [1, 10, 100, 1000, 10000]);

  it('renders empty state when both series are null', () => {
    render(<ChartLineSpearman primary={null} secondary={null} />);
    const root = document.querySelector(
      '[data-section="chart-line-spearman"]',
    );
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders a path for each series', () => {
    render(<ChartLineSpearman primary={primary} secondary={secondary} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-spearman-path"]',
    );
    expect(paths.length).toBe(2);
  });

  it('series groups carry role and axis attributes', () => {
    render(<ChartLineSpearman primary={primary} secondary={secondary} />);
    const groups = document.querySelectorAll(
      '[data-section="chart-line-spearman-series-group"]',
    );
    expect(groups.length).toBe(2);
    const primaryGroup = document.querySelector(
      '[data-section="chart-line-spearman-series-group"][data-role="primary"]',
    );
    expect(primaryGroup!.getAttribute('data-axis')).toBe('left');
    const secondaryGroup = document.querySelector(
      '[data-section="chart-line-spearman-series-group"][data-role="secondary"]',
    );
    expect(secondaryGroup!.getAttribute('data-axis')).toBe('right');
  });

  it('badge shows rho, strength, direction and pair count', () => {
    render(<ChartLineSpearman primary={primary} secondary={secondary} />);
    const badge = document.querySelector(
      '[data-section="chart-line-spearman-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-spearman-badge-rho"]')
        ?.textContent?.startsWith('rho='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-spearman-badge-strength"]',
      )?.textContent,
    ).toBe('strong positive');
    expect(
      document.querySelector(
        '[data-section="chart-line-spearman-badge-pairs"]',
      )?.textContent,
    ).toBe('n=5');
  });

  it('badge shows a ties marker when ranks are tied', () => {
    const tiedA = series('a', 'A', [1, 2, 2, 3, 4]);
    const tiedB = series('b', 'B', [10, 20, 20, 30, 40]);
    render(<ChartLineSpearman primary={tiedA} secondary={tiedB} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-spearman-badge-ties"]',
      ),
    ).not.toBeNull();
  });

  it('hides badge when showBadge=false', () => {
    render(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        showBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-spearman-badge"]'),
    ).toBeNull();
  });

  it('renders left, right and x axes', () => {
    render(<ChartLineSpearman primary={primary} secondary={secondary} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-spearman-axis"][data-axis="left"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-spearman-axis"][data-axis="right"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-spearman-axis"][data-axis="x"]',
      ),
    ).not.toBeNull();
  });

  it('omits dots by default and shows via showDots', () => {
    const { rerender } = render(
      <ChartLineSpearman primary={primary} secondary={secondary} />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-spearman-dot"]')
        .length,
    ).toBe(0);
    rerender(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        showDots={true}
      />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-spearman-dot"]')
        .length,
    ).toBe(10);
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineSpearman primary={primary} secondary={secondary} />);
    const root = document.querySelector(
      '[data-section="chart-line-spearman"]',
    );
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-spearman-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-spearman-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Spearman');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineSpearman primary={primary} secondary={secondary} />);
    const root = document.querySelector(
      '[data-section="chart-line-spearman"]',
    );
    expect(Number(root!.getAttribute('data-total-points'))).toBe(10);
    expect(root!.getAttribute('data-pair-count')).toBe('5');
    expect(root!.getAttribute('data-spearman-ok')).toBe('true');
    expect(Number(root!.getAttribute('data-rho'))).toBeCloseTo(1, 5);
    expect(root!.getAttribute('data-strength')).toBe('strong');
    expect(root!.getAttribute('data-direction')).toBe('positive');
  });

  it('tooltip appears on dot hover with x + y rows', () => {
    render(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        showDots={true}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-spearman-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-spearman-tooltip"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-spearman-tooltip-x"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-spearman-tooltip-y"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot!);
    expect(
      document.querySelector('[data-section="chart-line-spearman-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        showDots={true}
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-spearman-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-spearman-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-spearman-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('legend lists both series with their axis', () => {
    render(<ChartLineSpearman primary={primary} secondary={secondary} />);
    const items = document.querySelectorAll(
      '[data-section="chart-line-spearman-legend-item"]',
    );
    expect(items.length).toBe(2);
    const stats = document.querySelector(
      '[data-section="chart-line-spearman-legend-stats"]',
    );
    expect(stats!.textContent).toContain('Spearman rho');
  });

  it('omits legend when showLegend=false', () => {
    render(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-spearman-legend"]'),
    ).toBeNull();
  });

  it('renders with only the primary series', () => {
    render(<ChartLineSpearman primary={primary} secondary={null} />);
    const root = document.querySelector(
      '[data-section="chart-line-spearman"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('false');
    expect(root!.getAttribute('data-spearman-ok')).toBe('false');
    expect(
      document.querySelectorAll('[data-section="chart-line-spearman-path"]')
        .length,
    ).toBe(1);
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        animate={true}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-spearman"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        animate={false}
      />,
    );
    const root2 = document.querySelector(
      '[data-section="chart-line-spearman"]',
    );
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineSpearman
        ref={ref}
        primary={primary}
        secondary={secondary}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-spearman',
    );
  });

  it('has displayName', () => {
    expect(ChartLineSpearman.displayName).toBe('ChartLineSpearman');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        ariaLabel="Custom Spearman label"
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-spearman"]',
    );
    expect(root!.getAttribute('aria-label')).toBe('Custom Spearman label');
    const svg = document.querySelector(
      '[data-section="chart-line-spearman-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom Spearman label');
  });

  it('xLabel and y-axis labels render', () => {
    render(
      <ChartLineSpearman
        primary={primary}
        secondary={secondary}
        xLabel="time"
        primaryYLabel="metric A"
        secondaryYLabel="metric B"
      />,
    );
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-spearman-x-label',
    );
    expect(
      screen.getByText('metric A').getAttribute('data-section'),
    ).toBe('chart-line-spearman-y-label');
    expect(
      screen.getByText('metric B').getAttribute('data-section'),
    ).toBe('chart-line-spearman-y-label');
  });

  it('anti-monotonic data renders a strong negative badge', () => {
    render(
      <ChartLineSpearman
        primary={series('a', 'A', [1, 2, 3, 4, 5])}
        secondary={series('b', 'B', [5, 4, 3, 2, 1])}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-spearman"]',
    );
    expect(root!.getAttribute('data-direction')).toBe('negative');
    expect(root!.getAttribute('data-strength')).toBe('strong');
  });
});
