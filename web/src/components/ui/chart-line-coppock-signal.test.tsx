import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCoppockSignal,
  applyLineCoppockSignalROC,
  applyLineCoppockSignalWMA,
  classifyLineCoppockSignalZone,
  computeLineCoppockSignal,
  computeLineCoppockSignalLayout,
  describeLineCoppockSignalChart,
  detectLineCoppockSignalCrosses,
  getLineCoppockSignalFinitePoints,
  normalizeLineCoppockSignalPeriod,
  runLineCoppockSignal,
  DEFAULT_CHART_LINE_COPPOCK_SIGNAL_LONG_ROC,
  DEFAULT_CHART_LINE_COPPOCK_SIGNAL_SHORT_ROC,
  DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WMA_PERIOD,
} from './chart-line-coppock-signal';
import type { ChartLineCoppockSignalPoint } from './chart-line-coppock-signal';

const constClose = (
  count: number,
  K: number,
): ChartLineCoppockSignalPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

// close[k] = 2^k. With L bars in the lookback,
// ROC(L) = (2^L - 1) * 100 at every bar i >= L.
const geometric = (count: number): ChartLineCoppockSignalPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: Math.pow(2, i) }));

describe('getLineCoppockSignalFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineCoppockSignalFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineCoppockSignalFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineCoppockSignalFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineCoppockSignalFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineCoppockSignalFinitePoints([
      null as unknown as ChartLineCoppockSignalPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineCoppockSignalPeriod', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineCoppockSignalPeriod(undefined, 14)).toBe(14);
  });

  it('floors fractional periods', () => {
    expect(normalizeLineCoppockSignalPeriod(7.9, 14)).toBe(7);
  });

  it('accepts 1', () => {
    expect(normalizeLineCoppockSignalPeriod(1, 14)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineCoppockSignalPeriod(0, 14)).toBe(14);
  });

  it('rejects negative', () => {
    expect(normalizeLineCoppockSignalPeriod(-1, 14)).toBe(14);
  });
});

