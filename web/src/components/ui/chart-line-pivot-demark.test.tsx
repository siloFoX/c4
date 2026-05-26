import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLinePivotDemark,
  classifyLinePivotDemarkZone,
  computeLinePivotDemark,
  computeLinePivotDemarkDirection,
  computeLinePivotDemarkLayout,
  computeLinePivotDemarkLevels,
  computeLinePivotDemarkX,
  describeLinePivotDemarkChart,
  getLinePivotDemarkFinitePoints,
  runLinePivotDemark,
  type ChartLinePivotDemarkPoint,
} from './chart-line-pivot-demark';

const toBars = (
  rows: Array<[number, number, number, number]>,
): ChartLinePivotDemarkPoint[] =>
  rows.map(([o, h, l, c], i) => ({ x: i, open: o, high: h, low: l, close: c }));

const CONST_FLAT: ChartLinePivotDemarkPoint[] = Array.from(
  { length: 10 },
  (_, i) => ({ x: i, open: 5, high: 5, low: 5, close: 5 }),
);

// Three worked anchors covering bullish, bearish, and neutral.
// bull: prev O=10 H=14 L=8 C=12 -> X = 2*14 + 8 + 12 = 48, PP=12, R1=16, S1=10.
// bear: prev O=12 H=14 L=8 C=10 -> X = 14 + 2*8 + 10 = 40, PP=10, R1=12, S1=6.
// neut: prev O=10 H=14 L=8 C=10 -> X = 14 + 8 + 2*10 = 42, PP=10.5, R1=13, S1=7.
const WORKED: ChartLinePivotDemarkPoint[] = toBars([
  [10, 14, 8, 12], // bull prior
  [11, 16, 9, 14], // (this bar uses bull anchor)
  [13, 15, 11, 12],
  [12, 14, 10, 11],
  [11, 13, 9, 10],
]);

const RISING: ChartLinePivotDemarkPoint[] = Array.from(
  { length: 20 },
  (_, i) => ({
    x: i,
    open: 10 + i - 0.5,
    high: 10 + i + 1,
    low: 10 + i - 1,
    close: 10 + i + 0.5,
  }),
);

const WAVE: ChartLinePivotDemarkPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const v = 50 + 10 * Math.sin(i * 0.4);
    return {
      x: i,
      open: v - 0.3,
      high: v + 2,
      low: v - 2,
      close: v + 0.3,
    };
  },
);

describe('getLinePivotDemarkFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLinePivotDemarkFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLinePivotDemarkFinitePoints(
        'nope' as unknown as ChartLinePivotDemarkPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite OHLC or high < low', () => {
    const points: ChartLinePivotDemarkPoint[] = [
      { x: 0, open: 10, high: 14, low: 8, close: 12 },
      { x: Number.NaN, open: 10, high: 14, low: 8, close: 12 },
      { x: 1, open: Number.NaN, high: 14, low: 8, close: 12 },
      { x: 2, open: 10, high: Number.NaN, low: 8, close: 12 },
      { x: 3, open: 10, high: 14, low: Number.NaN, close: 12 },
      { x: 4, open: 10, high: 14, low: 8, close: Number.NaN },
      { x: 5, open: 10, high: 5, low: 14, close: 12 },
      { x: 6, open: 10, high: 14, low: 8, close: 12 },
    ];
    const out = getLinePivotDemarkFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 6]);
  });

  it('preserves input order', () => {
    const finite = getLinePivotDemarkFinitePoints(WORKED.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...WORKED].reverse().map((p) => p.x),
    );
  });
});

describe('computeLinePivotDemarkDirection', () => {
  it('close > open -> bullish', () => {
    expect(
      computeLinePivotDemarkDirection({
        x: 0,
        open: 10,
        high: 14,
        low: 8,
        close: 12,
      }),
    ).toBe('bullish');
  });

  it('close < open -> bearish', () => {
    expect(
      computeLinePivotDemarkDirection({
        x: 0,
        open: 12,
        high: 14,
        low: 8,
        close: 10,
      }),
    ).toBe('bearish');
  });

  it('close === open -> neutral', () => {
    expect(
      computeLinePivotDemarkDirection({
        x: 0,
        open: 10,
        high: 14,
        low: 8,
        close: 10,
      }),
    ).toBe('neutral');
  });
});

