import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineObvCrossSig,
  applyLineObvCrossSigEma,
  classifyLineObvCrossSigRegime,
  computeLineObvCrossSig,
  computeLineObvCrossSigLayout,
  describeLineObvCrossSigChart,
  detectLineObvCrossSigCrosses,
  getLineObvCrossSigFinitePoints,
  normalizeLineObvCrossSigLength,
  runLineObvCrossSig,
  type ChartLineObvCrossSigPoint,
} from './chart-line-obv-cross-sig';

const constSeries = (
  n: number,
  K: number,
  V: number,
): ChartLineObvCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K, volume: V }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
  V: number,
): ChartLineObvCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    close: start + step * i,
    volume: V,
  }));

describe('getLineObvCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineObvCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10, volume: 100 },
      { x: NaN, close: 20, volume: 100 },
      { x: 1, close: Infinity, volume: 100 },
      { x: 2, close: 30, volume: NaN },
      { x: 3, close: 40, volume: 200 },
    ];
    expect(getLineObvCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10, volume: 100 },
      { x: 3, close: 40, volume: 200 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1, volume: 1 },
      null as unknown as ChartLineObvCrossSigPoint,
      { x: 1, close: 2, volume: 2 },
    ];
    expect(getLineObvCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 2, volume: 2 },
    ]);
  });
});

describe('normalizeLineObvCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineObvCrossSigLength(0, 20)).toBe(20);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineObvCrossSigLength('x', 20)).toBe(20);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineObvCrossSigLength(21.7, 20)).toBe(21);
  });
});

