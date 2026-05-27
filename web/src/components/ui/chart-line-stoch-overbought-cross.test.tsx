import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStochOverboughtCross,
  applyLineStochOverboughtCrossSma,
  classifyLineStochOverboughtCrossRegime,
  computeLineStochOverboughtCross,
  computeLineStochOverboughtCrossLayout,
  describeLineStochOverboughtCrossChart,
  detectLineStochOverboughtCrossCrosses,
  getLineStochOverboughtCrossFinitePoints,
  normalizeLineStochOverboughtCrossLength,
  normalizeLineStochOverboughtCrossThreshold,
  runLineStochOverboughtCross,
  type ChartLineStochOverboughtCrossPoint,
} from './chart-line-stoch-overbought-cross';

const constSeries = (
  n: number,
  K: number,
): ChartLineStochOverboughtCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineStochOverboughtCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i + 1 }));

const linearDownSeries = (n: number): ChartLineStochOverboughtCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineStochOverboughtCrossFinitePoints', () => {
  it('returns empty for null', () => {
    expect(getLineStochOverboughtCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineStochOverboughtCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineStochOverboughtCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineStochOverboughtCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineStochOverboughtCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineStochOverboughtCrossLength(0, 14)).toBe(14);
  });
  it('returns fallback when length is non-number', () => {
    expect(normalizeLineStochOverboughtCrossLength('x', 14)).toBe(14);
  });
  it('returns floored length when acceptable', () => {
    expect(normalizeLineStochOverboughtCrossLength(20.9, 14)).toBe(20);
  });
});

describe('normalizeLineStochOverboughtCrossThreshold', () => {
  it('accepts value in [0, 100]', () => {
    expect(normalizeLineStochOverboughtCrossThreshold(80, 80)).toBe(80);
    expect(normalizeLineStochOverboughtCrossThreshold(0, 80)).toBe(0);
    expect(normalizeLineStochOverboughtCrossThreshold(100, 80)).toBe(100);
  });
  it('returns fallback for out-of-range', () => {
    expect(normalizeLineStochOverboughtCrossThreshold(-1, 80)).toBe(80);
    expect(normalizeLineStochOverboughtCrossThreshold(101, 80)).toBe(80);
  });
});

