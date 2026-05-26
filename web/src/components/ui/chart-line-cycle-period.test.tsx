import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCyclePeriod,
  applyLineCyclePeriodSma,
  classifyLineCyclePeriodZone,
  computeLineCyclePeriod,
  computeLineCyclePeriodLayout,
  countLineCyclePeriodZeroCrossings,
  describeLineCyclePeriodChart,
  getLineCyclePeriodFinitePoints,
  normalizeLineCyclePeriodLength,
  runLineCyclePeriod,
  DEFAULT_CHART_LINE_CYCLE_PERIOD_LOOKBACK,
  DEFAULT_CHART_LINE_CYCLE_PERIOD_MAX_PERIOD,
  DEFAULT_CHART_LINE_CYCLE_PERIOD_MIN_PERIOD,
} from './chart-line-cycle-period';
import type {
  ChartLineCyclePeriodPoint,
} from './chart-line-cycle-period';

const constFlat = (length: number, K: number): ChartLineCyclePeriodPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: K }));

const sinusoid = (length: number, period: number, amplitude = 10, baseline = 100): ChartLineCyclePeriodPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: baseline + amplitude * Math.sin((2 * Math.PI * i) / period),
  }));

const rising = (length: number, start = 100, step = 1): ChartLineCyclePeriodPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: start + i * step }));

describe('getLineCyclePeriodFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineCyclePeriodFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineCyclePeriodFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineCyclePeriodFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineCyclePeriodFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineCyclePeriodFinitePoints([
      null as unknown as ChartLineCyclePeriodPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineCyclePeriodLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineCyclePeriodLength(undefined, 30)).toBe(30);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineCyclePeriodLength(Number.NaN, 30)).toBe(30);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineCyclePeriodLength(7.9, 30)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineCyclePeriodLength(1, 30)).toBe(30);
  });

  it('accepts the minimum length of 2', () => {
    expect(normalizeLineCyclePeriodLength(2, 30)).toBe(2);
  });
});

describe('countLineCyclePeriodZeroCrossings', () => {
  it('returns 0 for an empty array', () => {
    expect(countLineCyclePeriodZeroCrossings([])).toBe(0);
  });

  it('returns 0 for a single value', () => {
    expect(countLineCyclePeriodZeroCrossings([5])).toBe(0);
  });

  it('returns 0 for all positive values', () => {
    expect(countLineCyclePeriodZeroCrossings([1, 2, 3, 4, 5])).toBe(0);
  });

  it('returns 0 for all negative values', () => {
    expect(countLineCyclePeriodZeroCrossings([-1, -2, -3, -4, -5])).toBe(0);
  });

  it('returns 0 for all zeros', () => {
    expect(countLineCyclePeriodZeroCrossings([0, 0, 0, 0, 0])).toBe(0);
  });

  it('counts a single positive-to-negative crossing', () => {
    expect(countLineCyclePeriodZeroCrossings([1, -1])).toBe(1);
  });

  it('counts a single negative-to-positive crossing', () => {
    expect(countLineCyclePeriodZeroCrossings([-1, 1])).toBe(1);
  });

  it('counts multiple alternating crossings', () => {
    expect(countLineCyclePeriodZeroCrossings([1, -1, 1, -1, 1])).toBe(4);
  });

  it('does not count crossings through zero (only strict sign changes)', () => {
    // sequence: 1, 0, -1
    // 1 -> 0: a > 0 and b !< 0 (b == 0) so not counted
    // 0 -> -1: a !> 0 and b < 0 but a !> 0 so not counted
    expect(countLineCyclePeriodZeroCrossings([1, 0, -1])).toBe(0);
  });

  it('skips non-finite values', () => {
    const out = countLineCyclePeriodZeroCrossings([1, Number.NaN, -1]);
    expect(out).toBe(0);
  });
});

