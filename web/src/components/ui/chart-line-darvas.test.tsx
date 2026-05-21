import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDarvas,
  getLineDarvasFinitePoints,
  normalizeLineDarvasConfirm,
  computeLineDarvasBoxes,
  runLineDarvas,
  computeLineDarvasLayout,
  describeLineDarvasChart,
  DEFAULT_CHART_LINE_DARVAS_CONFIRM,
  type ChartLineDarvasPoint,
} from './chart-line-darvas';

afterEach(() => cleanup());

// OHLC bars hand-traced for confirm 2: box 0 forms its top at bar
// 0 (50), holds two bars, then bar 4 closes above it (52 > 50) --
// an upward breakout. Bar 5 leads a new formation; bar 6 sets a
// fresh high (62) so the box top there, holds two bars, and bar 9
// closes below the bottom (49 < 53) -- a downward breakout.
const DARVAS_BARS: ChartLineDarvasPoint[] = [
  { x: 0, high: 50, low: 40, close: 45 },
  { x: 1, high: 48, low: 42, close: 46 },
  { x: 2, high: 49, low: 41, close: 47 },
  { x: 3, high: 49, low: 43, close: 48 },
  { x: 4, high: 51, low: 45, close: 52 },
  { x: 5, high: 55, low: 52, close: 53 },
  { x: 6, high: 62, low: 54, close: 58 },
  { x: 7, high: 60, low: 53, close: 56 },
  { x: 8, high: 61, low: 55, close: 57 },
  { x: 9, high: 60, low: 50, close: 49 },
];
const OPTS = { confirm: 2 };

const BOXES_EXPECTED = [
  { startIndex: 0, endIndex: 4, top: 50, bottom: 40, status: 'broken-up' },
  { startIndex: 6, endIndex: 9, top: 62, bottom: 53, status: 'broken-down' },
];
const ZONE_EXPECTED = [
  'inside',
  'inside',
  'inside',
  'inside',
  'breakout-up',
  'none',
  'inside',
  'inside',
  'inside',
  'breakout-down',
];
const BOX_INDEX_EXPECTED = [0, 0, 0, 0, 0, -1, 1, 1, 1, 1];

describe('getLineDarvasFinitePoints', () => {
  it('keeps only bars with a finite x, high, low and close', () => {
    const points = [
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 1, high: Number.NaN, low: 3, close: 4 },
      { x: 2, high: 5, low: 3, close: Number.POSITIVE_INFINITY },
      { x: 3, high: 9, low: 7, close: 8 },
    ] as ChartLineDarvasPoint[];
    expect(getLineDarvasFinitePoints(points)).toEqual([
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 3, high: 9, low: 7, close: 8 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineDarvasFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineDarvasFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, high: 2, low: 1, close: 1.5 },
      { x: 2, high: 4, low: 3, close: 3.5 },
    ] as ChartLineDarvasPoint[];
    expect(getLineDarvasFinitePoints(points)).toEqual(points);
  });
});

