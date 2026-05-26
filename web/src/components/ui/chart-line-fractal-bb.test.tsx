import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineFractalBb,
  classifyLineFractalBbZone,
  computeLineFractalBb,
  computeLineFractalBbLayout,
  describeLineFractalBbChart,
  detectLineFractalBbHighs,
  detectLineFractalBbLows,
  getLineFractalBbFinitePoints,
  normalizeLineFractalBbLength,
  normalizeLineFractalBbPivotRadius,
  runLineFractalBb,
} from './chart-line-fractal-bb';
import type { ChartLineFractalBbPoint } from './chart-line-fractal-bb';

const constBar = (
  count: number,
  K: number,
): ChartLineFractalBbPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

// Constructed fixture with known fractals:
// highs = [10, 11, 12, 11, 10, 8,  9,  13, 12, 11, 10]
// lows  = [9,  10, 11, 10, 9,  7,  8,  12, 11, 10, 9]
// At i=2: high=12 > 11, 11 -> fractal high (value 12).
// At i=7: high=13 > 9, 12 -> fractal high (value 13).
// At i=5: low=7  < 9, 8  -> fractal low (value 7).
const peakFixture = (): ChartLineFractalBbPoint[] => {
  const highs = [10, 11, 12, 11, 10, 8, 9, 13, 12, 11, 10];
  const lows = [9, 10, 11, 10, 9, 7, 8, 12, 11, 10, 9];
  return highs.map((h, i) => ({ x: i, high: h, low: lows[i]!, close: h }));
};

describe('getLineFractalBbFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineFractalBbFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const result = getLineFractalBbFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite low', () => {
    const result = getLineFractalBbFinitePoints([
      { x: 0, high: 10, low: Number.NaN, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineFractalBbFinitePoints([
      { x: 0, high: 10, low: 5, close: Number.NaN },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineFractalBbFinitePoints([
      null as unknown as ChartLineFractalBbPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineFractalBbLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineFractalBbLength(undefined, 20)).toBe(20);
  });

  it('floors fractional', () => {
    expect(normalizeLineFractalBbLength(7.9, 20)).toBe(7);
  });

  it('rejects below 3', () => {
    expect(normalizeLineFractalBbLength(2, 20)).toBe(20);
  });
});

describe('normalizeLineFractalBbPivotRadius', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineFractalBbPivotRadius(undefined, 1)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineFractalBbPivotRadius(0, 1)).toBe(1);
  });

  it('accepts 2', () => {
    expect(normalizeLineFractalBbPivotRadius(2, 1)).toBe(2);
  });
});

