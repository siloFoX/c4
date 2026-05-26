import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDynamicMomentum,
  applyLineDynamicMomentumPopStdDev,
  applyLineDynamicMomentumSma,
  classifyLineDynamicMomentumZone,
  computeLineDynamicMomentum,
  computeLineDynamicMomentumLayout,
  describeLineDynamicMomentumChart,
  detectLineDynamicMomentumCrosses,
  getLineDynamicMomentumFinitePoints,
  normalizeLineDynamicMomentumPeriod,
  runLineDynamicMomentum,
  DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BASE_LENGTH,
} from './chart-line-dynamic-momentum';
import type { ChartLineDynamicMomentumPoint } from './chart-line-dynamic-momentum';

const constClose = (
  count: number,
  K: number,
): ChartLineDynamicMomentumPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

describe('getLineDynamicMomentumFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineDynamicMomentumFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineDynamicMomentumFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineDynamicMomentumFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineDynamicMomentumFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineDynamicMomentumFinitePoints([
      null as unknown as ChartLineDynamicMomentumPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineDynamicMomentumPeriod', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineDynamicMomentumPeriod(undefined, 14)).toBe(14);
  });

  it('floors fractional periods', () => {
    expect(normalizeLineDynamicMomentumPeriod(7.9, 14)).toBe(7);
  });

  it('accepts 1', () => {
    expect(normalizeLineDynamicMomentumPeriod(1, 14)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineDynamicMomentumPeriod(0, 14)).toBe(14);
  });

  it('rejects negative', () => {
    expect(normalizeLineDynamicMomentumPeriod(-1, 14)).toBe(14);
  });
});

describe('applyLineDynamicMomentumSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineDynamicMomentumSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup region is null', () => {
    const out = applyLineDynamicMomentumSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[2]).toBe(2);
  });
});

describe('applyLineDynamicMomentumPopStdDev', () => {
  it('CONST K stdDev is 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const out = applyLineDynamicMomentumPopStdDev(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('warmup region is null', () => {
    const out = applyLineDynamicMomentumPopStdDev([1, 2, 3], 3);
    expect(out[0]).toBe(null);
    expect(out[2]).not.toBe(null);
  });
});

describe('computeLineDynamicMomentum', () => {
  it('returns empty for null', () => {
    const ch = computeLineDynamicMomentum(null);
    expect(ch.dmi).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineDynamicMomentum([]);
    expect(ch.dmi).toEqual([]);
  });

  it('CONST close=K yields dmi = 0 at every valid bar (bit-exact)', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(40).fill(K);
      const ch = computeLineDynamicMomentum(closes);
      // Warmup ends around max(short+long-1, base+1) = max(14, 15) = 15.
      // dynLength = base = 14 (since ratio=1 fallback when longStd=0).
      // So dmi[i] should equal 0 starting at i = 14 (or after enough
      // history for dynLength).
      for (let i = 20; i < 40; i += 1) {
        expect(ch.dmi[i]).toBe(0);
      }
    }
  });

  it('CONST close=0 yields dmi = null (divide-by-zero guard)', () => {
    const closes = Array(40).fill(0);
    const ch = computeLineDynamicMomentum(closes);
    for (let i = 20; i < 40; i += 1) {
      expect(ch.dmi[i]).toBe(null);
    }
  });

  it('CONST close yields dynLength = baseLength (ratio fallback)', () => {
    const closes = Array(40).fill(10);
    const ch = computeLineDynamicMomentum(closes, {
      baseLength: 14,
      minLength: 5,
      maxLength: 30,
    });
    // Once both stdDev channels are defined, longStd = 0 so ratio
    // falls back to 1, dynLength = baseLength = 14.
    for (let i = 20; i < 40; i += 1) {
      expect(ch.dynLength[i]).toBe(14);
    }
  });

  it('dynLength is clamped at minLength', () => {
    // High ratio (volatile recent / calm avg) -> dynLength = round(14/ratio)
    // -> small. Clamp at minLength = 5.
    // Use a synthetic series: alternating closes so shortStd > longStd.
    const closes = Array.from({ length: 40 }, (_, i) =>
      i < 20 ? 10 : 10 + (i % 2) * 5,
    );
    const ch = computeLineDynamicMomentum(closes, {
      baseLength: 14,
      minLength: 5,
      maxLength: 30,
    });
    // Verify all defined dynLength values are within bounds.
    for (let i = 0; i < 40; i += 1) {
      const d = ch.dynLength[i];
      if (d !== null) {
        expect(d).toBeGreaterThanOrEqual(5);
        expect(d).toBeLessThanOrEqual(30);
      }
    }
  });

  it('output length matches input length', () => {
    const closes = Array(40).fill(10);
    const ch = computeLineDynamicMomentum(closes);
    expect(ch.dmi.length).toBe(40);
    expect(ch.shortStd.length).toBe(40);
    expect(ch.longStd.length).toBe(40);
    expect(ch.ratio.length).toBe(40);
    expect(ch.dynLength.length).toBe(40);
  });

  it('does not mutate input', () => {
    const closes = Array.from({ length: 40 }, (_, i) => i + 1);
    const snap = closes.slice();
    computeLineDynamicMomentum(closes);
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineDynamicMomentumZone', () => {
  it('classifies positive', () => {
    expect(classifyLineDynamicMomentumZone(2)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineDynamicMomentumZone(-2)).toBe('negative');
  });

  it('classifies zero', () => {
    expect(classifyLineDynamicMomentumZone(0)).toBe('zero');
  });

  it('returns none for null', () => {
    expect(classifyLineDynamicMomentumZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineDynamicMomentumZone(Number.NaN)).toBe('none');
  });
});

