import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAsi,
  getLineAsiFinitePoints,
  normalizeLineAsiLimitMove,
  computeLineAsiSwingIndex,
  computeLineAsi,
  runLineAsi,
  computeLineAsiLayout,
  describeLineAsiChart,
  DEFAULT_CHART_LINE_ASI_LIMIT_MOVE,
  type ChartLineAsiPoint,
} from './chart-line-asi';

afterEach(() => cleanup());

// Doji OHLC bars (open == close) whose ranges are all 8 and whose
// limit move is 4 -- both powers of two -- so every Swing Index
// lands on a quarter and the cumulative Accumulative Swing Index
// stays exact. The bars exercise each R branch (c, c, a, b, c).
const ASI_BARS: ChartLineAsiPoint[] = [
  { x: 0, open: 50, high: 54, low: 46, close: 50 },
  { x: 1, open: 54, high: 56, low: 48, close: 54 },
  { x: 2, open: 52, high: 56, low: 48, close: 52 },
  { x: 3, open: 58, high: 60, low: 52, close: 58 },
  { x: 4, open: 50, high: 58, low: 50, close: 50 },
  { x: 5, open: 50, high: 54, low: 46, close: 50 },
];
const OPTS = { limitMove: 4 };

const SI_EXPECTED = [null, 37.5, -18.75, 75, -100, 0];
const ASI_EXPECTED = [0, 37.5, 18.75, 93.75, -6.25, -6.25];
const ZONE_EXPECTED = ['none', 'up', 'down', 'up', 'down', 'flat'];

// Bars whose open differs from the close, exercising the
// open-weighted numerator term and the 0.25 * |Cp - Op| term in R.
const OPEN_BARS: ChartLineAsiPoint[] = [
  { x: 0, open: 40, high: 50, low: 40, close: 48 },
  { x: 1, open: 44, high: 56, low: 48, close: 52 },
  { x: 2, open: 46, high: 60, low: 46, close: 54 },
];

// Two identical flat bars: R collapses to zero, so the Swing
// Index is defined as zero rather than dividing by zero.
const FLAT_BARS: ChartLineAsiPoint[] = [
  { x: 0, open: 10, high: 10, low: 10, close: 10 },
  { x: 1, open: 10, high: 10, low: 10, close: 10 },
];

describe('getLineAsiFinitePoints', () => {
  it('keeps only bars with a finite x, open, high, low and close', () => {
    const points = [
      { x: 0, open: 1, high: 3, low: 0, close: 2 },
      { x: 1, open: Number.NaN, high: 3, low: 0, close: 2 },
      { x: 2, open: 1, high: 3, low: 0, close: Number.POSITIVE_INFINITY },
      { x: 3, open: 4, high: 6, low: 3, close: 5 },
    ] as ChartLineAsiPoint[];
    expect(getLineAsiFinitePoints(points)).toEqual([
      { x: 0, open: 1, high: 3, low: 0, close: 2 },
      { x: 3, open: 4, high: 6, low: 3, close: 5 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineAsiFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineAsiFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, open: 1, high: 2, low: 0, close: 1 },
      { x: 2, open: 3, high: 4, low: 2, close: 3 },
    ] as ChartLineAsiPoint[];
    expect(getLineAsiFinitePoints(points)).toEqual(points);
  });
});

describe('normalizeLineAsiLimitMove', () => {
  it('keeps a valid limit move', () => {
    expect(normalizeLineAsiLimitMove(4, 99)).toBe(4);
  });
  it('keeps a fractional limit move unchanged', () => {
    expect(normalizeLineAsiLimitMove(2.5, 99)).toBe(2.5);
  });
  it('rejects a zero limit move', () => {
    expect(normalizeLineAsiLimitMove(0, 99)).toBe(99);
  });
  it('rejects a negative limit move', () => {
    expect(normalizeLineAsiLimitMove(-3, 99)).toBe(99);
  });
  it('rejects a non-finite limit move', () => {
    expect(normalizeLineAsiLimitMove(Number.NaN, 99)).toBe(99);
  });
});

describe('computeLineAsiSwingIndex', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineAsiSwingIndex(null, 4)).toEqual([]);
  });
  it('leaves the opening bar null', () => {
    expect(computeLineAsiSwingIndex(ASI_BARS, 4)[0]).toBeNull();
  });
  it('computes the exact Wilder Swing Index series', () => {
    expect(computeLineAsiSwingIndex(ASI_BARS, 4)).toEqual(SI_EXPECTED);
  });
  it('weighs the open and prior-close terms', () => {
    expect(computeLineAsiSwingIndex(OPEN_BARS, 4)).toEqual([null, 100, 50]);
  });
  it('reads zero when the range collapses to zero', () => {
    expect(computeLineAsiSwingIndex(FLAT_BARS, 4)).toEqual([null, 0]);
  });
  it('is positive on an up-swing bar', () => {
    expect(computeLineAsiSwingIndex(ASI_BARS, 4)[1]!).toBeGreaterThan(0);
  });
  it('is negative on a down-swing bar', () => {
    expect(computeLineAsiSwingIndex(ASI_BARS, 4)[2]!).toBeLessThan(0);
  });
  it('matches the input length', () => {
    expect(computeLineAsiSwingIndex(ASI_BARS, 4)).toHaveLength(
      ASI_BARS.length,
    );
  });
});

