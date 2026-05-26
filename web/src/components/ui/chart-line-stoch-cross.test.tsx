import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineStochCross,
  applyLineStochCrossSma,
  classifyLineStochCrossRelation,
  classifyLineStochCrossTrigger,
  classifyLineStochCrossZone,
  computeLineStochCross,
  computeLineStochCrossK,
  computeLineStochCrossLayout,
  describeLineStochCrossChart,
  detectLineStochCrossCrosses,
  getLineStochCrossFinitePoints,
  normalizeLineStochCrossLength,
  normalizeLineStochCrossLevel,
  runLineStochCross,
  DEFAULT_CHART_LINE_STOCH_CROSS_K_LENGTH,
  DEFAULT_CHART_LINE_STOCH_CROSS_D_LENGTH,
  DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_LEVEL,
  DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_LEVEL,
} from './chart-line-stoch-cross';
import type { ChartLineStochCrossPoint } from './chart-line-stoch-cross';

const constBar = (count: number, K: number): ChartLineStochCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineStochCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineStochCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

describe('getLineStochCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineStochCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineStochCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 0, close: 0 },
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineStochCrossFinitePoints([
      null as unknown as ChartLineStochCrossPoint,
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineStochCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineStochCrossLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineStochCrossLength(1, 14)).toBe(14);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineStochCrossLength(5, 14)).toBe(5);
  });
});

describe('normalizeLineStochCrossLevel', () => {
  it('uses default', () => {
    expect(normalizeLineStochCrossLevel(undefined, 80)).toBe(80);
  });

  it('rejects out-of-range', () => {
    expect(normalizeLineStochCrossLevel(-1, 80)).toBe(80);
    expect(normalizeLineStochCrossLevel(101, 80)).toBe(80);
  });

  it('accepts valid', () => {
    expect(normalizeLineStochCrossLevel(75, 80)).toBe(75);
  });
});

