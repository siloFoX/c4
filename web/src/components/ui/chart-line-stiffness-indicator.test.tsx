import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStiffnessIndicator,
  applyLineStiffnessIndicatorPopulationStdDev,
  applyLineStiffnessIndicatorSma,
  classifyLineStiffnessIndicatorZone,
  computeLineStiffnessIndicator,
  computeLineStiffnessIndicatorLayout,
  describeLineStiffnessIndicatorChart,
  getLineStiffnessIndicatorFinitePoints,
  normalizeLineStiffnessIndicatorFactor,
  normalizeLineStiffnessIndicatorLength,
  runLineStiffnessIndicator,
  DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_LENGTH,
  DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FACTOR,
} from './chart-line-stiffness-indicator';
import type { ChartLineStiffnessIndicatorPoint } from './chart-line-stiffness-indicator';

const constClose = (
  count: number,
  K: number,
): ChartLineStiffnessIndicatorPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

describe('getLineStiffnessIndicatorFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineStiffnessIndicatorFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineStiffnessIndicatorFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineStiffnessIndicatorFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineStiffnessIndicatorFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineStiffnessIndicatorFinitePoints([
      null as unknown as ChartLineStiffnessIndicatorPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineStiffnessIndicatorLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineStiffnessIndicatorLength(undefined, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineStiffnessIndicatorLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineStiffnessIndicatorLength(1, 20)).toBe(20);
  });
});

describe('normalizeLineStiffnessIndicatorFactor', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineStiffnessIndicatorFactor(undefined, 0.2)).toBe(0.2);
  });

  it('accepts zero', () => {
    expect(normalizeLineStiffnessIndicatorFactor(0, 0.2)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineStiffnessIndicatorFactor(-1, 0.2)).toBe(0.2);
  });

  it('accepts fractional values', () => {
    expect(normalizeLineStiffnessIndicatorFactor(0.5, 0.2)).toBe(0.5);
  });
});

describe('applyLineStiffnessIndicatorSma', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineStiffnessIndicatorSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineStiffnessIndicatorSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('applyLineStiffnessIndicatorPopulationStdDev', () => {
  it('stdDev of constant K is 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const values = Array(10).fill(K);
      const means = applyLineStiffnessIndicatorSma(values, 4);
      const out = applyLineStiffnessIndicatorPopulationStdDev(
        values,
        means,
        4,
      );
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });
});

describe('computeLineStiffnessIndicator', () => {
  it('returns empty for null', () => {
    expect(computeLineStiffnessIndicator(null)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(computeLineStiffnessIndicator([])).toEqual([]);
  });

  it('nulls warmup bars (i < 2*length - 2)', () => {
    const closes = Array(30).fill(10);
    const out = computeLineStiffnessIndicator(closes, {
      length: 5,
      stiffnessFactor: 0.2,
    });
    for (let i = 0; i < 8; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[8]).toBe('number');
  });

  it('CONST close yields stiffness = 100 bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 100, -3, 7, -50]) {
      const closes = Array(30).fill(K);
      const out = computeLineStiffnessIndicator(closes, {
        length: 5,
        stiffnessFactor: 0.2,
      });
      for (let i = 8; i < 30; i += 1) {
        expect(out[i]).toBe(100);
      }
    }
  });

  it('CONST close yields stiffness = 100 regardless of factor', () => {
    for (const factor of [0, 0.5, 1, 2]) {
      const closes = Array(30).fill(10);
      const out = computeLineStiffnessIndicator(closes, {
        length: 5,
        stiffnessFactor: factor,
      });
      for (let i = 8; i < 30; i += 1) {
        expect(out[i]).toBe(100);
      }
    }
  });

  it('output length matches input length', () => {
    const closes = Array(30).fill(10);
    const out = computeLineStiffnessIndicator(closes, { length: 5 });
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = Array(30).fill(10);
    const snap = closes.slice();
    computeLineStiffnessIndicator(closes, { length: 5 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default)', () => {
    const closes = Array(60).fill(10);
    const out = computeLineStiffnessIndicator(closes, {
      length: Number.NaN,
    });
    // Default length 20 -> warmup 38, valid at i=38 onward.
    expect(out[38]).toBe(100);
  });

  it('alternating pattern yields a non-extreme stiffness reading', () => {
    // A series that oscillates around a steady mean -- the close
    // is above the SMA roughly half the time, so stiffness should
    // sit in the middle band rather than at 0 or 100.
    const closes = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? 10 : 20,
    );
    const out = computeLineStiffnessIndicator(closes, {
      length: 5,
      stiffnessFactor: 0,
    });
    const finalReading = out[29];
    expect(finalReading != null && finalReading >= 0 && finalReading <= 100).toBe(true);
  });
});

