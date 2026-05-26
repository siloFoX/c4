import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVrocCross,
  applyLineVrocCrossEma,
  classifyLineVrocCrossRegime,
  classifyLineVrocCrossRelation,
  computeLineVrocCross,
  computeLineVrocCrossLayout,
  describeLineVrocCrossChart,
  detectLineVrocCrossCrosses,
  getLineVrocCrossFinitePoints,
  normalizeLineVrocCrossLength,
  runLineVrocCross,
  DEFAULT_CHART_LINE_VROC_CROSS_LENGTH,
  DEFAULT_CHART_LINE_VROC_CROSS_SIGNAL_LENGTH,
} from './chart-line-vroc-cross';
import type { ChartLineVrocCrossPoint } from './chart-line-vroc-cross';

const constBar = (
  count: number,
  K: number,
  V = 100,
): ChartLineVrocCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: K,
    volume: V,
  }));

const linearUp = (count: number): ChartLineVrocCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i + 1,
    volume: (i + 1) * 100,
  }));

const linearDown = (count: number): ChartLineVrocCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: count - i,
    volume: (count - i) * 100,
  }));

describe('getLineVrocCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineVrocCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineVrocCrossFinitePoints([
      { x: 0, close: Number.NaN, volume: 100 },
      { x: 1, close: 10, volume: 100 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineVrocCrossFinitePoints([
      null as unknown as ChartLineVrocCrossPoint,
      { x: 1, close: 10, volume: 100 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineVrocCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineVrocCrossLength(undefined, 12)).toBe(12);
  });

  it('rejects below 2', () => {
    expect(normalizeLineVrocCrossLength(1, 12)).toBe(12);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineVrocCrossLength(5, 12)).toBe(5);
  });
});

