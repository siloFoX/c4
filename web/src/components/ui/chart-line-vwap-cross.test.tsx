import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVwapCross,
  classifyLineVwapCrossRelation,
  computeLineVwapCross,
  computeLineVwapCrossLayout,
  computeLineVwapCrossTypical,
  computeLineVwapCrossVwap,
  describeLineVwapCrossChart,
  detectLineVwapCrossCrosses,
  getLineVwapCrossFinitePoints,
  runLineVwapCross,
} from './chart-line-vwap-cross';
import type { ChartLineVwapCrossPoint } from './chart-line-vwap-cross';

const constBar = (
  count: number,
  K: number,
  V = 1,
): ChartLineVwapCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
    volume: V,
  }));

const linearUp = (count: number, V = 1): ChartLineVwapCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
    volume: V,
  }));

const linearDown = (count: number, V = 1): ChartLineVwapCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
    volume: V,
  }));

describe('getLineVwapCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineVwapCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN values', () => {
    const r = getLineVwapCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 0, close: 0, volume: 1 },
      { x: 1, high: 1, low: 0, close: 1, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineVwapCrossFinitePoints([
      null as unknown as ChartLineVwapCrossPoint,
      { x: 1, high: 1, low: 0, close: 1, volume: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('preserves anchor=true and defaults absent anchor to false', () => {
    const r = getLineVwapCrossFinitePoints([
      { x: 0, high: 1, low: 0, close: 1, volume: 1, anchor: true },
      { x: 1, high: 1, low: 0, close: 1, volume: 1 },
    ]);
    expect(r[0]?.anchor).toBe(true);
    expect(r[1]?.anchor).toBe(false);
  });
});

describe('computeLineVwapCrossTypical', () => {
  it('averages high+low+close', () => {
    const tp = computeLineVwapCrossTypical([
      { x: 0, high: 6, low: 3, close: 6, volume: 1 },
    ]);
    expect(tp[0]).toBe(5);
  });

  it('CONST h=l=close=K -> typical K', () => {
    const tp = computeLineVwapCrossTypical(constBar(5, 50));
    for (const v of tp) expect(v).toBe(50);
  });

  it('LINEAR UP h=l=close=i+1 -> typical i+1', () => {
    const tp = computeLineVwapCrossTypical(linearUp(5));
    for (let i = 0; i < 5; i += 1) expect(tp[i]).toBe(i + 1);
  });
});

describe('computeLineVwapCrossVwap', () => {
  it('CONST yields VWAP = K', () => {
    const tp = computeLineVwapCrossTypical(constBar(5, 50));
    const v = computeLineVwapCrossVwap(constBar(5, 50), tp);
    for (const x of v) expect(x).toBe(50);
  });

  it('LINEAR UP yields VWAP = (i+2)/2', () => {
    const tp = computeLineVwapCrossTypical(linearUp(5));
    const v = computeLineVwapCrossVwap(linearUp(5), tp);
    expect(v[0]).toBe(1);
    expect(v[1]).toBe(1.5);
    expect(v[2]).toBe(2);
    expect(v[3]).toBe(2.5);
    expect(v[4]).toBe(3);
  });

  it('anchor reset restarts cumulative sums at that bar', () => {
    const data: ChartLineVwapCrossPoint[] = [
      { x: 0, high: 10, low: 10, close: 10, volume: 1 },
      { x: 1, high: 20, low: 20, close: 20, volume: 1 },
      { x: 2, high: 30, low: 30, close: 30, volume: 1, anchor: true },
      { x: 3, high: 40, low: 40, close: 40, volume: 1 },
    ];
    const tp = computeLineVwapCrossTypical(data);
    const v = computeLineVwapCrossVwap(data, tp);
    expect(v[0]).toBe(10);
    expect(v[1]).toBe(15);
    expect(v[2]).toBe(30);
    expect(v[3]).toBe(35);
  });
});

describe('computeLineVwapCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineVwapCross(null);
    expect(ch.vwap).toEqual([]);
    expect(ch.deviation).toEqual([]);
  });

  it('CONST yields deviation = 0 everywhere', () => {
    const ch = computeLineVwapCross(constBar(5, 50));
    for (const d of ch.deviation) expect(d).toBe(0);
  });

  it('LINEAR UP yields deviation = i/2', () => {
    const ch = computeLineVwapCross(linearUp(5));
    for (let i = 0; i < 5; i += 1) {
      expect(ch.deviation[i]).toBe(i / 2);
    }
  });

  it('LINEAR DOWN yields deviation = -i/2 (bar 0 = +0)', () => {
    const ch = computeLineVwapCross(linearDown(5));
    expect(ch.deviation[0]).toBe(0);
    for (let i = 1; i < 5; i += 1) {
      expect(ch.deviation[i]).toBe(-i / 2);
    }
  });

  it('output length matches input', () => {
    const ch = computeLineVwapCross(linearUp(10));
    expect(ch.vwap.length).toBe(10);
    expect(ch.deviation.length).toBe(10);
  });

  it('does not mutate input', () => {
    const data = linearUp(5);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineVwapCross(data);
    expect(data).toEqual(snap);
  });
});

