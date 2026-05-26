import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStochFast,
  applyLineStochFastRollingMax,
  applyLineStochFastRollingMin,
  classifyLineStochFastZone,
  computeLineStochFast,
  computeLineStochFastLayout,
  describeLineStochFastChart,
  detectLineStochFastCrosses,
  getLineStochFastFinitePoints,
  normalizeLineStochFastLength,
  normalizeLineStochFastThreshold,
  runLineStochFast,
  DEFAULT_CHART_LINE_STOCH_FAST_LENGTH,
} from './chart-line-stoch-fast';
import type { ChartLineStochFastPoint } from './chart-line-stoch-fast';

const constBar = (
  count: number,
  K: number,
): ChartLineStochFastPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineStochFastPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineStochFastPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

describe('getLineStochFastFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineStochFastFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const result = getLineStochFastFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineStochFastFinitePoints([
      null as unknown as ChartLineStochFastPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineStochFastLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineStochFastLength(undefined, 14)).toBe(14);
  });

  it('floors fractional', () => {
    expect(normalizeLineStochFastLength(7.9, 14)).toBe(7);
  });

  it('rejects below 2', () => {
    expect(normalizeLineStochFastLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineStochFastThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineStochFastThreshold(undefined, 80)).toBe(80);
  });

  it('accepts 0 and 100', () => {
    expect(normalizeLineStochFastThreshold(0, 80)).toBe(0);
    expect(normalizeLineStochFastThreshold(100, 80)).toBe(100);
  });

  it('rejects out of range', () => {
    expect(normalizeLineStochFastThreshold(-1, 80)).toBe(80);
    expect(normalizeLineStochFastThreshold(101, 80)).toBe(80);
  });
});

describe('applyLineStochFastRollingMax', () => {
  it('CONST K max is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineStochFastRollingMax(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('finds the rolling max', () => {
    const out = applyLineStochFastRollingMax([3, 1, 4, 1, 5, 9, 2, 6], 3);
    // bars 2..7: max over [3,1,4]=4, [1,4,1]=4, [4,1,5]=5, [1,5,9]=9, [5,9,2]=9, [9,2,6]=9
    expect(out[2]).toBe(4);
    expect(out[5]).toBe(9);
  });

  it('warmup region is null', () => {
    const out = applyLineStochFastRollingMax([1, 2, 3], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(3);
  });
});

describe('applyLineStochFastRollingMin', () => {
  it('CONST K min is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineStochFastRollingMin(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('finds the rolling min', () => {
    const out = applyLineStochFastRollingMin([3, 1, 4, 1, 5, 9, 2, 6], 3);
    expect(out[2]).toBe(1);
    expect(out[5]).toBe(1);
  });
});