describe('computeLineAsi', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineAsi(null, 4)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(computeLineAsi([], 4)).toEqual([]);
  });
  it('starts the cumulative line at zero', () => {
    expect(computeLineAsi(ASI_BARS, 4)[0]).toBe(0);
  });
  it('accumulates the Swing Index into an exact running total', () => {
    expect(computeLineAsi(ASI_BARS, 4)).toEqual(ASI_EXPECTED);
  });
  it('accumulates the open-weighted fixture', () => {
    expect(computeLineAsi(OPEN_BARS, 4)).toEqual([0, 100, 150]);
  });
  it('returns a single zero for a one-bar series', () => {
    expect(
      computeLineAsi([{ x: 0, open: 1, high: 2, low: 0, close: 1 }], 4),
    ).toEqual([0]);
  });
  it('matches the input length', () => {
    expect(computeLineAsi(ASI_BARS, 4)).toHaveLength(ASI_BARS.length);
  });
});

describe('runLineAsi', () => {
  it('is not ok with fewer than two bars', () => {
    expect(
      runLineAsi([{ x: 0, open: 1, high: 2, low: 0, close: 1 }], OPTS).ok,
    ).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineAsi(ASI_BARS, OPTS).ok).toBe(true);
  });
  it('carries the resolved limit move', () => {
    expect(runLineAsi(ASI_BARS, OPTS).limitMove).toBe(4);
  });
  it('falls back to the default limit move', () => {
    expect(runLineAsi(ASI_BARS).limitMove).toBe(
      DEFAULT_CHART_LINE_ASI_LIMIT_MOVE,
    );
  });
  it('exposes the exact Swing Index series', () => {
    expect(runLineAsi(ASI_BARS, OPTS).swingIndex).toEqual(SI_EXPECTED);
  });
  it('exposes the exact Accumulative Swing Index series', () => {
    expect(runLineAsi(ASI_BARS, OPTS).asi).toEqual(ASI_EXPECTED);
  });
  it('classifies each bar by the sign of its Swing Index', () => {
    expect(runLineAsi(ASI_BARS, OPTS).samples.map((s) => s.zone)).toEqual(
      ZONE_EXPECTED,
    );
  });
  it('returns one sample per bar', () => {
    expect(runLineAsi(ASI_BARS, OPTS).samples).toHaveLength(ASI_BARS.length);
  });
  it('counts the up, down and flat swings', () => {
    const run = runLineAsi(ASI_BARS, OPTS);
    expect(run.upCount).toBe(2);
    expect(run.downCount).toBe(2);
    expect(run.flatCount).toBe(1);
  });
  it('reports the final Accumulative Swing Index reading', () => {
    expect(runLineAsi(ASI_BARS, OPTS).asiFinal).toBe(-6.25);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...ASI_BARS].reverse();
    const run = runLineAsi(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineAsiLayout', () => {
  const base = {
    data: ASI_BARS,
    limitMove: 4,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single bar', () => {
    expect(
      computeLineAsiLayout({
        ...base,
        data: [{ x: 0, open: 1, high: 2, low: 0, close: 1 }],
      }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineAsiLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineAsiLayout(base).ok).toBe(true);
  });
  it('stacks the price panel above the Swing Index panel', () => {
    const layout = computeLineAsiLayout(base);
    expect(layout.pricePanel.y).toBeLessThan(layout.asiPanel.y);
  });
  it('builds the price and Accumulative Swing Index paths', () => {
    const layout = computeLineAsiLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.asiPath.length).toBeGreaterThan(0);
  });
  it('includes zero in the Swing Index y-domain', () => {
    const layout = computeLineAsiLayout(base);
    expect(layout.asiYMin).toBeLessThanOrEqual(0);
    expect(layout.asiYMax).toBeGreaterThanOrEqual(0);
  });
  it('emits one marker per scored bar', () => {
    const layout = computeLineAsiLayout(base);
    expect(layout.markers).toHaveLength(ASI_BARS.length - 1);
    expect(layout.priceDots).toHaveLength(ASI_BARS.length);
  });
  it('reports the total bar count and final reading', () => {
    const layout = computeLineAsiLayout(base);
    expect(layout.totalPoints).toBe(ASI_BARS.length);
    expect(layout.asiFinal).toBe(-6.25);
  });
});

