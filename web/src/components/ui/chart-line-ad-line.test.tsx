import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAdLine,
  classifyLineAdLineZone,
  computeLineAdLine,
  computeLineAdLineClv,
  computeLineAdLineLayout,
  describeLineAdLineChart,
  getLineAdLineFinitePoints,
  runLineAdLine,
} from './chart-line-ad-line';
import type {
  ChartLineAdLinePoint,
} from './chart-line-ad-line';

const closeAtHigh = (length: number, baseHigh = 10, baseLow = 5, volume = 100): ChartLineAdLinePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: baseHigh + i,
    low: baseLow + i,
    close: baseHigh + i,
    volume,
  }));

const closeAtLow = (length: number, baseHigh = 10, baseLow = 5, volume = 100): ChartLineAdLinePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: baseHigh + i,
    low: baseLow + i,
    close: baseLow + i,
    volume,
  }));

const closeAtMid = (length: number, baseHigh = 10, baseLow = 5, volume = 100): ChartLineAdLinePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: baseHigh + i,
    low: baseLow + i,
    close: (baseHigh + baseLow) / 2 + i,
    volume,
  }));

const flatBars = (length: number, value: number, volume = 100): ChartLineAdLinePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    high: value,
    low: value,
    close: value,
    volume,
  }));

describe('getLineAdLineFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAdLineFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineAdLineFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineAdLineFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineAdLineFinitePoints([
      { x: 1, high: 10, low: 5, close: 8, volume: 100 },
      { x: Number.NaN, high: 10, low: 5, close: 8, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high', () => {
    const result = getLineAdLineFinitePoints([
      { x: 1, high: Number.POSITIVE_INFINITY, low: 5, close: 8, volume: 100 },
      { x: 2, high: 10, low: 5, close: 8, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite volume', () => {
    const result = getLineAdLineFinitePoints([
      { x: 1, high: 10, low: 5, close: 8, volume: Number.NaN },
      { x: 2, high: 10, low: 5, close: 8, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineAdLineFinitePoints([
      null as unknown as ChartLineAdLinePoint,
      { x: 1, high: 10, low: 5, close: 8, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('computeLineAdLineClv', () => {
  it('close at high yields CLV = 1 bit-exact', () => {
    expect(computeLineAdLineClv(10, 5, 10)).toBe(1);
  });

  it('close at low yields CLV = -1 bit-exact', () => {
    expect(computeLineAdLineClv(10, 5, 5)).toBe(-1);
  });

  it('close at midpoint yields CLV = 0 bit-exact', () => {
    expect(computeLineAdLineClv(10, 6, 8)).toBe(0);
  });

  it('high == low yields CLV = 0 (singular treated as zero)', () => {
    expect(computeLineAdLineClv(5, 5, 5)).toBe(0);
  });

  it('CLV at quarter-high computes exact dyadic value', () => {
    // high=10, low=2, close=8 -> CLV = ((8-2) - (10-8))/(10-2) = (6-2)/8 = 0.5
    expect(computeLineAdLineClv(10, 2, 8)).toBe(0.5);
  });

  it('CLV is dimensionless: scaling all three by K leaves CLV unchanged', () => {
    const base = computeLineAdLineClv(10, 5, 7);
    const scaled = computeLineAdLineClv(20, 10, 14);
    expect(scaled).toBeCloseTo(base, 12);
  });
});

describe('computeLineAdLine', () => {
  it('returns an empty array for null', () => {
    expect(computeLineAdLine(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineAdLine([])).toEqual([]);
  });

  it('close at high adds +volume each bar bit-exact', () => {
    const bars = closeAtHigh(5);
    const out = computeLineAdLine(bars);
    expect(out[0]).toBe(100);
    expect(out[1]).toBe(200);
    expect(out[2]).toBe(300);
    expect(out[3]).toBe(400);
    expect(out[4]).toBe(500);
  });

  it('close at low subtracts -volume each bar bit-exact', () => {
    const bars = closeAtLow(5);
    const out = computeLineAdLine(bars);
    expect(out[0]).toBe(-100);
    expect(out[1]).toBe(-200);
    expect(out[2]).toBe(-300);
    expect(out[3]).toBe(-400);
    expect(out[4]).toBe(-500);
  });

  it('close at midpoint stays flat at zero bit-exact', () => {
    const bars = closeAtMid(10);
    const out = computeLineAdLine(bars);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('flat bars (high == low) leave cumulative at zero bit-exact', () => {
    const bars = flatBars(10, 7);
    const out = computeLineAdLine(bars);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('zero volume contributes no flow', () => {
    const bars: ChartLineAdLinePoint[] = [
      { x: 0, high: 10, low: 5, close: 10, volume: 0 },
      { x: 1, high: 10, low: 5, close: 5, volume: 0 },
    ];
    const out = computeLineAdLine(bars);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
  });

  it('nulls bars with non-finite fields', () => {
    const bars: ChartLineAdLinePoint[] = [
      { x: 0, high: 10, low: 5, close: 10, volume: 100 },
      { x: 1, high: Number.NaN, low: 5, close: 8, volume: 100 },
      { x: 2, high: 10, low: 5, close: 10, volume: 100 },
    ];
    const out = computeLineAdLine(bars);
    expect(out[0]).toBe(100);
    expect(out[1]).toBe(null);
    // Cumulative carries through despite null bar (next finite bar resumes)
    expect(out[2]).toBe(200);
  });

  it('output length matches input length', () => {
    const bars = closeAtHigh(30);
    const out = computeLineAdLine(bars);
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const bars: ChartLineAdLinePoint[] = [
      { x: 0, high: 10, low: 5, close: 8, volume: 100 },
      { x: 1, high: 12, low: 6, close: 10, volume: 150 },
    ];
    const snap = bars.map((b) => ({ ...b }));
    computeLineAdLine(bars);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('alternating high/low close yields zero net flow bit-exact', () => {
    const bars: ChartLineAdLinePoint[] = [
      { x: 0, high: 10, low: 5, close: 10, volume: 100 },
      { x: 1, high: 10, low: 5, close: 5, volume: 100 },
    ];
    const out = computeLineAdLine(bars);
    expect(out[0]).toBe(100);
    expect(out[1]).toBe(0);
  });

  it('worked AD step: high=10 low=0 close=2 volume=10 yields CLV=-0.6, flow=-6 bit-exact', () => {
    // CLV = ((2-0) - (10-2))/(10-0) = (2 - 8)/10 = -0.6 exact dyadic
    // flow = -0.6 * 10 = -6 exact
    const bars: ChartLineAdLinePoint[] = [
      { x: 0, high: 10, low: 0, close: 2, volume: 10 },
    ];
    const out = computeLineAdLine(bars);
    expect(out[0]).toBe(-6);
  });
});

describe('classifyLineAdLineZone', () => {
  it('classifies accumulating when flow > 0', () => {
    expect(classifyLineAdLineZone(1, 100)).toBe('accumulating');
  });

  it('classifies distributing when flow < 0', () => {
    expect(classifyLineAdLineZone(-1, 100)).toBe('distributing');
  });

  it('classifies flat when CLV = 0', () => {
    expect(classifyLineAdLineZone(0, 100)).toBe('flat');
  });

  it('classifies flat when volume = 0', () => {
    expect(classifyLineAdLineZone(0.5, 0)).toBe('flat');
  });

  it('returns none when CLV is null', () => {
    expect(classifyLineAdLineZone(null, 100)).toBe('none');
  });

  it('returns none when volume is null', () => {
    expect(classifyLineAdLineZone(0.5, null)).toBe('none');
  });
});

describe('runLineAdLine', () => {
  it('marks ok=false for fewer than 2 points', () => {
    const run = runLineAdLine([
      { x: 0, high: 10, low: 5, close: 8, volume: 100 },
    ]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true for at least 2 points', () => {
    const run = runLineAdLine(closeAtHigh(20));
    expect(run.ok).toBe(true);
  });

  it('sorts by x', () => {
    const data: ChartLineAdLinePoint[] = [
      { x: 2, high: 10, low: 5, close: 10, volume: 100 },
      { x: 0, high: 10, low: 5, close: 5, volume: 100 },
      { x: 1, high: 10, low: 5, close: 7.5, volume: 100 },
    ];
    const run = runLineAdLine(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('close-at-high counts all bars as accumulating', () => {
    const run = runLineAdLine(closeAtHigh(20));
    expect(run.accumulatingCount).toBe(20);
    expect(run.flatCount).toBe(0);
    expect(run.distributingCount).toBe(0);
  });

  it('close-at-low counts all bars as distributing', () => {
    const run = runLineAdLine(closeAtLow(20));
    expect(run.distributingCount).toBe(20);
    expect(run.accumulatingCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('close-at-mid counts all bars as flat', () => {
    const run = runLineAdLine(closeAtMid(20));
    expect(run.flatCount).toBe(20);
    expect(run.accumulatingCount).toBe(0);
    expect(run.distributingCount).toBe(0);
  });

  it('flat bars (high==low) count as flat', () => {
    const run = runLineAdLine(flatBars(15, 7));
    expect(run.flatCount).toBe(15);
  });

  it('exposes adFinal as the last finite AD value', () => {
    const run = runLineAdLine(closeAtHigh(5));
    expect(run.adFinal).toBe(500);
  });

  it('adFinal is null when there is no data', () => {
    const run = runLineAdLine([]);
    expect(run.adFinal).toBe(null);
  });

  it('counts sum to total bars', () => {
    const data: ChartLineAdLinePoint[] = [
      ...closeAtHigh(5),
      ...closeAtLow(5).map((p, i) => ({ ...p, x: 100 + i })),
      ...closeAtMid(5).map((p, i) => ({ ...p, x: 200 + i })),
    ];
    const run = runLineAdLine(data);
    expect(
      run.accumulatingCount + run.flatCount + run.distributingCount,
    ).toBe(run.series.length);
  });
});

describe('computeLineAdLineLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAdLineLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAdLineLayout({ data: closeAtHigh(20) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineAdLineLayout({
      data: closeAtHigh(20),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price panel above AD panel', () => {
    const layout = computeLineAdLineLayout({ data: closeAtHigh(20) });
    expect(layout.priceBottom).toBeLessThan(layout.adTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineAdLineLayout({
      data: closeAtHigh(20),
      panelGap: 24,
    });
    expect(layout.adTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAdLineLayout({ data: closeAtHigh(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces an AD path and markers', () => {
    const layout = computeLineAdLineLayout({ data: closeAtHigh(20) });
    expect(layout.adPath.length).toBeGreaterThan(0);
    expect(layout.markers.length).toBe(20);
  });

  it('priceMin and priceMax differ for constant data', () => {
    const layout = computeLineAdLineLayout({ data: flatBars(20, 5) });
    expect(layout.priceMin).toBeLessThan(layout.priceMax);
  });

  it('adMin and adMax differ for constant data', () => {
    const layout = computeLineAdLineLayout({ data: closeAtMid(20) });
    expect(layout.adMin).toBeLessThan(layout.adMax);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineAdLineLayout({
      data: [{ x: 0, high: 10, low: 5, close: 8, volume: 100 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAdLineChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAdLineChart([])).toBe('No data');
  });

  it('mentions Accumulation Distribution', () => {
    const desc = describeLineAdLineChart(closeAtHigh(20));
    expect(desc).toContain('Accumulation Distribution');
  });

  it('mentions close location value', () => {
    const desc = describeLineAdLineChart(closeAtHigh(20));
    expect(desc).toContain('close location value');
  });

  it('reports accumulating / flat / distributing counts', () => {
    const desc = describeLineAdLineChart(closeAtHigh(15));
    expect(desc).toMatch(/accumulating on 15/);
    expect(desc).toMatch(/flat on 0/);
    expect(desc).toMatch(/distributing on 0/);
  });

  it('reports the final reading', () => {
    const desc = describeLineAdLineChart(closeAtHigh(5));
    expect(desc).toContain('500.0000');
  });
});

describe('<ChartLineAdLine />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineAdLine data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-ad-line-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(20)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Accumulation Distribution',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAdLine data={closeAtHigh(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-ad-final', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(5)} />);
    const root = container.querySelector(
      '[data-section="chart-line-ad-line"]',
    );
    expect(root?.getAttribute('data-ad-final')).toBe('500');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(25)} />);
    const root = container.querySelector(
      '[data-section="chart-line-ad-line"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('exposes accumulating / flat / distributing counts', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(20)} />);
    const root = container.querySelector(
      '[data-section="chart-line-ad-line"]',
    );
    expect(root?.getAttribute('data-accumulating-count')).toBe('20');
    expect(root?.getAttribute('data-flat-count')).toBe('0');
    expect(root?.getAttribute('data-distributing-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(20)} />);
    const desc = container.querySelector(
      '[data-section="chart-line-ad-line-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Accumulation Distribution');
  });

  it('renders both legend items', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="ad"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAdLine
        data={closeAtHigh(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const adButton = container.querySelector(
      '[data-series-id="ad"]',
    ) as HTMLButtonElement | null;
    if (adButton) fireEvent.click(adButton);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'ad', hidden: true });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineAdLine
        data={closeAtHigh(20)}
        hiddenSeries={['ad']}
      />,
    );
    const adButton = container.querySelector('[data-series-id="ad"]');
    expect(adButton?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides AD line when controlled hidden', () => {
    const { container } = render(
      <ChartLineAdLine
        data={closeAtHigh(20)}
        hiddenSeries={['ad']}
      />,
    );
    const line = container.querySelector(
      '[data-section="chart-line-ad-line-line"]',
    );
    expect(line).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAdLine
        data={closeAtHigh(20)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ad-line-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAdLine
        data={closeAtHigh(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ad-line-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAdLine
        data={closeAtHigh(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ad-line-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineAdLine
        data={closeAtHigh(20)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(20)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-ad-line-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(20)} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-ad-line-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(20)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(20)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(20)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(20)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-legend"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatAd', () => {
    const fmt = (v: number) => `[AD:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(5)} formatAd={fmt} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('[AD:500]');
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAdLine
        data={closeAtHigh(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ad-line"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(20)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ad-line"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-ad-line-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the AD line by default', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAdLine
        data={closeAtHigh(20)}
        defaultHiddenSeries={['ad']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(20)} />);
    const marker = container.querySelector(
      '[data-section="chart-line-ad-line-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(<ChartLineAdLine data={closeAtHigh(20)} />);
    const marker = container.querySelector(
      '[data-section="chart-line-ad-line-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineAdLine data={closeAtHigh(20)} showTooltip={false} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ad-line-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-ad-line-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('AD line integration', () => {
  it('combined accumulation then distribution cancels to zero', () => {
    const acc = closeAtHigh(5);
    const dist = closeAtLow(5).map((p, i) => ({ ...p, x: 100 + i }));
    const data = [...acc, ...dist];
    const run = runLineAdLine(data);
    // acc adds +500 (5 bars at +100), dist subtracts -500 (5 bars at -100)
    // (close-at-high subtracts and close-at-low subtracts depending on calc)
    // wait actually: close at high = +100, close at low = -100. So net = 0 after 10 bars.
    expect(run.adFinal).toBe(0);
  });

  it('all-high then all-mid leaves cumulative at the accumulation peak', () => {
    const acc = closeAtHigh(5);
    const mid = closeAtMid(5).map((p, i) => ({ ...p, x: 100 + i }));
    const data = [...acc, ...mid];
    const run = runLineAdLine(data);
    expect(run.adFinal).toBe(500);
  });

  it('alternating bars produce sawtooth bit-exact', () => {
    const data: ChartLineAdLinePoint[] = [];
    for (let i = 0; i < 6; i += 1) {
      data.push({
        x: i,
        high: 10,
        low: 0,
        close: i % 2 === 0 ? 10 : 0,
        volume: 50,
      });
    }
    const run = runLineAdLine(data);
    // CLV alternates +1, -1, +1, -1, +1, -1; flow alternates +50, -50, ...
    // cumulative: 50, 0, 50, 0, 50, 0
    expect(run.adFinal).toBe(0);
    expect(run.samples[0]!.ad).toBe(50);
    expect(run.samples[1]!.ad).toBe(0);
    expect(run.samples[4]!.ad).toBe(50);
  });

  it('worked anchor: high=8 low=0 close=2 volume=10 yields CLV=-0.5, flow=-5', () => {
    // CLV = ((2-0) - (8-2))/(8-0) = (2-6)/8 = -0.5 dyadic exact
    // flow = -5 exact
    const data: ChartLineAdLinePoint[] = [
      { x: 0, high: 8, low: 0, close: 2, volume: 10 },
    ];
    const out = computeLineAdLine(data);
    expect(out[0]).toBe(-5);
  });
});
