import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStochRsiCrossSig,
  applyLineStochRsiCrossSigEma,
  applyLineStochRsiCrossSigSma,
  applyLineStochRsiCrossSigWilder,
  classifyLineStochRsiCrossSigRegime,
  computeLineStochRsiCrossSig,
  computeLineStochRsiCrossSigLayout,
  describeLineStochRsiCrossSigChart,
  detectLineStochRsiCrossSigCrosses,
  getLineStochRsiCrossSigFinitePoints,
  normalizeLineStochRsiCrossSigLength,
  runLineStochRsiCrossSig,
  type ChartLineStochRsiCrossSigPoint,
} from './chart-line-stoch-rsi-cross-sig';

const constSeries = (n: number, K: number): ChartLineStochRsiCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineStochRsiCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineStochRsiCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineStochRsiCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineStochRsiCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineStochRsiCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineStochRsiCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineStochRsiCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineStochRsiCrossSigLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineStochRsiCrossSigLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineStochRsiCrossSigLength(21.7, 14)).toBe(21);
  });
});

describe('applyLineStochRsiCrossSigWilder', () => {
  it('matches the bit-exact CONST K via the short-circuit', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [2, 3, 5, 14]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineStochRsiCrossSigWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('applyLineStochRsiCrossSigSma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineStochRsiCrossSigSma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('applyLineStochRsiCrossSigEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineStochRsiCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineStochRsiCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineStochRsiCrossSig(null)).toEqual({
      k: [],
      signal: [],
      rsi: [],
    });
  });

  it('CONST K -> RSI = 50 -> stochRSI midpoint 50 -> K = 50 / signal = 50', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(80, K);
      const { k, signal, rsi } = computeLineStochRsiCrossSig(data, {
        rsiLength: 14,
        stochLength: 14,
        slowKLength: 3,
        signalLength: 9,
      });
      // RSI warmup at 14, then stoch needs 14 RSI values -> warmup at 27, slow K -> 29
      const stochWarmup = 14 + 14 - 1;
      const kWarmup = stochWarmup + 3 - 1;
      const sigWarmup = kWarmup + 9 - 1;
      for (let i = 14; i < data.length; i += 1) {
        expect(rsi[i]).toBe(50);
      }
      for (let i = kWarmup; i < data.length; i += 1) {
        expect(k[i]).toBe(50);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(50);
      }
    }
  });

  it('LINEAR UP -> RSI = 100 -> stochRSI midpoint 50 -> K = 50 / signal = 50', () => {
    for (const start of [10, 100]) {
      const data = linearSeries(80, start, 1);
      const { k, signal } = computeLineStochRsiCrossSig(data, {
        rsiLength: 14,
        stochLength: 14,
        slowKLength: 3,
        signalLength: 9,
      });
      const stochWarmup = 14 + 14 - 1;
      const kWarmup = stochWarmup + 3 - 1;
      const sigWarmup = kWarmup + 9 - 1;
      for (let i = kWarmup; i < data.length; i += 1) {
        expect(k[i]).toBe(50);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(50);
      }
    }
  });

  it('LINEAR DOWN -> RSI = 0 -> stochRSI midpoint 50 -> K = 50 / signal = 50', () => {
    for (const start of [200, 500]) {
      const data = linearSeries(80, start, -1);
      const { k, signal } = computeLineStochRsiCrossSig(data, {
        rsiLength: 14,
        stochLength: 14,
        slowKLength: 3,
        signalLength: 9,
      });
      const stochWarmup = 14 + 14 - 1;
      const kWarmup = stochWarmup + 3 - 1;
      const sigWarmup = kWarmup + 9 - 1;
      for (let i = kWarmup; i < data.length; i += 1) {
        expect(k[i]).toBe(50);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(50);
      }
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(80, 5);
    const { k } = computeLineStochRsiCrossSig(data);
    expect(k[40]).toBe(50);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineStochRsiCrossSig(data, {
      rsiLength: 14,
      stochLength: 14,
      slowKLength: 3,
      signalLength: 9,
    });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineStochRsiCrossSigRegime', () => {
  it('returns bullish when k > signal', () => {
    expect(classifyLineStochRsiCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when k < signal', () => {
    expect(classifyLineStochRsiCrossSigRegime(0, 1)).toBe('bearish');
  });
  it('returns neutral when k == signal', () => {
    expect(classifyLineStochRsiCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineStochRsiCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineStochRsiCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineStochRsiCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineStochRsiCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const k = [-1, 1, 1];
    const signal = [0, 0, 0];
    expect(detectLineStochRsiCrossSigCrosses(series, k, signal)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineStochRsiCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const k = [1, -1, -1];
    const signal = [0, 0, 0];
    expect(detectLineStochRsiCrossSigCrosses(series, k, signal)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null k or signal', () => {
    const series: ChartLineStochRsiCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineStochRsiCrossSigCrosses(series, [null, 1], [null, 0]),
    ).toEqual([]);
  });
});

describe('runLineStochRsiCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineStochRsiCrossSig(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineStochRsiCrossSig(constSeries(80, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineStochRsiCrossSig(constSeries(80, 5));
    expect(res.rsiLength).toBe(14);
    expect(res.stochLength).toBe(14);
    expect(res.slowKLength).toBe(3);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineStochRsiCrossSig(constSeries(80, 5), {
      rsiLength: 7,
      stochLength: 7,
      slowKLength: 5,
      signalLength: 5,
    });
    expect(res.rsiLength).toBe(7);
    expect(res.stochLength).toBe(7);
    expect(res.slowKLength).toBe(5);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineStochRsiCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineStochRsiCrossSig(constSeries(80, 7));
    const sigWarmup = 14 + 14 - 1 + 3 - 1 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });
});

describe('computeLineStochRsiCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineStochRsiCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.kPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineStochRsiCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineStochRsiCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineStochRsiCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and k paths', () => {
    const lo = computeLineStochRsiCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.kPath).toMatch(/^M\s/);
  });
});

