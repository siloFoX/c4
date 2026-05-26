import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStochSignal,
  applyLineStochSignalSma,
  classifyLineStochSignalZone,
  computeLineStochSignal,
  computeLineStochSignalLayout,
  describeLineStochSignalChart,
  getLineStochSignalFinitePoints,
  normalizeLineStochSignalLength,
  runLineStochSignal,
  DEFAULT_CHART_LINE_STOCH_SIGNAL_D_PERIOD,
  DEFAULT_CHART_LINE_STOCH_SIGNAL_K_PERIOD,
} from './chart-line-stoch-signal';
import type {
  ChartLineStochSignalPoint,
} from './chart-line-stoch-signal';

const closeAtHigh = (length: number, range = 2, baseLow = 10): ChartLineStochSignalPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: baseLow + range,
    low: baseLow,
    close: baseLow + range,
  }));

const closeAtLow = (length: number, range = 2, baseLow = 10): ChartLineStochSignalPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: baseLow + range,
    low: baseLow,
    close: baseLow,
  }));

const closeAtMid = (length: number, range = 2, baseLow = 10): ChartLineStochSignalPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: baseLow + range,
    low: baseLow,
    close: baseLow + range / 2,
  }));

const constHL = (length: number, K: number): ChartLineStochSignalPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

describe('getLineStochSignalFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineStochSignalFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineStochSignalFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineStochSignalFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineStochSignalFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineStochSignalFinitePoints([
      null as unknown as ChartLineStochSignalPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineStochSignalLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineStochSignalLength(undefined, 14)).toBe(14);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineStochSignalLength(Number.NaN, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineStochSignalLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 1', () => {
    expect(normalizeLineStochSignalLength(0, 14)).toBe(14);
  });

  it('accepts the minimum length of 1', () => {
    expect(normalizeLineStochSignalLength(1, 14)).toBe(1);
  });
});

