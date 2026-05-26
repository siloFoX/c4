import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSpikeDetector,
  classifyLineSpikeDetectorZone,
  computeLineSpikeDetector,
  computeLineSpikeDetectorDelta,
  computeLineSpikeDetectorLayout,
  describeLineSpikeDetectorChart,
  getLineSpikeDetectorFinitePoints,
  normalizeLineSpikeDetectorLength,
  runLineSpikeDetector,
  DEFAULT_CHART_LINE_SPIKE_DETECTOR_LENGTH,
} from './chart-line-spike-detector';
import type { ChartLineSpikeDetectorPoint } from './chart-line-spike-detector';

const constClose = (
  count: number,
  K: number,
): ChartLineSpikeDetectorPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const alternating = (count: number): ChartLineSpikeDetectorPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i % 2 === 0 ? 0 : 1,
  }));

describe('getLineSpikeDetectorFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineSpikeDetectorFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineSpikeDetectorFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineSpikeDetectorFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineSpikeDetectorFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineSpikeDetectorFinitePoints([
      null as unknown as ChartLineSpikeDetectorPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineSpikeDetectorLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineSpikeDetectorLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineSpikeDetectorLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineSpikeDetectorLength(1, 14)).toBe(14);
  });
});

describe('computeLineSpikeDetectorDelta', () => {
  it('emits null at bar 0', () => {
    const delta = computeLineSpikeDetectorDelta([1, 2, 3]);
    expect(delta[0]).toBe(null);
  });

  it('computes close[i] - close[i - 1]', () => {
    const delta = computeLineSpikeDetectorDelta([1, 3, 6, 10]);
    expect(delta[1]).toBe(2);
    expect(delta[2]).toBe(3);
    expect(delta[3]).toBe(4);
  });

  it('CONST close yields delta = 0 at every i >= 1', () => {
    const delta = computeLineSpikeDetectorDelta(Array(10).fill(5));
    expect(delta[0]).toBe(null);
    for (let i = 1; i < 10; i += 1) {
      expect(delta[i]).toBe(0);
    }
  });

  it('ALTERNATING [0,1,0,1,...] yields delta = +/-1 alternating', () => {
    const delta = computeLineSpikeDetectorDelta([0, 1, 0, 1, 0, 1]);
    expect(delta[0]).toBe(null);
    expect(delta[1]).toBe(1);
    expect(delta[2]).toBe(-1);
    expect(delta[3]).toBe(1);
    expect(delta[4]).toBe(-1);
    expect(delta[5]).toBe(1);
  });
});

describe('computeLineSpikeDetector', () => {
  it('returns empty for null', () => {
    expect(computeLineSpikeDetector(null)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(computeLineSpikeDetector([])).toEqual([]);
  });

  it('nulls warmup bars (i < length)', () => {
    const closes = alternating(30).map((p) => p.close);
    const out = computeLineSpikeDetector(closes, { length: 4 });
    for (let i = 0; i < 4; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[4]).toBe('number');
  });

  it('CONST close yields spike = null (singular)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(30).fill(K);
      const out = computeLineSpikeDetector(closes, { length: 5 });
      for (let i = 0; i < 30; i += 1) {
        expect(out[i]).toBe(null);
      }
    }
  });

  it('ALTERNATING with even length yields spike = +/-1 bit-exact', () => {
    for (const L of [4, 6, 10, 14, 20]) {
      const closes = alternating(L * 3).map((p) => p.close);
      const out = computeLineSpikeDetector(closes, { length: L });
      for (let i = L; i < closes.length; i += 1) {
        const v = out[i];
        if (v == null) {
          continue;
        }
        // Even-bar deltas are -1 (close went from 1 to 0), odd-bar
        // deltas are +1 (close went from 0 to 1). spike = delta.
        const expected = i % 2 === 0 ? -1 : 1;
        expect(v).toBe(expected);
      }
    }
  });

  it('output length matches input length', () => {
    const closes = alternating(30).map((p) => p.close);
    const out = computeLineSpikeDetector(closes, { length: 5 });
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = alternating(30).map((p) => p.close);
    const snap = closes.slice();
    computeLineSpikeDetector(closes, { length: 5 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default)', () => {
    const closes = alternating(30).map((p) => p.close);
    const out = computeLineSpikeDetector(closes, { length: Number.NaN });
    // Default length=14 (even), so spike at i=14 should be +/-1.
    const v = out[14];
    expect(v === 1 || v === -1).toBe(true);
  });

  it('null close propagates through the window', () => {
    const closes: Array<number | null> = alternating(30).map((p) => p.close);
    closes[15] = null;
    const out = computeLineSpikeDetector(closes, { length: 5 });
    // Bar 15 delta is null -> nulls the spike at bars whose window
    // includes bar 15.
    expect(out[15]).toBe(null);
  });
});

