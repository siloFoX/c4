import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRocCrossPct,
  applyLineRocCrossPctEma,
  classifyLineRocCrossPctRegime,
  computeLineRocCrossPct,
  computeLineRocCrossPctLayout,
  describeLineRocCrossPctChart,
  getLineRocCrossPctFinitePoints,
  normalizeLineRocCrossPctLength,
  runLineRocCrossPct,
  type ChartLineRocCrossPctPoint,
} from './chart-line-roc-cross-pct';

const constSeries = (n: number, K: number): ChartLineRocCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineRocCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineRocCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineRocCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineRocCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineRocCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineRocCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineRocCrossPctLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineRocCrossPctLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineRocCrossPctLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineRocCrossPctLength(21.7, 14)).toBe(21);
  });
});

describe('applyLineRocCrossPctEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineRocCrossPctEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineRocCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineRocCrossPct(null)).toEqual({
      roc: [],
      signal: [],
      pct: [],
    });
  });

  it('CONST K > 0 -> ROC = 0 / signal = 0 / pct = 0', () => {
    for (const K of [1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const { roc, signal, pct } = computeLineRocCrossPct(data, {
        length: 14,
        signalLength: 9,
      });
      const rocWarmup = 14;
      const sigWarmup = rocWarmup + 9 - 1;
      for (let i = rocWarmup; i < data.length; i += 1) {
        expect(roc[i]).toBe(0);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(0);
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 -> ROC = null', () => {
    const data = constSeries(40, 0);
    const { roc, signal, pct } = computeLineRocCrossPct(data, {
      length: 14,
      signalLength: 9,
    });
    for (let i = 14; i < data.length; i += 1) {
      expect(roc[i]).toBeNull();
      expect(signal[i]).toBeNull();
      expect(pct[i]).toBeNull();
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(40, 5);
    const { roc } = computeLineRocCrossPct(data);
    expect(roc[20]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineRocCrossPct(data, { length: 14, signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineRocCrossPctRegime', () => {
  it('returns above when pct > 0', () => {
    expect(classifyLineRocCrossPctRegime(1)).toBe('above');
  });
  it('returns below when pct < 0', () => {
    expect(classifyLineRocCrossPctRegime(-1)).toBe('below');
  });
  it('returns at when pct == 0', () => {
    expect(classifyLineRocCrossPctRegime(0)).toBe('at');
  });
  it('returns none when pct is null', () => {
    expect(classifyLineRocCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineRocCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineRocCrossPct(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineRocCrossPct(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineRocCrossPct(constSeries(40, 5));
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineRocCrossPct(constSeries(40, 5), {
      length: 21,
      signalLength: 5,
    });
    expect(res.length).toBe(21);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineRocCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime at after full warmup', () => {
    const res = runLineRocCrossPct(constSeries(40, 7));
    const sigWarmup = 14 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });

  it('CONST K = 0 -> regime none everywhere', () => {
    const res = runLineRocCrossPct(constSeries(40, 0));
    expect(res.noneCount).toBe(40);
  });
});

describe('computeLineRocCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineRocCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.rocPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineRocCrossPctLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineRocCrossPctLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineRocCrossPctLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and roc paths', () => {
    const lo = computeLineRocCrossPctLayout({
      data: linearSeries(40, 10, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.rocPath).toMatch(/^M\s/);
  });
});

describe('describeLineRocCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineRocCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineRocCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions both lengths', () => {
    const text = describeLineRocCrossPctChart(linearSeries(12, 1, 1), {
      length: 21,
      signalLength: 7,
    });
    expect(text).toContain('21');
    expect(text).toContain('7');
  });
});

describe('<ChartLineRocCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineRocCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineRocCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-roc-cross-pct"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineRocCrossPct ref={ref} data={linearSeries(40, 10, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / signalLength / total points', () => {
    const { container } = render(
      <ChartLineRocCrossPct
        data={linearSeries(40, 10, 1)}
        length={14}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-roc-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineRocCrossPct data={linearSeries(40, 10, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-roc-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineRocCrossPct data={linearSeries(40, 10, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-roc-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(4);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineRocCrossPct data={linearSeries(40, 10, 1)} />,
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
      <ChartLineRocCrossPct
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
      <ChartLineRocCrossPct
        data={linearSeries(40, 10, 1)}
        length={14}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineRocCrossPct
        data={linearSeries(40, 10, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineRocCrossPct
        data={linearSeries(40, 10, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineRocCrossPct
        data={linearSeries(40, 10, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineRocCrossPct
        data={linearSeries(40, 10, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineRocCrossPct
        data={linearSeries(40, 10, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-roc-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineRocCrossPct
        data={linearSeries(40, 10, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders roc / signal / pct paths', () => {
    const { container } = render(
      <ChartLineRocCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-roc-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-signal-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-pct-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineRocCrossPct data={linearSeries(40, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-roc-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides pct when defaultHiddenSeries includes pct', () => {
    const { container } = render(
      <ChartLineRocCrossPct
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

describe('ROC Cross Pct integration', () => {
  it('CONST K > 0 -> ROC = 0 / signal = 0 / rocPct = 0 across multiple K', () => {
    const sigWarmup = 14 + 9 - 1;
    for (const K of [1, 5, 17, 100, 1234]) {
      const res = runLineRocCrossPct(constSeries(40, K), {
        length: 14,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.roc).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
        expect(res.samples[i]?.rocPct).toBe(0);
      }
    }
  });
});
