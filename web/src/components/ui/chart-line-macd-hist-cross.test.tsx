import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMacdHistCross,
  applyLineMacdHistCrossEma,
  classifyLineMacdHistCrossRegime,
  computeLineMacdHistCross,
  computeLineMacdHistCrossLayout,
  describeLineMacdHistCrossChart,
  detectLineMacdHistCrossCrosses,
  getLineMacdHistCrossFinitePoints,
  normalizeLineMacdHistCrossLength,
  runLineMacdHistCross,
  type ChartLineMacdHistCrossPoint,
} from './chart-line-macd-hist-cross';

const constSeries = (n: number, K: number): ChartLineMacdHistCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineMacdHistCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineMacdHistCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineMacdHistCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineMacdHistCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineMacdHistCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineMacdHistCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineMacdHistCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineMacdHistCrossLength(0, 12)).toBe(12);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineMacdHistCrossLength('x', 12)).toBe(12);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineMacdHistCrossLength(14.7, 12)).toBe(14);
  });
});

describe('applyLineMacdHistCrossEma', () => {
  it('matches bit-exact CONST K via precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 9, 12, 26]) {
        const v = new Array<number>(40).fill(K);
        const out = applyLineMacdHistCrossEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('handles all nulls', () => {
    const out = applyLineMacdHistCrossEma([null, null, null], 2);
    expect(out).toEqual([null, null, null]);
  });

  it('returns empty for empty input', () => {
    expect(applyLineMacdHistCrossEma([], 9)).toEqual([]);
  });
});

describe('computeLineMacdHistCross', () => {
  it('handles null series', () => {
    expect(computeLineMacdHistCross(null)).toEqual({
      emaFast: [],
      emaSlow: [],
      macd: [],
      signal: [],
      histogram: [],
    });
  });

  it('CONST close = K -> macd = 0, signal = 0, histogram = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(60, K);
      const ch = computeLineMacdHistCross(data);
      const slow = 26;
      const sig = 9;
      const warmup = slow - 1 + sig - 1;
      for (let i = warmup; i < data.length; i += 1) {
        expect(ch.macd[i]).toBe(0);
        expect(ch.signal[i]).toBe(0);
        expect(ch.histogram[i]).toBe(0);
      }
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineMacdHistCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineMacdHistCrossRegime', () => {
  it('returns bullish when hist > 0', () => {
    expect(classifyLineMacdHistCrossRegime(0.5)).toBe('bullish');
  });
  it('returns bearish when hist < 0', () => {
    expect(classifyLineMacdHistCrossRegime(-0.5)).toBe('bearish');
  });
  it('returns neutral when hist == 0', () => {
    expect(classifyLineMacdHistCrossRegime(0)).toBe('neutral');
  });
  it('returns none when hist is null', () => {
    expect(classifyLineMacdHistCrossRegime(null)).toBe('none');
  });
});

describe('detectLineMacdHistCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineMacdHistCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const hist = [-1, 1, 1];
    expect(detectLineMacdHistCrossCrosses(series, hist)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineMacdHistCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const hist = [1, -1, -1];
    expect(detectLineMacdHistCrossCrosses(series, hist)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('flags zero crossing from zero to positive', () => {
    const series: ChartLineMacdHistCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineMacdHistCrossCrosses(series, [0, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags zero crossing from zero to negative', () => {
    const series: ChartLineMacdHistCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineMacdHistCrossCrosses(series, [0, -1])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineMacdHistCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineMacdHistCrossCrosses(series, [null, 1])).toEqual([]);
  });
});

describe('runLineMacdHistCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineMacdHistCross(constSeries(20, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineMacdHistCross(constSeries(60, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineMacdHistCross(constSeries(60, 5));
    expect(res.fastLength).toBe(12);
    expect(res.slowLength).toBe(26);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineMacdHistCross(constSeries(60, 5), {
      fastLength: 5,
      slowLength: 13,
      signalLength: 4,
    });
    expect(res.fastLength).toBe(5);
    expect(res.slowLength).toBe(13);
    expect(res.signalLength).toBe(4);
  });

  it('sorts series by x', () => {
    const res = runLineMacdHistCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineMacdHistCross(constSeries(60, 7));
    const warmup = 26 - 1 + 9 - 1;
    for (let i = warmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });
});

describe('computeLineMacdHistCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineMacdHistCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.histogramBars).toEqual([]);
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineMacdHistCrossLayout({
      data: linearSeries(60, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineMacdHistCrossLayout({
      data: linearSeries(60, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('renders price path', () => {
    const lo = computeLineMacdHistCrossLayout({
      data: linearSeries(60, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineMacdHistCrossLayout({
      data: linearSeries(60, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });
});

describe('describeLineMacdHistCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineMacdHistCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineMacdHistCrossChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions all lengths', () => {
    const text = describeLineMacdHistCrossChart(linearSeries(12, 1, 1), {
      fastLength: 5,
      slowLength: 13,
      signalLength: 4,
    });
    expect(text).toContain('5');
    expect(text).toContain('13');
    expect(text).toContain('4');
  });
});

describe('<ChartLineMacdHistCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineMacdHistCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={linearSeries(60, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineMacdHistCross
        ref={ref}
        data={linearSeries(60, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={linearSeries(60, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-hist-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.fastLength).toBe('12');
    expect(root?.dataset.slowLength).toBe('26');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('60');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={constSeries(60, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-hist-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={linearSeries(60, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-macd-hist-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders two legend items', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={linearSeries(60, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-macd-hist-cross-legend"] button',
    );
    expect(buttons.length).toBe(2);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={linearSeries(60, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="histogram"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMacdHistCross
        data={linearSeries(60, 100, 1)}
        hiddenSeries={['histogram']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="histogram"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'histogram',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={linearSeries(60, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-badge"]',
      )?.textContent,
    ).toContain('fast 12');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineMacdHistCross
        data={linearSeries(60, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineMacdHistCross
        data={linearSeries(60, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineMacdHistCross
        data={linearSeries(60, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineMacdHistCross
        data={linearSeries(60, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-hist-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineMacdHistCross
        data={linearSeries(60, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders histogram bars', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={linearSeries(60, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-histogram"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={linearSeries(60, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineMacdHistCross
        data={linearSeries(60, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineMacdHistCross
        data={linearSeries(60, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides histogram when defaultHiddenSeries includes histogram', () => {
    const { container } = render(
      <ChartLineMacdHistCross
        data={linearSeries(60, 100, 1)}
        defaultHiddenSeries={['histogram']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="histogram"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineMacdHistCross data={linearSeries(60, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-hist-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('MACD Histogram Cross integration', () => {
  it('CONST K -> hist = 0 bit-exact, regime neutral, 0 crosses', () => {
    const warmup = 26 - 1 + 9 - 1;
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineMacdHistCross(constSeries(60, K));
      for (let i = warmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.histogram).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