describe('normalizeLineDarvasConfirm', () => {
  it('keeps a valid integer confirmation count', () => {
    expect(normalizeLineDarvasConfirm(3, 99)).toBe(3);
  });
  it('floors a fractional count', () => {
    expect(normalizeLineDarvasConfirm(2.8, 99)).toBe(2);
  });
  it('rejects a zero count', () => {
    expect(normalizeLineDarvasConfirm(0, 99)).toBe(99);
  });
  it('rejects a non-finite count', () => {
    expect(normalizeLineDarvasConfirm(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum count of 1', () => {
    expect(normalizeLineDarvasConfirm(1, 99)).toBe(1);
  });
});

describe('computeLineDarvasBoxes', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineDarvasBoxes(null, 2)).toEqual([]);
  });
  it('detects the hand-traced boxes', () => {
    expect(computeLineDarvasBoxes(DARVAS_BARS, 2)).toEqual(BOXES_EXPECTED);
  });
  it('records an upward breakout when the close clears the top', () => {
    const boxes = computeLineDarvasBoxes(DARVAS_BARS, 2);
    expect(boxes[0]!.status).toBe('broken-up');
    expect(boxes[0]!.top).toBe(50);
  });
  it('records a downward breakout when the close pierces the bottom', () => {
    const boxes = computeLineDarvasBoxes(DARVAS_BARS, 2);
    expect(boxes[1]!.status).toBe('broken-down');
    expect(boxes[1]!.bottom).toBe(53);
  });
  it('leaves a box still open at the end of the data active', () => {
    expect(computeLineDarvasBoxes(DARVAS_BARS.slice(0, 4), 2)).toEqual([
      { startIndex: 0, endIndex: 3, top: 50, bottom: 40, status: 'active' },
    ]);
  });
  it('finds no box when every bar makes a new high', () => {
    expect(
      computeLineDarvasBoxes(
        [
          { x: 0, high: 10, low: 5, close: 8 },
          { x: 1, high: 20, low: 6, close: 18 },
          { x: 2, high: 30, low: 7, close: 28 },
        ],
        2,
      ),
    ).toEqual([]);
  });
  it('starts the box at the high bar after a formation lead-in', () => {
    const boxes = computeLineDarvasBoxes(DARVAS_BARS, 2);
    expect(boxes[1]!.startIndex).toBe(6);
  });
});

describe('runLineDarvas', () => {
  it('is not ok with fewer than two bars', () => {
    expect(
      runLineDarvas([{ x: 0, high: 2, low: 1, close: 1.5 }], OPTS).ok,
    ).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineDarvas(DARVAS_BARS, OPTS).ok).toBe(true);
  });
  it('carries the resolved confirmation count', () => {
    expect(runLineDarvas(DARVAS_BARS, OPTS).confirm).toBe(2);
  });
  it('falls back to the default confirmation count', () => {
    expect(runLineDarvas(DARVAS_BARS).confirm).toBe(
      DEFAULT_CHART_LINE_DARVAS_CONFIRM,
    );
  });
  it('exposes the detected boxes', () => {
    expect(runLineDarvas(DARVAS_BARS, OPTS).boxes).toEqual(BOXES_EXPECTED);
  });
  it('classifies each bar against its box', () => {
    expect(runLineDarvas(DARVAS_BARS, OPTS).samples.map((s) => s.zone)).toEqual(
      ZONE_EXPECTED,
    );
  });
  it('assigns each bar to its box index', () => {
    expect(
      runLineDarvas(DARVAS_BARS, OPTS).samples.map((s) => s.boxIndex),
    ).toEqual(BOX_INDEX_EXPECTED);
  });
  it('returns one sample per bar', () => {
    expect(runLineDarvas(DARVAS_BARS, OPTS).samples).toHaveLength(
      DARVAS_BARS.length,
    );
  });
  it('counts the boxes and the breakout directions', () => {
    const run = runLineDarvas(DARVAS_BARS, OPTS);
    expect(run.boxCount).toBe(2);
    expect(run.breakoutUpCount).toBe(1);
    expect(run.breakoutDownCount).toBe(1);
  });
  it('keeps the close inside the box on non-breakout bars', () => {
    const run = runLineDarvas(DARVAS_BARS, OPTS);
    for (const s of run.samples) {
      if (s.zone === 'inside') {
        const box = run.boxes[s.boxIndex]!;
        expect(s.close).toBeLessThanOrEqual(box.top);
        expect(s.close).toBeGreaterThanOrEqual(box.bottom);
      }
    }
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...DARVAS_BARS].reverse();
    const run = runLineDarvas(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineDarvasLayout', () => {
  const base = {
    data: DARVAS_BARS,
    confirm: 2,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single bar', () => {
    expect(
      computeLineDarvasLayout({
        ...base,
        data: [{ x: 0, high: 2, low: 1, close: 1.5 }],
      }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineDarvasLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineDarvasLayout(base).ok).toBe(true);
  });
  it('builds the price path', () => {
    expect(computeLineDarvasLayout(base).pricePath.length).toBeGreaterThan(0);
  });
  it('emits one box rectangle per box', () => {
    const layout = computeLineDarvasLayout(base);
    expect(layout.boxRects).toHaveLength(2);
    expect(layout.boxRects[0]!.status).toBe('broken-up');
  });
  it('gives every box rectangle a positive width and height', () => {
    const layout = computeLineDarvasLayout(base);
    for (const r of layout.boxRects) {
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
    }
  });
  it('spans the y-domain across the price and the boxes', () => {
    const layout = computeLineDarvasLayout(base);
    expect(layout.yMin).toBe(40);
    expect(layout.yMax).toBe(62);
  });
  it('emits one marker per breakout bar', () => {
    const layout = computeLineDarvasLayout(base);
    expect(layout.markers).toHaveLength(2);
    expect(layout.priceDots).toHaveLength(DARVAS_BARS.length);
  });
  it('reports the box count and total points', () => {
    const layout = computeLineDarvasLayout(base);
    expect(layout.boxCount).toBe(2);
    expect(layout.totalPoints).toBe(DARVAS_BARS.length);
  });
});

describe('describeLineDarvasChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineDarvasChart([])).toBe('No data');
  });
  it('names the Darvas Boxes', () => {
    expect(describeLineDarvasChart(DARVAS_BARS, OPTS)).toContain(
      'Darvas Boxes',
    );
  });
  it('explains the new-high top and the breakout', () => {
    const desc = describeLineDarvasChart(DARVAS_BARS, OPTS);
    expect(desc).toContain('new high');
    expect(desc).toContain('consolidation');
    expect(desc).toContain('breakout');
  });
  it('reports the box count', () => {
    expect(describeLineDarvasChart(DARVAS_BARS, OPTS)).toContain(
      'found 2 boxes',
    );
  });
});

