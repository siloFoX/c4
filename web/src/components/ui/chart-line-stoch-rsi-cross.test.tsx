import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStochRsiCross,
  applyLineStochRsiCrossGainLoss,
  applyLineStochRsiCrossRsi,
  applyLineStochRsiCrossSma,
  applyLineStochRsiCrossStoch,
  applyLineStochRsiCrossWilder,
  classifyLineStochRsiCrossRelation,
  classifyLineStochRsiCrossTrigger,
  classifyLineStochRsiCrossZone,
  computeLineStochRsiCross,
  computeLineStochRsiCrossLayout,
  describeLineStochRsiCrossChart,
  detectLineStochRsiCrossCrosses,
  getLineStochRsiCrossFinitePoints,
  normalizeLineStochRsiCrossLength,
  normalizeLineStochRsiCrossLevel,
  normalizeLineStochRsiCrossSmooth,
  runLineStochRsiCross,
  DEFAULT_CHART_LINE_STOCH_RSI_CROSS_RSI_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_CROSS_STOCH_LENGTH,
  DEFAULT_CHART_LINE_STOCH_RSI_CROSS_K_SMOOTH,
  DEFAULT_CHART_LINE_STOCH_RSI_CROSS_D_SMOOTH,
  DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERBOUGHT_LEVEL,
  DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERSOLD_LEVEL,
} from './chart-line-stoch-rsi-cross';
import type { ChartLineStochRsiCrossPoint } from './chart-line-stoch-rsi-cross';

const constBar = (count: number, K: number): ChartLineStochRsiCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineStochRsiCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineStochRsiCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineStochRsiCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineStochRsiCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineStochRsiCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineStochRsiCrossFinitePoints([
      null as unknown as ChartLineStochRsiCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalize helpers', () => {
  it('length default + below-2 + accept', () => {
    expect(normalizeLineStochRsiCrossLength(undefined, 14)).toBe(14);
    expect(normalizeLineStochRsiCrossLength(1, 14)).toBe(14);
    expect(normalizeLineStochRsiCrossLength(7, 14)).toBe(7);
  });

  it('smooth default + below-1 + accept', () => {
    expect(normalizeLineStochRsiCrossSmooth(undefined, 3)).toBe(3);
    expect(normalizeLineStochRsiCrossSmooth(0, 3)).toBe(3);
    expect(normalizeLineStochRsiCrossSmooth(1, 3)).toBe(1);
  });

  it('level default + out-of-range + accept', () => {
    expect(normalizeLineStochRsiCrossLevel(undefined, 80)).toBe(80);
    expect(normalizeLineStochRsiCrossLevel(-1, 80)).toBe(80);
    expect(normalizeLineStochRsiCrossLevel(101, 80)).toBe(80);
    expect(normalizeLineStochRsiCrossLevel(75, 80)).toBe(75);
  });
});

