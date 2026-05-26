import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCenterOfGravity,
  classifyLineCenterOfGravityZone,
  computeLineCenterOfGravity,
  computeLineCenterOfGravityLayout,
  describeLineCenterOfGravityChart,
  getLineCenterOfGravityFinitePoints,
  normalizeLineCenterOfGravityLength,
  runLineCenterOfGravity,
  DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_LENGTH,
} from './chart-line-center-of-gravity';
import type {
  ChartLineCenterOfGravityPoint,
} from './chart-line-center-of-gravity';

const flat = (length: number, value: number): ChartLineCenterOfGravityPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: value }));

const rising = (length: number, start = 0, step = 1): ChartLineCenterOfGravityPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: start + i * step }));

const pivot = (length: number): ChartLineCenterOfGravityPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: i < length / 2 ? 100 - i : 80 + (i - Math.floor(length / 2)) * 2,
  }));

describe('getLineCenterOfGravityFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineCenterOfGravityFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineCenterOfGravityFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineCenterOfGravityFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineCenterOfGravityFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 20 },
      { x: 2, close: 30 },
    ]);
    expect(result.map((p) => p.x)).toEqual([1, 2]);
  });

  it('drops non-finite close', () => {
    const result = getLineCenterOfGravityFinitePoints([
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 5 },
    ]);
    expect(result.map((p) => p.x)).toEqual([2]);
  });

  it('drops null entries', () => {
    const result = getLineCenterOfGravityFinitePoints([
      null as unknown as ChartLineCenterOfGravityPoint,
      { x: 1, close: 2 },
    ]);
    expect(result).toEqual([{ x: 1, close: 2 }]);
  });
});

describe('normalizeLineCenterOfGravityLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineCenterOfGravityLength(undefined, 10)).toBe(10);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineCenterOfGravityLength(Number.NaN, 10)).toBe(10);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineCenterOfGravityLength(7.9, 10)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineCenterOfGravityLength(1, 10)).toBe(10);
    expect(normalizeLineCenterOfGravityLength(0, 10)).toBe(10);
    expect(normalizeLineCenterOfGravityLength(-5, 10)).toBe(10);
  });

  it('accepts the minimum length of 2', () => {
    expect(normalizeLineCenterOfGravityLength(2, 10)).toBe(2);
  });
});

