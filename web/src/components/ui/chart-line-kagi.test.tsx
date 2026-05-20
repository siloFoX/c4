import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineKagi,
  computeLineKagiTurns,
  computeLineKagiSegments,
  computeLineKagiLayout,
  getLineKagiFinitePoints,
  normalizeLineKagiReversal,
  runLineKagi,
  describeLineKagiChart,
  type ChartLineKagiPoint,
} from './chart-line-kagi';

afterEach(() => cleanup());

// With a reversal amount of 3 the Kagi line extends with the price
// and turns only on a 3-unit pullback:
//   10 ->14  start an up line                turns: 10,14
//   ->13 ->11 the 11 is a 3-unit pullback     turns: ...,11
//   ->16 a 5-unit rebound reverses up         turns: ...,16
//   ->12 a 4-unit pullback reverses down      turns: ...,12
//   ->20 an 8-unit rebound reverses up        turns: ...,20
// Turns: [10, 14, 11, 16, 12, 20].
const KAGI_DATA: ChartLineKagiPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 13 },
  { x: 3, value: 11 },
  { x: 4, value: 16 },
  { x: 5, value: 12 },
  { x: 6, value: 20 },
];

const KAGI_SEGMENTS = [
  { index: 0, fromValue: 10, toValue: 14, direction: 'up', thickness: 'thin' },
  { index: 1, fromValue: 14, toValue: 11, direction: 'down', thickness: 'thin' },
  { index: 2, fromValue: 11, toValue: 16, direction: 'up', thickness: 'thick' },
  { index: 3, fromValue: 16, toValue: 12, direction: 'down', thickness: 'thick' },
  { index: 4, fromValue: 12, toValue: 20, direction: 'up', thickness: 'thick' },
];

describe('getLineKagiFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineKagiFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineKagiFinitePoints(null)).toEqual([]);
    expect(getLineKagiFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineKagiReversal', () => {
  it('keeps a positive finite reversal amount', () => {
    expect(normalizeLineKagiReversal(3.5, 1)).toBe(3.5);
  });

  it('falls back for a zero, negative or non-finite amount', () => {
    expect(normalizeLineKagiReversal(0, 1)).toBe(1);
    expect(normalizeLineKagiReversal(-2, 1)).toBe(1);
    expect(normalizeLineKagiReversal(NaN, 1)).toBe(1);
  });
});

describe('computeLineKagiTurns', () => {
  const values = KAGI_DATA.map((p) => p.value);

  it('walks the price into Kagi turning points', () => {
    expect(computeLineKagiTurns(values, 3)).toEqual([10, 14, 11, 16, 12, 20]);
  });

  it('extends the line without a turn while the price advances', () => {
    expect(computeLineKagiTurns([10, 13, 15, 12], 3)).toEqual([10, 15, 12]);
  });

  it('collapses a monotonic run into a single segment', () => {
    expect(computeLineKagiTurns([10, 13, 16, 19], 3)).toEqual([10, 19]);
  });

  it('returns a single vertex when the price never reverses', () => {
    expect(computeLineKagiTurns([10, 11, 12, 11], 5)).toEqual([10]);
  });

  it('returns an empty array for a non-positive reversal amount', () => {
    expect(computeLineKagiTurns(values, 0)).toEqual([]);
    expect(computeLineKagiTurns(values, -3)).toEqual([]);
  });

  it('returns an empty array for non-array or empty input', () => {
    expect(computeLineKagiTurns(null, 3)).toEqual([]);
    expect(computeLineKagiTurns([], 3)).toEqual([]);
  });
});

describe('computeLineKagiSegments', () => {
  it('derives the segments with direction and thickness', () => {
    expect(computeLineKagiSegments([10, 14, 11, 16, 12, 20])).toEqual(
      KAGI_SEGMENTS,
    );
  });

  it('starts the line thin', () => {
    expect(computeLineKagiSegments([10, 14, 11, 16, 12, 20])[0]!.thickness).toBe(
      'thin',
    );
  });

  it('thickens when an up segment pushes past the prior shoulder', () => {
    const segs = computeLineKagiSegments([10, 14, 11, 16, 12, 20]);
    expect(segs[2]!.thickness).toBe('thick');
  });

  it('carries the thickness when a segment confirms nothing', () => {
    const segs = computeLineKagiSegments([10, 14, 11, 16, 12, 20]);
    expect(segs[3]!.thickness).toBe('thick');
  });

  it('returns an empty array for fewer than two turns', () => {
    expect(computeLineKagiSegments([10])).toEqual([]);
    expect(computeLineKagiSegments([])).toEqual([]);
  });
});

describe('runLineKagi', () => {
  it('reports ok when at least one segment forms', () => {
    expect(runLineKagi(KAGI_DATA, { reversalAmount: 3 }).ok).toBe(true);
  });

  it('carries the reversal amount onto the run', () => {
    expect(runLineKagi(KAGI_DATA, { reversalAmount: 3 }).reversalAmount).toBe(
      3,
    );
  });

  it('exposes the turning points', () => {
    expect(runLineKagi(KAGI_DATA, { reversalAmount: 3 }).turns).toEqual([
      10, 14, 11, 16, 12, 20,
    ]);
  });

  it('exposes the segment series', () => {
    expect(runLineKagi(KAGI_DATA, { reversalAmount: 3 }).segments).toEqual(
      KAGI_SEGMENTS,
    );
  });

  it('counts the up, down, thin and thick segments', () => {
    const run = runLineKagi(KAGI_DATA, { reversalAmount: 3 });
    expect(run.upCount).toBe(3);
    expect(run.downCount).toBe(2);
    expect(run.thinCount).toBe(2);
    expect(run.thickCount).toBe(3);
  });

  it('reports not-ok when the price never reverses', () => {
    const run = runLineKagi(
      [
        { x: 0, value: 10 },
        { x: 1, value: 11 },
      ],
      { reversalAmount: 5 },
    );
    expect(run.ok).toBe(false);
    expect(run.segments).toEqual([]);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...KAGI_DATA].reverse();
    const run = runLineKagi(shuffled, { reversalAmount: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.turns).toEqual([10, 14, 11, 16, 12, 20]);
  });

  it('defaults the reversal amount to one', () => {
    expect(runLineKagi(KAGI_DATA).reversalAmount).toBe(1);
  });
});

