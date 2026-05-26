import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRangeOsc,
  applyLineRangeOscEma,
  classifyLineRangeOscZone,
  computeLineRangeOsc,
  computeLineRangeOscLayout,
  computeLineRangeOscTrueRange,
  describeLineRangeOscChart,
  getLineRangeOscFinitePoints,
  normalizeLineRangeOscLength,
  runLineRangeOsc,
  DEFAULT_CHART_LINE_RANGE_OSC_SHORT_LENGTH,
  DEFAULT_CHART_LINE_RANGE_OSC_LONG_LENGTH,
} from './chart-line-range-osc';
import type { ChartLineRangeOscPoint } from './chart-line-range-osc';

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLineRangeOscPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

const constFlat = (count: number, K: number): ChartLineRangeOscPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineRangeOscFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineRangeOscFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineRangeOscFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineRangeOscFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineRangeOscFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineRangeOscFinitePoints([
      null as unknown as ChartLineRangeOscPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineRangeOscLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineRangeOscLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineRangeOscLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineRangeOscLength(1, 14)).toBe(14);
  });
});

describe('applyLineRangeOscEma', () => {
  it('EMA of constant K=2 stays at K bit-exact (dyadic)', () => {
    const out = applyLineRangeOscEma([2, 2, 2, 2, 2], 9);
    for (const v of out) expect(v).toBe(2);
  });

  it('null breaks chain and re-seeds', () => {
    const out = applyLineRangeOscEma([1, 2, null, 5, 6], 9);
    expect(out[0]).toBe(1);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(5);
  });
});

describe('computeLineRangeOscTrueRange', () => {
  it('TR[0] = high - low', () => {
    const tr = computeLineRangeOscTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
    ]);
    expect(tr[0]).toBe(2);
  });

  it('TR uses max(range, |H - prevC|, |L - prevC|)', () => {
    const tr = computeLineRangeOscTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 15, low: 14, close: 14 },
    ]);
    expect(tr[1]).toBe(5);
  });

  it('CONST_FLAT yields TR = 0 at every bar', () => {
    const tr = computeLineRangeOscTrueRange(
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

describe('computeLineRangeOsc', () => {
  it('returns empty for null', () => {
    const ch = computeLineRangeOsc(null);
    expect(ch.tr).toEqual([]);
    expect(ch.rangeOsc).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineRangeOsc([]);
    expect(ch.rangeOsc).toEqual([]);
  });

  it('nulls warmup bars (i < longLength - 1)', () => {
    const bars = constBar(50, 12, 8, 10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineRangeOsc(bars, { shortLength: 5, longLength: 10 });
    for (let i = 0; i < 9; i += 1) {
      expect(ch.rangeOsc[i]).toBe(null);
    }
    expect(typeof ch.rangeOsc[9]).toBe('number');
  });

  it('CONST_FLAT yields rangeOsc = 0 bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(50, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineRangeOsc(bars, {
        shortLength: 5,
        longLength: 10,
      });
      for (let i = 9; i < 50; i += 1) {
        expect(ch.rangeOsc[i]).toBe(0);
      }
    }
  });

  it('CONST_BAR with dyadic TR yields rangeOsc = 0 bit-exact', () => {
    // TR = H - L must be dyadic for the EMA-of-constant equality
    // to hold bit-exact under IEEE 754.
    for (const { H, L, C } of [
      { H: 4, L: 2, C: 3 }, // TR = 2
      { H: 12, L: 8, C: 10 }, // TR = 4
      { H: 18, L: 10, C: 14 }, // TR = 8
    ]) {
      const bars = constBar(50, H, L, C).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineRangeOsc(bars, {
        shortLength: 5,
        longLength: 10,
      });
      for (let i = 9; i < 50; i += 1) {
        expect(ch.rangeOsc[i]).toBe(0);
      }
    }
  });

  it('CONST_BAR with non-dyadic TR yields rangeOsc close to 0', () => {
    for (const { H, L, C } of [
      { H: 50, L: 40, C: 45 }, // TR = 10
      { H: 100, L: 1, C: 50 }, // TR = 99
    ]) {
      const bars = constBar(50, H, L, C).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineRangeOsc(bars, {
        shortLength: 5,
        longLength: 10,
      });
      for (let i = 9; i < 50; i += 1) {
        expect(ch.rangeOsc[i]).toBeCloseTo(0, 9);
      }
    }
  });

  it('output length matches input length', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineRangeOsc(bars);
    expect(ch.rangeOsc.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineRangeOsc(bars);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite lengths (uses defaults)', () => {
    const bars = constBar(50, 4, 2, 3).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineRangeOsc(bars, {
      shortLength: Number.NaN,
      longLength: Number.NaN,
    });
    expect(ch.rangeOsc[27]).toBe(0);
  });
});

