import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLinePivotWoodie,
  classifyLinePivotWoodieZone,
  computeLinePivotWoodie,
  computeLinePivotWoodieLayout,
  computeLinePivotWoodieLevels,
  describeLinePivotWoodieChart,
  getLinePivotWoodieFinitePoints,
  runLinePivotWoodie,
  type ChartLinePivotWoodiePoint,
} from './chart-line-pivot-woodie';

const toBars = (
  rows: Array<[number, number, number]>,
): ChartLinePivotWoodiePoint[] =>
  rows.map(([h, l, c], i) => ({ x: i, high: h, low: l, close: c }));

const CONST_FLAT: ChartLinePivotWoodiePoint[] = Array.from(
  { length: 10 },
  (_, i) => ({ x: i, high: 5, low: 5, close: 5 }),
);

// Worked anchor A: prev H=12, L=8, C=10. range=4. PP=(12+8+20)/4=10.
// R1 = 2*10 - 8 = 12. S1 = 2*10 - 12 = 8. R2 = 10+4 = 14. S2 = 10-4 = 6.
// Worked anchor B: prev H=14, L=6, C=12. range=8. PP=(14+6+24)/4=11.
// R1 = 22 - 6 = 16. S1 = 22 - 14 = 8. R2 = 11+8 = 19. S2 = 11-8 = 3.
const WORKED: ChartLinePivotWoodiePoint[] = toBars([
  [12, 8, 10], // anchor A becomes prev for bar 1
  [14, 6, 12], // anchor B becomes prev for bar 2
  [16, 10, 14],
  [15, 12, 13],
  [14, 11, 12],
]);

const RISING: ChartLinePivotWoodiePoint[] = Array.from(
  { length: 20 },
  (_, i) => ({
    x: i,
    high: 10 + i + 1,
    low: 10 + i - 1,
    close: 10 + i + 0.5,
  }),
);

const WAVE: ChartLinePivotWoodiePoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const v = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: v + 2, low: v - 2, close: v + 0.3 };
  },
);

describe('getLinePivotWoodieFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLinePivotWoodieFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLinePivotWoodieFinitePoints(
        'nope' as unknown as ChartLinePivotWoodiePoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x/high/low/close or high < low', () => {
    const points: ChartLinePivotWoodiePoint[] = [
      { x: 0, high: 12, low: 8, close: 10 },
      { x: Number.NaN, high: 12, low: 8, close: 10 },
      { x: 1, high: Number.NaN, low: 8, close: 10 },
      { x: 2, high: 12, low: Number.NaN, close: 10 },
      { x: 3, high: 12, low: 8, close: Number.NaN },
      { x: 4, high: 5, low: 10, close: 7 },
      { x: 5, high: 12, low: 8, close: 10 },
    ];
    const out = getLinePivotWoodieFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 5]);
  });

  it('preserves input order', () => {
    const finite = getLinePivotWoodieFinitePoints(WORKED.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...WORKED].reverse().map((p) => p.x),
    );
  });
});

