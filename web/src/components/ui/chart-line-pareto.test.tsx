import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLinePareto,
  DEFAULT_CHART_LINE_PARETO_HEIGHT,
  DEFAULT_CHART_LINE_PARETO_THRESHOLD,
  DEFAULT_CHART_LINE_PARETO_VITAL_COLOR,
  DEFAULT_CHART_LINE_PARETO_WIDTH,
  computeLineParetoLayout,
  describeLineParetoChart,
  findLineParetoCrossover,
  getLineParetoFiniteItems,
  normaliseLineParetoThreshold,
  rankLineParetoItems,
  type ChartLineParetoItem,
} from './chart-line-pareto';

// 5 items where first 2 carry 80% of total (vital few)
const classicPareto: ChartLineParetoItem[] = [
  { category: 'A', value: 50 },
  { category: 'B', value: 30 },
  { category: 'C', value: 10 },
  { category: 'D', value: 6 },
  { category: 'E', value: 4 },
];

const flatPareto: ChartLineParetoItem[] = [
  { category: 'A', value: 10 },
  { category: 'B', value: 10 },
  { category: 'C', value: 10 },
  { category: 'D', value: 10 },
  { category: 'E', value: 10 },
];

describe('chart-line-pareto: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_PARETO_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_PARETO_HEIGHT).toBeGreaterThan(0);
  });

  it('default threshold is 80', () => {
    expect(DEFAULT_CHART_LINE_PARETO_THRESHOLD).toBe(80);
  });
});

describe('getLineParetoFiniteItems', () => {
  it('drops items with non-finite or negative values', () => {
    const finite = getLineParetoFiniteItems([
      { category: 'a', value: 5 },
      { category: 'b', value: Number.NaN },
      { category: 'c', value: -1 },
      { category: 'd', value: 7 },
    ]);
    expect(finite).toHaveLength(2);
  });

  it('drops items missing category string', () => {
    const finite = getLineParetoFiniteItems([
      { category: 'a', value: 5 },
      { category: 123 as unknown as string, value: 7 },
    ]);
    expect(finite).toHaveLength(1);
  });

  it('returns [] for null', () => {
    expect(getLineParetoFiniteItems(null)).toEqual([]);
    expect(getLineParetoFiniteItems(undefined)).toEqual([]);
  });
});

describe('normaliseLineParetoThreshold', () => {
  it('returns default for non-finite', () => {
    expect(normaliseLineParetoThreshold(Number.NaN)).toBe(80);
  });

  it('clamps to [0, 100]', () => {
    expect(normaliseLineParetoThreshold(-5)).toBe(0);
    expect(normaliseLineParetoThreshold(120)).toBe(100);
  });

  it('returns value unchanged when in range', () => {
    expect(normaliseLineParetoThreshold(50)).toBe(50);
  });
});

