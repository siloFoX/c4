import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineFractalPivot,
  classifyLineFractalPivotKind,
  computeLineFractalPivot,
  computeLineFractalPivotLayout,
  describeLineFractalPivotChart,
  detectLineFractalPivotLowerFractals,
  detectLineFractalPivotUpperFractals,
  getLineFractalPivotFinitePoints,
  normalizeLineFractalPivotFractalLookback,
  runLineFractalPivot,
  DEFAULT_CHART_LINE_FRACTAL_PIVOT_FRACTAL_LOOKBACK,
} from './chart-line-fractal-pivot';
import type { ChartLineFractalPivotPoint } from './chart-line-fractal-pivot';

const constBar = (count: number, K: number): ChartLineFractalPivotPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineFractalPivotPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineFractalPivotPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

const sawtooth = (
  count: number,
  peakK: number,
  troughL: number,
): ChartLineFractalPivotPoint[] => {
  return Array.from({ length: count }, (_, i) => {
    let h: number;
    let l: number;
    const mod = i % 4;
    if (mod === 2) {
      h = peakK;
      l = peakK;
    } else if (mod === 0) {
      h = troughL;
      l = troughL;
    } else {
      h = (peakK + troughL) / 2;
      l = (peakK + troughL) / 2;
    }
    return { x: i, high: h, low: l, close: (h + l) / 2 };
  });
};

describe('getLineFractalPivotFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineFractalPivotFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const r = getLineFractalPivotFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineFractalPivotFinitePoints([
      null as unknown as ChartLineFractalPivotPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineFractalPivotFractalLookback', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineFractalPivotFractalLookback(undefined, 2)).toBe(2);
  });

  it('accepts 1', () => {
    expect(normalizeLineFractalPivotFractalLookback(1, 2)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineFractalPivotFractalLookback(0, 2)).toBe(2);
  });

  it('floors fractional', () => {
    expect(normalizeLineFractalPivotFractalLookback(3.7, 2)).toBe(3);
  });
});

describe('detectLineFractalPivotUpperFractals', () => {
  it('flags strict 5-bar maxima', () => {
    const out = detectLineFractalPivotUpperFractals(
      [1, 2, 5, 2, 1, 0, 1, 2, 6, 2, 1],
      2,
    );
    expect(out[2]).toBe(true);
    expect(out[8]).toBe(true);
  });

  it('does not flag plateau (non-strict)', () => {
    const out = detectLineFractalPivotUpperFractals([1, 5, 5, 5, 1], 2);
    expect(out[2]).toBe(false);
  });

  it('LINEAR UP yields no fractals', () => {
    const out = detectLineFractalPivotUpperFractals([1, 2, 3, 4, 5, 6, 7], 2);
    for (const v of out) expect(v).toBe(false);
  });

  it('respects custom lookback', () => {
    const out = detectLineFractalPivotUpperFractals(
      [1, 2, 3, 5, 3, 2, 1, 2, 3, 5, 3, 2, 1],
      3,
    );
    expect(out[3]).toBe(true);
    expect(out[9]).toBe(true);
  });
});

describe('detectLineFractalPivotLowerFractals', () => {
  it('flags strict 5-bar minima', () => {
    const out = detectLineFractalPivotLowerFractals(
      [5, 4, 1, 4, 5, 6, 5, 4, 0, 4, 5],
      2,
    );
    expect(out[2]).toBe(true);
    expect(out[8]).toBe(true);
  });

  it('LINEAR DOWN yields no fractals', () => {
    const out = detectLineFractalPivotLowerFractals([7, 6, 5, 4, 3, 2, 1], 2);
    for (const v of out) expect(v).toBe(false);
  });
});

