import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHilbertInstant,
  classifyLineHilbertInstantZone,
  computeLineHilbertInstant,
  computeLineHilbertInstantLayout,
  computeLineHilbertInstantSmoothed,
  describeLineHilbertInstantChart,
  getLineHilbertInstantFinitePoints,
  normalizeLineHilbertInstantLag,
  runLineHilbertInstant,
  DEFAULT_CHART_LINE_HILBERT_INSTANT_LAG,
} from './chart-line-hilbert-instant';
import type { ChartLineHilbertInstantPoint } from './chart-line-hilbert-instant';

const constClose = (
  count: number,
  K: number,
): ChartLineHilbertInstantPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const ramp = (
  count: number,
  a = 1,
  b = 0,
): ChartLineHilbertInstantPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: a * i + b }));

describe('getLineHilbertInstantFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineHilbertInstantFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineHilbertInstantFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineHilbertInstantFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineHilbertInstantFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineHilbertInstantFinitePoints([
      null as unknown as ChartLineHilbertInstantPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineHilbertInstantLag', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineHilbertInstantLag(undefined, 6)).toBe(6);
  });

  it('floors fractional lags', () => {
    expect(normalizeLineHilbertInstantLag(5.9, 6)).toBe(5);
  });

  it('rejects lag below 1', () => {
    expect(normalizeLineHilbertInstantLag(0, 6)).toBe(6);
  });

  it('accepts lag 1', () => {
    expect(normalizeLineHilbertInstantLag(1, 6)).toBe(1);
  });
});

describe('computeLineHilbertInstantSmoothed', () => {
  it('emits null for warmup bars (i < 3)', () => {
    const out = computeLineHilbertInstantSmoothed([1, 2, 3, 4, 5]);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
    expect(typeof out[3]).toBe('number');
  });

  it('CONST close yields smoothed = K bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = computeLineHilbertInstantSmoothed(Array(10).fill(K));
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('RAMP close = i yields smoothed = i - 1 bit-exact', () => {
    const out = computeLineHilbertInstantSmoothed(
      Array.from({ length: 10 }, (_, i) => i),
    );
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(i - 1);
    }
  });

  it('RAMP close = 2*i yields smoothed = 2*(i - 1) bit-exact', () => {
    const out = computeLineHilbertInstantSmoothed(
      Array.from({ length: 10 }, (_, i) => 2 * i),
    );
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(2 * (i - 1));
    }
  });
});

