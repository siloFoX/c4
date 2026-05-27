import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAccumulationCross,
  applyLineAccumulationCrossEma,
  classifyLineAccumulationCrossRegime,
  computeLineAccumulationCross,
  computeLineAccumulationCrossLayout,
  describeLineAccumulationCrossChart,
  detectLineAccumulationCrossCrosses,
  getLineAccumulationCrossFinitePoints,
  normalizeLineAccumulationCrossLength,
  runLineAccumulationCross,
  type ChartLineAccumulationCrossPoint,
} from './chart-line-accumulation-cross';

const constSeries = (n: number, K: number): ChartLineAccumulationCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineAccumulationCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineAccumulationCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineAccumulationCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineAccumulationCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineAccumulationCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineAccumulationCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineAccumulationCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineAccumulationCrossLength(0, 9)).toBe(9);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineAccumulationCrossLength('x', 9)).toBe(9);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineAccumulationCrossLength(20.9, 9)).toBe(20);
  });
});

describe('applyLineAccumulationCrossEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineAccumulationCrossEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineAccumulationCross', () => {
  it('handles null series', () => {
    expect(computeLineAccumulationCross(null)).toEqual({
      ad: [],
      signal: [],
    });
  });

  it('CONST K -> ad = 0, signal = 0 every bar', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineAccumulationCross(data);
      for (let i = 0; i < data.length; i += 1) {
        expect(ch.ad[i]).toBe(0);
      }
      for (let i = 8; i < data.length; i += 1) {
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineAccumulationCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('LINEAR UP -> ad grows positively over time', () => {
    const data = linearSeries(40, 1, 1);
    const ch = computeLineAccumulationCross(data);
    expect(ch.ad[39]).not.toBeNull();
    expect(ch.ad[39]! > ch.ad[20]!).toBe(true);
  });

  it('LINEAR DOWN -> ad grows negatively over time', () => {
    const data = linearSeries(40, 40, -1);
    const ch = computeLineAccumulationCross(data);
    expect(ch.ad[39]).not.toBeNull();
    expect(ch.ad[39]! < ch.ad[20]!).toBe(true);
  });
});

describe('classifyLineAccumulationCrossRegime', () => {
  it('returns bullish when ad > signal', () => {
    expect(classifyLineAccumulationCrossRegime(10, 5)).toBe('bullish');
  });
  it('returns bearish when ad < signal', () => {
    expect(classifyLineAccumulationCrossRegime(5, 10)).toBe('bearish');
  });
  it('returns neutral when ad == signal', () => {
    expect(classifyLineAccumulationCrossRegime(5, 5)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineAccumulationCrossRegime(null, 5)).toBe('none');
    expect(classifyLineAccumulationCrossRegime(5, null)).toBe('none');
  });
});

describe('detectLineAccumulationCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineAccumulationCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineAccumulationCrossCrosses(series, [-1, 1], [0, 0]),
    ).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineAccumulationCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineAccumulationCrossCrosses(series, [1, -1], [0, 0]),
    ).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineAccumulationCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineAccumulationCrossCrosses(series, [null, 1], [null, 0]),
    ).toEqual([]);
  });
});

describe('runLineAccumulationCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineAccumulationCross(constSeries(8, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineAccumulationCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineAccumulationCross(constSeries(40, 5));
    expect(res.barLength).toBe(2);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineAccumulationCross(constSeries(40, 5), {
      barLength: 3,
      signalLength: 5,
    });
    expect(res.barLength).toBe(3);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineAccumulationCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineAccumulationCross(constSeries(40, 7));
    for (let i = 8; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineAccumulationCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineAccumulationCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.adPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineAccumulationCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineAccumulationCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineAccumulationCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price, ad, signal paths', () => {
    const lo = computeLineAccumulationCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.adPath).toMatch(/^M\s/);
  });
});

describe('describeLineAccumulationCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineAccumulationCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineAccumulationCrossChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions lengths', () => {
    const text = describeLineAccumulationCrossChart(linearSeries(12, 1, 1), {
      barLength: 3,
      signalLength: 5,
    });
    expect(text).toContain('3');
    expect(text).toContain('5');
  });
});

describe('<ChartLineAccumulationCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineAccumulationCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineAccumulationCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineAccumulationCross
        ref={ref}
        data={linearSeries(40, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths / total points as data attributes', () => {
    const { container } = render(
      <ChartLineAccumulationCross data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-accumulation-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.barLength).toBe('2');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineAccumulationCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-accumulation-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineAccumulationCross data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-accumulation-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineAccumulationCross data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-accumulation-cross-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineAccumulationCross data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="ad"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAccumulationCross
        data={linearSeries(40, 100, 1)}
        hiddenSeries={['signal']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'signal',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineAccumulationCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-badge"]',
      )?.textContent,
    ).toContain('bar 2');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineAccumulationCross
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineAccumulationCross
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAccumulationCross
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineAccumulationCross
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-accumulation-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineAccumulationCross
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders ad and signal paths', () => {
    const { container } = render(
      <ChartLineAccumulationCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-ad-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineAccumulationCross
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineAccumulationCross
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineAccumulationCross
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zero line', () => {
    const { container } = render(
      <ChartLineAccumulationCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-accumulation-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Accumulation Cross integration', () => {
  it('CONST K -> ad=signal=0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineAccumulationCross(constSeries(40, K));
      for (let i = 8; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.ad).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