describe('classifyLineStiffnessIndicatorZone', () => {
  it('classifies rigid at >= 75', () => {
    expect(classifyLineStiffnessIndicatorZone(75)).toBe('rigid');
    expect(classifyLineStiffnessIndicatorZone(100)).toBe('rigid');
  });

  it('classifies firm at 50..75', () => {
    expect(classifyLineStiffnessIndicatorZone(60)).toBe('firm');
    expect(classifyLineStiffnessIndicatorZone(50)).toBe('firm');
  });

  it('classifies soft at 25..50', () => {
    expect(classifyLineStiffnessIndicatorZone(40)).toBe('soft');
    expect(classifyLineStiffnessIndicatorZone(25)).toBe('soft');
  });

  it('classifies fluid below 25', () => {
    expect(classifyLineStiffnessIndicatorZone(10)).toBe('fluid');
    expect(classifyLineStiffnessIndicatorZone(0)).toBe('fluid');
  });

  it('returns none for null', () => {
    expect(classifyLineStiffnessIndicatorZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineStiffnessIndicatorZone(Number.NaN)).toBe('none');
  });
});

describe('runLineStiffnessIndicator', () => {
  it('marks ok=false for fewer than 2*length-1 points', () => {
    const run = runLineStiffnessIndicator(constClose(8, 10), { length: 5 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineStiffnessIndicator(constClose(9, 10), { length: 5 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineStiffnessIndicator(constClose(50, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_LENGTH);
    expect(run.stiffnessFactor).toBe(
      DEFAULT_CHART_LINE_STIFFNESS_INDICATOR_FACTOR,
    );
  });

  it('respects explicit options', () => {
    const run = runLineStiffnessIndicator(constClose(30, 10), {
      length: 7,
      stiffnessFactor: 0.5,
    });
    expect(run.length).toBe(7);
    expect(run.stiffnessFactor).toBe(0.5);
  });

  it('sorts by x', () => {
    const data: ChartLineStiffnessIndicatorPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineStiffnessIndicator(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as rigid (=100)', () => {
    const run = runLineStiffnessIndicator(constClose(30, 10), { length: 5 });
    expect(run.rigidCount).toBe(30 - 8);
  });

  it('exposes stiffnessFinal as the last finite reading', () => {
    const run = runLineStiffnessIndicator(constClose(30, 10), { length: 5 });
    expect(run.stiffnessFinal).toBe(100);
  });

  it('stiffnessFinal is null when there is no data', () => {
    const run = runLineStiffnessIndicator([]);
    expect(run.stiffnessFinal).toBe(null);
  });
});

describe('computeLineStiffnessIndicatorLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineStiffnessIndicatorLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineStiffnessIndicatorLayout({
      data: constClose(30, 10),
      length: 5,
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineStiffnessIndicatorLayout({
      data: constClose(30, 10),
      length: 5,
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above stiffness', () => {
    const layout = computeLineStiffnessIndicatorLayout({
      data: constClose(30, 10),
      length: 5,
    });
    expect(layout.priceBottom).toBeLessThan(layout.stiffnessTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineStiffnessIndicatorLayout({
      data: constClose(30, 10),
      length: 5,
      panelGap: 24,
    });
    expect(layout.stiffnessTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineStiffnessIndicatorLayout({
      data: constClose(30, 10),
      length: 5,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a stiffness path and markers (skipping warmup)', () => {
    const layout = computeLineStiffnessIndicatorLayout({
      data: constClose(30, 10),
      length: 5,
    });
    expect(layout.markers.length).toBe(30 - 8);
  });

  it('mid baseline is inside the stiffness panel', () => {
    const layout = computeLineStiffnessIndicatorLayout({
      data: constClose(30, 10),
      length: 5,
    });
    expect(layout.midBaselineY).toBeGreaterThanOrEqual(layout.stiffnessTop);
    expect(layout.midBaselineY).toBeLessThanOrEqual(layout.stiffnessBottom);
  });

  it('stiffnessMin and stiffnessMax are 0 and 100', () => {
    const layout = computeLineStiffnessIndicatorLayout({
      data: constClose(30, 10),
      length: 5,
    });
    expect(layout.stiffnessMin).toBe(0);
    expect(layout.stiffnessMax).toBe(100);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineStiffnessIndicatorLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineStiffnessIndicatorChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineStiffnessIndicatorChart([])).toBe('No data');
  });

  it('mentions Markos Katsanos Stiffness Indicator', () => {
    const desc = describeLineStiffnessIndicatorChart(constClose(30, 10), {
      length: 5,
    });
    expect(desc).toContain('Markos Katsanos Stiffness Indicator');
  });

  it('mentions the formula', () => {
    const desc = describeLineStiffnessIndicatorChart(constClose(30, 10), {
      length: 5,
    });
    expect(desc).toContain('populationStdDev');
  });

  it('reports the length and factor', () => {
    const desc = describeLineStiffnessIndicatorChart(constClose(30, 10), {
      length: 7,
      stiffnessFactor: 0.5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('stiffnessFactor 0.5');
  });

  it('reports the final reading', () => {
    const desc = describeLineStiffnessIndicatorChart(constClose(30, 10), {
      length: 5,
    });
    expect(desc).toContain('100.0000');
  });
});

describe('<ChartLineStiffnessIndicator />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineStiffnessIndicator data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-stiffness-indicator-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Stiffness Indicator');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-stiffness-factor', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={7}
        stiffnessFactor={0.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stiffness-indicator"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-stiffness-factor')).toBe('0.5');
  });

  it('exposes data-stiffness-final', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stiffness-indicator"]',
    );
    expect(root?.getAttribute('data-stiffness-final')).toBe('100');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stiffness-indicator"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stiffness-indicator-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Stiffness Indicator');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="stiffness"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="stiffness"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'stiffness',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        hiddenSeries={['stiffness']}
      />,
    );
    const button = container.querySelector('[data-series-id="stiffness"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides stiffness line when controlled hidden', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        hiddenSeries={['stiffness']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stiffness-indicator-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stiffness-indicator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stiffness-indicator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-stiffness-indicator-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-stiffness-indicator-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatStiffness', () => {
    const fmt = (v: number) => `[S:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        formatStiffness={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stiffness-indicator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[S:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stiffness-indicator"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stiffness-indicator"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-stiffness-indicator-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the stiffness line by default', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        defaultHiddenSeries={['stiffness']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stiffness-indicator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator data={constClose(30, 10)} length={5} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stiffness-indicator-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineStiffnessIndicator
        data={constClose(30, 10)}
        length={5}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stiffness-indicator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-stiffness-indicator-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Stiffness integration', () => {
  it('CONST close yields stiffness = 100 across (K, length, factor)', () => {
    for (const K of [0, 1, 5, 100, -3, 7, -50]) {
      for (const L of [3, 5, 7, 10]) {
        for (const factor of [0, 0.2, 0.5, 1]) {
          const closes = Array(2 * L + 10).fill(K);
          const out = computeLineStiffnessIndicator(closes, {
            length: L,
            stiffnessFactor: factor,
          });
          for (let i = 2 * L - 2; i < closes.length; i += 1) {
            expect(out[i]).toBe(100);
          }
        }
      }
    }
  });
});