describe('applyLineStochCrossSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 5, 50, 100]) {
      for (const L of [2, 3, 5]) {
        const out = applyLineStochCrossSma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineStochCrossSma([1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('null breaks window', () => {
    const out = applyLineStochCrossSma([1, null, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(1);
  });
});

describe('computeLineStochCrossK', () => {
  it('CONST yields null %K', () => {
    const k = computeLineStochCrossK(constBar(10, 50), 3);
    for (const v of k) expect(v).toBe(null);
  });

  it('LINEAR UP yields %K = 100', () => {
    const k = computeLineStochCrossK(linearUp(10), 3);
    for (let i = 2; i < 10; i += 1) {
      expect(k[i]).toBe(100);
    }
  });

  it('LINEAR DOWN yields %K = 0', () => {
    const k = computeLineStochCrossK(linearDown(10), 3);
    for (let i = 2; i < 10; i += 1) {
      expect(k[i]).toBe(0);
    }
  });

  it('warmup is null', () => {
    const k = computeLineStochCrossK(linearUp(10), 3);
    expect(k[0]).toBe(null);
    expect(k[1]).toBe(null);
    expect(k[2]).toBe(100);
  });
});

describe('computeLineStochCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineStochCross(null);
    expect(ch.k).toEqual([]);
    expect(ch.d).toEqual([]);
  });

  it('CONST yields k = d = null', () => {
    const ch = computeLineStochCross(constBar(20, 50), {
      kLength: 3,
      dLength: 3,
    });
    for (const v of ch.k) expect(v).toBe(null);
    for (const v of ch.d) expect(v).toBe(null);
  });

  it('LINEAR UP yields k = d = 100 after warmup', () => {
    const ch = computeLineStochCross(linearUp(20), {
      kLength: 3,
      dLength: 3,
    });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.k[i]).toBe(100);
      expect(ch.d[i]).toBe(100);
    }
  });

  it('LINEAR DOWN yields k = d = 0 after warmup', () => {
    const ch = computeLineStochCross(linearDown(20), {
      kLength: 3,
      dLength: 3,
    });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.k[i]).toBe(0);
      expect(ch.d[i]).toBe(0);
    }
  });

  it('output length matches input', () => {
    const ch = computeLineStochCross(linearUp(30), {
      kLength: 3,
      dLength: 3,
    });
    expect(ch.k.length).toBe(30);
    expect(ch.d.length).toBe(30);
  });

  it('does not mutate input', () => {
    const data = linearUp(20);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineStochCross(data, { kLength: 3, dLength: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineStochCrossRelation', () => {
  it('bullish', () => {
    expect(classifyLineStochCrossRelation(70, 50)).toBe('bullish');
  });

  it('bearish', () => {
    expect(classifyLineStochCrossRelation(40, 50)).toBe('bearish');
  });

  it('equal', () => {
    expect(classifyLineStochCrossRelation(50, 50)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineStochCrossRelation(null, 50)).toBe('none');
  });
});

describe('classifyLineStochCrossZone', () => {
  it('none on null', () => {
    expect(classifyLineStochCrossZone(null, 80, 20)).toBe('none');
  });

  it('overbought at >= 80', () => {
    expect(classifyLineStochCrossZone(80, 80, 20)).toBe('overbought');
    expect(classifyLineStochCrossZone(90, 80, 20)).toBe('overbought');
  });

  it('oversold at <= 20', () => {
    expect(classifyLineStochCrossZone(20, 80, 20)).toBe('oversold');
    expect(classifyLineStochCrossZone(10, 80, 20)).toBe('oversold');
  });

  it('neutral in between', () => {
    expect(classifyLineStochCrossZone(50, 80, 20)).toBe('neutral');
  });
});

describe('detectLineStochCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineStochCrossCrosses([40, 60], [50, 50])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineStochCrossCrosses([60, 40], [50, 50])[1]).toBe('down');
  });

  it('null on warmup', () => {
    expect(
      detectLineStochCrossCrosses([null, 60], [null, 50]),
    ).toEqual([null, null]);
  });

  it('no second cross after staying above', () => {
    const ev = detectLineStochCrossCrosses([60, 70, 80], [50, 50, 50]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('classifyLineStochCrossTrigger', () => {
  it('null when no cross', () => {
    expect(classifyLineStochCrossTrigger(null, 50, 80, 20)).toBe(null);
  });

  it('oversold on up cross at low %K', () => {
    expect(classifyLineStochCrossTrigger('up', 15, 80, 20)).toBe('oversold');
  });

  it('overbought on down cross at high %K', () => {
    expect(classifyLineStochCrossTrigger('down', 85, 80, 20)).toBe(
      'overbought',
    );
  });

  it('neutral on cross in middle', () => {
    expect(classifyLineStochCrossTrigger('up', 50, 80, 20)).toBe('neutral');
    expect(classifyLineStochCrossTrigger('down', 50, 80, 20)).toBe(
      'neutral',
    );
  });
});

describe('runLineStochCross', () => {
  it('ok=false on short data', () => {
    const run = runLineStochCross(constBar(5, 50), {
      kLength: 3,
      dLength: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineStochCross(constBar(20, 50), {
      kLength: 3,
      dLength: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineStochCross(constBar(40, 50));
    expect(run.kLength).toBe(DEFAULT_CHART_LINE_STOCH_CROSS_K_LENGTH);
    expect(run.dLength).toBe(DEFAULT_CHART_LINE_STOCH_CROSS_D_LENGTH);
    expect(run.overboughtLevel).toBe(
      DEFAULT_CHART_LINE_STOCH_CROSS_OVERBOUGHT_LEVEL,
    );
    expect(run.oversoldLevel).toBe(
      DEFAULT_CHART_LINE_STOCH_CROSS_OVERSOLD_LEVEL,
    );
  });

  it('respects explicit options', () => {
    const run = runLineStochCross(constBar(20, 50), {
      kLength: 5,
      dLength: 2,
      overboughtLevel: 70,
      oversoldLevel: 30,
    });
    expect(run.kLength).toBe(5);
    expect(run.dLength).toBe(2);
    expect(run.overboughtLevel).toBe(70);
    expect(run.oversoldLevel).toBe(30);
  });

  it('sorts by x', () => {
    const data: ChartLineStochCrossPoint[] = [
      { x: 2, high: 3, low: 2, close: 3 },
      { x: 0, high: 1, low: 0, close: 1 },
      { x: 1, high: 2, low: 1, close: 2 },
    ];
    const run = runLineStochCross(data, { kLength: 2, dLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses and zero triggers', () => {
    const run = runLineStochCross(constBar(20, 50), {
      kLength: 3,
      dLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
    expect(run.oversoldTriggerCount).toBe(0);
    expect(run.overboughtTriggerCount).toBe(0);
  });

  it('LINEAR UP yields zero crosses and overbought zone', () => {
    const run = runLineStochCross(linearUp(20), {
      kLength: 3,
      dLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
    expect(run.overboughtCount).toBeGreaterThan(0);
  });

  it('LINEAR DOWN yields zero crosses and oversold zone', () => {
    const run = runLineStochCross(linearDown(20), {
      kLength: 3,
      dLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
    expect(run.oversoldCount).toBeGreaterThan(0);
  });
});

describe('computeLineStochCrossLayout', () => {
  it('ok=false for empty', () => {
    const layout = computeLineStochCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true for sufficient data', () => {
    const layout = computeLineStochCrossLayout({ data: linearUp(30) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above osc', () => {
    const layout = computeLineStochCrossLayout({ data: linearUp(30) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('osc axis fixed to [0, 100]', () => {
    const layout = computeLineStochCrossLayout({ data: linearUp(30) });
    expect(layout.oscMin).toBe(0);
    expect(layout.oscMax).toBe(100);
  });

  it('produces price path and dots', () => {
    const layout = computeLineStochCrossLayout({ data: linearUp(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces k and d paths when defined', () => {
    const layout = computeLineStochCrossLayout({
      data: linearUp(30),
      kLength: 3,
      dLength: 3,
    });
    expect(layout.kPath.length).toBeGreaterThan(0);
    expect(layout.dPath.length).toBeGreaterThan(0);
  });

  it('k path empty for CONST input', () => {
    const layout = computeLineStochCrossLayout({
      data: constBar(20, 50),
      kLength: 3,
      dLength: 3,
    });
    expect(layout.kPath).toBe('');
    expect(layout.dPath).toBe('');
  });
});

describe('describeLineStochCrossChart', () => {
  it('No data for empty', () => {
    expect(describeLineStochCrossChart([])).toBe('No data');
  });

  it('mentions Stoch Cross', () => {
    expect(describeLineStochCrossChart(linearUp(20))).toContain(
      'Stoch Cross',
    );
  });

  it('reports parameters', () => {
    const desc = describeLineStochCrossChart(linearUp(20), {
      kLength: 5,
      dLength: 2,
      overboughtLevel: 70,
      oversoldLevel: 30,
    });
    expect(desc).toContain('kLength 5');
    expect(desc).toContain('dLength 2');
    expect(desc).toContain('overboughtLevel 70');
    expect(desc).toContain('oversoldLevel 30');
  });
});

describe('<ChartLineStochCross />', () => {
  it('empty placeholder for no data', () => {
    const { container } = render(<ChartLineStochCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineStochCross data={linearUp(30)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Stochastic');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStochCross data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineStochCross
        data={linearUp(30)}
        kLength={5}
        dLength={2}
        overboughtLevel={70}
        oversoldLevel={30}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross"]',
    );
    expect(root?.getAttribute('data-k-length')).toBe('5');
    expect(root?.getAttribute('data-d-length')).toBe('2');
    expect(root?.getAttribute('data-overbought-level')).toBe('70');
    expect(root?.getAttribute('data-oversold-level')).toBe('30');
  });

  it('exposes cross + trigger counts', () => {
    const { container } = render(<ChartLineStochCross data={linearUp(30)} />);
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
    expect(root?.getAttribute('data-oversold-trigger-count')).toBe('0');
    expect(root?.getAttribute('data-overbought-trigger-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineStochCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-aria-desc"]',
      )?.textContent,
    ).toContain('Stoch Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineStochCross data={linearUp(30)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="k"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="d"]')).toBeTruthy();
  });

  it('legend toggles a series', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineStochCross
        data={linearUp(30)}
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
      <ChartLineStochCross
        data={linearUp(30)}
        hiddenSeries={['k']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-cross-k"]'),
    ).toBe(null);
  });

  it('renders the badge', () => {
    const { container } = render(<ChartLineStochCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders overbought and oversold lines by default', () => {
    const { container } = render(<ChartLineStochCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-overbought"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-oversold"]',
      ),
    ).toBeTruthy();
  });

  it('hides overbought when showOverbought=false', () => {
    const { container } = render(
      <ChartLineStochCross
        data={linearUp(30)}
        showOverbought={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-overbought"]',
      ),
    ).toBe(null);
  });

  it('hides oversold when showOversold=false', () => {
    const { container } = render(
      <ChartLineStochCross
        data={linearUp(30)}
        showOversold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-oversold"]',
      ),
    ).toBe(null);
  });

  it('hides midline when showMidline=false', () => {
    const { container } = render(
      <ChartLineStochCross
        data={linearUp(30)}
        showMidline={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-midline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineStochCross data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineStochCross data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineStochCross data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineStochCross
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineStochCross data={linearUp(30)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-stoch-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders k and d paths', () => {
    const { container } = render(
      <ChartLineStochCross
        data={linearUp(30)}
        kLength={3}
        dLength={3}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-cross-k"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-stoch-cross-d"]'),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineStochCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineStochCross
        data={linearUp(30)}
        defaultHiddenSeries={['d']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-cross-d"]'),
    ).toBe(null);
  });
});

describe('Stoch Cross integration', () => {
  it('LINEAR UP yields %K = %D = 100 across multiple (k, d)', () => {
    for (const [K, D] of [
      [3, 3],
      [4, 2],
      [5, 3],
    ] as const) {
      const ch = computeLineStochCross(linearUp(K + D + 5), {
        kLength: K,
        dLength: D,
      });
      let saw = false;
      for (let i = K + D - 1; i < K + D + 5; i += 1) {
        const k = ch.k[i];
        const d = ch.d[i];
        if (k != null && d != null) {
          expect(k).toBe(100);
          expect(d).toBe(100);
          saw = true;
        }
      }
      expect(saw).toBe(true);
    }
  });

  it('LINEAR DOWN yields %K = %D = 0 across multiple (k, d)', () => {
    for (const [K, D] of [
      [3, 3],
      [4, 2],
      [5, 3],
    ] as const) {
      const ch = computeLineStochCross(linearDown(K + D + 5), {
        kLength: K,
        dLength: D,
      });
      let saw = false;
      for (let i = K + D - 1; i < K + D + 5; i += 1) {
        const k = ch.k[i];
        const d = ch.d[i];
        if (k != null && d != null) {
          expect(k).toBe(0);
          expect(d).toBe(0);
          saw = true;
        }
      }
      expect(saw).toBe(true);
    }
  });

  it('all three anchors yield zero crosses and zero triggers', () => {
    for (const series of [
      constBar(30, 50),
      linearUp(30),
      linearDown(30),
    ]) {
      const run = runLineStochCross(series, {
        kLength: 3,
        dLength: 3,
      });
      expect(run.upCrossCount).toBe(0);
      expect(run.downCrossCount).toBe(0);
      expect(run.oversoldTriggerCount).toBe(0);
      expect(run.overboughtTriggerCount).toBe(0);
    }
  });
});
