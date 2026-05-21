import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineElderImpulse,
  classifyLineElderImpulse,
  computeLineElderImpulse,
  computeLineElderImpulseEma,
  computeLineElderImpulseLayout,
  describeLineElderImpulseChart,
  getLineElderImpulseFinitePoints,
  normalizeLineElderImpulsePeriod,
  runLineElderImpulse,
  type ChartLineElderImpulsePoint,
} from './chart-line-elder-impulse';

/**
 * Fixtures:
 * - CONST: a flat series. The EMA stays flat, fast EMA equals slow EMA so
 *   the MACD and its histogram are exactly zero, every slope is zero, so
 *   every bar (after the first) is BLUE -- exact, asserted with toEqual.
 * - RISING / FALLING: strongly accelerating monotone series. A strictly
 *   increasing series has a strictly positive EMA slope on every bar, so
 *   no bar can be red; a strictly decreasing one has a negative EMA slope,
 *   so no bar can be green. These are structural, not exact.
 */
const CONST_DATA: ChartLineElderImpulsePoint[] = [
  { x: 1, value: 50 },
  { x: 2, value: 50 },
  { x: 3, value: 50 },
  { x: 4, value: 50 },
  { x: 5, value: 50 },
  { x: 6, value: 50 },
];

const RISING_DATA: ChartLineElderImpulsePoint[] = [
  { x: 1, value: 10 },
  { x: 2, value: 20 },
  { x: 3, value: 40 },
  { x: 4, value: 80 },
  { x: 5, value: 160 },
  { x: 6, value: 320 },
  { x: 7, value: 640 },
  { x: 8, value: 1280 },
];

const FALLING_DATA: ChartLineElderImpulsePoint[] = [
  { x: 1, value: 1280 },
  { x: 2, value: 640 },
  { x: 3, value: 320 },
  { x: 4, value: 160 },
  { x: 5, value: 80 },
  { x: 6, value: 40 },
  { x: 7, value: 20 },
  { x: 8, value: 10 },
];

describe('getLineElderImpulseFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineElderImpulseFinitePoints([
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
    expect(getLineElderImpulseFinitePoints(null)).toEqual([]);
    expect(getLineElderImpulseFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineElderImpulseFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineElderImpulseFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineElderImpulsePeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineElderImpulsePeriod(20, 13)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineElderImpulsePeriod(9.7, 13)).toBe(9);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineElderImpulsePeriod(0, 13)).toBe(13);
    expect(normalizeLineElderImpulsePeriod(-4, 13)).toBe(13);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineElderImpulsePeriod(Number.NaN, 13)).toBe(13);
    expect(normalizeLineElderImpulsePeriod('x', 13)).toBe(13);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineElderImpulsePeriod(1, 13)).toBe(1);
  });
});

describe('computeLineElderImpulseEma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineElderImpulseEma(null, 3)).toEqual([]);
  });

  it('seeds from the first value', () => {
    const ema = computeLineElderImpulseEma([4, 8, 16], 3);
    expect(ema[0]).toBe(4);
  });

  it('is the exact dyadic EMA for a period-3 alpha of one half', () => {
    expect(computeLineElderImpulseEma([4, 8, 16], 3)).toEqual([4, 6, 11]);
  });

  it('keeps a constant series constant', () => {
    expect(computeLineElderImpulseEma([50, 50, 50, 50], 5)).toEqual([
      50, 50, 50, 50,
    ]);
  });

  it('matches the input length', () => {
    expect(computeLineElderImpulseEma([1, 2, 3, 4, 5], 13)).toHaveLength(5);
  });

  it('rises with a rising series', () => {
    const ema = computeLineElderImpulseEma([10, 20, 40, 80], 13);
    expect(ema[3]!).toBeGreaterThan(ema[0]!);
  });
});

describe('classifyLineElderImpulse', () => {
  it('is green when both slopes rise', () => {
    expect(classifyLineElderImpulse(1, 1)).toBe('green');
    expect(classifyLineElderImpulse(5, 0.1)).toBe('green');
  });

  it('is red when both slopes fall', () => {
    expect(classifyLineElderImpulse(-1, -1)).toBe('red');
    expect(classifyLineElderImpulse(-2, -0.5)).toBe('red');
  });

  it('is blue when the slopes disagree', () => {
    expect(classifyLineElderImpulse(1, -1)).toBe('blue');
    expect(classifyLineElderImpulse(-1, 1)).toBe('blue');
  });

  it('is blue when either slope is flat', () => {
    expect(classifyLineElderImpulse(0, 0)).toBe('blue');
    expect(classifyLineElderImpulse(1, 0)).toBe('blue');
    expect(classifyLineElderImpulse(0, 1)).toBe('blue');
  });

  it('is none when either slope is null', () => {
    expect(classifyLineElderImpulse(null, 1)).toBe('none');
    expect(classifyLineElderImpulse(1, null)).toBe('none');
  });
});

