import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHlPct,
  applyLineHlPctSma,
  classifyLineHlPctZone,
  computeLineHlPct,
  computeLineHlPctLayout,
  computeLineHlPctRawSeries,
  describeLineHlPctChart,
  detectLineHlPctCrosses,
  getLineHlPctFinitePoints,
  normalizeLineHlPctLength,
  normalizeLineHlPctVolatilityThreshold,
  runLineHlPct,
  DEFAULT_CHART_LINE_HL_PCT_LENGTH,
  DEFAULT_CHART_LINE_HL_PCT_VOLATILITY_THRESHOLD,
} from './chart-line-hl-pct';
import type { ChartLineHlPctPoint } from './chart-line-hl-pct';

const constBars = (
  count: number,
  high: number,
  low: number,
  close = (high + low) / 2,
): ChartLineHlPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high,
    low,
    close,
  }));

describe('getLineHlPctFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineHlPctFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineHlPctFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const result = getLineHlPctFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite low', () => {
    const result = getLineHlPctFinitePoints([
      { x: 0, high: 10, low: Number.NaN, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineHlPctFinitePoints([
      { x: 0, high: 10, low: 5, close: Number.NaN },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineHlPctFinitePoints([
      null as unknown as ChartLineHlPctPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineHlPctLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineHlPctLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineHlPctLength(7.9, 14)).toBe(7);
  });

  it('accepts 1', () => {
    expect(normalizeLineHlPctLength(1, 14)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineHlPctLength(0, 14)).toBe(14);
  });

  it('rejects negative', () => {
    expect(normalizeLineHlPctLength(-1, 14)).toBe(14);
  });
});

describe('normalizeLineHlPctVolatilityThreshold', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineHlPctVolatilityThreshold(undefined, 5)).toBe(5);
  });

  it('accepts zero', () => {
    expect(normalizeLineHlPctVolatilityThreshold(0, 5)).toBe(0);
  });

  it('accepts positive', () => {
    expect(normalizeLineHlPctVolatilityThreshold(2.5, 5)).toBe(2.5);
  });

  it('rejects negative', () => {
    expect(normalizeLineHlPctVolatilityThreshold(-1, 5)).toBe(5);
  });
});

describe('computeLineHlPctRawSeries', () => {
  it('CONST h=l=K yields raw = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const series = constBars(5, K, K);
      const raw = computeLineHlPctRawSeries(series);
      for (const v of raw) {
        expect(v).toBe(0);
      }
    }
  });

  it('CONST h=12, l=8 yields raw = 40 bit-exact', () => {
    const series = constBars(5, 12, 8);
    const raw = computeLineHlPctRawSeries(series);
    for (const v of raw) {
      expect(v).toBe(40);
    }
  });

  it('CONST h=11, l=9 yields raw = 20 bit-exact', () => {
    const series = constBars(5, 11, 9);
    const raw = computeLineHlPctRawSeries(series);
    for (const v of raw) {
      expect(v).toBe(20);
    }
  });

  it('CONST h=l=0 yields raw = null (midpoint=0 guard)', () => {
    const series = constBars(5, 0, 0);
    const raw = computeLineHlPctRawSeries(series);
    for (const v of raw) {
      expect(v).toBe(null);
    }
  });

  it('handles negative midpoint via Math.abs', () => {
    const series: ChartLineHlPctPoint[] = [
      { x: 0, high: -8, low: -12, close: -10 },
    ];
    const raw = computeLineHlPctRawSeries(series);
    // midpoint = -10, |midpoint| = 10, (h - l) = 4, raw = 40
    expect(raw[0]).toBe(40);
  });
});

