import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAdxDiCross,
  applyLineAdxDiCrossWilder,
  classifyLineAdxDiCrossRegime,
  computeLineAdxDiCross,
  computeLineAdxDiCrossLayout,
  describeLineAdxDiCrossChart,
  detectLineAdxDiCrossCrosses,
  getLineAdxDiCrossFinitePoints,
  normalizeLineAdxDiCrossLength,
  runLineAdxDiCross,
  type ChartLineAdxDiCrossPoint,
} from './chart-line-adx-di-cross';

const constSeries = (n: number, K: number): ChartLineAdxDiCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineAdxDiCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const linearDownSeries = (n: number): ChartLineAdxDiCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineAdxDiCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineAdxDiCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineAdxDiCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineAdxDiCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineAdxDiCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineAdxDiCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineAdxDiCrossLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineAdxDiCrossLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineAdxDiCrossLength(20.9, 14)).toBe(20);
  });
});

describe('applyLineAdxDiCrossWilder', () => {
  it('matches the bit-exact CONST K via the short-circuit', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [3, 5, 14]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineAdxDiCrossWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineAdxDiCross', () => {
  it('handles null series', () => {
    expect(computeLineAdxDiCross(null)).toEqual({
      plusDI: [],
      minusDI: [],
    });
  });

  it('CONST close = K -> +DI = -DI = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineAdxDiCross(data);
      for (let i = 14; i < data.length; i += 1) {
        expect(ch.plusDI[i]).toBe(0);
        expect(ch.minusDI[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP -> +DI = 100, -DI = 0', () => {
    const data = linearUpSeries(40);
    const ch = computeLineAdxDiCross(data);
    for (let i = 14; i < data.length; i += 1) {
      expect(ch.plusDI[i]).toBe(100);
      expect(ch.minusDI[i]).toBe(0);
    }
  });

  it('LINEAR DOWN -> +DI = 0, -DI = 100', () => {
    const data = linearDownSeries(40);
    const ch = computeLineAdxDiCross(data);
    for (let i = 14; i < data.length; i += 1) {
      expect(ch.plusDI[i]).toBe(0);
      expect(ch.minusDI[i]).toBe(100);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineAdxDiCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineAdxDiCrossRegime', () => {
  it('returns bullish when +DI > -DI', () => {
    expect(classifyLineAdxDiCrossRegime(30, 10)).toBe('bullish');
  });
  it('returns bearish when +DI < -DI', () => {
    expect(classifyLineAdxDiCrossRegime(10, 30)).toBe('bearish');
  });
  it('returns neutral when +DI == -DI', () => {
    expect(classifyLineAdxDiCrossRegime(20, 20)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineAdxDiCrossRegime(null, 20)).toBe('none');
    expect(classifyLineAdxDiCrossRegime(20, null)).toBe('none');
  });
});

describe('detectLineAdxDiCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineAdxDiCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const plus = [10, 30];
    const minus = [20, 20];
    expect(detectLineAdxDiCrossCrosses(series, plus, minus)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineAdxDiCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const plus = [30, 10];
    const minus = [20, 20];
    expect(detectLineAdxDiCrossCrosses(series, plus, minus)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineAdxDiCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineAdxDiCrossCrosses(series, [null, 30], [null, 20]),
    ).toEqual([]);
  });
});

describe('runLineAdxDiCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineAdxDiCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineAdxDiCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length', () => {
    const res = runLineAdxDiCross(constSeries(40, 5));
    expect(res.length).toBe(14);
  });

  it('accepts custom length', () => {
    const res = runLineAdxDiCross(constSeries(40, 5), { length: 21 });
    expect(res.length).toBe(21);
  });

  it('sorts series by x', () => {
    const res = runLineAdxDiCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineAdxDiCross(constSeries(40, 7));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineAdxDiCross(linearUpSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });

  it('LINEAR DOWN -> regime bearish after warmup', () => {
    const res = runLineAdxDiCross(linearDownSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});

describe('computeLineAdxDiCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineAdxDiCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.plusPath).toBe('');
    expect(lo.minusPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineAdxDiCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineAdxDiCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc scale is fixed to 0-100', () => {
    const lo = computeLineAdxDiCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.oscMin).toBe(0);
    expect(lo.oscMax).toBe(100);
  });

  it('renders price, plus, and minus paths', () => {
    const lo = computeLineAdxDiCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.plusPath).toMatch(/^M\s/);
    expect(lo.minusPath).toMatch(/^M\s/);
  });
});

describe('describeLineAdxDiCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineAdxDiCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineAdxDiCrossChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });

  it('mentions the length', () => {
    const text = describeLineAdxDiCrossChart(linearUpSeries(12), {
      length: 21,
    });
    expect(text).toContain('21');
  });
});

describe('<ChartLineAdxDiCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineAdxDiCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-di-cross"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAdxDiCross ref={ref} data={linearUpSeries(40)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length and total points as data attributes', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-di-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-di-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-adx-di-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-adx-di-cross-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="plus"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAdxDiCross
        data={linearUpSeries(40)}
        hiddenSeries={['minus']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="minus"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'minus',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAdxDiCross
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineAdxDiCross
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-di-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} animate={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders plus and minus DI paths', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-plus-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-minus-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineAdxDiCross
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineAdxDiCross
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides minus when defaultHiddenSeries includes minus', () => {
    const { container } = render(
      <ChartLineAdxDiCross
        data={linearUpSeries(40)}
        defaultHiddenSeries={['minus']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="minus"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the mid line', () => {
    const { container } = render(
      <ChartLineAdxDiCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-cross-mid-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('ADX DI Cross integration', () => {
  it('CONST K -> +DI = -DI = 0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineAdxDiCross(constSeries(40, K));
      for (let i = 14; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.plusDI).toBe(0);
        expect(res.samples[i]?.minusDI).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });

  it('LINEAR UP -> +DI = 100, -DI = 0 bit-exact, regime bullish', () => {
    const res = runLineAdxDiCross(linearUpSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.plusDI).toBe(100);
      expect(res.samples[i]?.minusDI).toBe(0);
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });

  it('LINEAR DOWN -> +DI = 0, -DI = 100 bit-exact, regime bearish', () => {
    const res = runLineAdxDiCross(linearDownSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.plusDI).toBe(0);
      expect(res.samples[i]?.minusDI).toBe(100);
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});
