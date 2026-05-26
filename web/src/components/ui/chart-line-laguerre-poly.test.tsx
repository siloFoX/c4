import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineLaguerrePoly,
  classifyLineLaguerrePolyZone,
  computeLineLaguerrePoly,
  computeLineLaguerrePolyLayout,
  describeLineLaguerrePolyChart,
  getLineLaguerrePolyFinitePoints,
  normalizeLineLaguerrePolyGamma,
  runLineLaguerrePoly,
  DEFAULT_CHART_LINE_LAGUERRE_POLY_GAMMA,
} from './chart-line-laguerre-poly';
import type {
  ChartLineLaguerrePolyPoint,
} from './chart-line-laguerre-poly';

const flat = (length: number, value: number): ChartLineLaguerrePolyPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: value }));

const rising = (length: number, start = 0, step = 1): ChartLineLaguerrePolyPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: start + i * step }));

const pivot = (length: number): ChartLineLaguerrePolyPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: i < length / 2 ? 100 - i : 80 + (i - Math.floor(length / 2)) * 2,
  }));

describe('getLineLaguerrePolyFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineLaguerrePolyFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineLaguerrePolyFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineLaguerrePolyFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineLaguerrePolyFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 20 },
      { x: 2, close: 30 },
    ]);
    expect(result.map((p) => p.x)).toEqual([1, 2]);
  });

  it('drops non-finite close', () => {
    const result = getLineLaguerrePolyFinitePoints([
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 5 },
    ]);
    expect(result.map((p) => p.x)).toEqual([2]);
  });

  it('drops null entries', () => {
    const result = getLineLaguerrePolyFinitePoints([
      null as unknown as ChartLineLaguerrePolyPoint,
      { x: 1, close: 2 },
    ]);
    expect(result).toEqual([{ x: 1, close: 2 }]);
  });
});

describe('normalizeLineLaguerrePolyGamma', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineLaguerrePolyGamma(undefined, 0.5)).toBe(0.5);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineLaguerrePolyGamma(Number.NaN, 0.5)).toBe(0.5);
  });

  it('clamps below 0', () => {
    expect(normalizeLineLaguerrePolyGamma(-0.5, 0.7)).toBe(0);
  });

  it('clamps above 1', () => {
    expect(normalizeLineLaguerrePolyGamma(1.5, 0.7)).toBe(1);
  });

  it('accepts in-range values', () => {
    expect(normalizeLineLaguerrePolyGamma(0.5, 0.7)).toBe(0.5);
    expect(normalizeLineLaguerrePolyGamma(0, 0.7)).toBe(0);
    expect(normalizeLineLaguerrePolyGamma(1, 0.7)).toBe(1);
  });
});

