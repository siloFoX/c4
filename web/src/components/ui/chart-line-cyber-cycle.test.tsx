import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineCyberCycle,
  classifyLineCyberCycleZone,
  computeLineCyberCycle,
  computeLineCyberCycleLayout,
  computeLineCyberCycleSmooth,
  describeLineCyberCycleChart,
  getLineCyberCycleFinitePoints,
  normalizeLineCyberCycleAlpha,
  runLineCyberCycle,
  type ChartLineCyberCyclePoint,
} from './chart-line-cyber-cycle';

/**
 * Fixtures:
 * - SHORT: a 6-bar series. Every bar is inside the smoother warm-up, so
 *   the cycle is the raw price second difference quartered -- exact
 *   integer arithmetic: [0,0,1,-4,5,-6].
 * - CONST: a flat series leaves every second difference at zero, so the
 *   cycle is exactly 0 throughout both the warm-up and the resonant path.
 * - CYCLE_DATA: a longer swinging series for the run / component checks.
 */
const SHORT_DATA: ChartLineCyberCyclePoint[] = [
  { x: 1, value: 40 },
  { x: 2, value: 48 },
  { x: 3, value: 60 },
  { x: 4, value: 56 },
  { x: 5, value: 72 },
  { x: 6, value: 64 },
];
const SHORT_CYCLE_EXPECTED = [0, 0, 1, -4, 5, -6];

const CONST_DATA: ChartLineCyberCyclePoint[] = [
  { x: 1, value: 50 },
  { x: 2, value: 50 },
  { x: 3, value: 50 },
  { x: 4, value: 50 },
  { x: 5, value: 50 },
  { x: 6, value: 50 },
  { x: 7, value: 50 },
  { x: 8, value: 50 },
];

const CYCLE_DATA: ChartLineCyberCyclePoint[] = [
  { x: 1, value: 40 },
  { x: 2, value: 42 },
  { x: 3, value: 46 },
  { x: 4, value: 52 },
  { x: 5, value: 50 },
  { x: 6, value: 44 },
  { x: 7, value: 38 },
  { x: 8, value: 40 },
  { x: 9, value: 48 },
  { x: 10, value: 56 },
  { x: 11, value: 52 },
  { x: 12, value: 46 },
  { x: 13, value: 42 },
  { x: 14, value: 48 },
];
const OPTS = { alpha: 0.5 };

describe('getLineCyberCycleFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineCyberCycleFinitePoints([
      { x: 1, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 3, value: Number.POSITIVE_INFINITY },
      { x: 4, value: 40 },
    ]);
    expect(out).toEqual([
      { x: 1, value: 10 },
      { x: 4, value: 40 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineCyberCycleFinitePoints(null)).toEqual([]);
    expect(getLineCyberCycleFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineCyberCycleFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineCyberCycleFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineCyberCycleAlpha', () => {
  it('keeps a valid alpha in the open unit interval', () => {
    expect(normalizeLineCyberCycleAlpha(0.5, 0.07)).toBe(0.5);
  });

  it('falls back when alpha is zero', () => {
    expect(normalizeLineCyberCycleAlpha(0, 0.07)).toBe(0.07);
  });

  it('falls back when alpha is one or above', () => {
    expect(normalizeLineCyberCycleAlpha(1, 0.07)).toBe(0.07);
    expect(normalizeLineCyberCycleAlpha(1.5, 0.07)).toBe(0.07);
  });

  it('falls back when alpha is negative', () => {
    expect(normalizeLineCyberCycleAlpha(-0.2, 0.07)).toBe(0.07);
  });

  it('falls back when alpha is not finite', () => {
    expect(normalizeLineCyberCycleAlpha(Number.NaN, 0.07)).toBe(0.07);
    expect(normalizeLineCyberCycleAlpha('x', 0.07)).toBe(0.07);
  });
});

describe('computeLineCyberCycleSmooth', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineCyberCycleSmooth(null)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineCyberCycleSmooth([6, 12, 18, 24, 30, 36])).toHaveLength(
      6,
    );
  });

  it('keeps the warm-up window null', () => {
    const smooth = computeLineCyberCycleSmooth([6, 12, 18, 24, 30, 36]);
    expect(smooth[0]).toBeNull();
    expect(smooth[2]).toBeNull();
    expect(smooth[3]).not.toBeNull();
  });

  it('is the four-tap weighted average of the window', () => {
    expect(computeLineCyberCycleSmooth([6, 12, 18, 24, 30, 36])).toEqual([
      null,
      null,
      null,
      15,
      21,
      27,
    ]);
  });

  it('keeps a constant series at its constant level', () => {
    expect(computeLineCyberCycleSmooth([9, 9, 9, 9, 9])).toEqual([
      null,
      null,
      null,
      9,
      9,
    ]);
  });

  it('yields null for a window with a non-finite value', () => {
    expect(
      computeLineCyberCycleSmooth([6, Number.NaN, 18, 24, 30])[3],
    ).toBeNull();
  });
});

