import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineGann,
  GANN_RATIOS,
  computeLineGannRays,
  computeLineGannLayout,
  getLineGannFinitePoints,
  normalizeLineGannPivotIndex,
  runLineGann,
  describeLineGannChart,
  type ChartLineGannPoint,
} from './chart-line-gann';

afterEach(() => cleanup());

// A Gann fan from the pivot at index 0 (x 0, value 10) with a
// price-per-unit of 3, fanning up. The 1x1 ray rises 3 per x-step,
// so its value at x is 10 + 3x = [10,13,16,19,22,25,28,31,34].
// The price values straddle that 1x1 ray: on, above, below, below,
// above, below, above, below, above -> 4 above, 4 below, 1 on.
const GANN_DATA: ChartLineGannPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 13 },
  { x: 3, value: 18 },
  { x: 4, value: 25 },
  { x: 5, value: 24 },
  { x: 6, value: 31 },
  { x: 7, value: 30 },
  { x: 8, value: 40 },
];

const GANN_OPTS = { pivotIndex: 0, pricePerUnit: 3, direction: 'up' as const };

describe('getLineGannFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineGannFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineGannFinitePoints(null)).toEqual([]);
    expect(getLineGannFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineGannPivotIndex', () => {
  it('floors a fractional index', () => {
    expect(normalizeLineGannPivotIndex(2.8, 9)).toBe(2);
  });

  it('clamps an index past the end to the last point', () => {
    expect(normalizeLineGannPivotIndex(99, 9)).toBe(8);
  });

  it('falls back to zero for a negative or non-finite index', () => {
    expect(normalizeLineGannPivotIndex(-3, 9)).toBe(0);
    expect(normalizeLineGannPivotIndex(NaN, 9)).toBe(0);
  });
});

describe('GANN_RATIOS', () => {
  it('lists the nine classic price-time ratios in fan order', () => {
    expect(GANN_RATIOS).toHaveLength(9);
    expect(GANN_RATIOS.map((r) => r.id)).toEqual([
      '1x8',
      '1x4',
      '1x3',
      '1x2',
      '1x1',
      '2x1',
      '3x1',
      '4x1',
      '8x1',
    ]);
  });
});

describe('computeLineGannRays', () => {
  it('builds nine rays', () => {
    expect(computeLineGannRays(GANN_OPTS)).toHaveLength(9);
  });

  it('takes the ratio as price units over time units', () => {
    const rays = computeLineGannRays(GANN_OPTS);
    const byId = (id: string) => rays.find((r) => r.id === id)!;
    expect(byId('1x1').ratio).toBe(1);
    expect(byId('2x1').ratio).toBe(2);
    expect(byId('1x2').ratio).toBe(0.5);
    expect(byId('1x8').ratio).toBe(0.125);
  });

  it('scales the slope by the price-per-unit for an up fan', () => {
    const rays = computeLineGannRays({ pricePerUnit: 3, direction: 'up' });
    const byId = (id: string) => rays.find((r) => r.id === id)!;
    expect(byId('1x1').slope).toBe(3);
    expect(byId('2x1').slope).toBe(6);
    expect(byId('1x2').slope).toBe(1.5);
  });

  it('negates the slope for a down fan', () => {
    const rays = computeLineGannRays({ pricePerUnit: 3, direction: 'down' });
    const byId = (id: string) => rays.find((r) => r.id === id)!;
    expect(byId('1x1').slope).toBe(-3);
    expect(byId('2x1').slope).toBe(-6);
  });

  it('defaults the price-per-unit to one', () => {
    expect(
      computeLineGannRays().find((r) => r.id === '1x1')!.slope,
    ).toBe(1);
  });

  it('flags only the 1x1 ray as primary', () => {
    const rays = computeLineGannRays(GANN_OPTS);
    expect(rays.filter((r) => r.isPrimary).map((r) => r.id)).toEqual(['1x1']);
  });
});

describe('runLineGann', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineGann(GANN_DATA, GANN_OPTS).ok).toBe(true);
  });

  it('resolves the pivot point from the pivot index', () => {
    const run = runLineGann(GANN_DATA, GANN_OPTS);
    expect(run.pivotIndex).toBe(0);
    expect(run.pivot).toEqual({ x: 0, value: 10 });
  });

  it('carries the price-per-unit and direction onto the run', () => {
    const run = runLineGann(GANN_DATA, GANN_OPTS);
    expect(run.pricePerUnit).toBe(3);
    expect(run.direction).toBe('up');
  });

  it('exposes the nine fan rays', () => {
    expect(runLineGann(GANN_DATA, GANN_OPTS).rays).toHaveLength(9);
  });

  it('produces one sample per series point', () => {
    expect(runLineGann(GANN_DATA, GANN_OPTS).samples).toHaveLength(9);
  });

  it('classifies each sample by price position versus the 1x1 ray', () => {
    const run = runLineGann(GANN_DATA, GANN_OPTS);
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[1]!.position).toBe('above');
    expect(run.samples[2]!.position).toBe('below');
    expect(run.samples[4]!.position).toBe('above');
  });

  it('counts bars above and below the 1x1 ray', () => {
    const run = runLineGann(GANN_DATA, GANN_OPTS);
    expect(run.aboveCount).toBe(4);
    expect(run.belowCount).toBe(4);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineGann([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.pivot).toBeNull();
  });

  it('clamps an out-of-range pivot index to the last point', () => {
    const run = runLineGann(GANN_DATA, { ...GANN_OPTS, pivotIndex: 99 });
    expect(run.pivotIndex).toBe(8);
    expect(run.pivot).toEqual({ x: 8, value: 40 });
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...GANN_DATA].reverse();
    const run = runLineGann(shuffled, GANN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(run.samples[0]!.position).toBe('on');
  });

  it('defaults the pivot index, price-per-unit and direction', () => {
    const run = runLineGann(GANN_DATA);
    expect(run.pivotIndex).toBe(0);
    expect(run.pricePerUnit).toBe(1);
    expect(run.direction).toBe('up');
  });
});

