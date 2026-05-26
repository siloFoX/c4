import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTrendQuality,
  classifyLineTrendQualityZone,
  computeLineTrendQuality,
  computeLineTrendQualityLayout,
  describeLineTrendQualityChart,
  getLineTrendQualityFinitePoints,
  normalizeLineTrendQualityLength,
  normalizeLineTrendQualityThreshold,
  runLineTrendQuality,
  DEFAULT_CHART_LINE_TREND_QUALITY_LOOKBACK,
  DEFAULT_CHART_LINE_TREND_QUALITY_STRONG_THRESHOLD,
} from './chart-line-trend-quality';
import type {
  ChartLineTrendQualityPoint,
} from './chart-line-trend-quality';

const constFlat = (length: number, K: number): ChartLineTrendQualityPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: K }));

const risingByS = (length: number, S = 1, c0 = 100): ChartLineTrendQualityPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: c0 + S * i }));

const fallingByS = (length: number, S = 1, c0 = 100): ChartLineTrendQualityPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: c0 - S * i }));

const zigzag = (length: number, amplitude = 10, baseline = 100): ChartLineTrendQualityPoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: baseline + (i % 2 === 0 ? amplitude : -amplitude),
  }));

describe('getLineTrendQualityFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineTrendQualityFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineTrendQualityFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineTrendQualityFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineTrendQualityFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineTrendQualityFinitePoints([
      null as unknown as ChartLineTrendQualityPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineTrendQualityLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineTrendQualityLength(undefined, 14)).toBe(14);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineTrendQualityLength(Number.NaN, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineTrendQualityLength(7.9, 14)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineTrendQualityLength(1, 14)).toBe(14);
  });

  it('accepts the minimum length of 2', () => {
    expect(normalizeLineTrendQualityLength(2, 14)).toBe(2);
  });
});

describe('normalizeLineTrendQualityThreshold', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineTrendQualityThreshold(undefined, 70)).toBe(70);
  });

  it('clamps below 0 to 0', () => {
    expect(normalizeLineTrendQualityThreshold(-5, 70)).toBe(0);
  });

  it('clamps above 100 to 100', () => {
    expect(normalizeLineTrendQualityThreshold(150, 70)).toBe(100);
  });

  it('accepts in-range values', () => {
    expect(normalizeLineTrendQualityThreshold(50, 70)).toBe(50);
  });
});

