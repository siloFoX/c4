import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMfiCrossSig,
  applyLineMfiCrossSigEma,
  classifyLineMfiCrossSigRegime,
  computeLineMfiCrossSig,
  computeLineMfiCrossSigLayout,
  describeLineMfiCrossSigChart,
  detectLineMfiCrossSigCrosses,
  getLineMfiCrossSigFinitePoints,
  normalizeLineMfiCrossSigLength,
  runLineMfiCrossSig,
  type ChartLineMfiCrossSigPoint,
} from './chart-line-mfi-cross-sig';

const constSeries = (n: number, K: number): ChartLineMfiCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineMfiCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i + 1 }));

const linearDownSeries = (n: number): ChartLineMfiCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineMfiCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineMfiCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineMfiCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineMfiCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineMfiCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineMfiCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineMfiCrossSigLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineMfiCrossSigLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineMfiCrossSigLength(20.9, 14)).toBe(20);
  });
});

describe('applyLineMfiCrossSigEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [0, 50, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineMfiCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineMfiCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineMfiCrossSig(null)).toEqual({
      mfi: [],
      signal: [],
    });
  });

  it('CONST K -> mfi = 50, signal = 50', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineMfiCrossSig(data);
      const warmup = 14 + 9 - 1;
      for (let i = warmup; i < data.length; i += 1) {
        expect(ch.mfi[i]).toBe(50);
        expect(ch.signal[i]).toBe(50);
      }
    }
  });

  it('LINEAR UP -> mfi = 100, signal -> 100', () => {
    const data = linearUpSeries(50);
    const ch = computeLineMfiCrossSig(data);
    for (let i = 14; i < data.length; i += 1) {
      expect(ch.mfi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN -> mfi = 0, signal -> 0', () => {
    const data = linearDownSeries(50);
    const ch = computeLineMfiCrossSig(data);
    for (let i = 14; i < data.length; i += 1) {
      expect(ch.mfi[i]).toBe(0);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineMfiCrossSig(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineMfiCrossSigRegime', () => {
  it('returns bullish when mfi > signal', () => {
    expect(classifyLineMfiCrossSigRegime(60, 40)).toBe('bullish');
  });
  it('returns bearish when mfi < signal', () => {
    expect(classifyLineMfiCrossSigRegime(40, 60)).toBe('bearish');
  });
  it('returns neutral when mfi == signal', () => {
    expect(classifyLineMfiCrossSigRegime(50, 50)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineMfiCrossSigRegime(null, 50)).toBe('none');
    expect(classifyLineMfiCrossSigRegime(50, null)).toBe('none');
  });
});

describe('detectLineMfiCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineMfiCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineMfiCrossSigCrosses(series, [40, 60], [50, 50])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineMfiCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineMfiCrossSigCrosses(series, [60, 40], [50, 50])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineMfiCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineMfiCrossSigCrosses(series, [null, 60], [null, 40]),
    ).toEqual([]);
  });
});

describe('runLineMfiCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineMfiCrossSig(constSeries(15, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineMfiCrossSig(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineMfiCrossSig(constSeries(40, 5));
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineMfiCrossSig(constSeries(40, 5), {
      length: 21,
      signalLength: 5,
    });
    expect(res.length).toBe(21);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineMfiCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineMfiCrossSig(constSeries(40, 7));
    const warmup = 14 + 9 - 1;
    for (let i = warmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineMfiCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineMfiCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.mfiPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineMfiCrossSigLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineMfiCrossSigLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc scale is fixed to 0-100', () => {
    const lo = computeLineMfiCrossSigLayout({
      data: linearUpSeries(40),
    });
    expect(lo.oscMin).toBe(0);
    expect(lo.oscMax).toBe(100);
  });

  it('renders price, mfi, signal paths', () => {
    const lo = computeLineMfiCrossSigLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.mfiPath).toMatch(/^M\s/);
  });
});

describe('describeLineMfiCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineMfiCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineMfiCrossSigChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });

  it('mentions lengths', () => {
    const text = describeLineMfiCrossSigChart(linearUpSeries(12), {
      length: 21,
      signalLength: 5,
    });
    expect(text).toContain('21');
    expect(text).toContain('5');
  });
});

describe('<ChartLineMfiCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineMfiCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineMfiCrossSig data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mfi-cross-sig"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMfiCrossSig ref={ref} data={linearUpSeries(40)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths / total points as data attributes', () => {
    const { container } = render(
      <ChartLineMfiCrossSig data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mfi-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineMfiCrossSig data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mfi-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineMfiCrossSig data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-mfi-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineMfiCrossSig data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-mfi-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineMfiCrossSig data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="mfi"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMfiCrossSig
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
      <ChartLineMfiCrossSig data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineMfiCrossSig
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineMfiCrossSig
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides bands when showBands=false', () => {
    const { container } = render(
      <ChartLineMfiCrossSig
        data={linearUpSeries(40)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-bands"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineMfiCrossSig
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineMfiCrossSig
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mfi-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineMfiCrossSig
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders mfi and signal paths', () => {
    const { container } = render(
      <ChartLineMfiCrossSig data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-mfi-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineMfiCrossSig
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineMfiCrossSig
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mfi-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineMfiCrossSig
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

describe('MFI Cross Signal integration', () => {
  it('CONST K -> mfi = 50, signal = 50 bit-exact, regime neutral, 0 crosses', () => {
    const warmup = 14 + 9 - 1;
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineMfiCrossSig(constSeries(40, K));
      for (let i = warmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.mfi).toBe(50);
        expect(res.samples[i]?.signal).toBe(50);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
