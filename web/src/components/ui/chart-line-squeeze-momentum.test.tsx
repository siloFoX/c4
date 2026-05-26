import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSqueezeMomentum,
  classifyLineSqueezeMomentumZone,
  computeLineSqueezeMomentum,
  computeLineSqueezeMomentumLayout,
  computeLineSqueezeMomentumLinreg,
  describeLineSqueezeMomentumChart,
  getLineSqueezeMomentumFinitePoints,
  normalizeLineSqueezeMomentumLength,
  runLineSqueezeMomentum,
  DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_LENGTH,
} from './chart-line-squeeze-momentum';
import type {
  ChartLineSqueezeMomentumPoint,
} from './chart-line-squeeze-momentum';

const constFlat = (length: number, K: number): ChartLineSqueezeMomentumPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const rising = (length: number, start = 10, step = 1): ChartLineSqueezeMomentumPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: start + i * step + 1,
    low: start + i * step - 1,
    close: start + i * step,
  }));

const pivot = (length: number): ChartLineSqueezeMomentumPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: i < length / 2 ? 100 - i + 1 : 80 + (i - Math.floor(length / 2)) * 2 + 1,
    low: i < length / 2 ? 100 - i - 1 : 80 + (i - Math.floor(length / 2)) * 2 - 1,
    close: i < length / 2 ? 100 - i : 80 + (i - Math.floor(length / 2)) * 2,
  }));

describe('getLineSqueezeMomentumFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineSqueezeMomentumFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineSqueezeMomentumFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineSqueezeMomentumFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineSqueezeMomentumFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineSqueezeMomentumFinitePoints([
      { x: 1, high: 11, low: 9, close: Number.NaN },
      { x: 2, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low', () => {
    const result = getLineSqueezeMomentumFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineSqueezeMomentumFinitePoints([
      null as unknown as ChartLineSqueezeMomentumPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineSqueezeMomentumLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineSqueezeMomentumLength(undefined, 20)).toBe(20);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineSqueezeMomentumLength(Number.NaN, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineSqueezeMomentumLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineSqueezeMomentumLength(1, 20)).toBe(20);
    expect(normalizeLineSqueezeMomentumLength(0, 20)).toBe(20);
    expect(normalizeLineSqueezeMomentumLength(-5, 20)).toBe(20);
  });

  it('accepts the minimum length of 2', () => {
    expect(normalizeLineSqueezeMomentumLength(2, 20)).toBe(2);
  });
});

describe('computeLineSqueezeMomentumLinreg', () => {
  it('returns 0 for an empty array', () => {
    expect(computeLineSqueezeMomentumLinreg([])).toBe(0);
  });

  it('returns the only value for a single-element array', () => {
    expect(computeLineSqueezeMomentumLinreg([5])).toBe(5);
  });

  it('linreg of zeros is 0 bit-exact', () => {
    expect(computeLineSqueezeMomentumLinreg([0, 0, 0, 0, 0])).toBe(0);
  });

  it('linreg of constants K returns K bit-exact', () => {
    // For a constant series, slope = 0 and mean = K, so val = K.
    expect(computeLineSqueezeMomentumLinreg([7, 7, 7, 7, 7])).toBe(7);
  });

  it('linreg of perfectly linear ramp returns last value bit-exact', () => {
    // For y = x, mean_y = (n-1)/2, slope = 1, val = mean_y + 1*(n-1)/2 = n-1.
    expect(computeLineSqueezeMomentumLinreg([0, 1, 2, 3, 4])).toBe(4);
  });

  it('linreg of shifted linear ramp follows the last point', () => {
    // y = x + 10: mean_y = (n-1)/2 + 10, slope = 1, val = mean_y + (n-1)/2 = n - 1 + 10
    expect(computeLineSqueezeMomentumLinreg([10, 11, 12, 13, 14])).toBe(14);
  });
});

