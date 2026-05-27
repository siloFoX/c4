import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineKeltnerCrossSig,
  applyLineKeltnerCrossSigEma,
  applyLineKeltnerCrossSigWilder,
  classifyLineKeltnerCrossSigRegime,
  computeLineKeltnerCrossSig,
  computeLineKeltnerCrossSigLayout,
  describeLineKeltnerCrossSigChart,
  detectLineKeltnerCrossSigCrosses,
  getLineKeltnerCrossSigFinitePoints,
  normalizeLineKeltnerCrossSigLength,
  normalizeLineKeltnerCrossSigMult,
  runLineKeltnerCrossSig,
  type ChartLineKeltnerCrossSigPoint,
} from './chart-line-keltner-cross-sig';

const constSeries = (n: number, K: number): ChartLineKeltnerCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineKeltnerCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineKeltnerCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineKeltnerCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineKeltnerCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineKeltnerCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineKeltnerCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineKeltnerCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineKeltnerCrossSigLength(0, 20)).toBe(20);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineKeltnerCrossSigLength('x', 20)).toBe(20);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineKeltnerCrossSigLength(15.7, 20)).toBe(15);
  });
});

describe('normalizeLineKeltnerCrossSigMult', () => {
  it('accepts non-negative value', () => {
    expect(normalizeLineKeltnerCrossSigMult(2, 2)).toBe(2);
    expect(normalizeLineKeltnerCrossSigMult(0, 2)).toBe(0);
  });

  it('returns fallback for negative value', () => {
    expect(normalizeLineKeltnerCrossSigMult(-1, 2)).toBe(2);
  });
});

describe('applyLineKeltnerCrossSigWilder', () => {
  it('matches CONST K via short-circuit', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [3, 5, 10]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineKeltnerCrossSigWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('applyLineKeltnerCrossSigEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 10, 20]) {
        const v = new Array<number>(40).fill(K);
        const out = applyLineKeltnerCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineKeltnerCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineKeltnerCrossSig(null)).toEqual({
      mid: [],
      upper: [],
      lower: [],
      diff: [],
    });
  });

  it('CONST close = K -> mid = upper = lower = K, diff = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineKeltnerCrossSig(data);
      for (let i = 19; i < data.length; i += 1) {
        expect(ch.mid[i]).toBe(K);
        expect(ch.upper[i]).toBe(K);
        expect(ch.lower[i]).toBe(K);
        expect(ch.diff[i]).toBe(0);
      }
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineKeltnerCrossSig(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('LINEAR UP -> diff > 0 (price above mid EMA)', () => {
    const data = linearSeries(40, 0, 1);
    const ch = computeLineKeltnerCrossSig(data);
    for (let i = 19; i < data.length; i += 1) {
      const d = ch.diff[i];
      expect(d).not.toBeNull();
      expect(d!).toBeGreaterThan(0);
    }
  });
});

describe('classifyLineKeltnerCrossSigRegime', () => {
  it('returns bullish when diff > 0', () => {
    expect(classifyLineKeltnerCrossSigRegime(1)).toBe('bullish');
  });
  it('returns bearish when diff < 0', () => {
    expect(classifyLineKeltnerCrossSigRegime(-1)).toBe('bearish');
  });
  it('returns neutral when diff == 0', () => {
    expect(classifyLineKeltnerCrossSigRegime(0)).toBe('neutral');
  });
  it('returns none when diff is null', () => {
    expect(classifyLineKeltnerCrossSigRegime(null)).toBe('none');
  });
});

describe('detectLineKeltnerCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineKeltnerCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineKeltnerCrossSigCrosses(series, [-1, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineKeltnerCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineKeltnerCrossSigCrosses(series, [1, -1])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineKeltnerCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineKeltnerCrossSigCrosses(series, [null, 1])).toEqual([]);
  });
});

describe('runLineKeltnerCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineKeltnerCrossSig(constSeries(15, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineKeltnerCrossSig(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths and mult', () => {
    const res = runLineKeltnerCrossSig(constSeries(40, 5));
    expect(res.length).toBe(20);
    expect(res.atrLength).toBe(10);
    expect(res.mult).toBe(2);
  });

  it('accepts custom lengths and mult', () => {
    const res = runLineKeltnerCrossSig(constSeries(40, 5), {
      length: 14,
      atrLength: 7,
      mult: 1.5,
    });
    expect(res.length).toBe(14);
    expect(res.atrLength).toBe(7);
    expect(res.mult).toBe(1.5);
  });

  it('sorts series by x', () => {
    const res = runLineKeltnerCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineKeltnerCrossSig(constSeries(40, 7));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineKeltnerCrossSig(linearSeries(40, 0, 1));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });
});

describe('computeLineKeltnerCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineKeltnerCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.midPath).toBe('');
    expect(lo.diffPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineKeltnerCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineKeltnerCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineKeltnerCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price, mid, upper, lower, diff paths', () => {
    const lo = computeLineKeltnerCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.midPath).toMatch(/^M\s/);
    expect(lo.upperPath).toMatch(/^M\s/);
    expect(lo.lowerPath).toMatch(/^M\s/);
    expect(lo.diffPath).toMatch(/^M\s/);
  });
});

describe('describeLineKeltnerCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineKeltnerCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineKeltnerCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions all lengths and mult', () => {
    const text = describeLineKeltnerCrossSigChart(linearSeries(12, 1, 1), {
      length: 14,
      atrLength: 7,
      mult: 1.5,
    });
    expect(text).toContain('14');
    expect(text).toContain('7');
    expect(text).toContain('1.5');
  });
});

describe('<ChartLineKeltnerCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineKeltnerCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineKeltnerCrossSig
        ref={ref}
        data={linearSeries(40, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('20');
    expect(root?.dataset.atrLength).toBe('10');
    expect(root?.dataset.mult).toBe('2');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-keltner-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-keltner-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(4);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig data={linearSeries(40, 100, 1)} />,
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
      <ChartLineKeltnerCrossSig
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
      <ChartLineKeltnerCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 20');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig
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
      <ChartLineKeltnerCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-mid-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-upper-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-lower-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-diff-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides upper when defaultHiddenSeries includes upper', () => {
    const { container } = render(
      <ChartLineKeltnerCrossSig
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
      <ChartLineKeltnerCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Keltner Cross Signal integration', () => {
  it('CONST K -> diff = 0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineKeltnerCrossSig(constSeries(40, K));
      for (let i = 19; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.mid).toBe(K);
        expect(res.samples[i]?.upper).toBe(K);
        expect(res.samples[i]?.lower).toBe(K);
        expect(res.samples[i]?.diff).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
