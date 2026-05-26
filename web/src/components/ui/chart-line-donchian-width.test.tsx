import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDonchianWidth,
  applyLineDonchianWidthRollingMax,
  applyLineDonchianWidthRollingMin,
  classifyLineDonchianWidthZone,
  computeLineDonchianWidth,
  computeLineDonchianWidthLayout,
  describeLineDonchianWidthChart,
  getLineDonchianWidthFinitePoints,
  normalizeLineDonchianWidthLength,
  runLineDonchianWidth,
  DEFAULT_CHART_LINE_DONCHIAN_WIDTH_LENGTH,
} from './chart-line-donchian-width';
import type { ChartLineDonchianWidthPoint } from './chart-line-donchian-width';

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLineDonchianWidthPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

const constFlat = (count: number, K: number): ChartLineDonchianWidthPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineDonchianWidthFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineDonchianWidthFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineDonchianWidthFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineDonchianWidthFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineDonchianWidthFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineDonchianWidthFinitePoints([
      null as unknown as ChartLineDonchianWidthPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineDonchianWidthLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineDonchianWidthLength(undefined, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineDonchianWidthLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineDonchianWidthLength(1, 20)).toBe(20);
  });
});

describe('applyLineDonchianWidthRollingMax', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineDonchianWidthRollingMax([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(3);
  });

  it('rolls the max correctly', () => {
    const out = applyLineDonchianWidthRollingMax([5, 3, 8, 2, 1, 9], 3);
    expect(out[2]).toBe(8);
    expect(out[3]).toBe(8);
    expect(out[4]).toBe(8);
    expect(out[5]).toBe(9);
  });

  it('propagates null through the window', () => {
    const out = applyLineDonchianWidthRollingMax([1, null, 3, 4, 5], 3);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(5);
  });
});

describe('applyLineDonchianWidthRollingMin', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineDonchianWidthRollingMin([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('rolls the min correctly', () => {
    const out = applyLineDonchianWidthRollingMin([5, 3, 8, 2, 1, 9], 3);
    expect(out[2]).toBe(3);
    expect(out[3]).toBe(2);
    expect(out[4]).toBe(1);
    expect(out[5]).toBe(1);
  });

  it('propagates null through the window', () => {
    const out = applyLineDonchianWidthRollingMin([1, null, 3, 4, 5], 3);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(3);
  });
});

describe('computeLineDonchianWidth', () => {
  it('returns empty arrays for null', () => {
    const ch = computeLineDonchianWidth(null);
    expect(ch.upper).toEqual([]);
    expect(ch.lower).toEqual([]);
    expect(ch.width).toEqual([]);
  });

  it('returns empty arrays for empty input', () => {
    const ch = computeLineDonchianWidth([]);
    expect(ch.upper).toEqual([]);
    expect(ch.lower).toEqual([]);
    expect(ch.width).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineDonchianWidth(bars, { length: 20 });
    for (let i = 0; i < 19; i += 1) {
      expect(ch.width[i]).toBe(null);
    }
    expect(typeof ch.width[19]).toBe('number');
  });

  it('CONST_FLAT (h=l=c=K) yields width = 0 bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineDonchianWidth(bars, { length: 20 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.width[i]).toBe(0);
      }
    }
  });

  it('CONST_BAR yields width = H - L bit-exact past warmup', () => {
    for (const { H, L } of [
      { H: 12, L: 8 },
      { H: 10, L: 6 },
      { H: 100, L: 50 },
      { H: 4, L: 2 },
      { H: 5, L: -3 },
    ]) {
      const bars = constBar(30, H, L).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineDonchianWidth(bars, { length: 20 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.width[i]).toBe(H - L);
      }
    }
  });

  it('CONST_BAR yields upper = H, lower = L past warmup', () => {
    const bars = constBar(30, 12, 8).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineDonchianWidth(bars, { length: 20 });
    for (let i = 19; i < 30; i += 1) {
      expect(ch.upper[i]).toBe(12);
      expect(ch.lower[i]).toBe(8);
    }
  });

  it('width is non-negative for any valid input', () => {
    const bars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 30; i += 1) {
      bars.push({
        high: 100 + Math.sin(i / 3) * 5,
        low: 95 + Math.cos(i / 4) * 3,
        close: 98,
      });
    }
    const ch = computeLineDonchianWidth(bars, { length: 10 });
    for (let i = 9; i < 30; i += 1) {
      const w = ch.width[i];
      expect(w != null && w >= 0).toBe(true);
    }
  });

  it('output length matches input length', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineDonchianWidth(bars, { length: 20 });
    expect(ch.width.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineDonchianWidth(bars, { length: 20 });
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = constBar(30, 12, 8).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineDonchianWidth(bars, { length: Number.NaN });
    expect(ch.width[19]).toBe(4);
  });

  it('ramped highs and lows yield range = (i+2) - (i-length+1-2) = length + 3', () => {
    // high[i] = i + 2, low[i] = i - 2. Window [i-4..i] for length 5:
    //   max(high) = i + 2 (latest highest), min(low) = i - 4 - 2 = i - 6
    //   width = (i + 2) - (i - 6) = 8 (constant)
    const bars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 20; i += 1) {
      bars.push({ high: i + 2, low: i - 2, close: i });
    }
    const ch = computeLineDonchianWidth(bars, { length: 5 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.width[i]).toBe(8);
    }
  });
});

