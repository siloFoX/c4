import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAdxCross,
  applyLineAdxCrossWilder,
  classifyLineAdxCrossRegime,
  computeLineAdxCross,
  computeLineAdxCrossDm,
  computeLineAdxCrossLayout,
  computeLineAdxCrossTr,
  describeLineAdxCrossChart,
  detectLineAdxCrossEvents,
  getLineAdxCrossFinitePoints,
  normalizeLineAdxCrossLength,
  normalizeLineAdxCrossThreshold,
  runLineAdxCross,
  DEFAULT_CHART_LINE_ADX_CROSS_LENGTH,
  DEFAULT_CHART_LINE_ADX_CROSS_LOW_THRESHOLD,
  DEFAULT_CHART_LINE_ADX_CROSS_HIGH_THRESHOLD,
} from './chart-line-adx-cross';
import type { ChartLineAdxCrossPoint } from './chart-line-adx-cross';

const constBar = (count: number, K: number): ChartLineAdxCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineAdxCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineAdxCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i + 5,
    low: count - i - 5,
    close: count - i,
  }));

describe('getLineAdxCrossFinitePoints', () => {
  it('returns empty for null', () => {
    expect(getLineAdxCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN values', () => {
    const r = getLineAdxCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 0, close: 0 },
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineAdxCrossFinitePoints([
      null as unknown as ChartLineAdxCrossPoint,
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineAdxCrossLength', () => {
  it('uses default when undefined', () => {
    expect(normalizeLineAdxCrossLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineAdxCrossLength(1, 14)).toBe(14);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineAdxCrossLength(7, 14)).toBe(7);
  });
});

describe('normalizeLineAdxCrossThreshold', () => {
  it('uses default when undefined', () => {
    expect(normalizeLineAdxCrossThreshold(undefined, 20)).toBe(20);
  });

  it('rejects out-of-range', () => {
    expect(normalizeLineAdxCrossThreshold(-1, 20)).toBe(20);
    expect(normalizeLineAdxCrossThreshold(101, 20)).toBe(20);
  });

  it('accepts a valid threshold', () => {
    expect(normalizeLineAdxCrossThreshold(25, 20)).toBe(25);
  });
});

describe('applyLineAdxCrossWilder', () => {
  it('CONST K Wilder is K bit-exact', () => {
    for (const K of [0, 1, 5, 100]) {
      for (const L of [2, 5, 14]) {
        const out = applyLineAdxCrossWilder(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineAdxCrossWilder([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });
});

describe('computeLineAdxCrossTr', () => {
  it('first bar TR is high - low', () => {
    const tr = computeLineAdxCrossTr([
      { x: 0, high: 5, low: 3, close: 4 },
    ]);
    expect(tr[0]).toBe(2);
  });

  it('LINEAR UP yields TR = 1 everywhere', () => {
    const tr = computeLineAdxCrossTr(linearUp(10));
    for (const v of tr) {
      expect(v).toBe(1);
    }
  });

  it('LINEAR DOWN yields TR = 10 everywhere', () => {
    const tr = computeLineAdxCrossTr(linearDown(10));
    for (const v of tr) {
      expect(v).toBe(10);
    }
  });

  it('CONST OHLC yields TR = 0 everywhere', () => {
    const tr = computeLineAdxCrossTr(constBar(10, 50));
    for (const v of tr) {
      expect(v).toBe(0);
    }
  });
});

describe('computeLineAdxCrossDm', () => {
  it('LINEAR UP yields +DM=1 (after first) and -DM=0', () => {
    const { plusDm, minusDm } = computeLineAdxCrossDm(linearUp(10));
    expect(plusDm[0]).toBe(0);
    expect(minusDm[0]).toBe(0);
    for (let i = 1; i < 10; i += 1) {
      expect(plusDm[i]).toBe(1);
      expect(minusDm[i]).toBe(0);
    }
  });

  it('LINEAR DOWN yields -DM=1 (after first) and +DM=0', () => {
    const { plusDm, minusDm } = computeLineAdxCrossDm(linearDown(10));
    expect(plusDm[0]).toBe(0);
    expect(minusDm[0]).toBe(0);
    for (let i = 1; i < 10; i += 1) {
      expect(plusDm[i]).toBe(0);
      expect(minusDm[i]).toBe(1);
    }
  });

  it('CONST yields zero +DM and -DM everywhere', () => {
    const { plusDm, minusDm } = computeLineAdxCrossDm(constBar(10, 50));
    for (let i = 0; i < 10; i += 1) {
      expect(plusDm[i]).toBe(0);
      expect(minusDm[i]).toBe(0);
    }
  });
});

describe('computeLineAdxCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineAdxCross(null);
    expect(ch.adx).toEqual([]);
    expect(ch.tr).toEqual([]);
  });

  it('CONST yields adx = null everywhere', () => {
    const ch = computeLineAdxCross(constBar(40, 50), { length: 4 });
    for (const v of ch.adx) {
      expect(v).toBe(null);
    }
  });

  it('LINEAR UP yields ADX = 100 once defined (DX = 100 bit-exact)', () => {
    const ch = computeLineAdxCross(linearUp(40), { length: 4 });
    let saw100 = false;
    for (const v of ch.adx) {
      if (v != null) {
        expect(v).toBe(100);
        saw100 = true;
      }
    }
    expect(saw100).toBe(true);
  });

  it('LINEAR DOWN yields ADX = 100 once defined', () => {
    const ch = computeLineAdxCross(linearDown(40), { length: 4 });
    let saw100 = false;
    for (const v of ch.adx) {
      if (v != null) {
        expect(v).toBe(100);
        saw100 = true;
      }
    }
    expect(saw100).toBe(true);
  });

  it('output length matches input length', () => {
    const ch = computeLineAdxCross(linearUp(30), { length: 4 });
    expect(ch.adx.length).toBe(30);
  });

  it('does not mutate input', () => {
    const data = linearUp(30);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineAdxCross(data, { length: 4 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineAdxCrossRegime', () => {
  it('returns none for null', () => {
    expect(classifyLineAdxCrossRegime(null, 20, 40)).toBe('none');
  });

  it('returns weak below low threshold', () => {
    expect(classifyLineAdxCrossRegime(10, 20, 40)).toBe('weak');
  });

  it('returns trending in [low, high)', () => {
    expect(classifyLineAdxCrossRegime(25, 20, 40)).toBe('trending');
  });

  it('returns strong at or above high', () => {
    expect(classifyLineAdxCrossRegime(50, 20, 40)).toBe('strong');
    expect(classifyLineAdxCrossRegime(40, 20, 40)).toBe('strong');
  });
});

describe('detectLineAdxCrossEvents', () => {
  it('flags enter20 on upward cross of low threshold', () => {
    const ev = detectLineAdxCrossEvents([10, 25], 20, 40);
    expect(ev[1]).toBe('enter20');
  });

  it('flags exit20 on downward cross of low threshold', () => {
    const ev = detectLineAdxCrossEvents([25, 10], 20, 40);
    expect(ev[1]).toBe('exit20');
  });

  it('flags enter40 on upward cross of high threshold', () => {
    const ev = detectLineAdxCrossEvents([35, 45], 20, 40);
    expect(ev[1]).toBe('enter40');
  });

  it('flags exit40 on downward cross of high threshold', () => {
    const ev = detectLineAdxCrossEvents([45, 35], 20, 40);
    expect(ev[1]).toBe('exit40');
  });

  it('warmup null does not fire', () => {
    expect(detectLineAdxCrossEvents([null, 25], 20, 40)).toEqual([
      null,
      null,
    ]);
  });

  it('no event when staying above both thresholds', () => {
    const ev = detectLineAdxCrossEvents([50, 60, 70], 20, 40);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineAdxCross', () => {
  it('ok=false on short data', () => {
    const run = runLineAdxCross(constBar(5, 50), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineAdxCross(constBar(30, 50), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineAdxCross(constBar(60, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_ADX_CROSS_LENGTH);
    expect(run.lowThreshold).toBe(
      DEFAULT_CHART_LINE_ADX_CROSS_LOW_THRESHOLD,
    );
    expect(run.highThreshold).toBe(
      DEFAULT_CHART_LINE_ADX_CROSS_HIGH_THRESHOLD,
    );
  });

  it('respects explicit options', () => {
    const run = runLineAdxCross(constBar(40, 50), {
      length: 7,
      lowThreshold: 15,
      highThreshold: 50,
    });
    expect(run.length).toBe(7);
    expect(run.lowThreshold).toBe(15);
    expect(run.highThreshold).toBe(50);
  });

  it('sorts by x', () => {
    const data: ChartLineAdxCrossPoint[] = [
      { x: 2, high: 3, low: 2, close: 3 },
      { x: 0, high: 1, low: 0, close: 1 },
      { x: 1, high: 2, low: 1, close: 2 },
    ];
    const run = runLineAdxCross(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero cross events', () => {
    const run = runLineAdxCross(constBar(40, 50), { length: 4 });
    expect(run.enter20Count).toBe(0);
    expect(run.exit20Count).toBe(0);
    expect(run.enter40Count).toBe(0);
    expect(run.exit40Count).toBe(0);
  });

  it('LINEAR UP yields zero cross events (ADX = 100 directly)', () => {
    const run = runLineAdxCross(linearUp(40), { length: 4 });
    expect(run.enter20Count).toBe(0);
    expect(run.exit20Count).toBe(0);
    expect(run.enter40Count).toBe(0);
    expect(run.exit40Count).toBe(0);
  });

  it('LINEAR DOWN yields zero cross events', () => {
    const run = runLineAdxCross(linearDown(40), { length: 4 });
    expect(run.enter20Count).toBe(0);
    expect(run.exit20Count).toBe(0);
    expect(run.enter40Count).toBe(0);
    expect(run.exit40Count).toBe(0);
  });

  it('CONST regimes are all none', () => {
    const run = runLineAdxCross(constBar(40, 50), { length: 4 });
    expect(run.noneCount).toBe(40);
    expect(run.weakCount).toBe(0);
  });

  it('LINEAR UP regimes settle to strong', () => {
    const run = runLineAdxCross(linearUp(40), { length: 4 });
    expect(run.strongCount).toBeGreaterThan(0);
  });
});

describe('computeLineAdxCrossLayout', () => {
  it('ok=false for empty data', () => {
    const layout = computeLineAdxCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true for sufficient data', () => {
    const layout = computeLineAdxCrossLayout({ data: linearUp(40) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above adx', () => {
    const layout = computeLineAdxCrossLayout({ data: linearUp(40) });
    expect(layout.priceBottom).toBeLessThan(layout.adxTop);
  });

  it('adx axis fixed to [0, 100]', () => {
    const layout = computeLineAdxCrossLayout({ data: linearUp(40) });
    expect(layout.adxMin).toBe(0);
    expect(layout.adxMax).toBe(100);
  });

  it('produces price path and dots', () => {
    const layout = computeLineAdxCrossLayout({ data: linearUp(40) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('produces an adx path when defined', () => {
    const layout = computeLineAdxCrossLayout({
      data: linearUp(40),
      length: 4,
    });
    expect(layout.adxPath.length).toBeGreaterThan(0);
  });

  it('produces an empty adx path when adx is null everywhere', () => {
    const layout = computeLineAdxCrossLayout({
      data: constBar(40, 50),
      length: 4,
    });
    expect(layout.adxPath).toBe('');
  });
});

describe('describeLineAdxCrossChart', () => {
  it('returns No data on empty', () => {
    expect(describeLineAdxCrossChart([])).toBe('No data');
  });

  it('mentions ADX Cross', () => {
    expect(describeLineAdxCrossChart(linearUp(40))).toContain('ADX Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineAdxCrossChart(linearUp(40), {
      length: 7,
      lowThreshold: 15,
      highThreshold: 50,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('low 15');
    expect(desc).toContain('high 50');
  });
});

describe('<ChartLineAdxCross />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineAdxCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineAdxCross data={linearUp(40)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('ADX Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAdxCross data={linearUp(40)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineAdxCross
        data={linearUp(40)}
        length={7}
        lowThreshold={15}
        highThreshold={50}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-low-threshold')).toBe('15');
    expect(root?.getAttribute('data-high-threshold')).toBe('50');
  });

  it('exposes total-points and event counts', () => {
    const { container } = render(<ChartLineAdxCross data={linearUp(40)} />);
    const root = container.querySelector(
      '[data-section="chart-line-adx-cross"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('40');
    expect(root?.getAttribute('data-enter20-count')).toBe('0');
    expect(root?.getAttribute('data-exit20-count')).toBe('0');
    expect(root?.getAttribute('data-enter40-count')).toBe('0');
    expect(root?.getAttribute('data-exit40-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineAdxCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-aria-desc"]',
      )?.textContent,
    ).toContain('ADX Cross');
  });

  it('renders both legend items', () => {
    const { container } = render(<ChartLineAdxCross data={linearUp(40)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="adx"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAdxCross
        data={linearUp(40)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="adx"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'adx',
      hidden: true,
    });
  });

  it('hides adx when controlled', () => {
    const { container } = render(
      <ChartLineAdxCross
        data={linearUp(40)}
        hiddenSeries={['adx']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-adx-path"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge', () => {
    const { container } = render(<ChartLineAdxCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders low and high threshold lines by default', () => {
    const { container } = render(<ChartLineAdxCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-low-threshold"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-high-threshold"]',
      ),
    ).toBeTruthy();
  });

  it('hides low threshold when showLowThreshold=false', () => {
    const { container } = render(
      <ChartLineAdxCross
        data={linearUp(40)}
        showLowThreshold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-low-threshold"]',
      ),
    ).toBe(null);
  });

  it('hides high threshold when showHighThreshold=false', () => {
    const { container } = render(
      <ChartLineAdxCross
        data={linearUp(40)}
        showHighThreshold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-high-threshold"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis=false', () => {
    const { container } = render(
      <ChartLineAdxCross data={linearUp(40)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineAdxCross data={linearUp(40)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAdxCross data={linearUp(40)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAdxCross
        data={linearUp(40)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAdxCross data={linearUp(40)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-adx-cross-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders adx path', () => {
    const { container } = render(
      <ChartLineAdxCross data={linearUp(40)} length={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-adx-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineAdxCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineAdxCross
        data={linearUp(40)}
        defaultHiddenSeries={['adx']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-adx-path"]',
      ),
    ).toBe(null);
  });
});

describe('ADX Cross integration', () => {
  it('LINEAR UP yields ADX = 100 across multiple lengths', () => {
    for (const L of [3, 4, 7]) {
      const ch = computeLineAdxCross(linearUp(L * 4), { length: L });
      let saw100 = false;
      for (const v of ch.adx) {
        if (v != null) {
          expect(v).toBe(100);
          saw100 = true;
        }
      }
      expect(saw100).toBe(true);
    }
  });

  it('LINEAR DOWN yields ADX = 100 across multiple lengths', () => {
    for (const L of [3, 4, 7]) {
      const ch = computeLineAdxCross(linearDown(L * 4), { length: L });
      let saw100 = false;
      for (const v of ch.adx) {
        if (v != null) {
          expect(v).toBe(100);
          saw100 = true;
        }
      }
      expect(saw100).toBe(true);
    }
  });

  it('CONST yields zero crosses across multiple K and length', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [3, 4, 7]) {
        const run = runLineAdxCross(constBar(L * 4, K), { length: L });
        expect(run.enter20Count).toBe(0);
        expect(run.exit20Count).toBe(0);
        expect(run.enter40Count).toBe(0);
        expect(run.exit40Count).toBe(0);
      }
    }
  });
});
