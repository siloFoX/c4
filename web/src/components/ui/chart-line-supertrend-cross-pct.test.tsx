import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSupertrendCrossPct,
  applyLineSupertrendCrossPctWilder,
  classifyLineSupertrendCrossPctRegime,
  computeLineSupertrendCrossPct,
  computeLineSupertrendCrossPctLayout,
  describeLineSupertrendCrossPctChart,
  getLineSupertrendCrossPctFinitePoints,
  normalizeLineSupertrendCrossPctFactor,
  normalizeLineSupertrendCrossPctLength,
  runLineSupertrendCrossPct,
  type ChartLineSupertrendCrossPctPoint,
} from './chart-line-supertrend-cross-pct';

const constSeries = (
  n: number,
  K: number,
): ChartLineSupertrendCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineSupertrendCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineSupertrendCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineSupertrendCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineSupertrendCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineSupertrendCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineSupertrendCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineSupertrendCrossPctLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineSupertrendCrossPctLength(0, 10)).toBe(10);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineSupertrendCrossPctLength('x', 10)).toBe(10);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineSupertrendCrossPctLength(14.7, 10)).toBe(14);
  });
});

describe('normalizeLineSupertrendCrossPctFactor', () => {
  it('returns fallback when factor is non-positive', () => {
    expect(normalizeLineSupertrendCrossPctFactor(0, 3)).toBe(3);
    expect(normalizeLineSupertrendCrossPctFactor(-1, 3)).toBe(3);
  });

  it('returns fallback when factor is non-number', () => {
    expect(normalizeLineSupertrendCrossPctFactor('x', 3)).toBe(3);
  });

  it('accepts positive factor', () => {
    expect(normalizeLineSupertrendCrossPctFactor(2.5, 3)).toBe(2.5);
  });
});

describe('applyLineSupertrendCrossPctWilder', () => {
  it('matches the bit-exact CONST K via the short-circuit', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [2, 3, 5, 10]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineSupertrendCrossPctWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineSupertrendCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineSupertrendCrossPct(null)).toEqual({
      supertrend: [],
      pct: [],
    });
  });

  it('CONST close = K > 0 -> Supertrend = K bit-exact and stPct = 0', () => {
    for (const K of [1, 5, 17, 100, 1234]) {
      for (const length of [5, 10, 14]) {
        const data = constSeries(40, K);
        const { supertrend, pct } = computeLineSupertrendCrossPct(data, {
          length,
        });
        const warmup = length;
        for (let i = warmup; i < data.length; i += 1) {
          expect(supertrend[i]).toBe(K);
          expect(pct[i]).toBe(0);
        }
      }
    }
  });

  it('CONST close = 0 -> stPct = null', () => {
    const data = constSeries(40, 0);
    const { supertrend, pct } = computeLineSupertrendCrossPct(data);
    for (let i = 10; i < data.length; i += 1) {
      expect(supertrend[i]).toBe(0);
      expect(pct[i]).toBeNull();
    }
  });

  it('falls back to default length and factor', () => {
    const data = constSeries(40, 5);
    const { supertrend } = computeLineSupertrendCrossPct(data);
    expect(supertrend[20]).toBe(5);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineSupertrendCrossPct(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineSupertrendCrossPctRegime', () => {
  it('returns above for positive pct', () => {
    expect(classifyLineSupertrendCrossPctRegime(1)).toBe('above');
  });
  it('returns below for negative pct', () => {
    expect(classifyLineSupertrendCrossPctRegime(-1)).toBe('below');
  });
  it('returns at for zero pct', () => {
    expect(classifyLineSupertrendCrossPctRegime(0)).toBe('at');
  });
  it('returns none for null pct', () => {
    expect(classifyLineSupertrendCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineSupertrendCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineSupertrendCrossPct(constSeries(5, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineSupertrendCrossPct(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineSupertrendCrossPct(constSeries(40, 5));
    expect(res.length).toBe(10);
    expect(res.factor).toBe(3);
  });

  it('accepts custom length and factor', () => {
    const res = runLineSupertrendCrossPct(constSeries(40, 5), {
      length: 14,
      factor: 2.5,
    });
    expect(res.length).toBe(14);
    expect(res.factor).toBe(2.5);
  });

  it('sorts series by x', () => {
    const res = runLineSupertrendCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime at after warmup', () => {
    const res = runLineSupertrendCrossPct(constSeries(40, 7));
    const warmup = 10;
    for (let i = warmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });

  it('CONST K = 0 -> regime none everywhere', () => {
    const res = runLineSupertrendCrossPct(constSeries(40, 0));
    expect(res.noneCount).toBe(40);
  });
});

describe('computeLineSupertrendCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineSupertrendCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.supertrendPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineSupertrendCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above pct', () => {
    const lo = computeLineSupertrendCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.pctTop);
    expect(lo.pctTop).toBeLessThan(lo.pctBottom);
  });

  it('zero in the pct axis sits between top and bottom', () => {
    const lo = computeLineSupertrendCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.pctTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.pctBottom);
  });

  it('renders price and supertrend paths', () => {
    const lo = computeLineSupertrendCrossPctLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.supertrendPath).toMatch(/^M\s/);
  });
});

describe('describeLineSupertrendCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineSupertrendCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineSupertrendCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions length and factor', () => {
    const text = describeLineSupertrendCrossPctChart(
      linearSeries(12, 1, 1),
      { length: 14, factor: 2 },
    );
    expect(text).toContain('14');
    expect(text).toContain('2');
  });
});

describe('<ChartLineSupertrendCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineSupertrendCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineSupertrendCrossPct
        ref={ref}
        data={linearSeries(30, 10, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / factor / total points', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(40, 10, 1)}
        length={10}
        factor={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('10');
    expect(root?.dataset.factor).toBe('3');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports regime counts as data attributes', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct data={constSeries(40, 7)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-cross-pct"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.aboveCount)).toBe(0);
    expect(Number(root?.dataset.belowCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-supertrend-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-supertrend-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="supertrend"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(30, 10, 1)}
        hiddenSeries={['supertrend']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="supertrend"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'supertrend',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(30, 10, 1)}
        length={10}
        factor={3}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 10');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(30, 10, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(30, 10, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(30, 10, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(30, 10, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(30, 10, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(30, 10, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders supertrend and pct paths', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct-supertrend"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct-pct"]',
      ),
    ).not.toBeNull();
  });

  it('renders the close price path', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides supertrend when defaultHiddenSeries includes supertrend', () => {
    const { container } = render(
      <ChartLineSupertrendCrossPct
        data={linearSeries(30, 10, 1)}
        defaultHiddenSeries={['supertrend']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="supertrend"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Supertrend Pct integration', () => {
  it('CONST K > 0 -> Supertrend = K bit-exact and stPct = 0 (multiple K x length tuples)', () => {
    for (const K of [1, 2, 5, 17, 100, 1234]) {
      for (const length of [5, 10, 14, 21]) {
        const res = runLineSupertrendCrossPct(constSeries(60, K), {
          length,
        });
        const warmup = length;
        for (let i = warmup; i < res.samples.length; i += 1) {
          expect(res.samples[i]?.supertrend).toBe(K);
          expect(res.samples[i]?.stPct).toBe(0);
        }
      }
    }
  });
});
