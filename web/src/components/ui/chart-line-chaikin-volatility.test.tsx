import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineChaikinVolatility,
  classifyLineChaikinVolatilityZone,
  computeLineChaikinVolatility,
  computeLineChaikinVolatilityEma,
  computeLineChaikinVolatilityLayout,
  describeLineChaikinVolatilityChart,
  getLineChaikinVolatilityFinitePoints,
  normalizeLineChaikinVolatilityLength,
  runLineChaikinVolatility,
  DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_LENGTH,
} from './chart-line-chaikin-volatility';
import type {
  ChartLineChaikinVolatilityPoint,
} from './chart-line-chaikin-volatility';

const constHL = (length: number, range = 2, mid = 10): ChartLineChaikinVolatilityPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: mid + range / 2,
    low: mid - range / 2,
    close: mid,
  }));

const flatHL = (length: number, K = 10): ChartLineChaikinVolatilityPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const variable = (length: number): ChartLineChaikinVolatilityPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: 100 + Math.sin(i / 5) * 5 + (i % 3),
    low: 90 + Math.cos(i / 5) * 5,
    close: 95 + Math.sin(i / 5) * 3,
  }));

describe('getLineChaikinVolatilityFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineChaikinVolatilityFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineChaikinVolatilityFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineChaikinVolatilityFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineChaikinVolatilityFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineChaikinVolatilityFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineChaikinVolatilityFinitePoints([
      null as unknown as ChartLineChaikinVolatilityPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineChaikinVolatilityLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineChaikinVolatilityLength(undefined, 10)).toBe(10);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineChaikinVolatilityLength(Number.NaN, 10)).toBe(10);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineChaikinVolatilityLength(7.9, 10)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineChaikinVolatilityLength(1, 10)).toBe(10);
  });

  it('accepts the minimum length of 2', () => {
    expect(normalizeLineChaikinVolatilityLength(2, 10)).toBe(2);
  });
});

