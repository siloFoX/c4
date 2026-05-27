import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineElderBullCross,
  applyLineElderBullCrossEma,
  classifyLineElderBullCrossRegime,
  computeLineElderBullCross,
  computeLineElderBullCrossLayout,
  describeLineElderBullCrossChart,
  detectLineElderBullCrossCrosses,
  getLineElderBullCrossFinitePoints,
  normalizeLineElderBullCrossLength,
  runLineElderBullCross,
  type ChartLineElderBullCrossPoint,
} from './chart-line-elder-bull-cross';

const constSeries = (n: number, K: number): ChartLineElderBullCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineElderBullCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const linearDownSeries = (n: number): ChartLineElderBullCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineElderBullCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineElderBullCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineElderBullCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineElderBullCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineElderBullCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineElderBullCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineElderBullCrossLength(0, 13)).toBe(13);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineElderBullCrossLength('x', 13)).toBe(13);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineElderBullCrossLength(20.9, 13)).toBe(20);
  });
});

describe('applyLineElderBullCrossEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 13]) {
        const v = new Array<number>(40).fill(K);
        const out = applyLineElderBullCrossEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineElderBullCross', () => {
  it('handles null series', () => {
    expect(computeLineElderBullCross(null)).toEqual({
      bull: [],
    });
  });

  it('CONST K -> bull = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineElderBullCross(data);
      for (let i = 12; i < data.length; i += 1) {
        expect(ch.bull[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP -> bull > 0', () => {
    const data = linearUpSeries(40);
    const ch = computeLineElderBullCross(data);
    for (let i = 14; i < data.length; i += 1) {
      const b = ch.bull[i];
      expect(b).not.toBeNull();
      expect(b!).toBeGreaterThan(0);
    }
  });

  it('LINEAR DOWN -> bull < 0', () => {
    const data = linearDownSeries(40);
    const ch = computeLineElderBullCross(data);
    for (let i = 14; i < data.length; i += 1) {
      const b = ch.bull[i];
      expect(b).not.toBeNull();
      expect(b!).toBeLessThan(0);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineElderBullCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineElderBullCrossRegime', () => {
  it('returns bullish when bull > 0', () => {
    expect(classifyLineElderBullCrossRegime(1)).toBe('bullish');
  });
  it('returns bearish when bull < 0', () => {
    expect(classifyLineElderBullCrossRegime(-1)).toBe('bearish');
  });
  it('returns neutral when bull == 0', () => {
    expect(classifyLineElderBullCrossRegime(0)).toBe('neutral');
  });
  it('returns none when bull is null', () => {
    expect(classifyLineElderBullCrossRegime(null)).toBe('none');
  });
});

describe('detectLineElderBullCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineElderBullCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineElderBullCrossCrosses(series, [-1, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineElderBullCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineElderBullCrossCrosses(series, [1, -1])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineElderBullCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineElderBullCrossCrosses(series, [null, 1])).toEqual([]);
  });
});

describe('runLineElderBullCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineElderBullCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineElderBullCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineElderBullCross(constSeries(40, 5));
    expect(res.length).toBe(13);
    expect(res.highProxyLength).toBe(2);
  });

  it('accepts custom lengths', () => {
    const res = runLineElderBullCross(constSeries(40, 5), {
      length: 21,
      highProxyLength: 3,
    });
    expect(res.length).toBe(21);
    expect(res.highProxyLength).toBe(3);
  });

  it('sorts series by x', () => {
    const res = runLineElderBullCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineElderBullCross(constSeries(40, 7));
    for (let i = 12; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineElderBullCross(linearUpSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });

  it('LINEAR DOWN -> regime bearish after warmup', () => {
    const res = runLineElderBullCross(linearDownSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});

describe('computeLineElderBullCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineElderBullCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.bullPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineElderBullCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineElderBullCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineElderBullCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and bull paths', () => {
    const lo = computeLineElderBullCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.bullPath).toMatch(/^M\s/);
  });
});

describe('describeLineElderBullCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineElderBullCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineElderBullCrossChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });

  it('mentions lengths', () => {
    const text = describeLineElderBullCrossChart(linearUpSeries(12), {
      length: 21,
      highProxyLength: 3,
    });
    expect(text).toContain('21');
    expect(text).toContain('3');
  });
});

describe('<ChartLineElderBullCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineElderBullCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bull-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineElderBullCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-elder-bull-cross"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineElderBullCross ref={ref} data={linearUpSeries(40)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineElderBullCross data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-bull-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('13');
    expect(root?.dataset.highProxyLength).toBe('2');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineElderBullCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-bull-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineElderBullCross data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-elder-bull-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders two legend items', () => {
    const { container } = render(
      <ChartLineElderBullCross data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-elder-bull-cross-legend"] button',
    );
    expect(buttons.length).toBe(2);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineElderBullCross data={linearUpSeries(40)} />,
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
      <ChartLineElderBullCross
        data={linearUpSeries(40)}
        hiddenSeries={['bull']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="bull"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'bull',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineElderBullCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bull-cross-badge"]',
      )?.textContent,
    ).toContain('length 13');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineElderBullCross
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bull-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineElderBullCross
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bull-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineElderBullCross
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bull-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineElderBullCross
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-bull-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineElderBullCross
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders bull path', () => {
    const { container } = render(
      <ChartLineElderBullCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bull-cross-bull-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineElderBullCross
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bull-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineElderBullCross
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bull-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides bull when defaultHiddenSeries includes bull', () => {
    const { container } = render(
      <ChartLineElderBullCross
        data={linearUpSeries(40)}
        defaultHiddenSeries={['bull']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="bull"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zero line', () => {
    const { container } = render(
      <ChartLineElderBullCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bull-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Elder Bull Cross integration', () => {
  it('CONST K -> bull=0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineElderBullCross(constSeries(40, K));
      for (let i = 12; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.bull).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
