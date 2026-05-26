import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCciCross,
  applyLineCciCrossMad,
  applyLineCciCrossSma,
  classifyLineCciCrossRegime,
  computeLineCciCross,
  computeLineCciCrossLayout,
  computeLineCciCrossTypical,
  describeLineCciCrossChart,
  detectLineCciCrossEvents,
  getLineCciCrossFinitePoints,
  normalizeLineCciCrossLength,
  runLineCciCross,
  CCI_LAMBERT_CONSTANT,
  DEFAULT_CHART_LINE_CCI_CROSS_LENGTH,
} from './chart-line-cci-cross';
import type { ChartLineCciCrossPoint } from './chart-line-cci-cross';

const constBar = (count: number, K: number): ChartLineCciCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineCciCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineCciCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

describe('CCI_LAMBERT_CONSTANT', () => {
  it('is the classic 0.015 factor', () => {
    expect(CCI_LAMBERT_CONSTANT).toBe(0.015);
  });
});

describe('getLineCciCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineCciCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineCciCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 0, close: 0 },
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineCciCrossFinitePoints([
      null as unknown as ChartLineCciCrossPoint,
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineCciCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineCciCrossLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineCciCrossLength(1, 14)).toBe(14);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineCciCrossLength(5, 14)).toBe(5);
  });
});

describe('computeLineCciCrossTypical', () => {
  it('averages high+low+close', () => {
    const tp = computeLineCciCrossTypical([
      { x: 0, high: 6, low: 3, close: 6 },
    ]);
    expect(tp[0]).toBe(5);
  });

  it('CONST yields constant typical', () => {
    const tp = computeLineCciCrossTypical(constBar(5, 50));
    for (const v of tp) expect(v).toBe(50);
  });

  it('LINEAR UP yields typical = i+1', () => {
    const tp = computeLineCciCrossTypical(linearUp(5));
    for (let i = 0; i < 5; i += 1) expect(tp[i]).toBe(i + 1);
  });
});