describe('computeLineStochFast', () => {
  it('returns empty for null', () => {
    const ch = computeLineStochFast(null);
    expect(ch.percentK).toEqual([]);
  });

  it('CONST h=l=c=K yields percentK = null (degenerate window)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(10, K);
      const ch = computeLineStochFast(series, { length: 4 });
      for (let i = 3; i < 10; i += 1) {
        expect(ch.percentK[i]).toBe(null);
      }
    }
  });

  it('LINEAR UP yields percentK = 100 bit-exact', () => {
    const series = linearUp(10);
    const ch = computeLineStochFast(series, { length: 4 });
    for (let i = 3; i < 10; i += 1) {
      expect(ch.percentK[i]).toBe(100);
    }
  });

  it('LINEAR DOWN yields percentK = 0 bit-exact', () => {
    const series = linearDown(10);
    const ch = computeLineStochFast(series, { length: 4 });
    for (let i = 3; i < 10; i += 1) {
      expect(ch.percentK[i]).toBe(0);
    }
  });

  it('ALTERNATING [0,1,0,1,...] alternates between 100 and 0', () => {
    const series: ChartLineStochFastPoint[] = Array.from(
      { length: 10 },
      (_, i) => ({
        x: i,
        high: i % 2,
        low: i % 2,
        close: i % 2,
      }),
    );
    const ch = computeLineStochFast(series, { length: 4 });
    // i=3 close=1: percentK = (1-0)/(1-0)*100 = 100
    // i=4 close=0: percentK = (0-0)/(1-0)*100 = 0
    expect(ch.percentK[3]).toBe(100);
    expect(ch.percentK[4]).toBe(0);
    expect(ch.percentK[5]).toBe(100);
    expect(ch.percentK[6]).toBe(0);
  });

  it('warmup region is null', () => {
    const series = constBar(15, 10);
    const ch = computeLineStochFast(series, { length: 4 });
    expect(ch.percentK[0]).toBe(null);
    expect(ch.percentK[2]).toBe(null);
  });

  it('output length matches input length', () => {
    const series = linearUp(15);
    const ch = computeLineStochFast(series, { length: 4 });
    expect(ch.percentK.length).toBe(15);
    expect(ch.highestHigh.length).toBe(15);
    expect(ch.lowestLow.length).toBe(15);
  });

  it('does not mutate input', () => {
    const series = linearUp(15);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineStochFast(series, { length: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineStochFastZone', () => {
  it('classifies overbought when value >= overbought', () => {
    expect(classifyLineStochFastZone(85, 80, 20)).toBe('overbought');
  });

  it('classifies oversold when value <= oversold', () => {
    expect(classifyLineStochFastZone(15, 80, 20)).toBe('oversold');
  });

  it('classifies neutral in between', () => {
    expect(classifyLineStochFastZone(50, 80, 20)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineStochFastZone(null, 80, 20)).toBe('none');
  });
});

describe('detectLineStochFastCrosses', () => {
  it('returns [null, null] for warmup', () => {
    expect(detectLineStochFastCrosses([null, null], 80, 20)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering overbought', () => {
    const ev = detectLineStochFastCrosses([null, 70, 85], 80, 20);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering oversold', () => {
    const ev = detectLineStochFastCrosses([null, 30, 15], 80, 20);
    expect(ev[2]).toBe('down');
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineStochFastCrosses([null, 85], 80, 20);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineStochFast', () => {
  it('marks ok=false for short data', () => {
    const run = runLineStochFast(constBar(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineStochFast(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineStochFast(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_STOCH_FAST_LENGTH);
    expect(run.overbought).toBe(80);
    expect(run.oversold).toBe(20);
  });

  it('respects explicit options', () => {
    const run = runLineStochFast(constBar(30, 10), {
      length: 7,
      overbought: 75,
      oversold: 25,
    });
    expect(run.length).toBe(7);
    expect(run.overbought).toBe(75);
    expect(run.oversold).toBe(25);
  });

  it('sorts by x', () => {
    const data: ChartLineStochFastPoint[] = [
      { x: 2, high: 10, low: 10, close: 10 },
      { x: 0, high: 10, low: 10, close: 10 },
      { x: 1, high: 10, low: 10, close: 10 },
    ];
    const run = runLineStochFast(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('LINEAR UP classifies post-warmup as overbought', () => {
    const run = runLineStochFast(linearUp(20), { length: 4 });
    // percentK = 100 -> overbought (>= 80).
    expect(run.overboughtCount).toBe(17);
    expect(run.oversoldCount).toBe(0);
  });

  it('LINEAR DOWN classifies post-warmup as oversold', () => {
    const run = runLineStochFast(linearDown(20), { length: 4 });
    // percentK = 0 -> oversold (<= 20).
    expect(run.oversoldCount).toBe(17);
    expect(run.overboughtCount).toBe(0);
  });

  it('CONST close classifies post-warmup as none', () => {
    const run = runLineStochFast(constBar(20, 10), { length: 4 });
    expect(run.noneCount).toBe(20);
  });
});

describe('computeLineStochFastLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineStochFastLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineStochFastLayout({
      data: linearUp(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above stoch', () => {
    const layout = computeLineStochFastLayout({
      data: linearUp(30),
    });
    expect(layout.priceBottom).toBeLessThan(layout.stochTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineStochFastLayout({
      data: linearUp(30),
      panelGap: 24,
    });
    expect(layout.stochTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineStochFastLayout({
      data: linearUp(30),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('stoch axis is fixed [0, 100]', () => {
    const layout = computeLineStochFastLayout({
      data: linearUp(30),
    });
    expect(layout.stochMin).toBe(0);
    expect(layout.stochMax).toBe(100);
  });

  it('overbought and oversold lines are within bounds', () => {
    const layout = computeLineStochFastLayout({
      data: linearUp(30),
    });
    expect(layout.overboughtY).toBeGreaterThanOrEqual(layout.stochTop);
    expect(layout.overboughtY).toBeLessThanOrEqual(layout.stochBottom);
    expect(layout.oversoldY).toBeGreaterThanOrEqual(layout.stochTop);
    expect(layout.oversoldY).toBeLessThanOrEqual(layout.stochBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineStochFastLayout({
      data: [{ x: 0, high: 10, low: 10, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineStochFastChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineStochFastChart([])).toBe('No data');
  });

  it('mentions Fast Stochastic', () => {
    const desc = describeLineStochFastChart(linearUp(30));
    expect(desc).toContain('Fast Stochastic');
  });

  it('reports parameters', () => {
    const desc = describeLineStochFastChart(linearUp(30), {
      length: 7,
      overbought: 75,
      oversold: 25,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('overbought 75');
    expect(desc).toContain('oversold 25');
  });
});

describe('<ChartLineStochFast />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineStochFast data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-stoch-fast-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Fast Stochastic');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStochFast data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineStochFast
        data={linearUp(30)}
        length={7}
        overbought={75}
        oversold={25}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-fast"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-overbought')).toBe('75');
    expect(root?.getAttribute('data-oversold')).toBe('25');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-fast"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-fast-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Fast Stochastic');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="stoch"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineStochFast
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
      <ChartLineStochFast
        data={linearUp(30)}
        hiddenSeries={['stoch']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-fast-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-fast-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-fast-overbought-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-fast-oversold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineStochFast
        data={linearUp(30)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-fast-overbought-line"]',
      ),
    ).toBe(null);
  });

  it('renders midline by default', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-fast-midline"]',
      ),
    ).toBeTruthy();
  });

  it('hides midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} showMidline={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-fast-midline"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-fast-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-fast-grid"]'),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-fast-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-fast-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineStochFast
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-fast"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-stoch-fast-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the stoch line by default', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-fast-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineStochFast data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-fast-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineStochFast
        data={linearUp(30)}
        defaultHiddenSeries={['stoch']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-fast-line"]'),
    ).toBe(null);
  });
});

describe('Stoch Fast integration', () => {
  it('CONST yields percentK = null across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const series = constBar(L + 5, K);
        const ch = computeLineStochFast(series, { length: L });
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(ch.percentK[i]).toBe(null);
        }
      }
    }
  });

  it('LINEAR UP yields percentK = 100 across length sweep', () => {
    for (const L of [3, 4, 7, 10]) {
      const series = linearUp(L + 5);
      const ch = computeLineStochFast(series, { length: L });
      for (let i = L - 1; i < L + 5; i += 1) {
        expect(ch.percentK[i]).toBe(100);
      }
    }
  });

  it('LINEAR DOWN yields percentK = 0 across length sweep', () => {
    for (const L of [3, 4, 7, 10]) {
      const series = linearDown(L + 5);
      const ch = computeLineStochFast(series, { length: L });
      for (let i = L - 1; i < L + 5; i += 1) {
        expect(ch.percentK[i]).toBe(0);
      }
    }
  });
});
