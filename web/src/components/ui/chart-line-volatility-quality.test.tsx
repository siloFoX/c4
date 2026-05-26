import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVolatilityQuality,
  applyLineVolatilityQualityEma,
  applyLineVolatilityQualitySma,
  classifyLineVolatilityQualityZone,
  computeLineVolatilityQuality,
  computeLineVolatilityQualityLayout,
  computeLineVolatilityQualityTrueRange,
  describeLineVolatilityQualityChart,
  getLineVolatilityQualityFinitePoints,
  normalizeLineVolatilityQualityLength,
  runLineVolatilityQuality,
  DEFAULT_CHART_LINE_VOLATILITY_QUALITY_LENGTH,
} from './chart-line-volatility-quality';
import type { ChartLineVolatilityQualityPoint } from './chart-line-volatility-quality';

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLineVolatilityQualityPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

const constFlat = (count: number, K: number): ChartLineVolatilityQualityPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineVolatilityQualityFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineVolatilityQualityFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineVolatilityQualityFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineVolatilityQualityFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineVolatilityQualityFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineVolatilityQualityFinitePoints([
      null as unknown as ChartLineVolatilityQualityPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineVolatilityQualityLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineVolatilityQualityLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineVolatilityQualityLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineVolatilityQualityLength(1, 14)).toBe(14);
  });
});

describe('applyLineVolatilityQualityEma', () => {
  it('EMA of constant K=2 stays at K bit-exact (dyadic)', () => {
    const out = applyLineVolatilityQualityEma([2, 2, 2, 2, 2], 9);
    for (const v of out) expect(v).toBe(2);
  });

  it('null breaks chain and re-seeds', () => {
    const out = applyLineVolatilityQualityEma([1, 2, null, 5, 6], 9);
    expect(out[0]).toBe(1);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(5);
  });
});

