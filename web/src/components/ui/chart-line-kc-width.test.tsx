import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineKcWidth,
  applyLineKcWidthEma,
  applyLineKcWidthSma,
  classifyLineKcWidthZone,
  computeLineKcWidth,
  computeLineKcWidthLayout,
  computeLineKcWidthTrueRange,
  describeLineKcWidthChart,
  getLineKcWidthFinitePoints,
  normalizeLineKcWidthLength,
  normalizeLineKcWidthMultiplier,
  runLineKcWidth,
  DEFAULT_CHART_LINE_KC_WIDTH_LENGTH,
  DEFAULT_CHART_LINE_KC_WIDTH_MULTIPLIER,
} from './chart-line-kc-width';
import type { ChartLineKcWidthPoint } from './chart-line-kc-width';

const constFlat = (count: number, K: number): ChartLineKcWidthPoint[] =>
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
): ChartLineKcWidthPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

describe('getLineKcWidthFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineKcWidthFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineKcWidthFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineKcWidthFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineKcWidthFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineKcWidthFinitePoints([
      null as unknown as ChartLineKcWidthPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineKcWidthLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineKcWidthLength(undefined, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineKcWidthLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineKcWidthLength(1, 20)).toBe(20);
  });
});

describe('normalizeLineKcWidthMultiplier', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineKcWidthMultiplier(undefined, 2)).toBe(2);
  });

  it('rejects zero', () => {
    expect(normalizeLineKcWidthMultiplier(0, 2)).toBe(2);
  });

  it('rejects negative', () => {
    expect(normalizeLineKcWidthMultiplier(-1, 2)).toBe(2);
  });

  it('accepts fractional values', () => {
    expect(normalizeLineKcWidthMultiplier(1.5, 2)).toBe(1.5);
  });
});

describe('applyLineKcWidthEma', () => {
  it('EMA of constant K=2 stays at K bit-exact (dyadic)', () => {
    const out = applyLineKcWidthEma([2, 2, 2, 2, 2], 9);
    for (const v of out) expect(v).toBe(2);
  });

  it('null breaks chain and re-seeds', () => {
    const out = applyLineKcWidthEma([1, 2, null, 5, 6], 9);
    expect(out[0]).toBe(1);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(5);
  });
});

describe('applyLineKcWidthSma', () => {
  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineKcWidthSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('emits null for warmup bars', () => {
    const out = applyLineKcWidthSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });
});

describe('computeLineKcWidthTrueRange', () => {
  it('TR[0] = high - low', () => {
    const tr = computeLineKcWidthTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
    ]);
    expect(tr[0]).toBe(2);
  });

  it('TR uses max(range, |H - prevC|, |L - prevC|)', () => {
    const tr = computeLineKcWidthTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 15, low: 14, close: 14 },
    ]);
    // range = 1, |15 - 10| = 5, |14 - 10| = 4 -> max 5
    expect(tr[1]).toBe(5);
  });

  it('CONST_FLAT yields TR = 0 at every bar', () => {
    const tr = computeLineKcWidthTrueRange(
      constFlat(10, 5).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );
    for (let i = 0; i < 10; i += 1) {
      expect(tr[i]).toBe(0);
    }
  });
});

