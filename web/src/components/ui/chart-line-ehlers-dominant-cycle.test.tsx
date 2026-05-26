import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineEhlersDominantCycle,
  applyLineEhlersDominantCycleHilbert,
  classifyLineEhlersDominantCycleZone,
  computeLineEhlersDominantCycle,
  computeLineEhlersDominantCycleLayout,
  describeLineEhlersDominantCycleChart,
  getLineEhlersDominantCycleFinitePoints,
  normalizeLineEhlersDominantCyclePeriod,
  runLineEhlersDominantCycle,
  DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MAX_PERIOD,
  DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MIN_PERIOD,
} from './chart-line-ehlers-dominant-cycle';
import type {
  ChartLineEhlersDominantCyclePoint,
} from './chart-line-ehlers-dominant-cycle';

const constFlat = (length: number, K: number): ChartLineEhlersDominantCyclePoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: K }));

const sinusoid = (length: number, period: number, amplitude = 10, baseline = 100): ChartLineEhlersDominantCyclePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: baseline + amplitude * Math.sin((2 * Math.PI * i) / period),
  }));

const rising = (length: number, start = 100, step = 1): ChartLineEhlersDominantCyclePoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: start + i * step }));

describe('getLineEhlersDominantCycleFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineEhlersDominantCycleFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineEhlersDominantCycleFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineEhlersDominantCycleFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineEhlersDominantCycleFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineEhlersDominantCycleFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineEhlersDominantCycleFinitePoints([
      null as unknown as ChartLineEhlersDominantCyclePoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineEhlersDominantCyclePeriod', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineEhlersDominantCyclePeriod(undefined, 6)).toBe(6);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineEhlersDominantCyclePeriod(Number.NaN, 6)).toBe(6);
  });

  it('floors fractional periods', () => {
    expect(normalizeLineEhlersDominantCyclePeriod(7.9, 6)).toBe(7);
  });

  it('rejects period below 2', () => {
    expect(normalizeLineEhlersDominantCyclePeriod(1, 6)).toBe(6);
  });

  it('accepts the minimum period of 2', () => {
    expect(normalizeLineEhlersDominantCyclePeriod(2, 6)).toBe(2);
  });
});

