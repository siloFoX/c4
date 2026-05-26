import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRsiCross,
  applyLineRsiCrossFromAvg,
  applyLineRsiCrossGainLoss,
  applyLineRsiCrossWilder,
  classifyLineRsiCrossRelation,
  computeLineRsiCross,
  computeLineRsiCrossLayout,
  describeLineRsiCrossChart,
  detectLineRsiCrossCrosses,
  getLineRsiCrossFinitePoints,
  normalizeLineRsiCrossLength,
  runLineRsiCross,
  DEFAULT_CHART_LINE_RSI_CROSS_SHORT_LENGTH,
  DEFAULT_CHART_LINE_RSI_CROSS_LONG_LENGTH,
} from './chart-line-rsi-cross';
import type { ChartLineRsiCrossPoint } from './chart-line-rsi-cross';

const constBar = (count: number, K: number): ChartLineRsiCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineRsiCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineRsiCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineRsiCrossFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineRsiCrossFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineRsiCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineRsiCrossFinitePoints([
      null as unknown as ChartLineRsiCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineRsiCrossLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineRsiCrossLength(undefined, 7)).toBe(7);
  });

  it('rejects below 2', () => {
    expect(normalizeLineRsiCrossLength(1, 7)).toBe(7);
  });
});

describe('applyLineRsiCrossGainLoss', () => {
  it('first bar gain/loss are null', () => {
    const { gain, loss } = applyLineRsiCrossGainLoss([5, 6, 4]);
    expect(gain[0]).toBe(null);
    expect(loss[0]).toBe(null);
  });

  it('positive change yields gain only', () => {
    const { gain, loss } = applyLineRsiCrossGainLoss([5, 7]);
    expect(gain[1]).toBe(2);
    expect(loss[1]).toBe(0);
  });

  it('negative change yields loss only', () => {
    const { gain, loss } = applyLineRsiCrossGainLoss([5, 2]);
    expect(gain[1]).toBe(0);
    expect(loss[1]).toBe(3);
  });

  it('zero change yields 0 for both', () => {
    const { gain, loss } = applyLineRsiCrossGainLoss([5, 5]);
    expect(gain[1]).toBe(0);
    expect(loss[1]).toBe(0);
  });
});

