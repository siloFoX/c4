import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLinePpoCross,
  applyLinePpoCrossEma,
  classifyLinePpoCrossBias,
  classifyLinePpoCrossRelation,
  computeLinePpoCross,
  computeLinePpoCrossLayout,
  describeLinePpoCrossChart,
  detectLinePpoCrossCrosses,
  getLinePpoCrossFinitePoints,
  normalizeLinePpoCrossLength,
  runLinePpoCross,
  DEFAULT_CHART_LINE_PPO_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_PPO_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_PPO_CROSS_SIGNAL_LENGTH,
} from './chart-line-ppo-cross';
import type { ChartLinePpoCrossPoint } from './chart-line-ppo-cross';

const constBar = (count: number, K: number): ChartLinePpoCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLinePpoCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLinePpoCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLinePpoCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLinePpoCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLinePpoCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLinePpoCrossFinitePoints([
      null as unknown as ChartLinePpoCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLinePpoCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLinePpoCrossLength(undefined, 12)).toBe(12);
  });

  it('rejects below 2', () => {
    expect(normalizeLinePpoCrossLength(1, 12)).toBe(12);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLinePpoCrossLength(5, 12)).toBe(5);
  });
});

describe('applyLinePpoCrossEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100]) {
      const out = applyLinePpoCrossEma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('computeLinePpoCross', () => {
  it('returns empty for null', () => {
    const ch = computeLinePpoCross(null);
    expect(ch.ppo).toEqual([]);
    expect(ch.signal).toEqual([]);
  });

  it('CONST K > 0 yields PPO = 0 and signal = 0 bit-exact', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLinePpoCross(constBar(40, K), {
        fastLength: 3,
        slowLength: 5,
        signalLength: 3,
      });
      for (let i = 9; i < 40; i += 1) {
        expect(ch.ppo[i]).toBe(0);
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 yields PPO = null (divide by zero)', () => {
    const ch = computeLinePpoCross(constBar(40, 0), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    for (let i = 9; i < 40; i += 1) {
      expect(ch.ppo[i]).toBe(null);
      expect(ch.signal[i]).toBe(null);
    }
  });

  it('LINEAR UP PPO > 0 once defined', () => {
    const ch = computeLinePpoCross(linearUp(40), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    let saw = false;
    for (const v of ch.ppo) {
      if (v != null) {
        expect(v).toBeGreaterThan(0);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('LINEAR DOWN PPO < 0 once defined', () => {
    const ch = computeLinePpoCross(linearDown(40), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    let saw = false;
    for (const v of ch.ppo) {
      if (v != null) {
        expect(v).toBeLessThan(0);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('output length matches input', () => {
    const ch = computeLinePpoCross(linearUp(40), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(ch.ppo.length).toBe(40);
    expect(ch.signal.length).toBe(40);
  });

  it('does not mutate input', () => {
    const data = linearUp(30);
    const snap = JSON.parse(JSON.stringify(data));
    computeLinePpoCross(data, {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(data).toEqual(snap);
  });
});

describe('classifyLinePpoCrossRelation', () => {
  it('bullish when ppo > signal', () => {
    expect(classifyLinePpoCrossRelation(1, 0)).toBe('bullish');
  });

  it('bearish when ppo < signal', () => {
    expect(classifyLinePpoCrossRelation(-1, 0)).toBe('bearish');
  });

  it('equal when ppo == signal', () => {
    expect(classifyLinePpoCrossRelation(0, 0)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLinePpoCrossRelation(null, 0)).toBe('none');
  });
});

describe('classifyLinePpoCrossBias', () => {
  it('null on null', () => {
    expect(classifyLinePpoCrossBias(null)).toBe(null);
  });

  it('bullish when ppo > 0', () => {
    expect(classifyLinePpoCrossBias(1)).toBe('bullish');
  });

  it('bearish when ppo < 0', () => {
    expect(classifyLinePpoCrossBias(-1)).toBe('bearish');
  });

  it('neutral at exact zero', () => {
    expect(classifyLinePpoCrossBias(0)).toBe('neutral');
  });
});

describe('detectLinePpoCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLinePpoCrossCrosses([-1, 1], [0, 0])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLinePpoCrossCrosses([1, -1], [0, 0])[1]).toBe('down');
  });

  it('warmup null', () => {
    expect(detectLinePpoCrossCrosses([null, 1], [null, 0])).toEqual([
      null,
      null,
    ]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLinePpoCrossCrosses([1, 2, 3], [0, 0, 0]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLinePpoCross', () => {
  it('ok=false on short data', () => {
    const run = runLinePpoCross(constBar(5, 50), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLinePpoCross(constBar(20, 50), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLinePpoCross(constBar(80, 50));
    expect(run.fastLength).toBe(DEFAULT_CHART_LINE_PPO_CROSS_FAST_LENGTH);
    expect(run.slowLength).toBe(DEFAULT_CHART_LINE_PPO_CROSS_SLOW_LENGTH);
    expect(run.signalLength).toBe(
      DEFAULT_CHART_LINE_PPO_CROSS_SIGNAL_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLinePpoCross(constBar(20, 50), {
      fastLength: 4,
      slowLength: 8,
      signalLength: 5,
    });
    expect(run.fastLength).toBe(4);
    expect(run.slowLength).toBe(8);
    expect(run.signalLength).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLinePpoCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLinePpoCross(data, {
      fastLength: 2,
      slowLength: 3,
      signalLength: 2,
    });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLinePpoCross(constBar(40, 50), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR UP yields zero crosses', () => {
    const run = runLinePpoCross(linearUp(40), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR DOWN yields zero crosses', () => {
    const run = runLinePpoCross(linearDown(40), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });
});

describe('computeLinePpoCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLinePpoCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLinePpoCrossLayout({
      data: linearUp(40),
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above osc', () => {
    const layout = computeLinePpoCrossLayout({ data: linearUp(40) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('produces price + ppo + signal paths', () => {
    const layout = computeLinePpoCrossLayout({
      data: linearUp(40),
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.ppoPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('zero inside osc axis', () => {
    const layout = computeLinePpoCrossLayout({
      data: linearUp(40),
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });

  it('CONST K = 0 produces empty ppo/signal paths', () => {
    const layout = computeLinePpoCrossLayout({
      data: constBar(40, 0),
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(layout.ppoPath).toBe('');
    expect(layout.signalPath).toBe('');
  });
});

describe('describeLinePpoCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLinePpoCrossChart([])).toBe('No data');
  });

  it('mentions PPO Cross', () => {
    expect(describeLinePpoCrossChart(linearUp(40))).toContain('PPO Cross');
  });

  it('reports parameters', () => {
    const desc = describeLinePpoCrossChart(linearUp(40), {
      fastLength: 4,
      slowLength: 8,
      signalLength: 5,
    });
    expect(desc).toContain('fastLength 4');
    expect(desc).toContain('slowLength 8');
    expect(desc).toContain('signalLength 5');
  });
});

describe('<ChartLinePpoCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLinePpoCross data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-ppo-cross-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLinePpoCross data={linearUp(40)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('PPO Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePpoCross data={linearUp(40)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLinePpoCross
        data={linearUp(40)}
        fastLength={4}
        slowLength={8}
        signalLength={5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ppo-cross"]',
    );
    expect(root?.getAttribute('data-fast-length')).toBe('4');
    expect(root?.getAttribute('data-slow-length')).toBe('8');
    expect(root?.getAttribute('data-signal-length')).toBe('5');
  });

  it('exposes cross counts', () => {
    const { container } = render(<ChartLinePpoCross data={linearUp(40)} />);
    const root = container.querySelector(
      '[data-section="chart-line-ppo-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLinePpoCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-cross-aria-desc"]',
      )?.textContent,
    ).toContain('PPO Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLinePpoCross data={linearUp(40)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="ppo"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLinePpoCross
        data={linearUp(40)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="ppo"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'ppo', hidden: true });
  });

  it('hides ppo when controlled', () => {
    const { container } = render(
      <ChartLinePpoCross
        data={linearUp(40)}
        hiddenSeries={['ppo']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-cross-ppo"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLinePpoCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLinePpoCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLinePpoCross data={linearUp(40)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLinePpoCross data={linearUp(40)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLinePpoCross data={linearUp(40)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLinePpoCross data={linearUp(40)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLinePpoCross
        data={linearUp(40)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ppo-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLinePpoCross data={linearUp(40)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-ppo-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders ppo + signal paths', () => {
    const { container } = render(
      <ChartLinePpoCross
        data={linearUp(40)}
        fastLength={3}
        slowLength={5}
        signalLength={3}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ppo-cross-ppo"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-cross-signal"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLinePpoCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLinePpoCross
        data={linearUp(40)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ppo-cross-signal"]',
      ),
    ).toBe(null);
  });
});

describe('PPO Cross integration', () => {
  it('CONST K > 0 PPO and signal = 0 bit-exact across multiple K', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLinePpoCross(constBar(30, K), {
        fastLength: 3,
        slowLength: 5,
        signalLength: 3,
      });
      for (let i = 9; i < 30; i += 1) {
        expect(ch.ppo[i]).toBe(0);
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('all three anchors yield zero crosses across multiple lengths', () => {
    for (const [F, S, G] of [
      [3, 5, 3],
      [4, 8, 4],
      [5, 10, 5],
    ] as const) {
      for (const series of [
        constBar(50, 50),
        linearUp(50),
        linearDown(50),
      ]) {
        const run = runLinePpoCross(series, {
          fastLength: F,
          slowLength: S,
          signalLength: G,
        });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });
});