describe('classifyLineVwapCrossRelation', () => {
  it('bullish when close > vwap', () => {
    expect(classifyLineVwapCrossRelation(10, 5)).toBe('bullish');
  });

  it('bearish when close < vwap', () => {
    expect(classifyLineVwapCrossRelation(5, 10)).toBe('bearish');
  });

  it('equal when close == vwap', () => {
    expect(classifyLineVwapCrossRelation(5, 5)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineVwapCrossRelation(null, 5)).toBe('none');
  });
});

describe('detectLineVwapCrossCrosses', () => {
  it('up cross', () => {
    const ev = detectLineVwapCrossCrosses(
      [1, 2],
      [1, 1.5],
      [true, false],
    );
    expect(ev[1]).toBe('up');
  });

  it('down cross', () => {
    const ev = detectLineVwapCrossCrosses(
      [10, 5],
      [9, 9],
      [true, false],
    );
    expect(ev[1]).toBe('down');
  });

  it('anchor reset suppresses cross on the reset bar', () => {
    const ev = detectLineVwapCrossCrosses(
      [1, 2],
      [1, 1.5],
      [true, true],
    );
    expect(ev[1]).toBe(null);
  });

  it('null close/vwap is null cross', () => {
    expect(
      detectLineVwapCrossCrosses([null, 1], [null, 1], [true, false]),
    ).toEqual([null, null]);
  });
});

describe('runLineVwapCross', () => {
  it('ok=false on too few bars', () => {
    const run = runLineVwapCross([
      { x: 0, high: 1, low: 0, close: 1, volume: 1 },
    ]);
    expect(run.ok).toBe(false);
  });

  it('ok=true on >= 2 bars', () => {
    const run = runLineVwapCross(linearUp(2));
    expect(run.ok).toBe(true);
  });

  it('sorts by x', () => {
    const data: ChartLineVwapCrossPoint[] = [
      { x: 2, high: 3, low: 3, close: 3, volume: 1 },
      { x: 0, high: 1, low: 1, close: 1, volume: 1 },
      { x: 1, high: 2, low: 2, close: 2, volume: 1 },
    ];
    const run = runLineVwapCross(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineVwapCross(constBar(10, 50));
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR UP yields exactly 1 up cross at i=1', () => {
    const run = runLineVwapCross(linearUp(5));
    expect(run.upCrossCount).toBe(1);
    expect(run.downCrossCount).toBe(0);
    expect(run.samples[1]?.crossed).toBe('up');
  });

  it('LINEAR DOWN yields exactly 1 down cross at i=1', () => {
    const run = runLineVwapCross(linearDown(5));
    expect(run.downCrossCount).toBe(1);
    expect(run.upCrossCount).toBe(0);
    expect(run.samples[1]?.crossed).toBe('down');
  });

  it('two LINEAR UP sessions with anchor reset yield 2 up crosses', () => {
    const session1 = linearUp(5);
    const session2 = linearUp(5).map((p, i) => ({
      x: 100 + i,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
      anchor: i === 0 ? true : false,
    }));
    const run = runLineVwapCross([...session1, ...session2]);
    expect(run.upCrossCount).toBe(2);
    expect(run.downCrossCount).toBe(0);
  });

  it('resetCount counts session starts (bar 0 + each anchor=true)', () => {
    const run = runLineVwapCross([
      ...linearUp(3),
      ...linearUp(3).map((p, i) => ({
        x: 100 + i,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
        anchor: i === 0 ? true : false,
      })),
    ]);
    expect(run.resetCount).toBe(2);
  });
});

describe('computeLineVwapCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineVwapCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on >= 2 bars', () => {
    const layout = computeLineVwapCrossLayout({ data: linearUp(5) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above deviation', () => {
    const layout = computeLineVwapCrossLayout({ data: linearUp(5) });
    expect(layout.priceBottom).toBeLessThan(layout.devTop);
  });

  it('produces price + vwap + deviation paths', () => {
    const layout = computeLineVwapCrossLayout({ data: linearUp(5) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.vwapPath.length).toBeGreaterThan(0);
    expect(layout.deviationPath.length).toBeGreaterThan(0);
  });

  it('produces reset lines except for bar 0', () => {
    const layout = computeLineVwapCrossLayout({
      data: [
        ...linearUp(3),
        ...linearUp(3).map((p, i) => ({
          x: 100 + i,
          high: p.high,
          low: p.low,
          close: p.close,
          volume: p.volume,
          anchor: i === 0 ? true : false,
        })),
      ],
    });
    expect(layout.resetLines.length).toBe(1);
    expect(layout.resetLines[0]?.index).toBe(3);
  });

  it('LINEAR UP layout fires 1 marker', () => {
    const layout = computeLineVwapCrossLayout({ data: linearUp(5) });
    expect(layout.markers.length).toBe(1);
    expect(layout.markers[0]?.kind).toBe('up');
  });
});

describe('describeLineVwapCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineVwapCrossChart([])).toBe('No data');
  });

  it('mentions VWAP Cross and anchor resets', () => {
    const desc = describeLineVwapCrossChart([
      ...linearUp(3),
      ...linearUp(3).map((p, i) => ({
        ...p,
        x: 100 + i,
        anchor: i === 0 ? true : false,
      })),
    ]);
    expect(desc).toContain('VWAP Cross');
    expect(desc).toContain('anchor resets 1');
  });
});

