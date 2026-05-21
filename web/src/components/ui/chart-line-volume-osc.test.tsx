import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineVolumeOsc,
  computeLineVolumeOsc,
  computeLineVolumeOscLayout,
  computeLineVolumeOscSma,
  describeLineVolumeOscChart,
  getLineVolumeOscFinitePoints,
  normalizeLineVolumeOscPeriod,
  runLineVolumeOsc,
  type ChartLineVolumeOscPoint,
} from './chart-line-volume-osc';

/**
 * Fixture: a volume series periodic with period 4 -- [40,80,20,60] repeated.
 * Every 4-bar window holds one full cycle, so the slow SMA(4) is the constant
 * 200/4 = 50 wherever it is defined. The fast SMA(2) cycles through 60/50/40/50.
 * The oscillator is 100 * (fast - 50) / 50 = 2 * (fast - 50), so every reading
 * lands on an exact integer: -20 / 0 / 20.
 */
const VOLUME_OSC_DATA: ChartLineVolumeOscPoint[] = [
  { x: 1, volume: 40 },
  { x: 2, volume: 80 },
  { x: 3, volume: 20 },
  { x: 4, volume: 60 },
  { x: 5, volume: 40 },
  { x: 6, volume: 80 },
  { x: 7, volume: 20 },
  { x: 8, volume: 60 },
  { x: 9, volume: 40 },
  { x: 10, volume: 80 },
  { x: 11, volume: 20 },
  { x: 12, volume: 60 },
];
const VOLUMES = VOLUME_OSC_DATA.map((p) => p.volume);
const OPTS = { fastPeriod: 2, slowPeriod: 4 };

const FAST_EXPECTED = [null, 60, 50, 40, 50, 60, 50, 40, 50, 60, 50, 40];
const SLOW_EXPECTED = [
  null, null, null, 50, 50, 50, 50, 50, 50, 50, 50, 50,
];
const OSC_EXPECTED = [
  null, null, null, -20, 0, 20, 0, -20, 0, 20, 0, -20,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'contracting',
  'flat',
  'expanding',
  'flat',
  'contracting',
  'flat',
  'expanding',
  'flat',
  'contracting',
];

describe('getLineVolumeOscFinitePoints', () => {
  it('keeps only points with a finite x and a finite volume', () => {
    const out = getLineVolumeOscFinitePoints([
      { x: 1, volume: 10 },
      { x: Number.NaN, volume: 20 },
      { x: 3, volume: Number.POSITIVE_INFINITY },
      { x: 4, volume: 40 },
    ]);
    expect(out).toEqual([
      { x: 1, volume: 10 },
      { x: 4, volume: 40 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineVolumeOscFinitePoints(null)).toEqual([]);
    expect(getLineVolumeOscFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineVolumeOscFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineVolumeOscFinitePoints([
      { x: 9, volume: 1 },
      { x: 2, volume: 2 },
      { x: 5, volume: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineVolumeOscPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineVolumeOscPeriod(7, 5)).toBe(7);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineVolumeOscPeriod(6.8, 5)).toBe(6);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineVolumeOscPeriod(0, 5)).toBe(5);
    expect(normalizeLineVolumeOscPeriod(-3, 5)).toBe(5);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineVolumeOscPeriod(Number.NaN, 5)).toBe(5);
    expect(normalizeLineVolumeOscPeriod('x', 5)).toBe(5);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineVolumeOscPeriod(1, 5)).toBe(1);
  });
});

describe('computeLineVolumeOscSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineVolumeOscSma(null, 2)).toEqual([]);
  });

  it('keeps the warm-up window null', () => {
    const sma = computeLineVolumeOscSma([10, 20, 30, 40], 2);
    expect(sma[0]).toBeNull();
  });

  it('is the simple moving average of the window', () => {
    expect(computeLineVolumeOscSma([10, 20, 30, 40], 2)).toEqual([
      null, 15, 25, 35,
    ]);
  });

  it('matches the input length', () => {
    expect(computeLineVolumeOscSma(VOLUMES, 4)).toHaveLength(VOLUMES.length);
  });

  it('computes the fast and slow averages of the fixture', () => {
    expect(computeLineVolumeOscSma(VOLUMES, 2)).toEqual(FAST_EXPECTED);
    expect(computeLineVolumeOscSma(VOLUMES, 4)).toEqual(SLOW_EXPECTED);
  });
});