describe('applyLineEhlersDominantCycleHilbert', () => {
  it('returns an empty array for empty input', () => {
    expect(applyLineEhlersDominantCycleHilbert([])).toEqual([]);
  });

  it('warmup bars (i < 6) are null', () => {
    const out = applyLineEhlersDominantCycleHilbert([1, 2, 3, 4, 5, 6, 7]);
    for (let i = 0; i < 6; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[6]).toBe('number');
  });

  it('CONST_FLAT yields ~0 at every bar past warmup (within numerical tolerance)', () => {
    // 0.0962*K + 0.5769*K - 0.5769*K - 0.0962*K = 0 algebraically;
    // in IEEE 754 the result is within a few ULPs of zero. K=0
    // is bit-exact; other K values round to ~0 with tiny residual.
    for (const K of [0, 1, 5, 7, 10, 100, -3]) {
      const values = Array(20).fill(K);
      const out = applyLineEhlersDominantCycleHilbert(values);
      for (let i = 6; i < 20; i += 1) {
        const v = out[i];
        expect(v).not.toBe(null);
        if (v !== null) expect(v).toBeCloseTo(0, 12);
      }
    }
  });

  it('CONST_FLAT at K=0 yields exactly 0 bit-exact', () => {
    const values = Array(20).fill(0);
    const out = applyLineEhlersDominantCycleHilbert(values);
    for (let i = 6; i < 20; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('null in window nulls the output', () => {
    const values: Array<number | null> = [1, 2, 3, 4, 5, 6, 7];
    values[2] = null;
    const out = applyLineEhlersDominantCycleHilbert(values);
    expect(out[6]).toBe(null);
  });
});

describe('computeLineEhlersDominantCycle', () => {
  it('returns an empty array for null', () => {
    expect(computeLineEhlersDominantCycle(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineEhlersDominantCycle([])).toEqual([]);
  });

  it('nulls warmup bars (i < 10)', () => {
    const closes = rising(20).map((p) => p.close);
    const out = computeLineEhlersDominantCycle(closes);
    for (let i = 0; i < 10; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('CONST_FLAT yields period = maxPeriod bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 7, 10, 100]) {
      const closes = constFlat(30, K).map((p) => p.close);
      const out = computeLineEhlersDominantCycle(closes, {
        minPeriod: 6,
        maxPeriod: 50,
      });
      for (let i = 10; i < 30; i += 1) {
        expect(out[i]).toBe(50);
      }
    }
  });

  it('CONST_FLAT yields period = custom maxPeriod', () => {
    const closes = constFlat(30, 7).map((p) => p.close);
    const out = computeLineEhlersDominantCycle(closes, {
      minPeriod: 4,
      maxPeriod: 25,
    });
    for (let i = 10; i < 30; i += 1) {
      expect(out[i]).toBe(25);
    }
  });

  it('rising trend (no oscillation) clamps to maxPeriod for most bars', () => {
    const closes = rising(40, 100, 1).map((p) => p.close);
    const out = computeLineEhlersDominantCycle(closes, {
      minPeriod: 6,
      maxPeriod: 50,
    });
    let atMax = 0;
    for (let i = 10; i < 40; i += 1) {
      if (out[i] === 50) atMax += 1;
    }
    expect(atMax).toBeGreaterThan(0);
  });

  it('sinusoid produces a finite, in-band period (within tolerance)', () => {
    // For a clean sinusoid of period P, the dominant cycle
    // should converge to approximately P after the FIR warmup.
    const closes = sinusoid(80, 20).map((p) => p.close);
    const out = computeLineEhlersDominantCycle(closes, {
      minPeriod: 6,
      maxPeriod: 50,
    });
    let foundFinite = false;
    for (let i = 30; i < 80; i += 1) {
      const v = out[i];
      if (typeof v === 'number' && v > 6 && v < 50) {
        foundFinite = true;
        break;
      }
    }
    expect(foundFinite).toBe(true);
  });

  it('output length matches input length', () => {
    const closes = rising(40).map((p) => p.close);
    const out = computeLineEhlersDominantCycle(closes);
    expect(out.length).toBe(40);
  });

  it('does not mutate input', () => {
    const closes = rising(20).map((p) => p.close);
    const snap = closes.slice();
    computeLineEhlersDominantCycle(closes);
    expect(closes).toEqual(snap);
  });

  it('non-finite minPeriod uses default', () => {
    const closes = constFlat(30, 5).map((p) => p.close);
    const out = computeLineEhlersDominantCycle(closes, {
      maxPeriod: 50,
    });
    expect(out[20]).toBe(50);
  });

  it('maxPeriod is enforced (>= minPeriod + 1)', () => {
    // When user supplies maxPeriod <= minPeriod, the implementation
    // bumps maxPeriod to minPeriod + 1.
    const closes = constFlat(30, 5).map((p) => p.close);
    const out = computeLineEhlersDominantCycle(closes, {
      minPeriod: 10,
      maxPeriod: 5, // invalid; should be bumped to 11
    });
    expect(out[20]).toBe(11);
  });

  it('period stays within [minPeriod, maxPeriod] for any input', () => {
    const closes = sinusoid(60, 15).map((p) => p.close);
    const out = computeLineEhlersDominantCycle(closes, {
      minPeriod: 6,
      maxPeriod: 50,
    });
    for (let i = 10; i < 60; i += 1) {
      const v = out[i];
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(6);
        expect(v).toBeLessThanOrEqual(50);
      }
    }
  });
});

describe('classifyLineEhlersDominantCycleZone', () => {
  it('classifies short below short band', () => {
    expect(classifyLineEhlersDominantCycleZone(8, 12, 30)).toBe('short');
  });

  it('classifies long above long band', () => {
    expect(classifyLineEhlersDominantCycleZone(40, 12, 30)).toBe('long');
  });

  it('classifies mid between bands', () => {
    expect(classifyLineEhlersDominantCycleZone(20, 12, 30)).toBe('mid');
  });

  it('classifies mid at the short band', () => {
    expect(classifyLineEhlersDominantCycleZone(12, 12, 30)).toBe('mid');
  });

  it('classifies mid at the long band', () => {
    expect(classifyLineEhlersDominantCycleZone(30, 12, 30)).toBe('mid');
  });

  it('returns none for null', () => {
    expect(classifyLineEhlersDominantCycleZone(null, 12, 30)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineEhlersDominantCycleZone(Number.NaN, 12, 30)).toBe(
      'none',
    );
  });
});

describe('runLineEhlersDominantCycle', () => {
  it('marks ok=false for fewer than warmup+1 points', () => {
    const run = runLineEhlersDominantCycle(rising(10));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineEhlersDominantCycle(rising(20));
    expect(run.ok).toBe(true);
  });

  it('uses the default min/max periods when none provided', () => {
    const run = runLineEhlersDominantCycle(rising(20));
    expect(run.minPeriod).toBe(
      DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MIN_PERIOD,
    );
    expect(run.maxPeriod).toBe(
      DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MAX_PERIOD,
    );
  });

  it('respects explicit options', () => {
    const run = runLineEhlersDominantCycle(rising(20), {
      minPeriod: 8,
      maxPeriod: 40,
      shortBand: 15,
      longBand: 25,
    });
    expect(run.minPeriod).toBe(8);
    expect(run.maxPeriod).toBe(40);
    expect(run.shortBand).toBe(15);
    expect(run.longBand).toBe(25);
  });

  it('sorts by x', () => {
    const data: ChartLineEhlersDominantCyclePoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineEhlersDominantCycle(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies all post-warmup as long', () => {
    // maxPeriod = 50 > longBand = 30 -> long
    const run = runLineEhlersDominantCycle(constFlat(30, 5));
    expect(run.longCount).toBe(30 - 10);
    expect(run.midCount).toBe(0);
    expect(run.shortCount).toBe(0);
    expect(run.noneCount).toBe(10);
  });

  it('exposes periodFinal as the last finite reading', () => {
    const run = runLineEhlersDominantCycle(constFlat(30, 5));
    expect(run.periodFinal).toBe(50);
  });

  it('periodFinal is null when there is no data', () => {
    const run = runLineEhlersDominantCycle([]);
    expect(run.periodFinal).toBe(null);
  });
});

describe('computeLineEhlersDominantCycleLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineEhlersDominantCycleLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: constFlat(30, 5),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: constFlat(30, 5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above period', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: constFlat(30, 5),
    });
    expect(layout.priceBottom).toBeLessThan(layout.periodTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: constFlat(30, 5),
      panelGap: 24,
    });
    expect(layout.periodTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: constFlat(30, 5),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a period path and markers (skipping warmup)', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: constFlat(30, 5),
    });
    expect(layout.markers.length).toBe(30 - 10);
  });

  it('period panel spans [minPeriod, maxPeriod]', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: constFlat(30, 5),
    });
    expect(layout.periodMin).toBe(6);
    expect(layout.periodMax).toBe(50);
  });

  it('short band line is inside the period panel', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: constFlat(30, 5),
    });
    expect(layout.shortBandY).toBeGreaterThanOrEqual(layout.periodTop);
    expect(layout.shortBandY).toBeLessThanOrEqual(layout.periodBottom);
  });

  it('long band line is inside the period panel', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: constFlat(30, 5),
    });
    expect(layout.longBandY).toBeGreaterThanOrEqual(layout.periodTop);
    expect(layout.longBandY).toBeLessThanOrEqual(layout.periodBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineEhlersDominantCycleLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineEhlersDominantCycleChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineEhlersDominantCycleChart([])).toBe('No data');
  });

  it('mentions Ehlers Dominant Cycle', () => {
    const desc = describeLineEhlersDominantCycleChart(constFlat(30, 5));
    expect(desc).toContain('Ehlers Dominant Cycle');
  });

  it('mentions Hilbert transform', () => {
    const desc = describeLineEhlersDominantCycleChart(constFlat(30, 5));
    expect(desc).toContain('Hilbert transform');
  });

  it('reports the period range', () => {
    const desc = describeLineEhlersDominantCycleChart(constFlat(30, 5));
    expect(desc).toContain('range [6, 50]');
  });

  it('reports short / mid / long counts', () => {
    const desc = describeLineEhlersDominantCycleChart(constFlat(30, 5));
    expect(desc).toMatch(/long on 20/);
  });

  it('reports the final reading', () => {
    const desc = describeLineEhlersDominantCycleChart(constFlat(30, 5));
    expect(desc).toContain('50.0000');
  });
});