describe('applyLineStochSignalSma', () => {
  it('SMA of constant K stays at K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      const out = applyLineStochSignalSma(Array(10).fill(K), 3);
      for (let i = 2; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('null in window nulls the output', () => {
    const out = applyLineStochSignalSma([1, 2, null, 4, 5], 3);
    expect(out[3]).toBe(null);
  });
});

describe('computeLineStochSignal', () => {
  it('returns empty arrays for null', () => {
    const out = computeLineStochSignal(null);
    expect(out.k).toEqual([]);
    expect(out.d).toEqual([]);
  });

  it('returns empty arrays for empty input', () => {
    const out = computeLineStochSignal([]);
    expect(out.k).toEqual([]);
    expect(out.d).toEqual([]);
  });

  it('nulls warmup bars (i < kPeriod - 1)', () => {
    const bars = closeAtHigh(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
    for (let i = 0; i < 13; i += 1) {
      expect(out.k[i]).toBe(null);
    }
    expect(typeof out.k[13]).toBe('number');
  });

  it('close-at-high yields %K = 100 bit-exact at every bar past warmup', () => {
    for (const range of [1, 2, 5, 10, 100]) {
      const bars = closeAtHigh(30, range).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
      for (let i = 13; i < 30; i += 1) {
        expect(out.k[i]).toBe(100);
      }
    }
  });

  it('close-at-high yields %D = 100 bit-exact past combined warmup', () => {
    const bars = closeAtHigh(30, 2).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
    for (let i = 15; i < 30; i += 1) {
      expect(out.d[i]).toBe(100);
    }
  });

  it('close-at-low yields %K = 0 bit-exact at every bar past warmup', () => {
    for (const range of [1, 2, 5, 10, 100]) {
      const bars = closeAtLow(30, range).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
      for (let i = 13; i < 30; i += 1) {
        expect(out.k[i]).toBe(0);
      }
    }
  });

  it('close-at-low yields %D = 0 bit-exact past combined warmup', () => {
    const bars = closeAtLow(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
    for (let i = 15; i < 30; i += 1) {
      expect(out.d[i]).toBe(0);
    }
  });

  it('close-at-midpoint (range=2) yields %K = 50 bit-exact', () => {
    const bars = closeAtMid(30, 2).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
    for (let i = 13; i < 30; i += 1) {
      expect(out.k[i]).toBe(50);
    }
  });

  it('close-at-midpoint (range=4) yields %K = 50 bit-exact', () => {
    const bars = closeAtMid(30, 4).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
    for (let i = 13; i < 30; i += 1) {
      expect(out.k[i]).toBe(50);
    }
  });

  it('CONST_HL yields all nulls (singular: HH == LL)', () => {
    for (const K of [0, 1, 5, 10, 100]) {
      const bars = constHL(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
      for (let i = 0; i < 30; i += 1) {
        expect(out.k[i]).toBe(null);
        expect(out.d[i]).toBe(null);
      }
    }
  });

  it('%K is bounded in [0, 100] for any finite input', () => {
    const bars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 40; i += 1) {
      const mid = 100 + Math.sin(i / 3) * 5;
      bars.push({ high: mid + 2, low: mid - 2, close: mid + (i % 5) - 2 });
    }
    const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
    for (let i = 13; i < 40; i += 1) {
      const v = out.k[i];
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('output length matches input length', () => {
    const bars = closeAtHigh(40).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
    expect(out.k.length).toBe(40);
    expect(out.d.length).toBe(40);
  });

  it('does not mutate input', () => {
    const bars = closeAtHigh(40).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineStochSignal(bars, { kPeriod: 14, dPeriod: 3 });
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });
});

describe('classifyLineStochSignalZone', () => {
  it('classifies overbought above threshold', () => {
    expect(classifyLineStochSignalZone(85, 80, 20)).toBe('overbought');
    expect(classifyLineStochSignalZone(80, 80, 20)).toBe('overbought');
  });

  it('classifies oversold below threshold', () => {
    expect(classifyLineStochSignalZone(15, 80, 20)).toBe('oversold');
    expect(classifyLineStochSignalZone(20, 80, 20)).toBe('oversold');
  });

  it('classifies neutral between bands', () => {
    expect(classifyLineStochSignalZone(50, 80, 20)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineStochSignalZone(null, 80, 20)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineStochSignalZone(Number.NaN, 80, 20)).toBe('none');
  });
});

describe('runLineStochSignal', () => {
  it('marks ok=false for fewer than kPeriod + dPeriod - 1 points', () => {
    const run = runLineStochSignal(closeAtHigh(15), {
      kPeriod: 14,
      dPeriod: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineStochSignal(closeAtHigh(20), {
      kPeriod: 14,
      dPeriod: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineStochSignal(closeAtHigh(30));
    expect(run.kPeriod).toBe(DEFAULT_CHART_LINE_STOCH_SIGNAL_K_PERIOD);
    expect(run.dPeriod).toBe(DEFAULT_CHART_LINE_STOCH_SIGNAL_D_PERIOD);
  });

  it('respects explicit options', () => {
    const run = runLineStochSignal(closeAtHigh(30), {
      kPeriod: 5,
      dPeriod: 3,
      overboughtThreshold: 70,
      oversoldThreshold: 30,
    });
    expect(run.kPeriod).toBe(5);
    expect(run.dPeriod).toBe(3);
    expect(run.overboughtThreshold).toBe(70);
    expect(run.oversoldThreshold).toBe(30);
  });

  it('sorts by x', () => {
    const data: ChartLineStochSignalPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineStochSignal(data, { kPeriod: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('close-at-high classifies all post-warmup as overbought', () => {
    const run = runLineStochSignal(closeAtHigh(30));
    // %K = 100 >= 80 -> overbought; warmup of 13 bars are none.
    expect(run.overboughtCount).toBe(30 - 13);
    expect(run.noneCount).toBe(13);
  });

  it('close-at-low classifies all post-warmup as oversold', () => {
    const run = runLineStochSignal(closeAtLow(30));
    expect(run.oversoldCount).toBe(30 - 13);
    expect(run.noneCount).toBe(13);
  });

  it('close-at-midpoint classifies all post-warmup as neutral', () => {
    const run = runLineStochSignal(closeAtMid(30, 2));
    expect(run.neutralCount).toBe(30 - 13);
  });

  it('CONST_HL classifies all bars as none', () => {
    const run = runLineStochSignal(constHL(30, 5));
    expect(run.noneCount).toBe(30);
  });

  it('exposes kFinal as the last finite %K', () => {
    const run = runLineStochSignal(closeAtHigh(30));
    expect(run.kFinal).toBe(100);
  });

  it('exposes dFinal as the last finite %D', () => {
    const run = runLineStochSignal(closeAtHigh(30));
    expect(run.dFinal).toBe(100);
  });

  it('kFinal is null when there is no data', () => {
    const run = runLineStochSignal([]);
    expect(run.kFinal).toBe(null);
  });
});

describe('computeLineStochSignalLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineStochSignalLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineStochSignalLayout({
      data: closeAtHigh(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineStochSignalLayout({
      data: closeAtHigh(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above stoch', () => {
    const layout = computeLineStochSignalLayout({
      data: closeAtHigh(30),
    });
    expect(layout.priceBottom).toBeLessThan(layout.stochTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineStochSignalLayout({
      data: closeAtHigh(30),
      panelGap: 24,
    });
    expect(layout.stochTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineStochSignalLayout({
      data: closeAtHigh(30),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces K and D paths', () => {
    const layout = computeLineStochSignalLayout({
      data: closeAtHigh(30),
    });
    expect(layout.kPath.length).toBeGreaterThan(0);
    expect(layout.dPath.length).toBeGreaterThan(0);
  });

  it('overbought / oversold band lines are inside the stoch panel', () => {
    const layout = computeLineStochSignalLayout({
      data: closeAtHigh(30),
    });
    expect(layout.overboughtY).toBeGreaterThanOrEqual(layout.stochTop);
    expect(layout.overboughtY).toBeLessThanOrEqual(layout.stochBottom);
    expect(layout.oversoldY).toBeGreaterThanOrEqual(layout.stochTop);
    expect(layout.oversoldY).toBeLessThanOrEqual(layout.stochBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineStochSignalLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineStochSignalChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineStochSignalChart([])).toBe('No data');
  });

  it('mentions Stochastic Oscillator', () => {
    const desc = describeLineStochSignalChart(closeAtHigh(30));
    expect(desc).toContain('Stochastic Oscillator');
  });

  it('mentions %K and %D', () => {
    const desc = describeLineStochSignalChart(closeAtHigh(30));
    expect(desc).toContain('%K');
    expect(desc).toContain('%D');
  });

  it('reports the periods', () => {
    const desc = describeLineStochSignalChart(closeAtHigh(30), {
      kPeriod: 5,
      dPeriod: 3,
    });
    expect(desc).toContain('kPeriod 5');
    expect(desc).toContain('dPeriod 3');
  });

  it('reports the final readings', () => {
    const desc = describeLineStochSignalChart(closeAtHigh(30));
    expect(desc).toContain('100.0000');
  });
});

describe('<ChartLineStochSignal />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineStochSignal data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-stoch-signal-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Stochastic Oscillator',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStochSignal data={closeAtHigh(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-k-period and data-d-period', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        kPeriod={5}
        dPeriod={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-signal"]',
    );
    expect(root?.getAttribute('data-k-period')).toBe('5');
    expect(root?.getAttribute('data-d-period')).toBe('3');
  });

  it('exposes data-k-final and data-d-final', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-signal"]',
    );
    expect(root?.getAttribute('data-k-final')).toBe('100');
    expect(root?.getAttribute('data-d-final')).toBe('100');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-signal"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-signal-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Stochastic Oscillator');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="k"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="d"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="k"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'k', hidden: true });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        hiddenSeries={['k']}
      />,
    );
    const button = container.querySelector('[data-series-id="k"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides %K line when controlled hidden', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        hiddenSeries={['k']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-line"]',
      ),
    ).toBe(null);
  });

  it('hides %D line when controlled hidden', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        hiddenSeries={['d']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-d"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stoch-signal-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stoch-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stoch-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-stoch-signal-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-stoch-signal-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-legend"]',
      ),
    ).toBe(null);
  });

  it('hides bands when showBands is false', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-bands"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatStoch', () => {
    const fmt = (v: number) => `[S:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        formatStoch={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[S:\d+\]/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-signal"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-signal"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-stoch-signal-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the %K line by default', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the %D line by default', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-d"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        defaultHiddenSeries={['k']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stoch-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineStochSignal data={closeAtHigh(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stoch-signal-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineStochSignal
        data={closeAtHigh(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stoch-signal-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-signal-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Stochastic Signal integration', () => {
  it('close-at-high yields %K = 100 across many (range, kPeriod) combos', () => {
    for (const range of [1, 2, 5, 10, 100]) {
      for (const kP of [5, 7, 14, 21]) {
        const bars = closeAtHigh(kP + 10, range).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const out = computeLineStochSignal(bars, { kPeriod: kP, dPeriod: 3 });
        for (let i = kP - 1; i < bars.length; i += 1) {
          expect(out.k[i]).toBe(100);
        }
      }
    }
  });

  it('close-at-low yields %K = 0 across many (range, kPeriod) combos', () => {
    for (const range of [1, 2, 5, 10, 100]) {
      for (const kP of [5, 7, 14, 21]) {
        const bars = closeAtLow(kP + 10, range).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const out = computeLineStochSignal(bars, { kPeriod: kP, dPeriod: 3 });
        for (let i = kP - 1; i < bars.length; i += 1) {
          expect(out.k[i]).toBe(0);
        }
      }
    }
  });

  it('close-at-midpoint yields %K = 50 across many (range, kPeriod) combos', () => {
    for (const range of [2, 4, 8, 16]) {
      for (const kP of [5, 7, 14, 21]) {
        const bars = closeAtMid(kP + 10, range).map((p) => ({
          high: p.high,
          low: p.low,
          close: p.close,
        }));
        const out = computeLineStochSignal(bars, { kPeriod: kP, dPeriod: 3 });
        for (let i = kP - 1; i < bars.length; i += 1) {
          expect(out.k[i]).toBe(50);
        }
      }
    }
  });
});
