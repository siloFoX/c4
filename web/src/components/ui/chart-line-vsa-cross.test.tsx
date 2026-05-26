import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVsaCross,
  applyLineVsaCrossEma,
  applyLineVsaCrossSma,
  classifyLineVsaCrossRegime,
  classifyLineVsaCrossRelation,
  computeLineVsaCross,
  computeLineVsaCrossLayout,
  describeLineVsaCrossChart,
  detectLineVsaCrossCrosses,
  getLineVsaCrossFinitePoints,
  normalizeLineVsaCrossLength,
  runLineVsaCross,
  DEFAULT_CHART_LINE_VSA_CROSS_LENGTH,
  DEFAULT_CHART_LINE_VSA_CROSS_SIGNAL_LENGTH,
} from './chart-line-vsa-cross';
import type { ChartLineVsaCrossPoint } from './chart-line-vsa-cross';

const constBar = (
  count: number,
  K: number,
  D: number,
  V: number,
): ChartLineVsaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K + D,
    low: K,
    close: K + D / 2,
    volume: V,
  }));

const linearUp = (count: number): ChartLineVsaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1 + 1,
    low: i + 1,
    close: i + 1 + 0.5,
    volume: (i + 1) * 100,
  }));

describe('getLineVsaCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineVsaCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineVsaCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 0, close: 0, volume: 100 },
      { x: 1, high: 1, low: 0, close: 1, volume: 100 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineVsaCrossFinitePoints([
      null as unknown as ChartLineVsaCrossPoint,
      { x: 1, high: 1, low: 0, close: 1, volume: 100 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineVsaCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineVsaCrossLength(undefined, 20)).toBe(20);
  });

  it('rejects below 2', () => {
    expect(normalizeLineVsaCrossLength(1, 20)).toBe(20);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineVsaCrossLength(5, 20)).toBe(5);
  });
});