describe('applyLineVolatilityQualitySma', () => {
  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineVolatilityQualitySma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('computeLineVolatilityQualityTrueRange', () => {
  it('TR[0] = high - low', () => {
    const tr = computeLineVolatilityQualityTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
    ]);
    expect(tr[0]).toBe(2);
  });

  it('TR uses max(range, |H - prevC|, |L - prevC|)', () => {
    const tr = computeLineVolatilityQualityTrueRange([
      { high: 11, low: 9, close: 10 },
      { high: 15, low: 14, close: 14 },
    ]);
    expect(tr[1]).toBe(5);
  });

  it('CONST_FLAT yields TR = 0 at every bar', () => {
    const tr = computeLineVolatilityQualityTrueRange(
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

  it('CONST_BAR with C at midpoint yields TR = H - L every bar', () => {
    const tr = computeLineVolatilityQualityTrueRange(
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
});

describe('computeLineVolatilityQuality', () => {
  it('returns empty for null', () => {
    const ch = computeLineVolatilityQuality(null);
    expect(ch.tr).toEqual([]);
    expect(ch.vqi).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineVolatilityQuality([]);
    expect(ch.vqi).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const bars = constBar(30, 12, 8, 10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineVolatilityQuality(bars, { length: 14 });
    for (let i = 0; i < 13; i += 1) {
      expect(ch.vqi[i]).toBe(null);
    }
    expect(typeof ch.vqi[13]).toBe('number');
  });

  it('CONST_BAR with dyadic TR yields VQI = 1 bit-exact past warmup', () => {
    // TR = H - L must be a power of 2 (or 0) for the EMA of TR to
    // stay bit-exact -- alpha*K + (1 - alpha)*K simplifies to K
    // exactly only when K is dyadic-friendly in IEEE 754.
    for (const { H, L, C } of [
      { H: 4, L: 2, C: 3 }, // TR = 2
      { H: 12, L: 8, C: 10 }, // TR = 4
      { H: 18, L: 10, C: 14 }, // TR = 8
    ]) {
      const bars = constBar(30, H, L, C).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineVolatilityQuality(bars, { length: 14 });
      for (let i = 13; i < 30; i += 1) {
        expect(ch.vqi[i]).toBe(1);
      }
    }
  });

  it('CONST_BAR with non-dyadic TR yields VQI close to 1 past warmup', () => {
    for (const { H, L, C } of [
      { H: 50, L: 40, C: 45 }, // TR = 10
      { H: 100, L: 1, C: 50 }, // TR = 99
    ]) {
      const bars = constBar(30, H, L, C).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineVolatilityQuality(bars, { length: 14 });
      for (let i = 13; i < 30; i += 1) {
        expect(ch.vqi[i]).toBeCloseTo(1, 12);
      }
    }
  });

  it('CONST_FLAT yields VQI = null (singular)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineVolatilityQuality(bars, { length: 14 });
      for (let i = 0; i < 30; i += 1) {
        expect(ch.vqi[i]).toBe(null);
      }
    }
  });

  it('output length matches input length', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineVolatilityQuality(bars, { length: 14 });
    expect(ch.vqi.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineVolatilityQuality(bars, { length: 14 });
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = constBar(30, 12, 8, 10).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const ch = computeLineVolatilityQuality(bars, { length: Number.NaN });
    expect(ch.vqi[13]).toBe(1);
  });

  it('VQI is positive for any non-degenerate input', () => {
    const bars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 30; i += 1) {
      bars.push({
        high: 100 + Math.sin(i / 3) * 5,
        low: 95 + Math.cos(i / 4) * 3,
        close: 98,
      });
    }
    const ch = computeLineVolatilityQuality(bars, { length: 10 });
    for (let i = 9; i < 30; i += 1) {
      const v = ch.vqi[i];
      expect(v != null && v > 0).toBe(true);
    }
  });
});

describe('classifyLineVolatilityQualityZone', () => {
  it('classifies expanding at >= 1.1', () => {
    expect(classifyLineVolatilityQualityZone(1.1)).toBe('expanding');
    expect(classifyLineVolatilityQualityZone(2)).toBe('expanding');
  });

  it('classifies above between 1.0 and 1.1', () => {
    expect(classifyLineVolatilityQualityZone(1.05)).toBe('above');
  });

  it('classifies at when value == 1.0', () => {
    expect(classifyLineVolatilityQualityZone(1)).toBe('at');
  });

  it('classifies below between 0.9 and 1.0', () => {
    expect(classifyLineVolatilityQualityZone(0.95)).toBe('below');
  });

  it('classifies contracting at <= 0.9', () => {
    expect(classifyLineVolatilityQualityZone(0.9)).toBe('contracting');
    expect(classifyLineVolatilityQualityZone(0.5)).toBe('contracting');
  });

  it('returns none for null', () => {
    expect(classifyLineVolatilityQualityZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineVolatilityQualityZone(Number.NaN)).toBe('none');
  });
});

describe('runLineVolatilityQuality', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineVolatilityQuality(constBar(10), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineVolatilityQuality(constBar(14), { length: 14 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineVolatilityQuality(constBar(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_VOLATILITY_QUALITY_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineVolatilityQuality(constBar(30), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineVolatilityQualityPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineVolatilityQuality(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_BAR classifies post-warmup as at (VQI = 1)', () => {
    const run = runLineVolatilityQuality(constBar(30));
    expect(run.atCount).toBe(30 - 13);
  });

  it('CONST_FLAT classifies all as none (singular)', () => {
    const run = runLineVolatilityQuality(constFlat(30, 5));
    expect(run.noneCount).toBe(30);
  });

  it('exposes vqiFinal as the last finite reading', () => {
    const run = runLineVolatilityQuality(constBar(30));
    expect(run.vqiFinal).toBe(1);
  });

  it('vqiFinal is null when there is no data', () => {
    const run = runLineVolatilityQuality([]);
    expect(run.vqiFinal).toBe(null);
  });
});

describe('computeLineVolatilityQualityLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineVolatilityQualityLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineVolatilityQualityLayout({
      data: constBar(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineVolatilityQualityLayout({
      data: constBar(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above vqi', () => {
    const layout = computeLineVolatilityQualityLayout({ data: constBar(30) });
    expect(layout.priceBottom).toBeLessThan(layout.vqiTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineVolatilityQualityLayout({
      data: constBar(30),
      panelGap: 24,
    });
    expect(layout.vqiTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineVolatilityQualityLayout({ data: constBar(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a vqi path and markers (skipping warmup)', () => {
    const layout = computeLineVolatilityQualityLayout({ data: constBar(30) });
    expect(layout.markers.length).toBe(30 - 13);
  });

  it('unity line is inside the vqi panel', () => {
    const layout = computeLineVolatilityQualityLayout({ data: constBar(30) });
    expect(layout.unityLineY).toBeGreaterThanOrEqual(layout.vqiTop);
    expect(layout.unityLineY).toBeLessThanOrEqual(layout.vqiBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineVolatilityQualityLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineVolatilityQualityChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineVolatilityQualityChart([])).toBe('No data');
  });

  it('mentions Volatility Quality Index', () => {
    const desc = describeLineVolatilityQualityChart(constBar(30));
    expect(desc).toContain('Volatility Quality Index');
  });

  it('mentions the formula', () => {
    const desc = describeLineVolatilityQualityChart(constBar(30));
    expect(desc).toContain('EMA(trueRange, length)');
    expect(desc).toContain('SMA(trueRange, length)');
  });

  it('reports the length', () => {
    const desc = describeLineVolatilityQualityChart(constBar(30), { length: 7 });
    expect(desc).toContain('length 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineVolatilityQualityChart(constBar(30));
    expect(desc).toContain('1.0000');
  });
});

describe('<ChartLineVolatilityQuality />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineVolatilityQuality data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-volatility-quality-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Volatility Quality Index');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVolatilityQuality data={constBar(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volatility-quality"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes data-vqi-final', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volatility-quality"]',
    );
    expect(root?.getAttribute('data-vqi-final')).toBe('1');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volatility-quality"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-volatility-quality-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Volatility Quality Index');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="vqi"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="vqi"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'vqi',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        hiddenSeries={['vqi']}
      />,
    );
    const button = container.querySelector('[data-series-id="vqi"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides vqi line when controlled hidden', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        hiddenSeries={['vqi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-volatility-quality-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-volatility-quality-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-volatility-quality-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-volatility-quality-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-volatility-quality-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-legend"]',
      ),
    ).toBe(null);
  });

  it('hides unity line when showUnityLine is false', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        showUnityLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-unity-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatVqi', () => {
    const fmt = (v: number) => `[V:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        formatVqi={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-volatility-quality-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[V:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volatility-quality"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volatility-quality"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-volatility-quality-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the vqi line by default', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        defaultHiddenSeries={['vqi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-volatility-quality-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineVolatilityQuality data={constBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-volatility-quality-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineVolatilityQuality
        data={constBar(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-volatility-quality-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-volatility-quality-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('VQI integration', () => {
  it('CONST_BAR yields VQI close to 1 across (H, L, C, length)', () => {
    for (const { H, L, C } of [
      { H: 12, L: 8, C: 10 },
      { H: 50, L: 40, C: 45 },
      { H: 100, L: 1, C: 50 },
      { H: 4, L: 2, C: 2 },
      { H: 4, L: 2, C: 4 },
    ]) {
      for (const L_ of [3, 5, 7, 14]) {
        const bars = constBar(L_ + 10, H, L, C).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const ch = computeLineVolatilityQuality(bars, { length: L_ });
        for (let i = L_ - 1; i < bars.length; i += 1) {
          expect(ch.vqi[i]).toBeCloseTo(1, 12);
        }
      }
    }
  });

  it('CONST_BAR with dyadic TR yields VQI = 1 bit-exact across (length, multiplier)', () => {
    // For TR in {2, 4, 8} the EMA-of-constant equality holds in
    // IEEE 754 (no rounding from the alpha*K + (1-alpha)*K
    // identity).
    for (const { H, L, C } of [
      { H: 4, L: 2, C: 3 }, // TR = 2
      { H: 12, L: 8, C: 10 }, // TR = 4
      { H: 18, L: 10, C: 14 }, // TR = 8
    ]) {
      for (const L_ of [3, 5, 7, 14]) {
        const bars = constBar(L_ + 10, H, L, C).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const ch = computeLineVolatilityQuality(bars, { length: L_ });
        for (let i = L_ - 1; i < bars.length; i += 1) {
          expect(ch.vqi[i]).toBe(1);
        }
      }
    }
  });

  it('CONST_FLAT yields all-null VQI', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const ch = computeLineVolatilityQuality(bars, { length: 14 });
      for (let i = 0; i < 30; i += 1) {
        expect(ch.vqi[i]).toBe(null);
      }
    }
  });
});
