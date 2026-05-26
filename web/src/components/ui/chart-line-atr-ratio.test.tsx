import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAtrRatio,
  applyLineAtrRatioAtr,
  applyLineAtrRatioTrueRange,
  classifyLineAtrRatioZone,
  computeLineAtrRatio,
  computeLineAtrRatioLayout,
  describeLineAtrRatioChart,
  detectLineAtrRatioCrosses,
  getLineAtrRatioFinitePoints,
  normalizeLineAtrRatioLength,
  normalizeLineAtrRatioThreshold,
  runLineAtrRatio,
  DEFAULT_CHART_LINE_ATR_RATIO_SHORT_LENGTH,
  DEFAULT_CHART_LINE_ATR_RATIO_LONG_LENGTH,
} from './chart-line-atr-ratio';
import type { ChartLineAtrRatioPoint } from './chart-line-atr-ratio';

const constBar = (
  count: number,
  K: number,
): ChartLineAtrRatioPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearBar = (count: number): ChartLineAtrRatioPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

describe('getLineAtrRatioFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAtrRatioFinitePoints(null)).toEqual([]);
  });

  it('drops null entries', () => {
    const result = getLineAtrRatioFinitePoints([
      null as unknown as ChartLineAtrRatioPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite high', () => {
    const result = getLineAtrRatioFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineAtrRatioLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAtrRatioLength(undefined, 5)).toBe(5);
  });

  it('accepts 1', () => {
    expect(normalizeLineAtrRatioLength(1, 5)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineAtrRatioLength(0, 5)).toBe(5);
  });
});

describe('normalizeLineAtrRatioThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAtrRatioThreshold(undefined, 1.2)).toBe(1.2);
  });

  it('accepts zero', () => {
    expect(normalizeLineAtrRatioThreshold(0, 1.2)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineAtrRatioThreshold(-1, 1.2)).toBe(1.2);
  });
});

describe('applyLineAtrRatioTrueRange', () => {
  it('CONST h=l=c yields TR = 0 bit-exact', () => {
    const series = constBar(5, 10);
    const out = applyLineAtrRatioTrueRange(series);
    for (let i = 0; i < 5; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('LINEAR k+1 yields TR[0]=0, TR[i>=1]=1', () => {
    const series = linearBar(5);
    const out = applyLineAtrRatioTrueRange(series);
    expect(out[0]).toBe(0);
    for (let i = 1; i < 5; i += 1) {
      expect(out[i]).toBe(1);
    }
  });
});

describe('applyLineAtrRatioAtr', () => {
  it('CONST TR=1 yields ATR = 1', () => {
    const out = applyLineAtrRatioAtr(Array(10).fill(1), 4);
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(1);
    }
  });

  it('warmup region is null', () => {
    const out = applyLineAtrRatioAtr([1, 1, 1, 1, 1], 4);
    expect(out[0]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(1);
  });
});

describe('computeLineAtrRatio', () => {
  it('returns empty for null', () => {
    const ch = computeLineAtrRatio(null);
    expect(ch.ratio).toEqual([]);
  });

  it('CONST h=l=c=K yields ratio = null (both ATRs zero)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(15, K);
      const ch = computeLineAtrRatio(series, {
        shortLength: 3,
        longLength: 5,
      });
      for (let i = 4; i < 15; i += 1) {
        expect(ch.shortAtr[i]).toBe(0);
        expect(ch.longAtr[i]).toBe(0);
        expect(ch.ratio[i]).toBe(null);
      }
    }
  });

  it('LINEAR k+1 yields ratio = 1 post-warmup (bit-exact)', () => {
    for (const [sL, lL] of [
      [3, 5],
      [5, 8],
      [5, 10],
    ] as Array<[number, number]>) {
      const series = linearBar(lL + 5);
      const ch = computeLineAtrRatio(series, {
        shortLength: sL,
        longLength: lL,
      });
      // At i = lL: long window covers TR[lL-lL+1..lL] = TR[1..lL] = all 1s,
      // so longAtr = 1. shortAtr is also 1 since recent TR=1.
      // -> ratio = 1.
      expect(ch.ratio[lL]).toBe(1);
    }
  });

  it('warmup region is null', () => {
    const series = constBar(15, 10);
    const ch = computeLineAtrRatio(series, {
      shortLength: 3,
      longLength: 5,
    });
    expect(ch.ratio[0]).toBe(null);
    expect(ch.ratio[3]).toBe(null);
  });

  it('output length matches input length', () => {
    const series = constBar(15, 10);
    const ch = computeLineAtrRatio(series);
    expect(ch.ratio.length).toBe(15);
    expect(ch.shortAtr.length).toBe(15);
    expect(ch.longAtr.length).toBe(15);
  });

  it('does not mutate input', () => {
    const series = linearBar(15);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineAtrRatio(series);
    expect(series).toEqual(snap);
  });
});

describe('classifyLineAtrRatioZone', () => {
  it('classifies expanding when value >= highThreshold', () => {
    expect(classifyLineAtrRatioZone(1.5, 1.2, 0.8)).toBe('expanding');
  });

  it('classifies contracting when value < lowThreshold', () => {
    expect(classifyLineAtrRatioZone(0.5, 1.2, 0.8)).toBe('contracting');
  });

  it('classifies normal in between', () => {
    expect(classifyLineAtrRatioZone(1, 1.2, 0.8)).toBe('normal');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineAtrRatioZone(0, 1.2, 0.8)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineAtrRatioZone(null, 1.2, 0.8)).toBe('none');
  });
});

