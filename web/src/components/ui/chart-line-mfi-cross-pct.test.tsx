import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMfiCrossPct,
  applyLineMfiCrossPctEma,
  classifyLineMfiCrossPctRegime,
  computeLineMfiCrossPct,
  computeLineMfiCrossPctLayout,
  describeLineMfiCrossPctChart,
  getLineMfiCrossPctFinitePoints,
  normalizeLineMfiCrossPctLength,
  runLineMfiCrossPct,
  type ChartLineMfiCrossPctPoint,
} from './chart-line-mfi-cross-pct';

const constSeries = (
  n: number,
  K: number,
  V: number,
): ChartLineMfiCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K, volume: V }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
  V: number,
): ChartLineMfiCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    close: start + step * i,
    volume: V,
  }));

describe('getLineMfiCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineMfiCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10, volume: 100 },
      { x: NaN, close: 20, volume: 100 },
      { x: 1, close: Infinity, volume: 100 },
      { x: 2, close: 30, volume: NaN },
      { x: 3, close: 40, volume: 200 },
    ];
    expect(getLineMfiCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10, volume: 100 },
      { x: 3, close: 40, volume: 200 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1, volume: 1 },
      null as unknown as ChartLineMfiCrossPctPoint,
      { x: 1, close: 2, volume: 2 },
    ];
    expect(getLineMfiCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1, volume: 1 },
      { x: 1, close: 2, volume: 2 },
    ]);
  });
});

describe('normalizeLineMfiCrossPctLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineMfiCrossPctLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineMfiCrossPctLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineMfiCrossPctLength(21.7, 14)).toBe(21);
  });
});

describe('applyLineMfiCrossPctEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineMfiCrossPctEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineMfiCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineMfiCrossPct(null)).toEqual({
      mfi: [],
      signal: [],
      pct: [],
    });
  });

  it('CONST close/volume -> MFI = 50 / signal = 50 / pct = 0', () => {
    for (const K of [1, 5, 17, 100]) {
      for (const V of [1, 100, 1000]) {
        const data = constSeries(40, K, V);
        const { mfi, signal, pct } = computeLineMfiCrossPct(data, {
          length: 14,
          signalLength: 9,
        });
        const mfiWarmup = 14;
        const sigWarmup = mfiWarmup + 9 - 1;
        for (let i = mfiWarmup; i < data.length; i += 1) {
          expect(mfi[i]).toBe(50);
        }
        for (let i = sigWarmup; i < data.length; i += 1) {
          expect(signal[i]).toBe(50);
          expect(pct[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR UP step>0 with V>0 -> MFI = 100 / signal = 100 / pct = 0', () => {
    for (const start of [1, 10, 100]) {
      for (const V of [1, 100]) {
        const data = linearSeries(40, start, 1, V);
        const { mfi, signal, pct } = computeLineMfiCrossPct(data, {
          length: 14,
          signalLength: 9,
        });
        const mfiWarmup = 14;
        const sigWarmup = mfiWarmup + 9 - 1;
        for (let i = mfiWarmup; i < data.length; i += 1) {
          expect(mfi[i]).toBe(100);
        }
        for (let i = sigWarmup; i < data.length; i += 1) {
          expect(signal[i]).toBe(100);
          expect(pct[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR DOWN step<0 with V>0 -> MFI = 0 / signal = 0 / pct = 0', () => {
    for (const start of [100, 200, 1000]) {
      for (const V of [1, 100]) {
        const data = linearSeries(40, start, -1, V);
        const { mfi, signal, pct } = computeLineMfiCrossPct(data, {
          length: 14,
          signalLength: 9,
        });
        const mfiWarmup = 14;
        const sigWarmup = mfiWarmup + 9 - 1;
        for (let i = mfiWarmup; i < data.length; i += 1) {
          expect(mfi[i]).toBe(0);
        }
        for (let i = sigWarmup; i < data.length; i += 1) {
          expect(signal[i]).toBe(0);
          expect(pct[i]).toBe(0);
        }
      }
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(40, 5, 100);
    const { mfi } = computeLineMfiCrossPct(data);
    expect(mfi[20]).toBe(50);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3, 100)];
    const snapshot = JSON.stringify(data);
    computeLineMfiCrossPct(data, { length: 14, signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineMfiCrossPctRegime', () => {
  it('returns above when pct > 0', () => {
    expect(classifyLineMfiCrossPctRegime(1)).toBe('above');
  });
  it('returns below when pct < 0', () => {
    expect(classifyLineMfiCrossPctRegime(-1)).toBe('below');
  });
  it('returns at when pct == 0', () => {
    expect(classifyLineMfiCrossPctRegime(0)).toBe('at');
  });
  it('returns none when pct is null', () => {
    expect(classifyLineMfiCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineMfiCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineMfiCrossPct(constSeries(10, 5, 100));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineMfiCrossPct(constSeries(40, 5, 100));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineMfiCrossPct(constSeries(40, 5, 100));
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineMfiCrossPct(constSeries(40, 5, 100), {
      length: 21,
      signalLength: 5,
    });
    expect(res.length).toBe(21);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineMfiCrossPct([
      { x: 2, close: 5, volume: 1 },
      { x: 0, close: 5, volume: 1 },
      { x: 1, close: 5, volume: 1 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST -> regime at after full warmup', () => {
    const res = runLineMfiCrossPct(constSeries(40, 5, 100));
    const sigWarmup = 14 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });
});

describe('computeLineMfiCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineMfiCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.mfiPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineMfiCrossPctLayout({
      data: linearSeries(40, 10, 1, 100),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineMfiCrossPctLayout({
      data: linearSeries(40, 10, 1, 100),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineMfiCrossPctLayout({
      data: linearSeries(40, 10, 1, 100),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and mfi paths', () => {
    const lo = computeLineMfiCrossPctLayout({
      data: linearSeries(40, 10, 1, 100),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.mfiPath).toMatch(/^M\s/);
  });
});

describe('describeLineMfiCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineMfiCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineMfiCrossPctChart(linearSeries(12, 1, 1, 100));
    expect(text).toContain('12 bars');
  });

  it('mentions both lengths', () => {
    const text = describeLineMfiCrossPctChart(
      linearSeries(12, 1, 1, 100),
      { length: 21, signalLength: 7 },
    );
    expect(text).toContain('21');
    expect(text).toContain('7');
  });
});

describe('<ChartLineMfiCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineMfiCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineMfiCrossPct data={linearSeries(40, 10, 1, 100)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mfi-cross-pct"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineMfiCrossPct
        ref={ref}
        data={linearSeries(40, 10, 1, 100)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / signalLength / total points', () => {
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        length={14}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mfi-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineMfiCrossPct data={linearSeries(40, 10, 1, 100)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-mfi-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineMfiCrossPct data={linearSeries(40, 10, 1, 100)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-mfi-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(4);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineMfiCrossPct data={linearSeries(40, 10, 1, 100)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        hiddenSeries={['pct']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'pct',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        length={14}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mfi-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders mfi / signal / pct paths', () => {
    const { container } = render(
      <ChartLineMfiCrossPct data={linearSeries(40, 10, 1, 100)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-mfi-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-signal-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-pct-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineMfiCrossPct data={linearSeries(40, 10, 1, 100)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides pct when defaultHiddenSeries includes pct', () => {
    const { container } = render(
      <ChartLineMfiCrossPct
        data={linearSeries(40, 10, 1, 100)}
        defaultHiddenSeries={['pct']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('MFI Cross Pct integration', () => {
  it('three bit-exact anchors: CONST -> 50/50/0, LINEAR UP -> 100/100/0, LINEAR DOWN -> 0/0/0', () => {
    const sigWarmup = 14 + 9 - 1;

    // CONST {K, V}
    for (const K of [1, 5, 17, 100, 1234]) {
      for (const V of [1, 100, 1000]) {
        const res = runLineMfiCrossPct(constSeries(40, K, V), {
          length: 14,
          signalLength: 9,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.mfi).toBe(50);
          expect(res.samples[i]?.signal).toBe(50);
          expect(res.samples[i]?.mfiPct).toBe(0);
        }
      }
    }

    // LINEAR UP
    for (const start of [1, 10, 100]) {
      for (const V of [1, 100]) {
        const res = runLineMfiCrossPct(linearSeries(40, start, 1, V), {
          length: 14,
          signalLength: 9,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.mfi).toBe(100);
          expect(res.samples[i]?.signal).toBe(100);
          expect(res.samples[i]?.mfiPct).toBe(0);
        }
      }
    }

    // LINEAR DOWN
    for (const start of [100, 200, 1000]) {
      for (const V of [1, 100]) {
        const res = runLineMfiCrossPct(linearSeries(40, start, -1, V), {
          length: 14,
          signalLength: 9,
        });
        for (let i = sigWarmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.mfi).toBe(0);
          expect(res.samples[i]?.signal).toBe(0);
          expect(res.samples[i]?.mfiPct).toBe(0);
        }
      }
    }
  });
});
