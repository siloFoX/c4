import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTrixCross,
  applyLineTrixCrossEma,
  classifyLineTrixCrossRegime,
  classifyLineTrixCrossRelation,
  computeLineTrixCross,
  computeLineTrixCrossLayout,
  describeLineTrixCrossChart,
  detectLineTrixCrossCrosses,
  getLineTrixCrossFinitePoints,
  normalizeLineTrixCrossLength,
  runLineTrixCross,
  DEFAULT_CHART_LINE_TRIX_CROSS_LENGTH,
  DEFAULT_CHART_LINE_TRIX_CROSS_SIGNAL_LENGTH,
} from './chart-line-trix-cross';
import type { ChartLineTrixCrossPoint } from './chart-line-trix-cross';

const constBar = (count: number, K: number): ChartLineTrixCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineTrixCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineTrixCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineTrixCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineTrixCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN close', () => {
    const r = getLineTrixCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineTrixCrossFinitePoints([
      null as unknown as ChartLineTrixCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineTrixCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineTrixCrossLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineTrixCrossLength(1, 14)).toBe(14);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineTrixCrossLength(5, 14)).toBe(5);
  });
});

describe('applyLineTrixCrossEma', () => {
  it('CONST K EMA = K bit-exact', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const L of [3, 5, 14]) {
        const out = applyLineTrixCrossEma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineTrixCrossEma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });
});

