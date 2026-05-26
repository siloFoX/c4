import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLinePivotCamarilla,
  classifyLinePivotCamarillaZone,
  computeLinePivotCamarilla,
  computeLinePivotCamarillaLayout,
  describeLinePivotCamarillaChart,
  getLinePivotCamarillaFinitePoints,
  runLinePivotCamarilla,
} from './chart-line-pivot-camarilla';
import type { ChartLinePivotCamarillaPoint } from './chart-line-pivot-camarilla';

const constFlat = (count: number, K: number): ChartLinePivotCamarillaPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLinePivotCamarillaPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

describe('getLinePivotCamarillaFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLinePivotCamarillaFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLinePivotCamarillaFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLinePivotCamarillaFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLinePivotCamarillaFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLinePivotCamarillaFinitePoints([
      null as unknown as ChartLinePivotCamarillaPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('computeLinePivotCamarilla', () => {
  it('returns empty arrays for null', () => {
    const ch = computeLinePivotCamarilla(null);
    expect(ch.pivot).toEqual([]);
    expect(ch.r1).toEqual([]);
    expect(ch.r2).toEqual([]);
    expect(ch.r3).toEqual([]);
    expect(ch.r4).toEqual([]);
    expect(ch.s1).toEqual([]);
    expect(ch.s2).toEqual([]);
    expect(ch.s3).toEqual([]);
    expect(ch.s4).toEqual([]);
  });

  it('returns empty arrays for empty input', () => {
    const ch = computeLinePivotCamarilla([]);
    expect(ch.pivot).toEqual([]);
  });

  it('bar 0 has all levels null (no prior bar)', () => {
    const bars = constBar(10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLinePivotCamarilla(bars);
    expect(ch.pivot[0]).toBe(null);
    expect(ch.r1[0]).toBe(null);
    expect(ch.r2[0]).toBe(null);
    expect(ch.r3[0]).toBe(null);
    expect(ch.r4[0]).toBe(null);
    expect(ch.s1[0]).toBe(null);
    expect(ch.s2[0]).toBe(null);
    expect(ch.s3[0]).toBe(null);
    expect(ch.s4[0]).toBe(null);
  });

  it('CONST_FLAT (h=l=c=K) yields all levels = K bit-exact past bar 0', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(10, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLinePivotCamarilla(bars);
      for (let i = 1; i < 10; i += 1) {
        expect(ch.pivot[i]).toBe(K);
        expect(ch.r1[i]).toBe(K);
        expect(ch.r2[i]).toBe(K);
        expect(ch.r3[i]).toBe(K);
        expect(ch.r4[i]).toBe(K);
        expect(ch.s1[i]).toBe(K);
        expect(ch.s2[i]).toBe(K);
        expect(ch.s3[i]).toBe(K);
        expect(ch.s4[i]).toBe(K);
      }
    }
  });

  it('CONST_BAR (H=12, L=8, C=10) yields known pivot and offsets', () => {
    const bars = constBar(5, 12, 8, 10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLinePivotCamarilla(bars);
    // Pivot = (12 + 8 + 10) / 3 = 10
    expect(ch.pivot[1]).toBeCloseTo(10, 9);
    // Range = 4, offset1 = 4 * 1.1 / 12 = 0.3666...
    expect(ch.r1[1]).toBeCloseTo(10 + (4 * 1.1) / 12, 9);
    expect(ch.r2[1]).toBeCloseTo(10 + (4 * 1.1) / 6, 9);
    expect(ch.r3[1]).toBeCloseTo(10 + (4 * 1.1) / 4, 9);
    expect(ch.r4[1]).toBeCloseTo(10 + (4 * 1.1) / 2, 9);
    expect(ch.s1[1]).toBeCloseTo(10 - (4 * 1.1) / 12, 9);
    expect(ch.s2[1]).toBeCloseTo(10 - (4 * 1.1) / 6, 9);
    expect(ch.s3[1]).toBeCloseTo(10 - (4 * 1.1) / 4, 9);
    expect(ch.s4[1]).toBeCloseTo(10 - (4 * 1.1) / 2, 9);
  });

  it('algebraic identity: R_n - C == -(S_n - C) for any constant H/L', () => {
    const bars = constBar(5, 15, 5, 10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLinePivotCamarilla(bars);
    for (let i = 1; i < 5; i += 1) {
      expect((ch.r1[i] ?? 0) - 10).toBeCloseTo(-(((ch.s1[i] ?? 0) - 10)), 9);
      expect((ch.r4[i] ?? 0) - 10).toBeCloseTo(-(((ch.s4[i] ?? 0) - 10)), 9);
    }
  });

  it('output length matches input length', () => {
    const bars = constBar(10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLinePivotCamarilla(bars);
    expect(ch.pivot.length).toBe(10);
    expect(ch.r4.length).toBe(10);
    expect(ch.s4.length).toBe(10);
  });

  it('does not mutate input', () => {
    const bars = constBar(10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLinePivotCamarilla(bars);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('handles non-finite prior bar gracefully (all-null at that index)', () => {
    const bars = [
      { high: Number.NaN, low: 9, close: 10 },
      { high: 12, low: 8, close: 10 },
    ];
    const ch = computeLinePivotCamarilla(bars);
    // Bar 0 has no prior bar -> null.
    expect(ch.pivot[0]).toBe(null);
    // Bar 1's prior (bar 0) is NaN -> null.
    expect(ch.pivot[1]).toBe(null);
  });
});

describe('classifyLinePivotCamarillaZone', () => {
  it('classifies breakout-up when close >= R4 (non-flat band)', () => {
    expect(classifyLinePivotCamarillaZone(15, 10, 12, 8)).toBe('breakout-up');
    expect(classifyLinePivotCamarillaZone(12, 10, 12, 8)).toBe('breakout-up');
  });

  it('classifies breakout-down when close <= S4 (non-flat band)', () => {
    expect(classifyLinePivotCamarillaZone(5, 10, 12, 8)).toBe('breakout-down');
    expect(classifyLinePivotCamarillaZone(8, 10, 12, 8)).toBe('breakout-down');
  });

  it('classifies above-pivot when pivot < close < R4', () => {
    expect(classifyLinePivotCamarillaZone(11, 10, 12, 8)).toBe('above-pivot');
  });

  it('classifies below-pivot when S4 < close < pivot', () => {
    expect(classifyLinePivotCamarillaZone(9, 10, 12, 8)).toBe('below-pivot');
  });

  it('classifies at-pivot when close == pivot', () => {
    expect(classifyLinePivotCamarillaZone(10, 10, 12, 8)).toBe('at-pivot');
  });

  it('zero-width band (R4 == pivot == S4) classifies by close vs pivot only', () => {
    expect(classifyLinePivotCamarillaZone(10, 10, 10, 10)).toBe('at-pivot');
    expect(classifyLinePivotCamarillaZone(11, 10, 10, 10)).toBe('above-pivot');
    expect(classifyLinePivotCamarillaZone(9, 10, 10, 10)).toBe('below-pivot');
  });

  it('returns none for null pivot', () => {
    expect(classifyLinePivotCamarillaZone(10, null, 12, 8)).toBe('none');
  });

  it('returns none for null R4', () => {
    expect(classifyLinePivotCamarillaZone(10, 10, null, 8)).toBe('none');
  });

  it('returns none for null S4', () => {
    expect(classifyLinePivotCamarillaZone(10, 10, 12, null)).toBe('none');
  });

  it('returns none for non-finite close', () => {
    expect(classifyLinePivotCamarillaZone(Number.NaN, 10, 12, 8)).toBe('none');
  });
});

describe('runLinePivotCamarilla', () => {
  it('marks ok=false for a single point', () => {
    const run = runLinePivotCamarilla([
      { x: 0, high: 12, low: 8, close: 10 },
    ]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with at least two points', () => {
    const run = runLinePivotCamarilla(constBar(2));
    expect(run.ok).toBe(true);
  });

  it('sorts by x', () => {
    const data: ChartLinePivotCamarillaPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLinePivotCamarilla(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies post-bar-0 as at-pivot', () => {
    const run = runLinePivotCamarilla(constFlat(10, 5));
    expect(run.atPivotCount).toBe(9);
    expect(run.noneCount).toBe(1);
  });

  it('CONST_BAR with C=10, range=4 and close at pivot classifies as at-pivot', () => {
    // pivot = (12 + 8 + 10) / 3 = 10. close = 10 -> at-pivot.
    const run = runLinePivotCamarilla(constBar(5, 12, 8, 10));
    expect(run.atPivotCount).toBe(4);
  });

  it('exposes pivotFinal as the last finite pivot reading', () => {
    const run = runLinePivotCamarilla(constBar(5, 12, 8, 10));
    expect(run.pivotFinal).toBeCloseTo(10, 9);
  });

  it('pivotFinal is null when there is no data', () => {
    const run = runLinePivotCamarilla([]);
    expect(run.pivotFinal).toBe(null);
  });
});

describe('computeLinePivotCamarillaLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLinePivotCamarillaLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLinePivotCamarillaLayout({ data: constBar(5) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLinePivotCamarillaLayout({
      data: constBar(5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('produces a price path and dots', () => {
    const layout = computeLinePivotCamarillaLayout({ data: constBar(5) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(5);
  });

  it('produces a pivot path and markers (skipping bar 0)', () => {
    const layout = computeLinePivotCamarillaLayout({ data: constBar(5) });
    expect(layout.markers.length).toBe(4);
  });

  it('produces R1..R4 and S1..S4 paths', () => {
    const layout = computeLinePivotCamarillaLayout({ data: constBar(5) });
    expect(layout.r1Path.startsWith('M')).toBe(true);
    expect(layout.r2Path.startsWith('M')).toBe(true);
    expect(layout.r3Path.startsWith('M')).toBe(true);
    expect(layout.r4Path.startsWith('M')).toBe(true);
    expect(layout.s1Path.startsWith('M')).toBe(true);
    expect(layout.s2Path.startsWith('M')).toBe(true);
    expect(layout.s3Path.startsWith('M')).toBe(true);
    expect(layout.s4Path.startsWith('M')).toBe(true);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLinePivotCamarillaLayout({
      data: [{ x: 0, high: 12, low: 8, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('yMin and yMax cover the R4/S4 range', () => {
    const layout = computeLinePivotCamarillaLayout({
      data: constBar(5, 12, 8, 10),
    });
    // R4 = 10 + 2.2 = 12.2; S4 = 10 - 2.2 = 7.8.
    expect(layout.yMax).toBeGreaterThanOrEqual(12.2);
    expect(layout.yMin).toBeLessThanOrEqual(7.8);
  });
});

describe('describeLinePivotCamarillaChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLinePivotCamarillaChart([])).toBe('No data');
  });

  it('mentions Camarilla pivot levels', () => {
    const desc = describeLinePivotCamarillaChart(constBar(5));
    expect(desc).toContain('Camarilla pivot level');
  });

  it('mentions the formula', () => {
    const desc = describeLinePivotCamarillaChart(constBar(5));
    expect(desc).toContain('(H + L + C) / 3');
  });

  it('reports the final pivot value', () => {
    const desc = describeLinePivotCamarillaChart(constBar(5, 12, 8, 10));
    expect(desc).toContain('10.0000');
  });
});

describe('<ChartLinePivotCamarilla />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLinePivotCamarilla data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-pivot-camarilla-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Camarilla pivot');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePivotCamarilla data={constBar(5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-pivot-final', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5, 12, 8, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-pivot-camarilla"]',
    );
    const pivotFinal = root?.getAttribute('data-pivot-final');
    expect(pivotFinal).toBeTruthy();
    expect(parseFloat(pivotFinal!)).toBeCloseTo(10, 9);
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-pivot-camarilla"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('5');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-pivot-camarilla-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Camarilla pivot');
  });

  it('renders ten legend items', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="pivot"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="r1"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="r2"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="r3"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="r4"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="s1"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="s2"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="s3"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="s4"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="pivot"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'pivot',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        hiddenSeries={['pivot']}
      />,
    );
    const button = container.querySelector('[data-series-id="pivot"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides pivot path when controlled hidden', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        hiddenSeries={['pivot']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-pivot-path"]',
      ),
    ).toBe(null);
  });

  it('hides R1..R4 paths when showResistance=false', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        showResistance={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-r1-path"]',
      ),
    ).toBe(null);
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-r4-path"]',
      ),
    ).toBe(null);
  });

  it('hides S1..S4 paths when showSupport=false', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        showSupport={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-s1-path"]',
      ),
    ).toBe(null);
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-s4-path"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pivot-camarilla-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pivot-camarilla-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pivot-camarilla-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-pivot-camarilla-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-pivot-camarilla-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-legend"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatPivot', () => {
    const fmt = (v: number) => `[P:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        formatPivot={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pivot-camarilla-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[P:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-pivot-camarilla"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-pivot-camarilla"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-pivot-camarilla-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the pivot line by default', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-pivot-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        defaultHiddenSeries={['pivot']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-pivot-path"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pivot-camarilla-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLinePivotCamarilla data={constBar(5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pivot-camarilla-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLinePivotCamarilla
        data={constBar(5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pivot-camarilla-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-pivot-camarilla-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Camarilla integration', () => {
  it('CONST_FLAT yields all levels = K across many K', () => {
    for (const K of [0, 1, 5, 100, -3, 7, -50]) {
      const bars = constFlat(10, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLinePivotCamarilla(bars);
      for (let i = 1; i < 10; i += 1) {
        expect(ch.pivot[i]).toBe(K);
        expect(ch.r4[i]).toBe(K);
        expect(ch.s4[i]).toBe(K);
      }
    }
  });
});