describe('rankLineParetoItems', () => {
  it('returns [] for empty', () => {
    expect(rankLineParetoItems([])).toEqual([]);
    expect(rankLineParetoItems(null)).toEqual([]);
  });

  it('sorts by value descending and assigns ranks', () => {
    const ranked = rankLineParetoItems([
      { category: 'a', value: 10 },
      { category: 'b', value: 30 },
      { category: 'c', value: 20 },
    ]);
    expect(ranked.map((r) => r.category)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((r) => r.rank)).toEqual([0, 1, 2]);
  });

  it('preserves originalIndex from input array', () => {
    const ranked = rankLineParetoItems([
      { category: 'low', value: 1 },
      { category: 'mid', value: 5 },
      { category: 'high', value: 10 },
    ]);
    expect(ranked[0]?.category).toBe('high');
    expect(ranked[0]?.originalIndex).toBe(2);
    expect(ranked[2]?.originalIndex).toBe(0);
  });

  it('computes cumulative percent reaching 100', () => {
    const ranked = rankLineParetoItems(classicPareto);
    expect(ranked[ranked.length - 1]?.cumulativePercent).toBeCloseTo(100, 5);
  });

  it('classifies vital-few including boundary crosser', () => {
    const ranked = rankLineParetoItems(classicPareto, 80);
    // A=50% (vital, 50<=80), B=80% (vital, 80<=80), C=90% (trivial),
    // D=96% (trivial), E=100% (trivial)
    expect(ranked[0]?.stratum).toBe('vital');
    expect(ranked[1]?.stratum).toBe('vital');
    expect(ranked[2]?.stratum).toBe('trivial');
    expect(ranked[3]?.stratum).toBe('trivial');
    expect(ranked[4]?.stratum).toBe('trivial');
  });

  it('treats boundary crosser as vital when previous was below threshold', () => {
    // Threshold=75, first item at 50% (vital), second at 80% (>75, but
    // previous was below threshold -> vital boundary)
    const ranked = rankLineParetoItems(classicPareto, 75);
    expect(ranked[1]?.stratum).toBe('vital');
    expect(ranked[2]?.stratum).toBe('trivial');
  });

  it('returns all trivial when threshold is 0', () => {
    const ranked = rankLineParetoItems(classicPareto, 0);
    expect(ranked.every((r) => r.stratum === 'trivial')).toBe(true);
  });

  it('handles flat distribution (all items vital at 80%)', () => {
    // 5 items at 10 each: cumulative = 20, 40, 60, 80, 100
    // At threshold=80, items 1-4 (cumulative <=80) vital, item 5 trivial
    const ranked = rankLineParetoItems(flatPareto, 80);
    expect(ranked[0]?.stratum).toBe('vital');
    expect(ranked[3]?.stratum).toBe('vital');
    expect(ranked[4]?.stratum).toBe('trivial');
  });

  it('share sums to 100 across items', () => {
    const ranked = rankLineParetoItems(classicPareto);
    let total = 0;
    for (const r of ranked) total += r.share;
    expect(total).toBeCloseTo(100, 5);
  });
});

describe('findLineParetoCrossover', () => {
  it('returns rank -1 for empty', () => {
    const crossover = findLineParetoCrossover([]);
    expect(crossover.rank).toBe(-1);
  });

  it('returns first rank reaching threshold', () => {
    const ranked = rankLineParetoItems(classicPareto);
    const crossover = findLineParetoCrossover(ranked, 80);
    // cumulative: 50, 80, 90, 96, 100 -> first to reach 80 is rank 1
    expect(crossover.rank).toBe(1);
  });

  it('returns last rank when threshold never reached', () => {
    const ranked = rankLineParetoItems([{ category: 'a', value: 1 }], 80);
    const crossover = findLineParetoCrossover(ranked, 80);
    expect(crossover.rank).toBe(0);
  });

  it('returns rank 0 for threshold=0', () => {
    const ranked = rankLineParetoItems(classicPareto);
    const crossover = findLineParetoCrossover(ranked, 0);
    expect(crossover.rank).toBe(0);
  });
});

