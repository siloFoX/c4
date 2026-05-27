import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDemaCrossPct,
  applyLineDemaCrossPctEma,
  classifyLineDemaCrossPctRegime,
  computeLineDemaCrossPct,
  computeLineDemaCrossPctLayout,
  describeLineDemaCrossPctChart,
  getLineDemaCrossPctFinitePoints,
  normalizeLineDemaCrossPctLength,
  runLineDemaCrossPct,
  type ChartLineDemaCrossPctPoint,
} from './chart-line-dema-cross-pct';

const constSeries = (n: number, K: number): ChartLineDemaCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineDemaCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineDemaCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineDemaCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineDemaCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineDemaCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineDemaCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineDemaCrossPctLength', () => {
  it('returns fallback when length is below 2', () => {
    expect(normalizeLineDemaCrossPctLength(1, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineDemaCrossPctLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineDemaCrossPctLength(21.7, 14)).toBe(21);
  });
});

describe('applyLineDemaCrossPctEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [1, 2, 5, 17, 100]) {
      for (const n of [2, 3, 4, 6, 9, 14]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineDemaCrossPctEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineDemaCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineDemaCrossPct(null)).toEqual({
      dema: [],
      demaPct: [],
    });
  });

  it('CONST K > 0 -> DEMA = K and demaPct = 0 across multiple K / length', () => {
    for (const K of [1, 2, 5, 17, 100]) {
      for (const length of [9, 14, 21]) {
        const data = constSeries(80, K);
        const { dema, demaPct } = computeLineDemaCrossPct(data, { length });
        const warmup = 2 * length - 2;
        for (let i = warmup; i < data.length; i += 1) {
          expect(dema[i]).toBe(K);
          expect(demaPct[i]).toBe(0);
        }
      }
    }
  });

  it('CONST K = 0 -> demaPct = null', () => {
    const data = constSeries(40, 0);
    const { dema, demaPct } = computeLineDemaCrossPct(data, { length: 9 });
    for (let i = 2 * 9 - 2; i < data.length; i += 1) {
      expect(dema[i]).toBe(0);
      expect(demaPct[i]).toBeNull();
    }
  });

  it('falls back to the default length when omitted', () => {
    const data = constSeries(60, 5);
    const { dema } = computeLineDemaCrossPct(data);
    expect(dema[40]).toBe(5);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineDemaCrossPct(data, { length: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineDemaCrossPctRegime', () => {
  it('returns above for positive pct', () => {
    expect(classifyLineDemaCrossPctRegime(1)).toBe('above');
  });
  it('returns below for negative pct', () => {
    expect(classifyLineDemaCrossPctRegime(-1)).toBe('below');
  });
  it('returns at for zero pct', () => {
    expect(classifyLineDemaCrossPctRegime(0)).toBe('at');
  });
  it('returns none for null pct', () => {
    expect(classifyLineDemaCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineDemaCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineDemaCrossPct(constSeries(3, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineDemaCrossPct(constSeries(60, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length', () => {
    const res = runLineDemaCrossPct(constSeries(60, 5));
    expect(res.length).toBe(14);
  });

  it('accepts custom length', () => {
    const res = runLineDemaCrossPct(constSeries(60, 5), { length: 21 });
    expect(res.length).toBe(21);
  });

  it('sorts series by x', () => {
    const res = runLineDemaCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime at after warmup', () => {
    const res = runLineDemaCrossPct(constSeries(80, 7));
    const warmup = 2 * 14 - 2;
    for (let i = warmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });

  it('CONST K = 0 -> regime none everywhere', () => {
    const res = runLineDemaCrossPct(constSeries(60, 0));
    expect(res.noneCount).toBe(60);
  });
});

describe('computeLineDemaCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineDemaCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.demaPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineDemaCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above pct', () => {
    const lo = computeLineDemaCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.pctTop);
    expect(lo.pctTop).toBeLessThan(lo.pctBottom);
  });

  it('zero in the pct axis sits between top and bottom', () => {
    const lo = computeLineDemaCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.pctTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.pctBottom);
  });

  it('renders price and dema paths', () => {
    const lo = computeLineDemaCrossPctLayout({
      data: linearSeries(40, 10, 1),
      length: 14,
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.demaPath).toMatch(/^M\s/);
  });
});

describe('describeLineDemaCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineDemaCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineDemaCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions the length', () => {
    const text = describeLineDemaCrossPctChart(linearSeries(12, 1, 1), {
      length: 21,
    });
    expect(text).toContain('21');
  });
});

describe('<ChartLineDemaCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineDemaCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineDemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-cross-pct"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineDemaCrossPct ref={ref} data={linearSeries(30, 10, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length and total point counts as data attributes', () => {
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        length={14}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dema-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.totalPoints).toBe('30');
  });

  it('reports regime counts as data attributes', () => {
    const { container } = render(
      <ChartLineDemaCrossPct data={constSeries(60, 7)} length={14} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dema-cross-pct"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.aboveCount)).toBe(0);
    expect(Number(root?.dataset.belowCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineDemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-dema-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineDemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-dema-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineDemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="dema"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        hiddenSeries={['dema']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="dema"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'dema',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        length={14}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dema-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain('animate-fade-in');
  });

  it('renders dema and pct paths', () => {
    const { container } = render(
      <ChartLineDemaCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-pct-dema"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-pct-pct"]',
      ),
    ).not.toBeNull();
  });

  it('renders the close price path', () => {
    const { container } = render(
      <ChartLineDemaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides dema when defaultHiddenSeries includes dema', () => {
    const { container } = render(
      <ChartLineDemaCrossPct
        data={linearSeries(30, 10, 1)}
        defaultHiddenSeries={['dema']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="dema"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('DEMA Pct integration', () => {
  it('CONST K > 0 -> DEMA = K bit-exact and demaPct = 0 (multiple K x length tuples)', () => {
    for (const K of [1, 2, 5, 17, 100, 1234]) {
      for (const length of [9, 14, 21]) {
        const res = runLineDemaCrossPct(constSeries(80, K), { length });
        const warmup = 2 * length - 2;
        for (let i = warmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.dema).toBe(K);
          expect(res.samples[i]?.demaPct).toBe(0);
        }
      }
    }
  });
});
