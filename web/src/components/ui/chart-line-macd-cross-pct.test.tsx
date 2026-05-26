import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMacdCrossPct,
  applyLineMacdCrossPctEma,
  classifyLineMacdCrossPctRegime,
  computeLineMacdCrossPct,
  computeLineMacdCrossPctLayout,
  describeLineMacdCrossPctChart,
  getLineMacdCrossPctFinitePoints,
  normalizeLineMacdCrossPctLength,
  runLineMacdCrossPct,
  DEFAULT_CHART_LINE_MACD_CROSS_PCT_FAST_LENGTH,
  DEFAULT_CHART_LINE_MACD_CROSS_PCT_SLOW_LENGTH,
} from './chart-line-macd-cross-pct';
import type { ChartLineMacdCrossPctPoint } from './chart-line-macd-cross-pct';

const constBar = (count: number, K: number): ChartLineMacdCrossPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineMacdCrossPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineMacdCrossPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineMacdCrossPctFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineMacdCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineMacdCrossPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineMacdCrossPctFinitePoints([
      null as unknown as ChartLineMacdCrossPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineMacdCrossPctLength', () => {
  it('uses default', () => {
    expect(normalizeLineMacdCrossPctLength(undefined, 12)).toBe(12);
  });

  it('rejects below 2', () => {
    expect(normalizeLineMacdCrossPctLength(1, 12)).toBe(12);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineMacdCrossPctLength(5, 12)).toBe(5);
  });
});

describe('applyLineMacdCrossPctEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      const out = applyLineMacdCrossPctEma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('computeLineMacdCrossPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineMacdCrossPct(null);
    expect(ch.macd).toEqual([]);
    expect(ch.macdPct).toEqual([]);
  });

  it('CONST K > 0 yields macd = 0 and macdPct = 0 bit-exact', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLineMacdCrossPct(constBar(40, K), {
        fastLength: 3,
        slowLength: 5,
      });
      for (let i = 6; i < 40; i += 1) {
        expect(ch.macd[i]).toBe(0);
        expect(ch.macdPct[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 yields macdPct = null', () => {
    const ch = computeLineMacdCrossPct(constBar(40, 0), {
      fastLength: 3,
      slowLength: 5,
    });
    for (const v of ch.macdPct) expect(v).toBe(null);
  });

  it('LINEAR UP macd > 0', () => {
    const ch = computeLineMacdCrossPct(linearUp(40), {
      fastLength: 3,
      slowLength: 5,
    });
    let saw = false;
    for (const v of ch.macd) {
      if (v != null && v > 0) saw = true;
    }
    expect(saw).toBe(true);
  });

  it('LINEAR DOWN macd < 0', () => {
    const ch = computeLineMacdCrossPct(linearDown(40), {
      fastLength: 3,
      slowLength: 5,
    });
    let saw = false;
    for (const v of ch.macd) {
      if (v != null && v < 0) saw = true;
    }
    expect(saw).toBe(true);
  });

  it('output length matches input', () => {
    const ch = computeLineMacdCrossPct(linearUp(40), {
      fastLength: 3,
      slowLength: 5,
    });
    expect(ch.macd.length).toBe(40);
    expect(ch.macdPct.length).toBe(40);
  });

  it('does not mutate input', () => {
    const data = linearUp(30);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineMacdCrossPct(data, { fastLength: 3, slowLength: 5 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineMacdCrossPctRegime', () => {
  it('above for positive', () => {
    expect(classifyLineMacdCrossPctRegime(0.5)).toBe('above');
  });

  it('below for negative', () => {
    expect(classifyLineMacdCrossPctRegime(-0.5)).toBe('below');
  });

  it('at for zero', () => {
    expect(classifyLineMacdCrossPctRegime(0)).toBe('at');
  });

  it('none for null', () => {
    expect(classifyLineMacdCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineMacdCrossPct', () => {
  it('ok=false on short data', () => {
    const run = runLineMacdCrossPct(constBar(3, 50), {
      fastLength: 3,
      slowLength: 5,
    });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineMacdCrossPct(constBar(10, 50), {
      fastLength: 3,
      slowLength: 5,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineMacdCrossPct(constBar(40, 50));
    expect(run.fastLength).toBe(
      DEFAULT_CHART_LINE_MACD_CROSS_PCT_FAST_LENGTH,
    );
    expect(run.slowLength).toBe(
      DEFAULT_CHART_LINE_MACD_CROSS_PCT_SLOW_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLineMacdCrossPct(constBar(20, 50), {
      fastLength: 4,
      slowLength: 8,
    });
    expect(run.fastLength).toBe(4);
    expect(run.slowLength).toBe(8);
  });

  it('sorts by x', () => {
    const data: ChartLineMacdCrossPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineMacdCrossPct(data, {
      fastLength: 2,
      slowLength: 3,
    });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 regime at after warmup', () => {
    const run = runLineMacdCrossPct(constBar(40, 50), {
      fastLength: 3,
      slowLength: 5,
    });
    expect(run.atCount).toBeGreaterThan(0);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('CONST K = 0 regime none', () => {
    const run = runLineMacdCrossPct(constBar(40, 0), {
      fastLength: 3,
      slowLength: 5,
    });
    expect(run.noneCount).toBe(40);
  });
});

describe('computeLineMacdCrossPctLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineMacdCrossPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineMacdCrossPctLayout({
      data: linearUp(40),
      fastLength: 3,
      slowLength: 5,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above osc', () => {
    const layout = computeLineMacdCrossPctLayout({ data: linearUp(40) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('produces price + macdPct paths', () => {
    const layout = computeLineMacdCrossPctLayout({
      data: linearUp(40),
      fastLength: 3,
      slowLength: 5,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.macdPctPath.length).toBeGreaterThan(0);
  });

  it('zero inside osc axis', () => {
    const layout = computeLineMacdCrossPctLayout({
      data: linearUp(40),
      fastLength: 3,
      slowLength: 5,
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });
});

describe('describeLineMacdCrossPctChart', () => {
  it('No data on empty', () => {
    expect(describeLineMacdCrossPctChart([])).toBe('No data');
  });

  it('mentions MACD Pct', () => {
    expect(describeLineMacdCrossPctChart(linearUp(40))).toContain(
      'MACD Pct',
    );
  });

  it('reports parameters', () => {
    const desc = describeLineMacdCrossPctChart(linearUp(40), {
      fastLength: 4,
      slowLength: 8,
    });
    expect(desc).toContain('fastLength 4');
    expect(desc).toContain('slowLength 8');
  });
});

describe('<ChartLineMacdCrossPct />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineMacdCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('MACD Percent');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMacdCrossPct data={linearUp(40)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineMacdCrossPct
        data={linearUp(40)}
        fastLength={4}
        slowLength={8}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-cross-pct"]',
    );
    expect(root?.getAttribute('data-fast-length')).toBe('4');
    expect(root?.getAttribute('data-slow-length')).toBe('8');
  });

  it('exposes regime counts', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={constBar(40, 50)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-cross-pct"]',
    );
    expect(root?.getAttribute('data-at-count')).not.toBe(null);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-aria-desc"]',
      )?.textContent,
    ).toContain('MACD Pct');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="macdPct"]'),
    ).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMacdCrossPct
        data={linearUp(40)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="macdPct"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'macdPct',
      hidden: true,
    });
  });

  it('hides macdPct when controlled', () => {
    const { container } = render(
      <ChartLineMacdCrossPct
        data={linearUp(40)}
        hiddenSeries={['macdPct']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-macd"]',
      ),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineMacdCrossPct
        data={linearUp(40)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineMacdCrossPct
        data={linearUp(40)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-cross-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-macd-cross-pct-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders macdPct path', () => {
    const { container } = render(
      <ChartLineMacdCrossPct
        data={linearUp(40)}
        fastLength={3}
        slowLength={5}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-macd"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(
      <ChartLineMacdCrossPct data={linearUp(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineMacdCrossPct
        data={linearUp(40)}
        defaultHiddenSeries={['macdPct']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-pct-macd"]',
      ),
    ).toBe(null);
  });
});

describe('MACD Pct integration', () => {
  it('CONST K > 0 yields macd = macdPct = 0 bit-exact across multiple K and lengths', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const [F, S] of [
        [3, 5],
        [4, 8],
        [5, 10],
      ] as const) {
        const ch = computeLineMacdCrossPct(constBar(S * 2, K), {
          fastLength: F,
          slowLength: S,
        });
        for (let i = S; i < S * 2; i += 1) {
          expect(ch.macd[i]).toBe(0);
          expect(ch.macdPct[i]).toBe(0);
        }
      }
    }
  });
});