describe('computeLineCyberCycle', () => {
  it('returns empty arrays for a non-array input', () => {
    const out = computeLineCyberCycle(null, 0.5);
    expect(out.smooth).toEqual([]);
    expect(out.cycle).toEqual([]);
    expect(out.trigger).toEqual([]);
  });

  it('matches every array to the input length', () => {
    const out = computeLineCyberCycle(
      SHORT_DATA.map((p) => p.value),
      0.5,
    );
    expect(out.smooth).toHaveLength(SHORT_DATA.length);
    expect(out.cycle).toHaveLength(SHORT_DATA.length);
    expect(out.trigger).toHaveLength(SHORT_DATA.length);
  });

  it('seeds the first two bars at zero', () => {
    const out = computeLineCyberCycle(
      SHORT_DATA.map((p) => p.value),
      0.5,
    );
    expect(out.cycle[0]).toBe(0);
    expect(out.cycle[1]).toBe(0);
  });

  it('uses the quartered price second difference during warm-up', () => {
    expect(
      computeLineCyberCycle(
        SHORT_DATA.map((p) => p.value),
        0.5,
      ).cycle,
    ).toEqual(SHORT_CYCLE_EXPECTED);
  });

  it('lags the trigger one bar behind the cycle', () => {
    const out = computeLineCyberCycle(
      SHORT_DATA.map((p) => p.value),
      0.5,
    );
    expect(out.trigger).toEqual([null, 0, 0, 1, -4, 5]);
  });

  it('holds the cycle at zero for a constant series', () => {
    expect(
      computeLineCyberCycle(
        CONST_DATA.map((p) => p.value),
        0.5,
      ).cycle.every((v) => v === 0),
    ).toBe(true);
  });

  it('holds the trigger at zero for a constant series', () => {
    const trigger = computeLineCyberCycle(
      CONST_DATA.map((p) => p.value),
      0.5,
    ).trigger;
    expect(trigger[0]).toBeNull();
    expect(trigger.slice(1).every((v) => v === 0)).toBe(true);
  });

  it('keeps every cycle reading finite for finite input', () => {
    for (const v of computeLineCyberCycle(
      CYCLE_DATA.map((p) => p.value),
      0.5,
    ).cycle) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('runs the resonant filter past the warm-up', () => {
    const out = computeLineCyberCycle(
      CYCLE_DATA.map((p) => p.value),
      0.5,
    );
    expect(out.cycle).toHaveLength(CYCLE_DATA.length);
    expect(Number.isFinite(out.cycle[13])).toBe(true);
  });

  it('produces a non-zero cycle for a varying series', () => {
    const cycle = computeLineCyberCycle(
      CYCLE_DATA.map((p) => p.value),
      0.5,
    ).cycle;
    expect(cycle.some((v) => v !== 0)).toBe(true);
  });
});

describe('classifyLineCyberCycleZone', () => {
  it('is up for a positive cycle', () => {
    expect(classifyLineCyberCycleZone(5)).toBe('up');
  });

  it('is down for a negative cycle', () => {
    expect(classifyLineCyberCycleZone(-5)).toBe('down');
  });

  it('is flat for a zero cycle', () => {
    expect(classifyLineCyberCycleZone(0)).toBe('flat');
  });

  it('is none for a null cycle', () => {
    expect(classifyLineCyberCycleZone(null)).toBe('none');
  });

  it('is none for a non-finite cycle', () => {
    expect(classifyLineCyberCycleZone(Number.NaN)).toBe('none');
  });
});

describe('runLineCyberCycle', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineCyberCycle([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineCyberCycle(CYCLE_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default alpha', () => {
    expect(runLineCyberCycle(CYCLE_DATA).alpha).toBe(0.07);
  });

  it('honours a custom alpha', () => {
    expect(runLineCyberCycle(CYCLE_DATA, OPTS).alpha).toBe(0.5);
  });

  it('computes the exact warm-up cycle for a short series', () => {
    expect(runLineCyberCycle(SHORT_DATA, OPTS).cycle).toEqual(
      SHORT_CYCLE_EXPECTED,
    );
  });

  it('classifies the warm-up cycle zones', () => {
    const run = runLineCyberCycle(SHORT_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual([
      'flat',
      'flat',
      'up',
      'down',
      'up',
      'down',
    ]);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineCyberCycle(SHORT_DATA, OPTS);
    expect(run.upCount).toBe(2);
    expect(run.downCount).toBe(2);
    expect(run.flatCount).toBe(2);
  });

  it('classifies a constant series as wholly flat', () => {
    const run = runLineCyberCycle(CONST_DATA, OPTS);
    expect(run.flatCount).toBe(CONST_DATA.length);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('emits one sample per point', () => {
    expect(runLineCyberCycle(CYCLE_DATA, OPTS).samples).toHaveLength(
      CYCLE_DATA.length,
    );
  });

  it('carries the smooth, cycle and trigger arrays', () => {
    const run = runLineCyberCycle(CYCLE_DATA, OPTS);
    expect(run.smooth).toHaveLength(CYCLE_DATA.length);
    expect(run.cycle).toHaveLength(CYCLE_DATA.length);
    expect(run.trigger).toHaveLength(CYCLE_DATA.length);
  });

  it('sorts the input by x', () => {
    const shuffled = [...CYCLE_DATA].reverse();
    const run = runLineCyberCycle(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(CYCLE_DATA.map((p) => p.x));
  });

  it('is not ok for an empty series', () => {
    expect(runLineCyberCycle([], OPTS).ok).toBe(false);
    expect(runLineCyberCycle(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineCyberCycleLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineCyberCycleLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineCyberCycleLayout({
      data: CYCLE_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineCyberCycleLayout({ data: CYCLE_DATA, ...OPTS }).ok).toBe(
      true,
    );
  });

  it('stacks the price panel above the cycle panel', () => {
    const layout = computeLineCyberCycleLayout({ data: CYCLE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.cyclePanelTop);
  });

  it('builds the price, cycle and trigger paths', () => {
    const layout = computeLineCyberCycleLayout({ data: CYCLE_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.cyclePath.startsWith('M')).toBe(true);
    expect(layout.triggerPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineCyberCycleLayout({ data: CYCLE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(CYCLE_DATA.length);
  });

  it('emits one marker per bar', () => {
    const layout = computeLineCyberCycleLayout({ data: CYCLE_DATA, ...OPTS });
    expect(layout.markers).toHaveLength(CYCLE_DATA.length);
  });

  it('places the zero line inside the cycle panel', () => {
    const layout = computeLineCyberCycleLayout({ data: CYCLE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.cyclePanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.cyclePanelBottom);
  });

  it('carries the run on the layout', () => {
    const layout = computeLineCyberCycleLayout({ data: CYCLE_DATA, ...OPTS });
    expect(layout.run.alpha).toBe(0.5);
  });
});

describe('describeLineCyberCycleChart', () => {
  it('names the indicator', () => {
    expect(describeLineCyberCycleChart(CYCLE_DATA, OPTS)).toContain(
      'Ehlers Cyber Cycle',
    );
  });

  it('mentions the smoothed second difference', () => {
    const text = describeLineCyberCycleChart(CYCLE_DATA, OPTS);
    expect(text).toContain('second difference');
    expect(text).toContain('smoothed');
  });

  it('reports the zone counts', () => {
    const run = runLineCyberCycle(CYCLE_DATA, OPTS);
    const text = describeLineCyberCycleChart(CYCLE_DATA, OPTS);
    expect(text).toContain(`above zero on ${run.upCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineCyberCycleChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineCyberCycle component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-cyber-cycle-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ehlers Cyber Cycle');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineCyberCycle data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-cyber-cycle-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run config', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cyber-cycle"]',
    );
    expect(root?.getAttribute('data-alpha')).toBe('0.5');
    expect(root?.getAttribute('data-total-points')).toBe('14');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price, cycle and trigger lines', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cyber-cycle-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-cyber-cycle-cycle-line"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-cyber-cycle-trigger-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('draws the zero line', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cyber-cycle-zero-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per bar', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-cyber-cycle-marker"]',
    );
    expect(markers).toHaveLength(CYCLE_DATA.length);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />,
    );
    const markers = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-cyber-cycle-marker"]',
      ),
    );
    for (const marker of markers) {
      expect(['up', 'down', 'flat']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-cyber-cycle-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('shows the config badge', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-cyber-cycle-badge-config"]',
    );
    expect(badge?.textContent).toBe('CC 0.5');
  });

  it('hides the cycle line when its legend item is toggled', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-cyber-cycle-legend-item"][data-series-id="cycle"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector(
        '[data-section="chart-line-cyber-cycle-cycle-line"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('hides the trigger line when showTrigger is false', () => {
    const { container } = render(
      <ChartLineCyberCycle data={CYCLE_DATA} {...OPTS} showTrigger={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cyber-cycle-trigger-line"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCyberCycle
        data={CYCLE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cyber-cycle-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCyberCycle ref={ref} data={CYCLE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-cyber-cycle',
    );
  });
});