describe('detectLineFractalBbHighs', () => {
  it('CONST highs yields no fractals (strict inequality)', () => {
    const highs = Array(10).fill(5);
    const out = detectLineFractalBbHighs(highs, 1);
    for (let i = 0; i < 10; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('boundary bars are not fractals (no left/right neighbors)', () => {
    const highs = [12, 11, 10, 11, 12];
    const out = detectLineFractalBbHighs(highs, 1);
    // i=0 and i=4 lack one neighbor side -> null.
    expect(out[0]).toBe(null);
    expect(out[4]).toBe(null);
  });

  it('detects a strict local max at bar 2 in the peak fixture', () => {
    const highs = [10, 11, 12, 11, 10, 8, 9, 13, 12, 11, 10];
    const out = detectLineFractalBbHighs(highs, 1);
    expect(out[2]).toBe(12);
    expect(out[7]).toBe(13);
    // Other bars are not fractal highs.
    expect(out[3]).toBe(null);
    expect(out[5]).toBe(null);
  });

  it('pivotRadius=2 requires strict max over 2 neighbors each side', () => {
    const highs = [10, 11, 12, 13, 12, 11, 10];
    const out = detectLineFractalBbHighs(highs, 2);
    // bar 3 (value 13) > 11, 12 (left) and > 12, 11 (right) -> fractal.
    expect(out[3]).toBe(13);
  });
});

describe('detectLineFractalBbLows', () => {
  it('CONST lows yields no fractals', () => {
    const lows = Array(10).fill(5);
    const out = detectLineFractalBbLows(lows, 1);
    for (let i = 0; i < 10; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('detects a strict local min at bar 5 in the peak fixture', () => {
    const lows = [9, 10, 11, 10, 9, 7, 8, 12, 11, 10, 9];
    const out = detectLineFractalBbLows(lows, 1);
    expect(out[5]).toBe(7);
    expect(out[0]).toBe(null);
  });
});

describe('computeLineFractalBb', () => {
  it('returns empty for null', () => {
    const ch = computeLineFractalBb(null);
    expect(ch.upper).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineFractalBb([]);
    expect(ch.upper).toEqual([]);
  });

  it('CONST input -> band is null everywhere', () => {
    const series = constBar(30, 10);
    const ch = computeLineFractalBb(series, { length: 5, pivotRadius: 1 });
    for (let i = 0; i < 30; i += 1) {
      expect(ch.upper[i]).toBe(null);
      expect(ch.lower[i]).toBe(null);
      expect(ch.mean[i]).toBe(null);
    }
  });

  it('peak fixture: at bar 8 with length=5 -> upper=13, lower=7, mean=10', () => {
    const ch = computeLineFractalBb(peakFixture(), {
      length: 5,
      pivotRadius: 1,
    });
    // bar 8 window = [4, 7]: contains fractal high at bar 7 (13)
    // and fractal low at bar 5 (7).
    expect(ch.upper[8]).toBe(13);
    expect(ch.lower[8]).toBe(7);
    expect(ch.mean[8]).toBe(10);
  });

  it('peak fixture: at bar 6 with length=5 -> upper=12, lower=7, mean=9.5', () => {
    const ch = computeLineFractalBb(peakFixture(), {
      length: 5,
      pivotRadius: 1,
    });
    // bar 6 window = [2, 5]: fractal high bar 2 (12), fractal low bar 5 (7).
    expect(ch.upper[6]).toBe(12);
    expect(ch.lower[6]).toBe(7);
    expect(ch.mean[6]).toBe(9.5);
  });

  it('output length matches input length', () => {
    const series = constBar(30, 10);
    const ch = computeLineFractalBb(series, { length: 5 });
    expect(ch.upper.length).toBe(30);
    expect(ch.lower.length).toBe(30);
    expect(ch.mean.length).toBe(30);
  });

  it('does not mutate input', () => {
    const series = peakFixture();
    const snap = JSON.parse(JSON.stringify(series));
    computeLineFractalBb(series, { length: 5 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineFractalBbZone', () => {
  it('classifies above-upper when close > upper', () => {
    expect(classifyLineFractalBbZone(15, 12, 8, 10)).toBe('above-upper');
  });

  it('classifies below-lower when close < lower', () => {
    expect(classifyLineFractalBbZone(5, 12, 8, 10)).toBe('below-lower');
  });

  it('classifies at-mid when close == mean', () => {
    expect(classifyLineFractalBbZone(10, 12, 8, 10)).toBe('at-mid');
  });

  it('classifies in-band when between', () => {
    expect(classifyLineFractalBbZone(9, 12, 8, 10)).toBe('in-band');
  });

  it('returns none for null upper', () => {
    expect(classifyLineFractalBbZone(10, null, 8, 9)).toBe('none');
  });
});

describe('runLineFractalBb', () => {
  it('marks ok=false for short data', () => {
    const run = runLineFractalBb(constBar(3, 10), { length: 5 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineFractalBb(constBar(30, 10), { length: 5 });
    expect(run.ok).toBe(true);
  });

  it('uses default length and pivotRadius', () => {
    const run = runLineFractalBb(constBar(30, 10));
    expect(run.length).toBe(20);
    expect(run.pivotRadius).toBe(1);
  });

  it('respects explicit options', () => {
    const run = runLineFractalBb(constBar(30, 10), {
      length: 7,
      pivotRadius: 2,
    });
    expect(run.length).toBe(7);
    expect(run.pivotRadius).toBe(2);
  });

  it('sorts by x', () => {
    const data: ChartLineFractalBbPoint[] = [
      { x: 2, high: 12, low: 8, close: 10 },
      { x: 0, high: 12, low: 8, close: 10 },
      { x: 1, high: 12, low: 8, close: 10 },
    ];
    const run = runLineFractalBb(data, { length: 3 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields no fractals', () => {
    const run = runLineFractalBb(constBar(30, 10), { length: 5 });
    expect(run.fractalHighCount).toBe(0);
    expect(run.fractalLowCount).toBe(0);
    expect(run.noneCount).toBe(30);
  });

  it('peak fixture detects 2 fractal highs and 1 fractal low', () => {
    const run = runLineFractalBb(peakFixture(), {
      length: 5,
      pivotRadius: 1,
    });
    expect(run.fractalHighCount).toBe(2);
    expect(run.fractalLowCount).toBe(1);
  });
});

describe('computeLineFractalBbLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineFractalBbLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineFractalBbLayout({
      data: constBar(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineFractalBbLayout({
      data: constBar(30, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineFractalBbLayout({
      data: constBar(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('peak fixture produces fractal markers', () => {
    const layout = computeLineFractalBbLayout({
      data: peakFixture(),
      length: 5,
    });
    expect(layout.fractalMarkers.length).toBe(3);
    const highs = layout.fractalMarkers.filter((m) => m.kind === 'high');
    const lows = layout.fractalMarkers.filter((m) => m.kind === 'low');
    expect(highs.length).toBe(2);
    expect(lows.length).toBe(1);
  });

  it('y range covers close, upper, lower', () => {
    const layout = computeLineFractalBbLayout({
      data: peakFixture(),
      length: 5,
    });
    expect(layout.yMin).toBeLessThanOrEqual(7);
    expect(layout.yMax).toBeGreaterThanOrEqual(13);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineFractalBbLayout({
      data: [{ x: 0, high: 12, low: 8, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineFractalBbChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineFractalBbChart([])).toBe('No data');
  });

  it('mentions fractal-anchored', () => {
    const desc = describeLineFractalBbChart(constBar(30, 10));
    expect(desc).toContain('fractal-anchored');
  });

  it('reports parameters', () => {
    const desc = describeLineFractalBbChart(constBar(30, 10), {
      length: 7,
      pivotRadius: 2,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('pivotRadius 2');
  });
});

describe('<ChartLineFractalBb />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineFractalBb data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-fractal-bb-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineFractalBb data={peakFixture()} length={5} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Fractal Bollinger Band',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFractalBb data={peakFixture()} length={5} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-pivot-radius', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={7}
        pivotRadius={2}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-bb"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-pivot-radius')).toBe('2');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineFractalBb data={peakFixture()} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-bb"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('11');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineFractalBb data={peakFixture()} length={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-fractal-bb-aria-desc"]',
    );
    expect(desc?.textContent).toContain('fractal-anchored');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineFractalBb data={peakFixture()} length={5} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="bb"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="bb"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'bb',
      hidden: true,
    });
  });

  it('hides bb when controlled hidden', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        hiddenSeries={['bb']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-upper-path"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineFractalBb data={peakFixture()} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders fractal markers by default', () => {
    const { container } = render(
      <ChartLineFractalBb data={peakFixture()} length={5} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-fractal-bb-fractal-marker"]',
      ).length,
    ).toBe(3);
  });

  it('hides fractal markers when showFractalMarkers is false', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        showFractalMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-fractal-markers"]',
      ),
    ).toBe(null);
  });

  it('hides mean line when showMean is false', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        showMean={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-mean-path"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-bb"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-fractal-bb-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders upper and lower band paths by default', () => {
    const { container } = render(
      <ChartLineFractalBb data={peakFixture()} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-upper-path"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-lower-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineFractalBb data={peakFixture()} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineFractalBb
        data={peakFixture()}
        length={5}
        defaultHiddenSeries={['bb']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-bb-upper-path"]',
      ),
    ).toBe(null);
  });
});

describe('Fractal BB integration', () => {
  it('CONST input yields no fractals across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 5, 7, 10]) {
        const ch = computeLineFractalBb(constBar(L + 5, K), {
          length: L,
          pivotRadius: 1,
        });
        for (let i = 0; i < ch.upper.length; i += 1) {
          expect(ch.upper[i]).toBe(null);
          expect(ch.lower[i]).toBe(null);
          expect(ch.mean[i]).toBe(null);
        }
      }
    }
  });

  it('peak fixture: bar 8 upper=13, lower=7, mean=10 bit-exact', () => {
    const ch = computeLineFractalBb(peakFixture(), {
      length: 5,
      pivotRadius: 1,
    });
    expect(ch.upper[8]).toBe(13);
    expect(ch.lower[8]).toBe(7);
    expect(ch.mean[8]).toBe(10);
  });
});