describe('describeLineStochRsiCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineStochRsiCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineStochRsiCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions all four lengths', () => {
    const text = describeLineStochRsiCrossSigChart(linearSeries(12, 1, 1), {
      rsiLength: 7,
      stochLength: 21,
      slowKLength: 5,
      signalLength: 7,
    });
    expect(text).toContain('7');
    expect(text).toContain('21');
    expect(text).toContain('5');
  });
});

describe('<ChartLineStochRsiCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineStochRsiCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig data={linearSeries(80, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineStochRsiCrossSig
        ref={ref}
        data={linearSeries(80, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes rsi / stoch / slowK / signal lengths and total points', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        rsiLength={14}
        stochLength={14}
        slowKLength={3}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-rsi-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.rsiLength).toBe('14');
    expect(root?.dataset.stochLength).toBe('14');
    expect(root?.dataset.slowKLength).toBe('3');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('80');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig data={constSeries(80, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-rsi-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig data={linearSeries(80, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-rsi-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig data={linearSeries(80, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-stoch-rsi-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig data={linearSeries(80, 100, 1)} />,
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
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
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
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        rsiLength={14}
        stochLength={14}
        slowKLength={3}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-badge"]',
      )?.textContent,
    ).toContain('rsi 14');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-rsi-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders k and signal paths', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig data={linearSeries(80, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-k-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig data={linearSeries(80, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineStochRsiCrossSig
        data={linearSeries(80, 100, 1)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('StochRSI Cross Signal integration', () => {
  it('three anchors all yield k=50, signal=50, neutral, 0 crosses', () => {
    const sigWarmup = 14 + 14 - 1 + 3 - 1 + 9 - 1;

    // CONST
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineStochRsiCrossSig(constSeries(80, K), {
        rsiLength: 14,
        stochLength: 14,
        slowKLength: 3,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.k).toBe(50);
        expect(res.samples[i]?.signal).toBe(50);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }

    // LINEAR UP
    for (const start of [10, 100]) {
      const res = runLineStochRsiCrossSig(linearSeries(80, start, 1), {
        rsiLength: 14,
        stochLength: 14,
        slowKLength: 3,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.k).toBe(50);
        expect(res.samples[i]?.signal).toBe(50);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }

    // LINEAR DOWN
    for (const start of [200, 500]) {
      const res = runLineStochRsiCrossSig(linearSeries(80, start, -1), {
        rsiLength: 14,
        stochLength: 14,
        slowKLength: 3,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.k).toBe(50);
        expect(res.samples[i]?.signal).toBe(50);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