describe('computeLineLaguerrePoly', () => {
  it('returns an empty array for null', () => {
    expect(computeLineLaguerrePoly(null, 0.5)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineLaguerrePoly([], 0.5)).toEqual([]);
  });

  it('seeds with the first close (Laguerre = close[0])', () => {
    const out = computeLineLaguerrePoly([42, 99], 0.5);
    expect(out[0]).toBe(42);
  });

  it('gamma=0 with CONST_FLAT yields K bit-exact at every bar', () => {
    const K = 42;
    const closes = flat(20, K).map((p) => p.close);
    const out = computeLineLaguerrePoly(closes, 0);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(K);
    }
  });

  it('gamma=0 acts as a (1,2,2,1)/6 weighted average for i>=3', () => {
    // close = [10, 20, 30, 40, 50], gamma=0:
    // i=3: Lag = (40 + 2*30 + 2*20 + 10) / 6 = 150 / 6 = 25
    // i=4: Lag = (50 + 2*40 + 2*30 + 20) / 6 = 210 / 6 = 35
    const closes = [10, 20, 30, 40, 50];
    const out = computeLineLaguerrePoly(closes, 0);
    expect(out[3]).toBe(25);
    expect(out[4]).toBe(35);
  });

  it('gamma=0 acts as polynomial smoother on negative closes (recurrence check)', () => {
    // close = [-10, -20, -30, -40]: Lag[3] = (-40 + -60 + -40 + -10)/6 = -150/6 = -25
    const closes = [-10, -20, -30, -40];
    const out = computeLineLaguerrePoly(closes, 0);
    expect(out[3]).toBe(-25);
  });

  it('K=0 with any gamma yields 0 bit-exact at every bar', () => {
    const closes = flat(20, 0).map((p) => p.close);
    for (const g of [0.1, 0.5, 0.7, 0.8, 0.9, 0.99]) {
      const out = computeLineLaguerrePoly(closes, g);
      for (let i = 0; i < out.length; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('CONST_FLAT (K=K, gamma>0) stays at K within numerical tolerance', () => {
    const K = 7;
    const closes = flat(40, K).map((p) => p.close);
    const out = computeLineLaguerrePoly(closes, 0.8);
    for (let i = 0; i < out.length; i += 1) {
      const v = out[i];
      expect(v).not.toBe(null);
      if (v !== null) expect(v).toBeCloseTo(K, 9);
    }
  });

  it('seeds Laguerre = close[0] bit-exact at i=0', () => {
    const closes = [42];
    const out = computeLineLaguerrePoly(closes, 0.8);
    // (42 + 2*42 + 2*42 + 42) / 6 = 42
    expect(out[0]).toBeCloseTo(42, 12);
  });

  it('resets cascade on NaN', () => {
    const closes = [10, 10, 10, Number.NaN, 20, 20, 20, 20];
    const out = computeLineLaguerrePoly(closes, 0.5);
    expect(out[3]).toBe(null);
    expect(out[4]).toBeCloseTo(20, 9);
  });

  it('rejects non-finite gamma (uses default 0.8)', () => {
    const closes = flat(20, 5).map((p) => p.close);
    const out = computeLineLaguerrePoly(closes, Number.NaN);
    // Default gamma applied; constant input still settles to 5.
    const last = out[out.length - 1];
    expect(last).not.toBe(null);
    if (last !== null) expect(last).toBeCloseTo(5, 9);
  });

  it('clamps gamma below zero to zero (gives weighted average behaviour)', () => {
    const closes = [10, 20, 30, 40];
    const out = computeLineLaguerrePoly(closes, -0.5);
    // gamma is clamped to 0; same result as gamma=0.
    const expected = computeLineLaguerrePoly(closes, 0);
    expect(out).toEqual(expected);
  });

  it('clamps gamma above one to one', () => {
    const closes = [10, 20, 30, 40];
    const out = computeLineLaguerrePoly(closes, 1.5);
    // gamma=1: L0[i] = L0[i-1], so L0 stays at seed close[0]=10. Each
    // following stage stays at its own seed too. Laguerre = 10 forever.
    expect(out[0]).toBe(10);
    for (let i = 1; i < closes.length; i += 1) {
      const v = out[i];
      expect(v).not.toBe(null);
      if (v !== null) expect(v).toBeCloseTo(10, 9);
    }
  });

  it('output length matches input length', () => {
    const closes = rising(30).map((p) => p.close);
    const out = computeLineLaguerrePoly(closes, 0.8);
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = [1, 2, 3, 4, 5];
    const snap = closes.slice();
    computeLineLaguerrePoly(closes, 0.5);
    expect(closes).toEqual(snap);
  });

  it('translation invariance: shifting close by C shifts Laguerre by C', () => {
    const baseCloses = pivot(40).map((p) => p.close);
    const shiftedCloses = baseCloses.map((c) => c + 100);
    const base = computeLineLaguerrePoly(baseCloses, 0.7);
    const shifted = computeLineLaguerrePoly(shiftedCloses, 0.7);
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i];
      const s = shifted[i];
      if (b == null || s == null) {
        expect(b).toBe(s);
        continue;
      }
      expect(s - b).toBeCloseTo(100, 8);
    }
  });

  it('gamma=0 reproduces the (1,2,2,1)/6 weighted average for i>=3', () => {
    const closes = pivot(40).map((p) => p.close);
    const out = computeLineLaguerrePoly(closes, 0);
    for (let i = 3; i < closes.length; i += 1) {
      const expected =
        (closes[i]! + 2 * closes[i - 1]! + 2 * closes[i - 2]! + closes[i - 3]!) /
        6;
      expect(out[i]).toBeCloseTo(expected, 12);
    }
  });
});

describe('classifyLineLaguerrePolyZone', () => {
  it('classifies above', () => {
    expect(classifyLineLaguerrePolyZone(10, 5)).toBe('above');
  });

  it('classifies below', () => {
    expect(classifyLineLaguerrePolyZone(5, 10)).toBe('below');
  });

  it('classifies at', () => {
    expect(classifyLineLaguerrePolyZone(5, 5)).toBe('at');
  });

  it('returns none when close is null', () => {
    expect(classifyLineLaguerrePolyZone(null, 5)).toBe('none');
  });

  it('returns none when Laguerre is null', () => {
    expect(classifyLineLaguerrePolyZone(5, null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineLaguerrePolyZone(Number.NaN, 5)).toBe('none');
    expect(classifyLineLaguerrePolyZone(5, Number.NaN)).toBe('none');
  });
});

describe('runLineLaguerrePoly', () => {
  it('marks ok=false for fewer than 2 points', () => {
    const run = runLineLaguerrePoly([{ x: 0, close: 10 }]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true for at least 2 points', () => {
    const run = runLineLaguerrePoly(rising(20));
    expect(run.ok).toBe(true);
  });

  it('uses the default gamma when none is provided', () => {
    const run = runLineLaguerrePoly(rising(20));
    expect(run.gamma).toBe(DEFAULT_CHART_LINE_LAGUERRE_POLY_GAMMA);
  });

  it('respects an explicit gamma', () => {
    const run = runLineLaguerrePoly(rising(20), { gamma: 0.5 });
    expect(run.gamma).toBe(0.5);
  });

  it('sorts by x', () => {
    const data: ChartLineLaguerrePolyPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineLaguerrePoly(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('gamma=0 CONST_FLAT yields all "at" bars', () => {
    const run = runLineLaguerrePoly(flat(40, 50), { gamma: 0 });
    expect(run.atCount).toBe(40);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('CONST_FLAT classifies all bars as "at"', () => {
    const run = runLineLaguerrePoly(flat(40, 0), { gamma: 0.8 });
    expect(run.atCount).toBe(40);
  });

  it('exposes laguerreFinal as the last finite Laguerre', () => {
    const run = runLineLaguerrePoly(flat(20, 0), { gamma: 0.5 });
    expect(run.laguerreFinal).toBe(0);
  });

  it('rising trend keeps close above Laguerre (filter lags)', () => {
    const run = runLineLaguerrePoly(rising(40, 100, 1), { gamma: 0.8 });
    expect(run.aboveCount).toBeGreaterThan(run.belowCount);
  });

  it('counts sum to total bars', () => {
    const run = runLineLaguerrePoly(pivot(30), { gamma: 0.7 });
    expect(run.aboveCount + run.atCount + run.belowCount).toBe(
      run.series.length,
    );
  });

  it('laguerreFinal is null when there is no data', () => {
    const run = runLineLaguerrePoly([]);
    expect(run.laguerreFinal).toBe(null);
  });
});

describe('computeLineLaguerrePolyLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineLaguerrePolyLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineLaguerrePolyLayout({ data: rising(20) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineLaguerrePolyLayout({
      data: rising(20),
      width: 600,
      height: 300,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(300);
  });

  it('inner box respects padding', () => {
    const layout = computeLineLaguerrePolyLayout({
      data: rising(20),
      padding: 50,
      width: 600,
      height: 300,
    });
    expect(layout.innerLeft).toBe(50);
    expect(layout.innerRight).toBe(550);
    expect(layout.innerTop).toBe(50);
    expect(layout.innerBottom).toBe(250);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineLaguerrePolyLayout({ data: rising(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces a Laguerre path and markers', () => {
    const layout = computeLineLaguerrePolyLayout({ data: rising(20) });
    expect(layout.laguerrePath.length).toBeGreaterThan(0);
    expect(layout.markers.length).toBe(20);
  });

  it('valueMin and valueMax differ even for constant data', () => {
    const layout = computeLineLaguerrePolyLayout({ data: flat(20, 5) });
    expect(layout.valueMin).toBeLessThan(layout.valueMax);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineLaguerrePolyLayout({
      data: [{ x: 0, close: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineLaguerrePolyChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineLaguerrePolyChart([])).toBe('No data');
  });

  it('mentions Laguerre', () => {
    const desc = describeLineLaguerrePolyChart(rising(20));
    expect(desc).toContain('Laguerre');
  });

  it('mentions four-stage cascade', () => {
    const desc = describeLineLaguerrePolyChart(rising(20));
    expect(desc).toContain('four-stage cascaded');
  });

  it('reports the gamma', () => {
    const desc = describeLineLaguerrePolyChart(rising(20), { gamma: 0.7 });
    expect(desc).toContain('gamma 0.7');
  });

  it('reports above / below / at counts', () => {
    const desc = describeLineLaguerrePolyChart(flat(15, 5), { gamma: 0.8 });
    expect(desc).toMatch(/above the Laguerre line on 0/);
    expect(desc).toMatch(/below on 0/);
    expect(desc).toMatch(/at the Laguerre line on 15/);
  });

  it('reports the final reading', () => {
    const desc = describeLineLaguerrePolyChart(flat(15, 0), { gamma: 0.5 });
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineLaguerrePoly />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineLaguerrePoly data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-laguerre-poly-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineLaguerrePoly data={rising(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Laguerre');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineLaguerrePoly data={rising(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-gamma', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} gamma={0.5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-laguerre-poly"]',
    );
    expect(root?.getAttribute('data-gamma')).toBe('0.5');
  });

  it('exposes data-laguerre-final', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={flat(20, 0)} gamma={0.5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-laguerre-poly"]',
    );
    expect(root?.getAttribute('data-laguerre-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(25)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-laguerre-poly"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('exposes above / at / below counts for CONST_FLAT', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={flat(20, 50)} gamma={0.5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-laguerre-poly"]',
    );
    expect(root?.getAttribute('data-at-count')).toBe('20');
    expect(root?.getAttribute('data-above-count')).toBe('0');
    expect(root?.getAttribute('data-below-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-laguerre-poly-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Laguerre');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} />,
    );
    expect(
      container.querySelector('[data-series-id="price"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="laguerre"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineLaguerrePoly
        data={rising(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="laguerre"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'laguerre',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineLaguerrePoly
        data={rising(20)}
        hiddenSeries={['laguerre']}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="laguerre"]',
    );
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides Laguerre line when controlled hidden', () => {
    const { container } = render(
      <ChartLineLaguerrePoly
        data={rising(20)}
        hiddenSeries={['laguerre']}
      />,
    );
    const line = container.querySelector(
      '[data-section="chart-line-laguerre-poly-line"]',
    );
    expect(line).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineLaguerrePoly
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-laguerre-poly-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineLaguerrePoly
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-laguerre-poly-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineLaguerrePoly
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-laguerre-poly-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} showConfigBadge={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-laguerre-poly-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-laguerre-poly-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-legend"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatValue', () => {
    const fmt = (v: number) => `<${v.toFixed(1)}>`;
    const { container } = render(
      <ChartLineLaguerrePoly data={flat(20, 0)} formatValue={fmt} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('<1.0>');
    expect(text).toContain('<-1.0>');
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineLaguerrePoly
        data={rising(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-laguerre-poly"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-laguerre-poly"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-laguerre-poly-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the Laguerre line by default', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineLaguerrePoly
        data={rising(20)}
        defaultHiddenSeries={['laguerre']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-laguerre-poly-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-laguerre-poly-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineLaguerrePoly data={rising(20)} showTooltip={false} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-laguerre-poly-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-laguerre-poly-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Laguerre integration', () => {
  it('gamma=0 produces the (1,2,2,1)/6 polynomial average for i>=3', () => {
    const data = pivot(40).map((p) => p.close);
    const out = computeLineLaguerrePoly(data, 0);
    for (let i = 3; i < data.length; i += 1) {
      const expected =
        (data[i]! + 2 * data[i - 1]! + 2 * data[i - 2]! + data[i - 3]!) / 6;
      expect(out[i]).toBeCloseTo(expected, 12);
    }
  });

  it('polynomial weights sum to 6 (numerical identity check)', () => {
    // (1 + 2 + 2 + 1) / 6 = 1 exactly in IEEE 754.
    expect((1 + 2 + 2 + 1) / 6).toBe(1);
  });

  it('different gammas produce different Laguerre on non-flat data', () => {
    const data = pivot(40).map((p) => p.close);
    const a = computeLineLaguerrePoly(data, 0.4);
    const b = computeLineLaguerrePoly(data, 0.9);
    let differed = false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        differed = true;
        break;
      }
    }
    expect(differed).toBe(true);
  });

  it('gamma=1 effectively freezes Laguerre at the seed value', () => {
    const data = [10, 50, 80, 30, 60];
    const out = computeLineLaguerrePoly(data, 1);
    expect(out[0]).toBe(10);
    for (let i = 1; i < data.length; i += 1) {
      const v = out[i];
      expect(v).not.toBe(null);
      if (v !== null) expect(v).toBeCloseTo(10, 9);
    }
  });

  it('hand-computed step at gamma=0.5 on [0,1] matches recurrence', () => {
    // Seeds (i=0): L0=L1=L2=L3=0, Laguerre=0
    // i=1, close=1, gamma=0.5:
    //   L0 = 0.5*1 + 0.5*0 = 0.5
    //   L1 = -0.5*0.5 + 0 + 0.5*0 = -0.25
    //   L2 = -0.5*(-0.25) + 0 + 0.5*0 = 0.125
    //   L3 = -0.5*0.125 + 0 + 0.5*0 = -0.0625
    //   Lag = (0.5 + 2*(-0.25) + 2*0.125 + (-0.0625)) / 6
    //       = (0.5 - 0.5 + 0.25 - 0.0625) / 6 = 0.1875 / 6 = 0.03125
    const out = computeLineLaguerrePoly([0, 1], 0.5);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(0.03125, 12);
  });
});