describe('classifyLineRangeOscZone', () => {
  it('classifies at when value == 0', () => {
    expect(classifyLineRangeOscZone(0, 100)).toBe('at');
  });

  it('classifies expanding at >= 50% of abs max', () => {
    expect(classifyLineRangeOscZone(50, 100)).toBe('expanding');
    expect(classifyLineRangeOscZone(100, 100)).toBe('expanding');
  });

  it('classifies above between 0 and 50% of abs max', () => {
    expect(classifyLineRangeOscZone(25, 100)).toBe('above');
  });

  it('classifies below between -50% and 0', () => {
    expect(classifyLineRangeOscZone(-25, 100)).toBe('below');
  });

  it('classifies contracting at <= -50% of abs max', () => {
    expect(classifyLineRangeOscZone(-50, 100)).toBe('contracting');
    expect(classifyLineRangeOscZone(-100, 100)).toBe('contracting');
  });

  it('returns none for null', () => {
    expect(classifyLineRangeOscZone(null, 100)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineRangeOscZone(Number.NaN, 100)).toBe('none');
  });

  it('falls back to above/below when rangeOscAbsMaxSeen is zero', () => {
    expect(classifyLineRangeOscZone(5, 0)).toBe('above');
    expect(classifyLineRangeOscZone(-5, 0)).toBe('below');
  });
});

