import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStochCrossPct,
  applyLineStochCrossPctSma,
  classifyLineStochCrossPctRegime,
  computeLineStochCrossPct,
  computeLineStochCrossPctLayout,
  describeLineStochCrossPctChart,
  getLineStochCrossPctFinitePoints,
  normalizeLineStochCrossPctLength,
  runLineStochCrossPct,
  type ChartLineStochCrossPctPoint,
} from './chart-line-stoch-cross-pct';

const constSeries = (n: number, K: number): ChartLineStochCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineStochCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineStochCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineStochCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineStochCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineStochCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineStochCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineStochCrossPctLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineStochCrossPctLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineStochCrossPctLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineStochCrossPctLength(21.7, 14)).toBe(21);
  });
});

describe('applyLineStochCrossPctSma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [2, 3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineStochCrossPctSma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineStochCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineStochCrossPct(null)).toEqual({
      k: [],
      d: [],
      pct: [],
    });
  });

  it('LINEAR UP step=1 -> rawK=100 -> %K=100 -> %D=100 -> stochPct=0', () => {
    for (const start of [0, 10, 100]) {
      const data = linearSeries(60, start, 1);
      const { k, d, pct } = computeLineStochCrossPct(data, {
        kLength: 14,
        slowKLength: 3,
        dLength: 3,
      });
      const kWarmup = 14 - 1 + 3 - 1;
      const dWarmup = kWarmup + 3 - 1;
      for (let i = kWarmup; i < data.length; i += 1) {
        expect(k[i]).toBe(100);
      }
      for (let i = dWarmup; i < data.length; i += 1) {
        expect(d[i]).toBe(100);
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('CONST K -> rawK = null -> K = null -> stochPct = null', () => {
    const data = constSeries(40, 5);
    const { k, d, pct } = computeLineStochCrossPct(data, {
      kLength: 14,
      slowKLength: 3,
      dLength: 3,
    });
    for (let i = 0; i < data.length; i += 1) {
      expect(k[i]).toBeNull();
      expect(d[i]).toBeNull();
      expect(pct[i]).toBeNull();
    }
  });

  it('falls back to default lengths', () => {
    const data = linearSeries(60, 0, 1);
    const { k } = computeLineStochCrossPct(data);
    expect(k[20]).toBe(100);
  });

  it('does not mutate the input series', () => {
    const data = [...linearSeries(40, 0, 1)];
    const snapshot = JSON.stringify(data);
    computeLineStochCrossPct(data, {
      kLength: 14,
      slowKLength: 3,
      dLength: 3,
    });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineStochCrossPctRegime', () => {
  it('returns above when pct > 0', () => {
    expect(classifyLineStochCrossPctRegime(1)).toBe('above');
  });
  it('returns below when pct < 0', () => {
    expect(classifyLineStochCrossPctRegime(-1)).toBe('below');
  });
  it('returns at when pct == 0', () => {
    expect(classifyLineStochCrossPctRegime(0)).toBe('at');
  });
  it('returns none when pct is null', () => {
    expect(classifyLineStochCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineStochCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineStochCrossPct(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineStochCrossPct(linearSeries(60, 0, 1));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineStochCrossPct(linearSeries(60, 0, 1));
    expect(res.kLength).toBe(14);
    expect(res.slowKLength).toBe(3);
    expect(res.dLength).toBe(3);
  });

  it('accepts custom lengths', () => {
    const res = runLineStochCrossPct(linearSeries(60, 0, 1), {
      kLength: 21,
      slowKLength: 5,
      dLength: 5,
    });
    expect(res.kLength).toBe(21);
    expect(res.slowKLength).toBe(5);
    expect(res.dLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineStochCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('LINEAR UP -> regime at after full warmup', () => {
    const res = runLineStochCrossPct(linearSeries(60, 0, 1));
    const dWarmup = 14 - 1 + 3 - 1 + 3 - 1;
    for (let i = dWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });

  it('CONST K -> regime none everywhere', () => {
    const res = runLineStochCrossPct(constSeries(60, 5));
    expect(res.noneCount).toBe(60);
  });
});

describe('computeLineStochCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineStochCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.kPath).toBe('');
    expect(lo.dPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineStochCrossPctLayout({
      data: linearSeries(60, 0, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineStochCrossPctLayout({
      data: linearSeries(60, 0, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineStochCrossPctLayout({
      data: linearSeries(60, 0, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and k paths', () => {
    const lo = computeLineStochCrossPctLayout({
      data: linearSeries(60, 0, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.kPath).toMatch(/^M\s/);
  });
});

describe('describeLineStochCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineStochCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineStochCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions all three lengths', () => {
    const text = describeLineStochCrossPctChart(linearSeries(12, 1, 1), {
      kLength: 14,
      slowKLength: 5,
      dLength: 7,
    });
    expect(text).toContain('14');
    expect(text).toContain('5');
    expect(text).toContain('7');
  });
});

describe('<ChartLineStochCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineStochCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineStochCrossPct data={linearSeries(60, 0, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineStochCrossPct ref={ref} data={linearSeries(60, 0, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes k / slow / d lengths and total points', () => {
    const { container } = render(
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
        kLength={14}
        slowKLength={3}
        dLength={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.kLength).toBe('14');
    expect(root?.dataset.slowKLength).toBe('3');
    expect(root?.dataset.dLength).toBe('3');
    expect(root?.dataset.totalPoints).toBe('60');
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineStochCrossPct data={linearSeries(60, 0, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineStochCrossPct data={linearSeries(60, 0, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-stoch-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(4);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineStochCrossPct data={linearSeries(60, 0, 1)} />,
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
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
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
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
        kLength={14}
        slowKLength={3}
        dLength={3}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-badge"]',
      )?.textContent,
    ).toContain('k 14');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders k / d / pct paths', () => {
    const { container } = render(
      <ChartLineStochCrossPct data={linearSeries(60, 0, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-k-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-d-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-pct-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineStochCrossPct data={linearSeries(60, 0, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides pct when defaultHiddenSeries includes pct', () => {
    const { container } = render(
      <ChartLineStochCrossPct
        data={linearSeries(60, 0, 1)}
        defaultHiddenSeries={['pct']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Stochastic Cross Pct integration', () => {
  it('LINEAR UP -> %K=100 / %D=100 / stochPct=0 across multiple start values', () => {
    for (const start of [0, 10, 100, 1234]) {
      const res = runLineStochCrossPct(linearSeries(60, start, 1), {
        kLength: 14,
        slowKLength: 3,
        dLength: 3,
      });
      const dWarmup = 14 - 1 + 3 - 1 + 3 - 1;
      for (let i = dWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.k).toBe(100);
        expect(res.samples[i]?.d).toBe(100);
        expect(res.samples[i]?.stochPct).toBe(0);
      }
    }
  });
});