describe('ChartLineDarvas', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineDarvas data={DARVAS_BARS} {...OPTS} ariaLabel="Darvas demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('Darvas demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineDarvas data={[]} />);
    const root = container.querySelector('[data-section="chart-line-darvas"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-darvas"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the confirm count and box count as data attributes', () => {
    const { container } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-darvas"]');
    expect(root?.getAttribute('data-confirm')).toBe('2');
    expect(root?.getAttribute('data-box-count')).toBe('2');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    const svg = container.querySelector('[data-section="chart-line-darvas-svg"]');
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the price line', () => {
    const { container } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-darvas-price-path"]'),
    ).toBeTruthy();
  });
  it('renders one box rectangle per detected box', () => {
    const { container } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    const boxes = container.querySelectorAll(
      '[data-section="chart-line-darvas-box"]',
    );
    expect(boxes).toHaveLength(2);
  });
  it('renders one marker per breakout bar', () => {
    const { container } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-darvas-marker"]',
    );
    expect(markers).toHaveLength(2);
  });
  it('shows the confirm count in the config badge', () => {
    const { container } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-darvas-badge-config"]',
    );
    expect(cfg?.textContent).toBe('2');
  });
  it('renders two legend items', () => {
    const { container } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-darvas-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });
  it('toggles the boxes off when the legend item is clicked', () => {
    const { container } = render(<ChartLineDarvas data={DARVAS_BARS} {...OPTS} />);
    const boxesItem = container.querySelector(
      '[data-section="chart-line-darvas-legend-item"][data-series-id="boxes"]',
    ) as HTMLElement;
    fireEvent.click(boxesItem);
    expect(
      container.querySelector('[data-section="chart-line-darvas-box"]'),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineDarvas
        data={DARVAS_BARS}
        {...OPTS}
        hiddenSeries={new Set(['price'])}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-darvas-price-path"]'),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDarvas ref={ref} data={DARVAS_BARS} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
