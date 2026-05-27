import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineElderBearCross,
  applyLineElderBearCrossEma,
  classifyLineElderBearCrossRegime,
  computeLineElderBearCross,
  computeLineElderBearCrossLayout,
  describeLineElderBearCrossChart,
  detectLineElderBearCrossCrosses,
  getLineElderBearCrossFinitePoints,
  normalizeLineElderBearCrossLength,
  runLineElderBearCross,
  type ChartLineElderBearCrossPoint,
} from './chart-line-elder-bear-cross';

const constSeries = (n: number, K: number): ChartLineElderBearCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineElderBearCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const linearDownSeries = (n: number): ChartLineElderBearCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineElderBearCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineElderBearCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineElderBearCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineElderBearCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineElderBearCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineElderBearCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineElderBearCrossLength(0, 13)).toBe(13);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineElderBearCrossLength('x', 13)).toBe(13);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineElderBearCrossLength(20.9, 13)).toBe(20);
  });
});

describe('applyLineElderBearCrossEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 13]) {
        const v = new Array<number>(40).fill(K);
        const out = applyLineElderBearCrossEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineElderBearCross', () => {
  it('handles null series', () => {
    expect(computeLineElderBearCross(null)).toEqual({
      bear: [],
    });
  });

  it('CONST K -> bear = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineElderBearCross(data);
      for (let i = 12; i < data.length; i += 1) {
        expect(ch.bear[i]).toBe(0);
      }
    }
  });

  it('LINEAR DOWN -> bear < 0', () => {
    const data = linearDownSeries(40);
    const ch = computeLineElderBearCross(data);
    for (let i = 14; i < data.length; i += 1) {
      const b = ch.bear[i];
      expect(b).not.toBeNull();
      expect(b!).toBeLessThan(0);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineElderBearCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineElderBearCrossRegime', () => {
  it('returns bullish when bear > 0', () => {
    expect(classifyLineElderBearCrossRegime(1)).toBe('bullish');
  });
  it('returns bearish when bear < 0', () => {
    expect(classifyLineElderBearCrossRegime(-1)).toBe('bearish');
  });
  it('returns neutral when bear == 0', () => {
    expect(classifyLineElderBearCrossRegime(0)).toBe('neutral');
  });
  it('returns none when bear is null', () => {
    expect(classifyLineElderBearCrossRegime(null)).toBe('none');
  });
});

describe('detectLineElderBearCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineElderBearCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineElderBearCrossCrosses(series, [-1, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineElderBearCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineElderBearCrossCrosses(series, [1, -1])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineElderBearCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineElderBearCrossCrosses(series, [null, 1])).toEqual([]);
  });
});

describe('runLineElderBearCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineElderBearCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineElderBearCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineElderBearCross(constSeries(40, 5));
    expect(res.length).toBe(13);
    expect(res.lowProxyLength).toBe(2);
  });

  it('accepts custom lengths', () => {
    const res = runLineElderBearCross(constSeries(40, 5), {
      length: 21,
      lowProxyLength: 3,
    });
    expect(res.length).toBe(21);
    expect(res.lowProxyLength).toBe(3);
  });

  it('sorts series by x', () => {
    const res = runLineElderBearCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineElderBearCross(constSeries(40, 7));
    for (let i = 12; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR DOWN -> regime bearish after warmup', () => {
    const res = runLineElderBearCross(linearDownSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});

describe('computeLineElderBearCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineElderBearCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.bearPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineElderBearCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineElderBearCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineElderBearCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and bear paths', () => {
    const lo = computeLineElderBearCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.bearPath).toMatch(/^M\s/);
  });
});

describe('describeLineElderBearCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineElderBearCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineElderBearCrossChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });

  it('mentions lengths', () => {
    const text = describeLineElderBearCrossChart(linearUpSeries(12), {
      length: 21,
      lowProxyLength: 3,
    });
    expect(text).toContain('21');
    expect(text).toContain('3');
  });
});

describe('<ChartLineElderBearCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineElderBearCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bear-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineElderBearCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-elder-bear-cross"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineElderBearCross ref={ref} data={linearUpSeries(40)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineElderBearCross data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-bear-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('13');
    expect(root?.dataset.lowProxyLength).toBe('2');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineElderBearCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-bear-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineElderBearCross data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-elder-bear-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders two legend items', () => {
    const { container } = render(
      <ChartLineElderBearCross data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-elder-bear-cross-legend"] button',
    );
    expect(buttons.length).toBe(2);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineElderBearCross data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="bear"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineElderBearCross
        data={linearUpSeries(40)}
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
      <ChartLineElderBearCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bear-cross-badge"]',
      )?.textContent,
    ).toContain('length 13');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineElderBearCross
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bear-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineElderBearCross
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bear-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineElderBearCross
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bear-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineElderBearCross
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-elder-bear-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineElderBearCross
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders bear path', () => {
    const { container } = render(
      <ChartLineElderBearCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bear-cross-bear-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineElderBearCross
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bear-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineElderBearCross
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bear-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides bear when defaultHiddenSeries includes bear', () => {
    const { container } = render(
      <ChartLineElderBearCross
        data={linearUpSeries(40)}
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
      <ChartLineElderBearCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-elder-bear-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Elder Bear Cross integration', () => {
  it('CONST K -> bear=0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineElderBearCross(constSeries(40, K));
      for (let i = 12; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.bear).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
