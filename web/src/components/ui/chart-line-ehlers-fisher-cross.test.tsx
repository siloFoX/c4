import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineEhlersFisherCross,
  applyLineEhlersFisherCrossEma,
  classifyLineEhlersFisherCrossRegime,
  computeLineEhlersFisherCross,
  computeLineEhlersFisherCrossLayout,
  describeLineEhlersFisherCrossChart,
  detectLineEhlersFisherCrossCrosses,
  getLineEhlersFisherCrossFinitePoints,
  normalizeLineEhlersFisherCrossLength,
  runLineEhlersFisherCross,
  type ChartLineEhlersFisherCrossPoint,
} from './chart-line-ehlers-fisher-cross';

const constSeries = (
  n: number,
  K: number,
): ChartLineEhlersFisherCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineEhlersFisherCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineEhlersFisherCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineEhlersFisherCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineEhlersFisherCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineEhlersFisherCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineEhlersFisherCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineEhlersFisherCrossLength', () => {
  it('returns fallback when length is below 2', () => {
    expect(normalizeLineEhlersFisherCrossLength(1, 10)).toBe(10);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineEhlersFisherCrossLength('x', 10)).toBe(10);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineEhlersFisherCrossLength(14.7, 10)).toBe(14);
  });
});

describe('applyLineEhlersFisherCrossEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineEhlersFisherCrossEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineEhlersFisherCross', () => {
  it('handles null series', () => {
    expect(computeLineEhlersFisherCross(null)).toEqual({
      fisher: [],
      signal: [],
    });
  });

  it('CONST close = K -> fisher = 0 / signal = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const { fisher, signal } = computeLineEhlersFisherCross(data, {
        length: 10,
        signalLength: 9,
      });
      const fisherWarmup = 10 - 1;
      const sigWarmup = fisherWarmup + 9 - 1;
      for (let i = fisherWarmup; i < data.length; i += 1) {
        expect(fisher[i]).toBe(0);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(0);
      }
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(40, 5);
    const { fisher } = computeLineEhlersFisherCross(data);
    expect(fisher[20]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineEhlersFisherCross(data, { length: 10, signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineEhlersFisherCrossRegime', () => {
  it('returns bullish when fisher > signal', () => {
    expect(classifyLineEhlersFisherCrossRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when fisher < signal', () => {
    expect(classifyLineEhlersFisherCrossRegime(0, 1)).toBe('bearish');
  });
  it('returns neutral when fisher == signal', () => {
    expect(classifyLineEhlersFisherCrossRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineEhlersFisherCrossRegime(null, 1)).toBe('none');
    expect(classifyLineEhlersFisherCrossRegime(1, null)).toBe('none');
  });
});

describe('detectLineEhlersFisherCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineEhlersFisherCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const fisher = [-1, 1, 1];
    const signal = [0, 0, 0];
    expect(detectLineEhlersFisherCrossCrosses(series, fisher, signal)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineEhlersFisherCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const fisher = [1, -1, -1];
    const signal = [0, 0, 0];
    expect(detectLineEhlersFisherCrossCrosses(series, fisher, signal)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null fisher or signal', () => {
    const series: ChartLineEhlersFisherCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineEhlersFisherCrossCrosses(series, [null, 1], [null, 0]),
    ).toEqual([]);
  });
});

describe('runLineEhlersFisherCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineEhlersFisherCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineEhlersFisherCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineEhlersFisherCross(constSeries(40, 5));
    expect(res.length).toBe(10);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineEhlersFisherCross(constSeries(40, 5), {
      length: 14,
      signalLength: 5,
    });
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineEhlersFisherCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineEhlersFisherCross(constSeries(40, 7));
    const sigWarmup = 10 - 1 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });
});

describe('computeLineEhlersFisherCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineEhlersFisherCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.fisherPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineEhlersFisherCrossLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineEhlersFisherCrossLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineEhlersFisherCrossLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and fisher paths', () => {
    const lo = computeLineEhlersFisherCrossLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.fisherPath).toMatch(/^M\s/);
  });
});

describe('describeLineEhlersFisherCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineEhlersFisherCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineEhlersFisherCrossChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions both lengths', () => {
    const text = describeLineEhlersFisherCrossChart(linearSeries(12, 1, 1), {
      length: 14,
      signalLength: 7,
    });
    expect(text).toContain('14');
    expect(text).toContain('7');
  });
});

describe('<ChartLineEhlersFisherCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineEhlersFisherCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineEhlersFisherCross
        ref={ref}
        data={linearSeries(40, 10, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / signalLength / total points', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        length={10}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-fisher-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('10');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-fisher-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross data={linearSeries(40, 10, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ehlers-fisher-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross data={linearSeries(40, 10, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-ehlers-fisher-cross-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross data={linearSeries(40, 10, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
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

  it('shows config badge with length and signal', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        length={10}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-badge"]',
      )?.textContent,
    ).toContain('length 10');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ehlers-fisher-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders fisher and signal paths', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-fisher-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ehlers-fisher-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineEhlersFisherCross
        data={linearSeries(40, 10, 1)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Ehlers Fisher Cross integration', () => {
  it('CONST K -> fisher = 0 / signal = 0 / regime neutral / 0 crosses', () => {
    const sigWarmup = 10 - 1 + 9 - 1;
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineEhlersFisherCross(constSeries(40, K), {
        length: 10,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.fisher).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