describe('detectLineAtrRatioCrosses', () => {
  it('returns [null, null] for warmup', () => {
    expect(detectLineAtrRatioCrosses([null, null], 1.2, 0.8)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering expansion zone', () => {
    const ev = detectLineAtrRatioCrosses([null, 1.0, 1.5], 1.2, 0.8);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering contraction zone', () => {
    const ev = detectLineAtrRatioCrosses([null, 1.0, 0.5], 1.2, 0.8);
    expect(ev[2]).toBe('down');
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineAtrRatioCrosses([null, 2.0], 1.2, 0.8);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineAtrRatio', () => {
  it('marks ok=false for short data', () => {
    const run = runLineAtrRatio(constBar(3, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineAtrRatio(constBar(5, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineAtrRatio(constBar(30, 10));
    expect(run.shortLength).toBe(DEFAULT_CHART_LINE_ATR_RATIO_SHORT_LENGTH);
    expect(run.longLength).toBe(DEFAULT_CHART_LINE_ATR_RATIO_LONG_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineAtrRatio(constBar(30, 10), {
      shortLength: 3,
      longLength: 8,
      highThreshold: 1.5,
      lowThreshold: 0.6,
    });
    expect(run.shortLength).toBe(3);
    expect(run.longLength).toBe(8);
    expect(run.highThreshold).toBe(1.5);
    expect(run.lowThreshold).toBe(0.6);
  });

  it('sorts by x', () => {
    const data: ChartLineAtrRatioPoint[] = [
      { x: 2, high: 10, low: 10, close: 10 },
      { x: 0, high: 10, low: 10, close: 10 },
      { x: 1, high: 10, low: 10, close: 10 },
    ];
    const run = runLineAtrRatio(data, { shortLength: 2, longLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as none', () => {
    const run = runLineAtrRatio(constBar(20, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.noneCount).toBe(20);
  });

  it('LINEAR k+1 classifies post-warmup as normal (ratio=1)', () => {
    const run = runLineAtrRatio(linearBar(20), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.normalCount).toBeGreaterThan(0);
  });
});

describe('computeLineAtrRatioLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAtrRatioLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAtrRatioLayout({
      data: constBar(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above ratio', () => {
    const layout = computeLineAtrRatioLayout({
      data: constBar(30, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.ratioTop);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAtrRatioLayout({
      data: constBar(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('ratioMin is 0', () => {
    const layout = computeLineAtrRatioLayout({
      data: constBar(30, 10),
    });
    expect(layout.ratioMin).toBe(0);
  });

  it('y range includes both thresholds and midline', () => {
    const layout = computeLineAtrRatioLayout({
      data: constBar(30, 10),
      highThreshold: 1.2,
      lowThreshold: 0.8,
    });
    expect(layout.ratioMax).toBeGreaterThanOrEqual(1.2);
  });

  it('midline y is within ratio panel bounds', () => {
    const layout = computeLineAtrRatioLayout({
      data: constBar(30, 10),
    });
    expect(layout.midlineY).toBeGreaterThanOrEqual(layout.ratioTop);
    expect(layout.midlineY).toBeLessThanOrEqual(layout.ratioBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineAtrRatioLayout({
      data: [{ x: 0, high: 10, low: 10, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAtrRatioChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAtrRatioChart([])).toBe('No data');
  });

  it('mentions ATR ratio', () => {
    const desc = describeLineAtrRatioChart(constBar(30, 10));
    expect(desc).toContain('ATR ratio');
  });

  it('reports parameters', () => {
    const desc = describeLineAtrRatioChart(constBar(30, 10), {
      shortLength: 3,
      longLength: 8,
      highThreshold: 1.5,
      lowThreshold: 0.6,
    });
    expect(desc).toContain('shortLength 3');
    expect(desc).toContain('longLength 8');
    expect(desc).toContain('highThreshold 1.5');
    expect(desc).toContain('lowThreshold 0.6');
  });
});

describe('<ChartLineAtrRatio />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineAtrRatio data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-atr-ratio-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('ATR Ratio');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAtrRatio data={constBar(30, 10)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineAtrRatio
        data={constBar(30, 10)}
        shortLength={3}
        longLength={8}
        highThreshold={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-ratio"]',
    );
    expect(root?.getAttribute('data-short-length')).toBe('3');
    expect(root?.getAttribute('data-long-length')).toBe('8');
    expect(root?.getAttribute('data-high-threshold')).toBe('1.5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-ratio"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-atr-ratio-aria-desc"]',
    );
    expect(desc?.textContent).toContain('ATR ratio');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="ratio"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAtrRatio
        data={constBar(30, 10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="ratio"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'ratio',
      hidden: true,
    });
  });

  it('hides ratio when controlled hidden', () => {
    const { container } = render(
      <ChartLineAtrRatio
        data={constBar(30, 10)}
        hiddenSeries={['ratio']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-ratio-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders threshold lines by default', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-high-threshold-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-low-threshold-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders midline by default', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-midline"]',
      ),
    ).toBeTruthy();
  });

  it('hides midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineAtrRatio
        data={constBar(30, 10)}
        showMidline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-midline"]',
      ),
    ).toBe(null);
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineAtrRatio
        data={constBar(30, 10)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-high-threshold-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineAtrRatio
        data={constBar(30, 10)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAtrRatio
        data={constBar(30, 10)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAtrRatio
        data={constBar(30, 10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-ratio"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-atr-ratio-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the ratio line by default', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-ratio-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAtrRatio data={constBar(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-ratio-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAtrRatio
        data={constBar(30, 10)}
        defaultHiddenSeries={['ratio']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-ratio-line"]'),
    ).toBe(null);
  });
});

describe('ATR Ratio integration', () => {
  it('CONST h=l=c=K yields ratio = null across (K, sL, lL)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const [sL, lL] of [
        [3, 5],
        [5, 8],
      ] as Array<[number, number]>) {
        const series = constBar(lL + 5, K);
        const ch = computeLineAtrRatio(series, {
          shortLength: sL,
          longLength: lL,
        });
        for (let i = lL - 1; i < lL + 5; i += 1) {
          expect(ch.ratio[i]).toBe(null);
        }
      }
    }
  });

  it('LINEAR k+1 yields ratio = 1 post-warmup across (sL, lL)', () => {
    for (const [sL, lL] of [
      [3, 5],
      [5, 8],
      [5, 10],
    ] as Array<[number, number]>) {
      const series = linearBar(lL + 5);
      const ch = computeLineAtrRatio(series, {
        shortLength: sL,
        longLength: lL,
      });
      expect(ch.ratio[lL]).toBe(1);
    }
  });
});