describe('computeLineParetoLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineParetoLayout({
      data: [],
      width: 400,
      height: 300,
      padding: 48,
    });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=false for degenerate canvas', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 10,
      height: 10,
      padding: 48,
    });
    expect(layout.ok).toBe(false);
  });

  it('orders ranked descending by value', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.ranked[0]?.category).toBe('A');
    expect(layout.ranked[layout.ranked.length - 1]?.category).toBe('E');
  });

  it('counts vital-few', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.vitalFewCount).toBe(2);
    expect(layout.trivialManyCount).toBe(3);
  });

  it('reports crossover rank', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.crossoverRank).toBe(1);
  });

  it('builds value + cumulative paths', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.valuePath.length).toBeGreaterThan(0);
    expect(layout.cumulativePath.length).toBeGreaterThan(0);
  });

  it('builds vital-few fill rect when vital items exist', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.vitalFillPath.length).toBeGreaterThan(0);
  });

  it('no vital-few fill when threshold=0', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
      threshold: 0,
    });
    expect(layout.vitalFillPath).toBe('');
    expect(layout.vitalFewCount).toBe(0);
  });

  it('threshold line y position is consistent with threshold value', () => {
    const layout50 = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
      threshold: 50,
    });
    const layout80 = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
      threshold: 80,
    });
    // higher threshold -> lower py (closer to top in SVG)
    expect(layout80.thresholdPy).toBeLessThan(layout50.thresholdPy);
  });

  it('respects valueMin/valueMax overrides', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
      valueMin: -10,
      valueMax: 200,
    });
    expect(layout.valueMin).toBe(-10);
    expect(layout.valueMax).toBe(200);
  });

  it('drops non-finite from data', () => {
    const layout = computeLineParetoLayout({
      data: [
        { category: 'a', value: 10 },
        { category: 'b', value: Number.NaN },
        { category: 'c', value: 5 },
      ],
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.finiteCount).toBe(2);
  });

  it('totalValue sums all finite items', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.totalValue).toBe(100);
  });

  it('crossover px > padding when vital exists', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.crossoverPx).toBeGreaterThan(48);
  });

  it('per-point stratum maps to vital / trivial', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.ranked[0]?.stratum).toBe('vital');
    expect(layout.ranked[2]?.stratum).toBe('trivial');
  });

  it('builds percent tick array', () => {
    const layout = computeLineParetoLayout({
      data: classicPareto,
      width: 500,
      height: 300,
      padding: 48,
    });
    expect(layout.percentTicks).toContain(0);
    expect(layout.percentTicks).toContain(100);
  });
});

describe('describeLineParetoChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineParetoChart([])).toBe('No data');
    expect(describeLineParetoChart(null)).toBe('No data');
  });

  it('summarises vital few + threshold', () => {
    const desc = describeLineParetoChart(classicPareto);
    expect(desc).toMatch(/2 vital few/);
    expect(desc).toMatch(/80\.0%/);
  });
});

