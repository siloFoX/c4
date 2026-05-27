import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSqueezeCross,
  applyLineSqueezeCrossWilder,
  classifyLineSqueezeCrossRegime,
  computeLineSqueezeCross,
  computeLineSqueezeCrossLayout,
  describeLineSqueezeCrossChart,
  detectLineSqueezeCrossCrosses,
  getLineSqueezeCrossFinitePoints,
  normalizeLineSqueezeCrossLength,
  normalizeLineSqueezeCrossMult,
  runLineSqueezeCross,
  type ChartLineSqueezeCrossPoint,
} from './chart-line-squeeze-cross';

const constSeries = (n: number, K: number): ChartLineSqueezeCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineSqueezeCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineSqueezeCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineSqueezeCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineSqueezeCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineSqueezeCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineSqueezeCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineSqueezeCrossLength', () => {
  it('returns fallback when length is below 2', () => {
    expect(normalizeLineSqueezeCrossLength(1, 20)).toBe(20);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineSqueezeCrossLength('x', 20)).toBe(20);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineSqueezeCrossLength(21.7, 20)).toBe(21);
  });
});

describe('normalizeLineSqueezeCrossMult', () => {
  it('returns fallback when value is non-positive', () => {
    expect(normalizeLineSqueezeCrossMult(0, 2)).toBe(2);
    expect(normalizeLineSqueezeCrossMult(-1, 2)).toBe(2);
  });

  it('returns fallback when value is non-number', () => {
    expect(normalizeLineSqueezeCrossMult('x', 2)).toBe(2);
  });

  it('accepts positive value', () => {
    expect(normalizeLineSqueezeCrossMult(1.5, 2)).toBe(1.5);
  });
});

