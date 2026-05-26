import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTroughDetector,
  applyLineTroughDetectorPopulationStdDev,
  applyLineTroughDetectorSma,
  classifyLineTroughDetectorZone,
  computeLineTroughDetector,
  computeLineTroughDetectorLayout,
  describeLineTroughDetectorChart,
  getLineTroughDetectorFinitePoints,
  normalizeLineTroughDetectorLength,
  normalizeLineTroughDetectorThreshFactor,
  runLineTroughDetector,
  DEFAULT_CHART_LINE_TROUGH_DETECTOR_LENGTH,
  DEFAULT_CHART_LINE_TROUGH_DETECTOR_THRESH_FACTOR,
} from './chart-line-trough-detector';
import type { ChartLineTroughDetectorPoint } from './chart-line-trough-detector';

const constClose = (
  count: number,
  K: number,
): ChartLineTroughDetectorPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

// [0, 1, 0, 1, ...] -- even-index inner bars are local minima.
const alternating = (count: number): ChartLineTroughDetectorPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i % 2 === 0 ? 0 : 1,
  }));

describe('getLineTroughDetectorFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineTroughDetectorFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineTroughDetectorFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineTroughDetectorFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineTroughDetectorFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineTroughDetectorFinitePoints([
      null as unknown as ChartLineTroughDetectorPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineTroughDetectorLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineTroughDetectorLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineTroughDetectorLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineTroughDetectorLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineTroughDetectorThreshFactor', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineTroughDetectorThreshFactor(undefined, 1)).toBe(1);
  });

  it('accepts zero', () => {
    expect(normalizeLineTroughDetectorThreshFactor(0, 1)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineTroughDetectorThreshFactor(-1, 1)).toBe(1);
  });

  it('accepts fractional values', () => {
    expect(normalizeLineTroughDetectorThreshFactor(0.5, 1)).toBe(0.5);
  });
});