describe('applyLineRsiCrossWilder', () => {
  it('CONST K Wilder is K bit-exact (min===max seed)', () => {
    for (const K of [0, 1, 5, 100]) {
      for (const L of [3, 7, 14]) {
        const out = applyLineRsiCrossWilder(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineRsiCrossWilder([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });
});

describe('applyLineRsiCrossFromAvg', () => {
  it('gain=0, loss=0 yields 50 (neutral)', () => {
    expect(applyLineRsiCrossFromAvg([0], [0])).toEqual([50]);
  });

  it('loss=0, gain>0 yields 100', () => {
    expect(applyLineRsiCrossFromAvg([1], [0])).toEqual([100]);
  });

  it('gain=0, loss>0 yields 0', () => {
    expect(applyLineRsiCrossFromAvg([0], [1])).toEqual([0]);
  });

  it('gain=loss yields 50', () => {
    expect(applyLineRsiCrossFromAvg([1], [1])).toEqual([50]);
  });

  it('gain=3, loss=1 yields 75 (RS=3 -> 100 - 100/4 = 75)', () => {
    expect(applyLineRsiCrossFromAvg([3], [1])).toEqual([75]);
  });
});

describe('computeLineRsiCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineRsiCross(null);
    expect(ch.shortRsi).toEqual([]);
    expect(ch.longRsi).toEqual([]);
  });

  it('CONST yields shortRsi = longRsi = 50', () => {
    for (const K of [1, 5, 100, -3]) {
      const series = constBar(30, K);
      const ch = computeLineRsiCross(series, {
        shortLength: 3,
        longLength: 5,
      });
      for (let i = 5; i < 30; i += 1) {
        expect(ch.shortRsi[i]).toBe(50);
        expect(ch.longRsi[i]).toBe(50);
      }
    }
  });

  it('LINEAR UP yields shortRsi = longRsi = 100', () => {
    const series = linearUp(30);
    const ch = computeLineRsiCross(series, {
      shortLength: 3,
      longLength: 5,
    });
    for (let i = 5; i < 30; i += 1) {
      expect(ch.shortRsi[i]).toBe(100);
      expect(ch.longRsi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN yields shortRsi = longRsi = 0', () => {
    const series = linearDown(30);
    const ch = computeLineRsiCross(series, {
      shortLength: 3,
      longLength: 5,
    });
    for (let i = 5; i < 30; i += 1) {
      expect(ch.shortRsi[i]).toBe(0);
      expect(ch.longRsi[i]).toBe(0);
    }
  });

  it('output length matches input length', () => {
    const series = linearUp(30);
    const ch = computeLineRsiCross(series, {
      shortLength: 3,
      longLength: 5,
    });
    expect(ch.shortRsi.length).toBe(30);
    expect(ch.longRsi.length).toBe(30);
  });

  it('does not mutate input', () => {
    const series = linearUp(30);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineRsiCross(series, { shortLength: 3, longLength: 5 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineRsiCrossRelation', () => {
  it('bullish when short > long', () => {
    expect(classifyLineRsiCrossRelation(60, 50)).toBe('bullish');
  });

  it('bearish when short < long', () => {
    expect(classifyLineRsiCrossRelation(40, 50)).toBe('bearish');
  });

  it('equal when short == long', () => {
    expect(classifyLineRsiCrossRelation(50, 50)).toBe('equal');
  });

  it('none when either is null', () => {
    expect(classifyLineRsiCrossRelation(null, 50)).toBe('none');
  });
});

describe('detectLineRsiCrossCrosses', () => {
  it('flags up cross when short newly exceeds long', () => {
    const ev = detectLineRsiCrossCrosses([40, 60], [50, 50]);
    expect(ev[1]).toBe('up');
  });

  it('flags down cross when short newly falls below long', () => {
    const ev = detectLineRsiCrossCrosses([60, 40], [50, 50]);
    expect(ev[1]).toBe('down');
  });

  it('null on warmup', () => {
    expect(detectLineRsiCrossCrosses([null, 40, 60], [null, 50, 50])).toEqual(
      [null, null, 'up'],
    );
  });

  it('no second cross when staying above', () => {
    const ev = detectLineRsiCrossCrosses([60, 70, 80], [50, 50, 50]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineRsiCross', () => {
  it('marks ok=false for short data', () => {
    const run = runLineRsiCross(constBar(5, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineRsiCross(constBar(7, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineRsiCross(constBar(40, 10));
    expect(run.shortLength).toBe(DEFAULT_CHART_LINE_RSI_CROSS_SHORT_LENGTH);
    expect(run.longLength).toBe(DEFAULT_CHART_LINE_RSI_CROSS_LONG_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineRsiCross(constBar(40, 10), {
      shortLength: 5,
      longLength: 14,
    });
    expect(run.shortLength).toBe(5);
    expect(run.longLength).toBe(14);
  });

  it('sorts by x', () => {
    const data: ChartLineRsiCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineRsiCross(data, { shortLength: 2, longLength: 3 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineRsiCross(constBar(30, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR UP yields zero crosses', () => {
    const run = runLineRsiCross(linearUp(30), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR DOWN yields zero crosses', () => {
    const run = runLineRsiCross(linearDown(30), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('CONST classifies as equal', () => {
    const run = runLineRsiCross(constBar(30, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.equalCount).toBeGreaterThan(0);
  });
});

describe('computeLineRsiCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineRsiCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineRsiCrossLayout({ data: linearUp(30) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above rsi', () => {
    const layout = computeLineRsiCrossLayout({ data: linearUp(30) });
    expect(layout.priceBottom).toBeLessThan(layout.rsiTop);
  });

  it('rsi axis fixed to [0, 100]', () => {
    const layout = computeLineRsiCrossLayout({ data: linearUp(30) });
    expect(layout.rsiMin).toBe(0);
    expect(layout.rsiMax).toBe(100);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineRsiCrossLayout({ data: linearUp(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces short and long band paths', () => {
    const layout = computeLineRsiCrossLayout({
      data: linearUp(30),
      shortLength: 3,
      longLength: 5,
    });
    expect(layout.shortPath.length).toBeGreaterThan(0);
    expect(layout.longPath.length).toBeGreaterThan(0);
  });
});

describe('describeLineRsiCrossChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineRsiCrossChart([])).toBe('No data');
  });

  it('mentions RSI Cross', () => {
    const desc = describeLineRsiCrossChart(linearUp(30));
    expect(desc).toContain('RSI Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineRsiCrossChart(linearUp(30), {
      shortLength: 5,
      longLength: 14,
    });
    expect(desc).toContain('shortLength 5');
    expect(desc).toContain('longLength 14');
  });
});

describe('<ChartLineRsiCross />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineRsiCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineRsiCross data={linearUp(30)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('RSI Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRsiCross data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineRsiCross
        data={linearUp(30)}
        shortLength={5}
        longLength={14}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rsi-cross"]',
    );
    expect(root?.getAttribute('data-short-length')).toBe('5');
    expect(root?.getAttribute('data-long-length')).toBe('14');
  });

  it('exposes total-points and cross counts', () => {
    const { container } = render(<ChartLineRsiCross data={linearUp(30)} />);
    const root = container.querySelector(
      '[data-section="chart-line-rsi-cross"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineRsiCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-aria-desc"]',
      )?.textContent,
    ).toContain('RSI Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineRsiCross data={linearUp(30)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="short"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="long"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineRsiCross
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="short"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'short',
      hidden: true,
    });
  });

  it('hides short when controlled hidden', () => {
    const { container } = render(
      <ChartLineRsiCross
        data={linearUp(30)}
        hiddenSeries={['short']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-short"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineRsiCross data={linearUp(30)} />);
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-badge"]'),
    ).toBeTruthy();
  });

  it('renders midline by default', () => {
    const { container } = render(<ChartLineRsiCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-midline"]',
      ),
    ).toBeTruthy();
  });

  it('hides midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineRsiCross data={linearUp(30)} showMidline={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-midline"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineRsiCross data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineRsiCross data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineRsiCross data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineRsiCross
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rsi-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineRsiCross data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-rsi-cross-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders short and long paths', () => {
    const { container } = render(
      <ChartLineRsiCross
        data={linearUp(30)}
        shortLength={3}
        longLength={5}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-short"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-long"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineRsiCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineRsiCross
        data={linearUp(30)}
        defaultHiddenSeries={['long']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rsi-cross-long"]'),
    ).toBe(null);
  });
});

describe('RSI Cross integration', () => {
  it('CONST yields RSI = 50 and zero crosses across (K, short, long)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const [S, L] of [
        [2, 4],
        [3, 7],
        [5, 14],
      ] as const) {
        const run = runLineRsiCross(constBar(L + 10, K), {
          shortLength: S,
          longLength: L,
        });
        for (let i = L; i < L + 10; i += 1) {
          expect(run.samples[i]?.shortRsi).toBe(50);
          expect(run.samples[i]?.longRsi).toBe(50);
        }
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('LINEAR UP yields RSI = 100 and zero crosses', () => {
    for (const [S, L] of [
      [2, 4],
      [3, 7],
    ] as const) {
      const run = runLineRsiCross(linearUp(L + 10), {
        shortLength: S,
        longLength: L,
      });
      for (let i = L; i < L + 10; i += 1) {
        expect(run.samples[i]?.shortRsi).toBe(100);
        expect(run.samples[i]?.longRsi).toBe(100);
      }
      expect(run.upCrossCount).toBe(0);
      expect(run.downCrossCount).toBe(0);
    }
  });

  it('LINEAR DOWN yields RSI = 0 and zero crosses', () => {
    for (const [S, L] of [
      [2, 4],
      [3, 7],
    ] as const) {
      const run = runLineRsiCross(linearDown(L + 10), {
        shortLength: S,
        longLength: L,
      });
      for (let i = L; i < L + 10; i += 1) {
        expect(run.samples[i]?.shortRsi).toBe(0);
        expect(run.samples[i]?.longRsi).toBe(0);
      }
      expect(run.upCrossCount).toBe(0);
      expect(run.downCrossCount).toBe(0);
    }
  });
});