describe('computeLinePivotWoodieLevels', () => {
  it('returns null levels when prev is null', () => {
    const lv = computeLinePivotWoodieLevels(null);
    expect(lv.pp).toBeNull();
    expect(lv.r1).toBeNull();
    expect(lv.s1).toBeNull();
    expect(lv.r2).toBeNull();
    expect(lv.s2).toBeNull();
    expect(lv.range).toBeNull();
  });

  it('returns null levels when prev has a non-finite field', () => {
    const lv = computeLinePivotWoodieLevels({
      x: 0,
      high: Number.NaN,
      low: 8,
      close: 10,
    });
    expect(lv.pp).toBeNull();
  });

  it('worked anchor A: H=12 L=8 C=10 -> PP=10, R1=12, S1=8, R2=14, S2=6 bit-exact', () => {
    const lv = computeLinePivotWoodieLevels({
      x: 0,
      high: 12,
      low: 8,
      close: 10,
    });
    expect(lv.range).toBe(4);
    expect(lv.pp).toBe(10);
    expect(lv.r1).toBe(12);
    expect(lv.s1).toBe(8);
    expect(lv.r2).toBe(14);
    expect(lv.s2).toBe(6);
  });

  it('worked anchor B: H=14 L=6 C=12 -> PP=11, R1=16, S1=8, R2=19, S2=3 bit-exact', () => {
    const lv = computeLinePivotWoodieLevels({
      x: 0,
      high: 14,
      low: 6,
      close: 12,
    });
    expect(lv.range).toBe(8);
    expect(lv.pp).toBe(11);
    expect(lv.r1).toBe(16);
    expect(lv.s1).toBe(8);
    expect(lv.r2).toBe(19);
    expect(lv.s2).toBe(3);
  });

  it('constant series: every level equals the constant (bit-exact)', () => {
    const lv = computeLinePivotWoodieLevels({
      x: 0,
      high: 5,
      low: 5,
      close: 5,
    });
    expect(lv.pp).toBe(5);
    expect(lv.r1).toBe(5);
    expect(lv.s1).toBe(5);
    expect(lv.r2).toBe(5);
    expect(lv.s2).toBe(5);
    expect(lv.range).toBe(0);
  });

  it('R2 > R1 > PP > S1 > S2 for any non-degenerate prior', () => {
    const lv = computeLinePivotWoodieLevels({
      x: 0,
      high: 14,
      low: 6,
      close: 12,
    });
    expect(lv.r2!).toBeGreaterThan(lv.r1!);
    expect(lv.r1!).toBeGreaterThan(lv.pp!);
    expect(lv.pp!).toBeGreaterThan(lv.s1!);
    expect(lv.s1!).toBeGreaterThan(lv.s2!);
  });

  it('R2 and S2 are symmetric around the PP: R2 + S2 = 2 * PP bit-exact', () => {
    const lv = computeLinePivotWoodieLevels({
      x: 0,
      high: 14,
      low: 6,
      close: 12,
    });
    expect(lv.r2! + lv.s2!).toBe(2 * lv.pp!);
  });

  it('R1 + S1 = 4 * PP - H - L (the R1/S1 identity from 2*PP - L / 2*PP - H)', () => {
    const lv = computeLinePivotWoodieLevels({
      x: 0,
      high: 14,
      low: 6,
      close: 12,
    });
    expect(lv.r1! + lv.s1!).toBe(4 * lv.pp! - 14 - 6);
  });

  it('R2 - R1 = (H - L) - (H - L)/2 ... no, simpler: R2 - PP = range, R1 - PP = range/2 - (range/2) ... we just check identities directly', () => {
    const lv = computeLinePivotWoodieLevels({
      x: 0,
      high: 14,
      low: 6,
      close: 12,
    });
    expect(lv.r2! - lv.pp!).toBe(lv.range!);
    expect(lv.pp! - lv.s2!).toBe(lv.range!);
  });
});

describe('computeLinePivotWoodie', () => {
  it('returns an empty list for non-array or empty input', () => {
    expect(computeLinePivotWoodie(null)).toEqual([]);
    expect(computeLinePivotWoodie([])).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLinePivotWoodie(WORKED);
    expect(out).toHaveLength(WORKED.length);
  });

  it('leaves the first bar nulls (no prior)', () => {
    const out = computeLinePivotWoodie(WORKED);
    expect(out[0]!.pp).toBeNull();
    expect(out[0]!.range).toBeNull();
  });

  it('the second bar carries the anchor A levels', () => {
    const out = computeLinePivotWoodie(WORKED);
    expect(out[1]!.pp).toBe(10);
    expect(out[1]!.r1).toBe(12);
    expect(out[1]!.s1).toBe(8);
    expect(out[1]!.r2).toBe(14);
    expect(out[1]!.s2).toBe(6);
  });

  it('the third bar carries the anchor B levels (its prev was the anchor B bar)', () => {
    const out = computeLinePivotWoodie(WORKED);
    expect(out[2]!.pp).toBe(11);
    expect(out[2]!.r1).toBe(16);
    expect(out[2]!.s1).toBe(8);
    expect(out[2]!.r2).toBe(19);
    expect(out[2]!.s2).toBe(3);
  });

  it('a constant series leaves every defined level at the constant (bit-exact)', () => {
    const out = computeLinePivotWoodie(CONST_FLAT);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.pp).toBe(5);
      expect(out[i]!.r1).toBe(5);
      expect(out[i]!.s1).toBe(5);
      expect(out[i]!.r2).toBe(5);
      expect(out[i]!.s2).toBe(5);
    }
  });
});