describe('classifyLineDonchianWidthZone', () => {
  it('classifies wide at >= 75% of max', () => {
    expect(classifyLineDonchianWidthZone(80, 100)).toBe('wide');
    expect(classifyLineDonchianWidthZone(100, 100)).toBe('wide');
  });

  it('classifies normal between 25% and 75% of max', () => {
    expect(classifyLineDonchianWidthZone(50, 100)).toBe('normal');
    expect(classifyLineDonchianWidthZone(25, 100)).toBe('normal');
  });

  it('classifies narrow below 25% of max', () => {
    expect(classifyLineDonchianWidthZone(10, 100)).toBe('narrow');
    expect(classifyLineDonchianWidthZone(0.5, 100)).toBe('narrow');
  });

  it('classifies flat when width == 0', () => {
    expect(classifyLineDonchianWidthZone(0, 100)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineDonchianWidthZone(null, 100)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineDonchianWidthZone(Number.NaN, 100)).toBe('none');
  });

  it('falls back to normal when widthMaxSeen is zero (all flat singular)', () => {
    expect(classifyLineDonchianWidthZone(5, 0)).toBe('normal');
  });
});

describe('runLineDonchianWidth', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineDonchianWidth(constBar(10), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineDonchianWidth(constBar(25), { length: 20 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineDonchianWidth(constBar(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_DONCHIAN_WIDTH_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineDonchianWidth(constBar(30), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineDonchianWidthPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineDonchianWidth(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_BAR classifies post-warmup as wide (=widthMaxSeen)', () => {
    const run = runLineDonchianWidth(constBar(30));
    expect(run.wideCount).toBe(30 - 19);
  });

  it('CONST_FLAT classifies post-warmup as flat (singular)', () => {
    const run = runLineDonchianWidth(constFlat(30, 5));
    expect(run.flatCount).toBe(30 - 19);
  });

  it('exposes widthFinal as the last finite reading', () => {
    const run = runLineDonchianWidth(constBar(30, 12, 8));
    expect(run.widthFinal).toBe(4);
  });

  it('widthFinal is null when there is no data', () => {
    const run = runLineDonchianWidth([]);
    expect(run.widthFinal).toBe(null);
  });

  it('exposes widthMaxSeen', () => {
    const run = runLineDonchianWidth(constBar(30, 12, 8));
    expect(run.widthMaxSeen).toBe(4);
  });
});

describe('computeLineDonchianWidthLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineDonchianWidthLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineDonchianWidthLayout({
      data: constBar(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineDonchianWidthLayout({
      data: constBar(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above width', () => {
    const layout = computeLineDonchianWidthLayout({ data: constBar(30) });
    expect(layout.priceBottom).toBeLessThan(layout.widthTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineDonchianWidthLayout({
      data: constBar(30),
      panelGap: 24,
    });
    expect(layout.widthTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineDonchianWidthLayout({ data: constBar(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a width path and markers (skipping warmup)', () => {
    const layout = computeLineDonchianWidthLayout({ data: constBar(30) });
    expect(layout.markers.length).toBe(30 - 19);
  });

  it('zero baseline is inside the width panel', () => {
    const layout = computeLineDonchianWidthLayout({ data: constBar(30) });
    expect(layout.zeroBaselineY).toBeGreaterThanOrEqual(layout.widthTop);
    expect(layout.zeroBaselineY).toBeLessThanOrEqual(layout.widthBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineDonchianWidthLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('widthMin is zero (non-negative width axis)', () => {
    const layout = computeLineDonchianWidthLayout({ data: constBar(30) });
    expect(layout.widthMin).toBe(0);
  });
});

describe('describeLineDonchianWidthChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineDonchianWidthChart([])).toBe('No data');
  });

  it('mentions Donchian channel width', () => {
    const desc = describeLineDonchianWidthChart(constBar(30));
    expect(desc).toContain('Donchian channel width');
  });

  it('mentions the formula', () => {
    const desc = describeLineDonchianWidthChart(constBar(30));
    expect(desc).toContain('highest high');
    expect(desc).toContain('lowest low');
  });

  it('reports the length', () => {
    const desc = describeLineDonchianWidthChart(constBar(30), { length: 7 });
    expect(desc).toContain('length 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineDonchianWidthChart(constBar(30, 12, 8));
    expect(desc).toContain('4.0000');
  });
});

describe('<ChartLineDonchianWidth />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineDonchianWidth data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-donchian-width-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Donchian channel width');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDonchianWidth data={constBar(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-width"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes data-width-final', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30, 12, 8)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-width"]',
    );
    expect(root?.getAttribute('data-width-final')).toBe('4');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-width"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-donchian-width-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Donchian channel width');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="width"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="width"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'width',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        hiddenSeries={['width']}
      />,
    );
    const button = container.querySelector('[data-series-id="width"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides width line when controlled hidden', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        hiddenSeries={['width']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-donchian-width-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-donchian-width-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-donchian-width-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatWidth', () => {
    const fmt = (v: number) => `[W:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        formatWidth={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[W:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-width"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-width"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-donchian-width-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the width line by default', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        defaultHiddenSeries={['width']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineDonchianWidth data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-width-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineDonchianWidth
        data={constBar(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-donchian-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-width-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Donchian width integration', () => {
  it('CONST_BAR yields width = H - L across (H, L, length) combos', () => {
    for (const { H, L } of [
      { H: 12, L: 8 },
      { H: 10, L: 6 },
      { H: 100, L: 50 },
      { H: 4, L: 2 },
      { H: 5, L: -3 },
    ]) {
      for (const L_ of [3, 5, 7, 14, 20]) {
        const bars = constBar(L_ + 10, H, L).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const ch = computeLineDonchianWidth(bars, { length: L_ });
        for (let i = L_ - 1; i < bars.length; i += 1) {
          expect(ch.width[i]).toBe(H - L);
        }
      }
    }
  });

  it('CONST_FLAT yields width = 0 across many K values', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineDonchianWidth(bars, { length: 20 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.width[i]).toBe(0);
      }
    }
  });
});
