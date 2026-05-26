import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDeltaVolume,
  classifyLineDeltaVolumeZone,
  computeLineDeltaVolume,
  computeLineDeltaVolumeLayout,
  computeLineDeltaVolumeSign,
  describeLineDeltaVolumeChart,
  getLineDeltaVolumeFinitePoints,
  runLineDeltaVolume,
} from './chart-line-delta-volume';
import type {
  ChartLineDeltaVolumePoint,
} from './chart-line-delta-volume';

const rising = (length: number, start = 100, step = 1, volume = 100): ChartLineDeltaVolumePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: start + i * step,
    volume,
  }));

const falling = (length: number, start = 100, step = 1, volume = 100): ChartLineDeltaVolumePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: start - i * step,
    volume,
  }));

const flat = (length: number, value: number, volume = 100): ChartLineDeltaVolumePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: value,
    volume,
  }));

describe('getLineDeltaVolumeFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineDeltaVolumeFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineDeltaVolumeFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for non-array', () => {
    expect(getLineDeltaVolumeFinitePoints({} as never)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineDeltaVolumeFinitePoints([
      { x: 1, close: 10, volume: 100 },
      { x: Number.NaN, close: 20, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineDeltaVolumeFinitePoints([
      { x: 1, close: Number.POSITIVE_INFINITY, volume: 100 },
      { x: 2, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite volume', () => {
    const result = getLineDeltaVolumeFinitePoints([
      { x: 1, close: 10, volume: Number.NaN },
      { x: 2, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineDeltaVolumeFinitePoints([
      null as unknown as ChartLineDeltaVolumePoint,
      { x: 1, close: 10, volume: 100 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('computeLineDeltaVolumeSign', () => {
  it('returns +1 for rising', () => {
    expect(computeLineDeltaVolumeSign(10, 5)).toBe(1);
  });

  it('returns -1 for falling', () => {
    expect(computeLineDeltaVolumeSign(5, 10)).toBe(-1);
  });

  it('returns 0 for unchanged', () => {
    expect(computeLineDeltaVolumeSign(5, 5)).toBe(0);
  });

  it('returns 0 when current is non-finite', () => {
    expect(computeLineDeltaVolumeSign(Number.NaN, 5)).toBe(0);
  });

  it('returns 0 when prior is non-finite', () => {
    expect(computeLineDeltaVolumeSign(5, Number.NaN)).toBe(0);
  });

  it('handles negative values', () => {
    expect(computeLineDeltaVolumeSign(-5, -10)).toBe(1);
    expect(computeLineDeltaVolumeSign(-10, -5)).toBe(-1);
  });

  it('handles zero crossings', () => {
    expect(computeLineDeltaVolumeSign(1, -1)).toBe(1);
    expect(computeLineDeltaVolumeSign(-1, 1)).toBe(-1);
  });
});

describe('computeLineDeltaVolume', () => {
  it('returns an empty array for null', () => {
    expect(computeLineDeltaVolume(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineDeltaVolume([])).toEqual([]);
  });

  it('seed bar (i=0) is zero', () => {
    const out = computeLineDeltaVolume([{ close: 10, volume: 100 }]);
    expect(out[0]).toBe(0);
  });

  it('rising closes yield +volume bit-exact', () => {
    const bars = rising(5).map((p) => ({ close: p.close, volume: p.volume }));
    const out = computeLineDeltaVolume(bars);
    expect(out[0]).toBe(0); // seed
    expect(out[1]).toBe(100);
    expect(out[2]).toBe(100);
    expect(out[3]).toBe(100);
    expect(out[4]).toBe(100);
  });

  it('falling closes yield -volume bit-exact', () => {
    const bars = falling(5).map((p) => ({ close: p.close, volume: p.volume }));
    const out = computeLineDeltaVolume(bars);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(-100);
    expect(out[2]).toBe(-100);
    expect(out[3]).toBe(-100);
    expect(out[4]).toBe(-100);
  });

  it('unchanged closes yield 0 bit-exact', () => {
    const bars = flat(10, 50).map((p) => ({ close: p.close, volume: p.volume }));
    const out = computeLineDeltaVolume(bars);
    for (let i = 0; i < out.length; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('mixed direction yields signed volume per bar', () => {
    const bars: Array<{ close: number; volume: number }> = [
      { close: 10, volume: 100 },
      { close: 12, volume: 200 },
      { close: 11, volume: 300 },
      { close: 11, volume: 50 },
      { close: 15, volume: 400 },
    ];
    const out = computeLineDeltaVolume(bars);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(200);
    expect(out[2]).toBe(-300);
    expect(out[3]).toBe(0);
    expect(out[4]).toBe(400);
  });

  it('variable volume preserves signed exact value', () => {
    const bars: Array<{ close: number; volume: number }> = [
      { close: 10, volume: 25 },
      { close: 11, volume: 75 },
      { close: 12, volume: 125 },
      { close: 13, volume: 175 },
    ];
    const out = computeLineDeltaVolume(bars);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(75);
    expect(out[2]).toBe(125);
    expect(out[3]).toBe(175);
  });

  it('zero volume yields zero delta', () => {
    const bars: Array<{ close: number; volume: number }> = [
      { close: 10, volume: 100 },
      { close: 20, volume: 0 },
      { close: 5, volume: 0 },
    ];
    const out = computeLineDeltaVolume(bars);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(-0);
  });

  it('null close in middle preserves prior reference for next finite bar', () => {
    const bars: Array<{ close: number; volume: number }> = [
      { close: 10, volume: 100 },
      { close: 12, volume: 100 },
      { close: Number.NaN, volume: 100 },
      { close: 15, volume: 100 },
    ];
    const out = computeLineDeltaVolume(bars);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(100);
    expect(out[2]).toBe(null);
    // After null, the prior reference is preserved at 12; next bar
    // close=15 > 12 so delta = +100.
    expect(out[3]).toBe(100);
  });

  it('output length matches input length', () => {
    const bars = rising(20).map((p) => ({ close: p.close, volume: p.volume }));
    const out = computeLineDeltaVolume(bars);
    expect(out.length).toBe(20);
  });

  it('does not mutate input', () => {
    const bars: Array<{ close: number; volume: number }> = [
      { close: 10, volume: 100 },
      { close: 12, volume: 200 },
    ];
    const snap = bars.map((b) => ({ ...b }));
    computeLineDeltaVolume(bars);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('negative close handled correctly', () => {
    const bars: Array<{ close: number; volume: number }> = [
      { close: -10, volume: 100 },
      { close: -5, volume: 100 },
      { close: -15, volume: 100 },
    ];
    const out = computeLineDeltaVolume(bars);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(100); // -5 > -10
    expect(out[2]).toBe(-100); // -15 < -5
  });

  it('first finite bar after leading non-finite is treated as seed', () => {
    const bars: Array<{ close: number; volume: number }> = [
      { close: Number.NaN, volume: 100 },
      { close: 10, volume: 100 },
      { close: 12, volume: 100 },
    ];
    const out = computeLineDeltaVolume(bars);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(0); // seed since no prior
    expect(out[2]).toBe(100);
  });
});

describe('classifyLineDeltaVolumeZone', () => {
  it('classifies positive', () => {
    expect(classifyLineDeltaVolumeZone(100)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineDeltaVolumeZone(-100)).toBe('negative');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineDeltaVolumeZone(0)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineDeltaVolumeZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineDeltaVolumeZone(Number.NaN)).toBe('none');
  });
});

describe('runLineDeltaVolume', () => {
  it('marks ok=false for fewer than 2 points', () => {
    const run = runLineDeltaVolume([{ x: 0, close: 10, volume: 100 }]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true for at least 2 points', () => {
    const run = runLineDeltaVolume(rising(20));
    expect(run.ok).toBe(true);
  });

  it('sorts by x', () => {
    const data: ChartLineDeltaVolumePoint[] = [
      { x: 2, close: 30, volume: 100 },
      { x: 0, close: 10, volume: 100 },
      { x: 1, close: 20, volume: 100 },
    ];
    const run = runLineDeltaVolume(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('rising trend counts as positive', () => {
    const run = runLineDeltaVolume(rising(20));
    // Seed is flat, the rest are positive
    expect(run.positiveCount).toBe(19);
    expect(run.flatCount).toBe(1);
    expect(run.negativeCount).toBe(0);
  });

  it('falling trend counts as negative', () => {
    const run = runLineDeltaVolume(falling(20));
    expect(run.negativeCount).toBe(19);
    expect(run.flatCount).toBe(1);
    expect(run.positiveCount).toBe(0);
  });

  it('flat trend counts all as flat', () => {
    const run = runLineDeltaVolume(flat(15, 5));
    expect(run.flatCount).toBe(15);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('exposes deltaFinal as the last finite delta', () => {
    const run = runLineDeltaVolume(rising(5));
    expect(run.deltaFinal).toBe(100);
  });

  it('deltaFinal is null when there is no data', () => {
    const run = runLineDeltaVolume([]);
    expect(run.deltaFinal).toBe(null);
  });

  it('counts sum to total bars', () => {
    const data: ChartLineDeltaVolumePoint[] = [
      ...rising(5),
      ...falling(5).map((p, i) => ({ ...p, x: 100 + i })),
    ];
    const run = runLineDeltaVolume(data);
    expect(
      run.positiveCount + run.flatCount + run.negativeCount,
    ).toBe(run.series.length);
  });
});

describe('computeLineDeltaVolumeLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineDeltaVolumeLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineDeltaVolumeLayout({ data: rising(20) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineDeltaVolumeLayout({
      data: rising(20),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price panel above delta panel', () => {
    const layout = computeLineDeltaVolumeLayout({ data: rising(20) });
    expect(layout.priceBottom).toBeLessThan(layout.deltaTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineDeltaVolumeLayout({
      data: rising(20),
      panelGap: 24,
    });
    expect(layout.deltaTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineDeltaVolumeLayout({ data: rising(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces a delta path and markers', () => {
    const layout = computeLineDeltaVolumeLayout({ data: rising(20) });
    expect(layout.deltaPath.length).toBeGreaterThan(0);
    expect(layout.markers.length).toBe(20);
  });

  it('zero line is inside the delta panel', () => {
    const layout = computeLineDeltaVolumeLayout({ data: rising(20) });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.deltaTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.deltaBottom);
  });

  it('priceMin and priceMax differ for constant data', () => {
    const layout = computeLineDeltaVolumeLayout({ data: flat(20, 5) });
    expect(layout.priceMin).toBeLessThan(layout.priceMax);
  });

  it('deltaMin and deltaMax differ for constant data', () => {
    const layout = computeLineDeltaVolumeLayout({ data: flat(20, 5) });
    expect(layout.deltaMin).toBeLessThan(layout.deltaMax);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineDeltaVolumeLayout({
      data: [{ x: 0, close: 5, volume: 100 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineDeltaVolumeChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineDeltaVolumeChart([])).toBe('No data');
  });

  it('mentions Delta Volume', () => {
    const desc = describeLineDeltaVolumeChart(rising(20));
    expect(desc).toContain('Delta Volume');
  });

  it('mentions signed direction', () => {
    const desc = describeLineDeltaVolumeChart(rising(20));
    expect(desc).toContain('rising close gives +volume');
  });

  it('reports positive / flat / negative counts', () => {
    const desc = describeLineDeltaVolumeChart(rising(15));
    expect(desc).toMatch(/positive on 14/);
    expect(desc).toMatch(/flat on 1/);
    expect(desc).toMatch(/negative on 0/);
  });

  it('reports the final reading', () => {
    const desc = describeLineDeltaVolumeChart(rising(5));
    expect(desc).toContain('100.00');
  });
});

describe('<ChartLineDeltaVolume />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineDeltaVolume data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-delta-volume-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Delta Volume');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDeltaVolume data={rising(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-delta-final', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(5)} />);
    const root = container.querySelector(
      '[data-section="chart-line-delta-volume"]',
    );
    expect(root?.getAttribute('data-delta-final')).toBe('100');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(25)} />);
    const root = container.querySelector(
      '[data-section="chart-line-delta-volume"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('exposes positive / flat / negative counts', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    const root = container.querySelector(
      '[data-section="chart-line-delta-volume"]',
    );
    expect(root?.getAttribute('data-positive-count')).toBe('19');
    expect(root?.getAttribute('data-flat-count')).toBe('1');
    expect(root?.getAttribute('data-negative-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    const desc = container.querySelector(
      '[data-section="chart-line-delta-volume-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Delta Volume');
  });

  it('renders both legend items', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="delta"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDeltaVolume
        data={rising(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="delta"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'delta',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineDeltaVolume
        data={rising(20)}
        hiddenSeries={['delta']}
      />,
    );
    const button = container.querySelector('[data-series-id="delta"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides delta line when controlled hidden', () => {
    const { container } = render(
      <ChartLineDeltaVolume
        data={rising(20)}
        hiddenSeries={['delta']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineDeltaVolume
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-delta-volume-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineDeltaVolume
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-delta-volume-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineDeltaVolume
        data={rising(20)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-delta-volume-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} showConfigBadge={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-delta-volume-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-delta-volume-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-zero-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatDelta', () => {
    const fmt = (v: number) => `[D:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineDeltaVolume data={rising(5)} formatDelta={fmt} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('[D:100]');
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineDeltaVolume
        data={rising(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-delta-volume"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-delta-volume"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-delta-volume-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the delta line by default', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineDeltaVolume
        data={rising(20)}
        defaultHiddenSeries={['delta']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    const marker = container.querySelector(
      '[data-section="chart-line-delta-volume-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(<ChartLineDeltaVolume data={rising(20)} />);
    const marker = container.querySelector(
      '[data-section="chart-line-delta-volume-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineDeltaVolume data={rising(20)} showTooltip={false} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-delta-volume-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-delta-volume-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Delta Volume integration', () => {
  it('antisymmetry: reversing direction flips the sign', () => {
    const rise = rising(5).map((p) => ({ close: p.close, volume: p.volume }));
    const fall = falling(5).map((p) => ({ close: p.close, volume: p.volume }));
    const riseOut = computeLineDeltaVolume(rise);
    const fallOut = computeLineDeltaVolume(fall);
    expect(riseOut[1]).toBe(100);
    expect(fallOut[1]).toBe(-100);
    expect(riseOut[1]! + fallOut[1]!).toBe(0);
  });

  it('zigzag pattern produces alternating deltas', () => {
    const bars: Array<{ close: number; volume: number }> = [];
    for (let i = 0; i < 6; i += 1) {
      bars.push({ close: i % 2 === 0 ? 10 : 20, volume: 50 });
    }
    const out = computeLineDeltaVolume(bars);
    expect(out[0]).toBe(0); // seed
    expect(out[1]).toBe(50); // 20 > 10
    expect(out[2]).toBe(-50); // 10 < 20
    expect(out[3]).toBe(50);
    expect(out[4]).toBe(-50);
    expect(out[5]).toBe(50);
  });

  it('scaling volume by K scales delta by K (per-bar)', () => {
    const bars: Array<{ close: number; volume: number }> = [
      { close: 10, volume: 100 },
      { close: 12, volume: 200 },
      { close: 8, volume: 50 },
    ];
    const scaled: Array<{ close: number; volume: number }> = bars.map((b) => ({
      close: b.close,
      volume: b.volume * 3,
    }));
    const base = computeLineDeltaVolume(bars);
    const sc = computeLineDeltaVolume(scaled);
    for (let i = 1; i < bars.length; i += 1) {
      expect(sc[i]).toBe(base[i]! * 3);
    }
  });

  it('sum of deltas equals signed sum check', () => {
    // 3 ups (volume 100 each) + 2 downs (volume 50 each) -> net = 300 - 100 = 200
    const bars: Array<{ close: number; volume: number }> = [
      { close: 10, volume: 0 },
      { close: 11, volume: 100 },
      { close: 12, volume: 100 },
      { close: 13, volume: 100 },
      { close: 12.5, volume: 50 },
      { close: 12, volume: 50 },
    ];
    const out = computeLineDeltaVolume(bars);
    let sum = 0;
    for (const v of out) {
      if (v !== null) sum += v;
    }
    expect(sum).toBe(200);
  });
});
