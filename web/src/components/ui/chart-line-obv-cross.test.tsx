import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineObvCross,
  applyLineObvCrossSma,
  classifyLineObvCrossRegime,
  classifyLineObvCrossRelation,
  computeLineObvCross,
  computeLineObvCrossLayout,
  computeLineObvCrossObv,
  describeLineObvCrossChart,
  detectLineObvCrossCrosses,
  getLineObvCrossFinitePoints,
  normalizeLineObvCrossLength,
  runLineObvCross,
  DEFAULT_CHART_LINE_OBV_CROSS_SIGNAL_LENGTH,
} from './chart-line-obv-cross';
import type { ChartLineObvCrossPoint } from './chart-line-obv-cross';

const constBar = (
  count: number,
  K: number,
  V = 1,
): ChartLineObvCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: K,
    volume: V,
  }));

const linearUp = (count: number, V = 1): ChartLineObvCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i + 1,
    volume: V,
  }));

const linearDown = (count: number, V = 1): ChartLineObvCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: count - i,
    volume: V,
  }));

describe('getLineObvCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineObvCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineObvCrossFinitePoints([
      { x: 0, close: Number.NaN, volume: 1 },
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineObvCrossFinitePoints([
      null as unknown as ChartLineObvCrossPoint,
      { x: 1, close: 10, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineObvCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineObvCrossLength(undefined, 20)).toBe(20);
  });

  it('rejects below 2', () => {
    expect(normalizeLineObvCrossLength(1, 20)).toBe(20);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineObvCrossLength(5, 20)).toBe(5);
  });
});

describe('computeLineObvCrossObv', () => {
  it('OBV[0] = 0', () => {
    expect(computeLineObvCrossObv([{ x: 0, close: 10, volume: 5 }])).toEqual(
      [0],
    );
  });

  it('CONST close yields OBV = 0 everywhere', () => {
    const obv = computeLineObvCrossObv(constBar(5, 50, 1));
    for (const v of obv) expect(v).toBe(0);
  });

  it('LINEAR UP yields OBV[i] = i*V', () => {
    const obv = computeLineObvCrossObv(linearUp(5, 1));
    expect(obv).toEqual([0, 1, 2, 3, 4]);
  });

  it('LINEAR UP with V=10 yields OBV[i] = i*10', () => {
    const obv = computeLineObvCrossObv(linearUp(5, 10));
    expect(obv).toEqual([0, 10, 20, 30, 40]);
  });

  it('LINEAR DOWN yields OBV[i] = -i*V', () => {
    const obv = computeLineObvCrossObv(linearDown(5, 1));
    expect(obv).toEqual([0, -1, -2, -3, -4]);
  });

  it('flat then up then down', () => {
    const obv = computeLineObvCrossObv([
      { x: 0, close: 10, volume: 1 },
      { x: 1, close: 10, volume: 1 },
      { x: 2, close: 12, volume: 1 },
      { x: 3, close: 11, volume: 1 },
    ]);
    expect(obv).toEqual([0, 0, 1, 0]);
  });
});