describe('classifyLineSpikeDetectorZone', () => {
  it('classifies extreme-up at >= 3', () => {
    expect(classifyLineSpikeDetectorZone(3)).toBe('extreme-up');
    expect(classifyLineSpikeDetectorZone(5)).toBe('extreme-up');
  });

  it('classifies spike-up at 1.5..3', () => {
    expect(classifyLineSpikeDetectorZone(2)).toBe('spike-up');
    expect(classifyLineSpikeDetectorZone(1.5)).toBe('spike-up');
  });

  it('classifies normal at 0..1.5 (positive)', () => {
    expect(classifyLineSpikeDetectorZone(0.5)).toBe('normal');
  });

  it('classifies at when value == 0', () => {
    expect(classifyLineSpikeDetectorZone(0)).toBe('at');
  });

  it('classifies normal at -1.5..0', () => {
    expect(classifyLineSpikeDetectorZone(-0.5)).toBe('normal');
  });

  it('classifies spike-down at -3..-1.5', () => {
    expect(classifyLineSpikeDetectorZone(-2)).toBe('spike-down');
  });

  it('classifies extreme-down at <= -3', () => {
    expect(classifyLineSpikeDetectorZone(-3)).toBe('extreme-down');
    expect(classifyLineSpikeDetectorZone(-5)).toBe('extreme-down');
  });

  it('returns none for null', () => {
    expect(classifyLineSpikeDetectorZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineSpikeDetectorZone(Number.NaN)).toBe('none');
  });
});

