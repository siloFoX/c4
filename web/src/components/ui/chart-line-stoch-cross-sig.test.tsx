import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStochCrossSig,
  applyLineStochCrossSigEma,
  applyLineStochCrossSigSma,
  classifyLineStochCrossSigRegime,
  computeLineStochCrossSig,
  computeLineStochCrossSigLayout,
  describeLineStochCrossSigChart,
  detectLineStochCrossSigCrosses,
  getLineStochCrossSigFinitePoints,
  normalizeLineStochCrossSigLength,
  runLineStochCrossSig,
  type ChartLineStochCrossSigPoint,
} from './chart-line-stoch-cross-sig';

const constSeries = (n: number, K: number): ChartLineStochCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineStochCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineStochCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineStochCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineStochCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineStochCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineStochCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineStochCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineStochCrossSigLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineStochCrossSigLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineStochCrossSigLength(7.7, 14)).toBe(7);
  });
});

describe('applyLineStochCrossSigSma', () => {
  it('CONST short-circuit yields bit-exact constant', () => {
    for (const K of [0, 50, 100]) {
      for (const n of [1, 3, 5]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineStochCrossSigSma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('returns identity for length=1', () => {
    expect(applyLineStochCrossSigSma([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it('null breaks the window', () => {
    expect(applyLineStochCrossSigSma([1, null, 1], 2)).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe('applyLineStochCrossSigEma', () => {
  it('CONST short-circuit yields bit-exact constant', () => {
    for (const K of [0, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineStochCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineStochCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineStochCrossSig(null)).toEqual({
      k: [],
      signal: [],
    });
  });

  it('CONST close = K -> %K = 50, signal = 50', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineStochCrossSig(data);
      const warmup = 14 - 1 + 3 - 1 + 3 - 1;
      for (let i = warmup; i < data.length; i += 1) {
        expect(ch.k[i]).toBe(50);
        expect(ch.signal[i]).toBe(50);
      }
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineStochCrossSig(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineStochCrossSigRegime', () => {
  it('returns bullish when k > signal', () => {
    expect(classifyLineStochCrossSigRegime(60, 40)).toBe('bullish');
  });
  it('returns bearish when k < signal', () => {
    expect(classifyLineStochCrossSigRegime(40, 60)).toBe('bearish');
  });
  it('returns neutral when k == signal', () => {
    expect(classifyLineStochCrossSigRegime(50, 50)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineStochCrossSigRegime(null, 50)).toBe('none');
    expect(classifyLineStochCrossSigRegime(50, null)).toBe('none');
  });
});

describe('detectLineStochCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineStochCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const k = [-1, 1, 1];
    const sig = [0, 0, 0];
    expect(detectLineStochCrossSigCrosses(series, k, sig)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineStochCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const k = [1, -1, -1];
    const sig = [0, 0, 0];
    expect(detectLineStochCrossSigCrosses(series, k, sig)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineStochCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineStochCrossSigCrosses(series, [null, 1], [null, 0]),
    ).toEqual([]);
  });
});

describe('runLineStochCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineStochCrossSig(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineStochCrossSig(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineStochCrossSig(constSeries(40, 5));
    expect(res.length).toBe(14);
    expect(res.kSmoothing).toBe(3);
    expect(res.signalLength).toBe(3);
  });

  it('accepts custom lengths', () => {
    const res = runLineStochCrossSig(constSeries(40, 5), {
      length: 9,
      kSmoothing: 1,
      signalLength: 5,
    });
    expect(res.length).toBe(9);
    expect(res.kSmoothing).toBe(1);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineStochCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineStochCrossSig(constSeries(40, 7));
    const warmup = 14 - 1 + 3 - 1 + 3 - 1;
    for (let i = warmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });
});

describe('computeLineStochCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineStochCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.kPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineStochCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineStochCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc scale is fixed to 0-100', () => {
    const lo = computeLineStochCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.oscMin).toBe(0);
    expect(lo.oscMax).toBe(100);
  });

  it('mid / overbought / oversold lie within osc panel', () => {
    const lo = computeLineStochCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.overboughtY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.oversoldY).toBeLessThanOrEqual(lo.oscBottom);
    expect(lo.midY).toBeGreaterThan(lo.overboughtY);
    expect(lo.midY).toBeLessThan(lo.oversoldY);
  });

  it('renders price and %K paths', () => {
    const lo = computeLineStochCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.kPath).toMatch(/^M\s/);
  });
});

describe('describeLineStochCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineStochCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineStochCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions lengths', () => {
    const text = describeLineStochCrossSigChart(linearSeries(12, 1, 1), {
      length: 9,
      kSmoothing: 1,
      signalLength: 5,
    });
    expect(text).toContain('9');
    expect(text).toContain('1');
    expect(text).toContain('5');
  });
});

describe('<ChartLineStochCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineStochCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineStochCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineStochCrossSig
        ref={ref}
        data={linearSeries(40, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineStochCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.kSmoothing).toBe('3');
    expect(root?.dataset.signalLength).toBe('3');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineStochCrossSig data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineStochCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineStochCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-stoch-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineStochCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="k"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineStochCrossSig
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
      <ChartLineStochCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineStochCrossSig
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineStochCrossSig
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides bands when showBands=false', () => {
    const { container } = render(
      <ChartLineStochCrossSig
        data={linearSeries(40, 100, 1)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-bands"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineStochCrossSig
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineStochCrossSig
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineStochCrossSig
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders %K and signal paths', () => {
    const { container } = render(
      <ChartLineStochCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-k-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineStochCrossSig
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineStochCrossSig
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineStochCrossSig
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Stochastic Cross Signal integration', () => {
  it('CONST K -> %K = 50, signal = 50 bit-exact, regime neutral, 0 crosses', () => {
    const warmup = 14 - 1 + 3 - 1 + 3 - 1;
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineStochCrossSig(constSeries(40, K));
      for (let i = warmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.k).toBe(50);
        expect(res.samples[i]?.signal).toBe(50);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