describe('<ChartLineEhlersDominantCycle />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineEhlersDominantCycle data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Ehlers Dominant Cycle',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineEhlersDominantCycle data={constFlat(30, 5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-min-period and data-max-period', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        minPeriod={8}
        maxPeriod={40}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle"]',
    );
    expect(root?.getAttribute('data-min-period')).toBe('8');
    expect(root?.getAttribute('data-max-period')).toBe('40');
  });

  it('exposes data-period-final', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle"]',
    );
    expect(root?.getAttribute('data-period-final')).toBe('50');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ehlers Dominant Cycle');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="period"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
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
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        hiddenSeries={['period']}
      />,
    );
    const button = container.querySelector('[data-series-id="period"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides period line when controlled hidden', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        hiddenSeries={['period']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ehlers-dominant-cycle-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-ehlers-dominant-cycle-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-ehlers-dominant-cycle-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-legend"]',
      ),
    ).toBe(null);
  });

  it('hides bands when showBands is false', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-bands"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatPeriod', () => {
    const fmt = (v: number) => `[P:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        formatPeriod={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[P:\d+\]/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the period line by default', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        defaultHiddenSeries={['period']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle data={constFlat(30, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineEhlersDominantCycle
        data={constFlat(30, 5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ehlers-dominant-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-dominant-cycle-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Ehlers Dominant Cycle integration', () => {
  it('CONST_FLAT yields period = maxPeriod across many (K, max) combos', () => {
    for (const K of [0, 1, 5, 10, 100, -3]) {
      for (const maxP of [25, 40, 50, 100]) {
        const closes = constFlat(30, K).map((p) => p.close);
        const out = computeLineEhlersDominantCycle(closes, {
          minPeriod: 6,
          maxPeriod: maxP,
        });
        for (let i = 10; i < 30; i += 1) {
          expect(out[i]).toBe(maxP);
        }
      }
    }
  });
});