describe('computeLinePivotDemarkX', () => {
  it('bullish: X = 2*H + L + C (worked anchor 48 bit-exact)', () => {
    const { direction, x } = computeLinePivotDemarkX({
      x: 0,
      open: 10,
      high: 14,
      low: 8,
      close: 12,
    });
    expect(direction).toBe('bullish');
    expect(x).toBe(48);
  });

  it('bearish: X = H + 2*L + C (worked anchor 40 bit-exact)', () => {
    const { direction, x } = computeLinePivotDemarkX({
      x: 0,
      open: 12,
      high: 14,
      low: 8,
      close: 10,
    });
    expect(direction).toBe('bearish');
    expect(x).toBe(40);
  });

  it('neutral: X = H + L + 2*C (worked anchor 42 bit-exact)', () => {
    const { direction, x } = computeLinePivotDemarkX({
      x: 0,
      open: 10,
      high: 14,
      low: 8,
      close: 10,
    });
    expect(direction).toBe('neutral');
    expect(x).toBe(42);
  });
});

describe('computeLinePivotDemarkLevels', () => {
  it('returns null levels when prev is null', () => {
    const lv = computeLinePivotDemarkLevels(null);
    expect(lv.direction).toBeNull();
    expect(lv.x).toBeNull();
    expect(lv.pp).toBeNull();
    expect(lv.r1).toBeNull();
    expect(lv.s1).toBeNull();
  });

  it('returns null levels when prev has a non-finite field', () => {
    const lv = computeLinePivotDemarkLevels({
      x: 0,
      open: Number.NaN,
      high: 14,
      low: 8,
      close: 12,
    });
    expect(lv.pp).toBeNull();
  });

  it('bullish worked anchor: PP = 12, R1 = 16, S1 = 10 bit-exact', () => {
    const lv = computeLinePivotDemarkLevels({
      x: 0,
      open: 10,
      high: 14,
      low: 8,
      close: 12,
    });
    expect(lv.direction).toBe('bullish');
    expect(lv.x).toBe(48);
    expect(lv.pp).toBe(12);
    expect(lv.r1).toBe(16);
    expect(lv.s1).toBe(10);
  });

  it('bearish worked anchor: PP = 10, R1 = 12, S1 = 6 bit-exact', () => {
    const lv = computeLinePivotDemarkLevels({
      x: 0,
      open: 12,
      high: 14,
      low: 8,
      close: 10,
    });
    expect(lv.direction).toBe('bearish');
    expect(lv.x).toBe(40);
    expect(lv.pp).toBe(10);
    expect(lv.r1).toBe(12);
    expect(lv.s1).toBe(6);
  });

  it('neutral worked anchor: PP = 10.5, R1 = 13, S1 = 7 bit-exact (1/2 is dyadic)', () => {
    const lv = computeLinePivotDemarkLevels({
      x: 0,
      open: 10,
      high: 14,
      low: 8,
      close: 10,
    });
    expect(lv.direction).toBe('neutral');
    expect(lv.x).toBe(42);
    expect(lv.pp).toBe(10.5);
    expect(lv.r1).toBe(13);
    expect(lv.s1).toBe(7);
  });

  it('constant series: every level equals the constant (bit-exact)', () => {
    const lv = computeLinePivotDemarkLevels({
      x: 0,
      open: 5,
      high: 5,
      low: 5,
      close: 5,
    });
    expect(lv.pp).toBe(5);
    expect(lv.r1).toBe(5);
    expect(lv.s1).toBe(5);
  });

  it('R1 sits above PP sits above S1 for any non-degenerate prior', () => {
    const lv = computeLinePivotDemarkLevels({
      x: 0,
      open: 10,
      high: 14,
      low: 8,
      close: 12,
    });
    expect(lv.r1!).toBeGreaterThan(lv.pp!);
    expect(lv.pp!).toBeGreaterThan(lv.s1!);
  });
});

describe('computeLinePivotDemark', () => {
  it('returns an empty list for non-array or empty input', () => {
    expect(computeLinePivotDemark(null)).toEqual([]);
    expect(computeLinePivotDemark([])).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLinePivotDemark(WORKED);
    expect(out).toHaveLength(WORKED.length);
  });

  it('leaves the first bar nulls (no prior)', () => {
    const out = computeLinePivotDemark(WORKED);
    expect(out[0]!.pp).toBeNull();
    expect(out[0]!.direction).toBeNull();
  });

  it('the second bar carries the bullish worked anchor', () => {
    const out = computeLinePivotDemark(WORKED);
    expect(out[1]!.direction).toBe('bullish');
    expect(out[1]!.pp).toBe(12);
    expect(out[1]!.r1).toBe(16);
    expect(out[1]!.s1).toBe(10);
  });

  it('a constant series leaves every defined level at the constant (bit-exact)', () => {
    const out = computeLinePivotDemark(CONST_FLAT);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.pp).toBe(5);
      expect(out[i]!.r1).toBe(5);
      expect(out[i]!.s1).toBe(5);
      expect(out[i]!.direction).toBe('neutral');
    }
  });
});

