import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAtrBand,
  applyLineAtrBandSma,
  classifyLineAtrBandZone,
  computeLineAtrBand,
  computeLineAtrBandLayout,
  computeLineAtrBandTrueRange,
  describeLineAtrBandChart,
  getLineAtrBandFinitePoints,
  normalizeLineAtrBandLength,
  normalizeLineAtrBandMultiplier,
  runLineAtrBand,
  DEFAULT_CHART_LINE_ATR_BAND_LENGTH,
  DEFAULT_CHART_LINE_ATR_BAND_MULTIPLIER,
} from './chart-line-atr-band';
import type { ChartLineAtrBandPoint } from './chart-line-atr-band';

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLineAtrBandPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

const constFlat = (count: number, K: number): ChartLineAtrBandPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineAtrBandFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAtrBandFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineAtrBandFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineAtrBandFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineAtrBandFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineAtrBandFinitePoints([
      null as unknown as ChartLineAtrBandPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineAtrBandLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineAtrBandLength(undefined, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineAtrBandLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineAtrBandLength(1, 20)).toBe(20);
  });
});

describe('normalizeLineAtrBandMultiplier', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineAtrBandMultiplier(undefined, 2)).toBe(2);
  });

  it('rejects zero', () => {
    expect(normalizeLineAtrBandMultiplier(0, 2)).toBe(2);
  });

  it('rejects negative', () => {
    expect(normalizeLineAtrBandMultiplier(-1, 2)).toBe(2);
  });

  it('accepts fractional values', () => {
    expect(normalizeLineAtrBandMultiplier(1.5, 2)).toBe(1.5);
  });
});

describe('applyLineAtrBandSma', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineAtrBandSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineAtrBandSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('computeLineAtrBandTrueRange', () => {
  it('TR[0] = high - low', () => {
    const tr = computeLineAtrBandTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
    ]);
    expect(tr[0]).toBe(2);
  });

  it('TR uses max(range, |H - prevC|, |L - prevC|)', () => {
    const tr = computeLineAtrBandTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 15, low: 14, close: 14 },
    ]);
    expect(tr[1]).toBe(5);
  });

  it('CONST_FLAT yields TR = 0 at every bar', () => {
    const tr = computeLineAtrBandTrueRange(
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

  it('CONST_BAR with close at midpoint yields TR = 2r', () => {
    const r = 2;
    const tr = computeLineAtrBandTrueRange(
      constBar(10, 10 + r, 10 - r, 10).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );
    for (let i = 0; i < 10; i += 1) {
      expect(tr[i]).toBe(2 * r);
    }
  });
});

describe('computeLineAtrBand', () => {
  it('returns empty for null', () => {
    const ch = computeLineAtrBand(null);
    expect(ch.middle).toEqual([]);
    expect(ch.upper).toEqual([]);
    expect(ch.lower).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineAtrBand([]);
    expect(ch.middle).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const bars = constFlat(30, 5).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineAtrBand(bars, { length: 20, multiplier: 2 });
    for (let i = 0; i < 19; i += 1) {
      expect(ch.middle[i]).toBe(null);
      expect(ch.upper[i]).toBe(null);
      expect(ch.lower[i]).toBe(null);
    }
    expect(typeof ch.middle[19]).toBe('number');
  });

  it('CONST_FLAT yields upper = lower = middle = K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineAtrBand(bars, { length: 20, multiplier: 2 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.middle[i]).toBe(K);
        expect(ch.upper[i]).toBe(K);
        expect(ch.lower[i]).toBe(K);
      }
    }
  });

  it('CONST_BAR with close at midpoint yields middle = K, upper = K + 2*mult*r, lower = K - 2*mult*r', () => {
    for (const { K, r, mult } of [
      { K: 10, r: 1, mult: 2 },
      { K: 100, r: 5, mult: 2 },
      { K: 50, r: 2, mult: 3 },
      { K: 20, r: 4, mult: 1 },
    ]) {
      const bars = constBar(30, K + r, K - r, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineAtrBand(bars, { length: 20, multiplier: mult });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.middle[i]).toBe(K);
        expect(ch.upper[i]).toBe(K + 2 * mult * r);
        expect(ch.lower[i]).toBe(K - 2 * mult * r);
      }
    }
  });

  it('upper >= middle >= lower for any valid input', () => {
    const bars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 30; i += 1) {
      bars.push({
        high: 100 + Math.sin(i / 3) * 5,
        low: 95 + Math.cos(i / 4) * 3,
        close: 98,
      });
    }
    const ch = computeLineAtrBand(bars, { length: 10, multiplier: 2 });
    for (let i = 9; i < 30; i += 1) {
      const u = ch.upper[i];
      const m = ch.middle[i];
      const l = ch.lower[i];
      if (u != null && m != null && l != null) {
        expect(u).toBeGreaterThanOrEqual(m);
        expect(m).toBeGreaterThanOrEqual(l);
      }
    }
  });

  it('output length matches input length', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineAtrBand(bars, { length: 20, multiplier: 2 });
    expect(ch.middle.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineAtrBand(bars, { length: 20, multiplier: 2 });
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
    const ch = computeLineAtrBand(bars, {
      length: Number.NaN,
      multiplier: 2,
    });
    expect(ch.middle[19]).toBe(5);
  });
});