describe('applyLineSqueezeCrossWilder', () => {
  it('matches the bit-exact CONST K via the short-circuit', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [2, 3, 5, 14, 20]) {
        const v = new Array<number>(30).fill(K);
        const out = applyLineSqueezeCrossWilder(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineSqueezeCross', () => {
  it('handles null series', () => {
    expect(computeLineSqueezeCross(null)).toEqual({
      momentum: [],
      squeezeOn: [],
    });
  });

  it('CONST close = K -> momentum = 0, squeezeOn = true', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const { momentum, squeezeOn } = computeLineSqueezeCross(data);
      const warmup = 20;
      for (let i = warmup; i < data.length; i += 1) {
        expect(momentum[i]).toBe(0);
        expect(squeezeOn[i]).toBe(true);
      }
    }
  });

  it('LINEAR UP step=1 -> momentum > 0, squeezeOn = false', () => {
    const data = linearSeries(40, 10, 1);
    const { momentum, squeezeOn } = computeLineSqueezeCross(data);
    const warmup = 20;
    for (let i = warmup; i < data.length; i += 1) {
      expect(momentum[i]).toBeGreaterThan(0);
      expect(squeezeOn[i]).toBe(false);
    }
  });

  it('LINEAR DOWN step=-1 -> momentum < 0, squeezeOn = false', () => {
    const data = linearSeries(40, 100, -1);
    const { momentum, squeezeOn } = computeLineSqueezeCross(data);
    const warmup = 20;
    for (let i = warmup; i < data.length; i += 1) {
      expect(momentum[i]).toBeLessThan(0);
      expect(squeezeOn[i]).toBe(false);
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(40, 5);
    const { squeezeOn } = computeLineSqueezeCross(data);
    expect(squeezeOn[30]).toBe(true);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineSqueezeCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineSqueezeCrossRegime', () => {
  it('returns on when squeezeOn = true', () => {
    expect(classifyLineSqueezeCrossRegime(true, null)).toBe('on');
  });
  it('returns last release kind when squeezeOn = false', () => {
    expect(classifyLineSqueezeCrossRegime(false, 'bullish')).toBe('bullish');
    expect(classifyLineSqueezeCrossRegime(false, 'bearish')).toBe('bearish');
  });
  it('returns on when squeezeOn = false but no release yet', () => {
    expect(classifyLineSqueezeCrossRegime(false, null)).toBe('on');
  });
  it('returns none when squeezeOn is null', () => {
    expect(classifyLineSqueezeCrossRegime(null, null)).toBe('none');
  });
});

describe('detectLineSqueezeCrossCrosses', () => {
  it('flags bullish release on transition true -> false with positive momentum', () => {
    const series: ChartLineSqueezeCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const squeezeOn = [true, false, false];
    const momentum = [0, 1, 1];
    expect(
      detectLineSqueezeCrossCrosses(series, squeezeOn, momentum),
    ).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('flags bearish release on transition true -> false with negative momentum', () => {
    const series: ChartLineSqueezeCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const squeezeOn = [true, false, false];
    const momentum = [0, -1, -1];
    expect(
      detectLineSqueezeCrossCrosses(series, squeezeOn, momentum),
    ).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('skips transitions with zero momentum', () => {
    const series: ChartLineSqueezeCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineSqueezeCrossCrosses(series, [true, false], [0, 0]),
    ).toEqual([]);
  });
});

describe('runLineSqueezeCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineSqueezeCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineSqueezeCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths and multipliers', () => {
    const res = runLineSqueezeCross(constSeries(40, 5));
    expect(res.length).toBe(20);
    expect(res.bbMult).toBe(2);
    expect(res.kcMult).toBe(1.5);
  });

  it('accepts custom length / bbMult / kcMult', () => {
    const res = runLineSqueezeCross(constSeries(40, 5), {
      length: 14,
      bbMult: 2.5,
      kcMult: 2,
    });
    expect(res.length).toBe(14);
    expect(res.bbMult).toBe(2.5);
    expect(res.kcMult).toBe(2);
  });

  it('sorts series by x', () => {
    const res = runLineSqueezeCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime on after warmup, 0 crosses', () => {
    const res = runLineSqueezeCross(constSeries(40, 7));
    for (let i = 20; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('on');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime on (no prior release), 0 crosses', () => {
    const res = runLineSqueezeCross(linearSeries(40, 10, 1));
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR DOWN -> 0 crosses', () => {
    const res = runLineSqueezeCross(linearSeries(40, 100, -1));
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineSqueezeCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineSqueezeCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.momentumPath).toBe('');
    expect(lo.squeezeMarkers).toEqual([]);
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineSqueezeCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineSqueezeCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineSqueezeCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and momentum paths', () => {
    const lo = computeLineSqueezeCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.momentumPath).toMatch(/^M\s/);
  });
});

describe('describeLineSqueezeCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineSqueezeCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineSqueezeCrossChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions length / bbMult / kcMult', () => {
    const text = describeLineSqueezeCrossChart(linearSeries(12, 1, 1), {
      length: 14,
      bbMult: 2.5,
      kcMult: 2,
    });
    expect(text).toContain('14');
    expect(text).toContain('2.5');
  });
});

describe('<ChartLineSqueezeCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineSqueezeCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineSqueezeCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-cross"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineSqueezeCross ref={ref} data={linearSeries(40, 100, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / bbMult / kcMult / total points', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        length={20}
        bbMult={2}
        kcMult={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-squeeze-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('20');
    expect(root?.dataset.bbMult).toBe('2');
    expect(root?.dataset.kcMult).toBe('1.5');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineSqueezeCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-squeeze-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineSqueezeCross data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-squeeze-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineSqueezeCross data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-squeeze-cross-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineSqueezeCross data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="momentum"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        hiddenSeries={['momentum']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="momentum"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'momentum',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        length={20}
        bbMult={2}
        kcMult={1.5}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-badge"]',
      )?.textContent,
    ).toContain('length 20');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-squeeze-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders momentum path', () => {
    const { container } = render(
      <ChartLineSqueezeCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-momentum-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineSqueezeCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders squeeze markers when squeeze is on', () => {
    const { container } = render(
      <ChartLineSqueezeCross data={constSeries(40, 100)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-squeeze-markers"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides momentum when defaultHiddenSeries includes momentum', () => {
    const { container } = render(
      <ChartLineSqueezeCross
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['momentum']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="momentum"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Squeeze Cross integration', () => {
  it('three anchors all yield 0 crosses: CONST squeeze stays on, LINEAR UP/DOWN squeeze stays off', () => {
    for (const K of [1, 5, 17, 100, 1234]) {
      const res = runLineSqueezeCross(constSeries(40, K));
      for (let i = 20; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.momentum).toBe(0);
        expect(res.samples[i]?.squeezeOn).toBe(true);
      }
      expect(res.crosses.length).toBe(0);
    }

    for (const start of [10, 100, 1000]) {
      const res = runLineSqueezeCross(linearSeries(40, start, 1));
      for (let i = 20; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.squeezeOn).toBe(false);
      }
      expect(res.crosses.length).toBe(0);
    }

    for (const start of [100, 500, 2000]) {
      const res = runLineSqueezeCross(linearSeries(40, start, -1));
      for (let i = 20; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.squeezeOn).toBe(false);
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