describe('computeLineFractalPivot', () => {
  it('returns empty for null', () => {
    const ch = computeLineFractalPivot(null);
    expect(ch.upperFractal).toEqual([]);
    expect(ch.lowerFractal).toEqual([]);
  });

  it('CONST h=l=K yields no fractals', () => {
    const series = constBar(30, 10);
    const ch = computeLineFractalPivot(series, { fractalLookback: 2 });
    for (let i = 0; i < 30; i += 1) {
      expect(ch.upperFractal[i]).toBe(false);
      expect(ch.lowerFractal[i]).toBe(false);
    }
  });

  it('LINEAR UP yields no fractals', () => {
    const series = linearUp(30);
    const ch = computeLineFractalPivot(series);
    for (let i = 0; i < 30; i += 1) {
      expect(ch.upperFractal[i]).toBe(false);
      expect(ch.lowerFractal[i]).toBe(false);
    }
  });

  it('LINEAR DOWN yields no fractals', () => {
    const series = linearDown(30);
    const ch = computeLineFractalPivot(series);
    for (let i = 0; i < 30; i += 1) {
      expect(ch.upperFractal[i]).toBe(false);
      expect(ch.lowerFractal[i]).toBe(false);
    }
  });

  it('SAWTOOTH yields upper fractals at indices {2,6,10,...}', () => {
    const series = sawtooth(20, 5, 1);
    const ch = computeLineFractalPivot(series, { fractalLookback: 2 });
    // First peak at index 2 cannot confirm strict-max test because
    // neighbours i=0 (low=trough=1) and i=1 (low=mid=3) and i=3
    // (low=mid=3) and i=4 (low=trough=1) all < 5. So index 2 IS an
    // upper fractal.
    expect(ch.upperFractal[2]).toBe(true);
    expect(ch.upperFractal[6]).toBe(true);
    expect(ch.upperFractal[10]).toBe(true);
    expect(ch.upperFractal[14]).toBe(true);
  });

  it('SAWTOOTH yields lower fractals at indices {4,8,12,...}', () => {
    const series = sawtooth(20, 5, 1);
    const ch = computeLineFractalPivot(series, { fractalLookback: 2 });
    expect(ch.lowerFractal[4]).toBe(true);
    expect(ch.lowerFractal[8]).toBe(true);
    expect(ch.lowerFractal[12]).toBe(true);
    expect(ch.lowerFractal[16]).toBe(true);
  });

  it('output length matches input length', () => {
    const series = sawtooth(20, 5, 1);
    const ch = computeLineFractalPivot(series);
    expect(ch.upperFractal.length).toBe(20);
    expect(ch.lowerFractal.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = sawtooth(20, 5, 1);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineFractalPivot(series);
    expect(series).toEqual(snap);
  });
});

describe('classifyLineFractalPivotKind', () => {
  it('upper when isUpper is true', () => {
    expect(classifyLineFractalPivotKind(true, false)).toBe('upper');
  });

  it('lower when isLower is true', () => {
    expect(classifyLineFractalPivotKind(false, true)).toBe('lower');
  });

  it('none when neither', () => {
    expect(classifyLineFractalPivotKind(false, false)).toBe('none');
  });

  it('prefers upper if both', () => {
    expect(classifyLineFractalPivotKind(true, true)).toBe('upper');
  });
});

describe('runLineFractalPivot', () => {
  it('marks ok=false for too-short data', () => {
    const run = runLineFractalPivot(constBar(3, 10), {
      fractalLookback: 2,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineFractalPivot(constBar(5, 10), {
      fractalLookback: 2,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineFractalPivot(constBar(20, 10));
    expect(run.fractalLookback).toBe(
      DEFAULT_CHART_LINE_FRACTAL_PIVOT_FRACTAL_LOOKBACK,
    );
  });

  it('respects explicit options', () => {
    const run = runLineFractalPivot(constBar(20, 10), {
      fractalLookback: 3,
    });
    expect(run.fractalLookback).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineFractalPivotPoint[] = [
      { x: 2, high: 12, low: 10, close: 11 },
      { x: 0, high: 12, low: 10, close: 11 },
      { x: 1, high: 12, low: 10, close: 11 },
    ];
    const run = runLineFractalPivot(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('SAWTOOTH 20 bars yields 4 upper and 4 lower pivots', () => {
    const run = runLineFractalPivot(sawtooth(20, 5, 1));
    expect(run.upperPivotCount).toBe(4);
    expect(run.lowerPivotCount).toBe(4);
  });

  it('SAWTOOTH pivot kinds match indices', () => {
    const run = runLineFractalPivot(sawtooth(20, 5, 1));
    expect(run.samples[2]?.pivotKind).toBe('upper');
    expect(run.samples[4]?.pivotKind).toBe('lower');
    expect(run.samples[3]?.pivotKind).toBe('none');
  });

  it('pivotValue is high for upper pivots and low for lower pivots', () => {
    const run = runLineFractalPivot(sawtooth(20, 5, 1));
    expect(run.samples[2]?.pivotValue).toBe(5);
    expect(run.samples[4]?.pivotValue).toBe(1);
    expect(run.samples[3]?.pivotValue).toBe(null);
  });
});

describe('computeLineFractalPivotLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineFractalPivotLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineFractalPivotLayout({
      data: sawtooth(20, 5, 1),
    });
    expect(layout.ok).toBe(true);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineFractalPivotLayout({
      data: sawtooth(20, 5, 1),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('markers exist when fractals confirm', () => {
    const layout = computeLineFractalPivotLayout({
      data: sawtooth(20, 5, 1),
    });
    expect(layout.markers.length).toBeGreaterThan(0);
  });

  it('no markers for CONST data', () => {
    const layout = computeLineFractalPivotLayout({
      data: constBar(20, 10),
    });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLineFractalPivotChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineFractalPivotChart([])).toBe('No data');
  });

  it('mentions Fractal Pivot', () => {
    const desc = describeLineFractalPivotChart(sawtooth(20, 5, 1));
    expect(desc).toContain('Fractal Pivot');
  });

  it('reports parameters', () => {
    const desc = describeLineFractalPivotChart(sawtooth(20, 5, 1), {
      fractalLookback: 3,
    });
    expect(desc).toContain('fractalLookback 3');
  });
});

describe('<ChartLineFractalPivot />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineFractalPivot data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-pivot-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineFractalPivot data={sawtooth(20, 5, 1)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Fractal');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFractalPivot data={sawtooth(20, 5, 1)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        fractalLookback={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-pivot"]',
    );
    expect(root?.getAttribute('data-fractal-lookback')).toBe('3');
  });

  it('exposes total-points and pivot counts', () => {
    const { container } = render(
      <ChartLineFractalPivot data={sawtooth(20, 5, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-pivot"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
    expect(root?.getAttribute('data-upper-pivots')).toBe('4');
    expect(root?.getAttribute('data-lower-pivots')).toBe('4');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineFractalPivot data={sawtooth(20, 5, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-pivot-aria-desc"]',
      )?.textContent,
    ).toContain('Fractal Pivot');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineFractalPivot data={sawtooth(20, 5, 1)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="upper-pivots"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="lower-pivots"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="upper-pivots"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'upper-pivots',
      hidden: true,
    });
  });

  it('hides upper pivots when controlled hidden', () => {
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        hiddenSeries={['upper-pivots']}
      />,
    );
    const upperMarkers = container.querySelectorAll(
      '[data-section="chart-line-fractal-pivot-marker"][data-kind="upper"]',
    );
    expect(upperMarkers.length).toBe(0);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineFractalPivot data={sawtooth(20, 5, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-pivot-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-pivot-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-pivot-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-pivot-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-pivot"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-fractal-pivot-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders pivot markers', () => {
    const { container } = render(
      <ChartLineFractalPivot data={sawtooth(20, 5, 1)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-fractal-pivot-marker"]',
      ).length,
    ).toBe(8);
  });

  it('renders labels when showLabels=true', () => {
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        showLabels={true}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-fractal-pivot-label"]',
      ).length,
    ).toBe(8);
  });

  it('does not render labels when showLabels=false (default)', () => {
    const { container } = render(
      <ChartLineFractalPivot data={sawtooth(20, 5, 1)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-fractal-pivot-label"]',
      ).length,
    ).toBe(0);
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineFractalPivot data={sawtooth(20, 5, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-pivot-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineFractalPivot
        data={sawtooth(20, 5, 1)}
        defaultHiddenSeries={['upper-pivots']}
      />,
    );
    const upperMarkers = container.querySelectorAll(
      '[data-section="chart-line-fractal-pivot-marker"][data-kind="upper"]',
    );
    expect(upperMarkers.length).toBe(0);
  });
});

describe('Fractal Pivot integration', () => {
  it('CONST yields zero pivot counts across (K, lookback)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [1, 2, 3]) {
        const series = constBar(20, K);
        const run = runLineFractalPivot(series, {
          fractalLookback: L,
        });
        expect(run.upperPivotCount).toBe(0);
        expect(run.lowerPivotCount).toBe(0);
      }
    }
  });

  it('LINEAR yields zero pivot counts', () => {
    for (const dataFn of [linearUp, linearDown]) {
      for (const L of [1, 2, 3]) {
        const series = dataFn(20);
        const run = runLineFractalPivot(series, {
          fractalLookback: L,
        });
        expect(run.upperPivotCount).toBe(0);
        expect(run.lowerPivotCount).toBe(0);
      }
    }
  });

  it('SAWTOOTH pivot values match peakK and troughL bit-exact', () => {
    for (const peakK of [5, 10, 20]) {
      for (const troughL of [1, 2, -3]) {
        const series = sawtooth(20, peakK, troughL);
        const run = runLineFractalPivot(series);
        for (const s of run.samples) {
          if (s.pivotKind === 'upper') {
            expect(s.pivotValue).toBe(peakK);
          } else if (s.pivotKind === 'lower') {
            expect(s.pivotValue).toBe(troughL);
          }
        }
      }
    }
  });
});
