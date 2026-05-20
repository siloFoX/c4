import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineFractal,
  computeLineFractals,
  computeLineFractalLayout,
  getLineFractalFinitePoints,
  normalizeLineFractalWing,
  runLineFractals,
  describeLineFractalChart,
  type ChartLineFractalPoint,
} from './chart-line-fractal';

afterEach(() => cleanup());

// A Williams fractal with wing 2 is a 5-bar swing pivot: an up
// fractal strictly exceeds the two bars on each side, a down fractal
// is strictly below them. The values are chosen so the swings are
// unambiguous:
//   i=2 (20) > {5,8,7,3}    -> up
//   i=4 (3)  < {20,7,10,22} -> down
//   i=6 (22) > {3,10,6,9}   -> up
//   fractals = [null,null,'up',null,'down',null,'up',null,null]
const FRACTAL_DATA: ChartLineFractalPoint[] = [
  { x: 0, value: 5 },
  { x: 1, value: 8 },
  { x: 2, value: 20 },
  { x: 3, value: 7 },
  { x: 4, value: 3 },
  { x: 5, value: 10 },
  { x: 6, value: 22 },
  { x: 7, value: 6 },
  { x: 8, value: 9 },
];

describe('getLineFractalFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineFractalFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineFractalFinitePoints(null)).toEqual([]);
    expect(getLineFractalFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineFractalWing', () => {
  it('floors a fractional wing', () => {
    expect(normalizeLineFractalWing(2.8, 2)).toBe(2);
  });

  it('falls back for a sub-1, NaN or negative wing', () => {
    expect(normalizeLineFractalWing(0, 2)).toBe(2);
    expect(normalizeLineFractalWing(NaN, 2)).toBe(2);
    expect(normalizeLineFractalWing(-3, 2)).toBe(2);
  });
});

