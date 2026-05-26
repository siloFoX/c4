import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHlMean,
  applyLineHlMeanSma,
  classifyLineHlMeanZone,
  computeLineHlMean,
  computeLineHlMeanLayout,
  computeLineHlMeanMidpoints,
  describeLineHlMeanChart,
  detectLineHlMeanCrosses,
  getLineHlMeanFinitePoints,
  normalizeLineHlMeanLength,
  runLineHlMean,
  DEFAULT_CHART_LINE_HL_MEAN_LENGTH,
} from './chart-line-hl-mean';
import type { ChartLineHlMeanPoint } from './chart-line-hl-mean';

const constBar = (
  count: number,
  K: number,
): ChartLineHlMeanPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const asymBar = (
  count: number,
  high: number,
  low: number,
  close: number,
): ChartLineHlMeanPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high,
    low,
    close,
  }));

describe('getLineHlMeanFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineHlMeanFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineHlMeanFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const result = getLineHlMeanFinitePoints([
      { x: 1, high: Number.NaN, low: 5, close: 10 },
      { x: 2, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite low', () => {
    const result = getLineHlMeanFinitePoints([
      { x: 1, high: 10, low: Number.NaN, close: 7 },
      { x: 2, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineHlMeanFinitePoints([
      { x: 1, high: 10, low: 5, close: Number.NaN },
      { x: 2, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineHlMeanFinitePoints([
      null as unknown as ChartLineHlMeanPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineHlMeanLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineHlMeanLength(undefined, 14)).toBe(14);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineHlMeanLength(7.9, 14)).toBe(7);
  });

  it('accepts 1', () => {
    expect(normalizeLineHlMeanLength(1, 14)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineHlMeanLength(0, 14)).toBe(14);
  });

  it('rejects negative', () => {
    expect(normalizeLineHlMeanLength(-1, 14)).toBe(14);
  });
});

describe('computeLineHlMeanMidpoints', () => {
  it('CONST high=low=K yields midpoint = K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(5, K);
      const mids = computeLineHlMeanMidpoints(series);
      for (const v of mids) {
        expect(v).toBe(K);
      }
    }
  });

  it('asymmetric bars yield (high + low) / 2', () => {
    const series: ChartLineHlMeanPoint[] = [
      { x: 0, high: 10, low: 2, close: 7 },
      { x: 1, high: 8, low: 4, close: 6 },
    ];
    const mids = computeLineHlMeanMidpoints(series);
    expect(mids[0]).toBe(6);
    expect(mids[1]).toBe(6);
  });
});

describe('applyLineHlMeanSma', () => {
  it('warmup region is null', () => {
    const out = applyLineHlMeanSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('SMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const values = Array(10).fill(K);
      const out = applyLineHlMeanSma(values, 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('null entry in window short-circuits', () => {
    const values: Array<number | null> = [1, 2, null, 4];
    const out = applyLineHlMeanSma(values, 4);
    expect(out[3]).toBe(null);
  });
});

describe('computeLineHlMean', () => {
  it('returns empty for null', () => {
    const ch = computeLineHlMean(null);
    expect(ch.hlMean).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineHlMean([]);
    expect(ch.hlMean).toEqual([]);
  });

  it('nulls the warmup region (i < length - 1)', () => {
    const series = constBar(10, 5);
    const ch = computeLineHlMean(series, { length: 4 });
    expect(ch.hlMean[0]).toBe(null);
    expect(ch.hlMean[1]).toBe(null);
    expect(ch.hlMean[2]).toBe(null);
    expect(ch.hlMean[3]).not.toBe(null);
  });

  it('CONST high=low=K yields hlMean = K bit-exact at every valid bar', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(10, K);
      const ch = computeLineHlMean(series, { length: 4 });
      for (let i = 3; i < 10; i += 1) {
        expect(ch.hlMean[i]).toBe(K);
      }
    }
  });

  it('ASYMMETRIC high=10, low=2 yields hlMean = 6 bit-exact', () => {
    const series = asymBar(10, 10, 2, 8);
    const ch = computeLineHlMean(series, { length: 4 });
    for (let i = 3; i < 10; i += 1) {
      expect(ch.hlMean[i]).toBe(6);
    }
  });

  it('output length matches input length', () => {
    const series = constBar(10, 5);
    const ch = computeLineHlMean(series, { length: 4 });
    expect(ch.hlMean.length).toBe(10);
    expect(ch.midpoint.length).toBe(10);
  });

  it('does not mutate input', () => {
    const series = constBar(10, 5);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineHlMean(series, { length: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineHlMeanZone', () => {
  it('classifies above when close > mean', () => {
    expect(classifyLineHlMeanZone(10, 5)).toBe('above');
  });

  it('classifies below when close < mean', () => {
    expect(classifyLineHlMeanZone(2, 5)).toBe('below');
  });

  it('classifies at when close == mean', () => {
    expect(classifyLineHlMeanZone(5, 5)).toBe('at');
  });

  it('returns none for null mean', () => {
    expect(classifyLineHlMeanZone(5, null)).toBe('none');
  });

  it('returns none for NaN mean', () => {
    expect(classifyLineHlMeanZone(5, Number.NaN)).toBe('none');
  });

  it('returns none for NaN close', () => {
    expect(classifyLineHlMeanZone(Number.NaN, 5)).toBe('none');
  });
});

describe('detectLineHlMeanCrosses', () => {
  it('returns [null, null] for none-only data', () => {
    expect(detectLineHlMeanCrosses(['none', 'none'])).toEqual([null, null]);
  });

  it('flags up when prev was below and current is above', () => {
    const crosses = detectLineHlMeanCrosses(['none', 'below', 'above']);
    expect(crosses[2]).toBe('up');
  });

  it('flags down when prev was above and current is below', () => {
    const crosses = detectLineHlMeanCrosses(['none', 'above', 'below']);
    expect(crosses[2]).toBe('down');
  });

  it('flags up from at to above', () => {
    const crosses = detectLineHlMeanCrosses(['none', 'at', 'above']);
    expect(crosses[2]).toBe('up');
  });

  it('flags down from at to below', () => {
    const crosses = detectLineHlMeanCrosses(['none', 'at', 'below']);
    expect(crosses[2]).toBe('down');
  });

  it('no cross when both above', () => {
    const crosses = detectLineHlMeanCrosses(['none', 'above', 'above']);
    expect(crosses[2]).toBe(null);
  });

  it('no cross when both below', () => {
    const crosses = detectLineHlMeanCrosses(['none', 'below', 'below']);
    expect(crosses[2]).toBe(null);
  });

  it('first defined bar is not a cross', () => {
    const crosses = detectLineHlMeanCrosses(['none', 'above']);
    expect(crosses[1]).toBe(null);
  });

  it('detects multiple crosses', () => {
    const crosses = detectLineHlMeanCrosses([
      'none',
      'above',
      'below',
      'above',
    ]);
    expect(crosses[2]).toBe('down');
    expect(crosses[3]).toBe('up');
  });
});

describe('runLineHlMean', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineHlMean(constBar(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with length points', () => {
    const run = runLineHlMean(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineHlMean(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_HL_MEAN_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineHlMean(constBar(30, 10), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineHlMeanPoint[] = [
      { x: 2, high: 10, low: 5, close: 7 },
      { x: 0, high: 10, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ];
    const run = runLineHlMean(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST high=low=close=K classifies post-warmup as at', () => {
    const run = runLineHlMean(constBar(10, 5), { length: 4 });
    expect(run.atCount).toBe(7);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('ASYM high=10, low=2, close=8 classifies post-warmup as above', () => {
    const run = runLineHlMean(asymBar(10, 10, 2, 8), { length: 4 });
    expect(run.aboveCount).toBe(7);
    expect(run.belowCount).toBe(0);
    expect(run.atCount).toBe(0);
  });

  it('ASYM high=10, low=2, close=4 classifies post-warmup as below', () => {
    const run = runLineHlMean(asymBar(10, 10, 2, 4), { length: 4 });
    expect(run.belowCount).toBe(7);
  });

  it('no crosses when zone is stable', () => {
    const run = runLineHlMean(asymBar(10, 10, 2, 8), { length: 4 });
    expect(run.bullishCrossCount).toBe(0);
    expect(run.bearishCrossCount).toBe(0);
  });
});

describe('computeLineHlMeanLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineHlMeanLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineHlMeanLayout({
      data: constBar(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineHlMeanLayout({
      data: constBar(30, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineHlMeanLayout({
      data: constBar(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a mean path (warmup bars dropped)', () => {
    const layout = computeLineHlMeanLayout({
      data: constBar(30, 10),
      length: 5,
    });
    expect(layout.meanPath.startsWith('M')).toBe(true);
  });

  it('CONST yields zero markers (no crosses)', () => {
    const layout = computeLineHlMeanLayout({
      data: constBar(30, 10),
    });
    expect(layout.markers.length).toBe(0);
  });

  it('y range covers both close and mean', () => {
    const layout = computeLineHlMeanLayout({
      data: asymBar(20, 10, 2, 8),
      length: 4,
    });
    expect(layout.yMin).toBeLessThanOrEqual(6);
    expect(layout.yMax).toBeGreaterThanOrEqual(8);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineHlMeanLayout({
      data: [{ x: 0, high: 10, low: 2, close: 8 }],
      length: 1,
    });
    expect(layout.ok).toBe(true);
  });
});

describe('describeLineHlMeanChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineHlMeanChart([])).toBe('No data');
  });

  it('mentions High Low Mean', () => {
    const desc = describeLineHlMeanChart(constBar(30, 10));
    expect(desc).toContain('High Low Mean');
  });

  it('mentions the midpoint formula', () => {
    const desc = describeLineHlMeanChart(constBar(30, 10));
    expect(desc).toContain('(high + low) / 2');
  });

  it('reports the length', () => {
    const desc = describeLineHlMeanChart(constBar(30, 10), { length: 7 });
    expect(desc).toContain('length 7');
  });
});

describe('<ChartLineHlMean />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineHlMean data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-hl-mean-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineHlMean data={constBar(30, 10)} length={5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('High Low Mean');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHlMean data={constBar(30, 10)} length={5} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineHlMean data={constBar(30, 10)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-mean"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineHlMean data={constBar(30, 10)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-mean"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineHlMean data={constBar(30, 10)} length={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-hl-mean-aria-desc"]',
    );
    expect(desc?.textContent).toContain('High Low Mean');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineHlMean data={constBar(30, 10)} length={5} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="mean"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="mean"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'mean',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        hiddenSeries={['mean']}
      />,
    );
    const button = container.querySelector('[data-series-id="mean"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides mean line when controlled hidden', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        hiddenSeries={['mean']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-mean-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineHlMean data={constBar(30, 10)} length={5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-mean-badge"]'),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-mean-badge"]'),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        showDots={true}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-hl-mean-dot"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineHlMean data={constBar(30, 10)} length={5} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-hl-mean-dot"]')
        .length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-mean-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-mean-grid"]'),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-mean-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-mean-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-mean"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        animate={true}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-mean"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-hl-mean-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the mean line by default', () => {
    const { container } = render(
      <ChartLineHlMean data={constBar(30, 10)} length={5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-mean-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineHlMean data={constBar(30, 10)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-mean-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineHlMean
        data={constBar(30, 10)}
        length={5}
        defaultHiddenSeries={['mean']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-mean-line"]'),
    ).toBe(null);
  });
});

describe('HL Mean integration', () => {
  it('CONST high=low=close=K yields zone=at across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const run = runLineHlMean(constBar(L + 5, K), { length: L });
        expect(run.aboveCount).toBe(0);
        expect(run.belowCount).toBe(0);
        // valid bars from i = L - 1 to L + 4 inclusive = (L+5) - (L-1) = 6
        expect(run.atCount).toBe(6);
      }
    }
  });

  it('ASYM CONST h=10, l=2, c=8 yields zone=above across length sweep', () => {
    for (const L of [3, 4, 7, 10]) {
      const run = runLineHlMean(asymBar(L + 5, 10, 2, 8), { length: L });
      expect(run.aboveCount).toBe(6);
      expect(run.belowCount).toBe(0);
      expect(run.atCount).toBe(0);
    }
  });
});
