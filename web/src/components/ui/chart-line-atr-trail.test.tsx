import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAtrTrail,
  applyLineAtrTrailRollingMaxClose,
  applyLineAtrTrailSma,
  classifyLineAtrTrailZone,
  computeLineAtrTrail,
  computeLineAtrTrailLayout,
  computeLineAtrTrailTrueRange,
  describeLineAtrTrailChart,
  getLineAtrTrailFinitePoints,
  normalizeLineAtrTrailLength,
  normalizeLineAtrTrailMultiplier,
  runLineAtrTrail,
  DEFAULT_CHART_LINE_ATR_TRAIL_LENGTH,
  DEFAULT_CHART_LINE_ATR_TRAIL_MULTIPLIER,
} from './chart-line-atr-trail';
import type { ChartLineAtrTrailPoint } from './chart-line-atr-trail';

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLineAtrTrailPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

const constFlat = (count: number, K: number): ChartLineAtrTrailPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineAtrTrailFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAtrTrailFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineAtrTrailFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineAtrTrailFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineAtrTrailFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineAtrTrailFinitePoints([
      null as unknown as ChartLineAtrTrailPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineAtrTrailLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineAtrTrailLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineAtrTrailLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineAtrTrailLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineAtrTrailMultiplier', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineAtrTrailMultiplier(undefined, 2)).toBe(2);
  });

  it('rejects zero', () => {
    expect(normalizeLineAtrTrailMultiplier(0, 2)).toBe(2);
  });

  it('rejects negative', () => {
    expect(normalizeLineAtrTrailMultiplier(-1, 2)).toBe(2);
  });

  it('accepts fractional values', () => {
    expect(normalizeLineAtrTrailMultiplier(1.5, 2)).toBe(1.5);
  });
});

describe('applyLineAtrTrailSma', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineAtrTrailSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineAtrTrailSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('applyLineAtrTrailRollingMaxClose', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineAtrTrailRollingMaxClose([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(3);
  });

  it('rolls the max correctly', () => {
    const out = applyLineAtrTrailRollingMaxClose([5, 3, 8, 2, 1, 9], 3);
    expect(out[2]).toBe(8);
    expect(out[3]).toBe(8);
    expect(out[4]).toBe(8);
    expect(out[5]).toBe(9);
  });
});

describe('computeLineAtrTrailTrueRange', () => {
  it('TR[0] = high - low', () => {
    const tr = computeLineAtrTrailTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
    ]);
    expect(tr[0]).toBe(2);
  });

  it('CONST_FLAT yields TR = 0 at every bar', () => {
    const tr = computeLineAtrTrailTrueRange(
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

  it('CONST_BAR with C at midpoint yields TR = 2r', () => {
    const tr = computeLineAtrTrailTrueRange(
      constBar(10, 11, 9, 10).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );
    for (let i = 0; i < 10; i += 1) {
      expect(tr[i]).toBe(2);
    }
  });
});

describe('computeLineAtrTrail', () => {
  it('returns empty for null', () => {
    const ch = computeLineAtrTrail(null);
    expect(ch.tr).toEqual([]);
    expect(ch.atr).toEqual([]);
    expect(ch.trail).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineAtrTrail([]);
    expect(ch.trail).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const bars = constFlat(30, 5).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineAtrTrail(bars, { length: 14, multiplier: 2 });
    for (let i = 0; i < 13; i += 1) {
      expect(ch.trail[i]).toBe(null);
    }
    expect(typeof ch.trail[13]).toBe('number');
  });

  it('CONST_FLAT yields trail = K bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineAtrTrail(bars, { length: 14, multiplier: 2 });
      for (let i = 13; i < 30; i += 1) {
        expect(ch.trail[i]).toBe(K);
      }
    }
  });

  it('CONST_BAR with dyadic ATR yields trail = C - multiplier * TR bit-exact', () => {
    // H=11, L=9, C=10 -> TR=2 (dyadic). mult=2 -> trail = 10 - 4 = 6
    const bars = constBar(30, 11, 9, 10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineAtrTrail(bars, { length: 14, multiplier: 2 });
    for (let i = 13; i < 30; i += 1) {
      expect(ch.trail[i]).toBe(6);
    }
  });

  it('ratchet rule: trail never descends', () => {
    // Build a series where the close grows then dips. The trail
    // should grow with the close and not retract even when the
    // candidate drops.
    const bars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 20; i += 1) {
      bars.push({ high: i + 1, low: i - 1, close: i });
    }
    for (let i = 0; i < 10; i += 1) {
      bars.push({ high: 20 - i, low: 18 - i, close: 19 - i });
    }
    const ch = computeLineAtrTrail(bars, { length: 5, multiplier: 1 });
    let prev: number | null = null;
    for (let i = 4; i < bars.length; i += 1) {
      const t = ch.trail[i];
      if (t == null) continue;
      if (prev != null) {
        expect(t).toBeGreaterThanOrEqual(prev);
      }
      prev = t;
    }
  });

  it('output length matches input length', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineAtrTrail(bars, { length: 14, multiplier: 2 });
    expect(ch.trail.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineAtrTrail(bars, { length: 14, multiplier: 2 });
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
    const ch = computeLineAtrTrail(bars, {
      length: Number.NaN,
      multiplier: 2,
    });
    expect(ch.trail[13]).toBe(5);
  });
});

