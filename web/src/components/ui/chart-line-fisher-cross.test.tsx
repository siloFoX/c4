import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineFisherCross,
  classifyLineFisherCrossRelation,
  computeLineFisherCross,
  computeLineFisherCrossLayout,
  describeLineFisherCrossChart,
  detectLineFisherCrossCrosses,
  getLineFisherCrossFinitePoints,
  normalizeLineFisherCrossLength,
  runLineFisherCross,
  DEFAULT_CHART_LINE_FISHER_CROSS_LENGTH,
  FISHER_MAX_INPUT,
} from './chart-line-fisher-cross';
import type { ChartLineFisherCrossPoint } from './chart-line-fisher-cross';

const constBar = (
  count: number,
  K: number,
): ChartLineFisherCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineFisherCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineFisherCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

describe('getLineFisherCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineFisherCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineFisherCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 0, close: 0 },
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineFisherCrossFinitePoints([
      null as unknown as ChartLineFisherCrossPoint,
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineFisherCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineFisherCrossLength(undefined, 10)).toBe(10);
  });

  it('rejects below 2', () => {
    expect(normalizeLineFisherCrossLength(1, 10)).toBe(10);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineFisherCrossLength(5, 10)).toBe(5);
  });
});

describe('FISHER_MAX_INPUT', () => {
  it('is 0.999', () => {
    expect(FISHER_MAX_INPUT).toBe(0.999);
  });
});

describe('computeLineFisherCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineFisherCross(null);
    expect(ch.fisher).toEqual([]);
  });

  it('CONST h=l yields fisher = signal = 0 bit-exact', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLineFisherCross(constBar(15, K), { length: 3 });
      for (let i = 2; i < 15; i += 1) {
        expect(ch.normalized[i]).toBe(0);
        expect(ch.fisher[i]).toBe(0);
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP fisher converges positive (close at upper end)', () => {
    const ch = computeLineFisherCross(linearUp(30), { length: 5 });
    // After enough bars Fisher should be positive (close hits new highs)
    let saw = false;
    for (let i = 10; i < 30; i += 1) {
      if (ch.fisher[i] != null && (ch.fisher[i] as number) > 0) {
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('LINEAR DOWN fisher converges negative (close at lower end)', () => {
    const ch = computeLineFisherCross(linearDown(30), { length: 5 });
    let saw = false;
    for (let i = 10; i < 30; i += 1) {
      if (ch.fisher[i] != null && (ch.fisher[i] as number) < 0) {
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('clamps normalized to [-MAX_INPUT, MAX_INPUT]', () => {
    const ch = computeLineFisherCross(linearUp(30), { length: 5 });
    for (const v of ch.normalized) {
      if (v != null) {
        expect(v).toBeLessThanOrEqual(FISHER_MAX_INPUT);
        expect(v).toBeGreaterThanOrEqual(-FISHER_MAX_INPUT);
      }
    }
  });

  it('output length matches input', () => {
    const ch = computeLineFisherCross(linearUp(15), { length: 3 });
    expect(ch.fisher.length).toBe(15);
    expect(ch.signal.length).toBe(15);
  });

  it('does not mutate input', () => {
    const data = linearUp(15);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineFisherCross(data, { length: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineFisherCrossRelation', () => {
  it('bullish when fisher > signal', () => {
    expect(classifyLineFisherCrossRelation(1, 0)).toBe('bullish');
  });

  it('bearish when fisher < signal', () => {
    expect(classifyLineFisherCrossRelation(-1, 0)).toBe('bearish');
  });

  it('equal when fisher == signal', () => {
    expect(classifyLineFisherCrossRelation(0, 0)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineFisherCrossRelation(null, 0)).toBe('none');
  });
});

describe('detectLineFisherCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineFisherCrossCrosses([-1, 1], [0, 0])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineFisherCrossCrosses([1, -1], [0, 0])[1]).toBe('down');
  });

  it('warmup null', () => {
    expect(detectLineFisherCrossCrosses([null, 1], [null, 0])).toEqual([
      null,
      null,
    ]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLineFisherCrossCrosses([1, 2, 3], [0, 0, 0]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineFisherCross', () => {
  it('ok=false on short data', () => {
    const run = runLineFisherCross(constBar(3, 50), { length: 5 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineFisherCross(constBar(15, 50), { length: 5 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineFisherCross(constBar(15, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_FISHER_CROSS_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineFisherCross(constBar(15, 50), { length: 5 });
    expect(run.length).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineFisherCrossPoint[] = [
      { x: 2, high: 3, low: 3, close: 3 },
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 1, high: 2, low: 2, close: 2 },
    ];
    const run = runLineFisherCross(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineFisherCross(constBar(20, 50), { length: 3 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('CONST regime is equal after warmup', () => {
    const run = runLineFisherCross(constBar(15, 50), { length: 3 });
    expect(run.samples[5]?.relation).toBe('equal');
  });
});

describe('computeLineFisherCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineFisherCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineFisherCrossLayout({
      data: linearUp(30),
      length: 5,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above osc', () => {
    const layout = computeLineFisherCrossLayout({ data: linearUp(30) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('produces price + fisher + signal paths', () => {
    const layout = computeLineFisherCrossLayout({
      data: linearUp(30),
      length: 5,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.fisherPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('zero inside osc axis', () => {
    const layout = computeLineFisherCrossLayout({
      data: linearUp(30),
      length: 5,
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });
});

describe('describeLineFisherCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineFisherCrossChart([])).toBe('No data');
  });

  it('mentions Fisher Cross', () => {
    expect(describeLineFisherCrossChart(linearUp(15))).toContain(
      'Fisher Cross',
    );
  });

  it('reports length', () => {
    expect(
      describeLineFisherCrossChart(linearUp(15), { length: 7 }),
    ).toContain('length 7');
  });
});

describe('<ChartLineFisherCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineFisherCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Fisher Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFisherCross data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fisher-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('exposes cross counts', () => {
    const { container } = render(
      <ChartLineFisherCross data={constBar(15, 50)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fisher-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-aria-desc"]',
      )?.textContent,
    ).toContain('Fisher Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="fisher"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineFisherCross
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="fisher"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'fisher',
      hidden: true,
    });
  });

  it('hides fisher when controlled', () => {
    const { container } = render(
      <ChartLineFisherCross
        data={linearUp(30)}
        hiddenSeries={['fisher']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-fisher"]',
      ),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineFisherCross
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fisher-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-fisher-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders fisher + signal paths', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-fisher"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-signal"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(
      <ChartLineFisherCross data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineFisherCross
        data={linearUp(30)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fisher-cross-signal"]',
      ),
    ).toBe(null);
  });
});

describe('Fisher Cross integration', () => {
  it('CONST yields zero crosses across multiple K and length', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const L of [3, 5, 10]) {
        const run = runLineFisherCross(constBar(L * 3, K), { length: L });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
        for (let i = L - 1; i < L * 3; i += 1) {
          expect(run.samples[i]?.fisher).toBe(0);
          expect(run.samples[i]?.signal).toBe(0);
          expect(run.samples[i]?.relation).toBe('equal');
        }
      }
    }
  });
});
