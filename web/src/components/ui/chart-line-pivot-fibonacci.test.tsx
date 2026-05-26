import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLinePivotFibonacci,
  DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
  classifyLinePivotFibonacciZone,
  computeLinePivotFibonacci,
  computeLinePivotFibonacciLayout,
  computeLinePivotFibonacciLevels,
  describeLinePivotFibonacciChart,
  getLinePivotFibonacciFinitePoints,
  normalizeLinePivotFibonacciRatios,
  runLinePivotFibonacci,
  type ChartLinePivotFibonacciPoint,
} from './chart-line-pivot-fibonacci';

const toBars = (
  rows: Array<[number, number, number]>,
): ChartLinePivotFibonacciPoint[] =>
  rows.map(([h, l, c], i) => ({ x: i, high: h, low: l, close: c }));

// Constant series: every bar high = low = close = 5. range = 0 -> all
// levels equal the constant 5 bit-exact.
const CONST_FLAT: ChartLinePivotFibonacciPoint[] = Array.from(
  { length: 10 },
  (_, i) => ({ x: i, high: 5, low: 5, close: 5 }),
);

// Worked anchor: prev bar H=12, L=6, C=9 -> range = 6, pp = 9.
// r3 = 9 + 6 = 15 exact, s3 = 9 - 6 = 3 exact.
// r1 = 9 + 0.382 * 6 = 11.292 (toBeCloseTo).
// r2 = 9 + 0.618 * 6 = 12.708 (toBeCloseTo).
const WORKED: ChartLinePivotFibonacciPoint[] = toBars([
  [12, 6, 9],
  [15, 8, 12],
  [13, 7, 10],
  [14, 9, 11],
  [16, 10, 13],
]);

const RISING: ChartLinePivotFibonacciPoint[] = Array.from(
  { length: 20 },
  (_, i) => ({ x: i, high: 10 + i + 1, low: 10 + i - 1, close: 10 + i }),
);

const WAVE: ChartLinePivotFibonacciPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const v = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: v + 2, low: v - 2, close: v };
  },
);