describe('applyLineObvCrossSma', () => {
  it('CONST K SMA = K bit-exact', () => {
    for (const K of [0, 5, 100]) {
      for (const L of [2, 3, 5]) {
        const out = applyLineObvCrossSma(Array(L + 3).fill(K), L);
        for (let i = L - 1; i < L + 3; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineObvCrossSma([1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('LINEAR i SMA at i with n=3 is i-1', () => {
    const out = applyLineObvCrossSma([0, 1, 2, 3, 4], 3);
    expect(out[2]).toBe(1);
    expect(out[3]).toBe(2);
    expect(out[4]).toBe(3);
  });
});

describe('computeLineObvCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineObvCross(null);
    expect(ch.obv).toEqual([]);
    expect(ch.signal).toEqual([]);
  });

  it('CONST yields OBV=0 and signal=0', () => {
    const ch = computeLineObvCross(constBar(10, 50), { signalLength: 3 });
    for (const v of ch.obv) expect(v).toBe(0);
    for (let i = 2; i < 10; i += 1) expect(ch.signal[i]).toBe(0);
  });

  it('LINEAR UP OBV - signal = V*(n-1)/2', () => {
    for (const N of [3, 4, 5]) {
      const ch = computeLineObvCross(linearUp(10, 1), {
        signalLength: N,
      });
      for (let i = N - 1; i < 10; i += 1) {
        const diff = (ch.obv[i] as number) - (ch.signal[i] as number);
        expect(diff).toBeCloseTo((N - 1) / 2, 10);
      }
    }
  });

  it('LINEAR DOWN OBV - signal = -V*(n-1)/2', () => {
    for (const N of [3, 4, 5]) {
      const ch = computeLineObvCross(linearDown(10, 1), {
        signalLength: N,
      });
      for (let i = N - 1; i < 10; i += 1) {
        const diff = (ch.obv[i] as number) - (ch.signal[i] as number);
        expect(diff).toBeCloseTo(-(N - 1) / 2, 10);
      }
    }
  });

  it('output length matches input', () => {
    const ch = computeLineObvCross(linearUp(10), { signalLength: 3 });
    expect(ch.obv.length).toBe(10);
    expect(ch.signal.length).toBe(10);
  });

  it('does not mutate input', () => {
    const data = linearUp(10);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineObvCross(data, { signalLength: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineObvCrossRelation', () => {
  it('bullish when OBV > signal', () => {
    expect(classifyLineObvCrossRelation(10, 5)).toBe('bullish');
  });

  it('bearish when OBV < signal', () => {
    expect(classifyLineObvCrossRelation(5, 10)).toBe('bearish');
  });

  it('equal when OBV == signal', () => {
    expect(classifyLineObvCrossRelation(5, 5)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineObvCrossRelation(null, 5)).toBe('none');
  });
});

describe('classifyLineObvCrossRegime', () => {
  it('accumulation for bullish', () => {
    expect(classifyLineObvCrossRegime('bullish')).toBe('accumulation');
  });

  it('distribution for bearish', () => {
    expect(classifyLineObvCrossRegime('bearish')).toBe('distribution');
  });

  it('neutral for equal', () => {
    expect(classifyLineObvCrossRegime('equal')).toBe('neutral');
  });

  it('none for none', () => {
    expect(classifyLineObvCrossRegime('none')).toBe('none');
  });
});

describe('detectLineObvCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineObvCrossCrosses([-1, 1], [0, 0])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineObvCrossCrosses([1, -1], [0, 0])[1]).toBe('down');
  });

  it('warmup null does not fire', () => {
    expect(detectLineObvCrossCrosses([null, 1], [null, 0])).toEqual([
      null,
      null,
    ]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLineObvCrossCrosses([1, 2, 3], [0, 0, 0]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineObvCross', () => {
  it('ok=false on short data', () => {
    const run = runLineObvCross(constBar(3, 50), { signalLength: 3 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineObvCross(constBar(10, 50), { signalLength: 3 });
    expect(run.ok).toBe(true);
  });

  it('uses default signalLength', () => {
    const run = runLineObvCross(constBar(30, 50));
    expect(run.signalLength).toBe(
      DEFAULT_CHART_LINE_OBV_CROSS_SIGNAL_LENGTH,
    );
  });

  it('respects explicit signalLength', () => {
    const run = runLineObvCross(constBar(10, 50), { signalLength: 5 });
    expect(run.signalLength).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineObvCrossPoint[] = [
      { x: 2, close: 30, volume: 1 },
      { x: 0, close: 10, volume: 1 },
      { x: 1, close: 20, volume: 1 },
    ];
    const run = runLineObvCross(data, { signalLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses, all neutral after warmup', () => {
    const run = runLineObvCross(constBar(10, 50), { signalLength: 3 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
    expect(run.neutralCount).toBeGreaterThan(0);
  });

  it('LINEAR UP yields zero crosses, accumulation regime', () => {
    const run = runLineObvCross(linearUp(10), { signalLength: 3 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
    expect(run.accumulationCount).toBeGreaterThan(0);
  });

  it('LINEAR DOWN yields zero crosses, distribution regime', () => {
    const run = runLineObvCross(linearDown(10), { signalLength: 3 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
    expect(run.distributionCount).toBeGreaterThan(0);
  });
});

describe('computeLineObvCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineObvCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineObvCrossLayout({ data: linearUp(10) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above obv', () => {
    const layout = computeLineObvCrossLayout({ data: linearUp(10) });
    expect(layout.priceBottom).toBeLessThan(layout.obvTop);
  });

  it('zero inside obv axis bounds', () => {
    const layout = computeLineObvCrossLayout({ data: linearUp(10) });
    expect(layout.obvMin).toBeLessThanOrEqual(0);
    expect(layout.obvMax).toBeGreaterThanOrEqual(0);
  });

  it('produces price path and dots', () => {
    const layout = computeLineObvCrossLayout({ data: linearUp(10) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(10);
  });

  it('produces obv and signal paths', () => {
    const layout = computeLineObvCrossLayout({
      data: linearUp(10),
      signalLength: 3,
    });
    expect(layout.obvPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });
});

describe('describeLineObvCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineObvCrossChart([])).toBe('No data');
  });

  it('mentions OBV Cross', () => {
    expect(describeLineObvCrossChart(linearUp(10))).toContain('OBV Cross');
  });

  it('reports signalLength', () => {
    expect(
      describeLineObvCrossChart(linearUp(10), { signalLength: 7 }),
    ).toContain('signalLength 7');
  });
});

describe('<ChartLineObvCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineObvCross data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-obv-cross-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineObvCross data={linearUp(10)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('OBV Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineObvCross data={linearUp(10)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineObvCross data={linearUp(10)} signalLength={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-obv-cross"]',
    );
    expect(root?.getAttribute('data-signal-length')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('10');
  });

  it('exposes cross + regime counts', () => {
    const { container } = render(<ChartLineObvCross data={linearUp(10)} />);
    const root = container.querySelector(
      '[data-section="chart-line-obv-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineObvCross data={linearUp(10)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-aria-desc"]',
      )?.textContent,
    ).toContain('OBV Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineObvCross data={linearUp(10)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="obv"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineObvCross
        data={linearUp(10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="obv"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'obv', hidden: true });
  });

  it('hides obv when controlled', () => {
    const { container } = render(
      <ChartLineObvCross
        data={linearUp(10)}
        hiddenSeries={['obv']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-obv-cross-obv"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineObvCross data={linearUp(10)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineObvCross data={linearUp(10)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineObvCross data={linearUp(10)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineObvCross data={linearUp(10)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-obv-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineObvCross data={linearUp(10)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-obv-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineObvCross data={linearUp(10)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-obv-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineObvCross
        data={linearUp(10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-obv-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineObvCross data={linearUp(10)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-obv-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders obv and signal paths', () => {
    const { container } = render(
      <ChartLineObvCross data={linearUp(10)} signalLength={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-obv-cross-obv"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-signal"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineObvCross data={linearUp(10)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineObvCross
        data={linearUp(10)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-obv-cross-signal"]',
      ),
    ).toBe(null);
  });
});

describe('OBV Cross integration', () => {
  it('all three anchors yield zero crosses across multiple signalLength', () => {
    for (const N of [3, 5, 7]) {
      for (const series of [
        constBar(N + 4, 50),
        linearUp(N + 4),
        linearDown(N + 4),
      ]) {
        const run = runLineObvCross(series, { signalLength: N });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('LINEAR UP regime is accumulation; LINEAR DOWN is distribution; CONST is neutral', () => {
    const upRun = runLineObvCross(linearUp(10), { signalLength: 3 });
    const downRun = runLineObvCross(linearDown(10), { signalLength: 3 });
    const constRun = runLineObvCross(constBar(10, 50), {
      signalLength: 3,
    });
    expect(upRun.samples[5]?.regime).toBe('accumulation');
    expect(downRun.samples[5]?.regime).toBe('distribution');
    expect(constRun.samples[5]?.regime).toBe('neutral');
  });
});