describe('applyLineStochRsiCrossWilder', () => {
  it('CONST K Wilder is K bit-exact', () => {
    for (const K of [0, 1, 5, 100]) {
      const out = applyLineStochRsiCrossWilder(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('applyLineStochRsiCrossSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 5, 50]) {
      const out = applyLineStochRsiCrossSma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });

  it('null breaks window', () => {
    const out = applyLineStochRsiCrossSma([1, null, 1, 1, 1, 1], 3);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(1);
  });
});

describe('applyLineStochRsiCrossGainLoss', () => {
  it('first bar null', () => {
    const { gain, loss } = applyLineStochRsiCrossGainLoss([5, 6]);
    expect(gain[0]).toBe(null);
    expect(loss[0]).toBe(null);
  });

  it('positive change yields gain', () => {
    const { gain, loss } = applyLineStochRsiCrossGainLoss([5, 7]);
    expect(gain[1]).toBe(2);
    expect(loss[1]).toBe(0);
  });

  it('negative change yields loss', () => {
    const { gain, loss } = applyLineStochRsiCrossGainLoss([5, 2]);
    expect(gain[1]).toBe(0);
    expect(loss[1]).toBe(3);
  });
});

describe('applyLineStochRsiCrossRsi', () => {
  it('gain=0, loss=0 yields 50', () => {
    expect(applyLineStochRsiCrossRsi([0], [0])).toEqual([50]);
  });

  it('loss=0 yields 100', () => {
    expect(applyLineStochRsiCrossRsi([1], [0])).toEqual([100]);
  });

  it('gain=0 yields 0', () => {
    expect(applyLineStochRsiCrossRsi([0], [1])).toEqual([0]);
  });

  it('gain=loss yields 50', () => {
    expect(applyLineStochRsiCrossRsi([1], [1])).toEqual([50]);
  });
});

describe('applyLineStochRsiCrossStoch', () => {
  it('range=0 yields null', () => {
    const out = applyLineStochRsiCrossStoch([50, 50, 50], 3);
    expect(out[2]).toBe(null);
  });

  it('100 at the high', () => {
    const out = applyLineStochRsiCrossStoch([0, 50, 100], 3);
    expect(out[2]).toBe(100);
  });

  it('0 at the low', () => {
    const out = applyLineStochRsiCrossStoch([100, 50, 0], 3);
    expect(out[2]).toBe(0);
  });

  it('null when window has null', () => {
    expect(applyLineStochRsiCrossStoch([null, 50, 100], 3)[2]).toBe(null);
  });
});

describe('computeLineStochRsiCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineStochRsiCross(null);
    expect(ch.k).toEqual([]);
    expect(ch.d).toEqual([]);
  });

  it('CONST close yields k = d = null (RSI = 50 stays flat -> range=0)', () => {
    const ch = computeLineStochRsiCross(constBar(40, 50), {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    for (const v of ch.k) expect(v).toBe(null);
    for (const v of ch.d) expect(v).toBe(null);
  });

  it('LINEAR UP yields k = d = null (RSI = 100 stays flat -> range=0)', () => {
    const ch = computeLineStochRsiCross(linearUp(40), {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    for (const v of ch.k) expect(v).toBe(null);
    for (const v of ch.d) expect(v).toBe(null);
  });

  it('LINEAR DOWN yields k = d = null', () => {
    const ch = computeLineStochRsiCross(linearDown(40), {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    for (const v of ch.k) expect(v).toBe(null);
    for (const v of ch.d) expect(v).toBe(null);
  });

  it('LINEAR UP yields RSI = 100 once seeded', () => {
    const ch = computeLineStochRsiCross(linearUp(40), {
      rsiLength: 3,
    });
    for (let i = 3; i < 40; i += 1) {
      expect(ch.rsi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN yields RSI = 0', () => {
    const ch = computeLineStochRsiCross(linearDown(40), {
      rsiLength: 3,
    });
    for (let i = 3; i < 40; i += 1) {
      expect(ch.rsi[i]).toBe(0);
    }
  });

  it('CONST yields RSI = 50', () => {
    const ch = computeLineStochRsiCross(constBar(40, 50), {
      rsiLength: 3,
    });
    for (let i = 3; i < 40; i += 1) {
      expect(ch.rsi[i]).toBe(50);
    }
  });

  it('output length matches input', () => {
    const ch = computeLineStochRsiCross(linearUp(30), {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(ch.k.length).toBe(30);
    expect(ch.d.length).toBe(30);
  });

  it('does not mutate input', () => {
    const data = linearUp(30);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineStochRsiCross(data, {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineStochRsiCrossRelation', () => {
  it('bullish', () => {
    expect(classifyLineStochRsiCrossRelation(60, 40)).toBe('bullish');
  });

  it('bearish', () => {
    expect(classifyLineStochRsiCrossRelation(40, 60)).toBe('bearish');
  });

  it('equal', () => {
    expect(classifyLineStochRsiCrossRelation(50, 50)).toBe('equal');
  });

  it('none', () => {
    expect(classifyLineStochRsiCrossRelation(null, 50)).toBe('none');
  });
});

describe('classifyLineStochRsiCrossZone', () => {
  it('overbought at >= 80', () => {
    expect(classifyLineStochRsiCrossZone(80, 80, 20)).toBe('overbought');
  });

  it('oversold at <= 20', () => {
    expect(classifyLineStochRsiCrossZone(20, 80, 20)).toBe('oversold');
  });

  it('neutral in middle', () => {
    expect(classifyLineStochRsiCrossZone(50, 80, 20)).toBe('neutral');
  });

  it('none on null', () => {
    expect(classifyLineStochRsiCrossZone(null, 80, 20)).toBe('none');
  });
});

describe('classifyLineStochRsiCrossTrigger', () => {
  it('null without cross', () => {
    expect(classifyLineStochRsiCrossTrigger(null, 50, 80, 20)).toBe(null);
  });

  it('oversold-exit on up cross at low %K', () => {
    expect(classifyLineStochRsiCrossTrigger('up', 15, 80, 20)).toBe(
      'oversold-exit',
    );
  });

  it('overbought-exit on down cross at high %K', () => {
    expect(classifyLineStochRsiCrossTrigger('down', 85, 80, 20)).toBe(
      'overbought-exit',
    );
  });

  it('neutral on cross in middle', () => {
    expect(classifyLineStochRsiCrossTrigger('up', 50, 80, 20)).toBe(
      'neutral',
    );
  });
});

describe('detectLineStochRsiCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineStochRsiCrossCrosses([40, 60], [50, 50])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineStochRsiCrossCrosses([60, 40], [50, 50])[1]).toBe(
      'down',
    );
  });

  it('warmup null', () => {
    expect(
      detectLineStochRsiCrossCrosses([null, 60], [null, 50]),
    ).toEqual([null, null]);
  });

  it('no second cross', () => {
    const ev = detectLineStochRsiCrossCrosses([60, 70, 80], [50, 50, 50]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineStochRsiCross', () => {
  it('ok=false on short data', () => {
    const run = runLineStochRsiCross(constBar(5, 50), {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineStochRsiCross(constBar(20, 50), {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineStochRsiCross(constBar(80, 50));
    expect(run.rsiLength).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_CROSS_RSI_LENGTH,
    );
    expect(run.stochLength).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_CROSS_STOCH_LENGTH,
    );
    expect(run.kSmooth).toBe(DEFAULT_CHART_LINE_STOCH_RSI_CROSS_K_SMOOTH);
    expect(run.dSmooth).toBe(DEFAULT_CHART_LINE_STOCH_RSI_CROSS_D_SMOOTH);
    expect(run.overboughtLevel).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERBOUGHT_LEVEL,
    );
    expect(run.oversoldLevel).toBe(
      DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERSOLD_LEVEL,
    );
  });

  it('respects explicit options', () => {
    const run = runLineStochRsiCross(constBar(20, 50), {
      rsiLength: 5,
      stochLength: 7,
      kSmooth: 2,
      dSmooth: 2,
      overboughtLevel: 70,
      oversoldLevel: 30,
    });
    expect(run.rsiLength).toBe(5);
    expect(run.stochLength).toBe(7);
    expect(run.kSmooth).toBe(2);
    expect(run.dSmooth).toBe(2);
    expect(run.overboughtLevel).toBe(70);
    expect(run.oversoldLevel).toBe(30);
  });

  it('sorts by x', () => {
    const data: ChartLineStochRsiCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineStochRsiCross(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineStochRsiCross(constBar(40, 50), {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
    expect(run.oversoldExitCount).toBe(0);
    expect(run.overboughtExitCount).toBe(0);
  });

  it('LINEAR UP yields zero crosses', () => {
    const run = runLineStochRsiCross(linearUp(40), {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR DOWN yields zero crosses', () => {
    const run = runLineStochRsiCross(linearDown(40), {
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });
});

describe('computeLineStochRsiCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineStochRsiCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineStochRsiCrossLayout({
      data: linearUp(40),
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above osc', () => {
    const layout = computeLineStochRsiCrossLayout({ data: linearUp(40) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('osc axis fixed to [0, 100]', () => {
    const layout = computeLineStochRsiCrossLayout({ data: linearUp(40) });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('produces price path and dots', () => {
    const layout = computeLineStochRsiCrossLayout({ data: linearUp(40) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('CONST K/D paths empty (RSI constant -> stochRsi null)', () => {
    const layout = computeLineStochRsiCrossLayout({
      data: constBar(40, 50),
      rsiLength: 3,
      stochLength: 3,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(layout.kPath).toBe('');
    expect(layout.dPath).toBe('');
  });
});

describe('describeLineStochRsiCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineStochRsiCrossChart([])).toBe('No data');
  });

  it('mentions Stoch RSI Cross', () => {
    expect(describeLineStochRsiCrossChart(linearUp(40))).toContain(
      'Stoch RSI Cross',
    );
  });

  it('reports parameters', () => {
    const desc = describeLineStochRsiCrossChart(linearUp(40), {
      rsiLength: 5,
      stochLength: 7,
      kSmooth: 2,
      dSmooth: 2,
    });
    expect(desc).toContain('rsiLength 5');
    expect(desc).toContain('stochLength 7');
    expect(desc).toContain('kSmooth 2');
    expect(desc).toContain('dSmooth 2');
  });
});

describe('<ChartLineStochRsiCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineStochRsiCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Stochastic RSI');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStochRsiCross data={linearUp(40)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineStochRsiCross
        data={linearUp(40)}
        rsiLength={5}
        stochLength={7}
        kSmooth={2}
        dSmooth={2}
        overboughtLevel={70}
        oversoldLevel={30}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-rsi-cross"]',
    );
    expect(root?.getAttribute('data-rsi-length')).toBe('5');
    expect(root?.getAttribute('data-stoch-length')).toBe('7');
    expect(root?.getAttribute('data-k-smooth')).toBe('2');
    expect(root?.getAttribute('data-d-smooth')).toBe('2');
    expect(root?.getAttribute('data-overbought-level')).toBe('70');
    expect(root?.getAttribute('data-oversold-level')).toBe('30');
  });

  it('exposes cross counts', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-rsi-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-aria-desc"]',
      )?.textContent,
    ).toContain('Stoch RSI Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="k"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="d"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineStochRsiCross
        data={linearUp(40)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="k"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'k', hidden: true });
  });

  it('hides %K when controlled', () => {
    const { container } = render(
      <ChartLineStochRsiCross
        data={linearUp(40)}
        hiddenSeries={['k']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-k"]',
      ),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders overbought and oversold lines by default', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-overbought"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-oversold"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('hides midline when showMidline=false', () => {
    const { container } = render(
      <ChartLineStochRsiCross
        data={linearUp(40)}
        showMidline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-midline"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineStochRsiCross
        data={linearUp(40)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-rsi-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-stoch-rsi-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders price path', () => {
    const { container } = render(
      <ChartLineStochRsiCross data={linearUp(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineStochRsiCross
        data={linearUp(40)}
        defaultHiddenSeries={['d']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-rsi-cross-d"]',
      ),
    ).toBe(null);
  });
});

describe('Stoch RSI Cross integration', () => {
  it('all three anchors yield zero crosses across multiple param sets', () => {
    for (const [R, S, K, D] of [
      [3, 3, 2, 2],
      [4, 4, 3, 3],
      [5, 5, 2, 3],
    ] as const) {
      for (const series of [
        constBar(50, 50),
        linearUp(50),
        linearDown(50),
      ]) {
        const run = runLineStochRsiCross(series, {
          rsiLength: R,
          stochLength: S,
          kSmooth: K,
          dSmooth: D,
        });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('CONST RSI=50 bit-exact across multiple K and rsiLength', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const R of [3, 5, 7]) {
        const ch = computeLineStochRsiCross(constBar(R * 3, K), {
          rsiLength: R,
        });
        for (let i = R; i < R * 3; i += 1) {
          expect(ch.rsi[i]).toBe(50);
        }
      }
    }
  });
});
