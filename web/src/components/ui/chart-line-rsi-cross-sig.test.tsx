import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRsiCrossSig,
  applyLineRsiCrossSigEma,
  applyLineRsiCrossSigGainLoss,
  applyLineRsiCrossSigRsi,
  applyLineRsiCrossSigWilder,
  classifyLineRsiCrossSigRegime,
  classifyLineRsiCrossSigRelation,
  computeLineRsiCrossSig,
  computeLineRsiCrossSigLayout,
  describeLineRsiCrossSigChart,
  detectLineRsiCrossSigCrosses,
  getLineRsiCrossSigFinitePoints,
  normalizeLineRsiCrossSigLength,
  runLineRsiCrossSig,
  DEFAULT_CHART_LINE_RSI_CROSS_SIG_RSI_LENGTH,
  DEFAULT_CHART_LINE_RSI_CROSS_SIG_SIGNAL_LENGTH,
} from './chart-line-rsi-cross-sig';
import type { ChartLineRsiCrossSigPoint } from './chart-line-rsi-cross-sig';

const constBar = (count: number, K: number): ChartLineRsiCrossSigPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineRsiCrossSigPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineRsiCrossSigPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineRsiCrossSigFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineRsiCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineRsiCrossSigFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineRsiCrossSigFinitePoints([
      null as unknown as ChartLineRsiCrossSigPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineRsiCrossSigLength', () => {
  it('uses default', () => {
    expect(normalizeLineRsiCrossSigLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineRsiCrossSigLength(1, 14)).toBe(14);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineRsiCrossSigLength(5, 14)).toBe(5);
  });
});

