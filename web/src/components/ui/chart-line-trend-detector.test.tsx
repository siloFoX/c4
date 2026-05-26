import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTrendDetector,
  applyLineTrendDetectorSma,
  classifyLineTrendDetectorZone,
  computeLineTrendDetector,
  computeLineTrendDetectorLayout,
  describeLineTrendDetectorChart,
  detectLineTrendDetectorCrosses,
  getLineTrendDetectorFinitePoints,
  normalizeLineTrendDetectorLength,
  normalizeLineTrendDetectorSlopeLookback,
  normalizeLineTrendDetectorThreshold,
  runLineTrendDetector,
  DEFAULT_CHART_LINE_TREND_DETECTOR_LENGTH,
} from './chart-line-trend-detector';
import type { ChartLineTrendDetectorPoint } from './chart-line-trend-detector';

const constClose = (
  count: number,
  K: number,
): ChartLineTrendDetectorPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineTrendDetectorPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineTrendDetectorPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineTrendDetectorFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineTrendDetectorFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const result = getLineTrendDetectorFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineTrendDetectorFinitePoints([
      null as unknown as ChartLineTrendDetectorPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineTrendDetectorLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineTrendDetectorLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineTrendDetectorLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineTrendDetectorSlopeLookback', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineTrendDetectorSlopeLookback(undefined, 5)).toBe(5);
  });

  it('accepts 1', () => {
    expect(normalizeLineTrendDetectorSlopeLookback(1, 5)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineTrendDetectorSlopeLookback(0, 5)).toBe(5);
  });
});

describe('normalizeLineTrendDetectorThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineTrendDetectorThreshold(undefined, 0.1)).toBe(0.1);
  });

  it('accepts zero', () => {
    expect(normalizeLineTrendDetectorThreshold(0, 0.1)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineTrendDetectorThreshold(-1, 0.1)).toBe(0.1);
  });
});

describe('applyLineTrendDetectorSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineTrendDetectorSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup region is null', () => {
    const out = applyLineTrendDetectorSma([1, 2, 3, 4, 5], 4);
    expect(out[0]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(2.5);
  });
});