describe('applyLineHlPctSma', () => {
  it('warmup region is null', () => {
    const out = applyLineHlPctSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100]) {
      const values = Array(10).fill(K);
      const out = applyLineHlPctSma(values, 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('null entry in window short-circuits', () => {
    const values: Array<number | null> = [1, null, 3, 4];
    const out = applyLineHlPctSma(values, 4);
    expect(out[3]).toBe(null);
  });
});

describe('computeLineHlPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineHlPct(null);
    expect(ch.hlPct).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineHlPct([]);
    expect(ch.hlPct).toEqual([]);
  });

  it('CONST h=l=K yields hlPct = 0 at every valid bar (bit-exact)', () => {
    for (const K of [1, 5, 100, -3]) {
      const series = constBars(15, K, K);
      const ch = computeLineHlPct(series, { length: 4 });
      for (let i = 3; i < 15; i += 1) {
        expect(ch.hlPct[i]).toBe(0);
      }
    }
  });

  it('CONST h=12, l=8 yields hlPct = 40 at every valid bar (bit-exact)', () => {
    const series = constBars(15, 12, 8);
    const ch = computeLineHlPct(series, { length: 4 });
    for (let i = 3; i < 15; i += 1) {
      expect(ch.hlPct[i]).toBe(40);
    }
  });

  it('CONST h=11, l=9 yields hlPct = 20 (bit-exact)', () => {
    const series = constBars(15, 11, 9);
    const ch = computeLineHlPct(series, { length: 4 });
    for (let i = 3; i < 15; i += 1) {
      expect(ch.hlPct[i]).toBe(20);
    }
  });

  it('CONST h=l=0 yields hlPct = null (midpoint=0 guard)', () => {
    const series = constBars(15, 0, 0);
    const ch = computeLineHlPct(series, { length: 4 });
    for (let i = 0; i < 15; i += 1) {
      expect(ch.hlPct[i]).toBe(null);
    }
  });

  it('warmup region is null', () => {
    const series = constBars(15, 12, 8);
    const ch = computeLineHlPct(series, { length: 5 });
    expect(ch.hlPct[0]).toBe(null);
    expect(ch.hlPct[3]).toBe(null);
    expect(ch.hlPct[4]).toBe(40);
  });

  it('output length matches input length', () => {
    const series = constBars(15, 12, 8);
    const ch = computeLineHlPct(series, { length: 4 });
    expect(ch.hlPct.length).toBe(15);
    expect(ch.raw.length).toBe(15);
  });

  it('does not mutate input', () => {
    const series = constBars(15, 12, 8);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineHlPct(series, { length: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineHlPctZone', () => {
  it('classifies high when value >= threshold', () => {
    expect(classifyLineHlPctZone(10, 5)).toBe('high');
  });

  it('classifies low when 0 < value < threshold', () => {
    expect(classifyLineHlPctZone(2, 5)).toBe('low');
  });

  it('classifies flat when value == 0', () => {
    expect(classifyLineHlPctZone(0, 5)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineHlPctZone(null, 5)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineHlPctZone(Number.NaN, 5)).toBe('none');
  });
});

describe('detectLineHlPctCrosses', () => {
  it('returns [null, null] for warmup-only data', () => {
    expect(detectLineHlPctCrosses([null, null], 5)).toEqual([null, null]);
  });

  it('flags up when prev < threshold and current >= threshold', () => {
    const crosses = detectLineHlPctCrosses([null, 2, 8], 5);
    expect(crosses[2]).toBe('up');
  });

  it('flags down when prev >= threshold and current < threshold', () => {
    const crosses = detectLineHlPctCrosses([null, 8, 2], 5);
    expect(crosses[2]).toBe('down');
  });

  it('no cross when both above threshold', () => {
    const crosses = detectLineHlPctCrosses([null, 8, 10], 5);
    expect(crosses[2]).toBe(null);
  });

  it('no cross when both below threshold', () => {
    const crosses = detectLineHlPctCrosses([null, 1, 2], 5);
    expect(crosses[2]).toBe(null);
  });

  it('detects multiple crosses', () => {
    const crosses = detectLineHlPctCrosses([null, 2, 8, 2], 5);
    expect(crosses[2]).toBe('up');
    expect(crosses[3]).toBe('down');
  });

  it('first defined bar is not a cross', () => {
    const crosses = detectLineHlPctCrosses([null, 8], 5);
    expect(crosses[1]).toBe(null);
  });
});

describe('runLineHlPct', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineHlPct(constBars(3, 12, 8), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with length points', () => {
    const run = runLineHlPct(constBars(4, 12, 8), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default length and threshold', () => {
    const run = runLineHlPct(constBars(30, 12, 8));
    expect(run.length).toBe(DEFAULT_CHART_LINE_HL_PCT_LENGTH);
    expect(run.volatilityThreshold).toBe(
      DEFAULT_CHART_LINE_HL_PCT_VOLATILITY_THRESHOLD,
    );
  });

  it('respects explicit options', () => {
    const run = runLineHlPct(constBars(30, 12, 8), {
      length: 7,
      volatilityThreshold: 10,
    });
    expect(run.length).toBe(7);
    expect(run.volatilityThreshold).toBe(10);
  });

  it('sorts by x', () => {
    const data: ChartLineHlPctPoint[] = [
      { x: 2, high: 12, low: 8, close: 10 },
      { x: 0, high: 12, low: 8, close: 10 },
      { x: 1, high: 12, low: 8, close: 10 },
    ];
    const run = runLineHlPct(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST h=l=K classifies post-warmup as flat', () => {
    const run = runLineHlPct(constBars(20, 5, 5), { length: 4 });
    expect(run.flatCount).toBe(17);
    expect(run.highCount).toBe(0);
    expect(run.lowCount).toBe(0);
  });

  it('CONST h=12, l=8 classifies post-warmup as high (raw=40 > threshold=5)', () => {
    const run = runLineHlPct(constBars(20, 12, 8), { length: 4 });
    expect(run.highCount).toBe(17);
    expect(run.lowCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('CONST h=10.1, l=9.9 with threshold=5 classifies as low', () => {
    // raw = 0.2/10*100 = 2, smoothed = 2, zone = 'low' (< 5)
    const run = runLineHlPct(constBars(20, 10.1, 9.9), {
      length: 4,
      volatilityThreshold: 5,
    });
    expect(run.lowCount).toBe(17);
  });

  it('no crosses when zone is stable', () => {
    const run = runLineHlPct(constBars(20, 12, 8), { length: 4 });
    expect(run.bullishCrossCount).toBe(0);
    expect(run.bearishCrossCount).toBe(0);
  });
});

describe('computeLineHlPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineHlPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineHlPctLayout({
      data: constBars(30, 12, 8),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineHlPctLayout({
      data: constBars(30, 12, 8),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above hlPct', () => {
    const layout = computeLineHlPctLayout({
      data: constBars(30, 12, 8),
    });
    expect(layout.priceBottom).toBeLessThan(layout.hlPctTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineHlPctLayout({
      data: constBars(30, 12, 8),
      panelGap: 24,
    });
    expect(layout.hlPctTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineHlPctLayout({
      data: constBars(30, 12, 8),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('CONST yields zero markers (no crosses)', () => {
    const layout = computeLineHlPctLayout({
      data: constBars(30, 12, 8),
    });
    expect(layout.markers.length).toBe(0);
  });

  it('hlPctMin is 0', () => {
    const layout = computeLineHlPctLayout({
      data: constBars(30, 12, 8),
    });
    expect(layout.hlPctMin).toBe(0);
  });

  it('threshold line y is between hlPctTop and hlPctBottom', () => {
    const layout = computeLineHlPctLayout({
      data: constBars(30, 12, 8),
    });
    expect(layout.thresholdY).toBeGreaterThanOrEqual(layout.hlPctTop);
    expect(layout.thresholdY).toBeLessThanOrEqual(layout.hlPctBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineHlPctLayout({
      data: [{ x: 0, high: 12, low: 8, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineHlPctChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineHlPctChart([])).toBe('No data');
  });

  it('mentions High Low percent', () => {
    const desc = describeLineHlPctChart(constBars(30, 12, 8));
    expect(desc).toContain('High Low percent');
  });

  it('mentions the formula', () => {
    const desc = describeLineHlPctChart(constBars(30, 12, 8));
    expect(desc).toContain('(high - low) / |midpoint| * 100');
  });

  it('reports the length and threshold', () => {
    const desc = describeLineHlPctChart(constBars(30, 12, 8), {
      length: 7,
      volatilityThreshold: 10,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('volatilityThreshold 10');
  });
});

describe('<ChartLineHlPct />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineHlPct data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-hl-pct-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'High Low percent',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHlPct data={constBars(30, 12, 8)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-volatility-threshold', () => {
    const { container } = render(
      <ChartLineHlPct
        data={constBars(30, 12, 8)}
        length={7}
        volatilityThreshold={10}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-volatility-threshold')).toBe('10');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-pct"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-hl-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('High Low percent');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="hlPct"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHlPct
        data={constBars(30, 12, 8)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="hlPct"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'hlPct',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineHlPct
        data={constBars(30, 12, 8)}
        hiddenSeries={['hlPct']}
      />,
    );
    const button = container.querySelector('[data-series-id="hlPct"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides hlPct line when controlled hidden', () => {
    const { container } = render(
      <ChartLineHlPct
        data={constBars(30, 12, 8)}
        hiddenSeries={['hlPct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-pct-line"]'),
    ).toBe(null);
  });

  it('renders the threshold line by default', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-pct-threshold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides threshold line when showThreshold is false', () => {
    const { container } = render(
      <ChartLineHlPct
        data={constBars(30, 12, 8)}
        showThreshold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-pct-threshold-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-pct-badge"]'),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineHlPct
        data={constBars(30, 12, 8)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-pct-badge"]'),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} showDots={true} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-hl-pct-dot"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-pct-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-pct-grid"]'),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} showMarkers={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-pct-markers"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-pct-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineHlPct
        data={constBars(30, 12, 8)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-hl-pct-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the hlPct line by default', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-pct-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineHlPct data={constBars(30, 12, 8)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineHlPct
        data={constBars(30, 12, 8)}
        defaultHiddenSeries={['hlPct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-pct-line"]'),
    ).toBe(null);
  });
});

describe('HL Pct integration', () => {
  it('CONST h=l=K yields hlPct = 0 across (K, length)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const series = constBars(L + 5, K, K);
        const ch = computeLineHlPct(series, { length: L });
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(ch.hlPct[i]).toBe(0);
        }
      }
    }
  });

  it('CONST h=12, l=8 yields hlPct = 40 across length sweep', () => {
    for (const L of [3, 4, 7, 10]) {
      const series = constBars(L + 5, 12, 8);
      const ch = computeLineHlPct(series, { length: L });
      for (let i = L - 1; i < L + 5; i += 1) {
        expect(ch.hlPct[i]).toBe(40);
      }
    }
  });
});