describe('applyLineCoppockSignalROC', () => {
  it('warmup region is null', () => {
    const out = applyLineCoppockSignalROC([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).not.toBe(null);
  });

  it('CONST close yields ROC = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(10).fill(K);
      const out = applyLineCoppockSignalROC(closes, 4);
      for (let i = 4; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('ZERO close yields null everywhere', () => {
    const closes = Array(10).fill(0);
    const out = applyLineCoppockSignalROC(closes, 4);
    for (let i = 0; i < 10; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('GEOMETRIC close=2^k yields ROC = (2^L - 1) * 100 bit-exact', () => {
    const N = 20;
    const closes = Array.from({ length: N }, (_, i) => Math.pow(2, i));
    for (const L of [2, 4, 8, 11, 14]) {
      const out = applyLineCoppockSignalROC(closes, L);
      const expected = (Math.pow(2, L) - 1) * 100;
      for (let i = L; i < N; i += 1) {
        expect(out[i]).toBe(expected);
      }
    }
  });

  it('returns null when past close is zero', () => {
    const closes = [0, 1, 2, 3, 4];
    const out = applyLineCoppockSignalROC(closes, 4);
    expect(out[4]).toBe(null);
  });
});

describe('applyLineCoppockSignalWMA', () => {
  it('warmup region is null', () => {
    const out = applyLineCoppockSignalWMA([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).not.toBe(null);
  });

  it('WMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 100, -3]) {
      const values = Array(10).fill(K);
      const out = applyLineCoppockSignalWMA(values, 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('null entry in window short-circuits to null', () => {
    const values: Array<number | null> = [1, null, 3, 4];
    const out = applyLineCoppockSignalWMA(values, 4);
    expect(out[3]).toBe(null);
  });
});

describe('computeLineCoppockSignal', () => {
  it('returns empty for null', () => {
    const ch = computeLineCoppockSignal(null);
    expect(ch.coppock).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineCoppockSignal([]);
    expect(ch.coppock).toEqual([]);
  });

  it('CONST close yields coppock = 0 at every valid bar (bit-exact)', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(40).fill(K);
      const ch = computeLineCoppockSignal(closes);
      const minBar =
        Math.max(
          DEFAULT_CHART_LINE_COPPOCK_SIGNAL_LONG_ROC,
          DEFAULT_CHART_LINE_COPPOCK_SIGNAL_SHORT_ROC,
        ) +
        DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WMA_PERIOD -
        1;
      for (let i = minBar; i < 40; i += 1) {
        expect(ch.coppock[i]).toBe(0);
      }
    }
  });

  it('GEOMETRIC close=2^k yields coppock = 1843000 bit-exact (defaults)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => Math.pow(2, i));
    const ch = computeLineCoppockSignal(closes);
    const minBar =
      DEFAULT_CHART_LINE_COPPOCK_SIGNAL_LONG_ROC +
      DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WMA_PERIOD -
      1;
    const expected = (Math.pow(2, 14) - 1) * 100 + (Math.pow(2, 11) - 1) * 100;
    expect(expected).toBe(1843000);
    for (let i = minBar; i < 30; i += 1) {
      expect(ch.coppock[i]).toBe(1843000);
    }
  });

  it('GEOMETRIC close=2^k yields coppock = 1800 (small preset 4/2/3)', () => {
    const closes = Array.from({ length: 12 }, (_, i) => Math.pow(2, i));
    const ch = computeLineCoppockSignal(closes, {
      longROC: 4,
      shortROC: 2,
      wmaPeriod: 3,
    });
    const minBar = 4 + 3 - 1;
    // (2^4 - 1) * 100 + (2^2 - 1) * 100 = 1500 + 300 = 1800
    for (let i = minBar; i < 12; i += 1) {
      expect(ch.coppock[i]).toBe(1800);
    }
  });

  it('ZERO close yields coppock = null everywhere', () => {
    const closes = Array(40).fill(0);
    const ch = computeLineCoppockSignal(closes);
    for (let i = 0; i < 40; i += 1) {
      expect(ch.coppock[i]).toBe(null);
    }
  });

  it('output length matches input length', () => {
    const closes = Array(40).fill(10);
    const ch = computeLineCoppockSignal(closes);
    expect(ch.coppock.length).toBe(40);
    expect(ch.sumROC.length).toBe(40);
  });

  it('does not mutate input', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i + 1);
    const snap = closes.slice();
    computeLineCoppockSignal(closes);
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineCoppockSignalZone', () => {
  it('classifies positive', () => {
    expect(classifyLineCoppockSignalZone(2)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineCoppockSignalZone(-2)).toBe('negative');
  });

  it('classifies zero', () => {
    expect(classifyLineCoppockSignalZone(0)).toBe('zero');
  });

  it('returns none for null', () => {
    expect(classifyLineCoppockSignalZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineCoppockSignalZone(Number.NaN)).toBe('none');
  });
});

describe('detectLineCoppockSignalCrosses', () => {
  it('returns [null, null] for warmup-only data', () => {
    expect(detectLineCoppockSignalCrosses([null, null])).toEqual([null, null]);
  });

  it('flags up when prev <= 0 and current > 0', () => {
    const crosses = detectLineCoppockSignalCrosses([null, -1, 1]);
    expect(crosses[2]).toBe('up');
  });

  it('flags down when prev >= 0 and current < 0', () => {
    const crosses = detectLineCoppockSignalCrosses([null, 1, -1]);
    expect(crosses[2]).toBe('down');
  });

  it('flags up from zero (prev == 0 to current > 0)', () => {
    const crosses = detectLineCoppockSignalCrosses([null, 0, 1]);
    expect(crosses[2]).toBe('up');
  });

  it('flags down from zero (prev == 0 to current < 0)', () => {
    const crosses = detectLineCoppockSignalCrosses([null, 0, -1]);
    expect(crosses[2]).toBe('down');
  });

  it('no cross when both positive', () => {
    const crosses = detectLineCoppockSignalCrosses([null, 1, 2]);
    expect(crosses[2]).toBe(null);
  });

  it('no cross when both negative', () => {
    const crosses = detectLineCoppockSignalCrosses([null, -1, -2]);
    expect(crosses[2]).toBe(null);
  });

  it('detects multiple crosses', () => {
    const crosses = detectLineCoppockSignalCrosses([null, 1, -1, 1]);
    expect(crosses[2]).toBe('down');
    expect(crosses[3]).toBe('up');
  });

  it('first defined bar is not a cross', () => {
    const crosses = detectLineCoppockSignalCrosses([null, 1]);
    expect(crosses[1]).toBe(null);
  });
});

describe('runLineCoppockSignal', () => {
  it('marks ok=false when data is shorter than warmup', () => {
    const run = runLineCoppockSignal(constClose(23, 10));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true at warmup boundary', () => {
    const run = runLineCoppockSignal(constClose(24, 10));
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineCoppockSignal(constClose(40, 10));
    expect(run.longROC).toBe(DEFAULT_CHART_LINE_COPPOCK_SIGNAL_LONG_ROC);
    expect(run.shortROC).toBe(DEFAULT_CHART_LINE_COPPOCK_SIGNAL_SHORT_ROC);
    expect(run.wmaPeriod).toBe(DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WMA_PERIOD);
  });

  it('respects explicit options', () => {
    const run = runLineCoppockSignal(constClose(40, 10), {
      longROC: 4,
      shortROC: 2,
      wmaPeriod: 3,
    });
    expect(run.longROC).toBe(4);
    expect(run.shortROC).toBe(2);
    expect(run.wmaPeriod).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineCoppockSignalPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineCoppockSignal(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as zero zone', () => {
    const run = runLineCoppockSignal(constClose(40, 10));
    expect(run.zeroCount).toBeGreaterThan(0);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('GEOMETRIC close classifies post-warmup as positive zone', () => {
    const run = runLineCoppockSignal(geometric(30));
    expect(run.positiveCount).toBeGreaterThan(0);
  });
});

describe('computeLineCoppockSignalLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineCoppockSignalLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineCoppockSignalLayout({
      data: constClose(40, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineCoppockSignalLayout({
      data: constClose(40, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above coppock', () => {
    const layout = computeLineCoppockSignalLayout({
      data: constClose(40, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.coppockTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineCoppockSignalLayout({
      data: constClose(40, 10),
      panelGap: 24,
    });
    expect(layout.coppockTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineCoppockSignalLayout({
      data: constClose(40, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('CONST yields zero markers (no crosses)', () => {
    const layout = computeLineCoppockSignalLayout({
      data: constClose(40, 10),
    });
    expect(layout.markers.length).toBe(0);
  });

  it('y range always includes zero', () => {
    const layout = computeLineCoppockSignalLayout({
      data: geometric(30),
    });
    expect(layout.coppockMin).toBeLessThanOrEqual(0);
    expect(layout.coppockMax).toBeGreaterThanOrEqual(0);
  });

  it('zero line y is between coppockTop and coppockBottom', () => {
    const layout = computeLineCoppockSignalLayout({
      data: constClose(40, 10),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.coppockTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.coppockBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineCoppockSignalLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCoppockSignalChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineCoppockSignalChart([])).toBe('No data');
  });

  it('mentions Coppock', () => {
    const desc = describeLineCoppockSignalChart(constClose(40, 10));
    expect(desc).toContain('Coppock');
  });

  it('mentions the formula sumROC', () => {
    const desc = describeLineCoppockSignalChart(constClose(40, 10));
    expect(desc).toContain('sumROC');
  });

  it('reports the periods', () => {
    const desc = describeLineCoppockSignalChart(constClose(40, 10), {
      longROC: 7,
      shortROC: 5,
      wmaPeriod: 4,
    });
    expect(desc).toContain('longROC 7');
    expect(desc).toContain('shortROC 5');
    expect(desc).toContain('wmaPeriod 4');
  });
});

describe('<ChartLineCoppockSignal />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineCoppockSignal data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-coppock-signal-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Coppock');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCoppockSignal data={constClose(40, 10)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-long-roc / data-short-roc / data-wma-period', () => {
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        longROC={7}
        shortROC={5}
        wmaPeriod={4}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock-signal"]',
    );
    expect(root?.getAttribute('data-long-roc')).toBe('7');
    expect(root?.getAttribute('data-short-roc')).toBe('5');
    expect(root?.getAttribute('data-wma-period')).toBe('4');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock-signal"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('40');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-coppock-signal-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Coppock');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="coppock"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="coppock"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'coppock',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        hiddenSeries={['coppock']}
      />,
    );
    const button = container.querySelector('[data-series-id="coppock"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides coppock line when controlled hidden', () => {
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        hiddenSeries={['coppock']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-coppock-signal-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-coppock-signal-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-grid"]',
      ),
    ).toBe(null);
  });

  it('renders the zero line by default', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock-signal"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock-signal"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-coppock-signal-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the coppock line by default', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineCoppockSignal
        data={constClose(40, 10)}
        defaultHiddenSeries={['coppock']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-line"]',
      ),
    ).toBe(null);
  });

  it('does not render a tooltip without hover', () => {
    const { container } = render(
      <ChartLineCoppockSignal data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-signal-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Coppock integration', () => {
  it('CONST close yields coppock = 0 across (K, longROC, shortROC, wmaPeriod)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const long of [4, 6, 8]) {
        for (const short of [2, 3]) {
          for (const wma of [3, 4]) {
            const closes = Array(long + wma + 5).fill(K);
            const ch = computeLineCoppockSignal(closes, {
              longROC: long,
              shortROC: short,
              wmaPeriod: wma,
            });
            const minBar = Math.max(long, short) + wma - 1;
            for (let i = minBar; i < closes.length; i += 1) {
              expect(ch.coppock[i]).toBe(0);
            }
          }
        }
      }
    }
  });

  it('GEOMETRIC close=2^k yields coppock = 1843000 across the post-warmup window (defaults)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => Math.pow(2, i));
    const ch = computeLineCoppockSignal(closes);
    const minBar =
      DEFAULT_CHART_LINE_COPPOCK_SIGNAL_LONG_ROC +
      DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WMA_PERIOD -
      1;
    for (let i = minBar; i < 30; i += 1) {
      expect(ch.coppock[i]).toBe(1843000);
    }
  });
});