describe('computeLineGannLayout', () => {
  const base = {
    data: GANN_DATA,
    pivotIndex: 0,
    pricePerUnit: 3,
    direction: 'up' as const,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineGannLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(9);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineGannLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('emits one line per fan ray', () => {
    const layout = computeLineGannLayout(base);
    expect(layout.rayLines).toHaveLength(9);
    expect(layout.priceDots).toHaveLength(9);
  });

  it('projects the pivot to the panel corner for the index-0 pivot', () => {
    const layout = computeLineGannLayout(base);
    expect(layout.pivotPx).toBe(layout.panel.x);
    expect(layout.pivotPy).toBe(layout.panel.y + layout.panel.height);
  });

  it('spans a y domain covering the price range', () => {
    const layout = computeLineGannLayout(base);
    expect(layout.yMin).toBe(10);
    expect(layout.yMax).toBe(40);
  });

  it('projects each ray to its endpoint value at the last x', () => {
    const layout = computeLineGannLayout(base);
    expect(layout.rayLines.map((r) => r.endValue)).toEqual([
      13, 16, 18, 22, 34, 58, 82, 106, 202,
    ]);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineGannLayout(base);
    expect(layout.aboveCount).toBe(4);
    expect(layout.belowCount).toBe(4);
    expect(layout.pivotValue).toBe(10);
    expect(layout.direction).toBe('up');
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineGannLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineGannLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineGannChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineGannChart(GANN_DATA, GANN_OPTS);
    expect(text).toContain('Gann fan');
    expect(text).toContain('1x1');
    expect(text).toContain('45-degree');
    expect(text).toContain('ray');
    expect(text).toContain('pivot');
  });

  it('reports the above and below counts', () => {
    const text = describeLineGannChart(GANN_DATA, GANN_OPTS);
    expect(text).toContain('above the 1x1 ray on 4');
    expect(text).toContain('below on 4');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineGannChart([])).toBe('No data');
    expect(describeLineGannChart(null)).toBe('No data');
  });
});

describe('<ChartLineGann />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-gann-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Gann fan');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-gann"]');
    expect(root!.getAttribute('data-pivot-index')).toBe('0');
    expect(root!.getAttribute('data-pivot-value')).toBe('10');
    expect(root!.getAttribute('data-price-per-unit')).toBe('3');
    expect(root!.getAttribute('data-direction')).toBe('up');
    expect(root!.getAttribute('data-above-count')).toBe('4');
    expect(root!.getAttribute('data-below-count')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('9');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with a clip path', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gann-svg"]'),
    ).not.toBeNull();
    expect(container.querySelector('clipPath')).not.toBeNull();
  });

  it('renders nine fan rays', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gann-ray"]'),
    ).toHaveLength(9);
  });

  it('flags exactly one ray as the primary 1x1', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    const primary = container.querySelectorAll(
      '[data-section="chart-line-gann-ray"][data-primary="true"]',
    );
    expect(primary).toHaveLength(1);
    expect(primary[0]!.getAttribute('data-ray-id')).toBe('1x1');
  });

  it('renders the pivot marker', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gann-pivot"]'),
    ).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gann-price-path"]'),
    ).not.toBeNull();
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-gann-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('renders the config badge with the fan direction', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-gann-badge-direction"]',
    );
    expect(badge!.textContent).toContain('up');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gann-price-path"]'),
    ).toBeNull();
  });

  it('hides the fan rays via the hidden set', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} hiddenSeries={['fan']} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gann-ray"]'),
    ).toHaveLength(0);
  });

  it('hides the pivot marker via the hidden set', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} hiddenSeries={['pivot']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gann-pivot"]'),
    ).toBeNull();
  });

  it('hides every ray when showFan is false', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} showFan={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gann-ray"]'),
    ).toHaveLength(0);
  });

  it('hides the pivot marker when showPivot is false', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} showPivot={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gann-pivot"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineGann
        data={GANN_DATA}
        {...GANN_OPTS}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-gann-legend-item"][data-series-id="fan"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'fan', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gann-dot"]'),
    ).toHaveLength(9);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineGann data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-gann"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-gann-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gann-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineGann ref={ref} data={GANN_DATA} {...GANN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-gann');
  });

  it('has a stable displayName', () => {
    expect(ChartLineGann.displayName).toBe('ChartLineGann');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineGann data={GANN_DATA} {...GANN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-gann"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
