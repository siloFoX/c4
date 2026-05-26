import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRangeBias,
  classifyLineRangeBiasZone,
  computeLineRangeBias,
  computeLineRangeBiasLayout,
  describeLineRangeBiasChart,
  detectLineRangeBiasCrosses,
  getLineRangeBiasFinitePoints,
  normalizeLineRangeBiasThreshold,
  runLineRangeBias,
} from './chart-line-range-bias';
import type { ChartLineRangeBiasPoint } from './chart-line-range-bias';

const bars = (
  count: number,
  high: number,
  low: number,
  close: number,
): ChartLineRangeBiasPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high,
    low,
    close,
  }));

describe('getLineRangeBiasFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineRangeBiasFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const result = getLineRangeBiasFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineRangeBiasFinitePoints([
      null as unknown as ChartLineRangeBiasPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineRangeBiasThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineRangeBiasThreshold(undefined, 0.3)).toBe(0.3);
  });

  it('accepts negative', () => {
    expect(normalizeLineRangeBiasThreshold(-0.3, 0.3)).toBe(-0.3);
  });

  it('accepts zero', () => {
    expect(normalizeLineRangeBiasThreshold(0, 0.3)).toBe(0);
  });

  it('rejects NaN', () => {
    expect(normalizeLineRangeBiasThreshold(Number.NaN, 0.3)).toBe(0.3);
  });
});

describe('computeLineRangeBias', () => {
  it('returns empty for null', () => {
    const ch = computeLineRangeBias(null);
    expect(ch.bias).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineRangeBias([]);
    expect(ch.bias).toEqual([]);
  });

  it('close=high yields bias = 0.5 (bit-exact)', () => {
    const series: ChartLineRangeBiasPoint[] = [
      { x: 0, high: 10, low: 2, close: 10 },
      { x: 1, high: 5, low: 1, close: 5 },
    ];
    const ch = computeLineRangeBias(series);
    expect(ch.bias[0]).toBe(0.5);
    expect(ch.bias[1]).toBe(0.5);
  });

  it('close=low yields bias = -0.5 (bit-exact)', () => {
    const series: ChartLineRangeBiasPoint[] = [
      { x: 0, high: 10, low: 2, close: 2 },
      { x: 1, high: 5, low: 1, close: 1 },
    ];
    const ch = computeLineRangeBias(series);
    expect(ch.bias[0]).toBe(-0.5);
    expect(ch.bias[1]).toBe(-0.5);
  });

  it('close=midpoint yields bias = 0 (bit-exact)', () => {
    // midpoint of high=10, low=2 is 6.
    const series: ChartLineRangeBiasPoint[] = [
      { x: 0, high: 10, low: 2, close: 6 },
    ];
    const ch = computeLineRangeBias(series);
    expect(ch.bias[0]).toBe(0);
  });

  it('high=low yields bias = null (divide-by-zero)', () => {
    const series: ChartLineRangeBiasPoint[] = [
      { x: 0, high: 5, low: 5, close: 5 },
    ];
    const ch = computeLineRangeBias(series);
    expect(ch.bias[0]).toBe(null);
  });

  it('close above high yields bias > 0.5 (out of typical range)', () => {
    const series: ChartLineRangeBiasPoint[] = [
      { x: 0, high: 10, low: 2, close: 14 },
    ];
    const ch = computeLineRangeBias(series);
    // bias = (14 - 6) / 8 = 1.
    expect(ch.bias[0]).toBe(1);
  });

  it('quarter-position: close=4 with h=10 l=2 yields bias = -0.25', () => {
    // midpoint = 6, range = 8. (4 - 6) / 8 = -0.25.
    const series: ChartLineRangeBiasPoint[] = [
      { x: 0, high: 10, low: 2, close: 4 },
    ];
    const ch = computeLineRangeBias(series);
    expect(ch.bias[0]).toBe(-0.25);
  });

  it('output length matches input length', () => {
    const series = bars(5, 10, 5, 7);
    const ch = computeLineRangeBias(series);
    expect(ch.bias.length).toBe(5);
  });

  it('does not mutate input', () => {
    const series = bars(5, 10, 5, 7);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineRangeBias(series);
    expect(series).toEqual(snap);
  });
});

