import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineFisherCrossPct,
  applyLineFisherCrossPctEma,
  classifyLineFisherCrossPctRegime,
  computeLineFisherCrossPct,
  computeLineFisherCrossPctLayout,
  describeLineFisherCrossPctChart,
  getLineFisherCrossPctFinitePoints,
  normalizeLineFisherCrossPctLength,
  runLineFisherCrossPct,
  type ChartLineFisherCrossPctPoint,
} from './chart-line-fisher-cross-pct';

const constSeries = (n: number, K: number): ChartLineFisherCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineFisherCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineFisherCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineFisherCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineFisherCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineFisherCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineFisherCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineFisherCrossPctLength', () => {
  it('returns fallback when length is below 2', () => {
    expect(normalizeLineFisherCrossPctLength(1, 10)).toBe(10);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineFisherCrossPctLength('x', 10)).toBe(10);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineFisherCrossPctLength(14.7, 10)).toBe(14);
  });
});

describe('applyLineFisherCrossPctEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineFisherCrossPctEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineFisherCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineFisherCrossPct(null)).toEqual({
      fisher: [],
      signal: [],
      pct: [],
    });
  });

  it('CONST close = K -> fisher = 0 / signal = 0 / pct = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const { fisher, signal, pct } = computeLineFisherCrossPct(data, {
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
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(40, 5);
    const { fisher } = computeLineFisherCrossPct(data);
    expect(fisher[20]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineFisherCrossPct(data, { length: 10, signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineFisherCrossPctRegime', () => {
  it('returns above when pct > 0', () => {
    expect(classifyLineFisherCrossPctRegime(1)).toBe('above');
  });
  it('returns below when pct < 0', () => {
    expect(classifyLineFisherCrossPctRegime(-1)).toBe('below');
  });
  it('returns at when pct == 0', () => {
    expect(classifyLineFisherCrossPctRegime(0)).toBe('at');
  });
  it('returns none when pct is null', () => {
    expect(classifyLineFisherCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineFisherCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineFisherCrossPct(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineFisherCrossPct(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineFisherCrossPct(constSeries(40, 5));
    expect(res.length).toBe(10);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineFisherCrossPct(constSeries(40, 5), {
      length: 14,
      signalLength: 5,
    });
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineFisherCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime at after full warmup', () => {
    const res = runLineFisherCrossPct(constSeries(40, 7));
    const sigWarmup = 10 - 1 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });
});

describe('computeLineFisherCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineFisherCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.fisherPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineFisherCrossPctLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineFisherCrossPctLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineFisherCrossPctLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and fisher paths', () => {
    const lo = computeLineFisherCrossPctLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.fisherPath).toMatch(/^M\s/);
  });
});

describe('describeLineFisherCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineFisherCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineFisherCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions both lengths', () => {
    const text = describeLineFisherCrossPctChart(linearSeries(12, 1, 1), {
      length: 14,
      signalLength: 7,
    });
    expect(text).toContain('14');
    expect(text).toContain('7');
  });
});

describe('<ChartLineFisherCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineFisherCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineFisherCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineFisherCrossPct ref={ref} data={linearSeries(40, 10, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / signalLength / total points', () => {
    const { container } = render(
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
        length={10}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fisher-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('10');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineFisherCrossPct data={linearSeries(40, 10, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-fisher-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineFisherCrossPct data={linearSeries(40, 10, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-fisher-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(4);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineFisherCrossPct data={linearSeries(40, 10, 1)} />,
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
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
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
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
        length={10}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 10');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fisher-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders fisher / signal / pct paths', () => {
    const { container } = render(
      <ChartLineFisherCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-fisher-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-signal-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-pct-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineFisherCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides pct when defaultHiddenSeries includes pct', () => {
    const { container } = render(
      <ChartLineFisherCrossPct
        data={linearSeries(40, 10, 1)}
        defaultHiddenSeries={['pct']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Fisher Cross Pct integration', () => {
  it('CONST K -> fisher = 0 / signal = 0 / fisherPct = 0 across multiple K', () => {
    const sigWarmup = 10 - 1 + 9 - 1;
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineFisherCrossPct(constSeries(40, K), {
        length: 10,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.fisher).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
        expect(res.samples[i]?.fisherPct).toBe(0);
      }
    }
  });
});