describe('computeLineSqueezeMomentum', () => {
  it('returns an empty array for null', () => {
    expect(computeLineSqueezeMomentum(null, 5)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineSqueezeMomentum([], 5)).toEqual([]);
  });

  it('nulls warmup bars (i < 2*(n-1))', () => {
    const bars = constFlat(20, 5).map((p) => ({ high: p.high, low: p.low, close: p.close }));
    const out = computeLineSqueezeMomentum(bars, 5);
    // Warmup is 2*(5-1) = 8 bars.
    for (let i = 0; i < 8; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[8]).toBe('number');
  });

  it('CONST_FLAT (K=5, length=5) yields 0 bit-exact past warmup', () => {
    const bars = constFlat(30, 5).map((p) => ({ high: p.high, low: p.low, close: p.close }));
    const out = computeLineSqueezeMomentum(bars, 5);
    for (let i = 8; i < 30; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT (K=100, length=20) yields 0 bit-exact past warmup', () => {
    const bars = constFlat(50, 100).map((p) => ({ high: p.high, low: p.low, close: p.close }));
    const out = computeLineSqueezeMomentum(bars, 20);
    for (let i = 38; i < 50; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT (K=0, length=10) yields 0 bit-exact past warmup', () => {
    const bars = constFlat(30, 0).map((p) => ({ high: p.high, low: p.low, close: p.close }));
    const out = computeLineSqueezeMomentum(bars, 10);
    for (let i = 18; i < 30; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_FLAT (K=-5, length=5) yields 0 bit-exact past warmup', () => {
    const bars = constFlat(30, -5).map((p) => ({ high: p.high, low: p.low, close: p.close }));
    const out = computeLineSqueezeMomentum(bars, 5);
    for (let i = 8; i < 30; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('nulls bars with non-finite inputs', () => {
    const bars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 30; i += 1) {
      bars.push({ high: 11, low: 9, close: 10 });
    }
    bars[15] = { high: Number.NaN, low: 9, close: 10 };
    const out = computeLineSqueezeMomentum(bars, 5);
    // Index 15 is nulled because src[15] requires high[15] which is NaN.
    expect(out[15]).toBe(null);
  });

  it('output length matches input length', () => {
    const bars = rising(40).map((p) => ({ high: p.high, low: p.low, close: p.close }));
    const out = computeLineSqueezeMomentum(bars, 20);
    expect(out.length).toBe(40);
  });

  it('does not mutate input', () => {
    const bars = rising(30).map((p) => ({ high: p.high, low: p.low, close: p.close }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineSqueezeMomentum(bars, 20);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = constFlat(50, 5).map((p) => ({ high: p.high, low: p.low, close: p.close }));
    const out = computeLineSqueezeMomentum(bars, Number.NaN);
    // Default = 20, so warmup = 38, then 0.
    expect(out[40]).toBe(0);
  });

  it('translation invariance: shifting close by C does not change the momentum', () => {
    const baseBars = pivot(40).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const shifted = baseBars.map((b) => ({
      high: b.high + 100,
      low: b.low + 100,
      close: b.close + 100,
    }));
    const base = computeLineSqueezeMomentum(baseBars, 5);
    const sh = computeLineSqueezeMomentum(shifted, 5);
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i];
      const s = sh[i];
      if (b == null || s == null) {
        expect(b).toBe(s);
        continue;
      }
      expect(s).toBeCloseTo(b, 9);
    }
  });
});

describe('classifyLineSqueezeMomentumZone', () => {
  it('classifies positive', () => {
    expect(classifyLineSqueezeMomentumZone(0.5)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineSqueezeMomentumZone(-0.5)).toBe('negative');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineSqueezeMomentumZone(0)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineSqueezeMomentumZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineSqueezeMomentumZone(Number.NaN)).toBe('none');
  });
});

describe('runLineSqueezeMomentum', () => {
  it('marks ok=false for fewer than 2*length-1 points', () => {
    const run = runLineSqueezeMomentum(constFlat(8, 5), { length: 5 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineSqueezeMomentum(constFlat(20, 5), { length: 5 });
    expect(run.ok).toBe(true);
  });

  it('uses the default length when none is provided', () => {
    const run = runLineSqueezeMomentum(rising(40));
    expect(run.length).toBe(DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_LENGTH);
  });

  it('respects an explicit length', () => {
    const run = runLineSqueezeMomentum(rising(40), { length: 10 });
    expect(run.length).toBe(10);
  });

  it('sorts by x', () => {
    const data: ChartLineSqueezeMomentumPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineSqueezeMomentum(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies all finite bars as flat', () => {
    const run = runLineSqueezeMomentum(constFlat(30, 5), { length: 5 });
    expect(run.flatCount).toBe(30 - 8);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('exposes momentumFinal as the last finite reading', () => {
    const run = runLineSqueezeMomentum(constFlat(30, 5), { length: 5 });
    expect(run.momentumFinal).toBe(0);
  });

  it('momentumFinal is null when there is no data', () => {
    const run = runLineSqueezeMomentum([]);
    expect(run.momentumFinal).toBe(null);
  });

  it('counts sum to total non-null samples', () => {
    const run = runLineSqueezeMomentum(pivot(40), { length: 5 });
    let nonNull = 0;
    for (const s of run.samples) {
      if (s.momentum !== null) nonNull += 1;
    }
    expect(run.positiveCount + run.flatCount + run.negativeCount).toBe(nonNull);
  });
});

describe('computeLineSqueezeMomentumLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineSqueezeMomentumLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: constFlat(30, 5),
      length: 5,
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: constFlat(30, 5),
      width: 600,
      height: 400,
      length: 5,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above momentum', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: constFlat(30, 5),
      length: 5,
    });
    expect(layout.priceBottom).toBeLessThan(layout.momentumTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: constFlat(30, 5),
      panelGap: 24,
      length: 5,
    });
    expect(layout.momentumTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: constFlat(30, 5),
      length: 5,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('markers cover the post-warmup bars', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: constFlat(30, 5),
      length: 5,
    });
    // 30 - 8 = 22 finite momentum points (warmup is 2*(5-1) = 8).
    expect(layout.markers.length).toBe(22);
  });

  it('zero line is inside the momentum panel', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: constFlat(30, 5),
      length: 5,
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.momentumTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.momentumBottom);
  });

  it('priceMin and priceMax differ for constant data', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: constFlat(30, 5),
      length: 5,
    });
    expect(layout.priceMin).toBeLessThan(layout.priceMax);
  });

  it('momentumMin and momentumMax differ for constant data', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: constFlat(30, 5),
      length: 5,
    });
    expect(layout.momentumMin).toBeLessThan(layout.momentumMax);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineSqueezeMomentumLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
      length: 5,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineSqueezeMomentumChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineSqueezeMomentumChart([])).toBe('No data');
  });

  it('mentions Squeeze Momentum', () => {
    const desc = describeLineSqueezeMomentumChart(constFlat(30, 5), {
      length: 5,
    });
    expect(desc).toContain('Squeeze Momentum');
  });

  it('mentions linear regression', () => {
    const desc = describeLineSqueezeMomentumChart(constFlat(30, 5), {
      length: 5,
    });
    expect(desc).toContain('linear regression');
  });

  it('reports the length', () => {
    const desc = describeLineSqueezeMomentumChart(constFlat(30, 5), {
      length: 5,
    });
    expect(desc).toContain('length 5');
  });

  it('reports positive / flat / negative counts', () => {
    const desc = describeLineSqueezeMomentumChart(constFlat(30, 5), {
      length: 5,
    });
    expect(desc).toMatch(/positive on 0/);
    expect(desc).toMatch(/flat on \d+/);
    expect(desc).toMatch(/negative on 0/);
  });

  it('reports the final reading', () => {
    const desc = describeLineSqueezeMomentumChart(constFlat(30, 5), {
      length: 5,
    });
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineSqueezeMomentum />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineSqueezeMomentum data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-squeeze-momentum-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Squeeze Momentum');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-squeeze-momentum"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
  });

  it('exposes data-momentum-final', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-squeeze-momentum"]',
    );
    expect(root?.getAttribute('data-momentum-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-squeeze-momentum"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-squeeze-momentum-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Squeeze Momentum');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="momentum"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="momentum"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'momentum',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        hiddenSeries={['momentum']}
      />,
    );
    const button = container.querySelector('[data-series-id="momentum"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides momentum line when controlled hidden', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        hiddenSeries={['momentum']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-squeeze-momentum-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-squeeze-momentum-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-squeeze-momentum-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-squeeze-momentum-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-squeeze-momentum-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-zero-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatMomentum', () => {
    const fmt = (v: number) => `[SM:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        formatMomentum={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[SM:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-squeeze-momentum"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-squeeze-momentum"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-squeeze-momentum-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the momentum line by default', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        defaultHiddenSeries={['momentum']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-squeeze-momentum-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum data={constFlat(30, 5)} length={5} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-squeeze-momentum-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineSqueezeMomentum
        data={constFlat(30, 5)}
        length={5}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-squeeze-momentum-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-momentum-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Squeeze Momentum integration', () => {
  it('CONST_FLAT collapses to zero bit-exact for many (K, length) combos', () => {
    for (const K of [0, 1, 5, 50, -10, 100]) {
      for (const L of [3, 5, 10, 20]) {
        const bars = constFlat(4 * L, K).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const out = computeLineSqueezeMomentum(bars, L);
        const startIdx = 2 * (L - 1);
        for (let i = startIdx; i < bars.length; i += 1) {
          expect(out[i]).toBe(0);
        }
      }
    }
  });

  it('different lengths produce different momenta on non-flat data', () => {
    const data = pivot(40).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const a = computeLineSqueezeMomentum(data, 5);
    const b = computeLineSqueezeMomentum(data, 10);
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
