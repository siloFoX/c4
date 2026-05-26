import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineChaikinMf,
  classifyLineChaikinMfZone,
  computeLineChaikinMf,
  computeLineChaikinMfLayout,
  computeLineChaikinMfMultiplier,
  describeLineChaikinMfChart,
  getLineChaikinMfFinitePoints,
  normalizeLineChaikinMfLength,
  runLineChaikinMf,
  DEFAULT_CHART_LINE_CHAIKIN_MF_LENGTH,
} from './chart-line-chaikin-mf';
import type {
  ChartLineChaikinMfPoint,
} from './chart-line-chaikin-mf';

const closeAtHigh = (length: number, base = 10, range = 2, volume = 100): ChartLineChaikinMfPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: base + i + range / 2,
    low: base + i - range / 2,
    close: base + i + range / 2,
    volume,
  }));

const closeAtLow = (length: number, base = 10, range = 2, volume = 100): ChartLineChaikinMfPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: base + i + range / 2,
    low: base + i - range / 2,
    close: base + i - range / 2,
    volume,
  }));

const closeAtMid = (length: number, base = 10, range = 2, volume = 100): ChartLineChaikinMfPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: base + i + range / 2,
    low: base + i - range / 2,
    close: base + i,
    volume,
  }));

const flatHL = (length: number, K = 10, volume = 100): ChartLineChaikinMfPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
    volume,
  }));

const zeroVolume = (length: number): ChartLineChaikinMfPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: 11,
    low: 9,
    close: 10,
    volume: 0,
  }));

