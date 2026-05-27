import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineBalancePowerCross,
  applyLineBalancePowerCrossSma,
  classifyLineBalancePowerCrossRegime,
  computeLineBalancePowerCross,
  computeLineBalancePowerCrossLayout,
  describeLineBalancePowerCrossChart,
  detectLineBalancePowerCrossCrosses,
  getLineBalancePowerCrossFinitePoints,
  normalizeLineBalancePowerCrossLength,
  runLineBalancePowerCross,
  type ChartLineBalancePowerCrossPoint,
} from './chart-line-balance-power-cross';

const constSeries = (n: number, K: number): ChartLineBalancePowerCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineBalancePowerCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const linearDownSeries = (n: number): ChartLineBalancePowerCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineBalancePowerCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineBalancePowerCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineBalancePowerCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineBalancePowerCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineBalancePowerCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineBalancePowerCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineBalancePowerCrossLength(0, 5)).toBe(5);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineBalancePowerCrossLength('x', 5)).toBe(5);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineBalancePowerCrossLength(7.7, 5)).toBe(7);
  });
});

describe('applyLineBalancePowerCrossSma', () => {
  it('CONST short-circuit yields bit-exact constant', () => {
    for (const K of [-0.5, 0, 0.5, 1]) {
      for (const n of [1, 3, 5]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineBalancePowerCrossSma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineBalancePowerCross', () => {
  it('handles null series', () => {
    expect(computeLineBalancePowerCross(null)).toEqual({
      raw: [],
      bop: [],
    });
  });

  it('CONST K -> raw = 0, bop = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineBalancePowerCross(data);
      for (let i = 1; i < data.length; i += 1) {
        expect(ch.raw[i]).toBe(0);
      }
      for (let i = 7; i < data.length; i += 1) {
        expect(ch.bop[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP -> bop = 0.25 (constant slope / window range)', () => {
    const data = linearUpSeries(40);
    const ch = computeLineBalancePowerCross(data);
    for (let i = 7; i < data.length; i += 1) {
      expect(ch.bop[i]).toBe(0.25);
    }
  });

  it('LINEAR DOWN -> bop = -0.25', () => {
    const data = linearDownSeries(40);
    const ch = computeLineBalancePowerCross(data);
    for (let i = 7; i < data.length; i += 1) {
      expect(ch.bop[i]).toBe(-0.25);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineBalancePowerCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineBalancePowerCrossRegime', () => {
  it('returns bullish when bop > 0', () => {
    expect(classifyLineBalancePowerCrossRegime(0.5)).toBe('bullish');
  });
  it('returns bearish when bop < 0', () => {
    expect(classifyLineBalancePowerCrossRegime(-0.5)).toBe('bearish');
  });
  it('returns neutral when bop == 0', () => {
    expect(classifyLineBalancePowerCrossRegime(0)).toBe('neutral');
  });
  it('returns none when bop is null', () => {
    expect(classifyLineBalancePowerCrossRegime(null)).toBe('none');
  });
});

describe('detectLineBalancePowerCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineBalancePowerCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineBalancePowerCrossCrosses(series, [-0.5, 0.5])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineBalancePowerCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineBalancePowerCrossCrosses(series, [0.5, -0.5])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineBalancePowerCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineBalancePowerCrossCrosses(series, [null, 0.5])).toEqual(
      [],
    );
  });
});

describe('runLineBalancePowerCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineBalancePowerCross(constSeries(5, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineBalancePowerCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineBalancePowerCross(constSeries(40, 5));
    expect(res.barLength).toBe(5);
    expect(res.smoothLength).toBe(3);
  });

  it('accepts custom lengths', () => {
    const res = runLineBalancePowerCross(constSeries(40, 5), {
      barLength: 10,
      smoothLength: 5,
    });
    expect(res.barLength).toBe(10);
    expect(res.smoothLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineBalancePowerCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineBalancePowerCross(constSeries(40, 7));
    for (let i = 7; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineBalancePowerCross(linearUpSeries(40));
    for (let i = 7; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });

  it('LINEAR DOWN -> regime bearish after warmup', () => {
    const res = runLineBalancePowerCross(linearDownSeries(40));
    for (let i = 7; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});

describe('computeLineBalancePowerCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineBalancePowerCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.bopPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineBalancePowerCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineBalancePowerCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineBalancePowerCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and bop paths', () => {
    const lo = computeLineBalancePowerCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.bopPath).toMatch(/^M\s/);
  });
});

describe('describeLineBalancePowerCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineBalancePowerCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineBalancePowerCrossChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });

  it('mentions all lengths', () => {
    const text = describeLineBalancePowerCrossChart(linearUpSeries(12), {
      barLength: 10,
      smoothLength: 5,
    });
    expect(text).toContain('10');
    expect(text).toContain('5');
  });
});

describe('<ChartLineBalancePowerCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineBalancePowerCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineBalancePowerCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineBalancePowerCross ref={ref} data={linearUpSeries(40)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineBalancePowerCross data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-balance-power-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.barLength).toBe('5');
    expect(root?.dataset.smoothLength).toBe('3');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineBalancePowerCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-balance-power-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineBalancePowerCross data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-balance-power-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders two legend items', () => {
    const { container } = render(
      <ChartLineBalancePowerCross data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-balance-power-cross-legend"] button',
    );
    expect(buttons.length).toBe(2);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineBalancePowerCross data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="bop"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineBalancePowerCross
        data={linearUpSeries(40)}
        hiddenSeries={['bop']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="bop"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'bop',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineBalancePowerCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross-badge"]',
      )?.textContent,
    ).toContain('bar 5');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineBalancePowerCross
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineBalancePowerCross
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineBalancePowerCross
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineBalancePowerCross
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-balance-power-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineBalancePowerCross
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders bop path', () => {
    const { container } = render(
      <ChartLineBalancePowerCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross-bop-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineBalancePowerCross
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineBalancePowerCross
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides bop when defaultHiddenSeries includes bop', () => {
    const { container } = render(
      <ChartLineBalancePowerCross
        data={linearUpSeries(40)}
        defaultHiddenSeries={['bop']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="bop"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zero line', () => {
    const { container } = render(
      <ChartLineBalancePowerCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-balance-power-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Balance of Power Cross integration', () => {
  it('CONST K -> bop=0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineBalancePowerCross(constSeries(40, K));
      for (let i = 7; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.bop).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });

  it('LINEAR UP -> bop = 0.25 bit-exact, regime bullish', () => {
    const res = runLineBalancePowerCross(linearUpSeries(40));
    for (let i = 7; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.bop).toBe(0.25);
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });

  it('LINEAR DOWN -> bop = -0.25 bit-exact, regime bearish', () => {
    const res = runLineBalancePowerCross(linearDownSeries(40));
    for (let i = 7; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.bop).toBe(-0.25);
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});