describe('applyLineCciCrossSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const L of [2, 3, 5]) {
        const out = applyLineCciCrossSma(Array(L + 3).fill(K), L);
        for (let i = L - 1; i < L + 3; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineCciCrossSma([1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('LINEAR i+1 sma at i with n=3 is i', () => {
    const out = applyLineCciCrossSma([1, 2, 3, 4, 5], 3);
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });
});

describe('applyLineCciCrossMad', () => {
  it('CONST yields MAD = 0', () => {
    const v = [5, 5, 5, 5];
    const sma = applyLineCciCrossSma(v, 3);
    const mad = applyLineCciCrossMad(v, sma, 3);
    for (let i = 2; i < 4; i += 1) expect(mad[i]).toBe(0);
  });

  it('LINEAR i+1 with n=3 yields MAD = 2/3', () => {
    const v = [1, 2, 3, 4, 5];
    const sma = applyLineCciCrossSma(v, 3);
    const mad = applyLineCciCrossMad(v, sma, 3);
    expect(mad[2]).toBe(2 / 3);
  });

  it('warmup null', () => {
    const v = [1, 2, 3];
    const sma = applyLineCciCrossSma(v, 3);
    const mad = applyLineCciCrossMad(v, sma, 3);
    expect(mad[0]).toBe(null);
    expect(mad[1]).toBe(null);
  });
});

describe('computeLineCciCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineCciCross(null);
    expect(ch.cci).toEqual([]);
  });

  it('CONST yields all-null CCI (divide-by-zero MAD)', () => {
    const ch = computeLineCciCross(constBar(20, 50), { length: 3 });
    for (const v of ch.cci) expect(v).toBe(null);
  });

  it('LINEAR UP CCI is defined and positive after warmup', () => {
    const ch = computeLineCciCross(linearUp(20), { length: 3 });
    for (let i = 2; i < 20; i += 1) {
      const v = ch.cci[i];
      expect(v).not.toBe(null);
      expect(v as number).toBeGreaterThan(0);
    }
  });

  it('LINEAR DOWN CCI is defined and negative after warmup', () => {
    const ch = computeLineCciCross(linearDown(20), { length: 3 });
    for (let i = 2; i < 20; i += 1) {
      const v = ch.cci[i];
      expect(v).not.toBe(null);
      expect(v as number).toBeLessThan(0);
    }
  });

  it('LINEAR UP with n=3 CCI is exactly 1 / (0.015 * 2/3) = 100', () => {
    const ch = computeLineCciCross(linearUp(20), { length: 3 });
    const expected = 1 / (CCI_LAMBERT_CONSTANT * (2 / 3));
    for (let i = 2; i < 20; i += 1) {
      expect(ch.cci[i]).toBe(expected);
    }
  });

  it('output length matches input', () => {
    const ch = computeLineCciCross(linearUp(15), { length: 3 });
    expect(ch.cci.length).toBe(15);
  });

  it('does not mutate input', () => {
    const data = linearUp(20);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineCciCross(data, { length: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineCciCrossRegime', () => {
  it('none on null', () => {
    expect(classifyLineCciCrossRegime(null)).toBe('none');
  });

  it('overbought above +100', () => {
    expect(classifyLineCciCrossRegime(120)).toBe('overbought');
  });

  it('oversold below -100', () => {
    expect(classifyLineCciCrossRegime(-120)).toBe('oversold');
  });

  it('bullish in (0, 100]', () => {
    expect(classifyLineCciCrossRegime(50)).toBe('bullish');
    expect(classifyLineCciCrossRegime(100)).toBe('bullish');
  });

  it('bearish in [-100, 0)', () => {
    expect(classifyLineCciCrossRegime(-50)).toBe('bearish');
    expect(classifyLineCciCrossRegime(-100)).toBe('bearish');
  });

  it('neutral at exact zero', () => {
    expect(classifyLineCciCrossRegime(0)).toBe('neutral');
  });
});

describe('detectLineCciCrossEvents', () => {
  it('enter100 on upward cross of +100', () => {
    expect(detectLineCciCrossEvents([50, 120])[1]).toBe('enter100');
  });

  it('exit100 on downward cross of +100', () => {
    expect(detectLineCciCrossEvents([120, 50])[1]).toBe('exit100');
  });

  it('enterN100 on downward cross of -100', () => {
    expect(detectLineCciCrossEvents([-50, -120])[1]).toBe('enterN100');
  });

  it('exitN100 on upward cross of -100', () => {
    expect(detectLineCciCrossEvents([-120, -50])[1]).toBe('exitN100');
  });

  it('zeroUp on upward cross of zero', () => {
    expect(detectLineCciCrossEvents([-20, 20])[1]).toBe('zeroUp');
  });

  it('zeroDown on downward cross of zero', () => {
    expect(detectLineCciCrossEvents([20, -20])[1]).toBe('zeroDown');
  });

  it('warmup null does not fire', () => {
    expect(detectLineCciCrossEvents([null, 50])).toEqual([null, null]);
  });

  it('no event when CCI stays in same regime', () => {
    const ev = detectLineCciCrossEvents([50, 60, 70]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineCciCross', () => {
  it('ok=false on short data', () => {
    const run = runLineCciCross(constBar(2, 50), { length: 3 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineCciCross(constBar(10, 50), { length: 3 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineCciCross(constBar(30, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_CCI_CROSS_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineCciCross(constBar(30, 50), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineCciCrossPoint[] = [
      { x: 2, high: 3, low: 2, close: 3 },
      { x: 0, high: 1, low: 0, close: 1 },
      { x: 1, high: 2, low: 1, close: 2 },
    ];
    const run = runLineCciCross(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero events and all-none regime', () => {
    const run = runLineCciCross(constBar(20, 50), { length: 3 });
    expect(run.enter100Count).toBe(0);
    expect(run.exit100Count).toBe(0);
    expect(run.enterN100Count).toBe(0);
    expect(run.exitN100Count).toBe(0);
    expect(run.zeroUpCount).toBe(0);
    expect(run.zeroDownCount).toBe(0);
    expect(run.noneCount).toBe(20);
  });

  it('LINEAR UP yields zero events (jumps null -> constant)', () => {
    const run = runLineCciCross(linearUp(20), { length: 3 });
    expect(run.enter100Count).toBe(0);
    expect(run.exit100Count).toBe(0);
    expect(run.zeroUpCount).toBe(0);
    expect(run.zeroDownCount).toBe(0);
  });

  it('LINEAR DOWN yields zero events', () => {
    const run = runLineCciCross(linearDown(20), { length: 3 });
    expect(run.enterN100Count).toBe(0);
    expect(run.exitN100Count).toBe(0);
    expect(run.zeroUpCount).toBe(0);
    expect(run.zeroDownCount).toBe(0);
  });

  it('LINEAR UP n=3 CCI just over +100 lands in overbought', () => {
    const run = runLineCciCross(linearUp(20), { length: 3 });
    expect(run.samples[5]?.regime).toBe('overbought');
  });

  it('LINEAR DOWN n=3 CCI just below -100 lands in oversold', () => {
    const run = runLineCciCross(linearDown(20), { length: 3 });
    expect(run.samples[5]?.regime).toBe('oversold');
  });
});

describe('computeLineCciCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineCciCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineCciCrossLayout({ data: linearUp(20) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above cci', () => {
    const layout = computeLineCciCrossLayout({ data: linearUp(20) });
    expect(layout.priceBottom).toBeLessThan(layout.cciTop);
  });

  it('produces price path and dots', () => {
    const layout = computeLineCciCrossLayout({ data: linearUp(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('produces a cci path when defined', () => {
    const layout = computeLineCciCrossLayout({
      data: linearUp(20),
      length: 3,
    });
    expect(layout.cciPath.length).toBeGreaterThan(0);
  });

  it('cci path empty for CONST input', () => {
    const layout = computeLineCciCrossLayout({
      data: constBar(20, 50),
      length: 3,
    });
    expect(layout.cciPath).toBe('');
  });

  it('zeroY between upperY and lowerY', () => {
    const layout = computeLineCciCrossLayout({
      data: linearUp(20),
      length: 3,
    });
    expect(layout.zeroY).toBeLessThan(layout.lowerY);
    expect(layout.zeroY).toBeGreaterThan(layout.upperY);
  });
});

describe('describeLineCciCrossChart', () => {
  it('No data for empty', () => {
    expect(describeLineCciCrossChart([])).toBe('No data');
  });

  it('mentions CCI Cross', () => {
    expect(describeLineCciCrossChart(linearUp(20))).toContain('CCI Cross');
  });

  it('reports length', () => {
    expect(describeLineCciCrossChart(linearUp(20), { length: 7 })).toContain(
      'length 7',
    );
  });
});

describe('<ChartLineCciCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineCciCross data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-cci-cross-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineCciCross data={linearUp(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('CCI Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCciCross data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineCciCross data={linearUp(20)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('exposes event counts', () => {
    const { container } = render(<ChartLineCciCross data={linearUp(20)} />);
    const root = container.querySelector(
      '[data-section="chart-line-cci-cross"]',
    );
    expect(root?.getAttribute('data-enter100-count')).toBe('0');
    expect(root?.getAttribute('data-exit100-count')).toBe('0');
    expect(root?.getAttribute('data-enter-n100-count')).toBe('0');
    expect(root?.getAttribute('data-exit-n100-count')).toBe('0');
    expect(root?.getAttribute('data-zero-up-count')).toBe('0');
    expect(root?.getAttribute('data-zero-down-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineCciCross data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-cross-aria-desc"]',
      )?.textContent,
    ).toContain('CCI Cross');
  });

  it('renders both legend items', () => {
    const { container } = render(<ChartLineCciCross data={linearUp(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="cci"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineCciCross
        data={linearUp(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="cci"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'cci', hidden: true });
  });

  it('hides cci when controlled', () => {
    const { container } = render(
      <ChartLineCciCross
        data={linearUp(20)}
        hiddenSeries={['cci']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-cross-cci-path"]',
      ),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineCciCross data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero, upper, and lower threshold lines by default', () => {
    const { container } = render(<ChartLineCciCross data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-cross-zeroline"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-cci-cross-upper"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-cci-cross-lower"]'),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineCciCross data={linearUp(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides upper line when showUpperLine=false', () => {
    const { container } = render(
      <ChartLineCciCross data={linearUp(20)} showUpperLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cci-cross-upper"]'),
    ).toBe(null);
  });

  it('hides lower line when showLowerLine=false', () => {
    const { container } = render(
      <ChartLineCciCross data={linearUp(20)} showLowerLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cci-cross-lower"]'),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineCciCross data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cci-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineCciCross data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cci-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineCciCross data={linearUp(20)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cci-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineCciCross
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-cci-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineCciCross data={linearUp(20)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-cci-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders cci path', () => {
    const { container } = render(
      <ChartLineCciCross data={linearUp(20)} length={3} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-cross-cci-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineCciCross data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineCciCross
        data={linearUp(20)}
        defaultHiddenSeries={['cci']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cci-cross-cci-path"]',
      ),
    ).toBe(null);
  });
});

describe('CCI Cross integration', () => {
  it('all three anchors yield zero events across multiple lengths', () => {
    for (const L of [3, 5, 7]) {
      for (const series of [
        constBar(L * 4, 50),
        linearUp(L * 4),
        linearDown(L * 4),
      ]) {
        const run = runLineCciCross(series, { length: L });
        expect(run.enter100Count).toBe(0);
        expect(run.exit100Count).toBe(0);
        expect(run.enterN100Count).toBe(0);
        expect(run.exitN100Count).toBe(0);
        expect(run.zeroUpCount).toBe(0);
        expect(run.zeroDownCount).toBe(0);
      }
    }
  });

  it('LINEAR UP n=3 lands the classic CCI = 100 exact value', () => {
    const ch = computeLineCciCross(linearUp(15), { length: 3 });
    const expected = 1 / (CCI_LAMBERT_CONSTANT * (2 / 3));
    for (let i = 2; i < 15; i += 1) {
      expect(ch.cci[i]).toBe(expected);
    }
  });
});
