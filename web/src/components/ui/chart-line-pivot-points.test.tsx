import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLinePivotPoints,
  computeLinePivotPoints,
  computeLinePivotPointsLayout,
  getLinePivotPointsFinitePoints,
  getLinePivotPointsLevelList,
  runLinePivotPoints,
  describeLinePivotPointsChart,
  type ChartLinePivotPointsPoint,
} from './chart-line-pivot-points';

afterEach(() => cleanup());

// Classic pivot points from the prior period high 20, low 10,
// close 18. P = (20+10+18)/3 = 16, range = 10:
//   R1 = 2P-L = 22   S1 = 2P-H = 12
//   R2 = P+range = 26 S2 = P-range = 6
//   R3 = H+2(P-L) = 32 S3 = L-2(H-P) = 2
const PIVOT_PRIOR = { high: 20, low: 10, close: 18 };

// Price values straddling the pivot 16: below, below, on, above,
// above, above, below -> 3 above, 3 below, 1 on.
const PIVOT_DATA: ChartLinePivotPointsPoint[] = [
  { x: 0, value: 12 },
  { x: 1, value: 14 },
  { x: 2, value: 16 },
  { x: 3, value: 19 },
  { x: 4, value: 22 },
  { x: 5, value: 17 },
  { x: 6, value: 13 },
];

describe('getLinePivotPointsFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLinePivotPointsFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLinePivotPointsFinitePoints(null)).toEqual([]);
    expect(getLinePivotPointsFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeLinePivotPoints', () => {
  it('derives the seven classic pivot levels', () => {
    expect(computeLinePivotPoints(PIVOT_PRIOR)).toEqual({
      pivot: 16,
      r1: 22,
      r2: 26,
      r3: 32,
      s1: 12,
      s2: 6,
      s3: 2,
    });
  });

  it('takes the pivot as the mean of high, low and close', () => {
    expect(computeLinePivotPoints(PIVOT_PRIOR)!.pivot).toBe(
      (PIVOT_PRIOR.high + PIVOT_PRIOR.low + PIVOT_PRIOR.close) / 3,
    );
  });

  it('reflects R1 above and S1 below by the low and high', () => {
    const lv = computeLinePivotPoints(PIVOT_PRIOR)!;
    expect(lv.r1).toBe(22);
    expect(lv.s1).toBe(12);
  });

  it('offsets R2 and S2 by the high-low range', () => {
    const lv = computeLinePivotPoints(PIVOT_PRIOR)!;
    expect(lv.r2).toBe(26);
    expect(lv.s2).toBe(6);
  });

  it('extends R3 and S3 the furthest from the pivot', () => {
    const lv = computeLinePivotPoints(PIVOT_PRIOR)!;
    expect(lv.r3).toBe(32);
    expect(lv.s3).toBe(2);
  });

  it('returns null when high, low or close is not finite', () => {
    expect(computeLinePivotPoints({ high: NaN, low: 10, close: 18 })).toBeNull();
    expect(
      computeLinePivotPoints({ high: 20, low: Infinity, close: 18 }),
    ).toBeNull();
  });

  it('returns null for null or undefined input', () => {
    expect(computeLinePivotPoints(null)).toBeNull();
    expect(computeLinePivotPoints(undefined)).toBeNull();
  });
});

describe('getLinePivotPointsLevelList', () => {
  const levels = computeLinePivotPoints(PIVOT_PRIOR)!;

  it('lists the seven levels top to bottom', () => {
    expect(getLinePivotPointsLevelList(levels).map((l) => l.id)).toEqual([
      'r3',
      'r2',
      'r1',
      'pivot',
      's1',
      's2',
      's3',
    ]);
  });

  it('tags each level with its kind', () => {
    expect(getLinePivotPointsLevelList(levels).map((l) => l.kind)).toEqual([
      'resistance',
      'resistance',
      'resistance',
      'pivot',
      'support',
      'support',
      'support',
    ]);
  });

  it('carries the level values', () => {
    expect(getLinePivotPointsLevelList(levels).map((l) => l.value)).toEqual([
      32, 26, 22, 16, 12, 6, 2,
    ]);
  });

  it('carries short labels for each level', () => {
    expect(getLinePivotPointsLevelList(levels).map((l) => l.label)).toEqual([
      'R3',
      'R2',
      'R1',
      'P',
      'S1',
      'S2',
      'S3',
    ]);
  });
});