describe('computeLineVolumeOsc', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineVolumeOsc(null, 2, 4)).toEqual([]);
  });

  it('keeps the slow warm-up window null', () => {
    const osc = computeLineVolumeOsc(VOLUMES, 2, 4);
    expect(osc[0]).toBeNull();
    expect(osc[1]).toBeNull();
    expect(osc[2]).toBeNull();
  });

  it('is the percent spread of the fast and slow averages', () => {
    expect(computeLineVolumeOsc(VOLUMES, 2, 4)).toEqual(OSC_EXPECTED);
  });

  it('matches the input length', () => {
    expect(computeLineVolumeOsc(VOLUMES, 2, 4)).toHaveLength(VOLUMES.length);
  });

  it('is positive when the fast average leads the slow', () => {
    const osc = computeLineVolumeOsc(VOLUMES, 2, 4);
    expect(osc[5]).toBeGreaterThan(0);
  });

  it('is negative when the fast average lags the slow', () => {
    const osc = computeLineVolumeOsc(VOLUMES, 2, 4);
    expect(osc[3]).toBeLessThan(0);
  });

  it('is zero when the fast and slow averages match', () => {
    const osc = computeLineVolumeOsc(VOLUMES, 2, 4);
    expect(osc[4]).toBe(0);
  });

  it('returns null when the slow average is zero', () => {
    expect(computeLineVolumeOsc([0, 0, 0, 0, 0], 2, 4)).toEqual([
      null, null, null, null, null,
    ]);
  });
});

