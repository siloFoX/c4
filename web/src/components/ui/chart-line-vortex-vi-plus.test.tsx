import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVortexViPlus,
  applyLineVortexViPlusRollingSum,
  classifyLineVortexViPlusZone,
  computeLineVortexViPlus,
  computeLineVortexViPlusLayout,
  computeLineVortexViPlusTrueRange,
  computeLineVortexViPlusVm,
  describeLineVortexViPlusChart,
  getLineVortexViPlusFinitePoints,
  normalizeLineVortexViPlusLength,
  runLineVortexViPlus,
  DEFAULT_CHART_LINE_VORTEX_VI_PLUS_LENGTH,
} from './chart-line-vortex-vi-plus';
import type { ChartLineVortexViPlusPoint } from './chart-line-vortex-vi-plus';

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLineVortexViPlusPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

const constFlat = (count: number, K: number): ChartLineVortexViPlusPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineVortexViPlusFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineVortexViPlusFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineVortexViPlusFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineVortexViPlusFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineVortexViPlusFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineVortexViPlusFinitePoints([
      null as unknown as ChartLineVortexViPlusPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineVortexViPlusLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineVortexViPlusLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineVortexViPlusLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineVortexViPlusLength(1, 14)).toBe(14);
  });
});

describe('computeLineVortexViPlusVm', () => {
  it('emits null at bar 0', () => {
    const vm = computeLineVortexViPlusVm([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
    ]);
    expect(vm[0]).toBe(null);
  });

  it('computes |high[i] - low[i-1]| at i >= 1', () => {
    const vm = computeLineVortexViPlusVm([
      { high: 11, low: 9, close: 10 },
      { high: 13, low: 10, close: 11 },
    ]);
    // |13 - 9| = 4
    expect(vm[1]).toBe(4);
  });

  it('returns absolute value (always non-negative)', () => {
    const vm = computeLineVortexViPlusVm([
      { high: 11, low: 9, close: 10 },
      { high: 5, low: 4, close: 4 },
    ]);
    // |5 - 9| = 4
    expect(vm[1]).toBe(4);
  });

  it('CONST_BAR yields VM+ = high - low at every i >= 1', () => {
    const vm = computeLineVortexViPlusVm(
      constBar(10, 12, 8, 10).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );
    expect(vm[0]).toBe(null);
    for (let i = 1; i < 10; i += 1) {
      expect(vm[i]).toBe(4);
    }
  });

  it('CONST_FLAT yields VM+ = 0 at every i >= 1', () => {
    const vm = computeLineVortexViPlusVm(
      constFlat(10, 5).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );
    expect(vm[0]).toBe(null);
    for (let i = 1; i < 10; i += 1) {
      expect(vm[i]).toBe(0);
    }
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineVortexViPlusVm([])).toEqual([]);
  });

  it('returns an empty array for null', () => {
    expect(computeLineVortexViPlusVm(null)).toEqual([]);
  });
});

