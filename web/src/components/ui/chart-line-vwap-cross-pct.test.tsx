import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVwapCrossPct,
  classifyLineVwapCrossPctRegime,
  computeLineVwapCrossPct,
  computeLineVwapCrossPctLayout,
  describeLineVwapCrossPctChart,
  detectLineVwapCrossPctCrosses,
  getLineVwapCrossPctFinitePoints,
  normalizeLineVwapCrossPctLength,
  runLineVwapCrossPct,
  type ChartLineVwapCrossPctPoint,
} from './chart-line-vwap-cross-pct';

const constSeries = (n: number, K: number): ChartLineVwapCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineVwapCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineVwapCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineVwapCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineVwapCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineVwapCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineVwapCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineVwapCrossPctLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineVwapCrossPctLength(0, 20)).toBe(20);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineVwapCrossPctLength('x', 20)).toBe(20);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineVwapCrossPctLength(15.7, 20)).toBe(15);
  });
});

describe('computeLineVwapCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineVwapCrossPct(null)).toEqual({
      vwap: [],
      pct: [],
    });
  });

  it('CONST K > 0 -> vwap = K, pct = 0', () => {
    for (const K of [1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineVwapCrossPct(data);
      for (let i = 19; i < data.length; i += 1) {
        expect(ch.vwap[i]).toBe(K);
        expect(ch.pct[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 -> pct = 0 via divide-by-zero guard', () => {
    const data = constSeries(40, 0);
    const ch = computeLineVwapCrossPct(data);
    for (let i = 19; i < data.length; i += 1) {
      expect(ch.pct[i]).toBe(0);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineVwapCrossPct(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('LINEAR UP -> pct > 0 (close above VWAP)', () => {
    const data = linearSeries(40, 1, 1);
    const ch = computeLineVwapCrossPct(data);
    for (let i = 19; i < data.length; i += 1) {
      const p = ch.pct[i];
      expect(p).not.toBeNull();
      expect(p!).toBeGreaterThan(0);
    }
  });
});

describe('classifyLineVwapCrossPctRegime', () => {
  it('returns bullish when pct > 0', () => {
    expect(classifyLineVwapCrossPctRegime(1)).toBe('bullish');
  });
  it('returns bearish when pct < 0', () => {
    expect(classifyLineVwapCrossPctRegime(-1)).toBe('bearish');
  });
  it('returns neutral when pct == 0', () => {
    expect(classifyLineVwapCrossPctRegime(0)).toBe('neutral');
  });
  it('returns none when pct is null', () => {
    expect(classifyLineVwapCrossPctRegime(null)).toBe('none');
  });
});

describe('detectLineVwapCrossPctCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineVwapCrossPctPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineVwapCrossPctCrosses(series, [-1, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineVwapCrossPctPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineVwapCrossPctCrosses(series, [1, -1])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineVwapCrossPctPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineVwapCrossPctCrosses(series, [null, 1])).toEqual([]);
  });
});

describe('runLineVwapCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineVwapCrossPct(constSeries(15, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineVwapCrossPct(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length', () => {
    const res = runLineVwapCrossPct(constSeries(40, 5));
    expect(res.length).toBe(20);
  });

  it('accepts custom length', () => {
    const res = runLineVwapCrossPct(constSeries(40, 5), { length: 14 });
    expect(res.length).toBe(14);
  });

  it('sorts series by x', () => {
    const res = runLineVwapCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineVwapCrossPct(constSeries(40, 7));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineVwapCrossPct(linearSeries(40, 1, 1));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });
});

describe('computeLineVwapCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineVwapCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.vwapPath).toBe('');
    expect(lo.pctPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineVwapCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineVwapCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineVwapCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price, vwap, pct paths', () => {
    const lo = computeLineVwapCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.vwapPath).toMatch(/^M\s/);
    expect(lo.pctPath).toMatch(/^M\s/);
  });
});

describe('describeLineVwapCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineVwapCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineVwapCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions the length', () => {
    const text = describeLineVwapCrossPctChart(linearSeries(12, 1, 1), {
      length: 14,
    });
    expect(text).toContain('14');
  });
});

describe('<ChartLineVwapCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineVwapCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineVwapCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwap-cross-pct"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineVwapCrossPct ref={ref} data={linearSeries(40, 100, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / total points as data attributes', () => {
    const { container } = render(
      <ChartLineVwapCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('20');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineVwapCrossPct data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-cross-pct"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineVwapCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vwap-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineVwapCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-vwap-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineVwapCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="vwap"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVwapCrossPct
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
      <ChartLineVwapCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 20');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineVwapCrossPct
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineVwapCrossPct
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineVwapCrossPct
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineVwapCrossPct
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineVwapCrossPct
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders vwap and pct paths', () => {
    const { container } = render(
      <ChartLineVwapCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-vwap-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-pct-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineVwapCrossPct
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineVwapCrossPct
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides pct when defaultHiddenSeries includes pct', () => {
    const { container } = render(
      <ChartLineVwapCrossPct
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['pct']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zero line', () => {
    const { container } = render(
      <ChartLineVwapCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-pct-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('VWAP Cross Percent integration', () => {
  it('CONST K -> pct = 0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineVwapCrossPct(constSeries(40, K));
      for (let i = 19; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.pct).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