describe('computeLineKagiLayout', () => {
  const base = {
    data: KAGI_DATA,
    reversalAmount: 3,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineKagiLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.segmentCount).toBe(5);
  });

  it('emits one segment line per Kagi segment', () => {
    expect(computeLineKagiLayout(base).segmentLines).toHaveLength(5);
  });

  it('builds a path string for each segment', () => {
    const layout = computeLineKagiLayout(base);
    for (const s of layout.segmentLines) {
      expect(s.path.startsWith('M')).toBe(true);
    }
  });

  it('spans a y domain covering the turning points', () => {
    const layout = computeLineKagiLayout(base);
    expect(layout.yMin).toBe(10);
    expect(layout.yMax).toBe(20);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineKagiLayout(base);
    expect(layout.upCount).toBe(3);
    expect(layout.downCount).toBe(2);
    expect(layout.thinCount).toBe(2);
    expect(layout.thickCount).toBe(3);
    expect(layout.reversalAmount).toBe(3);
  });

  it('tags each segment line with its direction and thickness', () => {
    const layout = computeLineKagiLayout(base);
    expect(layout.segmentLines[0]!.direction).toBe('up');
    expect(layout.segmentLines[0]!.thickness).toBe('thin');
    expect(layout.segmentLines[2]!.thickness).toBe('thick');
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineKagiLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.segmentLines).toEqual([]);
  });

  it('returns a not-ok layout when the price never reverses', () => {
    const layout = computeLineKagiLayout({
      ...base,
      data: [
        { x: 0, value: 10 },
        { x: 1, value: 11 },
      ],
      reversalAmount: 5,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineKagiChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineKagiChart(KAGI_DATA, { reversalAmount: 3 });
    expect(text).toContain('Kagi');
    expect(text).toContain('reversal');
    expect(text).toContain('thin');
    expect(text).toContain('thick');
    expect(text).toContain('yang');
  });

  it('reports the segment counts', () => {
    const text = describeLineKagiChart(KAGI_DATA, { reversalAmount: 3 });
    expect(text).toContain('5 segments');
    expect(text).toContain('3 up');
    expect(text).toContain('2 down');
  });

  it('returns a no-data message when the price never reverses', () => {
    expect(describeLineKagiChart([])).toBe('No data');
    expect(describeLineKagiChart(null)).toBe('No data');
  });
});

describe('<ChartLineKagi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineKagi data={KAGI_DATA} reversalAmount={3} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineKagi data={KAGI_DATA} reversalAmount={3} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-kagi-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Kagi');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineKagi data={KAGI_DATA} reversalAmount={3} />,
    );
    const root = container.querySelector('[data-section="chart-line-kagi"]');
    expect(root!.getAttribute('data-reversal-amount')).toBe('3');
    expect(root!.getAttribute('data-segment-count')).toBe('5');
    expect(root!.getAttribute('data-up-count')).toBe('3');
    expect(root!.getAttribute('data-down-count')).toBe('2');
    expect(root!.getAttribute('data-thin-count')).toBe('2');
    expect(root!.getAttribute('data-thick-count')).toBe('3');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with one path per segment', () => {
    const { container } = render(
      <ChartLineKagi data={KAGI_DATA} reversalAmount={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kagi-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-kagi-segment"]'),
    ).toHaveLength(5);
  });

  it('tags the segments with their thickness', () => {
    const { container } = render(
      <ChartLineKagi data={KAGI_DATA} reversalAmount={3} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-kagi-segment"][data-thickness="thin"]',
      ),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-kagi-segment"][data-thickness="thick"]',
      ),
    ).toHaveLength(3);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineKagi data={KAGI_DATA} reversalAmount={3} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-kagi-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the reversal amount', () => {
    const { container } = render(
      <ChartLineKagi data={KAGI_DATA} reversalAmount={3} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-kagi-badge-reversal"]',
    );
    expect(badge!.textContent).toContain('3');
  });

  it('hides the thin segments via the hidden set', () => {
    const { container } = render(
      <ChartLineKagi data={KAGI_DATA} reversalAmount={3} hiddenSeries={['thin']} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-kagi-segment"]'),
    ).toHaveLength(3);
  });

  it('hides the thick segments via the hidden set', () => {
    const { container } = render(
      <ChartLineKagi
        data={KAGI_DATA}
        reversalAmount={3}
        hiddenSeries={['thick']}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-kagi-segment"]'),
    ).toHaveLength(2);
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineKagi
        data={KAGI_DATA}
        reversalAmount={3}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-kagi-legend-item"][data-series-id="thin"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'thin', hidden: true }]);
  });

  it('renders the empty state when the price never reverses', () => {
    const { container } = render(
      <ChartLineKagi
        data={[
          { x: 0, value: 10 },
          { x: 1, value: 11 },
        ]}
        reversalAmount={5}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-kagi"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-kagi-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineKagi
        data={KAGI_DATA}
        reversalAmount={3}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kagi-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKagi ref={ref} data={KAGI_DATA} reversalAmount={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-kagi');
  });

  it('has a stable displayName', () => {
    expect(ChartLineKagi.displayName).toBe('ChartLineKagi');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineKagi data={KAGI_DATA} reversalAmount={3} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-kagi"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