describe('classifyLinePivotDemarkZone', () => {
  const levels = computeLinePivotDemarkLevels({
    x: 0,
    open: 10,
    high: 14,
    low: 8,
    close: 12,
  });
  // PP=12, R1=16, S1=10.

  it('null close -> none', () => {
    expect(classifyLinePivotDemarkZone(null, levels)).toBe('none');
  });

  it('close above R1 -> above-r1', () => {
    expect(classifyLinePivotDemarkZone(17, levels)).toBe('above-r1');
  });

  it('close between PP and R1 -> pp-to-r1', () => {
    expect(classifyLinePivotDemarkZone(15, levels)).toBe('pp-to-r1');
  });

  it('close at PP -> pp-to-r1 (the >= rule)', () => {
    expect(classifyLinePivotDemarkZone(12, levels)).toBe('pp-to-r1');
  });

  it('close between S1 and PP -> s1-to-pp', () => {
    expect(classifyLinePivotDemarkZone(11, levels)).toBe('s1-to-pp');
  });

  it('close at S1 -> s1-to-pp', () => {
    expect(classifyLinePivotDemarkZone(10, levels)).toBe('s1-to-pp');
  });

  it('close below S1 -> below-s1', () => {
    expect(classifyLinePivotDemarkZone(9, levels)).toBe('below-s1');
  });

  it('null levels -> none', () => {
    expect(
      classifyLinePivotDemarkZone(12, {
        direction: null,
        x: null,
        pp: null,
        r1: null,
        s1: null,
      }),
    ).toBe('none');
  });
});

describe('runLinePivotDemark', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      runLinePivotDemark([
        { x: 0, open: 10, high: 14, low: 8, close: 12 },
      ]).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLinePivotDemark([]).ok).toBe(false);
    expect(runLinePivotDemark(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLinePivotDemark(WORKED).ok).toBe(true);
  });

  it('the second bar carries the bullish worked levels', () => {
    const run = runLinePivotDemark(WORKED);
    expect(run.samples[1]!.levels.pp).toBe(12);
    expect(run.samples[1]!.levels.r1).toBe(16);
    expect(run.samples[1]!.levels.s1).toBe(10);
  });

  it('constant series counts every bar after the first as pp-to-r1 (close = PP, >= rule)', () => {
    const run = runLinePivotDemark(CONST_FLAT);
    for (let i = 1; i < run.samples.length; i += 1) {
      expect(run.samples[i]!.zone).toBe('pp-to-r1');
    }
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLinePivotDemark(WAVE);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.aboveCount + run.belowCount + run.betweenCount + none,
    ).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLinePivotDemark(WAVE);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...WORKED].sort(() => -1);
    const run = runLinePivotDemark(shuffled);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final pivot point', () => {
    const run = runLinePivotDemark(CONST_FLAT);
    expect(run.ppFinal).toBe(5);
  });

  it('exposes the direction on each defined sample', () => {
    const run = runLinePivotDemark(WORKED);
    expect(run.samples[1]!.levels.direction).toBe('bullish');
  });
});

describe('computeLinePivotDemarkLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLinePivotDemarkLayout({
        data: [{ x: 0, open: 10, high: 14, low: 8, close: 12 }],
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLinePivotDemarkLayout({
        data: WORKED,
        width: 60,
        height: 60,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLinePivotDemarkLayout({ data: WORKED }).ok).toBe(true);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLinePivotDemarkLayout({ data: WORKED });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLinePivotDemarkLayout({ data: WORKED });
    expect(layout.priceDots).toHaveLength(WORKED.length);
  });

  it('emits 3 level segments per defined bar', () => {
    const layout = computeLinePivotDemarkLayout({ data: WORKED });
    // 5 bars - 1 warm-up = 4 defined bars; 3 levels each => 12 segments.
    expect(layout.segments).toHaveLength(12);
  });

  it('emits one marker per defined-zone bar', () => {
    const layout = computeLinePivotDemarkLayout({ data: WORKED });
    expect(layout.markers).toHaveLength(4);
  });

  it('every segment is pp / r1 / s1', () => {
    const layout = computeLinePivotDemarkLayout({ data: WORKED });
    for (const seg of layout.segments) {
      expect(['pp', 'r1', 's1']).toContain(seg.seriesId);
    }
  });

  it('the value domain covers the close range', () => {
    const layout = computeLinePivotDemarkLayout({ data: WORKED });
    expect(layout.valueMin).toBeLessThanOrEqual(8);
    expect(layout.valueMax).toBeGreaterThanOrEqual(16);
  });

  it('carries the run', () => {
    const layout = computeLinePivotDemarkLayout({ data: WORKED });
    expect(layout.run.samples).toHaveLength(WORKED.length);
  });
});

