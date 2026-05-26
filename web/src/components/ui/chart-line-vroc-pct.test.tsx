import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVrocPct,
  classifyLineVrocPctRegime,
  computeLineVrocPct,
  computeLineVrocPctLayout,
  describeLineVrocPctChart,
  getLineVrocPctFinitePoints,
  normalizeLineVrocPctLength,
  runLineVrocPct,
  DEFAULT_CHART_LINE_VROC_PCT_LENGTH,
} from './chart-line-vroc-pct';
import type { ChartLineVrocPctPoint } from './chart-line-vroc-pct';

const constBar = (
  count: number,
  K: number,
  V = 100,
): ChartLineVrocPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: K,
    volume: V,
  }));

const linearUp = (count: number): ChartLineVrocPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i + 1,
    volume: (i + 1) * 100,
  }));

const linearDown = (count: number): ChartLineVrocPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: count - i,
    volume: (count - i) * 100,
  }));

describe('getLineVrocPctFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineVrocPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineVrocPctFinitePoints([
      { x: 0, close: Number.NaN, volume: 100 },
      { x: 1, close: 10, volume: 100 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineVrocPctFinitePoints([
      null as unknown as ChartLineVrocPctPoint,
      { x: 1, close: 10, volume: 100 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineVrocPctLength', () => {
  it('uses default', () => {
    expect(normalizeLineVrocPctLength(undefined, 12)).toBe(12);
  });

  it('rejects below 2', () => {
    expect(normalizeLineVrocPctLength(1, 12)).toBe(12);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineVrocPctLength(5, 12)).toBe(5);
  });
});

describe('computeLineVrocPct', () => {
  it('returns empty for null', () => {
    expect(computeLineVrocPct(null)).toEqual([]);
  });

  it('CONST V > 0 yields VROC = 0 bit-exact', () => {
    for (const V of [1, 100, 1000]) {
      const out = computeLineVrocPct(constBar(20, 50, V), { length: 5 });
      for (let i = 5; i < 20; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('CONST V = 0 yields VROC = null', () => {
    const out = computeLineVrocPct(constBar(20, 50, 0), { length: 5 });
    for (const v of out) expect(v).toBe(null);
  });

  it('LINEAR UP yields VROC > 0', () => {
    const out = computeLineVrocPct(linearUp(20), { length: 5 });
    let saw = false;
    for (const v of out) {
      if (v != null) {
        expect(v).toBeGreaterThan(0);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('LINEAR DOWN yields VROC < 0', () => {
    const out = computeLineVrocPct(linearDown(20), { length: 5 });
    let saw = false;
    for (const v of out) {
      if (v != null) {
        expect(v).toBeLessThan(0);
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('output length matches input', () => {
    const out = computeLineVrocPct(linearUp(20), { length: 5 });
    expect(out.length).toBe(20);
  });

  it('does not mutate input', () => {
    const data = linearUp(20);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineVrocPct(data, { length: 5 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineVrocPctRegime', () => {
  it('above for positive', () => {
    expect(classifyLineVrocPctRegime(0.5)).toBe('above');
  });

  it('below for negative', () => {
    expect(classifyLineVrocPctRegime(-0.5)).toBe('below');
  });

  it('at for zero', () => {
    expect(classifyLineVrocPctRegime(0)).toBe('at');
  });

  it('none for null', () => {
    expect(classifyLineVrocPctRegime(null)).toBe('none');
  });
});

describe('runLineVrocPct', () => {
  it('ok=false on short data', () => {
    const run = runLineVrocPct(constBar(3, 50), { length: 5 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineVrocPct(constBar(20, 50), { length: 5 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineVrocPct(constBar(40, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_VROC_PCT_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineVrocPct(constBar(20, 50), { length: 5 });
    expect(run.length).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineVrocPctPoint[] = [
      { x: 2, close: 30, volume: 100 },
      { x: 0, close: 10, volume: 100 },
      { x: 1, close: 20, volume: 100 },
    ];
    const run = runLineVrocPct(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST V > 0 yields regime at after warmup', () => {
    const run = runLineVrocPct(constBar(20, 50, 100), { length: 5 });
    expect(run.atCount).toBeGreaterThan(0);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('CONST V = 0 yields regime none', () => {
    const run = runLineVrocPct(constBar(20, 50, 0), { length: 5 });
    expect(run.noneCount).toBe(20);
  });

  it('LINEAR UP yields regime above', () => {
    const run = runLineVrocPct(linearUp(20), { length: 5 });
    expect(run.aboveCount).toBeGreaterThan(0);
  });

  it('LINEAR DOWN yields regime below', () => {
    const run = runLineVrocPct(linearDown(20), { length: 5 });
    expect(run.belowCount).toBeGreaterThan(0);
  });
});

describe('computeLineVrocPctLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineVrocPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineVrocPctLayout({
      data: linearUp(20),
      length: 5,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above osc', () => {
    const layout = computeLineVrocPctLayout({ data: linearUp(20) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('produces price + vroc paths', () => {
    const layout = computeLineVrocPctLayout({
      data: linearUp(20),
      length: 5,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.vrocPath.length).toBeGreaterThan(0);
  });

  it('zero inside osc axis', () => {
    const layout = computeLineVrocPctLayout({
      data: linearUp(20),
      length: 5,
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });

  it('CONST V = 0 yields empty vroc path', () => {
    const layout = computeLineVrocPctLayout({
      data: constBar(20, 50, 0),
      length: 5,
    });
    expect(layout.vrocPath).toBe('');
  });
});

describe('describeLineVrocPctChart', () => {
  it('No data on empty', () => {
    expect(describeLineVrocPctChart([])).toBe('No data');
  });

  it('mentions VROC Pct', () => {
    expect(describeLineVrocPctChart(linearUp(20))).toContain('VROC Pct');
  });

  it('reports length', () => {
    expect(describeLineVrocPctChart(linearUp(20), { length: 7 })).toContain(
      'length 7',
    );
  });
});

describe('<ChartLineVrocPct />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineVrocPct data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-vroc-pct-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineVrocPct data={linearUp(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('VROC Percent');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVrocPct data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineVrocPct data={linearUp(20)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vroc-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('exposes regime counts', () => {
    const { container } = render(<ChartLineVrocPct data={constBar(20, 50)} />);
    const root = container.querySelector(
      '[data-section="chart-line-vroc-pct"]',
    );
    expect(root?.getAttribute('data-at-count')).not.toBe(null);
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineVrocPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-pct-aria-desc"]',
      )?.textContent,
    ).toContain('VROC Pct');
  });

  it('renders both legend items', () => {
    const { container } = render(<ChartLineVrocPct data={linearUp(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="vroc"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVrocPct
        data={linearUp(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="vroc"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'vroc', hidden: true });
  });

  it('hides vroc when controlled', () => {
    const { container } = render(
      <ChartLineVrocPct
        data={linearUp(20)}
        hiddenSeries={['vroc']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-pct-vroc"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineVrocPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-pct-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineVrocPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-pct-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineVrocPct data={linearUp(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-pct-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineVrocPct data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-pct-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineVrocPct data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-pct-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineVrocPct data={linearUp(20)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-pct-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineVrocPct
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vroc-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineVrocPct data={linearUp(20)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-vroc-pct-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders vroc path', () => {
    const { container } = render(
      <ChartLineVrocPct data={linearUp(20)} length={5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-pct-vroc"]'),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineVrocPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineVrocPct
        data={linearUp(20)}
        defaultHiddenSeries={['vroc']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vroc-pct-vroc"]'),
    ).toBe(null);
  });
});

describe('VROC Pct integration', () => {
  it('CONST V > 0 yields VROC = 0 bit-exact across multiple V and length', () => {
    for (const V of [1, 100, 1000]) {
      for (const L of [3, 5, 7]) {
        const out = computeLineVrocPct(constBar(L * 3, 50, V), {
          length: L,
        });
        for (let i = L; i < L * 3; i += 1) {
          expect(out[i]).toBe(0);
        }
      }
    }
  });
});