describe('applyLineObvCrossSigEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineObvCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineObvCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineObvCrossSig(null)).toEqual({ obv: [], signal: [] });
  });

  it('CONST {close, volume} -> OBV = 0, signal = 0', () => {
    for (const K of [1, 5, 17, 100]) {
      for (const V of [1, 100, 1000]) {
        const data = constSeries(40, K, V);
        const { obv, signal } = computeLineObvCrossSig(data, {
          signalLength: 9,
        });
        for (let i = 0; i < data.length; i += 1) {
          expect(obv[i]).toBe(0);
        }
        const sigWarmup = 9 - 1;
        for (let i = sigWarmup; i < data.length; i += 1) {
          expect(signal[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR UP step>0 with V>0 -> OBV grows monotonically', () => {
    const data = linearSeries(40, 10, 1, 100);
    const { obv } = computeLineObvCrossSig(data, { signalLength: 9 });
    for (let i = 1; i < data.length; i += 1) {
      expect(obv[i]).toBe(i * 100);
    }
  });

  it('LINEAR DOWN step<0 with V>0 -> OBV decreases monotonically', () => {
    const data = linearSeries(40, 100, -1, 50);
    const { obv } = computeLineObvCrossSig(data, { signalLength: 9 });
    for (let i = 1; i < data.length; i += 1) {
      expect(obv[i]).toBe(-i * 50);
    }
  });

  it('falls back to default signal length', () => {
    const data = constSeries(60, 5, 100);
    const { signal } = computeLineObvCrossSig(data);
    expect(signal[40]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3, 100)];
    const snapshot = JSON.stringify(data);
    computeLineObvCrossSig(data, { signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineObvCrossSigRegime', () => {
  it('returns bullish when obv > signal', () => {
    expect(classifyLineObvCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when obv < signal', () => {
    expect(classifyLineObvCrossSigRegime(0, 1)).toBe('bearish');
  });
  it('returns neutral when obv == signal', () => {
    expect(classifyLineObvCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineObvCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineObvCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineObvCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineObvCrossSigPoint[] = [
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 1, volume: 1 },
      { x: 2, close: 1, volume: 1 },
    ];
    const obv = [-1, 1, 1];
    const signal = [0, 0, 0];
    expect(detectLineObvCrossSigCrosses(series, obv, signal)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineObvCrossSigPoint[] = [
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 1, volume: 1 },
      { x: 2, close: 1, volume: 1 },
    ];
    const obv = [1, -1, -1];
    const signal = [0, 0, 0];
    expect(detectLineObvCrossSigCrosses(series, obv, signal)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null obv or signal', () => {
    const series: ChartLineObvCrossSigPoint[] = [
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 1, volume: 1 },
    ];
    expect(detectLineObvCrossSigCrosses(series, [null, 1], [null, 0])).toEqual([]);
  });
});

describe('runLineObvCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineObvCrossSig(constSeries(10, 5, 100));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineObvCrossSig(constSeries(40, 5, 100));
    expect(res.ok).toBe(true);
  });

  it('respects the default signal length', () => {
    const res = runLineObvCrossSig(constSeries(40, 5, 100));
    expect(res.signalLength).toBe(20);
  });

  it('accepts custom signal length', () => {
    const res = runLineObvCrossSig(constSeries(40, 5, 100), {
      signalLength: 9,
    });
    expect(res.signalLength).toBe(9);
  });

  it('sorts series by x', () => {
    const res = runLineObvCrossSig([
      { x: 2, close: 5, volume: 1 },
      { x: 0, close: 5, volume: 1 },
      { x: 1, close: 5, volume: 1 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineObvCrossSig(constSeries(40, 5, 100), {
      signalLength: 9,
    });
    const sigWarmup = 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup, 0 crosses', () => {
    const res = runLineObvCrossSig(linearSeries(40, 10, 1, 100), {
      signalLength: 9,
    });
    const sigWarmup = 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR DOWN -> regime bearish after warmup, 0 crosses', () => {
    const res = runLineObvCrossSig(linearSeries(40, 100, -1, 50), {
      signalLength: 9,
    });
    const sigWarmup = 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineObvCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineObvCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.obvPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineObvCrossSigLayout({
      data: linearSeries(40, 10, 1, 100),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineObvCrossSigLayout({
      data: linearSeries(40, 10, 1, 100),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineObvCrossSigLayout({
      data: linearSeries(40, 10, 1, 100),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and obv paths', () => {
    const lo = computeLineObvCrossSigLayout({
      data: linearSeries(40, 10, 1, 100),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.obvPath).toMatch(/^M\s/);
  });
});

describe('describeLineObvCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineObvCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineObvCrossSigChart(linearSeries(12, 1, 1, 100));
    expect(text).toContain('12 bars');
  });

  it('mentions signal length', () => {
    const text = describeLineObvCrossSigChart(linearSeries(12, 1, 1, 100), {
      signalLength: 7,
    });
    expect(text).toContain('7');
  });
});

describe('<ChartLineObvCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineObvCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineObvCrossSig data={linearSeries(40, 10, 1, 100)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-obv-cross-sig"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineObvCrossSig
        ref={ref}
        data={linearSeries(40, 10, 1, 100)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes signalLength and total points', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-obv-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineObvCrossSig data={constSeries(40, 100, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-obv-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineObvCrossSig data={linearSeries(40, 10, 1, 100)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-obv-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineObvCrossSig data={linearSeries(40, 10, 1, 100)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-obv-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineObvCrossSig data={linearSeries(40, 10, 1, 100)} />,
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
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
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
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-badge"]',
      )?.textContent,
    ).toContain('signal 9');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-obv-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders obv and signal paths', () => {
    const { container } = render(
      <ChartLineObvCrossSig data={linearSeries(40, 10, 1, 100)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-obv-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineObvCrossSig data={linearSeries(40, 10, 1, 100)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineObvCrossSig
        data={linearSeries(40, 10, 1, 100)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('OBV Cross Signal integration', () => {
  it('three regime anchors with 0 crosses each', () => {
    const sigWarmup = 9 - 1;

    // CONST -> neutral
    for (const K of [1, 5, 17, 100, 1234]) {
      for (const V of [1, 100, 1000]) {
        const res = runLineObvCrossSig(constSeries(40, K, V), {
          signalLength: 9,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.obv).toBe(0);
          expect(res.samples[i]?.signal).toBe(0);
          expect(res.samples[i]?.regime).toBe('neutral');
        }
        expect(res.crosses.length).toBe(0);
      }
    }

    // LINEAR UP -> bullish
    for (const start of [10, 100, 1000]) {
      for (const V of [1, 100]) {
        const res = runLineObvCrossSig(linearSeries(40, start, 1, V), {
          signalLength: 9,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.regime).toBe('bullish');
        }
        expect(res.crosses.length).toBe(0);
      }
    }

    // LINEAR DOWN -> bearish
    for (const start of [200, 500, 2000]) {
      for (const V of [1, 100]) {
        const res = runLineObvCrossSig(linearSeries(40, start, -1, V), {
          signalLength: 9,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.regime).toBe('bearish');
        }
        expect(res.crosses.length).toBe(0);
      }
    }
  });
});