describe('computeLineKcWidth', () => {
  it('returns empty for null', () => {
    const ch = computeLineKcWidth(null);
    expect(ch.middle).toEqual([]);
    expect(ch.upper).toEqual([]);
    expect(ch.lower).toEqual([]);
    expect(ch.width).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineKcWidth([]);
    expect(ch.width).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const bars = constFlat(30, 5).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineKcWidth(bars, { length: 20, multiplier: 2 });
    for (let i = 0; i < 19; i += 1) {
      expect(ch.width[i]).toBe(null);
    }
  });

  it('CONST_FLAT (K != 0) yields width = 0 bit-exact past warmup', () => {
    for (const K of [1, 5, 100, -3, 7, -50, 2]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineKcWidth(bars, { length: 20, multiplier: 2 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.width[i]).toBe(0);
      }
    }
  });

  it('CONST_FLAT K=0 yields width = null (singular)', () => {
    const bars = constFlat(30, 0).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineKcWidth(bars, { length: 20, multiplier: 2 });
    for (let i = 0; i < 30; i += 1) {
      expect(ch.width[i]).toBe(null);
    }
  });

  it('CONST_FLAT yields upper = lower = middle = K past warmup', () => {
    const K = 5;
    const bars = constFlat(30, K).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineKcWidth(bars, { length: 20, multiplier: 2 });
    for (let i = 19; i < 30; i += 1) {
      expect(ch.middle[i]).toBe(K);
      expect(ch.upper[i]).toBe(K);
      expect(ch.lower[i]).toBe(K);
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
    const ch = computeLineKcWidth(bars, { length: 10, multiplier: 2 });
    for (let i = 9; i < 30; i += 1) {
      const w = ch.width[i];
      expect(w != null && w >= 0).toBe(true);
    }
  });

  it('output length matches input length', () => {
    const bars = constFlat(30, 5).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineKcWidth(bars, { length: 20, multiplier: 2 });
    expect(ch.width.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constFlat(30, 5).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineKcWidth(bars, { length: 20, multiplier: 2 });
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = constFlat(30, 5).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineKcWidth(bars, {
      length: Number.NaN,
      multiplier: 2,
    });
    expect(ch.width[19]).toBe(0);
  });

  it('different multipliers still produce width = 0 for CONST_FLAT', () => {
    for (const mult of [1, 1.5, 2, 3]) {
      const bars = constFlat(30, 5).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineKcWidth(bars, {
        length: 20,
        multiplier: mult,
      });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.width[i]).toBe(0);
      }
    }
  });

  it('CONST_BAR produces positive width past warmup', () => {
    const bars = constBar(30, 12, 8, 10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineKcWidth(bars, { length: 20, multiplier: 2 });
    for (let i = 19; i < 30; i += 1) {
      const w = ch.width[i];
      expect(w != null && w > 0).toBe(true);
    }
  });
});

describe('classifyLineKcWidthZone', () => {
  it('classifies wide at >= 75% of max', () => {
    expect(classifyLineKcWidthZone(80, 100)).toBe('wide');
  });

  it('classifies normal between 25% and 75%', () => {
    expect(classifyLineKcWidthZone(50, 100)).toBe('normal');
  });

  it('classifies narrow below 25%', () => {
    expect(classifyLineKcWidthZone(10, 100)).toBe('narrow');
  });

  it('classifies flat when width == 0', () => {
    expect(classifyLineKcWidthZone(0, 100)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineKcWidthZone(null, 100)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineKcWidthZone(Number.NaN, 100)).toBe('none');
  });

  it('falls back to normal when widthMaxSeen is zero', () => {
    expect(classifyLineKcWidthZone(5, 0)).toBe('normal');
  });
});

describe('runLineKcWidth', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineKcWidth(constFlat(10, 5), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineKcWidth(constFlat(25, 5), { length: 20 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineKcWidth(constFlat(30, 5));
    expect(run.length).toBe(DEFAULT_CHART_LINE_KC_WIDTH_LENGTH);
    expect(run.multiplier).toBe(DEFAULT_CHART_LINE_KC_WIDTH_MULTIPLIER);
  });

  it('respects explicit options', () => {
    const run = runLineKcWidth(constFlat(30, 5), {
      length: 14,
      multiplier: 1.5,
    });
    expect(run.length).toBe(14);
    expect(run.multiplier).toBe(1.5);
  });

  it('sorts by x', () => {
    const data: ChartLineKcWidthPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineKcWidth(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT (K != 0) classifies post-warmup as flat', () => {
    const run = runLineKcWidth(constFlat(30, 5));
    expect(run.flatCount).toBe(30 - 19);
  });

  it('CONST_FLAT K=0 classifies all as none (singular)', () => {
    const run = runLineKcWidth(constFlat(30, 0));
    expect(run.noneCount).toBe(30);
  });

  it('exposes widthFinal as the last finite reading', () => {
    const run = runLineKcWidth(constFlat(30, 5));
    expect(run.widthFinal).toBe(0);
  });

  it('widthFinal is null when there is no data', () => {
    const run = runLineKcWidth([]);
    expect(run.widthFinal).toBe(null);
  });
});

describe('computeLineKcWidthLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineKcWidthLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineKcWidthLayout({
      data: constFlat(30, 5),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineKcWidthLayout({
      data: constFlat(30, 5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above width', () => {
    const layout = computeLineKcWidthLayout({ data: constFlat(30, 5) });
    expect(layout.priceBottom).toBeLessThan(layout.widthTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineKcWidthLayout({
      data: constFlat(30, 5),
      panelGap: 24,
    });
    expect(layout.widthTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineKcWidthLayout({ data: constFlat(30, 5) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a width path and markers (skipping warmup)', () => {
    const layout = computeLineKcWidthLayout({ data: constFlat(30, 5) });
    expect(layout.markers.length).toBe(30 - 19);
  });

  it('zero baseline is inside the width panel', () => {
    const layout = computeLineKcWidthLayout({ data: constFlat(30, 5) });
    expect(layout.zeroBaselineY).toBeGreaterThanOrEqual(layout.widthTop);
    expect(layout.zeroBaselineY).toBeLessThanOrEqual(layout.widthBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineKcWidthLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('widthMin is zero', () => {
    const layout = computeLineKcWidthLayout({ data: constFlat(30, 5) });
    expect(layout.widthMin).toBe(0);
  });
});

describe('describeLineKcWidthChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineKcWidthChart([])).toBe('No data');
  });

  it('mentions Keltner Channel Width', () => {
    const desc = describeLineKcWidthChart(constFlat(30, 5));
    expect(desc).toContain('Keltner Channel Width');
  });

  it('mentions the formula', () => {
    const desc = describeLineKcWidthChart(constFlat(30, 5));
    expect(desc).toContain('upperChannel');
    expect(desc).toContain('lowerChannel');
    expect(desc).toContain('middleChannel');
  });

  it('reports the length and multiplier', () => {
    const desc = describeLineKcWidthChart(constFlat(30, 5), {
      length: 14,
      multiplier: 1.5,
    });
    expect(desc).toContain('length 14');
    expect(desc).toContain('multiplier 1.5');
  });

  it('reports the final reading', () => {
    const desc = describeLineKcWidthChart(constFlat(30, 5));
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineKcWidth />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineKcWidth data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-kc-width-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Keltner Channel Width');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKcWidth data={constFlat(30, 5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-multiplier', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        length={14}
        multiplier={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-width"]',
    );
    expect(root?.getAttribute('data-length')).toBe('14');
    expect(root?.getAttribute('data-multiplier')).toBe('1.5');
  });

  it('exposes data-width-final', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-width"]',
    );
    expect(root?.getAttribute('data-width-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-width"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-kc-width-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Keltner Channel Width');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="width"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
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
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        hiddenSeries={['width']}
      />,
    );
    const button = container.querySelector('[data-series-id="width"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides width line when controlled hidden', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        hiddenSeries={['width']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-kc-width-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-kc-width-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-kc-width-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatWidth', () => {
    const fmt = (v: number) => `[W:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        formatWidth={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[W:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-width"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-width"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-kc-width-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the width line by default', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        defaultHiddenSeries={['width']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineKcWidth data={constFlat(30, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-width-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineKcWidth
        data={constFlat(30, 5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-width-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-width-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('KC Width integration', () => {
  it('CONST_FLAT (K != 0) yields width = 0 across (K, length, multiplier)', () => {
    for (const K of [1, 5, 100, -3, 7, -50, 2]) {
      for (const L of [3, 5, 7, 14, 20]) {
        for (const mult of [1, 2, 3]) {
          const bars = constFlat(L + 10, K).map((p) => ({
            high: p.high,
            low: p.low,
            close: p.close,
          }));
          const ch = computeLineKcWidth(bars, {
            length: L,
            multiplier: mult,
          });
          for (let i = L - 1; i < bars.length; i += 1) {
            expect(ch.width[i]).toBe(0);
          }
        }
      }
    }
  });

  it('CONST_FLAT K = 0 yields all-null width (singular)', () => {
    const bars = constFlat(30, 0).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineKcWidth(bars, { length: 20, multiplier: 2 });
    for (let i = 0; i < 30; i += 1) {
      expect(ch.width[i]).toBe(null);
    }
  });
});
