import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCycleStrength,
  classifyLineCycleStrengthZone,
  computeLineCycleStrength,
  computeLineCycleStrengthDetrended,
  computeLineCycleStrengthLayout,
  describeLineCycleStrengthChart,
  getLineCycleStrengthFinitePoints,
  normalizeLineCycleStrengthCycleLag,
  normalizeLineCycleStrengthLength,
  runLineCycleStrength,
  DEFAULT_CHART_LINE_CYCLE_STRENGTH_LENGTH,
  DEFAULT_CHART_LINE_CYCLE_STRENGTH_CYCLE_LAG,
} from './chart-line-cycle-strength';
import type { ChartLineCycleStrengthPoint } from './chart-line-cycle-strength';

const constClose = (
  count: number,
  K: number,
): ChartLineCycleStrengthPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const oscillating = (
  count: number,
  amp: number,
): ChartLineCycleStrengthPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i % 2 === 0 ? amp : -amp,
  }));

describe('getLineCycleStrengthFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineCycleStrengthFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineCycleStrengthFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineCycleStrengthFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineCycleStrengthFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineCycleStrengthFinitePoints([
      null as unknown as ChartLineCycleStrengthPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineCycleStrengthLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineCycleStrengthLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineCycleStrengthLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineCycleStrengthLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineCycleStrengthCycleLag', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineCycleStrengthCycleLag(undefined, 7)).toBe(7);
  });

  it('floors fractional lags', () => {
    expect(normalizeLineCycleStrengthCycleLag(5.5, 7)).toBe(5);
  });

  it('rejects lag below 1', () => {
    expect(normalizeLineCycleStrengthCycleLag(0, 7)).toBe(7);
  });

  it('accepts lag 1', () => {
    expect(normalizeLineCycleStrengthCycleLag(1, 7)).toBe(1);
  });
});