describe('runLinePivotPoints', () => {
  it('reports ok for a sufficient series with a valid prior', () => {
    expect(runLinePivotPoints(PIVOT_DATA, { prior: PIVOT_PRIOR }).ok).toBe(
      true,
    );
  });

  it('exposes the computed levels', () => {
    const run = runLinePivotPoints(PIVOT_DATA, { prior: PIVOT_PRIOR });
    expect(run.levels).toEqual({
      pivot: 16,
      r1: 22,
      r2: 26,
      r3: 32,
      s1: 12,
      s2: 6,
      s3: 2,
    });
  });

  it('exposes the seven-entry level list', () => {
    const run = runLinePivotPoints(PIVOT_DATA, { prior: PIVOT_PRIOR });
    expect(run.levelList).toHaveLength(7);
  });

  it('produces one sample per series point', () => {
    const run = runLinePivotPoints(PIVOT_DATA, { prior: PIVOT_PRIOR });
    expect(run.samples).toHaveLength(7);
  });

  it('classifies each sample by price position versus the pivot', () => {
    const run = runLinePivotPoints(PIVOT_DATA, { prior: PIVOT_PRIOR });
    expect(run.samples[0]!.position).toBe('below');
    expect(run.samples[2]!.position).toBe('on');
    expect(run.samples[3]!.position).toBe('above');
  });

  it('counts bars above and below the pivot', () => {
    const run = runLinePivotPoints(PIVOT_DATA, { prior: PIVOT_PRIOR });
    expect(run.aboveCount).toBe(3);
    expect(run.belowCount).toBe(3);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLinePivotPoints([{ x: 0, value: 5 }], {
      prior: PIVOT_PRIOR,
    });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok when the prior period is invalid', () => {
    const run = runLinePivotPoints(PIVOT_DATA, {
      prior: { high: NaN, low: 10, close: 18 },
    });
    expect(run.ok).toBe(false);
    expect(run.levels).toBeNull();
  });

  it('reports not-ok when no prior period is supplied', () => {
    expect(runLinePivotPoints(PIVOT_DATA).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...PIVOT_DATA].reverse();
    const run = runLinePivotPoints(shuffled, { prior: PIVOT_PRIOR });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.samples[0]!.position).toBe('below');
  });
});

