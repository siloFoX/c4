import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineKcPercentK,
  applyLineKcPercentKEma,
  applyLineKcPercentKSma,
  classifyLineKcPercentKZone,
  computeLineKcPercentK,
  computeLineKcPercentKLayout,
  describeLineKcPercentKChart,
  getLineKcPercentKFinitePoints,
  normalizeLineKcPercentKLength,
  normalizeLineKcPercentKMultiplier,
  runLineKcPercentK,
  DEFAULT_CHART_LINE_KC_PERCENT_K_LENGTH,
  DEFAULT_CHART_LINE_KC_PERCENT_K_MULTIPLIER,
} from './chart-line-kc-percent-k';
import type {
  ChartLineKcPercentKPoint,
} from './chart-line-kc-percent-k';

const constMidBar = (length: number, mid = 10, r = 1): ChartLineKcPercentKPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: mid + r,
    low: mid - r,
    close: mid,
  }));

const constFlat = (length: number, K: number): ChartLineKcPercentKPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const closeAtHigh = (length: number, mid = 10, r = 1): ChartLineKcPercentKPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: mid + r,
    low: mid - r,
    close: mid + r,
  }));

const closeAtLow = (length: number, mid = 10, r = 1): ChartLineKcPercentKPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: mid + r,
    low: mid - r,
    close: mid - r,
  }));

describe('getLineKcPercentKFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineKcPercentKFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineKcPercentKFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineKcPercentKFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high / low / close', () => {
    const result = getLineKcPercentKFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: Number.NaN, close: 10 },
      { x: 2, high: 11, low: 9, close: Number.NaN },
      { x: 3, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineKcPercentKFinitePoints([
      null as unknown as ChartLineKcPercentKPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineKcPercentKLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineKcPercentKLength(undefined, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineKcPercentKLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineKcPercentKLength(1, 20)).toBe(20);
  });
});

describe('normalizeLineKcPercentKMultiplier', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineKcPercentKMultiplier(undefined, 2)).toBe(2);
  });

  it('rejects zero', () => {
    expect(normalizeLineKcPercentKMultiplier(0, 2)).toBe(2);
  });

  it('rejects negative', () => {
    expect(normalizeLineKcPercentKMultiplier(-1, 2)).toBe(2);
  });

  it('accepts fractional values', () => {
    expect(normalizeLineKcPercentKMultiplier(1.5, 2)).toBe(1.5);
  });
});

describe('applyLineKcPercentKEma', () => {
  it('EMA of constant K stays at K bit-exact (dyadic-friendly)', () => {
    const out = applyLineKcPercentKEma([2, 2, 2, 2, 2], 9);
    for (const v of out) expect(v).toBe(2);
  });

  it('null breaks chain and next finite re-seeds', () => {
    const out = applyLineKcPercentKEma([1, 2, null, 5, 6], 9);
    expect(out[0]).toBe(1);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(5);
  });
});

