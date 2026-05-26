import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStochSlow,
  applyLineStochSlowRollingMax,
  applyLineStochSlowRollingMin,
  applyLineStochSlowSma,
  classifyLineStochSlowZone,
  computeLineStochSlow,
  computeLineStochSlowLayout,
  describeLineStochSlowChart,
  detectLineStochSlowCrosses,
  getLineStochSlowFinitePoints,
  normalizeLineStochSlowLength,
  normalizeLineStochSlowSmoothLength,
  normalizeLineStochSlowThreshold,
  runLineStochSlow,
  DEFAULT_CHART_LINE_STOCH_SLOW_LENGTH,
} from './chart-line-stoch-slow';
import type { ChartLineStochSlowPoint } from './chart-line-stoch-slow';

const constBar = (
  count: number,
  K: number,
): ChartLineStochSlowPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineStochSlowPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineStochSlowPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

describe('getLineStochSlowFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineStochSlowFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const result = getLineStochSlowFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineStochSlowFinitePoints([
      null as unknown as ChartLineStochSlowPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineStochSlowLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineStochSlowLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineStochSlowLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineStochSlowSmoothLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineStochSlowSmoothLength(undefined, 3)).toBe(3);
  });

  it('accepts 1', () => {
    expect(normalizeLineStochSlowSmoothLength(1, 3)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineStochSlowSmoothLength(0, 3)).toBe(3);
  });
});

describe('normalizeLineStochSlowThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineStochSlowThreshold(undefined, 80)).toBe(80);
  });

  it('accepts 0 and 100', () => {
    expect(normalizeLineStochSlowThreshold(0, 80)).toBe(0);
    expect(normalizeLineStochSlowThreshold(100, 80)).toBe(100);
  });

  it('rejects out of range', () => {
    expect(normalizeLineStochSlowThreshold(-1, 80)).toBe(80);
    expect(normalizeLineStochSlowThreshold(101, 80)).toBe(80);
  });
});