describe('computeLineTrendDetector', () => {
  it('returns empty for null', () => {
    const ch = computeLineTrendDetector(null);
    expect(ch.slope).toEqual([]);
  });

  it('CONST close yields slope = 0 and regime = 0 bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const closes = Array(15).fill(K);
      const ch = computeLineTrendDetector(closes, {
        length: 4,
        slopeLookback: 3,
        threshold: 0.1,
      });
      for (let i = 6; i < 15; i += 1) {
        expect(ch.slope[i]).toBe(0);
        expect(ch.regime[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP close yields slope = 1 bit-exact', () => {
    const closes = Array.from({ length: 15 }, (_, i) => i + 1);
    const ch = computeLineTrendDetector(closes, {
      length: 4,
      slopeLookback: 3,
      threshold: 0.1,
    });
    // SMA at i and at i-3 differ by exactly 3 / 3 = 1 per bar.
    for (let i = 6; i < 15; i += 1) {
      expect(ch.slope[i]).toBe(1);
      expect(ch.regime[i]).toBe(1);
    }
  });

  it('LINEAR DOWN close yields slope = -1 bit-exact', () => {
    const closes = Array.from({ length: 15 }, (_, i) => 100 - i);
    const ch = computeLineTrendDetector(closes, {
      length: 4,
      slopeLookback: 3,
      threshold: 0.1,
    });
    for (let i = 6; i < 15; i += 1) {
      expect(ch.slope[i]).toBe(-1);
      expect(ch.regime[i]).toBe(-1);
    }
  });

  it('threshold above slope magnitude reverts to ranging regime', () => {
    const closes = Array.from({ length: 15 }, (_, i) => i + 1);
    const ch = computeLineTrendDetector(closes, {
      length: 4,
      slopeLookback: 3,
      threshold: 2, // slope = 1 < 2 -> ranging
    });
    for (let i = 6; i < 15; i += 1) {
      expect(ch.slope[i]).toBe(1);
      expect(ch.regime[i]).toBe(0);
    }
  });

  it('warmup region is null', () => {
    const closes = Array(15).fill(5);
    const ch = computeLineTrendDetector(closes, {
      length: 4,
      slopeLookback: 3,
    });
    expect(ch.slope[0]).toBe(null);
    expect(ch.slope[5]).toBe(null);
    expect(ch.slope[6]).toBe(0);
  });

  it('output length matches input length', () => {
    const closes = Array(15).fill(5);
    const ch = computeLineTrendDetector(closes, { length: 4 });
    expect(ch.slope.length).toBe(15);
    expect(ch.regime.length).toBe(15);
    expect(ch.mean.length).toBe(15);
  });

  it('does not mutate input', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8];
    const snap = closes.slice();
    computeLineTrendDetector(closes, { length: 4 });
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineTrendDetectorZone', () => {
  it('classifies uptrend', () => {
    expect(classifyLineTrendDetectorZone(1)).toBe('uptrend');
  });

  it('classifies downtrend', () => {
    expect(classifyLineTrendDetectorZone(-1)).toBe('downtrend');
  });

  it('classifies ranging', () => {
    expect(classifyLineTrendDetectorZone(0)).toBe('ranging');
  });

  it('returns none for null', () => {
    expect(classifyLineTrendDetectorZone(null)).toBe('none');
  });
});

describe('detectLineTrendDetectorCrosses', () => {
  it('returns [null, null] for warmup', () => {
    expect(detectLineTrendDetectorCrosses([null, null])).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering uptrend from ranging', () => {
    const ev = detectLineTrendDetectorCrosses([null, 0, 1]);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering downtrend from ranging', () => {
    const ev = detectLineTrendDetectorCrosses([null, 0, -1]);
    expect(ev[2]).toBe('down');
  });

  it('no cross when staying in same regime', () => {
    const ev = detectLineTrendDetectorCrosses([null, 1, 1]);
    expect(ev[2]).toBe(null);
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineTrendDetectorCrosses([null, 1]);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineTrendDetector', () => {
  it('marks ok=false for short data', () => {
    const run = runLineTrendDetector(constClose(5, 10), {
      length: 4,
      slopeLookback: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineTrendDetector(constClose(7, 10), {
      length: 4,
      slopeLookback: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineTrendDetector(constClose(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_TREND_DETECTOR_LENGTH);
    expect(run.slopeLookback).toBe(5);
    expect(run.threshold).toBe(0.1);
  });

  it('respects explicit options', () => {
    const run = runLineTrendDetector(constClose(30, 10), {
      length: 7,
      slopeLookback: 3,
      threshold: 0.5,
    });
    expect(run.length).toBe(7);
    expect(run.slopeLookback).toBe(3);
    expect(run.threshold).toBe(0.5);
  });

  it('sorts by x', () => {
    const data: ChartLineTrendDetectorPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineTrendDetector(data, {
      length: 2,
      slopeLookback: 1,
    });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as ranging', () => {
    const run = runLineTrendDetector(constClose(20, 10), {
      length: 4,
      slopeLookback: 3,
    });
    expect(run.rangingCount).toBeGreaterThan(0);
    expect(run.uptrendCount).toBe(0);
    expect(run.downtrendCount).toBe(0);
  });

  it('LINEAR UP classifies post-warmup as uptrend', () => {
    const run = runLineTrendDetector(linearUp(20), {
      length: 4,
      slopeLookback: 3,
      threshold: 0.1,
    });
    expect(run.uptrendCount).toBeGreaterThan(0);
    expect(run.downtrendCount).toBe(0);
  });

  it('LINEAR DOWN classifies post-warmup as downtrend', () => {
    const run = runLineTrendDetector(linearDown(20), {
      length: 4,
      slopeLookback: 3,
      threshold: 0.1,
    });
    expect(run.downtrendCount).toBeGreaterThan(0);
    expect(run.uptrendCount).toBe(0);
  });
});

describe('computeLineTrendDetectorLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineTrendDetectorLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineTrendDetectorLayout({
      data: linearUp(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above slope', () => {
    const layout = computeLineTrendDetectorLayout({
      data: linearUp(30),
    });
    expect(layout.priceBottom).toBeLessThan(layout.slopeTop);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineTrendDetectorLayout({
      data: linearUp(30),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('threshold lines within bounds', () => {
    const layout = computeLineTrendDetectorLayout({
      data: linearUp(30),
    });
    expect(layout.highThresholdY).toBeGreaterThanOrEqual(layout.slopeTop);
    expect(layout.highThresholdY).toBeLessThanOrEqual(layout.slopeBottom);
    expect(layout.lowThresholdY).toBeGreaterThanOrEqual(layout.slopeTop);
    expect(layout.lowThresholdY).toBeLessThanOrEqual(layout.slopeBottom);
  });

  it('zero line within bounds', () => {
    const layout = computeLineTrendDetectorLayout({
      data: linearUp(30),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.slopeTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.slopeBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineTrendDetectorLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTrendDetectorChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineTrendDetectorChart([])).toBe('No data');
  });

  it('mentions Trend Detector', () => {
    const desc = describeLineTrendDetectorChart(linearUp(30));
    expect(desc).toContain('Trend Detector');
  });

  it('reports parameters', () => {
    const desc = describeLineTrendDetectorChart(linearUp(30), {
      length: 7,
      slopeLookback: 3,
      threshold: 0.5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('slopeLookback 3');
    expect(desc).toContain('threshold 0.5');
  });
});

describe('<ChartLineTrendDetector />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineTrendDetector data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-trend-detector-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Trend Detector');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTrendDetector data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineTrendDetector
        data={linearUp(30)}
        length={7}
        slopeLookback={3}
        threshold={0.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-detector"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-slope-lookback')).toBe('3');
    expect(root?.getAttribute('data-threshold')).toBe('0.5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-detector"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trend-detector-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Trend Detector');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="slope"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTrendDetector
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="slope"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'slope',
      hidden: true,
    });
  });

  it('hides slope when controlled hidden', () => {
    const { container } = render(
      <ChartLineTrendDetector
        data={linearUp(30)}
        hiddenSeries={['slope']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-line"]',
      ),
    ).toBe(null);
  });

  it('renders config badge by default', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-high-threshold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineTrendDetector
        data={linearUp(30)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-high-threshold-line"]',
      ),
    ).toBe(null);
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineTrendDetector
        data={linearUp(30)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineTrendDetector
        data={linearUp(30)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineTrendDetector
        data={linearUp(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineTrendDetector
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-detector"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-trend-detector-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the slope line by default', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineTrendDetector data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineTrendDetector
        data={linearUp(30)}
        defaultHiddenSeries={['slope']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-detector-line"]',
      ),
    ).toBe(null);
  });
});

describe('Trend Detector integration', () => {
  it('CONST close yields slope = 0, regime = 0 across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const closes = Array(L + 10).fill(K);
        const ch = computeLineTrendDetector(closes, {
          length: L,
          slopeLookback: 3,
          threshold: 0.1,
        });
        const minBar = L - 1 + 3;
        for (let i = minBar; i < closes.length; i += 1) {
          expect(ch.slope[i]).toBe(0);
          expect(ch.regime[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR UP yields slope = 1, regime = 1 across (length, slopeLookback)', () => {
    for (const L of [3, 4, 7]) {
      for (const S of [2, 3, 5]) {
        const closes = Array.from({ length: L + S + 5 }, (_, i) => i + 1);
        const ch = computeLineTrendDetector(closes, {
          length: L,
          slopeLookback: S,
          threshold: 0.1,
        });
        const minBar = L - 1 + S;
        for (let i = minBar; i < closes.length; i += 1) {
          expect(ch.slope[i]).toBe(1);
          expect(ch.regime[i]).toBe(1);
        }
      }
    }
  });

  it('LINEAR DOWN yields slope = -1, regime = -1', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    const ch = computeLineTrendDetector(closes, {
      length: 4,
      slopeLookback: 3,
      threshold: 0.1,
    });
    for (let i = 6; i < 20; i += 1) {
      expect(ch.slope[i]).toBe(-1);
      expect(ch.regime[i]).toBe(-1);
    }
  });
});