describe('runLineRangeOsc', () => {
  it('marks ok=false for fewer than longLength points', () => {
    const run = runLineRangeOsc(constBar(10), {
      shortLength: 5,
      longLength: 14,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineRangeOsc(constBar(14), {
      shortLength: 5,
      longLength: 14,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineRangeOsc(constBar(50));
    expect(run.shortLength).toBe(DEFAULT_CHART_LINE_RANGE_OSC_SHORT_LENGTH);
    expect(run.longLength).toBe(DEFAULT_CHART_LINE_RANGE_OSC_LONG_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineRangeOsc(constBar(50), {
      shortLength: 7,
      longLength: 21,
    });
    expect(run.shortLength).toBe(7);
    expect(run.longLength).toBe(21);
  });

  it('sorts by x', () => {
    const data: ChartLineRangeOscPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineRangeOsc(data, { shortLength: 2, longLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies post-warmup as at', () => {
    const run = runLineRangeOsc(constFlat(50, 5), {
      shortLength: 5,
      longLength: 10,
    });
    expect(run.atCount).toBe(50 - 9);
  });

  it('CONST_BAR dyadic classifies post-warmup as at', () => {
    const run = runLineRangeOsc(constBar(50, 12, 8, 10), {
      shortLength: 5,
      longLength: 10,
    });
    expect(run.atCount).toBe(50 - 9);
  });

  it('exposes rangeOscFinal as the last finite reading', () => {
    const run = runLineRangeOsc(constFlat(50, 5), {
      shortLength: 5,
      longLength: 10,
    });
    expect(run.rangeOscFinal).toBe(0);
  });

  it('rangeOscFinal is null when there is no data', () => {
    const run = runLineRangeOsc([]);
    expect(run.rangeOscFinal).toBe(null);
  });

  it('exposes rangeOscAbsMaxSeen', () => {
    const run = runLineRangeOsc(constFlat(50, 5), {
      shortLength: 5,
      longLength: 10,
    });
    expect(run.rangeOscAbsMaxSeen).toBe(0);
  });
});

describe('computeLineRangeOscLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineRangeOscLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineRangeOscLayout({
      data: constBar(50, 12, 8, 10),
      shortLength: 5,
      longLength: 10,
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineRangeOscLayout({
      data: constBar(50),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above osc', () => {
    const layout = computeLineRangeOscLayout({ data: constBar(50) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineRangeOscLayout({
      data: constBar(50),
      panelGap: 24,
    });
    expect(layout.oscTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineRangeOscLayout({ data: constBar(50) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(50);
  });

  it('produces an osc path and markers (skipping warmup)', () => {
    const layout = computeLineRangeOscLayout({
      data: constBar(50, 12, 8, 10),
      shortLength: 5,
      longLength: 10,
    });
    expect(layout.markers.length).toBe(50 - 9);
  });

  it('zero baseline is inside the osc panel', () => {
    const layout = computeLineRangeOscLayout({
      data: constBar(50, 12, 8, 10),
      shortLength: 5,
      longLength: 10,
    });
    expect(layout.zeroBaselineY).toBeGreaterThanOrEqual(layout.oscTop);
    expect(layout.zeroBaselineY).toBeLessThanOrEqual(layout.oscBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineRangeOscLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineRangeOscChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineRangeOscChart([])).toBe('No data');
  });

  it('mentions Range Oscillator', () => {
    const desc = describeLineRangeOscChart(constBar(50));
    expect(desc).toContain('Range Oscillator');
  });

  it('mentions the formula', () => {
    const desc = describeLineRangeOscChart(constBar(50));
    expect(desc).toContain('EMA(trueRange, shortLength)');
    expect(desc).toContain('EMA(trueRange, longLength)');
  });

  it('reports the lengths', () => {
    const desc = describeLineRangeOscChart(constBar(50), {
      shortLength: 7,
      longLength: 21,
    });
    expect(desc).toContain('shortLength 7');
    expect(desc).toContain('longLength 21');
  });

  it('reports the final reading', () => {
    const desc = describeLineRangeOscChart(constFlat(50, 5), {
      shortLength: 5,
      longLength: 10,
    });
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineRangeOsc />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineRangeOsc data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-range-osc-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Range Oscillator');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRangeOsc data={constBar(50)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-short-length and data-long-length', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        shortLength={7}
        longLength={21}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-range-osc"]',
    );
    expect(root?.getAttribute('data-short-length')).toBe('7');
    expect(root?.getAttribute('data-long-length')).toBe('21');
  });

  it('exposes data-range-osc-final', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constFlat(50, 5)}
        shortLength={5}
        longLength={10}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-range-osc"]',
    );
    expect(root?.getAttribute('data-range-osc-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-range-osc"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('50');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-range-osc-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Range Oscillator');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="rangeOsc"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="rangeOsc"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'rangeOsc',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        hiddenSeries={['rangeOsc']}
      />,
    );
    const button = container.querySelector('[data-series-id="rangeOsc"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides range osc line when controlled hidden', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        hiddenSeries={['rangeOsc']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-range-osc-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-range-osc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-range-osc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-range-osc-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-range-osc-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatRangeOsc', () => {
    const fmt = (v: number) => `[R:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        formatRangeOsc={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-range-osc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[R:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-range-osc"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-range-osc"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-range-osc-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the range osc line by default', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        defaultHiddenSeries={['rangeOsc']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-range-osc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineRangeOsc data={constBar(50)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-range-osc-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineRangeOsc
        data={constBar(50)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-range-osc-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-range-osc-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Range Oscillator integration', () => {
  it('CONST_FLAT yields rangeOsc = 0 across (K, shortLength, longLength)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const SL of [3, 5, 7]) {
        for (const LL of [SL + 5, SL + 10, SL + 14]) {
          const bars = constFlat(LL + 10, K).map((p) => ({
            high: p.high,
            low: p.low,
            close: p.close,
          }));
          const ch = computeLineRangeOsc(bars, {
            shortLength: SL,
            longLength: LL,
          });
          for (let i = LL - 1; i < bars.length; i += 1) {
            expect(ch.rangeOsc[i]).toBe(0);
          }
        }
      }
    }
  });

  it('CONST_BAR with dyadic TR yields rangeOsc = 0 across lengths', () => {
    for (const { H, L, C } of [
      { H: 4, L: 2, C: 3 }, // TR = 2
      { H: 12, L: 8, C: 10 }, // TR = 4
      { H: 18, L: 10, C: 14 }, // TR = 8
    ]) {
      for (const SL of [3, 5, 7]) {
        for (const LL of [SL + 5, SL + 10]) {
          const bars = constBar(LL + 10, H, L, C).map((p) => ({
            high: p.high,
            low: p.low,
            close: p.close,
          }));
          const ch = computeLineRangeOsc(bars, {
            shortLength: SL,
            longLength: LL,
          });
          for (let i = LL - 1; i < bars.length; i += 1) {
            expect(ch.rangeOsc[i]).toBe(0);
          }
        }
      }
    }
  });
});