describe('describeLinePivotDemarkChart', () => {
  it('names the indicator', () => {
    expect(describeLinePivotDemarkChart(WORKED)).toContain('DeMark');
  });

  it('mentions the direction-dependent X formula', () => {
    expect(describeLinePivotDemarkChart(WORKED)).toContain('bullish prior');
    expect(describeLinePivotDemarkChart(WORKED)).toContain('bearish prior');
    expect(describeLinePivotDemarkChart(WORKED)).toContain('neutral prior');
  });

  it('mentions the pivot point formula', () => {
    expect(describeLinePivotDemarkChart(WORKED)).toContain('X/4');
  });

  it('mentions the warm-up first bar', () => {
    expect(describeLinePivotDemarkChart(WORKED)).toContain('first bar');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLinePivotDemarkChart([])).toBe('No data');
    expect(describeLinePivotDemarkChart(null)).toBe('No data');
  });
});

describe('<ChartLinePivotDemark />', () => {
  it('renders a labelled region', () => {
    render(<ChartLinePivotDemark data={WORKED} />);
    expect(
      screen.getByRole('region', { name: /DeMark pivot chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(<ChartLinePivotDemark data={WORKED} />);
    const desc = container.querySelector(
      '[data-section="chart-line-pivot-demark-aria-desc"]',
    );
    expect(desc?.textContent).toContain('DeMark');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLinePivotDemark data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-pivot-demark-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the pivot final on the root', () => {
    const { container } = render(<ChartLinePivotDemark data={WORKED} />);
    const root = container.querySelector(
      '[data-section="chart-line-pivot-demark"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WORKED.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(<ChartLinePivotDemark data={WORKED} />);
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(<ChartLinePivotDemark data={WORKED} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-demark-price-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders 3 segments per defined bar (4 bars * 3 levels = 12)', () => {
    const { container } = render(<ChartLinePivotDemark data={WORKED} />);
    const segments = container.querySelectorAll(
      '[data-section="chart-line-pivot-demark-segment"]',
    );
    expect(segments).toHaveLength(12);
  });

  it('renders markers for the defined-zone bars', () => {
    const { container } = render(<ChartLinePivotDemark data={WORKED} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pivot-demark-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(<ChartLinePivotDemark data={WORKED} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pivot-demark-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect(['above-r1', 'pp-to-r1', 's1-to-pp', 'below-s1']).toContain(
        zone,
      );
    }
  });

  it('renders the config badge', () => {
    const { container } = render(<ChartLinePivotDemark data={WORKED} />);
    const badge = container.querySelector(
      '[data-section="chart-line-pivot-demark-badge-config"]',
    );
    expect(badge?.textContent).toContain('DEMARK PIVOT');
  });

  it('hides the PP segments via showPp=false', () => {
    const { container } = render(
      <ChartLinePivotDemark data={WORKED} showPp={false} />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-pivot-demark-segment"][data-series-id="pp"]',
    );
    expect(segments).toHaveLength(0);
  });

  it('hides the R1 segments via showR1=false', () => {
    const { container } = render(
      <ChartLinePivotDemark data={WORKED} showR1={false} />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-pivot-demark-segment"][data-series-id="r1"]',
    );
    expect(segments).toHaveLength(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLinePivotDemark
        data={WORKED}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pivot-demark-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePivotDemark ref={ref} data={WORKED} />);
    expect(ref.current).not.toBeNull();
  });

  it('renders a rising fixture without throwing', () => {
    const { container } = render(<ChartLinePivotDemark data={RISING} />);
    expect(
      container.querySelector('[data-section="chart-line-pivot-demark"]'),
    ).toBeInTheDocument();
  });
});