describe('applyLineStochSlowRollingMax', () => {
  it('CONST K max is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineStochSlowRollingMax(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('applyLineStochSlowRollingMin', () => {
  it('CONST K min is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineStochSlowRollingMin(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('applyLineStochSlowSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 100]) {
      const out = applyLineStochSlowSma(Array(10).fill(K), 3);
      for (let i = 2; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('null short-circuit', () => {
    const out = applyLineStochSlowSma([1, null, 3, 4], 3);
    expect(out[2]).toBe(null);
  });
});

describe('computeLineStochSlow', () => {
  it('returns empty for null', () => {
    const ch = computeLineStochSlow(null);
    expect(ch.slowK).toEqual([]);
  });

  it('CONST h=l=close=K yields slowK = null (degenerate window)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(15, K);
      const ch = computeLineStochSlow(series, {
        length: 4,
        smoothLength: 3,
      });
      for (let i = 5; i < 15; i += 1) {
        expect(ch.fastK[i]).toBe(null);
        expect(ch.slowK[i]).toBe(null);
      }
    }
  });

  it('LINEAR UP yields slowK = 100 bit-exact', () => {
    const series = linearUp(15);
    const ch = computeLineStochSlow(series, {
      length: 4,
      smoothLength: 3,
    });
    for (let i = 5; i < 15; i += 1) {
      expect(ch.fastK[i]).toBe(100);
      expect(ch.slowK[i]).toBe(100);
    }
  });

  it('LINEAR DOWN yields slowK = 0 bit-exact', () => {
    const series = linearDown(15);
    const ch = computeLineStochSlow(series, {
      length: 4,
      smoothLength: 3,
    });
    for (let i = 5; i < 15; i += 1) {
      expect(ch.fastK[i]).toBe(0);
      expect(ch.slowK[i]).toBe(0);
    }
  });

  it('warmup region is null', () => {
    const series = linearUp(15);
    const ch = computeLineStochSlow(series, {
      length: 4,
      smoothLength: 3,
    });
    expect(ch.slowK[0]).toBe(null);
    expect(ch.slowK[4]).toBe(null);
    expect(ch.slowK[5]).toBe(100);
  });

  it('output length matches input length', () => {
    const series = linearUp(15);
    const ch = computeLineStochSlow(series, { length: 4 });
    expect(ch.slowK.length).toBe(15);
  });

  it('does not mutate input', () => {
    const series = linearUp(15);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineStochSlow(series, { length: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineStochSlowZone', () => {
  it('classifies overbought', () => {
    expect(classifyLineStochSlowZone(85, 80, 20)).toBe('overbought');
  });

  it('classifies oversold', () => {
    expect(classifyLineStochSlowZone(15, 80, 20)).toBe('oversold');
  });

  it('classifies neutral', () => {
    expect(classifyLineStochSlowZone(50, 80, 20)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineStochSlowZone(null, 80, 20)).toBe('none');
  });
});

describe('detectLineStochSlowCrosses', () => {
  it('returns [null, null] for warmup', () => {
    expect(detectLineStochSlowCrosses([null, null], 80, 20)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering overbought', () => {
    const ev = detectLineStochSlowCrosses([null, 70, 85], 80, 20);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering oversold', () => {
    const ev = detectLineStochSlowCrosses([null, 30, 15], 80, 20);
    expect(ev[2]).toBe('down');
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineStochSlowCrosses([null, 85], 80, 20);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineStochSlow', () => {
  it('marks ok=false for short data', () => {
    const run = runLineStochSlow(constBar(3, 10), {
      length: 4,
      smoothLength: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineStochSlow(constBar(7, 10), {
      length: 4,
      smoothLength: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineStochSlow(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_STOCH_SLOW_LENGTH);
    expect(run.smoothLength).toBe(3);
    expect(run.overbought).toBe(80);
    expect(run.oversold).toBe(20);
  });

  it('respects explicit options', () => {
    const run = runLineStochSlow(constBar(30, 10), {
      length: 7,
      smoothLength: 5,
      overbought: 75,
      oversold: 25,
    });
    expect(run.length).toBe(7);
    expect(run.smoothLength).toBe(5);
    expect(run.overbought).toBe(75);
    expect(run.oversold).toBe(25);
  });

  it('sorts by x', () => {
    const data: ChartLineStochSlowPoint[] = [
      { x: 2, high: 10, low: 10, close: 10 },
      { x: 0, high: 10, low: 10, close: 10 },
      { x: 1, high: 10, low: 10, close: 10 },
    ];
    const run = runLineStochSlow(data, { length: 2, smoothLength: 1 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('LINEAR UP classifies post-warmup as overbought', () => {
    const run = runLineStochSlow(linearUp(20), {
      length: 4,
      smoothLength: 3,
    });
    expect(run.overboughtCount).toBe(15);
  });

  it('LINEAR DOWN classifies post-warmup as oversold', () => {
    const run = runLineStochSlow(linearDown(20), {
      length: 4,
      smoothLength: 3,
    });
    expect(run.oversoldCount).toBe(15);
  });

  it('CONST close classifies post-warmup as none', () => {
    const run = runLineStochSlow(constBar(20, 10), {
      length: 4,
      smoothLength: 3,
    });
    expect(run.noneCount).toBe(20);
  });
});

describe('computeLineStochSlowLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineStochSlowLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineStochSlowLayout({
      data: linearUp(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above stoch', () => {
    const layout = computeLineStochSlowLayout({
      data: linearUp(30),
    });
    expect(layout.priceBottom).toBeLessThan(layout.stochTop);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineStochSlowLayout({
      data: linearUp(30),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('stoch axis is fixed [0, 100]', () => {
    const layout = computeLineStochSlowLayout({
      data: linearUp(30),
    });
    expect(layout.stochMin).toBe(0);
    expect(layout.stochMax).toBe(100);
  });

  it('threshold lines in bounds', () => {
    const layout = computeLineStochSlowLayout({
      data: linearUp(30),
    });
    expect(layout.overboughtY).toBeGreaterThanOrEqual(layout.stochTop);
    expect(layout.overboughtY).toBeLessThanOrEqual(layout.stochBottom);
    expect(layout.oversoldY).toBeGreaterThanOrEqual(layout.stochTop);
    expect(layout.oversoldY).toBeLessThanOrEqual(layout.stochBottom);
  });
});

describe('describeLineStochSlowChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineStochSlowChart([])).toBe('No data');
  });

  it('mentions Slow Stochastic', () => {
    const desc = describeLineStochSlowChart(linearUp(30));
    expect(desc).toContain('Slow Stochastic');
  });

  it('reports parameters', () => {
    const desc = describeLineStochSlowChart(linearUp(30), {
      length: 7,
      smoothLength: 5,
      overbought: 75,
      oversold: 25,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('smoothLength 5');
    expect(desc).toContain('overbought 75');
    expect(desc).toContain('oversold 25');
  });
});

describe('<ChartLineStochSlow />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineStochSlow data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-stoch-slow-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Slow Stochastic');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStochSlow data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineStochSlow
        data={linearUp(30)}
        length={7}
        smoothLength={5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-slow"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-smooth-length')).toBe('5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-slow"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-slow-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Slow Stochastic');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="stoch"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineStochSlow
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="stoch"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'stoch',
      hidden: true,
    });
  });

  it('hides stoch when controlled hidden', () => {
    const { container } = render(
      <ChartLineStochSlow
        data={linearUp(30)}
        hiddenSeries={['stoch']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-slow-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-slow-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-slow-overbought-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-slow-oversold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineStochSlow
        data={linearUp(30)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-slow-overbought-line"]',
      ),
    ).toBe(null);
  });

  it('renders midline by default', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-slow-midline"]',
      ),
    ).toBeTruthy();
  });

  it('hides midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} showMidline={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-slow-midline"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-slow-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-slow-grid"]'),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-slow-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-slow-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineStochSlow
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-slow"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-stoch-slow-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the stoch line by default', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-slow-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineStochSlow data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-slow-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineStochSlow
        data={linearUp(30)}
        defaultHiddenSeries={['stoch']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-slow-line"]'),
    ).toBe(null);
  });
});

describe('Stoch Slow integration', () => {
  it('CONST yields slowK = null across (K, length, smoothLength)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7]) {
        for (const S of [2, 3, 5]) {
          const series = constBar(L + S + 5, K);
          const ch = computeLineStochSlow(series, {
            length: L,
            smoothLength: S,
          });
          for (let i = L + S - 1; i < L + S + 5; i += 1) {
            expect(ch.slowK[i]).toBe(null);
          }
        }
      }
    }
  });

  it('LINEAR UP yields slowK = 100 across length sweep', () => {
    for (const L of [3, 4, 7]) {
      for (const S of [2, 3, 5]) {
        const series = linearUp(L + S + 5);
        const ch = computeLineStochSlow(series, {
          length: L,
          smoothLength: S,
        });
        for (let i = L + S - 1; i < L + S + 5; i += 1) {
          expect(ch.slowK[i]).toBe(100);
        }
      }
    }
  });

  it('LINEAR DOWN yields slowK = 0 across length sweep', () => {
    for (const L of [3, 4, 7]) {
      for (const S of [2, 3, 5]) {
        const series = linearDown(L + S + 5);
        const ch = computeLineStochSlow(series, {
          length: L,
          smoothLength: S,
        });
        for (let i = L + S - 1; i < L + S + 5; i += 1) {
          expect(ch.slowK[i]).toBe(0);
        }
      }
    }
  });
});