describe('<ChartLineVwapCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineVwapCross data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-vwap-cross-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineVwapCross data={linearUp(5)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('VWAP Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVwapCross data={linearUp(5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(<ChartLineVwapCross data={linearUp(5)} />);
    const root = container.querySelector(
      '[data-section="chart-line-vwap-cross"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('5');
    expect(root?.getAttribute('data-up-cross-count')).toBe('1');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
    expect(root?.getAttribute('data-reset-count')).toBe('1');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineVwapCross data={linearUp(5)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-aria-desc"]',
      )?.textContent,
    ).toContain('VWAP Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineVwapCross data={linearUp(5)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="vwap"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="deviation"]'),
    ).toBeTruthy();
  });

  it('legend toggles a series', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVwapCross
        data={linearUp(5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="vwap"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'vwap', hidden: true });
  });

  it('hides vwap when controlled', () => {
    const { container } = render(
      <ChartLineVwapCross
        data={linearUp(5)}
        hiddenSeries={['vwap']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwap-cross-vwap"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineVwapCross data={linearUp(5)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineVwapCross data={linearUp(5)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineVwapCross data={linearUp(5)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('renders reset lines when anchor flips', () => {
    const { container } = render(
      <ChartLineVwapCross
        data={[
          ...linearUp(3),
          ...linearUp(3).map((p, i) => ({
            ...p,
            x: 100 + i,
            anchor: i === 0 ? true : false,
          })),
        ]}
      />,
    );
    const lines = container.querySelectorAll(
      '[data-section="chart-line-vwap-cross-reset-line"]',
    );
    expect(lines.length).toBe(1);
  });

  it('hides resets when showResets=false', () => {
    const { container } = render(
      <ChartLineVwapCross
        data={[
          ...linearUp(3),
          ...linearUp(3).map((p, i) => ({
            ...p,
            x: 100 + i,
            anchor: i === 0 ? true : false,
          })),
        ]}
        showResets={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-resets"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineVwapCross data={linearUp(5)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwap-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineVwapCross data={linearUp(5)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwap-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineVwapCross data={linearUp(5)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineVwapCross
        data={linearUp(5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineVwapCross data={linearUp(5)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-vwap-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders vwap + deviation paths', () => {
    const { container } = render(<ChartLineVwapCross data={linearUp(5)} />);
    expect(
      container.querySelector('[data-section="chart-line-vwap-cross-vwap"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-deviation"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineVwapCross data={linearUp(5)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineVwapCross
        data={linearUp(5)}
        defaultHiddenSeries={['deviation']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-deviation"]',
      ),
    ).toBe(null);
  });
});

describe('VWAP Cross integration', () => {
  it('all three anchors produce bit-exact deviation = K * i / 2 family', () => {
    const constRun = runLineVwapCross(constBar(5, 50));
    for (const s of constRun.samples) expect(s.deviation).toBe(0);
    const upRun = runLineVwapCross(linearUp(5));
    for (let i = 0; i < 5; i += 1) {
      expect(upRun.samples[i]?.deviation).toBe(i / 2);
    }
    const downRun = runLineVwapCross(linearDown(5));
    expect(downRun.samples[0]?.deviation).toBe(0);
    for (let i = 1; i < 5; i += 1) {
      expect(downRun.samples[i]?.deviation).toBe(-i / 2);
    }
  });
});
