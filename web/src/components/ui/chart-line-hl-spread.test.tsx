import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHlSpread,
  applyLineHlSpreadSma,
  classifyLineHlSpreadZone,
  computeLineHlSpread,
  computeLineHlSpreadLayout,
  computeLineHlSpreadRaw,
  describeLineHlSpreadChart,
  getLineHlSpreadFinitePoints,
  normalizeLineHlSpreadLength,
  runLineHlSpread,
  DEFAULT_CHART_LINE_HL_SPREAD_LENGTH,
} from './chart-line-hl-spread';
import type { ChartLineHlSpreadPoint } from './chart-line-hl-spread';

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLineHlSpreadPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

const constFlat = (count: number, K: number): ChartLineHlSpreadPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineHlSpreadFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineHlSpreadFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineHlSpreadFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineHlSpreadFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineHlSpreadFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineHlSpreadFinitePoints([
      null as unknown as ChartLineHlSpreadPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineHlSpreadLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineHlSpreadLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineHlSpreadLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineHlSpreadLength(1, 14)).toBe(14);
  });
});

describe('computeLineHlSpreadRaw', () => {
  it('returns an empty array for empty input', () => {
    expect(computeLineHlSpreadRaw([])).toEqual([]);
  });

  it('returns an empty array for null', () => {
    expect(computeLineHlSpreadRaw(null)).toEqual([]);
  });

  it('computes (high - low) / close * 100', () => {
    // H=20, L=10, C=20 -> 10 / 20 * 100 = 50 (dyadic)
    const out = computeLineHlSpreadRaw([
      { high: 20, low: 10, close: 20 },
    ]);
    expect(out[0]).toBe(50);
  });

  it('CONST_FLAT (K != 0) yields raw = 0 at every bar', () => {
    for (const K of [1, 5, 100, -3, 7, -50]) {
      const out = computeLineHlSpreadRaw(
        constFlat(10, K).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        })),
      );
      for (let i = 0; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('close == 0 yields raw = null (divide-by-zero guard)', () => {
    const out = computeLineHlSpreadRaw([
      { high: 1, low: 0, close: 0 },
      { high: 2, low: 1, close: 0 },
    ]);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
  });
});

describe('applyLineHlSpreadSma', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineHlSpreadSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 50, 100, -3]) {
      const out = applyLineHlSpreadSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('computeLineHlSpread', () => {
  it('returns empty for null', () => {
    const ch = computeLineHlSpread(null);
    expect(ch.raw).toEqual([]);
    expect(ch.spread).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineHlSpread([]);
    expect(ch.spread).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const bars = constBar(30, 20, 10, 20).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineHlSpread(bars, { length: 14 });
    for (let i = 0; i < 13; i += 1) {
      expect(ch.spread[i]).toBe(null);
    }
    expect(typeof ch.spread[13]).toBe('number');
  });

  it('CONST_FLAT (K != 0) yields spread = 0 bit-exact past warmup', () => {
    for (const K of [1, 5, 100, -3, 7, -50]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineHlSpread(bars, { length: 14 });
      for (let i = 13; i < 30; i += 1) {
        expect(ch.spread[i]).toBe(0);
      }
    }
  });

  it('CONST_FLAT K = 0 yields all-null spread', () => {
    const bars = constFlat(30, 0).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineHlSpread(bars, { length: 14 });
    for (let i = 0; i < 30; i += 1) {
      expect(ch.spread[i]).toBe(null);
    }
  });

  it('CONST_BAR with (H-L)/C dyadic yields spread = constant bit-exact', () => {
    for (const { H, L, C, expected } of [
      { H: 20, L: 10, C: 20, expected: 50 }, // 10/20*100 = 50
      { H: 16, L: 8, C: 16, expected: 50 }, // 8/16*100 = 50
      { H: 30, L: 10, C: 20, expected: 100 }, // 20/20*100 = 100
      { H: 5, L: 0, C: 20, expected: 25 }, // 5/20*100 = 25
    ]) {
      const bars = constBar(30, H, L, C).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineHlSpread(bars, { length: 14 });
      for (let i = 13; i < 30; i += 1) {
        expect(ch.spread[i]).toBe(expected);
      }
    }
  });

  it('spread is non-negative for any valid input', () => {
    const bars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 30; i += 1) {
      bars.push({
        high: 100 + Math.sin(i / 3) * 5,
        low: 95 + Math.cos(i / 4) * 3,
        close: 98,
      });
    }
    const ch = computeLineHlSpread(bars, { length: 10 });
    for (let i = 9; i < 30; i += 1) {
      const s = ch.spread[i];
      expect(s != null && s >= 0).toBe(true);
    }
  });

  it('output length matches input length', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineHlSpread(bars, { length: 14 });
    expect(ch.spread.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineHlSpread(bars, { length: 14 });
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = constBar(30, 20, 10, 20).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineHlSpread(bars, { length: Number.NaN });
    expect(ch.spread[13]).toBe(50);
  });
});

describe('classifyLineHlSpreadZone', () => {
  it('classifies wide at >= 75% of max', () => {
    expect(classifyLineHlSpreadZone(80, 100)).toBe('wide');
  });

  it('classifies normal between 25% and 75%', () => {
    expect(classifyLineHlSpreadZone(50, 100)).toBe('normal');
  });

  it('classifies narrow below 25%', () => {
    expect(classifyLineHlSpreadZone(10, 100)).toBe('narrow');
  });

  it('classifies flat when value == 0', () => {
    expect(classifyLineHlSpreadZone(0, 100)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineHlSpreadZone(null, 100)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineHlSpreadZone(Number.NaN, 100)).toBe('none');
  });

  it('falls back to normal when spreadMaxSeen is zero', () => {
    expect(classifyLineHlSpreadZone(5, 0)).toBe('normal');
  });
});

