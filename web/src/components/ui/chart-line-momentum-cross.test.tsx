import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMomentumCross,
  classifyLineMomentumCrossZone,
  computeLineMomentumCross,
  computeLineMomentumCrossLayout,
  describeLineMomentumCrossChart,
  detectLineMomentumCrossCrosses,
  getLineMomentumCrossFinitePoints,
  normalizeLineMomentumCrossLength,
  runLineMomentumCross,
  DEFAULT_CHART_LINE_MOMENTUM_CROSS_LENGTH,
} from './chart-line-momentum-cross';
import type { ChartLineMomentumCrossPoint } from './chart-line-momentum-cross';

const constBar = (count: number, K: number): ChartLineMomentumCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineMomentumCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineMomentumCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

const stepUp = (count: number, K1: number, K2: number, n: number) =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i < n ? K1 : K2,
  }));

describe('getLineMomentumCrossFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineMomentumCrossFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineMomentumCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineMomentumCrossFinitePoints([
      null as unknown as ChartLineMomentumCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineMomentumCrossLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineMomentumCrossLength(undefined, 10)).toBe(10);
  });

  it('accepts 1', () => {
    expect(normalizeLineMomentumCrossLength(1, 10)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineMomentumCrossLength(0, 10)).toBe(10);
  });

  it('floors fractional', () => {
    expect(normalizeLineMomentumCrossLength(7.7, 10)).toBe(7);
  });
});

describe('computeLineMomentumCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineMomentumCross(null);
    expect(ch.momentum).toEqual([]);
  });

  it('CONST close yields momentum = 0 bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(20, K);
      const ch = computeLineMomentumCross(series, { length: 4 });
      for (let i = 4; i < 20; i += 1) {
        expect(ch.momentum[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP yields momentum = L bit-exact', () => {
    for (const L of [1, 2, 4, 7]) {
      const series = linearUp(20);
      const ch = computeLineMomentumCross(series, { length: L });
      for (let i = L; i < 20; i += 1) {
        expect(ch.momentum[i]).toBe(L);
      }
    }
  });

  it('LINEAR DOWN yields momentum = -L bit-exact', () => {
    for (const L of [1, 2, 4, 7]) {
      const series = linearDown(20);
      const ch = computeLineMomentumCross(series, { length: L });
      for (let i = L; i < 20; i += 1) {
        expect(ch.momentum[i]).toBe(-L);
      }
    }
  });

  it('warmup region is null', () => {
    const series = linearUp(20);
    const ch = computeLineMomentumCross(series, { length: 4 });
    expect(ch.momentum[0]).toBe(null);
    expect(ch.momentum[3]).toBe(null);
    expect(ch.momentum[4]).toBe(4);
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineMomentumCross(series, { length: 4 });
    expect(ch.momentum.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineMomentumCross(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('prior values capture close[i - length]', () => {
    const series = linearUp(10);
    const ch = computeLineMomentumCross(series, { length: 3 });
    expect(ch.prior[3]).toBe(1);
    expect(ch.prior[5]).toBe(3);
  });
});

describe('classifyLineMomentumCrossZone', () => {
  it('classifies positive', () => {
    expect(classifyLineMomentumCrossZone(1)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineMomentumCrossZone(-1)).toBe('negative');
  });

  it('classifies zero', () => {
    expect(classifyLineMomentumCrossZone(0)).toBe('zero');
  });

  it('returns none for null', () => {
    expect(classifyLineMomentumCrossZone(null)).toBe('none');
  });
});

describe('detectLineMomentumCrossCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineMomentumCrossCrosses([null, null])).toEqual([
      null,
      null,
    ]);
  });

  it('flags up cross when momentum crosses above zero', () => {
    const ev = detectLineMomentumCrossCrosses([null, -1, 2]);
    expect(ev[2]).toBe('up');
  });

  it('flags down cross when momentum crosses below zero', () => {
    const ev = detectLineMomentumCrossCrosses([null, 1, -2]);
    expect(ev[2]).toBe('down');
  });

  it('flags up cross from zero to positive', () => {
    const ev = detectLineMomentumCrossCrosses([null, 0, 1]);
    expect(ev[2]).toBe('up');
  });

  it('flags down cross from zero to negative', () => {
    const ev = detectLineMomentumCrossCrosses([null, 0, -1]);
    expect(ev[2]).toBe('down');
  });

  it('does not flag from positive to zero', () => {
    const ev = detectLineMomentumCrossCrosses([null, 1, 0]);
    expect(ev[2]).toBe(null);
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineMomentumCrossCrosses([null, 2])[1]).toBe(null);
  });
});