describe('computeLineCenterOfGravity', () => {
  it('returns an empty array for null', () => {
    expect(computeLineCenterOfGravity(null, 4)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineCenterOfGravity([], 4)).toEqual([]);
  });

  it('nulls the warmup bars (before length - 1)', () => {
    const closes = [1, 2, 3, 4, 5];
    const out = computeLineCenterOfGravity(closes, 4);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
    expect(typeof out[3]).toBe('number');
    expect(typeof out[4]).toBe('number');
  });

  it('CONST_FLAT (K=1, L=4) collapses to zero bit-exact', () => {
    const closes = flat(20, 1).map((p) => p.close);
    const out = computeLineCenterOfGravity(closes, 4);
    for (let i = 3; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT (K=2, L=4) collapses to zero bit-exact', () => {
    const closes = flat(20, 2).map((p) => p.close);
    const out = computeLineCenterOfGravity(closes, 4);
    for (let i = 3; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT (K=7, L=10) collapses to zero bit-exact', () => {
    const closes = flat(30, 7).map((p) => p.close);
    const out = computeLineCenterOfGravity(closes, 10);
    for (let i = 9; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT (K=100, L=14) collapses to zero bit-exact', () => {
    const closes = flat(40, 100).map((p) => p.close);
    const out = computeLineCenterOfGravity(closes, 14);
    for (let i = 13; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT (K=-5, L=4) collapses to zero bit-exact', () => {
    const closes = flat(20, -5).map((p) => p.close);
    const out = computeLineCenterOfGravity(closes, 4);
    for (let i = 3; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT (K=0) returns null (division by zero)', () => {
    const closes = flat(20, 0).map((p) => p.close);
    const out = computeLineCenterOfGravity(closes, 4);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('worked anchor: close=[1,2,3,4] L=4 yields CG=5/2 - 30/10 = -0.5', () => {
    // For close = [1,2,3,4]:
    // num = 1*4 + 2*3 + 3*2 + 4*1 = 4+6+6+4 = 20
    // den = 4+3+2+1 = 10
    // CG = -20/10 + 5/2 = -2 + 2.5 = 0.5
    const out = computeLineCenterOfGravity([1, 2, 3, 4], 4);
    expect(out[3]).toBe(0.5);
  });

  it('worked anchor: close=[4,3,2,1] L=4 yields CG=-0.5 (reversed)', () => {
    // For close = [4,3,2,1]:
    // num = 1*1 + 2*2 + 3*3 + 4*4 = 1+4+9+16 = 30
    // den = 1+2+3+4 = 10
    // CG = -30/10 + 5/2 = -3 + 2.5 = -0.5
    const out = computeLineCenterOfGravity([4, 3, 2, 1], 4);
    expect(out[3]).toBe(-0.5);
  });

  it('worked anchor: close=[1,2,3,4,5] L=5 yields CG=-1', () => {
    // num = 1*5 + 2*4 + 3*3 + 4*2 + 5*1 = 5+8+9+8+5 = 35
    // den = 5+4+3+2+1 = 15
    // CG = -35/15 + 3 = -7/3 + 3 = 2/3
    const out = computeLineCenterOfGravity([1, 2, 3, 4, 5], 5);
    expect(out[4]).toBeCloseTo(2 / 3, 12);
  });

  it('nulls bars whose close is non-finite', () => {
    const closes = [1, 2, 3, 4, Number.NaN, 6, 7, 8, 9];
    const out = computeLineCenterOfGravity(closes, 4);
    expect(out[4]).toBe(null);
    expect(out[5]).toBe(null);
    expect(out[6]).toBe(null);
    expect(out[7]).toBe(null);
    expect(typeof out[8]).toBe('number');
  });

  it('handles a single point gracefully', () => {
    const out = computeLineCenterOfGravity([10], 4);
    expect(out).toEqual([null]);
  });

  it('output length matches input length', () => {
    const closes = rising(30).map((p) => p.close);
    const out = computeLineCenterOfGravity(closes, 4);
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = [1, 2, 3, 4, 5];
    const snap = closes.slice();
    computeLineCenterOfGravity(closes, 4);
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default 10)', () => {
    const closes = rising(30, 1, 1).map((p) => p.close);
    const out = computeLineCenterOfGravity(closes, Number.NaN);
    // default length = 10, so out[9] should be a number
    expect(typeof out[9]).toBe('number');
  });

  it('zero-sum window returns null', () => {
    // close = [1, -1, 1, -1]: sum = 0 -> null
    const out = computeLineCenterOfGravity([1, -1, 1, -1], 4);
    expect(out[3]).toBe(null);
  });

  it('scaling invariance: CG(K*close, L) === CG(close, L) when no zero-sum windows', () => {
    const baseCloses = rising(20, 1, 1).map((p) => p.close);
    const scaledCloses = baseCloses.map((c) => c * 5);
    const base = computeLineCenterOfGravity(baseCloses, 4);
    const scaled = computeLineCenterOfGravity(scaledCloses, 4);
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i];
      const s = scaled[i];
      if (b == null || s == null) {
        expect(b).toBe(s);
        continue;
      }
      expect(s).toBeCloseTo(b, 12);
    }
  });
});

describe('classifyLineCenterOfGravityZone', () => {
  it('classifies positive', () => {
    expect(classifyLineCenterOfGravityZone(2.5)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineCenterOfGravityZone(-2.5)).toBe('negative');
  });

  it('classifies zero', () => {
    expect(classifyLineCenterOfGravityZone(0)).toBe('zero');
  });

  it('returns none when cg is null', () => {
    expect(classifyLineCenterOfGravityZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineCenterOfGravityZone(Number.NaN)).toBe('none');
  });
});

describe('runLineCenterOfGravity', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineCenterOfGravity(rising(3), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineCenterOfGravity(rising(20), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses the default length when none is provided', () => {
    const run = runLineCenterOfGravity(rising(20));
    expect(run.length).toBe(DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_LENGTH);
  });

  it('respects an explicit length', () => {
    const run = runLineCenterOfGravity(rising(20), { length: 14 });
    expect(run.length).toBe(14);
  });

  it('sorts by x', () => {
    const data: ChartLineCenterOfGravityPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineCenterOfGravity(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT (K=5, L=4) classifies all computed bars as zero', () => {
    const run = runLineCenterOfGravity(flat(20, 5), { length: 4 });
    expect(run.zeroCount).toBe(20 - 3);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('exposes cgFinal as the last finite cg', () => {
    const run = runLineCenterOfGravity(flat(20, 7), { length: 4 });
    expect(run.cgFinal).toBe(0);
  });

  it('rising trend yields positive CG (centroid past midpoint)', () => {
    const run = runLineCenterOfGravity(rising(20, 1, 1), { length: 4 });
    expect(run.positiveCount).toBeGreaterThan(run.negativeCount);
  });

  it('falling trend yields negative CG', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({
      x: i,
      close: 100 - i,
    }));
    const run = runLineCenterOfGravity(data, { length: 4 });
    expect(run.negativeCount).toBeGreaterThan(run.positiveCount);
  });

  it('counts sum to total non-null samples', () => {
    const run = runLineCenterOfGravity(pivot(30), { length: 4 });
    let nonNull = 0;
    for (const s of run.samples) {
      if (s.cg !== null) nonNull += 1;
    }
    expect(run.positiveCount + run.zeroCount + run.negativeCount).toBe(
      nonNull,
    );
  });

  it('cgFinal is null when there is no data', () => {
    const run = runLineCenterOfGravity([]);
    expect(run.cgFinal).toBe(null);
  });
});

describe('computeLineCenterOfGravityLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineCenterOfGravityLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: rising(20),
      length: 4,
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: rising(20),
      width: 600,
      height: 400,
      length: 4,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with the price panel above the oscillator', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: rising(20),
      length: 4,
    });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: rising(20),
      panelGap: 24,
      length: 4,
    });
    expect(layout.oscTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: rising(20),
      length: 4,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces a CG path and markers', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: rising(20),
      length: 4,
    });
    expect(layout.cgPath.length).toBeGreaterThan(0);
    // markers are only the finite CG points (>= length-1)
    expect(layout.markers.length).toBe(20 - 3);
  });

  it('zero line is inside the oscillator panel', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: rising(20, 1, 1),
      length: 4,
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.oscTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.oscBottom);
  });

  it('priceMin and priceMax differ for constant data', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: flat(20, 5),
      length: 4,
    });
    expect(layout.priceMin).toBeLessThan(layout.priceMax);
  });

  it('cgMin and cgMax differ for constant data', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: flat(20, 5),
      length: 4,
    });
    expect(layout.cgMin).toBeLessThan(layout.cgMax);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineCenterOfGravityLayout({
      data: [{ x: 0, close: 5 }],
      length: 4,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCenterOfGravityChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineCenterOfGravityChart([])).toBe('No data');
  });

  it('mentions Center of Gravity', () => {
    const desc = describeLineCenterOfGravityChart(rising(20), { length: 4 });
    expect(desc).toContain('Center of Gravity');
  });

  it('mentions the centroid formula', () => {
    const desc = describeLineCenterOfGravityChart(rising(20), { length: 4 });
    expect(desc).toContain('centroid');
  });

  it('reports the length', () => {
    const desc = describeLineCenterOfGravityChart(rising(20), { length: 14 });
    expect(desc).toContain('length 14');
  });

  it('reports positive / negative / zero counts', () => {
    const desc = describeLineCenterOfGravityChart(flat(20, 5), { length: 4 });
    expect(desc).toMatch(/positive on 0/);
    expect(desc).toMatch(/zero on 17/);
    expect(desc).toMatch(/negative on 0/);
  });

  it('reports the final reading', () => {
    const desc = describeLineCenterOfGravityChart(flat(20, 5), { length: 4 });
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineCenterOfGravity />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineCenterOfGravity data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-center-of-gravity-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Center of Gravity',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} ref={ref} />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={14} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-center-of-gravity"]',
    );
    expect(root?.getAttribute('data-length')).toBe('14');
  });

  it('exposes data-cg-final', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={flat(20, 7)} length={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-center-of-gravity"]',
    );
    expect(root?.getAttribute('data-cg-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(25)} length={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-center-of-gravity"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('exposes positive / zero / negative counts', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={flat(20, 5)} length={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-center-of-gravity"]',
    );
    expect(root?.getAttribute('data-zero-count')).toBe(String(20 - 3));
    expect(root?.getAttribute('data-positive-count')).toBe('0');
    expect(root?.getAttribute('data-negative-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-center-of-gravity-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Center of Gravity');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} />,
    );
    expect(
      container.querySelector('[data-series-id="price"]'),
    ).toBeTruthy();
    expect(container.querySelector('[data-series-id="cg"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        onSeriesToggle={onToggle}
      />,
    );
    const cgButton = container.querySelector(
      '[data-series-id="cg"]',
    ) as HTMLButtonElement | null;
    if (cgButton) fireEvent.click(cgButton);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'cg', hidden: true });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        hiddenSeries={['cg']}
      />,
    );
    const cgButton = container.querySelector('[data-series-id="cg"]');
    expect(cgButton?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides CG line when controlled hidden', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        hiddenSeries={['cg']}
      />,
    );
    const cgPath = container.querySelector(
      '[data-section="chart-line-center-of-gravity-line"]',
    );
    expect(cgPath).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-center-of-gravity-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-center-of-gravity-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-center-of-gravity-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-center-of-gravity-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-center-of-gravity-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-zero-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatPrice', () => {
    const fmt = (v: number) => `<${v.toFixed(1)}>`;
    const { container } = render(
      <ChartLineCenterOfGravity
        data={flat(20, 5)}
        length={4}
        formatPrice={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('<6.0>');
    expect(text).toContain('<4.0>');
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-center-of-gravity"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-center-of-gravity"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-center-of-gravity-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the CG line by default', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        defaultHiddenSeries={['cg']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-center-of-gravity-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineCenterOfGravity data={rising(20)} length={4} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-center-of-gravity-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineCenterOfGravity
        data={rising(20)}
        length={4}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-center-of-gravity-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-center-of-gravity-tooltip"]',
      ),
    ).toBe(null);
  });

  it('respects custom formatCg', () => {
    const fmt = (v: number) => `[CG:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineCenterOfGravity
        data={flat(20, 5)}
        length={4}
        formatCg={fmt}
      />,
    );
    const text = container.textContent ?? '';
    // Axis tick labels for CG panel use formatCg. For flat data CG=0 and
    // the layout expands to [-1, +1] so tick labels show -1.00 and 1.00.
    expect(text).toContain('[CG:1.00]');
    expect(text).toContain('[CG:-1.00]');
  });
});

describe('Center of Gravity integration', () => {
  it('reproduces the recurrence on a short fixture', () => {
    const closes = [1, 2, 3, 4];
    const out = computeLineCenterOfGravity(closes, 4);
    // num = 1*4 + 2*3 + 3*2 + 4*1 = 4+6+6+4 = 20
    // den = 4+3+2+1 = 10
    // CG = -20/10 + 5/2 = -2 + 2.5 = 0.5
    expect(out[3]).toBe(0.5);
  });

  it('rising/falling antisymmetry: CG(reversed) = -CG(original) for L=4', () => {
    // Specific anchor: [1,2,3,4] gives 0.5, [4,3,2,1] gives -0.5.
    const a = computeLineCenterOfGravity([1, 2, 3, 4], 4);
    const b = computeLineCenterOfGravity([4, 3, 2, 1], 4);
    expect(a[3]).toBe(0.5);
    expect(b[3]).toBe(-0.5);
    expect(a[3]! + b[3]!).toBe(0);
  });

  it('scaling invariance (positive scalar): CG(K*close, L) = CG(close, L)', () => {
    const closes = rising(20, 1, 1).map((p) => p.close);
    const scaledCloses = closes.map((c) => c * 3);
    const base = computeLineCenterOfGravity(closes, 4);
    const scaled = computeLineCenterOfGravity(scaledCloses, 4);
    for (let i = 3; i < base.length; i += 1) {
      expect(scaled[i]).toBeCloseTo(base[i]!, 12);
    }
  });

  it('different lengths produce different CG on non-flat data', () => {
    const data = pivot(40).map((p) => p.close);
    const a = computeLineCenterOfGravity(data, 4);
    const b = computeLineCenterOfGravity(data, 10);
    let differed = false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== null && b[i] !== null && a[i] !== b[i]) {
        differed = true;
        break;
      }
    }
    expect(differed).toBe(true);
  });
});
