import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineKeltnerCrossPct,
  applyLineKeltnerCrossPctEma,
  applyLineKeltnerCrossPctWilder,
  classifyLineKeltnerCrossPctRegime,
  computeLineKeltnerCrossPct,
  computeLineKeltnerCrossPctLayout,
  describeLineKeltnerCrossPctChart,
  detectLineKeltnerCrossPctCrosses,
  getLineKeltnerCrossPctFinitePoints,
  normalizeLineKeltnerCrossPctLength,
  normalizeLineKeltnerCrossPctMult,
  runLineKeltnerCrossPct,
  type ChartLineKeltnerCrossPctPoint,
} from './chart-line-keltner-cross-pct';

const constSeries = (n: number, K: number): ChartLineKeltnerCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineKeltnerCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineKeltnerCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineKeltnerCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineKeltnerCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineKeltnerCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineKeltnerCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineKeltnerCrossPctLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineKeltnerCrossPctLength(0, 20)).toBe(20);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineKeltnerCrossPctLength('x', 20)).toBe(20);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineKeltnerCrossPctLength(15.7, 20)).toBe(15);
  });
});

describe('normalizeLineKeltnerCrossPctMult', () => {
  it('accepts non-negative value', () => {
    expect(normalizeLineKeltnerCrossPctMult(2, 2)).toBe(2);
    expect(normalizeLineKeltnerCrossPctMult(0, 2)).toBe(0);
  });

  it('returns fallback for negative value', () => {
    expect(normalizeLineKeltnerCrossPctMult(-1, 2)).toBe(2);
  });
});

describe('applyLineKeltnerCrossPctWilder', () => {
  it('matches CONST K via short-circuit', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [3, 5, 10]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineKeltnerCrossPctWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('applyLineKeltnerCrossPctEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 10, 20]) {
        const v = new Array<number>(40).fill(K);
        const out = applyLineKeltnerCrossPctEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineKeltnerCrossPct', () => {
  it('handles null series', () => {
    expect(computeLineKeltnerCrossPct(null)).toEqual({
      mid: [],
      upper: [],
      lower: [],
      pct: [],
      bandPct: [],
    });
  });

  it('CONST K > 0 -> mid=upper=lower=K, pct=0, bandPct=0', () => {
    for (const K of [1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineKeltnerCrossPct(data);
      for (let i = 19; i < data.length; i += 1) {
        expect(ch.mid[i]).toBe(K);
        expect(ch.upper[i]).toBe(K);
        expect(ch.lower[i]).toBe(K);
        expect(ch.pct[i]).toBe(0);
        expect(ch.bandPct[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 -> pct = 0 via divide-by-zero guard', () => {
    const data = constSeries(40, 0);
    const ch = computeLineKeltnerCrossPct(data);
    for (let i = 19; i < data.length; i += 1) {
      expect(ch.pct[i]).toBe(0);
      expect(ch.bandPct[i]).toBe(0);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineKeltnerCrossPct(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('LINEAR UP -> pct > 0 (price above mid)', () => {
    const data = linearSeries(40, 1, 1);
    const ch = computeLineKeltnerCrossPct(data);
    for (let i = 19; i < data.length; i += 1) {
      const p = ch.pct[i];
      expect(p).not.toBeNull();
      expect(p!).toBeGreaterThan(0);
    }
  });
});

describe('classifyLineKeltnerCrossPctRegime', () => {
  it('returns bullish when pct > 0', () => {
    expect(classifyLineKeltnerCrossPctRegime(1)).toBe('bullish');
  });
  it('returns bearish when pct < 0', () => {
    expect(classifyLineKeltnerCrossPctRegime(-1)).toBe('bearish');
  });
  it('returns neutral when pct == 0', () => {
    expect(classifyLineKeltnerCrossPctRegime(0)).toBe('neutral');
  });
  it('returns none when pct is null', () => {
    expect(classifyLineKeltnerCrossPctRegime(null)).toBe('none');
  });
});

describe('detectLineKeltnerCrossPctCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineKeltnerCrossPctPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineKeltnerCrossPctCrosses(series, [-1, 1])).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineKeltnerCrossPctPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineKeltnerCrossPctCrosses(series, [1, -1])).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineKeltnerCrossPctPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineKeltnerCrossPctCrosses(series, [null, 1])).toEqual([]);
  });
});

describe('runLineKeltnerCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLineKeltnerCrossPct(constSeries(15, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineKeltnerCrossPct(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths and mult', () => {
    const res = runLineKeltnerCrossPct(constSeries(40, 5));
    expect(res.length).toBe(20);
    expect(res.atrLength).toBe(10);
    expect(res.mult).toBe(2);
  });

  it('accepts custom lengths and mult', () => {
    const res = runLineKeltnerCrossPct(constSeries(40, 5), {
      length: 14,
      atrLength: 7,
      mult: 1.5,
    });
    expect(res.length).toBe(14);
    expect(res.atrLength).toBe(7);
    expect(res.mult).toBe(1.5);
  });

  it('sorts series by x', () => {
    const res = runLineKeltnerCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineKeltnerCrossPct(constSeries(40, 7));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineKeltnerCrossPct(linearSeries(40, 1, 1));
    for (let i = 19; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });
});

describe('computeLineKeltnerCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineKeltnerCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.pctPath).toBe('');
    expect(lo.bandPctPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineKeltnerCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineKeltnerCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineKeltnerCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders all 5 paths', () => {
    const lo = computeLineKeltnerCrossPctLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.midPath).toMatch(/^M\s/);
    expect(lo.upperPath).toMatch(/^M\s/);
    expect(lo.lowerPath).toMatch(/^M\s/);
    expect(lo.pctPath).toMatch(/^M\s/);
    expect(lo.bandPctPath).toMatch(/^M\s/);
  });
});

describe('describeLineKeltnerCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineKeltnerCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineKeltnerCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions all lengths and mult', () => {
    const text = describeLineKeltnerCrossPctChart(linearSeries(12, 1, 1), {
      length: 14,
      atrLength: 7,
      mult: 1.5,
    });
    expect(text).toContain('14');
    expect(text).toContain('7');
    expect(text).toContain('1.5');
  });
});

describe('<ChartLineKeltnerCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineKeltnerCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineKeltnerCrossPct
        ref={ref}
        data={linearSeries(40, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('20');
    expect(root?.dataset.atrLength).toBe('10');
    expect(root?.dataset.mult).toBe('2');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-cross-pct"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-keltner-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders six legend items', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-keltner-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(6);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineKeltnerCrossPct
        data={linearSeries(40, 100, 1)}
        hiddenSeries={['band']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="band"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'band',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-badge"]',
      )?.textContent,
    ).toContain('length 20');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-keltner-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders pct and band paths', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-pct-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-band-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides band when defaultHiddenSeries includes band', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['band']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="band"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zero line', () => {
    const { container } = render(
      <ChartLineKeltnerCrossPct data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-keltner-cross-pct-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Keltner Cross Percent integration', () => {
  it('CONST K -> pct=0, bandPct=0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineKeltnerCrossPct(constSeries(40, K));
      for (let i = 19; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.pct).toBe(0);
        expect(res.samples[i]?.bandPct).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