describe('computeLineChaikinVolatilityEma', () => {
  it('EMA of zeros stays at zero bit-exact', () => {
    const out = computeLineChaikinVolatilityEma([0, 0, 0, 0, 0], 9);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('EMA of constant 2 stays at 2 bit-exact (dyadic-friendly)', () => {
    const out = computeLineChaikinVolatilityEma([2, 2, 2, 2, 2], 9);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(2);
    }
  });

  it('EMA seeds with the first value', () => {
    const out = computeLineChaikinVolatilityEma([42, 99, 7], 9);
    expect(out[0]).toBe(42);
  });

  it('null breaks the chain and the next finite bar re-seeds', () => {
    const out = computeLineChaikinVolatilityEma([1, 2, null, 5, 6], 9);
    expect(out[0]).toBe(1);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(5);
  });
});

describe('computeLineChaikinVolatility', () => {
  it('returns an empty array for null', () => {
    expect(computeLineChaikinVolatility(null, 5)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineChaikinVolatility([], 5)).toEqual([]);
  });

  it('nulls warmup bars (i < 2 * length)', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineChaikinVolatility(bars, 5);
    for (let i = 0; i < 10; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[10]).toBe('number');
  });

  it('CONST_HL (range=2) yields CV = 0 bit-exact past warmup', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineChaikinVolatility(bars, 10);
    for (let i = 20; i < 40; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_HL (range=10, length=5) yields CV = 0 bit-exact past warmup', () => {
    const bars = constHL(40, 10).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineChaikinVolatility(bars, 5);
    for (let i = 10; i < 40; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('CONST_HL (range=1, length=20) yields CV = 0 bit-exact past warmup', () => {
    const bars = constHL(60, 1).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineChaikinVolatility(bars, 20);
    for (let i = 40; i < 60; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('FLAT_HL (range == 0) yields all nulls (singular ema)', () => {
    const bars = flatHL(40, 7).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineChaikinVolatility(bars, 10);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('expanding range produces positive CV', () => {
    // Start with range=1, double to range=4 partway through.
    const bars: Array<{ high: number; low: number }> = [];
    for (let i = 0; i < 20; i += 1) bars.push({ high: 10.5, low: 9.5 });
    for (let i = 0; i < 20; i += 1) bars.push({ high: 12, low: 8 });
    const out = computeLineChaikinVolatility(bars, 10);
    // Some bars in the second half should have positive CV
    let foundPositive = false;
    for (let i = 20; i < 40; i += 1) {
      const v = out[i];
      if (typeof v === 'number' && v > 0) {
        foundPositive = true;
        break;
      }
    }
    expect(foundPositive).toBe(true);
  });

  it('contracting range produces negative CV', () => {
    const bars: Array<{ high: number; low: number }> = [];
    for (let i = 0; i < 20; i += 1) bars.push({ high: 12, low: 8 });
    for (let i = 0; i < 20; i += 1) bars.push({ high: 10.5, low: 9.5 });
    const out = computeLineChaikinVolatility(bars, 10);
    let foundNegative = false;
    for (let i = 20; i < 40; i += 1) {
      const v = out[i];
      if (typeof v === 'number' && v < 0) {
        foundNegative = true;
        break;
      }
    }
    expect(foundNegative).toBe(true);
  });

  it('output length matches input length', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineChaikinVolatility(bars, 10);
    expect(out.length).toBe(40);
  });

  it('does not mutate input', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineChaikinVolatility(bars, 10);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = constHL(40, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineChaikinVolatility(bars, Number.NaN);
    expect(out[39]).toBe(0);
  });

  it('translation invariance: shifting H and L by the same C does not change CV', () => {
    const baseBars = variable(40).map((p) => ({ high: p.high, low: p.low }));
    const shifted = baseBars.map((b) => ({
      high: b.high + 100,
      low: b.low + 100,
    }));
    const base = computeLineChaikinVolatility(baseBars, 10);
    const sh = computeLineChaikinVolatility(shifted, 10);
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i];
      const s = sh[i];
      if (b == null || s == null) {
        expect(b).toBe(s);
        continue;
      }
      expect(s).toBeCloseTo(b, 9);
    }
  });
});

describe('classifyLineChaikinVolatilityZone', () => {
  it('classifies positive', () => {
    expect(classifyLineChaikinVolatilityZone(5)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineChaikinVolatilityZone(-5)).toBe('negative');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineChaikinVolatilityZone(0)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineChaikinVolatilityZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineChaikinVolatilityZone(Number.NaN)).toBe('none');
  });
});

describe('runLineChaikinVolatility', () => {
  it('marks ok=false for fewer than 2*length+1 points', () => {
    const run = runLineChaikinVolatility(constHL(15, 2), { length: 10 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineChaikinVolatility(constHL(30, 2), { length: 10 });
    expect(run.ok).toBe(true);
  });

  it('uses the default length when none is provided', () => {
    const run = runLineChaikinVolatility(constHL(40, 2));
    expect(run.length).toBe(DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_LENGTH);
  });

  it('respects an explicit length', () => {
    const run = runLineChaikinVolatility(constHL(40, 2), { length: 5 });
    expect(run.length).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineChaikinVolatilityPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineChaikinVolatility(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_HL classifies all post-warmup as flat', () => {
    const run = runLineChaikinVolatility(constHL(40, 2));
    // warmup is 2 * 10 = 20 bars
    expect(run.flatCount).toBe(40 - 20);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('FLAT_HL classifies all as none (singular ema = 0)', () => {
    const run = runLineChaikinVolatility(flatHL(40, 7));
    expect(run.flatCount).toBe(0);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('exposes cvFinal as the last finite reading', () => {
    const run = runLineChaikinVolatility(constHL(40, 2));
    expect(run.cvFinal).toBe(0);
  });

  it('cvFinal is null when there is no data', () => {
    const run = runLineChaikinVolatility([]);
    expect(run.cvFinal).toBe(null);
  });
});

describe('computeLineChaikinVolatilityLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineChaikinVolatilityLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineChaikinVolatilityLayout({
      data: constHL(40, 2),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineChaikinVolatilityLayout({
      data: constHL(40, 2),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above CV', () => {
    const layout = computeLineChaikinVolatilityLayout({
      data: constHL(40, 2),
    });
    expect(layout.priceBottom).toBeLessThan(layout.cvTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineChaikinVolatilityLayout({
      data: constHL(40, 2),
      panelGap: 24,
    });
    expect(layout.cvTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineChaikinVolatilityLayout({
      data: constHL(40, 2),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('produces a CV path and markers (skipping warmup)', () => {
    const layout = computeLineChaikinVolatilityLayout({
      data: constHL(40, 2),
    });
    expect(layout.cvPath.length).toBeGreaterThan(0);
    // 40 - 20 = 20 finite bars
    expect(layout.markers.length).toBe(20);
  });

  it('zero line is inside the CV panel', () => {
    const layout = computeLineChaikinVolatilityLayout({
      data: constHL(40, 2),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.cvTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.cvBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineChaikinVolatilityLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineChaikinVolatilityChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineChaikinVolatilityChart([])).toBe('No data');
  });

  it('mentions Chaikin Volatility', () => {
    const desc = describeLineChaikinVolatilityChart(constHL(40, 2));
    expect(desc).toContain('Chaikin Volatility');
  });

  it('mentions rate of change', () => {
    const desc = describeLineChaikinVolatilityChart(constHL(40, 2));
    expect(desc).toContain('rate of change');
  });

  it('reports the length', () => {
    const desc = describeLineChaikinVolatilityChart(constHL(40, 2), {
      length: 14,
    });
    expect(desc).toContain('length 14');
  });

  it('reports positive / flat / negative counts', () => {
    const desc = describeLineChaikinVolatilityChart(constHL(40, 2));
    expect(desc).toMatch(/positive on 0/);
    expect(desc).toMatch(/flat on 20/);
    expect(desc).toMatch(/negative on 0/);
  });

  it('reports the final reading', () => {
    const desc = describeLineChaikinVolatilityChart(constHL(40, 2));
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineChaikinVolatility />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineChaikinVolatility data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-chaikin-volatility-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Chaikin Volatility');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineChaikinVolatility data={constHL(40, 2)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-volatility"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
  });

  it('exposes data-cv-final', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-volatility"]',
    );
    expect(root?.getAttribute('data-cv-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-volatility"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('40');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-chaikin-volatility-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Chaikin Volatility');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="cv"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="cv"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'cv', hidden: true });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        hiddenSeries={['cv']}
      />,
    );
    const button = container.querySelector('[data-series-id="cv"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides CV line when controlled hidden', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        hiddenSeries={['cv']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-chaikin-volatility-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-volatility-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-volatility-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-chaikin-volatility-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-chaikin-volatility-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-zero-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatCv', () => {
    const fmt = (v: number) => `[CV:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        formatCv={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[CV:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-volatility"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-volatility"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-chaikin-volatility-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the CV line by default', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        defaultHiddenSeries={['cv']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-volatility-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineChaikinVolatility data={constHL(40, 2)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-volatility-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineChaikinVolatility
        data={constHL(40, 2)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-volatility-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-volatility-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Chaikin Volatility integration', () => {
  it('CONST_HL yields CV = 0 bit-exact across many (range, length) combos', () => {
    for (const range of [1, 2, 5, 10, 100]) {
      for (const L of [3, 5, 10, 14, 20]) {
        const bars = constHL(3 * L + 5, range).map((p) => ({
          high: p.high,
          low: p.low,
        }));
        const out = computeLineChaikinVolatility(bars, L);
        expect(out[bars.length - 1]).toBe(0);
      }
    }
  });

  it('FLAT_HL yields all nulls regardless of length', () => {
    for (const L of [3, 5, 10, 20]) {
      const bars = flatHL(40, 7).map((p) => ({
        high: p.high,
        low: p.low,
      }));
      const out = computeLineChaikinVolatility(bars, L);
      for (const v of out) {
        expect(v).toBe(null);
      }
    }
  });
});
