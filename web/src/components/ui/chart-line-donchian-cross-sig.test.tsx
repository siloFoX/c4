import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDonchianCrossSig,
  classifyLineDonchianCrossSigRegime,
  computeLineDonchianCrossSig,
  computeLineDonchianCrossSigLayout,
  describeLineDonchianCrossSigChart,
  detectLineDonchianCrossSigCrosses,
  getLineDonchianCrossSigFinitePoints,
  normalizeLineDonchianCrossSigLength,
  runLineDonchianCrossSig,
  type ChartLineDonchianCrossSigPoint,
} from './chart-line-donchian-cross-sig';

const constSeries = (n: number, K: number): ChartLineDonchianCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineDonchianCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineDonchianCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineDonchianCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineDonchianCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineDonchianCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineDonchianCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineDonchianCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineDonchianCrossSigLength(0, 20)).toBe(20);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineDonchianCrossSigLength('x', 20)).toBe(20);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineDonchianCrossSigLength(15.7, 20)).toBe(15);
  });
});

describe('computeLineDonchianCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineDonchianCrossSig(null)).toEqual({
      upper: [],
      lower: [],
      mid: [],
      diff: [],
    });
  });

  it('CONST K -> upper = lower = mid = K, diff = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineDonchianCrossSig(data);
      for (let i = 19; i < data.length; i += 1) {
        expect(ch.upper[i]).toBe(K);
        expect(ch.lower[i]).toBe(K);
        expect(ch.mid[i]).toBe(K);
        expect(ch.diff[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP -> upper = close, lower = close - (n-1)', () => {
    const data = linearSeries(40, 0, 1);
    const ch = computeLineDonchianCrossSig(data);
    for (let i = 19; i < data.length; i += 1) {
      expect(ch.upper[i]).toBe(i);
      expect(ch.lower[i]).toBe(i - 19);
      expect(ch.mid[i]).toBe(i - 9.5);
      expect(ch.diff[i]).toBe(9.5);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineDonchianCrossSig(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineDonchianCrossSigRegime', () => {
  it('returns bullish when diff > 0', () => {
    expect(classifyLineDonchianCrossSigRegime(1)).toBe('bullish');
  });
  it('returns bearish when diff < 0', () => {
    expect(classifyLineDonchianCrossSigRegime(-1)).toBe('bearish');
  });
  it('returns neutral when diff == 0', () => {
    expect(classifyLineDonchianCrossSigRegime(0)).toBe('neutral');
  });
  it('returns none when diff is null', () => {
    expect(classifyLineDonchianCrossSigRegime(null)).toBe('none');
  });
});

describe('detectLineDonchianCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineDonchianCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineDonchianCrossSigCrosses(series, [-1, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineDonchianCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineDonchianCrossSigCrosses(series, [1, -1])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineDonchianCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineDonchianCrossSigCrosses(series, [null, 1])).toEqual([]);
  });
});

describe('runLineDonchianCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineDonchianCrossSig(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineDonchianCrossSig(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length', () => {
    const res = runLineDonchianCrossSig(constSeries(40, 5));
    expect(res.length).toBe(20);
  });

  it('accepts custom length', () => {
    const res = runLineDonchianCrossSig(constSeries(40, 5), { length: 14 });
    expect(res.length).toBe(14);
  });

  it('sorts series by x', () => {
    const res = runLineDonchianCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineDonchianCrossSig(constSeries(40, 7));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineDonchianCrossSig(linearSeries(40, 0, 1));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });
});

describe('computeLineDonchianCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineDonchianCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.midPath).toBe('');
    expect(lo.diffPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineDonchianCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineDonchianCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineDonchianCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price, mid, upper, lower, diff paths', () => {
    const lo = computeLineDonchianCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.midPath).toMatch(/^M\s/);
    expect(lo.upperPath).toMatch(/^M\s/);
    expect(lo.lowerPath).toMatch(/^M\s/);
    expect(lo.diffPath).toMatch(/^M\s/);
  });
});

describe('describeLineDonchianCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineDonchianCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineDonchianCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions the length', () => {
    const text = describeLineDonchianCrossSigChart(linearSeries(12, 1, 1), {
      length: 14,
    });
    expect(text).toContain('14');
  });
});

describe('<ChartLineDonchianCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineDonchianCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineDonchianCrossSig
        ref={ref}
        data={linearSeries(40, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / total points as data attributes', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('20');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-donchian-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-donchian-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(4);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="middle"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDonchianCrossSig
        data={linearSeries(40, 100, 1)}
        hiddenSeries={['upper']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="upper"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'upper',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 20');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders mid, upper, lower, diff paths', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-mid-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-upper-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-lower-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-diff-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides upper when defaultHiddenSeries includes upper', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['upper']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="upper"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zero line', () => {
    const { container } = render(
      <ChartLineDonchianCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Donchian Cross Signal integration', () => {
  it('CONST K -> diff = 0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineDonchianCrossSig(constSeries(40, K));
      for (let i = 19; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.upper).toBe(K);
        expect(res.samples[i]?.lower).toBe(K);
        expect(res.samples[i]?.mid).toBe(K);
        expect(res.samples[i]?.diff).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });

  it('LINEAR UP -> diff = 9.5 bit-exact (half the window width), regime bullish', () => {
    const res = runLineDonchianCrossSig(linearSeries(40, 0, 1));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.diff).toBe(9.5);
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });
});