describe('computeLinePivotPointsLayout', () => {
  const base = {
    data: PIVOT_DATA,
    prior: PIVOT_PRIOR,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLinePivotPointsLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLinePivotPointsLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('emits one line per pivot level', () => {
    const layout = computeLinePivotPointsLayout(base);
    expect(layout.levelLines).toHaveLength(7);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('spans a y domain covering both the price and every level', () => {
    const layout = computeLinePivotPointsLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(2);
    expect(layout.yMax).toBeGreaterThanOrEqual(32);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLinePivotPointsLayout(base);
    expect(layout.aboveCount).toBe(3);
    expect(layout.belowCount).toBe(3);
    expect(layout.levels!.pivot).toBe(16);
  });

  it('keeps the level lines inside the panel', () => {
    const layout = computeLinePivotPointsLayout(base);
    for (const l of layout.levelLines) {
      expect(l.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(l.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLinePivotPointsLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLinePivotPointsLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('returns a not-ok layout when the prior period is invalid', () => {
    const layout = computeLinePivotPointsLayout({
      ...base,
      prior: { high: NaN, low: 10, close: 18 },
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLinePivotPointsChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLinePivotPointsChart(PIVOT_DATA, {
      prior: PIVOT_PRIOR,
    });
    expect(text).toContain('pivot point');
    expect(text).toContain('classic');
    expect(text).toContain('floor-trader');
    expect(text).toContain('resistance');
    expect(text).toContain('support');
  });

  it('reports the pivot value and the position counts', () => {
    const text = describeLinePivotPointsChart(PIVOT_DATA, {
      prior: PIVOT_PRIOR,
    });
    expect(text).toContain('pivot sits at 16');
    expect(text).toContain('above the pivot on 3');
    expect(text).toContain('below on 3');
  });

  it('returns a no-data message when the prior period is missing', () => {
    expect(describeLinePivotPointsChart(PIVOT_DATA)).toBe('No data');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLinePivotPointsChart([], { prior: PIVOT_PRIOR })).toBe(
      'No data',
    );
    expect(describeLinePivotPointsChart(null)).toBe('No data');
  });
});

describe('<ChartLinePivotPoints />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLinePivotPoints data={PIVOT_DATA} prior={PIVOT_PRIOR} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLinePivotPoints data={PIVOT_DATA} prior={PIVOT_PRIOR} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-pivot-points-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('pivot point');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLinePivotPoints data={PIVOT_DATA} prior={PIVOT_PRIOR} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-pivot-points"]',
    );
    expect(root!.getAttribute('data-pivot')).toBe('16');
    expect(root!.getAttribute('data-above-count')).toBe('3');
    expect(root!.getAttribute('data-below-count')).toBe('3');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price line', () => {
    const { container } = render(
      <ChartLinePivotPoints data={PIVOT_DATA} prior={PIVOT_PRIOR} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pivot-points-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-points-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders one line per pivot level', () => {
    const { container } = render(
      <ChartLinePivotPoints data={PIVOT_DATA} prior={PIVOT_PRIOR} />,
    );
    const levels = container.querySelectorAll(
      '[data-section="chart-line-pivot-points-level"]',
    );
    expect(levels).toHaveLength(7);
  });

  it('tags the level lines with their kind', () => {
    const { container } = render(
      <ChartLinePivotPoints data={PIVOT_DATA} prior={PIVOT_PRIOR} />,
    );
    const resistance = container.querySelectorAll(
      '[data-section="chart-line-pivot-points-level"][data-level-kind="resistance"]',
    );
    const pivot = container.querySelectorAll(
      '[data-section="chart-line-pivot-points-level"][data-level-kind="pivot"]',
    );
    const support = container.querySelectorAll(
      '[data-section="chart-line-pivot-points-level"][data-level-kind="support"]',
    );
    expect(resistance).toHaveLength(3);
    expect(pivot).toHaveLength(1);
    expect(support).toHaveLength(3);
  });

  it('renders a four-item legend', () => {
    const { container } = render(
      <ChartLinePivotPoints data={PIVOT_DATA} prior={PIVOT_PRIOR} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-pivot-points-legend-item"]',
    );
    expect(items).toHaveLength(4);
  });

  it('renders the config badge with the pivot value', () => {
    const { container } = render(
      <ChartLinePivotPoints data={PIVOT_DATA} prior={PIVOT_PRIOR} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-pivot-points-badge-pivot"]',
    );
    expect(badge!.textContent).toContain('16');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLinePivotPoints
        data={PIVOT_DATA}
        prior={PIVOT_PRIOR}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-points-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the pivot line via the hidden set', () => {
    const { container } = render(
      <ChartLinePivotPoints
        data={PIVOT_DATA}
        prior={PIVOT_PRIOR}
        hiddenSeries={['pivot']}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-pivot-points-level"][data-level-kind="pivot"]',
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-pivot-points-level"]',
      ),
    ).toHaveLength(6);
  });

  it('hides the resistance lines via the hidden set', () => {
    const { container } = render(
      <ChartLinePivotPoints
        data={PIVOT_DATA}
        prior={PIVOT_PRIOR}
        hiddenSeries={['resistance']}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-pivot-points-level"][data-level-kind="resistance"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the support lines via the hidden set', () => {
    const { container } = render(
      <ChartLinePivotPoints
        data={PIVOT_DATA}
        prior={PIVOT_PRIOR}
        hiddenSeries={['support']}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-pivot-points-level"][data-level-kind="support"]',
      ),
    ).toHaveLength(0);
  });

  it('hides every level line when showLevels is false', () => {
    const { container } = render(
      <ChartLinePivotPoints
        data={PIVOT_DATA}
        prior={PIVOT_PRIOR}
        showLevels={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-pivot-points-level"]',
      ),
    ).toHaveLength(0);
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLinePivotPoints
        data={PIVOT_DATA}
        prior={PIVOT_PRIOR}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-pivot-points-legend-item"][data-series-id="resistance"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'resistance', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLinePivotPoints data={PIVOT_DATA} prior={PIVOT_PRIOR} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-pivot-points-dot"]'),
    ).toHaveLength(7);
  });

  it('renders the empty state when the prior period is invalid', () => {
    const { container } = render(
      <ChartLinePivotPoints
        data={PIVOT_DATA}
        prior={{ high: NaN, low: 10, close: 18 }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-pivot-points"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-pivot-points-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLinePivotPoints
        data={PIVOT_DATA}
        prior={PIVOT_PRIOR}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pivot-points-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLinePivotPoints ref={ref} data={PIVOT_DATA} prior={PIVOT_PRIOR} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-pivot-points',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLinePivotPoints.displayName).toBe('ChartLinePivotPoints');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLinePivotPoints
        data={PIVOT_DATA}
        prior={PIVOT_PRIOR}
        animate={false}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-pivot-points"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