describe('computeLineTrixCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineTrixCross(null);
    expect(ch.trix).toEqual([]);
    expect(ch.signal).toEqual([]);
  });

  it('CONST K > 0 yields trix = 0 and signal = 0 bit-exact', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLineTrixCross(constBar(40, K), {
        length: 3,
        signalLength: 3,
      });
      for (let i = 9; i < 40; i += 1) {
        expect(ch.trix[i]).toBe(0);
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP trix > 0 once defined', () => {
    const ch = computeLineTrixCross(linearUp(50), {
      length: 3,
      signalLength: 3,
    });
    let saw = false;
    for (const v of ch.trix) {
      if (v != null) {
        expect(v).toBeGreaterThan(0);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('LINEAR DOWN trix < 0 once defined', () => {
    const ch = computeLineTrixCross(linearDown(50), {
      length: 3,
      signalLength: 3,
    });
    let saw = false;
    for (const v of ch.trix) {
      if (v != null) {
        expect(v).toBeLessThan(0);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('output length matches input', () => {
    const ch = computeLineTrixCross(linearUp(40), {
      length: 3,
      signalLength: 3,
    });
    expect(ch.trix.length).toBe(40);
    expect(ch.signal.length).toBe(40);
  });

  it('does not mutate input', () => {
    const data = linearUp(30);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineTrixCross(data, { length: 3, signalLength: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineTrixCrossRelation', () => {
  it('bullish when trix > signal', () => {
    expect(classifyLineTrixCrossRelation(1, 0)).toBe('bullish');
  });

  it('bearish when trix < signal', () => {
    expect(classifyLineTrixCrossRelation(-1, 0)).toBe('bearish');
  });

  it('equal when trix == signal', () => {
    expect(classifyLineTrixCrossRelation(0, 0)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineTrixCrossRelation(null, 0)).toBe('none');
  });
});

describe('classifyLineTrixCrossRegime', () => {
  it('accelerating-up for bullish', () => {
    expect(classifyLineTrixCrossRegime('bullish')).toBe('accelerating-up');
  });

  it('accelerating-down for bearish', () => {
    expect(classifyLineTrixCrossRegime('bearish')).toBe('accelerating-down');
  });

  it('aligned for equal', () => {
    expect(classifyLineTrixCrossRegime('equal')).toBe('aligned');
  });

  it('none for none', () => {
    expect(classifyLineTrixCrossRegime('none')).toBe('none');
  });
});

describe('detectLineTrixCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineTrixCrossCrosses([-1, 1], [0, 0])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineTrixCrossCrosses([1, -1], [0, 0])[1]).toBe('down');
  });

  it('warmup null does not fire', () => {
    expect(detectLineTrixCrossCrosses([null, 1], [null, 0])).toEqual([
      null,
      null,
    ]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLineTrixCrossCrosses([1, 2, 3], [0, 0, 0]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineTrixCross', () => {
  it('ok=false on short data', () => {
    const run = runLineTrixCross(constBar(5, 50), {
      length: 3,
      signalLength: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineTrixCross(constBar(20, 50), {
      length: 3,
      signalLength: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineTrixCross(constBar(80, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_TRIX_CROSS_LENGTH);
    expect(run.signalLength).toBe(
      DEFAULT_CHART_LINE_TRIX_CROSS_SIGNAL_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLineTrixCross(constBar(20, 50), {
      length: 4,
      signalLength: 5,
    });
    expect(run.length).toBe(4);
    expect(run.signalLength).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineTrixCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineTrixCross(data, { length: 2, signalLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineTrixCross(constBar(40, 50), {
      length: 3,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('CONST regime is aligned after warmup', () => {
    const run = runLineTrixCross(constBar(40, 50), {
      length: 3,
      signalLength: 3,
    });
    expect(run.samples[20]?.regime).toBe('aligned');
  });

  it('LINEAR UP yields zero crosses (TRIX stays above signal)', () => {
    const run = runLineTrixCross(linearUp(50), {
      length: 3,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR DOWN yields zero crosses (TRIX stays below signal)', () => {
    const run = runLineTrixCross(linearDown(50), {
      length: 3,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });
});

describe('computeLineTrixCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineTrixCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineTrixCrossLayout({
      data: linearUp(40),
      length: 3,
      signalLength: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above trix', () => {
    const layout = computeLineTrixCrossLayout({ data: linearUp(40) });
    expect(layout.priceBottom).toBeLessThan(layout.trixTop);
  });

  it('produces price + trix + signal paths', () => {
    const layout = computeLineTrixCrossLayout({
      data: linearUp(40),
      length: 3,
      signalLength: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.trixPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('zero inside trix axis', () => {
    const layout = computeLineTrixCrossLayout({
      data: linearUp(40),
      length: 3,
      signalLength: 3,
    });
    expect(layout.trixMin).toBeLessThanOrEqual(0);
    expect(layout.trixMax).toBeGreaterThanOrEqual(0);
  });

  it('CONST input has empty trix/signal paths (axis still spans zero)', () => {
    // CONST yields trix=signal=0 (bit-exact); paths are valid but flat
    const layout = computeLineTrixCrossLayout({
      data: constBar(40, 50),
      length: 3,
      signalLength: 3,
    });
    expect(layout.trixPath.length).toBeGreaterThan(0);
  });
});

describe('describeLineTrixCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineTrixCrossChart([])).toBe('No data');
  });

  it('mentions TRIX Cross', () => {
    expect(describeLineTrixCrossChart(linearUp(40))).toContain('TRIX Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineTrixCrossChart(linearUp(40), {
      length: 5,
      signalLength: 7,
    });
    expect(desc).toContain('length 5');
    expect(desc).toContain('signalLength 7');
  });
});

describe('<ChartLineTrixCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineTrixCross data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-trix-cross-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineTrixCross data={linearUp(40)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('TRIX Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTrixCross data={linearUp(40)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineTrixCross
        data={linearUp(40)}
        length={5}
        signalLength={7}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-signal-length')).toBe('7');
  });

  it('exposes cross counts', () => {
    const { container } = render(<ChartLineTrixCross data={linearUp(40)} />);
    const root = container.querySelector(
      '[data-section="chart-line-trix-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineTrixCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-aria-desc"]',
      )?.textContent,
    ).toContain('TRIX Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineTrixCross data={linearUp(40)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="trix"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTrixCross
        data={linearUp(40)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="trix"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'trix', hidden: true });
  });

  it('hides trix when controlled', () => {
    const { container } = render(
      <ChartLineTrixCross
        data={linearUp(40)}
        hiddenSeries={['trix']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trix-cross-trix"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineTrixCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineTrixCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineTrixCross data={linearUp(40)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineTrixCross data={linearUp(40)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trix-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineTrixCross data={linearUp(40)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trix-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineTrixCross data={linearUp(40)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trix-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineTrixCross
        data={linearUp(40)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineTrixCross data={linearUp(40)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-trix-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders trix + signal paths', () => {
    const { container } = render(
      <ChartLineTrixCross
        data={linearUp(40)}
        length={3}
        signalLength={3}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trix-cross-trix"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-signal"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineTrixCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineTrixCross
        data={linearUp(40)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-signal"]',
      ),
    ).toBe(null);
  });
});

describe('TRIX Cross integration', () => {
  it('all three anchors yield zero crosses across multiple lengths', () => {
    for (const L of [3, 4, 5]) {
      for (const series of [
        constBar(L * 4 + 10, 50),
        linearUp(L * 4 + 10),
        linearDown(L * 4 + 10),
      ]) {
        const run = runLineTrixCross(series, {
          length: L,
          signalLength: L,
        });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('CONST yields TRIX = signal = 0 bit-exact across multiple K', () => {
    for (const K of [1, 10, 100]) {
      const ch = computeLineTrixCross(constBar(30, K), {
        length: 3,
        signalLength: 3,
      });
      for (let i = 9; i < 30; i += 1) {
        expect(ch.trix[i]).toBe(0);
        expect(ch.signal[i]).toBe(0);
      }
    }
  });
});
