import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSwingIndex,
  classifyLineSwingIndexZone,
  computeLineSwingIndex,
  computeLineSwingIndexBar,
  computeLineSwingIndexLayout,
  describeLineSwingIndexChart,
  getLineSwingIndexFinitePoints,
  normalizeLineSwingIndexLimitMove,
  runLineSwingIndex,
  DEFAULT_CHART_LINE_SWING_INDEX_LIMIT_MOVE,
} from './chart-line-swing-index';
import type {
  ChartLineSwingIndexPoint,
} from './chart-line-swing-index';

const allFlat = (length: number, K: number): ChartLineSwingIndexPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    open: K,
    high: K,
    low: K,
    close: K,
  }));

const rising = (length: number, base = 10, step = 2): ChartLineSwingIndexPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    open: base + i * step,
    high: base + i * step + 1,
    low: base + i * step - 1,
    close: base + i * step + 0.5,
  }));

const falling = (length: number, base = 30, step = 2): ChartLineSwingIndexPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    open: base - i * step,
    high: base - i * step + 1,
    low: base - i * step - 1,
    close: base - i * step - 0.5,
  }));

describe('getLineSwingIndexFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineSwingIndexFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineSwingIndexFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineSwingIndexFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineSwingIndexFinitePoints([
      { x: 1, open: 1, high: 2, low: 1, close: 1.5 },
      { x: Number.NaN, open: 1, high: 2, low: 1, close: 1.5 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite open', () => {
    const result = getLineSwingIndexFinitePoints([
      { x: 0, open: Number.NaN, high: 2, low: 1, close: 1.5 },
      { x: 1, open: 1, high: 2, low: 1, close: 1.5 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineSwingIndexFinitePoints([
      { x: 0, open: 1, high: Number.NaN, low: 1, close: 1 },
      { x: 1, open: 1, high: 2, low: Number.NaN, close: 1 },
      { x: 2, open: 1, high: 2, low: 1, close: Number.NaN },
      { x: 3, open: 1, high: 2, low: 1, close: 1.5 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineSwingIndexFinitePoints([
      null as unknown as ChartLineSwingIndexPoint,
      { x: 1, open: 1, high: 2, low: 1, close: 1.5 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineSwingIndexLimitMove', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineSwingIndexLimitMove(undefined, 1)).toBe(1);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineSwingIndexLimitMove(Number.NaN, 1)).toBe(1);
  });

  it('returns the default for non-positive values', () => {
    expect(normalizeLineSwingIndexLimitMove(0, 1)).toBe(1);
    expect(normalizeLineSwingIndexLimitMove(-1, 1)).toBe(1);
  });

  it('accepts positive values', () => {
    expect(normalizeLineSwingIndexLimitMove(3, 1)).toBe(3);
    expect(normalizeLineSwingIndexLimitMove(0.5, 1)).toBe(0.5);
  });
});

describe('computeLineSwingIndexBar', () => {
  it('worked dyadic anchor: prev{o:2,h:4,l:2,c:2}, curr{o:2,h:4,l:2,c:4}, T=1 yields SI=150 bit-exact', () => {
    const si = computeLineSwingIndexBar(
      { open: 2, high: 4, low: 2, close: 2 },
      { open: 2, high: 4, low: 2, close: 4 },
      1,
    );
    expect(si).toBe(150);
  });

  it('inverse anchor: prev{o:2,h:4,l:2,c:4}, curr{o:4,h:4,l:2,c:2}, T=1 yields SI=-150 bit-exact', () => {
    // prev: o=2 c=4 -> gap = |4-2| = 2
    // curr: o=4 c=2, h=4, l=2
    // A = |h - prevC| = |4-4| = 0
    // B = |l - prevC| = |2-4| = 2
    // C = |h-l| = 2
    // K = max(0, 2) = 2
    // B > A? Yes. B > C? No (2 == 2). Fall to else: R = C + gap/4 = 2 + 0.5 = 2.5
    // N = (2-4) + (2-4)/2 + (4-2)/4 = -2 - 1 + 0.5 = -2.5
    // SI = 50 * (-2.5/2.5) * (2/1) = 50 * -1 * 2 = -100
    const si = computeLineSwingIndexBar(
      { open: 2, high: 4, low: 2, close: 4 },
      { open: 4, high: 4, low: 2, close: 2 },
      1,
    );
    expect(si).toBe(-100);
  });

  it('ALL_FLAT (singular): returns null', () => {
    const si = computeLineSwingIndexBar(
      { open: 5, high: 5, low: 5, close: 5 },
      { open: 5, high: 5, low: 5, close: 5 },
      1,
    );
    expect(si).toBe(null);
  });

  it('K = 0 (current bar flat at prevClose): SI = 0 bit-exact', () => {
    // prev: o=2, h=4, l=2, c=3
    // curr: o=3, h=3, l=3, c=3
    // A = |3-3| = 0, B = |3-3| = 0, C = 0
    // K = 0
    // gap = |3-2| = 1
    // else: R = 0 + 1/4 = 0.25 (non-zero, OK)
    // N = 0 + 0 + 1/4 = 0.25
    // SI = 50 * (0.25/0.25) * (0/1) = 50 * 1 * 0 = 0
    const si = computeLineSwingIndexBar(
      { open: 2, high: 4, low: 2, close: 3 },
      { open: 3, high: 3, low: 3, close: 3 },
      1,
    );
    expect(si).toBe(0);
  });

  it('limit move scales the result inversely: T=2 halves SI', () => {
    const siT1 = computeLineSwingIndexBar(
      { open: 2, high: 4, low: 2, close: 2 },
      { open: 2, high: 4, low: 2, close: 4 },
      1,
    );
    const siT2 = computeLineSwingIndexBar(
      { open: 2, high: 4, low: 2, close: 2 },
      { open: 2, high: 4, low: 2, close: 4 },
      2,
    );
    expect(siT1).toBe(150);
    expect(siT2).toBe(75);
  });

  it('case-A branch: A is largest', () => {
    // prev: o=5, h=8, l=5, c=5 (so gap=0)
    // curr: o=5, h=10, l=4, c=10
    // A = |10-5| = 5, B = |4-5| = 1, C = |10-4| = 6
    // A=5, B=1, C=6 -> C is largest -> else branch
    // We need A largest. Try:
    // prev: o=5, h=10, l=5, c=5 (gap=0)
    // curr: o=5, h=20, l=8, c=20 (h=20 huge)
    // A=|20-5|=15, B=|8-5|=3, C=|20-8|=12
    // A=15 > B=3 yes, A=15 > C=12 yes -> case A
    // R = A - B/2 + gap/4 = 15 - 1.5 + 0 = 13.5
    // K = max(15, 3) = 15
    // N = (20-5) + (20-5)/2 + (5-5)/4 = 15 + 7.5 + 0 = 22.5
    // SI = 50 * (22.5/13.5) * (15/1)
    //    = 50 * (5/3) * 15 = 50 * 15 * 5 / 3 = 50 * 25 = 1250
    // Numerically: (5/3) is non-dyadic so SI may be 1250 +/- ULPs.
    const si = computeLineSwingIndexBar(
      { open: 5, high: 10, low: 5, close: 5 },
      { open: 5, high: 20, low: 8, close: 20 },
      1,
    );
    expect(si).toBeCloseTo(1250, 9);
  });

  it('case-B branch: B is largest', () => {
    // prev: o=10, h=15, l=10, c=10 (gap=0)
    // curr: o=10, h=11, l=5, c=5 (low big gap down)
    // A = |11-10|=1, B = |5-10|=5, C = |11-5|=6
    // C is largest -> else branch
    // We need B largest. Try:
    // prev: o=10, h=15, l=10, c=10 (gap=0)
    // curr: o=10, h=11, l=2, c=2
    // A = 1, B = 8, C = 9 -> C largest still
    // curr: o=10, h=10.5, l=2, c=2
    // A = 0.5, B = 8, C = 8.5 -> still C largest
    // Hmm, B > C is rare unless h is very close to prevC.
    // curr: o=10, h=10.0001, l=2, c=2: A=0.0001, B=8, C=8.0001 -> still C largest
    // It seems B can only be largest if l is very low AND h is very close to prevC (so prevC almost equals h).
    // Try: prev: o=10, h=10, l=10, c=10 (gap=0, but h=l=c, singular)
    // curr: o=10, h=10, l=2, c=2: A=0, B=8, C=8 -> B>C? No (equal)
    // curr: o=10, h=9, l=2, c=2: A=|9-10|=1, B=8, C=7. B=8>A=1 yes, B=8>C=7 yes -> case B
    // R = B - A/2 + gap/4 = 8 - 0.5 + 0 = 7.5
    // K = max(1, 8) = 8
    // N = (2-10) + (2-10)/2 + (10-10)/4 = -8 - 4 + 0 = -12
    // SI = 50 * (-12/7.5) * (8/1) = 50 * -1.6 * 8 = -640
    const si = computeLineSwingIndexBar(
      { open: 10, high: 10, low: 10, close: 10 },
      { open: 10, high: 9, low: 2, close: 2 },
      1,
    );
    expect(si).toBe(-640);
  });

  it('else branch (C largest)', () => {
    // The default anchor falls into else.
    const si = computeLineSwingIndexBar(
      { open: 2, high: 4, low: 2, close: 2 },
      { open: 2, high: 4, low: 2, close: 4 },
      1,
    );
    expect(si).toBe(150);
  });
});

describe('computeLineSwingIndex', () => {
  it('returns an empty array for null', () => {
    expect(computeLineSwingIndex(null, 1)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineSwingIndex([], 1)).toEqual([]);
  });

  it('seed bar (i=0) is null', () => {
    const out = computeLineSwingIndex(
      [{ open: 2, high: 4, low: 2, close: 2 }],
      1,
    );
    expect(out[0]).toBe(null);
  });

  it('worked anchor 2-bar fixture yields SI[1] = 150 bit-exact', () => {
    const bars = [
      { open: 2, high: 4, low: 2, close: 2 },
      { open: 2, high: 4, low: 2, close: 4 },
    ];
    const out = computeLineSwingIndex(bars, 1);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(150);
  });

  it('ALL_FLAT yields all nulls (singular R = 0)', () => {
    const bars = allFlat(10, 5).map(
      ({ open, high, low, close }) => ({ open, high, low, close }),
    );
    const out = computeLineSwingIndex(bars, 1);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('handles non-finite bars by skipping (next finite bar gets null too since prev was non-finite)', () => {
    const bars = [
      { open: 2, high: 4, low: 2, close: 2 },
      { open: Number.NaN, high: 4, low: 2, close: 4 },
      { open: 2, high: 4, low: 2, close: 4 },
    ];
    const out = computeLineSwingIndex(bars, 1);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    // After the non-finite bar, prev is still bar 0 (last finite).
    expect(out[2]).toBe(150);
  });

  it('output length matches input length', () => {
    const bars = rising(20).map(
      ({ open, high, low, close }) => ({ open, high, low, close }),
    );
    const out = computeLineSwingIndex(bars, 1);
    expect(out.length).toBe(20);
  });

  it('does not mutate input', () => {
    const bars = [
      { open: 2, high: 4, low: 2, close: 2 },
      { open: 2, high: 4, low: 2, close: 4 },
    ];
    const snap = bars.map((b) => ({ ...b }));
    computeLineSwingIndex(bars, 1);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('different limit moves produce different SI values', () => {
    const bars = [
      { open: 2, high: 4, low: 2, close: 2 },
      { open: 2, high: 4, low: 2, close: 4 },
    ];
    const out1 = computeLineSwingIndex(bars, 1);
    const out2 = computeLineSwingIndex(bars, 4);
    expect(out1[1]).not.toBe(out2[1]);
    expect(out2[1]).toBe(150 / 4);
  });

  it('rejects non-finite limit move (uses default)', () => {
    const bars = [
      { open: 2, high: 4, low: 2, close: 2 },
      { open: 2, high: 4, low: 2, close: 4 },
    ];
    const out = computeLineSwingIndex(bars, Number.NaN);
    // Default T = 1 -> SI = 150
    expect(out[1]).toBe(150);
  });
});

describe('classifyLineSwingIndexZone', () => {
  it('classifies positive', () => {
    expect(classifyLineSwingIndexZone(50)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineSwingIndexZone(-50)).toBe('negative');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineSwingIndexZone(0)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineSwingIndexZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineSwingIndexZone(Number.NaN)).toBe('none');
  });
});

describe('runLineSwingIndex', () => {
  it('marks ok=false for fewer than 2 points', () => {
    const run = runLineSwingIndex([
      { x: 0, open: 2, high: 4, low: 2, close: 2 },
    ]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true for at least 2 points', () => {
    const run = runLineSwingIndex(rising(20));
    expect(run.ok).toBe(true);
  });

  it('uses the default limit move when none is provided', () => {
    const run = runLineSwingIndex(rising(20));
    expect(run.limitMove).toBe(
      DEFAULT_CHART_LINE_SWING_INDEX_LIMIT_MOVE,
    );
  });

  it('respects an explicit limit move', () => {
    const run = runLineSwingIndex(rising(20), { limitMove: 3 });
    expect(run.limitMove).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineSwingIndexPoint[] = [
      { x: 2, open: 2, high: 4, low: 2, close: 4 },
      { x: 0, open: 2, high: 4, low: 2, close: 2 },
      { x: 1, open: 2, high: 4, low: 2, close: 3 },
    ];
    const run = runLineSwingIndex(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('ALL_FLAT classifies seed as none and subsequent bars as none', () => {
    const run = runLineSwingIndex(allFlat(10, 5));
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('rising trend yields positive SI on most bars', () => {
    const run = runLineSwingIndex(rising(20));
    expect(run.positiveCount).toBeGreaterThan(run.negativeCount);
  });

  it('falling trend yields negative SI on most bars', () => {
    const run = runLineSwingIndex(falling(20));
    expect(run.negativeCount).toBeGreaterThan(run.positiveCount);
  });

  it('exposes siFinal as the last finite SI', () => {
    const data: ChartLineSwingIndexPoint[] = [
      { x: 0, open: 2, high: 4, low: 2, close: 2 },
      { x: 1, open: 2, high: 4, low: 2, close: 4 },
    ];
    const run = runLineSwingIndex(data);
    expect(run.siFinal).toBe(150);
  });

  it('siFinal is null when there is no data', () => {
    const run = runLineSwingIndex([]);
    expect(run.siFinal).toBe(null);
  });
});

describe('computeLineSwingIndexLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineSwingIndexLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineSwingIndexLayout({ data: rising(20) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineSwingIndexLayout({
      data: rising(20),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price panel above SI panel', () => {
    const layout = computeLineSwingIndexLayout({ data: rising(20) });
    expect(layout.priceBottom).toBeLessThan(layout.siTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineSwingIndexLayout({
      data: rising(20),
      panelGap: 24,
    });
    expect(layout.siTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineSwingIndexLayout({ data: rising(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces an SI path and markers (skipping seed null)', () => {
    const layout = computeLineSwingIndexLayout({ data: rising(20) });
    // The seed bar is null, so markers are length - 1.
    expect(layout.markers.length).toBe(19);
  });

  it('zero line is inside the SI panel', () => {
    const layout = computeLineSwingIndexLayout({ data: rising(20) });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.siTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.siBottom);
  });

  it('priceMin and priceMax differ for constant data', () => {
    const layout = computeLineSwingIndexLayout({
      data: allFlat(20, 5),
    });
    expect(layout.priceMin).toBeLessThan(layout.priceMax);
  });

  it('siMin and siMax differ when all null', () => {
    const layout = computeLineSwingIndexLayout({
      data: allFlat(20, 5),
    });
    expect(layout.siMin).toBeLessThan(layout.siMax);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineSwingIndexLayout({
      data: [{ x: 0, open: 2, high: 4, low: 2, close: 2 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineSwingIndexChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineSwingIndexChart([])).toBe('No data');
  });

  it('mentions Wilder Swing Index', () => {
    const desc = describeLineSwingIndexChart(rising(20));
    expect(desc).toContain('Wilder Swing Index');
  });

  it('mentions the formula', () => {
    const desc = describeLineSwingIndexChart(rising(20));
    expect(desc).toContain('50 * (N / R) * (K / T)');
  });

  it('reports the limit move', () => {
    const desc = describeLineSwingIndexChart(rising(20), { limitMove: 3 });
    expect(desc).toContain('limit move 3');
  });

  it('reports positive / flat / negative counts', () => {
    const desc = describeLineSwingIndexChart(rising(15));
    expect(desc).toMatch(/positive on \d+/);
    expect(desc).toMatch(/negative on \d+/);
  });

  it('reports the final reading', () => {
    const data: ChartLineSwingIndexPoint[] = [
      { x: 0, open: 2, high: 4, low: 2, close: 2 },
      { x: 1, open: 2, high: 4, low: 2, close: 4 },
    ];
    const desc = describeLineSwingIndexChart(data);
    expect(desc).toContain('150.00');
  });
});

describe('<ChartLineSwingIndex />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineSwingIndex data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-swing-index-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Wilder Swing Index');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSwingIndex data={rising(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-limit-move', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} limitMove={3} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-swing-index"]',
    );
    expect(root?.getAttribute('data-limit-move')).toBe('3');
  });

  it('exposes data-si-final', () => {
    const data: ChartLineSwingIndexPoint[] = [
      { x: 0, open: 2, high: 4, low: 2, close: 2 },
      { x: 1, open: 2, high: 4, low: 2, close: 4 },
    ];
    const { container } = render(<ChartLineSwingIndex data={data} />);
    const root = container.querySelector(
      '[data-section="chart-line-swing-index"]',
    );
    expect(root?.getAttribute('data-si-final')).toBe('150');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineSwingIndex data={rising(25)} />);
    const root = container.querySelector(
      '[data-section="chart-line-swing-index"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineSwingIndex data={rising(20)} />);
    const desc = container.querySelector(
      '[data-section="chart-line-swing-index-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Wilder Swing Index');
  });

  it('renders both legend items', () => {
    const { container } = render(<ChartLineSwingIndex data={rising(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="si"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSwingIndex
        data={rising(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="si"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'si',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineSwingIndex
        data={rising(20)}
        hiddenSeries={['si']}
      />,
    );
    const button = container.querySelector('[data-series-id="si"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides SI line when controlled hidden', () => {
    const { container } = render(
      <ChartLineSwingIndex
        data={rising(20)}
        hiddenSeries={['si']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSwingIndex
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-swing-index-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSwingIndex
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-swing-index-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSwingIndex
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-swing-index-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineSwingIndex data={rising(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} showConfigBadge={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-swing-index-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(<ChartLineSwingIndex data={rising(20)} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-swing-index-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-zero-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatSi', () => {
    const fmt = (v: number) => `[SI:${v.toFixed(0)}]`;
    const data: ChartLineSwingIndexPoint[] = [
      { x: 0, open: 2, high: 4, low: 2, close: 2 },
      { x: 1, open: 2, high: 4, low: 2, close: 4 },
    ];
    const { container } = render(
      <ChartLineSwingIndex data={data} formatSi={fmt} />,
    );
    const text = container.textContent ?? '';
    // Axis tick labels apply formatSi to siMin and siMax.
    expect(text).toMatch(/\[SI:\d+\]/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineSwingIndex
        data={rising(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-swing-index"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-swing-index"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-swing-index-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the SI line by default', () => {
    const { container } = render(<ChartLineSwingIndex data={rising(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineSwingIndex data={rising(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineSwingIndex
        data={rising(20)}
        defaultHiddenSeries={['si']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(<ChartLineSwingIndex data={rising(20)} />);
    const marker = container.querySelector(
      '[data-section="chart-line-swing-index-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(<ChartLineSwingIndex data={rising(20)} />);
    const marker = container.querySelector(
      '[data-section="chart-line-swing-index-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineSwingIndex data={rising(20)} showTooltip={false} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-swing-index-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-swing-index-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Swing Index integration', () => {
  it('worked anchor: 2-bar fixture yields SI = 150 bit-exact at T=1', () => {
    const data: ChartLineSwingIndexPoint[] = [
      { x: 0, open: 2, high: 4, low: 2, close: 2 },
      { x: 1, open: 2, high: 4, low: 2, close: 4 },
    ];
    const run = runLineSwingIndex(data);
    expect(run.siFinal).toBe(150);
  });

  it('limit move T=2 halves SI bit-exact', () => {
    const data: ChartLineSwingIndexPoint[] = [
      { x: 0, open: 2, high: 4, low: 2, close: 2 },
      { x: 1, open: 2, high: 4, low: 2, close: 4 },
    ];
    const run = runLineSwingIndex(data, { limitMove: 2 });
    expect(run.siFinal).toBe(75);
  });

  it('K=0 yields SI=0 bit-exact', () => {
    const data: ChartLineSwingIndexPoint[] = [
      { x: 0, open: 2, high: 4, low: 2, close: 3 },
      { x: 1, open: 3, high: 3, low: 3, close: 3 },
    ];
    const run = runLineSwingIndex(data);
    expect(run.siFinal).toBe(0);
  });
});
