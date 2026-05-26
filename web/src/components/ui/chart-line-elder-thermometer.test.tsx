import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineElderThermometer,
  classifyLineElderThermometerZone,
  computeLineElderThermometer,
  computeLineElderThermometerLayout,
  describeLineElderThermometerChart,
  getLineElderThermometerFinitePoints,
  normalizeLineElderThermometerThreshold,
  runLineElderThermometer,
  DEFAULT_CHART_LINE_ELDER_THERMOMETER_HOT_THRESHOLD,
} from './chart-line-elder-thermometer';
import type {
  ChartLineElderThermometerPoint,
} from './chart-line-elder-thermometer';

const constHL = (length: number, mid = 10, range = 2): ChartLineElderThermometerPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: mid + range / 2,
    low: mid - range / 2,
    close: mid,
  }));

const risingByS = (length: number, step = 1, h0 = 10, l0 = 8): ChartLineElderThermometerPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: h0 + i * step,
    low: l0 + i * step,
    close: (h0 + l0) / 2 + i * step,
  }));

const fallingByS = (length: number, step = 1, h0 = 30, l0 = 28): ChartLineElderThermometerPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: h0 - i * step,
    low: l0 - i * step,
    close: (h0 + l0) / 2 - i * step,
  }));

describe('getLineElderThermometerFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineElderThermometerFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineElderThermometerFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineElderThermometerFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineElderThermometerFinitePoints([
      { x: 1, high: 11, low: 9, close: 10 },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high', () => {
    const result = getLineElderThermometerFinitePoints([
      { x: 0, high: Number.NaN, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineElderThermometerFinitePoints([
      null as unknown as ChartLineElderThermometerPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineElderThermometerThreshold', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineElderThermometerThreshold(undefined, 2)).toBe(2);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineElderThermometerThreshold(Number.NaN, 2)).toBe(2);
  });

  it('rejects negative thresholds', () => {
    expect(normalizeLineElderThermometerThreshold(-1, 2)).toBe(2);
  });

  it('accepts zero', () => {
    expect(normalizeLineElderThermometerThreshold(0, 2)).toBe(0);
  });

  it('accepts positive values', () => {
    expect(normalizeLineElderThermometerThreshold(5, 2)).toBe(5);
    expect(normalizeLineElderThermometerThreshold(0.5, 2)).toBe(0.5);
  });
});

describe('computeLineElderThermometer', () => {
  it('returns an empty array for null', () => {
    expect(computeLineElderThermometer(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineElderThermometer([])).toEqual([]);
  });

  it('seed bar (i=0) is null', () => {
    const bars = [{ high: 11, low: 9 }];
    expect(computeLineElderThermometer(bars)[0]).toBe(null);
  });

  it('CONST_HL yields thermo = 0 bit-exact at every bar past seed', () => {
    const bars = constHL(20, 10, 2).map((p) => ({ high: p.high, low: p.low }));
    const out = computeLineElderThermometer(bars);
    expect(out[0]).toBe(null);
    for (let i = 1; i < 20; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('rising-by-S yields thermo = S bit-exact at every bar past seed', () => {
    for (const S of [1, 2, 5, 10, 100]) {
      const bars = risingByS(20, S).map((p) => ({
        high: p.high,
        low: p.low,
      }));
      const out = computeLineElderThermometer(bars);
      expect(out[0]).toBe(null);
      for (let i = 1; i < 20; i += 1) {
        expect(out[i]).toBe(S);
      }
    }
  });

  it('falling-by-S yields thermo = S bit-exact (absolute gap)', () => {
    for (const S of [1, 2, 5, 10]) {
      const bars = fallingByS(20, S).map((p) => ({
        high: p.high,
        low: p.low,
      }));
      const out = computeLineElderThermometer(bars);
      expect(out[0]).toBe(null);
      for (let i = 1; i < 20; i += 1) {
        expect(out[i]).toBe(S);
      }
    }
  });

  it('asymmetric gap: thermo = max(|dH|, |dL|) bit-exact', () => {
    // Bar 0: h=10, l=8 (no thermo)
    // Bar 1: h=15, l=8.5 -> dH=5, dL=0.5 -> thermo=5
    // Bar 2: h=15.5, l=2 -> dH=0.5, dL=6.5 -> thermo=6.5
    const bars = [
      { high: 10, low: 8 },
      { high: 15, low: 8.5 },
      { high: 15.5, low: 2 },
    ];
    const out = computeLineElderThermometer(bars);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(5);
    expect(out[2]).toBe(6.5);
  });

  it('non-finite bar in middle yields null but preserves prior state', () => {
    const bars: Array<{ high: number; low: number }> = [
      { high: 10, low: 8 },
      { high: 12, low: 10 },
      { high: Number.NaN, low: 10 },
      { high: 15, low: 11 },
    ];
    const out = computeLineElderThermometer(bars);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(2); // |12-10|=2, |10-8|=2, max=2
    expect(out[2]).toBe(null);
    // After null, prior is still bar 1 (h=12, l=10).
    expect(out[3]).toBe(3); // |15-12|=3, |11-10|=1, max=3
  });

  it('output length matches input length', () => {
    const bars = risingByS(40, 1).map((p) => ({
      high: p.high,
      low: p.low,
    }));
    const out = computeLineElderThermometer(bars);
    expect(out.length).toBe(40);
  });

  it('does not mutate input', () => {
    const bars = risingByS(20, 1).map((p) => ({
      high: p.high,
      low: p.low,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineElderThermometer(bars);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('thermometer is non-negative for any finite input', () => {
    const bars = [
      { high: 10, low: 8 },
      { high: 5, low: 4 },
      { high: 20, low: 15 },
      { high: 8, low: 7 },
    ];
    const out = computeLineElderThermometer(bars);
    for (let i = 1; i < out.length; i += 1) {
      const v = out[i];
      if (v !== null) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('translation invariance: shifting H and L by C does not change thermo', () => {
    const baseBars = [
      { high: 10, low: 8 },
      { high: 15, low: 8.5 },
      { high: 15.5, low: 2 },
    ];
    const shiftedBars = baseBars.map((b) => ({
      high: b.high + 100,
      low: b.low + 100,
    }));
    const base = computeLineElderThermometer(baseBars);
    const sh = computeLineElderThermometer(shiftedBars);
    for (let i = 0; i < base.length; i += 1) {
      expect(sh[i]).toBe(base[i]);
    }
  });
});

describe('classifyLineElderThermometerZone', () => {
  it('classifies hot above threshold', () => {
    expect(classifyLineElderThermometerZone(5, 2)).toBe('hot');
  });

  it('classifies hot at the threshold', () => {
    expect(classifyLineElderThermometerZone(2, 2)).toBe('hot');
  });

  it('classifies cold below threshold', () => {
    expect(classifyLineElderThermometerZone(1, 2)).toBe('cold');
  });

  it('returns none for null', () => {
    expect(classifyLineElderThermometerZone(null, 2)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineElderThermometerZone(Number.NaN, 2)).toBe('none');
  });
});

describe('runLineElderThermometer', () => {
  it('marks ok=false for fewer than 2 points', () => {
    const run = runLineElderThermometer([
      { x: 0, high: 11, low: 9, close: 10 },
    ]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true for at least 2 points', () => {
    const run = runLineElderThermometer(risingByS(20, 1));
    expect(run.ok).toBe(true);
  });

  it('uses the default hot threshold when none is provided', () => {
    const run = runLineElderThermometer(risingByS(20, 1));
    expect(run.hotThreshold).toBe(
      DEFAULT_CHART_LINE_ELDER_THERMOMETER_HOT_THRESHOLD,
    );
  });

  it('respects an explicit hot threshold', () => {
    const run = runLineElderThermometer(risingByS(20, 1), {
      hotThreshold: 5,
    });
    expect(run.hotThreshold).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineElderThermometerPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineElderThermometer(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_HL with default threshold 2 classifies seed as none and others as cold', () => {
    const run = runLineElderThermometer(constHL(20, 10, 2));
    expect(run.noneCount).toBe(1); // seed
    expect(run.coldCount).toBe(19); // thermo = 0 < threshold 2
    expect(run.hotCount).toBe(0);
  });

  it('rising-by-S=5 with threshold 2 classifies as hot past seed', () => {
    const run = runLineElderThermometer(risingByS(20, 5), {
      hotThreshold: 2,
    });
    expect(run.hotCount).toBe(19);
    expect(run.coldCount).toBe(0);
    expect(run.noneCount).toBe(1);
  });

  it('exposes thermoFinal as the last finite reading', () => {
    const run = runLineElderThermometer(risingByS(20, 5));
    expect(run.thermoFinal).toBe(5);
  });

  it('thermoFinal is null when there is no data', () => {
    const run = runLineElderThermometer([]);
    expect(run.thermoFinal).toBe(null);
  });
});

describe('computeLineElderThermometerLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineElderThermometerLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineElderThermometerLayout({
      data: risingByS(20, 1),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineElderThermometerLayout({
      data: risingByS(20, 1),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above thermometer', () => {
    const layout = computeLineElderThermometerLayout({
      data: risingByS(20, 1),
    });
    expect(layout.priceBottom).toBeLessThan(layout.thermoTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineElderThermometerLayout({
      data: risingByS(20, 1),
      panelGap: 24,
    });
    expect(layout.thermoTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineElderThermometerLayout({
      data: risingByS(20, 1),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces a thermo path and markers (skipping seed)', () => {
    const layout = computeLineElderThermometerLayout({
      data: risingByS(20, 1),
    });
    // 20 - 1 = 19 finite markers
    expect(layout.markers.length).toBe(19);
  });

  it('thermo panel min = 0 (non-negative)', () => {
    const layout = computeLineElderThermometerLayout({
      data: risingByS(20, 1),
    });
    expect(layout.thermoMin).toBe(0);
  });

  it('threshold line is inside the thermometer panel', () => {
    const layout = computeLineElderThermometerLayout({
      data: risingByS(20, 5),
    });
    expect(layout.thresholdY).toBeGreaterThanOrEqual(layout.thermoTop);
    expect(layout.thresholdY).toBeLessThanOrEqual(layout.thermoBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineElderThermometerLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineElderThermometerChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineElderThermometerChart([])).toBe('No data');
  });

  it('mentions Elder Market Thermometer', () => {
    const desc = describeLineElderThermometerChart(risingByS(20, 1));
    expect(desc).toContain('Elder Market Thermometer');
  });

  it('mentions the max-of-gap formula', () => {
    const desc = describeLineElderThermometerChart(risingByS(20, 1));
    expect(desc).toContain('larger of the high-gap and low-gap');
  });

  it('reports the hot threshold', () => {
    const desc = describeLineElderThermometerChart(risingByS(20, 1), {
      hotThreshold: 5,
    });
    expect(desc).toContain('hot threshold 5');
  });

  it('reports the final reading', () => {
    const desc = describeLineElderThermometerChart(risingByS(20, 5));
    expect(desc).toContain('5.0000');
  });

  it('reports hot / cold / undefined counts', () => {
    const desc = describeLineElderThermometerChart(constHL(20, 10, 2));
    expect(desc).toMatch(/hot on 0/);
    expect(desc).toMatch(/cold on 19/);
    expect(desc).toMatch(/undefined on 1/);
  });
});

describe('<ChartLineElderThermometer />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineElderThermometer data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-elder-thermometer-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 1)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Elder Market Thermometer',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineElderThermometer data={risingByS(20, 1)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-hot-threshold', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        hotThreshold={5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-thermometer"]',
    );
    expect(root?.getAttribute('data-hot-threshold')).toBe('5');
  });

  it('exposes data-thermo-final', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-thermometer"]',
    );
    expect(root?.getAttribute('data-thermo-final')).toBe('5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(25, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-thermometer"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-elder-thermometer-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Elder Market Thermometer');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 1)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="thermo"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="thermo"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'thermo',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        hiddenSeries={['thermo']}
      />,
    );
    const button = container.querySelector('[data-series-id="thermo"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides thermo line when controlled hidden', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        hiddenSeries={['thermo']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-elder-thermometer-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-thermometer-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-thermometer-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-elder-thermometer-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 1)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-elder-thermometer-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-legend"]',
      ),
    ).toBe(null);
  });

  it('hides threshold when showThreshold is false', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        showThreshold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-threshold"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatThermo', () => {
    const fmt = (v: number) => `[T:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 5)}
        formatThermo={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[T:\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-thermometer"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-thermometer"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-elder-thermometer-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the thermo line by default', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        defaultHiddenSeries={['thermo']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 1)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-thermometer-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineElderThermometer data={risingByS(20, 1)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-thermometer-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineElderThermometer
        data={risingByS(20, 1)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-elder-thermometer-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-thermometer-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Elder Thermometer integration', () => {
  it('rising-by-S yields thermo = S bit-exact across many S', () => {
    for (const S of [0.5, 1, 2, 5, 10, 100, 0.25]) {
      const bars = risingByS(20, S).map((p) => ({
        high: p.high,
        low: p.low,
      }));
      const out = computeLineElderThermometer(bars);
      for (let i = 1; i < 20; i += 1) {
        expect(out[i]).toBe(S);
      }
    }
  });

  it('antisymmetry: falling and rising at same step yield same thermo bit-exact', () => {
    for (const S of [1, 2, 5, 10]) {
      const rise = risingByS(15, S).map((p) => ({
        high: p.high,
        low: p.low,
      }));
      const fall = fallingByS(15, S).map((p) => ({
        high: p.high,
        low: p.low,
      }));
      const r = computeLineElderThermometer(rise);
      const f = computeLineElderThermometer(fall);
      for (let i = 1; i < 15; i += 1) {
        expect(r[i]).toBe(f[i]);
      }
    }
  });
});