describe('classifyLineAtrBandZone', () => {
  it('classifies breakout-up when close >= upper', () => {
    expect(classifyLineAtrBandZone(15, 10, 14, 6)).toBe('breakout-up');
    expect(classifyLineAtrBandZone(14, 10, 14, 6)).toBe('breakout-up');
  });

  it('classifies breakout-down when close <= lower', () => {
    expect(classifyLineAtrBandZone(5, 10, 14, 6)).toBe('breakout-down');
    expect(classifyLineAtrBandZone(6, 10, 14, 6)).toBe('breakout-down');
  });

  it('classifies above when middle < close < upper', () => {
    expect(classifyLineAtrBandZone(12, 10, 14, 6)).toBe('above');
  });

  it('classifies below when lower < close < middle', () => {
    expect(classifyLineAtrBandZone(8, 10, 14, 6)).toBe('below');
  });

  it('classifies at when close == middle', () => {
    expect(classifyLineAtrBandZone(10, 10, 14, 6)).toBe('at');
  });

  it('returns none for null middle', () => {
    expect(classifyLineAtrBandZone(10, null, 14, 6)).toBe('none');
  });

  it('returns none for null upper', () => {
    expect(classifyLineAtrBandZone(10, 10, null, 6)).toBe('none');
  });

  it('returns none for null lower', () => {
    expect(classifyLineAtrBandZone(10, 10, 14, null)).toBe('none');
  });

  it('returns none for NaN close', () => {
    expect(classifyLineAtrBandZone(Number.NaN, 10, 14, 6)).toBe('none');
  });
});