describe('classifyLinePivotWoodieZone', () => {
  const levels = computeLinePivotWoodieLevels({
    x: 0,
    high: 12,
    low: 8,
    close: 10,
  });
  // PP=10, R1=12, S1=8, R2=14, S2=6.

  it('null close -> none', () => {
    expect(classifyLinePivotWoodieZone(null, levels)).toBe('none');
  });

  it('close above R2 -> above-r2', () => {
    expect(classifyLinePivotWoodieZone(15, levels)).toBe('above-r2');
  });

  it('close between R1 and R2 -> r1-to-r2', () => {
    expect(classifyLinePivotWoodieZone(13, levels)).toBe('r1-to-r2');
  });

  it('close between PP and R1 -> pp-to-r1', () => {
    expect(classifyLinePivotWoodieZone(11, levels)).toBe('pp-to-r1');
  });

  it('close at PP -> pp-to-r1 (>= rule)', () => {
    expect(classifyLinePivotWoodieZone(10, levels)).toBe('pp-to-r1');
  });

  it('close between S1 and PP -> s1-to-pp', () => {
    expect(classifyLinePivotWoodieZone(9, levels)).toBe('s1-to-pp');
  });

  it('close at S1 -> s1-to-pp', () => {
    expect(classifyLinePivotWoodieZone(8, levels)).toBe('s1-to-pp');
  });

  it('close between S2 and S1 -> s2-to-s1', () => {
    expect(classifyLinePivotWoodieZone(7, levels)).toBe('s2-to-s1');
  });

  it('close below S2 -> below-s2', () => {
    expect(classifyLinePivotWoodieZone(5, levels)).toBe('below-s2');
  });

  it('null levels -> none', () => {
    expect(
      classifyLinePivotWoodieZone(10, {
        range: null,
        pp: null,
        r1: null,
        s1: null,
        r2: null,
        s2: null,
      }),
    ).toBe('none');
  });
});

describe('runLinePivotWoodie', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      runLinePivotWoodie([{ x: 0, high: 12, low: 8, close: 10 }]).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLinePivotWoodie([]).ok).toBe(false);
    expect(runLinePivotWoodie(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLinePivotWoodie(WORKED).ok).toBe(true);
  });

  it('the second bar carries the anchor A levels', () => {
    const run = runLinePivotWoodie(WORKED);
    expect(run.samples[1]!.levels.pp).toBe(10);
    expect(run.samples[1]!.levels.r1).toBe(12);
    expect(run.samples[1]!.levels.s1).toBe(8);
    expect(run.samples[1]!.levels.r2).toBe(14);
    expect(run.samples[1]!.levels.s2).toBe(6);
  });

  it('constant series counts every bar after the first as pp-to-r1 (close = PP, >= rule)', () => {
    const run = runLinePivotWoodie(CONST_FLAT);
    for (let i = 1; i < run.samples.length; i += 1) {
      expect(run.samples[i]!.zone).toBe('pp-to-r1');
    }
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLinePivotWoodie(WAVE);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.aboveCount + run.belowCount + run.betweenCount + none,
    ).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLinePivotWoodie(WAVE);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...WORKED].sort(() => -1);
    const run = runLinePivotWoodie(shuffled);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final pivot point', () => {
    const run = runLinePivotWoodie(CONST_FLAT);
    expect(run.ppFinal).toBe(5);
  });
});

describe('computeLinePivotWoodieLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLinePivotWoodieLayout({
        data: [{ x: 0, high: 12, low: 8, close: 10 }],
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLinePivotWoodieLayout({
        data: WORKED,
        width: 60,
        height: 60,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLinePivotWoodieLayout({ data: WORKED }).ok).toBe(true);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLinePivotWoodieLayout({ data: WORKED });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLinePivotWoodieLayout({ data: WORKED });
    expect(layout.priceDots).toHaveLength(WORKED.length);
  });

  it('emits 5 level segments per defined bar', () => {
    const layout = computeLinePivotWoodieLayout({ data: WORKED });
    // 5 bars - 1 warm-up = 4 defined bars; 5 levels each => 20 segments.
    expect(layout.segments).toHaveLength(20);
  });

  it('emits one marker per defined-zone bar', () => {
    const layout = computeLinePivotWoodieLayout({ data: WORKED });
    expect(layout.markers).toHaveLength(4);
  });

  it('every segment is pp / r1 / s1 / r2 / s2', () => {
    const layout = computeLinePivotWoodieLayout({ data: WORKED });
    const valid = new Set(['pp', 'r1', 's1', 'r2', 's2']);
    for (const seg of layout.segments) {
      expect(valid.has(seg.seriesId)).toBe(true);
    }
  });

  it('the value domain covers the close and R2/S2', () => {
    const layout = computeLinePivotWoodieLayout({ data: WORKED });
    expect(layout.valueMin).toBeLessThanOrEqual(3);
    expect(layout.valueMax).toBeGreaterThanOrEqual(19);
  });

  it('carries the run', () => {
    const layout = computeLinePivotWoodieLayout({ data: WORKED });
    expect(layout.run.samples).toHaveLength(WORKED.length);
  });
});