describe('detectLineDynamicMomentumCrosses', () => {
  it('returns [null, null] for warmup-only data', () => {
    expect(detectLineDynamicMomentumCrosses([null, null])).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when prev <= 0 and current > 0', () => {
    const ev = detectLineDynamicMomentumCrosses([null, -1, 1]);
    expect(ev[2]).toBe('up');
  });

  it('flags down when prev >= 0 and current < 0', () => {
    const ev = detectLineDynamicMomentumCrosses([null, 1, -1]);
    expect(ev[2]).toBe('down');
  });

  it('no cross when both positive', () => {
    const ev = detectLineDynamicMomentumCrosses([null, 1, 2]);
    expect(ev[2]).toBe(null);
  });

  it('first defined bar is not a cross', () => {
    const ev = detectLineDynamicMomentumCrosses([null, 1]);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineDynamicMomentum', () => {
  it('marks ok=false when data is too short', () => {
    const run = runLineDynamicMomentum(constClose(10, 10));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough bars', () => {
    const run = runLineDynamicMomentum(constClose(30, 10));
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineDynamicMomentum(constClose(40, 10));
    expect(run.baseLength).toBe(
      DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BASE_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLineDynamicMomentum(constClose(40, 10), {
      baseLength: 7,
      shortVolLength: 3,
      longVolLength: 5,
      minLength: 3,
      maxLength: 20,
    });
    expect(run.baseLength).toBe(7);
    expect(run.shortVolLength).toBe(3);
    expect(run.longVolLength).toBe(5);
    expect(run.minLength).toBe(3);
    expect(run.maxLength).toBe(20);
  });

  it('sorts by x', () => {
    const data: ChartLineDynamicMomentumPoint[] = [
      { x: 30, close: 10 },
      { x: 0, close: 10 },
      { x: 15, close: 10 },
    ];
    const run = runLineDynamicMomentum(data, {
      baseLength: 2,
      shortVolLength: 2,
      longVolLength: 2,
    });
    expect(run.samples.map((s) => s.x)).toEqual([0, 15, 30]);
  });

  it('CONST close classifies post-warmup as zero', () => {
    const run = runLineDynamicMomentum(constClose(40, 10));
    expect(run.zeroCount).toBeGreaterThan(0);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });
});

describe('computeLineDynamicMomentumLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineDynamicMomentumLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineDynamicMomentumLayout({
      data: constClose(40, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineDynamicMomentumLayout({
      data: constClose(40, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above dmi', () => {
    const layout = computeLineDynamicMomentumLayout({
      data: constClose(40, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.dmiTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineDynamicMomentumLayout({
      data: constClose(40, 10),
      panelGap: 24,
    });
    expect(layout.dmiTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineDynamicMomentumLayout({
      data: constClose(40, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('CONST yields zero markers', () => {
    const layout = computeLineDynamicMomentumLayout({
      data: constClose(40, 10),
    });
    expect(layout.markers.length).toBe(0);
  });

  it('y range always includes zero', () => {
    const layout = computeLineDynamicMomentumLayout({
      data: constClose(40, 10),
    });
    expect(layout.dmiMin).toBeLessThanOrEqual(0);
    expect(layout.dmiMax).toBeGreaterThanOrEqual(0);
  });

  it('zero line y is between dmiTop and dmiBottom', () => {
    const layout = computeLineDynamicMomentumLayout({
      data: constClose(40, 10),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.dmiTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.dmiBottom);
  });
});

describe('describeLineDynamicMomentumChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineDynamicMomentumChart([])).toBe('No data');
  });

  it('mentions Dynamic Momentum Index', () => {
    const desc = describeLineDynamicMomentumChart(constClose(40, 10));
    expect(desc).toContain('Dynamic Momentum Index');
  });

  it('reports the parameters', () => {
    const desc = describeLineDynamicMomentumChart(constClose(40, 10), {
      baseLength: 7,
      shortVolLength: 3,
      longVolLength: 5,
      minLength: 2,
      maxLength: 12,
    });
    expect(desc).toContain('baseLength 7');
    expect(desc).toContain('shortVolLength 3');
    expect(desc).toContain('longVolLength 5');
    expect(desc).toContain('minLength 2');
    expect(desc).toContain('maxLength 12');
  });
});

describe('<ChartLineDynamicMomentum />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineDynamicMomentum data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-dynamic-momentum-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Dynamic Momentum Index',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDynamicMomentum data={constClose(40, 10)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} baseLength={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dynamic-momentum"]',
    );
    expect(root?.getAttribute('data-base-length')).toBe('7');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dynamic-momentum"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('40');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-dynamic-momentum-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Dynamic Momentum Index');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="dmi"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDynamicMomentum
        data={constClose(40, 10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="dmi"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'dmi',
      hidden: true,
    });
  });

  it('hides dmi when controlled hidden', () => {
    const { container } = render(
      <ChartLineDynamicMomentum
        data={constClose(40, 10)}
        hiddenSeries={['dmi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineDynamicMomentum
        data={constClose(40, 10)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-badge"]',
      ),
    ).toBe(null);
  });

  it('renders the zero line by default', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineDynamicMomentum
        data={constClose(40, 10)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineDynamicMomentum
        data={constClose(40, 10)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineDynamicMomentum
        data={constClose(40, 10)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineDynamicMomentum
        data={constClose(40, 10)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineDynamicMomentum
        data={constClose(40, 10)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineDynamicMomentum
        data={constClose(40, 10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dynamic-momentum"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-dynamic-momentum-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the dmi line by default', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineDynamicMomentum data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dynamic-momentum-price-path"]',
      ),
    ).toBeTruthy();
  });
});

describe('Dynamic Momentum integration', () => {
  it('CONST close yields dmi = 0 across (K, params)', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(40).fill(K);
      const ch = computeLineDynamicMomentum(closes, {
        baseLength: 4,
        shortVolLength: 3,
        longVolLength: 4,
        minLength: 2,
        maxLength: 10,
      });
      for (let i = 10; i < 40; i += 1) {
        if (ch.dmi[i] !== null) {
          expect(ch.dmi[i]).toBe(0);
        }
      }
    }
  });
});