describe('applyLineCyclePeriodSma', () => {
  it('returns an empty array for empty input', () => {
    expect(applyLineCyclePeriodSma([], 3)).toEqual([]);
  });

  it('warmup bars (i < length - 1) are null', () => {
    const out = applyLineCyclePeriodSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });

  it('SMA of constant K stays at K bit-exact', () => {
    for (const K of [0, 1, 2, 5, 10, 100]) {
      const out = applyLineCyclePeriodSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('computeLineCyclePeriod', () => {
  it('returns an empty array for null', () => {
    expect(computeLineCyclePeriod(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineCyclePeriod([])).toEqual([]);
  });

  it('nulls warmup bars (i < lookback + smoothLength - 1)', () => {
    const closes = rising(60).map((p) => p.close);
    const out = computeLineCyclePeriod(closes, {
      lookback: 30,
      smoothLength: 4,
    });
    for (let i = 0; i < 32; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('CONST_FLAT yields period = maxPeriod bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 10, 100, -3]) {
      const closes = constFlat(60, K).map((p) => p.close);
      const out = computeLineCyclePeriod(closes, {
        lookback: 30,
        smoothLength: 4,
        minPeriod: 2,
        maxPeriod: 50,
      });
      for (let i = 33; i < 60; i += 1) {
        expect(out[i]).toBe(50);
      }
    }
  });

  it('CONST_FLAT yields period = custom maxPeriod', () => {
    const closes = constFlat(60, 7).map((p) => p.close);
    const out = computeLineCyclePeriod(closes, {
      lookback: 30,
      smoothLength: 4,
      minPeriod: 2,
      maxPeriod: 25,
    });
    for (let i = 33; i < 60; i += 1) {
      expect(out[i]).toBe(25);
    }
  });

  it('rising trend (no oscillation): detrended drifts but eventually no crossings -> maxPeriod', () => {
    const closes = rising(80, 100, 1).map((p) => p.close);
    const out = computeLineCyclePeriod(closes, {
      lookback: 30,
      smoothLength: 4,
      minPeriod: 2,
      maxPeriod: 50,
    });
    // For a linear rising trend, detrended = close - SMA(close, 4) -> a constant lag.
    // The detrended series is constant (positive), so no crossings -> maxPeriod.
    for (let i = 40; i < 80; i += 1) {
      expect(out[i]).toBe(50);
    }
  });

  it('sinusoid of period 20: estimated period is close to 20', () => {
    const closes = sinusoid(120, 20).map((p) => p.close);
    const out = computeLineCyclePeriod(closes, {
      lookback: 60,
      smoothLength: 4,
      minPeriod: 4,
      maxPeriod: 50,
    });
    // After warmup, the period should be near 20 (within 30%).
    let inBand = 0;
    for (let i = 80; i < 120; i += 1) {
      const v = out[i];
      if (typeof v === 'number' && v > 14 && v < 30) inBand += 1;
    }
    expect(inBand).toBeGreaterThan(0);
  });

  it('period stays within [minPeriod, maxPeriod]', () => {
    const closes = sinusoid(120, 10).map((p) => p.close);
    const out = computeLineCyclePeriod(closes, {
      lookback: 30,
      smoothLength: 4,
      minPeriod: 4,
      maxPeriod: 50,
    });
    for (let i = 35; i < 120; i += 1) {
      const v = out[i];
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(4);
        expect(v).toBeLessThanOrEqual(50);
      }
    }
  });

  it('maxPeriod is enforced (>= minPeriod + 1)', () => {
    const closes = constFlat(60, 5).map((p) => p.close);
    const out = computeLineCyclePeriod(closes, {
      lookback: 30,
      smoothLength: 4,
      minPeriod: 10,
      maxPeriod: 5, // invalid; should be bumped to 11
    });
    expect(out[40]).toBe(11);
  });

  it('output length matches input length', () => {
    const closes = rising(60).map((p) => p.close);
    const out = computeLineCyclePeriod(closes);
    expect(out.length).toBe(60);
  });

  it('does not mutate input', () => {
    const closes = rising(40).map((p) => p.close);
    const snap = closes.slice();
    computeLineCyclePeriod(closes);
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineCyclePeriodZone', () => {
  it('classifies short below short band', () => {
    expect(classifyLineCyclePeriodZone(5, 10, 25)).toBe('short');
  });

  it('classifies long above long band', () => {
    expect(classifyLineCyclePeriodZone(30, 10, 25)).toBe('long');
  });

  it('classifies mid between bands', () => {
    expect(classifyLineCyclePeriodZone(15, 10, 25)).toBe('mid');
  });

  it('classifies mid at bands', () => {
    expect(classifyLineCyclePeriodZone(10, 10, 25)).toBe('mid');
    expect(classifyLineCyclePeriodZone(25, 10, 25)).toBe('mid');
  });

  it('returns none for null', () => {
    expect(classifyLineCyclePeriodZone(null, 10, 25)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineCyclePeriodZone(Number.NaN, 10, 25)).toBe('none');
  });
});

describe('runLineCyclePeriod', () => {
  it('marks ok=false for fewer than lookback + smoothLength points', () => {
    const run = runLineCyclePeriod(rising(20));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineCyclePeriod(rising(60));
    expect(run.ok).toBe(true);
  });

  it('uses the default lookback/min/max when none is provided', () => {
    const run = runLineCyclePeriod(rising(60));
    expect(run.lookback).toBe(DEFAULT_CHART_LINE_CYCLE_PERIOD_LOOKBACK);
    expect(run.minPeriod).toBe(DEFAULT_CHART_LINE_CYCLE_PERIOD_MIN_PERIOD);
    expect(run.maxPeriod).toBe(DEFAULT_CHART_LINE_CYCLE_PERIOD_MAX_PERIOD);
  });

  it('respects explicit options', () => {
    const run = runLineCyclePeriod(rising(80), {
      lookback: 40,
      smoothLength: 6,
      minPeriod: 4,
      maxPeriod: 30,
      shortBand: 8,
      longBand: 20,
    });
    expect(run.lookback).toBe(40);
    expect(run.smoothLength).toBe(6);
    expect(run.minPeriod).toBe(4);
    expect(run.maxPeriod).toBe(30);
    expect(run.shortBand).toBe(8);
    expect(run.longBand).toBe(20);
  });

  it('sorts by x', () => {
    const data: ChartLineCyclePeriodPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineCyclePeriod(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies all post-warmup as long', () => {
    // maxPeriod = 50 > longBand = 25 -> long
    const run = runLineCyclePeriod(constFlat(60, 5));
    expect(run.longCount).toBe(60 - 33);
    expect(run.shortCount).toBe(0);
    expect(run.midCount).toBe(0);
  });

  it('exposes periodFinal as the last finite reading', () => {
    const run = runLineCyclePeriod(constFlat(60, 5));
    expect(run.periodFinal).toBe(50);
  });

  it('periodFinal is null when there is no data', () => {
    const run = runLineCyclePeriod([]);
    expect(run.periodFinal).toBe(null);
  });
});

describe('computeLineCyclePeriodLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineCyclePeriodLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineCyclePeriodLayout({
      data: constFlat(60, 5),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineCyclePeriodLayout({
      data: constFlat(60, 5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above period', () => {
    const layout = computeLineCyclePeriodLayout({
      data: constFlat(60, 5),
    });
    expect(layout.priceBottom).toBeLessThan(layout.periodTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineCyclePeriodLayout({
      data: constFlat(60, 5),
      panelGap: 24,
    });
    expect(layout.periodTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineCyclePeriodLayout({
      data: constFlat(60, 5),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(60);
  });

  it('produces a period path and markers (skipping warmup)', () => {
    const layout = computeLineCyclePeriodLayout({
      data: constFlat(60, 5),
    });
    expect(layout.markers.length).toBe(60 - 33);
  });

  it('period panel spans [minPeriod, maxPeriod]', () => {
    const layout = computeLineCyclePeriodLayout({
      data: constFlat(60, 5),
    });
    expect(layout.periodMin).toBe(2);
    expect(layout.periodMax).toBe(50);
  });

  it('short / long band lines are inside the period panel', () => {
    const layout = computeLineCyclePeriodLayout({
      data: constFlat(60, 5),
    });
    expect(layout.shortBandY).toBeGreaterThanOrEqual(layout.periodTop);
    expect(layout.shortBandY).toBeLessThanOrEqual(layout.periodBottom);
    expect(layout.longBandY).toBeGreaterThanOrEqual(layout.periodTop);
    expect(layout.longBandY).toBeLessThanOrEqual(layout.periodBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineCyclePeriodLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCyclePeriodChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineCyclePeriodChart([])).toBe('No data');
  });

  it('mentions Cycle Period', () => {
    const desc = describeLineCyclePeriodChart(constFlat(60, 5));
    expect(desc).toContain('Cycle Period');
  });

  it('mentions zero crossings', () => {
    const desc = describeLineCyclePeriodChart(constFlat(60, 5));
    expect(desc).toContain('zero crossings');
  });

  it('reports the lookback', () => {
    const desc = describeLineCyclePeriodChart(constFlat(60, 5), {
      lookback: 40,
    });
    expect(desc).toContain('lookback 40');
  });

  it('reports the final reading', () => {
    const desc = describeLineCyclePeriodChart(constFlat(60, 5));
    expect(desc).toContain('50.0000');
  });
});

describe('<ChartLineCyclePeriod />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineCyclePeriod data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-cycle-period-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Cycle Period');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCyclePeriod data={constFlat(60, 5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-lookback', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(80, 5)} lookback={40} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-period"]',
    );
    expect(root?.getAttribute('data-lookback')).toBe('40');
  });

  it('exposes data-period-final', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-period"]',
    );
    expect(root?.getAttribute('data-period-final')).toBe('50');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-period"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('60');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-cycle-period-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Cycle Period');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="period"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="period"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'period',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        hiddenSeries={['period']}
      />,
    );
    const button = container.querySelector('[data-series-id="period"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides period line when controlled hidden', () => {
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        hiddenSeries={['period']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-cycle-period-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-period-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-period-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cycle-period-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-cycle-period-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-legend"]',
      ),
    ).toBe(null);
  });

  it('hides bands when showBands is false', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-bands"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatPeriod', () => {
    const fmt = (v: number) => `[P:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        formatPeriod={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[P:\d+\]/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-period"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cycle-period"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-cycle-period-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the period line by default', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        defaultHiddenSeries={['period']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-period-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineCyclePeriod data={constFlat(60, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-period-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineCyclePeriod
        data={constFlat(60, 5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-cycle-period-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-cycle-period-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Cycle Period integration', () => {
  it('CONST_FLAT yields period = maxPeriod across many (K, lookback, maxP) combos', () => {
    for (const K of [0, 1, 5, 10, 100, -3]) {
      for (const lb of [20, 30, 40]) {
        for (const maxP of [25, 50, 100]) {
          const closes = constFlat(lb + 20, K).map((p) => p.close);
          const out = computeLineCyclePeriod(closes, {
            lookback: lb,
            smoothLength: 4,
            minPeriod: 2,
            maxPeriod: maxP,
          });
          expect(out[closes.length - 1]).toBe(maxP);
        }
      }
    }
  });
});