describe('describeLinePivotWoodieChart', () => {
  it('names the indicator', () => {
    expect(describeLinePivotWoodieChart(WORKED)).toContain('Woodie');
  });

  it('mentions the double-weighted close', () => {
    expect(describeLinePivotWoodieChart(WORKED)).toContain('close weighted twice');
  });

  it('mentions the pivot point formula', () => {
    expect(describeLinePivotWoodieChart(WORKED)).toContain('(H + L + 2*C)');
  });

  it('mentions the warm-up first bar', () => {
    expect(describeLinePivotWoodieChart(WORKED)).toContain('first bar');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLinePivotWoodieChart([])).toBe('No data');
    expect(describeLinePivotWoodieChart(null)).toBe('No data');
  });
});

describe('<ChartLinePivotWoodie />', () => {
  it('renders a labelled region', () => {
    render(<ChartLinePivotWoodie data={WORKED} />);
    expect(
      screen.getByRole('region', { name: /Woodie pivot chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(<ChartLinePivotWoodie data={WORKED} />);
    const desc = container.querySelector(
      '[data-section="chart-line-pivot-woodie-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Woodie');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLinePivotWoodie data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-pivot-woodie-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the total-points on the root', () => {
    const { container } = render(<ChartLinePivotWoodie data={WORKED} />);
    const root = container.querySelector(
      '[data-section="chart-line-pivot-woodie"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WORKED.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(<ChartLinePivotWoodie data={WORKED} />);
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line', () => {
    const { container } = render(<ChartLinePivotWoodie data={WORKED} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-woodie-price-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders 5 segments per defined bar (4 bars * 5 levels = 20)', () => {
    const { container } = render(<ChartLinePivotWoodie data={WORKED} />);
    const segments = container.querySelectorAll(
      '[data-section="chart-line-pivot-woodie-segment"]',
    );
    expect(segments).toHaveLength(20);
  });

  it('renders markers for the defined-zone bars', () => {
    const { container } = render(<ChartLinePivotWoodie data={WORKED} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pivot-woodie-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(<ChartLinePivotWoodie data={WORKED} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pivot-woodie-marker"]',
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

  it('renders the config badge', () => {
    const { container } = render(<ChartLinePivotWoodie data={WORKED} />);
    const badge = container.querySelector(
      '[data-section="chart-line-pivot-woodie-badge-config"]',
    );
    expect(badge?.textContent).toContain('WOODIE PIVOT');
  });

  it('hides the PP segments via showPp=false', () => {
    const { container } = render(
      <ChartLinePivotWoodie data={WORKED} showPp={false} />,
    );
    const segments = container.querySelectorAll(
      '[data-section="chart-line-pivot-woodie-segment"][data-series-id="pp"]',
    );
    expect(segments).toHaveLength(0);
  });

  it('hides the R2/S2 segments via showLevel2=false', () => {
    const { container } = render(
      <ChartLinePivotWoodie data={WORKED} showLevel2={false} />,
    );
    const r2 = container.querySelectorAll(
      '[data-section="chart-line-pivot-woodie-segment"][data-series-id="r2"]',
    );
    const s2 = container.querySelectorAll(
      '[data-section="chart-line-pivot-woodie-segment"][data-series-id="s2"]',
    );
    expect(r2).toHaveLength(0);
    expect(s2).toHaveLength(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLinePivotWoodie
        data={WORKED}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pivot-woodie-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePivotWoodie ref={ref} data={WORKED} />);
    expect(ref.current).not.toBeNull();
  });

  it('renders a rising fixture without throwing', () => {
    const { container } = render(<ChartLinePivotWoodie data={RISING} />);
    expect(
      container.querySelector('[data-section="chart-line-pivot-woodie"]'),
    ).toBeInTheDocument();
  });
});
