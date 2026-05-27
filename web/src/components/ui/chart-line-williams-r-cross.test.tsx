import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineWilliamsRCross,
  applyLineWilliamsRCrossEma,
  classifyLineWilliamsRCrossRegime,
  computeLineWilliamsRCross,
  computeLineWilliamsRCrossLayout,
  describeLineWilliamsRCrossChart,
  detectLineWilliamsRCrossCrosses,
  getLineWilliamsRCrossFinitePoints,
  normalizeLineWilliamsRCrossLength,
  runLineWilliamsRCross,
  type ChartLineWilliamsRCrossPoint,
} from './chart-line-williams-r-cross';

const constSeries = (n: number, K: number): ChartLineWilliamsRCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineWilliamsRCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const linearDownSeries = (n: number): ChartLineWilliamsRCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineWilliamsRCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineWilliamsRCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineWilliamsRCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineWilliamsRCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineWilliamsRCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineWilliamsRCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineWilliamsRCrossLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineWilliamsRCrossLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineWilliamsRCrossLength(20.9, 14)).toBe(20);
  });
});

describe('applyLineWilliamsRCrossEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [-100, -50, 0]) {
      for (const n of [3, 5]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineWilliamsRCrossEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineWilliamsRCross', () => {
  it('handles null series', () => {
    expect(computeLineWilliamsRCross(null)).toEqual({
      wr: [],
      signal: [],
    });
  });

  it('CONST K -> wr = -50, signal = -50', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineWilliamsRCross(data);
      for (let i = 15; i < data.length; i += 1) {
        expect(ch.wr[i]).toBe(-50);
        expect(ch.signal[i]).toBe(-50);
      }
    }
  });

  it('LINEAR UP -> wr = 0 (highest == close)', () => {
    const data = linearUpSeries(40);
    const ch = computeLineWilliamsRCross(data);
    for (let i = 13; i < data.length; i += 1) {
      expect(ch.wr[i]).toBe(0);
    }
  });

  it('LINEAR DOWN -> wr = -100 (lowest == close)', () => {
    const data = linearDownSeries(40);
    const ch = computeLineWilliamsRCross(data);
    for (let i = 13; i < data.length; i += 1) {
      expect(ch.wr[i]).toBe(-100);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineWilliamsRCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineWilliamsRCrossRegime', () => {
  it('returns bullish when wr > signal', () => {
    expect(classifyLineWilliamsRCrossRegime(-30, -50)).toBe('bullish');
  });
  it('returns bearish when wr < signal', () => {
    expect(classifyLineWilliamsRCrossRegime(-70, -50)).toBe('bearish');
  });
  it('returns neutral when wr == signal', () => {
    expect(classifyLineWilliamsRCrossRegime(-50, -50)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineWilliamsRCrossRegime(null, -50)).toBe('none');
    expect(classifyLineWilliamsRCrossRegime(-50, null)).toBe('none');
  });
});

describe('detectLineWilliamsRCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineWilliamsRCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineWilliamsRCrossCrosses(series, [-70, -30], [-50, -50]),
    ).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineWilliamsRCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineWilliamsRCrossCrosses(series, [-30, -70], [-50, -50]),
    ).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineWilliamsRCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineWilliamsRCrossCrosses(series, [null, -30], [null, -50]),
    ).toEqual([]);
  });
});

describe('runLineWilliamsRCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineWilliamsRCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineWilliamsRCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineWilliamsRCross(constSeries(40, 5));
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(3);
  });

  it('accepts custom lengths', () => {
    const res = runLineWilliamsRCross(constSeries(40, 5), {
      length: 21,
      signalLength: 5,
    });
    expect(res.length).toBe(21);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineWilliamsRCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineWilliamsRCross(constSeries(40, 7));
    for (let i = 15; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime neutral (wr == signal == 0)', () => {
    const res = runLineWilliamsRCross(linearUpSeries(40));
    for (let i = 16; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
  });
});

describe('computeLineWilliamsRCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineWilliamsRCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.wrPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineWilliamsRCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineWilliamsRCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc scale is fixed to -100..0', () => {
    const lo = computeLineWilliamsRCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.oscMin).toBe(-100);
    expect(lo.oscMax).toBe(0);
  });

  it('renders price, wr, signal paths', () => {
    const lo = computeLineWilliamsRCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.wrPath).toMatch(/^M\s/);
  });
});

describe('describeLineWilliamsRCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineWilliamsRCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineWilliamsRCrossChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });

  it('mentions lengths', () => {
    const text = describeLineWilliamsRCrossChart(linearUpSeries(12), {
      length: 21,
      signalLength: 5,
    });
    expect(text).toContain('21');
    expect(text).toContain('5');
  });
});

describe('<ChartLineWilliamsRCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineWilliamsRCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineWilliamsRCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-williams-r-cross"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineWilliamsRCross ref={ref} data={linearUpSeries(40)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths / total points as data attributes', () => {
    const { container } = render(
      <ChartLineWilliamsRCross data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-r-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.signalLength).toBe('3');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineWilliamsRCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-r-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineWilliamsRCross data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-williams-r-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineWilliamsRCross data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-williams-r-cross-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineWilliamsRCross data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="wr"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        hiddenSeries={['signal']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'signal',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineWilliamsRCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides bands when showBands=false', () => {
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-williams-r-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders wr and signal paths', () => {
    const { container } = render(
      <ChartLineWilliamsRCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-wr-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-williams-r-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineWilliamsRCross
        data={linearUpSeries(40)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Williams %R Cross integration', () => {
  it('CONST K -> wr=signal=-50 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineWilliamsRCross(constSeries(40, K));
      for (let i = 15; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.wr).toBe(-50);
        expect(res.samples[i]?.signal).toBe(-50);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });

  it('LINEAR UP -> wr = 0 bit-exact', () => {
    const res = runLineWilliamsRCross(linearUpSeries(40));
    for (let i = 13; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.wr).toBe(0);
    }
  });

  it('LINEAR DOWN -> wr = -100 bit-exact', () => {
    const res = runLineWilliamsRCross(linearDownSeries(40));
    for (let i = 13; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.wr).toBe(-100);
    }
  });
});