describe('runLineAtrBand', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineAtrBand(constBar(10), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineAtrBand(constBar(25), { length: 20 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineAtrBand(constBar(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_ATR_BAND_LENGTH);
    expect(run.multiplier).toBe(DEFAULT_CHART_LINE_ATR_BAND_MULTIPLIER);
  });

  it('respects explicit options', () => {
    const run = runLineAtrBand(constBar(30), {
      length: 14,
      multiplier: 1.5,
    });
    expect(run.length).toBe(14);
    expect(run.multiplier).toBe(1.5);
  });

  it('sorts by x', () => {
    const data: ChartLineAtrBandPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineAtrBand(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies post-warmup as at (close = middle = K)', () => {
    const run = runLineAtrBand(constFlat(30, 5));
    expect(run.atCount).toBe(30 - 19);
  });

  it('CONST_BAR (close at midpoint) classifies post-warmup as at', () => {
    const run = runLineAtrBand(constBar(30, 12, 8, 10));
    expect(run.atCount).toBe(30 - 19);
  });

  it('exposes middleFinal as the last finite middle reading', () => {
    const run = runLineAtrBand(constBar(30, 12, 8, 10));
    expect(run.middleFinal).toBe(10);
  });

  it('middleFinal is null when there is no data', () => {
    const run = runLineAtrBand([]);
    expect(run.middleFinal).toBe(null);
  });
});

describe('computeLineAtrBandLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAtrBandLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAtrBandLayout({ data: constBar(30) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineAtrBandLayout({
      data: constBar(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAtrBandLayout({ data: constBar(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a middle path and markers (skipping warmup)', () => {
    const layout = computeLineAtrBandLayout({ data: constBar(30) });
    expect(layout.markers.length).toBe(30 - 19);
  });

  it('produces upper and lower paths', () => {
    const layout = computeLineAtrBandLayout({ data: constBar(30) });
    expect(layout.upperPath.startsWith('M')).toBe(true);
    expect(layout.lowerPath.startsWith('M')).toBe(true);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineAtrBandLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('yMin and yMax cover the band range', () => {
    const layout = computeLineAtrBandLayout({
      data: constBar(30, 12, 8, 10),
    });
    expect(layout.yMin).toBeLessThanOrEqual(10 - 8); // lower band
    expect(layout.yMax).toBeGreaterThanOrEqual(10 + 8); // upper band
  });
});

describe('describeLineAtrBandChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAtrBandChart([])).toBe('No data');
  });

  it('mentions ATR-based band envelope', () => {
    const desc = describeLineAtrBandChart(constBar(30));
    expect(desc).toContain('ATR-based band envelope');
  });

  it('mentions the formula', () => {
    const desc = describeLineAtrBandChart(constBar(30));
    expect(desc).toContain('SMA of the close');
    expect(desc).toContain('ATR');
  });

  it('reports the length and multiplier', () => {
    const desc = describeLineAtrBandChart(constBar(30), {
      length: 14,
      multiplier: 1.5,
    });
    expect(desc).toContain('length 14');
    expect(desc).toContain('multiplier 1.5');
  });

  it('reports the final reading', () => {
    const desc = describeLineAtrBandChart(constBar(30, 12, 8, 10));
    expect(desc).toContain('10.0000');
  });
});

describe('<ChartLineAtrBand />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineAtrBand data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-atr-band-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('ATR band');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAtrBand data={constBar(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-multiplier', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        length={14}
        multiplier={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-band"]',
    );
    expect(root?.getAttribute('data-length')).toBe('14');
    expect(root?.getAttribute('data-multiplier')).toBe('1.5');
  });

  it('exposes data-middle-final', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30, 12, 8, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-band"]',
    );
    expect(root?.getAttribute('data-middle-final')).toBe('10');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-band"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-atr-band-aria-desc"]',
    );
    expect(desc?.textContent).toContain('ATR-based band envelope');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="middle"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="upper"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="lower"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="middle"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'middle',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        hiddenSeries={['middle']}
      />,
    );
    const button = container.querySelector('[data-series-id="middle"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides middle line when controlled hidden', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        hiddenSeries={['middle']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-middle-path"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-atr-band-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-band-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-band-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-atr-band-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-atr-band-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-legend"]',
      ),
    ).toBe(null);
  });

  it('hides upper line when showUpper is false', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        showUpper={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-upper-path"]',
      ),
    ).toBe(null);
  });

  it('hides lower line when showLower is false', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        showLower={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-lower-path"]',
      ),
    ).toBe(null);
  });

  it('hides channel fill when showChannelFill is false', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        showChannelFill={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-channel-fill"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatMiddle', () => {
    const fmt = (v: number) => `[M:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        formatMiddle={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-band-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[M:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-band"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-band"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-atr-band-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the middle line by default', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-middle-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        defaultHiddenSeries={['middle']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-middle-path"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-band-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineAtrBand data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-band-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineAtrBand
        data={constBar(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-atr-band-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-band-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('ATR band integration', () => {
  it('CONST_BAR with C=midpoint yields upper = K + 2*mult*r, lower = K - 2*mult*r across combos', () => {
    for (const { K, r } of [
      { K: 10, r: 1 },
      { K: 100, r: 5 },
      { K: 50, r: 2 },
      { K: 20, r: 4 },
    ]) {
      for (const mult of [1, 2, 3]) {
        for (const L of [3, 5, 7, 14, 20]) {
          const bars = constBar(L + 10, K + r, K - r, K).map((p) => ({
            high: p.high,
            low: p.low,
            close: p.close,
          }));
          const ch = computeLineAtrBand(bars, {
            length: L,
            multiplier: mult,
          });
          for (let i = L - 1; i < bars.length; i += 1) {
            expect(ch.middle[i]).toBe(K);
            expect(ch.upper[i]).toBe(K + 2 * mult * r);
            expect(ch.lower[i]).toBe(K - 2 * mult * r);
          }
        }
      }
    }
  });

  it('CONST_FLAT yields upper = lower = middle = K across many K', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineAtrBand(bars, { length: 20, multiplier: 2 });
      for (let i = 19; i < 30; i += 1) {
        expect(ch.upper[i]).toBe(K);
        expect(ch.lower[i]).toBe(K);
        expect(ch.middle[i]).toBe(K);
      }
    }
  });
});