describe('classifyLineAtrTrailZone', () => {
  it('classifies breakout when close > trail and trail rose', () => {
    expect(classifyLineAtrTrailZone(15, 12, 10)).toBe('breakout');
  });

  it('classifies above when close > trail (trail did not rise)', () => {
    expect(classifyLineAtrTrailZone(15, 12, 12)).toBe('above');
    expect(classifyLineAtrTrailZone(15, 12, null)).toBe('above');
  });

  it('classifies broken when close < trail', () => {
    expect(classifyLineAtrTrailZone(5, 10, 8)).toBe('broken');
  });

  it('classifies at when close == trail', () => {
    expect(classifyLineAtrTrailZone(10, 10, 8)).toBe('at');
  });

  it('returns none for null trail', () => {
    expect(classifyLineAtrTrailZone(10, null, 5)).toBe('none');
  });

  it('returns none for non-finite close', () => {
    expect(classifyLineAtrTrailZone(Number.NaN, 10, 5)).toBe('none');
  });
});

describe('runLineAtrTrail', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineAtrTrail(constBar(10), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineAtrTrail(constBar(14), { length: 14 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineAtrTrail(constBar(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_ATR_TRAIL_LENGTH);
    expect(run.multiplier).toBe(DEFAULT_CHART_LINE_ATR_TRAIL_MULTIPLIER);
  });

  it('respects explicit options', () => {
    const run = runLineAtrTrail(constBar(30), {
      length: 7,
      multiplier: 1.5,
    });
    expect(run.length).toBe(7);
    expect(run.multiplier).toBe(1.5);
  });

  it('sorts by x', () => {
    const data: ChartLineAtrTrailPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineAtrTrail(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies post-warmup as at-trail (close = trail = K)', () => {
    const run = runLineAtrTrail(constFlat(30, 5));
    expect(run.atCount).toBe(30 - 13);
  });

  it('exposes trailFinal as the last finite reading', () => {
    const run = runLineAtrTrail(constFlat(30, 5));
    expect(run.trailFinal).toBe(5);
  });

  it('trailFinal is null when there is no data', () => {
    const run = runLineAtrTrail([]);
    expect(run.trailFinal).toBe(null);
  });
});

describe('computeLineAtrTrailLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAtrTrailLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAtrTrailLayout({
      data: constBar(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineAtrTrailLayout({
      data: constBar(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAtrTrailLayout({ data: constBar(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a trail path and markers (skipping warmup)', () => {
    const layout = computeLineAtrTrailLayout({ data: constBar(30) });
    expect(layout.markers.length).toBe(30 - 13);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineAtrTrailLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('y-range covers both close and trail', () => {
    const layout = computeLineAtrTrailLayout({
      data: constBar(30, 11, 9, 10),
    });
    // trail = 10 - 2*2 = 6; close = 10
    expect(layout.yMin).toBeLessThanOrEqual(6);
    expect(layout.yMax).toBeGreaterThanOrEqual(10);
  });
});

describe('describeLineAtrTrailChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAtrTrailChart([])).toBe('No data');
  });

  it('mentions ATR trailing stop', () => {
    const desc = describeLineAtrTrailChart(constBar(30));
    expect(desc).toContain('ATR trailing stop');
  });

  it('mentions the ratchet rule', () => {
    const desc = describeLineAtrTrailChart(constBar(30));
    expect(desc).toContain('ratchet');
  });

  it('reports the length and multiplier', () => {
    const desc = describeLineAtrTrailChart(constBar(30), {
      length: 7,
      multiplier: 1.5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('multiplier 1.5');
  });

  it('reports the final reading', () => {
    const desc = describeLineAtrTrailChart(constBar(30, 11, 9, 10));
    expect(desc).toContain('6.0000');
  });
});

describe('<ChartLineAtrTrail />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineAtrTrail data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-atr-trail-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('ATR trailing stop');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAtrTrail data={constBar(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-multiplier', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        length={7}
        multiplier={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-trail"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-multiplier')).toBe('1.5');
  });

  it('exposes data-trail-final', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30, 11, 9, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-trail"]',
    );
    expect(root?.getAttribute('data-trail-final')).toBe('6');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-trail"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-atr-trail-aria-desc"]',
    );
    expect(desc?.textContent).toContain('ATR trailing stop');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="trail"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="trail"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'trail',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        hiddenSeries={['trail']}
      />,
    );
    const button = container.querySelector('[data-series-id="trail"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides trail line when controlled hidden', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        hiddenSeries={['trail']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-trail-path"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-atr-trail-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-trail-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-trail-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-atr-trail-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-atr-trail-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-legend"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatTrail', () => {
    const fmt = (v: number) => `[T:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        formatTrail={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-trail-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[T:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-trail"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-trail"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-atr-trail-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the trail line by default', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-trail-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        defaultHiddenSeries={['trail']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-trail-path"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-trail-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineAtrTrail data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-trail-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineAtrTrail
        data={constBar(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-trail-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-trail-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('ATR Trail integration', () => {
  it('CONST_FLAT yields trail = K across (K, length, multiplier)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 5, 7, 14]) {
        for (const mult of [1, 2, 3]) {
          const bars = constFlat(L + 10, K).map((p) => ({
            high: p.high,
            low: p.low,
            close: p.close,
          }));
          const ch = computeLineAtrTrail(bars, {
            length: L,
            multiplier: mult,
          });
          for (let i = L - 1; i < bars.length; i += 1) {
            expect(ch.trail[i]).toBe(K);
          }
        }
      }
    }
  });

  it('ratchet rule keeps trail non-decreasing on a noisy random walk', () => {
    const bars: Array<{ high: number; low: number; close: number }> = [];
    let level = 100;
    // pseudo-random but deterministic
    const seed = [3, -1, 2, 4, -2, 1, 5, -3, 0, 6, -1, 2, 3, -4, 1, 5, 2, -2, 3, 4];
    for (let i = 0; i < 30; i += 1) {
      level += seed[i % seed.length] ?? 0;
      bars.push({ high: level + 1, low: level - 1, close: level });
    }
    const ch = computeLineAtrTrail(bars, { length: 5, multiplier: 2 });
    let prev: number | null = null;
    for (let i = 4; i < bars.length; i += 1) {
      const t = ch.trail[i];
      if (t == null) continue;
      if (prev != null) {
        expect(t).toBeGreaterThanOrEqual(prev);
      }
      prev = t;
    }
  });
});