describe('applyLineVrocCrossEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100]) {
      const out = applyLineVrocCrossEma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('computeLineVrocCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineVrocCross(null);
    expect(ch.vroc).toEqual([]);
    expect(ch.signal).toEqual([]);
  });

  it('CONST V > 0 yields VROC = signal = 0 bit-exact', () => {
    for (const V of [1, 100, 1000]) {
      const ch = computeLineVrocCross(constBar(30, 50, V), {
        length: 5,
        signalLength: 3,
      });
      for (let i = 7; i < 30; i += 1) {
        expect(ch.vroc[i]).toBe(0);
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('CONST V = 0 yields VROC = null', () => {
    const ch = computeLineVrocCross(constBar(30, 50, 0), {
      length: 5,
      signalLength: 3,
    });
    for (const v of ch.vroc) expect(v).toBe(null);
  });

  it('LINEAR UP volume yields VROC > 0', () => {
    const ch = computeLineVrocCross(linearUp(30), {
      length: 5,
      signalLength: 3,
    });
    let saw = false;
    for (const v of ch.vroc) {
      if (v != null) {
        expect(v).toBeGreaterThan(0);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('LINEAR DOWN volume yields VROC < 0', () => {
    const ch = computeLineVrocCross(linearDown(30), {
      length: 5,
      signalLength: 3,
    });
    let saw = false;
    for (const v of ch.vroc) {
      if (v != null) {
        expect(v).toBeLessThan(0);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('output length matches input', () => {
    const ch = computeLineVrocCross(linearUp(30), {
      length: 5,
      signalLength: 3,
    });
    expect(ch.vroc.length).toBe(30);
    expect(ch.signal.length).toBe(30);
  });

  it('does not mutate input', () => {
    const data = linearUp(30);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineVrocCross(data, { length: 5, signalLength: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineVrocCrossRelation', () => {
  it('bullish when vroc > signal', () => {
    expect(classifyLineVrocCrossRelation(1, 0)).toBe('bullish');
  });

  it('bearish when vroc < signal', () => {
    expect(classifyLineVrocCrossRelation(-1, 0)).toBe('bearish');
  });

  it('equal when vroc == signal', () => {
    expect(classifyLineVrocCrossRelation(0, 0)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineVrocCrossRelation(null, 0)).toBe('none');
  });
});

describe('classifyLineVrocCrossRegime', () => {
  it('expanding for bullish', () => {
    expect(classifyLineVrocCrossRegime('bullish')).toBe('expanding');
  });

  it('contracting for bearish', () => {
    expect(classifyLineVrocCrossRegime('bearish')).toBe('contracting');
  });

  it('aligned for equal', () => {
    expect(classifyLineVrocCrossRegime('equal')).toBe('aligned');
  });

  it('none for none', () => {
    expect(classifyLineVrocCrossRegime('none')).toBe('none');
  });
});

describe('detectLineVrocCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineVrocCrossCrosses([-1, 1], [0, 0])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineVrocCrossCrosses([1, -1], [0, 0])[1]).toBe('down');
  });

  it('warmup null', () => {
    expect(detectLineVrocCrossCrosses([null, 1], [null, 0])).toEqual([
      null,
      null,
    ]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLineVrocCrossCrosses([1, 2, 3], [0, 0, 0]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineVrocCross', () => {
  it('ok=false on short data', () => {
    const run = runLineVrocCross(constBar(5, 50), {
      length: 5,
      signalLength: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineVrocCross(constBar(15, 50), {
      length: 5,
      signalLength: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineVrocCross(constBar(40, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_VROC_CROSS_LENGTH);
    expect(run.signalLength).toBe(
      DEFAULT_CHART_LINE_VROC_CROSS_SIGNAL_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLineVrocCross(constBar(20, 50), {
      length: 5,
      signalLength: 3,
    });
    expect(run.length).toBe(5);
    expect(run.signalLength).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineVrocCrossPoint[] = [
      { x: 2, close: 30, volume: 100 },
      { x: 0, close: 10, volume: 100 },
      { x: 1, close: 20, volume: 100 },
    ];
    const run = runLineVrocCross(data, { length: 2, signalLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST V > 0 yields zero crosses', () => {
    const run = runLineVrocCross(constBar(30, 50, 100), {
      length: 5,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('CONST V > 0 regime aligned after warmup', () => {
    const run = runLineVrocCross(constBar(30, 50, 100), {
      length: 5,
      signalLength: 3,
    });
    expect(run.samples[15]?.regime).toBe('aligned');
  });
});

describe('computeLineVrocCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineVrocCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineVrocCrossLayout({
      data: linearUp(30),
      length: 5,
      signalLength: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above osc', () => {
    const layout = computeLineVrocCrossLayout({ data: linearUp(30) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('produces price + vroc + signal paths', () => {
    const layout = computeLineVrocCrossLayout({
      data: linearUp(30),
      length: 5,
      signalLength: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.vrocPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('zero inside osc axis', () => {
    const layout = computeLineVrocCrossLayout({
      data: linearUp(30),
      length: 5,
      signalLength: 3,
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });
});

describe('describeLineVrocCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineVrocCrossChart([])).toBe('No data');
  });

  it('mentions VROC Cross', () => {
    expect(describeLineVrocCrossChart(linearUp(30))).toContain('VROC Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineVrocCrossChart(linearUp(30), {
      length: 5,
      signalLength: 3,
    });
    expect(desc).toContain('length 5');
    expect(desc).toContain('signalLength 3');
  });
});

describe('<ChartLineVrocCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineVrocCross data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-vroc-cross-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineVrocCross data={linearUp(30)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('VROC Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVrocCross data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineVrocCross
        data={linearUp(30)}
        length={5}
        signalLength={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vroc-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-signal-length')).toBe('3');
  });

  it('exposes cross counts', () => {
    const { container } = render(<ChartLineVrocCross data={linearUp(30)} />);
    const root = container.querySelector(
      '[data-section="chart-line-vroc-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).not.toBe(null);
    expect(root?.getAttribute('data-down-cross-count')).not.toBe(null);
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineVrocCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-aria-desc"]',
      )?.textContent,
    ).toContain('VROC Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineVrocCross data={linearUp(30)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="vroc"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVrocCross
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="vroc"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'vroc', hidden: true });
  });

  it('hides vroc when controlled', () => {
    const { container } = render(
      <ChartLineVrocCross
        data={linearUp(30)}
        hiddenSeries={['vroc']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-cross-vroc"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineVrocCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineVrocCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineVrocCross data={linearUp(30)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineVrocCross data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineVrocCross data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineVrocCross data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineVrocCross
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vroc-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineVrocCross data={linearUp(30)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-vroc-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders vroc + signal paths', () => {
    const { container } = render(
      <ChartLineVrocCross
        data={linearUp(30)}
        length={5}
        signalLength={3}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-cross-vroc"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-signal"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineVrocCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineVrocCross
        data={linearUp(30)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-signal"]',
      ),
    ).toBe(null);
  });
});

describe('VROC Cross integration', () => {
  it('CONST V > 0 yields zero crosses across multiple V and length', () => {
    for (const V of [1, 100, 1000]) {
      for (const L of [3, 5, 7]) {
        const run = runLineVrocCross(constBar(L * 4, 50, V), {
          length: L,
          signalLength: 3,
        });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
        for (let i = L + 2; i < L * 4; i += 1) {
          expect(run.samples[i]?.vroc).toBe(0);
          expect(run.samples[i]?.signal).toBe(0);
        }
      }
    }
  });
});