describe('applyLineTroughDetectorSma', () => {
  it('emits null for warmup bars', () => {
    const out = applyLineTroughDetectorSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineTroughDetectorSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('applyLineTroughDetectorPopulationStdDev', () => {
  it('stdDev of constant K is 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const values = Array(10).fill(K);
      const means = applyLineTroughDetectorSma(values, 4);
      const out = applyLineTroughDetectorPopulationStdDev(values, means, 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });
});

describe('computeLineTroughDetector', () => {
  it('returns empty for null', () => {
    const ch = computeLineTroughDetector(null);
    expect(ch.mean).toEqual([]);
    expect(ch.stdDev).toEqual([]);
    expect(ch.threshold).toEqual([]);
    expect(ch.trough).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineTroughDetector([]);
    expect(ch.trough).toEqual([]);
  });

  it('nulls boundary bars (i == 0 and i == n - 1)', () => {
    const closes = Array(30).fill(10);
    const ch = computeLineTroughDetector(closes, { length: 14 });
    expect(ch.trough[0]).toBe(null);
    expect(ch.trough[29]).toBe(null);
  });

  it('CONST close yields trough = 0 at every valid bar', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(30).fill(K);
      const ch = computeLineTroughDetector(closes, {
        length: 5,
        threshFactor: 1,
      });
      for (let i = 5; i < 29; i += 1) {
        expect(ch.trough[i]).toBe(0);
      }
    }
  });

  it('ALTERNATING with threshFactor = 0 fires trough on even-index bars', () => {
    // close = [0, 1, 0, 1, ..., 0, 1]. Bar at even i
    // (length - 1 <= i < n - 1) has close = 0 and neighbours 1;
    // SMA(close, 4) ~ 0.5, threshold = 0.5, 0 < 0.5 => trough.
    const closes = alternating(20).map((p) => p.close);
    const ch = computeLineTroughDetector(closes, {
      length: 4,
      threshFactor: 0,
    });
    for (let i = 4; i < 19; i += 1) {
      // Even-index bars (close = 0) should be troughs.
      if (i % 2 === 0) {
        expect(ch.trough[i]).toBe(1);
      } else {
        expect(ch.trough[i]).toBe(0);
      }
    }
  });

  it('output length matches input length', () => {
    const closes = Array(30).fill(10);
    const ch = computeLineTroughDetector(closes, { length: 14 });
    expect(ch.trough.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = Array(30).fill(10);
    const snap = closes.slice();
    computeLineTroughDetector(closes, { length: 14 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default)', () => {
    const closes = Array(30).fill(10);
    const ch = computeLineTroughDetector(closes, {
      length: Number.NaN,
      threshFactor: 1,
    });
    // CONST close gives threshold = K, close = K, no trough.
    expect(ch.trough[15]).toBe(0);
  });
});

describe('classifyLineTroughDetectorZone', () => {
  it('classifies trough when value == 1', () => {
    expect(classifyLineTroughDetectorZone(1)).toBe('trough');
  });

  it('classifies no-trough when value == 0', () => {
    expect(classifyLineTroughDetectorZone(0)).toBe('no-trough');
  });

  it('returns none for null', () => {
    expect(classifyLineTroughDetectorZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineTroughDetectorZone(Number.NaN)).toBe('none');
  });
});

describe('runLineTroughDetector', () => {
  it('marks ok=false for fewer than length + 2 points', () => {
    const run = runLineTroughDetector(constClose(15, 10), { length: 14 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with length + 2 points', () => {
    const run = runLineTroughDetector(constClose(16, 10), { length: 14 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineTroughDetector(constClose(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_TROUGH_DETECTOR_LENGTH);
    expect(run.threshFactor).toBe(
      DEFAULT_CHART_LINE_TROUGH_DETECTOR_THRESH_FACTOR,
    );
  });

  it('respects explicit options', () => {
    const run = runLineTroughDetector(constClose(30, 10), {
      length: 7,
      threshFactor: 0.5,
    });
    expect(run.length).toBe(7);
    expect(run.threshFactor).toBe(0.5);
  });

  it('sorts by x', () => {
    const data: ChartLineTroughDetectorPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineTroughDetector(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as no-trough', () => {
    const run = runLineTroughDetector(constClose(30, 10), { length: 5 });
    // bar 0 and bar 29 are none (boundaries); bars 1..3 are none
    // (SMA warmup, threshold null); bars 4..28 are no-trough (CONST
    // never triggers).
    expect(run.noTroughCount).toBe(25);
  });

  it('troughCount > 0 for ALTERNATING with threshFactor = 0', () => {
    const run = runLineTroughDetector(alternating(20), {
      length: 4,
      threshFactor: 0,
    });
    expect(run.troughCount).toBeGreaterThan(0);
  });
});

describe('computeLineTroughDetectorLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineTroughDetectorLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineTroughDetectorLayout({
      data: constClose(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineTroughDetectorLayout({
      data: constClose(30, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above trough', () => {
    const layout = computeLineTroughDetectorLayout({
      data: constClose(30, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.troughTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineTroughDetectorLayout({
      data: constClose(30, 10),
      panelGap: 24,
    });
    expect(layout.troughTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineTroughDetectorLayout({
      data: constClose(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a trough path and markers (skipping warmup)', () => {
    const layout = computeLineTroughDetectorLayout({
      data: constClose(30, 10),
      length: 5,
    });
    // Valid trough bars are 4..28 = 25 bars.
    expect(layout.markers.length).toBe(25);
  });

  it('troughMin and troughMax are 0 and 1', () => {
    const layout = computeLineTroughDetectorLayout({
      data: constClose(30, 10),
    });
    expect(layout.troughMin).toBe(0);
    expect(layout.troughMax).toBe(1);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineTroughDetectorLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTroughDetectorChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineTroughDetectorChart([])).toBe('No data');
  });

  it('mentions Trough Detector', () => {
    const desc = describeLineTroughDetectorChart(constClose(30, 10));
    expect(desc).toContain('Trough Detector');
  });

  it('mentions the formula', () => {
    const desc = describeLineTroughDetectorChart(constClose(30, 10));
    expect(desc).toContain('threshFactor * populationStdDev');
  });

  it('reports the length and threshFactor', () => {
    const desc = describeLineTroughDetectorChart(constClose(30, 10), {
      length: 7,
      threshFactor: 0.5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('threshFactor 0.5');
  });
});

describe('<ChartLineTroughDetector />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineTroughDetector data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-trough-detector-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Trough Detector');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-thresh-factor', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={7}
        threshFactor={0.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trough-detector"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-thresh-factor')).toBe('0.5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trough-detector"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trough-detector-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Trough Detector');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="trough"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="trough"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'trough',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        hiddenSeries={['trough']}
      />,
    );
    const button = container.querySelector('[data-series-id="trough"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides trough line when controlled hidden', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        hiddenSeries={['trough']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-trough-detector-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trough-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trough-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trough-detector-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trough-detector-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-legend"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatTrough', () => {
    const fmt = (v: number) => `[T:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        formatTrough={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trough-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[T:\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trough-detector"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trough-detector"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-trough-detector-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the trough line by default', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        defaultHiddenSeries={['trough']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trough-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineTroughDetector data={constClose(30, 10)} length={5} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trough-detector-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineTroughDetector
        data={constClose(30, 10)}
        length={5}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trough-detector-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-trough-detector-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Trough Detector integration', () => {
  it('CONST close yields trough = 0 across (K, length, threshFactor)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 5, 7]) {
        for (const factor of [0, 0.5, 1, 2]) {
          const closes = Array(L + 5).fill(K);
          const ch = computeLineTroughDetector(closes, {
            length: L,
            threshFactor: factor,
          });
          for (let i = L - 1; i < closes.length - 1; i += 1) {
            expect(ch.trough[i]).toBe(0);
          }
        }
      }
    }
  });
});
