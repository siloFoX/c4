import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVolumeOscCross,
  applyLineVolumeOscCrossEma,
  classifyLineVolumeOscCrossRegime,
  computeLineVolumeOscCross,
  computeLineVolumeOscCrossLayout,
  describeLineVolumeOscCrossChart,
  detectLineVolumeOscCrossCrosses,
  getLineVolumeOscCrossFinitePoints,
  normalizeLineVolumeOscCrossLength,
  runLineVolumeOscCross,
  type ChartLineVolumeOscCrossPoint,
} from './chart-line-volume-osc-cross';

const constSeries = (n: number, K: number): ChartLineVolumeOscCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineVolumeOscCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i + 1 }));

const linearDownSeries = (n: number): ChartLineVolumeOscCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineVolumeOscCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineVolumeOscCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineVolumeOscCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineVolumeOscCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineVolumeOscCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineVolumeOscCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineVolumeOscCrossLength(0, 5)).toBe(5);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineVolumeOscCrossLength('x', 5)).toBe(5);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineVolumeOscCrossLength(7.7, 5)).toBe(7);
  });
});

describe('applyLineVolumeOscCrossEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 10]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineVolumeOscCrossEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineVolumeOscCross', () => {
  it('handles null series', () => {
    expect(computeLineVolumeOscCross(null)).toEqual({
      volOsc: [],
    });
  });

  it('CONST K > 0 -> volOsc = 0', () => {
    for (const K of [1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineVolumeOscCross(data);
      for (let i = 9; i < data.length; i += 1) {
        expect(ch.volOsc[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 -> volOsc = 0 via divide-by-zero guard', () => {
    const data = constSeries(40, 0);
    const ch = computeLineVolumeOscCross(data);
    for (let i = 9; i < data.length; i += 1) {
      expect(ch.volOsc[i]).toBe(0);
    }
  });

  it('LINEAR UP -> volOsc > 0 (short outruns long)', () => {
    const data = linearUpSeries(40);
    const ch = computeLineVolumeOscCross(data);
    for (let i = 14; i < data.length; i += 1) {
      const v = ch.volOsc[i];
      expect(v).not.toBeNull();
      expect(v!).toBeGreaterThan(0);
    }
  });

  it('LINEAR DOWN -> volOsc < 0', () => {
    const data = linearDownSeries(40);
    const ch = computeLineVolumeOscCross(data);
    for (let i = 14; i < data.length; i += 1) {
      const v = ch.volOsc[i];
      expect(v).not.toBeNull();
      expect(v!).toBeLessThan(0);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineVolumeOscCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineVolumeOscCrossRegime', () => {
  it('returns bullish when volOsc > 0', () => {
    expect(classifyLineVolumeOscCrossRegime(1)).toBe('bullish');
  });
  it('returns bearish when volOsc < 0', () => {
    expect(classifyLineVolumeOscCrossRegime(-1)).toBe('bearish');
  });
  it('returns neutral when volOsc == 0', () => {
    expect(classifyLineVolumeOscCrossRegime(0)).toBe('neutral');
  });
  it('returns none when volOsc is null', () => {
    expect(classifyLineVolumeOscCrossRegime(null)).toBe('none');
  });
});

describe('detectLineVolumeOscCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineVolumeOscCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineVolumeOscCrossCrosses(series, [-1, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineVolumeOscCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineVolumeOscCrossCrosses(series, [1, -1])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineVolumeOscCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineVolumeOscCrossCrosses(series, [null, 1])).toEqual([]);
  });
});

describe('runLineVolumeOscCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineVolumeOscCross(constSeries(8, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineVolumeOscCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineVolumeOscCross(constSeries(40, 5));
    expect(res.shortLength).toBe(5);
    expect(res.longLength).toBe(10);
  });

  it('accepts custom lengths', () => {
    const res = runLineVolumeOscCross(constSeries(40, 5), {
      shortLength: 7,
      longLength: 14,
    });
    expect(res.shortLength).toBe(7);
    expect(res.longLength).toBe(14);
  });

  it('sorts series by x', () => {
    const res = runLineVolumeOscCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineVolumeOscCross(constSeries(40, 7));
    for (let i = 9; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineVolumeOscCross(linearUpSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });

  it('LINEAR DOWN -> regime bearish after warmup', () => {
    const res = runLineVolumeOscCross(linearDownSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});

describe('computeLineVolumeOscCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineVolumeOscCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.volOscPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineVolumeOscCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineVolumeOscCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineVolumeOscCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and volOsc paths', () => {
    const lo = computeLineVolumeOscCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.volOscPath).toMatch(/^M\s/);
  });
});

describe('describeLineVolumeOscCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineVolumeOscCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineVolumeOscCrossChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });

  it('mentions all lengths', () => {
    const text = describeLineVolumeOscCrossChart(linearUpSeries(12), {
      shortLength: 7,
      longLength: 14,
    });
    expect(text).toContain('7');
    expect(text).toContain('14');
  });
});

describe('<ChartLineVolumeOscCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineVolumeOscCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineVolumeOscCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-volume-osc-cross"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVolumeOscCross ref={ref} data={linearUpSeries(40)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths / total points as data attributes', () => {
    const { container } = render(
      <ChartLineVolumeOscCross data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-osc-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.shortLength).toBe('5');
    expect(root?.dataset.longLength).toBe('10');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineVolumeOscCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-osc-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineVolumeOscCross data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-volume-osc-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders two legend items', () => {
    const { container } = render(
      <ChartLineVolumeOscCross data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-volume-osc-cross-legend"] button',
    );
    expect(buttons.length).toBe(2);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineVolumeOscCross data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="volOsc"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVolumeOscCross
        data={linearUpSeries(40)}
        hiddenSeries={['volOsc']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="volOsc"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'volOsc',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineVolumeOscCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-badge"]',
      )?.textContent,
    ).toContain('short 5');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCross
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCross
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCross
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineVolumeOscCross
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-osc-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCross
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders volOsc path', () => {
    const { container } = render(
      <ChartLineVolumeOscCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-vol-osc-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCross
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCross
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides volOsc when defaultHiddenSeries includes volOsc', () => {
    const { container } = render(
      <ChartLineVolumeOscCross
        data={linearUpSeries(40)}
        defaultHiddenSeries={['volOsc']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="volOsc"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zero line', () => {
    const { container } = render(
      <ChartLineVolumeOscCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Volume Oscillator Cross integration', () => {
  it('CONST K -> volOsc = 0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineVolumeOscCross(constSeries(40, K));
      for (let i = 9; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.volOsc).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
