import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineElderRayCross,
  applyLineElderRayCrossEma,
  classifyLineElderRayCrossRegime,
  computeLineElderRayCross,
  computeLineElderRayCrossLayout,
  describeLineElderRayCrossChart,
  detectLineElderRayCrossCrosses,
  getLineElderRayCrossFinitePoints,
  normalizeLineElderRayCrossLength,
  runLineElderRayCross,
  type ChartLineElderRayCrossPoint,
} from './chart-line-elder-ray-cross';

const constSeries = (n: number, K: number): ChartLineElderRayCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineElderRayCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineElderRayCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineElderRayCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineElderRayCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineElderRayCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineElderRayCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineElderRayCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineElderRayCrossLength(0, 13)).toBe(13);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineElderRayCrossLength('x', 13)).toBe(13);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineElderRayCrossLength(20.9, 13)).toBe(20);
  });
});

describe('applyLineElderRayCrossEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 9, 13]) {
        const v = new Array<number>(40).fill(K);
        const out = applyLineElderRayCrossEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('handles empty', () => {
    expect(applyLineElderRayCrossEma([], 9)).toEqual([]);
  });
});

describe('computeLineElderRayCross', () => {
  it('handles null series', () => {
    expect(computeLineElderRayCross(null)).toEqual({
      ema: [],
      bull: [],
      bear: [],
    });
  });

  it('CONST close = K -> bull = bear = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineElderRayCross(data);
      const warmup = 13 - 1;
      for (let i = warmup; i < data.length; i += 1) {
        expect(ch.bull[i]).toBe(0);
        expect(ch.bear[i]).toBe(0);
      }
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineElderRayCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('LINEAR UP series produces bull > bear', () => {
    const data = linearSeries(40, 0, 1);
    const ch = computeLineElderRayCross(data);
    for (let i = 14; i < data.length; i += 1) {
      const b = ch.bull[i];
      const r = ch.bear[i];
      if (b != null && r != null) {
        expect(b).toBeGreaterThan(r);
      }
    }
  });
});

describe('classifyLineElderRayCrossRegime', () => {
  it('returns bullish when bull > bear', () => {
    expect(classifyLineElderRayCrossRegime(1, -1)).toBe('bullish');
  });
  it('returns bearish when bull < bear', () => {
    expect(classifyLineElderRayCrossRegime(-1, 1)).toBe('bearish');
  });
  it('returns neutral when bull == bear', () => {
    expect(classifyLineElderRayCrossRegime(0, 0)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineElderRayCrossRegime(null, 0)).toBe('none');
    expect(classifyLineElderRayCrossRegime(0, null)).toBe('none');
  });
});

describe('detectLineElderRayCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineElderRayCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const bull = [-1, 1, 1];
    const bear = [0, 0, 0];
    expect(detectLineElderRayCrossCrosses(series, bull, bear)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineElderRayCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const bull = [1, -1, -1];
    const bear = [0, 0, 0];
    expect(detectLineElderRayCrossCrosses(series, bull, bear)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineElderRayCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineElderRayCrossCrosses(series, [null, 1], [null, 0]),
    ).toEqual([]);
  });
});

describe('runLineElderRayCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineElderRayCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineElderRayCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineElderRayCross(constSeries(40, 5));
    expect(res.length).toBe(13);
    expect(res.highProxyLength).toBe(2);
  });

  it('accepts custom lengths', () => {
    const res = runLineElderRayCross(constSeries(40, 5), {
      length: 9,
      highProxyLength: 3,
    });
    expect(res.length).toBe(9);
    expect(res.highProxyLength).toBe(3);
  });

  it('sorts series by x', () => {
    const res = runLineElderRayCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineElderRayCross(constSeries(40, 7));
    for (let i = 13; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });
});

describe('computeLineElderRayCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineElderRayCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.bullPath).toBe('');
    expect(lo.bearPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineElderRayCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineElderRayCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineElderRayCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price, bull, and bear paths', () => {
    const lo = computeLineElderRayCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.bullPath).toMatch(/^M\s/);
    expect(lo.bearPath).toMatch(/^M\s/);
  });
});

describe('describeLineElderRayCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineElderRayCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineElderRayCrossChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions the lengths', () => {
    const text = describeLineElderRayCrossChart(linearSeries(12, 1, 1), {
      length: 21,
      highProxyLength: 3,
    });
    expect(text).toContain('21');
    expect(text).toContain('3');
  });
});

describe('<ChartLineElderRayCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineElderRayCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineElderRayCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineElderRayCross
        ref={ref}
        data={linearSeries(40, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineElderRayCross data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-ray-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('13');
    expect(root?.dataset.highProxyLength).toBe('2');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineElderRayCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-ray-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineElderRayCross data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-elder-ray-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineElderRayCross data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-elder-ray-cross-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineElderRayCross data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="bull"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineElderRayCross
        data={linearSeries(40, 100, 1)}
        hiddenSeries={['bear']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="bear"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'bear',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineElderRayCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-badge"]',
      )?.textContent,
    ).toContain('length 13');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineElderRayCross
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineElderRayCross
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineElderRayCross
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineElderRayCross
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-ray-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineElderRayCross
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders bull and bear paths', () => {
    const { container } = render(
      <ChartLineElderRayCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-bull-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-bear-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineElderRayCross
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineElderRayCross
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides bear when defaultHiddenSeries includes bear', () => {
    const { container } = render(
      <ChartLineElderRayCross
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['bear']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="bear"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zero line', () => {
    const { container } = render(
      <ChartLineElderRayCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-ray-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Elder Ray Cross integration', () => {
  it('CONST K -> bull = bear = 0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineElderRayCross(constSeries(40, K));
      for (let i = 13; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.bull).toBe(0);
        expect(res.samples[i]?.bear).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