describe('computeLineFractals', () => {
  const values = FRACTAL_DATA.map((p) => p.value);

  it('detects up and down swing pivots', () => {
    expect(computeLineFractals(values, 2)).toEqual([
      null,
      null,
      'up',
      null,
      'down',
      null,
      'up',
      null,
      null,
    ]);
  });

  it('never marks the first wing or last wing bars', () => {
    const fractals = computeLineFractals(values, 2);
    expect(fractals[0]).toBeNull();
    expect(fractals[1]).toBeNull();
    expect(fractals[7]).toBeNull();
    expect(fractals[8]).toBeNull();
  });

  it('finds no fractals in a strictly monotonic series', () => {
    expect(computeLineFractals([1, 2, 3, 4, 5, 6, 7], 2)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('uses a strict comparison so a flat series has no fractals', () => {
    expect(computeLineFractals([5, 5, 5, 5, 5], 2)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('honours a custom wing of one (a 3-bar window)', () => {
    expect(computeLineFractals([1, 5, 2, 4, 1], 1)).toEqual([
      null,
      'up',
      'down',
      'up',
      null,
    ]);
  });

  it('returns all null when shorter than the 2*wing+1 window', () => {
    expect(computeLineFractals([1, 2, 3, 4], 2)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineFractals(null, 2)).toEqual([]);
  });
});

describe('runLineFractals', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineFractals(FRACTAL_DATA, { wing: 2 }).ok).toBe(true);
  });

  it('carries the wing onto the run', () => {
    expect(runLineFractals(FRACTAL_DATA, { wing: 2 }).wing).toBe(2);
  });

  it('exposes the per-bar fractal array', () => {
    const run = runLineFractals(FRACTAL_DATA, { wing: 2 });
    expect(run.fractals).toEqual([
      null,
      null,
      'up',
      null,
      'down',
      null,
      'up',
      null,
      null,
    ]);
  });

  it('collects the detected fractals as signals', () => {
    const run = runLineFractals(FRACTAL_DATA, { wing: 2 });
    expect(run.signals.map((g) => g.type)).toEqual(['up', 'down', 'up']);
    expect(run.signals.map((g) => g.index)).toEqual([2, 4, 6]);
  });

  it('counts up and down fractals', () => {
    const run = runLineFractals(FRACTAL_DATA, { wing: 2 });
    expect(run.upCount).toBe(2);
    expect(run.downCount).toBe(1);
  });

  it('reports the value of the most recent up and down fractal', () => {
    const run = runLineFractals(FRACTAL_DATA, { wing: 2 });
    expect(run.lastUp).toBe(22);
    expect(run.lastDown).toBe(3);
  });

  it('tags each sample with its fractal type', () => {
    const run = runLineFractals(FRACTAL_DATA, { wing: 2 });
    expect(run.samples[0]!.fractal).toBeNull();
    expect(run.samples[2]!.fractal).toBe('up');
    expect(run.samples[3]!.fractal).toBeNull();
    expect(run.samples[4]!.fractal).toBe('down');
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...FRACTAL_DATA].reverse();
    const run = runLineFractals(shuffled, { wing: 2 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(run.signals.map((g) => g.index)).toEqual([2, 4, 6]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineFractals([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineFractals([]).ok).toBe(false);
    expect(runLineFractals(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineFractals(FRACTAL_DATA, { wing: 2 }).samples).toHaveLength(9);
  });

  it('defaults to a wing of two', () => {
    expect(runLineFractals(FRACTAL_DATA).wing).toBe(2);
  });
});

describe('computeLineFractalLayout', () => {
  const base = {
    data: FRACTAL_DATA,
    wing: 2,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineFractalLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(9);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineFractalLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('emits one marker per detected fractal', () => {
    const layout = computeLineFractalLayout(base);
    expect(layout.markers).toHaveLength(3);
    expect(layout.priceDots).toHaveLength(9);
  });

  it('spans a y domain covering the price range', () => {
    const layout = computeLineFractalLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(3);
    expect(layout.yMax).toBeGreaterThanOrEqual(22);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineFractalLayout(base);
    expect(layout.upCount).toBe(2);
    expect(layout.downCount).toBe(1);
    expect(layout.wing).toBe(2);
  });

  it('tags the markers with their fractal type', () => {
    const layout = computeLineFractalLayout(base);
    expect(layout.markers.map((m) => m.type)).toEqual(['up', 'down', 'up']);
  });

  it('keeps the marker anchors inside the panel', () => {
    const layout = computeLineFractalLayout(base);
    for (const m of layout.markers) {
      expect(m.px).toBeGreaterThanOrEqual(layout.panel.x);
      expect(m.px).toBeLessThanOrEqual(layout.panel.x + layout.panel.width);
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineFractalLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineFractalLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineFractalChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineFractalChart(FRACTAL_DATA, { wing: 2 });
    expect(text).toContain('Williams Fractal');
    expect(text).toContain('swing');
    expect(text).toContain('reversal');
    expect(text).toContain('up fractal');
    expect(text).toContain('down fractal');
  });

  it('reports the up and down fractal counts', () => {
    const text = describeLineFractalChart(FRACTAL_DATA, { wing: 2 });
    expect(text).toContain('carries 2 up fractals');
    expect(text).toContain('and 1 down fractals');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineFractalChart([])).toBe('No data');
    expect(describeLineFractalChart(null)).toBe('No data');
  });
});

describe('<ChartLineFractal />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-fractal-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Williams Fractal');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} />,
    );
    const root = container.querySelector('[data-section="chart-line-fractal"]');
    expect(root!.getAttribute('data-wing')).toBe('2');
    expect(root!.getAttribute('data-up-count')).toBe('2');
    expect(root!.getAttribute('data-down-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('9');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price line', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-fractal-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-fractal-price-path"]'),
    ).not.toBeNull();
  });

  it('renders one marker per detected fractal', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-fractal-marker"]',
    );
    expect(markers).toHaveLength(3);
  });

  it('tags the markers with their fractal type', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} />,
    );
    const up = container.querySelectorAll(
      '[data-section="chart-line-fractal-marker"][data-fractal-type="up"]',
    );
    const down = container.querySelectorAll(
      '[data-section="chart-line-fractal-marker"][data-fractal-type="down"]',
    );
    expect(up).toHaveLength(2);
    expect(down).toHaveLength(1);
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-fractal-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });

  it('renders the config badge with the wing', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-fractal-badge-wing"]',
    );
    expect(badge!.textContent).toContain('2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-fractal-price-path"]'),
    ).toBeNull();
  });

  it('hides the up markers via the hidden set', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} hiddenSeries={['up']} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-fractal-marker"]',
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]!.getAttribute('data-fractal-type')).toBe('down');
  });

  it('hides the down markers via the hidden set', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} hiddenSeries={['down']} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-fractal-marker"]',
    );
    expect(markers).toHaveLength(2);
  });

  it('hides every marker when showFractals is false', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} showFractals={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-fractal-marker"]'),
    ).toHaveLength(0);
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineFractal
        data={FRACTAL_DATA}
        wing={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-fractal-legend-item"][data-series-id="up"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'up', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-fractal-dot"]'),
    ).toHaveLength(9);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineFractal data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-fractal"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-fractal-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-fractal-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFractal ref={ref} data={FRACTAL_DATA} wing={2} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-fractal',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineFractal.displayName).toBe('ChartLineFractal');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineFractal data={FRACTAL_DATA} wing={2} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-fractal"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