describe('applyLineStochOverboughtCrossSma', () => {
  it('CONST short-circuit yields bit-exact constant', () => {
    for (const K of [0, 50, 100]) {
      for (const n of [1, 3, 5]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineStochOverboughtCrossSma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineStochOverboughtCross', () => {
  it('handles null series', () => {
    expect(computeLineStochOverboughtCross(null)).toEqual({ k: [] });
  });

  it('CONST K -> k = 50 (neutral fallback)', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineStochOverboughtCross(data);
      for (let i = 15; i < data.length; i += 1) {
        expect(ch.k[i]).toBe(50);
      }
    }
  });

  it('LINEAR UP -> k = 100 (close at top of range)', () => {
    const data = linearUpSeries(40);
    const ch = computeLineStochOverboughtCross(data);
    for (let i = 15; i < data.length; i += 1) {
      expect(ch.k[i]).toBe(100);
    }
  });

  it('LINEAR DOWN -> k = 0 (close at bottom of range)', () => {
    const data = linearDownSeries(40);
    const ch = computeLineStochOverboughtCross(data);
    for (let i = 15; i < data.length; i += 1) {
      expect(ch.k[i]).toBe(0);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineStochOverboughtCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineStochOverboughtCrossRegime', () => {
  it('returns bullish when k >= threshold', () => {
    expect(classifyLineStochOverboughtCrossRegime(90, 80)).toBe('bullish');
    expect(classifyLineStochOverboughtCrossRegime(80, 80)).toBe('bullish');
  });
  it('returns neutral when k < threshold', () => {
    expect(classifyLineStochOverboughtCrossRegime(50, 80)).toBe('neutral');
  });
  it('returns none when k is null', () => {
    expect(classifyLineStochOverboughtCrossRegime(null, 80)).toBe('none');
  });
});

describe('detectLineStochOverboughtCrossCrosses', () => {
  it('flags bullish entry (crosses up above threshold)', () => {
    const series: ChartLineStochOverboughtCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineStochOverboughtCrossCrosses(series, [75, 85], 80),
    ).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('flags bearish exit (crosses down below threshold)', () => {
    const series: ChartLineStochOverboughtCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineStochOverboughtCrossCrosses(series, [85, 75], 80),
    ).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineStochOverboughtCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineStochOverboughtCrossCrosses(series, [null, 85], 80),
    ).toEqual([]);
  });

  it('no cross when k stays below threshold', () => {
    const series: ChartLineStochOverboughtCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineStochOverboughtCrossCrosses(series, [50, 60], 80),
    ).toEqual([]);
  });
});

describe('runLineStochOverboughtCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineStochOverboughtCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineStochOverboughtCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects defaults', () => {
    const res = runLineStochOverboughtCross(constSeries(40, 5));
    expect(res.length).toBe(14);
    expect(res.kSmoothing).toBe(3);
    expect(res.threshold).toBe(80);
  });

  it('accepts custom thresholds', () => {
    const res = runLineStochOverboughtCross(constSeries(40, 5), {
      length: 21,
      kSmoothing: 5,
      threshold: 85,
    });
    expect(res.length).toBe(21);
    expect(res.kSmoothing).toBe(5);
    expect(res.threshold).toBe(85);
  });

  it('sorts series by x', () => {
    const res = runLineStochOverboughtCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineStochOverboughtCross(constSeries(40, 7));
    for (let i = 15; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.entryCount).toBe(0);
    expect(res.exitCount).toBe(0);
  });

  it('LINEAR UP -> regime bullish (k=100 >= 80)', () => {
    const res = runLineStochOverboughtCross(linearUpSeries(40));
    for (let i = 15; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });

  it('LINEAR DOWN -> regime neutral (k=0 < 80)', () => {
    const res = runLineStochOverboughtCross(linearDownSeries(40));
    for (let i = 15; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
  });
});

describe('computeLineStochOverboughtCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineStochOverboughtCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.kPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineStochOverboughtCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineStochOverboughtCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc scale is fixed to 0-100', () => {
    const lo = computeLineStochOverboughtCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.oscMin).toBe(0);
    expect(lo.oscMax).toBe(100);
  });

  it('threshold above mid in screen y', () => {
    const lo = computeLineStochOverboughtCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.thresholdY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.thresholdY).toBeLessThanOrEqual(lo.oscBottom);
    expect(lo.thresholdY).toBeLessThan(lo.midY);
  });

  it('renders price and k paths', () => {
    const lo = computeLineStochOverboughtCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.kPath).toMatch(/^M\s/);
  });
});

describe('describeLineStochOverboughtCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineStochOverboughtCrossChart([])).toBe('No data');
  });
  it('mentions the bar count', () => {
    const text = describeLineStochOverboughtCrossChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });
  it('mentions threshold', () => {
    const text = describeLineStochOverboughtCrossChart(linearUpSeries(12), {
      length: 21,
      kSmoothing: 5,
      threshold: 85,
    });
    expect(text).toContain('21');
    expect(text).toContain('5');
    expect(text).toContain('85');
  });
});

describe('<ChartLineStochOverboughtCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineStochOverboughtCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineStochOverboughtCross ref={ref} data={linearUpSeries(40)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and threshold as data attributes', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-overbought-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.kSmoothing).toBe('3');
    expect(root?.dataset.threshold).toBe('80');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-overbought-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-overbought-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders two legend items', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-stoch-overbought-cross-legend"] button',
    );
    expect(buttons.length).toBe(2);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="k"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        hiddenSeries={['k']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="k"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'k',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross-badge"]',
      )?.textContent,
    ).toContain('threshold 80');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides bands when showBands=false', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-overbought-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders k path', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross-k-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-overbought-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides k when defaultHiddenSeries includes k', () => {
    const { container } = render(
      <ChartLineStochOverboughtCross
        data={linearUpSeries(40)}
        defaultHiddenSeries={['k']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="k"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Stochastic Overbought Cross integration', () => {
  it('CONST K -> k=50 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineStochOverboughtCross(constSeries(40, K));
      for (let i = 15; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.k).toBe(50);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });

  it('LINEAR UP -> k=100 bit-exact, regime bullish', () => {
    const res = runLineStochOverboughtCross(linearUpSeries(40));
    for (let i = 15; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.k).toBe(100);
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });
});