describe('applyLineVsaCrossSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      const out = applyLineVsaCrossSma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('applyLineVsaCrossEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      const out = applyLineVsaCrossEma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('computeLineVsaCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineVsaCross(null);
    expect(ch.effortResult).toEqual([]);
  });

  it('CONST D > 0, V > 0 yields effortResult = 0 and signal = 0', () => {
    for (const D of [1, 2, 5]) {
      for (const V of [1, 100, 1000]) {
        const ch = computeLineVsaCross(constBar(20, 50, D, V), {
          length: 3,
          signalLength: 3,
        });
        for (let i = 4; i < 20; i += 1) {
          expect(ch.normVolume[i]).toBe(1);
          expect(ch.normSpread[i]).toBe(1);
          expect(ch.effortResult[i]).toBe(0);
          expect(ch.signal[i]).toBe(0);
        }
      }
    }
  });

  it('CONST D = 0 yields normSpread = null and effortResult = null', () => {
    const ch = computeLineVsaCross(constBar(20, 50, 0, 100), {
      length: 3,
      signalLength: 3,
    });
    for (const v of ch.effortResult) expect(v).toBe(null);
  });

  it('CONST V = 0 yields normVolume = null and effortResult = null', () => {
    const ch = computeLineVsaCross(constBar(20, 50, 1, 0), {
      length: 3,
      signalLength: 3,
    });
    for (const v of ch.effortResult) expect(v).toBe(null);
  });

  it('output length matches input', () => {
    const ch = computeLineVsaCross(linearUp(30), {
      length: 3,
      signalLength: 3,
    });
    expect(ch.effortResult.length).toBe(30);
    expect(ch.signal.length).toBe(30);
  });

  it('does not mutate input', () => {
    const data = linearUp(30);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineVsaCross(data, { length: 3, signalLength: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineVsaCrossRelation', () => {
  it('bullish when effort > signal', () => {
    expect(classifyLineVsaCrossRelation(1, 0)).toBe('bullish');
  });

  it('bearish when effort < signal', () => {
    expect(classifyLineVsaCrossRelation(-1, 0)).toBe('bearish');
  });

  it('equal when effort == signal', () => {
    expect(classifyLineVsaCrossRelation(0, 0)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineVsaCrossRelation(null, 0)).toBe('none');
  });
});

describe('classifyLineVsaCrossRegime', () => {
  it('absorption for bullish', () => {
    expect(classifyLineVsaCrossRegime('bullish')).toBe('absorption');
  });

  it('ease for bearish', () => {
    expect(classifyLineVsaCrossRegime('bearish')).toBe('ease');
  });

  it('aligned for equal', () => {
    expect(classifyLineVsaCrossRegime('equal')).toBe('aligned');
  });

  it('none for none', () => {
    expect(classifyLineVsaCrossRegime('none')).toBe('none');
  });
});

describe('detectLineVsaCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineVsaCrossCrosses([-1, 1], [0, 0])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineVsaCrossCrosses([1, -1], [0, 0])[1]).toBe('down');
  });

  it('warmup null', () => {
    expect(detectLineVsaCrossCrosses([null, 1], [null, 0])).toEqual([
      null,
      null,
    ]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLineVsaCrossCrosses([1, 2, 3], [0, 0, 0]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineVsaCross', () => {
  it('ok=false on short data', () => {
    const run = runLineVsaCross(constBar(3, 50, 1, 100), {
      length: 3,
      signalLength: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineVsaCross(constBar(20, 50, 1, 100), {
      length: 3,
      signalLength: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineVsaCross(constBar(60, 50, 1, 100));
    expect(run.length).toBe(DEFAULT_CHART_LINE_VSA_CROSS_LENGTH);
    expect(run.signalLength).toBe(DEFAULT_CHART_LINE_VSA_CROSS_SIGNAL_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineVsaCross(constBar(20, 50, 1, 100), {
      length: 5,
      signalLength: 3,
    });
    expect(run.length).toBe(5);
    expect(run.signalLength).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineVsaCrossPoint[] = [
      { x: 2, high: 3, low: 2, close: 2.5, volume: 100 },
      { x: 0, high: 1, low: 0, close: 0.5, volume: 100 },
      { x: 1, high: 2, low: 1, close: 1.5, volume: 100 },
    ];
    const run = runLineVsaCross(data, { length: 2, signalLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST D>0,V>0 yields zero crosses', () => {
    const run = runLineVsaCross(constBar(30, 50, 1, 100), {
      length: 3,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('CONST regime is aligned after warmup', () => {
    const run = runLineVsaCross(constBar(20, 50, 1, 100), {
      length: 3,
      signalLength: 3,
    });
    expect(run.samples[10]?.regime).toBe('aligned');
  });
});

describe('computeLineVsaCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineVsaCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineVsaCrossLayout({
      data: linearUp(30),
      length: 5,
      signalLength: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above osc', () => {
    const layout = computeLineVsaCrossLayout({ data: linearUp(30) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('produces price + effort + signal paths', () => {
    const layout = computeLineVsaCrossLayout({
      data: linearUp(30),
      length: 5,
      signalLength: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.effortPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('zero inside osc axis', () => {
    const layout = computeLineVsaCrossLayout({
      data: linearUp(30),
      length: 5,
      signalLength: 3,
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });
});

describe('describeLineVsaCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineVsaCrossChart([])).toBe('No data');
  });

  it('mentions VSA Cross', () => {
    expect(describeLineVsaCrossChart(linearUp(30))).toContain('VSA Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineVsaCrossChart(linearUp(30), {
      length: 5,
      signalLength: 3,
    });
    expect(desc).toContain('length 5');
    expect(desc).toContain('signalLength 3');
  });
});

describe('<ChartLineVsaCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineVsaCross data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-vsa-cross-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineVsaCross data={linearUp(30)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('VSA Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVsaCross data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineVsaCross
        data={linearUp(30)}
        length={5}
        signalLength={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vsa-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-signal-length')).toBe('3');
  });

  it('exposes cross counts', () => {
    const { container } = render(<ChartLineVsaCross data={linearUp(30)} />);
    const root = container.querySelector(
      '[data-section="chart-line-vsa-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).not.toBe(null);
    expect(root?.getAttribute('data-down-cross-count')).not.toBe(null);
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineVsaCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vsa-cross-aria-desc"]',
      )?.textContent,
    ).toContain('VSA Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineVsaCross data={linearUp(30)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="effort"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVsaCross
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="effort"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'effort', hidden: true });
  });

  it('hides effort when controlled', () => {
    const { container } = render(
      <ChartLineVsaCross
        data={linearUp(30)}
        hiddenSeries={['effort']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vsa-cross-effort"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineVsaCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vsa-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineVsaCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vsa-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineVsaCross data={linearUp(30)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vsa-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineVsaCross data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vsa-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineVsaCross data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vsa-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineVsaCross data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vsa-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineVsaCross
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vsa-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineVsaCross data={linearUp(30)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-vsa-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders effort + signal paths', () => {
    const { container } = render(
      <ChartLineVsaCross
        data={linearUp(30)}
        length={5}
        signalLength={3}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vsa-cross-effort"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-vsa-cross-signal"]'),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineVsaCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vsa-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineVsaCross
        data={linearUp(30)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vsa-cross-signal"]'),
    ).toBe(null);
  });
});

describe('VSA Cross integration', () => {
  it('CONST D > 0 V > 0 yields zero crosses across many tuples', () => {
    for (const D of [1, 2]) {
      for (const V of [1, 100]) {
        for (const L of [3, 5]) {
          const run = runLineVsaCross(constBar(L * 4, 50, D, V), {
            length: L,
            signalLength: 3,
          });
          expect(run.upCrossCount).toBe(0);
          expect(run.downCrossCount).toBe(0);
          for (let i = L + 2; i < L * 4; i += 1) {
            expect(run.samples[i]?.effortResult).toBe(0);
            expect(run.samples[i]?.signal).toBe(0);
          }
        }
      }
    }
  });
});
