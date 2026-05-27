import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAdxCrossPct,
  applyLineAdxCrossPctEma,
  applyLineAdxCrossPctWilder,
  classifyLineAdxCrossPctRegime,
  computeLineAdxCrossPct,
  computeLineAdxCrossPctLayout,
  describeLineAdxCrossPctChart,
  getLineAdxCrossPctFinitePoints,
  normalizeLineAdxCrossPctLength,
  runLineAdxCrossPct,
  type ChartLineAdxCrossPctPoint,
} from './chart-line-adx-cross-pct';

const constSeries = (n: number, K: number): ChartLineAdxCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineAdxCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineAdxCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineAdxCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineAdxCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineAdxCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineAdxCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineAdxCrossPctLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineAdxCrossPctLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineAdxCrossPctLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineAdxCrossPctLength(21.7, 14)).toBe(21);
  });
});

describe('applyLineAdxCrossPctWilder', () => {
  it('matches the bit-exact CONST K via the short-circuit', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [2, 3, 5, 9, 14]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineAdxCrossPctWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('applyLineAdxCrossPctEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineAdxCrossPctEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineAdxCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineAdxCrossPct(null)).toEqual({
      adx: [],
      signal: [],
      pct: [],
    });
  });

  it('CONST close = K -> ADX = 0 / signal = 0 / pct = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(60, K);
      const { adx, signal, pct } = computeLineAdxCrossPct(data, {
        length: 14,
        signalLength: 9,
      });
      const adxWarmup = 2 * 14;
      const sigWarmup = adxWarmup + 9 - 1;
      for (let i = adxWarmup; i < data.length; i += 1) {
        expect(adx[i]).toBe(0);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(0);
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP step=1 -> ADX = 100 / signal = 100 / pct = 0', () => {
    for (const start of [10, 100, 1000]) {
      const data = linearSeries(60, start, 1);
      const { adx, signal, pct } = computeLineAdxCrossPct(data, {
        length: 14,
        signalLength: 9,
      });
      const adxWarmup = 2 * 14;
      const sigWarmup = adxWarmup + 9 - 1;
      for (let i = adxWarmup; i < data.length; i += 1) {
        expect(adx[i]).toBe(100);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(100);
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('LINEAR DOWN step=-1 -> ADX = 100 / signal = 100 / pct = 0', () => {
    for (const start of [200, 500, 2000]) {
      const data = linearSeries(60, start, -1);
      const { adx, signal, pct } = computeLineAdxCrossPct(data, {
        length: 14,
        signalLength: 9,
      });
      const adxWarmup = 2 * 14;
      const sigWarmup = adxWarmup + 9 - 1;
      for (let i = adxWarmup; i < data.length; i += 1) {
        expect(adx[i]).toBe(100);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(100);
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(60, 5);
    const { adx } = computeLineAdxCrossPct(data);
    expect(adx[40]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineAdxCrossPct(data, { length: 14, signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineAdxCrossPctRegime', () => {
  it('returns above when pct > 0', () => {
    expect(classifyLineAdxCrossPctRegime(1)).toBe('above');
  });
  it('returns below when pct < 0', () => {
    expect(classifyLineAdxCrossPctRegime(-1)).toBe('below');
  });
  it('returns at when pct == 0', () => {
    expect(classifyLineAdxCrossPctRegime(0)).toBe('at');
  });
  it('returns none when pct is null', () => {
    expect(classifyLineAdxCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineAdxCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineAdxCrossPct(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineAdxCrossPct(constSeries(60, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineAdxCrossPct(constSeries(60, 5));
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineAdxCrossPct(constSeries(60, 5), {
      length: 21,
      signalLength: 5,
    });
    expect(res.length).toBe(21);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineAdxCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime at after full warmup', () => {
    const res = runLineAdxCrossPct(constSeries(60, 5));
    const sigWarmup = 2 * 14 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });
});

describe('computeLineAdxCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineAdxCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.adxPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineAdxCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineAdxCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineAdxCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and adx paths', () => {
    const lo = computeLineAdxCrossPctLayout({
      data: linearSeries(60, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.adxPath).toMatch(/^M\s/);
  });
});

describe('describeLineAdxCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineAdxCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineAdxCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions both lengths', () => {
    const text = describeLineAdxCrossPctChart(linearSeries(12, 1, 1), {
      length: 21,
      signalLength: 7,
    });
    expect(text).toContain('21');
    expect(text).toContain('7');
  });
});

describe('<ChartLineAdxCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineAdxCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineAdxCrossPct data={linearSeries(60, 100, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-cross-pct"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineAdxCrossPct ref={ref} data={linearSeries(60, 100, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / signalLength / total points', () => {
    const { container } = render(
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
        length={14}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('60');
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineAdxCrossPct data={linearSeries(60, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-adx-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineAdxCrossPct data={linearSeries(60, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-adx-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(4);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineAdxCrossPct data={linearSeries(60, 100, 1)} />,
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
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
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
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
        length={14}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders adx / signal / pct paths', () => {
    const { container } = render(
      <ChartLineAdxCrossPct data={linearSeries(60, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-adx-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-signal-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-pct-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAdxCrossPct data={linearSeries(60, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides pct when defaultHiddenSeries includes pct', () => {
    const { container } = render(
      <ChartLineAdxCrossPct
        data={linearSeries(60, 100, 1)}
        defaultHiddenSeries={['pct']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ADX Cross Pct integration', () => {
  it('three bit-exact anchors: CONST -> 0/0/0, LINEAR UP -> 100/100/0, LINEAR DOWN -> 100/100/0', () => {
    const sigWarmup = 2 * 14 + 9 - 1;

    // CONST K
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineAdxCrossPct(constSeries(60, K), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.adx).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
        expect(res.samples[i]?.adxPct).toBe(0);
      }
    }

    // LINEAR UP
    for (const start of [10, 100, 1000]) {
      const res = runLineAdxCrossPct(linearSeries(60, start, 1), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.adx).toBe(100);
        expect(res.samples[i]?.signal).toBe(100);
        expect(res.samples[i]?.adxPct).toBe(0);
      }
    }

    // LINEAR DOWN
    for (const start of [200, 500, 2000]) {
      const res = runLineAdxCrossPct(linearSeries(60, start, -1), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.adx).toBe(100);
        expect(res.samples[i]?.signal).toBe(100);
        expect(res.samples[i]?.adxPct).toBe(0);
      }
    }
  });
});
