import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineZlemaCrossPct,
  applyLineZlemaCrossPctEma,
  classifyLineZlemaCrossPctRegime,
  computeLineZlemaCrossPct,
  computeLineZlemaCrossPctLayout,
  describeLineZlemaCrossPctChart,
  getLineZlemaCrossPctFinitePoints,
  normalizeLineZlemaCrossPctLength,
  runLineZlemaCrossPct,
  type ChartLineZlemaCrossPctPoint,
} from './chart-line-zlema-cross-pct';

const constSeries = (n: number, K: number): ChartLineZlemaCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineZlemaCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineZlemaCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineZlemaCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineZlemaCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineZlemaCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineZlemaCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineZlemaCrossPctLength', () => {
  it('returns fallback when length is below 2', () => {
    expect(normalizeLineZlemaCrossPctLength(1, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineZlemaCrossPctLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineZlemaCrossPctLength(21.7, 14)).toBe(21);
  });
});

describe('applyLineZlemaCrossPctEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 9, 14]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineZlemaCrossPctEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineZlemaCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineZlemaCrossPct(null)).toEqual({
      zlema: [],
      pct: [],
      lag: 0,
    });
  });

  it('CONST close = K > 0 -> ZLEMA = K and zlemaPct = 0', () => {
    for (const K of [1, 5, 17, 100]) {
      for (const length of [9, 14, 21]) {
        const data = constSeries(60, K);
        const { zlema, pct, lag } = computeLineZlemaCrossPct(data, {
          length,
        });
        const warmup = lag + length - 1;
        for (let i = warmup; i < data.length; i += 1) {
          expect(zlema[i]).toBe(K);
          expect(pct[i]).toBe(0);
        }
      }
    }
  });

  it('CONST close = 0 -> zlemaPct = null', () => {
    const data = constSeries(40, 0);
    const { zlema, pct, lag } = computeLineZlemaCrossPct(data, { length: 14 });
    const warmup = lag + 14 - 1;
    for (let i = warmup; i < data.length; i += 1) {
      expect(zlema[i]).toBe(0);
      expect(pct[i]).toBeNull();
    }
  });

  it('falls back to the default length when omitted', () => {
    const data = constSeries(40, 5);
    const { zlema } = computeLineZlemaCrossPct(data);
    expect(zlema[20]).toBe(5);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineZlemaCrossPct(data, { length: 14 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('lag is floor((length-1)/2)', () => {
    expect(computeLineZlemaCrossPct(constSeries(40, 5), { length: 14 }).lag).toBe(
      6,
    );
    expect(computeLineZlemaCrossPct(constSeries(40, 5), { length: 9 }).lag).toBe(
      4,
    );
    expect(computeLineZlemaCrossPct(constSeries(40, 5), { length: 21 }).lag).toBe(
      10,
    );
  });
});

describe('classifyLineZlemaCrossPctRegime', () => {
  it('returns above for positive pct', () => {
    expect(classifyLineZlemaCrossPctRegime(1)).toBe('above');
  });
  it('returns below for negative pct', () => {
    expect(classifyLineZlemaCrossPctRegime(-1)).toBe('below');
  });
  it('returns at for zero pct', () => {
    expect(classifyLineZlemaCrossPctRegime(0)).toBe('at');
  });
  it('returns none for null pct', () => {
    expect(classifyLineZlemaCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineZlemaCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineZlemaCrossPct(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineZlemaCrossPct(constSeries(60, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length', () => {
    const res = runLineZlemaCrossPct(constSeries(60, 5));
    expect(res.length).toBe(14);
  });

  it('accepts custom length', () => {
    const res = runLineZlemaCrossPct(constSeries(60, 5), { length: 21 });
    expect(res.length).toBe(21);
  });

  it('sorts series by x', () => {
    const res = runLineZlemaCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime at after warmup', () => {
    const res = runLineZlemaCrossPct(constSeries(60, 7));
    const warmup = res.lag + 14 - 1;
    for (let i = warmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });

  it('CONST K = 0 -> regime none everywhere', () => {
    const res = runLineZlemaCrossPct(constSeries(60, 0));
    expect(res.noneCount).toBe(60);
  });
});

describe('computeLineZlemaCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineZlemaCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.zlemaPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineZlemaCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above pct', () => {
    const lo = computeLineZlemaCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.pctTop);
    expect(lo.pctTop).toBeLessThan(lo.pctBottom);
  });

  it('zero in the pct axis sits between top and bottom', () => {
    const lo = computeLineZlemaCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.pctTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.pctBottom);
  });

  it('renders price and zlema paths', () => {
    const lo = computeLineZlemaCrossPctLayout({
      data: linearSeries(40, 10, 1),
      length: 14,
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.zlemaPath).toMatch(/^M\s/);
  });
});

describe('describeLineZlemaCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineZlemaCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineZlemaCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions the length', () => {
    const text = describeLineZlemaCrossPctChart(linearSeries(12, 1, 1), {
      length: 21,
    });
    expect(text).toContain('21');
  });
});

describe('<ChartLineZlemaCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineZlemaCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-zlema-cross-pct"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineZlemaCrossPct ref={ref} data={linearSeries(30, 10, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / lag / total points', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(40, 10, 1)}
        length={14}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-zlema-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.lag).toBe('6');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports regime counts as data attributes', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct data={constSeries(60, 7)} length={14} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-zlema-cross-pct"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.aboveCount)).toBe(0);
    expect(Number(root?.dataset.belowCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-zlema-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-zlema-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="zlema"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(30, 10, 1)}
        hiddenSeries={['zlema']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="zlema"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'zlema',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(30, 10, 1)}
        length={14}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(30, 10, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(30, 10, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(30, 10, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(30, 10, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(30, 10, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-zlema-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(30, 10, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain('animate-fade-in');
  });

  it('renders zlema and pct paths', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-pct-zlema"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-pct-pct"]',
      ),
    ).not.toBeNull();
  });

  it('renders the close price path', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides zlema when defaultHiddenSeries includes zlema', () => {
    const { container } = render(
      <ChartLineZlemaCrossPct
        data={linearSeries(30, 10, 1)}
        defaultHiddenSeries={['zlema']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="zlema"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ZLEMA Pct integration', () => {
  it('CONST K > 0 -> ZLEMA = K bit-exact and zlemaPct = 0 (multiple K x length tuples)', () => {
    for (const K of [1, 2, 5, 17, 100, 1234]) {
      for (const length of [9, 14, 16, 21]) {
        const res = runLineZlemaCrossPct(constSeries(60, K), { length });
        const warmup = res.lag + length - 1;
        for (let i = warmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.zlema).toBe(K);
          expect(res.samples[i]?.zlemaPct).toBe(0);
        }
      }
    }
  });
});