describe('getLinePivotFibonacciFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLinePivotFibonacciFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLinePivotFibonacciFinitePoints(
        'nope' as unknown as ChartLinePivotFibonacciPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x/high/low/close or high < low', () => {
    const points: ChartLinePivotFibonacciPoint[] = [
      { x: 0, high: 10, low: 8, close: 9 },
      { x: Number.NaN, high: 10, low: 8, close: 9 },
      { x: 1, high: Number.NaN, low: 8, close: 9 },
      { x: 2, high: 10, low: Number.NaN, close: 9 },
      { x: 3, high: 10, low: 8, close: Number.NaN },
      { x: 4, high: 5, low: 10, close: 7 },
      { x: 5, high: 10, low: 8, close: 9 },
    ];
    const out = getLinePivotFibonacciFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 5]);
  });

  it('preserves input order', () => {
    const finite = getLinePivotFibonacciFinitePoints(WORKED.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...WORKED].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLinePivotFibonacciRatios', () => {
  it('returns a copy of the fallback when input is missing', () => {
    const out = normalizeLinePivotFibonacciRatios(
      null,
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(out).toEqual(DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS);
  });

  it('keeps individual ratios when valid', () => {
    const out = normalizeLinePivotFibonacciRatios(
      { level1: 0.25, level2: 0.5, level3: 0.75 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(out).toEqual({ level1: 0.25, level2: 0.5, level3: 0.75 });
  });

  it('falls back per-key for non-finite or negative ratios', () => {
    const out = normalizeLinePivotFibonacciRatios(
      { level1: Number.NaN, level2: -1 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(out.level1).toBe(DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS.level1);
    expect(out.level2).toBe(DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS.level2);
    expect(out.level3).toBe(DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS.level3);
  });

  it('accepts zero as a valid ratio', () => {
    const out = normalizeLinePivotFibonacciRatios(
      { level1: 0 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(out.level1).toBe(0);
  });
});

describe('computeLinePivotFibonacciLevels', () => {
  it('returns nulls when prev is null', () => {
    const lv = computeLinePivotFibonacciLevels(
      null,
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.pp).toBeNull();
    expect(lv.r1).toBeNull();
    expect(lv.s3).toBeNull();
  });

  it('returns nulls when prev has a non-finite field', () => {
    const lv = computeLinePivotFibonacciLevels(
      { x: 0, high: Number.NaN, low: 6, close: 9 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.pp).toBeNull();
  });

  it('worked anchor: prev H=12 L=6 C=9 -> pp=9 range=6 (bit-exact)', () => {
    const lv = computeLinePivotFibonacciLevels(
      { x: 0, high: 12, low: 6, close: 9 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.pp).toBe(9);
    expect(lv.range).toBe(6);
  });

  it('worked anchor: r3 = pp + range = 15 bit-exact', () => {
    const lv = computeLinePivotFibonacciLevels(
      { x: 0, high: 12, low: 6, close: 9 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.r3).toBe(15);
  });

  it('worked anchor: s3 = pp - range = 3 bit-exact', () => {
    const lv = computeLinePivotFibonacciLevels(
      { x: 0, high: 12, low: 6, close: 9 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.s3).toBe(3);
  });

  it('worked anchor: r1 = pp + 0.382 * range ~= 11.292', () => {
    const lv = computeLinePivotFibonacciLevels(
      { x: 0, high: 12, low: 6, close: 9 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.r1!).toBeCloseTo(9 + 0.382 * 6, 12);
  });

  it('worked anchor: r2 = pp + 0.618 * range ~= 12.708', () => {
    const lv = computeLinePivotFibonacciLevels(
      { x: 0, high: 12, low: 6, close: 9 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.r2!).toBeCloseTo(9 + 0.618 * 6, 12);
  });

  it('S levels mirror the R levels around the pivot', () => {
    const lv = computeLinePivotFibonacciLevels(
      { x: 0, high: 12, low: 6, close: 9 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.s1!).toBeCloseTo(2 * lv.pp! - lv.r1!, 12);
    expect(lv.s2!).toBeCloseTo(2 * lv.pp! - lv.r2!, 12);
    expect(lv.s3!).toBeCloseTo(2 * lv.pp! - lv.r3!, 12);
  });

  it('constant series produces every level equal to the constant (bit-exact)', () => {
    const lv = computeLinePivotFibonacciLevels(
      { x: 0, high: 5, low: 5, close: 5 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.pp).toBe(5);
    expect(lv.r1).toBe(5);
    expect(lv.s1).toBe(5);
    expect(lv.r2).toBe(5);
    expect(lv.s2).toBe(5);
    expect(lv.r3).toBe(5);
    expect(lv.s3).toBe(5);
    expect(lv.range).toBe(0);
  });

  it('R3 always sits above R2 above R1 above PP above S1 above S2 above S3', () => {
    const lv = computeLinePivotFibonacciLevels(
      { x: 0, high: 12, low: 6, close: 9 },
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(lv.r3!).toBeGreaterThan(lv.r2!);
    expect(lv.r2!).toBeGreaterThan(lv.r1!);
    expect(lv.r1!).toBeGreaterThan(lv.pp!);
    expect(lv.pp!).toBeGreaterThan(lv.s1!);
    expect(lv.s1!).toBeGreaterThan(lv.s2!);
    expect(lv.s2!).toBeGreaterThan(lv.s3!);
  });
});

describe('computeLinePivotFibonacci', () => {
  it('returns an empty list for non-array or empty input', () => {
    expect(
      computeLinePivotFibonacci(
        null,
        DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
      ),
    ).toEqual([]);
    expect(
      computeLinePivotFibonacci([], DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS),
    ).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLinePivotFibonacci(
      WORKED,
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(out).toHaveLength(WORKED.length);
  });

  it('leaves the first bar nulls (no prior)', () => {
    const out = computeLinePivotFibonacci(
      WORKED,
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(out[0]!.pp).toBeNull();
    expect(out[0]!.r1).toBeNull();
  });

  it('the second bar gets the worked anchor levels', () => {
    const out = computeLinePivotFibonacci(
      WORKED,
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    expect(out[1]!.pp).toBe(9);
    expect(out[1]!.r3).toBe(15);
    expect(out[1]!.s3).toBe(3);
  });

  it('a constant series leaves every defined bar at the constant (bit-exact)', () => {
    const out = computeLinePivotFibonacci(
      CONST_FLAT,
      DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
    );
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.pp).toBe(5);
      expect(out[i]!.r3).toBe(5);
      expect(out[i]!.s3).toBe(5);
    }
  });
});

describe('classifyLinePivotFibonacciZone', () => {
  const levels = computeLinePivotFibonacciLevels(
    { x: 0, high: 12, low: 6, close: 9 },
    DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS,
  );

  it('null close -> none', () => {
    expect(classifyLinePivotFibonacciZone(null, levels)).toBe('none');
  });

  it('close above R2 -> above-r2', () => {
    expect(classifyLinePivotFibonacciZone(13, levels)).toBe('above-r2');
  });

  it('close between R1 and R2 -> r1-to-r2', () => {
    expect(classifyLinePivotFibonacciZone(12, levels)).toBe('r1-to-r2');
  });

  it('close between PP and R1 -> pp-to-r1', () => {
    expect(classifyLinePivotFibonacciZone(10, levels)).toBe('pp-to-r1');
  });

  it('close at PP -> pp-to-r1 (the >= rule)', () => {
    expect(classifyLinePivotFibonacciZone(9, levels)).toBe('pp-to-r1');
  });

  it('close between S1 and PP -> s1-to-pp', () => {
    expect(classifyLinePivotFibonacciZone(8, levels)).toBe('s1-to-pp');
  });

  it('close below S2 -> below-s2', () => {
    expect(classifyLinePivotFibonacciZone(2, levels)).toBe('below-s2');
  });

  it('null levels -> none', () => {
    expect(
      classifyLinePivotFibonacciZone(10, {
        pp: null,
        r1: null,
        s1: null,
        r2: null,
        s2: null,
        r3: null,
        s3: null,
        range: null,
      }),
    ).toBe('none');
  });
});

describe('runLinePivotFibonacci', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      runLinePivotFibonacci([{ x: 0, high: 12, low: 6, close: 9 }]).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLinePivotFibonacci([]).ok).toBe(false);
    expect(runLinePivotFibonacci(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLinePivotFibonacci(WORKED).ok).toBe(true);
  });

  it('uses the default ratios when not given', () => {
    const run = runLinePivotFibonacci(WORKED);
    expect(run.ratios).toEqual(DEFAULT_CHART_LINE_PIVOT_FIBONACCI_RATIOS);
  });

  it('honours custom ratios', () => {
    const run = runLinePivotFibonacci(WORKED, {
      ratios: { level1: 0.25, level2: 0.5, level3: 0.75 },
    });
    expect(run.ratios).toEqual({ level1: 0.25, level2: 0.5, level3: 0.75 });
  });

  it('every constant-series bar (after the first) sits in pp-to-r1 by the >= rule', () => {
    const run = runLinePivotFibonacci(CONST_FLAT);
    for (let i = 1; i < run.samples.length; i += 1) {
      expect(run.samples[i]!.zone).toBe('pp-to-r1');
    }
  });

  it('self-consistent counts equal sample length', () => {
    const run = runLinePivotFibonacci(WAVE);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.aboveCount + run.belowCount + run.betweenCount + none,
    ).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLinePivotFibonacci(WAVE);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...WORKED].sort(() => -1);
    const run = runLinePivotFibonacci(shuffled);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final pivot point', () => {
    const run = runLinePivotFibonacci(CONST_FLAT);
    expect(run.ppFinal).toBe(5);
  });
});

describe('computeLinePivotFibonacciLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLinePivotFibonacciLayout({
        data: [{ x: 0, high: 12, low: 6, close: 9 }],
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLinePivotFibonacciLayout({
        data: WORKED,
        width: 60,
        height: 60,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLinePivotFibonacciLayout({ data: WORKED }).ok,
    ).toBe(true);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLinePivotFibonacciLayout({ data: WORKED });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLinePivotFibonacciLayout({ data: WORKED });
    expect(layout.priceDots).toHaveLength(WORKED.length);
  });

  it('emits 7 level segments per defined bar', () => {
    const layout = computeLinePivotFibonacciLayout({ data: WORKED });
    // 5 bars - 1 warm-up = 4 defined bars; 7 levels each => 28 segments.
    expect(layout.segments).toHaveLength(28);
  });

  it('emits one marker per defined-zone bar', () => {
    const layout = computeLinePivotFibonacciLayout({ data: WORKED });
    expect(layout.markers).toHaveLength(4);
  });

  it('every segment is one of the seven series IDs', () => {
    const layout = computeLinePivotFibonacciLayout({ data: WORKED });
    const valid = new Set(['pp', 'r1', 's1', 'r2', 's2', 'r3', 's3']);
    for (const seg of layout.segments) {
      expect(valid.has(seg.seriesId)).toBe(true);
    }
  });

  it('the value domain covers the close and the R3/S3 levels', () => {
    const layout = computeLinePivotFibonacciLayout({ data: WORKED });
    expect(layout.valueMin).toBeLessThanOrEqual(3);
    expect(layout.valueMax).toBeGreaterThanOrEqual(15);
  });

  it('carries the run', () => {
    const layout = computeLinePivotFibonacciLayout({ data: WORKED });
    expect(layout.run.ratios.level1).toBe(0.382);
  });
});

describe('describeLinePivotFibonacciChart', () => {
  it('names the indicator', () => {
    expect(describeLinePivotFibonacciChart(WORKED)).toContain('Fibonacci pivot');
  });

  it('mentions the ratios', () => {
    expect(describeLinePivotFibonacciChart(WORKED)).toContain('0.382');
    expect(describeLinePivotFibonacciChart(WORKED)).toContain('0.618');
  });

  it('mentions the pivot point formula', () => {
    expect(describeLinePivotFibonacciChart(WORKED)).toContain('prevHigh');
  });

  it('mentions the warm-up first bar', () => {
    expect(describeLinePivotFibonacciChart(WORKED)).toContain('first bar');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLinePivotFibonacciChart([])).toBe('No data');
    expect(describeLinePivotFibonacciChart(null)).toBe('No data');
  });
});

describe('<ChartLinePivotFibonacci />', () => {
  it('renders a labelled region', () => {
    render(<ChartLinePivotFibonacci data={WORKED} />);
    expect(
      screen.getByRole('region', { name: /Fibonacci pivot chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(<ChartLinePivotFibonacci data={WORKED} />);
    const desc = container.querySelector(
      '[data-section="chart-line-pivot-fibonacci-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Fibonacci pivot');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLinePivotFibonacci data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-fibonacci-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the ratios on the root', () => {
    const { container } = render(<ChartLinePivotFibonacci data={WORKED} />);
    const root = container.querySelector(
      '[data-section="chart-line-pivot-fibonacci"]',
    );
    expect(root?.getAttribute('data-ratio-level1')).toBe('0.382');
    expect(root?.getAttribute('data-ratio-level2')).toBe('0.618');
    expect(root?.getAttribute('data-ratio-level3')).toBe('1');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(<ChartLinePivotFibonacci data={WORKED} />);
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(<ChartLinePivotFibonacci data={WORKED} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-fibonacci-price-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one segment per level per defined bar (4 bars * 7 levels = 28)', () => {
    const { container } = render(<ChartLinePivotFibonacci data={WORKED} />);
    const segments = container.querySelectorAll(
      '[data-section="chart-line-pivot-fibonacci-segment"]',
    );
    expect(segments).toHaveLength(28);
  });

  it('renders markers for the defined-zone bars', () => {
    const { container } = render(<ChartLinePivotFibonacci data={WORKED} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pivot-fibonacci-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(<ChartLinePivotFibonacci data={WORKED} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pivot-fibonacci-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect([
        'above-r2',
        'r1-to-r2',
        'pp-to-r1',
        's1-to-pp',
        's2-to-s1',
        'below-s2',
      ]).toContain(zone);
    }
  });

  it('renders the config badge with the ratios', () => {
    const { container } = render(<ChartLinePivotFibonacci data={WORKED} />);
    const badge = container.querySelector(
      '[data-section="chart-line-pivot-fibonacci-badge-config"]',
    );
    expect(badge?.textContent).toContain('FIBPIVOT 0.382/0.618/1');
  });

  it('hides the PP segments via showPp=false', () => {
    const { container } = render(
      <ChartLinePivotFibonacci data={WORKED} showPp={false} />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-pivot-fibonacci-segment"][data-series-id="pp"]',
    );
    expect(segments).toHaveLength(0);
  });

  it('hides the level-3 segments via showLevel3=false', () => {
    const { container } = render(
      <ChartLinePivotFibonacci data={WORKED} showLevel3={false} />,
    );
    const r3 = container.querySelectorAll(
      '[data-section="chart-line-pivot-fibonacci-segment"][data-series-id="r3"]',
    );
    const s3 = container.querySelectorAll(
      '[data-section="chart-line-pivot-fibonacci-segment"][data-series-id="s3"]',
    );
    expect(r3).toHaveLength(0);
    expect(s3).toHaveLength(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLinePivotFibonacci
        data={WORKED}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pivot-fibonacci-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePivotFibonacci ref={ref} data={WORKED} />);
    expect(ref.current).not.toBeNull();
  });

  it('renders a rising fixture without throwing', () => {
    const { container } = render(<ChartLinePivotFibonacci data={RISING} />);
    expect(
      container.querySelector('[data-section="chart-line-pivot-fibonacci"]'),
    ).toBeInTheDocument();
  });
});