describe('computeLineHilbertInstant', () => {
  it('returns empty for null', () => {
    expect(computeLineHilbertInstant(null)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(computeLineHilbertInstant([])).toEqual([]);
  });

  it('nulls warmup bars (i < 3 + lag)', () => {
    const closes = Array(30).fill(5);
    const out = computeLineHilbertInstant(closes, { lag: 6 });
    for (let i = 0; i < 9; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[9]).toBe('number');
  });

  it('CONST close yields instant = 0 bit-exact past warmup', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(30).fill(K);
      const out = computeLineHilbertInstant(closes, { lag: 6 });
      for (let i = 9; i < 30; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('RAMP close = a*i yields instant = a * lag bit-exact', () => {
    for (const a of [1, 2, 3, -1, -5]) {
      for (const lag of [2, 4, 6, 10]) {
        const closes = ramp(30, a).map((p) => p.close);
        const out = computeLineHilbertInstant(closes, { lag });
        for (let i = 3 + lag; i < 30; i += 1) {
          expect(out[i]).toBe(a * lag);
        }
      }
    }
  });

  it('output length matches input length', () => {
    const closes = Array(30).fill(5);
    const out = computeLineHilbertInstant(closes, { lag: 6 });
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = Array(30).fill(5);
    const snap = closes.slice();
    computeLineHilbertInstant(closes, { lag: 6 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite lag (uses default)', () => {
    const closes = Array(30).fill(5);
    const out = computeLineHilbertInstant(closes, { lag: Number.NaN });
    expect(out[9]).toBe(0);
  });

  it('null close propagates', () => {
    const closes: Array<number | null> = Array(30).fill(5);
    closes[10] = null;
    const out = computeLineHilbertInstant(closes, { lag: 3 });
    // Bar 10's null nulls the smoothed at bars 10-13.
    expect(out[10]).toBe(null);
  });
});

describe('classifyLineHilbertInstantZone', () => {
  it('classifies flat when value == 0', () => {
    expect(classifyLineHilbertInstantZone(0, 100)).toBe('flat');
  });

  it('classifies strong-up at >= 50% of abs max', () => {
    expect(classifyLineHilbertInstantZone(50, 100)).toBe('strong-up');
    expect(classifyLineHilbertInstantZone(100, 100)).toBe('strong-up');
  });

  it('classifies up between 0 and 50% of abs max', () => {
    expect(classifyLineHilbertInstantZone(25, 100)).toBe('up');
  });

  it('classifies down between -50% and 0', () => {
    expect(classifyLineHilbertInstantZone(-25, 100)).toBe('down');
  });

  it('classifies strong-down at <= -50% of abs max', () => {
    expect(classifyLineHilbertInstantZone(-50, 100)).toBe('strong-down');
    expect(classifyLineHilbertInstantZone(-100, 100)).toBe('strong-down');
  });

  it('returns none for null', () => {
    expect(classifyLineHilbertInstantZone(null, 100)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineHilbertInstantZone(Number.NaN, 100)).toBe('none');
  });

  it('falls back to up/down when abs-max is zero', () => {
    expect(classifyLineHilbertInstantZone(5, 0)).toBe('up');
    expect(classifyLineHilbertInstantZone(-5, 0)).toBe('down');
  });
});

describe('runLineHilbertInstant', () => {
  it('marks ok=false for fewer than 4 + lag points', () => {
    const run = runLineHilbertInstant(constClose(9, 5), { lag: 6 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineHilbertInstant(constClose(10, 5), { lag: 6 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineHilbertInstant(constClose(30, 5));
    expect(run.lag).toBe(DEFAULT_CHART_LINE_HILBERT_INSTANT_LAG);
  });

  it('respects explicit options', () => {
    const run = runLineHilbertInstant(constClose(30, 5), { lag: 3 });
    expect(run.lag).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineHilbertInstantPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineHilbertInstant(data, { lag: 1 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as flat', () => {
    const run = runLineHilbertInstant(constClose(30, 5), { lag: 6 });
    expect(run.flatCount).toBe(30 - 9);
  });

  it('RAMP close = i classifies post-warmup with abs-max ratio (a*lag)', () => {
    const run = runLineHilbertInstant(ramp(30, 1), { lag: 6 });
    // All readings are 6 -> abs max = 6; all bars at ratio 1 -> strong-up.
    expect(run.strongUpCount).toBe(30 - 9);
  });

  it('exposes instantFinal as the last finite reading', () => {
    const run = runLineHilbertInstant(ramp(30, 2), { lag: 6 });
    expect(run.instantFinal).toBe(12);
  });

  it('instantFinal is null when there is no data', () => {
    const run = runLineHilbertInstant([]);
    expect(run.instantFinal).toBe(null);
  });
});

describe('computeLineHilbertInstantLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineHilbertInstantLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineHilbertInstantLayout({
      data: constClose(30, 5),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineHilbertInstantLayout({
      data: constClose(30, 5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above instant', () => {
    const layout = computeLineHilbertInstantLayout({ data: constClose(30, 5) });
    expect(layout.priceBottom).toBeLessThan(layout.instantTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineHilbertInstantLayout({
      data: constClose(30, 5),
      panelGap: 24,
    });
    expect(layout.instantTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineHilbertInstantLayout({ data: constClose(30, 5) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces an instant path and markers (skipping warmup)', () => {
    const layout = computeLineHilbertInstantLayout({
      data: constClose(30, 5),
      lag: 6,
    });
    expect(layout.markers.length).toBe(30 - 9);
  });

  it('zero baseline is inside the instant panel', () => {
    const layout = computeLineHilbertInstantLayout({ data: constClose(30, 5) });
    expect(layout.zeroBaselineY).toBeGreaterThanOrEqual(layout.instantTop);
    expect(layout.zeroBaselineY).toBeLessThanOrEqual(layout.instantBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineHilbertInstantLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineHilbertInstantChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineHilbertInstantChart([])).toBe('No data');
  });

  it('mentions Hilbert Transform Instantaneous Trendline', () => {
    const desc = describeLineHilbertInstantChart(constClose(30, 5));
    expect(desc).toContain('Hilbert Transform Instantaneous Trendline');
  });

  it('mentions the formula', () => {
    const desc = describeLineHilbertInstantChart(constClose(30, 5));
    expect(desc).toContain('smoothed[i] - smoothed[i - lag]');
  });

  it('reports the lag', () => {
    const desc = describeLineHilbertInstantChart(constClose(30, 5), {
      lag: 4,
    });
    expect(desc).toContain('lag 4');
  });

  it('reports the final reading', () => {
    const desc = describeLineHilbertInstantChart(constClose(30, 5));
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineHilbertInstant />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineHilbertInstant data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-hilbert-instant-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Hilbert Instantaneous Trendline',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHilbertInstant data={constClose(30, 5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-lag', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} lag={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-instant"]',
    );
    expect(root?.getAttribute('data-lag')).toBe('4');
  });

  it('exposes data-instant-final', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-instant"]',
    );
    expect(root?.getAttribute('data-instant-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-instant"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-hilbert-instant-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Hilbert Transform Instantaneous Trendline',
    );
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="instant"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="instant"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'instant',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        hiddenSeries={['instant']}
      />,
    );
    const button = container.querySelector('[data-series-id="instant"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides instant line when controlled hidden', () => {
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        hiddenSeries={['instant']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-hilbert-instant-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-instant-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-instant-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hilbert-instant-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hilbert-instant-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatInstant', () => {
    const fmt = (v: number) => `[H:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        formatInstant={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-instant-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[H:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-instant"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-instant"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-hilbert-instant-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the instant line by default', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        defaultHiddenSeries={['instant']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-instant-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineHilbertInstant data={constClose(30, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-instant-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineHilbertInstant
        data={constClose(30, 5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-instant-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-instant-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Hilbert Instant integration', () => {
  it('CONST close yields instant = 0 across (K, lag)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const lag of [2, 4, 6, 10]) {
        const closes = Array(20 + lag).fill(K);
        const out = computeLineHilbertInstant(closes, { lag });
        for (let i = 3 + lag; i < closes.length; i += 1) {
          expect(out[i]).toBe(0);
        }
      }
    }
  });

  it('RAMP close yields instant = a * lag across (a, lag)', () => {
    for (const a of [1, 2, 3, -1, -5]) {
      for (const lag of [2, 4, 6, 10]) {
        const closes = ramp(20 + lag, a).map((p) => p.close);
        const out = computeLineHilbertInstant(closes, { lag });
        for (let i = 3 + lag; i < closes.length; i += 1) {
          expect(out[i]).toBe(a * lag);
        }
      }
    }
  });
});