describe('runLineSpikeDetector', () => {
  it('marks ok=false for fewer than length+1 points', () => {
    const run = runLineSpikeDetector(alternating(5), { length: 5 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineSpikeDetector(alternating(6), { length: 5 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineSpikeDetector(alternating(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_SPIKE_DETECTOR_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineSpikeDetector(alternating(30), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineSpikeDetectorPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineSpikeDetector(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies all as none (singular)', () => {
    const run = runLineSpikeDetector(constClose(30, 5));
    expect(run.noneCount).toBe(30);
  });

  it('ALTERNATING with length=4 yields normal classifications (|Z| = 1)', () => {
    const run = runLineSpikeDetector(alternating(30), { length: 4 });
    // |Z| = 1 falls in `normal` (0 < |Z| < 1.5)
    expect(run.normalCount).toBe(30 - 4);
  });

  it('exposes spikeFinal as the last finite reading', () => {
    const run = runLineSpikeDetector(alternating(30), { length: 4 });
    expect(run.spikeFinal === 1 || run.spikeFinal === -1).toBe(true);
  });

  it('spikeFinal is null when there is no data', () => {
    const run = runLineSpikeDetector([]);
    expect(run.spikeFinal).toBe(null);
  });
});

describe('computeLineSpikeDetectorLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineSpikeDetectorLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineSpikeDetectorLayout({
      data: alternating(30),
      length: 4,
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineSpikeDetectorLayout({
      data: alternating(30),
      length: 4,
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above spike', () => {
    const layout = computeLineSpikeDetectorLayout({
      data: alternating(30),
      length: 4,
    });
    expect(layout.priceBottom).toBeLessThan(layout.spikeTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineSpikeDetectorLayout({
      data: alternating(30),
      length: 4,
      panelGap: 24,
    });
    expect(layout.spikeTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineSpikeDetectorLayout({
      data: alternating(30),
      length: 4,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a spike path and markers (skipping warmup)', () => {
    const layout = computeLineSpikeDetectorLayout({
      data: alternating(30),
      length: 4,
    });
    expect(layout.markers.length).toBe(30 - 4);
  });

  it('zero baseline is inside the spike panel', () => {
    const layout = computeLineSpikeDetectorLayout({
      data: alternating(30),
      length: 4,
    });
    expect(layout.zeroBaselineY).toBeGreaterThanOrEqual(layout.spikeTop);
    expect(layout.zeroBaselineY).toBeLessThanOrEqual(layout.spikeBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineSpikeDetectorLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineSpikeDetectorChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineSpikeDetectorChart([])).toBe('No data');
  });

  it('mentions Price Spike Detector', () => {
    const desc = describeLineSpikeDetectorChart(alternating(30), {
      length: 4,
    });
    expect(desc).toContain('Price Spike Detector');
  });

  it('mentions the formula', () => {
    const desc = describeLineSpikeDetectorChart(alternating(30), {
      length: 4,
    });
    expect(desc).toContain('(delta - meanDelta)');
    expect(desc).toContain('stdDevDelta');
  });

  it('reports the length', () => {
    const desc = describeLineSpikeDetectorChart(alternating(30), {
      length: 7,
    });
    expect(desc).toContain('length 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineSpikeDetectorChart(alternating(30), {
      length: 4,
    });
    expect(desc).toMatch(/(1\.0000|-1\.0000)/);
  });
});

describe('<ChartLineSpikeDetector />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineSpikeDetector data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-spike-detector-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Price Spike Detector',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-spike-detector"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes data-spike-final', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-spike-detector"]',
    );
    const final = root?.getAttribute('data-spike-final');
    expect(final === '1' || final === '-1').toBe(true);
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-spike-detector"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-spike-detector-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Price Spike Detector');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="spike"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="spike"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'spike',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        hiddenSeries={['spike']}
      />,
    );
    const button = container.querySelector('[data-series-id="spike"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides spike line when controlled hidden', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        hiddenSeries={['spike']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-spike-detector-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-spike-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-spike-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-spike-detector-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-spike-detector-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-legend"]',
      ),
    ).toBe(null);
  });

  it('hides baseline when showBaseline is false', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        showBaseline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-baseline"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatSpike', () => {
    const fmt = (v: number) => `[Z:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        formatSpike={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-spike-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[Z:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-spike-detector"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-spike-detector"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-spike-detector-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the spike line by default', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        defaultHiddenSeries={['spike']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-spike-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineSpikeDetector data={alternating(30)} length={4} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-spike-detector-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineSpikeDetector
        data={alternating(30)}
        length={4}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-spike-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-spike-detector-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Spike Detector integration', () => {
  it('CONST close yields all-null spike (singular)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(30).fill(K);
      const out = computeLineSpikeDetector(closes, { length: 5 });
      for (let i = 0; i < 30; i += 1) {
        expect(out[i]).toBe(null);
      }
    }
  });

  it('ALTERNATING with even length yields spike = +/-1 across lengths', () => {
    for (const L of [4, 6, 10, 14, 20]) {
      const closes = alternating(L * 3).map((p) => p.close);
      const out = computeLineSpikeDetector(closes, { length: L });
      for (let i = L; i < closes.length; i += 1) {
        const v = out[i];
        if (v == null) continue;
        const expected = i % 2 === 0 ? -1 : 1;
        expect(v).toBe(expected);
      }
    }
  });
});