describe('computeLineElderImpulse', () => {
  it('returns empty arrays for a non-array input', () => {
    const out = computeLineElderImpulse(null);
    expect(out.ema).toEqual([]);
    expect(out.macd).toEqual([]);
    expect(out.hist).toEqual([]);
    expect(out.impulse).toEqual([]);
  });

  it('keeps the EMA of a constant series constant', () => {
    const out = computeLineElderImpulse([50, 50, 50, 50, 50, 50]);
    expect(out.ema).toEqual([50, 50, 50, 50, 50, 50]);
  });

  it('produces a zero MACD for a constant series', () => {
    const out = computeLineElderImpulse([50, 50, 50, 50, 50, 50]);
    expect(out.macd).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('produces a zero MACD histogram for a constant series', () => {
    const out = computeLineElderImpulse([50, 50, 50, 50, 50, 50]);
    expect(out.hist).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('classifies the first bar as none', () => {
    const out = computeLineElderImpulse([50, 50, 50, 50, 50, 50]);
    expect(out.impulse[0]).toBe('none');
  });

  it('classifies a flat series as blue after the first bar', () => {
    const out = computeLineElderImpulse([50, 50, 50, 50, 50, 50]);
    expect(out.impulse).toEqual([
      'none',
      'blue',
      'blue',
      'blue',
      'blue',
      'blue',
    ]);
  });

  it('matches the impulse length to the input', () => {
    const out = computeLineElderImpulse([10, 20, 40, 80]);
    expect(out.impulse).toHaveLength(4);
  });
});

describe('runLineElderImpulse', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineElderImpulse([{ x: 1, value: 50 }]).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineElderImpulse(CONST_DATA).ok).toBe(true);
  });

  it('carries the default periods', () => {
    const run = runLineElderImpulse(CONST_DATA);
    expect(run.emaPeriod).toBe(13);
    expect(run.fastPeriod).toBe(12);
    expect(run.slowPeriod).toBe(26);
    expect(run.signalPeriod).toBe(9);
  });

  it('honours custom periods', () => {
    const run = runLineElderImpulse(CONST_DATA, {
      emaPeriod: 8,
      fastPeriod: 6,
      slowPeriod: 18,
      signalPeriod: 5,
    });
    expect(run.emaPeriod).toBe(8);
    expect(run.slowPeriod).toBe(18);
  });

  it('keeps the EMA flat for a constant series', () => {
    expect(runLineElderImpulse(CONST_DATA).ema).toEqual([
      50, 50, 50, 50, 50, 50,
    ]);
  });

  it('produces a zero MACD histogram for a constant series', () => {
    expect(runLineElderImpulse(CONST_DATA).hist).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('classifies a constant series as blue after the first bar', () => {
    expect(runLineElderImpulse(CONST_DATA).impulse).toEqual([
      'none',
      'blue',
      'blue',
      'blue',
      'blue',
      'blue',
    ]);
  });

  it('has self-consistent impulse counts for a constant series', () => {
    const run = runLineElderImpulse(CONST_DATA);
    expect(run.greenCount).toBe(0);
    expect(run.redCount).toBe(0);
    expect(run.blueCount).toBe(5);
  });

  it('reports the final impulse class', () => {
    expect(runLineElderImpulse(CONST_DATA).impulseFinal).toBe('blue');
  });

  it('emits one sample per point with the first bar none', () => {
    const run = runLineElderImpulse(CONST_DATA);
    expect(run.samples).toHaveLength(CONST_DATA.length);
    expect(run.samples[0]!.impulse).toBe('none');
  });

  it('has a strictly positive EMA slope on a rising series', () => {
    const run = runLineElderImpulse(RISING_DATA);
    for (let i = 1; i < run.samples.length; i += 1) {
      expect(run.samples[i]!.emaSlope!).toBeGreaterThan(0);
    }
  });

  it('produces green bars and no red bars on a rising series', () => {
    const run = runLineElderImpulse(RISING_DATA);
    expect(run.redCount).toBe(0);
    expect(run.greenCount).toBeGreaterThanOrEqual(1);
  });

  it('produces red bars and no green bars on a falling series', () => {
    const run = runLineElderImpulse(FALLING_DATA);
    expect(run.greenCount).toBe(0);
    expect(run.redCount).toBeGreaterThanOrEqual(1);
  });

  it('sorts the input by x', () => {
    const shuffled = [...CONST_DATA].reverse();
    const run = runLineElderImpulse(shuffled);
    expect(run.series.map((p) => p.x)).toEqual(CONST_DATA.map((p) => p.x));
  });
});

describe('computeLineElderImpulseLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineElderImpulseLayout({
      data: [{ x: 1, value: 50 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineElderImpulseLayout({
      data: CONST_DATA,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineElderImpulseLayout({ data: CONST_DATA }).ok).toBe(true);
  });

  it('emits one segment between each pair of bars', () => {
    const layout = computeLineElderImpulseLayout({ data: CONST_DATA });
    expect(layout.segments).toHaveLength(CONST_DATA.length - 1);
  });

  it('emits one marker per bar', () => {
    const layout = computeLineElderImpulseLayout({ data: CONST_DATA });
    expect(layout.markers).toHaveLength(CONST_DATA.length);
  });

  it('colours each segment by its ending bar impulse', () => {
    const layout = computeLineElderImpulseLayout({ data: CONST_DATA });
    expect(layout.segments.map((s) => s.impulse)).toEqual([
      'blue',
      'blue',
      'blue',
      'blue',
      'blue',
    ]);
  });

  it('builds the EMA path', () => {
    const layout = computeLineElderImpulseLayout({ data: CONST_DATA });
    expect(layout.emaPath.startsWith('M')).toBe(true);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLineElderImpulseLayout({ data: RISING_DATA });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('carries the run on the layout', () => {
    const layout = computeLineElderImpulseLayout({ data: CONST_DATA });
    expect(layout.run.blueCount).toBe(5);
  });
});

describe('describeLineElderImpulseChart', () => {
  it('names the indicator', () => {
    expect(describeLineElderImpulseChart(CONST_DATA)).toContain(
      'Elder Impulse',
    );
  });

  it('mentions the EMA and the MACD histogram', () => {
    const text = describeLineElderImpulseChart(CONST_DATA);
    expect(text).toContain('EMA');
    expect(text).toContain('MACD histogram');
  });

  it('reports the impulse counts', () => {
    const text = describeLineElderImpulseChart(CONST_DATA);
    expect(text).toContain('blue on 5');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineElderImpulseChart([])).toBe('No data');
  });
});

describe('ChartLineElderImpulse component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineElderImpulse data={CONST_DATA} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineElderImpulse data={CONST_DATA} />);
    const desc = container.querySelector(
      '[data-section="chart-line-elder-impulse-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Elder Impulse');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineElderImpulse data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-elder-impulse-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(<ChartLineElderImpulse data={CONST_DATA} />);
    const root = container.querySelector(
      '[data-section="chart-line-elder-impulse"]',
    );
    expect(root?.getAttribute('data-ema-period')).toBe('13');
    expect(root?.getAttribute('data-blue-count')).toBe('5');
    expect(root?.getAttribute('data-impulse-final')).toBe('blue');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineElderImpulse data={CONST_DATA} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders one coloured segment between each pair of bars', () => {
    const { container } = render(<ChartLineElderImpulse data={CONST_DATA} />);
    const segments = container.querySelectorAll(
      '[data-section="chart-line-elder-impulse-segment"]',
    );
    expect(segments).toHaveLength(CONST_DATA.length - 1);
  });

  it('draws the impulse EMA line', () => {
    const { container } = render(<ChartLineElderImpulse data={CONST_DATA} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-impulse-ema-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per bar', () => {
    const { container } = render(<ChartLineElderImpulse data={CONST_DATA} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-elder-impulse-marker"]',
    );
    expect(markers).toHaveLength(CONST_DATA.length);
  });

  it('tags each marker with its impulse class', () => {
    const { container } = render(<ChartLineElderImpulse data={CONST_DATA} />);
    const markers = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-elder-impulse-marker"]',
      ),
    );
    expect(markers.map((m) => m.getAttribute('data-impulse'))).toEqual([
      'none',
      'blue',
      'blue',
      'blue',
      'blue',
      'blue',
    ]);
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineElderImpulse data={CONST_DATA} />);
    const badge = container.querySelector(
      '[data-section="chart-line-elder-impulse-badge-config"]',
    );
    expect(badge?.textContent).toBe('EI 13');
  });

  it('renders the impulse colour key', () => {
    const { container } = render(<ChartLineElderImpulse data={CONST_DATA} />);
    const keyItems = container.querySelectorAll(
      '[data-section="chart-line-elder-impulse-impulse-key-item"]',
    );
    expect(keyItems).toHaveLength(3);
  });

  it('hides the price segments when the price legend item is toggled', () => {
    const { container } = render(<ChartLineElderImpulse data={CONST_DATA} />);
    const button = container.querySelector(
      '[data-section="chart-line-elder-impulse-legend-item"][data-series-id="price"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-elder-impulse-segment"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the EMA line when showEma is false', () => {
    const { container } = render(
      <ChartLineElderImpulse data={CONST_DATA} showEma={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-impulse-ema-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineElderImpulse data={CONST_DATA} onPointClick={onPointClick} />,
    );
    const marker = container.querySelectorAll(
      '[data-section="chart-line-elder-impulse-marker"]',
    )[1] as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineElderImpulse ref={ref} data={CONST_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-elder-impulse',
    );
  });
});
