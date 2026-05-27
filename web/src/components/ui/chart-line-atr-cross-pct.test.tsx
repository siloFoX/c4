import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAtrCrossPct,
  applyLineAtrCrossPctEma,
  applyLineAtrCrossPctWilder,
  classifyLineAtrCrossPctRegime,
  computeLineAtrCrossPct,
  computeLineAtrCrossPctLayout,
  describeLineAtrCrossPctChart,
  getLineAtrCrossPctFinitePoints,
  normalizeLineAtrCrossPctLength,
  runLineAtrCrossPct,
  type ChartLineAtrCrossPctPoint,
} from './chart-line-atr-cross-pct';

const constSeries = (n: number, K: number): ChartLineAtrCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineAtrCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineAtrCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineAtrCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineAtrCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineAtrCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineAtrCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineAtrCrossPctLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineAtrCrossPctLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineAtrCrossPctLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineAtrCrossPctLength(21.7, 14)).toBe(21);
  });
});

describe('applyLineAtrCrossPctWilder', () => {
  it('matches the bit-exact CONST K via the short-circuit', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [2, 3, 5, 9, 14]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineAtrCrossPctWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('applyLineAtrCrossPctEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineAtrCrossPctEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineAtrCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineAtrCrossPct(null)).toEqual({
      atr: [],
      signal: [],
      pct: [],
    });
  });

  it('CONST close = K > 0 -> ATR = 0 / signal = 0 / pct = 0', () => {
    for (const K of [1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const { atr, signal, pct } = computeLineAtrCrossPct(data, {
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
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 -> pct = null', () => {
    const data = constSeries(40, 0);
    const { atr, signal, pct } = computeLineAtrCrossPct(data, {
      length: 14,
      signalLength: 9,
    });
    const sigWarmup = 14 + 9 - 1;
    for (let i = sigWarmup; i < data.length; i += 1) {
      expect(atr[i]).toBe(0);
      expect(signal[i]).toBe(0);
      expect(pct[i]).toBeNull();
    }
  });

  it('LINEAR UP step=1 -> ATR = 1 / signal = 1 / pct = 0', () => {
    for (const start of [10, 100, 1000]) {
      const data = linearSeries(40, start, 1);
      const { atr, signal, pct } = computeLineAtrCrossPct(data, {
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
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('LINEAR DOWN step=-1 -> ATR = 1 / signal = 1 / pct = 0', () => {
    for (const start of [200, 500, 2000]) {
      const data = linearSeries(40, start, -1);
      const { atr, signal, pct } = computeLineAtrCrossPct(data, {
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
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(40, 5);
    const { atr } = computeLineAtrCrossPct(data);
    expect(atr[20]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineAtrCrossPct(data, { length: 14, signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineAtrCrossPctRegime', () => {
  it('returns above when pct > 0', () => {
    expect(classifyLineAtrCrossPctRegime(1)).toBe('above');
  });
  it('returns below when pct < 0', () => {
    expect(classifyLineAtrCrossPctRegime(-1)).toBe('below');
  });
  it('returns at when pct == 0', () => {
    expect(classifyLineAtrCrossPctRegime(0)).toBe('at');
  });
  it('returns none when pct is null', () => {
    expect(classifyLineAtrCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineAtrCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineAtrCrossPct(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineAtrCrossPct(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineAtrCrossPct(constSeries(40, 5));
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineAtrCrossPct(constSeries(40, 5), {
      length: 21,
      signalLength: 5,
    });
    expect(res.length).toBe(21);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineAtrCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime at after full warmup', () => {
    const res = runLineAtrCrossPct(constSeries(40, 7));
    const sigWarmup = 14 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });
});

describe('computeLineAtrCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineAtrCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.atrPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineAtrCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineAtrCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineAtrCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and atr paths', () => {
    const lo = computeLineAtrCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.atrPath).toMatch(/^M\s/);
  });
});

describe('describeLineAtrCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineAtrCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineAtrCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions both lengths', () => {
    const text = describeLineAtrCrossPctChart(linearSeries(12, 1, 1), {
      length: 21,
      signalLength: 7,
    });
    expect(text).toContain('21');
    expect(text).toContain('7');
  });
});

describe('<ChartLineAtrCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineAtrCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineAtrCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-cross-pct"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineAtrCrossPct ref={ref} data={linearSeries(40, 100, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / signalLength / total points', () => {
    const { container } = render(
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
        length={14}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineAtrCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-atr-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineAtrCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-atr-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(4);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineAtrCrossPct data={linearSeries(40, 100, 1)} />,
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
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
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
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
        length={14}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders atr / signal / pct paths', () => {
    const { container } = render(
      <ChartLineAtrCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-atr-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-signal-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-pct-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAtrCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides pct when defaultHiddenSeries includes pct', () => {
    const { container } = render(
      <ChartLineAtrCrossPct
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['pct']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ATR Cross Pct integration', () => {
  it('three bit-exact anchors: CONST>0, LINEAR UP, LINEAR DOWN -> ATR / signal / pct hit clean values', () => {
    const sigWarmup = 14 + 9 - 1;

    // CONST K > 0
    for (const K of [1, 5, 17, 100, 1234]) {
      const res = runLineAtrCrossPct(constSeries(40, K), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.atr).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
        expect(res.samples[i]?.atrPct).toBe(0);
      }
    }

    // LINEAR UP step = 1
    for (const start of [10, 100, 1000]) {
      const res = runLineAtrCrossPct(linearSeries(40, start, 1), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.atr).toBe(1);
        expect(res.samples[i]?.signal).toBe(1);
        expect(res.samples[i]?.atrPct).toBe(0);
      }
    }

    // LINEAR DOWN step = -1 (start large enough to keep close > 0)
    for (const start of [200, 500, 2000]) {
      const res = runLineAtrCrossPct(linearSeries(40, start, -1), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.atr).toBe(1);
        expect(res.samples[i]?.signal).toBe(1);
        expect(res.samples[i]?.atrPct).toBe(0);
      }
    }
  });
});
