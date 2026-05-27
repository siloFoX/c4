import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHmaCrossPct,
  applyLineHmaCrossPctWma,
  classifyLineHmaCrossPctRegime,
  computeLineHmaCrossPct,
  computeLineHmaCrossPctLayout,
  describeLineHmaCrossPctChart,
  getLineHmaCrossPctFinitePoints,
  normalizeLineHmaCrossPctLength,
  runLineHmaCrossPct,
  type ChartLineHmaCrossPctPoint,
} from './chart-line-hma-cross-pct';

const constSeries = (n: number, K: number): ChartLineHmaCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineHmaCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineHmaCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineHmaCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineHmaCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineHmaCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineHmaCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineHmaCrossPctLength', () => {
  it('returns fallback when length is below 2', () => {
    expect(normalizeLineHmaCrossPctLength(1, 9)).toBe(9);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineHmaCrossPctLength('x', 9)).toBe(9);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineHmaCrossPctLength(14.7, 9)).toBe(14);
  });
});

describe('applyLineHmaCrossPctWma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [1, 2, 5, 17, 100]) {
      for (const n of [2, 3, 4, 6, 9, 14]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineHmaCrossPctWma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineHmaCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineHmaCrossPct(null)).toEqual({ hma: [], hmaPct: [] });
  });

  it('CONST K > 0 -> HMA = K and hmaPct = 0 across multiple K / length', () => {
    for (const K of [1, 2, 5, 17, 100]) {
      for (const length of [9, 14, 16, 21]) {
        const data = constSeries(60, K);
        const { hma, hmaPct } = computeLineHmaCrossPct(data, { length });
        const warmup = length + Math.floor(Math.sqrt(length)) - 1;
        for (let i = warmup; i < data.length; i += 1) {
          expect(hma[i]).toBe(K);
          expect(hmaPct[i]).toBe(0);
        }
      }
    }
  });

  it('CONST K = 0 -> hmaPct = null', () => {
    const data = constSeries(40, 0);
    const { hma, hmaPct } = computeLineHmaCrossPct(data, { length: 9 });
    const warmup = 9 + Math.floor(Math.sqrt(9)) - 1;
    for (let i = warmup; i < data.length; i += 1) {
      expect(hma[i]).toBe(0);
      expect(hmaPct[i]).toBeNull();
    }
  });

  it('falls back to the default length when omitted', () => {
    const data = constSeries(40, 5);
    const { hma } = computeLineHmaCrossPct(data);
    expect(hma[20]).toBe(5);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineHmaCrossPct(data, { length: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineHmaCrossPctRegime', () => {
  it('returns above for positive pct', () => {
    expect(classifyLineHmaCrossPctRegime(1)).toBe('above');
  });
  it('returns below for negative pct', () => {
    expect(classifyLineHmaCrossPctRegime(-1)).toBe('below');
  });
  it('returns at for zero pct', () => {
    expect(classifyLineHmaCrossPctRegime(0)).toBe('at');
  });
  it('returns none for null pct', () => {
    expect(classifyLineHmaCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineHmaCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineHmaCrossPct(constSeries(3, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineHmaCrossPct(constSeries(60, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length', () => {
    const res = runLineHmaCrossPct(constSeries(60, 5));
    expect(res.length).toBe(9);
  });

  it('accepts custom length', () => {
    const res = runLineHmaCrossPct(constSeries(60, 5), { length: 16 });
    expect(res.length).toBe(16);
  });

  it('sorts series by x', () => {
    const res = runLineHmaCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime at after warmup', () => {
    const res = runLineHmaCrossPct(constSeries(60, 7));
    const warmup = 9 + Math.floor(Math.sqrt(9)) - 1;
    for (let i = warmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });

  it('CONST K = 0 -> regime none everywhere', () => {
    const res = runLineHmaCrossPct(constSeries(60, 0));
    expect(res.noneCount).toBe(60);
  });
});

describe('computeLineHmaCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineHmaCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.hmaPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineHmaCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above pct', () => {
    const lo = computeLineHmaCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.pctTop);
    expect(lo.pctTop).toBeLessThan(lo.pctBottom);
  });

  it('zero in the pct axis sits between top and bottom', () => {
    const lo = computeLineHmaCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.pctTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.pctBottom);
  });

  it('renders price and hma paths', () => {
    const lo = computeLineHmaCrossPctLayout({
      data: linearSeries(40, 10, 1),
      length: 9,
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.hmaPath).toMatch(/^M\s/);
  });
});

describe('describeLineHmaCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineHmaCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineHmaCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions the length', () => {
    const text = describeLineHmaCrossPctChart(linearSeries(12, 1, 1), {
      length: 14,
    });
    expect(text).toContain('14');
  });
});

describe('<ChartLineHmaCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineHmaCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineHmaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-cross-pct"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineHmaCrossPct ref={ref} data={linearSeries(30, 10, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length and total point counts as data attributes', () => {
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        length={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hma-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('9');
    expect(root?.dataset.totalPoints).toBe('30');
  });

  it('reports regime counts as data attributes', () => {
    const { container } = render(
      <ChartLineHmaCrossPct data={constSeries(60, 7)} length={9} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hma-cross-pct"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.aboveCount)).toBe(0);
    expect(Number(root?.dataset.belowCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineHmaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-hma-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineHmaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-hma-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineHmaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="hma"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        hiddenSeries={['hma']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="hma"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'hma',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        length={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 9');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hma-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain('animate-fade-in');
  });

  it('renders hma and pct paths', () => {
    const { container } = render(
      <ChartLineHmaCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-pct-hma"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-pct-pct"]',
      ),
    ).not.toBeNull();
  });

  it('renders the close price path', () => {
    const { container } = render(
      <ChartLineHmaCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides hma when defaultHiddenSeries includes hma', () => {
    const { container } = render(
      <ChartLineHmaCrossPct
        data={linearSeries(30, 10, 1)}
        defaultHiddenSeries={['hma']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="hma"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('HMA Pct integration', () => {
  it('CONST K > 0 -> HMA = K bit-exact and hmaPct = 0 (multiple K x length tuples)', () => {
    for (const K of [1, 2, 5, 17, 100, 1234]) {
      for (const length of [9, 14, 16, 21]) {
        const res = runLineHmaCrossPct(constSeries(60, K), { length });
        const warmup = length + Math.floor(Math.sqrt(length)) - 1;
        for (let i = warmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.hma).toBe(K);
          expect(res.samples[i]?.hmaPct).toBe(0);
        }
      }
    }
  });
});