describe('describeLineAsiChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineAsiChart([])).toBe('No data');
  });
  it('names the Accumulative Swing Index', () => {
    expect(describeLineAsiChart(ASI_BARS, OPTS)).toContain(
      'Accumulative Swing Index',
    );
  });
  it('credits the Wilder Swing Index', () => {
    const desc = describeLineAsiChart(ASI_BARS, OPTS);
    expect(desc).toContain('Wilder');
    expect(desc).toContain('Swing Index');
  });
  it('reports the zone counts', () => {
    expect(describeLineAsiChart(ASI_BARS, OPTS)).toContain('up on 2 bars');
  });
});

describe('ChartLineAsi', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineAsi data={ASI_BARS} {...OPTS} ariaLabel="ASI demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('ASI demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineAsi data={[]} />);
    const root = container.querySelector('[data-section="chart-line-asi"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-asi"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the limit move and final reading as data attributes', () => {
    const { container } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-asi"]');
    expect(root?.getAttribute('data-limit-move')).toBe('4');
    expect(root?.getAttribute('data-asi-final')).toBe('-6.25');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    const svg = container.querySelector('[data-section="chart-line-asi-svg"]');
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the Accumulative Swing Index line', () => {
    const { container } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-asi-asi-line"]'),
    ).toBeTruthy();
  });
  it('renders one marker per scored bar', () => {
    const { container } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-asi-marker"]',
    );
    expect(markers).toHaveLength(ASI_BARS.length - 1);
  });
  it('renders both panel labels', () => {
    const { container } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-asi-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });
  it('shows the limit move in the config badge', () => {
    const { container } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-asi-badge-config"]',
    );
    expect(cfg?.textContent).toBe('4');
  });
  it('renders two legend items', () => {
    const { container } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-asi-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });
  it('toggles the Accumulative Swing Index off via its legend item', () => {
    const { container } = render(<ChartLineAsi data={ASI_BARS} {...OPTS} />);
    const asiItem = container.querySelector(
      '[data-section="chart-line-asi-legend-item"][data-series-id="asi"]',
    ) as HTMLElement;
    fireEvent.click(asiItem);
    expect(
      container.querySelector('[data-section="chart-line-asi-asi-line"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineAsi
        data={ASI_BARS}
        {...OPTS}
        hiddenSeries={new Set(['price'])}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-asi-price-path"]'),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAsi ref={ref} data={ASI_BARS} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
