import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAtrCrossSig,
  applyLineAtrCrossSigEma,
  applyLineAtrCrossSigWilder,
  classifyLineAtrCrossSigRegime,
  computeLineAtrCrossSig,
  computeLineAtrCrossSigLayout,
  describeLineAtrCrossSigChart,
  detectLineAtrCrossSigCrosses,
  getLineAtrCrossSigFinitePoints,
  normalizeLineAtrCrossSigLength,
  runLineAtrCrossSig,
  type ChartLineAtrCrossSigPoint,
} from './chart-line-atr-cross-sig';

const constSeries = (n: number, K: number): ChartLineAtrCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineAtrCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineAtrCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineAtrCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineAtrCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineAtrCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineAtrCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineAtrCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineAtrCrossSigLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineAtrCrossSigLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineAtrCrossSigLength(21.7, 14)).toBe(21);
  });
});

describe('applyLineAtrCrossSigWilder', () => {
  it('matches the bit-exact CONST K via the short-circuit', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [2, 3, 5, 9, 14]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineAtrCrossSigWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('applyLineAtrCrossSigEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineAtrCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineAtrCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineAtrCrossSig(null)).toEqual({ atr: [], signal: [] });
  });

  it('CONST K -> ATR = 0, signal = 0 across multiple K', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const { atr, signal } = computeLineAtrCrossSig(data, {
        length: 14,
        signalLength: 9,
      });
      const atrWarmup = 14;
      const sigWarmup = atrWarmup + 9 - 1;
      for (let i = atrWarmup; i < data.length; i += 1) {
        expect(atr[i]).toBe(0);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP step=1 -> ATR = 1, signal = 1', () => {
    for (const start of [10, 100, 1000]) {
      const data = linearSeries(40, start, 1);
      const { atr, signal } = computeLineAtrCrossSig(data, {
        length: 14,
        signalLength: 9,
      });
      const atrWarmup = 14;
      const sigWarmup = atrWarmup + 9 - 1;
      for (let i = atrWarmup; i < data.length; i += 1) {
        expect(atr[i]).toBe(1);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(1);
      }
    }
  });

  it('LINEAR DOWN step=-1 -> ATR = 1, signal = 1', () => {
    for (const start of [200, 500, 2000]) {
      const data = linearSeries(40, start, -1);
      const { atr, signal } = computeLineAtrCrossSig(data, {
        length: 14,
        signalLength: 9,
      });
      const atrWarmup = 14;
      const sigWarmup = atrWarmup + 9 - 1;
      for (let i = atrWarmup; i < data.length; i += 1) {
        expect(atr[i]).toBe(1);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(1);
      }
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(40, 5);
    const { atr } = computeLineAtrCrossSig(data);
    expect(atr[20]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineAtrCrossSig(data, { length: 14, signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineAtrCrossSigRegime', () => {
  it('returns bullish when atr > signal', () => {
    expect(classifyLineAtrCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when atr < signal', () => {
    expect(classifyLineAtrCrossSigRegime(0, 1)).toBe('bearish');
  });
  it('returns neutral when atr == signal', () => {
    expect(classifyLineAtrCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineAtrCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineAtrCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineAtrCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineAtrCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const atr = [-1, 1, 1];
    const signal = [0, 0, 0];
    expect(detectLineAtrCrossSigCrosses(series, atr, signal)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineAtrCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const atr = [1, -1, -1];
    const signal = [0, 0, 0];
    expect(detectLineAtrCrossSigCrosses(series, atr, signal)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null atr or signal', () => {
    const series: ChartLineAtrCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineAtrCrossSigCrosses(series, [null, 1], [null, 0])).toEqual([]);
  });
});

describe('runLineAtrCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineAtrCrossSig(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineAtrCrossSig(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineAtrCrossSig(constSeries(40, 5));
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineAtrCrossSig(constSeries(40, 5), {
      length: 21,
      signalLength: 5,
    });
    expect(res.length).toBe(21);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineAtrCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    for (const K of [0, 7, 100]) {
      const res = runLineAtrCrossSig(constSeries(40, K));
      const sigWarmup = 14 + 9 - 1;
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
      expect(res.bullishCount).toBe(0);
      expect(res.bearishCount).toBe(0);
    }
  });
});

describe('computeLineAtrCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineAtrCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.atrPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineAtrCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineAtrCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineAtrCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and atr paths', () => {
    const lo = computeLineAtrCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.atrPath).toMatch(/^M\s/);
  });
});

describe('describeLineAtrCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineAtrCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineAtrCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions both lengths', () => {
    const text = describeLineAtrCrossSigChart(linearSeries(12, 1, 1), {
      length: 21,
      signalLength: 7,
    });
    expect(text).toContain('21');
    expect(text).toContain('7');
  });
});

describe('<ChartLineAtrCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineAtrCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineAtrCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-cross-sig"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineAtrCrossSig ref={ref} data={linearSeries(40, 100, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / signalLength / total points', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        length={14}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineAtrCrossSig data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineAtrCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-atr-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineAtrCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-atr-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineAtrCrossSig data={linearSeries(40, 100, 1)} />,
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
      <ChartLineAtrCrossSig
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

  it('shows config badge with length and signal', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        length={14}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders atr and signal paths', () => {
    const { container } = render(
      <ChartLineAtrCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-atr-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAtrCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineAtrCrossSig
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

describe('ATR Cross Signal integration', () => {
  it('three bit-exact anchors: CONST/LINEAR UP/LINEAR DOWN -> regime neutral / 0 crosses', () => {
    const sigWarmup = 14 + 9 - 1;

    // CONST K (any K)
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineAtrCrossSig(constSeries(40, K), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.atr).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }

    // LINEAR UP step = 1
    for (const start of [10, 100, 1000]) {
      const res = runLineAtrCrossSig(linearSeries(40, start, 1), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.atr).toBe(1);
        expect(res.samples[i]?.signal).toBe(1);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }

    // LINEAR DOWN step = -1
    for (const start of [200, 500, 2000]) {
      const res = runLineAtrCrossSig(linearSeries(40, start, -1), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.atr).toBe(1);
        expect(res.samples[i]?.signal).toBe(1);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
