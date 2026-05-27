import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineBbCrossSig,
  classifyLineBbCrossSigRegime,
  computeLineBbCrossSig,
  computeLineBbCrossSigLayout,
  describeLineBbCrossSigChart,
  detectLineBbCrossSigCrosses,
  getLineBbCrossSigFinitePoints,
  normalizeLineBbCrossSigLength,
  normalizeLineBbCrossSigMult,
  runLineBbCrossSig,
  type ChartLineBbCrossSigPoint,
} from './chart-line-bb-cross-sig';

const constSeries = (n: number, K: number): ChartLineBbCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineBbCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineBbCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineBbCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineBbCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineBbCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineBbCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineBbCrossSigLength', () => {
  it('returns fallback when length is below 2', () => {
    expect(normalizeLineBbCrossSigLength(1, 20)).toBe(20);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineBbCrossSigLength('x', 20)).toBe(20);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineBbCrossSigLength(15.7, 20)).toBe(15);
  });
});

describe('normalizeLineBbCrossSigMult', () => {
  it('accepts non-negative value', () => {
    expect(normalizeLineBbCrossSigMult(2, 2)).toBe(2);
    expect(normalizeLineBbCrossSigMult(0, 2)).toBe(0);
  });

  it('returns fallback for negative value', () => {
    expect(normalizeLineBbCrossSigMult(-1, 2)).toBe(2);
  });

  it('returns fallback for non-number', () => {
    expect(normalizeLineBbCrossSigMult('x', 2)).toBe(2);
  });
});

describe('computeLineBbCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineBbCrossSig(null)).toEqual({
      mid: [],
      upper: [],
      lower: [],
      diff: [],
    });
  });

  it('CONST close = K -> mid = upper = lower = K, diff = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineBbCrossSig(data);
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
    computeLineBbCrossSig(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('LINEAR UP series produces diff > 0 (price above mid)', () => {
    const data = linearSeries(40, 0, 1);
    const ch = computeLineBbCrossSig(data);
    for (let i = 19; i < data.length; i += 1) {
      const d = ch.diff[i];
      expect(d).not.toBeNull();
      expect(d!).toBeGreaterThan(0);
    }
  });
});

describe('classifyLineBbCrossSigRegime', () => {
  it('returns bullish when diff > 0', () => {
    expect(classifyLineBbCrossSigRegime(1)).toBe('bullish');
  });
  it('returns bearish when diff < 0', () => {
    expect(classifyLineBbCrossSigRegime(-1)).toBe('bearish');
  });
  it('returns neutral when diff == 0', () => {
    expect(classifyLineBbCrossSigRegime(0)).toBe('neutral');
  });
  it('returns none when diff is null', () => {
    expect(classifyLineBbCrossSigRegime(null)).toBe('none');
  });
});

describe('detectLineBbCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineBbCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineBbCrossSigCrosses(series, [-1, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineBbCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineBbCrossSigCrosses(series, [1, -1])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('flags zero-to-positive cross', () => {
    const series: ChartLineBbCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineBbCrossSigCrosses(series, [0, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineBbCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineBbCrossSigCrosses(series, [null, 1])).toEqual([]);
  });
});

describe('runLineBbCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineBbCrossSig(constSeries(15, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineBbCrossSig(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length and mult', () => {
    const res = runLineBbCrossSig(constSeries(40, 5));
    expect(res.length).toBe(20);
    expect(res.mult).toBe(2);
  });

  it('accepts custom length and mult', () => {
    const res = runLineBbCrossSig(constSeries(40, 5), {
      length: 10,
      mult: 1.5,
    });
    expect(res.length).toBe(10);
    expect(res.mult).toBe(1.5);
  });

  it('sorts series by x', () => {
    const res = runLineBbCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineBbCrossSig(constSeries(40, 7));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineBbCrossSig(linearSeries(40, 0, 1));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });
});

describe('computeLineBbCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineBbCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.midPath).toBe('');
    expect(lo.diffPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineBbCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineBbCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineBbCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price, mid, upper, lower, diff paths', () => {
    const lo = computeLineBbCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.midPath).toMatch(/^M\s/);
    expect(lo.upperPath).toMatch(/^M\s/);
    expect(lo.lowerPath).toMatch(/^M\s/);
    expect(lo.diffPath).toMatch(/^M\s/);
  });
});

describe('describeLineBbCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineBbCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineBbCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions length and mult', () => {
    const text = describeLineBbCrossSigChart(linearSeries(12, 1, 1), {
      length: 10,
      mult: 1.5,
    });
    expect(text).toContain('10');
    expect(text).toContain('1.5');
  });
});

describe('<ChartLineBbCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineBbCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineBbCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bb-cross-sig"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineBbCrossSig
        ref={ref}
        data={linearSeries(40, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / mult / total points as data attributes', () => {
    const { container } = render(
      <ChartLineBbCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('20');
    expect(root?.dataset.mult).toBe('2');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineBbCrossSig data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineBbCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-bb-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineBbCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-bb-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(4);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineBbCrossSig data={linearSeries(40, 100, 1)} />,
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
      <ChartLineBbCrossSig
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
      <ChartLineBbCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 20');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineBbCrossSig
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineBbCrossSig
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineBbCrossSig
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineBbCrossSig
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineBbCrossSig
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
      <ChartLineBbCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-mid-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-upper-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-lower-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-diff-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineBbCrossSig
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineBbCrossSig
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides upper when defaultHiddenSeries includes upper', () => {
    const { container } = render(
      <ChartLineBbCrossSig
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
      <ChartLineBbCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Bollinger Bands Cross Signal integration', () => {
  it('CONST K -> diff = 0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineBbCrossSig(constSeries(40, K));
      for (let i = 19; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.diff).toBe(0);
        expect(res.samples[i]?.mid).toBe(K);
        expect(res.samples[i]?.upper).toBe(K);
        expect(res.samples[i]?.lower).toBe(K);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
