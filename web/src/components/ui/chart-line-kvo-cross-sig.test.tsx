import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineKvoCrossSig,
  applyLineKvoCrossSigEma,
  classifyLineKvoCrossSigRegime,
  computeLineKvoCrossSig,
  computeLineKvoCrossSigLayout,
  describeLineKvoCrossSigChart,
  detectLineKvoCrossSigCrosses,
  getLineKvoCrossSigFinitePoints,
  normalizeLineKvoCrossSigLength,
  runLineKvoCrossSig,
  type ChartLineKvoCrossSigPoint,
} from './chart-line-kvo-cross-sig';

const constSeries = (n: number, K: number, V: number): ChartLineKvoCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K, volume: V }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
  V: number,
): ChartLineKvoCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    close: start + step * i,
    volume: V,
  }));

describe('getLineKvoCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineKvoCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10, volume: 100 },
      { x: NaN, close: 20, volume: 100 },
      { x: 1, close: Infinity, volume: 100 },
      { x: 2, close: 30, volume: NaN },
      { x: 3, close: 40, volume: 200 },
    ];
    expect(getLineKvoCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10, volume: 100 },
      { x: 3, close: 40, volume: 200 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1, volume: 1 },
      null as unknown as ChartLineKvoCrossSigPoint,
      { x: 1, close: 2, volume: 2 },
    ];
    expect(getLineKvoCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 2, volume: 2 },
    ]);
  });
});

describe('normalizeLineKvoCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineKvoCrossSigLength(0, 34)).toBe(34);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineKvoCrossSigLength('x', 34)).toBe(34);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineKvoCrossSigLength(55.7, 34)).toBe(55);
  });
});

describe('applyLineKvoCrossSigEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 50, 100, -50]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineKvoCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineKvoCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineKvoCrossSig(null)).toEqual({ kvo: [], signal: [] });
  });

  it('CONST {K, V} -> KVO = 0, signal = 0', () => {
    for (const K of [1, 5, 17, 100]) {
      for (const V of [1, 100, 1000]) {
        const data = constSeries(120, K, V);
        const { kvo, signal } = computeLineKvoCrossSig(data, {
          fastLength: 10,
          slowLength: 20,
          signalLength: 5,
        });
        const kvoWarmup = 20;
        const sigWarmup = kvoWarmup + 5 - 1;
        for (let i = kvoWarmup; i < data.length; i += 1) {
          expect(kvo[i]).toBe(0);
        }
        for (let i = sigWarmup; i < data.length; i += 1) {
          expect(signal[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR UP step>0 with V>0 -> volForce constant V -> KVO = 0, signal = 0', () => {
    for (const start of [10, 100, 1000]) {
      for (const V of [1, 100]) {
        const data = linearSeries(120, start, 1, V);
        const { kvo, signal } = computeLineKvoCrossSig(data, {
          fastLength: 10,
          slowLength: 20,
          signalLength: 5,
        });
        const kvoWarmup = 20;
        const sigWarmup = kvoWarmup + 5 - 1;
        for (let i = kvoWarmup; i < data.length; i += 1) {
          expect(kvo[i]).toBe(0);
        }
        for (let i = sigWarmup; i < data.length; i += 1) {
          expect(signal[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR DOWN step<0 with V>0 -> volForce constant -V -> KVO = 0, signal = 0', () => {
    for (const start of [200, 500, 2000]) {
      for (const V of [1, 100]) {
        const data = linearSeries(120, start, -1, V);
        const { kvo, signal } = computeLineKvoCrossSig(data, {
          fastLength: 10,
          slowLength: 20,
          signalLength: 5,
        });
        const kvoWarmup = 20;
        const sigWarmup = kvoWarmup + 5 - 1;
        for (let i = kvoWarmup; i < data.length; i += 1) {
          expect(kvo[i]).toBe(0);
        }
        for (let i = sigWarmup; i < data.length; i += 1) {
          expect(signal[i]).toBe(0);
        }
      }
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(200, 5, 100);
    const { kvo } = computeLineKvoCrossSig(data);
    expect(kvo[100]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3, 100)];
    const snapshot = JSON.stringify(data);
    computeLineKvoCrossSig(data, {
      fastLength: 34,
      slowLength: 55,
      signalLength: 13,
    });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineKvoCrossSigRegime', () => {
  it('returns bullish when kvo > signal', () => {
    expect(classifyLineKvoCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when kvo < signal', () => {
    expect(classifyLineKvoCrossSigRegime(0, 1)).toBe('bearish');
  });
  it('returns neutral when kvo == signal', () => {
    expect(classifyLineKvoCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineKvoCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineKvoCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineKvoCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineKvoCrossSigPoint[] = [
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 1, volume: 1 },
      { x: 2, close: 1, volume: 1 },
    ];
    const kvo = [-1, 1, 1];
    const signal = [0, 0, 0];
    expect(detectLineKvoCrossSigCrosses(series, kvo, signal)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineKvoCrossSigPoint[] = [
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 1, volume: 1 },
      { x: 2, close: 1, volume: 1 },
    ];
    const kvo = [1, -1, -1];
    const signal = [0, 0, 0];
    expect(detectLineKvoCrossSigCrosses(series, kvo, signal)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null kvo or signal', () => {
    const series: ChartLineKvoCrossSigPoint[] = [
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 1, volume: 1 },
    ];
    expect(detectLineKvoCrossSigCrosses(series, [null, 1], [null, 0])).toEqual([]);
  });
});

describe('runLineKvoCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineKvoCrossSig(constSeries(20, 5, 100));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineKvoCrossSig(constSeries(120, 5, 100));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineKvoCrossSig(constSeries(120, 5, 100));
    expect(res.fastLength).toBe(34);
    expect(res.slowLength).toBe(55);
    expect(res.signalLength).toBe(13);
  });

  it('accepts custom lengths', () => {
    const res = runLineKvoCrossSig(constSeries(120, 5, 100), {
      fastLength: 10,
      slowLength: 20,
      signalLength: 5,
    });
    expect(res.fastLength).toBe(10);
    expect(res.slowLength).toBe(20);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineKvoCrossSig([
      { x: 2, close: 5, volume: 1 },
      { x: 0, close: 5, volume: 1 },
      { x: 1, close: 5, volume: 1 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('three regime anchors all yield neutral with 0 crosses', () => {
    const sigWarmup = 20 + 5 - 1;

    for (const K of [1, 5, 17, 100]) {
      for (const V of [1, 100]) {
        const res = runLineKvoCrossSig(constSeries(120, K, V), {
          fastLength: 10,
          slowLength: 20,
          signalLength: 5,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.regime).toBe('neutral');
        }
        expect(res.crosses.length).toBe(0);
      }
    }

    for (const start of [10, 100, 1000]) {
      for (const V of [1, 100]) {
        const res = runLineKvoCrossSig(linearSeries(120, start, 1, V), {
          fastLength: 10,
          slowLength: 20,
          signalLength: 5,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.regime).toBe('neutral');
        }
        expect(res.crosses.length).toBe(0);
      }
    }

    for (const start of [200, 500, 2000]) {
      for (const V of [1, 100]) {
        const res = runLineKvoCrossSig(linearSeries(120, start, -1, V), {
          fastLength: 10,
          slowLength: 20,
          signalLength: 5,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.regime).toBe('neutral');
        }
        expect(res.crosses.length).toBe(0);
      }
    }
  });
});

describe('computeLineKvoCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineKvoCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.kvoPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineKvoCrossSigLayout({
      data: linearSeries(120, 10, 1, 100),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineKvoCrossSigLayout({
      data: linearSeries(120, 10, 1, 100),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineKvoCrossSigLayout({
      data: linearSeries(120, 10, 1, 100),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and kvo paths', () => {
    const lo = computeLineKvoCrossSigLayout({
      data: linearSeries(120, 10, 1, 100),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.kvoPath).toMatch(/^M\s/);
  });
});

describe('describeLineKvoCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineKvoCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineKvoCrossSigChart(linearSeries(12, 1, 1, 100));
    expect(text).toContain('12 bars');
  });

  it('mentions all three lengths', () => {
    const text = describeLineKvoCrossSigChart(linearSeries(12, 1, 1, 100), {
      fastLength: 8,
      slowLength: 21,
      signalLength: 5,
    });
    expect(text).toContain('8');
    expect(text).toContain('21');
    expect(text).toContain('5');
  });
});

describe('<ChartLineKvoCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineKvoCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineKvoCrossSig data={linearSeries(120, 10, 1, 100)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-cross-sig"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineKvoCrossSig ref={ref} data={linearSeries(120, 10, 1, 100)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes fast / slow / signal lengths and total points', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        fastLength={34}
        slowLength={55}
        signalLength={13}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kvo-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.fastLength).toBe('34');
    expect(root?.dataset.slowLength).toBe('55');
    expect(root?.dataset.signalLength).toBe('13');
    expect(root?.dataset.totalPoints).toBe('120');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineKvoCrossSig data={constSeries(120, 100, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kvo-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineKvoCrossSig data={linearSeries(120, 10, 1, 100)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-kvo-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineKvoCrossSig data={linearSeries(120, 10, 1, 100)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-kvo-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineKvoCrossSig data={linearSeries(120, 10, 1, 100)} />,
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
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
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

  it('shows config badge with fast / slow / signal', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        fastLength={34}
        slowLength={55}
        signalLength={13}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-cross-sig-badge"]',
      )?.textContent,
    ).toContain('fast 34');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-cross-sig-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-cross-sig-axes"]'),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-cross-sig-grid"]'),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kvo-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders kvo and signal paths', () => {
    const { container } = render(
      <ChartLineKvoCrossSig data={linearSeries(120, 10, 1, 100)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-cross-sig-kvo-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineKvoCrossSig data={linearSeries(120, 10, 1, 100)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-cross-sig-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineKvoCrossSig
        data={linearSeries(120, 10, 1, 100)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('KVO Cross Signal integration', () => {
  it('three bit-exact anchors all yield KVO = signal = 0 and 0 crosses', () => {
    const fast = 10;
    const slow = 20;
    const sig = 5;
    const sigWarmup = slow + sig - 1;

    for (const K of [1, 5, 17, 100, 1234]) {
      for (const V of [1, 100, 1000]) {
        const res = runLineKvoCrossSig(constSeries(120, K, V), {
          fastLength: fast,
          slowLength: slow,
          signalLength: sig,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.kvo).toBe(0);
          expect(res.samples[i]?.signal).toBe(0);
        }
        expect(res.crosses.length).toBe(0);
      }
    }

    for (const start of [10, 100, 1000]) {
      for (const V of [1, 100]) {
        const res = runLineKvoCrossSig(linearSeries(120, start, 1, V), {
          fastLength: fast,
          slowLength: slow,
          signalLength: sig,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.kvo).toBe(0);
          expect(res.samples[i]?.signal).toBe(0);
        }
        expect(res.crosses.length).toBe(0);
      }
    }

    for (const start of [200, 500, 2000]) {
      for (const V of [1, 100]) {
        const res = runLineKvoCrossSig(linearSeries(120, start, -1, V), {
          fastLength: fast,
          slowLength: slow,
          signalLength: sig,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.kvo).toBe(0);
          expect(res.samples[i]?.signal).toBe(0);
        }
        expect(res.crosses.length).toBe(0);
      }
    }
  });
});