describe('computeLineTrendQuality', () => {
  it('returns an empty array for null', () => {
    expect(computeLineTrendQuality(null, 14)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineTrendQuality([], 14)).toEqual([]);
  });

  it('nulls warmup bars (i < lookback)', () => {
    const closes = risingByS(30, 1).map((p) => p.close);
    const out = computeLineTrendQuality(closes, 14);
    for (let i = 0; i < 14; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[14]).toBe('number');
  });

  it('RISING_BY_S yields TQI = +100 bit-exact at every bar past warmup', () => {
    for (const S of [1, 2, 5, 10, 0.5]) {
      const closes = risingByS(30, S).map((p) => p.close);
      const out = computeLineTrendQuality(closes, 14);
      for (let i = 14; i < 30; i += 1) {
        expect(out[i]).toBe(100);
      }
    }
  });

  it('FALLING_BY_S yields TQI = -100 bit-exact at every bar past warmup', () => {
    for (const S of [1, 2, 5, 10, 0.5]) {
      const closes = fallingByS(30, S).map((p) => p.close);
      const out = computeLineTrendQuality(closes, 14);
      for (let i = 14; i < 30; i += 1) {
        expect(out[i]).toBe(-100);
      }
    }
  });

  it('CONST_FLAT yields all nulls (singular path length = 0)', () => {
    for (const K of [0, 1, 5, 10, 100, -3]) {
      const closes = constFlat(30, K).map((p) => p.close);
      const out = computeLineTrendQuality(closes, 14);
      for (let i = 0; i < 30; i += 1) {
        expect(out[i]).toBe(null);
      }
    }
  });

  it('ZIGZAG yields small TQI (close to 0)', () => {
    // alternating ±A around baseline: netChange = 0 (for even lookback),
    // sumAbs = 2*A * lookback -> TQI = 0
    const closes = zigzag(30, 10).map((p) => p.close);
    const out = computeLineTrendQuality(closes, 14);
    // 14 even -> netChange = 0 -> TQI = 0
    expect(out[14]).toBe(0);
    expect(out[20]).toBe(0);
  });

  it('output length matches input length', () => {
    const closes = risingByS(30, 1).map((p) => p.close);
    const out = computeLineTrendQuality(closes, 14);
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = risingByS(30, 1).map((p) => p.close);
    const snap = closes.slice();
    computeLineTrendQuality(closes, 14);
    expect(closes).toEqual(snap);
  });

  it('TQI is bounded in [-100, +100] for any finite input', () => {
    // sumAbs >= |netChange| by triangle inequality, so |TQI| <= 100.
    const closes: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      closes.push(100 + Math.sin(i / 3) * 5 + (i % 7));
    }
    const out = computeLineTrendQuality(closes, 14);
    for (let i = 14; i < 50; i += 1) {
      const v = out[i];
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('rejects non-finite lookback (uses default)', () => {
    const closes = risingByS(30, 2).map((p) => p.close);
    const out = computeLineTrendQuality(closes, Number.NaN);
    // Default lookback = 14, RISING_BY_S yields 100.
    expect(out[14]).toBe(100);
  });

  it('worked anchor: 3-bar V (5, 10, 5) lookback 2 yields TQI = 0', () => {
    // close = [5, 10, 5], lookback 2:
    // At i=2: netChange = 5 - 5 = 0; sumAbs = |10-5| + |5-10| = 5 + 5 = 10.
    // TQI = 100 * 0 / 10 = 0
    const out = computeLineTrendQuality([5, 10, 5], 2);
    expect(out[2]).toBe(0);
  });
});

describe('classifyLineTrendQualityZone', () => {
  it('classifies strong-up at or above threshold', () => {
    expect(classifyLineTrendQualityZone(75, 70)).toBe('strong-up');
    expect(classifyLineTrendQualityZone(70, 70)).toBe('strong-up');
  });

  it('classifies strong-down at or below negative threshold', () => {
    expect(classifyLineTrendQualityZone(-75, 70)).toBe('strong-down');
    expect(classifyLineTrendQualityZone(-70, 70)).toBe('strong-down');
  });

  it('classifies weak between bands', () => {
    expect(classifyLineTrendQualityZone(50, 70)).toBe('weak');
    expect(classifyLineTrendQualityZone(0, 70)).toBe('weak');
    expect(classifyLineTrendQualityZone(-50, 70)).toBe('weak');
  });

  it('returns none for null', () => {
    expect(classifyLineTrendQualityZone(null, 70)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineTrendQualityZone(Number.NaN, 70)).toBe('none');
  });
});

describe('runLineTrendQuality', () => {
  it('marks ok=false for fewer than lookback+1 points', () => {
    const run = runLineTrendQuality(risingByS(10, 1));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineTrendQuality(risingByS(20, 1));
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineTrendQuality(risingByS(30, 1));
    expect(run.lookback).toBe(DEFAULT_CHART_LINE_TREND_QUALITY_LOOKBACK);
    expect(run.strongThreshold).toBe(
      DEFAULT_CHART_LINE_TREND_QUALITY_STRONG_THRESHOLD,
    );
  });

  it('respects explicit options', () => {
    const run = runLineTrendQuality(risingByS(30, 1), {
      lookback: 7,
      strongThreshold: 50,
    });
    expect(run.lookback).toBe(7);
    expect(run.strongThreshold).toBe(50);
  });

  it('sorts by x', () => {
    const data: ChartLineTrendQualityPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineTrendQuality(data, { lookback: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('RISING_BY_S classifies all post-warmup as strong-up', () => {
    const run = runLineTrendQuality(risingByS(30, 1));
    expect(run.strongUpCount).toBe(30 - 14);
    expect(run.weakCount).toBe(0);
    expect(run.strongDownCount).toBe(0);
  });

  it('FALLING_BY_S classifies all post-warmup as strong-down', () => {
    const run = runLineTrendQuality(fallingByS(30, 1));
    expect(run.strongDownCount).toBe(30 - 14);
    expect(run.weakCount).toBe(0);
    expect(run.strongUpCount).toBe(0);
  });

  it('CONST_FLAT classifies all bars as none', () => {
    const run = runLineTrendQuality(constFlat(30, 5));
    expect(run.noneCount).toBe(30);
    expect(run.strongUpCount).toBe(0);
    expect(run.strongDownCount).toBe(0);
    expect(run.weakCount).toBe(0);
  });

  it('ZIGZAG classifies as weak (TQI = 0)', () => {
    const run = runLineTrendQuality(zigzag(30, 10));
    expect(run.weakCount).toBeGreaterThan(0);
    expect(run.strongUpCount).toBe(0);
    expect(run.strongDownCount).toBe(0);
  });

  it('exposes tqiFinal as the last finite TQI', () => {
    const run = runLineTrendQuality(risingByS(30, 1));
    expect(run.tqiFinal).toBe(100);
  });

  it('tqiFinal is null when there is no data', () => {
    const run = runLineTrendQuality([]);
    expect(run.tqiFinal).toBe(null);
  });
});

describe('computeLineTrendQualityLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineTrendQualityLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineTrendQualityLayout({
      data: risingByS(30, 1),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineTrendQualityLayout({
      data: risingByS(30, 1),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above TQI', () => {
    const layout = computeLineTrendQualityLayout({
      data: risingByS(30, 1),
    });
    expect(layout.priceBottom).toBeLessThan(layout.tqiTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineTrendQualityLayout({
      data: risingByS(30, 1),
      panelGap: 24,
    });
    expect(layout.tqiTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineTrendQualityLayout({
      data: risingByS(30, 1),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a TQI path and markers (skipping warmup)', () => {
    const layout = computeLineTrendQualityLayout({
      data: risingByS(30, 1),
    });
    expect(layout.markers.length).toBe(30 - 14);
  });

  it('zero line is inside the TQI panel', () => {
    const layout = computeLineTrendQualityLayout({
      data: risingByS(30, 1),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.tqiTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.tqiBottom);
  });

  it('strong band lines are inside the TQI panel', () => {
    const layout = computeLineTrendQualityLayout({
      data: risingByS(30, 1),
    });
    expect(layout.strongUpY).toBeGreaterThanOrEqual(layout.tqiTop);
    expect(layout.strongUpY).toBeLessThanOrEqual(layout.tqiBottom);
    expect(layout.strongDownY).toBeGreaterThanOrEqual(layout.tqiTop);
    expect(layout.strongDownY).toBeLessThanOrEqual(layout.tqiBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineTrendQualityLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTrendQualityChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineTrendQualityChart([])).toBe('No data');
  });

  it('mentions Trend Quality Index', () => {
    const desc = describeLineTrendQualityChart(risingByS(30, 1));
    expect(desc).toContain('Trend Quality Index');
  });

  it('mentions the path length', () => {
    const desc = describeLineTrendQualityChart(risingByS(30, 1));
    expect(desc).toContain('path length');
  });

  it('reports the lookback', () => {
    const desc = describeLineTrendQualityChart(risingByS(30, 1), {
      lookback: 7,
    });
    expect(desc).toContain('lookback 7');
  });

  it('reports the final reading', () => {
    const desc = describeLineTrendQualityChart(risingByS(30, 1));
    expect(desc).toContain('100.0000');
  });
});

describe('<ChartLineTrendQuality />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineTrendQuality data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-trend-quality-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Trend Quality Index',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTrendQuality data={risingByS(30, 1)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-lookback', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} lookback={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-quality"]',
    );
    expect(root?.getAttribute('data-lookback')).toBe('7');
  });

  it('exposes data-tqi-final', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-quality"]',
    );
    expect(root?.getAttribute('data-tqi-final')).toBe('100');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-quality"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trend-quality-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Trend Quality Index');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="tqi"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="tqi"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'tqi', hidden: true });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        hiddenSeries={['tqi']}
      />,
    );
    const button = container.querySelector('[data-series-id="tqi"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides TQI line when controlled hidden', () => {
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        hiddenSeries={['tqi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-trend-quality-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-quality-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-quality-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trend-quality-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-trend-quality-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides bands when showBands is false', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-bands"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatTqi', () => {
    const fmt = (v: number) => `[T:${v.toFixed(0)}]`;
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        formatTqi={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[T:-?\d+\]/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-quality"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trend-quality"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-trend-quality-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the TQI line by default', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        defaultHiddenSeries={['tqi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-quality-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineTrendQuality data={risingByS(30, 1)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-quality-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineTrendQuality
        data={risingByS(30, 1)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-trend-quality-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-trend-quality-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Trend Quality integration', () => {
  it('RISING_BY_S yields TQI = +100 bit-exact across many (S, lookback) combos', () => {
    for (const S of [1, 2, 5, 10, 100, 0.5, 0.25]) {
      for (const L of [3, 5, 7, 14, 20]) {
        const closes = risingByS(L + 10, S).map((p) => p.close);
        const out = computeLineTrendQuality(closes, L);
        for (let i = L; i < closes.length; i += 1) {
          expect(out[i]).toBe(100);
        }
      }
    }
  });

  it('FALLING_BY_S yields TQI = -100 bit-exact across many (S, lookback) combos', () => {
    for (const S of [1, 2, 5, 10, 100, 0.5, 0.25]) {
      for (const L of [3, 5, 7, 14, 20]) {
        const closes = fallingByS(L + 10, S).map((p) => p.close);
        const out = computeLineTrendQuality(closes, L);
        for (let i = L; i < closes.length; i += 1) {
          expect(out[i]).toBe(-100);
        }
      }
    }
  });

  it('V-shape (rise then fall to same level) yields TQI = 0 bit-exact at the apex', () => {
    // close = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]
    const closes: number[] = [];
    for (let i = 0; i <= 5; i += 1) closes.push(i);
    for (let i = 4; i >= 0; i -= 1) closes.push(i);
    // At i = 10 (last bar), netChange (over lookback 10) = close[10] - close[0] = 0
    // sumAbs = 10 (5 up steps of 1, 5 down steps of 1)
    // TQI = 0
    const out = computeLineTrendQuality(closes, 10);
    expect(out[10]).toBe(0);
  });
});