describe('classifyLineRangeBiasZone', () => {
  it('classifies bullish when value >= highThreshold', () => {
    expect(classifyLineRangeBiasZone(0.4, 0.3, -0.3)).toBe('bullish');
  });

  it('classifies bearish when value <= lowThreshold', () => {
    expect(classifyLineRangeBiasZone(-0.4, 0.3, -0.3)).toBe('bearish');
  });

  it('classifies neutral in between', () => {
    expect(classifyLineRangeBiasZone(0.1, 0.3, -0.3)).toBe('neutral');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineRangeBiasZone(0, 0.3, -0.3)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineRangeBiasZone(null, 0.3, -0.3)).toBe('none');
  });
});

describe('detectLineRangeBiasCrosses', () => {
  it('returns [null, null] for warmup', () => {
    expect(detectLineRangeBiasCrosses([null, null], 0.3, -0.3)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above highThreshold', () => {
    const ev = detectLineRangeBiasCrosses([null, 0.1, 0.4], 0.3, -0.3);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below lowThreshold', () => {
    const ev = detectLineRangeBiasCrosses([null, 0.1, -0.4], 0.3, -0.3);
    expect(ev[2]).toBe('down');
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineRangeBiasCrosses([null, 0.5], 0.3, -0.3);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineRangeBias', () => {
  it('marks ok=false for empty data', () => {
    const run = runLineRangeBias([]);
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with at least one point', () => {
    const run = runLineRangeBias(bars(1, 10, 5, 7));
    expect(run.ok).toBe(true);
  });

  it('uses default thresholds', () => {
    const run = runLineRangeBias(bars(5, 10, 5, 7));
    expect(run.highThreshold).toBe(0.3);
    expect(run.lowThreshold).toBe(-0.3);
  });

  it('respects explicit options', () => {
    const run = runLineRangeBias(bars(5, 10, 5, 7), {
      highThreshold: 0.4,
      lowThreshold: -0.4,
    });
    expect(run.highThreshold).toBe(0.4);
    expect(run.lowThreshold).toBe(-0.4);
  });

  it('sorts by x', () => {
    const data: ChartLineRangeBiasPoint[] = [
      { x: 2, high: 10, low: 5, close: 7 },
      { x: 0, high: 10, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ];
    const run = runLineRangeBias(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('close=high classifies as bullish', () => {
    const run = runLineRangeBias(bars(5, 10, 2, 10));
    expect(run.bullishCount).toBe(5);
    expect(run.bearishCount).toBe(0);
  });

  it('close=low classifies as bearish', () => {
    const run = runLineRangeBias(bars(5, 10, 2, 2));
    expect(run.bearishCount).toBe(5);
    expect(run.bullishCount).toBe(0);
  });

  it('close=midpoint classifies as flat', () => {
    const run = runLineRangeBias(bars(5, 10, 2, 6));
    expect(run.flatCount).toBe(5);
  });

  it('high=low classifies as none', () => {
    const run = runLineRangeBias(bars(5, 10, 10, 10));
    expect(run.noneCount).toBe(5);
  });
});

describe('computeLineRangeBiasLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineRangeBiasLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineRangeBiasLayout({
      data: bars(5, 10, 5, 7),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above bias', () => {
    const layout = computeLineRangeBiasLayout({
      data: bars(5, 10, 5, 7),
    });
    expect(layout.priceBottom).toBeLessThan(layout.biasTop);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineRangeBiasLayout({
      data: bars(5, 10, 5, 7),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(5);
  });

  it('bias axis is fixed [-0.5, +0.5]', () => {
    const layout = computeLineRangeBiasLayout({
      data: bars(5, 10, 5, 7),
    });
    expect(layout.biasMin).toBe(-0.5);
    expect(layout.biasMax).toBe(0.5);
  });

  it('zero line y is within bias panel bounds', () => {
    const layout = computeLineRangeBiasLayout({
      data: bars(5, 10, 5, 7),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.biasTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.biasBottom);
  });

  it('threshold lines within bounds', () => {
    const layout = computeLineRangeBiasLayout({
      data: bars(5, 10, 5, 7),
    });
    expect(layout.highThresholdY).toBeGreaterThanOrEqual(layout.biasTop);
    expect(layout.highThresholdY).toBeLessThanOrEqual(layout.biasBottom);
    expect(layout.lowThresholdY).toBeGreaterThanOrEqual(layout.biasTop);
    expect(layout.lowThresholdY).toBeLessThanOrEqual(layout.biasBottom);
  });
});

describe('describeLineRangeBiasChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineRangeBiasChart([])).toBe('No data');
  });

  it('mentions Range Bias', () => {
    const desc = describeLineRangeBiasChart(bars(5, 10, 5, 7));
    expect(desc).toContain('Range Bias');
  });

  it('reports parameters', () => {
    const desc = describeLineRangeBiasChart(bars(5, 10, 5, 7), {
      highThreshold: 0.4,
      lowThreshold: -0.4,
    });
    expect(desc).toContain('highThreshold 0.4');
    expect(desc).toContain('lowThreshold -0.4');
  });
});

describe('<ChartLineRangeBias />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineRangeBias data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-range-bias-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Range Bias');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRangeBias data={bars(5, 10, 5, 7)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineRangeBias
        data={bars(5, 10, 5, 7)}
        highThreshold={0.4}
        lowThreshold={-0.4}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-range-bias"]',
    );
    expect(root?.getAttribute('data-high-threshold')).toBe('0.4');
    expect(root?.getAttribute('data-low-threshold')).toBe('-0.4');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-range-bias"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('5');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-range-bias-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Range Bias');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="bias"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineRangeBias
        data={bars(5, 10, 5, 7)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="bias"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'bias',
      hidden: true,
    });
  });

  it('hides bias when controlled hidden', () => {
    const { container } = render(
      <ChartLineRangeBias
        data={bars(5, 10, 5, 7)}
        hiddenSeries={['bias']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-range-bias-line"]'),
    ).toBe(null);
  });

  it('renders config badge by default', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-high-threshold-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-low-threshold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineRangeBias
        data={bars(5, 10, 5, 7)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-high-threshold-line"]',
      ),
    ).toBe(null);
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineRangeBias
        data={bars(5, 10, 5, 7)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineRangeBias
        data={bars(5, 10, 5, 7)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineRangeBias
        data={bars(5, 10, 5, 7)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineRangeBias
        data={bars(5, 10, 5, 7)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-range-bias"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-range-bias-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the bias line by default', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-range-bias-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineRangeBias data={bars(5, 10, 5, 7)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-range-bias-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineRangeBias
        data={bars(5, 10, 5, 7)}
        defaultHiddenSeries={['bias']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-range-bias-line"]'),
    ).toBe(null);
  });
});

describe('Range Bias integration', () => {
  it('close=high yields bias=0.5 for any (high, low)', () => {
    for (const [h, l] of [
      [10, 2],
      [100, 50],
      [5, 1],
      [20, 10],
    ] as Array<[number, number]>) {
      const ch = computeLineRangeBias([
        { x: 0, high: h, low: l, close: h },
      ]);
      expect(ch.bias[0]).toBe(0.5);
    }
  });

  it('close=low yields bias=-0.5 for any (high, low)', () => {
    for (const [h, l] of [
      [10, 2],
      [100, 50],
      [5, 1],
    ] as Array<[number, number]>) {
      const ch = computeLineRangeBias([
        { x: 0, high: h, low: l, close: l },
      ]);
      expect(ch.bias[0]).toBe(-0.5);
    }
  });
});
