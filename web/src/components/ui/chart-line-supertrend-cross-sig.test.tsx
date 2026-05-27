import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSupertrendCrossSig,
  applyLineSupertrendCrossSigEma,
  applyLineSupertrendCrossSigWilder,
  classifyLineSupertrendCrossSigRegime,
  computeLineSupertrendCrossSig,
  computeLineSupertrendCrossSigLayout,
  describeLineSupertrendCrossSigChart,
  detectLineSupertrendCrossSigCrosses,
  getLineSupertrendCrossSigFinitePoints,
  normalizeLineSupertrendCrossSigFactor,
  normalizeLineSupertrendCrossSigLength,
  runLineSupertrendCrossSig,
  type ChartLineSupertrendCrossSigPoint,
} from './chart-line-supertrend-cross-sig';

const constSeries = (
  n: number,
  K: number,
): ChartLineSupertrendCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineSupertrendCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineSupertrendCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineSupertrendCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineSupertrendCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineSupertrendCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineSupertrendCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineSupertrendCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineSupertrendCrossSigLength(0, 10)).toBe(10);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineSupertrendCrossSigLength('x', 10)).toBe(10);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineSupertrendCrossSigLength(14.7, 10)).toBe(14);
  });
});

describe('normalizeLineSupertrendCrossSigFactor', () => {
  it('returns fallback when value is non-positive', () => {
    expect(normalizeLineSupertrendCrossSigFactor(0, 3)).toBe(3);
    expect(normalizeLineSupertrendCrossSigFactor(-1, 3)).toBe(3);
  });

  it('accepts positive value', () => {
    expect(normalizeLineSupertrendCrossSigFactor(2.5, 3)).toBe(2.5);
  });
});

describe('applyLineSupertrendCrossSigWilder', () => {
  it('matches the bit-exact CONST K via the short-circuit', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [2, 3, 5, 10]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineSupertrendCrossSigWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('applyLineSupertrendCrossSigEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineSupertrendCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineSupertrendCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineSupertrendCrossSig(null)).toEqual({
      supertrend: [],
      signal: [],
    });
  });

  it('CONST close = K > 0 -> Supertrend = K and signal = K', () => {
    for (const K of [1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const { supertrend, signal } = computeLineSupertrendCrossSig(data);
      const stWarmup = 10;
      const sigWarmup = stWarmup + 9 - 1;
      for (let i = stWarmup; i < data.length; i += 1) {
        expect(supertrend[i]).toBe(K);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(K);
      }
    }
  });

  it('falls back to default lengths and factor', () => {
    const data = constSeries(40, 5);
    const { supertrend } = computeLineSupertrendCrossSig(data);
    expect(supertrend[20]).toBe(5);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineSupertrendCrossSig(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineSupertrendCrossSigRegime', () => {
  it('returns bullish when st > signal', () => {
    expect(classifyLineSupertrendCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when st < signal', () => {
    expect(classifyLineSupertrendCrossSigRegime(0, 1)).toBe('bearish');
  });
  it('returns neutral when st == signal', () => {
    expect(classifyLineSupertrendCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineSupertrendCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineSupertrendCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineSupertrendCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineSupertrendCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const st = [-1, 1, 1];
    const sig = [0, 0, 0];
    expect(detectLineSupertrendCrossSigCrosses(series, st, sig)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineSupertrendCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const st = [1, -1, -1];
    const sig = [0, 0, 0];
    expect(detectLineSupertrendCrossSigCrosses(series, st, sig)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineSupertrendCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineSupertrendCrossSigCrosses(series, [null, 1], [null, 0]),
    ).toEqual([]);
  });
});

describe('runLineSupertrendCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineSupertrendCrossSig(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineSupertrendCrossSig(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineSupertrendCrossSig(constSeries(40, 5));
    expect(res.length).toBe(10);
    expect(res.factor).toBe(3);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom length / factor / signalLength', () => {
    const res = runLineSupertrendCrossSig(constSeries(40, 5), {
      length: 14,
      factor: 2.5,
      signalLength: 5,
    });
    expect(res.length).toBe(14);
    expect(res.factor).toBe(2.5);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineSupertrendCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineSupertrendCrossSig(constSeries(40, 7));
    const sigWarmup = 10 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });
});

describe('computeLineSupertrendCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineSupertrendCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.supertrendPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineSupertrendCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineSupertrendCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('renders price and supertrend paths', () => {
    const lo = computeLineSupertrendCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.supertrendPath).toMatch(/^M\s/);
  });
});

describe('describeLineSupertrendCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineSupertrendCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineSupertrendCrossSigChart(
      linearSeries(12, 1, 1),
    );
    expect(text).toContain('12 bars');
  });

  it('mentions all lengths', () => {
    const text = describeLineSupertrendCrossSigChart(
      linearSeries(12, 1, 1),
      { length: 14, factor: 2.5, signalLength: 5 },
    );
    expect(text).toContain('14');
    expect(text).toContain('2.5');
    expect(text).toContain('5');
  });
});

describe('<ChartLineSupertrendCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineSupertrendCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineSupertrendCrossSig
        ref={ref}
        data={linearSeries(40, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / factor / signalLength / total points', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig
        data={linearSeries(40, 100, 1)}
        length={10}
        factor={3}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('10');
    expect(root?.dataset.factor).toBe('3');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-supertrend-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-supertrend-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig data={linearSeries(40, 100, 1)} />,
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
      <ChartLineSupertrendCrossSig
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
      <ChartLineSupertrendCrossSig
        data={linearSeries(40, 100, 1)}
        length={10}
        factor={3}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 10');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders supertrend and signal paths', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-supertrend-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineSupertrendCrossSig
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

describe('Supertrend Cross Signal integration', () => {
  it('CONST K > 0 -> Supertrend = signal = K bit-exact, regime neutral, 0 crosses', () => {
    const sigWarmup = 10 + 9 - 1;
    for (const K of [1, 5, 17, 100, 1234]) {
      const res = runLineSupertrendCrossSig(constSeries(40, K));
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.supertrend).toBe(K);
        expect(res.samples[i]?.signal).toBe(K);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