describe('runLineHlSpread', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineHlSpread(constBar(10), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineHlSpread(constBar(14), { length: 14 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineHlSpread(constBar(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_HL_SPREAD_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineHlSpread(constBar(30), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineHlSpreadPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineHlSpread(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies post-warmup as flat (spread = 0)', () => {
    const run = runLineHlSpread(constFlat(30, 5));
    expect(run.flatCount).toBe(30 - 13);
  });

  it('CONST_FLAT K = 0 classifies all as none (singular)', () => {
    const run = runLineHlSpread(constFlat(30, 0));
    expect(run.noneCount).toBe(30);
  });

  it('exposes spreadFinal as the last finite reading', () => {
    const run = runLineHlSpread(constBar(30, 20, 10, 20));
    expect(run.spreadFinal).toBe(50);
  });

  it('spreadFinal is null when there is no data', () => {
    const run = runLineHlSpread([]);
    expect(run.spreadFinal).toBe(null);
  });
});

describe('computeLineHlSpreadLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineHlSpreadLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineHlSpreadLayout({ data: constBar(30) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineHlSpreadLayout({
      data: constBar(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above spread', () => {
    const layout = computeLineHlSpreadLayout({ data: constBar(30) });
    expect(layout.priceBottom).toBeLessThan(layout.spreadTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineHlSpreadLayout({
      data: constBar(30),
      panelGap: 24,
    });
    expect(layout.spreadTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineHlSpreadLayout({ data: constBar(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a spread path and markers (skipping warmup)', () => {
    const layout = computeLineHlSpreadLayout({ data: constBar(30) });
    expect(layout.markers.length).toBe(30 - 13);
  });

  it('zero baseline is inside the spread panel', () => {
    const layout = computeLineHlSpreadLayout({ data: constBar(30) });
    expect(layout.zeroBaselineY).toBeGreaterThanOrEqual(layout.spreadTop);
    expect(layout.zeroBaselineY).toBeLessThanOrEqual(layout.spreadBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineHlSpreadLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('spreadMin is zero', () => {
    const layout = computeLineHlSpreadLayout({ data: constBar(30) });
    expect(layout.spreadMin).toBe(0);
  });
});

describe('describeLineHlSpreadChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineHlSpreadChart([])).toBe('No data');
  });

  it('mentions High-Low Spread', () => {
    const desc = describeLineHlSpreadChart(constBar(30));
    expect(desc).toContain('High-Low Spread');
  });

  it('mentions the formula', () => {
    const desc = describeLineHlSpreadChart(constBar(30));
    expect(desc).toContain('(high - low) / close * 100');
  });

  it('reports the length', () => {
    const desc = describeLineHlSpreadChart(constBar(30), { length: 7 });
    expect(desc).toContain('length 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineHlSpreadChart(constBar(30, 20, 10, 20));
    expect(desc).toContain('50.0000');
  });
});

describe('<ChartLineHlSpread />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineHlSpread data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-hl-spread-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('High-Low Spread');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHlSpread data={constBar(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-spread"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes data-spread-final', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30, 20, 10, 20)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-spread"]',
    );
    expect(root?.getAttribute('data-spread-final')).toBe('50');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-spread"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-hl-spread-aria-desc"]',
    );
    expect(desc?.textContent).toContain('High-Low Spread');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="spread"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="spread"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'spread',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        hiddenSeries={['spread']}
      />,
    );
    const button = container.querySelector('[data-series-id="spread"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides spread line when controlled hidden', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        hiddenSeries={['spread']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-hl-spread-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hl-spread-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hl-spread-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hl-spread-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hl-spread-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatSpread', () => {
    const fmt = (v: number) => `[S:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        formatSpread={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hl-spread-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[S:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-spread"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-spread"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-hl-spread-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the spread line by default', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        defaultHiddenSeries={['spread']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hl-spread-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineHlSpread data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hl-spread-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineHlSpread
        data={constBar(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hl-spread-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-spread-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('HL Spread integration', () => {
  it('CONST_FLAT (K != 0) yields spread = 0 across (K, length)', () => {
    for (const K of [1, 5, 100, -3, 7, -50]) {
      for (const L of [3, 5, 7, 14, 20]) {
        const bars = constFlat(L + 10, K).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const ch = computeLineHlSpread(bars, { length: L });
        for (let i = L - 1; i < bars.length; i += 1) {
          expect(ch.spread[i]).toBe(0);
        }
      }
    }
  });

  it('CONST_BAR with dyadic (H-L)/C yields spread bit-exact across length', () => {
    for (const { H, L, C, expected } of [
      { H: 20, L: 10, C: 20, expected: 50 },
      { H: 16, L: 8, C: 16, expected: 50 },
      { H: 30, L: 10, C: 20, expected: 100 },
      { H: 5, L: 0, C: 20, expected: 25 },
    ]) {
      for (const L_ of [3, 5, 7, 14]) {
        const bars = constBar(L_ + 10, H, L, C).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const ch = computeLineHlSpread(bars, { length: L_ });
        for (let i = L_ - 1; i < bars.length; i += 1) {
          expect(ch.spread[i]).toBe(expected);
        }
      }
    }
  });
});