describe('getLineChaikinMfFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineChaikinMfFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineChaikinMfFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineChaikinMfFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineChaikinMfFinitePoints([
      { x: 1, high: 11, low: 9, close: 10, volume: 100 },
      { x: Number.NaN, high: 11, low: 9, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite volume', () => {
    const result = getLineChaikinMfFinitePoints([
      { x: 0, high: 11, low: 9, close: 10, volume: Number.NaN },
      { x: 1, high: 11, low: 9, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineChaikinMfFinitePoints([
      null as unknown as ChartLineChaikinMfPoint,
      { x: 1, high: 11, low: 9, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineChaikinMfLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineChaikinMfLength(undefined, 20)).toBe(20);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineChaikinMfLength(Number.NaN, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineChaikinMfLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineChaikinMfLength(1, 20)).toBe(20);
  });

  it('accepts the minimum length of 2', () => {
    expect(normalizeLineChaikinMfLength(2, 20)).toBe(2);
  });
});

describe('computeLineChaikinMfMultiplier', () => {
  it('close at high yields MFM = 1 bit-exact', () => {
    expect(computeLineChaikinMfMultiplier(10, 5, 10)).toBe(1);
  });

  it('close at low yields MFM = -1 bit-exact', () => {
    expect(computeLineChaikinMfMultiplier(10, 5, 5)).toBe(-1);
  });

  it('close at midpoint yields MFM = 0 bit-exact', () => {
    expect(computeLineChaikinMfMultiplier(10, 6, 8)).toBe(0);
  });

  it('high == low yields MFM = 0 (singular treated as zero)', () => {
    expect(computeLineChaikinMfMultiplier(5, 5, 5)).toBe(0);
  });

  it('worked dyadic anchor: h=10 l=2 c=8 yields MFM = 0.5', () => {
    // ((8-2) - (10-8))/(10-2) = (6-2)/8 = 0.5
    expect(computeLineChaikinMfMultiplier(10, 2, 8)).toBe(0.5);
  });

  it('worked dyadic anchor: h=10 l=2 c=4 yields MFM = -0.5', () => {
    // ((4-2) - (10-4))/(10-2) = (2-6)/8 = -0.5
    expect(computeLineChaikinMfMultiplier(10, 2, 4)).toBe(-0.5);
  });
});

describe('computeLineChaikinMf', () => {
  it('returns an empty array for null', () => {
    expect(computeLineChaikinMf(null, 5)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineChaikinMf([], 5)).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const bars = closeAtHigh(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineChaikinMf(bars, 5);
    for (let i = 0; i < 4; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[4]).toBe('number');
  });

  it('close-at-high with constant volume yields CMF = 1 bit-exact', () => {
    const bars = closeAtHigh(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineChaikinMf(bars, 20);
    for (let i = 19; i < 30; i += 1) {
      expect(out[i]).toBe(1);
    }
  });

  it('close-at-low with constant volume yields CMF = -1 bit-exact', () => {
    const bars = closeAtLow(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineChaikinMf(bars, 20);
    for (let i = 19; i < 30; i += 1) {
      expect(out[i]).toBe(-1);
    }
  });

  it('close-at-midpoint yields CMF = 0 bit-exact', () => {
    const bars = closeAtMid(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineChaikinMf(bars, 20);
    for (let i = 19; i < 30; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('FLAT_HL (high == low) with positive volume yields CMF = 0 bit-exact', () => {
    const bars = flatHL(30, 7, 100).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineChaikinMf(bars, 20);
    for (let i = 19; i < 30; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('ZERO_VOLUME yields null (singular denominator)', () => {
    const bars = zeroVolume(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineChaikinMf(bars, 20);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('CMF stays bounded in [-1, 1] for mixed data', () => {
    const bars: Array<{ high: number; low: number; close: number; volume: number }> = [];
    for (let i = 0; i < 30; i += 1) {
      bars.push({
        high: 10,
        low: 2,
        close: 2 + (i % 9), // close varies across the range
        volume: 50 + (i % 5) * 10,
      });
    }
    const out = computeLineChaikinMf(bars, 20);
    for (let i = 19; i < 30; i += 1) {
      const v = out[i];
      expect(v).not.toBe(null);
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('mixed: half close-at-high half close-at-low yields CMF = 0 bit-exact at midpoint of window', () => {
    // 10 bars close-at-high, 10 bars close-at-low, with equal volumes.
    const bars: Array<{ high: number; low: number; close: number; volume: number }> = [];
    for (let i = 0; i < 10; i += 1) {
      bars.push({ high: 10, low: 2, close: 10, volume: 100 });
    }
    for (let i = 0; i < 10; i += 1) {
      bars.push({ high: 10, low: 2, close: 2, volume: 100 });
    }
    const out = computeLineChaikinMf(bars, 20);
    // The last bar's window contains all 20 bars: 10 with MFM=1 and 10 with MFM=-1
    // numer = 10*100 + 10*(-100) = 0
    // denom = 20*100 = 2000
    // CMF = 0 bit-exact
    expect(out[19]).toBe(0);
  });

  it('output length matches input length', () => {
    const bars = closeAtHigh(40).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineChaikinMf(bars, 20);
    expect(out.length).toBe(40);
  });

  it('does not mutate input', () => {
    const bars = closeAtHigh(40).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineChaikinMf(bars, 20);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = closeAtHigh(40).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineChaikinMf(bars, Number.NaN);
    expect(out[39]).toBe(1);
  });

  it('shorter lookback still yields CMF = 1 bit-exact for close-at-high', () => {
    const bars = closeAtHigh(20).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
    const out = computeLineChaikinMf(bars, 5);
    for (let i = 4; i < 20; i += 1) {
      expect(out[i]).toBe(1);
    }
  });
});

describe('classifyLineChaikinMfZone', () => {
  it('classifies positive', () => {
    expect(classifyLineChaikinMfZone(0.5)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineChaikinMfZone(-0.5)).toBe('negative');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineChaikinMfZone(0)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineChaikinMfZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineChaikinMfZone(Number.NaN)).toBe('none');
  });
});

describe('runLineChaikinMf', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineChaikinMf(closeAtHigh(10), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineChaikinMf(closeAtHigh(30), { length: 20 });
    expect(run.ok).toBe(true);
  });

  it('uses the default length when none is provided', () => {
    const run = runLineChaikinMf(closeAtHigh(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_CHAIKIN_MF_LENGTH);
  });

  it('respects an explicit length', () => {
    const run = runLineChaikinMf(closeAtHigh(30), { length: 5 });
    expect(run.length).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineChaikinMfPoint[] = [
      { x: 2, high: 11, low: 9, close: 10, volume: 100 },
      { x: 0, high: 11, low: 9, close: 10, volume: 100 },
      { x: 1, high: 11, low: 9, close: 10, volume: 100 },
    ];
    const run = runLineChaikinMf(data, { length: 3 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('close-at-high classifies all post-warmup as positive', () => {
    const run = runLineChaikinMf(closeAtHigh(30), { length: 20 });
    expect(run.positiveCount).toBe(30 - 19);
    expect(run.negativeCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('close-at-low classifies all post-warmup as negative', () => {
    const run = runLineChaikinMf(closeAtLow(30), { length: 20 });
    expect(run.negativeCount).toBe(30 - 19);
    expect(run.positiveCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('close-at-mid classifies all post-warmup as flat', () => {
    const run = runLineChaikinMf(closeAtMid(30), { length: 20 });
    expect(run.flatCount).toBe(30 - 19);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('exposes cmfFinal as the last finite reading', () => {
    const run = runLineChaikinMf(closeAtHigh(30), { length: 20 });
    expect(run.cmfFinal).toBe(1);
  });

  it('cmfFinal is null when there is no data', () => {
    const run = runLineChaikinMf([]);
    expect(run.cmfFinal).toBe(null);
  });
});

describe('computeLineChaikinMfLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineChaikinMfLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineChaikinMfLayout({
      data: closeAtHigh(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineChaikinMfLayout({
      data: closeAtHigh(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above CMF', () => {
    const layout = computeLineChaikinMfLayout({ data: closeAtHigh(30) });
    expect(layout.priceBottom).toBeLessThan(layout.cmfTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineChaikinMfLayout({
      data: closeAtHigh(30),
      panelGap: 24,
    });
    expect(layout.cmfTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineChaikinMfLayout({ data: closeAtHigh(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a CMF path and markers (skipping warmup)', () => {
    const layout = computeLineChaikinMfLayout({ data: closeAtHigh(30) });
    expect(layout.cmfPath.length).toBeGreaterThan(0);
    // 30 - 19 = 11 finite bars
    expect(layout.markers.length).toBe(11);
  });

  it('zero line is inside the CMF panel', () => {
    const layout = computeLineChaikinMfLayout({ data: closeAtHigh(30) });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.cmfTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.cmfBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineChaikinMfLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10, volume: 100 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineChaikinMfChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineChaikinMfChart([])).toBe('No data');
  });

  it('mentions Chaikin Money Flow', () => {
    const desc = describeLineChaikinMfChart(closeAtHigh(30));
    expect(desc).toContain('Chaikin Money Flow');
  });

  it('mentions money flow volume', () => {
    const desc = describeLineChaikinMfChart(closeAtHigh(30));
    expect(desc).toContain('money flow volume');
  });

  it('reports the length', () => {
    const desc = describeLineChaikinMfChart(closeAtHigh(30), { length: 14 });
    expect(desc).toContain('length 14');
  });

  it('reports positive / flat / negative counts', () => {
    const desc = describeLineChaikinMfChart(closeAtHigh(30), { length: 20 });
    expect(desc).toMatch(/positive on 11/);
    expect(desc).toMatch(/negative on 0/);
  });

  it('reports the final reading', () => {
    const desc = describeLineChaikinMfChart(closeAtHigh(30), { length: 20 });
    expect(desc).toContain('1.0000');
  });
});

describe('<ChartLineChaikinMf />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineChaikinMf data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-chaikin-mf-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Chaikin Money Flow');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineChaikinMf data={closeAtHigh(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} length={14} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-mf"]',
    );
    expect(root?.getAttribute('data-length')).toBe('14');
  });

  it('exposes data-cmf-final', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} length={20} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-mf"]',
    );
    expect(root?.getAttribute('data-cmf-final')).toBe('1');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-mf"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-chaikin-mf-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Chaikin Money Flow');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="cmf"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="cmf"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'cmf',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        hiddenSeries={['cmf']}
      />,
    );
    const button = container.querySelector('[data-series-id="cmf"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides CMF line when controlled hidden', () => {
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        hiddenSeries={['cmf']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-chaikin-mf-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-mf-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-mf-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-chaikin-mf-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-chaikin-mf-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-zero-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatCmf', () => {
    const fmt = (v: number) => `[CMF:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        formatCmf={fmt}
      />,
    );
    const text = container.textContent ?? '';
    // formatCmf is applied to cmfMin and cmfMax axis ticks. For
    // close-at-high data CMF stays at +1 -> min == max, expanded
    // to [0, 2]; tick labels show [CMF:0] and [CMF:2].
    expect(text).toMatch(/\[CMF:\d+\]/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-mf"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-chaikin-mf"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-chaikin-mf-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the CMF line by default', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        defaultHiddenSeries={['cmf']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-mf-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineChaikinMf data={closeAtHigh(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-mf-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineChaikinMf
        data={closeAtHigh(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-chaikin-mf-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-chaikin-mf-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Chaikin Money Flow integration', () => {
  it('CMF = 1 bit-exact across many (range, volume, lookback) combos for close-at-high', () => {
    for (const range of [1, 2, 5, 10, 100]) {
      for (const volume of [1, 50, 100, 1000]) {
        for (const L of [5, 14, 20, 30]) {
          const bars = closeAtHigh(L + 10, 100, range, volume).map((p) => ({
            high: p.high,
            low: p.low,
            close: p.close,
            volume: p.volume,
          }));
          const out = computeLineChaikinMf(bars, L);
          expect(out[bars.length - 1]).toBe(1);
        }
      }
    }
  });

  it('CMF = -1 bit-exact across many combos for close-at-low', () => {
    for (const range of [1, 2, 5, 10]) {
      for (const volume of [10, 100, 500]) {
        for (const L of [5, 14, 20]) {
          const bars = closeAtLow(L + 10, 100, range, volume).map((p) => ({
            high: p.high,
            low: p.low,
            close: p.close,
            volume: p.volume,
          }));
          const out = computeLineChaikinMf(bars, L);
          expect(out[bars.length - 1]).toBe(-1);
        }
      }
    }
  });

  it('CMF = 0 bit-exact for close-at-midpoint', () => {
    for (const range of [2, 4, 10]) {
      const bars = closeAtMid(30, 100, range, 100).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      }));
      const out = computeLineChaikinMf(bars, 20);
      expect(out[29]).toBe(0);
    }
  });
});