describe('runLineMomentumCross', () => {
  it('marks ok=false for short data', () => {
    const run = runLineMomentumCross(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineMomentumCross(constBar(5, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineMomentumCross(constBar(20, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_MOMENTUM_CROSS_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineMomentumCross(constBar(20, 10), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineMomentumCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineMomentumCross(data, { length: 1 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close yields zero crosses', () => {
    const run = runLineMomentumCross(constBar(20, 10), { length: 4 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR UP yields zero crosses', () => {
    const run = runLineMomentumCross(linearUp(20), { length: 4 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR DOWN yields zero crosses', () => {
    const run = runLineMomentumCross(linearDown(20), { length: 4 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('STEP up yields exactly one up cross at step index', () => {
    const run = runLineMomentumCross(stepUp(20, 1, 5, 10), { length: 4 });
    expect(run.upCrossCount).toBe(1);
    expect(run.downCrossCount).toBe(0);
    const upIdx = run.samples.findIndex((s) => s.crossed === 'up');
    expect(upIdx).toBe(10);
  });

  it('STEP down yields exactly one down cross at step index', () => {
    const run = runLineMomentumCross(stepUp(20, 5, 1, 10), { length: 4 });
    expect(run.downCrossCount).toBe(1);
    expect(run.upCrossCount).toBe(0);
    const downIdx = run.samples.findIndex((s) => s.crossed === 'down');
    expect(downIdx).toBe(10);
  });

  it('STEP momentum returns to zero after lookback expires', () => {
    const run = runLineMomentumCross(stepUp(20, 1, 5, 10), { length: 4 });
    // close[14] = 5, close[10] = 5 -> momentum = 0
    expect(run.samples[14]?.momentum).toBe(0);
  });
});

describe('computeLineMomentumCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineMomentumCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineMomentumCrossLayout({ data: linearUp(20) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above momentum', () => {
    const layout = computeLineMomentumCrossLayout({ data: linearUp(20) });
    expect(layout.priceBottom).toBeLessThan(layout.momTop);
  });

  it('mom axis includes zero', () => {
    const layout = computeLineMomentumCrossLayout({ data: linearUp(20) });
    expect(layout.momMin).toBeLessThanOrEqual(0);
    expect(layout.momMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineMomentumCrossLayout({ data: linearUp(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces cross markers for STEP', () => {
    const layout = computeLineMomentumCrossLayout({
      data: stepUp(20, 1, 5, 10),
      length: 4,
    });
    expect(layout.markers.length).toBe(1);
    expect(layout.markers[0]?.kind).toBe('up');
  });

  it('no markers for CONST', () => {
    const layout = computeLineMomentumCrossLayout({
      data: constBar(20, 10),
    });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLineMomentumCrossChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineMomentumCrossChart([])).toBe('No data');
  });

  it('mentions Momentum Cross', () => {
    const desc = describeLineMomentumCrossChart(linearUp(20));
    expect(desc).toContain('Momentum Cross');
  });

  it('reports length', () => {
    const desc = describeLineMomentumCrossChart(linearUp(20), {
      length: 7,
    });
    expect(desc).toContain('length 7');
  });
});

describe('<ChartLineMomentumCross />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineMomentumCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Momentum Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMomentumCross data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes total-points and cross counts', () => {
    const { container } = render(
      <ChartLineMomentumCross
        data={stepUp(20, 1, 5, 10)}
        length={4}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-cross"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
    expect(root?.getAttribute('data-up-cross-count')).toBe('1');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-aria-desc"]',
      )?.textContent,
    ).toContain('Momentum Cross');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="momentum"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMomentumCross
        data={linearUp(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="momentum"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'momentum',
      hidden: true,
    });
  });

  it('hides momentum when controlled hidden', () => {
    const { container } = render(
      <ChartLineMomentumCross
        data={linearUp(20)}
        hiddenSeries={['momentum']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineMomentumCross
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-momentum-cross-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the momentum line by default', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineMomentumCross data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders cross markers for STEP', () => {
    const { container } = render(
      <ChartLineMomentumCross
        data={stepUp(20, 1, 5, 10)}
        length={4}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-momentum-cross-marker"]',
    );
    expect(markers.length).toBe(1);
    expect(markers[0]?.getAttribute('data-kind')).toBe('up');
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineMomentumCross
        data={linearUp(20)}
        defaultHiddenSeries={['momentum']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-cross-line"]',
      ),
    ).toBe(null);
  });
});

describe('Momentum Cross integration', () => {
  it('CONST yields zero crosses across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [1, 2, 4, 7]) {
        const run = runLineMomentumCross(constBar(L + 10, K), {
          length: L,
        });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('LINEAR yields zero crosses across (length)', () => {
    for (const dataFn of [linearUp, linearDown]) {
      for (const L of [1, 2, 4, 7]) {
        const run = runLineMomentumCross(dataFn(L + 10), { length: L });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('STEP yields deterministic single cross at step index', () => {
    for (const [K1, K2, expected] of [
      [1, 5, 'up'],
      [5, 1, 'down'],
      [0, 10, 'up'],
      [10, 0, 'down'],
    ] as const) {
      for (const L of [1, 2, 4]) {
        const run = runLineMomentumCross(stepUp(L + 15, K1, K2, L + 5), {
          length: L,
        });
        const idx = run.samples.findIndex((s) => s.crossed != null);
        expect(idx).toBe(L + 5);
        expect(run.samples[idx]?.crossed).toBe(expected);
        if (expected === 'up') {
          expect(run.upCrossCount).toBe(1);
          expect(run.downCrossCount).toBe(0);
        } else {
          expect(run.downCrossCount).toBe(1);
          expect(run.upCrossCount).toBe(0);
        }
      }
    }
  });
});