describe('runLineVolumeOsc', () => {
  it('is not ok for a series shorter than two points', () => {
    const run = runLineVolumeOsc([{ x: 1, volume: 10 }], OPTS);
    expect(run.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineVolumeOsc(VOLUME_OSC_DATA, OPTS).ok).toBe(true);
  });

  it('carries the fast and slow periods', () => {
    const run = runLineVolumeOsc(VOLUME_OSC_DATA, OPTS);
    expect(run.fastPeriod).toBe(2);
    expect(run.slowPeriod).toBe(4);
  });

  it('falls back to the default periods', () => {
    const run = runLineVolumeOsc(VOLUME_OSC_DATA);
    expect(run.fastPeriod).toBe(5);
    expect(run.slowPeriod).toBe(10);
  });

  it('computes the exact fast and slow average series', () => {
    const run = runLineVolumeOsc(VOLUME_OSC_DATA, OPTS);
    expect(run.fastMa).toEqual(FAST_EXPECTED);
    expect(run.slowMa).toEqual(SLOW_EXPECTED);
  });

  it('computes the exact oscillator series', () => {
    const run = runLineVolumeOsc(VOLUME_OSC_DATA, OPTS);
    expect(run.osc).toEqual(OSC_EXPECTED);
  });

  it('classifies the zone of every bar', () => {
    const run = runLineVolumeOsc(VOLUME_OSC_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('emits one sample per point', () => {
    const run = runLineVolumeOsc(VOLUME_OSC_DATA, OPTS);
    expect(run.samples).toHaveLength(VOLUME_OSC_DATA.length);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineVolumeOsc(VOLUME_OSC_DATA, OPTS);
    expect(run.expandingCount).toBe(2);
    expect(run.contractingCount).toBe(3);
    expect(run.flatCount).toBe(4);
    expect(
      run.expandingCount + run.contractingCount + run.flatCount,
    ).toBe(
      run.samples.filter((s) => s.zone !== 'none').length,
    );
  });

  it('reports the final oscillator reading', () => {
    const run = runLineVolumeOsc(VOLUME_OSC_DATA, OPTS);
    expect(run.oscFinal).toBe(-20);
  });

  it('sorts the input by x', () => {
    const shuffled = [...VOLUME_OSC_DATA].reverse();
    const run = runLineVolumeOsc(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(
      VOLUME_OSC_DATA.map((p) => p.x),
    );
    expect(run.osc).toEqual(OSC_EXPECTED);
  });
});

describe('computeLineVolumeOscLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineVolumeOscLayout({
      data: [{ x: 1, volume: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineVolumeOscLayout({
      data: VOLUME_OSC_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(
      computeLineVolumeOscLayout({ data: VOLUME_OSC_DATA, ...OPTS }).ok,
    ).toBe(true);
  });

  it('stacks the volume panel above the oscillator panel', () => {
    const layout = computeLineVolumeOscLayout({ data: VOLUME_OSC_DATA, ...OPTS });
    expect(layout.volumePanelBottom).toBeLessThanOrEqual(layout.oscPanelTop);
  });

  it('builds the volume and oscillator paths', () => {
    const layout = computeLineVolumeOscLayout({ data: VOLUME_OSC_DATA, ...OPTS });
    expect(layout.volumePath.startsWith('M')).toBe(true);
    expect(layout.oscPath.startsWith('M')).toBe(true);
  });

  it('emits one volume dot per point', () => {
    const layout = computeLineVolumeOscLayout({ data: VOLUME_OSC_DATA, ...OPTS });
    expect(layout.volumeDots).toHaveLength(VOLUME_OSC_DATA.length);
  });

  it('emits one marker per defined oscillator bar', () => {
    const layout = computeLineVolumeOscLayout({ data: VOLUME_OSC_DATA, ...OPTS });
    const defined = OSC_EXPECTED.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('places the zero line inside the oscillator panel', () => {
    const layout = computeLineVolumeOscLayout({ data: VOLUME_OSC_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.oscPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.oscPanelBottom);
  });

  it('carries the run on the layout', () => {
    const layout = computeLineVolumeOscLayout({ data: VOLUME_OSC_DATA, ...OPTS });
    expect(layout.run.oscFinal).toBe(-20);
  });
});

describe('describeLineVolumeOscChart', () => {
  it('names the indicator', () => {
    const text = describeLineVolumeOscChart(VOLUME_OSC_DATA, OPTS);
    expect(text).toContain('Volume Oscillator');
  });

  it('mentions the percent spread of moving averages', () => {
    const text = describeLineVolumeOscChart(VOLUME_OSC_DATA, OPTS);
    expect(text).toContain('percent spread');
    expect(text).toContain('moving average');
  });

  it('reports the zone counts', () => {
    const text = describeLineVolumeOscChart(VOLUME_OSC_DATA, OPTS);
    expect(text).toContain('expands on 2');
    expect(text).toContain('contracts on 3');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineVolumeOscChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineVolumeOsc component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-volume-osc-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Volume Oscillator');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineVolumeOsc data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-volume-osc-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the period config', () => {
    const { container } = render(
      <ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-osc"]',
    );
    expect(root?.getAttribute('data-fast-period')).toBe('2');
    expect(root?.getAttribute('data-slow-period')).toBe('4');
    expect(root?.getAttribute('data-osc-final')).toBe('-20');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the volume and oscillator lines', () => {
    const { container } = render(
      <ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-volume-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-volume-osc-osc-line"]'),
    ).toBeInTheDocument();
  });

  it('draws the zero line', () => {
    const { container } = render(
      <ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-volume-osc-zero-line"]'),
    ).toBeInTheDocument();
  });

  it('renders one marker per defined oscillator bar', () => {
    const { container } = render(
      <ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-volume-osc-marker"]',
    );
    expect(markers).toHaveLength(OSC_EXPECTED.filter((v) => v !== null).length);
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-volume-osc-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('shows the config badge', () => {
    const { container } = render(
      <ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-volume-osc-badge-config"]',
    );
    expect(badge?.textContent).toBe('VO 2/4');
  });

  it('hides the oscillator line when its legend item is toggled', () => {
    const { container } = render(
      <ChartLineVolumeOsc data={VOLUME_OSC_DATA} {...OPTS} />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-volume-osc-legend-item"][data-series-id="osc"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-volume-osc-osc-line"]'),
    ).not.toBeInTheDocument();
  });

  it('honours a controlled hiddenSeries for the volume line', () => {
    const { container } = render(
      <ChartLineVolumeOsc
        data={VOLUME_OSC_DATA}
        {...OPTS}
        hiddenSeries={['volume']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-volume-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineVolumeOsc
        data={VOLUME_OSC_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-volume-osc-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVolumeOsc ref={ref} data={VOLUME_OSC_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-volume-osc',
    );
  });
});