describe('applyLineKcPercentKSma', () => {
  it('SMA of constant K stays at K bit-exact', () => {
    for (const K of [0, 1, 5, 10, 100]) {
      const out = applyLineKcPercentKSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('computeLineKcPercentK', () => {
  it('returns an empty array for null', () => {
    expect(computeLineKcPercentK(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineKcPercentK([])).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const bars = constMidBar(30, 10, 1).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineKcPercentK(bars, { length: 20, multiplier: 2 });
    for (let i = 0; i < 19; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[19]).toBe('number');
  });

  it('CONST_MID (close at midpoint of constant H/L range) yields %K = 0.5 bit-exact', () => {
    for (const r of [1, 2, 4, 8]) {
      const bars = constMidBar(30, 100, r).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineKcPercentK(bars, { length: 20, multiplier: 2 });
      for (let i = 19; i < 30; i += 1) {
        expect(out[i]).toBe(0.5);
      }
    }
  });

  it('CONST_FLAT (high = low = close) yields all nulls (ATR = 0)', () => {
    for (const K of [0, 1, 5, 100]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineKcPercentK(bars, { length: 20, multiplier: 2 });
      for (let i = 0; i < 30; i += 1) {
        expect(out[i]).toBe(null);
      }
    }
  });

  it('close at high (constant) yields a steady %K (close stays at middle)', () => {
    // close = mid + r constant -> middle = mid + r, ATR = 2r,
    // upper = mid + r + 4r = mid + 5r, lower = mid + r - 4r = mid - 3r
    // %K = (mid + r - (mid - 3r))/((mid + 5r) - (mid - 3r)) = 4r/8r = 0.5
    const bars = closeAtHigh(30, 10, 2).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineKcPercentK(bars, { length: 20, multiplier: 2 });
    for (let i = 19; i < 30; i += 1) {
      expect(out[i]).toBe(0.5);
    }
  });

  it('close at low (constant) yields a steady %K too', () => {
    const bars = closeAtLow(30, 10, 2).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineKcPercentK(bars, { length: 20, multiplier: 2 });
    for (let i = 19; i < 30; i += 1) {
      expect(out[i]).toBe(0.5);
    }
  });

  it('different multipliers still produce %K = 0.5 for constant-mid data', () => {
    for (const mult of [1, 1.5, 2, 3]) {
      const bars = constMidBar(30, 10, 1).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineKcPercentK(bars, { length: 20, multiplier: mult });
      for (let i = 19; i < 30; i += 1) {
        expect(out[i]).toBe(0.5);
      }
    }
  });

  it('output length matches input length', () => {
    const bars = constMidBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineKcPercentK(bars, { length: 20, multiplier: 2 });
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars = constMidBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineKcPercentK(bars, { length: 20, multiplier: 2 });
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite length (uses default)', () => {
    const bars = constMidBar(30).map((p) => ({
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    const out = computeLineKcPercentK(bars, {
      length: Number.NaN,
      multiplier: 2,
    });
    // Default length = 20; CONST_MID yields 0.5
    expect(out[20]).toBe(0.5);
  });

  it('translation invariance: shifting H/L/close by C does not change %K', () => {
    const baseBars: Array<{ high: number; low: number; close: number }> = [];
    for (let i = 0; i < 30; i += 1) {
      const mid = 100 + Math.sin(i / 3) * 5;
      baseBars.push({ high: mid + 2, low: mid - 2, close: mid });
    }
    const shifted = baseBars.map((b) => ({
      high: b.high + 1000,
      low: b.low + 1000,
      close: b.close + 1000,
    }));
    const base = computeLineKcPercentK(baseBars, {
      length: 14,
      multiplier: 2,
    });
    const sh = computeLineKcPercentK(shifted, {
      length: 14,
      multiplier: 2,
    });
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

describe('classifyLineKcPercentKZone', () => {
  it('classifies above-upper at >= 1', () => {
    expect(classifyLineKcPercentKZone(1)).toBe('above-upper');
    expect(classifyLineKcPercentKZone(1.5)).toBe('above-upper');
  });

  it('classifies above-mid between 0.5 and 1', () => {
    expect(classifyLineKcPercentKZone(0.75)).toBe('above-mid');
  });

  it('classifies below-mid between 0 and 0.5', () => {
    expect(classifyLineKcPercentKZone(0.25)).toBe('below-mid');
  });

  it('classifies below-lower at <= 0', () => {
    expect(classifyLineKcPercentKZone(0)).toBe('below-lower');
    expect(classifyLineKcPercentKZone(-0.5)).toBe('below-lower');
  });

  it('returns none for null', () => {
    expect(classifyLineKcPercentKZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineKcPercentKZone(Number.NaN)).toBe('none');
  });
});

describe('runLineKcPercentK', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineKcPercentK(constMidBar(10), { length: 20 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineKcPercentK(constMidBar(25), { length: 20 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineKcPercentK(constMidBar(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_KC_PERCENT_K_LENGTH);
    expect(run.multiplier).toBe(
      DEFAULT_CHART_LINE_KC_PERCENT_K_MULTIPLIER,
    );
  });

  it('respects explicit options', () => {
    const run = runLineKcPercentK(constMidBar(30), {
      length: 14,
      multiplier: 1.5,
    });
    expect(run.length).toBe(14);
    expect(run.multiplier).toBe(1.5);
  });

  it('sorts by x', () => {
    const data: ChartLineKcPercentKPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineKcPercentK(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_MID classifies all post-warmup as above-mid (%K > 0.5? actually = 0.5 -> below-mid)', () => {
    // %K = 0.5 falls in below-mid (> 0, not > 0.5).
    const run = runLineKcPercentK(constMidBar(30));
    expect(run.belowMidCount).toBe(30 - 19);
    expect(run.aboveMidCount).toBe(0);
  });

  it('CONST_FLAT classifies all as none (singular)', () => {
    const run = runLineKcPercentK(constFlat(30, 5));
    expect(run.noneCount).toBe(30);
  });

  it('exposes percentKFinal as the last finite reading', () => {
    const run = runLineKcPercentK(constMidBar(30));
    expect(run.percentKFinal).toBe(0.5);
  });

  it('percentKFinal is null when there is no data', () => {
    const run = runLineKcPercentK([]);
    expect(run.percentKFinal).toBe(null);
  });
});

describe('computeLineKcPercentKLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineKcPercentKLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineKcPercentKLayout({
      data: constMidBar(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineKcPercentKLayout({
      data: constMidBar(30),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above %K', () => {
    const layout = computeLineKcPercentKLayout({ data: constMidBar(30) });
    expect(layout.priceBottom).toBeLessThan(layout.pkTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineKcPercentKLayout({
      data: constMidBar(30),
      panelGap: 24,
    });
    expect(layout.pkTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineKcPercentKLayout({ data: constMidBar(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a %K path and markers (skipping warmup)', () => {
    const layout = computeLineKcPercentKLayout({ data: constMidBar(30) });
    expect(layout.markers.length).toBe(30 - 19);
  });

  it('upper / mid / lower band lines are inside the %K panel', () => {
    const layout = computeLineKcPercentKLayout({ data: constMidBar(30) });
    expect(layout.upperBandY).toBeGreaterThanOrEqual(layout.pkTop);
    expect(layout.upperBandY).toBeLessThanOrEqual(layout.pkBottom);
    expect(layout.midBandY).toBeGreaterThanOrEqual(layout.pkTop);
    expect(layout.midBandY).toBeLessThanOrEqual(layout.pkBottom);
    expect(layout.lowerBandY).toBeGreaterThanOrEqual(layout.pkTop);
    expect(layout.lowerBandY).toBeLessThanOrEqual(layout.pkBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineKcPercentKLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineKcPercentKChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineKcPercentKChart([])).toBe('No data');
  });

  it('mentions Keltner Channel %K', () => {
    const desc = describeLineKcPercentKChart(constMidBar(30));
    expect(desc).toContain('Keltner Channel %K');
  });

  it('mentions the formula', () => {
    const desc = describeLineKcPercentKChart(constMidBar(30));
    expect(desc).toContain('lowerChannel');
    expect(desc).toContain('upperChannel');
  });

  it('reports the length and multiplier', () => {
    const desc = describeLineKcPercentKChart(constMidBar(30), {
      length: 14,
      multiplier: 1.5,
    });
    expect(desc).toContain('length 14');
    expect(desc).toContain('multiplier 1.5');
  });

  it('reports the final reading', () => {
    const desc = describeLineKcPercentKChart(constMidBar(30));
    expect(desc).toContain('0.5000');
  });
});

describe('<ChartLineKcPercentK />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineKcPercentK data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-kc-percent-k-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Keltner Channel %K');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKcPercentK data={constMidBar(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-multiplier', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        length={14}
        multiplier={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-percent-k"]',
    );
    expect(root?.getAttribute('data-length')).toBe('14');
    expect(root?.getAttribute('data-multiplier')).toBe('1.5');
  });

  it('exposes data-percent-k-final', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-percent-k"]',
    );
    expect(root?.getAttribute('data-percent-k-final')).toBe('0.5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-percent-k"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-kc-percent-k-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Keltner Channel %K');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="percentK"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="percentK"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'percentK',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        hiddenSeries={['percentK']}
      />,
    );
    const button = container.querySelector('[data-series-id="percentK"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides %K line when controlled hidden', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        hiddenSeries={['percentK']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-kc-percent-k-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-percent-k-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-percent-k-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-kc-percent-k-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-kc-percent-k-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-legend"]',
      ),
    ).toBe(null);
  });

  it('hides bands when showBands is false', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-bands"]',
      ),
    ).toBe(null);
  });

  it('hides mid line when showMidLine is false', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        showMidLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-mid-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatPercentK', () => {
    const fmt = (v: number) => `[K:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        formatPercentK={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[K:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-percent-k"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kc-percent-k"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-kc-percent-k-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the %K line by default', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        defaultHiddenSeries={['percentK']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-percent-k-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineKcPercentK data={constMidBar(30)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-percent-k-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineKcPercentK
        data={constMidBar(30)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-kc-percent-k-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-kc-percent-k-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Keltner %K integration', () => {
  it('CONST_MID yields %K = 0.5 across (r, length, multiplier) combos', () => {
    for (const r of [1, 2, 4, 8]) {
      for (const L of [5, 10, 14, 20]) {
        for (const mult of [1, 1.5, 2, 3]) {
          const bars = constMidBar(L + 10, 100, r).map((p) => ({
            high: p.high,
            low: p.low,
            close: p.close,
          }));
          const out = computeLineKcPercentK(bars, {
            length: L,
            multiplier: mult,
          });
          for (let i = L - 1; i < bars.length; i += 1) {
            expect(out[i]).toBe(0.5);
          }
        }
      }
    }
  });

  it('CONST_FLAT yields all-null %K across many K values', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(30, K).map((p) => ({
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const out = computeLineKcPercentK(bars, { length: 20, multiplier: 2 });
      for (let i = 0; i < 30; i += 1) {
        expect(out[i]).toBe(null);
      }
    }
  });
});