describe('computeLineVortexViPlusTrueRange', () => {
  it('TR[0] = high - low', () => {
    const tr = computeLineVortexViPlusTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
    ]);
    expect(tr[0]).toBe(2);
  });

  it('TR uses max(range, |H - prevC|, |L - prevC|)', () => {
    const tr = computeLineVortexViPlusTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 15, low: 14, close: 14 },
    ]);
    // range = 1, |15 - 10| = 5, |14 - 10| = 4
    // max = 5
    expect(tr[1]).toBe(5);
  });

  it('CONST_BAR yields TR = high - low at every bar', () => {
    const tr = computeLineVortexViPlusTrueRange(
      constBar(10, 12, 8, 10).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );
    for (let i = 0; i < 10; i += 1) {
      expect(tr[i]).toBe(4);
    }
  });

  it('CONST_FLAT yields TR = 0 at every bar', () => {
    const tr = computeLineVortexViPlusTrueRange(
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

describe('applyLineVortexViPlusRollingSum', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineVortexViPlusRollingSum([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(6);
  });

  it('propagates null through the window', () => {
    const out = applyLineVortexViPlusRollingSum([1, null, 3, 4, 5], 3);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(12);
  });

  it('SUM of constant K is length*K bit-exact (integer)', () => {
    const out = applyLineVortexViPlusRollingSum(Array(10).fill(4), 4);
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(16);
    }
  });
});

describe('computeLineVortexViPlus', () => {
  it('returns an empty array for null', () => {
    expect(computeLineVortexViPlus(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineVortexViPlus([])).toEqual([]);
  });

  it('nulls warmup bars (i < length)', () => {
    const bars = constBar(20, 12, 8, 10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineVortexViPlus(bars, { length: 14 });
    for (let i = 0; i < 14; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[14]).toBe('number');
  });

  it('CONST_BAR (constant H/L/C) yields +VI = 1 bit-exact past warmup', () => {
    for (const { H, L, C } of [
      { H: 12, L: 8, C: 10 },
      { H: 50, L: 40, C: 45 },
      { H: 100, L: 1, C: 50 },
      { H: 4, L: 2, C: 3 },
    ]) {
      const bars = constBar(30, H, L, C).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineVortexViPlus(bars, { length: 14 });
      for (let i = 14; i < 30; i += 1) {
        expect(out[i]).toBe(1);
      }
    }
  });

  it('CONST_BAR with close = L yields +VI = 1 bit-exact', () => {
    const bars = constBar(30, 12, 8, 8).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineVortexViPlus(bars, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(out[i]).toBe(1);
    }
  });

  it('CONST_BAR with close = H yields +VI = 1 bit-exact', () => {
    const bars = constBar(30, 12, 8, 12).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineVortexViPlus(bars, { length: 14 });
    for (let i = 14; i < 30; i += 1) {
      expect(out[i]).toBe(1);
    }
  });

  it('CONST_FLAT (h = l = c) yields all nulls (TR sum = 0)', () => {
    for (const K of [0, 1, 5, 100]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineVortexViPlus(bars, { length: 14 });
      for (let i = 0; i < 30; i += 1) {
        expect(out[i]).toBe(null);
      }
    }
  });

  it('output length matches input length', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineVortexViPlus(bars, { length: 14 });
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineVortexViPlus(bars, { length: 14 });
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineVortexViPlus(bars, { length: Number.NaN });
    expect(out[14]).toBe(1);
  });

  it('different lengths still produce +VI = 1 for CONST_BAR data', () => {
    for (const L of [3, 5, 7, 14, 20]) {
      const bars = constBar(L + 10).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineVortexViPlus(bars, { length: L });
      for (let i = L; i < bars.length; i += 1) {
        expect(out[i]).toBe(1);
      }
    }
  });
});

describe('classifyLineVortexViPlusZone', () => {
  it('classifies strong-up at >= 1.1', () => {
    expect(classifyLineVortexViPlusZone(1.1)).toBe('strong-up');
    expect(classifyLineVortexViPlusZone(2)).toBe('strong-up');
  });

  it('classifies above between 1.0 and 1.1', () => {
    expect(classifyLineVortexViPlusZone(1)).toBe('above');
    expect(classifyLineVortexViPlusZone(1.05)).toBe('above');
  });

  it('classifies below between 0.9 and 1.0', () => {
    expect(classifyLineVortexViPlusZone(0.95)).toBe('below');
  });

  it('classifies weak at <= 0.9', () => {
    expect(classifyLineVortexViPlusZone(0.9)).toBe('weak');
    expect(classifyLineVortexViPlusZone(0)).toBe('weak');
    expect(classifyLineVortexViPlusZone(-0.5)).toBe('weak');
  });

  it('returns none for null', () => {
    expect(classifyLineVortexViPlusZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineVortexViPlusZone(Number.NaN)).toBe('none');
  });
});

describe('runLineVortexViPlus', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineVortexViPlus(constBar(10), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points (> length)', () => {
    const run = runLineVortexViPlus(constBar(20), { length: 14 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineVortexViPlus(constBar(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_VORTEX_VI_PLUS_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineVortexViPlus(constBar(30), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineVortexViPlusPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineVortexViPlus(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_BAR classifies post-warmup readings as above (=1)', () => {
    const run = runLineVortexViPlus(constBar(30));
    expect(run.aboveCount).toBe(30 - 14);
    expect(run.strongUpCount).toBe(0);
  });

  it('CONST_FLAT classifies all as none (singular)', () => {
    const run = runLineVortexViPlus(constFlat(30, 5));
    expect(run.noneCount).toBe(30);
  });

  it('exposes viPlusFinal as the last finite reading', () => {
    const run = runLineVortexViPlus(constBar(30));
    expect(run.viPlusFinal).toBe(1);
  });

  it('viPlusFinal is null when there is no data', () => {
    const run = runLineVortexViPlus([]);
    expect(run.viPlusFinal).toBe(null);
  });
});

describe('computeLineVortexViPlusLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineVortexViPlusLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineVortexViPlusLayout({
      data: constBar(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineVortexViPlusLayout({
      data: constBar(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above +VI', () => {
    const layout = computeLineVortexViPlusLayout({ data: constBar(30) });
    expect(layout.priceBottom).toBeLessThan(layout.viTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineVortexViPlusLayout({
      data: constBar(30),
      panelGap: 24,
    });
    expect(layout.viTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineVortexViPlusLayout({ data: constBar(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a +VI path and markers (skipping warmup)', () => {
    const layout = computeLineVortexViPlusLayout({ data: constBar(30) });
    expect(layout.markers.length).toBe(30 - 14);
  });

  it('unity line is inside the +VI panel', () => {
    const layout = computeLineVortexViPlusLayout({ data: constBar(30) });
    expect(layout.unityLineY).toBeGreaterThanOrEqual(layout.viTop);
    expect(layout.unityLineY).toBeLessThanOrEqual(layout.viBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineVortexViPlusLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineVortexViPlusChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineVortexViPlusChart([])).toBe('No data');
  });

  it('mentions Vortex Indicator +VI', () => {
    const desc = describeLineVortexViPlusChart(constBar(30));
    expect(desc).toContain('Vortex Indicator +VI');
  });

  it('mentions the formula', () => {
    const desc = describeLineVortexViPlusChart(constBar(30));
    expect(desc).toContain('trueRange');
  });

  it('reports the length', () => {
    const desc = describeLineVortexViPlusChart(constBar(30), { length: 7 });
    expect(desc).toContain('length 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineVortexViPlusChart(constBar(30));
    expect(desc).toContain('1.0000');
  });
});

describe('<ChartLineVortexViPlus />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineVortexViPlus data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Vortex +VI');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVortexViPlus data={constBar(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes data-vi-plus-final', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus"]',
    );
    expect(root?.getAttribute('data-vi-plus-final')).toBe('1');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Vortex Indicator +VI');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="viPlus"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="viPlus"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'viPlus',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        hiddenSeries={['viPlus']}
      />,
    );
    const button = container.querySelector('[data-series-id="viPlus"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides +VI line when controlled hidden', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        hiddenSeries={['viPlus']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vortex-vi-plus-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-vortex-vi-plus-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-vortex-vi-plus-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-legend"]',
      ),
    ).toBe(null);
  });

  it('hides unity line when showUnityLine is false', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        showUnityLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-unity-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatViPlus', () => {
    const fmt = (v: number) => `[V:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        formatViPlus={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[V:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the +VI line by default', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        defaultHiddenSeries={['viPlus']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineVortexViPlus data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineVortexViPlus
        data={constBar(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vortex-vi-plus-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-vi-plus-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Vortex +VI integration', () => {
  it('CONST_BAR yields +VI = 1 bit-exact across (H, L, C, length) combos', () => {
    for (const { H, L, C } of [
      { H: 12, L: 8, C: 10 },
      { H: 50, L: 40, C: 45 },
      { H: 100, L: 1, C: 50 },
      { H: 4, L: 2, C: 2 },
      { H: 4, L: 2, C: 4 },
    ]) {
      for (const L_ of [3, 5, 7, 14, 20]) {
        const bars = constBar(L_ + 10, H, L, C).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const out = computeLineVortexViPlus(bars, { length: L_ });
        for (let i = L_; i < bars.length; i += 1) {
          expect(out[i]).toBe(1);
        }
      }
    }
  });

  it('CONST_FLAT yields all-null +VI across many K values', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineVortexViPlus(bars, { length: 14 });
      for (let i = 0; i < 30; i += 1) {
        expect(out[i]).toBe(null);
      }
    }
  });
});
