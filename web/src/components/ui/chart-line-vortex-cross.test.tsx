import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVortexCross,
  classifyLineVortexCrossRegime,
  computeLineVortexCross,
  computeLineVortexCrossLayout,
  describeLineVortexCrossChart,
  detectLineVortexCrossCrosses,
  getLineVortexCrossFinitePoints,
  normalizeLineVortexCrossLength,
  runLineVortexCross,
  type ChartLineVortexCrossPoint,
} from './chart-line-vortex-cross';

const constSeries = (n: number, K: number): ChartLineVortexCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineVortexCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineVortexCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineVortexCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineVortexCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineVortexCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineVortexCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineVortexCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineVortexCrossLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineVortexCrossLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineVortexCrossLength(21.7, 14)).toBe(21);
  });
});

describe('computeLineVortexCross', () => {
  it('handles null series', () => {
    expect(computeLineVortexCross(null)).toEqual({ plus: [], minus: [] });
  });

  it('CONST close = K -> VI+ = VI- = 0.5 (no movement)', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const { plus, minus } = computeLineVortexCross(data, { length: 14 });
      for (let i = 14; i < data.length; i += 1) {
        expect(plus[i]).toBe(0.5);
        expect(minus[i]).toBe(0.5);
      }
    }
  });

  it('LINEAR UP step=1 -> VI+ = 1, VI- = 0', () => {
    const data = linearSeries(40, 10, 1);
    const { plus, minus } = computeLineVortexCross(data, { length: 14 });
    for (let i = 14; i < data.length; i += 1) {
      expect(plus[i]).toBe(1);
      expect(minus[i]).toBe(0);
    }
  });

  it('LINEAR DOWN step=-1 -> VI+ = 0, VI- = 1', () => {
    const data = linearSeries(40, 100, -1);
    const { plus, minus } = computeLineVortexCross(data, { length: 14 });
    for (let i = 14; i < data.length; i += 1) {
      expect(plus[i]).toBe(0);
      expect(minus[i]).toBe(1);
    }
  });

  it('falls back to default length', () => {
    const data = constSeries(40, 5);
    const { plus } = computeLineVortexCross(data);
    expect(plus[20]).toBe(0.5);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineVortexCross(data, { length: 14 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineVortexCrossRegime', () => {
  it('returns bullish when VI+ > VI-', () => {
    expect(classifyLineVortexCrossRegime(0.6, 0.4)).toBe('bullish');
  });
  it('returns bearish when VI+ < VI-', () => {
    expect(classifyLineVortexCrossRegime(0.4, 0.6)).toBe('bearish');
  });
  it('returns neutral when VI+ == VI-', () => {
    expect(classifyLineVortexCrossRegime(0.5, 0.5)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineVortexCrossRegime(null, 0.5)).toBe('none');
    expect(classifyLineVortexCrossRegime(0.5, null)).toBe('none');
  });
});

describe('detectLineVortexCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineVortexCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const plus = [0.4, 0.6, 0.6];
    const minus = [0.5, 0.5, 0.5];
    expect(detectLineVortexCrossCrosses(series, plus, minus)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineVortexCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const plus = [0.6, 0.4, 0.4];
    const minus = [0.5, 0.5, 0.5];
    expect(detectLineVortexCrossCrosses(series, plus, minus)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null VI', () => {
    const series: ChartLineVortexCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineVortexCrossCrosses(series, [null, 0.6], [null, 0.5]),
    ).toEqual([]);
  });
});

describe('runLineVortexCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineVortexCross(constSeries(5, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineVortexCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length', () => {
    const res = runLineVortexCross(constSeries(40, 5));
    expect(res.length).toBe(14);
  });

  it('accepts custom length', () => {
    const res = runLineVortexCross(constSeries(40, 5), { length: 21 });
    expect(res.length).toBe(21);
  });

  it('sorts series by x', () => {
    const res = runLineVortexCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral, 0 crosses', () => {
    const res = runLineVortexCross(constSeries(40, 7));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup, 0 crosses', () => {
    const res = runLineVortexCross(linearSeries(40, 10, 1));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
    expect(res.crosses.length).toBe(0);
  });

  it('LINEAR DOWN -> regime bearish after warmup, 0 crosses', () => {
    const res = runLineVortexCross(linearSeries(40, 100, -1));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineVortexCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineVortexCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.plusPath).toBe('');
    expect(lo.minusPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineVortexCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineVortexCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc axis fixed to [0, 1] with midY between top and bottom', () => {
    const lo = computeLineVortexCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.oscMin).toBe(0);
    expect(lo.oscMax).toBe(1);
    expect(lo.midY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.midY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and plus paths', () => {
    const lo = computeLineVortexCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.plusPath).toMatch(/^M\s/);
  });
});

describe('describeLineVortexCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineVortexCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineVortexCrossChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions the length', () => {
    const text = describeLineVortexCrossChart(linearSeries(12, 1, 1), {
      length: 21,
    });
    expect(text).toContain('21');
  });
});

describe('<ChartLineVortexCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineVortexCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineVortexCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vortex-cross"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineVortexCross ref={ref} data={linearSeries(40, 100, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / total points', () => {
    const { container } = render(
      <ChartLineVortexCross data={linearSeries(40, 100, 1)} length={14} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vortex-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineVortexCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vortex-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineVortexCross data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vortex-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineVortexCross data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-vortex-cross-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineVortexCross data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="plus"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        hiddenSeries={['plus']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="plus"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'plus',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge with length', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        length={14}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides midline when showMidLine=false', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        showMidLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-midline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vortex-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders plus and minus paths', () => {
    const { container } = render(
      <ChartLineVortexCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-plus-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-minus-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineVortexCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vortex-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides plus when defaultHiddenSeries includes plus', () => {
    const { container } = render(
      <ChartLineVortexCross
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['plus']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="plus"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Vortex Cross integration', () => {
  it('three regime anchors yield 0 crosses each: CONST neutral, LINEAR UP bullish, LINEAR DOWN bearish', () => {
    // CONST
    for (const K of [1, 5, 17, 100, 1234]) {
      const res = runLineVortexCross(constSeries(40, K), { length: 14 });
      for (let i = 14; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.viPlus).toBe(0.5);
        expect(res.samples[i]?.viMinus).toBe(0.5);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }

    // LINEAR UP
    for (const start of [10, 100, 1000]) {
      const res = runLineVortexCross(linearSeries(40, start, 1), {
        length: 14,
      });
      for (let i = 14; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.viPlus).toBe(1);
        expect(res.samples[i]?.viMinus).toBe(0);
        expect(res.samples[i]?.regime).toBe('bullish');
      }
      expect(res.crosses.length).toBe(0);
    }

    // LINEAR DOWN
    for (const start of [100, 500, 2000]) {
      const res = runLineVortexCross(linearSeries(40, start, -1), {
        length: 14,
      });
      for (let i = 14; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.viPlus).toBe(0);
        expect(res.samples[i]?.viMinus).toBe(1);
        expect(res.samples[i]?.regime).toBe('bearish');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