describe('computeLineCycleStrengthDetrended', () => {
  it('emits null for warmup bars (i < cycleLag)', () => {
    const out = computeLineCycleStrengthDetrended([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
    expect(typeof out[3]).toBe('number');
  });

  it('computes close[i] - close[i - cycleLag]', () => {
    const out = computeLineCycleStrengthDetrended([1, 2, 4, 8, 16], 2);
    // i=2: 4 - 1 = 3
    expect(out[2]).toBe(3);
    // i=3: 8 - 2 = 6
    expect(out[3]).toBe(6);
    // i=4: 16 - 4 = 12
    expect(out[4]).toBe(12);
  });

  it('CONST close yields detrended = 0 at every valid bar', () => {
    const out = computeLineCycleStrengthDetrended(Array(10).fill(5), 3);
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(0);
    }
  });
});

describe('computeLineCycleStrength', () => {
  it('returns an empty array for null', () => {
    expect(computeLineCycleStrength(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineCycleStrength([])).toEqual([]);
  });

  it('nulls warmup bars (i < cycleLag + length - 1)', () => {
    const closes = Array(30).fill(10);
    const out = computeLineCycleStrength(closes, {
      length: 5,
      cycleLag: 3,
    });
    for (let i = 0; i < 7; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[7]).toBe('number');
  });

  it('CONST close (K != 0) yields strength = 0 bit-exact past warmup', () => {
    for (const K of [1, 5, 100, -3, 7, -50]) {
      const closes = Array(30).fill(K);
      const out = computeLineCycleStrength(closes, {
        length: 5,
        cycleLag: 3,
      });
      for (let i = 7; i < 30; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 yields all-null strength (singular)', () => {
    const closes = Array(30).fill(0);
    const out = computeLineCycleStrength(closes, {
      length: 5,
      cycleLag: 3,
    });
    for (let i = 0; i < 30; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('oscillating closes yield positive strength', () => {
    const closes = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? 1 : -1,
    );
    const out = computeLineCycleStrength(closes, {
      length: 5,
      cycleLag: 1,
    });
    for (let i = 5; i < 30; i += 1) {
      const s = out[i];
      expect(s != null && s > 0).toBe(true);
    }
  });

  it('output length matches input length', () => {
    const closes = Array(30).fill(5);
    const out = computeLineCycleStrength(closes, {
      length: 5,
      cycleLag: 3,
    });
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = Array(30).fill(5);
    const snap = closes.slice();
    computeLineCycleStrength(closes, { length: 5, cycleLag: 3 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default)', () => {
    const closes = Array(60).fill(5);
    const out = computeLineCycleStrength(closes, {
      length: Number.NaN,
      cycleLag: 7,
    });
    // Default length=14, lag=7 -> warmup = 20, so out[20] is valid.
    expect(out[20]).toBe(0);
  });

  it('null close propagates through the window', () => {
    const closes: Array<number | null> = Array(30).fill(5);
    closes[15] = null;
    const out = computeLineCycleStrength(closes, {
      length: 5,
      cycleLag: 3,
    });
    // Bar 15 in the cycle/total energy window of bars [11..15] etc.
    // makes the window invalid and we should see nulls around it.
    expect(out[15]).toBe(null);
  });
});

describe('classifyLineCycleStrengthZone', () => {
  it('classifies cyclic at >= 0.5', () => {
    expect(classifyLineCycleStrengthZone(0.5)).toBe('cyclic');
    expect(classifyLineCycleStrengthZone(1)).toBe('cyclic');
  });

  it('classifies mixed between 0.1 and 0.5', () => {
    expect(classifyLineCycleStrengthZone(0.3)).toBe('mixed');
    expect(classifyLineCycleStrengthZone(0.1)).toBe('mixed');
  });

  it('classifies trending below 0.1 (but not zero)', () => {
    expect(classifyLineCycleStrengthZone(0.05)).toBe('trending');
    expect(classifyLineCycleStrengthZone(0.01)).toBe('trending');
  });

  it('classifies flat when value == 0', () => {
    expect(classifyLineCycleStrengthZone(0)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineCycleStrengthZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineCycleStrengthZone(Number.NaN)).toBe('none');
  });
});

describe('runLineCycleStrength', () => {
  it('marks ok=false for fewer than cycleLag + length points', () => {
    const run = runLineCycleStrength(constClose(7, 5), {
      length: 5,
      cycleLag: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with cycleLag + length points', () => {
    const run = runLineCycleStrength(constClose(8, 5), {
      length: 5,
      cycleLag: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineCycleStrength(constClose(30, 5));
    expect(run.length).toBe(DEFAULT_CHART_LINE_CYCLE_STRENGTH_LENGTH);
    expect(run.cycleLag).toBe(DEFAULT_CHART_LINE_CYCLE_STRENGTH_CYCLE_LAG);
  });

  it('respects explicit options', () => {
    const run = runLineCycleStrength(constClose(30, 5), {
      length: 7,
      cycleLag: 3,
    });
    expect(run.length).toBe(7);
    expect(run.cycleLag).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineCycleStrengthPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineCycleStrength(data, { length: 2, cycleLag: 1 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close (K != 0) classifies post-warmup as flat', () => {
    const run = runLineCycleStrength(constClose(30, 5), {
      length: 5,
      cycleLag: 3,
    });
    expect(run.flatCount).toBe(30 - 7);
  });

  it('CONST close = 0 classifies all as none (singular)', () => {
    const run = runLineCycleStrength(constClose(30, 0), {
      length: 5,
      cycleLag: 3,
    });
    expect(run.noneCount).toBe(30);
  });

  it('exposes strengthFinal as the last finite reading', () => {
    const run = runLineCycleStrength(constClose(30, 5), {
      length: 5,
      cycleLag: 3,
    });
    expect(run.strengthFinal).toBe(0);
  });

  it('strengthFinal is null when there is no data', () => {
    const run = runLineCycleStrength([]);
    expect(run.strengthFinal).toBe(null);
  });
});

describe('computeLineCycleStrengthLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineCycleStrengthLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineCycleStrengthLayout({
      data: constClose(30, 5),
      length: 5,
      cycleLag: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineCycleStrengthLayout({
      data: constClose(30, 5),
      length: 5,
      cycleLag: 3,
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above strength', () => {
    const layout = computeLineCycleStrengthLayout({
      data: constClose(30, 5),
      length: 5,
      cycleLag: 3,
    });
    expect(layout.priceBottom).toBeLessThan(layout.strengthTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineCycleStrengthLayout({
      data: constClose(30, 5),
      length: 5,
      cycleLag: 3,
      panelGap: 24,
    });
    expect(layout.strengthTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineCycleStrengthLayout({
      data: constClose(30, 5),
      length: 5,
      cycleLag: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a strength path and markers (skipping warmup)', () => {
    const layout = computeLineCycleStrengthLayout({
      data: constClose(30, 5),
      length: 5,
      cycleLag: 3,
    });
    expect(layout.markers.length).toBe(30 - 7);
  });

  it('mid baseline is inside the strength panel', () => {
    const layout = computeLineCycleStrengthLayout({
      data: constClose(30, 5),
      length: 5,
      cycleLag: 3,
    });
    expect(layout.midBaselineY).toBeGreaterThanOrEqual(layout.strengthTop);
    expect(layout.midBaselineY).toBeLessThanOrEqual(layout.strengthBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineCycleStrengthLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCycleStrengthChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineCycleStrengthChart([])).toBe('No data');
  });

  it('mentions Cycle Strength', () => {
    const desc = describeLineCycleStrengthChart(constClose(30, 5), {
      length: 5,
      cycleLag: 3,
    });
    expect(desc).toContain('Cycle Strength');
  });

  it('mentions the formula', () => {
    const desc = describeLineCycleStrengthChart(constClose(30, 5), {
      length: 5,
      cycleLag: 3,
    });
    expect(desc).toContain('close[i - cycleLag]');
  });

  it('reports the length and cycleLag', () => {
    const desc = describeLineCycleStrengthChart(constClose(30, 5), {
      length: 7,
      cycleLag: 4,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('cycleLag 4');
  });

  it('reports the final reading', () => {
    const desc = describeLineCycleStrengthChart(constClose(30, 5), {
      length: 5,
      cycleLag: 3,
    });
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineCycleStrength />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineCycleStrength data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-cycle-strength-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Cycle Strength');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-cycle-lag', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={7}
        cycleLag={4}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-strength"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-cycle-lag')).toBe('4');
  });

  it('exposes data-strength-final', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-strength"]',
    );
    expect(root?.getAttribute('data-strength-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-strength"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-cycle-strength-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Cycle Strength');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="strength"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="strength"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'strength',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        hiddenSeries={['strength']}
      />,
    );
    const button = container.querySelector('[data-series-id="strength"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides strength line when controlled hidden', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        hiddenSeries={['strength']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-cycle-strength-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cycle-strength-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cycle-strength-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatStrength', () => {
    const fmt = (v: number) => `[CS:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        formatStrength={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[CS:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-strength"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-strength"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-cycle-strength-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the strength line by default', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        defaultHiddenSeries={['strength']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-strength-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineCycleStrength
        data={constClose(30, 5)}
        length={5}
        cycleLag={3}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-strength-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-strength-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Cycle Strength integration', () => {
  it('CONST close (K != 0) yields strength = 0 across (K, length, cycleLag)', () => {
    for (const K of [1, 5, 100, -3, 7, -50]) {
      for (const L of [3, 5, 7, 10]) {
        for (const lag of [1, 2, 3, 5]) {
          const closes = Array(L + lag + 10).fill(K);
          const out = computeLineCycleStrength(closes, {
            length: L,
            cycleLag: lag,
          });
          for (let i = L + lag - 1; i < closes.length; i += 1) {
            expect(out[i]).toBe(0);
          }
        }
      }
    }
  });

  it('CONST close = 0 yields all-null strength (singular)', () => {
    const closes = Array(30).fill(0);
    const out = computeLineCycleStrength(closes, {
      length: 5,
      cycleLag: 3,
    });
    for (let i = 0; i < 30; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('oscillating amplitude amp produces positive strength', () => {
    const data = oscillating(30, 2);
    const closes = data.map((p) => p.close);
    const out = computeLineCycleStrength(closes, {
      length: 5,
      cycleLag: 1,
    });
    for (let i = 5; i < 30; i += 1) {
      const s = out[i];
      expect(s != null && s > 0).toBe(true);
    }
  });
});