describe('<ChartLinePareto> render', () => {
  it('renders empty when no data', () => {
    const { container } = render(<ChartLinePareto data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-pareto"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders value path with kind=value', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const path = document.querySelector(
      '[data-section="chart-line-pareto-value-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('value');
  });

  it('renders cumulative path with kind=cumulative', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const path = document.querySelector(
      '[data-section="chart-line-pareto-cumulative-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('cumulative');
  });

  it('renders threshold reference line dashed', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const t = document.querySelector(
      '[data-section="chart-line-pareto-threshold"]',
    );
    expect(t?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(Number(t?.getAttribute('data-value'))).toBe(80);
  });

  it('hides threshold via showThresholdLine=false', () => {
    render(<ChartLinePareto data={classicPareto} showThresholdLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-pareto-threshold"]'),
    ).toBeNull();
  });

  it('renders crossover vertical line', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const c = document.querySelector(
      '[data-section="chart-line-pareto-crossover"]',
    );
    expect(c).not.toBeNull();
    expect(Number(c?.getAttribute('data-rank'))).toBe(1);
  });

  it('hides crossover via showCrossover=false', () => {
    render(<ChartLinePareto data={classicPareto} showCrossover={false} />);
    expect(
      document.querySelector('[data-section="chart-line-pareto-crossover"]'),
    ).toBeNull();
  });

  it('renders vital-few fill rect', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const f = document.querySelector(
      '[data-section="chart-line-pareto-vital-fill"]',
    );
    expect(f).not.toBeNull();
  });

  it('hides vital-few fill via showVitalFewFill=false', () => {
    render(<ChartLinePareto data={classicPareto} showVitalFewFill={false} />);
    expect(
      document.querySelector('[data-section="chart-line-pareto-vital-fill"]'),
    ).toBeNull();
  });

  it('renders vital-few badge', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const b = document.querySelector(
      '[data-section="chart-line-pareto-badge"]',
    );
    expect(b?.getAttribute('data-vital-few-count')).toBe('2');
  });

  it('hides badge via showVitalFewBadge=false', () => {
    render(<ChartLinePareto data={classicPareto} showVitalFewBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-pareto-badge"]'),
    ).toBeNull();
  });

  it('renders value + cumulative dots per rank', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const valueDots = document.querySelectorAll(
      '[data-section="chart-line-pareto-dot"][data-kind="value"]',
    );
    const cumulativeDots = document.querySelectorAll(
      '[data-section="chart-line-pareto-dot"][data-kind="cumulative"]',
    );
    expect(valueDots.length).toBe(5);
    expect(cumulativeDots.length).toBe(5);
  });

  it('value dot carries stratum + cumulative-percent + share', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const dot0 = document.querySelector(
      '[data-section="chart-line-pareto-dot"][data-kind="value"][data-rank="0"]',
    );
    expect(dot0?.getAttribute('data-stratum')).toBe('vital');
    expect(Number(dot0?.getAttribute('data-cumulative-percent'))).toBeCloseTo(
      50,
      5,
    );
    expect(Number(dot0?.getAttribute('data-share'))).toBeCloseTo(50, 5);
  });

  it('hides dots via showDots=false', () => {
    render(<ChartLinePareto data={classicPareto} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-pareto-dot"]')
        .length,
    ).toBe(0);
  });

  it('region+img ARIA', () => {
    render(<ChartLinePareto data={classicPareto} ariaLabel="pareto" />);
    const region = screen.getByRole('region', { name: 'pareto' });
    const img = within(region).getByRole('img', { name: 'pareto' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const root = document.querySelector(
      '[data-section="chart-line-pareto"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('5');
    expect(root?.getAttribute('data-vital-few-count')).toBe('2');
    expect(root?.getAttribute('data-trivial-many-count')).toBe('3');
    expect(root?.getAttribute('data-crossover-rank')).toBe('1');
    expect(Number(root?.getAttribute('data-threshold'))).toBe(80);
  });

  it('shows tooltip on hover with value + cumulative + stratum rows', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const dot = document.querySelector(
      '[data-section="chart-line-pareto-dot"][data-kind="value"][data-rank="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const value = document.querySelector(
      '[data-section="chart-line-pareto-tooltip-value"]',
    );
    const cumulative = document.querySelector(
      '[data-section="chart-line-pareto-tooltip-cumulative"]',
    );
    const stratum = document.querySelector(
      '[data-section="chart-line-pareto-tooltip-stratum"]',
    );
    expect(value?.textContent).toMatch(/value:/);
    expect(cumulative?.textContent).toMatch(/cumulative:/);
    expect(stratum?.textContent).toMatch(/vital/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const dot = document.querySelector(
      '[data-section="chart-line-pareto-dot"][data-kind="value"][data-rank="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-pareto-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(<ChartLinePareto data={classicPareto} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-pareto-dot"][data-kind="value"][data-rank="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-pareto-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with payload', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLinePareto data={classicPareto} onPointClick={onPointClick} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-pareto-dot"][data-kind="value"][data-rank="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.rank).toBe(2);
  });

  it('legend has value + cumulative + vital items', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const value = document.querySelector(
      '[data-section="chart-line-pareto-legend-item"][data-kind="value"]',
    );
    const cumulative = document.querySelector(
      '[data-section="chart-line-pareto-legend-item"][data-kind="cumulative"]',
    );
    const vital = document.querySelector(
      '[data-section="chart-line-pareto-legend-item"][data-kind="vital"]',
    );
    expect(value).not.toBeNull();
    expect(cumulative).not.toBeNull();
    expect(vital?.textContent).toMatch(/Vital few \(2\)/);
  });

  it('omits legend via showLegend=false', () => {
    render(<ChartLinePareto data={classicPareto} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-pareto-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(
      <ChartLinePareto data={classicPareto} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-pareto"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLinePareto data={classicPareto} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-pareto"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('vital color default matches dotted vital items', () => {
    render(<ChartLinePareto data={classicPareto} />);
    const dot = document.querySelector(
      '[data-section="chart-line-pareto-dot"][data-kind="value"][data-rank="0"]',
    );
    expect(dot?.getAttribute('fill')).toBe(
      DEFAULT_CHART_LINE_PARETO_VITAL_COLOR,
    );
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePareto ref={ref} data={classicPareto} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLinePareto.displayName).toBe('ChartLinePareto');
  });
});