describe('applyLineRsiCrossSigWilder', () => {
  it('CONST K Wilder is K bit-exact', () => {
    for (const K of [0, 1, 5, 100]) {
      const out = applyLineRsiCrossSigWilder(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('applyLineRsiCrossSigEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      const out = applyLineRsiCrossSigEma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('applyLineRsiCrossSigGainLoss', () => {
  it('first bar null', () => {
    const { gain, loss } = applyLineRsiCrossSigGainLoss([5, 6]);
    expect(gain[0]).toBe(null);
    expect(loss[0]).toBe(null);
  });

  it('positive change yields gain', () => {
    const { gain, loss } = applyLineRsiCrossSigGainLoss([5, 7]);
    expect(gain[1]).toBe(2);
    expect(loss[1]).toBe(0);
  });

  it('negative change yields loss', () => {
    const { gain, loss } = applyLineRsiCrossSigGainLoss([5, 2]);
    expect(gain[1]).toBe(0);
    expect(loss[1]).toBe(3);
  });
});

describe('applyLineRsiCrossSigRsi', () => {
  it('neutral fallback at 50', () => {
    expect(applyLineRsiCrossSigRsi([0], [0])).toEqual([50]);
  });

  it('loss=0 yields 100', () => {
    expect(applyLineRsiCrossSigRsi([1], [0])).toEqual([100]);
  });

  it('gain=0 yields 0', () => {
    expect(applyLineRsiCrossSigRsi([0], [1])).toEqual([0]);
  });
});

describe('computeLineRsiCrossSig', () => {
  it('returns empty for null', () => {
    const ch = computeLineRsiCrossSig(null);
    expect(ch.rsi).toEqual([]);
    expect(ch.signal).toEqual([]);
  });

  it('CONST yields rsi = signal = 50 bit-exact', () => {
    const ch = computeLineRsiCrossSig(constBar(30, 50), {
      rsiLength: 3,
      signalLength: 3,
    });
    for (let i = 5; i < 30; i += 1) {
      expect(ch.rsi[i]).toBe(50);
      expect(ch.signal[i]).toBe(50);
    }
  });

  it('LINEAR UP yields rsi = signal = 100 bit-exact', () => {
    const ch = computeLineRsiCrossSig(linearUp(30), {
      rsiLength: 3,
      signalLength: 3,
    });
    for (let i = 5; i < 30; i += 1) {
      expect(ch.rsi[i]).toBe(100);
      expect(ch.signal[i]).toBe(100);
    }
  });

  it('LINEAR DOWN yields rsi = signal = 0 bit-exact', () => {
    const ch = computeLineRsiCrossSig(linearDown(30), {
      rsiLength: 3,
      signalLength: 3,
    });
    for (let i = 5; i < 30; i += 1) {
      expect(ch.rsi[i]).toBe(0);
      expect(ch.signal[i]).toBe(0);
    }
  });

  it('output length matches input', () => {
    const ch = computeLineRsiCrossSig(linearUp(30), {
      rsiLength: 3,
      signalLength: 3,
    });
    expect(ch.rsi.length).toBe(30);
    expect(ch.signal.length).toBe(30);
  });

  it('does not mutate input', () => {
    const data = linearUp(20);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineRsiCrossSig(data, { rsiLength: 3, signalLength: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineRsiCrossSigRelation', () => {
  it('bullish when rsi > signal', () => {
    expect(classifyLineRsiCrossSigRelation(60, 50)).toBe('bullish');
  });

  it('bearish when rsi < signal', () => {
    expect(classifyLineRsiCrossSigRelation(40, 50)).toBe('bearish');
  });

  it('equal when rsi == signal', () => {
    expect(classifyLineRsiCrossSigRelation(50, 50)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineRsiCrossSigRelation(null, 50)).toBe('none');
  });
});

describe('classifyLineRsiCrossSigRegime', () => {
  it('accelerating-up for bullish', () => {
    expect(classifyLineRsiCrossSigRegime('bullish')).toBe('accelerating-up');
  });

  it('accelerating-down for bearish', () => {
    expect(classifyLineRsiCrossSigRegime('bearish')).toBe('accelerating-down');
  });

  it('aligned for equal', () => {
    expect(classifyLineRsiCrossSigRegime('equal')).toBe('aligned');
  });

  it('none for none', () => {
    expect(classifyLineRsiCrossSigRegime('none')).toBe('none');
  });
});

describe('detectLineRsiCrossSigCrosses', () => {
  it('up cross', () => {
    expect(detectLineRsiCrossSigCrosses([40, 60], [50, 50])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineRsiCrossSigCrosses([60, 40], [50, 50])[1]).toBe('down');
  });

  it('warmup null', () => {
    expect(
      detectLineRsiCrossSigCrosses([null, 60], [null, 50]),
    ).toEqual([null, null]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLineRsiCrossSigCrosses([60, 70, 80], [50, 50, 50]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineRsiCrossSig', () => {
  it('ok=false on short data', () => {
    const run = runLineRsiCrossSig(constBar(5, 50), {
      rsiLength: 3,
      signalLength: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineRsiCrossSig(constBar(15, 50), {
      rsiLength: 3,
      signalLength: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineRsiCrossSig(constBar(40, 50));
    expect(run.rsiLength).toBe(DEFAULT_CHART_LINE_RSI_CROSS_SIG_RSI_LENGTH);
    expect(run.signalLength).toBe(
      DEFAULT_CHART_LINE_RSI_CROSS_SIG_SIGNAL_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLineRsiCrossSig(constBar(20, 50), {
      rsiLength: 4,
      signalLength: 5,
    });
    expect(run.rsiLength).toBe(4);
    expect(run.signalLength).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineRsiCrossSigPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineRsiCrossSig(data, {
      rsiLength: 2,
      signalLength: 2,
    });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineRsiCrossSig(constBar(30, 50), {
      rsiLength: 3,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR UP yields zero crosses', () => {
    const run = runLineRsiCrossSig(linearUp(30), {
      rsiLength: 3,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR DOWN yields zero crosses', () => {
    const run = runLineRsiCrossSig(linearDown(30), {
      rsiLength: 3,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });
});

describe('computeLineRsiCrossSigLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineRsiCrossSigLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineRsiCrossSigLayout({
      data: linearUp(30),
      rsiLength: 3,
      signalLength: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above osc', () => {
    const layout = computeLineRsiCrossSigLayout({ data: linearUp(30) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('osc axis fixed to [0, 100]', () => {
    const layout = computeLineRsiCrossSigLayout({ data: linearUp(30) });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('produces price + rsi + signal paths', () => {
    const layout = computeLineRsiCrossSigLayout({
      data: linearUp(30),
      rsiLength: 3,
      signalLength: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.rsiPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });
});

describe('describeLineRsiCrossSigChart', () => {
  it('No data on empty', () => {
    expect(describeLineRsiCrossSigChart([])).toBe('No data');
  });

  it('mentions RSI Cross Signal', () => {
    expect(describeLineRsiCrossSigChart(linearUp(30))).toContain(
      'RSI Cross Signal',
    );
  });

  it('reports parameters', () => {
    const desc = describeLineRsiCrossSigChart(linearUp(30), {
      rsiLength: 4,
      signalLength: 5,
    });
    expect(desc).toContain('rsiLength 4');
    expect(desc).toContain('signalLength 5');
  });
});

describe('<ChartLineRsiCrossSig />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineRsiCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineRsiCrossSig data={linearUp(30)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('RSI Cross Signal');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRsiCrossSig data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineRsiCrossSig
        data={linearUp(30)}
        rsiLength={5}
        signalLength={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rsi-cross-sig"]',
    );
    expect(root?.getAttribute('data-rsi-length')).toBe('5');
    expect(root?.getAttribute('data-signal-length')).toBe('3');
  });

  it('exposes cross counts', () => {
    const { container } = render(<ChartLineRsiCrossSig data={linearUp(30)} />);
    const root = container.querySelector(
      '[data-section="chart-line-rsi-cross-sig"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineRsiCrossSig data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-aria-desc"]',
      )?.textContent,
    ).toContain('RSI Cross Signal');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineRsiCrossSig data={linearUp(30)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="rsi"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineRsiCrossSig
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="rsi"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'rsi', hidden: true });
  });

  it('hides rsi when controlled', () => {
    const { container } = render(
      <ChartLineRsiCrossSig
        data={linearUp(30)}
        hiddenSeries={['rsi']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-sig-rsi"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineRsiCrossSig data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders midline by default', () => {
    const { container } = render(<ChartLineRsiCrossSig data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-midline"]',
      ),
    ).toBeTruthy();
  });

  it('hides midline when showMidline=false', () => {
    const { container } = render(
      <ChartLineRsiCrossSig data={linearUp(30)} showMidline={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-midline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineRsiCrossSig data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineRsiCrossSig data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineRsiCrossSig data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineRsiCrossSig
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rsi-cross-sig"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineRsiCrossSig data={linearUp(30)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-rsi-cross-sig-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders rsi + signal paths', () => {
    const { container } = render(
      <ChartLineRsiCrossSig
        data={linearUp(30)}
        rsiLength={3}
        signalLength={3}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-sig-rsi"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-signal"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineRsiCrossSig data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineRsiCrossSig
        data={linearUp(30)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-sig-signal"]',
      ),
    ).toBe(null);
  });
});

describe('RSI Cross Signal integration', () => {
  it('three anchors all yield zero crosses bit-exact', () => {
    for (const [R, S] of [
      [3, 3],
      [4, 5],
      [5, 7],
    ] as const) {
      for (const series of [
        constBar(40, 50),
        linearUp(40),
        linearDown(40),
      ]) {
        const run = runLineRsiCrossSig(series, {
          rsiLength: R,
          signalLength: S,
        });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('CONST RSI = signal = 50 bit-exact across K and lengths', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const [R, S] of [
        [3, 3],
        [4, 5],
      ] as const) {
        const ch = computeLineRsiCrossSig(constBar(R + S + 10, K), {
          rsiLength: R,
          signalLength: S,
        });
        for (let i = R + S - 1; i < R + S + 10; i += 1) {
          expect(ch.rsi[i]).toBe(50);
          expect(ch.signal[i]).toBe(50);
        }
      }
    }
  });
});
